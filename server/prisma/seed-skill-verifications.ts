/**
 * Backfill CandidateSkillVerification from existing AptitudeTestResult, DsaRoundResult, Interview.
 * Run once after deploying the skill validity feature.
 * npx tsx prisma/seed-skill-verifications.ts
 */
import { prisma } from "../src/config/prisma.js";
import { calculateExpiry } from "../src/services/skillVerification.service.js";

async function main() {
  console.log("Backfilling CandidateSkillVerification...");

  const aptitudeResults = await prisma.aptitudeTestResult.findMany({
    where: { invalidated: false },
    orderBy: { completedAt: "desc" },
    distinct: ["userId"],
  });
  for (const r of aptitudeResults) {
    const completedAt = r.completedAt ?? new Date();
    const expiresAt = calculateExpiry("APTITUDE", completedAt);
    await prisma.candidateSkillVerification.upsert({
      where: { userId_skillType: { userId: r.userId, skillType: "APTITUDE" } },
      create: {
        userId: r.userId,
        skillType: "APTITUDE",
        status: "ACTIVE",
        score: r.score ?? 0,
        completedAt,
        expiresAt,
      },
      update: {
        status: "ACTIVE",
        score: r.score ?? 0,
        completedAt,
        expiresAt,
        updatedAt: new Date(),
      },
    });
  }
  console.log(`  Aptitude: ${aptitudeResults.length} records`);

  const dsaResults = await prisma.dsaRoundResult.findMany({
    where: { invalidated: false },
    orderBy: { completedAt: "desc" },
    distinct: ["userId"],
  });
  for (const r of dsaResults) {
    const completedAt = r.completedAt ?? new Date();
    const expiresAt = calculateExpiry("LIVE_CODING", completedAt);
    await prisma.candidateSkillVerification.upsert({
      where: { userId_skillType: { userId: r.userId, skillType: "LIVE_CODING" } },
      create: {
        userId: r.userId,
        skillType: "LIVE_CODING",
        status: "ACTIVE",
        score: r.score ?? 0,
        completedAt,
        expiresAt,
      },
      update: {
        status: "ACTIVE",
        score: r.score ?? 0,
        completedAt,
        expiresAt,
        updatedAt: new Date(),
      },
    });
  }
  console.log(`  Live Coding: ${dsaResults.length} records`);

  const interviews = await prisma.interview.findMany({
    where: { status: "completed" },
    orderBy: { completedAt: "desc" },
    distinct: ["userId"],
  });
  for (const i of interviews) {
    const completedAt = i.completedAt ?? new Date();
    const expiresAt = calculateExpiry("INTERVIEW", completedAt);
    await prisma.candidateSkillVerification.upsert({
      where: { userId_skillType: { userId: i.userId, skillType: "INTERVIEW" } },
      create: {
        userId: i.userId,
        skillType: "INTERVIEW",
        status: "ACTIVE",
        score: i.totalScore ?? 0,
        completedAt,
        expiresAt,
      },
      update: {
        status: "ACTIVE",
        score: i.totalScore ?? 0,
        completedAt,
        expiresAt,
        updatedAt: new Date(),
      },
    });
  }
  console.log(`  Interview: ${interviews.length} records`);

  console.log("Backfill complete.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
