export type CollegeWorkspaceStatus =
  | "draft"
  | "published"
  | "started"
  | "ended"
  | "archived";

export type CollegeWorkspaceRoundType = "mcq" | "coding" | "interview" | "sql";

export type CollegeWorkspaceRound = {
  id: string;
  order: number;
  name: string;
  type: CollegeWorkspaceRoundType;
  questionCount: number;
  timeLimitMins: number;
  scoreWeightage: number;
  questionType?: "random" | "fixed";
  easyCount?: number;
  mediumCount?: number;
  hardCount?: number;
};

export type CollegeWorkspace = {
  id: string;
  name: string;
  organization: string;
  targetRole: string;
  code: string;
  startAt: string;
  endAt: string;
  status: CollegeWorkspaceStatus;
  accessMode: "public" | "invite_only";
  totalRounds: number;
  createdAt: string;
  rounds: CollegeWorkspaceRound[];
  _count?: { registrations: number };
};

export type CollegeWorkspaceResponse = {
  college: { userId: string; workspaceId: string };
  workspace: CollegeWorkspace;
};

export type CollegeLeaderboardRow = {
  rank: number;
  userId: string;
  name: string | null;
  email: string;
  totalScore: number;
  completedRounds: number;
  lastCompletedAt: string | null;
};

export type CollegeLeaderboardResponse = {
  available: boolean;
  status: CollegeWorkspaceStatus;
  leaderboard: CollegeLeaderboardRow[];
  nextCursor: string | null;
};

export type CollegeRegistrationStatus = "registered" | "removed";

export type CollegeRegistration = {
  userId: string;
  name: string | null;
  email: string;
  college: string | null;
  graduationYear: number | null;
  status: CollegeRegistrationStatus;
  registeredAt: string;
  removedAt: string | null;
  restoredAt: string | null;
};

export type CollegeRegistrationsResponse = {
  registrations: CollegeRegistration[];
};

/** Admin-facing view of the login handed to a college. */
export type CollegeCredentials = {
  userId: string;
  password: string;
  isActive: boolean;
  createdAt: string;
};
