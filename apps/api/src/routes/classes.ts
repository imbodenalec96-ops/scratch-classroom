import { Router, Response } from "express";
import crypto from "crypto";
import db from "../db.js";
import { AuthRequest } from "../middleware/auth.js";
import { requireRole } from "../middleware/rbac.js";
import { enqueueStudentCommand } from "./students.js";

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
  await seedStarStudents();
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
      `SELECT c.* FROM classes c JOIN class_members cm ON c.id::text = cm.class_id::text WHERE cm.user_id::text = ? ORDER BY c.created_at DESC`
    ).all(u.id);
  }
  res.json(rows);
});

// Admin: reassign a class's primary teacher
router.put("/:id/reassign-teacher", requireRole("admin"), async (req: AuthRequest, res: Response) => {
  const { teacher_id } = req.body;
  if (!teacher_id) return res.status(400).json({ error: "teacher_id required" });
  try {
    // Verify the new teacher exists and has role 'teacher' or 'admin'
    const u = await db.prepare("SELECT id, name, role FROM users WHERE id = ?").get(teacher_id) as any;
    if (!u) return res.status(404).json({ error: "User not found" });
    if (u.role !== "teacher" && u.role !== "admin") {
      return res.status(400).json({ error: "Target user must be a teacher or admin" });
    }
    await db.prepare("UPDATE classes SET teacher_id = ? WHERE id = ?").run(teacher_id, req.params.id);
    const row = await db.prepare("SELECT * FROM classes WHERE id = ?").get(req.params.id);
    res.json({ ok: true, class: row, newTeacher: u.name });
  } catch (e) {
    console.error('reassign-teacher error:', e);
    res.status(500).json({ error: 'Failed to reassign' });
  }
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
let snapshotTableReady = false;

async function ensureSnapshotTable() {
  if (snapshotTableReady) return;
  try {
    await db.exec(`
      CREATE TABLE IF NOT EXISTS student_snapshots (
        user_id TEXT PRIMARY KEY,
        data TEXT NOT NULL DEFAULT '',
        path TEXT NOT NULL DEFAULT '',
        captured_at TEXT NOT NULL DEFAULT ''
      )
    `);
    snapshotTableReady = true;
  } catch (e) { console.error('ensureSnapshotTable error:', e); }
}

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

// Student: POST a DOM screenshot (tiny JPEG base64). Called every ~5s from
// the student client. Upserts one row per student — only the latest is kept.
router.post("/snapshot", async (req: AuthRequest, res: Response) => {
  const userId = req.user!.id;
  const { data = '', path = '' } = req.body || {};
  // Hard cap — normal thumbnails are <55KB, focused high-res up to ~200KB
  if (typeof data !== 'string' || data.length > 240_000) {
    return res.status(413).json({ error: 'snapshot too large' });
  }
  const now = new Date().toISOString();
  await ensureSnapshotTable();
  try {
    await db.prepare(
      `INSERT INTO student_snapshots (user_id, data, path, captured_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT (user_id) DO UPDATE SET
         data = excluded.data, path = excluded.path, captured_at = excluded.captured_at`
    ).run(userId, data, String(path || ''), now);
    res.json({ ok: true });
  } catch (e) {
    console.error('snapshot upsert error:', e);
    res.status(200).json({ ok: false });
  }
});

// Teacher: get one student's latest snapshot
router.get("/snapshot/:userId", requireRole("teacher", "admin"), async (req: AuthRequest, res: Response) => {
  await ensureSnapshotTable();
  try {
    const row = await db.prepare(
      `SELECT * FROM student_snapshots WHERE user_id = ?`
    ).get(req.params.userId) as any;
    if (!row) return res.json({ data: null });
    res.json({ data: row.data, path: row.path, capturedAt: row.captured_at });
  } catch (e) { res.json({ data: null }); }
});

// Teacher: batch-get latest snapshots for every student in a class (single round-trip)
router.get("/:classId/snapshots", requireRole("teacher", "admin"), async (req: AuthRequest, res: Response) => {
  await ensureSnapshotTable();
  try {
    const rows = await db.prepare(
      `SELECT ss.user_id, ss.data, ss.path, ss.captured_at
       FROM student_snapshots ss
       JOIN class_members cm ON cm.user_id = ss.user_id
       WHERE cm.class_id = ?`
    ).all(req.params.classId) as any[];
    res.json(rows.map((r: any) => ({
      userId: r.user_id, data: r.data, path: r.path, capturedAt: r.captured_at
    })));
  } catch (e) {
    console.error('snapshots batch error:', e);
    res.json([]);
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

// Teacher: get presence for all students in a class.
// Two-step approach (more robust than one big JOIN) to survive partial
// table state + make errors visible when debugging.
router.get("/:classId/presence", requireRole("teacher", "admin"), async (req: AuthRequest, res: Response) => {
  await ensurePresenceTable();
  await ensureHeartbeatTable();
  const debug = req.query.debug === '1';
  try {
    // Step 1: students in this class (same as /students endpoint — known good)
    const students = await db.prepare(
      `SELECT u.id, u.name, u.email
       FROM users u JOIN class_members cm ON u.id = cm.user_id
       WHERE cm.class_id = ? ORDER BY u.name`
    ).all(req.params.classId) as any[];

    if (students.length === 0) return res.json([]);

    // Step 2: presence rows for this class
    let presenceMap: Record<string, any> = {};
    try {
      const presenceRows = await db.prepare(
        `SELECT user_id, last_seen, activity FROM student_presence WHERE class_id = ?`
      ).all(req.params.classId) as any[];
      for (const p of presenceRows) presenceMap[p.user_id] = p;
    } catch (e) { console.error('presence rows error:', e); }

    // Step 3: global heartbeats (for all users — cheap, small table)
    let heartbeatMap: Record<string, any> = {};
    try {
      const hbRows = await db.prepare(
        `SELECT user_id, last_seen, activity FROM user_heartbeats`
      ).all() as any[];
      for (const h of hbRows) heartbeatMap[h.user_id] = h;
    } catch (e) { console.error('heartbeat rows error:', e); }

    const now = Date.now();
    const FIVE_MIN = 5 * 60 * 1000;
    const result = students.map((s: any) => {
      const p = presenceMap[s.id];
      const h = heartbeatMap[s.id];
      const pTs = p?.last_seen ? new Date(p.last_seen).getTime() : 0;
      const hTs = h?.last_seen ? new Date(h.last_seen).getTime() : 0;
      const bestTs = Math.max(pTs, hTs);
      const last_seen = pTs >= hTs ? (p?.last_seen || h?.last_seen || null) : (h?.last_seen || p?.last_seen || null);
      const activity  = pTs >= hTs ? (p?.activity || h?.activity || 'online') : (h?.activity || p?.activity || 'online');
      return {
        id: s.id, name: s.name, email: s.email,
        last_seen, activity,
        isOnline: bestTs > 0 ? (now - bestTs < FIVE_MIN) : false,
        ...(debug ? { _debug: { pTs, hTs, bestTs, ageMs: bestTs ? now - bestTs : null } } : {}),
      };
    });
    res.json(result);
  } catch (e: any) {
    console.error('presence get error:', e);
    // Surface the error in debug mode so we can diagnose
    if (debug) return res.status(500).json({ error: String(e?.message || e), stack: e?.stack });
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

// Teacher: bulk Grant Free Time to every student in a class
router.post("/:classId/grant-free-time-all", requireRole("teacher", "admin"), async (req: AuthRequest, res: Response) => {
  await ensureClassStateTables();
  try {
    const students = await db.prepare(
      "SELECT u.id FROM users u JOIN class_members cm ON cm.user_id = u.id WHERE cm.class_id = ? AND u.role = 'student'"
    ).all(req.params.classId) as any[];
    const now = new Date().toISOString();
    for (const s of students) {
      const id = crypto.randomUUID();
      await db.prepare(
        "INSERT INTO class_commands (id, class_id, target_user_id, type, payload, created_at) VALUES (?, ?, ?, 'GRANT_FREE_TIME', '', ?)"
      ).run(id, req.params.classId, s.id, now).catch(() => {});
    }
    res.json({ ok: true, studentsAffected: students.length });
  } catch (e) {
    console.error('grant-all error:', e);
    res.status(500).json({ error: 'Failed' });
  }
});

// Teacher: bulk Revoke Free Time
router.post("/:classId/revoke-free-time-all", requireRole("teacher", "admin"), async (req: AuthRequest, res: Response) => {
  await ensureClassStateTables();
  try {
    const students = await db.prepare(
      "SELECT u.id FROM users u JOIN class_members cm ON cm.user_id = u.id WHERE cm.class_id = ? AND u.role = 'student'"
    ).all(req.params.classId) as any[];
    const now = new Date().toISOString();
    for (const s of students) {
      const id = crypto.randomUUID();
      await db.prepare(
        "INSERT INTO class_commands (id, class_id, target_user_id, type, payload, created_at) VALUES (?, ?, ?, 'REVOKE_FREE_TIME', '/student', ?)"
      ).run(id, req.params.classId, s.id, now).catch(() => {});
    }
    res.json({ ok: true, studentsAffected: students.length });
  } catch (e) {
    console.error('revoke-all error:', e);
    res.status(500).json({ error: 'Failed' });
  }
});

// Free-time config (per class) — stored in a small KV table
let configTableReady = false;
async function ensureConfigTable() {
  if (configTableReady) return;
  try {
    await db.exec(`
      CREATE TABLE IF NOT EXISTS class_config (
        class_id TEXT PRIMARY KEY,
        config TEXT NOT NULL DEFAULT '{}',
        updated_at TEXT NOT NULL DEFAULT ''
      )
    `);
    configTableReady = true;
  } catch (e) { console.error('ensureConfigTable error:', e); }
}

router.get("/:classId/config", async (req: AuthRequest, res: Response) => {
  await ensureConfigTable();
  try {
    const row = await db.prepare("SELECT config FROM class_config WHERE class_id = ?").get(req.params.classId) as any;
    if (!row) return res.json({});
    try { res.json(JSON.parse(row.config)); } catch { res.json({}); }
  } catch { res.json({}); }
});

router.put("/:classId/config", requireRole("teacher", "admin"), async (req: AuthRequest, res: Response) => {
  await ensureConfigTable();
  const payload = JSON.stringify(req.body || {});
  const now = new Date().toISOString();
  try {
    await db.prepare(
      `INSERT INTO class_config (class_id, config, updated_at) VALUES (?, ?, ?)
       ON CONFLICT (class_id) DO UPDATE SET config = excluded.config, updated_at = excluded.updated_at`
    ).run(req.params.classId, payload, now);
    res.json({ ok: true });
  } catch (e) {
    console.error('config put error:', e);
    res.status(500).json({ error: 'Failed' });
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

// Teacher: lock a SINGLE student via the class_commands pipe (client polls this)
router.post("/lock-student/:studentId", requireRole("teacher", "admin"), async (req: AuthRequest, res: Response) => {
  const { studentId } = req.params;
  const { message = '' } = req.body;
  await ensureClassStateTables();
  try {
    const rows = await db.prepare(
      "SELECT class_id FROM class_members WHERE user_id = ?"
    ).all(studentId) as any[];
    const now = new Date().toISOString();
    for (const r of rows) {
      const id = crypto.randomUUID();
      // Legacy: class_commands row (useClassCommands still reads this).
      await db.prepare(
        "INSERT INTO class_commands (id, class_id, target_user_id, type, payload, created_at) VALUES (?, ?, ?, 'LOCK', ?, ?)"
      ).run(id, r.class_id, studentId, message || '', now).catch(() => {});
    }
    // NEW PIPE: also enqueue a student_commands LOCK. useStudentCommands will
    // pick this up within ~3s and set the new lock store → ScreenLockOverlay.
    // Both pipes coexist until lock wiring is verified end-to-end, then legacy
    // is ripped out in a follow-up commit.
    await enqueueStudentCommand(studentId, "LOCK", JSON.stringify({ message: message || null }))
      .catch(e => console.error("enqueueStudentCommand LOCK failed:", e));
    res.json({ ok: true, classesAffected: rows.length });
  } catch (e) {
    console.error('lock-student error:', e);
    res.status(500).json({ error: 'Failed to lock student' });
  }
});

// Teacher: unlock a single student (clears the per-student lock command)
router.post("/unlock-student/:studentId", requireRole("teacher", "admin"), async (req: AuthRequest, res: Response) => {
  const { studentId } = req.params;
  await ensureClassStateTables();
  try {
    const rows = await db.prepare(
      "SELECT class_id FROM class_members WHERE user_id = ?"
    ).all(studentId) as any[];
    const now = new Date().toISOString();
    for (const r of rows) {
      const id = crypto.randomUUID();
      await db.prepare(
        "INSERT INTO class_commands (id, class_id, target_user_id, type, payload, created_at) VALUES (?, ?, ?, 'UNLOCK', '', ?)"
      ).run(id, r.class_id, studentId, now).catch(() => {});
    }
    // NEW PIPE: enqueue student_commands UNLOCK.
    await enqueueStudentCommand(studentId, "UNLOCK", "")
      .catch(e => console.error("enqueueStudentCommand UNLOCK failed:", e));
    res.json({ ok: true });
  } catch (e) {
    console.error('unlock-student error:', e);
    res.status(500).json({ error: 'Failed' });
  }
});

// Teacher: focus a student (send FOCUS command → client captures high-res)
router.post("/focus-student/:studentId", requireRole("teacher", "admin"), async (req: AuthRequest, res: Response) => {
  const { studentId } = req.params;
  const { focused } = req.body;
  await ensureClassStateTables();
  try {
    const rows = await db.prepare(
      "SELECT class_id FROM class_members WHERE user_id = ?"
    ).all(studentId) as any[];
    const now = new Date().toISOString();
    for (const r of rows) {
      const id = crypto.randomUUID();
      await db.prepare(
        "INSERT INTO class_commands (id, class_id, target_user_id, type, payload, created_at) VALUES (?, ?, ?, ?, '', ?)"
      ).run(id, r.class_id, studentId, focused ? 'FOCUS' : 'UNFOCUS', now).catch(() => {});
    }
    res.json({ ok: true });
  } catch (e) {
    console.error('focus-student error:', e);
    res.status(500).json({ error: 'Failed' });
  }
});

// Teacher: grant one student free time immediately (mirrors the client-side
// isWorkUnlocked by setting a server-side flag that the client can check).
// Minimal: push a NAVIGATE command + a message, leave client to update.
router.post("/grant-free-time/:studentId", requireRole("teacher", "admin"), async (req: AuthRequest, res: Response) => {
  const { studentId } = req.params;
  try {
    const rows = await db.prepare(
      "SELECT class_id FROM class_members WHERE user_id = ?"
    ).all(studentId) as any[];
    for (const r of rows) {
      const id = crypto.randomUUID();
      const now = new Date().toISOString();
      // Custom command type the client will unpack to flip isWorkUnlocked
      await db.prepare(
        "INSERT INTO class_commands (id, class_id, target_user_id, type, payload, created_at) VALUES (?, ?, ?, 'GRANT_FREE_TIME', '', ?)"
      ).run(id, r.class_id, studentId, now).catch(() => {});
    }
    res.json({ ok: true });
  } catch (e) {
    console.error('grant-free-time error:', e);
    res.status(500).json({ error: 'Failed to grant free time' });
  }
});

// Teacher: revoke one student's free time (send REVOKE_FREE_TIME command)
router.post("/revoke-free-time/:studentId", requireRole("teacher", "admin"), async (req: AuthRequest, res: Response) => {
  const { studentId } = req.params;
  try {
    const rows = await db.prepare(
      "SELECT class_id FROM class_members WHERE user_id = ?"
    ).all(studentId) as any[];
    for (const r of rows) {
      const id = crypto.randomUUID();
      const now = new Date().toISOString();
      await db.prepare(
        "INSERT INTO class_commands (id, class_id, target_user_id, type, payload, created_at) VALUES (?, ?, ?, 'REVOKE_FREE_TIME', '/student', ?)"
      ).run(id, r.class_id, studentId, now).catch(() => {});
    }
    res.json({ ok: true });
  } catch (e) {
    console.error('revoke-free-time error:', e);
    res.status(500).json({ error: 'Failed to revoke free time' });
  }
});

// Teacher: rescue a single stuck student — sends them a NAVIGATE command to
// /student and clears any per-class lock for every class they're in.
router.post("/force-unlock-student/:studentId", requireRole("teacher", "admin"), async (req: AuthRequest, res: Response) => {
  await ensureClassStateTables();
  const { studentId } = req.params;
  try {
    // Unlock every class this student is a member of
    const memberships = await db.prepare(
      "SELECT class_id FROM class_members WHERE user_id = ?"
    ).all(studentId) as any[];
    for (const m of memberships) {
      await db.prepare(
        `INSERT INTO class_state (class_id, is_locked, lock_message, locked_by, locked_at)
         VALUES (?, 0, '', '', '')
         ON CONFLICT (class_id) DO UPDATE SET is_locked = 0, lock_message = '', locked_by = '', locked_at = ''`
      ).run(m.class_id).catch(() => {});
      // Also send the student a kick-to-dashboard command so they route out of anything stuck
      const id = crypto.randomUUID();
      const now = new Date().toISOString();
      await db.prepare(
        `INSERT INTO class_commands (id, class_id, target_user_id, type, payload, created_at)
         VALUES (?, ?, ?, 'KICK', '/student', ?)`
      ).run(id, m.class_id, studentId, now).catch(() => {});
    }
    res.json({ ok: true, classesAffected: memberships.length });
  } catch (e) {
    console.error('force-unlock-student error:', e);
    res.status(500).json({ error: 'Failed to force unlock student' });
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
    // NEW PIPE: fan out a student_commands LOCK to every student in the class
    // so the new useStudentCommands handler can flip its lock store. Runs in
    // parallel with the legacy class_state flag (useClassCommands still reads
    // that). Teachers/admins are excluded by role filter.
    try {
      const students = await db.prepare(
        "SELECT cm.user_id FROM class_members cm JOIN users u ON u.id = cm.user_id WHERE cm.class_id = ? AND u.role = 'student'"
      ).all(classId) as any[];
      await Promise.all(students.map(s =>
        enqueueStudentCommand(s.user_id, "LOCK", JSON.stringify({ message: message || null }))
          .catch(e => console.error("enqueueStudentCommand LOCK (class) failed:", s.user_id, e))
      ));
    } catch (e) {
      console.error("class-lock student_commands fan-out failed:", e);
    }
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
    // NEW PIPE: fan out UNLOCK to every student in the class.
    try {
      const students = await db.prepare(
        "SELECT cm.user_id FROM class_members cm JOIN users u ON u.id = cm.user_id WHERE cm.class_id = ? AND u.role = 'student'"
      ).all(classId) as any[];
      await Promise.all(students.map(s =>
        enqueueStudentCommand(s.user_id, "UNLOCK", "")
          .catch(e => console.error("enqueueStudentCommand UNLOCK (class) failed:", s.user_id, e))
      ));
    } catch (e) {
      console.error("class-unlock student_commands fan-out failed:", e);
    }
    res.json({ ok: true });
  } catch (e) {
    console.error('unlock error:', e);
    res.status(500).json({ error: 'Failed to unlock class' });
  }
});

// Student: delete a command row after acting on it (fire-and-forget from client).
// Prevents the same MESSAGE / NAVIGATE / etc. from re-firing on subsequent polls.
router.delete("/:classId/commands/:commandId/consume", async (req: AuthRequest, res: Response) => {
  const { classId, commandId } = req.params;
  await ensureClassStateTables();
  try {
    await db.prepare(
      "DELETE FROM class_commands WHERE id = ? AND class_id = ? AND (target_user_id IS NULL OR target_user_id = ?)"
    ).run(commandId, classId, req.user!.id);
    res.json({ ok: true });
  } catch (e) {
    console.error('consume command error:', e);
    res.status(500).json({ error: 'Failed to consume command' });
  }
});

// Teacher: end a single student's break early (Feature 35)
router.post("/end-break/:studentId", requireRole("teacher", "admin"), async (req: AuthRequest, res: Response) => {
  const { studentId } = req.params;
  await ensureClassStateTables();
  try {
    const memberships = await db.prepare(
      "SELECT class_id FROM class_members WHERE user_id = ?"
    ).all(studentId) as any[];
    const now = new Date().toISOString();
    for (const m of memberships) {
      const id = crypto.randomUUID();
      await db.prepare(
        `INSERT INTO class_commands (id, class_id, target_user_id, type, payload, created_at)
         VALUES (?, ?, ?, 'END_BREAK', '/student', ?)`
      ).run(id, m.class_id, studentId, now).catch(() => {});
    }
    res.json({ ok: true, classesAffected: memberships.length });
  } catch (e) {
    console.error('end-break error:', e);
    res.status(500).json({ error: 'Failed to end break' });
  }
});

// Teacher: end every active break in a class (bulk action on Monitor page)
router.post("/:classId/end-all-breaks", requireRole("teacher", "admin"), async (req: AuthRequest, res: Response) => {
  const { classId } = req.params;
  await ensureClassStateTables();
  try {
    const members = await db.prepare(
      "SELECT cm.user_id AS id FROM class_members cm JOIN users u ON u.id = cm.user_id WHERE cm.class_id = ? AND u.role = 'student'"
    ).all(classId) as any[];
    const now = new Date().toISOString();
    for (const m of members) {
      const id = crypto.randomUUID();
      await db.prepare(
        `INSERT INTO class_commands (id, class_id, target_user_id, type, payload, created_at)
         VALUES (?, ?, ?, 'END_BREAK', '/student', ?)`
      ).run(id, classId, m.id, now).catch(() => {});
    }
    res.json({ ok: true, studentsNotified: members.length });
  } catch (e) {
    console.error('end-all-breaks error:', e);
    res.status(500).json({ error: 'Failed to end all breaks' });
  }
});

// Teacher: send a command to all or one student (NAVIGATE, MESSAGE, KICK)
router.post("/:classId/command", requireRole("teacher", "admin"), async (req: AuthRequest, res: Response) => {
  const { classId } = req.params;
  const { type, payload = '', targetUserId } = req.body;
  if (!["NAVIGATE", "MESSAGE", "KICK", "GRANT_FREE_TIME", "REVOKE_FREE_TIME", "LOCK", "UNLOCK", "FOCUS", "UNFOCUS", "END_BREAK"].includes(type)) {
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

    // Parallel fan-out to the new student_commands pipe for MESSAGE.
    // Legacy class_commands still fires (useClassCommands still consumes it),
    // so students see the message either way during the migration. Once
    // useStudentCommands proves reliable we'll retire the class_commands
    // MESSAGE branch in useClassCommands.ts.
    if (type === "MESSAGE") {
      try {
        if (targetUserId) {
          await enqueueStudentCommand(targetUserId, "MESSAGE", payload || "");
        } else {
          // Class-wide: fan out to every role='student' in the class.
          const students = await db.prepare(
            "SELECT u.id FROM users u JOIN class_members cm ON cm.user_id = u.id WHERE cm.class_id = ? AND u.role = 'student'"
          ).all(classId) as Array<{ id: string }>;
          await Promise.all(students.map(s =>
            enqueueStudentCommand(s.id, "MESSAGE", payload || "")
          ));
        }
      } catch (e) {
        // Don't fail the teacher's request if the new pipe hiccups — legacy
        // class_commands insert above already succeeded.
        console.warn("MESSAGE fan-out to student_commands failed (legacy pipe still delivered):", e);
      }
    }

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

// Teacher: stop sharing video.
// We used to silently `.catch(() => {})` the DELETE, which meant the teacher's
// Stop Video button appeared to "do nothing" whenever the query failed — the
// row stayed in class_video, so students' 3s poll kept showing the overlay.
// Now we surface failures so the client can retry.
router.delete("/:classId/video", requireRole("teacher", "admin"), async (req: AuthRequest, res: Response) => {
  try {
    await ensureVideoTable();
    const r = await db.prepare("DELETE FROM class_video WHERE class_id = ?").run(req.params.classId);
    res.json({ ok: true, changes: r.changes });
  } catch (e: any) {
    console.error("stop video DELETE failed:", e);
    res.status(500).json({ error: "Failed to stop video", detail: e?.message });
  }
});

// ── YouTube broadcast (new student_commands pipe) ─────────────────────
// Extract an 11-char YT id from watch / youtu.be / embed / shorts URLs, or
// accept the raw id. Returns null if unparseable.
function extractYouTubeId(urlOrId: string): string | null {
  if (!urlOrId) return null;
  const s = String(urlOrId).trim();
  if (/^[A-Za-z0-9_-]{11}$/.test(s)) return s;
  const m = s.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)([A-Za-z0-9_-]{11})/);
  return m ? m[1] : null;
}

// POST /:classId/broadcast-video — fan out BROADCAST_VIDEO to every active
// student in the class. Kept deliberately thin: we rely on the per-student
// command pipe (already durable + consume-on-ack) rather than introducing a
// parallel class-scoped queue.
router.post("/:classId/broadcast-video", requireRole("teacher", "admin"), async (req: AuthRequest, res: Response) => {
  const { classId } = req.params;
  const { url } = req.body || {};
  const videoId = extractYouTubeId(url || "");
  if (!videoId) return res.status(400).json({ error: "Invalid YouTube URL or ID" });
  try {
    const students = await db.prepare(
      "SELECT u.id FROM users u JOIN class_members cm ON cm.user_id = u.id WHERE cm.class_id = ? AND u.role = 'student'"
    ).all(classId) as any[];
    const payload = { url, videoId };
    const enqueueAll = students.map(s =>
      enqueueStudentCommand(s.id, "BROADCAST_VIDEO", payload)
        .catch(e => console.error("enqueueStudentCommand BROADCAST_VIDEO failed:", s.id, e))
    );
    await Promise.allSettled(enqueueAll);
    res.json({ ok: true, studentsAffected: students.length, videoId });
  } catch (e) {
    console.error("POST /:classId/broadcast-video failed:", e);
    res.status(500).json({ error: "Failed to broadcast video" });
  }
});

// POST /:classId/broadcast-end — enqueue END_BROADCAST for all students AND
// clear any existing class_video row so the legacy poll-based overlay also
// tears down immediately (no waiting for the next 3s tick).
router.post("/:classId/broadcast-end", requireRole("teacher", "admin"), async (req: AuthRequest, res: Response) => {
  const { classId } = req.params;
  try {
    try {
      await ensureVideoTable();
      await db.prepare("DELETE FROM class_video WHERE class_id = ?").run(classId);
    } catch (e) {
      console.warn("broadcast-end: class_video DELETE skipped:", (e as Error).message);
    }
    const students = await db.prepare(
      "SELECT u.id FROM users u JOIN class_members cm ON cm.user_id = u.id WHERE cm.class_id = ? AND u.role = 'student'"
    ).all(classId) as any[];
    const enqueueAll = students.map(s =>
      enqueueStudentCommand(s.id, "END_BROADCAST", "")
        .catch(e => console.error("enqueueStudentCommand END_BROADCAST failed:", s.id, e))
    );
    await Promise.allSettled(enqueueAll);
    res.json({ ok: true, studentsAffected: students.length });
  } catch (e) {
    console.error("POST /:classId/broadcast-end failed:", e);
    res.status(500).json({ error: "Failed to end broadcast" });
  }
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

// ─────────────────────────────────────────────────────────────────────────────
// STAR class + student seed — idempotent, runs once at startup.
// Creates the "Star" class and its 5 real students if they don't exist.
// Also ensures specials_grade column exists on users table.
// ─────────────────────────────────────────────────────────────────────────────
const STAR_CLASS_ID   = "b0000000-0000-0000-0000-000000000002";
const STAR_TEACHER_ID = "a0000000-0000-0000-0000-000000000002"; // Jane Teacher seed account
const STAR_STUDENTS_SEED = [
  { id: "s0000000-0000-0000-0000-000000000001", name: "Ryan",   email: "ryan.star@star.local",   specials_grade: 5 },
  { id: "s0000000-0000-0000-0000-000000000002", name: "Jaida",  email: "jaida.star@star.local",  specials_grade: 5 },
  { id: "s0000000-0000-0000-0000-000000000003", name: "Rayden", email: "rayden.star@star.local", specials_grade: 4 },
  { id: "s0000000-0000-0000-0000-000000000004", name: "Zoey",   email: "zoey.star@star.local",   specials_grade: 3 },
  { id: "s0000000-0000-0000-0000-000000000005", name: "Aiden",  email: "aiden.star@star.local",  specials_grade: 3 },
  { id: "s0000000-0000-0000-0000-000000000006", name: "Kaleb",  email: "kaleb.star@star.local",  specials_grade: 5 },
  { id: "s0000000-0000-0000-0000-000000000007", name: "Anna",   email: "anna.star@star.local",   specials_grade: 3 },
  { id: "s0000000-0000-0000-0000-000000000008", name: "Ameer",  email: "ameer.star@star.local",  specials_grade: 4 },
] as const;

let starStudentSeedRan = false;
async function seedStarStudents() {
  if (starStudentSeedRan) return;
  try {
    // specials_grade column — safe to re-run (fails silently if already exists)
    try { await db.exec("ALTER TABLE users ADD COLUMN specials_grade INTEGER"); } catch {}

    // If a "Star" class already exists, use it rather than creating a duplicate seed class.
    // This prevents a stale fake class from shadowing the real production class.
    const existingStar: any = await db.prepare(
      "SELECT id FROM classes WHERE name = 'Star' ORDER BY created_at ASC LIMIT 1"
    ).get();

    let starClassId: string;
    if (existingStar?.id) {
      starClassId = existingStar.id;
      console.log("[star-seed] Using existing Star class:", starClassId);
    } else {
      // No Star class at all — create one.
      const teacher: any = await db.prepare("SELECT id FROM users WHERE id = ? LIMIT 1").get(STAR_TEACHER_ID)
        ?? await db.prepare("SELECT id FROM users WHERE role IN ('teacher','admin') LIMIT 1").get();
      const teacherId = teacher?.id ?? null;
      await db.prepare(
        `INSERT INTO classes (id, name, teacher_id, code) VALUES (?, 'Star', ?, 'STAR01') ON CONFLICT DO NOTHING`
      ).run(STAR_CLASS_ID, teacherId);
      starClassId = STAR_CLASS_ID;
      console.log("[star-seed] Created new Star class:", starClassId);
    }

    // Backfill specials_grade on any existing students whose names match the roster.
    // This covers real production students created manually (not via the seed).
    for (const s of STAR_STUDENTS_SEED) {
      if (s.specials_grade != null) {
        await db.prepare(
          `UPDATE users SET specials_grade = ? WHERE LOWER(name) = LOWER(?) AND role = 'student'`
        ).run(s.specials_grade, s.name);
        // Also force-update the canonical seed students by ID so grade corrections propagate
        await db.prepare(
          `UPDATE users SET specials_grade = ? WHERE id = ? AND role = 'student'`
        ).run(s.specials_grade, s.id);
      }
    }

    // Only create placeholder @star.local users on fresh SQLite (local dev).
    // In production (DATABASE_URL set), the real students already exist and
    // these fake IDs (starting with 's') are invalid UUIDs for Postgres anyway.
    if (!process.env.DATABASE_URL) {
      const bcrypt = await import("bcrypt");
      const hash = await bcrypt.default.hash("star1234", 10);
      for (const s of STAR_STUDENTS_SEED) {
        await db.prepare(
          `INSERT INTO users (id, email, password_hash, name, role, specials_grade) VALUES (?, ?, ?, ?, 'student', ?) ON CONFLICT DO NOTHING`
        ).run(s.id, s.email, hash, s.name, s.specials_grade ?? null);
        await db.prepare(
          `INSERT INTO class_members (user_id, class_id) VALUES (?, ?) ON CONFLICT DO NOTHING`
        ).run(s.id, starClassId);
      }
    }
    starStudentSeedRan = true;
    console.log("[star-seed] Done. Star class:", starClassId);
  } catch (e) {
    console.error("[star-seed] error:", e);
  }
}
seedStarStudents();

// ─────────────────────────────────────────────────────────────────────────────
// Class daily schedule — Feature: block-based day table.
// ─────────────────────────────────────────────────────────────────────────────
let scheduleTableReady = false;
async function ensureClassScheduleTable() {
  if (scheduleTableReady) return;
  try {
    await db.exec(`
      CREATE TABLE IF NOT EXISTS class_schedule (
        id TEXT PRIMARY KEY,
        class_id TEXT NOT NULL,
        block_number INTEGER NOT NULL,
        start_time TEXT NOT NULL,
        end_time TEXT NOT NULL,
        label TEXT NOT NULL,
        subject TEXT,
        is_break INTEGER NOT NULL DEFAULT 0,
        break_type TEXT,
        active_days TEXT NOT NULL DEFAULT 'Mon,Tue,Wed,Thu,Fri',
        content_source TEXT,
        UNIQUE (class_id, block_number)
      )
    `);
    scheduleTableReady = true;
  } catch (e) { console.error('ensureClassScheduleTable error:', e); }
}

// Authoritative seed for the Star class. Order = block_number.
// [start, end, label, subject|null, is_break, break_type|null]
type SeedBlock = [string, string, string, string | null, 0 | 1, string | null];
const STAR_SCHEDULE_SEED: SeedBlock[] = [
  ["09:10", "09:20", "Daily News",          "daily_news",     0, null],
  ["09:20", "09:30", "Break",               null,             1, "regular"],
  ["09:30", "09:50", "SEL",                 "sel",            0, null],
  ["09:50", "10:10", "Math",                "math",           0, null],
  ["10:10", "10:20", "Break",               null,             1, "regular"],
  ["10:20", "10:50", "Recess",              "recess",         1, "recess"],
  ["10:50", "11:00", "Calm Down",           "calm_down",      1, "calm_down"],
  ["11:00", "11:15", "Video Learning",      "video_learning", 0, null],
  ["11:15", "11:25", "Writing / Questions", "writing",        0, null],
  ["11:25", "11:35", "Break",               null,             1, "regular"],
  ["11:35", "11:50", "Review / Cleanup",    "review",         0, null],
  ["11:50", "12:00", "Break",               null,             1, "regular"],
  ["12:00", "12:15", "Cashout",             "cashout",        0, null],
  ["12:20", "13:15", "Lunch / Recess",      "lunch",          1, "lunch"],
  ["13:20", "13:40", "Extra Review",        "extra_review",   0, null],
  ["13:40", "13:50", "Break",               null,             1, "regular"],
  ["13:50", "14:00", "TED Talk",            "ted_talk",       0, null],
  ["14:00", "14:10", "Break",               null,             1, "regular"],
  ["14:10", "15:05", "Coding / Art / Gym",  "coding_art_gym", 0, null],
  ["15:11", "15:11", "Dismissal",           "dismissal",      0, null],
];

// Idempotent seed — runs once at startup and is a no-op if any row exists for
// the Star class. Logs its decision so we can tell a blank DB from a seeded one
// in Vercel logs.
let starSeedRan = false;
async function seedStarSchedule() {
  if (starSeedRan) return;
  try {
    await ensureClassScheduleTable();
    const star = await db.prepare("SELECT id FROM classes WHERE name = ? LIMIT 1").get("Star") as any;
    if (!star?.id) { console.log("[schedule-seed] Star class not found — skipping"); starSeedRan = true; return; }
    // Fill-in idempotent: ON CONFLICT (class_id, block_number) DO NOTHING lets
    // a re-run complete a partial seed (e.g. serverless cold-start cut short
    // the initial fire-and-forget loop) without double-inserting.
    const existing = await db.prepare(
      "SELECT COUNT(*) AS n FROM class_schedule WHERE class_id = ?"
    ).get(star.id) as any;
    const had = Number(existing?.n ?? 0);
    let inserted = 0;
    for (let i = 0; i < STAR_SCHEDULE_SEED.length; i++) {
      const [start, end, label, subject, isBreak, breakType] = STAR_SCHEDULE_SEED[i];
      const r = await db.prepare(
        `INSERT INTO class_schedule (id, class_id, block_number, start_time, end_time, label, subject, is_break, break_type, active_days, content_source)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (class_id, block_number) DO NOTHING`
      ).run(crypto.randomUUID(), star.id, i + 1, start, end, label, subject, isBreak, breakType, "Mon,Tue,Wed,Thu,Fri", null) as any;
      if (r?.changes ?? r?.rowCount ?? 0) inserted++;
    }
    console.log(`[schedule-seed] Star class (${star.id}): had ${had} blocks, inserted ${inserted} new, total target ${STAR_SCHEDULE_SEED.length}`);
    // Only mark done once we're sure all blocks are present — otherwise let a
    // later request retry.
    const after = await db.prepare(
      "SELECT COUNT(*) AS n FROM class_schedule WHERE class_id = ?"
    ).get(star.id) as any;
    if (Number(after?.n ?? 0) >= STAR_SCHEDULE_SEED.length) starSeedRan = true;
  } catch (e) {
    console.error("[schedule-seed] error:", e);
    // Don't flip starSeedRan — next request may retry.
  }
}
// Kick off on module import so cold starts self-heal without waiting for a
// schedule read. Fire-and-forget; any failure is logged above.
seedStarSchedule();

router.get("/:id/schedule", async (req: AuthRequest, res: Response) => {
  await ensureClassScheduleTable();
  // Attempt the Star seed on every GET as a belt-and-suspenders fallback —
  // the flag makes it a no-op after the first successful run.
  await seedStarSchedule();
  try {
    const rows = await db.prepare(
      "SELECT * FROM class_schedule WHERE class_id = ? ORDER BY block_number ASC"
    ).all(req.params.id) as any[];
    res.json(rows);
  } catch (e) {
    console.error("schedule GET error:", e);
    res.status(500).json({ error: "Failed to load schedule" });
  }
});

// Bulk replace the whole schedule for a class. Body: { blocks: [{...}] }.
// Deletes all existing rows and inserts the new set. Not wrapped in a true
// transaction (db shim lacks one) — on partial failure the schedule may be
// incomplete, but the teacher can re-save. Kept idempotent by class_id wipe.
const HHMM = /^\d{2}:\d{2}$/;
router.put("/:id/schedule", requireRole("teacher", "admin"), async (req: AuthRequest, res: Response) => {
  await ensureClassScheduleTable();
  const classId = req.params.id;
  const blocks = Array.isArray(req.body?.blocks) ? req.body.blocks : null;
  if (!blocks) return res.status(400).json({ error: "blocks array required" });

  // Validate up front so a bad row doesn't leave us with a half-wiped schedule.
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    if (!b || typeof b !== "object") return res.status(400).json({ error: `block ${i}: must be object` });
    if (!HHMM.test(String(b.start_time || ""))) return res.status(400).json({ error: `block ${i}: start_time must be HH:MM` });
    if (!HHMM.test(String(b.end_time || ""))) return res.status(400).json({ error: `block ${i}: end_time must be HH:MM` });
    if (!String(b.label || "").trim()) return res.status(400).json({ error: `block ${i}: label required` });
  }

  try {
    await db.prepare("DELETE FROM class_schedule WHERE class_id = ?").run(classId);
    for (let i = 0; i < blocks.length; i++) {
      const b = blocks[i];
      const activeDays = Array.isArray(b.active_days)
        ? b.active_days.join(",")
        : String(b.active_days || "Mon,Tue,Wed,Thu,Fri");
      await db.prepare(
        `INSERT INTO class_schedule (id, class_id, block_number, start_time, end_time, label, subject, is_break, break_type, active_days, content_source)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        crypto.randomUUID(),
        classId,
        i + 1,
        String(b.start_time),
        String(b.end_time),
        String(b.label).trim(),
        b.subject ? String(b.subject) : null,
        b.is_break ? 1 : 0,
        b.break_type ? String(b.break_type) : null,
        activeDays,
        b.content_source ? String(b.content_source) : null,
      );
    }
    const rows = await db.prepare(
      "SELECT * FROM class_schedule WHERE class_id = ? ORDER BY block_number ASC"
    ).all(classId) as any[];
    res.json(rows);
  } catch (e) {
    console.error("schedule PUT error:", e);
    res.status(500).json({ error: "Failed to save schedule" });
  }
});

// Reset the class back to the default transcribed daily schedule.
router.post("/:id/schedule/reset", requireRole("teacher", "admin"), async (req: AuthRequest, res: Response) => {
  await ensureClassScheduleTable();
  const classId = req.params.id;
  try {
    await db.prepare("DELETE FROM class_schedule WHERE class_id = ?").run(classId);
    for (let i = 0; i < STAR_SCHEDULE_SEED.length; i++) {
      const [start, end, label, subject, isBreak, breakType] = STAR_SCHEDULE_SEED[i];
      await db.prepare(
        `INSERT INTO class_schedule (id, class_id, block_number, start_time, end_time, label, subject, is_break, break_type, active_days, content_source)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(crypto.randomUUID(), classId, i + 1, start, end, label, subject, isBreak, breakType, "Mon,Tue,Wed,Thu,Fri", null);
    }
    const rows = await db.prepare(
      "SELECT * FROM class_schedule WHERE class_id = ? ORDER BY block_number ASC"
    ).all(classId) as any[];
    res.json(rows);
  } catch (e) {
    console.error("schedule reset error:", e);
    res.status(500).json({ error: "Failed to reset schedule" });
  }
});

export default router;
