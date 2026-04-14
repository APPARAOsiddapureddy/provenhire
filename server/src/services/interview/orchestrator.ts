import { Prisma } from "@prisma/client";
import { prisma } from "../../config/prisma.js";
import { recordAiInterviewSubmittedForAdminReview } from "../humanInterviewGate.service.js";
import { syncJobSeekerVerificationStatus } from "../certification.service.js";
import { analyzeAnswerAntiGaming } from "../aiInterviewAntiGaming.service.js";
import {
  aggregateProctoringViolations,
  integrityFlagFromAntiGamingPoints,
  integrityFlagFromViolationAggregate,
  interviewProctoringViolationTotal,
  mergeIntegrityFlags,
} from "../aiInterviewProctoringRisk.service.js";
import {
  extractConcepts,
  detectWeakness,
  checkDiscrepancy,
  evaluateReasoning,
  generateWeaknessFollowup,
  generateDiscrepancyFollowup,
  generateSprintQuestion,
  prefetchFollowups,
  adaptFollowupFast,
  applyReasoningHonestyCap,
} from "./agents.js";
import { findFollowupsForQuestionText } from "./questionBankService.js";
import { computeWeaknessCoverageRatio, evaluateFullInterviewMultiPass } from "./evaluationService.js";
import {
  detectDataSubtrack,
  detectNonTechSubtrack,
  type DataSubtrack,
  type NonTechSubtrack,
} from "../../constants/verificationPipeline.js";

const QUESTIONS_PER_SPRINT = 5;
const MAX_QUESTIONS = 15;
const MAX_INTERVIEW_MINUTES = 30;

export type InterviewCompletionReason = "questions_exhausted" | "time_limit" | "sprint_3_complete" | null;

function isInterviewComplete(state: {
  questionCount: number;
  sprint: number;
  sprintQuestionCount: number;
  interviewStartTime?: number;
}): { complete: boolean; reason: InterviewCompletionReason } {
  if (state.questionCount >= MAX_QUESTIONS) {
    return { complete: true, reason: "questions_exhausted" };
  }

  if (state.sprint === 3 && state.sprintQuestionCount >= QUESTIONS_PER_SPRINT) {
    return { complete: true, reason: "sprint_3_complete" };
  }

  const start =
    typeof state.interviewStartTime === "number" && Number.isFinite(state.interviewStartTime)
      ? state.interviewStartTime
      : Date.now();
  const elapsedMs = Date.now() - start;
  const elapsedMinutes = elapsedMs / 60_000;
  if (elapsedMinutes >= MAX_INTERVIEW_MINUTES) {
    return { complete: true, reason: "time_limit" };
  }

  return { complete: false, reason: null };
}

const SPRINTS: Record<number, { name: string; persona: string }> = {
  1: { name: "Project Defense", persona: "curious_lead" },
  2: { name: "Foundations", persona: "socratic_mentor" },
  3: { name: "System Design", persona: "senior_peer" },
};

/** First question per sprint: medium length for TTS, plain English, India-first clarity (same rubric as dynamic questions). */
const SPRINT_OPENERS: Record<number, string> = {
  1: `I want to anchor in real work you shipped. Pick one project you are proud of: what problem it solved, what you personally built or owned, and what made the technical side interesting. Stay concrete — names, constraints, and outcomes help me follow.`,
  2: `Go one level deeper on concepts. Choose one technical idea that was central to that work — something you had to get right, not hand-waving. Explain it as if I am strong but new to that stack: what it does, why you needed it, and where it gets subtle.`,
  3: `Let us stress-test design instincts. Imagine you must serve low-latency predictions to millions of users as load grows. Where would you start designing, and what do you think breaks first — latency, consistency, cost, or operations?`,
};

const NON_TECH_SPRINTS: Record<number, { name: string; persona: string }> = {
  1: { name: "Experience Defense", persona: "curious_lead" },
  2: { name: "Domain Foundations", persona: "socratic_mentor" },
  3: { name: "Scenario", persona: "senior_peer" },
};

const NON_TECH_OPENERS: Record<number, string> = {
  1: `Start with something real you owned. Describe work you are proud of — a project, internship, or initiative. What was your role, what problem did you solve for users or the business, and what did you learn that you would apply again?`,
  2: `Go deeper on how you decide under ambiguity. Pick one framework, principle, or habit you actually use — not a buzzword. Walk me through one real situation where you applied it, what trade-offs you faced, and how you knew you were done.`,
  3: `Scenario: a tough deadline, unclear priorities, and stakeholders pulling in different directions. What would you clarify first, how would you sequence the first week, and how would you communicate so execution does not stall?`,
};

const DATA_SPRINTS: Record<number, { name: string; persona: string }> = {
  1: { name: "Data Project Defense", persona: "curious_lead" },
  2: { name: "Data Foundations", persona: "socratic_mentor" },
  3: { name: "Data Systems & Scale", persona: "senior_peer" },
};

const DATA_OPENERS: Record<number, string> = {
  1: `Anchor in a data project you are proud of. What business or analytics problem was it, which data sources and transformations mattered, what you shipped, and what you personally owned end to end?`,
  2: `Pick one technical idea that was central to that work — something you had to understand to ship a correct pipeline, metric, or model. Explain it to a strong engineer who does not know your domain: inputs, outputs, and where correctness gets hard.`,
  3: `Imagine you must serve reliable, fresh analytics or features to downstream teams at serious scale — latency, cost, and data quality all bite. Where would you start designing that system, and what breaks first as volume or consumers grow?`,
};

/** Spoken after each accepted answer, before the next question (TTS only; not stored on InterviewMessage). */
const TURN_ACKNOWLEDGEMENTS = [
  "Got it.",
  "I see.",
  "Interesting.",
  "That makes sense.",
  "Okay.",
  "Fair enough.",
  "Alright.",
  "Right.",
] as const;

function pickTurnAcknowledgement(): string {
  return TURN_ACKNOWLEDGEMENTS[Math.floor(Math.random() * TURN_ACKNOWLEDGEMENTS.length)]!;
}

/** Prefetch queue for partial-transcript warm-up; bounded TTL/size so the server cannot leak memory across interviews. */
type PrefetchCacheEntry = { questions: string[]; expiresAt: number };
const prefetchCache: Map<string, PrefetchCacheEntry> = new Map();
const PREFETCH_CACHE_TTL_MS = 45 * 60_000;
const MAX_PREFETCH_CACHE_KEYS = 1_500;

function prunePrefetchCacheIfNeeded(): void {
  if (prefetchCache.size <= MAX_PREFETCH_CACHE_KEYS) return;
  const now = Date.now();
  for (const [id, entry] of prefetchCache) {
    if (now > entry.expiresAt) prefetchCache.delete(id);
  }
  while (prefetchCache.size > MAX_PREFETCH_CACHE_KEYS) {
    const oldest = prefetchCache.keys().next().value as string | undefined;
    if (!oldest) break;
    prefetchCache.delete(oldest);
  }
}

function getPrefetchEntry(interviewId: string): PrefetchCacheEntry | undefined {
  const e = prefetchCache.get(interviewId);
  if (!e) return undefined;
  if (Date.now() > e.expiresAt) {
    prefetchCache.delete(interviewId);
    return undefined;
  }
  return e;
}

function setPrefetchQuestions(interviewId: string, questions: string[]): void {
  prunePrefetchCacheIfNeeded();
  prefetchCache.set(interviewId, { questions, expiresAt: Date.now() + PREFETCH_CACHE_TTL_MS });
}

function popPrefetchQuestion(interviewId: string): string | undefined {
  const e = getPrefetchEntry(interviewId);
  if (!e?.questions.length) return undefined;
  const next = e.questions.shift();
  if (!next) return undefined;
  if (e.questions.length === 0) prefetchCache.delete(interviewId);
  return next;
}

/** If Gemini keeps emitting the same short probe, use a different angle without another model round-trip. */
const DISTINCT_FALLBACK_QUESTIONS: string[] = [
  "What was the hardest production bug or incident you debugged on that system, and what did you change afterward so it would not repeat?",
  "If you rebuilt it today with what you know now, what would you simplify first, and what would you definitely keep?",
  "Which part of that design or implementation would you least like to defend in depth if a senior engineer pressed you — and why?",
  "What trade-off did teammates question that you still believe was right for your constraints?",
  "How would you prove in production — not on paper — that the design actually held under real load?",
  "If traffic or data jumped tenfold overnight, what breaks first in your approach, and what is the first change you would make?",
];

function firstNonDuplicateFromPool(asked: string[]): string | null {
  for (const f of DISTINCT_FALLBACK_QUESTIONS) {
    if (!isNearDuplicateQuestion(f, asked)) return f;
  }
  return null;
}

async function resolveDistinctQuestion(asked: string[], generate: () => Promise<string>): Promise<string> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const q = (await generate()).trim();
    const candidate = q || "Could you unpack that with one concrete example?";
    if (!isNearDuplicateQuestion(candidate, asked)) return candidate;
    const fromPool = firstNonDuplicateFromPool(asked);
    if (fromPool) return fromPool;
  }
  const last = (await generate()).trim();
  return last || DISTINCT_FALLBACK_QUESTIONS[0]!;
}

/** Same weakness type probed with severity high twice in a row → force sprint breadth. */
const MAX_CONSECUTIVE_HIGH_SAME_TYPE = 2;

type FollowupBranch =
  | "discrepancy_probe"
  | "weakness_probe"
  | "followup_deepen"
  | "prefetch"
  | "sprint_question"
  | "forced_sprint";

type TurnLogEntry = {
  turnId: string;
  questionIndex: number;
  weaknessSeverity: string;
  followupDecision: FollowupBranch | "fast_path";
  questionSource: string;
  agentOutputsSnapshot: string;
  timestamp: string;
  whisperLatencyMs?: number | null;
  agentPipelineMs?: number | null;
  questionGenerationMs?: number | null;
  totalTurnLatencyMs?: number | null;
  answerLengthChars?: number;
  pasteCount?: number;
  timeToSubmitSeconds?: number | null;
  answerSnapshot?: string;
  echoGuardTriggered?: boolean;
  agentCacheHit?: boolean;
  /** Set when async slow path finishes merging agent telemetry into this turn. */
  slowPathComplete?: boolean;
  /** Populated if the async slow path throws after the HTTP response was sent. */
  slowPathError?: string;
};

/** Staging only — written by async slow path; consumed by fast path when fresh (JSON in questionPlan). */
export type PreppedTurnAnalysis = {
  weakness: unknown | null;
  discrepancy: unknown | null;
  reasoning: unknown | null;
};

type AdversarialState = {
  sprint: number;
  persona: string;
  sprintName: string;
  /** When true, use non-technical sprint names and openers (persisted in questionPlan). */
  trackNonTechnical?: boolean;
  nonTechSubtrack?: NonTechSubtrack;
  /** When true, use data-calibrated sprint names, openers, and question generation (roleType === "data"). */
  trackData?: boolean;
  dataSubtrack?: DataSubtrack;
  questionCount: number;
  sprintQuestionCount: number;
  history: {
    question: string;
    answer: string;
    weakness?: unknown;
    concepts?: string[];
    discrepancy?: unknown;
    reasoning?: unknown;
    sprint: number;
    persona: string;
  }[];
  weaknesses: { weakness?: string; type?: string; severity?: string; attackStrategy?: string }[];
  reasoningSignals: Record<string, unknown>[];
  lastQuestion: string;
  interviewStartTime: number;
  consecutiveHighWeaknessCount?: number;
  lastWeaknessType?: string | null;
  probedClaims?: string[];
  currentQuestionFollowups?: string[];
  currentQuestionFollowupAsked?: boolean;
  turnLog?: TurnLogEntry[];
  /** Async slow-track staging — never mutate canonical history/counters here. */
  prepped_next_question?: string | null;
  prepped_turn_analysis?: PreppedTurnAnalysis | null;
};

function looksLikeEcho(transcript: string, lastQuestion: string): boolean {
  const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]/g, "").trim();
  const t = normalize(transcript);
  const q = normalize(lastQuestion);
  if (t.length < 20) return false;
  const tWords = new Set(t.split(/\s+/).filter(Boolean));
  const qWords = new Set(q.split(/\s+/).filter(Boolean));
  if (tWords.size === 0 || qWords.size === 0) return false;
  const intersection = [...tWords].filter((w) => qWords.has(w)).length;
  const union = new Set([...tWords, ...qWords]).size;
  return union > 0 && intersection / union > 0.72;
}

export function hasSubstantialOverlap(full: string, partial: string): boolean {
  const normalize = (s: string) => s.toLowerCase().trim();
  const f = normalize(full);
  const p = normalize(partial);
  if (!p.length) return false;
  if (f.includes(p)) return true;
  const pWords = p.split(/\s+/).filter(Boolean);
  if (!pWords.length) return false;
  const hits = pWords.filter((w) => f.includes(w)).length;
  return hits / pWords.length > 0.6;
}

type WeaknessAgentOutput = {
  weakness: string;
  type: string;
  severity: "low" | "medium" | "high";
  attackStrategy: string;
  suggestedFollowup?: string;
};

type DiscrepancyAgentOutput = {
  conflict: boolean;
  description: string;
  severity: "low" | "high";
  resumeClaim: string;
  actualStatement: string;
};

type PartialAgentCacheEntry = {
  weakness: WeaknessAgentOutput;
  discrepancy: DiscrepancyAgentOutput;
  partial_text: string;
  ts: number;
};

const partialAgentCache = new Map<string, PartialAgentCacheEntry>();

function prunePartialAgentCache(): void {
  const now = Date.now();
  for (const [k, v] of partialAgentCache) {
    if (now - v.ts > 12_000) partialAgentCache.delete(k);
  }
}

/** Per-sprint static follow-up when staging + template race are unavailable (fast path only; no LLM). */
const FAST_STATIC_FALLBACK_BY_SPRINT: Record<number, string> = {
  1: DISTINCT_FALLBACK_QUESTIONS[0]!,
  2: DISTINCT_FALLBACK_QUESTIONS[1]!,
  3: DISTINCT_FALLBACK_QUESTIONS[2]!,
};

function pickFastStaticFallback(state: AdversarialState): string {
  const s = Math.min(3, Math.max(1, state.sprint));
  const pool = [FAST_STATIC_FALLBACK_BY_SPRINT[s]!, ...DISTINCT_FALLBACK_QUESTIONS].filter(Boolean);
  const i = Math.max(0, (state.questionCount ?? 0) % pool.length);
  return pool[i] ?? DISTINCT_FALLBACK_QUESTIONS[0]!;
}

type FastQuestionPick = {
  question: string;
  questionSource: string;
  followupDecision: FollowupBranch | "fast_path";
};

/**
 * Strict fast path: staging → timed adaptFollowupFast → static fallback.
 * Does not call weakness/discrepancy/reasoning agents or extractConcepts.
 */
async function chooseFastPathQuestion(
  state: AdversarialState,
  answer: string,
  askedForPrompt: string[]
): Promise<FastQuestionPick> {
  const preppedRaw = typeof state.prepped_next_question === "string" ? state.prepped_next_question.trim() : "";
  if (preppedRaw && !isNearDuplicateQuestion(preppedRaw, askedForPrompt)) {
    return {
      question: preppedRaw,
      questionSource: "fast_prepped",
      followupDecision: "fast_path",
    };
  }

  const templates = state.currentQuestionFollowups ?? [];
  if (templates.length > 0 && !state.currentQuestionFollowupAsked) {
    const template = templates[0]!;
    const raced = await Promise.race([
      adaptFollowupFast(template, answer, state.persona)
        .then((q) => q?.trim() || null)
        .catch(() => null),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 2000)),
    ]);
    if (raced && raced.length > 8) {
      return {
        question: sanitizeAiInterviewQuestionText(raced),
        questionSource: "fast_template",
        followupDecision: "followup_deepen",
      };
    }
  }

  const q = sanitizeAiInterviewQuestionText(pickFastStaticFallback(state));
  return { question: q, questionSource: "fast_static", followupDecision: "fast_path" };
}

async function mergeLastTurnLogWithSlowPath(
  interviewId: string,
  userId: string,
  turnId: string,
  patch: Partial<TurnLogEntry>
): Promise<void> {
  const row = await prisma.interview.findUnique({
    where: { id: interviewId },
    select: { questionPlan: true, userId: true },
  });
  if (!row || row.userId !== userId) return;
  const raw = row.questionPlan;
  if (!Array.isArray(raw) || !raw[0] || typeof raw[0] !== "object") return;
  const st = { ...(raw[0] as object) } as AdversarialState;
  const tls = [...(st.turnLog ?? [])];
  let idx = -1;
  for (let i = tls.length - 1; i >= 0; i--) {
    if (tls[i]!.turnId === turnId) {
      idx = i;
      break;
    }
  }
  if (idx < 0) return;
  tls[idx] = { ...tls[idx]!, ...patch };
  await prisma.interview.update({
    where: { id: interviewId },
    data: { questionPlan: [{ ...st, turnLog: tls }] as object[] },
  });
}

function normalizeQuestionLine(q: string): string {
  return q
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/^[¿?¡!]+/, "")
    .replace(/[?.!,;:]+$/g, "");
}

/**
 * Models often prepend acknowledgements despite "question only" prompts — that breaks TTS + confuses the UI.
 * Strip leading/trailing pleasantries while keeping the actual interview question.
 */
export function sanitizeAiInterviewQuestionText(raw: string): string {
  const input = raw.replace(/\r\n/g, "\n").trim();
  if (!input) return input;

  const leadingAck = new RegExp(
    "^(" +
      "(?:thank you|thanks|thx)(?:\\s+so much)?(?:\\s+for\\s+(?:that|sharing|the\\s+answer|your\\s+answer|clarifying))?\\s*[.,!?…]*\\s*" +
      "|(?:thank you|thanks|thx)(?:\\s+so much)?\\s*[—–-]\\s*" +
      "|(?:i\\s+)?appreciate\\s+(?:that|it)\\s*[.,!?…]*\\s*" +
      "|(?:that'?s|that\\s+is)\\s+(?:great|good|helpful|clear|useful|interesting)\\s*[.,!?…]*\\s*" +
      "|(?:got it|understood|makes sense|fair enough|right|okay|ok)\\s*[.,!?…]*\\s*" +
      "|(?:good|nice|interesting)\\s+(?:to know|point)\\s*[.,!?…]*\\s*" +
      ")+",
    "i"
  );

  let s = input;
  for (let i = 0; i < 4; i++) {
    const next = s.replace(leadingAck, "").trim();
    if (next === s) break;
    s = next;
  }

  s = s
    .replace(/\s+(?:thank you|thanks)\s*[!.…]*\s*$/i, "")
    .replace(/^[—–-]\s*/, "")
    .trim();

  if (s.length >= 8) return s;
  if (input.length >= 12) return input;
  return s || input;
}

/** True if candidate is essentially the same as something we already asked (common LLM collapse on short prompts). */
function isStillRelevant(prefetchQuestion: string, answer: string, concepts: string[]): boolean {
  const a = answer.toLowerCase();
  const q = prefetchQuestion.toLowerCase();
  for (const c of concepts) {
    const t = c.trim().toLowerCase();
    if (t.length > 2 && (a.includes(t) || q.includes(t))) return true;
  }
  const words = a.split(/\s+/).filter((w) => w.length > 4);
  return words.some((w) => q.includes(w));
}

export function isNearDuplicateQuestion(candidate: string, recent: string[]): boolean {
  const c = normalizeQuestionLine(candidate);
  if (c.length < 10) return false;
  for (const r of recent) {
    const rN = normalizeQuestionLine(r);
    if (!rN.length) continue;
    if (c === rN) return true;
    const short = Math.min(40, c.length, rN.length);
    if (short >= 14 && c.slice(0, short) === rN.slice(0, short)) return true;
    const cw = new Set(c.split(/\s+/).filter((w) => w.length > 2));
    const rw = new Set(rN.split(/\s+/).filter((w) => w.length > 2));
    if (cw.size < 4 || rw.size < 4) continue;
    let inter = 0;
    for (const w of cw) if (rw.has(w)) inter += 1;
    const union = cw.size + rw.size - inter;
    if (union === 0) continue;
    if (inter / union > 0.68) return true;
  }
  return false;
}

function priorAskedQuestions(history: AdversarialState["history"], lastQuestion: string, cap = 16): string[] {
  const fromH = history.map((h) => h.question).filter(Boolean) as string[];
  const merged = lastQuestion.trim() ? [...fromH, lastQuestion] : fromH;
  return [...new Set(merged)].slice(-cap);
}

export function buildResumeContext(profile: {
  currentRole?: string | null;
  experienceYears?: number | null;
  skills?: unknown;
  about?: string | null;
  workExperience?: unknown;
  targetJobTitle?: string | null;
  fullName?: string | null;
  roleType?: string | null;
  portfolioUrl?: string | null;
} | null | undefined): string {
  if (!profile) return "";
  const skillsStr = Array.isArray(profile.skills)
    ? (profile.skills as string[]).join(", ")
    : profile.skills
      ? JSON.stringify(profile.skills).slice(0, 400)
      : "";
  const parts = [
    profile.fullName ? `Name: ${profile.fullName}` : "",
    profile.currentRole ? `Role: ${profile.currentRole}` : "",
    profile.targetJobTitle ? `Target: ${profile.targetJobTitle}` : "",
    profile.experienceYears != null ? `Experience: ${profile.experienceYears} years` : "",
    skillsStr ? `Skills: ${skillsStr}` : "",
    profile.about ? `Background: ${profile.about}` : "",
    profile.workExperience ? `Work: ${JSON.stringify(profile.workExperience).slice(0, 500)}` : "",
  ].filter(Boolean);
  if (profile.roleType === "non_technical") {
    const st = detectNonTechSubtrack(profile.targetJobTitle ?? profile.currentRole);
    parts.push(`Non-technical subtrack: ${st}`);
    if (profile.portfolioUrl?.trim()) {
      parts.push(`Portfolio URL: ${profile.portfolioUrl.trim()}`);
    }
  } else if (profile.roleType === "data") {
    parts.push(`Data subtrack: ${detectDataSubtrack(profile.targetJobTitle ?? profile.currentRole)}`);
  }
  return parts.join("\n");
}

export async function startAdversarialInterview(
  interviewId: string
): Promise<{ question: string; sprint: number; sprintName: string; persona: string }> {
  const row = await prisma.interview.findUnique({
    where: { id: interviewId },
    select: { jobRole: true, user: { select: { jobSeekerProfile: true } } },
  });
  const profile = row?.user?.jobSeekerProfile;
  const jobRole = row?.jobRole ?? "Software Engineer";
  const isNonTech = profile?.roleType === "non_technical";
  const isData = profile?.roleType === "data";
  const openerRaw = isNonTech ? NON_TECH_OPENERS[1] : isData ? DATA_OPENERS[1] : SPRINT_OPENERS[1];
  const opener = sanitizeAiInterviewQuestionText(openerRaw);
  const cfg1 = isNonTech ? NON_TECH_SPRINTS[1] : isData ? DATA_SPRINTS[1] : SPRINTS[1];
  const initial: AdversarialState = {
    sprint: 1,
    persona: cfg1.persona,
    sprintName: cfg1.name,
    trackNonTechnical: isNonTech ? true : undefined,
    nonTechSubtrack: isNonTech ? detectNonTechSubtrack(profile?.targetJobTitle ?? profile?.currentRole) : undefined,
    trackData: isData ? true : undefined,
    dataSubtrack: isData ? detectDataSubtrack(profile?.targetJobTitle ?? profile?.currentRole) : undefined,
    questionCount: 0,
    sprintQuestionCount: 0,
    history: [],
    weaknesses: [],
    reasoningSignals: [],
    lastQuestion: opener,
    interviewStartTime: Date.now(),
    consecutiveHighWeaknessCount: 0,
    lastWeaknessType: null,
    probedClaims: [],
    currentQuestionFollowups: findFollowupsForQuestionText(opener, jobRole),
    currentQuestionFollowupAsked: false,
    turnLog: [],
    prepped_next_question: null,
    prepped_turn_analysis: null,
  };

  await prisma.interview.update({
    where: { id: interviewId },
    data: {
      questionPlan: [initial] as object[],
      questionIndex: 0,
    },
  });

  await prisma.interviewMessage.create({
    data: {
      interviewId,
      sender: "ai",
      message: opener,
      questionType: "sprint_1_opener",
      isFollowup: false,
    },
  });

  return {
    question: opener,
    sprint: 1,
    sprintName: cfg1.name,
    persona: cfg1.persona,
  };
}

function defaultState(): AdversarialState {
  return {
    sprint: 1,
    persona: "curious_lead",
    sprintName: "Project Defense",
    questionCount: 0,
    sprintQuestionCount: 0,
    history: [],
    weaknesses: [],
    reasoningSignals: [],
    lastQuestion: sanitizeAiInterviewQuestionText(SPRINT_OPENERS[1]),
    interviewStartTime: Date.now(),
    consecutiveHighWeaknessCount: 0,
    lastWeaknessType: null,
    probedClaims: [],
    currentQuestionFollowups: [],
    currentQuestionFollowupAsked: false,
    turnLog: [],
    prepped_next_question: null,
    prepped_turn_analysis: null,
  };
}

export type ProcessTurnHttpPayload = {
  response: string;
  /** Short neutral transition for TTS before `response`; empty when fragment retry or interview complete. */
  acknowledgement: string;
  sprint: number;
  sprintName: string;
  persona: string;
  complete: boolean;
  weakness?: unknown;
  questionCount: number;
  turnId: string;
  pivoting?: boolean;
  fragmentRetry?: boolean;
  totalScore?: number;
  badgeLevel?: string;
  evaluation?: Record<string, unknown>;
  remainingMinutes?: number;
  completionReason?: InterviewCompletionReason;
  timeExpired?: boolean;
  /** True when interview.status is evaluating and scoring runs in the background. */
  evaluating?: boolean;
  message?: string;
};

export type ProcessTurnRouteResult = {
  result: ProcessTurnHttpPayload;
  /** When non-null, run after `res.json(result)` so the HTTP response is not blocked on agents. */
  slowWork: Promise<void> | null;
};

type RunInterviewSlowPathInput = {
  interviewId: string;
  userId: string;
  answeredQuestion: string;
  answeredSprint: number;
  answeredPersona: string;
  answer: string;
  resume: string;
  resumeContext: string;
  turnIdForLogMerge: string;
  whisperLatencyMs?: number | null;
  /** Last turn: only merge agent outputs + weakness list; skip generating the next question. */
  skipNextQuestion: boolean;
};

async function runInterviewSlowPath(input: RunInterviewSlowPathInput): Promise<void> {
  const slowPathStart = Date.now();
  let agentCacheHit = false;
  try {
    const interview = await prisma.interview.findUnique({
      where: { id: input.interviewId },
      include: { user: { include: { jobSeekerProfile: true } } },
    });
    if (!interview || interview.userId !== input.userId) return;

    const rawPlan = interview.questionPlan;
    const state =
      Array.isArray(rawPlan) && rawPlan[0] && typeof rawPlan[0] === "object"
        ? ({ ...(rawPlan[0] as AdversarialState) } as AdversarialState)
        : null;
    if (!state) return;

    const weaknesses = state.weaknesses ?? [];
    const wasChallenged =
      weaknesses.length > 0 && weaknesses[weaknesses.length - 1]?.severity === "high";

    prunePartialAgentCache();
    const cachedPartial = partialAgentCache.get(input.interviewId);
    let weakness: Awaited<ReturnType<typeof detectWeakness>>;
    let discrepancy: Awaited<ReturnType<typeof checkDiscrepancy>>;
    let reasoning: Awaited<ReturnType<typeof evaluateReasoning>>;
    let concepts: string[];

    const trimmedAns = input.answer.trim();
    if (cachedPartial && hasSubstantialOverlap(trimmedAns, cachedPartial.partial_text)) {
      weakness = cachedPartial.weakness;
      discrepancy = cachedPartial.discrepancy;
      [reasoning, concepts] = await Promise.all([
        evaluateReasoning(input.answer, wasChallenged),
        extractConcepts(input.answer),
      ]);
      agentCacheHit = true;
      partialAgentCache.delete(input.interviewId);
    } else {
      [weakness, discrepancy, reasoning, concepts] = await Promise.all([
        detectWeakness(input.answeredQuestion, input.answer, input.answeredSprint, weaknesses),
        checkDiscrepancy(input.resume, input.answer),
        evaluateReasoning(input.answer, wasChallenged),
        extractConcepts(input.answer),
      ]);
    }

    applyReasoningHonestyCap(weakness, reasoning);

    let consec = state.consecutiveHighWeaknessCount ?? 0;
    let lastWT = state.lastWeaknessType ?? null;
    if (weakness.severity === "high") {
      if (weakness.type === lastWT) consec += 1;
      else {
        consec = 1;
        lastWT = weakness.type ?? null;
      }
    } else {
      consec = 0;
      lastWT = null;
    }
    if (reasoning.behavior_marker === "pivoted_elegantly") {
      consec = 0;
      lastWT = null;
    }
    if (reasoning.behavior_marker === "deflecting") {
      consec += 1;
    }
    const forceSprintQuestion = consec >= MAX_CONSECUTIVE_HIGH_SAME_TYPE;

    if (input.skipNextQuestion) {
      const row0 = await prisma.interview.findUnique({
        where: { id: input.interviewId },
        select: { questionPlan: true, userId: true },
      });
      if (!row0 || row0.userId !== input.userId) return;
      const raw0 = row0.questionPlan;
      if (!Array.isArray(raw0) || !raw0[0] || typeof raw0[0] !== "object") return;
      const b0 = { ...(raw0[0] as AdversarialState) } as AdversarialState;
      const newWeaknesses0 = weakness.type ? [...(b0.weaknesses ?? []), weakness] : (b0.weaknesses ?? []);
      const newReasoningSignals0 = [
        ...(b0.reasoningSignals ?? []),
        reasoning as unknown as Record<string, unknown>,
      ];
      await prisma.interview.update({
        where: { id: input.interviewId },
        data: {
          questionPlan: [
            {
              ...b0,
              weaknesses: newWeaknesses0,
              reasoningSignals: newReasoningSignals0,
              consecutiveHighWeaknessCount: consec,
              lastWeaknessType: lastWT,
              prepped_next_question: null,
              prepped_turn_analysis: null,
            },
          ] as object[],
        },
      });
      await mergeLastTurnLogWithSlowPath(input.interviewId, input.userId, input.turnIdForLogMerge, {
        agentPipelineMs: Date.now() - slowPathStart,
        agentCacheHit,
        weaknessSeverity: String(weakness.severity ?? ""),
        followupDecision: "sprint_question",
        questionSource: "slow_path_terminal",
        agentOutputsSnapshot: JSON.stringify({
          weakness,
          discrepancy: { conflict: discrepancy.conflict, severity: discrepancy.severity },
          reasoning,
        }).slice(0, 8000),
        slowPathComplete: true,
      });
      return;
    }

    const history = state.history ?? [];
    const askedForPrompt = priorAskedQuestions(history, input.answeredQuestion);
    let probedClaims = [...(state.probedClaims ?? [])];

    let followup: string;
    let followupBranch: FollowupBranch = "sprint_question";
    const claimKey = discrepancy.resumeClaim?.trim() || "";

    if (
      discrepancy.conflict &&
      discrepancy.severity === "high" &&
      !forceSprintQuestion &&
      claimKey &&
      !probedClaims.includes(claimKey)
    ) {
      followupBranch = "discrepancy_probe";
      probedClaims = [...probedClaims, claimKey];
      followup = await resolveDistinctQuestion(askedForPrompt, () =>
        generateDiscrepancyFollowup(
          input.answeredQuestion,
          input.answer,
          discrepancy,
          state.persona,
          input.resumeContext,
          askedForPrompt
        )
      );
    } else if (weakness.severity === "high" && !forceSprintQuestion) {
      followupBranch = "weakness_probe";
      followup = await resolveDistinctQuestion(askedForPrompt, () =>
        generateWeaknessFollowup(
          input.answeredQuestion,
          input.answer,
          weakness,
          state.persona,
          input.resumeContext,
          askedForPrompt
        )
      );
    } else if (
      weakness.severity !== "high" &&
      (state.currentQuestionFollowups ?? []).length > 0 &&
      !state.currentQuestionFollowupAsked
    ) {
      followupBranch = "followup_deepen";
      const template = state.currentQuestionFollowups![0]!;
      followup = await adaptFollowupFast(template, input.answer, state.persona);
    } else {
      const preppedQ =
        typeof state.prepped_next_question === "string" && state.prepped_next_question.trim().length > 0
          ? state.prepped_next_question.trim()
          : "";
      if (
        preppedQ &&
        !isNearDuplicateQuestion(preppedQ, askedForPrompt) &&
        isStillRelevant(preppedQ, input.answer, concepts)
      ) {
        followup = preppedQ;
        followupBranch = "prefetch";
      } else {
        let prefetched: string | undefined;
        do {
          prefetched = popPrefetchQuestion(input.interviewId);
        } while (prefetched && isNearDuplicateQuestion(prefetched, askedForPrompt));

        if (prefetched && isStillRelevant(prefetched, input.answer, concepts)) {
          followupBranch = "prefetch";
          followup = prefetched;
        } else {
          followup = await resolveDistinctQuestion(askedForPrompt, () =>
            generateSprintQuestion(state.sprint, state.persona, input.resumeContext, history, askedForPrompt, {
              nonTechnical: Boolean(state.trackNonTechnical),
              subtrack: state.nonTechSubtrack,
              dataTrack: Boolean(state.trackData),
              dataSubtrack: state.dataSubtrack,
            })
          );
          if (forceSprintQuestion) {
            followupBranch = "forced_sprint";
          } else {
            followupBranch = "sprint_question";
          }
        }
      }
    }

    followup = sanitizeAiInterviewQuestionText(followup);

    const prefetchBatch = await prefetchFollowups(concepts, input.resumeContext, state.sprint, state.persona);
    if (prefetchBatch.length) {
      setPrefetchQuestions(input.interviewId, prefetchBatch);
    }

    const row = await prisma.interview.findUnique({
      where: { id: input.interviewId },
      select: { questionPlan: true, userId: true },
    });
    if (!row || row.userId !== input.userId) return;
    const raw = row.questionPlan;
    if (!Array.isArray(raw) || !raw[0] || typeof raw[0] !== "object") return;
    const b = { ...(raw[0] as AdversarialState) } as AdversarialState;

    const newWeaknesses = weakness.type ? [...(b.weaknesses ?? []), weakness] : (b.weaknesses ?? []);
    const newReasoningSignals = [...(b.reasoningSignals ?? []), reasoning as unknown as Record<string, unknown>];

    await prisma.interview.update({
      where: { id: input.interviewId },
      data: {
        questionPlan: [
          {
            ...b,
            weaknesses: newWeaknesses,
            reasoningSignals: newReasoningSignals,
            consecutiveHighWeaknessCount: consec,
            lastWeaknessType: lastWT,
            probedClaims,
            prepped_next_question: followup,
            prepped_turn_analysis: {
              weakness,
              discrepancy,
              reasoning,
            },
          },
        ] as object[],
      },
    });

    await mergeLastTurnLogWithSlowPath(input.interviewId, input.userId, input.turnIdForLogMerge, {
      agentPipelineMs: Date.now() - slowPathStart,
      agentCacheHit,
      questionSource: followupBranch,
      followupDecision: followupBranch,
      weaknessSeverity: String(weakness.severity ?? ""),
      agentOutputsSnapshot: JSON.stringify({
        weakness,
        discrepancy: { conflict: discrepancy.conflict, severity: discrepancy.severity },
        reasoning,
      }).slice(0, 8000),
      slowPathComplete: true,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[interview/slow-path]", err);
    await mergeLastTurnLogWithSlowPath(input.interviewId, input.userId, input.turnIdForLogMerge, {
      slowPathError: msg.slice(0, 500),
      slowPathComplete: true,
    }).catch(() => {});
  }
}

export async function processTurn(
  interviewId: string,
  answer: string,
  userId: string,
  options?: {
    audioUrl?: string;
    transcriptionConfidence?: number;
    inputMode?: "voice" | "typed";
    pasteCount?: number;
    timeToSubmitSeconds?: number;
    clientTurnId?: string;
    whisperLatencyMs?: number;
  }
): Promise<ProcessTurnRouteResult> {
  const interview = await prisma.interview.findUnique({
    where: { id: interviewId },
    include: { user: { include: { jobSeekerProfile: true } } },
  });

  if (!interview || interview.userId !== userId) {
    throw new Error("Interview not found");
  }

  const rawPlan = interview.questionPlan;
  let state: AdversarialState =
    Array.isArray(rawPlan) && rawPlan[0] && typeof rawPlan[0] === "object"
      ? ({ ...(rawPlan[0] as AdversarialState) } as AdversarialState)
      : defaultState();

  const {
    sprint,
    persona,
    lastQuestion,
    history,
    weaknesses,
    reasoningSignals,
    sprintName: stateSprintName,
    sprintQuestionCount: prevSprintQ,
    questionCount: prevQCount,
  } = state;

  const interviewStartedAt =
    typeof state.interviewStartTime === "number" && Number.isFinite(state.interviewStartTime)
      ? state.interviewStartTime
      : Date.now();

  const trimmed = answer.trim();
  const endsWithSentence = /[.!?…]$/.test(trimmed);
  const isFragmentShort = trimmed.length > 0 && trimmed.length < 20;
  const isFragmentMid = trimmed.length >= 20 && trimmed.length < 50 && !endsWithSentence;
  if (isFragmentShort || isFragmentMid) {
    const prompt = isFragmentShort
      ? "Could you elaborate on that a bit more?"
      : "Could you finish that thought — what happened next?";
    const userMessage = await prisma.interviewMessage.create({
      data: {
        interviewId,
        sender: "user",
        message: answer,
        questionIndex: prevQCount,
        audioUrl: options?.audioUrl ?? null,
        transcriptionConfidence: options?.transcriptionConfidence ?? null,
        inputMode: options?.inputMode ?? "voice",
        answerLengthChars: answer.length,
        pasteCount: options?.pasteCount ?? 0,
        timeToSubmitSeconds: options?.timeToSubmitSeconds ?? null,
      },
    });
    await prisma.interviewMessage.create({
      data: {
        interviewId,
        sender: "ai",
        message: prompt,
        questionType: `sprint_${sprint}`,
        isFollowup: true,
      },
    });
    const remainingMs = Math.max(0, MAX_INTERVIEW_MINUTES * 60_000 - (Date.now() - interviewStartedAt));
    const remainingMinutes = Math.ceil(remainingMs / 60_000);
    const tid = options?.clientTurnId?.trim() || userMessage.id;
    return {
      result: {
        response: prompt,
        acknowledgement: "",
        sprint,
        sprintName:
          stateSprintName ??
          (state.trackNonTechnical ? NON_TECH_SPRINTS[1].name : state.trackData ? DATA_SPRINTS[1].name : SPRINTS[1].name),
        persona,
        complete: false,
        questionCount: prevQCount,
        turnId: tid,
        fragmentRetry: true,
        remainingMinutes,
      },
      slowWork: null,
    };
  }

  if (trimmed.length >= 20 && looksLikeEcho(trimmed, lastQuestion)) {
    const remainingMsEcho = Math.max(0, MAX_INTERVIEW_MINUTES * 60_000 - (Date.now() - interviewStartedAt));
    const remainingMinutesEcho = Math.ceil(remainingMsEcho / 60_000);
    const tidEcho = options?.clientTurnId?.trim() || crypto.randomUUID();
    const echoLog: TurnLogEntry = {
      turnId: tidEcho,
      questionIndex: prevQCount,
      weaknessSeverity: "",
      followupDecision: "sprint_question",
      questionSource: "echo_guard",
      agentOutputsSnapshot: "",
      timestamp: new Date().toISOString(),
      whisperLatencyMs: options?.whisperLatencyMs ?? null,
      echoGuardTriggered: true,
    };
    const turnLogEcho = [...(state.turnLog ?? []), echoLog];
    await prisma.interview.update({
      where: { id: interviewId },
      data: {
        questionPlan: [{ ...state, turnLog: turnLogEcho }] as object[],
      },
    });
    return {
      result: {
        response: "It sounds like your mic may have picked up my question. Could you share your answer?",
        acknowledgement: "",
        sprint,
        sprintName:
          stateSprintName ??
          (state.trackNonTechnical ? NON_TECH_SPRINTS[1].name : state.trackData ? DATA_SPRINTS[1].name : SPRINTS[1].name),
        persona,
        complete: false,
        questionCount: prevQCount,
        turnId: tidEcho,
        fragmentRetry: true,
        remainingMinutes: remainingMinutesEcho,
      },
      slowWork: null,
    };
  }

  const resumeContext = buildResumeContext(interview.user?.jobSeekerProfile);
  const jp = interview.user?.jobSeekerProfile;
  const resume =
    [jp?.about, jp?.workExperience, jp?.skills ? JSON.stringify(jp.skills) : ""].filter(Boolean).join("\n") ||
    resumeContext;

  const answeredQuestion = lastQuestion;
  const answeredSprint = sprint;
  const answeredPersona = persona;

  const turnStartMs = Date.now();
  const userMessage = await prisma.interviewMessage.create({
    data: {
      interviewId,
      sender: "user",
      message: answer,
      questionIndex: prevQCount,
      audioUrl: options?.audioUrl ?? null,
      transcriptionConfidence: options?.transcriptionConfidence ?? null,
      inputMode: options?.inputMode ?? "voice",
      answerLengthChars: answer.length,
      pasteCount: options?.pasteCount ?? 0,
      timeToSubmitSeconds: options?.timeToSubmitSeconds ?? null,
    },
  });

  const staged = state.prepped_turn_analysis ?? null;
  const historyRow: AdversarialState["history"][number] = {
    question: answeredQuestion,
    answer,
    sprint,
    persona,
  };
  if (staged?.weakness != null) {
    historyRow.weakness = staged.weakness;
  }
  if (staged?.discrepancy != null) {
    historyRow.discrepancy = staged.discrepancy;
  }
  if (staged?.reasoning != null) {
    historyRow.reasoning = staged.reasoning;
  }

  const newHistory = [...history, historyRow];

  const newQuestionCount = prevQCount + 1;
  let newSprintQuestionCount = prevSprintQ + 1;

  let currentSprint = sprint;
  let currentPersona = persona;
  let currentSprintName = stateSprintName;
  let currentSprintQuestionCount = newSprintQuestionCount;
  let sprintAdvanced = false;
  let pivoting = false;
  let currentQuestionFollowups = [...(state.currentQuestionFollowups ?? [])];
  let currentQuestionFollowupAsked = state.currentQuestionFollowupAsked ?? false;

  let followup = "";

  if (newSprintQuestionCount >= QUESTIONS_PER_SPRINT) {
    const nextSprint = sprint + 1;
    if (nextSprint <= 3) {
      currentSprint = nextSprint;
      const sprintDef = state.trackNonTechnical
        ? NON_TECH_SPRINTS[nextSprint]
        : state.trackData
          ? DATA_SPRINTS[nextSprint]
          : SPRINTS[nextSprint];
      currentPersona = sprintDef.persona;
      currentSprintName = sprintDef.name;
      currentSprintQuestionCount = 0;
      sprintAdvanced = true;
      pivoting = true;
      followup = state.trackNonTechnical
        ? NON_TECH_OPENERS[nextSprint]
        : state.trackData
          ? DATA_OPENERS[nextSprint]
          : SPRINT_OPENERS[nextSprint];
      currentQuestionFollowups = findFollowupsForQuestionText(followup, interview.jobRole);
      currentQuestionFollowupAsked = false;
    }
  }

  const completionCheck = isInterviewComplete({
    questionCount: newQuestionCount,
    sprint: currentSprint,
    sprintQuestionCount: currentSprintQuestionCount,
    interviewStartTime: interviewStartedAt,
  });
  const isComplete = completionCheck.complete;

  const sprintClosing =
    "That wraps up our interview. Well done for getting through all three sprints. Your report is being generated now.";
  const timeClosing =
    "We've reached the end of our time together. Thank you for the conversation — your report is being generated now.";
  const closingMessage = completionCheck.reason === "time_limit" ? timeClosing : sprintClosing;

  let pick: FastQuestionPick | null = null;

  if (isComplete) {
    followup = closingMessage;
  } else if (sprintAdvanced) {
    /* followup already set to sprint opener */
  } else {
    const asked = priorAskedQuestions(history, answeredQuestion);
    pick = await chooseFastPathQuestion(state, answer, asked);
    followup = pick.question;
    if (pick.followupDecision === "followup_deepen") {
      currentQuestionFollowups = (state.currentQuestionFollowups ?? []).slice(1);
      currentQuestionFollowupAsked = true;
    } else {
      currentQuestionFollowups = findFollowupsForQuestionText(followup, interview.jobRole);
      currentQuestionFollowupAsked = false;
    }
  }

  if (!isComplete) {
    followup = sanitizeAiInterviewQuestionText(followup);
  }

  const logTurnId = options?.clientTurnId?.trim() || userMessage.id;
  const fastPathReadyMs = Date.now();
  const turnLogEntry: TurnLogEntry = {
    turnId: logTurnId,
    questionIndex: prevQCount,
    weaknessSeverity: "",
    followupDecision: sprintAdvanced ? "fast_path" : pick?.followupDecision === "followup_deepen" ? "followup_deepen" : "fast_path",
    questionSource: sprintAdvanced ? "sprint_opener" : pick?.questionSource ?? "fast_path",
    agentOutputsSnapshot: "",
    timestamp: new Date().toISOString(),
    whisperLatencyMs: options?.whisperLatencyMs ?? null,
    agentPipelineMs: null,
    questionGenerationMs: null,
    totalTurnLatencyMs: fastPathReadyMs - turnStartMs,
    answerLengthChars: answer.length,
    pasteCount: options?.pasteCount ?? 0,
    timeToSubmitSeconds: options?.timeToSubmitSeconds ?? null,
    answerSnapshot: answer.slice(0, 200),
  };
  const turnLog = [...(state.turnLog ?? []), turnLogEntry];

  const aiText = isComplete ? closingMessage : followup;

  if (isComplete) {
    console.log(
      `[interview] Complete — reason: ${completionCheck.reason}, questions: ${newQuestionCount}, sprint: ${currentSprint}`
    );
  }

  await prisma.interviewMessage.create({
    data: {
      interviewId,
      sender: "ai",
      message: aiText,
      questionType: `sprint_${currentSprint}`,
      isFollowup: false,
    },
  });

  const newState: AdversarialState = {
    sprint: currentSprint,
    persona: currentPersona,
    sprintName: currentSprintName,
    trackNonTechnical: state.trackNonTechnical,
    nonTechSubtrack: state.nonTechSubtrack,
    trackData: state.trackData,
    dataSubtrack: state.dataSubtrack,
    questionCount: newQuestionCount,
    sprintQuestionCount: currentSprintQuestionCount,
    history: newHistory,
    weaknesses,
    reasoningSignals,
    lastQuestion: isComplete ? "" : followup,
    interviewStartTime: interviewStartedAt,
    consecutiveHighWeaknessCount: state.consecutiveHighWeaknessCount ?? 0,
    lastWeaknessType: state.lastWeaknessType ?? null,
    probedClaims: state.probedClaims ?? [],
    currentQuestionFollowups,
    currentQuestionFollowupAsked,
    turnLog,
    prepped_next_question: null,
    prepped_turn_analysis: null,
  };

  const responseTurnId = options?.clientTurnId?.trim() || userMessage.id;

  const slowInputBase = {
    interviewId,
    userId: interview.userId,
    answeredQuestion,
    answeredSprint,
    answeredPersona,
    answer,
    resume,
    resumeContext,
    turnIdForLogMerge: logTurnId,
    whisperLatencyMs: options?.whisperLatencyMs ?? null,
  } as const;

  if (isComplete) {
    await prisma.interview.update({
      where: { id: interviewId },
      data: {
        questionPlan: [newState] as object[],
        questionIndex: newQuestionCount,
      },
    });

    await runInterviewSlowPath({ ...slowInputBase, skipNextQuestion: true });

    const fresh = await prisma.interview.findUnique({
      where: { id: interviewId },
      include: { user: { include: { jobSeekerProfile: true } } },
    });
    if (!fresh) {
      throw new Error("Interview not found after slow path");
    }
    const rawFresh = fresh.questionPlan;
    const stFresh: AdversarialState =
      Array.isArray(rawFresh) && rawFresh[0] && typeof rawFresh[0] === "object"
        ? ({ ...(rawFresh[0] as AdversarialState) } as AdversarialState)
        : newState;

    const finalizePayload: FinalizeAiInterviewParams = {
      interviewId,
      userId: fresh.userId,
      newHistory: stFresh.history,
      resume,
      newWeaknesses: stFresh.weaknesses,
      newReasoningSignals: stFresh.reasoningSignals,
      newQuestionCount,
      newState: stFresh,
      jobRole: fresh.jobRole,
      experienceLevel: fresh.experienceLevel,
    };

    const useSyncEval =
      process.env.INTERVIEW_SYNC_EVAL === "1" || process.env.INTERVIEW_SYNC_EVAL === "true";

    if (!useSyncEval) {
      await prisma.interview.update({
        where: { id: interviewId },
        data: {
          status: "evaluating",
          questionPlan: [stFresh] as object[],
          questionIndex: newQuestionCount,
        },
      });
      prefetchCache.delete(interviewId);
      void finalizeAiInterviewInBackground(finalizePayload).catch((err) => {
        console.error("[interview] finalizeAiInterviewInBackground", err);
        void prisma.interview
          .update({
            where: { id: interviewId },
            data: {
              status: "pending_review",
              reviewFlag: true,
              reviewReason: "evaluation_failure",
            },
          })
          .catch(() => {});
      });

      return {
        result: {
          response: closingMessage,
          acknowledgement: "",
          sprint: currentSprint,
          sprintName: currentSprintName,
          persona: currentPersona,
          complete: true,
          evaluating: true,
          questionCount: newQuestionCount,
          turnId: responseTurnId,
          completionReason: completionCheck.reason,
          timeExpired: completionCheck.reason === "time_limit",
          message:
            "Your interview is being evaluated. Your results will appear shortly — please keep this page open.",
        },
        slowWork: null,
      };
    }

    const { overallScore, badgeLevel: badge, evaluation } =
      await finalizeAiInterviewInBackground(finalizePayload);

    return {
      result: {
        response: closingMessage,
        acknowledgement: "",
        sprint: currentSprint,
        sprintName: currentSprintName,
        persona: currentPersona,
        complete: true,
        questionCount: newQuestionCount,
        turnId: responseTurnId,
        totalScore: overallScore,
        badgeLevel: badge,
        evaluation,
        completionReason: completionCheck.reason,
        timeExpired: completionCheck.reason === "time_limit",
      },
      slowWork: null,
    };
  }

  await prisma.interview.update({
    where: { id: interviewId },
    data: {
      questionPlan: [newState] as object[],
      questionIndex: newQuestionCount,
    },
  });

  const remainingMs = Math.max(0, MAX_INTERVIEW_MINUTES * 60_000 - (Date.now() - interviewStartedAt));
  const remainingMinutes = Math.ceil(remainingMs / 60_000);

  const slowWork = runInterviewSlowPath({ ...slowInputBase, skipNextQuestion: false });

  return {
    result: {
      response: followup,
      acknowledgement: pickTurnAcknowledgement(),
      sprint: currentSprint,
      sprintName: currentSprintName,
      persona: currentPersona,
      complete: false,
      questionCount: newQuestionCount,
      turnId: responseTurnId,
      pivoting,
      remainingMinutes,
    },
    slowWork,
  };

}

export type FinalizeAiInterviewParams = {
  interviewId: string;
  userId: string;
  newHistory: AdversarialState["history"];
  resume: string;
  newWeaknesses: AdversarialState["weaknesses"];
  newReasoningSignals: AdversarialState["reasoningSignals"];
  newQuestionCount: number;
  newState: AdversarialState;
  jobRole: string;
  experienceLevel: string | null;
};

export type FinalizeAiInterviewResult = {
  overallScore: number;
  badgeLevel: string;
  evaluation: Record<string, unknown>;
};

/** Runs multi-pass eval, integrity merge, per-question rows, completed status, admin queue. */
export async function finalizeAiInterviewInBackground(
  p: FinalizeAiInterviewParams
): Promise<FinalizeAiInterviewResult> {
  const {
    interviewId,
    userId,
    newHistory,
    resume,
    newWeaknesses,
    newReasoningSignals,
    newQuestionCount,
    newState,
    jobRole,
    experienceLevel,
  } = p;

  const jsProfile = await prisma.jobSeekerProfile.findUnique({
    where: { userId },
    select: { roleType: true },
  });
  const nonTechnical = jsProfile?.roleType === "non_technical";
  const dataTrack = jsProfile?.roleType === "data";

  const coverageRatio = computeWeaknessCoverageRatio(newWeaknesses, newQuestionCount);
  const multi = await evaluateFullInterviewMultiPass(
    newHistory,
    resume,
    newWeaknesses,
    newReasoningSignals,
    {
      coverageRatio,
      experienceLevel,
      jobRole,
      nonTechnical,
      dataTrack: dataTrack && !nonTechnical,
    }
  );
  let evaluation = multi.evaluation as Record<string, unknown>;
  if (multi.passCount === 0) {
    evaluation = {
      overall_score: 5,
      final_verdict: "Evaluation completed; detailed scoring unavailable.",
      strengths: [],
      weaknesses: ["Continue practicing structured technical explanations."],
      authenticity_concern: false,
      authenticity_reason: "",
      claim_credibility_risk: "none",
      engineering_signal: "inconclusive",
      confidence_calibrated: false,
    };
  }

  const overallRaw = Number(evaluation.overall_score);
  let overallScore = 50;
  if (Number.isFinite(overallRaw)) {
    overallScore =
      overallRaw <= 10.5 ? Math.round(overallRaw * 10) : Math.round(Math.min(100, overallRaw));
  }
  overallScore = Math.min(100, Math.max(0, overallScore));

  if (nonTechnical) {
    const c = Number(evaluation.concept_score);
    const r = Number(evaluation.reasoning_score);
    const comm = Number(evaluation.communication_score);
    const conf = Number(evaluation.confidence_score);
    if ([c, r, comm, conf].every((n) => Number.isFinite(n))) {
      overallScore = Math.min(
        100,
        Math.max(0, Math.round(0.3 * c + 0.25 * r + 0.3 * comm + 0.15 * conf))
      );
      evaluation.overall_score = overallScore / 10;
    }
  }

  const badge =
    overallScore >= 90
      ? "Elite Verified"
      : overallScore >= 75
        ? "Gold Verified"
        : overallScore >= 60
          ? "Silver Verified"
          : "Not Verified";

  const claimRisk = String(evaluation.claim_credibility_risk ?? "none").trim() || null;
  const engSignal = String(evaluation.engineering_signal ?? "").trim() || null;

  const allMessages = await prisma.interviewMessage.findMany({
    where: { interviewId },
    orderBy: { createdAt: "asc" },
  });
  const userMsgs = allMessages.filter((m) => m.sender === "user");
  const antiRows = userMsgs.map((m) => ({
    message: m.message,
    questionType: m.questionType,
    timeToSubmitSeconds: m.timeToSubmitSeconds,
    pasteCount: m.pasteCount,
  }));
  const patches = analyzeAnswerAntiGaming(antiRows);
  for (let i = 0; i < userMsgs.length; i++) {
    const patch = patches[i];
    if (!patch?.flagAntiGaming) continue;
    await prisma.interviewMessage.update({
      where: { id: userMsgs[i]!.id },
      data: { flagAntiGaming: true, flagReason: patch.flagReason },
    });
  }
  let antiGamingRisk = patches.reduce((s, p) => s + p.riskPoints, 0);
  antiGamingRisk = Math.min(100, antiGamingRisk);

  const proctoringEvents = await prisma.proctoringEvent.findMany({
    where: { sessionId: interviewId, testType: "ai_interview" },
    select: { type: true },
  });
  const proctorAgg = aggregateProctoringViolations(proctoringEvents);
  const proctorFlag = integrityFlagFromViolationAggregate(proctorAgg);
  const antiGamingFlag = integrityFlagFromAntiGamingPoints(antiGamingRisk);
  const integrityFlag = mergeIntegrityFlags(proctorFlag, antiGamingFlag);
  const riskScoreTotal = interviewProctoringViolationTotal(proctorAgg);

  const perQ = evaluation.per_question_scores;
  if (Array.isArray(perQ)) {
    for (const row of perQ as Array<Record<string, unknown>>) {
      const qi = Number(row.question_index);
      if (!Number.isFinite(qi) || qi < 0 || qi >= userMsgs.length) continue;
      const um = userMsgs[qi];
      if (!um) continue;
      await prisma.interviewQuestionResult
        .create({
          data: {
            interviewId,
            messageId: um.id,
            questionBankId: null,
            questionIndex: qi,
            questionType: String(newHistory[qi]?.persona ?? "conceptual"),
            scoreConceptual: Number(row.score_conceptual) || null,
            scoreReasoning: Number(row.score_reasoning) || null,
            scoreCommunication: Number(row.score_communication) || null,
            rationale: row.rationale != null ? String(row.rationale) : null,
            keyPointsHit: Array.isArray(row.key_points_hit) ? (row.key_points_hit as string[]).map(String) : [],
            keyPointsMissed: Array.isArray(row.key_points_missed)
              ? (row.key_points_missed as string[]).map(String)
              : Array.isArray(row.key_points_miss)
                ? (row.key_points_miss as string[]).map(String)
                : [],
            flagAntiGaming: Boolean(evaluation.authenticity_concern),
            flagReason:
              evaluation.authenticity_concern && evaluation.authenticity_reason
                ? String(evaluation.authenticity_reason)
                : null,
          },
        })
        .catch(() => {
          /* duplicate messageId */
        });
    }
  }

  await prisma.interview.update({
    where: { id: interviewId },
    data: {
      totalScore: overallScore,
      badgeLevel: badge,
      finalVerdict: evaluation.final_verdict != null ? String(evaluation.final_verdict) : null,
      scoreBreakdown: evaluation as object,
      status: "completed",
      completedAt: new Date(),
      questionPlan: [newState] as object[],
      questionIndex: newQuestionCount,
      coverageRatio,
      claimCredibilityRisk: claimRisk,
      engineeringSignal: engSignal,
      integrityFlag,
      riskScore: riskScoreTotal,
      evaluationPassCount: multi.passCount > 0 ? multi.passCount : null,
      evaluationScoreVariance: multi.scoreVariance.length
        ? (multi.scoreVariance as unknown as Prisma.InputJsonValue)
        : Prisma.JsonNull,
    },
  });

  prefetchCache.delete(interviewId);

  if (nonTechnical) {
    await prisma.verificationStage.upsert({
      where: { userId_stageName: { userId, stageName: "expert_interview" } },
      create: { userId, stageName: "expert_interview", status: "completed", score: overallScore },
      update: { status: "completed", score: overallScore },
    });
    try {
      await syncJobSeekerVerificationStatus(userId);
    } catch (e) {
      console.warn("[finalizeAiInterviewInBackground] syncJobSeekerVerificationStatus", e);
    }
  } else {
    await recordAiInterviewSubmittedForAdminReview({
      userId,
      interviewId,
      score: overallScore,
    });
  }

  return { overallScore, badgeLevel: badge, evaluation };
}

export async function handlePartialTranscript(interviewId: string, text: string, userId: string): Promise<void> {
  const interview = await prisma.interview.findUnique({
    where: { id: interviewId },
    include: { user: { include: { jobSeekerProfile: true } } },
  });
  if (!interview || interview.userId !== userId) return;

  const rawPlan = interview.questionPlan;
  const st =
    Array.isArray(rawPlan) && rawPlan[0] && typeof rawPlan[0] === "object"
      ? (rawPlan[0] as AdversarialState)
      : null;
  if (!st) return;

  const concepts = await extractConcepts(text);
  if (!concepts.length) return;

  const resumeContext = buildResumeContext(interview.user?.jobSeekerProfile);
  const questions = await prefetchFollowups(concepts, resumeContext, st.sprint, st.persona);

  if (questions.length) {
    setPrefetchQuestions(interviewId, questions);
  }

  const t = text.trim();
  if (t.length >= 12) {
    prunePartialAgentCache();
    const jp = interview.user?.jobSeekerProfile;
    const resume =
      [jp?.about, jp?.workExperience, jp?.skills ? JSON.stringify(jp.skills) : ""].filter(Boolean).join("\n") ||
      resumeContext;
    try {
      const [weakness, discrepancy] = await Promise.all([
        detectWeakness(st.lastQuestion, t, st.sprint, st.weaknesses ?? [], { tier: "fast" }),
        checkDiscrepancy(resume, t, { tier: "fast" }),
      ]);
      partialAgentCache.set(interviewId, {
        weakness,
        discrepancy,
        partial_text: t,
        ts: Date.now(),
      });
    } catch (e) {
      console.warn("[interview/v2/partial agents]", e);
    }
  }
}
