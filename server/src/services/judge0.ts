import {
  DSA_DEFAULT_CPU_TIME_LIMIT_SECONDS,
  DSA_DEFAULT_MEMORY_LIMIT,
  DSA_MAX_FILE_SIZE,
  DSA_MAX_PROCESSES_AND_THREADS,
  DSA_STACK_LIMIT,
  DSA_WALL_TIME_LIMIT,
  JUDGE0_LANGUAGE_IDS,
  JUDGE0_POLL,
  JUDGE0_STATUS,
  type DsaApiLanguage,
  type TestResultStatus,
} from "../constants/dsa.js";
import { mapJudge0ResultToTestStatus } from "./dsaComparator.js";

const DEFAULT_JUDGE0_BASE_URL = "http://127.0.0.1:2358";

function boolFromEnv(value: string | undefined, fallback = false): boolean {
  if (value == null || value.trim() === "") return fallback;
  return ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
}

function intFromEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw == null || raw.trim() === "") return fallback;
  const parsed = parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function floatFromEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw == null || raw.trim() === "") return fallback;
  const parsed = parseFloat(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function getJudge0BaseUrl(): string {
  const url = process.env.JUDGE0_BASE_URL?.trim() || process.env.JUDGE0_CE_URL?.trim();
  return (url || DEFAULT_JUDGE0_BASE_URL).replace(/\/$/, "");
}

function getJudge0SubmissionMode(): "batch_async" | "wait" {
  const raw = process.env.JUDGE0_SUBMISSION_MODE?.trim().toLowerCase();
  if (!raw || raw === "batch" || raw === "batch_async") return "batch_async";
  if (raw === "wait" || raw === "sync") return "wait";
  return "batch_async";
}

function getJudge0Headers(): Record<string, string> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const useAuth = boolFromEnv(process.env.JUDGE0_USE_AUTH);
  const token = process.env.JUDGE0_AUTH_TOKEN?.trim();
  if (useAuth && token) headers["X-Auth-Token"] = token;
  return headers;
}

async function judge0Fetch(url: string, init: RequestInit = {}): Promise<Response> {
  const timeoutMs = intFromEnv("JUDGE0_TIMEOUT_MS", 15_000);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const headers = new Headers(getJudge0Headers());
  if (init.headers) {
    new Headers(init.headers).forEach((value, key) => headers.set(key, value));
  }
  try {
    return await fetch(url, {
      ...init,
      headers,
      signal: controller.signal,
    });
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error(`Judge0 request timed out after ${timeoutMs}ms`);
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

function languageRuntimeMultiplier(language: DsaApiLanguage): number {
  switch (language) {
    case "java":
      return floatFromEnv("JUDGE0_JAVA_TIME_MULTIPLIER", 1.5);
    case "python":
      return floatFromEnv("JUDGE0_PYTHON_TIME_MULTIPLIER", 1.5);
    case "javascript":
      return floatFromEnv("JUDGE0_JAVASCRIPT_TIME_MULTIPLIER", 1.5);
    case "c":
    case "cpp":
    default:
      return 1;
  }
}

function cpuTimeLimitSeconds(language: DsaApiLanguage, timeoutMs?: number | null): number {
  const baseSeconds =
    timeoutMs != null && Number.isFinite(timeoutMs) && timeoutMs > 0
      ? timeoutMs / 1000
      : DSA_DEFAULT_CPU_TIME_LIMIT_SECONDS;
  const adjustedSeconds = baseSeconds * languageRuntimeMultiplier(language);
  return Math.max(0.1, Math.round(adjustedSeconds * 100) / 100);
}

interface SubmissionPayload {
  source_code: string;
  language_id: number;
  stdin: string;
  cpu_time_limit: number;
  wall_time_limit: number;
  memory_limit: number;
  stack_limit: number;
  max_file_size: number;
  max_processes_and_or_threads: number;
}

export interface Judge0Result {
  token?: string;
  stdout?: string | null;
  stderr?: string | null;
  compile_output?: string | null;
  message?: string | null;
  status?: { id: number; description?: string };
  time?: string | null;
  memory?: number | null;
  exit_code?: number | null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Submit many runs in one batch; poll until all complete. */
export async function submitBatch(
  code: string,
  language: DsaApiLanguage,
  testInputs: Array<{ input: string; timeoutMs?: number | null }>,
): Promise<Judge0Result[]> {
  const JUDGE0_URL = getJudge0BaseUrl();
  const mode = getJudge0SubmissionMode();
  const langId = JUDGE0_LANGUAGE_IDS[language];
  if (langId == null) throw new Error(`Unsupported language: ${language}`);
  if (mode === "wait" && testInputs.length === 1) {
    return [await submitWait(code, language, testInputs[0]?.input ?? "", testInputs[0]?.timeoutMs ?? null)];
  }

  const submissions: SubmissionPayload[] = testInputs.map((tc) => ({
    source_code: code,
    language_id: langId,
    stdin: tc.input ?? "",
    cpu_time_limit: cpuTimeLimitSeconds(language, tc.timeoutMs),
    wall_time_limit: DSA_WALL_TIME_LIMIT,
    memory_limit: DSA_DEFAULT_MEMORY_LIMIT,
    stack_limit: DSA_STACK_LIMIT,
    max_file_size: DSA_MAX_FILE_SIZE,
    max_processes_and_or_threads: DSA_MAX_PROCESSES_AND_THREADS,
  }));

  const batchRes = await judge0Fetch(`${JUDGE0_URL}/submissions/batch?base64_encoded=false`, {
    method: "POST",
    body: JSON.stringify({ submissions }),
  });

  if (!batchRes.ok) {
    const text = await batchRes.text();
    throw new Error(`Judge0 batch submit failed: ${batchRes.status} - ${text}`);
  }

  const raw = (await batchRes.json()) as unknown;
  const tokenList = Array.isArray(raw) ? raw : (raw as { submissions?: Array<{ token: string }> })?.submissions;
  if (!Array.isArray(tokenList) || tokenList.length !== testInputs.length) {
    throw new Error("Judge0 batch: unexpected response shape");
  }
  const tokens = tokenList.map((t) => t.token);
  return pollBatch(JUDGE0_URL, tokens);
}

async function pollBatch(JUDGE0_URL: string, tokens: string[]): Promise<Judge0Result[]> {
  const tokenStr = tokens.join(",");

  for (let attempt = 0; attempt < JUDGE0_POLL.MAX_ATTEMPTS; attempt++) {
    await sleep(JUDGE0_POLL.INTERVAL_MS);

    const pollRes = await judge0Fetch(`${JUDGE0_URL}/submissions/batch?tokens=${encodeURIComponent(tokenStr)}&base64_encoded=false`, {
      method: "GET",
    });

    if (!pollRes.ok) continue;

    const data = (await pollRes.json()) as { submissions?: Judge0Result[] };
    const subs = data.submissions;
    if (!Array.isArray(subs) || subs.length !== tokens.length) continue;

    const allDone = subs.every((s) => {
      const sid = s.status?.id ?? 0;
      return sid !== JUDGE0_STATUS.QUEUED && sid !== JUDGE0_STATUS.PROCESSING;
    });

    if (allDone) return subs;
  }

  throw new Error("Judge0 batch execution timed out after max poll attempts");
}

export async function submitWait(
  code: string,
  language: DsaApiLanguage,
  stdin = "",
  timeoutMs?: number | null,
): Promise<Judge0Result> {
  const JUDGE0_URL = getJudge0BaseUrl();
  const langId = JUDGE0_LANGUAGE_IDS[language];
  if (langId == null) throw new Error(`Unsupported language: ${language}`);

  const payload: SubmissionPayload = {
    source_code: code,
    language_id: langId,
    stdin,
    cpu_time_limit: cpuTimeLimitSeconds(language, timeoutMs),
    wall_time_limit: DSA_WALL_TIME_LIMIT,
    memory_limit: DSA_DEFAULT_MEMORY_LIMIT,
    stack_limit: DSA_STACK_LIMIT,
    max_file_size: DSA_MAX_FILE_SIZE,
    max_processes_and_or_threads: DSA_MAX_PROCESSES_AND_THREADS,
  };

  const resp = await judge0Fetch(`${JUDGE0_URL}/submissions?base64_encoded=false&wait=true`, {
    method: "POST",
    body: JSON.stringify(payload),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Judge0 submit failed: ${resp.status} - ${text}`);
  }

  let result = (await resp.json()) as Judge0Result;
  if (result.token && result.status?.id === undefined && !result.stdout) {
    result = await pollSubmission(JUDGE0_URL, result.token);
  }
  return result;
}

async function pollSubmission(JUDGE0_URL: string, token: string): Promise<Judge0Result> {
  for (let attempt = 0; attempt < JUDGE0_POLL.MAX_ATTEMPTS; attempt++) {
    await sleep(JUDGE0_POLL.INTERVAL_MS);
    const resp = await judge0Fetch(`${JUDGE0_URL}/submissions/${encodeURIComponent(token)}?base64_encoded=false`, {
      method: "GET",
    });
    if (!resp.ok) continue;
    const result = (await resp.json()) as Judge0Result;
    const sid = result.status?.id ?? 0;
    if (sid !== JUDGE0_STATUS.QUEUED && sid !== JUDGE0_STATUS.PROCESSING) return result;
  }
  throw new Error("Judge0 execution timed out after max poll attempts");
}

export async function executeCode(
  code: string,
  language: DsaApiLanguage,
  stdin = "",
): Promise<{ stdout: string; stderr: string; exitCode: number; statusId: number }> {
  const result = await submitWait(code, language, stdin);
  const statusId = result.status?.id ?? 0;
  const stdout = result.stdout ?? "";
  const stderr = result.stderr ?? "";
  const compileOut = result.compile_output ?? "";
  const msg = result.message ?? "";

  if (statusId === JUDGE0_STATUS.COMPILATION_ERROR) {
    return { stdout: "", stderr: compileOut || stderr || "Compilation error", exitCode: 1, statusId };
  }

  if (statusId >= 7 && statusId <= JUDGE0_STATUS.EXEC_FORMAT_ERROR) {
    return {
      stdout: "",
      stderr: msg || stderr || result.status?.description || "Runtime error",
      exitCode: 1,
      statusId,
    };
  }

  if (statusId === JUDGE0_STATUS.INTERNAL_ERROR) {
    return { stdout: "", stderr: msg || "Internal error", exitCode: 1, statusId };
  }

  return {
    stdout,
    stderr,
    exitCode: result.exit_code ?? (statusId === JUDGE0_STATUS.ACCEPTED ? 0 : 1),
    statusId,
  };
}

/**
 * Best-effort compile check via Judge0 with empty stdin.
 * Many starters parse stdin at module load; empty stdin causes runtime errors even when the code compiles.
 * We only fail preflight on Judge0 compilation errors, not runtime/Wrong Answer with empty input.
 */
export async function preflightCompile(
  code: string,
  language: DsaApiLanguage,
): Promise<{ ok: boolean; stderr: string | null; status?: TestResultStatus }> {
  const results = await submitBatch(code, language, [{ input: "" }]);
  const r = results[0];
  if (!r) return { ok: false, stderr: "No response from Judge0", status: "INTERNAL_ERROR" };

  const sid = r.status?.id ?? 0;
  if (sid === JUDGE0_STATUS.COMPILATION_ERROR) {
    return {
      ok: false,
      stderr: r.compile_output ?? r.stderr ?? "Compilation failed",
      status: "COMPILE_ERROR",
    };
  }
  if (sid === JUDGE0_STATUS.INTERNAL_ERROR) {
    return {
      ok: false,
      stderr: extractActualOutput(r) || r.status?.description || "Judge0 internal error",
      status: "INTERNAL_ERROR",
    };
  }
  const mappedStatus = mapJudge0ResultToTestStatus(r);
  if (mappedStatus === "COMPILE_ERROR") {
    return {
      ok: false,
      stderr: extractActualOutput(r) || "Compilation failed",
      status: "COMPILE_ERROR",
    };
  }
  return { ok: true, stderr: null };
}

export function extractActualOutput(result: Judge0Result): string {
  if (result.stdout && result.stdout.trim().length > 0) return result.stdout;
  if (result.compile_output) return result.compile_output;
  if (result.stderr) return result.stderr;
  if (result.message) return result.message;
  return "";
}
