/**
 * Seed test job seekers for end-to-end verification testing.
 * Apply migrations first (same DATABASE_URL): `npx prisma migrate deploy`
 * Then: cd server && npx tsx prisma/seed-test-credentials.ts
 *
 * Creates:
 * 1. Aptitude user   – profile done, ready to take Aptitude Test
 * 2. DSA user        – profile + aptitude done, ready to take DSA Round
 * 3. Interview user  – ready for AI Expert Interview
 * 4. Interview user 2 – second account, same stage (parallel QA)
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcrypt";

const PASSWORD = "PhE2E_Apr2026!x7";

const TEST_USERS = [
  {
    email: "qa.apt.apr2026@test.provenhire.com",
    name: "QA Aptitude Apr2026",
    stages: [
      { stageName: "profile_setup", status: "completed", score: 100 },
      { stageName: "aptitude_test", status: "in_progress" },
    ],
  },
  {
    email: "qa.dsa.apr2026@test.provenhire.com",
    name: "QA DSA Apr2026",
    stages: [
      { stageName: "profile_setup", status: "completed", score: 100 },
      { stageName: "aptitude_test", status: "completed", score: 75 },
      { stageName: "dsa_round", status: "in_progress" },
    ],
    aptitudeScore: 75,
  },
  {
    email: "qa.ai.apr2026@test.provenhire.com",
    name: "QA AI Interview Apr2026",
    stages: [
      { stageName: "profile_setup", status: "completed", score: 100 },
      { stageName: "aptitude_test", status: "completed", score: 80 },
      { stageName: "dsa_round", status: "completed", score: 70 },
      { stageName: "expert_interview", status: "in_progress" },
    ],
    aptitudeScore: 80,
    dsaScore: 70,
  },
  {
    email: "qa.ai2.apr2026@test.provenhire.com",
    name: "QA AI Interview 2 Apr2026",
    stages: [
      { stageName: "profile_setup", status: "completed", score: 100 },
      { stageName: "aptitude_test", status: "completed", score: 80 },
      { stageName: "dsa_round", status: "completed", score: 70 },
      { stageName: "expert_interview", status: "in_progress" },
    ],
    aptitudeScore: 80,
    dsaScore: 70,
  },
];

async function main() {
  const prisma = new PrismaClient();
  const hash = await bcrypt.hash(PASSWORD, 12);

  console.log("\n--- ProvenHire Test Credentials ---\n");

  for (const u of TEST_USERS) {
    let user = await prisma.user.findUnique({ where: { email: u.email } });

    if (!user) {
      user = await prisma.user.create({
        data: {
          email: u.email,
          name: u.name,
          passwordHash: hash,
          role: "jobseeker",
          emailVerified: true,
          authProvider: "EMAIL",
        },
      });
      console.log(`Created: ${u.email}`);
    } else {
      await prisma.user.update({
        where: { id: user.id },
        data: { passwordHash: hash, name: u.name, authProvider: "EMAIL" },
      });
      console.log(`Updated: ${u.email}`);
    }

    await prisma.jobSeekerProfile.upsert({
      where: { userId: user.id },
      create: {
        userId: user.id,
        fullName: u.name,
        email: u.email,
        roleType: "technical",
        targetJobTitle: "Software Engineer",
        experienceYears: 2,
      },
      update: {
        roleType: "technical",
        targetJobTitle: "Software Engineer",
        experienceYears: 2,
      },
    });

    for (const s of u.stages) {
      await prisma.verificationStage.upsert({
        where: { userId_stageName: { userId: user.id, stageName: s.stageName } },
        create: {
          userId: user.id,
          stageName: s.stageName,
          status: s.status,
          score: s.score ?? null,
        },
        update: { status: s.status, score: s.score ?? undefined },
      });
    }

    if ("aptitudeScore" in u && u.aptitudeScore != null) {
      const pct = Math.min(100, Math.max(0, Math.round(u.aptitudeScore)));
      // Match real POST /aptitude shape: earned/total for display; use 100-scale for synthetic test users
      const answers = {
        earnedMarks: pct,
        totalMarks: 100,
        questions: 0,
        correct: 0,
        syntheticPercentSeed: true,
      };
      const existing = await prisma.aptitudeTestResult.findFirst({ where: { userId: user.id } });
      if (existing) {
        await prisma.aptitudeTestResult.update({
          where: { id: existing.id },
          data: { score: pct, answers },
        });
      } else {
        await prisma.aptitudeTestResult.create({
          data: { userId: user.id, score: pct, answers },
        });
      }
    }

    if ("dsaScore" in u && u.dsaScore != null) {
      const existing = await prisma.dsaRoundResult.findFirst({ where: { userId: user.id } });
      if (existing) {
        await prisma.dsaRoundResult.update({ where: { id: existing.id }, data: { score: u.dsaScore } });
      } else {
        await prisma.dsaRoundResult.create({
          data: { userId: user.id, score: u.dsaScore, answers: {} },
        });
      }
    }
  }

  console.log("\n--- Login at: /auth (select Job Seeker → Sign In) ---\n");
  console.log("| Test              | Email                          | Password   |");
  console.log("|-------------------|--------------------------------|------------|");
  console.log("| 1. Aptitude        | qa.apt.apr2026@test.provenhire.com  | PhE2E_Apr2026!x7 |");
  console.log("| 2. DSA Round       | qa.dsa.apr2026@test.provenhire.com | PhE2E_Apr2026!x7 |");
  console.log("| 3. AI Interview    | qa.ai.apr2026@test.provenhire.com  | PhE2E_Apr2026!x7 |");
  console.log("| 4. AI Interview 2  | qa.ai2.apr2026@test.provenhire.com | PhE2E_Apr2026!x7 |");
  console.log("\nAfter login, go to Verification — the next stage is ready.\n");

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
