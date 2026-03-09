import { Router } from "express";
import { z } from "zod";
import { requireAuth, AuthedRequest } from "../middleware/auth.js";
import { prisma } from "../config/prisma.js";
import { calculateCertificationLevel } from "../services/verificationLevel.service.js";

export const usersRouter = Router();

usersRouter.get("/me", requireAuth, async (req: AuthedRequest, res) => {
  const [user, certification] = await Promise.all([
    prisma.user.findUnique({ where: { id: req.user!.id } }),
    calculateCertificationLevel(req.user!.id),
  ]);
  res.json({
    user,
    certification_level: certification.level,
    certification_label: certification.label,
    role_type: certification.roleType,
  });
});

usersRouter.get("/job-seeker-profile", requireAuth, async (req: AuthedRequest, res) => {
  const profile = await prisma.jobSeekerProfile.findUnique({ where: { userId: req.user!.id } });
  res.json({ profile });
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
    verificationStatus: z.string().optional(),
    skills: z.any().optional(),
    education: z.any().optional(),
    workExperience: z.any().optional(),
    roleType: z.enum(["technical", "non_technical"]).optional(),
    targetJobTitle: z.string().optional(),
    noticePeriod: z.string().optional(),
    currentSalary: z.string().optional(),
    expectedSalary: z.string().optional(),
    enforceRequiredFields: z.boolean().optional(),
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
    const { bio, enforceRequiredFields, ...rest } = parsed.data;
    const raw = { ...rest, ...(bio !== undefined ? { about: bio } : {}) };
    const data = Object.fromEntries(
      Object.entries(raw).filter(([, v]) => v !== undefined && v !== null)
    ) as Record<string, unknown>;
    if (enforceRequiredFields) {
      const issues: Array<{ field: string; message: string }> = [];
      const stringField = (key: string) => String(data[key] ?? "").trim();
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
      if (!currentRole) issues.push({ field: "currentRole", message: "Current role is required." });
      if (typeof experienceYears !== "number" || Number.isNaN(experienceYears) || experienceYears < 0) {
        issues.push({ field: "experienceYears", message: "Valid experience in years is required." });
      }
      const hasSkills = Array.isArray(skills)
        ? skills.filter((s) => String(s).trim().length > 0).length > 0
        : typeof skills === "string"
          ? skills.trim().length > 0
          : false;
      if (!hasSkills) issues.push({ field: "skills", message: "At least one skill is required." });
      if (!noticePeriod) issues.push({ field: "noticePeriod", message: "Notice period is required." });
      if (!currentSalary) issues.push({ field: "currentSalary", message: "Current salary is required." });
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
    const user = await prisma.user.findUnique({ where: { id: req.user!.id }, select: { email: true } });
    const profile = await prisma.jobSeekerProfile.upsert({
      where: { userId: req.user!.id },
      create: { userId: req.user!.id, email: user?.email ?? null, ...data },
      update: data,
    });
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

usersRouter.post("/recruiter-profile", requireAuth, async (req: AuthedRequest, res) => {
  const schema = z.object({
    companyName: z.string().optional(),
    companySize: z.string().optional(),
    designation: z.string().optional(),
    phone: z.string().optional(),
    companyWebsite: z.string().optional(),
    industry: z.string().optional(),
    hiringFor: z.string().optional(),
    onboardingCompleted: z.boolean().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid payload" });
  const profile = await prisma.recruiterProfile.upsert({
    where: { userId: req.user!.id },
    create: { userId: req.user!.id, ...parsed.data },
    update: parsed.data,
  });
  res.json({ profile });
});

usersRouter.get("/candidates", requireAuth, async (req: AuthedRequest, res) => {
  const rows = await prisma.jobSeekerProfile.findMany({ take: 50, orderBy: { createdAt: "desc" } });
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

  const maxRiskByUser = new Map<string, number>();
  for (const ev of proctoringEvents) {
    if (!ev.userId) continue;
    const prev = maxRiskByUser.get(ev.userId) ?? 0;
    maxRiskByUser.set(ev.userId, Math.max(prev, ev.riskScore ?? 0));
  }

  const certByUser = new Map<string, Awaited<ReturnType<typeof calculateCertificationLevel>>>();
  await Promise.all(
    userIds.map(async (id) => {
      certByUser.set(id, await calculateCertificationLevel(id));
    })
  );

  const profiles = rows.map((p) => {
    const skills = Array.isArray(p.skills) ? p.skills : p.skills ? [String(p.skills)] : [];
    const activelyLookingRoles = p.targetJobTitle ? [p.targetJobTitle] : [];
    const userStages = stageByUser.get(p.userId) ?? [];
    const stageScore = (stageName: string) =>
      userStages.find((s) => s.stageName === stageName && s.status === "completed")?.score ?? null;
    const cert = certByUser.get(p.userId);
    const integrityScore = Math.max(0, 100 - (maxRiskByUser.get(p.userId) ?? 0));

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
      aptitude_score: stageScore("aptitude_test"),
      dsa_score: stageScore("dsa_round"),
      ai_interview_score: stageScore("expert_interview"),
      assignment_score: stageScore("non_tech_assignment"),
      integrity_score: integrityScore,
      notice_period: p.noticePeriod,
      current_salary: p.currentSalary,
      expected_salary: p.expectedSalary,
    };
  });
  res.json({ profiles });
});
