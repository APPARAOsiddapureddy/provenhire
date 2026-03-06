/**
 * DB-backed aptitude session storage. Persists answer key + marks key so retries
 * work across server restarts and multiple instances (load-balanced deployments).
 */

import { prisma } from "../config/prisma.js";

const TTL_MS = 2 * 60 * 60 * 1000; // 2 hours

export async function storeAptitudeSession(
  userId: string,
  answerKey: Record<string, string>,
  marksKey: Record<string, number>
): Promise<void> {
  const expiresAt = new Date(Date.now() + TTL_MS);
  await prisma.aptitudeSession.upsert({
    where: { userId },
    create: { userId, answerKey, marksKey, expiresAt },
    update: { answerKey, marksKey, expiresAt },
  });
}

export async function getAptitudeSession(userId: string): Promise<{
  answerKey: Record<string, string>;
  marksKey: Record<string, number>;
} | null> {
  const row = await prisma.aptitudeSession.findUnique({
    where: { userId },
  });
  if (!row || new Date() > row.expiresAt) {
    if (row) await prisma.aptitudeSession.delete({ where: { userId } }).catch(() => {});
    return null;
  }
  return {
    answerKey: row.answerKey as Record<string, string>,
    marksKey: row.marksKey as Record<string, number>,
  };
}

export async function clearAptitudeSession(userId: string): Promise<void> {
  await prisma.aptitudeSession.delete({ where: { userId } }).catch(() => {});
}
