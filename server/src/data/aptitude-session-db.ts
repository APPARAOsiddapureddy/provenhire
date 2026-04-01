/**
 * DB-backed aptitude session storage. Persists answer key + marks key so retries
 * work across server restarts and multiple instances (load-balanced deployments).
 */

import { prisma } from "../config/prisma.js";

const TTL_MS = 2 * 60 * 60 * 1000; // 2 hours

export async function storeAptitudeSession(
  userId: string,
  questions: unknown,
  answerKey: Record<string, string>,
  marksKey: Record<string, number>
): Promise<void> {
  const expiresAt = new Date(Date.now() + TTL_MS);
  const now = new Date();
  await prisma.aptitudeSession.upsert({
    where: { userId },
    create: {
      userId,
      questions: questions as object,
      answerKey,
      marksKey,
      expiresAt,
      testStartedAt: now,
    },
    update: {
      questions: questions as object,
      answerKey,
      marksKey,
      expiresAt,
      testStartedAt: now,
    },
  });
}

export async function getAptitudeSession(userId: string): Promise<{
  questions: unknown;
  answerKey: Record<string, string>;
  marksKey: Record<string, number>;
  draft: unknown;
  testStartedAt: Date | null;
} | null> {
  const row = await prisma.aptitudeSession.findUnique({
    where: { userId },
  });
  if (!row || new Date() > row.expiresAt) {
    if (row) await prisma.aptitudeSession.delete({ where: { userId } }).catch(() => {});
    return null;
  }
  return {
    questions: row.questions,
    answerKey: row.answerKey as Record<string, string>,
    marksKey: row.marksKey as Record<string, number>,
    draft: row.draft,
    testStartedAt: row.testStartedAt ?? null,
  };
}

export async function updateAptitudeDraft(userId: string, draft: unknown): Promise<void> {
  await prisma.aptitudeSession
    .update({
      where: { userId },
      data: { draft: draft as object },
    })
    .catch((e) => {
      console.warn("[aptitude-session] draft update failed", e);
    });
}

export async function clearAptitudeSession(userId: string): Promise<void> {
  await prisma.aptitudeSession.delete({ where: { userId } }).catch(() => {});
}
