/// Pure authorization core for workspace access.
///
/// This is deliberately separated from the Prisma lookups in
/// workspaceRegistration.service.ts so the security-critical decision -
/// especially cross-tenant denial between two institutions - is unit-testable
/// without a database. See scripts/workspace-access-contract.ts.

export type WorkspaceMemberRoleName = "owner" | "manager" | "reviewer";

export type WorkspaceAccessLevel = "manage" | "review" | "none";

const MANAGING_MEMBER_ROLES: readonly WorkspaceMemberRoleName[] = ["owner", "manager"];

export type WorkspaceAccessInput = {
  actorId: string;
  actorRole: string;
  workspaceOwnerUserId: string;
  /// Null for recruiter- and platform-admin-owned workspaces.
  workspaceInstitutionId: string | null;
  /// Active per-workspace membership, or null if none/removed.
  workspaceMemberRole: WorkspaceMemberRoleName | null;
  /// The institution the actor is active staff of, or null. The tenant
  /// equality check against workspaceInstitutionId happens HERE rather than at
  /// the call site, so a caller cannot accidentally grant cross-tenant access
  /// by passing a membership from a different institution.
  actorInstitution: { institutionId: string; role: WorkspaceMemberRoleName } | null;
};

export function resolveWorkspaceAccessLevel(
  input: WorkspaceAccessInput,
): WorkspaceAccessLevel {
  // Platform superadmin. Note this is NOT a customer role - institutions get
  // UserRole.institution precisely so they never land in this branch.
  if (input.actorRole === "admin") return "manage";

  if (input.workspaceOwnerUserId === input.actorId) return "manage";

  if (input.workspaceMemberRole) {
    return MANAGING_MEMBER_ROLES.includes(input.workspaceMemberRole)
      ? "manage"
      : "review";
  }

  const actorInstitution = input.actorInstitution;
  if (
    actorInstitution &&
    input.workspaceInstitutionId &&
    actorInstitution.institutionId === input.workspaceInstitutionId
  ) {
    return MANAGING_MEMBER_ROLES.includes(actorInstitution.role)
      ? "manage"
      : "review";
  }

  return "none";
}

export function canManageWorkspace(input: WorkspaceAccessInput): boolean {
  return resolveWorkspaceAccessLevel(input) === "manage";
}

export function canReviewWorkspace(input: WorkspaceAccessInput): boolean {
  const level = resolveWorkspaceAccessLevel(input);
  return level === "manage" || level === "review";
}
