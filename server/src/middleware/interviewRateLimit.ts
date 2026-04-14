import rateLimit from "express-rate-limit";
import type { Request } from "express";

function userOrIpKey(req: Request): string {
  const u = (req as { user?: { id?: string } }).user?.id;
  if (u && typeof u === "string") return `u:${u}`;
  return `ip:${req.ip ?? "unknown"}`;
}

/** AI interview turns (expensive Gemini). Per authenticated user when available. */
export const interviewTurnLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 24,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: userOrIpKey,
  message: { error: "Too many interview requests. Please slow down." },
});

export const interviewTranscribeLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: userOrIpKey,
  message: { error: "Too many transcription requests. Please slow down." },
});

/** New interview sessions (start endpoints) — prevents runaway session creation. */
export const interviewStartLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 12,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: userOrIpKey,
  message: { error: "Too many interview starts in a short window. Try again in a few minutes." },
});

/** Server-side TTS synthesis — cost control. */
export const interviewTtsLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 45,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: userOrIpKey,
  message: { error: "Too many TTS requests. Please slow down." },
});

/** Partial transcript warm-up — cheap but should not flood. */
export const interviewPartialLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 120,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: userOrIpKey,
  message: { error: "Too many partial updates. Please slow down." },
});
