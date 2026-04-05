/**
 * Seed job seekers who can directly open the AI Interview round.
 * Run: cd server && npm run seed:ai-interview
 * Or:  cd server && npx tsx prisma/seed-ai-interview-user.ts
 *
 * Login with email + password at /auth (Job Seeker → Sign In).
 * Email and password must be stored in lowercase/normalized form so auth matches.
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcrypt";

const TEST_PASSWORD = "PhE2E_Apr2026!x7";

const AI_INTERVIEW_TEST_USERS = [
  { email: "qa.ai.apr2026@test.provenhire.com", name: "QA AI Interview Apr2026" },
  { email: "qa.ai2.apr2026@test.provenhire.com", name: "QA AI Interview 2 Apr2026" },
] as const;

const technicalStages = ["profile_setup", "aptitude_test", "dsa_round", "expert_interview"];

async function seedOne(
  prisma: PrismaClient,
  hash: string,
  TEST_EMAIL: string,
  TEST_NAME: string
) {
  let user = await prisma.user.findFirst({
    where: { email: { equals: TEST_EMAIL, mode: "insensitive" } },
  });

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
    console.log(`Created test job seeker: ${TEST_EMAIL}`);
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
    console.log(`Updated test user: ${TEST_EMAIL}`);
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

  for (const stageName of technicalStages) {
    const status = stageName === "expert_interview" ? "in_progress" : "completed";
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
}

async function main() {
  const prisma = new PrismaClient();
  const hash = await bcrypt.hash(TEST_PASSWORD, 12);

  for (const { email, name } of AI_INTERVIEW_TEST_USERS) {
    const normalized = email.trim().toLowerCase();
    await seedOne(prisma, hash, normalized, name);
  }

  console.log("\n--- AI Interview Test Users ---");
  console.log("  Password (all): " + TEST_PASSWORD);
  console.log("  Login at: /auth (select Job Seeker, then Sign In)");
  for (const { email } of AI_INTERVIEW_TEST_USERS) {
    console.log("  Email:    " + email.trim().toLowerCase());
  }
  console.log("  After login, go to Verification Pipeline — AI Expert Interview is the next step.\n");
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
