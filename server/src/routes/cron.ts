/**
 * Cron endpoints - call via external cron (e.g. cron-job.org) daily at 00:00 UTC.
 * Protect with CRON_SECRET in query/header.
 */
import { Router, Request, Response } from "express";
import { prisma } from "../config/prisma.js";
import { markExpiredSkills } from "../services/skillVerification.service.js";
import { SKILL_DISPLAY_NAMES } from "../config/skillValidity.js";
import { sendSkillExpiryReminderEmail, sendSkillExpiredEmail } from "../services/resend.js";

export const cronRouter = Router();

function isAuthorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const provided = req.query.secret ?? req.headers["x-cron-secret"];
  return provided === secret;
}

/** Daily: mark expired skills, send reminders (7d, 3d before), send expired emails */
cronRouter.post("/expire-skills", async (req: Request, res: Response) => {
  if (!isAuthorized(req)) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  try {
    const now = new Date();
    const toExpire = await prisma.candidateSkillVerification.findMany({
      where: { status: "ACTIVE", expiresAt: { lt: now } },
      include: { user: { select: { email: true } } },
    });
    const expiredCount = await markExpiredSkills();

    const in7Days = new Date(now);
    in7Days.setDate(in7Days.getDate() + 7);
    const in3Days = new Date(now);
    in3Days.setDate(in3Days.getDate() + 3);

    const expiring7d = await prisma.candidateSkillVerification.findMany({
      where: {
        status: "ACTIVE",
        expiresAt: {
          gte: new Date(in7Days.getTime() - 24 * 60 * 60 * 1000),
          lt: new Date(in7Days.getTime() + 24 * 60 * 60 * 1000),
        },
      },
      include: { user: { select: { email: true } } },
    });

    const expiring3d = await prisma.candidateSkillVerification.findMany({
      where: {
        status: "ACTIVE",
        expiresAt: {
          gte: new Date(in3Days.getTime() - 24 * 60 * 60 * 1000),
          lt: new Date(in3Days.getTime() + 24 * 60 * 60 * 1000),
        },
      },
      include: { user: { select: { email: true } } },
    });

    let reminders7d = 0;
    let reminders3d = 0;
    let expiredEmails = 0;

    for (const row of toExpire) {
      const skillName = SKILL_DISPLAY_NAMES[row.skillType] ?? row.skillType;
      if (row.user?.email && (await sendSkillExpiredEmail(row.user.email, skillName))) {
        expiredEmails++;
      }
    }
    for (const row of expiring7d) {
      const skillName = SKILL_DISPLAY_NAMES[row.skillType] ?? row.skillType;
      if (row.user?.email && (await sendSkillExpiryReminderEmail(row.user.email, skillName, 7))) {
        reminders7d++;
      }
    }
    for (const row of expiring3d) {
      const skillName = SKILL_DISPLAY_NAMES[row.skillType] ?? row.skillType;
      if (row.user?.email && (await sendSkillExpiryReminderEmail(row.user.email, skillName, 3))) {
        reminders3d++;
      }
    }

    await prisma.notification.createMany({
      data: [
        ...expiring7d.map((r) => ({
          userId: r.userId,
          title: "Skill Verification Expiring Soon",
          message: `Your ${SKILL_DISPLAY_NAMES[r.skillType] ?? r.skillType} verification expires in 7 days. Reattempt now to maintain your status.`,
          targetRole: "jobseeker",
        })),
        ...expiring3d.map((r) => ({
          userId: r.userId,
          title: "Skill Verification Expiring Soon",
          message: `Your ${SKILL_DISPLAY_NAMES[r.skillType] ?? r.skillType} verification expires in 3 days. Reattempt now to maintain your status.`,
          targetRole: "jobseeker",
        })),
        ...toExpire.map((r) => ({
          userId: r.userId,
          title: "Skill Verification Expired",
          message: `Your ${SKILL_DISPLAY_NAMES[r.skillType] ?? r.skillType} verification has expired. Reattempt to restore your Verified Candidate status.`,
          targetRole: "jobseeker",
        })),
      ],
    });

    return res.json({
      ok: true,
      expired: expiredCount,
      reminders_7d: reminders7d,
      reminders_3d: reminders3d,
      expired_emails: expiredEmails,
    });
  } catch (e) {
    console.error("[cron/expire-skills]", e);
    return res.status(500).json({ error: e instanceof Error ? e.message : "Cron failed" });
  }
});
