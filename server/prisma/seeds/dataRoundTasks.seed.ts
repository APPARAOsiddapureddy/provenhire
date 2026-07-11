/**
 * Seed Data Round tasks and test cases into the database.
 *
 * Run:
 *   cd server && npx tsx prisma/seeds/dataRoundTasks.seed.ts
 */
import { PrismaClient } from "@prisma/client";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const prisma = new PrismaClient();

interface SeedTestCase {
  input: string;
  expected: string;
  isHidden: boolean;
  expectedType?: string;
  timeoutMs?: number;
}

interface SeedTask {
  title: string;
  description: string;
  taskType: string;
  difficulty: string;
  subtrack: string | null;
  sqlSchema: string | null;
  starterCode: Record<string, string> | null;
  options?: string[] | null;
  testCases: SeedTestCase[];
}

async function main() {
  const seedPath = join(__dirname, "..", "..", "src", "data", "data-round-tasks-seed.json");
  const raw = readFileSync(seedPath, "utf-8");
  const tasks: SeedTask[] = JSON.parse(raw);

  console.log(`Seeding ${tasks.length} data round tasks...`);

  for (const task of tasks) {
    const existing = await prisma.dataRoundTask.findFirst({ where: { title: task.title } });
    const payload = {
      title: task.title,
      description: task.description,
      taskType: task.taskType,
      difficulty: task.difficulty,
      subtrack: task.subtrack,
      sqlSchema: task.sqlSchema,
      starterCode: task.starterCode ?? undefined,
      options: task.options ?? undefined,
    };
    const testCases = task.testCases.map((tc) => ({
      input: tc.input,
      expected: tc.expected,
      isHidden: tc.isHidden,
      expectedType: tc.expectedType ?? "exact",
      timeoutMs: tc.timeoutMs ?? null,
    }));

    const saved = await prisma.$transaction(async (tx) => {
      const row = existing
        ? await tx.dataRoundTask.update({
            where: { id: existing.id },
            data: payload,
          })
        : await tx.dataRoundTask.create({
            data: payload,
          });
      await tx.dataRoundTestCase.deleteMany({ where: { taskId: row.id } });
      if (testCases.length) {
        await tx.dataRoundTestCase.createMany({
          data: testCases.map((tc) => ({ ...tc, taskId: row.id })),
        });
      }
      return row;
    });

    console.log(`  ${existing ? "updated" : "created"} "${task.title}" (${saved.id}) - ${task.testCases.length} test cases`);
  }

  console.log("Done.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
