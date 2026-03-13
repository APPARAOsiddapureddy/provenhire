/**
 * Skill Verification Panel - shows status for Aptitude, Live Coding, AI Interview, Human Interview.
 * All rows are driven by verificationStages so status updates as the user completes each step.
 */
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle, XCircle, Clock, Play } from "lucide-react";

/** Pipeline order for technical track. */
const TECHNICAL_VERIFICATION_STAGE_ORDER = [
  "aptitude_test",
  "dsa_round",
  "expert_interview",
  "human_expert_interview",
] as const;
const STAGE_TO_LABEL: Record<string, string> = {
  aptitude_test: "Aptitude Verification",
  dsa_round: "Live Coding Verification",
  expert_interview: "AI Interview Verification",
  human_expert_interview: "Human Interview Verification",
};

export type VerificationStageLike = { stage_name?: string; status?: string };

type SkillVerificationPanelProps = {
  verificationStages?: VerificationStageLike[];
  roleType?: "technical" | "non_technical";
};

function getStageStatus(stages: VerificationStageLike[], stageName: string): "completed" | "failed" | "in_progress" | "pending" {
  const stage = stages.find((s) => (s.stage_name ?? "") === stageName);
  if (!stage) return "pending";
  if (stage.status === "completed") return "completed";
  if (stage.status === "failed") return "failed";
  if (stage.status === "in_progress") return "in_progress";
  return "pending";
}

function VerificationRow({
  label,
  status,
  onNavigate,
}: {
  label: string;
  status: "completed" | "failed" | "in_progress" | "pending";
  onNavigate: () => void;
}) {
  const completed = status === "completed";
  const failed = status === "failed";
  const inProgress = status === "in_progress";
  const pending = status === "pending";

  return (
    <div className="flex items-center justify-between gap-4 rounded-lg border border-[var(--dash-navy-border)] p-4 bg-black/20">
      <div className="flex items-center gap-4 min-w-0">
        {completed && <CheckCircle className="h-6 w-6 text-emerald-500 shrink-0" />}
        {failed && <XCircle className="h-6 w-6 text-red-500 shrink-0" />}
        {(pending || inProgress) && <Clock className="h-6 w-6 text-amber-500 shrink-0" />}
        <div className="min-w-0">
          <p className="font-semibold text-white">{label}</p>
          {completed && <p className="text-sm text-[var(--dash-text-muted)]">Status: Completed</p>}
          {failed && <p className="text-sm text-red-400">Status: Failed — you can retry</p>}
          {inProgress && <p className="text-sm text-[var(--dash-text-muted)]">Status: In progress</p>}
          {pending && <p className="text-sm text-[var(--dash-text-muted)]">Not yet completed</p>}
        </div>
      </div>
      <div className="shrink-0">
        {(pending || inProgress || failed) && (
          <Button
            variant={failed ? "default" : "outline"}
            size="sm"
            className={failed ? "dashboard-btn-gold" : "border-[var(--dash-navy-border)] text-white hover:bg-white/10"}
            onClick={onNavigate}
          >
            {failed ? "Reattempt Verification" : `Start ${label}`}
          </Button>
        )}
      </div>
    </div>
  );
}

export const SkillVerificationPanel = ({ verificationStages = [], roleType = "technical" }: SkillVerificationPanelProps) => {
  const navigate = useNavigate();

  if (roleType !== "technical") return null;

  const stages = Array.isArray(verificationStages) ? verificationStages : [];

  // Next step for header CTA: first stage that is not completed
  let firstIncompleteLabel: string | null = null;
  for (const stageName of TECHNICAL_VERIFICATION_STAGE_ORDER) {
    const status = getStageStatus(stages, stageName);
    if (status !== "completed") {
      firstIncompleteLabel = STAGE_TO_LABEL[stageName] ?? stageName;
      break;
    }
  }

  return (
    <Card className="border-[var(--dash-navy-border)] bg-white/5">
      <CardHeader>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <CardTitle className="text-lg font-semibold text-white">Skill Verification Status</CardTitle>
            <p className="text-sm text-[var(--dash-text-muted)] mt-1">
              Complete each step in order. Your progress is saved as you go.
            </p>
          </div>
          {firstIncompleteLabel && (
            <Button
              className="dashboard-btn-gold shrink-0"
              onClick={() => navigate("/verification")}
            >
              <Play className="h-4 w-4 mr-2" />
              Start {firstIncompleteLabel}
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {TECHNICAL_VERIFICATION_STAGE_ORDER.map((stageName) => (
          <VerificationRow
            key={stageName}
            label={STAGE_TO_LABEL[stageName] ?? stageName}
            status={getStageStatus(stages, stageName)}
            onNavigate={() => navigate("/verification")}
          />
        ))}
      </CardContent>
    </Card>
  );
};
