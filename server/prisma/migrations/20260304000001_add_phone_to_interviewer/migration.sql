-- CreateTable InterviewerApplication (was missing from init - table never created)
CREATE TABLE IF NOT EXISTS "InterviewerApplication" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "experienceYears" INTEGER,
  "track" TEXT NOT NULL DEFAULT 'technical',
  "domains" JSONB,
  "linkedIn" TEXT,
  "whyJoin" TEXT,
  "phone" TEXT,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "reviewedAt" TIMESTAMP(3),

  CONSTRAINT "InterviewerApplication_pkey" PRIMARY KEY ("id")
);

-- AlterTable: add phone to Interviewer if missing
ALTER TABLE "Interviewer" ADD COLUMN IF NOT EXISTS "phone" TEXT;
