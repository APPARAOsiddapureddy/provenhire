/**
 * Resend email service. Sends in batches of 2 with 600ms delay (Resend: 2 req/sec).
 * Set RESEND_API_KEY in server/.env. Without it, email sending is skipped.
 */
import { Resend } from "resend";

const BATCH_SIZE = 2;
const BATCH_DELAY_MS = 600;

const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null;

const FROM_EMAIL = process.env.EMAIL_FROM || "ProvenHire <onboarding@resend.dev>";

export interface EmailRecipient {
  email: string;
  name?: string | null;
}

export async function sendBroadcastEmails(
  recipients: EmailRecipient[],
  subject: string,
  htmlBody: string
): Promise<{ sent: number; failed: number; skipped: boolean }> {
  if (!resend) {
    return { sent: 0, failed: 0, skipped: true };
  }
  let sent = 0;
  let failed = 0;

  for (let i = 0; i < recipients.length; i += BATCH_SIZE) {
    const batch = recipients.slice(i, i + BATCH_SIZE);
    const results = await Promise.all(
      batch.map(async (r) => {
        const html = htmlBody.replace(/\{\{name\}\}/g, r.name || "User");
        const { error } = await resend.emails.send({
          from: FROM_EMAIL,
          to: r.email,
          subject,
          html,
        });
        return error ? false : true;
      })
    );
    sent += results.filter(Boolean).length;
    failed += results.filter((x) => !x).length;

    if (i + BATCH_SIZE < recipients.length) {
      await new Promise((r) => setTimeout(r, BATCH_DELAY_MS));
    }
  }
  return { sent, failed, skipped: false };
}

/** Send password reset email. Returns true if sent (or skipped when no Resend). */
export async function sendPasswordResetEmail(to: string, resetLink: string): Promise<boolean> {
  if (!resend) return false;
  const { error } = await resend.emails.send({
    from: FROM_EMAIL,
    to,
    subject: "Reset your ProvenHire password",
    html: `
      <p>You requested a password reset. Click the link below to set a new password:</p>
      <p><a href="${resetLink}" style="color:#D4AF37;font-weight:bold">Reset Password</a></p>
      <p>This link expires in 1 hour. If you didn't request this, ignore this email.</p>
    `,
  });
  return !error;
}

/** Send interviewer acceptance email with set-password link. Returns true if sent. */
export async function sendInterviewerAcceptanceEmail(
  to: string,
  name: string,
  setPasswordLink: string
): Promise<boolean> {
  if (!resend) return false;
  const displayName = name?.trim() || "Interviewer";
  const { error } = await resend.emails.send({
    from: FROM_EMAIL,
    to,
    subject: "Welcome to ProvenHire — Set Your Password",
    html: `
      <p>Hi ${displayName},</p>
      <p>Your application to join ProvenHire as an Expert Interviewer has been approved!</p>
      <p>Click the link below to set your password and access your interviewer dashboard:</p>
      <p><a href="${setPasswordLink}" style="color:#D4AF37;font-weight:bold">Set Password &amp; Get Started</a></p>
      <p>This link expires in 7 days. If you have any questions, reply to this email.</p>
      <p>— The ProvenHire Team</p>
    `,
  });
  return !error;
}

