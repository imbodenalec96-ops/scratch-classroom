import { Router, Response } from "express";
import crypto from "crypto";
import db from "../db.js";
import { AuthRequest } from "../middleware/auth.js";
import { requireRole } from "../middleware/rbac.js";

const router = Router();

// Create quiz
router.post("/", requireRole("teacher", "admin"), async (req: AuthRequest, res: Response) => {
  const { classId, title, questions } = req.body;
  const id = crypto.randomUUID();
  db.prepare(
    "INSERT INTO quizzes (id, class_id, teacher_id, title, questions) VALUES (?, ?, ?, ?, ?)"
  ).run(id, classId, req.user!.id, title, JSON.stringify(questions || []));
  const row = db.prepare("SELECT * FROM quizzes WHERE id = ?").get(id) as any;
  row.questions = JSON.parse(row.questions);
  res.json(row);
});

// List quizzes for class
router.get("/class/:classId", async (req: AuthRequest, res: Response) => {
  const rows = db.prepare(
    "SELECT * FROM quizzes WHERE class_id = ? ORDER BY created_at DESC"
  ).all(req.params.classId) as any[];
  rows.forEach((r) => { r.questions = JSON.parse(r.questions); });
  res.json(rows);
});

// Get quiz
router.get("/:id", async (req: AuthRequest, res: Response) => {
  const row = db.prepare("SELECT * FROM quizzes WHERE id = ?").get(req.params.id) as any;
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
  const quiz = db.prepare("SELECT questions FROM quizzes WHERE id = ?").get(req.params.id) as any;
  if (!quiz) return res.status(404).json({ error: "Not found" });
  const questions = JSON.parse(quiz.questions);
  const { answers } = req.body;
  let correct = 0;
  for (let i = 0; i < questions.length; i++) {
    if (answers[i] === questions[i].correctIndex) correct++;
  }
  const score = Math.round((correct / questions.length) * 100);
  const id = crypto.randomUUID();
  db.prepare(
    "INSERT INTO quiz_attempts (id, quiz_id, student_id, answers, score) VALUES (?, ?, ?, ?, ?)"
  ).run(id, req.params.id, req.user!.id, JSON.stringify(answers), score);
  const row = db.prepare("SELECT * FROM quiz_attempts WHERE id = ?").get(id) as any;
  row.answers = JSON.parse(row.answers);
  res.json(row);
});

// Get attempts for a quiz (teacher)
router.get("/:id/attempts", requireRole("teacher", "admin"), async (req: AuthRequest, res: Response) => {
  const rows = db.prepare(
    `SELECT qa.*, u.name as student_name FROM quiz_attempts qa
     JOIN users u ON qa.student_id = u.id
     WHERE qa.quiz_id = ? ORDER BY qa.submitted_at DESC`
  ).all(req.params.id) as any[];
  rows.forEach((r) => { r.answers = JSON.parse(r.answers); });
  res.json(rows);
});

export default router;
