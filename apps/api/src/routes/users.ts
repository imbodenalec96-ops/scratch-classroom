import { Router, Response } from "express";
import bcrypt from "bcrypt";
import db from "../db.js";
import { AuthRequest } from "../middleware/auth.js";
import { requireRole } from "../middleware/rbac.js";

const router = Router();

// List all users (admin)
router.get("/", requireRole("admin"), async (_req: AuthRequest, res: Response) => {
  const rows = await db.prepare(
    "SELECT id, email, name, role, avatar_url, created_at FROM users ORDER BY created_at DESC"
  ).all();
  res.json(rows);
});

// Reset a user's password (admin — used for students who forgot their passcode)
router.post("/:id/reset-password", requireRole("admin"), async (req: AuthRequest, res: Response) => {
  const { password } = req.body || {};
  if (typeof password !== "string" || password.length < 1) {
    return res.status(400).json({ error: "password required" });
  }
  const row = await db.prepare("SELECT id, email, name FROM users WHERE id = ?").get(req.params.id) as any;
  if (!row) return res.status(404).json({ error: "user not found" });
  const hash = await bcrypt.hash(password, 10);
  await db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(hash, req.params.id);
  res.json({ ok: true, id: row.id, name: row.name });
});

// Update a user's profile (admin — name, email, role)
router.put("/:id", requireRole("admin"), async (req: AuthRequest, res: Response) => {
  const { name, email, role } = req.body || {};
  const existing = await db.prepare("SELECT id FROM users WHERE id = ?").get(req.params.id) as any;
  if (!existing) return res.status(404).json({ error: "user not found" });
  if (role && !["admin", "teacher", "student"].includes(role)) {
    return res.status(400).json({ error: "invalid role" });
  }
  const updates: string[] = [];
  const bindings: any[] = [];
  if (typeof name === "string" && name.trim()) { updates.push("name = ?"); bindings.push(name.trim()); }
  if (typeof email === "string" && email.trim()) { updates.push("email = ?"); bindings.push(email.trim().toLowerCase()); }
  if (typeof role === "string") { updates.push("role = ?"); bindings.push(role); }
  if (!updates.length) return res.status(400).json({ error: "nothing to update" });
  bindings.push(req.params.id);
  await db.prepare(`UPDATE users SET ${updates.join(", ")} WHERE id = ?`).run(...bindings);
  const row = await db.prepare("SELECT id, email, name, role FROM users WHERE id = ?").get(req.params.id);
  res.json(row);
});

// Update user role (admin)
router.put("/:id/role", requireRole("admin"), async (req: AuthRequest, res: Response) => {
  const { role } = req.body;
  if (!["admin", "teacher", "student"].includes(role)) {
    return res.status(400).json({ error: "Invalid role" });
  }
  await db.prepare("UPDATE users SET role = ? WHERE id = ?").run(role, req.params.id);
  const row = await db.prepare("SELECT id, email, name, role FROM users WHERE id = ?").get(req.params.id);
  res.json(row);
});

// Delete user (admin)
router.delete("/:id", requireRole("admin"), async (req: AuthRequest, res: Response) => {
  await db.prepare("DELETE FROM users WHERE id = ?").run(req.params.id);
  res.json({ deleted: true });
});

export default router;
