export type ExperienceTier = "fresher" | "mid" | "senior";

/** 0–1y fresher, 1–3y mid, 3+y senior (aligned with pipeline PRD). */
export function experienceTierFromYears(years: number | null | undefined): ExperienceTier {
  const y = years ?? 0;
  if (y < 1) return "fresher";
  if (y < 3) return "mid";
  return "senior";
}

export type AptitudeQuestionSetId =
  | "aptitude_mixed"
  | "cs_fundamentals_medium"
  | "cs_fundamentals_advanced"
  | "data_fundamentals_fresher"
  | "data_fundamentals_medium"
  | "data_fundamentals_advanced"
  | "non_tech_domain_fundamentals";

export function questionSetForTier(tier: ExperienceTier): AptitudeQuestionSetId {
  switch (tier) {
    case "fresher":
      return "aptitude_mixed";
    case "mid":
      return "cs_fundamentals_medium";
    default:
      return "cs_fundamentals_advanced";
  }
}

export function dataQuestionSetForTier(tier: ExperienceTier): AptitudeQuestionSetId {
  switch (tier) {
    case "fresher":
      return "data_fundamentals_fresher";
    case "mid":
      return "data_fundamentals_medium";
    default:
      return "data_fundamentals_advanced";
  }
}

export function dsaTierConfig(tier: ExperienceTier): {
  questionCount: number;
  passThresholdPercent: number;
  timeLimitMinutes: number;
  difficulties: ("Easy" | "Medium" | "Hard")[];
  /** When set, pick one official question per slot in order (PRD §7 difficulty mix). */
  difficultySlots?: ("Easy" | "Medium" | "Hard")[];
} {
  switch (tier) {
    case "fresher":
      return {
        questionCount: 2,
        passThresholdPercent: 50,
        timeLimitMinutes: 60,
        difficulties: ["Easy", "Medium"],
        difficultySlots: ["Easy", "Medium"],
      };
    case "mid":
      return {
        questionCount: 3,
        passThresholdPercent: 55,
        timeLimitMinutes: 75,
        difficulties: ["Easy", "Medium", "Hard"],
        difficultySlots: ["Easy", "Medium", "Hard"],
      };
    default:
      return {
        questionCount: 3,
        passThresholdPercent: 60,
        timeLimitMinutes: 90,
        difficulties: ["Medium", "Hard"],
        difficultySlots: ["Medium", "Hard", "Hard"],
      };
  }
}

/**
 * Data Round tier config — SQL + Python tasks via Judge0.
 * Task count, thresholds, and time vary by experience.
 */
export function dataRoundTierConfig(tier: ExperienceTier): {
  taskCount: number;
  passThresholdPercent: number;
  timeLimitMinutes: number;
  sqlTaskCount: number;
  pythonTaskCount: number;
  modelingOrStatsTaskCount: number;
} {
  switch (tier) {
    case "fresher":
      return {
        taskCount: 2,
        passThresholdPercent: 50,
        timeLimitMinutes: 60,
        sqlTaskCount: 1,
        pythonTaskCount: 1,
        modelingOrStatsTaskCount: 0,
      };
    case "mid":
      return {
        taskCount: 3,
        passThresholdPercent: 55,
        timeLimitMinutes: 75,
        sqlTaskCount: 1,
        pythonTaskCount: 1,
        modelingOrStatsTaskCount: 1,
      };
    default:
      return {
        taskCount: 3,
        passThresholdPercent: 60,
        timeLimitMinutes: 90,
        sqlTaskCount: 1,
        pythonTaskCount: 1,
        modelingOrStatsTaskCount: 1,
      };
  }
}

/** Salary ceiling (LPA) for L2 candidates by experience tier. */
export function salaryCapLpaForTier(tier: ExperienceTier): number {
  switch (tier) {
    case "fresher":
      return 7;
    case "mid":
      return 13;
    default:
      return 18;
  }
}
