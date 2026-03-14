-- Add certification gate for job eligibility filtering (idempotent)
ALTER TABLE "Job" ADD COLUMN IF NOT EXISTS "minimumCertificationLevel" INTEGER NOT NULL DEFAULT 1;
