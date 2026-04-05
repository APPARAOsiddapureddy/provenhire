/**
 * Seed one verified test recruiter (job posting / dashboard QA).
 * Run: cd server && npx tsx prisma/seed-recruiter.ts
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcrypt";

const TEST_EMAIL = "qa.recruiter.apr2026@test.provenhire.com";
const TEST_PASSWORD = "PhE2E_Apr2026!x7";
const TEST_NAME = "QA Recruiter Apr2026";

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
        role: "recruiter",
        emailVerified: true,
        authProvider: "EMAIL",
      },
    });
    console.log("Created test recruiter user.");
  } else {
    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash: hash,
        role: "recruiter",
        emailVerified: true,
        name: TEST_NAME,
        authProvider: "EMAIL",
      },
    });
    console.log("Updated test recruiter user.");
  }

  const profile = await prisma.recruiterProfile.upsert({
    where: { userId: user.id },
    create: {
      userId: user.id,
      companyName: "ProvenHire QA Co",
      companySize: "51-200",
      fullName: TEST_NAME,
      workEmail: TEST_EMAIL,
      onboardingCompleted: true,
      verificationStatus: "verified",
      emailDomainVerified: true,
      verifiedAt: new Date(),
    },
    update: {
      companyName: "ProvenHire QA Co",
      companySize: "51-200",
      fullName: TEST_NAME,
      workEmail: TEST_EMAIL,
      onboardingCompleted: true,
      verificationStatus: "verified",
      emailDomainVerified: true,
      verifiedAt: new Date(),
    },
  });

  await prisma.recruiterUsage.upsert({
    where: { recruiterId: profile.id },
    create: { recruiterId: profile.id },
    update: {},
  });

  console.log("\n Test recruiter credentials ");
  console.log(`  Email:    ${TEST_EMAIL}`);
  console.log(`  Password: ${TEST_PASSWORD}`);
  console.log(`  Login at: /auth (Recruiter)`);
  console.log("");
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
