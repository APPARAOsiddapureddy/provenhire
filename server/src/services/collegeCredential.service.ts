import bcrypt from "bcrypt";
import type { Prisma } from "@prisma/client";
import { prisma } from "../config/prisma.js";

const COLLEGE_EMAIL_DOMAIN = "provenhire.in";
const COLLEGE_PASSWORD_SUFFIX = "123456";
const BCRYPT_ROUNDS = 10;

export class CollegeCredentialServiceError extends Error {
  constructor(
    message: string,
    public statusCode = 400,
  ) {
    super(message);
    this.name = "CollegeCredentialServiceError";
  }
}

export type GeneratedCollegeCredential = {
  userId: string;
  password: string;
};

/** Strip everything that is not a letter or digit, e.g. "Anits College" -> "anitscollege". */
function normalizeCollegeName(organization: string): string {
  const normalized = organization.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (!normalized) {
    throw new CollegeCredentialServiceError(
      "Organization name must contain at least one letter or digit.",
    );
  }
  return normalized;
}

/**
 * Workspace codes look like `PH-ANITS-COLLEGE-2026-0473`; the credential reuses the
 * trailing random number so the login id maps 1:1 onto the workspace code.
 */
function randomSuffixFromWorkspaceCode(workspaceCode: string): string {
  const suffix = workspaceCode.split("-").pop() ?? "";
  if (!/^\d+$/.test(suffix)) {
    throw new CollegeCredentialServiceError(
      `Workspace code "${workspaceCode}" does not end in a random number.`,
      500,
    );
  }
  return suffix;
}

/** Pure derivation of the college login id and password. No database access. */
export function buildCollegeCredential(
  organization: string,
  workspaceCode: string,
): GeneratedCollegeCredential {
  const collegeName = normalizeCollegeName(organization);
  const suffix = randomSuffixFromWorkspaceCode(workspaceCode);
  const capitalized =
    collegeName.charAt(0).toUpperCase() + collegeName.slice(1);

  return {
    userId: `${collegeName}${suffix}@${COLLEGE_EMAIL_DOMAIN}`,
    password: `${capitalized}${COLLEGE_PASSWORD_SUFFIX}`,
  };
}

export function hashCollegePassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

/**
 * Persists a credential for a freshly created workspace. Runs inside the caller's
 * transaction so a workspace is never created without its login.
 */
export async function createCollegeCredentialForWorkspace(
  tx: Prisma.TransactionClient,
  workspace: { id: string; organization: string; code: string },
  passwordHash: string,
): Promise<{ userId: string }> {
  const { userId } = buildCollegeCredential(
    workspace.organization,
    workspace.code,
  );
  await tx.collegeCredential.create({
    data: { userId, workspaceId: workspace.id, passwordHash },
  });
  return { userId };
}

/** Called when a workspace is archived so its login stops working. */
export async function deactivateCollegeCredentialForWorkspace(
  workspaceId: string,
): Promise<void> {
  await prisma.collegeCredential.updateMany({
    where: { workspaceId, isActive: true },
    data: { isActive: false },
  });
}

/**
 * Full workspace details for the college portal. Unlike the public by-code lookup this
 * also serves draft workspaces, because a college receives its login at creation time.
 */
export async function getCollegeWorkspaceDetails(workspaceId: string) {
  const workspace = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: {
      id: true,
      name: true,
      organization: true,
      targetRole: true,
      code: true,
      startAt: true,
      endAt: true,
      status: true,
      accessMode: true,
      totalRounds: true,
      createdAt: true,
      rounds: {
        orderBy: { order: "asc" as const },
        select: {
          id: true,
          order: true,
          name: true,
          type: true,
          questionCount: true,
          timeLimitMins: true,
          scoreWeightage: true,
          questionType: true,
          easyCount: true,
          mediumCount: true,
          hardCount: true,
        },
      },
      _count: { select: { registrations: true } },
    },
  });
  if (!workspace) {
    throw new CollegeCredentialServiceError("Workspace not found.", 404);
  }
  return workspace;
}

/**
 * Admin-facing credential lookup. The stored hash cannot be reversed, but the password is
 * a deterministic function of the organization name, so it is re-derived on read instead
 * of being persisted in plain text.
 */
export async function getCollegeCredentialForAdmin(workspaceId: string) {
  const credential = await prisma.collegeCredential.findUnique({
    where: { workspaceId },
    select: {
      userId: true,
      isActive: true,
      createdAt: true,
      workspace: { select: { organization: true, code: true } },
    },
  });
  if (!credential) {
    throw new CollegeCredentialServiceError(
      "No college login exists for this workspace.",
      404,
    );
  }
  const { password } = buildCollegeCredential(
    credential.workspace.organization,
    credential.workspace.code,
  );
  return {
    userId: credential.userId,
    password,
    isActive: credential.isActive,
    createdAt: credential.createdAt,
  };
}

/**
 * Verifies a college login. Inactive accounts are rejected before the password is
 * ever compared, so archived workspaces can never sign in.
 */
export async function authenticateCollegeCredential(
  userId: string,
  password: string,
) {
  const normalizedUserId = userId.trim().toLowerCase();
  const credential = await prisma.collegeCredential.findUnique({
    where: { userId: normalizedUserId },
  });
  if (!credential) {
    throw new CollegeCredentialServiceError("Invalid credentials.", 401);
  }
  if (!credential.isActive) {
    throw new CollegeCredentialServiceError(
      "This college account is inactive.",
      403,
    );
  }
  const ok = await bcrypt.compare(password, credential.passwordHash);
  if (!ok) {
    throw new CollegeCredentialServiceError("Invalid credentials.", 401);
  }
  return credential;
}
