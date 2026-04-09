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
import { Mic, Video, VideoOff, Shield, RotateCcw, Radio, Clock, Send, Keyboard } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";

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

const SPRINT_STEPS = [
  { num: 1, short: "Defense" },
  { num: 2, short: "Foundations" },
  { num: 3, short: "Systems" },
] as const;

/** Let room audio / speaker tail decay so Whisper does not pick up TTS as the user's answer. */
const POST_AI_SPEECH_COOLDOWN_MS = 520;

/** Pause after acknowledgement clip before the next question TTS (sequential playback). */
const ACK_BEFORE_QUESTION_GAP_MS = 400;

const SILENCE_NUDGE_MS = 5000;
const SILENCE_NUDGES = [
  "Take your time.",
  "No rush — think it through.",
  "Feel free to think out loud.",
  "Take a moment if you need.",
];

/** Single-segment STT that is only a politeness echo (common after AI speaks). */
const POLITENESS_ONLY_TRANSCRIPT = /^(thank you|thanks|thx|ty|okay|ok\.?|got it|gotcha|mhm+|mm+|uh-?huh|sure)\.?$/i;

function scrubSttEcho(text: string): string {
  let s = text.trim();
  if (!s) return "";
  if (POLITENESS_ONLY_TRANSCRIPT.test(s)) return "";
  s = s.replace(/^(thank you|thanks)(?:\s+so much)?\s*[,.!?]?\s+/i, "").trim();
  if (POLITENESS_ONLY_TRANSCRIPT.test(s)) return "";
  return s;
}

/** Tiny silent WAV — call synchronously from a click/tap before awaits so later `Audio.play()` is not blocked by autoplay policy. */
function unlockInterviewAudioOutput(): void {
  try {
    const a = new Audio(
      "data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA"
    );
    a.volume = 0.01;
    void a.play().then(() => {
      a.pause();
      a.removeAttribute("src");
    }).catch(() => {});
  } catch {
    /* ignore */
  }
}

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

function experienceLevelFromYears(years: number | undefined | null): "junior" | "mid" | "senior" {
  if (years == null || Number.isNaN(years) || years < 0) return "mid";
  if (years < 2) return "junior";
  if (years < 5) return "mid";
  return "senior";
}

function defaultJobRoleWhenNoTitle(vrt: "technical" | "non_technical" | "data"): string {
  if (vrt === "non_technical") return "Professional role";
  if (vrt === "data") return "Data professional";
  return "Software Engineer";
}

function initialJobRole(
  title: string | undefined,
  vrt: "technical" | "non_technical" | "data"
): string {
  const t = title?.trim() ?? "";
  if (t) return t;
  return defaultJobRoleWhenNoTitle(vrt);
}

function interviewSetupDescription(vrt: "technical" | "non_technical" | "data"): string {
  if (vrt === "non_technical") {
    return "Structured interview about your experience and fit for your target role. Typed answers. Camera required for proctoring.";
  }
  if (vrt === "data") {
    return "Multi-part interview covering your data background, depth, and reasoning. Voice-first. Camera required for proctoring.";
  }
  return "3-sprint adversarial interview — Project Defense → Foundations → System Design. Voice-first. Camera required for proctoring.";
}

export interface ExpertInterviewStageProps {
  targetJobTitle?: string;
  /** Profile years of experience — used when role/experience pickers are skipped. */
  experienceYears?: number;
  /** Verification track — non-tech defaults to typed answers; technical defaults to voice. */
  verificationRoleType?: "technical" | "non_technical" | "data";
  onReturnToDashboard?: () => void;
  onInterviewAwaitingReview?: () => void;
  onPaywallRequired?: (stage: string, pricing: { singleInr: number; bundleInr: number }, cooldown: Date | null) => void;
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
    const looksLikeAudio =
      contentType.includes("audio") || contentType.includes("octet-stream");

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
    if (data.fallback) {
      await fallbackBrowserTTS(data.text || text, signal);
    }
  } catch (e) {
    if (signal?.aborted) return;
    console.warn("[speakText] TTS request failed, using browser fallback:", e);
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
    const looksLikeAudio =
      contentType.includes("audio") || contentType.includes("octet-stream");

    if (looksLikeAudio) {
      let fillerFromHeader = "";
      try {
        const raw = res.headers.get("X-Filler-Text");
        if (raw) fillerFromHeader = decodeURIComponent(raw);
      } catch {
        /* ignore */
      }

      const blob = await res.blob();
      if (blob.size === 0) {
        if (fillerFromHeader) await fallbackBrowserTTS(fillerFromHeader, signal);
        return;
      }
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
        audio.onerror = () => {
          void (fillerFromHeader
            ? fallbackBrowserTTS(fillerFromHeader, signal)
            : Promise.resolve()
          ).finally(cleanup);
        };
        void audio.play().catch(() => {
          void (fillerFromHeader
            ? fallbackBrowserTTS(fillerFromHeader, signal)
            : Promise.resolve()
          ).finally(cleanup);
        });
      });
      return;
    }

    const data = (await res.json()) as { fallback?: boolean; text?: string };
    if (data.fallback && data.text) {
      await fallbackBrowserTTS(data.text, signal);
    }
  } catch {
    /* filler optional */
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
    const voices = window.speechSynthesis.getVoices();
    const preferred = voices.find(
      (v) =>
        v.name.includes("Samantha") || v.name.includes("Karen") || v.name.includes("Google US English")
    );
    if (preferred) u.voice = preferred;
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
  experienceYears,
  verificationRoleType = "technical",
  onReturnToDashboard,
  onInterviewAwaitingReview,
  onPaywallRequired,
}: ExpertInterviewStageProps) {
  const { user } = useAuth();
  const { getMode } = useFeatureFlags();

  const hasProfileTitle = Boolean(targetJobTitle?.trim());
  const skipRoleSetup =
    verificationRoleType === "non_technical" ||
    verificationRoleType === "data" ||
    hasProfileTitle;

  const [jobRole, setJobRole] = useState(() => initialJobRole(targetJobTitle, verificationRoleType));
  const [experienceLevel, setExperienceLevel] = useState<"junior" | "mid" | "senior">(() =>
    experienceLevelFromYears(experienceYears)
  );

  useEffect(() => {
    if (!skipRoleSetup) return;
    const t = targetJobTitle?.trim();
    setJobRole(t || defaultJobRoleWhenNoTitle(verificationRoleType));
  }, [targetJobTitle, verificationRoleType, skipRoleSetup]);

  useEffect(() => {
    if (!skipRoleSetup) return;
    setExperienceLevel(experienceLevelFromYears(experienceYears));
  }, [experienceYears, skipRoleSetup]);

  const [interviewId, setInterviewId] = useState<string | null>(null);
  const [started, setStarted] = useState(false);
  const [outcome, setOutcome] = useState<{
    terminatedByProctoring?: boolean;
    /** Server is running multi-pass scoring after the final turn (async path). */
    evaluating?: boolean;
    evaluatingTimedOut?: boolean;
    pendingReview?: boolean;
    totalScore?: number;
    badgeLevel?: string;
    evaluation?: Record<string, unknown>;
    timeExpired?: boolean;
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
  const [turnInFlight, setTurnInFlight] = useState(false);
  const [remainingMinutes, setRemainingMinutes] = useState<number | null>(null);
  /** Committed voice segments (finalized STT). Live line is `partial`. Submit sends draft + partial. */
  const [answerDraft, setAnswerDraft] = useState("");
  const [answerInputMode, setAnswerInputMode] = useState<"voice" | "typed">(() =>
    verificationRoleType === "non_technical" ? "typed" : "voice"
  );
  const answerInputModeRef = useRef(answerInputMode);
  answerInputModeRef.current = answerInputMode;
  const isTypedAnswer = answerInputMode === "typed";

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const processingRef = useRef(false);
  const questionShownAtRef = useRef(Date.now());
  const aiSpeakRef = useRef<(text: string) => Promise<void>>(async () => {});
  const answerDraftRef = useRef("");
  const interviewIdRef = useRef<string | null>(null);
  const currentTurnIdRef = useRef("");
  /** Last segment Whisper round-trip (ms), sent with v2/turn for turnLog instrumentation. */
  const lastWhisperLatencyMsRef = useRef<number | undefined>(undefined);
  const silenceNudgeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Scrollable answer panel: keep viewport near bottom when new text arrives unless user scrolled up. */
  const answerScrollRef = useRef<HTMLDivElement>(null);
  const [pivotBanner, setPivotBanner] = useState(false);
  const [resultMeta, setResultMeta] = useState<{
    reviewRequestedAt: string | null;
    completedAt: string | null;
  } | null>(null);
  const [reviewReason, setReviewReason] = useState("");
  const [reviewSubmitting, setReviewSubmitting] = useState(false);
  /** Cleared on unmount — in-flight evaluation polling stops updating state after navigate away. */
  const interviewStageAliveRef = useRef(true);
  useEffect(() => {
    interviewStageAliveRef.current = true;
    return () => {
      interviewStageAliveRef.current = false;
    };
  }, []);

  const inTest = Boolean(interviewId) && !outcome;

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
    if (nearBottom || partial) {
      el.scrollTop = el.scrollHeight;
    }
  }, [answerDraft, partial]);

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
    /** Expert Interview: match legacy always-on face/phone checks whenever camera is live (camera is required for this round). */
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
    [clearSilenceNudgeTimer],
  );

  /** Voice end-of-utterance only extends the local draft; user submits explicitly to advance. */
  const appendFinalToDraft = useCallback(
    (text: string, meta?: { whisperLatencyMs: number }) => {
      const t = scrubSttEcho(text);
      if (!t) return;
      clearSilenceNudgeTimer();
      if (meta?.whisperLatencyMs != null) lastWhisperLatencyMsRef.current = meta.whisperLatencyMs;
      setAnswerDraft((prev) => (prev ? `${prev} ${t}` : t));
      setPartial("");
    },
    [clearSilenceNudgeTimer],
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
        /* fallback inside speakText */
      }
      if (!ac.signal.aborted) {
        await new Promise<void>((r) => setTimeout(r, POST_AI_SPEECH_COOLDOWN_MS));
      }
      if (!ac.signal.aborted) {
        if (answerInputModeRef.current === "typed") {
          whisperSession.setCaptureEnabled(false);
          whisperSession.transition("user_speaking");
        } else {
          whisperSession.setCaptureEnabled(true);
          whisperSession.transition("user_speaking");
          whisperSession.resumeListening();
        }
      }
    },
    [whisperSession]
  );

  /** Sequential TTS: optional short acknowledgement fully finishes, gap, then question (barge-in aborts all). */
  const speakAckThenQuestion = useCallback(
    async (expectedTurnId: string, acknowledgement: string | null | undefined, question: string) => {
      const resumeListeningAfterStale = () => {
        if (answerInputModeRef.current === "typed") {
          whisperSession.setCaptureEnabled(false);
          whisperSession.transition("user_speaking");
        } else {
          whisperSession.setCaptureEnabled(true);
          whisperSession.transition("user_speaking");
          whisperSession.resumeListening();
        }
      };

      window.speechSynthesis?.cancel();
      abortRef.current?.abort();
      const ac = new AbortController();
      abortRef.current = ac;
      whisperSession.setAbortController(ac);
      whisperSession.setCaptureEnabled(false);
      whisperSession.transition("ai_speaking");
      const ack = acknowledgement?.trim() ?? "";
      try {
        if (expectedTurnId !== currentTurnIdRef.current) {
          ac.abort();
          resumeListeningAfterStale();
          return;
        }
        if (ack && !ac.signal.aborted) {
          await speakText(ack, ac.signal);
        }
        if (expectedTurnId !== currentTurnIdRef.current) {
          ac.abort();
          resumeListeningAfterStale();
          return;
        }
        if (ack && !ac.signal.aborted) {
          await new Promise<void>((r) => setTimeout(r, ACK_BEFORE_QUESTION_GAP_MS));
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
        /* speakText handles fallback */
      }
      if (!ac.signal.aborted) {
        await new Promise<void>((r) => setTimeout(r, POST_AI_SPEECH_COOLDOWN_MS));
      }
      if (!ac.signal.aborted) {
        if (answerInputModeRef.current === "typed") {
          whisperSession.setCaptureEnabled(false);
          whisperSession.transition("user_speaking");
        } else {
          whisperSession.setCaptureEnabled(true);
          whisperSession.transition("user_speaking");
          whisperSession.resumeListening();
        }
      }
    },
    [whisperSession]
  );

  const submitAnswer = useCallback(async () => {
    const id = interviewIdRef.current;
    if (processingRef.current || !id) return;
    const typed = answerInputModeRef.current === "typed";
    if (!typed && whisperSession.floor !== "user_speaking") return;
    if (turnInFlight) return;

    const composed = typed
      ? answerDraftRef.current.trim()
      : [answerDraftRef.current, partial].filter(Boolean).join(" ").trim();
    if (!composed) {
      toast.error(
        typed ? "Type your answer in the box, then submit." : "Speak your answer, then tap submit when you are done.",
        { duration: 2800 }
      );
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
      const timeToSubmit = Math.floor((Date.now() - questionShownAtRef.current) / 1000);

      const turnResult = await api.post<{
        response: string;
        sprint: number;
        sprintName: string;
        persona: string;
        complete: boolean;
        evaluating?: boolean;
        weakness?: Record<string, unknown>;
        questionCount: number;
        turnId?: string;
        pivoting?: boolean;
        fragmentRetry?: boolean;
        acknowledgement?: string;
        timeExpired?: boolean;
        totalScore?: number;
        badgeLevel?: string;
        evaluation?: Record<string, unknown>;
        remainingMinutes?: number;
        completionReason?: string | null;
        message?: string;
      }>("/api/interview/v2/turn", {
        interviewId: id,
        answer: composed,
        inputMode: typed ? "typed" : "voice",
        timeToSubmitSeconds: timeToSubmit,
        turnId,
        ...(typed ? {} : { whisperLatencyMs: lastWhisperLatencyMsRef.current }),
      });

      fillerAc.abort();

      if (turnResult.turnId && turnResult.turnId !== currentTurnIdRef.current) {
        whisperSession.setCaptureEnabled(true);
        whisperSession.transition("user_speaking");
        whisperSession.resumeListening();
        return;
      }

      if (turnResult.remainingMinutes != null) {
        setRemainingMinutes(turnResult.remainingMinutes);
      }

      setWeakness(turnResult.weakness ?? null);
      setQuestionCount(turnResult.questionCount);
      setSprint(turnResult.sprint);
      setSprintName(turnResult.sprintName);
      setPersona(turnResult.persona);
      setAnswerDraft("");
      setPartial("");

      if (turnResult.pivoting) {
        setPivotBanner(true);
        window.setTimeout(() => setPivotBanner(false), 3200);
      }

      if (turnResult.complete) {
        setCurrentQuestion(turnResult.response);
        questionShownAtRef.current = Date.now();
        streamRef.current?.getTracks().forEach((t) => t.stop());
        setCameraActive(false);
        whisperSession.stop();

        const timeExpired = turnResult.timeExpired === true;

        if (turnResult.evaluating) {
          setOutcome({
            evaluating: true,
            timeExpired,
            badgeLevel: "Scoring…",
          });

          const idPoll = interviewIdRef.current;
          if (idPoll) {
            void (async () => {
              const maxWaitMs = 12 * 60 * 1000;
              const started = Date.now();
              let delayMs = 2500;

              while (Date.now() - started < maxWaitMs && interviewStageAliveRef.current) {
                await new Promise<void>((r) => setTimeout(r, delayMs));
                delayMs = 10_000;
                if (!interviewStageAliveRef.current) return;

                try {
                  const progress = await api.get<{
                    status: string;
                    evaluating?: boolean;
                    pendingReview?: boolean;
                    totalScore?: number | null;
                    badgeLevel?: string | null;
                    evaluation?: Record<string, unknown> | null;
                  }>(`/api/interview/${idPoll}/evaluation-progress`);

                  if (progress.status === "evaluating") continue;

                  if (progress.status === "completed") {
                    if (!interviewStageAliveRef.current) return;
                    setOutcome({
                      totalScore: progress.totalScore ?? undefined,
                      badgeLevel: progress.badgeLevel ?? undefined,
                      evaluation: progress.evaluation ?? undefined,
                      timeExpired,
                    });
                    onInterviewAwaitingReview?.();
                    return;
                  }

                  if (progress.status === "pending_review") {
                    if (!interviewStageAliveRef.current) return;
                    setOutcome({
                      pendingReview: true,
                      badgeLevel: progress.badgeLevel ?? "Pending review",
                      timeExpired,
                    });
                    onInterviewAwaitingReview?.();
                    return;
                  }
                } catch {
                  /* transient errors — keep polling until timeout */
                }
              }

              if (interviewStageAliveRef.current) {
                setOutcome({
                  evaluatingTimedOut: true,
                  timeExpired,
                  badgeLevel: "Score pending",
                });
                toast.error("Scoring is taking longer than expected. You can refresh this page or check your dashboard shortly.", {
                  duration: 5200,
                });
              }
            })();
          }
      } else {
          setOutcome({
            totalScore: turnResult.totalScore,
            badgeLevel: turnResult.badgeLevel,
            evaluation: turnResult.evaluation,
            timeExpired,
          });
          onInterviewAwaitingReview?.();
        }
    } else {
        const expectedTurn = turnResult.turnId ?? turnId;
        await speakAckThenQuestion(expectedTurn, turnResult.acknowledgement, turnResult.response);
      }
    } catch (e) {
      fillerAc.abort();
      const fallback = "Could not submit your answer. Check your connection and try again.";
      const msg = e instanceof Error && e.message && e.message !== "Request failed" ? e.message : fallback;
      toast.error(msg, { duration: 4500 });
      whisperSession.setCaptureEnabled(true);
      whisperSession.transition("user_speaking");
      whisperSession.resumeListening();
    } finally {
      processingRef.current = false;
      setTurnInFlight(false);
    }
  }, [whisperSession, partial, turnInFlight, onInterviewAwaitingReview, speakAckThenQuestion, clearSilenceNudgeTimer]);

  const replayQuestion = useCallback(() => {
    unlockInterviewAudioOutput();
    if (!currentQuestion.trim()) return;
    if (whisperSession.floor === "ai_thinking" || whisperSession.floor === "ai_speaking") return;
    if (turnInFlight) return;
    void aiSpeak(currentQuestion);
  }, [aiSpeak, currentQuestion, whisperSession.floor, turnInFlight]);

  useEffect(() => {
    aiSpeakRef.current = aiSpeak;
  }, [aiSpeak]);

  /** Video mounts only after `cameraActive` is true, so binding must run after that render (ref was null in the same tick as getUserMedia). */
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

  const startInterview = async () => {
    unlockInterviewAudioOutput();
    setLoading(true);
    let combinedStream: MediaStream | null = null;
    try {
      // One prompt for camera + mic while we still have a direct user gesture (mobile Safari / Chrome).
      combinedStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user" },
        audio: { echoCancellation: true, noiseSuppression: true },
      });

      await document.documentElement.requestFullscreen().catch(() => {});

      const res = await api.post<{
        interviewId: string;
        question: string;
        sprint: number;
        sprintName: string;
        persona: string;
      }>("/api/interview/v2/start", {
        jobRole: skipRoleSetup
          ? targetJobTitle?.trim() || jobRole
          : jobRole === "Other Technical Role"
            ? targetJobTitle || "Software Engineer"
            : jobRole,
        experienceLevel,
      });

      setInterviewId(res.interviewId);
      setSprint(res.sprint);
      setSprintName(res.sprintName);
      setPersona(res.persona);
      setCurrentQuestion(res.question);
      questionShownAtRef.current = Date.now();
      setRemainingMinutes(30);
      setAnswerDraft("");
      setPartial("");

      setStarted(true);
      streamRef.current = combinedStream;
      setCameraActive(true);

      await whisperSession.start({ sharedMediaStream: combinedStream });

      await aiSpeakRef.current(res.question);
    } catch (e: unknown) {
      if (combinedStream) {
        combinedStream.getTracks().forEach((t) => t.stop());
      }
      streamRef.current = null;
      setCameraActive(false);
      setStarted(false);

      const apiErr = e as { response?: { data?: { code?: string; pricing?: { singleInr: number; bundleInr: number }; nextAvailableAt?: string } } };
      const code = apiErr?.response?.data?.code;
      if ((code === "PAYMENT_REQUIRED" || code === "COOLDOWN") && onPaywallRequired) {
        onPaywallRequired(
          "expert_interview",
          apiErr?.response?.data?.pricing ?? { singleInr: 399, bundleInr: 649 },
          code === "COOLDOWN" && apiErr.response?.data?.nextAvailableAt
            ? new Date(apiErr.response.data.nextAvailableAt)
            : null
        );
      } else {
        const msg = e instanceof Error ? e.message : "Failed to start interview.";
        toast.error(msg, { duration: 3200 });
      }
    } finally {
      setLoading(false);
    }
  };

  /** Only run on real unmount. `whisperSession` is a new object every render — deps on it re-fired cleanup after every state tick and killed camera/mic. */
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
      if (whisperSessionRef.current.floor !== "user_speaking") return;
      void (async () => {
        const w = whisperSessionRef.current;
        const nudge = SILENCE_NUDGES[Math.floor(Math.random() * SILENCE_NUDGES.length)]!;
        window.speechSynthesis?.cancel();
        abortRef.current?.abort();
        const ac = new AbortController();
        abortRef.current = ac;
        w.setAbortController(ac);
        w.setCaptureEnabled(false);
        w.transition("ai_speaking");
        try {
          await speakText(nudge, ac.signal);
        } catch {
          /* speakText handles fallback */
        }
        if (!ac.signal.aborted) {
          await new Promise<void>((r) => setTimeout(r, POST_AI_SPEECH_COOLDOWN_MS));
        }
        if (!ac.signal.aborted) {
          w.setCaptureEnabled(true);
          w.transition("user_speaking");
          w.resumeListening();
        }
      })();
    }, SILENCE_NUDGE_MS);
    return () => clearSilenceNudgeTimer();
  }, [whisperSession.floor, started, outcome, turnInFlight, clearSilenceNudgeTimer]);

  useEffect(() => {
    if (!interviewId || !outcome || outcome.terminatedByProctoring) {
      setResultMeta(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const r = await api.get<{
          completedAt?: string | null;
          reviewRequestedAt?: string | null;
        }>(`/api/interview/${interviewId}/result`);
        if (cancelled) return;
        setResultMeta({
          completedAt: r.completedAt ?? null,
          reviewRequestedAt: r.reviewRequestedAt ?? null,
        });
      } catch {
        if (!cancelled) setResultMeta(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [interviewId, outcome]);

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
          <CardDescription>{interviewSetupDescription(verificationRoleType)}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {!started && (
            <div className="space-y-4">
              {skipRoleSetup ? (
                <div className="rounded-lg border border-border/80 bg-muted/25 px-4 py-3 text-sm space-y-1.5">
                  <p>
                    <span className="text-muted-foreground">Target role: </span>
                    <span className="font-medium text-foreground">{targetJobTitle?.trim() || jobRole}</span>
                  </p>
                  <p>
                    <span className="text-muted-foreground">Experience: </span>
                    <span className="font-medium text-foreground">
                      {EXPERIENCE_OPTIONS.find((o) => o.value === experienceLevel)?.label ?? experienceLevel}
                    </span>
                  </p>
                </div>
              ) : (
                <>
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
                </>
              )}
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
            <div className="space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Sprints</p>
                  <div className="flex flex-wrap gap-2">
                    {SPRINT_STEPS.map((step) => {
                      const active = sprint === step.num;
                      const done = sprint > step.num;
                      return (
                        <div
                          key={step.num}
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
                <div className="flex flex-col items-start sm:items-end gap-1">
                  <div className="flex items-center gap-2 text-sm flex-wrap">
                    <span className="font-semibold text-primary">Sprint {sprint}</span>
                    <span className="text-muted-foreground">·</span>
                    <span className="text-muted-foreground">{sprintName}</span>
                  </div>
                  <span className="text-xs text-muted-foreground italic">{PERSONA_DESC[persona]}</span>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    <div className="w-28 h-1.5 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full bg-primary rounded-full transition-all"
                        style={{ width: `${progressPct}%` }}
                      />
                    </div>
                    <span className="text-xs text-muted-foreground tabular-nums">{questionCount}/15</span>
                    {remainingMinutes != null && (
                      <span className="text-xs text-muted-foreground tabular-nums inline-flex items-center gap-1">
                        <Clock className="h-3 w-3 opacity-70" aria-hidden />
                        ~{remainingMinutes} min left
                      </span>
                    )}
                  </div>
                </div>
                  </div>

              {pivotBanner && (
                <p
                  className="text-xs text-center rounded-md border border-amber-500/35 bg-amber-500/10 text-amber-900 dark:text-amber-200 px-3 py-2"
                  role="status"
                >
                  Moving to the next focus area…
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
                        <Mic
                          className={`h-4 w-4 shrink-0 ${
                            whisperSession.floor === "ai_speaking" ? "opacity-60" : ""
                          }`}
                        />
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
                      {weakness?.severity === "high" && (
                        <span className="text-xs px-2.5 py-1 rounded-full bg-red-500/10 text-red-600 border border-red-500/25">
                          Probing weakness
                        </span>
                      )}
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
                              Your speech is transcribed here after each pause. Scroll inside this box to read longer answers; only this area updates as you speak.
                      </span>
                          )}
                    </div>
                        </div>
                    )}

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
                        {questionCount >= 14 ? "Submit & complete round" : "Submit answer"}
                        </Button>
                      <p className="text-[11px] text-muted-foreground">
                        Submit when your full answer is ready. Short pauses send each segment to transcription; they do not submit automatically.
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
                  {outcome.evaluating && (
                    <p className="text-sm text-muted-foreground flex items-center gap-2" role="status">
                      <span
                        className="inline-block size-4 border-2 border-primary border-t-transparent rounded-full animate-spin shrink-0"
                        aria-hidden
                      />
                      Scoring your interview — this usually finishes in under a minute. Please keep this tab open.
                    </p>
                  )}
                  {outcome.evaluatingTimedOut && (
                    <p className="text-sm rounded-md border border-border bg-muted/40 px-3 py-2 text-muted-foreground" role="status">
                      Results are still being generated. Refresh this page in a moment, or open your dashboard — scores appear when
                      ready.
                    </p>
                  )}
                  {outcome.pendingReview && (
                    <p className="text-sm rounded-md border border-primary/25 bg-primary/5 px-3 py-2 text-muted-foreground" role="status">
                      Your session is queued for a quick human review. You&apos;ll be notified when your badge is finalized.
                    </p>
                  )}
                  {outcome.timeExpired && !outcome.evaluating && (
                    <p
                      className="text-sm rounded-md border border-amber-500/35 bg-amber-500/10 text-amber-900 dark:text-amber-200 px-3 py-2"
                      role="status"
                    >
                      Time limit reached — your responses have been recorded. Generating your evaluation…
                    </p>
                  )}
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
                  {interviewId &&
                    resultMeta &&
                    (() => {
                      const completedMs = resultMeta.completedAt
                        ? new Date(resultMeta.completedAt).getTime()
                        : null;
                      const daysSince =
                        completedMs != null ? (Date.now() - completedMs) / (86400 * 1000) : null;
                      const canRequest =
                        daysSince != null &&
                        daysSince <= 7 &&
                        !resultMeta.reviewRequestedAt;
                      if (!canRequest && !resultMeta.reviewRequestedAt) return null;
                      return (
                        <div className="rounded-md border border-border bg-muted/30 p-3 space-y-2">
                          <p className="text-sm font-medium">Request a review</p>
                          {resultMeta.reviewRequestedAt ? (
                            <p className="text-sm text-muted-foreground">
                              Review requested — we&apos;ll get back to you within 24 hours.
                            </p>
                          ) : (
                            <>
                              <p className="text-xs text-muted-foreground">
                                If something went wrong with your session, you can ask our team to take a second look
                                (within 7 days of completion). Please give a short, specific reason (10–500 characters).
                              </p>
                              <Textarea
                                value={reviewReason}
                                onChange={(e) => setReviewReason(e.target.value)}
                                placeholder="Describe what you’d like us to review…"
                                className="min-h-[88px] text-sm"
                              />
                              <Button
                                type="button"
                                size="sm"
                                disabled={
                                  reviewSubmitting ||
                                  reviewReason.trim().length < 10 ||
                                  reviewReason.length > 500
                                }
                                onClick={() => {
                                  if (!interviewId) return;
                                  setReviewSubmitting(true);
                                  void (async () => {
                                    try {
                                      await api.post(`/api/interview/${interviewId}/request-review`, {
                                        reason: reviewReason.trim(),
                                      });
                                      toast.success("Review request submitted. You’ll hear back within 24 hours.");
                                      setReviewReason("");
                                      setResultMeta((prev) =>
                                        prev
                                          ? { ...prev, reviewRequestedAt: new Date().toISOString() }
                                          : prev,
                                      );
                                    } catch (e: unknown) {
                                      toast.error(
                                        e instanceof Error ? e.message : "Could not submit review request",
                                        { duration: 5000 },
                                      );
                                    } finally {
                                      setReviewSubmitting(false);
                                    }
                                  })();
                                }}
                              >
                                {reviewSubmitting ? "Submitting…" : "Submit review request"}
                              </Button>
                            </>
                          )}
                </div>
                      );
                    })()}
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
