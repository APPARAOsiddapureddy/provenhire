export type WorkspaceStatus =
  | "draft"
  | "published"
  | "started"
  | "ended"
  | "archived";
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
  targetRole: string;
  hiringRubric: {
    schemaVersion?: string;
    responsibilities?: string[];
    decisionPolicy?: string;
  };
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

export type WorkspaceCandidateDossier = {
  schemaVersion: string;
  workspaceId: string;
  candidate: NonNullable<WorkspaceRegistration["user"]>;
  registration: {
    id: string;
    status: string;
    registeredAt: string;
    roundAttempts: Array<{
      id: string;
      roundType: WorkspaceRoundType;
      status: string;
      score?: number | null;
      percentageScore?: number | null;
      weightedScore?: number | null;
      completedAt?: string | null;
      dsaRoundSessionId?: string | null;
      mcqSessionId?: string | null;
      sqlSessionId?: string | null;
      workspaceRound: {
        id: string;
        order: number;
        name: string;
        type: WorkspaceRoundType;
        scoreWeightage: number;
      };
    }>;
  };
  synthesis?: {
    schemaVersion: string;
    recommendation: string;
    compositeScore: number | null;
    confidence: number | null;
    decisionStatus?:
      | "blocked_integrity"
      | "insufficient_evidence"
      | "human_review_required";
    completedModules: number;
    requiredModules?: Array<"aptitude" | "dsa" | "sql" | "interview">;
    completedModuleKeys?: Array<"aptitude" | "dsa" | "sql" | "interview">;
    readyModuleKeys?: Array<"aptitude" | "dsa" | "sql" | "interview">;
    missingModuleKeys?: Array<"aptitude" | "dsa" | "sql" | "interview">;
    overallRead: string;
    crossModuleSignals: string[];
    contradictions: string[];
    verifiedStrengths: string[];
    scopedRisks: string[];
    nextActions: string[];
    evidenceBasis: {
      aptitudeScore: number | null;
      dsaScore: number | null;
      sqlScore?: number | null;
      interviewScore?: number | null;
      antigravityScore: number | null;
      antigravityVerdict: string | null;
      scoreSpread: number;
      aptitudeEvidenceComplete?: boolean;
      dsaEvidenceComplete?: boolean;
      antigravityEvidenceComplete?: boolean;
      moduleScores?: Record<string, number | null>;
    };
    integrity?: {
      status: "blocked" | "verified";
      targetRole: string | null;
      artifactRole: string | null;
      workspaceInterviewLinked: boolean | null;
      issues: string[];
    };
    roleRubric?: {
      targetRole: string | null;
      responsibilities: string[];
    };
    decisionGates?: Array<{
      key: string;
      status: "blocked" | "ready" | "incomplete" | "not_configured" | "pending";
      label: string;
      detail: string;
    }>;
    evidenceCompleteness?: {
      aptitude: boolean;
      dsa: boolean;
      antigravity: boolean;
      sql?: boolean;
      interview?: boolean;
      byModule?: Record<string, boolean>;
      issues: string[];
    };
  };
  recordedDecision?: {
    id: string;
    outcome: "advance" | "hold" | "reject" | "additional_evidence";
    rationale: string;
    rubricAssessments: unknown;
    rubricSnapshot: unknown;
    evidenceSnapshot: unknown;
    evidenceHash: string;
    createdAt: string;
    updatedAt: string;
    reviewer: { id: string; name?: string | null; email: string };
  } | null;
  agentReports?: {
    dsa: {
      id: string;
      reportKind: string;
      promptVersion: string;
      model: string;
      result: Record<string, unknown>;
      usage?: unknown;
      estimatedCostUsd?: number | null;
      completedAt?: string | null;
      sourceHash: string;
    } | null;
    unified: {
      id: string;
      reportKind: string;
      promptVersion: string;
      model: string;
      result: Record<string, unknown>;
      usage?: unknown;
      estimatedCostUsd?: number | null;
      completedAt?: string | null;
      sourceHash: string;
    } | null;
  };
  modules: {
    aptitude: {
      latest: {
        id: string;
        score?: number | null;
        completedAt: string;
        answers?: unknown;
      } | null;
      history: unknown[];
      workspaceEvidence?: {
        sessionId: string;
        score?: number | null;
        completedAt?: string | null;
        totalQuestions: number;
        correct?: number | null;
        incorrect?: number | null;
        skipped?: number | null;
        timeTakenSeconds: number;
        timeLimitSeconds: number;
        questionReview: unknown[];
      } | null;
    };
    sql: {
      latest: null;
      history: unknown[];
      workspaceEvidence?: {
        attemptId: string;
        sessionId: string;
        score?: number | null;
        completedAt?: string | null;
        passedCount?: number | null;
        totalCount?: number | null;
        timeTakenSeconds: number;
        submissions: Array<{
          id: string;
          taskId: string;
          query: string;
          passedCount: number;
          totalCount: number;
          score: number;
          results?: unknown;
          submittedAt: string;
          task?: Record<string, unknown> | null;
        }>;
      } | null;
    };
    interview: {
      latest: {
        source: "placement_readiness";
        id: string;
        sessionId: string;
        schemaVersion: string;
        reportHash: string;
        score?: number | null;
        report: Record<string, unknown>;
        receivedAt: string;
        handoffStatus: string;
      } | null;
      status: string;
      lastError?: string | null;
      legacyAntigravity?: WorkspaceCandidateDossier["modules"]["antigravity"]["latest"];
    };
    dsa: {
      latest: {
        id: string;
        score?: number | null;
        completedAt: string;
        answers?: unknown;
      } | null;
      history: unknown[];
      workspaceEvidence?: {
        attemptId: string;
        roundSessionId: string;
        score?: number | null;
        completedAt?: string | null;
        submissions: Array<{
          id: string;
          questionId: string;
          language: string;
          code: string;
          passedCount: number;
          totalCount: number;
          results: unknown;
          followUpScore?: number | null;
          followUpResults?: unknown;
          submittedAt: string;
          question?: {
            id: string;
            title: string;
            description: string;
            difficulty: string;
            examples: unknown;
            constraints: string[];
          } | null;
        }>;
      } | null;
    };
    antigravity: {
      latest: {
        id: string;
        antigravitySessionId: string;
        schemaVersion: string;
        overallScore?: number | null;
        hireRecommendation?: string | null;
        confidenceScore?: number | null;
        report: Record<string, unknown>;
        evidencePacket?: Record<string, unknown> | null;
        telemetrySummary?: Record<string, unknown> | null;
        transcript?: unknown[] | null;
        receivedAt: string;
        interview: {
          id: string;
          jobRole?: string | null;
          totalScore?: number | null;
          badgeLevel?: string | null;
          finalVerdict?: string | null;
          completedAt?: string | null;
        };
        _count: { telemetryEvents: number };
        reportAccessToken?: string;
      } | null;
      history: unknown[];
    };
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
  workspace: Pick<
    Workspace,
    "id" | "code" | "name" | "organization" | "status"
  >;
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

export type WorkspaceInvitation = {
  id: string;
  workspaceId: string;
  email: string;
  createdAt: string;
};

export type WorkspaceDetailsDraft = {
  name: string;
  organization: string;
  targetRole: string;
  responsibilities: string;
  startAt: string;
  endAt: string;
  totalRounds: string;
  accessMode: WorkspaceAccessMode;
};

export type WorkspaceRoundDraft = Omit<
  WorkspaceRound,
  | "questionCount"
  | "timeLimitMins"
  | "scoreWeightage"
  | "easyCount"
  | "mediumCount"
  | "hardCount"
> & {
  questionCount: string;
  timeLimitMins: string;
  scoreWeightage: string;
  easyCount: string;
  mediumCount: string;
  hardCount: string;
};
