/**
 * Sends webcam frames to the AI proctoring backend every 1 second.
 * Resizes to 320x240, runs phone detection every 3 seconds.
 */
import { useCallback, useEffect, useRef } from "react";
import { api } from "@/lib/api";

const FRAME_WIDTH = 320;
const FRAME_HEIGHT = 240;
const INTERVAL_MS = 1000;
const PHONE_DETECTION_INTERVAL = 3; // Run phone detection every 3rd frame

export interface UseProctorFrameCaptureOptions {
  enabled: boolean;
  sessionId: string;
  testType?: "aptitude" | "dsa" | "ai_interview";
  cameraStream: MediaStream | null;
  onError?: (err: unknown) => void;
}

export function useProctorFrameCapture({
  enabled,
  sessionId,
  testType,
  cameraStream,
  onError,
}: UseProctorFrameCaptureOptions) {
  const frameCountRef = useRef(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  // Use a hidden video element fed by the stream
  useEffect(() => {
    if (!cameraStream || !enabled) return;
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.autoplay = true;
    video.srcObject = cameraStream;
    video.play().catch(() => {});
    videoRef.current = video;
    return () => {
      video.srcObject = null;
      videoRef.current = null;
    };
  }, [cameraStream, enabled]);

  const captureAndSend = useCallback(async () => {
    const video = videoRef.current;
    if (!video || video.readyState < 2 || !video.videoWidth) return;

    const canvas = document.createElement("canvas");
    canvas.width = FRAME_WIDTH;
    canvas.height = FRAME_HEIGHT;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.drawImage(video, 0, 0, FRAME_WIDTH, FRAME_HEIGHT);
    const base64 = canvas.toDataURL("image/jpeg", 0.85).split(",")[1];
    if (!base64) return;

    frameCountRef.current += 1;
    const runPhoneDetection = frameCountRef.current % PHONE_DETECTION_INTERVAL === 1;

    try {
      await api.post("/api/proctor/frame", {
        sessionId,
        frame: base64,
        testType,
        runPhoneDetection,
      });
    } catch (err) {
      onError?.(err);
    }
  }, [sessionId, testType, onError]);

  useEffect(() => {
    if (!enabled || !sessionId || !cameraStream) return;

    const id = window.setInterval(captureAndSend, INTERVAL_MS);
    intervalRef.current = id;

    return () => {
      if (intervalRef.current) {
        window.clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [enabled, sessionId, cameraStream, captureAndSend]);

  return { frameCount: frameCountRef.current };
}
