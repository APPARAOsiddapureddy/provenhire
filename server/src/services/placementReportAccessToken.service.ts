import crypto from "node:crypto";

// Mirrors the verification in the Placement Readiness backend
// (server/src/services/reportAccessToken.ts in provenhire-placement-readiness):
// same shared secret, same payload key order, same HMAC-SHA256 scheme. Both
// sides must stay in sync if this shape ever changes.
export function createPlacementReportAccessToken(
  candidateId: string,
  attemptId: string,
  ttlSeconds = 30 * 60,
) {
  const secret = (process.env.PLACEMENT_HANDOFF_SHARED_SECRET || "").trim();
  if (!secret || !candidateId || !attemptId) return "";
  const payload = Buffer.from(
    JSON.stringify({ candidateId, attemptId, exp: Math.floor(Date.now() / 1000) + ttlSeconds }),
  ).toString("base64url");
  const signature = crypto.createHmac("sha256", secret).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}
