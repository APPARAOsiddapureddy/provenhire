import type { Response } from "express";
import { z } from "zod";
import type { AuthedRequest } from "../middleware/auth.js";
import {
  WorkspaceServiceError,
} from "../services/workspace.service.js";
import {
  importAllowedWorkspaceEmailsFromCsv,
  getWorkspaceCandidateDossier,
  listWorkspaceRegistrations,
  removeWorkspaceRegistration,
  restoreWorkspaceRegistration,
} from "../services/workspaceRegistration.service.js";
import { generateAssessmentReport } from "../services/assessmentReportAgent.service.js";

type UploadedCsvFile = {
  buffer: Buffer;
  originalname?: string;
  mimetype?: string;
};

type MulterRequest = AuthedRequest & { file?: UploadedCsvFile };

function actorFromRequest(req: AuthedRequest) {
  return { id: req.user!.id, role: req.user!.role };
}

export async function getWorkspaceCandidateDossierController(req: AuthedRequest, res: Response) {
  try {
    const dossier = await getWorkspaceCandidateDossier(actorFromRequest(req), req.params.id, req.params.userId);
    return res.json({ dossier });
  } catch (error) {
    return sendError(res, error);
  }
}

export async function generateWorkspaceCandidateReportController(req: AuthedRequest, res: Response) {
  const parsed = z.object({ kind: z.enum(["dsa", "unified"]), force: z.boolean().optional() }).safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: "kind must be dsa or unified" });
  try {
    const generation = await generateAssessmentReport(actorFromRequest(req), req.params.id, req.params.userId, parsed.data.kind, Boolean(parsed.data.force));
    return res.json({ generation });
  } catch (error) {
    return sendError(res, error);
  }
}

function sendError(res: Response, error: unknown) {
  if (error instanceof WorkspaceServiceError) {
    return res.status(error.statusCode).json({ error: error.message });
  }
  console.error("[workspace-registration]", error);
  return res.status(500).json({ error: "Workspace registration operation failed." });
}

export async function listWorkspaceRegistrationsController(req: AuthedRequest, res: Response) {
  try {
    const registrations = await listWorkspaceRegistrations(actorFromRequest(req), req.params.id);
    return res.json({ registrations });
  } catch (error) {
    return sendError(res, error);
  }
}

export async function removeWorkspaceRegistrationController(req: AuthedRequest, res: Response) {
  try {
    const registration = await removeWorkspaceRegistration(actorFromRequest(req), req.params.id, req.params.userId);
    return res.json({ registration });
  } catch (error) {
    return sendError(res, error);
  }
}

export async function restoreWorkspaceRegistrationController(req: AuthedRequest, res: Response) {
  try {
    const registration = await restoreWorkspaceRegistration(actorFromRequest(req), req.params.id, req.params.userId);
    return res.json({ registration });
  } catch (error) {
    return sendError(res, error);
  }
}

export async function importAllowedWorkspaceEmailsController(req: MulterRequest, res: Response) {
  const parsed = z.object({ workspaceCode: z.string().trim().min(1) }).safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json({ error: "workspaceCode is required", details: parsed.error.flatten() });
  }
  if (!req.file?.buffer) {
    return res.status(400).json({ error: "CSV file is required" });
  }
  const fileName = req.file.originalname ?? "";
  const mime = req.file.mimetype ?? "";
  const looksCsv =
    fileName.toLowerCase().endsWith(".csv") ||
    mime === "text/csv" ||
    mime === "text/plain" ||
    mime === "application/vnd.ms-excel";
  if (!looksCsv) {
    return res.status(400).json({ error: "Only CSV files are accepted" });
  }

  try {
    const summary = await importAllowedWorkspaceEmailsFromCsv({
      actor: actorFromRequest(req),
      workspaceCode: parsed.data.workspaceCode,
      csvBuffer: req.file.buffer,
    });
    return res.json({ summary });
  } catch (error) {
    return sendError(res, error);
  }
}
