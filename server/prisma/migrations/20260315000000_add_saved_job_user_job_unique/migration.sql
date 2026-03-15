-- Remove duplicate SavedJob rows (keep one per userId, jobId with smallest id)
DELETE FROM "SavedJob" a
USING "SavedJob" b
WHERE a.id > b.id AND a."userId" = b."userId" AND a."jobId" = b."jobId";

-- CreateIndex
CREATE UNIQUE INDEX "SavedJob_userId_jobId_key" ON "SavedJob"("userId", "jobId");
