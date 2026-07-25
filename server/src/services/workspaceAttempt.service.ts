import { prisma } from "../config/prisma.js";
import {
  WorkspaceServiceError,
  syncWorkspaceLifecycle,
} from "./workspace.service.js";
import { startWorkspaceMcqSession } from "./mcqSession.service.js";
import {
  getWorkspaceDsaSessionSnapshot,
  startWorkspaceDsaSession,
} from "./workspaceDsaSession.service.js";
import {
  getWorkspaceSqlSessionSnapshot,
  startWorkspaceSqlSession,
} from "./workspaceSqlSession.service.js";
import {
  assertWorkspaceRoundStartAllowed,
  normalizeWorkspaceCode,
  type WorkspaceAttemptActor,
} from "./workspaceAttemptGuards.service.js";
import { recordWorkspaceAuditEvent } from "./workspaceAudit.service.js";

const PROCTORING_TERMINATION_REASONS = [
  "NO_FACE_DETECTED",
  "MULTIPLE_FACES_DETECTED",
  "PHONE_DETECTED",
  "TAB_SWITCH",
  "FULLSCREEN_EXIT",
  "MULTIPLE_VOICES_DETECTED",
  "SUSPICIOUS_BACKGROUND_NOISE",
  "LOOKING_AWAY_FROM_SCREEN",
  "LOW_VISIBILITY",
  "CANDIDATE_SPEAKING_DURING_CODING",
  "MICROPHONE_MUTED_ATTEMPT",
  "WINDOW_FOCUS_LOST",
  "WINDOW_MINIMIZED",
  "COPY_PASTE_ATTEMPT",
  "DEVTOOLS_OPENED",
  "SERVER_THRESHOLD",
] as const;

export type WorkspaceProctoringTerminationReason =
  (typeof PROCTORING_TERMINATION_REASONS)[number];

export function isWorkspaceProctoringTerminationReason(
  value: string,
): value is WorkspaceProctoringTerminationReason {
  return PROCTORING_TERMINATION_REASONS.includes(
    value as WorkspaceProctoringTerminationReason,
  );
}

export async function startWorkspaceRoundAttempt(
  actor: WorkspaceAttemptActor,
  codeInput: string,
  roundId: string,
) {
  const code = normalizeWorkspaceCode(codeInput);
  const workspaceRow = await prisma.workspace.findUnique({
    where: { code },
    select: { id: true },
  });
  if (workspaceRow) await syncWorkspaceLifecycle(workspaceRow.id);

  const roundType = await prisma.$transaction(async (tx) => {
    const { round } = await assertWorkspaceRoundStartAllowed(
      tx,
      actor,
      code,
      roundId,
    );
    return round.type;
  });

  if (roundType === "mcq") {
    const snapshot = await startWorkspaceMcqSession(actor, {
      workspaceCode: code,
      workspaceRoundId: roundId,
    });
    if (!snapshot.workspaceAttempt) {
      throw new WorkspaceServiceError(
        "Workspace attempt could not be created.",
        500,
      );
    }
    return {
      roundType,
      attemptId: snapshot.workspaceAttempt.id,
      sessionId: snapshot.session.id,
      sessionStatus: snapshot.workspaceAttempt.status,
    };
  }

  if (roundType === "coding") {
    const snapshot = await startWorkspaceDsaSession(actor, {
      workspaceCode: code,
      workspaceRoundId: roundId,
    });
    return {
      roundType,
      attemptId: snapshot.workspaceAttempt.id,
      sessionId: snapshot.session.id,
      sessionStatus: snapshot.workspaceAttempt.status,
    };
  }

  if (roundType === "sql") {
    const snapshot = await startWorkspaceSqlSession(actor, {
      workspaceCode: code,
      workspaceRoundId: roundId,
    });
    return {
      roundType,
      attemptId: snapshot.workspaceAttempt.id,
      sessionId: snapshot.session.id,
      sessionStatus: snapshot.workspaceAttempt.status,
    };
  }

  if (roundType === "interview") {
    const attempt = await prisma.$transaction(async (tx) => {
      const { workspace, round, registration } =
        await assertWorkspaceRoundStartAllowed(tx, actor, code, roundId);
      return tx.workspaceRoundAttempt.upsert({
        where: {
          workspaceRegistrationId_workspaceRoundId: {
            workspaceRegistrationId: registration.id,
            workspaceRoundId: round.id,
          },
        },
        create: {
          workspaceId: workspace.id,
          workspaceRoundId: round.id,
          workspaceRegistrationId: registration.id,
          userId: actor.id,
          roundType: "interview",
        },
        update: {},
        select: {
          id: true,
          status: true,
          interviewId: true,
          workspace: { select: { targetRole: true } },
        },
      });
    });
    if (attempt.status !== "active") {
      throw new WorkspaceServiceError(
        "Workspace interview attempt is already finalized.",
        409,
      );
    }
    return {
      roundType,
      attemptId: attempt.id,
      sessionId: attempt.interviewId ?? attempt.id,
      sessionStatus: attempt.status,
      targetRole: attempt.workspace.targetRole,
    };
  }

  throw new WorkspaceServiceError("Unsupported workspace round type.", 409);
}

export async function getWorkspaceRoundAttemptSession(
  actor: WorkspaceAttemptActor,
  attemptId: string,
) {
  const attempt = await prisma.workspaceRoundAttempt.findFirst({
    where: { id: attemptId, userId: actor.id },
    select: {
      roundType: true,
      mcqSessionId: true,
      dsaRoundSessionId: true,
      sqlSessionId: true,
      interviewId: true,
    },
  });
  if (!attempt)
    throw new WorkspaceServiceError("Workspace attempt not found.", 404);
  if (attempt.roundType === "mcq" && attempt.mcqSessionId) {
    return { roundType: attempt.roundType, sessionId: attempt.mcqSessionId };
  }
  if (attempt.roundType === "coding" && attempt.dsaRoundSessionId) {
    await getWorkspaceDsaSessionSnapshot(actor, attempt.dsaRoundSessionId);
    return {
      roundType: attempt.roundType,
      sessionId: attempt.dsaRoundSessionId,
    };
  }
  if (attempt.roundType === "sql" && attempt.sqlSessionId) {
    await getWorkspaceSqlSessionSnapshot(actor, attempt.sqlSessionId);
    return { roundType: attempt.roundType, sessionId: attempt.sqlSessionId };
  }
  if (attempt.roundType === "interview") {
    return {
      roundType: attempt.roundType,
      sessionId: attempt.interviewId ?? attemptId,
      workspaceAttemptId: attemptId,
    };
  }
  throw new WorkspaceServiceError("Workspace attempt session not found.", 404);
}

/**
 * Permanently closes the authenticated candidate's active workspace attempt
 * after strict proctoring terminates the browser session. The update is
 * idempotent because the client can receive both a local strike threshold and
 * the server STOP_TEST response for the same signal.
 */
export async function invalidateWorkspaceRoundAttemptForProctoring(
  actor: WorkspaceAttemptActor,
  attemptId: string,
  reason: WorkspaceProctoringTerminationReason,
) {
  if (actor.role !== "jobseeker") {
    throw new WorkspaceServiceError("Job seeker access required.", 403);
  }

  const attempt = await prisma.workspaceRoundAttempt.findFirst({
    where: { id: attemptId, userId: actor.id },
    select: {
      id: true,
      status: true,
      workspaceId: true,
      roundType: true,
      mcqSessionId: true,
      dsaRoundSessionId: true,
      sqlSessionId: true,
    },
  });
  if (!attempt) {
    throw new WorkspaceServiceError("Workspace attempt not found.", 404);
  }
  if (attempt.status === "discarded") {
    return { attemptId: attempt.id, status: attempt.status, invalidated: true };
  }
  if (attempt.status !== "active") {
    throw new WorkspaceServiceError(
      "A completed workspace attempt cannot be invalidated.",
      409,
    );
  }

  const finalizedAt = new Date();
  await prisma.$transaction(async (tx) => {
    await tx.workspaceRoundAttempt.updateMany({
      where: { id: attempt.id, userId: actor.id, status: "active" },
      data: {
        status: "discarded",
        score: 0,
        percentageScore: 0,
        weightedScore: 0,
        completedAt: finalizedAt,
      },
    });
    if (attempt.mcqSessionId) {
      await tx.mcqSession.updateMany({
        where: { id: attempt.mcqSessionId, userId: actor.id, status: "active" },
        data: { status: "discarded", finalizedAt },
      });
    }
    // DSA round sessions do not own a status column. The linked workspace
    // attempt is the authoritative write guard and is now discarded.
    if (attempt.sqlSessionId) {
      await tx.workspaceSqlSession.updateMany({
        where: { id: attempt.sqlSessionId, userId: actor.id, status: "active" },
        data: { status: "discarded", finalizedAt },
      });
    }
  });

  await recordWorkspaceAuditEvent({
    workspaceId: attempt.workspaceId,
    actorUserId: actor.id,
    targetUserId: actor.id,
    eventType: "workspace_attempt_proctoring_invalidated",
    detail: {
      attemptId: attempt.id,
      roundType: attempt.roundType,
      reason,
      finalizedAt: finalizedAt.toISOString(),
    },
  });

  return { attemptId: attempt.id, status: "discarded" as const, invalidated: true };
}
