-- AlterTable
ALTER TABLE "Interview" ADD COLUMN IF NOT EXISTS "coverageRatio" DOUBLE PRECISION;
ALTER TABLE "Interview" ADD COLUMN IF NOT EXISTS "claimCredibilityRisk" TEXT;
ALTER TABLE "Interview" ADD COLUMN IF NOT EXISTS "engineeringSignal" TEXT;

-- AlterTable
ALTER TABLE "InterviewQuestionBank" ADD COLUMN IF NOT EXISTS "followups" JSONB NOT NULL DEFAULT '[]';
