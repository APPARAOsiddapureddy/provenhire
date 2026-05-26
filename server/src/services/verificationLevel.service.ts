import { prisma } from "../config/prisma.js";
import { experienceTierFromYears } from "../utils/experienceTier.js";
import { computeProvenhireCertification, type ProvenhireCertificationCode } from "./verificationScoring.service.js";
import { isVerificationPipelineV2, roleTypeToTrack } from "../constants/verificationPipeline.js";

export type CertificationTrack = "software" | "data" | "technical" | "non_technical";

export interface CertificationLevelResult {
  level: number;
  label: string;
  roleType: CertificationTrack;
  /** PRD L1 / L2 / L3 codes; null if not yet at L1. */
  certificationLevel?: ProvenhireCertificationCode;
  certificationLabel?: string | null;
}

const TECH_LABELS: Record<number, string> = {
  0: "Level 0 - Not Yet Certified",
  1: "Level 1 - Cognitive Verified",
  2: "Level 2 - Skill Passport Verified",
  3: "Level 3 - Elite ProvenHire Candidate",
};

const NON_TECH_LABELS: Record<number, string> = {
  0: "Level 0 - Not Yet Certified",
  1: "Level 1 - Foundation Verified",
  2: "Level 2 - Skill Passport Verified",
  3: "Level 3 - Elite ProvenHire Candidate",
};

export function getCertificationLabel(roleType: CertificationTrack, level: number): string {
  const normalized = Math.max(0, Math.floor(level));
  if (roleType === "non_technical") {
    return NON_TECH_LABELS[normalized] ?? NON_TECH_LABELS[0];
  }
  return TECH_LABELS[normalized] ?? TECH_LABELS[0];
}

export function calculateCertificationLevelFromCompletedStages(
  roleType: CertificationTrack,
  completedStageNames: Set<string>,
  opts?: { experienceYears?: number | null }
): number {
  if (roleType === "non_technical") {
    if (completedStageNames.has("expert_interview") || completedStageNames.has("human_expert_interview")) {
      return 3;
    }
    if (completedStageNames.has("non_tech_assignment")) return 2;
    const tierNt = experienceTierFromYears(opts?.experienceYears);
    if (tierNt === "fresher") {
      if (completedStageNames.has("domain_fundamentals")) return 1;
    } else if (completedStageNames.has("profile_setup")) {
      return 1;
    }
    return 0;
  }

  const isDataTrack =
    completedStageNames.has("data_round") ||
    completedStageNames.has("data_skills_interview") ||
    completedStageNames.has("data_system_design");

  if (completedStageNames.has("expert_interview") || completedStageNames.has("human_expert_interview")) {
    return isDataTrack ? 3 : 2;
  }

  const hasSkillsInterview = completedStageNames.has("data_skills_interview");
  if (hasSkillsInterview) return 2;

  const hasCodingRound = completedStageNames.has("dsa_round") || completedStageNames.has("data_round");
  if (hasCodingRound) return 1;

  return 0;
}

function codeToNumericLevel(code: ProvenhireCertificationCode): number {
  if (code === "L3") return 3;
  if (code === "L2") return 2;
  if (code === "L1") return 1;
  return 0;
}

export async function calculateCertificationLevel(userId: string): Promise<CertificationLevelResult> {
  const [profile, cert] = await Promise.all([
    prisma.jobSeekerProfile.findUnique({
      where: { userId },
      select: { roleType: true },
    }),
    computeProvenhireCertification(userId),
  ]);

  const resolvedTrack = roleTypeToTrack(profile?.roleType);
  const roleType = resolvedTrack as CertificationTrack;
  const level = codeToNumericLevel(cert.certificationLevel);
  const label =
    cert.certificationLevel && cert.certificationLabel
      ? `${cert.certificationLevel} — ${cert.certificationLabel}`
      : getCertificationLabel(roleType, level);

  return {
    level,
    label,
    roleType,
    certificationLevel: cert.certificationLevel,
    certificationLabel: cert.certificationLabel,
  };
}

export async function calculateCertificationLevelsForUsers(
  userIds: string[]
): Promise<Map<string, CertificationLevelResult>> {
  const uniqueIds = [...new Set(userIds.filter(Boolean))];
  const out = new Map<string, CertificationLevelResult>();
  if (uniqueIds.length === 0) return out;

  if (!isVerificationPipelineV2()) {
    await Promise.all(
      uniqueIds.map(async (id) => {
        out.set(id, await calculateCertificationLevel(id));
      })
    );
    return out;
  }

  const [profiles, stages, aiExpertInterviews, passedHumanSessions] = await Promise.all([
    prisma.jobSeekerProfile.findMany({
      where: { userId: { in: uniqueIds } },
      select: { userId: true, roleType: true, experienceYears: true },
    }),
    prisma.verificationStage.findMany({
      where: { userId: { in: uniqueIds } },
      select: { userId: true, stageName: true, status: true },
    }),
    prisma.interview.findMany({
      where: {
        userId: { in: uniqueIds },
        status: "completed",
        interviewType: { in: ["ai_expert", "jd_interview"] },
      },
      select: { userId: true },
    }),
    prisma.humanInterviewSession.findMany({
      where: { userId: { in: uniqueIds }, evaluationPass: true },
      select: { userId: true },
    }),
  ]);

  const profileByUser = new Map(profiles.map((p) => [p.userId, p]));
  const stagesByUser = new Map<string, Set<string>>();
  for (const s of stages) {
    if (s.status !== "completed") continue;
    if (!stagesByUser.has(s.userId)) stagesByUser.set(s.userId, new Set());
    stagesByUser.get(s.userId)!.add(s.stageName);
  }
  const aiExpertDone = new Set(aiExpertInterviews.map((i) => i.userId));
  const humanPassed = new Set(passedHumanSessions.map((s) => s.userId));

  for (const userId of uniqueIds) {
    const profile = profileByUser.get(userId);
    const track = roleTypeToTrack(profile?.roleType);
    const completed = stagesByUser.get(userId) ?? new Set<string>();
    const done = (stage: string) => completed.has(stage);
    let certificationLevel: ProvenhireCertificationCode = null;
    let certificationLabel: string | null = null;

    if (track === "non_technical") {
      if (done("expert_interview") && aiExpertDone.has(userId)) {
        certificationLevel = "L3";
        certificationLabel = "Elite Verified";
      } else if (done("human_expert_interview") && humanPassed.has(userId)) {
        certificationLevel = "L3";
        certificationLabel = "Elite Verified";
      } else if (done("non_tech_assignment")) {
        certificationLevel = "L2";
        certificationLabel = "Skill Passport";
      } else {
        const tierNt = experienceTierFromYears(profile?.experienceYears);
        if ((tierNt === "fresher" && done("domain_fundamentals")) || (tierNt !== "fresher" && done("profile_setup"))) {
          certificationLevel = "L1";
          certificationLabel = "Foundation Verified";
        }
      }
    } else {
      if (done("expert_interview") && aiExpertDone.has(userId)) {
        if (track === "software") {
          certificationLevel = "L2";
          certificationLabel = "Skill Passport";
        } else {
          certificationLevel = "L3";
          certificationLabel = "Elite Verified";
        }
      } else if (track === "data") {
        const tier = experienceTierFromYears(profile?.experienceYears);
        const hasSkillsInterview = done("data_skills_interview");
        const hasSystemDesign = done("data_system_design");
        if ((tier === "fresher" && hasSkillsInterview) || (tier !== "fresher" && hasSkillsInterview && hasSystemDesign)) {
          certificationLevel = "L2";
          certificationLabel = "Skill Passport";
        } else if (done("data_round")) {
          certificationLevel = "L1";
          certificationLabel = "Cognitive Verified";
        }
      } else if (done("dsa_round")) {
        certificationLevel = "L1";
        certificationLabel = "Cognitive Verified";
      }
    }

    const roleType = track as CertificationTrack;
    const level = codeToNumericLevel(certificationLevel);
    const label =
      certificationLevel && certificationLabel
        ? `${certificationLevel} — ${certificationLabel}`
        : getCertificationLabel(roleType, level);
    out.set(userId, {
      level,
      label,
      roleType,
      certificationLevel,
      certificationLabel,
    });
  }

  return out;
}

export function minimumLevelHint(roleType: CertificationTrack, level: number): string {
  if (roleType === "non_technical") {
    if (level <= 1) return "Complete profile, assignment, and earlier non-technical stages to unlock this role.";
    if (level === 2) return "Complete the AI Expert Interview to unlock this role.";
    return "Complete verification stages to unlock this role.";
  }

  if (roleType === "software") {
    if (level <= 1) return "Complete Profile Setup and Live Coding (DSA) to unlock this role.";
    if (level === 2) return "Complete the AI Expert Interview to unlock this role.";
    return "This certification level is not awarded in the current developer flow.";
  }

  if (level <= 1)
    return "Complete Profile Setup and Live Coding (DSA) to unlock this role.";
  if (level === 2) return "Complete the AI Expert Interview to unlock this role.";
  if (level >= 3) return "This certification level is not awarded in the current developer flow.";
  return "Complete verification stages to unlock this role.";
}

