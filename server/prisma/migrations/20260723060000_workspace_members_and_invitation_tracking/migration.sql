CREATE TYPE "WorkspaceMemberRole" AS ENUM ('owner', 'manager', 'reviewer');

CREATE TYPE "InvitationDeliveryStatus" AS ENUM ('pending', 'sent', 'failed', 'accepted');

ALTER TABLE "WorkspaceAllowedEmail"
  ADD COLUMN "deliveryStatus" "InvitationDeliveryStatus" NOT NULL DEFAULT 'pending',
  ADD COLUMN "deliveryError" TEXT,
  ADD COLUMN "sentAt" TIMESTAMP(3),
  ADD COLUMN "acceptedAt" TIMESTAMP(3);

CREATE TABLE "WorkspaceMember" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "WorkspaceMemberRole" NOT NULL DEFAULT 'manager',
    "invitedByUserId" TEXT,
    "removedAt" TIMESTAMP(3),
    "removedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkspaceMember_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WorkspaceMember_workspaceId_userId_key" ON "WorkspaceMember"("workspaceId", "userId");
CREATE INDEX "WorkspaceMember_workspaceId_removedAt_idx" ON "WorkspaceMember"("workspaceId", "removedAt");
CREATE INDEX "WorkspaceMember_userId_idx" ON "WorkspaceMember"("userId");

ALTER TABLE "WorkspaceMember" ADD CONSTRAINT "WorkspaceMember_workspaceId_fkey"
    FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "WorkspaceMember" ADD CONSTRAINT "WorkspaceMember_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "WorkspaceMember" ADD CONSTRAINT "WorkspaceMember_invitedByUserId_fkey"
    FOREIGN KEY ("invitedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "WorkspaceMember" ADD CONSTRAINT "WorkspaceMember_removedByUserId_fkey"
    FOREIGN KEY ("removedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill: every existing workspace's current owner becomes an explicit 'owner' member,
-- so authorization checks that move from Workspace.ownerUserId to WorkspaceMember keep working
-- for workspaces created before this migration.
INSERT INTO "WorkspaceMember" ("id", "workspaceId", "userId", "role", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, "id", "ownerUserId", 'owner', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Workspace"
ON CONFLICT ("workspaceId", "userId") DO NOTHING;
