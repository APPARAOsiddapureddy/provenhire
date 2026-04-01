-- Aptitude: server-side test window enforcement (not client timer only)
ALTER TABLE "AptitudeSession" ADD COLUMN IF NOT EXISTS "testStartedAt" TIMESTAMP(3);
