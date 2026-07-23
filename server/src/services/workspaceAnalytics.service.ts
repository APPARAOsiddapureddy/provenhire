import type { WorkspaceRoundAttemptStatus, WorkspaceRoundType } from "@prisma/client";
import { prisma } from "../config/prisma.js";
import {
  assertCanManageWorkspace,
  type WorkspaceActor,
} from "./workspaceRegistration.service.js";
import {
  PROFICIENCY_AVERAGE_THRESHOLD_PERCENT,
  PROFICIENCY_GOOD_THRESHOLD_PERCENT,
  SCORE_BAND_BOTTOM_PERCENTILE,
  SCORE_BAND_TOP_PERCENTILE,
  WORKSPACE_ANALYTICS_CACHE_TTL_MS,
  WORKSPACE_INTERVIEW_RETAKE_BAND,
  WORKSPACE_ROUND_RETAKE_THRESHOLD_PERCENT,
} from "../constants/workspaceAnalytics.js";

const COMPLETED_STATUSES: WorkspaceRoundAttemptStatus[] = ["completed", "auto_completed"];
const WEAK_CATEGORY_SCORE_THRESHOLD = 60;

// Neither DsaQuestion nor DataRoundTask has a structured topic/concept tag in
// the schema - only a free-text title/description. This keyword table infers
// a human-readable topic from that text so the priority matrix and insights
// can say "Graphs" or "Joins" instead of just "Hard" or "engineering". First
// matching topic wins, so order matters (most specific first).
const DSA_TOPIC_KEYWORDS: Array<{ topic: string; keywords: string[] }> = [
  { topic: "Graphs", keywords: ["graph", "island", "topological", "dijkstra", " bfs", " dfs", "shortest path", "connected component"] },
  { topic: "Dynamic Programming", keywords: [" dp ", "dynamic programming", "subsequence", "knapsack", "partition", "edit distance", "longest common"] },
  { topic: "Trees", keywords: ["binary tree", " tree", "trie", "ancestor", "bst"] },
  { topic: "Linked Lists", keywords: ["linked list"] },
  { topic: "Backtracking & Recursion", keywords: ["backtrack", "permutation", "combination", "recursion", "recursive"] },
  { topic: "Two Pointers / Sliding Window", keywords: ["sliding window", "two pointer", "subarray"] },
  { topic: "Stacks & Queues", keywords: ["stack", "queue", "parenthes"] },
  { topic: "Hashing", keywords: ["hash", "duplicate", "anagram", "frequency"] },
  { topic: "Sorting & Searching", keywords: ["sort", "binary search", "kth largest", "kth smallest"] },
  { topic: "Greedy", keywords: ["greedy", "interval", "schedule"] },
  { topic: "Arrays & Strings", keywords: ["array", "string", "matrix"] },
];

const SQL_TOPIC_KEYWORDS: Array<{ topic: string; keywords: string[] }> = [
  { topic: "Window Functions", keywords: ["window", "partition by", "rank(", "row_number", "lag(", "lead(", "running total"] },
  { topic: "Joins", keywords: ["join"] },
  { topic: "Aggregations & Grouping", keywords: ["group by", "aggregat", "sum(", "count(", "avg(", "having", "top n", "top-n"] },
  { topic: "Subqueries", keywords: ["subquery", "nested query", "correlated"] },
  { topic: "Schema Design / DDL", keywords: ["create table", "schema", "constraint", "foreign key", "index"] },
  { topic: "Filtering & Sorting", keywords: ["where", "order by", "filter", "distinct"] },
];

function inferTopic(text: string, table: Array<{ topic: string; keywords: string[] }>, fallback: string): string {
  const lower = ` ${text.toLowerCase()} `;
  for (const { topic, keywords } of table) {
    if (keywords.some((keyword) => lower.includes(keyword))) return topic;
  }
  return fallback;
}

type QuestionStatRow = { title: string; description: string; attempted: number; fullyPassed: number };

function aggregateByTopic(
  rows: QuestionStatRow[],
  table: Array<{ topic: string; keywords: string[] }>,
  fallback: string,
): ModuleCategoryStat[] {
  const ledger = new Map<string, { attempted: number; fullyPassed: number }>();
  for (const row of rows) {
    const topic = inferTopic(`${row.title} ${row.description}`, table, fallback);
    const entry = ledger.get(topic) ?? { attempted: 0, fullyPassed: 0 };
    entry.attempted += row.attempted;
    entry.fullyPassed += row.fullyPassed;
    ledger.set(topic, entry);
  }
  return Array.from(ledger.entries())
    .map(([name, { attempted, fullyPassed }]) => ({
      name,
      avgScore: attempted ? Math.round((fullyPassed / attempted) * 100) : 0,
      sampleSize: attempted,
      weakCandidateCount: attempted - fullyPassed,
    }))
    .filter((topic) => topic.sampleSize > 0)
    .sort((a, b) => a.avgScore - b.avgScore);
}

// Test-case statuses come from the shared TestResultStatus union
// (constants/dsa.ts), reused for both DSA and SQL judge results.
// COMPILE_ERROR means the submission never ran at all - a fundamentals gap.
// WRONG_ANSWER means it ran and produced output, just the wrong one - a
// correctness/logic gap. Everything else (TLE/MLE/OLE/RUNTIME_ERROR/
// INTERNAL_ERROR) ran but blew up or timed out - usually an inefficient or
// unhandled-edge-case approach rather than "can't write the code at all".
function classifyTestStatus(status: string): "correct" | "wrongLogic" | "syntaxError" | "inefficientOrCrashed" {
  if (status === "CORRECT_ANSWER") return "correct";
  if (status === "WRONG_ANSWER") return "wrongLogic";
  if (status === "COMPILE_ERROR") return "syntaxError";
  return "inefficientOrCrashed";
}

function computeMistakeBreakdown(rows: { results: unknown }[]): MistakeBreakdown {
  const breakdown: MistakeBreakdown = { totalTestCases: 0, correct: 0, wrongLogic: 0, syntaxError: 0, inefficientOrCrashed: 0 };
  for (const row of rows) {
    const results = Array.isArray(row.results) ? row.results : [];
    for (const item of results) {
      if (!isRecord(item) || typeof item.status !== "string") continue;
      breakdown.totalTestCases += 1;
      breakdown[classifyTestStatus(item.status)] += 1;
    }
  }
  return breakdown;
}

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
  // Per-candidate score distribution within this category. Only present
  // where a real per-candidate score exists (aptitude domains, interview
  // dimensions) - coding/SQL categories are pass-rate based, not a
  // per-candidate score, so these are omitted there.
  p25?: number;
  p50?: number;
  p75?: number;
};

// Absolute proficiency tiers (see PROFICIENCY_*_THRESHOLD_PERCENT) - distinct
// from `bands`, which is a percentile-relative top/mid/bottom split of this
// batch only and shifts meaning as the batch composition changes.
export type ProficiencyTiers = { good: number; average: number; poor: number };

// Test-case-level outcome breakdown for failed coding/SQL submissions -
// answers "when they get it wrong, how do they get it wrong": never produced
// a runnable submission (syntaxError), ran but returned the wrong result
// (wrongLogic), or ran but timed out / exceeded limits / crashed
// (inefficientOrCrashed).
export type MistakeBreakdown = {
  totalTestCases: number;
  correct: number;
  wrongLogic: number;
  syntaxError: number;
  inefficientOrCrashed: number;
};

export type ModuleSummary = {
  configured: boolean;
  attemptedCount: number;
  completedCount: number;
  avgPercentageScore: number | null;
  bands: { top: number; mid: number; bottom: number };
  proficiency: ProficiencyTiers;
  percentiles?: { p25: number; p50: number; p75: number };
  topDecileAvg: number | null;
  categories: ModuleCategoryStat[];
  // Topic-level breakdown inferred from question/task text. Only populated
  // for coding and SQL, where `categories` is difficulty/subtrack (too
  // coarse to say "focus on graphs"); aptitude and interview categories are
  // already topic-shaped, so this is omitted there.
  topics?: ModuleCategoryStat[];
  // Coding/SQL only - see MistakeBreakdown.
  mistakeBreakdown?: MistakeBreakdown;
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

type DsaQuestionRow = { title: string; description: string; difficulty: string; attempted: number; fullyPassed: number };
type SqlTaskRow = {
  title: string;
  description: string;
  subtrack: string;
  difficulty: string;
  attempted: number;
  fullyPassed: number;
};

function byDifficulty(rows: { difficulty: string; attempted: number; fullyPassed: number }[]): ModuleCategoryStat[] {
  const ledger = new Map<string, { attempted: number; fullyPassed: number }>();
  for (const row of rows) {
    const entry = ledger.get(row.difficulty) ?? { attempted: 0, fullyPassed: 0 };
    entry.attempted += row.attempted;
    entry.fullyPassed += row.fullyPassed;
    ledger.set(row.difficulty, entry);
  }
  return Array.from(ledger.entries())
    .map(([name, { attempted, fullyPassed }]) => ({
      name,
      avgScore: attempted ? Math.round((fullyPassed / attempted) * 100) : 0,
      sampleSize: attempted,
      weakCandidateCount: attempted - fullyPassed,
    }))
    .sort((a, b) => a.avgScore - b.avgScore);
}

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

function percentileTrio(scores: number[]): { p25: number; p50: number; p75: number } | undefined {
  if (scores.length === 0) return undefined;
  const sorted = [...scores].sort((a, b) => a - b);
  return {
    p25: Math.round(quantile(sorted, 0.25)),
    p50: Math.round(quantile(sorted, 0.5)),
    p75: Math.round(quantile(sorted, 0.75)),
  };
}

function topDecileAverage(scores: number[]): number | null {
  if (scores.length === 0) return null;
  const sorted = [...scores].sort((a, b) => b - a);
  const count = Math.max(1, Math.ceil(sorted.length * 0.1));
  const top = sorted.slice(0, count);
  return Math.round(top.reduce((sum, s) => sum + s, 0) / top.length);
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
      ...(percentileTrio(entry.candidateScores) ?? {}),
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
      ...(percentileTrio(scores) ?? {}),
    }))
    .sort((a, b) => a.avgScore - b.avgScore);
}

function proficiencyTiers(scores: number[]): ProficiencyTiers {
  let good = 0;
  let average = 0;
  let poor = 0;
  for (const score of scores) {
    if (score >= PROFICIENCY_GOOD_THRESHOLD_PERCENT) good += 1;
    else if (score >= PROFICIENCY_AVERAGE_THRESHOLD_PERCENT) average += 1;
    else poor += 1;
  }
  return { good, average, poor };
}

function moduleSummaryFor(
  type: WorkspaceRoundType,
  configuredRoundTypes: Set<WorkspaceRoundType>,
  attempts: AttemptRow[],
  categories: ModuleCategoryStat[],
  topics?: ModuleCategoryStat[],
  mistakeBreakdown?: MistakeBreakdown,
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
    proficiency: proficiencyTiers(scores),
    percentiles: percentileTrio(scores),
    topDecileAvg: topDecileAverage(scores),
    categories,
    ...(topics ? { topics } : {}),
    ...(mistakeBreakdown ? { mistakeBreakdown } : {}),
  };
}

async function computeWorkspaceAnalytics(workspaceId: string): Promise<WorkspaceAnalyticsSnapshot> {
  const [
    workspace,
    workspaceRounds,
    roster,
    attempts,
    dsaQuestionRows,
    sqlTaskRows,
    interviewArtifacts,
    dsaResultRows,
    sqlResultRows,
  ] = await Promise.all([
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
      prisma.$queryRaw<DsaQuestionRow[]>`
        SELECT dq."title" AS "title", dq."description" AS "description", dq."difficulty" AS "difficulty",
               COUNT(*)::int AS "attempted",
               COUNT(*) FILTER (WHERE ds."passedCount" = ds."totalCount")::int AS "fullyPassed"
        FROM "WorkspaceRoundAttempt" wra
        JOIN "DsaSubmission" ds ON ds."roundSessionId" = wra."dsaRoundSessionId" AND ds."isOfficial" = true
        JOIN "DsaQuestion" dq ON dq."id" = ds."questionId"
        WHERE wra."workspaceId" = ${workspaceId} AND wra."roundType" = 'coding'
          AND wra."status" IN ('completed', 'auto_completed')
        GROUP BY dq."id", dq."title", dq."description", dq."difficulty"
      `,
      prisma.$queryRaw<SqlTaskRow[]>`
        SELECT drt."title" AS "title", drt."description" AS "description",
               COALESCE(drt."subtrack", 'general') AS "subtrack", drt."difficulty" AS "difficulty",
               COUNT(*)::int AS "attempted",
               COUNT(*) FILTER (WHERE wss."passedCount" = wss."totalCount")::int AS "fullyPassed"
        FROM "WorkspaceRoundAttempt" wra
        JOIN "WorkspaceSqlSubmission" wss ON wss."sessionId" = wra."sqlSessionId" AND wss."isOfficial" = true
        JOIN "DataRoundTask" drt ON drt."id" = wss."taskId"
        WHERE wra."workspaceId" = ${workspaceId} AND wra."roundType" = 'sql'
          AND wra."status" IN ('completed', 'auto_completed')
        GROUP BY drt."id", drt."title", drt."description", drt."subtrack", drt."difficulty"
      `,
      prisma.placementReadinessArtifact.findMany({
        where: { workspaceId },
        select: { userId: true, artifact: true },
      }),
      prisma.$queryRaw<{ results: unknown }[]>`
        SELECT ds."results" AS "results"
        FROM "WorkspaceRoundAttempt" wra
        JOIN "DsaSubmission" ds ON ds."roundSessionId" = wra."dsaRoundSessionId" AND ds."isOfficial" = true
        WHERE wra."workspaceId" = ${workspaceId} AND wra."roundType" = 'coding'
          AND wra."status" IN ('completed', 'auto_completed')
      `,
      prisma.$queryRaw<{ results: unknown }[]>`
        SELECT wss."results" AS "results"
        FROM "WorkspaceRoundAttempt" wra
        JOIN "WorkspaceSqlSubmission" wss ON wss."sessionId" = wra."sqlSessionId" AND wss."isOfficial" = true
        WHERE wra."workspaceId" = ${workspaceId} AND wra."roundType" = 'sql'
          AND wra."status" IN ('completed', 'auto_completed')
      `,
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

  const dsaCategories = byDifficulty(dsaQuestionRows);
  const dsaTopics = aggregateByTopic(dsaQuestionRows, DSA_TOPIC_KEYWORDS, "General problem solving");

  const sqlCategories: ModuleCategoryStat[] = Array.from(
    sqlTaskRows
      .reduce((ledger, row) => {
        const name = `${row.subtrack} / ${row.difficulty}`;
        const entry = ledger.get(name) ?? { attempted: 0, fullyPassed: 0 };
        entry.attempted += row.attempted;
        entry.fullyPassed += row.fullyPassed;
        ledger.set(name, entry);
        return ledger;
      }, new Map<string, { attempted: number; fullyPassed: number }>())
      .entries(),
  )
    .map(([name, { attempted, fullyPassed }]) => ({
      name,
      avgScore: attempted ? Math.round((fullyPassed / attempted) * 100) : 0,
      sampleSize: attempted,
      weakCandidateCount: attempted - fullyPassed,
    }))
    .sort((a, b) => a.avgScore - b.avgScore);
  const sqlTopics = aggregateByTopic(sqlTaskRows, SQL_TOPIC_KEYWORDS, "General SQL");

  const dsaMistakeBreakdown = computeMistakeBreakdown(dsaResultRows);
  const sqlMistakeBreakdown = computeMistakeBreakdown(sqlResultRows);

  return {
    workspace: { id: workspace.id, name: workspace.name, code: workspace.code, totalCandidates: roster.length },
    generatedAt: new Date().toISOString(),
    readiness: { ready, incomplete, belowThreshold },
    modules: {
      mcq: moduleSummaryFor("mcq", configuredRoundTypes, attempts, extractAptitudeDomainStats(mcqSessions)),
      coding: moduleSummaryFor("coding", configuredRoundTypes, attempts, dsaCategories, dsaTopics, dsaMistakeBreakdown),
      sql: moduleSummaryFor("sql", configuredRoundTypes, attempts, sqlCategories, sqlTopics, sqlMistakeBreakdown),
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
