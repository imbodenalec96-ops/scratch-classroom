import { Router, Response } from "express";
import { randomUUID } from "crypto";
import db from "../db.js";
import { AuthRequest } from "../middleware/auth.js";

const router = Router();

// GET /:studentId/:date — get all tasks for a student on a date
router.get("/:studentId/:date", async (req: AuthRequest, res: Response) => {
  try {
    const { studentId, date } = req.params;
    const rows = await db
      .prepare(
        `SELECT id, subject, prompt, hint, student_answer, passed, ai_feedback, assigned_at, completed_at
         FROM daily_tasks WHERE student_id=? AND date=? ORDER BY assigned_at ASC`
      )
      .all(studentId, date);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: "Failed to get tasks" });
  }
});

// POST / — create a task
router.post("/", async (req: AuthRequest, res: Response) => {
  try {
    const { student_id, date, subject, prompt, hint } = req.body;
    if (!student_id || !date || !subject || !prompt) {
      return res.status(400).json({ error: "student_id, date, subject, and prompt are required" });
    }

    const id = randomUUID();
    await db
      .prepare(
        `INSERT INTO daily_tasks (id, student_id, date, subject, prompt, hint)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(id, student_id, date, subject, prompt, hint ?? null);

    const row = await db.prepare("SELECT * FROM daily_tasks WHERE id=?").get(id);
    res.status(201).json(row);
  } catch (err) {
    res.status(500).json({ error: "Failed to create task" });
  }
});

// PUT /:id/answer — student submits answer
router.put("/:id/answer", async (req: AuthRequest, res: Response) => {
  try {
    const { student_answer } = req.body;
    if (student_answer === undefined) {
      return res.status(400).json({ error: "student_answer is required" });
    }

    await db
      .prepare(
        "UPDATE daily_tasks SET student_answer=?, completed_at=datetime('now') WHERE id=?"
      )
      .run(student_answer, req.params.id);

    const row = await db.prepare("SELECT * FROM daily_tasks WHERE id=?").get(req.params.id);
    res.json(row);
  } catch (err) {
    res.status(500).json({ error: "Failed to submit answer" });
  }
});

// PUT /:id/grade — store grading result
router.put("/:id/grade", async (req: AuthRequest, res: Response) => {
  try {
    const { passed, ai_feedback } = req.body;

    await db
      .prepare("UPDATE daily_tasks SET passed=?, ai_feedback=? WHERE id=?")
      .run(passed ?? null, ai_feedback ?? null, req.params.id);

    const row = await db.prepare("SELECT * FROM daily_tasks WHERE id=?").get(req.params.id);
    res.json(row);
  } catch (err) {
    res.status(500).json({ error: "Failed to grade task" });
  }
});

// DELETE /student/:studentId/date/:date — delete all tasks for student on date
router.delete("/student/:studentId/date/:date", async (req: AuthRequest, res: Response) => {
  try {
    const { studentId, date } = req.params;
    await db
      .prepare("DELETE FROM daily_tasks WHERE student_id=? AND date=?")
      .run(studentId, date);
    res.status(204).send();
  } catch (err) {
    res.status(500).json({ error: "Failed to delete tasks" });
  }
});

export default router;
