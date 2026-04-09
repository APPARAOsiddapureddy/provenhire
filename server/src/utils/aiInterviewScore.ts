/** Aggregate 0–100 score + badge from Gemini evaluation JSON (AI interview). */
export function computeAiInterviewAggregateScore(
  payload: Record<string, unknown>,
  opts?: { nonTechnical?: boolean }
) {
  const concept =
    Number(payload.concept_score ?? NaN) ||
    Math.round(
      ((Number(payload.technical_accuracy || 0) + Number(payload.depth_of_knowledge || 0)) / 2) * 10,
    );
  const reasoning = Number(payload.reasoning_score ?? NaN) || Number(payload.problem_solving || 0) * 10;
  const communication =
    Number(payload.communication_score ?? NaN) || Number(payload.communication_clarity || 0) * 10;
  const confidence =
    Number(payload.confidence_score ?? NaN) ||
    (String(payload.confidence_level || "")
      .toLowerCase()
      .includes("high")
      ? 85
      : String(payload.confidence_level || "")
            .toLowerCase()
            .includes("medium")
        ? 70
        : 50);

  const nt = Boolean(opts?.nonTechnical);
  const wC = nt ? 0.3 : 0.4;
  const wR = nt ? 0.25 : 0.3;
  const wM = nt ? 0.3 : 0.2;
  const wF = nt ? 0.15 : 0.1;

  const total = Math.min(
    100,
    Math.max(0, Math.round(concept * wC + reasoning * wR + communication * wM + confidence * wF)),
  );
  let badge = "Not Verified";
  if (total >= 90) badge = "Elite Verified";
  else if (total >= 75) badge = "Gold Verified";
  else if (total >= 60) badge = "Silver Verified";
  return { total, badge };
}
