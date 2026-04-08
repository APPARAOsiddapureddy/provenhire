type ExperienceTier = "fresher" | "mid_senior";

function experienceTierFromYears(years: number | null | undefined): ExperienceTier {
  if (years == null || years < 3) return "fresher";
  return "mid_senior";
}

export function technicalStagesForTier(tier: ExperienceTier): string[] {
  if (tier === "fresher") {
    return ["profile_setup", "cs_fundamentals", "dsa_round", "ai_skills_interview", "expert_interview"];
  }
  return ["profile_setup", "dsa_round", "ai_skills_interview", "system_design_interview", "expert_interview"];
}

const LEGACY_TECHNICAL_STAGES = [
  "profile_setup",
  "aptitude_test",
  "dsa_round",
  "expert_interview",
  "human_expert_interview",
];

/**
 * Determine the correct technical stage order for the frontend stepper.
 * Priority: API-returned `stageOrderFromApi` > experience-based v2 > legacy.
 */
export function technicalStageOrderFallback(opts: {
  stageOrderFromApi?: string[];
  verificationPipelineV2?: boolean;
  pipelinePendingProfileSetup?: boolean;
  experienceYears?: number;
}): string[] {
  if (Array.isArray(opts.stageOrderFromApi) && opts.stageOrderFromApi.length > 0) {
    return opts.stageOrderFromApi;
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
 * and strips `human_expert_interview` from the technical v2 path (it's non-technical only).
 */
export function normalizeTechnicalStageOrderForDisplay(
  stages: string[],
  roleType: "technical" | "non_technical",
  isV2: boolean
): string[] {
  if (roleType === "non_technical") return stages;
  if (!isV2) return stages;
  return stages.filter((s) => s !== "human_expert_interview");
}
