import { useEffect, useRef } from "react";

const BAR_COUNT = 28;

export function Waveform({ level, active }: { level: number; active: boolean }) {
  const barsRef = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    barsRef.current.forEach((bar, i) => {
      if (!bar) return;
      const wave = active
        ? Math.abs(Math.sin(Date.now() / 150 + i * 0.6)) * level * 40 + 4
        : 4;
      bar.style.height = `${wave}px`;
    });
  });

  return (
    <div className="flex items-center gap-[3px] h-12">
      {Array.from({ length: BAR_COUNT }).map((_, i) => (
        <div
          key={i}
          ref={(el) => { barsRef.current[i] = el; }}
          className="w-[3px] rounded-full transition-all duration-75"
          style={{
            height: "4px",
            background: active
              ? `hsl(${200 + i * 3}, 80%, ${55 + (i % 3) * 5}%)`
              : "rgb(63 63 70)",
          }}
        />
      ))}
    </div>
  );
}

export function AIOrb({ state }: { state: "idle" | "listening" | "thinking" | "speaking" }) {
  return (
    <div className="relative flex items-center justify-center w-32 h-32">
      {state === "speaking" && (
        <>
          <div className="absolute inset-0 rounded-full border border-blue-500/20 animate-ping" style={{ animationDuration: "1.5s" }} />
          <div className="absolute inset-[-8px] rounded-full border border-blue-500/10 animate-ping" style={{ animationDuration: "2s" }} />
        </>
      )}
      {state === "listening" && (
        <div className="absolute inset-0 rounded-full border border-white/10 animate-ping" style={{ animationDuration: "2s" }} />
      )}
      <div
        className={`w-24 h-24 rounded-full flex items-center justify-center transition-all duration-500 ${
          state === "speaking"
            ? "bg-blue-600/20 border-2 border-blue-500/60 shadow-[0_0_40px_rgba(59,130,246,0.3)]"
            : state === "thinking"
              ? "bg-amber-600/10 border-2 border-amber-500/40 shadow-[0_0_20px_rgba(245,158,11,0.2)]"
              : state === "listening"
                ? "bg-white/5 border-2 border-white/30"
                : "bg-zinc-900 border-2 border-zinc-700"
        }`}
      >
        <OrbIcon state={state} />
      </div>
    </div>
  );
}

function OrbIcon({ state }: { state: string }) {
  if (state === "thinking") {
    return (
      <div className="flex gap-1">
        {[0, 1, 2].map((i) => (
          <div key={i} className="w-2 h-2 rounded-full bg-amber-400 animate-bounce" style={{ animationDelay: `${i * 150}ms` }} />
        ))}
      </div>
    );
  }
  if (state === "speaking") {
    return (
      <svg className="w-8 h-8 text-blue-400" fill="none" viewBox="0 0 24 24">
        <path d="M12 2a3 3 0 013 3v6a3 3 0 01-6 0V5a3 3 0 013-3z" fill="currentColor" opacity="0.8" />
        <path d="M5 10a7 7 0 0014 0" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        <line x1="12" y1="21" x2="12" y2="17" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        <line x1="8" y1="21" x2="16" y2="21" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    );
  }
  if (state === "listening") {
    return (
      <svg className="w-8 h-8 text-white/70" fill="none" viewBox="0 0 24 24">
        <path d="M12 2a3 3 0 013 3v6a3 3 0 01-6 0V5a3 3 0 013-3z" stroke="currentColor" strokeWidth="1.5" />
        <path d="M5 10a7 7 0 0014 0" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        <line x1="12" y1="21" x2="12" y2="17" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        <line x1="8" y1="21" x2="16" y2="21" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    );
  }
  return (
    <svg className="w-7 h-7 text-zinc-600" fill="none" viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}
