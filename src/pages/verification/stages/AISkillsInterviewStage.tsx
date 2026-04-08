import { useState, useRef, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { api, getAuthToken } from "@/lib/api";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { useWhisperSession } from "@/hooks/useWhisperSession";
import { useProctoringRiskMonitor, type ProctoringEventCode, type StrikeTerminationMode } from "@/hooks/useProctoringRiskMonitor";
import { useFeatureFlags } from "@/hooks/useFeatureFlags";
import { Mic, Video, VideoOff, Shield, RotateCcw, Radio, Clock, Send } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";

const POST_AI_SPEECH_COOLDOWN_MS = 520;
const ACK_BEFORE_QUESTION_GAP_MS = 400;
const SILENCE_NUDGE_MS = 5000;
const SILENCE_NUDGES = [
  "Take your time.",
  "No rush — think it through.",
  "Feel free to think out loud.",
  "Take a moment if you need.",
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

/** Same role list as AI Expert Interview for consistent UX. */
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

function tierFromYears(years: number): "fresher" | "mid" | "senior" {
  if (years < 1) return "fresher";
  if (years < 3) return "mid";
  return "senior";
}

function tierLabel(t: ReturnType<typeof tierFromYears>): string {
  if (t === "fresher") return "Fresher (0–1 yr)";
  if (t === "mid") return "Mid (1–3 yr)";
  return "Senior (3+ yr)";
}

export interface AISkillsInterviewStageProps {
  targetJobTitle?: string;
  experienceYears: number;
  onSessionComplete: () => void;
  onReturnToDashboard?: () => void;
  onPaywallRequired?: (stage: string, pricing: { singleInr: number; bundleInr: number }, cooldown: Date | null) => void;
}

export default function AISkillsInterviewStage({
  targetJobTitle = "",
  experienceYears,
  onSessionComplete,
  onReturnToDashboard,
  onPaywallRequired,
}: AISkillsInterviewStageProps) {
  const { user } = useAuth();
  const { getMode } = useFeatureFlags();

  const [jobRole, setJobRole] = useState(
    targetJobTitle && INTERVIEW_ROLES.includes(targetJobTitle) ? targetJobTitle : "Software Engineer"
  );
  const [interviewId, setInterviewId] = useState<string | null>(null);
  const [started, setStarted] = useState(false);
  const [outcome, setOutcome] = useState<{
    terminatedByProctoring?: boolean;
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
  const sessionStartRef = useRef<number | null>(null);

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
    setOutcome({ terminatedByProctoring: true, totalScore: 0, pass: false });
    void reason;
  }, []);

  const inTest = Boolean(interviewId) && !outcome;

  const { violationSessionLevel, totalLoggedViolations } = useProctoringRiskMonitor({
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
      toast.error("Speak your answer, then tap submit when you are done.", { duration: 2800 });
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
        setPhaseBanner("Moving to resume skill verification…");
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

  const replayQuestion = useCallback(() => {
    unlockInterviewAudioOutput();
    if (!currentQuestion.trim()) return;
    if (whisperSession.floor === "ai_thinking" || whisperSession.floor === "ai_speaking") return;
    if (turnInFlight) return;
    void aiSpeak(currentQuestion);
  }, [aiSpeak, currentQuestion, whisperSession.floor, turnInFlight]);

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

  useEffect(() => {
    if (!started || outcome || sessionStartRef.current == null) return;
    const tick = () => {
      const m = Math.max(0, 30 - Math.floor((Date.now() - sessionStartRef.current!) / 60000));
      setRemainingMinutes(m);
    };
    tick();
    const id = window.setInterval(tick, 30_000);
    return () => window.clearInterval(id);
  }, [started, outcome]);

  const startCamera = async () => {
    try {
      whisperSession.stop();
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user" },
        audio: { echoCancellation: true, noiseSuppression: true },
      });
      streamRef.current = stream;
      setCameraActive(true);
      if (started && interviewId && !outcome) {
        await whisperSession.start({ sharedMediaStream: stream });
      }
    } catch {
      toast.error("Camera and microphone access is required.", { duration: 2600 });
    }
  };

  const stopCamera = () => {
    whisperSession.stop();
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setCameraActive(false);
  };

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
      sessionStartRef.current = Date.now();
      setAnswerDraft("");
      setPartial("");
      setStarted(true);
      streamRef.current = combinedStream;
      setCameraActive(true);
      await whisperSession.start({ sharedMediaStream: combinedStream });
      await aiSpeakRef.current(res.firstQuestion);
    } catch (e: unknown) {
      if (combinedStream) combinedStream.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      setCameraActive(false);
      sessionStartRef.current = null;
      setStarted(false);

      const apiErr = e as { response?: { data?: { code?: string; pricing?: { singleInr: number; bundleInr: number }; nextAvailableAt?: string } } };
      const code = apiErr?.response?.data?.code;
      if ((code === "PAYMENT_REQUIRED" || code === "COOLDOWN") && onPaywallRequired) {
        onPaywallRequired(
          "ai_skills_interview",
          apiErr?.response?.data?.pricing ?? { singleInr: 399, bundleInr: 649 },
          code === "COOLDOWN" && apiErr.response?.data?.nextAvailableAt
            ? new Date(apiErr.response.data.nextAvailableAt)
            : null
        );
      } else {
        const msg = e instanceof Error ? e.message : "Failed to start.";
        toast.error(msg, { duration: 4000 });
      }
    } finally {
      setLoading(false);
    }
  };

  const progressPct = questionsTotal > 0 ? Math.min((questionsAsked / questionsTotal) * 100, 100) : 0;
  const tier = tierFromYears(experienceYears);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" />
            AI Skills Interview
          </CardTitle>
          <CardDescription>
            DSA walkthrough of your submissions, then depth checks on resume skills. Voice-first. Camera required for
            proctoring. Plan for up to 30 minutes in one sitting.
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
              <div className="rounded-lg border border-border/80 bg-muted/20 px-3 py-2.5 text-sm text-muted-foreground">
                Experience band for this session:{" "}
                <span className="font-semibold text-foreground">{tierLabel(tier)}</span> (from your profile).
              </div>
              <div className="flex gap-2 flex-wrap">
                <Button onClick={() => void startSession()} disabled={loading} size="lg">
                  {loading ? "Starting…" : "Start Interview →"}
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
            <div className="space-y-6">
              <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
                <div>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Interview flow</p>
                  <div className="flex flex-wrap gap-2">
                    {(
                      [
                        { id: "dsa_walkthrough" as const, num: 1, short: "DSA walkthrough" },
                        { id: "skill_checkup" as const, num: 2, short: "Skill checkup" },
                      ] as const
                    ).map((step) => {
                      const active =
                        step.id === "dsa_walkthrough"
                          ? phaseLabel === "dsa_walkthrough"
                          : phaseLabel === "skill_checkup" || phaseLabel === "complete";
                      const done =
                        step.id === "dsa_walkthrough"
                          ? phaseLabel === "skill_checkup" || phaseLabel === "complete"
                          : phaseLabel === "complete";
                      return (
                        <div
                          key={step.id}
                          className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                            active
                              ? "border-primary bg-primary/15 text-primary shadow-sm"
                              : done
                                ? "border-primary/20 bg-muted/50 text-muted-foreground"
                                : "border-muted bg-muted/20 text-muted-foreground"
                          }`}
                        >
                          <span
                            className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] tabular-nums ${
                              active ? "bg-primary text-primary-foreground" : done ? "bg-primary/30 text-primary" : "bg-muted"
                            }`}
                          >
                            {step.num}
                          </span>
                          <span>{step.short}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
                <div className="flex flex-col items-start lg:items-end gap-1 min-w-[10rem]">
                  <div className="flex items-center gap-2 flex-wrap justify-end">
                    <div className="w-28 h-1.5 bg-muted rounded-full overflow-hidden">
                      <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${progressPct}%` }} />
                    </div>
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {questionsAsked}/{questionsTotal}
                    </span>
                    {remainingMinutes != null && (
                      <span className="text-xs text-muted-foreground tabular-nums inline-flex items-center gap-1">
                        <Clock className="h-3 w-3 opacity-70" aria-hidden />
                        ~{remainingMinutes} min left
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {phaseBanner && (
                <p
                  className="text-xs text-center rounded-md border border-amber-500/35 bg-amber-500/10 text-amber-900 dark:text-amber-200 px-3 py-2"
                  role="status"
                >
                  {phaseBanner}
                </p>
              )}

              <div className="flex items-center gap-2 text-xs text-muted-foreground rounded-lg border border-border/80 bg-muted/20 px-3 py-2">
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
                <span className="tabular-nums">({totalLoggedViolations} alerts)</span>
              </div>

              <div className="grid gap-6 lg:grid-cols-12 lg:items-start">
                <div className="lg:col-span-5 space-y-3">
                  <div className="rounded-xl border-2 border-primary/20 bg-muted/30 overflow-hidden">
                    <div className="flex items-center justify-between px-3 py-2 border-b border-border/60 bg-background/50">
                      <span className="text-xs font-medium text-muted-foreground">Camera preview</span>
                      {cameraActive ? (
                        <span className="text-[10px] uppercase tracking-wide text-green-600 dark:text-green-400">Live</span>
                      ) : (
                        <span className="text-[10px] uppercase tracking-wide text-amber-600 dark:text-amber-400">Required</span>
                      )}
                    </div>
                    <div className="aspect-video relative bg-black/40">
                      {cameraActive ? (
                        <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
                      ) : (
                        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-6 text-center">
                          <Video className="h-10 w-10 text-muted-foreground opacity-60" />
                          <p className="text-xs text-muted-foreground max-w-[14rem]">
                            Turn on your camera for proctoring. Your video is not uploaded as a recording.
                          </p>
                          <Button variant="secondary" size="sm" onClick={() => void startCamera()}>
                            <Video className="h-4 w-4 mr-2" />
                            Enable camera
                          </Button>
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
                          onClick={() => replayQuestion()}
                          disabled={
                            !currentQuestion.trim() ||
                            whisperSession.floor === "ai_thinking" ||
                            whisperSession.floor === "ai_speaking" ||
                            turnInFlight
                          }
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
                              whisperSession.floor === "user_speaking" ? "bg-primary/70" : "bg-muted-foreground/25"
                            }`}
                            style={{
                              height: `${Math.max(
                                12,
                                whisperSession.floor === "user_speaking"
                                  ? Math.min(100, whisperSession.micLevel * 100 + (i % 3) * 6)
                                  : 14
                              )}%`,
                            }}
                          />
                        ))}
                      </div>
                      <p className="text-[11px] text-muted-foreground">
                        {whisperSession.floor === "user_speaking"
                          ? "Pause ~1.5s after a phrase to transcribe; multiple segments combine in your answer."
                          : "When the AI finishes, you can speak again."}
                      </p>
                    </div>

                    {started && interviewId && !outcome && (
                      <div className="rounded-lg border border-dashed border-primary/25 bg-muted/20 px-3 py-2 space-y-2">
                        <p className="text-[10px] font-medium text-primary uppercase tracking-wide">Your answer</p>
                        <div
                          ref={answerScrollRef}
                          className="max-h-[min(40vh,18rem)] min-h-[5.5rem] overflow-y-auto rounded-md border border-border/80 bg-background px-3 py-2.5 text-sm leading-relaxed text-foreground whitespace-pre-wrap break-words"
                          aria-label="Transcribed answer text"
                        >
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
                      />
                    </div>

                    <div className="flex flex-col sm:flex-row sm:items-center gap-2 pt-1">
                      <Button
                        type="button"
                        size="default"
                        className="gap-2 shrink-0"
                        onClick={() => void submitAnswer()}
                        disabled={
                          !interviewId ||
                          whisperSession.floor !== "user_speaking" ||
                          turnInFlight ||
                          ![answerDraft, partial].filter(Boolean).join(" ").trim()
                        }
                      >
                        <Send className="h-4 w-4" />
                        Submit answer
                      </Button>
                      <p className="text-[11px] text-muted-foreground">
                        Submit when your full answer is ready. Short pauses send each phrase to transcription; they do not submit
                        automatically.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {outcome && (
            <div className="rounded-lg border border-primary/30 bg-primary/5 p-5 space-y-3">
              {outcome.terminatedByProctoring ? (
                <>
                  <h4 className="font-semibold text-destructive">Interview ended</h4>
                  <p className="text-sm text-muted-foreground">Session stopped after repeated integrity alerts.</p>
                  {onReturnToDashboard && (
                    <Button variant="outline" onClick={onReturnToDashboard}>
                      Return to Dashboard
                    </Button>
                  )}
                </>
              ) : (
                <>
                  <h4 className="font-semibold">Interview complete</h4>
                  {outcome.timeExpired && (
                    <p
                      className="text-sm rounded-md border border-amber-500/35 bg-amber-500/10 text-amber-900 dark:text-amber-200 px-3 py-2"
                      role="status"
                    >
                      Time limit reached — your responses have been recorded.
                    </p>
                  )}
                  <p className="text-sm text-muted-foreground">
                    {outcome.pass
                      ? "You passed this verification step."
                      : "You did not meet the bar on this attempt. Retry follows cooldown and retake policy."}
                  </p>
                  {typeof outcome.totalScore === "number" && (
                    <span className="text-sm">
                      Overall score: <strong>{outcome.totalScore}</strong>
                    </span>
                  )}
                  {outcome.verifiedSkills && outcome.verifiedSkills.length > 0 && (
                    <div className="rounded-lg border border-border/80 bg-background/60 p-3 space-y-2">
                      <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Skill scores (0–100)</p>
                      <ul className="space-y-2 text-sm">
                        {outcome.verifiedSkills.map((s) => (
                          <li key={s.skill} className="flex justify-between gap-2 items-center">
                            <span>{s.skill}</span>
                            <div className="flex items-center gap-2 min-w-[6rem]">
                              <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden max-w-[5rem]">
                                <div className="h-full bg-primary rounded-full" style={{ width: `${Math.min(100, s.confidence)}%` }} />
                              </div>
                              <span className="text-muted-foreground tabular-nums text-xs w-8 text-right">{s.confidence}</span>
                            </div>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {onReturnToDashboard && (
                    <Button variant="outline" onClick={onReturnToDashboard}>
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
