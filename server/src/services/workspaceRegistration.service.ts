import { Prisma } from "@prisma/client";
import crypto from "node:crypto";
import { prisma } from "../config/prisma.js";
import { discardActiveWorkspaceRegistrationMcqAttempts } from "./mcqAutoFinalize.service.js";
import { discardActiveWorkspaceRegistrationDsaAttempts } from "./workspaceDsaFinalize.service.js";
import { discardActiveWorkspaceRegistrationSqlAttempts } from "./workspaceSqlFinalize.service.js";
import {
  WorkspaceServiceError,
  syncWorkspaceLifecycle,
} from "./workspace.service.js";
import {
  sendWorkspaceInvitationEmail,
  sendWorkspaceRemovalEmail,
} from "./resend.js";
import {
  sanitizeAntigravityReportForCandidate,
  sanitizeAssessmentGenerationForCandidate,
  sanitizeDsaWorkspaceEvidenceForCandidate,
  sanitizePlacementReportForCandidate,
} from "./candidateDossierSanitizer.js";
import { assessmentEvidenceHash } from "./assessmentReportEvidence.service.js";
import { createAntigravityReportAccessToken } from "./antigravityReportAccess.service.js";
import { createPlacementReportAccessToken } from "./placementReportAccessToken.service.js";
import { resolvePlacementWebUrl } from "../routes/placementReadiness.js";
import { listWorkspaceAuditEvents, recordWorkspaceAuditEvent } from "./workspaceAudit.service.js";

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
  antigravity: {
    overallScore?: number | null;
    hireRecommendation?: string | null;
    report?: unknown;
    interview?: { jobRole?: string | null } | null;
  } | null;
  targetRole?: string | null;
  roleResponsibilities?: string[];
  workspaceInterviewLinked?: boolean;
  aptitudeEvidenceComplete?: boolean;
  dsaEvidenceComplete?: boolean;
  antigravityEvidenceComplete?: boolean;
}) {
  const aptitude = scorePercent(input.aptitude?.score, "percent");
  const dsa = scorePercent(input.dsa?.score, "percent");
  const antigravity = scorePercent(input.antigravity?.overallScore, "ten");
  const measured = [aptitude, dsa, antigravity].filter(
    (value): value is number => value !== null,
  );
  const aptitudeEvidenceComplete = input.aptitudeEvidenceComplete ?? true;
  const dsaEvidenceComplete = input.dsaEvidenceComplete ?? true;
  const antigravityEvidenceComplete =
    input.antigravityEvidenceComplete ?? true;
  const decisionMeasured = [
    aptitudeEvidenceComplete ? aptitude : null,
    dsaEvidenceComplete ? dsa : null,
    antigravityEvidenceComplete ? antigravity : null,
  ].filter((value): value is number => value !== null);
  const spread =
    decisionMeasured.length > 1
      ? Math.max(...decisionMeasured) - Math.min(...decisionMeasured)
      : 0;
  const report =
    input.antigravity?.report && typeof input.antigravity.report === "object"
      ? (input.antigravity.report as Record<string, unknown>)
      : {};
  const strengthSource = report.tested_strengths ?? report.strengths;
  const riskSource = report.tested_risks ?? report.risk_flags;
  const strengths = Array.isArray(strengthSource)
    ? strengthSource.map(String)
    : [];
  const risks = Array.isArray(riskSource)
    ? riskSource.map(String)
    : [];

  const crossModuleSignals: string[] = [];
  const contradictions: string[] = [];
  if (aptitudeEvidenceComplete && aptitude !== null && aptitude >= 80)
    crossModuleSignals.push(
      "Strong aptitude evidence supports fast comprehension and structured problem solving.",
    );
  if (dsaEvidenceComplete && dsa !== null && dsa >= 80)
    crossModuleSignals.push(
      "DSA performance verifies implementation fluency under objective test constraints.",
    );
  if (
    antigravityEvidenceComplete &&
    antigravity !== null &&
    antigravity >= 80
  )
    crossModuleSignals.push(
      "Antigravity evidence supports role-level reasoning, communication, and ownership under pressure.",
    );
  if (decisionMeasured.length === 3 && spread <= 12)
    crossModuleSignals.push(
      "All three modules agree closely; the candidate signal is consistent rather than driven by one assessment.",
    );
  if (
    aptitudeEvidenceComplete &&
    dsaEvidenceComplete &&
    aptitude !== null &&
    dsa !== null &&
    Math.abs(aptitude - dsa) >= 15
  ) {
    contradictions.push(
      aptitude > dsa
        ? "Conceptual aptitude materially exceeds coding execution; validate implementation speed and debugging discipline."
        : "Coding execution materially exceeds aptitude performance; validate breadth, comprehension speed, and unfamiliar problem framing.",
    );
  }
  if (
    dsaEvidenceComplete &&
    antigravityEvidenceComplete &&
    dsa !== null &&
    antigravity !== null &&
    Math.abs(dsa - antigravity) >= 15
  ) {
    contradictions.push(
      dsa > antigravity
        ? "Objective coding is stronger than interview reasoning; verify communication, production judgment, and ownership boundaries."
        : "Interview reasoning is stronger than objective coding; verify independent implementation through a scoped work sample.",
    );
  }
  if (decisionMeasured.length < 3)
    contradictions.push(
      "Cross-module comparison is withheld until every module has complete, auditable evidence.",
    );
  else if (!contradictions.length)
    contradictions.push(
      "No material cross-module contradiction was detected at the current evidence threshold.",
    );

  const completedModules = measured.length;
  const incompleteEvidence = [
    ...(!aptitudeEvidenceComplete && aptitude !== null
      ? ["Aptitude has a persisted score but its complete question ledger is not retained."]
      : []),
    ...(!dsaEvidenceComplete && dsa !== null
      ? ["DSA has aggregate results but not enough problem, source, and test evidence to reproduce every correctness concern."]
      : []),
    ...(!antigravityEvidenceComplete && antigravity !== null
      ? ["Antigravity is missing the complete bound evidence packet or transcript required to audit its conclusions."]
      : []),
  ];
  const normalizeRole = (value: string | null | undefined) =>
    String(value || "")
      .toLowerCase()
      .replace(
        /\b(sr|jr|senior|junior|lead|staff|principal|i{1,3}|1|2|3)\b/g,
        " ",
      )
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  const targetRole = normalizeRole(input.targetRole);
  const artifactRole = normalizeRole(input.antigravity?.interview?.jobRole);
  const roleBound = Boolean(
    targetRole &&
      artifactRole &&
      (targetRole === artifactRole ||
        targetRole.includes(artifactRole) ||
        artifactRole.includes(targetRole)),
  );
  const integrityIssues = [
    ...(!input.targetRole
      ? [
          "The target role is not recorded, so role readiness cannot be assessed.",
        ]
      : []),
    ...(input.antigravity && !input.antigravity.interview?.jobRole
      ? ["The Antigravity artifact has no immutable target-role snapshot."]
      : []),
    ...(input.antigravity &&
    input.targetRole &&
    input.antigravity.interview?.jobRole &&
    !roleBound
      ? [
          `Role mismatch: dossier targets “${input.targetRole}” but the Antigravity artifact assessed “${input.antigravity.interview.jobRole}”.`,
        ]
      : []),
    ...(input.antigravity && input.workspaceInterviewLinked === false
      ? [
          "The Antigravity artifact is not linked to this workspace interview attempt.",
        ]
      : []),
  ];
  const decisionStatus = integrityIssues.length
    ? "blocked_integrity"
    : completedModules < 3 || incompleteEvidence.length
      ? "insufficient_evidence"
      : "human_review_required";
  const recommendation =
    decisionStatus === "blocked_integrity"
      ? "DECISION BLOCKED — EVIDENCE BINDING FAILED"
      : decisionStatus === "insufficient_evidence"
        ? "INSUFFICIENT EVIDENCE"
        : "HUMAN REVIEW REQUIRED";
  const decisionGates = [
    {
      key: "identity_and_role",
      status: integrityIssues.length ? "blocked" : "ready",
      label: "Candidate, session, workspace, and role binding",
      detail: integrityIssues.length
        ? integrityIssues.join(" ")
        : "The persisted evidence is bound to the dossier context.",
    },
    {
      key: "module_evidence",
      status:
        completedModules === 3 && !incompleteEvidence.length
          ? "ready"
          : "incomplete",
      label: "Required assessment evidence",
      detail:
        completedModules < 3
          ? `${completedModules}/3 assessment modules contain persisted results.`
          : incompleteEvidence.length
            ? `All three modules have results, but the dossier is not decision-ready: ${incompleteEvidence.join(" ")}`
            : "All three modules have complete, auditable evidence for human review.",
    },
    {
      key: "role_rubric",
      status:
        (input.roleResponsibilities?.length ?? 0) >= 3
          ? "ready"
          : "not_configured",
      label: "Employer role rubric",
      detail:
        (input.roleResponsibilities?.length ?? 0) >= 3
          ? `${input.roleResponsibilities!.length} employer-approved responsibilities are bound to this dossier. The named reviewer must apply them to the evidence.`
          : "No employer-approved responsibility rubric is configured. Scores must not be converted into a hiring decision.",
    },
    {
      key: "human_decision",
      status: "pending",
      label: "Named human decision owner",
      detail:
        "A qualified reviewer must inspect the evidence, resolve contradictions, and record the final decision and rationale.",
    },
  ];

  return {
    schemaVersion: "candidate_assessment_synthesis_v2",
    recommendation,
    decisionStatus,
    compositeScore: null,
    confidence: null,
    completedModules,
    overallRead:
      decisionStatus === "blocked_integrity"
        ? "Do not use this dossier for a hiring decision. The assessment artifact failed candidate/workspace/role binding checks."
        : decisionStatus === "insufficient_evidence"
          ? `The dossier is not decision-ready. ${incompleteEvidence.join(" ") || "Collect every missing module before a human reviewer records a decision."}`
          : `All three module results are available. Their ${Math.round(spread * 10) / 10}-point spread is evidence to investigate, not a number to average away. A human reviewer must apply an employer-approved role rubric.`,
    crossModuleSignals: crossModuleSignals.length
      ? crossModuleSignals
      : [
          "The current evidence is too sparse to claim a cross-module strength.",
        ],
    contradictions,
    verifiedStrengths:
      decisionStatus === "human_review_required" ? strengths.slice(0, 6) : [],
    scopedRisks: risks.slice(0, 6),
    nextActions: [
      ...integrityIssues.slice(0, 2),
      ...contradictions
        .filter(
          (item) =>
            !item.startsWith("No material") &&
            !item.startsWith("Cross-module comparison is withheld"),
        )
        .slice(0, 2),
      ...(risks.length
        ? [`Probe the highest Antigravity risk directly: ${risks[0]}`]
        : []),
      ...(completedModules < 3
        ? [
            "Complete every missing module before treating the composite as a final hiring decision.",
          ]
        : []),
    ].slice(0, 4),
    evidenceBasis: {
      aptitudeScore: aptitude,
      dsaScore: dsa,
      antigravityScore: antigravity,
      antigravityVerdict: null,
      scoreSpread: Math.round(spread * 10) / 10,
      aptitudeEvidenceComplete,
      dsaEvidenceComplete,
      antigravityEvidenceComplete,
    },
    integrity: {
      status: integrityIssues.length ? "blocked" : "verified",
      targetRole: input.targetRole ?? null,
      artifactRole: input.antigravity?.interview?.jobRole ?? null,
      workspaceInterviewLinked: input.workspaceInterviewLinked ?? null,
      issues: integrityIssues,
    },
    roleRubric: {
      targetRole: input.targetRole ?? null,
      responsibilities: input.roleResponsibilities ?? [],
    },
    decisionGates,
    evidenceCompleteness: {
      aptitude: aptitudeEvidenceComplete,
      dsa: dsaEvidenceComplete,
      antigravity: antigravityEvidenceComplete,
      issues: incompleteEvidence,
    },
  };
}

type ConfiguredAssessmentModule = "aptitude" | "dsa" | "sql" | "interview";

export function buildConfiguredCandidateAssessmentSynthesis(input: {
  configuredModules: ConfiguredAssessmentModule[];
  aptitude: { score?: number | null } | null;
  dsa: { score?: number | null } | null;
  sql: { score?: number | null } | null;
  interview: {
    score?: number | null;
    report?: unknown;
    artifactRole?: string | null;
  } | null;
  targetRole?: string | null;
  roleResponsibilities?: string[];
  workspaceInterviewLinked?: boolean;
  evidenceComplete: Record<ConfiguredAssessmentModule, boolean>;
}) {
  const requiredModules = [...new Set(input.configuredModules)];
  const interviewScore = scorePercent(input.interview?.score, "percent");
  const base = buildCandidateAssessmentSynthesis({
    aptitude: input.aptitude,
    dsa: input.dsa,
    antigravity: input.interview
      ? {
          overallScore: interviewScore === null ? null : interviewScore / 10,
          report: input.interview.report,
          interview: { jobRole: input.interview.artifactRole },
        }
      : null,
    targetRole: input.targetRole,
    roleResponsibilities: input.roleResponsibilities,
    workspaceInterviewLinked: input.workspaceInterviewLinked,
    aptitudeEvidenceComplete: input.evidenceComplete.aptitude,
    dsaEvidenceComplete: input.evidenceComplete.dsa,
    antigravityEvidenceComplete: input.evidenceComplete.interview,
  });
  const scores: Record<ConfiguredAssessmentModule, number | null> = {
    aptitude: scorePercent(input.aptitude?.score, "percent"),
    dsa: scorePercent(input.dsa?.score, "percent"),
    sql: scorePercent(input.sql?.score, "percent"),
    interview: interviewScore,
  };
  const completedModuleKeys = requiredModules.filter(
    (module) => scores[module] !== null,
  );
  const readyModuleKeys = requiredModules.filter(
    (module) => scores[module] !== null && input.evidenceComplete[module],
  );
  const missingModuleKeys = requiredModules.filter(
    (module) => !readyModuleKeys.includes(module),
  );
  const readyScores = readyModuleKeys.map((module) => scores[module]!).filter(Number.isFinite);
  const spread = readyScores.length > 1
    ? Math.max(...readyScores) - Math.min(...readyScores)
    : 0;
  const integrityBlocked = base.integrity.status === "blocked";
  const decisionStatus = integrityBlocked
    ? "blocked_integrity"
    : missingModuleKeys.length
      ? "insufficient_evidence"
      : "human_review_required";
  const label = (module: ConfiguredAssessmentModule) =>
    ({ aptitude: "Aptitude", dsa: "Coding", sql: "SQL", interview: "Placement interview" })[module];
  const evidenceIssues = missingModuleKeys.map((module) =>
    scores[module] === null
      ? `${label(module)} has no completed result.`
      : `${label(module)} has a result but its complete auditable evidence is not retained.`,
  );
  const contradictions = base.contradictions.filter(
    (item) => !item.startsWith("Cross-module comparison is withheld"),
  );
  if (
    readyModuleKeys.includes("dsa") &&
    readyModuleKeys.includes("sql") &&
    scores.dsa !== null &&
    scores.sql !== null &&
    Math.abs(scores.dsa - scores.sql) >= 15
  ) {
    contradictions.push(
      scores.dsa > scores.sql
        ? "General coding execution materially exceeds SQL execution; validate relational modeling, joins, aggregation, and query debugging."
        : "SQL execution materially exceeds general coding execution; validate algorithm design and implementation outside the data layer.",
    );
  }
  if (missingModuleKeys.length) {
    contradictions.push(
      "Cross-module comparison is withheld until every configured round has complete, auditable evidence.",
    );
  } else if (!contradictions.length) {
    contradictions.push(
      "No material cross-module contradiction was detected at the current evidence threshold.",
    );
  }
  const moduleGate = base.decisionGates.find((gate) => gate.key === "module_evidence");
  if (moduleGate) {
    moduleGate.status = missingModuleKeys.length ? "incomplete" : "ready";
    moduleGate.detail = missingModuleKeys.length
      ? `${readyModuleKeys.length}/${requiredModules.length} configured modules have complete evidence. ${evidenceIssues.join(" ")}`
      : `All ${requiredModules.length} configured modules have complete, auditable evidence for human review.`;
  }
  return {
    ...base,
    schemaVersion: "candidate_assessment_synthesis_v3_configured_rounds",
    recommendation: integrityBlocked
      ? "DECISION BLOCKED — EVIDENCE BINDING FAILED"
      : missingModuleKeys.length
        ? "INSUFFICIENT EVIDENCE"
        : "HUMAN REVIEW REQUIRED",
    decisionStatus,
    completedModules: completedModuleKeys.length,
    requiredModules,
    completedModuleKeys,
    readyModuleKeys,
    missingModuleKeys,
    overallRead: integrityBlocked
      ? base.overallRead
      : missingModuleKeys.length
        ? `The dossier is not decision-ready. ${evidenceIssues.join(" ")}`
        : `All ${requiredModules.length} configured module results are available. Their ${Math.round(spread * 10) / 10}-point spread is evidence to investigate, not a number to average away. A human reviewer must apply the employer-approved role rubric.`,
    contradictions,
    evidenceBasis: {
      ...base.evidenceBasis,
      aptitudeScore: scores.aptitude,
      dsaScore: scores.dsa,
      sqlScore: scores.sql,
      interviewScore: scores.interview,
      antigravityScore: scores.interview,
      scoreSpread: Math.round(spread * 10) / 10,
      moduleScores: scores,
    },
    evidenceCompleteness: {
      ...base.evidenceCompleteness,
      aptitude: input.evidenceComplete.aptitude,
      dsa: input.evidenceComplete.dsa,
      sql: input.evidenceComplete.sql,
      interview: input.evidenceComplete.interview,
      antigravity: input.evidenceComplete.interview,
      byModule: input.evidenceComplete,
      issues: evidenceIssues,
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

function decodeLeaderboardCursor(
  cursor?: string | null,
): LeaderboardCursor | null {
  if (!cursor) return null;
  try {
    const normalized = cursor.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(
      normalized.length + ((4 - (normalized.length % 4)) % 4),
      "=",
    );
    const parsed = JSON.parse(
      Buffer.from(padded, "base64").toString("utf8"),
    ) as Partial<LeaderboardCursor>;
    const validDate =
      parsed.lastCompletedAt === null ||
      (typeof parsed.lastCompletedAt === "string" &&
        !Number.isNaN(new Date(parsed.lastCompletedAt).getTime()));
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

const WORKSPACE_MANAGER_MEMBER_ROLES = ["owner", "manager"] as const;

async function getActiveWorkspaceMemberRole(
  workspaceId: string,
  userId: string,
): Promise<"owner" | "manager" | "reviewer" | null> {
  const membership = await prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId, userId } },
    select: { role: true, removedAt: true },
  });
  if (!membership || membership.removedAt) return null;
  return membership.role;
}

/// Owner/legacy-owner or an active 'owner'/'manager' WorkspaceMember can fully
/// manage a workspace (candidates, invitations, reports, rounds). Platform
/// admins can always manage any workspace. 'reviewer' members are read-only
/// and must use assertCanReviewWorkspace instead.
async function assertCanManageWorkspace(
  actor: WorkspaceActor,
  workspaceId: string,
) {
  const workspace = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: { id: true, ownerUserId: true },
  });
  if (!workspace) throw new WorkspaceServiceError("Workspace not found.", 404);
  if (actor.role === "admin" || workspace.ownerUserId === actor.id) {
    return workspace;
  }
  const memberRole = await getActiveWorkspaceMemberRole(workspaceId, actor.id);
  if (
    memberRole &&
    (WORKSPACE_MANAGER_MEMBER_ROLES as readonly string[]).includes(memberRole)
  ) {
    return workspace;
  }
  throw new WorkspaceServiceError(
    "Not authorized to manage this workspace.",
    403,
  );
}

async function assertCanManageWorkspaceByCode(
  actor: WorkspaceActor,
  workspaceCode: string,
) {
  const code = normalizeWorkspaceCode(workspaceCode);
  const workspace = await prisma.workspace.findUnique({
    where: { code },
    select: { id: true, code: true, ownerUserId: true },
  });
  if (!workspace) throw new WorkspaceServiceError("Workspace not found.", 404);
  if (actor.role === "admin" || workspace.ownerUserId === actor.id) {
    return workspace;
  }
  const memberRole = await getActiveWorkspaceMemberRole(workspace.id, actor.id);
  if (
    memberRole &&
    (WORKSPACE_MANAGER_MEMBER_ROLES as readonly string[]).includes(memberRole)
  ) {
    return workspace;
  }
  throw new WorkspaceServiceError(
    "Not authorized to manage this workspace.",
    403,
  );
}

/// Read-only access: manager/owner roles above, plus 'reviewer' members.
async function assertCanReviewWorkspace(
  actor: WorkspaceActor,
  workspaceId: string,
) {
  const workspace = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: { id: true, ownerUserId: true },
  });
  if (!workspace) throw new WorkspaceServiceError("Workspace not found.", 404);
  if (actor.role === "admin" || workspace.ownerUserId === actor.id) {
    return workspace;
  }
  const memberRole = await getActiveWorkspaceMemberRole(workspaceId, actor.id);
  if (memberRole) return workspace;
  throw new WorkspaceServiceError(
    "Not authorized to view this workspace.",
    403,
  );
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
  const emailColumn = header.findIndex(
    (cell) => cell === "email" || cell === "e-mail",
  );
  const dataRows = emailColumn >= 0 ? rows.slice(1) : rows;
  return dataRows
    .map((row) => row[emailColumn >= 0 ? emailColumn : 0] ?? "")
    .map((email) => email.trim())
    .filter((email) => email.length > 0);
}

export async function getPublishedWorkspaceByCode(codeInput: string) {
  const code = normalizeWorkspaceCode(codeInput);
  const row = await prisma.workspace.findUnique({
    where: { code },
    select: { id: true },
  });
  if (row) await syncWorkspaceLifecycle(row.id);
  const workspace = await prisma.workspace.findUnique({
    where: { code },
    select: publicWorkspaceSelect(),
  });
  if (
    !workspace ||
    !["published", "started", "ended"].includes(workspace.status)
  ) {
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
        placementReadinessHandoff: {
          select: {
            status: true,
            placementSessionId: true,
            lastError: true,
            expiresAt: true,
            updatedAt: true,
            artifact: { select: { id: true, receivedAt: true } },
          },
        },
      },
    },
  };
}

export async function listMyWorkspaceRegistrations(actor: WorkspaceActor) {
  if (!["jobseeker", "admin"].includes(actor.role)) {
    throw new WorkspaceServiceError("Workspace access required.", 403);
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

export async function getWorkspaceWithMyRegistrationByCode(
  actor: WorkspaceActor,
  codeInput: string,
) {
  if (actor.role !== "jobseeker") {
    throw new WorkspaceServiceError("Job seeker access required.", 403);
  }

  const code = normalizeWorkspaceCode(codeInput);
  const row = await prisma.workspace.findUnique({
    where: { code },
    select: { id: true },
  });
  if (row) await syncWorkspaceLifecycle(row.id);
  const workspace = await prisma.workspace.findUnique({
    where: { code },
    select: publicWorkspaceSelect(),
  });
  if (
    !workspace ||
    !["published", "started", "ended"].includes(workspace.status)
  ) {
    throw new WorkspaceServiceError("Workspace not found.", 404);
  }

  const registration = await prisma.workspaceRegistration.findUnique({
    where: {
      workspaceId_userId: { workspaceId: workspace.id, userId: actor.id },
    },
    select: registrationWithAttemptsSelect(),
  });

  return { workspace, registration };
}

export async function getWorkspaceLeaderboardByCode(
  actor: WorkspaceActor,
  codeInput: string,
  params: { limit: number; cursor?: string | null },
) {
  if (!["jobseeker", "admin"].includes(actor.role)) {
    throw new WorkspaceServiceError("Workspace access required.", 403);
  }
  const code = normalizeWorkspaceCode(codeInput);
  const row = await prisma.workspace.findUnique({
    where: { code },
    select: { id: true },
  });
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
  if (
    !workspace ||
    !["published", "started", "ended"].includes(workspace.status)
  ) {
    throw new WorkspaceServiceError("Workspace not found.", 404);
  }

  if (actor.role === "jobseeker") {
    const viewerRegistration = await prisma.workspaceRegistration.findUnique({
      where: {
        workspaceId_userId: { workspaceId: workspace.id, userId: actor.id },
      },
      select: { status: true },
    });
    if (viewerRegistration?.status !== "registered") {
      throw new WorkspaceServiceError(
        "Join this assessment before viewing cohort results.",
        403,
      );
    }
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
      ...(actor.role === "admin"
        ? {
            userId: leaderboardRow.userId,
            name: leaderboardRow.name,
            email: leaderboardRow.email,
          }
        : {
            candidateLabel:
              leaderboardRow.userId === actor.id
                ? "You"
                : `Candidate ${String(Number(leaderboardRow.rank)).padStart(2, "0")}`,
          }),
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

export async function joinWorkspaceByCode(
  actor: WorkspaceActor,
  codeInput: string,
) {
  if (actor.role !== "jobseeker") {
    throw new WorkspaceServiceError("Job seeker access required.", 403);
  }

  const code = normalizeWorkspaceCode(codeInput);
  const row = await prisma.workspace.findUnique({
    where: { code },
    select: { id: true },
  });
  if (row) await syncWorkspaceLifecycle(row.id);
  return prisma.$transaction(async (tx) => {
    const locked = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM "Workspace" WHERE "code" = ${code} FOR UPDATE
    `;
    const workspaceId = locked[0]?.id;
    if (!workspaceId)
      throw new WorkspaceServiceError("Workspace not found.", 404);

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
      throw new WorkspaceServiceError(
        "You were removed from this workspace. Contact the workspace admin.",
        403,
      );
    }

    const user = await tx.user.findUnique({
      where: { id: actor.id },
      select: { email: true },
    });
    if (!user) throw new WorkspaceServiceError("User not found.", 404);

    let acceptedInvitationId: string | null = null;
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
        throw new WorkspaceServiceError(
          "This workspace is invite-only. Your email is not on the allowlist.",
          403,
        );
      }
      acceptedInvitationId = allowed.id;
    }

    try {
      const registration = await tx.workspaceRegistration.create({
        data: {
          workspaceId,
          userId: actor.id,
        },
      });
      if (acceptedInvitationId) {
        await tx.workspaceAllowedEmail.update({
          where: { id: acceptedInvitationId },
          data: { deliveryStatus: "accepted", acceptedAt: new Date() },
        });
      }
      return registration;
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === "P2002"
      ) {
        const current = await tx.workspaceRegistration.findUnique({
          where: { workspaceId_userId: { workspaceId, userId: actor.id } },
        });
        if (current) return current;
      }
      throw err;
    }
  });
}

export async function listWorkspaceRegistrations(
  actor: WorkspaceActor,
  workspaceId: string,
) {
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
      workspace: {
        select: {
          targetRole: true,
          hiringRubric: true,
          rounds: {
            orderBy: { order: "asc" },
            select: { id: true, order: true, name: true, type: true },
          },
        },
      },
    },
  });
}

export async function getWorkspaceCandidateDossier(
  actor: WorkspaceActor,
  workspaceId: string,
  userId: string,
  access: "manager" | "self" = "manager",
) {
  if (access === "self") {
    if (actor.role !== "jobseeker" || actor.id !== userId) {
      throw new WorkspaceServiceError("Candidate access required.", 403);
    }
    const ownRegistration = await prisma.workspaceRegistration.findUnique({
      where: { workspaceId_userId: { workspaceId, userId } },
      select: {
        status: true,
        workspace: { select: { status: true } },
      },
    });
    if (!ownRegistration || ownRegistration.status !== "registered") {
      throw new WorkspaceServiceError("Workspace registration not found.", 404);
    }
    if (ownRegistration.workspace.status === "draft") {
      throw new WorkspaceServiceError(
        "Workspace reports are not available.",
        409,
      );
    }
  } else {
    await assertCanManageWorkspace(actor, workspaceId);
  }
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
      workspace: {
        select: {
          targetRole: true,
          hiringRubric: true,
          rounds: {
            orderBy: { order: "asc" },
            select: { id: true, order: true, name: true, type: true },
          },
        },
      },
      roundAttempts: {
        orderBy: { createdAt: "asc" },
        include: {
          workspaceRound: {
            select: {
              id: true,
              order: true,
              name: true,
              type: true,
              scoreWeightage: true,
            },
          },
          placementReadinessHandoff: {
            select: {
              id: true,
              status: true,
              placementSessionId: true,
              lastError: true,
              launchPayload: true,
              updatedAt: true,
              artifact: {
                select: {
                  id: true,
                  schemaVersion: true,
                  reportHash: true,
                  placementSessionId: true,
                  artifact: true,
                  receivedAt: true,
                },
              },
            },
          },
        },
      },
    },
  });
  if (!registration)
    throw new WorkspaceServiceError("Workspace registration not found.", 404);

  const workspaceDsaAttempt = [...registration.roundAttempts]
    .filter(
      (attempt) => attempt.roundType === "coding" && attempt.dsaRoundSessionId,
    )
    .sort(
      (left, right) =>
        (right.completedAt?.getTime() ?? 0) -
        (left.completedAt?.getTime() ?? 0),
    )[0];
  const workspaceAptitudeAttempt = [...registration.roundAttempts]
    .filter((attempt) => attempt.roundType === "mcq" && attempt.mcqSessionId)
    .sort(
      (left, right) =>
        (right.completedAt?.getTime() ?? 0) -
        (left.completedAt?.getTime() ?? 0),
    )[0];
  const workspaceSqlAttempt = [...registration.roundAttempts]
    .filter((attempt) => attempt.roundType === "sql" && attempt.sqlSessionId)
    .sort(
      (left, right) =>
        (right.completedAt?.getTime() ?? 0) -
        (left.completedAt?.getTime() ?? 0),
    )[0];

  const [
    antigravityReports,
    workspaceDsaSubmissions,
    workspaceMcqSession,
    workspaceSqlSession,
    reportGenerations,
  ] = await Promise.all([
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
          where: {
            roundSessionId: workspaceDsaAttempt.dsaRoundSessionId,
            isOfficial: true,
          },
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
    workspaceSqlAttempt?.sqlSessionId
      ? prisma.workspaceSqlSession.findUnique({
          where: { id: workspaceSqlAttempt.sqlSessionId },
          select: {
            id: true,
            tasks: true,
            startTime: true,
            endTime: true,
            submittedAt: true,
            finalizedAt: true,
            score: true,
            passedCount: true,
            totalCount: true,
            submissions: {
              where: { isOfficial: true },
              orderBy: { submittedAt: "asc" },
              select: {
                id: true,
                taskId: true,
                query: true,
                passedCount: true,
                totalCount: true,
                score: true,
                results: true,
                submittedAt: true,
              },
            },
          },
        })
      : Promise.resolve(null),
    prisma.assessmentReportGeneration.findMany({
      where: { workspaceId, userId, status: "complete" },
      orderBy: { completedAt: "desc" },
      take: 10,
      select: {
        id: true,
        reportKind: true,
        promptVersion: true,
        model: true,
        result: true,
        usage: true,
        estimatedCostUsd: true,
        completedAt: true,
        sourceHash: true,
      },
    }),
  ]);
  const workspaceAptitudeEvidence = workspaceMcqSession
    ? (() => {
        const questions = Array.isArray(workspaceMcqSession.questions)
          ? workspaceMcqSession.questions
          : [];
        const answerKey =
          workspaceMcqSession.answerKey &&
          typeof workspaceMcqSession.answerKey === "object" &&
          !Array.isArray(workspaceMcqSession.answerKey)
            ? (workspaceMcqSession.answerKey as Record<string, unknown>)
            : {};
        const answers =
          workspaceMcqSession.answers &&
          typeof workspaceMcqSession.answers === "object" &&
          !Array.isArray(workspaceMcqSession.answers)
            ? (workspaceMcqSession.answers as Record<string, unknown>)
            : {};
        const questionReview = questions.map((raw, index) => {
          const question =
            raw && typeof raw === "object" && !Array.isArray(raw)
              ? (raw as Record<string, unknown>)
              : {};
          const id = String(question.id ?? index);
          const selectedAnswer =
            typeof answers[id] === "string" ? String(answers[id]) : "";
          const correctAnswer =
            typeof answerKey[id] === "string" ? String(answerKey[id]) : "";
          return {
            id,
            question: String(
              question.question ?? "Question text was not retained.",
            ),
            options: Array.isArray(question.options)
              ? question.options.map(String)
              : [],
            selectedAnswer: selectedAnswer || null,
            correctAnswer,
            outcome: !selectedAnswer
              ? "skipped"
              : selectedAnswer.trim().toLowerCase() ===
                  correctAnswer.trim().toLowerCase()
                ? "correct"
                : "incorrect",
            marks: Number(question.marks ?? 1),
            domain:
              typeof question.domain === "string" && question.domain.trim()
                ? question.domain.trim()
                : null,
            difficulty:
              typeof question.difficulty === "string" &&
              question.difficulty.trim()
                ? question.difficulty.trim()
                : null,
          };
        });
        const categoryLedger = new Map<
          string,
          { correctMarks: number; totalMarks: number; questions: number }
        >();
        for (const item of questionReview) {
          if (!item.domain) continue;
          const current = categoryLedger.get(item.domain) ?? {
            correctMarks: 0,
            totalMarks: 0,
            questions: 0,
          };
          current.totalMarks += Math.max(0, item.marks);
          current.questions += 1;
          if (item.outcome === "correct")
            current.correctMarks += Math.max(0, item.marks);
          categoryLedger.set(item.domain, current);
        }
        return {
          sessionId: workspaceMcqSession.id,
          score: workspaceAptitudeAttempt?.percentageScore ?? null,
          completedAt:
            workspaceAptitudeAttempt?.completedAt ??
            workspaceMcqSession.finalizedAt,
          totalQuestions: questions.length,
          correct: workspaceMcqSession.correctCount,
          incorrect: workspaceMcqSession.incorrectCount,
          skipped: workspaceMcqSession.skippedCount,
          timeTakenSeconds: Math.max(
            0,
            Math.round(
              ((
                workspaceMcqSession.finalizedAt ??
                workspaceMcqSession.submittedAt ??
                workspaceMcqSession.endTime
              ).getTime() -
                workspaceMcqSession.startTime.getTime()) /
                1000,
            ),
          ),
          timeLimitSeconds: Math.max(
            0,
            Math.round(
              (workspaceMcqSession.endTime.getTime() -
                workspaceMcqSession.startTime.getTime()) /
                1000,
            ),
          ),
          questionReview,
          categories: Array.from(categoryLedger.entries()).map(
            ([name, category]) => ({
              name,
              questions: category.questions,
              score: category.totalMarks
                ? Math.round(
                    (category.correctMarks / category.totalMarks) * 100,
                  )
                : 0,
            }),
          ),
        };
      })()
    : null;
  const dsaQuestions = workspaceDsaSubmissions.length
    ? await prisma.dsaQuestion.findMany({
        where: {
          id: {
            in: workspaceDsaSubmissions.map(
              (submission) => submission.questionId,
            ),
          },
        },
        select: {
          id: true,
          title: true,
          description: true,
          difficulty: true,
          examples: true,
          constraints: true,
        },
      })
    : [];
  const dsaQuestionById = new Map(
    dsaQuestions.map((question) => [question.id, question]),
  );
  const workspaceDsaEvidence = workspaceDsaAttempt?.dsaRoundSessionId
    ? {
        attemptId: workspaceDsaAttempt.id,
        roundSessionId: workspaceDsaAttempt.dsaRoundSessionId,
        score: workspaceDsaAttempt.percentageScore ?? workspaceDsaAttempt.score,
        completedAt: workspaceDsaAttempt.completedAt,
        submissions: workspaceDsaSubmissions.map((submission) => ({
          ...submission,
          question: dsaQuestionById.get(submission.questionId) ?? null,
        })),
      }
    : null;
  const aptitudeEvidenceComplete = Boolean(
    workspaceAptitudeEvidence &&
      workspaceAptitudeEvidence.totalQuestions > 0 &&
      workspaceAptitudeEvidence.questionReview.length ===
        workspaceAptitudeEvidence.totalQuestions &&
      workspaceAptitudeEvidence.questionReview.every(
        (item) =>
          item.question !== "Question text was not retained." &&
          item.correctAnswer.trim().length > 0,
      ),
  );
  const retainedJudgeRows = (value: unknown): Record<string, unknown>[] => {
    if (Array.isArray(value))
      return value.filter(
        (row): row is Record<string, unknown> =>
          Boolean(row) && typeof row === "object" && !Array.isArray(row),
      );
    if (!value || typeof value !== "object") return [];
    const nested = (value as Record<string, unknown>).results;
    return Array.isArray(nested)
      ? nested.filter(
          (row): row is Record<string, unknown> =>
            Boolean(row) && typeof row === "object" && !Array.isArray(row),
        )
      : [];
  };
  const dsaEvidenceComplete = Boolean(
    workspaceDsaEvidence?.submissions.length &&
      workspaceDsaEvidence.submissions.every((submission) => {
        const rows = retainedJudgeRows(submission.results);
        const failedRows = rows.filter((row) => row.passed === false);
        const failedRowsExplainable = failedRows.every((row) =>
          [
            row.input,
            row.expected,
            row.expectedOutput,
            row.actual,
            row.actualOutput,
            row.error,
            row.message,
          ].some((detail) => String(detail ?? "").trim().length > 0),
        );
        return Boolean(
          submission.question?.description &&
            submission.code &&
            submission.totalCount > 0 &&
            rows.length === submission.totalCount &&
            failedRowsExplainable,
        );
      }),
  );
  const sqlTasks: Record<string, unknown>[] = Array.isArray(workspaceSqlSession?.tasks)
    ? workspaceSqlSession.tasks.flatMap((task) =>
        task && typeof task === "object" && !Array.isArray(task)
          ? [task as Record<string, unknown>]
          : [],
      )
    : [];
  const sqlTaskById = new Map(
    sqlTasks.map((task, index) => [String(task.id ?? index), task]),
  );
  const workspaceSqlEvidence = workspaceSqlAttempt?.sqlSessionId && workspaceSqlSession
    ? {
        attemptId: workspaceSqlAttempt.id,
        sessionId: workspaceSqlSession.id,
        score: workspaceSqlAttempt.percentageScore ?? workspaceSqlAttempt.score,
        completedAt: workspaceSqlAttempt.completedAt ?? workspaceSqlSession.finalizedAt,
        passedCount: workspaceSqlSession.passedCount,
        totalCount: workspaceSqlSession.totalCount,
        timeTakenSeconds: Math.max(
          0,
          Math.round(
            ((workspaceSqlSession.finalizedAt ??
              workspaceSqlSession.submittedAt ??
              workspaceSqlSession.endTime).getTime() -
              workspaceSqlSession.startTime.getTime()) /
              1000,
          ),
        ),
        submissions: workspaceSqlSession.submissions.map((submission) => ({
          ...submission,
          task: sqlTaskById.get(submission.taskId) ?? null,
        })),
      }
    : null;
  const sqlEvidenceComplete = Boolean(
    workspaceSqlEvidence?.submissions.length &&
      workspaceSqlEvidence.submissions.length === sqlTasks.length &&
      workspaceSqlEvidence.submissions.every((submission) => {
        const rows = retainedJudgeRows(submission.results);
        return Boolean(
          submission.task &&
            submission.query.trim() &&
            submission.totalCount > 0 &&
            rows.length > 0,
        );
      }),
  );
  const targetRole = registration.workspace.targetRole;
  const hiringRubric =
    registration.workspace.hiringRubric &&
    typeof registration.workspace.hiringRubric === "object" &&
    !Array.isArray(registration.workspace.hiringRubric)
      ? (registration.workspace.hiringRubric as Record<string, unknown>)
      : {};
  const roleResponsibilities = Array.isArray(hiringRubric.responsibilities)
    ? hiringRubric.responsibilities.map(String).filter(Boolean)
    : [];
  const workspaceInterviewAttempt = registration.roundAttempts.find(
    (attempt) => attempt.roundType === "interview",
  );
  const boundAntigravityReport = workspaceInterviewAttempt?.interviewId
    ? (antigravityReports.find(
        (artifact) =>
          artifact.interviewId === workspaceInterviewAttempt.interviewId,
      ) ?? null)
    : null;
  const matchingAntigravityReport = boundAntigravityReport;
  const managerAntigravityReport = matchingAntigravityReport
    ? {
        ...matchingAntigravityReport,
        reportAccessToken: createAntigravityReportAccessToken(
          matchingAntigravityReport.antigravitySessionId,
          "admin",
        ),
      }
    : null;
  const antigravityEvidenceComplete = Boolean(
    boundAntigravityReport?.evidencePacket &&
      Array.isArray(boundAntigravityReport.transcript) &&
      boundAntigravityReport.transcript.length > 0,
  );
  const placementHandoff = workspaceInterviewAttempt?.placementReadinessHandoff ?? null;
  const placementArtifact = placementHandoff?.artifact ?? null;
  const placementArtifactBody =
    placementArtifact?.artifact &&
    typeof placementArtifact.artifact === "object" &&
    !Array.isArray(placementArtifact.artifact)
      ? (placementArtifact.artifact as Record<string, unknown>)
      : null;
  const placementLaunchPayload =
    placementHandoff?.launchPayload &&
    typeof placementHandoff.launchPayload === "object" &&
    !Array.isArray(placementHandoff.launchPayload)
      ? (placementHandoff.launchPayload as Record<string, unknown>)
      : {};
  const placementScore = placementArtifact
    ? workspaceInterviewAttempt?.percentageScore ??
      workspaceInterviewAttempt?.score ??
      Number(
        (placementArtifactBody?.scorecard as Record<string, unknown> | undefined)
          ?.overallScore,
      )
    : null;
  const placementCandidateId =
    typeof placementArtifactBody?.candidateId === "string" && placementArtifactBody.candidateId
      ? placementArtifactBody.candidateId
      : null;
  const placementAttemptId =
    typeof placementArtifactBody?.attemptId === "string" && placementArtifactBody.attemptId
      ? placementArtifactBody.attemptId
      : null;
  const placementReportUrl =
    placementCandidateId && placementAttemptId
      ? `${resolvePlacementWebUrl()}/reports/${encodeURIComponent(placementCandidateId)}/${encodeURIComponent(placementAttemptId)}?access_token=${encodeURIComponent(
          createPlacementReportAccessToken(placementCandidateId, placementAttemptId),
        )}`
      : null;
  const managerPlacementReport = placementArtifact
    ? {
        source: "placement_readiness" as const,
        id: placementArtifact.id,
        sessionId: placementArtifact.placementSessionId,
        schemaVersion: placementArtifact.schemaVersion,
        reportHash: placementArtifact.reportHash,
        score: Number.isFinite(Number(placementScore)) ? Number(placementScore) : null,
        report: placementArtifactBody ?? {},
        receivedAt: placementArtifact.receivedAt,
        handoffStatus: placementHandoff?.status ?? "completed",
        reportUrl: placementReportUrl,
      }
    : null;
  const workspaceInterviewLinked = Boolean(
    managerPlacementReport ||
      (workspaceInterviewAttempt?.interviewId && boundAntigravityReport),
  );
  const interviewEvidenceComplete = managerPlacementReport
    ? Boolean(managerPlacementReport.sessionId && Object.keys(managerPlacementReport.report).length)
    : antigravityEvidenceComplete;
  const configuredModules = registration.workspace.rounds.map((round) =>
    ({ mcq: "aptitude", coding: "dsa", sql: "sql", interview: "interview" })[
      round.type
    ] as ConfiguredAssessmentModule,
  );
  const synthesis = buildConfiguredCandidateAssessmentSynthesis({
    configuredModules,
    aptitude: workspaceAptitudeEvidence
      ? { score: workspaceAptitudeEvidence.score }
      : null,
    dsa: workspaceDsaEvidence ? { score: workspaceDsaEvidence.score } : null,
    sql: workspaceSqlEvidence ? { score: workspaceSqlEvidence.score } : null,
    interview: managerPlacementReport
      ? {
          score: managerPlacementReport.score,
          report: managerPlacementReport.report,
          artifactRole: String(placementLaunchPayload.target_role || targetRole),
        }
      : matchingAntigravityReport
        ? {
            score: scorePercent(matchingAntigravityReport.overallScore, "ten"),
            report: matchingAntigravityReport.report,
            artifactRole: matchingAntigravityReport.interview?.jobRole,
          }
        : null,
    targetRole,
    roleResponsibilities,
    workspaceInterviewLinked,
    evidenceComplete: {
      aptitude: aptitudeEvidenceComplete,
      dsa: dsaEvidenceComplete,
      sql: sqlEvidenceComplete,
      interview: interviewEvidenceComplete,
    },
  });
  const recordedDecision = await prisma.workspaceCandidateDecision.findUnique({
    where: {
      workspaceId_candidateUserId: { workspaceId, candidateUserId: userId },
    },
    include: {
      reviewer: { select: { id: true, name: true, email: true } },
    },
  });

  const dossier = {
    schemaVersion: "workspace_candidate_dossier_v2_configured_rounds",
    workspaceId,
    candidate: registration.user,
    registration: {
      id: registration.id,
      status: registration.status,
      registeredAt: registration.registeredAt,
      roundAttempts: registration.roundAttempts,
    },
    synthesis,
    recordedDecision,
    agentReports: {
      dsa:
        reportGenerations.find(
          (generation) => generation.reportKind === "dsa",
        ) ?? null,
      unified:
        reportGenerations.find(
          (generation) => generation.reportKind === "unified",
        ) ?? null,
    },
    modules: {
      aptitude: {
        latest: null,
        history: [],
        workspaceEvidence: workspaceAptitudeEvidence,
      },
      dsa: {
        latest: null,
        history: [],
        workspaceEvidence: workspaceDsaEvidence,
      },
      sql: {
        latest: null,
        history: [],
        workspaceEvidence: workspaceSqlEvidence,
      },
      interview: {
        latest: managerPlacementReport,
        status: placementHandoff?.status ?? (managerAntigravityReport ? "completed" : "not_started"),
        lastError: placementHandoff?.lastError ?? null,
        legacyAntigravity: managerAntigravityReport,
      },
      antigravity: {
        latest: managerAntigravityReport,
        history: antigravityReports,
      },
    },
  };
  const currentDsaReportHash = assessmentEvidenceHash("dsa", dossier);
  const currentUnifiedReportHash = assessmentEvidenceHash("unified", dossier);
  dossier.agentReports = {
    dsa:
      reportGenerations.find(
        (generation) =>
          generation.reportKind === "dsa" &&
          generation.sourceHash === currentDsaReportHash,
      ) ?? null,
    unified:
      reportGenerations.find(
        (generation) =>
          generation.reportKind === "unified" &&
          generation.sourceHash === currentUnifiedReportHash,
      ) ?? null,
  };
  if (access === "manager") return dossier;

  const candidateAntigravityReport = matchingAntigravityReport
    ? {
        ...sanitizeAntigravityReportForCandidate(matchingAntigravityReport),
        reportAccessToken: createAntigravityReportAccessToken(
          matchingAntigravityReport.antigravitySessionId,
          "candidate",
        ),
      }
    : null;
  const candidatePlacementReport = managerPlacementReport
    ? {
        ...managerPlacementReport,
        report: sanitizePlacementReportForCandidate(
          managerPlacementReport.report,
        ),
      }
    : null;

  return {
    ...dossier,
    synthesis: {
      ...synthesis,
      recommendation: "COACHING EVIDENCE READY",
      decisionStatus: undefined,
      decisionGates: [],
      evidenceBasis: {
        ...synthesis.evidenceBasis,
        antigravityVerdict: null,
      },
    },
    recordedDecision: null,
    agentReports: {
      dsa: sanitizeAssessmentGenerationForCandidate(
        dossier.agentReports.dsa,
        "dsa",
      ),
      unified: sanitizeAssessmentGenerationForCandidate(
        dossier.agentReports.unified,
        "unified",
      ),
    },
    modules: {
      ...dossier.modules,
      aptitude: {
        latest: null,
        history: [],
        workspaceEvidence: dossier.modules.aptitude.workspaceEvidence,
      },
      dsa: {
        latest: null,
        history: [],
        workspaceEvidence: dossier.modules.dsa.workspaceEvidence
          ? sanitizeDsaWorkspaceEvidenceForCandidate(
              dossier.modules.dsa.workspaceEvidence,
            )
          : null,
      },
      sql: {
        latest: null,
        history: [],
        workspaceEvidence: dossier.modules.sql.workspaceEvidence
          ? {
              ...dossier.modules.sql.workspaceEvidence,
              submissions: dossier.modules.sql.workspaceEvidence.submissions.map(
                ({ results: _results, ...submission }) => submission,
              ),
            }
          : null,
      },
      interview: {
        ...dossier.modules.interview,
        latest: candidatePlacementReport,
        legacyAntigravity: candidateAntigravityReport,
      },
      antigravity: {
        latest: candidateAntigravityReport,
        history: [],
      },
    },
  };
}

export async function getMyWorkspaceCandidateDossier(
  actor: WorkspaceActor,
  codeInput: string,
) {
  const code = codeInput.trim().toUpperCase();
  const workspace = await prisma.workspace.findUnique({
    where: { code },
    select: { id: true },
  });
  if (!workspace) throw new WorkspaceServiceError("Workspace not found.", 404);
  return getWorkspaceCandidateDossier(actor, workspace.id, actor.id, "self");
}

export type WorkspaceDecisionInput = {
  outcome: "advance" | "hold" | "reject" | "additional_evidence";
  rationale: string;
  rubricAssessments: Array<{
    responsibility: string;
    rating: "meets" | "partial" | "not_demonstrated" | "conflicting";
    rationale: string;
    evidenceRefs: string[];
  }>;
};

export async function recordWorkspaceCandidateDecision(
  actor: WorkspaceActor,
  workspaceId: string,
  userId: string,
  input: WorkspaceDecisionInput,
) {
  const dossier = await getWorkspaceCandidateDossier(
    actor,
    workspaceId,
    userId,
  );
  if (dossier.synthesis.integrity.status !== "verified") {
    throw new WorkspaceServiceError(
      "Decision recording is blocked until candidate, workspace, session, and role binding is verified.",
      409,
    );
  }
  if (
    dossier.synthesis.completedModules !== dossier.synthesis.requiredModules.length
  ) {
    throw new WorkspaceServiceError(
      "Decision recording requires every configured assessment module.",
      409,
    );
  }
  if (dossier.synthesis.decisionStatus !== "human_review_required") {
    throw new WorkspaceServiceError(
      "Decision recording is blocked until every module has complete, auditable evidence.",
      409,
    );
  }
  const responsibilities = dossier.synthesis.roleRubric.responsibilities;
  if (responsibilities.length < 3) {
    throw new WorkspaceServiceError(
      "Configure an employer-approved role rubric before recording a decision.",
      409,
    );
  }
  const expected = new Set(
    responsibilities.map((item) => item.trim().toLowerCase()),
  );
  const received = new Set(
    input.rubricAssessments.map((item) =>
      item.responsibility.trim().toLowerCase(),
    ),
  );
  if (
    expected.size !== received.size ||
    [...expected].some((item) => !received.has(item))
  ) {
    throw new WorkspaceServiceError(
      "Every configured role responsibility must have exactly one evidence assessment.",
      400,
    );
  }
  if (input.rubricAssessments.some((item) => item.evidenceRefs.length === 0)) {
    throw new WorkspaceServiceError(
      "Each responsibility assessment must cite at least one evidence reference.",
      400,
    );
  }

  const evidenceSnapshot = {
    schemaVersion: "workspace_decision_evidence_v1",
    synthesisVersion: dossier.synthesis.schemaVersion,
    evidenceBasis: dossier.synthesis.evidenceBasis,
    integrity: dossier.synthesis.integrity,
    roundAttempts: dossier.registration.roundAttempts.map((attempt) => ({
      id: attempt.id,
      type: attempt.roundType,
      status: attempt.status,
      score: attempt.percentageScore ?? attempt.score ?? null,
      completedAt: attempt.completedAt ?? null,
    })),
    interview: dossier.modules.interview.latest
      ? {
          source: dossier.modules.interview.latest.source,
          id: dossier.modules.interview.latest.id,
          sessionId: dossier.modules.interview.latest.sessionId,
          reportHash: dossier.modules.interview.latest.reportHash,
        }
      : null,
    antigravity: dossier.modules.antigravity.latest
      ? {
          id: dossier.modules.antigravity.latest.id,
          interviewId:
            "interviewId" in dossier.modules.antigravity.latest
              ? dossier.modules.antigravity.latest.interviewId
              : null,
          sessionId: dossier.modules.antigravity.latest.antigravitySessionId,
          reportHash:
            "reportHash" in dossier.modules.antigravity.latest
              ? dossier.modules.antigravity.latest.reportHash
              : null,
        }
      : null,
  };
  const evidenceHash = crypto
    .createHash("sha256")
    .update(JSON.stringify(evidenceSnapshot))
    .digest("hex");
  const rubricSnapshot = {
    schemaVersion: "workspace_hiring_rubric_v1",
    targetRole: dossier.synthesis.roleRubric.targetRole,
    responsibilities,
  };

  return prisma.workspaceCandidateDecision.upsert({
    where: {
      workspaceId_candidateUserId: { workspaceId, candidateUserId: userId },
    },
    create: {
      workspaceId,
      candidateUserId: userId,
      reviewerUserId: actor.id,
      outcome: input.outcome,
      rationale: input.rationale,
      rubricAssessments: input.rubricAssessments as Prisma.InputJsonValue,
      rubricSnapshot: rubricSnapshot as Prisma.InputJsonValue,
      evidenceSnapshot: evidenceSnapshot as Prisma.InputJsonValue,
      evidenceHash,
    },
    update: {
      reviewerUserId: actor.id,
      outcome: input.outcome,
      rationale: input.rationale,
      rubricAssessments: input.rubricAssessments as Prisma.InputJsonValue,
      rubricSnapshot: rubricSnapshot as Prisma.InputJsonValue,
      evidenceSnapshot: evidenceSnapshot as Prisma.InputJsonValue,
      evidenceHash,
    },
    include: {
      reviewer: { select: { id: true, name: true, email: true } },
    },
  });
}

export async function removeWorkspaceRegistration(
  actor: WorkspaceActor,
  workspaceId: string,
  userId: string,
) {
  await assertCanManageWorkspace(actor, workspaceId);
  const registration = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`workspace_registration:${workspaceId}:${userId}`}))`;
    const existing = await tx.workspaceRegistration.findUnique({
      where: { workspaceId_userId: { workspaceId, userId } },
    });
    if (!existing)
      throw new WorkspaceServiceError("Workspace registration not found.", 404);
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
  await recordWorkspaceAuditEvent({
    workspaceId,
    actorUserId: actor.id,
    eventType: "registration.removed",
    targetUserId: userId,
    detail: { registrationId: registration.id, removedAt: registration.removedAt },
  });
  if (registration.removedAt) {
    const details = await prisma.workspaceRegistration.findUnique({
      where: { id: registration.id },
      include: {
        workspace: { select: { name: true, organization: true } },
        user: {
          select: {
            email: true,
            name: true,
            jobSeekerProfile: { select: { fullName: true } },
          },
        },
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
        console.warn(
          "[workspace/remove-registration] email failed:",
          err instanceof Error ? err.message : err,
        );
      });
    }
  }
  return registration;
}

export async function restoreWorkspaceRegistration(
  actor: WorkspaceActor,
  workspaceId: string,
  userId: string,
) {
  await assertCanManageWorkspace(actor, workspaceId);
  const registration = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`workspace_registration:${workspaceId}:${userId}`}))`;
    const existing = await tx.workspaceRegistration.findUnique({
      where: { workspaceId_userId: { workspaceId, userId } },
    });
    if (!existing)
      throw new WorkspaceServiceError("Workspace registration not found.", 404);
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
  await recordWorkspaceAuditEvent({
    workspaceId,
    actorUserId: actor.id,
    eventType: "registration.restored",
    targetUserId: userId,
    detail: { registrationId: registration.id, restoredAt: registration.restoredAt },
  });
  return registration;
}

export async function listWorkspaceMembers(
  actor: WorkspaceActor,
  workspaceId: string,
) {
  await assertCanReviewWorkspace(actor, workspaceId);
  const workspace = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: { ownerUserId: true },
  });
  if (!workspace) throw new WorkspaceServiceError("Workspace not found.", 404);

  const members = await prisma.workspaceMember.findMany({
    where: { workspaceId, removedAt: null },
    orderBy: { createdAt: "asc" },
    include: { user: { select: { id: true, name: true, email: true } } },
  });

  return members.map((member) => ({
    id: member.id,
    userId: member.userId,
    name: member.user.name,
    email: member.user.email,
    role: member.role,
    isPrimaryOwner: member.userId === workspace.ownerUserId,
    createdAt: member.createdAt,
  }));
}

export async function addWorkspaceMember(input: {
  actor: WorkspaceActor;
  workspaceId: string;
  email: string;
  role: "owner" | "manager" | "reviewer";
}) {
  const workspace = await prisma.workspace.findUnique({
    where: { id: input.workspaceId },
    select: { id: true, ownerUserId: true },
  });
  if (!workspace) throw new WorkspaceServiceError("Workspace not found.", 404);

  // Only the primary owner or another active 'owner' member may add members or
  // grant the 'owner' role; managers may not escalate themselves or others.
  const isPrimaryOwner = workspace.ownerUserId === input.actor.id;
  const actorMemberRole = isPrimaryOwner
    ? "owner"
    : await getActiveWorkspaceMemberRole(input.workspaceId, input.actor.id);
  const actorIsPlatformAdmin = input.actor.role === "admin";
  if (!actorIsPlatformAdmin && actorMemberRole !== "owner") {
    throw new WorkspaceServiceError(
      "Only a workspace owner can add or manage members.",
      403,
    );
  }

  const email = normalizeEmail(input.email);
  if (!isValidEmail(email)) {
    throw new WorkspaceServiceError("Invalid member email.", 400);
  }
  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, role: true },
  });
  if (!user) {
    throw new WorkspaceServiceError(
      "No ProvenHire account exists for that email yet. The person must sign up first.",
      404,
    );
  }
  if (!["recruiter", "admin"].includes(user.role)) {
    throw new WorkspaceServiceError(
      "Only recruiter or admin accounts can be added as workspace members.",
      400,
    );
  }

  const member = await prisma.workspaceMember.upsert({
    where: {
      workspaceId_userId: { workspaceId: input.workspaceId, userId: user.id },
    },
    create: {
      workspaceId: input.workspaceId,
      userId: user.id,
      role: input.role,
      invitedByUserId: input.actor.id,
    },
    update: {
      role: input.role,
      removedAt: null,
      removedByUserId: null,
    },
  });

  await recordWorkspaceAuditEvent({
    workspaceId: input.workspaceId,
    actorUserId: input.actor.id,
    eventType: "member.added",
    targetUserId: user.id,
    targetEmail: email,
    detail: { role: input.role },
  });

  return listWorkspaceMembers(input.actor, input.workspaceId);
}

export async function removeWorkspaceMember(input: {
  actor: WorkspaceActor;
  workspaceId: string;
  memberUserId: string;
}) {
  const workspace = await prisma.workspace.findUnique({
    where: { id: input.workspaceId },
    select: { id: true, ownerUserId: true },
  });
  if (!workspace) throw new WorkspaceServiceError("Workspace not found.", 404);

  const isPrimaryOwner = workspace.ownerUserId === input.actor.id;
  const actorMemberRole = isPrimaryOwner
    ? "owner"
    : await getActiveWorkspaceMemberRole(input.workspaceId, input.actor.id);
  if (input.actor.role !== "admin" && actorMemberRole !== "owner") {
    throw new WorkspaceServiceError(
      "Only a workspace owner can remove members.",
      403,
    );
  }
  if (workspace.ownerUserId === input.memberUserId) {
    throw new WorkspaceServiceError(
      "The primary owner cannot be removed. Transfer ownership first.",
      409,
    );
  }

  const membership = await prisma.workspaceMember.findUnique({
    where: {
      workspaceId_userId: {
        workspaceId: input.workspaceId,
        userId: input.memberUserId,
      },
    },
  });
  if (!membership || membership.removedAt) {
    throw new WorkspaceServiceError("Workspace member not found.", 404);
  }

  await prisma.workspaceMember.update({
    where: { id: membership.id },
    data: { removedAt: new Date(), removedByUserId: input.actor.id },
  });

  await recordWorkspaceAuditEvent({
    workspaceId: input.workspaceId,
    actorUserId: input.actor.id,
    eventType: "member.removed",
    targetUserId: input.memberUserId,
  });

  return listWorkspaceMembers(input.actor, input.workspaceId);
}

export async function transferWorkspaceOwnership(input: {
  actor: WorkspaceActor;
  workspaceId: string;
  newOwnerUserId: string;
}) {
  const workspace = await prisma.workspace.findUnique({
    where: { id: input.workspaceId },
    select: { id: true, ownerUserId: true },
  });
  if (!workspace) throw new WorkspaceServiceError("Workspace not found.", 404);

  if (input.actor.role !== "admin" && workspace.ownerUserId !== input.actor.id) {
    throw new WorkspaceServiceError(
      "Only the current owner can transfer ownership.",
      403,
    );
  }
  if (workspace.ownerUserId === input.newOwnerUserId) {
    return listWorkspaceMembers(input.actor, input.workspaceId);
  }

  const newOwner = await prisma.user.findUnique({
    where: { id: input.newOwnerUserId },
    select: { id: true, role: true },
  });
  if (!newOwner || !["recruiter", "admin"].includes(newOwner.role)) {
    throw new WorkspaceServiceError(
      "The new owner must be an existing recruiter or admin account.",
      400,
    );
  }

  await prisma.$transaction(async (tx) => {
    await tx.workspace.update({
      where: { id: input.workspaceId },
      data: { ownerUserId: input.newOwnerUserId },
    });
    await tx.workspaceMember.upsert({
      where: {
        workspaceId_userId: {
          workspaceId: input.workspaceId,
          userId: input.newOwnerUserId,
        },
      },
      create: {
        workspaceId: input.workspaceId,
        userId: input.newOwnerUserId,
        role: "owner",
        invitedByUserId: input.actor.id,
      },
      update: { role: "owner", removedAt: null, removedByUserId: null },
    });
    // The previous owner keeps management access as a 'manager' rather than
    // being silently locked out of a workspace they built.
    await tx.workspaceMember.upsert({
      where: {
        workspaceId_userId: {
          workspaceId: input.workspaceId,
          userId: workspace.ownerUserId,
        },
      },
      create: {
        workspaceId: input.workspaceId,
        userId: workspace.ownerUserId,
        role: "manager",
        invitedByUserId: input.actor.id,
      },
      update: { role: "manager" },
    });
  });

  await recordWorkspaceAuditEvent({
    workspaceId: input.workspaceId,
    actorUserId: input.actor.id,
    eventType: "ownership.transferred",
    targetUserId: input.newOwnerUserId,
    detail: { previousOwnerUserId: workspace.ownerUserId },
  });

  return listWorkspaceMembers(input.actor, input.workspaceId);
}

export async function listAllowedWorkspaceEmails(
  actor: WorkspaceActor,
  workspaceId: string,
) {
  await assertCanManageWorkspace(actor, workspaceId);
  return prisma.workspaceAllowedEmail.findMany({
    where: { workspaceId },
    orderBy: { createdAt: "desc" },
  });
}

export async function listWorkspaceAuditTrail(
  actor: WorkspaceActor,
  workspaceId: string,
) {
  await assertCanManageWorkspace(actor, workspaceId);
  return listWorkspaceAuditEvents(workspaceId);
}

async function deliverWorkspaceInvitationEmail(params: {
  workspaceId: string;
  email: string;
  workspaceName: string;
  organization: string;
  code: string;
  startAt: Date;
}) {
  try {
    await sendWorkspaceInvitationEmail({
      to: params.email,
      workspaceName: params.workspaceName,
      organization: params.organization,
      code: params.code,
      startsAt: params.startAt,
      eventKey: `workspace-invitation:${params.workspaceId}:${params.email}`,
    });
    await prisma.workspaceAllowedEmail.updateMany({
      where: { workspaceId: params.workspaceId, email: params.email },
      data: { deliveryStatus: "sent", sentAt: new Date(), deliveryError: null },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn("[workspace/invitation] email failed", {
      workspaceId: params.workspaceId,
      email: params.email,
      error: message,
    });
    await prisma.workspaceAllowedEmail.updateMany({
      where: { workspaceId: params.workspaceId, email: params.email },
      data: { deliveryStatus: "failed", deliveryError: message.slice(0, 500) },
    });
  }
}

export async function addAllowedWorkspaceEmails(input: {
  actor: WorkspaceActor;
  workspaceId: string;
  emails: string[];
}) {
  await assertCanManageWorkspace(input.actor, input.workspaceId);
  const normalized = [...new Set(input.emails.map(normalizeEmail))];
  const invalid = normalized.filter((email) => !isValidEmail(email));
  if (invalid.length) {
    throw new WorkspaceServiceError(
      `Invalid invitation email${invalid.length === 1 ? "" : "s"}: ${invalid.slice(0, 5).join(", ")}`,
      400,
    );
  }
  if (!normalized.length) {
    throw new WorkspaceServiceError("At least one invitation email is required.", 400);
  }
  const workspace = await prisma.workspace.findUnique({
    where: { id: input.workspaceId },
    select: { name: true, organization: true, code: true, startAt: true, accessMode: true },
  });
  if (!workspace) throw new WorkspaceServiceError("Workspace not found.", 404);
  if (workspace.accessMode !== "invite_only") {
    throw new WorkspaceServiceError("Invitations are only used by invite-only workspaces.", 409);
  }
  const existing = await prisma.workspaceAllowedEmail.findMany({
    where: { workspaceId: input.workspaceId, email: { in: normalized } },
    select: { email: true },
  });
  const existingSet = new Set(existing.map((row) => row.email));
  const added = normalized.filter((email) => !existingSet.has(email));
  if (added.length) {
    await prisma.workspaceAllowedEmail.createMany({
      data: added.map((email) => ({ workspaceId: input.workspaceId, email })),
      skipDuplicates: true,
    });
  }
  await Promise.all(
    added.map(async (email) => {
      await recordWorkspaceAuditEvent({
        workspaceId: input.workspaceId,
        actorUserId: input.actor.id,
        eventType: "invitation.created",
        targetEmail: email,
      });
      await deliverWorkspaceInvitationEmail({
        workspaceId: input.workspaceId,
        email,
        workspaceName: workspace.name,
        organization: workspace.organization,
        code: workspace.code,
        startAt: workspace.startAt,
      });
    }),
  );
  return {
    requested: normalized.length,
    added: added.length,
    alreadyPresent: existing.length,
    invitations: await listAllowedWorkspaceEmails(input.actor, input.workspaceId),
  };
}

export async function revokeAllowedWorkspaceEmail(input: {
  actor: WorkspaceActor;
  workspaceId: string;
  invitationId: string;
}) {
  await assertCanManageWorkspace(input.actor, input.workspaceId);
  const invitation = await prisma.workspaceAllowedEmail.findFirst({
    where: { id: input.invitationId, workspaceId: input.workspaceId },
  });
  if (!invitation) throw new WorkspaceServiceError("Invitation not found.", 404);
  await prisma.workspaceAllowedEmail.delete({ where: { id: invitation.id } });
  await recordWorkspaceAuditEvent({
    workspaceId: input.workspaceId,
    actorUserId: input.actor.id,
    eventType: "invitation.revoked",
    targetEmail: invitation.email,
  });
  return { ok: true, revokedInvitationId: invitation.id };
}

export async function importAllowedWorkspaceEmailsFromCsv(params: {
  actor: WorkspaceActor;
  workspaceCode: string;
  csvBuffer: Buffer;
}): Promise<AllowedEmailImportSummary> {
  const workspace = await assertCanManageWorkspaceByCode(
    params.actor,
    params.workspaceCode,
  );
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
    ? (
        await prisma.workspaceAllowedEmail.createMany({
          data: validEmails.map((email) => ({
            workspaceId: workspace.id,
            email,
          })),
          skipDuplicates: true,
        })
      ).count
    : 0;

  if (newEmails.length > 0) {
    const workspaceDetails = await prisma.workspace.findUnique({
      where: { id: workspace.id },
      select: { name: true, organization: true, code: true, startAt: true },
    });
    if (workspaceDetails) {
      for (const email of newEmails) {
        void deliverWorkspaceInvitationEmail({
          workspaceId: workspace.id,
          email,
          workspaceName: workspaceDetails.name,
          organization: workspaceDetails.organization,
          code: workspaceDetails.code,
          startAt: workspaceDetails.startAt,
        });
      }
    }
  }

  if (inserted > 0) {
    await recordWorkspaceAuditEvent({
      workspaceId: workspace.id,
      actorUserId: params.actor.id,
      eventType: "invitation.csv_imported",
      detail: { inserted, parsed: rawEmails.length, invalid, duplicatesInFile },
    });
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
