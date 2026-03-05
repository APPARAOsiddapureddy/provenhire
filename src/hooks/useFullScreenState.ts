import { useState, useEffect } from "react";

/**
 * Returns current fullscreen state. Use to block navigation/submit when user exits fullscreen.
 */
export function useFullScreenState(active = true): boolean {
  const [isFullScreen, setIsFullScreen] = useState(
    () => (typeof document !== "undefined" ? !!document.fullscreenElement : true)
  );

  useEffect(() => {
    if (!active) {
      setIsFullScreen(true); // when not active, treat as "allowed"
      return;
    }

    const handler = () => setIsFullScreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", handler);
    setIsFullScreen(!!document.fullscreenElement);

    return () => document.removeEventListener("fullscreenchange", handler);
  }, [active]);

  return isFullScreen;
}
