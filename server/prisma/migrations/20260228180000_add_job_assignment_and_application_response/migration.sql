-- AlterTable Job: add assignment, roleCategory, companyContext for non-technical assignment automation
ALTER TABLE "Job" ADD COLUMN IF NOT EXISTS "assignment" TEXT;
ALTER TABLE "Job" ADD COLUMN IF NOT EXISTS "roleCategory" TEXT;
ALTER TABLE "Job" ADD COLUMN IF NOT EXISTS "companyContext" TEXT;

-- AlterTable JobApplication: add assignmentResponse for applicant submissions
ALTER TABLE "JobApplication" ADD COLUMN IF NOT EXISTS "assignmentResponse" TEXT;
