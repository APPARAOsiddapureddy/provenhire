/**
 * Feature flags API — used by frontend to check proctoring/integrity modes.
 * GET requires auth (any role); used by assessment components.
 */
import { Router } from "express";
import { requireAuth, AuthedRequest } from "../middleware/auth.js";
import { getAllFeatureFlags, ensureDefaultFlags } from "../services/featureFlag.service.js";

export const featureFlagsRouter = Router();

/** Fetch all feature flags — used by assessment UI to decide enforcement */
featureFlagsRouter.get("/", requireAuth, async (_req: AuthedRequest, res) => {
  try {
    const flags = await getAllFeatureFlags();
    if (flags.length === 0) {
      await ensureDefaultFlags();
      const updated = await getAllFeatureFlags();
      return res.json({ flags: updated });
    }
    res.json({ flags });
  } catch (e) {
    console.error("[feature-flags] GET", e);
    res.status(500).json({ error: "Failed to load feature flags" });
  }
});
