CREATE INDEX IF NOT EXISTS "VerificationStage_stageName_status_idx" ON "VerificationStage"("stageName", "status");
CREATE INDEX IF NOT EXISTS "VerificationStage_userId_status_idx" ON "VerificationStage"("userId", "status");
CREATE INDEX IF NOT EXISTS "Interview_userId_interviewType_status_idx" ON "Interview"("userId", "interviewType", "status");
CREATE INDEX IF NOT EXISTS "Interview_userId_interviewType_status_completedAt_idx" ON "Interview"("userId", "interviewType", "status", "completedAt");
CREATE INDEX IF NOT EXISTS "DsaRoundResult_userId_completedAt_idx" ON "DsaRoundResult"("userId", "completedAt");
CREATE INDEX IF NOT EXISTS "DataRoundResult_userId_completedAt_idx" ON "DataRoundResult"("userId", "completedAt");
