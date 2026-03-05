import { useEffect, useRef, useCallback } from "react";

interface UseSoundDetectionOptions {
  /** RMS volume threshold - louder sounds trigger callback (default 35, typical speech ~15-25, loud ~40+) */
  threshold?: number;
  /** Debounce ms - minimum time between detections (default 3000) */
  debounceMs?: number;
  /** Called when loud sound detected */
  onSoundDetected?: () => void;
  /** Whether detection is active */
  enabled?: boolean;
}

/**
 * Monitors microphone for loud sounds and triggers callback. Uses Web Audio API.
 */
export function useSoundDetection({
  threshold = 35,
  debounceMs = 3000,
  onSoundDetected,
  enabled = true,
}: UseSoundDetectionOptions = {}) {
  const streamRef = useRef<MediaStream | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const lastDetectedRef = useRef<number>(0);
  const animationRef = useRef<number>(0);
  const audioContextRef = useRef<AudioContext | null>(null);

  const handleDetected = useCallback(() => {
    if (!onSoundDetected) return;
    const now = Date.now();
    if (now - lastDetectedRef.current < debounceMs) return;
    lastDetectedRef.current = now;
    onSoundDetected();
  }, [onSoundDetected, debounceMs]);

  useEffect(() => {
    if (!enabled || !onSoundDetected) return;

    let cancelled = false;
    const init = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;

        const audioContext = new AudioContext();
        audioContextRef.current = audioContext;
        if (audioContext.state === "suspended") {
          try {
            await audioContext.resume();
          } catch {
            // Resume may require user gesture in some browsers; continue anyway
          }
        }
        if (cancelled) return;

        const source = audioContext.createMediaStreamSource(stream);
        const analyser = audioContext.createAnalyser();
        analyser.fftSize = 256;
        analyser.smoothingTimeConstant = 0.7;
        source.connect(analyser);
        analyserRef.current = analyser;

        const dataArray = new Uint8Array(analyser.fftSize);

        const checkVolume = () => {
          if (cancelled || !analyserRef.current) return;
          analyser.getByteTimeDomainData(dataArray);
          let sum = 0;
          for (let i = 0; i < dataArray.length; i++) {
            const v = dataArray[i] - 128;
            sum += v * v;
          }
          const rms = Math.sqrt(sum / dataArray.length);
          if (rms > threshold) {
            handleDetected();
          }
          animationRef.current = requestAnimationFrame(checkVolume);
        };
        checkVolume();
      } catch (e) {
        console.warn("[useSoundDetection] Mic access denied or unavailable", e);
      }
    };
    init();

    return () => {
      cancelled = true;
      cancelAnimationFrame(animationRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      analyserRef.current = null;
      const ctx = audioContextRef.current;
      audioContextRef.current = null;
      if (ctx?.state !== "closed") {
        ctx?.close().catch(() => {});
      }
    };
  }, [enabled, threshold, onSoundDetected, handleDetected]);

  return { isActive: enabled };
}
