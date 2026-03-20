import { Router } from "express";
import { z } from "zod";
import { requireAuth, optionalAuth, AuthedRequest } from "../middleware/auth.js";
import { prisma } from "../config/prisma.js";
import { createAptitudeSession, getPracticeAptitudeQuestions } from "../data/aptitude-loader.js";
import { storeAptitudeSession, getAptitudeSession, clearAptitudeSession } from "../data/aptitude-session-db.js";
import { rolesMatch } from "../data/interviewerRoles.js";
import { evaluateNonTechnicalAssignment } from "../services/ai.service.js";
import { buildTechnicalScorecard } from "../services/verificationScoring.service.js";
import { calculateCertificationLevel } from "../services/verificationLevel.service.js";
import { upsertSkillVerification, getSkillVerifications } from "../services/skillVerification.service.js";
// Daily.co disabled for MVP - using Google Meet instead. Uncomment when budget allows.
// import { createDailyRoom, createMeetingToken, getRoomNameFromUrl } from "../services/daily.js";

export const verificationRouter = Router();

const technicalStages = ["profile_setup", "aptitude_test", "dsa_round", "expert_interview"];
const nonTechnicalStages = ["profile_setup", "non_tech_assignment", "human_expert_interview"];

function toStageResponse(rows: { stageName: string; status: string; score?: number | null }[]) {
  return rows.map((r) => ({
    stage_name: r.stageName,
    status: r.status,
    score: r.score ?? undefined,
  }));
}

verificationRouter.get("/stages", requireAuth, async (req: AuthedRequest, res) => {
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
verificationRouter.get("/skills", requireAuth, async (req: AuthedRequest, res) => {
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

verificationRouter.post("/stages/update", requireAuth, async (req: AuthedRequest, res) => {
  const schema = z.object({ stageName: z.string(), status: z.string(), score: z.number().optional() });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid payload" });
  const { stageName, status, score } = parsed.data;
  const existing = await prisma.verificationStage.findFirst({
    where: { userId: req.user!.id, stageName },
  });
  if (!existing && stageName === "human_expert_interview") {
    await prisma.verificationStage.create({
      data: { userId: req.user!.id, stageName, status, score: score ?? null },
    });
    return res.json({ updated: 1 });
  }
  const updated = await prisma.verificationStage.updateMany({
    where: { userId: req.user!.id, stageName },
    data: { status, score: score ?? undefined },
  });
  // PRD: After Stage 4 pass (without Stage 5), status should be verified.
  if (stageName === "expert_interview" && status === "completed") {
    const profile = await prisma.jobSeekerProfile.findUnique({
      where: { userId: req.user!.id },
      select: { verificationStatus: true },
    });
    if (profile && profile.verificationStatus !== "expert_verified") {
      await prisma.jobSeekerProfile.updateMany({
        where: { userId: req.user!.id },
        data: { verificationStatus: "verified" },
      });
    }
  }
  res.json({ updated: updated.count });
});

verificationRouter.post("/stages/bulk", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const schema = z.object({
      stages: z.array(z.object({
        stageName: z.string().optional(),
        stage_name: z.string().optional(),
        status: z.string(),
      })),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid payload" });
    const rows = parsed.data.stages
      .map((s) => ({ userId: req.user!.id, stageName: s.stageName ?? s.stage_name ?? "", status: s.status }))
      .filter((r) => r.stageName && !["human_expert_interview"].includes(r.stageName));
    if (rows.length > 0) {
      await prisma.verificationStage.createMany({ data: rows, skipDuplicates: true });
    }
    return res.json({ ok: true });
  } catch (e) {
    console.error("[verification/stages/bulk]", e);
    return res.status(500).json({ error: e instanceof Error ? e.message : "Failed to create stages" });
  }
});

verificationRouter.post("/stages/reset", requireAuth, async (req: AuthedRequest, res) => {
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
verificationRouter.get("/aptitude/questions", requireAuth, async (req: AuthedRequest, res) => {
  try {
    // Allow retry anytime — no expiry block. Users can re-attempt whenever they want.
    const profile = await prisma.jobSeekerProfile.findUnique({ where: { userId: req.user!.id } });
    const experienceYears = profile?.experienceYears ?? 0;
    const { questions, answerKey, marksKey, totalMarks, passThreshold } = createAptitudeSession(experienceYears);
    await storeAptitudeSession(req.user!.id, answerKey, marksKey);
    return res.json({
      questions,
      timeLimitMinutes: 30, // 30 minutes total
      totalMarks,
      passThreshold,
    });
  } catch (e) {
    console.error("[verification/aptitude/questions]", e);
    return res.status(500).json({ error: "Failed to load aptitude questions" });
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

verificationRouter.post("/aptitude", requireAuth, async (req: AuthedRequest, res) => {
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

    if (parsed.data.answers && typeof parsed.data.answers === "object" && !Array.isArray(parsed.data.answers)) {
      const session = await getAptitudeSession(req.user!.id);
      const answerKey = session?.answerKey ?? null;
      const marksKey = session?.marksKey ?? null;
      if (!answerKey || typeof answerKey !== "object" || Object.keys(answerKey).length === 0) {
        return res.status(400).json({
          error: "Your test session has expired. Please click 'Retry This Step' above, then 'Start Aptitude Test' to begin a fresh attempt.",
        });
      }
      let earnedMarks = 0;
      let correctCount = 0;
      for (const [qId, selected] of Object.entries(parsed.data.answers)) {
        const expected = answerKey[qId];
        const qMarks = marksKey?.[qId] ?? 1;
        if (expected != null && normalizeAnswer(selected) === normalizeAnswer(expected)) {
          earnedMarks += qMarks;
          correctCount++;
        }
      }
      score = earnedMarks; // Raw earned marks (total varies 25–35 by experience). Pass threshold 60%.
      const totalMarksVal = marksKey ? Object.values(marksKey).reduce((a, b) => a + b, 0) : Object.keys(answerKey).length;
      answersPayload = {
        questions: Object.keys(answerKey).length,
        correct: correctCount,
        earnedMarks,
        totalMarks: totalMarksVal,
        ...(parsed.data.meta?.timeTakenSeconds != null ? { timeTakenSeconds: parsed.data.meta.timeTakenSeconds } : {}),
        ...(parsed.data.meta?.timeLimitSeconds != null ? { timeLimitSeconds: parsed.data.meta.timeLimitSeconds } : {}),
      };
      await clearAptitudeSession(req.user!.id);
    } else {
      score = parsed.data.score ?? 0;
    }

    const answersToStore = answersPayload ?? (parsed.data.answers && typeof parsed.data.answers === "object" ? parsed.data.answers : undefined);
    const completedAt = new Date();
    const result = await prisma.aptitudeTestResult.create({
      data: {
        userId: req.user!.id,
        score,
        ...(answersToStore !== undefined ? { answers: answersToStore as object } : {}),
        invalidated: parsed.data.invalidated ?? false,
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
    return res.json({ result, score });
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

verificationRouter.get("/aptitude/latest", requireAuth, async (req: AuthedRequest, res) => {
  const row = await prisma.aptitudeTestResult.findFirst({
    where: { userId: req.user!.id },
    orderBy: { completedAt: "desc" },
  });
  const score = row?.score ?? 0;
  const answers = row?.answers as { totalMarks?: number; earnedMarks?: number } | null | undefined;
  const totalMarks = answers?.totalMarks ?? 25; // 25 is minimum session total (fresher); actual is 25/30/35
  const result = row ? { total_score: score, score, total_marks: totalMarks } : null;
  res.json({ result });
});

verificationRouter.post("/dsa", requireAuth, async (req: AuthedRequest, res) => {
  const schema = z.object({ score: z.number().optional(), answers: z.any().optional(), invalidated: z.boolean().optional() });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid payload" });
  const dsaScore = parsed.data.score ?? null;
  // Allow retry anytime — no expiry block.
  const result = await prisma.dsaRoundResult.create({
    data: {
      userId: req.user!.id,
      score: dsaScore,
      answers: parsed.data.answers ?? null,
      invalidated: parsed.data.invalidated ?? false,
    },
  });
  const existingStage = await prisma.verificationStage.findFirst({
    where: { userId: req.user!.id, stageName: "dsa_round" },
  });
  const roundedScore = dsaScore != null ? Math.round(dsaScore) : null;
  if (existingStage && roundedScore != null) {
    await prisma.verificationStage.update({
      where: { id: existingStage.id },
      data: { score: roundedScore },
    });
  } else if (!existingStage && roundedScore != null) {
    await prisma.verificationStage.create({
      data: { userId: req.user!.id, stageName: "dsa_round", status: "in_progress", score: roundedScore },
    });
  }
  if (dsaScore != null) {
    const completedAt = new Date();
    await upsertSkillVerification(req.user!.id, "LIVE_CODING", Math.round(dsaScore), completedAt);
  }
  res.json({ result });
});

verificationRouter.get("/dsa/latest", requireAuth, async (req: AuthedRequest, res) => {
  const row = await prisma.dsaRoundResult.findFirst({
    where: { userId: req.user!.id },
    orderBy: { completedAt: "desc" },
  });
  const score = row?.score ?? 0;
  const totalProblems = 3;
  const result = row
    ? { total_score: score, problems_solved: Math.min(totalProblems, Math.max(0, Math.round((score / 100) * totalProblems))), total_problems: totalProblems }
    : null;
  res.json({ result });
});

// ---------------------------------------------------------------------------
// DSA questions + test runner API (backend-side, no test cases on the client)
// ---------------------------------------------------------------------------

const DSA_QUESTIONS_COUNT = 3;

type ProgrammingLanguage = "javascript" | "python" | "java" | "cpp" | "c";

// Judge0 execution helpers (copied from server/src/routes/execute.ts)
const JUDGE0_CE_URL = process.env.JUDGE0_CE_URL || "https://ce.judge0.com";

// Judge0 CE language IDs (see https://ce.judge0.com for full list)
const langToJudge0Id: Record<ProgrammingLanguage, number> = {
  javascript: 63,
  python: 71,
  java: 62,
  cpp: 54,
  c: 50,
};

type Judge0Submission = {
  token?: string;
  stdout?: string | null;
  stderr?: string | null;
  compile_output?: string | null;
  message?: string | null;
  status?: { id: number; description?: string };
  exit_code?: number | null;
};

function normalizeOutput(s: string): string {
  return (s || "")
    .replace(/\r\n/g, "\n")
    .trim()
    .replace(/\s+/g, " ");
}

async function pollSubmission(token: string): Promise<Judge0Submission> {
  const url = `${JUDGE0_CE_URL}/submissions/${token}?base64_encoded=false`;
  for (let i = 0; i < 30; i++) {
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`Judge0 poll error: ${await resp.text()}`);
    const data = (await resp.json()) as Judge0Submission;
    const sid = data.status?.id ?? 0;
    if (sid !== 1 && sid !== 2) return data;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error("Execution timed out");
}

async function executeWithJudge0(languageId: number, code: string, stdin: string): Promise<{
  stdout: string;
  stderr: string;
  exitCode: number;
}> {
  const url = `${JUDGE0_CE_URL}/submissions/?base64_encoded=false&wait=true`;
  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      source_code: code,
      language_id: languageId,
      stdin: stdin || "",
      cpu_time_limit: 5,
      wall_time_limit: 10,
      memory_limit: 256000,
    }),
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Judge0 error: ${text}`);
  }
  let data = (await resp.json()) as Judge0Submission;
  if (data.token && data.status?.id === undefined && !data.stdout) {
    data = await pollSubmission(data.token);
  }
  const statusId = data.status?.id ?? 0;

  const stdout = data.stdout ?? "";
  const stderr = data.stderr ?? "";
  const compileOut = data.compile_output ?? "";
  const msg = data.message ?? "";

  if (statusId === 6) {
    return { stdout: "", stderr: compileOut || stderr || "Compilation error", exitCode: 1 };
  }

  if (statusId >= 7 && statusId <= 14) {
    return { stdout: "", stderr: msg || stderr || (data.status?.description ?? "Runtime error"), exitCode: 1 };
  }

  if (statusId === 13) {
    return { stdout: "", stderr: msg || "Internal error", exitCode: 1 };
  }

  return {
    stdout,
    stderr,
    exitCode: data.exit_code ?? (statusId === 3 ? 0 : 1),
  };
}

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

verificationRouter.get("/dsa/questions", requireAuth, async (req: AuthedRequest, res) => {
  const activeStage = await prisma.verificationStage.findFirst({
    where: { userId: req.user!.id, stageName: "dsa_round", status: "in_progress" },
  });
  if (!activeStage) {
    return res.status(403).json({ error: "DSA round is not active" });
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

  return res.json(
    selected.map((q: PoolItem) => ({
      id: q.id,
      title: q.title,
      description: q.description,
      difficulty: q.difficulty,
      examples: q.examples,
      constraints: q.constraints,
      starterCode: q.starterCode,
    }))
  );
});

// Practice dialog before the DSA round is started (no "in_progress" stage required).
verificationRouter.get("/dsa/practice-questions", requireAuth, async (req: AuthedRequest, res) => {
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

  const practiceCount = 2;
  const selected = generateDSATestByRoleAndExperience(
    targetJobTitle,
    experienceYears,
    pool as any,
    practiceCount,
  ) as typeof pool;

  type PoolItem = (typeof pool)[number];

  return res.json(
    selected.map((q: PoolItem) => ({
      id: q.id,
      title: q.title,
      description: q.description,
      difficulty: q.difficulty,
      examples: q.examples,
      constraints: q.constraints,
      starterCode: q.starterCode,
    }))
  );
});

verificationRouter.post("/dsa/run-tests", requireAuth, async (req: AuthedRequest, res) => {
  const schema = z.object({
    questionId: z.string().min(1),
    code: z.string().min(1).max(100_000),
    language: z.enum(["javascript", "python", "java", "cpp", "c"]),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid payload" });

  const { questionId, code, language } = parsed.data;

  const activeStage = await prisma.verificationStage.findFirst({
    where: { userId: req.user!.id, stageName: "dsa_round", status: "in_progress" },
  });
  if (!activeStage) {
    return res.status(403).json({ error: "DSA round is not active" });
  }

  const testCases = await prisma.dsaTestCase.findMany({
    where: { questionId },
    select: { input: true, expected: true, isHidden: true },
  });
  if (!testCases || testCases.length === 0) {
    return res.status(404).json({ error: "No test cases found for this question" });
  }

  const languageId = langToJudge0Id[language as ProgrammingLanguage];

  let passedCount = 0;
  const results: Array<
    | { passed: boolean }
    | { passed: boolean; input: string; expected: string; actual: string }
  > = [];

  for (const tc of testCases) {
    const { stdout, stderr } = await executeWithJudge0(languageId, code, tc.input);
    const rawActual = stdout && stdout.trim().length > 0 ? stdout : stderr;
    const passed = normalizeOutput(rawActual) === normalizeOutput(tc.expected);

    if (passed) passedCount++;

    if (tc.isHidden) {
      results.push({ passed });
    } else {
      results.push({
        passed,
        input: tc.input,
        expected: tc.expected,
        actual: rawActual,
      });
    }
  }

  return res.json({
    passed: passedCount,
    total: testCases.length,
    results,
  });
});

verificationRouter.get("/technical-scorecard", requireAuth, async (req: AuthedRequest, res) => {
  const profile = await prisma.jobSeekerProfile.findUnique({
    where: { userId: req.user!.id },
    select: { roleType: true },
  });
  if ((profile?.roleType ?? "technical") !== "technical") {
    return res.status(400).json({ error: "Technical scorecard is only available for technical candidates." });
  }

  const scorecard = await buildTechnicalScorecard(req.user!.id);

  // Keep human expert stage aligned with new shortlist logic.
  const humanStage = await prisma.verificationStage.findFirst({
    where: { userId: req.user!.id, stageName: "human_expert_interview" },
  });
  if (scorecard.shortlisted) {
    if (humanStage) {
      if (humanStage.status === "locked" || humanStage.status === "failed") {
        await prisma.verificationStage.update({
          where: { id: humanStage.id },
          data: { status: "in_progress" },
        });
      }
    } else {
      await prisma.verificationStage.create({
        data: { userId: req.user!.id, stageName: "human_expert_interview", status: "in_progress" },
      });
    }
  } else if (humanStage && humanStage.status === "in_progress") {
    await prisma.verificationStage.update({
      where: { id: humanStage.id },
      data: { status: "locked" },
    });
  }

  return res.json(scorecard);
});

verificationRouter.post("/non-tech-assignment/submit", requireAuth, async (req: AuthedRequest, res) => {
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
    // Unlock/progress to human expert interview.
    const existing = await prisma.verificationStage.findFirst({
      where: { userId: req.user!.id, stageName: "human_expert_interview" },
    });
    if (existing) {
      await prisma.verificationStage.update({
        where: { id: existing.id },
        data: { status: "in_progress" },
      });
    } else {
      await prisma.verificationStage.create({
        data: {
          userId: req.user!.id,
          stageName: "human_expert_interview",
          status: "in_progress",
        },
      });
    }
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

verificationRouter.post("/invalidate", requireAuth, async (req: AuthedRequest, res) => {
  const schema = z.object({ testId: z.string(), testType: z.enum(["aptitude", "dsa"]), reason: z.string() });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid payload" });
  res.json({ ok: true });
});

/** Get meeting link for job seeker. MVP: Google Meet URL. Daily.co disabled. */
verificationRouter.get("/human-interview-session/room-token", requireAuth, async (req: AuthedRequest, res) => {
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
verificationRouter.get("/human-interview-session", requireAuth, async (req: AuthedRequest, res) => {
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
verificationRouter.get("/matched-interviewers", requireAuth, async (req: AuthedRequest, res) => {
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
verificationRouter.post("/book-slot", requireAuth, async (req: AuthedRequest, res) => {
  const schema = z.object({ slotId: z.string().uuid() });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid payload" });
  const { slotId } = parsed.data;

  const slot = await prisma.interviewerSlot.findUnique({
    where: { id: slotId },
    include: { interviewer: true },
  });
  if (!slot) return res.status(404).json({ error: "Slot not found" });
  if (slot.status !== "available") return res.status(400).json({ error: "Slot is no longer available" });
  if (!slot.interviewer?.userId) return res.status(400).json({ error: "Interviewer not active" });

  const profile = await prisma.jobSeekerProfile.findUnique({ where: { userId: req.user!.id } });
  const track = (profile?.roleType as string) === "non_technical" ? "non_technical" : "technical";
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

  const [session] = await prisma.$transaction([
    prisma.humanInterviewSession.create({
      data: {
        userId: req.user!.id,
        interviewerId: slot.interviewerId,
        slotId: slot.id,
        scheduledAt: slot.startsAt,
        status: "scheduled",
      },
    }),
    prisma.interviewerSlot.update({
      where: { id: slotId },
      data: { status: "booked", bookedUserId: req.user!.id },
    }),
  ]);

  // MVP: No Daily.co. Interviewer adds Google Meet link when ready.

  const existing = await prisma.verificationStage.findFirst({
    where: { userId: req.user!.id, stageName: "human_expert_interview" },
  });
  if (existing) {
    await prisma.verificationStage.update({ where: { id: existing.id }, data: { status: "in_progress" } });
  } else {
    await prisma.verificationStage.create({
      data: { userId: req.user!.id, stageName: "human_expert_interview", status: "in_progress" },
    });
  }

  res.status(201).json({ session, message: "Slot booked successfully" });
});
