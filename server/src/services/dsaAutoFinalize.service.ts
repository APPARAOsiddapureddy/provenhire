import { prisma } from "../config/prisma.js";
import { DSA_API_LANGUAGES, type DsaApiLanguage } from "../constants/dsa.js";
import { dsaTierConfig, experienceTierFromYears } from "../utils/experienceTier.js";
import { syncJobSeekerVerificationStatus } from "./certification.service.js";
import { evaluateDsaAgainstTestCases, persistDsaSubmission, type DsaRunResultPayload } from "./dsaEvaluation.js";
import { flushDsaSessionBuffers, getFollowUpAnswers, getLatestCodeDraftsForQuestion } from "./dsaDraftBuffer.service.js";
import { gradeDsaFollowUps } from "./dsaFollowUps.service.js";
import { upsertSkillVerification } from "./skillVerification.service.js";
import { finalizeWorkspaceDsaSession } from "./workspaceDsaFinalize.service.js";

const AUTO_FINALIZE_BUFFER_MS = Math.max(0, parseInt(process.env.DSA_AUTO_FINALIZE_BUFFER_MS ?? "5000", 10));

type AutoFinalizeResult =
  | { finalized: true; score: number; passed: boolean }
  | { finalized: false; reason: "not_expired"; requeueAt: Date }
  | { finalized: false; reason: "not_found" }
  | { finalized: false; reason: "superseded" };

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

async function resumeExpiredFollowUpIfNeeded(session: {
  id: string;
  pausedTime: Date | null;
  activeFollowUpId: string | null;
  expTime: Date;
}): Promise<{ expTime: Date; shouldWaitUntil?: Date }> {
  if (!session.pausedTime || !session.activeFollowUpId) return { expTime: session.expTime };

  const followUp = await prisma.dsaFollowUpSession.findUnique({
    where: { id: session.activeFollowUpId },
    select: { expTime: true },
  });
  if (followUp && followUp.expTime.getTime() > Date.now()) {
    return { expTime: session.expTime, shouldWaitUntil: new Date(followUp.expTime.getTime() + AUTO_FINALIZE_BUFFER_MS) };
  }

  const pauseEnd = followUp?.expTime && followUp.expTime.getTime() > session.pausedTime.getTime()
    ? followUp.expTime
    : new Date();
  const pausedMs = Math.max(0, pauseEnd.getTime() - session.pausedTime.getTime());
  const nextExpTime = new Date(session.expTime.getTime() + pausedMs);
  await prisma.dsaRoundSession.update({
    where: { id: session.id },
    data: {
      expTime: nextExpTime,
      pausedTime: null,
      activeFollowUpId: null,
    },
  });
  return { expTime: nextExpTime };
}

async function evaluateCodeForQuestion(params: {
  roundSessionId: string;
  userId: string;
  questionId: string;
}): Promise<{ passedCount: number; totalCount: number; language: string; code: string; results: unknown }> {
  const testCases = await prisma.dsaTestCase.findMany({
    where: { questionId: params.questionId },
    select: { input: true, expected: true, isHidden: true, expectedType: true, timeoutMs: true },
  });
  const total = testCases.length;
  const drafts = await getLatestCodeDraftsForQuestion(params.roundSessionId, params.questionId, DSA_API_LANGUAGES);
  const draft = drafts.find((d) => d.code.trim().length > 0);
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

async function scoreSession(roundSessionId: string, questionIds: string[]): Promise<number> {
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

export async function autoFinalizeDsaSession(roundSessionId: string): Promise<AutoFinalizeResult> {
  const session = await prisma.dsaRoundSession.findUnique({ where: { id: roundSessionId } });
  if (!session) return { finalized: false, reason: "not_found" };

  const workspaceAttempt = await prisma.workspaceRoundAttempt.findUnique({
    where: { dsaRoundSessionId: roundSessionId },
    select: { id: true },
  });
  if (workspaceAttempt) {
    const result = await finalizeWorkspaceDsaSession(roundSessionId, "auto");
    if (result.finalized) return { finalized: true, score: result.score, passed: true };
    if (result.reason === "not_expired" && result.requeueAt) {
      return { finalized: false, reason: "not_expired", requeueAt: result.requeueAt };
    }
    if (result.reason === "not_found") return { finalized: false, reason: "not_found" };
    return { finalized: false, reason: "superseded" };
  }

  const latestSession = await prisma.dsaRoundSession.findFirst({
    where: { userId: session.userId },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: { id: true },
  });
  if (latestSession?.id !== session.id) return { finalized: false, reason: "superseded" };

  const existing = await prisma.dsaRoundResult.findFirst({
    where: { roundSessionId },
    select: { score: true },
  });
  if (existing) {
    const profile = await prisma.jobSeekerProfile.findUnique({
      where: { userId: session.userId },
      select: { experienceYears: true },
    });
    const cfg = dsaTierConfig(experienceTierFromYears(profile?.experienceYears));
    const score = existing.score ?? 0;
    return { finalized: true, score, passed: score >= cfg.passThresholdPercent };
  }

  const resume = await resumeExpiredFollowUpIfNeeded(session);
  if (resume.shouldWaitUntil) return { finalized: false, reason: "not_expired", requeueAt: resume.shouldWaitUntil };
  if (resume.expTime.getTime() > Date.now()) {
    return { finalized: false, reason: "not_expired", requeueAt: new Date(resume.expTime.getTime() + AUTO_FINALIZE_BUFFER_MS) };
  }

  await flushDsaSessionBuffers(session.id, session.questionIds, DSA_API_LANGUAGES);

  for (const questionId of session.questionIds) {
    const existingOfficial = await prisma.dsaSubmission.findFirst({
      where: { roundSessionId: session.id, questionId, isOfficial: true },
      select: { id: true },
    });
    if (existingOfficial) continue;

    const codeResult = await evaluateCodeForQuestion({
      roundSessionId: session.id,
      userId: session.userId,
      questionId,
    });
    const followUpAnswers = await getFollowUpAnswers(session.id, questionId);
    const followUp = await gradeDsaFollowUps({
      questionId,
      answers: followUpAnswers ?? {},
      allowIncomplete: true,
    });

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

  const profile = await prisma.jobSeekerProfile.findUnique({
    where: { userId: session.userId },
    select: { experienceYears: true },
  });
  const cfg = dsaTierConfig(experienceTierFromYears(profile?.experienceYears));
  const score = await scoreSession(session.id, session.questionIds);
  const passed = score >= cfg.passThresholdPercent;

  await prisma.dsaRoundResult.create({
    data: {
      userId: session.userId,
      roundSessionId: session.id,
      score,
      answers: { autoFinalized: true, reason: "expired", questionIds: session.questionIds },
      invalidated: false,
    },
  }).catch(async (err) => {
    const current = await prisma.dsaRoundResult.findFirst({ where: { roundSessionId: session.id }, select: { score: true } });
    if (current) return;
    throw err;
  });

  await prisma.verificationStage.upsert({
    where: { userId_stageName: { userId: session.userId, stageName: "dsa_round" } },
    create: { userId: session.userId, stageName: "dsa_round", status: passed ? "completed" : "failed", score },
    update: { status: passed ? "completed" : "failed", score },
  });

  await upsertSkillVerification(session.userId, "LIVE_CODING", score, new Date());
  await syncJobSeekerVerificationStatus(session.userId).catch((err) => {
    console.warn("[dsa-auto-finalize] syncJobSeekerVerificationStatus", err);
  });

  import("./performancePipeline.js").then(({ publishRunResult }) =>
    publishRunResult(session.userId, {
      module: "dsa",
      status: passed ? "completed" : "failed",
      score,
      pass: passed,
      signals: [{ competency: "LIVE_CODING" as const, score, pass: passed }],
    })
  ).catch((err) => console.warn("[pipeline/dsa-auto-finalize]", err));

  return { finalized: true, score, passed };
}
