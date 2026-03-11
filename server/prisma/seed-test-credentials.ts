/**
 * Seed three test job seekers for end-to-end verification testing.
 * Run: cd server && npx tsx prisma/seed-test-credentials.ts
 *
 * Creates:
 * 1. Aptitude user  – profile done, ready to take Aptitude Test
 * 2. DSA user       – profile + aptitude done, ready to take DSA Round
 * 3. Interview user – profile + aptitude + DSA done, ready to take AI Expert Interview
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcrypt";

const PASSWORD = "Test123456";

const TEST_USERS = [
  {
    email: "aptitude@test.provenhire.com",
    name: "Aptitude Test User",
    stages: [
      { stageName: "profile_setup", status: "completed", score: 100 },
      { stageName: "aptitude_test", status: "in_progress" },
    ],
  },
  {
    email: "dsa@test.provenhire.com",
    name: "DSA Test User",
    stages: [
      { stageName: "profile_setup", status: "completed", score: 100 },
      { stageName: "aptitude_test", status: "completed", score: 75 },
      { stageName: "dsa_round", status: "in_progress" },
    ],
    aptitudeScore: 75,
  },
  {
    email: "interview@test.provenhire.com",
    name: "Interview Test User",
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
        },
      });
      console.log(`Created: ${u.email}`);
    } else {
      await prisma.user.update({
        where: { id: user.id },
        data: { passwordHash: hash },
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
      const existing = await prisma.verificationStage.findFirst({
        where: { userId: user.id, stageName: s.stageName },
      });
      if (existing) {
        await prisma.verificationStage.update({
          where: { id: existing.id },
          data: { status: s.status, score: s.score ?? undefined },
        });
      } else {
        await prisma.verificationStage.create({
          data: {
            userId: user.id,
            stageName: s.stageName,
            status: s.status,
            score: s.score ?? null,
          },
        });
      }
    }

    if ("aptitudeScore" in u && u.aptitudeScore != null) {
      const existing = await prisma.aptitudeTestResult.findFirst({ where: { userId: user.id } });
      if (existing) {
        await prisma.aptitudeTestResult.update({ where: { id: existing.id }, data: { score: u.aptitudeScore } });
      } else {
        await prisma.aptitudeTestResult.create({
          data: { userId: user.id, score: u.aptitudeScore, answers: {} },
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
  console.log("| 1. Aptitude Test   | aptitude@test.provenhire.com   | Test123456 |");
  console.log("| 2. DSA Round       | dsa@test.provenhire.com        | Test123456 |");
  console.log("| 3. AI Interview    | interview@test.provenhire.com  | Test123456 |");
  console.log("\nAfter login, go to Verification → you’ll see the next stage ready.\n");

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
