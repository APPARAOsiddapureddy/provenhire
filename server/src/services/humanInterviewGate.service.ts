import { prisma } from "../config/prisma.js";
import { sendAiInterviewUnderReviewEmail, sendHumanInterviewApprovedEmail } from "./resend.js";
import { upsertSkillVerification } from "./skillVerification.service.js";
import { syncProvenhireResumeFromSources } from "./provenhireResume.service.js";

export const HUMAN_INTERVIEW_PRICE_PAISE = 399 * 100;

/** `recruiter_redirected` = employer chose AI JD / company interview instead of ProvenHire human expert */
export type AdminReviewUiStatus = "none" | "pending" | "approved" | "rejected" | "recruiter_redirected";

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
  /** ISO timestamp when candidate may book again after a failed expert interview (PRD: 30 days). */
  human_expert_retry_after?: string | null;
}

function withExpertRetryCooldown(
  e: HumanInterviewEligibility,
  retryAfter: Date | null | undefined
): HumanInterviewEligibility {
  if (!retryAfter || retryAfter.getTime() <= Date.now()) {
    return { ...e, human_expert_retry_after: null };
  }
  return {
    ...e,
    can_access_slots: false,
    can_access_payment_page: false,
    block_human_interview_section: true,
    human_expert_retry_after: retryAfter.toISOString(),
  };
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

/**
 * Approves the AI→human gate (same logic as admin queue approve). Call when a **recruiter** selects
 * ProvenHire Human Expert or when an admin approves the queue.
 */
export async function approveAdminReviewQueueForHumanExpert(params: {
  queueId: string;
  reviewerUserId: string | null;
}): Promise<void> {
  const queue = await prisma.adminReviewQueue.findUnique({
    where: { id: params.queueId },
    include: { aiInterview: true },
  });
  if (!queue) throw new Error("Queue not found");
  if (queue.status !== "pending") return;

  const score = queue.aiInterview.totalScore ?? 0;
  const completedAt = queue.aiInterview.completedAt ?? new Date();

  await prisma.$transaction(async (tx) => {
    await tx.adminReviewQueue.update({
      where: { id: queue.id },
      data: { status: "approved", reviewedAt: new Date(), reviewerId: params.reviewerUserId },
    });
    await tx.verificationStage.updateMany({
      where: { userId: queue.candidateId, stageName: "expert_interview" },
      data: { status: "completed", score },
    });
    const priorAttempts = await tx.humanInterviewAttempt.count({ where: { candidateId: queue.candidateId } });
    const attemptNumber = priorAttempts + 1;
    const firstAttempt = attemptNumber === 1;
    await tx.humanInterviewAttempt.create({
      data: {
        candidateId: queue.candidateId,
        adminReviewQueueId: queue.id,
        attemptNumber,
        paymentStatus: firstAttempt ? "waived" : "pending",
        amountPaise: firstAttempt ? null : HUMAN_INTERVIEW_PRICE_PAISE,
      },
    });

    if (firstAttempt) {
      await tx.verificationStage.upsert({
        where: {
          userId_stageName: { userId: queue.candidateId, stageName: "human_expert_interview" },
        },
        create: {
          userId: queue.candidateId,
          stageName: "human_expert_interview",
          status: "in_progress",
        },
        update: { status: "in_progress" },
      });
    } else {
      await tx.verificationStage.updateMany({
        where: { userId: queue.candidateId, stageName: "human_expert_interview" },
        data: { status: "locked" },
      });
    }
  });

  await upsertSkillVerification(queue.candidateId, "INTERVIEW", score, completedAt);

  const profile = await prisma.jobSeekerProfile.findUnique({
    where: { userId: queue.candidateId },
    select: { verificationStatus: true },
  });
  if (profile && profile.verificationStatus !== "expert_verified") {
    await prisma.jobSeekerProfile.updateMany({
      where: { userId: queue.candidateId },
      data: { verificationStatus: "verified" },
    });
  }

  const user = await prisma.user.findUnique({
    where: { id: queue.candidateId },
    select: { email: true, name: true },
  });
  if (user?.email) {
    void sendHumanInterviewApprovedEmail(user.email, user.name).catch(() => {});
  }

  syncProvenhireResumeFromSources(queue.candidateId).catch((err) =>
    console.error(`[approveAdminReviewQueueForHumanExpert] resume sync failed for ${queue.candidateId}:`, err)
  );
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
    await tx.verificationStage.upsert({
      where: {
        userId_stageName: { userId: params.userId, stageName: "expert_interview" },
      },
      create: {
        userId: params.userId,
        stageName: "expert_interview",
        status: "completed",
        score: params.score,
      },
      update: { status: "completed", score: params.score },
    });
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
    select: { roleType: true, humanExpertRetryAfter: true },
  });
  const roleType = (profile?.roleType as string) || "technical";
  const retryAfter = profile?.humanExpertRetryAfter ?? null;

  if (roleType === "non_technical") {
    /** Non-technical v2: AI Expert Interview replaces in-platform human expert booking for verification. */
    return withExpertRetryCooldown(
      {
        admin_review_status: "none",
        latest_queue_id: null,
        requires_payment: false,
        payment_status: "waived",
        can_access_slots: false,
        can_access_payment_page: false,
        block_human_interview_section: true,
        human_interview_attempts: 0,
        attempt_id: null,
        razorpay_key_id: null,
        expert_interview_stage_status: null,
      },
      retryAfter
    );
  }

  const expertStage = await prisma.verificationStage.findFirst({
    where: { userId, stageName: "expert_interview" },
  });
  const latestQueue = await getLatestAdminQueueForCandidate(userId);
  const humanInterviewAttemptsCount = await prisma.humanInterviewAttempt.count({
    where: { candidateId: userId },
  });

  const attempt = latestQueue
    ? await prisma.humanInterviewAttempt.findFirst({
        where: { adminReviewQueueId: latestQueue.id },
      })
    : null;

  let admin_review_status: AdminReviewUiStatus = "none";
  if (latestQueue) {
    if (latestQueue.status === "pending") admin_review_status = "pending";
    else if (latestQueue.status === "approved") admin_review_status = "approved";
    else if (latestQueue.status === "rejected") admin_review_status = "rejected";
    else if (latestQueue.status === "recruiter_redirected") admin_review_status = "recruiter_redirected";
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
    admin_review_status === "approved" &&
    attempt != null &&
    attempt.attemptNumber >= 2 &&
    attempt.paymentStatus === "pending";

  // Slot booking is allowed only if:
  // - it's the first attempt (attemptNumber===1) and payment is waived, OR
  // - payment is confirmed for paid retries.
  const can_access_slots =
    admin_review_status === "approved" &&
    attempt != null &&
    ((attempt.attemptNumber === 1 && attempt.paymentStatus === "waived") || attempt.paymentStatus === "paid");

  const can_access_payment_page = requires_payment;

  const block_human_interview_section =
    admin_review_status === "pending" ||
    admin_review_status === "rejected" ||
    admin_review_status === "recruiter_redirected" ||
    admin_review_status === "none";

  const razorpayKey = process.env.RAZORPAY_KEY_ID?.trim() || null;

  return withExpertRetryCooldown(
    {
      admin_review_status,
      latest_queue_id: latestQueue?.id ?? null,
      requires_payment,
      payment_status,
      can_access_slots,
      can_access_payment_page,
      block_human_interview_section,
      human_interview_attempts: humanInterviewAttemptsCount,
      attempt_id: attempt?.id ?? null,
      razorpay_key_id: razorpayKey,
      expert_interview_stage_status: expertStage?.status ?? null,
    },
    retryAfter
  );
}
