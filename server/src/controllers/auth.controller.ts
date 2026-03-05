import { Request, Response } from "express";
import bcrypt from "bcrypt";
import { z } from "zod";
import { prisma } from "../config/prisma.js";
import { signJwt, hashToken, generateRefreshToken } from "../utils/jwt.js";

const REFRESH_EXPIRY_DAYS = 7;

const registerSchema = z.object({
  name: z.string().optional(),
  email: z.string().email(),
  password: z.string().min(6),
  role: z.enum(["jobseeker", "recruiter", "admin", "expert_interviewer"]).optional(),
  roleType: z.enum(["technical", "non_technical"]).optional(),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const forgotSchema = z.object({ email: z.string().email() });

const resetSchema = z.object({
  token: z.string().min(1),
  email: z.string().email().optional(),
  newPassword: z.string().min(6),
});

const refreshSchema = z.object({
  refreshToken: z.string().min(1),
});

async function createSession(user: { id: string; role: string; name: string | null; email: string }) {
  const accessToken = signJwt({ userId: user.id, role: user.role });
  const refreshTokenPlain = generateRefreshToken();
  const refreshExpires = new Date();
  refreshExpires.setDate(refreshExpires.getDate() + REFRESH_EXPIRY_DAYS);

  await prisma.refreshToken.create({
    data: {
      userId: user.id,
      tokenHash: hashToken(refreshTokenPlain),
      expiresAt: refreshExpires,
    },
  });

  return {
    user: { id: user.id, name: user.name, email: user.email, role: user.role },
    token: accessToken,
    refreshToken: refreshTokenPlain,
    expiresIn: 15 * 60,
  };
}

export async function register(req: Request, res: Response) {
  try {
    if (!process.env.JWT_SECRET) {
      console.error("[auth/register] JWT_SECRET is not configured");
      return res.status(500).json({ error: "Server configuration error. Contact support." });
    }
    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid registration payload" });
    }
    const { name, email, password, role, roleType } = parsed.data;
    const normalizedEmail = email.trim().toLowerCase();
    const blocked = await prisma.blockedEmail.findUnique({ where: { email: normalizedEmail } });
    if (blocked) {
      return res.status(403).json({ error: "This email cannot be used for registration" });
    }
    const existing = await prisma.user.findUnique({ where: { email: normalizedEmail } });
    if (existing) {
      return res.status(409).json({ error: "Email already registered" });
    }
    const passwordHash = await bcrypt.hash(password, 12);
    const user = await prisma.user.create({
      data: {
        name: name || null,
        email: normalizedEmail,
        passwordHash,
        role: role ?? "jobseeker",
      },
    });
    if (user.role === "jobseeker") {
      await prisma.jobSeekerProfile.upsert({
        where: { userId: user.id },
        create: {
          userId: user.id,
          fullName: name || null,
          email: normalizedEmail,
          roleType: roleType ?? "technical",
        },
        update: { roleType: roleType ?? "technical" },
      });
    }
    const session = await createSession(user);
    return res.json(session);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Registration failed";
    console.error("[auth/register]", msg, err);
    // Prisma error codes: P1001 = DB unreachable, P2021 = table missing, P2002 = unique violation
    const prisma = err && typeof err === "object" && "code" in err ? (err as { code?: string }).code : null;
    if (prisma === "P1001") {
      return res.status(503).json({ error: "Database unavailable. Please try again in a moment." });
    }
    if (prisma === "P2021") {
      return res.status(503).json({ error: "Database is still initializing. Please try again in a minute." });
    }
    if (prisma === "P2002") {
      return res.status(409).json({ error: "Email already registered." });
    }
    return res.status(500).json({ error: "Registration failed. Please try again." });
  }
}

export async function login(req: Request, res: Response) {
  try {
    if (!process.env.JWT_SECRET) {
      console.error("[auth/login] JWT_SECRET is not configured");
      return res.status(500).json({ error: "Server configuration error. Contact support." });
    }
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid login payload" });
    }
    const { email, password } = parsed.data;
    const normalizedEmail = email.trim().toLowerCase();
    const user = await prisma.user.findUnique({ where: { email: normalizedEmail } });
    if (!user) {
      return res.status(401).json({ error: "Invalid email or password" });
    }
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) {
      return res.status(401).json({ error: "Invalid email or password" });
    }
    const session = await createSession(user);
    return res.json(session);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Login failed";
    console.error("[auth/login]", msg, err);
    return res.status(500).json({ error: msg });
  }
}

export async function refresh(req: Request, res: Response) {
  const parsed = refreshSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid refresh payload" });
  }
  const { refreshToken } = parsed.data;
  const tokenHash = hashToken(refreshToken);
  const stored = await prisma.refreshToken.findUnique({
    where: { tokenHash },
    include: { user: true },
  });
  if (!stored || stored.expiresAt < new Date()) {
    if (stored) await prisma.refreshToken.delete({ where: { id: stored.id } }).catch(() => {});
    return res.status(401).json({ error: "Invalid or expired refresh token" });
  }
  const accessToken = signJwt({ userId: stored.user.id, role: stored.user.role });
  return res.json({
    user: { id: stored.user.id, name: stored.user.name, email: stored.user.email, role: stored.user.role },
    token: accessToken,
    expiresIn: 15 * 60,
  });
}

export async function me(req: Request, res: Response) {
  const userId = (req as any).user?.id as string | undefined;
  if (!userId) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return res.status(404).json({ error: "User not found" });
  return res.json({ user: { id: user.id, name: user.name, email: user.email, role: user.role } });
}

export async function forgotPassword(req: Request, res: Response) {
  try {
    const parsed = forgotSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid email" });
    const { email } = parsed.data;
    const user = await prisma.user.findUnique({ where: { email: email.toLowerCase().trim() } });
    if (!user) {
      return res.json({ ok: true });
    }
    if (!process.env.RESEND_API_KEY) {
      return res.json({
        ok: true,
        message: "Password reset email is not configured. Contact support.",
      });
    }
    const { sendPasswordResetEmail } = await import("../services/resend.js");
    await prisma.passwordResetToken.deleteMany({ where: { userId: user.id } });
    const tokenPlain = generateRefreshToken();
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 1);
    await prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash: hashToken(tokenPlain),
        expiresAt,
      },
    });
    const baseUrl = process.env.BASE_URL || "http://localhost:8080";
    const resetLink = `${baseUrl}/auth?mode=reset&token=${encodeURIComponent(tokenPlain)}&email=${encodeURIComponent(user.email)}`;
    const sent = await sendPasswordResetEmail(user.email, resetLink);
    if (!sent) {
      await prisma.passwordResetToken.deleteMany({ where: { userId: user.id } });
      return res.status(500).json({ error: "Failed to send reset email. Try again later." });
    }
    return res.json({ ok: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("[forgot-password]", msg);
    return res.status(500).json({ error: "Password reset failed. Try again or contact support." });
  }
}

export async function resetPassword(req: Request, res: Response) {
  const parsed = resetSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid reset payload. Token is required." });
  const { token, newPassword } = parsed.data;

  const tokenHash = hashToken(token);
  const stored = await prisma.passwordResetToken.findUnique({
    where: { tokenHash },
    include: { user: true },
  });
  if (!stored || stored.expiresAt < new Date()) {
    if (stored) await prisma.passwordResetToken.delete({ where: { id: stored.id } }).catch(() => {});
    return res.status(400).json({ error: "Invalid or expired reset link. Request a new one." });
  }
  const passwordHash = await bcrypt.hash(newPassword, 12);
  await prisma.user.update({ where: { id: stored.user.id }, data: { passwordHash } });
  await prisma.passwordResetToken.delete({ where: { id: stored.id } });
  return res.json({ ok: true });
}

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(6),
});

export async function changePassword(req: Request, res: Response) {
  const userId = (req as any).user?.id as string | undefined;
  if (!userId) return res.status(401).json({ error: "Unauthorized" });
  const parsed = changePasswordSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid payload. New password must be at least 6 characters." });
  const { currentPassword, newPassword } = parsed.data;
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return res.status(404).json({ error: "User not found" });
  const ok = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!ok) return res.status(401).json({ error: "Current password is incorrect" });
  const passwordHash = await bcrypt.hash(newPassword, 12);
  await prisma.user.update({ where: { id: userId }, data: { passwordHash } });
  return res.json({ ok: true });
}
