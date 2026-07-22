import { Router } from "express";
import {
  getUserWorkspaceMeByCodeController,
  getMyWorkspaceCandidateDossierController,
  getUserWorkspaceByCodeController,
  getUserWorkspaceLeaderboardController,
  joinUserWorkspaceByCodeController,
  listMyUserWorkspacesController,
  startUserWorkspaceRoundController,
} from "../controllers/userWorkspace.controller.js";
import { requireAuth, requireJobSeeker } from "../middleware/auth.js";
import { invalidateWorkspaceRoundAttemptController } from "../controllers/workspaceAttempt.controller.js";

export const userWorkspacesRouter = Router();

// V1 leaderboard computes rankings by joining registrations/users/round attempts on each request.
// This is acceptable for current workspace sizes; optimize later with a cached WorkspaceLeaderboardEntry table if reads become hot.
userWorkspacesRouter.get(
  "/me",
  requireAuth,
  requireJobSeeker,
  listMyUserWorkspacesController,
);
userWorkspacesRouter.get(
  "/code/:code/leaderboard",
  getUserWorkspaceLeaderboardController,
);
userWorkspacesRouter.get(
  "/code/:code/me",
  requireAuth,
  requireJobSeeker,
  getUserWorkspaceMeByCodeController,
);
userWorkspacesRouter.get(
  "/code/:code/my-dossier",
  requireAuth,
  requireJobSeeker,
  getMyWorkspaceCandidateDossierController,
);
userWorkspacesRouter.get("/code/:code", getUserWorkspaceByCodeController);
userWorkspacesRouter.post(
  "/code/:code/join",
  requireAuth,
  requireJobSeeker,
  joinUserWorkspaceByCodeController,
);
userWorkspacesRouter.post(
  "/code/:code/rounds/:roundId/start",
  requireAuth,
  requireJobSeeker,
  startUserWorkspaceRoundController,
);
userWorkspacesRouter.post(
  "/attempts/:attemptId/invalidate",
  requireAuth,
  requireJobSeeker,
  invalidateWorkspaceRoundAttemptController,
);
