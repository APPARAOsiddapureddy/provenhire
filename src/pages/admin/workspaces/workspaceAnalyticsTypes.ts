export type WorkspaceRoundTypeKey = "mcq" | "coding" | "sql" | "interview";

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
