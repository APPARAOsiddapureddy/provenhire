/**
 * System design interviews (LLD then HLD), interviewType "system_design".
 * - **Data track** (`data_system_design` stage): existing behavior, unchanged.
 * - **Software track** (`system_design_interview` stage): problem bank + software-focused follow-ups/eval.
 */
import { Prisma } from "@prisma/client";
import { prisma } from "../../config/prisma.js";
import { syncJobSeekerVerificationStatus } from "../certification.service.js";
import { detectDataSubtrack, type DataSubtrack } from "../../constants/verificationPipeline.js";
import {
  evaluateDataSystemDesignSession,
  generateDataSystemDesignQuestion,
  callGeminiJson,
  callGeminiText,
  formatAskedQuestionsBlock,
} from "./agents.js";
import { sanitizeAiInterviewQuestionText } from "./orchestrator.js";

const ANSWERS_PER_PHASE = 5;
const MAX_MINUTES = 32;
export const DATA_SYSTEM_DESIGN_STAGE = "data_system_design";
export const SOFTWARE_SYSTEM_DESIGN_STAGE = "system_design_interview";

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
  "We start with low-level data design. Build a daily revenue dataset for finance from several messy sources, with late rows and audit needs. In two or three short beats: core tables or model, how you incrementally refresh, and how you prove numbers are right before executives trust them.";

const HLD_OPENER =
  "Now zoom out. The same org needs near-real-time experiment metrics plus batch regulatory extracts as it scales. Outline ingestion, processing, storage, and orchestration — and how you watch data quality and recover when jobs fail.";

function parsePlan(raw: unknown): DataSystemDesignPlan | null {
  if (!raw || typeof raw !== "object") return null;
  const p = raw as Record<string, unknown>;
  /** Software sessions store `track: "software"` — must not be parsed as data (missing dataSubtrack). */
  if (p.track === "software") return null;
  const d = raw as DataSystemDesignPlan;
  if (d.phase !== "lld" && d.phase !== "hld") return null;
  if (typeof d.currentQuestion !== "string") return null;
  return d as DataSystemDesignPlan;
}

export type SoftwareSystemDesignPlan = {
  track: "software";
  phase: Phase;
  answeredInPhase: number;
  history: { phase: Phase; question: string; answer: string }[];
  currentQuestion: string;
  interviewStartTime: number;
  jobRole: string;
  experienceLevel: "mid" | "senior";
  problemTitle: string;
  lldSeed: string;
  hldSeed: string;
};

const SOFTWARE_SYSTEM_DESIGN_PROBLEMS = {
  mid: [
    {
      title: "URL Shortener Service",
      lldPrompt: `Design core entities and APIs for a URL shortener: create short link, redirect, basic analytics. How do you generate short codes safely, and what do you persist per URL?`,
      hldPrompt: `Scale it: massive redirect reads and growing writes. Outline services, storage, caching for hot links, low-latency redirects, and what breaks first at 10× load.`,
    },
    {
      title: "Notification Service",
      lldPrompt: `Model notifications across email, SMS, and push: entity fields, channel types, send API, and retries when a provider fails.`,
      hldPrompt: `At tens of millions of messages per day: queues between API and senders, provider rate limits, delivery tracking, at-least-once without annoying duplicates, and how you observe failures.`,
    },
    {
      title: "Rate Limiter",
      lldPrompt: `Design middleware for per-user, per-IP, and per-endpoint limits: public interface, config shape, and algorithm (token bucket, sliding window, or fixed window) with why.`,
      hldPrompt: `Distribute it across many API nodes: where counters live, races on concurrent requests, accuracy vs latency trade-off, and behaviour if the limiter store is unavailable.`,
    },
  ],
  senior: [
    {
      title: "Distributed Job Scheduler",
      lldPrompt: `Model jobs (one-off and cron), priorities, retries, and executor registration. How does state move from pending through running to terminal states?`,
      hldPrompt: `Across many regions: leader election or consensus, split-brain risk, routing work, monitoring, and upgrading the scheduler without stopping jobs.`,
    },
    {
      title: "Event Sourcing Payment System",
      lldPrompt: `Event-sourced payments: key aggregates, lifecycle events (authorize, capture, settle, refund), idempotency keys, and how read models stay derived from events.`,
      hldPrompt: `At very high TPS: event store partitioning, rebuilding corrupt projections, cross-service consistency, audit/PII boundaries, and avoiding dual-write traps.`,
    },
    {
      title: "Search Service",
      lldPrompt: `Full-text plus facets: document model mapping to an inverted index, query/response API shape, ranking signals, and the ingest path from document to searchable.`,
      hldPrompt: `Huge catalog: near-real-time indexing, index sharding, updates without long outages, p99 latency discipline, and safe A/B of ranking changes.`,
    },
  ],
} as const;

function parseSoftwarePlan(raw: unknown): SoftwareSystemDesignPlan | null {
  if (!raw || typeof raw !== "object") return null;
  const p = raw as Record<string, unknown>;
  if (p.track !== "software") return null;
  if (p.phase !== "lld" && p.phase !== "hld") return null;
  if (typeof p.currentQuestion !== "string") return null;
  if (typeof p.problemTitle !== "string" || typeof p.lldSeed !== "string" || typeof p.hldSeed !== "string") return null;
  if (p.experienceLevel !== "mid" && p.experienceLevel !== "senior") return null;
  return raw as SoftwareSystemDesignPlan;
}

function sessionTimedOutGeneric(plan: { interviewStartTime: number }): boolean {
  const t0 =
    typeof plan.interviewStartTime === "number" && Number.isFinite(plan.interviewStartTime)
      ? plan.interviewStartTime
      : Date.now();
  return Date.now() - t0 > MAX_MINUTES * 60_000;
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
    const prevData = parsePlan(existing.questionPlan);
    if (prevData && !sessionTimedOut(prevData)) {
      return {
        interviewId: existing.id,
        question: prevData.currentQuestion,
        phase: prevData.phase,
        totalUserTurns: prevData.history.length,
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

const SOFTWARE_LLD_EVALUATION = `
Evaluate this LLD response on these dimensions:
1. Entity/class design quality — are the right entities defined? are relationships correct?
2. API contract clarity — are endpoints or method signatures well-defined?
3. Database schema design — appropriate tables, columns, indexes, relationships
4. Core business logic representation — is the main logic captured in the design?
5. Separation of concerns — is the design modular and clean?

For mid-level: expect solid basic design, may miss edge cases.
For senior-level: expect clear separation of concerns, anticipation of edge cases,
and justification of design choices.
`;

const SOFTWARE_HLD_EVALUATION = `
Evaluate this HLD response on these dimensions:
1. Component architecture — what services/components exist and how they communicate
2. Database and storage choices — right tool for the workload, justified
3. Caching strategy — what is cached, where, and why
4. Scale handling — how does the system handle 10x current load
5. Failure mode awareness — what breaks first, how to recover
6. Trade-off articulation — candidate acknowledges alternatives and explains their choices

For mid-level: expect basic scaling awareness, may miss subtle failure modes.
For senior-level: expect deep failure mode thinking, cost awareness,
operational considerations, and acknowledgment of trade-offs.
`;

function pickSoftwareProblem(userId: string, experienceLevel: "mid" | "senior") {
  const problems = SOFTWARE_SYSTEM_DESIGN_PROBLEMS[experienceLevel];
  const tail = userId.slice(-4);
  const seed = parseInt(tail, 16);
  const index = ((Number.isFinite(seed) ? seed : tail.split("").reduce((a, c) => a + c.charCodeAt(0), 0)) + new Date().getDate()) % problems.length;
  return problems[index];
}

function recentQuestionsFromSoftwarePlan(plan: SoftwareSystemDesignPlan): string[] {
  return plan.history.map((h) => h.question).filter(Boolean);
}

async function generateSoftwareSystemDesignQuestion(
  phase: Phase,
  history: { question: string; answer: string }[],
  resumeContext: string,
  experienceLevel: "mid" | "senior",
  problemTitle: string,
  recentQuestions: string[]
): Promise<string> {
  const phaseGoal =
    phase === "lld"
      ? `Low-level SOFTWARE design for "${problemTitle}": classes/modules, API contracts, data model/schema, core algorithms, separation of concerns. ${SOFTWARE_LLD_EVALUATION}`
      : `High-level SOFTWARE architecture for "${problemTitle}": services, data stores, caching, scaling, failure modes, trade-offs. ${SOFTWARE_HLD_EVALUATION}`;
  const histBlock = history
    .slice(-6)
    .map((h, i) => `Q${i + 1}: ${h.question}\nA${i + 1}: ${h.answer}`)
    .join("\n\n");

  const text = await callGeminiText(
    `You are a technical interviewer for SOFTWARE system design. Ask one medium-length question (2–3 sentences, ~45–95 words). Use clear, plain English suitable for Indian professionals. Sound like a senior/staff software engineer — no "thank you" preambles. Output only the question.`,
    `Phase: ${phase.toUpperCase()}
${phaseGoal}
Candidate experience: ${experienceLevel}
Candidate context: ${resumeContext.slice(0, 900)}

Recent dialogue:
${histBlock || "(first follow-up after phase opener)"}

${formatAskedQuestionsBlock(recentQuestions)}

Generate the NEXT question only. It must advance the design discussion — not repeat prior angles.`,
    "balanced",
    { maxOutputTokens: 340 }
  );
  return (
    text.replace(/^["']|["']$/g, "").trim() ||
    (phase === "lld"
      ? "Walk me through the main classes or modules and how they interact."
      : "How would you scale this across multiple regions and handle partial failures?")
  );
}

async function evaluateSoftwareSystemDesignSession(
  history: { phase: Phase; question: string; answer: string }[],
  resumeContext: string,
  experienceLevel: "mid" | "senior",
  problemTitle: string
): Promise<{
  lldScore: number;
  hldScore: number;
  totalScore: number;
  pass: boolean;
  summary: string;
} | null> {
  const transcript = history
    .map((h, i) => `[${i + 1} | ${h.phase.toUpperCase()}]\nQ: ${h.question}\nA: ${h.answer}`)
    .join("\n\n");
  const result = (await callGeminiJson(
    `You score a SOFTWARE system design interview in two phases: LLD vs HLD.
Problem: ${problemTitle}
Experience level: ${experienceLevel}.

${SOFTWARE_LLD_EVALUATION}

${SOFTWARE_HLD_EVALUATION}

Return JSON only:
{
  "lld_score": <0-100>,
  "hld_score": <0-100>,
  "total_score": <0-100 optional — average of lld and hld if omitted>,
  "summary": "<2 sentences>"
}`,
    `RESUME/CONTEXT:\n${resumeContext.slice(0, 1200)}\n\nTRANSCRIPT:\n${transcript.slice(0, 12000)}`,
    "balanced"
  )) as {
    lld_score?: number;
    hld_score?: number;
    total_score?: number;
    summary?: string;
  } | null;

  if (!result) return null;
  const lld = Math.min(100, Math.max(0, Math.round(Number(result.lld_score) || 0)));
  const hld = Math.min(100, Math.max(0, Math.round(Number(result.hld_score) || 0)));
  const total =
    typeof result.total_score === "number" && Number.isFinite(result.total_score)
      ? Math.min(100, Math.max(0, Math.round(result.total_score)))
      : Math.round((lld + hld) / 2);
  const threshold = experienceLevel === "senior" ? 65 : 60;
  const pass = total >= threshold;
  return {
    lldScore: lld,
    hldScore: hld,
    totalScore: total,
    pass,
    summary: String(result.summary ?? "").trim() || "Evaluation complete.",
  };
}

async function finalizeSoftwareSystemDesignFailure(
  interviewId: string,
  userId: string,
  plan: SoftwareSystemDesignPlan,
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
    where: { userId, stageName: SOFTWARE_SYSTEM_DESIGN_STAGE },
    data: { status: "failed", score: 0, updatedAt: new Date() },
  });
  try {
    await syncJobSeekerVerificationStatus(userId);
  } catch {
    /* ignore */
  }
}

async function finalizeSoftwareSystemDesignComplete(
  interviewId: string,
  userId: string,
  plan: SoftwareSystemDesignPlan,
  evalResult: NonNullable<Awaited<ReturnType<typeof evaluateSoftwareSystemDesignSession>>>
): Promise<{
  response: string;
  phase: Phase;
  complete: boolean;
  pass?: boolean;
  totalScore?: number;
  lldScore?: number;
  hldScore?: number;
}> {
  const pass = evalResult.pass;
  const totalScore = evalResult.totalScore;

  await prisma.interview.update({
    where: { id: interviewId },
    data: {
      status: pass ? "completed" : "failed",
      completedAt: new Date(),
      totalScore,
      lldScore: evalResult.lldScore,
      hldScore: evalResult.hldScore,
      finalVerdict: pass ? "passed" : "below_threshold",
      badgeLevel: pass ? "Skill Passport" : "Not verified",
      scoreBreakdown: {
        lld: evalResult.lldScore,
        hld: evalResult.hldScore,
        pass,
        summary: evalResult.summary,
      } as unknown as Prisma.InputJsonValue,
      questionPlan: plan as unknown as Prisma.InputJsonValue,
    },
  });

  await prisma.verificationStage.updateMany({
    where: { userId, stageName: SOFTWARE_SYSTEM_DESIGN_STAGE },
    data: { status: pass ? "completed" : "failed", score: totalScore, updatedAt: new Date() },
  });

  try {
    await syncJobSeekerVerificationStatus(userId);
  } catch {
    /* ignore */
  }

  const closing = pass
    ? "Strong work — your System Design session is complete and saved to your verification profile."
    : "This session is complete. You did not meet the verification bar for this attempt; you can retry after the cooldown and retake policy.";

  return {
    response: closing,
    phase: "hld",
    complete: true,
    pass,
    totalScore,
    lldScore: evalResult.lldScore,
    hldScore: evalResult.hldScore,
  };
}

export async function startSoftwareSystemDesignInterview(
  userId: string,
  jobRole: string,
  experienceLevel: "mid" | "senior"
): Promise<{
  interviewId: string;
  question: string;
  title: string;
  lldPrompt: string;
  hldPrompt: string;
  phase: Phase;
  totalUserTurns: number;
  lldDurationMinutes: number;
  hldDurationMinutes: number;
}> {
  const stage = await prisma.verificationStage.findUnique({
    where: { userId_stageName: { userId, stageName: SOFTWARE_SYSTEM_DESIGN_STAGE } },
  });
  if (!stage || stage.status !== "in_progress") {
    throw new Error("Open the System Design step from your verification pipeline first.");
  }

  const skillsDone = await prisma.verificationStage.findFirst({
    where: { userId, stageName: "ai_skills_interview", status: "completed" },
  });
  if (!skillsDone) {
    throw new Error("Complete the AI Skills interview before starting System Design.");
  }

  const profile = await prisma.jobSeekerProfile.findUnique({
    where: { userId },
    select: { roleType: true, targetJobTitle: true, currentRole: true },
  });
  const rt = profile?.roleType ?? "technical";
  if (rt === "data" || rt === "non_technical") {
    throw new Error("System Design (software) is only available on the software verification track.");
  }

  const existing = await prisma.interview.findFirst({
    where: { userId, interviewType: "system_design", status: "in_progress" },
    orderBy: { createdAt: "desc" },
  });
  if (existing) {
    const prevSoft = parseSoftwarePlan(existing.questionPlan);
    if (prevSoft && !sessionTimedOutGeneric(prevSoft)) {
      return {
        interviewId: existing.id,
        question: prevSoft.currentQuestion,
        title: prevSoft.problemTitle,
        lldPrompt: prevSoft.lldSeed,
        hldPrompt: prevSoft.hldSeed,
        phase: prevSoft.phase,
        totalUserTurns: prevSoft.history.length,
        lldDurationMinutes: 15,
        hldDurationMinutes: 15,
      };
    }
    await prisma.interview.update({
      where: { id: existing.id },
      data: { status: "failed", completedAt: new Date(), finalVerdict: "superseded" },
    });
  }

  const problem = pickSoftwareProblem(userId, experienceLevel);
  const plan: SoftwareSystemDesignPlan = {
    track: "software",
    phase: "lld",
    answeredInPhase: 0,
    history: [],
    currentQuestion: problem.lldPrompt,
    interviewStartTime: Date.now(),
    jobRole,
    experienceLevel,
    problemTitle: problem.title,
    lldSeed: problem.lldPrompt,
    hldSeed: problem.hldPrompt,
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
      message: problem.lldPrompt,
      questionType: "software_system_design_lld",
      isFollowup: false,
    },
  });

  return {
    interviewId: interview.id,
    question: problem.lldPrompt,
    title: problem.title,
    lldPrompt: problem.lldPrompt,
    hldPrompt: problem.hldPrompt,
    phase: "lld",
    totalUserTurns: 0,
    lldDurationMinutes: 15,
    hldDurationMinutes: 15,
  };
}

export async function processSoftwareSystemDesignTurn(
  interviewId: string,
  userId: string,
  answer: string
): Promise<{
  response: string;
  phase: Phase;
  complete: boolean;
  pass?: boolean;
  totalScore?: number;
  lldScore?: number;
  hldScore?: number;
  timeExpired?: boolean;
}> {
  const interview = await prisma.interview.findFirst({
    where: { id: interviewId, userId, interviewType: "system_design", status: "in_progress" },
  });
  if (!interview) throw new Error("Interview not found");

  const plan = parseSoftwarePlan(interview.questionPlan);
  if (!plan) throw new Error("Invalid session state");

  if (sessionTimedOutGeneric(plan)) {
    await finalizeSoftwareSystemDesignFailure(interviewId, userId, plan, "time_expired");
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
      questionType: plan.phase === "lld" ? "software_system_design_lld" : "software_system_design_hld",
      questionIndex: plan.history.length,
    },
  });

  const newHistory = [...plan.history, { phase: plan.phase, question: plan.currentQuestion, answer: trimmed }];
  let answered = plan.answeredInPhase + 1;
  let phase: Phase = plan.phase;
  let nextQuestion = "";

  const resumeBits = [interview.jobRole, `Problem: ${plan.problemTitle}`, `Level: ${plan.experienceLevel}`].join(" — ");

  if (answered >= ANSWERS_PER_PHASE) {
    if (phase === "lld") {
      phase = "hld";
      answered = 0;
      nextQuestion = plan.hldSeed;
      await prisma.interviewMessage.create({
        data: {
          interviewId,
          sender: "ai",
          message: nextQuestion,
          questionType: "software_system_design_hld",
          isFollowup: false,
        },
      });
    } else {
      const evalResult = await evaluateSoftwareSystemDesignSession(
        newHistory,
        resumeBits,
        plan.experienceLevel,
        plan.problemTitle
      );
      if (!evalResult) {
        const fallback = {
          lldScore: 50,
          hldScore: 50,
          totalScore: 50,
          pass: false,
          summary: "Automated scoring unavailable.",
        };
        return await finalizeSoftwareSystemDesignComplete(interviewId, userId, { ...plan, phase, answeredInPhase: answered, history: newHistory, currentQuestion: "" }, fallback);
      }
      return await finalizeSoftwareSystemDesignComplete(
        interviewId,
        userId,
        {
          ...plan,
          phase,
          answeredInPhase: ANSWERS_PER_PHASE,
          history: newHistory,
          currentQuestion: "",
          interviewStartTime: plan.interviewStartTime,
        },
        evalResult
      );
    }
  } else {
    const asked = [...recentQuestionsFromSoftwarePlan({ ...plan, history: newHistory }), plan.currentQuestion];
    nextQuestion = await generateSoftwareSystemDesignQuestion(
      phase,
      newHistory.filter((h) => h.phase === phase).map((h) => ({ question: h.question, answer: h.answer })),
      resumeBits,
      plan.experienceLevel,
      plan.problemTitle,
      asked
    );
    nextQuestion = sanitizeAiInterviewQuestionText(nextQuestion);
    await prisma.interviewMessage.create({
      data: {
        interviewId,
        sender: "ai",
        message: nextQuestion,
        questionType: phase === "lld" ? "software_system_design_lld" : "software_system_design_hld",
        isFollowup: true,
      },
    });
  }

  const nextPlan: SoftwareSystemDesignPlan = {
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

export async function getSoftwareSystemDesignStatus(
  interviewId: string,
  userId: string
): Promise<{ status: string; phase: Phase | null; currentQuestion: string | null } | null> {
  const row = await prisma.interview.findFirst({
    where: { id: interviewId, userId, interviewType: "system_design" },
    select: { status: true, questionPlan: true },
  });
  if (!row) return null;
  const p = parseSoftwarePlan(row.questionPlan);
  return {
    status: row.status,
    phase: p?.phase ?? null,
    currentQuestion: p?.currentQuestion ?? null,
  };
}
