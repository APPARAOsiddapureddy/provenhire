-- CreateEnum
CREATE TYPE "SkillVerificationStatus" AS ENUM ('ACTIVE', 'EXPIRED', 'PENDING', 'FAILED');

-- CreateEnum
CREATE TYPE "SkillType" AS ENUM ('APTITUDE', 'LIVE_CODING', 'INTERVIEW');

-- CreateTable
CREATE TABLE "CandidateSkillVerification" (
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

-- CreateIndex
CREATE UNIQUE INDEX "CandidateSkillVerification_userId_skillType_key" ON "CandidateSkillVerification"("userId", "skillType");

-- CreateIndex
CREATE INDEX "CandidateSkillVerification_userId_idx" ON "CandidateSkillVerification"("userId");

-- CreateIndex
CREATE INDEX "CandidateSkillVerification_expiresAt_idx" ON "CandidateSkillVerification"("expiresAt");

-- CreateIndex
CREATE INDEX "CandidateSkillVerification_status_idx" ON "CandidateSkillVerification"("status");

-- AddForeignKey
ALTER TABLE "CandidateSkillVerification" ADD CONSTRAINT "CandidateSkillVerification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
