import { Queue, Worker, type JobsOptions } from "bullmq";
import Redis from "ioredis";
import { autoFinalizeMcqSession } from "./mcqAutoFinalize.service.js";

const REDIS_URL = process.env.REDIS_URL?.trim();
const QUEUE_NAME = "mcq-session";
const AUTO_FINALIZE_BUFFER_MS = Math.max(0, parseInt(process.env.MCQ_AUTO_FINALIZE_BUFFER_MS ?? "5000", 10));
const ENQUEUE_TIMEOUT_MS = Math.max(250, parseInt(process.env.MCQ_QUEUE_ENQUEUE_TIMEOUT_MS ?? "1000", 10));

let queue: Queue<{ mcqSessionId: string }> | null | undefined;
let worker: Worker<{ mcqSessionId: string }> | null = null;

function createConnection(): Redis | null {
  if (!REDIS_URL) return null;
  return new Redis(REDIS_URL, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    lazyConnect: true,
    connectTimeout: ENQUEUE_TIMEOUT_MS,
  });
}

function getQueue(): Queue<{ mcqSessionId: string }> | null {
  if (!REDIS_URL) return null;
  if (queue !== undefined) return queue;
  const connection = createConnection();
  if (!connection) {
    queue = null;
    return null;
  }
  queue = new Queue(QUEUE_NAME, { connection });
  queue.on("error", (err) => {
    console.warn("[mcq-session-queue] queue error:", err.message);
  });
  return queue;
}

export async function enqueueMcqAutoFinalize(mcqSessionId: string, endTime: Date): Promise<void> {
  const q = getQueue();
  if (!q) return;
  const delay = Math.max(0, endTime.getTime() - Date.now() + AUTO_FINALIZE_BUFFER_MS);
  const opts: JobsOptions = {
    jobId: `mcq:auto-finalize:${mcqSessionId}`,
    delay,
    attempts: 3,
    backoff: { type: "exponential", delay: 15_000 },
    removeOnComplete: 1000,
    removeOnFail: 5000,
  };
  const enqueue = q.add("auto-finalize", { mcqSessionId }, opts).catch((err) => {
    console.warn("[mcq-session-queue] enqueue failed:", err instanceof Error ? err.message : err);
  });
  await Promise.race([
    enqueue,
    new Promise<void>((resolve) => {
      setTimeout(() => {
        console.warn("[mcq-session-queue] enqueue timed out; lazy finalization remains as fallback.");
        resolve();
      }, ENQUEUE_TIMEOUT_MS);
    }),
  ]);
}

export function startMcqSessionWorker(): void {
  if (worker || !REDIS_URL) return;
  const connection = createConnection();
  if (!connection) return;
  worker = new Worker<{ mcqSessionId: string }>(
    QUEUE_NAME,
    async (job) => autoFinalizeMcqSession(job.data.mcqSessionId, "auto"),
    { connection, concurrency: Math.max(1, parseInt(process.env.MCQ_AUTO_FINALIZE_CONCURRENCY ?? "5", 10)) },
  );
  worker.on("failed", (job, err) => {
    console.warn("[mcq-session-queue] job failed:", job?.id, err.message);
  });
  worker.on("error", (err) => {
    console.warn("[mcq-session-queue] worker error:", err.message);
  });
}
