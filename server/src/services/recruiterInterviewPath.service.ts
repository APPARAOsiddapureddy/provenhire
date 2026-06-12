import { prisma } from "../config/prisma.js";
import { z } from "zod";
import {
  approveAdminReviewQueueForHumanExpert,
  getLatestAdminQueueForCandidate,
} from "./humanInterviewGate.service.js";
import { isVerificationPipelineV2, roleTypeToTrack } from "../constants/verificationPipeline.js";
import { sendApplicationStatusChangedEmail } from "./resend.js";

export const RECRUITER_INTERVIEW_MODES = ["provenhire_ai", "human_expert", "company_employee"] as const;
export type RecruiterInterviewMode = (typeof RECRUITER_INTERVIEW_MODES)[number];

const bodySchema = z.object({
  mode: z.enum(RECRUITER_INTERVIEW_MODES),
});

function expertInterviewSufficient(status: string | null | undefined): boolean {
  return status === "completed" || status === "pending_review";
}

function modeLabel(mode: RecruiterInterviewMode): string {
  if (mode === "human_expert") return "ProvenHire Human Expert Interview";
  if (mode === "provenhire_ai") return "ProvenHire AI Interview";
  return "Company interview";
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
      job: { select: { id: true, postedById: true, title: true, company: true } },
      jobSeeker: {
        select: {
          email: true,
          name: true,
          jobSeekerProfile: { select: { fullName: true } },
        },
      },
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

  const candidateProfile = await prisma.jobSeekerProfile.findUnique({
    where: { userId: application.jobSeekerId },
    select: { roleType: true },
  });
  const softwareV2Candidate =
    isVerificationPipelineV2() && roleTypeToTrack(candidateProfile?.roleType) === "software";

  if (softwareV2Candidate && parsed.data.mode === "human_expert") {
    return {
      ok: false,
      status: 409,
      error: "Human expert routing is not part of the current developer verification path.",
    };
  }

  const pathChanged = application.recruiterNextInterviewMode !== parsed.data.mode;
  const changedAt = new Date();
  await prisma.jobApplication.update({
    where: { id: application.id },
    data: {
      recruiterNextInterviewMode: parsed.data.mode,
      recruiterInterviewPathSetAt: changedAt,
      recruiterInterviewPathSetByUserId: params.recruiterUserId,
    },
  });

  const notifyCandidate = () => {
    if (!pathChanged) return;
    void sendApplicationStatusChangedEmail({
      to: application.jobSeeker.email,
      candidateName: application.jobSeeker.jobSeekerProfile?.fullName || application.jobSeeker.name,
      jobTitle: application.job.title,
      company: application.job.company,
      status: modeLabel(parsed.data.mode),
      eventKey: `job-application-interview-path:${application.id}:${parsed.data.mode}:${changedAt.getTime()}`,
    }).catch((err) => {
      console.warn("[recruiterInterviewPath] candidate email failed:", err instanceof Error ? err.message : err);
    });
  };

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
    notifyCandidate();
    return { ok: true };
  }

  // Non–human-expert paths: do not unlock ProvenHire human expert booking.
  if (latestQueue?.status === "pending") {
    await prisma.adminReviewQueue.update({
      where: { id: latestQueue.id },
      data: { status: "recruiter_redirected", reviewedAt: new Date(), reviewerId: params.recruiterUserId },
    });
  }

  notifyCandidate();
  return { ok: true };
}
