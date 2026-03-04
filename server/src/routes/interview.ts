import { Router } from "express";
import { z } from "zod";
import { requireAuth, AuthedRequest } from "../middleware/auth.js";
import { prisma } from "../config/prisma.js";
import { conductInterviewPrompt, evaluateInterview } from "../services/ai.service.js";

export const interviewRouter = Router();

type QuestionPlanItem = { type: string; prompt: string };

function buildQuestionPlan(role: string): QuestionPlanItem[] {
  const base = [
    { type: "conceptual", prompt: "Explain the most important principles you apply in your day-to-day work." },
    { type: "conceptual", prompt: "Describe a core concept in your domain and how you apply it in production." },
    { type: "scenario", prompt: "Walk through how you would troubleshoot a critical issue in a production system." },
    { type: "scenario", prompt: "You inherit a legacy system with performance issues. What is your approach?" },
    { type: "problem_solving", prompt: "Solve a problem you recently faced and explain your reasoning step-by-step." },
    { type: "problem_solving", prompt: "Design a solution for a feature that requires trade-offs. Explain the trade-offs." },
    { type: "behavioral", prompt: "Describe a situation where you handled conflicting feedback from stakeholders." },
  ];

  if (role.toLowerCase().includes("frontend")) {
    return [
      { type: "conceptual", prompt: "Explain the component and state management principles you rely on in React." },
      { type: "conceptual", prompt: "Describe how the browser rendering pipeline impacts UI performance." },
      { type: "scenario", prompt: "A key UI flow is slow on low-end devices. How would you diagnose and fix it?" },
      { type: "scenario", prompt: "How would you implement feature flags for a UI release with staged rollout?" },
      { type: "problem_solving", prompt: "Design a robust form system with validation, autosave, and error recovery." },
      { type: "problem_solving", prompt: "How would you refactor a monolithic React app into maintainable modules?" },
      base[6],
    ];
  }

  if (role.toLowerCase().includes("backend")) {
    return [
      { type: "conceptual", prompt: "Explain how you design reliable APIs with clear contracts and versioning." },
      { type: "conceptual", prompt: "Describe how you approach data modeling for scalability and integrity." },
      { type: "scenario", prompt: "A critical endpoint is timing out. Walk through your debugging plan." },
      { type: "scenario", prompt: "How would you design a background job system with retries and idempotency?" },
      { type: "problem_solving", prompt: "Design a caching strategy for a high-traffic read-heavy system." },
      { type: "problem_solving", prompt: "Explain how you would prevent race conditions in a multi-worker environment." },
      base[6],
    ];
  }

  if (role.toLowerCase().includes("data")) {
    return [
      { type: "conceptual", prompt: "Explain how you validate data quality and avoid biased insights." },
      { type: "conceptual", prompt: "Describe a statistical concept you apply frequently and why." },
      { type: "scenario", prompt: "A dashboard shows conflicting metrics across teams. How would you investigate?" },
      { type: "scenario", prompt: "You must deliver insights from incomplete data. What is your approach?" },
      { type: "problem_solving", prompt: "Design an ETL pipeline for scale and reliability." },
      { type: "problem_solving", prompt: "How would you model a cohort analysis for retention?" },
      base[6],
    ];
  }

  return base;
}

function isWeakAnswer(answer: string) {
  const wordCount = answer.trim().split(/\s+/).filter(Boolean).length;
  return wordCount < 25;
}

function computeScore(payload: any) {
  const ta = Number(payload.technical_accuracy || 0);
  const dk = Number(payload.depth_of_knowledge || 0);
  const ps = Number(payload.problem_solving || 0);
  const cc = Number(payload.communication_clarity || 0);
  const total = Math.round((ta * 0.4 + dk * 0.25 + ps * 0.2 + cc * 0.15) * 10);
  let badge = "Not Verified";
  if (total >= 90) badge = "Elite Verified";
  else if (total >= 75) badge = "Gold Verified";
  else if (total >= 60) badge = "Silver Verified";
  return { total, badge };
}

const BASIC_QUESTIONS = [
  { type: "conceptual", prompt: "Tell me about your background and what drew you to this field." },
  { type: "conceptual", prompt: "Describe a key concept or technology you use in your work." },
  { type: "scenario", prompt: "Walk me through how you would approach a new project from start to finish." },
  { type: "scenario", prompt: "Describe a situation where you had to debug or fix an unexpected issue." },
  { type: "problem_solving", prompt: "How do you prioritize when you have multiple tasks with tight deadlines?" },
  { type: "behavioral", prompt: "Tell me about a time you collaborated with others to achieve a goal." },
];

interviewRouter.post("/start", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const schema = z.object({ jobRole: z.string().min(1) });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid payload" });
    const { jobRole } = parsed.data;

    let plan = buildQuestionPlan(jobRole);
    if (!plan?.length) plan = BASIC_QUESTIONS;
    const interview = await prisma.interview.create({
    data: {
      userId: req.user!.id,
      jobRole,
      questionPlan: plan,
      questionIndex: 0,
      status: "in_progress",
    },
  });

  const question = plan[0].prompt;
  await prisma.interviewMessage.create({
    data: {
      interviewId: interview.id,
      sender: "ai",
      message: question,
      questionType: plan[0].type,
      isFollowup: false,
    },
  });

  return res.json({ interviewId: interview.id, question, questionIndex: 1, totalQuestions: plan.length });
  } catch (e) {
    console.error("[interview/start]", e);
    return res.status(500).json({ error: e instanceof Error ? e.message : "Failed to start interview" });
  }
});

interviewRouter.post("/respond", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const schema = z.object({
      interviewId: z.string().min(1),
      answer: z.string().min(1),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid payload" });

    const { interviewId, answer } = parsed.data;
    const interview = await prisma.interview.findUnique({ where: { id: interviewId } });
  if (!interview || interview.userId !== req.user!.id) {
    return res.status(404).json({ error: "Interview not found" });
  }

  const plan = (interview.questionPlan as QuestionPlanItem[]) || [];
  const currentIndex = interview.questionIndex;
  const currentQuestion = plan[currentIndex];

  await prisma.interviewMessage.create({
    data: {
      interviewId,
      sender: "user",
      message: answer,
      questionType: currentQuestion?.type ?? null,
    },
  });

  if (currentQuestion && isWeakAnswer(answer)) {
    const followUp = await conductInterviewPrompt(interview.jobRole, JSON.stringify(plan), answer);
    await prisma.interviewMessage.create({
      data: {
        interviewId,
        sender: "ai",
        message: followUp,
        questionType: currentQuestion.type,
        isFollowup: true,
      },
    });
    return res.json({ question: followUp, questionIndex: currentIndex + 1, totalQuestions: plan.length, isFollowup: true });
  }

  const nextIndex = currentIndex + 1;
  if (nextIndex >= plan.length) {
    const transcript = await prisma.interviewMessage.findMany({
      where: { interviewId },
      orderBy: { createdAt: "asc" },
    });
    const transcriptText = transcript.map((m) => `${m.sender.toUpperCase()}: ${m.message}`).join("\n");
    const evaluationRaw = await evaluateInterview(transcriptText);
    let evaluation: any;
    try {
      evaluation = JSON.parse(evaluationRaw);
    } catch {
      evaluation = {
        technical_accuracy: 0,
        depth_of_knowledge: 0,
        problem_solving: 0,
        communication_clarity: 0,
        strengths: [],
        weaknesses: [],
        final_verdict: "Unable to evaluate",
        confidence_level: "Low",
      };
    }
    const { total, badge } = computeScore(evaluation);
    await prisma.interview.update({
      where: { id: interviewId },
      data: {
        totalScore: total,
        badgeLevel: badge,
        finalVerdict: evaluation.final_verdict ?? null,
        scoreBreakdown: evaluation,
        status: "completed",
        completedAt: new Date(),
      },
    });
    return res.json({ completed: true, evaluation, totalScore: total, badgeLevel: badge });
  }

  const nextQuestion = plan[nextIndex].prompt;
  await prisma.interview.update({
    where: { id: interviewId },
    data: { questionIndex: nextIndex },
  });
  await prisma.interviewMessage.create({
    data: {
      interviewId,
      sender: "ai",
      message: nextQuestion,
      questionType: plan[nextIndex].type,
      isFollowup: false,
    },
  });

  return res.json({ question: nextQuestion, questionIndex: nextIndex + 1, totalQuestions: plan.length, isFollowup: false });
  } catch (e) {
    console.error("[interview/respond]", e);
    return res.status(500).json({ error: e instanceof Error ? e.message : "Failed to submit answer" });
  }
});

interviewRouter.get("/latest", requireAuth, async (req: AuthedRequest, res) => {
  const interview = await prisma.interview.findFirst({
    where: { userId: req.user!.id, status: "completed" },
    orderBy: { completedAt: "desc" },
  });
  if (!interview) return res.json({ interview: null });
  return res.json({
    interview: {
      totalScore: interview.totalScore,
      totalQuestions: (interview.questionPlan as QuestionPlanItem[])?.length ?? 0,
    },
  });
});

interviewRouter.get("/:id/result", requireAuth, async (req: AuthedRequest, res) => {
  const interview = await prisma.interview.findUnique({ where: { id: req.params.id } });
  if (!interview || interview.userId !== req.user!.id) {
    return res.status(404).json({ error: "Interview not found" });
  }
  return res.json({
    totalScore: interview.totalScore,
    badgeLevel: interview.badgeLevel,
    finalVerdict: interview.finalVerdict,
    scoreBreakdown: interview.scoreBreakdown,
    status: interview.status,
  });
});
