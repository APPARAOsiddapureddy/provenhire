/**
 * Lifecycle actions a college can take on its own workspace.
 *
 * Kept out of collegeCredential.service.ts on purpose: workspace.service.ts already
 * imports that module, so putting these there would introduce an import cycle.
 */
import { prisma } from "../config/prisma.js";
import {
  applyWorkspaceEnd,
  applyWorkspaceStart,
  syncWorkspaceLifecycle,
} from "./workspace.service.js";
import { CollegeCredentialServiceError } from "./collegeCredential.service.js";

async function loadOwnWorkspace(workspaceId: string) {
  const workspace = await prisma.workspace.findUnique({
    where: { id: workspaceId },
  });
  if (!workspace) {
    throw new CollegeCredentialServiceError("Workspace not found.", 404);
  }
  return workspace;
}

function collegeActor(collegeUserId: string) {
  return {
    userId: null,
    audit: { type: "college", userId: collegeUserId },
  };
}

export async function startCollegeWorkspace(
  workspaceId: string,
  collegeUserId: string,
) {
  // Picks up the automatic published -> ended transition before deciding.
  await syncWorkspaceLifecycle(workspaceId);
  const workspace = await loadOwnWorkspace(workspaceId);
  return applyWorkspaceStart(workspace, collegeActor(collegeUserId));
}

export async function endCollegeWorkspace(
  workspaceId: string,
  collegeUserId: string,
) {
  const workspace = await loadOwnWorkspace(workspaceId);
  return applyWorkspaceEnd(workspace, collegeActor(collegeUserId));
}
