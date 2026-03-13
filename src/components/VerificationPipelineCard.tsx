/**
 * Unified Verification Pipeline card — combines pipeline steps and certification path.
 * Replaces separate "Skill Verification Status" and "Certification Level Progress" sections.
 * Dynamic based on verificationStages, certification level, and roleType.
 */
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { CheckCircle, Lock } from "lucide-react";

const TECHNICAL_PIPELINE_STAGES = [
  "aptitude_test",
  "dsa_round",
  "expert_interview",
  "human_expert_interview",
] as const;

const PIPELINE_LABELS: Record<string, string> = {
  aptitude_test: "Aptitude Verification",
  dsa_round: "Live Coding Verification",
  expert_interview: "AI Interview",
  human_expert_interview: "Human Interview",
};

const LOCKED_STATUS_TEXT: Record<string, string> = {
  aptitude_test: "Complete profile to start",
  dsa_round: "Unlocks after aptitude",
  expert_interview: "Unlocks after coding",
  human_expert_interview: "Unlocks at L2",
};

export type VerificationStageLike = { stage_name?: string; status?: string };

type VerificationPipelineCardProps = {
  verificationStages: VerificationStageLike[];
  roleType: "technical" | "non_technical";
  certificationLevelNumber: number;
  certificationLabel: string;
  userName: string;
  profile?: { currentRole?: string; current_role?: string; verificationStatus?: string } | null;
  getStageStatus: (stageName: string) => "done" | "active" | "locked";
  nextStageLabel: string;
};

function getPipelineStepStatus(
  stages: VerificationStageLike[],
  stageName: string,
  getStageStatus: (s: string) => "done" | "active" | "locked"
): "done" | "active" | "locked" {
  return getStageStatus(stageName);
}

export function VerificationPipelineCard({
  verificationStages,
  roleType,
  certificationLevelNumber,
  certificationLabel,
  userName,
  profile,
  getStageStatus,
  nextStageLabel,
}: VerificationPipelineCardProps) {
  const navigate = useNavigate();

  if (roleType !== "technical") {
    return null;
  }

  const stages = Array.isArray(verificationStages) ? verificationStages : [];
  const initials = userName
    .trim()
    .split(/\s+/)
    .map((s) => s[0])
    .slice(0, 2)
    .join("")
    .toUpperCase() || "U";

  const levelShort = certificationLabel.replace(/^Level \d+ - /i, "").trim();
  const levelBadgeText = certificationLevelNumber >= 1 ? `L${certificationLevelNumber} · ${levelShort}` : "L0 · Not Certified";

  const userSub =
    certificationLevelNumber >= 3
      ? "Expert Verified"
      : certificationLevelNumber >= 2
        ? "Skill Passport"
        : certificationLevelNumber >= 1
          ? "Cognitive Verified"
          : "In progress";

  const firstIncompleteStage = TECHNICAL_PIPELINE_STAGES.find(
    (name) => getPipelineStepStatus(stages, name, getStageStatus) !== "done"
  );
  const ctaLabel = firstIncompleteStage
    ? (() => {
        const status = getPipelineStepStatus(stages, firstIncompleteStage, getStageStatus);
        const label = PIPELINE_LABELS[firstIncompleteStage] ?? firstIncompleteStage;
        return status === "active" ? `Resume ${label}` : `Start ${label}`;
      })()
    : null;

  return (
    <div className="verification-pipeline-card">
      <div className="vpc-header">
        <div className="vpc-user-row">
          <div className="vpc-avatar">{initials}</div>
          <div>
            <div className="vpc-user-name">{userName || "Candidate"}</div>
            <div className="vpc-user-sub">{userSub}</div>
          </div>
        </div>
        <div className="vpc-level-badge">
          <span className="vpc-badge-dot" />
          {levelBadgeText}
        </div>
      </div>

      <div className="vpc-pipeline">
        <div className="vpc-section-label">Verification pipeline</div>
        <div className="vpc-steps">
          {TECHNICAL_PIPELINE_STAGES.map((stageName) => {
            const status = getPipelineStepStatus(stages, stageName, getStageStatus);
            const label = PIPELINE_LABELS[stageName] ?? stageName;
            const stageData = stages.find((s) => (s.stage_name ?? "") === stageName);
            const isFailed = stageData?.status === "failed";

            return (
              <div key={stageName} className={`vpc-step vpc-step--${status}`}>
                <div className="vpc-step-icon">
                  {status === "done" && <CheckCircle className="h-4 w-4 text-[var(--dash-emerald)]" />}
                  {status === "active" && <span className="vpc-pulse-dot" />}
                  {status === "locked" && <Lock className="h-3.5 w-3.5 text-[var(--dash-text-muted)]" />}
                </div>
                <div className="vpc-step-text">
                  <div className="vpc-step-title">{label}</div>
                  <div className="vpc-step-status">
                    {status === "done" && "Completed"}
                    {status === "active" && (isFailed ? "Retry available" : "In progress")}
                    {status === "locked" && LOCKED_STATUS_TEXT[stageName]}
                  </div>
                </div>
                {status === "active" && (
                  <button
                    type="button"
                    className="vpc-step-cta"
                    onClick={() => navigate("/verification")}
                  >
                    {isFailed ? "Retry ↗" : "Resume ↗"}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="vpc-levels">
        <div className="vpc-section-label">Certification path</div>
        <div className="vpc-levels-row">
          <div className={`vpc-lvl ${certificationLevelNumber >= 1 ? "vpc-lvl--current" : "vpc-lvl--future"}`}>
            <div className="vpc-lvl-tag">{certificationLevelNumber >= 1 ? "L1 · Now" : "L1"}</div>
            <div className="vpc-lvl-name">Cognitive Verified</div>
            <div className="vpc-lvl-reqs">Profile + Aptitude ✓</div>
          </div>
          <div className={`vpc-lvl ${certificationLevelNumber === 2 ? "vpc-lvl--current" : certificationLevelNumber > 2 ? "vpc-lvl--past" : "vpc-lvl--next"}`}>
            <div className="vpc-lvl-tag">{certificationLevelNumber === 2 ? "L2 · Now" : certificationLevelNumber > 2 ? "L2" : "L2 · Next"}</div>
            <div className="vpc-lvl-name">Skill Passport</div>
            <div className="vpc-lvl-reqs">DSA + AI Interview</div>
          </div>
          <div className={`vpc-lvl ${certificationLevelNumber >= 3 ? "vpc-lvl--current" : "vpc-lvl--future"}`}>
            <div className="vpc-lvl-tag">{certificationLevelNumber >= 3 ? "L3 · Now" : "L3"}</div>
            <div className="vpc-lvl-name">Elite Verified</div>
            <div className="vpc-lvl-reqs">Human Interview</div>
          </div>
        </div>
      </div>

      {ctaLabel && (
        <div className="vpc-cta-wrap">
          <Button className="vpc-cta-btn" onClick={() => navigate("/verification")}>
            <span className="vpc-play-icon" />
            {ctaLabel}
          </Button>
        </div>
      )}
    </div>
  );
}
