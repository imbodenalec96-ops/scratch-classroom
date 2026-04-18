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
import assignmentRoutes from "./routes/assignments.js";
import submissionRoutes from "./routes/submissions.js";
import quizRoutes from "./routes/quizzes.js";
import analyticsRoutes from "./routes/analytics.js";
import chatRoutes from "./routes/chat.js";
import leaderboardRoutes from "./routes/leaderboard.js";
import userRoutes from "./routes/users.js";
import aiRoutes from "./routes/ai.js";
import studentRoutes from "./routes/students.js";
import taskRoutes from "./routes/tasks.js";
import breakRoutes from "./routes/breaks.js";
import worksheetRoutes from "./routes/worksheets.js";
import youtubeRoutes from "./routes/youtube.js";
import adminSettingsRoutes from "./routes/admin-settings.js";
import aiTasksRoutes from "./routes/ai-tasks.js";
import lessonsRoutes from "./routes/lessons.js";
import gradesRoutes from "./routes/grades.js";

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

// Public board endpoint — no auth, for TV kiosk. Accepts class ID or name (e.g. "star").
app.get("/api/board/class/:nameOrId", async (req: express.Request, res: express.Response) => {
  try {
    const { nameOrId } = req.params;
    let cls = await db.prepare("SELECT id, name FROM classes WHERE id = ?").get(nameOrId) as any;
    if (!cls) {
      cls = await db.prepare("SELECT id, name FROM classes WHERE LOWER(name) = LOWER(?) LIMIT 1").get(nameOrId) as any;
    }
    if (!cls) return res.status(404).json({ error: "Class not found" });
    const schedule = await db.prepare(
      "SELECT * FROM class_schedule WHERE class_id = ? ORDER BY block_number ASC"
    ).all(cls.id);
    res.json({ id: cls.id, name: cls.name, schedule });
  } catch {
    res.status(500).json({ error: "Failed to load board data" });
  }
});

// Protected routes
app.use("/api/classes", authMiddleware, classRoutes);
app.use("/api/projects", authMiddleware, projectRoutes);
app.use("/api/assignments", authMiddleware, assignmentRoutes);
app.use("/api/submissions", authMiddleware, submissionRoutes);
app.use("/api/quizzes", authMiddleware, quizRoutes);
app.use("/api/analytics", authMiddleware, analyticsRoutes);
app.use("/api/chat", authMiddleware, chatRoutes);
app.use("/api/leaderboard", authMiddleware, leaderboardRoutes);
app.use("/api/users", authMiddleware, userRoutes);
app.use("/api/ai", authMiddleware, aiRoutes);
app.use("/api/students", authMiddleware, studentRoutes);
app.use("/api/tasks", authMiddleware, taskRoutes);
app.use("/api/breaks", authMiddleware, breakRoutes);
app.use("/api/worksheets", authMiddleware, worksheetRoutes);
app.use("/api/youtube", authMiddleware, youtubeRoutes);
app.use("/api/admin-settings", authMiddleware, adminSettingsRoutes);
app.use("/api/ai-tasks", authMiddleware, aiTasksRoutes);
app.use("/api/lessons", authMiddleware, lessonsRoutes);
app.use("/api/grades", authMiddleware, gradesRoutes);

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
