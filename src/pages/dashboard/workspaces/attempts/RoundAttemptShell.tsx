import { ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Clock, Maximize2, ShieldAlert, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import ProctoringSetupGate, { type ProctoringState } from "@/components/ProctoringSetupGate";
import UserWorkspaceShell from "../UserWorkspaceShell";

function formatSeconds(total: number) {
  const safe = Math.max(0, total);
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export default function RoundAttemptShell({
  workspaceCode,
  title,
  subtitle,
  secondsRemaining,
  onExpired,
  isFinalized = false,
  children,
}: {
  workspaceCode: string;
  title: string;
  subtitle: string;
  secondsRemaining: number | null;
  onExpired?: () => void;
  isFinalized?: boolean;
  children: ReactNode;
}) {
  const [proctoringState, setProctoringState] = useState<ProctoringState | null>(null);
  const [remaining, setRemaining] = useState(secondsRemaining);
  const [isFullScreen, setIsFullScreen] = useState(() => typeof document !== "undefined" && !!document.fullscreenElement);
  const proctoringRef = useRef<ProctoringState | null>(null);
  const cleanedUpRef = useRef(false);

  const stopProctoring = useCallback(() => {
    if (cleanedUpRef.current) return;
    cleanedUpRef.current = true;

    const tracks = new Set<MediaStreamTrack>();
    const state = proctoringRef.current;
    state?.screenStream?.getTracks().forEach((track) => tracks.add(track));
    state?.cameraStream?.getTracks().forEach((track) => tracks.add(track));
    state?.microphoneStream?.getTracks().forEach((track) => tracks.add(track));
    tracks.forEach((track) => track.stop());
    proctoringRef.current = null;

    if (typeof document !== "undefined" && document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    }
  }, []);

  const handleProctoringReady = useCallback((state: ProctoringState) => {
    cleanedUpRef.current = false;
    proctoringRef.current = state;
    setProctoringState(state);
  }, []);

  useEffect(() => {
    setRemaining(secondsRemaining);
  }, [secondsRemaining]);

  useEffect(() => {
    return () => stopProctoring();
  }, [stopProctoring]);

  useEffect(() => {
    const syncFullscreen = () => setIsFullScreen(!!document.fullscreenElement);
    syncFullscreen();
    document.addEventListener("fullscreenchange", syncFullscreen);
    return () => document.removeEventListener("fullscreenchange", syncFullscreen);
  }, []);

  useEffect(() => {
    if (isFinalized) stopProctoring();
  }, [isFinalized, stopProctoring]);

  useEffect(() => {
    if (remaining == null || remaining <= 0) return;
    const timer = window.setInterval(() => {
      setRemaining((current) => {
        if (current == null) return current;
        if (current <= 1) {
          window.clearInterval(timer);
          onExpired?.();
          return 0;
        }
        return current - 1;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [remaining, onExpired]);

  const timerClass = useMemo(() => {
    if (remaining == null) return "text-[var(--dash-text-muted)]";
    if (remaining <= 60) return "text-red-200";
    if (remaining <= 300) return "text-amber-200";
    return "text-[var(--dash-gold)]";
  }, [remaining]);

  const enterFullscreen = async () => {
    try {
      await document.documentElement.requestFullscreen();
      setIsFullScreen(!!document.fullscreenElement);
    } catch {
      // The setup gate already explains the requirement; this button is a focused retry.
    }
  };

  if (!proctoringState) {
    return (
      <UserWorkspaceShell>
        <div className="workspace-dashboard-page workspace-dashboard-page--attempt space-y-5">
          <Button variant="outline" size="sm" asChild>
            <Link to={`/dashboard/jobseeker/workspaces/${encodeURIComponent(workspaceCode)}`}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Workspace
            </Link>
          </Button>
          <ProctoringSetupGate testName={title} onReady={handleProctoringReady} />
        </div>
      </UserWorkspaceShell>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--dash-navy)] text-[var(--dash-text-primary)]">
      <div className="sticky top-0 z-30 border-b border-[var(--dash-navy-border)] bg-[var(--dash-navy)]/95 px-4 py-3 backdrop-blur">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <Button variant="outline" size="sm" asChild>
              <Link to={`/dashboard/jobseeker/workspaces/${encodeURIComponent(workspaceCode)}`}>
                <ArrowLeft className="h-4 w-4 mr-2" />
                Workspace
              </Link>
            </Button>
            <h1 className="mt-3 text-2xl font-semibold text-[var(--dash-text-primary)]">{title}</h1>
            <p className="text-sm text-[var(--dash-text-muted)]">{subtitle}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Card className="border-[var(--dash-navy-border)] bg-white/[0.03]">
              <CardContent className="px-3 py-2 flex items-center gap-2">
                <Clock className="h-4 w-4 text-[var(--dash-gold)]" />
                <span className={`font-mono text-sm ${timerClass}`}>{remaining == null ? "--:--" : formatSeconds(remaining)}</span>
              </CardContent>
            </Card>
            <Card className="border-emerald-400/30 bg-emerald-400/10">
              <CardContent className="px-3 py-2 flex items-center gap-2 text-sm text-emerald-100">
                <ShieldCheck className="h-4 w-4" />
                Proctored
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
      <main className="workspace-dashboard-page workspace-dashboard-page--attempt">
        {!isFinalized && !isFullScreen ? (
          <div className="workspace-fullscreen-lock">
            <div className="workspace-fullscreen-lock__panel">
              <div className="workspace-fullscreen-lock__icon">
                <ShieldAlert className="h-6 w-6" />
              </div>
              <div>
                <h2>Fullscreen required</h2>
                <p>This proctored round must stay in fullscreen mode. Re-enter fullscreen to continue the attempt.</p>
              </div>
              <Button onClick={enterFullscreen}>
                <Maximize2 className="mr-2 h-4 w-4" />
                Enter fullscreen
              </Button>
            </div>
          </div>
        ) : null}
        {children}
      </main>
    </div>
  );
}
