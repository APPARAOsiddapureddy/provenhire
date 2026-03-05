-- AlterTable (IF NOT EXISTS for safe re-apply after failed migration)
ALTER TABLE "InterviewerApplication" ADD COLUMN IF NOT EXISTS "phone" TEXT;

-- AlterTable
ALTER TABLE "Interviewer" ADD COLUMN IF NOT EXISTS "phone" TEXT;
