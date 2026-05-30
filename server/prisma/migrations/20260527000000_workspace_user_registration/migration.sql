CREATE TYPE "WorkspaceAccessMode" AS ENUM ('public', 'invite_only');

CREATE TYPE "WorkspaceRegistrationStatus" AS ENUM ('registered', 'removed');

ALTER TABLE "Workspace" ADD COLUMN "accessMode" "WorkspaceAccessMode" NOT NULL DEFAULT 'public';

CREATE TABLE "WorkspaceRegistration" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "WorkspaceRegistrationStatus" NOT NULL DEFAULT 'registered',
    "registeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "removedAt" TIMESTAMP(3),
    "removedByUserId" TEXT,
    "restoredAt" TIMESTAMP(3),
    "restoredByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkspaceRegistration_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WorkspaceAllowedEmail" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkspaceAllowedEmail_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WorkspaceRegistration_workspaceId_userId_key" ON "WorkspaceRegistration"("workspaceId", "userId");
CREATE INDEX "WorkspaceRegistration_workspaceId_status_idx" ON "WorkspaceRegistration"("workspaceId", "status");
CREATE INDEX "WorkspaceRegistration_userId_status_idx" ON "WorkspaceRegistration"("userId", "status");

CREATE UNIQUE INDEX "WorkspaceAllowedEmail_workspaceId_email_key" ON "WorkspaceAllowedEmail"("workspaceId", "email");
CREATE INDEX "WorkspaceAllowedEmail_email_idx" ON "WorkspaceAllowedEmail"("email");

ALTER TABLE "WorkspaceRegistration" ADD CONSTRAINT "WorkspaceRegistration_workspaceId_fkey"
    FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "WorkspaceRegistration" ADD CONSTRAINT "WorkspaceRegistration_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "WorkspaceRegistration" ADD CONSTRAINT "WorkspaceRegistration_removedByUserId_fkey"
    FOREIGN KEY ("removedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "WorkspaceRegistration" ADD CONSTRAINT "WorkspaceRegistration_restoredByUserId_fkey"
    FOREIGN KEY ("restoredByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "WorkspaceAllowedEmail" ADD CONSTRAINT "WorkspaceAllowedEmail_workspaceId_fkey"
    FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
