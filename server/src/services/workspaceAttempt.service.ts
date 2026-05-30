import { prisma } from "../config/prisma.js";
import { WorkspaceServiceError, syncWorkspaceLifecycle } from "./workspace.service.js";
import { startWorkspaceMcqSession } from "./mcqSession.service.js";
import { getWorkspaceDsaSessionSnapshot, startWorkspaceDsaSession } from "./workspaceDsaSession.service.js";
import {
  assertWorkspaceRoundStartAllowed,
  normalizeWorkspaceCode,
  type WorkspaceAttemptActor,
} from "./workspaceAttemptGuards.service.js";

export async function startWorkspaceRoundAttempt(actor: WorkspaceAttemptActor, codeInput: string, roundId: string) {
  const code = normalizeWorkspaceCode(codeInput);
  const workspaceRow = await prisma.workspace.findUnique({ where: { code }, select: { id: true } });
  if (workspaceRow) await syncWorkspaceLifecycle(workspaceRow.id);

  const roundType = await prisma.$transaction(async (tx) => {
    const { round } = await assertWorkspaceRoundStartAllowed(tx, actor, code, roundId);
    return round.type;
  });

  if (roundType === "mcq") {
    const snapshot = await startWorkspaceMcqSession(actor, { workspaceCode: code, workspaceRoundId: roundId });
    if (!snapshot.workspaceAttempt) {
      throw new WorkspaceServiceError("Workspace attempt could not be created.", 500);
    }
    return {
      roundType,
      attemptId: snapshot.workspaceAttempt.id,
      sessionId: snapshot.session.id,
      sessionStatus: snapshot.workspaceAttempt.status,
    };
  }

  if (roundType === "coding") {
    const snapshot = await startWorkspaceDsaSession(actor, { workspaceCode: code, workspaceRoundId: roundId });
    return {
      roundType,
      attemptId: snapshot.workspaceAttempt.id,
      sessionId: snapshot.session.id,
      sessionStatus: snapshot.workspaceAttempt.status,
    };
  }

  throw new WorkspaceServiceError("Unsupported workspace round type.", 409);
}

export async function getWorkspaceRoundAttemptSession(actor: WorkspaceAttemptActor, attemptId: string) {
  const attempt = await prisma.workspaceRoundAttempt.findFirst({
    where: { id: attemptId, userId: actor.id },
    select: { roundType: true, mcqSessionId: true, dsaRoundSessionId: true },
  });
  if (!attempt) throw new WorkspaceServiceError("Workspace attempt not found.", 404);
  if (attempt.roundType === "mcq" && attempt.mcqSessionId) {
    return { roundType: attempt.roundType, sessionId: attempt.mcqSessionId };
  }
  if (attempt.roundType === "coding" && attempt.dsaRoundSessionId) {
    await getWorkspaceDsaSessionSnapshot(actor, attempt.dsaRoundSessionId);
    return { roundType: attempt.roundType, sessionId: attempt.dsaRoundSessionId };
  }
  throw new WorkspaceServiceError("Workspace attempt session not found.", 404);
}
