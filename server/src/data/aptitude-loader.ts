/**
 * Loads aptitude questions from incruiter JSON and selects questions to total 100 marks.
 * Marks: easy=1, medium=2, hard=2. Pass threshold: 60/100.
 * - experienceYears < 1: more easy (26 easy, 25 medium, 12 hard)
 * - experienceYears >= 1: more medium (20 easy, 30 medium, 10 hard)
 */

import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

export const APTITUDE_MARKS = { easy: 1, medium: 2, hard: 2 } as const;
export const APTITUDE_TOTAL_MARKS = 100;
export const APTITUDE_PASS_THRESHOLD = 60;

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
 * Select questions to total 100 marks. easy=1, medium=2, hard=2.
 * - experienceYears < 1: 26 easy, 25 medium, 12 hard (= 100)
 * - experienceYears >= 1: 20 easy, 30 medium, 10 hard (= 100)
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
    needEasy = 26;
    needMedium = 25;
    needHard = 12;
  } else {
    needEasy = 20;
    needMedium = 30;
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

  return { questions, answerKey, marksKey };
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
