import { Queue, Worker, type JobsOptions } from "bullmq";
import Redis from "ioredis";
import { prisma } from "../config/prisma.js";
import { finalizeWorkspaceSqlSession } from "./workspaceSqlFinalize.service.js";

const REDIS_URL = process.env.REDIS_URL?.trim();
const QUEUE_NAME = "workspace-sql-session";
const AUTO_FINALIZE_BUFFER_MS = Math.max(0, parseInt(process.env.SQL_AUTO_FINALIZE_BUFFER_MS ?? "5000", 10));
const ENQUEUE_TIMEOUT_MS = Math.max(250, parseInt(process.env.SQL_QUEUE_ENQUEUE_TIMEOUT_MS ?? "1000", 10));
const LOCAL_SWEEP_INTERVAL_MS = Math.max(15_000, parseInt(process.env.SQL_LOCAL_FINALIZE_SWEEP_MS ?? "60000", 10));

let queue: Queue<{ sqlSessionId: string }> | null | undefined;
let worker: Worker<{ sqlSessionId: string }> | null = null;
let localSweep: ReturnType<typeof setInterval> | null = null;
const localTimers = new Map<string, ReturnType<typeof setTimeout>>();

function createConnection(): Redis | null {
  if (!REDIS_URL) return null;
  return new Redis(REDIS_URL, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    lazyConnect: true,
    connectTimeout: ENQUEUE_TIMEOUT_MS,
  });
}

function getQueue(): Queue<{ sqlSessionId: string }> | null {
  if (!REDIS_URL) return null;
  if (queue !== undefined) return queue;
  const connection = createConnection();
  if (!connection) {
    queue = null;
    return null;
  }
  queue = new Queue(QUEUE_NAME, { connection });
  queue.on("error", (err) => {
    console.warn("[workspace-sql-session-queue] queue error:", err.message);
  });
  return queue;
}

function scheduleLocalFinalize(sqlSessionId: string, endTime: Date): void {
  const existing = localTimers.get(sqlSessionId);
  if (existing) clearTimeout(existing);
  const delay = Math.max(0, endTime.getTime() - Date.now() + AUTO_FINALIZE_BUFFER_MS);
  const timer = setTimeout(() => {
    localTimers.delete(sqlSessionId);
    finalizeWorkspaceSqlSession(sqlSessionId, "auto").catch((err) => {
      console.warn("[workspace-sql-session-queue] local finalize failed:", err instanceof Error ? err.message : err);
    });
  }, delay);
  timer.unref?.();
  localTimers.set(sqlSessionId, timer);
}

async function finalizeDueLocalSessions(): Promise<void> {
  const sessions = await prisma.workspaceSqlSession.findMany({
    where: { status: "active", endTime: { lte: new Date() } },
    select: { id: true },
    take: 100,
  });
  for (const session of sessions) {
    await finalizeWorkspaceSqlSession(session.id, "auto").catch((err) => {
      console.warn("[workspace-sql-session-queue] local sweep failed:", session.id, err instanceof Error ? err.message : err);
    });
  }
}

function startLocalFinalizerSweep(): void {
  if (localSweep) return;
  localSweep = setInterval(() => {
    void finalizeDueLocalSessions().catch((err) => {
      console.warn("[workspace-sql-session-queue] local sweep error:", err instanceof Error ? err.message : err);
    });
  }, LOCAL_SWEEP_INTERVAL_MS);
  localSweep.unref?.();
  void finalizeDueLocalSessions().catch((err) => {
    console.warn("[workspace-sql-session-queue] initial local sweep error:", err instanceof Error ? err.message : err);
  });
}

export async function enqueueSqlAutoFinalize(sqlSessionId: string, endTime: Date): Promise<void> {
  const q = getQueue();
  if (!q) {
    scheduleLocalFinalize(sqlSessionId, endTime);
    return;
  }
  const delay = Math.max(0, endTime.getTime() - Date.now() + AUTO_FINALIZE_BUFFER_MS);
  const opts: JobsOptions = {
    jobId: `sql:auto-finalize:${sqlSessionId}`,
    delay,
    attempts: 3,
    backoff: { type: "exponential", delay: 15_000 },
    removeOnComplete: 1000,
    removeOnFail: 5000,
  };
  let timeout: ReturnType<typeof setTimeout> | null = null;
  const enqueue = q.add("auto-finalize", { sqlSessionId }, opts).catch((err) => {
    console.warn("[workspace-sql-session-queue] enqueue failed:", err instanceof Error ? err.message : err);
    scheduleLocalFinalize(sqlSessionId, endTime);
  });
  await Promise.race([
    enqueue,
    new Promise<void>((resolve) => {
      timeout = setTimeout(() => {
        console.warn("[workspace-sql-session-queue] enqueue timed out; local/lazy finalization remains as fallback.");
        scheduleLocalFinalize(sqlSessionId, endTime);
        resolve();
      }, ENQUEUE_TIMEOUT_MS);
    }),
  ]).finally(() => {
    if (timeout) clearTimeout(timeout);
  });
}

export function startSqlSessionWorker(): void {
  if (!REDIS_URL) {
    startLocalFinalizerSweep();
    return;
  }
  if (worker) return;
  const connection = createConnection();
  if (!connection) return;
  worker = new Worker<{ sqlSessionId: string }>(
    QUEUE_NAME,
    async (job) => {
      const result = await finalizeWorkspaceSqlSession(job.data.sqlSessionId, "auto");
      if (!result.finalized && result.reason === "not_expired" && result.requeueAt) {
        await enqueueSqlAutoFinalize(job.data.sqlSessionId, result.requeueAt);
      }
      return result;
    },
    { connection, concurrency: Math.max(1, parseInt(process.env.SQL_AUTO_FINALIZE_CONCURRENCY ?? "2", 10)) },
  );
  worker.on("failed", (job, err) => {
    console.warn("[workspace-sql-session-queue] job failed:", job?.id, err.message);
  });
  worker.on("error", (err) => {
    console.warn("[workspace-sql-session-queue] worker error:", err.message);
  });
}
