import { prisma } from "../config/prisma.js";
import { DSA_API_LANGUAGES, type DsaApiLanguage } from "../constants/dsa.js";
import { evaluateDsaAgainstTestCases, persistDsaSubmission, type DsaRunResultPayload } from "./dsaEvaluation.js";
import { flushDsaSessionBuffers, getFollowUpAnswers, getLatestCodeDraftsForQuestion } from "./dsaDraftBuffer.service.js";
import { gradeDsaFollowUps } from "./dsaFollowUps.service.js";

export type WorkspaceDsaFinalizeResult =
  | { finalized: true; sessionId: string; status: "completed" | "auto_completed"; score: number; percentageScore: number; weightedScore: number }
  | { finalized: false; sessionId?: string; reason: "not_found" | "discarded" | "not_workspace" | "not_expired"; requeueAt?: Date };

function zeroPayload(total: number, status: "WRONG_ANSWER" | "INTERNAL_ERROR", actual?: string): DsaRunResultPayload {
  return {
    compiledSuccessfully: true,
    passed: 0,
    total,
    results: Array.from({ length: total }, () => ({
      passed: false,
      status,
      input: "",
      expected: "",
      actual: actual ?? "",
    })),
  };
}

async function evaluateCodeForQuestion(params: {
  roundSessionId: string;
  userId: string;
  questionId: string;
}) {
  const testCases = await prisma.dsaTestCase.findMany({
    where: { questionId: params.questionId },
    select: { input: true, expected: true, isHidden: true, expectedType: true, timeoutMs: true },
  });
  const total = testCases.length;
  const drafts = await getLatestCodeDraftsForQuestion(params.roundSessionId, params.questionId, DSA_API_LANGUAGES);
  const draft = drafts.find((candidate) => candidate.code.trim().length > 0);
  if (!draft) {
    const payload = zeroPayload(total, "WRONG_ANSWER", "No saved code was submitted before time expired.");
    return { passedCount: 0, totalCount: total, language: "unknown", code: "", results: payload.results };
  }

  try {
    const payload = await evaluateDsaAgainstTestCases(testCases, draft.code, draft.language as DsaApiLanguage);
    return {
      passedCount: payload.passed,
      totalCount: payload.total,
      language: draft.language,
      code: draft.code,
      results: payload.results,
    };
  } catch (err) {
    const payload = zeroPayload(total, "INTERNAL_ERROR", err instanceof Error ? err.message : "Execution infrastructure error.");
    return { passedCount: 0, totalCount: total, language: draft.language, code: draft.code, results: payload.results };
  }
}

async function scoreDsaSession(roundSessionId: string, questionIds: string[]): Promise<number> {
  const rows = await prisma.dsaSubmission.findMany({
    where: { roundSessionId, isOfficial: true },
    orderBy: { submittedAt: "desc" },
    select: { questionId: true, passedCount: true, totalCount: true, followUpScore: true },
  });
  const byQuestion = new Map<string, (typeof rows)[number]>();
  for (const row of rows) {
    if (!byQuestion.has(row.questionId)) byQuestion.set(row.questionId, row);
  }

  let sum = 0;
  for (const questionId of questionIds) {
    const row = byQuestion.get(questionId);
    if (!row || row.totalCount <= 0) continue;
    const codeScore = Math.round((row.passedCount / row.totalCount) * 70);
    sum += Math.min(100, Math.max(0, codeScore + Math.min(30, Math.max(0, row.followUpScore ?? 0))));
  }
  return questionIds.length > 0 ? Math.round(sum / questionIds.length) : 0;
}

async function resumeExpiredFollowUpIfNeeded(session: {
  id: string;
  pausedTime: Date | null;
  activeFollowUpId: string | null;
  expTime: Date;
}) {
  if (!session.pausedTime || !session.activeFollowUpId) return { expTime: session.expTime };
  const followUp = await prisma.dsaFollowUpSession.findUnique({
    where: { id: session.activeFollowUpId },
    select: { expTime: true },
  });
  if (followUp && followUp.expTime.getTime() > Date.now()) {
    return { expTime: session.expTime, shouldWaitUntil: followUp.expTime };
  }

  const pauseEnd = followUp?.expTime && followUp.expTime.getTime() > session.pausedTime.getTime()
    ? followUp.expTime
    : new Date();
  const pausedMs = Math.max(0, pauseEnd.getTime() - session.pausedTime.getTime());
  const expTime = new Date(session.expTime.getTime() + pausedMs);
  await prisma.dsaRoundSession.update({
    where: { id: session.id },
    data: { expTime, pausedTime: null, activeFollowUpId: null },
  });
  return { expTime };
}

export async function finalizeWorkspaceDsaSession(
  roundSessionId: string,
  mode: "manual" | "auto" = "auto",
): Promise<WorkspaceDsaFinalizeResult> {
  const session = await prisma.dsaRoundSession.findUnique({ where: { id: roundSessionId } });
  if (!session) return { finalized: false, reason: "not_found" };

  const attempt = await prisma.workspaceRoundAttempt.findUnique({
    where: { dsaRoundSessionId: roundSessionId },
    include: {
      workspaceRound: true,
      workspaceRegistration: true,
    },
  });
  if (!attempt) return { finalized: false, sessionId: roundSessionId, reason: "not_workspace" };

  if (attempt.status === "completed" || attempt.status === "auto_completed") {
    return {
      finalized: true,
      sessionId: roundSessionId,
      status: attempt.status,
      score: attempt.score ?? 0,
      percentageScore: attempt.percentageScore ?? 0,
      weightedScore: attempt.weightedScore ?? 0,
    };
  }
  if (attempt.status === "discarded" || attempt.workspaceRegistration.status === "removed") {
    await prisma.workspaceRoundAttempt.updateMany({
      where: { id: attempt.id, status: "active" },
      data: { status: "discarded", completedAt: new Date() },
    });
    return { finalized: false, sessionId: roundSessionId, reason: "discarded" };
  }

  const resume = await resumeExpiredFollowUpIfNeeded(session);
  if (mode === "auto" && resume.shouldWaitUntil) {
    return { finalized: false, sessionId: roundSessionId, reason: "not_expired", requeueAt: resume.shouldWaitUntil };
  }
  if (mode === "auto" && resume.expTime.getTime() > Date.now()) {
    return { finalized: false, sessionId: roundSessionId, reason: "not_expired", requeueAt: resume.expTime };
  }

  if (mode === "auto") {
    await flushDsaSessionBuffers(session.id, session.questionIds, DSA_API_LANGUAGES);
    for (const questionId of session.questionIds) {
      const existingOfficial = await prisma.dsaSubmission.findFirst({
        where: { roundSessionId: session.id, questionId, isOfficial: true },
        select: { id: true },
      });
      if (existingOfficial) continue;
      const codeResult = await evaluateCodeForQuestion({ roundSessionId: session.id, userId: session.userId, questionId });
      const followUpAnswers = await getFollowUpAnswers(session.id, questionId);
      const followUp = await gradeDsaFollowUps({ questionId, answers: followUpAnswers ?? {}, allowIncomplete: true });
      await persistDsaSubmission(prisma, {
        userId: session.userId,
        roundSessionId: session.id,
        questionId,
        language: codeResult.language,
        code: codeResult.code,
        passedCount: codeResult.passedCount,
        totalCount: codeResult.totalCount,
        isOfficial: true,
        results: codeResult.results,
        followUpScore: followUp.followUpScore,
        followUpResults: {
          correctCount: followUp.correctCount,
          totalCount: followUp.totalCount,
          followUpPercentage: followUp.followUpPercentage,
          results: followUp.results,
          autoFinalized: true,
        },
      });
    }
  }

  const score = await scoreDsaSession(session.id, session.questionIds);
  const weightedScore = Math.round((score * attempt.workspaceRound.scoreWeightage) / 100);
  const status = mode === "manual" ? "completed" : "auto_completed";
  const now = new Date();
  const updated = await prisma.workspaceRoundAttempt.updateMany({
    where: { id: attempt.id, status: "active" },
    data: {
      status,
      score,
      percentageScore: score,
      weightedScore,
      completedAt: now,
    },
  });
  if (updated.count === 0) {
    const current = await prisma.workspaceRoundAttempt.findUnique({ where: { id: attempt.id } });
    if (current?.status === "completed" || current?.status === "auto_completed") {
      return {
        finalized: true,
        sessionId: session.id,
        status: current.status,
        score: current.score ?? 0,
        percentageScore: current.percentageScore ?? 0,
        weightedScore: current.weightedScore ?? 0,
      };
    }
    return { finalized: false, sessionId: session.id, reason: "discarded" };
  }

  return { finalized: true, sessionId: session.id, status, score, percentageScore: score, weightedScore };
}

export async function discardActiveWorkspaceRegistrationDsaAttempts(workspaceId: string, userId: string): Promise<void> {
  const attempts = await prisma.workspaceRoundAttempt.findMany({
    where: {
      workspaceId,
      userId,
      status: "active",
      dsaRoundSessionId: { not: null },
    },
    select: { id: true },
  });
  if (attempts.length === 0) return;
  await prisma.workspaceRoundAttempt.updateMany({
    where: { id: { in: attempts.map((attempt) => attempt.id) }, status: "active" },
    data: { status: "discarded", completedAt: new Date() },
  });
}

export async function finalizeActiveWorkspaceDsaAttempts(workspaceId: string): Promise<void> {
  const attempts = await prisma.workspaceRoundAttempt.findMany({
    where: {
      workspaceId,
      status: "active",
      dsaRoundSessionId: { not: null },
    },
    select: { dsaRoundSessionId: true },
  });
  for (const attempt of attempts) {
    if (attempt.dsaRoundSessionId) await finalizeWorkspaceDsaSession(attempt.dsaRoundSessionId, "auto");
  }
}
