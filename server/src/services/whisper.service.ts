import OpenAI, { toFile } from "openai";

const openai = process.env.OPENAI_API_KEY?.trim()
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY.trim() })
  : null;

export interface WhisperResult {
  transcript: string;
  confidence: "high" | "medium" | "low";
}

export async function transcribeAudio(audioBuffer: Buffer, mimeType: string = "audio/webm"): Promise<WhisperResult> {
  if (!openai) throw new Error("OPENAI_API_KEY not configured");

  const file = await toFile(audioBuffer, "answer.webm", { type: mimeType || "audio/webm" });

  const response = await openai.audio.transcriptions.create({
    file,
    model: "whisper-1",
    language: "en",
    response_format: "verbose_json",
    temperature: 0,
  });

  const raw = response as unknown as {
    text?: string;
    segments?: Array<{ avg_logprob?: number }>;
  };
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
