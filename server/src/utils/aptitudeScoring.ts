/**
 * Shared aptitude result scoring (used by verification routes + lockout).
 */

export type AptitudeAnswersJson = {
  totalMarks?: number;
  earnedMarks?: number;
  correct?: number;
  questions?: number;
  reason?: string;
};

/**
 * AptitudeTestResult.score is normally **raw earned marks**; answers.totalMarks / earnedMarks come from POST /aptitude.
 * Legacy rows may store **0–100 percent** in score with empty answers.
 */
export function buildAptitudeLatestResult(row: { score: number | null; answers: unknown }): {
  total_score: number;
  total_marks: number;
  percentage: number;
  score: number;
} {
  const answers = (row.answers ?? null) as AptitudeAnswersJson | null;
  const totalFromAnswers =
    typeof answers?.totalMarks === "number" && answers.totalMarks > 0 ? answers.totalMarks : null;
  const earnedFromAnswers = typeof answers?.earnedMarks === "number" ? answers.earnedMarks : null;
  const stored = row.score ?? 0;

  if (totalFromAnswers != null) {
    const earned = earnedFromAnswers != null ? earnedFromAnswers : stored;
    const percentage = Math.min(100, Math.max(0, Math.round((earned / totalFromAnswers) * 100)));
    return {
      total_score: earned,
      total_marks: totalFromAnswers,
      percentage,
      score: earned,
    };
  }

  const percentage = Math.min(100, Math.max(0, Math.round(stored)));
  return {
    total_score: percentage,
    total_marks: 100,
    percentage,
    score: percentage,
  };
}

/** True if this stored attempt counts as a pass (≥ 60%) and was not invalidated. */
export function isAptitudeAttemptPassed(row: { invalidated: boolean; score: number | null; answers: unknown }): boolean {
  if (row.invalidated) return false;
  const answers = (row.answers ?? null) as AptitudeAnswersJson | null;
  if (answers?.reason === "invalidated") return false;
  const built = buildAptitudeLatestResult(row);
  return built.percentage >= 60;
}

/** Count consecutive failures from the most recent attempt backward (results must be newest-first). */
export function countConsecutiveAptitudeFailures(
  rows: { invalidated: boolean; score: number | null; answers: unknown }[],
): number {
  let n = 0;
  for (const row of rows) {
    if (isAptitudeAttemptPassed(row)) break;
    n++;
  }
  return n;
}
