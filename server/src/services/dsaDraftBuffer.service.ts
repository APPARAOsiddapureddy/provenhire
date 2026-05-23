import Redis from "ioredis";
import { prisma } from "../config/prisma.js";

const REDIS_URL = process.env.REDIS_URL?.trim();
const CODE_DIRTY_SET = "dsa:dirty:code";
const FOLLOWUP_DIRTY_SET = "dsa:dirty:followup";
const SESSION_DIRTY_SET = "dsa:dirty:session";
const FLUSH_INTERVAL_MS = Math.max(1000, parseInt(process.env.DSA_SESSION_FLUSH_INTERVAL_MS ?? "10000", 10));
const FLUSH_BATCH_SIZE = Math.max(10, parseInt(process.env.DSA_SESSION_FLUSH_BATCH_SIZE ?? "500", 10));

let redis: Redis | null | undefined;
let flushTimer: NodeJS.Timeout | null = null;

export type BufferedCodeDraft = {
  roundSessionId: string;
  userId: string;
  questionId: string;
  language: string;
  code: string;
  updatedAt: string;
};

export type BufferedFollowUpAnswers = {
  roundSessionId: string;
  userId: string;
  questionId: string;
  answers: Record<string, string>;
  updatedAt: string;
};

export type BufferedSessionState = {
  roundSessionId: string;
  userId: string;
  activeQId?: string | null;
  updatedAt: string;
};

function codeKey(roundSessionId: string, questionId: string, language: string): string {
  return `dsa:code:${roundSessionId}:${questionId}:${language}`;
}

function followUpKey(roundSessionId: string, questionId: string): string {
  return `dsa:followup:${roundSessionId}:${questionId}`;
}

function sessionKey(roundSessionId: string): string {
  return `dsa:session:${roundSessionId}`;
}

export function getDsaRedis(): Redis | null {
  if (!REDIS_URL) return null;
  if (redis !== undefined) return redis;
  redis = new Redis(REDIS_URL, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    lazyConnect: true,
  });
  redis.on("error", (err) => {
    console.warn("[dsa-redis] Redis unavailable; falling back where possible:", err.message);
  });
  void redis.connect().catch((err) => {
    console.warn("[dsa-redis] connect failed:", err instanceof Error ? err.message : err);
  });
  return redis;
}

async function readJson<T>(key: string): Promise<T | null> {
  const client = getDsaRedis();
  if (!client) return null;
  const raw = await client.get(key).catch(() => null);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export async function bufferCodeDraft(input: Omit<BufferedCodeDraft, "updatedAt">): Promise<void> {
  const payload: BufferedCodeDraft = { ...input, updatedAt: new Date().toISOString() };
  const client = getDsaRedis();
  if (!client) {
    await upsertCodeDraft(payload);
    return;
  }
  const key = codeKey(input.roundSessionId, input.questionId, input.language);
  await client.multi().set(key, JSON.stringify(payload)).sadd(CODE_DIRTY_SET, key).exec();
}

export async function bufferFollowUpAnswers(input: Omit<BufferedFollowUpAnswers, "updatedAt">): Promise<void> {
  const payload: BufferedFollowUpAnswers = { ...input, updatedAt: new Date().toISOString() };
  const client = getDsaRedis();
  if (!client) {
    await upsertFollowUpAnswers(payload);
    return;
  }
  const key = followUpKey(input.roundSessionId, input.questionId);
  await client.multi().set(key, JSON.stringify(payload)).sadd(FOLLOWUP_DIRTY_SET, key).exec();
}

export async function bufferSessionState(input: Omit<BufferedSessionState, "updatedAt">): Promise<void> {
  const payload: BufferedSessionState = { ...input, updatedAt: new Date().toISOString() };
  const client = getDsaRedis();
  if (!client) {
    await updateSessionState(payload);
    return;
  }
  const key = sessionKey(input.roundSessionId);
  await client.multi().set(key, JSON.stringify(payload)).sadd(SESSION_DIRTY_SET, key).exec();
}

async function upsertCodeDraft(payload: BufferedCodeDraft): Promise<void> {
  await prisma.dsaCodeSession.upsert({
    where: {
      roundSessionId_questionId_language: {
        roundSessionId: payload.roundSessionId,
        questionId: payload.questionId,
        language: payload.language,
      },
    },
    create: {
      roundSessionId: payload.roundSessionId,
      userId: payload.userId,
      questionId: payload.questionId,
      language: payload.language,
      code: payload.code,
    },
    update: {
      code: payload.code,
    },
  });
}

async function upsertFollowUpAnswers(payload: BufferedFollowUpAnswers): Promise<void> {
  await prisma.dsaFollowUpSession.upsert({
    where: {
      roundSessionId_questionId: {
        roundSessionId: payload.roundSessionId,
        questionId: payload.questionId,
      },
    },
    create: {
      roundSessionId: payload.roundSessionId,
      userId: payload.userId,
      questionId: payload.questionId,
      answers: payload.answers,
      startTime: new Date(),
      expTime: new Date(Date.now() + 2 * 60 * 1000),
    },
    update: {
      answers: payload.answers,
    },
  });
}

async function updateSessionState(payload: BufferedSessionState): Promise<void> {
  await prisma.dsaRoundSession.updateMany({
    where: {
      id: payload.roundSessionId,
      userId: payload.userId,
    },
    data: {
      activeQId: payload.activeQId ?? null,
    },
  });
}

async function flushSet<T>(setName: string, writer: (payload: T) => Promise<void>): Promise<number> {
  const client = getDsaRedis();
  if (!client) return 0;
  const keys = await client.spop(setName, FLUSH_BATCH_SIZE);
  const list = Array.isArray(keys) ? keys : keys ? [keys] : [];
  if (list.length === 0) return 0;
  const values = await client.mget(list);
  let flushed = 0;
  for (let i = 0; i < list.length; i++) {
    const raw = values[i];
    if (!raw) continue;
    try {
      await writer(JSON.parse(raw) as T);
      flushed++;
    } catch (err) {
      await client.sadd(setName, list[i]!);
      console.warn("[dsa-draft-buffer] flush failed:", err instanceof Error ? err.message : err);
    }
  }
  return flushed;
}

export async function flushDsaDraftBuffersOnce(): Promise<void> {
  await flushSet<BufferedSessionState>(SESSION_DIRTY_SET, updateSessionState);
  await flushSet<BufferedFollowUpAnswers>(FOLLOWUP_DIRTY_SET, upsertFollowUpAnswers);
  await flushSet<BufferedCodeDraft>(CODE_DIRTY_SET, upsertCodeDraft);
}

export function startDsaDraftBufferFlusher(): void {
  if (flushTimer || !getDsaRedis()) return;
  flushTimer = setInterval(() => {
    flushDsaDraftBuffersOnce().catch((err) => {
      console.warn("[dsa-draft-buffer] scheduled flush failed:", err instanceof Error ? err.message : err);
    });
  }, FLUSH_INTERVAL_MS);
  flushTimer.unref?.();
}

export async function getLatestCodeDraftsForQuestion(
  roundSessionId: string,
  questionId: string,
  languages: readonly string[],
): Promise<BufferedCodeDraft[]> {
  const client = getDsaRedis();
  const buffered: BufferedCodeDraft[] = [];
  if (client) {
    const keys = languages.map((language) => codeKey(roundSessionId, questionId, language));
    const values = await client.mget(keys).catch(() => []);
    for (const raw of values) {
      if (!raw) continue;
      try {
        buffered.push(JSON.parse(raw) as BufferedCodeDraft);
      } catch {
        /* ignore bad cache row */
      }
    }
  }

  const dbRows = await prisma.dsaCodeSession.findMany({
    where: { roundSessionId, questionId },
    orderBy: { updatedAt: "desc" },
  });
  const byLang = new Map<string, BufferedCodeDraft>();
  for (const row of dbRows) {
    byLang.set(row.language, {
      roundSessionId: row.roundSessionId,
      userId: row.userId,
      questionId: row.questionId,
      language: row.language,
      code: row.code,
      updatedAt: row.updatedAt.toISOString(),
    });
  }
  for (const row of buffered) byLang.set(row.language, row);
  return Array.from(byLang.values()).sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
}

export async function getFollowUpAnswers(
  roundSessionId: string,
  questionId: string,
): Promise<Record<string, string> | null> {
  const buffered = await readJson<BufferedFollowUpAnswers>(followUpKey(roundSessionId, questionId));
  if (buffered?.answers) return buffered.answers;
  const row = await prisma.dsaFollowUpSession.findUnique({
    where: { roundSessionId_questionId: { roundSessionId, questionId } },
    select: { answers: true },
  });
  return row?.answers && typeof row.answers === "object" && !Array.isArray(row.answers)
    ? (row.answers as Record<string, string>)
    : null;
}

export async function flushDsaSessionBuffers(roundSessionId: string, questionIds: string[], languages: readonly string[]): Promise<void> {
  const client = getDsaRedis();
  if (!client) return;
  const keys = [
    sessionKey(roundSessionId),
    ...questionIds.map((questionId) => followUpKey(roundSessionId, questionId)),
    ...questionIds.flatMap((questionId) => languages.map((language) => codeKey(roundSessionId, questionId, language))),
  ];
  const values = await client.mget(keys);
  for (let i = 0; i < keys.length; i++) {
    const raw = values[i];
    if (!raw) continue;
    try {
      const parsed = JSON.parse(raw);
      if (keys[i]!.startsWith("dsa:session:")) await updateSessionState(parsed);
      else if (keys[i]!.startsWith("dsa:followup:")) await upsertFollowUpAnswers(parsed);
      else if (keys[i]!.startsWith("dsa:code:")) await upsertCodeDraft(parsed);
    } catch {
      /* ignore */
    }
  }
}
