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

    // Distinct subjects this student has completed AND per-subject counts
    // for the four "_master" badges (10 in a single subject) plus the
    // specialty subject completions (sel/history/science/vocabulary).
    let distinctSubjects = new Set<string>();
    const subjectCounts: Record<string, number> = {
      reading: 0, math: 0, writing: 0, spelling: 0,
      sel: 0, history: 0, science: 0, vocabulary: 0,
    };
    try {
      const subjects: any[] = await db.prepare(
        `SELECT LOWER(a.target_subject) AS subject, COUNT(*)::int AS n
         FROM submissions s
         JOIN assignments a ON a.id::text = s.assignment_id::text
         WHERE s.student_id::text = ? AND a.target_subject IS NOT NULL
         GROUP BY 1`
      ).all(userId);
      for (const r of subjects) {
        if (r?.subject) {
          distinctSubjects.add(r.subject);
          if (r.subject in subjectCounts) subjectCounts[r.subject] = Number(r.n) || 0;
        }
      }
    } catch {}
    const hasAllCoreSubjects =
      ["reading", "math", "writing", "spelling"].every((s) => distinctSubjects.has(s));

    // Bonus assignment completions (afternoon work). Used for the
    // bonus_buster + 5_bonus badges.
    let bonusCount = 0;
    try {
      const r: any = await db.prepare(
        `SELECT COUNT(*)::int AS n FROM submissions s
         JOIN assignments a ON a.id::text = s.assignment_id::text
         WHERE s.student_id::text = ?
           AND (COALESCE(a.is_afternoon, 0) = 1
                OR (a.title IS NOT NULL AND a.title LIKE '🌅%'))`
      ).get(userId);
      bonusCount = Number(r?.n ?? 0);
    } catch {}

    // Daily-themed: based on submission timestamps + days of the week.
    // - early_bird: any submission landed before 9 AM Pacific
    // - night_owl: any submission after 5 PM Pacific
    // - weekend_warrior: any submission on a Saturday or Sunday
    // - comeback: a submission day with a gap of 2+ days from the prior one
    let earlyBird = false, nightOwl = false, weekendWarrior = false, comeback = false;
    try {
      const stamps: any[] = await db.prepare(
        `SELECT COALESCE(submitted_at, created_at)::text AS ts
         FROM submissions WHERE student_id::text = ?
         ORDER BY ts ASC`
      ).all(userId);
      const PACIFIC_MS = -7 * 3600_000;
      let prevDay: number | null = null;
      for (const r of stamps) {
        const d = new Date(new Date(r.ts).getTime() + PACIFIC_MS);
        const hour = d.getUTCHours();
        const dow = d.getUTCDay(); // 0=Sun, 6=Sat
        if (hour < 9) earlyBird = true;
        if (hour >= 17) nightOwl = true;
        if (dow === 0 || dow === 6) weekendWarrior = true;
        const dayKey = Math.floor(d.getTime() / 86_400_000);
        if (prevDay != null && dayKey - prevDay >= 2) comeback = true;
        prevDay = dayKey;
      }
    } catch {}

    // Submission-day streak (consecutive Pacific school days with at
    // least one submission, ending today or yesterday). Cheap calc:
    // pull the last 14 distinct submission dates and walk backward.
    let streakDays = 0;
    try {
      const dates: any[] = await db.prepare(
        `SELECT DISTINCT SUBSTR((COALESCE(submitted_at, created_at)::timestamp - INTERVAL '7 hours')::text, 1, 10) AS d
         FROM submissions WHERE student_id::text = ?
         ORDER BY d DESC LIMIT 14`
      ).all(userId);
      const set = new Set(dates.map((r: any) => r.d));
      const todayStr = new Date(Date.now() - 7 * 3600_000).toISOString().slice(0, 10);
      const yesterday = new Date(Date.now() - 7 * 3600_000 - 86_400_000).toISOString().slice(0, 10);
      let cursor = set.has(todayStr) ? todayStr : (set.has(yesterday) ? yesterday : null);
      while (cursor && set.has(cursor)) {
        streakDays += 1;
        const d = new Date(cursor + "T12:00:00Z");
        d.setUTCDate(d.getUTCDate() - 1);
        cursor = d.toISOString().slice(0, 10);
      }
    } catch {}

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
      // Volume tier
      { id: "first_assignment", icon: "🎯",  label: "First One Done",  when: submittedCount >= 1 },
      { id: "5_assignments",    icon: "🔥",  label: "On a Roll",        when: submittedCount >= 5 },
      { id: "10_assignments",   icon: "⭐",  label: "Star Student",     when: submittedCount >= 10 },
      { id: "25_assignments",   icon: "🏆",  label: "Champion",         when: submittedCount >= 25 },
      { id: "50_assignments",   icon: "💎",  label: "Diamond Worker",   when: submittedCount >= 50 },
      { id: "100_assignments",  icon: "👑",  label: "Hall of Fame",     when: submittedCount >= 100 },
      { id: "200_assignments",  icon: "🌌",  label: "Cosmic Worker",    when: submittedCount >= 200 },
      { id: "500_assignments",  icon: "🦄",  label: "Legend",           when: submittedCount >= 500 },
      { id: "1000_assignments", icon: "🌠",  label: "Mythic",           when: submittedCount >= 1000 },
      // Quality tier
      { id: "perfect_score",    icon: "💯",  label: "Perfect Score",    when: perfectCount >= 1 },
      { id: "3_perfect",        icon: "✨",  label: "Triple Perfect",   when: perfectCount >= 3 },
      { id: "10_perfect",       icon: "🥇",  label: "Always Right",     when: perfectCount >= 10 },
      { id: "25_perfect",       icon: "🎖️", label: "Genius",           when: perfectCount >= 25 },
      { id: "50_perfect",       icon: "💠",  label: "Perfectionist",    when: perfectCount >= 50 },
      { id: "100_perfect",      icon: "🪐",  label: "Hall of Mind",     when: perfectCount >= 100 },
      { id: "all_subjects",     icon: "🌟",  label: "Well Rounded",     when: hasAllCoreSubjects },
      // Daily push
      { id: "3_in_a_day",       icon: "⚡",  label: "Speedster",        when: todayCount >= 3 },
      { id: "5_in_a_day",       icon: "🚀",  label: "Power Day",        when: todayCount >= 5 },
      { id: "7_in_a_day",       icon: "🌪️", label: "Tornado Day",      when: todayCount >= 7 },
      { id: "10_in_a_day",      icon: "🏃",  label: "Marathon Day",     when: todayCount >= 10 },
      // Subject masters (10 in a single core subject)
      { id: "reading_master",   icon: "📚",  label: "Reading Master",   when: subjectCounts.reading  >= 10 },
      { id: "math_master",      icon: "🔢",  label: "Math Master",      when: subjectCounts.math     >= 10 },
      { id: "writing_master",   icon: "✍️",  label: "Writing Master",   when: subjectCounts.writing  >= 10 },
      { id: "spelling_master",  icon: "🔤",  label: "Spelling Master",  when: subjectCounts.spelling >= 10 },
      // Subject legends (50 in a single core subject)
      { id: "reading_legend",   icon: "🦉",  label: "Reading Legend",   when: subjectCounts.reading  >= 50 },
      { id: "math_legend",      icon: "🧮",  label: "Math Legend",      when: subjectCounts.math     >= 50 },
      { id: "writing_legend",   icon: "🪶",  label: "Writing Legend",   when: subjectCounts.writing  >= 50 },
      { id: "spelling_legend",  icon: "🏰",  label: "Spelling Legend",  when: subjectCounts.spelling >= 50 },
      // Specialty subject completion (3 in specialty subject = mastery)
      { id: "sel_master",       icon: "🧠",  label: "Mindful",          when: subjectCounts.sel        >= 3 },
      { id: "history_master",   icon: "📜",  label: "Historian",        when: subjectCounts.history    >= 3 },
      { id: "science_master",   icon: "🔬",  label: "Scientist",        when: subjectCounts.science    >= 3 },
      { id: "vocab_master",     icon: "📖",  label: "Word Wizard",      when: subjectCounts.vocabulary >= 3 },
      // Bonus work
      { id: "bonus_buster",     icon: "🌅",  label: "Bonus Buster",     when: bonusCount >= 1 },
      { id: "5_bonus",          icon: "✨",  label: "Bonus Champion",   when: bonusCount >= 5 },
      { id: "10_bonus",         icon: "🌇",  label: "Bonus Hero",       when: bonusCount >= 10 },
      { id: "25_bonus",         icon: "🌃",  label: "Sunset Sage",      when: bonusCount >= 25 },
      // Streaks
      { id: "streak_3",         icon: "📅",  label: "3-Day Streak",     when: streakDays >= 3 },
      { id: "streak_5",         icon: "🔥",  label: "5-Day Streak",     when: streakDays >= 5 },
      { id: "streak_10",        icon: "🏅",  label: "10-Day Streak",    when: streakDays >= 10 },
      { id: "streak_15",        icon: "⚡",  label: "Lightning Streak", when: streakDays >= 15 },
      { id: "streak_30",        icon: "💫",  label: "Unstoppable",      when: streakDays >= 30 },
      { id: "streak_50",        icon: "👑",  label: "Living Legend",    when: streakDays >= 50 },
      // Daily-themed (one-shot earnable from any day's submission timing)
      { id: "early_bird",       icon: "🌄",  label: "Early Bird",       when: earlyBird },
      { id: "night_owl",        icon: "🌙",  label: "Night Owl",        when: nightOwl },
      { id: "weekend_warrior",  icon: "🛡️",  label: "Weekend Warrior",  when: weekendWarrior },
      { id: "comeback",         icon: "🔁",  label: "Comeback Kid",     when: comeback },
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

// Per-badge point payouts. Capped at 5 so badges feel rewarding but
// stay subordinate to the classroom-points teachers hand out manually.
// Floor of 1, ceiling of 5, distributed by milestone difficulty.
const BADGE_POINTS: Record<string, number> = {
  // Volume
  first_assignment:  1,
  "5_assignments":   2,
  "10_assignments":  2,
  "25_assignments":  3,
  "50_assignments":  4,
  "100_assignments": 5,
  "200_assignments": 5,
  "500_assignments": 5,
  "1000_assignments":5,
  // Quality
  perfect_score:     2,
  "3_perfect":       3,
  "10_perfect":      4,
  "25_perfect":      4,
  "50_perfect":      5,
  "100_perfect":     5,
  all_subjects:      3,
  // Daily push
  "3_in_a_day":      2,
  "5_in_a_day":      3,
  "7_in_a_day":      4,
  "10_in_a_day":     5,
  // Subject mastery (10 in a single subject)
  reading_master:    3,
  math_master:       3,
  writing_master:    3,
  spelling_master:   3,
  // Subject legend (50 in a single subject)
  reading_legend:    5,
  math_legend:       5,
  writing_legend:    5,
  spelling_legend:   5,
  // Specialty subject completion (3 each)
  sel_master:        2,
  history_master:    2,
  science_master:    2,
  vocab_master:      2,
  // Bonus work
  bonus_buster:      2,
  "5_bonus":         3,
  "10_bonus":        4,
  "25_bonus":        5,
  // Streaks
  streak_3:          2,
  streak_5:          3,
  streak_10:         4,
  streak_15:         5,
  streak_30:         5,
  streak_50:         5,
  // Daily-themed (one-shot)
  early_bird:        2,
  night_owl:         2,
  weekend_warrior:   3,
  comeback:          2,
};
const DEFAULT_BADGE_POINTS = 1;

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
