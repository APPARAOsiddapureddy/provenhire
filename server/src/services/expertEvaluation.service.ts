/** Human expert evaluation — PRD §8 weights and pass threshold. */

export const EXPERT_PASS_THRESHOLD = 70;
/** ₹250 per completed session */
export const EXPERT_EARNINGS_PAISE = 25_000;
export const HUMAN_EXPERT_RETRY_DAYS = 30;

const W_TECH = {
  technical_depth: 0.25,
  problem_solving: 0.2,
  authenticity: 0.15,
  real_world_exposure: 0.15,
  verification_consistency: 0.1,
  system_thinking: 0.08,
  communication: 0.07,
} as const;

const W_NONTECH = {
  domain_knowledge: 0.25,
  problem_solving_thinking: 0.2,
  authenticity: 0.15,
  real_world_experience: 0.15,
  verification_consistency: 0.1,
  strategic_thinking: 0.08,
  communication_clarity: 0.07,
} as const;

export type ExpertTrack = "technical" | "non_technical";

function num(v: unknown): number | undefined {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  return undefined;
}

/** Normalize POST body: supports PRD `scores` object, snake_case or camelCase, or legacy flat camelCase. */
export function extractDimensionScores(
  body: Record<string, unknown>,
  track: ExpertTrack
): { scores: Record<string, number>; missingKeys: string[] } {
  const raw = body.scores && typeof body.scores === "object" && body.scores !== null ? (body.scores as Record<string, unknown>) : body;

  const pick = (snake: string, ...camels: string[]): number | undefined => {
    const fromSnake = num(raw[snake]);
    if (fromSnake !== undefined) return fromSnake;
    for (const c of camels) {
      const v = num(raw[c]);
      if (v !== undefined) return v;
    }
    return undefined;
  };

  if (track === "technical") {
    const scores = {
      technical_depth: pick("technical_depth", "technicalDepth") ?? NaN,
      problem_solving: pick("problem_solving", "problemSolving") ?? NaN,
      authenticity: pick("authenticity") ?? NaN,
      real_world_exposure: pick("real_world_exposure", "realWorldExposure") ?? NaN,
      verification_consistency: pick("verification_consistency", "verificationConsistency") ?? NaN,
      system_thinking: pick("system_thinking", "systemThinking") ?? NaN,
      communication: pick("communication") ?? NaN,
    };
    const missingKeys = Object.entries(scores)
      .filter(([, v]) => !Number.isFinite(v) || v < 0 || v > 100)
      .map(([k]) => k);
    return { scores, missingKeys };
  }

  const scores = {
    domain_knowledge: pick("domain_knowledge", "domainKnowledge") ?? NaN,
    problem_solving_thinking: pick("problem_solving_thinking", "problemSolvingThinking", "problemSolving") ?? NaN,
    authenticity: pick("authenticity") ?? NaN,
    real_world_experience: pick("real_world_experience", "realWorldExperience") ?? NaN,
    verification_consistency: pick("verification_consistency", "verificationConsistency") ?? NaN,
    strategic_thinking: pick("strategic_thinking", "strategicThinking") ?? NaN,
    communication_clarity: pick("communication_clarity", "communicationClarity", "communication") ?? NaN,
  };
  const missingKeys = Object.entries(scores)
    .filter(([, v]) => !Number.isFinite(v) || v < 0 || v > 100)
    .map(([k]) => k);
  return { scores, missingKeys };
}

export function computeWeightedTotal(scores: Record<string, number>, track: ExpertTrack): number {
  const w = track === "technical" ? W_TECH : W_NONTECH;
  let total = 0;
  for (const [k, weight] of Object.entries(w)) {
    const v = scores[k];
    if (typeof v !== "number" || !Number.isFinite(v)) continue;
    total += v * weight;
  }
  return total;
}

export function persistableScorePayload(
  scores: Record<string, number>,
  track: ExpertTrack,
  weightedTotal: number
): Record<string, unknown> {
  return {
    track,
    dimensions: scores,
    weightedTotal: Math.round(weightedTotal * 100) / 100,
    weights: track === "technical" ? W_TECH : W_NONTECH,
  };
}
