import { Router } from "express";
import { getDsaFollowUps, submitDsaFollowUps } from "../controllers/dsaFollowUps.controller.js";
import { requireAuth, requireJobSeeker } from "../middleware/auth.js";

export const dsaFollowUpsRouter = Router();

dsaFollowUpsRouter.use(requireAuth, requireJobSeeker);

dsaFollowUpsRouter.get("/:questionId", getDsaFollowUps);
dsaFollowUpsRouter.post("/:questionId", submitDsaFollowUps);
