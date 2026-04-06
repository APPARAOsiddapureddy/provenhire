/**
 * One-time / idempotent seed: static AI interview questions → InterviewQuestionBank.
 * Run: cd server && npx tsx prisma/seeds/interviewQuestionBank.seed.ts
 */
import { PrismaClient } from "@prisma/client";
import {
  HR_QUESTIONS,
  ROLE_PLANS,
  resolveInterviewBankRole,
} from "../../src/data/aiInterviewStaticQuestions.js";

const prisma = new PrismaClient();

function difficultyForType(type: string): number {
  if (type === "behavioral") return 1;
  if (type === "conceptual") return 2;
  if (type === "scenario") return 3;
  if (type === "problem_solving") return 4;
  return 2;
}

async function main() {
  const levels = ["junior", "mid", "senior"] as const;
  let created = 0;

  for (const experienceLevel of levels) {
    for (const role of Object.keys(ROLE_PLANS)) {
      for (const q of ROLE_PLANS[role]!) {
        const exists = await prisma.interviewQuestionBank.findFirst({
          where: {
            role,
            experienceLevel,
            type: q.type,
            prompt: q.prompt,
          },
        });
        if (exists) continue;
        await prisma.interviewQuestionBank.create({
          data: {
            role,
            experienceLevel,
            type: q.type,
            prompt: q.prompt,
            keyPoints: q.keyPoints,
            difficulty: difficultyForType(q.type),
            isActive: true,
            tags: [],
            followups: (q as { followups?: string[] }).followups ?? [],
          },
        });
        created++;
      }
    }

    for (const q of HR_QUESTIONS) {
      const role = "common";
      const exists = await prisma.interviewQuestionBank.findFirst({
        where: {
          role,
          experienceLevel,
          type: "behavioral",
          prompt: q.prompt,
        },
      });
      if (exists) continue;
      await prisma.interviewQuestionBank.create({
        data: {
          role,
          experienceLevel,
          type: "behavioral",
          prompt: q.prompt,
          keyPoints: q.keyPoints,
          difficulty: 1,
          isActive: true,
          tags: ["hr"],
        },
      });
      created++;
    }
  }

  console.log(`InterviewQuestionBank seed: created ${created} new row(s). resolveInterviewBankRole still maps titles → ${resolveInterviewBankRole("Backend Developer")}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
