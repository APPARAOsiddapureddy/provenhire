/**
 * PRD v4.1: Shortlisting algorithm after Stage 4 (AI Interview).
 * Combined score: Stage 2 (25%) + Stage 3 (35%) + Stage 4 (40%). Threshold >= 65%.
 * Only shortlisted candidates get Stage 5 (Human Expert Interview).
 */
import { supabase } from "@/integrations/supabase/client";

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

  const [
    { data: apt },
    { data: dsa },
    { data: aiSession },
  ] = await Promise.all([
    supabase
      .from("aptitude_test_results")
      .select("total_score, total_questions")
      .eq("user_id", userId)
      .eq("is_invalidated", false)
      .order("completed_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("dsa_round_results")
      .select("total_score, problems_attempted")
      .eq("user_id", userId)
      .eq("is_invalidated", false)
      .order("completed_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("ai_interview_sessions")
      .select("overall_score, total_questions")
      .eq("user_id", userId)
      .eq("status", "completed")
      .order("completed_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
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
  const s4Pct = aiSession
    ? aiSession.total_questions
      ? toPct(aiSession.overall_score ?? 0, aiSession.total_questions)
      : Math.min(100, (aiSession.overall_score ?? 0))
    : null;

  result.stage_2_score_pct = s2Pct;
  result.stage_3_score_pct = s3Pct;
  result.stage_4_score_pct = s4Pct;

  const s2 = s2Pct ?? 0;
  const s3 = s3Pct ?? 0;
  const s4 = s4Pct ?? 0;
  result.combined_score_pct = WEIGHT_STAGE_2 * s2 + WEIGHT_STAGE_3 * s3 + WEIGHT_STAGE_4 * s4;
  result.shortlisted = result.combined_score_pct >= THRESHOLD_PCT;

  const { error: insertErr } = await supabase.from("shortlist_results").insert({
    user_id: userId,
    stage_2_score_pct: s2Pct,
    stage_3_score_pct: s3Pct,
    stage_4_score_pct: s4Pct,
    combined_score_pct: result.combined_score_pct,
    shortlisted: result.shortlisted,
    threshold_pct: THRESHOLD_PCT,
  });
  if (insertErr) {
    // Table may not exist or RLS may block; still return computed result
  }

  if (result.shortlisted) {
    const { error: stageErr } = await supabase
      .from("verification_stages")
      .update({ status: "in_progress" })
      .eq("user_id", userId)
      .eq("stage_name", "human_expert_interview");
    if (stageErr) {
      // Stage may not exist; result still valid
    }
  }

  return result;
}

export async function getShortlistStatus(userId: string): Promise<ShortlistResult | null> {
  const { data } = await supabase
    .from("shortlist_results")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!data) return null;
  return {
    shortlisted: !!data.shortlisted,
    combined_score_pct: Number(data.combined_score_pct ?? 0),
    stage_2_score_pct: data.stage_2_score_pct != null ? Number(data.stage_2_score_pct) : null,
    stage_3_score_pct: data.stage_3_score_pct != null ? Number(data.stage_3_score_pct) : null,
    stage_4_score_pct: data.stage_4_score_pct != null ? Number(data.stage_4_score_pct) : null,
    threshold_pct: Number(data.threshold_pct ?? THRESHOLD_PCT),
  };
}
