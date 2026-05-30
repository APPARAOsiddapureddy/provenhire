import type { Response } from "express";
import type { AuthedRequest } from "../middleware/auth.js";
import { startWorkspaceRoundAttempt } from "../services/workspaceAttempt.service.js";
import { WorkspaceServiceError } from "../services/workspace.service.js";

function actorFromRequest(req: AuthedRequest) {
  return { id: req.user!.id, role: req.user!.role };
}

function sendError(res: Response, error: unknown) {
  if (error instanceof WorkspaceServiceError) {
    return res.status(error.statusCode).json({ error: error.message });
  }
  console.error("[workspace-attempt]", error);
  return res.status(500).json({ error: "Workspace round attempt operation failed." });
}

export async function startWorkspaceRoundAttemptController(req: AuthedRequest, res: Response) {
  try {
    const result = await startWorkspaceRoundAttempt(actorFromRequest(req), req.params.code, req.params.roundId);
    return res.json(result);
  } catch (error) {
    return sendError(res, error);
  }
}
