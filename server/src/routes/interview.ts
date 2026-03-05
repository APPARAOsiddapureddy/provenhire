import { Router } from "express";
import { z } from "zod";
import { requireAuth, AuthedRequest } from "../middleware/auth.js";
import { prisma } from "../config/prisma.js";
import { evaluateInterview } from "../services/ai.service.js";

export const interviewRouter = Router();

type QuestionPlanItem = { type: string; prompt: string };

/** HR/behavioral questions (same for all roles). Last 3 of 10. */
const HR_QUESTIONS: QuestionPlanItem[] = [
  { type: "behavioral", prompt: "Tell me about a time you had to meet a tight deadline. How did you prioritize and deliver?" },
  { type: "behavioral", prompt: "Describe a situation where you had to handle conflicting feedback from stakeholders. How did you resolve it?" },
  { type: "behavioral", prompt: "Why are you interested in this role, and what do you hope to achieve in the next 1–2 years?" },
];

/** Role-specific technical questions (first 7 of 10). */
const ROLE_PLANS: Record<string, QuestionPlanItem[]> = {
  frontend: [
    { type: "conceptual", prompt: "Explain the component and state management principles you rely on in React or similar frameworks." },
    { type: "conceptual", prompt: "Describe how the browser rendering pipeline impacts UI performance and what optimizations you use." },
    { type: "scenario", prompt: "A key UI flow is slow on low-end devices. How would you diagnose and fix it?" },
    { type: "scenario", prompt: "How would you implement feature flags for a UI release with staged rollout?" },
    { type: "problem_solving", prompt: "Design a robust form system with validation, autosave, and error recovery." },
    { type: "problem_solving", prompt: "How would you refactor a monolithic React app into maintainable modules?" },
    { type: "scenario", prompt: "How do you ensure accessibility (a11y) in your frontend applications?" },
  ],
  backend: [
    { type: "conceptual", prompt: "Explain how you design reliable APIs with clear contracts and versioning." },
    { type: "conceptual", prompt: "Describe how you approach data modeling for scalability and integrity." },
    { type: "scenario", prompt: "A critical endpoint is timing out. Walk through your debugging plan." },
    { type: "scenario", prompt: "How would you design a background job system with retries and idempotency?" },
    { type: "problem_solving", prompt: "Design a caching strategy for a high-traffic read-heavy system." },
    { type: "problem_solving", prompt: "Explain how you would prevent race conditions in a multi-worker environment." },
    { type: "scenario", prompt: "How do you secure APIs against common vulnerabilities (injection, CSRF, etc.)?" },
  ],
  fullstack: [
    { type: "conceptual", prompt: "How do you structure a full-stack application for maintainability and team scalability?" },
    { type: "conceptual", prompt: "Explain your approach to authentication and authorization across frontend and backend." },
    { type: "scenario", prompt: "A user reports data inconsistency between what they see and what's in the DB. How do you debug?" },
    { type: "scenario", prompt: "How would you implement real-time features (e.g. live updates) end-to-end?" },
    { type: "problem_solving", prompt: "Design a feature that requires both frontend state and server-side validation. How do you coordinate?" },
    { type: "problem_solving", prompt: "How would you migrate a monolith to a frontend + microservices architecture?" },
    { type: "scenario", prompt: "How do you handle offline support or poor connectivity in a web app?" },
  ],
  data: [
    { type: "conceptual", prompt: "Explain how you validate data quality and avoid biased insights." },
    { type: "conceptual", prompt: "Describe a statistical concept you apply frequently and why it matters." },
    { type: "scenario", prompt: "A dashboard shows conflicting metrics across teams. How would you investigate?" },
    { type: "scenario", prompt: "You must deliver insights from incomplete data. What is your approach?" },
    { type: "problem_solving", prompt: "Design an ETL pipeline for scale and reliability." },
    { type: "problem_solving", prompt: "How would you model a cohort analysis for retention?" },
    { type: "scenario", prompt: "How do you communicate data findings to non-technical stakeholders?" },
  ],
  devops: [
    { type: "conceptual", prompt: "Explain how you design CI/CD pipelines for reliability and fast feedback." },
    { type: "conceptual", prompt: "Describe how you approach infrastructure as code (IaC) and version control." },
    { type: "scenario", prompt: "A production deployment causes a critical outage. Walk through your rollback and post-mortem process." },
    { type: "scenario", prompt: "How would you design monitoring and alerting for a distributed system?" },
    { type: "problem_solving", prompt: "Design a strategy for zero-downtime deployments." },
    { type: "problem_solving", prompt: "How would you secure secrets and credentials in a cloud environment?" },
    { type: "scenario", prompt: "How do you handle cost optimization in a cloud infrastructure?" },
  ],
  ml: [
    { type: "conceptual", prompt: "Explain how you validate and avoid overfitting in ML models." },
    { type: "conceptual", prompt: "Describe the trade-offs between different model types for a given problem." },
    { type: "scenario", prompt: "A model performs well offline but poorly in production. How would you debug?" },
    { type: "scenario", prompt: "How would you design an ML pipeline for continuous retraining?" },
    { type: "problem_solving", prompt: "Design an approach for an imbalanced classification problem." },
    { type: "problem_solving", prompt: "How do you ensure ML systems are fair and free from bias?" },
    { type: "scenario", prompt: "How do you explain model predictions to non-technical stakeholders?" },
  ],
  mobile: [
    { type: "conceptual", prompt: "Explain mobile app architecture patterns (e.g. clean architecture, MVVM) and when to use them." },
    { type: "conceptual", prompt: "Describe how you handle offline storage and sync in mobile apps." },
    { type: "scenario", prompt: "An app works on emulators but crashes on certain devices. How would you debug?" },
    { type: "scenario", prompt: "How would you implement deep linking and app-to-app navigation?" },
    { type: "problem_solving", prompt: "Design an approach for reducing app size and improving load time." },
    { type: "problem_solving", prompt: "How do you handle different screen sizes and orientations?" },
    { type: "scenario", prompt: "How do you ensure good battery and performance on low-end devices?" },
  ],
  qa: [
    { type: "conceptual", prompt: "Explain your test pyramid approach and when you use unit vs integration vs E2E tests." },
    { type: "conceptual", prompt: "Describe how you design test cases for complex user flows." },
    { type: "scenario", prompt: "A bug appears in production that wasn't caught by tests. How would you improve coverage?" },
    { type: "scenario", prompt: "How would you test a system with external API dependencies?" },
    { type: "problem_solving", prompt: "Design a test strategy for a legacy system with no existing tests." },
    { type: "problem_solving", prompt: "How do you balance automation with exploratory testing?" },
    { type: "scenario", prompt: "How do you work with developers to shift testing left?" },
  ],
  software: [
    { type: "conceptual", prompt: "Explain the design principles you apply when writing maintainable code." },
    { type: "conceptual", prompt: "Describe how you approach code reviews and what you look for." },
    { type: "scenario", prompt: "Walk through how you would troubleshoot a critical production issue." },
    { type: "scenario", prompt: "You inherit a legacy system with performance issues. What is your approach?" },
    { type: "problem_solving", prompt: "Design a solution for a feature that requires trade-offs. Explain the trade-offs." },
    { type: "problem_solving", prompt: "How would you refactor a large codebase with minimal risk?" },
    { type: "scenario", prompt: "How do you balance speed of delivery with code quality?" },
  ],
  product: [
    { type: "conceptual", prompt: "Explain how you prioritize features when you have limited resources." },
    { type: "conceptual", prompt: "Describe your approach to gathering and validating user feedback." },
    { type: "scenario", prompt: "A key stakeholder disagrees with your roadmap. How would you handle it?" },
    { type: "scenario", prompt: "How would you launch a new feature with minimal risk?" },
    { type: "problem_solving", prompt: "Design a process for going from idea to shipped product." },
    { type: "problem_solving", prompt: "How do you balance user needs with business goals?" },
    { type: "scenario", prompt: "How do you work with engineering to scope and estimate features?" },
  ],
  project: [
    { type: "conceptual", prompt: "Explain how you plan and track project milestones." },
    { type: "conceptual", prompt: "Describe your approach to risk management and mitigation." },
    { type: "scenario", prompt: "A project is behind schedule. How would you get it back on track?" },
    { type: "scenario", prompt: "How would you handle scope creep from stakeholders?" },
    { type: "problem_solving", prompt: "Design a communication plan for a cross-functional project." },
    { type: "problem_solving", prompt: "How do you resolve conflicts between team members?" },
    { type: "scenario", prompt: "How do you balance competing priorities from multiple stakeholders?" },
  ],
};

const FALLBACK_PLAN = ROLE_PLANS.software;

function buildQuestionPlan(role: string): QuestionPlanItem[] {
  const r = role.toLowerCase();
  let tech: QuestionPlanItem[] | undefined;
  if (r.includes("frontend")) tech = ROLE_PLANS.frontend;
  else if (r.includes("backend")) tech = ROLE_PLANS.backend;
  else if (r.includes("full stack") || r.includes("fullstack")) tech = ROLE_PLANS.fullstack;
  else if (r.includes("data analyst") || r.includes("data scientist") || r.includes("data")) tech = ROLE_PLANS.data;
  else if (r.includes("devops")) tech = ROLE_PLANS.devops;
  else if (r.includes("ml ") || r.includes("machine learning") || r.includes("ml engineer")) tech = ROLE_PLANS.ml;
  else if (r.includes("mobile")) tech = ROLE_PLANS.mobile;
  else if (r.includes("qa") || r.includes("quality")) tech = ROLE_PLANS.qa;
  else if (r.includes("product manager") || r.includes("product ")) tech = ROLE_PLANS.product;
  else if (r.includes("project manager") || r.includes("project ")) tech = ROLE_PLANS.project;
  const techPlan = tech ?? FALLBACK_PLAN;
  return [...techPlan, ...HR_QUESTIONS];
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

interviewRouter.post("/start", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const schema = z.object({ jobRole: z.string().min(1) });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid payload" });
    const { jobRole } = parsed.data;

    const plan = buildQuestionPlan(jobRole);
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
