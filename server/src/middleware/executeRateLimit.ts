import rateLimit from "express-rate-limit";

export const codeExecuteLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many code execution requests. Slow down." },
});
