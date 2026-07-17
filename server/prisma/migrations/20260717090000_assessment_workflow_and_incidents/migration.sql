CREATE TABLE "AssessmentWorkflowJob" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "interviewId" TEXT,
    "jobKind" TEXT NOT NULL DEFAULT 'candidate_report_pipeline',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "currentStep" TEXT NOT NULL DEFAULT 'queued',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 8,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lockedAt" TIMESTAMP(3),
    "lockedBy" TEXT,
    "lastError" TEXT,
    "context" JSONB,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AssessmentWorkflowJob_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AssessmentWorkflowJob_workspaceId_userId_jobKind_interviewId_key"
    ON "AssessmentWorkflowJob"("workspaceId", "userId", "jobKind", "interviewId");
CREATE INDEX "AssessmentWorkflowJob_status_nextAttemptAt_idx"
    ON "AssessmentWorkflowJob"("status", "nextAttemptAt");
CREATE INDEX "AssessmentWorkflowJob_workspaceId_createdAt_idx"
    ON "AssessmentWorkflowJob"("workspaceId", "createdAt");

CREATE TABLE "AssessmentPipelineIncident" (
    "id" TEXT NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "interviewId" TEXT,
    "handoffId" TEXT,
    "module" TEXT NOT NULL,
    "issueCode" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "summary" TEXT NOT NULL,
    "detail" JSONB,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AssessmentPipelineIncident_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AssessmentPipelineIncident_dedupeKey_key"
    ON "AssessmentPipelineIncident"("dedupeKey");
CREATE INDEX "AssessmentPipelineIncident_workspaceId_status_severity_idx"
    ON "AssessmentPipelineIncident"("workspaceId", "status", "severity");
CREATE INDEX "AssessmentPipelineIncident_userId_createdAt_idx"
    ON "AssessmentPipelineIncident"("userId", "createdAt");
CREATE INDEX "AssessmentPipelineIncident_interviewId_idx"
    ON "AssessmentPipelineIncident"("interviewId");
