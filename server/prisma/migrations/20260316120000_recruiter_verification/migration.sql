-- CreateEnum
CREATE TYPE "RecruiterVerificationStatus" AS ENUM ('pending', 'verified', 'rejected');

-- AlterTable
ALTER TABLE "RecruiterProfile" ADD COLUMN IF NOT EXISTS "fullName" TEXT;
ALTER TABLE "RecruiterProfile" ADD COLUMN IF NOT EXISTS "workEmail" TEXT;
ALTER TABLE "RecruiterProfile" ADD COLUMN IF NOT EXISTS "linkedInProfile" TEXT;
ALTER TABLE "RecruiterProfile" ADD COLUMN IF NOT EXISTS "companyLinkedin" TEXT;
ALTER TABLE "RecruiterProfile" ADD COLUMN IF NOT EXISTS "verificationDocumentUrl" TEXT;
ALTER TABLE "RecruiterProfile" ADD COLUMN IF NOT EXISTS "emailDomainVerified" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "RecruiterProfile" ADD COLUMN IF NOT EXISTS "verificationRejectedReason" TEXT;

-- Add verification_status (existing rows get 'pending' via DEFAULT)
ALTER TABLE "RecruiterProfile" ADD COLUMN IF NOT EXISTS "verificationStatus" "RecruiterVerificationStatus" DEFAULT 'pending';
