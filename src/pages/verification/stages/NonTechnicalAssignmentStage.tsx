import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/api";
import { toast } from "sonner";
import TestProctoringBar from "@/components/TestProctoringBar";
import ProctoringSetupGate from "@/components/ProctoringSetupGate";
import LiveProctoringPreview from "@/components/LiveProctoringPreview";
import SoundDetectedAlert from "@/components/SoundDetectedAlert";
import FullScreenMonitor from "@/components/FullScreenMonitor";
import type { ProctoringState } from "@/components/ProctoringSetupGate";
import { useSoundDetection } from "@/hooks/useSoundDetection";
import { useFullScreenState } from "@/hooks/useFullScreenState";

interface NonTechnicalAssignmentStageProps {
  targetJobTitle?: string;
  onComplete: () => void;
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

const NonTechnicalAssignmentStage = ({ targetJobTitle, onComplete }: NonTechnicalAssignmentStageProps) => {
  const navigate = useNavigate();
  const [proctoringReady, setProctoringReady] = useState(false);
  const [proctoringState, setProctoringState] = useState<ProctoringState | null>(null);
  const [response, setResponse] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [assignmentJustSubmitted, setAssignmentJustSubmitted] = useState(false);
  const [soundAlertOpen, setSoundAlertOpen] = useState(false);

  const inTest = proctoringReady && !assignmentJustSubmitted;
  const isFullScreen = useFullScreenState(inTest);

  useSoundDetection({
    enabled: inTest,
    threshold: 40,
    debounceMs: 4000,
    onSoundDetected: () => setSoundAlertOpen(true),
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
    setSubmitting(true);
    try {
      await api.post("/api/verification/stages/update", {
        stageName: "non_tech_assignment",
        status: "completed",
      });
      toast.success("Assignment submitted successfully!");
      setAssignmentJustSubmitted(true);
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Failed to submit assignment.");
    } finally {
      setSubmitting(false);
    }
  };

  if (!proctoringReady) {
    return (
      <ProctoringSetupGate
        testName="Non-Technical Assignment"
        onReady={(state) => {
          setProctoringState(state);
          setProctoringReady(true);
        }}
        screenShareOptional={true}
      />
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Assignment: {targetJobTitle || "Your Target Role"}</CardTitle>
        <CardDescription>
          Complete this written assignment based on your target job title. Your response will be reviewed as part of verification.
          Stay in fullscreen and avoid switching tabs during the assignment.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!assignmentJustSubmitted && (
          <>
            <SoundDetectedAlert open={soundAlertOpen} onOpenChange={setSoundAlertOpen} />
            <TestProctoringBar />
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
            <h3 className="text-lg font-semibold text-foreground">Assignment submitted! What&apos;s next?</h3>
            <p className="text-sm text-muted-foreground">You can go to the homepage or continue to the Human Expert Interview.</p>
            <div className="flex flex-wrap gap-3">
              <Button variant="outline" onClick={() => navigate("/")}>
                Go to Homepage
              </Button>
              <Button onClick={() => onComplete()}>
                Continue to Human Expert Interview
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default NonTechnicalAssignmentStage;
