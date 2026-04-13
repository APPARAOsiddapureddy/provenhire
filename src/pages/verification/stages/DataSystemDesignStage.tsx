import { useState, useCallback, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api";
import { unlockInterviewAudioOutput, speakText } from "@/lib/interviewTts";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { useFeatureFlags } from "@/hooks/useFeatureFlags";
import {
  useProctoringRiskMonitor,
  type ProctoringEventCode,
  type StrikeTerminationMode,
} from "@/hooks/useProctoringRiskMonitor";
import { Volume2, ArrowLeft, Send, Shield, Video, VideoOff, RotateCcw, Radio } from "lucide-react";

const POST_AI_SPEECH_COOLDOWN_MS = 400;

export interface DataSystemDesignStageProps {
  targetJobTitle?: string;
  onSessionComplete: () => void;
  onReturnToDashboard?: () => void;
  nextStageLabel?: string;
}

export default function DataSystemDesignStage({
  targetJobTitle = "Data Engineer",
  onSessionComplete,
  onReturnToDashboard,
  nextStageLabel,
}: DataSystemDesignStageProps) {
  const { user } = useAuth();
  const { getMode } = useFeatureFlags();

  const [sessionStarted, setSessionStarted] = useState(false);
  const [interviewId, setInterviewId] = useState<string | null>(null);
  const [currentQuestion, setCurrentQuestion] = useState("");
  const [phase, setPhase] = useState<"lld" | "hld">("lld");
  const [answer, setAnswer] = useState("");
  const [loading, setLoading] = useState(false);
  const [turnBusy, setTurnBusy] = useState(false);
  const [complete, setComplete] = useState(false);
  const [outcome, setOutcome] = useState<{ pass?: boolean; totalScore?: number } | null>(null);

  const [cameraActive, setCameraActive] = useState(false);
  const [voiceFloor, setVoiceFloor] = useState<"idle" | "ai_speaking">("idle");
  const [proctoringTerminated, setProctoringTerminated] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const ttsAbortRef = useRef<AbortController | null>(null);
  const stageAliveRef = useRef(true);

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
    testId: interviewId ?? `DSD_${Date.now()}`,
    testType: "data_system_design",
    cameraStream: cameraActive ? streamRef.current : null,
    microphoneStream: null,
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
    setVoiceFloor("ai_speaking");
    try {
      await speakText(text, ac.signal);
      if (!ac.signal.aborted) {
        await new Promise<void>((r) => setTimeout(r, POST_AI_SPEECH_COOLDOWN_MS));
      }
    } finally {
      if (!ac.signal.aborted) setVoiceFloor("idle");
    }
  }, []);

  const beginSession = async () => {
    unlockInterviewAudioOutput();
    void document.documentElement.requestFullscreen().catch(() => {});
    setLoading(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user" },
        audio: false,
      });
      streamRef.current = stream;
      setCameraActive(true);
      setSessionStarted(true);

      const status = await api.get<{
        activeSession?: boolean;
        interviewId?: string;
        phase?: "lld" | "hld";
        lastQuestion?: string;
      }>("/api/interview/data-system-design/status");
      if (!stageAliveRef.current) return;

      let spoken = "";
      if (status.activeSession && status.interviewId && status.phase) {
        setInterviewId(status.interviewId);
        setPhase(status.phase);
        spoken = status.lastQuestion ?? "";
        setCurrentQuestion(spoken);
      } else {
        const res = await api.post<{
          interviewId: string;
          question: string;
          phase: "lld" | "hld";
        }>("/api/interview/data-system-design/start", {
          jobRole: targetJobTitle.trim() || "Data Engineer",
        });
        if (!stageAliveRef.current) return;
        setInterviewId(res.interviewId);
        spoken = res.question;
        setCurrentQuestion(spoken);
        setPhase(res.phase);
      }

      unlockInterviewAudioOutput();
      if (spoken.trim()) await playQuestion(spoken);
    } catch (e) {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      if (videoRef.current) videoRef.current.srcObject = null;
      setCameraActive(false);
      setSessionStarted(false);
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
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const submit = async () => {
    const id = interviewId;
    const composed = answer.trim();
    if (!id || !composed || turnBusy || complete || proctoringTerminated) return;
    if (composed.length < 25) {
      toast.error("Please write a bit more detail before submitting.", { duration: 3000 });
      return;
    }
    setTurnBusy(true);
    try {
      const turn = await api.post<{
        response: string;
        phase: "lld" | "hld";
        complete: boolean;
        pass?: boolean;
        totalScore?: number;
        timeExpired?: boolean;
      }>("/api/interview/data-system-design/turn", {
        interviewId: id,
        answer: composed,
      });
      setPhase(turn.phase);
      setAnswer("");
      if (turn.complete) {
        setComplete(true);
        setOutcome({ pass: turn.pass, totalScore: turn.totalScore });
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
      void playQuestion(turn.response);
    } catch (err) {
      toast.error((err as Error)?.message ?? "Submit failed. Try again.");
    } finally {
      setTurnBusy(false);
    }
  };

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
              Data System Design
            </CardTitle>
            <CardDescription>
              Data platform design — LLD then HLD. Spoken questions (server TTS or browser fallback); you answer in
              writing.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-sm text-muted-foreground">
            <ul className="list-disc pl-5 space-y-1.5">
              <li>Camera on for the same integrity checks as other AI verification rounds.</li>
              <li>The first question plays automatically after you allow camera (same gesture). Use replay if you miss part of a question.</li>
              <li>Cover pipelines, storage, quality, and scale in your written answers.</li>
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
            <CardTitle className="text-lg flex items-center gap-2">
              <Shield className="h-5 w-5 text-primary shrink-0" />
              Data System Design
            </CardTitle>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void playQuestion(currentQuestion)}
              disabled={!currentQuestion || voiceFloor === "ai_speaking"}
            >
              <RotateCcw className="h-4 w-4 mr-1" />
              Replay question
            </Button>
          </div>
          <CardDescription>
            Phase: {phase === "lld" ? "Low-level data design" : "High-level platform design"} — typed answers (lists and
            short paragraphs).
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
            <span
              className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 font-medium ${
                voiceFloor === "ai_speaking"
                  ? "border-blue-500/40 bg-blue-500/10 text-blue-700 dark:text-blue-300"
                  : "border-muted bg-muted/40 text-muted-foreground"
              }`}
            >
              <Radio className="h-3.5 w-3.5" />
              {voiceFloor === "ai_speaking" ? "AI speaking" : "Ready — read & type your answer"}
            </span>
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
              <div className="rounded-lg border-2 border-primary/25 bg-gradient-to-br from-primary/8 to-background p-4 md:p-5">
                <p className="text-xs text-primary font-semibold uppercase tracking-wide mb-2">Question</p>
                <div className="text-sm leading-relaxed whitespace-pre-wrap text-foreground">{currentQuestion}</div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="mt-3 gap-1.5 text-primary"
                  onClick={() => void playQuestion(currentQuestion)}
                  disabled={!currentQuestion.trim() || voiceFloor === "ai_speaking"}
                >
                  <Volume2 className="h-4 w-4" />
                  Replay question audio
                </Button>
              </div>

              <Textarea
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
                placeholder="Structure your answer: assumptions, design, trade-offs, and how you would validate in production."
                rows={10}
                disabled={complete}
                className="font-sans text-sm"
              />

              <div className="flex flex-wrap gap-2">
                <Button
                  onClick={() => void submit()}
                  disabled={turnBusy || complete || voiceFloor === "ai_speaking"}
                >
                  <Send className="h-4 w-4 mr-2" />
                  {turnBusy ? "Sending…" : "Submit answer"}
                </Button>
                {onReturnToDashboard && (
                  <Button type="button" variant="ghost" onClick={onReturnToDashboard}>
                    Dashboard
                  </Button>
                )}
              </div>

              {complete && outcome && (
                <p className="text-sm text-muted-foreground pt-2">
                  Result: {outcome.pass ? "Passed" : "Did not pass"} — overall score {outcome.totalScore ?? "—"}.
                </p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
