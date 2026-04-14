import { Router, Response } from "express";
import db from "../db.js";
import { AuthRequest } from "../middleware/auth.js";
import { requireRole } from "../middleware/rbac.js";

const router = Router();

// List all users (admin)
router.get("/", requireRole("admin"), async (_req: AuthRequest, res: Response) => {
  const rows = db.prepare(
    "SELECT id, email, name, role, avatar_url, created_at FROM users ORDER BY created_at DESC"
  ).all();
  res.json(rows);
});

// Update user role (admin)
router.put("/:id/role", requireRole("admin"), async (req: AuthRequest, res: Response) => {
  const { role } = req.body;
  if (!["admin", "teacher", "student"].includes(role)) {
    return res.status(400).json({ error: "Invalid role" });
  }
  db.prepare("UPDATE users SET role = ? WHERE id = ?").run(role, req.params.id);
  const row = db.prepare("SELECT id, email, name, role FROM users WHERE id = ?").get(req.params.id);
  res.json(row);
});

// Delete user (admin)
router.delete("/:id", requireRole("admin"), async (req: AuthRequest, res: Response) => {
  db.prepare("DELETE FROM users WHERE id = ?").run(req.params.id);
  res.json({ deleted: true });
});

export default router;
