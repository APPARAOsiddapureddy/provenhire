import { prisma } from "../config/prisma.js";
import {
  ensureRecruiterUsageCurrentMonth,
  utcStartOfCurrentMonth,
} from "../services/recruiterUsagePeriod.service.js";

export type SubscriptionTier = "free" | "starter" | "growth";

export function normalizeSubscriptionTier(usage: {
  planType: string;
  subscriptionTier: string;
}): SubscriptionTier {
  const t = (usage.subscriptionTier || "").toLowerCase();
  if (t === "starter" || t === "growth") return t;
  if (usage.planType === "paid") return "growth";
  return "free";
}

export function activePublishedJobLimit(tier: SubscriptionTier): number {
  if (tier === "free") return 2;
  if (tier === "starter") return 5;
  return Number.MAX_SAFE_INTEGER;
}

export function profileViewLimit(tier: SubscriptionTier): number {
  if (tier === "free") return 5;
  if (tier === "starter") return 50;
  return Number.MAX_SAFE_INTEGER;
}

export function discoveryGridFullyUnlocked(tier: SubscriptionTier): boolean {
  return tier !== "free";
}

/** Express Interest sends per month (PRD §3). Free tier = 0. */
export function contactLimit(tier: SubscriptionTier): number {
  if (tier === "free") return 0;
  if (tier === "starter") return 10;
  return 30;
}

/** Included JD AI interview credits per month (PRD §3). Usage tracked separately when product ships. */
export function jdInterviewMonthlyAllowance(tier: SubscriptionTier): number {
  if (tier === "free") return 0;
  if (tier === "starter") return 5;
  return 10;
}

export async function ensureRecruiterUsageRow(recruiterId: string) {
  await ensureRecruiterUsageCurrentMonth(recruiterId);
  const row = await prisma.recruiterUsage.findUnique({ where: { recruiterId } });
  if (row) return row;
  return prisma.recruiterUsage.create({
    data: { recruiterId, periodStart: utcStartOfCurrentMonth() },
  });
}
