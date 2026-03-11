/**
 * Proctor service: calls Python AI vision service, saves screenshots, records violations.
 */
import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";

const AI_PROCTOR_URL = process.env.AI_PROCTOR_URL || "http://127.0.0.1:8001";

export interface VisionAnalysis {
  face_detected: boolean;
  person_count: number;
  phone_detected: boolean;
  looking_direction: string;
  mouth_open: boolean;
  spoof_detected: boolean;
  confidence: number;
}

export type ProctorViolationType =
  | "PHONE_DETECTED"
  | "LOOKING_AWAY"
  | "MULTIPLE_PERSONS"
  | "FACE_MISSING"
  | "MOUTH_OPEN"
  | "SPOOF_DETECTED";

const LOOKING_AWAY_DIRECTIONS = ["LEFT", "RIGHT", "UP", "AWAY"];

function stripBase64Prefix(s: string): string {
  return s.replace(/^data:image\/\w+;base64,/, "");
}

/** Base64 frame -> AI analysis. */
export async function analyzeFrame(base64Frame: string): Promise<VisionAnalysis | null> {
  const b64 = stripBase64Prefix(base64Frame);
  try {
    const res = await fetch(`${AI_PROCTOR_URL}/vision/analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ frame: b64 }),
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) throw new Error(`AI proctor: ${res.status}`);
    const data = (await res.json()) as VisionAnalysis;
    return data;
  } catch (err) {
    console.error("Proctor AI service error:", err);
    return null;
  }
}

/** Save screenshot to filesystem, return relative path. */
export function saveScreenshot(
  sessionId: string,
  eventType: string,
  base64Frame: string
): string {
  const root = process.env.PROCTOR_SCREENSHOTS_DIR || path.join(process.cwd(), "..", "proctoring", "screenshots");
  const sessionDir = path.join(root, `session_${sessionId}`);
  if (!fs.existsSync(sessionDir)) {
    fs.mkdirSync(sessionDir, { recursive: true });
  }

  const ext = ".jpg";
  const prefix = eventType.toLowerCase().replace(/_/g, "_");
  const files = fs.readdirSync(sessionDir).filter((f) => f.startsWith(prefix));
  const idx = files.length + 1;
  const filename = `${eventType.toLowerCase()}_${idx}${ext}`;
  const fullPath = path.join(sessionDir, filename);

  const b64 = stripBase64Prefix(base64Frame);
  const buf = Buffer.from(b64, "base64");
  fs.writeFileSync(fullPath, buf);

  return path.join("/proctoring", "screenshots", `session_${sessionId}`, filename);
}

/** Decode base64 image and optionally resize (client should send 320x240). */
export function base64ToBuffer(b64: string): Buffer {
  return Buffer.from(b64, "base64");
}
