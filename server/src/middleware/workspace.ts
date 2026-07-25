import type { Response, NextFunction } from "express";
import type { AuthedRequest } from "./auth.js";

export type WorkspaceCreatorRole = "admin" | "recruiter" | "institution";

export function allowWorkspaceCreator(roles: readonly WorkspaceCreatorRole[]) {
  const allowedRoles = new Set<string>(roles);

  return (req: AuthedRequest, res: Response, next: NextFunction) => {
    const role = req.user?.role;
    if (!role || !allowedRoles.has(role)) {
      return res.status(403).json({ error: "Workspace creator access required" });
    }
    return next();
  };
}
