-- AlterTable: add phone to Interviewer
ALTER TABLE "Interviewer" ADD COLUMN IF NOT EXISTS "phone" TEXT;
