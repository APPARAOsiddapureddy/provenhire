/**
 * Backfill JobSeekerProfile.verificationStatus from stage + certification rules.
 * Run: cd server && npx tsx scripts/backfillCertification.ts
 */
import { prisma } from "../src/config/prisma.js";
import { syncJobSeekerVerificationStatus } from "../src/services/certification.service.js";

async function main() {
  const profiles = await prisma.jobSeekerProfile.findMany({ select: { userId: true } });
  let updated = 0;
  for (const p of profiles) {
    const before = await prisma.jobSeekerProfile.findUnique({
      where: { userId: p.userId },
      select: { verificationStatus: true },
    });
    await syncJobSeekerVerificationStatus(p.userId);
    const after = await prisma.jobSeekerProfile.findUnique({
      where: { userId: p.userId },
      select: { verificationStatus: true },
    });
    if (before?.verificationStatus !== after?.verificationStatus) {
      console.log(`${p.userId}: ${before?.verificationStatus ?? "null"} → ${after?.verificationStatus ?? "null"}`);
      updated++;
    }
  }
  console.log(`Backfill complete. Changed ${updated} of ${profiles.length} profiles.`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
