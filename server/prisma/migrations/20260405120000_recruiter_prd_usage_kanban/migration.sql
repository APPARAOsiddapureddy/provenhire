-- PRD §9 RecruiterUsage (freemium), §13 RecruiterProfile / JobApplication Kanban fields

CREATE TABLE "RecruiterUsage" (
    "id" TEXT NOT NULL,
    "recruiterId" TEXT NOT NULL,
    "planType" TEXT NOT NULL DEFAULT 'free',
    "shortlistCountMonth" INTEGER NOT NULL DEFAULT 0,
    "profileViewCountMonth" INTEGER NOT NULL DEFAULT 0,
    "activeJobCount" INTEGER NOT NULL DEFAULT 0,
    "periodStart" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "periodEnd" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RecruiterUsage_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "RecruiterUsage_recruiterId_key" ON "RecruiterUsage"("recruiterId");

ALTER TABLE "RecruiterUsage" ADD CONSTRAINT "RecruiterUsage_recruiterId_fkey" FOREIGN KEY ("recruiterId") REFERENCES "RecruiterProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "RecruiterProfile" ADD COLUMN IF NOT EXISTS "cultureAndBenefits" JSONB;
ALTER TABLE "RecruiterProfile" ADD COLUMN IF NOT EXISTS "hiringForRoles" JSONB;
ALTER TABLE "RecruiterProfile" ADD COLUMN IF NOT EXISTS "preferredExperienceLevels" JSONB;
ALTER TABLE "RecruiterProfile" ADD COLUMN IF NOT EXISTS "verifiedAt" TIMESTAMP(3);
ALTER TABLE "RecruiterProfile" ADD COLUMN IF NOT EXISTS "rejectedAt" TIMESTAMP(3);

ALTER TABLE "JobApplication" ADD COLUMN IF NOT EXISTS "recruiterNote" TEXT;
ALTER TABLE "JobApplication" ADD COLUMN IF NOT EXISTS "stageChangedAt" TIMESTAMP(3);
ALTER TABLE "JobApplication" ADD COLUMN IF NOT EXISTS "stageHistory" JSONB;
