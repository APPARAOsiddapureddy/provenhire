import { prisma } from "../config/prisma.js";
import {
  CANDIDATE_RETAKE_CREDIT_VALIDITY_DAYS,
  COOLDOWN_AI_EXPERT_MS,
  CANDIDATE_RETAKE_SINGLE_INR,
  CANDIDATE_RETAKE_BUNDLE_INR,
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
