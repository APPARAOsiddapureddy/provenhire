import { prisma } from "../config/prisma.js";

/**
 * Return aptitude score as 0–100 (percent) for display everywhere (resume, profile, search).
 * Prefer AptitudeTestResult: use earnedMarks/totalMarks from answers, or row.score as earnedMarks.
 * Fallback: VerificationStage.score if it looks like percent (<= 100); else treat as marks and convert if we have totalMarks.
 */
export async function getAptitudeScoreZeroToHundred(
  userId: string,
  stageScore: number | null
): Promise<number | null> {
  if (stageScore == null) return null;
  const latest = await prisma.aptitudeTestResult.findFirst({
    where: { userId },
    orderBy: { completedAt: "desc" },
    select: { score: true, answers: true },
  });
  const answers = latest?.answers as { earnedMarks?: number; totalMarks?: number } | null | undefined;
  const totalMarks =
    typeof answers?.totalMarks === "number" && answers.totalMarks > 0 ? answers.totalMarks : null;
  const earnedMarks =
    typeof answers?.earnedMarks === "number"
      ? answers.earnedMarks
      : typeof latest?.score === "number"
        ? latest.score
        : null;
  if (totalMarks != null && totalMarks > 0 && typeof earnedMarks === "number") {
    return Math.min(100, Math.max(0, Math.round((earnedMarks / totalMarks) * 100)));
  }
  // No structured marks (e.g. legacy seed): AptitudeTestResult.score is already 0–100
  if (typeof latest?.score === "number" && latest.score >= 0 && latest.score <= 100) {
    return Math.round(latest.score);
  }
  return stageScore <= 100 ? Math.round(stageScore) : null;
}

/**
 * Batch version: return Map<userId, aptitude 0–100> for many users.
 * Used by candidates list and job applicants to show consistent percent everywhere.
 */
export async function getAptitudeScoresZeroToHundredBatch(
  userIds: string[],
  getStageScore: (userId: string) => number | null
): Promise<Map<string, number | null>> {
  if (userIds.length === 0) return new Map();
  const results = await prisma.aptitudeTestResult.findMany({
    where: { userId: { in: userIds } },
    orderBy: { completedAt: "desc" },
    select: { userId: true, score: true, answers: true },
  });
  const latestByUser = new Map<string, { earnedMarks: number; totalMarks: number } | { percent: number }>();
  for (const r of results) {
    if (!latestByUser.has(r.userId)) {
      const ans = r.answers as { earnedMarks?: number; totalMarks?: number } | null | undefined;
      const totalMarks =
        typeof ans?.totalMarks === "number" && ans.totalMarks > 0 ? ans.totalMarks : null;
      const earnedMarks =
        typeof ans?.earnedMarks === "number"
          ? ans.earnedMarks
          : typeof r.score === "number"
            ? r.score
            : NaN;
      if (totalMarks != null && totalMarks > 0 && typeof earnedMarks === "number" && !Number.isNaN(earnedMarks)) {
        latestByUser.set(r.userId, { earnedMarks, totalMarks });
      } else if (typeof r.score === "number" && r.score >= 0 && r.score <= 100) {
        latestByUser.set(r.userId, { percent: Math.round(r.score) });
      }
    }
  }
  const out = new Map<string, number | null>();
  for (const uid of userIds) {
    const stage = getStageScore(uid);
    if (stage == null) {
      out.set(uid, null);
      continue;
    }
    const row = latestByUser.get(uid);
    if (row && "totalMarks" in row && row.totalMarks > 0) {
      out.set(uid, Math.min(100, Math.max(0, Math.round((row.earnedMarks / row.totalMarks) * 100))));
    } else if (row && "percent" in row) {
      out.set(uid, row.percent);
    } else {
      out.set(uid, stage <= 100 ? Math.round(stage) : null);
    }
  }
  return out;
}
