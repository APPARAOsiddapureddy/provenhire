import crypto from "node:crypto";
import { Router } from "express";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../config/prisma.js";
import { requireAuth, requireJobSeeker, type AuthedRequest } from "../middleware/auth.js";
import { canReadPlacementArtifact, verifyPlacementCallback } from "../services/placementReadinessContracts.js";

export const placementReadinessRouter = Router();
const TOKEN_TTL_MS = 15 * 60 * 1000;
const DEFAULT_PLACEMENT_WEB_URL = "https://provenhireplacement.vercel.app";

function secret(name: "PLACEMENT_HANDOFF_SHARED_SECRET" | "PLACEMENT_WEBHOOK_SECRET") {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function timingSafeText(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function tokenHash(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function asJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

export function resolvePlacementWebUrl(config: NodeJS.ProcessEnv = process.env) {
  const configured = config.PLACEMENT_READINESS_WEB_URL?.trim().replace(/\/$/, "");
  const customDomainReady = config.PLACEMENT_READINESS_CUSTOM_DOMAIN_READY === "true";
  const value =
    configured &&
    !(configured === "https://placement.provenhire.in" && !customDomainReady)
      ? configured
      : config.PLACEMENT_READINESS_FALLBACK_WEB_URL?.trim().replace(/\/$/, "") ||
        DEFAULT_PLACEMENT_WEB_URL;
  const parsed = new URL(value);
  if (config.NODE_ENV === "production" && parsed.protocol !== "https:") {
    throw new Error("PLACEMENT_READINESS_WEB_URL must use HTTPS in production.");
  }
  return parsed.toString().replace(/\/$/, "");
}

export function resolveExistingPlacementLaunch(input: {
  handoffId: string;
  status: string;
  placementSessionId: string | null;
  expiresAt: Date;
  webUrl?: string;
}) {
  if (
    !input.placementSessionId ||
    !["started", "processing", "failed"].includes(input.status)
  ) return null;
  const webUrl = input.webUrl ?? resolvePlacementWebUrl();
  return {
    handoff_id: input.handoffId,
    launch_url: `${webUrl}/interview-room/${encodeURIComponent(input.placementSessionId)}`,
    expires_at: input.expiresAt.toISOString(),
    resumed: true,
    status: input.status,
  };
}

const launchSchema = z.object({ workspace_attempt_id: z.string().uuid() });

placementReadinessRouter.post(
  "/handoff-launch",
  requireAuth,
  requireJobSeeker,
  async (req: AuthedRequest, res) => {
    const parsed = launchSchema.safeParse(req.body ?? {});
    if (!parsed.success) return res.status(400).json({ error: "A valid workspace attempt is required." });
    const userId = req.user!.id;
    const attempt = await prisma.workspaceRoundAttempt.findFirst({
      where: { id: parsed.data.workspace_attempt_id, userId, roundType: "interview", status: "active" },
      include: {
        workspace: true,
        workspaceRegistration: true,
        user: { include: { jobSeekerProfile: true, provenHireResume: true } },
      },
    });
    if (!attempt || attempt.workspaceRegistration.status !== "registered") {
      return res.status(404).json({ error: "Active Placement workspace attempt not found." });
    }
    if (attempt.workspace.status !== "started" || attempt.workspace.endAt.getTime() <= Date.now()) {
      return res.status(409).json({ error: "This Placement workspace is not currently active." });
    }

    const existingHandoff = await prisma.placementReadinessHandoff.findUnique({
      where: { workspaceRoundAttemptId: attempt.id },
      select: {
        id: true,
        status: true,
        placementSessionId: true,
        expiresAt: true,
      },
    });
    const resumeLaunch = existingHandoff
      ? resolveExistingPlacementLaunch({
          handoffId: existingHandoff.id,
          status: existingHandoff.status,
          placementSessionId: existingHandoff.placementSessionId,
          expiresAt: existingHandoff.expiresAt,
        })
      : null;
    if (resumeLaunch) return res.json(resumeLaunch);

    const profile = attempt.user.jobSeekerProfile;
    const resume = attempt.user.provenHireResume;
    const resumeContext = [
      `Candidate: ${attempt.user.name || profile?.fullName || attempt.user.email}`,
      `Current role: ${profile?.currentRole || "Entry-level candidate"}`,
      `Target role: ${attempt.workspace.targetRole}`,
      `Experience years: ${profile?.experienceYears ?? 0}`,
      `Skills: ${JSON.stringify(profile?.skills ?? resume?.claimedSkills ?? [])}`,
      `Verified skills: ${JSON.stringify(resume?.verifiedSkills ?? [])}`,
      `Projects: ${JSON.stringify(resume?.projects ?? [])}`,
    ].join("\n");
    const returnOrigin = process.env.PROVENHIRE_WEB_URL?.trim().replace(/\/$/, "") || "https://provenhire.in";
    const returnUrl = `${returnOrigin}/dashboard/jobseeker/workspaces/${encodeURIComponent(attempt.workspace.code)}`;
    const opaqueToken = crypto.randomBytes(32).toString("base64url");
    const expiresAt = new Date(Date.now() + TOKEN_TTL_MS);
    const launchPayload = {
      external_attempt_id: attempt.id,
      workspace_id: attempt.workspaceId,
      cohort_id: attempt.workspaceRegistrationId,
      enrollment_id: attempt.workspaceRegistrationId,
      candidate_id: userId,
      candidate_name: attempt.user.name || profile?.fullName || "Candidate",
      resume: resumeContext,
      github_links: profile?.githubUrl ? [profile.githubUrl] : [],
      target_role: attempt.workspace.targetRole,
      years_experience: String(profile?.experienceYears ?? 0),
      return_url: returnUrl,
    };

    const handoff = await prisma.placementReadinessHandoff.upsert({
      where: { workspaceRoundAttemptId: attempt.id },
      create: {
        userId,
        workspaceId: attempt.workspaceId,
        workspaceRoundAttemptId: attempt.id,
        launchTokenHash: tokenHash(opaqueToken),
        returnUrl,
        launchPayload: asJson(launchPayload),
        expiresAt,
      },
      update: {
        launchTokenHash: tokenHash(opaqueToken),
        launchPayload: asJson(launchPayload),
        returnUrl,
        expiresAt,
        status: "created",
        lastError: null,
      },
    });
    return res.status(201).json({
      handoff_id: handoff.id,
      launch_url: `${resolvePlacementWebUrl()}/launch?token=${encodeURIComponent(opaqueToken)}`,
      expires_at: expiresAt.toISOString(),
    });
  },
);

placementReadinessRouter.get(
  "/attempts/:attemptId/status",
  requireAuth,
  async (req: AuthedRequest, res) => {
    const attempt = await prisma.workspaceRoundAttempt.findFirst({
      where: { id: req.params.attemptId },
      select: {
        id: true,
        userId: true,
        workspaceId: true,
        status: true,
        workspace: { select: { ownerUserId: true } },
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
    });
    if (!attempt) return res.status(404).json({ error: "Workspace attempt not found." });
    if (!canReadPlacementArtifact({
      requesterId: req.user!.id,
      requesterRole: req.user!.role,
      candidateId: attempt.userId,
      workspaceOwnerUserId: attempt.workspace.ownerUserId,
    })) return res.status(403).json({ error: "Forbidden" });
    const handoff = attempt.placementReadinessHandoff;
    return res.json({
      attempt_status: attempt.status,
      report_status: handoff?.artifact
        ? "ready"
        : handoff?.status === "failed"
          ? "failed"
          : ["started", "processing"].includes(handoff?.status || "")
            ? "processing"
            : handoff?.status || "not_started",
      placement_session_id: handoff?.placementSessionId ?? null,
      last_error: handoff?.lastError ?? null,
      expires_at: handoff?.expiresAt?.toISOString() ?? null,
      updated_at: handoff?.updatedAt?.toISOString() ?? null,
      artifact_received_at: handoff?.artifact?.receivedAt.toISOString() ?? null,
    });
  },
);

const consumeSchema = z.object({ token: z.string().trim().min(20).max(4096) });
placementReadinessRouter.post("/handoff-consume", async (req, res) => {
  const authorization = req.headers.authorization || "";
  const supplied = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (!supplied || !timingSafeText(supplied, secret("PLACEMENT_HANDOFF_SHARED_SECRET"))) {
    return res.status(401).json({ error: "Invalid Placement service credential." });
  }
  const parsed = consumeSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: "Invalid handoff token." });
  const handoff = await prisma.placementReadinessHandoff.findUnique({
    where: { launchTokenHash: tokenHash(parsed.data.token) },
  });
  if (!handoff) return res.status(404).json({ error: "Handoff token not found." });
  if (handoff.expiresAt.getTime() <= Date.now()) {
    await prisma.placementReadinessHandoff.update({ where: { id: handoff.id }, data: { status: "expired" } });
    return res.status(410).json({ error: "Handoff token expired." });
  }
  if (!["created", "launched", "started"].includes(handoff.status)) {
    return res.status(409).json({ error: `Handoff is ${handoff.status}.` });
  }
  const updated = await prisma.placementReadinessHandoff.update({
    where: { id: handoff.id },
    data: { status: handoff.status === "created" ? "launched" : handoff.status, launchedAt: handoff.launchedAt ?? new Date() },
  });
  return res.json({
    handoff_id: updated.id,
    ...(updated.launchPayload as Record<string, unknown>),
    expires_at: updated.expiresAt.toISOString(),
  });
});

const callbackSchema = z.object({
  schema_version: z.literal("placement.callback.v1"),
  event_id: z.string().min(1),
  event_type: z.enum(["placement.started", "placement.report.ready", "placement.report.failed"]),
  handoff_id: z.string().uuid(),
  external_attempt_id: z.string().uuid(),
  placement_session_id: z.string().min(1),
  occurred_at: z.string().datetime(),
  artifact: z.unknown().optional(),
  failure_reason: z.string().optional(),
});

placementReadinessRouter.post("/callbacks", async (req, res) => {
  const timestamp = String(req.headers["x-placement-timestamp"] || "");
  const signature = String(req.headers["x-placement-signature"] || "");
  const body = JSON.stringify(req.body ?? {});
  const verification = verifyPlacementCallback({
    body,
    timestamp,
    signature,
    secret: secret("PLACEMENT_WEBHOOK_SECRET"),
  });
  if (!verification.ok) {
    return res.status(401).json({
      error: verification.reason === "stale_timestamp"
        ? "Callback timestamp is invalid or stale."
        : "Invalid callback signature.",
    });
  }
  const parsed = callbackSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid Placement callback contract." });
  const event = parsed.data;
  const handoff = await prisma.placementReadinessHandoff.findFirst({
    where: { id: event.handoff_id, workspaceRoundAttemptId: event.external_attempt_id },
  });
  if (!handoff) return res.status(404).json({ error: "Placement handoff not found." });
  const duplicate = await prisma.placementReadinessCallbackEvent.findUnique({ where: { id: event.event_id } });
  if (duplicate) return res.json({ ok: true, duplicate: true });

  const score = event.artifact && typeof event.artifact === "object"
    ? Number((event.artifact as { scorecard?: { overallScore?: unknown } }).scorecard?.overallScore)
    : Number.NaN;
  try {
    await prisma.$transaction(async (tx) => {
    await tx.placementReadinessCallbackEvent.create({
      data: { id: event.event_id, handoffId: handoff.id, eventType: event.event_type, payload: asJson(event) },
    });
    if (event.event_type === "placement.started") {
      await tx.placementReadinessHandoff.update({
        where: { id: handoff.id },
        data: { status: "started", placementSessionId: event.placement_session_id, startedAt: new Date(event.occurred_at) },
      });
    } else if (event.event_type === "placement.report.ready" && event.artifact) {
      const artifactJson = JSON.stringify(event.artifact);
      await tx.placementReadinessArtifact.upsert({
        where: { handoffId: handoff.id },
        create: {
          handoffId: handoff.id,
          userId: handoff.userId,
          workspaceId: handoff.workspaceId,
          workspaceRoundAttemptId: handoff.workspaceRoundAttemptId,
          placementSessionId: event.placement_session_id,
          schemaVersion: event.schema_version,
          reportHash: crypto.createHash("sha256").update(artifactJson).digest("hex"),
          artifact: asJson(event.artifact),
        },
        update: {},
      });
      await tx.placementReadinessHandoff.update({
        where: { id: handoff.id },
        data: { status: "completed", placementSessionId: event.placement_session_id, completedAt: new Date(event.occurred_at) },
      });
      await tx.workspaceRoundAttempt.updateMany({
        where: { id: handoff.workspaceRoundAttemptId, status: "active" },
        data: {
          status: "completed",
          score: Number.isFinite(score) ? Math.round(score) : null,
          percentageScore: Number.isFinite(score) ? Math.round(score) : null,
          completedAt: new Date(event.occurred_at),
        },
      });
      await tx.assessmentWorkflowJob.upsert({
        where: {
          workspaceId_userId_jobKind_interviewId: {
            workspaceId: handoff.workspaceId,
            userId: handoff.userId,
            jobKind: "candidate_report_pipeline",
            interviewId: event.placement_session_id,
          },
        },
        create: {
          workspaceId: handoff.workspaceId,
          userId: handoff.userId,
          interviewId: event.placement_session_id,
          status: "pending",
          currentStep: "queued_after_placement_readiness",
          context: asJson({
            source: "placement_readiness",
            handoffId: handoff.id,
            placementSessionId: event.placement_session_id,
          }),
        },
        update: {
          status: "pending",
          currentStep: "queued_after_placement_readiness",
          attempts: 0,
          nextAttemptAt: new Date(),
          lockedAt: null,
          lockedBy: null,
          lastError: null,
          completedAt: null,
          context: asJson({
            source: "placement_readiness",
            handoffId: handoff.id,
            placementSessionId: event.placement_session_id,
          }),
        },
      });
    } else if (event.event_type === "placement.report.failed") {
      await tx.placementReadinessHandoff.update({
        where: { id: handoff.id },
        data: { status: "failed", failedAt: new Date(event.occurred_at), lastError: event.failure_reason || "Placement report failed." },
      });
    }
    });
    console.info(JSON.stringify({
      level: "info",
      event: "placement_callback_ingested",
      eventId: event.event_id,
      eventType: event.event_type,
      handoffId: handoff.id,
      attemptId: handoff.workspaceRoundAttemptId,
      placementSessionId: event.placement_session_id,
    }));
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return res.json({ ok: true, duplicate: true });
    }
    throw error;
  }
  return res.json({ ok: true, duplicate: false });
});

placementReadinessRouter.get("/attempts/:attemptId/artifact", requireAuth, async (req: AuthedRequest, res) => {
  const artifact = await prisma.placementReadinessArtifact.findUnique({
    where: { workspaceRoundAttemptId: req.params.attemptId },
  });
  if (!artifact) return res.status(404).json({ error: "Placement report is not ready." });
  const workspace = await prisma.workspace.findUnique({
    where: { id: artifact.workspaceId },
    select: { ownerUserId: true },
  });
  if (!workspace || !canReadPlacementArtifact({
    requesterId: req.user!.id,
    requesterRole: req.user!.role,
    candidateId: artifact.userId,
    workspaceOwnerUserId: workspace.ownerUserId,
  })) return res.status(403).json({ error: "Forbidden" });
  return res.json({ status: "ready", artifact: artifact.artifact, report_hash: artifact.reportHash });
});
