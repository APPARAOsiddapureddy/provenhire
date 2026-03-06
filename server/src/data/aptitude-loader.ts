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
  cachedQuestions = JSON.parse(raw) as McqQuestionRaw[];
  return cachedQuestions;
}

function getQuestionId(q: McqQuestionRaw): string {
  return q._id?.$oid || `q-${q.question.slice(0, 30).replace(/\W/g, "")}-${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Select 20 questions with experience-based difficulty. Marks: easy=1, medium=2, hard=2.
 * - Fresher (< 1 year): 15 easy, 5 medium (25 marks, pass 15)
 * - 1–3 years: 10 easy, 5 medium, 5 hard (30 marks, pass 18)
 * - 5+ years: 5 easy, 5 medium, 10 hard (35 marks, pass 21)
 */
export function createAptitudeSession(experienceYears: number): AptitudeSession {
  const all = loadQuestions();
  const byDifficulty = {
    easy: all.filter((q) => (q.difficultyLevel || "").toLowerCase() === "easy"),
    medium: all.filter((q) => (q.difficultyLevel || "").toLowerCase() === "medium"),
    hard: all.filter((q) => (q.difficultyLevel || "").toLowerCase() === "hard"),
  };

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
  const easy = pick(byDifficulty.easy, needEasy, used);
  easy.forEach((q) => used.add(q));
  const medium = pick(byDifficulty.medium, needMedium, used);
  medium.forEach((q) => used.add(q));
  const hard = pick(byDifficulty.hard, needHard, used);
  hard.forEach((q) => used.add(q));

  let selected: McqQuestionRaw[] = [...easy, ...medium, ...hard];
  const targetTotal = needEasy + needMedium + needHard;
  const needed = targetTotal - selected.length;
  if (needed > 0) {
    const fallback = all.filter((q) => !used.has(q));
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
    const opts = [q.option_1, q.option_2, q.option_3, q.option_4].filter(Boolean);
    return {
      id,
      question: q.question,
      options: shuffleArray(opts),
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
