CREATE TABLE "AssessmentReportGeneration" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "reportKind" TEXT NOT NULL,
    "sourceHash" TEXT NOT NULL,
    "promptVersion" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "result" JSONB,
    "usage" JSONB,
    "estimatedCostUsd" DOUBLE PRECISION,
    "error" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AssessmentReportGeneration_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AssessmentReportGeneration_workspaceId_userId_reportKind_sourceHash_promptVersion_model_key"
ON "AssessmentReportGeneration"("workspaceId", "userId", "reportKind", "sourceHash", "promptVersion", "model");

CREATE INDEX "AssessmentReportGeneration_workspaceId_userId_reportKind_createdAt_idx"
ON "AssessmentReportGeneration"("workspaceId", "userId", "reportKind", "createdAt");

CREATE INDEX "AssessmentReportGeneration_status_createdAt_idx"
ON "AssessmentReportGeneration"("status", "createdAt");
