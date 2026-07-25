import crypto from "node:crypto";
import bcrypt from "bcrypt";
import { prisma } from "../config/prisma.js";
import { hashToken } from "../utils/jwt.js";
import { WorkspaceServiceError } from "./workspace.service.js";
import {
  assertCanManageWorkspace,
  type WorkspaceActor,
} from "./workspaceRegistration.service.js";

/// How long a student activation link stays valid.
const ACTIVATION_TTL_MS = 14 * 24 * 60 * 60 * 1000;
const DEFAULT_TARGET_JOB_TITLE = "Full Stack Developer";
const MAX_PROVISION_BATCH = 1_000;

export type ProvisionedStudent = {
  email: string;
  name: string | null;
  userId: string;
  /// Present only for accounts this call created or re-issued a link for.
  /// Absent for students who already have a working account, because we must
  /// never hand an institution a way into an existing student's account.
  activationUrl?: string;
  outcome: "created" | "already_active" | "link_reissued";
};

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function buildActivationUrl(
  token: string,
  email: string,
  webUrl = process.env.PROVENHIRE_WEB_URL,
): string {
  const base = (webUrl || "https://provenhire.in").replace(/\/+$/, "");
  const params = new URLSearchParams({ token, email });
  return `${base}/reset-password?${params.toString()}`;
}

/// Decides what to do with one roster entry, given whatever account already
/// exists for that email.
///
/// Extracted and exported so the security-critical rule - never issue an
/// activation link for an account that can already sign in, because that would
/// hand an institution a way into an existing student's account - is testable
/// without a database. See scripts/student-provisioning-contract.ts.
export function classifyStudentProvisioning(
  existing:
    | { emailVerified: boolean; authProvider?: string | null }
    | null
    | undefined,
): "created" | "link_reissued" | "already_active" {
  if (!existing) return "created";
  // Either a verified email/password account or any Google account means the
  // student can already get in on their own.
  if (existing.emailVerified || existing.authProvider === "GOOGLE") {
    return "already_active";
  }
  return "link_reissued";
}

/// Pre-creates student accounts for a campus drive and returns a single-use
/// activation link per student.
///
/// Deliberately password-free: each account is created with a random hash nobody
/// holds, and the only way in is the activation link, which the student uses to
/// set their own password through the existing /reset-password flow. The
/// institution never receives or distributes a credential.
///
/// Students who already have a usable ProvenHire account are reported as
/// `already_active` with no link, so this can never be used to take over an
/// existing account.
export async function provisionStudentAccounts(input: {
  actor: WorkspaceActor;
  workspaceId: string;
  students: Array<{ email: string; name?: string | null }>;
}): Promise<{
  workspaceId: string;
  created: number;
  alreadyActive: number;
  linksIssued: number;
  students: ProvisionedStudent[];
}> {
  await assertCanManageWorkspace(input.actor, input.workspaceId);

  if (!input.students.length) {
    throw new WorkspaceServiceError("At least one student is required.", 400);
  }
  if (input.students.length > MAX_PROVISION_BATCH) {
    throw new WorkspaceServiceError(
      `Provision at most ${MAX_PROVISION_BATCH} students per request.`,
      400,
    );
  }

  const byEmail = new Map<string, { email: string; name: string | null }>();
  for (const raw of input.students) {
    const email = normalizeEmail(raw.email);
    if (!isValidEmail(email)) {
      throw new WorkspaceServiceError(`Invalid student email: ${raw.email}`, 400);
    }
    byEmail.set(email, { email, name: raw.name?.trim() || null });
  }
  const students = [...byEmail.values()];

  const existingUsers = await prisma.user.findMany({
    where: { email: { in: students.map((s) => s.email) } },
    select: { id: true, email: true, name: true, role: true, emailVerified: true, authProvider: true },
  });
  const existingByEmail = new Map(existingUsers.map((u) => [u.email, u]));

  const results: ProvisionedStudent[] = [];
  const expiresAt = new Date(Date.now() + ACTIVATION_TTL_MS);

  for (const student of students) {
    const existing = existingByEmail.get(student.email);
    const classification = classifyStudentProvisioning(existing);

    // An account that can already sign in is left completely untouched.
    if (classification === "already_active") {
      results.push({
        email: student.email,
        name: existing!.name,
        userId: existing!.id,
        outcome: "already_active",
      });
      continue;
    }

    const activationToken = crypto.randomBytes(32).toString("hex");
    // Random, unheld password: the account is unusable until the student
    // activates it themselves.
    const unusablePasswordHash = await bcrypt.hash(crypto.randomBytes(48).toString("hex"), 10);

    const user = await prisma.$transaction(async (tx) => {
      const record = existing
        ? await tx.user.update({
            where: { id: existing.id },
            data: {
              name: existing.name ?? student.name,
              role: existing.role === "jobseeker" ? existing.role : "jobseeker",
              // The institution vouches for the roster, and the activation link
              // still has to be received at this address to get in.
              emailVerified: true,
              authProvider: "EMAIL",
            },
          })
        : await tx.user.create({
            data: {
              name: student.name,
              email: student.email,
              passwordHash: unusablePasswordHash,
              role: "jobseeker",
              emailVerified: true,
              authProvider: "EMAIL",
            },
          });

      await tx.jobSeekerProfile.upsert({
        where: { userId: record.id },
        create: {
          userId: record.id,
          fullName: student.name,
          email: student.email,
          roleType: "technical",
          targetJobTitle: DEFAULT_TARGET_JOB_TITLE,
        },
        update: {},
      });

      // One live activation link per student.
      await tx.passwordResetToken.deleteMany({ where: { userId: record.id } });
      await tx.passwordResetToken.create({
        data: {
          userId: record.id,
          tokenHash: hashToken(activationToken),
          expiresAt,
        },
      });

      return record;
    });

    results.push({
      email: student.email,
      name: user.name,
      userId: user.id,
      activationUrl: buildActivationUrl(activationToken, student.email),
      outcome: classification,
    });
  }

  return {
    workspaceId: input.workspaceId,
    created: results.filter((r) => r.outcome === "created").length,
    alreadyActive: results.filter((r) => r.outcome === "already_active").length,
    linksIssued: results.filter((r) => r.activationUrl).length,
    students: results,
  };
}
