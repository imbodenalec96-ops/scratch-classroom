import { Router, Response } from "express";
import { randomUUID } from "crypto";
import db from "../db.js";
import { AuthRequest } from "../middleware/auth.js";
import { requireRole } from "../middleware/rbac.js";

const router = Router();

// Ensure approved-video columns exist (idempotent)
async function ensureVideoColumns() {
  const cols = ["approved_video_url TEXT", "approved_video_title TEXT", "approved_video_set_at TEXT"];
  for (const col of cols) {
    try { await db.exec(`ALTER TABLE students ADD COLUMN ${col}`); } catch { /* already exists */ }
  }
}

// ── Per-student command pipe (Scenario 1 foundation) ───────────────
// A single durable row-per-action queue so every teacher-to-student action
// (LOCK, UNLOCK, MESSAGE, GRANT_FREETIME, REVOKE_FREETIME, END_BREAK,
// NAVIGATE, KICK, BROADCAST_VIDEO, END_BROADCAST) has:
//   - server-side persistence (survives reload, page navigation, offline gaps)
//   - exactly-once delivery (consumed_at sentinel + student-scoped consume)
//   - a clean replacement for the ad-hoc class_commands fan-out we were
//     using for some actions and forgetting for others.
// Columns use TEXT to stay compatible with the sqlite dev shim; on prod
// Neon they're simply TEXT columns — payload is a JSON-string by convention.
let studentCommandsReady = false;
async function ensureStudentCommandsTable() {
  if (studentCommandsReady) return;
  try {
    await db.exec(`
      CREATE TABLE IF NOT EXISTS student_commands (
        id TEXT PRIMARY KEY,
        student_id TEXT NOT NULL,
        command_type TEXT NOT NULL,
        payload TEXT DEFAULT '',
        created_at TEXT NOT NULL,
        consumed_at TEXT
      )
    `);
    // Indexed on the pending-for-student lookup we do every 3s from the client.
    try {
      await db.exec(`CREATE INDEX IF NOT EXISTS idx_student_commands_pending
        ON student_commands(student_id, consumed_at, created_at)`);
    } catch { /* sqlite older versions */ }
    studentCommandsReady = true;
  } catch (e) {
    // Fail-open: leave the flag false so we retry on next request.
    console.error("ensureStudentCommandsTable failed:", e);
  }
}

/**
 * Internal helper used by teacher-action endpoints elsewhere to enqueue a
 * command for a specific student. Returns the new row id.
 * Export shape kept simple (no jsonb coercion) since the codebase is
 * sqlite/pg portable and all existing command payloads are strings.
 */
export async function enqueueStudentCommand(
  studentId: string,
  commandType: string,
  payload: string | object = ""
): Promise<string> {
  await ensureStudentCommandsTable();
  const id = randomUUID();
  const now = new Date().toISOString();
  const body = typeof payload === "string" ? payload : JSON.stringify(payload);
  await db.prepare(
    `INSERT INTO student_commands (id, student_id, command_type, payload, created_at)
     VALUES (?, ?, ?, ?, ?)`
  ).run(id, studentId, commandType, body, now);
  return id;
}

// GET /me/commands — pending commands for the authenticated student.
// Client polls this every ~3s; returns oldest-first so the client can process
// in order (e.g. LOCK before MESSAGE if both were sent together).
router.get("/me/commands", async (req: AuthRequest, res: Response) => {
  await ensureStudentCommandsTable();
  try {
    const rows = await db.prepare(
      `SELECT id, command_type, payload, created_at
         FROM student_commands
        WHERE student_id = ? AND consumed_at IS NULL
        ORDER BY created_at ASC
        LIMIT 50`
    ).all(req.user!.id);
    res.json(rows);
  } catch (e) {
    console.error("GET /me/commands failed:", e);
    res.status(500).json({ error: "Failed to list commands" });
  }
});

// POST /me/commands/:id/consume — student acknowledges it processed the
// command. Scoped to the calling user so a student can never consume another
// student's row. Idempotent: setting consumed_at twice is a no-op.
router.post("/me/commands/:id/consume", async (req: AuthRequest, res: Response) => {
  await ensureStudentCommandsTable();
  const { id } = req.params;
  try {
    const r = await db.prepare(
      `UPDATE student_commands
          SET consumed_at = ?
        WHERE id = ? AND student_id = ? AND consumed_at IS NULL`
    ).run(new Date().toISOString(), id, req.user!.id);
    res.json({ ok: true, changes: r.changes });
  } catch (e) {
    console.error("POST /me/commands/:id/consume failed:", e);
    res.status(500).json({ error: "Failed to consume command" });
  }
});

// GET / — list students (active only by default, ?all=1 for all)
router.get("/", async (req: AuthRequest, res: Response) => {
  try {
    const all = req.query.all === "1";
    const sql = all
      ? "SELECT * FROM students ORDER BY name ASC"
      : "SELECT * FROM students WHERE active=1 ORDER BY name ASC";
    const rows = await db.prepare(sql).all();
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: "Failed to list students" });
  }
});

// GET /:id — get single student
router.get("/:id", async (req: AuthRequest, res: Response) => {
  try {
    const row = await db.prepare("SELECT * FROM students WHERE id=?").get(req.params.id);
    if (!row) return res.status(404).json({ error: "Student not found" });
    res.json(row);
  } catch (err) {
    res.status(500).json({ error: "Failed to get student" });
  }
});

// POST / — create student
router.post("/", async (req: AuthRequest, res: Response) => {
  try {
    const {
      name,
      avatar_emoji = "🐱",
      reading_min_grade = 1,
      reading_max_grade = 3,
      math_min_grade = 1,
      math_max_grade = 3,
      writing_min_grade = 1,
      writing_max_grade = 3,
      behavior_points = 0,
      active = 1,
    } = req.body;

    if (!name) return res.status(400).json({ error: "name is required" });

    const id = randomUUID();
    await db
      .prepare(
        `INSERT INTO students
          (id, name, avatar_emoji, reading_min_grade, reading_max_grade,
           math_min_grade, math_max_grade, writing_min_grade, writing_max_grade,
           behavior_points, active)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        id,
        name,
        avatar_emoji,
        reading_min_grade,
        reading_max_grade,
        math_min_grade,
        math_max_grade,
        writing_min_grade,
        writing_max_grade,
        behavior_points,
        active
      );

    const row = await db.prepare("SELECT * FROM students WHERE id=?").get(id);
    res.status(201).json(row);
  } catch (err) {
    res.status(500).json({ error: "Failed to create student" });
  }
});

// PUT /:id — update student (partial)
router.put("/:id", async (req: AuthRequest, res: Response) => {
  try {
    const existing = await db.prepare("SELECT * FROM students WHERE id=?").get(req.params.id);
    if (!existing) return res.status(404).json({ error: "Student not found" });

    const {
      name = existing.name,
      avatar_emoji = existing.avatar_emoji,
      reading_min_grade = existing.reading_min_grade,
      reading_max_grade = existing.reading_max_grade,
      math_min_grade = existing.math_min_grade,
      math_max_grade = existing.math_max_grade,
      writing_min_grade = existing.writing_min_grade,
      writing_max_grade = existing.writing_max_grade,
      behavior_points = existing.behavior_points,
      active = existing.active,
    } = req.body;

    await db
      .prepare(
        `UPDATE students SET
          name=?, avatar_emoji=?,
          reading_min_grade=?, reading_max_grade=?,
          math_min_grade=?, math_max_grade=?,
          writing_min_grade=?, writing_max_grade=?,
          behavior_points=?, active=?
         WHERE id=?`
      )
      .run(
        name,
        avatar_emoji,
        reading_min_grade,
        reading_max_grade,
        math_min_grade,
        math_max_grade,
        writing_min_grade,
        writing_max_grade,
        behavior_points,
        active,
        req.params.id
      );

    const row = await db.prepare("SELECT * FROM students WHERE id=?").get(req.params.id);
    res.json(row);
  } catch (err) {
    res.status(500).json({ error: "Failed to update student" });
  }
});

// DELETE /:id — delete student
router.delete("/:id", async (req: AuthRequest, res: Response) => {
  try {
    await db.prepare("DELETE FROM students WHERE id=?").run(req.params.id);
    res.status(204).send();
  } catch (err) {
    res.status(500).json({ error: "Failed to delete student" });
  }
});

// PUT /:id/approve-video — teacher approves a YouTube video for this student
router.put("/:id/approve-video", async (req: AuthRequest, res: Response) => {
  try {
    await ensureVideoColumns();
    const { url, title } = req.body;
    if (!url) return res.status(400).json({ error: "url is required" });
    const now = new Date().toISOString();
    await db.prepare(
      "UPDATE students SET approved_video_url=?, approved_video_title=?, approved_video_set_at=? WHERE id=?"
    ).run(url, title || "", now, req.params.id);
    const row = await db.prepare("SELECT * FROM students WHERE id=?").get(req.params.id);
    res.json(row);
  } catch (err) {
    res.status(500).json({ error: "Failed to approve video" });
  }
});

// DELETE /:id/approve-video — teacher clears a student's approved video
router.delete("/:id/approve-video", async (req: AuthRequest, res: Response) => {
  try {
    await ensureVideoColumns();
    await db.prepare(
      "UPDATE students SET approved_video_url=NULL, approved_video_title=NULL, approved_video_set_at=NULL WHERE id=?"
    ).run(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: "Failed to clear video" });
  }
});

// POST /:id/skip-work-day — set skip_work_day_date to today
router.post("/:id/skip-work-day", async (req: AuthRequest, res: Response) => {
  try {
    await db
      .prepare("UPDATE students SET skip_work_day_date=date('now') WHERE id=?")
      .run(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: "Failed to set skip work day" });
  }
});

// DELETE /:id/skip-work-day — clear skip_work_day_date
router.delete("/:id/skip-work-day", async (req: AuthRequest, res: Response) => {
  try {
    await db
      .prepare("UPDATE students SET skip_work_day_date=NULL WHERE id=?")
      .run(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: "Failed to clear skip work day" });
  }
});

// POST /:id/lock — teacher/admin enqueues a LOCK command for a single student
router.post("/:id/lock", requireRole("teacher", "admin"), async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const { message } = req.body;
  try {
    const cmdId = await enqueueStudentCommand(id, "LOCK", { message: message || null });
    res.json({ ok: true, id: cmdId });
  } catch (e) {
    console.error("POST /:id/lock failed:", e);
    res.status(500).json({ error: "Failed to lock student" });
  }
});

// POST /:id/unlock — teacher/admin enqueues an UNLOCK command for a single student
router.post("/:id/unlock", requireRole("teacher", "admin"), async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  try {
    const cmdId = await enqueueStudentCommand(id, "UNLOCK", "");
    res.json({ ok: true, id: cmdId });
  } catch (e) {
    console.error("POST /:id/unlock failed:", e);
    res.status(500).json({ error: "Failed to unlock student" });
  }
});

// POST /:id/message — teacher/admin sends a 1:1 message to a single student
router.post("/:id/message", requireRole("teacher", "admin"), async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const { text } = req.body;
  if (!text || typeof text !== "string" || !text.trim()) {
    return res.status(400).json({ error: "text is required" });
  }
  try {
    const cmdId = await enqueueStudentCommand(id, "MESSAGE", { text: text.trim() });
    res.json({ ok: true, id: cmdId });
  } catch (e) {
    console.error("POST /:id/message failed:", e);
    res.status(500).json({ error: "Failed to send message" });
  }
});

export default router;
