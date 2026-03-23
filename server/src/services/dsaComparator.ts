import { ExpectedType, JUDGE0_STATUS, TestResultStatus } from "../constants/dsa.js";

/** Normalize exact string output (line endings, trim, collapse horizontal whitespace). */
export function normalizeExact(raw: string): string {
  return (raw || "")
    .replace(/\r\n/g, "\n")
    .trim()
    .replace(/[ \t]+/g, " ")
    .replace(/\n{2,}/g, "\n");
}

function isNumericToken(t: string): boolean {
  return /^[-+]?\d+(\.\d+)?([eE][-+]?\d+)?$/.test(t.trim());
}

function tokenEquals(a: string, b: string): boolean {
  const at = normalizeExact(a);
  const bt = normalizeExact(b);
  if (at === bt) return true;

  // Numeric tolerance for token-level comparisons.
  if (isNumericToken(at) && isNumericToken(bt)) {
    const an = Number(at);
    const bn = Number(bt);
    if (!Number.isNaN(an) && !Number.isNaN(bn)) {
      return Math.abs(an - bn) < 1e-5;
    }
  }

  // Common boolean / textual output variants.
  const al = at.toLowerCase();
  const bl = bt.toLowerCase();
  if (al === bl) return true;
  if ((al === "true" || al === "false") && (bl === "true" || bl === "false")) return al === bl;
  if ((al === "yes" || al === "no") && (bl === "yes" || bl === "no")) return al === bl;

  return false;
}

/**
 * Relaxed exact comparator:
 * 1) strict normalized string equality
 * 2) JSON structural equality when both parse
 * 3) token-by-token equivalence (case-insensitive text + numeric tolerance)
 */
function compareExactRelaxed(actual: string, expected: string): boolean {
  const na = normalizeExact(actual);
  const ne = normalizeExact(expected);
  if (na === ne) return true;

  // Structural compare for JSON-like outputs.
  try {
    const aObj = JSON.parse(na);
    const eObj = JSON.parse(ne);
    if (JSON.stringify(aObj) === JSON.stringify(eObj)) return true;
  } catch {
    // Not JSON — continue with token compare.
  }

  const aTokens = tokenize(na);
  const eTokens = tokenize(ne);
  if (aTokens.length !== eTokens.length) return false;
  return aTokens.every((t, i) => tokenEquals(t, eTokens[i] ?? ""));
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
      return compareExactRelaxed(actual, expected);
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
      return aTokens.every((t, i) => tokenEquals(t, eTokens[i]!));
    }
    case "set": {
      const normalizeSetToken = (x: string) => {
        const nx = normalizeExact(x);
        if (isNumericToken(nx)) {
          const n = Number(nx);
          if (!Number.isNaN(n)) return String(Math.round(n * 1e5) / 1e5);
        }
        return nx.toLowerCase();
      };
      const aSet = new Set(tokenize(actual).map(normalizeSetToken));
      const eSet = new Set(tokenize(expected).map(normalizeSetToken));
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
