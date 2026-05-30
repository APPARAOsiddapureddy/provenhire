import rateLimit from "express-rate-limit";
import type { Request } from "express";

function userSessionOrIpKey(req: Request): string {
  const userId = (req as { user?: { id?: string } }).user?.id;
  const sessionId = req.params?.id;
  if (userId && sessionId) return `u:${userId}:s:${sessionId}`;
  if (userId) return `u:${userId}`;
  return `ip:${req.ip ?? "unknown"}`;
}

export const mcqSessionStartLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: userSessionOrIpKey,
  message: { error: "Too many MCQ session starts. Try again shortly." },
});

export const mcqSessionUpdateLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 120,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: userSessionOrIpKey,
  message: { error: "Too many MCQ session updates. Please slow down." },
});

export const mcqSessionSubmitLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: userSessionOrIpKey,
  message: { error: "Too many MCQ submit attempts. Try again shortly." },
});
