import OpenAI, { toFile } from "openai";

const openai = process.env.OPENAI_API_KEY?.trim()
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY.trim() })
  : null;

export interface WhisperResult {
  transcript: string;
  confidence: "high" | "medium" | "low";
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
      const err = second as { status?: number; message?: string };
      const msg =
        err?.status === 401
          ? "OpenAI rejected the API key (401). Check OPENAI_API_KEY on the server."
          : err?.message || (first instanceof Error ? first.message : "Whisper request failed");
      throw new Error(msg);
    }
  }
}
