import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Loader2, ChevronLeft, ChevronRight, RotateCcw, Bookmark, BookmarkCheck, CircleHelp, Sparkles, Trophy, Target } from "lucide-react";

const APTITUDE_TIME_MINUTES = 30; // 30 minutes total

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
  onRetry?: () => void;
  isRetry?: boolean;
}

const AptitudeTestStage = ({ stageStatus, stageScore, onComplete, onSessionExpired, onRetry, isRetry = false }: AptitudeTestStageProps) => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const testIdRef = useRef<string>(`APTITUDE_${Date.now()}`);
  const [proctoringReady, setProctoringReady] = useState(false);
  const [proctoringState, setProctoringState] = useState<ProctoringState | null>(null);
  const [questions, setQuestions] = useState<AptitudeQuestion[]>([]);
  const [loadingQuestions, setLoadingQuestions] = useState(true);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [reviewed, setReviewed] = useState<Set<string>>(new Set());
  const [visited, setVisited] = useState<Set<string>>(new Set());
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
  const MAX_TAB_SWITCHES = 3;
  const { tabSwitchCount } = useProctoringRiskMonitor({
    enabled: inTest,
    candidateId: user?.id,
    testId: testIdRef.current,
    testType: "aptitude",
    cameraStream: proctoringState?.cameraStream ?? null,
    microphoneStream: proctoringState?.microphoneStream ?? null,
    maxTabSwitches: MAX_TAB_SWITCHES,
    onMaxTabSwitches: () => {
      if (questions.length > 0 && !submittingRef.current) {
        toast.error("Test terminated due to tab switching. Maximum 3 switches allowed.");
        void api.post("/api/verification/aptitude", { answers: {}, invalidated: true }).catch(() => {});
        void api.post("/api/verification/stages/update", { stageName: "aptitude_test", status: "failed", score: 0 }).catch(() => {});
        setSubmitted(true);
        setSubmittedScore(0);
      }
    },
  });

  useSoundDetection({
    enabled: inTest,
    threshold: 40,
    debounceMs: 4000,
    onSoundDetected: () => setSoundAlertOpen(true),
    existingAudioStream: proctoringState?.microphoneStream ?? undefined,
  });

  useProctorFrameCapture({
    enabled: inTest,
    sessionId: testIdRef.current,
    testType: "aptitude",
    cameraStream: proctoringState?.cameraStream ?? null,
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

  useEffect(() => {
    if (questions[currentIndex]) {
      setVisited((prev) => new Set(prev).add(questions[currentIndex].id));
    }
  }, [currentIndex, questions]);

  const handleSubmit = async () => {
    if (questions.length === 0) return;
    if (submittingRef.current) return; // Double-submit guard
    submittingRef.current = true;
    setLoading(true);
    try {
      const res = await api.post<{ result: { score?: number }; score?: number }>(
        "/api/verification/aptitude",
        {
          answers,
          meta: {
            timeTakenSeconds:
              secondsRemaining != null ? Math.max(0, timeLimitMinutes * 60 - secondsRemaining) : undefined,
            timeLimitSeconds: timeLimitMinutes * 60,
          },
        }
      );
      const score = res.score ?? res.result?.score ?? 0;
      if (score >= passThreshold) {
        await api.post("/api/verification/stages/update", { stageName: "aptitude_test", status: "completed", score });
        toast.success(`Boom! Level 1 unlocked. Aptitude score: ${score}/${totalMarks}.`);
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

  const clearCurrentAnswer = () => {
    if (currentQuestion) {
      setAnswers((prev) => ({ ...prev, [currentQuestion.id]: "" }));
    }
  };

  const goToQuestion = (index: number) => {
    if (questions[index]) {
      setVisited((prev) => new Set(prev).add(questions[index].id));
      setCurrentIndex(index);
    }
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

  // When the stage is already failed (e.g. user returning after a previous attempt),
  // show the retry UI directly without requiring proctoring setup again.
  // Proctoring is only needed when the user is actually about to take the test.
  if (isFailed && !proctoringReady) {
    return (
      <Card>
        <CardContent className="py-8">
          <div className="rounded-lg border border-amber-500/50 bg-amber-500/10 p-6 text-center space-y-4">
            <p className="font-semibold text-amber-700 dark:text-amber-400">Not yet eligible</p>
            <p className="text-sm text-muted-foreground">
              Your score: {displayScore}/{totalMarks}. Minimum {passThreshold} required to proceed to the DSA round.
            </p>
            {onRetry ? (
              <Button onClick={onRetry} className="mt-2">
                Retry Test
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
        testName="Aptitude Test"
        enableScreenShare={false}
        isRetry={isRetry}
        onReady={(state) => {
          setProctoringState(state);
          setProctoringReady(true);
        }}
      />
    );
  }

  return (
    <Card className="flex flex-col w-full min-h-[calc(100dvh-2rem)] sm:min-h-[calc(100dvh-3rem)] rounded-none sm:rounded-lg border-0 sm:border shadow-none sm:shadow">
      <CardHeader className="py-4 pb-2 shrink-0">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle className="text-lg sm:text-xl">Aptitude Test</CardTitle>
            <CardDescription className="text-sm">
              {!isFailed && !justPassed
                ? `Question ${currentIndex + 1} of ${questions.length}. Need ${passThreshold}/${totalMarks} to pass.`
                : `Answer all ${questions.length} questions. Need ${passThreshold}/${totalMarks} to pass.`}
            </CardDescription>
          </div>
          {inTest && (
            <div className="flex items-center gap-2 px-2.5 py-1 rounded-md border bg-muted/40">
              <span className="text-xs text-muted-foreground">AI Monitoring</span>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    aria-label="Proctoring rules information"
                    className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-border bg-background/70 text-muted-foreground hover:text-foreground"
                  >
                    <CircleHelp className="h-3.5 w-3.5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent className="max-w-[320px] p-3">
                  <p className="font-semibold mb-1">Proctoring signals tracked</p>
                  <p className="text-xs text-muted-foreground">
                    Voice detection, mobile phone detection, multiple/dual face detection, tab switching, and fullscreen exits.
                  </p>
                  <p className="text-xs mt-2">
                    Each violation adds risk points. If cumulative risk reaches <span className="font-semibold">400</span>, the attempt may be disqualified.
                  </p>
                </TooltipContent>
              </Tooltip>
            </div>
          )}
          {secondsRemaining != null && inTest && (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-muted/50 border">
              <span className="text-xs text-muted-foreground">Time</span>
              <span className={`font-mono font-semibold tabular-nums text-sm ${secondsRemaining <= 300 ? "text-destructive" : ""}`}>
                {formatTime(secondsRemaining)}
              </span>
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent className="flex flex-col flex-1 min-h-0 px-4 sm:px-8 pt-2 pb-4 space-y-4">
        {isFailed ? (
          <div className="rounded-lg border border-amber-500/50 bg-amber-500/10 p-6 text-center space-y-4">
            <p className="font-semibold text-amber-700 dark:text-amber-400">Not yet eligible</p>
            <p className="text-sm text-muted-foreground">
              Your score: {displayScore}/{totalMarks}. Minimum {passThreshold} required to proceed to the DSA round.
            </p>
            {onRetry ? (
              <Button onClick={onRetry} className="mt-2">
                Retry Test
              </Button>
            ) : (
              <p className="text-sm text-muted-foreground">Return to the dashboard and come back when you&apos;re ready to retry.</p>
            )}
          </div>
        ) : justPassed ? (
          <div className="p-6 rounded-xl border-2 border-primary/30 bg-primary/5 space-y-5">
            <div className="flex items-center gap-2 text-primary animate-pulse">
              <Sparkles className="h-5 w-5" />
              <span className="text-xs font-semibold tracking-[0.18em] uppercase">Boom Moment</span>
            </div>
            <h3 className="text-xl font-bold text-foreground">
              Level 1 Certification Earned! <span className="inline-block">🏆</span>
            </h3>
            <p className="text-sm text-muted-foreground">
              Strong start. You cleared Aptitude and unlocked <span className="font-semibold text-foreground">L1: Cognitive Verified</span>.
              Now keep your momentum and complete DSA + AI Interview + Human Expert Interview to reach <span className="font-semibold text-foreground">Level 3 (Elite Verified)</span>.
            </p>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-lg border bg-background/80 p-3">
                <div className="flex items-center gap-2 text-xs font-semibold text-primary">
                  <Trophy className="h-4 w-4" />
                  L1 Unlocked
                </div>
                <p className="mt-1 text-xs text-muted-foreground">Profile + Aptitude completed</p>
              </div>
              <div className="rounded-lg border bg-background/80 p-3">
                <div className="flex items-center gap-2 text-xs font-semibold text-primary">
                  <Target className="h-4 w-4" />
                  Next Goal
                </div>
                <p className="mt-1 text-xs text-muted-foreground">Finish DSA and AI Interview for L2 signal</p>
              </div>
              <div className="rounded-lg border bg-background/80 p-3">
                <div className="flex items-center gap-2 text-xs font-semibold text-primary">
                  <Sparkles className="h-4 w-4" />
                  Final Push
                </div>
                <p className="mt-1 text-xs text-muted-foreground">Crack Human Expert Interview for L3</p>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Your current score: <span className="font-semibold text-foreground">{submittedScore ?? stageScore ?? "-"}/{totalMarks}</span>.
              Keep going - each completed stage increases your recruiter visibility.
            </p>
            <div className="flex flex-wrap gap-3">
              <Button variant="outline" onClick={() => navigate("/")}>
                Go to Homepage
              </Button>
              <Button onClick={() => onComplete()}>
                Continue to DSA Round (Level 2 Path)
              </Button>
            </div>
          </div>
        ) : (
          <>
            <SoundDetectedAlert open={soundAlertOpen} onOpenChange={setSoundAlertOpen} />
            <div className="flex flex-wrap items-center justify-between gap-3 py-2 px-3 rounded-lg bg-muted/50 border shrink-0">
              <span className="font-mono font-semibold tabular-nums text-sm text-muted-foreground">
                {secondsRemaining != null ? formatTime(secondsRemaining) : "--:--"} left
              </span>
              <div className="flex flex-wrap gap-1.5 items-center">
                {questions.map((q, i) => {
                  const answered = answers[q.id] != null && answers[q.id] !== "";
                  const markedReview = reviewed.has(q.id);
                  const hasVisited = visited.has(q.id);
                  const current = i === currentIndex;
                  const status = current
                    ? "current"
                    : answered
                      ? "answered"
                      : markedReview
                        ? "reviewed"
                        : hasVisited && !answered
                          ? "skipped"
                          : "unvisited";
                  return (
                    <button
                      key={q.id}
                      type="button"
                      onClick={() => goToQuestion(i)}
                      disabled={inTest && !isFullScreen}
                      className={`w-8 h-8 rounded-md text-sm font-medium transition-colors ${
                        status === "current"
                          ? "ring-2 ring-primary bg-primary text-primary-foreground"
                          : status === "answered"
                            ? "bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 border border-emerald-500/40"
                            : status === "reviewed"
                              ? "bg-blue-500/20 text-blue-700 dark:text-blue-400 border border-blue-500/40"
                              : status === "skipped"
                                ? "bg-destructive/20 text-destructive border border-destructive/40 hover:bg-destructive/30"
                                : "bg-muted text-muted-foreground border border-border hover:bg-muted/80"
                      }`}
                      title={
                        status === "current"
                          ? `Q${i + 1}: Current`
                          : status === "answered"
                            ? `Q${i + 1}: Answered`
                            : status === "reviewed"
                              ? `Q${i + 1}: Marked for review`
                              : status === "skipped"
                                ? `Q${i + 1}: Skipped`
                                : `Q${i + 1}: Not visited`
                      }
                    >
                      {i + 1}
                    </button>
                  );
                })}
              </div>
            </div>
            <TestProctoringBar tabSwitchCount={tabSwitchCount} maxTabSwitches={MAX_TAB_SWITCHES} />
            <div className="flex-1 flex flex-col min-h-0 overflow-auto">
              {currentQuestion && (
                <div key={currentQuestion.id} className="flex flex-col flex-1 min-h-0 gap-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <p className="font-medium text-xl sm:text-2xl flex-1 leading-snug">
                      Q{currentIndex + 1} <span className="text-base font-normal text-muted-foreground">({currentQuestion.marks ?? 1} mark{((currentQuestion.marks ?? 1) > 1) ? "s" : ""})</span>
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
                  <div className="grid gap-3 sm:grid-cols-2 flex-1 content-start">
                    {currentQuestion.options.map((opt, i) => {
                      const selected = answers[currentQuestion.id] === opt;
                      return (
                        <Button
                          key={i}
                          type="button"
                          variant={selected ? "default" : "outline"}
                          className="h-auto min-h-[3.5rem] py-4 px-5 justify-start text-left whitespace-normal leading-relaxed text-base"
                          onClick={() =>
                            setAnswers((prev) => ({
                              ...prev,
                              [currentQuestion.id]: answers[currentQuestion.id] === opt ? "" : opt,
                            }))
                          }
                        >
                          <span className="mr-3 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-sm font-semibold">
                            {String.fromCharCode(65 + i)}
                          </span>
                          <span>{opt}</span>
                        </Button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
            {!isFullScreen && inTest && (
              <div className="rounded-lg border-2 border-amber-500/50 bg-amber-500/10 p-3 flex flex-wrap items-center justify-between gap-3 shrink-0">
                <span className="text-sm font-medium text-amber-800 dark:text-amber-200">
                  Enter full screen to proceed.
                </span>
                <FullScreenMonitor active={inTest} />
              </div>
            )}
            <div className="flex flex-wrap items-end justify-between gap-4 pt-4 border-t shrink-0">
              <div className="flex gap-2 flex-wrap items-center">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => goToQuestion(Math.max(0, currentIndex - 1))}
                  disabled={isFirstQuestion || (inTest && !isFullScreen)}
                >
                  <ChevronLeft className="h-4 w-4 mr-1" />
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={clearCurrentAnswer}
                  disabled={!currentQuestion || !answers[currentQuestion.id] || (inTest && !isFullScreen)}
                  title="Clear selected option for this question"
                >
                  <RotateCcw className="h-4 w-4 mr-1" />
                  Clear
                </Button>
                {!isLastQuestion ? (
                  <Button
                    size="sm"
                    onClick={() => goToQuestion(Math.min(questions.length - 1, currentIndex + 1))}
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
                <span className="text-sm text-muted-foreground ml-2">
                  {currentIndex + 1} / {questions.length}
                </span>
              </div>
              <LiveProctoringPreview
                cameraStream={proctoringState?.cameraStream ?? null}
                brandName="ProvenHire"
                position="bottom-inside"
              />
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
};

export default AptitudeTestStage;
