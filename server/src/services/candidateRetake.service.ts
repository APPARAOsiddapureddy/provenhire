import { prisma } from "../config/prisma.js";
import {
  CANDIDATE_RETAKE_CREDIT_VALIDITY_DAYS,
  COOLDOWN_AI_EXPERT_MS,
  CANDIDATE_RETAKE_SINGLE_INR,
  CANDIDATE_RETAKE_BUNDLE_INR,
  COOLDOWN_NON_TECH_ASSIGNMENT_FREE_MS,
  COOLDOWN_NON_TECH_ASSIGNMENT_PAID_MS,
  CANDIDATE_NON_TECH_ASSIGNMENT_RETAKE_SINGLE_INR,
  CANDIDATE_NON_TECH_ASSIGNMENT_RETAKE_BUNDLE_INR,
} from "../constants/revenue.js";

export async function countAvailableRetakeCredits(userId: string): Promise<number> {
  const now = new Date();
  return prisma.candidateRetakeLedger.count({
    where: { userId, consumedAt: null, expiresAt: { gt: now } },
  });
}

export async function consumeRetakeCredit(userId: string, consumedFor: string): Promise<boolean> {
  try {
    return await prisma.$transaction(async (tx) => {
      const row = await tx.candidateRetakeLedger.findFirst({
        where: { userId, consumedAt: null, expiresAt: { gt: new Date() } },
        orderBy: { expiresAt: "asc" },
      });
      if (!row) return false;
      await tx.candidateRetakeLedger.update({
        where: { id: row.id },
        data: { consumedAt: new Date(), consumedFor },
      });
      return true;
    });
  } catch {
    return false;
  }
}

export async function grantRetakeCredits(userId: string, packageType: "single" | "bundle"): Promise<void> {
  const now = new Date();
  const expiresAt = new Date(now.getTime());
  expiresAt.setUTCDate(expiresAt.getUTCDate() + CANDIDATE_RETAKE_CREDIT_VALIDITY_DAYS);
  const n = packageType === "bundle" ? 2 : 1;
  await prisma.candidateRetakeLedger.createMany({
    data: Array.from({ length: n }, () => ({
      userId,
      packageType,
      expiresAt,
    })),
  });
}

const pricingBody = {
  singleInr: CANDIDATE_RETAKE_SINGLE_INR,
  bundleInr: CANDIDATE_RETAKE_BUNDLE_INR,
};

/**
 * Expert / AI interview session start — first finished session free; further sessions need cooldown + ledger credit.
 */
export async function gateExpertInterviewStart(userId: string): Promise<
  { ok: true } | { ok: false; status: number; body: Record<string, unknown> }
> {
  const open = await prisma.interview.findFirst({
    where: { userId, interviewType: "ai_expert", status: "in_progress" },
  });
  if (open) {
    return {
      ok: false,
      status: 400,
      body: { error: "You already have an expert interview in progress.", code: "INTERVIEW_OPEN" },
    };
  }

  const priorCount = await prisma.interview.count({
    where: {
      userId,
      interviewType: "ai_expert",
      status: { in: ["completed", "failed", "pending_review"] },
    },
  });

  if (priorCount === 0) {
    return { ok: true };
  }

  const last = await prisma.interview.findFirst({
    where: {
      userId,
      interviewType: "ai_expert",
      status: { in: ["completed", "failed", "pending_review"] },
    },
    orderBy: { completedAt: "desc" },
  });
  const lastAt = (last?.completedAt ?? last?.createdAt ?? new Date(0)).getTime();
  if (Date.now() - lastAt < COOLDOWN_AI_EXPERT_MS) {
    return {
      ok: false,
      status: 402,
      body: {
        code: "COOLDOWN",
        message: "Wait for the cooldown before starting another expert interview.",
        nextAvailableAt: new Date(lastAt + COOLDOWN_AI_EXPERT_MS).toISOString(),
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
          "Your first expert interview is free. Purchase a retake (₹399) or bundle (₹649) — contact support with UPI proof until in-app checkout is live.",
        creditsAvailable: 0,
        pricing: pricingBody,
      },
    };
  }

  const consumed = await consumeRetakeCredit(userId, "expert_interview");
  if (!consumed) {
    return {
      ok: false,
      status: 402,
      body: {
        code: "PAYMENT_REQUIRED",
        message: "No retake credits available.",
        pricing: pricingBody,
      },
    };
  }

  return { ok: true };
}

const nonTechAssignmentPricingBody = {
  singleInr: CANDIDATE_NON_TECH_ASSIGNMENT_RETAKE_SINGLE_INR,
  bundleInr: CANDIDATE_NON_TECH_ASSIGNMENT_RETAKE_BUNDLE_INR,
};

/**
 * Non-tech role assignment: first submit free; second submit free after 24h; third+ needs ledger credit + 7d cadence (PRD April 2026).
 */
export async function gateNonTechAssignmentSubmit(userId: string): Promise<
  { ok: true } | { ok: false; status: number; body: Record<string, unknown> }
> {
  const profile = await prisma.jobSeekerProfile.findUnique({
    where: { userId },
    select: {
      roleType: true,
      nonTechAssignmentSubmitCount: true,
      nonTechAssignmentLastSubmittedAt: true,
      nonTechAssignmentPaidCooldownUntil: true,
    },
  });
  if ((profile?.roleType ?? "technical") !== "non_technical") {
    return { ok: true };
  }

  const n = profile?.nonTechAssignmentSubmitCount ?? 0;
  if (n === 0) return { ok: true };

  const last = profile?.nonTechAssignmentLastSubmittedAt?.getTime() ?? 0;

  if (n === 1) {
    if (Date.now() - last < COOLDOWN_NON_TECH_ASSIGNMENT_FREE_MS) {
      return {
        ok: false,
        status: 402,
        body: {
          code: "COOLDOWN",
          message: "Your first retake is free after a 24-hour cooldown.",
          nextAvailableAt: new Date(last + COOLDOWN_NON_TECH_ASSIGNMENT_FREE_MS).toISOString(),
        },
      };
    }
    return { ok: true };
  }

  const paidUntil = profile?.nonTechAssignmentPaidCooldownUntil?.getTime() ?? 0;
  if (paidUntil > Date.now()) {
    return {
      ok: false,
      status: 402,
      body: {
        code: "COOLDOWN",
        message: "Wait for the cooldown before another paid retake of this assignment.",
        nextAvailableAt: new Date(paidUntil).toISOString(),
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
          "Further retakes need a paid credit (₹299 single / ₹499 bundle) — contact support with UPI proof until checkout is live.",
        creditsAvailable: 0,
        pricing: nonTechAssignmentPricingBody,
      },
    };
  }

  const consumed = await consumeRetakeCredit(userId, "non_tech_assignment");
  if (!consumed) {
    return {
      ok: false,
      status: 402,
      body: {
        code: "PAYMENT_REQUIRED",
        message: "No retake credits available.",
        pricing: nonTechAssignmentPricingBody,
      },
    };
  }

  return { ok: true };
}

/** After a paid-path assignment submit, enforce 7-day spacing before the next paid attempt. */
export function nextNonTechAssignmentPaidCooldownBoundary(): Date {
  return new Date(Date.now() + COOLDOWN_NON_TECH_ASSIGNMENT_PAID_MS);
}
