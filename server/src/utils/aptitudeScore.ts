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
  const totalMarks = typeof answers?.totalMarks === "number" && answers.totalMarks > 0
    ? answers.totalMarks
    : 25;
  const earnedMarks = typeof answers?.earnedMarks === "number"
    ? answers.earnedMarks
    : (typeof latest?.score === "number" ? latest.score : null);
  if (typeof earnedMarks === "number" && totalMarks > 0) {
    return Math.round((earnedMarks / totalMarks) * 100);
  }
  return stageScore <= 100 ? stageScore : null;
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
  const latestByUser = new Map<string, { earnedMarks: number; totalMarks: number }>();
  for (const r of results) {
    if (!latestByUser.has(r.userId)) {
      const ans = r.answers as { earnedMarks?: number; totalMarks?: number } | null | undefined;
      const totalMarks = typeof ans?.totalMarks === "number" && ans.totalMarks > 0 ? ans.totalMarks : 25;
      const earnedMarks = typeof ans?.earnedMarks === "number" ? ans.earnedMarks : (typeof r.score === "number" ? r.score : NaN);
      if (typeof earnedMarks === "number" && !Number.isNaN(earnedMarks) && totalMarks > 0) {
        latestByUser.set(r.userId, { earnedMarks, totalMarks });
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
    if (row && row.totalMarks > 0) {
      out.set(uid, Math.round((row.earnedMarks / row.totalMarks) * 100));
    } else {
      out.set(uid, stage <= 100 ? stage : null);
    }
  }
  return out;
}
