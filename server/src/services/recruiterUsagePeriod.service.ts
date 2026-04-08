import { prisma } from "../config/prisma.js";

/** UTC midnight on the first day of the current month (PRD §3 monthly reset). */
export function utcStartOfCurrentMonth(now = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0));
}

/**
 * Resets monthly counters when `periodStart` is before the current calendar month.
 * Call from any route that reads or mutates usage so limits stay accurate.
 */
export async function ensureRecruiterUsageCurrentMonth(recruiterId: string) {
  const monthStart = utcStartOfCurrentMonth();

  let row = await prisma.recruiterUsage.findUnique({ where: { recruiterId } });

  if (!row) {
    return prisma.recruiterUsage.create({
      data: {
        recruiterId,
        periodStart: monthStart,
        profileViewCountMonth: 0,
        contactCountMonth: 0,
        jdInterviewCountMonth: 0,
        shortlistCountMonth: 0,
      },
    });
  }

  if (row.periodStart < monthStart) {
    return prisma.recruiterUsage.update({
      where: { recruiterId },
      data: {
        periodStart: monthStart,
        profileViewCountMonth: 0,
        contactCountMonth: 0,
        jdInterviewCountMonth: 0,
        shortlistCountMonth: 0,
      },
    });
  }

  return row;
}
