/**
 * CLI wrapper for regradeStaleSqlSubmissions (see
 * ../src/services/sqlSubmissionRemediation.service.ts for what this does and
 * why).
 *
 * Run:
 *   cd server && npx tsx scripts/regrade-stale-sql-submissions.ts            # dry run, no writes
 *   cd server && npx tsx scripts/regrade-stale-sql-submissions.ts --apply    # writes
 */
import { prisma } from "../src/config/prisma.js";
import { regradeStaleSqlSubmissions } from "../src/services/sqlSubmissionRemediation.service.js";

async function main() {
  const apply = process.argv.includes("--apply");
  console.log(apply ? "Running in APPLY mode - this will write changes." : "Running in DRY-RUN mode - no changes will be written.");

  const result = await regradeStaleSqlSubmissions(apply);

  for (const warning of result.warnings) {
    console.warn(`WARNING: ${warning.submissionId}: ${warning.message}. Skipping - review manually.`);
  }

  console.log(`\nFlagged ${result.flaggedCount} submission(s) matching the pre-fix SyntaxError signature.`);
  console.log(`Regraded ${result.regraded.length} submission(s):\n`);
  for (const row of result.regraded) {
    console.log(`  ${row.candidateEmail} · task ${row.taskId}: ${row.before} -> ${row.after}`);
  }
  if (!apply && result.regraded.length > 0) {
    console.log("\nDry run only - re-run with --apply to write these changes.");
  }

  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
