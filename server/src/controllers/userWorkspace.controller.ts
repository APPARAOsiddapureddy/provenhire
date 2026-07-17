import type { Response } from "express";
import { z } from "zod";
import type { AuthedRequest } from "../middleware/auth.js";
import { WorkspaceServiceError } from "../services/workspace.service.js";
import {
  getPublishedWorkspaceByCode,
  getMyWorkspaceCandidateDossier,
  getWorkspaceWithMyRegistrationByCode,
  getWorkspaceLeaderboardByCode,
  joinWorkspaceByCode,
  listMyWorkspaceRegistrations,
} from "../services/workspaceRegistration.service.js";
import { startWorkspaceRoundAttempt } from "../services/workspaceAttempt.service.js";

function actorFromRequest(req: AuthedRequest) {
  return { id: req.user!.id, role: req.user!.role };
}

function sendError(res: Response, error: unknown) {
  if (error instanceof WorkspaceServiceError) {
    return res.status(error.statusCode).json({ error: error.message });
  }
  console.error("[user-workspace]", error);
  return res.status(500).json({ error: "Workspace operation failed." });
}

export async function getUserWorkspaceByCodeController(
  req: AuthedRequest,
  res: Response,
) {
  try {
    const workspace = await getPublishedWorkspaceByCode(req.params.code);
    return res.json({ workspace });
  } catch (error) {
    return sendError(res, error);
  }
}

export async function getUserWorkspaceLeaderboardController(
  req: AuthedRequest,
  res: Response,
) {
  const parsed = z
    .object({
      limit: z.coerce.number().int().min(1).max(100).default(20),
      cursor: z.string().trim().min(1).optional(),
    })
    .safeParse(req.query);
  if (!parsed.success) {
    return res
      .status(400)
      .json({
        error: "Invalid leaderboard query",
        details: parsed.error.flatten(),
      });
  }

  try {
    const leaderboard = await getWorkspaceLeaderboardByCode(
      req.params.code,
      parsed.data,
    );
    return res.json(leaderboard);
  } catch (error) {
    return sendError(res, error);
  }
}

export async function listMyUserWorkspacesController(
  req: AuthedRequest,
  res: Response,
) {
  try {
    const registrations = await listMyWorkspaceRegistrations(
      actorFromRequest(req),
    );
    return res.json({ registrations });
  } catch (error) {
    return sendError(res, error);
  }
}

export async function getUserWorkspaceMeByCodeController(
  req: AuthedRequest,
  res: Response,
) {
  try {
    const result = await getWorkspaceWithMyRegistrationByCode(
      actorFromRequest(req),
      req.params.code,
    );
    return res.json(result);
  } catch (error) {
    return sendError(res, error);
  }
}

export async function getMyWorkspaceCandidateDossierController(
  req: AuthedRequest,
  res: Response,
) {
  try {
    const dossier = await getMyWorkspaceCandidateDossier(
      actorFromRequest(req),
      req.params.code,
    );
    return res.json({ dossier });
  } catch (error) {
    return sendError(res, error);
  }
}

export async function joinUserWorkspaceByCodeController(
  req: AuthedRequest,
  res: Response,
) {
  try {
    const registration = await joinWorkspaceByCode(
      actorFromRequest(req),
      req.params.code,
    );
    return res.json({ registration });
  } catch (error) {
    return sendError(res, error);
  }
}

export async function startUserWorkspaceRoundController(
  req: AuthedRequest,
  res: Response,
) {
  try {
    const result = await startWorkspaceRoundAttempt(
      actorFromRequest(req),
      req.params.code,
      req.params.roundId,
    );
    return res.json(result);
  } catch (error) {
    return sendError(res, error);
  }
}
