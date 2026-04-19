import { Router, Response } from "express";
import crypto from "crypto";
import db from "../db.js";
import { AuthRequest } from "../middleware/auth.js";
import { requireRole } from "../middleware/rbac.js";

const router = Router();

// Idempotent migration: extend quizzes with grade targeting, per-student
// delivery, scheduled_date, and rich customization fields — mirrors the
// assignments schema so quizzes can reach students the same way.
let quizColsReady = false;
let quizColsInFlight: Promise<void> | null = null;
async function ensureQuizCols() {
  if (quizColsReady) return;
  if (quizColsInFlight) return quizColsInFlight;
  quizColsInFlight = (async () => {
    for (const col of [
      "ALTER TABLE quizzes ADD COLUMN target_grade_min INTEGER",
      "ALTER TABLE quizzes ADD COLUMN target_grade_max INTEGER",
      "ALTER TABLE quizzes ADD COLUMN target_subject TEXT",
      "ALTER TABLE quizzes ADD COLUMN student_id TEXT",
      "ALTER TABLE quizzes ADD COLUMN scheduled_date TEXT",
      "ALTER TABLE quizzes ADD COLUMN teacher_notes TEXT",
      "ALTER TABLE quizzes ADD COLUMN question_count INTEGER",
      "ALTER TABLE quizzes ADD COLUMN estimated_minutes INTEGER",
      "ALTER TABLE quizzes ADD COLUMN focus_keywords TEXT",
      "ALTER TABLE quizzes ADD COLUMN learning_objective TEXT",
      "ALTER TABLE quizzes ADD COLUMN hints_allowed INTEGER",
      "ALTER TABLE quizzes ADD COLUMN question_type TEXT",
    ]) {
      try { await db.exec(col); } catch { /* column already exists */ }
    }
    quizColsReady = true;
  })();
  try { await quizColsInFlight; } finally { quizColsInFlight = null; }
}

// Create quiz
router.post("/", requireRole("teacher", "admin"), async (req: AuthRequest, res: Response) => {
  await ensureQuizCols();
  const {
    classId, title, questions,
    targetGradeMin, targetGradeMax, targetSubject,
    studentId, scheduledDate, teacherNotes,
    questionCount, estimatedMinutes, focusKeywords,
    learningObjective, hintsAllowed, questionType,
  } = req.body;
  const id = crypto.randomUUID();
  await db.prepare(
    `INSERT INTO quizzes (
       id, class_id, teacher_id, title, questions,
       target_grade_min, target_grade_max, target_subject,
       student_id, scheduled_date, teacher_notes,
       question_count, estimated_minutes, focus_keywords,
       learning_objective, hints_allowed, question_type
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id, classId, req.user!.id, title, JSON.stringify(questions || []),
    targetGradeMin ?? null, targetGradeMax ?? null, targetSubject ?? null,
    studentId ?? null, scheduledDate ?? null, teacherNotes ?? null,
    questionCount ?? null, estimatedMinutes ?? null, focusKeywords ?? null,
    learningObjective ?? null, hintsAllowed ?? null, questionType ?? null,
  );
  const row = await db.prepare("SELECT * FROM quizzes WHERE id = ?").get(id) as any;
  row.questions = JSON.parse(row.questions);
  res.json(row);
});

// List quizzes for class
router.get("/class/:classId", async (req: AuthRequest, res: Response) => {
  const rows = await db.prepare(
    "SELECT * FROM quizzes WHERE class_id = ? ORDER BY created_at DESC"
  ).all(req.params.classId) as any[];
  rows.forEach((r) => { r.questions = JSON.parse(r.questions); });
  res.json(rows);
});

// Pending quizzes for the current student in a class.
// Honors per-student delivery (student_id) and grade targeting
// (target_grade_min/max vs user_grade_levels[target_subject]).
// Excludes quizzes the student has already attempted.
router.get("/class/:classId/pending", async (req: AuthRequest, res: Response) => {
  const userId = req.user!.id;
  const classId = req.params.classId;
  await ensureQuizCols();
  try {
    const rows = await db.prepare(`
      SELECT q.* FROM quizzes q
      LEFT JOIN quiz_attempts qa ON qa.quiz_id = q.id AND qa.student_id = ?
      WHERE q.class_id = ? AND qa.id IS NULL
        AND (q.student_id IS NULL OR q.student_id = ?)
      ORDER BY q.scheduled_date ASC, q.created_at ASC
    `).all(userId, classId, userId) as any[];

    let studentGrades: any = null;
    try {
      studentGrades = await db.prepare(
        "SELECT reading_grade, math_grade, writing_grade FROM user_grade_levels WHERE user_id = ?"
      ).get(userId);
    } catch { /* grades table may not exist yet */ }
    const gradeFor = (subject: string | null): number => {
      if (!studentGrades) return 3;
      const col = subject === 'math' ? 'math_grade'
                : subject === 'writing' ? 'writing_grade'
                : 'reading_grade';
      return Number(studentGrades[col] ?? 3);
    };

    const filtered = rows.filter((r: any) => {
      try { r.questions = JSON.parse(r.questions); } catch { r.questions = []; }
      // Student view: strip correctIndex so answers aren't leaked
      r.questions = (r.questions || []).map((q: any) => ({
        id: q.id, text: q.text, options: q.options,
      }));
      if (r.target_grade_min == null) return true;
      const tMin = Number(r.target_grade_min);
      const tMax = r.target_grade_max != null ? Number(r.target_grade_max) : tMin;
      const g = gradeFor(r.target_subject);
      return g >= tMin && g <= tMax;
    });

    res.json(filtered);
  } catch (e) {
    console.error('pending quizzes error:', e);
    res.json([]);
  }
});

// Get quiz
router.get("/:id", async (req: AuthRequest, res: Response) => {
  const row = await db.prepare("SELECT * FROM quizzes WHERE id = ?").get(req.params.id) as any;
  if (!row) return res.status(404).json({ error: "Not found" });
  row.questions = JSON.parse(row.questions);
  if (req.user!.role === "student") {
    row.questions = row.questions.map((q: any) => ({
      id: q.id,
      text: q.text,
      options: q.options,
    }));
  }
  res.json(row);
});

// Submit quiz attempt
router.post("/:id/attempt", async (req: AuthRequest, res: Response) => {
  const quiz = await db.prepare("SELECT questions FROM quizzes WHERE id = ?").get(req.params.id) as any;
  if (!quiz) return res.status(404).json({ error: "Not found" });
  const questions = JSON.parse(quiz.questions);
  const { answers } = req.body;
  let correct = 0;
  for (let i = 0; i < questions.length; i++) {
    if (answers[i] === questions[i].correctIndex) correct++;
  }
  const score = Math.round((correct / questions.length) * 100);
  const id = crypto.randomUUID();
  await db.prepare(
    "INSERT INTO quiz_attempts (id, quiz_id, student_id, answers, score) VALUES (?, ?, ?, ?, ?)"
  ).run(id, req.params.id, req.user!.id, JSON.stringify(answers), score);
  const row = await db.prepare("SELECT * FROM quiz_attempts WHERE id = ?").get(id) as any;
  row.answers = JSON.parse(row.answers);
  res.json(row);
});

// Get attempts for a quiz (teacher)
router.get("/:id/attempts", requireRole("teacher", "admin"), async (req: AuthRequest, res: Response) => {
  const rows = await db.prepare(
    `SELECT qa.*, u.name as student_name FROM quiz_attempts qa
     JOIN users u ON qa.student_id = u.id
     WHERE qa.quiz_id = ? ORDER BY qa.submitted_at DESC`
  ).all(req.params.id) as any[];
  rows.forEach((r) => { r.answers = JSON.parse(r.answers); });
  res.json(rows);
});

// Delete quiz (teacher/admin only)
router.delete("/:id", requireRole("teacher", "admin"), async (req: AuthRequest, res: Response) => {
  const quiz = await db.prepare("SELECT id, teacher_id FROM quizzes WHERE id = ?").get(req.params.id) as any;
  if (!quiz) return res.status(404).json({ error: "Not found" });
  if (req.user!.role !== "admin" && quiz.teacher_id !== req.user!.id) {
    return res.status(403).json({ error: "Forbidden" });
  }
  await db.prepare("DELETE FROM quiz_attempts WHERE quiz_id = ?").run(req.params.id);
  await db.prepare("DELETE FROM quizzes WHERE id = ?").run(req.params.id);
  res.json({ ok: true });
});

export default router;
