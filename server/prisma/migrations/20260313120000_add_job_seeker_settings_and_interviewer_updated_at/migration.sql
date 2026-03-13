-- JobSeekerProfile: add settings/portfolio columns (optional, no default needed)
ALTER TABLE "JobSeekerProfile" ADD COLUMN IF NOT EXISTS "githubUrl" TEXT;
ALTER TABLE "JobSeekerProfile" ADD COLUMN IF NOT EXISTS "linkedInUrl" TEXT;
ALTER TABLE "JobSeekerProfile" ADD COLUMN IF NOT EXISTS "portfolioUrl" TEXT;
ALTER TABLE "JobSeekerProfile" ADD COLUMN IF NOT EXISTS "preferredTechStack" JSONB;
ALTER TABLE "JobSeekerProfile" ADD COLUMN IF NOT EXISTS "experienceLevel" TEXT;
ALTER TABLE "JobSeekerProfile" ADD COLUMN IF NOT EXISTS "preferredLocations" JSONB;
ALTER TABLE "JobSeekerProfile" ADD COLUMN IF NOT EXISTS "workModePreference" TEXT;
ALTER TABLE "JobSeekerProfile" ADD COLUMN IF NOT EXISTS "roleType" TEXT DEFAULT 'technical';
ALTER TABLE "JobSeekerProfile" ADD COLUMN IF NOT EXISTS "targetJobTitle" TEXT;

-- Interviewer: add updatedAt with default so existing rows get a value
ALTER TABLE "Interviewer" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
