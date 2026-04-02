import { Router } from "express";
import bcrypt from "bcrypt";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
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
import { evaluateInterview, parseInterviewEvaluationJson } from "../services/ai.service.js";
import { computeAiInterviewAggregateScore } from "../utils/aiInterviewScore.js";
import type { QuestionPlanItem } from "../data/aiInterviewStaticQuestions.js";
import type { QuestionAnswerPair } from "../services/ai.service.js";
import { upsertSkillVerification } from "../services/skillVerification.service.js";
import {
  HUMAN_INTERVIEW_PRICE_PAISE,
} from "../services/humanInterviewGate.service.js";
import {
  sendHumanInterviewApprovedEmail,
  sendHumanInterviewRejectedEmail,
} from "../services/resend.js";

function csvEscape(s: string | null | undefined): string {
  if (s == null || s === "") return "";
  const str = String(s);
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/** Align with public jobs API semantics for admin UI */
function normalizeJobStatusAdmin(status: string | null | undefined): string {
  if (!status) return "published";
  if (status === "active") return "published";
  if (status === "closed") return "draft";
  return status;
}

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

/** Recruiters with profile + user (for admin review) */
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
    full_name: p.fullName ?? p.user?.name ?? null,
    email: p.workEmail ?? p.user?.email ?? null,
    phone: p.phone,
    designation: p.designation,
    linked_in_profile: p.linkedInProfile,
    company_name: p.companyName,
    company_logo: p.companyLogo,
    company_website: p.companyWebsite,
    company_industry: p.industry,
    company_size: p.companySize,
    company_location: p.headquarters,
    company_linkedin: p.companyLinkedin,
    company_description: p.companyDescription,
    verification_document_url: p.verificationDocumentUrl,
    verification_status: p.verificationStatus,
    email_domain_verified: p.emailDomainVerified,
    verification_rejected_reason: p.verificationRejectedReason,
    created_at: p.createdAt,
  }));
  res.json({ recruiters: mapped });
});

/** Approve or reject recruiter verification */
adminRouter.patch("/recruiters/:id/verification", async (req: AuthedRequest, res) => {
  const schema = z.object({
    status: z.enum(["verified", "rejected"]),
    reason: z.string().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid payload", validStatuses: ["verified", "rejected"] });
  }
  const { id: profileId } = req.params;
  const profile = await prisma.recruiterProfile.findUnique({ where: { id: profileId } });
  if (!profile) {
    return res.status(404).json({ error: "Recruiter profile not found" });
  }
  await prisma.recruiterProfile.update({
    where: { id: profileId },
    data: {
      verificationStatus: parsed.data.status,
      verificationRejectedReason: parsed.data.status === "rejected" ? (parsed.data.reason ?? null) : null,
    },
  });
  res.json({ ok: true, verificationStatus: parsed.data.status });
});

/** All jobs (draft + published) with poster user — `createdAt` is the job posted timestamp */
adminRouter.get("/jobs", async (_req, res) => {
  const jobs = await prisma.job.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      postedBy: {
        include: {
          user: { select: { id: true, email: true, name: true } },
        },
      },
    },
  });
  res.json({
    jobs: jobs.map((j) => ({
      id: j.id,
      title: j.title,
      company: j.company,
      location: j.location,
      status: normalizeJobStatusAdmin(j.status),
      raw_status: j.status,
      job_track: j.jobTrack ?? "tech",
      salary_range: j.salaryRange,
      minimum_certification_level: j.minimumCertificationLevel,
      created_at: j.createdAt.toISOString(),
      posted_at: j.createdAt.toISOString(),
      posted_by_recruiter_profile_id: j.postedById,
      posted_by_user_id: j.postedBy?.userId ?? null,
      posted_by_email: j.postedBy?.user?.email ?? null,
      posted_by_name: j.postedBy?.fullName ?? j.postedBy?.user?.name ?? null,
    })),
  });
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

  const rows: string[] = [];
  rows.push("Type,User ID,Name,Email,Phone,Company/Role,Verification Status,Created At");

  for (const p of jobSeekers) {
    rows.push(
      [
        "Job Seeker",
        p.userId,
        csvEscape(p.fullName ?? p.user?.name),
        csvEscape(p.email ?? p.user?.email),
        csvEscape(p.phone),
        csvEscape(p.targetJobTitle ?? p.currentRole ?? ""),
        csvEscape(p.verificationStatus ?? ""),
        p.createdAt.toISOString(),
      ].join(",")
    );
  }
  for (const p of recruiters) {
    rows.push(
      [
        "Recruiter",
        p.userId,
        csvEscape(p.user?.name),
        csvEscape(p.user?.email),
        csvEscape(p.phone),
        csvEscape(p.companyName ?? ""),
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
        csvEscape(i.name ?? i.user?.name),
        csvEscape(i.user?.email),
        csvEscape(i.phone),
        csvEscape(i.domain ?? ""),
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

/** Job seekers only (Excel-friendly IDs) */
adminRouter.get("/export-job-seekers", async (_req, res) => {
  const profiles = await prisma.jobSeekerProfile.findMany({
    include: { user: { select: { id: true, email: true, name: true, createdAt: true } } },
    orderBy: { createdAt: "desc" },
  });
  const rows: string[] = [];
  rows.push(
    "Profile ID,User ID,Name,Email,Phone,College,Verification Status,Profile Created At,User Created At",
  );
  for (const p of profiles) {
    rows.push(
      [
        p.id,
        p.userId,
        csvEscape(p.fullName ?? p.user?.name),
        csvEscape(p.user?.email ?? p.email),
        csvEscape(p.phone),
        csvEscape(p.college),
        csvEscape(p.verificationStatus ?? ""),
        p.createdAt.toISOString(),
        p.user?.createdAt?.toISOString() ?? "",
      ].join(","),
    );
  }
  const csv = rows.join("\n");
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", 'attachment; filename="provenhire-job-seekers.csv"');
  res.send("\uFEFF" + csv);
});

/** Recruiters only */
adminRouter.get("/export-recruiters", async (_req, res) => {
  const profiles = await prisma.recruiterProfile.findMany({
    include: { user: { select: { id: true, email: true, name: true, createdAt: true } } },
    orderBy: { createdAt: "desc" },
  });
  const rows: string[] = [];
  rows.push(
    "Recruiter Profile ID,User ID,Name,Work Email,User Email,Phone,Company,Verification Status,Profile Created At",
  );
  for (const p of profiles) {
    rows.push(
      [
        p.id,
        p.userId,
        csvEscape(p.fullName ?? p.user?.name),
        csvEscape(p.workEmail),
        csvEscape(p.user?.email),
        csvEscape(p.phone),
        csvEscape(p.companyName),
        csvEscape(p.verificationStatus ?? ""),
        p.createdAt.toISOString(),
      ].join(","),
    );
  }
  const csv = rows.join("\n");
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", 'attachment; filename="provenhire-recruiters.csv"');
  res.send("\uFEFF" + csv);
});

/** All jobs with poster columns */
adminRouter.get("/export-jobs", async (_req, res) => {
  const jobs = await prisma.job.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      postedBy: {
        include: {
          user: { select: { id: true, email: true, name: true } },
        },
      },
    },
  });
  const rows: string[] = [];
  rows.push(
    "Job ID,Title,Company,Location,Status,Job Track,Salary Range,Posted At (UTC),Posted By User ID,Posted By Email,Posted By Name,Recruiter Profile ID",
  );
  for (const j of jobs) {
    rows.push(
      [
        j.id,
        csvEscape(j.title),
        csvEscape(j.company),
        csvEscape(j.location),
        csvEscape(normalizeJobStatusAdmin(j.status)),
        csvEscape(j.jobTrack ?? "tech"),
        csvEscape(j.salaryRange),
        j.createdAt.toISOString(),
        j.postedBy?.userId ?? "",
        csvEscape(j.postedBy?.user?.email),
        csvEscape(j.postedBy?.fullName ?? j.postedBy?.user?.name),
        j.postedById ?? "",
      ].join(","),
    );
  }
  const csv = rows.join("\n");
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", 'attachment; filename="provenhire-jobs.csv"');
  res.send("\uFEFF" + csv);
});

/** Job applications */
adminRouter.get("/export-applications", async (_req, res) => {
  const applications = await prisma.jobApplication.findMany({
    include: {
      job: true,
      jobSeeker: { select: { id: true, email: true, name: true } },
    },
    orderBy: { appliedAt: "desc" },
    take: 5000,
  });
  const rows: string[] = [];
  rows.push(
    "Application ID,Job ID,Job Title,Company,Applicant User ID,Applicant Email,Applicant Name,Status,Applied At (UTC)",
  );
  for (const a of applications) {
    rows.push(
      [
        a.id,
        a.jobId,
        csvEscape(a.job?.title),
        csvEscape(a.job?.company),
        a.jobSeekerId,
        csvEscape(a.jobSeeker?.email),
        csvEscape(a.jobSeeker?.name),
        csvEscape(a.status),
        a.appliedAt.toISOString(),
      ].join(","),
    );
  }
  const csv = rows.join("\n");
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", 'attachment; filename="provenhire-applications.csv"');
  res.send("\uFEFF" + csv);
});

/** Interviewer applications (careers form) */
adminRouter.get("/export-interviewer-applications", async (_req, res) => {
  const apps = await prisma.interviewerApplication.findMany({ orderBy: { createdAt: "desc" } });
  const rows: string[] = [];
  rows.push(
    "Application ID,Name,Email,Phone,Track,Experience Years,Domains,LinkedIn,Status,Created At (UTC),Reviewed At (UTC)",
  );
  for (const a of apps) {
    const domains =
      Array.isArray(a.domains) ? (a.domains as string[]).join("; ") : a.domains ? String(a.domains) : "";
    rows.push(
      [
        a.id,
        csvEscape(a.name),
        csvEscape(a.email),
        csvEscape(a.phone),
        csvEscape(a.track),
        a.experienceYears ?? "",
        csvEscape(domains),
        csvEscape(a.linkedIn),
        csvEscape(a.status),
        a.createdAt.toISOString(),
        a.reviewedAt?.toISOString() ?? "",
      ].join(","),
    );
  }
  const csv = rows.join("\n");
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader(
    "Content-Disposition",
    'attachment; filename="provenhire-interviewer-applications.csv"',
  );
  res.send("\uFEFF" + csv);
});

/** Test / verification appeals */
adminRouter.get("/export-appeals", async (_req, res) => {
  const appeals = await prisma.appeal.findMany({
    orderBy: { createdAt: "desc" },
    include: { user: { select: { id: true, email: true, name: true } } },
    take: 5000,
  });
  const rows: string[] = [];
  rows.push("Appeal ID,User ID,User Email,User Name,Stage,Reason,Status,Created At (UTC)");
  for (const a of appeals) {
    rows.push(
      [
        a.id,
        a.userId,
        csvEscape(a.user?.email),
        csvEscape(a.user?.name),
        csvEscape(a.stage),
        csvEscape(a.reason),
        csvEscape(a.status),
        a.createdAt.toISOString(),
      ].join(","),
    );
  }
  const csv = rows.join("\n");
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", 'attachment; filename="provenhire-appeals.csv"');
  res.send("\uFEFF" + csv);
});

/** Proctoring events (for analysis) */
adminRouter.get("/export-proctoring-events", async (_req, res) => {
  const events = await prisma.proctoringEvent.findMany({
    orderBy: { createdAt: "desc" },
    take: 10000,
  });
  const rows: string[] = [];
  rows.push(
    "Event ID,Session ID,User ID,Test Type,Event Type,Severity,Violation index (per signal),Message,Created At (UTC)",
  );
  for (const e of events) {
    rows.push(
      [
        e.id,
        csvEscape(e.sessionId),
        csvEscape(e.userId),
        csvEscape(e.testType),
        csvEscape(e.type),
        csvEscape(e.severity),
        e.riskScore ?? "",
        csvEscape(e.message),
        e.createdAt.toISOString(),
      ].join(","),
    );
  }
  const csv = rows.join("\n");
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", 'attachment; filename="provenhire-proctoring-events.csv"');
  res.send("\uFEFF" + csv);
});

/** Feature flags snapshot (integrity settings) */
adminRouter.get("/export-feature-flags", async (_req, res) => {
  const flags = await prisma.platformFeatureFlag.findMany({
    orderBy: { featureName: "asc" },
  });
  const rows: string[] = [];
  rows.push("Feature Name,Mode,Description,Updated At (UTC)");
  for (const f of flags) {
    rows.push(
      [csvEscape(f.featureName), csvEscape(f.mode), csvEscape(f.description), f.updatedAt.toISOString()].join(","),
    );
  }
  const csv = rows.join("\n");
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", 'attachment; filename="provenhire-feature-flags.csv"');
  res.send("\uFEFF" + csv);
});

const BULK_DELETE_MAX = 100;
/** Smaller transactions avoid DB / serverless timeouts when deleting many users at once. */
const BULK_DELETE_BATCH_SIZE = 12;

const PRISMA_TX_BATCH_OPTS = {
  maxWait: 20_000,
  timeout: 120_000,
} as const;

/** Shared cascade delete for one user (must run inside a transaction). */
async function adminDeleteUserData(tx: Prisma.TransactionClient, userId: string, emailNormalized: string) {
  await tx.blockedEmail.upsert({
    where: { email: emailNormalized },
    create: { email: emailNormalized },
    update: {},
  });

  const interviewer = await tx.interviewer.findFirst({ where: { userId } });

  // Expert interviews: drop sessions where this user is the candidate OR the interviewer (FK cleanup).
  await tx.humanInterviewSession.deleteMany({
    where: {
      OR: [
        { userId },
        ...(interviewer ? [{ interviewerId: interviewer.id }] : []),
      ],
    },
  });

  // Candidate booked on another expert's slot — clear FK before deleting User.
  await tx.interviewerSlot.updateMany({
    where: { bookedUserId: userId },
    data: { bookedUserId: null },
  });

  await tx.notification.deleteMany({ where: { userId } });
  await tx.verificationStage.deleteMany({ where: { userId } });
  await tx.aptitudeTestResult.deleteMany({ where: { userId } });
  await tx.aptitudeSession.deleteMany({ where: { userId } });
  await tx.dsaRoundResult.deleteMany({ where: { userId } });
  await tx.dsaSubmission.deleteMany({ where: { userId } });
  await tx.jobApplication.deleteMany({ where: { jobSeekerId: userId } });
  await tx.savedJob.deleteMany({ where: { userId } });
  await tx.jobSeekerProfile.deleteMany({ where: { userId } });
  await tx.recruiterProfile.deleteMany({ where: { userId } });

  // AI interviews have child messages (no DB cascade) — delete messages first.
  await tx.interviewMessage.deleteMany({
    where: { interview: { userId } },
  });
  await tx.interview.deleteMany({ where: { userId } });

  await tx.refreshToken.deleteMany({ where: { userId } });
  await tx.passwordResetToken.deleteMany({ where: { userId } });
  await tx.appeal.deleteMany({ where: { userId } });
  await tx.jobAlertSubscription.deleteMany({ where: { userId } });
  await tx.resumeAnalysis.deleteMany({ where: { userId } });
  await tx.userPreferences.deleteMany({ where: { userId } });
  await tx.candidateSkillVerification.deleteMany({ where: { userId } });

  if (interviewer) {
    await tx.interviewerSlot.updateMany({
      where: { interviewerId: interviewer.id },
      data: { bookedUserId: null },
    });
    await tx.interviewer.delete({ where: { id: interviewer.id } });
  }

  await tx.user.delete({ where: { id: userId } });
}

/**
 * Delete many users in a single DB transaction (faster than N separate HTTP deletes).
 * Skips admins and the requesting admin. Emails are blocked from future signups.
 */
adminRouter.post("/users/bulk-delete", async (req: AuthedRequest, res) => {
  const schema = z.object({
    userIds: z.array(z.string().min(1)).min(1).max(BULK_DELETE_MAX),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid body", details: parsed.error.flatten() });
  }

  const adminId = req.user!.id;
  const uniqueIds = [...new Set(parsed.data.userIds)].filter((id) => id !== adminId);
  if (uniqueIds.length === 0) {
    return res.status(400).json({ error: "No valid user IDs to delete." });
  }

  const users = await prisma.user.findMany({
    where: { id: { in: uniqueIds } },
    select: { id: true, email: true, role: true },
  });

  const deletable = users.filter((u) => u.role !== "admin");
  const notFound = uniqueIds.length - users.length;
  const skippedAdmin = users.filter((u) => u.role === "admin").length;

  if (deletable.length === 0) {
    return res.status(400).json({
      error: "No users deleted. Admin accounts cannot be removed.",
      notFound,
      skippedAdmin,
    });
  }

  try {
    for (let i = 0; i < deletable.length; i += BULK_DELETE_BATCH_SIZE) {
      const chunk = deletable.slice(i, i + BULK_DELETE_BATCH_SIZE);
      await prisma.$transaction(
        async (tx) => {
          for (const u of chunk) {
            await adminDeleteUserData(tx, u.id, u.email.trim().toLowerCase());
          }
        },
        PRISMA_TX_BATCH_OPTS,
      );
    }
  } catch (e: unknown) {
    const code = e && typeof e === "object" && "code" in e ? String((e as { code: string }).code) : undefined;
    const message = e instanceof Error ? e.message : "Bulk delete failed";
    console.error("[admin/users/bulk-delete]", code ?? "", message, e);
    return res.status(500).json({
      error: "Could not complete bulk delete. Try a smaller selection or retry.",
      details: message,
      ...(code ? { code } : {}),
    });
  }

  res.json({
    ok: true,
    deleted: deletable.length,
    notFound,
    skippedAdmin,
    skippedSelf: parsed.data.userIds.includes(adminId) ? 1 : 0,
    message: `Deleted ${deletable.length} user(s). Their emails are blocked from future signups.`,
  });
});

/** Delete user (job seeker or recruiter) — email is blocked from future signups */
adminRouter.delete("/users/:userId", async (req, res) => {
  const { userId } = req.params;
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return res.status(404).json({ error: "User not found" });
  if (user.role === "admin") return res.status(400).json({ error: "Cannot delete admin users" });

  const email = user.email.trim().toLowerCase();
  try {
    await prisma.$transaction(
      async (tx) => {
        await adminDeleteUserData(tx, userId, email);
      },
      { maxWait: 20_000, timeout: 60_000 },
    );
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Delete failed";
    console.error("[admin/users/:userId DELETE]", message, e);
    return res.status(500).json({
      error: "Could not delete user (related data may still exist).",
      details: message,
    });
  }

  res.json({ ok: true, message: "User deleted. Email blocked from future signups." });
});

// --- AI Interview Pro Upgrade: question bank & pending reviews ---

adminRouter.get("/questions", async (req, res) => {
  const role = typeof req.query.role === "string" ? req.query.role : undefined;
  const level = typeof req.query.level === "string" ? req.query.level : undefined;
  const type = typeof req.query.type === "string" ? req.query.type : undefined;
  const isActive =
    req.query.isActive === "true" ? true : req.query.isActive === "false" ? false : undefined;
  const tag = typeof req.query.tag === "string" ? req.query.tag : undefined;
  const where: Prisma.InterviewQuestionBankWhereInput = {};
  if (role) where.role = role;
  if (level) where.experienceLevel = level;
  if (type) where.type = type;
  if (isActive !== undefined) where.isActive = isActive;
  if (tag) where.tags = { has: tag };
  const rows = await prisma.interviewQuestionBank.findMany({
    where,
    orderBy: [{ role: "asc" }, { experienceLevel: "asc" }, { type: "asc" }],
  });
  res.json({ questions: rows });
});

adminRouter.post("/questions", async (req: AuthedRequest, res) => {
  const schema = z.object({
    role: z.string().min(1),
    experienceLevel: z.enum(["junior", "mid", "senior"]),
    type: z.enum(["conceptual", "scenario", "problem_solving", "behavioral"]),
    prompt: z.string().min(1),
    keyPoints: z.array(z.string()).min(1),
    difficulty: z.number().int().min(1).max(5).optional(),
    tags: z.array(z.string()).optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid payload", details: parsed.error.flatten() });
  const d = parsed.data;
  const row = await prisma.interviewQuestionBank.create({
    data: {
      role: d.role,
      experienceLevel: d.experienceLevel,
      type: d.type,
      prompt: d.prompt,
      keyPoints: d.keyPoints,
      difficulty: d.difficulty ?? 2,
      tags: d.tags ?? [],
      createdBy: req.user?.id ?? null,
    },
  });
  res.status(201).json({ question: row });
});

adminRouter.patch("/questions/:id", async (req: AuthedRequest, res) => {
  const schema = z.object({
    prompt: z.string().min(1).optional(),
    keyPoints: z.array(z.string()).min(1).optional(),
    difficulty: z.number().int().min(1).max(5).optional(),
    isActive: z.boolean().optional(),
    tags: z.array(z.string()).optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid payload" });
  try {
    const d = parsed.data;
    const data: Prisma.InterviewQuestionBankUpdateInput = {};
    if (d.prompt !== undefined) data.prompt = d.prompt;
    if (d.keyPoints !== undefined) data.keyPoints = d.keyPoints;
    if (d.difficulty !== undefined) data.difficulty = d.difficulty;
    if (d.isActive !== undefined) data.isActive = d.isActive;
    if (d.tags !== undefined) data.tags = d.tags;
    if (req.user?.id) data.createdBy = req.user.id;
    const row = await prisma.interviewQuestionBank.update({
      where: { id: req.params.id },
      data,
    });
    res.json({ question: row });
  } catch {
    res.status(404).json({ error: "Question not found" });
  }
});

adminRouter.delete("/questions/:id", async (_req, res) => {
  try {
    const row = await prisma.interviewQuestionBank.update({
      where: { id: _req.params.id },
      data: { isActive: false },
    });
    res.json({ question: row, softDeleted: true });
  } catch {
    res.status(404).json({ error: "Question not found" });
  }
});

adminRouter.get("/questions/analytics", async (_req, res) => {
  const grouped = await prisma.interviewQuestionResult.groupBy({
    by: ["questionBankId"],
    _count: { id: true },
    _avg: { scoreConceptual: true, scoreReasoning: true, scoreCommunication: true },
    where: { questionBankId: { not: null } },
  });
  res.json({ analytics: grouped });
});

adminRouter.get("/interviews/pending-review", async (_req, res) => {
  const rows = await prisma.interview.findMany({
    where: { status: "pending_review" },
    orderBy: { completedAt: "asc" },
    include: {
      user: { select: { id: true, email: true, name: true } },
    },
  });
  res.json({ interviews: rows });
});

adminRouter.post("/interviews/:id/re-evaluate", async (_req, res) => {
  const interview = await prisma.interview.findUnique({
    where: { id: _req.params.id },
    include: { messages: { orderBy: { createdAt: "asc" } } },
  });
  if (!interview) return res.status(404).json({ error: "Interview not found" });
  const plan: QuestionPlanItem[] = Array.isArray(interview.questionPlan)
    ? (interview.questionPlan as QuestionPlanItem[])
    : [];
  const transcript = interview.messages.map((m) => `${m.sender.toUpperCase()}: ${m.message}`).join("\n");
  const userMessages = interview.messages.filter((m) => m.sender === "user");
  const pairs: QuestionAnswerPair[] = userMessages.map((msg, i) => ({
    question: plan[i]?.prompt ?? "",
    keyPoints: plan[i]?.keyPoints ?? [],
    answer: msg.message,
  }));
  const evaluationRaw = await evaluateInterview(transcript, pairs, {
    experienceLevel: interview.experienceLevel ?? "mid",
    jobRole: interview.jobRole,
  });
  const evaluation = parseInterviewEvaluationJson(evaluationRaw);
  if (!evaluation || evaluation.fallback_triggered) {
    return res.status(502).json({ error: "Re-evaluation failed; Gemini unavailable or invalid output" });
  }
  const { total, badge } = computeAiInterviewAggregateScore(evaluation);
  await prisma.interviewQuestionResult.deleteMany({ where: { interviewId: interview.id } });
  const perQ = evaluation.per_question_scores;
  if (Array.isArray(perQ)) {
    for (const row of perQ as Array<Record<string, unknown>>) {
      const qi = Number(row.question_index);
      if (!Number.isFinite(qi) || qi < 0 || qi >= userMessages.length) continue;
      const um = userMessages[qi];
      const bankId = plan[qi]?.questionBankId ?? null;
      await prisma.interviewQuestionResult.create({
        data: {
          interviewId: interview.id,
          messageId: um.id,
          questionBankId: typeof bankId === "string" ? bankId : null,
          questionIndex: qi,
          questionType: plan[qi]?.type ?? "unknown",
          scoreConceptual: Number(row.score_conceptual) || null,
          scoreReasoning: Number(row.score_reasoning) || null,
          scoreCommunication: Number(row.score_communication) || null,
          rationale: row.rationale != null ? String(row.rationale) : null,
          keyPointsHit: Array.isArray(row.key_points_hit) ? (row.key_points_hit as string[]).map(String) : [],
          keyPointsMissed: Array.isArray(row.key_points_missed)
            ? (row.key_points_missed as string[]).map(String)
            : [],
        },
      });
    }
  }
  await prisma.interview.update({
    where: { id: interview.id },
    data: {
      totalScore: total,
      badgeLevel: badge,
      finalVerdict: evaluation.final_verdict != null ? String(evaluation.final_verdict) : null,
      scoreBreakdown: evaluation as object,
      status: "completed",
      reviewFlag: false,
      reviewReason: null,
    },
  });
  await prisma.adminReviewQueue.upsert({
    where: { aiInterviewId: interview.id },
    create: {
      candidateId: interview.userId,
      aiInterviewId: interview.id,
      status: "pending",
    },
    update: { status: "pending", reviewedAt: null, reviewerId: null },
  });
  await prisma.verificationStage.updateMany({
    where: { userId: interview.userId, stageName: "expert_interview" },
    data: { status: "pending_review", score: total },
  });
  res.json({ ok: true, totalScore: total, badgeLevel: badge });
});

adminRouter.post("/interviews/:id/proctoring-override", async (req: AuthedRequest, res) => {
  const schema = z.object({
    action: z.enum(["approve", "reject"]),
    note: z.string().min(1),
    clearIntegrityFlag: z.boolean().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid payload" });
  const interview = await prisma.interview.findUnique({ where: { id: req.params.id } });
  if (!interview) return res.status(404).json({ error: "Interview not found" });
  await prisma.proctoringReviewLog.create({
    data: {
      interviewId: interview.id,
      adminId: req.user?.id ?? null,
      action: parsed.data.action,
      note: parsed.data.note,
    },
  });
  if (parsed.data.clearIntegrityFlag || parsed.data.action === "approve") {
    await prisma.interview.update({
      where: { id: interview.id },
      data: {
        integrityFlag: null,
        riskScore: Math.min(interview.riskScore ?? 0, 20),
      },
    });
  }
  res.json({ ok: true });
});

/** Pending AI interview → human expert admin reviews */
adminRouter.get("/ai-interview-queue/pending", async (_req, res) => {
  try {
    const items = await prisma.adminReviewQueue.findMany({
      where: { status: "pending" },
      orderBy: { createdAt: "asc" },
      include: {
        candidate: { select: { id: true, name: true, email: true } },
        aiInterview: {
          select: {
            id: true,
            totalScore: true,
            completedAt: true,
            status: true,
            jobRole: true,
            finalVerdict: true,
          },
        },
      },
    });
    res.json({ items });
  } catch (e) {
    console.error("[admin/ai-interview-queue/pending]", e);
    res.status(500).json({ error: "Failed to load queue" });
  }
});

adminRouter.post("/ai-interview-queue/:id/approve", async (req: AuthedRequest, res) => {
  try {
    const queue = await prisma.adminReviewQueue.findUnique({
      where: { id: req.params.id },
      include: { aiInterview: true },
    });
    if (!queue) return res.status(404).json({ error: "Queue item not found" });
    if (queue.status !== "pending") return res.status(400).json({ error: "Already processed" });
    const score = queue.aiInterview.totalScore ?? 0;
    const completedAt = queue.aiInterview.completedAt ?? new Date();

    await prisma.$transaction(async (tx) => {
      await tx.adminReviewQueue.update({
        where: { id: queue.id },
        data: { status: "approved", reviewedAt: new Date(), reviewerId: req.user?.id ?? null },
      });
      await tx.verificationStage.updateMany({
        where: { userId: queue.candidateId, stageName: "expert_interview" },
        data: { status: "completed", score },
      });
      const priorAttempts = await tx.humanInterviewAttempt.count({ where: { candidateId: queue.candidateId } });
      const attemptNumber = priorAttempts + 1;
      const firstAttempt = attemptNumber === 1;
      await tx.humanInterviewAttempt.create({
        data: {
          candidateId: queue.candidateId,
          adminReviewQueueId: queue.id,
          attemptNumber,
          paymentStatus: firstAttempt ? "waived" : "pending",
          amountPaise: firstAttempt ? null : HUMAN_INTERVIEW_PRICE_PAISE,
        },
      });

      if (firstAttempt) {
        await tx.verificationStage.upsert({
          where: {
            userId_stageName: { userId: queue.candidateId, stageName: "human_expert_interview" },
          },
          create: {
            userId: queue.candidateId,
            stageName: "human_expert_interview",
            status: "in_progress",
          },
          update: { status: "in_progress" },
        });
      } else {
        await tx.verificationStage.updateMany({
          where: { userId: queue.candidateId, stageName: "human_expert_interview" },
          data: { status: "locked" },
        });
      }
    });

    await upsertSkillVerification(queue.candidateId, "INTERVIEW", score, completedAt);

    const profile = await prisma.jobSeekerProfile.findUnique({
      where: { userId: queue.candidateId },
      select: { verificationStatus: true },
    });
    if (profile && profile.verificationStatus !== "expert_verified") {
      await prisma.jobSeekerProfile.updateMany({
        where: { userId: queue.candidateId },
        data: { verificationStatus: "verified" },
      });
    }

    const user = await prisma.user.findUnique({
      where: { id: queue.candidateId },
      select: { email: true, name: true },
    });
    if (user?.email) {
      void sendHumanInterviewApprovedEmail(user.email, user.name).catch(() => {});
    }

    res.json({ ok: true });
  } catch (e) {
    console.error("[admin/ai-interview-queue/approve]", e);
    res.status(500).json({ error: e instanceof Error ? e.message : "Approve failed" });
  }
});

adminRouter.post("/ai-interview-queue/:id/reject", async (req: AuthedRequest, res) => {
  try {
    const queue = await prisma.adminReviewQueue.findUnique({
      where: { id: req.params.id },
    });
    if (!queue) return res.status(404).json({ error: "Queue item not found" });
    if (queue.status !== "pending") return res.status(400).json({ error: "Already processed" });

    await prisma.$transaction(async (tx) => {
      const priorAttempts = await tx.humanInterviewAttempt.count({ where: { candidateId: queue.candidateId } });
      const attemptNumber = priorAttempts + 1;
      await tx.adminReviewQueue.update({
        where: { id: queue.id },
        data: { status: "rejected", reviewedAt: new Date(), reviewerId: req.user?.id ?? null },
      });
      await tx.verificationStage.updateMany({
        where: { userId: queue.candidateId, stageName: "expert_interview" },
        data: { status: "failed" },
      });
      await tx.verificationStage.updateMany({
        where: { userId: queue.candidateId, stageName: "human_expert_interview" },
        data: { status: "locked" },
      });
      await tx.humanInterviewAttempt.create({
        data: {
          candidateId: queue.candidateId,
          adminReviewQueueId: queue.id,
          attemptNumber,
          paymentStatus: "failed",
          amountPaise: null,
        },
      });
    });

    const user = await prisma.user.findUnique({
      where: { id: queue.candidateId },
      select: { email: true, name: true },
    });
    if (user?.email) {
      void sendHumanInterviewRejectedEmail(user.email, user.name).catch(() => {});
    }

    res.json({ ok: true });
  } catch (e) {
    console.error("[admin/ai-interview-queue/reject]", e);
    res.status(500).json({ error: e instanceof Error ? e.message : "Reject failed" });
  }
});
