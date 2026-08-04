/**
 * Smoke test for every /api/workspaces route plus the college portal flow.
 *
 * Verifies the routes still respond as expected after the merge, and walks the exact
 * flow: create -> credentials visible -> college signs in -> archive blocks sign-in.
 *
 * Local only: `npx tsx scripts/workspace-routes-smoke.ts`
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { createApp } from "../src/app.js";
import { signJwt } from "../src/utils/jwt.js";

const prisma = new PrismaClient();
const PORT = 4601;
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

let adminToken = "";

async function call(
  method: string,
  path: string,
  body?: unknown,
  token = adminToken,
) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const text = await res.text();
  let parsed: any = {};
  try {
    parsed = text ? JSON.parse(text) : {};
  } catch {
    parsed = { raw: text.slice(0, 200) };
  }
  return { status: res.status, body: parsed };
}

/** Routes must not be missing (404 from the router) or crashing (5xx). */
function routeAlive(name: string, result: { status: number; body: unknown }) {
  const dead =
    result.status >= 500 ||
    (result.status === 404 && (result.body as any)?.error === "Route not found");
  check(name, !dead, result);
}

function workspaceInput(name: string, organization: string) {
  return {
    name,
    organization,
    targetRole: "Backend Engineer",
    responsibilities: [
      "Build and maintain backend services",
      "Write automated tests for critical paths",
      "Participate in code reviews",
    ],
    startAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    endAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    totalRounds: 1,
    accessMode: "public",
  };
}

const ROUNDS = {
  rounds: [
    {
      order: 1,
      name: "Aptitude",
      type: "mcq",
      questionType: "random",
      questionCount: 10,
      timeLimitMins: 30,
      scoreWeightage: 100,
      easyCount: 4,
      mediumCount: 3,
      hardCount: 3,
    },
  ],
};

async function main() {
  if (!/@(localhost|127\.0\.0\.1)[:/]/.test(process.env.DATABASE_URL ?? "")) {
    throw new Error("Refusing to run: DATABASE_URL is not local.");
  }
  const admin = await prisma.user.findFirst({ where: { role: "admin" } });
  if (!admin) throw new Error("No admin user. Run `npm run seed:admin`.");
  adminToken = signJwt({ userId: admin.id, role: admin.role });

  const server = createApp().listen(PORT);
  await new Promise((resolve) => server.once("listening", resolve));

  const cleanup: string[] = [];
  const userCleanup: string[] = [];

  try {
    console.log("\n[A] Collection routes");
    const list = await call("GET", "/api/workspaces?page=1&limit=5");
    check("GET /api/workspaces returns 200", list.status === 200, list.status);
    check(
      "list response keeps its shape",
      Array.isArray(list.body?.workspaces) && !!list.body?.pagination,
      list.body,
    );

    const sqlBank = await call("GET", "/api/workspaces/question-bank/sql");
    check("GET /question-bank/sql returns 200", sqlBank.status === 200, sqlBank);
    check(
      "sql availability keeps its shape",
      typeof sqlBank.body?.availability?.total === "number" &&
        !!sqlBank.body?.availability?.byDifficulty,
      sqlBank.body,
    );

    const unauth = await call("GET", "/api/workspaces", undefined, "");
    check("workspaces require auth", unauth.status === 401, unauth.status);

    console.log("\n[B] Create -> credentials visible in workspace details");
    const created = await call(
      "POST",
      "/api/workspaces",
      workspaceInput("Route Smoke Drive", "Route Smoke College"),
    );
    check("POST /api/workspaces returns 201", created.status === 201, created);
    const ws = created.body?.workspace;
    check("create still returns the workspace", !!ws?.id, created.body);
    check(
      "create also returns credentials",
      !!created.body?.credentials?.userId && !!created.body?.credentials?.password,
      created.body?.credentials,
    );
    if (ws?.id) cleanup.push(ws.id);

    const detail = await call("GET", `/api/workspaces/${ws.id}`);
    check("GET /api/workspaces/:id returns 200", detail.status === 200, detail.status);

    const creds = await call("GET", `/api/workspaces/${ws.id}/college-credentials`);
    check("GET /:id/college-credentials returns 200", creds.status === 200, creds);
    check(
      "credentials shown on details match the ones issued at creation",
      creds.body?.credentials?.userId === created.body?.credentials?.userId &&
        creds.body?.credentials?.password === created.body?.credentials?.password,
      creds.body,
    );
    check("credential is active", creds.body?.credentials?.isActive === true);

    console.log("\n[C] Per-workspace routes still respond");
    routeAlive(
      "PATCH /:id",
      await call("PATCH", `/api/workspaces/${ws.id}`, { name: "Route Smoke Drive v2" }),
    );
    const roundsRes = await call("PUT", `/api/workspaces/${ws.id}/rounds`, ROUNDS);
    check("PUT /:id/rounds returns 200", roundsRes.status === 200, roundsRes);
    routeAlive("GET /:id/registrations", await call("GET", `/api/workspaces/${ws.id}/registrations`));
    routeAlive("GET /:id/allowed-emails", await call("GET", `/api/workspaces/${ws.id}/allowed-emails`));
    routeAlive("GET /:id/audit-trail", await call("GET", `/api/workspaces/${ws.id}/audit-trail`));
    routeAlive("GET /:id/analytics", await call("GET", `/api/workspaces/${ws.id}/analytics`));
    routeAlive("GET /:id/members", await call("GET", `/api/workspaces/${ws.id}/members`));
    routeAlive("GET /:id/technical-desk", await call("GET", `/api/workspaces/${ws.id}/technical-desk`));

    console.log("\n[D] College signs in, sees details and leaderboard");
    const login = await call(
      "POST",
      "/api/college/sign-in",
      {
        userId: created.body.credentials.userId,
        password: created.body.credentials.password,
      },
      "",
    );
    check("college sign-in returns 200", login.status === 200, login);
    const collegeToken = login.body?.token;

    const me = await call("GET", "/api/college/me", undefined, collegeToken);
    check("college sees workspace details", me.status === 200, me.status);
    check(
      "details include rounds with weightage",
      me.body?.workspace?.rounds?.[0]?.scoreWeightage === 100,
      me.body?.workspace?.rounds,
    );

    const board = await call("GET", "/api/college/leaderboard", undefined, collegeToken);
    check("college leaderboard responds", board.status === 200, board);

    console.log("\n[D2] Joined-users tab: list, search, remove, restore");
    // Two candidates in this workspace, plus one in a second workspace to prove isolation.
    const otherWs = await call(
      "POST",
      "/api/workspaces",
      workspaceInput("Other Drive", "Other College"),
    );
    cleanup.push(otherWs.body?.workspace?.id);

    const candidates = await Promise.all(
      ["alice.smoke", "bob.smoke", "carol.smoke"].map((handle, index) =>
        prisma.user.create({
          data: {
            email: `${handle}.${Date.now()}@example.com`,
            name: index === 0 ? "Alice Smoke" : index === 1 ? "Bob Smoke" : "Carol Other",
            passwordHash: "x",
            role: "jobseeker",
          },
        }),
      ),
    );
    userCleanup.push(...candidates.map((candidate) => candidate.id));
    await prisma.workspaceRegistration.createMany({
      data: [
        { workspaceId: ws.id, userId: candidates[0].id },
        { workspaceId: ws.id, userId: candidates[1].id },
        { workspaceId: otherWs.body.workspace.id, userId: candidates[2].id },
      ],
    });

    const listed = await call("GET", "/api/college/registrations", undefined, collegeToken);
    check("GET /api/college/registrations returns 200", listed.status === 200, listed);
    check(
      "lists only this workspace's candidates",
      listed.body?.registrations?.length === 2 &&
        !listed.body.registrations.some((r: any) => r.userId === candidates[2].id),
      listed.body?.registrations,
    );

    const searched = await call(
      "GET",
      "/api/college/registrations?q=alice",
      undefined,
      collegeToken,
    );
    check(
      "search filters by name",
      searched.body?.registrations?.length === 1 &&
        searched.body.registrations[0].userId === candidates[0].id,
      searched.body?.registrations,
    );

    const searchedEmail = await call(
      "GET",
      `/api/college/registrations?q=${encodeURIComponent(candidates[1].email)}`,
      undefined,
      collegeToken,
    );
    check(
      "search filters by email",
      searchedEmail.body?.registrations?.length === 1,
      searchedEmail.body?.registrations,
    );

    const crossDelete = await call(
      "DELETE",
      `/api/college/registrations/${candidates[2].id}`,
      undefined,
      collegeToken,
    );
    check(
      "cannot remove a candidate from another workspace",
      crossDelete.status === 404,
      crossDelete,
    );
    check(
      "the other workspace's registration is untouched",
      (
        await prisma.workspaceRegistration.findUnique({
          where: {
            workspaceId_userId: {
              workspaceId: otherWs.body.workspace.id,
              userId: candidates[2].id,
            },
          },
        })
      )?.status === "registered",
    );

    const removed = await call(
      "DELETE",
      `/api/college/registrations/${candidates[0].id}`,
      undefined,
      collegeToken,
    );
    check("DELETE own candidate returns 200", removed.status === 200, removed);
    const removedRow = await prisma.workspaceRegistration.findUnique({
      where: { workspaceId_userId: { workspaceId: ws.id, userId: candidates[0].id } },
    });
    check("removal is soft (row kept, status removed)", removedRow?.status === "removed");
    check(
      "removedByUserId stays null for a college actor",
      removedRow?.removedByUserId === null,
      removedRow?.removedByUserId,
    );
    const removalAudit = await prisma.workspaceAuditEvent.findFirst({
      where: { workspaceId: ws.id, eventType: "registration.removed" },
    });
    check(
      "audit records the college as the actor",
      (removalAudit?.detail as any)?.actor?.type === "college",
      removalAudit?.detail,
    );

    const restored = await call(
      "POST",
      `/api/college/registrations/${candidates[0].id}/restore`,
      {},
      collegeToken,
    );
    check("POST restore returns 200", restored.status === 200, restored);
    const restoredRow = await prisma.workspaceRegistration.findUnique({
      where: { workspaceId_userId: { workspaceId: ws.id, userId: candidates[0].id } },
    });
    check("restore flips status back", restoredRow?.status === "registered");
    check(
      "restoredByUserId stays null for a college actor",
      restoredRow?.restoredByUserId === null,
    );

    const crossRestore = await call(
      "POST",
      `/api/college/registrations/${candidates[2].id}/restore`,
      {},
      collegeToken,
    );
    check(
      "cannot restore a candidate from another workspace",
      crossRestore.status === 404,
      crossRestore,
    );

    const noToken = await call("GET", "/api/college/registrations", undefined, "");
    check("registrations require a college token", noToken.status === 401, noToken.status);
    const asAdmin = await call("GET", "/api/college/registrations", undefined, adminToken);
    check("an admin token cannot use it", asAdmin.status === 403, asAdmin.status);

    console.log("\n[D3] Very Easy difficulty tier (coding rounds only)");
    const veWs = await call(
      "POST",
      "/api/workspaces",
      workspaceInput("Very Easy Drive", "Very Easy College"),
    );
    const veWsId = veWs.body?.workspace?.id;
    cleanup.push(veWsId);

    const codingRound = {
      rounds: [
        {
          order: 1,
          name: "Coding",
          type: "coding",
          questionType: "random",
          questionCount: 10,
          timeLimitMins: 45,
          scoreWeightage: 100,
          veryEasyCount: 4,
          easyCount: 3,
          mediumCount: 2,
          hardCount: 1,
        },
      ],
    };
    const savedCoding = await call(
      "PUT",
      `/api/workspaces/${veWsId}/rounds`,
      codingRound,
    );
    check(
      "a coding round accepts veryEasyCount",
      savedCoding.status === 200,
      savedCoding,
    );
    check(
      "veryEasyCount is persisted and read back",
      savedCoding.body?.rounds?.[0]?.veryEasyCount === 4,
      savedCoding.body?.rounds?.[0],
    );

    const badTotal = await call("PUT", `/api/workspaces/${veWsId}/rounds`, {
      rounds: [{ ...codingRound.rounds[0], veryEasyCount: 5 }],
    });
    check(
      "the difficulty total now counts Very Easy",
      badTotal.status === 400,
      badTotal,
    );

    const veOnMcq = await call("PUT", `/api/workspaces/${veWsId}/rounds`, {
      rounds: [
        {
          ...ROUNDS.rounds[0],
          questionCount: 12,
          veryEasyCount: 2,
        },
      ],
    });
    check(
      "Very Easy is rejected on a non-coding round",
      veOnMcq.status === 400,
      veOnMcq,
    );

    const legacyRound = await call(
      "PUT",
      `/api/workspaces/${veWsId}/rounds`,
      ROUNDS,
    );
    check(
      "a round without veryEasyCount still saves (defaults to 0)",
      legacyRound.status === 200 &&
        legacyRound.body?.rounds?.[0]?.veryEasyCount === 0,
      legacyRound.body?.rounds?.[0],
    );

    const vePool = await prisma.dsaQuestion.count({
      where: { difficulty: "Very Easy" },
    });
    check(
      "the Very Easy DSA pool is seeded and matches the selector's literal",
      vePool > 0,
      vePool,
    );

    console.log("\n[E] Publish -> start -> end -> archive");
    const publish = await call("POST", `/api/workspaces/${ws.id}/publish`, {});
    check("POST /:id/publish returns 200", publish.status === 200, publish);

    const liveBoard = await call("GET", "/api/college/leaderboard", undefined, collegeToken);
    check(
      "leaderboard becomes available once published",
      liveBoard.body?.available === true,
      liveBoard.body,
    );

    const deletePublished = await call("DELETE", `/api/workspaces/${ws.id}`);
    check(
      "a published workspace still cannot be deleted",
      deletePublished.status === 409,
      deletePublished,
    );

    console.log("\n[E2] The college can start and end its own workspace");
    const collegeStart = await call(
      "POST",
      "/api/college/workspace/start",
      {},
      collegeToken,
    );
    check("college start returns 200", collegeStart.status === 200, collegeStart);
    check(
      "workspace is now started",
      collegeStart.body?.workspace?.status === "started",
      collegeStart.body?.workspace?.status,
    );
    const startAudit = await prisma.workspaceAuditEvent.findFirst({
      where: { workspaceId: ws.id, eventType: "workspace.started" },
    });
    check(
      "start audit records the college with a null actorUserId",
      startAudit?.actorUserId === null &&
        (startAudit?.detail as any)?.actor?.type === "college",
      { actorUserId: startAudit?.actorUserId, detail: startAudit?.detail },
    );

    const doubleStart = await call(
      "POST",
      "/api/college/workspace/start",
      {},
      collegeToken,
    );
    check("starting twice is a no-op, not an error", doubleStart.status === 200, doubleStart);

    const collegeEnd = await call(
      "POST",
      "/api/college/workspace/end",
      {},
      collegeToken,
    );
    check("college end returns 200", collegeEnd.status === 200, collegeEnd);
    check(
      "workspace is now ended",
      collegeEnd.body?.workspace?.status === "ended",
      collegeEnd.body?.workspace?.status,
    );
    const endAudit = await prisma.workspaceAuditEvent.findFirst({
      where: { workspaceId: ws.id, eventType: "workspace.ended" },
    });
    check(
      "end audit records the college with a null actorUserId",
      endAudit?.actorUserId === null &&
        (endAudit?.detail as any)?.actor?.type === "college",
      { actorUserId: endAudit?.actorUserId, detail: endAudit?.detail },
    );

    const endAgain = await call("POST", "/api/college/workspace/end", {}, collegeToken);
    check("ending twice is a no-op", endAgain.status === 200, endAgain);

    const startAfterEnd = await call(
      "POST",
      "/api/college/workspace/start",
      {},
      collegeToken,
    );
    check(
      "an ended workspace cannot be restarted",
      startAfterEnd.status === 409,
      startAfterEnd,
    );

    const lifecycleNoToken = await call("POST", "/api/college/workspace/start", {}, "");
    check(
      "lifecycle routes require a college token",
      lifecycleNoToken.status === 401,
      lifecycleNoToken.status,
    );
    const lifecycleAsAdmin = await call(
      "POST",
      "/api/college/workspace/start",
      {},
      adminToken,
    );
    check(
      "an admin token cannot use the college lifecycle routes",
      lifecycleAsAdmin.status === 403,
      lifecycleAsAdmin.status,
    );

    // Admin start/end must still behave exactly as before the refactor.
    console.log("\n[E3] Admin start/end still works after the refactor");
    const adminWs = await call(
      "POST",
      "/api/workspaces",
      workspaceInput("Admin Lifecycle Drive", "Admin Lifecycle College"),
    );
    const adminWsId = adminWs.body?.workspace?.id;
    cleanup.push(adminWsId);
    await call("PUT", `/api/workspaces/${adminWsId}/rounds`, ROUNDS);
    await call("POST", `/api/workspaces/${adminWsId}/publish`, {});
    const start = await call("POST", `/api/workspaces/${adminWsId}/start`, {});
    check("POST /:id/start returns 200", start.status === 200, start);
    check(
      "admin start records the admin as actor",
      (
        await prisma.workspaceAuditEvent.findFirst({
          where: { workspaceId: adminWsId, eventType: "workspace.started" },
        })
      )?.actorUserId === admin.id,
    );
    // Checked here because adminWs is the workspace that is currently started.
    const archiveWhileStarted = await call(
      "PATCH",
      `/api/workspaces/${adminWsId}/status`,
      { status: "archived" },
    );
    check(
      "archiving a started workspace is refused",
      archiveWhileStarted.status === 409,
      archiveWhileStarted,
    );

    const adminEnd = await call("POST", `/api/workspaces/${adminWsId}/end`, {});
    check("admin end returns 200", adminEnd.status === 200, adminEnd);
    check(
      "admin end records the admin as actor",
      (
        await prisma.workspaceAuditEvent.findFirst({
          where: { workspaceId: adminWsId, eventType: "workspace.ended" },
        })
      )?.actorUserId === admin.id,
    );

    const stillWorks = await call("GET", "/api/college/me", undefined, collegeToken);
    check("college login still works after end", stillWorks.status === 200, stillWorks.status);

    const archive = await call("PATCH", `/api/workspaces/${ws.id}/status`, {
      status: "archived",
    });
    check("PATCH /:id/status archives", archive.status === 200, archive);

    console.log("\n[F] Archived credentials cannot sign in");
    const reLogin = await call(
      "POST",
      "/api/college/sign-in",
      {
        userId: created.body.credentials.userId,
        password: created.body.credentials.password,
      },
      "",
    );
    check(
      "archived credentials are rejected at sign-in",
      reLogin.status === 403 && reLogin.body?.code === "ACCOUNT_INACTIVE",
      reLogin,
    );
    const oldSession = await call("GET", "/api/college/me", undefined, collegeToken);
    check(
      "an existing college session is revoked",
      oldSession.status === 403,
      oldSession,
    );
    const credsAfter = await call("GET", `/api/workspaces/${ws.id}/college-credentials`);
    check(
      "admin still sees the credential, marked inactive",
      credsAfter.body?.credentials?.isActive === false,
      credsAfter.body,
    );

    console.log("\n[G] Deletion removes workspace data and credentials");
    const archivedUserId = created.body.credentials.userId;
    const deleteArchived = await call("DELETE", `/api/workspaces/${ws.id}`);
    check(
      "DELETE on an archived workspace returns 200",
      deleteArchived.status === 200,
      deleteArchived,
    );
    check(
      "archived workspace rows are gone",
      (await prisma.workspace.findUnique({ where: { id: ws.id } })) === null,
    );
    check(
      "archived workspace's college credential is gone",
      (await prisma.collegeCredential.findUnique({
        where: { userId: archivedUserId },
      })) === null,
    );
    check(
      "the deleted college can no longer sign in",
      (
        await call(
          "POST",
          "/api/college/sign-in",
          {
            userId: archivedUserId,
            password: created.body.credentials.password,
          },
          "",
        )
      ).status === 401,
    );

    const draft = await call(
      "POST",
      "/api/workspaces",
      workspaceInput("Route Smoke Draft", "Route Smoke Draft College"),
    );
    const draftId = draft.body?.workspace?.id;
    cleanup.push(draftId);
    const draftUserId = draft.body?.credentials?.userId;
    const deleteDraft = await call("DELETE", `/api/workspaces/${draftId}`);
    check("DELETE on a draft returns 200", deleteDraft.status === 200, deleteDraft);
    check(
      "deleting the workspace removed its credential",
      (await prisma.collegeCredential.findUnique({ where: { userId: draftUserId } })) ===
        null,
    );
    check(
      "deleting the workspace removed its rows",
      (await prisma.workspace.findUnique({ where: { id: draftId } })) === null,
    );
  } finally {
    await prisma.workspace.deleteMany({ where: { id: { in: cleanup.filter(Boolean) } } });
    await prisma.user.deleteMany({ where: { id: { in: userCleanup } } });
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
