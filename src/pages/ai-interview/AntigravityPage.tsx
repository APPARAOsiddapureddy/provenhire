/**
 * AntigravityPage — UI shell wrapper that integrates the Antigravity module
 * into the ProvenHire application without modifying any Antigravity internals.
 *
 * WRAPPER ARCHITECTURE:
 *
 *  ┌──────────────────────────────────────────────────────┐
 *  │  ProvenHire Shell (this file)                        │
 *  │  ┌────────────────────────────────────────────────┐  │
 *  │  │  Navbar  ─or─  Immersive strip                 │  │
 *  │  ├────────────────────────────────────────────────┤  │
 *  │  │  Gold accent line (visual anchor)              │  │
 *  │  ├────────────────────────────────────────────────┤  │
 *  │  │  AntigravityBridge (iframe)                    │  │
 *  │  │  ┌──────────────────────────────────────────┐  │  │
 *  │  │  │  Antigravity Next.js App  (BLACK BOX)    │  │  │
 *  │  │  │  — never modified, never imported        │  │  │
 *  │  │  └──────────────────────────────────────────┘  │  │
 *  │  └────────────────────────────────────────────────┘  │
 *  └──────────────────────────────────────────────────────┘
 *
 * View types and their Antigravity path mappings:
 *   "home"      → /                  (resume + role setup form)
 *   "interview" → /interview/:id     (live adversarial voice interview)
 *   "report"    → /report/:id        (evaluation report, hire verdict)
 *   "dashboard" → /dashboard         (recruiter session overview)
 *
 * Shell behaviour per view:
 *   "interview"  → Minimal immersive strip (40 px) — no distracting nav
 *   all others   → Full ProvenHire Navbar
 *
 * Style integration (no CSS injected into Antigravity):
 *   Antigravity's native dark theme (zinc/black) harmonises visually with
 *   ProvenHire's deep navy palette. The gold accent line and branded strip
 *   provide the ProvenHire identity context at zero cost.
 */

import { useParams } from "react-router-dom";
import Navbar from "@/components/Navbar";
import { AntigravityBridge } from "@/components/ai-interview/AntigravityBridge";

// ─── Types ─────────────────────────────────────────────────────────────────────

export type AntigravityView = "home" | "interview" | "report" | "dashboard";

interface AntigravityPageProps {
  view: AntigravityView;
}

// ─── Path resolver ──────────────────────────────────────────────────────────────

function resolveAntigravityPath(view: AntigravityView, sessionId?: string): string {
  switch (view) {
    case "home":
      return "/";
    case "dashboard":
      return "/dashboard";
    case "interview":
      // Fallback to home if sessionId is somehow absent (shouldn't happen via router)
      return sessionId ? `/interview/${sessionId}` : "/";
    case "report":
      return sessionId ? `/report/${sessionId}` : "/dashboard";
  }
}

// ─── Shell sub-components ──────────────────────────────────────────────────────

/** Minimal branded strip shown during live interviews so the UI is distraction-free. */
function ImmersiveStrip() {
  return (
    <div
      className="flex items-center px-4 gap-2 shrink-0 border-b border-white/5"
      style={{ height: 40, background: "hsl(var(--navy))" }}
    >
      <span className="text-[hsl(var(--gold))] text-[11px] font-bold tracking-wider uppercase font-mono select-none">
        ProvenHire
      </span>
      <span className="text-white/20 text-xs" aria-hidden>›</span>
      <span className="text-white/40 text-[11px] font-mono">AI Interview</span>
      <div className="ml-auto flex items-center gap-1.5" aria-label="Interview live">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
        <span className="text-emerald-400 text-[10px] font-mono font-semibold tracking-widest">
          LIVE
        </span>
      </div>
    </div>
  );
}

/** 2 px ProvenHire gold accent line — visually anchors the transition between
 *  the ProvenHire chrome and the Antigravity iframe below. */
function AccentDivider() {
  return (
    <div
      className="shrink-0"
      style={{
        height: 2,
        background:
          "linear-gradient(to right, hsl(var(--gold)), hsl(var(--gold) / 0.3), transparent)",
      }}
      aria-hidden
    />
  );
}

// ─── Page component ────────────────────────────────────────────────────────────

export default function AntigravityPage({ view }: AntigravityPageProps) {
  // sessionId is present for "interview" and "report" views
  const { sessionId } = useParams<{ sessionId: string }>();
  const antigravityPath = resolveAntigravityPath(view, sessionId);
  const isImmersive = view === "interview";

  return (
    /*
     * The outer container is exactly viewport-tall with no overflow so that:
     *   1. The ProvenHire shell chrome never scrolls out of view.
     *   2. Scrolling happens inside the iframe (Antigravity handles its own layout).
     *   3. There is no double-scrollbar issue.
     */
    <div
      className="flex flex-col bg-background"
      style={{ height: "100dvh", overflow: "hidden" }}
    >
      {isImmersive ? <ImmersiveStrip /> : <Navbar />}
      <AccentDivider />
      {/*
        AntigravityBridge receives the resolved path and fills all remaining
        vertical space. flex-1 + min-h-0 ensures the iframe stretches to fill
        the container without growing beyond 100dvh.
      */}
      <AntigravityBridge path={antigravityPath} className="flex-1" />
    </div>
  );
}
