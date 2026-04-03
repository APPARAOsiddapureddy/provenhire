import {
  DSA_DEFAULT_MEMORY_LIMIT,
  DSA_DEFAULT_TIMEOUT_MS,
  DSA_WALL_TIME_LIMIT,
  JUDGE0_LANGUAGE_IDS,
  JUDGE0_POLL,
  JUDGE0_STATUS,
  type DsaApiLanguage,
} from "../constants/dsa.js";

function getJudge0BaseUrl(): string {
  const url = process.env.JUDGE0_CE_URL?.trim();
  if (url) return url.replace(/\/$/, "");
  return "https://ce.judge0.com";
}

interface SubmissionPayload {
  source_code: string;
  language_id: number;
  stdin: string;
  cpu_time_limit: number;
  wall_time_limit: number;
  memory_limit: number;
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
  const langId = JUDGE0_LANGUAGE_IDS[language];
  if (langId == null) throw new Error(`Unsupported language: ${language}`);

  const submissions: SubmissionPayload[] = testInputs.map((tc) => ({
    source_code: code,
    language_id: langId,
    stdin: tc.input ?? "",
    cpu_time_limit: Math.max(1, Math.ceil((tc.timeoutMs ?? DSA_DEFAULT_TIMEOUT_MS) / 1000)),
    wall_time_limit: DSA_WALL_TIME_LIMIT,
    memory_limit: DSA_DEFAULT_MEMORY_LIMIT,
  }));

  const batchRes = await fetch(`${JUDGE0_URL}/submissions/batch?base64_encoded=false`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ submissions }),
  });

  if (!batchRes.ok) {
    const text = await batchRes.text();
    throw new Error(`Judge0 batch submit failed: ${batchRes.status} — ${text}`);
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

    const pollRes = await fetch(`${JUDGE0_URL}/submissions/batch?tokens=${encodeURIComponent(tokenStr)}&base64_encoded=false`, {
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

/**
 * Best-effort compile check via Judge0 with empty stdin.
 * Many starters parse stdin at module load; empty stdin causes runtime errors even when the code compiles.
 * We only fail preflight on Judge0 compilation errors, not runtime/Wrong Answer with empty input.
 */
export async function preflightCompile(
  code: string,
  language: DsaApiLanguage,
): Promise<{ ok: boolean; stderr: string | null }> {
  const results = await submitBatch(code, language, [{ input: "" }]);
  const r = results[0];
  if (!r) return { ok: false, stderr: "No response from Judge0" };

  const sid = r.status?.id ?? 0;
  if (sid === JUDGE0_STATUS.COMPILATION_ERROR) {
    return {
      ok: false,
      stderr: r.compile_output ?? r.stderr ?? "Compilation failed",
    };
  }
  if (sid === JUDGE0_STATUS.INTERNAL_ERROR) {
    return {
      ok: false,
      stderr: extractActualOutput(r) || r.status?.description || "Judge0 internal error",
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
