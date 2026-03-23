-- AI Interview Pro Upgrade: question bank, per-question results, message fields, interview review/integrity

ALTER TABLE "Interview" ADD COLUMN IF NOT EXISTS "experienceLevel" TEXT;
ALTER TABLE "Interview" ADD COLUMN IF NOT EXISTS "reviewFlag" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Interview" ADD COLUMN IF NOT EXISTS "reviewReason" TEXT;
ALTER TABLE "Interview" ADD COLUMN IF NOT EXISTS "riskScore" DOUBLE PRECISION;
ALTER TABLE "Interview" ADD COLUMN IF NOT EXISTS "integrityFlag" TEXT;
ALTER TABLE "Interview" ADD COLUMN IF NOT EXISTS "reviewRequestedAt" TIMESTAMP(3);
ALTER TABLE "Interview" ADD COLUMN IF NOT EXISTS "reviewRequestReason" VARCHAR(500);
ALTER TABLE "Interview" ADD COLUMN IF NOT EXISTS "reviewOutcome" TEXT;
ALTER TABLE "Interview" ADD COLUMN IF NOT EXISTS "reviewOutcomeNote" TEXT;

ALTER TABLE "InterviewMessage" ADD COLUMN IF NOT EXISTS "questionIndex" INTEGER;
ALTER TABLE "InterviewMessage" ADD COLUMN IF NOT EXISTS "transcriptionConfidence" DOUBLE PRECISION;
ALTER TABLE "InterviewMessage" ADD COLUMN IF NOT EXISTS "inputMode" TEXT NOT NULL DEFAULT 'typed';
ALTER TABLE "InterviewMessage" ADD COLUMN IF NOT EXISTS "rawTranscript" TEXT;
ALTER TABLE "InterviewMessage" ADD COLUMN IF NOT EXISTS "answerLengthChars" INTEGER;
ALTER TABLE "InterviewMessage" ADD COLUMN IF NOT EXISTS "pasteCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "InterviewMessage" ADD COLUMN IF NOT EXISTS "timeToSubmitSeconds" INTEGER;
ALTER TABLE "InterviewMessage" ADD COLUMN IF NOT EXISTS "flagAntiGaming" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "InterviewMessage" ADD COLUMN IF NOT EXISTS "flagReason" TEXT;

CREATE TABLE IF NOT EXISTS "InterviewQuestionBank" (
    "id" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "experienceLevel" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "keyPoints" JSONB NOT NULL,
    "difficulty" INTEGER NOT NULL DEFAULT 2,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],

    CONSTRAINT "InterviewQuestionBank_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "InterviewQuestionBank_role_experienceLevel_type_isActive_idx"
ON "InterviewQuestionBank"("role", "experienceLevel", "type", "isActive");

CREATE TABLE IF NOT EXISTS "InterviewQuestionResult" (
    "id" TEXT NOT NULL,
    "interviewId" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "questionBankId" TEXT,
    "questionIndex" INTEGER NOT NULL,
    "questionType" TEXT NOT NULL,
    "scoreConceptual" DOUBLE PRECISION,
    "scoreReasoning" DOUBLE PRECISION,
    "scoreCommunication" DOUBLE PRECISION,
    "rationale" TEXT,
    "keyPointsHit" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "keyPointsMissed" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "flagAntiGaming" BOOLEAN NOT NULL DEFAULT false,
    "flagReason" TEXT,

    CONSTRAINT "InterviewQuestionResult_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "InterviewQuestionResult_messageId_key" ON "InterviewQuestionResult"("messageId");

CREATE TABLE IF NOT EXISTS "ProctoringReviewLog" (
    "id" TEXT NOT NULL,
    "interviewId" TEXT NOT NULL,
    "adminId" TEXT,
    "action" TEXT NOT NULL,
    "note" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProctoringReviewLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ProctoringReviewLog_interviewId_idx" ON "ProctoringReviewLog"("interviewId");

ALTER TABLE "InterviewQuestionResult" DROP CONSTRAINT IF EXISTS "InterviewQuestionResult_interviewId_fkey";
ALTER TABLE "InterviewQuestionResult" ADD CONSTRAINT "InterviewQuestionResult_interviewId_fkey"
  FOREIGN KEY ("interviewId") REFERENCES "Interview"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "InterviewQuestionResult" DROP CONSTRAINT IF EXISTS "InterviewQuestionResult_messageId_fkey";
ALTER TABLE "InterviewQuestionResult" ADD CONSTRAINT "InterviewQuestionResult_messageId_fkey"
  FOREIGN KEY ("messageId") REFERENCES "InterviewMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "InterviewQuestionResult" DROP CONSTRAINT IF EXISTS "InterviewQuestionResult_questionBankId_fkey";
ALTER TABLE "InterviewQuestionResult" ADD CONSTRAINT "InterviewQuestionResult_questionBankId_fkey"
  FOREIGN KEY ("questionBankId") REFERENCES "InterviewQuestionBank"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ProctoringReviewLog" DROP CONSTRAINT IF EXISTS "ProctoringReviewLog_interviewId_fkey";
ALTER TABLE "ProctoringReviewLog" ADD CONSTRAINT "ProctoringReviewLog_interviewId_fkey"
  FOREIGN KEY ("interviewId") REFERENCES "Interview"("id") ON DELETE CASCADE ON UPDATE CASCADE;
