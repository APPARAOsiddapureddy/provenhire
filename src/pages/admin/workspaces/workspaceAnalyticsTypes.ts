export type WorkspaceRoundTypeKey = "mcq" | "coding" | "sql" | "interview";

export type ModuleCategoryStat = {
  name: string;
  avgScore: number;
  sampleSize: number;
  weakCandidateCount?: number;
};

export type ProficiencyTiers = { good: number; average: number; poor: number };

export type ModuleSummary = {
  configured: boolean;
  attemptedCount: number;
  completedCount: number;
  avgPercentageScore: number | null;
  bands: { top: number; mid: number; bottom: number };
  proficiency: ProficiencyTiers;
  categories: ModuleCategoryStat[];
  // Topic-level breakdown (e.g. "Graphs", "Joins") - only present for coding
  // and SQL, where `categories` is difficulty/subtrack and too coarse to
  // name a specific weak spot. Aptitude/interview categories are already
  // topic-shaped.
  topics?: ModuleCategoryStat[];
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
