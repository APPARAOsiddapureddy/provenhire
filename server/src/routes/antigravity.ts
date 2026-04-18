import { Router } from "express";
import { z } from "zod";
import { requireAuth, requireJobSeeker, type AuthedRequest } from "../middleware/auth.js";

export const antigravityRouter = Router();

function normalizeApiBaseUrl(value: string | undefined): string {
  const trimmed = (value ?? "").trim().replace(/\/+$/, "");
  if (!trimmed) return "";
  return trimmed.endsWith("/api") ? trimmed : `${trimmed}/api`;
}

function antigravityApiBaseUrl(): string {
  return normalizeApiBaseUrl(process.env.ANTIGRAVITY_API_BASE_URL);
}

function antigravityConfigured(): boolean {
  return antigravityApiBaseUrl().length > 0;
}

function antigravityUnavailableMessage() {
  return {
    error:
      "Antigravity integration is not configured. Set ANTIGRAVITY_API_BASE_URL on the ProvenHire API server.",
  };
}

async function forwardJson(path: string, init: RequestInit = {}) {
  const baseUrl = antigravityApiBaseUrl();
  if (!baseUrl) {
    return { status: 503, body: antigravityUnavailableMessage() };
  }

  try {
    const response = await fetch(`${baseUrl}${path}`, init);
    const text = await response.text();
    let body: unknown = {};
    if (text) {
      try {
        body = JSON.parse(text);
      } catch {
        body = { raw: text };
      }
    }
    return { status: response.status, body };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to reach Antigravity service";
    return {
      status: 502,
      body: {
        error: "Unable to reach Antigravity service.",
        detail: message,
      },
    };
  }
}

antigravityRouter.use(requireAuth, requireJobSeeker);

antigravityRouter.get("/config", (_req, res) => {
  res.json({
    configured: antigravityConfigured(),
    apiBaseConfigured: antigravityConfigured(),
  });
});

antigravityRouter.post("/start", async (req: AuthedRequest, res) => {
  void req.user;
  const schema = z.object({
    resume: z.string().trim().min(1),
    githubLinks: z.array(z.string().trim().url()).optional().default([]),
    targetRole: z.string().trim().min(1),
    yearsExperience: z.string().trim().min(1),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid Antigravity start payload." });
  }

  const response = await forwardJson("/start_interview", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      resume: parsed.data.resume,
      github_links: parsed.data.githubLinks,
      target_role: parsed.data.targetRole,
      years_experience: parsed.data.yearsExperience,
    }),
  });
  return res.status(response.status).json(response.body);
});

antigravityRouter.post("/turn", async (req, res) => {
  const schema = z.object({
    sessionId: z.string().trim().min(1),
    transcript: z.string().trim().min(1),
    entities: z.array(z.string().trim()).optional().default([]),
    turnId: z.string().trim().optional().default(""),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid Antigravity turn payload." });
  }

  const response = await forwardJson("/process_turn", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      session_id: parsed.data.sessionId,
      transcript: parsed.data.transcript,
      entities: parsed.data.entities,
      turn_id: parsed.data.turnId,
    }),
  });
  return res.status(response.status).json(response.body);
});

antigravityRouter.post("/end/:sessionId", async (req, res) => {
  const sessionId = req.params.sessionId?.trim();
  if (!sessionId) return res.status(400).json({ error: "Session id is required." });

  const response = await forwardJson(`/end_interview/${encodeURIComponent(sessionId)}`, {
    method: "POST",
  });
  return res.status(response.status).json(response.body);
});

antigravityRouter.get("/state/:sessionId", async (req, res) => {
  const sessionId = req.params.sessionId?.trim();
  if (!sessionId) return res.status(400).json({ error: "Session id is required." });

  const response = await forwardJson(`/state/${encodeURIComponent(sessionId)}`);
  return res.status(response.status).json(response.body);
});

antigravityRouter.get("/report/:sessionId", async (req, res) => {
  const sessionId = req.params.sessionId?.trim();
  if (!sessionId) return res.status(400).json({ error: "Session id is required." });

  const response = await forwardJson(`/report/${encodeURIComponent(sessionId)}`);
  return res.status(response.status).json(response.body);
});

// ─── Voice / audio routes ────────────────────────────────────────────────────

antigravityRouter.get("/deepgram-token", async (_req, res) => {
  const response = await forwardJson("/deepgram_token");
  return res.status(response.status).json(response.body);
});

antigravityRouter.post("/partial", async (req, res) => {
  const baseUrl = antigravityApiBaseUrl();
  if (!baseUrl) return res.status(200).json({ ok: true }); // fire-and-forget: silent no-op if unconfigured

  const schema = z.object({
    sessionId: z.string().trim().min(1),
    transcript: z.string().trim(),
    entities: z.array(z.string().trim()).optional().default([]),
    turnId: z.string().trim().optional().default(""),
    isFinal: z.boolean().optional().default(false),
    snapshotSeq: z.number().int().optional().default(0),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(200).json({ ok: true });

  fetch(`${baseUrl}/partial_transcript`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      session_id: parsed.data.sessionId,
      transcript: parsed.data.transcript,
      entities: parsed.data.entities,
      turn_id: parsed.data.turnId,
      is_final: parsed.data.isFinal,
      snapshot_seq: parsed.data.snapshotSeq,
    }),
  }).catch(() => {});

  return res.status(200).json({ ok: true });
});

antigravityRouter.post("/telemetry", async (req, res) => {
  const baseUrl = antigravityApiBaseUrl();
  if (!baseUrl) return res.status(200).json({ ok: true });

  fetch(`${baseUrl}/telemetry`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req.body),
  }).catch(() => {});

  return res.status(200).json({ ok: true });
});

async function forwardBinary(path: string, init: RequestInit = {}): Promise<{
  status: number;
  buffer: Buffer | null;
  contentType: string;
  extraHeaders: Record<string, string>;
}> {
  const baseUrl = antigravityApiBaseUrl();
  if (!baseUrl) return { status: 503, buffer: null, contentType: "application/json", extraHeaders: {} };

  try {
    const response = await fetch(`${baseUrl}${path}`, init);
    if (!response.ok) return { status: response.status, buffer: null, contentType: "application/json", extraHeaders: {} };

    const extraHeaders: Record<string, string> = {};
    for (const key of ["X-Filler-Text", "X-TTS-Provider", "X-TTS-Source"]) {
      const val = response.headers.get(key);
      if (val) extraHeaders[key] = val;
    }

    const arrayBuf = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuf);
    const contentType = response.headers.get("Content-Type") ?? "audio/mpeg";
    return { status: response.status, buffer, contentType, extraHeaders };
  } catch {
    return { status: 502, buffer: null, contentType: "application/json", extraHeaders: {} };
  }
}

antigravityRouter.post("/tts", async (req, res) => {
  const schema = z.object({
    text: z.string().trim().min(1),
    sessionId: z.string().trim().optional().default(""),
    useFiller: z.boolean().optional().default(true),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid TTS payload." });

  const { status, buffer, contentType, extraHeaders } = await forwardBinary("/tts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      text: parsed.data.text,
      session_id: parsed.data.sessionId,
      use_filler: parsed.data.useFiller,
    }),
  });

  if (!buffer) return res.status(status).json({ error: "TTS service unavailable." });

  for (const [k, v] of Object.entries(extraHeaders)) res.setHeader(k, v);
  res.setHeader("Content-Type", contentType);
  res.setHeader("Content-Length", buffer.length);
  return res.status(status).send(buffer);
});

antigravityRouter.get("/tts-filler", async (_req, res) => {
  const { status, buffer, contentType, extraHeaders } = await forwardBinary("/tts_filler");

  if (!buffer) return res.status(status).json({ error: "TTS filler service unavailable." });

  for (const [k, v] of Object.entries(extraHeaders)) res.setHeader(k, v);
  res.setHeader("Content-Type", contentType);
  res.setHeader("Content-Length", buffer.length);
  return res.status(status).send(buffer);
});
