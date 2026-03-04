import jwt from "jsonwebtoken";
import crypto from "crypto";

export interface JwtPayload {
  userId: string;
  role: string;
}

/** Access token: short-lived, for API auth. Signed, not encrypted. */
export function signJwt(payload: JwtPayload) {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET is not configured");
  return jwt.sign(payload, secret, { expiresIn: "15m" });
}

export function verifyJwt(token: string): JwtPayload {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET is not configured");
  return jwt.verify(token, secret) as JwtPayload;
}

/** Hash for storing refresh tokens in DB (never store plain token). */
export function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

/** Generate a cryptographically secure refresh token. */
export function generateRefreshToken(): string {
  return crypto.randomBytes(32).toString("hex");
}
