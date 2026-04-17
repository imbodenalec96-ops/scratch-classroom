import { Router, Response } from "express";
import crypto from "crypto";
import db from "../db.js";
import { AuthRequest } from "../middleware/auth.js";
import { requireRole } from "../middleware/rbac.js";

const router = Router();

// Ensure grade-target columns exist on the assignments table (idempotent).
let gradeColsReady = false;
async function ensureGradeCols() {
  if (gradeColsReady) return;
  for (const col of [
    "ALTER TABLE assignments ADD COLUMN target_grade_min INTEGER",
    "ALTER TABLE assignments ADD COLUMN target_grade_max INTEGER",
    "ALTER TABLE assignments ADD COLUMN target_subject TEXT",
  ]) {
    try { await db.exec(col); } catch { /* column already exists */ }
  }
  gradeColsReady = true;
}

// Create assignment (accepts optional targetGradeMin / targetGradeMax / targetSubject)
router.post("/", requireRole("teacher", "admin"), async (req: AuthRequest, res: Response) => {
  const { classId, title, description, dueDate, rubric, starterProjectId, content, scheduledDate,
          targetGradeMin, targetGradeMax, targetSubject } = req.body;
  const id = crypto.randomUUID();
  await ensureGradeCols();
  const tMin = targetGradeMin != null ? Number(targetGradeMin) : null;
  const tMax = targetGradeMax != null ? Number(targetGradeMax) : (tMin != null ? tMin : null);
  const tSub = targetSubject || null;

  const doInsert = async () => db.prepare(
    `INSERT INTO assignments (id, class_id, teacher_id, title, description, due_date, rubric, starter_project_id, content, scheduled_date, target_grade_min, target_grade_max, target_subject)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(id, classId, req.user!.id, title, description, dueDate, JSON.stringify(rubric || []), starterProjectId, content ?? null, scheduledDate ?? null, tMin, tMax, tSub);

  try {
    await doInsert();
  } catch {
    try { await db.exec("ALTER TABLE assignments ADD COLUMN content TEXT"); } catch {}
    try { await db.exec("ALTER TABLE assignments ADD COLUMN scheduled_date TEXT"); } catch {}
    await doInsert();
  }
  const row = await db.prepare("SELECT * FROM assignments WHERE id = ?").get(id) as any;
  row.rubric = JSON.parse(row.rubric || "[]");
  res.json(row);
});

// Create weekly assignments (Mon-Fri)
router.post("/weekly", requireRole("teacher", "admin"), async (req: AuthRequest, res: Response) => {
  const { classId, title, subject, grade, description, rubric, content } = req.body;

  // Get upcoming Mon-Fri dates
  const today = new Date();
  const day = today.getDay(); // 0=Sun, 1=Mon, ...
  const daysUntilMonday = day === 0 ? 1 : day === 1 ? 0 : 8 - day; // next or current Monday
  const monday = new Date(today);
  monday.setDate(today.getDate() + (day === 1 ? 0 : daysUntilMonday));

  const created = [];
  const dayNames = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];

  for (let i = 0; i < 5; i++) {
    const schedDate = new Date(monday);
    schedDate.setDate(monday.getDate() + i);
    const dateStr = schedDate.toISOString().slice(0, 10);
    const id = crypto.randomUUID();

    try {
      await db.prepare(
        `INSERT INTO assignments (id, class_id, teacher_id, title, description, due_date, rubric, content, scheduled_date)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        id, classId, req.user!.id,
        `${title} — ${dayNames[i]}`,
        description,
        dateStr,
        JSON.stringify(rubric || []),
        content ?? null,
        dateStr
      );
      created.push({ id, day: dayNames[i], date: dateStr });
    } catch {
      // try adding column first
      try { await db.exec("ALTER TABLE assignments ADD COLUMN scheduled_date TEXT"); } catch {}
      try { await db.exec("ALTER TABLE assignments ADD COLUMN content TEXT"); } catch {}
      try {
        await db.prepare(
          `INSERT INTO assignments (id, class_id, teacher_id, title, description, due_date, rubric, content, scheduled_date)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).run(id, classId, req.user!.id, `${title} — ${dayNames[i]}`, description, dateStr, JSON.stringify(rubric || []), content ?? null, dateStr);
        created.push({ id, day: dayNames[i], date: dateStr });
      } catch { /* skip */ }
    }
  }

  res.json({ created: created.length, assignments: created });
});

// Get all pending (unsubmitted) assignments for current student in a class.
// Honors per-assignment grade targeting:
//   - If target_grade_min IS NULL → assignment shows to everyone in class
//   - Else: student's grade for target_subject must fall in [min, max]
router.get("/class/:classId/pending", async (req: AuthRequest, res: Response) => {
  const userId = req.user!.id;
  const classId = req.params.classId;
  await ensureGradeCols();
  try {
    const rows = await db.prepare(`
      SELECT a.* FROM assignments a
      LEFT JOIN submissions s ON s.assignment_id = a.id AND s.student_id = ?
      WHERE a.class_id = ? AND s.id IS NULL
      ORDER BY a.created_at ASC
    `).all(userId, classId) as any[];

    // Look up this student's grade levels once
    let studentGrades: any = null;
    try {
      studentGrades = await db.prepare(
        "SELECT reading_grade, math_grade, writing_grade FROM user_grade_levels WHERE user_id = ?"
      ).get(userId);
    } catch { /* grades table may not exist yet */ }
    const gradeFor = (subject: string | null): number => {
      if (!studentGrades) return 3; // reasonable default
      const col = subject === 'math' ? 'math_grade'
                : subject === 'writing' ? 'writing_grade'
                : 'reading_grade';
      return Number(studentGrades[col] ?? 3);
    };

    const filtered = rows.filter((r: any) => {
      r.rubric = JSON.parse(r.rubric || "[]");
      // If no target set, assignment is for everyone
      if (r.target_grade_min == null) return true;
      const tMin = Number(r.target_grade_min);
      const tMax = r.target_grade_max != null ? Number(r.target_grade_max) : tMin;
      const g = gradeFor(r.target_subject);
      return g >= tMin && g <= tMax;
    });

    res.json(filtered);
  } catch (e) {
    console.error('pending assignments error:', e);
    res.json([]);
  }
});

// Get today's assignment for a class
router.get("/class/:classId/today", async (req: AuthRequest, res: Response) => {
  const today = new Date().toISOString().slice(0, 10);
  try {
    const rows = await db.prepare(
      `SELECT * FROM assignments WHERE class_id = ? AND (scheduled_date = ? OR (scheduled_date IS NULL AND date(due_date) = ?)) ORDER BY created_at DESC LIMIT 1`
    ).all(req.params.classId, today, today) as any[];
    rows.forEach((r) => { r.rubric = JSON.parse(r.rubric || "[]"); });
    res.json(rows);
  } catch {
    res.json([]);
  }
});

// List assignments for a class
router.get("/class/:classId", async (req: AuthRequest, res: Response) => {
  const rows = await db.prepare(
    "SELECT * FROM assignments WHERE class_id = ? ORDER BY due_date ASC"
  ).all(req.params.classId) as any[];
  rows.forEach((r) => { r.rubric = JSON.parse(r.rubric || "[]"); });
  res.json(rows);
});

// Get single assignment
router.get("/:id", async (req: AuthRequest, res: Response) => {
  const row = await db.prepare("SELECT * FROM assignments WHERE id = ?").get(req.params.id) as any;
  if (!row) return res.status(404).json({ error: "Not found" });
  row.rubric = JSON.parse(row.rubric || "[]");
  res.json(row);
});

// Update assignment
router.put("/:id", requireRole("teacher", "admin"), async (req: AuthRequest, res: Response) => {
  const { title, description, dueDate, rubric } = req.body;
  await db.prepare(
    `UPDATE assignments SET title = COALESCE(?, title), description = COALESCE(?, description),
     due_date = COALESCE(?, due_date), rubric = COALESCE(?, rubric)
     WHERE id = ? AND teacher_id = ?`
  ).run(title, description, dueDate, rubric ? JSON.stringify(rubric) : null, req.params.id, req.user!.id);
  const row = await db.prepare("SELECT * FROM assignments WHERE id = ?").get(req.params.id) as any;
  if (row) row.rubric = JSON.parse(row.rubric || "[]");
  res.json(row);
});

// Delete assignment
router.delete("/:id", requireRole("teacher", "admin"), async (req: AuthRequest, res: Response) => {
  await db.prepare("DELETE FROM assignments WHERE id = ? AND teacher_id = ?").run(req.params.id, req.user!.id);
  res.json({ deleted: true });
});

export default router;
