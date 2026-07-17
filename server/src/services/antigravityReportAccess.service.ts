import crypto from "node:crypto";

export function createAntigravityReportAccessToken(
  sessionId: string,
  audience: "admin" | "candidate",
  ttlSeconds = 15 * 60,
) {
  const secret = (
    process.env.ANTIGRAVITY_REPORT_ACCESS_SECRET ||
    process.env.ANTIGRAVITY_WEBHOOK_SECRET ||
    ""
  ).trim();
  if (!secret || !sessionId) return "";
  const payload = Buffer.from(
    JSON.stringify({ session_id: sessionId, audience, exp: Math.floor(Date.now() / 1000) + ttlSeconds }),
  ).toString("base64url");
  const signature = crypto.createHmac("sha256", secret).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}
