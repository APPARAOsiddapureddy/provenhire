-- Add richer proctoring event fields for risk scoring and timeline dashboards (idempotent)
ALTER TABLE "ProctoringEvent" ADD COLUMN IF NOT EXISTS "testType" TEXT;
ALTER TABLE "ProctoringEvent" ADD COLUMN IF NOT EXISTS "severity" TEXT;
ALTER TABLE "ProctoringEvent" ADD COLUMN IF NOT EXISTS "riskScore" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "ProctoringEvent" ADD COLUMN IF NOT EXISTS "details" JSONB;
