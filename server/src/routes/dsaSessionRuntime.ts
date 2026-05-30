import { Router } from "express";
import {
  getDsaSessionController,
  runDsaTestsController,
  saveDsaCodeController,
  saveDsaFollowUpController,
  startDsaFollowUpController,
  submitDsaFollowUpController,
  submitDsaQuestionController,
  submitDsaSessionController,
  updateDsaSessionController,
} from "../controllers/dsaSession.controller.js";
import { requireAuth, requireJobSeeker } from "../middleware/auth.js";

export const dsaSessionRuntimeRouter = Router();

dsaSessionRuntimeRouter.use(requireAuth, requireJobSeeker);

dsaSessionRuntimeRouter.get("/:id", getDsaSessionController);
dsaSessionRuntimeRouter.patch("/:id", updateDsaSessionController);
dsaSessionRuntimeRouter.put("/:id/code", saveDsaCodeController);
dsaSessionRuntimeRouter.post("/:id/run-tests", runDsaTestsController);
dsaSessionRuntimeRouter.post("/:id/questions/:questionId/submit", submitDsaQuestionController);
dsaSessionRuntimeRouter.post("/:id/follow-up/:questionId/start", startDsaFollowUpController);
dsaSessionRuntimeRouter.patch("/:id/follow-up/:questionId", saveDsaFollowUpController);
dsaSessionRuntimeRouter.post("/:id/follow-up/:questionId/submit", submitDsaFollowUpController);
dsaSessionRuntimeRouter.post("/:id/submit", submitDsaSessionController);
