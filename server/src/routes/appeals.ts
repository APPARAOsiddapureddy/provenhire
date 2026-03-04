import { Router } from "express";
import { z } from "zod";
import { requireAuth, AuthedRequest } from "../middleware/auth.js";
import { prisma } from "../config/prisma.js";

export const appealsRouter = Router();

appealsRouter.post("/", requireAuth, async (req: AuthedRequest, res) => {
  const schema = z.object({
    testId: z.string(),
    testType: z.enum(["aptitude", "dsa"]),
    appealReason: z.string().min(1),
    supportingEvidence: z.string().optional(),
    evidenceUrl: z.string().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid payload" });
  const appeal = await prisma.appeal.create({
    data: {
      userId: req.user!.id,
      stage: parsed.data.testType,
      reason: parsed.data.appealReason,
      status: "pending",
    },
  });
  res.json({ appeal });
});

appealsRouter.get("/", requireAuth, async (_req: AuthedRequest, res) => {
  const appeals = await prisma.appeal.findMany({ orderBy: { createdAt: "desc" } });
  res.json({ appeals });
});

appealsRouter.post("/:id/status", requireAuth, async (req: AuthedRequest, res) => {
  const schema = z.object({ status: z.string().min(1) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid payload" });
  const appeal = await prisma.appeal.update({ where: { id: req.params.id }, data: { status: parsed.data.status } });
  res.json({ appeal });
});
