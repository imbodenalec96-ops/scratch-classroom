import Database from "better-sqlite3";
import dotenv from "dotenv";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { randomUUID } from "crypto";

dotenv.config({ path: join(dirname(fileURLToPath(import.meta.url)), "../../../../.env") });

const dbPath = process.env.SQLITE_PATH || join(dirname(fileURLToPath(import.meta.url)), "../../../../db/scratch.db");
const db = Database(dbPath);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

async function seed() {
  console.log("Running schema...");
  const schemaPath = join(dirname(fileURLToPath(import.meta.url)), "../../../../db/schema.sqlite.sql");
  const schema = readFileSync(schemaPath, "utf-8");
  db.exec(schema);
  console.log("Schema applied.");

  // Create user grade levels
  console.log("Creating student grade levels...");
  db.prepare(`
    CREATE TABLE IF NOT EXISTS user_grade_levels (
      user_id TEXT PRIMARY KEY,
      reading_grade INTEGER,
      math_grade INTEGER,
      writing_grade INTEGER
    )
  `).run();

  db.prepare(`
    INSERT OR REPLACE INTO user_grade_levels (user_id, reading_grade, math_grade, writing_grade) VALUES
      ('s0000000-0000-0000-0000-000000000005', 3, 2, 3),
      ('s0000000-0000-0000-0000-000000000008', 5, 5, 5),
      ('s0000000-0000-0000-0000-000000000007', 1, 1, 0),
      ('s0000000-0000-0000-0000-000000000002', 3, 4, 5),
      ('s0000000-0000-0000-0000-000000000006', 2, 2, 2),
      ('s0000000-0000-0000-0000-000000000003', 3, 3, 3),
      ('s0000000-0000-0000-0000-000000000001', 5, 5, 5),
      ('s0000000-0000-0000-0000-000000000004', 1, 2, 2)
  `).run();

  // Create Star class assignments for today
  const STAR_CLASS = 'b0000000-0000-0000-0000-000000000002';
  const TEACHER = 'a0000000-0000-0000-0000-000000000002';
  const TODAY = new Date().toISOString().split('T')[0];

  console.log("Creating Star class assignments...");
  const assignments = [
    { title: '1st Grade Reading: Simple Words', subject: 'reading', grade: 1, time: '09:30:00', students: ['s0000000-0000-0000-0000-000000000007', 's0000000-0000-0000-0000-000000000004'] },
    { title: '2nd Grade Reading: CVC Words', subject: 'reading', grade: 2, time: '09:30:00', students: ['s0000000-0000-0000-0000-000000000006'] },
    { title: '3rd Grade Reading: Short Stories', subject: 'reading', grade: 3, time: '09:30:00', students: ['s0000000-0000-0000-0000-000000000005','s0000000-0000-0000-0000-000000000002','s0000000-0000-0000-0000-000000000003'] },
    { title: '5th Grade Reading: Complex Passage', subject: 'reading', grade: 5, time: '09:30:00', students: ['s0000000-0000-0000-0000-000000000008','s0000000-0000-0000-0000-000000000001'] },
    { title: '1st Grade Math: Counting', subject: 'math', grade: 1, time: '11:00:00', students: ['s0000000-0000-0000-0000-000000000007'] },
    { title: '2nd Grade Math: Add and Subtract', subject: 'math', grade: 2, time: '11:00:00', students: ['s0000000-0000-0000-0000-000000000005','s0000000-0000-0000-0000-000000000006','s0000000-0000-0000-0000-000000000004'] },
    { title: '3rd Grade Math: Multiplication Intro', subject: 'math', grade: 3, time: '11:00:00', students: ['s0000000-0000-0000-0000-000000000003'] },
    { title: '4th Grade Math: Multi-Digit Multiplication', subject: 'math', grade: 4, time: '11:00:00', students: ['s0000000-0000-0000-0000-000000000002'] },
    { title: '5th Grade Math: Decimals & Fractions', subject: 'math', grade: 5, time: '11:00:00', students: ['s0000000-0000-0000-0000-000000000008','s0000000-0000-0000-0000-000000000001'] },
    { title: 'Kindergarten Writing: Trace and Copy', subject: 'writing', grade: 0, time: '13:30:00', students: ['s0000000-0000-0000-0000-000000000007'] },
    { title: '2nd Grade Writing: Sentence Writing', subject: 'writing', grade: 2, time: '13:30:00', students: ['s0000000-0000-0000-0000-000000000006','s0000000-0000-0000-0000-000000000004'] },
    { title: '3rd Grade Writing: Narrative Paragraph', subject: 'writing', grade: 3, time: '13:30:00', students: ['s0000000-0000-0000-0000-000000000005','s0000000-0000-0000-0000-000000000003'] },
    { title: '5th Grade Writing: Opinion Essay', subject: 'writing', grade: 5, time: '13:30:00', students: ['s0000000-0000-0000-0000-000000000008','s0000000-0000-0000-0000-000000000002','s0000000-0000-0000-0000-000000000001'] },
    { title: 'Growth Mindset: Learning from Challenges', subject: 'sel', grade: 1, time: '14:30:00', students: ['s0000000-0000-0000-0000-000000000007','s0000000-0000-0000-0000-000000000008','s0000000-0000-0000-0000-000000000005','s0000000-0000-0000-0000-000000000002','s0000000-0000-0000-0000-000000000006','s0000000-0000-0000-0000-000000000003','s0000000-0000-0000-0000-000000000001','s0000000-0000-0000-0000-000000000004'] },
  ];

  for (const a of assignments) {
    db.prepare(`
      INSERT OR IGNORE INTO assignments (id, class_id, teacher_id, title, target_subject, target_grade_min, target_grade_max, target_student_ids, scheduled_date, due_date, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(randomUUID(), STAR_CLASS, TEACHER, a.title, a.subject, a.grade, a.grade, JSON.stringify(a.students), TODAY, `${TODAY} ${a.time}`, new Date().toISOString());
  }

  console.log("✅ Demo data seeded (14 Star class assignments with grade targeting).");
  db.close();
}

seed().catch((e) => {
  console.error(e);
  process.exit(1);
});
