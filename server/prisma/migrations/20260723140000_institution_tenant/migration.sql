-- Institution (campus) tenant: a college that runs its own placement-readiness
-- drives for its own students. Fully additive - existing recruiter- and
-- platform-admin-owned workspaces are untouched (Workspace.institutionId stays NULL).

-- 'institution' is a customer role, deliberately separate from 'admin'.
-- 'admin' is the platform superadmin and bypasses per-workspace authorization,
-- so reusing it for colleges would expose every college's drives to every other.
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'institution';

ALTER TYPE "WorkspaceOwnerRole" ADD VALUE IF NOT EXISTS 'institution';

DO $$ BEGIN
  CREATE TYPE "InstitutionStatus" AS ENUM ('pending', 'approved', 'suspended');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "Institution" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "contactEmail" TEXT NOT NULL,
    "status" "InstitutionStatus" NOT NULL DEFAULT 'pending',
    -- Supplementary profile: all nullable on purpose. Signup collects name,
    -- email and password only; these are filled in later from Settings so
    -- onboarding is never blocked on paperwork.
    "website" TEXT,
    "addressLine" TEXT,
    "city" TEXT,
    "state" TEXT,
    "country" TEXT,
    "pincode" TEXT,
    "affiliation" TEXT,
    "aicteCode" TEXT,
    "naacGrade" TEXT,
    "studentCount" INTEGER,
    "placementCellHead" TEXT,
    "phone" TEXT,
    "logoUrl" TEXT,
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Institution_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "Institution_slug_key" ON "Institution"("slug");
CREATE INDEX IF NOT EXISTS "Institution_status_idx" ON "Institution"("status");
CREATE INDEX IF NOT EXISTS "Institution_createdAt_idx" ON "Institution"("createdAt");

-- Placement-cell staff at tenant level: can manage every drive the institution
-- owns, unlike WorkspaceMember which grants access to a single drive.
CREATE TABLE IF NOT EXISTS "InstitutionMember" (
    "id" TEXT NOT NULL,
    "institutionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "WorkspaceMemberRole" NOT NULL DEFAULT 'manager',
    "invitedByUserId" TEXT,
    "removedAt" TIMESTAMP(3),
    "removedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InstitutionMember_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "InstitutionMember_institutionId_userId_key"
    ON "InstitutionMember"("institutionId", "userId");
CREATE INDEX IF NOT EXISTS "InstitutionMember_institutionId_removedAt_idx"
    ON "InstitutionMember"("institutionId", "removedAt");
CREATE INDEX IF NOT EXISTS "InstitutionMember_userId_idx" ON "InstitutionMember"("userId");

ALTER TABLE "InstitutionMember" DROP CONSTRAINT IF EXISTS "InstitutionMember_institutionId_fkey";
ALTER TABLE "InstitutionMember" ADD CONSTRAINT "InstitutionMember_institutionId_fkey"
    FOREIGN KEY ("institutionId") REFERENCES "Institution"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "InstitutionMember" DROP CONSTRAINT IF EXISTS "InstitutionMember_userId_fkey";
ALTER TABLE "InstitutionMember" ADD CONSTRAINT "InstitutionMember_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "InstitutionMember" DROP CONSTRAINT IF EXISTS "InstitutionMember_invitedByUserId_fkey";
ALTER TABLE "InstitutionMember" ADD CONSTRAINT "InstitutionMember_invitedByUserId_fkey"
    FOREIGN KEY ("invitedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "InstitutionMember" DROP CONSTRAINT IF EXISTS "InstitutionMember_removedByUserId_fkey";
ALTER TABLE "InstitutionMember" ADD CONSTRAINT "InstitutionMember_removedByUserId_fkey"
    FOREIGN KEY ("removedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Workspace" ADD COLUMN IF NOT EXISTS "institutionId" TEXT;

CREATE INDEX IF NOT EXISTS "Workspace_institutionId_status_idx"
    ON "Workspace"("institutionId", "status");

ALTER TABLE "Workspace" DROP CONSTRAINT IF EXISTS "Workspace_institutionId_fkey";
ALTER TABLE "Workspace" ADD CONSTRAINT "Workspace_institutionId_fkey"
    FOREIGN KEY ("institutionId") REFERENCES "Institution"("id") ON DELETE CASCADE ON UPDATE CASCADE;
