import { Router, Response } from "express";
import crypto from "crypto";
import db from "../db.js";
import { AuthRequest } from "../middleware/auth.js";
import { requireRole } from "../middleware/rbac.js";

const router = Router();

// Create class
router.post("/", requireRole("teacher", "admin"), async (req: AuthRequest, res: Response) => {
  const { name } = req.body;
  const code = Math.random().toString(36).slice(2, 8).toUpperCase();
  const id = crypto.randomUUID();
  await db.prepare("INSERT INTO classes (id, name, teacher_id, code) VALUES (?, ?, ?, ?)").run(id, name, req.user!.id, code);
  const row = await db.prepare("SELECT * FROM classes WHERE id = ?").get(id);
  res.json(row);
});

// List classes for current user
router.get("/", async (req: AuthRequest, res: Response) => {
  const u = req.user!;
  let rows;
  if (u.role === "teacher" || u.role === "admin") {
    rows = await db.prepare("SELECT * FROM classes WHERE teacher_id = ? ORDER BY created_at DESC").all(u.id);
  } else {
    rows = await db.prepare(
      `SELECT c.* FROM classes c JOIN class_members cm ON c.id = cm.class_id WHERE cm.user_id = ? ORDER BY c.created_at DESC`
    ).all(u.id);
  }
  res.json(rows);
});

// Get single class
router.get("/:id", async (req: AuthRequest, res: Response) => {
  const row = await db.prepare("SELECT * FROM classes WHERE id = ?").get(req.params.id);
  if (!row) return res.status(404).json({ error: "Not found" });
  res.json(row);
});

// Join class by code
router.post("/join", requireRole("student"), async (req: AuthRequest, res: Response) => {
  const { code } = req.body;
  const cls = await db.prepare("SELECT id FROM classes WHERE code = ?").get(code) as any;
  if (!cls) return res.status(404).json({ error: "Invalid code" });
  await db.prepare("INSERT INTO class_members (user_id, class_id) VALUES (?, ?) ON CONFLICT DO NOTHING").run(req.user!.id, cls.id);
  res.json({ joined: cls.id });
});

// List students in class
router.get("/:id/students", requireRole("teacher", "admin"), async (req: AuthRequest, res: Response) => {
  const rows = await db.prepare(
    `SELECT u.id, u.email, u.name, u.role, cm.joined_at
     FROM users u JOIN class_members cm ON u.id = cm.user_id
     WHERE cm.class_id = ? ORDER BY u.name`
  ).all(req.params.id);
  res.json(rows);
});

// Bulk import students
router.post("/:id/import", requireRole("teacher", "admin"), async (req: AuthRequest, res: Response) => {
  const { students } = req.body;
  const classId = req.params.id;
  const bcrypt = await import("bcrypt");
  const created: any[] = [];
  for (const s of students) {
    const hash = await bcrypt.default.hash(s.password || "password123", 10);
    const id = crypto.randomUUID();
    try {
      await db.prepare(
        `INSERT INTO users (id, email, password_hash, name, role) VALUES (?, ?, ?, ?, 'student')`
      ).run(id, s.email, hash, s.name);
    } catch {
      // conflict — look up existing
    }
    const row = await db.prepare("SELECT id, email, name, role FROM users WHERE email = ?").get(s.email) as any;
    if (row) {
      await db.prepare("INSERT INTO class_members (user_id, class_id) VALUES (?, ?) ON CONFLICT DO NOTHING").run(row.id, classId);
      created.push(row);
    }
  }
  res.json({ imported: created.length, students: created });
});

// Teacher controls per student
router.get("/:classId/controls/:studentId", requireRole("teacher", "admin"), async (req: AuthRequest, res: Response) => {
  const { classId, studentId } = req.params;
  let row = await db.prepare("SELECT * FROM teacher_controls WHERE class_id = ? AND student_id = ?").get(classId, studentId);
  if (!row) {
    const id = crypto.randomUUID();
    await db.prepare("INSERT INTO teacher_controls (id, class_id, student_id) VALUES (?, ?, ?)").run(id, classId, studentId);
    row = await db.prepare("SELECT * FROM teacher_controls WHERE id = ?").get(id);
  }
  res.json(row);
});

router.put("/:classId/controls/:studentId", requireRole("teacher", "admin"), async (req: AuthRequest, res: Response) => {
  const { classId, studentId } = req.params;
  const { ai_enabled, ai_prompt_limit, blocks_disabled, editing_locked, screen_locked } = req.body;
  await db.prepare(
    `UPDATE teacher_controls SET
       ai_enabled = COALESCE(?, ai_enabled),
       ai_prompt_limit = COALESCE(?, ai_prompt_limit),
       blocks_disabled = COALESCE(?, blocks_disabled),
       editing_locked = COALESCE(?, editing_locked),
       screen_locked = COALESCE(?, screen_locked)
     WHERE class_id = ? AND student_id = ?`
  ).run(
    ai_enabled != null ? (ai_enabled ? 1 : 0) : null,
    ai_prompt_limit,
    blocks_disabled ? JSON.stringify(blocks_disabled) : null,
    editing_locked != null ? (editing_locked ? 1 : 0) : null,
    screen_locked != null ? (screen_locked ? 1 : 0) : null,
    classId,
    studentId
  );
  const row = await db.prepare("SELECT * FROM teacher_controls WHERE class_id = ? AND student_id = ?").get(classId, studentId);
  res.json(row);
});

// Attendance
router.post("/:id/attendance", requireRole("teacher", "admin"), async (req: AuthRequest, res: Response) => {
  const { records } = req.body;
  const classId = req.params.id;
  const date = new Date().toISOString().slice(0, 10);
  const stmt = db.prepare(
    `INSERT INTO attendance (id, user_id, class_id, date, present) VALUES (?, ?, ?, ?, ?) ON CONFLICT DO NOTHING`
  );
  for (const r of records) {
    await stmt.run(crypto.randomUUID(), r.userId, classId, date, r.present ? 1 : 0);
  }
  res.json({ saved: records.length });
});

router.get("/:id/attendance", requireRole("teacher", "admin"), async (req: AuthRequest, res: Response) => {
  const rows = await db.prepare("SELECT * FROM attendance WHERE class_id = ? ORDER BY date DESC").all(req.params.id);
  res.json(rows);
});

// Behavior logs
router.post("/:id/behavior", requireRole("teacher", "admin"), async (req: AuthRequest, res: Response) => {
  const { studentId, type, note } = req.body;
  const id = crypto.randomUUID();
  await db.prepare("INSERT INTO behavior_logs (id, student_id, class_id, type, note) VALUES (?, ?, ?, ?, ?)").run(id, studentId, req.params.id, type, note);
  const row = await db.prepare("SELECT * FROM behavior_logs WHERE id = ?").get(id);
  res.json(row);
});

router.get("/:id/behavior", requireRole("teacher", "admin"), async (req: AuthRequest, res: Response) => {
  const rows = await db.prepare("SELECT * FROM behavior_logs WHERE class_id = ? ORDER BY created_at DESC").all(req.params.id);
  res.json(rows);
});

export default router;
