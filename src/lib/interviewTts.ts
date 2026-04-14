/**
 * Shared interview TTS: Cartesia/ElevenLabs MP3 from POST /api/interview/tts,
 * or JSON { fallback: true, text } → browser speechSynthesis.
 * Used by Expert, AI Skills, System Design, and Data System Design stages.
 */
import { getAuthToken } from "@/lib/api";

let currentAudio: HTMLAudioElement | null = null;
let currentObjectUrl: string | null = null;

export function stopInterviewAudioOutput(): void {
  try {
    window.speechSynthesis?.cancel();
  } catch {
    /* ignore */
  }
  try {
    if (currentAudio) {
      currentAudio.pause();
      currentAudio.src = "";
      currentAudio.load();
    }
  } catch {
    /* ignore */
  } finally {
    currentAudio = null;
  }
  try {
    if (currentObjectUrl) URL.revokeObjectURL(currentObjectUrl);
  } catch {
    /* ignore */
  } finally {
    currentObjectUrl = null;
  }
}

/** Tiny silent WAV — call from a click/tap before awaits so later `Audio.play()` is not blocked by autoplay policy. */
export function unlockInterviewAudioOutput(): void {
  try {
    const a = new Audio(
      "data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA"
    );
    a.volume = 0.01;
    void a
      .play()
      .then(() => {
        a.pause();
        a.removeAttribute("src");
      })
      .catch(() => {});
  } catch {
    /* ignore */
  }
}

export function fallbackBrowserTTS(text: string, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (!window.speechSynthesis || signal?.aborted) {
      resolve();
      return;
    }
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 0.92;
    const voices = window.speechSynthesis.getVoices();
    const scoreVoice = (v: SpeechSynthesisVoice) => {
      const lang = (v.lang || "").toLowerCase();
      const name = v.name.toLowerCase();
      if (lang === "en-in" || name.includes("india") || name.includes("indian")) return 4;
      if (lang === "en-gb" || name.includes("uk english") || name.includes("british")) return 3;
      if (name.includes("sangeeta") || name.includes("veena") || name.includes("lekha")) return 4;
      if (lang === "en-us" && (name.includes("samantha") || name.includes("google us english"))) return 1;
      if (lang.startsWith("en")) return 2;
      return 0;
    };
    const preferred = [...voices].sort((a, b) => scoreVoice(b) - scoreVoice(a))[0];
    if (preferred && scoreVoice(preferred) >= 2) u.voice = preferred;
    const onAbort = () => {
      window.speechSynthesis.cancel();
      signal?.removeEventListener("abort", onAbort);
      resolve();
    };
    signal?.addEventListener("abort", onAbort);
    u.onend = () => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    };
    u.onerror = () => resolve();
    window.speechSynthesis.speak(u);
  });
}

export async function speakText(text: string, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) return;
  try {
    const res = await fetch("/api/interview/tts", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${getAuthToken()}`,
      },
      body: JSON.stringify({ text }),
      signal,
    });
    if (!res.ok) throw new Error(`TTS HTTP ${res.status}`);

    const contentType = res.headers.get("Content-Type") || "";
    const looksLikeAudio = contentType.includes("audio") || contentType.includes("octet-stream");

    if (looksLikeAudio) {
      const blob = await res.blob();
      if (blob.size === 0) {
        await fallbackBrowserTTS(text, signal);
        return;
      }
      // Ensure no previous question keeps playing across navigation.
      stopInterviewAudioOutput();
      const url = URL.createObjectURL(blob);
      currentObjectUrl = url;
      await new Promise<void>((resolve) => {
        const audio = new Audio();
        currentAudio = audio;
        audio.preload = "auto";
        audio.setAttribute("playsinline", "");
        audio.volume = 1;
        audio.src = url;
        const cleanup = () => {
          if (currentObjectUrl) {
            URL.revokeObjectURL(currentObjectUrl);
            currentObjectUrl = null;
          } else {
            URL.revokeObjectURL(url);
          }
          if (currentAudio === audio) currentAudio = null;
          signal?.removeEventListener("abort", onAbort);
          resolve();
        };
        const onAbort = () => {
          audio.pause();
          audio.src = "";
          cleanup();
        };
        signal?.addEventListener("abort", onAbort);
        audio.onended = cleanup;
        audio.onerror = () => {
          void fallbackBrowserTTS(text, signal).finally(cleanup);
        };
        void audio.play().catch(() => {
          void fallbackBrowserTTS(text, signal).finally(cleanup);
        });
      });
      return;
    }

    const data = (await res.json()) as { fallback?: boolean; text?: string };
    if (data.fallback) {
      await fallbackBrowserTTS(data.text || text, signal);
    }
  } catch (e) {
    if (signal?.aborted) return;
    console.warn("[speakText] TTS request failed, using browser fallback:", e);
    await fallbackBrowserTTS(text, signal);
  }
}
