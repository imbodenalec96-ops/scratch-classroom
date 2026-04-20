import { Pool } from "pg";
import dotenv from "dotenv";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { randomUUID } from "crypto";

dotenv.config({ path: join(dirname(fileURLToPath(import.meta.url)), "../../../../.env") });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes("localhost") ? false : { rejectUnauthorized: false },
});

async function seed() {
  const client = await pool.connect();
  try {
    console.log("Seeding PostgreSQL database...");

    // Create user_grade_levels table if it doesn't exist
    console.log("Creating user_grade_levels table...");
    await client.query(`
      CREATE TABLE IF NOT EXISTS user_grade_levels (
        user_id TEXT PRIMARY KEY,
        reading_grade INTEGER,
        math_grade INTEGER,
        writing_grade INTEGER
      )
    `);

    // Insert student grades
    console.log("Inserting student grades...");
    await client.query(`
      INSERT INTO user_grade_levels (user_id, reading_grade, math_grade, writing_grade) VALUES
        ('s0000000-0000-0000-0000-000000000005', 3, 2, 3),
        ('s0000000-0000-0000-0000-000000000008', 5, 5, 5),
        ('s0000000-0000-0000-0000-000000000007', 1, 1, 0),
        ('s0000000-0000-0000-0000-000000000002', 3, 4, 5),
        ('s0000000-0000-0000-0000-000000000006', 2, 2, 2),
        ('s0000000-0000-0000-0000-000000000003', 3, 3, 3),
        ('s0000000-0000-0000-0000-000000000001', 5, 5, 5),
        ('s0000000-0000-0000-0000-000000000004', 1, 2, 2)
      ON CONFLICT (user_id) DO UPDATE SET
        reading_grade = EXCLUDED.reading_grade,
        math_grade = EXCLUDED.math_grade,
        writing_grade = EXCLUDED.writing_grade
    `);

    // Check if assignments exist for today
    const STAR_CLASS = 'b0000000-0000-0000-0000-000000000002';
    const TODAY = new Date().toISOString().split('T')[0];

    const result = await client.query(
      "SELECT COUNT(*) as count FROM assignments WHERE class_id = $1 AND scheduled_date = $2",
      [STAR_CLASS, TODAY]
    );

    if (result.rows[0].count === 0) {
      console.log("Creating Star class assignments for today...");
      const TEACHER = 'a0000000-0000-0000-0000-000000000002';

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
        await client.query(`
          INSERT INTO assignments (id, class_id, teacher_id, title, target_subject, target_grade_min, target_grade_max, target_student_ids, scheduled_date, due_date, created_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
          ON CONFLICT (id) DO NOTHING
        `, [
          randomUUID(),
          STAR_CLASS,
          TEACHER,
          a.title,
          a.subject,
          a.grade,
          a.grade,
          JSON.stringify(a.students),
          TODAY,
          `${TODAY} ${a.time}`,
          new Date().toISOString()
        ]);
      }

      console.log("✅ 14 Star class assignments created");
    } else {
      console.log(`ℹ️ ${result.rows[0].count} assignments already exist for today`);
    }

    console.log("✅ Database seeding completed");
  } catch (error) {
    console.error("Seeding error:", error);
    throw error;
  } finally {
    await client.release();
    await pool.end();
  }
}

seed().catch((e) => {
  console.error(e);
  process.exit(1);
});
