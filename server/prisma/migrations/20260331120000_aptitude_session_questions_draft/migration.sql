-- Extend AptitudeSession to persist question set + draft progress (autosave/resume).
ALTER TABLE "AptitudeSession"
  ADD COLUMN IF NOT EXISTS "questions" JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE "AptitudeSession"
  ADD COLUMN IF NOT EXISTS "draft" JSONB;

ALTER TABLE "AptitudeSession"
  ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE "AptitudeSession"
  ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

