/**
 * One-off local cleanup: removes every workspace so that all remaining workspaces
 * were created through the college-credential pipeline.
 *
 * Everything hanging off Workspace (rounds, registrations, attempts, sql sessions,
 * candidate decisions, placement readiness records, college credentials) is removed
 * by the existing ON DELETE CASCADE foreign keys.
 *
 * Refuses to run against a non-local database.
 */
import { PrismaClient } from "@prisma/client";
import "dotenv/config";

const prisma = new PrismaClient();

function assertLocalDatabase(): void {
  const url = process.env.DATABASE_URL ?? "";
  const isLocal = /@(localhost|127\.0\.0\.1)[:/]/.test(url);
  if (!isLocal) {
    throw new Error(
      "Refusing to wipe workspaces: DATABASE_URL does not point at localhost.",
    );
  }
}

async function main() {
  assertLocalDatabase();
  const before = await prisma.workspace.count();
  const result = await prisma.workspace.deleteMany({});
  const after = await prisma.workspace.count();
  console.log(
    `[wipe-workspaces] before=${before} deleted=${result.count} remaining=${after}`,
  );
}

main()
  .catch((error) => {
    console.error("[wipe-workspaces]", error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
