import type { NextFunction, Request, Response } from "express";
import { Router } from "express";
import multer from "multer";
import {
  createWorkspaceController,
  deleteWorkspaceController,
  endWorkspaceController,
  getWorkspaceController,
  getWorkspaceSqlTaskAvailabilityController,
  listWorkspacesController,
  publishWorkspaceController,
  replaceWorkspaceRoundsController,
  startWorkspaceController,
  updateWorkspaceController,
  updateWorkspaceStatusController,
} from "../controllers/workspace.controller.js";
import {
  importAllowedWorkspaceEmailsController,
  addAllowedWorkspaceEmailsController,
  getWorkspaceCandidateDossierController,
  generateWorkspaceCandidateReportController,
  listWorkspaceRegistrationsController,
  listAllowedWorkspaceEmailsController,
  listWorkspaceAuditTrailController,
  recordWorkspaceCandidateDecisionController,
  removeWorkspaceRegistrationController,
  restoreWorkspaceRegistrationController,
  revokeAllowedWorkspaceEmailController,
} from "../controllers/workspaceRegistration.controller.js";
import { requireAuth } from "../middleware/auth.js";
import { allowWorkspaceCreator } from "../middleware/workspace.js";
import {
  listWorkspaceTechnicalDesk,
  resolveAssessmentIncident,
  retryAssessmentWorkflowJob,
} from "../services/assessmentWorkflow.service.js";

export const workspacesRouter = Router();

const WORKSPACE_CREATOR_ROLES = ["admin"] as const;
const csvUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 1024 * 1024 },
});

function uploadWorkspaceAllowedEmailsCsv(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  csvUpload.single("file")(req, res, (error: unknown) => {
    if (!error) {
      next();
      return;
    }
    if (error instanceof multer.MulterError) {
      const message =
        error.code === "LIMIT_FILE_SIZE"
          ? "CSV file must be 1MB or smaller"
          : "CSV upload failed";
      res.status(400).json({ error: message });
      return;
    }
    next(error);
  });
}

workspacesRouter.use(requireAuth);

workspacesRouter.get(
  "/:id/registrations",
  listWorkspaceRegistrationsController,
);
workspacesRouter.get(
  "/:id/registrations/:userId/dossier",
  getWorkspaceCandidateDossierController,
);
workspacesRouter.post(
  "/:id/registrations/:userId/reports/generate",
  generateWorkspaceCandidateReportController,
);
workspacesRouter.put(
  "/:id/registrations/:userId/decision",
  recordWorkspaceCandidateDecisionController,
);
workspacesRouter.delete(
  "/:id/registrations/:userId",
  removeWorkspaceRegistrationController,
);
workspacesRouter.post(
  "/:id/registrations/:userId/restore",
  restoreWorkspaceRegistrationController,
);
workspacesRouter.post(
  "/allowed-emails/import",
  uploadWorkspaceAllowedEmailsCsv,
  importAllowedWorkspaceEmailsController,
);
workspacesRouter.get("/:id/allowed-emails", listAllowedWorkspaceEmailsController);
workspacesRouter.post("/:id/allowed-emails", addAllowedWorkspaceEmailsController);
workspacesRouter.delete(
  "/:id/allowed-emails/:invitationId",
  revokeAllowedWorkspaceEmailController,
);
workspacesRouter.get("/:id/audit-trail", listWorkspaceAuditTrailController);

workspacesRouter.use(allowWorkspaceCreator(WORKSPACE_CREATOR_ROLES));

workspacesRouter.post("/", createWorkspaceController);
workspacesRouter.get("/", listWorkspacesController);
workspacesRouter.get(
  "/question-bank/sql",
  getWorkspaceSqlTaskAvailabilityController,
);
workspacesRouter.get("/:id/technical-desk", async (req, res, next) => {
  try {
    res.json(await listWorkspaceTechnicalDesk(req.params.id));
  } catch (error) {
    next(error);
  }
});
workspacesRouter.post("/:id/technical-desk/jobs/:jobId/retry", async (req, res, next) => {
  try {
    res.json({ job: await retryAssessmentWorkflowJob(req.params.id, req.params.jobId) });
  } catch (error) {
    next(error);
  }
});
workspacesRouter.post("/:id/technical-desk/incidents/:incidentId/resolve", async (req, res, next) => {
  try {
    res.json({ incident: await resolveAssessmentIncident(req.params.id, req.params.incidentId) });
  } catch (error) {
    next(error);
  }
});
workspacesRouter.get("/:id", getWorkspaceController);
workspacesRouter.patch("/:id", updateWorkspaceController);

workspacesRouter.put("/:id/rounds", replaceWorkspaceRoundsController);

workspacesRouter.post("/:id/publish", publishWorkspaceController);
workspacesRouter.post("/:id/start", startWorkspaceController);
workspacesRouter.post("/:id/end", endWorkspaceController);
workspacesRouter.patch("/:id/status", updateWorkspaceStatusController);
workspacesRouter.delete("/:id", deleteWorkspaceController);
