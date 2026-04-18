import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight, BookmarkCheck, BrainCircuit, Briefcase, FileText,
  LayoutGrid, ListChecks, Radar, Settings, ShieldAlert, Sparkles,
} from "lucide-react";
import DashboardShell from "@/components/DashboardShell";
import { useAuth } from "@/contexts/AuthContext";
import { api, getAuthToken } from "@/lib/api";
import { jobSeekerShellUser } from "@/utils/jobSeekerIdentity";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { AIOrb, Waveform } from "@/components/antigravity/AIOrb";
import {
  InterviewSession, FloorState,
  processTurn, prefetchAudio, prefetchFillerAudio, playAudioUrl,
  trackInterviewEvent,
} from "@/lib/antigravity/audio";

// ─── Types ────────────────────────────────────────────────────────────────────

type ProfileShape = {
  fullName?: string | null; full_name?: string | null;
  currentRole?: string | null; current_role?: string | null;
  targetJobTitle?: string | null; target_job_title?: string | null;
  experienceYears?: number | null; experience_years?: number | null;
  about?: string | null; skills?: string[] | null;
  college?: string | null;
  graduationYear?: string | number | null; graduation_year?: string | number | null;
  location?: string | null;
};

type ConfigResponse = { configured: boolean };

type StartResponse = {
  session_id: string;
  opening_question: string;
  sprint: number;
  sprint_name?: string;
};

type ReportResponse = {
  session_id: string; complete: boolean;
  target_role: string; years_experience: string;
  total_questions: number; overall_score: number | null;
  hire_recommendation: string | null; confidence_score: number | null;
  summary: string | null; strengths: string[]; risk_flags: string[];
  untested_dimensions: string[]; scores: Record<string, number | string>;
  failure_surface: Record<string, number>;
  claim_credibility_risk?: { level: string; detail: string } | null;
};

type LiveMessage = {
  role: "ai" | "candidate";
  text: string;
  severity?: string;
  isSprintMarker?: boolean;
  isPivotMarker?: boolean;
  sprint?: number;
};

type AnswerDraft = {
  turnId: string; textParts: string[]; entitySet: Set<string>;
  submittedText: string | null; pendingRevision: boolean;
  requestVersion: number; messageIndex: number | null;
  commitTimer: ReturnType<typeof setTimeout> | null;
};

// ─── Constants ────────────────────────────────────────────────────────────────

const EXPERIENCE_BANDS = ["0-1", "1-2", "2-4", "4-6", "6+"] as const;
const SPRINT_LABELS: Record<number, string> = { 1: "Project Defense", 2: "Foundations", 3: "System Design" };
const PERSONA_DESC: Record<string, string> = {
  curious_lead: "Challenging your ownership",
  socratic_mentor: "Testing first principles",
  senior_peer: "Stress-testing your design",
};
const ANSWER_SETTLE_MS = 700;
const TTS_HOLD_CAP_MS = 2500;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function experienceBandFromYears(years: number | null | undefined): (typeof EXPERIENCE_BANDS)[number] {
  const v = typeof years === "number" && Number.isFinite(years) ? years : 0;
  if (v <= 1) return "0-1";
  if (v <= 2) return "1-2";
  if (v <= 4) return "2-4";
  if (v <= 6) return "4-6";
  return "6+";
}

function buildResumeSeed(profile: ProfileShape | null): string {
  if (!profile) return "";
  const skills = Array.isArray(profile.skills) ? profile.skills.filter(Boolean).join(", ") : "";
  return [
    (profile.fullName ?? profile.full_name) ? `Name: ${profile.fullName ?? profile.full_name}` : "",
    (profile.targetJobTitle ?? profile.target_job_title) ? `Target role: ${profile.targetJobTitle ?? profile.target_job_title}` : "",
    (profile.currentRole ?? profile.current_role) ? `Current role: ${profile.currentRole ?? profile.current_role}` : "",
    (profile.experienceYears ?? profile.experience_years) != null ? `Experience: ${profile.experienceYears ?? profile.experience_years} years` : "",
    profile.location ? `Location: ${profile.location}` : "",
    skills ? `Skills: ${skills}` : "",
    profile.about ? `About: ${profile.about}` : "",
    profile.college ? `Education: ${profile.college}` : "",
    (profile.graduationYear ?? profile.graduation_year) ? `Graduation year: ${profile.graduationYear ?? profile.graduation_year}` : "",
  ].filter(Boolean).join("\n");
}

function formatDimensionLabel(value: string): string {
  return value.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

// ─── Live interview sub-components ───────────────────────────────────────────

function LiveMessageItem({ msg }: { msg: LiveMessage }) {
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

// ─── Main component ───────────────────────────────────────────────────────────

export default function AntigravityInterviewPage() {
  const { user } = useAuth();

  // ── Setup state ──────────────────────────────────────────────────────────
  const [profile, setProfile] = useState<ProfileShape | null>(null);
  const [configured, setConfigured] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [resume, setResume] = useState("");
  const [targetRole, setTargetRole] = useState("");
  const [githubLinks, setGithubLinks] = useState("");
  const [yearsExperience, setYearsExperience] = useState<(typeof EXPERIENCE_BANDS)[number]>("0-1");
  const [starting, setStarting] = useState(false);
  const [report, setReport] = useState<ReportResponse | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // ── Live interview state ─────────────────────────────────────────────────
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [phase, setPhase] = useState<"idle" | "listening" | "thinking" | "speaking">("idle");
  const [liveMessages, setLiveMessages] = useState<LiveMessage[]>([]);
  const [partial, setPartial] = useState("");
  const [sprint, setSprint] = useState(1);
  const [persona, setPersona] = useState("curious_lead");
  const [questionCount, setQuestionCount] = useState(0);
  const [micLevel, setMicLevel] = useState(0);
  const [liveStarted, setLiveStarted] = useState(false);
  const [liveComplete, setLiveComplete] = useState(false);
  const [liveError, setLiveError] = useState("");
  const [showCamera, setShowCamera] = useState(false);
  const [bootingMode, setBootingMode] = useState(false);

  // ── Refs ─────────────────────────────────────────────────────────────────
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
  const openingQuestionRef = useRef("");

  // ── Load config + profile ────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true); setLoadError(null);
      try {
        const [configRes, profileRes] = await Promise.all([
          api.get<ConfigResponse>("/api/antigravity/config"),
          api.get<{ profile: ProfileShape | null }>("/api/users/job-seeker-profile"),
        ]);
        if (cancelled) return;
        const nextProfile = profileRes?.profile ?? null;
        setConfigured(Boolean(configRes?.configured));
        setProfile(nextProfile);
        setResume(buildResumeSeed(nextProfile));
        setTargetRole((nextProfile?.targetJobTitle ?? nextProfile?.target_job_title ?? nextProfile?.currentRole ?? nextProfile?.current_role ?? "Software Engineer") as string);
        setYearsExperience(experienceBandFromYears(nextProfile?.experienceYears ?? nextProfile?.experience_years));
      } catch (error) {
        if (!cancelled) setLoadError(error instanceof Error ? error.message : "Could not load Antigravity module.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => { cancelled = true; };
  }, []);

  const shellUser = jobSeekerShellUser(profile, user);

  const sidebarSections = useMemo(() => [{
    sectionLabel: "Candidate",
    items: [
      { label: "Dashboard", to: "/dashboard/jobseeker", icon: <LayoutGrid className="w-[18px] h-[18px]" /> },
      { label: "Applications", to: "/dashboard/jobseeker/applications", icon: <ListChecks className="w-[18px] h-[18px]" /> },
      { label: "Saved Jobs", to: "/dashboard/jobseeker/saved", icon: <BookmarkCheck className="w-[18px] h-[18px]" /> },
      { label: "ProvenHire Resume", to: "/dashboard/jobseeker/resume", icon: <FileText className="w-[18px] h-[18px]" /> },
      { label: "Antigravity Lab", to: "/dashboard/jobseeker/antigravity", active: true, icon: <BrainCircuit className="w-[18px] h-[18px]" /> },
      { label: "Job Listings", to: "/jobs", icon: <Briefcase className="w-[18px] h-[18px]" /> },
      { label: "Settings", to: "/dashboard/settings", icon: <Settings className="w-[18px] h-[18px]" /> },
    ],
  }], []);

  // ── Live interview logic (mirrors Antigravity's interview page exactly) ──

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

  const stopCameraStream = useCallback(() => {
    if (videoRef.current?.srcObject) {
      (videoRef.current.srcObject as MediaStream).getTracks().forEach((t) => t.stop());
      videoRef.current.srcObject = null;
    }
  }, []);

  const teardownActiveSession = useCallback(() => {
    currentTurnIdRef.current = crypto.randomUUID();
    clearAnswerDraft();
    stopVisualizerRef.current?.();
    stopVisualizerRef.current = null;
    sessionRef.current?.stop();
    sessionRef.current = null;
    stopCameraStream();
  }, [clearAnswerDraft, stopCameraStream]);

  useEffect(() => () => { teardownActiveSession(); }, [teardownActiveSession]);

  // Auto-scroll transcript
  useEffect(() => {
    transcriptRef.current?.scrollTo({ top: transcriptRef.current.scrollHeight, behavior: "smooth" });
  }, [liveMessages, partial]);

  const handleFollowup = useCallback(async (
    result: Record<string, unknown>,
    preloadedAudioUrl: string | null,
    expectedTurnId: string,
    sid: string,
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

    // Silence confirmation hold
    if (!silenceConfirmedRef.current) {
      const elapsed = performance.now() - commitTimeRef.current;
      const remaining = Math.max(0, TTS_HOLD_CAP_MS - elapsed);
      if (remaining > 0) {
        await new Promise<void>((resolve) => {
          const interval = setInterval(() => {
            const speaking = sessionRef.current?.floor === FloorState.USER_SPEAKING;
            const done = silenceConfirmedRef.current || speaking || (performance.now() - commitTimeRef.current >= TTS_HOLD_CAP_MS);
            if (done) { clearInterval(interval); resolve(); }
          }, 40);
          setTimeout(() => { clearInterval(interval); resolve(); }, remaining);
        });
      }
    }

    const floorAfterHold = sessionRef.current?.floor as FloorState | undefined;
    if (floorAfterHold === FloorState.USER_SPEAKING || expectedTurnId !== currentTurnIdRef.current) {
      if (preloadedAudioUrl) URL.revokeObjectURL(preloadedAudioUrl);
      return;
    }

    // Commit UI state
    if (pivoting) {
      setLiveMessages((prev) => [...prev, { role: "ai", text: "Moving to a different area.", isPivotMarker: true }]);
    }
    if (newSprint !== prevSprintRef.current) {
      prevSprintRef.current = newSprint;
      setSprint(newSprint);
      setPersona(newPersona);
      setLiveMessages((prev) => [...prev, { role: "ai", text: `Sprint ${newSprint} — ${SPRINT_LABELS[newSprint]}`, isSprintMarker: true, sprint: newSprint }]);
    }
    setLiveMessages((prev) => [...prev, { role: "ai", text, severity: weakness?.severity }]);
    setQuestionCount((c) => c + 1);

    const ac = new AbortController();
    sessionRef.current?.setAbortController(ac);
    sessionRef.current?.setActivePlaybackText(text);
    sessionRef.current?.transition(FloorState.AI_SPEAKING);

    try { await playAudioUrl(preloadedAudioUrl, text, ac.signal); } catch {}

    if (expectedTurnId !== currentTurnIdRef.current) return;

    // Drain period: prevent TTS reverb from bleeding into mic
    await new Promise<void>((r) => setTimeout(r, 300));
    if (expectedTurnId !== currentTurnIdRef.current) return;

    if (isComplete) {
      sessionRef.current?.transition(FloorState.IDLE);
      setLiveComplete(true);
      sessionRef.current?.stop();
      try {
        await fetch(`/api/antigravity/end/${encodeURIComponent(sid)}`, {
          method: "POST",
          headers: { Authorization: `Bearer ${(await import("@/lib/api")).getAuthToken()}` },
        });
        const reportData = await api.get<ReportResponse>(`/api/antigravity/report/${sid}`);
        setReport(reportData);
      } catch {}
      trackInterviewEvent(sid, "ui_interview_complete", { sprint: newSprint }, "frontend.ui");
      setTimeout(() => { setSessionId(null); setLiveStarted(false); }, 2500);
    } else {
      beginUserTurn(sessionRef.current);
    }
  }, [beginUserTurn]);

  const commitAnswerDraft = useCallback(async (session: InterviewSession, turnId: string, sid: string) => {
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
    setLiveMessages((prev) => {
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
        liveDraft.pendingRevision && liveDraft.submittedText !== liveDraft.textParts.join(" ").replace(/\s+/g, " ").trim()
      );
    };

    try {
      const result = await processTurn(sid, mergedText, mergedEntities, turnId);
      if (isRevisionStale() || result.turn_id !== currentTurnIdRef.current && result.turn_id) return;
      const responseTurnId = typeof result.turn_id === "string" ? result.turn_id : turnId;
      if (responseTurnId !== currentTurnIdRef.current) return;
      const audioUrl = await prefetchAudio(result.response as string, sid);
      if (isRevisionStale() || responseTurnId !== currentTurnIdRef.current) { if (audioUrl) URL.revokeObjectURL(audioUrl); return; }
      clearAnswerDraft();
      await handleFollowup(result, audioUrl, responseTurnId, sid);
    } catch {
      setLiveError("Agent pipeline error. Check backend.");
      beginUserTurn(session);
    } finally {
      processingRef.current = false;
      const pendingDraft = answerDraftRef.current;
      if (pendingDraft && pendingDraft.turnId === turnId && pendingDraft.pendingRevision) {
        pendingDraft.pendingRevision = false;
        pendingDraft.commitTimer = setTimeout(() => { void commitAnswerDraft(session, turnId, sid); }, 150);
      }
    }
  }, [beginUserTurn, clearAnswerDraft, handleFollowup]);

  const queueAnswerChunk = useCallback((session: InterviewSession, text: string, entities: string[], sid: string) => {
    const cleaned = text.trim();
    if (!cleaned) return;
    const turnId = session.getActiveTurnId() || crypto.randomUUID();
    session.setActiveTurnId(turnId);
    currentTurnIdRef.current = turnId;

    let draft = answerDraftRef.current;
    if (!draft || draft.turnId !== turnId) {
      clearAnswerDraft();
      draft = { turnId, textParts: [], entitySet: new Set(), submittedText: null, pendingRevision: false, requestVersion: 0, messageIndex: null, commitTimer: null };
      answerDraftRef.current = draft;
    }

    const previousPart = draft.textParts[draft.textParts.length - 1];
    if (previousPart !== cleaned) draft.textParts.push(cleaned);
    entities.forEach((e) => draft!.entitySet.add(e));
    setPartial(draft.textParts.join(" "));

    if (draft.submittedText !== null && silenceConfirmedRef.current) {
      silenceConfirmedRef.current = false;
      commitTimeRef.current = performance.now();
    }

    if (draft.commitTimer) clearTimeout(draft.commitTimer);
    draft.commitTimer = setTimeout(() => { void commitAnswerDraft(session, turnId, sid); }, ANSWER_SETTLE_MS);
  }, [clearAnswerDraft, commitAnswerDraft]);

  async function bootInterview(sid: string, openingQuestion: string) {
    setLiveError("");
    setLiveStarted(true);
    setLiveComplete(false);
    setBootingMode(true);
    prevSprintRef.current = 1;
    processingRef.current = false;

    const openingAudioUrl = openingQuestion ? await prefetchAudio(openingQuestion) : null;

    const session = new InterviewSession(sid);
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
      try { await playAudioUrl(nudgeUrl, nudgeText, ac.signal); } catch {}
      beginUserTurn(session);
    };

    session.onPartial = (text) => { setPartial(text); };

    session.onFinal = async (text, entities, metadata) => {
      silenceConfirmedRef.current = metadata?.reason === "utterance_end";
      queueAnswerChunk(session, text, entities, sid);
    };

    session.onError = (err) => { setLiveError(`Voice error: ${err}`); };

    try {
      await session.start();
      stopVisualizerRef.current = session.connectVisualizer((level) => setMicLevel(level));

      if (showCamera && videoRef.current) {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ video: true });
          videoRef.current.srcObject = stream;
          await session.startVision(videoRef.current);
        } catch {}
      }

      if (openingQuestion) {
        const ac = new AbortController();
        session.setAbortController(ac);
        session.setActivePlaybackText(openingQuestion);
        session.transition(FloorState.AI_SPEAKING);
        await playAudioUrl(openingAudioUrl, openingQuestion, ac.signal);
        beginUserTurn(session);
      } else {
        beginUserTurn(session);
      }
    } catch (e) {
      setLiveError(`Could not start mic: ${String(e)}`);
      setLiveStarted(false);
      setPhase("idle");
    } finally {
      setBootingMode(false);
    }
  }

  async function handleStartInterview() {
    setActionError(null);
    if (!resume.trim()) { setActionError("Paste a resume summary or use the autofill seed before starting."); return; }
    if (!targetRole.trim()) { setActionError("Add the target role so Antigravity can calibrate the interview."); return; }

    setStarting(true);
    // Warm-up message shown after 4s if service hasn't responded yet (Render cold start ~60s)
    const warmupTimer = setTimeout(() => {
      setActionError("Service is warming up — this takes up to 60s on first launch. Hang tight...");
    }, 4000);

    try {
      const ac = new AbortController();
      const coldStartTimeout = setTimeout(() => ac.abort(), 150_000);
      let res: Response;
      try {
        res = await fetch("/api/antigravity/start", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${getAuthToken()}` },
          body: JSON.stringify({
            resume,
            githubLinks: githubLinks.split("\n").map((l) => l.trim()).filter(Boolean),
            targetRole: targetRole.trim(),
            yearsExperience,
          }),
          signal: ac.signal,
        });
      } finally {
        clearTimeout(coldStartTimeout);
      }
      if (!res.ok) throw new Error(`Service returned ${res.status}`);
      const data: StartResponse = await res.json();
      setSessionId(data.session_id);
      setSprint(data.sprint);
      setPersona("curious_lead");
      setQuestionCount(1);
      setReport(null);
      setLiveMessages([
        { role: "ai", text: `Sprint ${data.sprint} — ${data.sprint_name ?? SPRINT_LABELS[data.sprint] ?? "Interview"}`, isSprintMarker: true, sprint: data.sprint },
        { role: "ai", text: data.opening_question },
      ]);
      openingQuestionRef.current = data.opening_question;
      clearTimeout(warmupTimer);
      setActionError(null);
    } catch (error) {
      clearTimeout(warmupTimer);
      const msg = error instanceof Error ? error.message : "Could not start Antigravity interview.";
      setActionError(msg.includes("aborted") ? "Service took too long to respond. Try again in a moment." : msg);
    } finally {
      setStarting(false);
    }
  }

  async function handleEndInterview() {
    const sid = sessionId;
    if (!sid) return;
    teardownActiveSession();
    try {
      const { getAuthToken } = await import("@/lib/api");
      await fetch(`/api/antigravity/end/${encodeURIComponent(sid)}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${getAuthToken()}` },
      });
      const reportData = await api.get<ReportResponse>(`/api/antigravity/report/${sid}`);
      setReport(reportData);
    } catch {}
    setSessionId(null);
    setLiveStarted(false);
  }

  function resetModule() {
    teardownActiveSession();
    setSessionId(null);
    setLiveMessages([]);
    setPartial("");
    setPersona("curious_lead");
    setQuestionCount(0);
    setSprint(1);
    setReport(null);
    setActionError(null);
    setLiveError("");
    setLiveStarted(false);
    setLiveComplete(false);
    setPhase("idle");
    prevSprintRef.current = 1;
    processingRef.current = false;
  }

  const progressPct = Math.min((questionCount / 15) * 100, 100);
  const scorePercent = report?.overall_score != null ? Math.max(0, Math.min(100, report.overall_score * 10)) : 0;

  // ── Full-screen live interview overlay ────────────────────────────────────
  if (sessionId) {
    return (
      <div className="fixed inset-0 z-50 bg-[#0a0a0a] text-white flex flex-col select-none">

        {/* Top bar */}
        <header className="flex items-center justify-between px-6 py-4 border-b border-white/5">
          <div className="flex items-center gap-3">
            <span className="text-sm font-semibold tracking-tight">Antigravity</span>
            {liveStarted && (
              <span className="text-xs px-2 py-0.5 rounded-md bg-white/5 text-zinc-400">
                Sprint {sprint} — {SPRINT_LABELS[sprint]}
              </span>
            )}
          </div>
          <div className="flex items-center gap-4">
            {!liveStarted && (
              <button
                onClick={() => setShowCamera(!showCamera)}
                className={`flex items-center gap-2 px-3 py-1 rounded-full border transition-all text-[11px] ${
                  showCamera ? "bg-white/10 border-white/20 text-white" : "border-white/5 text-zinc-500 hover:border-white/10"
                }`}
              >
                <div className={`w-1.5 h-1.5 rounded-full ${showCamera ? "bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]" : "bg-zinc-700"}`} />
                Lens {showCamera ? "ON" : "OFF"}
              </button>
            )}
            {liveStarted && (
              <div className="flex items-center gap-2">
                <div className="w-20 h-[3px] bg-white/10 rounded-full overflow-hidden">
                  <div className="h-full bg-white/60 rounded-full transition-all duration-700" style={{ width: `${progressPct}%` }} />
                </div>
                <span className="text-[11px] text-zinc-600 tabular-nums">{questionCount}/15</span>
              </div>
            )}
            {liveStarted && !liveComplete && (
              <button onClick={() => void handleEndInterview()} className="text-[11px] text-zinc-600 hover:text-red-400 transition-colors">
                End
              </button>
            )}
          </div>
        </header>

        <div className="flex flex-1 overflow-hidden">
          {/* Left: AI panel */}
          <div className="w-80 flex-shrink-0 border-r border-white/5 flex flex-col items-center justify-center gap-6 px-6">
            <div className="relative w-full aspect-square max-w-[200px] flex items-center justify-center">
              {showCamera && (
                <div className="absolute inset-0 rounded-full overflow-hidden border border-white/5 bg-black/40 mix-blend-screen opacity-40 grayscale">
                  <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover scale-x-[-1]" />
                </div>
              )}
              <AIOrb state={phase} />
            </div>
            <div className="text-center space-y-1">
              <p className="text-xs font-medium text-zinc-300">
                {phase === "idle" && !liveStarted && "Ready"}
                {phase === "listening" && "Listening"}
                {phase === "thinking" && "Analyzing..."}
                {phase === "speaking" && "Speaking"}
              </p>
              {liveStarted && (
                <p className="text-[11px] text-zinc-600 font-mono tracking-wider">{PERSONA_DESC[persona] ?? persona}</p>
              )}
            </div>
            {phase === "listening" && <Waveform level={micLevel} active />}
            {liveStarted && showCamera && (
              <div className="mt-8 px-3 py-2 rounded-lg bg-white/[0.02] border border-white/[0.05]">
                <p className="text-[9px] text-zinc-600 uppercase tracking-widest text-center">Lens Active</p>
              </div>
            )}
          </div>

          {/* Right: Transcript */}
          <div className="flex-1 flex flex-col overflow-hidden relative">
            <div
              ref={transcriptRef}
              className="flex-1 overflow-y-auto px-10 py-8 space-y-6 relative"
            >
              {!liveStarted && (
                <div className="flex items-center justify-center h-full">
                  <div className="text-center space-y-4 max-w-sm">
                    <div className="w-12 h-12 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center mx-auto mb-6">
                      <span className="text-xl">∞</span>
                    </div>
                    <h2 className="text-lg font-medium text-zinc-200">Antigravity Protocol</h2>
                    <p className="text-zinc-500 text-sm leading-relaxed">
                      3 sprints. No validation. Only the boundary of your reasoning exists here.
                    </p>
                    <p className="text-zinc-700 text-[10px] uppercase tracking-[0.2em] pt-4">
                      Probe → Break → Analyze → Adapt
                    </p>
                  </div>
                </div>
              )}

              {liveMessages.map((msg, i) => (
                <LiveMessageItem key={i} msg={msg} />
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

              {liveComplete && (
                <div className="text-center py-12 space-y-2 animate-in fade-in slide-in-from-bottom-2 duration-1000">
                  <div className="inline-block px-3 py-1 rounded-full bg-green-500/10 border border-green-500/20 text-green-500 text-[10px] mb-2 uppercase tracking-widest">
                    Complete
                  </div>
                  <p className="text-zinc-200 text-sm font-medium">Session Terminated.</p>
                  <p className="text-zinc-500 text-[11px]">Compiling adversarial report and reasoning metrics...</p>
                </div>
              )}
            </div>

            {/* Bottom action bar */}
            <div className="border-t border-white/5 px-10 py-6 flex items-center justify-between bg-[#0a0a0a]/80 backdrop-blur-xl">
              {liveError ? (
                <div className="flex items-center gap-2 text-red-400 text-[11px] animate-pulse">
                  <div className="w-1 h-1 rounded-full bg-red-400" />
                  {liveError}
                </div>
              ) : <span />}

              {!liveStarted ? (
                <button
                  onClick={() => void bootInterview(sessionId, openingQuestionRef.current)}
                  disabled={bootingMode}
                  className="ml-auto bg-white text-black text-[13px] font-semibold px-8 py-3 rounded-full hover:bg-zinc-100 transition-all hover:scale-105 active:scale-95 shadow-lg shadow-white/10 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
                >
                  {bootingMode ? "Preparing..." : "Engage System →"}
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
                  <span className="text-zinc-600 tabular-nums uppercase text-[10px]">
                    Turn: {currentTurnIdRef.current.slice(0, 8)}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Setup / report mode (inside DashboardShell) ───────────────────────────
  return (
    <div className="min-h-screen">
      <DashboardShell
        sidebarSections={sidebarSections}
        user={{ name: shellUser.name, role: "Adversarial interview lab", initials: shellUser.initials }}
      >
        <div className="dashboard-section-content space-y-6">
          <section className="overflow-hidden rounded-[28px] border border-sky-500/20 bg-[radial-gradient(circle_at_top_left,_rgba(56,189,248,0.18),_transparent_38%),linear-gradient(135deg,_rgba(4,7,18,1),_rgba(12,18,36,0.94)_50%,_rgba(8,12,26,1))] p-6 md:p-8">
            <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
              <div className="max-w-2xl space-y-4">
                <Badge className="border-sky-400/30 bg-sky-500/10 text-sky-200 hover:bg-sky-500/10">
                  Adversarial AI Interview
                </Badge>
                <div className="space-y-2">
                  <h1 className="text-3xl font-semibold tracking-tight text-white md:text-4xl">
                    Antigravity Interview Lab
                  </h1>
                  <p className="max-w-xl text-sm leading-6 text-slate-300">
                    Full adversarial interview engine with voice, speculative probing, and real-time weakness detection.
                    3 sprints · 15 questions · Grounded in your resume.
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3 text-left">
                {[{ label: "Sprint 1", value: "Defense" }, { label: "Sprint 2", value: "Foundations" }, { label: "Sprint 3", value: "Systems" }].map((item) => (
                  <div key={item.label} className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3">
                    <div className="text-[11px] uppercase tracking-[0.2em] text-slate-400">{item.label}</div>
                    <div className="mt-1 text-sm font-medium text-white">{item.value}</div>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {loading ? (
            <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
              <Skeleton className="h-[420px] rounded-3xl" />
              <Skeleton className="h-[420px] rounded-3xl" />
            </div>
          ) : (
            <div className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
              <div className="space-y-6">
                {!configured && (
                  <Card className="border-amber-500/30 bg-amber-500/10">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2 text-amber-100">
                        <ShieldAlert className="h-5 w-5" />
                        Antigravity engine not configured
                      </CardTitle>
                      <CardDescription className="text-amber-100/80">
                        Set <code>ANTIGRAVITY_API_BASE_URL</code> on the ProvenHire server to point at a running Antigravity service.
                      </CardDescription>
                    </CardHeader>
                  </Card>
                )}

                {loadError && (
                  <Card className="border-red-500/30 bg-red-500/10">
                    <CardContent className="pt-6 text-sm text-red-100">{loadError}</CardContent>
                  </Card>
                )}

                {!report && (
                  <Card className="border-[var(--dash-navy-border)] bg-[var(--dash-navy-mid)]">
                    <CardHeader>
                      <CardTitle className="text-white">Launch Antigravity session</CardTitle>
                      <CardDescription>
                        Refine the resume seed, pick a target role, then engage — the full voice interview starts immediately.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-5">
                      <div className="grid gap-4 md:grid-cols-2">
                        <div className="space-y-2">
                          <label className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Target Role</label>
                          <Input value={targetRole} onChange={(e) => setTargetRole(e.target.value)} placeholder="ML Engineer" />
                        </div>
                        <div className="space-y-2">
                          <label className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Experience Band</label>
                          <div className="grid grid-cols-5 gap-2">
                            {EXPERIENCE_BANDS.map((band) => (
                              <button
                                key={band} type="button" onClick={() => setYearsExperience(band)}
                                className={`rounded-xl border px-3 py-2 text-sm transition ${
                                  yearsExperience === band
                                    ? "border-sky-400/60 bg-sky-500/10 text-sky-100"
                                    : "border-white/10 bg-white/[0.03] text-slate-300 hover:border-white/20"
                                }`}
                              >
                                {band}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <label className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Resume Context</label>
                        <Textarea value={resume} onChange={(e) => setResume(e.target.value)} placeholder="Paste resume text or refine the profile seed..." className="min-h-[200px]" />
                      </div>

                      <div className="space-y-2">
                        <label className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">GitHub Links</label>
                        <Textarea value={githubLinks} onChange={(e) => setGithubLinks(e.target.value)} placeholder="One URL per line" className="min-h-[80px]" />
                      </div>

                      {actionError && (
                        <div className="rounded-2xl border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm text-red-100">{actionError}</div>
                      )}

                      <div className="flex flex-wrap items-center gap-3">
                        <Button onClick={() => void handleStartInterview()} disabled={!configured || starting} className="bg-sky-500 text-slate-950 hover:bg-sky-400">
                          {starting ? "Preparing session..." : "Launch Antigravity"}
                        </Button>
                        <Button type="button" variant="outline" onClick={() => setResume(buildResumeSeed(profile))} className="border-white/15 bg-white/[0.03] text-slate-200 hover:bg-white/[0.06]">
                          Refresh Profile Seed
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                )}

                {report && (
                  <Card className="border-[var(--dash-navy-border)] bg-[var(--dash-navy-mid)]">
                    <CardHeader>
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <CardTitle className="text-white">Antigravity evaluation report</CardTitle>
                          <CardDescription>{report.target_role || targetRole} · {report.years_experience || yearsExperience} yrs band</CardDescription>
                        </div>
                        <Badge className={`hover:opacity-100 ${
                          report.hire_recommendation === "HIRE" ? "border-emerald-400/25 bg-emerald-500/10 text-emerald-200"
                          : report.hire_recommendation === "NO HIRE" ? "border-red-400/25 bg-red-500/10 text-red-200"
                          : "border-sky-400/25 bg-sky-500/10 text-sky-200"
                        }`}>
                          {report.hire_recommendation ?? "Pending"}
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-5">
                      <div className="grid gap-4 md:grid-cols-3">
                        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                          <div className="text-xs uppercase tracking-[0.18em] text-slate-400">Overall Score</div>
                          <div className="mt-2 text-3xl font-semibold text-white">
                            {report.overall_score != null ? `${report.overall_score}/10` : "—"}
                          </div>
                          <div className="mt-3"><Progress value={scorePercent} className="h-2 bg-white/10" /></div>
                        </div>
                        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                          <div className="text-xs uppercase tracking-[0.18em] text-slate-400">Questions</div>
                          <div className="mt-2 text-3xl font-semibold text-white">{report.total_questions}</div>
                        </div>
                        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                          <div className="text-xs uppercase tracking-[0.18em] text-slate-400">Confidence</div>
                          <div className="mt-2 text-3xl font-semibold text-white">
                            {report.confidence_score != null ? `${Math.round(report.confidence_score * 100)}%` : "—"}
                          </div>
                        </div>
                      </div>

                      {report.summary && (
                        <div className="rounded-2xl border border-sky-400/20 bg-sky-500/10 p-4 text-sm leading-6 text-slate-100">{report.summary}</div>
                      )}

                      {report.claim_credibility_risk && report.claim_credibility_risk.level !== "not_tested" && (
                        <div className="rounded-2xl border border-amber-400/20 bg-amber-500/10 p-4">
                          <div className="text-xs uppercase tracking-[0.18em] text-amber-200">Claim Credibility</div>
                          <div className="mt-2 text-sm font-medium capitalize text-white">{report.claim_credibility_risk.level} risk</div>
                          <div className="mt-2 text-sm leading-6 text-slate-200">{report.claim_credibility_risk.detail}</div>
                        </div>
                      )}

                      {Object.keys(report.scores ?? {}).length > 0 && (
                        <div className="grid gap-4 md:grid-cols-2">
                          {Object.entries(report.scores).map(([key, value]) => (
                            <div key={key} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                              <div className="text-xs uppercase tracking-[0.18em] text-slate-400">{formatDimensionLabel(key)}</div>
                              <div className="mt-2 text-2xl font-semibold text-white">{typeof value === "number" ? `${value}/10` : value}</div>
                            </div>
                          ))}
                        </div>
                      )}

                      <div className="grid gap-4 md:grid-cols-2">
                        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                          <div className="flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-emerald-300">
                            <Sparkles className="h-4 w-4" /> Strengths
                          </div>
                          <div className="mt-3 space-y-2 text-sm text-slate-100">
                            {report.strengths?.length ? report.strengths.map((item) => <div key={item}>• {item}</div>) : <div>No strengths captured.</div>}
                          </div>
                        </div>
                        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                          <div className="flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-rose-300">
                            <ShieldAlert className="h-4 w-4" /> Risk Flags
                          </div>
                          <div className="mt-3 space-y-2 text-sm text-slate-100">
                            {report.risk_flags?.length ? report.risk_flags.map((item) => <div key={item}>• {item}</div>) : <div>No risk flags captured.</div>}
                          </div>
                        </div>
                      </div>

                      {report.untested_dimensions?.length > 0 && (
                        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                          <div className="flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-slate-300">
                            <Radar className="h-4 w-4" /> Untested Dimensions
                          </div>
                          <div className="mt-3 flex flex-wrap gap-2">
                            {report.untested_dimensions.map((item) => (
                              <Badge key={item} variant="outline" className="border-white/15 text-slate-300">{item}</Badge>
                            ))}
                          </div>
                        </div>
                      )}

                      <div className="flex flex-wrap gap-3">
                        <Button onClick={resetModule} className="bg-sky-500 text-slate-950 hover:bg-sky-400">Start another session</Button>
                        <Button asChild variant="outline" className="border-white/15 bg-white/[0.03] text-slate-200 hover:bg-white/[0.06]">
                          <Link to="/dashboard/jobseeker/resume">Review ProvenHire resume <ArrowRight className="ml-2 h-4 w-4" /></Link>
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>

              <div className="space-y-6">
                <Card className="border-[var(--dash-navy-border)] bg-[var(--dash-navy-mid)]">
                  <CardHeader>
                    <CardTitle className="text-white">How it works</CardTitle>
                    <CardDescription>Voice-first adversarial engine inside ProvenHire.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4 text-sm leading-6 text-slate-300">
                    <div>1. Antigravity parses your resume and builds a 3-sprint trajectory map before the first question.</div>
                    <div>2. You speak — Deepgram transcribes in real time. Partial transcripts pre-warm the next question.</div>
                    <div>3. Background agents detect weaknesses, discrepancies, and reasoning patterns concurrently.</div>
                    <div>4. The fast path replies in &lt;500ms using pre-staged questions. The slow path sharpens the follow-up.</div>
                    <div>5. DeepSeek R1 produces the final multi-pass evaluation report.</div>
                  </CardContent>
                </Card>

                <Card className="border-[var(--dash-navy-border)] bg-[var(--dash-navy-mid)]">
                  <CardHeader>
                    <CardTitle className="text-white">Engine status</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3 text-sm text-slate-300">
                    {[
                      { label: "Engine configured", value: configured ? "Yes" : "No", ok: configured },
                      { label: "Voice (Deepgram)", value: configured ? "Ready" : "Needs engine", ok: configured },
                      { label: "TTS (ElevenLabs)", value: configured ? "Ready" : "Needs engine", ok: configured },
                    ].map(({ label, value, ok }) => (
                      <div key={label} className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3">
                        <span>{label}</span>
                        <Badge variant="outline" className={ok ? "border-emerald-400/25 text-emerald-300" : "border-rose-400/25 text-rose-300"}>{value}</Badge>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              </div>
            </div>
          )}
        </div>
      </DashboardShell>
    </div>
  );
}
