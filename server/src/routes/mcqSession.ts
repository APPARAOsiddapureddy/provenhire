import { Router } from "express";
import {
  getMcqSessionController,
  startMcqSessionController,
  submitMcqSessionController,
  updateMcqSessionController,
} from "../controllers/mcqSession.controller.js";
import { requireAuth, requireJobSeeker } from "../middleware/auth.js";
import {
  mcqSessionStartLimiter,
  mcqSessionSubmitLimiter,
  mcqSessionUpdateLimiter,
} from "../middleware/mcqSessionRateLimit.js";

export const mcqSessionRouter = Router();

mcqSessionRouter.use(requireAuth, requireJobSeeker);

mcqSessionRouter.post("/", mcqSessionStartLimiter, startMcqSessionController);
mcqSessionRouter.get("/:id", getMcqSessionController);
mcqSessionRouter.patch("/:id", mcqSessionUpdateLimiter, updateMcqSessionController);
mcqSessionRouter.post("/:id/submit", mcqSessionSubmitLimiter, submitMcqSessionController);
