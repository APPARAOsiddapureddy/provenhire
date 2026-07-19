import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
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

  useEffect(() => {
    if (attempt?.roundType !== "interview" || placementLaunchStarted.current) return;
    placementLaunchStarted.current = true;
    void api.post<{ launch_url: string }>("/api/placement-readiness/handoff-launch", {
      workspace_attempt_id: attempt.attemptId,
    }).then((response) => {
      window.location.assign(response.launch_url);
    }).catch((error) => {
      toast.error(error instanceof Error ? error.message : "Could not open Placement Readiness.");
      navigate(`/dashboard/jobseeker/workspaces/${encodeURIComponent(workspaceCode)}`, { replace: true });
    });
  }, [attempt, navigate, workspaceCode]);

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
        sessionId={attempt.sessionId}
      />
    );
  }
  if (attempt.roundType === "coding") {
    return (
      <DsaRoundRunner
        workspaceCode={workspaceCode}
        sessionId={attempt.sessionId}
      />
    );
  }
  if (attempt.roundType === "sql") {
    return (
      <SqlRoundRunner
        workspaceCode={workspaceCode}
        sessionId={attempt.sessionId}
      />
    );
  }
  if (attempt.roundType === "interview") {
    return (
      <UserWorkspaceShell>
        <div className="min-h-[420px] flex items-center justify-center gap-3 text-[var(--dash-text-muted)]">
          <Loader2 className="h-8 w-8 animate-spin text-[var(--dash-gold)]" />
          Opening ProvenHire Placement Readiness…
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
