import { prisma } from "../config/prisma.js";

export type QualificationBand =
  | "Exceptional"
  | "Strong"
  | "Qualified"
  | "Borderline"
  | "Not Qualified";

export interface TechnicalScorecard {
  candidate_id: string;
  aptitude_score: number;
  dsa_score: number;
  ai_interview_score: number;
  integrity_score: number;
  final_score: number;
  confidence_score: number;
  ranking_score: number;
  qualification_band: QualificationBand;
  risk_level: "clean" | "suspicious" | "high_risk";
  shortlisted: boolean;
  gate_1_passed: boolean;
  gate_2_passed: boolean;
  human_review_required: boolean;
  candidate_status: "qualified" | "not_qualified" | "integrity_risk";
  threshold: number;
  components: {
    aptitude: { accuracy: number; speed_percentile: number; consistency_score: number };
    dsa: { test_case_score: number; algorithm_efficiency_score: number; code_quality_score: number };
    ai: { concept_score: number; communication_score: number; reasoning_score: number; confidence_score: number };
    integrity: { deductions: Record<string, number>; total_deduction: number };
    retries: number;
    stage_score_variance: number;
  };
}

const INTEGRITY_DEDUCTIONS: Record<string, number> = {
  TAB_SWITCH: 5,
  WINDOW_FOCUS_LOST: 3,
  FULLSCREEN_EXIT: 5,
  COPY_PASTE_ATTEMPT: 10,
  DEVTOOLS_OPENED: 15,
  NO_FACE_DETECTED: 10,
  MULTIPLE_FACES_DETECTED: 25,
  LOOKING_AWAY_FROM_SCREEN: 5,
  PHONE_DETECTED: 30,
  MULTIPLE_VOICES_DETECTED: 20,
  MICROPHONE_MUTED_ATTEMPT: 10,
};

const round2 = (n: number) => Math.round(n * 100) / 100;
const clamp = (n: number, min = 0, max = 100) => Math.min(max, Math.max(min, n));

function computeBand(score: number): QualificationBand {
  if (score >= 85) return "Exceptional";
  if (score >= 75) return "Strong";
  if (score >= 70) return "Qualified";
  if (score >= 60) return "Borderline";
  return "Not Qualified";
}

function computeVariance(values: number[]): number {
  if (!values.length) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  return values.reduce((acc, v) => acc + (v - mean) ** 2, 0) / values.length;
}

function riskLevelFromIntegrity(integrityScore: number): "clean" | "suspicious" | "high_risk" {
  if (integrityScore < 50) return "high_risk";
  if (integrityScore < 80) return "suspicious";
  return "clean";
}

function extractNumeric(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function extractAptitudeSignals(aptitude: { score: number | null; answers: unknown } | null) {
  const score = clamp(extractNumeric(aptitude?.score, 0));
  const answers = (aptitude?.answers ?? {}) as Record<string, unknown>;
  const totalMarks = extractNumeric((answers as { totalMarks?: unknown }).totalMarks, 100) || 100;
  const earnedMarks = extractNumeric((answers as { earnedMarks?: unknown }).earnedMarks, score);
  const accuracy = clamp((earnedMarks / totalMarks) * 100);

  const timeTakenSeconds = extractNumeric((answers as { timeTakenSeconds?: unknown }).timeTakenSeconds, 0);
  const timeLimitSeconds = extractNumeric((answers as { timeLimitSeconds?: unknown }).timeLimitSeconds, 0);
  const speedPercentile =
    timeTakenSeconds > 0 && timeLimitSeconds > 0
      ? clamp((1 - timeTakenSeconds / timeLimitSeconds) * 100)
      : 50;

  let consistencyScore = 100;
  if (accuracy < 40 && speedPercentile > 70) consistencyScore = 30;
  else if (accuracy < 55 && speedPercentile > 65) consistencyScore = 50;
  else if (accuracy < 70 && speedPercentile > 75) consistencyScore = 70;

  const aptitudeScore = round2(accuracy * 0.7 + speedPercentile * 0.2 + consistencyScore * 0.1);
  return { aptitudeScore, accuracy: round2(accuracy), speedPercentile: round2(speedPercentile), consistencyScore };
}

function scoreAlgorithmEfficiency(code: string): number {
  const raw = code || "";
  if (!raw.trim()) return 0;
  const loopMatches = raw.match(/\b(for|while)\b/g)?.length ?? 0;
  const nestedLoopHint = /\bfor\b[\s\S]{0,200}\bfor\b|\bwhile\b[\s\S]{0,200}\bwhile\b/.test(raw);
  const recursionHint = /\bfunction\b[^{]*\{[\s\S]*\breturn\b[\s\S]*\b\w+\(/.test(raw);
  let score = 85;
  if (loopMatches >= 4) score -= 20;
  else if (loopMatches >= 2) score -= 10;
  if (nestedLoopHint) score -= 15;
  if (recursionHint) score += 5;
  return clamp(score);
}

function scoreCodeQuality(code: string): number {
  const raw = code || "";
  if (!raw.trim()) return 0;
  const lines = raw.split("\n").map((l) => l.trim());
  const nonEmpty = lines.filter(Boolean);
  const avgLen = nonEmpty.length ? nonEmpty.reduce((s, l) => s + l.length, 0) / nonEmpty.length : 0;
  const hasComments = /#|\/\/|\/\*/.test(raw);
  const hasMeaningfulNames = /\b(result|count|index|current|total|ans|output)\b/i.test(raw);
  let score = 70;
  if (avgLen < 80) score += 10;
  if (hasComments) score += 10;
  if (hasMeaningfulNames) score += 10;
  return clamp(score);
}

function extractDsaSignals(dsa: { score: number | null; answers: unknown } | null) {
  const answers = (dsa?.answers ?? {}) as Record<string, { score?: unknown; code?: unknown }>;
  const entries = Object.values(answers ?? {});
  const questionCount = entries.length || 3;
  const perQuestionScores = entries.map((e) => clamp(extractNumeric(e?.score, 0)));
  const testCaseScore =
    perQuestionScores.length > 0
      ? round2(perQuestionScores.reduce((a, b) => a + b, 0) / perQuestionScores.length)
      : clamp(extractNumeric(dsa?.score, 0));
  const efficiencyScores = entries.map((e) => scoreAlgorithmEfficiency(String(e?.code ?? "")));
  const qualityScores = entries.map((e) => scoreCodeQuality(String(e?.code ?? "")));
  const algorithmEfficiencyScore =
    efficiencyScores.length > 0
      ? round2(efficiencyScores.reduce((a, b) => a + b, 0) / efficiencyScores.length)
      : 60;
  const codeQualityScore =
    qualityScores.length > 0 ? round2(qualityScores.reduce((a, b) => a + b, 0) / qualityScores.length) : 60;
  const dsaScore = round2(testCaseScore * 0.6 + algorithmEfficiencyScore * 0.25 + codeQualityScore * 0.15);
  return {
    dsaScore,
    testCaseScore,
    algorithmEfficiencyScore,
    codeQualityScore,
    questionCount,
  };
}

function extractAiSignals(interview: { scoreBreakdown: unknown; totalScore: number | null } | null) {
  const breakdown = (interview?.scoreBreakdown ?? {}) as Record<string, unknown>;
  const technicalAccuracy = clamp(extractNumeric(breakdown.technical_accuracy, 0) * 10);
  const depth = clamp(extractNumeric(breakdown.depth_of_knowledge, 0) * 10);
  const reasoning = clamp(extractNumeric(breakdown.problem_solving, 0) * 10);
  const communication = clamp(extractNumeric(breakdown.communication_clarity, 0) * 10);
  const confidenceRaw = String(breakdown.confidence_level ?? "").toLowerCase();
  const confidenceScore = confidenceRaw.includes("high")
    ? 85
    : confidenceRaw.includes("medium")
      ? 70
      : confidenceRaw.includes("low")
        ? 50
        : 65;
  const conceptScore = round2((technicalAccuracy + depth) / 2);
  const aiInterviewScore = round2(conceptScore * 0.4 + reasoning * 0.3 + communication * 0.2 + confidenceScore * 0.1);
  const fallback = clamp(extractNumeric(interview?.totalScore, aiInterviewScore));
  return {
    aiInterviewScore: aiInterviewScore || fallback,
    conceptScore,
    communicationScore: round2(communication),
    reasoningScore: round2(reasoning),
    confidenceScore: round2(confidenceScore),
  };
}

function extractIntegritySignals(events: Array<{ type: string }>) {
  let totalDeduction = 0;
  const deductions: Record<string, number> = {};
  for (const e of events) {
    const key = e.type || "";
    const deduction = INTEGRITY_DEDUCTIONS[key] ?? 0;
    if (!deduction) continue;
    deductions[key] = (deductions[key] ?? 0) + deduction;
    totalDeduction += deduction;
  }
  const integrityScore = clamp(100 - totalDeduction, 0, 100);
  return { integrityScore: round2(integrityScore), deductions, totalDeduction };
}

export async function buildTechnicalScorecard(userId: string): Promise<TechnicalScorecard> {
  const [aptitudeLatest, dsaLatest, interviewLatest, proctoringEvents, aptitudeCount, dsaCount, interviewCount] =
    await Promise.all([
      prisma.aptitudeTestResult.findFirst({
        where: { userId },
        orderBy: { completedAt: "desc" },
        select: { score: true, answers: true },
      }),
      prisma.dsaRoundResult.findFirst({
        where: { userId },
        orderBy: { completedAt: "desc" },
        select: { score: true, answers: true },
      }),
      prisma.interview.findFirst({
        where: { userId, status: "completed" },
        orderBy: { completedAt: "desc" },
        select: { totalScore: true, scoreBreakdown: true },
      }),
      prisma.proctoringEvent.findMany({
        where: { userId, testType: { in: ["aptitude", "dsa", "ai_interview"] } },
        orderBy: { createdAt: "desc" },
        take: 500,
        select: { type: true },
      }),
      prisma.aptitudeTestResult.count({ where: { userId } }),
      prisma.dsaRoundResult.count({ where: { userId } }),
      prisma.interview.count({ where: { userId, status: "completed" } }),
    ]);

  const aptitudeSignals = extractAptitudeSignals(aptitudeLatest);
  const dsaSignals = extractDsaSignals(dsaLatest);
  const aiSignals = extractAiSignals(interviewLatest);
  const integritySignals = extractIntegritySignals(proctoringEvents);

  const finalScore = round2(
    aptitudeSignals.aptitudeScore * 0.25 +
      dsaSignals.dsaScore * 0.35 +
      aiSignals.aiInterviewScore * 0.3 +
      integritySignals.integrityScore * 0.1
  );

  const retryCount = Math.max(0, aptitudeCount - 1) + Math.max(0, dsaCount - 1) + Math.max(0, interviewCount - 1);
  const stageVariance = computeVariance([aptitudeSignals.aptitudeScore, dsaSignals.dsaScore, aiSignals.aiInterviewScore]);
  const integrityRiskPoints = 100 - integritySignals.integrityScore;
  const confidenceScore = clamp(100 - retryCount * 5 - integrityRiskPoints * 0.3 - stageVariance * 0.2, 0, 100);
  const rankingScore = round2(finalScore * (confidenceScore / 100));
  const riskLevel = riskLevelFromIntegrity(integritySignals.integrityScore);

  const gate1Passed =
    aptitudeSignals.aptitudeScore >= 55 && dsaSignals.dsaScore >= 60 && aiSignals.aiInterviewScore >= 60;
  const gate2Passed = finalScore >= 70;
  const integrityOverride = integritySignals.integrityScore < 50;

  const shortlisted = gate1Passed && gate2Passed && !integrityOverride;
  const candidateStatus: TechnicalScorecard["candidate_status"] = integrityOverride
    ? "integrity_risk"
    : shortlisted
      ? "qualified"
      : "not_qualified";

  return {
    candidate_id: userId,
    aptitude_score: round2(aptitudeSignals.aptitudeScore),
    dsa_score: round2(dsaSignals.dsaScore),
    ai_interview_score: round2(aiSignals.aiInterviewScore),
    integrity_score: round2(integritySignals.integrityScore),
    final_score: round2(finalScore),
    confidence_score: round2(confidenceScore),
    ranking_score: round2(rankingScore),
    qualification_band: computeBand(finalScore),
    risk_level: riskLevel,
    shortlisted,
    gate_1_passed: gate1Passed,
    gate_2_passed: gate2Passed,
    human_review_required: integrityOverride || integritySignals.integrityScore < 60,
    candidate_status: candidateStatus,
    threshold: 70,
    components: {
      aptitude: {
        accuracy: aptitudeSignals.accuracy,
        speed_percentile: aptitudeSignals.speedPercentile,
        consistency_score: aptitudeSignals.consistencyScore,
      },
      dsa: {
        test_case_score: dsaSignals.testCaseScore,
        algorithm_efficiency_score: dsaSignals.algorithmEfficiencyScore,
        code_quality_score: dsaSignals.codeQualityScore,
      },
      ai: {
        concept_score: aiSignals.conceptScore,
        communication_score: aiSignals.communicationScore,
        reasoning_score: aiSignals.reasoningScore,
        confidence_score: aiSignals.confidenceScore,
      },
      integrity: {
        deductions: integritySignals.deductions,
        total_deduction: integritySignals.totalDeduction,
      },
      retries: retryCount,
      stage_score_variance: round2(stageVariance),
    },
  };
}
