/**
 * AI Skills Interview — separate from adversarial v2 (`orchestrator.ts`).
 * Part A: DSA walkthrough; Part B: resume skill depth checks.
 */
import type { Prisma } from "@prisma/client";
import { prisma } from "../../config/prisma.js";
import type { DSAContext } from "../../types/dsaContext.js";
import type { ExperienceTier } from "../../utils/experienceTier.js";
import { experienceTierFromYears } from "../../utils/experienceTier.js";
import { runGeminiJson } from "../ai.service.js";
import { syncJobSeekerVerificationStatus } from "../certification.service.js";
import { skillVerifiedThresholdForTier } from "../provenhireResume.service.js";
import { calculateExpiry } from "../skillVerification.service.js";

const SESSION_MS = 30 * 60 * 1000;
const DSA_PART_QUESTIONS = 5;
const PLAN_VERSION = 1 as const;

const PASS_THRESH = {
  fresher: { minScore: 50, minVerifiedSkills: 2 },
  mid: { minScore: 55, minVerifiedSkills: 3 },
  senior: { minScore: 60, minVerifiedSkills: 4 },
} as const;

function normalizeSkillsJson(skills: unknown): string[] {
  if (skills == null) return [];
  if (Array.isArray(skills)) {
    const out: string[] = [];
    const seen = new Set<string>();
    for (const s of skills) {
      let t: string;
      if (typeof s === "string") t = s.trim();
      else if (s && typeof s === "object" && "name" in s) t = String((s as { name: unknown }).name).trim();
      else t = String(s).trim();
      if (!t) continue;
      const k = t.toLowerCase();
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(t);
    }
    return out;
  }
  return [];
}

function skillSlotsForTrack(track: ExperienceTier): number {
  if (track === "fresher") return 3;
  if (track === "mid") return 4;
  return 5;
}

export async function loadDSAContext(userId: string): Promise<DSAContext> {
  const dsaResult = await prisma.dsaRoundResult.findFirst({
    where: { userId, invalidated: false },
    orderBy: { completedAt: "desc" },
  });
  if (!dsaResult?.answers || typeof dsaResult.answers !== "object") {
    return { problems: [] };
  }
  const answers = dsaResult.answers as Record<string, { code?: string; language?: string; score?: number }>;
  const problems = await Promise.all(
    Object.entries(answers).map(async ([questionId, submission]) => {
      const question = await prisma.dsaQuestion.findUnique({ where: { id: questionId } });
      const testResults = await prisma.dsaSubmission.findFirst({
        where: { userId, questionId, isOfficial: true },
        orderBy: { submittedAt: "desc" },
      });
      const passed = testResults?.passedCount ?? 0;
      const total = Math.max(1, testResults?.totalCount ?? 1);
      const code = typeof submission?.code === "string" ? submission.code : "";
      const language = typeof submission?.language === "string" ? submission.language : "plaintext";
      const scorePct = typeof submission?.score === "number" ? submission.score : null;
      const fully = passed > 0 ? passed >= total : scorePct != null && scorePct >= 99;
      const partial =
        (passed > 0 && passed < total) ||
        (scorePct != null && scorePct > 0 && scorePct < 99 && passed === 0);
      return {
        problemId: questionId,
        title: question?.title ?? "Coding problem",
        description: question?.description ?? "",
        difficulty: question?.difficulty ?? "Medium",
        candidateCode: code.slice(0, 24_000),
        language,
        testCasesPassed: passed,
        testCasesTotal: total,
        isFullySolved: fully,
        isPartiallySolved: partial && !fully,
      };
    })
  );
  return { problems: problems.filter((p) => p.candidateCode.length > 0 || p.description.length > 0) };
}

async function loadResumeSkills(userId: string): Promise<string[]> {
  const profile = await prisma.jobSeekerProfile.findUnique({
    where: { userId },
    select: { skills: true },
  });
  const raw = normalizeSkillsJson(profile?.skills);
  if (raw.length) return raw;
  return ["Communication", "Problem solving"];
}

export type AISkillsPlanV1 = {
  v: typeof PLAN_VERSION;
  phase: "dsa" | "skill" | "complete";
  track: ExperienceTier;
  jobRole: string;
  experienceLevel: "junior" | "mid" | "senior";
  dsaProblems: DSAContext["problems"];
  resumeSkills: string[];
  dsaIndex: number;
  skillIdx: number;
  skillRound: number;
  skillsChecked: Record<string, number>;
  dsaUnderstandingScores: number[];
  history: Array<{ role: "ai" | "user"; content: string }>;
  sessionStartedAt: string;
  questionsTotal: number;
  currentQuestion: string;
};

function parsePlan(raw: unknown): AISkillsPlanV1 | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as AISkillsPlanV1;
  if (o.v !== PLAN_VERSION) return null;
  return o;
}

function sessionTimedOut(plan: AISkillsPlanV1): boolean {
  const t = new Date(plan.sessionStartedAt).getTime();
  return Number.isFinite(t) && Date.now() - t > SESSION_MS;
}

function experienceLevelForInterview(track: ExperienceTier): "junior" | "mid" | "senior" {
  if (track === "fresher") return "junior";
  if (track === "mid") return "mid";
  return "senior";
}

function pickProblem(plan: AISkillsPlanV1, stepIdx: number): DSAContext["problems"][0] | null {
  const ps = plan.dsaProblems;
  if (!ps.length) return null;
  return ps[stepIdx % ps.length] ?? null;
}

async function genDsaQuestion(plan: AISkillsPlanV1): Promise<{ question: string; acknowledgement: string | null }> {
  const p = pickProblem(plan, plan.dsaIndex);
  const depth = plan.track === "fresher" ? "fresher" : plan.track === "mid" ? "mid-level" : "senior";
  const system = `You are a concise technical interviewer (~${depth}). Output ONLY valid JSON: {"acknowledgement":"one short sentence or empty","question":"one spoken interview question, no markdown"}`;
  const user = p
    ? `Problem title: ${p.title}
Difficulty: ${p.difficulty}
Candidate passed ${p.testCasesPassed}/${p.testCasesTotal} tests. Fully solved: ${p.isFullySolved}. Partial: ${p.isPartiallySolved}.
Code excerpt (truncated): ${p.candidateCode.slice(0, 2000)}
Ask question ${plan.dsaIndex + 1} of ${DSA_PART_QUESTIONS} for DSA walkthrough — probe understanding appropriate to performance (harsher on partial solutions).`
    : `No saved code. Ask a general data-structures/algorithms question appropriate for ${depth} (question ${plan.dsaIndex + 1} of ${DSA_PART_QUESTIONS}).`;
  const parsed = await runGeminiJson<{ acknowledgement?: string; question?: string }>(system, user);
  if (parsed?.question?.trim()) {
    return { question: parsed.question.trim(), acknowledgement: parsed.acknowledgement?.trim() || null };
  }
  const fallbackQ = p
    ? p.isPartiallySolved
      ? `You partially solved "${p.title}" (${p.testCasesPassed}/${p.testCasesTotal}). Walk through your approach and where you think it failed.`
      : `Walk through your approach to "${p.title}" and its time complexity.`
    : `Explain how you would approach a typical array or hash-map problem for this role.`;
  return { acknowledgement: "Thanks.", question: fallbackQ };
}

async function genSkillQuestion(plan: AISkillsPlanV1): Promise<{ question: string; acknowledgement: string | null }> {
  const skill = plan.resumeSkills[plan.skillIdx] ?? "this skill";
  const depth = plan.track === "fresher" ? "basic conceptual" : plan.track === "mid" ? "practical on-the-job" : "deep architecture-level";
  const round = plan.skillRound + 1;
  const system = `You verify resume skills. Output ONLY JSON: {"acknowledgement":"short or empty","question":"spoken question only"}`;
  const user = `Skill: ${skill}. Experience band: ${plan.track}. Depth: ${depth}.
This is follow-up ${round} of 2 for this skill. ${round === 1 ? "Start with foundations." : "Ask for a concrete example or trade-off."}`;
  const parsed = await runGeminiJson<{ acknowledgement?: string; question?: string }>(system, user);
  if (parsed?.question?.trim()) {
    return { question: parsed.question.trim(), acknowledgement: parsed.acknowledgement?.trim() || null };
  }
  const fb =
    round === 1
      ? `In your own words, what is ${skill} and when do you use it?`
      : `Describe a real situation where you applied ${skill} and what you learned.`;
  return { acknowledgement: "Got it.", question: fb };
}

async function scoreDsaAnswer(
  p: DSAContext["problems"][0] | null,
  questionAsked: string,
  userAnswer: string,
): Promise<number> {
  const system = `Score the candidate's spoken answer for DSA understanding. Output ONLY JSON: {"score": number} where score is 0-100.`;
  const user = `Problem: ${p?.title ?? "general DSA"}
Question was: ${questionAsked}
Answer: ${userAnswer.slice(0, 6000)}`;
  const parsed = await runGeminiJson<{ score?: number }>(system, user);
  const s = parsed?.score;
  if (typeof s === "number" && Number.isFinite(s)) return Math.max(0, Math.min(100, Math.round(s)));
  return 62;
}

async function scoreSkill(plan: AISkillsPlanV1): Promise<number> {
  const skill = plan.resumeSkills[plan.skillIdx] ?? "skill";
  const tail = plan.history.slice(-4).filter((h) => h.role === "user").map((h) => h.content);
  const system = `Score depth of knowledge for ONE skill from two spoken answers. Output ONLY JSON: {"confidence": number} 0-100.`;
  const user = `Skill: ${skill}
Answers combined:
${tail.join("\n---\n").slice(0, 8000)}`;
  const parsed = await runGeminiJson<{ confidence?: number }>(system, user);
  const c = parsed?.confidence;
  if (typeof c === "number" && Number.isFinite(c)) return Math.max(0, Math.min(100, Math.round(c)));
  return 60;
}

function computeCompositeScore(plan: AISkillsPlanV1): { dsaAvg: number; skillAvg: number; total: number } {
  const dsa =
    plan.dsaUnderstandingScores.length > 0
      ? plan.dsaUnderstandingScores.reduce((a, b) => a + b, 0) / plan.dsaUnderstandingScores.length
      : 0;
  const vals = Object.values(plan.skillsChecked);
  const skill = vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
  const total = Math.min(100, Math.max(0, Math.round(dsa * 0.5 + skill * 0.5)));
  return { dsaAvg: Math.round(dsa), skillAvg: Math.round(skill), total };
}

async function finalizeSession(
  interviewId: string,
  userId: string,
  plan: AISkillsPlanV1,
  pass: boolean,
  timeExpired: boolean,
): Promise<{ totalScore: number; verifiedSkills: Array<{ skill: string; confidence: number }> }> {
  const { total, dsaAvg, skillAvg } = computeCompositeScore(plan);
  const threshold = skillVerifiedThresholdForTier(plan.track);
  const verifiedSkills = Object.entries(plan.skillsChecked)
    .filter(([, c]) => c >= threshold)
    .map(([skill, confidence]) => ({ skill, confidence }));

  const scoreBreakdown: Record<string, unknown> = {
    verified_skills: Object.entries(plan.skillsChecked).map(([skill, confidence]) => ({ skill, confidence })),
    dsa_walkthrough_scores: plan.dsaUnderstandingScores,
    composite: { dsaAvg, skillAvg, total },
    pass,
    timeExpired,
    track: plan.track,
  };

  const completedAt = new Date();

  await prisma.interview.update({
    where: { id: interviewId },
    data: {
      status: pass ? "completed" : "failed",
      totalScore: total,
      completedAt,
      badgeLevel: pass ? "Skill Passport" : "Not verified",
      finalVerdict: pass ? "passed" : timeExpired ? "time_expired" : "below_threshold",
      scoreBreakdown: scoreBreakdown as Prisma.InputJsonValue,
    },
  });

  await prisma.verificationStage.upsert({
    where: { userId_stageName: { userId, stageName: "ai_skills_interview" } },
    create: {
      userId,
      stageName: "ai_skills_interview",
      status: pass ? "completed" : "failed",
      score: total,
    },
    update: { status: pass ? "completed" : "failed", score: total, updatedAt: new Date() },
  });

  if (pass) {
    await prisma.candidateSkillVerification.upsert({
      where: { userId_skillType: { userId, skillType: "INTERVIEW" } },
      create: {
        userId,
        skillType: "INTERVIEW",
        status: "ACTIVE",
        score: total,
        confidenceScore: plan.resumeSkills.length ? skillAvg : null,
        verifiedInStage: "ai_skills_interview",
        completedAt,
        expiresAt: calculateExpiry("INTERVIEW", completedAt),
      },
      update: {
        status: "ACTIVE",
        score: total,
        confidenceScore: plan.resumeSkills.length ? skillAvg : null,
        verifiedInStage: "ai_skills_interview",
        completedAt,
        expiresAt: calculateExpiry("INTERVIEW", completedAt),
        updatedAt: new Date(),
      },
    });
  } else {
    await prisma.candidateSkillVerification.upsert({
      where: { userId_skillType: { userId, skillType: "INTERVIEW" } },
      create: {
        userId,
        skillType: "INTERVIEW",
        status: "FAILED",
        score: total,
        confidenceScore: plan.resumeSkills.length ? skillAvg : null,
        verifiedInStage: "ai_skills_interview",
        completedAt,
        expiresAt: null,
      },
      update: {
        status: "FAILED",
        score: total,
        confidenceScore: plan.resumeSkills.length ? skillAvg : null,
        verifiedInStage: "ai_skills_interview",
        completedAt,
        expiresAt: null,
        updatedAt: new Date(),
      },
    });
  }

  try {
    await syncJobSeekerVerificationStatus(userId);
  } catch (e) {
    console.warn("[ai-skills] syncJobSeekerVerificationStatus", e);
  }

  const allSkillRows = Object.entries(plan.skillsChecked).map(([skill, confidence]) => ({ skill, confidence }));
  return { totalScore: total, verifiedSkills: allSkillRows };
}

function countVerified(plan: AISkillsPlanV1): number {
  const th = skillVerifiedThresholdForTier(plan.track);
  return Object.values(plan.skillsChecked).filter((c) => c >= th).length;
}

function evalPass(plan: AISkillsPlanV1): boolean {
  const { total } = computeCompositeScore(plan);
  const cfg = PASS_THRESH[plan.track];
  return total >= cfg.minScore && countVerified(plan) >= cfg.minVerifiedSkills;
}

async function persistPlan(interviewId: string, plan: AISkillsPlanV1): Promise<void> {
  await prisma.interview.update({
    where: { id: interviewId },
    data: { questionPlan: plan as unknown as Prisma.InputJsonValue },
  });
}

export async function startAiSkillsInterview(
  userId: string,
  jobRole: string,
  track?: ExperienceTier,
): Promise<{
  interviewId: string;
  firstQuestion: string;
  acknowledgement: string | null;
  phase: "dsa_walkthrough" | "skill_checkup";
  questionsTotal: number;
  resumed?: boolean;
}> {
  const stage = await prisma.verificationStage.findUnique({
    where: { userId_stageName: { userId, stageName: "ai_skills_interview" } },
  });
  if (!stage || stage.status !== "in_progress") {
    throw new Error("AI Skills stage must be in progress. Open this step from your verification pipeline first.");
  }

  const dsaDone = await prisma.verificationStage.findFirst({
    where: { userId, stageName: "dsa_round", status: "completed" },
  });
  if (!dsaDone) {
    throw new Error("Complete the DSA round before starting the AI Skills interview.");
  }

  const existing = await prisma.interview.findFirst({
    where: { userId, interviewType: "ai_skills", status: "in_progress" },
    orderBy: { createdAt: "desc" },
  });
  if (existing) {
    const prev = parsePlan(existing.questionPlan);
    if (prev && !sessionTimedOut(prev)) {
      return {
        interviewId: existing.id,
        firstQuestion: prev.currentQuestion,
        acknowledgement: null,
        phase: prev.phase === "skill" ? "skill_checkup" : "dsa_walkthrough",
        questionsTotal: prev.questionsTotal,
        resumed: true,
      };
    }
    await prisma.interview.update({
      where: { id: existing.id },
      data: { status: "failed", completedAt: new Date(), finalVerdict: "superseded" },
    });
  }

  const profile = await prisma.jobSeekerProfile.findUnique({
    where: { userId },
    select: { experienceYears: true },
  });
  const profileTier = experienceTierFromYears(profile?.experienceYears);
  const useTrack: ExperienceTier = track ?? profileTier;

  const dsaProblems = await loadDSAContext(userId);
  const rawSkills = await loadResumeSkills(userId);
  const slots = skillSlotsForTrack(useTrack);
  const resumeSkills = rawSkills.slice(0, Math.max(1, Math.min(slots, rawSkills.length)));
  const questionsTotal = DSA_PART_QUESTIONS + resumeSkills.length * 2;

  const sessionStartedAt = new Date().toISOString();
  const plan: AISkillsPlanV1 = {
    v: PLAN_VERSION,
    phase: "dsa",
    track: useTrack,
    jobRole,
    experienceLevel: experienceLevelForInterview(useTrack),
    dsaProblems: dsaProblems.problems,
    resumeSkills,
    dsaIndex: 0,
    skillIdx: 0,
    skillRound: 0,
    skillsChecked: {},
    dsaUnderstandingScores: [],
    history: [],
    sessionStartedAt,
    questionsTotal,
    currentQuestion: "",
  };

  const { question, acknowledgement } = await genDsaQuestion(plan);
  plan.currentQuestion = question;
  plan.history.push({ role: "ai", content: question });

  const interview = await prisma.interview.create({
    data: {
      userId,
      jobRole,
      interviewType: "ai_skills",
      dsaContextLoaded: true,
      experienceLevel: plan.experienceLevel,
      status: "in_progress",
      questionPlan: plan as unknown as Prisma.InputJsonValue,
      questionIndex: 0,
    },
  });

  return {
    interviewId: interview.id,
    firstQuestion: question,
    acknowledgement,
    phase: "dsa_walkthrough",
    questionsTotal,
  };
}

export async function processAiSkillsTurn(
  interviewId: string,
  userId: string,
  answer: string,
): Promise<{
  response: string;
  acknowledgement: string | null;
  phase: "dsa_walkthrough" | "skill_checkup" | "complete";
  questionsAsked: number;
  questionsTotal: number;
  complete: boolean;
  score?: number;
  verifiedSkills?: Array<{ skill: string; confidence: number }>;
  pass?: boolean;
  timeExpired?: boolean;
}> {
  const interview = await prisma.interview.findFirst({
    where: { id: interviewId, userId, interviewType: "ai_skills", status: "in_progress" },
  });
  if (!interview) throw new Error("Interview not found");

  const plan = parsePlan(interview.questionPlan);
  if (!plan) throw new Error("Invalid interview state");

  const timedOut = sessionTimedOut(plan);
  const answerTrim = answer.trim();
  if (!answerTrim) throw new Error("Answer required");

  plan.history.push({ role: "user", content: answerTrim });

  if (timedOut) {
    const { totalScore, verifiedSkills } = await finalizeSession(interviewId, userId, plan, false, true);
    return {
      response: "Time is up for this session. Your attempt has been recorded.",
      acknowledgement: null,
      phase: "complete",
      questionsAsked: plan.questionsTotal,
      questionsTotal: plan.questionsTotal,
      complete: true,
      score: totalScore,
      verifiedSkills,
      pass: false,
      timeExpired: true,
    };
  }

  if (plan.phase === "dsa") {
    const prob = pickProblem(plan, plan.dsaIndex);
    const asked = plan.currentQuestion;
    const s = await scoreDsaAnswer(prob, asked, answerTrim);
    plan.dsaUnderstandingScores.push(s);
    plan.dsaIndex += 1;
    if (plan.dsaIndex >= DSA_PART_QUESTIONS) {
      plan.phase = "skill";
      plan.skillIdx = 0;
      plan.skillRound = 0;
      const nq = await genSkillQuestion(plan);
      plan.currentQuestion = nq.question;
      plan.history.push({ role: "ai", content: nq.question });
      await persistPlan(interviewId, plan);
      const asked = DSA_PART_QUESTIONS + 1;
      return {
        response: nq.question,
        acknowledgement: nq.acknowledgement,
        phase: "skill_checkup",
        questionsAsked: asked,
        questionsTotal: plan.questionsTotal,
        complete: false,
      };
    }
    const nq = await genDsaQuestion(plan);
    plan.currentQuestion = nq.question;
    plan.history.push({ role: "ai", content: nq.question });
    await persistPlan(interviewId, plan);
    return {
      response: nq.question,
      acknowledgement: nq.acknowledgement,
      phase: "dsa_walkthrough",
      questionsAsked: plan.dsaIndex + 1,
      questionsTotal: plan.questionsTotal,
      complete: false,
    };
  }

  if (plan.phase === "skill") {
    if (plan.skillRound === 0) {
      plan.skillRound = 1;
      const nq = await genSkillQuestion(plan);
      plan.currentQuestion = nq.question;
      plan.history.push({ role: "ai", content: nq.question });
      await persistPlan(interviewId, plan);
      const asked = DSA_PART_QUESTIONS + plan.skillIdx * 2 + 2;
      return {
        response: nq.question,
        acknowledgement: nq.acknowledgement,
        phase: "skill_checkup",
        questionsAsked: asked,
        questionsTotal: plan.questionsTotal,
        complete: false,
      };
    }

    const skillName = plan.resumeSkills[plan.skillIdx] ?? `skill_${plan.skillIdx}`;
    const conf = await scoreSkill(plan);
    plan.skillsChecked[skillName] = conf;
    plan.skillIdx += 1;
    plan.skillRound = 0;

    if (plan.skillIdx >= plan.resumeSkills.length) {
      plan.phase = "complete";
      const pass = evalPass(plan);
      const { totalScore, verifiedSkills } = await finalizeSession(interviewId, userId, plan, pass, false);
      return {
        response: pass
          ? "Great work — you have completed the AI Skills interview. Results are saved to your verification profile."
          : "This session is complete. You did not meet the verification bar for this attempt; you can retry after the cooldown and retake policy.",
        acknowledgement: null,
        phase: "complete",
        questionsAsked: plan.questionsTotal,
        questionsTotal: plan.questionsTotal,
        complete: true,
        score: totalScore,
        verifiedSkills,
        pass,
        timeExpired: false,
      };
    }

    const nq = await genSkillQuestion(plan);
    plan.currentQuestion = nq.question;
    plan.history.push({ role: "ai", content: nq.question });
    await persistPlan(interviewId, plan);
    const asked = DSA_PART_QUESTIONS + plan.skillIdx * 2 + 1;
    return {
      response: nq.question,
      acknowledgement: nq.acknowledgement,
      phase: "skill_checkup",
      questionsAsked: asked,
      questionsTotal: plan.questionsTotal,
      complete: false,
    };
  }

  throw new Error("Interview already finished");
}

export async function getAiSkillsStatus(
  interviewId: string,
  userId: string,
): Promise<{
  interviewId: string;
  status: string;
  phase: string | null;
  currentQuestion: string | null;
  questionsAsked: number;
  questionsTotal: number;
  totalScore: number | null;
  scoreBreakdown: unknown;
  pass: boolean | null;
} | null> {
  const row = await prisma.interview.findFirst({
    where: { id: interviewId, userId, interviewType: "ai_skills" },
    select: { id: true, status: true, questionPlan: true, totalScore: true, scoreBreakdown: true },
  });
  if (!row) return null;
  const plan = parsePlan(row.questionPlan);
  const phase = plan?.phase ?? null;
  const breakdown = row.scoreBreakdown && typeof row.scoreBreakdown === "object" ? row.scoreBreakdown : null;
  const pass =
    breakdown && "pass" in (breakdown as object) ? Boolean((breakdown as { pass?: boolean }).pass) : null;
  let questionsAsked = 0;
  if (plan) {
    if (plan.phase === "dsa") questionsAsked = plan.dsaIndex + 1;
    else if (plan.phase === "skill") questionsAsked = DSA_PART_QUESTIONS + plan.skillIdx * 2 + plan.skillRound + 1;
    else questionsAsked = plan.questionsTotal;
  }
  return {
    interviewId: row.id,
    status: row.status,
    phase,
    currentQuestion: plan?.currentQuestion ?? null,
    questionsAsked,
    questionsTotal: plan?.questionsTotal ?? 0,
    totalScore: row.totalScore,
    scoreBreakdown: row.scoreBreakdown,
    pass,
  };
}
