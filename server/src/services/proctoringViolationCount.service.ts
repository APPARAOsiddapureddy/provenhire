import { prisma } from "../config/prisma.js";

/** Next 1-based violation index for this session + signal type (for ProctoringEvent.riskScore storage). */
export async function nextViolationIndexForSession(sessionId: string, type: string): Promise<number> {
  const n = await prisma.proctoringEvent.count({ where: { sessionId, type } });
  return n + 1;
}

/**
 * Map stored proctoring rows to a 0–100 integrity score.
 * `riskScore` on each row is the per-signal violation index at log time; `totalEvents` is the row count.
 */
export function integrityScoreFromViolationStats(maxViolationIndex: number, totalEvents: number): number {
  if (totalEvents <= 0) return 100;
  const penalty = Math.max(maxViolationIndex * 4, Math.min(85, Math.floor(totalEvents * 2.2)));
  return Math.max(0, 100 - penalty);
}
