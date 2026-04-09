/**
 * Data track — Data System Design interview (LLD then HLD), interviewType "system_design".
 */
import { Prisma } from "@prisma/client";
import { prisma } from "../../config/prisma.js";
import { syncJobSeekerVerificationStatus } from "../certification.service.js";
import { detectDataSubtrack, type DataSubtrack } from "../../constants/verificationPipeline.js";
import {
  evaluateDataSystemDesignSession,
  generateDataSystemDesignQuestion,
} from "./agents.js";
import { sanitizeAiInterviewQuestionText } from "./orchestrator.js";

const ANSWERS_PER_PHASE = 5;
const MAX_MINUTES = 32;
export const DATA_SYSTEM_DESIGN_STAGE = "data_system_design";

type Phase = "lld" | "hld";

export type DataSystemDesignPlan = {
  phase: Phase;
  /** User answers completed in the current phase (0..ANSWERS_PER_PHASE). */
  answeredInPhase: number;
  history: { phase: Phase; question: string; answer: string }[];
  currentQuestion: string;
  interviewStartTime: number;
  dataSubtrack: DataSubtrack;
  jobRole: string;
  experienceLevel: string;
};

const LLD_OPENER =
  "We will start with low-level data design. Imagine you need to build a daily revenue reporting dataset for product and finance — multiple source systems, late-arriving rows, and strict audit requirements. Walk me through the core tables or data model you would propose, how you would handle incremental updates, and how you would validate correctness before the numbers reach executives.";

const HLD_OPENER =
  "Now let's zoom out to platform design. Same org is growing fast — you must support near-real-time experimentation metrics plus batch regulatory extracts. Outline the end-to-end architecture: ingestion, processing, storage, orchestration, and how you would monitor data quality and recover from failures at scale.";

function parsePlan(raw: unknown): DataSystemDesignPlan | null {
  if (!raw || typeof raw !== "object") return null;
  const p = raw as DataSystemDesignPlan;
  if (p.phase !== "lld" && p.phase !== "hld") return null;
  if (typeof p.currentQuestion !== "string") return null;
  return p as DataSystemDesignPlan;
}

function sessionTimedOut(plan: DataSystemDesignPlan): boolean {
  const t0 =
    typeof plan.interviewStartTime === "number" && Number.isFinite(plan.interviewStartTime)
      ? plan.interviewStartTime
      : Date.now();
  return Date.now() - t0 > MAX_MINUTES * 60_000;
}

function recentQuestionsFromPlan(plan: DataSystemDesignPlan): string[] {
  return plan.history.map((h) => h.question).filter(Boolean);
}

export async function startDataSystemDesignInterview(
  userId: string,
  jobRole: string,
  experienceLevel: "junior" | "mid" | "senior"
): Promise<{ interviewId: string; question: string; phase: Phase; totalUserTurns: number }> {
  const stage = await prisma.verificationStage.findUnique({
    where: { userId_stageName: { userId, stageName: DATA_SYSTEM_DESIGN_STAGE } },
  });
  if (!stage || stage.status !== "in_progress") {
    throw new Error("Open the Data System Design step from your verification pipeline first.");
  }

  const skillsDone = await prisma.verificationStage.findFirst({
    where: { userId, stageName: "data_skills_interview", status: "completed" },
  });
  if (!skillsDone) {
    throw new Error("Complete the Data AI Skills interview before starting Data System Design.");
  }

  const profile = await prisma.jobSeekerProfile.findUnique({
    where: { userId },
    select: { roleType: true, targetJobTitle: true, currentRole: true },
  });
  if (profile?.roleType !== "data") {
    throw new Error("Data System Design is only available on the data verification track.");
  }

  const existing = await prisma.interview.findFirst({
    where: { userId, interviewType: "system_design", status: "in_progress" },
    orderBy: { createdAt: "desc" },
  });
  if (existing) {
    const prev = parsePlan(existing.questionPlan);
    if (prev && !sessionTimedOut(prev)) {
      return {
        interviewId: existing.id,
        question: prev.currentQuestion,
        phase: prev.phase,
        totalUserTurns: prev.history.length,
      };
    }
    await prisma.interview.update({
      where: { id: existing.id },
      data: { status: "failed", completedAt: new Date(), finalVerdict: "superseded" },
    });
  }

  const dataSubtrack = detectDataSubtrack(profile.targetJobTitle ?? profile.currentRole);
  const plan: DataSystemDesignPlan = {
    phase: "lld",
    answeredInPhase: 0,
    history: [],
    currentQuestion: LLD_OPENER,
    interviewStartTime: Date.now(),
    dataSubtrack,
    jobRole,
    experienceLevel,
  };

  const interview = await prisma.interview.create({
    data: {
      userId,
      jobRole,
      experienceLevel,
      interviewType: "system_design",
      questionPlan: plan as unknown as Prisma.InputJsonValue,
      questionIndex: 0,
      status: "in_progress",
    },
  });

  await prisma.interviewMessage.create({
    data: {
      interviewId: interview.id,
      sender: "ai",
      message: LLD_OPENER,
      questionType: "data_system_design_lld",
      isFollowup: false,
    },
  });

  return {
    interviewId: interview.id,
    question: LLD_OPENER,
    phase: "lld",
    totalUserTurns: 0,
  };
}

export async function processDataSystemDesignTurn(
  interviewId: string,
  userId: string,
  answer: string
): Promise<{
  response: string;
  phase: Phase;
  complete: boolean;
  pass?: boolean;
  totalScore?: number;
  timeExpired?: boolean;
}> {
  const interview = await prisma.interview.findFirst({
    where: { id: interviewId, userId, interviewType: "system_design", status: "in_progress" },
  });
  if (!interview) throw new Error("Interview not found");

  const plan = parsePlan(interview.questionPlan);
  if (!plan) throw new Error("Invalid session state");

  if (sessionTimedOut(plan)) {
    await finalizeDataSystemDesignFailure(interviewId, userId, plan, "time_expired");
    return {
      response: "We have run out of time for this session. You can retry after the cooldown and retake policy.",
      phase: plan.phase,
      complete: true,
      pass: false,
      timeExpired: true,
    };
  }

  const trimmed = answer.trim();
  if (trimmed.length > 0 && trimmed.length < 25) {
    return {
      response: "Could you go a bit deeper — what concrete components, trade-offs, or metrics would you choose?",
      phase: plan.phase,
      complete: false,
    };
  }

  await prisma.interviewMessage.create({
    data: {
      interviewId,
      sender: "user",
      message: trimmed,
      questionType: plan.phase === "lld" ? "data_system_design_lld" : "data_system_design_hld",
      questionIndex: plan.history.length,
    },
  });

  const newHistory = [
    ...plan.history,
    { phase: plan.phase, question: plan.currentQuestion, answer: trimmed },
  ];
  let answered = plan.answeredInPhase + 1;
  let phase: Phase = plan.phase;
  let nextQuestion = "";

  const resumeBits = [
    interview.jobRole,
    `Subtrack: ${plan.dataSubtrack}`,
    `Level: ${plan.experienceLevel}`,
  ].join(" — ");

  if (answered >= ANSWERS_PER_PHASE) {
    if (phase === "lld") {
      phase = "hld";
      answered = 0;
      nextQuestion = HLD_OPENER;
      await prisma.interviewMessage.create({
        data: {
          interviewId,
          sender: "ai",
          message: nextQuestion,
          questionType: "data_system_design_hld",
          isFollowup: false,
        },
      });
    } else {
      const evalResult = await evaluateDataSystemDesignSession(newHistory, resumeBits, plan.dataSubtrack, plan.experienceLevel);
      return await finalizeDataSystemDesignComplete(interviewId, userId, {
        ...plan,
        phase,
        answeredInPhase: ANSWERS_PER_PHASE,
        history: newHistory,
        currentQuestion: "",
        interviewStartTime: plan.interviewStartTime,
        dataSubtrack: plan.dataSubtrack,
        jobRole: plan.jobRole,
        experienceLevel: plan.experienceLevel,
      }, evalResult);
    }
  } else {
    const asked = [...recentQuestionsFromPlan({ ...plan, history: newHistory }), plan.currentQuestion];
    nextQuestion = await generateDataSystemDesignQuestion(
      phase,
      newHistory.filter((h) => h.phase === phase).map((h) => ({ question: h.question, answer: h.answer })),
      resumeBits,
      plan.dataSubtrack,
      plan.experienceLevel,
      asked
    );
    nextQuestion = sanitizeAiInterviewQuestionText(nextQuestion);
    await prisma.interviewMessage.create({
      data: {
        interviewId,
        sender: "ai",
        message: nextQuestion,
        questionType: phase === "lld" ? "data_system_design_lld" : "data_system_design_hld",
        isFollowup: true,
      },
    });
  }

  const nextPlan: DataSystemDesignPlan = {
    ...plan,
    phase,
    answeredInPhase: answered,
    history: newHistory,
    currentQuestion: nextQuestion,
    interviewStartTime: plan.interviewStartTime,
  };

  await prisma.interview.update({
    where: { id: interviewId },
    data: { questionPlan: nextPlan as unknown as Prisma.InputJsonValue, questionIndex: newHistory.length },
  });

  return { response: nextQuestion, phase, complete: false };
}

async function finalizeDataSystemDesignFailure(
  interviewId: string,
  userId: string,
  plan: DataSystemDesignPlan,
  verdict: string
): Promise<void> {
  await prisma.interview.update({
    where: { id: interviewId },
    data: {
      status: "failed",
      completedAt: new Date(),
      finalVerdict: verdict,
      questionPlan: plan as unknown as Prisma.InputJsonValue,
    },
  });
  await prisma.verificationStage.updateMany({
    where: { userId, stageName: DATA_SYSTEM_DESIGN_STAGE },
    data: { status: "failed", score: 0, updatedAt: new Date() },
  });
  try {
    await syncJobSeekerVerificationStatus(userId);
  } catch {
    /* ignore */
  }
}

async function finalizeDataSystemDesignComplete(
  interviewId: string,
  userId: string,
  plan: DataSystemDesignPlan,
  evalResult: Awaited<ReturnType<typeof evaluateDataSystemDesignSession>>
): Promise<{
  response: string;
  phase: Phase;
  complete: boolean;
  pass?: boolean;
  totalScore?: number;
}> {
  const fallback = evalResult ?? {
    lldScore: 50,
    hldScore: 50,
    totalScore: 50,
    pass: false,
    summary: "Automated scoring unavailable.",
  };

  const pass = fallback.pass;
  const totalScore = fallback.totalScore;

  await prisma.interview.update({
    where: { id: interviewId },
    data: {
      status: pass ? "completed" : "failed",
      completedAt: new Date(),
      totalScore,
      lldScore: fallback.lldScore,
      hldScore: fallback.hldScore,
      finalVerdict: pass ? "passed" : "below_threshold",
      badgeLevel: pass ? "Skill Passport" : "Not verified",
      scoreBreakdown: {
        lld: fallback.lldScore,
        hld: fallback.hldScore,
        pass,
        summary: fallback.summary,
      } as unknown as Prisma.InputJsonValue,
      questionPlan: plan as unknown as Prisma.InputJsonValue,
    },
  });

  await prisma.verificationStage.updateMany({
    where: { userId, stageName: DATA_SYSTEM_DESIGN_STAGE },
    data: { status: pass ? "completed" : "failed", score: totalScore, updatedAt: new Date() },
  });

  try {
    await syncJobSeekerVerificationStatus(userId);
  } catch {
    /* ignore */
  }

  const closing = pass
    ? "Strong work — your Data System Design session is complete and saved to your verification profile."
    : "This session is complete. You did not meet the verification bar for this attempt; you can retry after the cooldown and retake policy.";

  return {
    response: closing,
    phase: "hld",
    complete: true,
    pass,
    totalScore,
  };
}

export async function getDataSystemDesignStatus(
  interviewId: string,
  userId: string
): Promise<{ status: string; phase: Phase | null; currentQuestion: string | null } | null> {
  const row = await prisma.interview.findFirst({
    where: { id: interviewId, userId, interviewType: "system_design" },
    select: { status: true, questionPlan: true },
  });
  if (!row) return null;
  const p = parsePlan(row.questionPlan);
  return {
    status: row.status,
    phase: p?.phase ?? null,
    currentQuestion: p?.currentQuestion ?? null,
  };
}
