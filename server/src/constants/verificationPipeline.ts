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
  "product manager", "product owner", "product analyst",
  "ux designer", "ui designer", "ui/ux", "product designer", "ux researcher", "interaction designer",
  "business analyst", "strategy analyst", "finance analyst", "financial analyst",
  "operations manager", "project manager", "scrum master", "program manager", "agile coach",
  "marketing manager", "growth manager", "content strategist", "brand manager", "content writer",
  "copywriter", "social media", "seo",
  "hr manager", "human resource", "talent acquisition", "recruiter", "people operations", "people partner",
  "customer success", "account manager", "sales manager", "business development", "sales",
  "legal", "compliance", "chief of staff", "founder", "cofounder", "co-founder",
  "admin", "marketing", "operations", "strategy", "consultant",
];

/** Per PRD §3 — drives domain MCQs, assignment pools, and expert interview templates. */
export type NonTechSubtrack =
  | "product"
  | "design"
  | "business"
  | "operations"
  | "marketing"
  | "people";

/**
 * Classify non-technical candidates into a subtrack from job title (target or current role).
 * More specific patterns are checked first.
 */
export function detectNonTechSubtrack(jobTitle: string | null | undefined): NonTechSubtrack {
  if (!jobTitle) return "business";
  const lower = jobTitle.toLowerCase().trim();

  const designHints = [
    "ux designer",
    "ui designer",
    "ui/ux",
    "product designer",
    "product design",
    "ux researcher",
    "interaction designer",
    "visual designer",
    "graphic designer",
    "design lead",
    "designer",
  ];
  if (
    designHints.some((h) => lower.includes(h)) &&
    !lower.includes("product manager") &&
    !lower.includes("product owner")
  ) {
    return "design";
  }

  if (
    lower.includes("product manager") ||
    lower.includes("product owner") ||
    lower.includes("product analyst") ||
    lower.includes("product management")
  ) {
    return "product";
  }

  if (
    lower.includes("marketing") ||
    lower.includes("growth manager") ||
    lower.includes("growth") ||
    lower.includes("content strategist") ||
    lower.includes("brand manager") ||
    lower.includes("copywriter") ||
    lower.includes("seo")
  ) {
    return "marketing";
  }

  if (
    /\bhr\b/.test(lower) ||
    lower.includes("human resource") ||
    lower.includes("talent acquisition") ||
    lower.includes("recruiter") ||
    lower.includes("people operations") ||
    lower.includes("people partner") ||
    lower.includes("people & culture") ||
    lower.includes("talent partner") ||
    lower.includes("customer success")
  ) {
    return "people";
  }

  if (
    lower.includes("operations manager") ||
    lower.includes("project manager") ||
    lower.includes("scrum master") ||
    lower.includes("program manager") ||
    lower.includes("agile coach") ||
    lower.includes("chief of staff")
  ) {
    return "operations";
  }

  if (
    lower.includes("account manager") ||
    lower.includes("sales manager") ||
    lower.includes("business development") ||
    /\bsales\b/.test(lower)
  ) {
    return "business";
  }

  if (
    lower.includes("business analyst") ||
    lower.includes("strategy") ||
    lower.includes("finance") ||
    lower.includes("financial") ||
    lower.includes("legal") ||
    lower.includes("compliance") ||
    lower.includes("consultant")
  ) {
    return "business";
  }

  return "business";
}

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

/** @deprecated Use nonTechnicalStagesForProfile — v2 adds domain fundamentals + AI expert. */
export const NON_TECHNICAL_STAGES = [
  "profile_setup",
  "non_tech_assignment",
  "human_expert_interview",
] as const;

export const ALL_NON_TECH_STAGE_NAMES = new Set<string>([
  "profile_setup",
  "domain_fundamentals",
  "non_tech_assignment",
  "expert_interview",
  "human_expert_interview",
]);

/** Non-technical track: fresher includes aptitude + domain MCQs; mid/senior skips fundamentals. */
export function nonTechnicalStagesForProfile(experienceYears: number | null | undefined): string[] {
  const tier = experienceTierFromYears(experienceYears);
  if (tier === "fresher") {
    return ["profile_setup", "domain_fundamentals", "non_tech_assignment", "expert_interview"];
  }
  return ["profile_setup", "non_tech_assignment", "expert_interview"];
}

/**
 * Resolve verification stages for any track. The single entry point used by
 * the verification route to determine the pipeline for a user.
 */
export function verificationStagesForProfile(profile: {
  experienceYears: number | null | undefined;
  roleType?: string | null;
}): string[] {
  const track = roleTypeToTrack(profile.roleType);
  if (track === "non_technical") return nonTechnicalStagesForProfile(profile.experienceYears);
  if (track === "data") return dataStagesForProfile(profile.experienceYears);
  if (!isVerificationPipelineV2()) return [...LEGACY_TECHNICAL_STAGES_V1];
  return technicalStagesForProfile(profile.experienceYears);
}

/**
 * All valid stage names for a given track (used for input validation).
 */
export function allowedStageNamesForTrack(track: VerificationTrack): Set<string> {
  if (track === "non_technical") return ALL_NON_TECH_STAGE_NAMES;
  if (track === "data") return ALL_DATA_STAGE_NAMES;
  return ALL_TECHNICAL_STAGE_NAMES;
}

/** Dev/staging only: allow marking AI Skills / System Design complete without real sessions. */
export function allowPlaceholderVerificationCompletion(): boolean {
  if (process.env.ALLOW_PLACEHOLDER_STAGE_COMPLETION?.trim().toLowerCase() === "true") return true;
  return process.env.NODE_ENV !== "production";
}
