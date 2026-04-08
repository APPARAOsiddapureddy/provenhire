import type { ExperienceTier } from "../utils/experienceTier.js";
import { experienceTierFromYears } from "../utils/experienceTier.js";

/**
 * ProvenHire v2 verification pipeline (PRD 1 + Data Track PRD — April 2026).
 * **Default ON** — set VERIFICATION_PIPELINE_V2=false to revert to legacy.
 */
export function isVerificationPipelineV2(): boolean {
  const v = process.env.VERIFICATION_PIPELINE_V2?.trim().toLowerCase();
  if (v === "0" || v === "false") return false;
  return true;
}

// ---------------------------------------------------------------------------
// Track types
// ---------------------------------------------------------------------------

export type VerificationTrack = "software" | "data" | "non_technical";

export type DataSubtrack = "engineering" | "science" | "analysis";

const DATA_TRACK_TITLES = [
  "data engineer", "senior data engineer", "data scientist",
  "ml engineer", "machine learning engineer", "data analyst",
  "analytics engineer", "bi developer", "business intelligence",
  "mlops engineer", "data platform engineer", "applied scientist",
  "research engineer", "nlp engineer", "data science",
  "ai engineer", "deep learning",
];

const NON_TECH_TITLES = [
  "project manager", "product manager", "business development",
  "hr", "human resource", "marketing", "sales", "content",
  "recruiter", "operations", "admin", "finance",
];

export function detectTrack(jobTitle: string | null | undefined): VerificationTrack {
  if (!jobTitle) return "software";
  const lower = jobTitle.toLowerCase().trim();
  if (DATA_TRACK_TITLES.some((t) => lower.includes(t))) return "data";
  if (NON_TECH_TITLES.some((t) => lower.includes(t))) return "non_technical";
  return "software";
}

export function detectDataSubtrack(jobTitle: string | null | undefined): DataSubtrack {
  if (!jobTitle) return "engineering";
  const lower = jobTitle.toLowerCase().trim();
  if (["ml engineer", "data scientist", "applied scientist", "nlp", "research", "deep learning", "ai engineer"].some((t) => lower.includes(t)))
    return "science";
  if (["analyst", "bi developer", "analytics engineer", "business intelligence"].some((t) => lower.includes(t)))
    return "analysis";
  return "engineering";
}

/**
 * Map stored roleType values to canonical VerificationTrack.
 * Legacy roleType "technical" → "software"; "data" → "data"; else → "non_technical".
 */
export function roleTypeToTrack(roleType: string | null | undefined): VerificationTrack {
  const rt = (roleType ?? "technical").toLowerCase().trim();
  if (rt === "data") return "data";
  if (rt === "non_technical") return "non_technical";
  return "software";
}

// ---------------------------------------------------------------------------
// Software track stages (existing)
// ---------------------------------------------------------------------------

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
  if (profile.roleType === "non_technical" || profile.roleType === "data") {
    throw new Error("verificationStagesNeededTechnical: use non-technical or data path");
  }
  if (!isVerificationPipelineV2()) {
    return [...LEGACY_TECHNICAL_STAGES_V1];
  }
  return technicalStagesForProfile(profile.experienceYears);
}

// ---------------------------------------------------------------------------
// Data track stages (new — PRD v2.0 April 2026)
// ---------------------------------------------------------------------------

export const ALL_DATA_STAGE_NAMES = new Set<string>([
  "profile_setup",
  "data_fundamentals",
  "data_round",
  "data_skills_interview",
  "data_system_design",
  "expert_interview",
]);

export function dataStagesForTier(tier: ExperienceTier): string[] {
  if (tier === "fresher") {
    return [
      "profile_setup",
      "data_fundamentals",
      "data_round",
      "data_skills_interview",
      "expert_interview",
    ];
  }
  return [
    "profile_setup",
    "data_round",
    "data_skills_interview",
    "data_system_design",
    "expert_interview",
  ];
}

export function dataStagesForProfile(experienceYears: number | null | undefined): string[] {
  return dataStagesForTier(experienceTierFromYears(experienceYears));
}

// ---------------------------------------------------------------------------
// Unified resolver
// ---------------------------------------------------------------------------

export const NON_TECHNICAL_STAGES = [
  "profile_setup",
  "non_tech_assignment",
  "human_expert_interview",
] as const;

/**
 * Resolve verification stages for any track. The single entry point used by
 * the verification route to determine the pipeline for a user.
 */
export function verificationStagesForProfile(profile: {
  experienceYears: number | null | undefined;
  roleType?: string | null;
}): string[] {
  const track = roleTypeToTrack(profile.roleType);
  if (track === "non_technical") return [...NON_TECHNICAL_STAGES];
  if (track === "data") return dataStagesForProfile(profile.experienceYears);
  if (!isVerificationPipelineV2()) return [...LEGACY_TECHNICAL_STAGES_V1];
  return technicalStagesForProfile(profile.experienceYears);
}

/**
 * All valid stage names for a given track (used for input validation).
 */
export function allowedStageNamesForTrack(track: VerificationTrack): Set<string> {
  if (track === "non_technical") return new Set(NON_TECHNICAL_STAGES);
  if (track === "data") return ALL_DATA_STAGE_NAMES;
  return ALL_TECHNICAL_STAGE_NAMES;
}

/** Dev/staging only: allow marking AI Skills / System Design complete without real sessions. */
export function allowPlaceholderVerificationCompletion(): boolean {
  if (process.env.ALLOW_PLACEHOLDER_STAGE_COMPLETION?.trim().toLowerCase() === "true") return true;
  return process.env.NODE_ENV !== "production";
}
