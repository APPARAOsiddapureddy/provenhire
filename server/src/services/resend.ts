/**
 * Email service: Resend API primary, Gmail SMTP fallback.
 *
 * Transactional account emails must never expose OTPs or debug-only links outside
 * the actual email body intended for the recipient.
 */
import { Prisma } from "@prisma/client";
import { Resend } from "resend";
import nodemailer from "nodemailer";
import { prisma } from "../config/prisma.js";

const BATCH_SIZE = 2;
const BATCH_DELAY_MS = 600;
const PENDING_RETRY_MS = 10 * 60 * 1000;
const EMAIL_DELIVERY_TIMEOUT_MS = Math.max(3000, Number(process.env.EMAIL_DELIVERY_TIMEOUT_MS || 10000));

const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null;

const FROM_EMAIL = process.env.EMAIL_FROM || "ProvenHire <onboarding@resend.dev>";

let gmailTransporter: nodemailer.Transporter | null = null;
try {
  if (process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD) {
    gmailTransporter = nodemailer.createTransport({
      service: "gmail",
      connectionTimeout: EMAIL_DELIVERY_TIMEOUT_MS,
      greetingTimeout: EMAIL_DELIVERY_TIMEOUT_MS,
      socketTimeout: EMAIL_DELIVERY_TIMEOUT_MS,
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

export type TransactionalEmailOnceResult = {
  sent: boolean;
  skipped: boolean;
  failed: boolean;
};

export function escapeHtml(value: string | null | undefined): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function hasEmailProvider(): boolean {
  return !!resend || !!gmailTransporter;
}

function baseUrl(): string {
  return process.env.BASE_URL || "https://provenhire.in";
}

function appLink(path: string): string {
  const root = baseUrl().replace(/\/+$/, "");
  const cleanPath = path.startsWith("/") ? path : `/${path}`;
  return `${root}${cleanPath}`;
}

async function withTimeout<T>(label: string, promise: Promise<T>): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | null = null;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timeout = setTimeout(() => {
          reject(new Error(`${label} timed out after ${EMAIL_DELIVERY_TIMEOUT_MS}ms`));
        }, EMAIL_DELIVERY_TIMEOUT_MS);
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

function paragraph(text: string): string {
  return `<p style="margin:0 0 14px;color:#334155;line-height:1.6">${escapeHtml(text)}</p>`;
}

function button(label: string, href: string): string {
  return `
    <p style="margin:22px 0">
      <a href="${escapeHtml(href)}" style="display:inline-block;background:#D4AF37;color:#0B1C2D;text-decoration:none;font-weight:700;padding:12px 18px;border-radius:6px">
        ${escapeHtml(label)}
      </a>
    </p>
  `;
}

function emailLayout(title: string, body: string): string {
  return `
    <div style="font-family:Inter,Arial,sans-serif;max-width:640px;margin:0 auto;padding:24px;background:#ffffff">
      <div style="border-bottom:1px solid #e2e8f0;padding-bottom:14px;margin-bottom:22px">
        <div style="font-weight:800;letter-spacing:.08em;color:#0B1C2D">PROVEN<span style="color:#D4AF37">HIRE</span></div>
      </div>
      <h1 style="font-size:22px;line-height:1.3;margin:0 0 16px;color:#0B1C2D">${escapeHtml(title)}</h1>
      ${body}
      <p style="margin:28px 0 0;color:#64748b;font-size:13px;line-height:1.6">The ProvenHire Team</p>
    </div>
  `;
}

function withName(name: string | null | undefined, fallback = "there"): string {
  const trimmed = name?.trim();
  return trimmed || fallback;
}

function formatDateTime(value: Date | string | null | undefined): string {
  if (!value) return "To be announced";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "To be announced";
  return date.toLocaleString("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Kolkata",
  });
}

async function sendEmailRaw(to: string, subject: string, html: string): Promise<boolean> {
  if (!hasEmailProvider()) {
    console.warn("[Email] No provider configured. Set RESEND_API_KEY or GMAIL_USER+GMAIL_APP_PASSWORD.");
    return false;
  }

  if (resend) {
    try {
      const { error } = await withTimeout(
        "Resend email delivery",
        resend.emails.send({
          from: FROM_EMAIL,
          to,
          subject,
          html,
        }),
      );
      if (!error) return true;
      console.warn("[Email] Resend failed:", error?.message ?? error);
    } catch (e) {
      console.warn("[Email] Resend threw:", e instanceof Error ? e.message : e);
    }
  }

  if (gmailTransporter && process.env.GMAIL_USER) {
    try {
      await withTimeout(
        "Gmail email delivery",
        gmailTransporter.sendMail({
          from: `ProvenHire <${process.env.GMAIL_USER}>`,
          to,
          subject,
          html,
        }),
      );
      return true;
    } catch (err) {
      console.error("[Email] Gmail failed:", err instanceof Error ? err.message : err);
    }
  }

  return false;
}

export async function sendTransactionalEmailOnce(params: {
  eventKey: string;
  eventType: string;
  to: string;
  subject: string;
  html: string;
  metadata?: Prisma.InputJsonValue;
}): Promise<TransactionalEmailOnceResult> {
  const recipient = params.to.trim().toLowerCase();
  if (!recipient || !hasEmailProvider()) {
    return { sent: false, skipped: true, failed: false };
  }

  let acquired = false;
  const now = new Date();

  try {
    await prisma.transactionalEmailLog.create({
      data: {
        eventKey: params.eventKey,
        eventType: params.eventType,
        recipient,
        subject: params.subject,
        status: "pending",
        ...(params.metadata !== undefined ? { metadata: params.metadata } : {}),
      },
    });
    acquired = true;
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      const existing = await prisma.transactionalEmailLog.findUnique({
        where: { eventKey: params.eventKey },
      });
      if (existing?.status === "sent") return { sent: false, skipped: true, failed: false };
      if (existing?.status === "pending" && now.getTime() - existing.sentAt.getTime() < PENDING_RETRY_MS) {
        return { sent: false, skipped: true, failed: false };
      }
      await prisma.transactionalEmailLog.update({
        where: { eventKey: params.eventKey },
        data: {
          eventType: params.eventType,
          recipient,
          subject: params.subject,
          status: "pending",
          sentAt: now,
          ...(params.metadata !== undefined ? { metadata: params.metadata } : {}),
        },
      });
      acquired = true;
    } else {
      throw err;
    }
  }

  if (!acquired) return { sent: false, skipped: true, failed: false };

  const sent = await sendEmailRaw(recipient, params.subject, params.html);
  await prisma.transactionalEmailLog.update({
    where: { eventKey: params.eventKey },
    data: { status: sent ? "sent" : "failed", sentAt: new Date() },
  }).catch((err) => {
    console.warn("[Email] Could not update email log:", err instanceof Error ? err.message : err);
  });

  return { sent, skipped: false, failed: !sent };
}

async function sendTransactionalMaybeOnce(params: {
  eventKey?: string;
  eventType: string;
  to: string;
  subject: string;
  html: string;
  metadata?: Prisma.InputJsonValue;
}): Promise<boolean> {
  if (params.eventKey) {
    const result = await sendTransactionalEmailOnce({
      eventKey: params.eventKey,
      eventType: params.eventType,
      to: params.to,
      subject: params.subject,
      html: params.html,
      metadata: params.metadata,
    });
    return result.sent || result.skipped;
  }
  return sendEmailRaw(params.to, params.subject, params.html);
}

export async function sendBroadcastEmails(
  recipients: EmailRecipient[],
  subject: string,
  htmlBody: string
): Promise<{ sent: number; failed: number; skipped: boolean }> {
  if (!hasEmailProvider()) {
    return { sent: 0, failed: 0, skipped: true };
  }
  let sent = 0;
  let failed = 0;

  for (let i = 0; i < recipients.length; i += BATCH_SIZE) {
    const batch = recipients.slice(i, i + BATCH_SIZE);
    const results = await Promise.all(
      batch.map(async (r) => {
        const html = htmlBody.replace(/\{\{name\}\}/g, escapeHtml(r.name || "User"));
        return sendEmailRaw(r.email, subject, html);
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

export async function sendPasswordResetEmail(to: string, resetLink: string): Promise<boolean> {
  return sendEmailRaw(
    to,
    "Reset your ProvenHire password",
    emailLayout(
      "Reset your password",
      [
        paragraph("You requested a password reset for your ProvenHire account."),
        button("Reset Password", resetLink),
        paragraph("This link expires in 1 hour. If you did not request this, you can ignore this email."),
      ].join("")
    )
  );
}

export async function sendInterviewerAcceptanceEmail(
  to: string,
  name: string,
  setPasswordLink: string
): Promise<boolean> {
  return sendEmailRaw(
    to,
    "Welcome to ProvenHire - set your password",
    emailLayout(
      "Your interviewer application was approved",
      [
        paragraph(`Hi ${withName(name, "Interviewer")},`),
        paragraph("Your application to join ProvenHire as an Expert Interviewer has been approved."),
        paragraph("Set your password to access your interviewer dashboard and complete your profile."),
        button("Set Password", setPasswordLink),
        paragraph("This link expires in 72 hours. If you have questions, reply to this email."),
      ].join("")
    )
  );
}

const OTP_EMAIL_SUBJECT = "Verify your email for ProvenHire";
const OTP_EMAIL_HTML = (code: string, recipientEmail: string) =>
  emailLayout(
    "Verify your email",
    [
      paragraph(`Use this verification code to finish creating your ProvenHire account for ${recipientEmail}.`),
      `<p style="font-size:28px;font-weight:800;letter-spacing:8px;color:#0B1C2D;margin:18px 0">${escapeHtml(code)}</p>`,
      paragraph("This code expires in 10 minutes and can be used only once."),
      paragraph("If you did not request this, you can safely ignore this email."),
    ].join("")
  );

export async function sendSignupVerificationCodeEmail(to: string, code: string): Promise<boolean> {
  return sendEmailRaw(to, OTP_EMAIL_SUBJECT, OTP_EMAIL_HTML(code, to));
}

export async function sendSkillExpiryReminderEmail(
  to: string,
  skillName: string,
  daysLeft: number
): Promise<boolean> {
  return sendEmailRaw(
    to,
    `Your ${skillName} verification expires in ${daysLeft} days`,
    emailLayout(
      "Verification expiring soon",
      [
        paragraph(`Your ${skillName} verification will expire in ${daysLeft} days.`),
        paragraph("Reattempt now to maintain your Verified Candidate status and keep your profile visible to recruiters."),
        button("Open Dashboard", appLink("/dashboard/jobseeker")),
      ].join("")
    )
  );
}

export async function sendSkillExpiredEmail(to: string, skillName: string): Promise<boolean> {
  return sendEmailRaw(
    to,
    `Your ${skillName} verification has expired`,
    emailLayout(
      "Verification expired",
      [
        paragraph(`Your ${skillName} verification has expired.`),
        paragraph("Reattempt now to restore your Verified Candidate status and keep your profile visible to recruiters."),
        button("Open Dashboard", appLink("/dashboard/jobseeker")),
      ].join("")
    )
  );
}

export async function sendAiInterviewUnderReviewEmail(to: string, name?: string | null): Promise<boolean> {
  return sendTransactionalMaybeOnce({
    eventType: "human_interview.ai_under_review",
    to,
    subject: "AI Expert Interview recorded - next step with your employer",
    html: emailLayout(
      "AI Expert Interview recorded",
      [
        paragraph(`Hi ${withName(name)},`),
        paragraph("Your AI Expert Interview is complete and scored on your ProvenHire profile."),
        paragraph("For roles you have applied to, the hiring employer chooses the next step: another AI screening, a ProvenHire Human Expert interview, or an on-site interview with their team."),
        button("Open Dashboard", appLink("/dashboard/jobseeker")),
      ].join("")
    ),
  });
}

export async function sendHumanInterviewApprovedEmail(to: string, name?: string | null): Promise<boolean> {
  return sendTransactionalMaybeOnce({
    eventType: "human_interview.approved",
    to,
    subject: "You are eligible for the Human Expert Interview",
    html: emailLayout(
      "Human Expert Interview unlocked",
      [
        paragraph(`Hi ${withName(name)},`),
        paragraph("Congratulations. You have cleared the review stage and are now eligible for the Human Expert Interview."),
        paragraph("Sign in and use Book Your Interview Slot on your dashboard to continue."),
        button("Book Interview Slot", appLink("/dashboard/jobseeker")),
      ].join("")
    ),
  });
}

export async function sendHumanInterviewRejectedEmail(to: string, name?: string | null): Promise<boolean> {
  return sendTransactionalMaybeOnce({
    eventType: "human_interview.rejected",
    to,
    subject: "Human Expert Interview - review outcome",
    html: emailLayout(
      "Human Expert Interview review outcome",
      [
        paragraph(`Hi ${withName(name)},`),
        paragraph("After review, you are not eligible for the Human Expert Interview at this time."),
        paragraph("Please retake the AI Interview when you are ready to reapply."),
        button("Open Dashboard", appLink("/dashboard/jobseeker")),
      ].join("")
    ),
  });
}

export async function sendHumanInterviewSlotBookedEmail(
  to: string,
  name: string | null | undefined,
  slotLabel: string,
  interviewerName?: string | null,
  eventKey?: string
): Promise<boolean> {
  return sendTransactionalMaybeOnce({
    eventKey,
    eventType: "human_interview.slot_booked.candidate",
    to,
    subject: "Your Human Expert Interview is confirmed",
    html: emailLayout(
      "Interview slot confirmed",
      [
        paragraph(`Hi ${withName(name)},`),
        paragraph("Your Human Expert Interview is confirmed."),
        paragraph(`Time: ${slotLabel}`),
        interviewerName ? paragraph(`Expert: ${interviewerName}`) : "",
        paragraph("Joining details will be available in your dashboard before the session."),
        button("View Dashboard", appLink("/dashboard/jobseeker")),
      ].join("")
    ),
  });
}

export async function sendHumanInterviewPaymentFailedEmail(to: string, name?: string | null): Promise<boolean> {
  return sendTransactionalMaybeOnce({
    eventType: "human_interview.payment_failed",
    to,
    subject: "Payment unsuccessful - please retry",
    html: emailLayout(
      "Payment unsuccessful",
      [
        paragraph(`Hi ${withName(name)},`),
        paragraph("Your payment for the Human Expert Interview could not be confirmed."),
        paragraph("Please retry from your dashboard."),
        button("Return to Dashboard", appLink("/dashboard/jobseeker")),
      ].join("")
    ),
  });
}

export async function sendRecruiterVerificationResultEmail(params: {
  to: string;
  name?: string | null;
  status: "verified" | "rejected";
  reason?: string | null;
  eventKey?: string;
}): Promise<boolean> {
  const approved = params.status === "verified";
  return sendTransactionalMaybeOnce({
    eventKey: params.eventKey,
    eventType: `recruiter.verification.${params.status}`,
    to: params.to,
    subject: approved ? "Your ProvenHire recruiter account is approved" : "Your ProvenHire recruiter verification needs attention",
    html: emailLayout(
      approved ? "Recruiter account approved" : "Recruiter verification update",
      approved
        ? [
            paragraph(`Hi ${withName(params.name)},`),
            paragraph("Your recruiter profile has been verified. You can now post jobs and review verified candidates on ProvenHire."),
            button("Open Recruiter Dashboard", appLink("/dashboard/recruiter")),
          ].join("")
        : [
            paragraph(`Hi ${withName(params.name)},`),
            paragraph("Your recruiter verification was not approved at this time."),
            params.reason ? paragraph(`Reason: ${params.reason}`) : "",
            paragraph("Please update your recruiter profile or contact support if you believe this needs review."),
            button("Open Recruiter Dashboard", appLink("/dashboard/recruiter")),
          ].join("")
    ),
  });
}

export async function sendInterviewerApplicationSubmittedEmail(params: {
  to: string;
  name: string;
  eventKey?: string;
}): Promise<boolean> {
  return sendTransactionalMaybeOnce({
    eventKey: params.eventKey,
    eventType: "interviewer.application.submitted",
    to: params.to,
    subject: "We received your ProvenHire interviewer application",
    html: emailLayout(
      "Application received",
      [
        paragraph(`Hi ${withName(params.name, "Interviewer")},`),
        paragraph("Thank you for applying to become a ProvenHire Expert Interviewer."),
        paragraph("Our team will review your application and contact you with the next step."),
      ].join("")
    ),
  });
}

export async function sendInterviewerApplicationRejectedEmail(params: {
  to: string;
  name: string;
  eventKey?: string;
}): Promise<boolean> {
  return sendTransactionalMaybeOnce({
    eventKey: params.eventKey,
    eventType: "interviewer.application.rejected",
    to: params.to,
    subject: "ProvenHire interviewer application update",
    html: emailLayout(
      "Application update",
      [
        paragraph(`Hi ${withName(params.name, "Interviewer")},`),
        paragraph("Thank you for your interest in joining ProvenHire as an Expert Interviewer."),
        paragraph("We are not moving forward with your application at this time. We appreciate the time you invested."),
      ].join("")
    ),
  });
}

export async function sendJobApplicationSubmittedEmail(params: {
  to: string;
  recruiterName?: string | null;
  candidateName?: string | null;
  candidateEmail: string;
  jobTitle: string;
  company?: string | null;
  jobId: string;
  eventKey?: string;
}): Promise<boolean> {
  return sendTransactionalMaybeOnce({
    eventKey: params.eventKey,
    eventType: "job.application.submitted",
    to: params.to,
    subject: `New application for ${params.jobTitle}`,
    html: emailLayout(
      "New job application",
      [
        paragraph(`Hi ${withName(params.recruiterName)},`),
        paragraph(`${withName(params.candidateName, params.candidateEmail)} applied for ${params.jobTitle}${params.company ? ` at ${params.company}` : ""}.`),
        paragraph(`Candidate email: ${params.candidateEmail}`),
        button("Review Applicants", appLink(`/dashboard/recruiter/jobs/${params.jobId}/applicants`)),
      ].join("")
    ),
    metadata: { jobId: params.jobId, candidateEmail: params.candidateEmail },
  });
}

export async function sendApplicationStatusChangedEmail(params: {
  to: string;
  candidateName?: string | null;
  jobTitle: string;
  company?: string | null;
  status: string;
  eventKey?: string;
}): Promise<boolean> {
  return sendTransactionalMaybeOnce({
    eventKey: params.eventKey,
    eventType: "job.application.status_changed",
    to: params.to,
    subject: `Application update: ${params.jobTitle}`,
    html: emailLayout(
      "Application status updated",
      [
        paragraph(`Hi ${withName(params.candidateName)},`),
        paragraph(`Your application for ${params.jobTitle}${params.company ? ` at ${params.company}` : ""} was updated to: ${params.status}.`),
        button("View Applications", appLink("/dashboard/jobseeker/applications")),
      ].join("")
    ),
  });
}

export async function sendRecruiterCandidateInterestEmail(params: {
  to: string;
  candidateName?: string | null;
  companyName: string;
  recruiterMessage?: string | null;
  eventKey?: string;
}): Promise<boolean> {
  return sendTransactionalMaybeOnce({
    eventKey: params.eventKey,
    eventType: "candidate.recruiter_interest",
    to: params.to,
    subject: `${params.companyName} is interested in your ProvenHire profile`,
    html: emailLayout(
      "A recruiter is interested in your profile",
      [
        paragraph(`Hi ${withName(params.candidateName)},`),
        paragraph(`${params.companyName} is interested in your ProvenHire profile.`),
        params.recruiterMessage ? paragraph(`Message: ${params.recruiterMessage}`) : "",
        paragraph("Open ProvenHire to review the message and next steps."),
        button("Open Dashboard", appLink("/dashboard/jobseeker")),
      ].join("")
    ),
  });
}

export async function sendHumanInterviewPaymentConfirmedEmail(params: {
  to: string;
  name?: string | null;
  eventKey?: string;
}): Promise<boolean> {
  return sendTransactionalMaybeOnce({
    eventKey: params.eventKey,
    eventType: "human_interview.payment_confirmed",
    to: params.to,
    subject: "Human Expert Interview payment confirmed",
    html: emailLayout(
      "Payment confirmed",
      [
        paragraph(`Hi ${withName(params.name)},`),
        paragraph("Your payment for the Human Expert Interview has been confirmed."),
        paragraph("You can now book your interview slot from your dashboard."),
        button("Book Interview Slot", appLink("/human-interview/slots")),
      ].join("")
    ),
  });
}

export async function sendHumanInterviewSlotBookedForInterviewerEmail(params: {
  to: string;
  interviewerName?: string | null;
  candidateName?: string | null;
  candidateEmail: string;
  scheduledAt: Date;
  eventKey?: string;
}): Promise<boolean> {
  return sendTransactionalMaybeOnce({
    eventKey: params.eventKey,
    eventType: "human_interview.slot_booked.interviewer",
    to: params.to,
    subject: "New Human Expert Interview booking",
    html: emailLayout(
      "Interview slot booked",
      [
        paragraph(`Hi ${withName(params.interviewerName, "Interviewer")},`),
        paragraph(`${withName(params.candidateName, params.candidateEmail)} booked a Human Expert Interview slot with you.`),
        paragraph(`Time: ${formatDateTime(params.scheduledAt)}`),
        button("Open Interviewer Dashboard", appLink("/dashboard/expert")),
      ].join("")
    ),
  });
}

export async function sendHumanInterviewReminderEmail(params: {
  to: string;
  name?: string | null;
  scheduledAt: Date;
  dashboardPath: string;
  recipientRole: "candidate" | "interviewer";
  eventKey?: string;
}): Promise<boolean> {
  return sendTransactionalMaybeOnce({
    eventKey: params.eventKey,
    eventType: `human_interview.reminder.${params.recipientRole}`,
    to: params.to,
    subject: "Reminder: your ProvenHire Human Expert Interview is coming up",
    html: emailLayout(
      "Interview reminder",
      [
        paragraph(`Hi ${withName(params.name)},`),
        paragraph(`Your Human Expert Interview is scheduled for ${formatDateTime(params.scheduledAt)}.`),
        paragraph("Please open your dashboard before the session to check joining details."),
        button("Open Dashboard", appLink(params.dashboardPath)),
      ].join("")
    ),
  });
}

export async function sendWorkspaceInvitationEmail(params: {
  to: string;
  workspaceName: string;
  organization: string;
  code: string;
  startsAt: Date;
  eventKey?: string;
}): Promise<boolean> {
  return sendTransactionalMaybeOnce({
    eventKey: params.eventKey,
    eventType: "workspace.invited",
    to: params.to,
    subject: `Invitation to ${params.workspaceName}`,
    html: emailLayout(
      "Workspace invitation",
      [
        paragraph(`${params.organization} invited you to join ${params.workspaceName} on ProvenHire.`),
        paragraph(`Workspace code: ${params.code}`),
        paragraph(`Starts: ${formatDateTime(params.startsAt)}`),
        paragraph("Sign in or create a Job Seeker account with this invited email address. We will return you to the assessment after sign-in."),
        button(
          "Review invitation",
          appLink(`/dashboard/jobseeker/workspaces/${encodeURIComponent(params.code)}`),
        ),
      ].join("")
    ),
  });
}

export async function sendWorkspaceStartedEmail(params: {
  to: string;
  name?: string | null;
  workspaceName: string;
  organization: string;
  code: string;
  startsAt: Date;
  eventKey?: string;
}): Promise<boolean> {
  return sendTransactionalMaybeOnce({
    eventKey: params.eventKey,
    eventType: "workspace.started",
    to: params.to,
    subject: `${params.workspaceName} has started`,
    html: emailLayout(
      "Workspace is live",
      [
        paragraph(`Hi ${withName(params.name)},`),
        paragraph(`${params.workspaceName} by ${params.organization} has started or is about to start.`),
        paragraph(`Workspace code: ${params.code}`),
        paragraph(`Start time: ${formatDateTime(params.startsAt)}`),
        button("Open Workspace", appLink(`/dashboard/jobseeker/workspaces/${encodeURIComponent(params.code)}`)),
      ].join("")
    ),
  });
}

export async function sendWorkspaceRemovalEmail(params: {
  to: string;
  name?: string | null;
  workspaceName: string;
  organization: string;
  eventKey?: string;
}): Promise<boolean> {
  return sendTransactionalMaybeOnce({
    eventKey: params.eventKey,
    eventType: "workspace.removed",
    to: params.to,
    subject: `Removed from ${params.workspaceName}`,
    html: emailLayout(
      "Workspace access removed",
      [
        paragraph(`Hi ${withName(params.name)},`),
        paragraph(`You were removed from ${params.workspaceName} by ${params.organization}.`),
        paragraph("If this looks wrong, contact the workspace organizer."),
        button("Open Workspaces", appLink("/dashboard/jobseeker/workspaces")),
      ].join("")
    ),
  });
}

export async function sendWorkspaceResultsAvailableEmail(params: {
  to: string;
  name?: string | null;
  workspaceName: string;
  organization: string;
  code: string;
  eventKey?: string;
}): Promise<boolean> {
  return sendTransactionalMaybeOnce({
    eventKey: params.eventKey,
    eventType: "workspace.results_available",
    to: params.to,
    subject: `Results available for ${params.workspaceName}`,
    html: emailLayout(
      "Workspace results are available",
      [
        paragraph(`Hi ${withName(params.name)},`),
        paragraph(`Final results for ${params.workspaceName} by ${params.organization} are now available.`),
        button("View Results", appLink(`/dashboard/jobseeker/workspaces/${encodeURIComponent(params.code)}`)),
      ].join("")
    ),
  });
}

export async function sendJobAlertDigestEmail(params: {
  to: string;
  name?: string | null;
  jobs: Array<{ id: string; title: string; company: string; location?: string | null }>;
  eventKey?: string;
}): Promise<boolean> {
  const items = params.jobs
    .slice(0, 10)
    .map(
      (job) =>
        `<li style="margin-bottom:10px"><strong>${escapeHtml(job.title)}</strong> at ${escapeHtml(job.company)}${job.location ? ` - ${escapeHtml(job.location)}` : ""}</li>`
    )
    .join("");
  return sendTransactionalMaybeOnce({
    eventKey: params.eventKey,
    eventType: "job_alert.digest",
    to: params.to,
    subject: "Your ProvenHire job alert digest",
    html: emailLayout(
      "New matching jobs",
      [
        paragraph(`Hi ${withName(params.name)},`),
        paragraph("Here are new job matches from your ProvenHire job alert subscription."),
        `<ul style="padding-left:20px;color:#334155;line-height:1.5">${items}</ul>`,
        button("Browse Jobs", appLink("/jobs")),
      ].join("")
    ),
  });
}
