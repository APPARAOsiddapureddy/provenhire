import { Prisma } from "@prisma/client";
import { prisma } from "../config/prisma.js";
import { evaluateSqlTask, zeroSqlPayload, type WorkspaceSqlRunResultPayload, type WorkspaceSqlTask } from "./workspaceSqlEvaluation.service.js";

export type WorkspaceSqlFinalizeResult =
  | { finalized: true; sessionId: string; status: "completed" | "auto_completed"; score: number; percentageScore: number; weightedScore: number }
  | { finalized: false; sessionId?: string; reason: "not_found" | "discarded" | "not_workspace" | "not_expired"; requeueAt?: Date };

function asTaskList(value: unknown): WorkspaceSqlTask[] {
  if (!Array.isArray(value)) return [];
  return value.filter((task): task is WorkspaceSqlTask => {
    const candidate = task as Partial<WorkspaceSqlTask>;
    return typeof candidate.id === "string" && typeof candidate.title === "string" && Array.isArray(candidate.testCases);
  });
}

function asDrafts(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out: Record<string, string> = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (typeof raw === "string") out[key] = raw;
  }
  return out;
}

function isUniqueConstraintError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

function scoreFromPayload(payload: WorkspaceSqlRunResultPayload): number {
  return payload.total > 0 ? Math.round((payload.passed / payload.total) * 100) : 0;
}

async function createAutoOfficialSubmission(params: {
  sessionId: string;
  userId: string;
  task: WorkspaceSqlTask;
  query: string;
}) {
  const query = params.query.trim();
  const payload = query
    ? await evaluateSqlTask(params.task, query).catch((err) =>
        zeroSqlPayload(params.task.testCases, err instanceof Error ? err.message : "SQL execution failed."),
      )
    : zeroSqlPayload(params.task.testCases, "No saved SQL query was submitted before time expired.");
  try {
    await prisma.workspaceSqlSubmission.create({
      data: {
        sessionId: params.sessionId,
        userId: params.userId,
        taskId: params.task.id,
        query,
        passedCount: payload.passed,
        totalCount: payload.total,
        score: scoreFromPayload(payload),
        isOfficial: true,
        results: payload.results as object,
      },
    });
  } catch (error) {
    if (isUniqueConstraintError(error)) return;
    throw error;
  }
}

async function scoreSqlSession(sessionId: string, taskIds: string[]) {
  const rows = await prisma.workspaceSqlSubmission.findMany({
    where: { sessionId, isOfficial: true },
    orderBy: { submittedAt: "desc" },
    select: { taskId: true, score: true, passedCount: true, totalCount: true },
  });
  const byTask = new Map<string, (typeof rows)[number]>();
  for (const row of rows) {
    if (!byTask.has(row.taskId)) byTask.set(row.taskId, row);
  }

  let scoreSum = 0;
  let passedCount = 0;
  let totalCount = 0;
  for (const taskId of taskIds) {
    const row = byTask.get(taskId);
    if (!row) continue;
    scoreSum += row.score;
    passedCount += row.passedCount;
    totalCount += row.totalCount;
  }
  const score = taskIds.length > 0 ? Math.round(scoreSum / taskIds.length) : 0;
  return { score, passedCount, totalCount };
}

export async function finalizeWorkspaceSqlSession(
  sqlSessionId: string,
  mode: "manual" | "auto" = "auto",
  options: { force?: boolean } = {},
): Promise<WorkspaceSqlFinalizeResult> {
  const session = await prisma.workspaceSqlSession.findUnique({ where: { id: sqlSessionId } });
  if (!session) return { finalized: false, reason: "not_found" };

  const attempt = await prisma.workspaceRoundAttempt.findUnique({
    where: { sqlSessionId },
    include: {
      workspaceRound: true,
      workspaceRegistration: true,
    },
  });
  if (!attempt) return { finalized: false, sessionId: sqlSessionId, reason: "not_workspace" };

  if (attempt.status === "completed" || attempt.status === "auto_completed") {
    return {
      finalized: true,
      sessionId,
      status: attempt.status,
      score: attempt.score ?? 0,
      percentageScore: attempt.percentageScore ?? 0,
      weightedScore: attempt.weightedScore ?? 0,
    };
  }

  if (session.status === "discarded" || attempt.status === "discarded" || attempt.workspaceRegistration.status === "removed") {
    await prisma.$transaction(async (tx) => {
      await tx.workspaceSqlSession.updateMany({
        where: { id: session.id, status: "active" },
        data: { status: "discarded", finalizedAt: new Date() },
      });
      await tx.workspaceRoundAttempt.updateMany({
        where: { id: attempt.id, status: "active" },
        data: { status: "discarded", completedAt: new Date() },
      });
    });
    return { finalized: false, sessionId, reason: "discarded" };
  }

  if (mode === "auto" && !options.force && session.endTime.getTime() > Date.now()) {
    return { finalized: false, sessionId, reason: "not_expired", requeueAt: session.endTime };
  }

  const taskIds = session.taskIds;
  const tasks = asTaskList(session.tasks);
  const drafts = asDrafts(session.drafts);

  if (mode === "auto") {
    for (const task of tasks) {
      const existingOfficial = await prisma.workspaceSqlSubmission.findFirst({
        where: { sessionId: session.id, taskId: task.id, isOfficial: true },
        select: { id: true },
      });
      if (existingOfficial) continue;
      await createAutoOfficialSubmission({
        sessionId: session.id,
        userId: session.userId,
        task,
        query: drafts[task.id] ?? "",
      });
    }
  }

  const { score, passedCount, totalCount } = await scoreSqlSession(session.id, taskIds);
  const weightedScore = Math.round((score * attempt.workspaceRound.scoreWeightage) / 100);
  const status = mode === "manual" ? "completed" : "auto_completed";
  const sessionStatus = mode === "manual" ? "submitted" : "auto_submitted";
  const now = new Date();

  const updated = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`sql_session:${session.id}`}))`;
    await tx.workspaceSqlSession.updateMany({
      where: { id: session.id, status: "active" },
      data: {
        status: sessionStatus,
        submittedAt: mode === "manual" ? now : (session.submittedAt ?? now),
        finalizedAt: now,
        score,
        passedCount,
        totalCount,
      },
    });
    return tx.workspaceRoundAttempt.updateMany({
      where: { id: attempt.id, status: "active" },
      data: {
        status,
        score,
        percentageScore: score,
        weightedScore,
        completedAt: now,
      },
    });
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

export async function discardActiveWorkspaceRegistrationSqlAttempts(workspaceId: string, userId: string): Promise<void> {
  const attempts = await prisma.workspaceRoundAttempt.findMany({
    where: {
      workspaceId,
      userId,
      status: "active",
      sqlSessionId: { not: null },
    },
    select: { id: true, sqlSessionId: true },
  });
  for (const attempt of attempts) {
    if (!attempt.sqlSessionId) continue;
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`sql_session:${attempt.sqlSessionId}`}))`;
      await tx.workspaceSqlSession.updateMany({
        where: { id: attempt.sqlSessionId, status: "active" },
        data: { status: "discarded", finalizedAt: new Date() },
      });
      await tx.workspaceRoundAttempt.updateMany({
        where: { id: attempt.id, status: "active" },
        data: { status: "discarded", completedAt: new Date() },
      });
    });
  }
}

export async function finalizeActiveWorkspaceSqlAttempts(workspaceId: string): Promise<void> {
  const attempts = await prisma.workspaceRoundAttempt.findMany({
    where: {
      workspaceId,
      status: "active",
      sqlSessionId: { not: null },
    },
    select: { sqlSessionId: true },
  });
  for (const attempt of attempts) {
    if (attempt.sqlSessionId) await finalizeWorkspaceSqlSession(attempt.sqlSessionId, "auto", { force: true });
  }
}