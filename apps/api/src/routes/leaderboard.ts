import { Router, Response } from "express";
import db from "../db.js";
import { AuthRequest } from "../middleware/auth.js";

const router = Router();

// Ensure board_user_data exists before joining against it
let boardTableReady = false;
async function ensureBoardUserData() {
  if (boardTableReady) return;
  try {
    await db.exec(`CREATE TABLE IF NOT EXISTS board_user_data (
      user_id TEXT PRIMARY KEY,
      behavior_stars INTEGER NOT NULL DEFAULT 0,
      reward_count INTEGER NOT NULL DEFAULT 0,
      level INTEGER NOT NULL DEFAULT 1
    )`);
    boardTableReady = true;
  } catch { boardTableReady = true; }
}

// Get leaderboard (top 50) — all students, even those with 0 points
router.get("/", async (_req: AuthRequest, res: Response) => {
  try {
    await ensureBoardUserData();
    // NB: board_user_data.user_id is TEXT while users.id is UUID — cast to
    // avoid 'operator does not exist: text = uuid'. Sort by dojo_points
    // (ClassDojo-style cumulative points) — that's what teachers/students
    // actually track. Tiebreak with reward_count, then behavior_stars.
    const rows = await db.prepare(
      `SELECT
         u.id AS user_id, u.name, u.avatar_emoji,
         COALESCE(u.dojo_points, 0) AS dojo_points,
         COALESCE(l.points, 0)   AS points,
         COALESCE(l.level, 1)    AS level,
         COALESCE(l.badges, '[]') AS badges,
         COALESCE(bd.behavior_stars, 0) AS behavior_stars,
         COALESCE(bd.reward_count, 0)   AS reward_count
       FROM users u
       LEFT JOIN leaderboard l  ON l.user_id  = u.id
       LEFT JOIN board_user_data bd ON bd.user_id = u.id::text
       WHERE u.role = 'student'
       ORDER BY COALESCE(u.dojo_points, 0) DESC,
                COALESCE(bd.reward_count, 0) DESC,
                COALESCE(bd.behavior_stars, 0) DESC
       LIMIT 50`
    ).all() as any[];
    rows.forEach((r) => { r.badges = JSON.parse(r.badges || "[]"); });
    res.json(rows);
  } catch (e: any) {
    console.error("[leaderboard GET]", e?.message || e);
    res.status(500).json({ error: e?.message || "Failed to load leaderboard" });
  }
});

// Assignment completion leaderboard
router.get("/assignments", async (_req: AuthRequest, res: Response) => {
  try {
    const rows = await db.prepare(`
      SELECT
        u.id AS user_id,
        u.name,
        COALESCE(SUM(CASE WHEN wa.completed=1 THEN 1 ELSE 0 END), 0) AS completed,
        COUNT(wa.id) AS total_assigned
      FROM users u
      LEFT JOIN worksheet_assignments wa ON wa.student_id = u.id
      WHERE u.role = 'student'
      GROUP BY u.id, u.name
      ORDER BY completed DESC, total_assigned DESC
      LIMIT 50
    `).all() as any[];
    res.json(rows);
  } catch {
    res.status(500).json({ error: "Failed to get assignment leaderboard" });
  }
});

// Add points (internal / teacher)
router.post("/points", async (req: AuthRequest, res: Response) => {
  const { userId, points } = req.body;
  const existing = await db.prepare("SELECT * FROM leaderboard WHERE user_id = ?").get(userId) as any;
  if (existing) {
    await db.prepare("UPDATE leaderboard SET points = points + ? WHERE user_id = ?").run(points, userId);
  } else {
    await db.prepare("INSERT INTO leaderboard (user_id, points) VALUES (?, ?)").run(userId, points);
  }
  const row = await db.prepare("SELECT * FROM leaderboard WHERE user_id = ?").get(userId) as any;
  const newLevel = Math.floor(row.points / 100) + 1;
  if (newLevel !== row.level) {
    await db.prepare("UPDATE leaderboard SET level = ? WHERE user_id = ?").run(newLevel, userId);
  }
  row.badges = JSON.parse(row.badges || "[]");
  res.json(row);
});

// Award badge
router.post("/badge", async (req: AuthRequest, res: Response) => {
  const { userId, badge } = req.body;
  const row = await db.prepare("SELECT badges FROM leaderboard WHERE user_id = ?").get(userId) as any;
  if (!row) return res.status(404).json({ error: "User not on leaderboard" });
  const badges = JSON.parse(row.badges || "[]");
  badges.push(badge);
  await db.prepare("UPDATE leaderboard SET badges = ? WHERE user_id = ?").run(JSON.stringify(badges), userId);
  const updated = await db.prepare("SELECT * FROM leaderboard WHERE user_id = ?").get(userId) as any;
  updated.badges = JSON.parse(updated.badges || "[]");
  res.json(updated);
});

// Auto-award badges based on the calling student's submission count.
// Idempotent: if the badge already exists in the array, returns without
// duplicating. Called from the student dashboard after every successful
// assignment submission. Returns { awarded: [...], badges: [...] } so
// the client can pop a celebration toast for any newly-earned badges.
router.post("/auto-award", async (req: AuthRequest, res: Response) => {
  if (!req.user) return res.status(401).json({ error: "auth required" });
  const userId = req.user.id;
  try {
    // Count this student's total submitted assignments
    const sub: any = await db.prepare(
      "SELECT COUNT(*)::int AS n FROM submissions WHERE student_id::text = ?"
    ).get(userId).catch(() => ({ n: 0 }));
    const submittedCount = Number(sub?.n ?? 0);

    // Ensure leaderboard row exists for this student
    let row: any = await db.prepare("SELECT * FROM leaderboard WHERE user_id = ?").get(userId);
    if (!row) {
      try {
        await db.prepare("INSERT INTO leaderboard (user_id, points) VALUES (?, 0)").run(userId);
        row = await db.prepare("SELECT * FROM leaderboard WHERE user_id = ?").get(userId);
      } catch {}
    }
    const existing: string[] = row ? JSON.parse(row.badges || "[]") : [];

    // Milestone definitions — each entry: { name, when }
    const milestones: Array<{ name: string; when: boolean }> = [
      { name: "🎯 First Assignment",   when: submittedCount >= 1 },
      { name: "🔥 5 Assignments",      when: submittedCount >= 5 },
      { name: "⭐ 10 Assignments",      when: submittedCount >= 10 },
      { name: "🏆 25 Assignments",     when: submittedCount >= 25 },
      { name: "💎 50 Assignments",     when: submittedCount >= 50 },
      { name: "👑 100 Assignments",    when: submittedCount >= 100 },
    ];

    const awarded: string[] = [];
    for (const m of milestones) {
      if (m.when && !existing.includes(m.name)) {
        existing.push(m.name);
        awarded.push(m.name);
      }
    }

    if (awarded.length > 0 && row) {
      await db.prepare("UPDATE leaderboard SET badges = ? WHERE user_id = ?").run(
        JSON.stringify(existing), userId,
      );
    }
    res.json({ awarded, badges: existing, submittedCount });
  } catch (e: any) {
    console.error("[leaderboard auto-award]", e?.message || e);
    res.status(500).json({ error: e?.message || "auto-award failed" });
  }
});

export default router;
