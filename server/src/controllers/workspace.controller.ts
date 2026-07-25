import type { Response } from "express";
import { z } from "zod";
import type { AuthedRequest } from "../middleware/auth.js";
import {
  CollegeCredentialServiceError,
  getCollegeCredentialForAdmin,
} from "../services/collegeCredential.service.js";
import {
  MAX_WORKSPACE_ROUNDS,
  WorkspaceServiceError,
  archiveWorkspace,
  createWorkspace,
  deleteWorkspace,
  endWorkspace,
  getSqlTaskAvailability,
  getWorkspace,
  listWorkspaces,
  publishWorkspace,
  replaceWorkspaceRounds,
  startWorkspace,
  updateWorkspace,
} from "../services/workspace.service.js";

const workspaceStatusSchema = z.enum([
  "draft",
  "published",
  "started",
  "ended",
  "archived",
]);
const workspaceAccessModeSchema = z.enum(["public", "invite_only"]);
const workspaceRoundTypeSchema = z.enum(["mcq", "coding", "interview", "sql"]);
const workspaceQuestionTypeSchema = z.enum(["random", "fixed"]);
const dateSchema = z.coerce
  .date()
  .refine((date) => !Number.isNaN(date.getTime()), "Invalid date");

const createWorkspaceSchema = z.object({
  name: z.string().trim().min(1).max(160),
  organization: z.string().trim().min(1).max(160),
  targetRole: z.string().trim().min(2).max(160),
  responsibilities: z.array(z.string().trim().min(3).max(500)).min(3).max(12),
  startAt: dateSchema,
  endAt: dateSchema,
  totalRounds: z.number().int().min(1).max(MAX_WORKSPACE_ROUNDS),
  accessMode: workspaceAccessModeSchema.optional(),
});

const updateWorkspaceSchema = z.object({
  name: z.string().trim().min(1).max(160).optional(),
  organization: z.string().trim().min(1).max(160).optional(),
  targetRole: z.string().trim().min(2).max(160).optional(),
  responsibilities: z
    .array(z.string().trim().min(3).max(500))
    .min(3)
    .max(12)
    .optional(),
  startAt: dateSchema.optional(),
  endAt: dateSchema.optional(),
  totalRounds: z.number().int().min(1).max(MAX_WORKSPACE_ROUNDS).optional(),
  accessMode: workspaceAccessModeSchema.optional(),
});

const replaceRoundsSchema = z.object({
  rounds: z
    .array(
      z.object({
        order: z.number().int().min(1).max(MAX_WORKSPACE_ROUNDS),
        name: z.string().trim().min(1).max(160),
        type: workspaceRoundTypeSchema,
        questionType: workspaceQuestionTypeSchema.optional(),
        questionCount: z.number().int().min(1).max(200),
        timeLimitMins: z.number().int().min(1).max(480),
        scoreWeightage: z.number().int().min(1).max(100),
        easyCount: z.number().int().min(0).max(200).default(0),
        mediumCount: z.number().int().min(0).max(200).default(0),
        hardCount: z.number().int().min(0).max(200).default(0),
      }),
    )
    .min(1)
    .max(MAX_WORKSPACE_ROUNDS),
});

function creatorFromRequest(req: AuthedRequest) {
  return { id: req.user!.id, role: req.user!.role };
}

function sendError(res: Response, error: unknown) {
  if (
    error instanceof WorkspaceServiceError ||
    error instanceof CollegeCredentialServiceError
  ) {
    return res.status(error.statusCode).json({ error: error.message });
  }
  console.error("[workspace]", error);
  const message = error instanceof Error ? error.message : "Workspace operation failed.";
  // In non-production show error details to aid debugging.
  if (process.env.NODE_ENV === "production") {
    return res.status(500).json({ error: "Workspace operation failed." });
  }
  return res.status(500).json({ error: message, details: error instanceof Error ? error.stack : undefined });
}

export async function createWorkspaceController(
  req: AuthedRequest,
  res: Response,
) {
  const parsed = createWorkspaceSchema.safeParse(req.body);
  if (!parsed.success) {
    return res
      .status(400)
      .json({
        error: "Invalid workspace payload",
        details: parsed.error.flatten(),
      });
  }

  try {
    const { workspace, credentials } = await createWorkspace(
      creatorFromRequest(req),
      parsed.data,
    );
    // The plain password is returned once, at creation, so it can be handed to the college.
    return res.status(201).json({ workspace, credentials });
  } catch (error) {
    return sendError(res, error);
  }
}

export async function listWorkspacesController(
  req: AuthedRequest,
  res: Response,
) {
  const querySchema = z.object({
    status: workspaceStatusSchema.optional(),
    organization: z.string().trim().optional(),
    startFrom: dateSchema.optional(),
    endTo: dateSchema.optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
  });
  const parsed = querySchema.safeParse(req.query);
  if (!parsed.success) {
    return res
      .status(400)
      .json({ error: "Invalid query", details: parsed.error.flatten() });
  }

  try {
    const result = await listWorkspaces(creatorFromRequest(req), parsed.data);
    return res.json(result);
  } catch (error) {
    return sendError(res, error);
  }
}

export async function getWorkspaceSqlTaskAvailabilityController(
  req: AuthedRequest,
  res: Response,
) {
  try {
    const availability = await getSqlTaskAvailability(creatorFromRequest(req));
    return res.json({ availability });
  } catch (error) {
    return sendError(res, error);
  }
}

export async function getWorkspaceController(
  req: AuthedRequest,
  res: Response,
) {
  try {
    const workspace = await getWorkspace(
      creatorFromRequest(req),
      req.params.id,
    );
    return res.json({ workspace });
  } catch (error) {
    return sendError(res, error);
  }
}

export async function updateWorkspaceController(
  req: AuthedRequest,
  res: Response,
) {
  const parsed = updateWorkspaceSchema.safeParse(req.body);
  if (!parsed.success) {
    return res
      .status(400)
      .json({
        error: "Invalid workspace payload",
        details: parsed.error.flatten(),
      });
  }

  try {
    const workspace = await updateWorkspace(
      creatorFromRequest(req),
      req.params.id,
      parsed.data,
    );
    return res.json({ workspace });
  } catch (error) {
    return sendError(res, error);
  }
}

export async function replaceWorkspaceRoundsController(
  req: AuthedRequest,
  res: Response,
) {
  const parsed = replaceRoundsSchema.safeParse(req.body);
  if (!parsed.success) {
    return res
      .status(400)
      .json({
        error: "Invalid rounds payload",
        details: parsed.error.flatten(),
      });
  }

  try {
    const rounds = await replaceWorkspaceRounds(
      creatorFromRequest(req),
      req.params.id,
      parsed.data.rounds,
    );
    return res.json({ rounds });
  } catch (error) {
    return sendError(res, error);
  }
}

export async function publishWorkspaceController(
  req: AuthedRequest,
  res: Response,
) {
  try {
    const workspace = await publishWorkspace(
      creatorFromRequest(req),
      req.params.id,
    );
    return res.json({ workspace, code: workspace.code });
  } catch (error) {
    return sendError(res, error);
  }
}

export async function startWorkspaceController(
  req: AuthedRequest,
  res: Response,
) {
  try {
    const workspace = await startWorkspace(
      creatorFromRequest(req),
      req.params.id,
    );
    return res.json({ workspace });
  } catch (error) {
    return sendError(res, error);
  }
}

export async function endWorkspaceController(
  req: AuthedRequest,
  res: Response,
) {
  try {
    const workspace = await endWorkspace(
      creatorFromRequest(req),
      req.params.id,
    );
    return res.json({ workspace });
  } catch (error) {
    return sendError(res, error);
  }
}

export async function updateWorkspaceStatusController(
  req: AuthedRequest,
  res: Response,
) {
  const parsed = z.object({ status: z.enum(["archived"]) }).safeParse(req.body);
  if (!parsed.success) {
    return res
      .status(400)
      .json({
        error: "Invalid status payload",
        details: parsed.error.flatten(),
      });
  }

  try {
    const workspace = await archiveWorkspace(
      creatorFromRequest(req),
      req.params.id,
    );
    return res.json({ workspace });
  } catch (error) {
    return sendError(res, error);
  }
}

/** Lets an admin re-read the college login so it can be shared with the college. */
export async function getWorkspaceCollegeCredentialsController(
  req: AuthedRequest,
  res: Response,
) {
  try {
    // Ownership check first, so one admin cannot read another owner's credentials.
    await getWorkspace(creatorFromRequest(req), req.params.id);
    const credentials = await getCollegeCredentialForAdmin(req.params.id);
    return res.json({ credentials });
  } catch (error) {
    return sendError(res, error);
  }
}

export async function deleteWorkspaceController(
  req: AuthedRequest,
  res: Response,
) {
  try {
    const result = await deleteWorkspace(
      creatorFromRequest(req),
      req.params.id,
    );
    return res.json(result);
  } catch (error) {
    return sendError(res, error);
  }
}
