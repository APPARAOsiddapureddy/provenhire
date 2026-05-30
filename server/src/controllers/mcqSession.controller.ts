import type { Response } from "express";
import { z } from "zod";
import type { AuthedRequest } from "../middleware/auth.js";
import {
  McqSessionServiceError,
  getMcqSessionSnapshot,
  startWorkspaceMcqSession,
  submitMcqSession,
  updateMcqSession,
} from "../services/mcqSession.service.js";
import { WorkspaceServiceError } from "../services/workspace.service.js";

const startSchema = z.object({
  workspaceCode: z.string().trim().min(1),
  workspaceRoundId: z.string().trim().min(1),
});

const answerSchema = z.object({
  questionId: z.string().trim().min(1),
  selectedOption: z.string().max(2_000),
});

const updateSchema = z.object({
  currentQuestionId: z.string().trim().min(1).nullable().optional(),
  answer: answerSchema.optional(),
});

const submitSchema = z.object({
  answer: answerSchema.optional(),
});

function actorFromRequest(req: AuthedRequest) {
  return { id: req.user!.id, role: req.user!.role };
}

function sendError(res: Response, error: unknown) {
  if (error instanceof McqSessionServiceError) {
    return res.status(error.statusCode).json({ error: error.message });
  }
  if (error instanceof WorkspaceServiceError) {
    return res.status(error.statusCode).json({ error: error.message });
  }
  console.error("[mcq-session]", error);
  return res.status(500).json({ error: "MCQ session operation failed." });
}

export async function startMcqSessionController(req: AuthedRequest, res: Response) {
  const parsed = startSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid MCQ session payload", details: parsed.error.flatten() });
  try {
    const snapshot = await startWorkspaceMcqSession(actorFromRequest(req), parsed.data);
    return res.json(snapshot);
  } catch (error) {
    return sendError(res, error);
  }
}

export async function getMcqSessionController(req: AuthedRequest, res: Response) {
  try {
    const snapshot = await getMcqSessionSnapshot(actorFromRequest(req), req.params.id);
    return res.json(snapshot);
  } catch (error) {
    return sendError(res, error);
  }
}

export async function updateMcqSessionController(req: AuthedRequest, res: Response) {
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid MCQ session update", details: parsed.error.flatten() });
  try {
    const snapshot = await updateMcqSession(actorFromRequest(req), req.params.id, parsed.data);
    return res.json(snapshot);
  } catch (error) {
    return sendError(res, error);
  }
}

export async function submitMcqSessionController(req: AuthedRequest, res: Response) {
  const parsed = submitSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: "Invalid MCQ submit payload", details: parsed.error.flatten() });
  try {
    const snapshot = await submitMcqSession(actorFromRequest(req), req.params.id, parsed.data.answer);
    return res.json(snapshot);
  } catch (error) {
    return sendError(res, error);
  }
}
