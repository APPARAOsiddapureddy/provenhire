-- Non-technical assignment retake gating (PRD April 2026)
ALTER TABLE "JobSeekerProfile" ADD COLUMN IF NOT EXISTS "nonTechAssignmentSubmitCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "JobSeekerProfile" ADD COLUMN IF NOT EXISTS "nonTechAssignmentLastSubmittedAt" TIMESTAMP(3);
ALTER TABLE "JobSeekerProfile" ADD COLUMN IF NOT EXISTS "nonTechAssignmentPaidCooldownUntil" TIMESTAMP(3);
