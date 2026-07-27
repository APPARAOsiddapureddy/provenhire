import { Router } from "express";
import {
  collegeSignInController,
  endCollegeWorkspaceController,
  getCollegeLeaderboardController,
  getCollegeWorkspaceController,
  listCollegeRegistrationsController,
  removeCollegeRegistrationController,
  restoreCollegeRegistrationController,
  startCollegeWorkspaceController,
} from "../controllers/collegeAuth.controller.js";
import { requireCollegeAuth } from "../middleware/collegeAuth.js";

export const collegeRouter = Router();

collegeRouter.post("/sign-in", collegeSignInController);
collegeRouter.get("/me", requireCollegeAuth, getCollegeWorkspaceController);
collegeRouter.get(
  "/leaderboard",
  requireCollegeAuth,
  getCollegeLeaderboardController,
);
collegeRouter.post(
  "/workspace/start",
  requireCollegeAuth,
  startCollegeWorkspaceController,
);
collegeRouter.post(
  "/workspace/end",
  requireCollegeAuth,
  endCollegeWorkspaceController,
);
// Registrations are always scoped to the workspace on the token, so there is no
// workspace id in any of these paths.
collegeRouter.get(
  "/registrations",
  requireCollegeAuth,
  listCollegeRegistrationsController,
);
collegeRouter.delete(
  "/registrations/:userId",
  requireCollegeAuth,
  removeCollegeRegistrationController,
);
collegeRouter.post(
  "/registrations/:userId/restore",
  requireCollegeAuth,
  restoreCollegeRegistrationController,
);
