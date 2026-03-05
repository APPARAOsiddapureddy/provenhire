import { Router } from "express";
import { login, register, me, resetPassword, refresh, forgotPassword, changePassword } from "../controllers/auth.controller.js";
import { requireAuth } from "../middleware/auth.js";

export const authRouter = Router();

authRouter.get("/register", (_req, res) => {
  res.status(405).json({ error: "Method not allowed", message: "Use POST with { email, password } to register." });
});
authRouter.post("/register", register);
authRouter.post("/login", login);
authRouter.post("/refresh", refresh);
authRouter.get("/me", requireAuth, me);
authRouter.post("/forgot-password", forgotPassword);
authRouter.post("/reset-password", resetPassword);
authRouter.post("/change-password", requireAuth, changePassword);
