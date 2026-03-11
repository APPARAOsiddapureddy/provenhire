/**
 * Seed a job seeker who can directly open the AI Interview round.
 * Run: cd server && npx tsx prisma/seed-ai-interview-user.ts
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcrypt";

const TEST_EMAIL = "ai-interview@test.provenhire.com";
const TEST_PASSWORD = "Test123456";
const TEST_NAME = "AI Interview Test User";

const technicalStages = ["profile_setup", "aptitude_test", "dsa_round", "expert_interview"];

async function main() {
  const prisma = new PrismaClient();
  let user = await prisma.user.findUnique({ where: { email: TEST_EMAIL } });
  const hash = await bcrypt.hash(TEST_PASSWORD, 12);

  if (!user) {
    user = await prisma.user.create({
      data: {
        email: TEST_EMAIL,
        name: TEST_NAME,
        passwordHash: hash,
        role: "jobseeker",
        emailVerified: true,
      },
    });
    console.log("Created test job seeker user.");
  } else {
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: hash },
    });
    console.log("Updated existing test user password.");
  }

  await prisma.jobSeekerProfile.upsert({
    where: { userId: user.id },
    create: {
      userId: user.id,
      fullName: TEST_NAME,
      email: TEST_EMAIL,
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

  // Mark profile_setup, aptitude_test, dsa_round as completed; expert_interview as in_progress
  const stages = await prisma.verificationStage.findMany({
    where: { userId: user.id },
  });
  const existingByStage = new Map(stages.map((s) => [s.stageName, s]));
  for (const stageName of technicalStages) {
    const status =
      stageName === "expert_interview" ? "in_progress" : "completed";
    const score = stageName === "expert_interview" ? undefined : 80;
    const existing = existingByStage.get(stageName);
    if (existing) {
      await prisma.verificationStage.update({
        where: { id: existing.id },
        data: { status, score: score ?? undefined },
      });
    } else {
      await prisma.verificationStage.create({
        data: {
          userId: user.id,
          stageName,
          status,
          score: score ?? null,
        },
      });
    }
  }

  console.log("\n--- AI Interview Test User ---");
  console.log("  Email:    " + TEST_EMAIL);
  console.log("  Password: " + TEST_PASSWORD);
  console.log("  Login at: /auth (select Job Seeker, then Sign In)");
  console.log("  After login, go to Verification Pipeline — you'll see AI Expert Interview as the next step.\n");
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
