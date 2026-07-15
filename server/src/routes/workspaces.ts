import type { NextFunction, Request, Response } from "express";
import { Router } from "express";
import multer from "multer";
import {
  createWorkspaceController,
  deleteWorkspaceController,
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
  getWorkspaceCandidateDossierController,
  generateWorkspaceCandidateReportController,
  listWorkspaceRegistrationsController,
  removeWorkspaceRegistrationController,
  restoreWorkspaceRegistrationController,
} from "../controllers/workspaceRegistration.controller.js";
import { requireAuth } from "../middleware/auth.js";
import { allowWorkspaceCreator } from "../middleware/workspace.js";

export const workspacesRouter = Router();

const WORKSPACE_CREATOR_ROLES = ["admin"] as const;
const csvUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 1024 * 1024 },
});

function uploadWorkspaceAllowedEmailsCsv(req: Request, res: Response, next: NextFunction) {
  csvUpload.single("file")(req, res, (error: unknown) => {
    if (!error) {
      next();
      return;
    }
    if (error instanceof multer.MulterError) {
      const message = error.code === "LIMIT_FILE_SIZE" ? "CSV file must be 1MB or smaller" : "CSV upload failed";
      res.status(400).json({ error: message });
      return;
    }
    next(error);
  });
}

workspacesRouter.use(requireAuth);

workspacesRouter.get("/:id/registrations", listWorkspaceRegistrationsController);
workspacesRouter.get("/:id/registrations/:userId/dossier", getWorkspaceCandidateDossierController);
workspacesRouter.post("/:id/registrations/:userId/reports/generate", generateWorkspaceCandidateReportController);
workspacesRouter.delete("/:id/registrations/:userId", removeWorkspaceRegistrationController);
workspacesRouter.post("/:id/registrations/:userId/restore", restoreWorkspaceRegistrationController);
workspacesRouter.post("/allowed-emails/import", uploadWorkspaceAllowedEmailsCsv, importAllowedWorkspaceEmailsController);

workspacesRouter.use(allowWorkspaceCreator(WORKSPACE_CREATOR_ROLES));

workspacesRouter.post("/", createWorkspaceController);
workspacesRouter.get("/", listWorkspacesController);
workspacesRouter.get("/question-bank/sql", getWorkspaceSqlTaskAvailabilityController);
workspacesRouter.get("/:id", getWorkspaceController);
workspacesRouter.patch("/:id", updateWorkspaceController);
workspacesRouter.put("/:id/rounds", replaceWorkspaceRoundsController);
workspacesRouter.post("/:id/publish", publishWorkspaceController);
workspacesRouter.post("/:id/start", startWorkspaceController);
workspacesRouter.patch("/:id/status", updateWorkspaceStatusController);
workspacesRouter.delete("/:id", deleteWorkspaceController);
