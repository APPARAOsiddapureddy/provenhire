import type { DsaRoundSession, Prisma } from "@prisma/client";
import { prisma } from "../config/prisma.js";
import { DSA_API_LANGUAGES, type DsaApiLanguage } from "../constants/dsa.js";
import { evaluateDsaAgainstTestCases, persistDsaSubmission } from "./dsaEvaluation.js";
import { bufferCodeDraft, bufferFollowUpAnswers, bufferSessionState, getFollowUpAnswers } from "./dsaDraftBuffer.service.js";
import { getPublicDsaFollowUps, gradeAndPersistDsaFollowUps } from "./dsaFollowUps.service.js";
import { getDsaSessionSnapshot, assertQuestionInSession, DSA_FOLLOW_UP_MINUTES } from "./dsaSession.service.js";
import { enqueueDsaAutoFinalize } from "./dsaSessionQueue.service.js";
import { WorkspaceServiceError, syncWorkspaceLifecycle } from "./workspace.service.js";
import {
  assertWorkspaceRoundStartAllowed,
  assertWorkspaceSessionWritable,
  normalizeWorkspaceCode,
  type WorkspaceAttemptActor,
} from "./workspaceAttemptGuards.service.js";
import { finalizeWorkspaceDsaSession } from "./workspaceDsaFinalize.service.js";

export class WorkspaceDsaSessionServiceError extends WorkspaceServiceError {}

type StartWorkspaceDsaSessionInput = {
  workspaceCode: string;
  workspaceRoundId: string;
};

function shuffle<T>(items: T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

const MIN_PREFERRED_DSA_TEST_CASES = 6;

function prioritizeAuditableQuestions<T extends { _count: { testCases: number } }>(
  rows: T[],
): T[] {
  const preferred = shuffle(
    rows.filter((row) => row._count.testCases >= MIN_PREFERRED_DSA_TEST_CASES),
  );
  const fallback = shuffle(
    rows.filter((row) => row._count.testCases < MIN_PREFERRED_DSA_TEST_CASES),
  );
  return [...preferred, ...fallback];
}

/**
 * Must match `DsaQuestion.difficulty` exactly — selection is a literal string match, so a
 * casing drift here silently yields zero questions and falls through to filler.
 */
export const DSA_DIFFICULTY = {
  VERY_EASY: "Very Easy",
  EASY: "Easy",
  MEDIUM: "Medium",
  HARD: "Hard",
} as const;

async function selectDsaQuestions(
  tx: Prisma.TransactionClient,
  round: {
    veryEasyCount?: number;
    easyCount: number;
    mediumCount: number;
    hardCount: number;
    questionCount: number;
  },
) {
  const strict = process.env.STRICT_WORKSPACE_QUESTION_AVAILABILITY === "true";
  const selected: Array<{ id: string }> = [];
  const used = new Set<string>();
  const pick = async (difficulty: string, count: number) => {
    if (count <= 0) return;
    const rows = await tx.dsaQuestion.findMany({
      where: { difficulty, id: { notIn: Array.from(used) } },
      select: { id: true, _count: { select: { testCases: true } } },
    });
    const picked = prioritizeAuditableQuestions(rows).slice(0, count);
    picked.forEach((row) => {
      selected.push(row);
      used.add(row.id);
    });
    if (strict && picked.length < count) {
      throw new WorkspaceServiceError(`Not enough ${difficulty} DSA questions for this round.`, 409);
    }
  };

  await pick(DSA_DIFFICULTY.VERY_EASY, round.veryEasyCount ?? 0);
  await pick(DSA_DIFFICULTY.EASY, round.easyCount);
  await pick(DSA_DIFFICULTY.MEDIUM, round.mediumCount);
  await pick(DSA_DIFFICULTY.HARD, round.hardCount);
  if (selected.length < round.questionCount) {
    const fillers = await tx.dsaQuestion.findMany({
      where: { id: { notIn: Array.from(used) } },
      select: { id: true, _count: { select: { testCases: true } } },
    });
    for (const row of prioritizeAuditableQuestions(fillers)) {
      selected.push(row);
      used.add(row.id);
      if (selected.length >= round.questionCount) break;
    }
  }
  return selected.slice(0, round.questionCount).map((row) => row.id);
}

function secondsRemaining(session: Pick<DsaRoundSession, "expTime" | "pausedTime">): number {
  const reference = session.pausedTime ? session.pausedTime.getTime() : Date.now();
  return Math.max(0, Math.ceil((session.expTime.getTime() - reference) / 1000));
}

async function assertWorkspaceDsaSession(actor: WorkspaceAttemptActor, sessionId: string) {
  if (actor.role !== "jobseeker") throw new WorkspaceServiceError("Job seeker access required.", 403);
  const session = await prisma.dsaRoundSession.findFirst({ where: { id: sessionId, userId: actor.id } });
  if (!session) throw new WorkspaceServiceError("DSA session not found.", 404);
  const attempt = await prisma.workspaceRoundAttempt.findUnique({
    where: { dsaRoundSessionId: session.id },
    include: {
      workspace: true,
      workspaceRound: true,
      workspaceRegistration: true,
    },
  });
  if (!attempt) throw new WorkspaceServiceError("Workspace DSA attempt not found.", 404);
  if (attempt.workspaceRegistration.status !== "registered") {
    throw new WorkspaceServiceError("You were removed from this workspace.", 403);
  }
  return { session, attempt };
}

async function maybeFinalizeBeforeSnapshot(sessionId: string) {
  const linked = await prisma.workspaceRoundAttempt.findUnique({
    where: { dsaRoundSessionId: sessionId },
    include: { workspace: true, dsaRoundSession: true },
  });
  if (!linked?.dsaRoundSession || linked.status !== "active") return;
  if (linked.workspace.status === "archived" || linked.dsaRoundSession.expTime.getTime() <= Date.now()) {
    await finalizeWorkspaceDsaSession(sessionId, "auto");
  }
}

export async function startWorkspaceDsaSession(actor: WorkspaceAttemptActor, input: StartWorkspaceDsaSessionInput) {
  const code = normalizeWorkspaceCode(input.workspaceCode);
  const workspaceRow = await prisma.workspace.findUnique({ where: { code }, select: { id: true } });
  if (workspaceRow) await syncWorkspaceLifecycle(workspaceRow.id);

  const sessionId = await prisma.$transaction(async (tx) => {
    const { workspace, round, registration } = await assertWorkspaceRoundStartAllowed(tx, actor, code, input.workspaceRoundId);
    if (round.type !== "coding") throw new WorkspaceServiceError("Coding round not found.", 404);
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`workspace_round_attempt:${registration.id}:${round.id}`}))`;

    const existing = await tx.workspaceRoundAttempt.findUnique({
      where: { workspaceRegistrationId_workspaceRoundId: { workspaceRegistrationId: registration.id, workspaceRoundId: round.id } },
      include: { dsaRoundSession: true },
    });
    if (existing?.dsaRoundSessionId) {
      if (existing.status === "discarded") throw new WorkspaceServiceError("This round attempt is no longer available.", 409);
      return existing.dsaRoundSessionId;
    }

    const activeDsaAttempts = await tx.workspaceRoundAttempt.findMany({
      where: { userId: actor.id, status: "active", dsaRoundSessionId: { not: null } },
      select: { id: true },
    });
    for (const active of activeDsaAttempts) {
      await tx.workspaceRoundAttempt.update({
        where: { id: active.id },
        data: { status: "discarded", completedAt: new Date() },
      });
    }

    const questionIds = await selectDsaQuestions(tx, round);
    if (questionIds.length === 0) throw new WorkspaceServiceError("No DSA questions are available for this round.", 409);
    const startTime = new Date();
    const expTime = new Date(startTime.getTime() + round.timeLimitMins * 60 * 1000);
    const dsaSession = await tx.dsaRoundSession.create({
      data: {
        userId: actor.id,
        questionIds,
        startTime,
        expTime,
        activeQId: questionIds[0] ?? null,
      },
    });

    await tx.workspaceRoundAttempt.create({
      data: {
        workspaceId: workspace.id,
        workspaceRoundId: round.id,
        workspaceRegistrationId: registration.id,
        userId: actor.id,
        roundType: "coding",
        dsaRoundSessionId: dsaSession.id,
      },
    });

    return dsaSession.id;
  });

  const session = await prisma.dsaRoundSession.findUnique({ where: { id: sessionId }, select: { expTime: true } });
  if (session) await enqueueDsaAutoFinalize(sessionId, session.expTime);
  return getWorkspaceDsaSessionSnapshot(actor, sessionId);
}

export async function getWorkspaceDsaSessionSnapshot(actor: WorkspaceAttemptActor, sessionId: string) {
  await maybeFinalizeBeforeSnapshot(sessionId);
  const { session, attempt } = await assertWorkspaceDsaSession(actor, sessionId);
  const snapshot = await getDsaSessionSnapshot(session);
  return {
    ...snapshot,
    session: {
      ...snapshot.session,
      secondsRemaining: secondsRemaining(session),
      expired: !session.pausedTime && session.expTime.getTime() <= Date.now(),
    },
    timeLimitMinutes: attempt.workspaceRound.timeLimitMins,
    workspaceAttempt: {
      id: attempt.id,
      status: attempt.status,
      score: attempt.score,
      percentageScore: attempt.percentageScore,
      weightedScore: attempt.weightedScore,
      completedAt: attempt.completedAt?.toISOString() ?? null,
      workspace: {
        id: attempt.workspace.id,
        code: attempt.workspace.code,
        status: attempt.workspace.status,
        startAt: attempt.workspace.startAt,
        endAt: attempt.workspace.endAt,
      },
      round: {
        id: attempt.workspaceRound.id,
        order: attempt.workspaceRound.order,
        name: attempt.workspaceRound.name,
        type: attempt.workspaceRound.type,
        timeLimitMins: attempt.workspaceRound.timeLimitMins,
        scoreWeightage: attempt.workspaceRound.scoreWeightage,
      },
    },
  };
}

export async function updateWorkspaceDsaSession(actor: WorkspaceAttemptActor, sessionId: string, input: { activeQId?: string | null }) {
  const { session } = await assertWorkspaceDsaSession(actor, sessionId);
  if (input.activeQId) assertQuestionInSession(session, input.activeQId);
  await prisma.$transaction(async (tx) => {
    await assertWorkspaceSessionWritable(tx, { actor, dsaRoundSessionId: sessionId });
    await bufferSessionState({
      roundSessionId: session.id,
      userId: actor.id,
      activeQId: input.activeQId ?? session.activeQId,
    });
  });
  return { ok: true };
}

export async function saveWorkspaceDsaCodeDraft(
  actor: WorkspaceAttemptActor,
  sessionId: string,
  input: { questionId: string; language: string; code: string },
) {
  const { session } = await assertWorkspaceDsaSession(actor, sessionId);
  assertQuestionInSession(session, input.questionId);
  if (!session.pausedTime && session.expTime.getTime() <= Date.now()) {
    await finalizeWorkspaceDsaSession(sessionId, "auto");
    throw new WorkspaceServiceError("DSA session has expired.", 410);
  }
  await prisma.$transaction(async (tx) => {
    await assertWorkspaceSessionWritable(tx, { actor, dsaRoundSessionId: sessionId });
    await bufferCodeDraft({
      roundSessionId: session.id,
      userId: actor.id,
      questionId: input.questionId,
      language: input.language,
      code: input.code,
    });
  });
  return { ok: true };
}

export async function runWorkspaceDsaTests(
  actor: WorkspaceAttemptActor,
  sessionId: string,
  input: { questionId: string; language: string; code: string },
) {
  const { session } = await assertWorkspaceDsaSession(actor, sessionId);
  assertQuestionInSession(session, input.questionId);
  await saveWorkspaceDsaCodeDraft(actor, sessionId, input);

  const testCases = await prisma.dsaTestCase.findMany({
    where: { questionId: input.questionId },
    select: { input: true, expected: true, isHidden: true, expectedType: true, timeoutMs: true },
  });
  if (testCases.length === 0) throw new WorkspaceServiceError("Question not found or has no test cases.", 404);
  const payload = await evaluateDsaAgainstTestCases(testCases, input.code, input.language as DsaApiLanguage);
  await persistDsaSubmission(prisma, {
    userId: actor.id,
    roundSessionId: session.id,
    questionId: input.questionId,
    language: input.language,
    code: input.code,
    passedCount: payload.passed,
    totalCount: payload.total,
    isOfficial: false,
    results: payload.results,
  });
  return payload;
}

export async function submitWorkspaceDsaQuestion(
  actor: WorkspaceAttemptActor,
  sessionId: string,
  input: { questionId: string; language: string; code: string },
) {
  const { session } = await assertWorkspaceDsaSession(actor, sessionId);
  assertQuestionInSession(session, input.questionId);
  await saveWorkspaceDsaCodeDraft(actor, sessionId, input);

  const existingOfficial = await prisma.dsaSubmission.findFirst({
    where: { userId: actor.id, roundSessionId: session.id, questionId: input.questionId, isOfficial: true },
    select: { id: true },
  });
  if (existingOfficial) throw new WorkspaceServiceError("You have already submitted this question.", 409);

  const testCases = await prisma.dsaTestCase.findMany({
    where: { questionId: input.questionId },
    select: { input: true, expected: true, isHidden: true, expectedType: true, timeoutMs: true },
  });
  if (testCases.length === 0) throw new WorkspaceServiceError("Question not found or has no test cases.", 404);
  const payload = await evaluateDsaAgainstTestCases(testCases, input.code, input.language as DsaApiLanguage);

  const created = await prisma.$transaction(async (tx) => {
    await assertWorkspaceSessionWritable(tx, { actor, dsaRoundSessionId: sessionId });
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`dsa_submit:${actor.id}:${session.id}:${input.questionId}`}))`;
    const existing = await tx.dsaSubmission.findFirst({
      where: { userId: actor.id, roundSessionId: session.id, questionId: input.questionId, isOfficial: true },
      select: { id: true },
    });
    if (existing) return false;
    await persistDsaSubmission(tx, {
      userId: actor.id,
      roundSessionId: session.id,
      questionId: input.questionId,
      language: input.language,
      code: input.code,
      passedCount: payload.passed,
      totalCount: payload.total,
      isOfficial: true,
      results: payload.results,
    });
    return true;
  });
  if (!created) throw new WorkspaceServiceError("You have already submitted this question.", 409);
  return { ...payload, submitted: true };
}

export async function startWorkspaceDsaFollowUp(actor: WorkspaceAttemptActor, sessionId: string, questionId: string) {
  const { session } = await assertWorkspaceDsaSession(actor, sessionId);
  assertQuestionInSession(session, questionId);
  if (!session.pausedTime && session.expTime.getTime() <= Date.now()) {
    await finalizeWorkspaceDsaSession(sessionId, "auto");
    throw new WorkspaceServiceError("DSA session has expired.", 410);
  }

  const followUp = await prisma.$transaction(async (tx) => {
    await assertWorkspaceSessionWritable(tx, { actor, dsaRoundSessionId: sessionId });
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`dsa_followup:${session.id}`}))`;
    const official = await tx.dsaSubmission.findFirst({
      where: { userId: actor.id, roundSessionId: session.id, questionId, isOfficial: true },
      select: { id: true },
    });
    if (!official) throw new WorkspaceServiceError("Submit the coding solution before answering follow-up questions.", 409);
    const activeExisting = session.activeFollowUpId
      ? await tx.dsaFollowUpSession.findUnique({ where: { id: session.activeFollowUpId } })
      : null;
    const row = activeExisting && activeExisting.questionId !== questionId
      ? activeExisting
      : await tx.dsaFollowUpSession.upsert({
          where: { roundSessionId_questionId: { roundSessionId: session.id, questionId } },
          create: {
            roundSessionId: session.id,
            userId: actor.id,
            questionId,
            expTime: new Date(Date.now() + DSA_FOLLOW_UP_MINUTES * 60 * 1000),
          },
          update: {},
        });
    await tx.dsaRoundSession.update({
      where: { id: session.id },
      data: {
        pausedTime: session.pausedTime ?? new Date(),
        activeFollowUpId: row.id,
      },
    });
    return row;
  });

  return {
    id: followUp.id,
    questionId: followUp.questionId,
    expTime: followUp.expTime.toISOString(),
    secondsRemaining: Math.max(0, Math.ceil((followUp.expTime.getTime() - Date.now()) / 1000)),
    answers: (await getFollowUpAnswers(session.id, followUp.questionId)) ?? {},
    followUps: await getPublicDsaFollowUps(followUp.questionId),
  };
}

export async function saveWorkspaceDsaFollowUpAnswers(
  actor: WorkspaceAttemptActor,
  sessionId: string,
  questionId: string,
  answers: Record<string, string>,
) {
  const { session } = await assertWorkspaceDsaSession(actor, sessionId);
  assertQuestionInSession(session, questionId);
  await prisma.$transaction(async (tx) => {
    await assertWorkspaceSessionWritable(tx, { actor, dsaRoundSessionId: sessionId });
    const followUp = await tx.dsaFollowUpSession.findUnique({
      where: { roundSessionId_questionId: { roundSessionId: session.id, questionId } },
      select: { id: true },
    });
    if (!followUp) throw new WorkspaceServiceError("Follow-up session has not started.", 404);
    await bufferFollowUpAnswers({ roundSessionId: session.id, userId: actor.id, questionId, answers });
  });
  return { ok: true };
}

export async function submitWorkspaceDsaFollowUpAnswers(
  actor: WorkspaceAttemptActor,
  sessionId: string,
  questionId: string,
  answers: Record<string, string>,
  timedOut = false,
) {
  const { session } = await assertWorkspaceDsaSession(actor, sessionId);
  assertQuestionInSession(session, questionId);

  return prisma.$transaction(async (tx) => {
    await assertWorkspaceSessionWritable(tx, { actor, dsaRoundSessionId: sessionId });
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`dsa_followup:${session.id}`}))`;
    const followUp = await tx.dsaFollowUpSession.findUnique({
      where: { roundSessionId_questionId: { roundSessionId: session.id, questionId } },
    });
    if (!followUp) throw new WorkspaceServiceError("Follow-up session has not started.", 404);
    await tx.dsaFollowUpSession.update({
      where: { id: followUp.id },
      data: { answers, pausedTime: timedOut ? followUp.expTime : null },
    });
    const result = await gradeAndPersistDsaFollowUps({
      userId: actor.id,
      roundSessionId: session.id,
      questionId,
      answers,
      allowIncomplete: timedOut,
      db: tx,
    });
    const freshSession = await tx.dsaRoundSession.findUnique({ where: { id: session.id } });
    if (freshSession?.pausedTime) {
      const pauseEnd = timedOut && followUp.expTime.getTime() < Date.now() ? followUp.expTime : new Date();
      const pausedMs = Math.max(0, pauseEnd.getTime() - freshSession.pausedTime.getTime());
      await tx.dsaRoundSession.update({
        where: { id: session.id },
        data: {
          expTime: new Date(freshSession.expTime.getTime() + pausedMs),
          pausedTime: null,
          activeFollowUpId: null,
        },
      });
    }
    return { questionId, ...result };
  });
}

export async function submitWorkspaceDsaSession(actor: WorkspaceAttemptActor, sessionId: string) {
  const { session } = await assertWorkspaceDsaSession(actor, sessionId);
  await prisma.$transaction(async (tx) => {
    await assertWorkspaceSessionWritable(tx, { actor, dsaRoundSessionId: sessionId });
  });
  const official = await prisma.dsaSubmission.findMany({
    where: { userId: actor.id, roundSessionId: session.id, isOfficial: true },
    select: { questionId: true, followUpScore: true },
  });
  const submittedIds = new Set(official.map((row) => row.questionId));
  const missingOfficial = session.questionIds.filter((questionId) => !submittedIds.has(questionId));
  if (missingOfficial.length > 0) {
    throw new WorkspaceServiceError("Submit official solutions for every DSA problem before finishing the round.", 400);
  }
  const missingFollowUps = official.filter((row) => row.followUpScore == null).map((row) => row.questionId);
  if (missingFollowUps.length > 0) {
    throw new WorkspaceServiceError("Answer follow-up questions for every submitted DSA problem before finishing the round.", 400);
  }

  await finalizeWorkspaceDsaSession(sessionId, "manual");
  return getWorkspaceDsaSessionSnapshot(actor, sessionId);
}
