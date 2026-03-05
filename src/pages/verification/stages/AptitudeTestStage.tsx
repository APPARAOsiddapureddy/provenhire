import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Loader2, ChevronLeft, ChevronRight } from "lucide-react";

const ELIGIBILITY_THRESHOLD = 60;

interface AptitudeQuestion {
  id: string;
  question: string;
  options: string[];
}

interface AptitudeTestStageProps {
  stageStatus?: string;
  stageScore?: number;
  onComplete: () => void;
}

const AptitudeTestStage = ({ stageStatus, stageScore, onComplete }: AptitudeTestStageProps) => {
  const navigate = useNavigate();
  const [proctoringReady, setProctoringReady] = useState(false);
  const [proctoringState, setProctoringState] = useState<ProctoringState | null>(null);
  const [questions, setQuestions] = useState<AptitudeQuestion[]>([]);
  const [loadingQuestions, setLoadingQuestions] = useState(true);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [currentIndex, setCurrentIndex] = useState(0);
  const [submitted, setSubmitted] = useState(false);
  const [submittedScore, setSubmittedScore] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [justPassed, setJustPassed] = useState(false);
  const [soundAlertOpen, setSoundAlertOpen] = useState(false);
  const isFailed = stageStatus === "failed" || (submitted && !justPassed);
  const displayScore = submittedScore ?? stageScore ?? 0;

  const inTest = proctoringReady && !justPassed && !isFailed && questions.length > 0;
  const isFullScreen = useFullScreenState(inTest);

  useSoundDetection({
    enabled: inTest,
    threshold: 40,
    debounceMs: 4000,
    onSoundDetected: () => setSoundAlertOpen(true),
  });

  useEffect(() => {
    (async () => {
      try {
        const res = await api.get<{ questions: AptitudeQuestion[] }>("/api/verification/aptitude/questions");
        setQuestions(res.questions ?? []);
      } catch (e) {
        toast.error("Failed to load aptitude questions. Please refresh.");
      } finally {
        setLoadingQuestions(false);
      }
    })();
  }, []);

  useEffect(() => {
    return () => {
      proctoringState?.cameraStream?.getTracks().forEach((t) => t.stop());
      proctoringState?.screenStream?.getTracks().forEach((t) => t.stop());
    };
  }, [proctoringState?.cameraStream, proctoringState?.screenStream]);

  useEffect(() => {
    if (justPassed || isFailed) {
      proctoringState?.cameraStream?.getTracks().forEach((t) => t.stop());
      proctoringState?.screenStream?.getTracks().forEach((t) => t.stop());
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    }
  }, [justPassed, isFailed, proctoringState]);

  const handleSubmit = async () => {
    if (questions.length === 0) return;
    setLoading(true);
    try {
      const res = await api.post<{ result: { score?: number }; score?: number }>(
        "/api/verification/aptitude",
        { answers }
      );
      const score = res.score ?? res.result?.score ?? 0;
      if (score >= ELIGIBILITY_THRESHOLD) {
        await api.post("/api/verification/stages/update", { stageName: "aptitude_test", status: "completed", score });
        toast.success(`Aptitude test completed. Score: ${score}/100.`);
        setJustPassed(true);
      } else {
        await api.post("/api/verification/stages/update", { stageName: "aptitude_test", status: "failed", score });
        setSubmittedScore(score);
        setSubmitted(true);
        toast.error(`Score ${score}/100. Minimum ${ELIGIBILITY_THRESHOLD} required to proceed. You can retry when ready.`);
      }
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Failed to submit aptitude test.");
    } finally {
      setLoading(false);
    }
  };

  const allAnswered = questions.length > 0 && questions.every((q) => answers[q.id] != null && answers[q.id] !== "");
  const currentQuestion = questions[currentIndex];
  const isLastQuestion = currentIndex === questions.length - 1;
  const isFirstQuestion = currentIndex === 0;
  const canGoNext = currentQuestion && (answers[currentQuestion.id] != null && answers[currentQuestion.id] !== "");

  if (loadingQuestions) {
    return (
      <Card>
        <CardContent className="py-12 flex flex-col items-center justify-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Loading aptitude questions...</p>
        </CardContent>
      </Card>
    );
  }

  if (questions.length === 0 && !loadingQuestions) {
    return (
      <Card>
        <CardContent className="py-6">
          <p className="text-muted-foreground">No aptitude questions available. Please try again later.</p>
        </CardContent>
      </Card>
    );
  }

  if (!proctoringReady) {
    return (
      <ProctoringSetupGate
        testName="Aptitude Test"
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
        <CardTitle>Aptitude Test</CardTitle>
        <CardDescription>
          {!isFailed && !justPassed
            ? `Answer each question one by one. Question ${currentIndex + 1} of ${questions.length}. You need at least ${ELIGIBILITY_THRESHOLD}/100 to proceed.`
            : `Answer all ${questions.length} questions. You need at least ${ELIGIBILITY_THRESHOLD}/100 to proceed.`}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {isFailed ? (
          <div className="rounded-lg border border-amber-500/50 bg-amber-500/10 p-6 text-center">
            <p className="font-semibold text-amber-700 dark:text-amber-400">Not yet eligible</p>
            <p className="mt-2 text-sm text-muted-foreground">
              Your score: {displayScore}/100. Minimum {ELIGIBILITY_THRESHOLD} required to proceed to the DSA round.
            </p>
            <p className="mt-2 text-sm">Use the &quot;Retry This Step&quot; button above when you are ready to retake the test.</p>
          </div>
        ) : justPassed ? (
          <div className="p-6 rounded-xl border-2 border-primary/30 bg-primary/5 space-y-4">
            <h3 className="text-lg font-semibold text-foreground">Aptitude test passed! What&apos;s next?</h3>
            <p className="text-sm text-muted-foreground">You can go to the homepage or continue to the DSA round.</p>
            <div className="flex flex-wrap gap-3">
              <Button variant="outline" onClick={() => navigate("/")}>
                Go to Homepage
              </Button>
              <Button onClick={() => onComplete()}>
                Continue to DSA Round
              </Button>
            </div>
          </div>
        ) : (
          <>
            <SoundDetectedAlert open={soundAlertOpen} onOpenChange={setSoundAlertOpen} />
            <TestProctoringBar />
            <LiveProctoringPreview
              cameraStream={proctoringState?.cameraStream ?? null}
              brandName="ProvenHire"
              position="top-right"
            />
            <div className="space-y-6">
              {currentQuestion && (
                <div key={currentQuestion.id} className="space-y-4">
                  <p className="font-medium text-lg">Q{currentIndex + 1}: {currentQuestion.question}</p>
                  <div className="flex flex-wrap gap-2">
                    {currentQuestion.options.map((opt, i) => (
                      <Button
                        key={i}
                        variant={answers[currentQuestion.id] === opt ? "default" : "outline"}
                        size="sm"
                        onClick={() => setAnswers((prev) => ({ ...prev, [currentQuestion.id]: opt }))}
                      >
                        {opt}
                      </Button>
                    ))}
                  </div>
                </div>
              )}
            </div>
            {!isFullScreen && inTest && (
              <div className="rounded-lg border-2 border-amber-500/50 bg-amber-500/10 p-4 flex flex-wrap items-center justify-between gap-3">
                <span className="text-sm font-medium text-amber-800 dark:text-amber-200">
                  Enter full screen to proceed to the next question or submit.
                </span>
                <FullScreenMonitor active={inTest} />
              </div>
            )}
            <div className="flex flex-wrap items-center justify-between gap-4 pt-4 border-t">
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentIndex((i) => Math.max(0, i - 1))}
                  disabled={isFirstQuestion || (inTest && !isFullScreen)}
                >
                  <ChevronLeft className="h-4 w-4 mr-1" />
                  Previous
                </Button>
                {!isLastQuestion ? (
                  <Button
                    size="sm"
                    onClick={() => setCurrentIndex((i) => Math.min(questions.length - 1, i + 1))}
                    disabled={!canGoNext || (inTest && !isFullScreen)}
                  >
                    Next question
                    <ChevronRight className="h-4 w-4 ml-1" />
                  </Button>
                ) : (
                  <Button
                    onClick={handleSubmit}
                    disabled={loading || !allAnswered || (inTest && !isFullScreen)}
                  >
                    {loading ? "Submitting..." : "Submit test"}
                  </Button>
                )}
              </div>
              <span className="text-sm text-muted-foreground">
                {currentIndex + 1} / {questions.length}
              </span>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
};

export default AptitudeTestStage;
