type ExperienceTier = "fresher" | "mid_senior";

export type VerificationTrack = "software" | "data" | "non_technical";

function experienceTierFromYears(years: number | null | undefined): ExperienceTier {
  if (years == null || years < 3) return "fresher";
  return "mid_senior";
}

// ---------------------------------------------------------------------------
// Software track
// ---------------------------------------------------------------------------

export function technicalStagesForTier(tier: ExperienceTier): string[] {
  if (tier === "fresher") {
    return ["profile_setup", "cs_fundamentals", "dsa_round", "ai_skills_interview", "expert_interview"];
  }
  return ["profile_setup", "dsa_round", "ai_skills_interview", "system_design_interview", "expert_interview"];
}

// ---------------------------------------------------------------------------
// Data track
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Legacy
// ---------------------------------------------------------------------------

const LEGACY_TECHNICAL_STAGES = [
  "profile_setup",
  "aptitude_test",
  "dsa_round",
  "expert_interview",
  "human_expert_interview",
];

// ---------------------------------------------------------------------------
// Unified helpers
// ---------------------------------------------------------------------------

/**
 * Map roleType string to canonical track.
 */
export function roleTypeToTrack(roleType: string | null | undefined): VerificationTrack {
  const rt = (roleType ?? "technical").toLowerCase().trim();
  if (rt === "data") return "data";
  if (rt === "non_technical") return "non_technical";
  return "software";
}

/**
 * Determine the correct stage order for the frontend stepper.
 * Priority: API-returned `stageOrderFromApi` > experience-based v2 > legacy.
 */
export function technicalStageOrderFallback(opts: {
  stageOrderFromApi?: string[];
  verificationPipelineV2?: boolean;
  pipelinePendingProfileSetup?: boolean;
  experienceYears?: number;
  roleType?: string;
}): string[] {
  if (Array.isArray(opts.stageOrderFromApi) && opts.stageOrderFromApi.length > 0) {
    return opts.stageOrderFromApi;
  }
  const track = roleTypeToTrack(opts.roleType);
  if (track === "data") {
    if (opts.pipelinePendingProfileSetup) return dataStagesForTier("fresher");
    return dataStagesForTier(experienceTierFromYears(opts.experienceYears));
  }
  if (opts.verificationPipelineV2) {
    if (opts.pipelinePendingProfileSetup) {
      return technicalStagesForTier("fresher");
    }
    return technicalStagesForTier(experienceTierFromYears(opts.experienceYears));
  }
  return [...LEGACY_TECHNICAL_STAGES];
}

/**
 * Ensure the resolved stage list only contains stages the frontend can render
 * and strips `human_expert_interview` from the technical/data v2 path.
 */
export function normalizeTechnicalStageOrderForDisplay(
  stages: string[],
  roleType: string,
  isV2: boolean
): string[] {
  const track = roleTypeToTrack(roleType);
  if (track === "non_technical") return stages;
  if (!isV2 && track === "software") return stages;
  return stages.filter((s) => s !== "human_expert_interview");
}
