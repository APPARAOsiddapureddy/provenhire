import rateLimit from "express-rate-limit";

/** Slow down credential stuffing on auth endpoints. Uses in-memory store (sufficient for single-instance; use Redis for multi-instance). */
export const authLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many login attempts. Try again later." },
  skipSuccessfulRequests: true,
});

export const authRegisterLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many registrations from this network. Try again later." },
});

export const authRefreshLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many refresh requests. Try again later." },
});

export const authForgotPasswordLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 8,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many reset attempts. Try again in 15 minutes." },
});

export const authResetPasswordLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many attempts. Try again later." },
});
