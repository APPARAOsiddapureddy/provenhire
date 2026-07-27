import type { Request, Response } from "express";
import { z } from "zod";
import type { CollegeRequest } from "../middleware/collegeAuth.js";
import {
  CollegeCredentialServiceError,
  authenticateCollegeCredential,
  getCollegeWorkspaceDetails,
  listCollegeWorkspaceRegistrations,
  removeCollegeWorkspaceRegistration,
  restoreCollegeWorkspaceRegistration,
} from "../services/collegeCredential.service.js";
import {
  endCollegeWorkspace,
  startCollegeWorkspace,
} from "../services/collegeWorkspace.service.js";
import { getWorkspaceLeaderboardByCode } from "../services/workspaceRegistration.service.js";
import { signJwt } from "../utils/jwt.js";

const signInSchema = z.object({
  userId: z.string().trim().min(1).max(320),
  password: z.string().min(1).max(200),
});

export async function collegeSignInController(req: Request, res: Response) {
  if (!process.env.JWT_SECRET) {
    console.error("[college/sign-in] JWT_SECRET is not configured");
    return res
      .status(500)
      .json({ error: "Server configuration error. Contact support." });
  }

  const parsed = signInSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid sign-in payload" });
  }

  try {
    const credential = await authenticateCollegeCredential(
      parsed.data.userId,
      parsed.data.password,
    );
    // College logins are not User rows, so no refresh token is issued here.
    const token = signJwt({ userId: credential.userId, role: "college" });
    return res.json({
      college: {
        userId: credential.userId,
        workspaceId: credential.workspaceId,
      },
      token,
      expiresIn: 15 * 60,
    });
  } catch (error) {
    if (error instanceof CollegeCredentialServiceError) {
      const body: { error: string; code?: string } = { error: error.message };
      if (error.statusCode === 403) body.code = "ACCOUNT_INACTIVE";
      return res.status(error.statusCode).json(body);
    }
    const message = error instanceof Error ? error.message : "Sign-in failed";
    console.error("[college/sign-in]", message, error);
    return res.status(500).json({ error: "Sign-in failed" });
  }
}

function sendCollegeError(res: Response, scope: string, error: unknown) {
  const statusCode = (error as { statusCode?: number } | null)?.statusCode;
  if (typeof statusCode === "number" && statusCode < 500) {
    return res
      .status(statusCode)
      .json({ error: (error as Error).message });
  }
  console.error(`[college/${scope}]`, error);
  return res.status(500).json({ error: "College request failed" });
}

/** Workspace details for the signed-in college, including draft workspaces. */
export async function getCollegeWorkspaceController(
  req: CollegeRequest,
  res: Response,
) {
  try {
    const workspace = await getCollegeWorkspaceDetails(req.college!.workspaceId);
    return res.json({ college: req.college, workspace });
  } catch (error) {
    return sendCollegeError(res, "workspace", error);
  }
}

const leaderboardQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().trim().min(1).optional(),
});

/** Leaderboard scoped to the signed-in college's own workspace. */
export async function getCollegeLeaderboardController(
  req: CollegeRequest,
  res: Response,
) {
  const parsed = leaderboardQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid leaderboard query" });
  }

  try {
    const workspace = await getCollegeWorkspaceDetails(req.college!.workspaceId);
    // Rankings only exist once the workspace is live; drafts get an explicit empty state
    // instead of the 404 the underlying service would raise.
    if (!["published", "started", "ended"].includes(workspace.status)) {
      return res.json({
        available: false,
        status: workspace.status,
        leaderboard: [],
        nextCursor: null,
      });
    }
    const result = await getWorkspaceLeaderboardByCode(
      { id: req.college!.userId, role: "college" },
      workspace.code,
      parsed.data,
    );
    return res.json({ available: true, status: workspace.status, ...result });
  } catch (error) {
    return sendCollegeError(res, "leaderboard", error);
  }
}

/** Opens the workspace for attempts. Only valid from `published`. */
export async function startCollegeWorkspaceController(
  req: CollegeRequest,
  res: Response,
) {
  try {
    const workspace = await startCollegeWorkspace(
      req.college!.workspaceId,
      req.college!.userId,
    );
    return res.json({ workspace });
  } catch (error) {
    return sendCollegeError(res, "workspace/start", error);
  }
}

/** Closes the workspace and finalizes every in-flight attempt. Only valid from `started`. */
export async function endCollegeWorkspaceController(
  req: CollegeRequest,
  res: Response,
) {
  try {
    const workspace = await endCollegeWorkspace(
      req.college!.workspaceId,
      req.college!.userId,
    );
    return res.json({ workspace });
  } catch (error) {
    return sendCollegeError(res, "workspace/end", error);
  }
}

const registrationSearchSchema = z.object({
  q: z.string().trim().max(160).optional(),
});

/** Candidates who joined this college's workspace, optionally filtered by name/email. */
export async function listCollegeRegistrationsController(
  req: CollegeRequest,
  res: Response,
) {
  const parsed = registrationSearchSchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid search query" });
  }
  try {
    const registrations = await listCollegeWorkspaceRegistrations(
      req.college!.workspaceId,
      parsed.data.q,
    );
    return res.json({ registrations });
  } catch (error) {
    return sendCollegeError(res, "registrations", error);
  }
}

export async function removeCollegeRegistrationController(
  req: CollegeRequest,
  res: Response,
) {
  try {
    const registration = await removeCollegeWorkspaceRegistration(
      req.college!.workspaceId,
      req.college!.userId,
      req.params.userId,
    );
    return res.json({ registration });
  } catch (error) {
    return sendCollegeError(res, "registrations/remove", error);
  }
}

export async function restoreCollegeRegistrationController(
  req: CollegeRequest,
  res: Response,
) {
  try {
    const registration = await restoreCollegeWorkspaceRegistration(
      req.college!.workspaceId,
      req.college!.userId,
      req.params.userId,
    );
    return res.json({ registration });
  } catch (error) {
    return sendCollegeError(res, "registrations/restore", error);
  }
}
