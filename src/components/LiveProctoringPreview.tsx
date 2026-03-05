import { useRef, useEffect } from "react";
import { Shield } from "lucide-react";

interface LiveProctoringPreviewProps {
  cameraStream: MediaStream | null;
  /** Brand name for "Monitored by X" label */
  brandName?: string;
  /** Position: 'top-right' | 'right' */
  position?: "top-right" | "right";
}

/**
 * Floating camera preview shown during proctored tests so the job seeker
 * sees they are being monitored — deters cheating.
 */
const LiveProctoringPreview = ({
  cameraStream,
  brandName = "ProvenHire",
  position = "top-right",
}: LiveProctoringPreviewProps) => {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (videoRef.current && cameraStream) {
      videoRef.current.srcObject = cameraStream;
    }
  }, [cameraStream]);

  if (!cameraStream) return null;

  const positionClasses =
    position === "top-right"
      ? "top-20 right-4"
      : "top-1/2 -translate-y-1/2 right-4";

  return (
    <div
      className={`fixed z-30 flex flex-col gap-2 rounded-lg border-2 border-primary/40 bg-background/95 backdrop-blur shadow-lg overflow-hidden ${positionClasses}`}
      style={{ width: "180px" }}
    >
      <div className="flex items-center gap-2 px-2 py-1.5 bg-primary/10 border-b border-primary/20">
        <Shield className="h-3.5 w-3.5 text-primary shrink-0" />
        <span className="text-xs font-semibold text-foreground truncate">
          Monitored by {brandName}
        </span>
      </div>
      <div className="relative aspect-video bg-muted">
        <video
          ref={videoRef}
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
};

export default LiveProctoringPreview;
