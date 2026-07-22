CREATE TABLE "WorkspaceAuditEvent" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "actorUserId" TEXT,
    "eventType" TEXT NOT NULL,
    "targetUserId" TEXT,
    "targetEmail" TEXT,
    "detail" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkspaceAuditEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "WorkspaceAuditEvent_workspaceId_createdAt_idx"
ON "WorkspaceAuditEvent"("workspaceId", "createdAt");

CREATE INDEX "WorkspaceAuditEvent_actorUserId_createdAt_idx"
ON "WorkspaceAuditEvent"("actorUserId", "createdAt");

CREATE INDEX "WorkspaceAuditEvent_eventType_createdAt_idx"
ON "WorkspaceAuditEvent"("eventType", "createdAt");
