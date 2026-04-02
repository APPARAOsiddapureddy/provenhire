import { Router } from "express";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { requireAuth, requireJobSeeker, AuthedRequest } from "../middleware/auth.js";
import { prisma } from "../config/prisma.js";
import {
  evaluateInterview,
  parseInterviewEvaluationJson,
  canonicalEvaluationFallbackJson,
  type QuestionAnswerPair,
} from "../services/ai.service.js";
import {
  type QuestionPlanItem,
  buildStaticQuestionPlan,
  resolveInterviewBankRole,
} from "../data/aiInterviewStaticQuestions.js";
import { analyzeAnswerAntiGaming } from "../services/aiInterviewAntiGaming.service.js";
import {
  aggregateProctoringViolations,
  integrityFlagFromAntiGamingPoints,
  integrityFlagFromViolationAggregate,
  interviewProctoringViolationTotal,
  mergeIntegrityFlags,
} from "../services/aiInterviewProctoringRisk.service.js";
import { computeAiInterviewAggregateScore } from "../utils/aiInterviewScore.js";
import { recordAiInterviewSubmittedForAdminReview } from "../services/humanInterviewGate.service.js";

export const interviewRouter = Router();

const QUESTION_BANK_SOURCE = (process.env.QUESTION_BANK_SOURCE || "static").toLowerCase();

const EXPERIENCE_LEVELS = ["junior", "mid", "senior"] as const;

async function buildQuestionPlan(jobRole: string, experienceLevel: string): Promise<QuestionPlanItem[]> {
  if (QUESTION_BANK_SOURCE !== "db") {
    return buildStaticQuestionPlan(jobRole);
  }
  try {
    const bankRole = resolveInterviewBankRole(jobRole);
    const level = EXPERIENCE_LEVELS.includes(experienceLevel as (typeof EXPERIENCE_LEVELS)[number])
      ? experienceLevel
      : "mid";
    const tech = await prisma.$queryRaw<
      Array<{ id: string; type: string; prompt: string; keyPoints: unknown; difficulty: number }>
    >`
      SELECT id, type, prompt, "keyPoints", difficulty FROM "InterviewQuestionBank"
      WHERE role = ${bankRole}
        AND "experienceLevel" = ${level}
        AND type <> 'behavioral'
        AND "isActive" = true
      ORDER BY RANDOM()
      LIMIT 7
    `;
    const behavioral = await prisma.$queryRaw<
      Array<{ id: string; type: string; prompt: string; keyPoints: unknown; difficulty: number }>
    >`
      SELECT id, type, prompt, "keyPoints", difficulty FROM "InterviewQuestionBank"
      WHERE type = 'behavioral'
        AND "isActive" = true
      ORDER BY RANDOM()
      LIMIT 4
    `;
    if (tech.length < 7 || behavioral.length < 4) {
      return buildStaticQuestionPlan(jobRole);
    }
    const mapRow = (row: (typeof tech)[0]): QuestionPlanItem => ({
      type: row.type,
      prompt: row.prompt,
      keyPoints: normalizeKeyPoints(row.keyPoints),
      questionBankId: row.id,
      difficulty: row.difficulty,
    });
    return [...tech.map(mapRow), ...behavioral.map(mapRow)];
  } catch (e) {
    console.error("[interview/buildQuestionPlan db]", e);
    return buildStaticQuestionPlan(jobRole);
  }
}

function normalizeKeyPoints(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.map(String);
  if (raw && typeof raw === "object") return Object.values(raw as Record<string, unknown>).map(String);
  return [];
}

const PENDING_REVIEW_MESSAGE =
  "Your interview responses have been recorded successfully. Our evaluation system encountered a technical issue — your interview has been flagged for manual review and you will receive your result within 24 hours. This does not affect your application status.";

interviewRouter.post("/start", requireAuth, requireJobSeeker, async (req: AuthedRequest, res) => {
  try {
    // experienceLevel optional for backward compatibility (older/cached clients that only send jobRole).
    const schema = z.object({
      jobRole: z.string().min(1),
      experienceLevel: z.enum(["junior", "mid", "senior"]).optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid payload", details: parsed.error.flatten() });
    }
    const { jobRole } = parsed.data;
    const experienceLevel = parsed.data.experienceLevel ?? "mid";

    const plan = await buildQuestionPlan(jobRole, experienceLevel);
    const interview = await prisma.interview.create({
      data: {
        userId: req.user!.id,
        jobRole,
        experienceLevel,
        questionPlan: plan as object[],
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

    return res.json({
      interviewId: interview.id,
      question,
      questionIndex: 1,
      totalQuestions: plan.length,
      experienceLevel,
      questionBankSource: QUESTION_BANK_SOURCE,
    });
  } catch (e) {
    console.error("[interview/start]", e);
    return res.status(500).json({ error: e instanceof Error ? e.message : "Failed to start interview" });
  }
});

interviewRouter.post("/respond", requireAuth, requireJobSeeker, async (req: AuthedRequest, res) => {
  try {
    const schema = z.object({
      interviewId: z.string().min(1),
      answer: z.string().min(1),
      audioUrl: z.string().optional().transform((s) => (s && s.trim() ? s : undefined)),
      transcriptionConfidence: z.number().optional(),
      inputMode: z.enum(["voice", "typed"]).optional(),
      rawTranscript: z.string().optional(),
      answerLengthChars: z.number().int().optional(),
      pasteCount: z.number().int().min(0).optional(),
      timeToSubmitSeconds: z.number().int().min(0).optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid payload" });

    const {
      interviewId,
      answer,
      audioUrl,
      transcriptionConfidence,
      inputMode,
      rawTranscript,
      answerLengthChars,
      pasteCount,
      timeToSubmitSeconds,
    } = parsed.data;

    const interview = await prisma.interview.findUnique({ where: { id: interviewId } });
    if (!interview || interview.userId !== req.user!.id) {
      return res.status(404).json({ error: "Interview not found" });
    }

    const rawPlan = interview.questionPlan;
    const plan: QuestionPlanItem[] = Array.isArray(rawPlan) ? (rawPlan as QuestionPlanItem[]) : [];
    const currentIndex = Math.max(0, interview.questionIndex);
    const currentQuestion = plan[currentIndex];

    await prisma.interviewMessage.create({
      data: {
        interviewId,
        sender: "user",
        message: answer,
        questionType: currentQuestion?.type ?? null,
        questionIndex: currentIndex,
        audioUrl: audioUrl ?? null,
        transcriptionConfidence: transcriptionConfidence ?? null,
        inputMode: inputMode ?? "typed",
        rawTranscript: rawTranscript?.trim() || null,
        answerLengthChars: answerLengthChars ?? answer.length,
        pasteCount: pasteCount ?? 0,
        timeToSubmitSeconds: timeToSubmitSeconds ?? null,
      },
    });

    const nextIndex = currentIndex + 1;
    if (nextIndex >= plan.length) {
      const transcript = await prisma.interviewMessage.findMany({
        where: { interviewId },
        orderBy: { createdAt: "asc" },
      });

      const userMessages = transcript.filter((m) => m.sender === "user");
      const antiRows = userMessages.map((m) => ({
        message: m.message,
        questionType: m.questionType,
        timeToSubmitSeconds: m.timeToSubmitSeconds,
        pasteCount: m.pasteCount,
      }));
      const patches = analyzeAnswerAntiGaming(antiRows);
      for (let i = 0; i < userMessages.length; i++) {
        const p = patches[i];
        if (!p?.flagAntiGaming) continue;
        await prisma.interviewMessage.update({
          where: { id: userMessages[i].id },
          data: { flagAntiGaming: true, flagReason: p.flagReason },
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
      const interviewProctoringTotal = interviewProctoringViolationTotal(proctorAgg);

      const transcriptText = transcript.map((m) => `${m.sender.toUpperCase()}: ${m.message}`).join("\n");
      const questionAnswerPairs: QuestionAnswerPair[] = userMessages.map((msg, i) => ({
        question: plan[i]?.prompt ?? "",
        keyPoints: plan[i]?.keyPoints ?? [],
        answer: msg.message,
      }));

      const evaluationRaw = await evaluateInterview(transcriptText, questionAnswerPairs, {
        experienceLevel: interview.experienceLevel ?? "mid",
        jobRole: interview.jobRole,
      });
      let evaluation = parseInterviewEvaluationJson(evaluationRaw);
      if (!evaluation) {
        evaluation = parseInterviewEvaluationJson(canonicalEvaluationFallbackJson("invalid_json"))!;
      }

      const fallbackTriggered = Boolean(evaluation.fallback_triggered);

      if (fallbackTriggered) {
        await prisma.interview.update({
          where: { id: interviewId },
          data: {
            totalScore: 50,
            badgeLevel: "Pending Review",
            finalVerdict: String(evaluation.final_verdict ?? "PENDING_MANUAL_REVIEW"),
            scoreBreakdown: evaluation as object,
            status: "pending_review",
            completedAt: new Date(),
            reviewFlag: true,
            reviewReason: "gemini_evaluation_failed",
            riskScore: interviewProctoringTotal,
            integrityFlag,
          },
        });
        await recordAiInterviewSubmittedForAdminReview({
          userId: interview.userId,
          interviewId,
          score: 50,
        });
        return res.json({
          completed: true,
          pendingReview: true,
          candidateMessage: PENDING_REVIEW_MESSAGE,
          evaluation,
          totalScore: 50,
          badgeLevel: "Pending Review",
          integrityFlag,
        });
      }

      const { total, badge } = computeAiInterviewAggregateScore(evaluation);
      await prisma.interview.update({
        where: { id: interviewId },
        data: {
          totalScore: total,
          badgeLevel: badge,
          finalVerdict: evaluation.final_verdict != null ? String(evaluation.final_verdict) : null,
          scoreBreakdown: evaluation as object,
          status: "completed",
          completedAt: new Date(),
          riskScore: interviewProctoringTotal,
          integrityFlag,
        },
      });

      const perQ = evaluation.per_question_scores;
      if (Array.isArray(perQ)) {
        for (const row of perQ as Array<Record<string, unknown>>) {
          const qi = Number(row.question_index);
          if (!Number.isFinite(qi) || qi < 0 || qi >= userMessages.length) continue;
          const um = userMessages[qi];
          if (!um) continue;
          const bankId = plan[qi]?.questionBankId ?? null;
          await prisma.interviewQuestionResult.create({
            data: {
              interviewId,
              messageId: um.id,
              questionBankId: typeof bankId === "string" ? bankId : null,
              questionIndex: qi,
              questionType: plan[qi]?.type ?? "unknown",
              scoreConceptual: Number(row.score_conceptual) || null,
              scoreReasoning: Number(row.score_reasoning) || null,
              scoreCommunication: Number(row.score_communication) || null,
              rationale: row.rationale != null ? String(row.rationale) : null,
              keyPointsHit: Array.isArray(row.key_points_hit) ? (row.key_points_hit as string[]).map(String) : [],
              keyPointsMissed: Array.isArray(row.key_points_missed)
                ? (row.key_points_missed as string[]).map(String)
                : [],
              flagAntiGaming: Boolean(evaluation.authenticity_concern),
              flagReason:
                evaluation.authenticity_concern && evaluation.authenticity_reason
                  ? String(evaluation.authenticity_reason)
                  : null,
            },
          });
        }
      }

      await recordAiInterviewSubmittedForAdminReview({
        userId: interview.userId,
        interviewId,
        score: total,
      });

      return res.json({
        completed: true,
        pendingReview: false,
        evaluation,
        totalScore: total,
        badgeLevel: badge,
        integrityFlag,
        experienceLevel: interview.experienceLevel,
      });
    }

    const nextItem = plan[nextIndex];
    if (!nextItem?.prompt) {
      return res.status(400).json({ error: "Invalid question plan" });
    }
    const nextQuestion = nextItem.prompt;

    await prisma.interview.update({
      where: { id: interviewId },
      data: { questionIndex: nextIndex },
    });
    await prisma.interviewMessage.create({
      data: {
        interviewId,
        sender: "ai",
        message: nextQuestion,
        questionType: nextItem.type ?? null,
        isFollowup: false,
      },
    });

    return res.json({
      question: nextQuestion,
      questionIndex: nextIndex + 1,
      totalQuestions: plan.length,
      isFollowup: false,
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return res.status(409).json({
        error: "This answer was already recorded. Continue from the current question.",
      });
    }
    console.error("[interview/respond]", e);
    return res.status(500).json({ error: e instanceof Error ? e.message : "Failed to submit answer" });
  }
});

interviewRouter.post("/:id/request-review", requireAuth, requireJobSeeker, async (req: AuthedRequest, res) => {
  const schema = z.object({ reason: z.string().max(500) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid payload" });

  const interview = await prisma.interview.findUnique({ where: { id: req.params.id } });
  if (!interview || interview.userId !== req.user!.id) {
    return res.status(404).json({ error: "Interview not found" });
  }
  if (interview.status !== "completed") {
    return res.status(400).json({ error: "Only completed interviews can be disputed" });
  }
  if (interview.reviewRequestedAt) {
    return res.status(400).json({ error: "You have already submitted a review request" });
  }
  const completedAt = interview.completedAt;
  if (!completedAt || Date.now() - completedAt.getTime() > 7 * 86400_000) {
    return res.status(400).json({ error: "Review request window (7 days) has expired" });
  }

  await prisma.interview.update({
    where: { id: interview.id },
    data: {
      reviewRequestedAt: new Date(),
      reviewRequestReason: parsed.data.reason,
      reviewFlag: true,
      reviewReason: "candidate_dispute",
    },
  });
  res.json({ ok: true, message: "Your request has been submitted for admin review." });
});

interviewRouter.get("/latest", requireAuth, requireJobSeeker, async (req: AuthedRequest, res) => {
  const interview = await prisma.interview.findFirst({
    where: {
      userId: req.user!.id,
      status: { in: ["completed", "pending_review"] },
    },
    orderBy: { completedAt: "desc" },
  });
  if (!interview) return res.json({ interview: null });
  return res.json({
    interview: {
      id: interview.id,
      totalScore: interview.totalScore,
      status: interview.status,
      badgeLevel: interview.badgeLevel,
      totalQuestions: (interview.questionPlan as QuestionPlanItem[])?.length ?? 0,
    },
  });
});

interviewRouter.get("/:id/result", requireAuth, requireJobSeeker, async (req: AuthedRequest, res) => {
  const interview = await prisma.interview.findUnique({ where: { id: req.params.id } });
  if (!interview || interview.userId !== req.user!.id) {
    return res.status(404).json({ error: "Interview not found" });
  }

  const plan: QuestionPlanItem[] = Array.isArray(interview.questionPlan)
    ? (interview.questionPlan as QuestionPlanItem[])
    : [];

  if (interview.status === "pending_review") {
    return res.json({
      totalScore: null,
      badgeLevel: interview.badgeLevel,
      finalVerdict: null,
      scoreBreakdown: interview.scoreBreakdown,
      status: interview.status,
      pendingReview: true,
      candidateMessage: PENDING_REVIEW_MESSAGE,
      expectedWithinHours: 24,
      perQuestionScores: [],
    });
  }

  const rows = await prisma.interviewQuestionResult.findMany({
    where: { interviewId: interview.id },
    orderBy: { questionIndex: "asc" },
  });

  const perQuestionScores = rows.map((r) => ({
    questionIndex: r.questionIndex,
    questionType: r.questionType,
    questionPrompt: plan[r.questionIndex]?.prompt ?? "",
    scoreConceptual: r.scoreConceptual,
    scoreReasoning: r.scoreReasoning,
    scoreCommunication: r.scoreCommunication,
    rationale: r.rationale,
    keyPointsHit: r.keyPointsHit,
    keyPointsMissed: r.keyPointsMissed,
  }));

  return res.json({
    totalScore: interview.totalScore,
    badgeLevel: interview.badgeLevel,
    finalVerdict: interview.finalVerdict,
    scoreBreakdown: interview.scoreBreakdown,
    status: interview.status,
    pendingReview: false,
    experienceLevel: interview.experienceLevel,
    integrityFlag: interview.integrityFlag,
    riskScore: interview.riskScore,
    perQuestionScores,
    recruiterBenchmarkNote: interview.experienceLevel
      ? `This score reflects performance against a ${
          interview.experienceLevel === "junior"
            ? "Junior"
            : interview.experienceLevel === "senior"
              ? "Senior"
              : "Mid-Level"
        } benchmark. Scores are not directly comparable across experience levels.`
      : null,
  });
});
