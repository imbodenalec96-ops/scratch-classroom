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

    // All students in this class — pull subject grades alongside so we
    // can compute per-student visibility correctly (an assignment with
    // target_grade_min only counts toward kids in that grade).
    let students: any[] = [];
    try {
      students = await db.prepare(
        `SELECT u.id::text AS id, u.name,
                ugl.reading_grade, ugl.math_grade, ugl.writing_grade
         FROM users u
         JOIN class_members cm ON cm.user_id::text = u.id::text
         LEFT JOIN user_grade_levels ugl ON ugl.user_id::text = u.id::text
         WHERE cm.class_id::text = ? AND u.role = 'student'`
      ).all(classId) as any[];
    } catch (e: any) {
      console.error("[live-progress students]", e?.message);
    }
    const totalStudents = students.length;

    // Today's submission count per student (any class assignment) — used
    // for the "top finishers" widget.
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

    // Pull today's class assignments (today + null-scheduled), MIRRORING
    // the rules /assignments/class/:classId/pending applies for the
    // student dashboard so the board's per-student bar matches what each
    // kid actually sees in their queue.
    //
    // Same set of fields the strict pending endpoint reads — title is
    // needed for the bonus filter (rows starting with 🌅 are bonus and
    // must be hidden after the 3:10 PM Pacific bell).
    const PACIFIC_MS = -7 * 3600_000;
    const schoolNow = new Date(Date.now() + PACIFIC_MS);
    const isAfterRelease = schoolNow.getUTCHours() > 15 ||
      (schoolNow.getUTCHours() === 15 && schoolNow.getUTCMinutes() >= 10);
    const nextDayStr = isAfterRelease
      ? new Date(schoolNow.getTime() + 86_400_000).toISOString().slice(0, 10)
      : todayStr;

    let dayAssignments: any[] = [];
    try {
      dayAssignments = await db.prepare(
        `SELECT id::text AS id, title, target_subject,
                target_grade_min, target_grade_max, target_student_ids,
                scheduled_date, is_afternoon, student_id::text AS student_id
         FROM assignments
         WHERE class_id::text = ?
           AND (
             scheduled_date IS NULL
             OR SUBSTR(scheduled_date::text, 1, 10) = ?
             OR SUBSTR(scheduled_date::text, 1, 10) = ?
           )`
      ).all(classId, todayStr, nextDayStr) as any[];
    } catch (e: any) {
      console.error("[live-progress day]", e?.message);
    }

    // Bonus rules: bonus rows (🌅 prefix or is_afternoon=1) only count
    // on the day they were created and disappear at the 3:10 bell.
    const isBonus = (a: any) =>
      Number(a.is_afternoon) === 1 ||
      (typeof a.title === "string" && a.title.startsWith("🌅"));
    const passesBonusRules = (a: any): boolean => {
      if (!isBonus(a)) return true;
      if (isAfterRelease) return false;
      const sd = a.scheduled_date ? String(a.scheduled_date).slice(0, 10) : null;
      return sd === todayStr;
    };

    // Two submission lookups: which (student, assignment) pairs are
    // already submitted EVER (so we can hide assignments a kid finished
    // on a prior day from today's queue, matching /pending), and which
    // were submitted TODAY (those count toward the daily bar so kids
    // see progress accumulate as they work).
    const submittedEverPairs = new Set<string>();
    const submittedTodayPairs = new Set<string>();
    if (dayAssignments.length > 0) {
      const ids = dayAssignments.map((a) => a.id);
      const placeholders = ids.map(() => "?").join(",");
      try {
        const subs = await db.prepare(
          `SELECT student_id::text AS student_id,
                  assignment_id::text AS assignment_id,
                  SUBSTR(COALESCE(submitted_at, created_at)::text, 1, 10) AS day
           FROM submissions WHERE assignment_id::text IN (${placeholders})`
        ).all(...ids) as any[];
        for (const r of subs) {
          const k = `${r.student_id}|${r.assignment_id}`;
          submittedEverPairs.add(k);
          if (r.day === todayStr) submittedTodayPairs.add(k);
        }
      } catch (e: any) {
        console.error("[live-progress submittedPairs]", e?.message);
      }
    }

    // Visibility: legacy student_id column (a single student lock) takes
    // precedence; then target_student_ids; then target_grade range; then
    // visible-to-all if no targeting at all.
    const isVisibleTo = (a: any, s: any): boolean => {
      if (a.student_id && String(a.student_id) !== String(s.id)) return false;
      if (a.target_student_ids) {
        try {
          const ids = JSON.parse(a.target_student_ids);
          if (Array.isArray(ids) && ids.length > 0) return ids.includes(String(s.id));
        } catch {}
      }
      if (a.target_grade_min == null) return true;
      const subj = String(a.target_subject || "reading");
      const g = subj === "math" ? s.math_grade
              : subj === "writing" ? s.writing_grade
              : s.reading_grade;
      if (g == null) return true;
      const tMin = Number(a.target_grade_min);
      const tMax = a.target_grade_max != null ? Number(a.target_grade_max) : tMin;
      return Number(g) >= tMin && Number(g) <= tMax;
    };

    // Per-student daily progress — resets every morning so the bar
    // shows TODAY'S work, not "everything you've ever done".
    //
    //   total = visible-and-bonus-passing assignments that the kid
    //           hasn't already finished on a prior day. Null-scheduled
    //           always-on assignments (SEL/History/Science/Vocab) drop
    //           out once submitted, same as /pending hides them.
    //   done  = how many of those they've submitted *today*.
    //   open  = total - done (still on their queue today).
    //   pct   = done / total.
    //
    // A kid who finished yesterday's reading shows nothing for it
    // today; a kid who finished today's reading this morning sees it
    // counted as done; a kid who hasn't done it sees it open.
    const byStudent: Record<string, { open: number; done: number; total: number; pct: number }> = {};
    let studentsDone = 0;
    let totalOpenAcrossClass = 0;
    for (const s of students) {
      let total = 0, done = 0;
      for (const a of dayAssignments) {
        if (!passesBonusRules(a)) continue;
        if (!isVisibleTo(a, s)) continue;
        const key = `${s.id}|${a.id}`;
        const submittedEver = submittedEverPairs.has(key);
        const submittedToday = submittedTodayPairs.has(key);
        // Already finished before today → not in today's queue at all.
        if (submittedEver && !submittedToday) continue;
        total += 1;
        if (submittedToday) done += 1;
      }
      const open = total - done;
      const sPct = total > 0 ? Math.round((done / total) * 100) : 0;
      byStudent[String(s.id)] = { open, done, total, pct: sPct };
      totalOpenAcrossClass += open;
      if (total > 0 && done >= total) studentsDone += 1;
    }

    // Class progress now reflects total work done across the class
    // rather than just "students who are 100% done". Aggregating
    // done/total directly gives the bar a more meaningful glide:
    // it crawls up as kids submit, instead of jumping in 1/9 chunks.
    let totalDoneAcrossClass = 0;
    let totalAssignedAcrossClass = 0;
    for (const sp of Object.values(byStudent)) {
      totalDoneAcrossClass += sp.done;
      totalAssignedAcrossClass += sp.total;
    }
    const pct = totalAssignedAcrossClass > 0
      ? Math.round((totalDoneAcrossClass / totalAssignedAcrossClass) * 100)
      : 0;

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

    res.json({
      pct, studentsDone, totalStudents,
      totalOpen: totalOpenAcrossClass,
      totalDone: totalDoneAcrossClass,
      totalAssigned: totalAssignedAcrossClass,
      topToday, recent, byStudent,
    });
  } catch (e: any) {
    console.error("[board live-progress TOP]", e?.message || e);
    res.status(500).json({ error: e?.message || "live progress failed" });
  }
});

export default router;
