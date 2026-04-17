import { Router, Response } from "express";
import { randomUUID } from "crypto";
import db from "../db.js";
import { AuthRequest } from "../middleware/auth.js";
import { requireRole } from "../middleware/rbac.js";

const router = Router();

// ── Ensure youtube_library table exists ──────────────────────────────────
let libraryTableReady = false;
async function ensureLibraryTable() {
  if (libraryTableReady) return;
  try {
    await db.exec(`
      CREATE TABLE IF NOT EXISTS youtube_library (
        id TEXT PRIMARY KEY,
        class_id TEXT NOT NULL,
        title TEXT NOT NULL,
        url TEXT NOT NULL,
        video_id TEXT NOT NULL,
        thumbnail_url TEXT NOT NULL DEFAULT '',
        category TEXT NOT NULL DEFAULT 'General',
        auto_approve INTEGER NOT NULL DEFAULT 1,
        added_by TEXT NOT NULL DEFAULT '',
        added_at TEXT NOT NULL DEFAULT ''
      )
    `);
    libraryTableReady = true;
  } catch (e) { console.error('ensureLibraryTable error:', e); }
}

function extractVideoId(url: string): string {
  if (!url) return '';
  if (/^[A-Za-z0-9_-]{11}$/.test(url.trim())) return url.trim();
  const m = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([A-Za-z0-9_-]{11})/);
  return m ? m[1] : '';
}

// GET /library/:classId — student browses curated library
router.get("/library/:classId", async (req: AuthRequest, res: Response) => {
  await ensureLibraryTable();
  try {
    const rows = await db.prepare(
      "SELECT * FROM youtube_library WHERE class_id = ? ORDER BY added_at DESC"
    ).all(req.params.classId);
    res.json(rows);
  } catch (e) {
    res.json([]);
  }
});

// POST /library — teacher adds video to class library
router.post("/library", requireRole("teacher", "admin"), async (req: AuthRequest, res: Response) => {
  await ensureLibraryTable();
  const { class_id, title, url, category = "General", auto_approve = true } = req.body;
  if (!class_id || !title || !url) {
    return res.status(400).json({ error: "class_id, title, and url are required" });
  }
  const videoId = extractVideoId(url);
  if (!videoId) return res.status(400).json({ error: "Could not extract YouTube video ID from URL" });
  const thumbnail = `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`;
  const id = randomUUID();
  const now = new Date().toISOString();
  try {
    await db.prepare(
      `INSERT INTO youtube_library (id, class_id, title, url, video_id, thumbnail_url, category, auto_approve, added_by, added_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(id, class_id, title, url, videoId, thumbnail, category, auto_approve ? 1 : 0, req.user!.name, now);
    const row = await db.prepare("SELECT * FROM youtube_library WHERE id = ?").get(id);
    res.status(201).json(row);
  } catch (e) {
    console.error('library insert error:', e);
    res.status(500).json({ error: "Failed to add video to library" });
  }
});

// DELETE /library/:id — teacher removes from library
router.delete("/library/:id", requireRole("teacher", "admin"), async (req: AuthRequest, res: Response) => {
  await ensureLibraryTable();
  try {
    await db.prepare("DELETE FROM youtube_library WHERE id = ?").run(req.params.id);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: "Failed to remove library video" });
  }
});

// POST /library/:id/pick — student picks a library video (auto-approved instantly)
router.post("/library/:id/pick", async (req: AuthRequest, res: Response) => {
  await ensureLibraryTable();
  const { student_id } = req.body;
  if (!student_id) return res.status(400).json({ error: "student_id required" });
  try {
    const lib = await db.prepare("SELECT * FROM youtube_library WHERE id = ?").get(req.params.id) as any;
    if (!lib) return res.status(404).json({ error: "Library video not found" });

    // Create an auto-approved request in youtube_requests
    const reqId = randomUUID();
    const now = new Date().toISOString();
    const fullUrl = lib.url || `https://www.youtube.com/watch?v=${lib.video_id}`;

    try {
      await db.prepare(
        `INSERT INTO youtube_requests (id, student_id, title, url, status, teacher_note, requested_at)
         VALUES (?, ?, ?, ?, 'approved', 'Auto-approved from class library', ?)`
      ).run(reqId, student_id, lib.title, fullUrl, now);
    } catch {
      // Fallback: url column may not exist in some DB versions
      await db.prepare(
        `INSERT INTO youtube_requests (id, student_id, title, status, teacher_note)
         VALUES (?, ?, ?, 'approved', 'Auto-approved from class library')`
      ).run(reqId, student_id, lib.title);
    }

    // Also update the student's approved video directly (if students table supports it)
    try {
      await db.prepare(
        `UPDATE students SET approved_video_url = ?, approved_video_title = ?, video_approved_at = ? WHERE id = ?`
      ).run(fullUrl, lib.title, now, student_id);
    } catch { /* students table schema may vary */ }

    res.json({ ok: true, videoId: lib.video_id, title: lib.title, url: fullUrl, requestId: reqId });
  } catch (e) {
    console.error('library pick error:', e);
    res.status(500).json({ error: "Failed to pick library video" });
  }
});

// GET /requests — list youtube_requests, optional ?status=pending
router.get("/requests", async (req: AuthRequest, res: Response) => {
  try {
    const { status } = req.query;
    const rows = status
      ? await db
          .prepare("SELECT * FROM youtube_requests WHERE status=? ORDER BY requested_at DESC")
          .all(status as string)
      : await db
          .prepare("SELECT * FROM youtube_requests ORDER BY requested_at DESC")
          .all();
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: "Failed to get YouTube requests" });
  }
});

// GET /requests/student/:studentId — requests for one specific student
router.get("/requests/student/:studentId", async (req: AuthRequest, res: Response) => {
  try {
    const rows = await db
      .prepare("SELECT * FROM youtube_requests WHERE student_id=? ORDER BY requested_at DESC")
      .all(req.params.studentId);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: "Failed to get student YouTube requests" });
  }
});

// POST /requests — student creates request (url is optional — teacher finds the video)
router.post("/requests", async (req: AuthRequest, res: Response) => {
  try {
    const { student_id, title, url } = req.body;
    if (!student_id || !title) {
      return res.status(400).json({ error: "student_id and title are required" });
    }

    const id = randomUUID();
    // Try with url column (may be NULL)
    try {
      await db
        .prepare("INSERT INTO youtube_requests (id, student_id, title, url) VALUES (?, ?, ?, ?)")
        .run(id, student_id, title, url ?? null);
    } catch {
      // url column might not exist in older DBs
      await db
        .prepare("INSERT INTO youtube_requests (id, student_id, title) VALUES (?, ?, ?)")
        .run(id, student_id, title);
    }

    const row = await db.prepare("SELECT * FROM youtube_requests WHERE id=?").get(id);
    res.status(201).json(row);
  } catch (err) {
    res.status(500).json({ error: "Failed to create YouTube request" });
  }
});

// PUT /requests/:id/approve — approve request
router.put("/requests/:id/approve", async (req: AuthRequest, res: Response) => {
  try {
    const { teacher_note } = req.body;
    await db
      .prepare(
        "UPDATE youtube_requests SET status='approved', teacher_note=? WHERE id=?"
      )
      .run(teacher_note ?? null, req.params.id);

    const row = await db.prepare("SELECT * FROM youtube_requests WHERE id=?").get(req.params.id);
    res.json(row);
  } catch (err) {
    res.status(500).json({ error: "Failed to approve YouTube request" });
  }
});

// PUT /requests/:id/deny — deny request
router.put("/requests/:id/deny", async (req: AuthRequest, res: Response) => {
  try {
    const { teacher_note } = req.body;
    await db
      .prepare(
        "UPDATE youtube_requests SET status='denied', teacher_note=? WHERE id=?"
      )
      .run(teacher_note ?? null, req.params.id);

    const row = await db.prepare("SELECT * FROM youtube_requests WHERE id=?").get(req.params.id);
    res.json(row);
  } catch (err) {
    res.status(500).json({ error: "Failed to deny YouTube request" });
  }
});

// GET /approved — list approved_urls
router.get("/approved", async (_req: AuthRequest, res: Response) => {
  try {
    const rows = await db
      .prepare("SELECT * FROM approved_urls ORDER BY added_at DESC")
      .all();
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: "Failed to get approved URLs" });
  }
});

// POST /approved — manually add approved URL
router.post("/approved", async (req: AuthRequest, res: Response) => {
  try {
    const { title, url, thumbnail_url, category } = req.body;
    if (!title || !url) {
      return res.status(400).json({ error: "title and url are required" });
    }

    const id = randomUUID();
    await db
      .prepare(
        "INSERT INTO approved_urls (id, title, url, thumbnail_url, category) VALUES (?, ?, ?, ?, ?)"
      )
      .run(id, title, url, thumbnail_url ?? null, category ?? null);

    const row = await db.prepare("SELECT * FROM approved_urls WHERE id=?").get(id);
    res.status(201).json(row);
  } catch (err) {
    res.status(500).json({ error: "Failed to add approved URL" });
  }
});

// DELETE /approved/:id — remove approved URL
router.delete("/approved/:id", async (req: AuthRequest, res: Response) => {
  try {
    await db.prepare("DELETE FROM approved_urls WHERE id=?").run(req.params.id);
    res.status(204).send();
  } catch (err) {
    res.status(500).json({ error: "Failed to remove approved URL" });
  }
});

export default router;
