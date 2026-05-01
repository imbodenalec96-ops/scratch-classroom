// Additive features layered on top of the existing app — birthday on
// users, daily mood check-ins, daily personal goals, class
// announcements, helper-of-the-day rollup, and bulk star adjust.
//
// Everything in this file is purely additive. No changes are made to
// existing routes or tables; new columns/tables are created idempotently
// inside try/catch so a missing schema never blocks reads.
//
// Mounted in app.ts as `app.use("/api/extras", authMiddleware, extrasRoutes)`.

import { Router, Response } from "express";
import db from "../db.js";
import { AuthRequest } from "../middleware/auth.js";
import { requireRole } from "../middleware/rbac.js";

const router = Router();

let schemaReady = false;
async function ensureSchema() {
  if (schemaReady) return;
  // Birthday on users — used to render a 🎂 ribbon on the roster card
  // when today's Pacific date matches MM-DD. Stored as 'YYYY-MM-DD' or
  // 'MM-DD' so a missing year is fine.
  try { await db.exec(`ALTER TABLE users ADD COLUMN birthday TEXT`); } catch {}

  // Daily mood check-ins — one row per (user, day). Single emoji.
  try {
    await db.exec(`CREATE TABLE IF NOT EXISTS mood_checkins (
      user_id TEXT NOT NULL,
      day TEXT NOT NULL,
      mood TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT '',
      PRIMARY KEY (user_id, day)
    )`);
  } catch {}

  // Daily personal goal — one row per (user, day). Free-text, short.
  try {
    await db.exec(`CREATE TABLE IF NOT EXISTS daily_goals (
      user_id TEXT NOT NULL,
      day TEXT NOT NULL,
      goal TEXT NOT NULL,
      done INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT '',
      PRIMARY KEY (user_id, day)
    )`);
  } catch {}

  // Class announcements — teacher posts, students see in their dashboard.
  try {
    await db.exec(`CREATE TABLE IF NOT EXISTS class_announcements (
      id TEXT PRIMARY KEY,
      class_id TEXT NOT NULL,
      message TEXT NOT NULL,
      author_id TEXT NOT NULL,
      pinned INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT '',
      expires_at TEXT
    )`);
  } catch {}

  schemaReady = true;
}

const todayPacific = () => new Date(Date.now() - 7 * 3600_000).toISOString().slice(0, 10);

// ── Birthday ──────────────────────────────────────────────────────────
// Anyone can set their own birthday; teachers can set anyone's.

router.put("/users/:userId/birthday", async (req: AuthRequest, res: Response) => {
  const isSelf = req.user?.id === req.params.userId;
  const isStaff = req.user?.role === "teacher" || req.user?.role === "admin";
  if (!isSelf && !isStaff) return res.status(403).json({ error: "forbidden" });
  const raw = String(req.body?.birthday || "").trim();
  // Accept YYYY-MM-DD or MM-DD; reject anything else
  if (raw && !/^(\d{4}-)?\d{2}-\d{2}$/.test(raw)) {
    return res.status(400).json({ error: "use YYYY-MM-DD or MM-DD" });
  }
  try {
    await ensureSchema();
    await db.prepare("UPDATE users SET birthday = ? WHERE id::text = ?").run(raw || null, req.params.userId);
    res.json({ ok: true, birthday: raw || null });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || "failed" });
  }
});

router.get("/users/:userId/birthday", async (req: AuthRequest, res: Response) => {
  try {
    await ensureSchema();
    const row: any = await db.prepare("SELECT birthday FROM users WHERE id::text = ?").get(req.params.userId);
    res.json({ birthday: row?.birthday || null });
  } catch {
    res.json({ birthday: null });
  }
});

// ── Mood check-in ─────────────────────────────────────────────────────

router.post("/me/mood", async (req: AuthRequest, res: Response) => {
  if (!req.user) return res.status(401).json({ error: "auth required" });
  const mood = String(req.body?.mood || "").slice(0, 8);
  if (!mood) return res.status(400).json({ error: "mood required" });
  try {
    await ensureSchema();
    const day = todayPacific();
    // Upsert: replace today's entry if they want to change their mind
    await db.prepare(
      `INSERT INTO mood_checkins (user_id, day, mood, created_at) VALUES (?, ?, ?, ?)
       ON CONFLICT (user_id, day) DO UPDATE SET mood = EXCLUDED.mood`
    ).run(req.user.id, day, mood, new Date().toISOString());
    res.json({ ok: true, day, mood });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || "failed" });
  }
});

router.get("/me/mood", async (req: AuthRequest, res: Response) => {
  if (!req.user) return res.status(401).json({ error: "auth required" });
  try {
    await ensureSchema();
    const row: any = await db.prepare(
      "SELECT mood FROM mood_checkins WHERE user_id::text = ? AND day = ?"
    ).get(req.user.id, todayPacific());
    res.json({ mood: row?.mood || null });
  } catch {
    res.json({ mood: null });
  }
});

// Class mood roll-up — anonymized counts so teacher gets a glance.
router.get("/classes/:classId/mood-summary", requireRole("teacher", "admin"), async (req: AuthRequest, res: Response) => {
  try {
    await ensureSchema();
    const rows: any[] = await db.prepare(
      `SELECT m.mood, COUNT(*)::int AS n
       FROM mood_checkins m
       JOIN class_members cm ON cm.user_id::text = m.user_id::text
       WHERE cm.class_id::text = ? AND m.day = ?
       GROUP BY m.mood`
    ).all(req.params.classId, todayPacific());
    res.json({ day: todayPacific(), counts: rows });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || "failed" });
  }
});

// ── Daily goal ────────────────────────────────────────────────────────

router.post("/me/goal", async (req: AuthRequest, res: Response) => {
  if (!req.user) return res.status(401).json({ error: "auth required" });
  const goal = String(req.body?.goal || "").trim().slice(0, 140);
  if (!goal) return res.status(400).json({ error: "goal required" });
  try {
    await ensureSchema();
    const day = todayPacific();
    await db.prepare(
      `INSERT INTO daily_goals (user_id, day, goal, created_at) VALUES (?, ?, ?, ?)
       ON CONFLICT (user_id, day) DO UPDATE SET goal = EXCLUDED.goal`
    ).run(req.user.id, day, goal, new Date().toISOString());
    res.json({ ok: true, day, goal, done: false });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || "failed" });
  }
});

router.get("/me/goal", async (req: AuthRequest, res: Response) => {
  if (!req.user) return res.status(401).json({ error: "auth required" });
  try {
    await ensureSchema();
    const row: any = await db.prepare(
      "SELECT goal, done FROM daily_goals WHERE user_id::text = ? AND day = ?"
    ).get(req.user.id, todayPacific());
    res.json({ goal: row?.goal || null, done: !!row?.done });
  } catch {
    res.json({ goal: null, done: false });
  }
});

router.post("/me/goal/done", async (req: AuthRequest, res: Response) => {
  if (!req.user) return res.status(401).json({ error: "auth required" });
  try {
    await ensureSchema();
    const r = await db.prepare(
      "UPDATE daily_goals SET done = 1 WHERE user_id::text = ? AND day = ?"
    ).run(req.user.id, todayPacific());
    res.json({ ok: true, changes: (r as any)?.changes ?? 0 });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || "failed" });
  }
});

// ── Next badge — "you're N away from X" ───────────────────────────────
// Pulls the kid's current counts and finds the closest unearned
// milestone, so the dashboard can surface a "1 more for Reading
// Master!" tile that makes progress legible. Returns null if every
// milestone is already earned (good problem).
router.get("/me/next-badge", async (req: AuthRequest, res: Response) => {
  if (!req.user) return res.status(401).json({ error: "auth required" });
  const userId = req.user.id;
  try {
    // Same counts the auto-award computes — kept in sync intentionally
    const totalSub: any = await db.prepare(
      "SELECT COUNT(*)::int AS n FROM submissions WHERE student_id::text = ?"
    ).get(userId).catch(() => ({ n: 0 }));
    const submittedCount = Number(totalSub?.n ?? 0);

    const today: any = await db.prepare(
      `SELECT COUNT(*)::int AS n FROM submissions
       WHERE student_id::text = ?
         AND submitted_at >= (CURRENT_DATE - INTERVAL '1 day')`
    ).get(userId).catch(() => ({ n: 0 }));
    const todayCount = Number(today?.n ?? 0);

    const perfect: any = await db.prepare(
      `SELECT COUNT(*)::int AS n FROM submissions
       WHERE student_id::text = ? AND (grade = 100 OR human_grade_score = 100)`
    ).get(userId).catch(() => ({ n: 0 }));
    const perfectCount = Number(perfect?.n ?? 0);

    const subjectCounts: Record<string, number> = {
      reading: 0, math: 0, writing: 0, spelling: 0,
      sel: 0, history: 0, science: 0, vocabulary: 0,
    };
    try {
      const subjects: any[] = await db.prepare(
        `SELECT LOWER(a.target_subject) AS subject, COUNT(*)::int AS n
         FROM submissions s JOIN assignments a ON a.id::text = s.assignment_id::text
         WHERE s.student_id::text = ? AND a.target_subject IS NOT NULL
         GROUP BY 1`
      ).all(userId);
      for (const r of subjects) {
        if (r?.subject in subjectCounts) subjectCounts[r.subject] = Number(r.n) || 0;
      }
    } catch {}

    let bonusCount = 0;
    try {
      const r: any = await db.prepare(
        `SELECT COUNT(*)::int AS n FROM submissions s
         JOIN assignments a ON a.id::text = s.assignment_id::text
         WHERE s.student_id::text = ?
           AND (COALESCE(a.is_afternoon, 0) = 1 OR (a.title IS NOT NULL AND a.title LIKE '🌅%'))`
      ).get(userId);
      bonusCount = Number(r?.n ?? 0);
    } catch {}

    let streakDays = 0;
    try {
      const dates: any[] = await db.prepare(
        `SELECT DISTINCT SUBSTR((submitted_at::timestamp - INTERVAL '7 hours')::text, 1, 10) AS d
         FROM submissions WHERE student_id::text = ?
         ORDER BY d DESC LIMIT 30`
      ).all(userId);
      const set = new Set(dates.map((r: any) => r.d));
      const today2 = todayPacific();
      const yesterday = new Date(Date.now() - 7 * 3600_000 - 86_400_000).toISOString().slice(0, 10);
      let cursor: string | null = set.has(today2) ? today2 : (set.has(yesterday) ? yesterday : null);
      while (cursor && set.has(cursor)) {
        streakDays += 1;
        const d = new Date(cursor + "T12:00:00Z");
        d.setUTCDate(d.getUTCDate() - 1);
        cursor = d.toISOString().slice(0, 10);
      }
    } catch {}

    // Already earned set
    let earned = new Set<string>();
    try {
      const lb: any = await db.prepare("SELECT badges FROM leaderboard WHERE user_id::text = ?").get(userId);
      if (lb?.badges) {
        try {
          const parsed = typeof lb.badges === "string" ? JSON.parse(lb.badges) : lb.badges;
          if (Array.isArray(parsed)) earned = new Set(parsed);
        } catch {}
      }
    } catch {}

    // Threshold table — must stay in sync with leaderboard.ts milestones.
    type M = { id: string; icon: string; label: string; target: number; current: number };
    const all: M[] = [
      { id: "first_assignment", icon: "🎯", label: "First One Done",  target: 1,    current: submittedCount },
      { id: "5_assignments",    icon: "🔥", label: "On a Roll",        target: 5,    current: submittedCount },
      { id: "10_assignments",   icon: "⭐", label: "Star Student",     target: 10,   current: submittedCount },
      { id: "25_assignments",   icon: "🏆", label: "Champion",         target: 25,   current: submittedCount },
      { id: "50_assignments",   icon: "💎", label: "Diamond Worker",   target: 50,   current: submittedCount },
      { id: "100_assignments",  icon: "👑", label: "Hall of Fame",     target: 100,  current: submittedCount },
      { id: "200_assignments",  icon: "🌌", label: "Cosmic Worker",    target: 200,  current: submittedCount },
      { id: "500_assignments",  icon: "🦄", label: "Legend",           target: 500,  current: submittedCount },
      { id: "1000_assignments", icon: "🌠", label: "Mythic",           target: 1000, current: submittedCount },
      { id: "perfect_score",    icon: "💯", label: "Perfect Score",    target: 1,    current: perfectCount },
      { id: "3_perfect",        icon: "✨", label: "Triple Perfect",   target: 3,    current: perfectCount },
      { id: "10_perfect",       icon: "🥇", label: "Always Right",     target: 10,   current: perfectCount },
      { id: "25_perfect",       icon: "🎖️",label: "Genius",           target: 25,   current: perfectCount },
      { id: "50_perfect",       icon: "💠", label: "Perfectionist",    target: 50,   current: perfectCount },
      { id: "100_perfect",      icon: "🪐", label: "Hall of Mind",     target: 100,  current: perfectCount },
      { id: "3_in_a_day",       icon: "⚡", label: "Speedster",        target: 3,    current: todayCount },
      { id: "5_in_a_day",       icon: "🚀", label: "Power Day",        target: 5,    current: todayCount },
      { id: "7_in_a_day",       icon: "🌪️",label: "Tornado Day",      target: 7,    current: todayCount },
      { id: "10_in_a_day",      icon: "🏃", label: "Marathon Day",     target: 10,   current: todayCount },
      { id: "reading_master",   icon: "📚", label: "Reading Master",   target: 10,   current: subjectCounts.reading },
      { id: "math_master",      icon: "🔢", label: "Math Master",      target: 10,   current: subjectCounts.math },
      { id: "writing_master",   icon: "✍️", label: "Writing Master",   target: 10,   current: subjectCounts.writing },
      { id: "spelling_master",  icon: "🔤", label: "Spelling Master",  target: 10,   current: subjectCounts.spelling },
      { id: "reading_legend",   icon: "🦉", label: "Reading Legend",   target: 50,   current: subjectCounts.reading },
      { id: "math_legend",      icon: "🧮", label: "Math Legend",      target: 50,   current: subjectCounts.math },
      { id: "writing_legend",   icon: "🪶", label: "Writing Legend",   target: 50,   current: subjectCounts.writing },
      { id: "spelling_legend",  icon: "🏰", label: "Spelling Legend",  target: 50,   current: subjectCounts.spelling },
      { id: "sel_master",       icon: "🧠", label: "Mindful",          target: 3,    current: subjectCounts.sel },
      { id: "history_master",   icon: "📜", label: "Historian",        target: 3,    current: subjectCounts.history },
      { id: "science_master",   icon: "🔬", label: "Scientist",        target: 3,    current: subjectCounts.science },
      { id: "vocab_master",     icon: "📖", label: "Word Wizard",      target: 3,    current: subjectCounts.vocabulary },
      { id: "bonus_buster",     icon: "🌅", label: "Bonus Buster",     target: 1,    current: bonusCount },
      { id: "5_bonus",          icon: "✨", label: "Bonus Champion",   target: 5,    current: bonusCount },
      { id: "10_bonus",         icon: "🌇", label: "Bonus Hero",       target: 10,   current: bonusCount },
      { id: "25_bonus",         icon: "🌃", label: "Sunset Sage",      target: 25,   current: bonusCount },
      { id: "streak_3",         icon: "📅", label: "3-Day Streak",     target: 3,    current: streakDays },
      { id: "streak_5",         icon: "🔥", label: "5-Day Streak",     target: 5,    current: streakDays },
      { id: "streak_10",        icon: "🏅", label: "10-Day Streak",    target: 10,   current: streakDays },
      { id: "streak_15",        icon: "⚡", label: "Lightning Streak", target: 15,   current: streakDays },
      { id: "streak_30",        icon: "💫", label: "Unstoppable",      target: 30,   current: streakDays },
      { id: "streak_50",        icon: "👑", label: "Living Legend",    target: 50,   current: streakDays },
    ];
    const candidates = all
      .filter((m) => !earned.has(m.id) && m.current < m.target)
      .map((m) => ({ ...m, gap: m.target - m.current }))
      .sort((a, b) => a.gap - b.gap);
    const top = candidates[0] || null;
    res.json({ next: top });
  } catch (e: any) {
    res.json({ next: null });
  }
});

// ── Streak (read-only) ────────────────────────────────────────────────
// Walks the kid's last 14 distinct submission days backward from today
// to compute their current consecutive-day streak. Cheap, no extra
// table needed since we already have submissions.
router.get("/me/streak", async (req: AuthRequest, res: Response) => {
  if (!req.user) return res.status(401).json({ error: "auth required" });
  try {
    const dates: any[] = await db.prepare(
      `SELECT DISTINCT SUBSTR((submitted_at::timestamp - INTERVAL '7 hours')::text, 1, 10) AS d
       FROM submissions WHERE student_id::text = ?
       ORDER BY d DESC LIMIT 30`
    ).all(req.user.id);
    const set = new Set(dates.map((r: any) => r.d));
    const today = todayPacific();
    const yesterday = new Date(Date.now() - 7 * 3600_000 - 86_400_000).toISOString().slice(0, 10);
    let cursor: string | null = set.has(today) ? today : (set.has(yesterday) ? yesterday : null);
    let streak = 0;
    while (cursor && set.has(cursor)) {
      streak += 1;
      const d = new Date(cursor + "T12:00:00Z");
      d.setUTCDate(d.getUTCDate() - 1);
      cursor = d.toISOString().slice(0, 10);
    }
    res.json({ streak, today });
  } catch {
    res.json({ streak: 0 });
  }
});

// ── Class announcements ───────────────────────────────────────────────

router.post("/classes/:classId/announcements", requireRole("teacher", "admin"), async (req: AuthRequest, res: Response) => {
  const message = String(req.body?.message || "").trim().slice(0, 500);
  if (!message) return res.status(400).json({ error: "message required" });
  const pinned = req.body?.pinned ? 1 : 0;
  try {
    await ensureSchema();
    const id = (globalThis as any).crypto?.randomUUID?.() || String(Date.now());
    await db.prepare(
      `INSERT INTO class_announcements (id, class_id, message, author_id, pinned, created_at) VALUES (?, ?, ?, ?, ?, ?)`
    ).run(id, req.params.classId, message, req.user!.id, pinned, new Date().toISOString());
    res.json({ ok: true, id });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || "failed" });
  }
});

router.get("/classes/:classId/announcements", async (req: AuthRequest, res: Response) => {
  try {
    await ensureSchema();
    const rows = await db.prepare(
      `SELECT id, message, pinned, created_at
       FROM class_announcements
       WHERE class_id::text = ?
         AND (expires_at IS NULL OR expires_at > ?)
       ORDER BY pinned DESC, created_at DESC LIMIT 20`
    ).all(req.params.classId, new Date().toISOString());
    res.json(rows);
  } catch {
    res.json([]);
  }
});

router.delete("/classes/:classId/announcements/:id", requireRole("teacher", "admin"), async (req: AuthRequest, res: Response) => {
  try {
    await ensureSchema();
    await db.prepare(`DELETE FROM class_announcements WHERE id = ? AND class_id::text = ?`).run(req.params.id, req.params.classId);
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || "failed" });
  }
});

// ── Helper of the day ─────────────────────────────────────────────────
// Picks the kid with the most submissions today (cheap proxy for "most
// involved"). Could be enhanced later to use cleared help-requests as
// the metric.
router.get("/classes/:classId/helper-of-day", async (req: AuthRequest, res: Response) => {
  try {
    const day = todayPacific();
    const row: any = await db.prepare(
      `SELECT u.id::text AS user_id, u.name, COUNT(*)::int AS n
       FROM submissions s
       JOIN users u ON u.id::text = s.student_id::text
       JOIN class_members cm ON cm.user_id::text = u.id::text
       WHERE cm.class_id::text = ?
         AND SUBSTR((s.submitted_at::timestamp - INTERVAL '7 hours')::text, 1, 10) = ?
       GROUP BY u.id::text, u.name
       ORDER BY n DESC LIMIT 1`
    ).get(req.params.classId, day);
    if (!row) return res.json({ helper: null, day });
    res.json({ helper: { id: row.user_id, name: row.name, count: row.n }, day });
  } catch {
    res.json({ helper: null });
  }
});

// ── Manual assignment progress ────────────────────────────────────────
// Teacher manually credits a student with N completed assignments today.
// Used now that iPads are away — kids do work on paper, teacher tallies.
// Stored as a daily counter per (student, day). Board's live-progress
// reads this and adds it to the bucket-credit done count, so the bar
// reflects total work whether digital or paper.
let manualSchemaReady = false;
async function ensureManualSchema() {
  if (manualSchemaReady) return;
  try {
    await db.exec(`CREATE TABLE IF NOT EXISTS manual_progress (
      student_id TEXT NOT NULL,
      day TEXT NOT NULL,
      count INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL DEFAULT '',
      updated_by TEXT,
      PRIMARY KEY (student_id, day)
    )`);
  } catch {}
  manualSchemaReady = true;
}

// Each completed assignment is worth this many dojo points. Tuned to
// give kids a clear earn rate (1 assignment = 1 store point) without
// making the store feel cheap.
const POINTS_PER_ASSIGNMENT = 1;

router.put("/students/:studentId/manual-progress", requireRole("teacher", "admin"), async (req: AuthRequest, res: Response) => {
  const studentId = req.params.studentId;
  const count = Math.max(0, Math.min(999, Number(req.body?.count ?? 0) | 0));
  try {
    await ensureManualSchema();
    const day = todayPacific();

    // Compute the delta vs whatever was previously stored for today.
    // POINTS_PER_ASSIGNMENT × delta is added (or removed) from the
    // student's dojo_points, so the store balance reflects assignment
    // completion in real time. Negative deltas roll points back when
    // the teacher corrects an over-tally.
    const prev: any = await db.prepare(
      `SELECT count FROM manual_progress WHERE student_id::text = ? AND day = ?`
    ).get(studentId, day);
    const prevCount = Number(prev?.count ?? 0);
    const delta = count - prevCount;

    await db.prepare(
      `INSERT INTO manual_progress (student_id, day, count, updated_at, updated_by)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT (student_id, day) DO UPDATE SET
         count = EXCLUDED.count,
         updated_at = EXCLUDED.updated_at,
         updated_by = EXCLUDED.updated_by`
    ).run(studentId, day, count, new Date().toISOString(), req.user?.id ?? null);

    let pointsDelta = 0;
    let newBalance: number | null = null;
    if (delta !== 0) {
      pointsDelta = delta * POINTS_PER_ASSIGNMENT;
      try {
        // Clamp at 0 so a correction can't push a kid into negative.
        await db.prepare(
          `UPDATE users SET dojo_points = GREATEST(0, COALESCE(dojo_points, 0) + ?) WHERE id::text = ?`
        ).run(pointsDelta, studentId);
        const balRow: any = await db.prepare(
          `SELECT COALESCE(dojo_points, 0) AS dojo_points FROM users WHERE id::text = ?`
        ).get(studentId);
        newBalance = balRow?.dojo_points ?? 0;
        // Log to store_transactions for audit visibility
        try {
          const txId = (globalThis as any).crypto?.randomUUID?.() || String(Date.now());
          await db.prepare(
            `INSERT INTO store_transactions (id, student_id, item_id, item_name, price, kind, delta, reason, actor_id)
             VALUES (?, ?, NULL, ?, 0, 'adjust', ?, ?, ?)`
          ).run(txId, studentId, "Assignment credit", pointsDelta, `manual_progress ${prevCount}→${count}`, req.user?.id ?? null);
        } catch { /* tx table may not exist on first run */ }
      } catch { /* best-effort */ }
    }

    res.json({ ok: true, day, count, pointsDelta, dojo_points: newBalance });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || "failed" });
  }
});

router.get("/classes/:classId/manual-progress", async (req: AuthRequest, res: Response) => {
  try {
    await ensureManualSchema();
    const day = todayPacific();
    const rows: any[] = await db.prepare(
      `SELECT mp.student_id::text AS student_id, mp.count
       FROM manual_progress mp
       JOIN class_members cm ON cm.user_id::text = mp.student_id::text
       WHERE cm.class_id::text = ? AND mp.day = ?`
    ).all(req.params.classId, day);
    res.json({ day, byStudent: rows });
  } catch {
    res.json({ day: todayPacific(), byStudent: [] });
  }
});

// ── Board-side store redemption (4-digit PIN) ─────────────────────────
// iPads are gone — kids walk up to the projector, the teacher opens
// the store, kid types their personal 4-digit code (their student-login
// password), picks an item. PIN is verified server-side; no token
// needed. Teacher/admin override works via store_override_until same
// as the cashout block check.

// Idempotent migration for the kiosk PIN column. Stored as plaintext
// (not hashed) on purpose: teachers need to look up + share PINs with
// kids who forget. The PIN is separate from the student-login password
// so leaking the PIN doesn't compromise the account.
let pinSchemaReady = false;
async function ensurePinSchema() {
  if (pinSchemaReady) return;
  try { await db.exec(`ALTER TABLE users ADD COLUMN kiosk_pin TEXT`); } catch {}
  pinSchemaReady = true;
}
function generatePin(): string {
  // 4 digits, never starts with 0 so kids don't lose leading digits
  return String(1000 + Math.floor(Math.random() * 9000));
}

// Returns whether the store is currently spendable for any kid in
// the class. Two ways to be open:
//   1. Teacher override (admin_settings.store_override_until in the future)
//   2. Current Pacific time falls within a "cashout" schedule block for the class
// Returns: { open: bool, source: "override" | "schedule" | "closed", until?: string }
async function checkStoreOpenForStudent(studentId: string): Promise<{ open: boolean; source: "override" | "schedule" | "closed"; until?: string | null }> {
  // 1. Teacher override
  try {
    const o: any = await db.prepare(
      "SELECT value FROM admin_settings WHERE key='store_override_until'"
    ).get();
    if (o?.value) {
      const until = Date.parse(String(o.value));
      if (Number.isFinite(until) && until > Date.now()) {
        return { open: true, source: "override", until: new Date(until).toISOString() };
      }
    }
  } catch {}

  // 2. Schedule cashout block. Compute Pacific HHMM + day-of-week.
  const pacific = new Date(Date.now() - 7 * 3600_000);
  const hhmm = `${String(pacific.getUTCHours()).padStart(2, "0")}:${String(pacific.getUTCMinutes()).padStart(2, "0")}`;
  const dayName = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][pacific.getUTCDay()];
  try {
    const row: any = await db.prepare(
      `SELECT cs.subject, cs.start_time, cs.end_time, cs.active_days
         FROM class_schedule cs
         JOIN class_members cm ON cm.class_id::text = cs.class_id
        WHERE cm.user_id = ?::uuid
          AND cs.subject = 'cashout'
          AND cs.start_time <= ?
          AND cs.end_time > ?
        LIMIT 1`
    ).get(studentId, hhmm, hhmm);
    const active = row && (
      !row.active_days ||
      String(row.active_days).toLowerCase().includes(dayName.toLowerCase())
    );
    if (active) return { open: true, source: "schedule", until: null };
  } catch {}

  return { open: false, source: "closed" };
}

// GET /extras/store/is-open?studentId=X — UI checks this to render
// a "Store closed" banner instead of showing items the kid can't buy.
router.get("/store/is-open", async (req: AuthRequest, res: Response) => {
  const studentId = String(req.query?.studentId || "").trim();
  if (!studentId) return res.status(400).json({ error: "studentId required" });
  try {
    const r = await checkStoreOpenForStudent(studentId);
    res.json(r);
  } catch (e: any) {
    res.status(500).json({ error: e?.message || "failed" });
  }
});

router.post("/board-redeem", async (req: AuthRequest, res: Response) => {
  // Teacher must initiate (this endpoint runs from the board view)
  if (req.user?.role !== "teacher" && req.user?.role !== "admin") {
    return res.status(403).json({ error: "teacher only" });
  }
  const studentId = String(req.body?.studentId || "").trim();
  const pin = String(req.body?.pin || "").trim();
  const itemId = String(req.body?.itemId || "").trim();
  if (!studentId || !pin || !itemId) {
    return res.status(400).json({ error: "studentId, pin, and itemId required" });
  }
  try {
    await ensurePinSchema();
    // Verify the kid's kiosk PIN. We try kiosk_pin first; for kids who
    // haven't been assigned one yet, fall back to the legacy bcrypt
    // password_hash so the system keeps working until every PIN is set.
    const bcrypt = await import("bcrypt");
    const userRow: any = await db.prepare(
      "SELECT id::text AS id, name, password_hash, role, kiosk_pin FROM users WHERE id::text = ?"
    ).get(studentId);
    if (!userRow) return res.status(404).json({ error: "Student not found" });
    if (userRow.role !== "student") return res.status(400).json({ error: "Not a student" });
    let valid = false;
    if (userRow.kiosk_pin) {
      valid = String(userRow.kiosk_pin) === pin;
    } else {
      // No kiosk PIN set yet → accept the login password as a stop-gap
      try { valid = await bcrypt.default.compare(pin, userRow.password_hash); } catch { valid = false; }
    }
    if (!valid) return res.status(401).json({ error: "Wrong PIN" });

    // Store-open gate. Even though the teacher initiates board-redeem,
    // we still enforce that the store is officially open (override or
    // cashout block). Keeps kids from spending whenever they want; the
    // teacher uses the override toggle to open the store on demand.
    const openCheck = await checkStoreOpenForStudent(studentId);
    if (!openCheck.open) {
      return res.status(423).json({ error: "Store is closed. Open it from Tools → 🛒 Store or wait for the cashout block." });
    }

    // Pull the item + balance, then run the same redemption flow as
    // /store/redeem but without the cashout-block gate (teacher already
    // explicitly opened the redemption flow on the board).
    const item: any = await db.prepare(
      `SELECT id, name, price, stock, enabled FROM store_items WHERE id = ?`
    ).get(itemId);
    if (!item) return res.status(404).json({ error: "Item not found" });
    if (!item.enabled) return res.status(400).json({ error: "Item disabled" });
    if (item.stock != null && item.stock <= 0) return res.status(400).json({ error: "Out of stock" });
    const balanceRow: any = await db.prepare(
      `SELECT COALESCE(dojo_points, 0) AS dojo_points FROM users WHERE id::text = ?`
    ).get(studentId);
    if ((balanceRow?.dojo_points ?? 0) < item.price) {
      return res.status(400).json({ error: `Not enough points — needs ${item.price - (balanceRow?.dojo_points ?? 0)} more` });
    }

    await db.prepare(
      `UPDATE users SET dojo_points = COALESCE(dojo_points, 0) - ? WHERE id::text = ?`
    ).run(item.price, studentId);
    if (item.stock != null) {
      await db.prepare(`UPDATE store_items SET stock = stock - 1 WHERE id = ?`).run(item.id);
    }
    const txId = (globalThis as any).crypto?.randomUUID?.() || String(Date.now());
    try {
      await db.prepare(
        `INSERT INTO store_transactions (id, student_id, item_id, item_name, price, kind, delta, reason, actor_id)
         VALUES (?, ?, ?, ?, ?, 'redeem', ?, ?, ?)`
      ).run(txId, studentId, item.id, item.name, item.price, -item.price, "board redeem", req.user!.id);
    } catch { /* if tx table missing, ignore */ }

    const newBalRow: any = await db.prepare(
      `SELECT COALESCE(dojo_points, 0) AS dojo_points FROM users WHERE id::text = ?`
    ).get(studentId);
    res.json({
      ok: true,
      student_name: userRow.name,
      item_name: item.name,
      price: item.price,
      dojo_points: newBalRow?.dojo_points ?? 0,
    });
  } catch (e: any) {
    console.error("[board-redeem]", e?.message || e);
    res.status(500).json({ error: e?.message || "redemption failed" });
  }
});

// ── Kiosk PIN management (teacher-only) ──────────────────────────────
// GET  /classes/:classId/pins → list every student's current PIN
// PUT  /students/:studentId/pin body {pin?} → set PIN; if pin missing, generate random 4-digit
// POST /classes/:classId/pins/generate-missing → assign random PIN to every kid that doesn't have one yet

router.get("/classes/:classId/pins", requireRole("teacher", "admin"), async (req: AuthRequest, res: Response) => {
  try {
    await ensurePinSchema();
    const rows: any[] = await db.prepare(
      `SELECT u.id::text AS id, u.name, u.kiosk_pin, u.avatar_emoji
       FROM users u
       JOIN class_members cm ON cm.user_id::text = u.id::text
       WHERE cm.class_id::text = ? AND u.role = 'student'
       ORDER BY u.name`
    ).all(req.params.classId);
    res.json(rows);
  } catch (e: any) {
    res.status(500).json({ error: e?.message || "failed" });
  }
});

router.put("/students/:studentId/pin", requireRole("teacher", "admin"), async (req: AuthRequest, res: Response) => {
  const studentId = req.params.studentId;
  let pin = String(req.body?.pin || "").replace(/\D/g, "");
  if (!pin) pin = generatePin();
  if (pin.length < 3 || pin.length > 8) {
    return res.status(400).json({ error: "PIN must be 3-8 digits" });
  }
  try {
    await ensurePinSchema();
    await db.prepare(`UPDATE users SET kiosk_pin = ? WHERE id::text = ?`).run(pin, studentId);
    res.json({ ok: true, pin });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || "failed" });
  }
});

router.post("/classes/:classId/pins/generate-missing", requireRole("teacher", "admin"), async (req: AuthRequest, res: Response) => {
  try {
    await ensurePinSchema();
    const rows: any[] = await db.prepare(
      `SELECT u.id::text AS id FROM users u
       JOIN class_members cm ON cm.user_id::text = u.id::text
       WHERE cm.class_id::text = ? AND u.role = 'student'
         AND (u.kiosk_pin IS NULL OR u.kiosk_pin = '')`
    ).all(req.params.classId);
    let assigned = 0;
    for (const r of rows) {
      try {
        await db.prepare(`UPDATE users SET kiosk_pin = ? WHERE id::text = ?`).run(generatePin(), r.id);
        assigned += 1;
      } catch {}
    }
    res.json({ assigned });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || "failed" });
  }
});

// ── One-shot help-request clearer (no auth — diagnostic) ──────────────
router.post("/clear-help/:studentId", async (req: AuthRequest, res: Response) => {
  try {
    const r = await db.prepare(
      "UPDATE help_requests SET cleared_at = ?, cleared_by = ? WHERE student_id::text = ? AND cleared_at IS NULL"
    ).run(new Date().toISOString(), req.user?.id ?? null, req.params.studentId);
    res.json({ cleared: (r as any)?.changes ?? 0 });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || "failed" });
  }
});

// ── Bulk star adjust ──────────────────────────────────────────────────
// Teacher hands out stars to many kids at once. Body: { studentIds: string[], delta: number }.
// Caps stars at [0, 5] like the single endpoint.
router.post("/classes/:classId/bulk-stars", requireRole("teacher", "admin"), async (req: AuthRequest, res: Response) => {
  const ids: string[] = Array.isArray(req.body?.studentIds) ? req.body.studentIds : [];
  const delta = Math.max(-5, Math.min(5, Number(req.body?.delta ?? 0) | 0));
  if (ids.length === 0 || delta === 0) return res.status(400).json({ error: "studentIds + non-zero delta required" });
  let updated = 0;
  for (const sid of ids) {
    try {
      // Ensure board_user_data row exists then bump stars
      await db.prepare(
        `INSERT INTO board_user_data (user_id, behavior_stars, reward_count, level)
         VALUES (?, 0, 0, 1)
         ON CONFLICT (user_id) DO NOTHING`
      ).run(sid);
      await db.prepare(
        `UPDATE board_user_data
           SET behavior_stars = LEAST(5, GREATEST(0, behavior_stars + ?))
         WHERE user_id::text = ?`
      ).run(delta, sid);
      updated += 1;
    } catch { /* ignore individual failures */ }
  }
  res.json({ updated, delta });
});

export default router;
