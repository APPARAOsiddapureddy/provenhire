-- Deduped profile view credits: one counted view per recruiter + candidate (PRD §5)

CREATE TABLE "RecruiterCandidateResumeView" (
    "id" TEXT NOT NULL,
    "recruiterId" TEXT NOT NULL,
    "candidateUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RecruiterCandidateResumeView_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "RecruiterCandidateResumeView_recruiterId_candidateUserId_key" ON "RecruiterCandidateResumeView"("recruiterId", "candidateUserId");
CREATE INDEX "RecruiterCandidateResumeView_recruiterId_idx" ON "RecruiterCandidateResumeView"("recruiterId");

ALTER TABLE "RecruiterCandidateResumeView" ADD CONSTRAINT "RecruiterCandidateResumeView_recruiterId_fkey" FOREIGN KEY ("recruiterId") REFERENCES "RecruiterProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
