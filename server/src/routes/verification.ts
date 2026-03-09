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
    const profile = await prisma.jobSeekerProfile.findUnique({ where: { userId: req.user!.id } });
    const experienceYears = profile?.experienceYears ?? 0;
    const { questions, answerKey, marksKey, totalMarks, passThreshold } = createAptitudeSession(experienceYears);
    await storeAptitudeSession(req.user!.id, answerKey, marksKey);
    return res.json({
      questions,
      timeLimitMinutes: 90, // 1.5 hours total
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
    score = earnedMarks; // Raw marks out of 100; pass threshold is 60
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
  const result = await prisma.aptitudeTestResult.create({
    data: {
      userId: req.user!.id,
      score,
      ...(answersToStore !== undefined ? { answers: answersToStore as object } : {}),
      invalidated: parsed.data.invalidated ?? false,
    },
  });
  res.json({ result, score });
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
  const answers = row?.answers as { totalMarks?: number } | null | undefined;
  const totalMarks = answers?.totalMarks ?? 20;
  const result = row ? { total_score: score, score, total_marks: totalMarks } : null;
  res.json({ result });
});

verificationRouter.post("/dsa", requireAuth, async (req: AuthedRequest, res) => {
  const schema = z.object({ score: z.number().optional(), answers: z.any().optional(), invalidated: z.boolean().optional() });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid payload" });
  const result = await prisma.dsaRoundResult.create({
    data: {
      userId: req.user!.id,
      score: parsed.data.score ?? null,
      answers: parsed.data.answers ?? null,
      invalidated: parsed.data.invalidated ?? false,
    },
  });
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
