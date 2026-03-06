-- AlterTable
ALTER TABLE "JobSeekerProfile" ADD COLUMN IF NOT EXISTS "noticePeriod" TEXT;
ALTER TABLE "JobSeekerProfile" ADD COLUMN IF NOT EXISTS "currentSalary" TEXT;
ALTER TABLE "JobSeekerProfile" ADD COLUMN IF NOT EXISTS "expectedSalary" TEXT;
