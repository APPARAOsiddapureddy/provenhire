export const EMAIL_VERIFICATION_STORAGE_KEY = "ph_pending_email_verification";

export type PendingEmailVerification = {
  email: string;
  role?: string | null;
  expiresAt?: string;
  message?: string;
};

export function savePendingEmailVerification(pending: PendingEmailVerification): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(EMAIL_VERIFICATION_STORAGE_KEY, JSON.stringify(pending));
  } catch {
    // Session storage is a convenience only; the email query param is still enough to continue.
  }
}

export function getPendingEmailVerification(): PendingEmailVerification | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(EMAIL_VERIFICATION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PendingEmailVerification;
    return parsed?.email ? parsed : null;
  } catch {
    return null;
  }
}

export function clearPendingEmailVerification(): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(EMAIL_VERIFICATION_STORAGE_KEY);
  } catch {}
}
