import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import UserWorkspaceShell from "./UserWorkspaceShell";
import McqRoundRunner from "./attempts/McqRoundRunner";
import DsaRoundRunner from "./attempts/DsaRoundRunner";

type StartAttemptResponse = {
  roundType: "mcq" | "coding" | "interview";
  attemptId: string;
  sessionId: string;
  sessionStatus: string;
};

export default function WorkspaceRoundAttemptPage() {
  const { code = "", roundId = "" } = useParams<{ code: string; roundId: string }>();
  const navigate = useNavigate();
  const [attempt, setAttempt] = useState<StartAttemptResponse | null>(null);
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
        toast.error(error instanceof Error ? error.message : "Could not start workspace round");
        navigate(`/dashboard/jobseeker/workspaces/${encodeURIComponent(workspaceCode)}`);
      }
    };
    if (workspaceCode && roundId) void start();
  }, [workspaceCode, roundId, navigate]);

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
    return <McqRoundRunner workspaceCode={workspaceCode} sessionId={attempt.sessionId} />;
  }
  if (attempt.roundType === "coding") {
    return <DsaRoundRunner workspaceCode={workspaceCode} sessionId={attempt.sessionId} />;
  }

  return (
    <UserWorkspaceShell>
      <div className="rounded-lg border border-[var(--dash-navy-border)] bg-white/[0.03] p-6 text-[var(--dash-text-muted)]">
        This round type is not available yet.
      </div>
    </UserWorkspaceShell>
  );
}
