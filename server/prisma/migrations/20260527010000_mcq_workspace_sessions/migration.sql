ALTER TYPE "WorkspaceStatus" ADD VALUE IF NOT EXISTS 'started';
ALTER TYPE "WorkspaceStatus" ADD VALUE IF NOT EXISTS 'ended';

CREATE TYPE "WorkspaceQuestionType" AS ENUM ('random', 'fixed');
CREATE TYPE "McqSessionStatus" AS ENUM ('active', 'submitted', 'auto_submitted', 'discarded');
CREATE TYPE "WorkspaceRoundAttemptStatus" AS ENUM ('active', 'completed', 'auto_completed', 'discarded');

ALTER TABLE "WorkspaceRound" ADD COLUMN "questionType" "WorkspaceQuestionType" NOT NULL DEFAULT 'random';

CREATE TABLE "WorkspaceRoundQuestionSet" (
    "id" TEXT NOT NULL,
    "workspaceRoundId" TEXT NOT NULL,
    "questionIds" TEXT[],
    "questions" JSONB NOT NULL,
    "answerKey" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkspaceRoundQuestionSet_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "McqSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "questionIds" TEXT[],
    "questions" JSONB NOT NULL DEFAULT '[]',
    "answerKey" JSONB NOT NULL,
    "currentQuestionId" TEXT,
    "answers" JSONB NOT NULL DEFAULT '{}',
    "startTime" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endTime" TIMESTAMP(3) NOT NULL,
    "status" "McqSessionStatus" NOT NULL DEFAULT 'active',
    "submittedAt" TIMESTAMP(3),
    "finalizedAt" TIMESTAMP(3),
    "score" INTEGER,
    "correctCount" INTEGER,
    "incorrectCount" INTEGER,
    "skippedCount" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "McqSession_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WorkspaceRoundAttempt" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "workspaceRoundId" TEXT NOT NULL,
    "workspaceRegistrationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "roundType" "WorkspaceRoundType" NOT NULL,
    "mcqSessionId" TEXT,
    "dsaRoundSessionId" TEXT,
    "status" "WorkspaceRoundAttemptStatus" NOT NULL DEFAULT 'active',
    "score" INTEGER,
    "percentageScore" INTEGER,
    "weightedScore" INTEGER,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkspaceRoundAttempt_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WorkspaceRoundQuestionSet_workspaceRoundId_key" ON "WorkspaceRoundQuestionSet"("workspaceRoundId");
CREATE INDEX "McqSession_userId_status_idx" ON "McqSession"("userId", "status");
CREATE INDEX "McqSession_endTime_status_idx" ON "McqSession"("endTime", "status");
CREATE UNIQUE INDEX "WorkspaceRoundAttempt_mcqSessionId_key" ON "WorkspaceRoundAttempt"("mcqSessionId");
CREATE UNIQUE INDEX "WorkspaceRoundAttempt_dsaRoundSessionId_key" ON "WorkspaceRoundAttempt"("dsaRoundSessionId");
CREATE UNIQUE INDEX "WorkspaceRoundAttempt_workspaceRegistrationId_workspaceRoundId_key" ON "WorkspaceRoundAttempt"("workspaceRegistrationId", "workspaceRoundId");
CREATE INDEX "WorkspaceRoundAttempt_workspaceId_status_idx" ON "WorkspaceRoundAttempt"("workspaceId", "status");
CREATE INDEX "WorkspaceRoundAttempt_workspaceRoundId_status_idx" ON "WorkspaceRoundAttempt"("workspaceRoundId", "status");
CREATE INDEX "WorkspaceRoundAttempt_userId_status_idx" ON "WorkspaceRoundAttempt"("userId", "status");

ALTER TABLE "WorkspaceRoundQuestionSet" ADD CONSTRAINT "WorkspaceRoundQuestionSet_workspaceRoundId_fkey"
    FOREIGN KEY ("workspaceRoundId") REFERENCES "WorkspaceRound"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "McqSession" ADD CONSTRAINT "McqSession_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "WorkspaceRoundAttempt" ADD CONSTRAINT "WorkspaceRoundAttempt_workspaceId_fkey"
    FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "WorkspaceRoundAttempt" ADD CONSTRAINT "WorkspaceRoundAttempt_workspaceRoundId_fkey"
    FOREIGN KEY ("workspaceRoundId") REFERENCES "WorkspaceRound"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "WorkspaceRoundAttempt" ADD CONSTRAINT "WorkspaceRoundAttempt_workspaceRegistrationId_fkey"
    FOREIGN KEY ("workspaceRegistrationId") REFERENCES "WorkspaceRegistration"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "WorkspaceRoundAttempt" ADD CONSTRAINT "WorkspaceRoundAttempt_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "WorkspaceRoundAttempt" ADD CONSTRAINT "WorkspaceRoundAttempt_mcqSessionId_fkey"
    FOREIGN KEY ("mcqSessionId") REFERENCES "McqSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "WorkspaceRoundAttempt" ADD CONSTRAINT "WorkspaceRoundAttempt_dsaRoundSessionId_fkey"
    FOREIGN KEY ("dsaRoundSessionId") REFERENCES "DsaRoundSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;
