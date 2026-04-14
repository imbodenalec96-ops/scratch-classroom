import { Router, Response } from "express";
import crypto from "crypto";
import db from "../db.js";
import { AuthRequest } from "../middleware/auth.js";
import { requireRole } from "../middleware/rbac.js";
import type { AutoGradeResult } from "@scratch/shared";

const router = Router();

// Submit assignment
router.post("/", async (req: AuthRequest, res: Response) => {
  const { assignmentId, projectId } = req.body;

  // Auto-grade: check project has blocks
  let autoGrade: AutoGradeResult | null = null;
  const proj = db.prepare("SELECT data FROM projects WHERE id = ?").get(projectId) as any;
  if (proj) {
    const data = typeof proj.data === "string" ? JSON.parse(proj.data) : proj.data;
    const sprites = data.sprites || [];
    const totalBlocks = sprites.reduce((sum: number, s: any) => sum + (s.blocks?.length || 0), 0);
    const hasEvents = sprites.some((s: any) => s.blocks?.some((b: any) => b.category === "events"));
    const hasControl = sprites.some((s: any) => s.blocks?.some((b: any) => b.category === "control"));

    // Load rubric
    const asgn = db.prepare("SELECT rubric FROM assignments WHERE id = ?").get(assignmentId) as any;
    const rubric = asgn ? JSON.parse(asgn.rubric || "[]") : [];

    const checks = [
      { label: "Has blocks", passed: totalBlocks > 0, detail: `${totalBlocks} blocks used` },
      { label: "Has event handlers", passed: hasEvents, detail: hasEvents ? "Found event blocks" : "No event blocks" },
      { label: "Uses control flow", passed: hasControl, detail: hasControl ? "Found control blocks" : "No control blocks" },
    ];
    const score = Math.round((checks.filter((c) => c.passed).length / checks.length) * 100);
    autoGrade = { score, checks };
  }

  const id = crypto.randomUUID();
  db.prepare(
    `INSERT INTO submissions (id, assignment_id, student_id, project_id, auto_grade_result)
     VALUES (?, ?, ?, ?, ?)`
  ).run(id, assignmentId, req.user!.id, projectId, autoGrade ? JSON.stringify(autoGrade) : null);
  const row = db.prepare("SELECT * FROM submissions WHERE id = ?").get(id) as any;
  if (row?.auto_grade_result) row.auto_grade_result = JSON.parse(row.auto_grade_result);
  res.json(row);
});

// List submissions for assignment (teacher)
router.get("/assignment/:assignmentId", requireRole("teacher", "admin"), async (req: AuthRequest, res: Response) => {
  const rows = db.prepare(
    `SELECT s.*, u.name as student_name FROM submissions s
     JOIN users u ON s.student_id = u.id
     WHERE s.assignment_id = ? ORDER BY s.submitted_at DESC`
  ).all(req.params.assignmentId) as any[];
  rows.forEach((r) => { if (r.auto_grade_result) r.auto_grade_result = JSON.parse(r.auto_grade_result); });
  res.json(rows);
});

// My submissions
router.get("/mine", async (req: AuthRequest, res: Response) => {
  const rows = db.prepare(
    `SELECT s.*, a.title as assignment_title FROM submissions s
     JOIN assignments a ON s.assignment_id = a.id
     WHERE s.student_id = ? ORDER BY s.submitted_at DESC`
  ).all(req.user!.id) as any[];
  rows.forEach((r) => { if (r.auto_grade_result) r.auto_grade_result = JSON.parse(r.auto_grade_result); });
  res.json(rows);
});

// Grade submission (teacher)
router.put("/:id/grade", requireRole("teacher", "admin"), async (req: AuthRequest, res: Response) => {
  const { grade, feedback } = req.body;
  db.prepare("UPDATE submissions SET grade = ?, feedback = ? WHERE id = ?").run(grade, feedback, req.params.id);
  const row = db.prepare("SELECT * FROM submissions WHERE id = ?").get(req.params.id) as any;
  if (row?.auto_grade_result) row.auto_grade_result = JSON.parse(row.auto_grade_result);
  res.json(row);
});

export default router;
