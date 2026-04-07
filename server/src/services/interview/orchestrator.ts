import { Prisma } from "@prisma/client";
import { prisma } from "../../config/prisma.js";
import { recordAiInterviewSubmittedForAdminReview } from "../humanInterviewGate.service.js";
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
  adaptFollowup,
  applyReasoningHonestyCap,
} from "./agents.js";
import { findFollowupsForQuestionText } from "./questionBankService.js";
import { computeWeaknessCoverageRatio, evaluateFullInterviewMultiPass } from "./evaluationService.js";

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

const SPRINT_OPENERS: Record<number, string> = {
  1: `Let's start with something concrete from your background. Tell me about a project you've worked on that you're genuinely proud of — what problem were you solving, what did you personally build, and what made it technically interesting to you?`,
  2: `Now let's go a level deeper into the concepts behind your work. Pick one technical idea that sits at the core of something you've built — something you really had to understand to get it right. How would you explain it to someone encountering it for the first time?`,
  3: `Let's think through a design problem together. Imagine you're building a system that needs to serve real-time predictions for a few million users — the kind of scale where simple solutions start breaking. Where would you start, and what do you think the hardest parts would be to get right?`,
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
  "I'd like to understand how you actually chased that down in production. What was the hardest bug or incident you debugged on that system, and what did you learn from it?",
  "If you had to rebuild that today with what you know now, what would you simplify first, and what would you definitely keep?",
  "Which part of that design or implementation are you least comfortable defending in depth if a senior engineer pressed you on it?",
  "What trade-off did you accept on that project that others on the team might have questioned — and why was it still the right call for your constraints?",
  "How would you prove to yourself — not just on paper — that that design really worked in production under real load?",
  "If traffic or data volume jumped 10x overnight, what breaks first in your approach, and what would you change first to survive?",
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
  followupDecision: FollowupBranch;
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
};

type AdversarialState = {
  sprint: number;
  persona: string;
  sprintName: string;
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
};

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
  return parts.join("\n");
}

export async function startAdversarialInterview(
  interviewId: string
): Promise<{ question: string; sprint: number; sprintName: string; persona: string }> {
  const row = await prisma.interview.findUnique({ where: { id: interviewId }, select: { jobRole: true } });
  const jobRole = row?.jobRole ?? "Software Engineer";
  const opener = SPRINT_OPENERS[1];
  const initial: AdversarialState = {
    sprint: 1,
    persona: "curious_lead",
    sprintName: "Project Defense",
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
    sprintName: "Project Defense",
    persona: "curious_lead",
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
    lastQuestion: SPRINT_OPENERS[1],
    interviewStartTime: Date.now(),
    consecutiveHighWeaknessCount: 0,
    lastWeaknessType: null,
    probedClaims: [],
    currentQuestionFollowups: [],
    currentQuestionFollowupAsked: false,
    turnLog: [],
  };
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
): Promise<{
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
}> {
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
      response: prompt,
      acknowledgement: "",
      sprint,
      sprintName: stateSprintName ?? SPRINTS[1].name,
      persona,
      complete: false,
      questionCount: prevQCount,
      turnId: tid,
      fragmentRetry: true,
      remainingMinutes,
    };
  }

  const resumeContext = buildResumeContext(interview.user?.jobSeekerProfile);
  const jp = interview.user?.jobSeekerProfile;
  const resume =
    [jp?.about, jp?.workExperience, jp?.skills ? JSON.stringify(jp.skills) : ""].filter(Boolean).join("\n") ||
    resumeContext;

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

  const wasChallenged =
    weaknesses.length > 0 && weaknesses[weaknesses.length - 1]?.severity === "high";

  const [weakness, discrepancy, reasoning, concepts] = await Promise.all([
    detectWeakness(lastQuestion, answer, sprint, weaknesses),
    checkDiscrepancy(resume, answer),
    evaluateReasoning(answer, wasChallenged),
    extractConcepts(answer),
  ]);

  const agentCompleteMs = Date.now();
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
  const forceSprintQuestion = consec >= MAX_CONSECUTIVE_HIGH_SAME_TYPE;

  const askedForPrompt = priorAskedQuestions(history, lastQuestion);
  let probedClaims = [...(state.probedClaims ?? [])];
  let currentQuestionFollowups = [...(state.currentQuestionFollowups ?? [])];
  let currentQuestionFollowupAsked = state.currentQuestionFollowupAsked ?? false;

  let followup: string;
  let followupBranch: FollowupBranch = "sprint_question";
  let pivoting = false;
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
        lastQuestion,
        answer,
        discrepancy,
        persona,
        resumeContext,
        askedForPrompt
      )
    );
  } else if (weakness.severity === "high" && !forceSprintQuestion) {
    followupBranch = "weakness_probe";
    followup = await resolveDistinctQuestion(askedForPrompt, () =>
      generateWeaknessFollowup(
        lastQuestion,
        answer,
        weakness,
        persona,
        resumeContext,
        askedForPrompt
      )
    );
  } else if (
    weakness.severity !== "high" &&
    currentQuestionFollowups.length > 0 &&
    !currentQuestionFollowupAsked
  ) {
    followupBranch = "followup_deepen";
    const template = currentQuestionFollowups[0]!;
    followup = await adaptFollowup(template, answer, persona);
    currentQuestionFollowups = currentQuestionFollowups.slice(1);
    currentQuestionFollowupAsked = true;
  } else {
    let prefetched: string | undefined;
    do {
      prefetched = popPrefetchQuestion(interviewId);
    } while (prefetched && isNearDuplicateQuestion(prefetched, askedForPrompt));

    if (prefetched && isStillRelevant(prefetched, answer, concepts)) {
      followupBranch = "prefetch";
      followup = prefetched;
    } else {
      followup = await resolveDistinctQuestion(askedForPrompt, () =>
        generateSprintQuestion(sprint, persona, resumeContext, history, askedForPrompt)
      );
      if (forceSprintQuestion) {
        followupBranch = "forced_sprint";
        pivoting = true;
      } else {
        followupBranch = "sprint_question";
      }
      currentQuestionFollowups = findFollowupsForQuestionText(followup, interview.jobRole);
      currentQuestionFollowupAsked = false;
    }
  }

  const newHistory = [
    ...history,
    {
      question: lastQuestion,
      answer,
      weakness,
      concepts,
      discrepancy,
      reasoning,
      sprint,
      persona,
    },
  ];

  const newWeaknesses = weakness.type ? [...weaknesses, weakness] : weaknesses;
  const newReasoningSignals = [...reasoningSignals, reasoning as unknown as Record<string, unknown>];
  const newQuestionCount = prevQCount + 1;
  let newSprintQuestionCount = prevSprintQ + 1;

  let currentSprint = sprint;
  let currentPersona = persona;
  let currentSprintName = stateSprintName;
  let currentSprintQuestionCount = newSprintQuestionCount;
  let sprintAdvanced = false;

  if (newSprintQuestionCount >= QUESTIONS_PER_SPRINT) {
    const nextSprint = sprint + 1;
    if (nextSprint <= 3) {
      currentSprint = nextSprint;
      currentPersona = SPRINTS[nextSprint].persona;
      currentSprintName = SPRINTS[nextSprint].name;
      currentSprintQuestionCount = 0;
      sprintAdvanced = true;
      followup = SPRINT_OPENERS[nextSprint];
      currentQuestionFollowups = findFollowupsForQuestionText(followup, interview.jobRole);
      currentQuestionFollowupAsked = false;
      consec = 0;
      lastWT = null;
      pivoting = true;
    }
  }

  const questionReadyMs = Date.now();
  const completionCheck = isInterviewComplete({
    questionCount: newQuestionCount,
    sprint: currentSprint,
    sprintQuestionCount: currentSprintQuestionCount,
    interviewStartTime: interviewStartedAt,
  });

  const isComplete = completionCheck.complete;

  if (!isComplete) {
    followup = sanitizeAiInterviewQuestionText(followup);
  }

  const logTurnId = options?.clientTurnId?.trim() || userMessage.id;
  const turnLogEntry: TurnLogEntry = {
    turnId: logTurnId,
    questionIndex: prevQCount,
    weaknessSeverity: String(weakness.severity ?? ""),
    followupDecision: followupBranch,
    questionSource: followupBranch,
    agentOutputsSnapshot: JSON.stringify({
      weakness,
      discrepancy: { conflict: discrepancy.conflict, severity: discrepancy.severity },
      reasoning,
    }).slice(0, 8000),
    timestamp: new Date().toISOString(),
    whisperLatencyMs: options?.whisperLatencyMs ?? null,
    agentPipelineMs: agentCompleteMs - turnStartMs,
    questionGenerationMs: questionReadyMs - agentCompleteMs,
    totalTurnLatencyMs: questionReadyMs - turnStartMs,
    answerLengthChars: answer.length,
    pasteCount: options?.pasteCount ?? 0,
    timeToSubmitSeconds: options?.timeToSubmitSeconds ?? null,
    answerSnapshot: answer.slice(0, 200),
  };
  const turnLog = [...(state.turnLog ?? []), turnLogEntry];

  const sprintClosing =
    "That wraps up our interview. Well done for getting through all three sprints. Your report is being generated now.";
  const timeClosing =
    "We've reached the end of our time together. Thank you for the conversation — your report is being generated now.";
  const closingMessage = completionCheck.reason === "time_limit" ? timeClosing : sprintClosing;
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
      isFollowup: !sprintAdvanced && weakness.severity === "high",
    },
  });

  const newState: AdversarialState = {
    sprint: currentSprint,
    persona: currentPersona,
    sprintName: currentSprintName,
    questionCount: newQuestionCount,
    sprintQuestionCount: currentSprintQuestionCount,
    history: newHistory,
    weaknesses: newWeaknesses,
    reasoningSignals: newReasoningSignals,
    lastQuestion: isComplete ? "" : followup,
    interviewStartTime: interviewStartedAt,
    consecutiveHighWeaknessCount: consec,
    lastWeaknessType: lastWT,
    probedClaims,
    currentQuestionFollowups,
    currentQuestionFollowupAsked,
    turnLog,
  };

  const responseTurnId = options?.clientTurnId?.trim() || userMessage.id;

  if (isComplete) {
    const finalizePayload: FinalizeAiInterviewParams = {
      interviewId,
      userId: interview.userId,
      newHistory,
      resume,
      newWeaknesses,
      newReasoningSignals,
      newQuestionCount,
      newState,
      jobRole: interview.jobRole,
      experienceLevel: interview.experienceLevel,
    };

    const useSyncEval =
      process.env.INTERVIEW_SYNC_EVAL === "1" || process.env.INTERVIEW_SYNC_EVAL === "true";

    if (!useSyncEval) {
      await prisma.interview.update({
        where: { id: interviewId },
        data: {
          status: "evaluating",
          questionPlan: [newState] as object[],
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
        response: closingMessage,
        acknowledgement: "",
        sprint: currentSprint,
        sprintName: currentSprintName,
        persona: currentPersona,
        complete: true,
        evaluating: true,
        weakness,
        questionCount: newQuestionCount,
        turnId: responseTurnId,
        completionReason: completionCheck.reason,
        timeExpired: completionCheck.reason === "time_limit",
        message:
          "Your interview is being evaluated. Your results will appear shortly — please keep this page open.",
      };
    }

    const { overallScore, badgeLevel: badge, evaluation } =
      await finalizeAiInterviewInBackground(finalizePayload);

    return {
      response: closingMessage,
      acknowledgement: "",
      sprint: currentSprint,
      sprintName: currentSprintName,
      persona: currentPersona,
      complete: true,
      weakness,
      questionCount: newQuestionCount,
      turnId: responseTurnId,
      totalScore: overallScore,
      badgeLevel: badge,
      evaluation,
      completionReason: completionCheck.reason,
      timeExpired: completionCheck.reason === "time_limit",
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

  return {
    response: followup,
    acknowledgement: pickTurnAcknowledgement(),
    sprint: currentSprint,
    sprintName: currentSprintName,
    persona: currentPersona,
    complete: false,
    weakness,
    questionCount: newQuestionCount,
    turnId: responseTurnId,
    pivoting,
    remainingMinutes,
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

  await recordAiInterviewSubmittedForAdminReview({
    userId,
    interviewId,
    score: overallScore,
  });

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
}
