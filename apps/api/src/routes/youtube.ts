import { Router, Response } from "express";
import { randomUUID } from "crypto";
import db from "../db.js";
import { AuthRequest } from "../middleware/auth.js";

const router = Router();

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

// POST /requests — student creates request
router.post("/requests", async (req: AuthRequest, res: Response) => {
  try {
    const { student_id, title, url } = req.body;
    if (!student_id || !title || !url) {
      return res.status(400).json({ error: "student_id, title, and url are required" });
    }

    const id = randomUUID();
    await db
      .prepare(
        "INSERT INTO youtube_requests (id, student_id, title, url) VALUES (?, ?, ?, ?)"
      )
      .run(id, student_id, title, url);

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
