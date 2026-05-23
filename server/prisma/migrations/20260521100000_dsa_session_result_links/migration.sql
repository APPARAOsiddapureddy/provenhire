ALTER TABLE "DsaRoundResult" ADD COLUMN "roundSessionId" TEXT;
ALTER TABLE "DsaSubmission" ADD COLUMN "roundSessionId" TEXT;

CREATE UNIQUE INDEX "DsaRoundResult_roundSessionId_key" ON "DsaRoundResult"("roundSessionId");
CREATE INDEX "DsaSubmission_roundSessionId_idx" ON "DsaSubmission"("roundSessionId");
