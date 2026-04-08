import { Router } from "express";
import { prisma } from "../config/prisma.js";
import { experienceTierFromYears } from "../utils/experienceTier.js";
import { syncProvenhireResumeFromSources } from "../services/provenhireResume.service.js";

export const publicApiRouter = Router();

/** Public verified profile — PRD §6 (no auth). */
publicApiRouter.get("/verified/:handle", async (req, res) => {
  const handle = String(req.params.handle ?? "")
    .trim()
    .toLowerCase();
  if (!handle) return res.status(400).json({ error: "Invalid handle" });

  const resume = await prisma.provenHireResume.findUnique({
    where: { shareableHandle: handle },
    select: { userId: true },
  });
  if (!resume) return res.status(404).json({ error: "Profile not found" });

  try {
    await syncProvenhireResumeFromSources(resume.userId);
  } catch {
    /* ignore */
  }

  const [fresh, profile] = await Promise.all([
    prisma.provenHireResume.findUnique({ where: { userId: resume.userId } }),
    prisma.jobSeekerProfile.findUnique({ where: { userId: resume.userId } }),
  ]);

  if (!fresh || !profile) return res.status(404).json({ error: "Profile not found" });

  const verifiedRaw = Array.isArray(fresh.verifiedSkills) ? fresh.verifiedSkills : [];
  const top5 = verifiedRaw.slice(0, 5);

  const tier = experienceTierFromYears(profile.experienceYears);
  const experienceLevel =
    (profile.experienceLevel && profile.experienceLevel.trim()) ||
    (tier === "fresher" ? "Early Career" : tier === "mid" ? "Mid Level" : "Senior");

  const site = (process.env.PUBLIC_SITE_URL ?? "https://provenhire.in").replace(/\/$/, "");

  res.json({
    handle: fresh.shareableHandle,
    name: profile.fullName,
    certificationLevel: fresh.certificationLevel,
    certificationDate: fresh.certificationDate?.toISOString() ?? null,
    targetRole: profile.targetJobTitle ?? profile.currentRole,
    experienceLevel,
    verificationDate: fresh.certificationDate?.toISOString() ?? null,
    verifiedSkills: top5,
    ctaUrl: `${site}/`,
    message: "View full verified profile on ProvenHire",
  });
});
