import { Router } from "express";
import { z } from "zod";
import { requireAuth, AuthedRequest } from "../middleware/auth.js";
import { prisma } from "../config/prisma.js";
import {
  calculateCertificationLevel,
  getCertificationLabel,
  minimumLevelHint,
  type CertificationTrack,
} from "../services/verificationLevel.service.js";

export const jobsRouter = Router();

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

jobsRouter.get("/", async (req, res) => {
  const track = req.query.track as string | undefined;
  const where: { jobTrack?: string } = {};
  if (track === "tech" || track === "technical") {
    where.jobTrack = "tech";
  } else if (track === "non_technical") {
    where.jobTrack = "non_technical";
  }
  const jobs = await prisma.job.findMany({
    where: Object.keys(where).length ? where : undefined,
    orderBy: { createdAt: "desc" },
  });
  res.json({ jobs });
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
    minimumCertificationLevel: z.number().int().min(1).max(3).optional(),
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
  const effectiveMinLevel = getEffectiveMinimumCertificationLevel(normalizedTrack, parsed.data.salaryRange ?? null);

  const recruiter = await prisma.recruiterProfile.findUnique({ where: { userId: req.user!.id } });
  const job = await prisma.job.create({
    data: {
      ...parsed.data,
      jobTrack: normalizedTrack,
      assignment: parsed.data.assignment ?? null,
      roleCategory: parsed.data.roleCategory ?? null,
      companyContext: parsed.data.companyContext ?? null,
      minimumCertificationLevel: effectiveMinLevel,
      postedById: recruiter?.id ?? null,
    },
  });
  res.json({ job });
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
  const saved = await prisma.savedJob.create({
    data: { jobId, userId: req.user!.id },
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

jobsRouter.post("/:id/status", requireAuth, async (req: AuthedRequest, res) => {
  const schema = z.object({ status: z.string().min(1) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid payload" });
  const job = await prisma.job.update({
    where: { id: req.params.id },
    data: { status: parsed.data.status } as any,
  });
  res.json({ job });
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
  res.json({ jobs });
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
