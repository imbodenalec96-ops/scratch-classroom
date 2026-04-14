import { Response, NextFunction } from "express";
import type { Role } from "@scratch/shared";
import { AuthRequest } from "./auth.js";

export function requireRole(...roles: Role[]) {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: "Forbidden" });
    }
    next();
  };
}
