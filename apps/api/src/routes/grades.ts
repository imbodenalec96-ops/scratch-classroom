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

// Teacher/admin: class overview — every student in the class + their grades.
// Two-step approach: fetch the roster first (the simple known-good query used
// by /classes/:id/students), then the grade rows separately, then merge in JS.
// This sidesteps the PostgreSQL type mismatch we hit when LEFT JOINing
// users (uuid) against user_grade_levels (text) — operator error that
// was silently returning [].
router.get("/class/:classId", requireRole("teacher", "admin"), async (req: AuthRequest, res: Response) => {
  await ensureGradesTable();
  const debug = req.query.debug === '1';
  try {
    // 1) Roster from the known-good users × class_members join
    const roster = await db.prepare(
      `SELECT u.id, u.name, u.email, u.role
       FROM users u JOIN class_members cm ON u.id = cm.user_id
       WHERE cm.class_id = ?
       ORDER BY u.name`
    ).all(req.params.classId) as any[];

    // 2) Grade rows (simple WHERE, no join) — tolerate empty table
    const userIds = roster.map(r => String(r.id));
    let gradeRows: any[] = [];
    if (userIds.length > 0) {
      try {
        const placeholders = userIds.map(() => "?").join(",");
        gradeRows = await db.prepare(
          `SELECT user_id, reading_grade, math_grade, writing_grade, updated_at
           FROM user_grade_levels WHERE user_id IN (${placeholders})`
        ).all(...userIds) as any[];
      } catch (e) { if (debug) console.error('grade rows err:', e); }
    }
    const gradeMap: Record<string, any> = {};
    for (const g of gradeRows) gradeMap[String(g.user_id)] = g;

    // 3) Merge. Default to grade 3 when no row exists (editable on save).
    const merged = roster
      .filter(r => r.role !== 'admin')
      .map(r => {
        const g = gradeMap[String(r.id)];
        return {
          id: r.id, name: r.name, email: r.email, role: r.role,
          reading_grade: g?.reading_grade ?? 3,
          math_grade:    g?.math_grade    ?? 3,
          writing_grade: g?.writing_grade ?? 3,
          updated_at:    g?.updated_at    ?? null,
        };
      });
    res.json(merged);
  } catch (e: any) {
    console.error('class grades error:', e);
    if (debug) return res.status(500).json({ error: String(e?.message || e) });
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
