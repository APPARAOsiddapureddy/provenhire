import { Prisma, type WorkspaceSqlSession } from "@prisma/client";
import { prisma } from "../config/prisma.js";
import { WorkspaceServiceError, syncWorkspaceLifecycle } from "./workspace.service.js";
import {
  assertWorkspaceRoundStartAllowed,
  assertWorkspaceSessionWritable,
  normalizeWorkspaceCode,
  type WorkspaceAttemptActor,
} from "./workspaceAttemptGuards.service.js";
import {
  SQL_QUERY_MAX_CHARS,
  evaluateSqlTask,
  normalizeAndValidateSqlQuery,
  type WorkspaceSqlRunResultPayload,
  type WorkspaceSqlTask,
  type WorkspaceSqlTestCase,
} from "./workspaceSqlEvaluation.service.js";
import { finalizeWorkspaceSqlSession } from "./workspaceSqlFinalize.service.js";
import { enqueueSqlAutoFinalize } from "./workspaceSqlSessionQueue.service.js";

export class WorkspaceSqlSessionServiceError extends WorkspaceServiceError {}

type StartWorkspaceSqlSessionInput = {
  workspaceCode: string;
  workspaceRoundId: string;
};

type DataRoundTaskWithCases = {
  id: string;
  title: string;
  description: string;
  taskType: string;
  difficulty: string;
  subtrack: string | null;
  sqlSchema: string | null;
  starterCode: unknown;
  testCases: Array<{
    input: string;
    expected: string;
    isHidden: boolean;
    expectedType: string;
    timeoutMs: number | null;
  }>;
};

function shuffle<T>(items: T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

function difficultyName(value: "Easy" | "Medium" | "Hard") {
  return value;
}

function taskSnapshot(task: DataRoundTaskWithCases): WorkspaceSqlTask {
  return {
    id: task.id,
    title: task.title,
    description: task.description,
    difficulty: task.difficulty,
    sqlSchema: task.sqlSchema,
    starterCode: task.starterCode,
    testCases: task.testCases.map((tc): WorkspaceSqlTestCase => ({
      input: tc.input ?? "",
      expected: tc.expected ?? "",
      isHidden: tc.isHidden,
      expectedType: tc.expectedType || "exact",
      timeoutMs: tc.timeoutMs,
    })),
  };
}

function asTasks(value: unknown): WorkspaceSqlTask[] {
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

function starterSql(task: WorkspaceSqlTask): string {
  const starter = task.starterCode;
  if (starter && typeof starter === "object" && !Array.isArray(starter)) {
    const sql = (starter as Record<string, unknown>).sql;
    if (typeof sql === "string") return sql;
  }
  return "-- Write your SQL query below\nSELECT ";
}

function publicTask(task: WorkspaceSqlTask) {
  return {
    id: task.id,
    title: task.title,
    description: task.description,
    difficulty: task.difficulty,
    sqlSchema: task.sqlSchema ?? "",
    starterCode: task.starterCode,
    testCases: task.testCases
      .filter((tc) => !tc.isHidden)
      .map((tc) => ({ input: tc.input, expected: tc.expected, expectedType: tc.expectedType })),
  };
}

function secondsRemaining(session: Pick<WorkspaceSqlSession, "endTime">): number {
  return Math.max(0, Math.ceil((session.endTime.getTime() - Date.now()) / 1000));
}

async function selectSqlTasks(
  tx: Prisma.TransactionClient,
  round: { easyCount: number; mediumCount: number; hardCount: number; questionCount: number },
): Promise<WorkspaceSqlTask[]> {
  const strict = process.env.STRICT_WORKSPACE_QUESTION_AVAILABILITY === "true";
  const allTasks = await tx.dataRoundTask.findMany({
    where: {
      taskType: "sql",
      AND: [
        { testCases: { some: { isHidden: false } } },
        { testCases: { some: { isHidden: true } } },
      ],
    },
    include: { testCases: true },
  }) as DataRoundTaskWithCases[];
  const selected: DataRoundTaskWithCases[] = [];
  const used = new Set<string>();
  const pick = (difficulty: "Easy" | "Medium" | "Hard", count: number) => {
    if (count <= 0) return;
    const pool = allTasks.filter((task) => task.difficulty === difficultyName(difficulty) && !used.has(task.id));
    const picked = shuffle(pool).slice(0, count);
    picked.forEach((task) => {
      selected.push(task);
      used.add(task.id);
    });
    if (strict && picked.length < count) {
      throw new WorkspaceServiceError(`Not enough ${difficulty} SQL tasks for this round.`, 409);
    }
  };

  pick("Easy", round.easyCount);
  pick("Medium", round.mediumCount);
  pick("Hard", round.hardCount);

  if (selected.length < round.questionCount) {
    const fillers = shuffle(allTasks.filter((task) => !used.has(task.id)));
    for (const task of fillers) {
      selected.push(task);
      used.add(task.id);
      if (selected.length >= round.questionCount) break;
    }
  }

  return selected.slice(0, round.questionCount).map(taskSnapshot);
}

async function assertWorkspaceSqlSession(actor: WorkspaceAttemptActor, sessionId: string) {
  if (actor.role !== "jobseeker") throw new WorkspaceSqlSessionServiceError("Job seeker access required.", 403);
  const session = await prisma.workspaceSqlSession.findFirst({ where: { id: sessionId, userId: actor.id } });
  if (!session) throw new WorkspaceSqlSessionServiceError("SQL session not found.", 404);
  const attempt = await prisma.workspaceRoundAttempt.findUnique({
    where: { sqlSessionId: session.id },
    include: {
      workspace: true,
      workspaceRound: true,
      workspaceRegistration: true,
    },
  });
  if (!attempt) throw new WorkspaceSqlSessionServiceError("Workspace SQL attempt not found.", 404);
  if (attempt.workspaceRegistration.status !== "registered") {
    throw new WorkspaceSqlSessionServiceError("You were removed from this workspace.", 403);
  }
  return { session, attempt };
}

async function maybeFinalizeBeforeSnapshot(sessionId: string) {
  const linked = await prisma.workspaceRoundAttempt.findUnique({
    where: { sqlSessionId: sessionId },
    include: { workspace: true, sqlSession: true },
  });
  if (!linked?.sqlSession || linked.status !== "active" || linked.sqlSession.status !== "active") return;
  if (["archived", "ended"].includes(linked.workspace.status) || linked.sqlSession.endTime.getTime() <= Date.now()) {
    await finalizeWorkspaceSqlSession(sessionId, "auto", { force: ["archived", "ended"].includes(linked.workspace.status) });
  }
}

function assertTaskInSession(session: WorkspaceSqlSession, taskId: string) {
  if (!session.taskIds.includes(taskId)) throw new WorkspaceSqlSessionServiceError("SQL task does not belong to this session.", 400);
}

async function assertActiveBeforeWrite(session: WorkspaceSqlSession) {
  if (session.status !== "active") throw new WorkspaceSqlSessionServiceError("SQL session is already finalized.", 409);
  if (session.endTime.getTime() <= Date.now()) {
    await finalizeWorkspaceSqlSession(session.id, "auto");
    throw new WorkspaceSqlSessionServiceError("SQL session has expired.", 410);
  }
}

function isUniqueConstraintError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

function scoreFromPayload(payload: WorkspaceSqlRunResultPayload): number {
  return payload.total > 0 ? Math.round((payload.passed / payload.total) * 100) : 0;
}

const officialSubmitLocks = new Set<string>();

function acquireOfficialSubmitLock(key: string): boolean {
  if (officialSubmitLocks.has(key)) return false;
  officialSubmitLocks.add(key);
  return true;
}

function releaseOfficialSubmitLock(key: string): void {
  officialSubmitLocks.delete(key);
}

export async function startWorkspaceSqlSession(actor: WorkspaceAttemptActor, input: StartWorkspaceSqlSessionInput) {
  const code = normalizeWorkspaceCode(input.workspaceCode);
  const workspaceRow = await prisma.workspace.findUnique({ where: { code }, select: { id: true } });
  if (workspaceRow) await syncWorkspaceLifecycle(workspaceRow.id);

  const sessionId = await prisma.$transaction(async (tx) => {
    const { workspace, round, registration } = await assertWorkspaceRoundStartAllowed(tx, actor, code, input.workspaceRoundId);
    if (round.type !== "sql") throw new WorkspaceSqlSessionServiceError("SQL round not found.", 404);
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`workspace_round_attempt:${registration.id}:${round.id}`}))`;

    const existing = await tx.workspaceRoundAttempt.findUnique({
      where: { workspaceRegistrationId_workspaceRoundId: { workspaceRegistrationId: registration.id, workspaceRoundId: round.id } },
      include: { sqlSession: true },
    });
    if (existing?.sqlSessionId) {
      if (existing.status === "discarded") throw new WorkspaceSqlSessionServiceError("This round attempt is no longer available.", 409);
      return existing.sqlSessionId;
    }

    const activeSqlAttempts = await tx.workspaceRoundAttempt.findMany({
      where: { userId: actor.id, status: "active", sqlSessionId: { not: null } },
      select: { id: true, sqlSessionId: true },
    });
    for (const active of activeSqlAttempts) {
      await tx.workspaceRoundAttempt.update({ where: { id: active.id }, data: { status: "discarded", completedAt: new Date() } });
      if (active.sqlSessionId) {
        await tx.workspaceSqlSession.updateMany({ where: { id: active.sqlSessionId, status: "active" }, data: { status: "discarded", finalizedAt: new Date() } });
      }
    }

    const tasks = await selectSqlTasks(tx, round);
    if (tasks.length === 0) throw new WorkspaceSqlSessionServiceError("No SQL tasks are available for this round.", 409);
    const taskIds = tasks.map((task) => task.id);
    const drafts = Object.fromEntries(tasks.map((task) => [task.id, starterSql(task)]));
    const startTime = new Date();
    const endTime = new Date(startTime.getTime() + round.timeLimitMins * 60 * 1000);
    const sqlSession = await tx.workspaceSqlSession.create({
      data: {
        userId: actor.id,
        taskIds,
        tasks: tasks as unknown as Prisma.InputJsonValue,
        currentTaskId: taskIds[0] ?? null,
        drafts: drafts as Prisma.InputJsonValue,
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
        roundType: "sql",
        sqlSessionId: sqlSession.id,
      },
    });

    return sqlSession.id;
  });

  const session = await prisma.workspaceSqlSession.findUnique({ where: { id: sessionId }, select: { endTime: true } });
  if (session) await enqueueSqlAutoFinalize(sessionId, session.endTime);
  return getWorkspaceSqlSessionSnapshot(actor, sessionId);
}

export async function getWorkspaceSqlSessionSnapshot(actor: WorkspaceAttemptActor, sessionId: string) {
  await maybeFinalizeBeforeSnapshot(sessionId);
  const { session, attempt } = await assertWorkspaceSqlSession(actor, sessionId);
  const tasks = asTasks(session.tasks);
  const officialRows = await prisma.workspaceSqlSubmission.findMany({
    where: { sessionId: session.id, isOfficial: true },
    orderBy: { submittedAt: "desc" },
    select: { taskId: true, query: true, passedCount: true, totalCount: true, score: true, submittedAt: true, results: true },
  });
  const officialSubmissions: Record<string, { query: string; passedCount: number; totalCount: number; score: number; submittedAt: string; results: unknown }> = {};
  for (const row of officialRows) {
    if (!officialSubmissions[row.taskId]) {
      officialSubmissions[row.taskId] = {
        query: row.query,
        passedCount: row.passedCount,
        totalCount: row.totalCount,
        score: row.score,
        submittedAt: row.submittedAt.toISOString(),
        results: row.results,
      };
    }
  }

  return {
    session: {
      id: session.id,
      status: session.status,
      startTime: session.startTime.toISOString(),
      endTime: session.endTime.toISOString(),
      secondsRemaining: secondsRemaining(session),
      currentTaskId: session.currentTaskId,
      submittedAt: session.submittedAt?.toISOString() ?? null,
      finalizedAt: session.finalizedAt?.toISOString() ?? null,
      score: session.score,
      passedCount: session.passedCount,
      totalCount: session.totalCount,
      expired: session.endTime.getTime() <= Date.now(),
    },
    tasks: tasks.map(publicTask),
    drafts: asDrafts(session.drafts),
    officialSubmissions,
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

export async function updateWorkspaceSqlSession(
  actor: WorkspaceAttemptActor,
  sessionId: string,
  input: { currentTaskId?: string | null; draft?: { taskId: string; query: string } },
) {
  const { session } = await assertWorkspaceSqlSession(actor, sessionId);
  await assertActiveBeforeWrite(session);
  if (input.currentTaskId) assertTaskInSession(session, input.currentTaskId);
  if (input.draft) {
    assertTaskInSession(session, input.draft.taskId);
    if (input.draft.query.length > SQL_QUERY_MAX_CHARS) throw new WorkspaceSqlSessionServiceError("SQL query is too large.", 400);
  }

  await prisma.$transaction(async (tx) => {
    await assertWorkspaceSessionWritable(tx, { actor, sqlSessionId: sessionId });
    const current = await tx.workspaceSqlSession.findUnique({ where: { id: sessionId }, select: { drafts: true } });
    const drafts = asDrafts(current?.drafts);
    if (input.draft) drafts[input.draft.taskId] = input.draft.query;
    await tx.workspaceSqlSession.update({
      where: { id: sessionId },
      data: {
        ...(input.currentTaskId !== undefined ? { currentTaskId: input.currentTaskId } : {}),
        ...(input.draft ? { drafts: drafts as Prisma.InputJsonValue } : {}),
      },
    });
  });
  return { ok: true };
}

function taskFromSession(session: WorkspaceSqlSession, taskId: string): WorkspaceSqlTask {
  const task = asTasks(session.tasks).find((candidate) => candidate.id === taskId);
  if (!task) throw new WorkspaceSqlSessionServiceError("SQL task not found in this session.", 404);
  return task;
}

export async function runWorkspaceSqlTests(
  actor: WorkspaceAttemptActor,
  sessionId: string,
  input: { taskId: string; query: string },
) {
  const { session } = await assertWorkspaceSqlSession(actor, sessionId);
  await assertActiveBeforeWrite(session);
  assertTaskInSession(session, input.taskId);
  await updateWorkspaceSqlSession(actor, sessionId, { currentTaskId: input.taskId, draft: input });
  const task = taskFromSession(session, input.taskId);
  const payload = await evaluateSqlTask(task, input.query, { visibleOnly: true });
  await prisma.workspaceSqlSubmission.create({
    data: {
      sessionId: session.id,
      userId: actor.id,
      taskId: input.taskId,
      query: normalizeAndValidateSqlQuery(input.query),
      passedCount: payload.passed,
      totalCount: payload.total,
      score: scoreFromPayload(payload),
      isOfficial: false,
      results: payload.results as object,
    },
  });
  return payload;
}

export async function submitWorkspaceSqlTask(
  actor: WorkspaceAttemptActor,
  sessionId: string,
  input: { taskId: string; query: string },
) {
  const { session } = await assertWorkspaceSqlSession(actor, sessionId);
  await assertActiveBeforeWrite(session);
  assertTaskInSession(session, input.taskId);

  const lockKey = actor.id + ":" + session.id + ":" + input.taskId;
  if (!acquireOfficialSubmitLock(lockKey)) {
    throw new WorkspaceSqlSessionServiceError("This SQL task submission is already being evaluated.", 409);
  }

  try {
    await updateWorkspaceSqlSession(actor, sessionId, { currentTaskId: input.taskId, draft: input });

    const existingOfficial = await prisma.workspaceSqlSubmission.findFirst({
      where: { sessionId: session.id, taskId: input.taskId, isOfficial: true },
      select: { id: true },
    });
    if (existingOfficial) throw new WorkspaceSqlSessionServiceError("You have already submitted this SQL task.", 409);

    const task = taskFromSession(session, input.taskId);
    const normalizedQuery = normalizeAndValidateSqlQuery(input.query);
    const payload = await evaluateSqlTask(task, normalizedQuery);

    let created: boolean;
    try {
      created = await prisma.$transaction(async (tx) => {
        await assertWorkspaceSessionWritable(tx, { actor, sqlSessionId: sessionId });
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`sql_submit:${actor.id}:${session.id}:${input.taskId}`}))`;
        const existing = await tx.workspaceSqlSubmission.findFirst({
          where: { sessionId: session.id, taskId: input.taskId, isOfficial: true },
          select: { id: true },
        });
        if (existing) return false;
        await tx.workspaceSqlSubmission.create({
          data: {
            sessionId: session.id,
            userId: actor.id,
            taskId: input.taskId,
            query: normalizedQuery,
            passedCount: payload.passed,
            totalCount: payload.total,
            score: scoreFromPayload(payload),
            isOfficial: true,
            results: payload.results as object,
          },
        });
        return true;
      });
    } catch (error) {
      if (!isUniqueConstraintError(error)) throw error;
      created = false;
    }

    if (!created) throw new WorkspaceSqlSessionServiceError("You have already submitted this SQL task.", 409);
    return { ...payload, submitted: true };
  } finally {
    releaseOfficialSubmitLock(lockKey);
  }
}

export async function submitWorkspaceSqlSession(actor: WorkspaceAttemptActor, sessionId: string) {
  const { session } = await assertWorkspaceSqlSession(actor, sessionId);
  await assertActiveBeforeWrite(session);
  await prisma.$transaction(async (tx) => {
    await assertWorkspaceSessionWritable(tx, { actor, sqlSessionId: sessionId });
  });

  const official = await prisma.workspaceSqlSubmission.findMany({
    where: { sessionId: session.id, isOfficial: true },
    select: { taskId: true },
  });
  const submitted = new Set(official.map((row) => row.taskId));
  const missing = session.taskIds.filter((taskId) => !submitted.has(taskId));
  if (missing.length > 0) {
    throw new WorkspaceSqlSessionServiceError("Submit official solutions for every SQL task before finishing the round.", 400);
  }

  await finalizeWorkspaceSqlSession(sessionId, "manual");
  return getWorkspaceSqlSessionSnapshot(actor, sessionId);
}