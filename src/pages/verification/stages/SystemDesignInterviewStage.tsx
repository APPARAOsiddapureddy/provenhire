import { useState, useCallback, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api";
import { unlockInterviewAudioOutput, speakText } from "@/lib/interviewTts";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { useFeatureFlags } from "@/hooks/useFeatureFlags";
import { useWhisperSession } from "@/hooks/useWhisperSession";
import {
  useProctoringRiskMonitor,
  type ProctoringEventCode,
  type StrikeTerminationMode,
} from "@/hooks/useProctoringRiskMonitor";
import { Volume2, ArrowLeft, Send, Shield, Video, VideoOff, RotateCcw, Radio, Mic } from "lucide-react";

/** Brief pause after TTS before focusing on writing (typed round; no live mic). */
const POST_AI_SPEECH_COOLDOWN_MS = 400;

export interface SystemDesignInterviewStageProps {
  targetJobTitle?: string;
  onSessionComplete: () => void;
  onReturnToDashboard?: () => void;
  nextStageLabel?: string;
}

export function SystemDesignInterviewStage({
  targetJobTitle = "Software Engineer",
  onSessionComplete,
  onReturnToDashboard,
  nextStageLabel,
}: SystemDesignInterviewStageProps) {
  const { user } = useAuth();
  const { getMode } = useFeatureFlags();

  const [sessionStarted, setSessionStarted] = useState(false);
  const [interviewId, setInterviewId] = useState<string | null>(null);
  const [problemTitle, setProblemTitle] = useState<string | null>(null);
  const [currentQuestion, setCurrentQuestion] = useState("");
  const [phase, setPhase] = useState<"lld" | "hld">("lld");
  const [answerDraft, setAnswerDraft] = useState("");
  const [partial, setPartial] = useState("");
  const [loading, setLoading] = useState(false);
  const [turnBusy, setTurnBusy] = useState(false);
  const [complete, setComplete] = useState(false);
  const [outcome, setOutcome] = useState<{
    pass?: boolean;
    totalScore?: number;
    lldScore?: number;
    hldScore?: number;
  } | null>(null);

  const [cameraActive, setCameraActive] = useState(false);
  const [proctoringTerminated, setProctoringTerminated] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const ttsAbortRef = useRef<AbortController | null>(null);
  const stageAliveRef = useRef(true);
  const pendingSpeakRef = useRef<string>("");
  const lastWhisperLatencyMsRef = useRef<number>(0);

  useEffect(() => {
    stageAliveRef.current = true;
    return () => {
      stageAliveRef.current = false;
    };
  }, []);

  const isFlagEnabled = (name: string) => getMode(name) === "MONITOR" || getMode(name) === "STRICT";
  const strikeTerminationMode = getMode("proctoring_strike_termination") as StrikeTerminationMode;

  const inSession = Boolean(sessionStarted && interviewId && !complete && !proctoringTerminated);

  const terminateForProctoring = useCallback((reason: ProctoringEventCode) => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setCameraActive(false);
    setProctoringTerminated(true);
    ttsAbortRef.current?.abort();
    void reason;
    toast.error("This session was ended due to proctoring rules. Contact support if this was a mistake.", {
      duration: 6000,
    });
  }, []);

  const { violationSessionLevel, totalLoggedViolations } = useProctoringRiskMonitor({
    enabled: inSession,
    candidateId: user?.id,
    testId: interviewId ?? `SD_${Date.now()}`,
    testType: "system_design",
    cameraStream: cameraActive ? streamRef.current : null,
    microphoneStream: streamRef.current,
    tabSwitchDetectionEnabled: isFlagEnabled("tab_switch_detection"),
    copyPasteDetectionEnabled: isFlagEnabled("copy_paste_detection"),
    devtoolsDetectionEnabled: isFlagEnabled("devtools_detection"),
    fullscreenDetectionEnabled: isFlagEnabled("fullscreen_required"),
    multipleFaceDetectionEnabled: inSession && cameraActive,
    proctorVideoRef: videoRef,
    microphoneMonitoringEnabled: false,
    maxTabSwitches: 999,
    strikeTerminationMode,
    onProctoringTerminated: strikeTerminationMode === "STRICT" ? terminateForProctoring : undefined,
  });

  const whisperSession = useWhisperSession({
    interviewId,
    onPartial: (p) => setPartial(p),
    onError: (err) => toast.error(err, { duration: 8000 }),
    onFinal: (text, meta) => {
      if (meta?.whisperLatencyMs != null) lastWhisperLatencyMsRef.current = meta.whisperLatencyMs;
      const t = text.trim();
      if (!t) return;
      setAnswerDraft((prev) => (prev ? `${prev} ${t}` : t));
      setPartial("");
    },
  });

  // `useWhisperSession` returns a new object each render — don't use it in effect deps.
  const whisperSessionRef = useRef(whisperSession);
  whisperSessionRef.current = whisperSession;

  useEffect(() => {
    const el = videoRef.current;
    const stream = streamRef.current;
    if (!cameraActive || !el || !stream) return;
    el.srcObject = stream;
    const play = () => void el.play().catch(() => {});
    play();
    el.addEventListener("loadedmetadata", play, { once: true });
    return () => el.removeEventListener("loadedmetadata", play);
  }, [cameraActive, sessionStarted, interviewId]);

  const playQuestion = useCallback(async (text: string) => {
    unlockInterviewAudioOutput();
    ttsAbortRef.current?.abort();
    const ac = new AbortController();
    ttsAbortRef.current = ac;
    const w = whisperSessionRef.current;
    w.setAbortController(ac);
    w.setCaptureEnabled(false);
    w.transition("ai_speaking");
    try {
      await speakText(text, ac.signal);
      if (!ac.signal.aborted) {
        await new Promise<void>((r) => setTimeout(r, POST_AI_SPEECH_COOLDOWN_MS));
      }
    } finally {
      if (!ac.signal.aborted) {
        w.setCaptureEnabled(true);
        w.transition("user_speaking");
        w.resumeListening();
      }
    }
  }, []);

  // Speak only after the question is rendered (avoids TTS starting while the UI is still blank).
  useEffect(() => {
    if (!sessionStarted || !interviewId || complete || proctoringTerminated) return;
    const toSpeak = pendingSpeakRef.current;
    if (!toSpeak || toSpeak.trim() !== currentQuestion.trim()) return;
    pendingSpeakRef.current = "";
    void playQuestion(toSpeak);
  }, [sessionStarted, interviewId, complete, proctoringTerminated, currentQuestion, playQuestion]);

  const beginSession = async () => {
    unlockInterviewAudioOutput();
    void document.documentElement.requestFullscreen().catch(() => {});
    setLoading(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user" },
        audio: { echoCancellation: true, noiseSuppression: true },
      });
      streamRef.current = stream;
      setCameraActive(true);
      setSessionStarted(true);
      await whisperSessionRef.current.start({ sharedMediaStream: stream, deferMicCapture: true });

      const status = await api.get<{
        activeSession?: boolean;
        interviewId?: string;
        phase?: "lld" | "hld";
        lastQuestion?: string;
        title?: string;
      }>("/api/interview/system-design/status");
      if (!stageAliveRef.current) return;

      let spoken = "";
      if (status.activeSession && status.interviewId && status.phase) {
        setInterviewId(status.interviewId);
        setPhase(status.phase);
        spoken = status.lastQuestion ?? "";
        setCurrentQuestion(spoken);
        if (status.title) setProblemTitle(status.title);
      } else {
        const res = await api.post<{
          interviewId: string;
          question: string;
          title?: string;
          phase: "lld" | "hld";
        }>("/api/interview/system-design/start", {
          jobRole: targetJobTitle.trim() || "Software Engineer",
        });
        if (!stageAliveRef.current) return;
        setInterviewId(res.interviewId);
        if (res.title) setProblemTitle(res.title);
        spoken = res.question;
        setCurrentQuestion(spoken);
        setPhase(res.phase);
      }

      unlockInterviewAudioOutput();
      if (spoken.trim()) pendingSpeakRef.current = spoken;
    } catch (e) {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      if (videoRef.current) videoRef.current.srcObject = null;
      setCameraActive(false);
      setSessionStarted(false);
      whisperSessionRef.current.stop();
      const msg =
        e instanceof Error && e.name === "NotAllowedError"
          ? "Camera access is required for this interview."
          : `Could not start session: ${(e as Error)?.message ?? "Try again from the dashboard."}`;
      toast.error(msg, { duration: 3600 });
    } finally {
      if (stageAliveRef.current) setLoading(false);
    }
  };

  const stopCamera = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setCameraActive(false);
  };

  useEffect(() => {
    return () => {
      ttsAbortRef.current?.abort();
      whisperSessionRef.current.stop();
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const submit = async () => {
    const id = interviewId;
    const composed = [answerDraft, partial].filter(Boolean).join(" ").trim();
    if (!id || !composed || turnBusy || complete || proctoringTerminated) return;
    if (composed.length < 25) {
      toast.error("Please write a bit more detail before submitting.", { duration: 3000 });
      return;
    }
    setTurnBusy(true);
    whisperSessionRef.current.setCaptureEnabled(false);
    try {
      const turn = await api.post<{
        response: string;
        phase: "lld" | "hld";
        complete: boolean;
        pass?: boolean;
        totalScore?: number;
        lldScore?: number;
        hldScore?: number;
        timeExpired?: boolean;
      }>("/api/interview/system-design/turn", {
        interviewId: id,
        answer: composed,
        inputMode: "voice",
        whisperLatencyMs: lastWhisperLatencyMsRef.current,
      });
      setPhase(turn.phase);
      setAnswerDraft("");
      setPartial("");
      if (turn.complete) {
        setComplete(true);
        setOutcome({
          pass: turn.pass,
          totalScore: turn.totalScore,
          lldScore: turn.lldScore,
          hldScore: turn.hldScore,
        });
        toast.message(
          turn.pass
            ? `Session complete — score ${turn.totalScore ?? "—"}${nextStageLabel ? `. Next: ${nextStageLabel}` : ""}`
            : turn.timeExpired
              ? "Time limit reached."
              : "Below the verification bar — you can retry after cooldown."
        );
        onSessionComplete();
        return;
      }
      setCurrentQuestion(turn.response);
      pendingSpeakRef.current = turn.response;
    } catch (err) {
      toast.error((err as Error)?.message ?? "Submit failed. Try again.");
    } finally {
      setTurnBusy(false);
      if (!complete && !proctoringTerminated) {
        const w = whisperSessionRef.current;
        w.setCaptureEnabled(true);
        w.transition("user_speaking");
        w.resumeListening();
      }
    }
  };

  const phaseLabel =
    phase === "lld"
      ? "Low Level Design — Class & API Design (0:00 – 15:00)"
      : "High Level Design — System Architecture (15:00 – 30:00)";
  const phaseHint =
    phase === "lld"
      ? "Design the classes, APIs, and data model for this system."
      : "Now design the full system architecture. Focus on scale, components, and trade-offs.";

  if (proctoringTerminated) {
    return (
      <Card className="max-w-3xl mx-auto">
        <CardHeader>
          <CardTitle>Session ended</CardTitle>
          <CardDescription>Proctoring policy stopped this session.</CardDescription>
        </CardHeader>
        <CardContent>
          {onReturnToDashboard && (
            <Button variant="outline" onClick={onReturnToDashboard}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to dashboard
            </Button>
          )}
        </CardContent>
      </Card>
    );
  }

  if (!sessionStarted) {
    return (
      <div className="max-w-3xl mx-auto space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-primary" />
              System Design Interview
            </CardTitle>
            <CardDescription>
              Software system design — LLD then HLD (30 minutes). Questions are spoken (Cartesia / ElevenLabs when
              configured on the server) with browser fallback; you answer in writing.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-sm text-muted-foreground">
            <ul className="list-disc pl-5 space-y-1.5">
              <li>Camera stays on for integrity checks (tab, focus, face in frame — same family as AI Expert).</li>
              <li>Use the text area for structured answers: assumptions, APIs, data model, then scale and trade-offs.</li>
              <li>The first question plays automatically after you allow camera (same gesture). Use replay if you miss part of a question.</li>
            </ul>
            <div className="flex flex-wrap gap-2">
              <Button size="lg" onClick={() => void beginSession()}>
                Enable camera & begin →
              </Button>
              {onReturnToDashboard && (
                <Button variant="outline" onClick={onReturnToDashboard}>
                  Back to dashboard
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (loading || !interviewId) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-4">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary" />
        <p className="text-sm text-muted-foreground">Preparing your session…</p>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-4">
      <Card>
        <CardHeader className="pb-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <CardTitle className="text-lg flex items-center gap-2">
                <Shield className="h-5 w-5 text-primary shrink-0" />
                System Design Interview
              </CardTitle>
              <p className="text-sm text-muted-foreground mt-1">Software design — 30 minutes · voice or typed answers</p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void playQuestion(currentQuestion)}
              disabled={!currentQuestion || whisperSession.floor === "ai_speaking"}
            >
              <RotateCcw className="h-4 w-4 mr-1" />
              Replay question
            </Button>
          </div>
          {problemTitle && (
            <p className="text-sm font-medium text-foreground pt-1">Problem: {problemTitle}</p>
          )}
          <CardDescription className="space-y-2 pt-1">
            <p>
              <span className="font-medium text-foreground">{phaseLabel}</span>
              <span className="block mt-1">{phaseHint}</span>
            </p>
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-3 text-xs rounded-lg border border-border/80 bg-muted/20 px-3 py-2">
            <div
              className={`w-1.5 h-1.5 rounded-full shrink-0 ${
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
            <span className="tabular-nums text-muted-foreground">({totalLoggedViolations} alerts)</span>
            <span className="text-muted-foreground">Voice answering is enabled for this round.</span>
          </div>

          <div className="grid gap-6 lg:grid-cols-12 lg:items-start">
            <div className="lg:col-span-5 space-y-3">
              <div className="rounded-xl border-2 border-primary/20 bg-muted/30 overflow-hidden">
                <div className="flex items-center justify-between px-3 py-2 border-b border-border/60 bg-background/50">
                  <span className="text-xs font-medium text-muted-foreground">Camera</span>
                  {cameraActive ? (
                    <span className="text-[10px] uppercase tracking-wide text-green-600 dark:text-green-400">Live</span>
                  ) : (
                    <span className="text-[10px] uppercase tracking-wide text-amber-600 dark:text-amber-400">Off</span>
                  )}
                </div>
                <div className="aspect-video relative bg-black/40">
                  {cameraActive ? (
                    <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
                  ) : (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-6 text-center">
                      <Video className="h-10 w-10 text-muted-foreground opacity-60" />
                      <p className="text-xs text-muted-foreground">Camera unavailable</p>
                    </div>
                  )}
                  {cameraActive && (
                    <button
                      type="button"
                      onClick={stopCamera}
                      className="absolute top-2 right-2 p-1.5 rounded-md bg-black/60 text-white hover:bg-black/80"
                      aria-label="Stop camera"
                    >
                      <VideoOff className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>
            </div>

            <div className="lg:col-span-7 space-y-4 min-h-[12rem]">
              {currentQuestion && (
                <div className="rounded-xl border-2 border-primary/25 bg-gradient-to-br from-primary/8 to-background p-5 md:p-6 shadow-sm">
                  <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-3">
                    <p className="text-xs text-primary font-semibold uppercase tracking-wide">AI is asking</p>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="shrink-0 gap-1.5"
                      onClick={() => void playQuestion(currentQuestion)}
                      disabled={!currentQuestion.trim() || whisperSession.floor === "ai_speaking" || turnBusy}
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                      Replay audio
                    </Button>
                  </div>
                  <p className="text-base md:text-lg font-medium leading-relaxed text-foreground">{currentQuestion}</p>
                </div>
              )}

              <div className="rounded-xl border bg-card p-4 space-y-4 shadow-sm">
                <div className="flex items-center gap-2">
                  <Radio className="h-4 w-4 text-primary shrink-0" />
                  <h3 className="text-sm font-semibold">Voice session</h3>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <div
                    className={`inline-flex items-center gap-2 px-4 py-2 rounded-full border ${
                      whisperSession.floor === "user_speaking"
                        ? "border-green-500/40 bg-green-500/10 text-green-700 dark:text-green-300 ring-2 ring-green-500/20"
                        : whisperSession.floor === "ai_thinking"
                          ? "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300"
                          : whisperSession.floor === "ai_speaking"
                            ? "border-blue-500/40 bg-blue-500/10 text-blue-700 dark:text-blue-300 ring-2 ring-blue-500/15"
                            : "border-muted bg-muted/40 text-muted-foreground"
                    }`}
                  >
                    <Mic className={`h-4 w-4 shrink-0 ${whisperSession.floor === "ai_speaking" ? "opacity-60" : ""}`} />
                    <span className="text-xs font-semibold uppercase tracking-wide">
                      {whisperSession.floor === "user_speaking"
                        ? "Listening — speak your answer"
                        : whisperSession.floor === "ai_thinking"
                          ? "AI thinking…"
                          : whisperSession.floor === "ai_speaking"
                            ? "AI speaking — listen"
                            : whisperSession.sttMode === "idle"
                              ? "Starting microphone…"
                              : "Ready"}
                    </span>
                    {whisperSession.sttMode === "whisper" && (
                      <span className="text-[10px] font-normal normal-case opacity-85 border-l pl-2 ml-1 border-current/25">
                        Whisper (segmented)
                      </span>
                    )}
                  </div>
                </div>

                <div className="space-y-1">
                  <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Input level</p>
                  <div className="flex items-end gap-0.5 h-10 px-1">
                    {Array.from({ length: 24 }).map((_, i) => (
                      <div
                        key={i}
                        className={`flex-1 rounded-full transition-all duration-75 min-h-[5px] ${
                          whisperSession.floor === "user_speaking"
                            ? "bg-primary/70"
                            : whisperSession.floor === "ai_thinking"
                              ? "bg-amber-500/45 animate-pulse"
                              : "bg-muted-foreground/25"
                        }`}
                        style={{
                          height: `${Math.max(
                            12,
                            whisperSession.floor === "user_speaking"
                              ? Math.min(100, whisperSession.micLevel * 100 + (i % 3) * 6)
                              : whisperSession.floor === "ai_thinking"
                                ? 22 + ((i * 7) % 18)
                                : 14
                          )}%`,
                        }}
                      />
                    ))}
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    {whisperSession.floor === "user_speaking"
                      ? "Pause ~1.2s after a phrase to transcribe; multiple segments combine in your answer."
                      : "When the AI finishes, you can speak again."}
                  </p>
                </div>

                {sessionStarted && interviewId && !complete && (
                  <div className="rounded-lg border border-dashed border-primary/25 bg-muted/20 px-3 py-2 space-y-2">
                    <p className="text-[10px] font-medium text-primary uppercase tracking-wide">Your answer</p>
                    <div className="max-h-[min(40vh,18rem)] min-h-[5.5rem] overflow-y-auto rounded-md border border-border/80 bg-background px-3 py-2.5 text-sm leading-relaxed text-foreground whitespace-pre-wrap break-words">
                      {answerDraft || partial ? (
                        <>
                          {answerDraft}
                          {partial ? (
                            <>
                              {answerDraft ? " " : ""}
                              <span className="text-muted-foreground italic">{partial}</span>
                            </>
                          ) : null}
                        </>
                      ) : (
                        <span className="text-muted-foreground italic text-[13px]">
                          Your speech is transcribed here after each pause. You can also type below.
                        </span>
                      )}
                    </div>
                  </div>
                )}

                <div className="space-y-2">
                  <Textarea
                    placeholder="Optional: type or edit your answer…"
                    value={answerDraft}
                    onChange={(e) => setAnswerDraft(e.target.value)}
                    className="min-h-[72px] rounded-lg border-border/80"
                    disabled={complete}
                  />
                </div>

                <div className="flex flex-col sm:flex-row sm:items-center gap-2 pt-1">
                  <Button
                    type="button"
                    size="default"
                    className="gap-2 shrink-0"
                    onClick={() => void submit()}
                    disabled={
                      !interviewId ||
                      whisperSession.floor !== "user_speaking" ||
                      turnBusy ||
                      ![answerDraft, partial].filter(Boolean).join(" ").trim()
                    }
                  >
                    <Send className="h-4 w-4" />
                    Submit answer
                  </Button>
                  {onReturnToDashboard && (
                    <Button type="button" variant="ghost" onClick={onReturnToDashboard}>
                      Dashboard
                    </Button>
                  )}
                  <p className="text-[11px] text-muted-foreground">
                    Submit when your full answer is ready. Short pauses send each phrase to transcription; they do not submit automatically.
                  </p>
                </div>
              </div>

              {complete && outcome && (
                <p className="text-sm text-muted-foreground pt-2">
                  Result: {outcome.pass ? "Passed" : "Did not pass"} — overall {outcome.totalScore ?? "—"} (LLD{" "}
                  {outcome.lldScore ?? "—"}, HLD {outcome.hldScore ?? "—"}).
                </p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default SystemDesignInterviewStage;
