/**
 * Seed DSA questions and test cases into the database.
 *
 * Source of truth (existing frontend):
 * - src/data/dsaQuestions.ts (base question set)
 * - src/data/dsaQuestionsBank.ts (additional question bank)
 *
 * Run:
 *   cd server && npm run seed:dsa
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

type FrontendDSAQuestion = {
  id: string;
  difficulty: string;
  title: string;
  description: string;
  examples?: Array<{ input: string; output: string; explanation?: string }>;
  constraints?: string[];
  testCases?: Array<{ input: string; expectedOutput: string }>;
  templates?: Record<string, string>;
};

function toExamples(q: FrontendDSAQuestion): unknown {
  // Prefer explicit examples from the base question set.
  if (q.examples?.length) return q.examples;

  // If the source question has no examples (e.g. bank questions), use the first testcase as the example.
  const first = q.testCases?.[0];
  if (!first) return [];

  return [{ input: first.input, output: first.expectedOutput }];
}

function computeIsHidden(index: number, total: number): boolean {
  // Keep the first testcase as "public" so the UI can display example-like details.
  // Everything else is treated as hidden to support redacted results for hidden tests.
  // If there is only one testcase, it remains non-hidden.
  if (total <= 1) return false;
  return index !== 0;
}

async function main() {
  // Build specifier at runtime so TS doesn't try to include files from ../src in this build.
  // (server/tsconfig has a rootDir restriction that would otherwise fail compilation.)
  const bankQuestionsPath: string = ["..", "..", "..", "src", "data", "dsaQuestionsBank"].join("/");
  let bankQuestions: FrontendDSAQuestion[] = [];
  try {
    // Dynamic import so server build doesn't require src/data/dsaQuestionsBank.ts to be within rootDir.
    const modBank: any = await import(bankQuestionsPath);
    bankQuestions = (modBank?.getNewDSAQuestions?.() ?? []) as FrontendDSAQuestion[];
  } catch (e) {
    console.warn(
      "[seed:dsa] src/data/dsaQuestionsBank.ts not found. Continuing with only dsaQuestions.ts seeds."
    );
  }

  const frontendDsaQuestionsPath: string = ["..", "..", "..", "src", "data", "dsaQuestions"].join("/");
  let baseQuestions: FrontendDSAQuestion[] = [];
  try {
    // Dynamic import so server build doesn't require src/data/dsaQuestions.ts to exist.
    // Seeding can only be re-run before the frontend module is deleted.
    const mod: any = await import(frontendDsaQuestionsPath);
    baseQuestions = (mod?.dsaQuestions ?? []) as FrontendDSAQuestion[];
  } catch (e) {
    console.warn(
      "[seed:dsa] src/data/dsaQuestions.ts is missing. Continuing with only dsaQuestionsBank seeds."
    );
  }

  const allQuestions: FrontendDSAQuestion[] = [...baseQuestions, ...(bankQuestions as any[])];

  console.log(`Seeding DSA questions: ${allQuestions.length} questions`);

  const questionIds = allQuestions.map((q) => q.id);

  // Ensure we don't accumulate duplicate test cases on repeated runs.
  await prisma.dsaTestCase.deleteMany({ where: { questionId: { in: questionIds } } });

  // Upsert questions (by id) so repeated seeding remains idempotent.
  for (const q of allQuestions) {
    await prisma.dsaQuestion.upsert({
      where: { id: q.id },
      update: {
        title: q.title,
        description: q.description,
        difficulty: q.difficulty,
        examples: toExamples(q) as any,
        constraints: q.constraints ?? [],
        starterCode: q.templates ?? {},
      },
      create: {
        id: q.id,
        title: q.title,
        description: q.description,
        difficulty: q.difficulty,
        examples: toExamples(q) as any,
        constraints: q.constraints ?? [],
        starterCode: q.templates ?? {},
      },
    });
  }

  // Insert test cases.
  const testCaseRows: Array<{
    questionId: string;
    input: string;
    expected: string;
    isHidden: boolean;
  }> = [];

  for (const q of allQuestions) {
    const tcs = q.testCases ?? [];
    for (let i = 0; i < tcs.length; i++) {
      const tc = tcs[i];
      testCaseRows.push({
        questionId: q.id,
        input: tc.input,
        expected: tc.expectedOutput,
        isHidden: computeIsHidden(i, tcs.length),
      });
    }
  }

  if (testCaseRows.length > 0) {
    // createMany is faster than per-row create. We cleared existing ones above.
    await prisma.dsaTestCase.createMany({ data: testCaseRows });
  }

  console.log(`Seeded ${testCaseRows.length} DSA test cases.`);
  await prisma.$disconnect();
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

