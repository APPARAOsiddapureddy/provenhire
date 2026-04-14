/**
 * Seed test job seekers (and print credentials) for E2E / QA.
 *
 * Run (after migrations, same DATABASE_URL):
 *   cd server && npx tsx prisma/seed-test-credentials.ts
 *
 * Also available as: npm run seed:test-credentials
 *
 * Includes:
 * - Legacy pipeline users (aptitude → DSA → expert) for older env checks
 * - V2 software mid/senior path: DSA → AI Skills → System Design → Expert
 * - Paywall QA: completed AI Skills interview, cooldown passed, no retake credits
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcrypt";

/** Shared password for all seeded test accounts below (override with env for new batches). */
export const SEED_TEST_PASSWORD = process.env.SEED_TEST_PASSWORD?.trim() || "PhE2E_Apr2026!x7";

type StageSeed = { stageName: string; status: string; score?: number };

type TestUserSeed = {
  email: string;
  name: string;
  /** Job seeker profile — drives tier (mid/senior vs fresher). Default 2. */
  experienceYears?: number;
  stages: StageSeed[];
  aptitudeScore?: number;
  dsaScore?: number;
  /**
   * Insert a completed `ai_skills` interview row N days ago (cooldown passed).
   * Use with `ai_skills_interview` = completed to exercise retake paywall (no ledger credits).
   */
  completedAiSkillsInterviewDaysAgo?: number;
};

const PASSWORD = SEED_TEST_PASSWORD;

/**
 * QA email namespace tag so you can mint fresh accounts without touching old ones.
 * Example:
 *   QA_SEED_TAG=apr2026b SEED_TEST_PASSWORD='PhE2E_Apr2026b!x7' npm run seed:test-credentials
 */
const QA_SEED_TAG = (process.env.QA_SEED_TAG?.trim().toLowerCase() || "apr2026b").replace(/[^a-z0-9_-]/g, "");

function qaEmail(prefix: string): string {
  return `qa.${prefix}.${QA_SEED_TAG}@test.provenhire.com`;
}

const LEGACY_TEST_USERS: TestUserSeed[] = [
  {
    email: qaEmail("apt"),
    name: `QA Aptitude ${QA_SEED_TAG}`,
    stages: [
      { stageName: "profile_setup", status: "completed", score: 100 },
      { stageName: "aptitude_test", status: "in_progress" },
    ],
  },
  {
    email: qaEmail("dsa"),
    name: `QA DSA ${QA_SEED_TAG}`,
    stages: [
      { stageName: "profile_setup", status: "completed", score: 100 },
      { stageName: "aptitude_test", status: "completed", score: 75 },
      { stageName: "dsa_round", status: "in_progress" },
    ],
    aptitudeScore: 75,
  },
  {
    email: qaEmail("ai"),
    name: `QA AI Interview ${QA_SEED_TAG}`,
    stages: [
      { stageName: "profile_setup", status: "completed", score: 100 },
      { stageName: "aptitude_test", status: "completed", score: 80 },
      { stageName: "dsa_round", status: "completed", score: 70 },
      { stageName: "expert_interview", status: "in_progress" },
    ],
    aptitudeScore: 80,
    dsaScore: 70,
  },
  {
    email: qaEmail("ai2"),
    name: `QA AI Interview 2 ${QA_SEED_TAG}`,
    stages: [
      { stageName: "profile_setup", status: "completed", score: 100 },
      { stageName: "aptitude_test", status: "completed", score: 80 },
      { stageName: "dsa_round", status: "completed", score: 70 },
      { stageName: "expert_interview", status: "in_progress" },
    ],
    aptitudeScore: 80,
    dsaScore: 70,
  },
];

/** V2 software track, mid tier (3y): profile → DSA → AI Skills → System Design → Expert (no aptitude row). */
const V2_MID_SOFTWARE_USERS: TestUserSeed[] = [
  {
    email: qaEmail("v2.mid.dsa"),
    name: `QA V2 Mid DSA ${QA_SEED_TAG}`,
    experienceYears: 3,
    stages: [
      { stageName: "profile_setup", status: "completed", score: 100 },
      { stageName: "dsa_round", status: "in_progress" },
      { stageName: "ai_skills_interview", status: "locked" },
      { stageName: "system_design_interview", status: "locked" },
      { stageName: "expert_interview", status: "locked" },
    ],
  },
  {
    email: qaEmail("v2.mid.aiskills"),
    name: `QA V2 Mid AI Skills ${QA_SEED_TAG}`,
    experienceYears: 3,
    stages: [
      { stageName: "profile_setup", status: "completed", score: 100 },
      { stageName: "dsa_round", status: "completed", score: 72 },
      { stageName: "ai_skills_interview", status: "in_progress" },
      { stageName: "system_design_interview", status: "locked" },
      { stageName: "expert_interview", status: "locked" },
    ],
    dsaScore: 72,
  },
  {
    email: qaEmail("v2.mid.sysdesign"),
    name: `QA V2 Mid System Design ${QA_SEED_TAG}`,
    experienceYears: 3,
    stages: [
      { stageName: "profile_setup", status: "completed", score: 100 },
      { stageName: "dsa_round", status: "completed", score: 72 },
      { stageName: "ai_skills_interview", status: "completed", score: 78 },
      { stageName: "system_design_interview", status: "in_progress" },
      { stageName: "expert_interview", status: "locked" },
    ],
    dsaScore: 72,
  },
  {
    email: qaEmail("v2.mid.expert"),
    name: `QA V2 Mid Expert Interview ${QA_SEED_TAG}`,
    experienceYears: 3,
    stages: [
      { stageName: "profile_setup", status: "completed", score: 100 },
      { stageName: "dsa_round", status: "completed", score: 72 },
      { stageName: "ai_skills_interview", status: "completed", score: 78 },
      { stageName: "system_design_interview", status: "completed", score: 70 },
      { stageName: "expert_interview", status: "in_progress" },
    ],
    dsaScore: 72,
  },
  {
    email: qaEmail("v2.paywall.retake"),
    name: `QA V2 Paywall Retake ${QA_SEED_TAG}`,
    experienceYears: 3,
    stages: [
      { stageName: "profile_setup", status: "completed", score: 100 },
      { stageName: "dsa_round", status: "completed", score: 72 },
      { stageName: "ai_skills_interview", status: "completed", score: 78 },
      { stageName: "system_design_interview", status: "locked" },
      { stageName: "expert_interview", status: "locked" },
    ],
    dsaScore: 72,
    completedAiSkillsInterviewDaysAgo: 10,
  },
];

const TEST_USERS: TestUserSeed[] = [...LEGACY_TEST_USERS, ...V2_MID_SOFTWARE_USERS];

async function seedCompletedAiSkillsInterview(
  prisma: PrismaClient,
  userId: string,
  daysAgo: number
): Promise<void> {
  const completedAt = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000);
  await prisma.interview.deleteMany({
    where: { userId, interviewType: "ai_skills" },
  });
  await prisma.interview.create({
    data: {
      userId,
      jobRole: "Software Engineer",
      interviewType: "ai_skills",
      status: "completed",
      experienceLevel: "mid",
      totalScore: 78,
      completedAt,
      finalVerdict: "passed",
    },
  });
}

async function main() {
  const prisma = new PrismaClient();
  const hash = await bcrypt.hash(PASSWORD, 12);

  console.log("\n--- ProvenHire test credentials (job seekers) ---\n");

  for (const u of TEST_USERS) {
    let user = await prisma.user.findUnique({ where: { email: u.email } });
    const expYears = u.experienceYears ?? 2;

    if (!user) {
      user = await prisma.user.create({
        data: {
          email: u.email,
          name: u.name,
          passwordHash: hash,
          role: "jobseeker",
          emailVerified: true,
          authProvider: "EMAIL",
        },
      });
      console.log(`Created: ${u.email}`);
    } else {
      await prisma.user.update({
        where: { id: user.id },
        data: { passwordHash: hash, name: u.name, authProvider: "EMAIL" },
      });
      console.log(`Updated: ${u.email}`);
    }

    await prisma.jobSeekerProfile.upsert({
      where: { userId: user.id },
      create: {
        userId: user.id,
        fullName: u.name,
        email: u.email,
        roleType: "technical",
        targetJobTitle: "Software Engineer",
        experienceYears: expYears,
      },
      update: {
        roleType: "technical",
        targetJobTitle: "Software Engineer",
        experienceYears: expYears,
      },
    });

    for (const s of u.stages) {
      await prisma.verificationStage.upsert({
        where: { userId_stageName: { userId: user.id, stageName: s.stageName } },
        create: {
          userId: user.id,
          stageName: s.stageName,
          status: s.status,
          score: s.score ?? null,
        },
        update: { status: s.status, score: s.score ?? undefined },
      });
    }

    if (u.aptitudeScore != null) {
      const pct = Math.min(100, Math.max(0, Math.round(u.aptitudeScore)));
      const answers = {
        earnedMarks: pct,
        totalMarks: 100,
        questions: 0,
        correct: 0,
        syntheticPercentSeed: true,
      };
      const existing = await prisma.aptitudeTestResult.findFirst({ where: { userId: user.id } });
      if (existing) {
        await prisma.aptitudeTestResult.update({
          where: { id: existing.id },
          data: { score: pct, answers },
        });
      } else {
        await prisma.aptitudeTestResult.create({
          data: { userId: user.id, score: pct, answers },
        });
      }
    }

    if (u.dsaScore != null) {
      const existing = await prisma.dsaRoundResult.findFirst({ where: { userId: user.id } });
      if (existing) {
        await prisma.dsaRoundResult.update({ where: { id: existing.id }, data: { score: u.dsaScore } });
      } else {
        await prisma.dsaRoundResult.create({
          data: { userId: user.id, score: u.dsaScore, answers: {} },
        });
      }
    }

    if (u.completedAiSkillsInterviewDaysAgo != null) {
      await seedCompletedAiSkillsInterview(prisma, user.id, u.completedAiSkillsInterviewDaysAgo);
    }
  }

  console.log(`
QA_SEED_TAG: ${QA_SEED_TAG}
Password (all job seeker seeds above): ${PASSWORD}
Login: /auth → Job Seeker → Sign In

V2 mid/senior software (verification pipeline v2):
  ${qaEmail("v2.mid.dsa")}          — DSA round next
  ${qaEmail("v2.mid.aiskills")}     — AI Skills interview next (DSA + skill checkup flow)
  ${qaEmail("v2.mid.sysdesign")}    — System design interview next
  ${qaEmail("v2.mid.expert")}       — AI Expert (overall) interview next
  ${qaEmail("v2.paywall.retake")}   — AI Skills already completed; retake → paywall (no credits)

Recruiter / expert / admin: run separately:
  npm run seed:recruiter
  npm run seed:interviewer
  npm run seed:admin

See docs/TEST_CREDENTIALS.md for full matrix.
`);

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
