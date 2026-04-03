/**
 * End-to-end job seeker flow audit (API + targeted DB seeds for stages Judge0/Gemini cannot auto-complete).
 * Prerequisites: server running, DB migrated & seeded (see package.json seed:* scripts).
 *
 * Run: cd server && npx tsx scripts/auditFlow.ts
 */
import { config } from "dotenv";
import { readFileSync, writeFileSync } from "fs";
import { resolve } from "path";
import { fileURLToPath } from "url";

config({ path: resolve(fileURLToPath(new URL(".", import.meta.url)), "../.env") });

const BASE = process.env.AUDIT_API_BASE ?? "http://127.0.0.1:10000";
const USERS_PATH = resolve(fileURLToPath(new URL(".", import.meta.url)), "../test-users.json");

type LogEntry = {
  label: string;
  test: string;
  result: "PASS" | "FAIL" | "SKIP";
  detail?: unknown;
  error?: unknown;
  fix?: string;
};

const log: LogEntry[] = [];
const bugs: LogEntry[] = [];

function record(e: LogEntry) {
  log.push(e);
  if (e.result === "FAIL") bugs.push(e);
  const icon = e.result === "PASS" ? "✅" : e.result === "SKIP" ? "⏭" : "❌";
  console.log(`${icon} [${e.label}] ${e.test}${e.result === "FAIL" ? ` — ${JSON.stringify(e.error)}` : ""}`);
}

function pass(label: string, test: string, detail?: unknown) {
  record({ label, test, result: "PASS", detail });
}

function fail(label: string, test: string, error: unknown, fix?: string) {
  record({ label, test, result: "FAIL", error, fix });
}

function skip(label: string, test: string, detail?: unknown) {
  record({ label, test, result: "SKIP", detail });
}

async function jsonFetch(
  path: string,
  init?: RequestInit & { token?: string },
): Promise<{ status: number; data: any }> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(init?.headers as Record<string, string>),
  };
  if (init?.token) headers.Authorization = `Bearer ${init.token}`;
  const res = await fetch(`${BASE}${path}`, { ...init, headers });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

async function checkHealth(): Promise<boolean> {
  try {
    const { status, data } = await jsonFetch("/health");
    if (status === 200 && data?.ok === true) {
      pass("ENV", "GET /health");
      return true;
    }
    fail("ENV", "GET /health", { status, data }, "Start server: cd server && npm run dev");
    return false;
  } catch (e) {
    fail("ENV", "GET /health", String(e), "Start server and check PORT");
    return false;
  }
}

async function checkJudge0(): Promise<boolean> {
  const base = process.env.JUDGE0_CE_URL?.replace(/\/$/, "");
  if (!base) {
    skip("ENV", "Judge0 system_info", "JUDGE0_CE_URL not set");
    return false;
  }
  try {
    const r = await fetch(`${base}/system_info`);
    if (r.ok) {
      pass("ENV", "Judge0 reachable");
      return true;
    }
    skip("ENV", "Judge0 system_info", { status: r.status });
    return false;
  } catch {
    skip("ENV", "Judge0 unreachable", "Skip DSA execution checks");
    return false;
  }
}

/** Long response so heuristic evaluator qualifies without Gemini (see ai.service.ts). */
const NONTECH_LONG_RESPONSE = Array.from(
  { length: 120 },
  (_, i) =>
    `Paragraph ${i + 1}: For marketing roles we align campaigns to funnel metrics, run A/B tests on creative and copy, coordinate with sales on MQL handoff, and document learnings in a shared playbook. `,
).join("");

async function seedDsaRoundResult(userId: string) {
  const { prisma } = await import("../src/config/prisma.js");
  await prisma.dsaRoundResult.deleteMany({ where: { userId } });
  await prisma.dsaRoundResult.create({
    data: {
      userId,
      score: 75,
      answers: {
        q1: { score: 80, code: "function solve() { for (let i = 0; i < n; i++) { result += i; } return result; }" },
        q2: { score: 75, code: "while (left < right) { mid = (left+right)//2 }" },
        q3: { score: 70, code: "return ans;" },
      },
    },
  });
}

async function seedCompletedAiInterview(userId: string) {
  const { prisma } = await import("../src/config/prisma.js");
  const existing = await prisma.interview.findFirst({
    where: { userId, status: "completed" },
    orderBy: { completedAt: "desc" },
  });
  if (existing) return;
  try {
    await prisma.interview.deleteMany({ where: { userId } });
  } catch {
    /* ignore FK blocks */
  }
  await prisma.interview.create({
    data: {
      userId,
      jobRole: "Backend",
      experienceLevel: "mid",
      status: "completed",
      totalScore: 78,
      completedAt: new Date(),
      scoreBreakdown: {
        technical_accuracy: 8,
        depth_of_knowledge: 8,
        problem_solving: 8,
        communication_clarity: 8,
        confidence_level: "high",
      },
    },
  });
}

async function seedL3HumanPath(userId: string) {
  const { prisma } = await import("../src/config/prisma.js");
  const interviewer = await prisma.interviewer.findFirst({ select: { id: true } });
  if (!interviewer) {
    throw new Error("No interviewer row — run: npm run seed:interviewer");
  }
  const existing = await prisma.humanInterviewSession.findFirst({
    where: { userId },
    orderBy: { createdAt: "desc" },
  });
  if (existing) {
    await prisma.humanInterviewSession.update({
      where: { id: existing.id },
      data: {
        status: "completed",
        completedAt: new Date(),
        evaluationPass: true,
        evaluationSubmittedAt: new Date(),
      },
    });
  } else {
    await prisma.humanInterviewSession.create({
      data: {
        userId,
        interviewerId: interviewer.id,
        status: "completed",
        completedAt: new Date(),
        evaluationPass: true,
        evaluationSubmittedAt: new Date(),
      },
    });
  }
  await prisma.verificationStage.updateMany({
    where: { userId, stageName: "human_expert_interview" },
    data: { status: "completed", score: 85 },
  });
}

async function testProfile(label: string, token: string) {
  const me = await jsonFetch("/api/auth/me", { token });
  if (me.status === 200 && me.data?.user?.role === "jobseeker") pass(label, "GET /api/auth/me jobseeker");
  else fail(label, "GET /api/auth/me", me.data, "Auth middleware / user lookup");

  const prof = await jsonFetch("/api/users/job-seeker-profile", { token });
  const p = prof.data?.profile;
  if (prof.status === 200 && p?.targetJobTitle) pass(label, "GET job-seeker-profile");
  else fail(label, "GET job-seeker-profile", prof.data, "Profile missing targetJobTitle");
}

async function testStagesTechnical(label: string, token: string) {
  const { status, data } = await jsonFetch("/api/verification/stages", { token });
  if (status !== 200 || !Array.isArray(data?.stages)) {
    fail(label, "GET /api/verification/stages", data, "verification GET /stages");
    return;
  }
  pass(label, "GET /api/verification/stages");
  const names = data.stages.map((s: { stage_name: string }) => s.stage_name);
  const required = ["profile_setup", "aptitude_test", "dsa_round", "expert_interview", "human_expert_interview"];
  for (const r of required) {
    if (names.includes(r)) pass(label, `stage row: ${r}`);
    else fail(label, `stage missing: ${r}`, { names }, "GET /stages backfill");
  }
}

async function completeProfileStage(label: string, token: string) {
  const up = await jsonFetch("/api/verification/stages/update", {
    method: "POST",
    token,
    body: JSON.stringify({ stageName: "profile_setup", status: "completed" }),
  });
  if (up.status === 200) pass(label, "profile_setup → completed");
  else fail(label, "profile_setup update", up.data, "stages/update");
}

async function runAptitude(label: string, token: string, userId: string, experienceYears: number) {
  const q = await jsonFetch("/api/verification/aptitude/questions", { token });
  if (q.status !== 200) {
    fail(label, "GET aptitude/questions", q.data, "Aptitude session");
    return;
  }
  pass(label, "GET aptitude/questions");
  const session = q.data;
  if (!Array.isArray(session.questions) || session.questions.length === 0) {
    fail(label, "aptitude questions[]", session, "Loader");
    return;
  }
  const tier =
    experienceYears < 1 ? "fresher" : experienceYears < 3 ? "mid" : "senior";
  const expectedSet =
    tier === "fresher"
      ? "aptitude_mixed"
      : tier === "mid"
        ? "cs_fundamentals_medium"
        : "cs_fundamentals_advanced";
  if (session.questionSet === expectedSet) pass(label, `questionSet ${session.questionSet}`);
  else fail(label, "questionSet tier routing", { expected: expectedSet, got: session.questionSet }, "experienceTier");

  const { getAptitudeSession } = await import("../src/data/aptitude-session-db.js");
  const row = await getAptitudeSession(userId);
  if (!row?.answerKey) {
    fail(label, "aptitude DB session / answerKey", null, "GET questions then read session");
    return;
  }
  const answers: Record<string, string> = {};
  for (const id of Object.keys(row.answerKey)) {
    answers[id] = row.answerKey[id]!;
  }
  const sub = await jsonFetch("/api/verification/aptitude", {
    method: "POST",
    token,
    body: JSON.stringify({ answers }),
  });
  if (sub.status === 200) pass(label, "POST aptitude submit");
  else fail(label, "POST aptitude submit", sub.data, "Scoring / session");

  const st = await jsonFetch("/api/verification/stages/update", {
    method: "POST",
    token,
    body: JSON.stringify({ stageName: "aptitude_test", status: "completed" }),
  });
  if (st.status === 200) pass(label, "aptitude_test → completed");
  else fail(label, "aptitude_test stage complete", st.data, "Need passing score ≥60%");

  await jsonFetch("/api/verification/stages", { token });
}

async function testJobs(
  label: string,
  token: string,
  phase: "before_dsa" | "after_dsa" | "after_l2" | "after_l3",
) {
  const { status, data } = await jsonFetch("/api/jobs", { token });
  if (status !== 200) {
    fail(label, `GET /api/jobs [${phase}]`, data, "jobs route");
    return;
  }
  pass(label, `GET /api/jobs [${phase}]`);
  const jobList = Array.isArray(data?.jobs) ? data.jobs : [];
  const missing = jobList.filter((j: { jobAccessLevel?: string }) => j.jobAccessLevel == null);
  if (jobList.length > 0 && missing.length > 0) {
    fail(label, `jobAccessLevel missing (${missing.length})`, missing[0], "JobListings mapping");
  } else if (jobList.length > 0) pass(label, `jobAccessLevel on ${jobList.length} jobs [${phase}]`);

  if (phase === "before_dsa") {
    if (data.listingsGate === "dsa_incomplete" && jobList.length === 0) pass(label, "listings gated before DSA");
    else fail(label, "expected empty jobs before DSA", { listingsGate: data.listingsGate, n: jobList.length }, "jobs gate");
  }
  if (phase === "after_dsa") {
    if (jobList.length === 0) {
      fail(label, "no jobs after DSA", data, "Expect listings once DSA stage completed");
      return;
    }
    const unlocked = jobList.filter((j: { jobAccessLevel: string }) => j.jobAccessLevel === "unlocked");
    if (unlocked.length === 0) pass(label, "L1: jobs visible, none unlocked (AI interview gate)");
    else fail(label, "unexpected unlocked jobs at L1", { unlocked: unlocked.length }, "cert gating");
  }
  if (phase === "after_l2") {
    if (jobList.length === 0) {
      skip(label, "L2 job unlock", "No published jobs in DB — seed or create jobs to test unlock matrix");
    } else {
      const unlocked = jobList.filter((j: { jobAccessLevel: string }) => j.jobAccessLevel === "unlocked");
      if (unlocked.length > 0) pass(label, `L2: ${unlocked.length} job(s) unlocked (within salary cap)`);
      else skip(label, "L2 unlock sample", "No unlocked rows — salary cap / scorecard may gate all listed jobs");
    }
  }
  if (phase === "after_l3") {
    const locked = jobList.filter((j: { jobAccessLevel: string }) => j.jobAccessLevel === "locked");
    if (locked.length === 0 && jobList.length > 0) pass(label, "L3: all jobs unlocked");
    else if (jobList.length === 0) fail(label, "L3 jobs list empty", data, "seed/listings");
    else skip(label, "L3 all-unlocked", { locked: locked.length, total: jobList.length });
  }
}

async function runDsa(label: string, token: string, userId: string, experienceYears: number, judge0: boolean) {
  await jsonFetch("/api/verification/stages", { token });

  const dsaRes = await jsonFetch("/api/verification/dsa/questions", { token });
  if (dsaRes.status !== 200) {
    fail(label, "GET /dsa/questions", dsaRes.data, "Set dsa_round in_progress via GET /stages reconcile");
    return;
  }
  pass(label, "GET /dsa/questions");
  const body = dsaRes.data;
  const questions = body.questions;
  if (!Array.isArray(questions) || questions.length === 0) {
    if (body.dsaWaiver) skip(label, "DSA questions (waiver)", "dsaWaiver true for role");
    else fail(label, "DSA questions empty", body, "seed:dsa + targetJobTitle role category");
    return;
  }
  const expectedCount = experienceYears >= 3 ? 2 : 3;
  if (questions.length === expectedCount) pass(label, `DSA count ${expectedCount}`);
  else fail(label, "DSA question count", { expected: expectedCount, got: questions.length }, "dsaTierConfig");

  if (typeof body.timeLimitMinutes === "number") pass(label, `timeLimitMinutes=${body.timeLimitMinutes}`);
  else fail(label, "timeLimitMinutes", body, "GET /dsa/questions");

  if (typeof body.passThresholdPercent === "number") pass(label, `passThresholdPercent=${body.passThresholdPercent}`);
  else fail(label, "passThresholdPercent", body, "GET /dsa/questions");

  const langs = ["javascript", "python", "java", "cpp", "c"] as const;
  const firstQ = questions[0];
  for (const lang of langs) {
    const boiler = firstQ?.starterCode?.[lang];
    if (boiler && String(boiler).trim()) pass(label, `starterCode.${lang}`);
    else fail(label, `starterCode.${lang} missing`, { id: firstQ?.id }, "dsaMultiLangStarters / seed");
  }

  if (!judge0) {
    skip(label, "DSA run-tests (Judge0 off)", "Set JUDGE0_CE_URL to run");
  } else {
    const hack = `process.stdin.resume();process.stdin.setEncoding('utf8');let i='';process.stdin.on('data',d=>i+=d);process.stdin.on('end',()=>console.log('hack'));`;
    const run = await jsonFetch("/api/verification/dsa/run-tests", {
      method: "POST",
      token,
      body: JSON.stringify({ questionId: firstQ.id, code: hack, language: "javascript" }),
    });
    if (run.status === 200) {
      pass(label, "run-tests responds");
      if (run.data.total >= 1) pass(label, `run-tests ${run.data.passed}/${run.data.total}`);
      if (run.data.passed < run.data.total) pass(label, "sanity: not all tests passed on hack code");
    } else fail(label, "run-tests", run.data, "Judge0 / rate limit");

    for (const lang of langs) {
      const code = String(firstQ.starterCode?.[lang] ?? "");
      if (!code) continue;
      const c = await jsonFetch("/api/verification/dsa/run-tests", {
        method: "POST",
        token,
        body: JSON.stringify({ questionId: firstQ.id, code, language: lang }),
      });
      if (c.status !== 200) {
        fail(label, `run-tests boilerplate ${lang}`, c.data, "Judge0");
        continue;
      }
      const compileErr = (c.data.results ?? []).some(
        (r: { status?: string }) => r?.status === "compile_error",
      );
      if (compileErr) fail(label, `boilerplate compile ${lang}`, c.data.results?.[0], "Fix starter");
      else pass(label, `boilerplate runs ${lang} (no compile_error)`);
    }
  }

  await seedDsaRoundResult(userId);
  const fin = await jsonFetch("/api/verification/stages/update", {
    method: "POST",
    token,
    body: JSON.stringify({ stageName: "dsa_round", status: "completed" }),
  });
  if (fin.status === 200) pass(label, "dsa_round → completed");
  else fail(label, "dsa_round complete", fin.data, "DsaRoundResult + threshold");
}

async function testSkillsTechnical(label: string, token: string) {
  const { status, data } = await jsonFetch("/api/verification/skills", { token });
  if (status !== 200) {
    fail(label, "GET /verification/skills", data, "skills route");
    return;
  }
  pass(label, "GET /verification/skills");
  for (const key of ["aptitude", "live_coding", "interview"] as const) {
    const o = data[key];
    if (o == null) {
      fail(label, `skills.${key}`, data, "getSkillVerifications");
      continue;
    }
    if (typeof o.status === "string") pass(label, `skills.${key} (${o.status})`);
    else fail(label, `skills.${key} shape`, o, "getSkillVerifications");
  }
}

async function testSkillsNonTech(label: string, token: string) {
  const { status, data } = await jsonFetch("/api/verification/skills", { token });
  if (status !== 200) {
    fail(label, "GET /verification/skills (non-tech)", data, "");
    return;
  }
  if (data.aptitude === null && data.live_coding === null && data.interview === null)
    pass(label, "skills null for non_technical (expected)");
  else fail(label, "non-tech skills shape", data, "Should return nulls");
}

async function testCandidateProfile(label: string, token: string) {
  const { status, data } = await jsonFetch("/api/users/me/candidate-profile", { token });
  if (status !== 200) {
    fail(label, "GET me/candidate-profile", data, "");
    return;
  }
  const p = data.profile;
  if (p?.certification_level != null) pass(label, "certification_level present");
  else fail(label, "certification_level", p, "verificationLevel.service");
  if (p?.certification_label != null) pass(label, "certification_label present");
  else fail(label, "certification_label", p, "");
}

async function testProctoring(label: string, token: string, userId: string) {
  const { status, data } = await jsonFetch("/api/proctoring/alerts", {
    method: "POST",
    token,
    body: JSON.stringify({
      userId,
      testId: `audit-${label}`,
      testType: "dsa",
      alertType: "TAB_SWITCH",
      severity: "medium",
      message: "audit synthetic",
    }),
  });
  if (status !== 200) {
    fail(label, "POST proctoring/alerts", data, "Payload must match zod schema");
    return;
  }
  pass(label, "POST proctoring/alerts");
  if (data.action !== undefined) pass(label, `proctoring action=${data.action}`);
  else fail(label, "proctoring action missing", data, "proctoringCount.service");
  if (typeof data.eventCount === "number") pass(label, `eventCount=${data.eventCount}`);
  else fail(label, "eventCount missing", data, "");
}

async function runNonTech(label: string, token: string) {
  await completeProfileStage(label, token);
  await jsonFetch("/api/verification/stages/update", {
    method: "POST",
    token,
    body: JSON.stringify({ stageName: "non_tech_assignment", status: "in_progress" }),
  });
  const sub = await jsonFetch("/api/verification/non-tech-assignment/submit", {
    method: "POST",
    token,
    body: JSON.stringify({
      prompt: "Draft a 90-day go-to-market plan for a B2B SaaS analytics product.",
      response: NONTECH_LONG_RESPONSE,
      targetJobTitle: "Marketing",
    }),
  });
  if (sub.status === 200 && typeof sub.data?.score === "number") {
    pass(label, "non-tech-assignment submit");
    pass(label, `assignment score=${sub.data.score} qualified=${sub.data.qualified}`);
  } else fail(label, "non-tech-assignment submit", sub.data, "AI fallback or payload");

  await jsonFetch("/api/verification/stages", { token });
  await testJobs(label, token, "after_dsa");
}

async function runTechnicalUser(
  u: {
    label: string;
    token?: string;
    userId?: string;
    status: string;
    experienceYears?: number;
  },
  judge0: boolean,
) {
  if (u.status === "FAILED" || !u.token || !u.userId) {
    skip(u.label, "user row", u);
    return;
  }
  const label = u.label;
  const token = u.token;
  const userId = u.userId;
  const experienceYears =
    typeof u.experienceYears === "number"
      ? u.experienceYears
      : u.label.includes("FRESHER")
        ? 0
        : u.label.includes("MID")
          ? 2
          : u.label.includes("SENIOR")
            ? 5
            : 0;

  console.log(`\n======== ${label} ========`);
  await testProfile(label, token);
  await testStagesTechnical(label, token);
  await completeProfileStage(label, token);

  await testJobs(label, token, "before_dsa");

  await runAptitude(label, token, userId, experienceYears);
  await testJobs(label, token, "before_dsa");

  await runDsa(label, token, userId, experienceYears, judge0);
  await testJobs(label, token, "after_dsa");

  await seedCompletedAiInterview(userId);
  const ex = await jsonFetch("/api/verification/stages/update", {
    method: "POST",
    token,
    body: JSON.stringify({ stageName: "expert_interview", status: "completed" }),
  });
  if (ex.status === 200) pass(label, "expert_interview → completed (seeded AI interview)");
  else fail(label, "expert_interview complete", ex.data, "Interview row + scorecard");

  await testSkillsTechnical(label, token);
  await testCandidateProfile(label, token);
  await testJobs(label, token, "after_l2");

  try {
    await seedL3HumanPath(userId);
    pass(label, "DB seed L3 (human session + stage)");
  } catch (e) {
    fail(label, "seed L3", String(e), "seed:interviewer");
  }
  await testJobs(label, token, "after_l3");
  await testCandidateProfile(label, token);
  await testProctoring(label, token, userId);
}

async function runNonTechUser(u: { label: string; token?: string; userId?: string; status: string }) {
  if (u.status === "FAILED" || !u.token || !u.userId) {
    skip(u.label, "user row", u);
    return;
  }
  const label = u.label;
  const token = u.token;
  console.log(`\n======== ${label} ========`);
  await testProfile(label, token);
  await jsonFetch("/api/verification/stages", { token });
  await runNonTech(label, token);
  await testSkillsNonTech(label, token);
  await testCandidateProfile(label, token);
  await testProctoring(label, token, u.userId!);
}

async function main() {
  console.log("ProvenHire flow audit\n");
  const ok = await checkHealth();
  const judge0 = await checkJudge0();
  if (!ok) {
    writeFileSync(
      resolve(fileURLToPath(new URL(".", import.meta.url)), "../audit-bugs.json"),
      JSON.stringify(log.filter((l) => l.result === "FAIL"), null, 2),
    );
    process.exit(1);
  }

  let raw: string;
  try {
    raw = readFileSync(USERS_PATH, "utf8");
  } catch {
    fail("ENV", "test-users.json", "missing", "Run: npx tsx scripts/createTestUsers.ts");
    writeFileSync(
      resolve(fileURLToPath(new URL(".", import.meta.url)), "../audit-bugs.json"),
      JSON.stringify(bugs, null, 2),
    );
    process.exit(1);
    return;
  }
  const users = JSON.parse(raw) as Array<{
    label: string;
    email: string;
    userId?: string;
    token?: string;
    status: string;
    experienceYears?: number;
  }>;

  for (const u of users) {
    if (u.label.startsWith("TECH")) {
      await runTechnicalUser(u, judge0);
    } else {
      await runNonTechUser(u);
    }
  }

  const summary = {
    total: log.length,
    passed: log.filter((l) => l.result === "PASS").length,
    failed: log.filter((l) => l.result === "FAIL").length,
    skipped: log.filter((l) => l.result === "SKIP").length,
    bugs,
  };
  const dir = fileURLToPath(new URL(".", import.meta.url));
  writeFileSync(resolve(dir, "../audit-results.json"), JSON.stringify({ log, summary }, null, 2));
  writeFileSync(resolve(dir, "../audit-bugs.json"), JSON.stringify(bugs, null, 2));
  console.log("\n--- summary ---", summary);

  const { prisma } = await import("../src/config/prisma.js");
  await prisma.$disconnect().catch(() => {});

  process.exit(bugs.length > 0 ? 1 : 0);
}

main().catch(async (e) => {
  console.error(e);
  try {
    const { prisma } = await import("../src/config/prisma.js");
    await prisma.$disconnect();
  } catch {
    /* ignore */
  }
  process.exit(1);
});
