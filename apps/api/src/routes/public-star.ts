// Public, unauthenticated lookups for STAR barcodes. Used by phones
// that haven't logged into Scratch Classroom — they still need to be
// able to identify a worksheet barcode in order to snap a photo.
//
// Read-only. Returns just the payload (the assignment metadata that
// was pushed up via /api/classes/:classId/star-barcodes by the teacher
// on their laptop or iPad).

import { Router, Request, Response } from "express";
import db from "../db.js";

const router = Router();

let starBarcodesReady = false;
async function ensureStarBarcodes() {
  if (starBarcodesReady) return;
  try {
    await db.exec(`CREATE TABLE IF NOT EXISTS star_barcodes (
      class_id TEXT NOT NULL,
      barcode TEXT NOT NULL,
      payload TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      PRIMARY KEY (class_id, barcode)
    )`);
    starBarcodesReady = true;
  } catch { starBarcodesReady = true; }
}

// Public read-only board data — same shape as /api/board/classes/
// :classId/data but without authMiddleware. The projector / iPad
// may not be logged in as a teacher, but it still needs to show the
// roster, schedule, specials, and board settings. NOTHING here is
// confidential: it's the same data already shown on the projector
// to the whole class.
router.get("/board/classes/:classId/data", async (req: Request, res: Response) => {
  const classId = req.params.classId;
  try {
    // Defensive idempotent migration (mirrors the authed endpoint)
    try { await db.exec(`ALTER TABLE board_user_data ADD COLUMN mcdonalds_for TEXT`); } catch {}

    const students = await db.prepare(
      `SELECT u.id, u.name, u.avatar_url, u.avatar_emoji, u.specials_grade,
              COALESCE(u.dojo_points, 0)      AS dojo_points,
              COALESCE(bd.behavior_stars, 0) AS behavior_stars,
              COALESCE(bd.reward_count, 0)    AS reward_count,
              COALESCE(bd.level, 1)           AS level,
              bd.mcdonalds_for                AS mcdonalds_for
       FROM users u
       JOIN class_members cm ON u.id = cm.user_id
       LEFT JOIN board_user_data bd ON bd.user_id = u.id::text
       WHERE cm.class_id = ?::uuid
         AND u.role = 'student'
         AND LOWER(u.name) <> 'rayden'
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
    console.error("public/board/data", e);
    res.status(500).json({ error: e?.message || "board data failed" });
  }
});

// Public list of classes — just id + name so the projector / iPad
// can pick a class without logging in. No member-level info.
router.get("/classes", async (_req: Request, res: Response) => {
  try {
    const rows = await db.prepare(`SELECT id, name FROM classes ORDER BY created_at ASC NULLS LAST, name ASC LIMIT 200`).all();
    res.json(rows);
  } catch (e: any) {
    console.error("public/classes", e);
    res.status(500).json({ error: e?.message || "list failed" });
  }
});

// Global single-barcode lookup. The phone may not know its class id
// yet (or may not be logged in at all), so this endpoint searches
// across every class and returns the freshest match.
router.get("/star-barcodes/:barcode", async (req: Request, res: Response) => {
  await ensureStarBarcodes();
  const bc = String(req.params.barcode || "").trim().toUpperCase();
  if (!bc) return res.status(400).json({ error: "missing barcode" });
  try {
    const row: any = await db.prepare(
      `SELECT class_id, barcode, payload, created_at FROM star_barcodes WHERE barcode = ? ORDER BY created_at DESC LIMIT 1`
    ).get(bc);
    if (!row) return res.status(404).json({ error: "not found" });
    let p: any = {};
    try { p = JSON.parse(row.payload || "{}"); } catch {}
    res.json({ barcode: row.barcode, payload: p, class_id: row.class_id, created_at: row.created_at });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || "fetch failed" });
  }
});

export default router;
