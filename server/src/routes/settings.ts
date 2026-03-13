/**
 * Role-based settings API. Each role has GET + PATCH endpoints.
 * Permission: users can only update their own settings (admin may override future).
 */
import { Router } from "express";
import { z } from "zod";
import { requireAuth, AuthedRequest } from "../middleware/auth.js";
import { prisma } from "../config/prisma.js";

export const settingsRouter = Router();

// --- Job Seeker Settings ---

settingsRouter.get("/job-seeker", requireAuth, async (req: AuthedRequest, res) => {
  if (req.user!.role !== "jobseeker" && req.user!.role !== "admin") {
    return res.status(403).json({ error: "Access denied" });
  }
  const [profile, user, preferences] = await Promise.all([
    prisma.jobSeekerProfile.findUnique({ where: { userId: req.user!.id } }),
    prisma.user.findUnique({
      where: { id: req.user!.id },
      select: { email: true, name: true, profileImage: true },
    }),
    prisma.userPreferences.findUnique({ where: { userId: req.user!.id } }),
  ]);
  res.json({
    profile: profile ?? null,
    user: { email: user?.email, name: user?.name, profileImage: user?.profileImage },
    preferences: preferences ?? null,
  });
});

const jobSeekerProfileSchema = z.object({
  fullName: z.string().optional(),
  phone: z.string().optional(),
  location: z.string().optional(),
  resumeUrl: z.string().optional(),
  githubUrl: z.string().optional(),
  linkedInUrl: z.string().optional(),
  portfolioUrl: z.string().optional(),
  targetJobTitle: z.string().optional(),
  preferredTechStack: z.union([z.array(z.string()), z.string().optional()]).optional(),
  experienceLevel: z.enum(["Entry Level", "Mid Level", "Senior Level"]).optional(),
  preferredLocations: z.union([z.array(z.string()), z.string().optional()]).optional(),
  workModePreference: z.enum(["Remote", "Hybrid", "Onsite"]).optional(),
});

const jobSeekerPreferencesSchema = z.object({
  emailNotifications: z.boolean().optional(),
});

settingsRouter.patch("/job-seeker", requireAuth, async (req: AuthedRequest, res) => {
  if (req.user!.role !== "jobseeker" && req.user!.role !== "admin") {
    return res.status(403).json({ error: "Access denied" });
  }
  const body = req.body as Record<string, unknown>;
  const profileData = jobSeekerProfileSchema.safeParse(body);
  const prefsData = jobSeekerPreferencesSchema.safeParse(body);

  const profileUpdates: Record<string, unknown> = {};
  if (profileData.success) {
    Object.assign(profileUpdates, profileData.data);
    if (Array.isArray(profileUpdates.preferredTechStack)) {
      profileUpdates.preferredTechStack = profileUpdates.preferredTechStack;
    }
    if (Array.isArray(profileUpdates.preferredLocations)) {
      profileUpdates.preferredLocations = profileUpdates.preferredLocations;
    }
  }

  const prefsUpdates: Record<string, unknown> = {};
  if (prefsData.success) Object.assign(prefsUpdates, prefsData.data);

  if (Object.keys(profileUpdates).length > 0) {
    await prisma.jobSeekerProfile.upsert({
      where: { userId: req.user!.id },
      create: { userId: req.user!.id, ...profileUpdates },
      update: profileUpdates,
    });
  }
  if (Object.keys(prefsUpdates).length > 0) {
    await prisma.userPreferences.upsert({
      where: { userId: req.user!.id },
      create: { userId: req.user!.id, ...prefsUpdates },
      update: prefsUpdates,
    });
  }

  const [profile, preferences] = await Promise.all([
    prisma.jobSeekerProfile.findUnique({ where: { userId: req.user!.id } }),
    prisma.userPreferences.findUnique({ where: { userId: req.user!.id } }),
  ]);
  res.json({ profile, preferences });
});

// --- Recruiter Settings ---

settingsRouter.get("/recruiter", requireAuth, async (req: AuthedRequest, res) => {
  if (req.user!.role !== "recruiter" && req.user!.role !== "admin") {
    return res.status(403).json({ error: "Access denied" });
  }
  const [profile, preferences] = await Promise.all([
    prisma.recruiterProfile.findUnique({ where: { userId: req.user!.id } }),
    prisma.userPreferences.findUnique({ where: { userId: req.user!.id } }),
  ]);
  res.json({
    profile: profile ?? null,
    preferences: preferences ?? null,
  });
});

const recruiterProfileSchema = z.object({
  companyName: z.string().optional(),
  companyWebsite: z.string().optional(),
  companyLogo: z.string().optional(),
  industry: z.string().optional(),
  companySize: z.string().optional(),
  headquarters: z.string().optional(),
  companyDescription: z.string().optional(),
  preferredRoles: z.union([z.array(z.string()), z.string().optional()]).optional(),
  preferredExperienceMin: z.number().optional(),
  preferredExperienceMax: z.number().optional(),
  preferredSkills: z.union([z.array(z.string()), z.string().optional()]).optional(),
  minimumCertificationLevel: z.number().min(0).max(3).optional(),
});

const recruiterPreferencesSchema = z.object({
  emailNotifications: z.boolean().optional(),
  applicationAlerts: z.boolean().optional(),
  weeklyReports: z.boolean().optional(),
});

settingsRouter.patch("/recruiter", requireAuth, async (req: AuthedRequest, res) => {
  if (req.user!.role !== "recruiter" && req.user!.role !== "admin") {
    return res.status(403).json({ error: "Access denied" });
  }
  const body = req.body as Record<string, unknown>;
  const profileData = recruiterProfileSchema.safeParse(body);
  const prefsData = recruiterPreferencesSchema.safeParse(body);

  const profileUpdates: Record<string, unknown> = {};
  if (profileData.success) Object.assign(profileUpdates, profileData.data);
  const prefsUpdates: Record<string, unknown> = {};
  if (prefsData.success) Object.assign(prefsUpdates, prefsData.data);

  if (Object.keys(profileUpdates).length > 0) {
    await prisma.recruiterProfile.upsert({
      where: { userId: req.user!.id },
      create: { userId: req.user!.id, ...profileUpdates },
      update: profileUpdates,
    });
  }
  if (Object.keys(prefsUpdates).length > 0) {
    await prisma.userPreferences.upsert({
      where: { userId: req.user!.id },
      create: { userId: req.user!.id, ...prefsUpdates },
      update: prefsUpdates,
    });
  }

  const [profile, preferences] = await Promise.all([
    prisma.recruiterProfile.findUnique({ where: { userId: req.user!.id } }),
    prisma.userPreferences.findUnique({ where: { userId: req.user!.id } }),
  ]);
  res.json({ profile, preferences });
});

// --- Interviewer Settings ---

settingsRouter.get("/interviewer", requireAuth, async (req: AuthedRequest, res) => {
  if (req.user!.role !== "expert_interviewer" && req.user!.role !== "admin") {
    return res.status(403).json({ error: "Access denied" });
  }
  const [interviewer, user, preferences] = await Promise.all([
    prisma.interviewer.findUnique({ where: { userId: req.user!.id } }),
    prisma.user.findUnique({
      where: { id: req.user!.id },
      select: { name: true, profileImage: true, email: true },
    }),
    prisma.userPreferences.findUnique({ where: { userId: req.user!.id } }),
  ]);
  res.json({
    profile: interviewer ?? null,
    user: { name: user?.name, profileImage: user?.profileImage, email: user?.email },
    preferences: preferences ?? null,
  });
});

const interviewerProfileSchema = z.object({
  name: z.string().optional(),
  profileImage: z.string().optional(),
  currentCompany: z.string().optional(),
  jobTitle: z.string().optional(),
  experienceYears: z.number().optional(),
  linkedInUrl: z.string().optional(),
  expertiseAreas: z.union([z.array(z.string()), z.string().optional()]).optional(),
  preferredInterviewTopics: z.union([z.array(z.string()), z.string().optional()]).optional(),
  availabilitySchedule: z.record(z.any()).optional(),
});

const interviewerPreferencesSchema = z.object({
  emailNotifications: z.boolean().optional(),
  interviewReminders: z.boolean().optional(),
});

settingsRouter.patch("/interviewer", requireAuth, async (req: AuthedRequest, res) => {
  if (req.user!.role !== "expert_interviewer" && req.user!.role !== "admin") {
    return res.status(403).json({ error: "Access denied" });
  }
  const body = req.body as Record<string, unknown>;
  const profileData = interviewerProfileSchema.safeParse(body);
  const prefsData = interviewerPreferencesSchema.safeParse(body);

  const profileUpdates: Record<string, unknown> = {};
  if (profileData.success) {
    Object.assign(profileUpdates, profileData.data);
    if (profileUpdates.name !== undefined) {
      await prisma.user.update({
        where: { id: req.user!.id },
        data: { name: profileUpdates.name as string },
      });
      delete profileUpdates.name;
    }
    if (profileUpdates.profileImage !== undefined) {
      await prisma.user.update({
        where: { id: req.user!.id },
        data: { profileImage: profileUpdates.profileImage as string },
      });
      delete profileUpdates.profileImage;
    }
  }
  const prefsUpdates: Record<string, unknown> = {};
  if (prefsData.success) Object.assign(prefsUpdates, prefsData.data);

  if (Object.keys(profileUpdates).length > 0) {
    await prisma.interviewer.upsert({
      where: { userId: req.user!.id },
      create: { userId: req.user!.id, ...profileUpdates },
      update: profileUpdates,
    });
  }
  if (Object.keys(prefsUpdates).length > 0) {
    await prisma.userPreferences.upsert({
      where: { userId: req.user!.id },
      create: { userId: req.user!.id, ...prefsUpdates },
      update: prefsUpdates,
    });
  }

  const [profile, preferences] = await Promise.all([
    prisma.interviewer.findUnique({ where: { userId: req.user!.id } }),
    prisma.userPreferences.findUnique({ where: { userId: req.user!.id } }),
  ]);
  res.json({ profile, preferences });
});
