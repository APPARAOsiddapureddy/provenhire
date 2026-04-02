/**
 * DB-backed aptitude session storage. Persists answer key + marks key so retries
 * work across server restarts and multiple instances (load-balanced deployments).
 */

import { prisma } from "../config/prisma.js";
import { clearAnswerKey } from "./aptitude-loader.js";

const TTL_MS = 2 * 60 * 60 * 1000; // 2 hours

/** Prisma client expects `testStartedAt`; if deploy ran before `migrate deploy`, SELECT fails. Self-heal once. */
let aptitudeSessionSchemaReady = false;
let aptitudeSessionSchemaPromise: Promise<void> | null = null;

async function ensureAptitudeSessionSchema(): Promise<void> {
  if (aptitudeSessionSchemaReady) return;
  if (!aptitudeSessionSchemaPromise) {
    aptitudeSessionSchemaPromise = (async () => {
      await prisma.$executeRaw`
        ALTER TABLE "AptitudeSession" ADD COLUMN IF NOT EXISTS "testStartedAt" TIMESTAMP(3);
      `;
      aptitudeSessionSchemaReady = true;
    })();
  }
  try {
    await aptitudeSessionSchemaPromise;
  } catch (e) {
    aptitudeSessionSchemaPromise = null;
    console.error("[aptitude-session] ensure schema (testStartedAt) failed:", e);
    throw e;
  }
}

export async function storeAptitudeSession(
  userId: string,
  questions: unknown,
  answerKey: Record<string, string>,
  marksKey: Record<string, number>,
  questionSet?: string | null
): Promise<void> {
  await ensureAptitudeSessionSchema();
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
      questionSet: questionSet ?? null,
    },
    update: {
      questions: questions as object,
      answerKey,
      marksKey,
      expiresAt,
      testStartedAt: now,
      questionSet: questionSet ?? undefined,
    },
  });
}

export async function getAptitudeSession(userId: string): Promise<{
  questions: unknown;
  answerKey: Record<string, string>;
  marksKey: Record<string, number>;
  draft: unknown;
  testStartedAt: Date | null;
  questionSet: string | null;
} | null> {
  await ensureAptitudeSessionSchema();
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
    questionSet: row.questionSet ?? null,
  };
}

export async function updateAptitudeDraft(userId: string, draft: unknown): Promise<void> {
  await ensureAptitudeSessionSchema();
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
  try {
    await ensureAptitudeSessionSchema();
    await prisma.aptitudeSession.delete({ where: { userId } }).catch(() => {});
  } catch {
    /* schema/table missing — still clear memory */
  }
  clearAnswerKey(userId);
}
