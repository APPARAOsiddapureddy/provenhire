import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { AlertTriangle, ArrowLeft, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
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

export default function WorkspaceRoundAttemptPage() {
  const { code = "", roundId = "" } = useParams<{
    code: string;
    roundId: string;
  }>();
  const navigate = useNavigate();
  const [attempt, setAttempt] = useState<StartAttemptResponse | null>(null);
  const [launchError, setLaunchError] = useState("");
  const [launching, setLaunching] = useState(false);
  const placementLaunchStarted = useRef(false);
  const workspaceCode = decodeURIComponent(code).trim().toUpperCase();

  useEffect(() => {
    const start = async () => {
      try {
        const res = await api.post<StartAttemptResponse>(
          `/api/user/workspaces/code/${encodeURIComponent(workspaceCode)}/rounds/${encodeURIComponent(roundId)}/start`,
          {},
        );
        setAttempt(res);
      } catch (error) {
        toast.error(
          error instanceof Error
            ? error.message
            : "Could not start workspace round",
        );
        navigate(
          `/dashboard/jobseeker/workspaces/${encodeURIComponent(workspaceCode)}`,
        );
      }
    };
    if (workspaceCode && roundId) void start();
  }, [workspaceCode, roundId, navigate]);

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
    return (
      <UserWorkspaceShell>
        <div className="min-h-[420px] flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-[var(--dash-gold)]" />
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
      />
    );
  }
  if (attempt.roundType === "coding") {
    return (
      <DsaRoundRunner
        workspaceCode={workspaceCode}
        attemptId={attempt.attemptId}
        sessionId={attempt.sessionId}
      />
    );
  }
  if (attempt.roundType === "sql") {
    return (
      <SqlRoundRunner
        workspaceCode={workspaceCode}
        attemptId={attempt.attemptId}
        sessionId={attempt.sessionId}
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
                Placement Readiness did not open
              </h1>
              <p className="mt-2 text-sm leading-6 text-[var(--dash-text-muted)]">
                Your workspace attempt is safe. Retry the launch, or return to
                the workspace and continue later.
              </p>
              <p className="mt-2 text-xs text-amber-200">{launchError}</p>
              <div className="mt-5 flex justify-center gap-3">
                <Button variant="outline" onClick={() => navigate(`/dashboard/jobseeker/workspaces/${encodeURIComponent(workspaceCode)}`)}>
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Workspace
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
