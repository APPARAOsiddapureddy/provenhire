import { prisma } from "../config/prisma.js";
import {
  COOLDOWN_AI_SKILLS_MS,
  COOLDOWN_SYSTEM_DESIGN_MS,
  CANDIDATE_RETAKE_SINGLE_INR,
  CANDIDATE_RETAKE_BUNDLE_INR,
} from "../constants/revenue.js";
import { consumeRetakeCredit, countAvailableRetakeCredits } from "./candidateRetake.service.js";

const pricingBody = {
  singleInr: CANDIDATE_RETAKE_SINGLE_INR,
  bundleInr: CANDIDATE_RETAKE_BUNDLE_INR,
};

function interviewTypeForStage(stageName: string): "ai_skills" | "system_design" | null {
  if (stageName === "ai_skills_interview" || stageName === "data_skills_interview") return "ai_skills";
  if (stageName === "system_design_interview" || stageName === "data_system_design") return "system_design";
  return null;
}

/**
 * Placeholder AI Skills / System Design stages: paid retake when reopening after failure or completed (re-verify).
 * First open from `locked` is free.
 */
export async function gatePaidVerificationStageInProgress(
  userId: string,
  stageName: string,
  previousStatus: string,
): Promise<{ ok: true } | { ok: false; status: number; body: Record<string, unknown> }> {
  const PAID_RETAKE_STAGES = new Set([
    "ai_skills_interview", "system_design_interview",
    "data_skills_interview", "data_system_design",
  ]);
  if (!PAID_RETAKE_STAGES.has(stageName)) {
    return { ok: true };
  }

  if (previousStatus === "locked") {
    return { ok: true };
  }

  const cooldownMs =
    stageName === "ai_skills_interview" || stageName === "data_skills_interview"
      ? COOLDOWN_AI_SKILLS_MS
      : COOLDOWN_SYSTEM_DESIGN_MS;
  const it = interviewTypeForStage(stageName);

  let lastAt = 0;
  if (it) {
    const lastIv = await prisma.interview.findFirst({
      where: {
        userId,
        interviewType: it,
        status: { in: ["completed", "failed", "pending_review"] },
      },
      orderBy: { completedAt: "desc" },
    });
    if (lastIv) {
      lastAt = (lastIv.completedAt ?? lastIv.createdAt).getTime();
    }
  }
  if (lastAt === 0) {
    const st = await prisma.verificationStage.findUnique({
      where: { userId_stageName: { userId, stageName } },
    });
    if (st?.updatedAt) lastAt = st.updatedAt.getTime();
  }

  if (lastAt > 0 && Date.now() - lastAt < cooldownMs) {
    return {
      ok: false,
      status: 402,
      body: {
        code: "COOLDOWN",
        message: "Wait for the cooldown before another attempt at this stage.",
        nextAvailableAt: new Date(lastAt + cooldownMs).toISOString(),
      },
    };
  }

  if ((await countAvailableRetakeCredits(userId)) < 1) {
    return {
      ok: false,
      status: 402,
      body: {
        code: "PAYMENT_REQUIRED",
        message:
          "Purchase a retake (₹399) or two-retake bundle (₹649) — admin grants credits after manual UPI verification.",
        creditsAvailable: 0,
        pricing: pricingBody,
      },
    };
  }

  const consumed = await consumeRetakeCredit(userId, stageName);
  if (!consumed) {
    return {
      ok: false,
      status: 402,
      body: { code: "PAYMENT_REQUIRED", message: "No retake credits available.", pricing: pricingBody },
    };
  }

  return { ok: true };
}
