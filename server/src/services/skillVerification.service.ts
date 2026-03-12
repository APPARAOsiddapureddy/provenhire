/**
 * Skill Validity & Expiry Service
 * Handles completed_at, expires_at, status transitions, and expiry logic.
 */
import { prisma } from "../config/prisma.js";
import { SKILL_VALIDITY_DAYS } from "../config/skillValidity.js";
import type { SkillVerificationStatus, SkillType as PrismaSkillType } from "@prisma/client";

export function calculateExpiry(skillType: PrismaSkillType | string, completedAt: Date): Date {
  const days = SKILL_VALIDITY_DAYS[skillType] ?? 180;
  const expires = new Date(completedAt);
  expires.setDate(expires.getDate() + days);
  return expires;
}

export function isExpired(expiresAt: Date | null): boolean {
  if (!expiresAt) return false;
  return new Date() > expiresAt;
}

export function getEffectiveStatus(
  status: SkillVerificationStatus,
  expiresAt: Date | null
): SkillVerificationStatus {
  if (status === "ACTIVE" && isExpired(expiresAt)) return "EXPIRED";
  return status;
}

export async function upsertSkillVerification(
  userId: string,
  skillType: PrismaSkillType,
  score: number,
  completedAt: Date
): Promise<void> {
  const expiresAt = calculateExpiry(skillType, completedAt);
  await prisma.candidateSkillVerification.upsert({
    where: {
      userId_skillType: { userId, skillType },
    },
    create: {
      userId,
      skillType,
      status: "ACTIVE",
      score,
      completedAt,
      expiresAt,
    },
    update: {
      status: "ACTIVE",
      score,
      completedAt,
      expiresAt,
      updatedAt: new Date(),
    },
  });
}

export async function getSkillVerifications(
  userId: string
): Promise<
  Record<string, { status: string; completed_at: string | null; expires_at: string | null; score?: number; days_until_expiry?: number }>
> {
  const rows = await prisma.candidateSkillVerification.findMany({
    where: { userId },
    orderBy: { skillType: "asc" },
  });

  const now = new Date();
  const result: Record<
    string,
    { status: string; completed_at: string | null; expires_at: string | null; score?: number; days_until_expiry?: number }
  > = {};

  const skillTypes: PrismaSkillType[] = ["APTITUDE", "LIVE_CODING", "INTERVIEW"];
  for (const sk of skillTypes) {
    const row = rows.find((r) => r.skillType === sk);
    const key = sk === "APTITUDE" ? "aptitude" : sk === "LIVE_CODING" ? "live_coding" : "interview";
    if (!row) {
      result[key] = { status: "PENDING", completed_at: null, expires_at: null };
      continue;
    }
    const effectiveStatus = getEffectiveStatus(row.status, row.expiresAt);
    const completed_at = row.completedAt?.toISOString().split("T")[0] ?? null;
    const expires_at = row.expiresAt?.toISOString().split("T")[0] ?? null;
    let days_until_expiry: number | undefined;
    if (row.expiresAt && effectiveStatus === "ACTIVE") {
      const diff = row.expiresAt.getTime() - now.getTime();
      days_until_expiry = Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
    }
    result[key] = {
      status: effectiveStatus,
      completed_at,
      expires_at,
      score: row.score ?? undefined,
      days_until_expiry,
    };
  }
  return result;
}

export async function isSkillActive(
  userId: string,
  skillType: PrismaSkillType
): Promise<boolean> {
  const row = await prisma.candidateSkillVerification.findUnique({
    where: { userId_skillType: { userId, skillType } },
  });
  if (!row) return false;
  const effective = getEffectiveStatus(row.status, row.expiresAt);
  return effective === "ACTIVE";
}

export async function markExpiredSkills(): Promise<number> {
  const now = new Date();
  const result = await prisma.candidateSkillVerification.updateMany({
    where: {
      status: "ACTIVE",
      expiresAt: { lt: now },
    },
    data: { status: "EXPIRED", updatedAt: now },
  });
  return result.count;
}
