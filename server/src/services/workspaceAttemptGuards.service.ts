import type { Prisma } from "@prisma/client";
import { WorkspaceServiceError } from "./workspace.service.js";

export type WorkspaceAttemptActor = {
  id: string;
  role: string;
};

type Tx = Prisma.TransactionClient;

export function normalizeWorkspaceCode(code: string): string {
  return code.trim().toUpperCase();
}

export async function assertWorkspaceRoundStartAllowed(
  tx: Tx,
  actor: WorkspaceAttemptActor,
  codeInput: string,
  roundId: string,
) {
  if (actor.role !== "jobseeker") {
    throw new WorkspaceServiceError("Job seeker access required.", 403);
  }

  const code = normalizeWorkspaceCode(codeInput);
  const workspace = await tx.workspace.findUnique({
    where: { code },
    include: {
      rounds: { orderBy: { order: "asc" } },
    },
  });
  if (!workspace) throw new WorkspaceServiceError("Workspace not found.", 404);
  if (workspace.status !== "started") {
    throw new WorkspaceServiceError("Workspace is not currently accepting round attempts.", 409);
  }
  if (workspace.endAt.getTime() <= Date.now()) {
    throw new WorkspaceServiceError("Workspace has ended.", 410);
  }

  const round = workspace.rounds.find((candidate) => candidate.id === roundId);
  if (!round) throw new WorkspaceServiceError("Workspace round not found.", 404);
  if (round.type === "interview") {
    throw new WorkspaceServiceError("Interview rounds are not supported in this attempt flow yet.", 409);
  }

  const registration = await tx.workspaceRegistration.findUnique({
    where: { workspaceId_userId: { workspaceId: workspace.id, userId: actor.id } },
  });
  if (!registration || registration.status !== "registered") {
    throw new WorkspaceServiceError("You are not registered for this workspace.", 403);
  }

  const previousRoundIds = workspace.rounds
    .filter((candidate) => candidate.order < round.order)
    .map((candidate) => candidate.id);
  if (previousRoundIds.length > 0) {
    const completedPrevious = await tx.workspaceRoundAttempt.count({
      where: {
        workspaceRegistrationId: registration.id,
        workspaceRoundId: { in: previousRoundIds },
        status: { in: ["completed", "auto_completed"] },
      },
    });
    if (completedPrevious !== previousRoundIds.length) {
      throw new WorkspaceServiceError("Complete previous rounds before starting this round.", 409);
    }
  }

  return { workspace, round, registration };
}

export async function assertWorkspaceSessionWritable(
  tx: Tx,
  params: {
    actor: WorkspaceAttemptActor;
    dsaRoundSessionId?: string | null;
    mcqSessionId?: string | null;
    sqlSessionId?: string | null;
  },
) {
  const attempt = await tx.workspaceRoundAttempt.findFirst({
    where: {
      userId: params.actor.id,
      ...(params.dsaRoundSessionId ? { dsaRoundSessionId: params.dsaRoundSessionId } : {}),
      ...(params.mcqSessionId ? { mcqSessionId: params.mcqSessionId } : {}),
      ...(params.sqlSessionId ? { sqlSessionId: params.sqlSessionId } : {}),
    },
    include: {
      workspace: true,
      workspaceRegistration: true,
      workspaceRound: true,
    },
  });
  if (!attempt) throw new WorkspaceServiceError("Workspace attempt not found.", 404);
  if (attempt.workspaceRegistration.status !== "registered") {
    throw new WorkspaceServiceError("You were removed from this workspace.", 403);
  }
  if (attempt.workspace.status === "archived" || attempt.workspace.status === "ended") {
    throw new WorkspaceServiceError("This workspace round is closed.", 409);
  }
  if (attempt.workspace.status !== "started") {
    throw new WorkspaceServiceError("Workspace is not currently accepting round attempts.", 409);
  }
  if (attempt.status !== "active") {
    throw new WorkspaceServiceError("Workspace round attempt is already finalized.", 409);
  }
  return attempt;
}
