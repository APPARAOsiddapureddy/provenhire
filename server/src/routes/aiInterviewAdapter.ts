/**
 * aiInterviewAdapter — Express proxy between ProvenHire and the Antigravity
 * AI Interview Engine (FastAPI).
 *
 * Routes:
 *   POST /api/ai-interview-adapter/start
 *   GET  /api/ai-interview-adapter/open          ← resume orphaned session
 *   GET  /api/ai-interview-adapter/status/:sessionId?interviewId=<ph_id>
 */

import { Prisma } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { requireAuth, requireJobSeeker, AuthedRequest } from "../middleware/auth.js";
import { prisma } from "../config/prisma.js";
import { gateExpertInterviewStart } from "../services/candidateRetake.service.js";
import { getCandidateModuleContext } from "../services/performancePipeline.js";

export const aiInterviewAdapterRouter = Router();

const ANTIGRAVITY_API_URL =
  (process.env.ANTIGRAVITY_API_URL ?? "http://localhost:8000").replace(/\/$/, "");

const ANTIGRAVITY_PREP_TIMEOUT_MS = 210_000;
const ANTIGRAVITY_START_TIMEOUT_MS = 30_000;

function toPrismaJsonValue(value: unknown): Prisma.InputJsonValue {
  if (value === null) return null as unknown as Prisma.InputJsonValue;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => (item === null ? null : toPrismaJsonValue(item))) as Prisma.InputJsonArray;
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .map(([key, item]) => [key, item === null ? null : toPrismaJsonValue(item)] as const);
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
  raw_weaknesses?: Array<{ weakness: string; type: string; severity: string; attack_strategy?: string }>;
};

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
  return res.text().then((text) => text.slice(0, 300)).catch(() => "");
}

async function prepareAndStartAntigravity(payload: AntigravityStartPayload): Promise<StartInterviewResponse> {
  const prepareRes = await fetch(`${ANTIGRAVITY_API_URL}/api/prepare_interview_map`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(ANTIGRAVITY_PREP_TIMEOUT_MS),
  });

  if (!prepareRes.ok) {
    const text = await _readErrorText(prepareRes);
    console.error(`[ai-interview-adapter/start] Antigravity prepare ${prepareRes.status}: ${text}`);
    throw new Error("AI interview map preparation failed");
  }

  const prepared = (await prepareRes.json()) as PreparedMapResponse;
  if (!prepared.session_id || prepared.map_status !== "ready") {
    console.error(
      `[ai-interview-adapter/start] Antigravity prepare incomplete: session=${prepared.session_id ?? "none"} status=${prepared.map_status ?? "unknown"}`
    );
    throw new Error("AI interview map was not ready");
  }

  const startRes = await fetch(`${ANTIGRAVITY_API_URL}/api/start_interview`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prepared_session_id: prepared.session_id }),
    signal: AbortSignal.timeout(ANTIGRAVITY_START_TIMEOUT_MS),
  });

  if (!startRes.ok) {
    const text = await _readErrorText(startRes);
    console.error(`[ai-interview-adapter/start] Antigravity start ${startRes.status}: ${text}`);
    throw new Error("AI interview engine failed to start");
  }

  return (await startRes.json()) as StartInterviewResponse;
}

async function finalizeInterview(
  interviewId: string,
  userId: string,
  agReport: AgReport,
  sessionId?: string
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
      create: { userId, stageName: "expert_interview", status: "pending_review", score: totalScore ?? undefined },
    }),
    prisma.adminReviewQueue.upsert({
      where: { aiInterviewId: interviewId },
      update: {},
      create: { candidateId: userId, aiInterviewId: interviewId, status: "pending" },
    }),
  ]);

  // Fire-and-forget: publish rich analytics to unified performance pipeline
  if (totalScore != null) {
    const pass = totalScore >= 60;
    import("../services/performancePipeline.js").then(({ publishRunResult }) =>
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
          breakdown: (agReport.scores as Record<string, number | string>) ?? {},
          failureSurface: agReport.failure_surface ?? {},
          strengths: agReport.strengths ?? [],
          riskFlags: agReport.risk_flags ?? [],
          claimCredibilityRisk: agReport.claim_credibility_risk ?? null,
          untestedDimensions: agReport.untested_dimensions ?? [],
          weaknessSummary: agReport.weakness_summary ?? {},
          rawWeaknesses: agReport.raw_weaknesses ?? [],
        },
        signals: [{ competency: "EXPERT_INTERVIEW" as const, score: totalScore, pass }],
      })
    ).catch((e) => console.warn("[pipeline/antigravity]", e));
  }

  return { totalScore, badgeLevel, verdict };
}

// ─── POST /start ────────────────────────────────────────────────────────────────

const startSchema = z.object({
  resume: z.string().min(50, "Resume text is too short — paste at least 50 characters"),
  github_links: z.array(z.string()).optional().default([]),
  target_role: z.string().optional().default(""),
  years_experience: z.string().optional().default(""),
});

aiInterviewAdapterRouter.post(
  "/start",
  requireAuth,
  requireJobSeeker,
  async (req: AuthedRequest, res) => {
    const parsed = startSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.errors[0].message });
    }
    const { resume, github_links, target_role, years_experience } = parsed.data;
    const userId = req.user!.id;

    // 1. Apply the same retake/cooldown gate as the standard expert interview path.
    const gate = await gateExpertInterviewStart(userId);
    if (!gate.ok) {
      return res.status(gate.status).json(gate.body);
    }

    try {
      const priorModuleContext = await getCandidateModuleContext(userId, "antigravity");
      const agData = await prepareAndStartAntigravity({
        resume,
        github_links,
        target_role,
        years_experience,
        prior_assessment_context: priorModuleContext.relevantState,
        prior_assessment_prompt: priorModuleContext.promptContext,
      });

      // 3. Create ProvenHire Interview record, storing the Antigravity session id for ownership checks.
      const interview = await prisma.interview.create({
        data: {
          userId,
          jobRole: target_role || "General",
          interviewType: "ai_expert",
          experienceLevel: years_experience || "mid",
          status: "in_progress",
          questionPlan: [],
          scoreBreakdown: toPrismaJsonValue({ antigravity_session_id: agData.session_id }),
        },
        select: { id: true },
      });

      return res.json({
        session_id: agData.session_id,
        opening_question: agData.opening_question,
        sprint: agData.sprint,
        sprint_name: agData.sprint_name,
        provenhire_interview_id: interview.id,
      });
    } catch (e) {
      if (e instanceof Error && e.name === "TimeoutError") {
        return res.status(504).json({ error: "AI interview preparation timed out. Please try again." });
      }
      if (e instanceof Error && e.message === "AI interview map preparation failed") {
        return res.status(502).json({ error: "AI interview preparation failed. Please try again." });
      }
      if (e instanceof Error && e.message === "AI interview map was not ready") {
        return res.status(502).json({ error: "AI interview map was not ready. Please try again." });
      }
      if (e instanceof Error && e.message === "AI interview engine failed to start") {
        return res.status(502).json({ error: "AI interview engine failed to start. Please try again." });
      }
      console.error("[ai-interview-adapter/start]", e);
      return res.status(500).json({ error: "Failed to start interview" });
    }
  }
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
      const agSessionId = typeof breakdown?.antigravity_session_id === "string"
        ? breakdown.antigravity_session_id
        : null;

      if (!agSessionId) {
        return res.json({ open: false });
      }

      // Opportunistically check if Antigravity already finished — reconcile without
      // requiring the user to keep the iframe open.
      try {
        const agRes = await fetch(`${ANTIGRAVITY_API_URL}/api/report/${agSessionId}`, {
          signal: AbortSignal.timeout(5_000),
        });
        if (agRes.ok) {
          const agReport = (await agRes.json()) as AgReport;
          if (agReport.complete) {
            const { totalScore, badgeLevel, verdict } = await finalizeInterview(
              open.id,
              userId,
              agReport,
              agSessionId
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
  }
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
      return res.status(400).json({ error: "interviewId query parameter is required" });
    }

    try {
      // 1. Verify ownership — fetch the interview row and confirm the stored
      //    antigravity_session_id matches the caller-supplied sessionId.
      //    This prevents a candidate from injecting a foreign session's report
      //    into their own interview row.
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

      // Ownership check: the session id stored at creation must match.
      const breakdown = interview.scoreBreakdown as Record<string, unknown> | null;
      const storedSessionId = typeof breakdown?.antigravity_session_id === "string"
        ? breakdown.antigravity_session_id
        : null;

      if (storedSessionId && storedSessionId !== sessionId) {
        return res.status(403).json({ error: "Session id does not match this interview." });
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

      // 2. Poll Antigravity report endpoint
      const agRes = await fetch(`${ANTIGRAVITY_API_URL}/api/report/${sessionId}`, {
        signal: AbortSignal.timeout(10_000),
      });

      if (!agRes.ok) {
        if (agRes.status === 404) return res.json({ complete: false });
        return res.status(502).json({ error: "Failed to fetch interview status" });
      }

      const agReport = (await agRes.json()) as AgReport;

      if (!agReport.complete) {
        return res.json({ complete: false });
      }

      // 3. Finalize atomically
      const { totalScore, badgeLevel, verdict } = await finalizeInterview(
        interview.id,
        userId,
        agReport,
        sessionId
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
      return res.status(500).json({ error: "Failed to check interview status" });
    }
  }
);
