import { Router } from "express";
import { z } from "zod";
import { requireAuth, AuthedRequest } from "../middleware/auth.js";
import { prisma } from "../config/prisma.js";
import {
  ensureRecruiterUsageRow,
  contactLimit,
  normalizeSubscriptionTier,
} from "../utils/recruiterSubscription.js";

export const notificationsRouter = Router();

notificationsRouter.get("/", requireAuth, async (req: AuthedRequest, res) => {
  const items = await prisma.notification.findMany({
    where: { userId: req.user!.id },
    orderBy: { createdAt: "desc" },
  });
  res.json({
    notifications: items.map((n) => ({
      ...n,
      subject: n.title,
      is_read: n.read,
      created_at: n.createdAt,
    })),
  });
});

notificationsRouter.post("/read", requireAuth, async (req: AuthedRequest, res) => {
  const schema = z.object({ id: z.string().min(1) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid payload" });
  await prisma.notification.update({ where: { id: parsed.data.id }, data: { read: true } });
  res.json({ ok: true });
});

notificationsRouter.post("/admin-message", requireAuth, async (req: AuthedRequest, res) => {
  const schema = z.object({
    title: z.string().min(1).optional(),
    subject: z.string().min(1).optional(),
    message: z.string().min(1),
    recipientIds: z.array(z.string()).optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid payload" });
  const title = parsed.data.title ?? parsed.data.subject ?? "Admin Message";
  if (parsed.data.recipientIds && parsed.data.recipientIds.length > 0) {
    if (req.user?.role !== "admin") {
      return res.status(403).json({ error: "Admin access required to send to multiple users" });
    }
    const created = await Promise.all(
      parsed.data.recipientIds.map((userId) =>
        prisma.notification.create({
          data: { userId, title, message: parsed.data.message },
        })
      )
    );
    return res.json({ ok: true, count: created.length });
  }
  const notification = await prisma.notification.create({
    data: { userId: req.user!.id, title, message: parsed.data.message },
  });
  res.json({ notification });
});

notificationsRouter.post("/status", requireAuth, async (_req, res) => {
  res.json({ ok: true });
});

notificationsRouter.post("/interview", requireAuth, async (_req, res) => {
  res.json({ ok: true });
});

notificationsRouter.post("/referral", requireAuth, async (_req, res) => {
  res.json({ ok: true });
});

notificationsRouter.post("/admin", requireAuth, async (_req, res) => {
  res.json({ ok: true });
});

notificationsRouter.post("/newsletter", async (_req, res) => {
  res.json({ ok: true });
});

notificationsRouter.get("/job-alerts", requireAuth, async (req: AuthedRequest, res) => {
  const subscription = await prisma.jobAlertSubscription.findUnique({ where: { userId: req.user!.id } });
  res.json({ subscription });
});

notificationsRouter.post("/job-alerts", requireAuth, async (req: AuthedRequest, res) => {
  const schema = z.object({
    email: z.string().email(),
    skills: z.any().optional(),
    isActive: z.boolean(),
    frequency: z.string(),
    minMatchPercentage: z.number(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid payload" });
  const subscription = await prisma.jobAlertSubscription.upsert({
    where: { userId: req.user!.id },
    create: { userId: req.user!.id, ...parsed.data },
    update: parsed.data,
  });
  res.json({ subscription });
});

notificationsRouter.post("/contact-candidate", requireAuth, async (req: AuthedRequest, res) => {
  const schema = z.object({
    candidateUserId: z.string().min(1),
    recruiterMessage: z.string().max(4000).optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid payload" });

  if (req.user!.role !== "recruiter") {
    return res.status(403).json({ error: "Only recruiters can express interest." });
  }

  const recruiter = await prisma.recruiterProfile.findUnique({
    where: { userId: req.user!.id },
    include: { usage: true },
  });
  if (!recruiter?.companyName) {
    return res.status(403).json({ error: "Complete your recruiter profile before contacting candidates." });
  }

  const usageRow = recruiter.usage ?? (await ensureRecruiterUsageRow(recruiter.id));
  const tier = normalizeSubscriptionTier(usageRow);
  const lim = contactLimit(tier);

  if (lim === 0) {
    return res.status(402).json({
      error: "Express Interest is not included on the free recruiter plan. Upgrade to Starter or Growth.",
      code: "CONTACT_LIMIT",
      limit: 0,
      used: usageRow.contactCountMonth,
    });
  }

  if (lim !== Number.MAX_SAFE_INTEGER && usageRow.contactCountMonth >= lim) {
    return res.status(402).json({
      error: "You have used all contact credits for this month.",
      code: "CONTACT_LIMIT",
      limit: lim,
      used: usageRow.contactCountMonth,
    });
  }

  const candidate = await prisma.user.findUnique({
    where: { id: parsed.data.candidateUserId },
    select: { id: true, role: true },
  });
  if (!candidate || candidate.role !== "jobseeker") {
    return res.status(404).json({ error: "Candidate not found" });
  }

  await prisma.recruiterUsage.update({
    where: { recruiterId: recruiter.id },
    data: { contactCountMonth: { increment: 1 } },
  });

  const title = `${recruiter.companyName ?? "A recruiter"} is interested in your profile`;
  const msg =
    (parsed.data.recruiterMessage?.trim() ? `${parsed.data.recruiterMessage.trim()}\n\n` : "") +
    "Open ProvenHire to respond and see next steps.";
  await prisma.notification.create({
    data: { userId: candidate.id, title, message: msg },
  });

  res.json({ ok: true });
});
