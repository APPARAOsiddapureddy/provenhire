/**
 * Keeps JobSeekerProfile.verificationStatus aligned with provenhire certification codes
 * (derived from stages + scorecard rules in computeProvenhireCertification).
 */
import { prisma } from "../config/prisma.js";
import { computeProvenhireCertification } from "./verificationScoring.service.js";

/** Sync DB verificationStatus so admin and legacy queries match certification ladder. */
export async function syncJobSeekerVerificationStatus(userId: string): Promise<void> {
  const prof = await prisma.jobSeekerProfile.findUnique({
    where: { userId },
    select: { verificationStatus: true },
  });
  if (!prof) return;

  const { certificationLevel } = await computeProvenhireCertification(userId);

  let next: string | undefined;
  if (certificationLevel === "L3") {
    next = "expert_verified";
  } else if (certificationLevel === "L2" || certificationLevel === "L1") {
    next = "verified";
  }

  if (!next) return;

  if (prof.verificationStatus === next) return;

  await prisma.jobSeekerProfile.updateMany({
    where: { userId },
    data: { verificationStatus: next },
  });
}
