import type { PrismaClient } from "@prisma/client";
import type { DsaApiLanguage, ExpectedType, TestResultStatus } from "../constants/dsa.js";
import { JUDGE0_STATUS } from "../constants/dsa.js";
import { compareOutput, mapJudge0StatusToTestStatus } from "./dsaComparator.js";
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
      results: testCases.map(() => ({ passed: false, status: "compile_error" as TestResultStatus })),
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

    if (sid === JUDGE0_STATUS.COMPILATION_ERROR) {
      if (tc.isHidden) return { passed: false, status: "compile_error" };
      return { passed: false, status: "compile_error", input: tc.input, expected: tc.expected, actual: rawActual };
    }

    if (sid === JUDGE0_STATUS.TIME_LIMIT_EXCEEDED) {
      if (tc.isHidden) return { passed: false, status: "time_limit_exceeded" };
      return {
        passed: false,
        status: "time_limit_exceeded",
        input: tc.input,
        expected: tc.expected,
        actual: rawActual,
      };
    }

    if (sid === JUDGE0_STATUS.EXEC_FORMAT_ERROR) {
      if (tc.isHidden) return { passed: false, status: "memory_limit_exceeded" };
      return {
        passed: false,
        status: "memory_limit_exceeded",
        input: tc.input,
        expected: tc.expected,
        actual: rawActual,
      };
    }

    if (sid >= 7 && sid <= 12) {
      const st = mapJudge0StatusToTestStatus(sid);
      if (tc.isHidden) return { passed: false, status: st };
      return { passed: false, status: st, input: tc.input, expected: tc.expected, actual: rawActual };
    }

    if (sid === JUDGE0_STATUS.INTERNAL_ERROR) {
      if (tc.isHidden) return { passed: false, status: "internal_error" };
      return { passed: false, status: "internal_error", input: tc.input, expected: tc.expected, actual: rawActual };
    }

    if (sid === JUDGE0_STATUS.ACCEPTED || sid === JUDGE0_STATUS.WRONG_ANSWER) {
      const passed = compareOutput(rawActual, tc.expected, type);
      const status: TestResultStatus = passed ? "passed" : "wrong_answer";
      if (passed) passedCount++;
      if (tc.isHidden) return { passed, status };
      return { passed, status, input: tc.input, expected: tc.expected, actual: rawActual };
    }

    const fallbackStatus = mapJudge0StatusToTestStatus(sid);
    if (tc.isHidden) return { passed: false, status: fallbackStatus };
    return { passed: false, status: fallbackStatus, input: tc.input, expected: tc.expected, actual: rawActual };
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
    },
  });
}
