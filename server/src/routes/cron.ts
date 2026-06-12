/**
 * Cron endpoints - call via external cron (e.g. cron-job.org) daily at 00:00 UTC.
 * Protect with CRON_SECRET in query/header.
 */
import { Router, Request, Response } from "express";
import { prisma } from "../config/prisma.js";
import { markExpiredSkills } from "../services/skillVerification.service.js";
import { SKILL_DISPLAY_NAMES } from "../config/skillValidity.js";
import {
  sendHumanInterviewReminderEmail,
  sendJobAlertDigestEmail,
  sendSkillExpiryReminderEmail,
  sendSkillExpiredEmail,
  sendWorkspaceResultsAvailableEmail,
  sendWorkspaceStartedEmail,
} from "../services/resend.js";
import { generateRecurringSlotsForAllInterviewers } from "../services/expertRecurringSlots.service.js";

export const cronRouter = Router();

function isAuthorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const provided = req.query.secret ?? req.headers["x-cron-secret"];
  return provided === secret;
}

function dateKey(date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

function weekKey(date = new Date()): string {
  const start = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const day = Math.floor((date.getTime() - start.getTime()) / 86400_000);
  return `${date.getUTCFullYear()}-W${Math.floor(day / 7) + 1}`;
}

function periodKey(frequency: string, date = new Date()): string {
  const f = frequency.toLowerCase();
  if (f.includes("month")) return date.toISOString().slice(0, 7);
  if (f.includes("week")) return weekKey(date);
  return dateKey(date);
}

function windowStartForFrequency(frequency: string, now = new Date()): Date {
  const f = frequency.toLowerCase();
  const days = f.includes("month") ? 30 : f.includes("week") ? 7 : 1;
  return new Date(now.getTime() - days * 86400_000);
}

function parseSkillList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => String(item).trim().toLowerCase())
    .filter((item) => item.length > 0);
}

function jobMatchPercentage(job: { title: string; description: string | null; requiredSkills: unknown }, skills: string[]): number {
  if (skills.length === 0) return 100;
  const jobSkills = parseSkillList(job.requiredSkills);
  const haystack = `${job.title}\n${job.description ?? ""}\n${jobSkills.join("\n")}`.toLowerCase();
  const matched = skills.filter((skill) => haystack.includes(skill));
  return Math.round((matched.length / skills.length) * 100);
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

/** Daily: expand expert interviewer recurring schedules into concrete slots (~2 weeks ahead). */
cronRouter.post("/expert-recurring-slots", async (req: Request, res: Response) => {
  if (!isAuthorized(req)) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  try {
    const result = await generateRecurringSlotsForAllInterviewers();
    return res.json({ ok: true, ...result });
  } catch (e) {
    console.error("[cron/expert-recurring-slots]", e);
    return res.status(500).json({ error: e instanceof Error ? e.message : "Cron failed" });
  }
});

/** Hourly: send 24h and 1h reminders for scheduled Human Expert interviews. */
cronRouter.post("/human-interview-reminders", async (req: Request, res: Response) => {
  if (!isAuthorized(req)) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  try {
    const now = new Date();
    const windows = [
      { label: "24h", from: new Date(now.getTime() + 23 * 60 * 60 * 1000), to: new Date(now.getTime() + 25 * 60 * 60 * 1000) },
      { label: "1h", from: new Date(now.getTime() + 50 * 60 * 1000), to: new Date(now.getTime() + 70 * 60 * 1000) },
    ];

    let sent = 0;
    let skippedOrFailed = 0;
    for (const window of windows) {
      const sessions = await prisma.humanInterviewSession.findMany({
        where: {
          status: "scheduled",
          scheduledAt: { gte: window.from, lt: window.to },
        },
        include: {
          user: { select: { email: true, name: true, jobSeekerProfile: { select: { fullName: true } } } },
          interviewer: { include: { user: { select: { email: true, name: true } } } },
        },
      });
      for (const session of sessions) {
        if (!session.scheduledAt) continue;
        if (session.user.email) {
          const ok = await sendHumanInterviewReminderEmail({
            to: session.user.email,
            name: session.user.jobSeekerProfile?.fullName || session.user.name,
            scheduledAt: session.scheduledAt,
            dashboardPath: "/dashboard/jobseeker",
            recipientRole: "candidate",
            eventKey: `human-interview-reminder:${session.id}:${window.label}:candidate`,
          });
          ok ? sent++ : skippedOrFailed++;
        }
        const interviewerEmail = session.interviewer.user?.email;
        if (interviewerEmail) {
          const ok = await sendHumanInterviewReminderEmail({
            to: interviewerEmail,
            name: session.interviewer.name || session.interviewer.user?.name,
            scheduledAt: session.scheduledAt,
            dashboardPath: "/dashboard/expert",
            recipientRole: "interviewer",
            eventKey: `human-interview-reminder:${session.id}:${window.label}:interviewer`,
          });
          ok ? sent++ : skippedOrFailed++;
        }
      }
    }
    return res.json({ ok: true, sent, skipped_or_failed: skippedOrFailed });
  } catch (e) {
    console.error("[cron/human-interview-reminders]", e);
    return res.status(500).json({ error: e instanceof Error ? e.message : "Cron failed" });
  }
});

/** Hourly/daily: important workspace lifecycle emails only. */
cronRouter.post("/workspace-events", async (req: Request, res: Response) => {
  if (!isAuthorized(req)) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  try {
    const now = new Date();
    await prisma.workspace.updateMany({
      where: { status: { in: ["published", "started"] }, endAt: { lte: now } },
      data: { status: "ended" },
    });

    const startingSoon = await prisma.workspace.findMany({
      where: {
        status: { in: ["published", "started"] },
        startAt: { lte: new Date(now.getTime() + 24 * 60 * 60 * 1000) },
        endAt: { gte: now },
      },
      include: {
        registrations: {
          where: { status: "registered" },
          include: { user: { select: { email: true, name: true, jobSeekerProfile: { select: { fullName: true } } } } },
        },
      },
    });

    const recentlyEnded = await prisma.workspace.findMany({
      where: {
        status: "ended",
        endAt: { gte: new Date(now.getTime() - 48 * 60 * 60 * 1000), lte: now },
      },
      include: {
        registrations: {
          where: { status: "registered" },
          include: { user: { select: { email: true, name: true, jobSeekerProfile: { select: { fullName: true } } } } },
        },
      },
    });

    let sent = 0;
    let skippedOrFailed = 0;
    for (const workspace of startingSoon) {
      for (const registration of workspace.registrations) {
        if (!registration.user.email) continue;
        const ok = await sendWorkspaceStartedEmail({
          to: registration.user.email,
          name: registration.user.jobSeekerProfile?.fullName || registration.user.name,
          workspaceName: workspace.name,
          organization: workspace.organization,
          code: workspace.code,
          startsAt: workspace.startAt,
          eventKey: `workspace-started:${workspace.id}:${registration.userId}`,
        });
        ok ? sent++ : skippedOrFailed++;
      }
    }
    for (const workspace of recentlyEnded) {
      for (const registration of workspace.registrations) {
        if (!registration.user.email) continue;
        const ok = await sendWorkspaceResultsAvailableEmail({
          to: registration.user.email,
          name: registration.user.jobSeekerProfile?.fullName || registration.user.name,
          workspaceName: workspace.name,
          organization: workspace.organization,
          code: workspace.code,
          eventKey: `workspace-results:${workspace.id}:${registration.userId}`,
        });
        ok ? sent++ : skippedOrFailed++;
      }
    }

    return res.json({ ok: true, sent, skipped_or_failed: skippedOrFailed });
  } catch (e) {
    console.error("[cron/workspace-events]", e);
    return res.status(500).json({ error: e instanceof Error ? e.message : "Cron failed" });
  }
});

/** Daily: opt-in job alert digests. */
cronRouter.post("/job-alert-digests", async (req: Request, res: Response) => {
  if (!isAuthorized(req)) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  try {
    const now = new Date();
    const subscriptions = await prisma.jobAlertSubscription.findMany({
      where: { isActive: true },
    });
    if (subscriptions.length === 0) {
      return res.json({ ok: true, sent: 0, skipped: 0 });
    }

    const users = await prisma.user.findMany({
      where: { id: { in: subscriptions.map((subscription) => subscription.userId) }, role: "jobseeker" },
      select: { id: true, name: true, email: true },
    });
    const userById = new Map(users.map((user) => [user.id, user]));

    let sent = 0;
    let skipped = 0;
    for (const subscription of subscriptions) {
      const user = userById.get(subscription.userId);
      if (!user) {
        skipped++;
        continue;
      }
      const since = windowStartForFrequency(subscription.frequency, now);
      const jobs = await prisma.job.findMany({
        where: {
          status: { in: ["published", "active"] },
          createdAt: { gte: since },
        },
        orderBy: { createdAt: "desc" },
        take: 50,
      });
      const skills = parseSkillList(subscription.skills);
      const matches = jobs
        .map((job) => ({ job, match: jobMatchPercentage(job, skills) }))
        .filter((row) => row.match >= subscription.minMatchPercentage)
        .slice(0, 10)
        .map((row) => ({
          id: row.job.id,
          title: row.job.title,
          company: row.job.company,
          location: row.job.location,
        }));
      if (matches.length === 0) {
        skipped++;
        continue;
      }
      const ok = await sendJobAlertDigestEmail({
        to: subscription.email || user.email,
        name: user.name,
        jobs: matches,
        eventKey: `job-alert-digest:${subscription.id}:${subscription.frequency}:${periodKey(subscription.frequency, now)}`,
      });
      ok ? sent++ : skipped++;
    }
    return res.json({ ok: true, sent, skipped });
  } catch (e) {
    console.error("[cron/job-alert-digests]", e);
    return res.status(500).json({ error: e instanceof Error ? e.message : "Cron failed" });
  }
});
