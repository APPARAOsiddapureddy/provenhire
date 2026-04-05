import { prisma } from "../../config/prisma.js";
import { recordAiInterviewSubmittedForAdminReview } from "../humanInterviewGate.service.js";
import {
  extractConcepts,
  detectWeakness,
  checkDiscrepancy,
  evaluateReasoning,
  generateWeaknessFollowup,
  generateDiscrepancyFollowup,
  generateSprintQuestion,
  prefetchFollowups,
  evaluateFullInterview,
} from "./agents.js";

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
  1: "Tell me about a project you're proud of — what problem did it solve?",
  2: "Pick one core concept from your work — how does it actually work?",
  3: "You're building a real-time prediction system for millions — where do you start?",
};

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
  "What was the hardest bug or incident you debugged on that?",
  "If you rebuilt it today, what would you simplify first?",
  "Which part are you least comfortable defending in depth?",
  "What trade-off did you accept that others might question?",
  "How would you prove that design worked in production?",
  "What breaks first if traffic or data volume 10x overnight?",
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

/** Max consecutive "hard probe" questions (weakness / discrepancy). After this, force a normal sprint question for variety. */
const MAX_ADVERSARIAL_PROBE_STREAK = 2;

type FollowupBranch = "discrepancy_probe" | "weakness_probe" | "prefetch" | "sprint";

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
  /** How many turns in a row we asked a high-priority weakness or discrepancy follow-up. */
  adversarialProbeStreak?: number;
};

function normalizeQuestionLine(q: string): string {
  return q
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/^[¿?¡!]+/, "")
    .replace(/[?.!,;:]+$/g, "");
}

/** True if candidate is essentially the same as something we already asked (common LLM collapse on short prompts). */
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
    adversarialProbeStreak: 0,
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
    adversarialProbeStreak: 0,
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
  }
): Promise<{
  response: string;
  sprint: number;
  sprintName: string;
  persona: string;
  complete: boolean;
  weakness?: unknown;
  questionCount: number;
  turnId: string;
  totalScore?: number;
  badgeLevel?: string;
  evaluation?: Record<string, unknown>;
  remainingMinutes?: number;
  completionReason?: InterviewCompletionReason;
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

  const resumeContext = buildResumeContext(interview.user?.jobSeekerProfile);
  const jp = interview.user?.jobSeekerProfile;
  const resume =
    [jp?.about, jp?.workExperience, jp?.skills ? JSON.stringify(jp.skills) : ""].filter(Boolean).join("\n") ||
    resumeContext;

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

  const probeStreak = state.adversarialProbeStreak ?? 0;
  const atProbeLimit = probeStreak >= MAX_ADVERSARIAL_PROBE_STREAK;
  const askedForPrompt = priorAskedQuestions(history, lastQuestion);

  let followup: string;
  let nextProbeStreak = 0;
  let followupBranch: FollowupBranch = "sprint";

  if (discrepancy.conflict && discrepancy.severity === "high" && !atProbeLimit) {
    followupBranch = "discrepancy_probe";
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
    nextProbeStreak = probeStreak + 1;
  } else if (weakness.severity === "high" && !atProbeLimit) {
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
    nextProbeStreak = probeStreak + 1;
  } else {
    let prefetched: string | undefined;
    do {
      prefetched = popPrefetchQuestion(interviewId);
    } while (prefetched && isNearDuplicateQuestion(prefetched, askedForPrompt));

    if (prefetched) {
      followupBranch = "prefetch";
      followup = prefetched;
      nextProbeStreak = 0;
    } else {
      followup = await resolveDistinctQuestion(askedForPrompt, () =>
        generateSprintQuestion(sprint, persona, resumeContext, history, askedForPrompt)
      );
      nextProbeStreak = 0;
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
  const newReasoningSignals = [...reasoningSignals, reasoning];
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
    }
  }

  const interviewStartedAt =
    typeof state.interviewStartTime === "number" && Number.isFinite(state.interviewStartTime)
      ? state.interviewStartTime
      : Date.now();

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
    adversarialProbeStreak: nextProbeStreak,
  };

  if (isComplete) {
    let evaluation = await evaluateFullInterview(newHistory, resume, newWeaknesses, newReasoningSignals);
    if (!evaluation) {
      evaluation = {
        overall_score: 5,
        final_verdict: "Evaluation completed; detailed scoring unavailable.",
        strengths: [],
        weaknesses: ["Continue practicing structured technical explanations."],
        authenticity_concern: false,
        authenticity_reason: "",
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

    await prisma.interview.update({
      where: { id: interviewId },
      data: {
        totalScore: overallScore,
        badgeLevel: badge,
        finalVerdict:
          evaluation.final_verdict != null ? String(evaluation.final_verdict) : null,
        scoreBreakdown: evaluation as object,
        status: "completed",
        completedAt: new Date(),
        questionPlan: [newState] as object[],
        questionIndex: newQuestionCount,
      },
    });

    prefetchCache.delete(interviewId);

    await recordAiInterviewSubmittedForAdminReview({
      userId: interview.userId,
      interviewId,
      score: overallScore,
    });

    return {
      response: closingMessage,
      sprint: currentSprint,
      sprintName: currentSprintName,
      persona: currentPersona,
      complete: true,
      weakness,
      questionCount: newQuestionCount,
      turnId: userMessage.id,
      totalScore: overallScore,
      badgeLevel: badge,
      evaluation,
      completionReason: completionCheck.reason,
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
    sprint: currentSprint,
    sprintName: currentSprintName,
    persona: currentPersona,
    complete: false,
    weakness,
    questionCount: newQuestionCount,
    turnId: userMessage.id,
    remainingMinutes,
  };
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
