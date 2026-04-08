import type { Prisma } from "@prisma/client";
import { prisma } from "../config/prisma.js";
import { experienceTierFromYears, type ExperienceTier } from "../utils/experienceTier.js";
import { buildTechnicalScorecard, computeProvenhireCertification } from "./verificationScoring.service.js";

export function skillVerifiedThresholdForTier(tier: ExperienceTier): number {
  if (tier === "fresher") return 60;
  if (tier === "mid") return 65;
  return 70;
}

function slugifySegment(s: string): string {
  const t = s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 24);
  return t.length > 0 ? t : "candidate";
}

export async function ensureUniqueShareableHandle(userId: string, fullName: string | null | undefined): Promise<string> {
  const rawFirst = (fullName ?? "").trim().split(/\s+/)[0] ?? "";
  const first = slugifySegment(rawFirst || "candidate");
  const compactId = userId.replace(/-/g, "").toLowerCase();
  const suffix = compactId.slice(-4) || "id";
  const base = `${first}-${suffix}`;
  let handle = base;
  let n = 1;
  for (;;) {
    const clash = await prisma.provenHireResume.findUnique({
      where: { shareableHandle: handle },
      select: { userId: true },
    });
    if (!clash || clash.userId === userId) return handle;
    n += 1;
    handle = `${base}-${n}`;
  }
}

function normalizeSkillList(skills: unknown): string[] {
  if (skills == null) return [];
  if (Array.isArray(skills)) {
    return skills
      .map((s) => {
        if (typeof s === "string") return s;
        if (s && typeof s === "object" && "name" in s) return String((s as { name: unknown }).name);
        return String(s);
      })
      .filter((s) => s.trim().length > 0);
  }
  return [String(skills)].filter((s) => s.trim().length > 0);
}

export type ResumeVerifiedSkill = {
  skill: string;
  confidence: number;
  verifiedAt: string | null;
  expiresAt: string | null;
};

export type ResumeClaimedSkill = { skill: string; source: string };

export type ResumeProject = {
  name: string;
  role?: string;
  problemSolved?: string;
  techStack?: string[];
  keyDecisions?: string;
  outcome?: string;
  interviewId?: string;
  pendingReview?: boolean;
  extractedAt?: string;
};

function parseVerifiedSkillsFromBreakdown(breakdown: unknown): Array<{ skill: string; confidence: number }> {
  if (!breakdown || typeof breakdown !== "object") return [];
  const raw = (breakdown as Record<string, unknown>).verified_skills;
  if (!Array.isArray(raw)) return [];
  const out: Array<{ skill: string; confidence: number }> = [];
  for (const item of raw) {
    if (typeof item === "string") {
      out.push({ skill: item, confidence: 70 });
    } else if (item && typeof item === "object") {
      const o = item as Record<string, unknown>;
      const skill = String(o.skill ?? o.name ?? "").trim();
      const c = Number(o.confidence ?? o.score ?? 0);
      if (skill) out.push({ skill, confidence: Number.isFinite(c) ? c : 0 });
    }
  }
  return out;
}

function parseProjectSpotlight(breakdown: unknown, interviewId: string): ResumeProject | null {
  if (!breakdown || typeof breakdown !== "object") return null;
  const b = breakdown as Record<string, unknown>;
  const p = (b.project_spotlight ?? b.projectSpotlight) as Record<string, unknown> | undefined;
  if (!p || typeof p !== "object") return null;
  const name = String(p.project_name ?? p.name ?? "").trim();
  if (!name) return null;
  const ts = p.tech_stack ?? p.techStack;
  return {
    name,
    role: (p.candidate_role ?? p.role) != null ? String(p.candidate_role ?? p.role) : undefined,
    problemSolved: (p.problem_solved ?? p.problemSolved) != null ? String(p.problem_solved ?? p.problemSolved) : undefined,
    techStack: Array.isArray(ts) ? ts.map(String) : undefined,
    keyDecisions: (p.key_decisions ?? p.keyDecisions) != null ? String(p.key_decisions ?? p.keyDecisions) : undefined,
    outcome: p.outcome != null ? String(p.outcome) : undefined,
    interviewId,
    pendingReview: true,
    extractedAt: new Date().toISOString(),
  };
}

function formatMonthYear(d: Date): string {
  return d.toLocaleString("en-IN", { month: "short", year: "numeric", timeZone: "UTC" });
}

function stageSnapshot(
  stages: { stageName: string; status: string; score: number | null; updatedAt: Date }[],
  stageName: string,
): { score: number | null; status: string | null; monthYear: string | null } {
  const s = stages.find((x) => x.stageName === stageName);
  if (!s) return { score: null, status: null, monthYear: null };
  if (s.status === "pending_review") return { score: null, status: "pending_review", monthYear: formatMonthYear(s.updatedAt) };
  if (s.status !== "completed") return { score: null, status: s.status, monthYear: formatMonthYear(s.updatedAt) };
  return { score: s.score ?? null, status: "completed", monthYear: formatMonthYear(s.updatedAt) };
}

export async function syncProvenhireResumeFromSources(userId: string): Promise<void> {
  const profile = await prisma.jobSeekerProfile.findUnique({ where: { userId } });
  if (!profile) return;

  const existing = await prisma.provenHireResume.findUnique({ where: { userId } });
  const handle = existing?.shareableHandle ?? (await ensureUniqueShareableHandle(userId, profile.fullName));

  const tier = experienceTierFromYears(profile.experienceYears);
  const threshold = skillVerifiedThresholdForTier(tier);

  const { certificationLevel } = await computeProvenhireCertification(userId);
  const certCode = certificationLevel ?? "L0";

  let certificationDate = existing?.certificationDate ?? null;
  if (certCode !== "L0") {
    const prev = existing?.certificationLevel ?? "L0";
    if (!certificationDate || prev === "L0" || prev !== certCode) {
      certificationDate = new Date();
    }
  } else {
    certificationDate = null;
  }

  const stages = await prisma.verificationStage.findMany({
    where: { userId },
    select: { stageName: true, status: true, score: true, updatedAt: true },
  });

  let overall: number | null = null;
  try {
    const card = await buildTechnicalScorecard(userId);
    overall = Math.round(card.final_score);
  } catch {
    overall = null;
  }

  const dsa = stageSnapshot(stages, "dsa_round");
  const aiSkillsStage = stages.some((s) => s.stageName === "ai_skills_interview")
    ? stageSnapshot(stages, "ai_skills_interview")
    : { score: null, status: null, monthYear: null };
  const systemDesign = stageSnapshot(stages, "system_design_interview");
  const aiExpert = stageSnapshot(stages, "expert_interview");

  const assessmentScores = {
    dsa: { ...dsa, label: null as string | null },
    aiSkills: { ...aiSkillsStage, label: null as string | null },
    systemDesign: { ...systemDesign, label: null as string | null },
    aiExpert: { ...aiExpert, badgeLevel: null as string | null },
    overall,
  };

  const skillRow = await prisma.candidateSkillVerification.findUnique({
    where: { userId_skillType: { userId, skillType: "INTERVIEW" } },
    select: { expiresAt: true, completedAt: true, status: true, verifiedInStage: true },
  });
  const skillsExpired =
    skillRow?.status === "EXPIRED" || (!!skillRow?.expiresAt && new Date() > skillRow.expiresAt);

  const aiSkillsIv = await prisma.interview.findFirst({
    where: { userId, interviewType: "ai_skills", status: "completed" },
    orderBy: { completedAt: "desc" },
    select: { id: true, scoreBreakdown: true, completedAt: true },
  });

  const fromBreakdown = aiSkillsIv ? parseVerifiedSkillsFromBreakdown(aiSkillsIv.scoreBreakdown) : [];
  const verifiedSkills: ResumeVerifiedSkill[] = [];
  const verifiedNames = new Set<string>();

  if (!skillsExpired) {
    for (const row of fromBreakdown) {
      if (row.confidence < threshold) continue;
      const skill = row.skill.trim();
      if (!skill || verifiedNames.has(skill.toLowerCase())) continue;
      verifiedNames.add(skill.toLowerCase());
      verifiedSkills.push({
        skill,
        confidence: Math.round(row.confidence),
        verifiedAt: aiSkillsIv?.completedAt?.toISOString() ?? null,
        expiresAt: skillRow?.expiresAt?.toISOString() ?? null,
      });
    }
  }

  verifiedSkills.sort((a, b) => b.confidence - a.confidence);

  const claimedSkills: ResumeClaimedSkill[] = [];
  for (const raw of normalizeSkillList(profile.skills)) {
    const s = raw.trim();
    if (verifiedNames.has(s.toLowerCase())) continue;
    claimedSkills.push({ skill: s, source: "resume" });
  }

  const expertStage = stages.find((s) => s.stageName === "expert_interview");
  const expertApproved = expertStage?.status === "completed";

  let projects: ResumeProject[] = Array.isArray(existing?.projects)
    ? ([...(existing!.projects as unknown as ResumeProject[])] as ResumeProject[])
    : [];

  if (projects.length === 0 && expertApproved) {
    const expertIv = await prisma.interview.findFirst({
      where: { userId, interviewType: "ai_expert", status: "completed" },
      orderBy: { completedAt: "desc" },
      select: { id: true, scoreBreakdown: true },
    });
    if (expertIv) {
      const spotlight = parseProjectSpotlight(expertIv.scoreBreakdown, expertIv.id);
      if (spotlight) projects = [spotlight];
    }
  }

  const pendingCandidateReview = projects.some((p) => p.pendingReview === true);

  await prisma.provenHireResume.upsert({
    where: { userId },
    create: {
      userId,
      shareableHandle: handle,
      certificationLevel: certCode,
      certificationDate,
      verifiedSkills: verifiedSkills as unknown as Prisma.InputJsonValue,
      claimedSkills: claimedSkills as unknown as Prisma.InputJsonValue,
      projects: projects as unknown as Prisma.InputJsonValue,
      assessmentScores: assessmentScores as unknown as Prisma.InputJsonValue,
      pendingCandidateReview,
      isPublic: false,
    },
    update: {
      certificationLevel: certCode,
      certificationDate,
      verifiedSkills: verifiedSkills as unknown as Prisma.InputJsonValue,
      claimedSkills: claimedSkills as unknown as Prisma.InputJsonValue,
      projects: projects as unknown as Prisma.InputJsonValue,
      assessmentScores: assessmentScores as unknown as Prisma.InputJsonValue,
      pendingCandidateReview,
    },
  });
}

export type ProvenhireResumeFull = {
  userId: string;
  shareableHandle: string;
  shareableProfileUrl: string;
  certificationLevel: string;
  certificationDate: string | null;
  pendingCandidateReview: boolean;
  identity: {
    name: string | null;
    currentOrTargetRole: string | null;
    experienceLevel: string;
    location: string | null;
    noticePeriod: string | null;
    expectedSalaryRange: string | null;
    education: unknown;
  };
  verifiedSkills: ResumeVerifiedSkill[];
  claimedSkills: ResumeClaimedSkill[];
  projects: ResumeProject[];
  assessmentScores: Record<string, unknown>;
  professionalBackground: {
    workExperience: unknown;
    education: unknown;
    disclaimer: string;
  };
};

function experienceLabel(profile: {
  experienceLevel: string | null;
  experienceYears: number | null;
}): string {
  if (profile.experienceLevel && profile.experienceLevel.trim()) return profile.experienceLevel.trim();
  const tier = experienceTierFromYears(profile.experienceYears);
  if (tier === "fresher") return "Early Career";
  if (tier === "mid") return "Mid Level";
  return "Senior";
}

export async function getFullProvenhireResumeForCandidate(userId: string): Promise<ProvenhireResumeFull | null> {
  await syncProvenhireResumeFromSources(userId);
  const profile = await prisma.jobSeekerProfile.findUnique({ where: { userId } });
  const row = await prisma.provenHireResume.findUnique({ where: { userId } });
  if (!profile || !row) return null;

  const verifiedSkills = Array.isArray(row.verifiedSkills) ? (row.verifiedSkills as ResumeVerifiedSkill[]) : [];
  const claimedSkills = Array.isArray(row.claimedSkills) ? (row.claimedSkills as ResumeClaimedSkill[]) : [];
  const projects = Array.isArray(row.projects) ? (row.projects as ResumeProject[]) : [];

  const workExperience = profile.workExperience ?? [];
  const education = profile.education ?? [];

  const baseUrl = (process.env.PUBLIC_SITE_URL ?? "https://provenhire.in").replace(/\/$/, "");

  return {
    userId,
    shareableHandle: row.shareableHandle,
    shareableProfileUrl: `${baseUrl}/verified/${row.shareableHandle}`,
    certificationLevel: row.certificationLevel,
    certificationDate: row.certificationDate?.toISOString() ?? null,
    pendingCandidateReview: row.pendingCandidateReview,
    identity: {
      name: profile.fullName,
      currentOrTargetRole: profile.targetJobTitle ?? profile.currentRole,
      experienceLevel: experienceLabel(profile),
      location: profile.location,
      noticePeriod: profile.noticePeriod,
      expectedSalaryRange: profile.expectedSalary,
      education,
    },
    verifiedSkills,
    claimedSkills,
    projects,
    assessmentScores: (row.assessmentScores && typeof row.assessmentScores === "object"
      ? (row.assessmentScores as Record<string, unknown>)
      : {}) as Record<string, unknown>,
    professionalBackground: {
      workExperience,
      education,
      disclaimer:
        "This section is sourced from the candidate's uploaded resume and has not been verified by ProvenHire.",
    },
  };
}

/** Recruiter-facing resume shapes (PRD §7). */
export function filterResumeForRecruiter(full: ProvenhireResumeFull, tier: "free" | "paid"): ProvenhireResumeFull {
  const verified = [...full.verifiedSkills];
  verified.sort((a, b) => b.confidence - a.confidence);

  const projectsRecruiterOk =
    !full.pendingCandidateReview && !full.projects.some((p) => p.pendingReview === true);

  if (tier === "free") {
    const scores = { ...(full.assessmentScores as Record<string, unknown>) };
    return {
      ...full,
      verifiedSkills: verified.slice(0, 5),
      claimedSkills: [],
      projects: projectsRecruiterOk ? full.projects : [],
      assessmentScores: {
        overall: scores.overall ?? null,
      },
      professionalBackground: {
        workExperience: [],
        education: [],
        disclaimer: full.professionalBackground.disclaimer,
      },
    };
  }

  const scores = { ...(full.assessmentScores as Record<string, unknown>) };
  delete scores.aiExpertPerQuestion;
  delete scores.perQuestionBreakdown;

  return {
    ...full,
    verifiedSkills: verified,
    projects: projectsRecruiterOk ? full.projects : [],
    assessmentScores: scores,
  };
}
