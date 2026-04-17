import { Router, Response } from "express";
import db from "../db.js";
import { AuthRequest } from "../middleware/auth.js";
import { requireRole } from "../middleware/rbac.js";

const router = Router();

let tableReady = false;
async function ensureGradesTable() {
  if (tableReady) return;
  try {
    await db.exec(`
      CREATE TABLE IF NOT EXISTS user_grade_levels (
        user_id TEXT PRIMARY KEY,
        reading_grade INTEGER NOT NULL DEFAULT 3,
        math_grade    INTEGER NOT NULL DEFAULT 3,
        writing_grade INTEGER NOT NULL DEFAULT 3,
        updated_at TEXT NOT NULL DEFAULT ''
      )
    `);
    tableReady = true;
  } catch (e) { console.error('ensureGradesTable error:', e); }
}

const clamp = (n: number) => Math.max(0, Math.min(12, Math.round(Number(n) || 0)));

// Student: get my own grades
router.get("/mine", async (req: AuthRequest, res: Response) => {
  await ensureGradesTable();
  try {
    const row = await db.prepare("SELECT * FROM user_grade_levels WHERE user_id = ?").get(req.user!.id) as any;
    res.json(row || { user_id: req.user!.id, reading_grade: 3, math_grade: 3, writing_grade: 3 });
  } catch { res.json({ reading_grade: 3, math_grade: 3, writing_grade: 3 }); }
});

// Teacher/admin: get a single student's grades
router.get("/student/:userId", requireRole("teacher", "admin"), async (req: AuthRequest, res: Response) => {
  await ensureGradesTable();
  try {
    const row = await db.prepare("SELECT * FROM user_grade_levels WHERE user_id = ?").get(req.params.userId) as any;
    res.json(row || { user_id: req.params.userId, reading_grade: 3, math_grade: 3, writing_grade: 3 });
  } catch { res.json({ reading_grade: 3, math_grade: 3, writing_grade: 3 }); }
});

// Teacher/admin: set a single student's grades (upsert)
router.put("/student/:userId", requireRole("teacher", "admin"), async (req: AuthRequest, res: Response) => {
  await ensureGradesTable();
  const { reading_grade, math_grade, writing_grade } = req.body || {};
  const r = clamp(reading_grade);
  const m = clamp(math_grade);
  const w = clamp(writing_grade);
  const now = new Date().toISOString();
  try {
    await db.prepare(
      `INSERT INTO user_grade_levels (user_id, reading_grade, math_grade, writing_grade, updated_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT (user_id) DO UPDATE SET
         reading_grade = excluded.reading_grade,
         math_grade    = excluded.math_grade,
         writing_grade = excluded.writing_grade,
         updated_at    = excluded.updated_at`
    ).run(req.params.userId, r, m, w, now);
    res.json({ ok: true, user_id: req.params.userId, reading_grade: r, math_grade: m, writing_grade: w });
  } catch (e) {
    console.error('put grades error:', e);
    res.status(500).json({ error: 'Failed' });
  }
});

// Teacher/admin: class overview — all students + their grades (LEFT JOIN to include defaults)
router.get("/class/:classId", requireRole("teacher", "admin"), async (req: AuthRequest, res: Response) => {
  await ensureGradesTable();
  try {
    const rows = await db.prepare(
      `SELECT u.id, u.name, u.email,
        COALESCE(g.reading_grade, 3) AS reading_grade,
        COALESCE(g.math_grade,    3) AS math_grade,
        COALESCE(g.writing_grade, 3) AS writing_grade,
        g.updated_at
       FROM users u
       JOIN class_members cm ON u.id = cm.user_id
       LEFT JOIN user_grade_levels g ON g.user_id = u.id
       WHERE cm.class_id = ? AND u.role = 'student'
       ORDER BY u.name`
    ).all(req.params.classId);
    res.json(rows);
  } catch (e) {
    console.error('class grades error:', e);
    res.json([]);
  }
});

// Teacher/admin: bulk set grades for a whole class (e.g. "everyone to grade 3")
router.put("/class/:classId/bulk", requireRole("teacher", "admin"), async (req: AuthRequest, res: Response) => {
  await ensureGradesTable();
  const { reading_grade, math_grade, writing_grade } = req.body || {};
  const r = clamp(reading_grade);
  const m = clamp(math_grade);
  const w = clamp(writing_grade);
  const now = new Date().toISOString();
  try {
    const students = await db.prepare(
      "SELECT u.id FROM users u JOIN class_members cm ON cm.user_id = u.id WHERE cm.class_id = ? AND u.role = 'student'"
    ).all(req.params.classId) as any[];
    for (const s of students) {
      await db.prepare(
        `INSERT INTO user_grade_levels (user_id, reading_grade, math_grade, writing_grade, updated_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT (user_id) DO UPDATE SET
           reading_grade = excluded.reading_grade,
           math_grade    = excluded.math_grade,
           writing_grade = excluded.writing_grade,
           updated_at    = excluded.updated_at`
      ).run(s.id, r, m, w, now).catch(() => {});
    }
    res.json({ ok: true, studentsUpdated: students.length });
  } catch (e) {
    console.error('bulk grades error:', e);
    res.status(500).json({ error: 'Failed' });
  }
});

export default router;
