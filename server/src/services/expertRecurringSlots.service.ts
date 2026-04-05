import { prisma } from "../config/prisma.js";

export type RecurringScheduleConfig = {
  daysOfWeek: number[];
  timeSlots: string[];
};

/** Generate Upcoming slots for the next 14 days from `recurringSchedule` (UTC clock times). */
export async function generateRecurringSlotsForAllInterviewers(): Promise<{ interviewers: number; slotsCreated: number }> {
  const interviewers = await prisma.interviewer.findMany({
    where: { recurringActive: true },
  });
  let slotsCreated = 0;
  const now = new Date();
  const horizon = new Date(now);
  horizon.setUTCDate(horizon.getUTCDate() + 14);

  for (const inv of interviewers) {
    const cfg = inv.recurringSchedule as RecurringScheduleConfig | null;
    if (!cfg?.daysOfWeek?.length || !cfg.timeSlots?.length) continue;

    const daySet = new Set(cfg.daysOfWeek);

    for (let i = 0; i < 14; i++) {
      const d = new Date(now);
      d.setUTCHours(0, 0, 0, 0);
      d.setUTCDate(d.getUTCDate() + i);
      if (d > horizon) break;
      const dow = d.getUTCDay();
      if (!daySet.has(dow)) continue;

      for (const ts of cfg.timeSlots) {
        const [hh, mm = "0"] = ts.split(":").map((s) => s.trim());
        const h = parseInt(hh, 10);
        const m = parseInt(mm, 10);
        if (!Number.isFinite(h) || !Number.isFinite(m)) continue;

        const startsAt = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), h, m, 0, 0));
        const endsAt = new Date(startsAt.getTime() + 45 * 60 * 1000);
        if (startsAt < now) continue;

        const exists = await prisma.interviewerSlot.findFirst({
          where: {
            interviewerId: inv.id,
            startsAt,
            status: "available",
          },
        });
        if (exists) continue;

        await prisma.interviewerSlot.create({
          data: {
            interviewerId: inv.id,
            startsAt,
            endsAt,
            status: "available",
          },
        });
        slotsCreated += 1;
      }
    }
  }

  return { interviewers: interviewers.length, slotsCreated };
}
