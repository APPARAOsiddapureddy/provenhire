import { useRef, useEffect, useMemo, useState, useCallback, forwardRef, type MutableRefObject } from "react";
import { Shield } from "lucide-react";

interface LiveProctoringPreviewProps {
  cameraStream: MediaStream | null;
  /** Brand name for "Monitored by X" label */
  brandName?: string;
  /** Position: 'top-right' | 'right' | 'bottom-inside' (inside card, bottom, larger) */
  position?: "top-right" | "right" | "bottom-inside";
}

/**
 * Camera preview shown during proctored tests so the job seeker
 * sees they are being monitored — deters cheating.
 * Ref (optional) exposes the underlying &lt;video&gt; for TF proctoring on the same stream.
 */
const LiveProctoringPreview = forwardRef<HTMLVideoElement | null, LiveProctoringPreviewProps>(function LiveProctoringPreview(
  { cameraStream, brandName = "ProvenHire", position = "top-right" },
  forwardedRef
) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  const setVideoRef = useCallback(
    (node: HTMLVideoElement | null) => {
      videoRef.current = node;
      if (typeof forwardedRef === "function") {
        forwardedRef(node);
      } else if (forwardedRef) {
        (forwardedRef as MutableRefObject<HTMLVideoElement | null>).current = node;
      }
    },
    [forwardedRef]
  );

  const isBottomInside = position === "bottom-inside";
  const isFixedOverlay = !isBottomInside;
  const storageKey = useMemo(() => `ph:proctor-preview:${position}`, [position]);
  const [overlayPos, setOverlayPos] = useState<{ x: number; y: number } | null>(null);
  const dragStateRef = useRef<{
    dragging: boolean;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
  } | null>(null);

  useEffect(() => {
    if (videoRef.current && cameraStream) {
      videoRef.current.srcObject = cameraStream;
    }
  }, [cameraStream]);

  if (!cameraStream) return null;

  useEffect(() => {
    if (!isFixedOverlay) return;
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) return;
      const parsed = JSON.parse(raw) as { x?: number; y?: number };
      if (typeof parsed?.x === "number" && typeof parsed?.y === "number") {
        setOverlayPos({ x: parsed.x, y: parsed.y });
      }
    } catch {
      // ignore
    }
  }, [isFixedOverlay, storageKey]);

  const clampToViewport = useCallback((x: number, y: number, width: number, height: number) => {
    const maxX = Math.max(0, window.innerWidth - width - 8);
    const maxY = Math.max(0, window.innerHeight - height - 8);
    return {
      x: Math.min(Math.max(8, x), maxX),
      y: Math.min(Math.max(8, y), maxY),
    };
  }, []);

  const onPointerDownHeader = useCallback(
    (e: React.PointerEvent) => {
      if (!isFixedOverlay) return;
      const el = rootRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const current = overlayPos ?? { x: rect.left, y: rect.top };
      dragStateRef.current = {
        dragging: true,
        startX: e.clientX,
        startY: e.clientY,
        originX: current.x,
        originY: current.y,
      };
      (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
      e.preventDefault();
    },
    [isFixedOverlay, overlayPos]
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      const st = dragStateRef.current;
      if (!st?.dragging) return;
      const el = rootRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const dx = e.clientX - st.startX;
      const dy = e.clientY - st.startY;
      const next = clampToViewport(st.originX + dx, st.originY + dy, rect.width, rect.height);
      setOverlayPos(next);
    },
    [clampToViewport]
  );

  const onPointerUp = useCallback(() => {
    const st = dragStateRef.current;
    if (!st?.dragging) return;
    dragStateRef.current = { ...st, dragging: false };
    if (overlayPos && isFixedOverlay) {
      try {
        localStorage.setItem(storageKey, JSON.stringify(overlayPos));
      } catch {
        // ignore
      }
    }
  }, [overlayPos, isFixedOverlay, storageKey]);

  const positionClasses = isBottomInside
    ? "shrink-0"
    : "fixed z-30";
  const width = isBottomInside ? "260px" : "180px";
  const defaultStyle =
    position === "top-right"
      ? { top: "5rem", right: "1rem" }
      : { top: "50%", right: "1rem", transform: "translateY(-50%)" };
  const overlayStyle =
    isFixedOverlay && overlayPos
      ? { left: overlayPos.x, top: overlayPos.y, right: "auto", transform: "none" as const }
      : defaultStyle;

  return (
    <div
      ref={rootRef}
      className={`flex flex-col gap-2 rounded-lg border-2 border-primary/40 bg-background/95 backdrop-blur shadow-lg overflow-hidden ${positionClasses}`}
      style={{ width, ...(isFixedOverlay ? overlayStyle : {}) }}
    >
      <div
        className={`flex items-center gap-2 px-2 py-1.5 bg-primary/10 border-b border-primary/20 ${
          isFixedOverlay ? "cursor-move select-none touch-none" : ""
        }`}
        onPointerDown={onPointerDownHeader}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      >
        <Shield className="h-3.5 w-3.5 text-primary shrink-0" />
        <span className="text-xs font-semibold text-foreground truncate">
          Monitored by {brandName}
        </span>
      </div>
      <div className="relative aspect-video bg-muted">
        <video
          ref={setVideoRef}
          autoPlay
          playsInline
          muted
          className="w-full h-full object-cover"
        />
        <div className="absolute bottom-0 right-0 flex items-center gap-1 px-1 py-0.5 bg-black/50 rounded-tl text-[10px] text-white">
          <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
          LIVE
        </div>
      </div>
    </div>
  );
});

export default LiveProctoringPreview;
