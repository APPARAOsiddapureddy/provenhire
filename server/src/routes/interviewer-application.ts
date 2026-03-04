import { Router } from "express";
import { z } from "zod";
import { prisma } from "../config/prisma.js";

const applySchema = z.object({
  name: z.string().min(1).max(200),
  email: z.string().email(),
  experienceYears: z.number().int().min(0).max(50).optional(),
  track: z.enum(["technical", "non_technical"]).default("technical"),
  domains: z.array(z.string()).optional(),
  linkedIn: z.union([z.string().url(), z.literal("")]).optional(),
  whyJoin: z.string().max(2000).optional(),
});

export const interviewerApplicationRouter = Router();

/** Public: Submit interviewer application */
interviewerApplicationRouter.post("/", async (req, res) => {
  const parse = applySchema.safeParse(req.body);
  if (!parse.success) {
    return res.status(400).json({ error: parse.error.flatten().fieldErrors });
  }
  const data = parse.data;

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
      track: data.track,
      domains: data.domains ?? [],
      linkedIn: data.linkedIn || null,
      whyJoin: data.whyJoin || null,
    },
  });
  res.status(201).json({ id: app.id, message: "Application submitted successfully." });
});
