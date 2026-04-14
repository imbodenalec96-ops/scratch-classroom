import express from "express";
import cors from "cors";
import { createServer } from "http";
import { Server as IOServer } from "socket.io";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import multer from "multer";
import { mkdirSync, existsSync } from "fs";

dotenv.config({ path: join(dirname(fileURLToPath(import.meta.url)), "../../../.env") });

import { authMiddleware } from "./middleware/auth.js";
import { setupWebSocket } from "./ws.js";
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

const app = express();
const httpServer = createServer(app);
const io = new IOServer(httpServer, {
  cors: { origin: process.env.CLIENT_URL || "http://localhost:5173", credentials: true },
});

app.use(cors({ origin: process.env.CLIENT_URL || "http://localhost:5173", credentials: true }));
app.use(express.json({ limit: "50mb" }));

// File uploads
const uploadsDir = join(dirname(fileURLToPath(import.meta.url)), "../uploads");
if (!existsSync(uploadsDir)) mkdirSync(uploadsDir, { recursive: true });
const upload = multer({ dest: uploadsDir });

// Health check
app.get("/api/health", (_req, res) => res.json({ status: "ok" }));

// Auth routes (no middleware)
app.use("/api/auth", authRoutes);

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

// WebSocket
setupWebSocket(io);

const PORT = parseInt(process.env.PORT || "4000");
httpServer.listen(PORT, () => {
  console.log(`API server running on http://localhost:${PORT}`);
});
