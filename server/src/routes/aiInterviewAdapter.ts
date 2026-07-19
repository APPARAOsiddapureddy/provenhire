/**
 * aiInterviewAdapter — Express proxy between ProvenHire and the Antigravity
 * AI Interview Engine (FastAPI).
 *
 * Routes:
 *   POST /api/ai-interview-adapter/prepare                     ← async start (returns in <2 s)
 *   GET  /api/ai-interview-adapter/prepare-status/:interviewId ← poll until map ready
 *   GET  /api/ai-interview-adapter/open                        ← resume session on page reload
 *   GET  /api/ai-interview-adapter/status/:sessionId?interviewId=<ph_id>
 *   POST /api/ai-interview-adapter/cancel
 *   POST /api/ai-interview-adapter/finalize
 */

import { Prisma } from "@prisma/client";
import crypto from "crypto";
import { Router } from "express";
import { z } from "zod";
import {
  requireAuth,
  requireJobSeeker,
  AuthedRequest,
} from "../middleware/auth.js";
import { prisma } from "../config/prisma.js";
import {
  getAntigravityApiBaseUrl,
  getAntigravityFrontendUrl,
} from "../config/antigravity.js";
import {
  gateExpertInterviewStart,
  hasCompletedDsaPrerequisite,
} from "../services/candidateRetake.service.js";
import { getCandidateModuleContext } from "../services/performancePipeline.js";
import { roleTypeToTrack } from "../constants/verificationPipeline.js";
import {
  appendAntigravityTelemetryEvent,
  persistAntigravityReportArtifact,
} from "../services/antigravityReport.service.js";
import {
  enqueueCandidateReportWorkflow,
  upsertAssessmentIncident,
} from "../services/assessmentWorkflow.service.js";
import { createAntigravityReportAccessToken } from "../services/antigravityReportAccess.service.js";

export const aiInterviewAdapterRouter = Router();

const ANTIGRAVITY_PREP_TIMEOUT_MS = 210_000;
const ANTIGRAVITY_START_TIMEOUT_MS = 30_000;
const ANTIGRAVITY_REPORT_TIMEOUT_MS = 15_000;
const HANDOFF_TOKEN_TTL_MS = 15 * 60 * 1000;

function antigravityApiUrl(): string {
  return getAntigravityApiBaseUrl();
}

function antigravityReportUrl(sessionId: string): string {
  const url = new URL(`/report/${encodeURIComponent(sessionId)}`, `${antigravityApiUrl()}/`);
  url.searchParams.set("audience", "admin");
  const token = createAntigravityReportAccessToken(sessionId, "admin", 5 * 60);
  if (token) url.searchParams.set("access_token", token);
  return url.toString();
}

function createLaunchToken(): string {
  return crypto.randomBytes(32).toString("base64url");
}

function hashLaunchToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function webhookSecret(): string {
  const secret = process.env.ANTIGRAVITY_WEBHOOK_SECRET;
  if (!secret)
    throw new Error(
      "ANTIGRAVITY_WEBHOOK_SECRET is required for Antigravity callbacks.",
    );
  return secret;
}

function signWebhookMessage(
  event: string,
  handoffId: string,
  sessionId: string,
): string {
  return crypto
    .createHmac("sha256", webhookSecret())
    .update(`${event}|${handoffId}|${sessionId}`)
    .digest("hex");
}

function timingSafeEqualHex(a: string, b: string): boolean {
  if (!/^[a-f0-9]+$/i.test(a) || !/^[a-f0-9]+$/i.test(b)) return false;
  const left = Buffer.from(a, "hex");
  const right = Buffer.from(b, "hex");
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

function verifyWebhookSignature(
  req: AuthedRequest,
  event: string,
  handoffId: string,
  sessionId: string,
): boolean {
  const signature = req.headers["x-antigravity-signature"];
  const value = Array.isArray(signature) ? signature[0] : signature;
  if (!value) return false;
  return timingSafeEqualHex(
    value,
    signWebhookMessage(event, handoffId, sessionId),
  );
}

function toPrismaJsonValue(value: unknown): Prisma.InputJsonValue {
  if (value === null) return null as unknown as Prisma.InputJsonValue;
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) =>
      item === null ? null : toPrismaJsonValue(item),
    ) as Prisma.InputJsonArray;
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .map(
        ([key, item]) =>
          [key, item === null ? null : toPrismaJsonValue(item)] as const,
      );
    return Object.fromEntries(entries) as Prisma.InputJsonObject;
  }
  return String(value);
}

// ─── Score helpers ──────────────────────────────────────────────────────────────

function mapScore(raw: number | null | undefined): number | null {
  if (raw == null) return null;
  return Math.min(100, Math.round(raw * 10));
}

function mapBadge(score: number | null): string | null {
  if (score == null) return null;
  if (score >= 90) return "Elite";
  if (score >= 75) return "Gold";
  if (score >= 60) return "Silver";
  return "Not Verified";
}

// ─── Shared finalization helper ─────────────────────────────────────────────────
// Called from /status when Antigravity reports complete. Idempotent via upsert.

type AgReport = {
  complete: boolean;
  report_ready?: boolean;
  overall_score: number | null;
  hire_recommendation: string | null;
  confidence_score?: number | null;
  summary?: string | null;
  strengths?: string[];
  risk_flags?: string[];
  untested_dimensions?: string[];
  claim_credibility_risk?: { level: string; detail: string } | null;
  scores?: Record<string, unknown>;
  failure_surface?: Record<string, number>;
  weakness_summary?: Record<string, number>;
  raw_weaknesses?: Array<{
    weakness: string;
    type: string;
    severity: string;
    attack_strategy?: string;
  }>;
  schema_version?: string;
  final_evidence_packet?: Record<string, unknown>;
  telemetry_summary?: Record<string, unknown>;
  telemetry_events?: Array<Record<string, unknown>>;
  history?: Array<Record<string, unknown>>;
  [key: string]: unknown;
};

type AntigravityLaunchPayload = AntigravityStartPayload & {
  provenhire_interview_id: string;
};

function isHandoffActive(status: string): boolean {
  return ["created", "launched", "started"].includes(status);
}

function safeReturnUrl(req: AuthedRequest, raw?: string): string {
  const fallback = `${req.protocol}://${req.get("host")}/dashboard/jobseeker/antigravity`;
  if (!raw) return fallback;
  try {
    const parsed = new URL(raw);
    const host = req.get("host");
    if (
      parsed.host === host ||
      parsed.hostname === "localhost" ||
      parsed.hostname === "127.0.0.1" ||
      parsed.hostname.endsWith("provenhire.in") ||
      parsed.hostname.endsWith(".vercel.app")
    ) {
      return parsed.toString();
    }
  } catch {
    // fall through
  }
  return fallback;
}

type AntigravityStartPayload = {
  resume: string;
  github_links: string[];
  target_role: string;
  years_experience: string;
  prior_assessment_context: Record<string, unknown>;
  prior_assessment_prompt: string;
};

type PreparedMapResponse = {
  session_id: string;
  map_status: string;
  trajectory_focus_areas?: number;
  map_validation?: Record<string, unknown>;
};

type StartInterviewResponse = {
  session_id: string;
  opening_question: string;
  sprint: number;
  sprint_name: string;
};

async function _readErrorText(res: Response): Promise<string> {
  return res
    .text()
    .then((text) => text.slice(0, 300))
    .catch(() => "");
}

async function prepareAndStartAntigravity(
  payload: AntigravityStartPayload,
): Promise<StartInterviewResponse> {
  const prepareRes = await fetch(
    `${antigravityApiUrl()}/prepare_interview_map`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(ANTIGRAVITY_PREP_TIMEOUT_MS),
    },
  );

  if (!prepareRes.ok) {
    const text = await _readErrorText(prepareRes);
    console.error(
      `[ai-interview-adapter/start] Antigravity prepare ${prepareRes.status}: ${text}`,
    );
    throw new Error("AI interview map preparation failed");
  }

  const prepared = (await prepareRes.json()) as PreparedMapResponse;
  if (!prepared.session_id || prepared.map_status !== "ready") {
    console.error(
      `[ai-interview-adapter/start] Antigravity prepare incomplete: session=${prepared.session_id ?? "none"} status=${prepared.map_status ?? "unknown"}`,
    );
    throw new Error("AI interview map was not ready");
  }

  const startRes = await fetch(`${antigravityApiUrl()}/start_interview`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prepared_session_id: prepared.session_id }),
    signal: AbortSignal.timeout(ANTIGRAVITY_START_TIMEOUT_MS),
  });

  if (!startRes.ok) {
    const text = await _readErrorText(startRes);
    console.error(
      `[ai-interview-adapter/start] Antigravity start ${startRes.status}: ${text}`,
    );
    throw new Error("AI interview engine failed to start");
  }

  return (await startRes.json()) as StartInterviewResponse;
}

async function finalizeInterview(
  interviewId: string,
  userId: string,
  agReport: AgReport,
  sessionId?: string,
  handoffId?: string,
) {
  const existingInterview = await prisma.interview.findUnique({
    where: { id: interviewId },
    select: {
      jobRole: true,
      experienceLevel: true,
      scoreBreakdown: true,
    },
  });
  const totalScore = mapScore(agReport.overall_score);
  const badgeLevel = mapBadge(totalScore);
  const verdict = agReport.hire_recommendation ?? "N/A";
  const credibilityRisk = agReport.claim_credibility_risk?.level ?? null;
  const existingBreakdown =
    (existingInterview?.scoreBreakdown as Record<string, unknown> | null) ?? {};
  const nextBreakdown = {
    ...existingBreakdown,
    antigravity_session_id:
      sessionId ??
      (typeof existingBreakdown.antigravity_session_id === "string"
        ? existingBreakdown.antigravity_session_id
        : null),
    antigravity_report: {
      schema_version: agReport.schema_version ?? "legacy_report",
      artifact_session_id: sessionId ?? null,
      summary: agReport.summary ?? null,
      strengths: agReport.strengths ?? [],
      risk_flags: agReport.risk_flags ?? [],
      untested_dimensions: agReport.untested_dimensions ?? [],
      claim_credibility_risk: agReport.claim_credibility_risk ?? null,
      scores: agReport.scores ?? {},
      failure_surface: agReport.failure_surface ?? {},
      weakness_summary: agReport.weakness_summary ?? {},
      raw_weaknesses: agReport.raw_weaknesses ?? [],
      confidence_score: agReport.confidence_score ?? null,
      overall_score: agReport.overall_score ?? null,
      hire_recommendation: agReport.hire_recommendation ?? null,
    },
  };

  if (sessionId) {
    await persistAntigravityReportArtifact({
      userId,
      interviewId,
      handoffId,
      antigravitySessionId: sessionId,
      report: agReport as Record<string, unknown>,
    });
  }

  await prisma.$transaction([
    prisma.interview.update({
      where: { id: interviewId },
      data: {
        status: "completed",
        completedAt: new Date(),
        totalScore,
        badgeLevel,
        finalVerdict: verdict,
        claimCredibilityRisk: credibilityRisk,
        scoreBreakdown: toPrismaJsonValue(nextBreakdown),
      },
    }),
    prisma.verificationStage.upsert({
      where: { userId_stageName: { userId, stageName: "expert_interview" } },
      update: { status: "pending_review", score: totalScore ?? undefined },
      create: {
        userId,
        stageName: "expert_interview",
        status: "pending_review",
        score: totalScore ?? undefined,
      },
    }),
    prisma.adminReviewQueue.upsert({
      where: { aiInterviewId: interviewId },
      update: {},
      create: {
        candidateId: userId,
        aiInterviewId: interviewId,
        status: "pending",
      },
    }),
    prisma.workspaceRoundAttempt.updateMany({
      where: {
        interviewId,
        userId,
        roundType: "interview",
        status: "active",
      },
      data: {
        status: "completed",
        score: totalScore,
        percentageScore: totalScore,
        completedAt: new Date(),
      },
    }),
  ]);

  // The browser is not part of report orchestration. Once the immutable
  // Antigravity artifact and workspace attempt are committed, enqueue the
  // crash-safe DSA + unified report pipeline in ProvenHire Postgres.
  const workspaceAttempt = await prisma.workspaceRoundAttempt.findFirst({
    where: { interviewId, userId, roundType: "interview" },
    select: { workspaceId: true },
  });
  if (workspaceAttempt && sessionId) {
    await enqueueCandidateReportWorkflow({
      workspaceId: workspaceAttempt.workspaceId,
      userId,
      interviewId,
      handoffId: handoffId ?? null,
      antigravitySessionId: sessionId,
      report: agReport as unknown as Record<string, unknown>,
    });
  }

  // Fire-and-forget: publish rich analytics to unified performance pipeline
  if (totalScore != null) {
    const pass = totalScore >= 60;
    import("../services/performancePipeline.js")
      .then(({ publishRunResult }) =>
        publishRunResult(userId, {
          module: "antigravity",
          status: "completed",
          score: totalScore,
          pass,
          targetRole: existingInterview?.jobRole ?? undefined,
          meta: {
            badge: badgeLevel,
            hireRecommendation: agReport.hire_recommendation,
            confidenceScore: agReport.confidence_score ?? null,
            summary: agReport.summary ?? null,
            breakdown:
              (agReport.scores as Record<string, number | string>) ?? {},
            failureSurface: agReport.failure_surface ?? {},
            strengths: agReport.strengths ?? [],
            riskFlags: agReport.risk_flags ?? [],
            claimCredibilityRisk: agReport.claim_credibility_risk ?? null,
            untestedDimensions: agReport.untested_dimensions ?? [],
            weaknessSummary: agReport.weakness_summary ?? {},
            rawWeaknesses: agReport.raw_weaknesses ?? [],
          },
          signals: [
            {
              competency: "EXPERT_INTERVIEW" as const,
              score: totalScore,
              pass,
            },
          ],
        }),
      )
      .catch((e) => console.warn("[pipeline/antigravity]", e));
  }

  return { totalScore, badgeLevel, verdict };
}

// ─── POST /prepare ──────────────────────────────────────────────────────────────
// Two-phase start to avoid Vercel's 30 s proxy timeout on prepare_interview_map.
// Phase 1: create the DB row, fire map build in background, return immediately (<2 s).
// Phase 2: browser polls GET /prepare-status/:interviewId every 5 s until ready.

const startSchema = z.object({
  resume: z
    .string()
    .min(50, "Resume text is too short — paste at least 50 characters"),
  github_links: z.array(z.string()).optional().default([]),
  target_role: z.string().optional().default(""),
  years_experience: z.string().optional().default(""),
});

const handoffLaunchSchema = startSchema.extend({
  return_url: z.string().trim().optional().default(""),
  workspace_attempt_id: z.string().trim().uuid().optional(),
});

aiInterviewAdapterRouter.post(
  "/handoff-launch",
  requireAuth,
  requireJobSeeker,
  async (req: AuthedRequest, res) => {
    const parsed = handoffLaunchSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.errors[0].message });
    }
    const {
      resume,
      github_links,
      target_role,
      years_experience,
      workspace_attempt_id,
    } = parsed.data;
    const userId = req.user!.id;

    const workspaceAttempt = workspace_attempt_id
      ? await prisma.workspaceRoundAttempt.findFirst({
          where: {
            id: workspace_attempt_id,
            userId,
            roundType: "interview",
            status: "active",
          },
          include: {
            workspace: {
              select: { status: true, endAt: true, targetRole: true },
            },
            workspaceRegistration: { select: { status: true } },
          },
        })
      : null;
    if (workspace_attempt_id && !workspaceAttempt) {
      return res.status(409).json({
        error:
          "This workspace interview attempt is missing, closed, or belongs to another candidate.",
      });
    }
    if (
      workspaceAttempt &&
      (workspaceAttempt.workspace.status !== "started" ||
        workspaceAttempt.workspace.endAt.getTime() <= Date.now() ||
        workspaceAttempt.workspaceRegistration.status !== "registered")
    ) {
      return res
        .status(409)
        .json({ error: "This workspace interview is no longer available." });
    }
    const boundTargetRole =
      workspaceAttempt?.workspace.targetRole ?? target_role;

    const gate = await gateExpertInterviewStart(userId);
    if (!gate.ok) {
      if (gate.body?.code === "DSA_REQUIRED") {
        return res.status(gate.status).json(gate.body);
      }
      const active = await prisma.antigravityHandoff
        .findFirst({
          where: {
            userId,
            status: { in: ["created", "launched", "started"] },
            expiresAt: { gt: new Date() },
          },
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            status: true,
            interviewId: true,
            antigravitySessionId: true,
          },
        })
        .catch(() => null);
      if (!active) return res.status(gate.status).json(gate.body);
    }

    let priorModuleContext: {
      relevantState: Record<string, unknown>;
      promptContext: string;
    };
    try {
      priorModuleContext = await getCandidateModuleContext(
        userId,
        "antigravity",
      );
    } catch {
      priorModuleContext = { relevantState: {}, promptContext: "" };
    }

    const returnUrl = safeReturnUrl(req, parsed.data.return_url);
    const expiresAt = new Date(Date.now() + HANDOFF_TOKEN_TTL_MS);
    const token = createLaunchToken();
    const launchTokenHash = hashLaunchToken(token);

    const launchPayload: AntigravityLaunchPayload = {
      resume,
      github_links,
      target_role: boundTargetRole,
      years_experience,
      prior_assessment_context: priorModuleContext.relevantState,
      prior_assessment_prompt: priorModuleContext.promptContext,
      provenhire_interview_id: "",
    };

    try {
      const result = await prisma.$transaction(async (tx) => {
        const existing = await tx.antigravityHandoff.findFirst({
          where: {
            userId,
            ...(workspace_attempt_id
              ? {
                  interview: {
                    workspaceRoundAttempt: { id: workspace_attempt_id },
                  },
                }
              : { interview: { workspaceRoundAttempt: null } }),
            status: { in: ["created", "launched", "started"] },
            expiresAt: { gt: new Date() },
          },
          orderBy: { createdAt: "desc" },
          include: { interview: { select: { id: true, status: true } } },
        });

        if (existing && isHandoffActive(existing.status)) {
          const updated = await tx.antigravityHandoff.update({
            where: { id: existing.id },
            data: {
              launchTokenHash,
              expiresAt,
              returnUrl,
              launchPayload: toPrismaJsonValue({
                ...(existing.launchPayload as Record<string, unknown>),
                prior_assessment_context: priorModuleContext.relevantState,
                prior_assessment_prompt: priorModuleContext.promptContext,
              }),
            },
            select: {
              id: true,
              interviewId: true,
              status: true,
              antigravitySessionId: true,
            },
          });
          return updated;
        }

        const interview = await tx.interview.create({
          data: {
            userId,
            jobRole: boundTargetRole || "General",
            interviewType: "ai_expert",
            experienceLevel: years_experience || "mid",
            status: "in_progress",
            questionPlan: [],
            scoreBreakdown: toPrismaJsonValue({
              handoff_status: "created",
              prepare_status: "handoff_created",
              handoff_created_at: new Date().toISOString(),
            }),
          },
          select: { id: true },
        });

        if (workspace_attempt_id) {
          const bound = await tx.workspaceRoundAttempt.updateMany({
            where: {
              id: workspace_attempt_id,
              userId,
              status: "active",
              interviewId: null,
            },
            data: { interviewId: interview.id },
          });
          if (bound.count !== 1) {
            throw new Error("Workspace interview attempt was already bound.");
          }
        }

        launchPayload.provenhire_interview_id = interview.id;
        return tx.antigravityHandoff.create({
          data: {
            userId,
            interviewId: interview.id,
            launchTokenHash,
            status: "created",
            returnUrl,
            launchPayload: toPrismaJsonValue(launchPayload),
            expiresAt,
          },
          select: {
            id: true,
            interviewId: true,
            status: true,
            antigravitySessionId: true,
          },
        });
      });

      const finalReturnUrl = new URL(returnUrl);
      finalReturnUrl.searchParams.set("handoff_id", result.id);
      finalReturnUrl.searchParams.set(
        "provenhire_interview_id",
        result.interviewId,
      );
      await prisma.antigravityHandoff
        .update({
          where: { id: result.id },
          data: { returnUrl: finalReturnUrl.toString() },
        })
        .catch(() => {});

      const launchUrl = new URL("/launch", getAntigravityFrontendUrl());
      launchUrl.searchParams.set("token", token);
      return res.json({
        handoff_id: result.id,
        provenhire_interview_id: result.interviewId,
        antigravity_session_id: result.antigravitySessionId,
        status: result.status,
        launch_url: launchUrl.toString(),
        return_url: finalReturnUrl.toString(),
        expires_at: expiresAt.toISOString(),
      });
    } catch (e) {
      console.error("[ai-interview-adapter/handoff-launch]", e);
      return res
        .status(500)
        .json({ error: "Failed to create Antigravity handoff." });
    }
  },
);

aiInterviewAdapterRouter.get(
  "/handoff-open/:handoffId",
  requireAuth,
  requireJobSeeker,
  async (req: AuthedRequest, res) => {
    const userId = req.user!.id;
    const handoffId = req.params.handoffId;
    try {
      const handoff = await prisma.antigravityHandoff.findFirst({
        where: { id: handoffId, userId },
        select: {
          id: true,
          interviewId: true,
          antigravitySessionId: true,
          status: true,
          returnUrl: true,
          expiresAt: true,
          lastError: true,
        },
      });
      if (!handoff)
        return res.status(404).json({ error: "Handoff not found." });
      return res.json({
        handoff_id: handoff.id,
        provenhire_interview_id: handoff.interviewId,
        antigravity_session_id: handoff.antigravitySessionId,
        status: handoff.status,
        return_url: handoff.returnUrl,
        expires_at: handoff.expiresAt.toISOString(),
        error: handoff.lastError,
      });
    } catch (e) {
      console.error("[ai-interview-adapter/handoff-open]", e);
      return res.status(500).json({ error: "Failed to open handoff." });
    }
  },
);

aiInterviewAdapterRouter.post("/handoff-consume", async (req, res) => {
  const schema = z.object({ token: z.string().trim().min(20) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success)
    return res.status(400).json({ error: "Invalid handoff token." });

  try {
    const tokenHash = hashLaunchToken(parsed.data.token);
    const handoff = await prisma.antigravityHandoff.findUnique({
      where: { launchTokenHash: tokenHash },
      include: { interview: { select: { id: true, status: true } } },
    });
    if (!handoff)
      return res.status(404).json({ error: "Handoff token not found." });
    if (handoff.expiresAt.getTime() < Date.now()) {
      await prisma.antigravityHandoff
        .update({
          where: { id: handoff.id },
          data: { status: "expired", lastError: "Launch token expired." },
        })
        .catch(() => {});
      return res.status(410).json({ error: "Handoff token expired." });
    }
    if (handoff.status === "completed") {
      return res.status(409).json({
        error: "Handoff already completed.",
        return_url: handoff.returnUrl,
      });
    }
    if (handoff.status === "failed" || handoff.status === "expired") {
      return res.status(409).json({ error: `Handoff is ${handoff.status}.` });
    }

    const updated = await prisma.antigravityHandoff.update({
      where: { id: handoff.id },
      data: {
        status: handoff.antigravitySessionId ? "started" : "launched",
        launchedAt: handoff.launchedAt ?? new Date(),
      },
    });

    const payload = updated.launchPayload as Record<string, unknown>;
    return res.json({
      handoff_id: updated.id,
      provenhire_interview_id: updated.interviewId,
      antigravity_session_id: updated.antigravitySessionId,
      status: updated.status,
      return_url: updated.returnUrl,
      resume: payload.resume ?? "",
      github_links: Array.isArray(payload.github_links)
        ? payload.github_links
        : [],
      target_role: payload.target_role ?? "",
      years_experience: payload.years_experience ?? "",
      prior_assessment_context:
        typeof payload.prior_assessment_context === "object" &&
        payload.prior_assessment_context
          ? payload.prior_assessment_context
          : {},
      prior_assessment_prompt:
        typeof payload.prior_assessment_prompt === "string"
          ? payload.prior_assessment_prompt
          : "",
    });
  } catch (e) {
    console.error("[ai-interview-adapter/handoff-consume]", e);
    return res.status(500).json({ error: "Failed to consume handoff token." });
  }
});

const handoffStartedSchema = z.object({
  handoff_id: z.string().trim().min(1),
  antigravity_session_id: z.string().trim().min(1),
});

aiInterviewAdapterRouter.post(
  "/handoff-started",
  async (req: AuthedRequest, res) => {
    const parsed = handoffStartedSchema.safeParse(req.body);
    if (!parsed.success)
      return res
        .status(400)
        .json({ error: "Invalid handoff-started payload." });
    const { handoff_id, antigravity_session_id } = parsed.data;
    if (
      !verifyWebhookSignature(
        req,
        "started",
        handoff_id,
        antigravity_session_id,
      )
    ) {
      return res
        .status(401)
        .json({ error: "Invalid Antigravity callback signature." });
    }

    try {
      const handoff = await prisma.antigravityHandoff.update({
        where: { id: handoff_id },
        data: {
          status: "started",
          startedAt: new Date(),
          antigravitySessionId: antigravity_session_id,
        },
        select: { interviewId: true },
      });
      await prisma.interview.update({
        where: { id: handoff.interviewId },
        data: {
          scoreBreakdown: toPrismaJsonValue({
            handoff_status: "started",
            antigravity_session_id,
            prepare_status: "ready",
          }),
        },
      });
      return res.json({ ok: true });
    } catch (e) {
      console.error("[ai-interview-adapter/handoff-started]", e);
      return res.status(500).json({ error: "Failed to mark handoff started." });
    }
  },
);

aiInterviewAdapterRouter.post(
  "/prepare",
  requireAuth,
  requireJobSeeker,
  async (req: AuthedRequest, res) => {
    const parsed = startSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.errors[0].message });
    }
    const { resume, github_links, target_role, years_experience } = parsed.data;
    const userId = req.user!.id;

    const gate = await gateExpertInterviewStart(userId);
    if (!gate.ok) {
      return res.status(gate.status).json(gate.body);
    }

    let priorModuleContext: {
      relevantState: Record<string, unknown>;
      promptContext: string;
    };
    try {
      priorModuleContext = await getCandidateModuleContext(
        userId,
        "antigravity",
      );
    } catch {
      priorModuleContext = { relevantState: {}, promptContext: "" };
    }

    let interview: { id: string };
    try {
      interview = await prisma.interview.create({
        data: {
          userId,
          jobRole: target_role || "General",
          interviewType: "ai_expert",
          experienceLevel: years_experience || "mid",
          status: "in_progress",
          questionPlan: [],
          scoreBreakdown: toPrismaJsonValue({
            prepare_status: "preparing",
            prepare_started_at: new Date().toISOString(),
          }),
        },
        select: { id: true },
      });
    } catch (e) {
      console.error("[ai-interview-adapter/prepare] DB create failed:", e);
      return res.status(500).json({ error: "Failed to start interview." });
    }

    // Respond immediately so Vercel's proxy doesn't timeout
    res.json({ provenhire_interview_id: interview.id });

    // Background: prepare + start Antigravity, then update DB with results.
    // The Express process on Render continues after the HTTP response is sent.
    void (async () => {
      try {
        const agData = await prepareAndStartAntigravity({
          resume,
          github_links,
          target_role,
          years_experience,
          prior_assessment_context: priorModuleContext.relevantState,
          prior_assessment_prompt: priorModuleContext.promptContext,
        });
        // Only update if the row is still in_progress — the gate may have abandoned it
        // if a second prepare was fired while this one was running.
        await prisma.interview.updateMany({
          where: { id: interview.id, status: "in_progress" },
          data: {
            scoreBreakdown: toPrismaJsonValue({
              prepare_status: "ready",
              antigravity_session_id: agData.session_id,
              opening_question: agData.opening_question,
              sprint: agData.sprint,
            }),
          },
        });
      } catch (err) {
        console.error(
          "[ai-interview-adapter/prepare] background task failed:",
          err,
        );
        await prisma.interview
          .updateMany({
            where: { id: interview.id, status: "in_progress" },
            data: {
              status: "abandoned",
              scoreBreakdown: toPrismaJsonValue({
                prepare_status: "failed",
                prepare_error:
                  err instanceof Error ? err.message : "Preparation failed",
              }),
            },
          })
          .catch(() => {});
      }
    })();
  },
);

// ─── GET /prepare-status/:interviewId ──────────────────────────────────────────
// Polled by the browser (every 5 s) after POST /prepare.
// Returns { ready: true, session_id, opening_question, sprint } when Antigravity is up,
// { ready: false } while still building, or { ready: false, error } on failure.

aiInterviewAdapterRouter.get(
  "/prepare-status/:interviewId",
  requireAuth,
  requireJobSeeker,
  async (req: AuthedRequest, res) => {
    const { interviewId } = req.params;
    const userId = req.user!.id;

    try {
      const interview = await prisma.interview.findFirst({
        where: { id: interviewId, userId, interviewType: "ai_expert" },
        select: { id: true, status: true, scoreBreakdown: true },
      });
      if (!interview)
        return res.status(404).json({ error: "Interview not found." });

      const breakdown = interview.scoreBreakdown as Record<
        string,
        unknown
      > | null;
      const prepStatus = breakdown?.prepare_status;

      if (
        prepStatus === "ready" &&
        typeof breakdown?.antigravity_session_id === "string"
      ) {
        return res.json({
          ready: true,
          session_id: breakdown.antigravity_session_id,
          opening_question: breakdown.opening_question ?? "",
          sprint: breakdown.sprint ?? 1,
          prepare_status: "ready",
          interview_status: interview.status,
        });
      }

      if (prepStatus === "failed" || interview.status === "abandoned") {
        return res.json({
          ready: false,
          prepare_status: prepStatus ?? null,
          interview_status: interview.status,
          started_at:
            typeof breakdown?.prepare_started_at === "string"
              ? breakdown.prepare_started_at
              : null,
          error:
            (breakdown?.prepare_error as string | undefined) ??
            "Interview preparation failed. Please try again.",
        });
      }

      return res.json({
        ready: false,
        prepare_status: prepStatus ?? "preparing",
        interview_status: interview.status,
        started_at:
          typeof breakdown?.prepare_started_at === "string"
            ? breakdown.prepare_started_at
            : null,
      });
    } catch (e) {
      console.error("[ai-interview-adapter/prepare-status]", e);
      return res.status(500).json({ error: "Failed to check prepare status." });
    }
  },
);

// ─── GET /open ─────────────────────────────────────────────────────────────────
// Returns the user's existing open ai_expert interview so the UI can resume it
// instead of starting a new session after a page reload.

aiInterviewAdapterRouter.get(
  "/open",
  requireAuth,
  requireJobSeeker,
  async (req: AuthedRequest, res) => {
    const userId = req.user!.id;

    try {
      const profile = await prisma.jobSeekerProfile.findUnique({
        where: { userId },
        select: { roleType: true },
      });
      if (
        roleTypeToTrack(profile?.roleType) === "software" &&
        !(await hasCompletedDsaPrerequisite(userId))
      ) {
        await prisma.interview.updateMany({
          where: { userId, interviewType: "ai_expert", status: "in_progress" },
          data: { status: "abandoned" },
        });
        return res.status(403).json({
          code: "DSA_REQUIRED",
          error:
            "Complete and pass the DSA Round before starting the AI Expert Interview.",
        });
      }

      const open = await prisma.interview.findFirst({
        where: { userId, interviewType: "ai_expert", status: "in_progress" },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          scoreBreakdown: true,
          createdAt: true,
        },
      });

      if (!open) {
        return res.json({ open: false });
      }

      const breakdown = open.scoreBreakdown as Record<string, unknown> | null;
      const prepStatus = breakdown?.prepare_status;

      // Map still building — tell the UI to resume polling prepare-status
      if (prepStatus === "preparing") {
        return res.json({
          open: false,
          preparing: true,
          provenhire_interview_id: open.id,
        });
      }

      const agSessionId =
        typeof breakdown?.antigravity_session_id === "string"
          ? breakdown.antigravity_session_id
          : null;

      if (!agSessionId) {
        // Corrupt row (ready but no session id) — abandon so the gate unblocks
        await prisma.interview.update({
          where: { id: open.id },
          data: { status: "abandoned" },
        });
        return res.json({ open: false });
      }

      // Opportunistically check if Antigravity already finished — reconcile without
      // requiring the user to keep the tab open.
      try {
        const agRes = await fetch(
          antigravityReportUrl(agSessionId),
          {
            signal: AbortSignal.timeout(5_000),
          },
        );
        if (agRes.ok) {
          const agReport = (await agRes.json()) as AgReport;
          if (agReport.complete) {
            const { totalScore, badgeLevel, verdict } = await finalizeInterview(
              open.id,
              userId,
              agReport,
              agSessionId,
            );
            return res.json({
              open: false,
              reconciled: true,
              score: totalScore,
              badge: badgeLevel,
              verdict,
              provenhire_interview_id: open.id,
            });
          }
        }
      } catch {
        // Antigravity unreachable — session is genuinely still open, let the user resume
      }

      return res.json({
        open: true,
        session_id: agSessionId,
        provenhire_interview_id: open.id,
        started_at: open.createdAt.toISOString(),
      });
    } catch (e) {
      console.error("[ai-interview-adapter/open]", e);
      return res.status(500).json({ error: "Failed to check open interview" });
    }
  },
);

// ─── GET /status/:sessionId ─────────────────────────────────────────────────────

aiInterviewAdapterRouter.get(
  "/status/:sessionId",
  requireAuth,
  requireJobSeeker,
  async (req: AuthedRequest, res) => {
    const { sessionId } = req.params;
    const { interviewId } = req.query as { interviewId?: string };
    const userId = req.user!.id;

    if (!interviewId) {
      return res
        .status(400)
        .json({ error: "interviewId query parameter is required" });
    }

    try {
      const interview = await prisma.interview.findFirst({
        where: { id: interviewId, userId, interviewType: "ai_expert" },
        select: {
          id: true,
          status: true,
          totalScore: true,
          badgeLevel: true,
          finalVerdict: true,
          scoreBreakdown: true,
        },
      });

      if (!interview) {
        return res.status(404).json({ error: "Interview not found" });
      }

      // Fail-closed: absent metadata is as suspicious as a mismatch.
      const breakdown = interview.scoreBreakdown as Record<
        string,
        unknown
      > | null;
      const storedSessionId =
        typeof breakdown?.antigravity_session_id === "string"
          ? breakdown.antigravity_session_id
          : null;

      if (!storedSessionId || storedSessionId !== sessionId) {
        return res
          .status(403)
          .json({ error: "Session id does not match this interview." });
      }

      // Already processed — return cached result
      if (interview.status === "completed") {
        return res.json({
          complete: true,
          score: interview.totalScore,
          badge: interview.badgeLevel,
          verdict: interview.finalVerdict,
          provenhire_interview_id: interview.id,
        });
      }

      // Poll Antigravity report endpoint
      const agRes = await fetch(antigravityReportUrl(sessionId), {
        signal: AbortSignal.timeout(10_000),
      });

      if (!agRes.ok) {
        if (agRes.status === 404) return res.json({ complete: false });
        return res
          .status(502)
          .json({ error: "Failed to fetch interview status" });
      }

      const agReport = (await agRes.json()) as AgReport;

      if (!agReport.complete) {
        return res.json({ complete: false });
      }

      // Finalize atomically
      const { totalScore, badgeLevel, verdict } = await finalizeInterview(
        interview.id,
        userId,
        agReport,
        sessionId,
      );

      return res.json({
        complete: true,
        score: totalScore,
        badge: badgeLevel,
        verdict,
        provenhire_interview_id: interview.id,
      });
    } catch (e) {
      if (e instanceof Error && e.name === "TimeoutError") {
        return res.json({ complete: false });
      }
      console.error("[ai-interview-adapter/status]", e);
      return res
        .status(500)
        .json({ error: "Failed to check interview status" });
    }
  },
);

// ─── POST /cancel ──────────────────────────────────────────────────────────────
// Called when a user ends an interview early or when an orphaned session is detected.
// Marks the ProvenHire interview as "abandoned" so gateExpertInterviewStart unblocks,
// and best-effort ends the Antigravity session to free backend resources.

const cancelSchema = z.object({
  session_id: z.string().trim().min(1),
  provenhire_interview_id: z.string().trim().min(1),
});

aiInterviewAdapterRouter.post(
  "/cancel",
  requireAuth,
  requireJobSeeker,
  async (req: AuthedRequest, res) => {
    const parsed = cancelSchema.safeParse(req.body);
    if (!parsed.success)
      return res.status(400).json({ error: "Invalid payload." });

    const { session_id, provenhire_interview_id } = parsed.data;
    const userId = req.user!.id;

    try {
      const interview = await prisma.interview.findFirst({
        where: {
          id: provenhire_interview_id,
          userId,
          interviewType: "ai_expert",
        },
        select: { id: true, status: true, scoreBreakdown: true },
      });
      if (!interview)
        return res.status(404).json({ error: "Interview not found." });
      if (interview.status !== "in_progress") {
        return res.json({ ok: true }); // already settled, nothing to do
      }

      // Use the session id stored at creation — never trust the caller-supplied value
      // for the actual Antigravity end_interview call.
      const breakdown = interview.scoreBreakdown as Record<
        string,
        unknown
      > | null;
      const storedSessionId =
        typeof breakdown?.antigravity_session_id === "string"
          ? breakdown.antigravity_session_id
          : null;

      void session_id; // acknowledged but not used for the Antigravity call

      if (storedSessionId) {
        fetch(
          `${antigravityApiUrl()}/end_interview/${encodeURIComponent(storedSessionId)}`,
          {
            method: "POST",
            signal: AbortSignal.timeout(8_000),
          },
        ).catch(() => {});
      }

      await prisma.interview.update({
        where: { id: interview.id },
        data: { status: "abandoned" },
      });

      return res.json({ ok: true });
    } catch (e) {
      console.error("[ai-interview-adapter/cancel]", e);
      return res.status(500).json({ error: "Failed to cancel interview." });
    }
  },
);

// ─── POST /finalize ─────────────────────────────────────────────────────────────
// Called immediately when the native interview engine receives complete:true in a
// process_turn response — no polling, zero lag at interview end.

const finalizeSchema = z.object({
  session_id: z.string().trim().min(1),
  provenhire_interview_id: z.string().trim().min(1),
});

aiInterviewAdapterRouter.post(
  "/finalize",
  requireAuth,
  requireJobSeeker,
  async (req: AuthedRequest, res) => {
    const parsed = finalizeSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid payload." });
    }
    const { session_id, provenhire_interview_id } = parsed.data;
    const userId = req.user!.id;

    try {
      const interview = await prisma.interview.findFirst({
        where: {
          id: provenhire_interview_id,
          userId,
          interviewType: "ai_expert",
        },
        select: {
          id: true,
          status: true,
          totalScore: true,
          badgeLevel: true,
          finalVerdict: true,
          scoreBreakdown: true,
        },
      });
      if (!interview)
        return res.status(404).json({ error: "Interview not found." });

      // Fail-closed — if the stored session id is absent or mismatched, reject.
      // Missing metadata is as suspicious as a wrong id; don't silently bypass binding.
      const breakdown = interview.scoreBreakdown as Record<
        string,
        unknown
      > | null;
      const storedSessionId =
        typeof breakdown?.antigravity_session_id === "string"
          ? breakdown.antigravity_session_id
          : null;
      if (!storedSessionId || storedSessionId !== session_id) {
        return res
          .status(403)
          .json({ error: "Session id does not match this interview." });
      }

      // Already finalized — return cached result immediately
      if (interview.status === "completed") {
        return res.json({
          complete: true,
          score: interview.totalScore,
          badge: interview.badgeLevel,
          verdict: interview.finalVerdict,
        });
      }

      const agRes = await fetch(antigravityReportUrl(session_id), {
        signal: AbortSignal.timeout(ANTIGRAVITY_REPORT_TIMEOUT_MS),
      });
      if (!agRes.ok) {
        if (agRes.status === 404) return res.json({ complete: false });
        return res.status(502).json({ error: "Failed to fetch report." });
      }

      const agReport = (await agRes.json()) as AgReport;
      if (!agReport.complete) return res.status(202).json({ complete: false });

      const { totalScore, badgeLevel, verdict } = await finalizeInterview(
        interview.id,
        userId,
        agReport,
        session_id,
      );

      return res.json({
        complete: true,
        score: totalScore,
        badge: badgeLevel,
        verdict,
      });
    } catch (e) {
      if (e instanceof Error && e.name === "TimeoutError") {
        return res.status(504).json({ error: "Report fetch timed out." });
      }
      console.error("[ai-interview-adapter/finalize]", e);
      return res.status(500).json({ error: "Finalization failed." });
    }
  },
);

const handoffCompleteSchema = z.object({
  handoff_id: z.string().trim().min(1),
  antigravity_session_id: z.string().trim().min(1),
  delivery_id: z.string().trim().min(1).optional(),
  report: z.any().optional(),
});

aiInterviewAdapterRouter.post(
  "/handoff-complete",
  async (req: AuthedRequest, res) => {
    const parsed = handoffCompleteSchema.safeParse(req.body);
    if (!parsed.success)
      return res
        .status(400)
        .json({ error: "Invalid handoff-complete payload." });
    const { handoff_id, antigravity_session_id } = parsed.data;
    if (
      !verifyWebhookSignature(
        req,
        "complete",
        handoff_id,
        antigravity_session_id,
      )
    ) {
      return res
        .status(401)
        .json({ error: "Invalid Antigravity callback signature." });
    }

    try {
      const handoff = await prisma.antigravityHandoff.findFirst({
        where: { id: handoff_id, antigravitySessionId: antigravity_session_id },
        select: { id: true, userId: true, interviewId: true, status: true },
      });
      if (!handoff)
        return res.status(404).json({ error: "Handoff not found." });

      let agReport = parsed.data.report as AgReport | undefined;
      if (!agReport?.complete) {
        const agRes = await fetch(
          antigravityReportUrl(antigravity_session_id),
          {
            signal: AbortSignal.timeout(ANTIGRAVITY_REPORT_TIMEOUT_MS),
          },
        );
        if (!agRes.ok)
          return res.status(202).json({ ok: false, complete: false });
        agReport = (await agRes.json()) as AgReport;
      }
      if (!agReport.complete)
        return res.status(202).json({ ok: false, complete: false });

      const { totalScore, badgeLevel, verdict } = await finalizeInterview(
        handoff.interviewId,
        handoff.userId,
        agReport,
        antigravity_session_id,
        handoff.id,
      );

      await prisma.antigravityHandoff.update({
        where: { id: handoff.id },
        data: {
          status: "completed",
          completedAt: new Date(),
          lastError: null,
        },
      });

      return res.json({
        ok: true,
        complete: true,
        score: totalScore,
        badge: badgeLevel,
        verdict,
      });
    } catch (e) {
      if (e instanceof Error && e.name === "TimeoutError") {
        return res.status(202).json({ ok: false, complete: false });
      }
      console.error("[ai-interview-adapter/handoff-complete]", e);
      return res
        .status(500)
        .json({ error: "Failed to complete Antigravity handoff." });
    }
  },
);

const handoffTelemetrySchema = z.object({
  handoff_id: z.string().trim().min(1),
  antigravity_session_id: z.string().trim().min(1),
  delivery_id: z.string().trim().min(1).optional(),
  event: z.record(z.unknown()),
});

aiInterviewAdapterRouter.post(
  "/handoff-telemetry",
  async (req: AuthedRequest, res) => {
    const parsed = handoffTelemetrySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid handoff-telemetry payload." });
    }
    const { handoff_id, antigravity_session_id, event } = parsed.data;
    if (
      !verifyWebhookSignature(
        req,
        "telemetry",
        handoff_id,
        antigravity_session_id,
      )
    ) {
      return res
        .status(401)
        .json({ error: "Invalid Antigravity callback signature." });
    }

    try {
      const result = await appendAntigravityTelemetryEvent({
        handoffId: handoff_id,
        antigravitySessionId: antigravity_session_id,
        event,
      });
      if (!result) {
        // A late-event delivery can race the bulk report callback. A non-2xx
        // response keeps the Antigravity outbox row retryable until the report
        // artifact exists.
        return res.status(409).json({
          error: "Antigravity report artifact is not ready for telemetry.",
        });
      }
      return res.json({ ok: true, ...result });
    } catch (e) {
      console.error("[ai-interview-adapter/handoff-telemetry]", e);
      return res
        .status(500)
        .json({ error: "Failed to append Antigravity telemetry." });
    }
  },
);

const handoffFailedSchema = z.object({
  handoff_id: z.string().trim().min(1),
  antigravity_session_id: z.string().trim().optional().default(""),
  error: z.string().trim().optional().default("Antigravity handoff failed."),
});

aiInterviewAdapterRouter.post(
  "/handoff-failed",
  async (req: AuthedRequest, res) => {
    const parsed = handoffFailedSchema.safeParse(req.body);
    if (!parsed.success)
      return res.status(400).json({ error: "Invalid handoff-failed payload." });
    const { handoff_id, antigravity_session_id, error } = parsed.data;
    const signatureSession = antigravity_session_id || "none";
    if (!verifyWebhookSignature(req, "failed", handoff_id, signatureSession)) {
      return res
        .status(401)
        .json({ error: "Invalid Antigravity callback signature." });
    }

    try {
      const handoff = await prisma.antigravityHandoff.update({
        where: { id: handoff_id },
        data: {
          status: "failed",
          failedAt: new Date(),
          lastError: error.slice(0, 1000),
          ...(antigravity_session_id
            ? { antigravitySessionId: antigravity_session_id }
            : {}),
        },
        select: { interviewId: true },
      });
      await prisma.interview.updateMany({
        where: { id: handoff.interviewId, status: "in_progress" },
        data: { status: "abandoned" },
      });
      const workspaceAttempt = await prisma.workspaceRoundAttempt.findFirst({
        where: { interviewId: handoff.interviewId },
        select: { workspaceId: true, userId: true },
      });
      if (workspaceAttempt) {
        await upsertAssessmentIncident({
          dedupeKey: `${handoff.interviewId}:antigravity:finalization_failed`,
          workspaceId: workspaceAttempt.workspaceId,
          userId: workspaceAttempt.userId,
          interviewId: handoff.interviewId,
          handoffId: handoff_id,
          module: "antigravity",
          issueCode: "finalization_failed",
          severity: "critical",
          summary: "Antigravity exhausted report-finalization retries.",
          detail: { error, antigravitySessionId: antigravity_session_id || null },
        });
      }
      return res.json({ ok: true });
    } catch (e) {
      console.error("[ai-interview-adapter/handoff-failed]", e);
      return res.status(500).json({ error: "Failed to mark handoff failed." });
    }
  },
);

aiInterviewAdapterRouter.post(
  "/handoff-sync/:handoffId",
  requireAuth,
  requireJobSeeker,
  async (req: AuthedRequest, res) => {
    const userId = req.user!.id;
    const handoffId = req.params.handoffId;
    try {
      const handoff = await prisma.antigravityHandoff.findFirst({
        where: { id: handoffId, userId },
        select: {
          id: true,
          interviewId: true,
          status: true,
          antigravitySessionId: true,
          lastError: true,
        },
      });
      if (!handoff)
        return res.status(404).json({ error: "Handoff not found." });
      if (!handoff.antigravitySessionId) {
        return res.json({
          complete: false,
          status: handoff.status,
          error: handoff.lastError,
        });
      }

      const agRes = await fetch(
        antigravityReportUrl(handoff.antigravitySessionId),
        {
          signal: AbortSignal.timeout(ANTIGRAVITY_REPORT_TIMEOUT_MS),
        },
      );
      if (!agRes.ok)
        return res.json({ complete: false, status: handoff.status });
      const agReport = (await agRes.json()) as AgReport;
      if (!agReport.complete)
        return res.json({ complete: false, status: handoff.status });

      const result = await finalizeInterview(
        handoff.interviewId,
        userId,
        agReport,
        handoff.antigravitySessionId,
      );
      await prisma.antigravityHandoff.update({
        where: { id: handoff.id },
        data: { status: "completed", completedAt: new Date(), lastError: null },
      });
      return res.json({ complete: true, status: "completed", ...result });
    } catch (e) {
      if (e instanceof Error && e.name === "TimeoutError") {
        return res.json({ complete: false, status: "sync_timeout" });
      }
      console.error("[ai-interview-adapter/handoff-sync]", e);
      return res.status(500).json({ error: "Failed to sync handoff." });
    }
  },
);
