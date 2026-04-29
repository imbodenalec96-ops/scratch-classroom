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

// Auto-award assignment-based achievement badges based on the calling
// student's submission history. Idempotent: existing badges are not
// re-awarded. Called from the student dashboard after every successful
// submission. Badge IDs match Achievements.tsx ALL_BADGES so cards
// light up automatically. Returns awarded entries with display label +
// icon so the client can render a nice celebration toast.
router.post("/auto-award", async (req: AuthRequest, res: Response) => {
  if (!req.user) return res.status(401).json({ error: "auth required" });
  const userId = req.user.id;
  try {
    // Total submissions
    const totalSub: any = await db.prepare(
      "SELECT COUNT(*)::int AS n FROM submissions WHERE student_id::text = ?"
    ).get(userId).catch(() => ({ n: 0 }));
    const submittedCount = Number(totalSub?.n ?? 0);

    // Submissions today (school day, Pacific). Counted via submitted_at
    // — fall back to created_at if submitted_at column is missing.
    let todayCount = 0;
    try {
      const today: any = await db.prepare(
        `SELECT COUNT(*)::int AS n FROM submissions
         WHERE student_id::text = ?
           AND COALESCE(submitted_at, created_at) >= (CURRENT_DATE - INTERVAL '1 day')`
      ).get(userId);
      todayCount = Number(today?.n ?? 0);
    } catch {}

    // Any submission graded at 100
    let perfectCount = 0;
    try {
      const perfect: any = await db.prepare(
        `SELECT COUNT(*)::int AS n FROM submissions
         WHERE student_id::text = ? AND (grade = 100 OR human_grade_score = 100)`
      ).get(userId);
      perfectCount = Number(perfect?.n ?? 0);
    } catch {}

    // Distinct subjects this student has completed
    let distinctSubjects = new Set<string>();
    try {
      const subjects: any[] = await db.prepare(
        `SELECT DISTINCT LOWER(a.target_subject) AS subject
         FROM submissions s
         JOIN assignments a ON a.id::text = s.assignment_id::text
         WHERE s.student_id::text = ? AND a.target_subject IS NOT NULL`
      ).all(userId);
      for (const r of subjects) {
        if (r?.subject) distinctSubjects.add(r.subject);
      }
    } catch {}
    const hasAllCoreSubjects =
      ["reading", "math", "writing", "spelling"].every((s) => distinctSubjects.has(s));

    // Ensure leaderboard row exists
    let row: any = await db.prepare("SELECT * FROM leaderboard WHERE user_id = ?").get(userId);
    if (!row) {
      try {
        await db.prepare("INSERT INTO leaderboard (user_id, points) VALUES (?, 0)").run(userId);
        row = await db.prepare("SELECT * FROM leaderboard WHERE user_id = ?").get(userId);
      } catch {}
    }
    const existing: string[] = row ? JSON.parse(row.badges || "[]") : [];

    // Each milestone: id matches Achievements.tsx ALL_BADGES, label/icon
    // are returned in the awarded payload so the client can render a
    // celebratory toast.
    const milestones: Array<{ id: string; label: string; icon: string; when: boolean }> = [
      { id: "first_assignment", icon: "🎯", label: "First One Done",     when: submittedCount >= 1 },
      { id: "5_assignments",    icon: "🔥", label: "On a Roll",          when: submittedCount >= 5 },
      { id: "10_assignments",   icon: "⭐", label: "Star Student",       when: submittedCount >= 10 },
      { id: "25_assignments",   icon: "🏆", label: "Champion",           when: submittedCount >= 25 },
      { id: "50_assignments",   icon: "💎", label: "Diamond Worker",     when: submittedCount >= 50 },
      { id: "100_assignments",  icon: "👑", label: "Hall of Fame",       when: submittedCount >= 100 },
      { id: "perfect_score",    icon: "💯", label: "Perfect Score",      when: perfectCount >= 1 },
      { id: "3_in_a_day",       icon: "⚡", label: "Speedster",          when: todayCount >= 3 },
      { id: "5_in_a_day",       icon: "🚀", label: "Power Day",          when: todayCount >= 5 },
      { id: "all_subjects",     icon: "🌟", label: "Well Rounded",       when: hasAllCoreSubjects },
    ];

    const awarded: Array<{ id: string; label: string; icon: string }> = [];
    for (const m of milestones) {
      if (m.when && !existing.includes(m.id)) {
        existing.push(m.id);
        awarded.push({ id: m.id, label: m.label, icon: m.icon });
      }
    }

    if (awarded.length > 0 && row) {
      await db.prepare("UPDATE leaderboard SET badges = ? WHERE user_id = ?").run(
        JSON.stringify(existing), userId,
      );
    }
    res.json({ awarded, badges: existing, submittedCount, todayCount, perfectCount });
  } catch (e: any) {
    console.error("[leaderboard auto-award]", e?.message || e);
    res.status(500).json({ error: e?.message || "auto-award failed" });
  }
});

// Self-claim a real reward for an earned achievement badge. Each badge
// can only be claimed once per student (badge_claims PK enforces this).
// Awards 25 dojo points to the student. Used by the loot-box UI on the
// student dashboard so 'Tap to open' actually gives them something.
let badgeClaimsReady = false;
async function ensureBadgeClaims() {
  if (badgeClaimsReady) return;
  try {
    await db.exec(`CREATE TABLE IF NOT EXISTS badge_claims (
      user_id TEXT NOT NULL,
      badge_id TEXT NOT NULL,
      points_awarded INTEGER NOT NULL DEFAULT 0,
      claimed_at TEXT NOT NULL DEFAULT '',
      PRIMARY KEY (user_id, badge_id)
    )`);
    badgeClaimsReady = true;
  } catch { badgeClaimsReady = true; }
}

// Per-badge point payouts. Tiered by milestone difficulty so kids feel
// the bigger achievements are worth more without 25 being the floor.
const BADGE_POINTS: Record<string, number> = {
  first_assignment: 5,
  "5_assignments":   5,
  "3_in_a_day":      5,
  perfect_score:    10,
  "10_assignments": 10,
  "5_in_a_day":     10,
  "25_assignments": 15,
  all_subjects:     15,
  "50_assignments": 20,
  "100_assignments":25,
};
const DEFAULT_BADGE_POINTS = 5;

router.post("/claim-badge", async (req: AuthRequest, res: Response) => {
  if (!req.user) return res.status(401).json({ error: "auth required" });
  const userId = req.user.id;
  const badgeId = String(req.body?.badgeId || "").trim();
  if (!badgeId) return res.status(400).json({ error: "badgeId required" });

  try {
    await ensureBadgeClaims();

    // Confirm the student actually has this badge before paying out
    const lbRow: any = await db.prepare(
      "SELECT badges FROM leaderboard WHERE user_id = ?"
    ).get(userId);
    const earned: string[] = lbRow ? JSON.parse(lbRow.badges || "[]") : [];
    if (!earned.includes(badgeId)) {
      return res.status(400).json({ error: "badge not earned" });
    }

    // Already claimed? Return idempotent success — no double-payouts.
    const existing: any = await db.prepare(
      "SELECT * FROM badge_claims WHERE user_id = ? AND badge_id = ?"
    ).get(userId, badgeId);
    if (existing) {
      const balRow: any = await db.prepare(
        "SELECT COALESCE(dojo_points, 0) AS dojo_points FROM users WHERE id = ?"
      ).get(userId);
      return res.json({
        alreadyClaimed: true,
        pointsAwarded: 0,
        dojo_points: balRow?.dojo_points ?? 0,
      });
    }

    // First claim — award tiered points and log the claim
    const POINTS = BADGE_POINTS[badgeId] ?? DEFAULT_BADGE_POINTS;
    await db.prepare(`UPDATE users SET dojo_points = COALESCE(dojo_points, 0) + ? WHERE id = ?`).run(POINTS, userId);
    const balRow: any = await db.prepare(
      "SELECT COALESCE(dojo_points, 0) AS dojo_points FROM users WHERE id = ?"
    ).get(userId);
    await db.prepare(
      `INSERT INTO badge_claims (user_id, badge_id, points_awarded, claimed_at) VALUES (?, ?, ?, ?)`
    ).run(userId, badgeId, POINTS, new Date().toISOString());

    res.json({
      alreadyClaimed: false,
      pointsAwarded: POINTS,
      dojo_points: balRow?.dojo_points ?? 0,
    });
  } catch (e: any) {
    console.error("[leaderboard claim-badge]", e?.message || e);
    res.status(500).json({ error: e?.message || "claim failed" });
  }
});

// Returns the set of badge IDs this student has already claimed, so the
// loot-box UI can render them as "already opened" on first paint.
router.get("/my-claims", async (req: AuthRequest, res: Response) => {
  if (!req.user) return res.status(401).json({ error: "auth required" });
  try {
    await ensureBadgeClaims();
    const rows = await db.prepare(
      "SELECT badge_id, points_awarded, claimed_at FROM badge_claims WHERE user_id = ?"
    ).all(req.user.id) as any[];
    res.json({ claims: rows.map((r) => r.badge_id), details: rows });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || "failed" });
  }
});

export default router;
