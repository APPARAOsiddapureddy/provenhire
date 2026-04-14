-- Optional topic slug for generic hobby-magazine writing assessment (chosen by candidate).
ALTER TABLE "NonTechAssignment" ADD COLUMN IF NOT EXISTS "hobbyCategory" TEXT;
