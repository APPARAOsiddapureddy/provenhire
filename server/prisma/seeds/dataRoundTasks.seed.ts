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
    const existing = await prisma.dataRoundTask.findFirst({
      where: { title: task.title },
    });

    if (existing) {
      console.log(`  ⏭  "${task.title}" already exists — skipping`);
      continue;
    }

    const created = await prisma.dataRoundTask.create({
      data: {
        title: task.title,
        description: task.description,
        taskType: task.taskType,
        difficulty: task.difficulty,
        subtrack: task.subtrack,
        sqlSchema: task.sqlSchema,
        starterCode: task.starterCode ?? undefined,
        options: task.options ?? undefined,
        testCases: {
          create: task.testCases.map((tc) => ({
            input: tc.input,
            expected: tc.expected,
            isHidden: tc.isHidden,
            expectedType: tc.expectedType ?? "exact",
            timeoutMs: tc.timeoutMs ?? null,
          })),
        },
      },
    });

    console.log(`  ✅ "${task.title}" (${created.id}) — ${task.testCases.length} test cases`);
  }

  console.log("Done.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
