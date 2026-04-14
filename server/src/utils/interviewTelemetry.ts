import { createHash } from "crypto";
import pino from "pino";

/**
 * Structured logs for AI interview paths — safe for aggregators (no raw transcripts or answers).
 * Disable with INTERVIEW_TELEMETRY=false
 */
const enabled = () => {
  const v = process.env.INTERVIEW_TELEMETRY?.trim().toLowerCase();
  if (v === "0" || v === "false" || v === "off") return false;
  return true;
};

const logger = pino({
  name: "interview_telemetry",
  level: process.env.LOG_LEVEL?.trim() || "info",
});

export function interviewUserRef(userId: string): string {
  return createHash("sha256").update(userId).digest("hex").slice(0, 12);
}

export type InterviewTelemetryFields = {
  event: string;
  userRef: string;
  interviewId?: string;
  route?: string;
  /** HTTP status when applicable */
  status?: number;
  answerChars?: number;
  whisperLatencyMs?: number;
  turnId?: string;
  audioBytes?: number;
  transcriptEmpty?: boolean;
  ttsChars?: number;
  ttsProvider?: string;
  durationMs?: number;
  errorCode?: string;
  fragmentRetry?: boolean;
  complete?: boolean;
  sprint?: number;
  /** System design LLD/HLD after a turn */
  phase?: string;
  /** TTS filler: requested slot 0..3 when valid query index */
  fillerIndex?: number;
  /** TTS filler served from startup pre-cache */
  fillerPrecached?: boolean;
  /** Deepgram client auth mode returned to browser (never log the token) */
  deepgramAuth?: "bearer" | "token" | "none";
  /** SD status GET: whether an in-progress session payload was returned */
  activeSession?: boolean;
};

export function logInterviewEvent(fields: InterviewTelemetryFields): void {
  if (!enabled()) return;
  const { event, ...rest } = fields;
  logger.info({ event, ...rest });
}
