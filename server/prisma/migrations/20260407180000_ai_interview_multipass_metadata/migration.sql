-- AlterTable
ALTER TABLE "Interview" ADD COLUMN IF NOT EXISTS "evaluationPassCount" INTEGER;
ALTER TABLE "Interview" ADD COLUMN IF NOT EXISTS "evaluationScoreVariance" JSONB;
