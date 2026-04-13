const CARTESIA_API_URL = "https://api.cartesia.ai/tts/bytes";
/** Cartesia requires this header; HTTP TTS auth is `Authorization: Bearer`, not X-API-Key. */
const CARTESIA_VERSION = "2024-06-10";

/** One-line boot diagnostics (no secrets). Call after env is loaded. */
export function logInterviewTtsStartup(): void {
  const ck = Boolean(process.env.CARTESIA_API_KEY?.trim());
  const cv = Boolean(process.env.CARTESIA_VOICE_ID?.trim());
  const cartesiaReady = ck && cv;
  if (cartesiaReady) {
    console.log("[tts] Cartesia: ready — primary interview TTS (POST /api/interview/tts, filler warm)");
  } else if (ck || cv) {
    console.warn(
      "[tts] Cartesia: incomplete — set both CARTESIA_API_KEY and CARTESIA_VOICE_ID on the API host (e.g. Render)",
    );
  } else {
    console.warn("[tts] Cartesia: not set — using ElevenLabs or browser TTS fallback only");
  }
  const ek = Boolean(process.env.ELEVENLABS_API_KEY?.trim());
  if (ek) {
    console.log("[tts] ElevenLabs: configured — fallback if Cartesia errors");
  }
}
const ELEVENLABS_API_URL = "https://api.elevenlabs.io/v1/text-to-speech";

export interface TTSResult {
  stream: ReadableStream<Uint8Array> | null;
  provider: "cartesia" | "elevenlabs" | "browser_fallback";
  error?: string;
}

function timeoutSignal(ms: number): AbortSignal {
  if (typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function") {
    return AbortSignal.timeout(ms);
  }
  const ac = new AbortController();
  setTimeout(() => ac.abort(), ms);
  return ac.signal;
}

export async function synthesizeSpeech(text: string): Promise<TTSResult> {
  const cartesiaKey = process.env.CARTESIA_API_KEY?.trim();
  const cartesiaVoiceId = process.env.CARTESIA_VOICE_ID?.trim();

  if (cartesiaKey && cartesiaVoiceId) {
    try {
      const res = await fetch(CARTESIA_API_URL, {
        method: "POST",
        headers: {
          "Cartesia-Version": CARTESIA_VERSION,
          Authorization: `Bearer ${cartesiaKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model_id: "sonic-english",
          transcript: text,
          voice: {
            mode: "id",
            id: cartesiaVoiceId,
          },
          output_format: {
            container: "mp3",
            encoding: "mp3",
            sample_rate: 44100,
          },
        }),
        signal: timeoutSignal(8000),
      });

      if (res.ok && res.body) {
        return { stream: res.body, provider: "cartesia" };
      }

      console.warn(`[tts] Cartesia returned ${res.status} — falling back to ElevenLabs`);
    } catch (e) {
      console.warn("[tts] Cartesia request failed:", e instanceof Error ? e.message : e);
    }
  }

  const elevenKey = process.env.ELEVENLABS_API_KEY?.trim();
  /** Default: Kartik (Indian English) — clear for Indian audiences; override with ELEVENLABS_VOICE_ID. */
  const elevenVoiceId = process.env.ELEVENLABS_VOICE_ID?.trim() || "XPqjYvTqfyUQr09yCpCY";
  const elevenModelId =
    process.env.ELEVENLABS_MODEL_ID?.trim() || "eleven_multilingual_v2";

  if (elevenKey) {
    try {
      const res = await fetch(`${ELEVENLABS_API_URL}/${elevenVoiceId}/stream`, {
        method: "POST",
        headers: {
          "xi-api-key": elevenKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          text,
          model_id: elevenModelId,
          voice_settings: {
            stability: 0.48,
            similarity_boost: 0.78,
          },
        }),
        signal: timeoutSignal(10_000),
      });

      if (res.ok && res.body) {
        return { stream: res.body, provider: "elevenlabs" };
      }

      console.warn(`[tts] ElevenLabs returned ${res.status}`);
    } catch (e) {
      console.warn("[tts] ElevenLabs request failed:", e instanceof Error ? e.message : e);
    }
  }

  return {
    stream: null,
    provider: "browser_fallback",
    error: "Both Cartesia and ElevenLabs unavailable",
  };
}

const FILLER_PHRASES = [
  "Hmm, interesting.",
  "Got it.",
  "I see.",
  "That makes sense.",
  "Alright.",
  "Let me think about that.",
  "Fair point.",
  "Go on.",
];

/** Rotating bridge lines for `GET /api/interview/tts-filler?index=0..3` (interview latency UX). */
export const CONVERSATIONAL_BRIDGE_FILLERS = [
  "Hmm, let me think about that.",
  "Interesting — give me a moment.",
  "Right, let's explore that.",
  "Got it.",
] as const;

/** Pre-generated MP3 per phrase — populated by `warmInterviewFillerCache()` at startup. */
const fillerMp3ByPhrase = new Map<string, Buffer>();

/** Indexed bridge clips (parallel to CONVERSATIONAL_BRIDGE_FILLERS). */
const fillerBridgeMp3: Array<{ buffer: Buffer; text: string } | null> = [null, null, null, null];

async function streamToBuffer(stream: ReadableStream<Uint8Array>): Promise<Buffer> {
  const reader = stream.getReader();
  const parts: Buffer[] = [];
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value?.byteLength) parts.push(Buffer.from(value));
  }
  return Buffer.concat(parts);
}

/**
 * Pre-cache filler TTS so GET /api/interview/tts-filler can respond instantly without a live API call.
 * Safe to call multiple times — only runs synthesis for missing entries.
 */
export async function warmInterviewFillerCache(): Promise<void> {
  if (!process.env.CARTESIA_API_KEY?.trim() && !process.env.ELEVENLABS_API_KEY?.trim()) {
    console.warn("[tts] Skipping filler warm — no CARTESIA_API_KEY or ELEVENLABS_API_KEY");
    return;
  }
  for (const phrase of FILLER_PHRASES) {
    if (fillerMp3ByPhrase.has(phrase)) continue;
    const result = await synthesizeSpeech(phrase);
    if (result.stream) {
      try {
        const buf = await streamToBuffer(result.stream);
        if (buf.length > 0) fillerMp3ByPhrase.set(phrase, buf);
      } catch (e) {
        console.warn("[tts] filler warm failed for phrase:", phrase.slice(0, 20), e);
      }
    }
  }

  for (let i = 0; i < CONVERSATIONAL_BRIDGE_FILLERS.length; i += 1) {
    if (fillerBridgeMp3[i]) continue;
    const phrase = CONVERSATIONAL_BRIDGE_FILLERS[i]!;
    const result = await synthesizeSpeech(phrase);
    if (result.stream) {
      try {
        const buf = await streamToBuffer(result.stream);
        if (buf.length > 0) fillerBridgeMp3[i] = { buffer: buf, text: phrase };
      } catch (e) {
        console.warn("[tts] bridge filler warm failed:", phrase.slice(0, 24), e);
      }
    }
  }

  if (fillerMp3ByPhrase.size > 0) {
    console.log(`[tts] Pre-cached ${fillerMp3ByPhrase.size}/${FILLER_PHRASES.length} filler MP3 clips`);
  }
  const bridgeReady = fillerBridgeMp3.filter(Boolean).length;
  if (bridgeReady > 0) {
    console.log(`[tts] Pre-cached ${bridgeReady}/${CONVERSATIONAL_BRIDGE_FILLERS.length} bridge filler clips`);
  }
}

/** Random pre-cached filler MP3 if warmup succeeded; otherwise null (route falls back to live TTS). */
export function getPreCachedFillerMp3(): { buffer: Buffer; text: string } | null {
  if (fillerMp3ByPhrase.size === 0) return null;
  const phrases = [...fillerMp3ByPhrase.keys()];
  const text = phrases[Math.floor(Math.random() * phrases.length)]!;
  const buffer = fillerMp3ByPhrase.get(text);
  if (!buffer?.length) return null;
  return { buffer, text };
}

/** Bridge filler by stable index 0–3 (matches CONVERSATIONAL_BRIDGE_FILLERS). */
export function getPreCachedFillerMp3ByIndex(index: number): { buffer: Buffer; text: string } | null {
  const i = Math.max(0, Math.min(3, Math.floor(Number.isFinite(index) ? index : 0)));
  const row = fillerBridgeMp3[i];
  if (row?.buffer?.length) return row;
  return getPreCachedFillerMp3();
}

export function getRandomFiller(): string {
  return FILLER_PHRASES[Math.floor(Math.random() * FILLER_PHRASES.length)]!;
}
