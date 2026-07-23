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
 *
 * Run:
 *   cd server && npx tsx scripts/regrade-stale-sql-submissions.ts            # dry run, no writes
 *   cd server && npx tsx scripts/regrade-stale-sql-submissions.ts --apply    # writes
 */
import { prisma } from "../src/config/prisma.js";
import { evaluateSqlTask, type WorkspaceSqlTask } from "../src/services/workspaceSqlEvaluation.service.js";
import { scoreSqlSession } from "../src/services/workspaceSqlFinalize.service.js";

const WORKSPACE_CODE = "PH-PROVENHIRE-REPORT-QUALITY-QA-2026-2223";
const FIX_DEPLOY_AT = new Date("2026-07-22T23:41:41Z");
const SYNTAX_ERROR_SIGNATURE = /SyntaxError|EOL while scanning string literal/i;
const APPLY = process.argv.includes("--apply");

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

async function main() {
  console.log(APPLY ? "Running in APPLY mode - this will write changes." : "Running in DRY-RUN mode - no changes will be written.");

  const workspace = await prisma.workspace.findUnique({ where: { code: WORKSPACE_CODE } });
  if (!workspace) {
    console.log(`No workspace found with code ${WORKSPACE_CODE}. Nothing to do.`);
    await prisma.$disconnect();
    return;
  }

  const attempts = await prisma.workspaceRoundAttempt.findMany({
    where: { workspaceId: workspace.id, roundType: "sql", sqlSessionId: { not: null } },
    include: { workspaceRound: true, sqlSession: true },
  });

  const summary: Array<{ candidateEmail: string; taskId: string; before: string; after: string }> = [];
  let flaggedCount = 0;

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

    for (const submission of affected) {
      flaggedCount++;
      const sanityOk = submission.score === 0 && submission.submittedAt < FIX_DEPLOY_AT;
      if (!sanityOk) {
        console.warn(
          `WARNING: ${submission.id} matched the SyntaxError signature but failed the sanity check ` +
            `(score=${submission.score}, submittedAt=${submission.submittedAt.toISOString()}). Skipping - review manually.`,
        );
        continue;
      }

      const task = tasks.find((t) => t.id === submission.taskId);
      if (!task) {
        console.warn(`WARNING: no task snapshot found for submission ${submission.id} (taskId ${submission.taskId}). Skipping.`);
        continue;
      }

      const payload = await evaluateSqlTask(task, submission.query);
      const newScore = scoreFromCounts(payload.passed, payload.total);

      summary.push({
        candidateEmail: user?.email ?? attempt.userId,
        taskId: submission.taskId,
        before: `${submission.passedCount}/${submission.totalCount} (score ${submission.score})`,
        after: `${payload.passed}/${payload.total} (score ${newScore})`,
      });

      if (APPLY) {
        await prisma.workspaceSqlSubmission.update({
          where: { id: submission.id },
          data: {
            passedCount: payload.passed,
            totalCount: payload.total,
            score: newScore,
            results: payload.results as object,
          },
        });
      }
    }

    if (APPLY) {
      const { score, passedCount, totalCount } = await scoreSqlSession(session.id, session.taskIds);
      const weightedScore = Math.round((score * attempt.workspaceRound.scoreWeightage) / 100);
      await prisma.$transaction([
        prisma.workspaceSqlSession.update({
          where: { id: session.id },
          data: { score, passedCount, totalCount },
        }),
        prisma.workspaceRoundAttempt.update({
          where: { id: attempt.id },
          data: { score, percentageScore: score, weightedScore },
        }),
      ]);
    }
  }

  console.log(`\nFlagged ${flaggedCount} submission(s) matching the pre-fix SyntaxError signature.`);
  console.log(`Regraded ${summary.length} submission(s):\n`);
  for (const row of summary) {
    console.log(`  ${row.candidateEmail} · task ${row.taskId}: ${row.before} -> ${row.after}`);
  }
  if (!APPLY && summary.length > 0) {
    console.log("\nDry run only - re-run with --apply to write these changes.");
  }

  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
