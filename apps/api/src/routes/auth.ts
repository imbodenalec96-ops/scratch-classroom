import { Router, Request, Response } from "express";
import bcrypt from "bcrypt";
import crypto from "crypto";
import db from "../db.js";
import { signToken } from "../middleware/auth.js";
import type { User } from "@scratch/shared";

const router = Router();

router.post("/register", async (req: Request, res: Response) => {
  try {
    const { password, name, role } = req.body;
    const email = String(req.body?.email || "").trim().toLowerCase();
    if (!email || !password || !name || !role) {
      return res.status(400).json({ error: "All fields required" });
    }
    const hash = await bcrypt.hash(password, 10);
    const id = crypto.randomUUID();
    try {
      await db.prepare(
        `INSERT INTO users (id, email, password_hash, name, role) VALUES (?, ?, ?, ?, ?)`
      ).run(id, email, hash, name, role);
    } catch (e: any) {
      if (e.code === "SQLITE_CONSTRAINT_UNIQUE" || e.code === "23505") return res.status(409).json({ error: "Email taken" });
      throw e;
    }
      const row = await db.prepare("SELECT id, email, name, role, avatar_url, created_at FROM users WHERE id = ?").get(id) as any;
    const user: User = {
      id: row.id,
      email: row.email,
      name: row.name,
      role: row.role,
      avatarUrl: row.avatar_url,
      createdAt: row.created_at,
    };
    res.json({ token: signToken(user), user });
  } catch (e: any) {
    console.error(e);
    res.status(500).json({ error: "Server error" });
  }
});

router.post("/login", async (req: Request, res: Response) => {
  try {
    const { password } = req.body;
    const email = String(req.body?.email || "").trim().toLowerCase();
    const row = await db.prepare("SELECT * FROM users WHERE LOWER(email) = LOWER(?)").get(email) as any;
    if (!row) return res.status(401).json({ error: "Invalid credentials" });
    const valid = await bcrypt.compare(password, row.password_hash);
    if (!valid) return res.status(401).json({ error: "Invalid credentials" });
    const user: User = {
      id: row.id,
      email: row.email,
      name: row.name,
      role: row.role,
      avatarUrl: row.avatar_url,
      createdAt: row.created_at,
    };
    res.json({ token: signToken(user), user });
  } catch {
    res.status(500).json({ error: "Server error" });
  }
});

router.get("/me", async (req: Request, res: Response) => {
  // Parse JWT manually since /api/auth routes don't go through authMiddleware
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Not authenticated" });
  }
  try {
    const jwt = await import("jsonwebtoken");
    const payload = jwt.default.verify(header.slice(7), process.env.JWT_SECRET || "dev-secret") as any;
    const row = await db.prepare("SELECT id, email, name, role, avatar_url, created_at FROM users WHERE id = ?").get(payload.id) as any;
    if (!row) return res.status(401).json({ error: "User not found" });
    res.json({
      id: row.id,
      email: row.email,
      name: row.name,
      role: row.role,
      avatarUrl: row.avatar_url,
      createdAt: row.created_at,
    });
  } catch {
    return res.status(401).json({ error: "Invalid token" });
  }
});

export default router;
