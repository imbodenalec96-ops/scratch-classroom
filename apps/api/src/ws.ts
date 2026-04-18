import { Server as IOServer, Socket } from "socket.io";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import type { User } from "@scratch/shared";
import db from "./db.js";

const JWT_SECRET = process.env.JWT_SECRET || "dev-secret";

interface AuthSocket extends Socket {
  user?: User;
}

export function setupWebSocket(io: IOServer) {
  // Auth middleware for sockets
  io.use((socket: AuthSocket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error("No token"));
    try {
      const user = jwt.verify(token, JWT_SECRET) as User;
      socket.user = user;
      next();
    } catch {
      next(new Error("Invalid token"));
    }
  });

  io.on("connection", (socket: AuthSocket) => {
    const user = socket.user!;
    console.log(`WS connected: ${user.name} (${user.role})`);

    // Join class rooms
    socket.on("join:class", (classId: string) => {
      socket.join(`class:${classId}`);
    });

    // Join project room (for collaboration)
    socket.on("join:project", (projectId: string) => {
      socket.join(`project:${projectId}`);
    });

    // Real-time project updates (collaboration)
    socket.on("project:update", (data: { projectId: string; sprites: any[] }) => {
      socket.to(`project:${data.projectId}`).emit("project:update", {
        ...data,
        userId: user.id,
        userName: user.name,
      });
    });

    // Chat messages
    socket.on("chat:message", async (data: { classId: string; text: string }) => {
      const id = crypto.randomUUID();
      await db.prepare(
        "INSERT INTO chat_messages (id, class_id, sender_id, text) VALUES (?, ?, ?, ?)"
      ).run(id, data.classId, user.id, data.text);
      const row = await db.prepare("SELECT * FROM chat_messages WHERE id = ?").get(id) as any;
      io.to(`class:${data.classId}`).emit("chat:message", {
        ...row,
        sender_name: user.name,
      });
    });

    // Teacher: broadcast announcement
    socket.on("class:broadcast", (data: { classId: string; message: string }) => {
      if (user.role === "teacher" || user.role === "admin") {
        io.to(`class:${data.classId}`).emit("class:broadcast", {
          message: data.message,
          from: user.name,
          timestamp: new Date().toISOString(),
        });
      }
    });

    // Teacher: lock/unlock student screens
    socket.on("class:lock", (data: { classId: string; locked: boolean }) => {
      if (user.role === "teacher" || user.role === "admin") {
        io.to(`class:${data.classId}`).emit("class:lock", { locked: data.locked });
      }
    });

    // Teacher/admin: broadcast a YouTube video to the whole class
    socket.on("class:video", (data: { classId: string; videoId: string; url?: string; title?: string }) => {
      if (user.role === "teacher" || user.role === "admin") {
        io.to(`class:${data.classId}`).emit("class:video", {
          classId: data.classId,
          videoId: data.videoId,
          url: data.url,
          title: data.title,
        });
      }
    });
    socket.on("class:video:stop", (data: { classId: string }) => {
      if (user.role === "teacher" || user.role === "admin") {
        io.to(`class:${data.classId}`).emit("class:video:stop", { classId: data.classId });
      }
    });

    // Student: send screen preview
    socket.on("student:screen", (data: { classId: string; screenshot: string }) => {
      if (user.role === "student") {
        io.to(`class:${data.classId}`).emit("student:screen", {
          studentId: user.id,
          studentName: user.name,
          screenshot: data.screenshot,
        });
      }
    });

    socket.on("disconnect", () => {
      console.log(`WS disconnected: ${user.name}`);
    });
  });
}
