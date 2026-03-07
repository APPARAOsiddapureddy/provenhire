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
    riskScore: z.number().optional(),
    violationDetails: z.any().optional(),
  });
  const parsed = schema.safeParse(_req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid payload" });
  await prisma.proctoringEvent.create({
    data: {
      sessionId: parsed.data.testId,
      userId: parsed.data.userId,
      testType: parsed.data.testType,
      type: parsed.data.alertType,
      severity: parsed.data.severity,
      riskScore:
        parsed.data.riskScore ??
        ((parsed.data.violationDetails as { riskScore?: number } | undefined)?.riskScore ?? 0),
      message: parsed.data.message,
      details: parsed.data.violationDetails ?? null,
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
