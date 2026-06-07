import { Router } from "express";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { requireAuth, AuthedRequest } from "../middleware/auth.js";
import { prisma } from "../config/prisma.js";
import { calculateCertificationLevel, calculateCertificationLevelsForUsers } from "../services/verificationLevel.service.js";
import { integrityScoreFromViolationStats } from "../services/proctoringViolationCount.service.js";
import { getAptitudeScoreZeroToHundred, getAptitudeScoresZeroToHundredBatch } from "../utils/aptitudeScore.js";
import {
  filterResumeForRecruiter,
  getFullProvenhireResumeForCandidate,
  syncProvenhireResumeFromSources,
} from "../services/provenhireResume.service.js";
import {
  activePublishedJobLimit,
  contactLimit,
  ensureRecruiterUsageRow,
  jdInterviewMonthlyAllowance,
  normalizeSubscriptionTier,
  profileViewLimit,
} from "../utils/recruiterSubscription.js";

export const usersRouter = Router();

const ANON_CANDIDATE_NAME = "Verified candidate";
const DEFAULT_TARGET_JOB_TITLE = "Full Stack Developer";

async function revealedJobSeekerIdsForRecruiter(recruiterProfileId: string): Promise<Set<string>> {
  const rows = await prisma.jobApplication.findMany({
    where: {
      NOT: { status: "applied" },
      job: { postedById: recruiterProfileId },
    },
    select: { jobSeekerId: true },
  });
  return new Set(rows.map((r) => r.jobSeekerId));
}

function anonymizeRecruiterCandidateListRow(row: {
  full_name: string | null;
  bio: string | null;
  phone: string | null;
  location: string | null;
  college: string | null;
  graduation_year: string | null;
  resume_url: string | null;
  notice_period: string | null;
  current_salary: string | null;
  expected_salary: string | null;
  current_role: string | null;
}) {
  return {
    ...row,
    full_name: ANON_CANDIDATE_NAME,
    current_role: null,
    bio: null,
    phone: null,
    location: null,
    college: null,
    graduation_year: null,
    resume_url: null,
    notice_period: null,
    current_salary: null,
    expected_salary: null,
  };
}

usersRouter.get("/me", requireAuth, async (req: AuthedRequest, res) => {
  const [user, certification] = await Promise.all([
    prisma.user.findUnique({
      where: { id: req.user!.id },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        emailVerified: true,
        authProvider: true,
        profileImage: true,
        createdAt: true,
      },
    }),
    calculateCertificationLevel(req.user!.id),
  ]);
  res.json({
    user,
    certification_level: certification.level,
    certification_label: certification.label,
    certificationLevel: certification.certificationLevel ?? null,
    certificationLabelShort: certification.certificationLabel ?? null,
    role_type: certification.roleType,
  });
});

usersRouter.get("/job-seeker-profile", requireAuth, async (req: AuthedRequest, res) => {
  await prisma.jobSeekerProfile.updateMany({
    where: { userId: req.user!.id, targetJobTitle: null },
    data: { targetJobTitle: DEFAULT_TARGET_JOB_TITLE, roleType: "technical" },
  });
  const profile = await prisma.jobSeekerProfile.findUnique({ where: { userId: req.user!.id } });
  res.json({ profile });
});

/** Current user's profile in same shape as candidates/:profileId (for job seeker resume view = recruiters' view) */
usersRouter.get("/me/candidate-profile", requireAuth, async (req: AuthedRequest, res) => {
  const profile = await prisma.jobSeekerProfile.findUnique({
    where: { userId: req.user!.id },
    include: { user: { select: { email: true } } },
  });
  if (!profile) return res.status(404).json({ error: "Profile not found" });

  const [stages, proctoringEvents, cert, skillVerifications] = await Promise.all([
    prisma.verificationStage.findMany({
      where: { userId: profile.userId },
      select: { stageName: true, status: true, score: true },
    }),
    prisma.proctoringEvent.findMany({
      where: { userId: profile.userId },
      select: { type: true, riskScore: true },
    }),
    calculateCertificationLevel(profile.userId),
    prisma.candidateSkillVerification.findMany({
      where: { userId: profile.userId },
      select: { skillType: true, status: true, completedAt: true, expiresAt: true },
    }),
  ]);

  const stageScore = (name: string) =>
    stages.find((s) => s.stageName === name && s.status === "completed")?.score ?? null;
  const humanExpert = stageScore("human_expert_interview");
  const aptitudeStageScore = stageScore("aptitude_test");
  const aptitudeScore = await getAptitudeScoreZeroToHundred(profile.userId, aptitudeStageScore);
  const maxViolationIndex = proctoringEvents.reduce((acc, e) => Math.max(acc, e.riskScore ?? 0), 0);
  const integrityScore = integrityScoreFromViolationStats(maxViolationIndex, proctoringEvents.length);

  const skills = Array.isArray(profile.skills)
    ? profile.skills
    : profile.skills
      ? [String(profile.skills)]
      : [];
  const education = Array.isArray(profile.education)
    ? profile.education
    : profile.education
      ? [profile.education]
      : [];
  const workExperience = Array.isArray(profile.workExperience)
    ? profile.workExperience
    : profile.workExperience
      ? [profile.workExperience]
      : [];

  const toFreshness = (sv: { skillType: string; status: string; completedAt: Date | null; expiresAt: Date | null } | undefined) => {
    if (!sv) return null;
    const effectiveStatus = sv.expiresAt && new Date() > sv.expiresAt ? "EXPIRED" : sv.status;
    if (effectiveStatus === "EXPIRED") return { status: "EXPIRED" as const, last_verified_days_ago: null };
    if (!sv.completedAt) return { status: sv.status, last_verified_days_ago: null };
    const daysAgo = Math.floor((Date.now() - sv.completedAt.getTime()) / (1000 * 60 * 60 * 24));
    return { status: effectiveStatus, last_verified_days_ago: daysAgo };
  };
  const skillFreshness = {
    aptitude: toFreshness(skillVerifications.find((s) => s.skillType === "APTITUDE")),
    live_coding: toFreshness(skillVerifications.find((s) => s.skillType === "LIVE_CODING")),
    interview: toFreshness(skillVerifications.find((s) => s.skillType === "INTERVIEW")),
  };

  res.json({
    profile: {
      id: profile.id,
      user_id: profile.userId,
      full_name: profile.fullName,
      email: profile.user?.email,
      current_role: profile.currentRole,
      experience_years: profile.experienceYears,
      verification_status: profile.verificationStatus,
      skills,
      target_job_title: profile.targetJobTitle,
      about: profile.about,
      phone: profile.phone,
      location: profile.location,
      college: profile.college,
      graduation_year: profile.graduationYear,
      resume_url: profile.resumeUrl,
      education,
      work_experience: workExperience,
      certification_level: cert.level,
      certification_label: cert.label,
      certificationLevel: cert.certificationLevel ?? null,
      certificationLabelShort: cert.certificationLabel ?? null,
      aptitude_score: aptitudeScore,
      dsa_score: stageScore("dsa_round"),
      ai_interview_score: stageScore("expert_interview"),
      human_expert_interview_score: humanExpert,
      assignment_score: stageScore("non_tech_assignment"),
      integrity_score: integrityScore,
      skill_freshness: skillFreshness,
      notice_period: profile.noticePeriod,
      current_salary: profile.currentSalary,
      expected_salary: profile.expectedSalary,
      proctoring_events: proctoringEvents.length,
    },
  });
});

usersRouter.get("/me/provenhire-resume", requireAuth, async (req: AuthedRequest, res) => {
  if (req.user!.role !== "jobseeker") {
    return res.status(403).json({ error: "Only job seekers have a ProvenHire resume." });
  }
  const full = await getFullProvenhireResumeForCandidate(req.user!.id);
  if (!full) return res.status(404).json({ error: "Profile not found" });
  res.json({ resume: full });
});

usersRouter.post("/me/provenhire-resume/review/approve", requireAuth, async (req: AuthedRequest, res) => {
  if (req.user!.role !== "jobseeker") {
    return res.status(403).json({ error: "Only job seekers can approve project review." });
  }
  await syncProvenhireResumeFromSources(req.user!.id);
  const row = await prisma.provenHireResume.findUnique({ where: { userId: req.user!.id } });
  if (!row) return res.status(404).json({ error: "Resume not found" });
  const projects = Array.isArray(row.projects) ? [...(row.projects as object[])] : [];
  for (const p of projects) {
    if (p && typeof p === "object" && !Array.isArray(p)) {
      (p as Record<string, unknown>).pendingReview = false;
    }
  }
  await prisma.provenHireResume.update({
    where: { userId: req.user!.id },
    data: {
      projects: projects as Prisma.InputJsonValue,
      pendingCandidateReview: false,
    },
  });
  res.json({ ok: true });
});

usersRouter.post("/me/provenhire-resume/change-request", requireAuth, async (req: AuthedRequest, res) => {
  if (req.user!.role !== "jobseeker") {
    return res.status(403).json({ error: "Only job seekers can submit change requests." });
  }
  const schema = z.object({
    section: z.string().min(1),
    note: z.string().min(1).max(4000),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid payload" });
  const request = await prisma.resumeChangeRequest.create({
    data: {
      userId: req.user!.id,
      section: parsed.data.section,
      note: parsed.data.note,
      status: "pending",
    },
  });
  res.json({ ok: true, request });
});

usersRouter.post("/me/provenhire-resume/project/:projectId/approve", requireAuth, async (req: AuthedRequest, res) => {
  if (req.user!.role !== "jobseeker") {
    return res.status(403).json({ error: "Only job seekers can approve projects." });
  }
  const { projectId } = req.params;
  await syncProvenhireResumeFromSources(req.user!.id);
  const row = await prisma.provenHireResume.findUnique({ where: { userId: req.user!.id } });
  if (!row) return res.status(404).json({ error: "Resume not found." });

  const projects = Array.isArray(row.projects) ? [...(row.projects as object[])] : [];
  let found = false;
  for (const p of projects) {
    if (p && typeof p === "object" && !Array.isArray(p)) {
      const proj = p as Record<string, unknown>;
      if (proj.id === projectId || proj.interviewId === projectId || proj.name === projectId) {
        proj.pendingReview = false;
        found = true;
      }
    }
  }
  if (!found) return res.status(404).json({ error: "Project not found." });

  const anyPending = projects.some(
    (p) => p && typeof p === "object" && (p as Record<string, unknown>).pendingReview === true
  );
  await prisma.provenHireResume.update({
    where: { userId: req.user!.id },
    data: {
      projects: projects as Prisma.InputJsonValue,
      pendingCandidateReview: anyPending,
    },
  });
  res.json({ ok: true, message: "Project approved. It is now visible to recruiters." });
});

usersRouter.post("/job-seeker-profile", requireAuth, async (req: AuthedRequest, res) => {
  try {
  const schema = z.object({
    fullName: z.string().optional(),
    // email is NOT accepted — sign-up email (User.email) is the main, immutable email
    currentRole: z.string().optional(),
    experienceYears: z.number().optional(),
    resumeUrl: z.string().optional(),
    about: z.string().optional(),
    bio: z.string().optional(),
    phone: z.string().optional(),
    location: z.string().optional(),
    college: z.string().optional(),
    graduationYear: z.string().optional(),
    skills: z.any().optional(),
    education: z.any().optional(),
    workExperience: z.any().optional(),
    roleType: z.enum(["technical", "non_technical", "data"]).optional(),
    targetJobTitle: z.string().optional(),
    noticePeriod: z.union([z.string(), z.null()]).optional(),
    currentSalary: z.union([z.string(), z.null()]).optional(),
    expectedSalary: z.string().optional(),
    portfolioUrl: z.union([z.string().url(), z.literal("")]).optional(),
    enforceRequiredFields: z.boolean().optional(),
    /** When "unemployed" or "student", notice period / current salary / current role / experience are not required */
    employmentStatus: z.enum(["employed", "unemployed", "student"]).optional(),
  });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      const issues = parsed.error.errors.map((e) => ({ field: e.path.join("."), message: e.message }));
      return res.status(400).json({
        error: "Invalid profile data",
        details: issues,
        message: issues.map((i) => `${i.field}: ${i.message}`).join("; "),
      });
    }
    const { bio, enforceRequiredFields, employmentStatus, ...rest } = parsed.data;
    const raw = { ...rest, ...(bio !== undefined ? { about: bio } : {}) };
    const data = Object.fromEntries(
      Object.entries(raw).filter(([, v]) => v !== undefined)
    ) as Record<string, unknown>;
    const isEmployed = employmentStatus !== "unemployed" && employmentStatus !== "student";
    if (enforceRequiredFields) {
      const issues: Array<{ field: string; message: string }> = [];
      const stringField = (key: string) => (data[key] == null ? "" : String(data[key])).trim();
      const fullName = stringField("fullName");
      const phone = stringField("phone");
      const location = stringField("location");
      const currentRole = stringField("currentRole");
      const noticePeriod = stringField("noticePeriod");
      const currentSalary = stringField("currentSalary");
      const expectedSalary = stringField("expectedSalary");
      const experienceYears = data.experienceYears;
      const skills = data.skills;

      if (!fullName) issues.push({ field: "fullName", message: "Full name is required." });
      if (!phone) issues.push({ field: "phone", message: "Phone number is required." });
      if (!location) issues.push({ field: "location", message: "Location is required." });
      if (isEmployed) {
        if (!currentRole) issues.push({ field: "currentRole", message: "Current role is required." });
        if (typeof experienceYears !== "number" || Number.isNaN(experienceYears) || experienceYears < 0) {
          issues.push({ field: "experienceYears", message: "Valid experience in years is required." });
        }
        if (!noticePeriod) issues.push({ field: "noticePeriod", message: "Notice period is required." });
        if (!currentSalary) issues.push({ field: "currentSalary", message: "Current salary is required." });
      }
      const hasSkills = Array.isArray(skills)
        ? skills.filter((s) => String(s).trim().length > 0).length > 0
        : typeof skills === "string"
          ? skills.trim().length > 0
          : false;
      if (!hasSkills) issues.push({ field: "skills", message: "At least one skill is required." });
      if (!expectedSalary) issues.push({ field: "expectedSalary", message: "Expected salary is required." });

      if (issues.length > 0) {
        return res.status(400).json({
          error: "Incomplete profile data",
          details: issues,
          message: "Please complete all mandatory profile details before continuing.",
        });
      }
    }
    // Never update email from profile — sign-up email (User.email) is the main, immutable email
    delete data.email;
    delete data.employmentStatus;
    delete data.enforceRequiredFields;
    delete data.verificationStatus;
    if ("roleType" in data) data.roleType = "technical";
    if ("targetJobTitle" in data) {
      const title = String(data.targetJobTitle ?? "").trim();
      data.targetJobTitle = title || DEFAULT_TARGET_JOB_TITLE;
    }
    const user = await prisma.user.findUnique({ where: { id: req.user!.id }, select: { email: true } });
    await prisma.jobSeekerProfile.upsert({
      where: { userId: req.user!.id },
      create: {
        userId: req.user!.id,
        email: user?.email ?? null,
        roleType: "technical",
        targetJobTitle: DEFAULT_TARGET_JOB_TITLE,
        ...data,
      },
      update: data,
    });
    await prisma.jobSeekerProfile.updateMany({
      where: { userId: req.user!.id, targetJobTitle: null },
      data: { targetJobTitle: DEFAULT_TARGET_JOB_TITLE },
    });
    const profile = await prisma.jobSeekerProfile.findUnique({ where: { userId: req.user!.id } });
    void syncProvenhireResumeFromSources(req.user!.id).catch(() => {});
    return res.json({ profile });
  } catch (e) {
    console.error("[job-seeker-profile]", e);
    const msg = e instanceof Error ? e.message : "Failed to save profile";
    return res.status(500).json({ error: msg, message: msg });
  }
});

usersRouter.get("/recruiter-profile", requireAuth, async (req: AuthedRequest, res) => {
  const profile = await prisma.recruiterProfile.findUnique({ where: { userId: req.user!.id } });
  res.json({ profile });
});

/** PRD §3 — limits + month-to-date usage for recruiter dashboard / upgrade prompts */
usersRouter.get("/me/recruiter-subscription", requireAuth, async (req: AuthedRequest, res) => {
  if (req.user!.role !== "recruiter") {
    return res.status(403).json({ error: "Recruiters only" });
  }
  const profile = await prisma.recruiterProfile.findUnique({ where: { userId: req.user!.id } });
  if (!profile) {
    return res.status(404).json({ error: "Recruiter profile not found" });
  }
  const usage = await ensureRecruiterUsageRow(profile.id);
  const tier = normalizeSubscriptionTier(usage);
  res.json({
    subscriptionTier: tier,
    limits: {
      activePublishedJobLimit: activePublishedJobLimit(tier),
      profileViewLimit: profileViewLimit(tier),
      contactLimit: contactLimit(tier),
      jdInterviewMonthlyAllowance: jdInterviewMonthlyAllowance(tier),
    },
    used: {
      profileViewCountMonth: usage.profileViewCountMonth,
      contactCountMonth: usage.contactCountMonth,
      jdInterviewCountMonth: usage.jdInterviewCountMonth,
      shortlistCountMonth: usage.shortlistCountMonth,
      activeJobCount: usage.activeJobCount,
    },
    periodStart: usage.periodStart.toISOString(),
  });
});

const GENERIC_EMAIL_DOMAINS = ["gmail.com", "yahoo.com", "outlook.com", "hotmail.com", "icloud.com", "live.com", "ymail.com", "rediffmail.com"];

function normalizeDomain(urlOrDomain: string | null | undefined): string | null {
  if (!urlOrDomain || typeof urlOrDomain !== "string") return null;
  const s = urlOrDomain.trim().toLowerCase();
  try {
    if (!s.includes(".")) return null;
    if (s.startsWith("http://") || s.startsWith("https://")) {
      const u = new URL(s);
      const host = u.hostname.replace(/^www\./, "");
      return host || null;
    }
    return s.replace(/^www\./, "");
  } catch {
    return null;
  }
}

function extractEmailDomain(email: string | null | undefined): string | null {
  if (!email || typeof email !== "string") return null;
  const part = email.trim().toLowerCase().split("@")[1];
  return part || null;
}

// Optional string: accept string, null, or omit (frontend may send null for empty optional fields).
const optionalString = () => z.union([z.string(), z.null()]).optional();

usersRouter.post("/recruiter-profile", requireAuth, async (req: AuthedRequest, res) => {
  const schema = z.object({
    companyName: optionalString(),
    companySize: optionalString(),
    designation: optionalString(),
    phone: optionalString(),
    companyWebsite: optionalString(),
    industry: optionalString(),
    hiringFor: optionalString(),
    onboardingCompleted: z.boolean().optional(),
    fullName: optionalString(),
    workEmail: optionalString(),
    linkedInProfile: z
      .union([z.string(), z.literal(""), z.null()])
      .optional()
      .transform((v) => (v == null || v === "" ? "" : /^https?:\/\//i.test(String(v)) ? String(v) : "https://" + String(v))),
    companyLinkedin: z
      .union([z.string(), z.literal(""), z.null()])
      .optional()
      .transform((v) => (v == null || v === "" ? "" : /^https?:\/\//i.test(String(v)) ? String(v) : "https://" + String(v))),
    verificationDocumentUrl: optionalString(),
    companyLogo: optionalString(),
    headquarters: optionalString(),
    companyDescription: optionalString(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    console.error("[recruiter-profile] validation error:", parsed.error.flatten());
    return res.status(400).json({ error: "Invalid payload" });
  }

  const data = { ...parsed.data };
  const workEmail = data.workEmail?.trim() || null;
  const companyWebsite = data.companyWebsite?.trim() || null;
  const emailDomain = extractEmailDomain(workEmail);
  const websiteDomain = normalizeDomain(companyWebsite);
  const isGenericEmail = emailDomain ? GENERIC_EMAIL_DOMAINS.some((d) => emailDomain === d) : true;
  const emailDomainVerified = !isGenericEmail && !!emailDomain && !!websiteDomain && emailDomain === websiteDomain;

  const existing = await prisma.recruiterProfile.findUnique({ where: { userId: req.user!.id } });
  const payload: Record<string, unknown> = Object.fromEntries(
    Object.entries(data).filter(([, v]) => v !== undefined)
  ) as Record<string, unknown>;
  payload.emailDomainVerified = emailDomainVerified;
  if (payload.verificationDocumentUrl && existing?.verificationStatus !== "verified") {
    payload.verificationStatus = "pending";
  }
  const profile = await prisma.recruiterProfile.upsert({
    where: { userId: req.user!.id },
    create: {
      userId: req.user!.id,
      ...payload,
      verificationStatus: "pending",
    } as any,
    update: payload as any,
  });
  res.json({ profile });
});

usersRouter.get("/candidates", requireAuth, async (req: AuthedRequest, res) => {
  const eliteOnly = req.query.eliteOnly === "true";
  const rows = await prisma.jobSeekerProfile.findMany({
    take: eliteOnly ? 100 : 50,
    orderBy: { createdAt: "desc" },
  });
  const userIds = rows.map((p) => p.userId);
  const [stages, proctoringEvents] = await Promise.all([
    prisma.verificationStage.findMany({
      where: { userId: { in: userIds } },
      select: { userId: true, stageName: true, status: true, score: true },
    }),
    prisma.proctoringEvent.findMany({
      where: { userId: { in: userIds } },
      select: { userId: true, riskScore: true },
    }),
  ]);

  const stageByUser = new Map<string, { stageName: string; status: string; score: number | null }[]>();
  for (const s of stages) {
    if (!stageByUser.has(s.userId)) stageByUser.set(s.userId, []);
    stageByUser.get(s.userId)!.push(s);
  }

  const maxViolationIdxByUser = new Map<string, number>();
  const proctorEventCountByUser = new Map<string, number>();
  for (const ev of proctoringEvents) {
    if (!ev.userId) continue;
    const prev = maxViolationIdxByUser.get(ev.userId) ?? 0;
    maxViolationIdxByUser.set(ev.userId, Math.max(prev, ev.riskScore ?? 0));
    proctorEventCountByUser.set(ev.userId, (proctorEventCountByUser.get(ev.userId) ?? 0) + 1);
  }

  const certByUser = await calculateCertificationLevelsForUsers(userIds);

  const aptitudeStageScore = (uid: string) => {
    const userStages = stageByUser.get(uid) ?? [];
    return userStages.find((s) => s.stageName === "aptitude_test" && s.status === "completed")?.score ?? null;
  };
  const aptitudeScoresBatch = await getAptitudeScoresZeroToHundredBatch(userIds, aptitudeStageScore);

  let profiles = rows.map((p) => {
    const skills = Array.isArray(p.skills) ? p.skills : p.skills ? [String(p.skills)] : [];
    const activelyLookingRoles = p.targetJobTitle ? [p.targetJobTitle] : [];
    const userStages = stageByUser.get(p.userId) ?? [];
    const stageScore = (stageName: string) =>
      userStages.find((s) => s.stageName === stageName && s.status === "completed")?.score ?? null;
    const humanExpert = stageScore("human_expert_interview");
    const cert = certByUser.get(p.userId);
    const integrityScore = integrityScoreFromViolationStats(
      maxViolationIdxByUser.get(p.userId) ?? 0,
      proctorEventCountByUser.get(p.userId) ?? 0,
    );

    return {
      id: p.id,
      user_id: p.userId,
      full_name: p.fullName,
      current_role: p.currentRole,
      experience_years: p.experienceYears,
      verification_status: p.verificationStatus,
      skills,
      actively_looking_roles: activelyLookingRoles,
      bio: p.about,
      phone: p.phone,
      location: p.location,
      college: p.college,
      graduation_year: p.graduationYear,
      resume_url: p.resumeUrl,
      created_at: p.createdAt?.toISOString?.() ?? null,
      certification_level: cert?.level ?? 0,
      certification_label: cert?.label ?? "Level 0 - Not Yet Certified",
      certificationLevel: cert?.certificationLevel ?? null,
      certificationLabelShort: cert?.certificationLabel ?? null,
      aptitude_score: aptitudeScoresBatch.get(p.userId) ?? stageScore("aptitude_test"),
      dsa_score: stageScore("dsa_round"),
      ai_interview_score: stageScore("expert_interview"),
      human_expert_interview_score: humanExpert,
      assignment_score: stageScore("non_tech_assignment"),
      integrity_score: integrityScore,
      notice_period: p.noticePeriod,
      current_salary: p.currentSalary,
      expected_salary: p.expectedSalary,
    };
  });
  if (eliteOnly) {
    profiles = profiles.filter((p) => (p.certification_level ?? 0) >= 3);
  }
  res.json({ profiles });
});

/** ProvenHire Resume for recruiters (tier-filtered). Consumes one profile view credit (PRD §5). */
usersRouter.get("/candidates/:profileId/resume", requireAuth, async (req: AuthedRequest, res) => {
  if (req.user!.role !== "recruiter" && req.user!.role !== "admin") {
    return res.status(403).json({ error: "Recruiters only" });
  }
  const profileId = req.params.profileId;
  const profile = await prisma.jobSeekerProfile.findUnique({ where: { id: profileId } });
  if (!profile) return res.status(404).json({ error: "Candidate not found" });

  let resumeTier: "free" | "paid" = "paid";
  let recruiterIdForUsage: string | null = null;
  let consumeProfileViewCredit = false;

  if (req.user!.role === "recruiter") {
    const recruiter = await prisma.recruiterProfile.findUnique({
      where: { userId: req.user!.id },
      include: { usage: true },
    });
    if (!recruiter) return res.status(403).json({ error: "Complete your recruiter profile first." });
    recruiterIdForUsage = recruiter.id;
    const usageRow = recruiter.usage ?? (await ensureRecruiterUsageRow(recruiter.id));
    const sub = normalizeSubscriptionTier(usageRow);
    resumeTier = sub === "free" ? "free" : "paid";
    const limit = profileViewLimit(sub);

    const priorView = await prisma.recruiterCandidateResumeView.findUnique({
      where: {
        recruiterId_candidateUserId: { recruiterId: recruiter.id, candidateUserId: profile.userId },
      },
    });

    if (!priorView) {
      if (limit !== Number.MAX_SAFE_INTEGER && usageRow.profileViewCountMonth >= limit) {
        return res.status(402).json({
          error:
            "You have used all ProvenHire full-profile views for this period. Upgrade your recruiter plan for more views.",
          code: "PROFILE_VIEW_LIMIT",
          used: usageRow.profileViewCountMonth,
          limit,
        });
      }
      consumeProfileViewCredit = true;
    }
  }

  const full = await getFullProvenhireResumeForCandidate(profile.userId);
  if (!full) return res.status(404).json({ error: "Resume not available" });

  if (recruiterIdForUsage && consumeProfileViewCredit) {
    await prisma.$transaction([
      prisma.recruiterCandidateResumeView.create({
        data: { recruiterId: recruiterIdForUsage, candidateUserId: profile.userId },
      }),
      prisma.recruiterUsage.update({
        where: { recruiterId: recruiterIdForUsage },
        data: { profileViewCountMonth: { increment: 1 } },
      }),
    ]);
  }

  res.json({ resume: filterResumeForRecruiter(full, resumeTier) });
});

/** Single candidate profile for recruiter detail view */
usersRouter.get("/candidates/:profileId", requireAuth, async (req: AuthedRequest, res) => {
  const profileId = req.params.profileId;
  const profile = await prisma.jobSeekerProfile.findUnique({
    where: { id: profileId },
    include: { user: { select: { email: true } } },
  });
  if (!profile) return res.status(404).json({ error: "Candidate not found" });

  const [stages, proctoringEvents, cert, skillVerifications] = await Promise.all([
    prisma.verificationStage.findMany({
      where: { userId: profile.userId },
      select: { stageName: true, status: true, score: true },
    }),
    prisma.proctoringEvent.findMany({
      where: { userId: profile.userId },
      select: { type: true, riskScore: true },
    }),
    calculateCertificationLevel(profile.userId),
    prisma.candidateSkillVerification.findMany({
      where: { userId: profile.userId },
      select: { skillType: true, status: true, completedAt: true, expiresAt: true },
    }),
  ]);

  const stageScore = (name: string) =>
    stages.find((s) => s.stageName === name && s.status === "completed")?.score ?? null;
  const humanExpert = stageScore("human_expert_interview");
  const aptitudeScoreSingle = await getAptitudeScoreZeroToHundred(profile.userId, stageScore("aptitude_test"));
  const maxViolationIndex = proctoringEvents.reduce((acc, e) => Math.max(acc, e.riskScore ?? 0), 0);
  const integrityScore = integrityScoreFromViolationStats(maxViolationIndex, proctoringEvents.length);

  const skills = Array.isArray(profile.skills)
    ? profile.skills
    : profile.skills
      ? [String(profile.skills)]
      : [];
  const education = Array.isArray(profile.education)
    ? profile.education
    : profile.education
      ? [profile.education]
      : [];
  const workExperience = Array.isArray(profile.workExperience)
    ? profile.workExperience
    : profile.workExperience
      ? [profile.workExperience]
      : [];

  const toFreshness = (sv: { skillType: string; status: string; completedAt: Date | null; expiresAt: Date | null } | undefined) => {
    if (!sv) return null;
    const effectiveStatus = sv.expiresAt && new Date() > sv.expiresAt ? "EXPIRED" : sv.status;
    if (effectiveStatus === "EXPIRED") return { status: "EXPIRED" as const, last_verified_days_ago: null };
    if (!sv.completedAt) return { status: sv.status, last_verified_days_ago: null };
    const daysAgo = Math.floor((Date.now() - sv.completedAt.getTime()) / (1000 * 60 * 60 * 24));
    return { status: effectiveStatus, last_verified_days_ago: daysAgo };
  };
  const skillFreshness = {
    aptitude: toFreshness(skillVerifications.find((s) => s.skillType === "APTITUDE")),
    live_coding: toFreshness(skillVerifications.find((s) => s.skillType === "LIVE_CODING")),
    interview: toFreshness(skillVerifications.find((s) => s.skillType === "INTERVIEW")),
  };

  let payload: Record<string, unknown> = {
    id: profile.id,
    user_id: profile.userId,
    full_name: profile.fullName,
    email: profile.user?.email,
    current_role: profile.currentRole,
    experience_years: profile.experienceYears,
    verification_status: profile.verificationStatus,
    skills,
    target_job_title: profile.targetJobTitle,
    about: profile.about,
    phone: profile.phone,
    location: profile.location,
    college: profile.college,
    graduation_year: profile.graduationYear,
    resume_url: profile.resumeUrl,
    education,
    work_experience: workExperience,
    certification_level: cert.level,
    certification_label: cert.label,
    certificationLevel: cert.certificationLevel ?? null,
    certificationLabelShort: cert.certificationLabel ?? null,
    aptitude_score: aptitudeScoreSingle,
    dsa_score: stageScore("dsa_round"),
    ai_interview_score: stageScore("expert_interview"),
    human_expert_interview_score: humanExpert,
    assignment_score: stageScore("non_tech_assignment"),
    integrity_score: integrityScore,
    skill_freshness: skillFreshness,
    notice_period: profile.noticePeriod,
    current_salary: profile.currentSalary,
    expected_salary: profile.expectedSalary,
    proctoring_events: proctoringEvents.length,
  };

  if (req.user!.role === "recruiter") {
    const recruiter = await prisma.recruiterProfile.findUnique({
      where: { userId: req.user!.id },
      select: { id: true },
    });
    const revealed = recruiter ? await revealedJobSeekerIdsForRecruiter(recruiter.id) : new Set<string>();
    if (!revealed.has(profile.userId)) {
      payload = {
        ...payload,
        full_name: ANON_CANDIDATE_NAME,
        email: null,
        current_role: null,
        about: null,
        phone: null,
        location: null,
        college: null,
        graduation_year: null,
        resume_url: null,
        education: [],
        work_experience: [],
        notice_period: null,
        current_salary: null,
        expected_salary: null,
      };
    }
  }

  res.json({ profile: payload });
});
