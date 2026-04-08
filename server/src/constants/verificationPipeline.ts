import type { ExperienceTier } from "../utils/experienceTier.js";
import { experienceTierFromYears } from "../utils/experienceTier.js";

/**
 * ProvenHire v2 verification pipeline (PRD 1 — April 2026).
 * When unset/false, the legacy path (aptitude_test + human expert in chain) stays active.
 */
export function isVerificationPipelineV2(): boolean {
  const v = process.env.VERIFICATION_PIPELINE_V2?.trim().toLowerCase();
  return v === "1" || v === "true";
}

/** @deprecated Legacy technical order including human expert in-platform */
export const LEGACY_TECHNICAL_STAGES_V1 = [
  "profile_setup",
  "aptitude_test",
  "dsa_round",
  "expert_interview",
  "human_expert_interview",
] as const;

export const ALL_TECHNICAL_STAGE_NAMES = new Set<string>([
  ...LEGACY_TECHNICAL_STAGES_V1,
  "cs_fundamentals",
  "ai_skills_interview",
  "system_design_interview",
]);

export function technicalStagesForTier(tier: ExperienceTier): string[] {
  if (tier === "fresher") {
    return ["profile_setup", "cs_fundamentals", "dsa_round", "ai_skills_interview", "expert_interview"];
  }
  return ["profile_setup", "dsa_round", "ai_skills_interview", "system_design_interview", "expert_interview"];
}

export function technicalStagesForProfile(experienceYears: number | null | undefined): string[] {
  return technicalStagesForTier(experienceTierFromYears(experienceYears));
}

export function verificationStagesNeededTechnical(profile: {
  experienceYears: number | null;
  roleType?: string | null;
}): string[] {
  if (profile.roleType === "non_technical") {
    throw new Error("verificationStagesNeededTechnical: use non-technical path");
  }
  if (!isVerificationPipelineV2()) {
    return [...LEGACY_TECHNICAL_STAGES_V1];
  }
  return technicalStagesForProfile(profile.experienceYears);
}

/** Dev/staging only: allow marking AI Skills / System Design complete without real sessions. */
export function allowPlaceholderVerificationCompletion(): boolean {
  if (process.env.ALLOW_PLACEHOLDER_STAGE_COMPLETION?.trim().toLowerCase() === "true") return true;
  return process.env.NODE_ENV !== "production";
}
