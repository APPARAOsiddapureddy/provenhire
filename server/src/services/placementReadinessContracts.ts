import crypto from "node:crypto";

const CALLBACK_MAX_AGE_SECONDS = 300;

function timingSafeText(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export function signPlacementCallback(body: string, timestamp: string, secret: string) {
  return crypto.createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
}

export function verifyPlacementCallback(input: {
  body: string;
  timestamp: string;
  signature: string;
  secret: string;
  nowMs?: number;
}) {
  const unixSeconds = Number(input.timestamp);
  const nowSeconds = (input.nowMs ?? Date.now()) / 1000;
  if (!Number.isFinite(unixSeconds) || Math.abs(nowSeconds - unixSeconds) > CALLBACK_MAX_AGE_SECONDS) {
    return { ok: false as const, reason: "stale_timestamp" as const };
  }
  const expected = signPlacementCallback(input.body, input.timestamp, input.secret);
  if (!input.signature || !timingSafeText(input.signature, expected)) {
    return { ok: false as const, reason: "invalid_signature" as const };
  }
  return { ok: true as const };
}

export function canReadPlacementArtifact(input: {
  requesterId: string;
  requesterRole: string;
  candidateId: string;
  workspaceOwnerUserId: string;
}) {
  return input.requesterId === input.candidateId
    || input.requesterRole === "admin"
    || (input.requesterRole === "recruiter" && input.requesterId === input.workspaceOwnerUserId);
}
