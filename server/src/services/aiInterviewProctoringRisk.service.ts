/**
 * AI interview session integrity from ProctoringEvent rows (sessionId = interviewId, testType = ai_interview).
 * Uses per-signal violation counts — no weighted “risk score” accumulation.
 */

export type ProctoringEventRow = { type: string };

export interface ProctoringViolationAggregate {
  byType: Record<string, number>;
  total: number;
  maxPerType: number;
}

export function aggregateProctoringViolations(events: ProctoringEventRow[]): ProctoringViolationAggregate {
  const byType: Record<string, number> = {};
  for (const e of events) {
    const t = e.type || "unknown";
    byType[t] = (byType[t] ?? 0) + 1;
  }
  const counts = Object.values(byType);
  const maxPerType = counts.length ? Math.max(...counts) : 0;
  const total = events.length;
  return { byType, total, maxPerType };
}

const FLAG_RANK: Record<string, number> = {
  "": 0,
  none: 0,
  review_recommended: 1,
  review_required: 2,
  integrity_violation: 3,
};

function maxFlag(a: string | null, b: string | null): string | null {
  const ra = FLAG_RANK[a ?? ""] ?? 0;
  const rb = FLAG_RANK[b ?? ""] ?? 0;
  if (rb > ra) return b;
  return a;
}

/** Tier from live proctoring violation counts only (raw event rows). */
export function integrityFlagFromViolationAggregate(agg: ProctoringViolationAggregate): string | null {
  const { total, maxPerType } = agg;
  if (total === 0 && maxPerType === 0) return null;
  if (maxPerType >= 10 || total >= 40) return "integrity_violation";
  if (maxPerType >= 5 || total >= 18) return "review_required";
  if (maxPerType >= 3 || total >= 8) return "review_recommended";
  return null;
}

/**
 * Map legacy 0–100 anti-gaming points to the same integrity flag scale (coarse).
 */
export function integrityFlagFromAntiGamingPoints(points: number): string | null {
  const p = Math.min(100, Math.max(0, points));
  if (p <= 15) return null;
  if (p <= 35) return "review_recommended";
  if (p <= 55) return "review_required";
  return "integrity_violation";
}

/** Combine proctoring counts + anti-gaming severity (takes stricter flag). */
export function mergeIntegrityFlags(
  fromProctoring: string | null,
  fromAntiGaming: string | null,
): string | null {
  return maxFlag(fromProctoring, fromAntiGaming);
}

/** Stored on Interview.riskSortKey — total proctoring rows for this session (not a weighted score). */
export function interviewProctoringViolationTotal(agg: ProctoringViolationAggregate): number {
  return agg.total;
}
