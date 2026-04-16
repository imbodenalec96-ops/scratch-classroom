import { Router, Response } from "express";
import { randomUUID } from "crypto";
import db from "../db.js";
import { AuthRequest } from "../middleware/auth.js";

const router = Router();

// GET /config — get break_config row (id=1)
router.get("/config", async (_req: AuthRequest, res: Response) => {
  try {
    const row = await db.prepare("SELECT * FROM break_config WHERE id=1").get();
    res.json(row);
  } catch (err) {
    res.status(500).json({ error: "Failed to get break config" });
  }
});

// PUT /config — update break_config (partial)
router.put("/config", async (req: AuthRequest, res: Response) => {
  try {
    const existing = await db.prepare("SELECT * FROM break_config WHERE id=1").get();
    if (!existing) return res.status(404).json({ error: "Break config not found" });

    const {
      work_minutes_before_first_break = existing.work_minutes_before_first_break,
      work_minutes_before_next_break = existing.work_minutes_before_next_break,
      break_duration_minutes = existing.break_duration_minutes,
      calming_corner_enabled = existing.calming_corner_enabled,
      break_system_enabled = existing.break_system_enabled,
    } = req.body;

    await db
      .prepare(
        `UPDATE break_config SET
          work_minutes_before_first_break=?,
          work_minutes_before_next_break=?,
          break_duration_minutes=?,
          calming_corner_enabled=?,
          break_system_enabled=?
         WHERE id=1`
      )
      .run(
        work_minutes_before_first_break,
        work_minutes_before_next_break,
        break_duration_minutes,
        calming_corner_enabled,
        break_system_enabled
      );

    const row = await db.prepare("SELECT * FROM break_config WHERE id=1").get();
    res.json(row);
  } catch (err) {
    res.status(500).json({ error: "Failed to update break config" });
  }
});

// GET /games — get break_game_selections ordered by position
router.get("/games", async (_req: AuthRequest, res: Response) => {
  try {
    const rows = await db
      .prepare("SELECT * FROM break_game_selections ORDER BY position ASC")
      .all();
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: "Failed to get break games" });
  }
});

// PUT /games — replace game selections
router.put("/games", async (req: AuthRequest, res: Response) => {
  try {
    const { games } = req.body as { games: { game_id: string; position: number }[] };
    if (!Array.isArray(games)) {
      return res.status(400).json({ error: "games must be an array" });
    }

    await db.prepare("DELETE FROM break_game_selections").run();

    for (const g of games) {
      await db
        .prepare("INSERT INTO break_game_selections (game_id, position) VALUES (?, ?)")
        .run(g.game_id, g.position);
    }

    const rows = await db
      .prepare("SELECT * FROM break_game_selections ORDER BY position ASC")
      .all();
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: "Failed to update break games" });
  }
});

// POST /log — log a break
router.post("/log", async (req: AuthRequest, res: Response) => {
  try {
    const { student_id, date, break_start, break_end, option_chosen, work_minutes_before } =
      req.body;

    if (!student_id || !date) {
      return res.status(400).json({ error: "student_id and date are required" });
    }

    const id = randomUUID();
    await db
      .prepare(
        `INSERT INTO break_log (id, student_id, date, break_start, break_end, option_chosen, work_minutes_before)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        id,
        student_id,
        date,
        break_start ?? null,
        break_end ?? null,
        option_chosen ?? null,
        work_minutes_before ?? null
      );

    const row = await db.prepare("SELECT * FROM break_log WHERE id=?").get(id);
    res.status(201).json(row);
  } catch (err) {
    res.status(500).json({ error: "Failed to log break" });
  }
});

// GET /log — list break logs, supports ?student_id=X&date=Y
router.get("/log", async (req: AuthRequest, res: Response) => {
  try {
    const conditions: string[] = [];
    const params: string[] = [];

    if (req.query.student_id) {
      conditions.push("student_id=?");
      params.push(req.query.student_id as string);
    }
    if (req.query.date) {
      conditions.push("date=?");
      params.push(req.query.date as string);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const rows = await db
      .prepare(`SELECT * FROM break_log ${where} ORDER BY date DESC, break_start DESC`)
      .all(...params);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: "Failed to get break log" });
  }
});

export default router;
