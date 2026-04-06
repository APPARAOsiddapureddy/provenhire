/**
 * Coverage + calibration helpers + multi-pass final evaluation merge for adversarial interviews.
 */
import { evaluateFullInterview } from "./agents.js";

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

const CLAIM_RANK: Record<string, number> = { none: 0, low: 1, medium: 2, high: 3 };

function norm100(e: Record<string, unknown>): number {
  const overallRaw = Number(e.overall_score);
  if (!Number.isFinite(overallRaw)) return 50;
  return overallRaw <= 10.5 ? Math.round(overallRaw * 10) : Math.round(Math.min(100, overallRaw));
}

function avg(nums: number[]): number {
  if (!nums.length) return 0;
  return Math.round(nums.reduce((a, b) => a + b, 0) / nums.length);
}

function strictestClaim(valid: Record<string, unknown>[]): string {
  let best = "none";
  let bestR = 0;
  for (const r of valid) {
    const c = String(r.claim_credibility_risk ?? "none").toLowerCase();
    const rank = CLAIM_RANK[c] ?? 0;
    if (rank > bestR) {
      bestR = rank;
      best = CLAIM_RANK[c] != null ? c : "none";
    }
  }
  return best;
}

function mergeList(valid: Record<string, unknown>[], key: "strengths" | "weaknesses", limit: number): string[] {
  const freq = new Map<string, number>();
  for (const r of valid) {
    const arr = r[key];
    if (!Array.isArray(arr)) continue;
    for (const s of arr) {
      const t = String(s).trim();
      if (!t) continue;
      freq.set(t, (freq.get(t) ?? 0) + 1);
    }
  }
  return [...freq.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit).map(([s]) => s);
}

type History = Parameters<typeof evaluateFullInterview>[0];
type Weaknesses = Parameters<typeof evaluateFullInterview>[2];
type Reasoning = Parameters<typeof evaluateFullInterview>[3];
type Meta = Parameters<typeof evaluateFullInterview>[4];

export async function evaluateFullInterviewMultiPass(
  history: History,
  resume: string,
  weaknesses: Weaknesses,
  reasoningSignals: Reasoning,
  meta?: Meta
): Promise<{
  evaluation: Record<string, unknown>;
  passCount: number;
  scoreVariance: number[];
}> {
  const results = await Promise.all([
    evaluateFullInterview(history, resume, weaknesses, reasoningSignals, meta),
    evaluateFullInterview(history, resume, weaknesses, reasoningSignals, meta),
    evaluateFullInterview(history, resume, weaknesses, reasoningSignals, meta),
  ]);

  const valid = results.filter((r): r is Record<string, unknown> => r != null && typeof r === "object");
  if (valid.length === 0) {
    return {
      evaluation: {
        overall_score: 5,
        final_verdict: "Evaluation completed; detailed scoring unavailable.",
        strengths: [],
        weaknesses: ["Continue practicing structured technical explanations."],
        authenticity_concern: false,
        authenticity_reason: "",
        claim_credibility_risk: "none",
        engineering_signal: "inconclusive",
        confidence_calibrated: false,
      },
      passCount: 0,
      scoreVariance: [],
    };
  }

  const scores100 = valid.map(norm100);
  const avg100 = Math.min(100, Math.max(0, avg(scores100)));
  const overallForJson = avg100 / 10;

  const closest = valid.reduce((prev, curr) =>
    Math.abs(norm100(curr) - avg100) < Math.abs(norm100(prev) - avg100) ? curr : prev
  );

  const avgBreakdownDim = (path: string): number | null => {
    const vals: number[] = [];
    for (const r of valid) {
      const b = r.breakdown as Record<string, unknown> | undefined;
      const v = Number(b?.[path]);
      if (Number.isFinite(v)) vals.push(v);
    }
    return vals.length ? avg(vals) : null;
  };

  const b = (closest.breakdown as Record<string, unknown>) || {};

  const merged: Record<string, unknown> = {
    ...closest,
    overall_score: overallForJson,
    claim_credibility_risk: strictestClaim(valid),
    strengths: mergeList(valid, "strengths", 5),
    weaknesses: mergeList(valid, "weaknesses", 5),
    authenticity_concern: valid.some((r) => Boolean(r.authenticity_concern)),
    evaluation_pass_count: valid.length,
    evaluation_score_variance: scores100,
  };

  merged.breakdown = {
    reasoning: avgBreakdownDim("reasoning") ?? b.reasoning,
    technical_depth: avgBreakdownDim("technical_depth") ?? b.technical_depth,
    communication: avgBreakdownDim("communication") ?? b.communication,
    adaptability: avgBreakdownDim("adaptability") ?? b.adaptability,
  };

  for (const key of ["concept_score", "reasoning_score", "communication_score", "confidence_score"] as const) {
    const vals = valid.map((r) => Number(r[key])).filter((n) => Number.isFinite(n));
    if (vals.length) merged[key] = avg(vals);
  }

  if (closest.authenticity_reason != null) {
    merged.authenticity_reason = closest.authenticity_reason;
  }

  return { evaluation: merged, passCount: valid.length, scoreVariance: scores100 };
}
