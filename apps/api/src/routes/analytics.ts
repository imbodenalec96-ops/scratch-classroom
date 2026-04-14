import { Router, Response } from "express";
import crypto from "crypto";
import db from "../db.js";
import { AuthRequest } from "../middleware/auth.js";
import { requireRole } from "../middleware/rbac.js";

const router = Router();

// Track analytics event
router.post("/track", async (req: AuthRequest, res: Response) => {
  const { projectId, timeSpent, blocksUsed, errorsMade } = req.body;
  const existing = db.prepare(
    "SELECT id FROM analytics WHERE project_id = ? AND user_id = ?"
  ).get(projectId, req.user!.id) as any;

  if (existing) {
    db.prepare(
      `UPDATE analytics SET time_spent = time_spent + ?, blocks_used = ?, errors_made = errors_made + ?, last_active = datetime('now')
       WHERE project_id = ? AND user_id = ?`
    ).run(timeSpent || 0, blocksUsed || 0, errorsMade || 0, projectId, req.user!.id);
    const row = db.prepare("SELECT * FROM analytics WHERE id = ?").get(existing.id);
    return res.json(row);
  }

  const id = crypto.randomUUID();
  db.prepare(
    `INSERT INTO analytics (id, project_id, user_id, time_spent, blocks_used, errors_made)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(id, projectId, req.user!.id, timeSpent || 0, blocksUsed || 0, errorsMade || 0);
  const row = db.prepare("SELECT * FROM analytics WHERE id = ?").get(id);
  res.json(row);
});

// Get analytics for class (teacher)
router.get("/class/:classId", requireRole("teacher", "admin"), async (req: AuthRequest, res: Response) => {
  const rows = db.prepare(
    `SELECT a.*, u.name as student_name, p.title as project_title
     FROM analytics a
     JOIN users u ON a.user_id = u.id
     JOIN projects p ON a.project_id = p.id
     JOIN class_members cm ON cm.user_id = u.id AND cm.class_id = ?
     ORDER BY a.last_active DESC`
  ).all(req.params.classId);
  res.json(rows);
});

// Get my analytics
router.get("/mine", async (req: AuthRequest, res: Response) => {
  const rows = db.prepare(
    `SELECT a.*, p.title as project_title FROM analytics a
     JOIN projects p ON a.project_id = p.id
     WHERE a.user_id = ? ORDER BY a.last_active DESC`
  ).all(req.user!.id);
  res.json(rows);
});

// Export class report (CSV)
router.get("/class/:classId/export", requireRole("teacher", "admin"), async (req: AuthRequest, res: Response) => {
  const rows = db.prepare(
    `SELECT u.name, u.email, COALESCE(SUM(a.time_spent),0) as total_time,
            COALESCE(SUM(a.blocks_used),0) as total_blocks,
            COALESCE(SUM(a.errors_made),0) as total_errors,
            COUNT(DISTINCT a.project_id) as project_count
     FROM users u
     JOIN class_members cm ON cm.user_id = u.id AND cm.class_id = ?
     LEFT JOIN analytics a ON a.user_id = u.id
     GROUP BY u.id ORDER BY u.name`
  ).all(req.params.classId) as any[];
  const header = "Name,Email,Time Spent (s),Blocks Used,Errors,Projects\n";
  const csvRows = rows.map((r) =>
    `"${r.name}","${r.email}",${r.total_time},${r.total_blocks},${r.total_errors},${r.project_count}`
  ).join("\n");
  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", "attachment; filename=report.csv");
  res.send(header + csvRows);
});

export default router;
