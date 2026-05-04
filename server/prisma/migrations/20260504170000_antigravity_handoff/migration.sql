CREATE TABLE "AntigravityHandoff" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "interviewId" TEXT NOT NULL,
    "antigravitySessionId" TEXT,
    "launchTokenHash" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'created',
    "returnUrl" TEXT,
    "launchPayload" JSONB NOT NULL,
    "lastError" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "launchedAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AntigravityHandoff_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AntigravityHandoff_interviewId_key" ON "AntigravityHandoff"("interviewId");
CREATE UNIQUE INDEX "AntigravityHandoff_launchTokenHash_key" ON "AntigravityHandoff"("launchTokenHash");
CREATE INDEX "AntigravityHandoff_userId_status_idx" ON "AntigravityHandoff"("userId", "status");
CREATE INDEX "AntigravityHandoff_antigravitySessionId_idx" ON "AntigravityHandoff"("antigravitySessionId");
CREATE INDEX "AntigravityHandoff_expiresAt_idx" ON "AntigravityHandoff"("expiresAt");

ALTER TABLE "AntigravityHandoff" ADD CONSTRAINT "AntigravityHandoff_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AntigravityHandoff" ADD CONSTRAINT "AntigravityHandoff_interviewId_fkey"
  FOREIGN KEY ("interviewId") REFERENCES "Interview"("id") ON DELETE CASCADE ON UPDATE CASCADE;
