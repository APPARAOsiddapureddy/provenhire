import crypto from "crypto";
import type { Prisma } from "@prisma/client";
import { prisma } from "../config/prisma.js";
import { createWorkspaceMcqQuestionSet } from "../data/aptitude-loader.js";
import { finalizeActiveWorkspaceMcqAttempts } from "./mcqAutoFinalize.service.js";
import { finalizeActiveWorkspaceDsaAttempts } from "./workspaceDsaFinalize.service.js";
import { finalizeActiveWorkspaceSqlAttempts } from "./workspaceSqlFinalize.service.js";
import { recordWorkspaceAuditEvent } from "./workspaceAudit.service.js";

export const MAX_WORKSPACE_ROUNDS = 5;

export type WorkspaceCreator = {
  id: string;
  role: string;
};

export type CreateWorkspaceInput = {
  name: string;
  organization: string;
  targetRole: string;
  responsibilities: string[];
  startAt: Date;
  endAt: Date;
  totalRounds: number;
  accessMode?: "public" | "invite_only";
};

export type UpdateWorkspaceInput = Partial<CreateWorkspaceInput>;

export type WorkspaceRoundInput = {
  order: number;
  name: string;
  type: "mcq" | "coding" | "interview" | "sql";
  questionType?: "random" | "fixed";
  questionCount: number;
  timeLimitMins: number;
  scoreWeightage: number;
  easyCount: number;
  mediumCount: number;
  hardCount: number;
};

export type WorkspaceListFilters = {
  status?: "draft" | "published" | "started" | "ended" | "archived";
  organization?: string;
  startFrom?: Date;
  endTo?: Date;
  page: number;
  limit: number;
};

export type SqlTaskAvailability = {
  total: number;
  byDifficulty: Record<"Easy" | "Medium" | "Hard", number>;
  missingHiddenTests: number;
  belowRecommendedCoverage: number;
};

const MIN_RECOMMENDED_SQL_TEST_CASES = 6;

const SQL_ELIGIBLE_TASK_WHERE: Prisma.DataRoundTaskWhereInput = {
  taskType: "sql",
  AND: [
    { testCases: { some: { isHidden: false } } },
    { testCases: { some: { isHidden: true } } },
  ],
};

function emptySqlDifficultyCounts(): SqlTaskAvailability["byDifficulty"] {
  return { Easy: 0, Medium: 0, Hard: 0 };
}

export class WorkspaceServiceError extends Error {
  constructor(
    message: string,
    public statusCode = 400,
  ) {
    super(message);
    this.name = "WorkspaceServiceError";
  }
}

function assertValidWorkspaceDates(startAt: Date, endAt: Date): void {
  if (startAt.getTime() >= endAt.getTime()) {
    throw new WorkspaceServiceError(
      "Workspace start time must be before end time.",
    );
  }
}

function slugOrganization(organization: string): string {
  const slug = organization
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32);
  return slug || "ORG";
}

async function generateWorkspaceCode(
  organization: string,
  startAt: Date,
): Promise<string> {
  const orgSlug = slugOrganization(organization);
  const year = startAt.getUTCFullYear();

  for (let attempt = 0; attempt < 20; attempt += 1) {
    const suffix = String(crypto.randomInt(0, 10_000)).padStart(4, "0");
    const code = `PH-${orgSlug}-${year}-${suffix}`;
    const existing = await prisma.workspace.findUnique({
      where: { code },
      select: { id: true },
    });
    if (!existing) return code;
  }

  throw new WorkspaceServiceError(
    "Could not generate a unique workspace code. Please retry.",
    500,
  );
}

async function resolveOwnership(creator: WorkspaceCreator): Promise<{
  ownerRole: "admin" | "recruiter";
  ownerUserId: string;
  recruiterProfileId: string | null;
}> {
  if (creator.role === "admin") {
    return {
      ownerRole: "admin",
      ownerUserId: creator.id,
      recruiterProfileId: null,
    };
  }

  if (creator.role === "recruiter") {
    const recruiter = await prisma.recruiterProfile.findUnique({
      where: { userId: creator.id },
      select: { id: true },
    });
    if (!recruiter) {
      throw new WorkspaceServiceError(
        "Recruiter profile required to manage workspaces.",
        403,
      );
    }
    return {
      ownerRole: "recruiter",
      ownerUserId: creator.id,
      recruiterProfileId: recruiter.id,
    };
  }

  throw new WorkspaceServiceError("Workspace creator access required.", 403);
}

function ownerWhere(creator: WorkspaceCreator): Prisma.WorkspaceWhereInput {
  return { ownerUserId: creator.id };
}

function lifecycleStatus(workspace: {
  status: "draft" | "published" | "started" | "ended" | "archived";
  startAt: Date;
  endAt: Date;
}) {
  if (
    workspace.status === "draft" ||
    workspace.status === "ended" ||
    workspace.status === "archived"
  )
    return workspace.status;
  if (workspace.endAt.getTime() <= Date.now()) return "ended" as const;
  return workspace.status;
}

export async function syncWorkspaceLifecycle(workspaceId: string) {
  const workspace = await prisma.workspace.findUnique({
    where: { id: workspaceId },
  });
  if (!workspace) return null;
  const nextStatus = lifecycleStatus(workspace);
  if (nextStatus === workspace.status) return workspace;
  return prisma.workspace.update({
    where: { id: workspace.id },
    data: { status: nextStatus },
  });
}

async function syncOwnerWorkspaceLifecycles(
  creator: WorkspaceCreator,
): Promise<void> {
  const where = ownerWhere(creator);
  const now = new Date();
  await prisma.$transaction([
    prisma.workspace.updateMany({
      where: {
        ...where,
        status: { in: ["published", "started"] },
        endAt: { lte: now },
      },
      data: { status: "ended" },
    }),
  ]);
}

function validateRounds(
  rounds: WorkspaceRoundInput[],
  expectedTotalRounds: number,
): void {
  if (rounds.length !== expectedTotalRounds) {
    throw new WorkspaceServiceError(
      `Configure exactly ${expectedTotalRounds} round${expectedTotalRounds === 1 ? "" : "s"} before continuing.`,
    );
  }

  const orders = rounds.map((round) => round.order).sort((a, b) => a - b);
  for (let i = 0; i < orders.length; i += 1) {
    if (orders[i] !== i + 1) {
      throw new WorkspaceServiceError(
        "Round order must be unique and sequential starting from 1.",
      );
    }
  }

  const totalWeight = rounds.reduce(
    (sum, round) => sum + round.scoreWeightage,
    0,
  );
  if (totalWeight !== 100) {
    throw new WorkspaceServiceError("Round score weightage must total 100.");
  }

  for (const round of rounds) {
    const distributionTotal =
      round.easyCount + round.mediumCount + round.hardCount;
    if (distributionTotal !== round.questionCount) {
      throw new WorkspaceServiceError(
        `Difficulty counts must add up to question count for round ${round.order}.`,
      );
    }
  }
}

export async function createWorkspace(
  creator: WorkspaceCreator,
  input: CreateWorkspaceInput,
) {
  assertValidWorkspaceDates(input.startAt, input.endAt);
  const ownership = await resolveOwnership(creator);
  const code = await generateWorkspaceCode(input.organization, input.startAt);

  const workspace = await prisma.workspace.create({
    data: {
      ...ownership,
      name: input.name,
      organization: input.organization,
      targetRole: input.targetRole,
      hiringRubric: {
        schemaVersion: "workspace_hiring_rubric_v1",
        responsibilities: input.responsibilities,
        decisionPolicy: "named_human_review_required",
      },
      code,
      startAt: input.startAt,
      endAt: input.endAt,
      totalRounds: input.totalRounds,
      accessMode: input.accessMode ?? "public",
    },
  });
  await recordWorkspaceAuditEvent({
    workspaceId: workspace.id,
    actorUserId: creator.id,
    eventType: "workspace.created",
    detail: { code: workspace.code, accessMode: workspace.accessMode },
  });
  return workspace;
}

export async function listWorkspaces(
  creator: WorkspaceCreator,
  filters: WorkspaceListFilters,
) {
  await syncOwnerWorkspaceLifecycles(creator);
  const where: Prisma.WorkspaceWhereInput = { ...ownerWhere(creator) };

  if (filters.status) where.status = filters.status;
  if (filters.organization) {
    where.organization = {
      contains: filters.organization,
      mode: "insensitive",
    };
  }
  if (filters.startFrom || filters.endTo) {
    where.AND = [
      ...(filters.startFrom ? [{ startAt: { gte: filters.startFrom } }] : []),
      ...(filters.endTo ? [{ endAt: { lte: filters.endTo } }] : []),
    ];
  }

  const skip = (filters.page - 1) * filters.limit;
  const [total, workspaces] = await Promise.all([
    prisma.workspace.count({ where }),
    prisma.workspace.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take: filters.limit,
      include: { _count: { select: { rounds: true } } },
    }),
  ]);

  return {
    workspaces,
    pagination: {
      page: filters.page,
      limit: filters.limit,
      total,
      totalPages: Math.ceil(total / filters.limit),
    },
  };
}

export async function getSqlTaskAvailability(
  creator: WorkspaceCreator,
): Promise<SqlTaskAvailability> {
  if (creator.role !== "admin")
    throw new WorkspaceServiceError("Workspace creator access required.", 403);
  const [eligibleTasks, missingHiddenTests] = await Promise.all([
    prisma.dataRoundTask.findMany({
      where: SQL_ELIGIBLE_TASK_WHERE,
      select: {
        difficulty: true,
        _count: { select: { testCases: true } },
      },
    }),
    prisma.dataRoundTask.count({
      where: {
        taskType: "sql",
        testCases: { some: { isHidden: false } },
        NOT: { testCases: { some: { isHidden: true } } },
      },
    }),
  ]);
  const byDifficulty = emptySqlDifficultyCounts();
  for (const row of eligibleTasks) {
    if (
      row.difficulty === "Easy" ||
      row.difficulty === "Medium" ||
      row.difficulty === "Hard"
    ) {
      byDifficulty[row.difficulty] += 1;
    }
  }
  return {
    byDifficulty,
    missingHiddenTests,
    belowRecommendedCoverage: eligibleTasks.filter(
      (task) => task._count.testCases < MIN_RECOMMENDED_SQL_TEST_CASES,
    ).length,
    total: byDifficulty.Easy + byDifficulty.Medium + byDifficulty.Hard,
  };
}

export async function getWorkspace(
  creator: WorkspaceCreator,
  workspaceId: string,
) {
  await syncWorkspaceLifecycle(workspaceId);
  const workspace = await prisma.workspace.findFirst({
    where: { id: workspaceId, ...ownerWhere(creator) },
    include: { rounds: { orderBy: { order: "asc" } } },
  });
  if (!workspace) throw new WorkspaceServiceError("Workspace not found.", 404);
  return workspace;
}

export async function updateWorkspace(
  creator: WorkspaceCreator,
  workspaceId: string,
  input: UpdateWorkspaceInput,
) {
  const workspace = await prisma.workspace.findFirst({
    where: { id: workspaceId, ...ownerWhere(creator) },
  });
  if (!workspace) throw new WorkspaceServiceError("Workspace not found.", 404);
  if (workspace.status !== "draft") {
    throw new WorkspaceServiceError(
      "Only draft workspaces can be edited.",
      409,
    );
  }

  const nextStartAt = input.startAt ?? workspace.startAt;
  const nextEndAt = input.endAt ?? workspace.endAt;
  assertValidWorkspaceDates(nextStartAt, nextEndAt);

  return prisma.workspace.update({
    where: { id: workspace.id },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.organization !== undefined
        ? { organization: input.organization }
        : {}),
      ...(input.targetRole !== undefined
        ? { targetRole: input.targetRole }
        : {}),
      ...(input.responsibilities !== undefined
        ? {
            hiringRubric: {
              schemaVersion: "workspace_hiring_rubric_v1",
              responsibilities: input.responsibilities,
              decisionPolicy: "named_human_review_required",
            },
          }
        : {}),
      ...(input.startAt !== undefined ? { startAt: input.startAt } : {}),
      ...(input.endAt !== undefined ? { endAt: input.endAt } : {}),
      ...(input.totalRounds !== undefined
        ? { totalRounds: input.totalRounds }
        : {}),
      ...(input.accessMode !== undefined
        ? { accessMode: input.accessMode }
        : {}),
    },
  });
}

export async function replaceWorkspaceRounds(
  creator: WorkspaceCreator,
  workspaceId: string,
  rounds: WorkspaceRoundInput[],
) {
  const workspace = await prisma.workspace.findFirst({
    where: { id: workspaceId, ...ownerWhere(creator) },
  });
  if (!workspace) throw new WorkspaceServiceError("Workspace not found.", 404);
  if (workspace.status !== "draft") {
    throw new WorkspaceServiceError(
      "Rounds can only be configured while the workspace is a draft.",
      409,
    );
  }
  validateRounds(rounds, workspace.totalRounds);

  const published = await prisma.$transaction(async (tx) => {
    for (const round of rounds) {
      if (round.type === "sql")
        await validateSqlRoundAvailability(tx, round, true);
    }
    await tx.workspaceRound.deleteMany({
      where: { workspaceId: workspace.id },
    });
    await tx.workspaceRound.createMany({
      data: rounds.map((round) => ({
        workspaceId: workspace.id,
        order: round.order,
        name: round.name,
        type: round.type,
        questionCount: round.questionCount,
        timeLimitMins: round.timeLimitMins,
        scoreWeightage: round.scoreWeightage,
        easyCount: round.easyCount,
        mediumCount: round.mediumCount,
        hardCount: round.hardCount,
        questionType: round.questionType ?? "random",
      })),
    });
    return tx.workspaceRound.findMany({
      where: { workspaceId: workspace.id },
      orderBy: { order: "asc" },
    });
  });
  await recordWorkspaceAuditEvent({
    workspaceId: workspace.id,
    actorUserId: creator.id,
    eventType: "workspace.published",
    detail: { code: workspace.code },
  });
  return published;
}

async function validateSqlRoundAvailability(
  tx: Prisma.TransactionClient,
  round: {
    id?: string;
    order: number;
    easyCount: number;
    mediumCount: number;
    hardCount: number;
    questionCount: number;
  },
  strict: boolean,
): Promise<void> {
  const rows = await tx.dataRoundTask.groupBy({
    by: ["difficulty"],
    where: SQL_ELIGIBLE_TASK_WHERE,
    _count: { _all: true },
  });
  const counts = new Map(rows.map((row) => [row.difficulty, row._count._all]));
  const shortage = {
    easy: Math.max(0, round.easyCount - (counts.get("Easy") ?? 0)),
    medium: Math.max(0, round.mediumCount - (counts.get("Medium") ?? 0)),
    hard: Math.max(0, round.hardCount - (counts.get("Hard") ?? 0)),
  };
  const totalShortage = shortage.easy + shortage.medium + shortage.hard;
  if (totalShortage === 0) return;
  if (strict) {
    throw new WorkspaceServiceError(
      `Not enough SQL tasks for round ${round.order}.`,
      400,
    );
  }
  console.warn("[workspace/publish] SQL task shortage allowed in development", {
    roundId: round.id,
    order: round.order,
    shortage,
  });
}

export async function publishWorkspace(
  creator: WorkspaceCreator,
  workspaceId: string,
) {
  const workspace = await getWorkspace(creator, workspaceId);
  if (workspace.status === "published") return workspace;
  if (workspace.status !== "draft") {
    throw new WorkspaceServiceError(
      "Only draft workspaces can be published.",
      409,
    );
  }

  assertValidWorkspaceDates(workspace.startAt, workspace.endAt);
  validateRounds(workspace.rounds, workspace.totalRounds);
  const rubric =
    workspace.hiringRubric &&
    typeof workspace.hiringRubric === "object" &&
    !Array.isArray(workspace.hiringRubric)
      ? (workspace.hiringRubric as Record<string, unknown>)
      : {};
  const responsibilities = Array.isArray(rubric.responsibilities)
    ? rubric.responsibilities
        .map(String)
        .filter((item) => item.trim().length >= 3)
    : [];
  if (
    !workspace.targetRole.trim() ||
    workspace.targetRole === "Role not configured" ||
    responsibilities.length < 3
  ) {
    throw new WorkspaceServiceError(
      "Configure the employer target role and at least three approved responsibilities before publishing.",
      409,
    );
  }
  const strictQuestionAvailability =
    process.env.STRICT_WORKSPACE_QUESTION_AVAILABILITY === "true";

  return prisma.$transaction(async (tx) => {
    for (const round of workspace.rounds) {
      if (round.type === "sql") {
        await validateSqlRoundAvailability(
          tx,
          round,
          strictQuestionAvailability,
        );
        continue;
      }
      if (round.type !== "mcq") continue;
      const set = createWorkspaceMcqQuestionSet({
        easyCount: round.easyCount,
        mediumCount: round.mediumCount,
        hardCount: round.hardCount,
        allowPartial: !strictQuestionAvailability,
      });
      const shortage =
        set.shortage.easy + set.shortage.medium + set.shortage.hard;
      if (shortage > 0) {
        // Development mode currently allows publishing with the best available MCQ pool.
        // Production deployments should set STRICT_WORKSPACE_QUESTION_AVAILABILITY=true so publish fails on shortage.
        if (strictQuestionAvailability) {
          throw new WorkspaceServiceError(
            `Not enough MCQ questions for round ${round.order}.`,
            400,
          );
        }
        console.warn(
          "[workspace/publish] MCQ question shortage allowed in development",
          {
            workspaceId: workspace.id,
            roundId: round.id,
            shortage: set.shortage,
          },
        );
      }
      if (round.questionType === "fixed") {
        await tx.workspaceRoundQuestionSet.upsert({
          where: { workspaceRoundId: round.id },
          create: {
            workspaceRoundId: round.id,
            questionIds: set.questionIds,
            questions: set.questions as object,
            answerKey: set.answerKey as object,
          },
          update: {
            questionIds: set.questionIds,
            questions: set.questions as object,
            answerKey: set.answerKey as object,
          },
        });
      }
    }

    return tx.workspace.update({
      where: { id: workspace.id },
      data: { status: "published" },
      include: { rounds: { orderBy: { order: "asc" } } },
    });
  });
}

export async function startWorkspace(
  creator: WorkspaceCreator,
  workspaceId: string,
) {
  await syncWorkspaceLifecycle(workspaceId);
  const workspace = await prisma.workspace.findFirst({
    where: { id: workspaceId, ...ownerWhere(creator) },
  });
  if (!workspace) throw new WorkspaceServiceError("Workspace not found.", 404);
  if (workspace.status === "started") return workspace;
  if (workspace.status !== "published") {
    throw new WorkspaceServiceError(
      "Only published workspaces can be started.",
      409,
    );
  }
  if (workspace.endAt.getTime() <= Date.now()) {
    const ended = await prisma.workspace.update({
      where: { id: workspace.id },
      data: { status: "ended" },
    });
    throw new WorkspaceServiceError(
      `Workspace has already ended (${ended.code}).`,
      409,
    );
  }

  const started = await prisma.workspace.update({
    where: { id: workspace.id },
    data: { status: "started" },
  });
  await recordWorkspaceAuditEvent({
    workspaceId: workspace.id,
    actorUserId: creator.id,
    eventType: "workspace.started",
  });
  return started;
}

export async function endWorkspace(
  creator: WorkspaceCreator,
  workspaceId: string,
) {
  const workspace = await prisma.workspace.findFirst({
    where: { id: workspaceId, ...ownerWhere(creator) },
  });
  if (!workspace) throw new WorkspaceServiceError("Workspace not found.", 404);
  if (workspace.status === "ended") return workspace;
  if (workspace.status !== "started") {
    throw new WorkspaceServiceError("Only a started workspace can be ended.", 409);
  }
  const ended = await prisma.workspace.update({
    where: { id: workspace.id },
    data: { status: "ended", endAt: new Date() },
  });
  await finalizeActiveWorkspaceMcqAttempts(workspace.id);
  await finalizeActiveWorkspaceDsaAttempts(workspace.id);
  await finalizeActiveWorkspaceSqlAttempts(workspace.id);
  await recordWorkspaceAuditEvent({
    workspaceId: workspace.id,
    actorUserId: creator.id,
    eventType: "workspace.ended",
    detail: { endedAt: ended.endAt },
  });
  return ended;
}

export async function archiveWorkspace(
  creator: WorkspaceCreator,
  workspaceId: string,
) {
  const workspace = await prisma.workspace.findFirst({
    where: { id: workspaceId, ...ownerWhere(creator) },
  });
  if (!workspace) throw new WorkspaceServiceError("Workspace not found.", 404);
  if (workspace.status === "archived") return workspace;
  if (workspace.status === "started") {
    throw new WorkspaceServiceError(
      "End the active workspace before archiving it so in-flight attempts are finalized explicitly.",
      409,
    );
  }
  if (!["published", "ended"].includes(workspace.status)) {
    throw new WorkspaceServiceError(
      "Only a published or ended workspace can be archived.",
      409,
    );
  }

  const archived = await prisma.workspace.update({
    where: { id: workspace.id },
    data: { status: "archived" },
  });
  await finalizeActiveWorkspaceMcqAttempts(workspace.id);
  await finalizeActiveWorkspaceDsaAttempts(workspace.id);
  await finalizeActiveWorkspaceSqlAttempts(workspace.id);
  await recordWorkspaceAuditEvent({
    workspaceId: workspace.id,
    actorUserId: creator.id,
    eventType: "workspace.archived",
    detail: { previousStatus: workspace.status },
  });
  return archived;
}

export async function deleteWorkspace(
  creator: WorkspaceCreator,
  workspaceId: string,
) {
  await syncWorkspaceLifecycle(workspaceId);
  const workspace = await prisma.workspace.findFirst({
    where: { id: workspaceId, ...ownerWhere(creator) },
    select: {
      id: true,
      status: true,
      _count: { select: { registrations: true, roundAttempts: true } },
    },
  });
  if (!workspace) throw new WorkspaceServiceError("Workspace not found.", 404);
  if (workspace.status !== "draft") {
    throw new WorkspaceServiceError(
      "Only draft workspaces can be deleted. End or archive published workspaces to preserve candidate evidence.",
      409,
    );
  }
  if (workspace._count.registrations > 0 || workspace._count.roundAttempts > 0) {
    throw new WorkspaceServiceError(
      "This draft has registrations or assessment attempts and cannot be deleted.",
      409,
    );
  }

  await recordWorkspaceAuditEvent({
    workspaceId: workspace.id,
    actorUserId: creator.id,
    eventType: "workspace.deleted",
  });
  await prisma.workspace.delete({ where: { id: workspace.id } });
  return { ok: true, deletedWorkspaceId: workspace.id };
}
