/**
 * Orchestrates common seeds for `npx prisma db seed` (from server directory).
 */
import { execSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

for (const cmd of [
  "npm run seed:dsa",
  "npm run seed:data-round",
  "npm run seed:skill-verifications",
]) {
  console.log(`\n> ${cmd}`);
  execSync(cmd, { cwd: root, stdio: "inherit", env: process.env });
}

console.log("\nprisma db seed finished");
