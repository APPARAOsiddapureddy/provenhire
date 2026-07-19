import crypto from "crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "../config/prisma.js";

type JsonRecord = Record<string, unknown>;

function jsonValue(value: unknown): Prisma.InputJsonValue {
  if (value === null) return null as unknown as Prisma.InputJsonValue;
  if (["string", "number", "boolean"].includes(typeof value)) return value as string | number | boolean;
  if (Array.isArray(value)) return value.map((item) => jsonValue(item)) as Prisma.InputJsonArray;
  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as JsonRecord)
        .filter(([, item]) => item !== undefined)
        .map(([key, item]) => [key, jsonValue(item)]),
    ) as Prisma.InputJsonObject;
  }
  return String(value);
}

function numeric(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function eventDate(event: JsonRecord): Date {
  const iso = typeof event.iso_ts === "string" ? new Date(event.iso_ts) : null;
  if (iso && !Number.isNaN(iso.getTime())) return iso;
  const ts = numeric(event.ts);
  if (ts != null) return new Date(ts * 1000);
  return new Date();
}

export async function persistAntigravityReportArtifact(input: {
  userId: string;
  interviewId: string;
  handoffId?: string | null;
  antigravitySessionId: string;
  report: JsonRecord;
}) {
  const { telemetry_events: rawEvents, ...reportWithoutEvents } = input.report;
  const serialized = JSON.stringify(reportWithoutEvents);
  const reportHash = crypto.createHash("sha256").update(serialized).digest("hex");
  const schemaVersion = String(reportWithoutEvents.schema_version || "legacy_report");
  const evidencePacket = reportWithoutEvents.final_evidence_packet;
  const telemetrySummary = reportWithoutEvents.telemetry_summary;
  const transcript = reportWithoutEvents.history;

  const artifact = await prisma.antigravityReport.upsert({
    where: { interviewId: input.interviewId },
    create: {
      userId: input.userId,
      interviewId: input.interviewId,
      handoffId: input.handoffId || null,
      antigravitySessionId: input.antigravitySessionId,
      schemaVersion,
      status: reportWithoutEvents.complete === false ? "incomplete" : "complete",
      overallScore: numeric(reportWithoutEvents.overall_score),
      hireRecommendation: typeof reportWithoutEvents.hire_recommendation === "string" ? reportWithoutEvents.hire_recommendation : null,
      confidenceScore: numeric(reportWithoutEvents.confidence_score),
      reportHash,
      report: jsonValue(reportWithoutEvents),
      evidencePacket: evidencePacket == null ? undefined : jsonValue(evidencePacket),
      telemetrySummary: telemetrySummary == null ? undefined : jsonValue(telemetrySummary),
      transcript: transcript == null ? undefined : jsonValue(transcript),
    },
    update: {
      handoffId: input.handoffId || undefined,
      antigravitySessionId: input.antigravitySessionId,
      schemaVersion,
      status: reportWithoutEvents.complete === false ? "incomplete" : "complete",
      overallScore: numeric(reportWithoutEvents.overall_score),
      hireRecommendation: typeof reportWithoutEvents.hire_recommendation === "string" ? reportWithoutEvents.hire_recommendation : null,
      confidenceScore: numeric(reportWithoutEvents.confidence_score),
      reportHash,
      report: jsonValue(reportWithoutEvents),
      evidencePacket: evidencePacket == null ? undefined : jsonValue(evidencePacket),
      telemetrySummary: telemetrySummary == null ? undefined : jsonValue(telemetrySummary),
      transcript: transcript == null ? undefined : jsonValue(transcript),
      receivedAt: new Date(),
    },
    select: { id: true, reportHash: true },
  });

  const events = Array.isArray(rawEvents) ? rawEvents.filter((item): item is JsonRecord => Boolean(item && typeof item === "object")) : [];
  if (events.length > 0) {
    await prisma.antigravityTelemetryEvent.createMany({
      data: events.slice(0, 10_000).map((event, index) => ({
        id: typeof event.event_id === "string" && event.event_id ? event.event_id : crypto
          .createHash("sha256")
          .update(`${input.antigravitySessionId}|${event.ts ?? ""}|${event.event ?? ""}|${index}`)
          .digest("hex"),
        reportId: artifact.id,
        userId: input.userId,
        antigravitySessionId: input.antigravitySessionId,
        eventName: String(event.event || "unknown"),
        source: typeof event.source === "string" ? event.source : null,
        level: typeof event.level === "string" ? event.level : null,
        eventAt: eventDate(event),
        payload: jsonValue(event),
      })),
      skipDuplicates: true,
    });
  }

  return { ...artifact, telemetryEventsAccepted: events.length };
}

/**
 * Append one telemetry fact that Antigravity emitted after its final-report
 * snapshot. Event ids are globally idempotent, so durable outbox retries cannot
 * duplicate facts in a candidate dossier.
 */
export async function appendAntigravityTelemetryEvent(input: {
  handoffId: string;
  antigravitySessionId: string;
  event: JsonRecord;
}) {
  const artifact = await prisma.antigravityReport.findFirst({
    where: {
      handoffId: input.handoffId,
      antigravitySessionId: input.antigravitySessionId,
    },
    select: { id: true, userId: true },
  });
  if (!artifact) return null;

  const eventId =
    typeof input.event.event_id === "string" && input.event.event_id
      ? input.event.event_id
      : crypto
          .createHash("sha256")
          .update(
            `${input.antigravitySessionId}|${input.event.ts ?? ""}|${input.event.event ?? ""}`,
          )
          .digest("hex");
  const result = await prisma.antigravityTelemetryEvent.createMany({
    data: [
      {
        id: eventId,
        reportId: artifact.id,
        userId: artifact.userId,
        antigravitySessionId: input.antigravitySessionId,
        eventName: String(input.event.event || "unknown"),
        source:
          typeof input.event.source === "string" ? input.event.source : null,
        level: typeof input.event.level === "string" ? input.event.level : null,
        eventAt: eventDate(input.event),
        payload: jsonValue(input.event),
      },
    ],
    skipDuplicates: true,
  });
  return { eventId, inserted: result.count === 1 };
}
