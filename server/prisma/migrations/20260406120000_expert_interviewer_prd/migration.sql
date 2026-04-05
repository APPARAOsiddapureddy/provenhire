-- Expert Interviewer PRD §15 — profile, earnings, bank, session notes, retry cooldown

ALTER TABLE "JobSeekerProfile" ADD COLUMN IF NOT EXISTS "humanExpertRetryAfter" TIMESTAMP(3);

ALTER TABLE "InterviewerApplication" ADD COLUMN IF NOT EXISTS "currentCompany" TEXT;
ALTER TABLE "InterviewerApplication" ADD COLUMN IF NOT EXISTS "jobTitle" TEXT;

ALTER TABLE "Interviewer" ADD COLUMN IF NOT EXISTS "bio" TEXT;
ALTER TABLE "Interviewer" ADD COLUMN IF NOT EXISTS "languagesSpoken" JSONB;
ALTER TABLE "Interviewer" ADD COLUMN IF NOT EXISTS "profileCompleted" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Interviewer" ADD COLUMN IF NOT EXISTS "totalInterviews" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Interviewer" ADD COLUMN IF NOT EXISTS "totalPassed" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Interviewer" ADD COLUMN IF NOT EXISTS "recurringSchedule" JSONB;
ALTER TABLE "Interviewer" ADD COLUMN IF NOT EXISTS "recurringActive" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "InterviewerBankDetails" (
    "id" TEXT NOT NULL,
    "interviewerId" TEXT NOT NULL,
    "accountHolder" TEXT NOT NULL,
    "accountNumber" TEXT NOT NULL,
    "ifscCode" TEXT NOT NULL,
    "bankName" TEXT NOT NULL,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InterviewerBankDetails_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "InterviewerBankDetails_interviewerId_key" ON "InterviewerBankDetails"("interviewerId");

ALTER TABLE "InterviewerBankDetails" ADD CONSTRAINT "InterviewerBankDetails_interviewerId_fkey" FOREIGN KEY ("interviewerId") REFERENCES "Interviewer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "InterviewerEarning" (
    "id" TEXT NOT NULL,
    "interviewerId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "amountPaise" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "payoutStatus" TEXT NOT NULL DEFAULT 'pending',
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InterviewerEarning_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "InterviewerEarning_sessionId_key" ON "InterviewerEarning"("sessionId");

ALTER TABLE "InterviewerEarning" ADD CONSTRAINT "InterviewerEarning_interviewerId_fkey" FOREIGN KEY ("interviewerId") REFERENCES "Interviewer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "InterviewerEarning" ADD CONSTRAINT "InterviewerEarning_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "HumanInterviewSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "HumanInterviewSession" ADD COLUMN IF NOT EXISTS "interviewerNotes" TEXT;
ALTER TABLE "HumanInterviewSession" ADD COLUMN IF NOT EXISTS "candidateFeedback" TEXT;

-- Existing interviewers keep access; new invites start with profileCompleted false from app logic.
UPDATE "Interviewer" SET "profileCompleted" = true WHERE "userId" IS NOT NULL;
