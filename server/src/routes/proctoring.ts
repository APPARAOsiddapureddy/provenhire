import { Router } from "express";
import { z } from "zod";
import { requireAuth, AuthedRequest } from "../middleware/auth.js";
import { prisma } from "../config/prisma.js";
import { getFeatureMode } from "../services/featureFlag.service.js";

export const proctoringRouter = Router();

proctoringRouter.post("/alerts", requireAuth, async (_req: AuthedRequest, res) => {
  const schema = z.object({
    userId: z.string(),
    testId: z.string(),
    testType: z.string(),
    alertType: z.string(),
    severity: z.string(),
    message: z.string(),
    /** Legacy name: stores per-type violation index (1-based) for this session. */
    riskScore: z.number().optional(),
    violationCountForType: z.number().optional(),
    violationDetails: z.any().optional(),
  });
  const parsed = schema.safeParse(_req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid payload" });
  const alertType = parsed.data.alertType;
  const flagChecks: [string, string[]][] = [
    ["tab_switch_detection", ["TAB_SWITCH", "WINDOW_FOCUS_LOST", "WINDOW_MINIMIZED"]],
    ["copy_paste_detection", ["COPY_PASTE_ATTEMPT"]],
    ["devtools_detection", ["DEVTOOLS_OPENED"]],
    ["fullscreen_required", ["FULLSCREEN_EXIT"]],
    [
      "multiple_face_detection",
      ["NO_FACE_DETECTED", "MULTIPLE_FACES_DETECTED", "LOOKING_AWAY_FROM_SCREEN", "LOW_VISIBILITY", "PHONE_DETECTED"],
    ],
    ["microphone_monitoring", ["CANDIDATE_SPEAKING_DURING_CODING", "SUSPICIOUS_BACKGROUND_NOISE", "MULTIPLE_VOICES_DETECTED", "MICROPHONE_MUTED_ATTEMPT"]],
  ];
  for (const [flagName, types] of flagChecks) {
    if (types.includes(alertType)) {
      const mode = await getFeatureMode(flagName);
      if (mode === "OFF") return res.json({ ok: true });
      break;
    }
  }
  const details = parsed.data.violationDetails as
    | { violationCountForType?: number; riskScore?: number }
    | undefined;
  const violationIndex =
    parsed.data.violationCountForType ??
    parsed.data.riskScore ??
    details?.violationCountForType ??
    details?.riskScore ??
    0;

  await prisma.proctoringEvent.create({
    data: {
      sessionId: parsed.data.testId,
      userId: parsed.data.userId,
      testType: parsed.data.testType,
      type: parsed.data.alertType,
      severity: parsed.data.severity,
      riskScore: Math.max(0, Math.floor(violationIndex)),
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
