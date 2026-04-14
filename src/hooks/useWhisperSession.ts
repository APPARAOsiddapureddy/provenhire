import { useRef, useState, useCallback, useEffect, useLayoutEffect } from "react";
import { getAuthToken } from "@/lib/api";

export type FloorState = "idle" | "user_speaking" | "ai_thinking" | "ai_speaking";

/** UI label for voice session badge (Expert Interview). */
export type InterviewSttMode = "whisper" | "idle";

/**
 * VAD threshold in RMS units (0..1). This must be low enough to detect quieter mics/laptops.
 * We also adapt it per-recording using a short noise-floor sample.
 */
const BASE_SILENCE_THRESHOLD = 0.006;
/** End-of-utterance: wait this long after speech stops before sending audio to Whisper (product default 2s). */
const SILENCE_DURATION_MS = 2000;
// Hard cap so we always flush some audio even if VAD never detects "speaking" on a quiet mic.
const MAX_RECORDING_MS = 20_000;
// Additional safety: force a flush periodically even without an RMS threshold crossing.
const FORCE_FLUSH_MS = 10_000;
const MIN_SPEECH_MS = 300;

export function useWhisperSession({
  interviewId: _interviewId,
  onFinal,
  onPartial,
  onError,
  onBargeInTranscript,
}: {
  interviewId: string | null;
  onFinal: (text: string, meta?: { whisperLatencyMs: number }) => void;
  onPartial: (text: string) => void;
  onError: (err: string) => void;
  /** When set, segmented STT during `ai_speaking` with text length > 8 routes here (barge-in) instead of `onFinal`. */
  onBargeInTranscript?: (text: string, meta: { whisperLatencyMs: number }) => void;
}) {
  const [floor, setFloor] = useState<FloorState>("idle");
  const [micLevel, setMicLevel] = useState(0);
  const [sttMode, setSttMode] = useState<InterviewSttMode>("idle");

  const mediaStreamRef = useRef<MediaStream | null>(null);
  /** When true, `mediaStreamRef` is owned by the parent (e.g. camera+mic) — do not stop its tracks on teardown. */
  const sharedStreamRef = useRef(false);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const maxRecordingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const forceFlushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const vizFrameRef = useRef<number | null>(null);
  const vadFrameRef = useRef<number | null>(null);
  const currentAbortRef = useRef<AbortController | null>(null);
  const isSpeakingRef = useRef(false);
  const recordingStartRef = useRef(0);
  const floorRef = useRef<FloorState>("idle");
  const isTranscribingRef = useRef(false);
  const captureEnabledRef = useRef(true);
  const vadThresholdRef = useRef<number>(BASE_SILENCE_THRESHOLD);
  const vadCalibratedRef = useRef(false);
  const pendingDiscardRef = useRef(false);
  const startRecordingFnRef = useRef<() => void>(() => {});
  const onBargeInRef = useRef(onBargeInTranscript);
  onBargeInRef.current = onBargeInTranscript;

  const transition = useCallback((next: FloorState) => {
    floorRef.current = next;
    setFloor(next);
  }, []);

  const getRMS = useCallback((): number => {
    const analyser = analyserRef.current;
    if (!analyser) return 0;
    const data = new Float32Array(analyser.fftSize);
    analyser.getFloatTimeDomainData(data);
    let sum = 0;
    for (let i = 0; i < data.length; i++) sum += data[i] * data[i];
    return Math.sqrt(sum / data.length);
  }, []);

  const clearRecordingTimers = useCallback(() => {
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
    if (maxRecordingTimerRef.current) {
      clearTimeout(maxRecordingTimerRef.current);
      maxRecordingTimerRef.current = null;
    }
    if (forceFlushTimerRef.current) {
      clearTimeout(forceFlushTimerRef.current);
      forceFlushTimerRef.current = null;
    }
    if (vadFrameRef.current != null) {
      cancelAnimationFrame(vadFrameRef.current);
      vadFrameRef.current = null;
    }
  }, []);

  const stopAndTranscribe = useCallback(async () => {
    const rec = mediaRecorderRef.current;
    if (!rec || rec.state === "inactive" || isTranscribingRef.current) return;

    isTranscribingRef.current = true;
    clearRecordingTimers();

    const discard = pendingDiscardRef.current;
    pendingDiscardRef.current = false;

    rec.stop();

    await new Promise<void>((resolve) => {
      rec.onstop = () => resolve();
    });

    mediaRecorderRef.current = null;

    if (discard) {
      audioChunksRef.current = [];
      isTranscribingRef.current = false;
      if (captureEnabledRef.current && floorRef.current === "user_speaking") {
        startRecordingFnRef.current();
      }
      return;
    }

    const duration = Date.now() - recordingStartRef.current;
    if (duration < MIN_SPEECH_MS || audioChunksRef.current.length === 0) {
      audioChunksRef.current = [];
      isTranscribingRef.current = false;
      if (captureEnabledRef.current && floorRef.current === "user_speaking") {
        startRecordingFnRef.current();
      }
      return;
    }

    const mime = rec.mimeType || "audio/webm";
    const audioBlob = new Blob(audioChunksRef.current, { type: mime });
    audioChunksRef.current = [];

    const bargeFloor = floorRef.current === "ai_speaking" && Boolean(onBargeInRef.current);
    if (!bargeFloor) transition("ai_thinking");

    const whisperStartedAt = Date.now();
    try {
      const formData = new FormData();
      formData.append("audio", audioBlob, "answer.webm");

      const token = getAuthToken();
      const res = await fetch("/api/interview/transcribe", {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        body: formData,
        signal: currentAbortRef.current?.signal,
      });

      if (!res.ok) {
        const raw = await res.text();
        let msg = `HTTP ${res.status}`;
        try {
          const body = JSON.parse(raw) as { message?: string; error?: string };
          msg = body.message || body.error || msg;
        } catch {
          const snippet = raw.replace(/\s+/g, " ").trim().slice(0, 180);
          if (snippet) msg = `${msg}${snippet ? ` — ${snippet}` : ""}`;
        }
        throw new Error(msg);
      }

      const data = (await res.json()) as {
        transcript: string;
        confidence: string;
        empty: boolean;
      };

      onPartial("");
      isTranscribingRef.current = false;

      const whisperLatencyMs = Date.now() - whisperStartedAt;
      const t = data.transcript.trim();
      if (
        bargeFloor &&
        onBargeInRef.current &&
        !data.empty &&
        t.length > 8
      ) {
        transition("user_speaking");
        onBargeInRef.current(t, { whisperLatencyMs });
        if (captureEnabledRef.current && floorRef.current === "user_speaking") {
          startRecordingFnRef.current();
        }
        return;
      }

      transition("user_speaking");
      if (!data.empty && t) {
        onFinal(t, { whisperLatencyMs });
      }
      if (captureEnabledRef.current && floorRef.current === "user_speaking") {
        startRecordingFnRef.current();
      }
    } catch (e) {
      onPartial("");
      isTranscribingRef.current = false;
      onError(`Transcription failed: ${e instanceof Error ? e.message : "unknown"}`);
      transition("user_speaking");
      if (captureEnabledRef.current) {
        startRecordingFnRef.current();
      }
    }
  }, [onFinal, onPartial, onError, transition, clearRecordingTimers]);

  const startRecording = useCallback(() => {
    const stream = mediaStreamRef.current;
    if (!stream || isTranscribingRef.current || !captureEnabledRef.current) return;
    const allowBarge = floorRef.current === "ai_speaking" && Boolean(onBargeInRef.current);
    if (floorRef.current !== "user_speaking" && !allowBarge) return;
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") return;

    const audioTracks = stream.getAudioTracks();
    if (audioTracks.length === 0) return;

    const recordStream = new MediaStream(audioTracks);
    const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
      ? "audio/webm;codecs=opus"
      : MediaRecorder.isTypeSupported("audio/webm")
        ? "audio/webm"
        : "";

    const recorder = mimeType
      ? new MediaRecorder(recordStream, { mimeType })
      : new MediaRecorder(recordStream);

    audioChunksRef.current = [];
    recordingStartRef.current = Date.now();
    isSpeakingRef.current = false;
    vadThresholdRef.current = BASE_SILENCE_THRESHOLD;
    vadCalibratedRef.current = false;

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) audioChunksRef.current.push(e.data);
    };

    recorder.start(100);
    mediaRecorderRef.current = recorder;

    maxRecordingTimerRef.current = setTimeout(() => {
      void stopAndTranscribe();
    }, MAX_RECORDING_MS);

    forceFlushTimerRef.current = setTimeout(() => {
      // If we captured any chunks but VAD never detected speech, still send something to STT.
      if (mediaRecorderRef.current && audioChunksRef.current.length > 0 && !isTranscribingRef.current) {
        void stopAndTranscribe();
      }
    }, FORCE_FLUSH_MS);

    // Calibrate a per-recording threshold based on ambient noise floor (first ~350ms).
    // This improves voice detection on quiet mics and avoids "never detects speaking".
    const calibrateStart = Date.now();
    let noiseSum = 0;
    let noiseN = 0;

    const vadLoop = () => {
      const barge = floorRef.current === "ai_speaking" && Boolean(onBargeInRef.current);
      if (!mediaRecorderRef.current) return;
      if (floorRef.current !== "user_speaking" && !barge) return;

      const rms = getRMS();
      if (!vadCalibratedRef.current) {
        const dt = Date.now() - calibrateStart;
        // Sample only when we are likely still silent (before first detected speaking).
        if (!isSpeakingRef.current && dt < 350) {
          noiseSum += rms;
          noiseN += 1;
        } else {
          const noiseAvg = noiseN > 0 ? noiseSum / noiseN : 0;
          // Threshold: at least BASE, otherwise 3x noise floor.
          vadThresholdRef.current = Math.max(BASE_SILENCE_THRESHOLD, noiseAvg * 3);
          vadCalibratedRef.current = true;
        }
      }

      const speaking = rms > vadThresholdRef.current;

      if (speaking) {
        isSpeakingRef.current = true;
        if (silenceTimerRef.current) {
          clearTimeout(silenceTimerRef.current);
          silenceTimerRef.current = null;
        }
      } else if (isSpeakingRef.current && !silenceTimerRef.current) {
        silenceTimerRef.current = setTimeout(() => {
          void stopAndTranscribe();
        }, SILENCE_DURATION_MS);
      }

      vadFrameRef.current = requestAnimationFrame(vadLoop);
    };
    vadFrameRef.current = requestAnimationFrame(vadLoop);
  }, [getRMS, stopAndTranscribe]);

  useLayoutEffect(() => {
    startRecordingFnRef.current = startRecording;
  });

  const stop = useCallback(() => {
    clearRecordingTimers();
    if (vizFrameRef.current != null) {
      cancelAnimationFrame(vizFrameRef.current);
      vizFrameRef.current = null;
    }

    const rec = mediaRecorderRef.current;
    if (rec && rec.state !== "inactive") {
      try {
        rec.stop();
      } catch {
        /* ignore */
      }
    }
    mediaRecorderRef.current = null;
    audioChunksRef.current = [];

    if (!sharedStreamRef.current) {
      mediaStreamRef.current?.getTracks().forEach((t) => t.stop());
    }
    mediaStreamRef.current = null;
    sharedStreamRef.current = false;

    void audioContextRef.current?.close().catch(() => {});
    audioContextRef.current = null;
    analyserRef.current = null;

    isTranscribingRef.current = false;
    setSttMode("idle");
    setMicLevel(0);
    transition("idle");
  }, [clearRecordingTimers, transition]);

  const start = useCallback(
    async (opts?: { sharedMediaStream?: MediaStream | null; deferMicCapture?: boolean }) => {
      stop();

      let stream: MediaStream;
      if (opts?.sharedMediaStream && opts.sharedMediaStream.getAudioTracks().length > 0) {
        stream = opts.sharedMediaStream;
        sharedStreamRef.current = true;
      } else {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true },
          video: false,
        });
        sharedStreamRef.current = false;
      }

      mediaStreamRef.current = stream;

      const audioCtx = new AudioContext();
      await audioCtx.resume().catch(() => {});
      audioContextRef.current = audioCtx;

      const srcStream =
        stream.getAudioTracks().length > 0 ? new MediaStream(stream.getAudioTracks()) : stream;
      const source = audioCtx.createMediaStreamSource(srcStream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 2048;
      source.connect(analyser);
      analyserRef.current = analyser;

      const vizData = new Uint8Array(analyser.frequencyBinCount);
      const vizLoop = () => {
        const a = analyserRef.current;
        if (!a) return;
        a.getByteFrequencyData(vizData);
        const avg = vizData.reduce((acc, b) => acc + b, 0) / vizData.length;
        setMicLevel(avg / 128);
        vizFrameRef.current = requestAnimationFrame(vizLoop);
      };
      vizFrameRef.current = requestAnimationFrame(vizLoop);

      setSttMode("whisper");
      if (opts?.deferMicCapture) {
        captureEnabledRef.current = false;
        transition("ai_thinking");
      } else {
        captureEnabledRef.current = true;
        transition("user_speaking");
        startRecordingFnRef.current();
      }
    },
    [stop, transition],
  );

  const setCaptureEnabled = useCallback(
    (enabled: boolean) => {
      captureEnabledRef.current = enabled;
      if (!enabled) {
        clearRecordingTimers();
        pendingDiscardRef.current = true;
        const rec = mediaRecorderRef.current;
        if (rec && rec.state !== "inactive") {
          rec.onstop = () => {
            pendingDiscardRef.current = false;
          };
          try {
            rec.stop();
          } catch {
            pendingDiscardRef.current = false;
          }
        } else {
          pendingDiscardRef.current = false;
        }
        mediaRecorderRef.current = null;
        audioChunksRef.current = [];
        isTranscribingRef.current = false;
      } else if (
        (floorRef.current === "user_speaking" || (floorRef.current === "ai_speaking" && Boolean(onBargeInRef.current))) &&
        !isTranscribingRef.current &&
        mediaStreamRef.current
      ) {
        startRecordingFnRef.current();
      }
    },
    [clearRecordingTimers],
  );

  const setAbortController = useCallback((ac: AbortController | null) => {
    currentAbortRef.current = ac;
  }, []);

  const resumeListening = useCallback(() => {
    if (isTranscribingRef.current) return;
    transition("user_speaking");
    captureEnabledRef.current = true;
    startRecordingFnRef.current();
  }, [transition]);

  /** Start mic + VAD while floor is `ai_speaking` so barge-in transcription can run (Expert TTS question phase). */
  const beginBargeWhileAiSpeaking = useCallback(() => {
    if (isTranscribingRef.current) return;
    captureEnabledRef.current = true;
    transition("ai_speaking");
    if (mediaStreamRef.current) {
      startRecordingFnRef.current();
    }
  }, [transition]);

  useEffect(() => {
    return () => {
      stop();
    };
  }, [stop]);

  return {
    floor,
    micLevel,
    sttMode,
    start,
    stop,
    transition,
    setAbortController,
    setCaptureEnabled,
    resumeListening,
    beginBargeWhileAiSpeaking,
  };
}
