/**
 * Seed one test admin for development/testing.
 * Run: npx tsx prisma/seed-admin.ts
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcrypt";

const TEST_EMAIL = "admin@test.provenhire.com";
const TEST_PASSWORD = "Admin123456";
const TEST_NAME = "Test Admin";

async function main() {
  const prisma = new PrismaClient();
  const existing = await prisma.user.findUnique({ where: { email: TEST_EMAIL } });
  if (existing) {
    if (existing.role === "admin") {
      console.log("Test admin already exists.");
      console.log(`  Email: ${TEST_EMAIL}`);
      console.log(`  Password: ${TEST_PASSWORD}`);
      console.log(`  Login at: /admin`);
      await prisma.$disconnect();
      return;
    }
    // Promote existing user to admin
    await prisma.user.update({
      where: { id: existing.id },
      data: { role: "admin" },
    });
    console.log("Promoted existing user to admin.");
  } else {
    const hash = await bcrypt.hash(TEST_PASSWORD, 12);
    await prisma.user.create({
      data: {
        email: TEST_EMAIL,
        name: TEST_NAME,
        passwordHash: hash,
        role: "admin",
      },
    });
    console.log("Created test admin user.");
  }

  console.log("\n--- Test Admin Credentials ---");
  console.log(`  Email:    ${TEST_EMAIL}`);
  console.log(`  Password: ${TEST_PASSWORD}`);
  console.log(`  Login at: /admin`);
  console.log("  After login you'll be redirected to /admin/dashboard\n");
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
