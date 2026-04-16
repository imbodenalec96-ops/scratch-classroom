import { Router, Response } from "express";
import crypto from "crypto";
import db from "../db.js";
import { AuthRequest } from "../middleware/auth.js";
import { requireRole } from "../middleware/rbac.js";

const router = Router();

// Create project
router.post("/", async (req: AuthRequest, res: Response) => {
  const { title, mode, data } = req.body;
  const id = crypto.randomUUID();
  await db.prepare(
    "INSERT INTO projects (id, user_id, title, mode, data) VALUES (?, ?, ?, ?, ?)"
  ).run(id, req.user!.id, title || "Untitled", mode || "2d", JSON.stringify(data || {}));
  const row = await db.prepare("SELECT * FROM projects WHERE id = ?").get(id) as any;
  row.data = JSON.parse(row.data);
  res.json(row);
});

// List my projects
router.get("/", async (req: AuthRequest, res: Response) => {
  const rows = await db.prepare(
    "SELECT id, title, mode, version, created_at, updated_at FROM projects WHERE user_id = ? ORDER BY updated_at DESC"
  ).all(req.user!.id);
  res.json(rows);
});

// Admin: list all projects
router.get("/all", requireRole("admin"), async (_req: AuthRequest, res: Response) => {
  const rows = await db.prepare(
    `SELECT p.id, p.title, p.mode, p.version, p.created_at, p.updated_at,
            p.user_id, u.name as owner_name, u.email as owner_email
     FROM projects p
     JOIN users u ON u.id = p.user_id
     ORDER BY p.updated_at DESC`
  ).all();
  res.json(rows);
});

// Teacher/Admin: latest project per student in a class
router.get("/class/:classId/student-projects", requireRole("teacher", "admin"), async (req: AuthRequest, res: Response) => {
  const { classId } = req.params;

  if (req.user!.role === "teacher") {
    const owns = await db.prepare("SELECT id FROM classes WHERE id = ? AND teacher_id = ?").get(classId, req.user!.id) as any;
    if (!owns) return res.status(403).json({ error: "Forbidden" });
  }

  const rows = await db.prepare(
    `SELECT p.id, p.user_id, p.title, p.mode, p.version, p.updated_at, p.data,
            u.name as student_name, u.email as student_email
     FROM projects p
     JOIN class_members cm ON cm.user_id = p.user_id AND cm.class_id = ?
     JOIN users u ON u.id = p.user_id
     ORDER BY p.user_id, p.updated_at DESC`
  ).all(classId) as any[];

  const latestByStudent = new Map<string, any>();
  for (const row of rows) {
    if (latestByStudent.has(row.user_id)) continue;
    let blockCount = 0;
    let previewUrl: string | null = null;
    try {
      const data = typeof row.data === "string" ? JSON.parse(row.data) : row.data;
      const sprites = Array.isArray(data?.sprites) ? data.sprites : [];
      blockCount = sprites.reduce((sum: number, s: any) => sum + (Array.isArray(s?.blocks) ? s.blocks.length : 0), 0);
      const firstSprite = sprites[0];
      const costumes = Array.isArray(firstSprite?.costumes) ? firstSprite.costumes : [];
      const idx = Math.max(0, Math.min(costumes.length - 1, Number(firstSprite?.costumeIndex ?? 0)));
      previewUrl = costumes[idx]?.url || costumes[0]?.url || null;
    } catch {
      blockCount = 0;
      previewUrl = null;
    }
    latestByStudent.set(row.user_id, {
      id: row.id,
      userId: row.user_id,
      studentName: row.student_name,
      studentEmail: row.student_email,
      title: row.title,
      mode: row.mode,
      version: row.version,
      updatedAt: row.updated_at,
      blockCount,
      previewUrl,
    });
  }

  res.json([...latestByStudent.values()]);
});

// Get project
router.get("/:id", async (req: AuthRequest, res: Response) => {
  const row = await db.prepare("SELECT * FROM projects WHERE id = ?").get(req.params.id) as any;
  if (!row) return res.status(404).json({ error: "Not found" });
  row.data = JSON.parse(row.data);
  res.json(row);
});

// Save project (creates version snapshot)
router.put("/:id", async (req: AuthRequest, res: Response) => {
  const { data, title, mode } = req.body;
  const p = await db.prepare("SELECT * FROM projects WHERE id = ?").get(req.params.id) as any;
  if (!p) return res.status(404).json({ error: "Not found" });

  // Save version history
  await db.prepare(
    "INSERT INTO project_versions (id, project_id, version, data) VALUES (?, ?, ?, ?)"
  ).run(crypto.randomUUID(), p.id, p.version, p.data);

  await db.prepare(
    `UPDATE projects SET data = ?, title = COALESCE(?, title), mode = COALESCE(?, mode),
     version = version + 1, updated_at = datetime('now') WHERE id = ?`
  ).run(JSON.stringify(data), title, mode, req.params.id);

  const row = await db.prepare("SELECT * FROM projects WHERE id = ?").get(req.params.id) as any;
  row.data = JSON.parse(row.data);
  res.json(row);
});

// Get version history
router.get("/:id/versions", async (req: AuthRequest, res: Response) => {
  const rows = await db.prepare(
    "SELECT id, version, saved_at FROM project_versions WHERE project_id = ? ORDER BY version DESC"
  ).all(req.params.id);
  res.json(rows);
});

// Get specific version
router.get("/:id/versions/:vid", async (req: AuthRequest, res: Response) => {
  const row = await db.prepare(
    "SELECT * FROM project_versions WHERE id = ? AND project_id = ?"
  ).get(req.params.vid, req.params.id) as any;
  if (!row) return res.status(404).json({ error: "Not found" });
  row.data = JSON.parse(row.data);
  res.json(row);
});

// Delete project
router.delete("/:id", async (req: AuthRequest, res: Response) => {
  if (req.user!.role === "admin") {
    await db.prepare("DELETE FROM projects WHERE id = ?").run(req.params.id);
  } else {
    await db.prepare("DELETE FROM projects WHERE id = ? AND user_id = ?").run(req.params.id, req.user!.id);
  }
  res.json({ deleted: true });
});

export default router;
