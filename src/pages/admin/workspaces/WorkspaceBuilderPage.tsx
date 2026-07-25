import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { ArrowLeft, CheckCircle2, ClipboardList, Loader2 } from "lucide-react";
import type { Workspace, WorkspaceDetailsDraft, WorkspaceRound, WorkspaceRoundDraft } from "./types";
import { RoundConfigStep, WorkspaceDetailsStep, WorkspaceProgress, WorkspaceReviewStep } from "./WorkspaceAdminComponents";
import {
  defaultWorkspaceDetails,
  normalizeRounds,
  parseIntegerDraft,
  roundsToPayload,
  validateRounds,
  validateWorkspaceDetails,
  detailsFromWorkspace,
  workspaceDetailsToPayload,
} from "./workspaceUtils";

export default function WorkspaceBuilderPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const resumeWorkspaceId = searchParams.get("workspaceId");
  const [step, setStep] = useState(1);
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [details, setDetails] = useState<WorkspaceDetailsDraft>(() => defaultWorkspaceDetails());
  const [rounds, setRounds] = useState<WorkspaceRoundDraft[]>(() => normalizeRounds(undefined, 1));
  const [loading, setLoading] = useState(!!resumeWorkspaceId);
  const [savingDetails, setSavingDetails] = useState(false);
  const [savingRounds, setSavingRounds] = useState(false);
  const [publishing, setPublishing] = useState(false);

  useEffect(() => {
    if (!resumeWorkspaceId) return;
    setLoading(true);
    api
      .get<{ workspace: Workspace }>(`/api/workspaces/${resumeWorkspaceId}`)
      .then((res) => {
        setWorkspace(res.workspace);
        setDetails(detailsFromWorkspace(res.workspace));
        setRounds(normalizeRounds(res.workspace.rounds, res.workspace.totalRounds));
        setStep((res.workspace.rounds?.length ?? 0) === res.workspace.totalRounds ? 3 : 2);
      })
      .catch((error) => {
        toast.error(error instanceof Error ? error.message : "Failed to load draft assessment");
        navigate("/admin/workspaces");
      })
      .finally(() => setLoading(false));
  }, [resumeWorkspaceId, navigate]);

  useEffect(() => {
    const totalRounds = parseIntegerDraft(details.totalRounds, 1, 5);
    if (totalRounds != null) {
      setRounds((prev) => normalizeRounds(prev, totalRounds));
    }
  }, [details.totalRounds]);

  const saveDetails = async () => {
    const validation = validateWorkspaceDetails(details);
    if (validation) {
      toast.error(validation);
      return;
    }
    setSavingDetails(true);
    try {
      const payload = workspaceDetailsToPayload(details);
      if (!payload) {
        toast.error("Total rounds must be between 1 and 5.");
        return;
      }
      const res = workspace
        ? await api.patch<{ workspace: Workspace }>(`/api/workspaces/${workspace.id}`, payload)
        : await api.post<{ workspace: Workspace }>("/api/workspaces", payload);
      setWorkspace(res.workspace);
      setDetails(detailsFromWorkspace(res.workspace));
      setRounds((prev) => normalizeRounds(prev, res.workspace.totalRounds));
      setStep(2);
      toast.success("Assessment draft saved.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save assessment");
    } finally {
      setSavingDetails(false);
    }
  };

  const saveRounds = async () => {
    if (!workspace) {
      toast.error("Save assessment details first.");
      setStep(1);
      return;
    }
    const totalRounds = parseIntegerDraft(details.totalRounds, 1, 5) ?? 0;
    const validation = validateRounds(rounds, totalRounds);
    if (validation) {
      toast.error(validation);
      return;
    }
    setSavingRounds(true);
    try {
      const payloadRounds = roundsToPayload(rounds);
      if (!payloadRounds) {
        toast.error("Round numeric fields must be valid whole numbers.");
        return;
      }
      const res = await api.put<{ rounds: WorkspaceRound[] }>(`/api/workspaces/${workspace.id}/rounds`, {
        rounds: payloadRounds.map((round) => ({ ...round, name: round.name.trim(), questionType: round.questionType ?? "random" })),
      });
      const nextWorkspace = { ...workspace, rounds: res.rounds };
      setWorkspace(nextWorkspace);
      setRounds(normalizeRounds(res.rounds, totalRounds));
      setStep(3);
      toast.success("Round configuration saved.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save rounds");
    } finally {
      setSavingRounds(false);
    }
  };

  const publishWorkspace = async () => {
    if (!workspace) return;
    setPublishing(true);
    try {
      const res = await api.post<{ workspace: Workspace; code: string }>(`/api/workspaces/${workspace.id}/publish`, {});
      toast.success("Assessment published.");
      navigate(`/admin/workspaces/${res.workspace.id}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to publish assessment");
    } finally {
      setPublishing(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-muted/30 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const locked = workspace?.status !== undefined && workspace.status !== "draft";

  return (
    <div className="min-h-screen bg-muted/30">
      <header className="bg-background border-b border-border sticky top-0 z-50">
        <div className="container mx-auto px-4 sm:px-6 py-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3 min-w-0">
              <Button variant="outline" size="sm" onClick={() => navigate("/admin/workspaces")}>
                <ArrowLeft className="h-4 w-4 sm:mr-2" />
                <span className="hidden sm:inline">Assessments</span>
              </Button>
              <div className="min-w-0">
                <h1 className="text-lg sm:text-xl font-bold truncate">{workspace ? "Continue assessment setup" : "Create assessment"}</h1>
                <p className="text-xs sm:text-sm text-muted-foreground">
                  {workspace?.code ? `Invitation code: ${workspace.code}` : "Add the details and rounds candidates will receive"}
                </p>
              </div>
            </div>
            {workspace?.status && (
              <Button variant="outline" size="sm" onClick={() => navigate(`/admin/workspaces/${workspace.id}`)} disabled={!workspace}>
                <ClipboardList className="h-4 w-4 mr-2" />
                Open assessment
              </Button>
            )}
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 sm:px-6 py-6 sm:py-8 max-w-5xl space-y-5">
        <WorkspaceProgress step={step} />

        {locked && (
          <div className="rounded-md border bg-background p-4 text-sm text-muted-foreground">
            This assessment is already published. Its details, access rules, and rounds are read-only.
          </div>
        )}

        {step === 1 && (
          <WorkspaceDetailsStep
            value={details}
            onChange={setDetails}
            onSave={saveDetails}
            saving={savingDetails}
            locked={locked}
            workspaceCode={workspace?.code}
          />
        )}

        {step === 2 && (
          <RoundConfigStep
            rounds={rounds}
            totalRounds={parseIntegerDraft(details.totalRounds, 1, 5) ?? 0}
            onChange={setRounds}
            onSave={saveRounds}
            saving={savingRounds}
            locked={locked}
          />
        )}

        {step === 3 && workspace && (
          <WorkspaceReviewStep
            workspace={workspace}
            details={details}
            rounds={rounds}
            publishing={publishing}
            onPublish={publishWorkspace}
            onBackToRounds={() => setStep(2)}
          />
        )}

        <div className="flex justify-between">
          <Button variant="outline" disabled={step === 1} onClick={() => setStep((s) => Math.max(1, s - 1))}>
            Back
          </Button>
          {step === 1 && (
            <Button
              variant="outline"
              disabled={savingDetails || locked || !!validateWorkspaceDetails(details)}
              onClick={saveDetails}
            >
              <CheckCircle2 className="h-4 w-4 mr-2" />
              Save & Next
            </Button>
          )}
          {step === 2 && (
            <Button
              variant="outline"
              disabled={savingRounds || locked || !workspace || !!validateRounds(rounds, parseIntegerDraft(details.totalRounds, 1, 5) ?? 0)}
              onClick={saveRounds}
            >
              <CheckCircle2 className="h-4 w-4 mr-2" />
              Save & Review
            </Button>
          )}
        </div>
      </main>
    </div>
  );
}
