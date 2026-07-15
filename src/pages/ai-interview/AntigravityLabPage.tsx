import { useState, useEffect, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { api, getAuthToken } from "@/lib/api";
import { AIOrb, Waveform } from "@/components/antigravity/AIOrb";
import {
  InterviewSession,
  processTurn,
  prefetchAudio,
  prefetchFillerAudio,
  playAudioUrl,
  FloorState,
} from "@/lib/antigravity/audio";

// ─── Constants ────────────────────────────────────────────────────────────────

const SPRINT_LABELS: Record<number, string> = {
  1: "Project Defense",
  2: "Foundations",
  3: "System Design",
};

const PERSONA_DESC: Record<string, string> = {
  curious_lead: "Challenging your ownership",
  socratic_mentor: "Testing first principles",
  senior_peer: "Stress-testing your design",
};

const EXPERIENCE_OPTIONS = [
  { value: "junior", label: "0–2 years (Junior)" },
  { value: "mid", label: "2–5 years (Mid)" },
  { value: "senior", label: "5+ years (Senior)" },
] as const;

const ANSWER_SETTLE_MS = 700;
const TTS_HOLD_CAP_MS = 2500;
const FINALIZE_RETRY_INTERVAL_MS = 8_000;
const FINALIZE_MAX_ATTEMPTS = 6;

const LAUNCH_STATUSES = [
  "Preparing interview map…",
  "Grounding follow-up tracks…",
  "Launching interview room…",
] as const;

function yearsToLevel(years?: number): string {
  if (!years || years <= 2) return "junior";
  if (years <= 5) return "mid";
  return "senior";
}

// ─── Types ────────────────────────────────────────────────────────────────────

type Phase = "checking" | "setup" | "interview" | "done";

type EngineStart = {
  sessionId: string;
  openingQuestion: string;
  sprint: number;
  interviewId: string;
  restoredMessages?: Message[];
  restoredQuestionCount?: number;
};

type CompletionResult = {
  score: number | null;
  badge: string | null;
  verdict: string | null;
};

type ReportData = {
  session_id: string;
  complete: boolean;
  target_role: string;
  years_experience: string;
  total_questions: number;
  overall_score: number | null;
  hire_recommendation: string | null;
  confidence_score: number | null;
  summary: string | null;
  strengths: string[];
  risk_flags: string[];
  untested_dimensions: string[];
  scores: Record<string, number | string>;
  failure_surface: Record<string, number>;
  raw_weaknesses: {
    type: string;
    severity: string;
    weakness: string;
    attack_strategy: string;
  }[];
  claim_credibility_risk: { level: string; detail: string } | null;
};

type AnswerDraft = {
  turnId: string;
  textParts: string[];
  entitySet: Set<string>;
  submittedText: string | null;
  pendingRevision: boolean;
  requestVersion: number;
  messageIndex: number | null;
  commitTimer: ReturnType<typeof setTimeout> | null;
};

type Message = {
  role: "ai" | "candidate";
  text: string;
  severity?: string;
  isSprintMarker?: boolean;
  isPivotMarker?: boolean;
  sprint?: number;
};

type HistoryEntry = {
  question: string;
  answer: string;
  weakness?: { severity?: string } | null;
  sprint?: number;
};

type PreparePollSnapshot = {
  ready: boolean;
  session_id?: string;
  opening_question?: string;
  sprint?: number;
  error?: string;
  prepare_status?: string | null;
  interview_status?: string | null;
  started_at?: string | null;
};

type PrepareReadyResult = {
  session_id: string;
  opening_question: string;
  sprint: number;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildMessagesFromHistory(history: HistoryEntry[]): Message[] {
  const out: Message[] = [];
  let lastSprint = 1;
  history.forEach((turn, i) => {
    const s = turn.sprint ?? lastSprint;
    if (i > 0 && s !== lastSprint) {
      out.push({
        role: "ai",
        text: `Sprint ${s} — ${SPRINT_LABELS[s]}`,
        isSprintMarker: true,
        sprint: s,
      });
    }
    out.push({
      role: "ai",
      text: turn.question,
      severity: turn.weakness?.severity,
    });
    out.push({ role: "candidate", text: turn.answer });
    lastSprint = s;
  });
  return out;
}

function formatPrepareTimeout(snapshot: PreparePollSnapshot | null): string {
  if (!snapshot) return "Interview preparation timed out. Please try again.";
  if (snapshot.error) return snapshot.error;
  const pieces = [
    snapshot.prepare_status ? `prepare=${snapshot.prepare_status}` : null,
    snapshot.interview_status ? `interview=${snapshot.interview_status}` : null,
  ].filter(Boolean);
  let age = "";
  if (snapshot.started_at) {
    const ms = Date.now() - new Date(snapshot.started_at).getTime();
    if (Number.isFinite(ms))
      age = ` after ${Math.max(0, Math.round(ms / 1000))}s`;
  }
  return pieces.length > 0
    ? `Interview preparation timed out${age}. Last state: ${pieces.join(", ")}.`
    : `Interview preparation timed out${age}.`;
}

async function pollPrepareStatus(
  interviewId: string,
  cancelled?: boolean,
): Promise<PrepareReadyResult> {
  const MAX_ATTEMPTS = 38;
  await new Promise<void>((r) => setTimeout(r, 2_000));
  let lastSnapshot: PreparePollSnapshot | null = null;
  for (let i = 0; i < MAX_ATTEMPTS; i++) {
    if (cancelled) throw new Error("Cancelled");
    const status = await api.get<PreparePollSnapshot>(
      `/api/ai-interview-adapter/prepare-status/${interviewId}`,
    );
    lastSnapshot = status;
    if (status.ready && status.session_id) {
      return {
        session_id: status.session_id,
        opening_question: status.opening_question ?? "",
        sprint: status.sprint ?? 1,
      };
    }
    if (status.error) throw new Error(status.error);
    if (i < MAX_ATTEMPTS - 1)
      await new Promise<void>((r) => setTimeout(r, 5_000));
  }
  throw new Error(formatPrepareTimeout(lastSnapshot));
}

// ─── Component ────────────────────────────────────────────────────────────────

interface Props {
  targetJobTitle?: string;
  experienceYears?: number;
}

export default function AntigravityLabPage({
  targetJobTitle,
  experienceYears,
}: Props = {}) {
  const searchParams = new URLSearchParams(window.location.search);
  const workspaceAttemptId = searchParams.get("workspace_attempt_id");
  const workspaceCode = searchParams.get("workspace_code");
  const workspaceTargetRole = searchParams.get("target_role");
  // Phase & lifecycle
  const [phase, setPhase] = useState<Phase>("checking");
  const [engine, setEngine] = useState<EngineStart | null>(null);
  const [completion, setCompletion] = useState<CompletionResult | null>(null);
  const [reportData, setReportData] = useState<ReportData | null>(null);

  // Setup form
  const [resume, setResume] = useState("");
  const [githubLinks, setGithubLinks] = useState("");
  const [targetRole, setTargetRole] = useState(
    workspaceTargetRole ?? targetJobTitle ?? "",
  );
  const [expLevel, setExpLevel] = useState(yearsToLevel(experienceYears));
  const [starting, setStarting] = useState(false);
  const [launchStatusIndex, setLaunchStatusIndex] = useState(0);

  // Interview UI
  const [interviewPhase, setInterviewPhase] = useState<
    "idle" | "listening" | "thinking" | "speaking"
  >("idle");
  const [messages, setMessages] = useState<Message[]>([]);
  const [partial, setPartial] = useState("");
  const [sprint, setSprint] = useState(1);
  const [persona, setPersona] = useState("curious_lead");
  const [questionCount, setQuestionCount] = useState(0);
  const [micLevel, setMicLevel] = useState(0);
  const [engineBooted, setEngineBooted] = useState(false);
  const [interviewComplete, setInterviewComplete] = useState(false);
  const [interviewError, setInterviewError] = useState("");
  const [cancelling, setCancelling] = useState(false);
  const [nearEnd, setNearEnd] = useState(false);
  const [showCamera, setShowCamera] = useState(true);

  // Refs
  const sessionRef = useRef<InterviewSession | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const prevSprintRef = useRef(1);
  const stopVisualizerRef = useRef<(() => void) | null>(null);
  const transcriptRef = useRef<HTMLDivElement>(null);
  const processingRef = useRef(false);
  const currentTurnIdRef = useRef("");
  const answerDraftRef = useRef<AnswerDraft | null>(null);
  const silenceConfirmedRef = useRef(false);
  const commitTimeRef = useRef(0);
  const sessionIdRef = useRef("");
  const interviewIdRef = useRef("");
  const engineBootedRef = useRef(false);

  // ── Camera helpers ──────────────────────────────────────────────────────────

  const stopCameraStream = useCallback(() => {
    if (videoRef.current?.srcObject) {
      (videoRef.current.srcObject as MediaStream)
        .getTracks()
        .forEach((t) => t.stop());
      videoRef.current.srcObject = null;
    }
  }, []);

  // ── On mount: check for open/preparing/completed session ───────────────────

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const handoffId = new URLSearchParams(window.location.search)
          .get("handoff_id")
          ?.trim();
        if (handoffId) {
          const sync = await api.post<{
            complete: boolean;
            totalScore?: number | null;
            badgeLevel?: string | null;
            verdict?: string | null;
            badge?: string | null;
          }>(`/api/ai-interview-adapter/handoff-sync/${handoffId}`, {});
          if (cancelled) return;
          if (sync.complete) {
            window.history.replaceState({}, "", window.location.pathname);
            setCompletion({
              score: sync.totalScore ?? null,
              badge: sync.badgeLevel ?? sync.badge ?? null,
              verdict: sync.verdict ?? null,
            });
            setPhase("done");
            return;
          }
        }

        const data = await api.get<{
          open: boolean;
          preparing?: boolean;
          session_id?: string;
          provenhire_interview_id?: string;
          reconciled?: boolean;
          score?: number | null;
          badge?: string | null;
          verdict?: string | null;
        }>("/api/ai-interview-adapter/open");

        if (cancelled) return;

        if (data.reconciled) {
          setCompletion({
            score: data.score ?? null,
            badge: data.badge ?? null,
            verdict: data.verdict ?? null,
          });
          setPhase("done");
          return;
        }

        if (data.preparing && data.provenhire_interview_id) {
          setStarting(true);
          try {
            const result = await pollPrepareStatus(
              data.provenhire_interview_id,
              cancelled,
            );
            if (cancelled) return;
            setEngine({
              sessionId: result.session_id,
              openingQuestion: result.opening_question,
              sprint: result.sprint,
              interviewId: data.provenhire_interview_id,
            });
            setPhase("interview");
          } catch (e) {
            if (cancelled) return;
            toast.error(
              e instanceof Error
                ? e.message
                : "Preparation failed. Please try again.",
            );
            setStarting(false);
            setPhase("setup");
          }
          return;
        }

        if (data.open && data.session_id && data.provenhire_interview_id) {
          try {
            const token = getAuthToken();
            const stateRes = await fetch(
              `/api/antigravity/state/${data.session_id}`,
              {
                headers: token ? { Authorization: `Bearer ${token}` } : {},
              },
            );
            if (cancelled) return;

            if (stateRes.status === 404) {
              api
                .post("/api/ai-interview-adapter/cancel", {
                  session_id: data.session_id,
                  provenhire_interview_id: data.provenhire_interview_id,
                })
                .catch(() => {});
              if (!cancelled) setPhase("setup");
              return;
            }

            if (!stateRes.ok) {
              if (!cancelled) setPhase("setup");
              return;
            }

            const state = (await stateRes.json()) as {
              last_question?: string;
              current_sprint?: number;
              current_persona?: string;
              question_count?: number;
              interview_complete?: boolean;
              history?: HistoryEntry[];
            };

            if (state.interview_complete) {
              sessionIdRef.current = data.session_id;
              interviewIdRef.current = data.provenhire_interview_id;
              setInterviewComplete(true);
              setPhase("interview");
            } else {
              const restoredMessages = state.history?.length
                ? buildMessagesFromHistory(state.history)
                : state.last_question
                  ? [{ role: "ai" as const, text: state.last_question }]
                  : [];
              setEngine({
                sessionId: data.session_id,
                openingQuestion: state.last_question ?? "",
                sprint: state.current_sprint ?? 1,
                interviewId: data.provenhire_interview_id,
                restoredMessages,
                restoredQuestionCount: state.question_count ?? 0,
              });
              setPhase("interview");
            }
            return;
          } catch {
            if (!cancelled) setPhase("setup");
            return;
          }
        }

        if (!cancelled) setPhase("setup");
      } catch {
        if (!cancelled) setPhase("setup");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // ── Launch status cycle ─────────────────────────────────────────────────────

  useEffect(() => {
    if (!starting) {
      setLaunchStatusIndex(0);
      return;
    }
    const t = setInterval(
      () =>
        setLaunchStatusIndex((i) =>
          Math.min(i + 1, LAUNCH_STATUSES.length - 1),
        ),
      12_000,
    );
    return () => clearInterval(t);
  }, [starting]);

  // ── Finalization retry loop ─────────────────────────────────────────────────

  useEffect(() => {
    if (!interviewComplete) return;
    let cancelled = false;
    let attempt = 0;
    let timer: ReturnType<typeof setTimeout>;

    const tryFinalize = async () => {
      if (cancelled) return;
      attempt++;
      try {
        const data = await api.post<{
          complete: boolean;
          score?: number | null;
          badge?: string | null;
          verdict?: string | null;
        }>("/api/ai-interview-adapter/finalize", {
          session_id: sessionIdRef.current,
          provenhire_interview_id: interviewIdRef.current,
        });

        if (cancelled) return;

        if (data.complete) {
          setCompletion({
            score: data.score ?? null,
            badge: data.badge ?? null,
            verdict: data.verdict ?? null,
          });
          // Fetch full report from Antigravity (fire-and-forget, best-effort)
          if (sessionIdRef.current) {
            const sid = sessionIdRef.current;
            const token = getAuthToken();
            fetch(`/api/antigravity/report/${sid}`, {
              headers: token ? { Authorization: `Bearer ${token}` } : {},
            })
              .then((r) => (r.ok ? r.json() : null))
              .then((report) => {
                if (!cancelled && report) setReportData(report as ReportData);
              })
              .catch(() => {});
          }
          setTimeout(() => {
            if (!cancelled) setPhase("done");
          }, 3_000);
          return;
        }
      } catch {
        // retry
      }

      if (attempt < FINALIZE_MAX_ATTEMPTS && !cancelled) {
        timer = setTimeout(tryFinalize, FINALIZE_RETRY_INTERVAL_MS);
      } else if (!cancelled) {
        api
          .post("/api/ai-interview-adapter/cancel", {
            session_id: sessionIdRef.current,
            provenhire_interview_id: interviewIdRef.current,
          })
          .catch(() => {});
        setTimeout(() => {
          if (!cancelled) setPhase("done");
        }, 3_000);
      }
    };

    void tryFinalize();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [interviewComplete]);

  // ── Auto-scroll ─────────────────────────────────────────────────────────────

  useEffect(() => {
    transcriptRef.current?.scrollTo({
      top: transcriptRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, partial]);

  // ── Core audio callbacks ────────────────────────────────────────────────────

  const clearAnswerDraft = useCallback(() => {
    const d = answerDraftRef.current;
    if (d?.commitTimer) clearTimeout(d.commitTimer);
    answerDraftRef.current = null;
  }, []);

  const teardown = useCallback(() => {
    currentTurnIdRef.current = crypto.randomUUID();
    clearAnswerDraft();
    stopVisualizerRef.current?.();
    stopVisualizerRef.current = null;
    sessionRef.current?.stop();
    sessionRef.current = null;
    stopCameraStream();
  }, [clearAnswerDraft, stopCameraStream]);

  useEffect(
    () => () => {
      teardown();
    },
    [teardown],
  );

  const beginUserTurn = useCallback(
    (session: InterviewSession | null) => {
      if (!session) return;
      clearAnswerDraft();
      silenceConfirmedRef.current = false;
      commitTimeRef.current = 0;
      const id = crypto.randomUUID();
      currentTurnIdRef.current = id;
      session.setActiveTurnId(id);
      session.transition(FloorState.USER_SPEAKING);
    },
    [clearAnswerDraft],
  );

  const handleFollowup = useCallback(
    async (
      result: Record<string, unknown>,
      preloadedAudioUrl: string | null,
      expectedTurnId: string,
    ) => {
      if (
        expectedTurnId !== currentTurnIdRef.current ||
        sessionRef.current?.floor === FloorState.USER_SPEAKING
      ) {
        if (preloadedAudioUrl) URL.revokeObjectURL(preloadedAudioUrl);
        return;
      }

      const text = result.response as string;
      const newSprint = result.sprint as number;
      const newPersona = result.persona as string;
      const isComplete = result.complete as boolean;
      const weakness = result.weakness as { severity?: string } | null;
      const pivoting = result.pivoting as boolean;
      const backendQuestionCount =
        typeof result.question_count === "number"
          ? result.question_count
          : null;

      if (
        backendQuestionCount !== null &&
        backendQuestionCount >= 13 &&
        !isComplete
      ) {
        setNearEnd(true);
      }

      // Defensive TTS hold for safety-timeout flushes
      if (!silenceConfirmedRef.current) {
        const remaining = Math.max(
          0,
          TTS_HOLD_CAP_MS - (performance.now() - commitTimeRef.current),
        );
        if (remaining > 0) {
          await new Promise<void>((resolve) => {
            const iv = setInterval(() => {
              if (
                silenceConfirmedRef.current ||
                sessionRef.current?.floor === FloorState.USER_SPEAKING ||
                performance.now() - commitTimeRef.current >= TTS_HOLD_CAP_MS
              ) {
                clearInterval(iv);
                resolve();
              }
            }, 40);
            setTimeout(() => {
              clearInterval(iv);
              resolve();
            }, remaining);
          });
        }
      }

      if (
        sessionRef.current?.floor === FloorState.USER_SPEAKING ||
        expectedTurnId !== currentTurnIdRef.current
      ) {
        if (preloadedAudioUrl) URL.revokeObjectURL(preloadedAudioUrl);
        return;
      }

      if (pivoting) {
        setMessages((prev) => [
          ...prev,
          {
            role: "ai",
            text: "Moving to a different area.",
            isPivotMarker: true,
          },
        ]);
      }
      if (newSprint !== prevSprintRef.current) {
        prevSprintRef.current = newSprint;
        setSprint(newSprint);
        setPersona(newPersona);
        setMessages((prev) => [
          ...prev,
          {
            role: "ai",
            text: `Sprint ${newSprint} — ${SPRINT_LABELS[newSprint]}`,
            isSprintMarker: true,
            sprint: newSprint,
          },
        ]);
      }

      setMessages((prev) => [
        ...prev,
        { role: "ai", text, severity: weakness?.severity },
      ]);
      setQuestionCount((c) => c + 1);

      const ac = new AbortController();
      sessionRef.current?.setAbortController(ac);
      sessionRef.current?.setActivePlaybackText(text);
      sessionRef.current?.transition(FloorState.AI_SPEAKING);
      try {
        await playAudioUrl(preloadedAudioUrl, text, ac.signal);
      } catch {
        /* interrupted */
      }

      if (expectedTurnId !== currentTurnIdRef.current) return;
      await new Promise<void>((r) => setTimeout(r, 300));
      if (expectedTurnId !== currentTurnIdRef.current) return;

      if (isComplete) {
        setNearEnd(false);
        sessionRef.current?.transition(FloorState.IDLE);
        sessionRef.current?.stop();
        setInterviewComplete(true);
      } else {
        beginUserTurn(sessionRef.current);
      }
    },
    [beginUserTurn],
  );

  const commitAnswerDraft = useCallback(
    async (session: InterviewSession, turnId: string) => {
      const draft = answerDraftRef.current;
      if (!draft || draft.turnId !== turnId) return;
      if (draft.commitTimer) {
        clearTimeout(draft.commitTimer);
        draft.commitTimer = null;
      }
      if (processingRef.current) {
        draft.pendingRevision = true;
        return;
      }

      const mergedText = draft.textParts.join(" ").replace(/\s+/g, " ").trim();
      if (!mergedText) return;

      processingRef.current = true;
      draft.pendingRevision = false;
      draft.submittedText = mergedText;
      draft.requestVersion += 1;
      commitTimeRef.current = performance.now();
      const reqVersion = draft.requestVersion;
      const entities = [...draft.entitySet];

      let nextIdx = draft.messageIndex;
      setMessages((prev) => {
        if (
          draft.messageIndex !== null &&
          prev[draft.messageIndex]?.role === "candidate"
        ) {
          const updated = [...prev];
          updated[draft.messageIndex] = { role: "candidate", text: mergedText };
          return updated;
        }
        nextIdx = prev.length;
        return [...prev, { role: "candidate", text: mergedText }];
      });
      draft.messageIndex = nextIdx ?? draft.messageIndex;
      setPartial("");
      session.transition(FloorState.AI_THINKING);

      const isStale = () => {
        const live = answerDraftRef.current;
        return Boolean(
          live &&
            live.turnId === turnId &&
            live.requestVersion === reqVersion &&
            live.pendingRevision &&
            live.submittedText !==
              live.textParts.join(" ").replace(/\s+/g, " ").trim(),
        );
      };

      try {
        const result = await processTurn(
          sessionIdRef.current,
          mergedText,
          entities,
          turnId,
        );
        if (isStale()) return;
        const responseTurnId =
          typeof result.turn_id === "string" ? result.turn_id : turnId;
        if (responseTurnId !== currentTurnIdRef.current) return;

        const audioUrl = await prefetchAudio(
          result.response as string,
          sessionIdRef.current,
        );
        if (isStale() || responseTurnId !== currentTurnIdRef.current) {
          if (audioUrl) URL.revokeObjectURL(audioUrl);
          return;
        }

        clearAnswerDraft();
        await handleFollowup(result, audioUrl, responseTurnId);
      } catch {
        setInterviewError("Agent pipeline error. Please try again.");
        beginUserTurn(session);
      } finally {
        processingRef.current = false;
        const pending = answerDraftRef.current;
        if (pending && pending.turnId === turnId && pending.pendingRevision) {
          pending.pendingRevision = false;
          pending.commitTimer = setTimeout(() => {
            void commitAnswerDraft(session, turnId);
          }, 150);
        }
      }
    },
    [beginUserTurn, clearAnswerDraft, handleFollowup],
  );

  const queueAnswerChunk = useCallback(
    (session: InterviewSession, text: string, entities: string[]) => {
      const cleaned = text.trim();
      if (!cleaned) return;
      const turnId = session.getActiveTurnId() || crypto.randomUUID();
      session.setActiveTurnId(turnId);
      currentTurnIdRef.current = turnId;
      let draft = answerDraftRef.current;
      if (!draft || draft.turnId !== turnId) {
        clearAnswerDraft();
        draft = {
          turnId,
          textParts: [],
          entitySet: new Set<string>(),
          submittedText: null,
          pendingRevision: false,
          requestVersion: 0,
          messageIndex: null,
          commitTimer: null,
        };
        answerDraftRef.current = draft;
      }
      if (draft.textParts[draft.textParts.length - 1] !== cleaned)
        draft.textParts.push(cleaned);
      entities.forEach((e) => draft!.entitySet.add(e));
      setPartial(draft.textParts.join(" "));
      if (draft.submittedText !== null && silenceConfirmedRef.current) {
        silenceConfirmedRef.current = false;
        commitTimeRef.current = performance.now();
      }
      if (draft.commitTimer) clearTimeout(draft.commitTimer);
      draft.commitTimer = setTimeout(() => {
        void commitAnswerDraft(session, turnId);
      }, ANSWER_SETTLE_MS);
    },
    [clearAnswerDraft, commitAnswerDraft],
  );

  // ── Boot interview engine ──────────────────────────────────────────────────

  const bootEngine = useCallback(
    async (eng: EngineStart) => {
      setInterviewError("");
      sessionIdRef.current = eng.sessionId;
      interviewIdRef.current = eng.interviewId;
      setSprint(eng.sprint);
      setPersona("curious_lead");
      prevSprintRef.current = eng.sprint;
      setQuestionCount(eng.restoredQuestionCount ?? 0);

      // Use restored history if available (resume case), otherwise just opening question
      if (eng.restoredMessages?.length) {
        setMessages(eng.restoredMessages);
      } else {
        setMessages(
          eng.openingQuestion
            ? [{ role: "ai", text: eng.openingQuestion }]
            : [],
        );
      }

      // Prefetch opening audio only if we're starting fresh (not resuming)
      const openingAudioUrl =
        !eng.restoredMessages?.length && eng.openingQuestion
          ? await prefetchAudio(eng.openingQuestion, eng.sessionId)
          : null;

      const session = new InterviewSession(eng.sessionId);
      sessionRef.current = session;

      session.onFloorChange = (floor) => {
        if (floor === FloorState.USER_SPEAKING) setInterviewPhase("listening");
        else if (floor === FloorState.AI_THINKING)
          setInterviewPhase("thinking");
        else if (floor === FloorState.AI_SPEAKING)
          setInterviewPhase("speaking");
        else setInterviewPhase("idle");
      };

      session.onBargeIn = () => {
        clearAnswerDraft();
        currentTurnIdRef.current = crypto.randomUUID();
        session.setActiveTurnId(currentTurnIdRef.current);
        setPartial("");
      };

      session.onSilence = async () => {
        if (session.floor === FloorState.AI_THINKING) {
          silenceConfirmedRef.current = true;
          return;
        }
        if (processingRef.current || session.floor !== FloorState.USER_SPEAKING)
          return;
        const ac = new AbortController();
        const { url: nudgeUrl, text: nudgeText } = await prefetchFillerAudio();
        session.setAbortController(ac);
        session.setActivePlaybackText(nudgeText);
        session.transition(FloorState.AI_SPEAKING);
        try {
          await playAudioUrl(nudgeUrl, nudgeText, ac.signal);
        } catch {
          /* interrupted */
        }
        beginUserTurn(session);
      };

      session.onPartial = (text) => setPartial(text);
      session.onFinal = (text, entities, metadata) => {
        silenceConfirmedRef.current = metadata?.reason === "utterance_end";
        queueAnswerChunk(session, text, entities);
      };
      session.onError = (err) => setInterviewError(`Voice error: ${err}`);

      try {
        await session.start();
      } catch (e) {
        setInterviewError(`Microphone error: ${String(e)}`);
        api
          .post("/api/ai-interview-adapter/cancel", {
            session_id: eng.sessionId,
            provenhire_interview_id: eng.interviewId,
          })
          .catch(() => {});
        return;
      }

      stopVisualizerRef.current = session.connectVisualizer((level) =>
        setMicLevel(level),
      );

      // Camera + vision (optional — silently fails if denied)
      if (showCamera && videoRef.current) {
        navigator.mediaDevices
          .getUserMedia({ video: true })
          .then((stream) => {
            if (videoRef.current) {
              videoRef.current.srcObject = stream;
              session.startVision(videoRef.current).catch(() => {});
            }
          })
          .catch(() => {});
      }

      setEngineBooted(true);

      // Play opening question on fresh start (not resume)
      if (!eng.restoredMessages?.length && eng.openingQuestion) {
        const ac = new AbortController();
        session.setAbortController(ac);
        session.setActivePlaybackText(eng.openingQuestion);
        session.transition(FloorState.AI_SPEAKING);
        await playAudioUrl(openingAudioUrl, eng.openingQuestion, ac.signal);
      }
      beginUserTurn(session);
    },
    [beginUserTurn, clearAnswerDraft, queueAnswerChunk, showCamera],
  );

  // Boot when engine data is ready
  useEffect(() => {
    if (
      phase !== "interview" ||
      !engine ||
      engineBootedRef.current ||
      interviewComplete
    )
      return;
    engineBootedRef.current = true;
    void bootEngine(engine);
  }, [phase, engine, bootEngine, interviewComplete]);

  // Reset when returning to setup
  useEffect(() => {
    if (phase === "setup") {
      engineBootedRef.current = false;
      setEngineBooted(false);
      setInterviewComplete(false);
      setMessages([]);
      setPartial("");
      setInterviewError("");
      setNearEnd(false);
    }
  }, [phase]);

  // ── Setup form submit ──────────────────────────────────────────────────────

  async function handleStart() {
    if (!resume.trim()) {
      toast.error("Paste your resume to begin.");
      return;
    }
    if (!targetRole.trim()) {
      toast.error("Enter the target role.");
      return;
    }
    setStarting(true);
    try {
      const data = await api.post<{
        handoff_id: string;
        launch_url: string;
        expires_at: string;
      }>("/api/ai-interview-adapter/handoff-launch", {
        resume: resume.trim(),
        github_links: githubLinks
          .split("\n")
          .map((l) => l.trim())
          .filter(Boolean),
        target_role: targetRole.trim(),
        years_experience: expLevel,
        return_url: workspaceCode
          ? `${window.location.origin}/dashboard/jobseeker/antigravity/return?workspace_code=${encodeURIComponent(workspaceCode)}`
          : `${window.location.origin}/dashboard/jobseeker/antigravity/return`,
        ...(workspaceAttemptId
          ? { workspace_attempt_id: workspaceAttemptId }
          : {}),
      });
      window.location.assign(data.launch_url);
    } catch (e) {
      toast.error(
        e instanceof Error
          ? e.message
          : "Failed to launch Antigravity. Please try again.",
      );
      setStarting(false);
    }
  }

  async function handleEmbeddedStart() {
    if (!resume.trim()) {
      toast.error("Paste your resume to begin.");
      return;
    }
    if (!targetRole.trim()) {
      toast.error("Enter the target role.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((t) => t.stop());
    } catch {
      toast.error(
        "Microphone access is required. Please allow it and try again.",
      );
      return;
    }
    setStarting(true);
    try {
      const prepData = await api.post<{ provenhire_interview_id: string }>(
        "/api/ai-interview-adapter/prepare",
        {
          resume: resume.trim(),
          github_links: githubLinks
            .split("\n")
            .map((l) => l.trim())
            .filter(Boolean),
          target_role: targetRole.trim(),
          years_experience: expLevel,
        },
      );
      const result = await pollPrepareStatus(prepData.provenhire_interview_id);
      setEngine({
        sessionId: result.session_id,
        openingQuestion: result.opening_question,
        sprint: result.sprint,
        interviewId: prepData.provenhire_interview_id,
      });
      setPhase("interview");
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : "Failed to start. Please try again.",
      );
      setStarting(false);
    }
  }

  async function endEarly() {
    teardown();
    if (sessionIdRef.current && interviewIdRef.current) {
      setCancelling(true);
      try {
        await api.post("/api/ai-interview-adapter/cancel", {
          session_id: sessionIdRef.current,
          provenhire_interview_id: interviewIdRef.current,
        });
      } catch {
        toast.error(
          "Could not cancel cleanly. Contact support if you can't start a new interview.",
        );
      } finally {
        setCancelling(false);
      }
    }
    setEngine(null);
    setStarting(false);
    setPhase("setup");
  }

  const progressPct = Math.min((questionCount / 15) * 100, 100);

  // ── Render: checking ───────────────────────────────────────────────────────

  if (phase === "checking") {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
        <Loader2 className="w-5 h-5 animate-spin text-zinc-600" />
      </div>
    );
  }

  // ── Render: setup ──────────────────────────────────────────────────────────

  if (phase === "setup") {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-xl">
          <Card>
            <CardHeader>
              <CardTitle>AI Expert Interview</CardTitle>
              <CardDescription>
                A 30-minute adversarial interview across three sprints — Project
                Defense, Foundations, and System Design. Voice-first. Ensure
                your microphone is available before starting.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="ag-resume">
                  Resume <span className="text-destructive">*</span>
                </Label>
                <Textarea
                  id="ag-resume"
                  placeholder="Paste your full resume text here…"
                  rows={8}
                  value={resume}
                  onChange={(e) => setResume(e.target.value)}
                  className="font-mono text-xs"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="ag-role">
                    Target Role <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="ag-role"
                    placeholder="e.g. Senior Backend Engineer"
                    value={targetRole}
                    disabled={Boolean(workspaceAttemptId)}
                    onChange={(e) => setTargetRole(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ag-exp">
                    Experience Level <span className="text-destructive">*</span>
                  </Label>
                  <Select value={expLevel} onValueChange={setExpLevel}>
                    <SelectTrigger id="ag-exp">
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
              </div>
              <div className="space-y-2">
                <Label htmlFor="ag-github">GitHub Links (optional)</Label>
                <Textarea
                  id="ag-github"
                  placeholder="One URL per line…"
                  rows={2}
                  value={githubLinks}
                  onChange={(e) => setGithubLinks(e.target.value)}
                  className="font-mono text-xs"
                />
              </div>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setShowCamera((v) => !v)}
                  className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium transition-all ${
                    showCamera
                      ? "border-blue-500/30 bg-blue-500/10 text-blue-400"
                      : "border-zinc-700 bg-zinc-900 text-zinc-500"
                  }`}
                >
                  <span
                    className={`h-2 w-2 rounded-full ${showCamera ? "bg-green-400" : "bg-zinc-600"}`}
                  />
                  Lens Early-Turn {showCamera ? "ON" : "OFF"}
                </button>
                <p className="text-[11px] text-muted-foreground">
                  Camera optional — improves turn boundary detection
                </p>
              </div>
              <div className="rounded-md bg-amber-500/10 border border-amber-500/20 px-4 py-3 text-xs text-amber-700 dark:text-amber-400 flex gap-2">
                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                <span>
                  Once started the interview cannot be paused. Ensure a quiet
                  environment with a working microphone.
                </span>
              </div>
              <div className="flex flex-col gap-3 pt-1 sm:flex-row">
                <Button onClick={handleStart} disabled={starting}>
                  {starting ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Launching Antigravity…
                    </>
                  ) : (
                    "Start Interview"
                  )}
                </Button>
                {import.meta.env.DEV && (
                  <Button
                    variant="outline"
                    onClick={handleEmbeddedStart}
                    disabled={starting}
                  >
                    Use embedded interview
                  </Button>
                )}
              </div>
              {starting && (
                <p className="text-xs text-muted-foreground">
                  Opening the standalone Antigravity interview room. Keep this
                  tab available for the return handoff.
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  // ── Render: done ───────────────────────────────────────────────────────────

  if (phase === "done") {
    return (
      <DoneView
        completion={completion}
        reportData={reportData}
        onReset={() => {
          setEngine(null);
          setCompletion(null);
          setReportData(null);
          setStarting(false);
          setPhase("setup");
        }}
      />
    );
  }

  // ── Render: interview ──────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white flex flex-col select-none">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-white/5">
        <div className="flex items-center gap-3">
          <span className="text-sm font-semibold tracking-tight text-zinc-200">
            Antigravity Protocol
          </span>
          {engineBooted && (
            <span className="text-xs px-2 py-0.5 rounded-md bg-white/5 text-zinc-400">
              S{sprint} · {SPRINT_LABELS[sprint]}
            </span>
          )}
        </div>
        <div className="flex items-center gap-4">
          {!interviewComplete && !engineBooted && (
            <button
              type="button"
              onClick={() => setShowCamera((v) => !v)}
              className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] font-medium transition-all ${
                showCamera
                  ? "border-blue-500/25 bg-blue-500/10 text-blue-400"
                  : "border-zinc-800 bg-zinc-900/50 text-zinc-600"
              }`}
            >
              <span
                className={`h-1.5 w-1.5 rounded-full ${showCamera ? "bg-green-400" : "bg-zinc-700"}`}
              />
              Lens {showCamera ? "ON" : "OFF"}
            </button>
          )}
          {engineBooted && (
            <div className="flex items-center gap-2">
              {/* Sprint progress segments */}
              <div className="flex items-center gap-1">
                {[1, 2, 3].map((s) => (
                  <div
                    key={s}
                    className="h-[3px] w-7 rounded-full transition-all duration-700"
                    style={{
                      background:
                        s < sprint
                          ? "oklch(0.6 0.18 255)"
                          : s === sprint
                            ? "linear-gradient(90deg, oklch(0.6 0.18 255), oklch(0.75 0.15 75))"
                            : "oklch(0.2 0.01 265)",
                      boxShadow:
                        s === sprint
                          ? "0 0 10px oklch(0.55 0.18 255 / 0.5)"
                          : "none",
                    }}
                  />
                ))}
              </div>
              <span className="text-[11px] text-zinc-600 tabular-nums">
                {questionCount}/15
              </span>
            </div>
          )}
          {!interviewComplete && (
            <button
              onClick={endEarly}
              disabled={cancelling}
              className="text-[11px] text-zinc-600 hover:text-red-400 transition-colors disabled:opacity-50"
            >
              {cancelling ? "Cancelling…" : "End"}
            </button>
          )}
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Left: AI panel */}
        <div className="w-80 flex-shrink-0 border-r border-white/5 flex flex-col items-center justify-between py-8 px-6 gap-6">
          <div className="flex flex-col items-center gap-6 w-full">
            {/* Orb + optional camera overlay */}
            <div className="relative w-full flex items-center justify-center">
              {showCamera && (
                <div className="absolute inset-6 overflow-hidden rounded-full border border-white/5 bg-black/30 opacity-35 mix-blend-screen grayscale">
                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    className="h-full w-full scale-x-[-1] object-cover"
                  />
                </div>
              )}
              <AIOrb state={interviewPhase} />
            </div>

            <div className="text-center space-y-1">
              <p className="text-xs font-medium text-zinc-300">
                {interviewPhase === "listening"
                  ? "Listening"
                  : interviewPhase === "thinking"
                    ? "Analyzing..."
                    : interviewPhase === "speaking"
                      ? "Speaking"
                      : engineBooted
                        ? "Idle"
                        : "Initializing…"}
              </p>
              {engineBooted && (
                <p className="text-[11px] text-zinc-600 font-mono tracking-wider">
                  {PERSONA_DESC[persona]}
                </p>
              )}
            </div>

            {interviewPhase === "listening" && (
              <Waveform level={micLevel} active={true} />
            )}
          </div>

          {/* Sprint legend */}
          {engineBooted && (
            <div className="w-full space-y-2">
              <p className="text-[10px] uppercase tracking-[0.2em] text-zinc-700 font-medium">
                Sprint Progress
              </p>
              <div className="flex gap-1.5">
                {[1, 2, 3].map((s) => (
                  <div key={s} className="flex-1 space-y-1">
                    <div
                      className="h-1.5 rounded-full transition-all duration-700"
                      style={{
                        background:
                          s < sprint
                            ? "oklch(0.6 0.18 255)"
                            : s === sprint
                              ? "linear-gradient(90deg, oklch(0.6 0.18 255), oklch(0.75 0.15 75))"
                              : "oklch(0.15 0.01 265)",
                        boxShadow:
                          s === sprint
                            ? "0 0 10px oklch(0.55 0.18 255 / 0.4)"
                            : "none",
                      }}
                    />
                    <p className="text-[9px] text-zinc-700 truncate">
                      {SPRINT_LABELS[s]}
                    </p>
                  </div>
                ))}
              </div>
              {showCamera && (
                <p className="text-[9px] text-zinc-700 mt-2 uppercase tracking-[0.15em]">
                  Lens active · turn-boundary fusion
                </p>
              )}
            </div>
          )}
        </div>

        {/* Right: Transcript */}
        <div className="flex-1 flex flex-col overflow-hidden relative">
          <div
            ref={transcriptRef}
            className="flex-1 overflow-y-auto px-10 py-8 space-y-6"
          >
            {!engineBooted && !interviewComplete && (
              <div className="flex items-center justify-center h-full">
                <div className="text-center space-y-4 max-w-sm">
                  <div className="w-12 h-12 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center mx-auto mb-6">
                    <span className="text-xl">∞</span>
                  </div>
                  <h2 className="text-lg font-medium text-zinc-200">
                    Adversarial AI Interview
                  </h2>
                  <p className="text-zinc-500 text-sm leading-relaxed">
                    A real-time cognitive depth interview. 3 sprints. Probing
                    your ownership, fundamentals, and system thinking.
                  </p>
                  <p className="text-zinc-700 text-[10px] uppercase tracking-[0.2em] pt-4">
                    Probe → Break → Analyze → Adapt
                  </p>
                  {interviewError ? (
                    <p className="text-red-400 text-xs mt-4">
                      {interviewError}
                    </p>
                  ) : (
                    <Loader2 className="w-4 h-4 animate-spin text-zinc-600 mx-auto mt-4" />
                  )}
                </div>
              </div>
            )}

            {messages.map((msg, i) => (
              <MessageItem key={i} msg={msg} />
            ))}

            {partial && (
              <div className="flex justify-end pr-4">
                <div className="max-w-[80%]">
                  <p className="text-[10px] text-zinc-600 uppercase tracking-widest mb-2 text-right">
                    Accumulating
                  </p>
                  <div className="rounded-2xl px-5 py-3.5 text-[13px] bg-white/[0.03] text-zinc-400 border border-white/[0.05] italic">
                    {partial}
                  </div>
                </div>
              </div>
            )}

            {nearEnd && !interviewComplete && (
              <div className="rounded-xl border border-amber-500/25 bg-amber-500/8 px-4 py-3 text-sm text-amber-400">
                Two questions remaining. The interview is closing in on its
                final boundary check.
              </div>
            )}

            {interviewComplete && (
              <div className="text-center py-12 space-y-2 animate-in fade-in slide-in-from-bottom-2 duration-1000">
                <div className="inline-block px-3 py-1 rounded-full bg-green-500/10 border border-green-500/20 text-green-500 text-[10px] mb-2 uppercase tracking-widest">
                  Complete
                </div>
                <p className="text-zinc-200 text-sm font-medium">
                  Interview complete.
                </p>
                <p className="text-zinc-500 text-[11px]">
                  Compiling your report and reasoning metrics…
                </p>
                <Loader2 className="w-4 h-4 animate-spin text-zinc-700 mx-auto mt-3" />
              </div>
            )}
          </div>

          {/* Footer bar */}
          <div className="border-t border-white/5 px-10 py-5 flex items-center justify-between bg-[#0a0a0a]/80 backdrop-blur-xl">
            {interviewError && engineBooted ? (
              <div className="flex items-center gap-2 text-red-400 text-[11px]">
                <div className="w-1 h-1 rounded-full bg-red-400" />
                {interviewError}
              </div>
            ) : (
              <p className="text-[11px] text-zinc-700">
                {engineBooted
                  ? "Stay natural. The system picks up the next turn when your utterance settles."
                  : "Transcript activates once the live loop starts."}
              </p>
            )}

            <div className="ml-auto flex items-center gap-3 text-[11px] font-medium text-zinc-400">
              <div className="flex items-center gap-2">
                {interviewPhase === "listening" && (
                  <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                )}
                {interviewPhase === "thinking" && (
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                )}
                {interviewPhase === "speaking" && (
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
                )}
                <span className="uppercase tracking-widest text-[10px] text-zinc-500">
                  {interviewPhase === "listening"
                    ? "Listening"
                    : interviewPhase === "thinking"
                      ? "Reasoning"
                      : interviewPhase === "speaking"
                        ? "Speaking"
                        : "Idle"}
                </span>
              </div>
              <div className="h-4 w-px bg-white/10" />
              <span className="text-zinc-700 tabular-nums uppercase text-[10px]">
                Turn: {currentTurnIdRef.current.slice(0, 8) || "—"}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Message renderer ──────────────────────────────────────────────────────────

function MessageItem({ msg }: { msg: Message }) {
  if (msg.isSprintMarker) {
    return (
      <div className="flex items-center gap-6 py-6">
        <div className="flex-1 h-px bg-white/5" />
        <span className="text-[10px] text-zinc-600 uppercase tracking-[0.3em] font-medium">
          {msg.text}
        </span>
        <div className="flex-1 h-px bg-white/5" />
      </div>
    );
  }
  if (msg.isPivotMarker) {
    return (
      <div className="flex items-center gap-4 py-2">
        <div className="flex-1 h-px bg-white/[0.03]" />
        <span className="text-[9px] text-zinc-700 uppercase tracking-[0.25em]">
          shifting focus
        </span>
        <div className="flex-1 h-px bg-white/[0.03]" />
      </div>
    );
  }
  const isAI = msg.role === "ai";
  return (
    <div
      className={`flex ${isAI ? "justify-start" : "justify-end"} group animate-in fade-in slide-in-from-bottom-1 duration-500`}
    >
      <div className="max-w-[85%] space-y-2">
        <div
          className={`flex items-center gap-2 ${isAI ? "" : "flex-row-reverse"}`}
        >
          <p className="text-[10px] uppercase tracking-widest font-bold text-zinc-500">
            {isAI ? "Interrogator" : "Candidate"}
          </p>
          {msg.severity === "high" && (
            <span className="text-[9px] bg-red-500/10 text-red-400 border border-red-500/20 px-1.5 py-0.5 rounded-md font-bold animate-pulse">
              BOUNDARY EXPOSED
            </span>
          )}
        </div>
        <div
          className={`rounded-3xl px-6 py-4 text-[14px] leading-[1.6] ${
            isAI
              ? "bg-white/[0.03] text-zinc-300 border border-white/[0.05]"
              : "bg-white/[0.07] text-white border border-white/[0.1]"
          }`}
          style={
            isAI && msg.severity && msg.severity !== "low"
              ? {
                  borderLeftWidth: "2px",
                  borderLeftColor:
                    msg.severity === "high"
                      ? "oklch(0.66 0.21 24)"
                      : "oklch(0.8 0.16 72)",
                }
              : undefined
          }
        >
          {msg.text}
        </div>
      </div>
    </div>
  );
}

// ─── Done / Report view ────────────────────────────────────────────────────────

function ScoreGauge({ score }: { score: number | null }) {
  const radius = 54;
  const circumference = 2 * Math.PI * radius;
  const pct = score != null ? Math.min(Math.max(score / 10, 0), 1) : 0;
  const color =
    score == null
      ? "#52525b"
      : score >= 7
        ? "oklch(0.7 0.18 145)"
        : score >= 4
          ? "oklch(0.75 0.15 75)"
          : "oklch(0.66 0.21 24)";
  return (
    <div className="relative flex items-center justify-center w-36 h-36">
      <svg
        className="absolute inset-0 w-full h-full -rotate-90"
        viewBox="0 0 128 128"
      >
        <circle
          cx="64"
          cy="64"
          r={radius}
          fill="none"
          stroke="oklch(0.15 0.01 265)"
          strokeWidth="10"
        />
        <circle
          cx="64"
          cy="64"
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth="10"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - pct)}
          strokeLinecap="round"
          style={{ transition: "stroke-dashoffset 1s ease" }}
        />
      </svg>
      <div className="text-center">
        <p className="text-2xl font-bold text-white">
          {score != null ? score.toFixed(1) : "—"}
        </p>
        <p className="text-[10px] text-zinc-500 uppercase tracking-widest">
          / 10
        </p>
      </div>
    </div>
  );
}

function completionScoreToTen(score: number | null | undefined): number | null {
  if (typeof score !== "number" || !Number.isFinite(score)) return null;
  return Math.max(0, Math.min(10, score / 10));
}

function VerdictBadge({ verdict }: { verdict: string | null }) {
  if (!verdict) return null;
  const v = verdict.toUpperCase();
  const style =
    v.includes("HIRE") && !v.includes("NO")
      ? "bg-green-500/15 border-green-500/30 text-green-400"
      : v.includes("MAYBE")
        ? "bg-amber-500/15 border-amber-500/30 text-amber-400"
        : "bg-red-500/15 border-red-500/30 text-red-400";
  return (
    <span
      className={`inline-flex items-center rounded-lg border px-3 py-1 text-xs font-bold uppercase tracking-widest ${style}`}
    >
      {v}
    </span>
  );
}

function ScoreBar({ label, score }: { label: string; score: number }) {
  const pct = Math.min(Math.max((score / 10) * 100, 0), 100);
  const color =
    score >= 7
      ? "oklch(0.7 0.18 145)"
      : score >= 4
        ? "oklch(0.75 0.15 75)"
        : "oklch(0.66 0.21 24)";
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-4">
        <span className="text-sm text-zinc-300 capitalize">
          {label.replace(/_/g, " ")}
        </span>
        <span className="font-mono text-xs text-zinc-500">
          {score.toFixed(1)}
        </span>
      </div>
      <div className="h-2 rounded-full bg-white/5 overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{
            width: `${pct}%`,
            background: color,
            boxShadow: `0 0 10px ${color}`,
          }}
        />
      </div>
    </div>
  );
}

function DoneView({
  completion,
  reportData,
  onReset,
}: {
  completion: CompletionResult | null;
  reportData: ReportData | null;
  onReset: () => void;
}) {
  const hasReport = Boolean(reportData);
  const displayScore =
    reportData?.overall_score != null
      ? reportData.overall_score
      : completionScoreToTen(completion?.score);

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white px-6 py-10 overflow-y-auto">
      <div className="mx-auto max-w-5xl space-y-8">
        {/* Header */}
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="space-y-3">
            <p className="text-[10px] uppercase tracking-[0.25em] text-zinc-600">
              Interview Report
            </p>
            <h1 className="text-3xl font-semibold tracking-tight text-zinc-100">
              {hasReport ? "Failure boundary analysis" : "Interview Complete"}
            </h1>
            {reportData && (
              <div className="flex flex-wrap gap-2">
                {reportData.target_role && (
                  <span className="rounded-lg border border-white/10 px-3 py-1 text-xs text-zinc-400">
                    {reportData.target_role}
                  </span>
                )}
                {reportData.years_experience && (
                  <span className="rounded-lg border border-white/10 px-3 py-1 text-xs text-zinc-400">
                    {reportData.years_experience} YOE
                  </span>
                )}
                <VerdictBadge verdict={reportData.hire_recommendation} />
              </div>
            )}
            {!hasReport && completion?.badge && (
              <div className="flex flex-wrap gap-2 items-center">
                <VerdictBadge verdict={completion.verdict} />
                {completion.badge && (
                  <span className="text-sm text-zinc-300">
                    {completion.badge}
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Score gauge */}
          <div className="rounded-2xl border border-white/5 bg-white/[0.02] flex flex-col items-center gap-3 px-8 py-6 min-w-[200px]">
            <ScoreGauge score={displayScore} />
            {reportData?.confidence_score != null && (
              <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-zinc-600">
                {Math.round(reportData.confidence_score * 100)}% confidence
              </p>
            )}
          </div>
        </div>

        {/* Metric cards */}
        {(hasReport || completion?.score != null) && (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {reportData && (
              <div className="rounded-2xl border border-white/5 bg-white/[0.02] px-5 py-5">
                <p className="text-[10px] uppercase tracking-[0.2em] text-zinc-600">
                  Questions
                </p>
                <p className="text-2xl font-bold mt-2 text-blue-400">
                  {reportData.total_questions}
                </p>
                <p className="text-xs text-zinc-600 mt-1">
                  asked across the full interview
                </p>
              </div>
            )}
            {reportData && (
              <div className="rounded-2xl border border-white/5 bg-white/[0.02] px-5 py-5">
                <p className="text-[10px] uppercase tracking-[0.2em] text-zinc-600">
                  High Severity
                </p>
                {(() => {
                  const c = reportData.raw_weaknesses.filter(
                    (w) => w.severity === "high",
                  ).length;
                  return (
                    <>
                      <p
                        className={`text-2xl font-bold mt-2 ${c > 0 ? "text-red-400" : "text-green-400"}`}
                      >
                        {c}
                      </p>
                      <p className="text-xs text-zinc-600 mt-1">
                        pressure points judged weak
                      </p>
                    </>
                  );
                })()}
              </div>
            )}
            {displayScore != null && (
              <div className="rounded-2xl border border-white/5 bg-white/[0.02] px-5 py-5">
                <p className="text-[10px] uppercase tracking-[0.2em] text-zinc-600">
                  Overall Score
                </p>
                <p className="text-2xl font-bold mt-2 text-zinc-200">
                  {displayScore.toFixed(1)}/10
                </p>
                <p className="text-xs text-zinc-600 mt-1">
                  aggregate synthesis signal
                </p>
              </div>
            )}
          </div>
        )}

        {/* Summary */}
        {reportData?.summary && (
          <div className="rounded-2xl border border-white/5 bg-white/[0.02] px-6 py-6">
            <p className="text-[10px] uppercase tracking-[0.2em] text-zinc-600 mb-4">
              Assessment Summary
            </p>
            <p className="text-sm leading-7 text-zinc-300 max-w-4xl">
              {reportData.summary}
            </p>
          </div>
        )}

        {/* Resume credibility */}
        {reportData?.claim_credibility_risk &&
          reportData.claim_credibility_risk.level !== "not_tested" && (
            <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 px-6 py-5">
              <p className="text-[10px] uppercase tracking-[0.2em] text-zinc-600 mb-3">
                Resume Claim Credibility
              </p>
              <VerdictBadge
                verdict={`${reportData.claim_credibility_risk.level.toUpperCase()} RISK`}
              />
              <p className="mt-4 text-sm leading-7 text-zinc-300">
                {reportData.claim_credibility_risk.detail}
              </p>
            </div>
          )}

        {/* Main 2-col layout */}
        {hasReport && (
          <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
            <div className="space-y-6">
              {/* Score breakdown */}
              {reportData &&
                Object.entries(reportData.scores ?? {}).filter(
                  ([, s]) => typeof s === "number",
                ).length > 0 && (
                  <div className="rounded-2xl border border-white/5 bg-white/[0.02] px-6 py-6">
                    <p className="text-[10px] uppercase tracking-[0.2em] text-zinc-600 mb-5">
                      Score Breakdown
                    </p>
                    <div className="space-y-4">
                      {Object.entries(reportData.scores).map(([dim, score]) =>
                        typeof score === "number" && Number.isFinite(score) ? (
                          <ScoreBar key={dim} label={dim} score={score} />
                        ) : (
                          <div
                            key={dim}
                            className="rounded-xl border border-white/5 bg-white/[0.02] px-4 py-3"
                          >
                            <div className="flex justify-between gap-4">
                              <span className="text-sm text-zinc-400 capitalize">
                                {dim.replace(/_/g, " ")}
                              </span>
                              <span className="font-mono text-xs text-zinc-600">
                                {String(score)}
                              </span>
                            </div>
                            <p className="mt-2 text-xs text-zinc-600">
                              Insufficient coverage to score numerically.
                            </p>
                          </div>
                        ),
                      )}
                    </div>
                  </div>
                )}

              {/* Failure surface */}
              {reportData &&
                Object.entries(reportData.failure_surface ?? {}).length > 0 && (
                  <div className="rounded-2xl border border-white/5 bg-white/[0.02] px-6 py-6">
                    <p className="text-[10px] uppercase tracking-[0.2em] text-zinc-600 mb-2">
                      Failure Surface
                    </p>
                    <p className="text-xs text-zinc-600 mb-5">
                      Higher means the candidate broke earlier under pressure.
                    </p>
                    <div className="space-y-4">
                      {Object.entries(reportData.failure_surface).map(
                        ([area, score]) => {
                          const pct = Math.round(score * 100);
                          const color =
                            score >= 0.6
                              ? "oklch(0.66 0.21 24)"
                              : score >= 0.35
                                ? "oklch(0.8 0.16 72)"
                                : "oklch(0.7 0.18 145)";
                          return (
                            <div key={area} className="space-y-1.5">
                              <div className="flex justify-between gap-4">
                                <span className="text-sm text-zinc-300 capitalize">
                                  {area.replace(/_/g, " ")}
                                </span>
                                <span className="font-mono text-xs text-zinc-600">
                                  {pct}%
                                </span>
                              </div>
                              <div className="h-2 rounded-full bg-white/5 overflow-hidden">
                                <div
                                  className="h-full rounded-full"
                                  style={{
                                    width: `${pct}%`,
                                    background: color,
                                    boxShadow: `0 0 12px ${color}`,
                                  }}
                                />
                              </div>
                            </div>
                          );
                        },
                      )}
                    </div>
                  </div>
                )}

              {/* Detected weaknesses */}
              {reportData && reportData.raw_weaknesses.length > 0 && (
                <div className="rounded-2xl border border-white/5 bg-white/[0.02] px-6 py-6">
                  <p className="text-[10px] uppercase tracking-[0.2em] text-zinc-600 mb-5">
                    Detected Weaknesses
                  </p>
                  <div className="space-y-3">
                    {reportData.raw_weaknesses.map((w, i) => (
                      <div
                        key={i}
                        className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-4"
                      >
                        <div className="flex items-center gap-2 mb-2">
                          <span
                            className="w-2 h-2 rounded-full flex-shrink-0"
                            style={{
                              background:
                                w.severity === "high"
                                  ? "oklch(0.66 0.21 24)"
                                  : w.severity === "medium"
                                    ? "oklch(0.8 0.16 72)"
                                    : "oklch(0.6 0.18 255)",
                            }}
                          />
                          <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-zinc-500">
                            {w.severity} · {w.type.replace(/_/g, " ")}
                          </span>
                        </div>
                        <p className="text-sm leading-7 text-zinc-200">
                          {w.weakness}
                        </p>
                        <p className="mt-2 text-xs uppercase tracking-[0.12em] text-zinc-600">
                          Strategy: {w.attack_strategy.replace(/_/g, " ")}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="space-y-6">
              {/* Strengths */}
              {reportData && reportData.strengths.length > 0 && (
                <div className="rounded-2xl border border-white/5 bg-white/[0.02] px-6 py-6">
                  <p className="text-[10px] uppercase tracking-[0.2em] text-zinc-600 mb-5">
                    Strengths
                  </p>
                  <ul className="space-y-3">
                    {reportData.strengths.map((s, i) => (
                      <li
                        key={i}
                        className="rounded-xl border border-green-500/15 bg-green-500/5 px-4 py-4 text-sm leading-7 text-zinc-200"
                      >
                        {s}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Risk flags */}
              {reportData && reportData.risk_flags.length > 0 && (
                <div className="rounded-2xl border border-white/5 bg-white/[0.02] px-6 py-6">
                  <p className="text-[10px] uppercase tracking-[0.2em] text-zinc-600 mb-5">
                    Risk Flags
                  </p>
                  <ul className="space-y-3">
                    {reportData.risk_flags.map((f, i) => (
                      <li
                        key={i}
                        className="rounded-xl border border-red-500/15 bg-red-500/5 px-4 py-4 text-sm leading-7 text-zinc-200"
                      >
                        {f}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Untested dimensions */}
              {reportData && reportData.untested_dimensions.length > 0 && (
                <div className="rounded-2xl border border-white/5 bg-white/[0.02] px-6 py-6">
                  <p className="text-[10px] uppercase tracking-[0.2em] text-zinc-600 mb-5">
                    Untested Dimensions
                  </p>
                  <ul className="space-y-3">
                    {reportData.untested_dimensions.map((d, i) => (
                      <li
                        key={i}
                        className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-4 text-sm leading-7 text-zinc-300"
                      >
                        {d}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        )}

        {/* No report yet */}
        {!hasReport && (
          <div className="rounded-2xl border border-white/5 bg-white/[0.02] px-6 py-8 text-center">
            <p className="text-zinc-400 text-sm">
              Your report is being compiled. Check back in a few minutes or
              refresh the page.
            </p>
            <p className="text-zinc-600 text-xs mt-2">
              You'll receive an email update within 10–15 hours.
            </p>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-3 pt-2">
          <Button
            variant="outline"
            onClick={onReset}
            className="bg-transparent border-white/10 text-zinc-400 hover:text-white hover:border-white/20"
          >
            Start New Interview
          </Button>
        </div>
      </div>
    </div>
  );
}
