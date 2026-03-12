/**
 * Skill Validity & Expiry Configuration
 * Validity durations in days for each skill type.
 */
export const SKILL_VALIDITY_DAYS: Record<string, number> = {
  APTITUDE: 180,
  LIVE_CODING: 30,
  INTERVIEW: 365,
} as const;

export type SkillType = keyof typeof SKILL_VALIDITY_DAYS;

export const STAGE_TO_SKILL_TYPE: Record<string, SkillType> = {
  aptitude_test: "APTITUDE",
  dsa_round: "LIVE_CODING",
  expert_interview: "INTERVIEW",
} as const;

export const SKILL_DISPLAY_NAMES: Record<string, string> = {
  APTITUDE: "Aptitude Verification",
  LIVE_CODING: "Live Coding Verification",
  INTERVIEW: "AI Interview Verification",
} as const;
