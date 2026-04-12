-- Recruiter chooses post–AI-expert interview path per application (PRD: not platform-default).
ALTER TABLE "JobApplication" ADD COLUMN IF NOT EXISTS "recruiterNextInterviewMode" TEXT;
ALTER TABLE "JobApplication" ADD COLUMN IF NOT EXISTS "recruiterInterviewPathSetAt" TIMESTAMP(3);
ALTER TABLE "JobApplication" ADD COLUMN IF NOT EXISTS "recruiterInterviewPathSetByUserId" TEXT;
