import { prisma } from "../config/prisma.js";
import { computeProvenhireCertification, type ProvenhireCertificationCode } from "./verificationScoring.service.js";

export type CertificationTrack = "technical" | "non_technical";

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
  1: "Level 1 - Skill Assignment Verified",
  2: "Level 2 - Expert Verified Candidate",
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
  completedStageNames: Set<string>
): number {
  if (roleType === "non_technical") {
    if (completedStageNames.has("human_expert_interview")) return 2;
    if (completedStageNames.has("profile_setup") && completedStageNames.has("non_tech_assignment")) return 1;
    return 0;
  }

  if (completedStageNames.has("expert_interview") || completedStageNames.has("human_expert_interview")) {
    return 3;
  }

  const hasSkillsInterview =
    completedStageNames.has("ai_skills_interview") || completedStageNames.has("data_skills_interview");
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

  const roleType = (profile?.roleType === "non_technical" ? "non_technical" : "technical") as CertificationTrack;
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

export function minimumLevelHint(roleType: CertificationTrack, level: number): string {
  if (roleType === "non_technical") {
    if (level <= 1) return "Complete Profile Setup and Non-Technical Assignment to unlock this role.";
    if (level >= 2) return "Complete Human Expert Interview to unlock this role.";
    return "Complete verification stages to unlock this role.";
  }

  if (level <= 1)
    return "Complete Profile Setup, Cognitive Assessment, and Live Coding (DSA) to unlock this role.";
  if (level === 2) return "Complete DSA Round and AI Interview to unlock this role.";
  if (level >= 3) return "Complete Human Expert Interview to unlock this role.";
  return "Complete verification stages to unlock this role.";
}

