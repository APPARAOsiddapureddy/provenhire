import { prisma } from "../config/prisma.js";
import { calculateCertificationLevel } from "./verificationLevel.service.js";
import type { ResumeVerifiedSkill } from "./provenhireResume.service.js";
import { experienceTierFromYears } from "../utils/experienceTier.js";
import { discoveryGridFullyUnlocked, type SubscriptionTier } from "../utils/recruiterSubscription.js";

const TECH_KEYWORDS = [
  "react",
  "node",
  "nodejs",
  "typescript",
  "javascript",
  "python",
  "java",
  "go",
  "rust",
  "aws",
  "gcp",
  "azure",
  "docker",
  "kubernetes",
  "postgres",
  "postgresql",
  "mysql",
  "mongodb",
  "redis",
  "kafka",
  "system design",
  "dsa",
];

function keywordsInText(text: string): Set<string> {
  const t = text.toLowerCase();
  const found = new Set<string>();
  for (const k of TECH_KEYWORDS) {
    if (t.includes(k)) found.add(k);
  }
  return found;
}

/** JD required skills (tags) plus light keyword harvest from title/description. */
function jobSkillKeywords(job: {
  requiredSkills: unknown;
  description: string | null;
  title: string;
}): Set<string> {
  const keys = new Set<string>();
  if (Array.isArray(job.requiredSkills)) {
    for (const s of job.requiredSkills) {
      const t = String(s).trim().toLowerCase();
      if (t) keys.add(t);
    }
  }
  for (const k of keywordsInText(`${job.title}\n${job.description ?? ""}`)) {
    keys.add(k);
  }
  return keys;
}

function verifiedSkillMatchScore(jobKeys: Set<string>, verified: ResumeVerifiedSkill[]): number {
  if (jobKeys.size === 0) return 72;
  let matchedWeight = 0;
  for (const k of jobKeys) {
    let best = 0;
    for (const v of verified) {
      const s = v.skill.toLowerCase();
      if (s === k || s.includes(k) || k.includes(s)) {
        best = Math.max(best, v.confidence / 100);
      }
    }
    matchedWeight += best;
  }
  return Math.min(100, (matchedWeight / jobKeys.size) * 100);
}

function certificationScore(candidateLevel: number, minRequired: number): number {
  if (candidateLevel < minRequired) return 0;
  return Math.min(100, 60 + (candidateLevel - minRequired) * 20);
}

/** Legacy fallback when job has no experience band. */
function experienceScore(candidateYears: number | null | undefined): number {
  const y = candidateYears ?? 0;
  if (y < 1) return 55;
  if (y < 3) return 75;
  return 90;
}

function jobBandExperienceScore(
  candidateYears: number | null | undefined,
  jobBand: string | null | undefined,
): number {
  if (!jobBand) return 70;
  const y = candidateYears ?? 0;
  const b = jobBand.toLowerCase();
  if (b === "fresher") {
    if (y < 1) return 95;
    if (y < 3) return 72;
    return 55;
  }
  if (b === "mid") {
    if (y >= 1 && y < 5) return 92;
    if (y < 1) return 48;
    return 78;
  }
  if (b === "senior") {
    if (y >= 3) return 92;
    if (y >= 1) return 62;
    return 42;
  }
  return 70;
}

function assessmentMatch(overall: number | null | undefined): number {
  if (overall == null || Number.isNaN(overall)) return 55;
  return Math.max(0, Math.min(100, overall));
}

function candidateExperienceLabel(years: number | null): string {
  const t = experienceTierFromYears(years);
  if (t === "fresher") return "Early Career";
  if (t === "mid") return "Mid Level";
  return "Senior";
}

export type JobRecommendationRow = {
  profileId: string;
  userId: string;
  matchScore: number;
  certificationLevel: number;
  certificationLevelCode: string | null;
  locked: boolean;
  experienceLevelLabel: string;
  summary: {
    currentRole: string | null;
    experienceYears: number | null;
    topSkills: string[];
    topVerifiedSkills: { skill: string; confidence: number }[];
    overallScore: number | null;
  };
};

export async function computeJobRecommendations(params: {
  jobId: string;
  subscriptionTier: SubscriptionTier;
}): Promise<
  | {
      jobTitle: string;
      matchCount: number;
      candidates: JobRecommendationRow[];
    }
  | { error: string }
> {
  const job = await prisma.job.findUnique({ where: { id: params.jobId } });
  if (!job) return { error: "Job not found" };

  const jobKeys = jobSkillKeywords({
    requiredSkills: job.requiredSkills,
    description: job.description,
    title: job.title,
  });
  const minCert = job.minimumCertificationLevel ?? 0;
  const trackTech = (job.jobTrack ?? "tech") !== "non_technical";

  const profiles = await prisma.jobSeekerProfile.findMany({
    where: trackTech ? { NOT: { roleType: "non_technical" } } : { roleType: "non_technical" },
    take: 200,
    orderBy: { updatedAt: "desc" },
  });

  const out: JobRecommendationRow[] = [];

  for (const p of profiles) {
    const cert = await calculateCertificationLevel(p.userId);
    if (cert.level < minCert) continue;

    const resume = await prisma.provenHireResume.findUnique({ where: { userId: p.userId } });
    const verified = Array.isArray(resume?.verifiedSkills)
      ? (resume!.verifiedSkills as ResumeVerifiedSkill[])
      : [];
    const overall =
      resume?.assessmentScores &&
      typeof resume.assessmentScores === "object" &&
      resume.assessmentScores !== null &&
      "overall" in resume.assessmentScores
        ? Number((resume.assessmentScores as { overall?: unknown }).overall)
        : null;

    const overallNum = Number.isFinite(overall) ? (overall as number) : null;

    const sSkill = verifiedSkillMatchScore(jobKeys, verified);
    const sCert = certificationScore(cert.level, minCert);
    const sExp = job.experienceRequired
      ? jobBandExperienceScore(p.experienceYears, job.experienceRequired)
      : experienceScore(p.experienceYears);
    const sAssess = assessmentMatch(overallNum);

    const matchScore = Math.round(sSkill * 0.4 + sCert * 0.25 + sExp * 0.2 + sAssess * 0.15);

    const topVerified = verified
      .slice()
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, 3)
      .map((x) => ({ skill: x.skill, confidence: Math.round(x.confidence) }));

    const topSkills = topVerified.map((x) => x.skill);

    out.push({
      profileId: p.id,
      userId: p.userId,
      matchScore,
      certificationLevel: cert.level,
      certificationLevelCode: cert.certificationLevel ?? null,
      locked: false,
      experienceLevelLabel: candidateExperienceLabel(p.experienceYears),
      summary: {
        currentRole: p.currentRole,
        experienceYears: p.experienceYears,
        topSkills,
        topVerifiedSkills: topVerified,
        overallScore: overallNum != null ? Math.round(overallNum) : null,
      },
    });
  }

  out.sort((a, b) => b.matchScore - a.matchScore);
  const top = out.slice(0, 9);
  const gridOpen = discoveryGridFullyUnlocked(params.subscriptionTier);
  top.forEach((r, i) => {
    r.locked = !gridOpen && i >= 2;
  });

  return { jobTitle: job.title, matchCount: out.length, candidates: top };
}
