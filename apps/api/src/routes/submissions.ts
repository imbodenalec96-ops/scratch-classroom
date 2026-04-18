import { Router, Response } from "express";
import crypto from "crypto";
import db from "../db.js";
import { AuthRequest } from "../middleware/auth.js";
import { requireRole } from "../middleware/rbac.js";
import type { AutoGradeResult } from "@scratch/shared";

const router = Router();

// Submit assignment
router.post("/", async (req: AuthRequest, res: Response) => {
  const { assignmentId, projectId, answers } = req.body;

  // Load assignment content for worksheet grading
  const asgn = await db.prepare("SELECT rubric, content FROM assignments WHERE id = ?").get(assignmentId) as any;

  // Auto-grade: check project has blocks (Scratch-style)
  let autoGrade: AutoGradeResult | null = null;
  const proj = projectId ? await db.prepare("SELECT data FROM projects WHERE id = ?").get(projectId) as any : null;
  if (proj) {
    const data = typeof proj.data === "string" ? JSON.parse(proj.data) : proj.data;
    const sprites = data.sprites || [];
    const totalBlocks = sprites.reduce((sum: number, s: any) => sum + (s.blocks?.length || 0), 0);
    const hasEvents = sprites.some((s: any) => s.blocks?.some((b: any) => b.category === "events"));
    const hasControl = sprites.some((s: any) => s.blocks?.some((b: any) => b.category === "control"));
    const checks = [
      { label: "Has blocks", passed: totalBlocks > 0, detail: `${totalBlocks} blocks used` },
      { label: "Has event handlers", passed: hasEvents, detail: hasEvents ? "Found event blocks" : "No event blocks" },
      { label: "Uses control flow", passed: hasControl, detail: hasControl ? "Found control blocks" : "No control blocks" },
    ];
    const score = Math.round((checks.filter((c) => c.passed).length / checks.length) * 100);
    autoGrade = { score, checks };
  } else if (asgn?.content) {
    // Auto-grade worksheet: score multiple-choice questions by comparing to correctIndex
    try {
      const content = JSON.parse(asgn.content);
      const studentAnswers: Record<number, string> = answers
        ? JSON.parse(typeof answers === "string" ? answers : JSON.stringify(answers))
        : {};

      const checks: { label: string; passed: boolean; detail: string }[] = [];
      let mcCorrect = 0;
      let mcTotal = 0;
      let qIndex = 0;

      for (const section of (content.sections || [])) {
        for (const q of (section.questions || [])) {
          const studentAns = studentAnswers[qIndex];
          const label = (q.text || `Q${qIndex + 1}`).slice(0, 70);

          if (q.type === "multiple_choice" && Array.isArray(q.options)) {
            // Strip leading "A. ", "B. " etc from both sides for robust comparison
            const normalize = (s: string) => String(s || "").replace(/^[A-D]\.\s*/i, "").trim().toLowerCase();

            // Resolve the correct option — prefer correctIndex, fall back to correctAnswer string
            let correctOpt: string | undefined;
            const ci = q.correctIndex;
            if (ci !== undefined && ci !== null) {
              // coerce string "2" → 2 just in case AI returned a string
              const idx = typeof ci === "string" ? parseInt(ci, 10) : Number(ci);
              correctOpt = isNaN(idx) ? undefined : q.options[idx];
            }
            if (!correctOpt && q.correctAnswer) {
              // some AI responses use a correctAnswer string instead
              correctOpt = String(q.correctAnswer);
            }

            if (correctOpt !== undefined) {
              mcTotal++;
              const isCorrect = normalize(studentAns) === normalize(correctOpt);
              if (isCorrect) mcCorrect++;
              checks.push({
                label,
                passed: isCorrect,
                detail: isCorrect
                  ? "Correct ✓"
                  : `Expected: "${normalize(correctOpt)}" | Got: "${normalize(studentAns) || "(blank)"}"`
              });
            } else {
              // correctIndex missing on old question — treat as attempted (teacher must review)
              const attempted = Boolean(studentAns && String(studentAns).trim().length > 0);
              checks.push({
                label,
                passed: attempted,
                detail: attempted ? "Answered — pending teacher review (no answer key)" : "Not answered",
              });
            }
          } else if (q.type === "short_answer" || q.type === "fill_blank") {
            // Short answer / fill blank: mark as attempted if answered
            const attempted = Boolean(studentAns && String(studentAns).trim().length > 0);
            checks.push({
              label,
              passed: attempted,
              detail: attempted ? "Answered — pending teacher review" : "Not answered",
            });
          }
          qIndex++;
        }
      }

      // Score = MC accuracy + attempted open-ended (open-ended = full credit)
      const openEnded = checks.filter((c) => !c.label.startsWith("Has ")).length - mcTotal;
      const openEndedDone = checks.filter((c, i) => {
        const q = (content.sections || []).flatMap((s: any) => s.questions || [])[i];
        return (q?.type === "short_answer" || q?.type === "fill_blank") && c.passed;
      }).length;

      if (checks.length === 0) {
        // Nothing to grade yet — mark submitted
        autoGrade = { score: 100, checks: [{ label: "Submitted", passed: true, detail: "Assignment submitted — pending teacher review" }] };
      } else {
        const totalPossible = mcTotal + (openEnded > 0 ? openEnded : 0);
        const totalEarned = mcCorrect + openEndedDone;
        const score = totalPossible > 0 ? Math.round((totalEarned / totalPossible) * 100) : 100;
        autoGrade = { score, checks };
      }
    } catch (e) {
      console.error("[submissions] worksheet auto-grade error:", e);
      autoGrade = { score: 100, checks: [{ label: "Submitted", passed: true, detail: "Auto-grade error — pending teacher review" }] };
    }
  } else {
    // No project, no content — mark as submitted with pending review
    autoGrade = { score: 100, checks: [{ label: "Submitted", passed: true, detail: "Pending teacher review" }] };
  }

  // Auto-promote MC score to the grade field so teacher sees it immediately
  const autoGradeScore = autoGrade ? autoGrade.score : null;

  const id = crypto.randomUUID();
  // Try inserting with answers column; fall back if it doesn't exist
  try {
    await db.prepare(
      `INSERT INTO submissions (id, assignment_id, student_id, project_id, auto_grade_result, answers, grade)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(id, assignmentId, req.user!.id, projectId ?? null, autoGrade ? JSON.stringify(autoGrade) : null, answers ?? null, autoGradeScore);
  } catch {
    try { await db.exec("ALTER TABLE submissions ADD COLUMN answers TEXT"); } catch { /* already exists */ }
    try {
      await db.prepare(
        `INSERT INTO submissions (id, assignment_id, student_id, project_id, auto_grade_result, answers, grade)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).run(id, assignmentId, req.user!.id, projectId ?? null, autoGrade ? JSON.stringify(autoGrade) : null, answers ?? null, autoGradeScore);
    } catch {
      // Final fallback without answers/grade
      await db.prepare(
        `INSERT INTO submissions (id, assignment_id, student_id, project_id, auto_grade_result)
         VALUES (?, ?, ?, ?, ?)`
      ).run(id, assignmentId, req.user!.id, projectId ?? null, autoGrade ? JSON.stringify(autoGrade) : null);
    }
  }
  const row = await db.prepare("SELECT * FROM submissions WHERE id = ?").get(id) as any;
  if (row?.auto_grade_result) row.auto_grade_result = JSON.parse(row.auto_grade_result);
  res.json(row);
});

// Single submission — returns submission joined with the assignment content
// so the gradebook can show question + answer side-by-side. Teacher/admin only
// because it exposes raw student answers + the assignment's answer key.
router.get("/:id", requireRole("teacher", "admin"), async (req: AuthRequest, res: Response) => {
  const row = await db.prepare(
    `SELECT s.*, u.name AS student_name, a.title AS assignment_title,
            a.content AS assignment_content, a.target_subject
       FROM submissions s
       JOIN users u ON s.student_id = u.id
       JOIN assignments a ON s.assignment_id = a.id
      WHERE s.id = ?`
  ).get(req.params.id) as any;
  if (!row) return res.status(404).json({ error: "Submission not found" });
  if (row.auto_grade_result) {
    try { row.auto_grade_result = JSON.parse(row.auto_grade_result); } catch {}
  }
  if (row.answers) {
    try { row.answers = JSON.parse(row.answers); } catch {}
  }
  if (row.assignment_content) {
    try { row.assignment_content = JSON.parse(row.assignment_content); } catch {}
  }
  res.json(row);
});

// List submissions for assignment (teacher)
router.get("/assignment/:assignmentId", requireRole("teacher", "admin"), async (req: AuthRequest, res: Response) => {
  const rows = await db.prepare(
    `SELECT s.*, u.name as student_name FROM submissions s
     JOIN users u ON s.student_id = u.id
     WHERE s.assignment_id = ? ORDER BY s.submitted_at DESC`
  ).all(req.params.assignmentId) as any[];
  rows.forEach((r) => { if (r.auto_grade_result) r.auto_grade_result = JSON.parse(r.auto_grade_result); });
  res.json(rows);
});

// My submissions
router.get("/mine", async (req: AuthRequest, res: Response) => {
  const rows = await db.prepare(
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
  await db.prepare("UPDATE submissions SET grade = ?, feedback = ? WHERE id = ?").run(grade, feedback, req.params.id);
  const row = await db.prepare("SELECT * FROM submissions WHERE id = ?").get(req.params.id) as any;
  if (row?.auto_grade_result) row.auto_grade_result = JSON.parse(row.auto_grade_result);
  res.json(row);
});

// ── Human-grade columns (idempotent migration) ──────────────────────
// Separate from submissions.grade (numeric 0–100 legacy) — these capture
// the teacher's explicit pass/needs-redo call plus freeform feedback, with
// who/when so the gradebook can show an audit trail. Kept as nullable so a
// submission can exist in "auto-graded only" state (human_grade_pass = null).
export let humanGradeColsReady = false;
export async function ensureHumanGradeCols() {
  if (humanGradeColsReady) return;
  for (const col of [
    "ALTER TABLE submissions ADD COLUMN human_grade_pass INTEGER",  // 0/1/NULL
    "ALTER TABLE submissions ADD COLUMN human_grade_feedback TEXT",
    "ALTER TABLE submissions ADD COLUMN graded_by TEXT",
    "ALTER TABLE submissions ADD COLUMN graded_at TEXT",
  ]) {
    try { await db.exec(col); } catch { /* column already exists */ }
  }
  humanGradeColsReady = true;
}

export default router;
