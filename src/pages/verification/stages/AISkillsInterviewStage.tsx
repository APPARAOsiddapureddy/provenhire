import { useState, useRef, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { api, getAuthToken } from "@/lib/api";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { useWhisperSession } from "@/hooks/useWhisperSession";
import { useProctoringRiskMonitor, type ProctoringEventCode, type StrikeTerminationMode } from "@/hooks/useProctoringRiskMonitor";
import { useFeatureFlags } from "@/hooks/useFeatureFlags";
import { Mic, Video, VideoOff, Shield, Radio, Clock, Send } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";

const POST_AI_SPEECH_COOLDOWN_MS = 520;
const ACK_BEFORE_QUESTION_GAP_MS = 400;
const SILENCE_NUDGE_MS = 5000;
const SILENCE_NUDGES = [
  "Take your time.",
  "No rush — think it through.",
  "Feel free to think out loud.",
];

const POLITENESS_ONLY_TRANSCRIPT = /^(thank you|thanks|thx|ty|okay|ok\.?|got it|gotcha|mhm+|mm+|uh-?huh|sure)\.?$/i;

function scrubSttEcho(text: string): string {
  let s = text.trim();
  if (!s) return "";
  if (POLITENESS_ONLY_TRANSCRIPT.test(s)) return "";
  s = s.replace(/^(thank you|thanks)(?:\s+so much)?\s*[,.!?]?\s+/i, "").trim();
  if (POLITENESS_ONLY_TRANSCRIPT.test(s)) return "";
  return s;
}

function unlockInterviewAudioOutput(): void {
  try {
    const a = new Audio(
      "data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA"
    );
    a.volume = 0.01;
    void a
      .play()
      .then(() => {
        a.pause();
        a.removeAttribute("src");
      })
      .catch(() => {});
  } catch {
    /* ignore */
  }
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
    if (!res.ok) throw new Error(`TTS HTTP ${res.status}`);
    const contentType = res.headers.get("Content-Type") || "";
    const looksLikeAudio = contentType.includes("audio") || contentType.includes("octet-stream");
    if (looksLikeAudio) {
      const blob = await res.blob();
      if (blob.size === 0) {
        await fallbackBrowserTTS(text, signal);
        return;
      }
      const url = URL.createObjectURL(blob);
      await new Promise<void>((resolve) => {
        const audio = new Audio();
        audio.preload = "auto";
        audio.setAttribute("playsinline", "");
        audio.volume = 1;
        audio.src = url;
        const cleanup = () => {
          URL.revokeObjectURL(url);
          signal?.removeEventListener("abort", onAbort);
          resolve();
        };
        const onAbort = () => {
          audio.pause();
          audio.src = "";
          cleanup();
        };
        signal?.addEventListener("abort", onAbort);
        audio.onended = cleanup;
        audio.onerror = () => {
          void fallbackBrowserTTS(text, signal).finally(cleanup);
        };
        void audio.play().catch(() => {
          void fallbackBrowserTTS(text, signal).finally(cleanup);
        });
      });
      return;
    }
    const data = (await res.json()) as { fallback?: boolean; text?: string };
    if (data.fallback) await fallbackBrowserTTS(data.text || text, signal);
  } catch (e) {
    if (signal?.aborted) return;
    console.warn("[AISkills speakText]", e);
    await fallbackBrowserTTS(text, signal);
  }
}

async function speakFiller(signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) return;
  try {
    const res = await fetch("/api/interview/tts-filler", {
      headers: { Authorization: `Bearer ${getAuthToken()}` },
      signal,
    });
    if (!res.ok) return;
    const contentType = res.headers.get("Content-Type") || "";
    const looksLikeAudio = contentType.includes("audio") || contentType.includes("octet-stream");
    if (looksLikeAudio) {
      const blob = await res.blob();
      if (blob.size === 0) return;
      const url = URL.createObjectURL(blob);
      await new Promise<void>((resolve) => {
        const audio = new Audio();
        audio.volume = 1;
        audio.setAttribute("playsinline", "");
        audio.src = url;
        const cleanup = () => {
          URL.revokeObjectURL(url);
          signal?.removeEventListener("abort", onAbort);
          resolve();
        };
        const onAbort = () => {
          audio.pause();
          cleanup();
        };
        signal?.addEventListener("abort", onAbort);
        audio.onended = cleanup;
        audio.onerror = cleanup;
        void audio.play().catch(() => cleanup());
      });
    }
  } catch {
    /* optional */
  }
}

function fallbackBrowserTTS(text: string, signal?: AbortSignal): Promise<void> {
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

const ROLES = [
  "Backend Developer",
  "Frontend Developer",
  "Full Stack Developer",
  "Software Engineer",
  "Data Scientist",
  "DevOps Engineer",
  "ML Engineer",
  "QA Engineer",
  "Other Technical Role",
];

function tierFromYears(years: number): "fresher" | "mid" | "senior" {
  if (years < 1) return "fresher";
  if (years < 3) return "mid";
  return "senior";
}

export interface AISkillsInterviewStageProps {
  targetJobTitle?: string;
  experienceYears: number;
  onSessionComplete: () => void;
  onReturnToDashboard?: () => void;
}

export default function AISkillsInterviewStage({
  targetJobTitle = "",
  experienceYears,
  onSessionComplete,
  onReturnToDashboard,
}: AISkillsInterviewStageProps) {
  const { user } = useAuth();
  const { getMode } = useFeatureFlags();

  const [jobRole, setJobRole] = useState(
    targetJobTitle && ROLES.includes(targetJobTitle) ? targetJobTitle : "Software Engineer"
  );
  const [interviewId, setInterviewId] = useState<string | null>(null);
  const [started, setStarted] = useState(false);
  const [outcome, setOutcome] = useState<{
    totalScore?: number;
    pass?: boolean;
    verifiedSkills?: Array<{ skill: string; confidence: number }>;
    timeExpired?: boolean;
  } | null>(null);

  const [loading, setLoading] = useState(false);
  const [currentQuestion, setCurrentQuestion] = useState("");
  const [phaseLabel, setPhaseLabel] = useState<"dsa_walkthrough" | "skill_checkup" | "complete">("dsa_walkthrough");
  const [questionsAsked, setQuestionsAsked] = useState(0);
  const [questionsTotal, setQuestionsTotal] = useState(11);
  const [phaseBanner, setPhaseBanner] = useState<string | null>(null);
  const [partial, setPartial] = useState("");
  const [cameraActive, setCameraActive] = useState(false);
  const [turnInFlight, setTurnInFlight] = useState(false);
  const [remainingMinutes, setRemainingMinutes] = useState<number | null>(null);
  const [answerDraft, setAnswerDraft] = useState("");

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const processingRef = useRef(false);
  const questionShownAtRef = useRef(Date.now());
  const aiSpeakRef = useRef<(text: string) => Promise<void>>(async () => {});
  const answerDraftRef = useRef("");
  const interviewIdRef = useRef<string | null>(null);
  const currentTurnIdRef = useRef("");
  const lastWhisperLatencyMsRef = useRef<number | undefined>(undefined);
  const silenceNudgeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const answerScrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    interviewIdRef.current = interviewId;
  }, [interviewId]);

  useEffect(() => {
    answerDraftRef.current = answerDraft;
  }, [answerDraft]);

  useEffect(() => {
    const el = answerScrollRef.current;
    if (!el) return;
    const pad = 72;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < pad;
    if (nearBottom || partial) el.scrollTop = el.scrollHeight;
  }, [answerDraft, partial]);

  const isFlagEnabled = (name: string) => getMode(name) === "MONITOR" || getMode(name) === "STRICT";
  const strikeTerminationMode = getMode("proctoring_strike_termination") as StrikeTerminationMode;

  const terminateForProctoring = useCallback((reason: ProctoringEventCode) => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    setCameraActive(false);
    setOutcome({ pass: false, totalScore: 0 });
    void reason;
  }, []);

  const inTest = Boolean(interviewId) && !outcome;

  useProctoringRiskMonitor({
    enabled: inTest,
    candidateId: user?.id,
    testId: interviewId ?? `AI_SKILLS_${Date.now()}`,
    testType: "ai_interview",
    cameraStream: cameraActive ? streamRef.current : null,
    microphoneStream: null,
    tabSwitchDetectionEnabled: isFlagEnabled("tab_switch_detection"),
    copyPasteDetectionEnabled: isFlagEnabled("copy_paste_detection"),
    devtoolsDetectionEnabled: isFlagEnabled("devtools_detection"),
    fullscreenDetectionEnabled: isFlagEnabled("fullscreen_required"),
    multipleFaceDetectionEnabled: inTest && cameraActive,
    proctorVideoRef: videoRef,
    microphoneMonitoringEnabled: isFlagEnabled("microphone_monitoring"),
    maxTabSwitches: 999,
    strikeTerminationMode,
    onProctoringTerminated: strikeTerminationMode === "STRICT" ? terminateForProctoring : undefined,
  });

  const clearSilenceNudgeTimer = useCallback(() => {
    if (silenceNudgeTimerRef.current) {
      clearTimeout(silenceNudgeTimerRef.current);
      silenceNudgeTimerRef.current = null;
    }
  }, []);

  const onPartialWrapped = useCallback(
    (p: string) => {
      if (p.trim()) clearSilenceNudgeTimer();
      setPartial(p);
    },
    [clearSilenceNudgeTimer]
  );

  const appendFinalToDraft = useCallback(
    (text: string, meta?: { whisperLatencyMs: number }) => {
      const t = scrubSttEcho(text);
      if (!t) return;
      clearSilenceNudgeTimer();
      if (meta?.whisperLatencyMs != null) lastWhisperLatencyMsRef.current = meta.whisperLatencyMs;
      setAnswerDraft((prev) => (prev ? `${prev} ${t}` : t));
      setPartial("");
    },
    [clearSilenceNudgeTimer]
  );

  const whisperSession = useWhisperSession({
    interviewId,
    onPartial: onPartialWrapped,
    onError: (err) => toast.error(err, { duration: 8000 }),
    onFinal: appendFinalToDraft,
  });

  const aiSpeak = useCallback(
    async (text: string) => {
      window.speechSynthesis?.cancel();
      abortRef.current?.abort();
      const ac = new AbortController();
      abortRef.current = ac;
      whisperSession.setAbortController(ac);
      whisperSession.setCaptureEnabled(false);
      whisperSession.transition("ai_speaking");
      try {
        await speakText(text, ac.signal);
      } catch {
        /* speakText fallback */
      }
      if (!ac.signal.aborted) await new Promise<void>((r) => setTimeout(r, POST_AI_SPEECH_COOLDOWN_MS));
      if (!ac.signal.aborted) {
        whisperSession.setCaptureEnabled(true);
        whisperSession.transition("user_speaking");
        whisperSession.resumeListening();
      }
    },
    [whisperSession]
  );

  const speakAckThenQuestion = useCallback(
    async (expectedTurnId: string, acknowledgement: string | null | undefined, question: string) => {
      const resumeListeningAfterStale = () => {
        whisperSession.setCaptureEnabled(true);
        whisperSession.transition("user_speaking");
        whisperSession.resumeListening();
      };

      window.speechSynthesis?.cancel();
      abortRef.current?.abort();
      const ac = new AbortController();
      abortRef.current = ac;
      whisperSession.setAbortController(ac);
      whisperSession.setCaptureEnabled(false);
      whisperSession.transition("ai_speaking");
      try {
        if (acknowledgement?.trim()) {
          await speakText(acknowledgement.trim(), ac.signal);
          if (!ac.signal.aborted) await new Promise<void>((r) => setTimeout(r, ACK_BEFORE_QUESTION_GAP_MS));
        }
        if (expectedTurnId !== currentTurnIdRef.current) {
          ac.abort();
          resumeListeningAfterStale();
          return;
        }
        if (!ac.signal.aborted) {
          setCurrentQuestion(question);
          questionShownAtRef.current = Date.now();
          await speakText(question, ac.signal);
        }
      } catch {
        /* */
      }
      if (!ac.signal.aborted) await new Promise<void>((r) => setTimeout(r, POST_AI_SPEECH_COOLDOWN_MS));
      if (!ac.signal.aborted) {
        whisperSession.setCaptureEnabled(true);
        whisperSession.transition("user_speaking");
        whisperSession.resumeListening();
      }
    },
    [whisperSession]
  );

  const submitAnswer = useCallback(async () => {
    const id = interviewIdRef.current;
    if (processingRef.current || !id) return;
    if (whisperSession.floor !== "user_speaking") return;
    if (turnInFlight) return;

    const composed = [answerDraftRef.current, partial].filter(Boolean).join(" ").trim();
    if (!composed) {
      toast.error("Speak or type your answer, then submit.", { duration: 2800 });
      return;
    }

    processingRef.current = true;
    setTurnInFlight(true);
    clearSilenceNudgeTimer();
    whisperSession.setCaptureEnabled(false);

    const turnId = crypto.randomUUID();
    currentTurnIdRef.current = turnId;

    let fillerAc = new AbortController();
    try {
      fillerAc = new AbortController();
      abortRef.current = fillerAc;
      whisperSession.setAbortController(fillerAc);
      whisperSession.transition("ai_thinking");
      void speakFiller(fillerAc.signal);
    } catch {
      fillerAc = new AbortController();
    }

    try {
      const turnResult = await api.post<{
        response: string;
        acknowledgement?: string | null;
        phase: "dsa_walkthrough" | "skill_checkup" | "complete";
        questionsAsked: number;
        questionsTotal: number;
        complete: boolean;
        turnId?: string;
        score?: number;
        verifiedSkills?: Array<{ skill: string; confidence: number }>;
        pass?: boolean;
        timeExpired?: boolean;
      }>("/api/interview/ai-skills/turn", {
        interviewId: id,
        answer: composed,
        inputMode: "voice",
        turnId,
        whisperLatencyMs: lastWhisperLatencyMsRef.current,
      });

      fillerAc.abort();

      if (turnResult.turnId && turnResult.turnId !== currentTurnIdRef.current) {
        whisperSession.setCaptureEnabled(true);
        whisperSession.transition("user_speaking");
        whisperSession.resumeListening();
        return;
      }

      if (turnResult.phase !== phaseLabel && turnResult.phase === "skill_checkup" && phaseLabel === "dsa_walkthrough") {
        setPhaseBanner("Now: skill checkup from your resume.");
        window.setTimeout(() => setPhaseBanner(null), 5000);
      }
      if (turnResult.phase !== "complete") {
        setPhaseLabel(turnResult.phase);
      }
      setQuestionsAsked(turnResult.questionsAsked);
      setQuestionsTotal(turnResult.questionsTotal);
      setAnswerDraft("");
      setPartial("");

      if (turnResult.complete) {
        setCurrentQuestion(turnResult.response);
        streamRef.current?.getTracks().forEach((t) => t.stop());
        setCameraActive(false);
        whisperSession.stop();
        setOutcome({
          totalScore: turnResult.score,
          pass: turnResult.pass,
          verifiedSkills: turnResult.verifiedSkills,
          timeExpired: turnResult.timeExpired,
        });
        setPhaseLabel("complete");
        onSessionComplete();
      } else {
        const expectedTurn = turnResult.turnId ?? turnId;
        await speakAckThenQuestion(expectedTurn, turnResult.acknowledgement, turnResult.response);
      }
    } catch (e) {
      fillerAc.abort();
      const msg = e instanceof Error && e.message && e.message !== "Request failed" ? e.message : "Could not submit.";
      toast.error(msg, { duration: 4500 });
      whisperSession.setCaptureEnabled(true);
      whisperSession.transition("user_speaking");
      whisperSession.resumeListening();
    } finally {
      processingRef.current = false;
      setTurnInFlight(false);
    }
  }, [
    whisperSession,
    partial,
    turnInFlight,
    speakAckThenQuestion,
    clearSilenceNudgeTimer,
    phaseLabel,
    onSessionComplete,
  ]);

  useEffect(() => {
    aiSpeakRef.current = aiSpeak;
  }, [aiSpeak]);

  const whisperSessionRef = useRef(whisperSession);
  whisperSessionRef.current = whisperSession;
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      whisperSessionRef.current.stop();
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  useEffect(() => {
    if (!started || outcome || whisperSession.floor !== "user_speaking" || turnInFlight) {
      clearSilenceNudgeTimer();
      return;
    }
    clearSilenceNudgeTimer();
    silenceNudgeTimerRef.current = setTimeout(() => {
      if (processingRef.current || turnInFlight) return;
      void (async () => {
        const nudge = SILENCE_NUDGES[Math.floor(Math.random() * SILENCE_NUDGES.length)]!;
        window.speechSynthesis?.cancel();
        abortRef.current?.abort();
        const ac = new AbortController();
        abortRef.current = ac;
        whisperSession.setAbortController(ac);
        whisperSession.setCaptureEnabled(false);
        whisperSession.transition("ai_speaking");
        try {
          await speakText(nudge, ac.signal);
        } catch {
          /* */
        }
        if (!ac.signal.aborted) await new Promise<void>((r) => setTimeout(r, POST_AI_SPEECH_COOLDOWN_MS));
        if (!ac.signal.aborted) {
          whisperSession.setCaptureEnabled(true);
          whisperSession.transition("user_speaking");
          whisperSession.resumeListening();
        }
      })();
    }, SILENCE_NUDGE_MS);
    return () => clearSilenceNudgeTimer();
  }, [whisperSession.floor, started, outcome, turnInFlight, clearSilenceNudgeTimer]);

  useEffect(() => {
    const el = videoRef.current;
    const stream = streamRef.current;
    if (!cameraActive || !el || !stream) return;
    el.srcObject = stream;
    const play = () => void el.play().catch(() => {});
    play();
    el.addEventListener("loadedmetadata", play, { once: true });
    return () => el.removeEventListener("loadedmetadata", play);
  }, [cameraActive, started]);

  const startSession = async () => {
    unlockInterviewAudioOutput();
    setLoading(true);
    let combinedStream: MediaStream | null = null;
    try {
      combinedStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user" },
        audio: { echoCancellation: true, noiseSuppression: true },
      });
      await document.documentElement.requestFullscreen().catch(() => {});

      const role = jobRole === "Other Technical Role" ? targetJobTitle || "Software Engineer" : jobRole;
      const experienceLevel = tierFromYears(experienceYears);

      const res = await api.post<{
        interviewId: string;
        firstQuestion: string;
        acknowledgement: string | null;
        phase: "dsa_walkthrough" | "skill_checkup";
        questionsTotal: number;
        resumed?: boolean;
      }>("/api/interview/ai-skills/start", { jobRole: role, experienceLevel });

      setInterviewId(res.interviewId);
      setCurrentQuestion(res.firstQuestion);
      questionShownAtRef.current = Date.now();
      setPhaseLabel(res.phase);
      setQuestionsAsked(1);
      setQuestionsTotal(res.questionsTotal);
      setRemainingMinutes(30);
      setAnswerDraft("");
      setPartial("");
      setStarted(true);
      streamRef.current = combinedStream;
      setCameraActive(true);
      await whisperSession.start({ sharedMediaStream: combinedStream });
      await aiSpeakRef.current(res.firstQuestion);
      if (res.acknowledgement?.trim()) {
        /* first question already includes content; optional ack skipped to avoid double speak */
      }
    } catch (e: unknown) {
      if (combinedStream) combinedStream.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      setCameraActive(false);
      const msg = e instanceof Error ? e.message : "Failed to start.";
      toast.error(msg, { duration: 4000 });
      setStarted(false);
    } finally {
      setLoading(false);
    }
  };

  const progressPct = questionsTotal > 0 ? Math.min((questionsAsked / questionsTotal) * 100, 100) : 0;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" />
            AI Skills Interview
          </CardTitle>
          <CardDescription>
            DSA walkthrough of your submissions, then depth checks on resume skills. Voice-first; camera required for
            proctoring. About 30 minutes.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {!started && (
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium mb-2 block">Target role</label>
                <select
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={jobRole}
                  onChange={(e) => setJobRole(e.target.value)}
                >
                  {ROLES.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </div>
              <p className="text-sm text-muted-foreground">
                Experience band for this session: <strong>{tierFromYears(experienceYears)}</strong> (from your profile).
              </p>
              <div className="flex gap-2 flex-wrap">
                <Button onClick={() => void startSession()} disabled={loading} size="lg">
                  {loading ? "Starting…" : "Start AI Skills Interview"}
                </Button>
                {onReturnToDashboard && (
                  <Button variant="outline" onClick={onReturnToDashboard}>
                    Return to dashboard
                  </Button>
                )}
              </div>
            </div>
          )}

          {started && !outcome && (
            <div className="space-y-4">
              {phaseBanner && (
                <div className="rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-sm">{phaseBanner}</div>
              )}
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <div>
                  <p className="text-xs font-medium text-muted-foreground uppercase">Phase</p>
                  <p className="font-medium">
                    {phaseLabel === "dsa_walkthrough"
                      ? "DSA walkthrough"
                      : phaseLabel === "skill_checkup"
                        ? "Skill verification"
                        : "Complete"}
                  </p>
                </div>
                {remainingMinutes != null && (
                  <div className="flex items-center gap-1 text-sm text-muted-foreground">
                    <Clock className="h-4 w-4" />
                    Up to ~30 min session
                  </div>
                )}
              </div>
              <div>
                <div className="flex justify-between text-xs text-muted-foreground mb-1">
                  <span>Progress</span>
                  <span>
                    {questionsAsked} / {questionsTotal}
                  </span>
                </div>
                <Progress value={progressPct} className="h-2" />
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-lg border bg-muted/30 p-2 aspect-video relative overflow-hidden">
                  {!cameraActive ? (
                    <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                      Camera off
                    </div>
                  ) : (
                    <video ref={videoRef} className="h-full w-full object-cover" playsInline muted />
                  )}
                </div>
                <div className="space-y-3">
                  <div className="flex flex-wrap gap-2">
                    <Button type="button" variant={cameraActive ? "secondary" : "default"} size="sm" onClick={async () => {
                      try {
                        whisperSession.stop();
                        const stream = await navigator.mediaDevices.getUserMedia({
                          video: { facingMode: "user" },
                          audio: { echoCancellation: true, noiseSuppression: true },
                        });
                        streamRef.current = stream;
                        setCameraActive(true);
                        if (interviewId) await whisperSession.start({ sharedMediaStream: stream });
                      } catch {
                        toast.error("Camera/mic access required.", { duration: 2600 });
                      }
                    }}>
                      {cameraActive ? <Video className="h-4 w-4 mr-1" /> : <VideoOff className="h-4 w-4 mr-1" />}
                      {cameraActive ? "Camera on" : "Enable camera"}
                    </Button>
                    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                      <Radio className="h-3 w-3" />
                      {whisperSession.sttMode === "whisper" ? "Whisper" : "—"}
                    </span>
                  </div>
                  <div className="rounded-md border p-3 bg-card">
                    <p className="text-sm font-medium text-muted-foreground mb-2">Question</p>
                    <p className="text-sm leading-relaxed">{currentQuestion}</p>
                  </div>
                  <div ref={answerScrollRef} className="max-h-40 overflow-y-auto rounded-md border p-2 bg-background">
                    {answerDraft || partial ? (
                      <p className="text-sm whitespace-pre-wrap">
                        {answerDraft}
                        {partial ? <span className="text-muted-foreground italic"> {partial}</span> : null}
                      </p>
                    ) : (
                      <p className="text-sm text-muted-foreground">Your answer appears here as you speak.</p>
                    )}
                  </div>
                  <Textarea
                    placeholder="Or type your answer…"
                    value={answerDraft}
                    onChange={(e) => setAnswerDraft(e.target.value)}
                    className="min-h-[72px]"
                  />
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      onClick={() => void submitAnswer()}
                      disabled={turnInFlight || whisperSession.floor !== "user_speaking"}
                    >
                      <Send className="h-4 w-4 mr-2" />
                      Submit answer
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        if (currentQuestion.trim() && whisperSession.floor === "user_speaking" && !turnInFlight) {
                          void aiSpeak(currentQuestion);
                        }
                      }}
                    >
                      <Mic className="h-4 w-4 mr-2" />
                      Replay question
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {outcome && (
            <div className="space-y-4 rounded-lg border p-4">
              <h4 className="font-semibold">Session complete</h4>
              <p className="text-sm text-muted-foreground">
                {outcome.timeExpired
                  ? "Time expired for this attempt."
                  : outcome.pass
                    ? "You passed this verification step."
                    : "You did not meet the bar on this attempt. Retry follows cooldown and retake policy."}
              </p>
              {typeof outcome.totalScore === "number" && (
                <p className="text-sm">
                  Overall score: <strong>{outcome.totalScore}</strong>
                </p>
              )}
              {outcome.verifiedSkills && outcome.verifiedSkills.length > 0 && (
                <div>
                  <p className="text-sm font-medium mb-2">Skill scores (0–100)</p>
                  <ul className="space-y-1 text-sm">
                    {outcome.verifiedSkills.map((s) => (
                      <li key={s.skill} className="flex justify-between gap-2">
                        <span>{s.skill}</span>
                        <span className="text-muted-foreground">{s.confidence}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {onReturnToDashboard && (
                <Button onClick={onReturnToDashboard}>Back to dashboard</Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
