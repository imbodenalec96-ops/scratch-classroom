import { Router, Response } from "express";
import crypto from "crypto";
import db from "../db.js";
import { AuthRequest } from "../middleware/auth.js";
import { requireRole } from "../middleware/rbac.js";

const router = Router();

// Create assignment
router.post("/", requireRole("teacher", "admin"), async (req: AuthRequest, res: Response) => {
  const { classId, title, description, dueDate, rubric, starterProjectId } = req.body;
  const id = crypto.randomUUID();
  await db.prepare(
    `INSERT INTO assignments (id, class_id, teacher_id, title, description, due_date, rubric, starter_project_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(id, classId, req.user!.id, title, description, dueDate, JSON.stringify(rubric || []), starterProjectId);
  const row = await db.prepare("SELECT * FROM assignments WHERE id = ?").get(id) as any;
  row.rubric = JSON.parse(row.rubric || "[]");
  res.json(row);
});

// List assignments for a class
router.get("/class/:classId", async (req: AuthRequest, res: Response) => {
  const rows = await db.prepare(
    "SELECT * FROM assignments WHERE class_id = ? ORDER BY due_date ASC"
  ).all(req.params.classId) as any[];
  rows.forEach((r) => { r.rubric = JSON.parse(r.rubric || "[]"); });
  res.json(rows);
});

// Get single assignment
router.get("/:id", async (req: AuthRequest, res: Response) => {
  const row = await db.prepare("SELECT * FROM assignments WHERE id = ?").get(req.params.id) as any;
  if (!row) return res.status(404).json({ error: "Not found" });
  row.rubric = JSON.parse(row.rubric || "[]");
  res.json(row);
});

// Update assignment
router.put("/:id", requireRole("teacher", "admin"), async (req: AuthRequest, res: Response) => {
  const { title, description, dueDate, rubric } = req.body;
  await db.prepare(
    `UPDATE assignments SET title = COALESCE(?, title), description = COALESCE(?, description),
     due_date = COALESCE(?, due_date), rubric = COALESCE(?, rubric)
     WHERE id = ? AND teacher_id = ?`
  ).run(title, description, dueDate, rubric ? JSON.stringify(rubric) : null, req.params.id, req.user!.id);
  const row = await db.prepare("SELECT * FROM assignments WHERE id = ?").get(req.params.id) as any;
  if (row) row.rubric = JSON.parse(row.rubric || "[]");
  res.json(row);
});

// Delete assignment
router.delete("/:id", requireRole("teacher", "admin"), async (req: AuthRequest, res: Response) => {
  await db.prepare("DELETE FROM assignments WHERE id = ? AND teacher_id = ?").run(req.params.id, req.user!.id);
  res.json({ deleted: true });
});

export default router;
