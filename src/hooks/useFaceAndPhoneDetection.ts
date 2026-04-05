import { useEffect, useRef, type RefObject } from "react";
import { api } from "@/lib/api";
import {
  acquireTfProctoringModels,
  releaseTfProctoringModels,
  estimateBlazeFaces,
  detectCellPhoneInFrame,
} from "@/utils/tfProctoringDetection";

export type ProctoringServerAction = "CONTINUE" | "SHOW_WARNING" | "STOP_TEST";

const WARN: Record<string, string> = {
  MULTIPLE_FACES_DETECTED: "Only you should be visible on camera during the assessment.",
  PHONE_DETECTED: "External devices are not permitted during the assessment.",
  NO_FACE_DETECTED: "Please ensure your face is clearly visible on camera.",
};

/**
 * Lightweight face + cell-phone pass using BlazeFace + COCO-SSD.
 * Uses the shared tfProctoring singleton (reference counted) so GPU memory is released on unmount.
 */
export function useFaceAndPhoneDetection(opts: {
  videoRef: RefObject<HTMLVideoElement | null>;
  sessionId: string;
  testType: string;
  userId: string | undefined;
  enabled: boolean;
  onServerAction?: (action: ProctoringServerAction, eventType: string) => void;
}) {
  const { videoRef, sessionId, testType, userId, enabled, onServerAction } = opts;
  const acquiredRef = useRef(false);

  useEffect(() => {
    if (!enabled || !userId || !sessionId) return;

    let intervalId = 0;
    let cancelled = false;

    async function sendEvent(eventType: string) {
      try {
        const res = await api.post<{ action?: ProctoringServerAction }>("/api/proctoring/alerts", {
          userId,
          testId: sessionId,
          testType,
          alertType: eventType,
          severity: "medium",
          message: eventType,
          violationDetails: { source: "useFaceAndPhoneDetection", eventType },
        });
        const action = res?.action ?? "CONTINUE";
        if (action === "SHOW_WARNING" && WARN[eventType]) {
          const { toast } = await import("sonner");
          toast.warning(WARN[eventType], { duration: 6000 });
        }
        if (action === "STOP_TEST") {
          onServerAction?.(action, eventType);
        }
      } catch {
        /* non-blocking */
      }
    }

    async function tick() {
      const video = videoRef.current;
      if (!video || video.readyState < 2) return;

      try {
        const faces = await estimateBlazeFaces(video);
        if (faces.length === 0) {
          await sendEvent("NO_FACE_DETECTED");
        } else if (faces.length >= 2) {
          await sendEvent("MULTIPLE_FACES_DETECTED");
        }

        const { found } = await detectCellPhoneInFrame(video, 0.6);
        if (found) {
          await sendEvent("PHONE_DETECTED");
        }
      } catch {
        /* ignore frame errors */
      }
    }

    async function load() {
      try {
        await acquireTfProctoringModels();
        if (cancelled) {
          releaseTfProctoringModels();
          return;
        }
        acquiredRef.current = true;
        intervalId = window.setInterval(() => void tick(), 3000);
      } catch (e) {
        console.warn("[useFaceAndPhoneDetection] model load failed — face/phone checks disabled for this session:", e);
      }
    }

    void load().catch(() => {});

    return () => {
      cancelled = true;
      if (intervalId) window.clearInterval(intervalId);
      if (acquiredRef.current) {
        acquiredRef.current = false;
        releaseTfProctoringModels();
      }
    };
  }, [enabled, userId, sessionId, testType, videoRef, onServerAction]);
}
