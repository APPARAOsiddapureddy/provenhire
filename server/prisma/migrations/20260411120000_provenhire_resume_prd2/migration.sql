-- ProvenHire Resume (PRD v2): evidence-backed resume row + change requests

CREATE TABLE "ProvenHireResume" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "certificationLevel" TEXT NOT NULL DEFAULT 'L0',
    "certificationDate" TIMESTAMP(3),
    "verifiedSkills" JSONB NOT NULL DEFAULT '[]',
    "claimedSkills" JSONB NOT NULL DEFAULT '[]',
    "projects" JSONB NOT NULL DEFAULT '[]',
    "assessmentScores" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUpdatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isPublic" BOOLEAN NOT NULL DEFAULT false,
    "pendingCandidateReview" BOOLEAN NOT NULL DEFAULT false,
    "shareableHandle" TEXT NOT NULL,

    CONSTRAINT "ProvenHireResume_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ProvenHireResume_userId_key" ON "ProvenHireResume"("userId");
CREATE UNIQUE INDEX "ProvenHireResume_shareableHandle_key" ON "ProvenHireResume"("shareableHandle");
CREATE INDEX "ProvenHireResume_shareableHandle_idx" ON "ProvenHireResume"("shareableHandle");

ALTER TABLE "ProvenHireResume" ADD CONSTRAINT "ProvenHireResume_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "ResumeChangeRequest" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "section" TEXT NOT NULL,
    "note" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ResumeChangeRequest_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ResumeChangeRequest_userId_idx" ON "ResumeChangeRequest"("userId");
CREATE INDEX "ResumeChangeRequest_status_idx" ON "ResumeChangeRequest"("status");

ALTER TABLE "ResumeChangeRequest" ADD CONSTRAINT "ResumeChangeRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
