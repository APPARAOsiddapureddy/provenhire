import { useEffect, useRef, type RefObject } from "react";
import * as tf from "@tensorflow/tfjs";
import * as blazeface from "@tensorflow-models/blazeface";
import * as cocoSsd from "@tensorflow-models/coco-ssd";
import { api } from "@/lib/api";
import { blazeFaceModelUrl, COCO_SSD_LITE_MODEL_URL } from "@/lib/tfModelUrls";

export type ProctoringServerAction = "CONTINUE" | "SHOW_WARNING" | "STOP_TEST";

const WARN: Record<string, string> = {
  MULTIPLE_FACES_DETECTED: "Only you should be visible on camera during the assessment.",
  PHONE_DETECTED: "External devices are not permitted during the assessment.",
  NO_FACE_DETECTED: "Please ensure your face is clearly visible on camera.",
};

/**
 * Lightweight face + cell-phone pass using BlazeFace + COCO-SSD (aptitude / DSA only).
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
  const modelsRef = useRef<{ face: blazeface.BlazeFaceModel | null; coco: cocoSsd.ObjectDetection | null }>({
    face: null,
    coco: null,
  });

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
      if (!video || video.readyState < 2 || !modelsRef.current.face || !modelsRef.current.coco) return;

      try {
        const faces = await modelsRef.current.face.estimateFaces(video, false);
        if (faces.length === 0) {
          await sendEvent("NO_FACE_DETECTED");
        } else if (faces.length >= 2) {
          await sendEvent("MULTIPLE_FACES_DETECTED");
        }

        const objects = await modelsRef.current.coco.detect(video);
        const phones = objects.filter((o) => o.class === "cell phone" && o.score > 0.6);
        if (phones.length > 0) {
          await sendEvent("PHONE_DETECTED");
        }
      } catch {
        /* ignore frame errors */
      }
    }

    async function load() {
      let face: blazeface.BlazeFaceModel | null = null;
      try {
        await tf.ready();
        if (cancelled) return;
        face = await blazeface.load({ modelUrl: blazeFaceModelUrl() });
        const coco = await cocoSsd.load({
          base: "lite_mobilenet_v2",
          modelUrl: COCO_SSD_LITE_MODEL_URL,
        });
        if (cancelled) {
          try {
            face.dispose();
          } catch {
            /* ignore */
          }
          return;
        }
        modelsRef.current = { face, coco };
        intervalId = window.setInterval(() => void tick(), 3000);
      } catch (e) {
        console.warn("[useFaceAndPhoneDetection] model load failed — face/phone checks disabled for this session:", e);
        try {
          face?.dispose();
        } catch {
          /* ignore */
        }
      }
    }

    void load().catch(() => {});

    return () => {
      cancelled = true;
      if (intervalId) window.clearInterval(intervalId);
      modelsRef.current = { face: null, coco: null };
    };
  }, [enabled, userId, sessionId, testType, videoRef, onServerAction]);
}
