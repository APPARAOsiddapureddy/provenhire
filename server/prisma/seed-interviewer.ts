/**
 * Seed one test expert interviewer for development/testing.
 * Run: npx tsx prisma/seed-interviewer.ts
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcrypt";

const TEST_EMAIL = "qa.expert.apr2026@test.provenhire.com";
const TEST_PASSWORD = "PhE2E_Apr2026!x7";
const TEST_NAME = "QA Expert Interviewer Apr2026";

async function main() {
  const prisma = new PrismaClient();
  const hash = await bcrypt.hash(TEST_PASSWORD, 12);

  let user = await prisma.user.findUnique({ where: { email: TEST_EMAIL } });
  if (!user) {
    user = await prisma.user.create({
      data: {
        email: TEST_EMAIL,
        name: TEST_NAME,
        passwordHash: hash,
        role: "expert_interviewer",
        emailVerified: true,
        authProvider: "EMAIL",
      },
    });
    console.log("Created test interviewer user.");
  } else {
    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash: hash,
        role: "expert_interviewer",
        emailVerified: true,
        name: TEST_NAME,
        authProvider: "EMAIL",
      },
    });
    console.log("Updated test interviewer user.");
  }

  await prisma.interviewer.upsert({
    where: { userId: user.id },
    create: {
      userId: user.id,
      name: TEST_NAME,
      track: "technical",
      domains: ["DSA / Algorithms", "Full Stack Development"],
      experienceYears: 5,
      status: "active",
      profileCompleted: true,
    },
    update: {
      name: TEST_NAME,
      track: "technical",
      domains: ["DSA / Algorithms", "Full Stack Development"],
      experienceYears: 5,
      status: "active",
      profileCompleted: true,
    },
  });

  console.log("\n Test expert interviewer credentials ");
  console.log(`  Email:    ${TEST_EMAIL}`);
  console.log(`  Password: ${TEST_PASSWORD}`);
  console.log(`  Login at: /auth`);
  console.log("  After login you are redirected to /dashboard/expert\n");
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
