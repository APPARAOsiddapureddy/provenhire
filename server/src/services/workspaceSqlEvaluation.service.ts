import type { ExpectedType, TestResultStatus } from "../constants/dsa.js";
import { JUDGE0_STATUS } from "../constants/dsa.js";
import { compareOutput, mapJudge0ResultToTestStatus } from "./dsaComparator.js";
import { extractActualOutput, submitBatch } from "./judge0.js";
import { WorkspaceServiceError } from "./workspace.service.js";

export const SQL_QUERY_MAX_CHARS = 50_000;
const SQL_ROW_LIMIT = Math.max(1, parseInt(process.env.WORKSPACE_SQL_ROW_LIMIT ?? "200", 10));
const SQL_OUTPUT_LIMIT = Math.max(1_000, parseInt(process.env.WORKSPACE_SQL_OUTPUT_LIMIT_CHARS ?? "20000", 10));
const SQL_DEFAULT_TIMEOUT_MS = Math.max(500, parseInt(process.env.WORKSPACE_SQL_TIMEOUT_MS ?? "5000", 10));

export type WorkspaceSqlTestCase = {
  input: string;
  expected: string;
  isHidden: boolean;
  expectedType: string;
  timeoutMs?: number | null;
};

export type WorkspaceSqlTask = {
  id: string;
  title: string;
  description: string;
  difficulty: string;
  sqlSchema?: string | null;
  starterCode?: unknown;
  testCases: WorkspaceSqlTestCase[];
};

export type WorkspaceSqlRunResultRow = {
  passed: boolean;
  status: TestResultStatus;
  input?: string;
  expected?: string;
  actual?: string;
};

export type WorkspaceSqlRunResultPayload = {
  compiledSuccessfully: boolean;
  passed: number;
  total: number;
  results: WorkspaceSqlRunResultRow[];
};

function sqlForValidation(sql: string): string {
  let out = "";
  let index = 0;
  while (index < sql.length) {
    const ch = sql[index];
    const next = sql[index + 1];

    if (ch === "-" && next === "-") {
      while (index < sql.length && sql[index] !== "\n") {
        out += " ";
        index += 1;
      }
      continue;
    }

    if (ch === "/" && next === "*") {
      out += "  ";
      index += 2;
      while (index < sql.length) {
        if (sql[index] === "*" && sql[index + 1] === "/") {
          out += "  ";
          index += 2;
          break;
        }
        out += sql[index] === "\n" ? "\n" : " ";
        index += 1;
      }
      continue;
    }

    if (ch === "'" || ch === '"' || ch === "[") {
      const quote = ch;
      const close = quote === "[" ? "]" : quote;
      out += " ";
      index += 1;
      while (index < sql.length) {
        const current = sql[index];
        out += current === "\n" ? "\n" : " ";
        if (current === close) {
          if ((quote === "'" || quote === '"') && sql[index + 1] === close) {
            out += " ";
            index += 2;
            continue;
          }
          index += 1;
          break;
        }
        index += 1;
      }
      continue;
    }

    out += ch;
    index += 1;
  }
  return out;
}

export function normalizeAndValidateSqlQuery(query: string): string {
  const trimmed = query.trim();
  if (!trimmed) throw new WorkspaceServiceError("Write a SQL query before running tests.", 400);
  if (trimmed.length > SQL_QUERY_MAX_CHARS) {
    throw new WorkspaceServiceError("SQL query is too large.", 400);
  }

  const withoutTrailingSemicolon = trimmed.replace(/;\s*$/, "").trim();
  const validationSql = sqlForValidation(withoutTrailingSemicolon).toLowerCase();
  if (!validationSql.trim()) throw new WorkspaceServiceError("Write a SQL query before running tests.", 400);
  if (!/^(select|with)\b/.test(validationSql.trim())) {
    throw new WorkspaceServiceError("Only read-only SELECT or WITH queries are allowed.", 400);
  }
  if (validationSql.includes(";")) {
    throw new WorkspaceServiceError("Run one read-only SQL statement at a time.", 400);
  }
  if (/\breplace\s+into\b/.test(validationSql) || /\b(drop|delete|update|insert|alter|attach|detach|pragma|vacuum|create|truncate|grant|revoke|load_extension)\b/.test(validationSql)) {
    throw new WorkspaceServiceError("Only read-only SELECT queries are allowed in SQL rounds.", 400);
  }
  return withoutTrailingSemicolon;
}

function limitActualOutput(raw: string): string {
  const maxChars = 4_000;
  if (raw.length <= maxChars) return raw;
  return `${raw.slice(0, maxChars)}\n...[output truncated]`;
}

function buildSqliteRunner(task: WorkspaceSqlTask, query: string): string {
  const payload = {
    schema: task.sqlSchema ?? "",
    query,
    rowLimit: SQL_ROW_LIMIT,
    outputLimit: SQL_OUTPUT_LIMIT,
  };
  const payloadLiteral = JSON.stringify(JSON.stringify(payload));
  return `import json
import sqlite3
import sys

payload = json.loads(${payloadLiteral})
extra_schema = sys.stdin.read()
conn = sqlite3.connect(":memory:")
try:
    cur = conn.cursor()
    schema = (payload.get("schema") or "") + "\\n" + (extra_schema or "")
    if schema.strip():
        conn.executescript(schema)
    cur.execute(payload["query"])
    rows = cur.fetchmany(int(payload["rowLimit"]) + 1)
    if len(rows) > int(payload["rowLimit"]):
        raise RuntimeError("Row limit exceeded")
    lines = []
    for row in rows:
        lines.append("|".join(str(value) for value in row))
    output = "\\n".join(lines)
    if len(output) > int(payload["outputLimit"]):
        raise RuntimeError("Output limit exceeded")
    if output:
        print(output)
except Exception as exc:
    print(f"ERROR: {exc}", file=sys.stderr)
    sys.exit(1)
finally:
    conn.close()
`;
}

export function zeroSqlPayload(testCases: WorkspaceSqlTestCase[], message: string): WorkspaceSqlRunResultPayload {
  return {
    compiledSuccessfully: true,
    passed: 0,
    total: testCases.length,
    results: testCases.map((tc) => ({
      passed: false,
      status: "WRONG_ANSWER",
      ...(tc.isHidden ? {} : { input: tc.input, expected: tc.expected, actual: message }),
    })),
  };
}

export async function evaluateSqlTask(
  task: WorkspaceSqlTask,
  queryInput: string,
  options: { visibleOnly?: boolean } = {},
): Promise<WorkspaceSqlRunResultPayload> {
  const query = normalizeAndValidateSqlQuery(queryInput);
  const testCases = (options.visibleOnly ? task.testCases.filter((tc) => !tc.isHidden) : task.testCases).map((tc) => ({
    ...tc,
    input: tc.input ?? "",
    expected: tc.expected ?? "",
    expectedType: tc.expectedType || "exact",
  }));
  if (testCases.length === 0) throw new WorkspaceServiceError("No SQL test cases are available for this task.", 409);

  const runner = buildSqliteRunner(task, query);
  const judge0Results = await submitBatch(
    runner,
    "python",
    testCases.map((tc) => ({ input: tc.input || "", timeoutMs: tc.timeoutMs ?? SQL_DEFAULT_TIMEOUT_MS })),
  );

  let passedCount = 0;
  const results = testCases.map((tc, index): WorkspaceSqlRunResultRow => {
    const result = judge0Results[index];
    if (!result) {
      return { passed: false, status: "INTERNAL_ERROR", ...(tc.isHidden ? {} : { input: tc.input, expected: tc.expected, actual: "No execution result." }) };
    }
    const statusId = result.status?.id ?? 0;
    const actual = extractActualOutput(result).trim();
    if (statusId === JUDGE0_STATUS.ACCEPTED || statusId === JUDGE0_STATUS.WRONG_ANSWER) {
      const passed = compareOutput(actual, tc.expected, tc.expectedType as ExpectedType);
      if (passed) passedCount += 1;
      const status: TestResultStatus = passed ? "CORRECT_ANSWER" : "WRONG_ANSWER";
      return {
        passed,
        status,
        ...(tc.isHidden ? {} : { input: tc.input, expected: tc.expected, actual: limitActualOutput(actual) }),
      };
    }
    const status = mapJudge0ResultToTestStatus(result);
    return {
      passed: false,
      status,
      ...(tc.isHidden ? {} : { input: tc.input, expected: tc.expected, actual: limitActualOutput(actual) }),
    };
  });

  return {
    compiledSuccessfully: true,
    passed: passedCount,
    total: testCases.length,
    results,
  };
}