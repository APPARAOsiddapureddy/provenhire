import { Prisma } from "@prisma/client";
import { prisma } from "../config/prisma.js";
import { discardActiveWorkspaceRegistrationMcqAttempts } from "./mcqAutoFinalize.service.js";
import { discardActiveWorkspaceRegistrationDsaAttempts } from "./workspaceDsaFinalize.service.js";
import { discardActiveWorkspaceRegistrationSqlAttempts } from "./workspaceSqlFinalize.service.js";
import { WorkspaceServiceError, syncWorkspaceLifecycle } from "./workspace.service.js";
import {
  sendWorkspaceInvitationEmail,
  sendWorkspaceRemovalEmail,
} from "./resend.js";

export type WorkspaceActor = {
  id: string;
  role: string;
};

export type AllowedEmailImportSummary = {
  workspaceId: string;
  workspaceCode: string;
  parsed: number;
  valid: number;
  invalid: number;
  duplicatesInFile: number;
  inserted: number;
  alreadyPresent: number;
  invalidSamples: string[];
};

function scorePercent(value: unknown, scale: "percent" | "ten"): number | null {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) return null;
  return Math.max(0, Math.min(100, scale === "ten" ? parsed * 10 : parsed));
}

export function buildCandidateAssessmentSynthesis(input: {
  aptitude: { score?: number | null } | null;
  dsa: { score?: number | null } | null;
  antigravity: { overallScore?: number | null; hireRecommendation?: string | null; report?: unknown } | null;
}) {
  const aptitude = scorePercent(input.aptitude?.score, "percent");
  const dsa = scorePercent(input.dsa?.score, "percent");
  const antigravity = scorePercent(input.antigravity?.overallScore, "ten");
  const measured = [aptitude, dsa, antigravity].filter((value): value is number => value !== null);
  const compositeScore = measured.length ? Math.round((measured.reduce((sum, value) => sum + value, 0) / measured.length) * 10) / 10 : null;
  const spread = measured.length > 1 ? Math.max(...measured) - Math.min(...measured) : 0;
  const report = input.antigravity?.report && typeof input.antigravity.report === "object" ? input.antigravity.report as Record<string, unknown> : {};
  const strengths = Array.isArray(report.strengths) ? report.strengths.map(String) : [];
  const risks = Array.isArray(report.risk_flags) ? report.risk_flags.map(String) : [];

  const crossModuleSignals: string[] = [];
  const contradictions: string[] = [];
  if (aptitude !== null && aptitude >= 80) crossModuleSignals.push("Strong aptitude evidence supports fast comprehension and structured problem solving.");
  if (dsa !== null && dsa >= 80) crossModuleSignals.push("DSA performance verifies implementation fluency under objective test constraints.");
  if (antigravity !== null && antigravity >= 80) crossModuleSignals.push("Antigravity evidence supports role-level reasoning, communication, and ownership under pressure.");
  if (measured.length === 3 && spread <= 12) crossModuleSignals.push("All three modules agree closely; the candidate signal is consistent rather than driven by one assessment.");
  if (aptitude !== null && dsa !== null && Math.abs(aptitude - dsa) >= 15) {
    contradictions.push(aptitude > dsa
      ? "Conceptual aptitude materially exceeds coding execution; validate implementation speed and debugging discipline."
      : "Coding execution materially exceeds aptitude performance; validate breadth, comprehension speed, and unfamiliar problem framing.");
  }
  if (dsa !== null && antigravity !== null && Math.abs(dsa - antigravity) >= 15) {
    contradictions.push(dsa > antigravity
      ? "Objective coding is stronger than interview reasoning; verify communication, production judgment, and ownership boundaries."
      : "Interview reasoning is stronger than objective coding; verify independent implementation through a scoped work sample.");
  }
  if (!contradictions.length) contradictions.push("No material cross-module contradiction was detected at the current evidence threshold.");

  const recommendation = compositeScore === null
    ? "INSUFFICIENT EVIDENCE"
    : compositeScore >= 85 && spread <= 18
      ? "ADVANCE"
      : compositeScore >= 70
        ? "ADVANCE WITH TARGETED FOLLOW-UP"
        : "HOLD FOR ADDITIONAL EVIDENCE";
  const completedModules = measured.length;
  const confidence = Math.round(Math.min(0.96, 0.42 + completedModules * 0.16 + (spread <= 12 && completedModules > 1 ? 0.06 : 0)) * 100) / 100;
  const moduleSummary = [
    aptitude === null ? "Aptitude not completed" : `Aptitude ${aptitude.toFixed(0)}`,
    dsa === null ? "DSA not completed" : `DSA ${dsa.toFixed(0)}`,
    antigravity === null ? "Antigravity not completed" : `Antigravity ${antigravity.toFixed(0)}`,
  ].join(", ");

  return {
    schemaVersion: "candidate_assessment_synthesis_v1",
    recommendation,
    compositeScore,
    confidence,
    completedModules,
    overallRead: compositeScore === null
      ? "There is not enough completed assessment evidence to make a cross-module candidate judgment."
      : `${recommendation}. The evidence-weighted composite is ${compositeScore.toFixed(1)}/100 across ${completedModules} completed modules (${moduleSummary}). ${spread <= 12 && completedModules > 1 ? "The modules reinforce one another." : "The module spread requires targeted interpretation rather than a score-only decision."}`,
    crossModuleSignals: crossModuleSignals.length ? crossModuleSignals : ["The current evidence is too sparse to claim a cross-module strength."],
    contradictions,
    verifiedStrengths: strengths.slice(0, 6),
    scopedRisks: risks.slice(0, 6),
    nextActions: [
      ...contradictions.filter((item) => !item.startsWith("No material")).slice(0, 2),
      ...(risks.length ? [`Probe the highest Antigravity risk directly: ${risks[0]}`] : []),
      ...(completedModules < 3 ? ["Complete every missing module before treating the composite as a final hiring decision."] : []),
    ].slice(0, 4),
    evidenceBasis: {
      aptitudeScore: aptitude,
      dsaScore: dsa,
      antigravityScore: antigravity,
      antigravityVerdict: input.antigravity?.hireRecommendation ?? null,
      scoreSpread: Math.round(spread * 10) / 10,
    },
  };
}

type LeaderboardCursor = {
  totalScore: number;
  completedRounds: number;
  lastCompletedAt: string | null;
  userId: string;
};

type WorkspaceLeaderboardRow = {
  rank: number | bigint;
  userId: string;
  name: string | null;
  email: string;
  totalScore: number | bigint;
  completedRounds: number | bigint;
  lastCompletedAt: Date | null;
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizeWorkspaceCode(code: string): string {
  return code.trim().toUpperCase();
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function isValidEmail(email: string): boolean {
  return EMAIL_RE.test(email);
}

function encodeLeaderboardCursor(row: {
  totalScore: number;
  completedRounds: number;
  lastCompletedAt: string | null;
  userId: string;
}): string {
  return Buffer.from(JSON.stringify(row), "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function decodeLeaderboardCursor(cursor?: string | null): LeaderboardCursor | null {
  if (!cursor) return null;
  try {
    const normalized = cursor.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), "=");
    const parsed = JSON.parse(Buffer.from(padded, "base64").toString("utf8")) as Partial<LeaderboardCursor>;
    const validDate =
      parsed.lastCompletedAt === null ||
      (typeof parsed.lastCompletedAt === "string" && !Number.isNaN(new Date(parsed.lastCompletedAt).getTime()));
    if (
      typeof parsed.totalScore !== "number" ||
      !Number.isFinite(parsed.totalScore) ||
      typeof parsed.completedRounds !== "number" ||
      !Number.isFinite(parsed.completedRounds) ||
      !validDate ||
      typeof parsed.userId !== "string" ||
      parsed.userId.trim().length === 0
    ) {
      throw new Error("Invalid cursor shape");
    }
    return {
      totalScore: parsed.totalScore,
      completedRounds: parsed.completedRounds,
      lastCompletedAt: parsed.lastCompletedAt ?? null,
      userId: parsed.userId,
    };
  } catch {
    throw new WorkspaceServiceError("Invalid leaderboard cursor.", 400);
  }
}

function leaderboardCursorWhere(cursor: LeaderboardCursor | null) {
  if (!cursor) return Prisma.empty;

  const lastCompletedAtAfter =
    cursor.lastCompletedAt === null
      ? Prisma.sql`"lastCompletedAt" IS NULL AND "userId" > ${cursor.userId}`
      : Prisma.sql`(
          "lastCompletedAt" > ${new Date(cursor.lastCompletedAt)}
          OR "lastCompletedAt" IS NULL
          OR ("lastCompletedAt" = ${new Date(cursor.lastCompletedAt)} AND "userId" > ${cursor.userId})
        )`;

  return Prisma.sql`
    WHERE (
      "totalScore" < ${cursor.totalScore}
      OR ("totalScore" = ${cursor.totalScore} AND "completedRounds" < ${cursor.completedRounds})
      OR (
        "totalScore" = ${cursor.totalScore}
        AND "completedRounds" = ${cursor.completedRounds}
        AND ${lastCompletedAtAfter}
      )
    )
  `;
}

function publicWorkspaceSelect() {
  return {
    id: true,
    name: true,
    organization: true,
    code: true,
    startAt: true,
    endAt: true,
    status: true,
    accessMode: true,
    totalRounds: true,
    rounds: {
      orderBy: { order: "asc" as const },
      select: {
        id: true,
        order: true,
        name: true,
        type: true,
        questionCount: true,
        timeLimitMins: true,
        scoreWeightage: true,
        questionType: true,
        easyCount: true,
        mediumCount: true,
        hardCount: true,
      },
    },
  };
}

async function assertCanManageWorkspace(actor: WorkspaceActor, workspaceId: string) {
  const workspace = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: { id: true, ownerUserId: true },
  });
  if (!workspace) throw new WorkspaceServiceError("Workspace not found.", 404);
  if (actor.role !== "admin" && workspace.ownerUserId !== actor.id) {
    throw new WorkspaceServiceError("Not authorized to manage this workspace.", 403);
  }
  return workspace;
}

async function assertCanManageWorkspaceByCode(actor: WorkspaceActor, workspaceCode: string) {
  const code = normalizeWorkspaceCode(workspaceCode);
  const workspace = await prisma.workspace.findUnique({
    where: { code },
    select: { id: true, code: true, ownerUserId: true },
  });
  if (!workspace) throw new WorkspaceServiceError("Workspace not found.", 404);
  if (actor.role !== "admin" && workspace.ownerUserId !== actor.id) {
    throw new WorkspaceServiceError("Not authorized to manage this workspace.", 403);
  }
  return workspace;
}

function parseCsvRows(csv: string): string[][] {
  const rows: string[][] = [];
  const normalized = csv.replace(/^\uFEFF/, "");
  for (const rawLine of normalized.split(/\r?\n/)) {
    if (!rawLine.trim()) continue;
    const row: string[] = [];
    let current = "";
    let inQuotes = false;
    for (let i = 0; i < rawLine.length; i += 1) {
      const ch = rawLine[i];
      const next = rawLine[i + 1];
      if (ch === '"' && inQuotes && next === '"') {
        current += '"';
        i += 1;
      } else if (ch === '"') {
        inQuotes = !inQuotes;
      } else if (ch === "," && !inQuotes) {
        row.push(current.trim());
        current = "";
      } else {
        current += ch;
      }
    }
    row.push(current.trim());
    if (row.some((cell) => cell.length > 0)) rows.push(row);
  }
  return rows;
}

function extractEmailsFromCsv(buffer: Buffer) {
  const rows = parseCsvRows(buffer.toString("utf8"));
  if (rows.length === 0) return [] as string[];
  const header = rows[0]?.map((cell) => cell.trim().toLowerCase()) ?? [];
  const emailColumn = header.findIndex((cell) => cell === "email" || cell === "e-mail");
  const dataRows = emailColumn >= 0 ? rows.slice(1) : rows;
  return dataRows
    .map((row) => row[emailColumn >= 0 ? emailColumn : 0] ?? "")
    .map((email) => email.trim())
    .filter((email) => email.length > 0);
}

export async function getPublishedWorkspaceByCode(codeInput: string) {
  const code = normalizeWorkspaceCode(codeInput);
  const row = await prisma.workspace.findUnique({ where: { code }, select: { id: true } });
  if (row) await syncWorkspaceLifecycle(row.id);
  const workspace = await prisma.workspace.findUnique({
    where: { code },
    select: publicWorkspaceSelect(),
  });
  if (!workspace || !["published", "started", "ended"].includes(workspace.status)) {
    throw new WorkspaceServiceError("Workspace not found.", 404);
  }
  return workspace;
}

function registrationWithAttemptsSelect() {
  return {
    id: true,
    workspaceId: true,
    userId: true,
    status: true,
    registeredAt: true,
    removedAt: true,
    restoredAt: true,
    roundAttempts: {
      orderBy: { createdAt: "asc" as const },
      select: {
        id: true,
        workspaceId: true,
        workspaceRoundId: true,
        roundType: true,
        status: true,
        score: true,
        percentageScore: true,
        weightedScore: true,
        completedAt: true,
        createdAt: true,
        workspaceRound: {
          select: {
            id: true,
            order: true,
            name: true,
            type: true,
            questionCount: true,
            timeLimitMins: true,
            scoreWeightage: true,
          },
        },
        mcqSession: {
          select: {
            id: true,
            status: true,
            startTime: true,
            endTime: true,
            submittedAt: true,
            finalizedAt: true,
          },
        },
        dsaRoundSession: {
          select: {
            id: true,
            startTime: true,
            expTime: true,
          },
        },
        sqlSession: {
          select: {
            id: true,
            status: true,
            startTime: true,
            endTime: true,
            submittedAt: true,
            finalizedAt: true,
          },
        },
      },
    },
  };
}

export async function listMyWorkspaceRegistrations(actor: WorkspaceActor) {
  if (actor.role !== "jobseeker") {
    throw new WorkspaceServiceError("Job seeker access required.", 403);
  }

  return prisma.workspaceRegistration.findMany({
    where: {
      userId: actor.id,
      workspace: { status: { in: ["published", "started", "ended"] } },
    },
    orderBy: { registeredAt: "desc" },
    select: {
      ...registrationWithAttemptsSelect(),
      workspace: {
        select: publicWorkspaceSelect(),
      },
    },
  });
}

export async function getWorkspaceWithMyRegistrationByCode(actor: WorkspaceActor, codeInput: string) {
  if (actor.role !== "jobseeker") {
    throw new WorkspaceServiceError("Job seeker access required.", 403);
  }

  const code = normalizeWorkspaceCode(codeInput);
  const row = await prisma.workspace.findUnique({ where: { code }, select: { id: true } });
  if (row) await syncWorkspaceLifecycle(row.id);
  const workspace = await prisma.workspace.findUnique({
    where: { code },
    select: publicWorkspaceSelect(),
  });
  if (!workspace || !["published", "started", "ended"].includes(workspace.status)) {
    throw new WorkspaceServiceError("Workspace not found.", 404);
  }

  const registration = await prisma.workspaceRegistration.findUnique({
    where: { workspaceId_userId: { workspaceId: workspace.id, userId: actor.id } },
    select: registrationWithAttemptsSelect(),
  });

  return { workspace, registration };
}

export async function getWorkspaceLeaderboardByCode(
  codeInput: string,
  params: { limit: number; cursor?: string | null },
) {
  const code = normalizeWorkspaceCode(codeInput);
  const row = await prisma.workspace.findUnique({ where: { code }, select: { id: true } });
  if (row) await syncWorkspaceLifecycle(row.id);

  const workspace = await prisma.workspace.findUnique({
    where: { code },
    select: {
      id: true,
      code: true,
      name: true,
      organization: true,
      status: true,
    },
  });
  if (!workspace || !["published", "started", "ended"].includes(workspace.status)) {
    throw new WorkspaceServiceError("Workspace not found.", 404);
  }

  const limit = Math.min(Math.max(params.limit, 1), 100);
  const cursor = decodeLeaderboardCursor(params.cursor);
  const rows = await prisma.$queryRaw<WorkspaceLeaderboardRow[]>`
    WITH leaderboard AS (
      SELECT
        wr."userId" AS "userId",
        COALESCE(jsp."fullName", u."name") AS "name",
        u."email" AS "email",
        COALESCE(
          SUM(CASE WHEN wra."status" IN ('completed', 'auto_completed') THEN COALESCE(wra."weightedScore", 0) ELSE 0 END),
          0
        )::int AS "totalScore",
        COUNT(wra."id") FILTER (WHERE wra."status" IN ('completed', 'auto_completed'))::int AS "completedRounds",
        MAX(wra."completedAt") FILTER (WHERE wra."status" IN ('completed', 'auto_completed')) AS "lastCompletedAt"
      FROM "WorkspaceRegistration" wr
      JOIN "User" u ON u."id" = wr."userId"
      LEFT JOIN "JobSeekerProfile" jsp ON jsp."userId" = u."id"
      LEFT JOIN "WorkspaceRoundAttempt" wra
        ON wra."workspaceRegistrationId" = wr."id"
        AND wra."workspaceId" = wr."workspaceId"
      WHERE wr."workspaceId" = ${workspace.id}
        AND wr."status" = 'registered'
      GROUP BY wr."userId", u."email", u."name", jsp."fullName"
    ),
    ranked AS (
      SELECT
        (ROW_NUMBER() OVER (
          ORDER BY "totalScore" DESC, "completedRounds" DESC, "lastCompletedAt" ASC NULLS LAST, "userId" ASC
        ))::int AS "rank",
        "userId",
        "name",
        "email",
        "totalScore",
        "completedRounds",
        "lastCompletedAt"
      FROM leaderboard
    )
    SELECT *
    FROM ranked
    ${leaderboardCursorWhere(cursor)}
    ORDER BY "totalScore" DESC, "completedRounds" DESC, "lastCompletedAt" ASC NULLS LAST, "userId" ASC
    LIMIT ${limit + 1}
  `;

  const pageRows = rows.slice(0, limit);
  const lastRow = pageRows[pageRows.length - 1];
  const hasMore = rows.length > limit;

  return {
    workspace,
    leaderboard: pageRows.map((leaderboardRow) => ({
      rank: Number(leaderboardRow.rank),
      userId: leaderboardRow.userId,
      name: leaderboardRow.name,
      email: leaderboardRow.email,
      totalScore: Number(leaderboardRow.totalScore),
      completedRounds: Number(leaderboardRow.completedRounds),
      lastCompletedAt: leaderboardRow.lastCompletedAt?.toISOString() ?? null,
    })),
    nextCursor:
      hasMore && lastRow
        ? encodeLeaderboardCursor({
            totalScore: Number(lastRow.totalScore),
            completedRounds: Number(lastRow.completedRounds),
            lastCompletedAt: lastRow.lastCompletedAt?.toISOString() ?? null,
            userId: lastRow.userId,
          })
        : null,
  };
}

export async function joinWorkspaceByCode(actor: WorkspaceActor, codeInput: string) {
  if (actor.role !== "jobseeker") {
    throw new WorkspaceServiceError("Job seeker access required.", 403);
  }

  const code = normalizeWorkspaceCode(codeInput);
  const row = await prisma.workspace.findUnique({ where: { code }, select: { id: true } });
  if (row) await syncWorkspaceLifecycle(row.id);
  return prisma.$transaction(async (tx) => {
    const locked = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM "Workspace" WHERE "code" = ${code} FOR UPDATE
    `;
    const workspaceId = locked[0]?.id;
    if (!workspaceId) throw new WorkspaceServiceError("Workspace not found.", 404);

    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`workspace_registration:${workspaceId}:${actor.id}`}))`;

    const workspace = await tx.workspace.findUnique({
      where: { id: workspaceId },
      select: { id: true, status: true, endAt: true, accessMode: true },
    });
    if (!workspace || !["published", "started"].includes(workspace.status)) {
      throw new WorkspaceServiceError("Workspace not found.", 404);
    }
    if (workspace.endAt.getTime() < Date.now()) {
      throw new WorkspaceServiceError("Workspace registration has ended.", 410);
    }

    const existing = await tx.workspaceRegistration.findUnique({
      where: { workspaceId_userId: { workspaceId, userId: actor.id } },
    });
    if (existing?.status === "registered") return existing;
    if (existing?.status === "removed") {
      throw new WorkspaceServiceError("You were removed from this workspace. Contact the workspace admin.", 403);
    }

    const user = await tx.user.findUnique({
      where: { id: actor.id },
      select: { email: true },
    });
    if (!user) throw new WorkspaceServiceError("User not found.", 404);

    if (workspace.accessMode === "invite_only") {
      const allowed = await tx.workspaceAllowedEmail.findUnique({
        where: {
          workspaceId_email: {
            workspaceId,
            email: normalizeEmail(user.email),
          },
        },
        select: { id: true },
      });
      if (!allowed) {
        throw new WorkspaceServiceError("This workspace is invite-only. Your email is not on the allowlist.", 403);
      }
    }

    try {
      return await tx.workspaceRegistration.create({
        data: {
          workspaceId,
          userId: actor.id,
        },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        const current = await tx.workspaceRegistration.findUnique({
          where: { workspaceId_userId: { workspaceId, userId: actor.id } },
        });
        if (current) return current;
      }
      throw err;
    }
  });
}

export async function listWorkspaceRegistrations(actor: WorkspaceActor, workspaceId: string) {
  await assertCanManageWorkspace(actor, workspaceId);
  return prisma.workspaceRegistration.findMany({
    where: { workspaceId },
    orderBy: [{ status: "asc" }, { registeredAt: "desc" }],
    include: {
      user: {
        select: {
          id: true,
          email: true,
          name: true,
          jobSeekerProfile: {
            select: {
              fullName: true,
              phone: true,
              college: true,
              graduationYear: true,
              targetJobTitle: true,
            },
          },
        },
      },
    },
  });
}

export async function getWorkspaceCandidateDossier(actor: WorkspaceActor, workspaceId: string, userId: string) {
  await assertCanManageWorkspace(actor, workspaceId);
  const registration = await prisma.workspaceRegistration.findUnique({
    where: { workspaceId_userId: { workspaceId, userId } },
    include: {
      user: {
        select: {
          id: true,
          email: true,
          name: true,
          profileImage: true,
          jobSeekerProfile: {
            select: {
              fullName: true,
              phone: true,
              college: true,
              graduationYear: true,
              targetJobTitle: true,
              roleType: true,
            },
          },
        },
      },
      roundAttempts: {
        orderBy: { createdAt: "asc" },
        include: {
          workspaceRound: {
            select: { id: true, order: true, name: true, type: true, scoreWeightage: true },
          },
        },
      },
    },
  });
  if (!registration) throw new WorkspaceServiceError("Workspace registration not found.", 404);

  const workspaceDsaAttempt = [...registration.roundAttempts]
    .filter((attempt) => attempt.roundType === "coding" && attempt.dsaRoundSessionId)
    .sort((left, right) => (right.completedAt?.getTime() ?? 0) - (left.completedAt?.getTime() ?? 0))[0];
  const workspaceAptitudeAttempt = [...registration.roundAttempts]
    .filter((attempt) => attempt.roundType === "mcq" && attempt.mcqSessionId)
    .sort((left, right) => (right.completedAt?.getTime() ?? 0) - (left.completedAt?.getTime() ?? 0))[0];

  const [aptitudeResults, dsaResults, antigravityReports, workspaceDsaSubmissions, workspaceMcqSession, reportGenerations] = await Promise.all([
    prisma.aptitudeTestResult.findMany({
      where: { userId, invalidated: false },
      orderBy: { completedAt: "desc" },
      take: 5,
      select: { id: true, score: true, answers: true, completedAt: true },
    }),
    prisma.dsaRoundResult.findMany({
      where: { userId, invalidated: false },
      orderBy: { completedAt: "desc" },
      take: 5,
      select: { id: true, roundSessionId: true, score: true, answers: true, completedAt: true },
    }),
    prisma.antigravityReport.findMany({
      where: { userId },
      orderBy: { receivedAt: "desc" },
      take: 5,
      include: {
        interview: {
          select: {
            id: true,
            jobRole: true,
            experienceLevel: true,
            totalScore: true,
            badgeLevel: true,
            finalVerdict: true,
            completedAt: true,
          },
        },
        _count: { select: { telemetryEvents: true } },
      },
    }),
    workspaceDsaAttempt?.dsaRoundSessionId
      ? prisma.dsaSubmission.findMany({
          where: { roundSessionId: workspaceDsaAttempt.dsaRoundSessionId, isOfficial: true },
          orderBy: { submittedAt: "asc" },
          select: {
            id: true,
            questionId: true,
            language: true,
            code: true,
            passedCount: true,
            totalCount: true,
            results: true,
            followUpScore: true,
            followUpResults: true,
            submittedAt: true,
          },
        })
      : Promise.resolve([]),
    workspaceAptitudeAttempt?.mcqSessionId
      ? prisma.mcqSession.findUnique({
          where: { id: workspaceAptitudeAttempt.mcqSessionId },
          select: {
            id: true,
            questions: true,
            answerKey: true,
            answers: true,
            startTime: true,
            endTime: true,
            submittedAt: true,
            finalizedAt: true,
            score: true,
            correctCount: true,
            incorrectCount: true,
            skippedCount: true,
          },
        })
      : Promise.resolve(null),
    prisma.assessmentReportGeneration.findMany({
      where: { workspaceId, userId, status: "complete" },
      orderBy: { completedAt: "desc" },
      take: 10,
      select: { id: true, reportKind: true, promptVersion: true, model: true, result: true, usage: true, estimatedCostUsd: true, completedAt: true, sourceHash: true },
    }),
  ]);
  const workspaceAptitudeEvidence = workspaceMcqSession ? (() => {
    const questions = Array.isArray(workspaceMcqSession.questions) ? workspaceMcqSession.questions : [];
    const answerKey = workspaceMcqSession.answerKey && typeof workspaceMcqSession.answerKey === "object" && !Array.isArray(workspaceMcqSession.answerKey)
      ? workspaceMcqSession.answerKey as Record<string, unknown> : {};
    const answers = workspaceMcqSession.answers && typeof workspaceMcqSession.answers === "object" && !Array.isArray(workspaceMcqSession.answers)
      ? workspaceMcqSession.answers as Record<string, unknown> : {};
    return {
      sessionId: workspaceMcqSession.id,
      score: workspaceAptitudeAttempt?.percentageScore ?? null,
      completedAt: workspaceAptitudeAttempt?.completedAt ?? workspaceMcqSession.finalizedAt,
      totalQuestions: questions.length,
      correct: workspaceMcqSession.correctCount,
      incorrect: workspaceMcqSession.incorrectCount,
      skipped: workspaceMcqSession.skippedCount,
      timeTakenSeconds: Math.max(0, Math.round(((workspaceMcqSession.finalizedAt ?? workspaceMcqSession.submittedAt ?? workspaceMcqSession.endTime).getTime() - workspaceMcqSession.startTime.getTime()) / 1000)),
      timeLimitSeconds: Math.max(0, Math.round((workspaceMcqSession.endTime.getTime() - workspaceMcqSession.startTime.getTime()) / 1000)),
      questionReview: questions.map((raw, index) => {
        const question = raw && typeof raw === "object" && !Array.isArray(raw) ? raw as Record<string, unknown> : {};
        const id = String(question.id ?? index);
        const selectedAnswer = typeof answers[id] === "string" ? String(answers[id]) : "";
        const correctAnswer = typeof answerKey[id] === "string" ? String(answerKey[id]) : "";
        return {
          id,
          question: String(question.question ?? "Question text was not retained."),
          options: Array.isArray(question.options) ? question.options.map(String) : [],
          selectedAnswer: selectedAnswer || null,
          correctAnswer,
          outcome: !selectedAnswer ? "skipped" : selectedAnswer.trim().toLowerCase() === correctAnswer.trim().toLowerCase() ? "correct" : "incorrect",
          marks: Number(question.marks ?? 1),
        };
      }),
    };
  })() : null;
  const dsaQuestions = workspaceDsaSubmissions.length
    ? await prisma.dsaQuestion.findMany({
        where: { id: { in: workspaceDsaSubmissions.map((submission) => submission.questionId) } },
        select: { id: true, title: true, description: true, difficulty: true, examples: true, constraints: true },
      })
    : [];
  const dsaQuestionById = new Map(dsaQuestions.map((question) => [question.id, question]));
  const workspaceDsaEvidence = workspaceDsaAttempt?.dsaRoundSessionId ? {
    attemptId: workspaceDsaAttempt.id,
    roundSessionId: workspaceDsaAttempt.dsaRoundSessionId,
    score: workspaceDsaAttempt.percentageScore ?? workspaceDsaAttempt.score,
    completedAt: workspaceDsaAttempt.completedAt,
    submissions: workspaceDsaSubmissions.map((submission) => ({
      ...submission,
      question: dsaQuestionById.get(submission.questionId) ?? null,
    })),
  } : null;
  const synthesis = buildCandidateAssessmentSynthesis({
    aptitude: aptitudeResults[0] ?? (workspaceAptitudeEvidence ? { score: workspaceAptitudeEvidence.score } : null),
    dsa: dsaResults[0] ?? (workspaceDsaEvidence ? { score: workspaceDsaEvidence.score } : null),
    antigravity: antigravityReports[0] ?? null,
  });

  return {
    schemaVersion: "workspace_candidate_dossier_v1",
    workspaceId,
    candidate: registration.user,
    registration: {
      id: registration.id,
      status: registration.status,
      registeredAt: registration.registeredAt,
      roundAttempts: registration.roundAttempts,
    },
    synthesis,
    agentReports: {
      dsa: reportGenerations.find((generation) => generation.reportKind === "dsa") ?? null,
      unified: reportGenerations.find((generation) => generation.reportKind === "unified") ?? null,
    },
    modules: {
      aptitude: { latest: aptitudeResults[0] ?? null, history: aptitudeResults, workspaceEvidence: workspaceAptitudeEvidence },
      dsa: { latest: dsaResults[0] ?? null, history: dsaResults, workspaceEvidence: workspaceDsaEvidence },
      antigravity: { latest: antigravityReports[0] ?? null, history: antigravityReports },
    },
  };
}

export async function removeWorkspaceRegistration(actor: WorkspaceActor, workspaceId: string, userId: string) {
  await assertCanManageWorkspace(actor, workspaceId);
  const registration = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`workspace_registration:${workspaceId}:${userId}`}))`;
    const existing = await tx.workspaceRegistration.findUnique({
      where: { workspaceId_userId: { workspaceId, userId } },
    });
    if (!existing) throw new WorkspaceServiceError("Workspace registration not found.", 404);
    if (existing.status === "removed") return existing;
    return tx.workspaceRegistration.update({
      where: { id: existing.id },
      data: {
        status: "removed",
        removedAt: new Date(),
        removedByUserId: actor.id,
      },
    });
  });
  await discardActiveWorkspaceRegistrationMcqAttempts(workspaceId, userId);
  await discardActiveWorkspaceRegistrationDsaAttempts(workspaceId, userId);
  await discardActiveWorkspaceRegistrationSqlAttempts(workspaceId, userId);
  if (registration.removedAt) {
    const details = await prisma.workspaceRegistration.findUnique({
      where: { id: registration.id },
      include: {
        workspace: { select: { name: true, organization: true } },
        user: { select: { email: true, name: true, jobSeekerProfile: { select: { fullName: true } } } },
      },
    });
    if (details?.user.email) {
      void sendWorkspaceRemovalEmail({
        to: details.user.email,
        name: details.user.jobSeekerProfile?.fullName || details.user.name,
        workspaceName: details.workspace.name,
        organization: details.workspace.organization,
        eventKey: `workspace-removal:${registration.id}:${registration.removedAt.getTime()}`,
      }).catch((err) => {
        console.warn("[workspace/remove-registration] email failed:", err instanceof Error ? err.message : err);
      });
    }
  }
  return registration;
}

export async function restoreWorkspaceRegistration(actor: WorkspaceActor, workspaceId: string, userId: string) {
  await assertCanManageWorkspace(actor, workspaceId);
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`workspace_registration:${workspaceId}:${userId}`}))`;
    const existing = await tx.workspaceRegistration.findUnique({
      where: { workspaceId_userId: { workspaceId, userId } },
    });
    if (!existing) throw new WorkspaceServiceError("Workspace registration not found.", 404);
    if (existing.status === "registered") return existing;
    return tx.workspaceRegistration.update({
      where: { id: existing.id },
      data: {
        status: "registered",
        removedAt: null,
        removedByUserId: null,
        restoredAt: new Date(),
        restoredByUserId: actor.id,
      },
    });
  });
}

export async function importAllowedWorkspaceEmailsFromCsv(params: {
  actor: WorkspaceActor;
  workspaceCode: string;
  csvBuffer: Buffer;
}): Promise<AllowedEmailImportSummary> {
  const workspace = await assertCanManageWorkspaceByCode(params.actor, params.workspaceCode);
  const rawEmails = extractEmailsFromCsv(params.csvBuffer);
  const seen = new Set<string>();
  const validEmails: string[] = [];
  const invalidSamples: string[] = [];
  let invalid = 0;
  let duplicatesInFile = 0;

  for (const raw of rawEmails) {
    const email = normalizeEmail(raw);
    if (!isValidEmail(email)) {
      invalid += 1;
      if (invalidSamples.length < 10) invalidSamples.push(raw);
      continue;
    }
    if (seen.has(email)) {
      duplicatesInFile += 1;
      continue;
    }
    seen.add(email);
    validEmails.push(email);
  }

  const existingRows = validEmails.length
    ? await prisma.workspaceAllowedEmail.findMany({
        where: { workspaceId: workspace.id, email: { in: validEmails } },
        select: { email: true },
      })
    : [];
  const existingEmailSet = new Set(existingRows.map((row) => row.email));
  const newEmails = validEmails.filter((email) => !existingEmailSet.has(email));

  const inserted = validEmails.length
    ? (await prisma.workspaceAllowedEmail.createMany({
        data: validEmails.map((email) => ({ workspaceId: workspace.id, email })),
        skipDuplicates: true,
      })).count
    : 0;

  if (newEmails.length > 0) {
    const workspaceDetails = await prisma.workspace.findUnique({
      where: { id: workspace.id },
      select: { name: true, organization: true, code: true, startAt: true },
    });
    if (workspaceDetails) {
      for (const email of newEmails) {
        void sendWorkspaceInvitationEmail({
          to: email,
          workspaceName: workspaceDetails.name,
          organization: workspaceDetails.organization,
          code: workspaceDetails.code,
          startsAt: workspaceDetails.startAt,
          eventKey: `workspace-invitation:${workspace.id}:${email}`,
        }).catch((err) => {
          console.warn("[workspace/allowed-emails/import] invitation email failed:", err instanceof Error ? err.message : err);
        });
      }
    }
  }

  return {
    workspaceId: workspace.id,
    workspaceCode: workspace.code,
    parsed: rawEmails.length,
    valid: validEmails.length,
    invalid,
    duplicatesInFile,
    inserted,
    alreadyPresent: existingRows.length,
    invalidSamples,
  };
}
