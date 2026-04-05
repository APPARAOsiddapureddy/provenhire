import { Router, Response, NextFunction } from "express";
import { z } from "zod";
import { requireExpertInterviewer, AuthedRequest } from "../middleware/auth.js";
import { prisma } from "../config/prisma.js";
import { rolesMatch } from "../data/interviewerRoles.js";
import { calculateCertificationLevel } from "../services/verificationLevel.service.js";
import { syncJobSeekerVerificationStatus } from "../services/certification.service.js";
import { encryptSensitiveField } from "../utils/fieldEncryption.js";
import {
  computeWeightedTotal,
  extractDimensionScores,
  EXPERT_EARNINGS_PAISE,
  EXPERT_PASS_THRESHOLD,
  HUMAN_EXPERT_RETRY_DAYS,
  persistableScorePayload,
  type ExpertTrack,
} from "../services/expertEvaluation.service.js";

export const expertRouter = Router();
expertRouter.use(requireExpertInterviewer);

/** PRD §4.4 — mandatory profile before dashboard features (except profile read/update). */
async function requireExpertProfileComplete(req: AuthedRequest, res: Response, next: NextFunction) {
  const path = req.path ?? "";
  const method = req.method;
  if ((method === "GET" || method === "POST" || method === "PATCH") && path === "/profile") {
    return next();
  }
  const interviewer = await prisma.interviewer.findFirst({ where: { userId: req.user!.id } });
  if (!interviewer) {
    return res.status(404).json({ error: "Interviewer profile not found" });
  }
  if (!interviewer.profileCompleted) {
    return res.status(403).json({
      error: "Complete your expert profile to continue.",
      code: "PROFILE_INCOMPLETE",
    });
  }
  next();
}

expertRouter.use(requireExpertProfileComplete);

/** Pending candidates: completed AI stage, not yet human expert. Role must match interviewer. */
expertRouter.get("/pending-candidates", async (req: AuthedRequest, res) => {
  const interviewer = await prisma.interviewer.findFirst({ where: { userId: req.user!.id } });
  if (!interviewer) return res.status(404).json({ error: "Interviewer profile not found" });
  const invRole = interviewer.domain ?? (Array.isArray(interviewer.domains) ? (interviewer.domains as string[])[0] : null);
  const track = interviewer.track ?? "technical";

  const aiStage = track === "non_technical" ? "non_tech_assignment" : "expert_interview";
  const completedAi = await prisma.verificationStage.findMany({
    where: { stageName: aiStage, status: "completed" },
    select: { userId: true },
  });
  const completedHuman = await prisma.verificationStage.findMany({
    where: { stageName: "human_expert_interview", status: { in: ["completed", "failed"] } },
    select: { userId: true },
  });
  const hasScheduled = await prisma.humanInterviewSession.findMany({
    where: { status: { in: ["scheduled", "in_progress"] } },
    select: { userId: true },
  });
  const pendingUserIds = new Set(completedAi.map((r) => r.userId));
  completedHuman.forEach((r) => pendingUserIds.delete(r.userId));
  hasScheduled.forEach((r) => pendingUserIds.delete(r.userId));

  const profiles = await prisma.jobSeekerProfile.findMany({
    where: {
      userId: { in: Array.from(pendingUserIds) },
      roleType: track,
    },
    include: { user: { select: { id: true, name: true, email: true } } },
  });

  const matched = profiles.filter((p) => rolesMatch(p.targetJobTitle, invRole));
  res.json({
    candidates: matched.map((p) => ({
      userId: p.userId,
      fullName: p.fullName ?? p.user?.name,
      email: p.email ?? p.user?.email,
      targetJobTitle: p.targetJobTitle,
      experienceYears: p.experienceYears,
    })),
  });
});

const scheduleSchema = z.object({ candidateUserId: z.string().uuid(), slotId: z.string().uuid() });
expertRouter.post("/schedule-interview", async (req: AuthedRequest, res) => {
  const interviewer = await prisma.interviewer.findFirst({ where: { userId: req.user!.id } });
  if (!interviewer) return res.status(404).json({ error: "Interviewer profile not found" });
  const parsed = scheduleSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten().fieldErrors });
  const { candidateUserId, slotId } = parsed.data;

  const slot = await prisma.interviewerSlot.findFirst({
    where: { id: slotId, interviewerId: interviewer.id },
  });
  if (!slot) return res.status(404).json({ error: "Slot not found" });
  if (slot.status !== "available") return res.status(400).json({ error: "Slot is no longer available" });

  const profile = await prisma.jobSeekerProfile.findUnique({
    where: { userId: candidateUserId },
    include: { user: true },
  });
  if (!profile) return res.status(404).json({ error: "Candidate not found" });
  const invRole = interviewer.domain ?? (Array.isArray(interviewer.domains) ? (interviewer.domains as string[])[0] : null);
  if (!rolesMatch(profile.targetJobTitle, invRole)) {
    return res.status(400).json({ error: "Candidate role does not match your interview domain" });
  }
  if (profile.roleType !== (interviewer.track ?? "technical")) {
    return res.status(400).json({ error: "Candidate track does not match" });
  }

  const existingSession = await prisma.humanInterviewSession.findFirst({
    where: { userId: candidateUserId, status: { in: ["scheduled", "in_progress"] } },
  });
  if (existingSession) return res.status(400).json({ error: "Candidate already has a scheduled interview" });

  let session: Awaited<ReturnType<typeof prisma.humanInterviewSession.create>>;
  try {
    session = await prisma.$transaction(async (tx) => {
      const claimed = await tx.interviewerSlot.updateMany({
        where: { id: slotId, interviewerId: interviewer.id, status: "available" },
        data: { status: "booked", bookedUserId: candidateUserId },
      });
      if (claimed.count === 0) {
        throw new Error("SLOT_TAKEN");
      }
      return tx.humanInterviewSession.create({
        data: {
          userId: candidateUserId,
          interviewerId: interviewer.id,
          slotId: slot.id,
          scheduledAt: slot.startsAt,
          status: "scheduled",
        },
      });
    });
  } catch (e) {
    if (e instanceof Error && e.message === "SLOT_TAKEN") {
      return res.status(409).json({ error: "Slot is no longer available." });
    }
    throw e;
  }

  await prisma.verificationStage.upsert({
    where: {
      userId_stageName: { userId: candidateUserId, stageName: "human_expert_interview" },
    },
    create: { userId: candidateUserId, stageName: "human_expert_interview", status: "in_progress" },
    update: { status: "in_progress" },
  });

  res.status(201).json({ session, message: "Interview scheduled" });
});

expertRouter.get("/stats", async (req: AuthedRequest, res) => {
  const interviewer = await prisma.interviewer.findFirst({ where: { userId: req.user!.id } });
  if (!interviewer) return res.status(404).json({ error: "Interviewer profile not found" });

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const y = now.getFullYear();
  const m = now.getMonth() + 1;

  const [conductedCount, passedCount, thisMonthCount, earningsSum] = await Promise.all([
    prisma.humanInterviewSession.count({
      where: { interviewerId: interviewer.id, evaluationSubmittedAt: { not: null } },
    }),
    prisma.humanInterviewSession.count({
      where: { interviewerId: interviewer.id, evaluationPass: true },
    }),
    prisma.humanInterviewSession.count({
      where: {
        interviewerId: interviewer.id,
        evaluationSubmittedAt: { gte: monthStart },
      },
    }),
    prisma.interviewerEarning.aggregate({
      where: { interviewerId: interviewer.id, year: y, month: m },
      _sum: { amountPaise: true },
    }),
  ]);

  res.json({
    conductedCount,
    passedCount,
    passRate: conductedCount ? Math.round((passedCount / conductedCount) * 100) : 0,
    thisMonthCount,
    thisMonthEarningsPaise: earningsSum._sum.amountPaise ?? 0,
    totalInterviews: interviewer.totalInterviews,
    totalPassed: interviewer.totalPassed,
  });
});

expertRouter.get("/profile", async (req: AuthedRequest, res) => {
  const interviewer = await prisma.interviewer.findFirst({
    where: { userId: req.user!.id },
    include: { slots: { where: { startsAt: { gte: new Date() } }, orderBy: { startsAt: "asc" } } },
  });
  if (!interviewer) return res.status(404).json({ error: "Interviewer profile not found" });
  res.json({ interviewer });
});

const completeProfileSchema = z.object({
  profileImage: z.string().url().optional().nullable(),
  bio: z.string().min(80).max(4000),
  currentCompany: z.string().min(1).max(200),
  jobTitle: z.string().min(1).max(200),
  linkedInUrl: z.string().url(),
  expertiseAreas: z.array(z.string()).min(1),
  preferredInterviewTopics: z.array(z.string()).min(1),
  languagesSpoken: z.array(z.string()).min(1),
});

expertRouter.post("/profile", async (req: AuthedRequest, res) => {
  const interviewer = await prisma.interviewer.findFirst({ where: { userId: req.user!.id } });
  if (!interviewer) return res.status(404).json({ error: "Interviewer profile not found" });
  const parsed = completeProfileSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten().fieldErrors });

  const d = parsed.data;
  const updated = await prisma.interviewer.update({
    where: { id: interviewer.id },
    data: {
      profileImage: d.profileImage ?? undefined,
      bio: d.bio,
      currentCompany: d.currentCompany,
      jobTitle: d.jobTitle,
      linkedInUrl: d.linkedInUrl,
      expertiseAreas: d.expertiseAreas,
      preferredInterviewTopics: d.preferredInterviewTopics,
      languagesSpoken: d.languagesSpoken,
      profileCompleted: true,
    },
  });
  res.json({ interviewer: updated });
});

const updateProfileSchema = z.object({
  phone: z.string().max(20).optional(),
  profileImage: z.string().url().optional().nullable(),
  bio: z.string().min(80).max(4000).optional(),
  currentCompany: z.string().min(1).max(200).optional(),
  jobTitle: z.string().min(1).max(200).optional(),
  linkedInUrl: z.string().url().optional(),
  expertiseAreas: z.array(z.string()).min(1).optional(),
  preferredInterviewTopics: z.array(z.string()).min(1).optional(),
  languagesSpoken: z.array(z.string()).min(1).optional(),
});

expertRouter.patch("/profile", async (req: AuthedRequest, res) => {
  const interviewer = await prisma.interviewer.findFirst({ where: { userId: req.user!.id } });
  if (!interviewer) return res.status(404).json({ error: "Interviewer profile not found" });
  const parsed = updateProfileSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten().fieldErrors });
  const updated = await prisma.interviewer.update({
    where: { id: interviewer.id },
    data: parsed.data,
  });
  res.json({ interviewer: updated });
});

const bankDetailsSchema = z.object({
  accountHolder: z.string().min(1).max(200),
  accountNumber: z.string().min(5).max(32),
  ifscCode: z.string().min(11).max(11),
  bankName: z.string().min(1).max(200),
});

expertRouter.post("/bank-details", async (req: AuthedRequest, res) => {
  const interviewer = await prisma.interviewer.findFirst({ where: { userId: req.user!.id } });
  if (!interviewer) return res.status(404).json({ error: "Interviewer profile not found" });
  const parsed = bankDetailsSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten().fieldErrors });
  const enc = encryptSensitiveField(parsed.data.accountNumber);
  await prisma.interviewerBankDetails.upsert({
    where: { interviewerId: interviewer.id },
    create: {
      interviewerId: interviewer.id,
      accountHolder: parsed.data.accountHolder,
      accountNumber: enc,
      ifscCode: parsed.data.ifscCode.toUpperCase(),
      bankName: parsed.data.bankName,
    },
    update: {
      accountHolder: parsed.data.accountHolder,
      accountNumber: enc,
      ifscCode: parsed.data.ifscCode.toUpperCase(),
      bankName: parsed.data.bankName,
    },
  });
  res.status(204).end();
});

expertRouter.get("/earnings/summary", async (req: AuthedRequest, res) => {
  const interviewer = await prisma.interviewer.findFirst({ where: { userId: req.user!.id } });
  if (!interviewer) return res.status(404).json({ error: "Interviewer profile not found" });
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth() + 1;
  const [monthSessions, sum] = await Promise.all([
    prisma.interviewerEarning.count({
      where: { interviewerId: interviewer.id, year: y, month: m },
    }),
    prisma.interviewerEarning.aggregate({
      where: { interviewerId: interviewer.id, year: y, month: m },
      _sum: { amountPaise: true },
    }),
  ]);
  res.json({
    year: y,
    month: m,
    sessions: monthSessions,
    earningsPaise: sum._sum.amountPaise ?? 0,
    payoutStatus: "pending",
  });
});

expertRouter.get("/earnings/history", async (req: AuthedRequest, res) => {
  const interviewer = await prisma.interviewer.findFirst({ where: { userId: req.user!.id } });
  if (!interviewer) return res.status(404).json({ error: "Interviewer profile not found" });
  const rows = await prisma.interviewerEarning.findMany({
    where: { interviewerId: interviewer.id },
    orderBy: [{ year: "desc" }, { month: "desc" }, { createdAt: "desc" }],
    take: 500,
  });
  const byMonth = new Map<
    string,
    { year: number; month: number; sessions: number; earningsPaise: number; payoutStatus: string }
  >();
  for (const r of rows) {
    const key = `${r.year}-${r.month}`;
    const cur = byMonth.get(key);
    if (!cur) {
      byMonth.set(key, {
        year: r.year,
        month: r.month,
        sessions: 1,
        earningsPaise: r.amountPaise,
        payoutStatus: r.payoutStatus,
      });
    } else {
      cur.sessions += 1;
      cur.earningsPaise += r.amountPaise;
    }
  }
  res.json({
    history: Array.from(byMonth.values()).sort((a, b) => (b.year !== a.year ? b.year - a.year : b.month - a.month)),
  });
});

expertRouter.get("/earnings/sessions", async (req: AuthedRequest, res) => {
  const interviewer = await prisma.interviewer.findFirst({ where: { userId: req.user!.id } });
  if (!interviewer) return res.status(404).json({ error: "Interviewer profile not found" });
  const rows = await prisma.interviewerEarning.findMany({
    where: { interviewerId: interviewer.id },
    orderBy: { createdAt: "desc" },
    take: 100,
    include: {
      session: {
        include: {
          user: { include: { jobSeekerProfile: { select: { targetJobTitle: true } } } },
        },
      },
    },
  });
  res.json({
    sessions: rows.map((r) => ({
      id: r.id,
      amountPaise: r.amountPaise,
      month: r.month,
      year: r.year,
      payoutStatus: r.payoutStatus,
      paidAt: r.paidAt,
      scheduledAt: r.session.scheduledAt,
      candidateRole: r.session.user?.jobSeekerProfile?.targetJobTitle ?? null,
    })),
  });
});

expertRouter.get("/slots", async (req: AuthedRequest, res) => {
  const interviewer = await prisma.interviewer.findFirst({ where: { userId: req.user!.id } });
  if (!interviewer) return res.status(404).json({ error: "Interviewer profile not found" });
  const from = req.query.from ? new Date(String(req.query.from)) : new Date();
  const slots = await prisma.interviewerSlot.findMany({
    where: { interviewerId: interviewer.id, startsAt: { gte: from } },
    orderBy: { startsAt: "asc" },
    take: 500,
  });
  res.json({ slots });
});

const createSlotSchema = z.object({
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime().optional(),
});
expertRouter.post("/slots", async (req: AuthedRequest, res) => {
  const interviewer = await prisma.interviewer.findFirst({ where: { userId: req.user!.id } });
  if (!interviewer) return res.status(404).json({ error: "Interviewer profile not found" });
  const parsed = createSlotSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten().fieldErrors });
  const { startsAt, endsAt } = parsed.data;
  const start = new Date(startsAt);
  const end = endsAt ? new Date(endsAt) : new Date(start.getTime() + 45 * 60 * 1000);
  if (start >= end || start < new Date()) {
    return res.status(400).json({ error: "Invalid slot times" });
  }
  const slot = await prisma.interviewerSlot.create({
    data: { interviewerId: interviewer.id, startsAt: start, endsAt: end },
  });
  res.status(201).json({ slot });
});

const bulkSlotsSchema = z.object({
  slots: z.array(
    z.object({
      startsAt: z.string().datetime(),
      endsAt: z.string().datetime().optional(),
    })
  ),
});

expertRouter.post("/slots/bulk", async (req: AuthedRequest, res) => {
  const interviewer = await prisma.interviewer.findFirst({ where: { userId: req.user!.id } });
  if (!interviewer) return res.status(404).json({ error: "Interviewer profile not found" });
  const parsed = bulkSlotsSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten().fieldErrors });
  const created: { id: string; startsAt: Date }[] = [];
  for (const s of parsed.data.slots) {
    const start = new Date(s.startsAt);
    const end = s.endsAt ? new Date(s.endsAt) : new Date(start.getTime() + 45 * 60 * 1000);
    if (start >= end || start < new Date()) continue;
    const slot = await prisma.interviewerSlot.create({
      data: { interviewerId: interviewer.id, startsAt: start, endsAt: end },
    });
    created.push({ id: slot.id, startsAt: slot.startsAt });
  }
  res.status(201).json({ created: created.length, slots: created });
});

const recurringSchema = z.object({
  daysOfWeek: z.array(z.number().int().min(0).max(6)).min(1),
  timeSlots: z.array(z.string().regex(/^\d{1,2}:\d{2}$/)).min(1),
});

expertRouter.post("/recurring-schedule", async (req: AuthedRequest, res) => {
  const interviewer = await prisma.interviewer.findFirst({ where: { userId: req.user!.id } });
  if (!interviewer) return res.status(404).json({ error: "Interviewer profile not found" });
  const parsed = recurringSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten().fieldErrors });
  await prisma.interviewer.update({
    where: { id: interviewer.id },
    data: {
      recurringSchedule: parsed.data as object,
      recurringActive: true,
    },
  });
  res.json({ ok: true });
});

expertRouter.delete("/recurring-schedule", async (req: AuthedRequest, res) => {
  const interviewer = await prisma.interviewer.findFirst({ where: { userId: req.user!.id } });
  if (!interviewer) return res.status(404).json({ error: "Interviewer profile not found" });
  await prisma.interviewer.update({
    where: { id: interviewer.id },
    data: { recurringActive: false },
  });
  res.json({ ok: true });
});

expertRouter.delete("/slots/:id", async (req: AuthedRequest, res) => {
  const interviewer = await prisma.interviewer.findFirst({ where: { userId: req.user!.id } });
  if (!interviewer) return res.status(404).json({ error: "Interviewer profile not found" });
  const slot = await prisma.interviewerSlot.findFirst({
    where: { id: req.params.id, interviewerId: interviewer.id },
  });
  if (!slot) return res.status(404).json({ error: "Slot not found" });
  if (slot.status === "booked") return res.status(400).json({ error: "Cannot delete a booked slot" });
  await prisma.interviewerSlot.delete({ where: { id: slot.id } });
  res.json({ ok: true });
});

expertRouter.get("/sessions/upcoming", async (req: AuthedRequest, res) => {
  const interviewer = await prisma.interviewer.findFirst({ where: { userId: req.user!.id } });
  if (!interviewer) return res.status(404).json({ error: "Interviewer profile not found" });
  const sessions = await prisma.humanInterviewSession.findMany({
    where: {
      interviewerId: interviewer.id,
      status: { in: ["scheduled", "in_progress"] },
      scheduledAt: { gte: new Date() },
    },
    include: {
      user: { include: { jobSeekerProfile: true } },
      slot: true,
    },
    orderBy: { scheduledAt: "asc" },
  });
  const userIds = [...new Set(sessions.map((s) => s.userId))];
  const certByUser = new Map<string, Awaited<ReturnType<typeof calculateCertificationLevel>>>();
  await Promise.all(
    userIds.map(async (uid) => {
      certByUser.set(uid, await calculateCertificationLevel(uid));
    })
  );
  res.json({
    sessions: sessions.map((s) => {
      const c = certByUser.get(s.userId);
      return {
        ...s,
        candidate_certification_numeric: c?.level ?? 0,
        candidate_certification_code: c?.certificationLevel ?? null,
        candidate_certification_label_short: c?.certificationLabel ?? null,
      };
    }),
  });
});

expertRouter.get("/sessions/past", async (req: AuthedRequest, res) => {
  const interviewer = await prisma.interviewer.findFirst({ where: { userId: req.user!.id } });
  if (!interviewer) return res.status(404).json({ error: "Interviewer profile not found" });
  const sessions = await prisma.humanInterviewSession.findMany({
    where: {
      interviewerId: interviewer.id,
      evaluationSubmittedAt: { not: null },
    },
    include: {
      user: { include: { jobSeekerProfile: true } },
      slot: true,
      earning: true,
    },
    orderBy: { evaluationSubmittedAt: "desc" },
    take: 50,
  });
  const pastUserIds = [...new Set(sessions.map((s) => s.userId))];
  const certPast = new Map<string, Awaited<ReturnType<typeof calculateCertificationLevel>>>();
  await Promise.all(
    pastUserIds.map(async (uid) => {
      certPast.set(uid, await calculateCertificationLevel(uid));
    })
  );
  res.json({
    sessions: sessions.map((s) => {
      const c = certPast.get(s.userId);
      const payload = s.evaluationScores as { weightedTotal?: number } | null;
      return {
        ...s,
        weightedScoreSubmitted: payload?.weightedTotal ?? null,
        earningsPaise: s.earning?.amountPaise ?? null,
        candidate_certification_numeric: c?.level ?? 0,
        candidate_certification_code: c?.certificationLevel ?? null,
        candidate_certification_label_short: c?.certificationLabel ?? null,
      };
    }),
  });
});

expertRouter.post("/sessions/:id/create-room", async (req: AuthedRequest, res) => {
  const interviewer = await prisma.interviewer.findFirst({ where: { userId: req.user!.id } });
  if (!interviewer) return res.status(404).json({ error: "Interviewer profile not found" });
  const session = await prisma.humanInterviewSession.findFirst({
    where: { id: req.params.id, interviewerId: interviewer.id },
  });
  if (!session) return res.status(404).json({ error: "Session not found" });
  if (session.meetingLink) {
    return res.json({ roomUrl: session.meetingLink });
  }
  return res.status(400).json({ error: "Add your Google Meet link below, then open it to start the interview." });
});

expertRouter.get("/sessions/:id", async (req: AuthedRequest, res) => {
  const interviewer = await prisma.interviewer.findFirst({ where: { userId: req.user!.id } });
  if (!interviewer) return res.status(404).json({ error: "Interviewer profile not found" });
  const session = await prisma.humanInterviewSession.findFirst({
    where: { id: req.params.id, interviewerId: interviewer.id },
    include: {
      user: { include: { jobSeekerProfile: true } },
      slot: true,
      interviewer: { select: { id: true, track: true } },
    },
  });
  if (!session) return res.status(404).json({ error: "Session not found" });
  res.json({ session });
});

expertRouter.patch("/sessions/:id", async (req: AuthedRequest, res) => {
  const interviewer = await prisma.interviewer.findFirst({ where: { userId: req.user!.id } });
  if (!interviewer) return res.status(404).json({ error: "Interviewer profile not found" });
  const session = await prisma.humanInterviewSession.findFirst({
    where: { id: req.params.id, interviewerId: interviewer.id },
  });
  if (!session) return res.status(404).json({ error: "Session not found" });
  const { meetingLink } = req.body as { meetingLink?: string };
  const updated = await prisma.humanInterviewSession.update({
    where: { id: session.id },
    data: meetingLink !== undefined ? { meetingLink: meetingLink || null } : {},
  });
  if (meetingLink && meetingLink.length > 0) {
    await prisma.notification.create({
      data: {
        userId: session.userId,
        title: "Expert interview — meeting link",
        message: `Your interview link is ready. Join: ${meetingLink}`,
        targetRole: "jobseeker",
      },
    });
  }
  res.json({ session: updated });
});

const evaluateBodySchema = z.object({
  candidateFeedback: z.string().min(50).max(4000),
  internalNotes: z.string().max(2000).optional(),
  interviewerNotes: z.string().max(8000).optional(),
});

expertRouter.post("/sessions/:id/evaluate", async (req: AuthedRequest, res) => {
  const interviewer = await prisma.interviewer.findFirst({ where: { userId: req.user!.id } });
  if (!interviewer) return res.status(404).json({ error: "Interviewer profile not found" });
  const session = await prisma.humanInterviewSession.findFirst({
    where: { id: req.params.id, interviewerId: interviewer.id },
  });
  if (!session) return res.status(404).json({ error: "Session not found" });
  if (session.evaluationSubmittedAt) {
    return res.status(409).json({ error: "Evaluation already submitted" });
  }

  const track: ExpertTrack = interviewer.track === "non_technical" ? "non_technical" : "technical";
  const meta = evaluateBodySchema.safeParse(req.body);
  if (!meta.success) return res.status(400).json({ error: meta.error.flatten().fieldErrors });

  const { scores, missingKeys } = extractDimensionScores(req.body as Record<string, unknown>, track);
  if (missingKeys.length) {
    return res.status(400).json({ error: `Missing or invalid scores: ${missingKeys.join(", ")}` });
  }

  const weighted = computeWeightedTotal(scores, track);
  const pass = weighted >= EXPERT_PASS_THRESHOLD;
  const persisted = persistableScorePayload(scores, track, weighted);
  const now = new Date();

  await prisma.$transaction(async (tx) => {
    await tx.humanInterviewSession.update({
      where: { id: session.id },
      data: {
        status: "completed",
        completedAt: now,
        evaluationScores: persisted as object,
        evaluationNotes: meta.data.internalNotes ?? null,
        interviewerNotes: meta.data.interviewerNotes ?? null,
        candidateFeedback: meta.data.candidateFeedback,
        evaluationPass: pass,
        evaluationSubmittedAt: now,
      },
    });

    await tx.interviewerEarning.create({
      data: {
        interviewerId: interviewer.id,
        sessionId: session.id,
        amountPaise: EXPERT_EARNINGS_PAISE,
        month: now.getMonth() + 1,
        year: now.getFullYear(),
        payoutStatus: "pending",
      },
    });

    await tx.interviewer.update({
      where: { id: interviewer.id },
      data: {
        totalInterviews: { increment: 1 },
        ...(pass ? { totalPassed: { increment: 1 } } : {}),
      },
    });
  });

  if (pass) {
    await prisma.jobSeekerProfile.updateMany({
      where: { userId: session.userId },
      data: { verificationStatus: "expert_verified", humanExpertRetryAfter: null },
    });
    await prisma.verificationStage.updateMany({
      where: { userId: session.userId, stageName: "human_expert_interview" },
      data: { status: "completed", score: Math.round(weighted) },
    });
  } else {
    const retry = new Date();
    retry.setUTCDate(retry.getUTCDate() + HUMAN_EXPERT_RETRY_DAYS);
    await prisma.jobSeekerProfile.updateMany({
      where: { userId: session.userId },
      data: { humanExpertRetryAfter: retry },
    });
    await prisma.verificationStage.updateMany({
      where: { userId: session.userId, stageName: "human_expert_interview" },
      data: { status: "failed", score: Math.round(weighted) },
    });
  }

  try {
    await syncJobSeekerVerificationStatus(session.userId);
  } catch (e) {
    console.warn("[expert/evaluate] syncJobSeekerVerificationStatus", e);
  }

  await prisma.notification.create({
    data: {
      userId: session.userId,
      title: "Human Expert Interview completed",
      message:
        "Your Human Expert Interview has been completed. Your result will be available within 15 minutes.",
      targetRole: "jobseeker",
    },
  });

  res.json({
    ok: true,
    message: "Evaluation recorded.",
    earningsPaise: EXPERT_EARNINGS_PAISE,
    weightedScoreSubmitted: Math.round(weighted * 100) / 100,
  });
});
