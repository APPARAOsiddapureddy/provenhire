import { Router, type Response } from "express";
import multer from "multer";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { requireAuth, requireJobSeeker, optionalAuth, AuthedRequest } from "../middleware/auth.js";
import { prisma } from "../config/prisma.js";
import {
  createAptitudeSessionByQuestionSet,
  getPracticeAptitudeQuestions,
  storeMemoryAptitudeSession,
  getMemoryAptitudeSubmitContext,
  NON_TECH_DOMAIN_FUNDAMENTALS_CONFIG,
} from "../data/aptitude-loader.js";
import { experienceTierFromYears, questionSetForTier, dataQuestionSetForTier, dsaTierConfig, dataRoundTierConfig } from "../utils/experienceTier.js";
import {
  ALL_TECHNICAL_STAGE_NAMES,
  ALL_DATA_STAGE_NAMES,
  LEGACY_TECHNICAL_STAGES_V1,
  allowPlaceholderVerificationCompletion,
  isVerificationPipelineV2,
  technicalStagesForProfile,
  technicalStagesForTier,
  dataStagesForProfile,
  dataStagesForTier,
  roleTypeToTrack,
  allowedStageNamesForTrack,
  verificationStagesForProfile,
  nonTechnicalStagesForProfile,
  detectTrack,
  detectNonTechSubtrack,
  detectDataSubtrack,
  type VerificationTrack,
  type NonTechSubtrack,
} from "../constants/verificationPipeline.js";
import {
  buildHobbyMagazineAssignmentPrompt,
  hobbyCategoriesForClient,
  isValidHobbyCategoryId,
  getHobbyCategoryMeta,
} from "../data/nonTechAssignmentPrompts.js";
import { storeAptitudeSession, getAptitudeSession, clearAptitudeSession, updateAptitudeDraft } from "../data/aptitude-session-db.js";
import { rolesMatch } from "../data/interviewerRoles.js";
import { evaluateNonTechnicalAssignment } from "../services/ai.service.js";
import { buildTechnicalScorecard } from "../services/verificationScoring.service.js";
import { calculateCertificationLevel } from "../services/verificationLevel.service.js";
import { syncJobSeekerVerificationStatus } from "../services/certification.service.js";
import { upsertSkillVerification, getSkillVerifications } from "../services/skillVerification.service.js";
import { buildAptitudeLatestResult } from "../utils/aptitudeScoring.js";
import {
  applyAptitudeLockoutIfNeeded,
  cooldownPayloadFromLockout,
  getAptitudeLockoutStatus,
} from "../services/aptitudeLockout.service.js";
import { DSA_API_LANGUAGES, DSA_PRACTICE_COUNT, DSA_QUESTIONS_COUNT, type DsaApiLanguage } from "../constants/dsa.js";
import { checkRateLimit } from "../middleware/dsaRateLimit.js";
import { evaluateDsaAgainstTestCases, persistDsaSubmission } from "../services/dsaEvaluation.js";
import { getHumanInterviewEligibility } from "../services/humanInterviewGate.service.js";
import { sendHumanInterviewSlotBookedEmail } from "../services/resend.js";
import { COOLDOWN_DSA_MS, COOLDOWN_DATA_ROUND_MS } from "../constants/revenue.js";
import { gatePaidVerificationStageInProgress } from "../services/verificationStageRetakeGate.service.js";
import { gateNonTechAssignmentSubmit, nextNonTechAssignmentPaidCooldownBoundary } from "../services/candidateRetake.service.js";
import { isObjectStorageConfigured, uploadObject } from "../services/storage.service.js";
import { UPLOADS_DIR } from "./uploads.js";
// Daily.co disabled for MVP - using Google Meet instead. Uncomment when budget allows.
// import { createDailyRoom, createMeetingToken, getRoomNameFromUrl } from "../services/daily.js";

export const verificationRouter = Router();

const nonTechAssignmentUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok = new Set([
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ]).has(file.mimetype);
    if (ok) cb(null, true);
    else cb(new Error("Only PDF and Word documents are accepted."));
  },
});

async function extractNonTechAssignmentText(file: Express.Multer.File): Promise<string> {
  if (file.mimetype === "application/pdf") {
    const { PDFParse } = await import("pdf-parse");
    const parser = new PDFParse({ data: new Uint8Array(file.buffer) });
    try {
      const tr = await parser.getText();
      return tr.text ?? "";
    } finally {
      await parser.destroy();
    }
  }
  if (
    file.mimetype === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    file.mimetype === "application/msword"
  ) {
    const mammoth = await import("mammoth");
    const r = await mammoth.extractRawText({ buffer: file.buffer });
    return r.value;
  }
  throw new Error("Unsupported file type.");
}

async function saveNonTechAssignmentDocument(userId: string, file: Express.Multer.File): Promise<string> {
  const ext =
    file.mimetype === "application/pdf"
      ? ".pdf"
      : file.mimetype === "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        ? ".docx"
        : ".doc";
  const key = `non-tech-assignments/${userId}/${crypto.randomUUID()}${ext}`;
  if (isObjectStorageConfigured()) {
    return uploadObject(file.buffer, key, file.mimetype);
  }
  const dir = path.join(UPLOADS_DIR, "non-tech-assignments", userId);
  fs.mkdirSync(dir, { recursive: true });
  const name = `${crypto.randomUUID()}${ext}`;
  fs.writeFileSync(path.join(dir, name), file.buffer);
  return `/uploads/non-tech-assignments/${userId}/${name}`;
}

async function sendIfAptitudeLocked(userId: string, res: Response): Promise<boolean> {
  const s = await getAptitudeLockoutStatus(userId);
  if (!s.locked) return false;
  res.status(403).json({
    code: "APTITUDE_LOCKOUT",
    error:
      "You have reached the maximum number of failed Cognitive Assessment attempts. Per policy, you can try again after the date below.",
    lockedUntil: s.lockedUntil.toISOString(),
  });
  return true;
}

/** DB session row or in-memory fallback (same process) so aptitude works when Prisma session table errors. */
async function resolveAptitudeSubmitSession(userId: string): Promise<{
  answerKey: Record<string, string>;
  marksKey: Record<string, number>;
  testStartedAt: Date | null;
  questionSet: string | null;
} | null> {
  try {
    const row = await getAptitudeSession(userId);
    if (row?.answerKey && typeof row.answerKey === "object" && Object.keys(row.answerKey).length > 0) {
      return {
        answerKey: row.answerKey,
        marksKey: row.marksKey ?? {},
        testStartedAt: row.testStartedAt ?? null,
        questionSet: row.questionSet ?? null,
      };
    }
  } catch (e) {
    console.warn("[verification/aptitude] session read failed; trying in-memory keys", e);
  }
  return getMemoryAptitudeSubmitContext(userId);
}

async function isProfileSetupCompleted(userId: string): Promise<boolean> {
  const row = await prisma.verificationStage.findFirst({
    where: { userId, stageName: "profile_setup", status: "completed" },
    select: { id: true },
  });
  return Boolean(row);
}

/**
 * Resolve needed verification stages for any track (software, data, non_technical).
 * v2: show fresher stage order until profile_setup is completed; then use experienceYears.
 */
async function resolveNeededVerificationStages(
  userId: string,
  profile: { roleType?: string | null; experienceYears?: number | null } | null
): Promise<{ neededStages: string[]; profileSetupCompleted: boolean; track: VerificationTrack }> {
  const track = roleTypeToTrack(profile?.roleType);
  if (track === "non_technical") {
    const profileSetupCompleted = await isProfileSetupCompleted(userId);
    const neededStages = !profileSetupCompleted
      ? nonTechnicalStagesForProfile(0)
      : nonTechnicalStagesForProfile(profile?.experienceYears);
    return { neededStages, profileSetupCompleted, track };
  }
  if (track === "software" && !isVerificationPipelineV2()) {
    return { neededStages: [...LEGACY_TECHNICAL_STAGES_V1], profileSetupCompleted: true, track };
  }
  const profileSetupCompleted = await isProfileSetupCompleted(userId);
  let neededStages: string[];
  if (track === "data") {
    neededStages = !profileSetupCompleted
      ? dataStagesForTier("fresher")
      : dataStagesForProfile(profile?.experienceYears);
  } else {
    neededStages = !profileSetupCompleted
      ? technicalStagesForTier("fresher")
      : technicalStagesForProfile(profile?.experienceYears);
  }
  return { neededStages, profileSetupCompleted, track };
}

/** Create missing pipeline rows; drop only extra *locked* stages (never human expert) so the path can switch after profile setup. */
async function ensureVerificationPipelineStages(userId: string, neededStages: string[]): Promise<void> {
  let existing = await prisma.verificationStage.findMany({ where: { userId } });
  const neededSet = new Set(neededStages);
  const neverPrune = new Set<string>(["human_expert_interview", "expert_interview"]);

  if (existing.length === 0) {
    await prisma.verificationStage.createMany({
      data: neededStages.map((stageName, index) => ({
        userId,
        stageName,
        status: index === 0 ? "in_progress" : "locked",
      })),
      skipDuplicates: true,
    });
    return;
  }

  for (const row of existing) {
    if (neededSet.has(row.stageName) || neverPrune.has(row.stageName)) continue;
    const canDelete = row.status === "locked" && row.score == null;
    if (canDelete) {
      await prisma.verificationStage.delete({ where: { id: row.id } });
    }
  }

  existing = await prisma.verificationStage.findMany({ where: { userId } });
  const have = new Set(existing.map((r) => r.stageName));
  const missing = neededStages.filter((s) => !have.has(s));
  if (missing.length > 0) {
    await prisma.verificationStage.createMany({
      data: missing.map((stageName) => ({
        userId,
        stageName,
        status: "locked",
      })),
      skipDuplicates: true,
    });
  }
}

function allowedVerificationStageNames(roleType: string): Set<string> {
  return allowedStageNamesForTrack(roleTypeToTrack(roleType));
}

async function syncLegacyAptitudeToCsFundamentals(userId: string): Promise<void> {
  if (!isVerificationPipelineV2()) return;
  const profile = await prisma.jobSeekerProfile.findUnique({
    where: { userId },
    select: { experienceYears: true },
  });
  if (experienceTierFromYears(profile?.experienceYears) !== "fresher") return;
  const apt = await prisma.verificationStage.findFirst({
    where: { userId, stageName: "aptitude_test", status: "completed" },
  });
  if (!apt) return;
  await prisma.verificationStage.upsert({
    where: { userId_stageName: { userId, stageName: "cs_fundamentals" } },
    create: { userId, stageName: "cs_fundamentals", status: "completed", score: apt.score },
    update: { status: "completed", score: apt.score },
  });
}

function toStageResponse(rows: { stageName: string; status: string; score?: number | null }[]) {
  return rows.map((r) => ({
    stage_name: r.stageName,
    status: r.status,
    score: r.score ?? undefined,
  }));
}

/**
 * When aptitude is completed, the client should call stages/update to set dsa_round → in_progress.
 * If the user refreshes or skips "Continue to DSA", dsa_round can stay "locked" while the UI still
 * shows DSA as the next step (first "locked" after completed). Official DSA APIs require in_progress.
 * This reconciliation is NOT tied to integrity / proctoring feature flags.
 */
async function reconcileVerificationStages(userId: string): Promise<void> {
  const profile = await prisma.jobSeekerProfile.findUnique({
    where: { userId },
    select: { experienceYears: true, roleType: true },
  });
  const track = roleTypeToTrack(profile?.roleType);
  const reload = () => prisma.verificationStage.findMany({ where: { userId } });

  if (track === "non_technical") {
    const { neededStages: order } = await resolveNeededVerificationStages(userId, profile);
    let rows = await reload();
    const statusOf = (name: string) => rows.find((r) => r.stageName === name)?.status;
    for (let i = 1; i < order.length; i++) {
      const prev = order[i - 1]!;
      const cur = order[i]!;
      const prevDone =
        prev === "domain_fundamentals"
          ? statusOf("domain_fundamentals") === "completed"
          : statusOf(prev) === "completed";
      if (prevDone && statusOf(cur) === "locked") {
        await prisma.verificationStage.updateMany({
          where: { userId, stageName: cur },
          data: { status: "in_progress" },
        });
        rows = await reload();
      }
    }
    return;
  }

  if (track === "software" && !isVerificationPipelineV2()) {
    let rows = await reload();
    const st = (name: string) => rows.find((r) => r.stageName === name)?.status;
    if (st("aptitude_test") === "completed" && st("dsa_round") === "locked") {
      await prisma.verificationStage.updateMany({
        where: { userId, stageName: "dsa_round" },
        data: { status: "in_progress" },
      });
      rows = await reload();
    }
    const st245 = (name: string) => rows.find((r) => r.stageName === name)?.status;
    if (st245("dsa_round") === "completed" && st245("expert_interview") === "locked") {
      await prisma.verificationStage.updateMany({
        where: { userId, stageName: "expert_interview" },
        data: { status: "in_progress" },
      });
      rows = await reload();
    }
    const st3 = (name: string) => rows.find((r) => r.stageName === name)?.status;
    if (st3("expert_interview") === "completed" && st3("human_expert_interview") === "locked") {
      await prisma.verificationStage.updateMany({
        where: { userId, stageName: "human_expert_interview" },
        data: { status: "in_progress" },
      });
    }
    return;
  }

  const profileSetupDone = await isProfileSetupCompleted(userId);
  const { neededStages: order } = await resolveNeededVerificationStages(userId, profile);
  let rows = await reload();
  const statusOf = (name: string) => rows.find((r) => r.stageName === name)?.status;

  for (let i = 1; i < order.length; i++) {
    const prev = order[i - 1]!;
    const cur = order[i]!;
    const prevDone = (() => {
      if (prev === "cs_fundamentals") {
        return (
          statusOf("cs_fundamentals") === "completed" || statusOf("aptitude_test") === "completed"
        );
      }
      if (prev === "data_fundamentals") {
        return statusOf("data_fundamentals") === "completed";
      }
      return statusOf(prev) === "completed";
    })();
    if (prevDone && statusOf(cur) === "locked") {
      await prisma.verificationStage.updateMany({
        where: { userId, stageName: cur },
        data: { status: "in_progress" },
      });
      rows = await reload();
    }
  }
}

/** Ensure DSA round is in_progress when prerequisites are completed (aptitude/cs fund or profile for mid/senior). */
async function ensureDsaRoundActiveForOfficialApis(userId: string): Promise<boolean> {
  const already = await prisma.verificationStage.findFirst({
    where: { userId, stageName: "dsa_round", status: "in_progress" },
  });
  if (already) return true;

  const profile = await prisma.jobSeekerProfile.findUnique({
    where: { userId },
    select: { experienceYears: true, roleType: true },
  });
  if ((profile?.roleType ?? "technical") === "non_technical") return false;

  const dsa = await prisma.verificationStage.findFirst({ where: { userId, stageName: "dsa_round" } });
  if (!dsa || dsa.status !== "locked") return false;

  if (!isVerificationPipelineV2()) {
    const apt = await prisma.verificationStage.findFirst({
      where: { userId, stageName: "aptitude_test", status: "completed" },
    });
    if (apt) {
      await prisma.verificationStage.updateMany({
        where: { userId, stageName: "dsa_round" },
        data: { status: "in_progress" },
      });
      return true;
    }
    return false;
  }

  const tier = experienceTierFromYears(profile?.experienceYears);
  if (tier === "fresher") {
    const ok =
      (await prisma.verificationStage.findFirst({
        where: { userId, stageName: "cs_fundamentals", status: "completed" },
      })) ||
      (await prisma.verificationStage.findFirst({
        where: { userId, stageName: "aptitude_test", status: "completed" },
      }));
    if (ok) {
      await prisma.verificationStage.updateMany({
        where: { userId, stageName: "dsa_round" },
        data: { status: "in_progress" },
      });
      return true;
    }
  } else {
    const profDone = await prisma.verificationStage.findFirst({
      where: { userId, stageName: "profile_setup", status: "completed" },
    });
    if (profDone) {
      await prisma.verificationStage.updateMany({
        where: { userId, stageName: "dsa_round" },
        data: { status: "in_progress" },
      });
      return true;
    }
  }
  return false;
}

verificationRouter.get("/stages", requireAuth, requireJobSeeker, async (req: AuthedRequest, res) => {
  try {
    const profile = await prisma.jobSeekerProfile.findUnique({ where: { userId: req.user!.id } });
    const roleType = (profile?.roleType as string) || "technical";
    const { neededStages, profileSetupCompleted: profileSetupDoneForResponse } = await resolveNeededVerificationStages(
      req.user!.id,
      profile
    );

    await ensureVerificationPipelineStages(req.user!.id, neededStages);
    const canonicalTrack = roleTypeToTrack(roleType);
    if (canonicalTrack === "software") {
      await syncLegacyAptitudeToCsFundamentals(req.user!.id);
    }
    await reconcileVerificationStages(req.user!.id);
    const [stages, certification] = await Promise.all([
      prisma.verificationStage.findMany({ where: { userId: req.user!.id } }),
      calculateCertificationLevel(req.user!.id),
    ]);
    const track =
      canonicalTrack === "non_technical"
        ? profileSetupDoneForResponse
          ? experienceTierFromYears(profile?.experienceYears)
          : null
        : !profileSetupDoneForResponse
          ? null
          : experienceTierFromYears(profile?.experienceYears);
    return res.json({
      stages: toStageResponse(stages),
      roleType,
      verification_pipeline_v2: isVerificationPipelineV2(),
      verification_track: track,
      pipeline_pending_profile_setup: !profileSetupDoneForResponse,
      stage_order: neededStages,
      certification_level: certification.level,
      certification_label: certification.label,
      certificationLevel: certification.certificationLevel ?? null,
      certificationLabelShort: certification.certificationLabel ?? null,
    });
  } catch (e) {
    console.error("[verification/stages]", e);
    return res.status(500).json({ error: e instanceof Error ? e.message : "Failed to load stages" });
  }
});

/** GET /api/verification/skills - Skill validity status (aptitude, live_coding, interview) */
verificationRouter.get("/skills", requireAuth, requireJobSeeker, async (req: AuthedRequest, res) => {
  try {
    const profile = await prisma.jobSeekerProfile.findUnique({ where: { userId: req.user!.id } });
    const track = roleTypeToTrack(profile?.roleType);
    if (track === "non_technical") {
      return res.json({ aptitude: null, live_coding: null, interview: null });
    }
    const skills = await getSkillVerifications(req.user!.id);
    return res.json(skills);
  } catch (e) {
    console.error("[verification/skills]", e);
    return res.status(500).json({ error: e instanceof Error ? e.message : "Failed to load skills" });
  }
});

verificationRouter.post("/stages/update", requireAuth, requireJobSeeker, async (req: AuthedRequest, res) => {
  const schema = z.object({ stageName: z.string(), status: z.string(), score: z.number().optional() });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid payload" });
  const { stageName, status } = parsed.data;
  const userId = req.user!.id;

  const profile = await prisma.jobSeekerProfile.findUnique({ where: { userId } });
  const roleType = (profile?.roleType as string) || "technical";
  const allowed = allowedVerificationStageNames(roleType);
  if (!allowed.has(stageName)) {
    return res.status(400).json({ error: "Invalid stage for your verification path" });
  }

  const existing = await prisma.verificationStage.findFirst({
    where: { userId, stageName },
  });

  if (!existing && stageName === "human_expert_interview") {
    const elig = await getHumanInterviewEligibility(userId);
    if (elig.block_human_interview_section || !elig.can_access_slots) {
      return res.status(403).json({ error: "Human expert interview is not available yet." });
    }
    await prisma.verificationStage.upsert({
      where: { userId_stageName: { userId, stageName } },
      create: { userId, stageName, status: "in_progress", score: null },
      update: { status: "in_progress" },
    });
    return res.json({ updated: 1 });
  }

  if (!existing) {
    // Auto-create if the stage is in the allowed set (handles race between GET /stages and POST /stages/update)
    if (allowed.has(stageName)) {
      await prisma.verificationStage.upsert({
        where: { userId_stageName: { userId, stageName } },
        create: { userId, stageName, status: status as string, score: parsed.data.score ?? null },
        update: { status: status as string },
      });
      return res.json({ updated: 1 });
    }
    return res.status(404).json({ error: "Unknown verification stage" });
  }

  if (status === "in_progress" && existing.status !== "in_progress") {
    const gate = await gatePaidVerificationStageInProgress(userId, stageName, existing.status);
    if (!gate.ok) {
      return res.status(gate.status).json(gate.body);
    }
  }

  if (stageName === "human_expert_interview" && (status === "completed" || status === "failed")) {
    return res.status(403).json({
      error: "This stage is finalized only when your expert interviewer submits your evaluation.",
    });
  }

  const updateData: { status: string; score?: number | null } = { status };

  if (
    (stageName === "aptitude_test" ||
      stageName === "cs_fundamentals" ||
      stageName === "data_fundamentals" ||
      stageName === "domain_fundamentals") &&
    (status === "completed" || status === "failed")
  ) {
    const row = await prisma.aptitudeTestResult.findFirst({
      where: { userId },
      orderBy: { completedAt: "desc" },
    });
    if (!row) return res.status(400).json({ error: "No aptitude attempt on record." });
    const built = buildAptitudeLatestResult(row);
    const passed = built.percentage >= 60;
    if (status === "completed" && !passed) {
      return res.status(400).json({
        error: "Pass the assessment (60% or higher) to mark this step complete.",
      });
    }
    if (status === "failed" && passed) {
      return res.status(400).json({ error: "Your latest attempt passed; you cannot mark this step as failed." });
    }
    updateData.score = built.percentage;
  } else if (stageName === "dsa_round" && (status === "completed" || status === "failed")) {
    const row = await prisma.dsaRoundResult.findFirst({
      where: { userId },
      orderBy: { completedAt: "desc" },
    });
    if (!row || row.score == null) {
      return res.status(400).json({ error: "Finish and submit the DSA round first." });
    }
    const s = Math.round(row.score);
    const tier = experienceTierFromYears(profile?.experienceYears);
    const dsaMin = dsaTierConfig(tier).passThresholdPercent;
    if (status === "completed" && s < dsaMin) {
      return res.status(400).json({ error: `Minimum score ${dsaMin} required to complete this step.` });
    }
    if (status === "failed" && s >= dsaMin) {
      return res.status(400).json({ error: "Your latest DSA score passes; use Continue instead of failing." });
    }
    updateData.score = s;
  } else if (stageName === "data_round" && (status === "completed" || status === "failed")) {
    const row = await prisma.dataRoundResult.findFirst({
      where: { userId },
      orderBy: { completedAt: "desc" },
    });
    if (!row || row.score == null) {
      return res.status(400).json({ error: "Finish and submit the Data round first." });
    }
    const s = Math.round(row.score);
    const tier = experienceTierFromYears(profile?.experienceYears);
    const dataMin = dataRoundTierConfig(tier).passThresholdPercent;
    if (status === "completed" && s < dataMin) {
      return res.status(400).json({ error: `Minimum score ${dataMin} required to complete this step.` });
    }
    if (status === "failed" && s >= dataMin) {
      return res.status(400).json({ error: "Your latest Data round score passes; use Continue instead of failing." });
    }
    updateData.score = s;
  } else if (
    (stageName === "ai_skills_interview" || stageName === "data_skills_interview") &&
    status === "completed"
  ) {
    const iv = await prisma.interview.findFirst({
      where: { userId, interviewType: "ai_skills", status: "completed" },
      orderBy: { completedAt: "desc" },
      select: { totalScore: true },
    });
    if (!iv) {
      if (!allowPlaceholderVerificationCompletion()) {
        return res.status(400).json({ error: "Complete the AI Skills interview in-platform before marking this step complete." });
      }
    } else {
      updateData.score = iv.totalScore != null ? Math.round(iv.totalScore) : null;
    }
  } else if (stageName === "data_system_design" && status === "completed") {
    const iv = await prisma.interview.findFirst({
      where: { userId, interviewType: "system_design", status: "completed" },
      orderBy: { completedAt: "desc" },
      select: { totalScore: true, questionPlan: true },
    });
    const qp = iv?.questionPlan;
    const isSoftwareOnly =
      qp != null && typeof qp === "object" && !Array.isArray(qp) && (qp as { track?: string }).track === "software";
    if (!iv || isSoftwareOnly) {
      if (!allowPlaceholderVerificationCompletion()) {
        return res.status(400).json({
          error: "Complete the Data System Design interview in-platform before marking this step complete.",
        });
      }
    } else {
      updateData.score = iv.totalScore != null ? Math.round(iv.totalScore) : null;
    }
  } else if (stageName === "system_design_interview" && status === "completed") {
    const iv = await prisma.interview.findFirst({
      where: { userId, interviewType: "system_design", status: "completed" },
      orderBy: { completedAt: "desc" },
      select: { totalScore: true, questionPlan: true },
    });
    const qp = iv?.questionPlan;
    const isSoftwareTrack =
      qp != null && typeof qp === "object" && !Array.isArray(qp) && (qp as { track?: string }).track === "software";
    if (!iv || !isSoftwareTrack) {
      if (!allowPlaceholderVerificationCompletion()) {
        return res.status(400).json({
          error: "Complete the System Design interview in-platform before marking this step complete.",
        });
      }
    } else {
      updateData.score = iv.totalScore != null ? Math.round(iv.totalScore) : null;
    }
  } else if (stageName === "expert_interview" && status === "completed") {
    const interview = await prisma.interview.findFirst({
      where: { userId, status: "completed" },
      orderBy: { completedAt: "desc" },
    });
    if (!interview) {
      return res.status(400).json({ error: "Finish the AI interview before marking this step complete." });
    }
    updateData.score = interview.totalScore != null ? Math.round(interview.totalScore) : null;
  } else if (stageName === "non_tech_assignment" && status === "completed") {
    if (existing.status !== "completed") {
      return res.status(400).json({ error: "Submit the assignment through the official flow first." });
    }
    updateData.score = existing.score ?? null;
  } else if (stageName === "non_tech_assignment" && status === "failed") {
    if (existing.status === "failed") {
      updateData.score = existing.score ?? null;
    } else if (existing.status === "in_progress") {
      // Proctoring can fail the step before any written submission is graded.
      updateData.score = 0;
    } else {
      return res.status(400).json({ error: "Invalid assignment stage transition." });
    }
  }

  const updated = await prisma.verificationStage.updateMany({
    where: { userId, stageName },
    data: updateData,
  });

  if (stageName === "profile_setup" && status === "completed") {
    // Auto-detect track from job title when profile_setup completes
    const freshProfile = await prisma.jobSeekerProfile.findUnique({ where: { userId } });
    const currentRoleType = freshProfile?.roleType ?? "technical";
    if (currentRoleType === "technical") {
      const detected = detectTrack(freshProfile?.targetJobTitle);
      if (detected === "data") {
        await prisma.jobSeekerProfile.update({ where: { userId }, data: { roleType: "data" } });
      }
    }
    const updatedProfile = await prisma.jobSeekerProfile.findUnique({ where: { userId } });
    const rtFinal = updatedProfile?.roleType ?? "technical";
    const title = updatedProfile?.targetJobTitle;
    const subtrackPatch =
      rtFinal === "non_technical"
        ? { nonTechSubtrack: detectNonTechSubtrack(title), dataSubtrack: null as string | null }
        : rtFinal === "data"
          ? { dataSubtrack: detectDataSubtrack(title), nonTechSubtrack: null as string | null }
          : { nonTechSubtrack: null as string | null, dataSubtrack: null as string | null };
    await prisma.jobSeekerProfile.update({ where: { userId }, data: subtrackPatch });
    const profileForStages = await prisma.jobSeekerProfile.findUnique({ where: { userId } });
    const { neededStages } = await resolveNeededVerificationStages(userId, profileForStages);
    await ensureVerificationPipelineStages(userId, neededStages);
    try {
      await reconcileVerificationStages(userId);
    } catch (e) {
      console.warn("[verification/stages/update] reconcile after profile_setup", e);
    }
  }

  // PRD: After Stage 4 pass (without Stage 5), status should be verified.
  if (stageName === "expert_interview" && status === "completed") {
    const prof = await prisma.jobSeekerProfile.findUnique({
      where: { userId },
      select: { verificationStatus: true },
    });
    if (prof && prof.verificationStatus !== "expert_verified") {
      await prisma.jobSeekerProfile.updateMany({
        where: { userId },
        data: { verificationStatus: "verified" },
      });
    }
  }

  try {
    await syncJobSeekerVerificationStatus(userId);
  } catch (e) {
    console.warn("[verification/stages/update] syncJobSeekerVerificationStatus", e);
  }

  res.json({ updated: updated.count });
});

const bulkAdditiveRowSchema = z.object({
        stageName: z.string().optional(),
        stage_name: z.string().optional(),
        status: z.string(),
});

verificationRouter.post("/stages/bulk", requireAuth, requireJobSeeker, async (req: AuthedRequest, res) => {
  try {
    const userId = req.user!.id;
    const existingCount = await prisma.verificationStage.count({ where: { userId } });
    const profile = await prisma.jobSeekerProfile.findUnique({ where: { userId } });
    const roleType = (profile?.roleType as string) || "technical";
    const allowed = allowedVerificationStageNames(roleType);

    if (existingCount > 0) {
      const rowsSchema = z.object({ stages: z.array(bulkAdditiveRowSchema).min(1) });
      const parsed = rowsSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          error: "Verification stages already exist. Send { stages: [{ stage_name, status }] } to add missing rows only.",
        });
      }
      const data = parsed.data.stages
        .map((row) => {
          const stageName = row.stageName ?? row.stage_name;
          if (!stageName) return null;
          return { userId, stageName, status: row.status };
        })
        .filter((r): r is { userId: string; stageName: string; status: string } => r !== null)
        .filter((r) => allowed.has(r.stageName));
      if (data.length === 0) {
        return res.status(400).json({ error: "No valid stage names to insert for this verification path." });
      }
      await prisma.verificationStage.createMany({ data, skipDuplicates: true });
      return res.json({ ok: true });
    }

    const { neededStages: stagesForPath } = await resolveNeededVerificationStages(userId, profile);
    await prisma.verificationStage.createMany({
      data: stagesForPath.map((stage, index) => ({
        userId,
        stageName: stage,
        status: index === 0 ? "in_progress" : "locked",
      })),
      skipDuplicates: true,
    });
    return res.json({ ok: true });
  } catch (e) {
    console.error("[verification/stages/bulk]", e);
    return res.status(500).json({ error: e instanceof Error ? e.message : "Failed to create stages" });
  }
});

verificationRouter.post("/stages/reset", requireAuth, requireJobSeeker, async (req: AuthedRequest, res) => {
  const schema = z.object({ stageName: z.string() });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid payload" });
  const profile = await prisma.jobSeekerProfile.findUnique({ where: { userId: req.user!.id } });
  const roleType = (profile?.roleType as string) || "technical";
  const { neededStages: stageOrder } = await resolveNeededVerificationStages(req.user!.id, profile);
  const currentIndex = stageOrder.indexOf(parsed.data.stageName);
  if (currentIndex < 0) return res.status(400).json({ error: "Invalid stage for this path" });
  if (
    parsed.data.stageName === "aptitude_test" ||
    parsed.data.stageName === "cs_fundamentals" ||
    parsed.data.stageName === "data_fundamentals" ||
    parsed.data.stageName === "domain_fundamentals"
  ) {
    if (await sendIfAptitudeLocked(req.user!.id, res)) return;
    await clearAptitudeSession(req.user!.id);
  }
  if (parsed.data.stageName === "dsa_round") {
    const uid = req.user!.id;
    await prisma.dsaSubmission.deleteMany({ where: { userId: uid } });
    await prisma.dsaRoundResult.deleteMany({ where: { userId: uid } });
  }
  if (parsed.data.stageName === "data_round") {
    const uid = req.user!.id;
    await prisma.dataRoundSubmission.deleteMany({ where: { userId: uid } });
    await prisma.dataRoundResult.deleteMany({ where: { userId: uid } });
  }
  await Promise.all(
    stageOrder.slice(currentIndex).map((stage, i) => {
      const status = i === 0 ? "in_progress" : "locked";
      return prisma.verificationStage.updateMany({
        where: { userId: req.user!.id, stageName: stage },
        data: { status, score: null },
      });
    })
  );
  res.json({ ok: true });
});

function aptitudeTimeLimitMinutesForQuestionSet(questionSet: string | null | undefined): number {
  if (questionSet === "non_tech_domain_fundamentals") return NON_TECH_DOMAIN_FUNDAMENTALS_CONFIG.timeLimitMinutes;
  return 30;
}

/** GET cognitive assessment questions. */
verificationRouter.get("/aptitude/questions", requireAuth, requireJobSeeker, async (req: AuthedRequest, res) => {
  try {
    if (await sendIfAptitudeLocked(req.user!.id, res)) return;
    let experienceYears = 0;
    let profileRoleType = "technical";
    let targetJobTitle: string | null = null;
    try {
      const profile = await prisma.jobSeekerProfile.findUnique({ where: { userId: req.user!.id } });
      experienceYears = profile?.experienceYears ?? 0;
      profileRoleType = profile?.roleType ?? "technical";
      targetJobTitle = profile?.targetJobTitle ?? null;
    } catch (profileErr) {
      console.warn("[verification/aptitude/questions] profile read failed; using default experience band", profileErr);
    }
    const tier = experienceTierFromYears(experienceYears);
    const track = roleTypeToTrack(profileRoleType);
    if (track === "non_technical" && tier !== "fresher") {
      return res
        .status(400)
        .json({ error: "This assessment is only for fresher candidates on the non-technical track." });
    }
    const desiredQuestionSet =
      track === "data"
        ? dataQuestionSetForTier(tier)
        : track === "non_technical"
          ? "non_tech_domain_fundamentals"
          : questionSetForTier(tier);
    let existing: Awaited<ReturnType<typeof getAptitudeSession>> = null;
    try {
      existing = await getAptitudeSession(req.user!.id);
    } catch (readErr) {
      console.warn("[verification/aptitude/questions] could not read session row (will issue new set)", readErr);
    }
    if (
      existing?.questions &&
      existing?.answerKey &&
      existing?.marksKey &&
      (existing.questionSet ?? desiredQuestionSet) === desiredQuestionSet
    ) {
      const questions = existing.questions as any[];
      const totalMarks =
        existing.marksKey && typeof existing.marksKey === "object"
          ? Object.values(existing.marksKey as Record<string, number>).reduce((a, b) => a + (Number(b) || 0), 0)
          : questions.length;
      const passThreshold = Math.ceil(totalMarks * 0.6);
      const qs = existing.questionSet ?? desiredQuestionSet;
      return res.json({
        questions,
        timeLimitMinutes: aptitudeTimeLimitMinutesForQuestionSet(qs),
        totalMarks,
        passThreshold,
        draft: existing.draft ?? null,
        questionSet: qs,
        experienceTier: tier,
      });
    }

    const { questions, answerKey, marksKey, totalMarks, passThreshold } = createAptitudeSessionByQuestionSet(
      desiredQuestionSet,
      experienceYears,
      { jobTitle: targetJobTitle },
    );
    try {
      await storeAptitudeSession(req.user!.id, questions, answerKey, marksKey, desiredQuestionSet);
    } catch (persistErr) {
      console.warn(
        "[verification/aptitude/questions] Prisma session persist failed — using in-memory answer key for this instance",
        persistErr,
      );
      storeMemoryAptitudeSession(req.user!.id, answerKey, marksKey, desiredQuestionSet);
    }
    return res.json({
      questions,
      timeLimitMinutes: aptitudeTimeLimitMinutesForQuestionSet(desiredQuestionSet),
      totalMarks,
      passThreshold,
      draft: null,
      questionSet: desiredQuestionSet,
      experienceTier: tier,
    });
  } catch (e) {
    console.error("[verification/aptitude/questions]", e);
    if (e instanceof Prisma.PrismaClientKnownRequestError) {
      if (e.code === "P2022" || e.code === "P2021") {
        return res.status(503).json({
          error:
            "Verification database is updating. Wait a minute and try again, or contact support if this persists.",
        });
      }
    }
    const msg = e instanceof Error ? e.message : String(e);
    if (/aptitude-questions\.json|ENOENT/i.test(msg)) {
      return res.status(500).json({ error: "Cognitive question bank is missing on the server. Please contact support." });
    }
    return res.status(500).json({ error: "Failed to load aptitude questions" });
  }
});

verificationRouter.post("/aptitude/draft", requireAuth, requireJobSeeker, async (req: AuthedRequest, res) => {
  try {
    if (await sendIfAptitudeLocked(req.user!.id, res)) return;
    const schema = z.object({
      answers: z.record(z.string(), z.string()).optional(),
      reviewed: z.array(z.string()).optional(),
      visited: z.array(z.string()).optional(),
      currentIndex: z.number().int().nonnegative().optional(),
      secondsRemaining: z.number().int().nonnegative().optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid payload" });
    await updateAptitudeDraft(req.user!.id, parsed.data);
    return res.json({ ok: true });
  } catch (e) {
    console.error("[verification/aptitude/draft]", e);
    return res.status(500).json({ error: "Failed to save progress" });
  }
});

/** GET 2-3 practice aptitude questions (no session, no scoring). Public - no auth required. */
verificationRouter.get("/aptitude/practice", async (_req, res) => {
  try {
    const questions = getPracticeAptitudeQuestions();
    return res.json({ questions });
  } catch (e) {
    console.error("[verification/aptitude/practice]", e);
    return res.status(500).json({ error: "Failed to load practice questions" });
  }
});

verificationRouter.post("/aptitude", requireAuth, requireJobSeeker, async (req: AuthedRequest, res) => {
  try {
    if (await sendIfAptitudeLocked(req.user!.id, res)) return;
    const schema = z.object({
      score: z.number().optional(),
      answers: z.record(z.string(), z.string()).optional(), // { questionId: selectedOption }
      meta: z
        .object({
          timeTakenSeconds: z.number().nonnegative().optional(),
          timeLimitSeconds: z.number().positive().optional(),
        })
        .optional(),
      invalidated: z.boolean().optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid payload" });

    let score: number;
    let answersPayload: Record<string, unknown> | null = null;

    if (parsed.data.invalidated) {
      score = 0;
      answersPayload = { reason: "invalidated" };
    } else if (
      parsed.data.answers &&
      typeof parsed.data.answers === "object" &&
      !Array.isArray(parsed.data.answers)
    ) {
      const session = await resolveAptitudeSubmitSession(req.user!.id);
      const answerKey = session?.answerKey ?? null;
      const marksKey = session?.marksKey ?? null;
      if (!answerKey || typeof answerKey !== "object" || Object.keys(answerKey).length === 0) {
        return res.status(400).json({
          error: "Your test session has expired. Please click 'Retry This Step' above, then 'Start Cognitive Assessment' to begin a fresh attempt.",
        });
      }
      const limitMin = aptitudeTimeLimitMinutesForQuestionSet(session?.questionSet);
      const APTITUDE_LIMIT_SEC = limitMin * 60;
      const GRACE_SEC = 120;
      const startedAt = session?.testStartedAt;
      if (startedAt) {
        const elapsedSec = (Date.now() - startedAt.getTime()) / 1000;
        if (elapsedSec > APTITUDE_LIMIT_SEC + GRACE_SEC) {
          return res.status(400).json({
            error: "The aptitude time limit has expired. Use Retry This Step to start a new attempt.",
          });
        }
      }
      let earnedMarks = 0;
      let correctCount = 0;
      let attemptedCount = 0;
      const answersIncoming = parsed.data.answers as Record<string, string>;
      const allQuestionIds = Object.keys(answerKey);
      for (const qId of allQuestionIds) {
        const selectedRaw = answersIncoming[qId];
        const selected = typeof selectedRaw === "string" ? selectedRaw : "";
        if (selected.trim().length === 0) continue;
        attemptedCount++;
        const expected = answerKey[qId];
        const qMarks = marksKey?.[qId] ?? 1;
        if (expected != null && normalizeAnswer(selected) === normalizeAnswer(expected)) {
          earnedMarks += qMarks;
          correctCount++;
        }
      }
      score = earnedMarks; // Raw earned marks (total varies 25–35 by experience). Pass threshold 60%.
      const totalMarksVal = marksKey ? Object.values(marksKey).reduce((a, b) => a + b, 0) : Object.keys(answerKey).length;
      const totalQuestions = allQuestionIds.length;
      const skippedCount = Math.max(0, totalQuestions - attemptedCount);
      const incorrectCount = Math.max(0, attemptedCount - correctCount);
      answersPayload = {
        questions: totalQuestions,
        correct: correctCount,
        incorrect: incorrectCount,
        skipped: skippedCount,
        earnedMarks,
        totalMarks: totalMarksVal,
        ...(parsed.data.meta?.timeTakenSeconds != null ? { timeTakenSeconds: parsed.data.meta.timeTakenSeconds } : {}),
        ...(parsed.data.meta?.timeLimitSeconds != null ? { timeLimitSeconds: parsed.data.meta.timeLimitSeconds } : {}),
      };
      await clearAptitudeSession(req.user!.id);
    } else {
      return res.status(400).json({ error: "Submit answers from the test session, or use the invalidation flag when required." });
    }

    const answersToStore = answersPayload ?? (parsed.data.answers && typeof parsed.data.answers === "object" ? parsed.data.answers : undefined);
    const completedAt = new Date();
    const result = await prisma.aptitudeTestResult.create({
      data: {
        userId: req.user!.id,
        score,
        ...(answersToStore !== undefined ? { answers: answersToStore as object } : {}),
        invalidated: Boolean(parsed.data.invalidated),
      },
    });
    await applyAptitudeLockoutIfNeeded(req.user!.id);
    // Store 0–100 percentage in VerificationStage and CandidateSkillVerification for consistent display with DSA/AI
    const totalMarksForPct = answersToStore && typeof (answersToStore as { totalMarks?: number }).totalMarks === "number"
      ? (answersToStore as { totalMarks: number }).totalMarks
      : 0;
    const scoreToStore = totalMarksForPct > 0
      ? Math.round((score / totalMarksForPct) * 100)
      : Math.min(100, Math.max(0, Math.round(score)));
    const profileForStage = await prisma.jobSeekerProfile.findUnique({
      where: { userId: req.user!.id },
      select: { roleType: true },
    });
    const aptStageNames =
      roleTypeToTrack(profileForStage?.roleType) === "non_technical"
        ? (["domain_fundamentals"] as const)
        : (["cs_fundamentals", "aptitude_test", "data_fundamentals"] as const);
    const existingStage = await prisma.verificationStage.findFirst({
      where: { userId: req.user!.id, stageName: { in: [...aptStageNames] } },
      orderBy: { updatedAt: "desc" },
    });
    if (existingStage) {
      await prisma.verificationStage.update({
        where: { id: existingStage.id },
        data: { score: scoreToStore },
      });
    }
    await upsertSkillVerification(req.user!.id, "APTITUDE", scoreToStore, completedAt);
    const breakdown =
      answersPayload && typeof answersPayload === "object"
        ? {
            totalQuestions: Number((answersPayload as any).questions ?? 0),
            correct: Number((answersPayload as any).correct ?? 0),
            incorrect: Number((answersPayload as any).incorrect ?? 0),
            skipped: Number((answersPayload as any).skipped ?? 0),
            earnedMarks: Number((answersPayload as any).earnedMarks ?? score ?? 0),
            totalMarks: Number((answersPayload as any).totalMarks ?? 0),
          }
        : null;
    return res.json({ result, score, breakdown });
  } catch (err) {
    const code = err && typeof err === "object" && "code" in err ? (err as { code: string }).code : null;
    const isDb = code === "P1001" || code === "P1002" || code === "P2021" || code === "P2003";
    console.error("[verification/aptitude]", err);
    if (isDb) {
      const hint =
        process.env.NODE_ENV !== "production"
          ? " If running locally, ensure PostgreSQL is running and run: cd server && npx prisma migrate deploy"
          : "";
      return res.status(503).json({
        error: `Database temporarily unavailable. Please try again in a moment.${hint}`,
      });
    }
    return res.status(500).json({ error: "Failed to submit Cognitive Assessment. Please try again." });
  }
});

function normalizeAnswer(s: string): string {
  return (s || "").toString().trim().toLowerCase();
}

verificationRouter.get("/aptitude/latest", requireAuth, requireJobSeeker, async (req: AuthedRequest, res) => {
  const row = await prisma.aptitudeTestResult.findFirst({
    where: { userId: req.user!.id },
    orderBy: { completedAt: "desc" },
  });
  const result = row ? buildAptitudeLatestResult(row) : null;
  res.json({ result });
});

// ---------------------------------------------------------------------------
// DSA questions + test runner API (backend-side, no test cases on the client)
// ---------------------------------------------------------------------------

// DSA role/experience difficulty distribution (mirrors src/data/dsaRoleDifficulty.ts)
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

function getCombinedDistribution(jobTitle: string | null | undefined, experienceYears: number): {
  easy: number;
  medium: number;
  hard: number;
} | null {
  const category = getRoleCategory(jobTitle);
  if (category === "analytics") return null;
  const roleDist = ROLE_DISTRIBUTION[category] ?? ROLE_DISTRIBUTION.unknown;
  if (!roleDist) return null;
  const expBucket = getExperienceBucket(experienceYears);
  const expDist = EXPERIENCE_DISTRIBUTION[expBucket];
  if (!expDist) return roleDist;
  const blend = (a: number, b: number) => Math.round(a * 0.6 + b * 0.4);
  return { easy: blend(roleDist.easy, expDist.easy), medium: blend(roleDist.medium, expDist.medium), hard: blend(roleDist.hard, expDist.hard) };
}

/** Aggregate 0–100 score from latest official submission per question (Judge0 results). */
async function computeOfficialDsaRoundScoreFromDb(userId: string): Promise<number | null> {
  const subs = await prisma.dsaSubmission.findMany({
    where: { userId, isOfficial: true },
    orderBy: { submittedAt: "desc" },
    select: { questionId: true, passedCount: true, totalCount: true },
  });
  if (subs.length === 0) return null;
  const byQ = new Map<string, { passed: number; total: number }>();
  for (const s of subs) {
    if (!byQ.has(s.questionId)) {
      byQ.set(s.questionId, { passed: s.passedCount, total: s.totalCount });
    }
  }
  if (byQ.size === 0) return null;
  let sum = 0;
  for (const { passed, total } of byQ.values()) {
    if (total <= 0) continue;
    sum += Math.round((passed / total) * 100);
  }
  return Math.round(sum / byQ.size);
}

function shuffleDsaPool<T>(items: T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

function pickDsaOfficialSet<T extends { id: string; difficulty: string }>(
  pool: T[],
  tier: ReturnType<typeof experienceTierFromYears>,
): T[] {
  const cfg = dsaTierConfig(tier);
  const slots = cfg.difficultySlots;
  if (slots?.length) {
    const used = new Set<string>();
    const out: T[] = [];
    for (const d of slots) {
      const candidates = shuffleDsaPool(pool.filter((q) => q.difficulty === d && !used.has(q.id)));
      const pick = candidates[0];
      if (pick) {
        out.push(pick);
        used.add(pick.id);
      }
    }
    if (out.length >= cfg.questionCount) return out.slice(0, cfg.questionCount);
    const allowed = new Set(cfg.difficulties);
    const filler = shuffleDsaPool(pool.filter((q) => allowed.has(q.difficulty as "Easy" | "Medium" | "Hard") && !used.has(q.id)));
    for (const q of filler) {
      out.push(q);
      used.add(q.id);
      if (out.length >= cfg.questionCount) break;
    }
    return out.slice(0, cfg.questionCount);
  }
  const allowed = new Set(cfg.difficulties);
  let candidates = pool.filter((q) => allowed.has(q.difficulty as "Easy" | "Medium" | "Hard"));
  if (candidates.length < cfg.questionCount) {
    candidates = [...pool];
  }
  return shuffleDsaPool(candidates).slice(0, cfg.questionCount);
}

verificationRouter.post("/dsa", requireAuth, requireJobSeeker, async (req: AuthedRequest, res) => {
  const schema = z.object({
    score: z.number().optional(),
    answers: z.any().optional(),
    invalidated: z.boolean().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid payload" });
  const userId = req.user!.id;

  const profile = await prisma.jobSeekerProfile.findUnique({
    where: { userId },
    select: { targetJobTitle: true, experienceYears: true, roleType: true },
  });
  const profileTrack = roleTypeToTrack(profile?.roleType);
  if (profileTrack === "non_technical") {
    return res.status(400).json({ error: "DSA/Data round applies only to technical or data verification paths." });
  }

  let dsaScore: number | null = null;
  let answersPayload: unknown =
    parsed.data.answers === undefined ? null : parsed.data.answers;

  if (parsed.data.invalidated) {
    dsaScore = 0;
    answersPayload = { reason: "invalidated" };
  } else {
    const dist = getCombinedDistribution(profile?.targetJobTitle ?? null, profile?.experienceYears ?? 0);
    const isWaiver = dist === null;

    const official = await prisma.dsaSubmission.findMany({
      where: { userId, isOfficial: true },
      select: { questionId: true },
    });

    if (isWaiver) {
      if (official.length > 0) {
        return res.status(400).json({ error: "DSA waiver is not valid when coding submissions exist." });
      }
      const apt = await prisma.verificationStage.findFirst({
        where: { userId, stageName: "aptitude_test", status: "completed" },
      });
      if (!apt) {
        return res.status(400).json({ error: "Complete the aptitude step before continuing." });
      }
      dsaScore = 100;
      answersPayload = { waiver: true, reason: "analytics_role" };
    } else {
      const tier = experienceTierFromYears(profile?.experienceYears);
      const cfg = dsaTierConfig(tier);
      const computed = await computeOfficialDsaRoundScoreFromDb(userId);
      if (computed == null) {
        return res.status(400).json({ error: "No official submissions found. Submit every problem before finishing the round." });
      }
      const distinct = new Set(official.map((o) => o.questionId));
      if (distinct.size < cfg.questionCount) {
        return res.status(400).json({
          error: `Submit official solutions for all ${cfg.questionCount} problems before finishing the round.`,
        });
      }
      dsaScore = computed;
    }
  }

  const tierSubmit = experienceTierFromYears(profile?.experienceYears);
  const cfgSubmit = dsaTierConfig(tierSubmit);
  const isWaiverPayload =
    Boolean(answersPayload && typeof answersPayload === "object" && (answersPayload as { waiver?: boolean }).waiver);
  let passed = false;
  if (parsed.data.invalidated) passed = false;
  else if (isWaiverPayload) passed = true;
  else if (dsaScore != null) passed = dsaScore >= cfgSubmit.passThresholdPercent;

  const lastDsa = await prisma.dsaRoundResult.findFirst({
    where: { userId },
    orderBy: { completedAt: "desc" },
  });
  if (lastDsa && Date.now() - lastDsa.completedAt.getTime() < COOLDOWN_DSA_MS) {
    return res.status(402).json({
      code: "COOLDOWN",
      message: "Wait 48 hours between DSA round submissions.",
      nextAvailableAt: new Date(lastDsa.completedAt.getTime() + COOLDOWN_DSA_MS).toISOString(),
    });
  }

  const result = await prisma.dsaRoundResult.create({
    data: {
      userId,
      score: dsaScore,
      answers: answersPayload === null ? undefined : (answersPayload as object),
      invalidated: Boolean(parsed.data.invalidated),
    },
  });

  const existingStage = await prisma.verificationStage.findFirst({
    where: { userId, stageName: "dsa_round" },
  });
  const roundedScore = dsaScore != null ? Math.round(dsaScore) : null;
  if (existingStage && roundedScore != null) {
    await prisma.verificationStage.update({
      where: { id: existingStage.id },
      data: { score: roundedScore },
    });
  } else if (!existingStage && roundedScore != null) {
    await prisma.verificationStage.upsert({
      where: { userId_stageName: { userId, stageName: "dsa_round" } },
      create: { userId, stageName: "dsa_round", status: "in_progress", score: roundedScore },
      update: { score: roundedScore },
    });
  }

  if (dsaScore != null) {
    await upsertSkillVerification(userId, "LIVE_CODING", Math.round(dsaScore), new Date());
  }

  try {
    await syncJobSeekerVerificationStatus(userId);
  } catch (e) {
    console.warn("[verification/dsa] syncJobSeekerVerificationStatus", e);
  }

  res.json({
    result,
    score: dsaScore,
    passThresholdPercent: cfgSubmit.passThresholdPercent,
    passed,
  });
});

verificationRouter.get("/dsa/latest", requireAuth, requireJobSeeker, async (req: AuthedRequest, res) => {
  const row = await prisma.dsaRoundResult.findFirst({
    where: { userId: req.user!.id },
    orderBy: { completedAt: "desc" },
  });
  const profile = await prisma.jobSeekerProfile.findUnique({
    where: { userId: req.user!.id },
    select: { experienceYears: true },
  });
  const tier = experienceTierFromYears(profile?.experienceYears);
  const score = row?.score ?? 0;
  const totalProblems = dsaTierConfig(tier).questionCount;
  const result = row
    ? {
        total_score: score,
        problems_solved: Math.min(totalProblems, Math.max(0, Math.round((score / 100) * totalProblems))),
        total_problems: totalProblems,
      }
    : null;
  res.json({ result });
});

function distributionToCounts(
  dist: { easy: number; medium: number; hard: number },
  total: number
): { easy: number; medium: number; hard: number } {
  const sum = dist.easy + dist.medium + dist.hard;
  if (sum <= 0) return { easy: total, medium: 0, hard: 0 };
  return {
    easy: Math.max(0, Math.round((dist.easy / sum) * total)),
    medium: Math.max(0, Math.round((dist.medium / sum) * total)),
    hard: Math.max(0, Math.round((dist.hard / sum) * total)),
  };
}

function generateDSATestByRoleAndExperience(
  targetJobTitle: string | null | undefined,
  experienceYears: number,
  pool: Array<{ difficulty: string }>,
  count: number
): Array<{ difficulty: string }> {
  const dist = getCombinedDistribution(targetJobTitle, experienceYears);
  if (!dist) return [];

  const byDiff = (d: "Easy" | "Medium" | "Hard") =>
    pool.filter((q) => q.difficulty === d).sort(() => Math.random() - 0.5);

  const counts = distributionToCounts(dist, count);
  const questions: Array<{ difficulty: string }> = [];
  questions.push(...byDiff("Easy").slice(0, counts.easy));
  questions.push(...byDiff("Medium").slice(0, counts.medium));
  questions.push(...byDiff("Hard").slice(0, counts.hard));
  return questions.sort(() => Math.random() - 0.5).slice(0, count);
}

/** Bank-seeded rows used placeholder copy; replace with first public test case for display. */
const DSA_EXAMPLE_PLACEHOLDER_SNIPPET = "refer to the problem description";

function dsaExamplesLookPlaceholder(examples: unknown): boolean {
  if (!Array.isArray(examples) || examples.length === 0) return true;
  const first = examples[0] as { input?: unknown; output?: unknown };
  const inStr = String(first?.input ?? "").toLowerCase();
  const outStr = String(first?.output ?? "").toLowerCase();
  return (
    inStr.includes(DSA_EXAMPLE_PLACEHOLDER_SNIPPET) || outStr.includes(DSA_EXAMPLE_PLACEHOLDER_SNIPPET)
  );
}

function dsaMergeExamplesWithSample(
  examples: unknown,
  sample: { input: string; expected: string } | undefined
): unknown {
  if (!sample || !dsaExamplesLookPlaceholder(examples)) return examples;
  return [{ input: sample.input, output: sample.expected }];
}

async function dsaFirstPublicSampleByQuestionId(
  questionIds: string[]
): Promise<Map<string, { input: string; expected: string }>> {
  const map = new Map<string, { input: string; expected: string }>();
  if (questionIds.length === 0) return map;

  const rows = await prisma.dsaTestCase.findMany({
    where: { questionId: { in: questionIds } },
    orderBy: { id: "asc" },
    select: { questionId: true, input: true, expected: true, isHidden: true },
  });

  for (const row of rows) {
    if (map.has(row.questionId)) continue;
    if (row.isHidden) continue;
    map.set(row.questionId, { input: row.input, expected: row.expected });
  }
  for (const row of rows) {
    if (!map.has(row.questionId)) {
      map.set(row.questionId, { input: row.input, expected: row.expected });
    }
  }
  return map;
}

verificationRouter.get("/dsa/questions", requireAuth, requireJobSeeker, async (req: AuthedRequest, res) => {
  const ok = await ensureDsaRoundActiveForOfficialApis(req.user!.id);
  if (!ok) {
    return res.status(403).json({
      error:
        "DSA round is not active yet. Finish the Cognitive Assessment, then open the DSA step from verification (or refresh the page).",
    });
  }

  const profile = await prisma.jobSeekerProfile.findUnique({
    where: { userId: req.user!.id },
    select: { targetJobTitle: true, experienceYears: true },
  });

  const targetJobTitle = profile?.targetJobTitle ?? null;
  const experienceYears = profile?.experienceYears ?? 0;
  const tier = experienceTierFromYears(experienceYears);
  const cfg = dsaTierConfig(tier);

  const pool = await prisma.dsaQuestion.findMany({
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

  const dist = getCombinedDistribution(targetJobTitle, experienceYears);
  const selected =
    dist === null ? ([] as typeof pool) : (pickDsaOfficialSet(pool as { id: string; difficulty: string }[], tier) as typeof pool);

  type PoolItem = (typeof pool)[number];

  const sampleById = await dsaFirstPublicSampleByQuestionId(selected.map((q) => q.id));

  return res.json({
    questions: selected.map((q: PoolItem) => ({
      id: q.id,
      title: q.title,
      description: q.description,
      difficulty: q.difficulty,
      examples: dsaMergeExamplesWithSample(q.examples, sampleById.get(q.id)),
      constraints: q.constraints,
      starterCode: q.starterCode,
    })),
    timeLimitMinutes: cfg.timeLimitMinutes,
    passThresholdPercent: cfg.passThresholdPercent,
    dsaQuestionCount: cfg.questionCount,
    experienceTier: tier,
    dsaWaiver: dist === null,
  });
});

// Practice dialog before the DSA round is started (no "in_progress" stage required).
verificationRouter.get("/dsa/practice-questions", requireAuth, requireJobSeeker, async (req: AuthedRequest, res) => {
  const profile = await prisma.jobSeekerProfile.findUnique({
    where: { userId: req.user!.id },
    select: { targetJobTitle: true, experienceYears: true },
  });

  const targetJobTitle = profile?.targetJobTitle ?? null;
  const experienceYears = profile?.experienceYears ?? 0;

  const pool = await prisma.dsaQuestion.findMany({
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

  const practiceCount = DSA_PRACTICE_COUNT;
  const selected = generateDSATestByRoleAndExperience(
    targetJobTitle,
    experienceYears,
    pool as any,
    practiceCount,
  ) as typeof pool;

  type PoolItem = (typeof pool)[number];

  const sampleById = await dsaFirstPublicSampleByQuestionId(selected.map((q) => q.id));

  return res.json(
    selected.map((q: PoolItem) => ({
      id: q.id,
      title: q.title,
      description: q.description,
      difficulty: q.difficulty,
      examples: dsaMergeExamplesWithSample(q.examples, sampleById.get(q.id)),
      constraints: q.constraints,
      starterCode: q.starterCode,
    }))
  );
});

verificationRouter.post("/dsa/run-tests", requireAuth, requireJobSeeker, async (req: AuthedRequest, res) => {
  const schema = z.object({
    questionId: z.string().min(1),
    code: z.string().min(1).max(100_000),
    language: z.enum(DSA_API_LANGUAGES as unknown as [string, ...string[]]),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid request", details: parsed.error.flatten() });
  }

  const { questionId, code, language } = parsed.data;
  const userId = req.user!.id;

  const rateCheck = checkRateLimit(userId);
  if (!rateCheck.allowed) {
    return res.status(429).json({
      error: "Too many submissions. Please slow down.",
      retryAfter: rateCheck.retryAfterSeconds,
    });
  }

  const dsaOk = await ensureDsaRoundActiveForOfficialApis(userId);
  if (!dsaOk) {
    return res.status(403).json({ error: "DSA round is not active" });
  }

  const testCases = await prisma.dsaTestCase.findMany({
    where: { questionId },
    select: { input: true, expected: true, isHidden: true, expectedType: true, timeoutMs: true },
  });
  if (testCases.length === 0) {
    return res.status(404).json({ error: "Question not found or has no test cases" });
  }

  try {
    const payload = await evaluateDsaAgainstTestCases(testCases, code, language as DsaApiLanguage);

    await persistDsaSubmission(prisma, {
      userId,
      questionId,
      language,
      code,
      passedCount: payload.passed,
      totalCount: payload.total,
      isOfficial: false,
      results: payload.results,
    });

    return res.json({
      compiledSuccessfully: payload.compiledSuccessfully,
      passed: payload.passed,
      total: payload.total,
      ...(payload.compileError ? { compileError: payload.compileError } : {}),
      results: payload.results,
    });
  } catch (err: unknown) {
    console.error("[verification/dsa/run-tests]", err);
    const msg = err instanceof Error ? err.message : "Execution failed";
    return res.status(502).json({ error: msg });
  }
});

verificationRouter.post("/dsa/submit", requireAuth, requireJobSeeker, async (req: AuthedRequest, res) => {
  const schema = z.object({
    questionId: z.string().min(1),
    code: z.string().min(1).max(100_000),
    language: z.enum(DSA_API_LANGUAGES as unknown as [string, ...string[]]),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid request", details: parsed.error.flatten() });
  }

  const { questionId, code, language } = parsed.data;
  const userId = req.user!.id;

  const dsaOkSubmit = await ensureDsaRoundActiveForOfficialApis(userId);
  if (!dsaOkSubmit) {
    return res.status(403).json({ error: "DSA round is not active" });
  }

  const existingOfficial = await prisma.dsaSubmission.findFirst({
    where: { userId, questionId, isOfficial: true },
  });
  if (existingOfficial) {
    return res.status(409).json({ error: "You have already submitted this question." });
  }

  const testCases = await prisma.dsaTestCase.findMany({
    where: { questionId },
    select: { input: true, expected: true, isHidden: true, expectedType: true, timeoutMs: true },
  });
  if (testCases.length === 0) {
    return res.status(404).json({ error: "Question not found or has no test cases" });
  }

  try {
    const payload = await evaluateDsaAgainstTestCases(testCases, code, language as DsaApiLanguage);

    await persistDsaSubmission(prisma, {
      userId,
      questionId,
      language,
      code,
      passedCount: payload.passed,
      totalCount: payload.total,
      isOfficial: true,
      results: payload.results,
    });

    return res.json({
      compiledSuccessfully: payload.compiledSuccessfully,
      passed: payload.passed,
      total: payload.total,
      ...(payload.compileError ? { compileError: payload.compileError } : {}),
      results: payload.results,
      submitted: true,
    });
  } catch (err: unknown) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return res.status(409).json({ error: "You have already submitted this question." });
    }
    console.error("[verification/dsa/submit]", err);
    const msg = err instanceof Error ? err.message : "Execution failed";
    return res.status(502).json({ error: msg });
  }
});

verificationRouter.get("/technical-scorecard", requireAuth, requireJobSeeker, async (req: AuthedRequest, res) => {
  const profile = await prisma.jobSeekerProfile.findUnique({
    where: { userId: req.user!.id },
    select: { roleType: true },
  });
  if ((profile?.roleType ?? "technical") !== "technical") {
    return res.status(400).json({ error: "Technical scorecard is only available for technical candidates." });
  }

  const scorecard = await buildTechnicalScorecard(req.user!.id);

  // Human Expert stage is unlocked only after admin approval (+ payment when required).
  // Shortlist on the scorecard remains informational for the candidate UI.

  return res.json(scorecard);
});

verificationRouter.get("/non-tech-assignment/prompt", requireAuth, requireJobSeeker, async (req: AuthedRequest, res) => {
  const userId = req.user!.id;
  const rawHobby = req.query["hobby"];
  const hobbyQuery = typeof rawHobby === "string" ? rawHobby.trim() : "";

  const profile = await prisma.jobSeekerProfile.findUnique({
    where: { userId },
    select: {
      roleType: true,
      targetJobTitle: true,
      experienceYears: true,
      nonTechSubtrack: true,
      nonTechAssignmentSubmitCount: true,
    },
  });
  if ((profile?.roleType ?? "technical") !== "non_technical") {
    return res.status(400).json({ error: "Not on the non-technical verification path." });
  }
  if (!profile) {
    return res.status(400).json({ error: "Profile not found." });
  }
  const tier = experienceTierFromYears(profile.experienceYears);
  const threshold = tier === "senior" ? 65 : 60;
  const assignRow = await prisma.verificationStage.findFirst({
    where: { userId, stageName: "non_tech_assignment" },
  });
  if (assignRow?.status === "completed" && assignRow.score != null && assignRow.score >= threshold) {
    return res.status(400).json({ error: "already_completed", message: "You have already passed this assignment." });
  }

  const now = new Date();
  await prisma.nonTechAssignment.updateMany({
    where: { userId, status: "active", deadline: { lt: now } },
    data: { status: "expired" },
  });

  let row = await prisma.nonTechAssignment.findFirst({
    where: { userId, status: "active", deadline: { gt: now } },
    orderBy: { issuedAt: "desc" },
  });

  const submitCount = profile.nonTechAssignmentSubmitCount ?? 0;
  if (!row) {
    const lastExpired = await prisma.nonTechAssignment.findFirst({
      where: { userId, status: "expired" },
      orderBy: { issuedAt: "desc" },
    });
    if (lastExpired && lastExpired.attemptIndex === submitCount) {
      return res.status(400).json({
        error: "assignment_expired",
        message: "Your assignment window has closed.",
        deadline: lastExpired.deadline.toISOString(),
      });
    }
  }

  if (!row) {
    if (!hobbyQuery) {
      return res.json({
        needsHobbySelection: true as const,
        hobbyCategories: hobbyCategoriesForClient(),
      });
    }
    if (!isValidHobbyCategoryId(hobbyQuery)) {
      return res.status(400).json({
        error: "invalid_hobby",
        message: "Choose a valid topic category from the list.",
      });
    }
    const sub: NonTechSubtrack =
      (profile.nonTechSubtrack as NonTechSubtrack | null) ?? detectNonTechSubtrack(profile.targetJobTitle);
    const attemptIndex = submitCount;
    const promptText = buildHobbyMagazineAssignmentPrompt({
      hobbyCategoryId: hobbyQuery,
      experienceTier: tier,
      attemptIndex,
    });
    const issuedAt = new Date();
    const deadline = new Date(issuedAt.getTime() + 48 * 60 * 60 * 1000);
    row = await prisma.nonTechAssignment.create({
      data: {
        userId,
        subtrack: sub,
        hobbyCategory: hobbyQuery,
        experienceTier: tier,
        prompt: promptText,
        issuedAt,
        deadline,
        status: "active",
        attemptIndex,
      },
    });
  }

  if (row.deadline <= now) {
    return res.status(400).json({
      error: "assignment_expired",
      message: "Your assignment window has closed.",
      deadline: row.deadline.toISOString(),
    });
  }

  const hoursRemaining = Math.max(0, (row.deadline.getTime() - Date.now()) / (1000 * 60 * 60));
  const timeLimitMinutes = tier === "fresher" ? 120 : tier === "mid" ? 150 : 180;
  const hobbyMeta = row.hobbyCategory ? getHobbyCategoryMeta(row.hobbyCategory) : undefined;
  return res.json({
    needsHobbySelection: false as const,
    prompt: row.prompt,
    threshold,
    timeLimitMinutes,
    subtrack: row.subtrack,
    hobbyCategory: row.hobbyCategory ?? undefined,
    hobbyCategoryLabel: hobbyMeta?.label,
    experienceTier: tier,
    issuedAt: row.issuedAt.toISOString(),
    deadline: row.deadline.toISOString(),
    hoursRemaining: Math.round(hoursRemaining * 10) / 10,
    acceptedFormats: ["PDF", "Word (.docx)"],
    maxFileSizeMB: 10,
  });
});

verificationRouter.post(
  "/non-tech-assignment/submit",
  requireAuth,
  requireJobSeeker,
  (req, res, next) => {
    nonTechAssignmentUpload.single("document")(req, res, (err: unknown) => {
      if (err) {
        const msg = err instanceof Error ? err.message : "Upload failed";
        return res.status(400).json({ error: msg });
      }
      next();
    });
  },
  async (req: AuthedRequest, res) => {
    const userId = req.user!.id;
    const file = req.file;
    if (!file?.buffer) {
      return res.status(400).json({ error: "Please upload your assignment document (PDF or Word)." });
    }

    const profile = await prisma.jobSeekerProfile.findUnique({
      where: { userId },
      select: {
        roleType: true,
        experienceYears: true,
        targetJobTitle: true,
        nonTechAssignmentSubmitCount: true,
      },
    });
    if ((profile?.roleType ?? "technical") !== "non_technical") {
      return res.status(400).json({ error: "This endpoint is only for non-technical candidates." });
    }

    const assignRow = await prisma.verificationStage.findFirst({
      where: { userId, stageName: "non_tech_assignment" },
    });
    const tier = experienceTierFromYears(profile?.experienceYears);
    const threshold = tier === "senior" ? 65 : 60;
    if (assignRow?.status === "completed" && assignRow.score != null && assignRow.score >= threshold) {
      return res.status(400).json({ error: "You have already passed this assignment." });
    }

    const gate = await gateNonTechAssignmentSubmit(userId);
    if (!gate.ok) {
      return res.status(gate.status).json(gate.body);
    }

    const now = new Date();
    const activeAssignment = await prisma.nonTechAssignment.findFirst({
      where: { userId, status: "active", deadline: { gt: now } },
      orderBy: { issuedAt: "desc" },
    });
    if (!activeAssignment) {
      return res.status(400).json({
        error: "assignment_expired",
        message: "No active assignment window. Open the assignment step again to see your deadline or request a new prompt.",
      });
    }

    let extractedText: string;
    try {
      extractedText = await extractNonTechAssignmentText(file);
    } catch (e) {
      console.warn("[non-tech-assignment/submit] extract", e);
      return res.status(400).json({
        error: "Could not read your document. Please ensure it is a valid PDF or Word file.",
      });
    }

    if (extractedText.trim().length < 100) {
      return res.status(400).json({
        error: "Your document appears to be empty or too short. Please upload your complete assignment.",
      });
    }

    let fileUrl: string;
    try {
      fileUrl = await saveNonTechAssignmentDocument(userId, file);
    } catch (e) {
      console.error("[non-tech-assignment/submit] save file", e);
      return res.status(500).json({ error: "Could not store your file. Please try again." });
    }

    const nBefore = profile?.nonTechAssignmentSubmitCount ?? 0;
    const usedPaidRetake = nBefore >= 2;

    const subtrack = detectNonTechSubtrack(profile?.targetJobTitle);
    const hobbyMeta = activeAssignment.hobbyCategory
      ? getHobbyCategoryMeta(activeAssignment.hobbyCategory)
      : undefined;
    const evalResult = await evaluateNonTechnicalAssignment({
      prompt: activeAssignment.prompt,
      response: extractedText,
      targetJobTitle: profile?.targetJobTitle ?? undefined,
      subtrack,
      hobbyCategory: activeAssignment.hobbyCategory ?? undefined,
      hobbyCategoryLabel: hobbyMeta?.label,
      threshold,
    });

    await prisma.nonTechAssignment.update({
      where: { id: activeAssignment.id },
      data: {
        status: "submitted",
        submittedAt: new Date(),
        submittedFileUrl: fileUrl,
        submittedText: extractedText.slice(0, 5000),
        score: evalResult.score,
        passed: evalResult.qualified,
        feedbackSummary: evalResult.summary.slice(0, 4000),
      },
    });

    await prisma.verificationStage.updateMany({
      where: { userId, stageName: "non_tech_assignment" },
      data: {
        status: evalResult.qualified ? "completed" : "failed",
        score: evalResult.score,
      },
    });

    if (evalResult.qualified) {
      await prisma.verificationStage.upsert({
        where: {
          userId_stageName: { userId, stageName: "expert_interview" },
        },
        create: {
          userId,
          stageName: "expert_interview",
          status: "in_progress",
        },
        update: { status: "in_progress" },
      });
      const hum = await prisma.verificationStage.findFirst({
        where: { userId, stageName: "human_expert_interview" },
      });
      if (hum) {
        await prisma.verificationStage.update({
          where: { id: hum.id },
          data: { status: "locked" },
        });
      }
    } else {
      const ex = await prisma.verificationStage.findFirst({
        where: { userId, stageName: "expert_interview" },
      });
      if (ex && ex.status !== "pending_review") {
        await prisma.verificationStage.updateMany({
          where: { userId, stageName: "expert_interview" },
          data: { status: "locked" },
        });
      }
    }

    const nonTechExpiresAt = new Date(Date.now() + 36 * 60 * 60 * 1000);
    await prisma.jobSeekerProfile.updateMany({
      where: { userId },
      data: {
        nonTechAssignmentPrompt: activeAssignment.prompt,
        nonTechAssignmentResponse: extractedText.slice(0, 100_000),
        nonTechAssignmentExpiresAt: nonTechExpiresAt,
        nonTechAssignmentSubmitCount: { increment: 1 },
        nonTechAssignmentLastSubmittedAt: new Date(),
        ...(usedPaidRetake ? { nonTechAssignmentPaidCooldownUntil: nextNonTechAssignmentPaidCooldownBoundary() } : {}),
      },
    });

    try {
      await reconcileVerificationStages(userId);
    } catch (e) {
      console.warn("[non-tech-assignment/submit] reconcile", e);
    }

    return res.json({
      score: evalResult.score,
      qualified: evalResult.qualified,
      threshold: evalResult.threshold,
      summary: evalResult.summary,
      strengths: evalResult.strengths,
      gaps: evalResult.gaps,
      feedback: evalResult.summary,
      submittedFileUrl: fileUrl,
      expiresAt: nonTechExpiresAt.toISOString(),
    });
  },
);

/** Latest saved non-technical assignment (after submit). */
verificationRouter.get("/assignment/current", requireAuth, requireJobSeeker, async (req: AuthedRequest, res) => {
  try {
    const profile = await prisma.jobSeekerProfile.findUnique({
      where: { userId: req.user!.id },
      select: {
        roleType: true,
        nonTechAssignmentPrompt: true,
        nonTechAssignmentResponse: true,
        nonTechAssignmentExpiresAt: true,
      },
    });
    if ((profile?.roleType ?? "technical") === "technical") {
      return res.status(404).json({ error: "No assignment on the technical verification path." });
    }
    return res.json({
      brief: profile?.nonTechAssignmentPrompt ?? null,
      response: profile?.nonTechAssignmentResponse ?? null,
      expiresAt: profile?.nonTechAssignmentExpiresAt?.toISOString() ?? null,
    });
  } catch (e) {
    console.error("[verification/assignment/current]", e);
    return res.status(500).json({ error: "Failed to load assignment" });
  }
});

verificationRouter.get("/assignment/time-remaining", requireAuth, requireJobSeeker, async (req: AuthedRequest, res) => {
  try {
    const profile = await prisma.jobSeekerProfile.findUnique({
      where: { userId: req.user!.id },
      select: { roleType: true, nonTechAssignmentExpiresAt: true },
    });
    if ((profile?.roleType ?? "technical") === "technical") {
      return res.json({ hoursRemaining: null as number | null, expiresAt: null as string | null });
    }
    const exp = profile?.nonTechAssignmentExpiresAt;
    if (!exp) {
      return res.json({ hoursRemaining: null as number | null, expiresAt: null as string | null });
    }
    const ms = exp.getTime() - Date.now();
    const hoursRemaining = Math.round((Math.max(0, ms) / (1000 * 60 * 60)) * 10) / 10;
    return res.json({ hoursRemaining, expiresAt: exp.toISOString() });
  } catch (e) {
    console.error("[verification/assignment/time-remaining]", e);
    return res.status(500).json({ error: "Failed to compute time remaining" });
  }
});

verificationRouter.get("/cooldowns", optionalAuth, async (req: AuthedRequest, res) => {
  const idle = { inCooldown: false as const };
  if (!req.user?.id) {
    return res.json({ aptitude: idle, dsa: idle });
  }
  const aptitudeLock = await getAptitudeLockoutStatus(req.user.id);
  const aptitude = aptitudeLock.locked ? cooldownPayloadFromLockout(aptitudeLock.lockedUntil) : idle;
  res.json({ aptitude, dsa: idle });
});

verificationRouter.get("/invalidated", optionalAuth, async (_req, res) => {
  res.json({ aptitude: false, dsa: false });
});

verificationRouter.post("/invalidate", requireAuth, requireJobSeeker, async (req: AuthedRequest, res) => {
  const schema = z.object({ testId: z.string(), testType: z.enum(["aptitude", "dsa"]), reason: z.string() });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid payload" });
  res.json({ ok: true });
});

/** Get meeting link for job seeker. MVP: Google Meet URL. Daily.co disabled. */
verificationRouter.get("/human-interview-session/room-token", requireAuth, requireJobSeeker, async (req: AuthedRequest, res) => {
  const session = await prisma.humanInterviewSession.findFirst({
    where: {
      userId: req.user!.id,
      status: { in: ["scheduled", "in_progress"] },
    },
  });
  if (!session) return res.status(404).json({ error: "No scheduled interview found" });
  if (!session.meetingLink) return res.status(400).json({ error: "The interviewer will share the Google Meet link shortly. Check back before your scheduled time." });
  // Google Meet or any external URL - return as-is (no Daily token needed)
  return res.json({ roomUrl: session.meetingLink, token: null });
});

/** Get current user's human expert interview session (if any) */
verificationRouter.get("/human-interview-session", requireAuth, requireJobSeeker, async (req: AuthedRequest, res) => {
  const session = await prisma.humanInterviewSession.findFirst({
    where: {
      userId: req.user!.id,
      status: { in: ["scheduled", "in_progress"] },
    },
    include: { interviewer: { select: { name: true } } },
  });
  res.json({ session: session ? { id: session.id, scheduledAt: session.scheduledAt, status: session.status, meetingLink: session.meetingLink } : null });
});

/** Match interviewers by track and role (targetJobTitle). Role must match (Backend, Frontend, etc.). */
verificationRouter.get("/matched-interviewers", requireAuth, requireJobSeeker, async (req: AuthedRequest, res) => {
  const eligibility = await getHumanInterviewEligibility(req.user!.id);
  if (!eligibility.can_access_slots) {
    return res.status(403).json({
      error: "Slot list is available after admin approval and any required payment.",
      interviewers: [],
      gated: true,
    });
  }
  const profile = await prisma.jobSeekerProfile.findUnique({ where: { userId: req.user!.id } });
  const track = (profile?.roleType as string) === "non_technical" ? "non_technical" : "technical";
  const targetTitle = profile?.targetJobTitle ?? null;
  const from = new Date();
  const to = new Date();
  to.setDate(to.getDate() + 14);

  const slots = await prisma.interviewerSlot.findMany({
    where: {
      status: "available",
      startsAt: { gte: from, lte: to },
      interviewer: {
        status: "active",
        track,
        userId: { not: null },
        ...(track === "non_technical" && { experienceYears: { gte: 5 } }),
      },
    },
    include: {
      interviewer: {
        select: {
          id: true,
          name: true,
          domain: true,
          track: true,
          domains: true,
          experienceYears: true,
        },
      },
    },
    orderBy: { startsAt: "asc" },
  });

  const byInterviewer = new Map<string, { interviewer: any; slots: any[] }>();
  for (const s of slots) {
    const inv = s.interviewer;
    const raw = inv.domain ?? (Array.isArray(inv.domains) ? inv.domains[0] : null);
    const invRole = typeof raw === "string" ? raw : null;
    if (!rolesMatch(targetTitle, invRole)) continue;
    const key = inv.id;
    if (!byInterviewer.has(key)) {
      byInterviewer.set(key, { interviewer: inv, slots: [] });
    }
    byInterviewer.get(key)!.slots.push({
      id: s.id,
      startsAt: s.startsAt,
      endsAt: s.endsAt,
    });
  }
  res.json({
    interviewers: Array.from(byInterviewer.values()).map(({ interviewer, slots: sl }) => ({
      id: interviewer.id,
      name: interviewer.name,
      domain: interviewer.domain,
      track: interviewer.track,
      domains: interviewer.domains,
      experienceYears: interviewer.experienceYears,
      slots: sl,
    })),
    track,
  });
});

/** Book a slot (job seeker) */
verificationRouter.post("/book-slot", requireAuth, requireJobSeeker, async (req: AuthedRequest, res) => {
  const schema = z.object({ slotId: z.string().uuid() });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid payload" });
  const { slotId } = parsed.data;

  const eligibility = await getHumanInterviewEligibility(req.user!.id);
  if (!eligibility.can_access_slots) {
    if (eligibility.human_expert_retry_after) {
      return res.status(403).json({
        error: "You can book another Human Expert Interview after the cooldown ends.",
        retryAfter: eligibility.human_expert_retry_after,
      });
    }
    return res.status(403).json({
      error: "Complete admin review and payment (if required) before booking a slot.",
    });
  }

  const profile = await prisma.jobSeekerProfile.findUnique({ where: { userId: req.user!.id } });
  const track = (profile?.roleType as string) === "non_technical" ? "non_technical" : "technical";

  const openAttempt =
    track === "technical"
      ? await prisma.humanInterviewAttempt.findFirst({
          where: {
            candidateId: req.user!.id,
            paymentStatus: { in: ["paid", "waived"] },
            slotId: null,
          },
          orderBy: { createdAt: "desc" },
        })
      : null;
  let legacyTechnicalBooking = false;
  if (track === "technical" && !openAttempt) {
    const expertDone = await prisma.verificationStage.findFirst({
      where: { userId: req.user!.id, stageName: "expert_interview", status: "completed" },
    });
    const anyQueue = await prisma.adminReviewQueue.findFirst({
      where: { candidateId: req.user!.id },
    });
    if (expertDone && !anyQueue) {
      legacyTechnicalBooking = true;
    } else {
      return res.status(400).json({ error: "No active booking attempt. Contact support if this persists." });
    }
  }

  const slot = await prisma.interviewerSlot.findUnique({
    where: { id: slotId },
    include: { interviewer: { select: { id: true, userId: true, name: true, track: true, domain: true, domains: true } } },
  });
  if (!slot) return res.status(404).json({ error: "Slot not found" });
  if (slot.status !== "available") return res.status(400).json({ error: "Slot is no longer available" });
  if (!slot.interviewer?.userId) return res.status(400).json({ error: "Interviewer not active" });

  if (slot.interviewer.track !== track) {
    return res.status(400).json({ error: "Interviewer track does not match your profile" });
  }
  const rawInvRole = slot.interviewer.domain ?? (Array.isArray(slot.interviewer.domains) ? slot.interviewer.domains[0] : null);
  const invRole = typeof rawInvRole === "string" ? rawInvRole : null;
  if (!rolesMatch(profile?.targetJobTitle, invRole)) {
    return res.status(400).json({ error: "Interviewer role does not match your target job title" });
  }

  const existingSession = await prisma.humanInterviewSession.findFirst({
    where: { userId: req.user!.id, status: { in: ["scheduled", "in_progress"] } },
  });
  if (existingSession) return res.status(400).json({ error: "You already have a scheduled interview" });

  let session: Awaited<ReturnType<typeof prisma.humanInterviewSession.create>>;
  try {
    if (track === "non_technical" || legacyTechnicalBooking) {
      session = await prisma.$transaction(async (tx) => {
        const claimed = await tx.interviewerSlot.updateMany({
          where: { id: slotId, status: "available" },
          data: { status: "booked", bookedUserId: req.user!.id },
        });
        if (claimed.count === 0) throw new Error("SLOT_TAKEN");

        const createdSession = await tx.humanInterviewSession.create({
      data: {
        userId: req.user!.id,
        interviewerId: slot.interviewerId,
        slotId: slot.id,
        scheduledAt: slot.startsAt,
        status: "scheduled",
            attemptNumber: 1,
            paymentStatus: "waived",
          },
        });

        await tx.humanInterviewBooking.create({
          data: {
            candidateId: req.user!.id,
            slotId: slot.id,
            attemptNumber: 1,
            paymentStatus: "waived",
            humanInterviewSessionId: createdSession.id,
          },
        });

        return createdSession;
      });
    } else {
      session = await prisma.$transaction(async (tx) => {
        const claimed = await tx.interviewerSlot.updateMany({
          where: { id: slotId, status: "available" },
      data: { status: "booked", bookedUserId: req.user!.id },
        });
        if (claimed.count === 0) throw new Error("SLOT_TAKEN");

        const createdSession = await tx.humanInterviewSession.create({
          data: {
            userId: req.user!.id,
            interviewerId: slot.interviewerId,
            slotId: slot.id,
            scheduledAt: slot.startsAt,
            status: "scheduled",
            attemptNumber: openAttempt!.attemptNumber,
            paymentStatus: openAttempt!.paymentStatus === "waived" ? "waived" : "paid",
            humanInterviewAttemptId: openAttempt!.id,
          },
        });

        await tx.humanInterviewAttempt.update({
          where: { id: openAttempt!.id },
          data: { slotId: slot.id },
        });

        await tx.humanInterviewBooking.create({
          data: {
            candidateId: req.user!.id,
            slotId: slot.id,
            attemptNumber: openAttempt!.attemptNumber,
            paymentStatus: openAttempt!.paymentStatus === "waived" ? "waived" : "paid",
            humanInterviewAttemptId: openAttempt!.id,
            humanInterviewSessionId: createdSession.id,
          },
        });

        return createdSession;
      });
    }
  } catch (e) {
    if (e instanceof Error && e.message === "SLOT_TAKEN") {
      return res.status(409).json({ error: "This slot was just booked. Please choose another time." });
    }
    throw e;
  }

  // MVP: No Daily.co. Interviewer adds Google Meet link when ready.

  await prisma.verificationStage.upsert({
    where: {
      userId_stageName: { userId: req.user!.id, stageName: "human_expert_interview" },
    },
    create: { userId: req.user!.id, stageName: "human_expert_interview", status: "in_progress" },
    update: { status: "in_progress" },
  });

  const slotLabel = slot.startsAt.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
  const booker = await prisma.user.findUnique({
    where: { id: req.user!.id },
    select: { email: true, name: true },
  });
  if (booker?.email) {
    void sendHumanInterviewSlotBookedEmail(
      booker.email,
      booker.name,
      slotLabel,
      slot.interviewer?.name
    ).catch(() => {});
  }

  res.status(201).json({ session, message: "Slot booked successfully" });
});

// ---------------------------------------------------------------------------
// Data Round endpoints (SQL + Python tasks for data track)
// ---------------------------------------------------------------------------

/** GET /api/verification/data-round/tasks — load data round tasks for the candidate */
verificationRouter.get("/data-round/tasks", requireAuth, requireJobSeeker, async (req: AuthedRequest, res) => {
  try {
    const userId = req.user!.id;
    const profile = await prisma.jobSeekerProfile.findUnique({ where: { userId } });
    const track = roleTypeToTrack(profile?.roleType);
    if (track !== "data") {
      return res.status(400).json({ error: "Data round is only available for the data verification track." });
    }

    const stage = await prisma.verificationStage.findFirst({
      where: { userId, stageName: "data_round" },
    });
    if (!stage || (stage.status !== "in_progress" && stage.status !== "completed" && stage.status !== "failed")) {
      return res.status(400).json({ error: "Data round is not currently active for your account." });
    }

    const tier = experienceTierFromYears(profile?.experienceYears);
    const subtrack = detectDataSubtrack(profile?.targetJobTitle);
    const tierConfig = dataRoundTierConfig(tier);

    const allTasks = await prisma.dataRoundTask.findMany({
      include: { testCases: { where: { isHidden: false } } },
    });

    if (!allTasks || allTasks.length === 0) {
      return res.status(503).json({ error: "Data round task bank is not yet available. Please try again later." });
    }

    // Select tasks based on tier config
    const sqlTasks = allTasks.filter((t: any) => t.taskType === "sql" && (!t.subtrack || t.subtrack === subtrack));
    const pythonTasks = allTasks.filter((t: any) => t.taskType === "python" && (!t.subtrack || t.subtrack === subtrack));
    const otherTasks = allTasks.filter((t: any) => !["sql", "python"].includes(t.taskType) && (!t.subtrack || t.subtrack === subtrack));

    const selected: any[] = [];
    const pick = (pool: any[], n: number) => {
      const shuffled = [...pool].sort(() => Math.random() - 0.5);
      return shuffled.slice(0, Math.min(n, shuffled.length));
    };

    selected.push(...pick(sqlTasks, tierConfig.sqlTaskCount));
    selected.push(...pick(pythonTasks, tierConfig.pythonTaskCount));
    if (tierConfig.modelingOrStatsTaskCount > 0) {
      selected.push(...pick(otherTasks, tierConfig.modelingOrStatsTaskCount));
    }

    // Fill remaining slots if we couldn't find enough subtrack-specific tasks
    const remaining = tierConfig.taskCount - selected.length;
    if (remaining > 0) {
      const used = new Set(selected.map((t: any) => t.id));
      const fallback = allTasks.filter((t: any) => !used.has(t.id));
      selected.push(...pick(fallback, remaining));
    }

    const tasks = selected.map((t: any) => ({
      id: t.id,
      title: t.title,
      description: t.description,
      taskType: t.taskType,
      difficulty: t.difficulty,
      sqlSchema: t.sqlSchema,
      starterCode: t.starterCode,
      options: t.options,
      testCases: (t.testCases ?? []).map((tc: any) => ({
        input: tc.input,
        expected: tc.expected,
      })),
    }));

    return res.json({
      tasks,
      timeLimitMinutes: tierConfig.timeLimitMinutes,
      passThresholdPercent: tierConfig.passThresholdPercent,
      subtrack,
      tier,
    });
  } catch (e) {
    console.error("[verification/data-round/tasks]", e);
    return res.status(500).json({ error: "Failed to load data round tasks" });
  }
});

/** POST /api/verification/data-round/submit — submit a single data round task */
verificationRouter.post("/data-round/submit", requireAuth, requireJobSeeker, async (req: AuthedRequest, res) => {
  try {
    const userId = req.user!.id;
    const schema = z.object({
      taskId: z.string(),
      code: z.string(),
      language: z.enum(["python", "sql"]),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid payload" });

    const { taskId, code, language } = parsed.data;

    const task = await prisma.dataRoundTask.findUnique({
      where: { id: taskId },
      include: { testCases: true },
    });
    if (!task) return res.status(404).json({ error: "Task not found" });

    // For SQL tasks, wrap in Python + sqlite3
    let execCode = code;
    if (language === "sql" || task.taskType === "sql") {
      const schemaEscaped = (task.sqlSchema || "").replace(/'/g, "\\'").replace(/\n/g, "\\n");
      const sqlEscaped = code.replace(/'/g, "\\'").replace(/\n/g, "\\n");
      execCode = `import sqlite3, sys
conn = sqlite3.connect(':memory:')
cur = conn.cursor()
schema = '${schemaEscaped}'
for stmt in schema.split(';'):
    stmt = stmt.strip()
    if stmt:
        cur.execute(stmt)
conn.commit()
sql = '${sqlEscaped}'
try:
    cur.execute(sql)
    rows = cur.fetchall()
    for row in rows:
        print('|'.join(str(c) for c in row))
except Exception as e:
    print(f"ERROR: {e}", file=sys.stderr)
    sys.exit(1)
conn.close()
`;
    }

    // Execute via Judge0 — submitBatch(code, language, testInputs) returns Judge0Result[]
    const { submitBatch, extractActualOutput } = await import("../services/judge0.js");

    const testCases = task.testCases || [];
    let passedCount = 0;
    const resultList: any[] = [];

    try {
      const judge0Results = await submitBatch(
        execCode,
        "python",
        testCases.map((tc: any) => ({ input: tc.input || "", timeoutMs: tc.timeoutMs ?? null })),
      );

      for (let i = 0; i < testCases.length; i++) {
        const tc = testCases[i];
        const j0 = judge0Results[i];
        const stdout = j0 ? extractActualOutput(j0).trim() : "";
        const expected = (tc.expected || "").trim();
        const passed = stdout === expected;
        if (passed) passedCount++;
        resultList.push({
          passed,
          status: passed ? "passed" : j0?.status?.id === 6 ? "compilation_error" : "wrong_answer",
          actual: !tc.isHidden ? stdout : undefined,
          expected: !tc.isHidden ? expected : undefined,
        });
      }
    } catch (execErr) {
      for (const tc of testCases) {
        resultList.push({
          passed: false,
          status: "internal_error",
          actual: execErr instanceof Error ? execErr.message : "Execution error",
        });
      }
    }

    // Store submission
    await prisma.dataRoundSubmission.create({
      data: {
        userId,
        taskId,
        language: language === "sql" ? "sql" : "python",
        code,
        passedCount,
        totalCount: testCases.length,
        isOfficial: true,
        results: resultList,
      },
    });

    const score = testCases.length > 0 ? Math.round((passedCount / testCases.length) * 100) : 0;

    return res.json({
      passed: passedCount,
      total: testCases.length,
      score,
      results: resultList.map((r: any) => ({
        passed: r.passed,
        status: r.status,
        actual: r.actual,
        expected: r.expected,
      })),
    });
  } catch (e) {
    console.error("[verification/data-round/submit]", e);
    return res.status(500).json({ error: "Failed to submit data round task" });
  }
});

/** POST /api/verification/data-round — finalize the data round (like POST /dsa for software track) */
verificationRouter.post("/data-round", requireAuth, requireJobSeeker, async (req: AuthedRequest, res) => {
  try {
    const userId = req.user!.id;
    const profile = await prisma.jobSeekerProfile.findUnique({
      where: { userId },
      select: { roleType: true, experienceYears: true },
    });
    const track = roleTypeToTrack(profile?.roleType);
    if (track !== "data") {
      return res.status(400).json({ error: "Data round is only available for data track." });
    }

    const tier = experienceTierFromYears(profile?.experienceYears);
    const tierConfig = dataRoundTierConfig(tier);

    // Get all official submissions
    const submissions = await prisma.dataRoundSubmission.findMany({
      where: { userId, isOfficial: true },
      orderBy: { submittedAt: "desc" },
    });

    if (!submissions || submissions.length === 0) {
      return res.status(400).json({ error: "No submissions found. Complete at least one task." });
    }

    // Get best score per task
    const bestByTask = new Map<string, number>();
    for (const sub of submissions) {
      const score = sub.totalCount > 0 ? Math.round((sub.passedCount / sub.totalCount) * 100) : 0;
      if (!bestByTask.has(sub.taskId) || score > bestByTask.get(sub.taskId)!) {
        bestByTask.set(sub.taskId, score);
      }
    }

    if (bestByTask.size < tierConfig.taskCount) {
      return res.status(400).json({
        error: `Submit official solutions for all ${tierConfig.taskCount} tasks before finishing the round.`,
      });
    }

    const scores = Array.from(bestByTask.values());
    const avgScore = scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;
    const passed = avgScore >= tierConfig.passThresholdPercent;

    const lastDataRound = await prisma.dataRoundResult.findFirst({
      where: { userId },
      orderBy: { completedAt: "desc" },
    });
    if (lastDataRound && Date.now() - lastDataRound.completedAt.getTime() < COOLDOWN_DATA_ROUND_MS) {
      return res.status(402).json({
        code: "COOLDOWN",
        message: "Wait 48 hours between Data round submissions.",
        nextAvailableAt: new Date(lastDataRound.completedAt.getTime() + COOLDOWN_DATA_ROUND_MS).toISOString(),
      });
    }

    // Store result
    await prisma.dataRoundResult.create({
      data: {
        userId,
        score: avgScore,
        answers: { taskScores: Object.fromEntries(bestByTask) },
      },
    });

    // Update verification stage
    await prisma.verificationStage.updateMany({
      where: { userId, stageName: "data_round" },
      data: { status: passed ? "completed" : "failed", score: avgScore },
    });

    return res.json({
      score: avgScore,
      passed,
      passThresholdPercent: tierConfig.passThresholdPercent,
      taskScores: Object.fromEntries(bestByTask),
    });
  } catch (e) {
    console.error("[verification/data-round]", e);
    return res.status(500).json({ error: "Failed to finalize data round" });
  }
});
