import { Router, Request, Response } from "express";
import db from "../db.js";

const router = Router();

// Public: class info for TV board — no auth required
router.get("/classes/:id", async (req: Request, res: Response) => {
  try {
    const row = await db.prepare("SELECT id, name FROM classes WHERE id = ?").get(req.params.id) as any;
    if (!row) return res.status(404).json({ error: "Class not found" });
    res.json(row);
  } catch {
    res.status(500).json({ error: "Failed to load class" });
  }
});

// Public: schedule for TV board — no auth required
router.get("/classes/:id/schedule", async (req: Request, res: Response) => {
  try {
    const rows = await db.prepare(
      "SELECT * FROM class_schedule WHERE class_id = ? ORDER BY block_number ASC"
    ).all(req.params.id) as any[];
    res.json(rows);
  } catch {
    res.status(500).json({ error: "Failed to load schedule" });
  }
});

export default router;
