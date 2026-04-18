import { Router, Response } from "express";
import { randomUUID } from "crypto";
import db from "../db.js";
import { AuthRequest } from "../middleware/auth.js";
import { requireRole } from "../middleware/rbac.js";

const router = Router();

// Idempotent schema bootstrap — students columns + new board tables.
let schemaReady = false;
async function ensureBoardSchema() {
  if (schemaReady) return;
  const alters = [
    "ALTER TABLE students ADD COLUMN behavior_stars INTEGER NOT NULL DEFAULT 0",
    "ALTER TABLE students ADD COLUMN reward_count INTEGER NOT NULL DEFAULT 0",
    "ALTER TABLE students ADD COLUMN level INTEGER NOT NULL DEFAULT 1",
  ];
  for (const sql of alters) {
    try { await db.exec(sql); } catch { /* already exists */ }
  }
  try {
    await db.exec(`
      CREATE TABLE IF NOT EXISTS resource_schedules (
        id TEXT PRIMARY KEY,
        student_id TEXT NOT NULL,
        activity TEXT NOT NULL,
        start_time TEXT NOT NULL,
        end_time TEXT NOT NULL,
        classroom TEXT,
        active_days TEXT NOT NULL DEFAULT 'Mon,Tue,Wed,Thu,Fri',
        position INTEGER NOT NULL DEFAULT 0
      )
    `);
    await db.exec(`
      CREATE TABLE IF NOT EXISTS specials_rotation (
        id TEXT PRIMARY KEY,
        grade INTEGER NOT NULL,
        day_letter TEXT NOT NULL,
        activity TEXT NOT NULL,
        classroom TEXT,
        UNIQUE (grade, day_letter)
      )
    `);
    await db.exec(`
      CREATE TABLE IF NOT EXISTS board_settings (
        key TEXT PRIMARY KEY,
        value TEXT
      )
    `);
  } catch (e) { console.error("ensureBoardSchema:", e); }
  schemaReady = true;
}

router.use(async (_req, _res, next) => { await ensureBoardSchema(); next(); });

// ── Aggregate read: everything the board needs for a class ──
router.get("/classes/:classId/data", async (req: AuthRequest, res: Response) => {
  const classId = req.params.classId;
  try {
    const students = await db.prepare(
      `SELECT s.id, s.name, s.avatar_emoji,
              COALESCE(s.behavior_stars, 0) AS behavior_stars,
              COALESCE(s.reward_count, 0)    AS reward_count,
              COALESCE(s.level, 1)           AS level
       FROM students s
       WHERE s.active = 1
       ORDER BY s.name ASC`
    ).all();

    const schedules = await db.prepare(
      `SELECT * FROM resource_schedules ORDER BY student_id, position, start_time`
    ).all();

    const specials = await db.prepare(
      `SELECT * FROM specials_rotation ORDER BY grade, day_letter`
    ).all();

    const settingsRows = await db.prepare(`SELECT key, value FROM board_settings`).all();
    const settings: Record<string, string> = {};
    for (const r of settingsRows as any[]) settings[r.key] = r.value;

    res.json({ classId, students, schedules, specials, settings });
  } catch (e: any) {
    console.error("board/data", e);
    res.status(500).json({ error: e?.message || "board data failed" });
  }
});

// ── Behavior stars: bump by delta, rollover at 10 → reward + reset ──
router.post("/students/:id/stars", requireRole("teacher", "admin"), async (req: AuthRequest, res: Response) => {
  const id = req.params.id;
  const delta = Math.trunc(Number(req.body?.delta ?? 0));
  if (!Number.isFinite(delta) || delta === 0) return res.status(400).json({ error: "delta required" });
  try {
    const row: any = await db.prepare(
      `SELECT COALESCE(behavior_stars,0) AS stars, COALESCE(reward_count,0) AS rewards
       FROM students WHERE id = ?`
    ).get(id);
    if (!row) return res.status(404).json({ error: "student not found" });

    let stars = Math.max(0, row.stars + delta);
    let rewards = row.rewards;
    let rewardFired = false;
    if (stars >= 10) {
      rewardFired = true;
      rewards = rewards + 1;
      stars = 0;
    }
    await db.prepare(
      `UPDATE students SET behavior_stars = ?, reward_count = ? WHERE id = ?`
    ).run(stars, rewards, id);

    res.json({ id, behavior_stars: stars, reward_count: rewards, rewardFired });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || "stars update failed" });
  }
});

// ── Level (1..5) ──
router.post("/students/:id/level", requireRole("teacher", "admin"), async (req: AuthRequest, res: Response) => {
  const id = req.params.id;
  const level = Math.max(1, Math.min(5, Math.trunc(Number(req.body?.level ?? 1))));
  try {
    const r = await db.prepare(`UPDATE students SET level = ? WHERE id = ?`).run(level, id);
    if (!r.changes) return res.status(404).json({ error: "student not found" });
    res.json({ id, level });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || "level update failed" });
  }
});

// ── Resource schedules per student (replace-all) ──
router.put("/resource-schedules/:studentId", requireRole("teacher", "admin"), async (req: AuthRequest, res: Response) => {
  const studentId = req.params.studentId;
  const rows = Array.isArray(req.body?.rows) ? req.body.rows : [];
  try {
    await db.prepare(`DELETE FROM resource_schedules WHERE student_id = ?`).run(studentId);
    let i = 0;
    for (const r of rows) {
      await db.prepare(
        `INSERT INTO resource_schedules (id, student_id, activity, start_time, end_time, classroom, active_days, position)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        randomUUID(),
        studentId,
        String(r.activity || "").slice(0, 80),
        String(r.start_time || "").slice(0, 16),
        String(r.end_time || "").slice(0, 16),
        String(r.classroom || "").slice(0, 80),
        String(r.active_days || "Mon,Tue,Wed,Thu,Fri").slice(0, 64),
        i++,
      );
    }
    const out = await db.prepare(
      `SELECT * FROM resource_schedules WHERE student_id = ? ORDER BY position`
    ).all(studentId);
    res.json(out);
  } catch (e: any) {
    res.status(500).json({ error: e?.message || "schedule save failed" });
  }
});

// ── Specials rotation per grade (replace-all for that grade) ──
router.put("/specials-rotation/:grade", requireRole("teacher", "admin"), async (req: AuthRequest, res: Response) => {
  const grade = Math.trunc(Number(req.params.grade));
  const rows = Array.isArray(req.body?.rows) ? req.body.rows : [];
  try {
    await db.prepare(`DELETE FROM specials_rotation WHERE grade = ?`).run(grade);
    for (const r of rows) {
      await db.prepare(
        `INSERT INTO specials_rotation (id, grade, day_letter, activity, classroom) VALUES (?, ?, ?, ?, ?)`
      ).run(
        randomUUID(),
        grade,
        String(r.day_letter || "").slice(0, 1).toUpperCase(),
        String(r.activity || "").slice(0, 80),
        String(r.classroom || "").slice(0, 80),
      );
    }
    const out = await db.prepare(
      `SELECT * FROM specials_rotation WHERE grade = ? ORDER BY day_letter`
    ).all(grade);
    res.json(out);
  } catch (e: any) {
    res.status(500).json({ error: e?.message || "specials save failed" });
  }
});

// ── Board settings (single key/value upsert) ──
router.put("/settings", requireRole("teacher", "admin"), async (req: AuthRequest, res: Response) => {
  const key = String(req.body?.key || "").trim();
  const value = req.body?.value == null ? "" : String(req.body.value);
  if (!key) return res.status(400).json({ error: "key required" });
  try {
    // Portable upsert: try update, fall back to insert
    const upd = await db.prepare(`UPDATE board_settings SET value = ? WHERE key = ?`).run(value, key);
    if (!upd.changes) {
      await db.prepare(`INSERT INTO board_settings (key, value) VALUES (?, ?)`).run(key, value);
    }
    res.json({ key, value });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || "settings save failed" });
  }
});

// ── Student-facing: read own stars (for dashboard badge) ──
router.get("/me/stars", async (req: AuthRequest, res: Response) => {
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ error: "auth required" });
  try {
    const row: any = await db.prepare(
      `SELECT COALESCE(behavior_stars,0) AS stars,
              COALESCE(reward_count,0) AS rewards
       FROM students WHERE id = ?`
    ).get(userId);
    res.json({ stars: row?.stars ?? 0, rewards: row?.rewards ?? 0 });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || "stars read failed" });
  }
});

export default router;
