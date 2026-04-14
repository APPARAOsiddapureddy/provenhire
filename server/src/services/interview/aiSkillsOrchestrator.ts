/**
 * AI Skills Interview — separate from adversarial v2 (`orchestrator.ts`).
 * Part A: DSA walkthrough; Part B: resume skill depth checks.
 */
import type { Prisma } from "@prisma/client";
import { prisma } from "../../config/prisma.js";
import type { DSAContext } from "../../types/dsaContext.js";
import type { ExperienceTier } from "../../utils/experienceTier.js";
import { experienceTierFromYears } from "../../utils/experienceTier.js";
import { detectDataSubtrack, type DataSubtrack } from "../../constants/verificationPipeline.js";
import { runGeminiJson } from "../ai.service.js";
import { syncJobSeekerVerificationStatus } from "../certification.service.js";
import { skillVerifiedThresholdForTier, syncProvenhireResumeFromSources } from "../provenhireResume.service.js";
import { calculateExpiry } from "../skillVerification.service.js";

const SESSION_MS = 30 * 60 * 1000;
const DSA_PART_QUESTIONS = 5;
const PLAN_VERSION = 1 as const;

/** Part A walkthrough angles — fully solved */
const FULLY_SOLVED_ANGLES = [
  "approach_explanation",
  "complexity_analysis",
  "edge_cases",
  "optimization",
  "alternative_approach",
] as const;

/** Part A walkthrough angles — partial pass */
const PARTIALLY_SOLVED_ANGLES = [
  "approach_explanation",
  "failure_identification",
  "debugging_thinking",
  "fix_attempt",
  "lesson_learned",
] as const;

/** Part A walkthrough angles — failed / not solved */
const ATTEMPTED_BUT_WRONG_ANGLES = [
  "initial_thinking",
  "obstacle_faced",
  "alternative_considered",
  "given_hint_respond",
  "conceptual_gap",
] as const;

type WalkthroughAngle =
  | (typeof FULLY_SOLVED_ANGLES)[number]
  | (typeof PARTIALLY_SOLVED_ANGLES)[number]
  | (typeof ATTEMPTED_BUT_WRONG_ANGLES)[number];

function anglesForProblem(p: DSAContext["problems"][0]): readonly WalkthroughAngle[] {
  if (p.isFullySolved) return FULLY_SOLVED_ANGLES;
  if (p.isPartiallySolved) return PARTIALLY_SOLVED_ANGLES;
  return ATTEMPTED_BUT_WRONG_ANGLES;
}

function buildAngleInstruction(angle: WalkthroughAngle, problem: DSAContext["problems"][0]): string {
  const t = problem.title;
  const passed = problem.testCasesPassed;
  const total = problem.testCasesTotal;
  const instructions: Record<WalkthroughAngle, string> = {
    approach_explanation: `Ask them to explain WHY they chose their specific approach for "${t}". Reference something visible in their code (e.g. the data structure they used, the algorithm choice).`,
    complexity_analysis: `Ask about the time and space complexity of their specific solution to "${t}". If you can see they used a hash map, ask about that choice. If they used sorting, ask about that.`,
    edge_cases: `Ask about a specific edge case for "${t}". Look at their code — is there an obvious case they might have missed (empty input, duplicates, negative numbers, single element)? Ask about that specific case.`,
    optimization: `Their solution to "${t}" works. Ask if there is a more efficient approach and why they did not use it. Or ask what would break if the input was 10x larger.`,
    alternative_approach: `Ask if they considered a different algorithm or data structure for "${t}" and why they chose the one they did.`,
    failure_identification: `Their solution to "${t}" passed only ${passed} of ${total} test cases. Ask them where they think their solution is failing and why.`,
    debugging_thinking: `Ask how they would debug their "${t}" solution to find which input causes it to fail.`,
    fix_attempt: `Ask what specific change they would make to their "${t}" solution to make the remaining test cases pass.`,
    lesson_learned: `Ask what they learned from the "${t}" problem and what they would do differently if they had another attempt.`,
    initial_thinking: `Ask what their initial approach was to "${t}" before they started coding.`,
    obstacle_faced: `Ask where they got stuck when solving "${t}" and what approaches they tried.`,
    alternative_considered: `Ask if they thought of a different approach to "${t}" that they did not implement and why.`,
    given_hint_respond: `Give them a small hint about "${t}" (based on a likely correct approach for this problem type) and ask how they would apply it.`,
    conceptual_gap: `Ask what concept or technique, if they had known it, would have helped them solve "${t}".`,
  };
  return instructions[angle];
}

function distributeQuestions(problems: DSAContext["problems"], totalQuestions: number): number[] {
  const n = problems.length;
  if (n === 0) return [];
  if (n >= totalQuestions) {
    const d = new Array(n).fill(0);
    for (let i = 0; i < totalQuestions; i++) d[i] = 1;
    return d;
  }
  const distribution = new Array(n).fill(1);
  let remaining = totalQuestions - n;
  for (let i = 0; i < n && remaining > 0; i++) {
    if (problems[i]!.isPartiallySolved) {
      distribution[i]++;
      remaining--;
    }
  }
  for (let i = 0; i < n && remaining > 0; i++) {
    if (problems[i]!.isFullySolved) {
      distribution[i]++;
      remaining--;
    }
  }
  let idx = 0;
  while (remaining > 0) {
    distribution[idx % n]++;
    remaining--;
    idx++;
  }
  return distribution;
}

function generateProblemIntroduction(
  problem: DSAContext["problems"][0],
  _problemNumber: number,
  _totalProblems: number,
): string {
  if (problem.isFullySolved) {
    return `You solved the "${problem.title}" problem — all test cases passed. `;
  }
  if (problem.isPartiallySolved) {
    return `Let's talk about the "${problem.title}" problem. You passed ${problem.testCasesPassed} out of ${problem.testCasesTotal} test cases. `;
  }
  return `Let's talk about the "${problem.title}" problem. This one did not pass the test cases. `;
}

function experienceInterviewLabel(level: "junior" | "mid" | "senior"): string {
  if (level === "junior") return "Fresher / junior";
  if (level === "mid") return "Mid-level";
  return "Senior";
}

function experienceInterviewGuidance(level: "junior" | "mid" | "senior"): string {
  if (level === "junior") return "Ask about basic understanding and approach; keep vocabulary accessible.";
  if (level === "mid") return "Ask about trade-offs, edge cases, and optimization where relevant.";
  return "Ask about optimization, alternative approaches, and production-scale concerns where relevant.";
}

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

/**
 * Load data round context (SQL + Python task submissions) for data track candidates.
 * Returns the same DSAContext shape so the interview flow is unified.
 */
export async function loadDataRoundContext(userId: string): Promise<DSAContext> {
  const result = await prisma.dataRoundResult.findFirst({
    where: { userId, invalidated: false },
    orderBy: { completedAt: "desc" },
  });
  if (!result?.answers || typeof result.answers !== "object") {
    return { problems: [] };
  }
  const taskScores = (result.answers as any)?.taskScores as Record<string, number> | undefined;
  if (!taskScores) return { problems: [] };

  const problems = await Promise.all(
    Object.entries(taskScores).map(async ([taskId, score]) => {
      const task = await prisma.dataRoundTask.findUnique({ where: { id: taskId } });
      const submission = await prisma.dataRoundSubmission.findFirst({
        where: { userId, taskId, isOfficial: true },
        orderBy: { submittedAt: "desc" },
      });
      const code = submission?.code ?? "";
      const language = submission?.language ?? "python";
      const passed = submission?.passedCount ?? 0;
      const total = Math.max(1, submission?.totalCount ?? 1);
      const fully = passed >= total;
      const partial = passed > 0 && passed < total;
      return {
        problemId: taskId,
        title: task?.title ?? "Data task",
        description: task?.description ?? "",
        difficulty: task?.difficulty ?? "Medium",
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
  candidateTrack: "software" | "data";
  dataSubtrack?: DataSubtrack;
  jobRole: string;
  experienceLevel: "junior" | "mid" | "senior";
  dsaProblems: DSAContext["problems"];
  resumeSkills: string[];
  dsaIndex: number;
  /** Part A: target question count per problem (length === dsaProblems.length; sums to DSA_PART_QUESTIONS when n > 0). */
  partADistribution?: number[];
  questionsAskedPerProblem?: number[];
  anglesUsedPerProblem?: string[][];
  partAAskedTexts?: string[];
  /** Problem index + angle for the question currently shown (for scoring and post-answer bookkeeping). */
  partAPending?: { problemIndex: number; angle: string };
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

function findNextPartAProblemIndex(plan: AISkillsPlanV1): number {
  const n = plan.dsaProblems.length;
  const dist = plan.partADistribution ?? [];
  const counts = plan.questionsAskedPerProblem ?? [];
  for (let i = 0; i < n; i++) {
    if ((counts[i] ?? 0) < (dist[i] ?? 0)) return i;
  }
  return n;
}

function ensurePartAState(plan: AISkillsPlanV1): void {
  const n = plan.dsaProblems.length;
  if (n === 0) {
    plan.partADistribution = [];
    plan.questionsAskedPerProblem = [];
    plan.anglesUsedPerProblem = [];
    if (!plan.partAAskedTexts) plan.partAAskedTexts = [];
    return;
  }
  if (!plan.partADistribution || plan.partADistribution.length !== n) {
    plan.partADistribution = distributeQuestions(plan.dsaProblems, DSA_PART_QUESTIONS);
  }
  const dist = plan.partADistribution;
  if (!plan.questionsAskedPerProblem || plan.questionsAskedPerProblem.length !== n) {
    const reconstructed = new Array(n).fill(0);
    for (let i = 0; i < plan.dsaIndex; i++) {
      const j = i % n;
      reconstructed[j] = (reconstructed[j] ?? 0) + 1;
    }
    for (let j = 0; j < n; j++) {
      reconstructed[j] = Math.min(reconstructed[j] ?? 0, dist[j] ?? 0);
    }
    plan.questionsAskedPerProblem = reconstructed;
  }
  if (!plan.anglesUsedPerProblem || plan.anglesUsedPerProblem.length !== n) {
    plan.anglesUsedPerProblem = Array.from({ length: n }, () => []);
  }
  if (!plan.partAAskedTexts) plan.partAAskedTexts = [];

  const nm = Math.max(1, n);
  if (plan.phase === "dsa" && plan.partAPending == null && plan.currentQuestion) {
    plan.partAPending = { problemIndex: plan.dsaIndex % nm, angle: "approach_explanation" };
  }
}

function fallbackPartAWalkthrough(
  problem: DSAContext["problems"][0],
  angle: WalkthroughAngle,
  intro: string,
  isFirst: boolean,
): string {
  const head = isFirst ? intro.trim() : `Regarding "${problem.title}": `;
  const bodies: Record<WalkthroughAngle, string> = {
    approach_explanation: `walk me through why you chose this approach, pointing to a concrete part of your submitted code.`,
    complexity_analysis: `what are the time and space costs of your implementation here, and what in your code drives those costs?`,
    edge_cases: `what edge case might still break this solution, looking at how you handled boundaries in your code?`,
    optimization: `if the input grew by an order of magnitude, what part of your solution would you revisit first?`,
    alternative_approach: `what other approach did you consider for this problem, and why did you stick with what you wrote?`,
    failure_identification: `where do you think your solution is failing relative to the ${problem.testCasesPassed}/${problem.testCasesTotal} tests you passed?`,
    debugging_thinking: `how would you narrow down which input breaks your current implementation?`,
    fix_attempt: `what is the first concrete change you would try to get the remaining tests passing?`,
    lesson_learned: `what would you do differently on a second attempt at this problem?`,
    initial_thinking: `before you wrote this code, how were you planning to attack the problem?`,
    obstacle_faced: `where did you get stuck while working on it, and what did you try next?`,
    alternative_considered: `did you consider a different structure or strategy that you did not end up coding?`,
    given_hint_respond: `if the key idea is to rethink how you traverse or combine the data, how would you rework your solution with that in mind?`,
    conceptual_gap: `what technique or pattern do you wish you had used here?`,
  };
  return `${head}${bodies[angle]}`.replace(/\s+/g, " ").trim();
}

async function generatePartAWalkthroughQuestion(
  plan: AISkillsPlanV1,
  problem: DSAContext["problems"][0],
  angle: WalkthroughAngle,
  isFirstOnProblem: boolean,
): Promise<{ question: string; acknowledgement: string | null }> {
  const intro = isFirstOnProblem
    ? generateProblemIntroduction(problem, 1, plan.dsaProblems.length)
    : "";
  const problemContext = `
PROBLEM THE CANDIDATE SOLVED:
Title: ${problem.title}
Difficulty: ${problem.difficulty}
Description: ${problem.description.slice(0, 8000)}

CANDIDATE'S SUBMITTED CODE (${problem.language}):
${problem.candidateCode ?? "Code not available"}

TEST RESULTS:
- Passed: ${problem.testCasesPassed} out of ${problem.testCasesTotal} test cases
- Status: ${problem.isFullySolved ? "Fully solved" : problem.isPartiallySolved ? "Partially solved" : "Not solved"}
`;

  const trackNote =
    plan.candidateTrack === "data"
      ? "This is a Data Round task (SQL and/or Python data processing). Every question must reference THEIR submitted query or code and test results — not unrelated abstract DSA trivia."
      : "This is their real coding-round submission. Every question must reference THEIR implementation and test results — not generic textbook topics like unrelated algorithms.";

  const askedList = plan.partAAskedTexts?.length ? plan.partAAskedTexts.join("\n") : "None yet";
  const angleInstr = buildAngleInstruction(angle, problem);

  const openingRule = isFirstOnProblem
    ? `Your spoken question MUST begin with this exact framing, then continue naturally in the same breath: "${intro.trim()}"`
    : `Continue probing "${problem.title}" without repeating the long opening — stay anchored to their code and pass/fail pattern.`;

  const system = `You are a senior technical interviewer. Output ONLY valid JSON: {"acknowledgement":"one short sentence or empty string","question":"one spoken interview question, no markdown"}. The question must be 2–3 sentences (~45–95 words), plain clear English for Indian listeners, one main ask — not a lecture.`;

  const user = `You are conducting a professional follow-up on the candidate's OWN submission from their assessment round.

${trackNote}

${problemContext}

ANGLE KEY: ${angle}
INSTRUCTION FOR THIS ANGLE (follow closely):
${angleInstr}

EXPERIENCE LEVEL: ${experienceInterviewLabel(plan.experienceLevel)}
${experienceInterviewGuidance(plan.experienceLevel)}

QUESTIONS ALREADY ASKED — do not repeat themes or wording:
${askedList}

${openingRule}

Write ONE conversational question that:
1. References the specific problem title
2. References something specific from their submitted code OR their test results
3. Matches the angle instruction
4. Sounds like a real interviewer, not a quiz

This is walkthrough question ${plan.dsaIndex + 1} of ${DSA_PART_QUESTIONS} for Part A.`;

  const parsed = await runGeminiJson<{ acknowledgement?: string; question?: string }>(system, user, {
    maxOutputTokens: 768,
  });
  if (parsed?.question?.trim()) {
    return { question: parsed.question.trim(), acknowledgement: parsed.acknowledgement?.trim() || null };
  }
  return {
    acknowledgement: "Got it.",
    question: fallbackPartAWalkthrough(problem, angle, intro, isFirstOnProblem),
  };
}

async function genPartAWithoutSubmissions(plan: AISkillsPlanV1): Promise<{ question: string; acknowledgement: string | null }> {
  const depth = plan.track === "fresher" ? "fresher" : plan.track === "mid" ? "mid-level" : "senior";
  const sub = plan.dataSubtrack ?? "engineering";
  const system = `You are a concise technical interviewer (~${depth}). Output ONLY valid JSON: {"acknowledgement":"one short sentence or empty","question":"one spoken interview question, no markdown"}. Question: 2–3 sentences (~45–95 words), plain English for Indian listeners, one main ask.`;
  const user =
    plan.candidateTrack === "data"
      ? `No saved data-round submission text was found. Ask one practical spoken question appropriate for a ${sub} hire at ~${depth} for walkthrough question ${plan.dsaIndex + 1} of ${DSA_PART_QUESTIONS}. Keep it conversational.`
      : `No saved coding submission was found. Ask one spoken problem-solving question appropriate for ~${depth} for question ${plan.dsaIndex + 1} of ${DSA_PART_QUESTIONS}. Keep it conversational and scenario-grounded.`;
  const parsed = await runGeminiJson<{ acknowledgement?: string; question?: string }>(system, user, {
    maxOutputTokens: 768,
  });
  if (parsed?.question?.trim()) {
    return { question: parsed.question.trim(), acknowledgement: parsed.acknowledgement?.trim() || null };
  }
  const fb =
    plan.candidateTrack === "data"
      ? "Walk me through how you would sanity-check a SQL result before sending it to stakeholders."
      : "Walk me through how you would decompose a concrete array or map problem before writing code.";
  return { acknowledgement: "Got it.", question: fb };
}

async function genDsaQuestion(plan: AISkillsPlanV1): Promise<{ question: string; acknowledgement: string | null }> {
  ensurePartAState(plan);
  const probs = plan.dsaProblems;
  if (!probs.length) {
    plan.partAPending = undefined;
    return genPartAWithoutSubmissions(plan);
  }
  const probIdx = findNextPartAProblemIndex(plan);
  if (probIdx >= probs.length) {
    plan.partAPending = undefined;
    return { acknowledgement: null, question: "" };
  }
  const problem = probs[probIdx]!;
  const counts = plan.questionsAskedPerProblem!;
  const qOnThis = counts[probIdx] ?? 0;
  const anglesPool = anglesForProblem(problem);
  const used = new Set(plan.anglesUsedPerProblem![probIdx] ?? []);
  const available = anglesPool.filter((a) => !used.has(a));
  const angle = (available[0] ?? anglesPool[qOnThis % anglesPool.length]) as WalkthroughAngle;
  plan.partAPending = { problemIndex: probIdx, angle };

  const isFirstOnProblem = qOnThis === 0;
  return generatePartAWalkthroughQuestion(plan, problem, angle, isFirstOnProblem);
}

function generateDataSkillQuestion(
  skill: string,
  questionIndex: number,
  experienceLevel: ExperienceTier,
  dataSubtrack?: DataSubtrack,
): string {
  const skillLower = (skill || "").toLowerCase();
  void dataSubtrack;

  const tier = experienceLevel;

  const pick = (qs: string[]) => qs[questionIndex % qs.length]!;

  if (skillLower.includes("sql") || skillLower.includes("postgres") || skillLower.includes("mysql")) {
    const fresherQ = [
      "Explain the difference between INNER JOIN and LEFT JOIN with a simple example.",
      "What does GROUP BY do and when would you use HAVING instead of WHERE?",
    ];
    const midQ = [
      "Explain the difference between RANK() and DENSE_RANK() with an example.",
      "What is a CTE and when would you prefer it over a subquery?",
    ];
    const seniorQ = [
      "Walk me through how you would optimize a slow query on a 100-million-row table.",
      "Explain what a query execution plan is and what you look for when diagnosing performance.",
    ];
    return pick(tier === "fresher" ? fresherQ : tier === "mid" ? midQ : seniorQ);
  }

  if (skillLower.includes("python") || skillLower.includes("pandas")) {
    const fresherQ = [
      "What is the difference between loc and iloc in pandas?",
      "How do you handle missing values in a pandas DataFrame?",
    ];
    const midQ = [
      "You have a DataFrame with 10 million rows. What techniques would you use to process it efficiently?",
      "What is the difference between apply() and vectorized operations in pandas? When does it matter?",
    ];
    const seniorQ = [
      "Describe a situation where you had to optimize a pandas pipeline for production. What did you change?",
      "When would you choose Polars or Dask over pandas, and why?",
    ];
    return pick(tier === "fresher" ? fresherQ : tier === "mid" ? midQ : seniorQ);
  }

  if (skillLower.includes("statistics") || skillLower.includes("stat")) {
    const fresherQ = [
      "Explain what a p-value means in plain language.",
      "What is the difference between mean and median, and when does median matter more?",
    ];
    const midQ = [
      "Explain the difference between Type I and Type II errors. When is each more costly?",
      "What is the central limit theorem and why does it matter in practice?",
    ];
    const seniorQ = [
      "How do you design an A/B test for a business decision, and what pitfalls do you watch for?",
      "Explain selection bias and give an example of how it can distort analysis results.",
    ];
    return pick(tier === "fresher" ? fresherQ : tier === "mid" ? midQ : seniorQ);
  }

  if (skillLower.includes("pytorch") || skillLower.includes("tensorflow") || skillLower.includes("sklearn")) {
    const fresherQ = [
      "What is the difference between supervised and unsupervised learning?",
      "What is overfitting and how do you detect it?",
    ];
    const midQ = [
      "Explain the bias–variance tradeoff with a real example.",
      "When would you choose a gradient boosting model over a neural network?",
    ];
    const seniorQ = [
      "How do you handle model drift in production?",
      "Describe your approach to feature selection for a classification problem with 500 features.",
    ];
    return pick(tier === "fresher" ? fresherQ : tier === "mid" ? midQ : seniorQ);
  }

  if (
    ["spark", "airflow", "dbt", "kafka", "flink", "databricks", "snowflake", "bigquery", "redshift"].some((t) =>
      skillLower.includes(t)
    )
  ) {
    const midQ = [
      `What are the main use cases for ${skill} and when would you NOT use it?`,
      `What is the hardest problem you have solved using ${skill}?`,
    ];
    const seniorQ = [
      `Describe how you would architect a production system using ${skill} at scale.`,
      `What are failure modes of ${skill} that you have encountered, and how did you mitigate them?`,
    ];
    return pick(tier === "senior" ? seniorQ : midQ);
  }

  return questionIndex === 0
    ? `Walk me through how you have used ${skill} in a real project.`
    : `What is the most complex problem you have solved using ${skill}?`;
}

async function genSkillQuestion(plan: AISkillsPlanV1): Promise<{ question: string; acknowledgement: string | null }> {
  const skill = plan.resumeSkills[plan.skillIdx] ?? "this skill";
  const depth = plan.track === "fresher" ? "basic conceptual" : plan.track === "mid" ? "practical on-the-job" : "deep architecture-level";
  const round = plan.skillRound + 1;
  if (plan.candidateTrack === "data") {
    const q = generateDataSkillQuestion(skill, plan.skillRound, plan.track, plan.dataSubtrack);
    return { acknowledgement: "Got it.", question: q };
  }
  const system = `You verify resume skills. Output ONLY JSON: {"acknowledgement":"short or empty","question":"spoken question only"}. Question: 2–3 sentences (~45–95 words), plain English for Indian listeners, one main ask — not a lecture.`;
  const user = `Skill: ${skill}. Experience band: ${plan.track}. Depth: ${depth}.
This is follow-up ${round} of 2 for this skill. ${round === 1 ? "Start with foundations." : "Ask for a concrete example or trade-off."}`;
  const parsed = await runGeminiJson<{ acknowledgement?: string; question?: string }>(system, user, {
    maxOutputTokens: 768,
  });
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
  overrideStageName?: string,
): Promise<{ totalScore: number; verifiedSkills: Array<{ skill: string; confidence: number }> }> {
  const { total, dsaAvg, skillAvg } = computeCompositeScore(plan);
  const threshold = skillVerifiedThresholdForTier(plan.track);
  const verifiedSkills = Object.entries(plan.skillsChecked)
    .filter(([, c]) => c >= threshold)
    .map(([skill, confidence]) => ({ skill, confidence }));

  const scoreBreakdown: Record<string, unknown> = {
    verified_skills: Object.entries(plan.skillsChecked).map(([skill, confidence]) => ({
      skill,
      confidence,
      status: confidence >= threshold ? "verified" : "below_threshold",
    })),
    dsa_walkthrough_scores: plan.dsaUnderstandingScores,
    composite: { dsaAvg, skillAvg, total },
    pass,
    timeExpired,
    track: plan.track,
    threshold,
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

  const stageName = overrideStageName || "ai_skills_interview";

  await prisma.verificationStage.upsert({
    where: { userId_stageName: { userId, stageName } },
    create: {
      userId,
      stageName,
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
        verifiedInStage: stageName,
        completedAt,
        expiresAt: calculateExpiry("INTERVIEW", completedAt),
      },
      update: {
        status: "ACTIVE",
        score: total,
        confidenceScore: plan.resumeSkills.length ? skillAvg : null,
        verifiedInStage: stageName,
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
        verifiedInStage: stageName,
        completedAt,
        expiresAt: null,
      },
      update: {
        status: "FAILED",
        score: total,
        confidenceScore: plan.resumeSkills.length ? skillAvg : null,
        verifiedInStage: stageName,
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

  syncProvenhireResumeFromSources(userId).catch((err) =>
    console.error("[ai-skills] resume sync after completion:", err)
  );

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
  opts?: { isDataTrack?: boolean },
): Promise<{
  interviewId: string;
  firstQuestion: string;
  acknowledgement: string | null;
  phase: "dsa_walkthrough" | "skill_checkup";
  questionsTotal: number;
  resumed?: boolean;
}> {
  const isData = opts?.isDataTrack === true;
  const interviewStageName = isData ? "data_skills_interview" : "ai_skills_interview";
  const prerequisiteStageName = isData ? "data_round" : "dsa_round";

  const stage = await prisma.verificationStage.findUnique({
    where: { userId_stageName: { userId, stageName: interviewStageName } },
  });
  if (!stage || stage.status !== "in_progress") {
    throw new Error("AI Skills stage must be in progress. Open this step from your verification pipeline first.");
  }

  const prereqDone = await prisma.verificationStage.findFirst({
    where: { userId, stageName: prerequisiteStageName, status: "completed" },
  });
  if (!prereqDone) {
    throw new Error(`Complete the ${isData ? "Data Round" : "DSA round"} before starting the AI Skills interview.`);
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
    select: { experienceYears: true, roleType: true, targetJobTitle: true },
  });
  const profileTier = experienceTierFromYears(profile?.experienceYears);
  const useTrack: ExperienceTier = track ?? profileTier;

  const candidateTrack: "software" | "data" = opts?.isDataTrack === true || profile?.roleType === "data" ? "data" : "software";
  const dataSubtrack = candidateTrack === "data" ? detectDataSubtrack(profile?.targetJobTitle ?? "") : undefined;

  const dsaProblems = isData
    ? await loadDataRoundContext(userId)
    : await loadDSAContext(userId);
  const rawSkills = await loadResumeSkills(userId);
  const slots = skillSlotsForTrack(useTrack);
  const resumeSkills = rawSkills.slice(0, Math.max(1, Math.min(slots, rawSkills.length)));
  const questionsTotal = DSA_PART_QUESTIONS + resumeSkills.length * 2;

  const sessionStartedAt = new Date().toISOString();
  const plan: AISkillsPlanV1 = {
    v: PLAN_VERSION,
    phase: "dsa",
    track: useTrack,
    candidateTrack,
    dataSubtrack,
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
  opts?: { overrideStageName?: string },
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
    const { totalScore, verifiedSkills } = await finalizeSession(interviewId, userId, plan, false, true, opts?.overrideStageName);
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
    ensurePartAState(plan);
    const n = plan.dsaProblems.length;
    const pending = plan.partAPending;
    const prob =
      pending != null && n > 0 && pending.problemIndex >= 0 && pending.problemIndex < n
        ? plan.dsaProblems[pending.problemIndex]!
        : pickProblem(plan, plan.dsaIndex);
    const asked = plan.currentQuestion;
    const s = await scoreDsaAnswer(prob, asked, answerTrim);
    plan.dsaUnderstandingScores.push(s);
    if (plan.partAAskedTexts && asked) plan.partAAskedTexts.push(asked);
    if (pending != null && plan.questionsAskedPerProblem && n > 0) {
      const pid = pending.problemIndex;
      if (pid >= 0 && pid < n) {
        plan.questionsAskedPerProblem[pid] = (plan.questionsAskedPerProblem[pid] ?? 0) + 1;
        const au = plan.anglesUsedPerProblem![pid] ?? [];
        au.push(pending.angle);
        plan.anglesUsedPerProblem![pid] = au;
      }
    }
    plan.partAPending = undefined;
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
      const { totalScore, verifiedSkills } = await finalizeSession(interviewId, userId, plan, pass, false, opts?.overrideStageName);
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
