import { Router, Response } from "express";
import { randomUUID } from "crypto";
import db from "../db.js";
import { AuthRequest } from "../middleware/auth.js";
import { requireRole } from "../middleware/rbac.js";

const router = Router();

// Idempotent schema bootstrap for board-specific tables.
let schemaReady = false;
async function ensureBoardSchema() {
  if (schemaReady) return;
  try {
    await db.exec(`
      CREATE TABLE IF NOT EXISTS board_user_data (
        user_id TEXT PRIMARY KEY,
        behavior_stars INTEGER NOT NULL DEFAULT 0,
        reward_count INTEGER NOT NULL DEFAULT 0,
        level INTEGER NOT NULL DEFAULT 1
      )
    `);
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
    // Backfill specials_grade for known Star students by name — runs once per process
    const gradeByName: Record<string, number> = {
      ryan: 5, jaida: 5, rayden: 4, zoey: 3, aiden: 3, kaleb: 5, anna: 3, ameer: 4,
    };
    for (const [name, grade] of Object.entries(gradeByName)) {
      try {
        await db.prepare(`UPDATE users SET specials_grade = ? WHERE LOWER(name) = ? AND role = 'student'`).run(grade, name);
      } catch { /* ignore */ }
    }
    // Additive: avatar_emoji column on users
    try { await db.exec(`ALTER TABLE users ADD COLUMN avatar_emoji TEXT`); } catch { /* already exists */ }
  } catch (e) { console.error("ensureBoardSchema:", e); }
  schemaReady = true;
}

router.use(async (_req, _res, next) => { await ensureBoardSchema(); next(); });

// ── Aggregate read: everything the board needs for a class ──
router.get("/classes/:classId/data", async (req: AuthRequest, res: Response) => {
  const classId = req.params.classId;
  try {
    const students = await db.prepare(
      `SELECT u.id, u.name, u.avatar_url, u.avatar_emoji, u.specials_grade,
              COALESCE(u.dojo_points, 0)      AS dojo_points,
              COALESCE(bd.behavior_stars, 0) AS behavior_stars,
              COALESCE(bd.reward_count, 0)    AS reward_count,
              COALESCE(bd.level, 1)           AS level
       FROM users u
       JOIN class_members cm ON u.id = cm.user_id
       LEFT JOIN board_user_data bd ON bd.user_id = u.id::text
       WHERE cm.class_id = ?::uuid AND u.role = 'student'
       ORDER BY u.name ASC`
    ).all(classId);

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
    const user: any = await db.prepare(`SELECT id FROM users WHERE id = ?::uuid AND role = 'student'`).get(id);
    if (!user) return res.status(404).json({ error: "student not found" });

    await db.prepare(
      `INSERT INTO board_user_data (user_id) VALUES (?) ON CONFLICT(user_id) DO NOTHING`
    ).run(id);
    const row: any = await db.prepare(
      `SELECT behavior_stars, reward_count FROM board_user_data WHERE user_id = ?`
    ).get(id);

    let stars = Math.max(0, (row?.behavior_stars || 0) + delta);
    let rewards = row?.reward_count || 0;
    let rewardFired = false;
    if (stars >= 5) {
      rewardFired = true;
      rewards = rewards + 1;
      stars = 0;
    }
    await db.prepare(
      `UPDATE board_user_data SET behavior_stars = ?, reward_count = ? WHERE user_id = ?`
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
    const user: any = await db.prepare(`SELECT id FROM users WHERE id = ?::uuid AND role = 'student'`).get(id);
    if (!user) return res.status(404).json({ error: "student not found" });

    await db.prepare(
      `INSERT INTO board_user_data (user_id) VALUES (?) ON CONFLICT(user_id) DO NOTHING`
    ).run(id);
    await db.prepare(`UPDATE board_user_data SET level = ? WHERE user_id = ?`).run(level, id);

    res.json({ id, level });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || "level update failed" });
  }
});

// ── Student: set own avatar emoji ──
// Students can only change their own avatar; teachers can change any student's.
router.post("/students/:id/avatar", async (req: AuthRequest, res: Response) => {
  const id = req.params.id;
  const emoji = String(req.body?.avatarEmoji || "").trim();
  // Students may only change their own avatar
  if (req.user!.role === "student" && req.user!.id !== id) {
    return res.status(403).json({ error: "Cannot change another student's avatar" });
  }
  try {
    await db.prepare(`UPDATE users SET avatar_emoji = ? WHERE id = ?`).run(emoji || null, id);
    res.json({ id, avatar_emoji: emoji || null });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || "avatar update failed" });
  }
});

// ── Student specials grade ──
router.post("/students/:id/specials-grade", requireRole("teacher", "admin"), async (req: AuthRequest, res: Response) => {
  const id = req.params.id;
  const grade = req.body?.grade != null ? Math.trunc(Number(req.body.grade)) : null;
  try {
    await db.prepare(`UPDATE users SET specials_grade = ? WHERE id = ?::uuid AND role = 'student'`).run(grade, id);
    res.json({ id, specials_grade: grade });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || "specials_grade update failed" });
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
      `SELECT COALESCE(behavior_stars, 0) AS stars,
              COALESCE(reward_count, 0)   AS rewards
       FROM board_user_data WHERE user_id = ?`
    ).get(userId);
    res.json({ stars: row?.stars ?? 0, rewards: row?.rewards ?? 0 });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || "stars read failed" });
  }
});

// GET /board/classes/:classId/live-progress
// Returns class-level real-time progress for the board's progress widget:
//   - pct, studentsDone, totalStudents (% of class with no remaining work today)
//   - topToday: top finishers ranked by submission count today
//   - recent: last 5 submissions by anyone in class (for the ticker)
// Read-only and safe to expose to anyone in the class — students can see
// their own classmates' progress, which is the whole point of a board.
router.get("/classes/:classId/live-progress", async (req: AuthRequest, res: Response) => {
  const classId = req.params.classId;
  try {
    // Pacific day for today/today-only queries
    const todayStr = new Date(Date.now() - 7 * 3600_000).toISOString().slice(0, 10);

    // All students in this class
    let students: any[] = [];
    try {
      students = await db.prepare(
        `SELECT u.id, u.name FROM users u
         JOIN class_members cm ON cm.user_id::text = u.id::text
         WHERE cm.class_id::text = ? AND u.role = 'student'`
      ).all(classId) as any[];
    } catch (e: any) {
      console.error("[live-progress students]", e?.message);
    }
    const totalStudents = students.length;

    // Today's submission count per student (any class assignment)
    let subsByStudent = new Map<string, number>();
    try {
      const subRows = await db.prepare(
        `SELECT s.student_id::text AS student_id, COUNT(*)::int AS n
         FROM submissions s
         JOIN assignments a ON a.id::text = s.assignment_id::text
         WHERE a.class_id::text = ?
           AND SUBSTR(COALESCE(s.submitted_at, s.created_at)::text, 1, 10) = ?
         GROUP BY s.student_id`
      ).all(classId, todayStr) as any[];
      for (const r of subRows) subsByStudent.set(String(r.student_id), Number(r.n));
    } catch (e: any) {
      console.error("[live-progress subs]", e?.message);
    }

    // Open (pending-eligible) assignments today. SUBSTR(...) normalizes
    // ISO timestamps so the date comparison works whether scheduled_date
    // is stored as 'YYYY-MM-DD' or '2026-04-29T00:00:00'.
    let openAssignments: any[] = [];
    try {
      openAssignments = await db.prepare(
        `SELECT id::text AS id FROM assignments
         WHERE class_id::text = ?
           AND (scheduled_date IS NULL OR SUBSTR(scheduled_date::text, 1, 10) = ?)
           AND COALESCE(is_afternoon, 0) = 0`
      ).all(classId, todayStr) as any[];
    } catch (e: any) {
      console.error("[live-progress open]", e?.message);
    }
    const totalOpen = openAssignments.length;

    let studentsDone = 0;
    if (totalOpen > 0 && totalStudents > 0) {
      const ids = openAssignments.map((a) => a.id);
      const placeholders = ids.map(() => "?").join(",");
      try {
        const submittedPerStudent = await db.prepare(
          `SELECT student_id::text AS student_id, COUNT(*)::int AS n
           FROM submissions
           WHERE assignment_id::text IN (${placeholders})
           GROUP BY student_id`
        ).all(...ids) as any[];
        const doneMap = new Map<string, number>();
        for (const r of submittedPerStudent) doneMap.set(String(r.student_id), Number(r.n));
        for (const s of students) {
          if ((doneMap.get(String(s.id)) || 0) >= totalOpen) studentsDone += 1;
        }
      } catch (e: any) {
        console.error("[live-progress submittedPerStudent]", e?.message);
      }
    } else if (totalOpen === 0) {
      // No open assignments today — show 0/N pending instead of pretending
      // everyone is "done". This prevents the misleading 100% on a fresh
      // class with no work yet.
      studentsDone = 0;
    }

    const pct = totalStudents > 0 ? Math.round((studentsDone / totalStudents) * 100) : 0;

    // Top finishers today
    const topToday = students
      .map((s) => ({ student_id: s.id, name: s.name, count: subsByStudent.get(String(s.id)) || 0 }))
      .filter((s) => s.count > 0)
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    // Last 5 submissions in the class (for the ticker)
    let recent: any[] = [];
    try {
      recent = await db.prepare(
        `SELECT u.name, a.title, COALESCE(s.submitted_at, s.created_at) AS ts
         FROM submissions s
         JOIN assignments a ON a.id::text = s.assignment_id::text
         JOIN users u ON u.id::text = s.student_id::text
         WHERE a.class_id::text = ?
         ORDER BY COALESCE(s.submitted_at, s.created_at) DESC
         LIMIT 5`
      ).all(classId) as any[];
    } catch (e: any) {
      console.error("[live-progress recent]", e?.message);
    }

    res.json({ pct, studentsDone, totalStudents, totalOpen, topToday, recent });
  } catch (e: any) {
    console.error("[board live-progress TOP]", e?.message || e);
    res.status(500).json({ error: e?.message || "live progress failed" });
  }
});

export default router;
