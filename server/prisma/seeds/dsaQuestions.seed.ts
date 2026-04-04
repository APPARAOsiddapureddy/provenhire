/**
 * Seed DSA questions and test cases into the database.
 *
 * Run:
 *   cd server && npm run seed:dsa
 *
 * Canonical stdin/stdout boilerplate for all five Judge0 languages is defined in
 * `src/data/dsaMultiLangStarters.ts`. This seed **merges** that into every question's
 * `starterCode` before upsert so the DB always has javascript, python, java, cpp, and c
 * (even if source JSON only carried Python).
 *
 * Rules:
 * - Each question must include at least one example in source data.
 * - At least 6 test cases per question: first 2 public, rest hidden.
 * - starterCode must contain all five language keys after normalization.
 */
import { PrismaClient } from "@prisma/client";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { z } from "zod";

const prisma = new PrismaClient();

const REQUIRED_LANGS = ["javascript", "python", "java", "cpp", "c"] as const;

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

const QuestionSchema = z
  .object({
    id: z.string().min(1),
    title: z.string().min(1),
    description: z.string().min(1),
    difficulty: z.enum(["Easy", "Medium", "Hard"]),
    examples: z.array(z.any()).min(1, "Examples must be explicitly provided"),
    constraints: z.array(z.string()).default([]),
    starterCode: z.record(z.string()),
    testCases: z.array(TestCaseSchema).min(6, "Each question must have at least 6 test cases (2 public + 4 hidden)"),
  })
  .superRefine((q, ctx) => {
    for (const lang of REQUIRED_LANGS) {
      const s = q.starterCode[lang];
      if (typeof s !== "string" || s.trim().length < 20) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `starterCode.${lang} missing or too short (need full Judge0 boilerplate)`,
          path: ["starterCode", lang],
        });
      }
    }
  });

type SeedQuestion = z.infer<typeof QuestionSchema>;

/** First two test cases are visible; all others are hidden. */
function computeIsHidden(index: number): boolean {
  return index >= 2;
}

/** 1-based question index for startersForQuestionNumber (bank ids: DSA_NEW_001 …). */
function questionNumberFromSeedId(id: string, orderIndexOneBased: number): number {
  const m = /^DSA_NEW_(\d+)$/i.exec(id.trim());
  if (m) return parseInt(m[1]!, 10);
  const digits = /^(\d+)$/.exec(id.trim());
  if (digits) return parseInt(digits[1]!, 10);
  return Math.min(22, Math.max(1, orderIndexOneBased));
}

async function loadStartersForQuestionNumber(): Promise<(qn: number) => Record<string, string>> {
  const dir = dirname(fileURLToPath(import.meta.url));
  const abs = join(dir, "..", "..", "..", "src", "data", "dsaMultiLangStarters.ts");
  const mod = await import(pathToFileURL(abs).href);
  const fn = mod.startersForQuestionNumber as (qn: number) => Record<string, string>;
  if (typeof fn !== "function") {
    throw new Error("[seed:dsa] startersForQuestionNumber not found in dsaMultiLangStarters.ts");
  }
  return fn;
}

function mergeStarterCode(
  startersForQuestionNumber: (qn: number) => Record<string, string>,
  id: string,
  orderIndexZeroBased: number,
  incoming: Record<string, unknown> | undefined,
): Record<string, string> {
  const qn = questionNumberFromSeedId(id, orderIndexZeroBased + 1);
  const defaults = startersForQuestionNumber(qn);
  const out: Record<string, string> = { ...defaults };
  if (incoming) {
    for (const lang of REQUIRED_LANGS) {
      const v = incoming[lang];
      if (typeof v === "string" && v.trim().length >= 20) {
        out[lang] = v.trim();
      }
    }
  }
  return out;
}

async function loadSourceQuestions(): Promise<SeedQuestion[]> {
  const startersForQuestionNumber = await loadStartersForQuestionNumber();

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

  for (let i = 0; i < rawCombined.length; i++) {
    const raw = rawCombined[i];
    const q = raw as any;
    const incoming = (q.templates ?? q.starterCode ?? {}) as Record<string, unknown>;
    const starterCode = mergeStarterCode(startersForQuestionNumber, String(q.id), i, incoming);

    const parsed = QuestionSchema.safeParse({
      id: q.id,
      title: q.title,
      description: q.description,
      difficulty: q.difficulty,
      examples: q.examples,
      constraints: q.constraints ?? [],
      starterCode,
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
  console.log(`Seeding DSA questions: ${allQuestions.length} questions (validated, 5 languages each)`);

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
