import type { Response } from "express";
import { z } from "zod";
import type { AuthedRequest } from "../middleware/auth.js";
import { SQL_QUERY_MAX_CHARS } from "../services/workspaceSqlEvaluation.service.js";
import {
  WorkspaceSqlSessionServiceError,
  getWorkspaceSqlSessionSnapshot,
  runWorkspaceSqlTests,
  submitWorkspaceSqlSession,
  submitWorkspaceSqlTask,
  updateWorkspaceSqlSession,
} from "../services/workspaceSqlSession.service.js";
import { WorkspaceServiceError } from "../services/workspace.service.js";

const draftSchema = z.object({
  taskId: z.string().trim().min(1),
  query: z.string().max(SQL_QUERY_MAX_CHARS),
});

const updateSchema = z.object({
  currentTaskId: z.string().trim().min(1).nullable().optional(),
  draft: draftSchema.optional(),
});

const querySchema = z.object({
  taskId: z.string().trim().min(1),
  query: z.string().max(SQL_QUERY_MAX_CHARS),
});

function actorFromRequest(req: AuthedRequest) {
  return { id: req.user!.id, role: req.user!.role };
}

function sendError(res: Response, error: unknown) {
  if (error instanceof WorkspaceSqlSessionServiceError) {
    return res.status(error.statusCode).json({ error: error.message });
  }
  if (error instanceof WorkspaceServiceError) {
    return res.status(error.statusCode).json({ error: error.message });
  }
  console.error("[sql-session]", error);
  return res.status(500).json({ error: "SQL session operation failed." });
}

export async function getSqlSessionController(req: AuthedRequest, res: Response) {
  try {
    const snapshot = await getWorkspaceSqlSessionSnapshot(actorFromRequest(req), req.params.id);
    return res.json(snapshot);
  } catch (error) {
    return sendError(res, error);
  }
}

export async function updateSqlSessionController(req: AuthedRequest, res: Response) {
  const parsed = updateSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: "Invalid SQL session update", details: parsed.error.flatten() });
  try {
    const result = await updateWorkspaceSqlSession(actorFromRequest(req), req.params.id, parsed.data);
    return res.json(result);
  } catch (error) {
    return sendError(res, error);
  }
}

export async function runSqlTestsController(req: AuthedRequest, res: Response) {
  const parsed = querySchema.safeParse({ ...(req.body ?? {}), taskId: req.body?.taskId ?? req.params.taskId });
  if (!parsed.success) return res.status(400).json({ error: "Invalid SQL run payload", details: parsed.error.flatten() });
  try {
    const result = await runWorkspaceSqlTests(actorFromRequest(req), req.params.id, parsed.data);
    return res.json(result);
  } catch (error) {
    return sendError(res, error);
  }
}

export async function submitSqlTaskController(req: AuthedRequest, res: Response) {
  const parsed = querySchema.safeParse({ ...(req.body ?? {}), taskId: req.params.taskId });
  if (!parsed.success) return res.status(400).json({ error: "Invalid SQL submit payload", details: parsed.error.flatten() });
  try {
    const result = await submitWorkspaceSqlTask(actorFromRequest(req), req.params.id, parsed.data);
    return res.json(result);
  } catch (error) {
    return sendError(res, error);
  }
}

export async function submitSqlSessionController(req: AuthedRequest, res: Response) {
  try {
    const snapshot = await submitWorkspaceSqlSession(actorFromRequest(req), req.params.id);
    return res.json(snapshot);
  } catch (error) {
    return sendError(res, error);
  }
}
