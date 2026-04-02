/**
 * Seed DSA questions and test cases into the database.
 *
 * Run:
 *   cd server && npm run seed:dsa
 *
 * Rules:
 * - Each question must include at least one example in source data (bank uses first 1–2 test cases as examples).
 * - At least 6 test cases per question: first 2 are public (isHidden=false), remaining are hidden.
 * - Each question is validated with Zod before upsert.
 */
import { PrismaClient } from "@prisma/client";
import { z } from "zod";

const prisma = new PrismaClient();

const TestCaseSchema = z
  .object({
    input: z.string(),
    expectedOutput: z.string().optional(),
    output: z.string().optional(),
    expectedType: z.enum(["exact", "numeric", "array", "set"]).optional().default("exact"),
    timeoutMs: z.number().int().positive().optional().nullable(),
  })
  .superRefine((row, ctx) => {
    const exp = row.expectedOutput ?? row.output;
    if (exp == null || exp === "") {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Test case must have expectedOutput or output" });
    }
  });

const QuestionSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  description: z.string().min(1),
  difficulty: z.enum(["Easy", "Medium", "Hard"]),
  examples: z.array(z.any()).min(1, "Examples must be explicitly provided"),
  constraints: z.array(z.string()).default([]),
  starterCode: z.record(z.string()),
  testCases: z.array(TestCaseSchema).min(6, "Each question must have at least 6 test cases (2 public + 4 hidden)"),
});

type SeedQuestion = z.infer<typeof QuestionSchema>;

/** First two test cases are visible; all others are hidden. */
function computeIsHidden(index: number): boolean {
  return index >= 2;
}

async function loadSourceQuestions(): Promise<SeedQuestion[]> {
  const bankQuestionsPath: string = ["..", "..", "..", "src", "data", "dsaQuestionsBank"].join("/");
  let bankRaw: unknown[] = [];
  try {
    const modBank: any = await import(bankQuestionsPath);
    const list = modBank?.getNewDSAQuestions?.() ?? [];
    bankRaw = Array.isArray(list) ? list : [];
  } catch {
    console.warn("[seed:dsa] src/data/dsaQuestionsBank not found or failed to load.");
  }

  const basePath: string = ["..", "..", "..", "src", "data", "dsaQuestions"].join("/");
  let baseRaw: unknown[] = [];
  try {
    const mod: any = await import(basePath);
    const list = mod?.dsaQuestions ?? [];
    baseRaw = Array.isArray(list) ? list : [];
  } catch {
    console.warn("[seed:dsa] src/data/dsaQuestions not found — skipping base set.");
  }

  const rawCombined = [...baseRaw, ...bankRaw];
  const validated: SeedQuestion[] = [];

  for (const raw of rawCombined) {
    const q = raw as any;
    const parsed = QuestionSchema.safeParse({
      id: q.id,
      title: q.title,
      description: q.description,
      difficulty: q.difficulty,
      examples: q.examples,
      constraints: q.constraints ?? [],
      starterCode: q.templates ?? q.starterCode ?? {},
      testCases: (q.testCases ?? []).map((tc: any) => ({
        input: tc.input,
        expectedOutput: tc.expectedOutput,
        output: tc.output,
        expectedType: tc.expectedType,
        timeoutMs: tc.timeoutMs,
      })),
    });
    if (!parsed.success) {
      console.warn(`[seed:dsa] Skipping invalid question "${q?.title ?? q?.id}":`, parsed.error.flatten());
      continue;
    }
    validated.push(parsed.data);
  }

  return validated;
}

async function main() {
  const allQuestions = await loadSourceQuestions();
  console.log(`Seeding DSA questions: ${allQuestions.length} questions (validated)`);

  if (allQuestions.length === 0) {
    console.warn("[seed:dsa] No valid questions to seed. Add explicit examples + test cases to source data.");
    await prisma.$disconnect();
    return;
  }

  const questionIds = allQuestions.map((q) => q.id);

  await prisma.dsaTestCase.deleteMany({ where: { questionId: { in: questionIds } } });

  for (const q of allQuestions) {
    await prisma.dsaQuestion.upsert({
      where: { id: q.id },
      update: {
        title: q.title,
        description: q.description,
        difficulty: q.difficulty,
        examples: q.examples as any,
        constraints: q.constraints,
        starterCode: q.starterCode as any,
      },
      create: {
        id: q.id,
        title: q.title,
        description: q.description,
        difficulty: q.difficulty,
        examples: q.examples as any,
        constraints: q.constraints,
        starterCode: q.starterCode as any,
      },
    });
  }

  const testCaseRows: Array<{
    questionId: string;
    input: string;
    expected: string;
    isHidden: boolean;
    expectedType: string;
    timeoutMs: number | null;
  }> = [];

  for (const q of allQuestions) {
    const tcs = q.testCases;
    for (let i = 0; i < tcs.length; i++) {
      const tc = tcs[i]!;
      const expected = tc.expectedOutput ?? tc.output!;
      testCaseRows.push({
        questionId: q.id,
        input: tc.input,
        expected,
        isHidden: computeIsHidden(i),
        expectedType: tc.expectedType ?? "exact",
        timeoutMs: tc.timeoutMs ?? null,
      });
    }
  }

  if (testCaseRows.length > 0) {
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
