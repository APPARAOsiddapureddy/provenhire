-- PRD 3 — Job discovery: required skills + experience band + recruiter subscription tier

ALTER TABLE "Job" ADD COLUMN IF NOT EXISTS "requiredSkills" JSONB;
ALTER TABLE "Job" ADD COLUMN IF NOT EXISTS "experienceRequired" TEXT;

ALTER TABLE "RecruiterUsage" ADD COLUMN IF NOT EXISTS "subscriptionTier" TEXT NOT NULL DEFAULT 'free';

UPDATE "RecruiterUsage" SET "subscriptionTier" = 'growth' WHERE "planType" = 'paid';
