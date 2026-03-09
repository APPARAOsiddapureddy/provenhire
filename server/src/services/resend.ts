/**
 * Email service: Resend API (primary) or Gmail SMTP (fallback).
 * Configure one of:
 * - RESEND_API_KEY (resend.com) — recommended for production
 * - GMAIL_USER + GMAIL_APP_PASSWORD — Gmail SMTP, works without domain verification
 */
import { Resend } from "resend";
import nodemailer from "nodemailer";

const BATCH_SIZE = 2;
const BATCH_DELAY_MS = 600;

const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null;

const FROM_EMAIL = process.env.EMAIL_FROM || "ProvenHire <onboarding@resend.dev>";

/** Gmail SMTP transporter (when GMAIL_USER + GMAIL_APP_PASSWORD are set) */
let gmailTransporter: nodemailer.Transporter | null = null;
try {
  if (process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD) {
    gmailTransporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_APP_PASSWORD.replace(/\s/g, ""),
      },
    });
  }
} catch (e) {
  console.warn("[Email] Gmail transporter init failed:", e instanceof Error ? e.message : e);
}

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

const OTP_EMAIL_SUBJECT = "Verify your email for ProvenHire";
const OTP_EMAIL_HTML = (code: string, recipientEmail: string) => `
  <p>Hello,</p>
  <p>You requested to sign up for ProvenHire with this email. Your verification code is:</p>
  <p style="font-size:24px;font-weight:bold;letter-spacing:6px">${code}</p>
  <p>Enter this 6-digit code on the signup page to verify your email (${recipientEmail}).</p>
  <p>This code will expire in 5 minutes.</p>
  <p>If you didn't request this, you can ignore this email.</p>
  <p>— The ProvenHire Team</p>
`;

/** Send signup OTP verification email. Tries Resend first, then Gmail SMTP. Returns true if sent. Never throws. */
export async function sendSignupVerificationCodeEmail(to: string, code: string): Promise<boolean> {
  try {
    // 1. Try Resend
    if (resend) {
      try {
        const { error } = await resend.emails.send({
          from: FROM_EMAIL,
          to,
          subject: OTP_EMAIL_SUBJECT,
          html: OTP_EMAIL_HTML(code, to),
        });
        if (!error) return true;
        console.warn("[Email] Resend failed:", error?.message ?? error);
      } catch (e) {
        console.warn("[Email] Resend threw:", e instanceof Error ? e.message : e);
      }
    }

    // 2. Fallback to Gmail SMTP
    if (gmailTransporter && process.env.GMAIL_USER) {
      try {
        await gmailTransporter.sendMail({
          from: `ProvenHire <${process.env.GMAIL_USER}>`,
          to,
          subject: OTP_EMAIL_SUBJECT,
          html: OTP_EMAIL_HTML(code, to),
        });
        return true;
      } catch (err) {
        console.error("[Email] Gmail failed:", err instanceof Error ? err.message : err);
        return false;
      }
    }

    if (!resend) {
      console.warn("[Email] No provider. Set RESEND_API_KEY or GMAIL_USER+GMAIL_APP_PASSWORD");
    }
  } catch (e) {
    console.error("[Email] Unexpected error:", e);
  }
  return false;
}

