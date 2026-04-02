import { useState, useEffect, useLayoutEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { api, BACKEND_DOWN_MSG } from "@/lib/api";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import TestProctoringBar from "@/components/TestProctoringBar";
import ProctoringSetupGate from "@/components/ProctoringSetupGate";
import SoundDetectedAlert from "@/components/SoundDetectedAlert";
import FullScreenMonitor from "@/components/FullScreenMonitor";
import type { ProctoringState } from "@/components/ProctoringSetupGate";
import { useSoundDetection } from "@/hooks/useSoundDetection";
import { useFullScreenState } from "@/hooks/useFullScreenState";
import { useProctoringRiskMonitor, type ProctoringEventCode, type StrikeTerminationMode } from "@/hooks/useProctoringRiskMonitor";
import { useProctorFrameCapture } from "@/hooks/useProctorFrameCapture";
import { useFeatureFlags } from "@/hooks/useFeatureFlags";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Loader2, ChevronLeft, ChevronRight, RotateCcw, Bookmark, BookmarkCheck, CircleHelp, Sparkles, Trophy, Target } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const APTITUDE_TIME_MINUTES = 30; // 30 minutes total

const COGNITIVE_SET_COPY: Record<string, string> = {
  aptitude_mixed: "Mixed cognitive items: reasoning, quantitative, and verbal.",
  cs_fundamentals_medium: "CS fundamentals emphasis — medium difficulty.",
  cs_fundamentals_advanced: "CS fundamentals emphasis — advanced difficulty.",
};

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
  const [submitConfirmOpen, setSubmitConfirmOpen] = useState(false);
  const [breakdown, setBreakdown] = useState<{ correct: number; incorrect: number; skipped: number; totalQuestions: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const [justPassed, setJustPassed] = useState(false);
  const [soundAlertOpen, setSoundAlertOpen] = useState(false);
  const [backendUnavailable, setBackendUnavailable] = useState(false);
  const [checkingBackend, setCheckingBackend] = useState(false);
  const submittingRef = useRef(false);
  const proctorVideoRef = useRef<HTMLVideoElement | null>(null);

  const CAMERA_WIDGET_W = 180;
  const CAMERA_WIDGET_EST_H = 160;
  const [cameraWidgetPos, setCameraWidgetPos] = useState({ x: 0, y: 0 });
  const [cameraWidgetDragging, setCameraWidgetDragging] = useState(false);
  const cameraWidgetDragRef = useRef(false);
  const cameraWidgetOffsetRef = useRef({ x: 0, y: 0 });

  const clampCameraWidgetPos = useCallback((x: number, y: number) => {
    const maxX = Math.max(0, window.innerWidth - CAMERA_WIDGET_W);
    const maxY = Math.max(0, window.innerHeight - CAMERA_WIDGET_EST_H);
    return { x: Math.max(0, Math.min(x, maxX)), y: Math.max(0, Math.min(y, maxY)) };
  }, []);

  useLayoutEffect(() => {
    if (typeof window === "undefined") return;
    const margin = 20;
    setCameraWidgetPos(
      clampCameraWidgetPos(
        window.innerWidth - CAMERA_WIDGET_W - margin,
        window.innerHeight - CAMERA_WIDGET_EST_H - margin
      )
    );
  }, [clampCameraWidgetPos]);

  useEffect(() => {
    const onResize = () => {
      setCameraWidgetPos((prev) => clampCameraWidgetPos(prev.x, prev.y));
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [clampCameraWidgetPos]);

  useEffect(() => {
    const onMoveMouse = (e: MouseEvent) => {
      if (!cameraWidgetDragRef.current) return;
      setCameraWidgetPos(
        clampCameraWidgetPos(
          e.clientX - cameraWidgetOffsetRef.current.x,
          e.clientY - cameraWidgetOffsetRef.current.y
        )
      );
    };
    const onMoveTouch = (e: TouchEvent) => {
      if (!cameraWidgetDragRef.current || !e.touches[0]) return;
      e.preventDefault();
      const t = e.touches[0];
      setCameraWidgetPos(
        clampCameraWidgetPos(
          t.clientX - cameraWidgetOffsetRef.current.x,
          t.clientY - cameraWidgetOffsetRef.current.y
        )
      );
    };
    const endDrag = () => {
      cameraWidgetDragRef.current = false;
      setCameraWidgetDragging(false);
    };
    window.addEventListener("mousemove", onMoveMouse);
    window.addEventListener("mouseup", endDrag);
    window.addEventListener("touchmove", onMoveTouch, { passive: false });
    window.addEventListener("touchend", endDrag);
    window.addEventListener("touchcancel", endDrag);
    return () => {
      window.removeEventListener("mousemove", onMoveMouse);
      window.removeEventListener("mouseup", endDrag);
      window.removeEventListener("touchmove", onMoveTouch);
      window.removeEventListener("touchend", endDrag);
      window.removeEventListener("touchcancel", endDrag);
    };
  }, [clampCameraWidgetPos]);

  const onCameraWidgetMouseDown = (e: React.MouseEvent) => {
    cameraWidgetDragRef.current = true;
    setCameraWidgetDragging(true);
    cameraWidgetOffsetRef.current = {
      x: e.clientX - cameraWidgetPos.x,
      y: e.clientY - cameraWidgetPos.y,
    };
    e.preventDefault();
  };

  const onCameraWidgetTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0];
    if (!t) return;
    cameraWidgetDragRef.current = true;
    setCameraWidgetDragging(true);
    cameraWidgetOffsetRef.current = {
      x: t.clientX - cameraWidgetPos.x,
      y: t.clientY - cameraWidgetPos.y,
    };
  };

  const checkBackend = useCallback(async () => {
    setCheckingBackend(true);
    try {
      // Cache-bust so we never use a stale 200 when the backend is down
      const res = await fetch(`/api/health?_=${Date.now()}`, {
        method: "GET",
        cache: "no-store",
        headers: { Pragma: "no-cache", "Cache-Control": "no-cache" },
      });
      if (res.ok) {
        setBackendUnavailable(false);
        return true;
      }
      setBackendUnavailable(true);
      return false;
    } catch {
      setBackendUnavailable(true);
      return false;
    } finally {
      setCheckingBackend(false);
    }
  }, []);
  const isFailed = stageStatus === "failed" || (submitted && !justPassed);

  const inTest = proctoringReady && !justPassed && !isFailed && questions.length > 0;
  const isFullScreen = useFullScreenState(inTest);
  const { getMode: getFlagMode } = useFeatureFlags();
  const isFlagEnabled = (name: string) => getFlagMode(name) === "MONITOR" || getFlagMode(name) === "STRICT";
  const fullscreenRequired = isFlagEnabled("fullscreen_required");
  const effectivelyFullScreen = !fullscreenRequired || isFullScreen;
  const tabSwitchMode = getFlagMode("tab_switch_detection");
  const tabSwitchDetectionEnabled = isFlagEnabled("tab_switch_detection");
  const strikeTerminationMode = getFlagMode("proctoring_strike_termination") as StrikeTerminationMode;
  const MAX_TAB_SWITCHES = tabSwitchMode === "STRICT" ? 3 : 999;

  const terminateAptitudeForProctoring = useCallback(
    (_reason: ProctoringEventCode) => {
      if (questions.length > 0 && !submittingRef.current) {
        void api.post("/api/verification/aptitude", { answers: {}, invalidated: true }).catch(() => {});
        void api.post("/api/verification/stages/update", { stageName: "aptitude_test", status: "failed", score: 0 }).catch(() => {});
        setSubmitted(true);
        setSubmittedScore(0);
      }
    },
    [questions.length]
  );

  const { tabSwitchCount } = useProctoringRiskMonitor({
    enabled: inTest,
    candidateId: user?.id,
    testId: testIdRef.current,
    testType: "aptitude",
    cameraStream: proctoringState?.cameraStream ?? null,
    microphoneStream: proctoringState?.microphoneStream ?? null,
    tabSwitchDetectionEnabled,
    copyPasteDetectionEnabled: isFlagEnabled("copy_paste_detection"),
    devtoolsDetectionEnabled: isFlagEnabled("devtools_detection"),
    fullscreenDetectionEnabled: isFlagEnabled("fullscreen_required"),
    // Enables BlazeFace + COCO-SSD in useProctoringRiskMonitor: multi-face, phone, no-face, low visibility, looking away.
    multipleFaceDetectionEnabled:
      isFlagEnabled("multiple_face_detection") || isFlagEnabled("camera_required"),
    proctorVideoRef,
    microphoneMonitoringEnabled: isFlagEnabled("microphone_monitoring"),
    maxTabSwitches: MAX_TAB_SWITCHES,
    strikeTerminationMode,
    onProctoringTerminated: terminateAptitudeForProctoring,
    onMaxTabSwitches:
      strikeTerminationMode !== "STRICT" && tabSwitchMode === "STRICT"
        ? () => {
            if (questions.length > 0 && !submittingRef.current) {
              toast.error("Test terminated due to tab switching. Maximum 3 switches allowed.");
              void api.post("/api/verification/aptitude", { answers: {}, invalidated: true }).catch(() => {});
              void api.post("/api/verification/stages/update", { stageName: "aptitude_test", status: "failed", score: 0 }).catch(() => {});
              setSubmitted(true);
              setSubmittedScore(0);
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
    testType: "aptitude",
    cameraStream: proctoringState?.cameraStream ?? null,
  });

  useEffect(() => {
    const stream = proctoringState?.cameraStream ?? null;
    if (!proctorVideoRef.current) return;
    proctorVideoRef.current.srcObject = stream;
  }, [proctoringState?.cameraStream]);

  const [timeLimitMinutes, setTimeLimitMinutes] = useState(APTITUDE_TIME_MINUTES);
  const [cognitiveSetCopy, setCognitiveSetCopy] = useState<string | null>(null);
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
          questionSet?: string;
          experienceTier?: string;
          draft?: {
            answers?: Record<string, string>;
            reviewed?: string[];
            visited?: string[];
            currentIndex?: number;
            secondsRemaining?: number;
          } | null;
        }>("/api/verification/aptitude/questions");
        setQuestions(res.questions ?? []);
        const qs = res.questionSet;
        if (typeof qs === "string" && COGNITIVE_SET_COPY[qs]) {
          setCognitiveSetCopy(COGNITIVE_SET_COPY[qs]);
        } else {
          setCognitiveSetCopy(null);
        }
        const mins = res.timeLimitMinutes ?? APTITUDE_TIME_MINUTES;
        setTimeLimitMinutes(mins);
        const draft = res.draft ?? null;
        if (draft?.answers && typeof draft.answers === "object") {
          setAnswers(draft.answers);
        }
        if (Array.isArray(draft?.reviewed)) {
          setReviewed(new Set(draft.reviewed));
        }
        if (Array.isArray(draft?.visited)) {
          setVisited(new Set(draft.visited));
        }
        if (typeof draft?.currentIndex === "number" && draft.currentIndex >= 0) {
          setCurrentIndex(draft.currentIndex);
        }
        if (typeof draft?.secondsRemaining === "number" && draft.secondsRemaining >= 0) {
          setSecondsRemaining(draft.secondsRemaining);
        } else {
          setSecondsRemaining(mins * 60);
        }
        setTotalMarks(res.totalMarks ?? 20);
        setPassThreshold(res.passThreshold ?? 12);
      } catch (e: unknown) {
        const err = e as Error & { response?: { data?: { error?: string } }; status?: number };
        const msg = err.response?.data?.error ?? err.message;
        const code = err.response?.data?.code;
        const status = err.status;
        if (status === 503 || (typeof msg === "string" && (msg.includes("Backend not running") || msg.includes("temporarily unavailable")))) {
          setBackendUnavailable(true);
        }
        const userMsg =
          code === "SKILL_ACTIVE"
            ? msg
            : typeof msg === "string" && msg.length > 0 && msg !== "Request failed"
              ? msg
              : "Failed to load assessment questions. Please refresh.";
        toast.error(userMsg);
      } finally {
        setLoadingQuestions(false);
      }
    })();
  }, []);

  // Autosave aptitude progress (answers, visited, review marks, timer) to backend session draft.
  const draftSaveTimerRef = useRef<number | null>(null);
  useEffect(() => {
    if (!inTest) return;
    if (questions.length === 0) return;
    if (secondsRemaining == null) return;
    if (loading) return;
    if (draftSaveTimerRef.current != null) window.clearTimeout(draftSaveTimerRef.current);
    draftSaveTimerRef.current = window.setTimeout(() => {
      void api
        .post("/api/verification/aptitude/draft", {
          answers,
          reviewed: Array.from(reviewed),
          visited: Array.from(visited),
          currentIndex,
          secondsRemaining,
        })
        .catch(() => {});
    }, 700);
    return () => {
      if (draftSaveTimerRef.current != null) window.clearTimeout(draftSaveTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: save on these state changes while test is active
  }, [inTest, questions.length, answers, reviewed, visited, currentIndex, secondsRemaining, loading]);

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

  // When test is active, check backend once so we can show banner and block submit if down
  useEffect(() => {
    if (!inTest) return;
    checkBackend();
  }, [inTest, checkBackend]);

  const handleSubmit = async () => {
    if (questions.length === 0) return;
    if (submittingRef.current) return; // Double-submit guard
    const ok = await checkBackend();
    if (!ok) {
      toast.error(BACKEND_DOWN_MSG);
      return;
    }
    submittingRef.current = true;
    setLoading(true);
    try {
      const res = await api.post<{ result: { score?: number }; score?: number; breakdown?: any }>(
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
      if (res.breakdown) {
        setBreakdown({
          totalQuestions: Number(res.breakdown.totalQuestions ?? questions.length),
          correct: Number(res.breakdown.correct ?? 0),
          incorrect: Number(res.breakdown.incorrect ?? 0),
          skipped: Number(res.breakdown.skipped ?? 0),
        });
      } else {
        setBreakdown(null);
      }
      // Backend POST /aptitude already stores percent in VerificationStage; do not send raw marks
      // so resume/profile APIs show percent consistently (not marks).
      const stagePayload = { stageName: "aptitude_test" as const, status: score >= passThreshold ? "completed" : "failed" as const };
      const scorePct = totalMarks > 0 ? Math.round((score / totalMarks) * 100) : 0;
      if (score >= passThreshold) {
        setSubmittedScore(score); // keep for "Your current score: X%" in success block
        await api.post("/api/verification/stages/update", stagePayload);
        toast.success(`Boom! Level 1 unlocked. Cognitive Assessment score: ${scorePct}%.`);
        setJustPassed(true);
      } else {
        await api.post("/api/verification/stages/update", stagePayload);
        setSubmittedScore(score);
        setSubmitted(true);
        toast.error(`Score ${scorePct}%. Minimum ${totalMarks > 0 ? Math.round((passThreshold / totalMarks) * 100) : passThreshold}% required to proceed. You can retry when ready.`);
      }
    } catch (error: unknown) {
      const status = (error as { status?: number })?.status;
      const msg = error instanceof Error ? error.message : "Failed to submit Cognitive Assessment.";
      const isDatabaseUnavailable = status === 503 && (msg.includes("Database temporarily") || msg.includes("database"));
      const isBackendDown =
        status === 503 &&
        !isDatabaseUnavailable &&
        (msg.includes("Backend not running") ||
          msg.includes("Run npm run dev") ||
          msg.includes("temporarily unavailable") ||
          msg.includes("Cannot reach") ||
          msg.includes("Unable to connect") ||
          msg.includes("Failed to fetch") ||
          msg.includes("Load failed"));
      if (isDatabaseUnavailable) {
        setBackendUnavailable(false);
        toast.error(msg);
        toast.info("Ensure your database is running, then click Submit again.");
      } else if (isBackendDown) {
        setBackendUnavailable(true);
        toast.error(BACKEND_DOWN_MSG);
      } else if (status === 503) {
        setBackendUnavailable(false);
        toast.error(msg);
      } else if (status === 400) {
        toast.error(msg);
        if (msg.toLowerCase().includes("session") && msg.toLowerCase().includes("expired")) {
          toast.info("Go back, click 'Retry This Step', then 'Start Cognitive Assessment' to get a fresh test.");
          onSessionExpired?.();
        }
      } else {
        toast.error(msg);
      }
    } finally {
      setLoading(false);
      submittingRef.current = false;
    }
  };

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

  const answeredCount = questions.reduce((acc, q) => (answers[q.id] != null && answers[q.id] !== "" ? acc + 1 : acc), 0);
  const visitedCount = visited.size;
  const skippedCount = Math.max(0, visitedCount - answeredCount);
  const reviewCount = reviewed.size;
  const unvisitedCount = Math.max(0, questions.length - visitedCount);

  if (loadingQuestions) {
    return (
      <Card>
        <CardContent className="py-12 flex flex-col items-center justify-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Loading assessment questions...</p>
        </CardContent>
      </Card>
    );
  }

  if (questions.length === 0 && !loadingQuestions) {
    return (
      <Card>
        <CardContent className="py-6 space-y-4">
          {backendUnavailable && (
            <div className="rounded-lg border-2 border-amber-500/50 bg-amber-500/10 p-4 flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
                {BACKEND_DOWN_MSG}
              </p>
              <Button variant="outline" size="sm" onClick={() => { checkBackend().then((ok) => { if (ok) { setBackendUnavailable(false); window.location.reload(); } }); }} disabled={checkingBackend}>
                {checkingBackend ? "Checking…" : "Retry"}
              </Button>
            </div>
          )}
          <p className="text-muted-foreground">No questions available. Please try again later.</p>
        </CardContent>
      </Card>
    );
  }

  // When the stage is already failed (e.g. user returning after a previous attempt),
  // show the retry UI directly without requiring proctoring setup again.
  const scorePctDisplay =
    submittedScore != null && totalMarks > 0
      ? Math.round((submittedScore / totalMarks) * 100)
      : typeof stageScore === "number" && stageScore >= 0 && stageScore <= 100
        ? Math.round(stageScore)
        : 0;
  const passThresholdPct = totalMarks > 0 ? Math.round((passThreshold / totalMarks) * 100) : passThreshold;

  // Proctoring is only needed when the user is actually about to take the test.
  if (isFailed && !proctoringReady) {
    return (
      <Card>
        <CardContent className="py-8">
          <div className="rounded-lg border border-amber-500/50 bg-amber-500/10 p-6 text-center space-y-4">
            <p className="font-semibold text-amber-700 dark:text-amber-400">Not yet eligible</p>
            <p className="text-sm text-muted-foreground">
              Your score: {scorePctDisplay}%. Minimum {passThresholdPct}% required to proceed to the DSA round.
            </p>
            <div className="flex flex-wrap gap-3 justify-center pt-2">
              {onRetry ? (
                <Button onClick={onRetry}>Retry test</Button>
              ) : null}
              <Button variant="outline" onClick={() => navigate("/dashboard/jobseeker")}>
                Return to dashboard
              </Button>
            </div>
            {!onRetry ? (
              <p className="text-sm text-muted-foreground">
                You can retry this step from your dashboard when it becomes available.
              </p>
            ) : null}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!proctoringReady) {
    return (
      <ProctoringSetupGate
        testName="Cognitive Assessment"
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
    <Card className="flex flex-col w-full min-h-[calc(100dvh-2rem)] sm:min-h-[calc(100dvh-3rem)] rounded-none sm:rounded-lg border-0 sm:border shadow-none sm:shadow">
      <CardHeader className="py-4 pb-2 shrink-0">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle className="text-lg sm:text-xl">Cognitive Assessment</CardTitle>
            <CardDescription className="text-sm space-y-1">
              {cognitiveSetCopy ? <span className="block text-muted-foreground">{cognitiveSetCopy}</span> : null}
              <span>
                {!isFailed && !justPassed
                  ? `Question ${currentIndex + 1} of ${questions.length}. You need at least ${passThresholdPct}% to pass.`
                  : `You need at least ${passThresholdPct}% to pass.`}
              </span>
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
                    You may see warnings for: no face visible, multiple faces, phone in frame, tab switches, leaving fullscreen, and unusual background audio. Copy-paste is limited but does not use the same strike warnings.
                  </p>
                  <p className="text-xs mt-2">
                    Three repeated alerts for the same rule (for example tab switches or phone in frame) end this attempt when integrity monitoring is not OFF. Tab switching may also end the test after three leaves when tab detection is strict.
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
              Your score: {scorePctDisplay}%. Minimum {passThresholdPct}% required to proceed to the DSA round.
            </p>
            <div className="flex flex-wrap gap-3 justify-center pt-2">
              {onRetry ? <Button onClick={onRetry}>Retry test</Button> : null}
              <Button variant="outline" onClick={() => navigate("/dashboard/jobseeker")}>
                Return to dashboard
              </Button>
            </div>
            {!onRetry ? (
              <p className="text-sm text-muted-foreground">
                You can retry this step from your dashboard when it becomes available.
              </p>
            ) : null}
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
              Strong start. You cleared the Cognitive Assessment and unlocked <span className="font-semibold text-foreground">L1: Cognitive Verified</span>.
              Now keep your momentum and complete DSA + AI Interview + Human Expert Interview to reach <span className="font-semibold text-foreground">Level 3 (Elite Verified)</span>.
            </p>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-lg border bg-background/80 p-3">
                <div className="flex items-center gap-2 text-xs font-semibold text-primary">
                  <Trophy className="h-4 w-4" />
                  L1 Unlocked
                </div>
                <p className="mt-1 text-xs text-muted-foreground">Profile + Cognitive Assessment completed</p>
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
              Your current score: <span className="font-semibold text-foreground">
                {(() => {
                  const pct = (submittedScore != null && totalMarks > 0)
                    ? Math.round((submittedScore / totalMarks) * 100)
                    : (stageScore != null && stageScore <= 100 ? stageScore : null);
                  return pct != null ? `${pct}%` : "—";
                })()}
              </span>. Keep going - each completed stage increases your recruiter visibility.
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
            {backendUnavailable && inTest && (
              <div className="rounded-lg border-2 border-amber-500/50 bg-amber-500/10 p-4 flex flex-wrap items-center justify-between gap-3 shrink-0">
                <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
                  {BACKEND_DOWN_MSG}
                </p>
                <Button variant="outline" size="sm" onClick={() => checkBackend()} disabled={checkingBackend}>
                  {checkingBackend ? "Checking…" : "Retry connection"}
                </Button>
              </div>
            )}
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
                    : markedReview && answered
                      ? "reviewed_answered"
                      : markedReview
                        ? "reviewed"
                        : answered
                          ? "answered"
                          : hasVisited && !answered
                            ? "skipped"
                            : "unvisited";
                  return (
                    <button
                      key={q.id}
                      type="button"
                      onClick={() => goToQuestion(i)}
                      disabled={inTest && !effectivelyFullScreen}
                      className={`w-8 h-8 rounded-md text-sm font-medium transition-colors ${
                        status === "current"
                          ? "ring-2 ring-primary bg-primary text-primary-foreground"
                          : status === "reviewed_answered"
                            ? "bg-violet-500/20 text-violet-700 dark:text-violet-400 border border-violet-500/40"
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
                          : status === "reviewed_answered"
                            ? `Q${i + 1}: Answered (Marked for review)`
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
            <TestProctoringBar tabSwitchCount={tabSwitchCount} maxTabSwitches={MAX_TAB_SWITCHES} showTabSwitch={tabSwitchDetectionEnabled} />
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
            {!effectivelyFullScreen && inTest && fullscreenRequired && (
              <div className="rounded-lg border-2 border-amber-500/50 bg-amber-500/10 p-3 flex flex-wrap items-center justify-between gap-3 shrink-0">
                <span className="text-sm font-medium text-amber-800 dark:text-amber-200">
                  Enter full screen to proceed.
                </span>
                <FullScreenMonitor active={inTest && fullscreenRequired} />
              </div>
            )}
            <div className="flex flex-wrap items-end justify-between gap-4 pt-4 border-t shrink-0">
              <div className="flex gap-2 flex-wrap items-center">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => goToQuestion(Math.max(0, currentIndex - 1))}
                  disabled={isFirstQuestion || (inTest && !effectivelyFullScreen)}
                >
                  <ChevronLeft className="h-4 w-4 mr-1" />
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={clearCurrentAnswer}
                  disabled={!currentQuestion || !answers[currentQuestion.id] || (inTest && !effectivelyFullScreen)}
                  title="Clear selected option for this question"
                >
                  <RotateCcw className="h-4 w-4 mr-1" />
                  Clear
                </Button>
                {!isLastQuestion ? (
                  <Button
                    size="sm"
                    onClick={() => goToQuestion(Math.min(questions.length - 1, currentIndex + 1))}
                    disabled={!canGoNext || (inTest && !effectivelyFullScreen)}
                  >
                    Next question
                    <ChevronRight className="h-4 w-4 ml-1" />
                  </Button>
                ) : (
                  <Button
                    onClick={() => setSubmitConfirmOpen(true)}
                    disabled={loading || backendUnavailable || (inTest && !effectivelyFullScreen)}
                  >
                    {loading ? "Submitting..." : "Submit test"}
                  </Button>
                )}
                <span className="text-sm text-muted-foreground ml-2">
                  {currentIndex + 1} / {questions.length}
                </span>
              </div>
            </div>
            {inTest && (
              <div
                role="presentation"
                onMouseDown={onCameraWidgetMouseDown}
                onTouchStart={onCameraWidgetTouchStart}
                style={{
                  position: "fixed",
                  left: cameraWidgetPos.x,
                  top: cameraWidgetPos.y,
                  width: CAMERA_WIDGET_W,
                  zIndex: 1000,
                  cursor: cameraWidgetDragging ? "grabbing" : "grab",
                  borderRadius: 8,
                  overflow: "hidden",
                  boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
                  border: "2px solid #C9A84C",
                  userSelect: "none",
                  touchAction: "none",
                }}
              >
                <div
                  style={{
                    background: "#1A1A2E",
                    color: "#C9A84C",
                    fontSize: 11,
                    padding: "4px 8px",
                    display: "flex",
                    alignItems: "center",
                    gap: 4,
                  }}
                >
                  ⠿ Camera — drag to move
                </div>
                {proctoringState?.cameraStream ? (
                  <video
                    ref={proctorVideoRef}
                    autoPlay
                    playsInline
                    muted
                    style={{
                      width: "100%",
                      display: "block",
                      background: "#000",
                      aspectRatio: "16/9",
                      objectFit: "cover",
                    }}
                  />
                ) : (
                  <div
                    style={{
                      width: "100%",
                      aspectRatio: "16/9",
                      background: "#111",
                      color: "#888",
                      fontSize: 11,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      padding: 8,
                      textAlign: "center",
                    }}
                  >
                    Camera unavailable
                  </div>
                )}
                <div
                  style={{
                    background: "#1A1A2E",
                    color: "#4CAF50",
                    fontSize: 10,
                    padding: "2px 8px",
                    textAlign: "center",
                  }}
                >
                  ● Proctored
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>
      <Dialog open={submitConfirmOpen} onOpenChange={setSubmitConfirmOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Confirm submission</DialogTitle>
            <DialogDescription>
              You are about to submit your Cognitive Assessment. Review your progress below.
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-md border p-3">
              <div className="text-muted-foreground">Answered</div>
              <div className="text-lg font-semibold">{answeredCount}</div>
            </div>
            <div className="rounded-md border p-3">
              <div className="text-muted-foreground">Marked for review</div>
              <div className="text-lg font-semibold">{reviewCount}</div>
            </div>
            <div className="rounded-md border p-3">
              <div className="text-muted-foreground">Skipped</div>
              <div className="text-lg font-semibold">{skippedCount}</div>
            </div>
            <div className="rounded-md border p-3">
              <div className="text-muted-foreground">Not visited</div>
              <div className="text-lg font-semibold">{unvisitedCount}</div>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setSubmitConfirmOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                setSubmitConfirmOpen(false);
                handleSubmit();
              }}
              disabled={loading || backendUnavailable}
            >
              Submit now
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
};

export default AptitudeTestStage;
