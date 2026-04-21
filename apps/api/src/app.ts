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
import adminAssignmentRoutes from "./routes/admin-assignments.js";

const app = express();

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
app.get("/api/ping", async (_req, res) => {
  try { await db.prepare("SELECT 1").all(); res.json({ ok: true }); }
  catch { res.json({ ok: false }); }
});

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

// Admin routes (no auth required for now)
app.use("/api/admin", adminAssignmentRoutes);

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

// Keep Neon from going to sleep — ping every 4 minutes
setInterval(async () => {
  try { await db.prepare("SELECT 1").all(); } catch { /* ignore */ }
}, 4 * 60 * 1000);

export default app;
