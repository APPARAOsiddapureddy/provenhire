CREATE TABLE "DsaRoundSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "questionIds" TEXT[] NOT NULL,
    "startTime" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expTime" TIMESTAMP(3) NOT NULL,
    "pausedTime" TIMESTAMP(3),
    "activeQId" TEXT,
    "activeFollowUpId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DsaRoundSession_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DsaCodeSession" (
    "id" TEXT NOT NULL,
    "roundSessionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "language" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DsaCodeSession_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DsaFollowUpSession" (
    "id" TEXT NOT NULL,
    "roundSessionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "answers" JSONB,
    "startTime" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expTime" TIMESTAMP(3) NOT NULL,
    "pausedTime" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DsaFollowUpSession_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "DsaRoundSession_userId_idx" ON "DsaRoundSession"("userId");
CREATE INDEX "DsaRoundSession_expTime_idx" ON "DsaRoundSession"("expTime");

CREATE UNIQUE INDEX "DsaCodeSession_roundSessionId_questionId_language_key"
  ON "DsaCodeSession"("roundSessionId", "questionId", "language");
CREATE INDEX "DsaCodeSession_userId_idx" ON "DsaCodeSession"("userId");
CREATE INDEX "DsaCodeSession_roundSessionId_questionId_idx"
  ON "DsaCodeSession"("roundSessionId", "questionId");

CREATE UNIQUE INDEX "DsaFollowUpSession_roundSessionId_questionId_key"
  ON "DsaFollowUpSession"("roundSessionId", "questionId");
CREATE INDEX "DsaFollowUpSession_userId_idx" ON "DsaFollowUpSession"("userId");
CREATE INDEX "DsaFollowUpSession_expTime_idx" ON "DsaFollowUpSession"("expTime");

ALTER TABLE "DsaRoundSession" ADD CONSTRAINT "DsaRoundSession_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DsaCodeSession" ADD CONSTRAINT "DsaCodeSession_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DsaCodeSession" ADD CONSTRAINT "DsaCodeSession_roundSessionId_fkey"
  FOREIGN KEY ("roundSessionId") REFERENCES "DsaRoundSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DsaCodeSession" ADD CONSTRAINT "DsaCodeSession_questionId_fkey"
  FOREIGN KEY ("questionId") REFERENCES "DsaQuestion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DsaFollowUpSession" ADD CONSTRAINT "DsaFollowUpSession_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DsaFollowUpSession" ADD CONSTRAINT "DsaFollowUpSession_roundSessionId_fkey"
  FOREIGN KEY ("roundSessionId") REFERENCES "DsaRoundSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DsaFollowUpSession" ADD CONSTRAINT "DsaFollowUpSession_questionId_fkey"
  FOREIGN KEY ("questionId") REFERENCES "DsaQuestion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
