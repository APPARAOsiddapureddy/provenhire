import { Router } from "express";
import { z } from "zod";
import { requireAuth, requireJobSeeker, AuthedRequest } from "../middleware/auth.js";
import {
  buildRelevantModuleContext,
  getCandidateContext,
  type DownstreamModule,
} from "../services/performancePipeline.js";

export const candidateContextRouter = Router();

const moduleSchema = z
  .enum(["overview", "antigravity", "ai_skills", "system_design"])
  .optional();

candidateContextRouter.get(
  "/",
  requireAuth,
  requireJobSeeker,
  async (req: AuthedRequest, res) => {
    try {
      const ctx = await getCandidateContext(req.user!.id);
      const parsedModule = moduleSchema.safeParse(req.query.module);
      const targetModule = parsedModule.success
        ? (parsedModule.data as DownstreamModule | undefined)
        : undefined;
      if (!targetModule) {
        return res.json(ctx);
      }

      const moduleContext = buildRelevantModuleContext(ctx.state, targetModule);
      return res.json({ ...ctx, moduleContext });
    } catch (e) {
      console.error("[candidate-context]", e);
      return res.status(500).json({ error: "Failed to fetch candidate context" });
    }
  }
);
