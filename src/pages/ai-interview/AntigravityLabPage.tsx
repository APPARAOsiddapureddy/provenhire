import { useState, useEffect, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, CheckCircle, Trophy, AlertTriangle } from "lucide-react";
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

const LAUNCH_STATUSES = [
  "Preparing interview map…",
  "Grounding follow-up tracks…",
  "Launching interview room…",
] as const;

// Finalization: retry every 8 s, up to 6 attempts (~48 s window).
// After exhausting retries, transitions to done without a score so users aren't stuck.
const FINALIZE_RETRY_INTERVAL_MS = 8_000;
const FINALIZE_MAX_ATTEMPTS = 6;

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
};

type CompletionResult = {
  score: number | null;
  badge: string | null;
  verdict: string | null;
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

// ─── Component ────────────────────────────────────────────────────────────────

interface Props {
  targetJobTitle?: string;
  experienceYears?: number;
}

export default function AntigravityLabPage({ targetJobTitle, experienceYears }: Props = {}) {
  // ── Phase & lifecycle ───────────────────────────────────────────────────────
  const [phase, setPhase] = useState<Phase>("checking");
  const [engine, setEngine] = useState<EngineStart | null>(null);
  const [completion, setCompletion] = useState<CompletionResult | null>(null);

  // ── Setup form ──────────────────────────────────────────────────────────────
  const [resume, setResume] = useState("");
  const [githubLinks, setGithubLinks] = useState("");
  const [targetRole, setTargetRole] = useState(targetJobTitle ?? "");
  const [expLevel, setExpLevel] = useState(yearsToLevel(experienceYears));
  const [starting, setStarting] = useState(false);
  const [launchStatusIndex, setLaunchStatusIndex] = useState(0);

  // ── Interview UI state ──────────────────────────────────────────────────────
  const [interviewPhase, setInterviewPhase] = useState<"idle" | "listening" | "thinking" | "speaking">("idle");
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

  // ── Refs ────────────────────────────────────────────────────────────────────
  const sessionRef = useRef<InterviewSession | null>(null);
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

  // ─── On mount: check for orphaned/reconciled session ───────────────────────
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const data = await api.get<{
          open: boolean;
          session_id?: string;
          provenhire_interview_id?: string;
          reconciled?: boolean;
          score?: number | null;
          badge?: string | null;
          verdict?: string | null;
        }>("/api/ai-interview-adapter/open");

        if (cancelled) return;

        if (data.reconciled) {
          setCompletion({ score: data.score ?? null, badge: data.badge ?? null, verdict: data.verdict ?? null });
          setPhase("done");
          return;
        }

        if (data.open && data.session_id && data.provenhire_interview_id) {
          // Use a raw fetch so we can distinguish a definitive 404 (session gone) from
          // transient 5xx / network errors. Only cancel the orphan on a confirmed 404.
          try {
            const token = getAuthToken();
            const stateRes = await fetch(`/api/antigravity/state/${data.session_id}`, {
              headers: token ? { Authorization: `Bearer ${token}` } : {},
            });

            if (cancelled) return;

            if (stateRes.status === 404) {
              // Session is definitively gone from Antigravity — safe to abandon the orphan.
              api.post("/api/ai-interview-adapter/cancel", {
                session_id: data.session_id,
                provenhire_interview_id: data.provenhire_interview_id,
              }).catch(() => {});
              if (!cancelled) setPhase("setup");
              return;
            }

            if (!stateRes.ok) {
              // Transient proxy/backend error — preserve the session, fall through to setup.
              if (!cancelled) setPhase("setup");
              return;
            }

            const state = await stateRes.json() as {
              last_question?: string;
              current_sprint?: number;
              interview_complete?: boolean;
            };

            if (state.interview_complete) {
              sessionIdRef.current = data.session_id;
              interviewIdRef.current = data.provenhire_interview_id;
              setInterviewComplete(true);
              setPhase("interview");
            } else {
              setEngine({
                sessionId: data.session_id,
                openingQuestion: state.last_question ?? "",
                sprint: state.current_sprint ?? 1,
                interviewId: data.provenhire_interview_id,
              });
              setPhase("interview");
            }
            return;
          } catch {
            // Network-level failure — preserve the session, fall through to setup.
            if (!cancelled) setPhase("setup");
            return;
          }
        }

        if (!cancelled) setPhase("setup");
      } catch {
        if (!cancelled) setPhase("setup");
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // ─── Launch status cycle ────────────────────────────────────────────────────
  useEffect(() => {
    if (!starting) { setLaunchStatusIndex(0); return; }
    const t = setInterval(() => setLaunchStatusIndex((i) => Math.min(i + 1, LAUNCH_STATUSES.length - 1)), 12_000);
    return () => clearInterval(t);
  }, [starting]);

  // ─── Finalization retry loop ────────────────────────────────────────────────
  // Fires when interviewComplete becomes true. Retries /finalize every 8 s up to 6 times.
  // After exhausting retries, transitions to done without a score so the UI never hangs.
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
          setCompletion({ score: data.score ?? null, badge: data.badge ?? null, verdict: data.verdict ?? null });
          setTimeout(() => { if (!cancelled) setPhase("done"); }, 3_000);
          return;
        }
        // 202 complete:false — report not ready yet, schedule retry
      } catch {
        // Network / server error — schedule retry
      }

      if (attempt < FINALIZE_MAX_ATTEMPTS && !cancelled) {
        timer = setTimeout(tryFinalize, FINALIZE_RETRY_INTERVAL_MS);
      } else if (!cancelled) {
        // Retries exhausted — report unavailable. Abandon the interview so the gate
        // unblocks for future attempts. UI still transitions to done (no score shown).
        api.post("/api/ai-interview-adapter/cancel", {
          session_id: sessionIdRef.current,
          provenhire_interview_id: interviewIdRef.current,
        }).catch(() => {});
        setTimeout(() => { if (!cancelled) setPhase("done"); }, 3_000);
      }
    };

    void tryFinalize();
    return () => { cancelled = true; clearTimeout(timer); };
  }, [interviewComplete]);

  // ─── Auto-scroll transcript ─────────────────────────────────────────────────
  useEffect(() => {
    transcriptRef.current?.scrollTo({ top: transcriptRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, partial]);

  // ─── Core audio callbacks ───────────────────────────────────────────────────

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
  }, [clearAnswerDraft]);

  useEffect(() => () => { teardown(); }, [teardown]);

  const beginUserTurn = useCallback((session: InterviewSession | null) => {
    if (!session) return;
    clearAnswerDraft();
    silenceConfirmedRef.current = false;
    commitTimeRef.current = 0;
    const id = crypto.randomUUID();
    currentTurnIdRef.current = id;
    session.setActiveTurnId(id);
    session.transition(FloorState.USER_SPEAKING);
  }, [clearAnswerDraft]);

  const handleFollowup = useCallback(async (
    result: Record<string, unknown>,
    preloadedAudioUrl: string | null,
    expectedTurnId: string,
  ) => {
    if (expectedTurnId !== currentTurnIdRef.current || sessionRef.current?.floor === FloorState.USER_SPEAKING) {
      if (preloadedAudioUrl) URL.revokeObjectURL(preloadedAudioUrl);
      return;
    }

    const text = result.response as string;
    const newSprint = result.sprint as number;
    const newPersona = result.persona as string;
    const isComplete = result.complete as boolean;
    const weakness = result.weakness as { severity?: string } | null;
    const pivoting = result.pivoting as boolean;

    if (!silenceConfirmedRef.current) {
      const remaining = Math.max(0, TTS_HOLD_CAP_MS - (performance.now() - commitTimeRef.current));
      if (remaining > 0) {
        await new Promise<void>((resolve) => {
          const iv = setInterval(() => {
            if (
              silenceConfirmedRef.current ||
              sessionRef.current?.floor === FloorState.USER_SPEAKING ||
              performance.now() - commitTimeRef.current >= TTS_HOLD_CAP_MS
            ) { clearInterval(iv); resolve(); }
          }, 40);
          setTimeout(() => { clearInterval(iv); resolve(); }, remaining);
        });
      }
    }

    if (sessionRef.current?.floor === FloorState.USER_SPEAKING || expectedTurnId !== currentTurnIdRef.current) {
      if (preloadedAudioUrl) URL.revokeObjectURL(preloadedAudioUrl);
      return;
    }

    if (pivoting) {
      setMessages((prev) => [...prev, { role: "ai", text: "Moving to a different area.", isPivotMarker: true }]);
    }
    if (newSprint !== prevSprintRef.current) {
      prevSprintRef.current = newSprint;
      setSprint(newSprint);
      setPersona(newPersona);
      setMessages((prev) => [...prev, {
        role: "ai", text: `Sprint ${newSprint} — ${SPRINT_LABELS[newSprint]}`,
        isSprintMarker: true, sprint: newSprint,
      }]);
    }

    setMessages((prev) => [...prev, { role: "ai", text, severity: weakness?.severity }]);
    setQuestionCount((c) => c + 1);

    const ac = new AbortController();
    sessionRef.current?.setAbortController(ac);
    sessionRef.current?.setActivePlaybackText(text);
    sessionRef.current?.transition(FloorState.AI_SPEAKING);
    try { await playAudioUrl(preloadedAudioUrl, text, ac.signal); } catch { /* interrupted */ }

    if (expectedTurnId !== currentTurnIdRef.current) return;
    await new Promise<void>((r) => setTimeout(r, 300));
    if (expectedTurnId !== currentTurnIdRef.current) return;

    if (isComplete) {
      sessionRef.current?.transition(FloorState.IDLE);
      sessionRef.current?.stop();
      // Triggers the finalization retry loop via useEffect
      setInterviewComplete(true);
    } else {
      beginUserTurn(sessionRef.current);
    }
  }, [beginUserTurn]);

  const commitAnswerDraft = useCallback(async (session: InterviewSession, turnId: string) => {
    const draft = answerDraftRef.current;
    if (!draft || draft.turnId !== turnId) return;
    if (draft.commitTimer) { clearTimeout(draft.commitTimer); draft.commitTimer = null; }
    if (processingRef.current) { draft.pendingRevision = true; return; }

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
      if (draft.messageIndex !== null && prev[draft.messageIndex]?.role === "candidate") {
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
        live && live.turnId === turnId && live.requestVersion === reqVersion &&
        live.pendingRevision &&
        live.submittedText !== live.textParts.join(" ").replace(/\s+/g, " ").trim()
      );
    };

    try {
      const result = await processTurn(sessionIdRef.current, mergedText, entities, turnId);
      if (isStale()) return;
      const responseTurnId = typeof result.turn_id === "string" ? result.turn_id : turnId;
      if (responseTurnId !== currentTurnIdRef.current) return;

      const audioUrl = await prefetchAudio(result.response as string, sessionIdRef.current);
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
        pending.commitTimer = setTimeout(() => { void commitAnswerDraft(session, turnId); }, 150);
      }
    }
  }, [beginUserTurn, clearAnswerDraft, handleFollowup]);

  const queueAnswerChunk = useCallback((session: InterviewSession, text: string, entities: string[]) => {
    const cleaned = text.trim();
    if (!cleaned) return;

    const turnId = session.getActiveTurnId() || crypto.randomUUID();
    session.setActiveTurnId(turnId);
    currentTurnIdRef.current = turnId;

    let draft = answerDraftRef.current;
    if (!draft || draft.turnId !== turnId) {
      clearAnswerDraft();
      draft = {
        turnId, textParts: [], entitySet: new Set<string>(),
        submittedText: null, pendingRevision: false, requestVersion: 0,
        messageIndex: null, commitTimer: null,
      };
      answerDraftRef.current = draft;
    }

    if (draft.textParts[draft.textParts.length - 1] !== cleaned) draft.textParts.push(cleaned);
    entities.forEach((e) => draft!.entitySet.add(e));
    setPartial(draft.textParts.join(" "));

    if (draft.submittedText !== null && silenceConfirmedRef.current) {
      silenceConfirmedRef.current = false;
      commitTimeRef.current = performance.now();
    }

    if (draft.commitTimer) clearTimeout(draft.commitTimer);
    draft.commitTimer = setTimeout(() => { void commitAnswerDraft(session, turnId); }, ANSWER_SETTLE_MS);
  }, [clearAnswerDraft, commitAnswerDraft]);

  // ─── Boot interview engine ─────────────────────────────────────────────────
  const bootEngine = useCallback(async (eng: EngineStart) => {
    setInterviewError("");
    sessionIdRef.current = eng.sessionId;
    interviewIdRef.current = eng.interviewId;
    setSprint(eng.sprint);
    setPersona("curious_lead");
    prevSprintRef.current = eng.sprint;
    setQuestionCount(0);
    setMessages(eng.openingQuestion ? [{ role: "ai", text: eng.openingQuestion }] : []);

    const openingAudioUrl = eng.openingQuestion
      ? await prefetchAudio(eng.openingQuestion, eng.sessionId)
      : null;

    const session = new InterviewSession(eng.sessionId);
    sessionRef.current = session;

    session.onFloorChange = (floor) => {
      if (floor === FloorState.USER_SPEAKING) setInterviewPhase("listening");
      else if (floor === FloorState.AI_THINKING) setInterviewPhase("thinking");
      else if (floor === FloorState.AI_SPEAKING) setInterviewPhase("speaking");
      else setInterviewPhase("idle");
    };

    session.onBargeIn = () => {
      clearAnswerDraft();
      currentTurnIdRef.current = crypto.randomUUID();
      session.setActiveTurnId(currentTurnIdRef.current);
      setPartial("");
    };

    session.onSilence = async () => {
      if (session.floor === FloorState.AI_THINKING) { silenceConfirmedRef.current = true; return; }
      if (processingRef.current || session.floor !== FloorState.USER_SPEAKING) return;
      const ac = new AbortController();
      const { url: nudgeUrl, text: nudgeText } = await prefetchFillerAudio();
      session.setAbortController(ac);
      session.setActivePlaybackText(nudgeText);
      session.transition(FloorState.AI_SPEAKING);
      try { await playAudioUrl(nudgeUrl, nudgeText, ac.signal); } catch { /* interrupted */ }
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
      // Mic failed after session already created — cancel backend session so the gate resets
      setInterviewError(`Microphone error: ${String(e)}`);
      api.post("/api/ai-interview-adapter/cancel", {
        session_id: eng.sessionId,
        provenhire_interview_id: eng.interviewId,
      }).catch(() => {});
      return;
    }

    stopVisualizerRef.current = session.connectVisualizer((level) => setMicLevel(level));
    setEngineBooted(true);

    if (eng.openingQuestion) {
      const ac = new AbortController();
      session.setAbortController(ac);
      session.setActivePlaybackText(eng.openingQuestion);
      session.transition(FloorState.AI_SPEAKING);
      await playAudioUrl(openingAudioUrl, eng.openingQuestion, ac.signal);
    }
    beginUserTurn(session);
  }, [beginUserTurn, clearAnswerDraft, queueAnswerChunk]);

  // Boot when engine data is ready
  useEffect(() => {
    if (phase !== "interview" || !engine || engineBootedRef.current || interviewComplete) return;
    engineBootedRef.current = true;
    void bootEngine(engine);
  }, [phase, engine, bootEngine, interviewComplete]);

  // Reset boot guard when returning to setup
  useEffect(() => {
    if (phase === "setup") {
      engineBootedRef.current = false;
      setEngineBooted(false);
      setInterviewComplete(false);
      setMessages([]);
      setPartial("");
      setInterviewError("");
    }
  }, [phase]);

  // ─── Setup form submit ─────────────────────────────────────────────────────
  async function handleStart() {
    if (!resume.trim()) { toast.error("Paste your resume to begin."); return; }
    if (!targetRole.trim()) { toast.error("Enter the target role."); return; }

    // Verify mic access before burning the API call / 2-min map build
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((t) => t.stop());
    } catch {
      toast.error("Microphone access is required. Please allow access in your browser and try again.");
      return;
    }

    setStarting(true);
    try {
      const data = await api.post<{
        session_id: string;
        opening_question: string;
        sprint: number;
        provenhire_interview_id: string;
      }>("/api/ai-interview-adapter/start", {
        resume: resume.trim(),
        github_links: githubLinks.split("\n").map((l) => l.trim()).filter(Boolean),
        target_role: targetRole.trim(),
        years_experience: expLevel,
      });
      setEngine({
        sessionId: data.session_id,
        openingQuestion: data.opening_question,
        sprint: data.sprint,
        interviewId: data.provenhire_interview_id,
      });
      setPhase("interview");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to start interview. Please try again.";
      toast.error(msg);
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
        toast.error("Could not cancel session cleanly. If you can't start a new interview, contact support.");
      } finally {
        setCancelling(false);
      }
    }
    setEngine(null);
    setStarting(false);
    setPhase("setup");
  }

  const progressPct = Math.min((questionCount / 15) * 100, 100);

  // ─── Render: initial check ─────────────────────────────────────────────────
  if (phase === "checking") {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
        <Loader2 className="w-5 h-5 animate-spin text-zinc-600" />
      </div>
    );
  }

  // ─── Render: setup form ────────────────────────────────────────────────────
  if (phase === "setup") {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-xl">
          <Card>
            <CardHeader>
              <CardTitle>AI Expert Interview</CardTitle>
              <CardDescription>
                A 30-minute adversarial interview across three sprints — Project Defense,
                Foundations, and System Design. Voice-first. Ensure your microphone is
                available before starting.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="ag-resume">Resume <span className="text-destructive">*</span></Label>
                <Textarea
                  id="ag-resume"
                  placeholder="Paste your full resume text here (plain text or copy-pasted from PDF)…"
                  rows={8}
                  value={resume}
                  onChange={(e) => setResume(e.target.value)}
                  className="font-mono text-xs"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="ag-role">Target Role <span className="text-destructive">*</span></Label>
                  <Input
                    id="ag-role"
                    placeholder="e.g. Senior Backend Engineer"
                    value={targetRole}
                    onChange={(e) => setTargetRole(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ag-exp">Experience Level <span className="text-destructive">*</span></Label>
                  <Select value={expLevel} onValueChange={setExpLevel}>
                    <SelectTrigger id="ag-exp"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {EXPERIENCE_OPTIONS.map((o) => (
                        <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="ag-github">GitHub Links (optional)</Label>
                <Textarea
                  id="ag-github"
                  placeholder="One URL per line — repositories you'd like to reference…"
                  rows={2}
                  value={githubLinks}
                  onChange={(e) => setGithubLinks(e.target.value)}
                  className="font-mono text-xs"
                />
              </div>
              <div className="rounded-md bg-amber-500/10 border border-amber-500/20 px-4 py-3 text-xs text-amber-700 dark:text-amber-400 flex gap-2">
                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                <span>Once started the interview cannot be paused. Ensure a quiet environment with a working microphone and camera.</span>
              </div>
              <div className="flex gap-3 pt-1">
                <Button onClick={handleStart} disabled={starting}>
                  {starting
                    ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />{LAUNCH_STATUSES[launchStatusIndex]}</>
                    : "Start Interview"}
                </Button>
              </div>
              {starting && (
                <p className="text-xs text-muted-foreground">
                  Preparing your interview map before launch — this can take up to 2 minutes on first boot.
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  // ─── Render: done card ─────────────────────────────────────────────────────
  if (phase === "done") {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-4">
        <div className="w-full max-w-md">
          <Card className="border-2 border-emerald-500/30 bg-emerald-500/5">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CheckCircle className="h-5 w-5 text-emerald-500" />
                Interview Complete
              </CardTitle>
              <CardDescription>
                Your AI expert interview has been submitted for review. You'll receive an email update within 10–15 hours.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {completion?.score != null && (
                <div className="flex items-center gap-3">
                  <Trophy className="h-5 w-5 text-[hsl(var(--gold))]" />
                  <div>
                    <p className="text-sm font-semibold">Score: {completion.score}/100 — {completion.badge}</p>
                    <p className="text-xs text-muted-foreground capitalize">{completion.verdict}</p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  // ─── Render: live interview ────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white flex flex-col select-none">
      <header className="flex items-center justify-between px-6 py-4 border-b border-white/5">
        <div className="flex items-center gap-3">
          <span className="text-sm font-semibold tracking-tight">AI Skills Interview</span>
          {engineBooted && (
            <span className="text-xs px-2 py-0.5 rounded-md bg-white/5 text-zinc-400">
              Sprint {sprint} — {SPRINT_LABELS[sprint]}
            </span>
          )}
        </div>
        <div className="flex items-center gap-4">
          {engineBooted && (
            <div className="flex items-center gap-2">
              <div className="w-20 h-[3px] bg-white/10 rounded-full overflow-hidden">
                <div
                  className="h-full bg-white/60 rounded-full transition-all duration-700"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
              <span className="text-[11px] text-zinc-600 tabular-nums">{questionCount}/15</span>
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
        <div className="w-80 flex-shrink-0 border-r border-white/5 flex flex-col items-center justify-center gap-6 px-6">
          <div className="relative w-full aspect-square max-w-[200px] flex items-center justify-center">
            <AIOrb state={interviewPhase} />
          </div>
          <div className="text-center space-y-1">
            <p className="text-xs font-medium text-zinc-300">
              {interviewPhase === "listening" ? "Listening"
                : interviewPhase === "thinking" ? "Analyzing..."
                : interviewPhase === "speaking" ? "Speaking"
                : engineBooted ? "Idle" : "Initializing…"}
            </p>
            {engineBooted && (
              <p className="text-[11px] text-zinc-600 font-mono tracking-wider">{PERSONA_DESC[persona]}</p>
            )}
          </div>
          {interviewPhase === "listening" && <Waveform level={micLevel} active={true} />}
        </div>

        {/* Right: Transcript */}
        <div className="flex-1 flex flex-col overflow-hidden relative">
          <div ref={transcriptRef} className="flex-1 overflow-y-auto px-10 py-8 space-y-6">
            {!engineBooted && !interviewComplete && (
              <div className="flex items-center justify-center h-full">
                <div className="text-center space-y-4 max-w-sm">
                  <div className="w-12 h-12 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center mx-auto mb-6">
                    <span className="text-xl">∞</span>
                  </div>
                  <h2 className="text-lg font-medium text-zinc-200">Adversarial AI Interview</h2>
                  <p className="text-zinc-500 text-sm leading-relaxed">
                    A real-time cognitive depth interview. 3 sprints. Probing your ownership, fundamentals, and system thinking.
                  </p>
                  <p className="text-zinc-700 text-[10px] uppercase tracking-[0.2em] pt-4">Probe → Break → Analyze → Adapt</p>
                  {interviewError ? (
                    <p className="text-red-400 text-xs mt-4">{interviewError}</p>
                  ) : (
                    <Loader2 className="w-4 h-4 animate-spin text-zinc-600 mx-auto mt-4" />
                  )}
                </div>
              </div>
            )}

            {messages.map((msg, i) => <MessageItem key={i} msg={msg} />)}

            {partial && (
              <div className="flex justify-end pr-4">
                <div className="max-w-[80%]">
                  <p className="text-[10px] text-zinc-600 uppercase tracking-widest mb-2 text-right">Accumulating</p>
                  <div className="rounded-2xl px-5 py-3.5 text-[13px] bg-white/[0.03] text-zinc-400 border border-white/[0.05] italic">
                    {partial}
                  </div>
                </div>
              </div>
            )}

            {interviewComplete && (
              <div className="text-center py-12 space-y-2 animate-in fade-in slide-in-from-bottom-2 duration-1000">
                <div className="inline-block px-3 py-1 rounded-full bg-green-500/10 border border-green-500/20 text-green-500 text-[10px] mb-2 uppercase tracking-widest">
                  Complete
                </div>
                <p className="text-zinc-200 text-sm font-medium">Interview complete.</p>
                <p className="text-zinc-500 text-[11px]">Compiling your report and reasoning metrics…</p>
              </div>
            )}
          </div>

          <div className="border-t border-white/5 px-10 py-6 flex items-center justify-between bg-[#0a0a0a]/80 backdrop-blur-xl">
            {interviewError && engineBooted ? (
              <div className="flex items-center gap-2 text-red-400 text-[11px]">
                <div className="w-1 h-1 rounded-full bg-red-400" />
                {interviewError}
              </div>
            ) : <span />}

            <div className="ml-auto flex items-center gap-3 text-[11px] font-medium text-zinc-400">
              <div className="flex items-center gap-2">
                {interviewPhase === "listening" && <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />}
                {interviewPhase === "thinking" && <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />}
                {interviewPhase === "speaking" && <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />}
                <span className="uppercase tracking-widest text-[10px] text-zinc-500">
                  {interviewPhase === "listening" ? "Listening"
                    : interviewPhase === "thinking" ? "Reasoning"
                    : interviewPhase === "speaking" ? "Speaking"
                    : "Idle"}
                </span>
              </div>
              <div className="h-4 w-px bg-white/10" />
              <span className="text-zinc-600 tabular-nums uppercase text-[10px]">
                Turn: {currentTurnIdRef.current.slice(0, 8)}
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
      <div className="flex items-center gap-6 py-6 px-10">
        <div className="flex-1 h-px bg-white/5" />
        <span className="text-[10px] text-zinc-600 uppercase tracking-[0.3em] font-medium">{msg.text}</span>
        <div className="flex-1 h-px bg-white/5" />
      </div>
    );
  }
  if (msg.isPivotMarker) {
    return (
      <div className="flex items-center gap-4 py-2 px-10">
        <div className="flex-1 h-px bg-white/[0.03]" />
        <span className="text-[9px] text-zinc-700 uppercase tracking-[0.25em]">shifting focus</span>
        <div className="flex-1 h-px bg-white/[0.03]" />
      </div>
    );
  }
  const isAI = msg.role === "ai";
  return (
    <div className={`flex ${isAI ? "justify-start" : "justify-end"} group animate-in fade-in slide-in-from-bottom-1 duration-500`}>
      <div className="max-w-[85%] space-y-2">
        <div className={`flex items-center gap-2 ${isAI ? "" : "flex-row-reverse"}`}>
          <p className="text-[10px] uppercase tracking-widest font-bold text-zinc-500">
            {isAI ? "Protocol" : "Candidate"}
          </p>
          {msg.severity === "high" && (
            <span className="text-[9px] bg-red-500/10 text-red-500 border border-red-500/20 px-1.5 py-0.5 rounded-md font-bold animate-pulse">
              BOUNDARY EXPOSED
            </span>
          )}
        </div>
        <div className={`rounded-3xl px-6 py-4 text-[14px] leading-[1.6] ${
          isAI
            ? "bg-white/[0.03] text-zinc-300 border border-white/[0.05] shadow-sm"
            : "bg-white/[0.07] text-white border border-white/[0.1] shadow-md"
        }`}>
          {msg.text}
        </div>
      </div>
    </div>
  );
}
