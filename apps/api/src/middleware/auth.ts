import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import type { User } from "@scratch/shared";

const JWT_SECRET = process.env.JWT_SECRET || "dev-secret";

export interface AuthRequest extends Request {
  user?: User;
}

export function authMiddleware(req: AuthRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Missing token" });
  }
  try {
    const payload = jwt.verify(header.slice(7), JWT_SECRET) as User;
    req.user = payload;
    next();
  } catch {
    return res.status(401).json({ error: "Invalid token" });
  }
}

export function signToken(user: User): string {
  return jwt.sign(
    { id: user.id, email: user.email, name: user.name, role: user.role },
    JWT_SECRET,
    { expiresIn: "24h" }
  );
}
