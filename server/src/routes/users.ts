import { Router } from "express";
import { z } from "zod";
import { requireAuth, AuthedRequest } from "../middleware/auth.js";
import { prisma } from "../config/prisma.js";

export const usersRouter = Router();

usersRouter.get("/me", requireAuth, async (req: AuthedRequest, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
  res.json({ user });
});

usersRouter.get("/job-seeker-profile", requireAuth, async (req: AuthedRequest, res) => {
  const profile = await prisma.jobSeekerProfile.findUnique({ where: { userId: req.user!.id } });
  res.json({ profile });
});

usersRouter.post("/job-seeker-profile", requireAuth, async (req: AuthedRequest, res) => {
  try {
  const schema = z.object({
    fullName: z.string().optional(),
    email: z.union([z.string().email(), z.literal("")]).optional(),
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
    const { bio, ...rest } = parsed.data;
    const raw = { ...rest, ...(bio !== undefined ? { about: bio } : {}) };
    const data = Object.fromEntries(
      Object.entries(raw).filter(([, v]) => v !== undefined && v !== null)
    ) as Record<string, unknown>;
    const profile = await prisma.jobSeekerProfile.upsert({
      where: { userId: req.user!.id },
      create: { userId: req.user!.id, ...data },
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

usersRouter.get("/candidates", requireAuth, async (_req, res) => {
  const profiles = await prisma.jobSeekerProfile.findMany({ take: 50, orderBy: { createdAt: "desc" } });
  res.json({ profiles });
});
