import { useState, useRef, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { api, getAuthToken } from "@/lib/api";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { useDeepgramSession } from "@/hooks/useDeepgramSession";
import { useProctoringRiskMonitor, type ProctoringEventCode, type StrikeTerminationMode } from "@/hooks/useProctoringRiskMonitor";
import { useFaceAndPhoneDetection } from "@/hooks/useFaceAndPhoneDetection";
import { useFeatureFlags } from "@/hooks/useFeatureFlags";
import { Mic, Video, VideoOff, Shield } from "lucide-react";

const PERSONA_DESC: Record<string, string> = {
  curious_lead: "Exploring your ownership & decisions",
  socratic_mentor: "Testing your first principles",
  senior_peer: "Stress-testing your architecture",
};

const EXPERIENCE_OPTIONS = [
  { value: "junior", label: "0–2 years (Junior)" },
  { value: "mid", label: "2–5 years (Mid)" },
  { value: "senior", label: "5+ years (Senior)" },
] as const;

const INTERVIEW_ROLES = [
  "Backend Developer",
  "Frontend Developer",
  "Full Stack Developer",
  "Data Scientist",
  "DevOps Engineer",
  "ML Engineer",
  "Mobile Developer",
  "QA Engineer",
  "Software Engineer",
  "Other Technical Role",
];

export interface ExpertInterviewStageProps {
  targetJobTitle?: string;
  onReturnToDashboard?: () => void;
  onInterviewAwaitingReview?: () => void;
}

async function speakText(text: string, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) return;
  try {
    const res = await fetch("/api/interview/tts", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${getAuthToken()}`,
      },
      body: JSON.stringify({ text }),
      signal,
    });
    if (!res.ok || !res.body) throw new Error("TTS failed");
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    await new Promise<void>((resolve) => {
      const audio = new Audio(url);
      const cleanup = () => {
        URL.revokeObjectURL(url);
        resolve();
      };
      const onAbort = () => {
        audio.pause();
        cleanup();
      };
      signal?.addEventListener("abort", onAbort);
      audio.onended = () => {
        signal?.removeEventListener("abort", onAbort);
        cleanup();
      };
      audio.onerror = () => {
        signal?.removeEventListener("abort", onAbort);
        cleanup();
      };
      audio.play().catch(() => {
        signal?.removeEventListener("abort", onAbort);
        void fallbackSpeak(text, signal).finally(cleanup);
      });
    });
  } catch {
    await fallbackSpeak(text, signal);
  }
}

function fallbackSpeak(text: string, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (!window.speechSynthesis || signal?.aborted) {
      resolve();
      return;
    }
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 0.95;
    const onAbort = () => {
      window.speechSynthesis.cancel();
      signal?.removeEventListener("abort", onAbort);
      resolve();
    };
    signal?.addEventListener("abort", onAbort);
    u.onend = () => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    };
    u.onerror = () => resolve();
    window.speechSynthesis.speak(u);
  });
}

export default function ExpertInterviewStage({
  targetJobTitle = "",
  onReturnToDashboard,
  onInterviewAwaitingReview,
}: ExpertInterviewStageProps) {
  const { user } = useAuth();
  const { getMode } = useFeatureFlags();

  const [jobRole, setJobRole] = useState(
    targetJobTitle && INTERVIEW_ROLES.includes(targetJobTitle) ? targetJobTitle : "Software Engineer"
  );
  const [experienceLevel, setExperienceLevel] = useState<"junior" | "mid" | "senior">("mid");

  const [interviewId, setInterviewId] = useState<string | null>(null);
  const [started, setStarted] = useState(false);
  const [outcome, setOutcome] = useState<{
    terminatedByProctoring?: boolean;
    totalScore?: number;
    badgeLevel?: string;
    evaluation?: Record<string, unknown>;
  } | null>(null);

  const [loading, setLoading] = useState(false);
  const [currentQuestion, setCurrentQuestion] = useState<string>("");
  const [sprint, setSprint] = useState(1);
  const [sprintName, setSprintName] = useState("Project Defense");
  const [persona, setPersona] = useState("curious_lead");
  const [questionCount, setQuestionCount] = useState(0);
  const [partial, setPartial] = useState("");
  const [weakness, setWeakness] = useState<Record<string, unknown> | null>(null);
  const [cameraActive, setCameraActive] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const processingRef = useRef(false);
  const questionShownAtRef = useRef(Date.now());
  const aiSpeakRef = useRef<(text: string) => Promise<void>>(async () => {});

  const inTest = Boolean(interviewId) && !outcome;

  const isFlagEnabled = (name: string) => getMode(name) === "MONITOR" || getMode(name) === "STRICT";
  const strikeTerminationMode = getMode("proctoring_strike_termination") as StrikeTerminationMode;

  const terminateForProctoring = useCallback((reason: ProctoringEventCode) => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    setCameraActive(false);
    setOutcome({ terminatedByProctoring: true, totalScore: 0, badgeLevel: "Not Verified" });
    void reason;
  }, []);

  const { violationSessionLevel, totalLoggedViolations } = useProctoringRiskMonitor({
    enabled: inTest,
    candidateId: user?.id,
    testId: interviewId ?? `AI_INTERVIEW_${Date.now()}`,
    testType: "ai_interview",
    cameraStream: cameraActive ? streamRef.current : null,
    microphoneStream: null,
    tabSwitchDetectionEnabled: isFlagEnabled("tab_switch_detection"),
    copyPasteDetectionEnabled: isFlagEnabled("copy_paste_detection"),
    devtoolsDetectionEnabled: isFlagEnabled("devtools_detection"),
    fullscreenDetectionEnabled: isFlagEnabled("fullscreen_required"),
    multipleFaceDetectionEnabled: isFlagEnabled("multiple_face_detection"),
    microphoneMonitoringEnabled: isFlagEnabled("microphone_monitoring"),
    maxTabSwitches: 999,
    strikeTerminationMode,
    onProctoringTerminated: strikeTerminationMode === "STRICT" ? terminateForProctoring : undefined,
  });

  useFaceAndPhoneDetection({
    videoRef,
    sessionId: interviewId ?? `AI_INTERVIEW_${Date.now()}`,
    testType: "ai_interview",
    userId: user?.id,
    enabled: inTest && cameraActive,
    onServerAction: (action, evt) => {
      if (action === "STOP_TEST") terminateForProctoring(evt as ProctoringEventCode);
    },
  });

  const deepgramSession = useDeepgramSession({
    interviewId,
    onPartial: setPartial,
    onError: (err) => toast.error(err),
    onFinal: async (text) => {
      if (processingRef.current || !interviewId) return;
      processingRef.current = true;

      setPartial("");

      let fillerAc = new AbortController();
      try {
        const fillerRes = await fetch("/api/interview/tts-filler", {
          headers: { Authorization: `Bearer ${getAuthToken()}` },
        }).then((r) => r.json() as Promise<{ text?: string }>);
        fillerAc = new AbortController();
        abortRef.current = fillerAc;
        deepgramSession.setAbortController(fillerAc);
        deepgramSession.transition("ai_thinking");
        void speakText(fillerRes.text ?? "Hmm...", fillerAc.signal);
      } catch {
        fillerAc = new AbortController();
      }

      try {
        const timeToSubmit = Math.floor((Date.now() - questionShownAtRef.current) / 1000);

        const turnResult = await api.post<{
          response: string;
          sprint: number;
          sprintName: string;
          persona: string;
          complete: boolean;
          weakness?: Record<string, unknown>;
          questionCount: number;
          totalScore?: number;
          badgeLevel?: string;
          evaluation?: Record<string, unknown>;
        }>("/api/interview/v2/turn", {
          interviewId,
          answer: text,
          inputMode: "voice",
          timeToSubmitSeconds: timeToSubmit,
        });

        fillerAc.abort();

        setWeakness(turnResult.weakness ?? null);
        setQuestionCount(turnResult.questionCount);
        setSprint(turnResult.sprint);
        setSprintName(turnResult.sprintName);
        setPersona(turnResult.persona);
        setCurrentQuestion(turnResult.response);
        questionShownAtRef.current = Date.now();

        if (turnResult.complete) {
          setOutcome({
            totalScore: turnResult.totalScore,
            badgeLevel: turnResult.badgeLevel,
            evaluation: turnResult.evaluation,
          });
          streamRef.current?.getTracks().forEach((t) => t.stop());
          setCameraActive(false);
          deepgramSession.stop();
          onInterviewAwaitingReview?.();
        } else {
          await aiSpeakRef.current(turnResult.response);
        }
      } catch {
        fillerAc.abort();
        toast.error("Interview error — please try again.");
        deepgramSession.transition("user_speaking");
      } finally {
        processingRef.current = false;
      }
    },
  });

  const aiSpeak = useCallback(
    async (text: string) => {
      abortRef.current?.abort();
      const ac = new AbortController();
      abortRef.current = ac;
      deepgramSession.setAbortController(ac);
      deepgramSession.transition("ai_speaking");
      try {
        await speakText(text, ac.signal);
      } catch {
        /* fallback inside speakText */
      }
      if (!ac.signal.aborted) {
        deepgramSession.transition("user_speaking");
      }
    },
    [deepgramSession]
  );

  useEffect(() => {
    aiSpeakRef.current = aiSpeak;
  }, [aiSpeak]);

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      streamRef.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;
      setCameraActive(true);
    } catch {
      toast.error("Camera access denied.");
    }
  };

  const stopCamera = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setCameraActive(false);
  };

  const startInterview = async () => {
    setLoading(true);
    try {
      await document.documentElement.requestFullscreen().catch(() => {});

      const res = await api.post<{
        interviewId: string;
        question: string;
        sprint: number;
        sprintName: string;
        persona: string;
      }>("/api/interview/v2/start", {
        jobRole: jobRole === "Other Technical Role" ? targetJobTitle || "Software Engineer" : jobRole,
        experienceLevel,
      });

      setInterviewId(res.interviewId);
      setSprint(res.sprint);
      setSprintName(res.sprintName);
      setPersona(res.persona);
      setCurrentQuestion(res.question);
      questionShownAtRef.current = Date.now();

      setStarted(true);

      await startCamera();
      await deepgramSession.start();

      await aiSpeakRef.current(res.question);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Failed to start interview.";
      toast.error(msg);
      setStarted(false);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      deepgramSession.stop();
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, [deepgramSession]);

  const progressPct = Math.min((questionCount / 15) * 100, 100);
  const evaluation = outcome?.evaluation;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" />
            AI Expert Interview
          </CardTitle>
          <CardDescription>
            3-sprint adversarial interview — Project Defense → Foundations → System Design. Voice-first. Camera
            required for proctoring.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {!started && (
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium mb-2 block">Target role</label>
                <Select value={jobRole} onValueChange={setJobRole}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {INTERVIEW_ROLES.map((r) => (
                      <SelectItem key={r} value={r}>
                        {r}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium mb-2 block">Experience level</label>
                <Select
                  value={experienceLevel}
                  onValueChange={(v) => setExperienceLevel(v as "junior" | "mid" | "senior")}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {EXPERIENCE_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex gap-2 flex-wrap">
                <Button onClick={() => void startInterview()} disabled={loading} size="lg">
                  {loading ? "Starting..." : "Start Interview →"}
                </Button>
                {onReturnToDashboard && (
                  <Button variant="outline" onClick={onReturnToDashboard}>
                    Return to Dashboard
                  </Button>
                )}
              </div>
            </div>
          )}

          {started && !outcome && (
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-4 flex-wrap">
                <div className="flex items-center gap-2 text-sm flex-wrap">
                  <span className="font-semibold text-primary">Sprint {sprint}</span>
                  <span className="text-muted-foreground">—</span>
                  <span className="text-muted-foreground">{sprintName}</span>
                  <span className="text-xs text-muted-foreground italic ml-2">{PERSONA_DESC[persona]}</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-24 h-1.5 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-primary rounded-full transition-all"
                      style={{ width: `${progressPct}%` }}
                    />
                  </div>
                  <span className="text-xs text-muted-foreground tabular-nums">{questionCount}/15</span>
                </div>
              </div>

              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <div
                  className={`w-1.5 h-1.5 rounded-full ${
                    violationSessionLevel === "high_attention"
                      ? "bg-red-500"
                      : violationSessionLevel === "elevated"
                        ? "bg-amber-500"
                        : "bg-green-500"
                  }`}
                />
                <span>
                  {violationSessionLevel === "high_attention"
                    ? "High attention"
                    : violationSessionLevel === "elevated"
                      ? "Elevated"
                      : "Proctoring baseline"}
                </span>
                <span className="tabular-nums">({totalLoggedViolations} alerts)</span>
              </div>

              <div className="aspect-video max-w-xs rounded-xl border-2 border-primary/20 bg-muted overflow-hidden relative">
                {cameraActive ? (
                  <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <Button variant="secondary" size="sm" onClick={() => void startCamera()}>
                      <Video className="h-4 w-4 mr-2" />
                      Turn on camera
                    </Button>
                  </div>
                )}
                {cameraActive && (
                  <button
                    type="button"
                    onClick={stopCamera}
                    className="absolute top-2 right-2 p-1 rounded bg-black/50 text-white"
                    aria-label="Stop camera"
                  >
                    <VideoOff className="h-3 w-3" />
                  </button>
                )}
              </div>

              {currentQuestion && (
                <div className="rounded-xl border-2 border-primary/20 bg-primary/5 p-5">
                  <p className="text-xs text-primary font-medium mb-2 uppercase tracking-wide">AI is asking</p>
                  <p className="text-base font-medium">{currentQuestion}</p>
                </div>
              )}

              <div className="flex items-center gap-3 text-sm flex-wrap">
                <div
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-full border ${
                    deepgramSession.floor === "user_speaking"
                      ? "border-green-500/30 bg-green-500/10 text-green-700 dark:text-green-300"
                      : deepgramSession.floor === "ai_thinking"
                        ? "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300"
                        : deepgramSession.floor === "ai_speaking"
                          ? "border-blue-500/30 bg-blue-500/10 text-blue-700 dark:text-blue-300"
                          : "border-muted bg-muted/30 text-muted-foreground"
                  }`}
                >
                  <Mic className="h-3.5 w-3.5 shrink-0" />
                  <span className="text-xs font-medium uppercase tracking-wide">
                    {deepgramSession.floor === "user_speaking"
                      ? "Listening to you"
                      : deepgramSession.floor === "ai_thinking"
                        ? "AI thinking..."
                        : deepgramSession.floor === "ai_speaking"
                          ? "AI speaking"
                          : "Idle"}
                  </span>
                </div>
                {weakness?.severity === "high" && (
                  <span className="text-xs px-2 py-1 rounded-full bg-red-500/10 text-red-600 border border-red-500/20 animate-pulse">
                    Probing weakness
                  </span>
                )}
              </div>

              {partial && (
                <div className="rounded-lg border bg-muted/30 px-4 py-2 text-sm text-muted-foreground italic">
                  {partial}
                </div>
              )}

              {deepgramSession.floor === "user_speaking" && (
                <div className="flex items-end gap-1 h-8">
                  {Array.from({ length: 20 }).map((_, i) => (
                    <div
                      key={i}
                      className="flex-1 bg-primary/60 rounded-full transition-all duration-75 min-h-[4px]"
                      style={{
                        height: `${Math.max(15, Math.min(100, deepgramSession.micLevel * 100 + (i % 3) * 5))}%`,
                      }}
                    />
                  ))}
                </div>
              )}

            </div>
          )}

          {outcome && (
            <div className="rounded-lg border border-primary/30 bg-primary/5 p-5 space-y-3">
              {outcome.terminatedByProctoring ? (
                <>
                  <h4 className="font-semibold text-destructive">Interview ended</h4>
                  <p className="text-sm text-muted-foreground">
                    Session stopped after repeated integrity alerts.
                  </p>
                  {onReturnToDashboard && (
                    <Button variant="outline" onClick={onReturnToDashboard}>
                      Return to Dashboard
                    </Button>
                  )}
                </>
              ) : (
                <>
                  <h4 className="font-semibold">Interview complete</h4>
                  <div className="flex flex-wrap gap-3 items-center">
                    {outcome.totalScore != null && (
                      <span className="text-sm">
                        Score:{" "}
                        <strong className="text-lg">
                          {outcome.totalScore}/100
                        </strong>
                      </span>
                    )}
                    <span className="px-2 py-0.5 rounded bg-primary/20 text-primary text-sm">
                      {outcome.badgeLevel || "Processing..."}
                    </span>
                  </div>
                  {evaluation?.final_verdict != null && (
                    <p className="text-sm text-muted-foreground">{String(evaluation.final_verdict)}</p>
                  )}
                  {Array.isArray(evaluation?.strengths) && (evaluation.strengths as unknown[]).length > 0 && (
                    <div>
                      <p className="text-sm font-medium text-green-600 mb-1">What you did well</p>
                      <ul className="list-disc list-inside text-sm text-muted-foreground">
                        {(evaluation.strengths as string[]).map((s) => (
                          <li key={s}>{s}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {Array.isArray(evaluation?.weaknesses) && (evaluation.weaknesses as unknown[]).length > 0 && (
                    <div>
                      <p className="text-sm font-medium text-amber-600 mb-1">Areas to improve</p>
                      <ul className="list-disc list-inside text-sm text-muted-foreground">
                        {(evaluation.weaknesses as string[]).map((w) => (
                          <li key={w}>{w}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {onReturnToDashboard && (
                    <Button variant="outline" onClick={onReturnToDashboard} className="mt-2">
                      Return to Dashboard
                    </Button>
                  )}
                </>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
