/**
 * Seed one test interviewer for development/testing.
 * Run: npx tsx prisma/seed-interviewer.ts
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcrypt";

const TEST_EMAIL = "interviewer@test.provenhire.com";
const TEST_PASSWORD = "Test123456";
const TEST_NAME = "Test Interviewer";

async function main() {
  const prisma = new PrismaClient();
  const existing = await prisma.user.findUnique({ where: { email: TEST_EMAIL } });
  if (existing) {
    const inv = await prisma.interviewer.findFirst({ where: { userId: existing.id } });
    if (inv) {
      console.log("Test interviewer already exists.");
      console.log(`  Email: ${TEST_EMAIL}`);
      console.log(`  Password: ${TEST_PASSWORD}`);
      console.log(`  Login at /auth`);
      await prisma.$disconnect();
      return;
    }
  }

  let userId: string;
  if (existing) {
    userId = existing.id;
    console.log("User exists, linking Interviewer profile...");
  } else {
    const hash = await bcrypt.hash(TEST_PASSWORD, 12);
    const user = await prisma.user.create({
      data: {
        email: TEST_EMAIL,
        name: TEST_NAME,
        passwordHash: hash,
        role: "expert_interviewer",
      },
    });
    userId = user.id;
    console.log("Created test user.");
  }

  await prisma.interviewer.upsert({
    where: { userId },
    create: {
      userId,
      name: TEST_NAME,
      track: "technical",
      domains: ["DSA / Algorithms", "Full Stack Development"],
      experienceYears: 5,
      status: "active",
    },
    update: {
      name: TEST_NAME,
      track: "technical",
      domains: ["DSA / Algorithms", "Full Stack Development"],
      experienceYears: 5,
      status: "active",
    },
  });

  console.log("\n--- Test Interviewer Credentials ---");
  console.log(`  Email:    ${TEST_EMAIL}`);
  console.log(`  Password: ${TEST_PASSWORD}`);
  console.log(`  Login at: /auth`);
  console.log("  After login you'll be redirected to /dashboard/expert\n");
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
