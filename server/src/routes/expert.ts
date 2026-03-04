import { Router } from "express";
import { z } from "zod";
import { requireExpertInterviewer, AuthedRequest } from "../middleware/auth.js";
import { prisma } from "../config/prisma.js";
// Daily.co disabled for MVP - using Google Meet. Uncomment when budget allows.
// import { createDailyRoom, createMeetingToken, getRoomNameFromUrl } from "../services/daily.js";

export const expertRouter = Router();
expertRouter.use(requireExpertInterviewer);

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

/** Past sessions */
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
