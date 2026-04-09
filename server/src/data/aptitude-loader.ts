/**
 * Loads aptitude questions and selects 20 questions with experience-based difficulty.
 * Marks: easy=1, medium=2, hard=3. All sets normalized to 25 total; pass = 60%.
 */

import { existsSync, readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { experienceTierFromYears, questionSetForTier } from "../utils/experienceTier.js";
import { detectNonTechSubtrack } from "../constants/verificationPipeline.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

export const APTITUDE_MARKS = { easy: 1, medium: 2, hard: 3 } as const;
export const APTITUDE_QUESTION_COUNT = 20;

/** Non-technical domain fundamentals: role MCQs only (no cognitive/aptitude mix). */
export const NON_TECH_DOMAIN_QUESTION_COUNT = 15;
export const NON_TECH_DOMAIN_TIME_LIMIT_MINUTES = 20;
export const NON_TECH_DOMAIN_PASS_THRESHOLD_FRACTION = 0.6;

export const NON_TECH_DOMAIN_FUNDAMENTALS_CONFIG = {
  questionCount: NON_TECH_DOMAIN_QUESTION_COUNT,
  timeLimitMinutes: NON_TECH_DOMAIN_TIME_LIMIT_MINUTES,
  passThresholdFraction: NON_TECH_DOMAIN_PASS_THRESHOLD_FRACTION,
} as const;

export interface McqQuestionRaw {
  _id?: { $oid?: string };
  question: string;
  questionType?: string;
  option_1: string;
  option_2: string;
  option_3: string;
  option_4: string;
  answer: string;
  difficultyLevel: "easy" | "medium" | "hard";
}

export interface AptitudeQuestionForClient {
  id: string;
  question: string;
  options: string[];
  marks: number;
}

export interface AptitudeSession {
  questions: AptitudeQuestionForClient[];
  answerKey: Record<string, string>;
  marksKey: Record<string, number>;
  totalMarks: number;
  passThreshold: number;
}

function shuffleArray<T>(arr: T[]): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

let cachedQuestions: McqQuestionRaw[] | null = null;

function resolveAptitudeQuestionsPath(): string {
  const name = "aptitude-questions.json";
  const candidates = [
    join(__dirname, name),
    join(process.cwd(), "dist", "src", "data", name),
    join(process.cwd(), "src", "data", name),
    join(process.cwd(), "server", "src", "data", name),
    join(process.cwd(), "server", "dist", "src", "data", name),
  ];
  for (const p of candidates) {
    if (existsSync(p)) return p;
  }
  throw new Error(`aptitude-questions.json not found (tried: ${candidates.join("; ")})`);
}

function loadQuestions(): McqQuestionRaw[] {
  if (cachedQuestions) return cachedQuestions;
  const p = resolveAptitudeQuestionsPath();
  const raw = readFileSync(p, "utf-8");
  const parsed = JSON.parse(raw) as McqQuestionRaw[];
  cachedQuestions = parsed.filter(isValidMcqQuestionRaw);
  return cachedQuestions;
}

function getQuestionId(q: McqQuestionRaw): string {
  return q._id?.$oid || `q-${q.question.slice(0, 30).replace(/\W/g, "")}-${Math.random().toString(36).slice(2, 9)}`;
}

function normalizeText(s: unknown): string {
  return (s ?? "").toString().trim();
}

function normalizeOptionKey(s: string): string {
  return s.trim().replace(/\s+/g, " ").toLowerCase();
}

function isValidMcqQuestionRaw(q: McqQuestionRaw): boolean {
  const question = normalizeText(q?.question);
  const answer = normalizeText(q?.answer);
  if (!question || !answer) return false;
  const optionsRaw = [q.option_1, q.option_2, q.option_3, q.option_4].map(normalizeText).filter(Boolean);
  if (optionsRaw.length < 2) return false;
  const uniq = new Map<string, string>();
  for (const opt of optionsRaw) {
    const key = normalizeOptionKey(opt);
    if (!uniq.has(key)) uniq.set(key, opt);
  }
  if (uniq.size < 2) return false;
  const answerKey = normalizeOptionKey(answer);
  if (!uniq.has(answerKey)) return false;
  return true;
}

function isVerbal(q: McqQuestionRaw): boolean {
  const type = normalizeText(q.questionType).toLowerCase();
  if (type === "verbal") return true;
  if (type === "quantitative" || type === "logical") return false;
  const text = normalizeText(q.question).toLowerCase();
  const hasMathSignals = /(\d|[%+\-*/=₹$])/.test(text);
  if (hasMathSignals) return false;
  // Common verbal patterns in aptitude datasets.
  if (
    /(synonym|antonym|meaning of|spell(?:ing)?|grammar|sentence|fill in the blanks|comprehension|passage|idiom|phrase|one word|error in|choose the correct word)/i.test(
      text
    )
  ) {
    return true;
  }
  // Default: treat unknown as quant/logical to keep verbal strictly limited.
  return false;
}

export type AptitudeQuestionSetId =
  | "aptitude_mixed"
  | "cs_fundamentals_medium"
  | "cs_fundamentals_advanced"
  | "data_fundamentals_fresher"
  | "data_fundamentals_medium"
  | "data_fundamentals_advanced"
  | "non_tech_domain_fundamentals";

type NonTechDomainMcq = McqQuestionRaw & { subtrack?: string };

let cachedCsQuestions: McqQuestionRaw[] | null = null;

function resolveCsQuestionsPath(): string {
  const name = "cs-fundamentals-questions.json";
  const candidates = [
    join(__dirname, name),
    join(process.cwd(), "dist", "src", "data", name),
    join(process.cwd(), "src", "data", name),
    join(process.cwd(), "server", "src", "data", name),
    join(process.cwd(), "server", "dist", "src", "data", name),
  ];
  for (const p of candidates) {
    if (existsSync(p)) return p;
  }
  throw new Error(`cs-fundamentals-questions.json not found (tried: ${candidates.join("; ")})`);
}

function loadCsQuestions(): McqQuestionRaw[] {
  if (cachedCsQuestions) return cachedCsQuestions;
  const p = resolveCsQuestionsPath();
  const raw = readFileSync(p, "utf-8");
  const parsed = JSON.parse(raw) as McqQuestionRaw[];
  cachedCsQuestions = parsed.filter(isValidMcqQuestionRaw);
  return cachedCsQuestions;
}

let cachedDataFundamentalsQuestions: McqQuestionRaw[] | null = null;

function resolveDataFundamentalsPath(): string {
  const name = "data-fundamentals-questions.json";
  const candidates = [
    join(__dirname, name),
    join(process.cwd(), "dist", "src", "data", name),
    join(process.cwd(), "src", "data", name),
    join(process.cwd(), "server", "src", "data", name),
    join(process.cwd(), "server", "dist", "src", "data", name),
  ];
  for (const p of candidates) {
    if (existsSync(p)) return p;
  }
  throw new Error(`data-fundamentals-questions.json not found (tried: ${candidates.join("; ")})`);
}

function loadDataFundamentalsQuestions(): McqQuestionRaw[] {
  if (cachedDataFundamentalsQuestions) return cachedDataFundamentalsQuestions;
  const p = resolveDataFundamentalsPath();
  const raw = readFileSync(p, "utf-8");
  const parsed = JSON.parse(raw) as McqQuestionRaw[];
  cachedDataFundamentalsQuestions = parsed.filter(isValidMcqQuestionRaw);
  return cachedDataFundamentalsQuestions;
}

let cachedNonTechDomainQuestions: NonTechDomainMcq[] | null = null;

function resolveNonTechDomainPath(): string {
  const name = "non-tech-domain-questions.json";
  const candidates = [
    join(__dirname, name),
    join(process.cwd(), "dist", "src", "data", name),
    join(process.cwd(), "src", "data", name),
    join(process.cwd(), "server", "src", "data", name),
    join(process.cwd(), "server", "dist", "src", "data", name),
  ];
  for (const p of candidates) {
    if (existsSync(p)) return p;
  }
  throw new Error(`non-tech-domain-questions.json not found (tried: ${candidates.join("; ")})`);
}

function loadNonTechDomainQuestions(): NonTechDomainMcq[] {
  if (cachedNonTechDomainQuestions) return cachedNonTechDomainQuestions;
  const p = resolveNonTechDomainPath();
  const raw = readFileSync(p, "utf-8");
  const parsed = JSON.parse(raw) as NonTechDomainMcq[];
  cachedNonTechDomainQuestions = parsed.filter(isValidMcqQuestionRaw);
  return cachedNonTechDomainQuestions;
}

function buildAptitudeSessionFromMcqs(selectedMcq: McqQuestionRaw[]): AptitudeSession {
  const selected = shuffleArray(selectedMcq);
  const answerKey: Record<string, string> = {};
  const marksKey: Record<string, number> = {};
  const questions: AptitudeQuestionForClient[] = selected.map((q) => {
    const id = getQuestionId(q);
    const diff = (q.difficultyLevel || "").toLowerCase();
    const marks = diff === "easy" ? APTITUDE_MARKS.easy : diff === "medium" ? APTITUDE_MARKS.medium : APTITUDE_MARKS.hard;
    answerKey[id] = (q.answer || "").trim();
    marksKey[id] = marks;
    const opts = [q.option_1, q.option_2, q.option_3, q.option_4].map(normalizeText).filter(Boolean);
    const uniq = new Map<string, string>();
    for (const opt of opts) {
      const key = normalizeOptionKey(opt);
      if (!uniq.has(key)) uniq.set(key, opt);
    }
    const cleanOpts = Array.from(uniq.values());
    return {
      id,
      question: q.question,
      options: shuffleArray(cleanOpts),
      marks,
    };
  });

  let totalMarks = questions.reduce((sum, q) => sum + (marksKey[q.id] ?? 1), 0);
  const TARGET = 25;
  if (totalMarks > 0 && totalMarks !== TARGET) {
    const ids = questions.map((q) => q.id);
    for (const id of ids) {
      marksKey[id] = Math.max(1, Math.round(((marksKey[id] ?? 1) / totalMarks) * TARGET));
    }
    totalMarks = ids.reduce((s, id) => s + (marksKey[id] ?? 1), 0);
    let d = TARGET - totalMarks;
    let i = 0;
    while (d !== 0 && i < ids.length * 4) {
      const id = ids[i % ids.length]!;
      if (d > 0) {
        marksKey[id] = (marksKey[id] ?? 1) + 1;
        d -= 1;
      } else if ((marksKey[id] ?? 1) > 1) {
        marksKey[id] = (marksKey[id] ?? 1) - 1;
        d += 1;
      }
      i++;
    }
    totalMarks = ids.reduce((s, id) => s + (marksKey[id] ?? 1), 0);
  }

  for (const q of questions) {
    q.marks = marksKey[q.id] ?? q.marks;
  }

  const passThreshold = Math.ceil(totalMarks * 0.6);
  return { questions, answerKey, marksKey, totalMarks, passThreshold };
}

/** 15 domain questions, 1 mark each; pass = 60% (9/15). No aptitude questions. */
function buildNonTechDomainFundamentalsSessionFromMcqs(selectedMcq: McqQuestionRaw[]): AptitudeSession {
  const picked = shuffleArray(selectedMcq).slice(0, NON_TECH_DOMAIN_QUESTION_COUNT);
  const answerKey: Record<string, string> = {};
  const marksKey: Record<string, number> = {};
  const questions: AptitudeQuestionForClient[] = picked.map((q) => {
    const id = getQuestionId(q);
    answerKey[id] = (q.answer || "").trim();
    marksKey[id] = 1;
    const opts = [q.option_1, q.option_2, q.option_3, q.option_4].map(normalizeText).filter(Boolean);
    const uniq = new Map<string, string>();
    for (const opt of opts) {
      const key = normalizeOptionKey(opt);
      if (!uniq.has(key)) uniq.set(key, opt);
    }
    const cleanOpts = Array.from(uniq.values());
    return {
      id,
      question: q.question,
      options: shuffleArray(cleanOpts),
      marks: 1,
    };
  });
  const totalMarks = questions.length;
  const passThreshold = Math.ceil(totalMarks * NON_TECH_DOMAIN_PASS_THRESHOLD_FRACTION);
  return { questions, answerKey, marksKey, totalMarks, passThreshold };
}

function selectMainBankMcqs(experienceYears: number, targetTotal: number): McqQuestionRaw[] {
  const all = loadQuestions();
  const verbalPool = all.filter(isVerbal);
  const quantLogicalPool = all.filter((q) => !isVerbal(q));
  const byDifficulty = (pool: McqQuestionRaw[]) => ({
    easy: pool.filter((q) => (q.difficultyLevel || "").toLowerCase() === "easy"),
    medium: pool.filter((q) => (q.difficultyLevel || "").toLowerCase() === "medium"),
    hard: pool.filter((q) => (q.difficultyLevel || "").toLowerCase() === "hard"),
  });
  const verbalByDiff = byDifficulty(verbalPool);
  const quantByDiff = byDifficulty(quantLogicalPool);

  const scale = targetTotal / APTITUDE_QUESTION_COUNT;
  let needEasy: number;
  let needMedium: number;
  let needHard: number;

  if (experienceYears < 1) {
    needEasy = Math.max(1, Math.round(15 * scale));
    needMedium = Math.max(1, Math.round(5 * scale));
    needHard = 0;
  } else if (experienceYears <= 3) {
    needEasy = Math.max(1, Math.round(10 * scale));
    needMedium = Math.max(1, Math.round(5 * scale));
    needHard = Math.max(0, Math.round(5 * scale));
  } else {
    needEasy = Math.max(1, Math.round(5 * scale));
    needMedium = Math.max(1, Math.round(5 * scale));
    needHard = Math.max(1, Math.round(10 * scale));
  }

  const pick = (pool: McqQuestionRaw[], n: number, exclude = new Set<McqQuestionRaw>()): McqQuestionRaw[] => {
    const available = pool.filter((q) => !exclude.has(q));
    const shuffled = shuffleArray(available);
    return shuffled.slice(0, Math.min(n, shuffled.length));
  };

  const used = new Set<McqQuestionRaw>();
  let needVerbalEasy = 2;
  let needVerbalMedium = 0;
  let needVerbalHard = 0;
  if (experienceYears >= 1 && experienceYears <= 3) {
    needVerbalEasy = 1;
    needVerbalMedium = 1;
  } else if (experienceYears > 3) {
    needVerbalEasy = 0;
    needVerbalMedium = 1;
    needVerbalHard = 1;
  }
  if (targetTotal < 12) {
    needVerbalEasy = Math.min(needVerbalEasy, 1);
    needVerbalMedium = 0;
    needVerbalHard = 0;
  }
  const verbalEasy = pick(verbalByDiff.easy, needVerbalEasy, used);
  verbalEasy.forEach((q) => used.add(q));
  const verbalMedium = pick(verbalByDiff.medium, needVerbalMedium, used);
  verbalMedium.forEach((q) => used.add(q));
  const verbalHard = pick(verbalByDiff.hard, needVerbalHard, used);
  verbalHard.forEach((q) => used.add(q));
  const selectedVerbal: McqQuestionRaw[] = [...verbalEasy, ...verbalMedium, ...verbalHard];
  const verbalTarget = Math.min(2, Math.max(1, Math.round(2 * scale)));
  const verbalNeeded = verbalTarget - selectedVerbal.length;
  if (verbalNeeded > 0) {
    const fallbackVerbal = verbalPool.filter((q) => !used.has(q));
    const more = pick(fallbackVerbal, verbalNeeded, used);
    more.forEach((q) => used.add(q));
    selectedVerbal.push(...more);
  }

  const needQuantEasy = Math.max(0, needEasy - verbalEasy.length);
  const needQuantMedium = Math.max(0, needMedium - verbalMedium.length);
  const needQuantHard = Math.max(0, needHard - verbalHard.length);

  const easy = pick(quantByDiff.easy, needQuantEasy, used);
  easy.forEach((q) => used.add(q));
  const medium = pick(quantByDiff.medium, needQuantMedium, used);
  medium.forEach((q) => used.add(q));
  const hard = pick(quantByDiff.hard, needQuantHard, used);
  hard.forEach((q) => used.add(q));

  let selected: McqQuestionRaw[] = [...selectedVerbal, ...easy, ...medium, ...hard];
  const needed = targetTotal - selected.length;
  if (needed > 0) {
    const fallback = quantLogicalPool.filter((q) => !used.has(q));
    selected = [...selected, ...pick(fallback, needed)];
  }
  if (selected.length > targetTotal) {
    selected = shuffleArray(selected).slice(0, targetTotal);
  }
  return selected;
}

/**
 * Experience-based cognitive session: fresher = aptitude+CS easy mix; mid/senior = CS fundamentals banks.
 * Marks normalized toward 25 total; pass 60%.
 */
export function createAptitudeSessionByQuestionSet(
  questionSet: AptitudeQuestionSetId,
  experienceYears: number,
  opts?: { jobTitle?: string | null }
): AptitudeSession {
  if (questionSet === "non_tech_domain_fundamentals") {
    const domAll = loadNonTechDomainQuestions();
    const st = detectNonTechSubtrack(opts?.jobTitle ?? null);
    const tagged = domAll.filter((q) => (q as NonTechDomainMcq).subtrack === st);
    const general = domAll.filter((q) => (q as NonTechDomainMcq).subtrack === "general");
    let pool = [...tagged, ...general];
    if (pool.length < NON_TECH_DOMAIN_QUESTION_COUNT) pool = [...domAll];
    return buildNonTechDomainFundamentalsSessionFromMcqs(pool);
  }
  if (questionSet === "aptitude_mixed") {
    const main = selectMainBankMcqs(experienceYears, 15);
    const csAll = loadCsQuestions();
    const csEasy = csAll.filter((q) => (q.difficultyLevel || "").toLowerCase() === "easy");
    const csPick = shuffleArray(csEasy.length ? csEasy : csAll).slice(0, 5);
    return buildAptitudeSessionFromMcqs([...main, ...csPick]);
  }
  const cs = loadCsQuestions();
  if (questionSet === "cs_fundamentals_medium") {
    const med = cs.filter((q) => (q.difficultyLevel || "").toLowerCase() === "medium");
    const hard = cs.filter((q) => (q.difficultyLevel || "").toLowerCase() === "hard");
    let pMed = shuffleArray(med).slice(0, 15);
    let pHard = shuffleArray(hard).slice(0, 5);
    if (pMed.length < 15) {
      const rest = cs.filter((q) => !pMed.includes(q));
      pMed = [...pMed, ...shuffleArray(rest).slice(0, 15 - pMed.length)];
    }
    if (pHard.length < 5) {
      const rest = shuffleArray(cs.filter((q) => !pHard.includes(q) && !pMed.includes(q)));
      pHard = [...pHard, ...rest.slice(0, 5 - pHard.length)];
    }
    return buildAptitudeSessionFromMcqs([...pMed, ...pHard].slice(0, 20));
  }
  if (questionSet === "data_fundamentals_fresher") {
    const aptMain = selectMainBankMcqs(experienceYears, 10);
    const df = loadDataFundamentalsQuestions();
    const dfEasy = df.filter((q) => (q.difficultyLevel || "").toLowerCase() === "easy");
    const dfPick = shuffleArray(dfEasy.length >= 10 ? dfEasy : df).slice(0, 10);
    return buildAptitudeSessionFromMcqs([...aptMain, ...dfPick].slice(0, 20));
  }
  if (questionSet === "data_fundamentals_medium") {
    const df = loadDataFundamentalsQuestions();
    const med = df.filter((q) => (q.difficultyLevel || "").toLowerCase() === "medium");
    const hard = df.filter((q) => (q.difficultyLevel || "").toLowerCase() === "hard");
    let pMed = shuffleArray(med).slice(0, 15);
    let pHard = shuffleArray(hard).slice(0, 5);
    if (pMed.length + pHard.length < 20) {
      const fill = shuffleArray(df.filter((q) => !pMed.includes(q) && !pHard.includes(q)));
      pMed = [...pMed, ...fill.slice(0, 20 - pMed.length - pHard.length)];
    }
    return buildAptitudeSessionFromMcqs([...pMed, ...pHard].slice(0, 20));
  }
  if (questionSet === "data_fundamentals_advanced") {
    const df = loadDataFundamentalsQuestions();
    const hard = df.filter((q) => (q.difficultyLevel || "").toLowerCase() === "hard");
    const med = df.filter((q) => (q.difficultyLevel || "").toLowerCase() === "medium");
    const hardPick = shuffleArray(hard).slice(0, 15);
    const medPick = shuffleArray(med.filter((q) => !hardPick.includes(q))).slice(0, 5);
    const fill = shuffleArray(df.filter((q) => !hardPick.includes(q) && !medPick.includes(q)));
    return buildAptitudeSessionFromMcqs([...hardPick, ...medPick, ...fill.slice(0, Math.max(0, 20 - hardPick.length - medPick.length))].slice(0, 20));
  }

  // cs_fundamentals_advanced (default fallback)
  const hard = cs.filter((q) => (q.difficultyLevel || "").toLowerCase() === "hard");
  const medium = cs.filter((q) => (q.difficultyLevel || "").toLowerCase() === "medium");
  const hardPick = shuffleArray(hard.length >= 10 ? hard : cs).slice(0, 15);
  const medPick = shuffleArray(medium.filter((q) => !hardPick.includes(q))).slice(0, 5);
  const rest = shuffleArray(cs.filter((q) => !hardPick.includes(q) && !medPick.includes(q)));
  const fill = rest.slice(0, Math.max(0, 20 - hardPick.length - medPick.length));
  return buildAptitudeSessionFromMcqs([...hardPick, ...medPick, ...fill].slice(0, 20));
}

/** Backward-compatible entry: routes should pass explicit question set when stored on session. */
export function createAptitudeSession(experienceYears: number): AptitudeSession {
  return createAptitudeSessionByQuestionSet(questionSetForTier(experienceTierFromYears(experienceYears)), experienceYears);
}

/**
 * Return 2-3 practice questions (no session, no answer key stored).
 */
export function getPracticeAptitudeQuestions(): AptitudeQuestionForClient[] {
  const all = loadQuestions();
  const shuffled = shuffleArray(all);
  const picked = shuffled.slice(0, 3);
  return picked.map((q) => {
    const id = getQuestionId(q);
    const opts = [q.option_1, q.option_2, q.option_3, q.option_4].filter(Boolean);
    const m = APTITUDE_MARKS[(q.difficultyLevel || "easy").toLowerCase() as keyof typeof APTITUDE_MARKS] ?? 1;
    return {
      id,
      question: q.question,
      options: shuffleArray(opts),
      marks: m,
    };
  });
}

/** In-memory store: userId -> keys + server clock start (when DB AptitudeSession is unavailable). */
const answerKeyStore = new Map<
  string,
  {
    answerKey: Record<string, string>;
    marksKey: Record<string, number>;
    expiresAt: number;
    testStartedAtMs: number;
    questionSet: string | null;
  }
>();
const TTL_MS = 2 * 60 * 60 * 1000; // 2 hours

export function storeAnswerKey(
  userId: string,
  answerKey: Record<string, string>,
  marksKey: Record<string, number>,
  questionSet: string | null = null
): void {
  const now = Date.now();
  answerKeyStore.set(userId, { answerKey, marksKey, expiresAt: now + TTL_MS, testStartedAtMs: now, questionSet });
}

/** Same as storeAnswerKey — explicit alias when falling back from failed Prisma upsert. */
export function storeMemoryAptitudeSession(
  userId: string,
  answerKey: Record<string, string>,
  marksKey: Record<string, number>,
  questionSet?: string | null
): void {
  storeAnswerKey(userId, answerKey, marksKey, questionSet ?? null);
}

export function getAnswerKey(userId: string): Record<string, string> | null {
  const ent = answerKeyStore.get(userId);
  if (!ent || Date.now() > ent.expiresAt) {
    answerKeyStore.delete(userId);
    return null;
  }
  return ent.answerKey;
}

export function getMarksKey(userId: string): Record<string, number> | null {
  const ent = answerKeyStore.get(userId);
  if (!ent || Date.now() > ent.expiresAt) return null;
  return ent.marksKey;
}

/** Grading keys + timer start when session only exists in memory (DB error path). */
export function getMemoryAptitudeSubmitContext(userId: string): {
  answerKey: Record<string, string>;
  marksKey: Record<string, number>;
  testStartedAt: Date | null;
  questionSet: string | null;
} | null {
  const ent = answerKeyStore.get(userId);
  if (!ent || Date.now() > ent.expiresAt) {
    answerKeyStore.delete(userId);
    return null;
  }
  if (!ent.answerKey || Object.keys(ent.answerKey).length === 0) return null;
  return {
    answerKey: ent.answerKey,
    marksKey: ent.marksKey,
    testStartedAt: new Date(ent.testStartedAtMs),
    questionSet: ent.questionSet ?? null,
  };
}

export function clearAnswerKey(userId: string): void {
  answerKeyStore.delete(userId);
}
