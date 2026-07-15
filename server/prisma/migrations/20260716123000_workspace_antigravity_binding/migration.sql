ALTER TABLE "WorkspaceRoundAttempt"
ADD COLUMN "interviewId" TEXT;

CREATE UNIQUE INDEX "WorkspaceRoundAttempt_interviewId_key"
ON "WorkspaceRoundAttempt"("interviewId");

ALTER TABLE "WorkspaceRoundAttempt"
ADD CONSTRAINT "WorkspaceRoundAttempt_interviewId_fkey"
FOREIGN KEY ("interviewId") REFERENCES "Interview"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
