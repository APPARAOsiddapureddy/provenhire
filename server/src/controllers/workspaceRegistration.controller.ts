import type { Response } from "express";
import { z } from "zod";
import type { AuthedRequest } from "../middleware/auth.js";
import { WorkspaceServiceError } from "../services/workspace.service.js";
import {
  importAllowedWorkspaceEmailsFromCsv,
  addAllowedWorkspaceEmails,
  getWorkspaceCandidateDossier,
  listAllowedWorkspaceEmails,
  listWorkspaceAuditTrail,
  listWorkspaceRegistrations,
  recordWorkspaceCandidateDecision,
  removeWorkspaceRegistration,
  restoreWorkspaceRegistration,
  revokeAllowedWorkspaceEmail,
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

export async function getWorkspaceCandidateDossierController(
  req: AuthedRequest,
  res: Response,
) {
  try {
    const dossier = await getWorkspaceCandidateDossier(
      actorFromRequest(req),
      req.params.id,
      req.params.userId,
    );
    return res.json({ dossier });
  } catch (error) {
    return sendError(res, error);
  }
}

export async function generateWorkspaceCandidateReportController(
  req: AuthedRequest,
  res: Response,
) {
  const parsed = z
    .object({ kind: z.enum(["dsa", "unified"]), force: z.boolean().optional() })
    .safeParse(req.body ?? {});
  if (!parsed.success)
    return res.status(400).json({ error: "kind must be dsa or unified" });
  try {
    const generation = await generateAssessmentReport(
      actorFromRequest(req),
      req.params.id,
      req.params.userId,
      parsed.data.kind,
      Boolean(parsed.data.force),
    );
    return res.json({ generation });
  } catch (error) {
    return sendError(res, error);
  }
}

const decisionSchema = z.object({
  outcome: z.enum(["advance", "hold", "reject", "additional_evidence"]),
  rationale: z.string().trim().min(30).max(5000),
  rubricAssessments: z
    .array(
      z.object({
        responsibility: z.string().trim().min(3).max(500),
        rating: z.enum(["meets", "partial", "not_demonstrated", "conflicting"]),
        rationale: z.string().trim().min(10).max(2000),
        evidenceRefs: z.array(z.string().trim().min(2).max(300)).min(1).max(12),
      }),
    )
    .min(3)
    .max(12),
});

export async function recordWorkspaceCandidateDecisionController(
  req: AuthedRequest,
  res: Response,
) {
  const parsed = decisionSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json({
      error: "Invalid workspace decision payload.",
      details: parsed.error.flatten(),
    });
  }
  try {
    const decision = await recordWorkspaceCandidateDecision(
      actorFromRequest(req),
      req.params.id,
      req.params.userId,
      parsed.data,
    );
    return res.json({ decision });
  } catch (error) {
    return sendError(res, error);
  }
}

function sendError(res: Response, error: unknown) {
  if (error instanceof WorkspaceServiceError) {
    return res.status(error.statusCode).json({ error: error.message });
  }
  console.error("[workspace-registration]", error);
  return res
    .status(500)
    .json({ error: "Workspace registration operation failed." });
}

export async function listWorkspaceRegistrationsController(
  req: AuthedRequest,
  res: Response,
) {
  try {
    const registrations = await listWorkspaceRegistrations(
      actorFromRequest(req),
      req.params.id,
    );
    return res.json({ registrations });
  } catch (error) {
    return sendError(res, error);
  }
}

export async function removeWorkspaceRegistrationController(
  req: AuthedRequest,
  res: Response,
) {
  try {
    const registration = await removeWorkspaceRegistration(
      actorFromRequest(req),
      req.params.id,
      req.params.userId,
    );
    return res.json({ registration });
  } catch (error) {
    return sendError(res, error);
  }
}

export async function restoreWorkspaceRegistrationController(
  req: AuthedRequest,
  res: Response,
) {
  try {
    const registration = await restoreWorkspaceRegistration(
      actorFromRequest(req),
      req.params.id,
      req.params.userId,
    );
    return res.json({ registration });
  } catch (error) {
    return sendError(res, error);
  }
}

export async function importAllowedWorkspaceEmailsController(
  req: MulterRequest,
  res: Response,
) {
  const parsed = z
    .object({ workspaceCode: z.string().trim().min(1) })
    .safeParse(req.body ?? {});
  if (!parsed.success) {
    return res
      .status(400)
      .json({
        error: "workspaceCode is required",
        details: parsed.error.flatten(),
      });
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

export async function listAllowedWorkspaceEmailsController(
  req: AuthedRequest,
  res: Response,
) {
  try {
    return res.json({
      invitations: await listAllowedWorkspaceEmails(
        actorFromRequest(req),
        req.params.id,
      ),
    });
  } catch (error) {
    return sendError(res, error);
  }
}

export async function addAllowedWorkspaceEmailsController(
  req: AuthedRequest,
  res: Response,
) {
  const parsed = z.object({
    emails: z.array(z.string().trim().min(3).max(320)).min(1).max(200),
  }).safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json({ error: "Provide between 1 and 200 invitation emails." });
  }
  try {
    return res.status(201).json(await addAllowedWorkspaceEmails({
      actor: actorFromRequest(req),
      workspaceId: req.params.id,
      emails: parsed.data.emails,
    }));
  } catch (error) {
    return sendError(res, error);
  }
}

export async function revokeAllowedWorkspaceEmailController(
  req: AuthedRequest,
  res: Response,
) {
  try {
    return res.json(await revokeAllowedWorkspaceEmail({
      actor: actorFromRequest(req),
      workspaceId: req.params.id,
      invitationId: req.params.invitationId,
    }));
  } catch (error) {
    return sendError(res, error);
  }
}

export async function listWorkspaceAuditTrailController(
  req: AuthedRequest,
  res: Response,
) {
  try {
    return res.json({
      events: await listWorkspaceAuditTrail(actorFromRequest(req), req.params.id),
    });
  } catch (error) {
    return sendError(res, error);
  }
}
