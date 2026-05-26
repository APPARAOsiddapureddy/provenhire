import { Router } from "express";
import {
  createWorkspaceController,
  getWorkspaceController,
  listWorkspacesController,
  publishWorkspaceController,
  replaceWorkspaceRoundsController,
  updateWorkspaceController,
  updateWorkspaceStatusController,
} from "../controllers/workspace.controller.js";
import { requireAuth } from "../middleware/auth.js";
import { allowWorkspaceCreator } from "../middleware/workspace.js";

export const workspacesRouter = Router();

const WORKSPACE_CREATOR_ROLES = ["admin"] as const;

workspacesRouter.use(requireAuth, allowWorkspaceCreator(WORKSPACE_CREATOR_ROLES));

workspacesRouter.post("/", createWorkspaceController);
workspacesRouter.get("/", listWorkspacesController);
workspacesRouter.get("/:id", getWorkspaceController);
workspacesRouter.patch("/:id", updateWorkspaceController);
workspacesRouter.put("/:id/rounds", replaceWorkspaceRoundsController);
workspacesRouter.post("/:id/publish", publishWorkspaceController);
workspacesRouter.patch("/:id/status", updateWorkspaceStatusController);
