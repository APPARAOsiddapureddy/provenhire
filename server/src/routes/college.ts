import { Router } from "express";
import {
  collegeSignInController,
  getCollegeLeaderboardController,
  getCollegeWorkspaceController,
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
