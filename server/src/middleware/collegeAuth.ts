import type { NextFunction, Request, Response } from "express";
import { prisma } from "../config/prisma.js";
import { verifyJwt } from "../utils/jwt.js";

export interface CollegeRequest extends Request {
  college?: { userId: string; workspaceId: string };
}

/**
 * Guards the college portal. The credential is re-read on every request so archiving a
 * workspace immediately invalidates sessions that were issued before the archive.
 */
export async function requireCollegeAuth(
  req: CollegeRequest,
  res: Response,
  next: NextFunction,
) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: "Unauthorized" });

  let userId: string;
  try {
    const payload = verifyJwt(token);
    if (payload.role !== "college") {
      return res.status(403).json({ error: "College access required" });
    }
    userId = payload.userId;
  } catch {
    return res.status(401).json({ error: "Invalid token" });
  }

  const credential = await prisma.collegeCredential.findUnique({
    where: { userId },
    select: { userId: true, workspaceId: true, isActive: true },
  });
  if (!credential) return res.status(401).json({ error: "Invalid token" });
  if (!credential.isActive) {
    return res
      .status(403)
      .json({ error: "This college account is inactive.", code: "ACCOUNT_INACTIVE" });
  }

  req.college = { userId: credential.userId, workspaceId: credential.workspaceId };
  return next();
}
