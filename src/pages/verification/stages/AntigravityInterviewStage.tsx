import { useEffect, useRef, useState, useCallback } from "react";
import { InterviewSession, processTurn, prefetchAudio, prefetchFillerAudio, playAudioUrl, FloorState } from "@/lib/antigravityAudio";
import { AIOrb, Waveform } from "@/components/AntigravityWaveform";
import { getAuthToken } from "@/lib/api";

type Phase = "idle" | "listening" | "thinking" | "speaking";

type Message = {
  role: "ai" | "candidate";
  text: string;
  severity?: string;
  isSprintMarker?: boolean;
  isPivotMarker?: boolean;
  sprint?: number;
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

const ANSWER_SETTLE_MS = 700;
const TTS_HOLD_CAP_MS = 2500;

interface Props {
  targetJobTitle?: string;
  experienceYears?: number;
  verificationRoleType?: "technical" | "non_technical" | "data";
  onInterviewAwaitingReview?: () => void;
  onReturnToDashboard?: () => void;
  onPaywallRequired?: (stageName: string, pricing: { singleInr: number; bundleInr: number }, nextAvailableAt: Date | null) => void;
}

function experienceLevelFromYears(years: number | undefined): "junior" | "mid" | "senior" {
  if (years == null || years < 0) return "mid";
  if (years < 2) return "junior";
  if (years < 5) return "mid";
  return "senior";
}

export default function AntigravityInterviewStage({
  targetJobTitle,
  experienceYears,
  onInterviewAwaitingReview,
  onReturnToDashboard,
}: Props) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [messages, setMessages] = useState<Message[]>([]);
  const [partial, setPartial] = useState("");
  const [sprint, setSprint] = useState(1);
  const [persona, setPersona] = useState("curious_lead");
  const [questionCount, setQuestionCount] = useState(0);
  const [micLevel, setMicLevel] = useState(0);
  const [started, setStarted] = useState(false);
  const [complete, setComplete] = useState(false);
  const [error, setError] = useState("");
  const [booting, setBooting] = useState(false);
  const [interviewId, setInterviewId] = useState<string | null>(null);

  const sessionRef = useRef<InterviewSession | null>(null);
  const prevSprintRef = useRef(1);
  const stopVisualizerRef = useRef<(() => void) | null>(null);
  const transcriptRef = useRef<HTMLDivElement>(null);
  const processingRef = useRef(false);
  const currentTurnIdRef = useRef("");
  const answerDraftRef = useRef<AnswerDraft | null>(null);
  const silenceConfirmedRef = useRef(false);
  const commitTimeRef = useRef(0);
  const interviewIdRef = useRef<string | null>(null);

  const clearAnswerDraft = useCallback(() => {
    const draft = answerDraftRef.current;
    if (draft?.commitTimer) clearTimeout(draft.commitTimer);
    answerDraftRef.current = null;
  }, []);

  const beginUserTurn = useCallback((session: InterviewSession | null) => {
    if (!session) return;
    clearAnswerDraft();
    silenceConfirmedRef.current = false;
    commitTimeRef.current = 0;
    const turnId = crypto.randomUUID();
    currentTurnIdRef.current = turnId;
    session.setActiveTurnId(turnId);
    session.transition(FloorState.USER_SPEAKING);
  }, [clearAnswerDraft]);

  const teardown = useCallback(() => {
    currentTurnIdRef.current = crypto.randomUUID();
    clearAnswerDraft();
    stopVisualizerRef.current?.();
    stopVisualizerRef.current = null;
    sessionRef.current?.stop();
    sessionRef.current = null;
  }, [clearAnswerDraft]);

  useEffect(() => {
    transcriptRef.current?.scrollTo({ top: transcriptRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, partial]);

  useEffect(() => {
    return () => { teardown(); };
  }, [teardown]);

  const handleFollowup = useCallback(async (
    result: Record<string, unknown>,
    preloadedAudioUrl: string | null,
    expectedTurnId: string,
  ) => {
    if (expectedTurnId !== currentTurnIdRef.current) {
      if (preloadedAudioUrl) URL.revokeObjectURL(preloadedAudioUrl);
      return;
    }
    if (sessionRef.current?.floor === FloorState.USER_SPEAKING) {
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
      const elapsed = performance.now() - commitTimeRef.current;
      const remaining = Math.max(0, TTS_HOLD_CAP_MS - elapsed);
      if (remaining > 0) {
        await new Promise<void>((resolve) => {
          const interval = setInterval(() => {
            const speaking = sessionRef.current?.floor === FloorState.USER_SPEAKING;
            const done = silenceConfirmedRef.current || speaking ||
              (performance.now() - commitTimeRef.current >= TTS_HOLD_CAP_MS);
            if (done) { clearInterval(interval); resolve(); }
          }, 40);
          setTimeout(() => { clearInterval(interval); resolve(); }, remaining);
        });
      }
    }

    const floorAfterHold = sessionRef.current?.floor as FloorState | undefined;
    if (floorAfterHold === FloorState.USER_SPEAKING) {
      if (preloadedAudioUrl) URL.revokeObjectURL(preloadedAudioUrl);
      return;
    }
    if (expectedTurnId !== currentTurnIdRef.current) {
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
        role: "ai",
        text: `Sprint ${newSprint} — ${SPRINT_LABELS[newSprint]}`,
        isSprintMarker: true,
        sprint: newSprint,
      }]);
    }

    setMessages((prev) => [...prev, { role: "ai", text, severity: weakness?.severity }]);
    setQuestionCount((c) => c + 1);

    const ac = new AbortController();
    sessionRef.current?.setAbortController(ac);
    sessionRef.current?.setActivePlaybackText(text);
    sessionRef.current?.transition(FloorState.AI_SPEAKING);

    try {
      await playAudioUrl(preloadedAudioUrl, text, ac.signal);
    } catch {
      // interrupted or failed — continue
    }

    if (expectedTurnId !== currentTurnIdRef.current) return;

    await new Promise<void>((r) => setTimeout(r, 300));
    if (expectedTurnId !== currentTurnIdRef.current) return;

    if (isComplete) {
      sessionRef.current?.transition(FloorState.IDLE);
      setComplete(true);
      sessionRef.current?.stop();
      setTimeout(() => onInterviewAwaitingReview?.(), 2500);
    } else {
      beginUserTurn(sessionRef.current);
    }
  }, [beginUserTurn, onInterviewAwaitingReview]);

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
    const requestVersion = draft.requestVersion;
    const mergedEntities = [...draft.entitySet];

    let nextMessageIndex = draft.messageIndex;
    setMessages((prev) => {
      if (draft.messageIndex !== null && prev[draft.messageIndex]?.role === "candidate") {
        const updated = [...prev];
        updated[draft.messageIndex] = { role: "candidate", text: mergedText };
        return updated;
      }
      nextMessageIndex = prev.length;
      return [...prev, { role: "candidate", text: mergedText }];
    });
    draft.messageIndex = nextMessageIndex ?? draft.messageIndex;
    setPartial("");
    session.transition(FloorState.AI_THINKING);

    const isRevisionStale = () => {
      const liveDraft = answerDraftRef.current;
      return Boolean(
        liveDraft && liveDraft.turnId === turnId && liveDraft.requestVersion === requestVersion &&
        liveDraft.pendingRevision &&
        liveDraft.submittedText !== liveDraft.textParts.join(" ").replace(/\s+/g, " ").trim()
      );
    };

    const iid = interviewIdRef.current!;

    try {
      const result = await processTurn(iid, mergedText, mergedEntities, turnId);
      if (isRevisionStale()) return;
      const responseTurnId = typeof result.turn_id === "string" ? result.turn_id : turnId;
      if (responseTurnId !== currentTurnIdRef.current) return;

      const audioUrl = await prefetchAudio(result.response as string);
      if (isRevisionStale() || responseTurnId !== currentTurnIdRef.current) {
        if (audioUrl) URL.revokeObjectURL(audioUrl);
        return;
      }

      clearAnswerDraft();
      await handleFollowup(result, audioUrl, responseTurnId);
    } catch {
      setError("Agent pipeline error. Please try again.");
      beginUserTurn(session);
    } finally {
      processingRef.current = false;
      const pendingDraft = answerDraftRef.current;
      if (pendingDraft && pendingDraft.turnId === turnId && pendingDraft.pendingRevision) {
        pendingDraft.pendingRevision = false;
        pendingDraft.commitTimer = setTimeout(() => { void commitAnswerDraft(session, turnId); }, 150);
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
        turnId, textParts: [], entitySet: new Set<string>(), submittedText: null,
        pendingRevision: false, requestVersion: 0, messageIndex: null, commitTimer: null,
      };
      answerDraftRef.current = draft;
    }

    const prev = draft.textParts[draft.textParts.length - 1];
    if (prev !== cleaned) draft.textParts.push(cleaned);
    entities.forEach((e) => draft!.entitySet.add(e));
    setPartial(draft.textParts.join(" "));

    if (draft.submittedText !== null && silenceConfirmedRef.current) {
      silenceConfirmedRef.current = false;
      commitTimeRef.current = performance.now();
    }

    if (draft.commitTimer) clearTimeout(draft.commitTimer);
    draft.commitTimer = setTimeout(() => { void commitAnswerDraft(session, turnId); }, ANSWER_SETTLE_MS);
  }, [clearAnswerDraft, commitAnswerDraft]);

  async function startInterview() {
    setError("");
    setBooting(true);

    try {
      const jobRole = targetJobTitle || "Software Engineer";
      const experienceLevel = experienceLevelFromYears(experienceYears);

      const res = await fetch("/api/interview/v2/start", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${getAuthToken()}`,
        },
        body: JSON.stringify({ jobRole, experienceLevel }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({})) as { code?: string; pricing?: { singleInr: number; bundleInr: number }; nextAvailableAt?: string; error?: string };
        throw new Error(data.error ?? `Start failed: ${res.status}`);
      }

      const data = await res.json() as {
        interviewId: string;
        question: string;
        sprint: number;
        persona: string;
      };

      interviewIdRef.current = data.interviewId;
      setInterviewId(data.interviewId);

      const openingSprint = data.sprint ?? 1;
      const openingPersona = data.persona ?? "curious_lead";
      setSprint(openingSprint);
      setPersona(openingPersona);
      prevSprintRef.current = openingSprint;
      setQuestionCount(0);
      setMessages(data.question ? [{ role: "ai", text: data.question }] : []);
      setStarted(true);

      const openingAudioUrl = data.question ? await prefetchAudio(data.question) : null;

      const session = new InterviewSession(data.interviewId);
      sessionRef.current = session;

      session.onFloorChange = (floor) => {
        if (floor === FloorState.USER_SPEAKING) setPhase("listening");
        else if (floor === FloorState.AI_THINKING) setPhase("thinking");
        else if (floor === FloorState.AI_SPEAKING) setPhase("speaking");
        else setPhase("idle");
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
        if (processingRef.current || session.floor !== FloorState.USER_SPEAKING) return;

        const ac = new AbortController();
        const { url: nudgeUrl, text: nudgeText } = await prefetchFillerAudio();
        session.setAbortController(ac);
        session.setActivePlaybackText(nudgeText);
        session.transition(FloorState.AI_SPEAKING);
        try {
          await playAudioUrl(nudgeUrl, nudgeText, ac.signal);
        } catch {
          // interrupted
        }
        beginUserTurn(session);
      };

      session.onPartial = (text) => { setPartial(text); };

      session.onFinal = async (text, entities, metadata) => {
        silenceConfirmedRef.current = metadata?.reason === "utterance_end";
        queueAnswerChunk(session, text, entities);
      };

      session.onError = (err) => { setError(`Voice error: ${err}`); };

      await session.start();
      stopVisualizerRef.current = session.connectVisualizer((level) => setMicLevel(level));

      if (data.question) {
        const ac = new AbortController();
        session.setAbortController(ac);
        session.setActivePlaybackText(data.question);
        session.transition(FloorState.AI_SPEAKING);
        await playAudioUrl(openingAudioUrl, data.question, ac.signal);
        beginUserTurn(session);
      } else {
        beginUserTurn(session);
      }
    } catch (e) {
      setError(`Could not start: ${String(e)}`);
      setStarted(false);
      setPhase("idle");
    } finally {
      setBooting(false);
    }
  }

  function endInterview() {
    teardown();
    onReturnToDashboard?.();
  }

  const progressPct = Math.min((questionCount / 15) * 100, 100);

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white flex flex-col select-none">

      {/* Top bar */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-white/5">
        <div className="flex items-center gap-3">
          <span className="text-sm font-semibold tracking-tight">AI Skills Interview</span>
          {started && (
            <span className="text-xs px-2 py-0.5 rounded-md bg-white/5 text-zinc-400">
              Sprint {sprint} — {SPRINT_LABELS[sprint]}
            </span>
          )}
        </div>

        <div className="flex items-center gap-4">
          {started && (
            <div className="flex items-center gap-2">
              <div className="w-20 h-[3px] bg-white/10 rounded-full overflow-hidden">
                <div className="h-full bg-white/60 rounded-full transition-all duration-700" style={{ width: `${progressPct}%` }} />
              </div>
              <span className="text-[11px] text-zinc-600 tabular-nums">{questionCount}/15</span>
            </div>
          )}
          {started && !complete && (
            <button onClick={endInterview} className="text-[11px] text-zinc-600 hover:text-red-400 transition-colors">
              End
            </button>
          )}
        </div>
      </header>

      {/* Main */}
      <div className="flex flex-1 overflow-hidden">

        {/* Left: AI panel */}
        <div className="w-80 flex-shrink-0 border-r border-white/5 flex flex-col items-center justify-center gap-6 px-6">
          <div className="relative w-full aspect-square max-w-[200px] flex items-center justify-center">
            <AIOrb state={phase} />
          </div>

          <div className="text-center space-y-1">
            <p className="text-xs font-medium text-zinc-300">
              {phase === "idle" && !started && "Ready"}
              {phase === "listening" && "Listening"}
              {phase === "thinking" && "Analyzing..."}
              {phase === "speaking" && "Speaking"}
            </p>
            {started && (
              <p className="text-[11px] text-zinc-600 font-mono tracking-wider">{PERSONA_DESC[persona]}</p>
            )}
          </div>

          {phase === "listening" && (
            <Waveform level={micLevel} active={true} />
          )}
        </div>

        {/* Right: Transcript */}
        <div className="flex-1 flex flex-col overflow-hidden relative">
          <div
            ref={transcriptRef}
            className="flex-1 overflow-y-auto px-10 py-8 space-y-6 relative"
          >
            {!started && (
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
                </div>
              </div>
            )}

            {messages.map((msg, i) => (
              <MessageItem key={i} msg={msg} />
            ))}

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

            {complete && (
              <div className="text-center py-12 space-y-2 animate-in fade-in slide-in-from-bottom-2 duration-1000">
                <div className="inline-block px-3 py-1 rounded-full bg-green-500/10 border border-green-500/20 text-green-500 text-[10px] mb-2 uppercase tracking-widest">Complete</div>
                <p className="text-zinc-200 text-sm font-medium">Interview complete.</p>
                <p className="text-zinc-500 text-[11px]">Compiling your report and reasoning metrics...</p>
              </div>
            )}
          </div>

          {/* Bottom bar */}
          <div className="border-t border-white/5 px-10 py-6 flex items-center justify-between bg-[#0a0a0a]/80 backdrop-blur-xl">
            {error ? (
              <div className="flex items-center gap-2 text-red-400 text-[11px]">
                <div className="w-1 h-1 rounded-full bg-red-400" />
                {error}
              </div>
            ) : <span />}

            {!started ? (
              <button
                onClick={startInterview}
                disabled={booting}
                className="ml-auto bg-white text-black text-[13px] font-semibold px-8 py-3 rounded-full hover:bg-zinc-100 transition-all hover:scale-105 active:scale-95 shadow-lg shadow-white/10 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
              >
                {booting ? "Preparing..." : "Engage System →"}
              </button>
            ) : (
              <div className="ml-auto flex items-center gap-3 text-[11px] font-medium text-zinc-400">
                <div className="flex items-center gap-2">
                  {phase === "listening" && <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />}
                  {phase === "thinking" && <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />}
                  {phase === "speaking" && <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />}
                  <span className="uppercase tracking-widest text-[10px] text-zinc-500">
                    {phase === "listening" ? "Listening" : phase === "thinking" ? "Reasoning" : phase === "speaking" ? "Speaking" : "Idle"}
                  </span>
                </div>
                <div className="h-4 w-px bg-white/10" />
                <span className="text-zinc-600 tabular-nums uppercase text-[10px]">Turn: {currentTurnIdRef.current.slice(0, 8)}</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

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
            <span className="text-[9px] bg-red-500/10 text-red-500 border border-red-500/20 px-1.5 py-0.5 rounded-md font-bold animate-pulse">BOUNDARY EXPOSED</span>
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
