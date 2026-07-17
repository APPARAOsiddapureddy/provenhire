CREATE TABLE "AntigravityReport" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "interviewId" TEXT NOT NULL,
    "handoffId" TEXT,
    "antigravitySessionId" TEXT NOT NULL,
    "schemaVersion" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'complete',
    "overallScore" DOUBLE PRECISION,
    "hireRecommendation" TEXT,
    "confidenceScore" DOUBLE PRECISION,
    "reportHash" TEXT NOT NULL,
    "report" JSONB NOT NULL,
    "evidencePacket" JSONB,
    "telemetrySummary" JSONB,
    "transcript" JSONB,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AntigravityReport_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AntigravityTelemetryEvent" (
    "id" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "antigravitySessionId" TEXT NOT NULL,
    "eventName" TEXT NOT NULL,
    "source" TEXT,
    "level" TEXT,
    "eventAt" TIMESTAMP(3) NOT NULL,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AntigravityTelemetryEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AntigravityReport_interviewId_key" ON "AntigravityReport"("interviewId");
CREATE UNIQUE INDEX "AntigravityReport_antigravitySessionId_key" ON "AntigravityReport"("antigravitySessionId");
CREATE INDEX "AntigravityReport_userId_receivedAt_idx" ON "AntigravityReport"("userId", "receivedAt");
CREATE INDEX "AntigravityReport_handoffId_idx" ON "AntigravityReport"("handoffId");
CREATE INDEX "AntigravityReport_status_idx" ON "AntigravityReport"("status");
CREATE INDEX "AntigravityTelemetryEvent_antigravitySessionId_eventAt_idx" ON "AntigravityTelemetryEvent"("antigravitySessionId", "eventAt");
CREATE INDEX "AntigravityTelemetryEvent_userId_eventAt_idx" ON "AntigravityTelemetryEvent"("userId", "eventAt");
CREATE INDEX "AntigravityTelemetryEvent_eventName_idx" ON "AntigravityTelemetryEvent"("eventName");

ALTER TABLE "AntigravityReport" ADD CONSTRAINT "AntigravityReport_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AntigravityReport" ADD CONSTRAINT "AntigravityReport_interviewId_fkey"
  FOREIGN KEY ("interviewId") REFERENCES "Interview"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AntigravityTelemetryEvent" ADD CONSTRAINT "AntigravityTelemetryEvent_reportId_fkey"
  FOREIGN KEY ("reportId") REFERENCES "AntigravityReport"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AntigravityTelemetryEvent" ADD CONSTRAINT "AntigravityTelemetryEvent_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
