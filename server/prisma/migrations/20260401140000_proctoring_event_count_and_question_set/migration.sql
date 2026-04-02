-- Cognitive session metadata + per-session proctoring signal counts
ALTER TABLE "AptitudeSession" ADD COLUMN IF NOT EXISTS "questionSet" TEXT;

ALTER TABLE "Interview" ADD COLUMN IF NOT EXISTS "proctoringEventCount" INTEGER;

CREATE TABLE IF NOT EXISTS "ProctoringEventCount" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "testType" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "lastOccurredAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProctoringEventCount_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ProctoringEventCount_sessionId_eventType_key" ON "ProctoringEventCount"("sessionId", "eventType");
CREATE INDEX IF NOT EXISTS "ProctoringEventCount_sessionId_idx" ON "ProctoringEventCount"("sessionId");
CREATE INDEX IF NOT EXISTS "ProctoringEventCount_userId_idx" ON "ProctoringEventCount"("userId");
