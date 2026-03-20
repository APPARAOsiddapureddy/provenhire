// In-memory sliding window. Replace with Redis for multi-instance deployments.

import { DSA_RUN_RATE_LIMIT } from "../constants/dsa.js";

interface WindowEntry {
  minuteTs: number[];
  hourTs: number[];
}

const store = new Map<string, WindowEntry>();

function getWindow(userId: string): WindowEntry {
  if (!store.has(userId)) store.set(userId, { minuteTs: [], hourTs: [] });
  return store.get(userId)!;
}

function cleanWindow(entry: WindowEntry, now: number): void {
  const minuteAgo = now - 60_000;
  const hourAgo = now - 3_600_000;
  entry.minuteTs = entry.minuteTs.filter((t) => t > minuteAgo);
  entry.hourTs = entry.hourTs.filter((t) => t > hourAgo);
}

export function checkRateLimit(userId: string): { allowed: boolean; retryAfterSeconds?: number } {
  const now = Date.now();
  const entry = getWindow(userId);
  cleanWindow(entry, now);

  if (entry.minuteTs.length >= DSA_RUN_RATE_LIMIT.PER_MINUTE) {
    const oldest = entry.minuteTs[0]!;
    const retryAfter = Math.ceil((oldest + 60_000 - now) / 1000);
    return { allowed: false, retryAfterSeconds: Math.max(1, retryAfter) };
  }

  if (entry.hourTs.length >= DSA_RUN_RATE_LIMIT.PER_HOUR) {
    const oldest = entry.hourTs[0]!;
    const retryAfter = Math.ceil((oldest + 3_600_000 - now) / 1000);
    return { allowed: false, retryAfterSeconds: Math.max(1, retryAfter) };
  }

  entry.minuteTs.push(now);
  entry.hourTs.push(now);
  return { allowed: true };
}
