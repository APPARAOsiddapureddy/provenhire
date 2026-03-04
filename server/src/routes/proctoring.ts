import { Router } from "express";
import { z } from "zod";
import { requireAuth, AuthedRequest } from "../middleware/auth.js";
import { prisma } from "../config/prisma.js";

export const proctoringRouter = Router();

proctoringRouter.post("/alerts", requireAuth, async (_req: AuthedRequest, res) => {
  const schema = z.object({
    userId: z.string(),
    testId: z.string(),
    testType: z.string(),
    alertType: z.string(),
    severity: z.string(),
    message: z.string(),
    violationDetails: z.any().optional(),
  });
  const parsed = schema.safeParse(_req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid payload" });
  await prisma.proctoringEvent.create({
    data: {
      sessionId: parsed.data.testId,
      userId: parsed.data.userId,
      type: parsed.data.alertType,
      message: parsed.data.message,
    },
  });
  res.json({ ok: true });
});

proctoringRouter.get("/alerts", requireAuth, async (_req: AuthedRequest, res) => {
  const alerts = await prisma.proctoringEvent.findMany({
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  res.json({ alerts });
});

proctoringRouter.post("/alerts/read", requireAuth, async (_req: AuthedRequest, res) => {
  res.json({ ok: true });
});
