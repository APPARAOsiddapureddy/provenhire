-- Add certification gate for job eligibility filtering
ALTER TABLE "Job"
ADD COLUMN "minimumCertificationLevel" INTEGER NOT NULL DEFAULT 1;
