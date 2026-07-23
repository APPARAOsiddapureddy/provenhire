/**
 * One-off remediation: a bug in buildSqliteRunner (fixed in 1d9b360, "Fix SQL
 * judge generating an unparseable Python script") caused every SQL round
 * submission to score 0 via a Python SyntaxError, regardless of correctness.
 * A batch of QA candidates on workspace PH-PROVENHIRE-REPORT-QUALITY-QA-2026-2223
 * submitted genuinely correct SQL in the ~3-minute window before that fix
 * deployed and are stuck showing a stale 0.
 *
 * This re-runs their exact stored query through the now-fixed judge and
 * updates the submission/session/attempt rows in place. It does not touch
 * anything outside this one workspace, and only ever updates official
 * (isOfficial: true) submissions whose own result rows still carry the
 * pre-fix SyntaxError signature - proof the specific submission was hit by
 * the bug, rather than a time-cutoff guess.
 */
import { prisma } from "../config/prisma.js";
import { evaluateSqlTask, type WorkspaceSqlTask } from "./workspaceSqlEvaluation.service.js";
import { scoreSqlSession } from "./workspaceSqlFinalize.service.js";

const WORKSPACE_CODE = "PH-PROVENHIRE-REPORT-QUALITY-QA-2026-2223";
const FIX_DEPLOY_AT = new Date("2026-07-22T23:41:41Z");
const SYNTAX_ERROR_SIGNATURE = /SyntaxError|EOL while scanning string literal/i;

export type SqlRegradeSummaryRow = { candidateEmail: string; taskId: string; before: string; after: string };
export type SqlRegradeWarning = { submissionId: string; message: string };
export type SqlRegradeResult = {
  applied: boolean;
  flaggedCount: number;
  regraded: SqlRegradeSummaryRow[];
  warnings: SqlRegradeWarning[];
};

function scoreFromCounts(passed: number, total: number): number {
  return total > 0 ? Math.round((passed / total) * 100) : 0;
}

function asTaskList(value: unknown): WorkspaceSqlTask[] {
  if (!Array.isArray(value)) return [];
  return value.filter((task): task is WorkspaceSqlTask => {
    const candidate = task as Partial<WorkspaceSqlTask>;
    return typeof candidate.id === "string" && typeof candidate.title === "string" && Array.isArray(candidate.testCases);
  });
}

function isAffected(results: unknown): boolean {
  const rows = Array.isArray(results) ? results : [];
  return rows.some((row) => {
    const actual = row && typeof row === "object" ? (row as Record<string, unknown>).actual : undefined;
    return typeof actual === "string" && SYNTAX_ERROR_SIGNATURE.test(actual);
  });
}

export async function regradeStaleSqlSubmissions(apply: boolean): Promise<SqlRegradeResult> {
  const result: SqlRegradeResult = { applied: apply, flaggedCount: 0, regraded: [], warnings: [] };

  const workspace = await prisma.workspace.findUnique({ where: { code: WORKSPACE_CODE } });
  if (!workspace) return result;

  const attempts = await prisma.workspaceRoundAttempt.findMany({
    where: { workspaceId: workspace.id, roundType: "sql", sqlSessionId: { not: null } },
    include: { workspaceRound: true, sqlSession: true },
  });

  for (const attempt of attempts) {
    const session = attempt.sqlSession;
    if (!session) continue;

    const officialSubmissions = await prisma.workspaceSqlSubmission.findMany({
      where: { sessionId: session.id, isOfficial: true },
    });
    const affected = officialSubmissions.filter((submission) => isAffected(submission.results));
    if (affected.length === 0) continue;

    const user = await prisma.user.findUnique({ where: { id: attempt.userId }, select: { email: true } });
    const tasks = asTaskList(session.tasks);
    let sessionChanged = false;

    for (const submission of affected) {
      result.flaggedCount++;
      const sanityOk = submission.score === 0 && submission.submittedAt < FIX_DEPLOY_AT;
      if (!sanityOk) {
        result.warnings.push({
          submissionId: submission.id,
          message: `matched the SyntaxError signature but failed the sanity check (score=${submission.score}, submittedAt=${submission.submittedAt.toISOString()})`,
        });
        continue;
      }

      const task = tasks.find((t) => t.id === submission.taskId);
      if (!task) {
        result.warnings.push({ submissionId: submission.id, message: `no task snapshot found for taskId ${submission.taskId}` });
        continue;
      }

      const payload = await evaluateSqlTask(task, submission.query);
      const newScore = scoreFromCounts(payload.passed, payload.total);

      result.regraded.push({
        candidateEmail: user?.email ?? attempt.userId,
        taskId: submission.taskId,
        before: `${submission.passedCount}/${submission.totalCount} (score ${submission.score})`,
        after: `${payload.passed}/${payload.total} (score ${newScore})`,
      });

      if (apply) {
        await prisma.workspaceSqlSubmission.update({
          where: { id: submission.id },
          data: { passedCount: payload.passed, totalCount: payload.total, score: newScore, results: payload.results as object },
        });
        sessionChanged = true;
      }
    }

    if (apply && sessionChanged) {
      const { score, passedCount, totalCount } = await scoreSqlSession(session.id, session.taskIds);
      const weightedScore = Math.round((score * attempt.workspaceRound.scoreWeightage) / 100);
      await prisma.$transaction([
        prisma.workspaceSqlSession.update({ where: { id: session.id }, data: { score, passedCount, totalCount } }),
        prisma.workspaceRoundAttempt.update({ where: { id: attempt.id }, data: { score, percentageScore: score, weightedScore } }),
      ]);
    }
  }

  return result;
}
