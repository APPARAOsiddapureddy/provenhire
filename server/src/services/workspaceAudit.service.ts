import { Prisma } from "@prisma/client";
import { prisma } from "../config/prisma.js";

export async function recordWorkspaceAuditEvent(input: {
  workspaceId: string;
  actorUserId?: string | null;
  eventType: string;
  targetUserId?: string | null;
  targetEmail?: string | null;
  detail?: unknown;
}) {
  const event = await prisma.workspaceAuditEvent.create({
    data: {
      workspaceId: input.workspaceId,
      actorUserId: input.actorUserId ?? null,
      eventType: input.eventType,
      targetUserId: input.targetUserId ?? null,
      targetEmail: input.targetEmail ?? null,
      detail:
        input.detail === undefined
          ? undefined
          : (JSON.parse(JSON.stringify(input.detail)) as Prisma.InputJsonValue),
    },
  });
  console.info(JSON.stringify({
    level: "info",
    event: "workspace_audit_event",
    auditEventId: event.id,
    workspaceId: input.workspaceId,
    actorUserId: input.actorUserId ?? null,
    eventType: input.eventType,
    targetUserId: input.targetUserId ?? null,
    targetEmail: input.targetEmail ?? null,
  }));
  return event;
}

export async function listWorkspaceAuditEvents(workspaceId: string, limit = 200) {
  return prisma.workspaceAuditEvent.findMany({
    where: { workspaceId },
    orderBy: { createdAt: "desc" },
    take: Math.min(Math.max(limit, 1), 500),
  });
}
