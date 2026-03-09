import { Router, Request, Response, NextFunction } from "express";
import {
  login,
  register,
  me,
  resetPassword,
  refresh,
  forgotPassword,
  changePassword,
  sendEmailVerificationCode,
  verifyEmailVerificationCode,
} from "../controllers/auth.controller.js";
import { requireAuth } from "../middleware/auth.js";

const asyncHandler = (fn: (req: Request, res: Response, next: NextFunction) => Promise<void>) =>
  (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };

export const authRouter = Router();

authRouter.get("/register", (_req, res) => {
  res.status(405).json({ error: "Method not allowed", message: "Use POST with { email, password } to register." });
});
authRouter.post("/register", register);
authRouter.post("/login", login);
authRouter.post("/email-verification/send", asyncHandler(sendEmailVerificationCode));
authRouter.post("/email-verification/verify", verifyEmailVerificationCode);
authRouter.post("/refresh", refresh);
authRouter.get("/me", requireAuth, me);
authRouter.post("/forgot-password", forgotPassword);
authRouter.post("/reset-password", resetPassword);
authRouter.post("/change-password", requireAuth, changePassword);
