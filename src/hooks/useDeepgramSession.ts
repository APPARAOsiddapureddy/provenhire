import { useRef, useState, useCallback, useEffect, type MutableRefObject } from "react";
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

/** Mic + AudioContext + processors only (WebSocket closed separately). */
function releaseMediaAndAudio(args: {
  flushTimerRef: MutableRefObject<ReturnType<typeof setTimeout> | null>;
  vizFrameRef: MutableRefObject<number | null>;
  mediaStreamRef: MutableRefObject<MediaStream | null>;
  micStreamOwnedRef: MutableRefObject<boolean>;
  audioContextRef: MutableRefObject<AudioContext | null>;
  analyserRef: MutableRefObject<AnalyserNode | null>;
  workletNodeRef: MutableRefObject<AudioWorkletNode | null>;
  processorRef: MutableRefObject<ScriptProcessorNode | null>;
  utteranceBufferRef: MutableRefObject<string[]>;
}) {
  if (args.flushTimerRef.current) clearTimeout(args.flushTimerRef.current);
  args.flushTimerRef.current = null;
  if (args.vizFrameRef.current != null) cancelAnimationFrame(args.vizFrameRef.current);
  args.vizFrameRef.current = null;

  args.workletNodeRef.current?.disconnect();
  args.workletNodeRef.current = null;
  args.processorRef.current?.disconnect();
  args.processorRef.current = null;
  if (args.micStreamOwnedRef.current) {
    args.mediaStreamRef.current?.getTracks().forEach((t) => t.stop());
  }
  args.mediaStreamRef.current = null;
  args.micStreamOwnedRef.current = true;
  void args.audioContextRef.current?.close();
  args.audioContextRef.current = null;
  args.analyserRef.current = null;
  args.utteranceBufferRef.current = [];
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
  /** When using parent-provided camera+mic stream, do not stop its tracks on release. */
  const micStreamOwnedRef = useRef(true);
  const sharedSessionStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const workletNodeRef = useRef<AudioWorkletNode | null>(null);
  const utteranceBufferRef = useRef<string[]>([]);
  const flushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const vizFrameRef = useRef<number | null>(null);
  const currentAbortRef = useRef<AbortController | null>(null);
  const intentionalWsCloseRef = useRef(false);

  const recognitionRef = useRef<InstanceType<NonNullable<ReturnType<typeof getSpeechRecognition>>> | null>(null);
  const browserStoppedRef = useRef(false);
  const latestTranscriptRef = useRef("");
  const browserAudioCtxRef = useRef<AudioContext | null>(null);
  const browserAnalyserRef = useRef<AnalyserNode | null>(null);
  const deepgramFallbackStartedRef = useRef(false);

  /** Mirrors `floor` for capture callbacks (worklet/ScriptProcessor run outside React render). */
  const floorRef = useRef<FloorState>("idle");
  /** When true, browser SpeechRecognition must not transcribe or auto-restart (AI/filler is playing). */
  const listeningPausedRef = useRef(false);
  const sttModeRef = useRef<InterviewSttMode>("idle");

  useEffect(() => {
    sttModeRef.current = sttMode;
  }, [sttMode]);

  const transition = useCallback((next: FloorState) => {
    floorRef.current = next;
    const listenOn = next === "user_speaking";
    listeningPausedRef.current = !listenOn;

    if (sttModeRef.current === "browser" && recognitionRef.current) {
      if (!listenOn) {
        try {
          recognitionRef.current.stop();
        } catch {
          /* noop */
        }
      } else {
        try {
          recognitionRef.current.start();
        } catch {
          /* may already be running */
        }
      }
    }

    setFloor(next);
  }, []);

  const flushUtterance = useCallback(() => {
    const text = utteranceBufferRef.current.join(" ").trim();
    utteranceBufferRef.current = [];
    if (text) {
      onFinal(text);
    }
  }, [onFinal]);

  const releaseDeepgramMedia = useCallback(() => {
    releaseMediaAndAudio({
      flushTimerRef,
      vizFrameRef,
      mediaStreamRef,
      micStreamOwnedRef,
      audioContextRef,
      analyserRef,
      workletNodeRef,
      processorRef,
      utteranceBufferRef,
    });
  }, []);

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
    void browserAudioCtxRef.current?.close();
    browserAudioCtxRef.current = null;
    browserAnalyserRef.current = null;
  }, []);

  const startBrowserRecognition = useCallback(async () => {
    const SR = getSpeechRecognition();
    if (!SR) {
      onError("Speech recognition is not supported in this browser. Try Chrome or Edge, or set DEEPGRAM_API_KEY on the server.");
      return;
    }

    const preferred = sharedSessionStreamRef.current;
    let stream: MediaStream;
    if (preferred && preferred.getAudioTracks().length > 0) {
      stream = preferred;
      micStreamOwnedRef.current = false;
    } else {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      micStreamOwnedRef.current = true;
    }
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
      if (listeningPausedRef.current) return;
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
      if (listeningPausedRef.current) {
        return;
      }
      const stopped = browserStoppedRef.current;
      const t = latestTranscriptRef.current.trim();
      latestTranscriptRef.current = "";
      if (!stopped && t) {
        onFinal(t);
      }
      if (!browserStoppedRef.current && recognitionRef.current && floorRef.current === "user_speaking") {
        try {
          rec.start();
        } catch {
          /* may throw if already started */
        }
      }
    };

    transition("user_speaking");
  }, [interviewId, onError, onFinal, onPartial, transition]);

  const startDeepgram = useCallback(
    async (token: string, auth: "bearer" | "token") => {
      deepgramFallbackStartedRef.current = false;

      const preferred = sharedSessionStreamRef.current;
      let stream: MediaStream;
      if (preferred && preferred.getAudioTracks().length > 0) {
        stream = preferred;
        micStreamOwnedRef.current = false;
      } else {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        micStreamOwnedRef.current = true;
      }
      mediaStreamRef.current = stream;

      // Prefer 16 kHz; browsers often ignore hint and use 44.1/48 kHz — Deepgram must get the *actual* rate.
      const audioCtx = new AudioContext({ sampleRate: 16_000 });
      audioContextRef.current = audioCtx;
      await audioCtx.resume().catch(() => {});

      const sampleRate = Math.round(audioCtx.sampleRate);
      const qs = new URLSearchParams({
        model: "nova-3",
        language: "en",
        encoding: "linear16",
        sample_rate: String(sampleRate),
        channels: "1",
        interim_results: "true",
        vad_events: "true",
        endpointing: "1200",
        utterance_end_ms: "2500",
      });
      const wsUrl = `wss://api.deepgram.com/v1/listen?${qs.toString()}`;
      const protocolAttempts: string[][] =
        auth === "bearer"
          ? [
              ["bearer", token],
              ["token", token],
            ]
          : [["token", token]];

      let ws: WebSocket | null = null;
      let connectErr: Error | null = null;

      for (const protocols of protocolAttempts) {
        const attempt = new WebSocket(wsUrl, protocols);
        wsRef.current = attempt;
        try {
          await waitForWebSocketOpen(attempt, 15_000);
          ws = attempt;
          connectErr = null;
          break;
        } catch (e) {
          connectErr = e instanceof Error ? e : new Error(String(e));
          intentionalWsCloseRef.current = true;
          attempt.close();
          wsRef.current = null;
        }
      }

      if (!ws) {
        releaseDeepgramMedia();
        throw connectErr ?? new Error("Deepgram WebSocket failed to open");
      }

      // If React re-ran an effect cleanup (e.g. interviewId changed stop()), context may already be closed.
      if (audioCtx.state === "closed") {
        intentionalWsCloseRef.current = true;
        ws.close();
        wsRef.current = null;
        throw new Error("AudioContext closed unexpectedly — try starting the interview again.");
      }
      await audioCtx.resume().catch(() => {});

      transition("user_speaking");

      ws.onmessage = (event: MessageEvent) => {
        let data: Record<string, unknown>;
        try {
          data = JSON.parse(event.data as string) as Record<string, unknown>;
        } catch {
          return;
        }

        const type = data.type as string | undefined;
        if (type === "Error") {
          const msg =
            (typeof data.err_msg === "string" && data.err_msg) ||
            (typeof data.message === "string" && data.message) ||
            "Deepgram stream error";
          onError(msg);
          return;
        }
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

      ws.onerror = () => {
        if (!intentionalWsCloseRef.current) {
          onError("Deepgram connection error — check API key / project permissions.");
        }
      };

      ws.onclose = (ev) => {
        if (intentionalWsCloseRef.current) {
          intentionalWsCloseRef.current = false;
          return;
        }
        wsRef.current = null;
        releaseDeepgramMedia();
        const reason = ev.reason?.trim();
        const msg = `Deepgram disconnected (${ev.code}${reason ? `: ${reason}` : ""}).`;
        if (!deepgramFallbackStartedRef.current) {
          deepgramFallbackStartedRef.current = true;
          sttModeRef.current = "browser";
          setSttMode("browser");
          onError(`${msg} Switching to browser speech…`);
          void startBrowserRecognition().catch((err) => onError(`Could not start browser speech: ${String(err)}`));
        } else {
          transition("idle");
        }
      };

      try {
      if (audioCtx.state === "closed") {
        throw new Error("AudioContext is closed");
      }

      const source = audioCtx.createMediaStreamSource(stream);

      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      analyserRef.current = analyser;
      source.connect(analyser);

      const vizData = new Uint8Array(analyser.frequencyBinCount);
      const vizLoop = () => {
        if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
        if (floorRef.current !== "user_speaking") {
          setMicLevel(0);
        } else {
          analyser.getByteFrequencyData(vizData);
          const avg = vizData.reduce((a, b) => a + b, 0) / vizData.length;
          setMicLevel(avg / 128);
        }
        vizFrameRef.current = requestAnimationFrame(vizLoop);
      };
      vizLoop();

      const silentGain = audioCtx.createGain();
      silentGain.gain.value = 0;

      let usedWorklet = false;
      if (audioCtx.state !== "closed") {
        try {
          const base = import.meta.env.BASE_URL || "/";
          const workletUrl =
            typeof window !== "undefined"
              ? new URL("deepgram-capture.worklet.js", new URL(base, window.location.origin).href).href
              : `${base.replace(/\/?$/, "/")}deepgram-capture.worklet.js`;
          await audioCtx.audioWorklet.addModule(workletUrl);
          const node = new AudioWorkletNode(audioCtx, "deepgram-capture-processor");
          workletNodeRef.current = node;
          node.port.onmessage = (e: MessageEvent<Float32Array>) => {
            if (ws.readyState !== WebSocket.OPEN) return;
            const float32 = e.data;
            if (!(float32 instanceof Float32Array) || float32.length === 0) return;
            ws.send(float32ToPcm16(float32));
          };
          source.connect(node);
          node.connect(silentGain);
          usedWorklet = true;
        } catch {
          /* AudioWorklet unsupported or module load failed */
        }
      }

      if (!usedWorklet && audioCtx.state !== "closed") {
        const processor = audioCtx.createScriptProcessor(2048, 1, 1);
        processorRef.current = processor;
        processor.onaudioprocess = (e) => {
          if (ws.readyState !== WebSocket.OPEN) return;
          if (floorRef.current !== "user_speaking") return;
          const float32 = e.inputBuffer.getChannelData(0);
          ws.send(float32ToPcm16(float32));
        };
        source.connect(processor);
        processor.connect(silentGain);
      } else if (!usedWorklet) {
        throw new Error("Audio capture unavailable (audio context closed)");
      }

      silentGain.connect(audioCtx.destination);
      } catch (pipeErr) {
        intentionalWsCloseRef.current = true;
        ws.close();
        wsRef.current = null;
        releaseDeepgramMedia();
        throw pipeErr;
      }
    },
    [flushUtterance, interviewId, onError, onPartial, releaseDeepgramMedia, startBrowserRecognition, transition]
  );

  const stop = useCallback(() => {
    if (flushTimerRef.current) clearTimeout(flushTimerRef.current);
    flushTimerRef.current = null;
    if (vizFrameRef.current != null) cancelAnimationFrame(vizFrameRef.current);
    vizFrameRef.current = null;

    const ws = wsRef.current;
    if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
      intentionalWsCloseRef.current = true;
      ws.close();
    }
    wsRef.current = null;

    stopBrowserRecognition();
    releaseDeepgramMedia();
    sharedSessionStreamRef.current = null;

    utteranceBufferRef.current = [];
    sttModeRef.current = "idle";
    setSttMode("idle");
    transition("idle");
  }, [releaseDeepgramMedia, stopBrowserRecognition, transition]);

  const start = useCallback(async (opts?: { sharedMediaStream?: MediaStream | null }) => {
    stop();
    sharedSessionStreamRef.current = opts?.sharedMediaStream ?? null;
    deepgramFallbackStartedRef.current = false;
    try {
      const data = await api.get<{ token: string | null; auth?: "bearer" | "token" | null }>(DEEPGRAM_KEY_PATH);
      const token = data?.token?.trim() || null;
      const auth: "bearer" | "token" = data?.auth === "bearer" ? "bearer" : "token";

      if (token) {
        sttModeRef.current = "deepgram";
        setSttMode("deepgram");
        try {
          await startDeepgram(token, auth);
        } catch (e) {
          sttModeRef.current = "browser";
          setSttMode("browser");
          onError(`Deepgram: ${String(e)}. Using browser speech.`);
          await startBrowserRecognition();
        }
      } else {
        sttModeRef.current = "browser";
        setSttMode("browser");
        await startBrowserRecognition();
      }
    } catch (e) {
      const SR = getSpeechRecognition();
      if (SR) {
        sttModeRef.current = "browser";
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
  }, [onError, startBrowserRecognition, startDeepgram, stop]);

  const setAbortController = useCallback((ac: AbortController | null) => {
    currentAbortRef.current = ac;
  }, []);

  /** Must only run on real unmount. If `[stop]` were a dependency, cleanup would run whenever `interviewId` changes (via `stopBrowserRecognition` → `stop`) and would tear down the AudioContext while `startDeepgram` is still running. */
  const stopOnUnmountRef = useRef(stop);
  stopOnUnmountRef.current = stop;
  useEffect(() => {
    return () => {
      stopOnUnmountRef.current();
    };
  }, []);

  return { floor, micLevel, start, stop, transition, setAbortController, sttMode };
}

function waitForWebSocketOpen(ws: WebSocket, ms: number): Promise<void> {
  return new Promise((resolve, reject) => {
    if (ws.readyState === WebSocket.OPEN) {
      resolve();
      return;
    }
    const timer = window.setTimeout(() => {
      ws.removeEventListener("open", onOpen);
      ws.removeEventListener("error", onErr);
      reject(new Error("connect timeout"));
    }, ms);
    const onOpen = () => {
      window.clearTimeout(timer);
      ws.removeEventListener("error", onErr);
      resolve();
    };
    const onErr = () => {
      window.clearTimeout(timer);
      ws.removeEventListener("open", onOpen);
      reject(new Error("WebSocket error"));
    };
    ws.addEventListener("open", onOpen, { once: true });
    ws.addEventListener("error", onErr, { once: true });
  });
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
