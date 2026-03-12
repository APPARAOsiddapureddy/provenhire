import { useState, useEffect, useRef } from "react";
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
import { useProctoringRiskMonitor } from "@/hooks/useProctoringRiskMonitor";
import { useProctorFrameCapture } from "@/hooks/useProctorFrameCapture";
import { useFeatureFlags } from "@/hooks/useFeatureFlags";

interface NonTechnicalAssignmentStageProps {
  targetJobTitle?: string;
  stageStatus?: string;
  stageScore?: number;
  isRetry?: boolean;
  onComplete: () => void;
  onRetry?: () => void;
}

const ASSIGNMENT_PROMPTS: Record<string, string> = {
  "Product Manager": "Describe a product you would build from scratch. Include: problem statement, target users, key features, and success metrics.",
  "Project Manager": "Walk through how you would plan and execute a 3-month project with a cross-functional team. What tools and methods would you use?",
  "Marketing": "Outline a marketing campaign for launching a new product. Include channels, timeline, and how you would measure ROI.",
  "Marketing Manager": "Outline a marketing campaign for launching a new product. Include channels, timeline, and how you would measure ROI.",
  "Sales": "How would you build a sales strategy for a new market? Include pipeline, targets, and team structure.",
  "Sales Manager": "How would you build a sales strategy for a new market? Include pipeline, targets, and team structure.",
  "Content": "Write a 200-word sample blog post introducing a fictional SaaS product to a B2B audience.",
  "Content Writer": "Write a 200-word sample blog post introducing a fictional SaaS product to a B2B audience.",
  "HR": "Describe your approach to hiring for a critical role. How would you source, assess, and select candidates?",
  "HR Manager": "Describe your approach to hiring for a critical role. How would you source, assess, and select candidates?",
  "Business Analyst": "A stakeholder reports declining user engagement. Describe your analysis approach and the questions you would ask.",
  "UX Designer": "Describe your process for redesigning a complex user flow. How do you research, iterate, and validate?",
  "Customer Success": "A key customer threatens to churn. Walk through your response plan step by step.",
  "Customer Success Manager": "A key customer threatens to churn. Walk through your response plan step by step.",
  "Operations": "Describe how you would optimize a repeatable operational process. Include metrics and improvement tactics.",
  "Operations Manager": "Describe how you would optimize a repeatable operational process. Include metrics and improvement tactics.",
};

const DEFAULT_PROMPT = "Describe your relevant experience and approach for this role. Include 2-3 concrete examples of work you've done (or would do) that align with the job title.";

interface AssignmentEvaluation {
  score: number;
  qualified: boolean;
  threshold: number;
  summary?: string;
  strengths?: string[];
  gaps?: string[];
}

const THRESHOLD = 60;
const MAX_TAB_SWITCHES = 3;

const NonTechnicalAssignmentStage = ({
  targetJobTitle,
  stageStatus = "in_progress",
  stageScore,
  isRetry = false,
  onComplete,
  onRetry,
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

  const isFailed = stageStatus === "failed" || (assignmentJustSubmitted && evaluation && !evaluation.qualified);
  const displayScore = evaluation?.score ?? stageScore ?? 0;
  const inTest = proctoringReady && !assignmentJustSubmitted && !isFailed;
  const isFullScreen = useFullScreenState(inTest);
  const { getMode: getFlagMode } = useFeatureFlags();
  const isFlagEnabled = (name: string) => getFlagMode(name) === "MONITOR" || getFlagMode(name) === "STRICT";
  const tabSwitchMode = getFlagMode("tab_switch_detection");

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
    onMaxTabSwitches: tabSwitchMode === "STRICT" ? () => {
      if (!submittingRef.current) {
        toast.error("Assignment terminated due to tab switching. Maximum 3 switches allowed.");
        void api.post("/api/verification/stages/update", { stageName: "non_tech_assignment", status: "failed", score: 0 }).catch(() => {});
        setAssignmentJustSubmitted(true);
        setEvaluation({ score: 0, qualified: false, threshold: THRESHOLD });
      }
    } : undefined,
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

  const prompt =
    (targetJobTitle && ASSIGNMENT_PROMPTS[targetJobTitle]) ||
    (targetJobTitle ? DEFAULT_PROMPT : "Based on your target role, describe your relevant experience and approach. Include 2-3 concrete examples.");

  const handleSubmit = async () => {
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
        toast.success(`Assignment scored ${evalResult.score}/100. Qualified for Human Expert Interview.`);
      } else {
        toast.error(
          `Assignment scored ${evalResult.score}/100. Minimum ${evalResult.threshold}/100 required for Human Expert Interview.`
        );
      }
      setAssignmentJustSubmitted(true);
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Failed to submit assignment.");
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
              Your score: {displayScore}/100. Minimum {THRESHOLD} required to proceed to the Human Expert Interview.
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
          Complete this written assignment based on your target job title. Submit when ready. Need {THRESHOLD}/100 to pass.
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
                ? "Qualified for Human Expert Interview."
                : "Not qualified yet for Human Expert Interview. Please improve and retry this assignment."}
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
                  Continue to Human Expert Interview
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
