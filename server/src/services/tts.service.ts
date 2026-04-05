const CARTESIA_API_URL = "https://api.cartesia.ai/tts/bytes";
const CARTESIA_VERSION = "2024-06-10";
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
          "X-API-Key": cartesiaKey,
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
  const elevenVoiceId = process.env.ELEVENLABS_VOICE_ID?.trim() || "EXAVITQu4vr4xnSDxMaL";

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
          model_id: "eleven_turbo_v2_5",
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.75,
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
];

export function getRandomFiller(): string {
  return FILLER_PHRASES[Math.floor(Math.random() * FILLER_PHRASES.length)]!;
}
