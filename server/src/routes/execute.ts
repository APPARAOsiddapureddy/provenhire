import { Router, Request, Response } from "express";
import { z } from "zod";
import { DSA_API_LANGUAGES, type DsaApiLanguage } from "../constants/dsa.js";
import { requireAuth, requireJobSeeker } from "../middleware/auth.js";
import { codeExecuteLimiter } from "../middleware/executeRateLimit.js";
import { executeCode, getJudge0BaseUrl } from "../services/judge0.js";

const executeSchema = z.object({
  language: z.enum(DSA_API_LANGUAGES as unknown as [DsaApiLanguage, ...DsaApiLanguage[]]),
  code: z.string().min(1).max(100_000),
  stdin: z.string().optional().default(""),
});

export const executeRouter = Router();

executeRouter.post("/", codeExecuteLimiter, requireAuth, requireJobSeeker, async (req: Request, res: Response) => {
  const parsed = executeSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid payload", details: parsed.error.flatten() });
  }
  const { language, code, stdin } = parsed.data;

  try {
    const result = await executeCode(code, language, stdin);
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
        : `Code execution failed. Check your Judge0 instance at ${getJudge0BaseUrl()}.`,
    });
  }
});
