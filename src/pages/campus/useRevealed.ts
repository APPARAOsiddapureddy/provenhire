import { useEffect, useRef, useState } from "react";

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

export function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia(REDUCED_MOTION_QUERY).matches;
}

export function pageIsVisible(): boolean {
  return typeof document === "undefined" || document.visibilityState === "visible";
}

/// Tracks whether an element has entered view yet.
///
/// Everything animated on the campus surfaces is driven from this one hook so
/// there is a single fail-safe path. That matters more than it sounds: an
/// entrance animation must never be able to leave content permanently
/// invisible, and both requestAnimationFrame and CSS keyframes stall in a
/// backgrounded tab. So if the page isn't visible we skip straight to the final
/// state - nobody is watching the motion anyway.
export function useRevealed({ immediate = false }: { immediate?: boolean } = {}) {
  const ref = useRef<HTMLElement | null>(null);
  const [revealed, setRevealed] = useState(() => prefersReducedMotion());

  useEffect(() => {
    if (revealed) return;

    if (!pageIsVisible()) {
      setRevealed(true);
      return;
    }

    if (immediate) {
      // A timer, not requestAnimationFrame: timers still fire when the tab is
      // throttled, rAF does not.
      const timer = window.setTimeout(() => setRevealed(true), 30);
      return () => window.clearTimeout(timer);
    }

    const node = ref.current;
    if (!node) return;
    if (typeof IntersectionObserver === "undefined") {
      setRevealed(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setRevealed(true);
            observer.disconnect();
          }
        }
      },
      // Fire slightly before the element is fully on screen so the motion has
      // finished by the time it is actually being read.
      { rootMargin: "0px 0px -12% 0px", threshold: 0.05 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [revealed, immediate]);

  return { ref, revealed };
}

