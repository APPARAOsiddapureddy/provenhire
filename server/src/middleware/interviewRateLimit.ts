import rateLimit from "express-rate-limit";

/** AI interview turns (expensive Gemini). Per-IP; single-instance memory store. */
export const interviewTurnLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many interview requests. Please slow down." },
});

export const interviewTranscribeLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 25,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many transcription requests. Please slow down." },
});
