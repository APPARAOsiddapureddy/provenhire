import { prisma } from "../config/prisma.js";
import { z } from "zod";
import {
  approveAdminReviewQueueForHumanExpert,
  getLatestAdminQueueForCandidate,
} from "./humanInterviewGate.service.js";

export const RECRUITER_INTERVIEW_MODES = ["provenhire_ai", "human_expert", "company_employee"] as const;
export type RecruiterInterviewMode = (typeof RECRUITER_INTERVIEW_MODES)[number];

const bodySchema = z.object({
  mode: z.enum(RECRUITER_INTERVIEW_MODES),
});

function expertInterviewSufficient(status: string | null | undefined): boolean {
  return status === "completed" || status === "pending_review";
}

/**
 * After AI Expert Interview, the hiring employer (recruiter) chooses the next round — not the platform default.
 */
export async function setRecruiterInterviewPathForApplication(params: {
  applicationId: string;
  recruiterUserId: string;
  body: unknown;
}): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const parsed = bodySchema.safeParse(params.body);
  if (!parsed.success) return { ok: false, status: 400, error: "Invalid mode" };

  const recruiter = await prisma.recruiterProfile.findUnique({
    where: { userId: params.recruiterUserId },
    select: { id: true },
  });
  if (!recruiter) return { ok: false, status: 403, error: "Recruiter profile required" };

  const application = await prisma.jobApplication.findUnique({
    where: { id: params.applicationId },
    include: {
      job: { select: { id: true, postedById: true, title: true } },
    },
  });
  if (!application) return { ok: false, status: 404, error: "Application not found" };
  if (application.job.postedById !== recruiter.id) {
    return { ok: false, status: 403, error: "Not authorized for this application" };
  }

  const expertStage = await prisma.verificationStage.findFirst({
    where: { userId: application.jobSeekerId, stageName: "expert_interview" },
  });
  if (!expertInterviewSufficient(expertStage?.status)) {
    return {
      ok: false,
      status: 409,
      error: "Candidate must complete the AI Expert Interview before you can set the next interview step.",
    };
  }

  await prisma.jobApplication.update({
    where: { id: application.id },
    data: {
      recruiterNextInterviewMode: parsed.data.mode,
      recruiterInterviewPathSetAt: new Date(),
      recruiterInterviewPathSetByUserId: params.recruiterUserId,
    },
  });

  const latestQueue = await getLatestAdminQueueForCandidate(application.jobSeekerId);

  if (parsed.data.mode === "human_expert") {
    if (!latestQueue) {
      return {
        ok: false,
        status: 409,
        error: "No AI interview review record found for this candidate. Ask them to finish the AI Expert Interview again or contact support.",
      };
    }
    if (latestQueue.status === "recruiter_redirected") {
      return {
        ok: false,
        status: 409,
        error:
          "This candidate's employer already chose a different next step (AI or company interview) for this application cycle. A new AI Expert attempt creates a new review row.",
      };
    }
    if (latestQueue.status === "pending") {
      await approveAdminReviewQueueForHumanExpert({
        queueId: latestQueue.id,
        reviewerUserId: params.recruiterUserId,
      });
    }
    return { ok: true };
  }

  // Non–human-expert paths: do not unlock ProvenHire human expert booking.
  if (latestQueue?.status === "pending") {
    await prisma.adminReviewQueue.update({
      where: { id: latestQueue.id },
      data: { status: "recruiter_redirected", reviewedAt: new Date(), reviewerId: params.recruiterUserId },
    });
  }

  return { ok: true };
}
