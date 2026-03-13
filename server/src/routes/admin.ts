import { Router } from "express";
import bcrypt from "bcrypt";
import { z } from "zod";
import { requireAdmin, AuthedRequest } from "../middleware/auth.js";
import { prisma } from "../config/prisma.js";
import { hashToken, generateRefreshToken } from "../utils/jwt.js";
import { adminNotificationsRouter } from "./admin-notifications.js";
import { sendInterviewerAcceptanceEmail } from "../services/resend.js";
import { calculateCertificationLevel } from "../services/verificationLevel.service.js";
import {
  getAllFeatureFlags,
  updateFeatureFlag,
  ensureDefaultFlags,
  FEATURE_FLAG_MODES,
  type FeatureFlagMode,
} from "../services/featureFlag.service.js";

export const adminRouter = Router();

/** All admin routes require admin role */
adminRouter.use(requireAdmin);

/** Mount admin notifications at /api/admin/notifications */
adminRouter.use("/notifications", adminNotificationsRouter);

/** Platform Settings → Integrity Controls (Feature Flags) */
adminRouter.get("/feature-flags", async (_req, res) => {
  try {
    let flags = await getAllFeatureFlags();
    if (flags.length === 0) {
      await ensureDefaultFlags();
      flags = await getAllFeatureFlags();
    }
    res.json({ flags });
  } catch (e) {
    console.error("[admin/feature-flags] GET", e);
    res.status(500).json({ error: "Failed to load feature flags" });
  }
});

adminRouter.patch("/feature-flags/:featureName", async (req: AuthedRequest, res) => {
  const schema = z.object({ mode: z.enum(["OFF", "MONITOR", "STRICT"]) });
  const parsed = schema.safeParse({ mode: req.body?.mode });
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid mode", validModes: FEATURE_FLAG_MODES });
  }
  const { featureName } = req.params;
  const mode = parsed.data.mode as FeatureFlagMode;
  try {
    await updateFeatureFlag(featureName, mode, req.user?.id);
    const flags = await getAllFeatureFlags();
    res.json({ flags });
  } catch (e) {
    console.error("[admin/feature-flags] PATCH", e);
    res.status(500).json({ error: "Failed to update feature flag" });
  }
});

/** Job seekers with profile + user */
adminRouter.get("/job-seekers", async (_req, res) => {
  const profiles = await prisma.jobSeekerProfile.findMany({
    include: {
      user: {
        select: { id: true, email: true, name: true, createdAt: true },
      },
    },
    orderBy: { createdAt: "desc" },
  });
  const certByUserId = new Map<string, Awaited<ReturnType<typeof calculateCertificationLevel>>>();
  await Promise.all(
    profiles.map(async (p) => {
      certByUserId.set(p.userId, await calculateCertificationLevel(p.userId));
    })
  );
  const mapped = profiles.map((p) => ({
    certification_level: certByUserId.get(p.userId)?.level ?? 0,
    certification_label: certByUserId.get(p.userId)?.label ?? "Level 0 - Not Yet Certified",
    id: p.id,
    user_id: p.userId,
    college: p.college,
    experience_years: p.experienceYears,
    skills: p.skills as string[] | null,
    verification_status: p.verificationStatus,
    phone: p.phone,
    created_at: p.createdAt,
    profile: {
      full_name: p.fullName,
      // User.email (sign-up) is the main email; profile.email is legacy/fallback
      email: p.user?.email ?? p.email ?? null,
    },
  }));
  res.json({ jobSeekers: mapped });
});

/** Recruiters with profile + user */
adminRouter.get("/recruiters", async (_req, res) => {
  const profiles = await prisma.recruiterProfile.findMany({
    include: {
      user: {
        select: { id: true, email: true, name: true, createdAt: true },
      },
    },
    orderBy: { createdAt: "desc" },
  });
  const mapped = profiles.map((p) => ({
    id: p.id,
    user_id: p.userId,
    full_name: p.user?.name ?? null,
    email: p.user?.email ?? null,
    phone: p.phone,
    company_name: p.companyName,
    created_at: p.createdAt,
  }));
  res.json({ recruiters: mapped });
});

/** Aggregate stats for admin dashboard */
adminRouter.get("/stats", async (_req, res) => {
  const [totalJobSeekers, totalRecruiters, totalInterviewers, totalJobs, totalApplications, totalVerified] =
    await Promise.all([
      prisma.jobSeekerProfile.count(),
      prisma.recruiterProfile.count(),
      prisma.interviewer.count({ where: { userId: { not: null } } }),
      prisma.job.count(),
      prisma.jobApplication.count(),
      prisma.jobSeekerProfile.count({
        where: {
          verificationStatus: { in: ["verified", "expert_verified"] },
        },
      }),
    ]);

  const seekers = await prisma.jobSeekerProfile.findMany({
    select: { userId: true },
  });
  const levelBuckets: Record<number, number> = { 0: 0, 1: 0, 2: 0, 3: 0 };
  await Promise.all(
    seekers.map(async (s) => {
      const cert = await calculateCertificationLevel(s.userId);
      const lvl = Math.max(0, Math.min(3, cert.level));
      levelBuckets[lvl] = (levelBuckets[lvl] ?? 0) + 1;
    })
  );

  res.json({
    totalJobSeekers,
    totalRecruiters,
    totalInterviewers,
    totalJobs,
    totalApplications,
    totalVerified,
    certificationLevels: levelBuckets,
    levelProgressionFunnel: {
      level1OrAbove: (levelBuckets[1] ?? 0) + (levelBuckets[2] ?? 0) + (levelBuckets[3] ?? 0),
      level2OrAbove: (levelBuckets[2] ?? 0) + (levelBuckets[3] ?? 0),
      level3: levelBuckets[3] ?? 0,
    },
  });
});

/** Job applications with job + seeker info */
adminRouter.get("/applications", async (_req, res) => {
  const applications = await prisma.jobApplication.findMany({
    include: {
      job: true,
      jobSeeker: {
        select: { id: true, email: true, name: true },
      },
    },
    orderBy: { appliedAt: "desc" },
    take: 200,
  });
  res.json({
    applications: applications.map((a) => ({
      id: a.id,
      jobId: a.jobId,
      jobTitle: a.job?.title,
      company: a.job?.company,
      seekerId: a.jobSeekerId,
      seekerEmail: a.jobSeeker?.email,
      status: a.status,
      appliedAt: a.appliedAt,
    })),
  });
});

/** Interviewer applications */
adminRouter.get("/interviewer-applications", async (_req, res) => {
  const apps = await prisma.interviewerApplication.findMany({
    orderBy: { createdAt: "desc" },
  });
  res.json({
    applications: apps.map((a) => ({
      id: a.id,
      name: a.name,
      email: a.email,
      experienceYears: a.experienceYears,
      track: a.track,
      domains: a.domains as string[] | null,
      phone: a.phone,
      linkedIn: a.linkedIn,
      whyJoin: a.whyJoin,
      status: a.status,
      createdAt: a.createdAt,
      reviewedAt: a.reviewedAt,
    })),
  });
});

/** Approve interviewer application: create User + Interviewer, send invite link */
adminRouter.post("/interviewer-applications/:id/approve", async (req, res) => {
  const { id } = req.params;
  const app = await prisma.interviewerApplication.findUnique({ where: { id } });
  if (!app) return res.status(404).json({ error: "Application not found" });
  if (app.status !== "pending") return res.status(400).json({ error: "Application already reviewed" });

  const email = app.email.trim().toLowerCase();
  const existingUser = await prisma.user.findUnique({ where: { email } });
  if (existingUser) return res.status(400).json({ error: "User with this email already exists" });

  const tempPassword = generateRefreshToken();
  const passwordHash = await bcrypt.hash(tempPassword, 12);
  const user = await prisma.user.create({
    data: {
      name: app.name,
      email,
      passwordHash,
      role: "expert_interviewer",
    },
  });

  const domains = Array.isArray(app.domains) ? app.domains : app.domains ? [String(app.domains)] : [];
  const domainStr = domains.length ? String(domains[0]) : null;
  await prisma.interviewer.create({
    data: {
      userId: user.id,
      name: app.name,
      domain: domainStr,
      track: app.track,
      domains: app.domains as object,
      experienceYears: app.experienceYears,
      phone: app.phone ?? null,
      status: "active",
    },
  });

  await prisma.interviewerApplication.update({
    where: { id },
    data: { status: "approved", reviewedAt: new Date() },
  });

  await prisma.passwordResetToken.deleteMany({ where: { userId: user.id } });
  const tokenPlain = generateRefreshToken();
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 7);
  await prisma.passwordResetToken.create({
    data: {
      userId: user.id,
      tokenHash: hashToken(tokenPlain),
      expiresAt,
    },
  });

  const baseUrl = process.env.BASE_URL || "http://localhost:8080";
  const setPasswordLink = `${baseUrl}/auth?mode=reset&token=${encodeURIComponent(tokenPlain)}&email=${encodeURIComponent(user.email)}`;

  const { sendInterviewerAcceptanceEmail } = await import("../services/resend.js");
  const emailSent = await sendInterviewerAcceptanceEmail(user.email, app.name, setPasswordLink);

  res.json({
    ok: true,
    message: emailSent ? "Interviewer approved. Email sent." : "Interviewer approved. Share the link manually (RESEND_API_KEY not set).",
    setPasswordLink,
    email: user.email,
    emailSent,
  });
});

/** Reject interviewer application */
adminRouter.post("/interviewer-applications/:id/reject", async (req, res) => {
  const { id } = req.params;
  const app = await prisma.interviewerApplication.findUnique({ where: { id } });
  if (!app) return res.status(404).json({ error: "Application not found" });
  if (app.status !== "pending") return res.status(400).json({ error: "Application already reviewed" });
  await prisma.interviewerApplication.update({
    where: { id },
    data: { status: "rejected", reviewedAt: new Date() },
  });
  res.json({ ok: true });
});

/** Export all users (job seekers, recruiters, interviewers) as CSV with mobile */
adminRouter.get("/export-users", async (_req, res) => {
  const [jobSeekers, recruiters, interviewers] = await Promise.all([
    prisma.jobSeekerProfile.findMany({
      include: { user: { select: { id: true, email: true, name: true, createdAt: true } } },
      orderBy: { createdAt: "desc" },
    }),
    prisma.recruiterProfile.findMany({
      include: { user: { select: { id: true, email: true, name: true, createdAt: true } } },
      orderBy: { createdAt: "desc" },
    }),
    prisma.interviewer.findMany({
      where: { userId: { not: null } },
      include: { user: { select: { id: true, email: true, name: true, createdAt: true } } },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const escape = (s: string | null | undefined): string => {
    if (s == null || s === "") return "";
    const str = String(s);
    if (str.includes(",") || str.includes('"') || str.includes("\n")) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const rows: string[] = [];
  rows.push("Type,User ID,Name,Email,Phone,Company/Role,Verification Status,Created At");

  for (const p of jobSeekers) {
    rows.push(
      [
        "Job Seeker",
        p.userId,
        escape(p.fullName ?? p.user?.name),
        escape(p.email ?? p.user?.email),
        escape(p.phone),
        escape(p.targetJobTitle ?? p.currentRole ?? ""),
        escape(p.verificationStatus ?? ""),
        p.createdAt.toISOString(),
      ].join(",")
    );
  }
  for (const p of recruiters) {
    rows.push(
      [
        "Recruiter",
        p.userId,
        escape(p.user?.name),
        escape(p.user?.email),
        escape(p.phone),
        escape(p.companyName ?? ""),
        "",
        p.createdAt.toISOString(),
      ].join(",")
    );
  }
  for (const i of interviewers) {
    rows.push(
      [
        "Interviewer",
        i.userId ?? "",
        escape(i.name ?? i.user?.name),
        escape(i.user?.email),
        escape(i.phone),
        escape(i.domain ?? ""),
        "",
        i.createdAt.toISOString(),
      ].join(",")
    );
  }

  const csv = rows.join("\n");
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", 'attachment; filename="provenhire-users-export.csv"');
  res.send("\uFEFF" + csv);
});

/** Delete user (job seeker or recruiter) — email is blocked from future signups */
adminRouter.delete("/users/:userId", async (req, res) => {
  const { userId } = req.params;
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return res.status(404).json({ error: "User not found" });
  if (user.role === "admin") return res.status(400).json({ error: "Cannot delete admin users" });

  const email = user.email.trim().toLowerCase();
  await prisma.$transaction(async (tx) => {
    await tx.blockedEmail.upsert({
      where: { email },
      create: { email },
      update: {},
    });
    await tx.notification.deleteMany({ where: { userId } });
    await tx.verificationStage.deleteMany({ where: { userId } });
    await tx.aptitudeTestResult.deleteMany({ where: { userId } });
    await tx.dsaRoundResult.deleteMany({ where: { userId } });
    await tx.jobApplication.deleteMany({ where: { jobSeekerId: userId } });
    await tx.savedJob.deleteMany({ where: { userId } });
    await tx.jobSeekerProfile.deleteMany({ where: { userId } });
    await tx.recruiterProfile.deleteMany({ where: { userId } });
    await tx.interview.deleteMany({ where: { userId } });
    await tx.refreshToken.deleteMany({ where: { userId } });
    await tx.passwordResetToken.deleteMany({ where: { userId } });
    await tx.appeal.deleteMany({ where: { userId } });
    await tx.humanInterviewSession.deleteMany({ where: { userId } });
    await tx.jobAlertSubscription.deleteMany({ where: { userId } });
    await tx.resumeAnalysis.deleteMany({ where: { userId } });
    await tx.userPreferences.deleteMany({ where: { userId } });
    await tx.candidateSkillVerification.deleteMany({ where: { userId } });
    const interviewer = await tx.interviewer.findFirst({ where: { userId } });
    if (interviewer) {
      await tx.interviewerSlot.updateMany({ where: { interviewerId: interviewer.id }, data: { bookedUserId: null } });
      await tx.interviewer.delete({ where: { id: interviewer.id } });
    }
    await tx.user.delete({ where: { id: userId } });
  });

  res.json({ ok: true, message: "User deleted. Email blocked from future signups." });
});
