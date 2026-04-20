import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import multer from "multer";
import { mkdirSync, existsSync } from "fs";

dotenv.config({ path: join(dirname(fileURLToPath(import.meta.url)), "../../../.env") });

import db from "./db.js";
import { authMiddleware } from "./middleware/auth.js";
import authRoutes from "./routes/auth.js";
import classRoutes from "./routes/classes.js";
import projectRoutes from "./routes/projects.js";
import assignmentRoutes, { servePdfAttachment } from "./routes/assignments.js";
import submissionRoutes from "./routes/submissions.js";
import quizRoutes from "./routes/quizzes.js";
import analyticsRoutes from "./routes/analytics.js";
import chatRoutes from "./routes/chat.js";
import leaderboardRoutes from "./routes/leaderboard.js";
import userRoutes from "./routes/users.js";
import aiRoutes from "./routes/ai.js";
import studentRoutes from "./routes/students.js";
import { scheduleExtrasClassRoutes, scheduleExtrasStudentRoutes } from "./routes/schedule-extras.js";
import taskRoutes from "./routes/tasks.js";
import breakRoutes from "./routes/breaks.js";
import worksheetRoutes from "./routes/worksheets.js";
import youtubeRoutes from "./routes/youtube.js";
import adminSettingsRoutes from "./routes/admin-settings.js";
import aiTasksRoutes from "./routes/ai-tasks.js";
import lessonsRoutes from "./routes/lessons.js";
import gradesRoutes from "./routes/grades.js";
import websitesRoutes from "./routes/websites.js";
import dailyNewsRoutes from "./routes/daily-news.js";
import boardRoutes from "./routes/board.js";
import storeRoutes from "./routes/store.js";
import { randomUUID } from "crypto";

// Auto-seed database on startup (production with PostgreSQL)
async function seedDatabaseIfNeeded() {
  if (process.env.DATABASE_URL && process.env.VERCEL) {
    try {
      console.log("🌱 Database initialization check...");
      const pg = await import("pg");
      const pool = new pg.default.Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: process.env.DATABASE_URL.includes("localhost") ? false : { rejectUnauthorized: false },
        max: 1,
      });

      const client = await pool.connect();
      try {
        // Create user_grade_levels if needed
        await client.query(`
          CREATE TABLE IF NOT EXISTS user_grade_levels (
            user_id TEXT PRIMARY KEY,
            reading_grade INTEGER,
            math_grade INTEGER,
            writing_grade INTEGER
          )
        `);

        // Check if needs initial seed
        const checkResult = await client.query("SELECT COUNT(*) as count FROM user_grade_levels");
        if (checkResult.rows[0].count === 0) {
          console.log("📚 Seeding student grades...");
          const grades = [
            ['s0000000-0000-0000-0000-000000000005', 3, 2, 3],
            ['s0000000-0000-0000-0000-000000000008', 5, 5, 5],
            ['s0000000-0000-0000-0000-000000000007', 1, 1, 0],
            ['s0000000-0000-0000-0000-000000000002', 3, 4, 5],
            ['s0000000-0000-0000-0000-000000000006', 2, 2, 2],
            ['s0000000-0000-0000-0000-000000000003', 3, 3, 3],
            ['s0000000-0000-0000-0000-000000000001', 5, 5, 5],
            ['s0000000-0000-0000-0000-000000000004', 1, 2, 2],
          ];

          for (const [userId, readGrade, mathGrade, writeGrade] of grades) {
            await client.query(
              `INSERT INTO user_grade_levels (user_id, reading_grade, math_grade, writing_grade)
               VALUES ($1, $2, $3, $4)
               ON CONFLICT (user_id) DO UPDATE SET
                 reading_grade = $2, math_grade = $3, writing_grade = $4`,
              [userId, readGrade, mathGrade, writeGrade]
            );
          }
          console.log("✅ Student grades seeded");

          // Check if Star class assignments exist for today
          const TODAY = new Date().toISOString().split('T')[0];
          const STAR_CLASS = 'b0000000-0000-0000-0000-000000000002';
          const assignmentCheck = await client.query(
            "SELECT COUNT(*) as count FROM assignments WHERE class_id = $1 AND scheduled_date = $2",
            [STAR_CLASS, TODAY]
          );

          if (assignmentCheck.rows[0].count === 0) {
            console.log("📝 Creating Star class assignments for today...");
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
              await client.query(
                `INSERT INTO assignments (id, class_id, teacher_id, title, target_subject, target_grade_min, target_grade_max, target_student_ids, scheduled_date, due_date, created_at)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
                 ON CONFLICT (id) DO NOTHING`,
                [
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
                ]
              );
            }
            console.log("✅ 14 Star class assignments created");
          } else {
            console.log(`ℹ️ ${assignmentCheck.rows[0].count} assignments already exist for today`);
          }
        } else {
          console.log("✅ Database already initialized");
        }
      } finally {
        await client.release();
        await pool.end();
      }
    } catch (error) {
      console.warn("⚠️ Database seeding check failed (non-fatal):", error instanceof Error ? error.message : error);
    }
  }
}

const app = express();

// Initialize database on startup
seedDatabaseIfNeeded().catch(console.warn);

const allowedOrigins = (process.env.CLIENT_URL || "http://localhost:5173").split(",");
app.use(cors({ origin: allowedOrigins, credentials: true }));
app.use(express.json({ limit: "50mb" }));

// File uploads (skip on Vercel — filesystem is read-only and ephemeral)
const uploadsDir = process.env.VERCEL
  ? "/tmp/uploads"
  : join(dirname(fileURLToPath(import.meta.url)), "../uploads");
if (!existsSync(uploadsDir)) mkdirSync(uploadsDir, { recursive: true });
const upload = multer({ dest: uploadsDir });

// Health check
app.get("/api/health", (_req, res) => res.json({ status: "ok" }));

// Status endpoint (public, no auth)
const startTime = Date.now();
app.get("/api/status", async (_req, res) => {
  try {
    const studentCount = ((await db.prepare("SELECT COUNT(*) as n FROM students WHERE active=1").get()) as any).n;
    const worksheetCount = ((await db.prepare("SELECT COUNT(*) as n FROM worksheet_library").get()) as any).n;
    const breaksToday = ((await db.prepare("SELECT COUNT(*) as n FROM break_log WHERE date=date('now')").get()) as any).n;
    res.json({ ok: true, uptime: Math.floor((Date.now() - startTime) / 1000), studentCount, worksheetCount, breaksToday });
  } catch {
    res.json({ ok: true, uptime: Math.floor((Date.now() - startTime) / 1000) });
  }
});

// Auth routes (no middleware)
app.use("/api/auth", authRoutes);

// Protected routes
app.use("/api/classes", authMiddleware, classRoutes);
app.use("/api/classes", authMiddleware, scheduleExtrasClassRoutes);
app.use("/api/projects", authMiddleware, projectRoutes);
// Public PDF-serving route (iframes can't send auth headers). Assignment
// IDs are UUIDs, so this endpoint is not practically enumerable.
app.get("/api/assignments/:id/pdf", (req, res) => servePdfAttachment(req.params.id, res));
app.use("/api/assignments", authMiddleware, assignmentRoutes);
app.use("/api/submissions", authMiddleware, submissionRoutes);
app.use("/api/quizzes", authMiddleware, quizRoutes);
app.use("/api/analytics", authMiddleware, analyticsRoutes);
app.use("/api/chat", authMiddleware, chatRoutes);
app.use("/api/leaderboard", authMiddleware, leaderboardRoutes);
app.use("/api/users", authMiddleware, userRoutes);
app.use("/api/ai", authMiddleware, aiRoutes);
app.use("/api/students", authMiddleware, studentRoutes);
app.use("/api/students", authMiddleware, scheduleExtrasStudentRoutes);
app.use("/api/tasks", authMiddleware, taskRoutes);
app.use("/api/breaks", authMiddleware, breakRoutes);
app.use("/api/worksheets", authMiddleware, worksheetRoutes);
app.use("/api/youtube", authMiddleware, youtubeRoutes);
app.use("/api/admin-settings", authMiddleware, adminSettingsRoutes);
app.use("/api/ai-tasks", authMiddleware, aiTasksRoutes);
app.use("/api/lessons", authMiddleware, lessonsRoutes);
app.use("/api/grades", authMiddleware, gradesRoutes);
app.use("/api/websites", authMiddleware, websitesRoutes);
app.use("/api/classes", authMiddleware, dailyNewsRoutes);
app.use("/api/board", authMiddleware, boardRoutes);
app.use("/api/store", authMiddleware, storeRoutes);

// File upload endpoint
app.post("/api/upload", authMiddleware, upload.single("file"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file" });
  res.json({
    id: req.file.filename,
    name: req.file.originalname,
    url: `/api/files/${req.file.filename}`,
    type: req.file.mimetype.startsWith("image") ? "image" : req.file.mimetype.startsWith("audio") ? "sound" : "model",
  });
});

// Serve uploaded files
app.use("/api/files", express.static(uploadsDir));

export default app;
