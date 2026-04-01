import { Router } from "express";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { requireAuth, requireJobSeeker, optionalAuth, AuthedRequest } from "../middleware/auth.js";
import { prisma } from "../config/prisma.js";
import { createAptitudeSession, getPracticeAptitudeQuestions } from "../data/aptitude-loader.js";
import { storeAptitudeSession, getAptitudeSession, clearAptitudeSession, updateAptitudeDraft } from "../data/aptitude-session-db.js";
import { rolesMatch } from "../data/interviewerRoles.js";
import { evaluateNonTechnicalAssignment } from "../services/ai.service.js";
import { buildTechnicalScorecard } from "../services/verificationScoring.service.js";
import { calculateCertificationLevel } from "../services/verificationLevel.service.js";
import { upsertSkillVerification, getSkillVerifications } from "../services/skillVerification.service.js";
import {
  DSA_API_LANGUAGES,
  DSA_PASS_THRESHOLD,
  DSA_PRACTICE_COUNT,
  DSA_QUESTIONS_COUNT,
  type DsaApiLanguage,
} from "../constants/dsa.js";
import { checkRateLimit } from "../middleware/dsaRateLimit.js";
import { evaluateDsaAgainstTestCases, persistDsaSubmission } from "../services/dsaEvaluation.js";
import { getHumanInterviewEligibility } from "../services/humanInterviewGate.service.js";
import { sendHumanInterviewSlotBookedEmail } from "../services/resend.js";
// Daily.co disabled for MVP - using Google Meet instead. Uncomment when budget allows.
// import { createDailyRoom, createMeetingToken, getRoomNameFromUrl } from "../services/daily.js";

export const verificationRouter = Router();

const technicalStages = ["profile_setup", "aptitude_test", "dsa_round", "expert_interview"];
const nonTechnicalStages = ["profile_setup", "non_tech_assignment", "human_expert_interview"];

function allowedVerificationStageNames(roleType: string): Set<string> {
  if (roleType === "non_technical") return new Set(nonTechnicalStages);
  return new Set([...technicalStages, "human_expert_interview"]);
}

function toStageResponse(rows: { stageName: string; status: string; score?: number | null }[]) {
  return rows.map((r) => ({
    stage_name: r.stageName,
    status: r.status,
    score: r.score ?? undefined,
  }));
}

/**
 * When aptitude is completed, the client should call stages/update to set dsa_round → in_progress.
 * If the user refreshes or skips "Continue to DSA", dsa_round can stay "locked" while the UI still
 * shows DSA as the next step (first "locked" after completed). Official DSA APIs require in_progress.
 * This reconciliation is NOT tied to integrity / proctoring feature flags.
 */
async function reconcileTechnicalVerificationStages(userId: string): Promise<void> {
  let rows = await prisma.verificationStage.findMany({ where: { userId } });
  const st = (name: string) => rows.find((r) => r.stageName === name)?.status;

  if (st("aptitude_test") === "completed" && st("dsa_round") === "locked") {
    await prisma.verificationStage.updateMany({
      where: { userId, stageName: "dsa_round" },
      data: { status: "in_progress" },
    });
    rows = await prisma.verificationStage.findMany({ where: { userId } });
  }

  const st2 = (name: string) => rows.find((r) => r.stageName === name)?.status;
  if (st2("dsa_round") === "completed" && st2("expert_interview") === "locked") {
    await prisma.verificationStage.updateMany({
      where: { userId, stageName: "expert_interview" },
      data: { status: "in_progress" },
    });
  }
}

/** Ensure DSA round is in_progress when aptitude is done but stage row was never advanced (same as reconcile). */
async function ensureDsaRoundActiveForOfficialApis(userId: string): Promise<boolean> {
  const already = await prisma.verificationStage.findFirst({
    where: { userId, stageName: "dsa_round", status: "in_progress" },
  });
  if (already) return true;

  const apt = await prisma.verificationStage.findFirst({
    where: { userId, stageName: "aptitude_test", status: "completed" },
  });
  const dsa = await prisma.verificationStage.findFirst({
    where: { userId, stageName: "dsa_round" },
  });
  if (apt && dsa?.status === "locked") {
    await prisma.verificationStage.updateMany({
      where: { userId, stageName: "dsa_round" },
      data: { status: "in_progress" },
    });
    return true;
  }
  return false;
}

verificationRouter.get("/stages", requireAuth, requireJobSeeker, async (req: AuthedRequest, res) => {
  try {
    const profile = await prisma.jobSeekerProfile.findUnique({ where: { userId: req.user!.id } });
    const roleType = (profile?.roleType as string) || "technical";
    const stagesForPath = roleType === "non_technical" ? nonTechnicalStages : technicalStages;

    const existing = await prisma.verificationStage.findMany({ where: { userId: req.user!.id } });
    if (existing.length === 0) {
      await prisma.verificationStage.createMany({
        data: stagesForPath.map((stage, index) => ({
          userId: req.user!.id,
          stageName: stage,
          status: index === 0 ? "in_progress" : "locked",
        })),
        skipDuplicates: true,
      });
    }
    if (roleType !== "non_technical") {
      await reconcileTechnicalVerificationStages(req.user!.id);
    }
    const [stages, certification] = await Promise.all([
      prisma.verificationStage.findMany({ where: { userId: req.user!.id } }),
      calculateCertificationLevel(req.user!.id),
    ]);
    return res.json({
      stages: toStageResponse(stages),
      roleType,
      certification_level: certification.level,
      certification_label: certification.label,
    });
  } catch (e) {
    console.error("[verification/stages]", e);
    return res.status(500).json({ error: e instanceof Error ? e.message : "Failed to load stages" });
  }
});

/** GET /api/verification/skills - Skill validity status (aptitude, live_coding, interview) */
verificationRouter.get("/skills", requireAuth, requireJobSeeker, async (req: AuthedRequest, res) => {
  try {
    const profile = await prisma.jobSeekerProfile.findUnique({ where: { userId: req.user!.id } });
    if ((profile?.roleType ?? "technical") !== "technical") {
      return res.json({ aptitude: null, live_coding: null, interview: null });
    }
    const skills = await getSkillVerifications(req.user!.id);
    return res.json(skills);
  } catch (e) {
    console.error("[verification/skills]", e);
    return res.status(500).json({ error: e instanceof Error ? e.message : "Failed to load skills" });
  }
});

verificationRouter.post("/stages/update", requireAuth, requireJobSeeker, async (req: AuthedRequest, res) => {
  const schema = z.object({ stageName: z.string(), status: z.string(), score: z.number().optional() });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid payload" });
  const { stageName, status } = parsed.data;
  const userId = req.user!.id;

  const profile = await prisma.jobSeekerProfile.findUnique({ where: { userId } });
  const roleType = (profile?.roleType as string) || "technical";
  const allowed = allowedVerificationStageNames(roleType);
  if (!allowed.has(stageName)) {
    return res.status(400).json({ error: "Invalid stage for your verification path" });
  }

  const existing = await prisma.verificationStage.findFirst({
    where: { userId, stageName },
  });

  if (!existing && stageName === "human_expert_interview") {
    const elig = await getHumanInterviewEligibility(userId);
    if (elig.block_human_interview_section || !elig.can_access_slots) {
      return res.status(403).json({ error: "Human expert interview is not available yet." });
    }
    await prisma.verificationStage.upsert({
      where: { userId_stageName: { userId, stageName } },
      create: { userId, stageName, status: "in_progress", score: null },
      update: { status: "in_progress" },
    });
    return res.json({ updated: 1 });
  }

  if (!existing) {
    return res.status(404).json({ error: "Unknown verification stage" });
  }

  if (stageName === "human_expert_interview" && (status === "completed" || status === "failed")) {
    return res.status(403).json({
      error: "This stage is finalized only when your expert interviewer submits your evaluation.",
    });
  }

  const updateData: { status: string; score?: number | null } = { status };

  if (stageName === "aptitude_test" && (status === "completed" || status === "failed")) {
    const row = await prisma.aptitudeTestResult.findFirst({
      where: { userId },
      orderBy: { completedAt: "desc" },
    });
    if (!row) return res.status(400).json({ error: "No aptitude attempt on record." });
    const built = buildAptitudeLatestResult(row);
    const passed = built.percentage >= 60;
    if (status === "completed" && !passed) {
      return res.status(400).json({ error: "Aptitude pass is required to mark this step complete." });
    }
    if (status === "failed" && passed) {
      return res.status(400).json({ error: "Your latest attempt passed; you cannot mark this step as failed." });
    }
    updateData.score = built.percentage;
  } else if (stageName === "dsa_round" && (status === "completed" || status === "failed")) {
    const row = await prisma.dsaRoundResult.findFirst({
      where: { userId },
      orderBy: { completedAt: "desc" },
    });
    if (!row || row.score == null) {
      return res.status(400).json({ error: "Finish and submit the DSA round first." });
    }
    const s = Math.round(row.score);
    if (status === "completed" && s < DSA_PASS_THRESHOLD) {
      return res.status(400).json({ error: `Minimum score ${DSA_PASS_THRESHOLD} required to complete this step.` });
    }
    if (status === "failed" && s >= DSA_PASS_THRESHOLD) {
      return res.status(400).json({ error: "Your latest DSA score passes; use Continue instead of failing." });
    }
    updateData.score = s;
  } else if (stageName === "expert_interview" && status === "completed") {
    const interview = await prisma.interview.findFirst({
      where: { userId, status: "completed" },
      orderBy: { completedAt: "desc" },
    });
    if (!interview) {
      return res.status(400).json({ error: "Finish the AI interview before marking this step complete." });
    }
    updateData.score = interview.totalScore != null ? Math.round(interview.totalScore) : null;
  } else if (stageName === "non_tech_assignment" && status === "completed") {
    if (existing.status !== "completed") {
      return res.status(400).json({ error: "Submit the assignment through the official flow first." });
    }
    updateData.score = existing.score ?? null;
  } else if (stageName === "non_tech_assignment" && status === "failed") {
    if (existing.status === "failed") {
      updateData.score = existing.score ?? null;
    } else if (existing.status === "in_progress") {
      // Proctoring can fail the step before any written submission is graded.
      updateData.score = 0;
    } else {
      return res.status(400).json({ error: "Invalid assignment stage transition." });
    }
  }

  const updated = await prisma.verificationStage.updateMany({
    where: { userId, stageName },
    data: updateData,
  });

  // PRD: After Stage 4 pass (without Stage 5), status should be verified.
  if (stageName === "expert_interview" && status === "completed") {
    const prof = await prisma.jobSeekerProfile.findUnique({
      where: { userId },
      select: { verificationStatus: true },
    });
    if (prof && prof.verificationStatus !== "expert_verified") {
      await prisma.jobSeekerProfile.updateMany({
        where: { userId },
        data: { verificationStatus: "verified" },
      });
    }
  }
  res.json({ updated: updated.count });
});

verificationRouter.post("/stages/bulk", requireAuth, requireJobSeeker, async (req: AuthedRequest, res) => {
  try {
    const existingCount = await prisma.verificationStage.count({ where: { userId: req.user!.id } });
    if (existingCount > 0) {
      return res.status(400).json({ error: "Verification stages already exist. Use GET /api/verification/stages." });
    }
    const profile = await prisma.jobSeekerProfile.findUnique({ where: { userId: req.user!.id } });
    const roleType = (profile?.roleType as string) || "technical";
    const stagesForPath = roleType === "non_technical" ? nonTechnicalStages : technicalStages;
    await prisma.verificationStage.createMany({
      data: stagesForPath.map((stage, index) => ({
        userId: req.user!.id,
        stageName: stage,
        status: index === 0 ? "in_progress" : "locked",
      })),
      skipDuplicates: true,
    });
    return res.json({ ok: true });
  } catch (e) {
    console.error("[verification/stages/bulk]", e);
    return res.status(500).json({ error: e instanceof Error ? e.message : "Failed to create stages" });
  }
});

verificationRouter.post("/stages/reset", requireAuth, requireJobSeeker, async (req: AuthedRequest, res) => {
  const schema = z.object({ stageName: z.string() });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid payload" });
  const profile = await prisma.jobSeekerProfile.findUnique({ where: { userId: req.user!.id } });
  const roleType = (profile?.roleType as string) || "technical";
  const stageOrder = roleType === "non_technical" ? nonTechnicalStages : [...technicalStages, "human_expert_interview"];
  const currentIndex = stageOrder.indexOf(parsed.data.stageName);
  if (currentIndex < 0) return res.status(400).json({ error: "Invalid stage for this path" });
  if (parsed.data.stageName === "aptitude_test") {
    await clearAptitudeSession(req.user!.id);
  }
  if (parsed.data.stageName === "dsa_round") {
    const uid = req.user!.id;
    await prisma.dsaSubmission.deleteMany({ where: { userId: uid } });
    await prisma.dsaRoundResult.deleteMany({ where: { userId: uid } });
  }
  await Promise.all(
    stageOrder.slice(currentIndex).map((stage, i) => {
      const status = i === 0 ? "in_progress" : "locked";
      return prisma.verificationStage.updateMany({
        where: { userId: req.user!.id, stageName: stage },
        data: { status, score: null },
      });
    })
  );
  res.json({ ok: true });
});

/** GET aptitude questions (100 marks total, 20 min). easy=1, medium=2, hard=2. Pass: 60/100. */
verificationRouter.get("/aptitude/questions", requireAuth, requireJobSeeker, async (req: AuthedRequest, res) => {
  try {
    // Allow retry anytime — no expiry block. Users can re-attempt whenever they want.
    const profile = await prisma.jobSeekerProfile.findUnique({ where: { userId: req.user!.id } });
    const experienceYears = profile?.experienceYears ?? 0;
    const existing = await getAptitudeSession(req.user!.id);
    if (existing?.questions && existing?.answerKey && existing?.marksKey) {
      const questions = existing.questions as any[];
      const totalMarks =
        existing.marksKey && typeof existing.marksKey === "object"
          ? Object.values(existing.marksKey as Record<string, number>).reduce((a, b) => a + (Number(b) || 0), 0)
          : questions.length;
      const passThreshold = Math.ceil(totalMarks * 0.6);
      return res.json({
        questions,
        timeLimitMinutes: 30,
        totalMarks,
        passThreshold,
        draft: existing.draft ?? null,
      });
    }

    const { questions, answerKey, marksKey, totalMarks, passThreshold } = createAptitudeSession(experienceYears);
    await storeAptitudeSession(req.user!.id, questions, answerKey, marksKey);
    return res.json({
      questions,
      timeLimitMinutes: 30, // 30 minutes total
      totalMarks,
      passThreshold,
      draft: null,
    });
  } catch (e) {
    console.error("[verification/aptitude/questions]", e);
    return res.status(500).json({ error: "Failed to load aptitude questions" });
  }
});

verificationRouter.post("/aptitude/draft", requireAuth, requireJobSeeker, async (req: AuthedRequest, res) => {
  try {
    const schema = z.object({
      answers: z.record(z.string(), z.string()).optional(),
      reviewed: z.array(z.string()).optional(),
      visited: z.array(z.string()).optional(),
      currentIndex: z.number().int().nonnegative().optional(),
      secondsRemaining: z.number().int().nonnegative().optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid payload" });
    await updateAptitudeDraft(req.user!.id, parsed.data);
    return res.json({ ok: true });
  } catch (e) {
    console.error("[verification/aptitude/draft]", e);
    return res.status(500).json({ error: "Failed to save progress" });
  }
});

/** GET 2-3 practice aptitude questions (no session, no scoring). Public - no auth required. */
verificationRouter.get("/aptitude/practice", async (_req, res) => {
  try {
    const questions = getPracticeAptitudeQuestions();
    return res.json({ questions });
  } catch (e) {
    console.error("[verification/aptitude/practice]", e);
    return res.status(500).json({ error: "Failed to load practice questions" });
  }
});

verificationRouter.post("/aptitude", requireAuth, requireJobSeeker, async (req: AuthedRequest, res) => {
  try {
    const schema = z.object({
      score: z.number().optional(),
      answers: z.record(z.string(), z.string()).optional(), // { questionId: selectedOption }
      meta: z
        .object({
          timeTakenSeconds: z.number().nonnegative().optional(),
          timeLimitSeconds: z.number().positive().optional(),
        })
        .optional(),
      invalidated: z.boolean().optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid payload" });

    let score: number;
    let answersPayload: Record<string, unknown> | null = null;

    if (parsed.data.invalidated) {
      score = 0;
      answersPayload = { reason: "invalidated" };
    } else if (
      parsed.data.answers &&
      typeof parsed.data.answers === "object" &&
      !Array.isArray(parsed.data.answers)
    ) {
      const session = await getAptitudeSession(req.user!.id);
      const answerKey = session?.answerKey ?? null;
      const marksKey = session?.marksKey ?? null;
      if (!answerKey || typeof answerKey !== "object" || Object.keys(answerKey).length === 0) {
        return res.status(400).json({
          error: "Your test session has expired. Please click 'Retry This Step' above, then 'Start Aptitude Test' to begin a fresh attempt.",
        });
      }
      const APTITUDE_LIMIT_SEC = 30 * 60;
      const GRACE_SEC = 120;
      const startedAt = session?.testStartedAt;
      if (startedAt) {
        const elapsedSec = (Date.now() - startedAt.getTime()) / 1000;
        if (elapsedSec > APTITUDE_LIMIT_SEC + GRACE_SEC) {
          return res.status(400).json({
            error: "The aptitude time limit has expired. Use Retry This Step to start a new attempt.",
          });
        }
      }
      let earnedMarks = 0;
      let correctCount = 0;
      let attemptedCount = 0;
      const answersIncoming = parsed.data.answers as Record<string, string>;
      const allQuestionIds = Object.keys(answerKey);
      for (const qId of allQuestionIds) {
        const selectedRaw = answersIncoming[qId];
        const selected = typeof selectedRaw === "string" ? selectedRaw : "";
        if (selected.trim().length === 0) continue;
        attemptedCount++;
        const expected = answerKey[qId];
        const qMarks = marksKey?.[qId] ?? 1;
        if (expected != null && normalizeAnswer(selected) === normalizeAnswer(expected)) {
          earnedMarks += qMarks;
          correctCount++;
        }
      }
      score = earnedMarks; // Raw earned marks (total varies 25–35 by experience). Pass threshold 60%.
      const totalMarksVal = marksKey ? Object.values(marksKey).reduce((a, b) => a + b, 0) : Object.keys(answerKey).length;
      const totalQuestions = allQuestionIds.length;
      const skippedCount = Math.max(0, totalQuestions - attemptedCount);
      const incorrectCount = Math.max(0, attemptedCount - correctCount);
      answersPayload = {
        questions: totalQuestions,
        correct: correctCount,
        incorrect: incorrectCount,
        skipped: skippedCount,
        earnedMarks,
        totalMarks: totalMarksVal,
        ...(parsed.data.meta?.timeTakenSeconds != null ? { timeTakenSeconds: parsed.data.meta.timeTakenSeconds } : {}),
        ...(parsed.data.meta?.timeLimitSeconds != null ? { timeLimitSeconds: parsed.data.meta.timeLimitSeconds } : {}),
      };
      await clearAptitudeSession(req.user!.id);
    } else {
      return res.status(400).json({ error: "Submit answers from the test session, or use the invalidation flag when required." });
    }

    const answersToStore = answersPayload ?? (parsed.data.answers && typeof parsed.data.answers === "object" ? parsed.data.answers : undefined);
    const completedAt = new Date();
    const result = await prisma.aptitudeTestResult.create({
      data: {
        userId: req.user!.id,
        score,
        ...(answersToStore !== undefined ? { answers: answersToStore as object } : {}),
        invalidated: Boolean(parsed.data.invalidated),
      },
    });
    // Store 0–100 percentage in VerificationStage and CandidateSkillVerification for consistent display with DSA/AI
    const totalMarksForPct = answersToStore && typeof (answersToStore as { totalMarks?: number }).totalMarks === "number"
      ? (answersToStore as { totalMarks: number }).totalMarks
      : 0;
    const scoreToStore = totalMarksForPct > 0
      ? Math.round((score / totalMarksForPct) * 100)
      : Math.min(100, Math.max(0, Math.round(score)));
    const existingStage = await prisma.verificationStage.findFirst({
      where: { userId: req.user!.id, stageName: "aptitude_test" },
    });
    if (existingStage) {
      await prisma.verificationStage.update({
        where: { id: existingStage.id },
        data: { score: scoreToStore },
      });
    }
    await upsertSkillVerification(req.user!.id, "APTITUDE", scoreToStore, completedAt);
    const breakdown =
      answersPayload && typeof answersPayload === "object"
        ? {
            totalQuestions: Number((answersPayload as any).questions ?? 0),
            correct: Number((answersPayload as any).correct ?? 0),
            incorrect: Number((answersPayload as any).incorrect ?? 0),
            skipped: Number((answersPayload as any).skipped ?? 0),
            earnedMarks: Number((answersPayload as any).earnedMarks ?? score ?? 0),
            totalMarks: Number((answersPayload as any).totalMarks ?? 0),
          }
        : null;
    return res.json({ result, score, breakdown });
  } catch (err) {
    const code = err && typeof err === "object" && "code" in err ? (err as { code: string }).code : null;
    const isDb = code === "P1001" || code === "P1002" || code === "P2021" || code === "P2003";
    console.error("[verification/aptitude]", err);
    if (isDb) {
      const hint =
        process.env.NODE_ENV !== "production"
          ? " If running locally, ensure PostgreSQL is running and run: cd server && npx prisma migrate deploy"
          : "";
      return res.status(503).json({
        error: `Database temporarily unavailable. Please try again in a moment.${hint}`,
      });
    }
    return res.status(500).json({ error: "Failed to submit aptitude test. Please try again." });
  }
});

function normalizeAnswer(s: string): string {
  return (s || "").toString().trim().toLowerCase();
}

type AptitudeAnswersJson = {
  totalMarks?: number;
  earnedMarks?: number;
  correct?: number;
  questions?: number;
};

/**
 * AptitudeTestResult.score is normally **raw earned marks**; answers.totalMarks / earnedMarks come from POST /aptitude.
 * Legacy rows (e.g. test seed) stored **0–100 percent** in score with empty answers — do not divide that by 25.
 */
function buildAptitudeLatestResult(row: { score: number | null; answers: unknown }): {
  total_score: number;
  total_marks: number;
  percentage: number;
  score: number;
} {
  const answers = (row.answers ?? null) as AptitudeAnswersJson | null;
  const totalFromAnswers =
    typeof answers?.totalMarks === "number" && answers.totalMarks > 0 ? answers.totalMarks : null;
  const earnedFromAnswers = typeof answers?.earnedMarks === "number" ? answers.earnedMarks : null;
  const stored = row.score ?? 0;

  if (totalFromAnswers != null) {
    const earned = earnedFromAnswers != null ? earnedFromAnswers : stored;
    const percentage = Math.min(100, Math.max(0, Math.round((earned / totalFromAnswers) * 100)));
    return {
      total_score: earned,
      total_marks: totalFromAnswers,
      percentage,
      score: earned,
    };
  }

  // No totalMarks on record: treat stored score as 0–100 (synthetic / legacy percent rows)
  const percentage = Math.min(100, Math.max(0, Math.round(stored)));
  return {
    total_score: percentage,
    total_marks: 100,
    percentage,
    score: percentage,
  };
}

verificationRouter.get("/aptitude/latest", requireAuth, requireJobSeeker, async (req: AuthedRequest, res) => {
  const row = await prisma.aptitudeTestResult.findFirst({
    where: { userId: req.user!.id },
    orderBy: { completedAt: "desc" },
  });
  const result = row ? buildAptitudeLatestResult(row) : null;
  res.json({ result });
});

// ---------------------------------------------------------------------------
// DSA questions + test runner API (backend-side, no test cases on the client)
// ---------------------------------------------------------------------------

// DSA role/experience difficulty distribution (mirrors src/data/dsaRoleDifficulty.ts)
type DSARoleCategory = "developer" | "infrastructure" | "data" | "analytics" | "unknown";

const ROLE_CATEGORIES: Record<DSARoleCategory, string[]> = {
  developer: ["frontend", "backend", "full stack", "fullstack", "software engineer", "sde", "system engineer", "platform engineer", "mobile", "qa"],
  infrastructure: ["devops", "docker", "cloud engineer", "sre", "site reliability", "platform engineer"],
  data: ["data scientist", "data engineer", "ml engineer", "machine learning", "ai engineer", "data "],
  analytics: ["data analyst", "business analyst", "product analyst", "marketing analyst"],
  unknown: [],
};

const ROLE_DISTRIBUTION: Record<DSARoleCategory, { easy: number; medium: number; hard: number } | null> = {
  developer: { easy: 20, medium: 50, hard: 30 },
  infrastructure: { easy: 50, medium: 40, hard: 10 },
  data: { easy: 80, medium: 20, hard: 0 },
  analytics: null,
  unknown: { easy: 40, medium: 40, hard: 20 },
};

const EXPERIENCE_DISTRIBUTION: Record<string, { easy: number; medium: number; hard: number }> = {
  "0-1": { easy: 70, medium: 30, hard: 0 },
  "1-3": { easy: 40, medium: 50, hard: 10 },
  "3-5": { easy: 20, medium: 50, hard: 30 },
  "5+": { easy: 10, medium: 40, hard: 50 },
};

function getRoleCategory(jobTitle: string | null | undefined): DSARoleCategory {
  if (!jobTitle?.trim()) return "unknown";
  const t = jobTitle.toLowerCase();
  for (const [cat, keywords] of Object.entries(ROLE_CATEGORIES)) {
    if (cat === "unknown") continue;
    if (keywords.some((k) => t.includes(k))) return cat as DSARoleCategory;
  }
  return "unknown";
}

function getExperienceBucket(years: number): keyof typeof EXPERIENCE_DISTRIBUTION {
  if (years < 1) return "0-1";
  if (years <= 3) return "1-3";
  if (years <= 5) return "3-5";
  return "5+";
}

function getCombinedDistribution(jobTitle: string | null | undefined, experienceYears: number): {
  easy: number;
  medium: number;
  hard: number;
} | null {
  const category = getRoleCategory(jobTitle);
  if (category === "analytics") return null;
  const roleDist = ROLE_DISTRIBUTION[category] ?? ROLE_DISTRIBUTION.unknown;
  if (!roleDist) return null;
  const expBucket = getExperienceBucket(experienceYears);
  const expDist = EXPERIENCE_DISTRIBUTION[expBucket];
  if (!expDist) return roleDist;
  const blend = (a: number, b: number) => Math.round(a * 0.6 + b * 0.4);
  return { easy: blend(roleDist.easy, expDist.easy), medium: blend(roleDist.medium, expDist.medium), hard: blend(roleDist.hard, expDist.hard) };
}

/** Aggregate 0–100 score from latest official submission per question (Judge0 results). */
async function computeOfficialDsaRoundScoreFromDb(userId: string): Promise<number | null> {
  const subs = await prisma.dsaSubmission.findMany({
    where: { userId, isOfficial: true },
    orderBy: { submittedAt: "desc" },
    select: { questionId: true, passedCount: true, totalCount: true },
  });
  if (subs.length === 0) return null;
  const byQ = new Map<string, { passed: number; total: number }>();
  for (const s of subs) {
    if (!byQ.has(s.questionId)) {
      byQ.set(s.questionId, { passed: s.passedCount, total: s.totalCount });
    }
  }
  if (byQ.size === 0) return null;
  let sum = 0;
  for (const { passed, total } of byQ.values()) {
    if (total <= 0) continue;
    sum += Math.round((passed / total) * 100);
  }
  return Math.round(sum / byQ.size);
}

verificationRouter.post("/dsa", requireAuth, requireJobSeeker, async (req: AuthedRequest, res) => {
  const schema = z.object({
    score: z.number().optional(),
    answers: z.any().optional(),
    invalidated: z.boolean().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid payload" });
  const userId = req.user!.id;

  const profile = await prisma.jobSeekerProfile.findUnique({
    where: { userId },
    select: { targetJobTitle: true, experienceYears: true, roleType: true },
  });
  if ((profile?.roleType ?? "technical") !== "technical") {
    return res.status(400).json({ error: "DSA applies only to the technical verification path." });
  }

  let dsaScore: number | null = null;
  let answersPayload: unknown =
    parsed.data.answers === undefined ? null : parsed.data.answers;

  if (parsed.data.invalidated) {
    dsaScore = 0;
    answersPayload = { reason: "invalidated" };
  } else {
    const dist = getCombinedDistribution(profile?.targetJobTitle ?? null, profile?.experienceYears ?? 0);
    const isWaiver = dist === null;

    const official = await prisma.dsaSubmission.findMany({
      where: { userId, isOfficial: true },
      select: { questionId: true },
    });

    if (isWaiver) {
      if (official.length > 0) {
        return res.status(400).json({ error: "DSA waiver is not valid when coding submissions exist." });
      }
      const apt = await prisma.verificationStage.findFirst({
        where: { userId, stageName: "aptitude_test", status: "completed" },
      });
      if (!apt) {
        return res.status(400).json({ error: "Complete the aptitude step before continuing." });
      }
      dsaScore = 100;
      answersPayload = { waiver: true, reason: "analytics_role" };
    } else {
      const computed = await computeOfficialDsaRoundScoreFromDb(userId);
      if (computed == null) {
        return res.status(400).json({ error: "No official submissions found. Submit every problem before finishing the round." });
      }
      const distinct = new Set(official.map((o) => o.questionId));
      if (distinct.size < DSA_QUESTIONS_COUNT) {
        return res.status(400).json({
          error: `Submit official solutions for all ${DSA_QUESTIONS_COUNT} problems before finishing the round.`,
        });
      }
      dsaScore = computed;
    }
  }

  const result = await prisma.dsaRoundResult.create({
    data: {
      userId,
      score: dsaScore,
      answers: answersPayload === null ? undefined : (answersPayload as object),
      invalidated: Boolean(parsed.data.invalidated),
    },
  });

  const existingStage = await prisma.verificationStage.findFirst({
    where: { userId, stageName: "dsa_round" },
  });
  const roundedScore = dsaScore != null ? Math.round(dsaScore) : null;
  if (existingStage && roundedScore != null) {
    await prisma.verificationStage.update({
      where: { id: existingStage.id },
      data: { score: roundedScore },
    });
  } else if (!existingStage && roundedScore != null) {
    await prisma.verificationStage.upsert({
      where: { userId_stageName: { userId, stageName: "dsa_round" } },
      create: { userId, stageName: "dsa_round", status: "in_progress", score: roundedScore },
      update: { score: roundedScore },
    });
  }

  if (dsaScore != null) {
    await upsertSkillVerification(userId, "LIVE_CODING", Math.round(dsaScore), new Date());
  }

  res.json({ result, score: dsaScore });
});

verificationRouter.get("/dsa/latest", requireAuth, requireJobSeeker, async (req: AuthedRequest, res) => {
  const row = await prisma.dsaRoundResult.findFirst({
    where: { userId: req.user!.id },
    orderBy: { completedAt: "desc" },
  });
  const score = row?.score ?? 0;
  const totalProblems = DSA_QUESTIONS_COUNT;
  const result = row
    ? {
        total_score: score,
        problems_solved: Math.min(totalProblems, Math.max(0, Math.round((score / 100) * totalProblems))),
        total_problems: totalProblems,
      }
    : null;
  res.json({ result });
});

function distributionToCounts(
  dist: { easy: number; medium: number; hard: number },
  total: number
): { easy: number; medium: number; hard: number } {
  const sum = dist.easy + dist.medium + dist.hard;
  if (sum <= 0) return { easy: total, medium: 0, hard: 0 };
  return {
    easy: Math.max(0, Math.round((dist.easy / sum) * total)),
    medium: Math.max(0, Math.round((dist.medium / sum) * total)),
    hard: Math.max(0, Math.round((dist.hard / sum) * total)),
  };
}

function generateDSATestByRoleAndExperience(
  targetJobTitle: string | null | undefined,
  experienceYears: number,
  pool: Array<{ difficulty: string }>,
  count: number
): Array<{ difficulty: string }> {
  const dist = getCombinedDistribution(targetJobTitle, experienceYears);
  if (!dist) return [];

  const byDiff = (d: "Easy" | "Medium" | "Hard") =>
    pool.filter((q) => q.difficulty === d).sort(() => Math.random() - 0.5);

  const counts = distributionToCounts(dist, count);
  const questions: Array<{ difficulty: string }> = [];
  questions.push(...byDiff("Easy").slice(0, counts.easy));
  questions.push(...byDiff("Medium").slice(0, counts.medium));
  questions.push(...byDiff("Hard").slice(0, counts.hard));
  return questions.sort(() => Math.random() - 0.5).slice(0, count);
}

/** Bank-seeded rows used placeholder copy; replace with first public test case for display. */
const DSA_EXAMPLE_PLACEHOLDER_SNIPPET = "refer to the problem description";

function dsaExamplesLookPlaceholder(examples: unknown): boolean {
  if (!Array.isArray(examples) || examples.length === 0) return true;
  const first = examples[0] as { input?: unknown; output?: unknown };
  const inStr = String(first?.input ?? "").toLowerCase();
  const outStr = String(first?.output ?? "").toLowerCase();
  return (
    inStr.includes(DSA_EXAMPLE_PLACEHOLDER_SNIPPET) || outStr.includes(DSA_EXAMPLE_PLACEHOLDER_SNIPPET)
  );
}

function dsaMergeExamplesWithSample(
  examples: unknown,
  sample: { input: string; expected: string } | undefined
): unknown {
  if (!sample || !dsaExamplesLookPlaceholder(examples)) return examples;
  return [{ input: sample.input, output: sample.expected }];
}

async function dsaFirstPublicSampleByQuestionId(
  questionIds: string[]
): Promise<Map<string, { input: string; expected: string }>> {
  const map = new Map<string, { input: string; expected: string }>();
  if (questionIds.length === 0) return map;

  const rows = await prisma.dsaTestCase.findMany({
    where: { questionId: { in: questionIds } },
    orderBy: { id: "asc" },
    select: { questionId: true, input: true, expected: true, isHidden: true },
  });

  for (const row of rows) {
    if (map.has(row.questionId)) continue;
    if (row.isHidden) continue;
    map.set(row.questionId, { input: row.input, expected: row.expected });
  }
  for (const row of rows) {
    if (!map.has(row.questionId)) {
      map.set(row.questionId, { input: row.input, expected: row.expected });
    }
  }
  return map;
}

verificationRouter.get("/dsa/questions", requireAuth, requireJobSeeker, async (req: AuthedRequest, res) => {
  const ok = await ensureDsaRoundActiveForOfficialApis(req.user!.id);
  if (!ok) {
    return res.status(403).json({
      error:
        "DSA round is not active yet. Finish the aptitude test, then open the DSA step from verification (or refresh the page).",
    });
  }

  const profile = await prisma.jobSeekerProfile.findUnique({
    where: { userId: req.user!.id },
    select: { targetJobTitle: true, experienceYears: true },
  });

  const targetJobTitle = profile?.targetJobTitle ?? null;
  const experienceYears = profile?.experienceYears ?? 0;

  const pool = await prisma.dsaQuestion.findMany({
    select: {
      id: true,
      title: true,
      description: true,
      difficulty: true,
      examples: true,
      constraints: true,
      starterCode: true,
    },
  });

  const selected = generateDSATestByRoleAndExperience(
    targetJobTitle,
    experienceYears,
    pool as any,
    DSA_QUESTIONS_COUNT,
  ) as typeof pool;

  type PoolItem = (typeof pool)[number];

  const sampleById = await dsaFirstPublicSampleByQuestionId(selected.map((q) => q.id));

  return res.json(
    selected.map((q: PoolItem) => ({
      id: q.id,
      title: q.title,
      description: q.description,
      difficulty: q.difficulty,
      examples: dsaMergeExamplesWithSample(q.examples, sampleById.get(q.id)),
      constraints: q.constraints,
      starterCode: q.starterCode,
    }))
  );
});

// Practice dialog before the DSA round is started (no "in_progress" stage required).
verificationRouter.get("/dsa/practice-questions", requireAuth, requireJobSeeker, async (req: AuthedRequest, res) => {
  const profile = await prisma.jobSeekerProfile.findUnique({
    where: { userId: req.user!.id },
    select: { targetJobTitle: true, experienceYears: true },
  });

  const targetJobTitle = profile?.targetJobTitle ?? null;
  const experienceYears = profile?.experienceYears ?? 0;

  const pool = await prisma.dsaQuestion.findMany({
    select: {
      id: true,
      title: true,
      description: true,
      difficulty: true,
      examples: true,
      constraints: true,
      starterCode: true,
    },
  });

  const practiceCount = DSA_PRACTICE_COUNT;
  const selected = generateDSATestByRoleAndExperience(
    targetJobTitle,
    experienceYears,
    pool as any,
    practiceCount,
  ) as typeof pool;

  type PoolItem = (typeof pool)[number];

  const sampleById = await dsaFirstPublicSampleByQuestionId(selected.map((q) => q.id));

  return res.json(
    selected.map((q: PoolItem) => ({
      id: q.id,
      title: q.title,
      description: q.description,
      difficulty: q.difficulty,
      examples: dsaMergeExamplesWithSample(q.examples, sampleById.get(q.id)),
      constraints: q.constraints,
      starterCode: q.starterCode,
    }))
  );
});

verificationRouter.post("/dsa/run-tests", requireAuth, requireJobSeeker, async (req: AuthedRequest, res) => {
  const schema = z.object({
    questionId: z.string().min(1),
    code: z.string().min(1).max(100_000),
    language: z.enum(DSA_API_LANGUAGES as unknown as [string, ...string[]]),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid request", details: parsed.error.flatten() });
  }

  const { questionId, code, language } = parsed.data;
  const userId = req.user!.id;

  const rateCheck = checkRateLimit(userId);
  if (!rateCheck.allowed) {
    return res.status(429).json({
      error: "Too many submissions. Please slow down.",
      retryAfter: rateCheck.retryAfterSeconds,
    });
  }

  const dsaOk = await ensureDsaRoundActiveForOfficialApis(userId);
  if (!dsaOk) {
    return res.status(403).json({ error: "DSA round is not active" });
  }

  const testCases = await prisma.dsaTestCase.findMany({
    where: { questionId },
    select: { input: true, expected: true, isHidden: true, expectedType: true, timeoutMs: true },
  });
  if (testCases.length === 0) {
    return res.status(404).json({ error: "Question not found or has no test cases" });
  }

  try {
    const payload = await evaluateDsaAgainstTestCases(testCases, code, language as DsaApiLanguage);

    await persistDsaSubmission(prisma, {
      userId,
      questionId,
      language,
      code,
      passedCount: payload.passed,
      totalCount: payload.total,
      isOfficial: false,
      results: payload.results,
    });

    return res.json({
      compiledSuccessfully: payload.compiledSuccessfully,
      passed: payload.passed,
      total: payload.total,
      ...(payload.compileError ? { compileError: payload.compileError } : {}),
      results: payload.results,
    });
  } catch (err: unknown) {
    console.error("[verification/dsa/run-tests]", err);
    const msg = err instanceof Error ? err.message : "Execution failed";
    return res.status(502).json({ error: msg });
  }
});

verificationRouter.post("/dsa/submit", requireAuth, requireJobSeeker, async (req: AuthedRequest, res) => {
  const schema = z.object({
    questionId: z.string().min(1),
    code: z.string().min(1).max(100_000),
    language: z.enum(DSA_API_LANGUAGES as unknown as [string, ...string[]]),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid request", details: parsed.error.flatten() });
  }

  const { questionId, code, language } = parsed.data;
  const userId = req.user!.id;

  const dsaOkSubmit = await ensureDsaRoundActiveForOfficialApis(userId);
  if (!dsaOkSubmit) {
    return res.status(403).json({ error: "DSA round is not active" });
  }

  const existingOfficial = await prisma.dsaSubmission.findFirst({
    where: { userId, questionId, isOfficial: true },
  });
  if (existingOfficial) {
    return res.status(409).json({ error: "You have already submitted this question." });
  }

  const testCases = await prisma.dsaTestCase.findMany({
    where: { questionId },
    select: { input: true, expected: true, isHidden: true, expectedType: true, timeoutMs: true },
  });
  if (testCases.length === 0) {
    return res.status(404).json({ error: "Question not found or has no test cases" });
  }

  try {
    const payload = await evaluateDsaAgainstTestCases(testCases, code, language as DsaApiLanguage);

    await persistDsaSubmission(prisma, {
      userId,
      questionId,
      language,
      code,
      passedCount: payload.passed,
      totalCount: payload.total,
      isOfficial: true,
      results: payload.results,
    });

    return res.json({
      compiledSuccessfully: payload.compiledSuccessfully,
      passed: payload.passed,
      total: payload.total,
      ...(payload.compileError ? { compileError: payload.compileError } : {}),
      results: payload.results,
      submitted: true,
    });
  } catch (err: unknown) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return res.status(409).json({ error: "You have already submitted this question." });
    }
    console.error("[verification/dsa/submit]", err);
    const msg = err instanceof Error ? err.message : "Execution failed";
    return res.status(502).json({ error: msg });
  }
});

verificationRouter.get("/technical-scorecard", requireAuth, requireJobSeeker, async (req: AuthedRequest, res) => {
  const profile = await prisma.jobSeekerProfile.findUnique({
    where: { userId: req.user!.id },
    select: { roleType: true },
  });
  if ((profile?.roleType ?? "technical") !== "technical") {
    return res.status(400).json({ error: "Technical scorecard is only available for technical candidates." });
  }

  const scorecard = await buildTechnicalScorecard(req.user!.id);

  // Human Expert stage is unlocked only after admin approval (+ payment when required).
  // Shortlist on the scorecard remains informational for the candidate UI.

  return res.json(scorecard);
});

verificationRouter.post("/non-tech-assignment/submit", requireAuth, requireJobSeeker, async (req: AuthedRequest, res) => {
  const schema = z.object({
    prompt: z.string().min(1),
    response: z.string().min(1),
    targetJobTitle: z.string().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid payload" });

  const threshold = 60;
  const evalResult = await evaluateNonTechnicalAssignment({
    prompt: parsed.data.prompt,
    response: parsed.data.response,
    targetJobTitle: parsed.data.targetJobTitle,
    threshold,
  });

  // Update assignment stage with AI score.
  await prisma.verificationStage.updateMany({
    where: { userId: req.user!.id, stageName: "non_tech_assignment" },
    data: {
      status: evalResult.qualified ? "completed" : "failed",
      score: evalResult.score,
    },
  });

  if (evalResult.qualified) {
    await prisma.verificationStage.upsert({
      where: {
        userId_stageName: { userId: req.user!.id, stageName: "human_expert_interview" },
      },
      create: {
        userId: req.user!.id,
        stageName: "human_expert_interview",
        status: "in_progress",
      },
      update: { status: "in_progress" },
    });
  } else {
    // Keep human interview locked when assignment score is below threshold.
    const existing = await prisma.verificationStage.findFirst({
      where: { userId: req.user!.id, stageName: "human_expert_interview" },
    });
    if (existing) {
      await prisma.verificationStage.update({
        where: { id: existing.id },
        data: { status: "locked" },
      });
    }
  }

  return res.json({
    score: evalResult.score,
    qualified: evalResult.qualified,
    threshold: evalResult.threshold,
    summary: evalResult.summary,
    strengths: evalResult.strengths,
    gaps: evalResult.gaps,
  });
});

verificationRouter.get("/cooldowns", optionalAuth, async (_req, res) => {
  res.json({ aptitude: { inCooldown: false }, dsa: { inCooldown: false } });
});

verificationRouter.get("/invalidated", optionalAuth, async (_req, res) => {
  res.json({ aptitude: false, dsa: false });
});

verificationRouter.post("/invalidate", requireAuth, requireJobSeeker, async (req: AuthedRequest, res) => {
  const schema = z.object({ testId: z.string(), testType: z.enum(["aptitude", "dsa"]), reason: z.string() });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid payload" });
  res.json({ ok: true });
});

/** Get meeting link for job seeker. MVP: Google Meet URL. Daily.co disabled. */
verificationRouter.get("/human-interview-session/room-token", requireAuth, requireJobSeeker, async (req: AuthedRequest, res) => {
  const session = await prisma.humanInterviewSession.findFirst({
    where: {
      userId: req.user!.id,
      status: { in: ["scheduled", "in_progress"] },
    },
  });
  if (!session) return res.status(404).json({ error: "No scheduled interview found" });
  if (!session.meetingLink) return res.status(400).json({ error: "The interviewer will share the Google Meet link shortly. Check back before your scheduled time." });
  // Google Meet or any external URL - return as-is (no Daily token needed)
  return res.json({ roomUrl: session.meetingLink, token: null });
});

/** Get current user's human expert interview session (if any) */
verificationRouter.get("/human-interview-session", requireAuth, requireJobSeeker, async (req: AuthedRequest, res) => {
  const session = await prisma.humanInterviewSession.findFirst({
    where: {
      userId: req.user!.id,
      status: { in: ["scheduled", "in_progress"] },
    },
    include: { interviewer: { select: { name: true } } },
  });
  res.json({ session: session ? { id: session.id, scheduledAt: session.scheduledAt, status: session.status, meetingLink: session.meetingLink } : null });
});

/** Match interviewers by track and role (targetJobTitle). Role must match (Backend, Frontend, etc.). */
verificationRouter.get("/matched-interviewers", requireAuth, requireJobSeeker, async (req: AuthedRequest, res) => {
  const eligibility = await getHumanInterviewEligibility(req.user!.id);
  if (!eligibility.can_access_slots) {
    return res.status(403).json({
      error: "Slot list is available after admin approval and any required payment.",
      interviewers: [],
      gated: true,
    });
  }
  const profile = await prisma.jobSeekerProfile.findUnique({ where: { userId: req.user!.id } });
  const track = (profile?.roleType as string) === "non_technical" ? "non_technical" : "technical";
  const targetTitle = profile?.targetJobTitle ?? null;
  const from = new Date();
  const to = new Date();
  to.setDate(to.getDate() + 14);

  const slots = await prisma.interviewerSlot.findMany({
    where: {
      status: "available",
      startsAt: { gte: from, lte: to },
      interviewer: {
        status: "active",
        track,
        userId: { not: null },
        ...(track === "non_technical" && { experienceYears: { gte: 5 } }),
      },
    },
    include: {
      interviewer: {
        select: {
          id: true,
          name: true,
          domain: true,
          track: true,
          domains: true,
          experienceYears: true,
        },
      },
    },
    orderBy: { startsAt: "asc" },
  });

  const byInterviewer = new Map<string, { interviewer: any; slots: any[] }>();
  for (const s of slots) {
    const inv = s.interviewer;
    const raw = inv.domain ?? (Array.isArray(inv.domains) ? inv.domains[0] : null);
    const invRole = typeof raw === "string" ? raw : null;
    if (!rolesMatch(targetTitle, invRole)) continue;
    const key = inv.id;
    if (!byInterviewer.has(key)) {
      byInterviewer.set(key, { interviewer: inv, slots: [] });
    }
    byInterviewer.get(key)!.slots.push({
      id: s.id,
      startsAt: s.startsAt,
      endsAt: s.endsAt,
    });
  }
  res.json({
    interviewers: Array.from(byInterviewer.values()).map(({ interviewer, slots: sl }) => ({
      id: interviewer.id,
      name: interviewer.name,
      domain: interviewer.domain,
      track: interviewer.track,
      domains: interviewer.domains,
      experienceYears: interviewer.experienceYears,
      slots: sl,
    })),
    track,
  });
});

/** Book a slot (job seeker) */
verificationRouter.post("/book-slot", requireAuth, requireJobSeeker, async (req: AuthedRequest, res) => {
  const schema = z.object({ slotId: z.string().uuid() });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid payload" });
  const { slotId } = parsed.data;

  const eligibility = await getHumanInterviewEligibility(req.user!.id);
  if (!eligibility.can_access_slots) {
    return res.status(403).json({
      error: "Complete admin review and payment (if required) before booking a slot.",
    });
  }

  const profile = await prisma.jobSeekerProfile.findUnique({ where: { userId: req.user!.id } });
  const track = (profile?.roleType as string) === "non_technical" ? "non_technical" : "technical";

  const openAttempt =
    track === "technical"
      ? await prisma.humanInterviewAttempt.findFirst({
          where: {
            candidateId: req.user!.id,
            paymentStatus: { in: ["paid", "waived"] },
            slotId: null,
          },
          orderBy: { createdAt: "desc" },
        })
      : null;
  let legacyTechnicalBooking = false;
  if (track === "technical" && !openAttempt) {
    const expertDone = await prisma.verificationStage.findFirst({
      where: { userId: req.user!.id, stageName: "expert_interview", status: "completed" },
    });
    const anyQueue = await prisma.adminReviewQueue.findFirst({
      where: { candidateId: req.user!.id },
    });
    if (expertDone && !anyQueue) {
      legacyTechnicalBooking = true;
    } else {
      return res.status(400).json({ error: "No active booking attempt. Contact support if this persists." });
    }
  }

  const slot = await prisma.interviewerSlot.findUnique({
    where: { id: slotId },
    include: { interviewer: { select: { id: true, userId: true, name: true, track: true, domain: true, domains: true } } },
  });
  if (!slot) return res.status(404).json({ error: "Slot not found" });
  if (slot.status !== "available") return res.status(400).json({ error: "Slot is no longer available" });
  if (!slot.interviewer?.userId) return res.status(400).json({ error: "Interviewer not active" });

  if (slot.interviewer.track !== track) {
    return res.status(400).json({ error: "Interviewer track does not match your profile" });
  }
  const rawInvRole = slot.interviewer.domain ?? (Array.isArray(slot.interviewer.domains) ? slot.interviewer.domains[0] : null);
  const invRole = typeof rawInvRole === "string" ? rawInvRole : null;
  if (!rolesMatch(profile?.targetJobTitle, invRole)) {
    return res.status(400).json({ error: "Interviewer role does not match your target job title" });
  }

  const existingSession = await prisma.humanInterviewSession.findFirst({
    where: { userId: req.user!.id, status: { in: ["scheduled", "in_progress"] } },
  });
  if (existingSession) return res.status(400).json({ error: "You already have a scheduled interview" });

  let session: Awaited<ReturnType<typeof prisma.humanInterviewSession.create>>;
  try {
    if (track === "non_technical" || legacyTechnicalBooking) {
      session = await prisma.$transaction(async (tx) => {
        const claimed = await tx.interviewerSlot.updateMany({
          where: { id: slotId, status: "available" },
          data: { status: "booked", bookedUserId: req.user!.id },
        });
        if (claimed.count === 0) throw new Error("SLOT_TAKEN");

        const createdSession = await tx.humanInterviewSession.create({
          data: {
            userId: req.user!.id,
            interviewerId: slot.interviewerId,
            slotId: slot.id,
            scheduledAt: slot.startsAt,
            status: "scheduled",
            attemptNumber: 1,
            paymentStatus: "waived",
          },
        });

        await tx.humanInterviewBooking.create({
          data: {
            candidateId: req.user!.id,
            slotId: slot.id,
            attemptNumber: 1,
            paymentStatus: "waived",
            humanInterviewSessionId: createdSession.id,
          },
        });

        return createdSession;
      });
    } else {
      session = await prisma.$transaction(async (tx) => {
        const claimed = await tx.interviewerSlot.updateMany({
          where: { id: slotId, status: "available" },
          data: { status: "booked", bookedUserId: req.user!.id },
        });
        if (claimed.count === 0) throw new Error("SLOT_TAKEN");

        const createdSession = await tx.humanInterviewSession.create({
          data: {
            userId: req.user!.id,
            interviewerId: slot.interviewerId,
            slotId: slot.id,
            scheduledAt: slot.startsAt,
            status: "scheduled",
            attemptNumber: openAttempt!.attemptNumber,
            paymentStatus: openAttempt!.paymentStatus === "waived" ? "waived" : "paid",
            humanInterviewAttemptId: openAttempt!.id,
          },
        });

        await tx.humanInterviewAttempt.update({
          where: { id: openAttempt!.id },
          data: { slotId: slot.id },
        });

        await tx.humanInterviewBooking.create({
          data: {
            candidateId: req.user!.id,
            slotId: slot.id,
            attemptNumber: openAttempt!.attemptNumber,
            paymentStatus: openAttempt!.paymentStatus === "waived" ? "waived" : "paid",
            humanInterviewAttemptId: openAttempt!.id,
            humanInterviewSessionId: createdSession.id,
          },
        });

        return createdSession;
      });
    }
  } catch (e) {
    if (e instanceof Error && e.message === "SLOT_TAKEN") {
      return res.status(409).json({ error: "This slot was just booked. Please choose another time." });
    }
    throw e;
  }

  // MVP: No Daily.co. Interviewer adds Google Meet link when ready.

  await prisma.verificationStage.upsert({
    where: {
      userId_stageName: { userId: req.user!.id, stageName: "human_expert_interview" },
    },
    create: { userId: req.user!.id, stageName: "human_expert_interview", status: "in_progress" },
    update: { status: "in_progress" },
  });

  const slotLabel = slot.startsAt.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
  const booker = await prisma.user.findUnique({
    where: { id: req.user!.id },
    select: { email: true, name: true },
  });
  if (booker?.email) {
    void sendHumanInterviewSlotBookedEmail(
      booker.email,
      booker.name,
      slotLabel,
      slot.interviewer?.name
    ).catch(() => {});
  }

  res.status(201).json({ session, message: "Slot booked successfully" });
});
