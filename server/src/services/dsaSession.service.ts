import type { DsaRoundSession, Prisma } from "@prisma/client";
import { prisma } from "../config/prisma.js";
import { DSA_API_LANGUAGES } from "../constants/dsa.js";
import { roleTypeToTrack } from "../constants/verificationPipeline.js";
import { dsaTierConfig, experienceTierFromYears } from "../utils/experienceTier.js";
import { getPublicDsaFollowUps } from "./dsaFollowUps.service.js";
import { getFollowUpAnswers, getLatestCodeDraftsForQuestion } from "./dsaDraftBuffer.service.js";
import { enqueueDsaAutoFinalize } from "./dsaSessionQueue.service.js";

export const DSA_FOLLOW_UP_MINUTES = 2;

type PrismaClientLike = typeof prisma | Prisma.TransactionClient;

type DSARoleCategory = "developer" | "infrastructure" | "data" | "analytics" | "unknown";

const ROLE_CATEGORIES: Record<DSARoleCategory, string[]> = {
  developer: ["frontend", "backend", "full stack", "fullstack", "software engineer", "sde", "system engineer", "platform engineer", "mobile", "qa"],
  infrastructure: ["devops", "docker", "cloud engineer", "sre", "site reliability", "platform engineer"],
  data: ["data scientist", "data engineer", "ml engineer", "machine learning", "ai engineer", "data "],
  analytics: ["data analyst", "business analyst", "product analyst", "marketing analyst"],
  unknown: [],
};

const ROLE_DISTRIBUTION: Record<DSARoleCategory, { easy: number; medium: number; hard: number } | null> = {
  developer: { easy: 20, medium: 50, hard: 30 },
  infrastructure: { easy: 50, medium: 40, hard: 10 },
  data: { easy: 80, medium: 20, hard: 0 },
  analytics: null,
  unknown: { easy: 40, medium: 40, hard: 20 },
};

const EXPERIENCE_DISTRIBUTION: Record<string, { easy: number; medium: number; hard: number }> = {
  "0-1": { easy: 70, medium: 30, hard: 0 },
  "1-3": { easy: 40, medium: 50, hard: 10 },
  "3-5": { easy: 20, medium: 50, hard: 30 },
  "5+": { easy: 10, medium: 40, hard: 50 },
};

export type DsaSessionQuestion = {
  id: string;
  title: string;
  description: string;
  difficulty: string;
  examples: unknown;
  constraints: string[];
  starterCode: unknown;
};

export type DsaSessionSnapshot = {
  session: {
    id: string;
    startTime: string;
    expTime: string;
    pausedTime: string | null;
    activeQId: string | null;
    activeFollowUpId: string | null;
    secondsRemaining: number;
    expired: boolean;
  };
  questions: DsaSessionQuestion[];
  codeDrafts: Record<string, Partial<Record<string, string>>>;
  officialSubmissions: Record<string, { code: string; language: string; codeScore: number; finalScore: number | null }>;
  activeFollowUp: {
    id: string;
    questionId: string;
    expTime: string;
    secondsRemaining: number;
    answers: Record<string, string>;
    followUps: Awaited<ReturnType<typeof getPublicDsaFollowUps>>;
  } | null;
  timeLimitMinutes: number;
  passThresholdPercent: number;
  dsaQuestionCount: number;
  experienceTier: string;
  dsaWaiver: boolean;
};

function getRoleCategory(jobTitle: string | null | undefined): DSARoleCategory {
  if (!jobTitle?.trim()) return "unknown";
  const t = jobTitle.toLowerCase();
  for (const [cat, keywords] of Object.entries(ROLE_CATEGORIES)) {
    if (cat === "unknown") continue;
    if (keywords.some((k) => t.includes(k))) return cat as DSARoleCategory;
  }
  return "unknown";
}

function getExperienceBucket(years: number): keyof typeof EXPERIENCE_DISTRIBUTION {
  if (years < 1) return "0-1";
  if (years <= 3) return "1-3";
  if (years <= 5) return "3-5";
  return "5+";
}

export function getCombinedDsaDistribution(jobTitle: string | null | undefined, experienceYears: number): {
  easy: number;
  medium: number;
  hard: number;
} | null {
  const category = getRoleCategory(jobTitle);
  if (category === "analytics") return null;
  const roleDist = ROLE_DISTRIBUTION[category] ?? ROLE_DISTRIBUTION.unknown;
  if (!roleDist) return null;
  const expDist = EXPERIENCE_DISTRIBUTION[getExperienceBucket(experienceYears)];
  if (!expDist) return roleDist;
  const blend = (a: number, b: number) => Math.round(a * 0.6 + b * 0.4);
  return { easy: blend(roleDist.easy, expDist.easy), medium: blend(roleDist.medium, expDist.medium), hard: blend(roleDist.hard, expDist.hard) };
}

function shuffle<T>(items: T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

function pickOfficialSet<T extends { id: string; difficulty: string }>(
  pool: T[],
  tier: ReturnType<typeof experienceTierFromYears>,
): T[] {
  const cfg = dsaTierConfig(tier);
  const slots = cfg.difficultySlots;
  if (slots?.length) {
    const used = new Set<string>();
    const out: T[] = [];
    for (const d of slots) {
      const pick = shuffle(pool.filter((q) => q.difficulty === d && !used.has(q.id)))[0];
      if (pick) {
        out.push(pick);
        used.add(pick.id);
      }
    }
    if (out.length >= cfg.questionCount) return out.slice(0, cfg.questionCount);
    const allowed = new Set(cfg.difficulties);
    for (const q of shuffle(pool.filter((q) => allowed.has(q.difficulty as "Easy" | "Medium" | "Hard") && !used.has(q.id)))) {
      out.push(q);
      used.add(q.id);
      if (out.length >= cfg.questionCount) break;
    }
    return out.slice(0, cfg.questionCount);
  }
  const allowed = new Set(cfg.difficulties);
  let candidates = pool.filter((q) => allowed.has(q.difficulty as "Easy" | "Medium" | "Hard"));
  if (candidates.length < cfg.questionCount) candidates = [...pool];
  return shuffle(candidates).slice(0, cfg.questionCount);
}

function secondsRemaining(session: Pick<DsaRoundSession, "expTime" | "pausedTime">): number {
  const now = Date.now();
  const reference = session.pausedTime ? session.pausedTime.getTime() : now;
  return Math.max(0, Math.ceil((session.expTime.getTime() - reference) / 1000));
}

async function latestUnfinalizedSession(userId: string, db: PrismaClientLike = prisma): Promise<DsaRoundSession | null> {
  const row = await db.dsaRoundSession.findFirst({
    where: { userId },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
  });
  if (!row) return null;
  const result = await db.dsaRoundResult.findFirst({
    where: { roundSessionId: row.id },
    select: { id: true },
  });
  return result ? null : row;
}

async function firstPublicSampleByQuestionId(questionIds: string[]): Promise<Map<string, { input: string; expected: string }>> {
  const map = new Map<string, { input: string; expected: string }>();
  if (questionIds.length === 0) return map;
  const rows = await prisma.dsaTestCase.findMany({
    where: { questionId: { in: questionIds } },
    orderBy: { id: "asc" },
    select: { questionId: true, input: true, expected: true, isHidden: true },
  });
  for (const row of rows) {
    if (!row.isHidden && !map.has(row.questionId)) map.set(row.questionId, { input: row.input, expected: row.expected });
  }
  for (const row of rows) {
    if (!map.has(row.questionId)) map.set(row.questionId, { input: row.input, expected: row.expected });
  }
  return map;
}

function examplesLookPlaceholder(examples: unknown): boolean {
  if (!Array.isArray(examples) || examples.length === 0) return true;
  const first = examples[0] as { input?: unknown; output?: unknown };
  return String(first?.input ?? "").toLowerCase().includes("refer to the problem description")
    || String(first?.output ?? "").toLowerCase().includes("refer to the problem description");
}

function mergeExamplesWithSample(examples: unknown, sample: { input: string; expected: string } | undefined): unknown {
  if (!sample || !examplesLookPlaceholder(examples)) return examples;
  return [{ input: sample.input, output: sample.expected }];
}

async function questionsForSession(questionIds: string[]): Promise<DsaSessionQuestion[]> {
  const rows = await prisma.dsaQuestion.findMany({
    where: { id: { in: questionIds } },
    select: {
      id: true,
      title: true,
      description: true,
      difficulty: true,
      examples: true,
      constraints: true,
      starterCode: true,
    },
  });
  const byId = new Map(rows.map((row) => [row.id, row]));
  const samples = await firstPublicSampleByQuestionId(questionIds);
  return questionIds
    .map((id) => byId.get(id))
    .filter((row): row is (typeof rows)[number] => Boolean(row))
    .map((row) => ({
      id: row.id,
      title: row.title,
      description: row.description,
      difficulty: row.difficulty,
      examples: mergeExamplesWithSample(row.examples, samples.get(row.id)),
      constraints: row.constraints,
      starterCode: row.starterCode,
    }));
}

async function codeDraftsForSession(session: DsaRoundSession): Promise<Record<string, Partial<Record<string, string>>>> {
  const out: Record<string, Partial<Record<string, string>>> = {};
  for (const questionId of session.questionIds) {
    out[questionId] = {};
    const drafts = await getLatestCodeDraftsForQuestion(session.id, questionId, DSA_API_LANGUAGES);
    for (const draft of drafts) {
      out[questionId]![draft.language] = draft.code;
    }
  }
  return out;
}

async function officialSubmissionsForSession(session: DsaRoundSession): Promise<DsaSessionSnapshot["officialSubmissions"]> {
  const rows = await prisma.dsaSubmission.findMany({
    where: { roundSessionId: session.id, isOfficial: true },
    orderBy: { submittedAt: "desc" },
    select: { questionId: true, code: true, language: true, passedCount: true, totalCount: true, followUpScore: true },
  });
  const out: DsaSessionSnapshot["officialSubmissions"] = {};
  for (const row of rows) {
    if (out[row.questionId]) continue;
    const codeScore = row.totalCount > 0 ? Math.round((row.passedCount / row.totalCount) * 70) : 0;
    out[row.questionId] = {
      code: row.code,
      language: row.language,
      codeScore,
      finalScore: row.followUpScore == null ? null : Math.min(100, Math.max(0, codeScore + Math.min(30, Math.max(0, row.followUpScore)))),
    };
  }
  return out;
}

export async function getDsaSessionSnapshot(session: DsaRoundSession): Promise<DsaSessionSnapshot> {
  const profile = await prisma.jobSeekerProfile.findUnique({
    where: { userId: session.userId },
    select: { targetJobTitle: true, experienceYears: true },
  });
  const tier = experienceTierFromYears(profile?.experienceYears);
  const cfg = dsaTierConfig(tier);
  const activeFollowUp = session.activeFollowUpId
    ? await prisma.dsaFollowUpSession.findUnique({ where: { id: session.activeFollowUpId } })
    : null;

  return {
    session: {
      id: session.id,
      startTime: session.startTime.toISOString(),
      expTime: session.expTime.toISOString(),
      pausedTime: session.pausedTime?.toISOString() ?? null,
      activeQId: session.activeQId,
      activeFollowUpId: session.activeFollowUpId,
      secondsRemaining: secondsRemaining(session),
      expired: !session.pausedTime && session.expTime.getTime() <= Date.now(),
    },
    questions: await questionsForSession(session.questionIds),
    codeDrafts: await codeDraftsForSession(session),
    officialSubmissions: await officialSubmissionsForSession(session),
    activeFollowUp: activeFollowUp
      ? {
          id: activeFollowUp.id,
          questionId: activeFollowUp.questionId,
          expTime: activeFollowUp.expTime.toISOString(),
          secondsRemaining: Math.max(0, Math.ceil((activeFollowUp.expTime.getTime() - Date.now()) / 1000)),
          answers: (await getFollowUpAnswers(session.id, activeFollowUp.questionId)) ?? {},
          followUps: await getPublicDsaFollowUps(activeFollowUp.questionId),
        }
      : null,
    timeLimitMinutes: cfg.timeLimitMinutes,
    passThresholdPercent: cfg.passThresholdPercent,
    dsaQuestionCount: cfg.questionCount,
    experienceTier: tier,
    dsaWaiver: getCombinedDsaDistribution(profile?.targetJobTitle ?? null, profile?.experienceYears ?? 0) === null,
  };
}

export async function createOrGetDsaSession(userId: string): Promise<DsaSessionSnapshot> {
  const session = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`dsa_session:${userId}`}))`;

    const existing = await latestUnfinalizedSession(userId, tx);
    if (existing) return existing;

    const profile = await tx.jobSeekerProfile.findUnique({
      where: { userId },
      select: { targetJobTitle: true, experienceYears: true, roleType: true },
    });
    if (roleTypeToTrack(profile?.roleType) === "non_technical") {
      throw new Error("DSA/Data round applies only to technical or data verification paths.");
    }

    const tier = experienceTierFromYears(profile?.experienceYears);
    const cfg = dsaTierConfig(tier);
    const dist = getCombinedDsaDistribution(profile?.targetJobTitle ?? null, profile?.experienceYears ?? 0);
    const pool = await tx.dsaQuestion.findMany({ select: { id: true, difficulty: true } });
    const selected = dist === null ? [] : pickOfficialSet(pool, tier);
    const startTime = new Date();
    const expTime = new Date(startTime.getTime() + cfg.timeLimitMinutes * 60 * 1000);
    return tx.dsaRoundSession.create({
      data: {
        userId,
        questionIds: selected.map((q) => q.id),
        startTime,
        expTime,
        activeQId: selected[0]?.id ?? null,
      },
    });
  });

  await enqueueDsaAutoFinalize(session.id, session.expTime);
  return getDsaSessionSnapshot(session);
}

export async function getCurrentDsaSession(userId: string): Promise<DsaSessionSnapshot | null> {
  const existing = await latestUnfinalizedSession(userId);
  return existing ? getDsaSessionSnapshot(existing) : null;
}

export async function requireActiveDsaSession(userId: string): Promise<DsaRoundSession> {
  const session = await latestUnfinalizedSession(userId);
  if (!session) throw new Error("No active DSA session.");
  return session;
}

export function assertQuestionInSession(session: DsaRoundSession, questionId: string): void {
  if (!session.questionIds.includes(questionId)) {
    const err = new Error("Question does not belong to the active DSA session.");
    err.name = "DSA_SESSION_QUESTION_MISMATCH";
    throw err;
  }
}
