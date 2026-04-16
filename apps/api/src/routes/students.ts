import { Router, Response } from "express";
import { randomUUID } from "crypto";
import db from "../db.js";
import { AuthRequest } from "../middleware/auth.js";

const router = Router();

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

export default router;
