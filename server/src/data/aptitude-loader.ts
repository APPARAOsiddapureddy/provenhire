/**
 * Loads aptitude questions and selects 20 questions with experience-based difficulty.
 * Marks: easy=1, medium=2, hard=2. Pass: 60% of total.
 * - Fresher (< 1 year): 15 easy, 5 medium (25 marks, pass 15)
 * - 1–3 years: 10 easy, 5 medium, 5 hard (30 marks, pass 18)
 * - 5+ years: 5 easy, 5 medium, 10 hard (35 marks, pass 21)
 */

import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

export const APTITUDE_MARKS = { easy: 1, medium: 2, hard: 2 } as const;
export const APTITUDE_QUESTION_COUNT = 20;

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

function loadQuestions(): McqQuestionRaw[] {
  if (cachedQuestions) return cachedQuestions;
  const p = join(__dirname, "aptitude-questions.json");
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

/**
 * Select 20 questions with experience-based difficulty. Marks: easy=1, medium=2, hard=2.
 * - Fresher (< 1 year): 15 easy, 5 medium (25 marks, pass 15)
 * - 1–3 years: 10 easy, 5 medium, 5 hard (30 marks, pass 18)
 * - 5+ years: 5 easy, 5 medium, 10 hard (35 marks, pass 21)
 */
export function createAptitudeSession(experienceYears: number): AptitudeSession {
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

  let needEasy: number;
  let needMedium: number;
  let needHard: number;

  if (experienceYears < 1) {
    needEasy = 15;
    needMedium = 5;
    needHard = 0;
  } else if (experienceYears <= 3) {
    needEasy = 10;
    needMedium = 5;
    needHard = 5;
  } else {
    needEasy = 5;
    needMedium = 5;
    needHard = 10;
  }

  const pick = (pool: McqQuestionRaw[], n: number, exclude = new Set<McqQuestionRaw>()): McqQuestionRaw[] => {
    const available = pool.filter((q) => !exclude.has(q));
    const shuffled = shuffleArray(available);
    return shuffled.slice(0, Math.min(n, shuffled.length));
  };

  const used = new Set<McqQuestionRaw>();
  // Enforce fixed distribution: total 20 questions, exactly 2 verbal, remaining quant/logical.
  // Prefer easier verbal for freshers; scale slightly with experience.
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
  const verbalEasy = pick(verbalByDiff.easy, needVerbalEasy, used);
  verbalEasy.forEach((q) => used.add(q));
  const verbalMedium = pick(verbalByDiff.medium, needVerbalMedium, used);
  verbalMedium.forEach((q) => used.add(q));
  const verbalHard = pick(verbalByDiff.hard, needVerbalHard, used);
  verbalHard.forEach((q) => used.add(q));
  const selectedVerbal: McqQuestionRaw[] = [...verbalEasy, ...verbalMedium, ...verbalHard];
  const verbalNeeded = 2 - selectedVerbal.length;
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
  const targetTotal = APTITUDE_QUESTION_COUNT;
  const needed = targetTotal - selected.length;
  if (needed > 0) {
    const fallback = quantLogicalPool.filter((q) => !used.has(q));
    selected = [...selected, ...pick(fallback, needed)];
  }
  selected = shuffleArray(selected);
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

  const totalMarks = questions.reduce((sum, q) => sum + (marksKey[q.id] ?? 1), 0);
  const passThreshold = Math.ceil(totalMarks * 0.6); // 60% to pass
  return { questions, answerKey, marksKey, totalMarks, passThreshold };
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

/** In-memory store: userId -> { answerKey, marksKey, expiresAt }. Cleared after submit or TTL. */
const answerKeyStore = new Map<string, { answerKey: Record<string, string>; marksKey: Record<string, number>; expiresAt: number }>();
const TTL_MS = 2 * 60 * 60 * 1000; // 2 hours

export function storeAnswerKey(userId: string, answerKey: Record<string, string>, marksKey: Record<string, number>): void {
  answerKeyStore.set(userId, { answerKey, marksKey, expiresAt: Date.now() + TTL_MS });
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

export function clearAnswerKey(userId: string): void {
  answerKeyStore.delete(userId);
}
