import { Router, Response } from "express";
import { randomUUID } from "crypto";
import db from "../db.js";
import { AuthRequest } from "../middleware/auth.js";

const router = Router();

// GET /library — list worksheet_library, supports ?subject=X&grade=N
router.get("/library", async (req: AuthRequest, res: Response) => {
  try {
    const conditions: string[] = [];
    const params: (string | number)[] = [];

    if (req.query.subject) {
      conditions.push("subject=?");
      params.push(req.query.subject as string);
    }
    if (req.query.grade) {
      const grade = Number(req.query.grade);
      conditions.push("grade_min<=? AND grade_max>=?");
      params.push(grade, grade);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const rows = await db
      .prepare(`SELECT * FROM worksheet_library ${where} ORDER BY added_at DESC`)
      .all(...params);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: "Failed to get worksheet library" });
  }
});

// POST /library — add worksheet
router.post("/library", async (req: AuthRequest, res: Response) => {
  try {
    const {
      title,
      subject,
      grade_min = 1,
      grade_max = 6,
      source_url,
      file_path,
      source_site,
    } = req.body;

    if (!title || !subject) {
      return res.status(400).json({ error: "title and subject are required" });
    }

    const id = randomUUID();
    await db
      .prepare(
        `INSERT INTO worksheet_library (id, title, subject, grade_min, grade_max, source_url, file_path, source_site)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(id, title, subject, grade_min, grade_max, source_url ?? null, file_path ?? null, source_site ?? null);

    const row = await db.prepare("SELECT * FROM worksheet_library WHERE id=?").get(id);
    res.status(201).json(row);
  } catch (err) {
    res.status(500).json({ error: "Failed to add worksheet" });
  }
});

// DELETE /library/:id — delete from library
router.delete("/library/:id", async (req: AuthRequest, res: Response) => {
  try {
    await db.prepare("DELETE FROM worksheet_library WHERE id=?").run(req.params.id);
    res.status(204).send();
  } catch (err) {
    res.status(500).json({ error: "Failed to delete worksheet" });
  }
});

// GET /assignments — list assignments joined with library and student, supports ?student_id=X&date=Y
router.get("/assignments", async (req: AuthRequest, res: Response) => {
  try {
    const conditions: string[] = [];
    const params: string[] = [];

    if (req.query.student_id) {
      conditions.push("wa.student_id=?");
      params.push(req.query.student_id as string);
    }
    if (req.query.date) {
      conditions.push("wa.assigned_date=?");
      params.push(req.query.date as string);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const rows = await db
      .prepare(
        `SELECT wa.*, wl.title AS worksheet_title, wl.subject, wl.grade_min, wl.grade_max,
                wl.source_url, wl.file_path, wl.source_site,
                s.name AS student_name, s.avatar_emoji
         FROM worksheet_assignments wa
         JOIN worksheet_library wl ON wl.id = wa.worksheet_id
         JOIN students s ON s.id = wa.student_id
         ${where}
         ORDER BY wa.assigned_date DESC`
      )
      .all(...params);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: "Failed to get worksheet assignments" });
  }
});

// POST /assignments — assign worksheet
router.post("/assignments", async (req: AuthRequest, res: Response) => {
  try {
    const { worksheet_id, student_id, assigned_date, due_date, instructions } = req.body;

    if (!worksheet_id || !student_id || !assigned_date) {
      return res.status(400).json({ error: "worksheet_id, student_id, and assigned_date are required" });
    }

    const id = randomUUID();
    await db
      .prepare(
        `INSERT INTO worksheet_assignments (id, worksheet_id, student_id, assigned_date, due_date, instructions)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(id, worksheet_id, student_id, assigned_date, due_date ?? null, instructions ?? null);

    const row = await db
      .prepare(
        `SELECT wa.*, wl.title AS worksheet_title, wl.subject
         FROM worksheet_assignments wa
         JOIN worksheet_library wl ON wl.id = wa.worksheet_id
         WHERE wa.id=?`
      )
      .get(id);
    res.status(201).json(row);
  } catch (err) {
    res.status(500).json({ error: "Failed to assign worksheet" });
  }
});

// PUT /assignments/:id/complete — mark complete
router.put("/assignments/:id/complete", async (req: AuthRequest, res: Response) => {
  try {
    await db
      .prepare(
        "UPDATE worksheet_assignments SET completed=1, completed_at=datetime('now') WHERE id=?"
      )
      .run(req.params.id);

    const row = await db
      .prepare("SELECT * FROM worksheet_assignments WHERE id=?")
      .get(req.params.id);
    res.json(row);
  } catch (err) {
    res.status(500).json({ error: "Failed to complete worksheet assignment" });
  }
});

// DELETE /assignments/:id — delete assignment
router.delete("/assignments/:id", async (req: AuthRequest, res: Response) => {
  try {
    await db.prepare("DELETE FROM worksheet_assignments WHERE id=?").run(req.params.id);
    res.status(204).send();
  } catch (err) {
    res.status(500).json({ error: "Failed to delete worksheet assignment" });
  }
});

export default router;
