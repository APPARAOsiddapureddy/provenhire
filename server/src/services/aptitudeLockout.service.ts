import { prisma } from "../config/prisma.js";
import { clearAptitudeSession } from "../data/aptitude-session-db.js";
import { countConsecutiveAptitudeFailures } from "../utils/aptitudeScoring.js";

export const APTITUDE_CONSECUTIVE_FAILURES_FOR_LOCKOUT = 3;
const LOCKOUT_MS = 30 * 24 * 60 * 60 * 1000;

export type AptitudeLockoutStatus =
  | { locked: false }
  | { locked: true; lockedUntil: Date };

export async function getAptitudeLockoutStatus(userId: string): Promise<AptitudeLockoutStatus> {
  const prof = await prisma.jobSeekerProfile.findUnique({
    where: { userId },
    select: { aptitudeLockedUntil: true },
  });
  const until = prof?.aptitudeLockedUntil;
  if (!until) return { locked: false };
  if (until.getTime() <= Date.now()) return { locked: false };
  return { locked: true, lockedUntil: until };
}

/** After a new AptitudeTestResult row exists, apply lockout + clear session if threshold reached. */
export async function applyAptitudeLockoutIfNeeded(userId: string): Promise<void> {
  const rows = await prisma.aptitudeTestResult.findMany({
    where: { userId },
    orderBy: { completedAt: "desc" },
    take: 24,
    select: { invalidated: true, score: true, answers: true },
  });
  const consecutive = countConsecutiveAptitudeFailures(rows);
  if (consecutive < APTITUDE_CONSECUTIVE_FAILURES_FOR_LOCKOUT) return;

  const lockedUntil = new Date(Date.now() + LOCKOUT_MS);
  await prisma.jobSeekerProfile.upsert({
    where: { userId },
    create: { userId, aptitudeLockedUntil: lockedUntil },
    update: { aptitudeLockedUntil: lockedUntil },
  });
  await clearAptitudeSession(userId);
}

export function cooldownPayloadFromLockout(lockedUntil: Date) {
  const ms = lockedUntil.getTime() - Date.now();
  const hoursRemaining = Math.max(0, Math.ceil(ms / (60 * 60 * 1000)));
  const daysRemaining = Math.max(0, Math.ceil(ms / (24 * 60 * 60 * 1000)));
  return {
    inCooldown: true as const,
    lockedUntil: lockedUntil.toISOString(),
    cooldownEndsAt: lockedUntil.toISOString(),
    hoursRemaining,
    daysRemaining,
  };
}
