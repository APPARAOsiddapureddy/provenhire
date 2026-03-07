import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { detectFaces, loadFaceDetectionModels } from "@/utils/faceDetection";

export type ProctoringEventCode =
  | "NO_FACE_DETECTED"
  | "MULTIPLE_FACES_DETECTED"
  | "LOOKING_AWAY_FROM_SCREEN"
  | "PHONE_DETECTED"
  | "LOW_VISIBILITY"
  | "MULTIPLE_VOICES_DETECTED"
  | "CANDIDATE_SPEAKING_DURING_CODING"
  | "SUSPICIOUS_BACKGROUND_NOISE"
  | "MICROPHONE_MUTED_ATTEMPT"
  | "TAB_SWITCH"
  | "WINDOW_FOCUS_LOST"
  | "WINDOW_MINIMIZED"
  | "FULLSCREEN_EXIT"
  | "COPY_PASTE_ATTEMPT"
  | "DEVTOOLS_OPENED";

type RiskLevel = "clean" | "suspicious" | "high_risk";

export interface ProctoringEventLog {
  candidate_id: string;
  test_id: string;
  event: ProctoringEventCode;
  timestamp: string;
  risk_score: number;
  details?: Record<string, unknown>;
}

interface UseProctoringRiskMonitorOptions {
  enabled: boolean;
  candidateId?: string;
  testId: string;
  testType: "aptitude" | "dsa" | "ai_interview";
  cameraStream?: MediaStream | null;
  microphoneStream?: MediaStream | null;
}

const EVENT_RISK_WEIGHTS: Record<ProctoringEventCode, number> = {
  NO_FACE_DETECTED: 10,
  MULTIPLE_FACES_DETECTED: 25,
  LOOKING_AWAY_FROM_SCREEN: 5,
  PHONE_DETECTED: 30,
  TAB_SWITCH: 10,
  WINDOW_FOCUS_LOST: 5,
  WINDOW_MINIMIZED: 5,
  FULLSCREEN_EXIT: 8,
  COPY_PASTE_ATTEMPT: 10,
  DEVTOOLS_OPENED: 20,
  MULTIPLE_VOICES_DETECTED: 10,
  CANDIDATE_SPEAKING_DURING_CODING: 10,
  SUSPICIOUS_BACKGROUND_NOISE: 10,
  MICROPHONE_MUTED_ATTEMPT: 15,
  LOW_VISIBILITY: 8,
};

const EVENT_COOLDOWN_MS: Partial<Record<ProctoringEventCode, number>> = {
  NO_FACE_DETECTED: 12000,
  LOOKING_AWAY_FROM_SCREEN: 10000,
  LOW_VISIBILITY: 10000,
  SUSPICIOUS_BACKGROUND_NOISE: 8000,
  MULTIPLE_VOICES_DETECTED: 8000,
  TAB_SWITCH: 2000,
  WINDOW_FOCUS_LOST: 2000,
  WINDOW_MINIMIZED: 3000,
  FULLSCREEN_EXIT: 2000,
  COPY_PASTE_ATTEMPT: 2000,
  DEVTOOLS_OPENED: 5000,
};

function getRiskLevel(score: number): RiskLevel {
  if (score >= 50) return "high_risk";
  if (score >= 20) return "suspicious";
  return "clean";
}

function getSeverityFromScore(score: number): "low" | "medium" | "high" {
  if (score >= 50) return "high";
  if (score >= 20) return "medium";
  return "low";
}

export function useProctoringRiskMonitor({
  enabled,
  candidateId,
  testId,
  testType,
  cameraStream,
  microphoneStream,
}: UseProctoringRiskMonitorOptions) {
  const [riskScore, setRiskScore] = useState(0);
  const [events, setEvents] = useState<ProctoringEventLog[]>([]);
  const warningCountsRef = useRef<Record<string, number>>({});
  const lastEventTsRef = useRef<Partial<Record<ProctoringEventCode, number>>>({});
  const noFaceSinceRef = useRef<number | null>(null);
  const lookingAwaySinceRef = useRef<number | null>(null);
  const speakingSinceRef = useRef<number | null>(null);
  const devtoolsWarnedRef = useRef(false);

  const riskLevel = useMemo(() => getRiskLevel(riskScore), [riskScore]);

  const bumpWarningCounter = useCallback((key: string) => {
    warningCountsRef.current[key] = (warningCountsRef.current[key] ?? 0) + 1;
    return warningCountsRef.current[key];
  }, []);

  const shouldRateLimitEvent = useCallback((code: ProctoringEventCode) => {
    const now = Date.now();
    const prev = lastEventTsRef.current[code] ?? 0;
    const cooldown = EVENT_COOLDOWN_MS[code] ?? 0;
    if (now - prev < cooldown) return true;
    lastEventTsRef.current[code] = now;
    return false;
  }, []);

  const logViolation = useCallback(
    async (eventCode: ProctoringEventCode, details?: Record<string, unknown>) => {
      if (!candidateId || !testId || !enabled) return;
      if (shouldRateLimitEvent(eventCode)) return;

      const delta = EVENT_RISK_WEIGHTS[eventCode] ?? 0;
      const nextScore = riskScore + delta;
      const timestamp = new Date().toISOString();

      const eventLog: ProctoringEventLog = {
        candidate_id: candidateId,
        test_id: testId,
        event: eventCode,
        timestamp,
        risk_score: nextScore,
        details,
      };

      setRiskScore(nextScore);
      setEvents((prev) => [...prev, eventLog]);

      try {
        await api.post("/api/proctoring/alerts", {
          userId: candidateId,
          testId,
          testType,
          alertType: eventCode,
          severity: getSeverityFromScore(nextScore),
          message: eventCode,
          violationDetails: {
            ...details,
            timestamp,
            eventCode,
            riskScore: nextScore,
            riskLevel: getRiskLevel(nextScore),
          },
        });
      } catch {
        // Do not interrupt the test if alert logging fails.
      }
    },
    [candidateId, enabled, riskScore, shouldRateLimitEvent, testId, testType]
  );

  const warnFirstThenLog = useCallback(
    (warningKey: string, eventCode: ProctoringEventCode, message: string) => {
      const count = bumpWarningCounter(warningKey);
      if (count === 1) {
        toast.warning(message);
        return;
      }
      void logViolation(eventCode, { count });
    },
    [bumpWarningCounter, logViolation]
  );

  // Browser tab/window/fullscreen/devtools/copy-paste checks
  useEffect(() => {
    if (!enabled) return;

    // Where supported, flag multiple connected displays.
    const checkMultipleScreens = async () => {
      const maybeWindow = window as Window & {
        getScreenDetails?: () => Promise<{ screens?: Array<unknown> }>;
      };
      if (!maybeWindow.getScreenDetails) return;
      try {
        const details = await maybeWindow.getScreenDetails();
        const count = details?.screens?.length ?? 1;
        if (count > 1) {
          void logViolation("WINDOW_FOCUS_LOST", { reason: "multiple_screens_detected", screenCount: count });
        }
      } catch {
        // Ignore permission/API support issues.
      }
    };
    void checkMultipleScreens();

    const onVisibility = () => {
      if (document.hidden) {
        warnFirstThenLog("TAB_SWITCH", "TAB_SWITCH", "Warning: tab switching is not allowed during this test.");
      }
    };

    const onBlur = () => {
      warnFirstThenLog("WINDOW_FOCUS_LOST", "WINDOW_FOCUS_LOST", "Warning: keep this window focused during the test.");
    };

    const onResize = () => {
      // Heuristic for minimization.
      if (window.innerWidth < 200 || window.innerHeight < 200) {
        void logViolation("WINDOW_MINIMIZED");
      }
    };

    const onFullscreen = () => {
      if (!document.fullscreenElement) {
        void logViolation("FULLSCREEN_EXIT");
      }
    };

    const onContextMenu = (e: MouseEvent) => {
      e.preventDefault();
      void logViolation("COPY_PASTE_ATTEMPT", { action: "context_menu" });
    };

    const onKeyDown = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      const isCopyPaste = (e.ctrlKey || e.metaKey) && ["c", "v", "x"].includes(key);
      const isDevtoolsShortcut =
        key === "f12" || ((e.ctrlKey || e.metaKey) && e.shiftKey && ["i", "j", "c"].includes(key));

      if (isCopyPaste) {
        e.preventDefault();
        void logViolation("COPY_PASTE_ATTEMPT", { action: `key_${key}` });
      }
      if (isDevtoolsShortcut) {
        e.preventDefault();
        void logViolation("DEVTOOLS_OPENED", { action: "shortcut" });
      }
    };

    const devtoolsInterval = window.setInterval(() => {
      const widthDiff = window.outerWidth - window.innerWidth;
      const heightDiff = window.outerHeight - window.innerHeight;
      const opened = widthDiff > 160 || heightDiff > 160;
      if (opened && !devtoolsWarnedRef.current) {
        devtoolsWarnedRef.current = true;
        void logViolation("DEVTOOLS_OPENED", { action: "dimension_heuristic" });
      }
      if (!opened) devtoolsWarnedRef.current = false;
    }, 2000);

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("blur", onBlur);
    window.addEventListener("resize", onResize);
    document.addEventListener("fullscreenchange", onFullscreen);
    document.addEventListener("contextmenu", onContextMenu);
    document.addEventListener("keydown", onKeyDown);

    return () => {
      window.clearInterval(devtoolsInterval);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("resize", onResize);
      document.removeEventListener("fullscreenchange", onFullscreen);
      document.removeEventListener("contextmenu", onContextMenu);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [enabled, logViolation, warnFirstThenLog]);

  // Audio checks: speaking duration, suspicious noise, multiple voices, mute attempts.
  useEffect(() => {
    if (!enabled || !microphoneStream) return;

    const track = microphoneStream.getAudioTracks()[0];
    if (!track) return;

    const onMute = () => {
      void logViolation("MICROPHONE_MUTED_ATTEMPT");
    };

    track.addEventListener("mute", onMute);

    const audioContext = new AudioContext();
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 1024;
    const source = audioContext.createMediaStreamSource(microphoneStream);
    source.connect(analyser);

    const freq = new Uint8Array(analyser.frequencyBinCount);
    const time = new Uint8Array(analyser.fftSize);

    const interval = window.setInterval(() => {
      analyser.getByteTimeDomainData(time);
      analyser.getByteFrequencyData(freq);

      let sum = 0;
      for (let i = 0; i < time.length; i++) {
        const v = time[i] - 128;
        sum += v * v;
      }
      const rms = Math.sqrt(sum / time.length);

      // Heuristic: sustained speech-like loudness for 5+ seconds.
      const isSpeaking = rms > 23;
      if (isSpeaking) {
        if (!speakingSinceRef.current) speakingSinceRef.current = Date.now();
        if (Date.now() - speakingSinceRef.current > 5000) {
          void logViolation("CANDIDATE_SPEAKING_DURING_CODING", { rms: Number(rms.toFixed(2)) });
          speakingSinceRef.current = null;
        }
      } else {
        speakingSinceRef.current = null;
      }

      if (rms > 40) {
        void logViolation("SUSPICIOUS_BACKGROUND_NOISE", { rms: Number(rms.toFixed(2)) });
      }

      // Crude multiple-voices heuristic: too many strong peaks in speech bands.
      let speechPeaks = 0;
      for (let i = 2; i < 60; i++) {
        if (freq[i] > 120) speechPeaks += 1;
      }
      if (speechPeaks > 12 && rms > 20) {
        void logViolation("MULTIPLE_VOICES_DETECTED", { speechPeaks, rms: Number(rms.toFixed(2)) });
      }
    }, 1000);

    return () => {
      track.removeEventListener("mute", onMute);
      window.clearInterval(interval);
      audioContext.close().catch(() => {});
    };
  }, [enabled, logViolation, microphoneStream]);

  // Face checks: no face, multiple faces, looking away, low visibility.
  useEffect(() => {
    if (!enabled || !cameraStream) return;

    let cancelled = false;
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.autoplay = true;
    video.srcObject = cameraStream;

    const canvas = document.createElement("canvas");
    canvas.width = 96;
    canvas.height = 72;
    const ctx = canvas.getContext("2d");

    const getAvgPoint = (pts: Array<{ x: number; y: number }>) => ({
      x: pts.reduce((sum, p) => sum + p.x, 0) / pts.length,
      y: pts.reduce((sum, p) => sum + p.y, 0) / pts.length,
    });

    const run = async () => {
      await loadFaceDetectionModels();
      try {
        await video.play();
      } catch {
        return;
      }
      const interval = window.setInterval(async () => {
        if (cancelled) return;
        const detections = await detectFaces(video);
        const now = Date.now();

        if (detections.length === 0) {
          if (!noFaceSinceRef.current) noFaceSinceRef.current = now;
          if (now - noFaceSinceRef.current > 5000) {
            void logViolation("NO_FACE_DETECTED");
            noFaceSinceRef.current = now;
          }
        } else {
          noFaceSinceRef.current = null;
        }

        if (detections.length > 1) {
          void logViolation("MULTIPLE_FACES_DETECTED", { faceCount: detections.length });
        }

        if (detections.length === 1) {
          const lm = detections[0].landmarks;
          const leftEye = getAvgPoint(lm.getLeftEye());
          const rightEye = getAvgPoint(lm.getRightEye());
          const nose = lm.getNose()[3] ?? lm.getNose()[0];
          const eyeCenter = { x: (leftEye.x + rightEye.x) / 2, y: (leftEye.y + rightEye.y) / 2 };
          const eyeDist = Math.max(1, Math.abs(rightEye.x - leftEye.x));
          const yaw = Math.abs((nose.x - eyeCenter.x) / eyeDist);
          const pitch = Math.abs((nose.y - eyeCenter.y) / eyeDist);
          const lookingAway = yaw > 0.18 || pitch > 0.22;

          if (lookingAway) {
            if (!lookingAwaySinceRef.current) lookingAwaySinceRef.current = now;
            if (now - lookingAwaySinceRef.current > 4000) {
              void logViolation("LOOKING_AWAY_FROM_SCREEN", { yaw: Number(yaw.toFixed(2)), pitch: Number(pitch.toFixed(2)) });
              lookingAwaySinceRef.current = now;
            }
          } else {
            lookingAwaySinceRef.current = null;
          }
        }

        // Low visibility / blocked camera
        if (ctx && video.videoWidth > 0 && video.videoHeight > 0) {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const img = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
          let lum = 0;
          for (let i = 0; i < img.length; i += 4) {
            lum += 0.2126 * img[i] + 0.7152 * img[i + 1] + 0.0722 * img[i + 2];
          }
          const avgLum = lum / (img.length / 4);
          if (avgLum < 28) {
            void logViolation("LOW_VISIBILITY", { brightness: Number(avgLum.toFixed(1)) });
          }
        }
      }, 1500);

      return () => {
        window.clearInterval(interval);
      };
    };

    let cleanupInner: (() => void) | undefined;
    void run().then((cleanup) => {
      cleanupInner = cleanup;
    });

    return () => {
      cancelled = true;
      cleanupInner?.();
      video.pause();
      video.srcObject = null;
    };
  }, [cameraStream, enabled, logViolation]);

  const recordEvent = useCallback(
    (eventCode: ProctoringEventCode, details?: Record<string, unknown>) => {
      void logViolation(eventCode, details);
    },
    [logViolation]
  );

  const resetRisk = useCallback(() => {
    setRiskScore(0);
    setEvents([]);
    warningCountsRef.current = {};
    lastEventTsRef.current = {};
    noFaceSinceRef.current = null;
    lookingAwaySinceRef.current = null;
    speakingSinceRef.current = null;
    devtoolsWarnedRef.current = false;
  }, []);

  return {
    riskScore,
    riskLevel,
    events,
    recordEvent,
    resetRisk,
  };
}
