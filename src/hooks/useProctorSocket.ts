import { useEffect, useRef, useCallback } from "react";
import { io, Socket } from "socket.io-client";
import { RENDER_API_URL } from "@/lib/config";

// In production, Vercel does not support WebSockets; connect directly to the backend (Render).
const SOCKET_URL = import.meta.env.PROD ? RENDER_API_URL : "";

export interface ProctorEventPayload {
  sessionId: string;
  event: string;
  timestamp?: string;
  confidence?: number;
  screenshotPath?: string;
}

export function useProctorSocket(options: {
  onEvent?: (payload: ProctorEventPayload) => void;
  recruiterMode?: boolean;
}) {
  const { onEvent, recruiterMode = true } = options;
  const socketRef = useRef<Socket | null>(null);
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  useEffect(() => {
    const socket = io(SOCKET_URL, {
      path: "/socket.io",
      transports: ["websocket", "polling"],
    });

    socket.on("connect", () => {
      if (recruiterMode) {
        socket.emit("proctor:recruiter_join");
      }
    });

    socket.on("proctor:event", (payload: ProctorEventPayload) => {
      onEventRef.current?.(payload);
    });

    // Avoid console spam when backend is unreachable or WebSocket not available
    socket.on("connect_error", () => {});

    socketRef.current = socket;
    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [recruiterMode]);

  const subscribe = useCallback((sessionId: string) => {
    socketRef.current?.emit("proctor:subscribe", sessionId);
  }, []);

  const unsubscribe = useCallback((sessionId: string) => {
    socketRef.current?.emit("proctor:unsubscribe", sessionId);
  }, []);

  return { subscribe, unsubscribe };
}
