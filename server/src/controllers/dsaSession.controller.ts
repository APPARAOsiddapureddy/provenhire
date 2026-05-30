import type { Response } from "express";
import { z } from "zod";
import { DSA_API_LANGUAGES } from "../constants/dsa.js";
import type { AuthedRequest } from "../middleware/auth.js";
import {
  getWorkspaceDsaSessionSnapshot,
  runWorkspaceDsaTests,
  saveWorkspaceDsaCodeDraft,
  saveWorkspaceDsaFollowUpAnswers,
  startWorkspaceDsaFollowUp,
  submitWorkspaceDsaFollowUpAnswers,
  submitWorkspaceDsaQuestion,
  submitWorkspaceDsaSession,
  updateWorkspaceDsaSession,
} from "../services/workspaceDsaSession.service.js";
import { WorkspaceServiceError } from "../services/workspace.service.js";

const activeQuestionSchema = z.object({
  activeQId: z.string().trim().min(1).nullable().optional(),
});

const codeSchema = z.object({
  questionId: z.string().trim().min(1),
  language: z.enum(DSA_API_LANGUAGES as unknown as [string, ...string[]]),
  code: z.string().max(100_000),
});

const followUpPatchSchema = z.object({
  answers: z.record(z.string()),
});

const followUpSubmitSchema = z.object({
  answers: z.record(z.string()),
  timedOut: z.boolean().optional(),
});

function actorFromRequest(req: AuthedRequest) {
  return { id: req.user!.id, role: req.user!.role };
}

function sendError(res: Response, error: unknown) {
  if (error instanceof WorkspaceServiceError) {
    return res.status(error.statusCode).json({ error: error.message });
  }
  if (error instanceof Error && error.name === "FOLLOW_UP_INCOMPLETE") {
    return res.status(400).json({ error: error.message });
  }
  if (error instanceof Error && error.name === "FOLLOW_UP_CODE_SUBMISSION_REQUIRED") {
    return res.status(409).json({ error: error.message });
  }
  console.error("[dsa-session]", error);
  return res.status(500).json({ error: "DSA session operation failed." });
}

export async function getDsaSessionController(req: AuthedRequest, res: Response) {
  try {
    return res.json(await getWorkspaceDsaSessionSnapshot(actorFromRequest(req), req.params.id));
  } catch (error) {
    return sendError(res, error);
  }
}

export async function updateDsaSessionController(req: AuthedRequest, res: Response) {
  const parsed = activeQuestionSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid DSA session patch", details: parsed.error.flatten() });
  try {
    return res.json(await updateWorkspaceDsaSession(actorFromRequest(req), req.params.id, parsed.data));
  } catch (error) {
    return sendError(res, error);
  }
}

export async function saveDsaCodeController(req: AuthedRequest, res: Response) {
  const parsed = codeSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid DSA code payload", details: parsed.error.flatten() });
  try {
    return res.json(await saveWorkspaceDsaCodeDraft(actorFromRequest(req), req.params.id, parsed.data));
  } catch (error) {
    return sendError(res, error);
  }
}

export async function runDsaTestsController(req: AuthedRequest, res: Response) {
  const parsed = codeSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid DSA run-tests payload", details: parsed.error.flatten() });
  try {
    return res.json(await runWorkspaceDsaTests(actorFromRequest(req), req.params.id, parsed.data));
  } catch (error) {
    return sendError(res, error);
  }
}

export async function submitDsaQuestionController(req: AuthedRequest, res: Response) {
  const parsed = codeSchema.safeParse({ ...req.body, questionId: req.params.questionId });
  if (!parsed.success) return res.status(400).json({ error: "Invalid DSA question submit payload", details: parsed.error.flatten() });
  try {
    return res.json(await submitWorkspaceDsaQuestion(actorFromRequest(req), req.params.id, parsed.data));
  } catch (error) {
    return sendError(res, error);
  }
}

export async function startDsaFollowUpController(req: AuthedRequest, res: Response) {
  try {
    return res.json(await startWorkspaceDsaFollowUp(actorFromRequest(req), req.params.id, req.params.questionId));
  } catch (error) {
    return sendError(res, error);
  }
}

export async function saveDsaFollowUpController(req: AuthedRequest, res: Response) {
  const parsed = followUpPatchSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid follow-up answer draft", details: parsed.error.flatten() });
  try {
    return res.json(await saveWorkspaceDsaFollowUpAnswers(actorFromRequest(req), req.params.id, req.params.questionId, parsed.data.answers));
  } catch (error) {
    return sendError(res, error);
  }
}

export async function submitDsaFollowUpController(req: AuthedRequest, res: Response) {
  const parsed = followUpSubmitSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid follow-up submit payload", details: parsed.error.flatten() });
  try {
    return res.json(await submitWorkspaceDsaFollowUpAnswers(
      actorFromRequest(req),
      req.params.id,
      req.params.questionId,
      parsed.data.answers,
      parsed.data.timedOut === true,
    ));
  } catch (error) {
    return sendError(res, error);
  }
}

export async function submitDsaSessionController(req: AuthedRequest, res: Response) {
  try {
    return res.json(await submitWorkspaceDsaSession(actorFromRequest(req), req.params.id));
  } catch (error) {
    return sendError(res, error);
  }
}
