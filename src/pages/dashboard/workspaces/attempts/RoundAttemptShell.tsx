import { ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, Clock, Loader2, Maximize2, ShieldAlert, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import ProctoringSetupGate, { type ProctoringState } from "@/components/ProctoringSetupGate";
import LiveProctoringPreview from "@/components/LiveProctoringPreview";
import { useAuth } from "@/contexts/AuthContext";
import { useFeatureFlags } from "@/hooks/useFeatureFlags";
import { useProctorFrameCapture } from "@/hooks/useProctorFrameCapture";
import {
  MAX_PROCTORING_STRIKES,
  type ProctoringEventCode,
  type StrikeTerminationMode,
  useProctoringRiskMonitor,
} from "@/hooks/useProctoringRiskMonitor";
import { api } from "@/lib/api";
import UserWorkspaceShell from "../UserWorkspaceShell";

function formatSeconds(total: number) {
  const safe = Math.max(0, total);
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export default function RoundAttemptShell({
  workspaceCode,
  attemptId,
  sessionId,
  testType,
  title,
  subtitle,
  secondsRemaining,
  onExpired,
  isFinalized = false,
  initialProctoringState = null,
  children,
}: {
  workspaceCode: string;
  attemptId: string;
  sessionId: string;
  testType: "aptitude" | "dsa" | "sql";
  title: string;
  subtitle: string;
  secondsRemaining: number | null;
  onExpired?: () => void;
  isFinalized?: boolean;
  initialProctoringState?: ProctoringState | null;
  children: ReactNode;
}) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const {
    loading: flagsLoading,
    error: flagsError,
    refetch: refetchFlags,
    getMode,
  } = useFeatureFlags();
  const [proctoringState, setProctoringState] = useState<ProctoringState | null>(initialProctoringState);
  const [remaining, setRemaining] = useState(secondsRemaining);
  const [isFullScreen, setIsFullScreen] = useState(() => typeof document !== "undefined" && !!document.fullscreenElement);
  const [integrityTerminated, setIntegrityTerminated] = useState(false);
  const proctoringRef = useRef<ProctoringState | null>(null);
  const proctorVideoRef = useRef<HTMLVideoElement | null>(null);
  const cleanedUpRef = useRef(false);
  const terminationRef = useRef(false);

  useEffect(() => {
    if (!initialProctoringState) return;
    cleanedUpRef.current = false;
    proctoringRef.current = initialProctoringState;
    setProctoringState(initialProctoringState);
  }, [initialProctoringState]);

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

  const terminateForProctoring = useCallback(
    async (reason: ProctoringEventCode) => {
      if (terminationRef.current || isFinalized) return;
      terminationRef.current = true;
      setIntegrityTerminated(true);
      stopProctoring();
      try {
        await api.post(
          `/api/user/workspaces/attempts/${encodeURIComponent(attemptId)}/invalidate`,
          { reason },
        );
        toast.error(
          "This round was invalidated after repeated integrity violations.",
          { duration: 8000 },
        );
      } catch (error) {
        toast.error(
          error instanceof Error
            ? error.message
            : "The assessment was stopped, but its final status could not be confirmed.",
          { duration: 8000 },
        );
      } finally {
        navigate(
          `/dashboard/jobseeker/workspaces/${encodeURIComponent(workspaceCode)}`,
          { replace: true },
        );
      }
    },
    [attemptId, isFinalized, navigate, stopProctoring, workspaceCode],
  );

  const flagEnabled = useCallback(
    (name: string) => {
      const mode = getMode(name);
      return mode === "MONITOR" || mode === "STRICT";
    },
    [getMode],
  );
  const proctoringActive = Boolean(proctoringState) && !isFinalized && !integrityTerminated;
  const tabSwitchMode = getMode("tab_switch_detection");
  const strikeTerminationMode = getMode(
    "proctoring_strike_termination",
  ) as StrikeTerminationMode;
  const maxTabSwitches = tabSwitchMode === "STRICT" ? MAX_PROCTORING_STRIKES : 999;
  const { tabSwitchCount, totalLoggedViolations } = useProctoringRiskMonitor({
    enabled: proctoringActive,
    candidateId: user?.id,
    testId: sessionId,
    testType,
    cameraStream: proctoringState?.cameraStream ?? null,
    microphoneStream: proctoringState?.microphoneStream ?? null,
    tabSwitchDetectionEnabled: flagEnabled("tab_switch_detection"),
    copyPasteDetectionEnabled: flagEnabled("copy_paste_detection"),
    devtoolsDetectionEnabled: flagEnabled("devtools_detection"),
    fullscreenDetectionEnabled: flagEnabled("fullscreen_required"),
    multipleFaceDetectionEnabled:
      flagEnabled("multiple_face_detection") || flagEnabled("camera_required"),
    proctorVideoRef,
    microphoneMonitoringEnabled: flagEnabled("microphone_monitoring"),
    maxTabSwitches,
    strikeTerminationMode,
    onProctoringTerminated: (reason) => void terminateForProctoring(reason),
    onMaxTabSwitches: () => void terminateForProctoring("TAB_SWITCH"),
  });

  useProctorFrameCapture({
    enabled: proctoringActive && flagEnabled("screen_recording_enabled"),
    sessionId,
    testType,
    cameraStream: proctoringState?.cameraStream ?? null,
  });

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

  if (flagsLoading) {
    return (
      <UserWorkspaceShell>
        <div className="workspace-dashboard-page workspace-dashboard-page--attempt flex min-h-[420px] items-center justify-center">
          <div className="flex items-center gap-3 text-[var(--dash-text-muted)]">
            <Loader2 className="h-7 w-7 animate-spin text-[var(--dash-gold)]" />
            Loading assessment integrity controls…
          </div>
        </div>
      </UserWorkspaceShell>
    );
  }

  if (flagsError) {
    return (
      <UserWorkspaceShell>
        <div className="workspace-dashboard-page workspace-dashboard-page--attempt">
          <Card className="border-amber-400/30 bg-amber-400/5">
            <CardContent className="space-y-4 p-6 text-amber-100">
              <div className="flex items-start gap-3">
                <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0" />
                <div>
                  <p className="font-semibold">Integrity controls could not be loaded</p>
                  <p className="mt-1 text-sm text-amber-100/80">
                    The assessment has not started. Retry when the connection is stable.
                  </p>
                </div>
              </div>
              <Button onClick={() => void refetchFlags()}>Retry integrity check</Button>
            </CardContent>
          </Card>
        </div>
      </UserWorkspaceShell>
    );
  }

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
          <ProctoringSetupGate
            testName={title}
            enableScreenShare={false}
            requireFullscreen={flagEnabled("fullscreen_required")}
            tabSwitchMode={tabSwitchMode}
            skipSetup={
              !flagEnabled("camera_required") &&
              !flagEnabled("screen_recording_enabled") &&
              !flagEnabled("microphone_monitoring")
            }
            onReady={handleProctoringReady}
          />
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
                Proctored · {totalLoggedViolations} alerts
              </CardContent>
            </Card>
            {flagEnabled("tab_switch_detection") ? (
              <Card className="border-[var(--dash-navy-border)] bg-white/[0.03]">
                <CardContent className="px-3 py-2 text-sm text-[var(--dash-text-muted)]">
                  Tab switches {tabSwitchCount}/{maxTabSwitches === 999 ? "monitored" : maxTabSwitches}
                </CardContent>
              </Card>
            ) : null}
          </div>
        </div>
      </div>
      <main className="workspace-dashboard-page workspace-dashboard-page--attempt">
        <LiveProctoringPreview
          ref={proctorVideoRef}
          cameraStream={proctoringState.cameraStream}
          position="top-right"
        />
        {integrityTerminated ? (
          <div className="workspace-fullscreen-lock">
            <div className="workspace-fullscreen-lock__panel">
              <div className="workspace-fullscreen-lock__icon">
                <ShieldAlert className="h-6 w-6" />
              </div>
              <div>
                <h2>Assessment ended</h2>
                <p>Repeated integrity violations were recorded. Returning to your workspace…</p>
              </div>
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          </div>
        ) : null}
        {!isFinalized && flagEnabled("fullscreen_required") && !isFullScreen ? (
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
