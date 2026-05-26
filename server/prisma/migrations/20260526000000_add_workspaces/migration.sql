CREATE TYPE "WorkspaceOwnerRole" AS ENUM ('admin', 'recruiter');

CREATE TYPE "WorkspaceStatus" AS ENUM ('draft', 'published', 'archived');

CREATE TYPE "WorkspaceRoundType" AS ENUM ('mcq', 'coding', 'interview');

CREATE TABLE "Workspace" (
    "id" TEXT NOT NULL,
    "ownerRole" "WorkspaceOwnerRole" NOT NULL,
    "ownerUserId" TEXT NOT NULL,
    "recruiterProfileId" TEXT,
    "name" TEXT NOT NULL,
    "organization" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "startAt" TIMESTAMP(3) NOT NULL,
    "endAt" TIMESTAMP(3) NOT NULL,
    "status" "WorkspaceStatus" NOT NULL DEFAULT 'draft',
    "totalRounds" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Workspace_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WorkspaceRound" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "type" "WorkspaceRoundType" NOT NULL,
    "questionCount" INTEGER NOT NULL,
    "timeLimitMins" INTEGER NOT NULL,
    "scoreWeightage" INTEGER NOT NULL,
    "easyCount" INTEGER NOT NULL DEFAULT 0,
    "mediumCount" INTEGER NOT NULL DEFAULT 0,
    "hardCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkspaceRound_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Workspace_code_key" ON "Workspace"("code");
CREATE INDEX "Workspace_ownerRole_ownerUserId_idx" ON "Workspace"("ownerRole", "ownerUserId");
CREATE INDEX "Workspace_recruiterProfileId_idx" ON "Workspace"("recruiterProfileId");
CREATE INDEX "Workspace_status_startAt_endAt_idx" ON "Workspace"("status", "startAt", "endAt");
CREATE INDEX "Workspace_createdAt_idx" ON "Workspace"("createdAt");

CREATE UNIQUE INDEX "WorkspaceRound_workspaceId_order_key" ON "WorkspaceRound"("workspaceId", "order");
CREATE INDEX "WorkspaceRound_workspaceId_idx" ON "WorkspaceRound"("workspaceId");
CREATE INDEX "WorkspaceRound_workspaceId_type_idx" ON "WorkspaceRound"("workspaceId", "type");

ALTER TABLE "Workspace" ADD CONSTRAINT "Workspace_ownerUserId_fkey"
    FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Workspace" ADD CONSTRAINT "Workspace_recruiterProfileId_fkey"
    FOREIGN KEY ("recruiterProfileId") REFERENCES "RecruiterProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "WorkspaceRound" ADD CONSTRAINT "WorkspaceRound_workspaceId_fkey"
    FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
