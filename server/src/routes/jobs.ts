import { Router } from "express";
import { z } from "zod";
import { requireAuth, optionalAuth, AuthedRequest } from "../middleware/auth.js";
import { prisma } from "../config/prisma.js";
import {
  calculateCertificationLevel,
  getCertificationLabel,
  minimumLevelHint,
  type CertificationTrack,
} from "../services/verificationLevel.service.js";
import { getAptitudeScoresZeroToHundredBatch } from "../utils/aptitudeScore.js";
import { integrityScoreFromViolationStats } from "../services/proctoringViolationCount.service.js";
import { computeProvenhireCertification } from "../services/verificationScoring.service.js";
import { experienceTierFromYears, salaryCapLpaForTier } from "../utils/experienceTier.js";
import { computeJobRecommendations } from "../services/jobRecommendations.service.js";
import {
  activePublishedJobLimit,
  ensureRecruiterUsageRow,
  normalizeSubscriptionTier,
  profileViewLimit,
} from "../utils/recruiterSubscription.js";

export const jobsRouter = Router();

const PUBLISH_EMPLOYMENT_TYPES = new Set(["full-time", "part-time", "contract", "internship"]);

function publishedJobFieldErrors(input: {
  description: string;
  location: string | null | undefined;
  requiredSkills: string[];
  experienceRequired: string | null | undefined;
  jobType: string | null | undefined;
}): Record<string, string> | null {
  const fieldErrors: Record<string, string> = {};
  if (input.description.trim().length < 200) {
    fieldErrors.description = "Job description must be at least 200 characters when publishing.";
  }
  if (input.requiredSkills.length < 2) {
    fieldErrors.requiredSkills = "Add at least 2 required skills (max 10).";
  }
  if (input.requiredSkills.length > 10) {
    fieldErrors.requiredSkills = "Maximum 10 required skills.";
  }
  if (!input.experienceRequired?.trim()) {
    fieldErrors.experienceRequired = "Select experience level required for this role.";
  }
  if (!input.location?.trim()) {
    fieldErrors.location = "Location is required when publishing (city or Remote).";
  }
  const jt = (input.jobType ?? "").trim().toLowerCase();
  if (!jt || !PUBLISH_EMPLOYMENT_TYPES.has(jt)) {
    fieldErrors.jobType = "Select employment type (Full-time, Part-time, Contract, or Internship).";
  }
  return Object.keys(fieldErrors).length ? fieldErrors : null;
}

function normalizeJobStatus(status: string | null | undefined): string {
  // New semantics: "draft" | "published"
  // Legacy semantics:
  // - "active" => published
  // - "closed" => draft
  if (!status) return "published";
  if (status === "active") return "published";
  if (status === "closed") return "draft";
  return status;
}

function parseSalaryMaxLpa(salaryRange?: string | null): number | null {
  if (!salaryRange) return null;
  const lakhMatch =
    salaryRange.match(/₹?\s*([\d,]+)L\s*-\s*₹?\s*([\d,]+)L/i) ||
    salaryRange.match(/₹?\s*([\d,]+)L/i);
  if (!lakhMatch) return null;
  const max = lakhMatch[2] ? parseInt(lakhMatch[2].replace(/,/g, ""), 10) : parseInt(lakhMatch[1].replace(/,/g, ""), 10);
  return Number.isNaN(max) ? null : max;
}

function getEffectiveMinimumCertificationLevel(jobTrack: "tech" | "non_technical", salaryRange?: string | null): number {
  // Policy: all jobs are open to all users, only high-package technical roles are Level 3 gated.
  if (jobTrack !== "tech") return 0;
  const maxLpa = parseSalaryMaxLpa(salaryRange);
  return (maxLpa ?? 0) >= 25 ? 3 : 0;
}

jobsRouter.get("/", optionalAuth, async (req: AuthedRequest, res) => {
  const track = req.query.track as string | undefined;
  const where: { jobTrack?: string; status?: { in: string[] } } = {
    // Only return published jobs publicly.
    status: { in: ["published", "active"] },
  };
  if (track === "tech" || track === "technical") {
    where.jobTrack = "tech";
  } else if (track === "non_technical") {
    where.jobTrack = "non_technical";
  }
  const jobs = await prisma.job.findMany({
    where: Object.keys(where).length ? where : undefined,
    orderBy: { createdAt: "desc" },
    include: {
      postedBy: {
        select: { companyLogo: true, verificationStatus: true, companyName: true },
      },
    },
  });

  const authed = req.user;
  if (!authed?.id) {
    return res.json({
      jobs: [],
      listingsGate: "anonymous",
      listingsMessage: null,
    });
  }

  const profile = await prisma.jobSeekerProfile.findUnique({ where: { userId: authed.id } });
  if (!profile) {
    const jobsForClient = jobs.map((j) => {
      const { postedBy, ...job } = j;
      return {
        ...job,
        status: normalizeJobStatus(job.status),
        companyLogo: postedBy?.companyLogo ?? null,
        recruiterVerified: postedBy?.verificationStatus === "verified",
        salaryLPA: parseSalaryMaxLpa(job.salaryRange),
        jobAccessLevel: "locked" as const,
        lockReason: "complete_dsa" as const,
      };
    });
    return res.json({ jobs: jobsForClient, listingsGate: "open", listingsMessage: null });
  }

  const roleType = (profile.roleType ?? "technical") === "non_technical" ? "non_technical" : "technical";

  if (roleType === "technical") {
    const dsaDone = await prisma.verificationStage.findFirst({
      where: { userId: authed.id, stageName: "dsa_round", status: "completed" },
    });
    if (!dsaDone) {
      return res.json({
        jobs: [],
        listingsGate: "dsa_incomplete",
        listingsMessage: "Complete your DSA Round to start browsing jobs.",
      });
    }
  } else {
    const assignDone = await prisma.verificationStage.findFirst({
      where: { userId: authed.id, stageName: "non_tech_assignment", status: "completed" },
    });
    if (!assignDone) {
      return res.json({
        jobs: [],
        listingsGate: "dsa_incomplete",
        listingsMessage: "Complete your assignment to start browsing jobs.",
      });
    }
  }

  const cert = await computeProvenhireCertification(authed.id);
  const tier = experienceTierFromYears(profile.experienceYears);
  const salaryCap = salaryCapLpaForTier(tier);

  const jobsForClient = jobs.map((j) => {
    const { postedBy, ...job } = j;
    const maxLpa = parseSalaryMaxLpa(job.salaryRange);
    let jobAccessLevel: "locked" | "unlocked" = "locked";
    let lockReason: "complete_dsa" | "complete_ai_interview" | "complete_expert_interview" | null =
      "complete_ai_interview";

    if (roleType === "non_technical") {
      if (cert.certificationLevel === "L3") {
        jobAccessLevel = "unlocked";
        lockReason = null;
      } else {
        jobAccessLevel = "locked";
        lockReason = cert.certificationLevel === "L1" ? "complete_expert_interview" : "complete_ai_interview";
      }
    } else {
      if (cert.certificationLevel === "L3") {
        jobAccessLevel = "unlocked";
        lockReason = null;
      } else if (cert.certificationLevel === "L2") {
        if (maxLpa != null && maxLpa > salaryCap) {
          jobAccessLevel = "locked";
          lockReason = "complete_expert_interview";
        } else {
          jobAccessLevel = "unlocked";
          lockReason = null;
        }
      } else {
        jobAccessLevel = "locked";
        lockReason = "complete_ai_interview";
      }
    }

    return {
      ...job,
      status: normalizeJobStatus(job.status),
      companyLogo: postedBy?.companyLogo ?? null,
      recruiterVerified: postedBy?.verificationStatus === "verified",
      salaryLPA: maxLpa,
      jobAccessLevel,
      lockReason,
    };
  });

  res.json({
    jobs: jobsForClient,
    listingsGate: "open",
    listingsMessage: null,
  });
});

jobsRouter.post("/", requireAuth, async (req: AuthedRequest, res) => {
  const schema = z.object({
    title: z.string().min(1, "Job title is required"),
    company: z.string().min(1, "Company name is required"),
    description: z.string().min(1, "Job description is required"),
    location: z.string().nullish(),
    salaryRange: z.string().nullish(),
    jobType: z.string().nullish(),
    jobTrack: z.enum(["tech", "non_technical"]).optional(),
    assignment: z.string().nullish(),
    roleCategory: z.string().nullish(),
    companyContext: z.string().nullish(),
    status: z.enum(["draft", "published", "active", "closed"]).optional(),
    minimumCertificationLevel: z.number().int().min(1).max(3).optional(),
    requiredSkills: z.array(z.string()).max(10).optional(),
    experienceRequired: z.enum(["fresher", "mid", "senior"]).optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    const issues = parsed.error.issues || [];
    const fieldErrors: Record<string, string> = {};
    for (const i of issues) {
      const path = (i.path && i.path[0] ? String(i.path[0]) : "form") as string;
      const msg = i.message || "Invalid value";
      if (!fieldErrors[path]) fieldErrors[path] = msg;
    }
    const firstMsg = Object.values(fieldErrors)[0] || "Please check the form and fix any errors.";
    return res.status(400).json({ error: firstMsg, fieldErrors });
  }

  const normalizedTrack = (parsed.data.jobTrack ?? "tech") as "tech" | "non_technical";
  const salaryGate = getEffectiveMinimumCertificationLevel(normalizedTrack, parsed.data.salaryRange ?? null);
  const requestedMin = parsed.data.minimumCertificationLevel ?? 1;
  const effectiveMinLevel = Math.max(requestedMin, salaryGate);
  const normalizedStatus = normalizeJobStatus(parsed.data.status);
  const requiredSkillList = (parsed.data.requiredSkills ?? []).map((s) => s.trim()).filter((s) => s.length > 0);

  const recruiter = await prisma.recruiterProfile.findUnique({ where: { userId: req.user!.id } });
  if (!recruiter) {
    return res.status(403).json({
      error: "Complete your recruiter profile and get verified before posting jobs.",
      code: "RECRUITER_PROFILE_REQUIRED",
    });
  }
  if (recruiter.verificationStatus !== "verified") {
    return res.status(403).json({
      error:
        recruiter.verificationStatus === "rejected"
          ? "Your recruiter account was not approved. Please submit updated documents or contact support."
          : "Your recruiter account is under review. You can post jobs once an admin has verified your profile.",
      code: "RECRUITER_NOT_VERIFIED",
      verificationStatus: recruiter.verificationStatus,
    });
  }

  if (normalizedStatus === "published") {
    const pe = publishedJobFieldErrors({
      description: parsed.data.description,
      location: parsed.data.location ?? null,
      requiredSkills: requiredSkillList,
      experienceRequired: parsed.data.experienceRequired ?? null,
      jobType: parsed.data.jobType ?? null,
    });
    if (pe) {
      const firstMsg = Object.values(pe)[0] || "Invalid job for publishing.";
      return res.status(400).json({ error: firstMsg, fieldErrors: pe });
    }
    const usage = await ensureRecruiterUsageRow(recruiter.id);
    const tier = normalizeSubscriptionTier(usage);
    const publishedCount = await prisma.job.count({
      where: { postedById: recruiter.id, status: { in: ["published", "active"] } },
    });
    const lim = activePublishedJobLimit(tier);
    if (publishedCount >= lim) {
      return res.status(403).json({
        error: `Your plan allows ${lim === Number.MAX_SAFE_INTEGER ? "unlimited" : lim} active job listing(s). Upgrade to post more.`,
        code: "JOB_LIMIT",
        tier,
      });
    }
  }

  const { requiredSkills: _rs, experienceRequired: _er, minimumCertificationLevel: _min, ...restCreate } = parsed.data;
  const job = await prisma.job.create({
    data: {
      ...restCreate,
      jobTrack: normalizedTrack,
      assignment: parsed.data.assignment ?? null,
      roleCategory: parsed.data.roleCategory ?? null,
      companyContext: parsed.data.companyContext ?? null,
      minimumCertificationLevel: effectiveMinLevel,
      requiredSkills: requiredSkillList.length ? requiredSkillList : undefined,
      experienceRequired: parsed.data.experienceRequired ?? null,
      status: normalizedStatus,
      postedById: recruiter?.id ?? null,
    },
  });
  res.json({ job });
});

jobsRouter.get("/:id/recommendations", requireAuth, async (req: AuthedRequest, res) => {
  if (req.user!.role !== "recruiter" && req.user!.role !== "admin") {
    return res.status(403).json({ error: "Recruiters only" });
  }
  const job = await prisma.job.findUnique({ where: { id: req.params.id } });
  if (!job) return res.status(404).json({ error: "Job not found" });

  if (req.user!.role === "recruiter") {
    const recruiter = await prisma.recruiterProfile.findUnique({
      where: { userId: req.user!.id },
      include: { usage: true },
    });
    if (!recruiter) return res.status(403).json({ error: "Recruiter profile required" });
    if (job.postedById && job.postedById !== recruiter.id) {
      return res.status(403).json({ error: "You can only view recommendations for your own jobs." });
    }
    const usageRow = recruiter.usage ?? (await ensureRecruiterUsageRow(recruiter.id));
    const subscriptionTier = normalizeSubscriptionTier(usageRow);
    const result = await computeJobRecommendations({ jobId: job.id, subscriptionTier });
    if ("error" in result) return res.status(404).json({ error: result.error });
    const pvLimit = profileViewLimit(subscriptionTier);
    return res.json({
      ...result,
      subscriptionTier,
      limits: {
        profileViewsUsed: usageRow.profileViewCountMonth,
        profileViewsMonthly: pvLimit === Number.MAX_SAFE_INTEGER ? null : pvLimit,
      },
    });
  }

  const result = await computeJobRecommendations({ jobId: job.id, subscriptionTier: "growth" });
  if ("error" in result) return res.status(404).json({ error: result.error });
  return res.json(result);
});

jobsRouter.post("/:id/apply", requireAuth, async (req: AuthedRequest, res) => {
  const schema = z.object({
    resumeUrl: z.string().optional(),
    assignmentResponse: z.string().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid payload" });
  const jobId = req.params.id;
  const job = await prisma.job.findUnique({ where: { id: jobId } });
  if (!job) return res.status(404).json({ error: "Job not found" });
  const profile = await prisma.jobSeekerProfile.findUnique({ where: { userId: req.user!.id } });
  if (profile) {
    const jobTrack = job.jobTrack || "tech";
    const userTrack = (profile.roleType as string) === "non_technical" ? "non_technical" : "tech";
    if (jobTrack !== userTrack) {
      return res.status(403).json({ error: "This job does not match your profile. Technical seekers apply to technical jobs; non-technical seekers apply to non-technical jobs." });
    }
  }
  const jobTrack = (job.jobTrack === "non_technical" ? "non_technical" : "tech") as "tech" | "non_technical";
  const certTrack: CertificationTrack = jobTrack === "non_technical" ? "non_technical" : "technical";
  const candidateCertification = await calculateCertificationLevel(req.user!.id);
  const minimumLevel = getEffectiveMinimumCertificationLevel(jobTrack, job.salaryRange);
  if (candidateCertification.level < minimumLevel) {
    const requiredLabel = getCertificationLabel(certTrack, minimumLevel);
    return res.status(403).json({
      error: `This job requires ${requiredLabel}. ${minimumLevelHint(certTrack, minimumLevel)}`,
      minimumCertificationLevel: minimumLevel,
      minimumCertificationLabel: requiredLabel,
      candidateCertificationLevel: candidateCertification.level,
      candidateCertificationLabel: candidateCertification.label,
    });
  }
  if (job.assignment && !parsed.data.assignmentResponse?.trim()) {
    return res.status(400).json({ error: "This job requires an assignment submission. Please complete the assignment and try again." });
  }
  const application = await prisma.jobApplication.create({
    data: {
      jobId,
      jobSeekerId: req.user!.id,
      resumeUrl: parsed.data.resumeUrl ?? null,
      assignmentResponse: parsed.data.assignmentResponse ?? null,
    },
  });
  res.json({ application });
});

jobsRouter.post("/:id/save", requireAuth, async (req: AuthedRequest, res) => {
  const jobId = req.params.id;
  const job = await prisma.job.findUnique({ where: { id: jobId } });
  if (!job) return res.status(404).json({ error: "Job not found" });
  const profile = await prisma.jobSeekerProfile.findUnique({ where: { userId: req.user!.id } });
  if (profile) {
    const jobTrack = job.jobTrack || "tech";
    const userTrack = (profile.roleType as string) === "non_technical" ? "non_technical" : "tech";
    if (jobTrack !== userTrack) {
      return res.status(403).json({ error: "This job does not match your profile. Technical seekers save technical jobs; non-technical seekers save non-technical jobs." });
    }
  }
  const userId = req.user!.id;
  const saved = await prisma.savedJob.upsert({
    where: {
      userId_jobId: { userId, jobId },
    },
    create: { jobId, userId },
    update: { savedAt: new Date() },
  });
  res.json({ saved });
});

jobsRouter.delete("/:id/save", requireAuth, async (req: AuthedRequest, res) => {
  const jobId = req.params.id;
  await prisma.savedJob.deleteMany({ where: { jobId, userId: req.user!.id } });
  res.json({ ok: true });
});

jobsRouter.get("/:id/applications", requireAuth, async (req: AuthedRequest, res) => {
  const applications = await prisma.jobApplication.findMany({
    where: { jobId: req.params.id },
    orderBy: { appliedAt: "desc" },
  });
  res.json({ applications });
});

/** Applicants for a job with full profile data (for recruiters viewing applicants) */
jobsRouter.get("/:id/applicants", requireAuth, async (req: AuthedRequest, res) => {
  const jobId = req.params.id;
  const job = await prisma.job.findUnique({
    where: { id: jobId },
    include: { postedBy: { select: { userId: true } } },
  });
  if (!job) return res.status(404).json({ error: "Job not found" });
  const recruiter = await prisma.recruiterProfile.findUnique({ where: { userId: req.user!.id } });
  if (!recruiter || job.postedById !== recruiter.id) {
    return res.status(403).json({ error: "Not authorized to view applicants for this job" });
  }

  const applications = await prisma.jobApplication.findMany({
    where: { jobId },
    include: {
      jobSeeker: { include: { jobSeekerProfile: true } },
    },
    orderBy: { appliedAt: "desc" },
  });

  const userIds = applications.map((a) => a.jobSeekerId).filter(Boolean);
  const [stages, proctoringEvents, skillVerifications] = await Promise.all([
    prisma.verificationStage.findMany({
      where: { userId: { in: userIds } },
      select: { userId: true, stageName: true, status: true, score: true },
    }),
    prisma.proctoringEvent.findMany({
      where: { userId: { in: userIds } },
      select: { userId: true, riskScore: true },
    }),
    prisma.candidateSkillVerification.findMany({
      where: { userId: { in: userIds } },
      select: { userId: true, skillType: true, status: true, completedAt: true, expiresAt: true },
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
  const skillByUser = new Map<string, { skillType: string; status: string; completedAt: Date | null; expiresAt: Date | null }[]>();
  for (const sv of skillVerifications) {
    if (!skillByUser.has(sv.userId)) skillByUser.set(sv.userId, []);
    const effectiveStatus = sv.expiresAt && new Date() > sv.expiresAt ? "EXPIRED" : sv.status;
    skillByUser.get(sv.userId)!.push({
      skillType: sv.skillType,
      status: effectiveStatus,
      completedAt: sv.completedAt,
      expiresAt: sv.expiresAt,
    });
  }

  const certByUser = new Map<string, Awaited<ReturnType<typeof calculateCertificationLevel>>>();
  await Promise.all(
    userIds.map(async (id) => {
      certByUser.set(id, await calculateCertificationLevel(id));
    })
  );

  const aptitudeStageScore = (uid: string) => {
    const userStages = stageByUser.get(uid) ?? [];
    return userStages.find((s) => s.stageName === "aptitude_test" && s.status === "completed")?.score ?? null;
  };
  const aptitudeScoresBatch = await getAptitudeScoresZeroToHundredBatch(userIds, aptitudeStageScore);

  const applicants = applications
    .filter((a) => a.jobSeeker?.jobSeekerProfile)
    .map((a) => {
      const p = a.jobSeeker!.jobSeekerProfile!;
      const userStages = stageByUser.get(a.jobSeekerId) ?? [];
      const stageScore = (name: string) =>
        userStages.find((s) => s.stageName === name && s.status === "completed")?.score ?? null;
      const cert = certByUser.get(a.jobSeekerId);
      const integrityScore = integrityScoreFromViolationStats(
        maxViolationIdxByUser.get(a.jobSeekerId) ?? 0,
        proctorEventCountByUser.get(a.jobSeekerId) ?? 0,
      );
      const skills = Array.isArray(p.skills) ? p.skills : p.skills ? [String(p.skills)] : [];

      const aptitude = aptitudeScoresBatch.get(a.jobSeekerId) ?? stageScore("aptitude_test");
      const dsa = stageScore("dsa_round");
      const ai = stageScore("expert_interview");
      const humanExpert = stageScore("human_expert_interview");
      const assign = stageScore("non_tech_assignment");
      const hiringReadiness = Math.round(
        ((aptitude ?? 0) + (dsa ?? 0) + (ai ?? assign ?? 0) + integrityScore) / 4
      );
      const userSkills = skillByUser.get(a.jobSeekerId) ?? [];
      const skillFreshness = {
        aptitude: userSkills.find((s) => s.skillType === "APTITUDE"),
        live_coding: userSkills.find((s) => s.skillType === "LIVE_CODING"),
        interview: userSkills.find((s) => s.skillType === "INTERVIEW"),
      };
      const toFreshness = (s: typeof userSkills[0] | undefined) => {
        if (!s) return null;
        if (s.status === "EXPIRED") return { status: "EXPIRED" as const, last_verified: null };
        const completed = s.completedAt;
        if (!completed) return { status: s.status, last_verified: null };
        const daysAgo = Math.floor((Date.now() - completed.getTime()) / (1000 * 60 * 60 * 24));
        return { status: s.status, last_verified_days_ago: daysAgo };
      };

      return {
        application_id: a.id,
        recruiter_next_interview_mode: a.recruiterNextInterviewMode ?? null,
        recruiter_interview_path_set_at: a.recruiterInterviewPathSetAt?.toISOString?.() ?? null,
        status: a.status,
        applied_at: a.appliedAt?.toISOString?.() ?? null,
        resume_url: a.resumeUrl ?? p.resumeUrl,
        id: p.id,
        user_id: p.userId,
        full_name: p.fullName,
        current_role: p.currentRole,
        experience_years: p.experienceYears,
        verification_status: p.verificationStatus,
        skills,
        target_job_title: p.targetJobTitle,
        about: p.about,
        phone: p.phone,
        location: p.location,
        college: p.college,
        graduation_year: p.graduationYear,
        certification_level: cert?.level ?? 0,
        certification_label: cert?.label ?? "Level 0",
        certificationLevel: cert?.certificationLevel ?? null,
        certificationLabelShort: cert?.certificationLabel ?? null,
        aptitude_score: aptitude,
        dsa_score: dsa,
        ai_interview_score: ai,
        human_expert_interview_score: humanExpert,
        assignment_score: assign,
        integrity_score: integrityScore,
        skill_freshness: {
          aptitude: toFreshness(skillFreshness.aptitude),
          live_coding: toFreshness(skillFreshness.live_coding),
          interview: toFreshness(skillFreshness.interview),
        },
        notice_period: p.noticePeriod,
        current_salary: p.currentSalary,
        expected_salary: p.expectedSalary,
        hiring_readiness: hiringReadiness,
      };
    });

  res.json({ job: { id: job.id, title: job.title, company: job.company }, applicants });
});

jobsRouter.post("/:id/status", requireAuth, async (req: AuthedRequest, res) => {
  const schema = z.object({ status: z.string().min(1) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid payload" });
  const normalizedStatus = normalizeJobStatus(parsed.data.status);
  const jobId = req.params.id;
  const existing = await prisma.job.findUnique({ where: { id: jobId } });
  if (!existing) return res.status(404).json({ error: "Job not found" });

  if (req.user!.role === "recruiter") {
    const recruiter = await prisma.recruiterProfile.findUnique({ where: { userId: req.user!.id } });
    if (!recruiter || existing.postedById !== recruiter.id) {
      return res.status(403).json({ error: "Not authorized to update this job" });
    }
    const prevStatus = normalizeJobStatus(existing.status);
    if (normalizedStatus === "published") {
      const skillList = Array.isArray(existing.requiredSkills)
        ? (existing.requiredSkills as unknown[]).map((s) => String(s).trim()).filter((s) => s.length > 0)
        : [];
      const pe = publishedJobFieldErrors({
        description: existing.description ?? "",
        location: existing.location,
        requiredSkills: skillList,
        experienceRequired: existing.experienceRequired,
        jobType: existing.jobType ?? null,
      });
      if (pe) {
        return res.status(400).json({ error: Object.values(pe)[0], fieldErrors: pe });
      }
      if (prevStatus !== "published") {
        const usage = await ensureRecruiterUsageRow(recruiter.id);
        const tier = normalizeSubscriptionTier(usage);
        const publishedCount = await prisma.job.count({
          where: { postedById: recruiter.id, status: { in: ["published", "active"] } },
        });
        const lim = activePublishedJobLimit(tier);
        if (publishedCount >= lim) {
          return res.status(403).json({
            error: `Your plan allows ${lim === Number.MAX_SAFE_INTEGER ? "unlimited" : lim} active job listing(s). Upgrade to post more.`,
            code: "JOB_LIMIT",
            tier,
          });
        }
      }
    }
  } else if (req.user!.role !== "admin") {
    return res.status(403).json({ error: "Not authorized" });
  }

  const job = await prisma.job.update({
    where: { id: jobId },
    data: { status: normalizedStatus } as any,
  });
  res.json({ job });
});

jobsRouter.patch("/:id", requireAuth, async (req: AuthedRequest, res) => {
  const schema = z.object({
    title: z.string().min(1).optional(),
    company: z.string().min(1).optional(),
    description: z.string().min(1).optional(),
    location: z.string().nullish().optional(),
    salaryRange: z.string().nullish().optional(),
    jobType: z.string().nullish().optional(),
    jobTrack: z.enum(["tech", "non_technical"]).optional(),
    assignment: z.string().nullish().optional(),
    roleCategory: z.string().nullish().optional(),
    companyContext: z.string().nullish().optional(),
    status: z.enum(["draft", "published", "active", "closed"]).optional(),
    minimumCertificationLevel: z.number().int().min(1).max(3).optional(),
    requiredSkills: z.array(z.string()).max(10).optional(),
    experienceRequired: z.enum(["fresher", "mid", "senior"]).optional(),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid payload" });

  const recruiter = await prisma.recruiterProfile.findUnique({ where: { userId: req.user!.id } });
  if (!recruiter) {
    return res.status(403).json({
      error: "Complete your recruiter profile and get verified before posting jobs.",
      code: "RECRUITER_PROFILE_REQUIRED",
    });
  }
  if (recruiter.verificationStatus !== "verified") {
    return res.status(403).json({
      error:
        recruiter.verificationStatus === "rejected"
          ? "Your recruiter account was not approved. Please submit updated documents or contact support."
          : "Your recruiter account is under review. You can post jobs once an admin has verified your profile.",
      code: "RECRUITER_NOT_VERIFIED",
      verificationStatus: recruiter.verificationStatus,
    });
  }

  const jobId = req.params.id;
  const job = await prisma.job.findUnique({ where: { id: jobId } });
  if (!job) return res.status(404).json({ error: "Job not found" });
  if (job.postedById !== recruiter.id) return res.status(403).json({ error: "Not authorized to edit this job" });

  const nextJobTrack = (parsed.data.jobTrack ?? job.jobTrack ?? "tech") as "tech" | "non_technical";
  const nextSalaryRange = (parsed.data.salaryRange ?? job.salaryRange ?? null) as string | null;
  const salaryGate = getEffectiveMinimumCertificationLevel(nextJobTrack, nextSalaryRange);
  const requestedMin = parsed.data.minimumCertificationLevel ?? job.minimumCertificationLevel ?? 1;
  const effectiveMinLevel = Math.max(requestedMin, salaryGate);

  const nextDescription = parsed.data.description ?? job.description ?? "";
  const nextLocation = parsed.data.location !== undefined ? parsed.data.location : job.location;
  let nextSkillList: string[];
  if (parsed.data.requiredSkills !== undefined) {
    nextSkillList = parsed.data.requiredSkills.map((s) => s.trim()).filter((s) => s.length > 0);
  } else if (Array.isArray(job.requiredSkills)) {
    nextSkillList = (job.requiredSkills as unknown[]).map((s) => String(s).trim()).filter((s) => s.length > 0);
  } else {
    nextSkillList = [];
  }
  const nextExperienceRequired =
    parsed.data.experienceRequired !== undefined ? parsed.data.experienceRequired : job.experienceRequired;
  const nextJobType = parsed.data.jobType !== undefined ? parsed.data.jobType : job.jobType;

  const prevStatus = normalizeJobStatus(job.status);
  const nextStatus =
    parsed.data.status !== undefined ? normalizeJobStatus(parsed.data.status) : prevStatus;

  if (nextStatus === "published") {
    const pe = publishedJobFieldErrors({
      description: nextDescription,
      location: nextLocation,
      requiredSkills: nextSkillList,
      experienceRequired: nextExperienceRequired,
      jobType: nextJobType ?? null,
    });
    if (pe) {
      const firstMsg = Object.values(pe)[0] || "Invalid job for publishing.";
      return res.status(400).json({ error: firstMsg, fieldErrors: pe });
    }
    if (prevStatus !== "published") {
      const usage = await ensureRecruiterUsageRow(recruiter.id);
      const tier = normalizeSubscriptionTier(usage);
      const publishedCount = await prisma.job.count({
        where: { postedById: recruiter.id, status: { in: ["published", "active"] } },
      });
      const lim = activePublishedJobLimit(tier);
      if (publishedCount >= lim) {
        return res.status(403).json({
          error: `Your plan allows ${lim === Number.MAX_SAFE_INTEGER ? "unlimited" : lim} active job listing(s). Upgrade to post more.`,
          code: "JOB_LIMIT",
          tier,
        });
      }
    }
  }

  const data: Record<string, unknown> = {};

  if (parsed.data.title !== undefined) data.title = parsed.data.title;
  if (parsed.data.company !== undefined) data.company = parsed.data.company;
  if (parsed.data.description !== undefined) data.description = parsed.data.description;
  if (parsed.data.location !== undefined) data.location = parsed.data.location;
  if (parsed.data.salaryRange !== undefined) data.salaryRange = parsed.data.salaryRange;
  if (parsed.data.jobType !== undefined) data.jobType = parsed.data.jobType;
  if (parsed.data.jobTrack !== undefined) data.jobTrack = nextJobTrack;
  if (parsed.data.assignment !== undefined) data.assignment = parsed.data.assignment;
  if (parsed.data.roleCategory !== undefined) data.roleCategory = parsed.data.roleCategory;
  if (parsed.data.companyContext !== undefined) data.companyContext = parsed.data.companyContext;
  if (parsed.data.requiredSkills !== undefined) {
    data.requiredSkills = nextSkillList.length ? nextSkillList : null;
  }
  if (parsed.data.experienceRequired !== undefined) {
    data.experienceRequired = parsed.data.experienceRequired;
  }

  data.minimumCertificationLevel = effectiveMinLevel;
  if (parsed.data.status !== undefined) data.status = nextStatus;

  const updated = await prisma.job.update({
    where: { id: jobId },
    data: data as any,
  });

  res.json({ job: updated });
});

jobsRouter.delete("/:id", requireAuth, async (req: AuthedRequest, res) => {
  await prisma.job.delete({ where: { id: req.params.id } });
  res.json({ ok: true });
});

jobsRouter.get("/me/applications", requireAuth, async (req: AuthedRequest, res) => {
  const profile = await prisma.jobSeekerProfile.findUnique({ where: { userId: req.user!.id } });
  const isNonTech = (profile?.roleType as string) === "non_technical";
  const applications = await prisma.jobApplication.findMany({
    where: {
      jobSeekerId: req.user!.id,
      job: isNonTech
        ? { jobTrack: "non_technical" }
        : { OR: [{ jobTrack: "tech" }, { jobTrack: null }] },
    },
    include: { job: true },
    orderBy: { appliedAt: "desc" },
  });
  res.json({ applications });
});

jobsRouter.get("/me/saved", requireAuth, async (req: AuthedRequest, res) => {
  const profile = await prisma.jobSeekerProfile.findUnique({ where: { userId: req.user!.id } });
  const isNonTech = (profile?.roleType as string) === "non_technical";
  const saved = await prisma.savedJob.findMany({
    where: {
      userId: req.user!.id,
      job: isNonTech
        ? { jobTrack: "non_technical" }
        : { OR: [{ jobTrack: "tech" }, { jobTrack: null }] },
    },
    include: { job: true },
    orderBy: { savedAt: "desc" },
  });
  res.json({ saved });
});

jobsRouter.get("/recruiter", requireAuth, async (req: AuthedRequest, res) => {
  const recruiter = await prisma.recruiterProfile.findUnique({ where: { userId: req.user!.id } });
  if (!recruiter) return res.json({ jobs: [] });
  const jobs = await prisma.job.findMany({ where: { postedById: recruiter.id }, orderBy: { createdAt: "desc" } });
  res.json({
    jobs: jobs.map((j) => ({
      ...j,
      status: normalizeJobStatus(j.status),
    })),
  });
});

jobsRouter.get("/recruiter/applications", requireAuth, async (req: AuthedRequest, res) => {
  const recruiter = await prisma.recruiterProfile.findUnique({ where: { userId: req.user!.id } });
  if (!recruiter) return res.json({ applications: [] });
  const jobs = await prisma.job.findMany({
    where: { postedById: recruiter.id },
    select: { id: true },
  });
  const jobIds = jobs.map((j) => j.id);
  const applications = await prisma.jobApplication.findMany({
    where: { jobId: { in: jobIds } },
    include: { job: true },
    orderBy: { appliedAt: "desc" },
  });
  res.json({ applications });
});

/** After AI Expert Interview: employer chooses next round (PRD — not platform-default). */
jobsRouter.patch("/recruiter/applications/:applicationId/next-interview", requireAuth, async (req: AuthedRequest, res) => {
  if (req.user!.role !== "recruiter") {
    return res.status(403).json({ error: "Recruiter access required" });
  }
  const { setRecruiterInterviewPathForApplication } = await import("../services/recruiterInterviewPath.service.js");
  const result = await setRecruiterInterviewPathForApplication({
    applicationId: req.params.applicationId,
    recruiterUserId: req.user!.id,
    body: req.body,
  });
  if (!result.ok) return res.status(result.status).json({ error: result.error });
  res.json({ ok: true });
});

/** Hiring funnel metrics — paid recruiters only (see RecruiterUsage.planType). */
jobsRouter.get("/recruiter/analytics/summary", requireAuth, async (req: AuthedRequest, res) => {
  if (req.user!.role !== "recruiter") {
    return res.status(403).json({ error: "Recruiter access required" });
  }
  const recruiter = await prisma.recruiterProfile.findUnique({
    where: { userId: req.user!.id },
    include: { usage: true },
  });
  if (!recruiter) {
    return res.status(403).json({ error: "Recruiter profile required" });
  }
  const usageRow = recruiter.usage ?? (await ensureRecruiterUsageRow(recruiter.id));
  const subTier = normalizeSubscriptionTier(usageRow);
  if (subTier !== "growth") {
    return res.status(403).json({
      error: "Analytics is available on the Growth recruiter plan.",
      code: "RECRUITER_PLAN_ANALYTICS",
      subscriptionTier: subTier,
    });
  }

  const jobs = await prisma.job.findMany({
    where: { postedById: recruiter.id },
    select: { id: true, title: true, status: true, createdAt: true },
  });
  const jobIds = jobs.map((j) => j.id);
  const applications =
    jobIds.length === 0
      ? []
      : await prisma.jobApplication.findMany({
          where: { jobId: { in: jobIds } },
          select: { id: true, status: true, appliedAt: true, jobId: true },
        });

  const applicationsByStatus: Record<string, number> = {};
  for (const a of applications) {
    applicationsByStatus[a.status] = (applicationsByStatus[a.status] ?? 0) + 1;
  }

  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400_000);
  const applicationsLast30Days = applications.filter((a) => a.appliedAt >= thirtyDaysAgo).length;

  res.json({
    job_count: jobs.length,
    published_job_count: jobs.filter((j) => normalizeJobStatus(j.status) === "published").length,
    application_count: applications.length,
    applications_last_30_days: applicationsLast30Days,
    applications_by_status: applicationsByStatus,
  });
});

jobsRouter.post("/recruiter/upgrade-request", requireAuth, async (req: AuthedRequest, res) => {
  if (req.user!.role !== "recruiter") {
    return res.status(403).json({ error: "Recruiter access required" });
  }
  const recruiter = await prisma.recruiterProfile.findUnique({
    where: { userId: req.user!.id },
    include: { user: { select: { name: true, email: true } } },
  });
  if (!recruiter) {
    return res.status(403).json({ error: "Recruiter profile required" });
  }

  const schema = z.object({ message: z.string().max(2000).optional() });
  const parsed = schema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: "Invalid payload" });

  const admins = await prisma.user.findMany({
    where: { role: "admin" },
    select: { id: true },
  });

  const who = recruiter.user?.email ?? recruiter.user?.name ?? "recruiter";
  const note = parsed.data.message?.trim();
  const detail = note ? `Message: ${note}` : "No message provided.";

  if (admins.length) {
    await prisma.notification.createMany({
      data: admins.map((a) => ({
        userId: a.id,
        title: "Recruiter upgrade request",
        message: `${who} requested a paid plan / analytics upgrade. ${detail}`,
        targetRole: "admin",
      })),
    });
  }

  res.json({ ok: true, notified_admin_count: admins.length });
});

jobsRouter.post("/applications/:id/status", requireAuth, async (req: AuthedRequest, res) => {
  const schema = z.object({ status: z.string().min(1) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid payload" });
  const application = await prisma.jobApplication.update({
    where: { id: req.params.id },
    data: { status: parsed.data.status },
  });
  res.json({ application });
});
