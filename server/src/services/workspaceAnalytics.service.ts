import type { WorkspaceRoundAttemptStatus, WorkspaceRoundType } from "@prisma/client";
import { prisma } from "../config/prisma.js";
import {
  assertCanManageWorkspace,
  type WorkspaceActor,
} from "./workspaceRegistration.service.js";
import {
  SCORE_BAND_BOTTOM_PERCENTILE,
  SCORE_BAND_TOP_PERCENTILE,
  WORKSPACE_ANALYTICS_CACHE_TTL_MS,
  WORKSPACE_INTERVIEW_RETAKE_BAND,
  WORKSPACE_ROUND_RETAKE_THRESHOLD_PERCENT,
} from "../constants/workspaceAnalytics.js";

const COMPLETED_STATUSES: WorkspaceRoundAttemptStatus[] = ["completed", "auto_completed"];
const WEAK_CATEGORY_SCORE_THRESHOLD = 60;

const ROUND_LABELS: Record<WorkspaceRoundType, string> = {
  mcq: "Aptitude",
  coding: "Coding",
  sql: "SQL",
  interview: "AI Interview",
};

// The 8 fixed dimension keys on a Placement Readiness scorecard - see
// Tier -4/shared/contracts.ts (dimensionKeys). No shared package exists
// between the two repos, so this list is hand-mirrored.
const INTERVIEW_DIMENSION_KEYS = [
  "communication_clarity",
  "answer_structure",
  "project_ownership",
  "programming_logic",
  "cs_fundamentals",
  "practical_reasoning",
  "hr_professional_readiness",
  "role_specific_readiness",
] as const;

export type ModuleCategoryStat = {
  name: string;
  avgScore: number;
  sampleSize: number;
  weakCandidateCount?: number;
};

export type ModuleSummary = {
  configured: boolean;
  attemptedCount: number;
  completedCount: number;
  avgPercentageScore: number | null;
  bands: { top: number; mid: number; bottom: number };
  categories: ModuleCategoryStat[];
};

export type RetakeEntry = {
  userId: string;
  name: string;
  email: string;
  roundType: WorkspaceRoundType;
  roundLabel: string;
  reason: "incomplete" | "below_threshold";
  detail: string;
};

export type WorkspaceAnalyticsSnapshot = {
  workspace: { id: string; name: string; code: string; totalCandidates: number };
  generatedAt: string;
  readiness: { ready: number; incomplete: number; belowThreshold: number };
  modules: Record<WorkspaceRoundType, ModuleSummary>;
  retakeList: RetakeEntry[];
};

type AttemptRow = {
  userId: string;
  roundType: WorkspaceRoundType;
  status: WorkspaceRoundAttemptStatus;
  percentageScore: number | null;
  weightedScore: number | null;
  completedAt: Date | null;
  mcqSessionId: string | null;
};

type DsaDifficultyRow = { difficulty: string; attempted: number; fullyPassed: number };
type SqlBreakdownRow = { subtrack: string; difficulty: string; attempted: number; fullyPassed: number };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isCompleted(status: WorkspaceRoundAttemptStatus): boolean {
  return COMPLETED_STATUSES.includes(status);
}

function quantile(sortedAsc: number[], p: number): number {
  if (sortedAsc.length === 1) return sortedAsc[0];
  const idx = (sortedAsc.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sortedAsc[lo];
  return sortedAsc[lo] + (sortedAsc[hi] - sortedAsc[lo]) * (idx - lo);
}

function bandCounts(scores: number[]): { top: number; mid: number; bottom: number } {
  if (scores.length === 0) return { top: 0, mid: 0, bottom: 0 };
  const sorted = [...scores].sort((a, b) => a - b);
  const bottomCutoff = quantile(sorted, SCORE_BAND_BOTTOM_PERCENTILE);
  const topCutoff = quantile(sorted, SCORE_BAND_TOP_PERCENTILE);
  let top = 0;
  let mid = 0;
  let bottom = 0;
  for (const score of scores) {
    if (score >= topCutoff) top += 1;
    else if (score <= bottomCutoff) bottom += 1;
    else mid += 1;
  }
  return { top, mid, bottom };
}

// Mirrors the per-question domain/outcome extraction already used for a
// single candidate in getWorkspaceCandidateDossier (workspaceAptitudeEvidence
// categories), batched across every completed MCQ session in the workspace.
function extractAptitudeDomainStats(
  sessions: { questions: unknown; answerKey: unknown; answers: unknown }[],
): ModuleCategoryStat[] {
  const ledger = new Map<string, { correctMarks: number; totalMarks: number; candidateScores: number[] }>();
  for (const session of sessions) {
    const questions = Array.isArray(session.questions) ? session.questions : [];
    const answerKey = isRecord(session.answerKey) ? session.answerKey : {};
    const answers = isRecord(session.answers) ? session.answers : {};
    const perSessionDomain = new Map<string, { correctMarks: number; totalMarks: number }>();
    questions.forEach((raw, index) => {
      const question = isRecord(raw) ? raw : {};
      const domain =
        typeof question.domain === "string" && question.domain.trim() ? question.domain.trim() : null;
      if (!domain) return;
      const id = String(question.id ?? index);
      const selectedAnswer = typeof answers[id] === "string" ? String(answers[id]) : "";
      const correctAnswer = typeof answerKey[id] === "string" ? String(answerKey[id]) : "";
      const marks = Math.max(0, Number(question.marks ?? 1));
      const outcome =
        selectedAnswer && selectedAnswer.trim().toLowerCase() === correctAnswer.trim().toLowerCase()
          ? "correct"
          : "other";
      const current = perSessionDomain.get(domain) ?? { correctMarks: 0, totalMarks: 0 };
      current.totalMarks += marks;
      if (outcome === "correct") current.correctMarks += marks;
      perSessionDomain.set(domain, current);
    });
    for (const [domain, { correctMarks, totalMarks }] of perSessionDomain) {
      const entry = ledger.get(domain) ?? { correctMarks: 0, totalMarks: 0, candidateScores: [] };
      entry.correctMarks += correctMarks;
      entry.totalMarks += totalMarks;
      if (totalMarks > 0) entry.candidateScores.push(Math.round((correctMarks / totalMarks) * 100));
      ledger.set(domain, entry);
    }
  }
  return Array.from(ledger.entries())
    .map(([name, entry]) => ({
      name,
      avgScore: entry.totalMarks ? Math.round((entry.correctMarks / entry.totalMarks) * 100) : 0,
      sampleSize: entry.candidateScores.length,
      weakCandidateCount: entry.candidateScores.filter((s) => s < WEAK_CATEGORY_SCORE_THRESHOLD).length,
    }))
    .sort((a, b) => a.avgScore - b.avgScore);
}

function extractInterviewDimensionStats(
  artifacts: { artifact: unknown }[],
): ModuleCategoryStat[] {
  const ledger = new Map<string, number[]>();
  for (const { artifact } of artifacts) {
    if (!isRecord(artifact)) continue;
    const scorecard = isRecord(artifact.scorecard) ? artifact.scorecard : {};
    const dimensionScores = isRecord(scorecard.dimensionScores) ? scorecard.dimensionScores : {};
    for (const key of INTERVIEW_DIMENSION_KEYS) {
      const value = Number(dimensionScores[key]);
      if (!Number.isFinite(value)) continue;
      const scores = ledger.get(key) ?? [];
      scores.push(value);
      ledger.set(key, scores);
    }
  }
  return Array.from(ledger.entries())
    .map(([name, scores]) => ({
      name,
      avgScore: Math.round(scores.reduce((sum, s) => sum + s, 0) / scores.length),
      sampleSize: scores.length,
      weakCandidateCount: scores.filter((s) => s < WEAK_CATEGORY_SCORE_THRESHOLD).length,
    }))
    .sort((a, b) => a.avgScore - b.avgScore);
}

function moduleSummaryFor(
  type: WorkspaceRoundType,
  configuredRoundTypes: Set<WorkspaceRoundType>,
  attempts: AttemptRow[],
  categories: ModuleCategoryStat[],
): ModuleSummary {
  const forType = attempts.filter((a) => a.roundType === type);
  const completed = forType.filter((a) => isCompleted(a.status));
  const scores = completed
    .map((a) => a.percentageScore)
    .filter((s): s is number => s !== null);
  const avg = scores.length
    ? Math.round(scores.reduce((sum, s) => sum + s, 0) / scores.length)
    : null;
  return {
    configured: configuredRoundTypes.has(type),
    attemptedCount: forType.length,
    completedCount: completed.length,
    avgPercentageScore: avg,
    bands: bandCounts(scores),
    categories,
  };
}

async function computeWorkspaceAnalytics(workspaceId: string): Promise<WorkspaceAnalyticsSnapshot> {
  const [workspace, workspaceRounds, roster, attempts, dsaBreakdown, sqlBreakdown, interviewArtifacts] =
    await Promise.all([
      prisma.workspace.findUniqueOrThrow({
        where: { id: workspaceId },
        select: { id: true, name: true, code: true },
      }),
      prisma.workspaceRound.findMany({ where: { workspaceId }, select: { type: true } }),
      prisma.workspaceRegistration.findMany({
        where: { workspaceId, status: "registered" },
        select: {
          userId: true,
          user: {
            select: { email: true, name: true, jobSeekerProfile: { select: { fullName: true } } },
          },
        },
      }),
      prisma.workspaceRoundAttempt.findMany({
        where: { workspaceId },
        select: {
          userId: true,
          roundType: true,
          status: true,
          percentageScore: true,
          weightedScore: true,
          completedAt: true,
          mcqSessionId: true,
        },
      }),
      prisma.$queryRaw<DsaDifficultyRow[]>`
        SELECT dq."difficulty" AS "difficulty",
               COUNT(*)::int AS "attempted",
               COUNT(*) FILTER (WHERE ds."passedCount" = ds."totalCount")::int AS "fullyPassed"
        FROM "WorkspaceRoundAttempt" wra
        JOIN "DsaSubmission" ds ON ds."roundSessionId" = wra."dsaRoundSessionId" AND ds."isOfficial" = true
        JOIN "DsaQuestion" dq ON dq."id" = ds."questionId"
        WHERE wra."workspaceId" = ${workspaceId} AND wra."roundType" = 'coding'
          AND wra."status" IN ('completed', 'auto_completed')
        GROUP BY dq."difficulty"
      `,
      prisma.$queryRaw<SqlBreakdownRow[]>`
        SELECT COALESCE(drt."subtrack", 'general') AS "subtrack", drt."difficulty" AS "difficulty",
               COUNT(*)::int AS "attempted",
               COUNT(*) FILTER (WHERE wss."passedCount" = wss."totalCount")::int AS "fullyPassed"
        FROM "WorkspaceRoundAttempt" wra
        JOIN "WorkspaceSqlSubmission" wss ON wss."sessionId" = wra."sqlSessionId" AND wss."isOfficial" = true
        JOIN "DataRoundTask" drt ON drt."id" = wss."taskId"
        WHERE wra."workspaceId" = ${workspaceId} AND wra."roundType" = 'sql'
          AND wra."status" IN ('completed', 'auto_completed')
        GROUP BY drt."subtrack", drt."difficulty"
      `,
      prisma.placementReadinessArtifact.findMany({
        where: { workspaceId },
        select: { userId: true, artifact: true },
      }),
    ]);

  const configuredRoundTypes = new Set(workspaceRounds.map((r) => r.type));

  const mcqSessionIds = attempts
    .filter((a) => a.roundType === "mcq" && isCompleted(a.status) && a.mcqSessionId)
    .map((a) => a.mcqSessionId as string);
  const mcqSessions = mcqSessionIds.length
    ? await prisma.mcqSession.findMany({
        where: { id: { in: mcqSessionIds } },
        select: { questions: true, answerKey: true, answers: true },
      })
    : [];

  const attemptsByUser = new Map<string, Map<WorkspaceRoundType, AttemptRow>>();
  for (const attempt of attempts) {
    const byType = attemptsByUser.get(attempt.userId) ?? new Map<WorkspaceRoundType, AttemptRow>();
    byType.set(attempt.roundType, attempt);
    attemptsByUser.set(attempt.userId, byType);
  }

  const interviewBandByUser = new Map<string, string>();
  for (const { userId, artifact } of interviewArtifacts) {
    if (!isRecord(artifact)) continue;
    const scorecard = isRecord(artifact.scorecard) ? artifact.scorecard : {};
    if (typeof scorecard.readinessBand === "string") {
      interviewBandByUser.set(userId, scorecard.readinessBand);
    }
  }

  let ready = 0;
  let incomplete = 0;
  let belowThreshold = 0;
  const retakeList: RetakeEntry[] = [];

  for (const registration of roster) {
    const name =
      registration.user.jobSeekerProfile?.fullName || registration.user.name || registration.user.email;
    const byType = attemptsByUser.get(registration.userId) ?? new Map<WorkspaceRoundType, AttemptRow>();
    let candidateIncomplete = false;
    let candidateBelowThreshold = false;

    for (const type of configuredRoundTypes) {
      const attempt = byType.get(type);
      const completed = attempt && isCompleted(attempt.status);
      if (!completed) {
        candidateIncomplete = true;
        retakeList.push({
          userId: registration.userId,
          name,
          email: registration.user.email,
          roundType: type,
          roundLabel: ROUND_LABELS[type],
          reason: "incomplete",
          detail: attempt?.status === "active" ? "In progress" : "Not attempted",
        });
        continue;
      }
      if (type === "interview") {
        const band = interviewBandByUser.get(registration.userId);
        if (band === WORKSPACE_INTERVIEW_RETAKE_BAND) {
          candidateBelowThreshold = true;
          retakeList.push({
            userId: registration.userId,
            name,
            email: registration.user.email,
            roundType: type,
            roundLabel: ROUND_LABELS[type],
            reason: "below_threshold",
            detail: band,
          });
        }
      } else {
        const score = attempt.percentageScore;
        if (score !== null && score < WORKSPACE_ROUND_RETAKE_THRESHOLD_PERCENT) {
          candidateBelowThreshold = true;
          retakeList.push({
            userId: registration.userId,
            name,
            email: registration.user.email,
            roundType: type,
            roundLabel: ROUND_LABELS[type],
            reason: "below_threshold",
            detail: `${score}%`,
          });
        }
      }
    }

    if (candidateIncomplete) incomplete += 1;
    else if (candidateBelowThreshold) belowThreshold += 1;
    else ready += 1;
  }

  const dsaCategories: ModuleCategoryStat[] = dsaBreakdown
    .map((row) => ({
      name: row.difficulty,
      avgScore: row.attempted ? Math.round((row.fullyPassed / row.attempted) * 100) : 0,
      sampleSize: row.attempted,
      weakCandidateCount: row.attempted - row.fullyPassed,
    }))
    .sort((a, b) => a.avgScore - b.avgScore);

  const sqlCategories: ModuleCategoryStat[] = sqlBreakdown
    .map((row) => ({
      name: `${row.subtrack} / ${row.difficulty}`,
      avgScore: row.attempted ? Math.round((row.fullyPassed / row.attempted) * 100) : 0,
      sampleSize: row.attempted,
      weakCandidateCount: row.attempted - row.fullyPassed,
    }))
    .sort((a, b) => a.avgScore - b.avgScore);

  return {
    workspace: { id: workspace.id, name: workspace.name, code: workspace.code, totalCandidates: roster.length },
    generatedAt: new Date().toISOString(),
    readiness: { ready, incomplete, belowThreshold },
    modules: {
      mcq: moduleSummaryFor("mcq", configuredRoundTypes, attempts, extractAptitudeDomainStats(mcqSessions)),
      coding: moduleSummaryFor("coding", configuredRoundTypes, attempts, dsaCategories),
      sql: moduleSummaryFor("sql", configuredRoundTypes, attempts, sqlCategories),
      interview: moduleSummaryFor(
        "interview",
        configuredRoundTypes,
        attempts,
        extractInterviewDimensionStats(interviewArtifacts),
      ),
    },
    retakeList,
  };
}

const analyticsCache = new Map<string, { computedAt: number; payload: WorkspaceAnalyticsSnapshot }>();

async function getCachedAnalyticsSnapshot(workspaceId: string): Promise<WorkspaceAnalyticsSnapshot> {
  const cached = analyticsCache.get(workspaceId);
  if (cached && Date.now() - cached.computedAt < WORKSPACE_ANALYTICS_CACHE_TTL_MS) {
    return cached.payload;
  }
  const payload = await computeWorkspaceAnalytics(workspaceId);
  analyticsCache.set(workspaceId, { computedAt: Date.now(), payload });
  return payload;
}

export async function getWorkspaceAnalytics(
  actor: WorkspaceActor,
  workspaceId: string,
): Promise<WorkspaceAnalyticsSnapshot> {
  await assertCanManageWorkspace(actor, workspaceId);
  return getCachedAnalyticsSnapshot(workspaceId);
}

export type CandidateSafeModuleAverage = {
  configured: boolean;
  completedCount: number;
  avgPercentageScore: number | null;
};

export type CandidateSafeWorkspaceAverages = {
  totalCandidates: number;
  modules: Record<WorkspaceRoundType, CandidateSafeModuleAverage>;
};

// Deliberately narrower than WorkspaceAnalyticsSnapshot: no per-question
// categories, no retake list, no individual candidate rows - only
// module-level averages and sample sizes, which is why this can be called
// for the requesting candidate's own workspace without an admin auth check.
export async function getCandidateSafeWorkspaceAverages(
  workspaceId: string,
): Promise<CandidateSafeWorkspaceAverages> {
  const snapshot = await getCachedAnalyticsSnapshot(workspaceId);
  const modules = Object.fromEntries(
    (Object.entries(snapshot.modules) as [WorkspaceRoundType, ModuleSummary][]).map(([type, summary]) => [
      type,
      {
        configured: summary.configured,
        completedCount: summary.completedCount,
        avgPercentageScore: summary.avgPercentageScore,
      },
    ]),
  ) as Record<WorkspaceRoundType, CandidateSafeModuleAverage>;
  return { totalCandidates: snapshot.workspace.totalCandidates, modules };
}
