import { Router, Response } from "express";
import crypto from "crypto";
import db from "../db.js";
import { AuthRequest } from "../middleware/auth.js";
import { requireRole } from "../middleware/rbac.js";

const router = Router();

let viewsTableReady = false;
async function ensureViewsTable() {
  if (viewsTableReady) return;
  try {
    await db.exec(`
      CREATE TABLE IF NOT EXISTS lesson_views (
        student_id TEXT NOT NULL,
        lesson_id TEXT NOT NULL,
        opened_at TEXT NOT NULL DEFAULT '',
        marked_read_at TEXT NOT NULL DEFAULT '',
        PRIMARY KEY (student_id, lesson_id)
      )
    `);
    viewsTableReady = true;
  } catch (e) { console.error('ensureViewsTable error:', e); }
}

// Student: record that they opened a lesson (upsert — keeps first-opened if already seen)
router.post("/view/:lessonId", async (req: AuthRequest, res: Response) => {
  const userId = req.user!.id;
  const { lessonId } = req.params;
  const now = new Date().toISOString();
  await ensureViewsTable();
  try {
    await db.prepare(
      `INSERT INTO lesson_views (student_id, lesson_id, opened_at, marked_read_at)
       VALUES (?, ?, ?, '')
       ON CONFLICT (student_id, lesson_id) DO UPDATE SET opened_at = COALESCE(NULLIF(lesson_views.opened_at, ''), excluded.opened_at)`
    ).run(userId, lessonId, now);
    res.json({ ok: true });
  } catch (e) { console.error('lesson view error:', e); res.json({ ok: false }); }
});

// Student: mark a lesson as read
router.post("/mark-read/:lessonId", async (req: AuthRequest, res: Response) => {
  const userId = req.user!.id;
  const { lessonId } = req.params;
  const now = new Date().toISOString();
  await ensureViewsTable();
  try {
    await db.prepare(
      `INSERT INTO lesson_views (student_id, lesson_id, opened_at, marked_read_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT (student_id, lesson_id) DO UPDATE SET marked_read_at = excluded.marked_read_at`
    ).run(userId, lessonId, now, now);
    res.json({ ok: true, markedAt: now });
  } catch (e) { console.error('lesson mark-read error:', e); res.status(500).json({ error: 'Failed' }); }
});

// Student: get own lesson views
router.get("/my-views", async (req: AuthRequest, res: Response) => {
  await ensureViewsTable();
  try {
    const rows = await db.prepare(
      "SELECT lesson_id, opened_at, marked_read_at FROM lesson_views WHERE student_id = ?"
    ).all(req.user!.id);
    res.json(rows);
  } catch { res.json([]); }
});

// Teacher: get all views for students in a class
router.get("/class/:classId/views", requireRole("teacher", "admin"), async (req: AuthRequest, res: Response) => {
  await ensureViewsTable();
  try {
    const rows = await db.prepare(
      `SELECT lv.student_id, lv.lesson_id, lv.opened_at, lv.marked_read_at,
              u.name AS student_name
       FROM lesson_views lv
       JOIN users u ON u.id = lv.student_id
       JOIN class_members cm ON cm.user_id = lv.student_id
       WHERE cm.class_id = ?
       ORDER BY lv.opened_at DESC`
    ).all(req.params.classId);
    res.json(rows);
  } catch { res.json([]); }
});

export default router;
