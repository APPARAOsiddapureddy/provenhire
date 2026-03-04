import { Router, Request, Response } from "express";
import { z } from "zod";
import { requireAuth } from "../middleware/auth.js";

const JUDGE0_CE_URL = process.env.JUDGE0_CE_URL || "https://ce.judge0.com";

// Judge0 CE language IDs (see https://ce.judge0.com for full list)
const langToJudge0Id: Record<string, number> = {
  javascript: 63,
  python: 71,
  java: 62,
  cpp: 54,
  c: 50,
};

const executeSchema = z.object({
  language: z.enum(["javascript", "python", "java", "cpp", "c"]),
  code: z.string().min(1).max(100_000),
  stdin: z.string().optional().default(""),
});

export const executeRouter = Router();

type Judge0Submission = {
  token?: string;
  stdout?: string | null;
  stderr?: string | null;
  compile_output?: string | null;
  message?: string | null;
  status?: { id: number; description?: string };
  exit_code?: number | null;
};

async function pollSubmission(token: string): Promise<Judge0Submission> {
  const url = `${JUDGE0_CE_URL}/submissions/${token}?base64_encoded=false`;
  for (let i = 0; i < 30; i++) {
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`Judge0 poll error: ${await resp.text()}`);
    const data = (await resp.json()) as Judge0Submission;
    const sid = data.status?.id ?? 0;
    if (sid !== 1 && sid !== 2) return data;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error("Execution timed out");
}

async function executeWithJudge0(
  languageId: number,
  code: string,
  stdin: string
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const url = `${JUDGE0_CE_URL}/submissions/?base64_encoded=false&wait=true`;
  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      source_code: code,
      language_id: languageId,
      stdin: stdin || "",
      cpu_time_limit: 5,
      wall_time_limit: 10,
      memory_limit: 256000,
    }),
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Judge0 error: ${text}`);
  }
  let data = (await resp.json()) as Judge0Submission;
  if (data.token && data.status?.id === undefined && !data.stdout) {
    data = await pollSubmission(data.token);
  }
  const statusId = data.status?.id ?? 0;
  const stdout = data.stdout ?? "";
  const stderr = data.stderr ?? "";
  const compileOut = data.compile_output ?? "";
  const msg = data.message ?? "";

  if (statusId === 6) {
    return {
      stdout: "",
      stderr: compileOut || stderr || "Compilation error",
      exitCode: 1,
    };
  }
  if (statusId >= 7 && statusId <= 14) {
    return {
      stdout: "",
      stderr: msg || stderr || (data.status?.description ?? "Runtime error"),
      exitCode: 1,
    };
  }
  if (statusId === 13) {
    return {
      stdout: "",
      stderr: msg || "Internal error",
      exitCode: 1,
    };
  }

  return {
    stdout,
    stderr,
    exitCode: data.exit_code ?? (statusId === 3 ? 0 : 1),
  };
}

executeRouter.post("/", requireAuth, async (req: Request, res: Response) => {
  const parsed = executeSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid payload", details: parsed.error.flatten() });
  }
  const { language, code, stdin } = parsed.data;
  const languageId = langToJudge0Id[language] ?? 71;

  try {
    const result = await executeWithJudge0(languageId, code, stdin);
    return res.json({
      stdout: result.stdout,
      stderr: result.stderr,
      exitCode: result.exitCode,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Execution failed";
    console.error("[execute]", msg);
    return res.status(502).json({
      error: msg.includes("Judge0")
        ? msg
        : `Code execution failed. ${process.env.JUDGE0_CE_URL ? "Check your Judge0 instance." : "The public Judge0 CE service may be busy or rate-limited. Try again in a moment, or set JUDGE0_CE_URL in server/.env to use a self-hosted instance."}`,
    });
  }
});
