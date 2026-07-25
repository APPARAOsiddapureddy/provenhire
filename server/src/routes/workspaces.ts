import type { NextFunction, Request, Response } from "express";
import { Router } from "express";
import multer from "multer";
import {
  createWorkspaceController,
  deleteWorkspaceController,
  getWorkspaceCollegeCredentialsController,
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
  sendWorkspaceInvitationsController,
  provisionWorkspaceStudentsController,
  addWorkspaceMemberController,
  getWorkspaceAnalyticsController,
  getWorkspaceCandidateDossierController,
  generateWorkspaceCandidateReportController,
  listWorkspaceRegistrationsController,
  listAllowedWorkspaceEmailsController,
  listWorkspaceAuditTrailController,
  listWorkspaceMembersController,
  recordWorkspaceCandidateDecisionController,
  removeWorkspaceMemberController,
  removeWorkspaceRegistrationController,
  restoreWorkspaceRegistrationController,
  revokeAllowedWorkspaceEmailController,
  transferWorkspaceOwnershipController,
} from "../controllers/workspaceRegistration.controller.js";
import { requireAuth } from "../middleware/auth.js";
import { allowWorkspaceCreator } from "../middleware/workspace.js";
import {
  listWorkspaceTechnicalDesk,
  resolveAssessmentIncident,
  retryAssessmentWorkflowJob,
} from "../services/assessmentWorkflow.service.js";

export const workspacesRouter = Router();

// Institutions manage their own campus drives through this same router; every
// handler below is already tenant-scoped via ownerWhere()/assertCanManage*,
// which for an institution actor resolves to that institution's own drives only.
const WORKSPACE_CREATOR_ROLES = ["admin", "institution"] as const;
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
// Emailing the roster is a separate, explicit action from building it.
workspacesRouter.post("/:id/allowed-emails/send", sendWorkspaceInvitationsController);
// Pre-creates student accounts, returning single-use activation links (never passwords).
workspacesRouter.post("/:id/students/provision", provisionWorkspaceStudentsController);
workspacesRouter.delete(
  "/:id/allowed-emails/:invitationId",
  revokeAllowedWorkspaceEmailController,
);
workspacesRouter.get("/:id/audit-trail", listWorkspaceAuditTrailController);
workspacesRouter.get("/:id/analytics", getWorkspaceAnalyticsController);
workspacesRouter.get("/:id/members", listWorkspaceMembersController);
workspacesRouter.post("/:id/members", addWorkspaceMemberController);
workspacesRouter.delete("/:id/members/:userId", removeWorkspaceMemberController);
workspacesRouter.post(
  "/:id/transfer-ownership",
  transferWorkspaceOwnershipController,
);

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
workspacesRouter.get(
  "/:id/college-credentials",
  getWorkspaceCollegeCredentialsController,
);
workspacesRouter.get("/:id", getWorkspaceController);
workspacesRouter.patch("/:id", updateWorkspaceController);

workspacesRouter.put("/:id/rounds", replaceWorkspaceRoundsController);

workspacesRouter.post("/:id/publish", publishWorkspaceController);
workspacesRouter.post("/:id/start", startWorkspaceController);
workspacesRouter.post("/:id/end", endWorkspaceController);
workspacesRouter.patch("/:id/status", updateWorkspaceStatusController);
workspacesRouter.delete("/:id", deleteWorkspaceController);
