import { Router } from "express";
import { randomUUID } from "crypto";
import db from "../db.js";

const router = Router();

const STAR_CLASS = "b0000000-0000-0000-0000-000000000002";
const TEACHER = "a0000000-0000-0000-0000-000000000002";
const TODAY = "2026-04-20";

// Student ID mapping
const STUDENTS: Record<string, string> = {
  anna: "s0000000-0000-0000-0000-000000000007",
  aiden: "s0000000-0000-0000-0000-000000000004",
  ameer: "s0000000-0000-0000-0000-000000000008",
  jaida: "s0000000-0000-0000-0000-000000000002",
  kaleb: "s0000000-0000-0000-0000-000000000006",
  rayden: "s0000000-0000-0000-0000-000000000003",
  ryan: "s0000000-0000-0000-0000-000000000001",
  zoey: "s0000000-0000-0000-0000-000000000005",
};

// Grade matrix by student
const GRADE_MATRIX: Record<string, { reading: number; math: number; writing: number }> = {
  anna: { reading: 1, math: 1, writing: 0 },
  aiden: { reading: 3, math: 2, writing: 3 },
  ameer: { reading: 5, math: 5, writing: 5 },
  jaida: { reading: 3, math: 4, writing: 5 },
  kaleb: { reading: 2, math: 2, writing: 2 },
  rayden: { reading: 3, math: 3, writing: 3 },
  ryan: { reading: 5, math: 5, writing: 5 },
  zoey: { reading: 1, math: 2, writing: 2 },
};

// Assignment content templates (simplified to reduce size)
function createReadingContent(grade: number): string {
  const q: Record<number, any[]> = {
    1: [{ type: "mc", text: "Q1", o: ["A", "B"], c: 0 }],
    2: [{ type: "mc", text: "Q1", o: ["A", "B"], c: 0 }],
    3: [{ type: "mc", text: "Q1", o: ["A", "B"], c: 0 }],
    5: [{ type: "mc", text: "Q1", o: ["A", "B"], c: 0 }],
  };
  return JSON.stringify({ sections: [{ title: `G${grade}`, q: q[grade] || q[1] }] });
}

function createMathContent(grade: number): string {
  return JSON.stringify({ sections: [{ title: `G${grade}`, q: [{ type: "mc", text: "Q1", o: ["A", "B"], c: 0 }] }] });
}

function createWritingContent(grade: number): string {
  return JSON.stringify({ sections: [{ title: `G${grade}`, q: [{ type: "sa", text: "Q1" }] }] });
}

function createSELContent(): string {
  return JSON.stringify({ sections: [{ title: "SEL", q: [{ type: "sa", text: "Q1" }] }] });
}

// POST /admin/ensure-star-class
router.post("/ensure-star-class", async (req, res) => {
  try {
    const check = await db.prepare("SELECT id FROM classes WHERE id = ?").get(STAR_CLASS);
    if (check) {
      return res.json({ exists: true });
    }

    // Create Star class without teacher reference
    await db
      .prepare(
        `INSERT INTO classes (id, name, code) VALUES (?, ?, ?)`
      )
      .run(STAR_CLASS, "Star Class", "STAR");

    res.json({ created: true });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

// POST /admin/reset-star-assignments
router.post("/reset-star-assignments", async (req, res) => {
  try {
    console.log("🔄 Starting Star class assignment reset...");

    // Delete existing assignments for Star class on this date
    await db.prepare("DELETE FROM assignments WHERE class_id = ? AND scheduled_date = ?").run(STAR_CLASS, TODAY);

    const assignments: any[] = [];
    const assignmentsByGrade: Record<string, any[]> = {};

    // Build reading assignments (grades 1, 2, 3, 5)
    for (const grade of [1, 2, 3, 5]) {
      const id = randomUUID();
      const targetStudents = Object.entries(GRADE_MATRIX)
        .filter(([_, grades]) => grades.reading === grade)
        .map(([name]) => STUDENTS[name]);

      assignments.push({
        id,
        grade,
        subject: "reading",
        title: `Grade ${grade} Reading`,
        targetStudents,
        content: createReadingContent(grade),
      });
    }

    // Build math assignments (grades 1, 2, 3, 4, 5)
    for (const grade of [1, 2, 3, 4, 5]) {
      const id = randomUUID();
      const targetStudents = Object.entries(GRADE_MATRIX)
        .filter(([_, grades]) => grades.math === grade)
        .map(([name]) => STUDENTS[name]);

      if (targetStudents.length > 0) {
        assignments.push({
          id,
          grade,
          subject: "math",
          title: `Grade ${grade} Math`,
          targetStudents,
          content: createMathContent(grade),
        });
      }
    }

    // Build writing assignments (grades 0, 2, 3, 5)
    for (const grade of [0, 2, 3, 5]) {
      const id = randomUUID();
      const targetStudents = Object.entries(GRADE_MATRIX)
        .filter(([_, grades]) => grades.writing === grade)
        .map(([name]) => STUDENTS[name]);

      if (targetStudents.length > 0) {
        assignments.push({
          id,
          grade,
          subject: "writing",
          title: `Grade ${grade} Writing`,
          targetStudents,
          content: createWritingContent(grade),
        });
      }
    }

    // Build SEL assignment (all students, grade 1)
    const selId = randomUUID();
    const allStudents = Object.values(STUDENTS);
    assignments.push({
      id: selId,
      grade: 1,
      subject: "sel",
      title: "Growth Mindset: Learning from Challenges",
      targetStudents: allStudents,
      content: createSELContent(),
    });

    // Insert all assignments (teacher_id can be null)
    for (const a of assignments) {
      await db
        .prepare(
          `INSERT INTO assignments
           (id, class_id, title, target_subject, target_grade_min, target_grade_max, target_student_ids, scheduled_date, due_date, created_at, content)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          a.id,
          STAR_CLASS,
          a.title,
          a.subject,
          a.grade,
          a.grade,
          JSON.stringify(a.targetStudents),
          TODAY,
          `${TODAY} ${a.subject === "reading" ? "09:30:00" : a.subject === "math" ? "11:00:00" : a.subject === "writing" ? "13:30:00" : "14:30:00"}`,
          new Date().toISOString(),
          a.content
        );
    }

    const count = await db.prepare("SELECT COUNT(*) as n FROM assignments WHERE class_id = ? AND scheduled_date = ?").get(STAR_CLASS, TODAY);

    console.log(`✅ Reset complete: ${count.n} assignments created`);
    res.json({
      success: true,
      message: `Created ${count.n} assignments for Star class`,
      date: TODAY,
      assignments: assignments.length,
    });
  } catch (error) {
    console.error("❌ Reset failed:", error);
    res.status(500).json({ error: String(error) });
  }
});

// GET /admin/students — list all active students for the assignment builder
router.get("/students", async (_req, res) => {
  try {
    const rows = await db
      .prepare(
        `SELECT u.id::text, u.name, ugl.reading_grade, ugl.math_grade, ugl.writing_grade
         FROM users u
         LEFT JOIN user_grade_levels ugl ON ugl.user_id::text = u.id::text
         WHERE u.role = 'student'
         ORDER BY u.name`
      )
      .all();
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

// GET /admin/assignments — list upcoming/today's assignments
router.get("/assignments", async (_req, res) => {
  try {
    const rows = await db
      .prepare(
        `SELECT id, title, target_subject, target_grade_min, target_student_ids, scheduled_date, created_at
         FROM assignments
         WHERE scheduled_date::date >= CURRENT_DATE - INTERVAL '1 day'
         ORDER BY scheduled_date DESC, created_at DESC
         LIMIT 50`
      )
      .all();
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

// DELETE /admin/assignments/:id
router.delete("/assignments/:id", async (req, res) => {
  try {
    await db.prepare("DELETE FROM assignments WHERE id = ?").run(req.params.id);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

// POST /admin/create-assignment
// Body: { title, subject, grade, studentIds: string[], date: "YYYY-MM-DD", passage?: string, questions: Question[] }
router.post("/create-assignment", async (req, res) => {
  try {
    const { title, subject, grade, studentIds, date, passage, questions } = req.body as {
      title: string;
      subject: string;
      grade: number;
      studentIds: string[];
      date: string;
      passage?: string;
      questions: { type: string; text: string; options?: string[]; correctIndex?: number; points?: number }[];
    };

    if (!title || !subject || !studentIds?.length || !date || !questions?.length) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    // Find the Star class for these students
    const classRow = await db
      .prepare(
        `SELECT DISTINCT cm.class_id FROM class_members cm
         JOIN classes c ON c.id = cm.class_id
         WHERE cm.user_id::text = ? AND c.name ILIKE '%Star%'
         LIMIT 1`
      )
      .get(studentIds[0]);

    const classId = classRow?.class_id ?? "0a635d79-4028-480c-8240-652a67bd973d";

    const dueTime = subject === "reading" ? "09:30:00"
      : subject === "math" ? "11:00:00"
      : subject === "writing" ? "13:30:00"
      : "14:30:00";

    const content = JSON.stringify({
      sections: [{
        title: passage ? "Reading & Questions" : title,
        passage: passage || undefined,
        questions: questions.map((q) => ({
          type: q.type,
          text: passage && questions.indexOf(q) === 0
            ? `📖 Read this story first:\n\n"${passage}"\n\n${q.text}`
            : q.text,
          context: passage || undefined,
          options: q.options,
          correctIndex: q.correctIndex,
          points: q.points ?? 1,
        })),
      }],
    });

    const id = randomUUID();
    await db
      .prepare(
        `INSERT INTO assignments
         (id, class_id, title, target_subject, target_grade_min, target_grade_max, target_student_ids, scheduled_date, due_date, created_at, content)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        id, classId, title, subject, grade, grade,
        JSON.stringify(studentIds),
        date,
        `${date} ${dueTime}`,
        new Date().toISOString(),
        content
      );

    res.json({ success: true, id });
  } catch (error) {
    console.error("❌ create-assignment failed:", error);
    res.status(500).json({ error: String(error) });
  }
});

export default router;
