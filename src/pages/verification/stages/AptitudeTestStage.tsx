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
import { Loader2, ChevronLeft, ChevronRight, Bookmark, BookmarkCheck } from "lucide-react";

const APTITUDE_TIME_MINUTES = 90; // 1.5 hours total

interface AptitudeQuestion {
  id: string;
  question: string;
  options: string[];
  marks?: number;
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

interface AptitudeTestStageProps {
  stageStatus?: string;
  stageScore?: number;
  onComplete: () => void;
  onSessionExpired?: () => void;
  isRetry?: boolean;
}

const AptitudeTestStage = ({ stageStatus, stageScore, onComplete, onSessionExpired, isRetry = false }: AptitudeTestStageProps) => {
  const navigate = useNavigate();
  const [proctoringReady, setProctoringReady] = useState(false);
  const [proctoringState, setProctoringState] = useState<ProctoringState | null>(null);
  const [questions, setQuestions] = useState<AptitudeQuestion[]>([]);
  const [loadingQuestions, setLoadingQuestions] = useState(true);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [reviewed, setReviewed] = useState<Set<string>>(new Set());
  const [currentIndex, setCurrentIndex] = useState(0);
  const [submitted, setSubmitted] = useState(false);
  const [submittedScore, setSubmittedScore] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [justPassed, setJustPassed] = useState(false);
  const [soundAlertOpen, setSoundAlertOpen] = useState(false);
  const submittingRef = useRef(false);
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

  const [timeLimitMinutes, setTimeLimitMinutes] = useState(APTITUDE_TIME_MINUTES);
  const [secondsRemaining, setSecondsRemaining] = useState<number | null>(null);
  const [totalMarks, setTotalMarks] = useState(20);
  const [passThreshold, setPassThreshold] = useState(12);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await api.get<{
          questions: AptitudeQuestion[];
          timeLimitMinutes?: number;
          totalMarks?: number;
          passThreshold?: number;
        }>("/api/verification/aptitude/questions");
        setQuestions(res.questions ?? []);
        const mins = res.timeLimitMinutes ?? APTITUDE_TIME_MINUTES;
        setTimeLimitMinutes(mins);
        setSecondsRemaining(mins * 60);
        setTotalMarks(res.totalMarks ?? 20);
        setPassThreshold(res.passThreshold ?? 12);
      } catch (e) {
        toast.error("Failed to load aptitude questions. Please refresh.");
      } finally {
        setLoadingQuestions(false);
      }
    })();
  }, []);

  useEffect(() => {
    if (!inTest || secondsRemaining == null || secondsRemaining <= 0) return;
    timerRef.current = setInterval(() => {
      setSecondsRemaining((s) => {
        if (s == null || s <= 1) {
          if (timerRef.current) clearInterval(timerRef.current);
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [inTest]);

  useEffect(() => {
    if (secondsRemaining === 0 && inTest && questions.length > 0 && !loading) {
      toast.warning("Time's up! Submitting your answers.");
      handleSubmit();
    }
  }, [secondsRemaining]);

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
    if (submittingRef.current) return; // Double-submit guard
    submittingRef.current = true;
    setLoading(true);
    try {
      const res = await api.post<{ result: { score?: number }; score?: number }>(
        "/api/verification/aptitude",
        { answers }
      );
      const score = res.score ?? res.result?.score ?? 0;
      if (score >= passThreshold) {
        await api.post("/api/verification/stages/update", { stageName: "aptitude_test", status: "completed", score });
        toast.success(`Aptitude test completed. Score: ${score}/${totalMarks}.`);
        setJustPassed(true);
      } else {
        await api.post("/api/verification/stages/update", { stageName: "aptitude_test", status: "failed", score });
        setSubmittedScore(score);
        setSubmitted(true);
        toast.error(`Score ${score}/${totalMarks}. Minimum ${passThreshold} required to proceed. You can retry when ready.`);
      }
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : "Failed to submit aptitude test.";
      toast.error(msg);
      if (msg.toLowerCase().includes("session expired")) {
        toast.info("Starting over — click Start to get fresh questions.");
        onSessionExpired?.();
      }
    } finally {
      setLoading(false);
      submittingRef.current = false;
    }
  };

  const allAnswered = questions.length > 0 && questions.every((q) => answers[q.id] != null && answers[q.id] !== "");
  const currentQuestion = questions[currentIndex];
  const isLastQuestion = currentIndex === questions.length - 1;
  const isFirstQuestion = currentIndex === 0;
  const canGoNext = true; // Allow navigation without answering (user can mark for review)
  const toggleReview = (qId: string) => {
    setReviewed((prev) => {
      const next = new Set(prev);
      if (next.has(qId)) next.delete(qId);
      else next.add(qId);
      return next;
    });
  };

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
        isRetry={isRetry}
        onReady={(state) => {
          setProctoringState(state);
          setProctoringReady(true);
        }}
      />
    );
  }

  return (
    <Card>
      <CardHeader className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <CardTitle>Aptitude Test</CardTitle>
            <CardDescription>
              {!isFailed && !justPassed
                ? `Question ${currentIndex + 1} of ${questions.length}. Need ${passThreshold}/${totalMarks} to pass.`
                : `Answer all ${questions.length} questions. Need ${passThreshold}/${totalMarks} to pass.`}
            </CardDescription>
          </div>
          {secondsRemaining != null && inTest && (
            <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-muted/50 border">
              <span className="text-sm text-muted-foreground">Time left</span>
              <span className={`font-mono font-semibold tabular-nums ${secondsRemaining <= 300 ? "text-destructive" : ""}`}>
                {formatTime(secondsRemaining)}
              </span>
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {isFailed ? (
          <div className="rounded-lg border border-amber-500/50 bg-amber-500/10 p-6 text-center">
            <p className="font-semibold text-amber-700 dark:text-amber-400">Not yet eligible</p>
            <p className="mt-2 text-sm text-muted-foreground">
              Your score: {displayScore}/{totalMarks}. Minimum {passThreshold} required to proceed to the DSA round.
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
            <div className="flex flex-wrap items-center justify-between gap-4 py-2 px-3 rounded-lg bg-muted/50 border">
              <div className="flex items-center gap-4">
                <span className="font-mono font-semibold text-lg tabular-nums" title="Time remaining">
                  {secondsRemaining != null ? formatTime(secondsRemaining) : "--:--"}
                </span>
                <span className="text-sm text-muted-foreground">remaining</span>
              </div>
              <div className="flex flex-wrap gap-1.5 items-center">
                {questions.map((q, i) => {
                  const answered = answers[q.id] != null && answers[q.id] !== "";
                  const markedReview = reviewed.has(q.id);
                  const current = i === currentIndex;
                  const status = current
                    ? "current"
                    : answered
                      ? "answered"
                      : markedReview
                        ? "reviewed"
                        : "yet_to_answer";
                  return (
                    <button
                      key={q.id}
                      type="button"
                      onClick={() => setCurrentIndex(i)}
                      disabled={inTest && !isFullScreen}
                      className={`w-8 h-8 rounded-md text-sm font-medium transition-colors ${
                        status === "current"
                          ? "ring-2 ring-primary bg-primary text-primary-foreground"
                          : status === "answered"
                            ? "bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 border border-emerald-500/40"
                            : status === "reviewed"
                              ? "bg-blue-500/20 text-blue-700 dark:text-blue-400 border border-blue-500/40"
                              : "bg-muted text-muted-foreground border border-border hover:bg-muted/80"
                      }`}
                      title={
                        status === "current"
                          ? `Q${i + 1}: Current`
                          : status === "answered"
                            ? `Q${i + 1}: Answered`
                            : status === "reviewed"
                              ? `Q${i + 1}: Marked for review`
                              : `Q${i + 1}: Yet to answer`
                      }
                    >
                      {i + 1}
                    </button>
                  );
                })}
              </div>
            </div>
            <TestProctoringBar />
            <LiveProctoringPreview
              cameraStream={proctoringState?.cameraStream ?? null}
              brandName="ProvenHire"
              position="top-right"
            />
            <div className="space-y-6">
              {currentQuestion && (
                <div key={currentQuestion.id} className="space-y-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <p className="font-medium text-lg flex-1">
                      Q{currentIndex + 1} <span className="text-sm font-normal text-muted-foreground">({currentQuestion.marks ?? 1} mark{((currentQuestion.marks ?? 1) > 1) ? "s" : ""})</span>
                      {" — "}{currentQuestion.question}
                    </p>
                    <Button
                      type="button"
                      variant={reviewed.has(currentQuestion.id) ? "secondary" : "outline"}
                      size="sm"
                      onClick={() => toggleReview(currentQuestion.id)}
                      className="shrink-0"
                    >
                      {reviewed.has(currentQuestion.id) ? (
                        <>
                          <BookmarkCheck className="h-4 w-4 mr-1.5" />
                          Marked for review
                        </>
                      ) : (
                        <>
                          <Bookmark className="h-4 w-4 mr-1.5" />
                          Mark for review
                        </>
                      )}
                    </Button>
                  </div>
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
