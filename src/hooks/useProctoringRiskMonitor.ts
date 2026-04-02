import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import {
  acquireTfProctoringModels,
  releaseTfProctoringModels,
  estimateBlazeFaces,
  blazeFaceLookingAway,
  detectCellPhoneInFrame,
} from "@/utils/tfProctoringDetection";

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

export type ViolationSessionLevel = "baseline" | "elevated" | "high_attention";

/** Server + strike policy: these signals get clear toasts; copy-paste / devtools are logged without learner strike UX */
export const STRIKE_TERMINATION_EVENTS = new Set<ProctoringEventCode>([
  "NO_FACE_DETECTED",
  "MULTIPLE_FACES_DETECTED",
  "PHONE_DETECTED",
  "TAB_SWITCH",
  "FULLSCREEN_EXIT",
  "MULTIPLE_VOICES_DETECTED",
  "SUSPICIOUS_BACKGROUND_NOISE",
]);

export const MAX_PROCTORING_STRIKES = 3;

export interface ProctoringEventLog {
  candidate_id: string;
  test_id: string;
  event: ProctoringEventCode;
  timestamp: string;
  /** Times this signal has been logged this session (after rate-limit), including this event. */
  violation_count_for_type: number;
  violation_counts_by_type: Partial<Record<ProctoringEventCode, number>>;
  details?: Record<string, unknown>;
}

export type StrikeTerminationMode = "OFF" | "MONITOR" | "STRICT";

interface UseProctoringRiskMonitorOptions {
  enabled: boolean;
  candidateId?: string;
  testId: string;
  testType: "aptitude" | "dsa" | "ai_interview" | "non_tech_assignment";
  cameraStream?: MediaStream | null;
  microphoneStream?: MediaStream | null;
  tabSwitchDetectionEnabled?: boolean;
  copyPasteDetectionEnabled?: boolean;
  devtoolsDetectionEnabled?: boolean;
  fullscreenDetectionEnabled?: boolean;
  /** When true, runs TensorFlow.js camera AI: face count (none / multi), phone (COCO-SSD), low brightness, looking-away. */
  multipleFaceDetectionEnabled?: boolean;
  proctorVideoRef?: RefObject<HTMLVideoElement | null>;
  microphoneMonitoringEnabled?: boolean;
  maxTabSwitches?: number;
  /** Legacy: when strike termination is OFF and tab detection is STRICT, still end test after N tab switches */
  onMaxTabSwitches?: () => void;
  /** OFF = learner toasts only; MONITOR = show strike counts, no auto-end; STRICT = end after 3 strikes per signal (tab uses physical switch count) */
  strikeTerminationMode?: StrikeTerminationMode;
  onProctoringTerminated?: (code: ProctoringEventCode) => void;
  /** When true, honor server STOP_TEST / SHOW_WARNING from /api/proctoring/alerts (per-signal counts). */
  applyServerThresholdActions?: boolean;
}

const SERVER_WARN_ON_COUNT_MESSAGES: Partial<Record<ProctoringEventCode, string>> = {
  MULTIPLE_FACES_DETECTED: "Only you should be visible on camera during the assessment.",
  PHONE_DETECTED: "External devices are not permitted during the assessment.",
  TAB_SWITCH: "Please do not switch tabs during the assessment.",
  FULLSCREEN_EXIT: "Please stay in fullscreen mode during the assessment.",
  NO_FACE_DETECTED: "Please ensure your face is clearly visible on camera.",
  COPY_PASTE_ATTEMPT: "Copy-paste is not permitted during this assessment.",
  DEVTOOLS_OPENED: "Developer tools are not permitted during the assessment.",
};

const STRIKE_LEARNER_TOAST: Partial<Record<ProctoringEventCode, string>> = {
  NO_FACE_DETECTED: "Your face is not visible. Stay centered in the camera.",
  MULTIPLE_FACES_DETECTED: "Multiple faces detected. Only you may be on camera.",
  PHONE_DETECTED: "A phone or handheld device was seen. Remove it from view.",
  FULLSCREEN_EXIT: "Full screen was exited. Return to full screen for this assessment.",
  MULTIPLE_VOICES_DETECTED: "Unusual audio pattern — others may be speaking nearby.",
  SUSPICIOUS_BACKGROUND_NOISE: "Loud background audio detected. Reduce noise around you.",
};

const CHEATING_TOASTS_OTHER: Partial<Record<ProctoringEventCode, string>> = {
  LOOKING_AWAY_FROM_SCREEN: "Try to keep your eyes toward the screen.",
  LOW_VISIBILITY: "Lighting is very low — improve lighting so your face stays visible.",
  MICROPHONE_MUTED_ATTEMPT: "Microphone was muted. Keep it on for this session.",
  WINDOW_FOCUS_LOST: "Keep this window focused during the assessment.",
  WINDOW_MINIMIZED: "This window appears minimized — restore it.",
};

const EVENT_COOLDOWN_MS: Partial<Record<ProctoringEventCode, number>> = {
  NO_FACE_DETECTED: 12000,
  MULTIPLE_FACES_DETECTED: 8000,
  PHONE_DETECTED: 10000,
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

function sessionLevelFromCounts(
  maxPerType: number,
  totalLogged: number,
): ViolationSessionLevel {
  if (maxPerType >= 6 || totalLogged >= 22) return "high_attention";
  if (maxPerType >= 3 || totalLogged >= 9) return "elevated";
  return "baseline";
}

function getSeverityFromRepeatCount(countForType: number): "low" | "medium" | "high" {
  if (countForType >= 4) return "high";
  if (countForType >= 2) return "medium";
  return "low";
}

export function useProctoringRiskMonitor({
  enabled,
  candidateId,
  testId,
  testType,
  cameraStream,
  microphoneStream,
  tabSwitchDetectionEnabled = false,
  copyPasteDetectionEnabled = false,
  devtoolsDetectionEnabled = false,
  fullscreenDetectionEnabled = false,
  multipleFaceDetectionEnabled = false,
  proctorVideoRef,
  microphoneMonitoringEnabled = false,
  maxTabSwitches = 3,
  onMaxTabSwitches,
  strikeTerminationMode = "OFF",
  onProctoringTerminated,
  applyServerThresholdActions = true,
}: UseProctoringRiskMonitorOptions) {
  const [violationCountsByType, setViolationCountsByType] = useState<
    Partial<Record<ProctoringEventCode, number>>
  >({});
  const [tabSwitchCount, setTabSwitchCount] = useState(0);
  const [events, setEvents] = useState<ProctoringEventLog[]>([]);
  const warningCountsRef = useRef<Record<string, number>>({});
  const lastEventTsRef = useRef<Partial<Record<ProctoringEventCode, number>>>({});
  const noFaceSinceRef = useRef<number | null>(null);
  const lookingAwaySinceRef = useRef<number | null>(null);
  const speakingSinceRef = useRef<number | null>(null);
  const devtoolsWarnedRef = useRef(false);
  const violationCountsRef = useRef<Partial<Record<ProctoringEventCode, number>>>({});
  const terminatedRef = useRef(false);
  const onMaxTabSwitchesRef = useRef(onMaxTabSwitches);
  const onProctoringTerminatedRef = useRef(onProctoringTerminated);
  onMaxTabSwitchesRef.current = onMaxTabSwitches;
  onProctoringTerminatedRef.current = onProctoringTerminated;

  const totalLoggedViolations = useMemo(
    () => Object.values(violationCountsByType).reduce((a, b) => a + (b ?? 0), 0),
    [violationCountsByType],
  );
  const maxViolationsForOneSignal = useMemo(() => {
    const vals = Object.values(violationCountsByType).filter((n) => typeof n === "number");
    return vals.length ? Math.max(...vals) : 0;
  }, [violationCountsByType]);
  const violationSessionLevel = useMemo(
    () => sessionLevelFromCounts(maxViolationsForOneSignal, totalLoggedViolations),
    [maxViolationsForOneSignal, totalLoggedViolations],
  );

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

  /** Ends the attempt after MAX_PROCTORING_STRIKES of the same signal (or tab leaves). OFF = never auto-end here. */
  const maybeHardTerminate = useCallback((code: ProctoringEventCode, strikeCount: number) => {
    if (terminatedRef.current) return;
    if (strikeTerminationMode === "OFF") return;
    if (strikeCount < MAX_PROCTORING_STRIKES) return;
    terminatedRef.current = true;
    toast.error("This assessment has ended due to repeated integrity alerts.", { duration: 8000 });
    onProctoringTerminatedRef.current?.(code);
  }, [strikeTerminationMode]);

  const logViolation = useCallback(
    async (
      eventCode: ProctoringEventCode,
      details?: Record<string, unknown>,
      opts?: { silentClientFeedback?: boolean }
    ) => {
      if (!candidateId || !testId || !enabled) return;
      if (shouldRateLimitEvent(eventCode)) return;

      const silentClient = opts?.silentClientFeedback === true;
      const nextForType = (violationCountsRef.current[eventCode] ?? 0) + 1;
      violationCountsRef.current[eventCode] = nextForType;
      const violation_counts_by_type = { ...violationCountsRef.current } as Partial<
        Record<ProctoringEventCode, number>
      >;
      setViolationCountsByType(violation_counts_by_type);
      const timestamp = new Date().toISOString();

      const isStrikeClass =
        STRIKE_TERMINATION_EVENTS.has(eventCode) && eventCode !== "TAB_SWITCH" && !silentClient;

      if (!silentClient) {
        if (isStrikeClass) {
          const baseMsg = STRIKE_LEARNER_TOAST[eventCode];
          if (strikeTerminationMode === "OFF") {
            if (baseMsg) toast.warning(baseMsg, { duration: 6000 });
          } else {
            const n = nextForType;
            const suffix =
              strikeTerminationMode === "MONITOR"
                ? ` Strike ${n}/${MAX_PROCTORING_STRIKES}${
                    n >= MAX_PROCTORING_STRIKES ? " — maximum reached; this attempt ends." : "."
                  }`
                : ` Strike ${n}/${MAX_PROCTORING_STRIKES}${
                    n >= MAX_PROCTORING_STRIKES ? " — maximum reached." : " — test will end if this reaches 3."
                  }`;
            if (baseMsg) toast.warning(baseMsg + suffix, { duration: 7500 });
            maybeHardTerminate(eventCode, n);
          }
        } else if (
          !["COPY_PASTE_ATTEMPT", "DEVTOOLS_OPENED"].includes(eventCode) &&
          CHEATING_TOASTS_OTHER[eventCode]
        ) {
          toast.warning(CHEATING_TOASTS_OTHER[eventCode]!, { duration: 5000 });
        }
      }

      const eventLog: ProctoringEventLog = {
        candidate_id: candidateId,
        test_id: testId,
        event: eventCode,
        timestamp,
        violation_count_for_type: nextForType,
        violation_counts_by_type,
        details: {
          ...details,
          ...(isStrikeClass
            ? { learnerStrikes: nextForType, strikeMode: strikeTerminationMode }
            : {}),
        },
      };

      setEvents((prev) => [...prev, eventLog]);

      try {
        const alertRes = await api.post<{
          ok?: boolean;
          action?: "CONTINUE" | "SHOW_WARNING" | "STOP_TEST";
        }>("/api/proctoring/alerts", {
          userId: candidateId,
          testId,
          testType,
          alertType: eventCode,
          severity: getSeverityFromRepeatCount(nextForType),
          message: eventCode,
          violationCountForType: nextForType,
          riskScore: nextForType,
          violationDetails: {
            ...details,
            timestamp,
            eventCode,
            violationCountForType: nextForType,
            violationCountsByType: violation_counts_by_type,
            strikeTerminationMode,
            strikesForEvent: isStrikeClass ? nextForType : undefined,
          },
        });
        if (applyServerThresholdActions && alertRes?.action === "SHOW_WARNING") {
          const w = SERVER_WARN_ON_COUNT_MESSAGES[eventCode];
          if (w) toast.warning(w, { duration: 6500 });
        }
        if (applyServerThresholdActions && alertRes?.action === "STOP_TEST" && !terminatedRef.current) {
          terminatedRef.current = true;
          toast.error(
            "Your assessment has been terminated due to repeated integrity violations. This attempt has been recorded.",
            { duration: 10000 },
          );
          onProctoringTerminatedRef.current?.(eventCode);
        }
      } catch {
        // Do not interrupt the test if alert logging fails.
      }
    },
    [
      applyServerThresholdActions,
      candidateId,
      enabled,
      maybeHardTerminate,
      shouldRateLimitEvent,
      strikeTerminationMode,
      testId,
      testType,
    ]
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

  useEffect(() => {
    if (!enabled) return;

    const tabAndFocusEnabled = tabSwitchDetectionEnabled;
    const copyPasteEnabled = copyPasteDetectionEnabled;
    const devtoolsEnabled = devtoolsDetectionEnabled;
    const fullscreenEnabled = fullscreenDetectionEnabled;

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
      if (!tabAndFocusEnabled) return;
      if (!document.hidden) return;
      setTabSwitchCount((prev) => {
        const next = prev + 1;
        const base = "You left this assessment tab. Return immediately.";

        if (strikeTerminationMode === "MONITOR" || strikeTerminationMode === "STRICT") {
          toast.warning(`${base} Strike ${next}/${MAX_PROCTORING_STRIKES}.`, { duration: 6000 });
          if (strikeTerminationMode !== "OFF" && next >= MAX_PROCTORING_STRIKES && !terminatedRef.current) {
            maybeHardTerminate("TAB_SWITCH", next);
          }
        } else {
          toast.warning(base, { duration: 4500 });
        }

        // When strike auto-end is OFF, tab-switch STRICT still ends the test via physical switch count only.
        if (strikeTerminationMode === "OFF" && maxTabSwitches > 0 && next >= maxTabSwitches) {
          toast.error(`Tab switch limit reached (${next}/${maxTabSwitches}).`);
          onMaxTabSwitchesRef.current?.();
        }

        void logViolation("TAB_SWITCH", { switchNumber: next }, { silentClientFeedback: true });
        return next;
      });
    };

    const onBlur = () => {
      if (!tabAndFocusEnabled) return;
      warnFirstThenLog("WINDOW_FOCUS_LOST", "WINDOW_FOCUS_LOST", "Warning: keep this window focused during the test.");
    };

    const onResize = () => {
      if (!tabAndFocusEnabled) return;
      if (window.innerWidth < 200 || window.innerHeight < 200) {
        void logViolation("WINDOW_MINIMIZED");
      }
    };

    const onFullscreen = () => {
      if (!fullscreenEnabled) return;
      if (!document.fullscreenElement) {
        void logViolation("FULLSCREEN_EXIT");
      }
    };

    const onContextMenu = (e: MouseEvent) => {
      if (!copyPasteEnabled) return;
      e.preventDefault();
      void logViolation("COPY_PASTE_ATTEMPT", { action: "context_menu" });
    };

    const onKeyDown = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      const isCopyPaste = (e.ctrlKey || e.metaKey) && ["c", "v", "x"].includes(key);
      const isDevtoolsShortcut =
        key === "f12" || ((e.ctrlKey || e.metaKey) && e.shiftKey && ["i", "j", "c"].includes(key));

      if (copyPasteEnabled && isCopyPaste) {
        e.preventDefault();
        void logViolation("COPY_PASTE_ATTEMPT", { action: `key_${key}` });
      }
      if (devtoolsEnabled && isDevtoolsShortcut) {
        e.preventDefault();
        void logViolation("DEVTOOLS_OPENED", { action: "shortcut" });
      }
    };

    const devtoolsInterval = devtoolsEnabled
      ? window.setInterval(() => {
          const widthDiff = window.outerWidth - window.innerWidth;
          const heightDiff = window.outerHeight - window.innerHeight;
          const opened = widthDiff > 160 || heightDiff > 160;
          if (opened && !devtoolsWarnedRef.current) {
            devtoolsWarnedRef.current = true;
            void logViolation("DEVTOOLS_OPENED", { action: "dimension_heuristic" });
          }
          if (!opened) devtoolsWarnedRef.current = false;
        }, 2000)
      : 0;

    if (tabAndFocusEnabled) {
      document.addEventListener("visibilitychange", onVisibility);
      window.addEventListener("blur", onBlur);
    }
    if (tabAndFocusEnabled) window.addEventListener("resize", onResize);
    if (fullscreenEnabled) document.addEventListener("fullscreenchange", onFullscreen);
    document.addEventListener("contextmenu", onContextMenu);
    document.addEventListener("keydown", onKeyDown);

    return () => {
      if (devtoolsInterval) window.clearInterval(devtoolsInterval);
      if (tabAndFocusEnabled) {
        document.removeEventListener("visibilitychange", onVisibility);
        window.removeEventListener("blur", onBlur);
        window.removeEventListener("resize", onResize);
      }
      if (fullscreenEnabled) document.removeEventListener("fullscreenchange", onFullscreen);
      document.removeEventListener("contextmenu", onContextMenu);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [
    enabled,
    logViolation,
    warnFirstThenLog,
    maxTabSwitches,
    maybeHardTerminate,
    strikeTerminationMode,
    tabSwitchDetectionEnabled,
    copyPasteDetectionEnabled,
    devtoolsDetectionEnabled,
    fullscreenDetectionEnabled,
  ]);

  useEffect(() => {
    if (!enabled || !microphoneStream || !microphoneMonitoringEnabled) return;

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
  }, [enabled, logViolation, microphoneStream, microphoneMonitoringEnabled]);

  useEffect(() => {
    // ai_interview uses a separate video pipeline (ExpertInterviewStage); skip this effect there.
    if (!enabled || !cameraStream || testType === "ai_interview" || !multipleFaceDetectionEnabled) return;

    let cancelled = false;
    const useExternalVideo = Boolean(proctorVideoRef);
    const internalVideo = document.createElement("video");
    internalVideo.muted = true;
    internalVideo.playsInline = true;
    internalVideo.autoplay = true;
    if (!useExternalVideo) {
      internalVideo.srcObject = cameraStream;
    }

    const canvas = document.createElement("canvas");
    canvas.width = 96;
    canvas.height = 72;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });

    const getActiveVideo = (): HTMLVideoElement | null => {
      if (useExternalVideo && proctorVideoRef) {
        return proctorVideoRef.current;
      }
      return internalVideo;
    };

    const trackLive = () => {
      const t = cameraStream.getVideoTracks()[0];
      return t && t.readyState === "live";
    };

    let intervalId = 0;
    let tfModelsAcquired = false;

    const run = async () => {
      try {
        if (!useExternalVideo) {
          await internalVideo.play();
        }
      } catch {
        return;
      }

      try {
        await acquireTfProctoringModels();
        tfModelsAcquired = true;
      } catch (e) {
        console.warn("[proctoring] TF models failed to load", e);
        return;
      }

      if (cancelled) {
        releaseTfProctoringModels();
        tfModelsAcquired = false;
        return;
      }

      const tick = async () => {
        if (cancelled || !trackLive()) return;
        const video = getActiveVideo();
        if (!video || video.readyState < 2 || video.videoWidth < 2) return;

        const now = Date.now();
        let faces: Awaited<ReturnType<typeof estimateBlazeFaces>> = [];
        try {
          faces = await estimateBlazeFaces(video);
        } catch {
          faces = [];
        }
        const n = faces.length;

        if (n === 0) {
          if (!noFaceSinceRef.current) noFaceSinceRef.current = now;
          if (now - (noFaceSinceRef.current ?? 0) > 5000) {
            void logViolation("NO_FACE_DETECTED");
            noFaceSinceRef.current = now;
          }
        } else {
          noFaceSinceRef.current = null;
        }

        if (n >= 2) {
          void logViolation("MULTIPLE_FACES_DETECTED", { faceCount: n });
        }

        if (n === 1) {
          const lookingAway = blazeFaceLookingAway(faces);
          if (lookingAway) {
            if (!lookingAwaySinceRef.current) lookingAwaySinceRef.current = now;
            if (now - (lookingAwaySinceRef.current ?? 0) > 4000) {
              void logViolation("LOOKING_AWAY_FROM_SCREEN");
              lookingAwaySinceRef.current = now;
            }
          } else {
            lookingAwaySinceRef.current = null;
          }
        } else {
          lookingAwaySinceRef.current = null;
        }

        try {
          const phone = await detectCellPhoneInFrame(video, 0.5);
          if (phone.found) {
            void logViolation("PHONE_DETECTED", { confidence: Number(phone.maxScore.toFixed(3)) });
          }
        } catch {
          /* ignore */
        }

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
      };

      intervalId = window.setInterval(() => {
        void tick();
      }, 3000);
    };

    void run();

    return () => {
      cancelled = true;
      if (intervalId) window.clearInterval(intervalId);
      internalVideo.pause();
      internalVideo.srcObject = null;
      if (tfModelsAcquired) releaseTfProctoringModels();
    };
  }, [
    cameraStream,
    enabled,
    logViolation,
    multipleFaceDetectionEnabled,
    proctorVideoRef,
    testType,
  ]);

  const recordEvent = useCallback(
    (eventCode: ProctoringEventCode, details?: Record<string, unknown>) => {
      void logViolation(eventCode, details);
    },
    [logViolation]
  );

  const resetRisk = useCallback(() => {
    violationCountsRef.current = {};
    setViolationCountsByType({});
    setEvents([]);
    warningCountsRef.current = {};
    lastEventTsRef.current = {};
    terminatedRef.current = false;
    noFaceSinceRef.current = null;
    lookingAwaySinceRef.current = null;
    speakingSinceRef.current = null;
    devtoolsWarnedRef.current = false;
  }, []);

  return {
    violationCountsByType,
    totalLoggedViolations,
    violationSessionLevel,
    tabSwitchCount,
    events,
    recordEvent,
    resetRisk,
  };
}
