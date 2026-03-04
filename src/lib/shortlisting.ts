/**
 * PRD v4.1: Shortlisting algorithm after Stage 4 (AI Interview).
 * Combined score: Stage 2 (25%) + Stage 3 (35%) + Stage 4 (40%). Threshold >= 65%.
 * Only shortlisted candidates get Stage 5 (Human Expert Interview).
 */
import { api } from "@/lib/api";

const THRESHOLD_PCT = 65;
const WEIGHT_STAGE_2 = 0.25;
const WEIGHT_STAGE_3 = 0.35;
const WEIGHT_STAGE_4 = 0.4;

function toPct(value: number, total: number): number {
  if (!total) return 0;
  const pct = (value / total) * 100;
  return Math.min(100, Math.max(0, pct));
}

export interface ShortlistResult {
  shortlisted: boolean;
  combined_score_pct: number;
  stage_2_score_pct: number | null;
  stage_3_score_pct: number | null;
  stage_4_score_pct: number | null;
  threshold_pct: number;
}

export async function runShortlisting(userId: string): Promise<ShortlistResult> {
  const result: ShortlistResult = {
    shortlisted: false,
    combined_score_pct: 0,
    stage_2_score_pct: null,
    stage_3_score_pct: null,
    stage_4_score_pct: null,
    threshold_pct: THRESHOLD_PCT,
  };

  const [{ result: apt }, { result: dsa }, { interview: aiSession }] = await Promise.all([
    api.get<{ result: any }>("/api/verification/aptitude/latest"),
    api.get<{ result: any }>("/api/verification/dsa/latest"),
    api.get<{ interview: { totalScore?: number; totalQuestions?: number } | null }>("/api/interview/latest").catch(() => ({ interview: null })),
  ]);

  const s2Pct = apt
    ? apt.total_questions
      ? toPct(apt.total_score ?? 0, apt.total_questions)
      : Math.min(100, (apt.total_score ?? 0))
    : null;
  const s3Pct = dsa
    ? dsa.problems_attempted
      ? toPct(dsa.total_score ?? 0, Math.max(1, dsa.problems_attempted) * 100)
      : Math.min(100, Math.max(0, dsa.total_score ?? 0))
    : null;
  const s4Pct = aiSession ? Math.min(100, Math.max(0, aiSession.totalScore ?? 0)) : null;

  result.stage_2_score_pct = s2Pct;
  result.stage_3_score_pct = s3Pct;
  result.stage_4_score_pct = s4Pct;

  const s2 = s2Pct ?? 0;
  const s3 = s3Pct ?? 0;
  const s4 = s4Pct ?? 0;
  result.combined_score_pct = WEIGHT_STAGE_2 * s2 + WEIGHT_STAGE_3 * s3 + WEIGHT_STAGE_4 * s4;
  result.shortlisted = result.combined_score_pct >= THRESHOLD_PCT;

  if (result.shortlisted) {
    await api.post("/api/verification/stages/update", { stageName: "human_expert_interview", status: "in_progress" });
  }

  return result;
}

export async function getShortlistStatus(userId: string): Promise<ShortlistResult | null> {
  const result = await runShortlisting(userId);
  return result ?? null;
}
