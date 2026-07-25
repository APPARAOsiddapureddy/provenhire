import { prisma } from "../config/prisma.js";
import type { WorkspaceMemberRoleName } from "./workspaceAccess.js";

export class InstitutionServiceError extends Error {
  constructor(
    message: string,
    public statusCode = 400,
  ) {
    super(message);
    this.name = "InstitutionServiceError";
  }
}

export type InstitutionActor = { id: string; role: string };

const MANAGING_ROLES: readonly WorkspaceMemberRoleName[] = ["owner", "manager"];

/// Resolves the institution the actor is active staff of, plus their role.
/// Every institution-scoped read/write in this service goes through here, so a
/// user can only ever touch their own tenant.
export async function resolveInstitutionContext(actor: InstitutionActor): Promise<{
  institutionId: string;
  role: WorkspaceMemberRoleName;
}> {
  const membership = await prisma.institutionMember.findFirst({
    where: { userId: actor.id, removedAt: null },
    select: { institutionId: true, role: true },
    orderBy: { createdAt: "asc" },
  });
  if (!membership) {
    throw new InstitutionServiceError(
      "No institution is linked to this account.",
      403,
    );
  }
  return { institutionId: membership.institutionId, role: membership.role };
}

function assertCanManageInstitution(role: WorkspaceMemberRoleName): void {
  if (!MANAGING_ROLES.includes(role)) {
    throw new InstitutionServiceError(
      "Your role on this institution is read-only.",
      403,
    );
  }
}

const INSTITUTION_PUBLIC_SELECT = {
  id: true,
  name: true,
  slug: true,
  contactEmail: true,
  status: true,
  website: true,
  addressLine: true,
  city: true,
  state: true,
  country: true,
  pincode: true,
  affiliation: true,
  aicteCode: true,
  naacGrade: true,
  studentCount: true,
  placementCellHead: true,
  phone: true,
  logoUrl: true,
  approvedAt: true,
  createdAt: true,
} as const;

export async function getOwnInstitution(actor: InstitutionActor) {
  const { institutionId, role } = await resolveInstitutionContext(actor);
  const institution = await prisma.institution.findUniqueOrThrow({
    where: { id: institutionId },
    select: INSTITUTION_PUBLIC_SELECT,
  });
  return {
    institution,
    membership: { role },
    /// Drafts are always allowed; publishing a live drive to real students is
    /// what waits on platform approval.
    canPublishDrives: institution.status === "approved",
  };
}

export type UpdateInstitutionProfileInput = {
  name?: string;
  website?: string | null;
  addressLine?: string | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
  pincode?: string | null;
  affiliation?: string | null;
  aicteCode?: string | null;
  naacGrade?: string | null;
  studentCount?: number | null;
  placementCellHead?: string | null;
  phone?: string | null;
  logoUrl?: string | null;
};

export async function updateOwnInstitutionProfile(
  actor: InstitutionActor,
  input: UpdateInstitutionProfileInput,
) {
  const { institutionId, role } = await resolveInstitutionContext(actor);
  assertCanManageInstitution(role);
  const institution = await prisma.institution.update({
    where: { id: institutionId },
    // `status`, `slug` and `contactEmail` are intentionally not updatable here:
    // status is a platform-approval decision, and the other two are identity.
    data: input,
    select: INSTITUTION_PUBLIC_SELECT,
  });
  return { institution };
}

/// Roll-up across every drive the institution owns. Deliberately aggregate-only
/// (no individual candidate rows) so it is cheap enough for a dashboard.
export async function getInstitutionOverview(actor: InstitutionActor) {
  const { institutionId } = await resolveInstitutionContext(actor);

  const [institution, drives, registrationCount, attemptGroups] = await Promise.all([
    prisma.institution.findUniqueOrThrow({
      where: { id: institutionId },
      select: { id: true, name: true, status: true },
    }),
    prisma.workspace.findMany({
      where: { institutionId },
      select: {
        id: true,
        name: true,
        code: true,
        status: true,
        targetRole: true,
        startAt: true,
        endAt: true,
        totalRounds: true,
        createdAt: true,
        _count: { select: { registrations: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.workspaceRegistration.count({
      where: { workspace: { institutionId }, status: "registered" },
    }),
    prisma.workspaceRoundAttempt.groupBy({
      by: ["roundType", "status"],
      where: { workspace: { institutionId } },
      _count: { _all: true },
    }),
  ]);

  const attemptsByRound: Record<string, { completed: number; inProgress: number }> = {};
  for (const group of attemptGroups) {
    const bucket = (attemptsByRound[group.roundType] ??= { completed: 0, inProgress: 0 });
    const isCompleted = group.status === "completed" || group.status === "auto_completed";
    if (isCompleted) bucket.completed += group._count._all;
    else if (group.status === "active") bucket.inProgress += group._count._all;
  }

  return {
    institution,
    totals: {
      drives: drives.length,
      liveDrives: drives.filter((d) => d.status === "published" || d.status === "started").length,
      draftDrives: drives.filter((d) => d.status === "draft").length,
      students: registrationCount,
    },
    attemptsByRound,
    drives: drives.map((drive) => ({
      id: drive.id,
      name: drive.name,
      code: drive.code,
      status: drive.status,
      targetRole: drive.targetRole,
      startAt: drive.startAt,
      endAt: drive.endAt,
      totalRounds: drive.totalRounds,
      createdAt: drive.createdAt,
      studentCount: drive._count.registrations,
    })),
  };
}

export async function listInstitutionStaff(actor: InstitutionActor) {
  const { institutionId } = await resolveInstitutionContext(actor);
  const members = await prisma.institutionMember.findMany({
    where: { institutionId },
    select: {
      id: true,
      role: true,
      removedAt: true,
      createdAt: true,
      user: { select: { id: true, name: true, email: true } },
    },
    orderBy: [{ removedAt: "asc" }, { createdAt: "asc" }],
  });
  return { members };
}

/// Adds an existing ProvenHire user as placement-cell staff. Deliberately does
/// not create accounts: the person signs up themselves, then is added here, so
/// no one else's password is ever handled on their behalf.
export async function addInstitutionStaff(
  actor: InstitutionActor,
  input: { email: string; role: WorkspaceMemberRoleName },
) {
  const { institutionId, role: actorRole } = await resolveInstitutionContext(actor);
  assertCanManageInstitution(actorRole);
  if (input.role === "owner" && actorRole !== "owner") {
    throw new InstitutionServiceError(
      "Only an owner can grant owner access.",
      403,
    );
  }

  const email = input.email.trim().toLowerCase();
  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, email: true, name: true, role: true },
  });
  if (!user) {
    throw new InstitutionServiceError(
      "That person does not have a ProvenHire account yet. Ask them to sign up first, then add them here.",
      404,
    );
  }

  const otherTenant = await prisma.institutionMember.findFirst({
    where: { userId: user.id, removedAt: null, institutionId: { not: institutionId } },
    select: { institutionId: true },
  });
  if (otherTenant) {
    throw new InstitutionServiceError(
      "That account already belongs to a different institution.",
      409,
    );
  }

  const member = await prisma.$transaction(async (tx) => {
    // Staff need the institution role to reach the portal at all; candidates
    // and recruiters keep their own role and are rejected above by the
    // "already belongs" / account-not-found paths.
    if (user.role !== "institution") {
      await tx.user.update({ where: { id: user.id }, data: { role: "institution" } });
    }
    return tx.institutionMember.upsert({
      where: { institutionId_userId: { institutionId, userId: user.id } },
      create: {
        institutionId,
        userId: user.id,
        role: input.role,
        invitedByUserId: actor.id,
      },
      update: {
        role: input.role,
        removedAt: null,
        removedByUserId: null,
        invitedByUserId: actor.id,
      },
      select: {
        id: true,
        role: true,
        createdAt: true,
        user: { select: { id: true, name: true, email: true } },
      },
    });
  });

  return { member };
}

export async function removeInstitutionStaff(
  actor: InstitutionActor,
  memberUserId: string,
) {
  const { institutionId, role: actorRole } = await resolveInstitutionContext(actor);
  assertCanManageInstitution(actorRole);

  const membership = await prisma.institutionMember.findUnique({
    where: { institutionId_userId: { institutionId, userId: memberUserId } },
    select: { id: true, role: true, removedAt: true },
  });
  if (!membership || membership.removedAt) {
    throw new InstitutionServiceError("That staff member was not found.", 404);
  }
  if (membership.role === "owner") {
    const activeOwners = await prisma.institutionMember.count({
      where: { institutionId, role: "owner", removedAt: null },
    });
    if (activeOwners <= 1) {
      throw new InstitutionServiceError(
        "This is the only owner. Transfer ownership before removing them.",
        409,
      );
    }
  }

  await prisma.institutionMember.update({
    where: { id: membership.id },
    data: { removedAt: new Date(), removedByUserId: actor.id },
  });
  return { ok: true };
}

/// Platform-admin surface: institutions awaiting approval.
export async function listInstitutionsForPlatformAdmin(filters: {
  status?: "pending" | "approved" | "suspended";
}) {
  const institutions = await prisma.institution.findMany({
    where: filters.status ? { status: filters.status } : {},
    select: {
      ...INSTITUTION_PUBLIC_SELECT,
      _count: { select: { workspaces: true, members: true } },
    },
    orderBy: { createdAt: "desc" },
  });
  return { institutions };
}

export async function setInstitutionStatus(
  institutionId: string,
  status: "pending" | "approved" | "suspended",
) {
  const institution = await prisma.institution.update({
    where: { id: institutionId },
    data: {
      status,
      approvedAt: status === "approved" ? new Date() : null,
    },
    select: INSTITUTION_PUBLIC_SELECT,
  });
  return { institution };
}

/// Publishing a live drive to real students requires an approved institution.
/// Drafts are always allowed so a college can build and explore immediately.
export async function assertInstitutionCanPublish(
  workspaceInstitutionId: string | null,
): Promise<void> {
  if (!workspaceInstitutionId) return;
  const institution = await prisma.institution.findUnique({
    where: { id: workspaceInstitutionId },
    select: { status: true },
  });
  if (!institution) return;
  if (institution.status === "approved") return;
  throw new InstitutionServiceError(
    institution.status === "suspended"
      ? "This institution account is suspended. Contact ProvenHire support."
      : "Your institution is pending verification. You can keep building this drive in draft — we'll enable publishing once verification completes.",
    403,
  );
}
