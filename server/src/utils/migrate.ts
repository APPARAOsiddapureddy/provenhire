import fs from "fs/promises";
import path from "path";
import bcrypt from "bcrypt";
import { prisma } from "../config/prisma.js";

type JsonRecord = Record<string, any>;

const DEFAULT_PASSWORD = process.env.MIGRATION_DEFAULT_PASSWORD || "ChangeMe123!";

async function readJsonArray(filePath: string): Promise<JsonRecord[] | null> {
  try {
    const raw = await fs.readFile(filePath, "utf-8");
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed as JsonRecord[];
    if (parsed?.data && Array.isArray(parsed.data)) return parsed.data as JsonRecord[];
    return null;
  } catch (error: any) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

function toDate(value: any): Date | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

async function migrateUsers(records: JsonRecord[]) {
  if (!records.length) return;
  const defaultHash = await bcrypt.hash(DEFAULT_PASSWORD, 10);
  for (const record of records) {
    const id = record.id || record.user_id;
    if (!id || !record.email) continue;
    await prisma.user.upsert({
      where: { id },
      update: {
        name: record.name ?? record.full_name ?? null,
        email: record.email,
        role: record.role ?? "jobseeker",
      },
      create: {
        id,
        name: record.name ?? record.full_name ?? null,
        email: record.email,
        role: record.role ?? "jobseeker",
        passwordHash: record.password_hash || defaultHash,
        createdAt: toDate(record.created_at) ?? undefined,
      },
    });
  }
}

async function migrateJobSeekerProfiles(records: JsonRecord[]) {
  if (!records.length) return;
  for (const record of records) {
    const userId = record.user_id || record.userId;
    if (!userId) continue;
    await prisma.jobSeekerProfile.upsert({
      where: { userId },
      update: {
        fullName: record.full_name ?? record.fullName ?? null,
        email: record.email ?? null,
        currentRole: record.current_role ?? record.currentRole ?? null,
        experienceYears: record.experience_years ?? record.experienceYears ?? null,
        resumeUrl: record.resume_url ?? record.resumeUrl ?? null,
        about: record.about ?? record.bio ?? null,
        verificationStatus: record.verification_status ?? record.verificationStatus ?? null,
        skills: record.skills ?? null,
      },
      create: {
        userId,
        fullName: record.full_name ?? record.fullName ?? null,
        email: record.email ?? null,
        currentRole: record.current_role ?? record.currentRole ?? null,
        experienceYears: record.experience_years ?? record.experienceYears ?? null,
        resumeUrl: record.resume_url ?? record.resumeUrl ?? null,
        about: record.about ?? record.bio ?? null,
        verificationStatus: record.verification_status ?? record.verificationStatus ?? null,
        skills: record.skills ?? null,
        createdAt: toDate(record.created_at) ?? undefined,
      },
    });
  }
}

async function migrateRecruiterProfiles(records: JsonRecord[]) {
  if (!records.length) return;
  for (const record of records) {
    const userId = record.user_id || record.userId;
    if (!userId) continue;
    await prisma.recruiterProfile.upsert({
      where: { userId },
      update: {
        companyName: record.company_name ?? record.companyName ?? null,
        companySize: record.company_size ?? record.companySize ?? null,
        designation: record.designation ?? null,
        phone: record.phone ?? null,
        companyWebsite: record.company_website ?? record.companyWebsite ?? null,
        industry: record.industry ?? null,
        hiringFor: record.hiring_for ?? record.hiringFor ?? null,
        onboardingCompleted: Boolean(record.onboarding_completed ?? record.onboardingCompleted ?? false),
      },
      create: {
        userId,
        companyName: record.company_name ?? record.companyName ?? null,
        companySize: record.company_size ?? record.companySize ?? null,
        designation: record.designation ?? null,
        phone: record.phone ?? null,
        companyWebsite: record.company_website ?? record.companyWebsite ?? null,
        industry: record.industry ?? null,
        hiringFor: record.hiring_for ?? record.hiringFor ?? null,
        onboardingCompleted: Boolean(record.onboarding_completed ?? record.onboardingCompleted ?? false),
        createdAt: toDate(record.created_at) ?? undefined,
      },
    });
  }
}

async function migrateInterviews(records: JsonRecord[]) {
  if (!records.length) return;
  for (const record of records) {
    const id = record.id || record.interview_id;
    const userId = record.user_id || record.userId;
    if (!id || !userId) continue;
    await prisma.interview.upsert({
      where: { id },
      update: {
        userId,
        jobRole: record.role ?? record.job_role ?? record.jobRole ?? "Unknown",
        totalScore: record.total_score ?? record.totalScore ?? null,
        badgeLevel: record.badge_level ?? record.badgeLevel ?? null,
        finalVerdict: record.final_verdict ?? record.finalVerdict ?? null,
        scoreBreakdown: record.score_breakdown ?? record.scoreBreakdown ?? null,
        status: record.status ?? "completed",
        questionIndex: record.question_index ?? record.questionIndex ?? 0,
        questionPlan: record.question_plan ?? record.questionPlan ?? null,
        completedAt: toDate(record.completed_at) ?? undefined,
      },
      create: {
        id,
        userId,
        jobRole: record.role ?? record.job_role ?? record.jobRole ?? "Unknown",
        totalScore: record.total_score ?? record.totalScore ?? null,
        badgeLevel: record.badge_level ?? record.badgeLevel ?? null,
        finalVerdict: record.final_verdict ?? record.finalVerdict ?? null,
        scoreBreakdown: record.score_breakdown ?? record.scoreBreakdown ?? null,
        status: record.status ?? "completed",
        questionIndex: record.question_index ?? record.questionIndex ?? 0,
        questionPlan: record.question_plan ?? record.questionPlan ?? null,
        createdAt: toDate(record.created_at) ?? undefined,
        completedAt: toDate(record.completed_at) ?? undefined,
      },
    });
  }
}

async function migrateInterviewMessages(records: JsonRecord[]) {
  if (!records.length) return;
  for (const record of records) {
    const id = record.id || record.message_id;
    const interviewId = record.interview_id || record.interviewId;
    if (!id || !interviewId) continue;
    await prisma.interviewMessage.upsert({
      where: { id },
      update: {
        interviewId,
        sender: record.sender ?? "user",
        message: record.message ?? "",
        questionType: record.question_type ?? record.questionType ?? null,
        isFollowup: Boolean(record.is_followup ?? record.isFollowup ?? false),
        createdAt: toDate(record.timestamp ?? record.created_at) ?? undefined,
      },
      create: {
        id,
        interviewId,
        sender: record.sender ?? "user",
        message: record.message ?? "",
        questionType: record.question_type ?? record.questionType ?? null,
        isFollowup: Boolean(record.is_followup ?? record.isFollowup ?? false),
        createdAt: toDate(record.timestamp ?? record.created_at) ?? undefined,
      },
    });
  }
}

async function migrateResumeAnalyses(records: JsonRecord[]) {
  if (!records.length) return;
  for (const record of records) {
    const id = record.id || record.analysis_id;
    const userId = record.user_id || record.userId;
    if (!id || !userId) continue;
    await prisma.resumeAnalysis.upsert({
      where: { id },
      update: {
        userId,
        score: record.score ?? null,
        feedback: record.feedback ?? record.data ?? null,
      },
      create: {
        id,
        userId,
        score: record.score ?? null,
        feedback: record.feedback ?? record.data ?? null,
        createdAt: toDate(record.created_at) ?? undefined,
      },
    });
  }
}

async function main() {
  const baseDir = process.env.MIGRATION_DIR || path.resolve(process.cwd(), "migrations");

  const users = await readJsonArray(path.join(baseDir, "users.json"));
  const jobSeekerProfiles = await readJsonArray(path.join(baseDir, "job_seeker_profiles.json"));
  const recruiterProfiles = await readJsonArray(path.join(baseDir, "recruiter_profiles.json"));
  const interviews = await readJsonArray(path.join(baseDir, "interviews.json"));
  const interviewMessages = await readJsonArray(path.join(baseDir, "interview_messages.json"));
  const resumeAnalyses = await readJsonArray(path.join(baseDir, "resume_analyses.json"));

  if (!users && !interviews && !interviewMessages && !resumeAnalyses) {
    console.log(`No migration files found in ${baseDir}`);
    return;
  }

  await migrateUsers(users ?? []);
  await migrateJobSeekerProfiles(jobSeekerProfiles ?? []);
  await migrateRecruiterProfiles(recruiterProfiles ?? []);
  await migrateInterviews(interviews ?? []);
  await migrateInterviewMessages(interviewMessages ?? []);
  await migrateResumeAnalyses(resumeAnalyses ?? []);

  console.log("Migration complete.");
}

main()
  .catch((error) => {
    console.error("Migration failed:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
