import assert from "node:assert/strict";

import {
  canManageWorkspace,
  canReviewWorkspace,
  resolveWorkspaceAccessLevel,
  type WorkspaceAccessInput,
} from "../src/services/workspaceAccess.js";

const INST_A = "institution-a";
const INST_B = "institution-b";

function input(overrides: Partial<WorkspaceAccessInput> = {}): WorkspaceAccessInput {
  return {
    actorId: "actor",
    actorRole: "institution",
    workspaceOwnerUserId: "someone-else",
    workspaceInstitutionId: INST_A,
    workspaceMemberRole: null,
    actorInstitution: null,
    ...overrides,
  };
}

let passed = 0;
function check(label: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`  ok  ${label}`);
}

console.log("workspace access - tenant isolation");

// --- The core cross-tenant denial. This is the whole reason institutions get
// their own role instead of reusing `admin`. ---
check("institution B staff CANNOT manage institution A's drive", () => {
  assert.equal(
    canManageWorkspace(
      input({ actorInstitution: { institutionId: INST_B, role: "owner" } }),
    ),
    false,
  );
});

check("institution B staff CANNOT even review institution A's drive", () => {
  assert.equal(
    canReviewWorkspace(
      input({ actorInstitution: { institutionId: INST_B, role: "owner" } }),
    ),
    false,
  );
});

check("institution A owner CAN manage institution A's drive", () => {
  assert.equal(
    canManageWorkspace(
      input({ actorInstitution: { institutionId: INST_A, role: "owner" } }),
    ),
    true,
  );
});

check("institution A manager CAN manage institution A's drive", () => {
  assert.equal(
    canManageWorkspace(
      input({ actorInstitution: { institutionId: INST_A, role: "manager" } }),
    ),
    true,
  );
});

check("institution A reviewer can review but NOT manage", () => {
  const actorInstitution = { institutionId: INST_A, role: "reviewer" as const };
  assert.equal(canManageWorkspace(input({ actorInstitution })), false);
  assert.equal(canReviewWorkspace(input({ actorInstitution })), true);
});

// --- A recruiter/platform-admin workspace has institutionId === null. No
// institution staff should ever reach it via the institution branch. ---
check("institution staff CANNOT reach a non-institution workspace", () => {
  assert.equal(
    canManageWorkspace(
      input({
        workspaceInstitutionId: null,
        actorInstitution: { institutionId: INST_A, role: "owner" },
      }),
    ),
    false,
  );
});

check("null institutionId on both sides does not grant access", () => {
  assert.equal(
    canManageWorkspace(
      input({ workspaceInstitutionId: null, actorInstitution: null }),
    ),
    false,
  );
});

// --- Existing behaviour must not regress. ---
check("platform admin still manages any workspace", () => {
  assert.equal(
    canManageWorkspace(input({ actorRole: "admin", workspaceInstitutionId: INST_A })),
    true,
  );
  assert.equal(
    canManageWorkspace(input({ actorRole: "admin", workspaceInstitutionId: null })),
    true,
  );
});

check("the workspace owner still manages their own workspace", () => {
  assert.equal(
    canManageWorkspace(
      input({ actorId: "owner-1", workspaceOwnerUserId: "owner-1" }),
    ),
    true,
  );
});

check("per-workspace owner/manager member still manages", () => {
  assert.equal(canManageWorkspace(input({ workspaceMemberRole: "owner" })), true);
  assert.equal(canManageWorkspace(input({ workspaceMemberRole: "manager" })), true);
});

check("per-workspace reviewer member is read-only", () => {
  assert.equal(canManageWorkspace(input({ workspaceMemberRole: "reviewer" })), false);
  assert.equal(canReviewWorkspace(input({ workspaceMemberRole: "reviewer" })), true);
});

check("a stranger with no membership gets nothing", () => {
  assert.equal(resolveWorkspaceAccessLevel(input()), "none");
});

// --- An explicit per-workspace reviewer row must not be silently upgraded to
// manage by a broader institution role. The narrower, more specific grant on
// the drive itself wins. ---
check("explicit per-drive reviewer is not upgraded by institution manager role", () => {
  assert.equal(
    canManageWorkspace(
      input({
        workspaceMemberRole: "reviewer",
        actorInstitution: { institutionId: INST_A, role: "manager" },
      }),
    ),
    false,
  );
});

// --- A recruiter must not gain anything from the institution branch. ---
check("recruiter role gains nothing from an institution membership", () => {
  assert.equal(
    canManageWorkspace(
      input({
        actorRole: "recruiter",
        workspaceInstitutionId: INST_A,
        actorInstitution: { institutionId: INST_B, role: "owner" },
      }),
    ),
    false,
  );
});

console.log(`\n${passed}/${passed} workspace access checks passed`);
