import rateLimit from "express-rate-limit";
import type { Request } from "express";

function userSessionOrIpKey(req: Request): string {
  const userId = (req as { user?: { id?: string } }).user?.id;
  const sessionId = req.params?.id;
  if (userId && sessionId) return `u:${userId}:sql:${sessionId}`;
  if (userId) return `u:${userId}:sql`;
  return `ip:${req.ip ?? "unknown"}:sql`;
}

export const sqlSessionUpdateLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 120,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: userSessionOrIpKey,
  message: { error: "Too many SQL session updates. Please slow down." },
});

export const sqlSessionRunLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: userSessionOrIpKey,
  message: { error: "Too many SQL test runs. Try again shortly." },
});

export const sqlSessionSubmitLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: userSessionOrIpKey,
  message: { error: "Too many SQL submit attempts. Try again shortly." },
});
