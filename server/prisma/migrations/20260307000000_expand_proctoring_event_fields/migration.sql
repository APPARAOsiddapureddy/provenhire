-- Add richer proctoring event fields for risk scoring and timeline dashboards
ALTER TABLE "ProctoringEvent"
ADD COLUMN "testType" TEXT,
ADD COLUMN "severity" TEXT,
ADD COLUMN "riskScore" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "details" JSONB;
