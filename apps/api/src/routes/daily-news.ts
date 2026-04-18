import { Router, Response } from "express";
import db from "../db.js";
import { AuthRequest } from "../middleware/auth.js";
import { requireRole } from "../middleware/rbac.js";

const router = Router();

// ── Idempotent migration ──────────────────────────────────────────
// daily_news_source holds per-class "today's Daily News" — the teacher
// pastes the file URL each morning (manual-paste flow). Drive auto-listing
// deferred; the drive_folder_url is stored purely as a convenience link.
let migrated = false;
async function ensureTables() {
  if (migrated) return;
  try {
    await db.exec(`
      CREATE TABLE IF NOT EXISTS daily_news_source (
        class_id TEXT PRIMARY KEY,
        drive_folder_url TEXT,
        todays_file_url TEXT,
        todays_file_title TEXT,
        todays_file_set_at TIMESTAMPTZ
      )
    `);
    // Seed Star class once, leaving today's url null — teacher pastes each AM.
    const star = await db.prepare("SELECT id FROM classes WHERE name = ? LIMIT 1").get("Star") as any;
    if (star?.id) {
      const existing = await db.prepare("SELECT class_id FROM daily_news_source WHERE class_id = ?").get(star.id) as any;
      if (!existing) {
        await db.prepare(
          `INSERT INTO daily_news_source (class_id, drive_folder_url) VALUES (?, ?)`
        ).run(star.id, "https://drive.google.com/drive/folders/1RSlzMGV7qukrYxyfgdgC58eY4F9uIWQL");
      }
    }
  } catch (e) {
    console.error("[daily-news] migration error:", e);
  }
  migrated = true;
}

// ── GET /api/classes/:id/daily-news ──────────────────────────────
// Any authed member of the class (student or teacher) can read.
// Returns the Drive folder URL + today's file (may be null if unset).
router.get("/:id/daily-news", async (req: AuthRequest, res: Response) => {
  await ensureTables();
  const row = await db.prepare(
    `SELECT class_id, drive_folder_url, todays_file_url, todays_file_title, todays_file_set_at
       FROM daily_news_source WHERE class_id = ?`
  ).get(req.params.id) as any;
  if (!row) return res.json({
    class_id: req.params.id,
    drive_folder_url: null,
    todays_file_url: null,
    todays_file_title: null,
    todays_file_set_at: null,
  });
  res.json(row);
});

// ── POST /api/classes/:id/daily-news ─────────────────────────────
// Teacher/admin sets today's file URL + optional title. Upserts.
router.post("/:id/daily-news", requireRole("teacher", "admin"), async (req: AuthRequest, res: Response) => {
  await ensureTables();
  const url = String(req.body?.todays_file_url || "").trim();
  const title = String(req.body?.todays_file_title || "").trim();
  const folder = req.body?.drive_folder_url ? String(req.body.drive_folder_url).trim() : null;
  if (!url) return res.status(400).json({ error: "todays_file_url is required" });
  if (!/^https?:\/\//i.test(url)) return res.status(400).json({ error: "todays_file_url must be http(s)" });

  const existing = await db.prepare("SELECT class_id FROM daily_news_source WHERE class_id = ?").get(req.params.id) as any;
  if (existing) {
    // Keep existing folder unless caller sent a new one.
    if (folder) {
      await db.prepare(
        `UPDATE daily_news_source
            SET todays_file_url = ?, todays_file_title = ?, todays_file_set_at = CURRENT_TIMESTAMP,
                drive_folder_url = ?
          WHERE class_id = ?`
      ).run(url, title || null, folder, req.params.id);
    } else {
      await db.prepare(
        `UPDATE daily_news_source
            SET todays_file_url = ?, todays_file_title = ?, todays_file_set_at = CURRENT_TIMESTAMP
          WHERE class_id = ?`
      ).run(url, title || null, req.params.id);
    }
  } else {
    await db.prepare(
      `INSERT INTO daily_news_source (class_id, drive_folder_url, todays_file_url, todays_file_title, todays_file_set_at)
       VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)`
    ).run(req.params.id, folder, url, title || null);
  }

  const row = await db.prepare(
    `SELECT class_id, drive_folder_url, todays_file_url, todays_file_title, todays_file_set_at
       FROM daily_news_source WHERE class_id = ?`
  ).get(req.params.id);
  res.json(row);
});

export default router;
