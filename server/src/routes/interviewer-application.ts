import { Router } from "express";
import { z } from "zod";
import { prisma } from "../config/prisma.js";
import { getTrackForRole } from "../data/interviewerRoles.js";
import { sendInterviewerApplicationSubmittedEmail } from "../services/resend.js";

const applySchema = z.object({
  name: z.string().min(1).max(200),
  email: z.string().email(),
  experienceYears: z.number().int().min(5).max(50),
  primaryRole: z.string().min(1).max(100),
  phone: z.string().min(1).max(20),
  linkedIn: z.string().url(),
  currentCompany: z.string().min(1).max(200),
  jobTitle: z.string().min(1).max(200),
  whyJoin: z.string().min(100).max(2000),
});

export const interviewerApplicationRouter = Router();

/** Public: Submit interviewer application */
interviewerApplicationRouter.post("/", async (req, res) => {
  const parse = applySchema.safeParse(req.body);
  if (!parse.success) {
    return res.status(400).json({ error: parse.error.flatten().fieldErrors });
  }
  const data = parse.data;
  const track = getTrackForRole(data.primaryRole);

  const existing = await prisma.interviewerApplication.findFirst({
    where: { email: data.email, status: "pending" },
  });
  if (existing) {
    return res.status(400).json({ error: "You already have a pending application for this email." });
  }

  const app = await prisma.interviewerApplication.create({
    data: {
      name: data.name,
      email: data.email,
      experienceYears: data.experienceYears,
      track,
      domains: [data.primaryRole],
      phone: data.phone.trim(),
      linkedIn: data.linkedIn.trim(),
      whyJoin: data.whyJoin.trim(),
      currentCompany: data.currentCompany.trim(),
      jobTitle: data.jobTitle.trim(),
    },
  });
  void sendInterviewerApplicationSubmittedEmail({
    to: app.email,
    name: app.name,
    eventKey: `interviewer-application-submitted:${app.id}`,
  }).catch((err) => {
    console.warn("[interviewer-application] confirmation email failed:", err instanceof Error ? err.message : err);
  });
  res.status(201).json({ id: app.id, message: "Application submitted successfully." });
});
