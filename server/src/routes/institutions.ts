import { Router, type Response } from "express";
import { z } from "zod";
import { requireAdmin, requireAuth, requireInstitution, type AuthedRequest } from "../middleware/auth.js";
import {
  InstitutionServiceError,
  addInstitutionStaff,
  getInstitutionOverview,
  getOwnInstitution,
  listInstitutionStaff,
  listInstitutionsForPlatformAdmin,
  removeInstitutionStaff,
  setInstitutionStatus,
  updateOwnInstitutionProfile,
} from "../services/institution.service.js";

export const institutionsRouter = Router();

function handleError(res: Response, err: unknown) {
  if (err instanceof InstitutionServiceError) {
    return res.status(err.statusCode).json({ error: err.message });
  }
  const message = err instanceof Error ? err.message : "Institution request failed";
  console.error("[institutions]", message, err);
  return res.status(500).json({ error: message });
}

const nullableText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => (value === "" ? null : value))
    .nullish();

/// Every field optional: this is the supplementary form an institution fills in
/// later from Settings, never a blocker on onboarding.
const updateProfileSchema = z.object({
  name: z.string().trim().min(2).max(200).optional(),
  website: nullableText(300),
  addressLine: nullableText(300),
  city: nullableText(120),
  state: nullableText(120),
  country: nullableText(120),
  pincode: nullableText(20),
  affiliation: nullableText(200),
  aicteCode: nullableText(60),
  naacGrade: nullableText(20),
  studentCount: z.coerce.number().int().min(0).max(1_000_000).nullish(),
  placementCellHead: nullableText(160),
  phone: nullableText(30),
  logoUrl: nullableText(600),
});

const addStaffSchema = z.object({
  email: z.string().email("Enter a valid email address."),
  role: z.enum(["owner", "manager", "reviewer"]).default("manager"),
});

institutionsRouter.get("/me", requireAuth, requireInstitution, async (req: AuthedRequest, res) => {
  try {
    return res.json(await getOwnInstitution(req.user!));
  } catch (err) {
    return handleError(res, err);
  }
});

institutionsRouter.patch("/me", requireAuth, requireInstitution, async (req: AuthedRequest, res) => {
  try {
    const parsed = updateProfileSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      const first = Object.values(parsed.error.flatten().fieldErrors).flat()[0];
      return res.status(400).json({ error: first ?? "Invalid institution profile payload." });
    }
    return res.json(await updateOwnInstitutionProfile(req.user!, parsed.data));
  } catch (err) {
    return handleError(res, err);
  }
});

institutionsRouter.get("/me/overview", requireAuth, requireInstitution, async (req: AuthedRequest, res) => {
  try {
    return res.json(await getInstitutionOverview(req.user!));
  } catch (err) {
    return handleError(res, err);
  }
});

institutionsRouter.get("/me/staff", requireAuth, requireInstitution, async (req: AuthedRequest, res) => {
  try {
    return res.json(await listInstitutionStaff(req.user!));
  } catch (err) {
    return handleError(res, err);
  }
});

institutionsRouter.post("/me/staff", requireAuth, requireInstitution, async (req: AuthedRequest, res) => {
  try {
    const parsed = addStaffSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      const first = Object.values(parsed.error.flatten().fieldErrors).flat()[0];
      return res.status(400).json({ error: first ?? "Invalid staff payload." });
    }
    return res.status(201).json(await addInstitutionStaff(req.user!, parsed.data));
  } catch (err) {
    return handleError(res, err);
  }
});

institutionsRouter.delete(
  "/me/staff/:userId",
  requireAuth,
  requireInstitution,
  async (req: AuthedRequest, res) => {
    try {
      return res.json(await removeInstitutionStaff(req.user!, String(req.params.userId)));
    } catch (err) {
      return handleError(res, err);
    }
  },
);

// --- Platform-admin approval surface ---

institutionsRouter.get("/admin/all", requireAdmin, async (req, res) => {
  try {
    const status = req.query.status;
    const parsed = z.enum(["pending", "approved", "suspended"]).safeParse(status);
    return res.json(
      await listInstitutionsForPlatformAdmin({ status: parsed.success ? parsed.data : undefined }),
    );
  } catch (err) {
    return handleError(res, err);
  }
});

institutionsRouter.post("/admin/:id/status", requireAdmin, async (req, res) => {
  try {
    const parsed = z
      .object({ status: z.enum(["pending", "approved", "suspended"]) })
      .safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({ error: "status must be pending, approved, or suspended." });
    }
    return res.json(await setInstitutionStatus(String(req.params.id), parsed.data.status));
  } catch (err) {
    return handleError(res, err);
  }
});
