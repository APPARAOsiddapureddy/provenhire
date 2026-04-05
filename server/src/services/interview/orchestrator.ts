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

const prefetchCache: Map<string, string[]> = new Map();

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
};

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

  let followup: string;
  const cached = prefetchCache.get(interviewId);

  if (discrepancy.conflict && discrepancy.severity === "high") {
    followup = await generateDiscrepancyFollowup(lastQuestion, answer, discrepancy, persona, resumeContext);
  } else if (weakness.severity === "high") {
    followup = await generateWeaknessFollowup(lastQuestion, answer, weakness, persona, resumeContext);
  } else if (cached && cached.length > 0) {
    followup = cached.shift()!;
    if (cached.length === 0) prefetchCache.delete(interviewId);
    else prefetchCache.set(interviewId, cached);
  } else {
    followup = await generateSprintQuestion(sprint, persona, resumeContext, history);
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
    prefetchCache.set(interviewId, questions);
  }
}
