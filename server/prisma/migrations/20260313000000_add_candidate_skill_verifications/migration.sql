-- CreateEnum (idempotent: do not error if type exists)
DO $$ BEGIN
  CREATE TYPE "SkillVerificationStatus" AS ENUM ('ACTIVE', 'EXPIRED', 'PENDING', 'FAILED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE TYPE "SkillType" AS ENUM ('APTITUDE', 'LIVE_CODING', 'INTERVIEW');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "CandidateSkillVerification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "skillType" "SkillType" NOT NULL,
    "status" "SkillVerificationStatus" NOT NULL,
    "score" INTEGER,
    "completedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CandidateSkillVerification_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "CandidateSkillVerification_userId_skillType_key" ON "CandidateSkillVerification"("userId", "skillType");
CREATE INDEX IF NOT EXISTS "CandidateSkillVerification_userId_idx" ON "CandidateSkillVerification"("userId");
CREATE INDEX IF NOT EXISTS "CandidateSkillVerification_expiresAt_idx" ON "CandidateSkillVerification"("expiresAt");
CREATE INDEX IF NOT EXISTS "CandidateSkillVerification_status_idx" ON "CandidateSkillVerification"("status");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CandidateSkillVerification_userId_fkey') THEN
    ALTER TABLE "CandidateSkillVerification" ADD CONSTRAINT "CandidateSkillVerification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
