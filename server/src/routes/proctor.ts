import { Router, Request, Response } from "express";
import { z } from "zod";
import { requireAuth, AuthedRequest } from "../middleware/auth.js";
import { prisma } from "../config/prisma.js";
import { analyzeFrame, saveScreenshot, type VisionAnalysis, type ProctorViolationType } from "../services/proctor.service.js";

export const proctorRouter = Router();

// Store for look-away duration per session
const lookAwaySince: Record<string, number> = {};
const MOUTH_OPEN_COOLDOWN: Record<string, number> = {};
const LOOK_AWAY_THRESHOLD_MS = 5000;
const VIOLATION_COOLDOWN_MS = 8000;

function getOrCreateIo() {
  try {
    const { getProctorIo } = require("../socket/proctor-socket.js");
    return getProctorIo();
  } catch {
    return null;
  }
}

function emitProctorEvent(sessionId: string, event: string, payload: Record<string, unknown>) {
  const io = getOrCreateIo();
  if (io) {
    const data = { sessionId, event, ...payload };
    io.to(`proctor:${sessionId}`).emit("proctor:event", data);
    io.to("proctor:recruiters").emit("proctor:event", data);
  }
}

function checkViolations(
  sessionId: string,
  analysis: VisionAnalysis,
  base64Frame: string,
  userId: string | undefined,
  testType: string | undefined
): { type: ProctorViolationType; confidence: number }[] {
  const violations: { type: ProctorViolationType; confidence: number }[] = [];

  if (analysis.phone_detected) {
    violations.push({ type: "PHONE_DETECTED", confidence: analysis.confidence });
  }
  if (analysis.person_count > 1) {
    violations.push({ type: "MULTIPLE_PERSONS", confidence: analysis.confidence });
  }
  if (!analysis.face_detected) {
    violations.push({ type: "FACE_MISSING", confidence: analysis.confidence });
  }
  if (analysis.spoof_detected) {
    violations.push({ type: "SPOOF_DETECTED", confidence: analysis.confidence });
  }

  const lookingAway = ["LEFT", "RIGHT", "UP", "AWAY"].includes(analysis.looking_direction);
  if (lookingAway) {
    const now = Date.now();
    if (!lookAwaySince[sessionId]) lookAwaySince[sessionId] = now;
    if (now - lookAwaySince[sessionId] >= LOOK_AWAY_THRESHOLD_MS) {
      violations.push({ type: "LOOKING_AWAY", confidence: analysis.confidence });
    }
  } else {
    delete lookAwaySince[sessionId];
  }

  if (analysis.mouth_open) {
    const key = sessionId;
    const last = MOUTH_OPEN_COOLDOWN[key] ?? 0;
    if (Date.now() - last >= VIOLATION_COOLDOWN_MS) {
      violations.push({ type: "MOUTH_OPEN", confidence: analysis.confidence });
      MOUTH_OPEN_COOLDOWN[key] = Date.now();
    }
  }

  return violations;
}

const frameSchema = z.object({
  sessionId: z.string(),
  frame: z.string(),
  testType: z.string().optional(),
  runPhoneDetection: z.boolean().optional(),
});

proctorRouter.post("/frame", requireAuth, async (req: AuthedRequest, res: Response) => {
  const parsed = frameSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid payload", details: parsed.error.flatten() });
  }

  const { sessionId, frame: base64Frame, testType, runPhoneDetection } = parsed.data;
  const userId = req.user?.id;

  // Run phone detection only every 3 frames (caller sends runPhoneDetection: true every 3rd second)
  const analysis = await analyzeFrame(base64Frame);
  if (!analysis) {
    return res.status(502).json({ error: "AI proctor unavailable" });
  }

  // If client requested to skip phone detection this frame, override to false to save YOLO calls
  const effectiveAnalysis = runPhoneDetection === false
    ? { ...analysis, phone_detected: false }
    : analysis;

  const violations = checkViolations(sessionId, effectiveAnalysis, base64Frame, userId, testType);

  for (const v of violations) {
    const screenshotPath = saveScreenshot(sessionId, v.type, base64Frame);
    await prisma.proctoringEvent.create({
      data: {
        sessionId,
        userId: userId ?? null,
        testType: testType ?? null,
        type: v.type,
        severity: "high",
        riskScore: v.type === "PHONE_DETECTED" ? 30 : v.type === "MULTIPLE_PERSONS" ? 25 : 15,
        message: `${v.type} at ${new Date().toISOString()}`,
        screenshotPath,
        confidence: v.confidence,
        details: JSON.parse(JSON.stringify({ analysis: effectiveAnalysis })) as object,
      },
    });
    emitProctorEvent(sessionId, v.type, {
      timestamp: new Date().toISOString(),
      confidence: v.confidence,
      screenshotPath,
    });
  }

  res.json({
    ok: true,
    analysis: {
      face_detected: effectiveAnalysis.face_detected,
      person_count: effectiveAnalysis.person_count,
      phone_detected: effectiveAnalysis.phone_detected,
      looking_direction: effectiveAnalysis.looking_direction,
      mouth_open: effectiveAnalysis.mouth_open,
      spoof_detected: effectiveAnalysis.spoof_detected,
    },
    violations: violations.map((v) => v.type),
  });
});

proctorRouter.get("/events/:sessionId", requireAuth, async (req: AuthedRequest, res: Response) => {
  const { sessionId } = req.params;
  const events = await prisma.proctoringEvent.findMany({
    where: { sessionId },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  res.json({ events });
});
