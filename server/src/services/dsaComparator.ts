import { DSA_DEFAULT_MEMORY_LIMIT, JUDGE0_STATUS, type ExpectedType, type TestResultStatus } from "../constants/dsa.js";

type Judge0StatusLike = {
  status?: { id: number; description?: string };
  stdout?: string | null;
  stderr?: string | null;
  compile_output?: string | null;
  message?: string | null;
  memory?: number | null;
};

/** Normalize exact string output (line endings, trim, collapse horizontal whitespace/newlines). */
export function normalizeExact(raw: string): string {
  return (raw || "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .trim()
    .replace(/[ \t]+/g, " ")
    .replace(/\n+/g, "\n");
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

function parseDelimitedRows(raw: string): string[][] {
  const normalized = normalizeExact(raw);
  if (!normalized) return [];
  return normalized.split("\n").map((line) => {
    const delimiter = line.includes("|") ? "|" : ",";
    return line.split(delimiter).map((cell) => normalizeExact(cell));
  });
}

function compareDelimitedRows(actual: string, expected: string): boolean {
  if (compareExactRelaxed(actual, expected)) return true;
  const aRows = parseDelimitedRows(actual);
  const eRows = parseDelimitedRows(expected);
  if (aRows.length !== eRows.length) return false;
  return aRows.every((row, rowIndex) => {
    const expectedRow = eRows[rowIndex] ?? [];
    if (row.length !== expectedRow.length) return false;
    return row.every((cell, cellIndex) => tokenEquals(cell, expectedRow[cellIndex] ?? ""));
  });
}

export function compareOutput(actual: string, expected: string, type: ExpectedType): boolean {
  switch (type) {
    case "exact":
      return compareExactRelaxed(actual, expected);
    case "numeric": {
      const a = parseFloat(normalizeExact(String(actual)));
      const e = parseFloat(normalizeExact(String(expected)));
      if (Number.isNaN(a) || Number.isNaN(e)) return false;
      return Math.abs(a - e) < 1e-5;
    }
    case "array": {
      const aTokens = tokenize(actual);
      const eTokens = tokenize(expected);
      if (aTokens.length !== eTokens.length) return false;
      return aTokens.every((t, i) => tokenEquals(t, eTokens[i]!));
    }
    case "csv_match":
      return compareDelimitedRows(actual, expected);
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

function joinedSignal(result: Judge0StatusLike): string {
  return [
    result.status?.description,
    result.message,
    result.stderr,
    result.compile_output,
    result.stdout,
  ]
    .filter((x): x is string => typeof x === "string" && x.trim().length > 0)
    .join("\n")
    .toLowerCase();
}

function hasOutputLimitSignal(signal: string): boolean {
  return (
    /\bsigxfsz\b/.test(signal) ||
    /file too large/.test(signal) ||
    /file size limit/.test(signal) ||
    /output limit/.test(signal) ||
    /max(?:imum)? file size/.test(signal) ||
    /too much output/.test(signal)
  );
}

function hasCompileSignal(signal: string): boolean {
  return (
    /syntaxerror/.test(signal) ||
    /indentationerror/.test(signal) ||
    /taberror/.test(signal) ||
    /compilation error/.test(signal) ||
    /compile error/.test(signal)
  );
}

function hasMemoryLimitSignal(signal: string): boolean {
  return (
    /memory limit/.test(signal) ||
    /out ?of ?memory/.test(signal) ||
    /outofmemoryerror/.test(signal) ||
    /memoryerror/.test(signal) ||
    /std::bad_alloc/.test(signal) ||
    /cannot allocate memory/.test(signal) ||
    /allocation failed/.test(signal)
  );
}

function isNearMemoryLimit(memoryKb: number | null | undefined): boolean {
  if (typeof memoryKb !== "number" || !Number.isFinite(memoryKb) || memoryKb <= 0) return false;
  return memoryKb >= DSA_DEFAULT_MEMORY_LIMIT * 0.95;
}

/**
 * Maps Judge0 execution results to product-level statuses.
 * Judge0 CE does not expose first-class MLE/OLE status IDs in the standard 1-14 set.
 * OLE is strongest when status 8/SIGXFSZ appears. MLE is inferred only from explicit
 * memory signals or high reported memory on a runtime failure to avoid misleading users.
 */
export function mapJudge0ResultToTestStatus(result: Judge0StatusLike): TestResultStatus {
  const statusId = result.status?.id ?? 0;
  const signal = joinedSignal(result);

  if (statusId === JUDGE0_STATUS.ACCEPTED) return "CORRECT_ANSWER";
  if (statusId === JUDGE0_STATUS.WRONG_ANSWER) return "WRONG_ANSWER";
  if (statusId === JUDGE0_STATUS.TIME_LIMIT_EXCEEDED) return "TLE";
  if (statusId === JUDGE0_STATUS.COMPILATION_ERROR) return "COMPILE_ERROR";
  if (statusId === JUDGE0_STATUS.INTERNAL_ERROR) return "INTERNAL_ERROR";
  if (statusId === JUDGE0_STATUS.EXEC_FORMAT_ERROR) return "INTERNAL_ERROR";
  if (hasCompileSignal(signal)) return "COMPILE_ERROR";

  if (statusId === JUDGE0_STATUS.RUNTIME_ERROR_SIGXFSZ || hasOutputLimitSignal(signal)) return "OLE";

  if (statusId >= 7 && statusId <= 12) {
    if (hasMemoryLimitSignal(signal) || isNearMemoryLimit(result.memory)) return "MLE";
    return "RUNTIME_ERROR";
  }

  if (hasOutputLimitSignal(signal)) return "OLE";
  if (hasMemoryLimitSignal(signal)) return "MLE";
  return "INTERNAL_ERROR";
}

/** Backward-compatible helper for older call sites that only pass a Judge0 status id. */
export function mapJudge0StatusToTestStatus(statusId: number): TestResultStatus {
  return mapJudge0ResultToTestStatus({ status: { id: statusId } });
}
