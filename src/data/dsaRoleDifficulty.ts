/**
 * DSA question difficulty logic based on job role and experience level.
 * Role-based distribution is combined with experience-based adjustment.
 */
import type { DSAQuestion } from "./dsaQuestions";

export type DSARoleCategory = "developer" | "infrastructure" | "data" | "analytics" | "unknown";

/** Role keywords → category. First match wins. */
const ROLE_CATEGORIES: Record<DSARoleCategory, string[]> = {
  developer: [
    "frontend", "backend", "full stack", "fullstack", "software engineer", "sde",
    "system engineer", "platform engineer", "mobile", "qa"
  ],
  infrastructure: [
    "devops", "docker", "cloud engineer", "sre", "site reliability",
    "platform engineer"
  ],
  data: [
    "data scientist", "data engineer", "ml engineer", "machine learning",
    "ai engineer", "data "  // "Data" role
  ],
  analytics: [
    "data analyst", "business analyst", "product analyst", "marketing analyst"
  ],
  unknown: [],
};

/** Base difficulty by role category (E%, M%, H%). Analytics = no DSA. */
const ROLE_DISTRIBUTION: Record<DSARoleCategory, { easy: number; medium: number; hard: number } | null> = {
  developer: { easy: 20, medium: 50, hard: 30 },
  infrastructure: { easy: 50, medium: 40, hard: 10 },
  data: { easy: 80, medium: 20, hard: 0 },
  analytics: null,  // No DSA
  unknown: { easy: 40, medium: 40, hard: 20 },
};

/** Experience-based adjustment. Multipliers or override. */
const EXPERIENCE_DISTRIBUTION: Record<string, { easy: number; medium: number; hard: number }> = {
  "0-1": { easy: 70, medium: 30, hard: 0 },
  "1-3": { easy: 40, medium: 50, hard: 10 },
  "3-5": { easy: 20, medium: 50, hard: 30 },
  "5+": { easy: 10, medium: 40, hard: 50 },
};

export function getRoleCategory(jobTitle: string | null | undefined): DSARoleCategory {
  if (!jobTitle?.trim()) return "unknown";
  const t = jobTitle.toLowerCase();
  for (const [cat, keywords] of Object.entries(ROLE_CATEGORIES)) {
    if (cat === "unknown") continue;
    if (keywords.some((k) => t.includes(k))) return cat as DSARoleCategory;
  }
  return "unknown";
}

function getExperienceBucket(years: number): keyof typeof EXPERIENCE_DISTRIBUTION {
  if (years < 1) return "0-1";
  if (years <= 3) return "1-3";
  if (years <= 5) return "3-5";
  return "5+";
}

/** Combine role base + experience adjustment. Returns { easy, medium, hard } in 0–100. */
function getCombinedDistribution(
  jobTitle: string | null | undefined,
  experienceYears: number
): { easy: number; medium: number; hard: number } | null {
  const category = getRoleCategory(jobTitle);
  if (category === "analytics") return null;
  const roleDist = ROLE_DISTRIBUTION[category] ?? ROLE_DISTRIBUTION.unknown;
  if (!roleDist) return null;
  const expBucket = getExperienceBucket(experienceYears);
  const expDist = EXPERIENCE_DISTRIBUTION[expBucket];
  if (!expDist) return roleDist;
  // Blend: 60% role + 40% experience for combined distribution
  const blend = (a: number, b: number) => Math.round(a * 0.6 + b * 0.4);
  return {
    easy: blend(roleDist.easy, expDist.easy),
    medium: blend(roleDist.medium, expDist.medium),
    hard: blend(roleDist.hard, expDist.hard),
  };
}

/** Convert distribution % to counts for 6 questions (2+3+1 or 2+2+2 etc). We use 6 total for flexibility, then take top DSA_QUESTIONS_COUNT. */
function distributionToCounts(dist: { easy: number; medium: number; hard: number }, total: number): { easy: number; medium: number; hard: number } {
  const sum = dist.easy + dist.medium + dist.hard;
  if (sum <= 0) return { easy: total, medium: 0, hard: 0 };
  return {
    easy: Math.max(0, Math.round((dist.easy / sum) * total)),
    medium: Math.max(0, Math.round((dist.medium / sum) * total)),
    hard: Math.max(0, Math.round((dist.hard / sum) * total)),
  };
}

/**
 * Generate DSA questions based on job title and experience.
 * - Analytics roles: no DSA, returns [].
 * - Other roles: balanced set per role category + experience adjustment.
 * @param pool - Full question pool (from dsaQuestions.allDSAQuestions)
 * @param count - Number of questions to return (from dsaQuestions.DSA_QUESTIONS_COUNT)
 */
export function generateDSATestByRoleAndExperience(
  targetJobTitle: string | null | undefined,
  experienceYears: number,
  pool: DSAQuestion[],
  count: number
): DSAQuestion[] {
  const dist = getCombinedDistribution(targetJobTitle, experienceYears);
  if (!dist) return []; // Analytics or similar

  const byDiff = (d: "Easy" | "Medium" | "Hard") =>
    pool.filter((q) => q.difficulty === d).sort(() => Math.random() - 0.5);

  const counts = distributionToCounts(dist, count);
  const questions: DSAQuestion[] = [];
  questions.push(...byDiff("Easy").slice(0, counts.easy));
  questions.push(...byDiff("Medium").slice(0, counts.medium));
  questions.push(...byDiff("Hard").slice(0, counts.hard));
  return questions
    .sort(() => Math.random() - 0.5)
    .slice(0, count);
}
