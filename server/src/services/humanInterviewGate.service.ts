import { prisma } from "../config/prisma.js";
import { sendAiInterviewUnderReviewEmail } from "./resend.js";

export const HUMAN_INTERVIEW_PRICE_PAISE = 399 * 100;

export type AdminReviewUiStatus = "none" | "pending" | "approved" | "rejected";

export interface HumanInterviewEligibility {
  admin_review_status: AdminReviewUiStatus;
  latest_queue_id: string | null;
  /** Show ₹399 payment step */
  requires_payment: boolean;
  payment_status: "none" | "pending" | "paid" | "waived" | "failed";
  /** Slot booking API + /human-interview/slots */
  can_access_slots: boolean;
  /** /human-interview/payment when approval exists but payment still pending */
  can_access_payment_page: boolean;
  /** True when any /human-interview/* should 403 except payment/slots per flags above */
  block_human_interview_section: boolean;
  human_interview_attempts: number;
  attempt_id: string | null;
  razorpay_key_id: string | null;
  expert_interview_stage_status: string | null;
}

/** True if this candidate has ever been rejected in the AI→human admin queue (retries pay ₹399). */
export async function candidateHadAdminRejection(candidateId: string): Promise<boolean> {
  const row = await prisma.adminReviewQueue.findFirst({
    where: { candidateId, status: "rejected" },
    select: { id: true },
  });
  return row != null;
}

export async function getLatestAdminQueueForCandidate(candidateId: string) {
  return prisma.adminReviewQueue.findFirst({
    where: { candidateId },
    orderBy: { createdAt: "desc" },
    include: { aiInterview: { select: { id: true, totalScore: true, completedAt: true, status: true } } },
  });
}

/** Call when the candidate finishes the last AI interview answer (technical track). */
export async function recordAiInterviewSubmittedForAdminReview(params: {
  userId: string;
  interviewId: string;
  score: number | null;
}): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.adminReviewQueue.upsert({
      where: { aiInterviewId: params.interviewId },
      create: {
        candidateId: params.userId,
        aiInterviewId: params.interviewId,
        status: "pending",
      },
      update: { status: "pending" },
    });
    const existing = await tx.verificationStage.findFirst({
      where: { userId: params.userId, stageName: "expert_interview" },
    });
    if (existing) {
      await tx.verificationStage.update({
        where: { id: existing.id },
        data: { status: "pending_review", score: params.score },
      });
    } else {
      await tx.verificationStage.create({
        data: {
          userId: params.userId,
          stageName: "expert_interview",
          status: "pending_review",
          score: params.score,
        },
      });
    }
    await tx.verificationStage.updateMany({
      where: { userId: params.userId, stageName: "human_expert_interview" },
      data: { status: "locked" },
    });
  });

  const user = await prisma.user.findUnique({
    where: { id: params.userId },
    select: { email: true, name: true },
  });
  if (user?.email) {
    void sendAiInterviewUnderReviewEmail(user.email, user.name).catch(() => {});
  }
}

export async function getHumanInterviewEligibility(userId: string): Promise<HumanInterviewEligibility> {
  const profile = await prisma.jobSeekerProfile.findUnique({
    where: { userId },
    select: { roleType: true },
  });
  const roleType = (profile?.roleType as string) || "technical";

  if (roleType === "non_technical") {
    const assignment = await prisma.verificationStage.findFirst({
      where: { userId, stageName: "non_tech_assignment", status: "completed" },
    });
    const sessionCount = await prisma.humanInterviewSession.count({
      where: { userId, status: { in: ["scheduled", "in_progress", "completed"] } },
    });
    const assignStage = await prisma.verificationStage.findFirst({
      where: { userId, stageName: "non_tech_assignment" },
    });
    const can = !!assignment;
    return {
      admin_review_status: "none",
      latest_queue_id: null,
      requires_payment: false,
      payment_status: "waived",
      can_access_slots: can,
      can_access_payment_page: false,
      block_human_interview_section: !can,
      human_interview_attempts: sessionCount,
      attempt_id: null,
      razorpay_key_id: null,
      expert_interview_stage_status: assignStage?.status ?? null,
    };
  }

  const expertStage = await prisma.verificationStage.findFirst({
    where: { userId, stageName: "expert_interview" },
  });
  const latestQueue = await getLatestAdminQueueForCandidate(userId);

  if (!latestQueue && expertStage?.status === "completed") {
    const sessionCount = await prisma.humanInterviewSession.count({
      where: { userId, status: { in: ["scheduled", "in_progress", "completed"] } },
    });
    return {
      admin_review_status: "approved",
      latest_queue_id: null,
      requires_payment: false,
      payment_status: "waived",
      can_access_slots: true,
      can_access_payment_page: false,
      block_human_interview_section: false,
      human_interview_attempts: sessionCount,
      attempt_id: null,
      razorpay_key_id: process.env.RAZORPAY_KEY_ID?.trim() || null,
      expert_interview_stage_status: expertStage.status,
    };
  }

  const attempt = latestQueue
    ? await prisma.humanInterviewAttempt.findFirst({
        where: { adminReviewQueueId: latestQueue.id },
      })
    : null;

  const sessionCount = await prisma.humanInterviewSession.count({
    where: { userId, status: { in: ["scheduled", "in_progress", "completed"] } },
  });

  let admin_review_status: AdminReviewUiStatus = "none";
  if (latestQueue) {
    if (latestQueue.status === "pending") admin_review_status = "pending";
    else if (latestQueue.status === "approved") admin_review_status = "approved";
    else if (latestQueue.status === "rejected") admin_review_status = "rejected";
  }

  const payment_status: HumanInterviewEligibility["payment_status"] =
    attempt == null
      ? "none"
      : attempt.paymentStatus === "paid"
        ? "paid"
        : attempt.paymentStatus === "waived"
          ? "waived"
          : attempt.paymentStatus === "failed"
            ? "failed"
            : "pending";

  const requires_payment =
    admin_review_status === "approved" && attempt != null && attempt.paymentStatus === "pending";

  const can_access_slots =
    admin_review_status === "approved" && attempt != null && (payment_status === "paid" || payment_status === "waived");

  const can_access_payment_page = requires_payment;

  const block_human_interview_section =
    admin_review_status === "pending" ||
    admin_review_status === "rejected" ||
    admin_review_status === "none";

  const razorpayKey = process.env.RAZORPAY_KEY_ID?.trim() || null;

  return {
    admin_review_status,
    latest_queue_id: latestQueue?.id ?? null,
    requires_payment,
    payment_status,
    can_access_slots,
    can_access_payment_page,
    block_human_interview_section,
    human_interview_attempts: sessionCount,
    attempt_id: attempt?.id ?? null,
    razorpay_key_id: razorpayKey,
    expert_interview_stage_status: expertStage?.status ?? null,
  };
}
