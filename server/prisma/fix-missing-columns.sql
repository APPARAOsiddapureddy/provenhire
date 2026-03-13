-- Run this if you get "column X does not exist" or prisma migrate deploy fails.
-- From project root: psql $DATABASE_URL -f server/prisma/fix-missing-columns.sql
-- Or: cd server && npx prisma db execute --file prisma/fix-missing-columns.sql

-- JobSeekerProfile: add settings/portfolio columns
ALTER TABLE "JobSeekerProfile" ADD COLUMN IF NOT EXISTS "githubUrl" TEXT;
ALTER TABLE "JobSeekerProfile" ADD COLUMN IF NOT EXISTS "linkedInUrl" TEXT;
ALTER TABLE "JobSeekerProfile" ADD COLUMN IF NOT EXISTS "portfolioUrl" TEXT;
ALTER TABLE "JobSeekerProfile" ADD COLUMN IF NOT EXISTS "preferredTechStack" JSONB;
ALTER TABLE "JobSeekerProfile" ADD COLUMN IF NOT EXISTS "experienceLevel" TEXT;
ALTER TABLE "JobSeekerProfile" ADD COLUMN IF NOT EXISTS "preferredLocations" JSONB;
ALTER TABLE "JobSeekerProfile" ADD COLUMN IF NOT EXISTS "workModePreference" TEXT;
ALTER TABLE "JobSeekerProfile" ADD COLUMN IF NOT EXISTS "roleType" TEXT DEFAULT 'technical';
ALTER TABLE "JobSeekerProfile" ADD COLUMN IF NOT EXISTS "targetJobTitle" TEXT;

-- Interviewer: add updatedAt (existing rows get current timestamp)
ALTER TABLE "Interviewer" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
