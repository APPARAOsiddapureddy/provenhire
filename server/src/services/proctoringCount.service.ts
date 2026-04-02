import { prisma } from "../config/prisma.js";

const COOLDOWN_MS = 15_000;

const THRESHOLDS: Record<string, { warn: number; stop: number }> = {
  MULTIPLE_FACES_DETECTED: { warn: 3, stop: 5 },
  PHONE_DETECTED: { warn: 2, stop: 3 },
  TAB_SWITCH: { warn: 3, stop: 7 },
  WINDOW_FOCUS_LOST: { warn: 3, stop: 7 },
  FULLSCREEN_EXIT: { warn: 3, stop: 7 },
  NO_FACE_DETECTED: { warn: 5, stop: 12 },
  COPY_PASTE_ATTEMPT: { warn: 2, stop: 5 },
  DEVTOOLS_OPENED: { warn: 1, stop: 2 },
  SUSPICIOUS_BACKGROUND_NOISE: { warn: 4, stop: 10 },
  MULTIPLE_VOICES_DETECTED: { warn: 3, stop: 6 },
  MICROPHONE_MUTED_ATTEMPT: { warn: 2, stop: 5 },
};

export type ProctoringClientAction = "CONTINUE" | "SHOW_WARNING" | "STOP_TEST";

export async function incrementEventCount(params: {
  userId: string;
  sessionId: string;
  testType: string;
  eventType: string;
}): Promise<{ newCount: number; shouldStop: boolean; shouldWarn: boolean; skippedCooldown: boolean }> {
  const { userId, sessionId, testType, eventType } = params;
  const now = new Date();

  const existing = await prisma.proctoringEventCount.findUnique({
    where: { sessionId_eventType: { sessionId, eventType } },
  });

  if (existing && now.getTime() - existing.lastOccurredAt.getTime() < COOLDOWN_MS) {
    return {
      newCount: existing.count,
      shouldStop: false,
      shouldWarn: false,
      skippedCooldown: true,
    };
  }

  const record = await prisma.proctoringEventCount.upsert({
    where: { sessionId_eventType: { sessionId, eventType } },
    update: {
      count: { increment: 1 },
      lastOccurredAt: now,
      userId,
      testType,
    },
    create: {
      userId,
      sessionId,
      testType,
      eventType,
      count: 1,
      lastOccurredAt: now,
    },
  });

  const count = record.count;
  const t = THRESHOLDS[eventType] ?? { warn: 5, stop: 10 };
  return {
    newCount: count,
    shouldStop: count >= t.stop,
    shouldWarn: count === t.warn,
    skippedCooldown: false,
  };
}

export function toClientAction(params: {
  shouldStop: boolean;
  shouldWarn: boolean;
  skippedCooldown: boolean;
}): ProctoringClientAction {
  if (params.skippedCooldown) return "CONTINUE";
  if (params.shouldStop) return "STOP_TEST";
  if (params.shouldWarn) return "SHOW_WARNING";
  return "CONTINUE";
}

export async function getSessionEventCounts(sessionId: string) {
  return prisma.proctoringEventCount.findMany({
    where: { sessionId },
    orderBy: { eventType: "asc" },
  });
}

/** Thresholds used for warn/stop actions (admin signal breakdown). */
export function getProctoringCountThresholdsForEvent(eventType: string): { warn: number; stop: number } {
  return THRESHOLDS[eventType] ?? { warn: 5, stop: 10 };
}

export async function computeIntegrityFlagFromSessionCounts(sessionId: string): Promise<string | null> {
  const counts = await getSessionEventCounts(sessionId);
  const totalRows = counts.reduce((sum, c) => sum + c.count, 0);
  const maxPerType = counts.length ? Math.max(...counts.map((c) => c.count), 0) : 0;

  if (maxPerType >= 10 || totalRows >= 40) return "integrity_violation";
  if (maxPerType >= 5 || totalRows >= 18) return "review_required";
  if (maxPerType >= 3 || totalRows >= 8) return "review_recommended";
  return null;
}
