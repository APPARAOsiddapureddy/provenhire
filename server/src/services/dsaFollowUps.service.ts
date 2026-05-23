import type { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "../config/prisma.js";

type OptionMap = Record<string, string>;
type PrismaClientLike = PrismaClient | Prisma.TransactionClient;

export type PublicDsaFollowUpQuestion = {
  followUpQuestionId: string;
  questionText: string;
  options: OptionMap;
};

export type FollowUpAnswerInput =
  | Record<string, string>
  | Array<{
      followUpQuestionId: string;
      selectedOptionText?: string;
      selectedOptionKey?: string;
      selectedOption?: string;
    }>;

type DsaFollowUpRow = {
  followUpQuestionId: string;
  questionText: string;
  options: unknown;
  correctOptionText: string;
};

function normalizeText(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

function optionKey(index: number): string {
  return String.fromCharCode("A".charCodeAt(0) + index);
}

function toOptionMap(raw: unknown): OptionMap {
  if (Array.isArray(raw)) {
    return raw.reduce<OptionMap>((acc, option, index) => {
      if (typeof option === "string") acc[optionKey(index)] = option;
      return acc;
    }, {});
  }

  if (raw && typeof raw === "object") {
    const out: OptionMap = {};
    for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
      if (typeof value === "string") out[key] = value;
    }
    return out;
  }

  return {};
}

function selectedTextFromInput(row: DsaFollowUpRow, selected: string | undefined): string {
  if (!selected) return "";
  const options = toOptionMap(row.options);
  const direct = selected.trim();
  const byKey = options[direct.toUpperCase()];
  return byKey ?? direct;
}

function answerMapFromInput(input: FollowUpAnswerInput): Map<string, string> {
  const map = new Map<string, string>();
  if (Array.isArray(input)) {
    for (const item of input) {
      const selected = item.selectedOptionText ?? item.selectedOption ?? item.selectedOptionKey ?? "";
      map.set(item.followUpQuestionId, selected);
    }
    return map;
  }

  for (const [followUpQuestionId, selected] of Object.entries(input)) {
    map.set(followUpQuestionId, selected);
  }
  return map;
}

export async function getPublicDsaFollowUps(questionId: string): Promise<PublicDsaFollowUpQuestion[]> {
  const rows = await prisma.dsaFollowUpQuestion.findMany({
    where: { questionId },
    orderBy: { followUpQuestionId: "asc" },
    select: {
      followUpQuestionId: true,
      questionText: true,
      options: true,
    },
  });

  return rows.map((row) => ({
    followUpQuestionId: row.followUpQuestionId,
    questionText: row.questionText,
    options: toOptionMap(row.options),
  }));
}

export async function gradeAndPersistDsaFollowUps(params: {
  userId: string;
  questionId: string;
  answers: FollowUpAnswerInput;
  roundSessionId?: string | null;
  allowIncomplete?: boolean;
  db?: PrismaClientLike;
}): Promise<{
  correctCount: number;
  totalCount: number;
  followUpScore: number;
  followUpPercentage: number;
  results: Array<{ followUpQuestionId: string; selectedOptionText: string; correct: boolean }>;
}> {
  const db = params.db ?? prisma;
  const rows = await db.dsaFollowUpQuestion.findMany({
    where: { questionId: params.questionId },
    orderBy: { followUpQuestionId: "asc" },
    select: {
      followUpQuestionId: true,
      questionText: true,
      options: true,
      correctOptionText: true,
    },
  });

  if (rows.length === 0) {
    throw new Error("No follow-up questions configured for this DSA question.");
  }

  const latestOfficial = await db.dsaSubmission.findFirst({
    where: {
      userId: params.userId,
      questionId: params.questionId,
      isOfficial: true,
      ...(params.roundSessionId ? { roundSessionId: params.roundSessionId } : {}),
    },
    orderBy: { submittedAt: "desc" },
    select: { id: true },
  });

  if (!latestOfficial) {
    const err = new Error("Submit the coding solution before answering follow-up questions.");
    err.name = "FOLLOW_UP_CODE_SUBMISSION_REQUIRED";
    throw err;
  }

  const answers = answerMapFromInput(params.answers);
  const missingAnswers = rows.filter((row) => !selectedTextFromInput(row, answers.get(row.followUpQuestionId)).trim());
  if (missingAnswers.length > 0 && !params.allowIncomplete) {
    const err = new Error("Answer every follow-up question before submitting.");
    err.name = "FOLLOW_UP_INCOMPLETE";
    throw err;
  }

  const results = rows.map((row) => {
    const selectedOptionText = selectedTextFromInput(row, answers.get(row.followUpQuestionId));
    const correct = normalizeText(selectedOptionText) === normalizeText(row.correctOptionText);
    return {
      followUpQuestionId: row.followUpQuestionId,
      selectedOptionText,
      correct,
    };
  });

  const correctCount = results.filter((r) => r.correct).length;
  const totalCount = rows.length;
  const followUpPercentage = totalCount > 0 ? Math.round((correctCount / totalCount) * 100) : 0;
  const followUpScore = totalCount > 0 ? Math.round((correctCount / totalCount) * 30) : 0;

  await db.dsaSubmission.update({
    where: { id: latestOfficial.id },
    data: {
      followUpScore,
      followUpResults: {
        correctCount,
        totalCount,
        followUpPercentage,
        results,
      },
    },
  });

  return {
    correctCount,
    totalCount,
    followUpScore,
    followUpPercentage,
    results,
  };
}

export async function gradeDsaFollowUps(params: {
  questionId: string;
  answers: FollowUpAnswerInput | null | undefined;
  allowIncomplete?: boolean;
}): Promise<{
  correctCount: number;
  totalCount: number;
  followUpScore: number;
  followUpPercentage: number;
  results: Array<{ followUpQuestionId: string; selectedOptionText: string; correct: boolean }>;
}> {
  const rows = await prisma.dsaFollowUpQuestion.findMany({
    where: { questionId: params.questionId },
    orderBy: { followUpQuestionId: "asc" },
    select: {
      followUpQuestionId: true,
      questionText: true,
      options: true,
      correctOptionText: true,
    },
  });

  if (rows.length === 0) {
    return { correctCount: 0, totalCount: 0, followUpScore: 0, followUpPercentage: 0, results: [] };
  }

  const answers = params.answers ? answerMapFromInput(params.answers) : new Map<string, string>();
  const missingAnswers = rows.filter((row) => !selectedTextFromInput(row, answers.get(row.followUpQuestionId)).trim());
  if (missingAnswers.length > 0 && !params.allowIncomplete) {
    const err = new Error("Answer every follow-up question before submitting.");
    err.name = "FOLLOW_UP_INCOMPLETE";
    throw err;
  }

  const results = rows.map((row) => {
    const selectedOptionText = selectedTextFromInput(row, answers.get(row.followUpQuestionId));
    const correct = selectedOptionText.trim().length > 0 && normalizeText(selectedOptionText) === normalizeText(row.correctOptionText);
    return {
      followUpQuestionId: row.followUpQuestionId,
      selectedOptionText,
      correct,
    };
  });

  const correctCount = results.filter((r) => r.correct).length;
  const totalCount = rows.length;
  const followUpPercentage = totalCount > 0 ? Math.round((correctCount / totalCount) * 100) : 0;
  const followUpScore = totalCount > 0 ? Math.round((correctCount / totalCount) * 30) : 0;

  return {
    correctCount,
    totalCount,
    followUpScore,
    followUpPercentage,
    results,
  };
}
