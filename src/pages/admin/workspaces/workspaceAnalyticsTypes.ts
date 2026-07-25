export type WorkspaceRoundTypeKey = "mcq" | "coding" | "sql" | "interview";

export type ModuleCategoryStat = {
  name: string;
  avgScore: number;
  sampleSize: number;
  weakCandidateCount?: number;
  // Per-candidate score distribution - only present for aptitude domains and
  // interview dimensions, which have a real per-candidate score. Coding/SQL
  // categories are pass-rate based, not a per-candidate score.
  p25?: number;
  p50?: number;
  p75?: number;
};

export type ProficiencyTiers = { good: number; average: number; poor: number };

// Test-case-level outcome breakdown for failed coding/SQL submissions.
// syntaxError = never produced a runnable submission at all. wrongLogic =
// ran and produced output, just the wrong one. inefficientOrCrashed = ran
// but timed out, exceeded limits, or crashed.
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
  // Topic-level breakdown (e.g. "Graphs", "Joins") - only present for coding
  // and SQL, where `categories` is difficulty/subtrack and too coarse to
  // name a specific weak spot. Aptitude/interview categories are already
  // topic-shaped.
  topics?: ModuleCategoryStat[];
  // Coding/SQL only.
  mistakeBreakdown?: MistakeBreakdown;
};

export type RetakeEntry = {
  userId: string;
  name: string;
  email: string;
  roundType: WorkspaceRoundTypeKey;
  roundLabel: string;
  reason: "incomplete" | "below_threshold";
  detail: string;
};

export type WorkspaceAnalyticsSnapshot = {
  workspace: { id: string; name: string; code: string; totalCandidates: number };
  generatedAt: string;
  readiness: { ready: number; incomplete: number; belowThreshold: number };
  modules: Record<WorkspaceRoundTypeKey, ModuleSummary>;
  retakeList: RetakeEntry[];
};
