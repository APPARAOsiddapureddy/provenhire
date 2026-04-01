import { Router, Request, Response, NextFunction } from "express";
import {
  login,
  register,
  googleAuth,
  googleSelectRole,
  me,
  resetPassword,
  refresh,
  forgotPassword,
  changePassword,
  sendEmailVerificationCode,
  verifyEmailVerificationCode,
  logout,
} from "../controllers/auth.controller.js";
import { requireAuth } from "../middleware/auth.js";
import { authLoginLimiter, authRegisterLimiter, authRefreshLimiter } from "../middleware/authRateLimit.js";

const asyncHandler = (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };

export const authRouter = Router();

authRouter.get("/register", (_req, res) => {
  res.status(405).json({ error: "Method not allowed", message: "Use POST with { email, password } to register." });
});
authRouter.post("/register", authRegisterLimiter, register);
authRouter.post("/login", authLoginLimiter, login);
authRouter.post("/google", googleAuth);
authRouter.post("/google/select-role", requireAuth, googleSelectRole);
authRouter.post("/email-verification/send", asyncHandler(sendEmailVerificationCode));
authRouter.post("/email-verification/verify", verifyEmailVerificationCode);
authRouter.post("/refresh", authRefreshLimiter, refresh);
authRouter.post("/logout", requireAuth, logout);
authRouter.get("/me", requireAuth, me);
authRouter.post("/forgot-password", forgotPassword);
authRouter.post("/reset-password", resetPassword);
authRouter.post("/change-password", requireAuth, changePassword);
