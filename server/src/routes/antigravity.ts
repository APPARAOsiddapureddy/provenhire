import { Router } from "express";
import { Readable } from "stream";
import { z } from "zod";
import { requireAuth, requireJobSeeker, type AuthedRequest } from "../middleware/auth.js";
import {
  antigravityUnavailableMessage,
  getAntigravityApiBaseUrl,
  isAntigravityConfigured,
} from "../config/antigravity.js";

export const antigravityRouter = Router();

const PROXY_JSON_TIMEOUT_MS = 30_000;
const PROXY_TURN_TIMEOUT_MS = 45_000;
const PROXY_SHORT_TIMEOUT_MS = 10_000;
const PROXY_TTS_TIMEOUT_MS = 20_000;
const PROXY_FILLER_TIMEOUT_MS = 10_000;

function getConfiguredApiBaseUrl(): string | null {
  try {
    return getAntigravityApiBaseUrl();
  } catch {
    return null;
  }
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError");
}

async function forwardJson(path: string, init: RequestInit = {}, timeoutMs = PROXY_JSON_TIMEOUT_MS) {
  const baseUrl = getConfiguredApiBaseUrl();
  if (!baseUrl) {
    return { status: 503, body: antigravityUnavailableMessage() };
  }

  try {
    const response = await fetch(`${baseUrl}${path}`, {
      ...init,
      signal: init.signal ?? AbortSignal.timeout(timeoutMs),
    });
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
    if (isAbortError(error)) {
      return {
        status: 504,
        body: {
          error: "Antigravity request timed out.",
          timeout_ms: timeoutMs,
        },
      };
    }
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
    configured: isAntigravityConfigured(),
    apiBaseConfigured: isAntigravityConfigured(),
  });
});

antigravityRouter.post("/start", async (req: AuthedRequest, res) => {
  void req.user;
  return res.status(410).json({
    error: "Direct Antigravity start is disabled.",
    detail:
      "Use /api/ai-interview-adapter/prepare or /api/ai-interview-adapter/handoff-launch so ProvenHire can enforce retake gating, persistence, and prior assessment context.",
  });
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
  }, PROXY_TURN_TIMEOUT_MS);
  return res.status(response.status).json(response.body);
});

antigravityRouter.post("/end/:sessionId", async (req, res) => {
  const sessionId = req.params.sessionId?.trim();
  if (!sessionId) return res.status(400).json({ error: "Session id is required." });

  const response = await forwardJson(`/end_interview/${encodeURIComponent(sessionId)}`, {
    method: "POST",
  }, PROXY_JSON_TIMEOUT_MS);
  return res.status(response.status).json(response.body);
});

antigravityRouter.get("/state/:sessionId", async (req, res) => {
  const sessionId = req.params.sessionId?.trim();
  if (!sessionId) return res.status(400).json({ error: "Session id is required." });

  const response = await forwardJson(`/state/${encodeURIComponent(sessionId)}`, {}, PROXY_SHORT_TIMEOUT_MS);
  return res.status(response.status).json(response.body);
});

antigravityRouter.get("/report/:sessionId", async (req, res) => {
  const sessionId = req.params.sessionId?.trim();
  if (!sessionId) return res.status(400).json({ error: "Session id is required." });

  const response = await forwardJson(`/report/${encodeURIComponent(sessionId)}`, {}, PROXY_SHORT_TIMEOUT_MS);
  return res.status(response.status).json(response.body);
});

// ─── Voice / audio routes ────────────────────────────────────────────────────

antigravityRouter.get("/deepgram-token", async (_req, res) => {
  const response = await forwardJson("/deepgram_token", {}, PROXY_SHORT_TIMEOUT_MS);
  return res.status(response.status).json(response.body);
});

antigravityRouter.post("/partial", async (req, res) => {
  const baseUrl = getConfiguredApiBaseUrl();
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
    signal: AbortSignal.timeout(PROXY_SHORT_TIMEOUT_MS),
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
  const baseUrl = getConfiguredApiBaseUrl();
  if (!baseUrl) return res.status(200).json({ ok: true });

  fetch(`${baseUrl}/telemetry`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal: AbortSignal.timeout(PROXY_SHORT_TIMEOUT_MS),
    body: JSON.stringify(req.body),
  }).catch(() => {});

  return res.status(200).json({ ok: true });
});

async function forwardBinary(path: string, init: RequestInit = {}, timeoutMs = PROXY_TTS_TIMEOUT_MS): Promise<{
  status: number;
  body: Readable | null;
  contentType: string;
  extraHeaders: Record<string, string>;
}> {
  const baseUrl = getConfiguredApiBaseUrl();
  if (!baseUrl) return { status: 503, body: null, contentType: "application/json", extraHeaders: {} };

  try {
    const response = await fetch(`${baseUrl}${path}`, {
      ...init,
      signal: init.signal ?? AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok || !response.body) {
      return { status: response.status, body: null, contentType: "application/json", extraHeaders: {} };
    }

    const extraHeaders: Record<string, string> = {};
    for (const key of ["X-Filler-Text", "X-TTS-Provider", "X-TTS-Source"]) {
      const val = response.headers.get(key);
      if (val) extraHeaders[key] = val;
    }

    const contentType = response.headers.get("Content-Type") ?? "audio/mpeg";
    return {
      status: response.status,
      body: Readable.fromWeb(response.body as unknown as Parameters<typeof Readable.fromWeb>[0]),
      contentType,
      extraHeaders,
    };
  } catch (error) {
    return {
      status: isAbortError(error) ? 504 : 502,
      body: null,
      contentType: "application/json",
      extraHeaders: {},
    };
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

  const { status, body, contentType, extraHeaders } = await forwardBinary("/tts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      text: parsed.data.text,
      session_id: parsed.data.sessionId,
      use_filler: parsed.data.useFiller,
    }),
  }, PROXY_TTS_TIMEOUT_MS);

  if (!body) return res.status(status).json({ error: "TTS service unavailable." });

  for (const [k, v] of Object.entries(extraHeaders)) res.setHeader(k, v);
  res.setHeader("Content-Type", contentType);
  res.status(status);
  body.on("error", () => {
    if (!res.headersSent) res.status(502).end();
    else res.destroy();
  });
  return body.pipe(res);
});

antigravityRouter.get("/tts-filler", async (_req, res) => {
  const { status, body, contentType, extraHeaders } = await forwardBinary("/tts_filler", {}, PROXY_FILLER_TIMEOUT_MS);

  if (!body) return res.status(status).json({ error: "TTS filler service unavailable." });

  for (const [k, v] of Object.entries(extraHeaders)) res.setHeader(k, v);
  res.setHeader("Content-Type", contentType);
  res.status(status);
  body.on("error", () => {
    if (!res.headersSent) res.status(502).end();
    else res.destroy();
  });
  return body.pipe(res);
});
