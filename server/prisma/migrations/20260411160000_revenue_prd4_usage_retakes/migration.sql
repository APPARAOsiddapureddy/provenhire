-- PRD 4: recruiter usage (contacts, JD credits) + candidate retake ledger

ALTER TABLE "RecruiterUsage" ADD COLUMN IF NOT EXISTS "contactCountMonth" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "RecruiterUsage" ADD COLUMN IF NOT EXISTS "jdInterviewCountMonth" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE "CandidateRetakeLedger" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "packageType" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "consumedFor" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CandidateRetakeLedger_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CandidateRetakeLedger_userId_idx" ON "CandidateRetakeLedger"("userId");
CREATE INDEX "CandidateRetakeLedger_userId_consumedAt_idx" ON "CandidateRetakeLedger"("userId", "consumedAt");

ALTER TABLE "CandidateRetakeLedger" ADD CONSTRAINT "CandidateRetakeLedger_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
