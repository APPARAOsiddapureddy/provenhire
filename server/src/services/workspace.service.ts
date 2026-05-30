import crypto from "crypto";
import type { Prisma } from "@prisma/client";
import { prisma } from "../config/prisma.js";
import { createWorkspaceMcqQuestionSet } from "../data/aptitude-loader.js";
import { finalizeActiveWorkspaceMcqAttempts } from "./mcqAutoFinalize.service.js";
import { finalizeActiveWorkspaceDsaAttempts } from "./workspaceDsaFinalize.service.js";

export const MAX_WORKSPACE_ROUNDS = 5;

export type WorkspaceCreator = {
  id: string;
  role: string;
};

export type CreateWorkspaceInput = {
  name: string;
  organization: string;
  startAt: Date;
  endAt: Date;
  totalRounds: number;
  accessMode?: "public" | "invite_only";
};

export type UpdateWorkspaceInput = Partial<CreateWorkspaceInput>;

export type WorkspaceRoundInput = {
  order: number;
  name: string;
  type: "mcq" | "coding" | "interview";
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
    throw new WorkspaceServiceError("Workspace start time must be before end time.");
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

async function generateWorkspaceCode(organization: string, startAt: Date): Promise<string> {
  const orgSlug = slugOrganization(organization);
  const year = startAt.getUTCFullYear();

  for (let attempt = 0; attempt < 20; attempt += 1) {
    const suffix = String(crypto.randomInt(0, 10_000)).padStart(4, "0");
    const code = `PH-${orgSlug}-${year}-${suffix}`;
    const existing = await prisma.workspace.findUnique({ where: { code }, select: { id: true } });
    if (!existing) return code;
  }

  throw new WorkspaceServiceError("Could not generate a unique workspace code. Please retry.", 500);
}

async function resolveOwnership(creator: WorkspaceCreator): Promise<{
  ownerRole: "admin" | "recruiter";
  ownerUserId: string;
  recruiterProfileId: string | null;
}> {
  if (creator.role === "admin") {
    return { ownerRole: "admin", ownerUserId: creator.id, recruiterProfileId: null };
  }

  if (creator.role === "recruiter") {
    const recruiter = await prisma.recruiterProfile.findUnique({
      where: { userId: creator.id },
      select: { id: true },
    });
    if (!recruiter) {
      throw new WorkspaceServiceError("Recruiter profile required to manage workspaces.", 403);
    }
    return { ownerRole: "recruiter", ownerUserId: creator.id, recruiterProfileId: recruiter.id };
  }

  throw new WorkspaceServiceError("Workspace creator access required.", 403);
}

function ownerWhere(creator: WorkspaceCreator): Prisma.WorkspaceWhereInput {
  return { ownerUserId: creator.id };
}

function lifecycleStatus(workspace: { status: "draft" | "published" | "started" | "ended" | "archived"; startAt: Date; endAt: Date }) {
  if (workspace.status === "draft" || workspace.status === "ended" || workspace.status === "archived") return workspace.status;
  if (workspace.endAt.getTime() <= Date.now()) return "ended" as const;
  return workspace.status;
}

export async function syncWorkspaceLifecycle(workspaceId: string) {
  const workspace = await prisma.workspace.findUnique({ where: { id: workspaceId } });
  if (!workspace) return null;
  const nextStatus = lifecycleStatus(workspace);
  if (nextStatus === workspace.status) return workspace;
  return prisma.workspace.update({ where: { id: workspace.id }, data: { status: nextStatus } });
}

async function syncOwnerWorkspaceLifecycles(creator: WorkspaceCreator): Promise<void> {
  const where = ownerWhere(creator);
  const now = new Date();
  await prisma.$transaction([
    prisma.workspace.updateMany({
      where: { ...where, status: { in: ["published", "started"] }, endAt: { lte: now } },
      data: { status: "ended" },
    }),
  ]);
}

function validateRounds(rounds: WorkspaceRoundInput[], expectedTotalRounds: number): void {
  if (rounds.length !== expectedTotalRounds) {
    throw new WorkspaceServiceError(
      `Configure exactly ${expectedTotalRounds} round${expectedTotalRounds === 1 ? "" : "s"} before continuing.`,
    );
  }

  const orders = rounds.map((round) => round.order).sort((a, b) => a - b);
  for (let i = 0; i < orders.length; i += 1) {
    if (orders[i] !== i + 1) {
      throw new WorkspaceServiceError("Round order must be unique and sequential starting from 1.");
    }
  }

  const totalWeight = rounds.reduce((sum, round) => sum + round.scoreWeightage, 0);
  if (totalWeight !== 100) {
    throw new WorkspaceServiceError("Round score weightage must total 100.");
  }

  for (const round of rounds) {
    const distributionTotal = round.easyCount + round.mediumCount + round.hardCount;
    if (distributionTotal !== round.questionCount) {
      throw new WorkspaceServiceError(`Difficulty counts must add up to question count for round ${round.order}.`);
    }
  }
}

export async function createWorkspace(creator: WorkspaceCreator, input: CreateWorkspaceInput) {
  assertValidWorkspaceDates(input.startAt, input.endAt);
  const ownership = await resolveOwnership(creator);
  const code = await generateWorkspaceCode(input.organization, input.startAt);

  return prisma.workspace.create({
    data: {
      ...ownership,
      name: input.name,
      organization: input.organization,
      code,
      startAt: input.startAt,
      endAt: input.endAt,
      totalRounds: input.totalRounds,
      accessMode: input.accessMode ?? "public",
    },
  });
}

export async function listWorkspaces(creator: WorkspaceCreator, filters: WorkspaceListFilters) {
  await syncOwnerWorkspaceLifecycles(creator);
  const where: Prisma.WorkspaceWhereInput = { ...ownerWhere(creator) };

  if (filters.status) where.status = filters.status;
  if (filters.organization) {
    where.organization = { contains: filters.organization, mode: "insensitive" };
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

export async function getWorkspace(creator: WorkspaceCreator, workspaceId: string) {
  await syncWorkspaceLifecycle(workspaceId);
  const workspace = await prisma.workspace.findFirst({
    where: { id: workspaceId, ...ownerWhere(creator) },
    include: { rounds: { orderBy: { order: "asc" } } },
  });
  if (!workspace) throw new WorkspaceServiceError("Workspace not found.", 404);
  return workspace;
}

export async function updateWorkspace(creator: WorkspaceCreator, workspaceId: string, input: UpdateWorkspaceInput) {
  const workspace = await prisma.workspace.findFirst({ where: { id: workspaceId, ...ownerWhere(creator) } });
  if (!workspace) throw new WorkspaceServiceError("Workspace not found.", 404);
  if (workspace.status !== "draft") {
    throw new WorkspaceServiceError("Only draft workspaces can be edited.", 409);
  }

  const nextStartAt = input.startAt ?? workspace.startAt;
  const nextEndAt = input.endAt ?? workspace.endAt;
  assertValidWorkspaceDates(nextStartAt, nextEndAt);

  return prisma.workspace.update({
    where: { id: workspace.id },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.organization !== undefined ? { organization: input.organization } : {}),
      ...(input.startAt !== undefined ? { startAt: input.startAt } : {}),
      ...(input.endAt !== undefined ? { endAt: input.endAt } : {}),
      ...(input.totalRounds !== undefined ? { totalRounds: input.totalRounds } : {}),
      ...(input.accessMode !== undefined ? { accessMode: input.accessMode } : {}),
    },
  });
}

export async function replaceWorkspaceRounds(
  creator: WorkspaceCreator,
  workspaceId: string,
  rounds: WorkspaceRoundInput[],
) {
  const workspace = await prisma.workspace.findFirst({ where: { id: workspaceId, ...ownerWhere(creator) } });
  if (!workspace) throw new WorkspaceServiceError("Workspace not found.", 404);
  if (workspace.status !== "draft") {
    throw new WorkspaceServiceError("Rounds can only be configured while the workspace is a draft.", 409);
  }
  validateRounds(rounds, workspace.totalRounds);

  return prisma.$transaction(async (tx) => {
    await tx.workspaceRound.deleteMany({ where: { workspaceId: workspace.id } });
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
    return tx.workspaceRound.findMany({ where: { workspaceId: workspace.id }, orderBy: { order: "asc" } });
  });
}

export async function publishWorkspace(creator: WorkspaceCreator, workspaceId: string) {
  const workspace = await getWorkspace(creator, workspaceId);
  if (workspace.status === "published") return workspace;
  if (workspace.status !== "draft") {
    throw new WorkspaceServiceError("Only draft workspaces can be published.", 409);
  }

  assertValidWorkspaceDates(workspace.startAt, workspace.endAt);
  validateRounds(workspace.rounds, workspace.totalRounds);
  const strictQuestionAvailability = process.env.STRICT_WORKSPACE_QUESTION_AVAILABILITY === "true";

  return prisma.$transaction(async (tx) => {
    for (const round of workspace.rounds) {
      if (round.type !== "mcq") continue;
      const set = createWorkspaceMcqQuestionSet({
        easyCount: round.easyCount,
        mediumCount: round.mediumCount,
        hardCount: round.hardCount,
        allowPartial: !strictQuestionAvailability,
      });
      const shortage = set.shortage.easy + set.shortage.medium + set.shortage.hard;
      if (shortage > 0) {
        // Development mode currently allows publishing with the best available MCQ pool.
        // Production deployments should set STRICT_WORKSPACE_QUESTION_AVAILABILITY=true so publish fails on shortage.
        if (strictQuestionAvailability) {
          throw new WorkspaceServiceError(`Not enough MCQ questions for round ${round.order}.`, 400);
        }
        console.warn("[workspace/publish] MCQ question shortage allowed in development", {
          workspaceId: workspace.id,
          roundId: round.id,
          shortage: set.shortage,
        });
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

export async function startWorkspace(creator: WorkspaceCreator, workspaceId: string) {
  await syncWorkspaceLifecycle(workspaceId);
  const workspace = await prisma.workspace.findFirst({
    where: { id: workspaceId, ...ownerWhere(creator) },
  });
  if (!workspace) throw new WorkspaceServiceError("Workspace not found.", 404);
  if (workspace.status === "started") return workspace;
  if (workspace.status !== "published") {
    throw new WorkspaceServiceError("Only published workspaces can be started.", 409);
  }
  if (workspace.endAt.getTime() <= Date.now()) {
    const ended = await prisma.workspace.update({
      where: { id: workspace.id },
      data: { status: "ended" },
    });
    throw new WorkspaceServiceError(`Workspace has already ended (${ended.code}).`, 409);
  }

  return prisma.workspace.update({
    where: { id: workspace.id },
    data: { status: "started" },
  });
}

export async function archiveWorkspace(creator: WorkspaceCreator, workspaceId: string) {
  const workspace = await prisma.workspace.findFirst({ where: { id: workspaceId, ...ownerWhere(creator) } });
  if (!workspace) throw new WorkspaceServiceError("Workspace not found.", 404);
  if (workspace.status === "archived") return workspace;

  const archived = await prisma.workspace.update({
    where: { id: workspace.id },
    data: { status: "archived" },
  });
  await finalizeActiveWorkspaceMcqAttempts(workspace.id);
  await finalizeActiveWorkspaceDsaAttempts(workspace.id);
  return archived;
}

export async function deleteWorkspace(creator: WorkspaceCreator, workspaceId: string) {
  await syncWorkspaceLifecycle(workspaceId);
  const workspace = await prisma.workspace.findFirst({
    where: { id: workspaceId, ...ownerWhere(creator) },
    select: { id: true, status: true },
  });
  if (!workspace) throw new WorkspaceServiceError("Workspace not found.", 404);
  if (workspace.status === "started") {
    throw new WorkspaceServiceError("Currently active workspaces cannot be deleted.", 409);
  }

  await prisma.workspace.delete({ where: { id: workspace.id } });
  return { ok: true, deletedWorkspaceId: workspace.id };
}
