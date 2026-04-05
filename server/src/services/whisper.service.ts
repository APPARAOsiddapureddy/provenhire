import OpenAI, { toFile, APIError } from "openai";

const openai = process.env.OPENAI_API_KEY?.trim()
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY.trim() })
  : null;

export interface WhisperResult {
  transcript: string;
  confidence: "high" | "medium" | "low";
}

/** User-facing message for logs + JSON `message` field (no secrets). */
export function whisperOpenAIErrorMessage(err: unknown): string {
  if (err instanceof APIError) {
    const s = err.status;
    if (s === 401)
      return "OpenAI rejected the API key (401). Use a valid key from platform.openai.com/api-keys on the server.";
    if (s === 402)
      return "OpenAI billing: no payment method or insufficient quota (402). Add a card and credits at platform.openai.com/settings/organization/billing — ChatGPT Plus does not cover API.";
    if (s === 403)
      return "OpenAI access denied for this key (403). Check project/key permissions and that the Audio API is allowed.";
    if (s === 429)
      return "OpenAI rate limited (429). Retry in a minute or check usage limits.";
    if (s === 503 || s === 502)
      return "OpenAI service temporarily unavailable. Retry shortly.";
    const body = err.error as { message?: string } | undefined;
    const detail = typeof body?.message === "string" ? body.message : err.message;
    return detail || `OpenAI request failed (${String(s ?? "error")})`;
  }
  if (err instanceof Error) return err.message;
  return "Whisper request failed";
}

function confidenceFromVerbose(raw: {
  text?: string;
  segments?: Array<{ avg_logprob?: number }>;
}): WhisperResult {
  const segments = raw.segments ?? [];
  const avgLogProb =
    segments.length > 0
      ? segments.reduce((s, seg) => s + (seg.avg_logprob ?? -0.5), 0) / segments.length
      : -0.5;

  const confidence: WhisperResult["confidence"] =
    avgLogProb > -0.2 ? "high" : avgLogProb > -0.5 ? "medium" : "low";

  return {
    transcript: String(raw.text ?? "").trim(),
    confidence,
  };
}

export async function transcribeAudio(audioBuffer: Buffer, mimeType: string = "audio/webm"): Promise<WhisperResult> {
  if (!openai) throw new Error("OPENAI_API_KEY not configured");

  const file = await toFile(audioBuffer, "answer.webm", { type: mimeType || "audio/webm" });

  try {
    const response = await openai.audio.transcriptions.create({
      file,
      model: "whisper-1",
      language: "en",
      response_format: "verbose_json",
      temperature: 0,
    });
    return confidenceFromVerbose(response as unknown as { text?: string; segments?: Array<{ avg_logprob?: number }> });
  } catch (first) {
    /** Some accounts/API paths reject verbose_json; fall back to plain json (no per-segment confidence). */
    try {
      const fileRetry = await toFile(audioBuffer, "answer.webm", { type: mimeType || "audio/webm" });
      const response = await openai.audio.transcriptions.create({
        file: fileRetry,
        model: "whisper-1",
        language: "en",
        response_format: "json",
        temperature: 0,
      });
      const text = typeof response === "object" && response && "text" in response ? String((response as { text?: string }).text ?? "") : "";
      return { transcript: text.trim(), confidence: "medium" };
    } catch (second) {
      throw new Error(whisperOpenAIErrorMessage(second));
    }
  }
}
