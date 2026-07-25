import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { AlertTriangle, ArrowLeft, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import ProctoringSetupGate, { type ProctoringState } from "@/components/ProctoringSetupGate";
import { useFeatureFlags } from "@/hooks/useFeatureFlags";
import UserWorkspaceShell from "./UserWorkspaceShell";
import McqRoundRunner from "./attempts/McqRoundRunner";
import DsaRoundRunner from "./attempts/DsaRoundRunner";
import SqlRoundRunner from "./attempts/SqlRoundRunner";

type StartAttemptResponse = {
  roundType: "mcq" | "coding" | "interview" | "sql";
  attemptId: string;
  sessionId: string;
  sessionStatus: string;
  targetRole?: string;
};

type RoundPreview = {
  id: string;
  name: string;
  type: StartAttemptResponse["roundType"];
};

export default function WorkspaceRoundAttemptPage() {
  const { code = "", roundId = "" } = useParams<{
    code: string;
    roundId: string;
  }>();
  const navigate = useNavigate();
  const [attempt, setAttempt] = useState<StartAttemptResponse | null>(null);
  const [roundPreview, setRoundPreview] = useState<RoundPreview | null>(null);
  const [preparing, setPreparing] = useState(true);
  const [preparationError, setPreparationError] = useState("");
  const [startingAttempt, setStartingAttempt] = useState(false);
  const [initialProctoringState, setInitialProctoringState] = useState<ProctoringState | null>(null);
  const [launchError, setLaunchError] = useState("");
  const [launching, setLaunching] = useState(false);
  const placementLaunchStarted = useRef(false);
  const interviewAttemptStarted = useRef(false);
  const workspaceCode = decodeURIComponent(code).trim().toUpperCase();
  const { loading: flagsLoading, error: flagsError, refetch: refetchFlags, getMode } = useFeatureFlags();
  const flagEnabled = useCallback((name: string) => {
    const mode = getMode(name);
    return mode === "MONITOR" || mode === "STRICT";
  }, [getMode]);

  useEffect(() => {
    const prepare = async () => {
      setPreparing(true);
      setPreparationError("");
      try {
        const res = await api.get<{ workspace: { rounds: RoundPreview[] } }>(
          `/api/user/workspaces/code/${encodeURIComponent(workspaceCode)}/me`,
        );
        const round = res.workspace.rounds.find((item) => item.id === roundId);
        if (!round) throw new Error("This assessment round could not be found.");
        setRoundPreview(round);
      } catch (error) {
        const message = error instanceof Error ? error.message : "We could not prepare this assessment round.";
        setPreparationError(message);
        toast.error(message);
      } finally {
        setPreparing(false);
      }
    };
    if (workspaceCode && roundId) void prepare();
  }, [workspaceCode, roundId]);

  const startAttempt = useCallback(async (proctoringState: ProctoringState | null) => {
    setStartingAttempt(true);
    setPreparationError("");
    if (proctoringState) setInitialProctoringState(proctoringState);
    try {
      const res = await api.post<StartAttemptResponse>(
        `/api/user/workspaces/code/${encodeURIComponent(workspaceCode)}/rounds/${encodeURIComponent(roundId)}/start`,
        {},
      );
      setAttempt(res);
    } catch (error) {
      const streams = new Set<MediaStream>();
      if (proctoringState?.cameraStream) streams.add(proctoringState.cameraStream);
      if (proctoringState?.microphoneStream) streams.add(proctoringState.microphoneStream);
      if (proctoringState?.screenStream) streams.add(proctoringState.screenStream);
      streams.forEach((stream) => stream.getTracks().forEach((track) => track.stop()));
      setInitialProctoringState(null);
      const message = error instanceof Error ? error.message : "We could not start this assessment round.";
      setPreparationError(message);
      toast.error(message);
    } finally {
      setStartingAttempt(false);
    }
  }, [roundId, workspaceCode]);

  useEffect(() => {
    if (roundPreview?.type !== "interview" || interviewAttemptStarted.current) return;
    interviewAttemptStarted.current = true;
    void startAttempt(null);
  }, [roundPreview, startAttempt]);

  const launchPlacement = useCallback(async () => {
    if (attempt?.roundType !== "interview") return;
    setLaunching(true);
    setLaunchError("");
    try {
      const response = await api.post<{ launch_url: string }>(
        "/api/placement-readiness/handoff-launch",
        { workspace_attempt_id: attempt.attemptId },
      );
      window.location.assign(response.launch_url);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Could not open Placement Readiness.";
      setLaunchError(message);
      toast.error(message);
      setLaunching(false);
    }
  }, [attempt]);

  useEffect(() => {
    if (attempt?.roundType !== "interview" || placementLaunchStarted.current) return;
    placementLaunchStarted.current = true;
    void launchPlacement();
  }, [attempt, launchPlacement]);

  if (!attempt) {
    if (preparing || startingAttempt || roundPreview?.type === "interview") {
      return (
        <UserWorkspaceShell>
          <div role="status" aria-live="polite" className="min-h-[420px] flex items-center justify-center gap-3 text-[var(--dash-text-muted)]">
            <Loader2 className="h-8 w-8 animate-spin text-[var(--dash-gold)]" />
            {startingAttempt ? "Starting your assessment…" : "Preparing your assessment…"}
          </div>
        </UserWorkspaceShell>
      );
    }
    if (preparationError || flagsError || !roundPreview) {
      return (
        <UserWorkspaceShell>
          <div className="workspace-dashboard-page min-h-[420px] flex items-center justify-center p-6">
            <div role="alert" className="w-full max-w-lg rounded-xl border border-amber-400/30 bg-amber-400/5 p-6 text-center">
              <AlertTriangle className="mx-auto h-9 w-9 text-amber-300" />
              <h1 className="mt-4 text-lg font-semibold text-[var(--dash-text-primary)]">We could not prepare this assessment</h1>
              <p className="mt-2 text-sm leading-6 text-[var(--dash-text-muted)]">The timer has not started. Check your connection and try again.</p>
              <p className="mt-2 text-xs text-amber-200">{preparationError || flagsError}</p>
              <div className="mt-5 flex flex-wrap justify-center gap-3">
                <Button variant="outline" onClick={() => navigate(`/dashboard/jobseeker/workspaces/${encodeURIComponent(workspaceCode)}`)}><ArrowLeft className="mr-2 h-4 w-4" />Back to assessment</Button>
                {flagsError ? <Button onClick={() => void refetchFlags()}>Retry integrity check</Button> : <Button onClick={() => window.location.reload()}>Try again</Button>}
              </div>
            </div>
          </div>
        </UserWorkspaceShell>
      );
    }
    if (flagsLoading) {
      return (
        <UserWorkspaceShell>
          <div role="status" aria-live="polite" className="min-h-[420px] flex items-center justify-center gap-3 text-[var(--dash-text-muted)]"><Loader2 className="h-8 w-8 animate-spin text-[var(--dash-gold)]" />Loading assessment integrity controls…</div>
        </UserWorkspaceShell>
      );
    }
    return (
      <UserWorkspaceShell>
        <div className="workspace-dashboard-page workspace-dashboard-page--attempt space-y-5">
          <Button variant="outline" size="sm" onClick={() => navigate(`/dashboard/jobseeker/workspaces/${encodeURIComponent(workspaceCode)}`)}><ArrowLeft className="mr-2 h-4 w-4" />Back to assessment</Button>
          <ProctoringSetupGate
            testName={roundPreview.name}
            enableScreenShare={false}
            requireFullscreen={flagEnabled("fullscreen_required")}
            tabSwitchMode={getMode("tab_switch_detection") as "OFF" | "MONITOR" | "STRICT"}
            skipSetup={!flagEnabled("camera_required") && !flagEnabled("screen_recording_enabled") && !flagEnabled("microphone_monitoring")}
            onReady={(state) => void startAttempt(state)}
          />
        </div>
      </UserWorkspaceShell>
    );
  }

  if (attempt.roundType === "mcq") {
    return (
      <McqRoundRunner
        workspaceCode={workspaceCode}
        attemptId={attempt.attemptId}
        sessionId={attempt.sessionId}
        initialProctoringState={initialProctoringState}
      />
    );
  }
  if (attempt.roundType === "coding") {
    return (
      <DsaRoundRunner
        workspaceCode={workspaceCode}
        attemptId={attempt.attemptId}
        sessionId={attempt.sessionId}
        initialProctoringState={initialProctoringState}
      />
    );
  }
  if (attempt.roundType === "sql") {
    return (
      <SqlRoundRunner
        workspaceCode={workspaceCode}
        attemptId={attempt.attemptId}
        sessionId={attempt.sessionId}
        initialProctoringState={initialProctoringState}
      />
    );
  }
  if (attempt.roundType === "interview") {
    return (
      <UserWorkspaceShell>
        <div className="min-h-[420px] flex items-center justify-center p-6">
          {launchError ? (
            <div className="w-full max-w-lg rounded-xl border border-amber-400/30 bg-amber-400/5 p-6 text-center">
              <AlertTriangle className="mx-auto h-9 w-9 text-amber-300" />
              <h1 className="mt-4 text-lg font-semibold text-[var(--dash-text-primary)]">
                We could not open the interview
              </h1>
              <p className="mt-2 text-sm leading-6 text-[var(--dash-text-muted)]">
                Your interview attempt is safe. Retry the launch, or return to
                the assessment and continue later.
              </p>
              <p className="mt-2 text-xs text-amber-200">{launchError}</p>
              <div className="mt-5 flex justify-center gap-3">
                <Button variant="outline" onClick={() => navigate(`/dashboard/jobseeker/workspaces/${encodeURIComponent(workspaceCode)}`)}>
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Back to assessment
                </Button>
                <Button onClick={() => void launchPlacement()} disabled={launching}>
                  {launching ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Retry launch
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-3 text-[var(--dash-text-muted)]">
              <Loader2 className="h-8 w-8 animate-spin text-[var(--dash-gold)]" />
              Opening ProvenHire Placement Readiness…
            </div>
          )}
        </div>
      </UserWorkspaceShell>
    );
  }

  return (
    <UserWorkspaceShell>
      <div className="rounded-lg border border-[var(--dash-navy-border)] bg-white/[0.03] p-6 text-[var(--dash-text-muted)]">
        This round type is not available yet.
      </div>
    </UserWorkspaceShell>
  );
}
