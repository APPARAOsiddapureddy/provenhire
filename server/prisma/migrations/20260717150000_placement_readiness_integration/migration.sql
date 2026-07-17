CREATE TABLE "PlacementReadinessHandoff" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "workspaceRoundAttemptId" TEXT NOT NULL,
    "placementSessionId" TEXT,
    "launchTokenHash" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'created',
    "returnUrl" TEXT NOT NULL,
    "launchPayload" JSONB NOT NULL,
    "lastError" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "launchedAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PlacementReadinessHandoff_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PlacementReadinessArtifact" (
    "id" TEXT NOT NULL,
    "handoffId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "workspaceRoundAttemptId" TEXT NOT NULL,
    "placementSessionId" TEXT NOT NULL,
    "schemaVersion" TEXT NOT NULL,
    "reportHash" TEXT NOT NULL,
    "artifact" JSONB NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PlacementReadinessArtifact_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PlacementReadinessCallbackEvent" (
    "id" TEXT NOT NULL,
    "handoffId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PlacementReadinessCallbackEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PlacementReadinessHandoff_workspaceRoundAttemptId_key" ON "PlacementReadinessHandoff"("workspaceRoundAttemptId");
CREATE UNIQUE INDEX "PlacementReadinessHandoff_placementSessionId_key" ON "PlacementReadinessHandoff"("placementSessionId");
CREATE UNIQUE INDEX "PlacementReadinessHandoff_launchTokenHash_key" ON "PlacementReadinessHandoff"("launchTokenHash");
CREATE INDEX "PlacementReadinessHandoff_userId_status_idx" ON "PlacementReadinessHandoff"("userId", "status");
CREATE INDEX "PlacementReadinessHandoff_workspaceId_status_idx" ON "PlacementReadinessHandoff"("workspaceId", "status");
CREATE INDEX "PlacementReadinessHandoff_expiresAt_idx" ON "PlacementReadinessHandoff"("expiresAt");
CREATE UNIQUE INDEX "PlacementReadinessArtifact_handoffId_key" ON "PlacementReadinessArtifact"("handoffId");
CREATE UNIQUE INDEX "PlacementReadinessArtifact_workspaceRoundAttemptId_key" ON "PlacementReadinessArtifact"("workspaceRoundAttemptId");
CREATE UNIQUE INDEX "PlacementReadinessArtifact_placementSessionId_key" ON "PlacementReadinessArtifact"("placementSessionId");
CREATE INDEX "PlacementReadinessArtifact_userId_receivedAt_idx" ON "PlacementReadinessArtifact"("userId", "receivedAt");
CREATE INDEX "PlacementReadinessArtifact_workspaceId_receivedAt_idx" ON "PlacementReadinessArtifact"("workspaceId", "receivedAt");
CREATE INDEX "PlacementReadinessCallbackEvent_handoffId_receivedAt_idx" ON "PlacementReadinessCallbackEvent"("handoffId", "receivedAt");
CREATE INDEX "PlacementReadinessCallbackEvent_eventType_receivedAt_idx" ON "PlacementReadinessCallbackEvent"("eventType", "receivedAt");

ALTER TABLE "PlacementReadinessHandoff" ADD CONSTRAINT "PlacementReadinessHandoff_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PlacementReadinessHandoff" ADD CONSTRAINT "PlacementReadinessHandoff_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PlacementReadinessHandoff" ADD CONSTRAINT "PlacementReadinessHandoff_workspaceRoundAttemptId_fkey" FOREIGN KEY ("workspaceRoundAttemptId") REFERENCES "WorkspaceRoundAttempt"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PlacementReadinessArtifact" ADD CONSTRAINT "PlacementReadinessArtifact_handoffId_fkey" FOREIGN KEY ("handoffId") REFERENCES "PlacementReadinessHandoff"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PlacementReadinessArtifact" ADD CONSTRAINT "PlacementReadinessArtifact_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PlacementReadinessArtifact" ADD CONSTRAINT "PlacementReadinessArtifact_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PlacementReadinessArtifact" ADD CONSTRAINT "PlacementReadinessArtifact_workspaceRoundAttemptId_fkey" FOREIGN KEY ("workspaceRoundAttemptId") REFERENCES "WorkspaceRoundAttempt"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PlacementReadinessCallbackEvent" ADD CONSTRAINT "PlacementReadinessCallbackEvent_handoffId_fkey" FOREIGN KEY ("handoffId") REFERENCES "PlacementReadinessHandoff"("id") ON DELETE CASCADE ON UPDATE CASCADE;
