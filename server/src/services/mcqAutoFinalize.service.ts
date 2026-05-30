import { prisma } from "../config/prisma.js";

export type McqFinalizeResult =
  | { finalized: true; sessionId: string; status: "submitted" | "auto_submitted"; score: number; percentageScore: number; weightedScore: number | null }
  | { finalized: false; sessionId?: string; reason: "not_found" | "discarded" };

function normalizeAnswer(value: unknown): string {
  return String(value ?? "").trim().replace(/\s+/g, " ").toLowerCase();
}

function answersObject(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out: Record<string, string> = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (typeof raw === "string") out[key] = raw;
  }
  return out;
}

function answerKeyObject(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out: Record<string, string> = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (typeof raw === "string") out[key] = raw;
  }
  return out;
}

export async function autoFinalizeMcqSession(sessionId: string, mode: "manual" | "auto" = "auto"): Promise<McqFinalizeResult> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`mcq_session:${sessionId}`}))`;

    const session = await tx.mcqSession.findUnique({
      where: { id: sessionId },
      include: {
        workspaceRoundAttempt: {
          include: {
            workspace: true,
            workspaceRound: true,
            workspaceRegistration: true,
          },
        },
      },
    });
    if (!session) return { finalized: false, reason: "not_found" };

    const attempt = session.workspaceRoundAttempt;
    if (session.status === "submitted" || session.status === "auto_submitted") {
      return {
        finalized: true,
        sessionId: session.id,
        status: session.status,
        score: session.score ?? 0,
        percentageScore: attempt?.percentageScore ?? session.score ?? 0,
        weightedScore: attempt?.weightedScore ?? null,
      };
    }
    if (session.status === "discarded" || attempt?.status === "discarded") {
      return { finalized: false, sessionId: session.id, reason: "discarded" };
    }

    if (attempt?.workspaceRegistration.status === "removed") {
      await tx.mcqSession.update({
        where: { id: session.id },
        data: { status: "discarded", finalizedAt: new Date() },
      });
      await tx.workspaceRoundAttempt.update({
        where: { id: attempt.id },
        data: { status: "discarded", completedAt: new Date() },
      });
      return { finalized: false, sessionId: session.id, reason: "discarded" };
    }

    const answerKey = answerKeyObject(session.answerKey);
    const answers = answersObject(session.answers);
    const questionIds = session.questionIds;
    let correctCount = 0;
    let attemptedCount = 0;
    for (const questionId of questionIds) {
      const selected = answers[questionId];
      if (selected == null || selected.trim().length === 0) continue;
      attemptedCount += 1;
      if (normalizeAnswer(selected) === normalizeAnswer(answerKey[questionId])) correctCount += 1;
    }
    const incorrectCount = Math.max(0, attemptedCount - correctCount);
    const skippedCount = Math.max(0, questionIds.length - attemptedCount);
    const percentageScore = questionIds.length > 0 ? Math.round((correctCount / questionIds.length) * 100) : 0;
    const weightedScore = attempt
      ? Math.round((percentageScore * attempt.workspaceRound.scoreWeightage) / 100)
      : null;
    const status = mode === "manual" ? "submitted" : "auto_submitted";
    const attemptStatus = mode === "manual" ? "completed" : "auto_completed";
    const now = new Date();

    await tx.mcqSession.update({
      where: { id: session.id },
      data: {
        status,
        submittedAt: mode === "manual" ? now : session.submittedAt,
        finalizedAt: now,
        score: correctCount,
        correctCount,
        incorrectCount,
        skippedCount,
      },
    });

    if (attempt) {
      await tx.workspaceRoundAttempt.update({
        where: { id: attempt.id },
        data: {
          status: attemptStatus,
          score: correctCount,
          percentageScore,
          weightedScore,
          completedAt: now,
        },
      });
    }

    return { finalized: true, sessionId: session.id, status, score: correctCount, percentageScore, weightedScore };
  });
}

export async function finalizeActiveWorkspaceMcqAttempts(workspaceId: string): Promise<void> {
  const attempts = await prisma.workspaceRoundAttempt.findMany({
    where: {
      workspaceId,
      status: "active",
      mcqSession: { status: "active" },
      mcqSessionId: { not: null },
    },
    select: { mcqSessionId: true },
  });
  for (const attempt of attempts) {
    if (attempt.mcqSessionId) await autoFinalizeMcqSession(attempt.mcqSessionId, "auto");
  }
}

export async function discardActiveWorkspaceRegistrationMcqAttempts(workspaceId: string, userId: string): Promise<void> {
  const attempts = await prisma.workspaceRoundAttempt.findMany({
    where: {
      workspaceId,
      userId,
      status: "active",
      mcqSessionId: { not: null },
    },
    select: { id: true, mcqSessionId: true },
  });
  for (const attempt of attempts) {
    const mcqSessionId = attempt.mcqSessionId;
    if (!mcqSessionId) continue;
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`mcq_session:${mcqSessionId}`}))`;
      await tx.mcqSession.updateMany({
        where: { id: mcqSessionId, status: "active" },
        data: { status: "discarded", finalizedAt: new Date() },
      });
      await tx.workspaceRoundAttempt.updateMany({
        where: { id: attempt.id, status: "active" },
        data: { status: "discarded", completedAt: new Date() },
      });
    });
  }
}
