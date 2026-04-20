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

// Assignment content templates
function createReadingContent(grade: number): string {
  const readings: Record<number, { title: string; questions: any[] }> = {
    1: {
      title: "Simple Words",
      questions: [
        { type: "multiple_choice", text: "What is the cat doing?", options: ["Running", "Sleeping", "Jumping"], correctIndex: 1 },
        { type: "multiple_choice", text: "What color is the ball?", options: ["Red", "Blue", "Green"], correctIndex: 0 },
      ],
    },
    2: {
      title: "CVC Words",
      questions: [
        { type: "multiple_choice", text: "Which word rhymes with 'cat'?", options: ["Hat", "Dog", "Run"], correctIndex: 0 },
        { type: "fill_blank", text: "The ___ is big.", options: ["dog", "cat"], correctIndex: 0 },
      ],
    },
    3: {
      title: "Short Stories",
      questions: [
        { type: "multiple_choice", text: "What was the main character's problem?", options: ["Lost way home", "Hungry", "Cold"], correctIndex: 0 },
        { type: "short_answer", text: "How did the character solve the problem?" },
      ],
    },
    5: {
      title: "Complex Passage",
      questions: [
        { type: "multiple_choice", text: "What is the author's main point?", options: ["Technology helps", "Nature matters", "People change"], correctIndex: 1 },
        { type: "short_answer", text: "Support your answer with a quote from the text." },
      ],
    },
  };

  const content = readings[grade] || readings[1];
  return JSON.stringify({
    sections: [
      {
        title: content.title,
        content: `Grade ${grade} Reading: ${content.title}`,
        questions: content.questions.map((q: any) => ({
          type: q.type,
          text: q.text,
          options: q.options || undefined,
          correctIndex: q.correctIndex,
          points: 10,
        })),
      },
    ],
  });
}

function createMathContent(grade: number): string {
  const maths: Record<number, { title: string; questions: any[] }> = {
    1: {
      title: "Counting to 10",
      questions: [
        { type: "multiple_choice", text: "How many? ●●●", options: ["2", "3", "4"], correctIndex: 1 },
        { type: "fill_blank", text: "2 + 1 = ___", options: ["3"], correctIndex: 0 },
      ],
    },
    2: {
      title: "Add and Subtract",
      questions: [
        { type: "multiple_choice", text: "5 + 3 = ?", options: ["7", "8", "9"], correctIndex: 1 },
        { type: "fill_blank", text: "10 - 4 = ___", options: ["6"], correctIndex: 0 },
      ],
    },
    3: {
      title: "Multiplication Intro",
      questions: [
        { type: "multiple_choice", text: "2 × 3 = ?", options: ["5", "6", "7"], correctIndex: 1 },
        { type: "fill_blank", text: "3 × 4 = ___", options: ["12"], correctIndex: 0 },
      ],
    },
    4: {
      title: "Multi-Digit Multiplication",
      questions: [
        { type: "multiple_choice", text: "23 × 4 = ?", options: ["88", "92", "96"], correctIndex: 2 },
        { type: "fill_blank", text: "15 × 6 = ___", options: ["90"], correctIndex: 0 },
      ],
    },
    5: {
      title: "Decimals & Fractions",
      questions: [
        { type: "multiple_choice", text: "1/2 + 1/4 = ?", options: ["1/4", "3/4", "1"], correctIndex: 1 },
        { type: "fill_blank", text: "0.5 + 0.25 = ___", options: ["0.75"], correctIndex: 0 },
      ],
    },
  };

  const content = maths[grade] || maths[1];
  return JSON.stringify({
    sections: [
      {
        title: content.title,
        content: `Grade ${grade} Math: ${content.title}`,
        questions: content.questions.map((q: any) => ({
          type: q.type,
          text: q.text,
          options: q.options || undefined,
          correctIndex: q.correctIndex,
          points: 10,
        })),
      },
    ],
  });
}

function createWritingContent(grade: number): string {
  const writings: Record<number, { title: string; questions: any[] }> = {
    0: {
      title: "Trace and Copy",
      questions: [
        { type: "short_answer", text: "Trace the letter A" },
        { type: "short_answer", text: "Copy the word 'cat'" },
      ],
    },
    2: {
      title: "Sentence Writing",
      questions: [
        { type: "short_answer", text: "Write a sentence about your favorite animal." },
      ],
    },
    3: {
      title: "Narrative Paragraph",
      questions: [
        { type: "short_answer", text: "Write about something that happened to you today." },
      ],
    },
    5: {
      title: "Opinion Essay",
      questions: [
        { type: "short_answer", text: "What is your favorite book? Why?" },
      ],
    },
  };

  const content = writings[grade] || writings[0];
  return JSON.stringify({
    sections: [
      {
        title: content.title,
        content: `Grade ${grade} Writing: ${content.title}`,
        questions: content.questions.map((q: any) => ({
          type: q.type,
          text: q.text,
          points: 10,
        })),
      },
    ],
  });
}

function createSELContent(): string {
  return JSON.stringify({
    sections: [
      {
        title: "Growth Mindset",
        content: "Learning from Challenges",
        questions: [
          {
            type: "short_answer",
            text: "Describe a time you faced a challenge. How did you overcome it?",
            points: 10,
          },
        ],
      },
    ],
  });
}

// POST /admin/reset-star-assignments
router.post("/reset-star-assignments", async (req, res) => {
  try {
    console.log("🔄 Starting Star class assignment reset...");

    // Ensure Star class exists
    const classCheck = await db.prepare("SELECT id FROM classes WHERE id = ?").get(STAR_CLASS);
    if (!classCheck) {
      console.log("📝 Creating Star class...");
      await db
        .prepare(
          `INSERT INTO classes (id, teacher_id, name, code, created_at)
           VALUES (?, ?, ?, ?, ?)`
        )
        .run(STAR_CLASS, TEACHER, "Star Class", "STAR", new Date().toISOString());
    }

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

    // Insert all assignments
    for (const a of assignments) {
      await db
        .prepare(
          `INSERT INTO assignments
           (id, class_id, teacher_id, title, target_subject, target_grade_min, target_grade_max, target_student_ids, scheduled_date, due_date, created_at, content)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          a.id,
          STAR_CLASS,
          TEACHER,
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

export default router;
