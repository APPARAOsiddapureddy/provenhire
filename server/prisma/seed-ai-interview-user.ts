/**
 * Seed a job seeker who can directly open the AI Interview round.
 * Run: cd server && npm run seed:ai-interview
 * Or:  cd server && npx tsx prisma/seed-ai-interview-user.ts
 *
 * Login with email + password at /auth (Job Seeker → Sign In).
 * Email and password must be stored in lowercase/normalized form so auth matches.
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcrypt";

// Keep consistent with `prisma/seed-test-credentials.ts` so QA can use one set.
const TEST_EMAIL = "interview@test.provenhire.com".trim().toLowerCase();
const TEST_PASSWORD = "Test123456";
const TEST_NAME = "AI Interview Test User";

const technicalStages = ["profile_setup", "aptitude_test", "dsa_round", "expert_interview"];

async function main() {
  const prisma = new PrismaClient();
  // Find by email case-insensitively so we match even if DB has different casing
  let user = await prisma.user.findFirst({
    where: { email: { equals: TEST_EMAIL, mode: "insensitive" } },
  });
  const hash = await bcrypt.hash(TEST_PASSWORD, 12);

  if (!user) {
    user = await prisma.user.create({
      data: {
        email: TEST_EMAIL,
        name: TEST_NAME,
        passwordHash: hash,
        role: "jobseeker",
        emailVerified: true,
        authProvider: "EMAIL",
      },
    });
    console.log("Created test job seeker user.");
  } else {
    await prisma.user.update({
      where: { id: user.id },
      data: {
        email: TEST_EMAIL,
        passwordHash: hash,
        authProvider: "EMAIL",
        name: TEST_NAME,
      },
    });
    console.log("Updated existing test user (email normalized to lowercase, password and authProvider set).");
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
  for (const stageName of technicalStages) {
    const status =
      stageName === "expert_interview" ? "in_progress" : "completed";
    const score = stageName === "expert_interview" ? undefined : 80;
    await prisma.verificationStage.upsert({
      where: { userId_stageName: { userId: user.id, stageName } },
      create: {
        userId: user.id,
        stageName,
        status,
        score: score ?? null,
      },
      update: { status, score: score ?? undefined },
    });
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
