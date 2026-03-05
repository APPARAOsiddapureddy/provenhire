import { Router } from "express";
import { z } from "zod";
import { requireExpertInterviewer, AuthedRequest } from "../middleware/auth.js";
import { prisma } from "../config/prisma.js";
import { rolesMatch } from "../data/interviewerRoles.js";
// Daily.co disabled for MVP - using Google Meet. Uncomment when budget allows.
// import { createDailyRoom, createMeetingToken, getRoomNameFromUrl } from "../services/daily.js";

export const expertRouter = Router();
expertRouter.use(requireExpertInterviewer);

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

/** Schedule interview with a pending candidate (interviewer picks slot) */
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

  const [session] = await prisma.$transaction([
    prisma.humanInterviewSession.create({
      data: {
        userId: candidateUserId,
        interviewerId: interviewer.id,
        slotId: slot.id,
        scheduledAt: slot.startsAt,
        status: "scheduled",
      },
    }),
    prisma.interviewerSlot.update({
      where: { id: slot.id },
      data: { status: "booked", bookedUserId: candidateUserId },
    }),
  ]);

  const existing = await prisma.verificationStage.findFirst({
    where: { userId: candidateUserId, stageName: "human_expert_interview" },
  });
  if (existing) {
    await prisma.verificationStage.update({ where: { id: existing.id }, data: { status: "in_progress" } });
  } else {
    await prisma.verificationStage.create({
      data: { userId: candidateUserId, stageName: "human_expert_interview", status: "in_progress" },
    });
  }

  res.status(201).json({ session, message: "Interview scheduled" });
});

/** Stats for dashboard */
expertRouter.get("/stats", async (req: AuthedRequest, res) => {
  const interviewer = await prisma.interviewer.findFirst({ where: { userId: req.user!.id } });
  if (!interviewer) return res.status(404).json({ error: "Interviewer profile not found" });
  const [total, passed] = await Promise.all([
    prisma.humanInterviewSession.count({ where: { interviewerId: interviewer.id, evaluationSubmittedAt: { not: null } } }),
    prisma.humanInterviewSession.count({ where: { interviewerId: interviewer.id, evaluationPass: true } }),
  ]);
  res.json({ totalConducted: total, passed, passRate: total ? Math.round((passed / total) * 100) : 0 });
});

/** Get my interviewer profile + slots */
expertRouter.get("/profile", async (req: AuthedRequest, res) => {
  const interviewer = await prisma.interviewer.findFirst({
    where: { userId: req.user!.id },
    include: { slots: { where: { startsAt: { gte: new Date() } }, orderBy: { startsAt: "asc" } } },
  });
  if (!interviewer) return res.status(404).json({ error: "Interviewer profile not found" });
  res.json({ interviewer });
});

/** Update interviewer profile (e.g. phone) */
const updateProfileSchema = z.object({ phone: z.string().max(20).optional() });
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

/** Create a slot */
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

/** Delete a slot (only if not booked) */
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

/** Upcoming sessions */
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
  res.json({ sessions });
});

/** Past sessions — must be before /sessions/:id so "past" isn't matched as id */
expertRouter.get("/sessions/past", async (req: AuthedRequest, res) => {
  const interviewer = await prisma.interviewer.findFirst({ where: { userId: req.user!.id } });
  if (!interviewer) return res.status(404).json({ error: "Interviewer profile not found" });
  const sessions = await prisma.humanInterviewSession.findMany({
    where: {
      interviewerId: interviewer.id,
      OR: [{ status: "completed" }, { completedAt: { lt: new Date() } }],
    },
    include: {
      user: { include: { jobSeekerProfile: true } },
      slot: true,
    },
    orderBy: { scheduledAt: "desc" },
    take: 50,
  });
  res.json({ sessions });
});

/** MVP: Get meeting link (Google Meet). Interviewer adds via PATCH. Daily.co disabled. */
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

/** Get single session (for interview room) */
expertRouter.get("/sessions/:id", async (req: AuthedRequest, res) => {
  const interviewer = await prisma.interviewer.findFirst({ where: { userId: req.user!.id } });
  if (!interviewer) return res.status(404).json({ error: "Interviewer profile not found" });
  const session = await prisma.humanInterviewSession.findFirst({
    where: { id: req.params.id, interviewerId: interviewer.id },
    include: {
      user: { include: { jobSeekerProfile: true } },
      slot: true,
    },
  });
  if (!session) return res.status(404).json({ error: "Session not found" });
  res.json({ session });
});

/** Update session (e.g. meeting link) */
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
  res.json({ session: updated });
});

/** Submit evaluation */
const evaluateSchema = z.object({
  technicalDepth: z.number().min(0).max(100),
  problemSolving: z.number().min(0).max(100),
  authenticity: z.number().min(0).max(100),
  realWorldExposure: z.number().min(0).max(100),
  systemThinking: z.number().min(0).max(100),
  communication: z.number().min(0).max(100),
  notes: z.string().max(2000).optional(),
});
expertRouter.post("/sessions/:id/evaluate", async (req: AuthedRequest, res) => {
  const interviewer = await prisma.interviewer.findFirst({ where: { userId: req.user!.id } });
  if (!interviewer) return res.status(404).json({ error: "Interviewer profile not found" });
  const session = await prisma.humanInterviewSession.findFirst({
    where: { id: req.params.id, interviewerId: interviewer.id },
  });
  if (!session) return res.status(404).json({ error: "Session not found" });
  if (session.evaluationSubmittedAt) return res.status(400).json({ error: "Evaluation already submitted" });

  const parsed = evaluateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten().fieldErrors });
  const scores = parsed.data;
  const weights = { technicalDepth: 0.30, problemSolving: 0.20, authenticity: 0.15, realWorldExposure: 0.15, systemThinking: 0.10, communication: 0.10 };
  const total = (Object.entries(weights) as [keyof typeof weights, number][]).reduce(
    (s, [k, w]) => s + (typeof scores[k] === "number" ? scores[k] : 0) * w,
    0
  );
  const pass = total >= 70;

  await prisma.humanInterviewSession.update({
    where: { id: session.id },
    data: {
      status: "completed",
      completedAt: new Date(),
      evaluationScores: scores as object,
      evaluationNotes: scores.notes ?? null,
      evaluationPass: pass,
      evaluationSubmittedAt: new Date(),
    },
  });

  if (pass) {
    await prisma.jobSeekerProfile.updateMany({
      where: { userId: session.userId },
      data: { verificationStatus: "expert_verified" },
    });
    await prisma.verificationStage.updateMany({
      where: { userId: session.userId, stageName: "human_expert_interview" },
      data: { status: "completed", score: Math.round(total) },
    });
  } else {
    await prisma.verificationStage.updateMany({
      where: { userId: session.userId, stageName: "human_expert_interview" },
      data: { status: "failed", score: Math.round(total) },
    });
  }

  res.json({ ok: true, total: Math.round(total), pass });
});
