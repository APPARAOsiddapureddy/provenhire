import type { PrismaClient } from "@prisma/client";
import type { DsaApiLanguage, ExpectedType, TestResultStatus } from "../constants/dsa.js";
import { JUDGE0_STATUS } from "../constants/dsa.js";
import { compareOutput, mapJudge0ResultToTestStatus } from "./dsaComparator.js";
import { extractActualOutput, preflightCompile, submitBatch } from "./judge0.js";

export type DsaRunResultRow =
  | { passed: boolean; status: TestResultStatus }
  | { passed: boolean; status: TestResultStatus; input: string; expected: string; actual: string };

export type DsaRunResultPayload = {
  compiledSuccessfully: boolean;
  passed: number;
  total: number;
  compileError?: string;
  results: DsaRunResultRow[];
};

export type DsaTestCaseRow = {
  input: string;
  expected: string;
  isHidden: boolean;
  expectedType: string;
  timeoutMs: number | null;
};

function limitActualOutput(raw: string): string {
  const maxChars = 4_000;
  if (raw.length <= maxChars) return raw;
  return `${raw.slice(0, maxChars)}\n...[output truncated]`;
}

export async function evaluateDsaAgainstTestCases(
  testCases: DsaTestCaseRow[],
  code: string,
  language: DsaApiLanguage,
): Promise<DsaRunResultPayload> {
  const total = testCases.length;

  const compile = await preflightCompile(code, language);
  if (!compile.ok) {
    return {
      compiledSuccessfully: false,
      passed: 0,
      total,
      compileError: compile.stderr ?? "Compilation failed",
      results: testCases.map(() => ({ passed: false, status: compile.status ?? "COMPILE_ERROR" })),
    };
  }

  const judge0Results = await submitBatch(
    code,
    language,
    testCases.map((tc) => ({ input: tc.input, timeoutMs: tc.timeoutMs })),
  );

  let passedCount = 0;
  const results: DsaRunResultRow[] = testCases.map((tc, i) => {
    const jr = judge0Results[i]!;
    const sid = jr.status?.id ?? 0;
    const rawActual = extractActualOutput(jr);
    const type = (tc.expectedType || "exact") as ExpectedType;

    if (sid === JUDGE0_STATUS.ACCEPTED || sid === JUDGE0_STATUS.WRONG_ANSWER) {
      const passed = compareOutput(rawActual, tc.expected, type);
      const status: TestResultStatus = passed ? "CORRECT_ANSWER" : "WRONG_ANSWER";
      if (passed) passedCount++;
      if (tc.isHidden) return { passed, status };
      return { passed, status, input: tc.input, expected: tc.expected, actual: limitActualOutput(rawActual) };
    }

    const fallbackStatus = mapJudge0ResultToTestStatus(jr);
    if (tc.isHidden) return { passed: false, status: fallbackStatus };
    const diagnostic = fallbackStatus === "OLE"
      ? jr.stderr ?? jr.message ?? jr.status?.description ?? rawActual
      : rawActual;
    return { passed: false, status: fallbackStatus, input: tc.input, expected: tc.expected, actual: limitActualOutput(diagnostic) };
  });

  return {
    compiledSuccessfully: true,
    passed: passedCount,
    total,
    results,
  };
}

export async function persistDsaSubmission(
  prisma: PrismaClient,
  params: {
    userId: string;
    questionId: string;
    language: string;
    code: string;
    passedCount: number;
    totalCount: number;
    isOfficial: boolean;
    results: unknown;
    followUpScore?: number | null;
    followUpResults?: unknown;
  },
): Promise<void> {
  await prisma.dsaSubmission.create({
    data: {
      userId: params.userId,
      questionId: params.questionId,
      language: params.language,
      code: params.code,
      passedCount: params.passedCount,
      totalCount: params.totalCount,
      isOfficial: params.isOfficial,
      results: params.results as object,
      followUpScore: params.followUpScore ?? undefined,
      followUpResults: params.followUpResults === undefined ? undefined : (params.followUpResults as object),
    },
  });
}
