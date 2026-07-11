export type WorkspaceStatus = "draft" | "published" | "started" | "ended" | "archived";
export type WorkspaceAccessMode = "public" | "invite_only";
export type WorkspaceRoundType = "mcq" | "coding" | "interview" | "sql";
export type WorkspaceQuestionType = "random" | "fixed";

export type WorkspaceRound = {
  id?: string;
  workspaceId?: string;
  order: number;
  name: string;
  type: WorkspaceRoundType;
  questionType?: WorkspaceQuestionType;
  questionCount: number;
  timeLimitMins: number;
  scoreWeightage: number;
  easyCount: number;
  mediumCount: number;
  hardCount: number;
  createdAt?: string;
  updatedAt?: string;
};

export type Workspace = {
  id: string;
  ownerRole?: "admin" | "recruiter";
  ownerUserId?: string;
  recruiterProfileId?: string | null;
  name: string;
  organization: string;
  code: string;
  startAt: string;
  endAt: string;
  status: WorkspaceStatus;
  accessMode: WorkspaceAccessMode;
  totalRounds: number;
  createdAt: string;
  updatedAt: string;
  rounds?: WorkspaceRound[];
  _count?: { rounds?: number };
};

export type WorkspaceListResponse = {
  workspaces: Workspace[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
};

export type WorkspaceRegistration = {
  id: string;
  workspaceId: string;
  userId: string;
  status: "registered" | "removed";
  registeredAt: string;
  removedAt?: string | null;
  restoredAt?: string | null;
  user?: {
    id: string;
    email: string;
    name?: string | null;
    jobSeekerProfile?: {
      fullName?: string | null;
      phone?: string | null;
      college?: string | null;
      graduationYear?: string | null;
      targetJobTitle?: string | null;
    } | null;
  };
};

export type WorkspaceLeaderboardRow = {
  rank: number;
  userId: string;
  name: string | null;
  email: string;
  totalScore: number;
  completedRounds: number;
  lastCompletedAt: string | null;
};

export type WorkspaceLeaderboardResponse = {
  workspace: Pick<Workspace, "id" | "code" | "name" | "organization" | "status">;
  leaderboard: WorkspaceLeaderboardRow[];
  nextCursor: string | null;
};

export type SqlTaskAvailability = {
  total: number;
  byDifficulty: {
    Easy: number;
    Medium: number;
    Hard: number;
  };
  missingHiddenTests: number;
};

export type AllowlistImportSummary = {
  workspaceId: string;
  workspaceCode: string;
  parsed: number;
  valid: number;
  invalid: number;
  duplicatesInFile: number;
  inserted: number;
  alreadyPresent: number;
  invalidSamples: string[];
};

export type WorkspaceDetailsDraft = {
  name: string;
  organization: string;
  startAt: string;
  endAt: string;
  totalRounds: string;
  accessMode: WorkspaceAccessMode;
};

export type WorkspaceRoundDraft = Omit<
  WorkspaceRound,
  "questionCount" | "timeLimitMins" | "scoreWeightage" | "easyCount" | "mediumCount" | "hardCount"
> & {
  questionCount: string;
  timeLimitMins: string;
  scoreWeightage: string;
  easyCount: string;
  mediumCount: string;
  hardCount: string;
};
