import { Queue, Worker, type JobsOptions } from "bullmq";
import Redis from "ioredis";
import { autoFinalizeDsaSession } from "./dsaAutoFinalize.service.js";

const REDIS_URL = process.env.REDIS_URL?.trim();
const QUEUE_NAME = "dsa-session";
const AUTO_FINALIZE_BUFFER_MS = Math.max(0, parseInt(process.env.DSA_AUTO_FINALIZE_BUFFER_MS ?? "5000", 10));

let queue: Queue<{ roundSessionId: string }> | null | undefined;
let worker: Worker<{ roundSessionId: string }> | null = null;

function createConnection(): Redis | null {
  if (!REDIS_URL) return null;
  return new Redis(REDIS_URL, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  });
}

function getQueue(): Queue<{ roundSessionId: string }> | null {
  if (!REDIS_URL) return null;
  if (queue !== undefined) return queue;
  const connection = createConnection();
  if (!connection) {
    queue = null;
    return null;
  }
  queue = new Queue(QUEUE_NAME, { connection });
  queue.on("error", (err) => {
    console.warn("[dsa-session-queue] queue error:", err.message);
  });
  return queue;
}

export async function enqueueDsaAutoFinalize(roundSessionId: string, expTime: Date): Promise<void> {
  const q = getQueue();
  if (!q) return;
  const delay = Math.max(0, expTime.getTime() - Date.now() + AUTO_FINALIZE_BUFFER_MS);
  const opts: JobsOptions = {
    jobId: `dsa:auto-finalize:${roundSessionId}`,
    delay,
    attempts: 3,
    backoff: { type: "exponential", delay: 15_000 },
    removeOnComplete: 1000,
    removeOnFail: 5000,
  };
  await q.add("auto-finalize", { roundSessionId }, opts).catch((err) => {
    console.warn("[dsa-session-queue] enqueue failed:", err instanceof Error ? err.message : err);
  });
}

export function startDsaSessionWorker(): void {
  if (worker || !REDIS_URL) return;
  const connection = createConnection();
  if (!connection) return;
  worker = new Worker<{ roundSessionId: string }>(
    QUEUE_NAME,
    async (job) => {
      const result = await autoFinalizeDsaSession(job.data.roundSessionId);
      if (!result.finalized && result.reason === "not_expired") {
        await enqueueDsaAutoFinalize(job.data.roundSessionId, result.requeueAt);
      }
      return result;
    },
    { connection, concurrency: Math.max(1, parseInt(process.env.DSA_AUTO_FINALIZE_CONCURRENCY ?? "2", 10)) },
  );
  worker.on("failed", (job, err) => {
    console.warn("[dsa-session-queue] job failed:", job?.id, err.message);
  });
  worker.on("error", (err) => {
    console.warn("[dsa-session-queue] worker error:", err.message);
  });
}
