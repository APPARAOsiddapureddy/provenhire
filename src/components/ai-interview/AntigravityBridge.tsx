/**
 * AntigravityBridge — iframe adapter layer between ProvenHire (Vite/React 18)
 * and the Antigravity module (Next.js 16 / React 19).
 *
 * ADAPTER CONTRACT:
 *   Main App  ←→  AntigravityBridge  ←→  Antigravity (Black Box, never modified)
 *
 * This component is the ONLY place in the ProvenHire codebase that knows about
 * the Antigravity service URL. All cross-boundary communication (auth, navigation
 * events) goes through postMessage so neither side's internals are coupled.
 *
 * Cross-origin note:
 *   Dev:  ProvenHire :8080, Antigravity :3000 — different ports → cross-origin.
 *         CSS injection into the iframe is blocked; styling integration is handled
 *         at the shell level (AntigravityPage.tsx wraps the iframe in ProvenHire's
 *         branded shell).
 *   Prod: Both served under provenhire.com via Vercel rewrites (see vercel.json)
 *         → same-origin, allowing CSS variable injection if needed in the future.
 */

import { useRef, useState, useCallback, useEffect } from "react";
import { PageLoader } from "@/components/PageLoader";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

// ─── Configuration ─────────────────────────────────────────────────────────────

/** URL of the running Antigravity Next.js frontend.
 *  Dev default: http://localhost:3000
 *  Production: set VITE_ANTIGRAVITY_ORIGIN in your Vercel environment.
 */
const ANTIGRAVITY_ORIGIN =
  (import.meta.env.VITE_ANTIGRAVITY_ORIGIN as string | undefined)?.replace(/\/$/, "") ??
  "http://localhost:3000";

// How long to wait for the iframe to signal "ready" before declaring the
// service offline. 12 s is generous enough for a cold Next.js dev-server start.
const LOAD_TIMEOUT_MS = 12_000;

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface AntigravityBridgeProps {
  /** Path within the Antigravity app to load — e.g. "/" | "/dashboard" | "/report/abc" */
  path?: string;
  className?: string;
}

type BridgeStatus = "loading" | "ready" | "error";

// ─── Component ─────────────────────────────────────────────────────────────────

export function AntigravityBridge({ path = "/", className }: AntigravityBridgeProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [status, setStatus] = useState<BridgeStatus>("loading");
  // Bumping `key` remounts the iframe, effectively retrying the load.
  const [key, setKey] = useState(0);

  const src = `${ANTIGRAVITY_ORIGIN}${path}`;

  // ── Timeout guard ───────────────────────────────────────────────────────────
  // `iframe.onError` does NOT fire for network-level failures on cross-origin
  // frames, so we rely on a timeout to detect "service not running".
  useEffect(() => {
    timeoutRef.current = setTimeout(() => setStatus("error"), LOAD_TIMEOUT_MS);
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [key]); // Reset timer whenever we retry (key changes)

  // ── Event handlers ──────────────────────────────────────────────────────────
  const handleLoad = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setStatus("ready");
  }, []);

  const handleError = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setStatus("error");
  }, []);

  const retry = useCallback(() => {
    setStatus("loading");
    setKey((k) => k + 1);
  }, []);

  // ── Auth bridge (postMessage) ────────────────────────────────────────────────
  // When the iframe signals ANTIGRAVITY_READY, we forward the ProvenHire JWT so
  // the module can optionally associate sessions with ProvenHire users without
  // requiring any code changes inside Antigravity — it simply decides whether to
  // consume the token it receives.
  useEffect(() => {
    const handle = (event: MessageEvent) => {
      if (event.origin !== ANTIGRAVITY_ORIGIN) return;
      const { type } = (event.data as { type?: string }) ?? {};
      if (type === "ANTIGRAVITY_READY") {
        iframeRef.current?.contentWindow?.postMessage(
          { type: "PROVENHIRE_AUTH", token: localStorage.getItem("ph_jwt") },
          ANTIGRAVITY_ORIGIN
        );
      }
    };
    window.addEventListener("message", handle);
    return () => window.removeEventListener("message", handle);
  }, []);

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className={`relative flex-1 min-h-0 ${className ?? ""}`}>
      {/* Loading overlay — shown while iframe initialises */}
      {status === "loading" && (
        <div className="absolute inset-0 flex items-center justify-center bg-background z-20 pointer-events-none">
          <PageLoader />
        </div>
      )}

      {/* Error overlay — shown when service is unreachable */}
      {status === "error" && (
        <div className="absolute inset-0 flex items-center justify-center bg-background z-20">
          <div className="text-center space-y-4 max-w-sm px-6">
            <div className="w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center mx-auto">
              <AlertTriangle className="w-5 h-5 text-destructive" />
            </div>
            <div className="space-y-1.5">
              <p className="text-foreground font-semibold text-sm">
                AI Interview Engine Offline
              </p>
              <p className="text-muted-foreground text-xs leading-relaxed">
                Antigravity is not reachable at{" "}
                <code className="text-[hsl(var(--gold))] bg-white/5 px-1 rounded text-[10px]">
                  {ANTIGRAVITY_ORIGIN}
                </code>
                .
                <br />
                Make sure the service is running, then retry.
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={retry} className="gap-2">
              <RefreshCw className="w-3.5 h-3.5" />
              Retry
            </Button>
          </div>
        </div>
      )}

      {/*
        The iframe — black box containing the entire Antigravity Next.js app.

        Permissions granted:
          microphone      — Deepgram Nova-3 ASR (voice input)
          camera          — MediaPipe FaceLandmarker (turn-yield signals)
          autoplay        — ElevenLabs / Cartesia TTS playback
          display-capture — optional screen share

        Sandbox flags:
          allow-scripts       — JavaScript execution
          allow-same-origin   — Deepgram SDK needs localStorage + WebSocket auth
          allow-forms         — resume/role form submission
          allow-popups        — any new-window links
          allow-modals        — alert/confirm/prompt in module
          allow-downloads     — report export (future)

        Security: allow-top-navigation is intentionally OMITTED to prevent the
        iframe from navigating the parent ProvenHire app.
      */}
      <iframe
        key={key}
        ref={iframeRef}
        src={src}
        onLoad={handleLoad}
        onError={handleError}
        title="Antigravity — AI Adversarial Interview Engine"
        allow="microphone; camera; autoplay; display-capture"
        sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals allow-downloads"
        className={`w-full h-full border-0 transition-opacity duration-300 ${
          status === "ready" ? "opacity-100" : "opacity-0"
        }`}
        style={{ display: "block" }}
      />
    </div>
  );
}
