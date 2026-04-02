export type ExperienceTier = "fresher" | "mid" | "senior";

/** 0–1y fresher, 1–3y mid, 3+y senior (aligned with pipeline PRD). */
export function experienceTierFromYears(years: number | null | undefined): ExperienceTier {
  const y = years ?? 0;
  if (y < 1) return "fresher";
  if (y < 3) return "mid";
  return "senior";
}

export type AptitudeQuestionSetId = "aptitude_mixed" | "cs_fundamentals_medium" | "cs_fundamentals_advanced";

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

export function dsaTierConfig(tier: ExperienceTier): {
  questionCount: number;
  passThresholdPercent: number;
  timeLimitMinutes: number;
  difficulties: ("Easy" | "Medium" | "Hard")[];
} {
  switch (tier) {
    case "fresher":
      return {
        questionCount: 3,
        passThresholdPercent: 50,
        timeLimitMinutes: 60,
        difficulties: ["Easy", "Medium"],
      };
    case "mid":
      return {
        questionCount: 3,
        passThresholdPercent: 60,
        timeLimitMinutes: 75,
        difficulties: ["Medium", "Hard"],
      };
    default:
      return {
        questionCount: 2,
        passThresholdPercent: 65,
        timeLimitMinutes: 90,
        difficulties: ["Hard"],
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
