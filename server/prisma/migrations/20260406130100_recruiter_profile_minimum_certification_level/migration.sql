-- RecruiterProfile.minimumCertificationLevel was added in schema.prisma without a migration; align DB.
ALTER TABLE "RecruiterProfile" ADD COLUMN IF NOT EXISTS "minimumCertificationLevel" INTEGER DEFAULT 1;
