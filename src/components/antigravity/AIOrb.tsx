import { useEffect, useRef } from "react";

// ─── Waveform ─────────────────────────────────────────────────────────────────
// Self-animating via rAF — independent of parent render cadence.

export function Waveform({ level, active }: { level: number; active: boolean }) {
  const barsRef = useRef<(HTMLDivElement | null)[]>([]);
  const rafRef = useRef(0);
  const levelRef = useRef(level);
  const activeRef = useRef(active);

  useEffect(() => { levelRef.current = level; }, [level]);
  useEffect(() => { activeRef.current = active; }, [active]);

  useEffect(() => {
    const animate = () => {
      const now = performance.now();
      barsRef.current.forEach((bar, i) => {
        if (!bar) return;
        bar.style.height = activeRef.current
          ? `${Math.abs(Math.sin(now / 150 + i * 0.6)) * levelRef.current * 40 + 4}px`
          : "4px";
      });
      rafRef.current = requestAnimationFrame(animate);
    };
    rafRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  return (
    <div className="flex items-center gap-[3px] h-12">
      {Array.from({ length: 40 }).map((_, i) => (
        <div
          key={i}
          ref={(el) => { barsRef.current[i] = el; }}
          className="w-[3px] rounded-full"
          style={{
            height: "4px",
            background: active
              ? `oklch(${0.72 + i * 0.003} ${0.14 - i * 0.001} ${200 + i * 2})`
              : "rgb(63 63 70)",
            transition: active ? "none" : "background 0.4s",
          }}
        />
      ))}
    </div>
  );
}

// ─── AIOrb ────────────────────────────────────────────────────────────────────

type OrbState = "idle" | "listening" | "thinking" | "speaking";

export function AIOrb({ state }: { state: OrbState }) {
  return (
    <div className="relative flex items-center justify-center w-40 h-40">
      {state === "speaking" && (
        <>
          <div className="absolute inset-0 rounded-full border border-blue-500/20 animate-ping" style={{ animationDuration: "1.5s" }} />
          <div className="absolute inset-[-12px] rounded-full border border-blue-400/10 animate-ping" style={{ animationDuration: "2.2s" }} />
        </>
      )}
      {state === "listening" && (
        <>
          <div className="absolute inset-0 rounded-full border border-white/15 animate-ping" style={{ animationDuration: "2s" }} />
          <div className="absolute inset-[-8px] rounded-full border border-white/5 animate-ping" style={{ animationDuration: "3s" }} />
        </>
      )}
      {state === "idle" && (
        <>
          <div className="absolute inset-0 rounded-full border border-zinc-800/50" />
          <div className="absolute inset-[-6px] rounded-full border border-zinc-900/30" />
        </>
      )}

      <div
        className={`relative w-28 h-28 rounded-full flex items-center justify-center transition-all duration-500 ${
          state === "speaking" ? "shadow-[0_0_60px_rgba(59,130,246,0.4)]"
          : state === "thinking" ? "shadow-[0_0_30px_rgba(245,158,11,0.25)]"
          : state === "listening" ? "shadow-[0_0_40px_rgba(255,255,255,0.08)]"
          : ""
        }`}
        style={{
          background:
            state === "speaking" ? "radial-gradient(circle at 38% 32%, oklch(0.42 0.18 255), oklch(0.13 0.07 255) 72%)"
            : state === "thinking" ? "radial-gradient(circle at 38% 32%, oklch(0.38 0.11 75), oklch(0.10 0.04 75) 72%)"
            : state === "listening" ? "radial-gradient(circle at 38% 32%, oklch(0.28 0.025 265), oklch(0.09 0.01 265) 72%)"
            : "radial-gradient(circle at 38% 32%, oklch(0.14 0.012 265), oklch(0.07 0.005 265) 72%)",
          border:
            state === "speaking" ? "1.5px solid oklch(0.58 0.2 255 / 0.5)"
            : state === "thinking" ? "1.5px solid oklch(0.72 0.15 75 / 0.4)"
            : state === "listening" ? "1.5px solid oklch(0.5 0.02 265 / 0.35)"
            : "1.5px solid oklch(0.22 0.01 265 / 0.7)",
        }}
      >
        <OrbInner state={state} />
      </div>
    </div>
  );
}

function OrbInner({ state }: { state: OrbState }) {
  if (state === "thinking") {
    return (
      <div className="flex gap-1.5">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="w-2.5 h-2.5 rounded-full animate-bounce"
            style={{
              background: "oklch(0.85 0.18 75)",
              animationDelay: `${i * 130}ms`,
              animationDuration: "0.8s",
              boxShadow: "0 0 8px oklch(0.85 0.18 75 / 0.6)",
            }}
          />
        ))}
      </div>
    );
  }
  if (state === "speaking") {
    return (
      <div
        className="w-3 h-3 rounded-full animate-pulse"
        style={{
          background: "oklch(0.9 0.14 255)",
          animationDuration: "1.1s",
          boxShadow: "0 0 20px oklch(0.7 0.2 255), 0 0 40px oklch(0.5 0.15 255 / 0.4)",
        }}
      />
    );
  }
  if (state === "listening") {
    return (
      <div
        className="w-3 h-3 rounded-full"
        style={{
          background: "oklch(0.8 0.02 265)",
          boxShadow: "0 0 14px oklch(0.65 0.02 265 / 0.5)",
        }}
      />
    );
  }
  return <div className="w-2.5 h-2.5 rounded-full" style={{ background: "oklch(0.28 0.01 265)" }} />;
}
