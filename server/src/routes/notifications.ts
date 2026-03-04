import { Router } from "express";
import { z } from "zod";
import { requireAuth, AuthedRequest } from "../middleware/auth.js";
import { prisma } from "../config/prisma.js";

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

notificationsRouter.post("/contact-candidate", requireAuth, async (_req: AuthedRequest, res) => {
  res.json({ ok: true });
});
