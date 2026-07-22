export type UserWorkspaceStatus = "draft" | "published" | "started" | "ended" | "archived";
export type UserWorkspaceAccessMode = "public" | "invite_only";
export type UserWorkspaceRoundType = "mcq" | "coding" | "interview" | "sql";

export type UserWorkspaceRound = {
  id: string;
  order: number;
  name: string;
  type: UserWorkspaceRoundType;
  questionCount: number;
  timeLimitMins: number;
  scoreWeightage: number;
  questionType?: "random" | "fixed";
  easyCount?: number;
  mediumCount?: number;
  hardCount?: number;
};

export type UserWorkspace = {
  id: string;
  name: string;
  organization: string;
  code: string;
  startAt: string;
  endAt: string;
  status: UserWorkspaceStatus;
  accessMode: UserWorkspaceAccessMode;
  totalRounds: number;
  rounds: UserWorkspaceRound[];
};

export type UserWorkspaceRoundAttempt = {
  id: string;
  workspaceId: string;
  workspaceRoundId: string;
  roundType: UserWorkspaceRoundType;
  status: "active" | "completed" | "auto_completed" | "discarded";
  score?: number | null;
  percentageScore?: number | null;
  weightedScore?: number | null;
  completedAt?: string | null;
  createdAt?: string;
  workspaceRound?: Pick<UserWorkspaceRound, "id" | "order" | "name" | "type" | "questionCount" | "timeLimitMins" | "scoreWeightage">;
  mcqSession?: {
    id: string;
    status: string;
    startTime: string;
    endTime: string;
    submittedAt?: string | null;
    finalizedAt?: string | null;
  } | null;
  dsaRoundSession?: {
    id: string;
    startTime: string;
    expTime: string;
  } | null;
  sqlSession?: {
    id: string;
    status: string;
    startTime: string;
    endTime: string;
    submittedAt?: string | null;
    finalizedAt?: string | null;
  } | null;
  placementReadinessHandoff?: {
    status: string;
    placementSessionId?: string | null;
    lastError?: string | null;
    expiresAt: string;
    updatedAt: string;
    artifact?: { id: string; receivedAt: string } | null;
  } | null;
};

export type UserWorkspaceRegistration = {
  id: string;
  workspaceId: string;
  userId: string;
  status: "registered" | "removed";
  registeredAt: string;
  removedAt?: string | null;
  restoredAt?: string | null;
  workspace?: UserWorkspace;
  roundAttempts?: UserWorkspaceRoundAttempt[];
};

export type UserWorkspaceLeaderboardRow = {
  rank: number;
  userId: string;
  name: string | null;
  email: string;
  totalScore: number;
  completedRounds: number;
  lastCompletedAt: string | null;
};

export type UserWorkspaceLeaderboardResponse = {
  workspace: Pick<UserWorkspace, "id" | "code" | "name" | "organization" | "status">;
  leaderboard: UserWorkspaceLeaderboardRow[];
  nextCursor: string | null;
};
