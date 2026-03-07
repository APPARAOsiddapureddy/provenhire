import { api } from "@/lib/api";

export interface ShortlistResult {
  shortlisted: boolean;
  combined_score_pct: number;
  stage_2_score_pct: number | null;
  stage_3_score_pct: number | null;
  stage_4_score_pct: number | null;
  threshold_pct: number;
  // New scoring model fields (backward-compatible for existing UI)
  aptitude_score?: number;
  dsa_score?: number;
  ai_interview_score?: number;
  integrity_score?: number;
  final_score?: number;
  confidence_score?: number;
  ranking_score?: number;
  qualification_band?: string;
  risk_level?: string;
  candidate_status?: string;
  human_review_required?: boolean;
  gate_1_passed?: boolean;
  gate_2_passed?: boolean;
}

export async function runShortlisting(_userId: string): Promise<ShortlistResult> {
  const scorecard = await api.get<{
    shortlisted: boolean;
    aptitude_score: number;
    dsa_score: number;
    ai_interview_score: number;
    integrity_score: number;
    final_score: number;
    confidence_score: number;
    ranking_score: number;
    qualification_band: string;
    risk_level: string;
    candidate_status: string;
    human_review_required: boolean;
    gate_1_passed: boolean;
    gate_2_passed: boolean;
    threshold: number;
  }>("/api/verification/technical-scorecard");

  return {
    shortlisted: scorecard.shortlisted,
    combined_score_pct: scorecard.final_score,
    stage_2_score_pct: scorecard.aptitude_score,
    stage_3_score_pct: scorecard.dsa_score,
    stage_4_score_pct: scorecard.ai_interview_score,
    threshold_pct: scorecard.threshold,
    aptitude_score: scorecard.aptitude_score,
    dsa_score: scorecard.dsa_score,
    ai_interview_score: scorecard.ai_interview_score,
    integrity_score: scorecard.integrity_score,
    final_score: scorecard.final_score,
    confidence_score: scorecard.confidence_score,
    ranking_score: scorecard.ranking_score,
    qualification_band: scorecard.qualification_band,
    risk_level: scorecard.risk_level,
    candidate_status: scorecard.candidate_status,
    human_review_required: scorecard.human_review_required,
    gate_1_passed: scorecard.gate_1_passed,
    gate_2_passed: scorecard.gate_2_passed,
  };
}

export async function getShortlistStatus(userId: string): Promise<ShortlistResult | null> {
  const result = await runShortlisting(userId);
  return result ?? null;
}
