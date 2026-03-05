import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Maximize2 } from "lucide-react";
import { toast } from "sonner";

interface FullScreenMonitorProps {
  /** Whether monitoring is active (e.g. during a test) */
  active?: boolean;
  /** Toast message when user exits fullscreen */
  exitMessage?: string;
}

/**
 * Shows an "Enter Full Screen" button when not in fullscreen during a test.
 * Listens for fullscreen exit and shows a toast. Button click = user gesture for requestFullscreen.
 */
export default function FullScreenMonitor({
  active = true,
  exitMessage = "Please stay in full screen during the test.",
}: FullScreenMonitorProps) {
  const [isFullScreen, setIsFullScreen] = useState(!!document.fullscreenElement);

  useEffect(() => {
    if (!active) return;

    const handler = () => {
      const now = !!document.fullscreenElement;
      setIsFullScreen(now);
      if (!now) toast.warning(exitMessage);
    };

    document.addEventListener("fullscreenchange", handler);
    setIsFullScreen(!!document.fullscreenElement);

    return () => document.removeEventListener("fullscreenchange", handler);
  }, [active, exitMessage]);

  const handleEnterFullScreen = async () => {
    try {
      await document.documentElement.requestFullscreen();
    } catch {
      toast.error("Full screen could not be enabled. Some browsers block it.");
    }
  };

  if (!active || isFullScreen) return null;

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleEnterFullScreen}
      className="gap-1.5 text-amber-600 border-amber-500/50 hover:bg-amber-500/10"
    >
      <Maximize2 className="h-4 w-4" />
      Enter Full Screen
    </Button>
  );
}
