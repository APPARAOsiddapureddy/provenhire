import crypto from "crypto";

const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;

function getKey(): Buffer {
  const raw = process.env.BANK_DETAILS_ENCRYPTION_KEY?.trim();
  if (raw && raw.length >= 64) {
    return Buffer.from(raw, "hex");
  }
  if (raw && raw.length >= 32) {
    try {
      const b = Buffer.from(raw, "base64");
      if (b.length === 32) return b;
    } catch {
      /* fall through */
    }
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error("BANK_DETAILS_ENCRYPTION_KEY must be set in production (32-byte hex or base64).");
  }
  return crypto.createHash("sha256").update(process.env.JWT_SECRET || "dev-bank-key").digest();
}

/** AES-256-GCM; stored as base64(iv || authTag || ciphertext). */
export function encryptSensitiveField(plainText: string): string {
  const key = getKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv, { authTagLength: AUTH_TAG_LENGTH });
  const enc = Buffer.concat([cipher.update(plainText, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString("base64");
}

export function decryptSensitiveField(stored: string): string {
  const key = getKey();
  const buf = Buffer.from(stored, "base64");
  if (buf.length < IV_LENGTH + AUTH_TAG_LENGTH + 1) {
    throw new Error("Invalid ciphertext");
  }
  const iv = buf.subarray(0, IV_LENGTH);
  const tag = buf.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const data = buf.subarray(IV_LENGTH + AUTH_TAG_LENGTH);
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv, { authTagLength: AUTH_TAG_LENGTH });
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
}
