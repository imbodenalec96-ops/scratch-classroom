import { Router, Response } from "express";
import db from "../db.js";
import { AuthRequest } from "../middleware/auth.js";

const router = Router();

// Get leaderboard (top 50) — ordered by behavior_stars then points
router.get("/", async (_req: AuthRequest, res: Response) => {
  const rows = await db.prepare(
    `SELECT l.*, u.name,
            MAX(COALESCE(cm.behavior_stars, 0)) AS behavior_stars
       FROM leaderboard l
       JOIN users u ON l.user_id = u.id
       LEFT JOIN class_members cm ON cm.user_id = l.user_id
       GROUP BY l.user_id, u.name, l.points, l.level, l.badges
       ORDER BY behavior_stars DESC, l.points DESC
       LIMIT 50`
  ).all() as any[];
  rows.forEach((r) => { r.badges = JSON.parse(r.badges || "[]"); });
  res.json(rows);
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

export default router;
