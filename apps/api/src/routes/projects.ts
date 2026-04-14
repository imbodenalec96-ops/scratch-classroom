import { Router, Response } from "express";
import crypto from "crypto";
import db from "../db.js";
import { AuthRequest } from "../middleware/auth.js";

const router = Router();

// Create project
router.post("/", async (req: AuthRequest, res: Response) => {
  const { title, mode, data } = req.body;
  const id = crypto.randomUUID();
  db.prepare(
    "INSERT INTO projects (id, user_id, title, mode, data) VALUES (?, ?, ?, ?, ?)"
  ).run(id, req.user!.id, title || "Untitled", mode || "2d", JSON.stringify(data || {}));
  const row = db.prepare("SELECT * FROM projects WHERE id = ?").get(id) as any;
  row.data = JSON.parse(row.data);
  res.json(row);
});

// List my projects
router.get("/", async (req: AuthRequest, res: Response) => {
  const rows = db.prepare(
    "SELECT id, title, mode, version, created_at, updated_at FROM projects WHERE user_id = ? ORDER BY updated_at DESC"
  ).all(req.user!.id);
  res.json(rows);
});

// Get project
router.get("/:id", async (req: AuthRequest, res: Response) => {
  const row = db.prepare("SELECT * FROM projects WHERE id = ?").get(req.params.id) as any;
  if (!row) return res.status(404).json({ error: "Not found" });
  row.data = JSON.parse(row.data);
  res.json(row);
});

// Save project (creates version snapshot)
router.put("/:id", async (req: AuthRequest, res: Response) => {
  const { data, title, mode } = req.body;
  const p = db.prepare("SELECT * FROM projects WHERE id = ?").get(req.params.id) as any;
  if (!p) return res.status(404).json({ error: "Not found" });

  // Save version history
  db.prepare(
    "INSERT INTO project_versions (id, project_id, version, data) VALUES (?, ?, ?, ?)"
  ).run(crypto.randomUUID(), p.id, p.version, p.data);

  db.prepare(
    `UPDATE projects SET data = ?, title = COALESCE(?, title), mode = COALESCE(?, mode),
     version = version + 1, updated_at = datetime('now') WHERE id = ?`
  ).run(JSON.stringify(data), title, mode, req.params.id);

  const row = db.prepare("SELECT * FROM projects WHERE id = ?").get(req.params.id) as any;
  row.data = JSON.parse(row.data);
  res.json(row);
});

// Get version history
router.get("/:id/versions", async (req: AuthRequest, res: Response) => {
  const rows = db.prepare(
    "SELECT id, version, saved_at FROM project_versions WHERE project_id = ? ORDER BY version DESC"
  ).all(req.params.id);
  res.json(rows);
});

// Get specific version
router.get("/:id/versions/:vid", async (req: AuthRequest, res: Response) => {
  const row = db.prepare(
    "SELECT * FROM project_versions WHERE id = ? AND project_id = ?"
  ).get(req.params.vid, req.params.id) as any;
  if (!row) return res.status(404).json({ error: "Not found" });
  row.data = JSON.parse(row.data);
  res.json(row);
});

// Delete project
router.delete("/:id", async (req: AuthRequest, res: Response) => {
  db.prepare("DELETE FROM projects WHERE id = ? AND user_id = ?").run(req.params.id, req.user!.id);
  res.json({ deleted: true });
});

export default router;
