/**
 * Short-lived in-memory dedup for idempotent interview turn retries (same client turnId).
 * Single-instance only (Render web dyno); safe for network blips / double-submit.
 */
type Entry = { expiresAt: number; payload: unknown };
const store = new Map<string, Entry>();
const TTL_MS = 20 * 60 * 1000;
const MAX_KEYS = 4000;

function prune(now: number): void {
  if (store.size <= MAX_KEYS) return;
  for (const [k, v] of store) {
    if (v.expiresAt < now) store.delete(k);
  }
  while (store.size > MAX_KEYS) {
    const k = store.keys().next().value;
    if (k) store.delete(k);
    else break;
  }
}

export function turnDedupKey(userId: string, interviewId: string, clientTurnId: string): string {
  return `${userId}:${interviewId}:${clientTurnId}`;
}

/** Separate namespace from expert `/v2/turn` dedup keys. */
export function aiSkillsTurnDedupKey(userId: string, interviewId: string, clientTurnId: string): string {
  return `skills:${userId}:${interviewId}:${clientTurnId}`;
}

export function getCachedTurnPayload(key: string): unknown | undefined {
  const now = Date.now();
  const e = store.get(key);
  if (!e) return undefined;
  if (e.expiresAt < now) {
    store.delete(key);
    return undefined;
  }
  return e.payload;
}

export function setCachedTurnPayload(key: string, payload: unknown): void {
  const now = Date.now();
  prune(now);
  store.set(key, { expiresAt: now + TTL_MS, payload });
}
