import type { Prisma } from "@prisma/client";
import { prisma } from "../config/prisma.js";
import { createWorkspaceMcqQuestionSet, type AptitudeQuestionForClient } from "../data/aptitude-loader.js";
import { autoFinalizeMcqSession } from "./mcqAutoFinalize.service.js";
import { enqueueMcqAutoFinalize } from "./mcqSessionQueue.service.js";
import { syncWorkspaceLifecycle } from "./workspace.service.js";
import { assertWorkspaceRoundStartAllowed } from "./workspaceAttemptGuards.service.js";

export class McqSessionServiceError extends Error {
  constructor(
    message: string,
    public statusCode = 400,
  ) {
    super(message);
    this.name = "McqSessionServiceError";
  }
}

export type McqActor = {
  id: string;
  role: string;
};

export type StartWorkspaceMcqSessionInput = {
  workspaceCode: string;
  workspaceRoundId: string;
};

export type UpdateMcqSessionInput = {
  currentQuestionId?: string | null;
  answer?: {
    questionId: string;
    selectedOption: string;
  };
};

function normalizeWorkspaceCode(code: string): string {
  return code.trim().toUpperCase();
}

function asAnswerRecord(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out: Record<string, string> = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (typeof raw === "string") out[key] = raw;
  }
  return out;
}

function asQuestions(value: unknown): AptitudeQuestionForClient[] {
  return Array.isArray(value) ? (value as AptitudeQuestionForClient[]) : [];
}

function secondsRemaining(endTime: Date): number {
  return Math.max(0, Math.ceil((endTime.getTime() - Date.now()) / 1000));
}

async function maybeFinalizeBeforeSnapshot(sessionId: string): Promise<void> {
  const row = await prisma.mcqSession.findUnique({
    where: { id: sessionId },
    select: {
      status: true,
      endTime: true,
      workspaceRoundAttempt: {
        select: {
          workspace: { select: { status: true } },
        },
      },
    },
  });
  if (!row || row.status !== "active") return;
  if (row.endTime.getTime() <= Date.now() || row.workspaceRoundAttempt?.workspace.status === "archived") {
    await autoFinalizeMcqSession(sessionId, "auto");
  }
}

export async function getMcqSessionSnapshot(actor: McqActor, sessionId: string) {
  if (actor.role !== "jobseeker") throw new McqSessionServiceError("Job seeker access required.", 403);
  await maybeFinalizeBeforeSnapshot(sessionId);
  const session = await prisma.mcqSession.findFirst({
    where: { id: sessionId, userId: actor.id },
    include: {
      workspaceRoundAttempt: {
        include: {
          workspace: { select: { id: true, code: true, status: true, startAt: true, endAt: true } },
          workspaceRound: { select: { id: true, order: true, name: true, type: true, timeLimitMins: true, scoreWeightage: true } },
        },
      },
    },
  });
  if (!session) throw new McqSessionServiceError("MCQ session not found.", 404);
  return {
    session: {
      id: session.id,
      status: session.status,
      startTime: session.startTime.toISOString(),
      endTime: session.endTime.toISOString(),
      secondsRemaining: secondsRemaining(session.endTime),
      currentQuestionId: session.currentQuestionId,
      submittedAt: session.submittedAt?.toISOString() ?? null,
      finalizedAt: session.finalizedAt?.toISOString() ?? null,
      score: session.score,
      correctCount: session.correctCount,
      incorrectCount: session.incorrectCount,
      skippedCount: session.skippedCount,
    },
    questions: asQuestions(session.questions),
    answers: asAnswerRecord(session.answers),
    workspaceAttempt: session.workspaceRoundAttempt
      ? {
          id: session.workspaceRoundAttempt.id,
          status: session.workspaceRoundAttempt.status,
          score: session.workspaceRoundAttempt.score,
          percentageScore: session.workspaceRoundAttempt.percentageScore,
          weightedScore: session.workspaceRoundAttempt.weightedScore,
          completedAt: session.workspaceRoundAttempt.completedAt?.toISOString() ?? null,
          workspace: session.workspaceRoundAttempt.workspace,
          round: session.workspaceRoundAttempt.workspaceRound,
        }
      : null,
  };
}

export async function startWorkspaceMcqSession(actor: McqActor, input: StartWorkspaceMcqSessionInput) {
  if (actor.role !== "jobseeker") throw new McqSessionServiceError("Job seeker access required.", 403);
  const code = normalizeWorkspaceCode(input.workspaceCode);
  const workspaceRow = await prisma.workspace.findUnique({ where: { code }, select: { id: true } });
  if (workspaceRow) await syncWorkspaceLifecycle(workspaceRow.id);

  const created = await prisma.$transaction(async (tx) => {
    const allowed = await assertWorkspaceRoundStartAllowed(tx, actor, code, input.workspaceRoundId);
    if (allowed.round.type !== "mcq") throw new McqSessionServiceError("MCQ round not found.", 404);
    const workspace = await tx.workspace.findUnique({
      where: { id: allowed.workspace.id },
      include: {
        rounds: {
          where: { id: input.workspaceRoundId },
          include: { fixedQuestionSet: true },
        },
      },
    });
    if (!workspace) throw new McqSessionServiceError("Workspace not found.", 404);
    const round = workspace.rounds[0];
    if (!round || round.type !== "mcq") throw new McqSessionServiceError("MCQ round not found.", 404);
    const registration = allowed.registration;

    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`workspace_round_attempt:${registration.id}:${round.id}`}))`;

    const existing = await tx.workspaceRoundAttempt.findUnique({
      where: { workspaceRegistrationId_workspaceRoundId: { workspaceRegistrationId: registration.id, workspaceRoundId: round.id } },
      include: { mcqSession: true },
    });
    if (existing?.mcqSessionId) {
      if (existing.status === "discarded") throw new McqSessionServiceError("This round attempt is no longer available.", 409);
      return existing.mcqSessionId;
    }

    const activeSessions = await tx.mcqSession.findMany({
      where: {
        userId: actor.id,
        status: "active",
      },
      select: { id: true, workspaceRoundAttempt: { select: { id: true } } },
    });
    for (const activeSession of activeSessions) {
      await tx.mcqSession.update({
        where: { id: activeSession.id },
        data: { status: "discarded", finalizedAt: new Date() },
      });
      if (activeSession.workspaceRoundAttempt) {
        await tx.workspaceRoundAttempt.update({
          where: { id: activeSession.workspaceRoundAttempt.id },
          data: { status: "discarded", completedAt: new Date() },
        });
      }
    }

    const questionSet = round.questionType === "fixed" && round.fixedQuestionSet
      ? {
          questionIds: round.fixedQuestionSet.questionIds,
          questions: asQuestions(round.fixedQuestionSet.questions),
          answerKey: asAnswerRecord(round.fixedQuestionSet.answerKey),
        }
      : createWorkspaceMcqQuestionSet({
          easyCount: round.easyCount,
          mediumCount: round.mediumCount,
          hardCount: round.hardCount,
          allowPartial: process.env.STRICT_WORKSPACE_QUESTION_AVAILABILITY !== "true",
        });

    if (questionSet.questionIds.length === 0) {
      throw new McqSessionServiceError("No MCQ questions are available for this round.", 409);
    }

    const startTime = new Date();
    const endTime = new Date(startTime.getTime() + round.timeLimitMins * 60 * 1000);
    const mcqSession = await tx.mcqSession.create({
      data: {
        userId: actor.id,
        questionIds: questionSet.questionIds,
        questions: questionSet.questions as unknown as Prisma.InputJsonValue,
        answerKey: questionSet.answerKey as Prisma.InputJsonValue,
        currentQuestionId: questionSet.questionIds[0] ?? null,
        startTime,
        endTime,
      },
    });

    await tx.workspaceRoundAttempt.create({
      data: {
        workspaceId: workspace.id,
        workspaceRoundId: round.id,
        workspaceRegistrationId: registration.id,
        userId: actor.id,
        roundType: "mcq",
        mcqSessionId: mcqSession.id,
      },
    });

    return mcqSession.id;
  });

  const session = await prisma.mcqSession.findUnique({ where: { id: created }, select: { endTime: true } });
  if (session) await enqueueMcqAutoFinalize(created, session.endTime);
  return getMcqSessionSnapshot(actor, created);
}

export async function updateMcqSession(actor: McqActor, sessionId: string, input: UpdateMcqSessionInput) {
  if (actor.role !== "jobseeker") throw new McqSessionServiceError("Job seeker access required.", 403);
  const shouldFinalize = await prisma.mcqSession.findUnique({
    where: { id: sessionId },
    select: { endTime: true, status: true },
  });
  if (shouldFinalize?.status === "active" && shouldFinalize.endTime.getTime() <= Date.now()) {
    await autoFinalizeMcqSession(sessionId, "auto");
    throw new McqSessionServiceError("MCQ session has expired.", 410);
  }

  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`mcq_session:${sessionId}`}))`;
    const session = await tx.mcqSession.findUnique({
      where: { id: sessionId },
      include: {
        workspaceRoundAttempt: {
          include: {
            workspace: true,
            workspaceRegistration: true,
          },
        },
      },
    });
    if (!session || session.userId !== actor.id) throw new McqSessionServiceError("MCQ session not found.", 404);
    if (session.status !== "active") throw new McqSessionServiceError("MCQ session is already finalized.", 409);
    if (session.workspaceRoundAttempt?.workspaceRegistration.status === "removed") {
      throw new McqSessionServiceError("You were removed from this workspace.", 403);
    }
    if (session.workspaceRoundAttempt?.workspace.status === "archived" || session.workspaceRoundAttempt?.workspace.status === "ended") {
      throw new McqSessionServiceError("This workspace round is closed.", 409);
    }

    const questionIds = new Set(session.questionIds);
    const data: Prisma.McqSessionUpdateInput = {};
    if (input.currentQuestionId !== undefined) {
      if (input.currentQuestionId && !questionIds.has(input.currentQuestionId)) {
        throw new McqSessionServiceError("Question does not belong to this MCQ session.", 400);
      }
      data.currentQuestionId = input.currentQuestionId;
    }
    if (input.answer) {
      if (!questionIds.has(input.answer.questionId)) {
        throw new McqSessionServiceError("Question does not belong to this MCQ session.", 400);
      }
      const answers = asAnswerRecord(session.answers);
      answers[input.answer.questionId] = input.answer.selectedOption;
      data.answers = answers as Prisma.InputJsonValue;
    }

    if (Object.keys(data).length > 0) {
      await tx.mcqSession.update({ where: { id: session.id }, data });
    }
  });

  return getMcqSessionSnapshot(actor, sessionId);
}

export async function submitMcqSession(actor: McqActor, sessionId: string, finalAnswer?: UpdateMcqSessionInput["answer"]) {
  if (finalAnswer) {
    await updateMcqSession(actor, sessionId, { answer: finalAnswer });
  }
  const session = await prisma.mcqSession.findFirst({
    where: { id: sessionId, userId: actor.id },
    include: {
      workspaceRoundAttempt: {
        include: {
          workspace: true,
          workspaceRegistration: true,
        },
      },
    },
  });
  if (!session) throw new McqSessionServiceError("MCQ session not found.", 404);
  if (session.workspaceRoundAttempt?.workspaceRegistration.status === "removed") {
    throw new McqSessionServiceError("You were removed from this workspace.", 403);
  }
  if (session.workspaceRoundAttempt?.workspace.status === "archived") {
    await autoFinalizeMcqSession(sessionId, "auto");
    return getMcqSessionSnapshot(actor, sessionId);
  }
  await autoFinalizeMcqSession(sessionId, "manual");
  return getMcqSessionSnapshot(actor, sessionId);
}
