import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import TestProctoringBar from "@/components/TestProctoringBar";
import ProctoringSetupGate from "@/components/ProctoringSetupGate";
import LiveProctoringPreview from "@/components/LiveProctoringPreview";
import SoundDetectedAlert from "@/components/SoundDetectedAlert";
import FullScreenMonitor from "@/components/FullScreenMonitor";
import type { ProctoringState } from "@/components/ProctoringSetupGate";
import { useSoundDetection } from "@/hooks/useSoundDetection";
import { useFullScreenState } from "@/hooks/useFullScreenState";
import { useProctoringRiskMonitor, type ProctoringEventCode, type StrikeTerminationMode } from "@/hooks/useProctoringRiskMonitor";
import { useProctorFrameCapture } from "@/hooks/useProctorFrameCapture";
import { useFeatureFlags } from "@/hooks/useFeatureFlags";

interface NonTechnicalAssignmentStageProps {
  targetJobTitle?: string;
  stageStatus?: string;
  stageScore?: number;
  isRetry?: boolean;
  onComplete: () => void;
  onRetry?: () => void;
  onPaywallRequired?: (
    stage: string,
    pricing: { singleInr: number; bundleInr: number },
    cooldown: Date | null
  ) => void;
}

interface AssignmentEvaluation {
  score: number;
  qualified: boolean;
  threshold: number;
  summary?: string;
  strengths?: string[];
  gaps?: string[];
}

const MAX_TAB_SWITCHES = 3;

const NonTechnicalAssignmentStage = ({
  targetJobTitle,
  stageStatus = "in_progress",
  stageScore,
  isRetry = false,
  onComplete,
  onRetry,
  onPaywallRequired,
}: NonTechnicalAssignmentStageProps) => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const testIdRef = useRef<string>(`NON_TECH_${Date.now()}`);
  const submittingRef = useRef(false);
  const [proctoringReady, setProctoringReady] = useState(false);
  const [proctoringState, setProctoringState] = useState<ProctoringState | null>(null);
  const [response, setResponse] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [assignmentJustSubmitted, setAssignmentJustSubmitted] = useState(false);
  const [evaluation, setEvaluation] = useState<AssignmentEvaluation | null>(null);
  const [soundAlertOpen, setSoundAlertOpen] = useState(false);
  const [prompt, setPrompt] = useState<string>("");
  const [passThreshold, setPassThreshold] = useState(60);
  const [promptError, setPromptError] = useState<string | null>(null);

  const isFailed = stageStatus === "failed" || (assignmentJustSubmitted && evaluation && !evaluation.qualified);
  const displayScore = evaluation?.score ?? stageScore ?? 0;
  const inTest = proctoringReady && !assignmentJustSubmitted && !isFailed;
  const isFullScreen = useFullScreenState(inTest);
  const { getMode: getFlagMode } = useFeatureFlags();
  const isFlagEnabled = (name: string) => getFlagMode(name) === "MONITOR" || getFlagMode(name) === "STRICT";
  const tabSwitchMode = getFlagMode("tab_switch_detection");
  const strikeTerminationMode = getFlagMode("proctoring_strike_termination") as StrikeTerminationMode;

  const terminateAssignmentForProctoring = useCallback((_reason: ProctoringEventCode) => {
    if (!submittingRef.current) {
      void api.post("/api/verification/stages/update", { stageName: "non_tech_assignment", status: "failed", score: 0 }).catch(() => {});
      setAssignmentJustSubmitted(true);
      setEvaluation({ score: 0, qualified: false, threshold: passThreshold });
    }
  }, [passThreshold]);

  const { tabSwitchCount } = useProctoringRiskMonitor({
    enabled: inTest,
    candidateId: user?.id,
    testId: testIdRef.current,
    testType: "non_tech_assignment",
    cameraStream: proctoringState?.cameraStream ?? null,
    microphoneStream: proctoringState?.microphoneStream ?? null,
    tabSwitchDetectionEnabled: isFlagEnabled("tab_switch_detection"),
    copyPasteDetectionEnabled: isFlagEnabled("copy_paste_detection"),
    devtoolsDetectionEnabled: isFlagEnabled("devtools_detection"),
    fullscreenDetectionEnabled: isFlagEnabled("fullscreen_required"),
    multipleFaceDetectionEnabled: isFlagEnabled("multiple_face_detection"),
    microphoneMonitoringEnabled: isFlagEnabled("microphone_monitoring"),
    maxTabSwitches: tabSwitchMode === "STRICT" ? MAX_TAB_SWITCHES : 999,
    strikeTerminationMode,
    onProctoringTerminated: strikeTerminationMode === "STRICT" ? terminateAssignmentForProctoring : undefined,
    onMaxTabSwitches:
      strikeTerminationMode !== "STRICT" && tabSwitchMode === "STRICT"
        ? () => {
            if (!submittingRef.current) {
              toast.error("Assignment terminated due to tab switching. Maximum 3 switches allowed.");
              void api.post("/api/verification/stages/update", { stageName: "non_tech_assignment", status: "failed", score: 0 }).catch(() => {});
              setAssignmentJustSubmitted(true);
              setEvaluation({ score: 0, qualified: false, threshold: passThreshold });
            }
          }
        : undefined,
  });

  useSoundDetection({
    enabled: inTest && isFlagEnabled("microphone_monitoring"),
    threshold: 40,
    debounceMs: 4000,
    onSoundDetected: () => setSoundAlertOpen(true),
    existingAudioStream: proctoringState?.microphoneStream ?? undefined,
  });

  useProctorFrameCapture({
    enabled: inTest && isFlagEnabled("screen_recording_enabled"),
    sessionId: testIdRef.current,
    testType: "non_tech_assignment",
    cameraStream: proctoringState?.cameraStream ?? null,
  });

  useEffect(() => {
    return () => {
      proctoringState?.cameraStream?.getTracks().forEach((t) => t.stop());
      proctoringState?.screenStream?.getTracks().forEach((t) => t.stop());
    };
  }, [proctoringState?.cameraStream, proctoringState?.screenStream]);

  useEffect(() => {
    if (assignmentJustSubmitted) {
      proctoringState?.cameraStream?.getTracks().forEach((t) => t.stop());
      proctoringState?.screenStream?.getTracks().forEach((t) => t.stop());
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    }
  }, [assignmentJustSubmitted, proctoringState]);

  useEffect(() => {
    let cancelled = false;
    void api
      .get<{ prompt: string; threshold: number }>("/api/verification/non-tech-assignment/prompt")
      .then((r) => {
        if (!cancelled) {
          setPrompt(r.prompt);
          setPassThreshold(r.threshold);
          setPromptError(null);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setPromptError("Could not load your assignment prompt. Refresh the page or try again.");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [targetJobTitle]);

  const handleSubmit = async () => {
    if (!prompt.trim()) {
      toast.error("Your assignment prompt is still loading. Please wait.");
      return;
    }
    if (!response.trim()) {
      toast.error("Please write your response before submitting.");
      return;
    }
    if (submittingRef.current) return;
    submittingRef.current = true;
    setSubmitting(true);
    try {
      const evalResult = await api.post<AssignmentEvaluation>("/api/verification/non-tech-assignment/submit", {
        prompt,
        response,
        targetJobTitle,
      });
      setEvaluation(evalResult);
      if (evalResult.qualified) {
        toast.success(`Assignment scored ${evalResult.score}/100. You can start the AI Expert Interview.`);
      } else {
        toast.error(
          `Assignment scored ${evalResult.score}/100. Minimum ${evalResult.threshold}/100 required to continue.`
        );
      }
      setAssignmentJustSubmitted(true);
    } catch (error: unknown) {
      const err = error as Error & { status?: number; response?: { data?: Record<string, unknown> } };
      const data = err.response?.data;
      const code = typeof data?.code === "string" ? data.code : "";
      if (err.status === 402 && (code === "PAYMENT_REQUIRED" || code === "COOLDOWN") && onPaywallRequired) {
        const pricing = data?.pricing as { singleInr?: number; bundleInr?: number } | undefined;
        const nextRaw = data?.nextAvailableAt;
        const nextAt =
          typeof nextRaw === "string" || nextRaw instanceof Date ? new Date(nextRaw as string) : null;
        onPaywallRequired(
          "non_tech_assignment",
          {
            singleInr: typeof pricing?.singleInr === "number" ? pricing.singleInr : 299,
            bundleInr: typeof pricing?.bundleInr === "number" ? pricing.bundleInr : 499,
          },
          nextAt && !Number.isNaN(nextAt.getTime()) ? nextAt : null
        );
        toast.error(
          code === "COOLDOWN"
            ? "Retake cooldown is still active — see payment window for the unlock time."
            : (err.message ?? "A paid retake credit is required for further attempts.")
        );
      } else {
        toast.error(err instanceof Error ? err.message : "Failed to submit assignment.");
      }
    } finally {
      setSubmitting(false);
      submittingRef.current = false;
    }
  };

  // Failed-state bypass: when user returns after failing, show retry UI without proctoring gate
  if (stageStatus === "failed" && !proctoringReady) {
    return (
      <Card>
        <CardContent className="py-8">
          <div className="rounded-lg border border-amber-500/50 bg-amber-500/10 p-6 text-center space-y-4">
            <p className="font-semibold text-amber-700 dark:text-amber-400">Not yet qualified</p>
            <p className="text-sm text-muted-foreground">
              Your score: {displayScore}/100. Minimum {passThreshold} required to unlock the AI Expert Interview.
            </p>
            {onRetry ? (
              <Button onClick={onRetry} className="mt-2">
                Retry Assignment
              </Button>
            ) : (
              <p className="text-sm text-muted-foreground">
                Return to the dashboard and come back when you&apos;re ready to retry.
              </p>
            )}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!proctoringReady) {
    return (
      <ProctoringSetupGate
        testName="Non-Technical Assignment"
        enableScreenShare={false}
        isRetry={isRetry}
        skipSetup={!isFlagEnabled("camera_required") && !isFlagEnabled("screen_recording_enabled") && !isFlagEnabled("microphone_monitoring")}
        onReady={(state) => {
          setProctoringState(state);
          setProctoringReady(true);
        }}
      />
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Assignment: {targetJobTitle || "Your Target Role"}</CardTitle>
        <CardDescription>
          Complete this written assignment based on your target job title. Submit when ready. Need {passThreshold}/100 to pass.
          Stay in fullscreen and avoid switching tabs during the assignment.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!assignmentJustSubmitted && (
          <>
            <SoundDetectedAlert open={soundAlertOpen} onOpenChange={setSoundAlertOpen} />
            <TestProctoringBar tabSwitchCount={tabSwitchCount} maxTabSwitches={tabSwitchMode === "STRICT" ? MAX_TAB_SWITCHES : 999} showTabSwitch={isFlagEnabled("tab_switch_detection")} />
            <LiveProctoringPreview
              cameraStream={proctoringState?.cameraStream ?? null}
              brandName="ProvenHire"
              position="top-right"
            />
          </>
        )}

        <div className="rounded-lg border border-border bg-muted/30 p-4">
          <p className="text-sm font-medium text-foreground mb-2">Your task</p>
          <p className="text-sm text-muted-foreground whitespace-pre-wrap">{prompt}</p>
        </div>

        {!assignmentJustSubmitted && (
          <>
            <div className="space-y-2">
              <Label>Your response</Label>
              <Textarea
                value={response}
                onChange={(e) => setResponse(e.target.value)}
                placeholder="Type your response here..."
                rows={12}
                className="resize-y min-h-[200px]"
              />
            </div>

            {!isFullScreen && inTest && (
              <div className="rounded-lg border-2 border-amber-500/50 bg-amber-500/10 p-4 flex flex-wrap items-center justify-between gap-3">
                <span className="text-sm font-medium text-amber-800 dark:text-amber-200">
                  Enter full screen to submit your assignment.
                </span>
                <FullScreenMonitor active={inTest} />
              </div>
            )}

            <Button
              onClick={handleSubmit}
              disabled={submitting || !response.trim() || (inTest && !isFullScreen)}
            >
              {submitting ? "Submitting..." : "Submit assignment"}
            </Button>
          </>
        )}

        {assignmentJustSubmitted && (
          <div className="mt-6 p-6 rounded-xl border-2 border-primary/30 bg-primary/5 space-y-4">
            <h3 className="text-lg font-semibold text-foreground">Assignment evaluated by AI</h3>
            <p className="text-sm text-muted-foreground">
              Score: <span className="font-semibold text-foreground">{evaluation?.score ?? 0}/100</span> (minimum{" "}
              {evaluation?.threshold ?? 60}/100)
            </p>
            <p className={`text-sm font-medium ${evaluation?.qualified ? "text-emerald-600" : "text-amber-600"}`}>
              {evaluation?.qualified
                ? "Qualified — continue to the AI Expert Interview."
                : "Not qualified yet. Improve your response and retry (your first retake is free after 24 hours)."}
            </p>
            {evaluation?.summary && (
              <p className="text-sm text-muted-foreground">{evaluation.summary}</p>
            )}
            {!!evaluation?.strengths?.length && (
              <div className="text-sm text-muted-foreground">
                <span className="font-medium text-foreground">Strengths:</span> {evaluation.strengths.join(", ")}
              </div>
            )}
            {!!evaluation?.gaps?.length && (
              <div className="text-sm text-muted-foreground">
                <span className="font-medium text-foreground">Improvement areas:</span> {evaluation.gaps.join(", ")}
              </div>
            )}
            <div className="flex flex-wrap gap-3">
              <Button variant="outline" onClick={() => navigate("/")}>
                Go to Homepage
              </Button>
              {evaluation?.qualified ? (
                <Button onClick={() => onComplete()}>
                  Continue to AI Expert Interview
                </Button>
              ) : (
                <Button variant="secondary" onClick={() => onRetry?.()}>
                  Retry Assignment
                </Button>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default NonTechnicalAssignmentStage;
