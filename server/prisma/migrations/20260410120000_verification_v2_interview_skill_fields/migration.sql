-- PRD v2 — Interview typing + system design scores + skill verification metadata
ALTER TABLE "Interview" ADD COLUMN IF NOT EXISTS "interviewType" TEXT NOT NULL DEFAULT 'ai_expert';
ALTER TABLE "Interview" ADD COLUMN IF NOT EXISTS "dsaContextLoaded" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Interview" ADD COLUMN IF NOT EXISTS "lldScore" DOUBLE PRECISION;
ALTER TABLE "Interview" ADD COLUMN IF NOT EXISTS "hldScore" DOUBLE PRECISION;

ALTER TABLE "CandidateSkillVerification" ADD COLUMN IF NOT EXISTS "confidenceScore" DOUBLE PRECISION;
ALTER TABLE "CandidateSkillVerification" ADD COLUMN IF NOT EXISTS "verifiedInStage" TEXT;
