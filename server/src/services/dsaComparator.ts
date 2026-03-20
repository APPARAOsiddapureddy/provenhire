import { ExpectedType, JUDGE0_STATUS, TestResultStatus } from "../constants/dsa.js";

/** Normalize exact string output (line endings, trim, collapse horizontal whitespace). */
export function normalizeExact(raw: string): string {
  return (raw || "")
    .replace(/\r\n/g, "\n")
    .trim()
    .replace(/[ \t]+/g, " ")
    .replace(/\n{2,}/g, "\n");
}

function tokenize(raw: string): string[] {
  return (raw || "")
    .replace(/[\[\](){},"']/g, " ")
    .trim()
    .split(/[\s\n]+/)
    .map((t) => t.trim())
    .filter(Boolean);
}

export function compareOutput(actual: string, expected: string, type: ExpectedType): boolean {
  switch (type) {
    case "exact":
      return normalizeExact(actual) === normalizeExact(expected);
    case "numeric": {
      const a = parseFloat(String(actual).trim());
      const e = parseFloat(String(expected).trim());
      if (Number.isNaN(a) || Number.isNaN(e)) return false;
      return Math.abs(a - e) < 1e-5;
    }
    case "array": {
      const aTokens = tokenize(actual);
      const eTokens = tokenize(expected);
      if (aTokens.length !== eTokens.length) return false;
      return aTokens.every((t, i) => normalizeExact(t) === normalizeExact(eTokens[i]!));
    }
    case "set": {
      const aSet = new Set(tokenize(actual).map(normalizeExact));
      const eSet = new Set(tokenize(expected).map(normalizeExact));
      if (aSet.size !== eSet.size) return false;
      for (const item of eSet) {
        if (!aSet.has(item)) return false;
      }
      return true;
    }
    default:
      return false;
  }
}

/** Map Judge0 status to user-facing execution failure (not used when status is ACCEPTED and we compare locally). */
export function mapJudge0StatusToTestStatus(statusId: number): TestResultStatus {
  if (statusId === JUDGE0_STATUS.ACCEPTED) return "passed";
  if (statusId === JUDGE0_STATUS.COMPILATION_ERROR) return "compile_error";
  if (statusId === JUDGE0_STATUS.TIME_LIMIT_EXCEEDED) return "time_limit_exceeded";
  if (statusId === JUDGE0_STATUS.EXEC_FORMAT_ERROR) return "memory_limit_exceeded";
  if (statusId >= 7 && statusId <= 12) return "runtime_error";
  if (statusId === JUDGE0_STATUS.INTERNAL_ERROR) return "internal_error";
  if (statusId === JUDGE0_STATUS.WRONG_ANSWER) return "wrong_answer";
  return "wrong_answer";
}
