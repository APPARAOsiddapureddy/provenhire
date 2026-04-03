-- Non-technical assignment persistence for GET /assignment/current and time-remaining
ALTER TABLE "JobSeekerProfile" ADD COLUMN IF NOT EXISTS "nonTechAssignmentPrompt" TEXT;
ALTER TABLE "JobSeekerProfile" ADD COLUMN IF NOT EXISTS "nonTechAssignmentResponse" TEXT;
ALTER TABLE "JobSeekerProfile" ADD COLUMN IF NOT EXISTS "nonTechAssignmentExpiresAt" TIMESTAMP(3);
