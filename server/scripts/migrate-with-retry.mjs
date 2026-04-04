/**
 * Runs `prisma migrate deploy` with retries for Render / cloud Postgres
 * (cold start, DNS, or brief network blips during deploy).
 */
import { spawnSync } from "node:child_process";
import { setTimeout } from "node:timers/promises";

const maxAttempts = Number(process.env.PRISMA_MIGRATE_MAX_ATTEMPTS || 15);
const delayMs = Number(process.env.PRISMA_MIGRATE_RETRY_MS || 5000);

if (!process.env.DATABASE_URL?.trim()) {
  console.error("[migrate] DATABASE_URL is missing. Set it in Render → Web Service → Environment.");
  process.exit(1);
}

function runMigrate() {
  const r = spawnSync("npx", ["prisma", "migrate", "deploy"], {
    stdio: "inherit",
    env: process.env,
    shell: process.platform === "win32",
  });
  return r.status ?? 1;
}

for (let i = 0; i < maxAttempts; i++) {
  const code = runMigrate();
  if (code === 0) process.exit(0);

  if (i < maxAttempts - 1) {
    console.warn(
      `[migrate] attempt ${i + 1}/${maxAttempts} failed (code ${code}). Retrying in ${delayMs}ms…`
    );
    console.warn(
      "[migrate] If this persists: use the External Database URL from Render Postgres (full hostname, ends in .render.com) and add ?sslmode=require"
    );
    await setTimeout(delayMs);
  }
}

console.error("[migrate] giving up after", maxAttempts, "attempts. Check DATABASE_URL and that Postgres is running (not suspended).");
process.exit(1);
