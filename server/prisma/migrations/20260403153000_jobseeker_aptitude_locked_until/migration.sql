-- After 3 consecutive failed Cognitive Assessment attempts, block new attempts until this timestamp (PRD: 30 days).
ALTER TABLE "JobSeekerProfile" ADD COLUMN IF NOT EXISTS "aptitudeLockedUntil" TIMESTAMP(3);
