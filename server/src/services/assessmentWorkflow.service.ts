import os from "node:os";
import { Prisma } from "@prisma/client";

import { prisma } from "../config/prisma.js";
import { generateAssessmentReport } from "./assessmentReportAgent.service.js";
import { WorkspaceServiceError } from "./workspace.service.js";

const WORKER_INTERVAL_MS = Math.max(
  2_000,
  Number(process.env.ASSESSMENT_WORKFLOW_INTERVAL_MS || 5_000),
);
let workerTimer: ReturnType<typeof setInterval> | null = null;
let sweepRunning = false;

function json(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

export async function upsertAssessmentIncident(input: {
  dedupeKey: string;
  workspaceId: string;
  userId: string;
  interviewId?: string | null;
  handoffId?: string | null;
  module: string;
  issueCode: string;
  severity: "critical" | "high" | "medium" | "low";
  summary: string;
  detail?: unknown;
}) {
  return prisma.assessmentPipelineIncident.upsert({
    where: { dedupeKey: input.dedupeKey },
    create: {
      ...input,
      detail: input.detail == null ? undefined : json(input.detail),
    },
    update: {
      severity: input.severity,
      summary: input.summary,
      detail: input.detail == null ? undefined : json(input.detail),
      lastSeenAt: new Date(),
      status: "open",
      resolvedAt: null,
    },
  });
}

export async function enqueueCandidateReportWorkflow(input: {
  workspaceId: string;
  userId: string;
  interviewId: string;
  handoffId?: string | null;
  antigravitySessionId: string;
  report: Record<string, unknown>;
}) {
  const coverageGate =
    input.report.coverage_gate && typeof input.report.coverage_gate === "object"
      ? (input.report.coverage_gate as Record<string, unknown>)
      : {};
  const diagnostics =
    input.report.finalization_diagnostics &&
    typeof input.report.finalization_diagnostics === "object"
      ? (input.report.finalization_diagnostics as Record<string, unknown>)
      : {};
  const telemetry =
    input.report.telemetry_reconciliation &&
    typeof input.report.telemetry_reconciliation === "object"
      ? (input.report.telemetry_reconciliation as Record<string, unknown>)
      : {};

  const job = await prisma.assessmentWorkflowJob.upsert({
    where: {
      workspaceId_userId_jobKind_interviewId: {
        workspaceId: input.workspaceId,
        userId: input.userId,
        jobKind: "candidate_report_pipeline",
        interviewId: input.interviewId,
      },
    },
    create: {
      workspaceId: input.workspaceId,
      userId: input.userId,
      interviewId: input.interviewId,
      status: "pending",
      currentStep: "queued_after_antigravity",
      context: json({
        handoffId: input.handoffId ?? null,
        antigravitySessionId: input.antigravitySessionId,
      }),
    },
    update: {
      interviewId: input.interviewId,
      status: "pending",
      currentStep: "queued_after_antigravity",
      attempts: 0,
      nextAttemptAt: new Date(),
      lockedAt: null,
      lockedBy: null,
      lastError: null,
      completedAt: null,
      context: json({
        handoffId: input.handoffId ?? null,
        antigravitySessionId: input.antigravitySessionId,
      }),
    },
  });

  await prisma.assessmentPipelineIncident.updateMany({
    where: {
      dedupeKey: {
        in: [
          `${input.interviewId}:antigravity:report_not_received`,
          `${input.interviewId}:antigravity:finalization_failed`,
        ],
      },
      status: "open",
    },
    data: { status: "resolved", resolvedAt: new Date() },
  });

  const incidents: Promise<unknown>[] = [];
  if (coverageGate.passed === false) {
    incidents.push(
      upsertAssessmentIncident({
        dedupeKey: `${input.interviewId}:antigravity:coverage_incomplete`,
        workspaceId: input.workspaceId,
        userId: input.userId,
        interviewId: input.interviewId,
        handoffId: input.handoffId,
        module: "antigravity",
        issueCode: "coverage_incomplete",
        severity: "high",
        summary: "The interview report exists, but its evidence coverage gate did not pass.",
        detail: coverageGate,
      }),
    );
  }
  if (telemetry.complete === false) {
    incidents.push(
      upsertAssessmentIncident({
        dedupeKey: `${input.interviewId}:antigravity:telemetry_incomplete`,
        workspaceId: input.workspaceId,
        userId: input.userId,
        interviewId: input.interviewId,
        handoffId: input.handoffId,
        module: "antigravity",
        issueCode: "telemetry_incomplete",
        severity: "high",
        summary: "Antigravity finalized before every telemetry fact reconciled to Postgres.",
        detail: telemetry,
      }),
    );
  }
  const background =
    diagnostics.background_analysis && typeof diagnostics.background_analysis === "object"
      ? (diagnostics.background_analysis as Record<string, unknown>)
      : {};
  if (background.evidence_complete === false) {
    incidents.push(
      upsertAssessmentIncident({
        dedupeKey: `${input.interviewId}:antigravity:background_analysis_incomplete`,
        workspaceId: input.workspaceId,
        userId: input.userId,
        interviewId: input.interviewId,
        handoffId: input.handoffId,
        module: "antigravity",
        issueCode: "background_analysis_incomplete",
        severity: "high",
        summary: "One or more interview-analysis tasks missed the final evidence snapshot.",
        detail: background,
      }),
    );
  }
  await Promise.all(incidents);
  return job;
}

async function claimJob() {
  const staleBefore = new Date(Date.now() - 5 * 60_000);
  const candidate = await prisma.assessmentWorkflowJob.findFirst({
    where: {
      attempts: { lt: 8 },
      nextAttemptAt: { lte: new Date() },
      OR: [
        { status: { in: ["pending", "retry"] } },
        { status: "running", lockedAt: { lt: staleBefore } },
      ],
    },
    orderBy: { createdAt: "asc" },
  });
  if (!candidate) return null;
  const lockedBy = `${os.hostname()}:${process.pid}`;
  const claimed = await prisma.assessmentWorkflowJob.updateMany({
    where: {
      id: candidate.id,
      OR: [
        { status: { in: ["pending", "retry"] } },
        { status: "running", lockedAt: { lt: staleBefore } },
      ],
    },
    data: {
      status: "running",
      currentStep: "loading_evidence",
      lockedAt: new Date(),
      lockedBy,
      attempts: { increment: 1 },
    },
  });
  if (claimed.count !== 1) return null;
  return prisma.assessmentWorkflowJob.findUnique({ where: { id: candidate.id } });
}

async function processJob(job: NonNullable<Awaited<ReturnType<typeof claimJob>>>) {
  const workspace = await prisma.workspace.findUnique({
    where: { id: job.workspaceId },
    select: { ownerUser: { select: { id: true, role: true } } },
  });
  if (!workspace) throw new WorkspaceServiceError("Workspace no longer exists.", 404);
  const actor = { id: workspace.ownerUser.id, role: workspace.ownerUser.role };

  await prisma.assessmentWorkflowJob.update({
    where: { id: job.id },
    data: { currentStep: "generating_dsa_report" },
  });
  await generateAssessmentReport(actor, job.workspaceId, job.userId, "dsa", false);
  await prisma.assessmentWorkflowJob.update({
    where: { id: job.id },
    data: { currentStep: "generating_unified_report" },
  });
  await generateAssessmentReport(actor, job.workspaceId, job.userId, "unified", false);
  await prisma.assessmentWorkflowJob.update({
    where: { id: job.id },
    data: {
      status: "complete",
      currentStep: "complete",
      completedAt: new Date(),
      lockedAt: null,
      lockedBy: null,
      lastError: null,
    },
  });
  await prisma.assessmentPipelineIncident.updateMany({
    where: { dedupeKey: `${job.id}:report_generation_failed`, status: "open" },
    data: { status: "resolved", resolvedAt: new Date(), lastSeenAt: new Date() },
  });
}

async function failJob(job: NonNullable<Awaited<ReturnType<typeof claimJob>>>, error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  const permanent =
    error instanceof WorkspaceServiceError && [400, 403, 404, 409].includes(error.statusCode);
  const terminal = permanent || job.attempts >= job.maxAttempts;
  await prisma.assessmentWorkflowJob.update({
    where: { id: job.id },
    data: {
      status: terminal ? "blocked" : "retry",
      currentStep: terminal ? "operator_attention" : "retry_scheduled",
      nextAttemptAt: new Date(
        Date.now() + Math.min(60 * 60_000, 15_000 * 2 ** Math.max(0, job.attempts - 1)),
      ),
      lockedAt: null,
      lockedBy: null,
      lastError: message.slice(0, 5_000),
    },
  });
  await upsertAssessmentIncident({
    dedupeKey: `${job.id}:report_generation_failed`,
    workspaceId: job.workspaceId,
    userId: job.userId,
    interviewId: job.interviewId,
    module: "unified_report",
    issueCode: terminal ? "report_generation_blocked" : "report_generation_retrying",
    severity: terminal ? "critical" : "medium",
    summary: terminal
      ? "Automatic candidate report generation requires technical-admin attention."
      : "Automatic candidate report generation failed transiently and will retry.",
    detail: { message, attempts: job.attempts, maxAttempts: job.maxAttempts },
  });
}

export async function runAssessmentWorkflowSweep() {
  if (sweepRunning) return;
  sweepRunning = true;
  try {
    const job = await claimJob();
    if (!job) return;
    try {
      await processJob(job);
    } catch (error) {
      await failJob(job, error);
    }
  } catch (error) {
    console.error(
      JSON.stringify({
        level: "error",
        message: "assessment_workflow_sweep_failed",
        error: error instanceof Error ? error.message : String(error),
        timestamp: new Date().toISOString(),
      }),
    );
  } finally {
    sweepRunning = false;
  }
}

export function startAssessmentWorkflowWorker() {
  if (workerTimer) return;
  void runAssessmentWorkflowSweep();
  workerTimer = setInterval(() => void runAssessmentWorkflowSweep(), WORKER_INTERVAL_MS);
  workerTimer.unref?.();
}

export async function listWorkspaceTechnicalDesk(workspaceId: string) {
  const interviewAttempts = await prisma.workspaceRoundAttempt.findMany({
    where: { workspaceId, roundType: "interview" },
    select: {
      userId: true,
      interviewId: true,
      status: true,
      startedAt: true,
      completedAt: true,
      interview: {
        select: {
          antigravityHandoff: true,
          antigravityReport: { select: { id: true, receivedAt: true } },
        },
      },
    },
    orderBy: { startedAt: "desc" },
    take: 500,
  });
  const staleBefore = Date.now() - 30 * 60_000;
  await Promise.all(
    interviewAttempts.flatMap((attempt) => {
      const handoff = attempt.interview?.antigravityHandoff;
      if (!handoff) return [];
      if (
        ["created", "launched", "started"].includes(handoff.status) &&
        handoff.updatedAt.getTime() < staleBefore &&
        !attempt.interview?.antigravityReport
      ) {
        return [
          upsertAssessmentIncident({
            dedupeKey: `${handoff.interviewId}:antigravity:report_not_received`,
            workspaceId,
            userId: attempt.userId,
            interviewId: handoff.interviewId,
            handoffId: handoff.id,
            module: "antigravity",
            issueCode: "report_not_received",
            severity: "critical",
            summary: "The interview handoff has not produced a ProvenHire report within 30 minutes.",
            detail: {
              handoffStatus: handoff.status,
              antigravitySessionId: handoff.antigravitySessionId,
              lastUpdatedAt: handoff.updatedAt,
              lastError: handoff.lastError,
            },
          }),
        ];
      }
      return [];
    }),
  );
  const [jobs, incidents] = await Promise.all([
    prisma.assessmentWorkflowJob.findMany({
      where: { workspaceId },
      orderBy: { updatedAt: "desc" },
      take: 200,
    }),
    prisma.assessmentPipelineIncident.findMany({
      where: { workspaceId },
      orderBy: [{ status: "asc" }, { lastSeenAt: "desc" }],
      take: 500,
    }),
  ]);
  const userIds = [...new Set([...jobs, ...incidents].map((item) => item.userId))];
  const candidates = userIds.length
    ? await prisma.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, name: true, email: true },
      })
    : [];
  return { jobs, incidents, interviewAttempts, candidates, generatedAt: new Date().toISOString() };
}

export async function retryAssessmentWorkflowJob(workspaceId: string, jobId: string) {
  return prisma.assessmentWorkflowJob.update({
    where: { id: jobId, workspaceId },
    data: {
      status: "pending",
      currentStep: "manual_retry_queued",
      attempts: 0,
      nextAttemptAt: new Date(),
      lockedAt: null,
      lockedBy: null,
      lastError: null,
    },
  });
}

export async function resolveAssessmentIncident(workspaceId: string, incidentId: string) {
  return prisma.assessmentPipelineIncident.update({
    where: { id: incidentId, workspaceId },
    data: { status: "resolved", resolvedAt: new Date() },
  });
}
