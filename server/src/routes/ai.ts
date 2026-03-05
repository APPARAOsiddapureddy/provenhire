import express, { Router } from "express";
import multer from "multer";
import { z } from "zod";
import { requireAuth } from "../middleware/auth.js";
import { analyzeResume, evaluateInterview, parseJobDescription, generateLearningResources, parseResumeForProfile, generateJobAssignment } from "../services/ai.service.js";
import { extractTextFromFile } from "../utils/resumeExtract.js";

const memoryUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

function handleMulterError(
  err: unknown,
  _req: express.Request,
  res: express.Response,
  next: express.NextFunction
) {
  if (err) {
    const msg = err instanceof Error ? err.message : "Upload failed";
    if (msg.includes("File too large")) return res.status(400).json({ error: "File too large (max 10MB)" });
    return res.status(400).json({ error: msg });
  }
  next();
}

export const aiRouter = Router();

aiRouter.post("/parse-resume", requireAuth, memoryUpload.single("file"), handleMulterError, async (req: express.Request, res: express.Response) => {
  if (!req.file) return res.status(400).json({ error: "Upload a resume (PDF, DOC, or TXT)" });
  const mt = req.file.mimetype?.toLowerCase() ?? "";
  const ok = mt.includes("pdf") || mt.includes("msword") || mt.includes("wordprocessingml") || mt.includes("text/plain");
  if (!ok) return res.status(400).json({ error: "Resume must be PDF, DOC, DOCX, or TXT" });
  try {
    if (!process.env.GEMINI_API_KEY) {
      return res.status(503).json({
        error: "Resume parsing unavailable. Add GEMINI_API_KEY to server/.env. Get a free key at https://aistudio.google.com/apikey",
      });
    }
    const text = await extractTextFromFile(req.file.buffer, req.file.mimetype);
    if (!text?.trim()) return res.status(400).json({ error: "Could not extract text from file" });
    const parsed = await parseResumeForProfile(text);
    if (!parsed) {
      console.error("[parse-resume] parseResumeForProfile returned null. Check server logs for Gemini errors.");
      return res.status(400).json({ error: "Could not parse resume. Please fill the form manually." });
    }
    return res.json({ parsed });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Resume parsing failed";
    console.error("[parse-resume]", msg);
    return res.status(502).json({ error: msg });
  }
});

aiRouter.post("/analyze-resume", requireAuth, async (req, res) => {
  const schema = z.object({ resumeText: z.string().min(1) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid resume payload" });
  const result = await analyzeResume(parsed.data.resumeText);
  return res.json({ result });
});

aiRouter.post("/parse-job-description", requireAuth, async (req, res) => {
  const schema = z.object({ text: z.string().min(1) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid payload" });
  const result = await parseJobDescription(parsed.data.text);
  return res.json({ result });
});

aiRouter.post("/learning-resources", requireAuth, async (req, res) => {
  const schema = z.object({ profile: z.string().min(1) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid payload" });
  const result = await generateLearningResources(parsed.data.profile);
  return res.json({ result });
});

aiRouter.post("/evaluate-interview", requireAuth, async (req, res) => {
  const schema = z.object({ transcript: z.string().min(1) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid payload" });
  const result = await evaluateInterview(parsed.data.transcript);
  return res.json({ result });
});

aiRouter.post("/generate-assignment", requireAuth, async (req, res) => {
  if (!process.env.GEMINI_API_KEY) {
    return res.status(503).json({
      error: "Assignment generation unavailable. Add GEMINI_API_KEY to server/.env. Get a free key at https://aistudio.google.com/apikey",
    });
  }
  const schema = z.object({
    companyName: z.string().min(1),
    companyContext: z.string().optional(),
    industry: z.string().optional(),
    jobRole: z.string().min(1),
    jobDescription: z.string().optional(),
    roleCategory: z.string().optional(),
    experienceYears: z.number().min(0).optional(),
    additionalContext: z.string().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid payload. Provide companyName and jobRole." });
  try {
    const assignment = await generateJobAssignment(parsed.data);
    return res.json({ assignment });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to generate assignment";
    console.error("[generate-assignment]", msg);
    return res.status(502).json({ error: msg });
  }
});
