ALTER TYPE "WorkspaceRoundType" ADD VALUE IF NOT EXISTS 'sql';

CREATE TYPE "WorkspaceSqlSessionStatus" AS ENUM ('active', 'submitted', 'auto_submitted', 'discarded');

CREATE TABLE "WorkspaceSqlSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "taskIds" TEXT[] NOT NULL,
    "tasks" JSONB NOT NULL DEFAULT '[]'::jsonb,
    "currentTaskId" TEXT,
    "drafts" JSONB NOT NULL DEFAULT '{}'::jsonb,
    "startTime" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endTime" TIMESTAMP(3) NOT NULL,
    "status" "WorkspaceSqlSessionStatus" NOT NULL DEFAULT 'active',
    "submittedAt" TIMESTAMP(3),
    "finalizedAt" TIMESTAMP(3),
    "score" INTEGER,
    "passedCount" INTEGER,
    "totalCount" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkspaceSqlSession_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WorkspaceSqlSubmission" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "query" TEXT NOT NULL,
    "passedCount" INTEGER NOT NULL,
    "totalCount" INTEGER NOT NULL,
    "score" INTEGER NOT NULL,
    "isOfficial" BOOLEAN NOT NULL DEFAULT false,
    "results" JSONB NOT NULL,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkspaceSqlSubmission_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "WorkspaceRoundAttempt" ADD COLUMN "sqlSessionId" TEXT;

CREATE INDEX "WorkspaceSqlSession_userId_status_idx" ON "WorkspaceSqlSession"("userId", "status");
CREATE INDEX "WorkspaceSqlSession_endTime_status_idx" ON "WorkspaceSqlSession"("endTime", "status");
CREATE INDEX "WorkspaceSqlSubmission_sessionId_taskId_isOfficial_idx" ON "WorkspaceSqlSubmission"("sessionId", "taskId", "isOfficial");
CREATE INDEX "WorkspaceSqlSubmission_userId_isOfficial_idx" ON "WorkspaceSqlSubmission"("userId", "isOfficial");
CREATE UNIQUE INDEX "WorkspaceSqlSubmission_official_session_task_key" ON "WorkspaceSqlSubmission"("sessionId", "taskId") WHERE "isOfficial" = true;
CREATE UNIQUE INDEX "WorkspaceRoundAttempt_sqlSessionId_key" ON "WorkspaceRoundAttempt"("sqlSessionId");

ALTER TABLE "WorkspaceSqlSession" ADD CONSTRAINT "WorkspaceSqlSession_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "WorkspaceSqlSubmission" ADD CONSTRAINT "WorkspaceSqlSubmission_sessionId_fkey"
    FOREIGN KEY ("sessionId") REFERENCES "WorkspaceSqlSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "WorkspaceSqlSubmission" ADD CONSTRAINT "WorkspaceSqlSubmission_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "WorkspaceRoundAttempt" ADD CONSTRAINT "WorkspaceRoundAttempt_sqlSessionId_fkey"
    FOREIGN KEY ("sqlSessionId") REFERENCES "WorkspaceSqlSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;
