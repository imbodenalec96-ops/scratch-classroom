import { Router, Response } from "express";
import crypto from "crypto";
import db from "../db.js";
import { AuthRequest } from "../middleware/auth.js";
import { requireRole } from "../middleware/rbac.js";

const router = Router();

// Create class
router.post("/", requireRole("teacher", "admin"), async (req: AuthRequest, res: Response) => {
  const { name } = req.body;
  const code = Math.random().toString(36).slice(2, 8).toUpperCase();
  const id = crypto.randomUUID();
  await db.prepare("INSERT INTO classes (id, name, teacher_id, code) VALUES (?, ?, ?, ?)").run(id, name, req.user!.id, code);
  const row = await db.prepare("SELECT * FROM classes WHERE id = ?").get(id);
  res.json(row);
});

// List classes for current user
router.get("/", async (req: AuthRequest, res: Response) => {
  const u = req.user!;
  let rows;
  if (u.role === "admin") {
    rows = await db.prepare(
      `SELECT c.*, u.name as teacher_name
       FROM classes c
       LEFT JOIN users u ON u.id = c.teacher_id
       ORDER BY c.created_at DESC`
    ).all();
  } else if (u.role === "teacher") {
    rows = await db.prepare("SELECT * FROM classes WHERE teacher_id = ? ORDER BY created_at DESC").all(u.id);
  } else {
    rows = await db.prepare(
      `SELECT c.* FROM classes c JOIN class_members cm ON c.id = cm.class_id WHERE cm.user_id = ? ORDER BY c.created_at DESC`
    ).all(u.id);
  }
  res.json(rows);
});

// Delete class (admin can delete any, teacher can delete own)
router.delete("/:id", requireRole("teacher", "admin"), async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const u = req.user!;

  if (u.role === "teacher") {
    const own = await db.prepare("SELECT id FROM classes WHERE id = ? AND teacher_id = ?").get(id, u.id) as any;
    if (!own) return res.status(403).json({ error: "Forbidden" });
  }

  await db.prepare("DELETE FROM classes WHERE id = ?").run(id);
  res.json({ deleted: true });
});

// Get single class
router.get("/:id", async (req: AuthRequest, res: Response) => {
  const row = await db.prepare("SELECT * FROM classes WHERE id = ?").get(req.params.id);
  if (!row) return res.status(404).json({ error: "Not found" });
  res.json(row);
});

// Join class by code
router.post("/join", requireRole("student"), async (req: AuthRequest, res: Response) => {
  const { code } = req.body;
  const cls = await db.prepare("SELECT id FROM classes WHERE code = ?").get(code) as any;
  if (!cls) return res.status(404).json({ error: "Invalid code" });
  await db.prepare("INSERT INTO class_members (user_id, class_id) VALUES (?, ?) ON CONFLICT DO NOTHING").run(req.user!.id, cls.id);
  res.json({ joined: cls.id });
});

// List students in class
router.get("/:id/students", requireRole("teacher", "admin"), async (req: AuthRequest, res: Response) => {
  const rows = await db.prepare(
    `SELECT u.id, u.email, u.name, u.role, cm.joined_at
     FROM users u JOIN class_members cm ON u.id = cm.user_id
     WHERE cm.class_id = ? ORDER BY u.name`
  ).all(req.params.id);
  res.json(rows);
});

// Bulk import students
router.post("/:id/import", requireRole("teacher", "admin"), async (req: AuthRequest, res: Response) => {
  const { students } = req.body;
  const classId = req.params.id;
  const bcrypt = await import("bcrypt");
  const created: any[] = [];
  for (const s of students) {
    const hash = await bcrypt.default.hash(s.password || "password123", 10);
    const id = crypto.randomUUID();
    try {
      await db.prepare(
        `INSERT INTO users (id, email, password_hash, name, role) VALUES (?, ?, ?, ?, 'student')`
      ).run(id, s.email, hash, s.name);
    } catch {
      // conflict — look up existing
    }
    const row = await db.prepare("SELECT id, email, name, role FROM users WHERE email = ?").get(s.email) as any;
    if (row) {
      await db.prepare("INSERT INTO class_members (user_id, class_id) VALUES (?, ?) ON CONFLICT DO NOTHING").run(row.id, classId);
      created.push(row);
    }
  }
  res.json({ imported: created.length, students: created });
});

// Student: get own controls (lock status etc.)
router.get("/:classId/my-controls", async (req: AuthRequest, res: Response) => {
  const userId = req.user!.id;
  const classId = req.params.classId;
  const row = await db.prepare(
    "SELECT * FROM teacher_controls WHERE class_id = ? AND student_id = ?"
  ).get(classId, userId);
  if (!row) return res.json({ screen_locked: false, editing_locked: false, ai_enabled: true });
  res.json(row);
});

// Teacher controls per student
router.get("/:classId/controls/:studentId", requireRole("teacher", "admin"), async (req: AuthRequest, res: Response) => {
  const { classId, studentId } = req.params;
  let row = await db.prepare("SELECT * FROM teacher_controls WHERE class_id = ? AND student_id = ?").get(classId, studentId);
  if (!row) {
    const id = crypto.randomUUID();
    await db.prepare("INSERT INTO teacher_controls (id, class_id, student_id) VALUES (?, ?, ?)").run(id, classId, studentId);
    row = await db.prepare("SELECT * FROM teacher_controls WHERE id = ?").get(id);
  }
  res.json(row);
});

router.put("/:classId/controls/:studentId", requireRole("teacher", "admin"), async (req: AuthRequest, res: Response) => {
  const { classId, studentId } = req.params;
  const { ai_enabled, ai_prompt_limit, blocks_disabled, editing_locked, screen_locked } = req.body;

  // Ensure a controls row exists so updates never no-op.
  const existing = await db.prepare("SELECT id FROM teacher_controls WHERE class_id = ? AND student_id = ?").get(classId, studentId) as { id: string } | undefined;
  if (!existing) {
    await db.prepare("INSERT INTO teacher_controls (id, class_id, student_id) VALUES (?, ?, ?)").run(crypto.randomUUID(), classId, studentId);
  }

  await db.prepare(
    `UPDATE teacher_controls SET
       ai_enabled = COALESCE(?, ai_enabled),
       ai_prompt_limit = COALESCE(?, ai_prompt_limit),
       blocks_disabled = COALESCE(?, blocks_disabled),
       editing_locked = COALESCE(?, editing_locked),
       screen_locked = COALESCE(?, screen_locked)
     WHERE class_id = ? AND student_id = ?`
  ).run(
    ai_enabled != null ? (ai_enabled ? 1 : 0) : null,
    ai_prompt_limit,
    blocks_disabled ? JSON.stringify(blocks_disabled) : null,
    editing_locked != null ? (editing_locked ? 1 : 0) : null,
    screen_locked != null ? (screen_locked ? 1 : 0) : null,
    classId,
    studentId
  );
  const row = await db.prepare("SELECT * FROM teacher_controls WHERE class_id = ? AND student_id = ?").get(classId, studentId);
  res.json(row);
});

// Attendance
router.post("/:id/attendance", requireRole("teacher", "admin"), async (req: AuthRequest, res: Response) => {
  const { records } = req.body;
  const classId = req.params.id;
  const date = new Date().toISOString().slice(0, 10);
  const stmt = db.prepare(
    `INSERT INTO attendance (id, user_id, class_id, date, present) VALUES (?, ?, ?, ?, ?) ON CONFLICT DO NOTHING`
  );
  for (const r of records) {
    await stmt.run(crypto.randomUUID(), r.userId, classId, date, r.present ? 1 : 0);
  }
  res.json({ saved: records.length });
});

router.get("/:id/attendance", requireRole("teacher", "admin"), async (req: AuthRequest, res: Response) => {
  const rows = await db.prepare("SELECT * FROM attendance WHERE class_id = ? ORDER BY date DESC").all(req.params.id);
  res.json(rows);
});

// Behavior logs
router.post("/:id/behavior", requireRole("teacher", "admin"), async (req: AuthRequest, res: Response) => {
  const { studentId, type, note } = req.body;
  const id = crypto.randomUUID();
  await db.prepare("INSERT INTO behavior_logs (id, student_id, class_id, type, note) VALUES (?, ?, ?, ?, ?)").run(id, studentId, req.params.id, type, note);
  const row = await db.prepare("SELECT * FROM behavior_logs WHERE id = ?").get(id);
  res.json(row);
});

router.get("/:id/behavior", requireRole("teacher", "admin"), async (req: AuthRequest, res: Response) => {
  const rows = await db.prepare("SELECT * FROM behavior_logs WHERE class_id = ? ORDER BY created_at DESC").all(req.params.id);
  res.json(rows);
});

// ── Student Presence + GoGuardian Classroom Control ─────────────────────────

let presenceTableReady = false;
let heartbeatTableReady = false;
let classStateTableReady = false;
let commandTableReady = false;

async function ensurePresenceTable() {
  if (presenceTableReady) return;
  try {
    await db.exec(`
      CREATE TABLE IF NOT EXISTS student_presence (
        user_id TEXT NOT NULL,
        class_id TEXT NOT NULL,
        last_seen TEXT NOT NULL DEFAULT '',
        activity TEXT DEFAULT 'online',
        PRIMARY KEY (user_id, class_id)
      )
    `);
    presenceTableReady = true;
  } catch (e) { console.error('ensurePresenceTable error:', e); }
}

async function ensureHeartbeatTable() {
  if (heartbeatTableReady) return;
  try {
    await db.exec(`
      CREATE TABLE IF NOT EXISTS user_heartbeats (
        user_id TEXT PRIMARY KEY,
        last_seen TEXT NOT NULL DEFAULT '',
        activity TEXT NOT NULL DEFAULT 'online'
      )
    `);
    heartbeatTableReady = true;
  } catch (e) { console.error('ensureHeartbeatTable error:', e); }
}

async function ensureClassStateTables() {
  if (!classStateTableReady) {
    try {
      await db.exec(`
        CREATE TABLE IF NOT EXISTS class_state (
          class_id TEXT PRIMARY KEY,
          is_locked INTEGER NOT NULL DEFAULT 0,
          lock_message TEXT NOT NULL DEFAULT '',
          locked_by TEXT NOT NULL DEFAULT '',
          locked_at TEXT NOT NULL DEFAULT ''
        )
      `);
      classStateTableReady = true;
    } catch (e) { console.error('ensureClassState error:', e); }
  }
  if (!commandTableReady) {
    try {
      await db.exec(`
        CREATE TABLE IF NOT EXISTS class_commands (
          id TEXT PRIMARY KEY,
          class_id TEXT NOT NULL,
          target_user_id TEXT,
          type TEXT NOT NULL,
          payload TEXT NOT NULL DEFAULT '',
          created_at TEXT NOT NULL
        )
      `);
      commandTableReady = true;
    } catch (e) { console.error('ensureCommands error:', e); }
  }
}

// Global heartbeat — works regardless of class membership or classId.
// Student clients ping this every 5s from any page; monitor uses this as
// the primary source of "is the student online?" truth.
router.post("/heartbeat", async (req: AuthRequest, res: Response) => {
  const userId = req.user!.id;
  const { activity = 'online' } = req.body;
  const now = new Date().toISOString();
  await ensureHeartbeatTable();
  try {
    await db.prepare(
      `INSERT INTO user_heartbeats (user_id, last_seen, activity) VALUES (?, ?, ?)
       ON CONFLICT (user_id) DO UPDATE SET last_seen = excluded.last_seen, activity = excluded.activity`
    ).run(userId, now, activity);
    res.json({ ok: true, at: now });
  } catch (e) {
    console.error('heartbeat error:', e);
    res.status(200).json({ ok: false, error: String(e) });
  }
});

// Debug endpoint — returns current user's presence picture so we can diagnose
router.get("/debug/me", async (req: AuthRequest, res: Response) => {
  await ensurePresenceTable();
  await ensureHeartbeatTable();
  try {
    const userId = req.user!.id;
    const memberships = await db.prepare(
      "SELECT cm.class_id, c.name FROM class_members cm LEFT JOIN classes c ON c.id = cm.class_id WHERE cm.user_id = ?"
    ).all(userId);
    const presenceRows = await db.prepare(
      "SELECT * FROM student_presence WHERE user_id = ?"
    ).all(userId);
    const heartbeat = await db.prepare(
      "SELECT * FROM user_heartbeats WHERE user_id = ?"
    ).get(userId);
    res.json({
      user: { id: userId, name: req.user!.name, role: req.user!.role },
      memberships, presenceRows, heartbeat,
      serverTime: new Date().toISOString(),
    });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// Student: ping presence (called every 5s from client)
// Bug 2 fix: use excluded.last_seen / excluded.activity (avoids extra $N param)
router.post("/:classId/ping", async (req: AuthRequest, res: Response) => {
  const userId = req.user!.id;
  const classId = req.params.classId;
  const { activity = 'online' } = req.body;
  const now = new Date().toISOString();
  await ensurePresenceTable();
  await ensureHeartbeatTable();
  // Always update heartbeat even if class-specific ping fails
  try {
    await db.prepare(
      `INSERT INTO user_heartbeats (user_id, last_seen, activity) VALUES (?, ?, ?)
       ON CONFLICT (user_id) DO UPDATE SET last_seen = excluded.last_seen, activity = excluded.activity`
    ).run(userId, now, activity);
  } catch (e) { console.error('heartbeat inline error:', e); }
  try {
    await db.prepare(
      `INSERT INTO student_presence (user_id, class_id, last_seen, activity) VALUES (?, ?, ?, ?)
       ON CONFLICT (user_id, class_id) DO UPDATE SET last_seen = excluded.last_seen, activity = excluded.activity`
    ).run(userId, classId, now, activity);
  } catch (e) { console.error('ping insert error:', e); }
  res.json({ ok: true });
});

// Teacher: get presence for all students in a class
// Uses COALESCE of class-specific presence + global heartbeat as source of truth.
// Either signal counts as "online" — much more robust than class-specific alone.
router.get("/:classId/presence", requireRole("teacher", "admin"), async (req: AuthRequest, res: Response) => {
  await ensurePresenceTable();
  await ensureHeartbeatTable();
  try {
    const rows = await db.prepare(
      `SELECT u.id, u.name, u.email,
        sp.last_seen AS sp_last_seen, sp.activity AS sp_activity,
        h.last_seen  AS h_last_seen,  h.activity  AS h_activity
       FROM users u
       JOIN class_members cm ON u.id = cm.user_id
       LEFT JOIN student_presence sp ON sp.user_id = u.id AND sp.class_id = ?
       LEFT JOIN user_heartbeats h ON h.user_id = u.id
       WHERE cm.class_id = ?
       ORDER BY u.name`
    ).all(req.params.classId, req.params.classId);
    const now = Date.now();
    const FIVE_MIN = 5 * 60 * 1000;
    const result = (rows as any[]).map((r: any) => {
      // Use whichever is more recent
      const spTs = r.sp_last_seen ? new Date(r.sp_last_seen).getTime() : 0;
      const hTs  = r.h_last_seen  ? new Date(r.h_last_seen).getTime()  : 0;
      const last_seen = spTs >= hTs
        ? (r.sp_last_seen || r.h_last_seen)
        : (r.h_last_seen  || r.sp_last_seen);
      const activity  = spTs >= hTs
        ? (r.sp_activity || r.h_activity || 'online')
        : (r.h_activity  || r.sp_activity || 'online');
      const bestTs = Math.max(spTs, hTs);
      return {
        id: r.id, name: r.name, email: r.email,
        last_seen, activity,
        isOnline: bestTs > 0 ? (now - bestTs < FIVE_MIN) : false,
      };
    });
    res.json(result);
  } catch (e) {
    console.error('presence get error:', e);
    res.json([]);
  }
});

// ── GoGuardian: Classroom State (student polls every 5s) ─────────────────────

// Student: get classroom lock state + pending commands
// Auto-expires locks older than 30 minutes as a safety net — a student
// should NEVER be permanently trapped.
const LOCK_MAX_AGE_MS = 30 * 60 * 1000; // 30 minutes
router.get("/:classId/classroom-state", async (req: AuthRequest, res: Response) => {
  const { classId } = req.params;
  const since = (req.query.since as string) || new Date(0).toISOString();
  await ensureClassStateTables();

  // Admins and teachers are NEVER locked — return immediately
  if (req.user!.role === 'admin' || req.user!.role === 'teacher') {
    return res.json({ isLocked: false, lockMessage: '', lockedBy: '', lockedAt: '', commands: [] });
  }

  try {
    let state = await db.prepare(
      "SELECT * FROM class_state WHERE class_id = ?"
    ).get(classId) as any;

    // Safety: auto-expire locks older than 30 min
    if (state?.is_locked && state?.locked_at) {
      const age = Date.now() - new Date(state.locked_at).getTime();
      if (age > LOCK_MAX_AGE_MS) {
        console.warn(`Auto-expiring stale lock on class ${classId} (age: ${Math.round(age/60000)} min)`);
        db.prepare(
          `INSERT INTO class_state (class_id, is_locked, lock_message, locked_by, locked_at)
           VALUES (?, 0, '', '', '')
           ON CONFLICT (class_id) DO UPDATE SET is_locked = 0, lock_message = '', locked_by = '', locked_at = ''`
        ).run(classId).catch((e: any) => console.error('auto-expire failed:', e));
        state = { ...state, is_locked: 0, lock_message: '', locked_by: '', locked_at: '' };
      }
    }

    const commands = await db.prepare(
      `SELECT * FROM class_commands
       WHERE class_id = ?
         AND (target_user_id IS NULL OR target_user_id = ?)
         AND created_at > ?
       ORDER BY created_at ASC`
    ).all(classId, req.user!.id, since) as any[];

    res.json({
      isLocked: state?.is_locked === 1 || state?.is_locked === true,
      lockMessage: state?.lock_message || '',
      lockedBy: state?.locked_by || '',
      lockedAt: state?.locked_at || '',
      commands: commands.map((c: any) => ({
        id: c.id, type: c.type, payload: c.payload, createdAt: c.created_at,
      })),
    });
  } catch (e) {
    console.error('classroom-state error:', e);
    // On error, assume NOT locked to avoid trapping students
    res.json({ isLocked: false, lockMessage: '', lockedBy: '', lockedAt: '', commands: [] });
  }
});

// Admin: Force-unlock every class (panic button)
router.post("/force-unlock-all", requireRole("teacher", "admin"), async (req: AuthRequest, res: Response) => {
  await ensureClassStateTables();
  try {
    await db.prepare(
      "UPDATE class_state SET is_locked = 0, lock_message = '', locked_by = '', locked_at = ''"
    ).run();
    res.json({ ok: true, message: "All classes unlocked" });
  } catch (e) {
    console.error('force-unlock-all error:', e);
    res.status(500).json({ error: 'Failed to force unlock' });
  }
});

// Teacher: lock all screens in class
router.post("/:classId/lock", requireRole("teacher", "admin"), async (req: AuthRequest, res: Response) => {
  const { classId } = req.params;
  const { message = '' } = req.body;
  await ensureClassStateTables();
  const now = new Date().toISOString();
  try {
    await db.prepare(
      `INSERT INTO class_state (class_id, is_locked, lock_message, locked_by, locked_at)
       VALUES (?, 1, ?, ?, ?)
       ON CONFLICT (class_id) DO UPDATE SET
         is_locked = 1, lock_message = excluded.lock_message,
         locked_by = excluded.locked_by, locked_at = excluded.locked_at`
    ).run(classId, message, req.user!.name, now);
    res.json({ ok: true });
  } catch (e) {
    console.error('lock error:', e);
    res.status(500).json({ error: 'Failed to lock class' });
  }
});

// Teacher: unlock all screens
router.post("/:classId/unlock", requireRole("teacher", "admin"), async (req: AuthRequest, res: Response) => {
  const { classId } = req.params;
  await ensureClassStateTables();
  try {
    await db.prepare(
      `INSERT INTO class_state (class_id, is_locked, lock_message, locked_by, locked_at)
       VALUES (?, 0, '', '', '')
       ON CONFLICT (class_id) DO UPDATE SET
         is_locked = 0, lock_message = '', locked_by = '', locked_at = ''`
    ).run(classId);
    res.json({ ok: true });
  } catch (e) {
    console.error('unlock error:', e);
    res.status(500).json({ error: 'Failed to unlock class' });
  }
});

// Teacher: send a command to all or one student (NAVIGATE, MESSAGE, KICK)
router.post("/:classId/command", requireRole("teacher", "admin"), async (req: AuthRequest, res: Response) => {
  const { classId } = req.params;
  const { type, payload = '', targetUserId } = req.body;
  if (!["NAVIGATE", "MESSAGE", "KICK"].includes(type)) {
    return res.status(400).json({ error: "Invalid command type" });
  }
  await ensureClassStateTables();
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  try {
    await db.prepare(
      `INSERT INTO class_commands (id, class_id, target_user_id, type, payload, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(id, classId, targetUserId || null, type, payload, now);
    // Cleanup commands older than 2 minutes
    const cutoff = new Date(Date.now() - 120_000).toISOString();
    db.prepare("DELETE FROM class_commands WHERE class_id = ? AND created_at < ?")
      .run(classId, cutoff).catch(() => {});
    res.json({ ok: true, commandId: id });
  } catch (e) {
    console.error('command error:', e);
    res.status(500).json({ error: 'Failed to send command' });
  }
});

// ── Class Video Sharing (HTTP polling) ────────────────────────
let videoTableReady = false;
async function ensureVideoTable() {
  if (videoTableReady) return;
  try {
    await db.exec(`
      CREATE TABLE IF NOT EXISTS class_video (
        class_id TEXT PRIMARY KEY,
        video_id TEXT NOT NULL,
        video_title TEXT DEFAULT '',
        shared_at TEXT NOT NULL DEFAULT '',
        shared_by TEXT DEFAULT ''
      )
    `);
    videoTableReady = true;
  } catch {}
}

// Teacher: share a YouTube video to class
router.post("/:classId/video", requireRole("teacher", "admin"), async (req: AuthRequest, res: Response) => {
  const { classId } = req.params;
  const { videoId, videoTitle } = req.body;
  await ensureVideoTable();
  const now = new Date().toISOString();
  try {
    await db.prepare(
      `INSERT INTO class_video (class_id, video_id, video_title, shared_at, shared_by) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT (class_id) DO UPDATE SET video_id = ?, video_title = ?, shared_at = ?, shared_by = ?`
    ).run(classId, videoId, videoTitle || '', now, req.user!.name, videoId, videoTitle || '', now, req.user!.name);
  } catch { await ensureVideoTable(); }
  res.json({ ok: true, videoId, videoTitle });
});

// Teacher: stop sharing video
router.delete("/:classId/video", requireRole("teacher", "admin"), async (req: AuthRequest, res: Response) => {
  await ensureVideoTable();
  await db.prepare("DELETE FROM class_video WHERE class_id = ?").run(req.params.classId).catch(() => {});
  res.json({ ok: true });
});

// Anyone in the class: get current video
router.get("/:classId/video", async (req: AuthRequest, res: Response) => {
  await ensureVideoTable();
  try {
    const row = await db.prepare("SELECT * FROM class_video WHERE class_id = ?").get(req.params.classId);
    res.json(row || null);
  } catch {
    res.json(null);
  }
});

export default router;
