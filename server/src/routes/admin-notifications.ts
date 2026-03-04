import { Router } from "express";
import { z } from "zod";
import { requireAdmin, AuthedRequest } from "../middleware/auth.js";

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
import { prisma } from "../config/prisma.js";
import { sendBroadcastEmails } from "../services/resend.js";

const TARGET_ROLES = ["all", "jobseeker", "recruiter", "expert_interviewer"] as const;

export const adminNotificationsRouter = Router();
adminNotificationsRouter.use(requireAdmin);

/** Resolve targetRoles to user IDs with emails */
async function resolveRecipients(
  targetRoles: readonly string[]
): Promise<{ userId: string; email: string; name: string | null }[]> {
  const hasAll = targetRoles.includes("all");
  const rolesToFetch = hasAll ? ["jobseeker", "recruiter", "expert_interviewer"] : targetRoles;

  const userIds = new Set<string>();
  const userMap = new Map<string, { email: string; name: string | null }>();

  if (rolesToFetch.includes("jobseeker") || hasAll) {
    const profiles = await prisma.jobSeekerProfile.findMany({
      include: { user: { select: { id: true, email: true, name: true } } },
    });
    for (const p of profiles) {
      if (p.user) {
        userIds.add(p.user.id);
        userMap.set(p.user.id, {
          email: p.user.email,
          name: p.user.name ?? p.fullName ?? null,
        });
      }
    }
  }
  if (rolesToFetch.includes("recruiter") || hasAll) {
    const profiles = await prisma.recruiterProfile.findMany({
      include: { user: { select: { id: true, email: true, name: true } } },
    });
    for (const p of profiles) {
      if (p.user) {
        userIds.add(p.user.id);
        userMap.set(p.user.id, {
          email: p.user.email,
          name: p.user.name ?? null,
        });
      }
    }
  }
  if (rolesToFetch.includes("expert_interviewer") || hasAll) {
    const interviewers = await prisma.interviewer.findMany({
      where: { userId: { not: null } },
      include: { user: { select: { id: true, email: true, name: true } } },
    });
    for (const inv of interviewers) {
      if (inv.user) {
        userIds.add(inv.user.id);
        userMap.set(inv.user.id, {
          email: inv.user.email,
          name: inv.user.name ?? inv.name ?? null,
        });
      }
    }
  }

  return Array.from(userIds).map((userId) => {
    const m = userMap.get(userId)!;
    return { userId, email: m.email, name: m.name };
  });
}

/**
 * POST /api/admin/notifications/broadcast
 * Admin sends message to target audience. Creates in-app notifications and optionally sends email.
 * If recipientIds is provided, sends only to those users (overrides targetRoles).
 */
adminNotificationsRouter.post("/broadcast", async (req: AuthedRequest, res) => {
  const schema = z.object({
    targetRoles: z.array(z.enum(TARGET_ROLES)).optional(),
    recipientIds: z.array(z.string().min(1)).optional(),
    title: z.string().min(1),
    message: z.string().min(1),
    sendEmail: z.boolean().optional().default(false),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: "Invalid payload",
      details: parsed.error.errors,
    });
  }

  const { targetRoles, recipientIds, title, message, sendEmail } = parsed.data;
  const adminId = req.user!.id;

  try {
    let recipients: { userId: string; email: string; name: string | null }[];
    if (recipientIds && recipientIds.length > 0) {
      const users = await prisma.user.findMany({
        where: { id: { in: recipientIds } },
        select: { id: true, email: true, name: true },
      });
      recipients = users.map((u) => ({ userId: u.id, email: u.email, name: u.name }));
    } else if (targetRoles && targetRoles.length > 0) {
      recipients = await resolveRecipients(targetRoles);
    } else {
      return res.status(400).json({ error: "Provide targetRoles or recipientIds" });
    }
    if (recipients.length === 0) {
      return res.json({
        ok: true,
        inAppCount: 0,
        emailSent: 0,
        emailFailed: 0,
        emailSkipped: true,
        message: "No recipients found for selected audience.",
      });
    }

    const targetRoleStr = recipientIds?.length ? "direct" : (targetRoles || []).join(",");

    const created = await prisma.notification.createMany({
      data: recipients.map((r) => ({
        userId: r.userId,
        title,
        message,
        targetRole: targetRoleStr,
        sentBy: adminId,
      })),
    });

    let emailResult = { sent: 0, failed: 0, skipped: true };
    if (sendEmail) {
      const baseUrl = process.env.BASE_URL || "http://localhost:8080";
      const htmlBody = `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #333;">${escapeHtml(title)}</h2>
          <div style="color: #555; line-height: 1.6;">${message}</div>
          <p style="margin-top: 24px; color: #888; font-size: 12px;">
            This message was sent from ProvenHire. <a href="${baseUrl}">Open app</a>
          </p>
        </div>
      `;
      emailResult = await sendBroadcastEmails(
        recipients.map((r) => ({ email: r.email, name: r.name })),
        title,
        htmlBody
      );
    }

    return res.json({
      ok: true,
      inAppCount: created.count,
      emailSent: emailResult.sent,
      emailFailed: emailResult.failed,
      emailSkipped: emailResult.skipped,
    });
  } catch (e) {
    console.error("[admin/notifications/broadcast]", e);
    return res.status(500).json({
      error: e instanceof Error ? e.message : "Failed to broadcast",
    });
  }
});
