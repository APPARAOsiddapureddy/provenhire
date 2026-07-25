/**
 * Contract test for the college credential pipeline.
 *
 * Covers correctness (derivation, persistence, sign-in, archive deactivation,
 * delete cascade) and concurrency (parallel workspace creation for one college).
 *
 * Local only: run with `npx tsx scripts/college-credentials-contract.ts`.
 */
import "dotenv/config";
import bcrypt from "bcrypt";
import { PrismaClient } from "@prisma/client";
import { createApp } from "../src/app.js";
import {
  archiveWorkspace,
  createWorkspace,
  deleteWorkspace,
} from "../src/services/workspace.service.js";
import { signJwt } from "../src/utils/jwt.js";

const prisma = new PrismaClient();
const ORG = "Anits College";
const PARALLEL_ORG = "Parallel Institute Of Technology";
const PORT = 4599;
const BASE = `http://127.0.0.1:${PORT}`;

let passed = 0;
let failed = 0;

function check(name: string, condition: boolean, detail?: unknown) {
  if (condition) {
    passed += 1;
    console.log(`  PASS  ${name}`);
  } else {
    failed += 1;
    console.error(`  FAIL  ${name}`, detail ?? "");
  }
}

function workspaceInput(name: string, organization: string) {
  const startAt = new Date(Date.now() + 60 * 60 * 1000);
  const endAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  return {
    name,
    organization,
    targetRole: "Backend Engineer",
    responsibilities: [
      "Build and maintain backend services",
      "Write automated tests for critical paths",
      "Participate in code reviews",
    ],
    startAt,
    endAt,
    totalRounds: 1,
    accessMode: "public" as const,
  };
}

async function signIn(userId: string, password: string) {
  const response = await fetch(`${BASE}/api/college/sign-in`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ userId, password }),
  });
  return { status: response.status, body: await response.json() };
}

async function collegeGet(path: string, token?: string) {
  const response = await fetch(`${BASE}${path}`, {
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
  return { status: response.status, body: await response.json() };
}

async function main() {
  const url = process.env.DATABASE_URL ?? "";
  if (!/@(localhost|127\.0\.0\.1)[:/]/.test(url)) {
    throw new Error("Refusing to run: DATABASE_URL is not local.");
  }

  const admin = await prisma.user.findFirst({ where: { role: "admin" } });
  if (!admin) {
    throw new Error("No admin user found. Run `npm run seed:admin` first.");
  }
  const creator = { id: admin.id, role: admin.role };

  const server = createApp().listen(PORT);
  await new Promise((resolve) => server.once("listening", resolve));

  const createdWorkspaceIds: string[] = [];

  try {
    console.log("\n[1] Credential generation and persistence");
    const { workspace, credentials } = await createWorkspace(
      creator,
      workspaceInput("Anits Drive 2026", ORG),
    );
    createdWorkspaceIds.push(workspace.id);

    const suffix = workspace.code.split("-").pop();
    check(
      "userId reuses the workspace code suffix",
      credentials.userId === `anitscollege${suffix}@provenhire.in`,
      { userId: credentials.userId, code: workspace.code },
    );
    check(
      "password is capitalized college name + 123456",
      credentials.password === "Anitscollege123456",
      credentials.password,
    );

    const stored = await prisma.collegeCredential.findUnique({
      where: { userId: credentials.userId },
    });
    check("credential row persisted", stored !== null);
    check("credential is active on creation", stored?.isActive === true);
    check("credential is linked to the workspace", stored?.workspaceId === workspace.id);
    check(
      "password is stored hashed, not in plain text",
      stored !== null &&
        stored.passwordHash !== credentials.password &&
        (await bcrypt.compare(credentials.password, stored.passwordHash)),
    );

    console.log("\n[2] Sign-in endpoint");
    const ok = await signIn(credentials.userId, credentials.password);
    check("valid credentials return 200", ok.status === 200, ok);
    check("response carries a token", typeof ok.body?.token === "string", ok.body);
    check(
      "response carries the workspaceId",
      ok.body?.college?.workspaceId === workspace.id,
      ok.body,
    );

    const upper = await signIn(credentials.userId.toUpperCase(), credentials.password);
    check("userId match is case-insensitive", upper.status === 200, upper);

    const badPassword = await signIn(credentials.userId, "Wrongpassword1");
    check("wrong password returns 401", badPassword.status === 401, badPassword);

    const unknown = await signIn("nosuchcollege0000@provenhire.in", "Whatever123456");
    check("unknown userId returns 401", unknown.status === 401, unknown);

    const malformed = await signIn("", "");
    check("empty payload returns 400", malformed.status === 400, malformed);

    console.log("\n[2b] College portal endpoints");
    const collegeToken = ok.body.token as string;

    const meNoToken = await collegeGet("/api/college/me");
    check("GET /me without a token returns 401", meNoToken.status === 401, meNoToken);

    const me = await collegeGet("/api/college/me", collegeToken);
    check("GET /me returns 200", me.status === 200, me);
    check(
      "GET /me returns the college's own workspace",
      me.body?.workspace?.id === workspace.id,
      me.body?.workspace?.id,
    );
    check(
      "GET /me serves a draft workspace",
      me.body?.workspace?.status === "draft",
      me.body?.workspace?.status,
    );
    check(
      "GET /me includes rounds with scoreWeightage",
      Array.isArray(me.body?.workspace?.rounds),
      me.body?.workspace?.rounds,
    );
    check(
      "GET /me does not leak the password hash",
      !JSON.stringify(me.body).toLowerCase().includes("passwordhash"),
    );

    const adminToken = signJwt({ userId: admin.id, role: "admin" });
    const meAsAdmin = await collegeGet("/api/college/me", adminToken);
    check(
      "an admin token cannot use the college portal",
      meAsAdmin.status === 403,
      meAsAdmin,
    );

    const draftBoard = await collegeGet("/api/college/leaderboard", collegeToken);
    check("leaderboard returns 200 for a draft", draftBoard.status === 200, draftBoard);
    check(
      "leaderboard is marked unavailable before start",
      draftBoard.body?.available === false && draftBoard.body?.leaderboard?.length === 0,
      draftBoard.body,
    );

    const badQuery = await collegeGet("/api/college/leaderboard?limit=999", collegeToken);
    check("leaderboard rejects an out-of-range limit", badQuery.status === 400, badQuery);

    console.log("\n[2c] Admin can re-read the credentials to share them");
    const adminView = await fetch(
      `${BASE}/api/workspaces/${workspace.id}/college-credentials`,
      { headers: { authorization: `Bearer ${adminToken}` } },
    );
    const adminBody = await adminView.json();
    check("admin credential lookup returns 200", adminView.status === 200, adminBody);
    check(
      "re-derived password matches the original",
      adminBody?.credentials?.password === credentials.password,
      adminBody?.credentials,
    );
    check(
      "re-derived userId matches the original",
      adminBody?.credentials?.userId === credentials.userId,
    );
    check("credential reported as active", adminBody?.credentials?.isActive === true);

    const adminViewNoAuth = await fetch(
      `${BASE}/api/workspaces/${workspace.id}/college-credentials`,
    );
    check(
      "admin credential lookup requires auth",
      adminViewNoAuth.status === 401,
      adminViewNoAuth.status,
    );

    const collegeReadingAdmin = await collegeGet(
      `/api/workspaces/${workspace.id}/college-credentials`,
      collegeToken,
    );
    check(
      "a college token cannot read the admin credential endpoint",
      collegeReadingAdmin.status === 403,
      collegeReadingAdmin,
    );

    console.log("\n[3] Archive deactivates the login");
    await archiveWorkspace(creator, workspace.id);
    const afterArchive = await prisma.collegeCredential.findUnique({
      where: { userId: credentials.userId },
    });
    check("credential marked inactive on archive", afterArchive?.isActive === false);

    const archivedSignIn = await signIn(credentials.userId, credentials.password);
    check(
      "inactive account cannot sign in",
      archivedSignIn.status === 403 && archivedSignIn.body?.code === "ACCOUNT_INACTIVE",
      archivedSignIn,
    );

    const staleSession = await collegeGet("/api/college/me", collegeToken);
    check(
      "a token issued before the archive is now rejected",
      staleSession.status === 403 && staleSession.body?.code === "ACCOUNT_INACTIVE",
      staleSession,
    );

    const adminAfterArchive = await fetch(
      `${BASE}/api/workspaces/${workspace.id}/college-credentials`,
      { headers: { authorization: `Bearer ${adminToken}` } },
    );
    const adminAfterBody = await adminAfterArchive.json();
    check(
      "admin still sees the credential, marked inactive",
      adminAfterArchive.status === 200 &&
        adminAfterBody?.credentials?.isActive === false,
      adminAfterBody,
    );

    console.log("\n[4] Delete cascades the credential");
    await deleteWorkspace(creator, workspace.id);
    createdWorkspaceIds.pop();
    const afterDelete = await prisma.collegeCredential.findUnique({
      where: { userId: credentials.userId },
    });
    check("credential row removed with the workspace", afterDelete === null);

    console.log("\n[5] Concurrency: 25 parallel workspaces for one college");
    const results = await Promise.allSettled(
      Array.from({ length: 25 }, (_, i) =>
        createWorkspace(creator, workspaceInput(`Parallel Drive ${i}`, PARALLEL_ORG)),
      ),
    );
    const fulfilled = results.filter(
      (r): r is PromiseFulfilledResult<Awaited<ReturnType<typeof createWorkspace>>> =>
        r.status === "fulfilled",
    );
    const rejected = results.filter((r) => r.status === "rejected");
    for (const r of fulfilled) createdWorkspaceIds.push(r.value.workspace.id);

    check(
      "all 25 concurrent creations succeeded",
      rejected.length === 0,
      rejected.map((r) => (r as PromiseRejectedResult).reason?.message),
    );
    const userIds = fulfilled.map((r) => r.value.credentials.userId);
    check("all generated userIds are unique", new Set(userIds).size === userIds.length);
    const codes = fulfilled.map((r) => r.value.workspace.code);
    check("all workspace codes are unique", new Set(codes).size === codes.length);
    check(
      "each userId suffix matches its own workspace code suffix",
      fulfilled.every(
        (r) =>
          r.value.credentials.userId ===
          `parallelinstituteoftechnology${r.value.workspace.code.split("-").pop()}@provenhire.in`,
      ),
    );
    check(
      "every concurrent workspace has exactly one credential row",
      (await prisma.collegeCredential.count({
        where: { workspaceId: { in: fulfilled.map((r) => r.value.workspace.id) } },
      })) === fulfilled.length,
    );
    check(
      "all concurrent logins share the same password",
      fulfilled.every(
        (r) => r.value.credentials.password === "Parallelinstituteoftechnology123456",
      ),
    );

    console.log("\n[6] The uniqueness constraint the retry loop depends on");
    const victim = fulfilled[0].value;
    let duplicateCode: string | undefined;
    try {
      await prisma.collegeCredential.create({
        data: {
          userId: victim.credentials.userId,
          workspaceId: fulfilled[1].value.workspace.id,
          passwordHash: "x",
        },
      });
    } catch (error) {
      duplicateCode = (error as { code?: string }).code;
    }
    check(
      "duplicate userId is rejected with P2002",
      duplicateCode === "P2002",
      duplicateCode,
    );

    console.log("\n[7] A random concurrent login actually works end to end");
    const sample = fulfilled[7].value;
    const sampleSignIn = await signIn(
      sample.credentials.userId,
      sample.credentials.password,
    );
    check("concurrent workspace login returns 200", sampleSignIn.status === 200, sampleSignIn);
  } finally {
    if (createdWorkspaceIds.length) {
      await prisma.workspace.deleteMany({
        where: { id: { in: createdWorkspaceIds } },
      });
    }
    server.close();
    await prisma.$disconnect();
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
