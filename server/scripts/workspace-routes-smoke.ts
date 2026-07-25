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

    const start = await call("POST", `/api/workspaces/${ws.id}/start`, {});
    check("POST /:id/start returns 200", start.status === 200, start);

    const archiveWhileStarted = await call("PATCH", `/api/workspaces/${ws.id}/status`, {
      status: "archived",
    });
    check(
      "archiving a started workspace is refused",
      archiveWhileStarted.status === 409,
      archiveWhileStarted,
    );

    const end = await call("POST", `/api/workspaces/${ws.id}/end`, {});
    check("POST /:id/end returns 200", end.status === 200, end);

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
