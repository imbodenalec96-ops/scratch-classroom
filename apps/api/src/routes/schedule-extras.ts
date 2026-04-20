/**
 * schedule-extras — three mutable layers that sit on top of the permanent
 * `class_schedule` rows:
 *
 *   1. schedule_overrides       — per-student pull-off-block (e.g. "Jaida to
 *                                 Calm Room until 10:50"). Student's own
 *                                 client reads its active override to route.
 *   2. schedule_skips           — whole-block cancellation for a single date
 *                                 (e.g. "no SEL today"). Auto-nav + lockdown
 *                                 treat the block as inactive.
 *   3. schedule_daily_overrides — today-only edits to a block (time change,
 *                                 subject swap, ad-hoc insert, reorder).
 *                                 Original row is left untouched; today the
 *                                 override wins.
 *
 * Tables are created lazily via `ensureSchema()` on every request — matches
 * the ensure-pattern the rest of the codebase uses (store.ts, board.ts,
 * students.ts). All three tables key on TEXT class_id to match the existing
 * class_schedule column shape (see `ensureClassScheduleTable` in classes.ts).
 *
 * Mount points (in app.ts):
 *   app.use("/api/classes", authMiddleware, scheduleExtrasClassRoutes);
 *   app.use("/api/students", authMiddleware, scheduleExtrasStudentRoutes);
 */
import { Router, Response } from "express";
import crypto from "crypto";
import db from "../db.js";
import { AuthRequest } from "../middleware/auth.js";
import { requireRole } from "../middleware/rbac.js";

const HHMM = /^\d{2}:\d{2}$/;
const YMD = /^\d{4}-\d{2}-\d{2}$/;

let schemaReady = false;
async function ensureSchema() {
  if (schemaReady) return;
  try {
    // Per-student override — "pull this student off their current block".
    // `destination` is either a block_id (points at another class_schedule
    // row) or a synthetic string like "calm_room", "office", "gen_ed". The
    // UI label is stored alongside so we can render without joining.
    await db.exec(`
      CREATE TABLE IF NOT EXISTS schedule_overrides (
        id TEXT PRIMARY KEY,
        student_id TEXT NOT NULL,
        class_id TEXT NOT NULL,
        original_block_id TEXT,
        destination TEXT NOT NULL,
        destination_label TEXT,
        starts_at TEXT NOT NULL,
        ends_at TEXT NOT NULL,
        created_by TEXT,
        reason TEXT,
        created_at TEXT DEFAULT (datetime('now'))
      )
    `);
    try {
      await db.exec(`CREATE INDEX IF NOT EXISTS idx_schedule_overrides_student_active
        ON schedule_overrides(student_id, ends_at)`);
    } catch { /* sqlite old versions */ }

    // Whole-block skip for a specific date.
    await db.exec(`
      CREATE TABLE IF NOT EXISTS schedule_skips (
        id TEXT PRIMARY KEY,
        class_id TEXT NOT NULL,
        block_id TEXT NOT NULL,
        skipped_date TEXT NOT NULL,
        reason TEXT,
        created_by TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        UNIQUE (class_id, block_id, skipped_date)
      )
    `);

    // Today-only block edit. When `original_block_id` is set, it clones /
    // supersedes that block for the date. When null, it's an ad-hoc insert
    // that only exists for this date.
    await db.exec(`
      CREATE TABLE IF NOT EXISTS schedule_daily_overrides (
        id TEXT PRIMARY KEY,
        class_id TEXT NOT NULL,
        original_block_id TEXT,
        date TEXT NOT NULL,
        label TEXT NOT NULL,
        subject TEXT,
        start_time TEXT NOT NULL,
        end_time TEXT NOT NULL,
        is_break INTEGER NOT NULL DEFAULT 0,
        break_type TEXT,
        content_source TEXT,
        order_index INTEGER NOT NULL DEFAULT 0,
        created_by TEXT,
        created_at TEXT DEFAULT (datetime('now'))
      )
    `);
    try {
      await db.exec(`CREATE INDEX IF NOT EXISTS idx_schedule_daily_overrides_class_date
        ON schedule_daily_overrides(class_id, date)`);
    } catch { /* sqlite old */ }

    schemaReady = true;
  } catch (e) {
    console.error("schedule-extras ensureSchema failed:", e);
  }
}

// Today in the server's local zone — we mirror api.ts clients that also read
// `new Date()` for today. See the note in routes/store.ts `redeemStoreItem`
// about UTC drift — for now we accept the small midnight-crossing window.
function todayYMD(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Class-scoped routes — mounted at /api/classes
// ─────────────────────────────────────────────────────────────────────────────
export const scheduleExtrasClassRoutes = Router();

/** GET /:id/schedule-extras — bundle: today's skips + daily overrides + active
 *  per-student overrides. One round-trip for the teacher today-view. */
scheduleExtrasClassRoutes.get("/:id/schedule-extras", async (req: AuthRequest, res: Response) => {
  await ensureSchema();
  const classId = req.params.id;
  const date = typeof req.query.date === "string" && YMD.test(req.query.date) ? req.query.date : todayYMD();
  const nowIso = new Date().toISOString();
  try {
    const [skips, dailyOverrides, activeOverrides] = await Promise.all([
      db.prepare(
        `SELECT * FROM schedule_skips WHERE class_id = ? AND skipped_date = ? ORDER BY created_at ASC`
      ).all(classId, date),
      db.prepare(
        `SELECT * FROM schedule_daily_overrides WHERE class_id = ? AND date = ? ORDER BY order_index ASC, start_time ASC`
      ).all(classId, date),
      db.prepare(
        `SELECT * FROM schedule_overrides WHERE class_id = ? AND ends_at > ? ORDER BY created_at DESC`
      ).all(classId, nowIso),
    ]);
    res.json({ date, skips, dailyOverrides, activeOverrides });
  } catch (e) {
    console.error("schedule-extras GET failed:", e);
    res.status(500).json({ error: "Failed to load schedule extras" });
  }
});

// ── Per-student override ────────────────────────────────────────────
/** POST /:id/schedule-override — teacher pulls a student off their block.
 *  Body: { studentId, originalBlockId?, destination, destinationLabel?,
 *          durationMinutes?|endsAt?, reason? } */
scheduleExtrasClassRoutes.post("/:id/schedule-override",
  requireRole("teacher", "admin"),
  async (req: AuthRequest, res: Response) => {
    await ensureSchema();
    const classId = req.params.id;
    const {
      studentId, originalBlockId, destination, destinationLabel,
      durationMinutes, endsAt, reason,
    } = req.body || {};
    if (!studentId || typeof studentId !== "string") {
      return res.status(400).json({ error: "studentId required" });
    }
    if (!destination || typeof destination !== "string") {
      return res.status(400).json({ error: "destination required" });
    }

    // Resolve end time. Prefer explicit `endsAt` (ISO), then `durationMinutes`,
    // else fall back to 15 minutes — enough to cover a typical calm-down.
    const now = new Date();
    let endsAtIso: string;
    if (typeof endsAt === "string" && !Number.isNaN(new Date(endsAt).getTime())) {
      endsAtIso = new Date(endsAt).toISOString();
    } else {
      const mins = Number.isFinite(Number(durationMinutes)) ? Number(durationMinutes) : 15;
      endsAtIso = new Date(now.getTime() + Math.max(1, mins) * 60_000).toISOString();
    }

    try {
      const id = crypto.randomUUID();
      await db.prepare(
        `INSERT INTO schedule_overrides
          (id, student_id, class_id, original_block_id, destination, destination_label,
           starts_at, ends_at, created_by, reason)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        id, studentId, classId,
        originalBlockId ? String(originalBlockId) : null,
        destination, destinationLabel ? String(destinationLabel) : null,
        now.toISOString(), endsAtIso,
        req.user!.id, reason ? String(reason) : null,
      );
      const row = await db.prepare(`SELECT * FROM schedule_overrides WHERE id = ?`).get(id);
      res.json(row);
    } catch (e) {
      console.error("schedule-override POST failed:", e);
      res.status(500).json({ error: "Failed to create override" });
    }
  });

/** DELETE /:id/schedule-override/:overrideId — cancel a pull-off early. */
scheduleExtrasClassRoutes.delete("/:id/schedule-override/:overrideId",
  requireRole("teacher", "admin"),
  async (req: AuthRequest, res: Response) => {
    await ensureSchema();
    try {
      await db.prepare(
        `UPDATE schedule_overrides SET ends_at = ? WHERE id = ? AND class_id = ?`
      ).run(new Date().toISOString(), req.params.overrideId, req.params.id);
      res.json({ ok: true });
    } catch (e) {
      console.error("schedule-override DELETE failed:", e);
      res.status(500).json({ error: "Failed to cancel override" });
    }
  });

// ── Whole-block skip ────────────────────────────────────────────────
/** POST /:id/schedule-skip — body { blockId, date?, reason? } */
scheduleExtrasClassRoutes.post("/:id/schedule-skip",
  requireRole("teacher", "admin"),
  async (req: AuthRequest, res: Response) => {
    await ensureSchema();
    const classId = req.params.id;
    const { blockId, date, reason } = req.body || {};
    if (!blockId || typeof blockId !== "string") {
      return res.status(400).json({ error: "blockId required" });
    }
    const d = typeof date === "string" && YMD.test(date) ? date : todayYMD();
    try {
      const id = crypto.randomUUID();
      // Pattern-match the store.ts idempotency story: insert, swallow the
      // UNIQUE-collision as a no-op so repeated clicks don't 500.
      try {
        await db.prepare(
          `INSERT INTO schedule_skips (id, class_id, block_id, skipped_date, reason, created_by)
           VALUES (?, ?, ?, ?, ?, ?)`
        ).run(id, classId, blockId, d, reason ? String(reason) : null, req.user!.id);
      } catch (e: any) {
        // Unique constraint — already skipped for that date. Fine.
        if (!/UNIQUE|duplicate/i.test(String(e?.message || ""))) throw e;
      }
      const row = await db.prepare(
        `SELECT * FROM schedule_skips WHERE class_id = ? AND block_id = ? AND skipped_date = ?`
      ).get(classId, blockId, d);
      res.json(row || { ok: true });
    } catch (e) {
      console.error("schedule-skip POST failed:", e);
      res.status(500).json({ error: "Failed to skip block" });
    }
  });

/** DELETE /:id/schedule-skip/:blockId?date=YYYY-MM-DD — un-skip. */
scheduleExtrasClassRoutes.delete("/:id/schedule-skip/:blockId",
  requireRole("teacher", "admin"),
  async (req: AuthRequest, res: Response) => {
    await ensureSchema();
    const classId = req.params.id;
    const { blockId } = req.params;
    const date = typeof req.query.date === "string" && YMD.test(req.query.date)
      ? req.query.date : todayYMD();
    try {
      await db.prepare(
        `DELETE FROM schedule_skips WHERE class_id = ? AND block_id = ? AND skipped_date = ?`
      ).run(classId, blockId, date);
      res.json({ ok: true });
    } catch (e) {
      console.error("schedule-skip DELETE failed:", e);
      res.status(500).json({ error: "Failed to un-skip block" });
    }
  });

// ── Today-only block edits / ad-hoc inserts ─────────────────────────
/** POST /:id/schedule/today — body { originalBlockId?, label, subject?,
 *  startTime, endTime, isBreak?, breakType?, contentSource?, orderIndex?,
 *  date? } */
scheduleExtrasClassRoutes.post("/:id/schedule/today",
  requireRole("teacher", "admin"),
  async (req: AuthRequest, res: Response) => {
    await ensureSchema();
    const classId = req.params.id;
    const {
      originalBlockId, label, subject, startTime, endTime,
      isBreak, breakType, contentSource, orderIndex, date,
    } = req.body || {};
    if (!label || typeof label !== "string" || !label.trim()) {
      return res.status(400).json({ error: "label required" });
    }
    if (!HHMM.test(String(startTime || ""))) return res.status(400).json({ error: "startTime HH:MM" });
    if (!HHMM.test(String(endTime || ""))) return res.status(400).json({ error: "endTime HH:MM" });
    const d = typeof date === "string" && YMD.test(date) ? date : todayYMD();
    try {
      const id = crypto.randomUUID();
      await db.prepare(
        `INSERT INTO schedule_daily_overrides
          (id, class_id, original_block_id, date, label, subject, start_time,
           end_time, is_break, break_type, content_source, order_index, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        id, classId,
        originalBlockId ? String(originalBlockId) : null,
        d, String(label).trim(),
        subject ? String(subject) : null,
        String(startTime), String(endTime),
        isBreak ? 1 : 0,
        breakType ? String(breakType) : null,
        contentSource ? String(contentSource) : null,
        Number.isFinite(Number(orderIndex)) ? Number(orderIndex) : 0,
        req.user!.id,
      );
      const row = await db.prepare(`SELECT * FROM schedule_daily_overrides WHERE id = ?`).get(id);
      res.json(row);
    } catch (e) {
      console.error("schedule/today POST failed:", e);
      res.status(500).json({ error: "Failed to create today-override" });
    }
  });

/** PUT /:id/schedule/today/:overrideId — edit a today-only override. */
scheduleExtrasClassRoutes.put("/:id/schedule/today/:overrideId",
  requireRole("teacher", "admin"),
  async (req: AuthRequest, res: Response) => {
    await ensureSchema();
    const {
      label, subject, startTime, endTime, isBreak, breakType, contentSource, orderIndex,
    } = req.body || {};
    try {
      // Build a sparse UPDATE to let the UI patch subsets.
      const fields: string[] = [];
      const params: any[] = [];
      if (typeof label === "string" && label.trim()) { fields.push("label = ?"); params.push(label.trim()); }
      if (subject !== undefined) { fields.push("subject = ?"); params.push(subject ? String(subject) : null); }
      if (typeof startTime === "string" && HHMM.test(startTime)) { fields.push("start_time = ?"); params.push(startTime); }
      if (typeof endTime === "string" && HHMM.test(endTime)) { fields.push("end_time = ?"); params.push(endTime); }
      if (isBreak !== undefined) { fields.push("is_break = ?"); params.push(isBreak ? 1 : 0); }
      if (breakType !== undefined) { fields.push("break_type = ?"); params.push(breakType ? String(breakType) : null); }
      if (contentSource !== undefined) { fields.push("content_source = ?"); params.push(contentSource ? String(contentSource) : null); }
      if (orderIndex !== undefined && Number.isFinite(Number(orderIndex))) { fields.push("order_index = ?"); params.push(Number(orderIndex)); }
      if (!fields.length) return res.status(400).json({ error: "no fields to update" });
      params.push(req.params.overrideId, req.params.id);
      await db.prepare(
        `UPDATE schedule_daily_overrides SET ${fields.join(", ")} WHERE id = ? AND class_id = ?`
      ).run(...params);
      const row = await db.prepare(`SELECT * FROM schedule_daily_overrides WHERE id = ?`).get(req.params.overrideId);
      res.json(row);
    } catch (e) {
      console.error("schedule/today PUT failed:", e);
      res.status(500).json({ error: "Failed to update today-override" });
    }
  });

/** DELETE /:id/schedule/today/:overrideId — remove a today-only override. */
scheduleExtrasClassRoutes.delete("/:id/schedule/today/:overrideId",
  requireRole("teacher", "admin"),
  async (req: AuthRequest, res: Response) => {
    await ensureSchema();
    try {
      await db.prepare(
        `DELETE FROM schedule_daily_overrides WHERE id = ? AND class_id = ?`
      ).run(req.params.overrideId, req.params.id);
      res.json({ ok: true });
    } catch (e) {
      console.error("schedule/today DELETE failed:", e);
      res.status(500).json({ error: "Failed to delete today-override" });
    }
  });

// ── Permanent single-block edit (write straight to class_schedule) ──
/** PUT /:id/schedule/:blockId — patch a permanent block row. Fields:
 *  label, subject, startTime, endTime, isBreak, breakType, contentSource,
 *  activeDays (array|csv), orderIndex (block_number). */
scheduleExtrasClassRoutes.put("/:id/schedule/:blockId",
  requireRole("teacher", "admin"),
  async (req: AuthRequest, res: Response) => {
    const classId = req.params.id;
    const blockId = req.params.blockId;
    const {
      label, subject, startTime, endTime, isBreak, breakType,
      contentSource, activeDays, orderIndex,
    } = req.body || {};
    try {
      const fields: string[] = [];
      const params: any[] = [];
      if (typeof label === "string" && label.trim()) { fields.push("label = ?"); params.push(label.trim()); }
      if (subject !== undefined) { fields.push("subject = ?"); params.push(subject ? String(subject) : null); }
      if (typeof startTime === "string" && HHMM.test(startTime)) { fields.push("start_time = ?"); params.push(startTime); }
      if (typeof endTime === "string" && HHMM.test(endTime)) { fields.push("end_time = ?"); params.push(endTime); }
      if (isBreak !== undefined) { fields.push("is_break = ?"); params.push(isBreak ? 1 : 0); }
      if (breakType !== undefined) { fields.push("break_type = ?"); params.push(breakType ? String(breakType) : null); }
      if (contentSource !== undefined) { fields.push("content_source = ?"); params.push(contentSource ? String(contentSource) : null); }
      if (activeDays !== undefined) {
        const csv = Array.isArray(activeDays) ? activeDays.join(",") : String(activeDays);
        fields.push("active_days = ?"); params.push(csv);
      }
      if (orderIndex !== undefined && Number.isFinite(Number(orderIndex))) {
        fields.push("block_number = ?"); params.push(Number(orderIndex));
      }
      if (!fields.length) return res.status(400).json({ error: "no fields to update" });
      params.push(blockId, classId);
      await db.prepare(
        `UPDATE class_schedule SET ${fields.join(", ")} WHERE id = ? AND class_id = ?`
      ).run(...params);
      const row = await db.prepare(
        `SELECT * FROM class_schedule WHERE id = ? AND class_id = ?`
      ).get(blockId, classId);
      res.json(row);
    } catch (e) {
      console.error("schedule PUT single-block failed:", e);
      res.status(500).json({ error: "Failed to update block" });
    }
  });

// ─────────────────────────────────────────────────────────────────────────────
// Student-scoped routes — mounted at /api/students
// ─────────────────────────────────────────────────────────────────────────────
export const scheduleExtrasStudentRoutes = Router();

/** GET /:studentId/schedule-override/active — returns the current live
 *  override for that student, or null if none. Student can fetch their own;
 *  teacher/admin can fetch any. */
scheduleExtrasStudentRoutes.get("/:studentId/schedule-override/active",
  async (req: AuthRequest, res: Response) => {
    await ensureSchema();
    const u = req.user!;
    const { studentId } = req.params;
    if (u.role === "student" && u.id !== studentId) {
      return res.status(403).json({ error: "Forbidden" });
    }
    try {
      const now = new Date().toISOString();
      const row = await db.prepare(
        `SELECT * FROM schedule_overrides
         WHERE student_id = ? AND starts_at <= ? AND ends_at > ?
         ORDER BY created_at DESC LIMIT 1`
      ).get(studentId, now, now);
      res.json(row || null);
    } catch (e) {
      console.error("schedule-override active GET failed:", e);
      res.status(500).json({ error: "Failed to load override" });
    }
  });
