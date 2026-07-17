CREATE TABLE "WorkspaceCandidateDecision" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "candidateUserId" TEXT NOT NULL,
  "reviewerUserId" TEXT NOT NULL,
  "outcome" TEXT NOT NULL,
  "rationale" TEXT NOT NULL,
  "rubricAssessments" JSONB NOT NULL,
  "rubricSnapshot" JSONB NOT NULL,
  "evidenceSnapshot" JSONB NOT NULL,
  "evidenceHash" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "WorkspaceCandidateDecision_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WorkspaceCandidateDecision_workspaceId_candidateUserId_key"
ON "WorkspaceCandidateDecision"("workspaceId", "candidateUserId");

CREATE INDEX "WorkspaceCandidateDecision_reviewerUserId_updatedAt_idx"
ON "WorkspaceCandidateDecision"("reviewerUserId", "updatedAt");

CREATE INDEX "WorkspaceCandidateDecision_workspaceId_outcome_idx"
ON "WorkspaceCandidateDecision"("workspaceId", "outcome");

ALTER TABLE "WorkspaceCandidateDecision"
ADD CONSTRAINT "WorkspaceCandidateDecision_workspaceId_fkey"
FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "WorkspaceCandidateDecision"
ADD CONSTRAINT "WorkspaceCandidateDecision_candidateUserId_fkey"
FOREIGN KEY ("candidateUserId") REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "WorkspaceCandidateDecision"
ADD CONSTRAINT "WorkspaceCandidateDecision_reviewerUserId_fkey"
FOREIGN KEY ("reviewerUserId") REFERENCES "User"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
