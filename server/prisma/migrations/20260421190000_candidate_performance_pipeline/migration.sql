-- Unified candidate performance pipeline:
-- canonical run history + normalized signals + materialized candidate context state

CREATE TABLE "CandidateAssessmentRun" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "module" TEXT NOT NULL,
    "runIndex" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "score" DOUBLE PRECISION,
    "pass" BOOLEAN,
    "track" TEXT,
    "targetRole" TEXT,
    "completedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "meta" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "CandidateAssessmentRun_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CandidateAssessmentRun_userId_module_idx" ON "CandidateAssessmentRun"("userId", "module");
CREATE INDEX "CandidateAssessmentRun_userId_completedAt_idx" ON "CandidateAssessmentRun"("userId", "completedAt");

ALTER TABLE "CandidateAssessmentRun"
ADD CONSTRAINT "CandidateAssessmentRun_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "CandidateAssessmentEvent" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "competency" TEXT,
    "value" DOUBLE PRECISION,
    "detail" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CandidateAssessmentEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CandidateAssessmentEvent_runId_idx" ON "CandidateAssessmentEvent"("runId");
CREATE INDEX "CandidateAssessmentEvent_userId_competency_idx" ON "CandidateAssessmentEvent"("userId", "competency");

ALTER TABLE "CandidateAssessmentEvent"
ADD CONSTRAINT "CandidateAssessmentEvent_runId_fkey"
FOREIGN KEY ("runId") REFERENCES "CandidateAssessmentRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CandidateAssessmentEvent"
ADD CONSTRAINT "CandidateAssessmentEvent_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "CandidatePerformanceSignal" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "runId" TEXT,
    "competency" TEXT NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "pass" BOOLEAN NOT NULL,
    "source" TEXT NOT NULL,
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CandidatePerformanceSignal_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CandidatePerformanceSignal_userId_competency_idx" ON "CandidatePerformanceSignal"("userId", "competency");
CREATE INDEX "CandidatePerformanceSignal_userId_capturedAt_idx" ON "CandidatePerformanceSignal"("userId", "capturedAt");

ALTER TABLE "CandidatePerformanceSignal"
ADD CONSTRAINT "CandidatePerformanceSignal_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CandidatePerformanceSignal"
ADD CONSTRAINT "CandidatePerformanceSignal_runId_fkey"
FOREIGN KEY ("runId") REFERENCES "CandidateAssessmentRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "CandidatePerformanceSnapshot" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "dsaScore" DOUBLE PRECISION,
    "aiSkillsScore" DOUBLE PRECISION,
    "systemDesignScore" DOUBLE PRECISION,
    "antigravityScore" DOUBLE PRECISION,
    "verifiedCompetencies" JSONB NOT NULL DEFAULT '[]',
    "contextBlob" JSONB NOT NULL DEFAULT '{}',
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CandidatePerformanceSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CandidatePerformanceSnapshot_userId_key" ON "CandidatePerformanceSnapshot"("userId");

ALTER TABLE "CandidatePerformanceSnapshot"
ADD CONSTRAINT "CandidatePerformanceSnapshot_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
