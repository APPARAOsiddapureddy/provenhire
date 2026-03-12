import { Request, Response } from "express";
import type { Prisma } from "@prisma/client";
import bcrypt from "bcrypt";
import crypto from "crypto";
import { z } from "zod";
import { prisma } from "../config/prisma.js";
import { signJwt, hashToken, generateRefreshToken } from "../utils/jwt.js";
import { calculateCertificationLevel } from "../services/verificationLevel.service.js";
import { sendSignupVerificationCodeEmail } from "../services/resend.js";
import { verifyFirebaseIdToken } from "../services/firebase.service.js";

const REFRESH_EXPIRY_DAYS = 7;

const registerSchema = z.object({
  name: z.string().optional(),
  email: z.string().email(),
  password: z.string().min(6),
  role: z.enum(["jobseeker", "recruiter", "admin", "expert_interviewer"]).optional(),
  roleType: z.enum(["technical", "non_technical"]).optional(),
  verificationToken: z.string().min(8, "verification token required"),
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

const googleAuthSchema = z.object({
  idToken: z.string().min(1, "Firebase ID token is required"),
});

const googleSelectRoleSchema = z.object({
  role: z.enum(["jobseeker", "recruiter"]),
  companyName: z.string().optional(),
  companySize: z.string().optional(),
});

const emailVerificationSendSchema = z.object({
  email: z.string().email(),
});

const emailVerificationVerifySchema = z.object({
  email: z.string().email(),
  code: z.string().regex(/^\d{6}$/),
});

function generateSixDigitCode(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

export async function sendEmailVerificationCode(req: Request, res: Response) {
  try {
    const parsed = emailVerificationSendSchema.safeParse(req.body ?? {});
    if (!parsed.success) return res.status(400).json({ error: "Invalid email" });

    const email = parsed.data.email.trim().toLowerCase();
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) return res.status(409).json({ error: "Email already registered" });

    const code = generateSixDigitCode();
    const codeHash = hashToken(code);
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

    await prisma.emailVerificationCode.create({
      data: { email, codeHash, expiresAt },
    });

    // When DISPLAY_VERIFICATION_CODE_ON_PAGE=false, send email only. Otherwise show code on page.
    const sendEmail = process.env.DISPLAY_VERIFICATION_CODE_ON_PAGE === "false";

    if (sendEmail) {
      sendSignupVerificationCodeEmail(email, code)
        .then((sent) => {
          if (!sent) {
            console.warn("[sendEmailVerificationCode] Email failed to send to", email);
          }
        })
        .catch((e) => console.error("[sendEmailVerificationCode] Background send error:", e));
    }

    // Always include devCode so signup page can display it (testing/virtual deployment).
    // Set DISPLAY_VERIFICATION_CODE_ON_PAGE=false for production email-only.
    return res.json({
      ok: true,
      message: sendEmail
        ? `Verification code sent to ${email}. Check your inbox and spam folder—it may take up to a minute to arrive.`
        : `Verification code generated for ${email}. Use the code shown below.`,
      devCode: code,
    });
  } catch (err) {
    const errObj = err instanceof Error ? err : new Error(String(err));
    console.error("[sendEmailVerificationCode]", errObj);
    const isPrisma = err && typeof err === "object" && ("code" in err || "meta" in err);
    const prismaCode = err && typeof err === "object" && "code" in err ? (err as { code?: string }).code : null;
    let hint: string;
    if (isPrisma) {
      if (prismaCode === "P2021" || prismaCode === "P2003") {
        hint = "EmailVerificationCode table missing. Run: cd server && npx prisma db push && npx prisma generate";
      } else {
        hint = "Database error. Run: cd server && npx prisma db push && npx prisma generate";
      }
    } else {
      hint = String(errObj.message);
    }
    const devHint = process.env.NODE_ENV !== "production" ? ` ${hint}` : "";
    return res.status(500).json({ error: `Failed to send verification code.${devHint}` });
  }
}

export async function verifyEmailVerificationCode(req: Request, res: Response) {
  const parsed = emailVerificationVerifySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid payload" });

  const email = parsed.data.email.trim().toLowerCase();
  const codeHash = hashToken(parsed.data.code);

  const record = await prisma.emailVerificationCode.findFirst({
    where: {
      email,
      codeHash,
      verifiedAt: null,
      consumedAt: null,
      expiresAt: { gt: new Date() },
    },
    orderBy: { createdAt: "desc" },
  });

  if (!record) {
    await prisma.emailVerificationCode.updateMany({
      where: { email, verifiedAt: null, consumedAt: null, expiresAt: { gt: new Date() } },
      data: { attempts: 1 },
    });
    return res.status(400).json({ error: "Invalid or expired verification code." });
  }

  const verificationToken = generateRefreshToken();
  await prisma.emailVerificationCode.update({
    where: { id: record.id },
    data: {
      verifiedAt: new Date(),
      verificationTokenHash: hashToken(verificationToken),
    },
  });

  return res.json({
    ok: true,
    verificationToken,
    message: "Email verified successfully.",
  });
}

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
    if (!req.body || typeof req.body !== "object") {
      return res.status(400).json({ error: "Invalid request body. Send JSON with email and password." });
    }
    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid registration payload" });
    }
    const { name, email, password, role, roleType, verificationToken } = parsed.data;
    const normalizedEmail = email.trim().toLowerCase();
    const blocked = await prisma.blockedEmail.findUnique({ where: { email: normalizedEmail } });
    if (blocked) {
      return res.status(403).json({ error: "This email cannot be used for registration" });
    }
    const existing = await prisma.user.findUnique({ where: { email: normalizedEmail } });
    if (existing) {
      return res.status(409).json({ error: "Email already registered" });
    }

    const verification = await prisma.emailVerificationCode.findFirst({
      where: {
        email: normalizedEmail,
        verifiedAt: { not: null },
        consumedAt: null,
        expiresAt: { gt: new Date() },
        verificationTokenHash: hashToken(verificationToken),
      },
      orderBy: { createdAt: "desc" },
    });
    if (!verification) {
      return res.status(400).json({ error: "Email verification is required before signup." });
    }
    const passwordHash = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: {
        name: name || null,
        email: normalizedEmail,
        passwordHash,
        role: role ?? "jobseeker",
        emailVerified: true,
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
    await prisma.emailVerificationCode.update({
      where: { id: verification.id },
      data: { consumedAt: new Date() },
    });
    let session;
    try {
      session = await createSession(user);
    } catch (sessionErr) {
      const sm = sessionErr instanceof Error ? sessionErr.message : "Session failed";
      console.error("[auth/register] createSession:", sm, sessionErr);
      const se = sessionErr as { code?: string };
      if (typeof se?.code === "string") {
        return res.status(500).json({ error: "Registration failed.", code: se.code });
      }
      return res.status(500).json({ error: "Registration failed. Please try again." });
    }
    return res.json(session);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Registration failed";
    console.error("[auth/register]", msg, err);
    const anyErr = err as { code?: string };
    const code = typeof anyErr?.code === "string" ? anyErr.code : null;
    if (code === "P1001") {
      return res.status(503).json({ error: "Database unavailable. Please try again in a moment." });
    }
    if (code === "P2021") {
      return res.status(503).json({ error: "Database is still initializing. Please try again in a minute." });
    }
    if (code === "P2002") {
      return res.status(409).json({ error: "Email already registered." });
    }
    if (code === "P2014") {
      return res.status(500).json({ error: "Database schema mismatch. Please contact support." });
    }
    if (code === "P2011") {
      return res.status(500).json({ error: "Invalid data. Please check your input." });
    }
    // Return code in response for debugging (safe to expose)
    const body: { error: string; code?: string } = { error: "Registration failed. Please try again." };
    if (code) body.code = code;
    return res.status(500).json(body);
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
    if ((user as { authProvider?: string | null }).authProvider === "GOOGLE") {
      return res.status(400).json({ error: "This account uses Google sign-in. Please use 'Continue with Google'." });
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

export async function googleAuth(req: Request, res: Response) {
  try {
    if (!process.env.JWT_SECRET) {
      return res.status(500).json({ error: "Server configuration error. Contact support." });
    }
    const parsed = googleAuthSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.errors[0]?.message ?? "Invalid payload" });
    }
    const firebaseUser = await verifyFirebaseIdToken(parsed.data.idToken);
    const email = firebaseUser.email?.trim().toLowerCase();
    if (!email) {
      return res.status(400).json({ error: "Google account did not provide an email address." });
    }
    const blocked = await prisma.blockedEmail.findUnique({ where: { email } });
    if (blocked) {
      return res.status(403).json({ error: "This email cannot be used for sign in." });
    }
    let user = await prisma.user.findFirst({
      where: {
        OR: [{ email }, { googleUid: firebaseUser.uid } as Prisma.UserWhereInput],
      },
    });
    let isNewUser = false;
    if (!user) {
      isNewUser = true;
      const placeholderHash = await bcrypt.hash(crypto.randomUUID(), 10);
      user = await prisma.user.create({
        data: {
          email,
          name: firebaseUser.name ?? null,
          passwordHash: placeholderHash,
          role: "jobseeker",
          emailVerified: true,
          authProvider: "GOOGLE",
          googleUid: firebaseUser.uid,
          profileImage: firebaseUser.picture ?? null,
        } as Prisma.UserCreateInput,
      });
      await prisma.jobSeekerProfile.upsert({
        where: { userId: user.id },
        create: {
          userId: user.id,
          fullName: firebaseUser.name ?? null,
          email,
          roleType: "technical",
        },
        update: { fullName: firebaseUser.name ?? user.name },
      });
    } else if (!(user as { googleUid?: string | null }).googleUid) {
      await prisma.user.update({
        where: { id: user.id },
        data: {
          googleUid: firebaseUser.uid,
          profileImage: firebaseUser.picture ?? (user as { profileImage?: string | null }).profileImage ?? null,
          name: firebaseUser.name ?? user.name,
        } as Prisma.UserUpdateInput,
      });
    }
    const session = await createSession(user);
    return res.json({ ...session, isNewUser });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Google sign-in failed";
    console.error("[auth/google]", msg, err);
    if (msg.includes("Firebase") || msg.includes("token") || msg.includes("auth")) {
      return res.status(401).json({ error: "Invalid or expired Google sign-in. Please try again." });
    }
    return res.status(500).json({ error: msg });
  }
}

export async function googleSelectRole(req: Request, res: Response) {
  const userId = (req as any).user?.id as string | undefined;
  if (!userId) return res.status(401).json({ error: "Unauthorized" });
  const parsed = googleSelectRoleSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid role. Choose jobseeker or recruiter." });
  }
  const { role, companyName, companySize } = parsed.data;
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return res.status(404).json({ error: "User not found" });
  if (role === "recruiter") {
    await prisma.user.update({ where: { id: userId }, data: { role: "recruiter" } });
    await prisma.recruiterProfile.upsert({
      where: { userId },
      create: {
        userId,
        companyName: companyName ?? null,
        companySize: companySize ?? null,
      },
      update: {
        companyName: companyName ?? undefined,
        companySize: companySize ?? undefined,
      },
    });
  } else {
    await prisma.user.update({ where: { id: userId }, data: { role: "jobseeker" } });
  }
  const updated = await prisma.user.findUnique({ where: { id: userId } });
  return res.json({ user: updated ? { id: updated.id, name: updated.name, email: updated.email, role: updated.role } : null });
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
  const [user, certification] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId } }),
    calculateCertificationLevel(userId),
  ]);
  if (!user) return res.status(404).json({ error: "User not found" });
  return res.json({
    user: { id: user.id, name: user.name, email: user.email, role: user.role },
    certification_level: certification.level,
    certification_label: certification.label,
    role_type: certification.roleType,
  });
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
