-- Persist detected subtracks at profile_setup completion (Polish 2).
ALTER TABLE "JobSeekerProfile" ADD COLUMN IF NOT EXISTS "nonTechSubtrack" TEXT;
ALTER TABLE "JobSeekerProfile" ADD COLUMN IF NOT EXISTS "dataSubtrack" TEXT;
