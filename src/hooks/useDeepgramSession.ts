import { useRef, useState, useCallback, useEffect } from "react";
import { api } from "@/lib/api";

export type FloorState = "idle" | "user_speaking" | "ai_thinking" | "ai_speaking";
export type InterviewSttMode = "deepgram" | "browser" | "idle";

const DEEPGRAM_KEY_PATH = "/api/interview/deepgram-token";

function getSpeechRecognition(): typeof window.SpeechRecognition | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: typeof window.SpeechRecognition;
    webkitSpeechRecognition?: typeof window.SpeechRecognition;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function useDeepgramSession({
  interviewId,
  onFinal,
  onPartial,
  onError,
}: {
  interviewId: string | null;
  onFinal: (text: string) => void;
  onPartial: (text: string) => void;
  onError: (err: string) => void;
}) {
  const [floor, setFloor] = useState<FloorState>("idle");
  const [micLevel, setMicLevel] = useState(0);
  const [sttMode, setSttMode] = useState<InterviewSttMode>("idle");

  const wsRef = useRef<WebSocket | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const utteranceBufferRef = useRef<string[]>([]);
  const flushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const vizFrameRef = useRef<number | null>(null);
  const currentAbortRef = useRef<AbortController | null>(null);

  const recognitionRef = useRef<InstanceType<NonNullable<ReturnType<typeof getSpeechRecognition>>> | null>(null);
  const browserStoppedRef = useRef(false);
  const latestTranscriptRef = useRef("");
  const browserAudioCtxRef = useRef<AudioContext | null>(null);
  const browserAnalyserRef = useRef<AnalyserNode | null>(null);

  const transition = useCallback((next: FloorState) => {
    setFloor(next);
  }, []);

  const flushUtterance = useCallback(() => {
    const text = utteranceBufferRef.current.join(" ").trim();
    utteranceBufferRef.current = [];
    if (text) {
      onFinal(text);
    }
  }, [onFinal]);

  const stopBrowserRecognition = useCallback(() => {
    browserStoppedRef.current = true;
    try {
      recognitionRef.current?.stop();
    } catch {
      /* noop */
    }
    recognitionRef.current = null;
    if (vizFrameRef.current != null) {
      cancelAnimationFrame(vizFrameRef.current);
      vizFrameRef.current = null;
    }
    processorRef.current?.disconnect();
    processorRef.current = null;
    void browserAudioCtxRef.current?.close();
    browserAudioCtxRef.current = null;
    browserAnalyserRef.current = null;
    mediaStreamRef.current?.getTracks().forEach((t) => t.stop());
    mediaStreamRef.current = null;
  }, []);

  const startBrowserRecognition = useCallback(async () => {
    const SR = getSpeechRecognition();
    if (!SR) {
      onError("Speech recognition is not supported in this browser. Try Chrome or Edge, or set DEEPGRAM_API_KEY on the server.");
      return;
    }

    const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    mediaStreamRef.current = stream;

    const audioCtx = new AudioContext();
    browserAudioCtxRef.current = audioCtx;
    await audioCtx.resume().catch(() => {});

    const source = audioCtx.createMediaStreamSource(stream);
    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = 256;
    browserAnalyserRef.current = analyser;
    source.connect(analyser);

    const vizData = new Uint8Array(analyser.frequencyBinCount);
    const vizLoop = () => {
      if (browserStoppedRef.current) return;
      analyser.getByteFrequencyData(vizData);
      const avg = vizData.reduce((a, b) => a + b, 0) / vizData.length;
      setMicLevel(avg / 128);
      vizFrameRef.current = requestAnimationFrame(vizLoop);
    };
    vizLoop();

    browserStoppedRef.current = false;
    latestTranscriptRef.current = "";

    const rec = new SR();
    recognitionRef.current = rec;
    rec.lang = "en-US";
    rec.continuous = true;
    rec.interimResults = true;

    const schedulePrefetch = (text: string) => {
      if (!interviewId || !text.trim()) return;
      void api.post("/api/interview/v2/partial", { interviewId, text }).catch(() => {});
    };

    rec.onresult = (event: SpeechRecognitionEvent) => {
      let line = "";
      for (let i = 0; i < event.results.length; i++) {
        line += event.results[i]![0]!.transcript;
      }
      latestTranscriptRef.current = line;
      onPartial(line);
      const last = event.results[event.results.length - 1];
      if (last?.isFinal && line.trim()) {
        schedulePrefetch(line.trim());
      }
    };

    rec.onerror = (ev: SpeechRecognitionErrorEvent) => {
      if (ev.error === "aborted" || ev.error === "no-speech") return;
      if (ev.error === "not-allowed") {
        onError("Microphone permission denied.");
      }
    };

    rec.onend = () => {
      const stopped = browserStoppedRef.current;
      const t = latestTranscriptRef.current.trim();
      latestTranscriptRef.current = "";
      if (!stopped && t) {
        onFinal(t);
      }
      if (!browserStoppedRef.current && recognitionRef.current) {
        try {
          rec.start();
        } catch {
          /* may throw if already started */
        }
      }
    };

    transition("user_speaking");
    try {
      rec.start();
    } catch (e) {
      onError(`Could not start speech recognition: ${String(e)}`);
    }
  }, [interviewId, onError, onFinal, onPartial, transition]);

  const startDeepgram = useCallback(
    async (token: string) => {
      const ws = new WebSocket(
        `wss://api.deepgram.com/v1/listen?model=nova-2&language=en&encoding=linear16&sample_rate=16000&channels=1&interim_results=true&vad_events=true&endpointing=1200&utterance_end_ms=2500`,
        ["token", token]
      );

      wsRef.current = ws;

      ws.onopen = () => {
        transition("user_speaking");
      };

      ws.onmessage = (event: MessageEvent) => {
        let data: Record<string, unknown>;
        try {
          data = JSON.parse(event.data as string) as Record<string, unknown>;
        } catch {
          return;
        }

        const type = data.type as string | undefined;
        if (type === "SpeechStarted") {
          if (currentAbortRef.current) {
            currentAbortRef.current.abort();
            currentAbortRef.current = null;
          }
          transition("user_speaking");
        }

        if (type === "UtteranceEnd") {
          if (flushTimerRef.current) clearTimeout(flushTimerRef.current);
          flushUtterance();
          return;
        }

        const channel = data.channel as { alternatives?: { transcript?: string }[] } | undefined;
        const text = channel?.alternatives?.[0]?.transcript ?? "";
        if (!text) return;

        const isFinal = Boolean(data.is_final ?? data.speech_final);

        if (isFinal) {
          utteranceBufferRef.current.push(text);
          if (flushTimerRef.current) clearTimeout(flushTimerRef.current);
          flushTimerRef.current = setTimeout(flushUtterance, 5000);

          const accumulated = utteranceBufferRef.current.join(" ");
          onPartial(accumulated);

          if (interviewId) {
            void api.post("/api/interview/v2/partial", { interviewId, text: accumulated }).catch(() => {});
          }
        } else {
          const accumulated = utteranceBufferRef.current.join(" ");
          onPartial(accumulated ? `${accumulated} ${text}` : String(text));
        }
      };

      ws.onerror = () => onError("Deepgram connection error");
      ws.onclose = () => transition("idle");

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      mediaStreamRef.current = stream;

      const audioCtx = new AudioContext({ sampleRate: 16000 });
      audioContextRef.current = audioCtx;

      const source = audioCtx.createMediaStreamSource(stream);
      const processor = audioCtx.createScriptProcessor(2048, 1, 1);
      processorRef.current = processor;

      processor.onaudioprocess = (e) => {
        if (ws.readyState !== WebSocket.OPEN) return;
        const float32 = e.inputBuffer.getChannelData(0);
        const pcm16 = float32ToPcm16(float32);
        ws.send(pcm16);
      };

      const silentGain = audioCtx.createGain();
      silentGain.gain.value = 0;
      source.connect(processor);
      processor.connect(silentGain);
      silentGain.connect(audioCtx.destination);

      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      analyserRef.current = analyser;
      source.connect(analyser);

      const vizData = new Uint8Array(analyser.frequencyBinCount);
      const vizLoop = () => {
        analyser.getByteFrequencyData(vizData);
        const avg = vizData.reduce((a, b) => a + b, 0) / vizData.length;
        setMicLevel(avg / 128);
        vizFrameRef.current = requestAnimationFrame(vizLoop);
      };
      vizLoop();
    },
    [flushUtterance, interviewId, onError, onPartial, transition]
  );

  const start = useCallback(async () => {
    try {
      const data = await api.get<{ token: string | null }>(DEEPGRAM_KEY_PATH);
      const token = data?.token?.trim() || null;

      if (token) {
        setSttMode("deepgram");
        await startDeepgram(token);
      } else {
        setSttMode("browser");
        await startBrowserRecognition();
      }
    } catch (e) {
      const SR = getSpeechRecognition();
      if (SR) {
        setSttMode("browser");
        try {
          await startBrowserRecognition();
        } catch (err) {
          onError(`Microphone error: ${String(err)}`);
        }
      } else {
        onError(
          `Voice unavailable: ${String(e)}. Add DEEPGRAM_API_KEY on the server or use Chrome/Edge for browser speech.`
        );
      }
    }
  }, [onError, startBrowserRecognition, startDeepgram]);

  const stop = useCallback(() => {
    if (flushTimerRef.current) clearTimeout(flushTimerRef.current);
    if (vizFrameRef.current != null) cancelAnimationFrame(vizFrameRef.current);
    vizFrameRef.current = null;

    wsRef.current?.close();
    wsRef.current = null;

    stopBrowserRecognition();

    processorRef.current?.disconnect();
    processorRef.current = null;
    mediaStreamRef.current?.getTracks().forEach((t) => t.stop());
    mediaStreamRef.current = null;
    void audioContextRef.current?.close();
    audioContextRef.current = null;
    analyserRef.current = null;

    utteranceBufferRef.current = [];
    setSttMode("idle");
    transition("idle");
  }, [stopBrowserRecognition, transition]);

  const setAbortController = useCallback((ac: AbortController | null) => {
    currentAbortRef.current = ac;
  }, []);

  useEffect(() => {
    return () => stop();
  }, [stop]);

  return { floor, micLevel, start, stop, transition, setAbortController, sttMode };
}

function float32ToPcm16(float32: Float32Array): ArrayBuffer {
  const buf = new ArrayBuffer(float32.length * 2);
  const view = new DataView(buf);
  for (let i = 0; i < float32.length; i++) {
    const c = Math.max(-1, Math.min(1, float32[i] ?? 0));
    view.setInt16(i * 2, Math.round(c * 0x7fff), true);
  }
  return buf;
}
