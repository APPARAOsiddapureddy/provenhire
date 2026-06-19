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
const DEFAULT_TARGET_JOB_TITLE = "Full Stack Developer";
const VERIFICATION_CODE_TTL_MS = 10 * 60 * 1000;
const VERIFICATION_RESEND_COOLDOWN_MS = 60 * 1000;
const MAX_VERIFICATION_ATTEMPTS = 5;

const registerSchema = z
  .object({
    name: z.string().optional(),
    email: z.string().email("Enter a valid email address."),
    /** Matches Auth.tsx: min 8, at least one letter and one number. */
    password: z
      .string()
      .min(8, "Password must be at least 8 characters.")
      .regex(/^(?=.*[A-Za-z])(?=.*\d).+$/, "Password must include at least one letter and one number."),
    /** Privileged roles must never be self-service; only jobseeker/recruiter via public signup. */
    role: z.enum(["jobseeker", "recruiter"]).nullish(),
    roleType: z.enum(["technical", "non_technical", "data"]).nullish(),
    companyName: z.string().trim().min(2).max(120).optional(),
    companySize: z.string().trim().max(50).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.role === "recruiter" && !value.companyName) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["companyName"],
        message: "Company name is required for recruiter accounts.",
      });
    }
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
  role: z.enum(["jobseeker", "recruiter"]).optional(),
  companyName: z.string().trim().min(2).max(120).optional(),
  companySize: z.string().trim().max(50).optional(),
  roleType: z.enum(["technical", "non_technical", "data"]).optional(),
}).superRefine((value, ctx) => {
  if (value.role === "recruiter" && !value.companyName) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["companyName"],
      message: "Company name is required for recruiter Google signup.",
    });
  }
  if (value.role === "recruiter" && !value.companySize) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["companySize"],
      message: "Company size is required for recruiter Google signup.",
    });
  }
});

const googleSelectRoleSchema = z.object({
  role: z.enum(["jobseeker", "recruiter"]),
  companyName: z.string().optional(),
  companySize: z.string().optional(),
  roleType: z.enum(["technical", "non_technical", "data"]).optional(),
});

const emailVerificationSendSchema = z.object({
  email: z.string().email(),
});

const emailVerificationVerifySchema = z.object({
  email: z.string().email(),
  code: z.string().regex(/^\d{6}$/),
});

function generateSixDigitCode(): string {
  return String(crypto.randomInt(100000, 1_000_000));
}

async function getVerificationCooldownSeconds(email: string): Promise<number> {
  const latest = await prisma.emailVerificationCode.findFirst({
    where: {
      email,
      verifiedAt: null,
      consumedAt: null,
    },
    orderBy: { createdAt: "desc" },
  });
  if (!latest) return 0;
  const elapsedMs = Date.now() - latest.createdAt.getTime();
  const remainingMs = VERIFICATION_RESEND_COOLDOWN_MS - elapsedMs;
  return remainingMs > 0 ? Math.ceil(remainingMs / 1000) : 0;
}

async function createEmailVerificationCode(
  tx: Prisma.TransactionClient,
  email: string,
): Promise<{ code: string; expiresAt: Date }> {
  const code = generateSixDigitCode();
  const expiresAt = new Date(Date.now() + VERIFICATION_CODE_TTL_MS);
  const now = new Date();

  await tx.emailVerificationCode.updateMany({
    where: {
      email,
      consumedAt: null,
      verifiedAt: null,
    },
    data: { consumedAt: now },
  });
  await tx.emailVerificationCode.create({
    data: {
      email,
      codeHash: hashToken(code),
      expiresAt,
    },
  });

  return { code, expiresAt };
}

async function consumeVerificationCode(email: string, codeId?: string): Promise<void> {
  const now = new Date();
  await prisma.emailVerificationCode.updateMany({
    where: {
      email,
      consumedAt: null,
      ...(codeId ? { id: codeId } : {}),
    },
    data: { consumedAt: now },
  });
}

async function deliverVerificationCode(email: string, code: string): Promise<boolean> {
  const sent = await sendSignupVerificationCodeEmail(email, code);
  if (!sent) {
    console.warn("[email-verification] Verification email was not sent to", email);
  }
  return sent;
}

/**
 * BlockedEmail is opt-in so production is open by default (Google SSO was returning 403 for many users).
 * Set ENFORCE_BLOCKED_EMAILS=true (or 1) on the server to reject register + Google sign-in for listed emails.
 */
function isBlockedEmailListEnforced(): boolean {
  const v = process.env.ENFORCE_BLOCKED_EMAILS;
  return v === "true" || v === "1";
}

export async function sendEmailVerificationCode(req: Request, res: Response) {
  try {
    const parsed = emailVerificationSendSchema.safeParse(req.body ?? {});
    if (!parsed.success) return res.status(400).json({ error: "Invalid email" });

    const email = parsed.data.email.trim().toLowerCase();
    const existing = await prisma.user.findUnique({ where: { email } });
    if (!existing || existing.emailVerified || (existing as { authProvider?: string | null }).authProvider === "GOOGLE") {
      return res.json({
        ok: true,
        message: "If this email has a pending ProvenHire account, a new verification code has been sent.",
      });
    }

    const cooldownSeconds = await getVerificationCooldownSeconds(email);
    if (cooldownSeconds > 0) {
      return res.status(429).json({
        error: `Please wait ${cooldownSeconds} second${cooldownSeconds === 1 ? "" : "s"} before requesting another code.`,
        code: "VERIFICATION_RESEND_COOLDOWN",
        retryAfterSeconds: cooldownSeconds,
      });
    }

    const issued = await prisma.$transaction((tx) => createEmailVerificationCode(tx, email));
    const sent = await deliverVerificationCode(email, issued.code);

    if (!sent) {
      await consumeVerificationCode(email);
      return res.status(502).json({
        error: "We could not send the verification email right now. Please try again.",
        code: "EMAIL_DELIVERY_FAILED",
      });
    }
    return res.json({
      ok: true,
      email: existing.email,
      role: existing.role,
      expiresAt: issued.expiresAt.toISOString(),
      message: "If this email has a pending ProvenHire account, a new verification code has been sent.",
    });
  } catch (err) {
    const errObj = err instanceof Error ? err : new Error(String(err));
    console.error("[sendEmailVerificationCode]", errObj);
    return res.status(500).json({ error: "Failed to send verification code. Please try again." });
  }
}

export async function verifyEmailVerificationCode(req: Request, res: Response) {
  try {
    const parsed = emailVerificationVerifySchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid payload" });

    const email = parsed.data.email.trim().toLowerCase();
    const now = new Date();
    const record = await prisma.emailVerificationCode.findFirst({
      where: {
        email,
        verifiedAt: null,
        consumedAt: null,
      },
      orderBy: { createdAt: "desc" },
    });

    if (!record) {
      return res.status(400).json({
        error: "Invalid or expired verification code.",
        code: "INVALID_VERIFICATION_CODE",
      });
    }

    if (record.expiresAt <= now) {
      await consumeVerificationCode(email, record.id);
      return res.status(400).json({
        error: "Verification code expired. Request a new code.",
        code: "VERIFICATION_CODE_EXPIRED",
      });
    }

    if (record.attempts >= MAX_VERIFICATION_ATTEMPTS) {
      await consumeVerificationCode(email, record.id);
      return res.status(429).json({
        error: "Too many invalid attempts. Request a new code.",
        code: "VERIFICATION_CODE_LOCKED",
      });
    }

    const submittedCodeHash = hashToken(parsed.data.code);
    if (record.codeHash !== submittedCodeHash) {
      const attempts = record.attempts + 1;
      await prisma.emailVerificationCode.update({
        where: { id: record.id },
        data: {
          attempts,
          ...(attempts >= MAX_VERIFICATION_ATTEMPTS ? { consumedAt: now } : {}),
        },
      });
      return res.status(attempts >= MAX_VERIFICATION_ATTEMPTS ? 429 : 400).json({
        error:
          attempts >= MAX_VERIFICATION_ATTEMPTS
            ? "Too many invalid attempts. Request a new code."
            : "Invalid verification code.",
        code: attempts >= MAX_VERIFICATION_ATTEMPTS ? "VERIFICATION_CODE_LOCKED" : "INVALID_VERIFICATION_CODE",
        remainingAttempts: Math.max(0, MAX_VERIFICATION_ATTEMPTS - attempts),
      });
    }

    const existing = await prisma.user.findUnique({ where: { email } });
    if (!existing) {
      await consumeVerificationCode(email, record.id);
      return res.status(400).json({
        error: "Invalid or expired verification code.",
        code: "INVALID_VERIFICATION_CODE",
      });
    }

    const user = await prisma.$transaction(async (tx) => {
      const updated = await tx.user.update({
        where: { id: existing.id },
        data: { emailVerified: true },
      });
      await tx.emailVerificationCode.updateMany({
        where: { email, consumedAt: null },
        data: {
          verifiedAt: now,
          consumedAt: now,
        },
      });
      return updated;
    });

    const session = await createSession(user);
    return res.json({
      ok: true,
      message: "Email verified successfully.",
      ...session,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Email verification failed";
    console.error("[email-verification/verify]", msg, err);
    return res.status(500).json({ error: "Email verification failed. Please try again." });
  }
}

async function createSession(user: {
  id: string;
  role: string;
  name: string | null;
  email: string;
  emailVerified?: boolean;
  authProvider?: string | null;
}) {
  if (user.authProvider !== "GOOGLE" && user.emailVerified === false) {
    throw new Error("Email verification required before session creation.");
  }
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
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      authProvider: user.authProvider ?? null,
    },
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
      const fieldErrors = parsed.error.flatten().fieldErrors;
      const firstMsg = Object.values(fieldErrors).flat()[0];
      return res.status(400).json({
        error: firstMsg ?? "Invalid registration payload",
        code: "VALIDATION_ERROR",
        fields: fieldErrors,
      });
    }
    const { name, email, password, role, roleType, companyName, companySize } = parsed.data;
    const effectiveRole = role === "recruiter" ? "recruiter" : "jobseeker";
    const effectiveRoleType = roleType ?? "technical";
    const normalizedEmail = email.trim().toLowerCase();
    if (isBlockedEmailListEnforced()) {
      const blocked = await prisma.blockedEmail.findUnique({ where: { email: normalizedEmail } });
      if (blocked) {
        return res.status(403).json({ error: "This email cannot be used for registration" });
      }
    }
    const existing = await prisma.user.findUnique({ where: { email: normalizedEmail } });
    if (existing?.emailVerified) {
      return res.status(409).json({ error: "Email already registered" });
    }
    if (existing && (existing as { authProvider?: string | null }).authProvider === "GOOGLE") {
      return res.status(409).json({ error: "This email already uses Google sign-in. Continue with Google." });
    }
    if (existing) {
      const cooldownSeconds = await getVerificationCooldownSeconds(normalizedEmail);
      if (cooldownSeconds > 0) {
        return res.json({
          ok: true,
          requiresEmailVerification: true,
          email: existing.email,
          role: existing.role,
          message: "A verification code was already sent. Check your inbox or request a new code in a moment.",
        });
      }
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const result = await prisma.$transaction(async (tx) => {
      const user = existing
        ? await tx.user.update({
            where: { id: existing.id },
            data: {
              name: name || null,
              passwordHash,
              role: effectiveRole,
              emailVerified: false,
              authProvider: "EMAIL",
            },
          })
        : await tx.user.create({
            data: {
              name: name || null,
              email: normalizedEmail,
              passwordHash,
              role: effectiveRole,
              emailVerified: false,
              authProvider: "EMAIL",
            },
          });

      if (user.role === "jobseeker") {
        await tx.recruiterProfile.deleteMany({ where: { userId: user.id } });
        await tx.jobSeekerProfile.upsert({
          where: { userId: user.id },
          create: {
            userId: user.id,
            fullName: name || null,
            email: normalizedEmail,
            roleType: effectiveRoleType,
            targetJobTitle: DEFAULT_TARGET_JOB_TITLE,
          },
          update: {
            fullName: name || null,
            email: normalizedEmail,
            roleType: effectiveRoleType,
            targetJobTitle: DEFAULT_TARGET_JOB_TITLE,
          },
        });
      } else {
        await tx.jobSeekerProfile.deleteMany({ where: { userId: user.id } });
        await tx.recruiterProfile.upsert({
          where: { userId: user.id },
          create: {
            userId: user.id,
            companyName: companyName ?? null,
            companySize: companySize ?? null,
            workEmail: normalizedEmail,
          },
          update: {
            companyName: companyName ?? null,
            companySize: companySize ?? null,
            workEmail: normalizedEmail,
          },
        });
      }

      const issued = await createEmailVerificationCode(tx, normalizedEmail);
      return { user, issued };
    });

    const sent = await deliverVerificationCode(normalizedEmail, result.issued.code);
    if (!sent) {
      await consumeVerificationCode(normalizedEmail);
      return res.status(502).json({
        error: "We could not send the verification email right now. Please try again.",
        code: "EMAIL_DELIVERY_FAILED",
      });
    }

    return res.status(201).json({
      ok: true,
      requiresEmailVerification: true,
      email: result.user.email,
      role: result.user.role,
      expiresAt: result.issued.expiresAt.toISOString(),
      message: `Verification code sent to ${normalizedEmail}. Check your inbox and spam folder.`,
    });
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
    const body: { error: string; code?: string } = { error: "Registration failed. Please try again." };
    if (code && process.env.NODE_ENV !== "production") body.code = code;
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
    const user = await prisma.user.findFirst({
      where: { email: { equals: normalizedEmail, mode: "insensitive" } },
    });
    if (!user) {
      const isQaDomain = normalizedEmail.endsWith("@test.provenhire.com");
      const qaHint =
        isQaDomain
          ? "This QA email is not in the database for this environment. Run migrations, then `cd server && npm run seed:test-credentials` (see docs/TEST_CREDENTIALS.md), or set SEED_TEST_CREDENTIALS_ON_START=true / SEED_ON_START=true on the host."
          : undefined;
      return res.status(401).json({
        error: "Invalid email or password",
        ...(qaHint ? { hint: qaHint } : {}),
      });
    }
    if ((user as { authProvider?: string | null }).authProvider === "GOOGLE") {
      return res.status(400).json({ error: "This account uses Google sign-in. Please use 'Continue with Google'." });
    }
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) {
      return res.status(401).json({ error: "Invalid email or password" });
    }
    if (!user.emailVerified) {
      return res.status(403).json({
        error: "Please verify your email before signing in.",
        code: "EMAIL_NOT_VERIFIED",
        email: user.email,
      });
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
    const intendedRole = parsed.data.role ?? "jobseeker";
    const firebaseUser = await verifyFirebaseIdToken(parsed.data.idToken);
    const email = firebaseUser.email?.trim().toLowerCase();
    if (!email) {
      return res.status(400).json({ error: "Google account did not provide an email address." });
    }
    if (isBlockedEmailListEnforced()) {
      const blocked = await prisma.blockedEmail.findUnique({ where: { email } });
      if (blocked) {
        return res.status(403).json({
          error:
            "This email cannot be used for sign in. It may be blocked after a removed account—use another Google account or contact support.",
          code: "EMAIL_BLOCKED",
        });
      }
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
          role: intendedRole,
          emailVerified: true,
          authProvider: "GOOGLE",
          googleUid: firebaseUser.uid,
          profileImage: firebaseUser.picture ?? null,
        } as Prisma.UserCreateInput,
      });
      if (intendedRole === "recruiter") {
        await prisma.recruiterProfile.upsert({
          where: { userId: user.id },
          create: {
            userId: user.id,
            companyName: parsed.data.companyName ?? null,
            companySize: parsed.data.companySize ?? null,
          },
          update: {
            companyName: parsed.data.companyName ?? undefined,
            companySize: parsed.data.companySize ?? undefined,
          },
        });
      } else {
        await prisma.jobSeekerProfile.upsert({
          where: { userId: user.id },
          create: {
            userId: user.id,
            fullName: firebaseUser.name ?? null,
            email,
            roleType: parsed.data.roleType ?? "technical",
            targetJobTitle: DEFAULT_TARGET_JOB_TITLE,
          },
          update: { fullName: firebaseUser.name ?? user.name },
        });
      }
    } else if (!(user as { googleUid?: string | null }).googleUid) {
      if (parsed.data.role && user.role !== parsed.data.role) {
        return res.status(409).json({
          error: `This Google email is already registered as ${user.role}. Please sign in with that role or use a different Google account.`,
          code: "ROLE_MISMATCH",
        });
      }
      const shouldConvertPendingEmailAccount =
        !user.emailVerified && (user as { authProvider?: string | null }).authProvider !== "GOOGLE";
      user = await prisma.user.update({
        where: { id: user.id },
        data: {
          googleUid: firebaseUser.uid,
          profileImage: firebaseUser.picture ?? (user as { profileImage?: string | null }).profileImage ?? null,
          name: firebaseUser.name ?? user.name,
          emailVerified: true,
          ...(shouldConvertPendingEmailAccount
            ? {
                authProvider: "GOOGLE",
                passwordHash: await bcrypt.hash(crypto.randomUUID(), 10),
              }
            : {}),
        } as Prisma.UserUpdateInput,
      });
    } else {
      if (parsed.data.role && user.role !== parsed.data.role) {
        return res.status(409).json({
          error: `This Google account is already registered as ${user.role}. Please sign in with that role or use a different Google account.`,
          code: "ROLE_MISMATCH",
        });
      }
      if (!user.emailVerified) {
      user = await prisma.user.update({
        where: { id: user.id },
        data: { emailVerified: true },
      });
      }
    }

    // Testing mode: ensure existing Google jobseekers default to technical (no chooser popup).
    // This also prevents stage-loading logic from falling back to "technical" while profile roleType is null.
    if (user.role === "jobseeker") {
      await prisma.jobSeekerProfile.updateMany({
        where: { userId: user.id, roleType: null },
        data: { roleType: "technical" },
      });
      await prisma.jobSeekerProfile.updateMany({
        where: { userId: user.id, targetJobTitle: null },
        data: { targetJobTitle: DEFAULT_TARGET_JOB_TITLE },
      });
    }
    const session = await createSession(user);
    return res.json({ ...session, isNewUser });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Google sign-in failed";
    console.error("[auth/google]", msg, err);
    // Always return 401 with a user-friendly message so the client never sees 500
    return res.status(401).json({ error: "Invalid or expired Google sign-in. Please try again." });
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
    await prisma.jobSeekerProfile.upsert({
      where: { userId },
      create: {
        userId,
        email: user.email,
        fullName: user.name,
        roleType: "technical",
        targetJobTitle: DEFAULT_TARGET_JOB_TITLE,
      },
      update: {
        roleType: "technical",
      },
    });
    await prisma.jobSeekerProfile.updateMany({
      where: { userId, targetJobTitle: null },
      data: { targetJobTitle: DEFAULT_TARGET_JOB_TITLE },
    });
  }
  const updated = await prisma.user.findUnique({ where: { id: userId } });
  if (!updated) return res.status(404).json({ error: "User not found" });
  const session = await createSession(updated);
  return res.json({ ...session });
}

export async function logout(req: Request, res: Response) {
  const userId = (req as { user?: { id: string } }).user?.id;
  if (!userId) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  await prisma.refreshToken.deleteMany({ where: { userId } });
  return res.json({ ok: true });
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
  if (stored.user.authProvider !== "GOOGLE" && !stored.user.emailVerified) {
    await prisma.refreshToken.deleteMany({ where: { userId: stored.user.id } }).catch(() => {});
    return res.status(403).json({
      error: "Please verify your email before continuing.",
      code: "EMAIL_NOT_VERIFIED",
      email: stored.user.email,
    });
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
  try {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return res.status(404).json({ error: "User not found" });
    if (user.authProvider !== "GOOGLE" && !user.emailVerified) {
      return res.status(403).json({
        error: "Please verify your email before continuing.",
        code: "EMAIL_NOT_VERIFIED",
        email: user.email,
      });
    }
    const certification = await calculateCertificationLevel(userId);
    return res.json({
      user: { id: user.id, name: user.name, email: user.email, role: user.role, authProvider: user.authProvider },
      certification_level: certification.level,
      certification_label: certification.label,
      role_type: certification.roleType,
    });
  } catch (err) {
    console.error("[auth/me]", err);
    return res.status(503).json({ error: "Service temporarily unavailable. Please try again." });
  }
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
