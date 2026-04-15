import { Router, Response } from "express";
import crypto from "crypto";
import db from "../db.js";
import { AuthRequest } from "../middleware/auth.js";

const router = Router();

// Get chat history for a class
router.get("/:classId", async (req: AuthRequest, res: Response) => {
  const rows = await db.prepare(
    `SELECT cm.*, u.name as sender_name FROM chat_messages cm
     JOIN users u ON cm.sender_id = u.id
     WHERE cm.class_id = ? ORDER BY cm.created_at ASC LIMIT 200`
  ).all(req.params.classId);
  res.json(rows);
});

// Post message (also broadcast via WS in main server)
router.post("/:classId", async (req: AuthRequest, res: Response) => {
  const { text } = req.body;
  if (!text?.trim()) return res.status(400).json({ error: "Empty message" });
  const id = crypto.randomUUID();
  await db.prepare(
    "INSERT INTO chat_messages (id, class_id, sender_id, text) VALUES (?, ?, ?, ?)"
  ).run(id, req.params.classId, req.user!.id, text.trim());
  const row = await db.prepare("SELECT * FROM chat_messages WHERE id = ?").get(id);
  res.json(row);
});

export default router;
