CREATE TABLE "CollegeCredential" (
  "userId" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "passwordHash" TEXT NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "CollegeCredential_pkey" PRIMARY KEY ("userId")
);

CREATE UNIQUE INDEX "CollegeCredential_workspaceId_key"
ON "CollegeCredential"("workspaceId");

CREATE INDEX "CollegeCredential_userId_isActive_idx"
ON "CollegeCredential"("userId", "isActive");

CREATE INDEX "CollegeCredential_isActive_idx"
ON "CollegeCredential"("isActive");

ALTER TABLE "CollegeCredential"
ADD CONSTRAINT "CollegeCredential_workspaceId_fkey"
FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
