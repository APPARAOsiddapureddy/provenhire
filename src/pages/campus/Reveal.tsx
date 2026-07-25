import { useEffect, useRef, useState, type ReactNode } from "react";
import { prefersReducedMotion, pageIsVisible, useRevealed } from "./useRevealed";

/// Fades and lifts its children into view. One-shot and entrance-only -
/// nothing loops or moves while someone is reading.
export function Reveal({
  children,
  delayMs = 0,
  as: Tag = "div",
  className = "",
  /// Distance travelled on entry. "none" fades only - used where a translate
  /// would fight a sticky or absolutely-positioned layout.
  motion = "up",
  /// Animate on mount instead of waiting to scroll into view. Required for
  /// above-the-fold content: gating the hero on scroll leaves it blank for a
  /// beat on first paint, which reads as a broken page.
  immediate = false,
}: {
  children: ReactNode;
  delayMs?: number;
  as?: "div" | "section" | "li" | "span";
  className?: string;
  motion?: "up" | "none";
  immediate?: boolean;
}) {
  const { ref, revealed } = useRevealed({ immediate });
  const hidden = motion === "up" ? "opacity-0 translate-y-5" : "opacity-0";

  return (
    <Tag
      ref={ref as never}
      className={`transition-[opacity,transform] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none ${
        revealed ? "opacity-100 translate-y-0" : hidden
      } ${className}`}
      // The delay must stay applied while transitioning *in*, otherwise the
      // stagger silently does nothing.
      style={delayMs ? { transitionDelay: `${delayMs}ms` } : undefined}
    >
      {children}
    </Tag>
  );
}

/// A bar that grows to `percent` when it scrolls into view.
///
/// Uses a width transition driven by useRevealed rather than a CSS keyframe: a
/// keyframe that is running-but-throttled pins the bar at its 0% frame and
/// overrides any fallback width, so a backgrounded tab would show an empty bar.
export function GrowBar({
  percent,
  className = "",
  delayMs = 0,
}: {
  percent: number;
  className?: string;
  delayMs?: number;
}) {
  const { ref, revealed } = useRevealed();
  return (
    <div
      ref={ref as never}
      className={`h-full transition-[width] duration-1000 ease-out motion-reduce:transition-none ${className}`}
      style={{
        width: revealed ? `${percent}%` : "0%",
        transitionDelay: delayMs ? `${delayMs}ms` : undefined,
      }}
    />
  );
}

/// Counts up to `value` once visible. A static number reads as a screenshot; a
/// counting one reads as a live product.
export function CountUp({
  value,
  durationMs = 1100,
  className = "",
}: {
  value: number;
  durationMs?: number;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement | null>(null);
  const [display, setDisplay] = useState(() => (prefersReducedMotion() ? value : 0));
  const startedRef = useRef(prefersReducedMotion());

  useEffect(() => {
    if (startedRef.current) return;
    const node = ref.current;
    // Same fail-safe as useRevealed: never leave a number stuck at 0 because the
    // tab was backgrounded or the API is unavailable.
    if (!node || typeof IntersectionObserver === "undefined" || !pageIsVisible()) {
      startedRef.current = true;
      setDisplay(value);
      return;
    }

    let frame = 0;
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting) || startedRef.current) return;
        startedRef.current = true;
        observer.disconnect();
        const start = performance.now();
        const tick = (now: number) => {
          const progress = Math.min(1, (now - start) / durationMs);
          // easeOutCubic: quick then settling, so the final value feels landed
          const eased = 1 - Math.pow(1 - progress, 3);
          setDisplay(Math.round(value * eased));
          if (progress < 1) frame = requestAnimationFrame(tick);
          else setDisplay(value);
        };
        frame = requestAnimationFrame(tick);
      },
      { threshold: 0.4 },
    );
    observer.observe(node);
    return () => {
      observer.disconnect();
      if (frame) cancelAnimationFrame(frame);
    };
  }, [value, durationMs]);

  return (
    <span ref={ref} className={className}>
      {display}
    </span>
  );
}
