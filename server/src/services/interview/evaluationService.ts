/**
 * Coverage + calibration helpers for adversarial interview final evaluation.
 */
export function computeWeaknessCoverageRatio(
  weaknesses: { type?: string }[],
  questionTurnCount: number
): number {
  if (questionTurnCount <= 0) return 0;
  const types = new Set(
    weaknesses.map((w) => String(w.type || "").trim()).filter((t) => t.length > 0)
  );
  return Math.min(1, types.size / questionTurnCount);
}
