/**
 * Loads aptitude questions from incruiter JSON and selects 20 based on experience level.
 * - experienceYears < 1: 10 easy, 5 medium, 5 hard
 * - experienceYears >= 1: 5 easy, 10 medium, 5 hard
 */

import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

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
}

export interface AptitudeSession {
  questions: AptitudeQuestionForClient[];
  answerKey: Record<string, string>;
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
 * Select 20 questions by experience and return both questions (for client) and answer key (for scoring).
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
    needEasy = 10;
    needMedium = 5;
    needHard = 5;
  } else {
    needEasy = 5;
    needMedium = 10;
    needHard = 5;
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
  const needed = 20 - selected.length;
  if (needed > 0) {
    const fallback = all.filter((q) => !used.has(q));
    selected = [...selected, ...pick(fallback, needed)];
  }
  selected = shuffleArray(selected);
  const answerKey: Record<string, string> = {};
  const questions: AptitudeQuestionForClient[] = selected.map((q) => {
    const id = getQuestionId(q);
    answerKey[id] = (q.answer || "").trim();
    const opts = [q.option_1, q.option_2, q.option_3, q.option_4].filter(Boolean);
    return {
      id,
      question: q.question,
      options: shuffleArray(opts),
    };
  });

  return { questions, answerKey };
}

/** In-memory store: userId -> { answerKey, expiresAt }. Cleared after submit or TTL. */
const answerKeyStore = new Map<string, { answerKey: Record<string, string>; expiresAt: number }>();
const TTL_MS = 2 * 60 * 60 * 1000; // 2 hours

export function storeAnswerKey(userId: string, answerKey: Record<string, string>): void {
  answerKeyStore.set(userId, { answerKey, expiresAt: Date.now() + TTL_MS });
}

export function getAnswerKey(userId: string): Record<string, string> | null {
  const ent = answerKeyStore.get(userId);
  if (!ent || Date.now() > ent.expiresAt) {
    answerKeyStore.delete(userId);
    return null;
  }
  return ent.answerKey;
}

export function clearAnswerKey(userId: string): void {
  answerKeyStore.delete(userId);
}
