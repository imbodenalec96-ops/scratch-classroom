import Database from "better-sqlite3";
import dotenv from "dotenv";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

dotenv.config({
  path: join(dirname(fileURLToPath(import.meta.url)), "../../../../.env"),
});

const dbPath =
  process.env.SQLITE_PATH ||
  join(dirname(fileURLToPath(import.meta.url)), "../../../../db/scratch.db");
const db = Database(dbPath);
db.pragma("foreign_keys = ON");

const STAR_CLASS_ID = "b0000000-0000-0000-0000-000000000002";

// Per-student per-subject grade levels
const STUDENT_GRADES: Record<
  string,
  { reading: number; math: number; writing: number }
> = {
  "s0000000-0000-0000-0000-000000000005": { reading: 3, math: 2, writing: 3 }, // Aiden
  "s0000000-0000-0000-0000-000000000008": { reading: 5, math: 5, writing: 5 }, // Ameer
  "s0000000-0000-0000-0000-000000000007": { reading: 1, math: 1, writing: 0 }, // Anna
  "s0000000-0000-0000-0000-000000000002": { reading: 3, math: 4, writing: 5 }, // Jaida
  "s0000000-0000-0000-0000-000000000006": { reading: 2, math: 2, writing: 2 }, // Kaleb
  "s0000000-0000-0000-0000-000000000003": { reading: 3, math: 3, writing: 3 }, // Rayden
  "s0000000-0000-0000-0000-000000000001": { reading: 5, math: 5, writing: 5 }, // Ryan
  "s0000000-0000-0000-0000-000000000004": { reading: 1, math: 2, writing: 2 }, // Zoey
};

function getStudentsByGrade(subject: string, grade: number): string[] {
  return Object.entries(STUDENT_GRADES)
    .filter(([_, grades]) => grades[subject as keyof typeof grades] === grade)
    .map(([studentId]) => studentId);
}

async function updateAssignments() {
  console.log("🎯 Assigning students to grade-level assignment variants...\n");

  // Get all assignments
  const assignments = db
    .prepare(
      `
    SELECT id, target_subject, target_grade_min FROM assignments
    WHERE class_id = ? AND target_subject != 'SEL'
    ORDER BY target_subject, target_grade_min
  `,
    )
    .all(STAR_CLASS_ID) as any[];

  for (const assignment of assignments) {
    const subject = assignment.target_subject.toLowerCase();
    const grade = assignment.target_grade_min;
    const students = getStudentsByGrade(subject, grade);
    const studentIds = JSON.stringify(students);

    db.prepare(
      `
      UPDATE assignments
      SET target_student_ids = ?
      WHERE id = ?
    `,
    ).run(studentIds, assignment.id);

    console.log(
      `✅ ${subject.toUpperCase()} Grade ${grade}: assigned to ${students.length} students`,
    );
  }

  // SEL is class-wide (all students)
  const selStudents = Object.keys(STUDENT_GRADES);
  const selStudentIds = JSON.stringify(selStudents);
  db.prepare(
    `
    UPDATE assignments
    SET target_student_ids = ?
    WHERE class_id = ? AND target_subject = 'SEL'
  `,
  ).run(selStudentIds, STAR_CLASS_ID);
  console.log(
    `✅ SEL (Social-Emotional): assigned to all ${selStudents.length} students`,
  );

  db.close();
  console.log("\n✅ All assignments now targeted to correct students!");
  console.log(
    "📋 Each student will see only the assignments matching their per-subject grade level.\n",
  );
}

updateAssignments().catch((e) => {
  console.error(e);
  process.exit(1);
});
