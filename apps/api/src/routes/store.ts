import { Router, Response } from "express";
import { randomUUID } from "crypto";
import db from "../db.js";
import { AuthRequest } from "../middleware/auth.js";
import { requireRole } from "../middleware/rbac.js";

const router = Router();

// Idempotent schema bootstrap for the ClassDojo-style points store.
//
// Currency model: `users.dojo_points` — a single cumulative integer per
// student that the teacher adjusts up or down manually. This is separate
// from `board_user_data.reward_count` (5-star rollover rewards).
let schemaReady = false;
async function ensureStoreSchema() {
  if (schemaReady) return;
  try {
    // Additive: points column on users. Prefer Postgres' `IF NOT EXISTS`
    // idempotent form; fall back for older engines / SQLite via try/catch.
    try { await db.exec(`ALTER TABLE users ADD COLUMN IF NOT EXISTS dojo_points INTEGER NOT NULL DEFAULT 0`); }
    catch {
      try { await db.exec(`ALTER TABLE users ADD COLUMN dojo_points INTEGER NOT NULL DEFAULT 0`); }
      catch { /* already exists */ }
    }

    await db.exec(`
      CREATE TABLE IF NOT EXISTS store_items (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        emoji TEXT,
        price INTEGER NOT NULL DEFAULT 10,
        stock INTEGER,                       -- NULL = unlimited
        enabled INTEGER NOT NULL DEFAULT 1,
        position INTEGER NOT NULL DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now'))
      )
    `);

    await db.exec(`
      CREATE TABLE IF NOT EXISTS store_transactions (
        id TEXT PRIMARY KEY,
        student_id TEXT NOT NULL,
        item_id TEXT,
        item_name TEXT NOT NULL,
        price INTEGER NOT NULL,
        kind TEXT NOT NULL DEFAULT 'redeem',  -- 'redeem' | 'adjust'
        delta INTEGER NOT NULL DEFAULT 0,     -- for adjust entries (can be +/-)
        reason TEXT,
        actor_id TEXT,
        created_at TEXT DEFAULT (datetime('now'))
      )
    `);

    // Seed the default catalog once. Price values tuned for ClassDojo-style
    // daily spend patterns.
    const count = await db.prepare(`SELECT COUNT(*) AS n FROM store_items`).get() as any;
    if ((count?.n ?? 0) === 0) {
      const defaults: Array<{ name: string; emoji: string; price: number; stock: number | null }> = [
        { name: "Extra recess",     emoji: "🏃", price: 25, stock: null },
        { name: "Candy",            emoji: "🍬", price: 10, stock: 20 },
        { name: "Pick your seat",   emoji: "💺", price: 30, stock: null },
        { name: "Bring a toy",      emoji: "🧸", price: 40, stock: 10 },
        { name: "Teacher helper",   emoji: "🌟", price: 30, stock: null },
        { name: "Homework pass",    emoji: "📝", price: 50, stock: null },
        { name: "Sit with a friend",emoji: "👯", price: 20, stock: null },
      ];
      let pos = 0;
      for (const d of defaults) {
        await db.prepare(
          `INSERT INTO store_items (id, name, emoji, price, stock, enabled, position)
           VALUES (?, ?, ?, ?, ?, 1, ?)`
        ).run(randomUUID(), d.name, d.emoji, d.price, d.stock, pos++);
      }
    }
  } catch (e) { console.error("ensureStoreSchema:", e); }
  schemaReady = true;
}

router.use(async (_req, _res, next) => { await ensureStoreSchema(); next(); });

// ─────────────────────────────────────────────────────────────────────────
// Student-facing reads
// ─────────────────────────────────────────────────────────────────────────

// Current balance for the logged-in user. Reads `users.dojo_points` —
// NOT `board_user_data.reward_count` (those are separate 5-star rewards).
router.get("/me/balance", async (req: AuthRequest, res: Response) => {
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ error: "auth required" });
  try {
    const row: any = await db.prepare(
      `SELECT COALESCE(dojo_points, 0) AS dojo_points FROM users WHERE id = ?`
    ).get(userId);
    res.json({ dojo_points: row?.dojo_points ?? 0 });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || "balance read failed" });
  }
});

// Full store catalog (enabled items only for students; teachers see all).
router.get("/items", async (req: AuthRequest, res: Response) => {
  try {
    const isStaff = req.user?.role === "teacher" || req.user?.role === "admin";
    const sql = isStaff
      ? `SELECT * FROM store_items ORDER BY position, name`
      : `SELECT * FROM store_items WHERE enabled = 1 ORDER BY position, name`;
    const rows = await db.prepare(sql).all();
    res.json(rows);
  } catch (e: any) {
    res.status(500).json({ error: e?.message || "items read failed" });
  }
});

// Transaction log for the current student (or arbitrary student for staff).
router.get("/transactions", async (req: AuthRequest, res: Response) => {
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ error: "auth required" });
  const queryStudentId = typeof req.query.studentId === "string" ? req.query.studentId : undefined;
  const isStaff = req.user?.role === "teacher" || req.user?.role === "admin";
  const targetId = (isStaff && queryStudentId) ? queryStudentId : userId;
  try {
    const rows = await db.prepare(
      `SELECT t.*, u.name AS student_name
       FROM store_transactions t
       LEFT JOIN users u ON u.id::text = t.student_id
       WHERE t.student_id = ?
       ORDER BY t.created_at DESC LIMIT 100`
    ).all(targetId);
    res.json(rows);
  } catch (e: any) {
    res.status(500).json({ error: e?.message || "transactions read failed" });
  }
});

// Recent transactions across the whole class (teacher/admin).
router.get("/transactions/class/:classId", requireRole("teacher", "admin"), async (req: AuthRequest, res: Response) => {
  const classId = req.params.classId;
  try {
    const rows = await db.prepare(
      `SELECT t.*, u.name AS student_name
       FROM store_transactions t
       JOIN class_members cm ON cm.user_id::text = t.student_id
       LEFT JOIN users u ON u.id = cm.user_id
       WHERE cm.class_id = ?::uuid
       ORDER BY t.created_at DESC LIMIT 200`
    ).all(classId);
    res.json(rows);
  } catch (e: any) {
    res.status(500).json({ error: e?.message || "class transactions read failed" });
  }
});

// ─────────────────────────────────────────────────────────────────────────
// Student-facing: redeem an item
// ─────────────────────────────────────────────────────────────────────────

// Atomically decrement `users.dojo_points` and log the purchase. Refuses if
// balance would go negative or stock is exhausted.
router.post("/redeem", async (req: AuthRequest, res: Response) => {
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ error: "auth required" });
  const itemId = String(req.body?.itemId || "").trim();
  if (!itemId) return res.status(400).json({ error: "itemId required" });
  try {
    const item: any = await db.prepare(
      `SELECT id, name, price, stock, enabled FROM store_items WHERE id = ?`
    ).get(itemId);
    if (!item || !item.enabled) return res.status(404).json({ error: "item not available" });
    if (item.stock != null && item.stock <= 0) return res.status(409).json({ error: "out of stock" });

    const userRow: any = await db.prepare(
      `SELECT COALESCE(dojo_points, 0) AS dojo_points FROM users WHERE id = ?`
    ).get(userId);
    const balance = userRow?.dojo_points ?? 0;
    if (balance < item.price) return res.status(402).json({ error: "not enough points" });

    const newBalance = balance - item.price;
    // Decrement points
    await db.prepare(`UPDATE users SET dojo_points = ? WHERE id = ?`).run(newBalance, userId);
    // Decrement stock if tracked
    if (item.stock != null) {
      await db.prepare(`UPDATE store_items SET stock = stock - 1 WHERE id = ? AND stock > 0`).run(itemId);
    }
    // Log transaction
    await db.prepare(
      `INSERT INTO store_transactions (id, student_id, item_id, item_name, price, kind, delta, actor_id)
       VALUES (?, ?, ?, ?, ?, 'redeem', ?, ?)`
    ).run(randomUUID(), userId, itemId, item.name, item.price, -item.price, userId);

    res.json({ ok: true, dojo_points: newBalance, item: { id: item.id, name: item.name, price: item.price } });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || "redeem failed" });
  }
});

// ─────────────────────────────────────────────────────────────────────────
// Teacher/admin: item CRUD
// ─────────────────────────────────────────────────────────────────────────

router.post("/items", requireRole("teacher", "admin"), async (req: AuthRequest, res: Response) => {
  const name = String(req.body?.name || "").trim();
  const emoji = String(req.body?.emoji || "").trim() || null;
  const price = Math.max(0, Math.trunc(Number(req.body?.price ?? 10)));
  const stockRaw = req.body?.stock;
  const stock = stockRaw == null || stockRaw === "" ? null : Math.max(0, Math.trunc(Number(stockRaw)));
  if (!name) return res.status(400).json({ error: "name required" });
  try {
    const posRow: any = await db.prepare(`SELECT COALESCE(MAX(position), -1) + 1 AS p FROM store_items`).get();
    const id = randomUUID();
    await db.prepare(
      `INSERT INTO store_items (id, name, emoji, price, stock, enabled, position)
       VALUES (?, ?, ?, ?, ?, 1, ?)`
    ).run(id, name, emoji, price, stock, posRow?.p ?? 0);
    const row = await db.prepare(`SELECT * FROM store_items WHERE id = ?`).get(id);
    res.json(row);
  } catch (e: any) {
    res.status(500).json({ error: e?.message || "create failed" });
  }
});

router.put("/items/:id", requireRole("teacher", "admin"), async (req: AuthRequest, res: Response) => {
  const id = req.params.id;
  const { name, emoji, price, stock, enabled } = req.body || {};
  const updates: string[] = [];
  const params: any[] = [];
  if (typeof name === "string" && name.trim()) { updates.push("name = ?"); params.push(name.trim()); }
  if (typeof emoji === "string") { updates.push("emoji = ?"); params.push(emoji.trim() || null); }
  if (price != null) { updates.push("price = ?"); params.push(Math.max(0, Math.trunc(Number(price)))); }
  if (stock !== undefined) {
    updates.push("stock = ?");
    params.push(stock == null || stock === "" ? null : Math.max(0, Math.trunc(Number(stock))));
  }
  if (enabled != null) { updates.push("enabled = ?"); params.push(enabled ? 1 : 0); }
  if (!updates.length) return res.status(400).json({ error: "nothing to update" });
  params.push(id);
  try {
    await db.prepare(`UPDATE store_items SET ${updates.join(", ")} WHERE id = ?`).run(...params);
    const row = await db.prepare(`SELECT * FROM store_items WHERE id = ?`).get(id);
    res.json(row);
  } catch (e: any) {
    res.status(500).json({ error: e?.message || "update failed" });
  }
});

router.delete("/items/:id", requireRole("teacher", "admin"), async (req: AuthRequest, res: Response) => {
  try {
    await db.prepare(`DELETE FROM store_items WHERE id = ?`).run(req.params.id);
    res.json({ deleted: true });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || "delete failed" });
  }
});

// ─────────────────────────────────────────────────────────────────────────
// Teacher/admin: points management
// ─────────────────────────────────────────────────────────────────────────

// Every student in the class with their current dojo_points.
router.get("/points", requireRole("teacher", "admin"), async (req: AuthRequest, res: Response) => {
  const classId = typeof req.query.classId === "string" ? req.query.classId : "";
  if (!classId) return res.status(400).json({ error: "classId required" });
  try {
    const rows = await db.prepare(
      `SELECT u.id, u.name, u.avatar_emoji, COALESCE(u.dojo_points, 0) AS dojo_points
       FROM users u
       JOIN class_members cm ON cm.user_id = u.id
       WHERE cm.class_id = ?::uuid AND u.role = 'student'
       ORDER BY u.name ASC`
    ).all(classId);
    res.json(rows);
  } catch (e: any) {
    res.status(500).json({ error: e?.message || "points read failed" });
  }
});

// Adjust a single student's dojo_points by a delta (can be negative).
// Clamped at >= 0.
router.post("/points/:studentId/adjust", requireRole("teacher", "admin"), async (req: AuthRequest, res: Response) => {
  const studentId = req.params.studentId;
  const delta = Math.trunc(Number(req.body?.delta ?? 0));
  const reason = typeof req.body?.reason === "string" ? req.body.reason.slice(0, 200) : null;
  if (!Number.isFinite(delta) || delta === 0) return res.status(400).json({ error: "delta required" });
  try {
    const row: any = await db.prepare(
      `SELECT id, COALESCE(dojo_points, 0) AS dojo_points FROM users WHERE id = ?::uuid AND role = 'student'`
    ).get(studentId);
    if (!row) return res.status(404).json({ error: "student not found" });
    const next = Math.max(0, (row.dojo_points || 0) + delta);
    await db.prepare(`UPDATE users SET dojo_points = ? WHERE id = ?`).run(next, studentId);
    await db.prepare(
      `INSERT INTO store_transactions (id, student_id, item_id, item_name, price, kind, delta, reason, actor_id)
       VALUES (?, ?, NULL, ?, 0, 'adjust', ?, ?, ?)`
    ).run(randomUUID(), studentId, delta >= 0 ? "Points awarded" : "Points removed", delta, reason, req.user?.id ?? null);
    res.json({ dojo_points: next });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || "adjust failed" });
  }
});

// Bulk adjust every student in a class.
router.post("/points/class/:classId/adjust", requireRole("teacher", "admin"), async (req: AuthRequest, res: Response) => {
  const classId = req.params.classId;
  const delta = Math.trunc(Number(req.body?.delta ?? 0));
  const reason = typeof req.body?.reason === "string" ? req.body.reason.slice(0, 200) : null;
  if (!Number.isFinite(delta) || delta === 0) return res.status(400).json({ error: "delta required" });
  try {
    const students = await db.prepare(
      `SELECT u.id, COALESCE(u.dojo_points, 0) AS dojo_points
       FROM users u JOIN class_members cm ON cm.user_id = u.id
       WHERE cm.class_id = ?::uuid AND u.role = 'student'`
    ).all(classId) as any[];
    let updated = 0;
    for (const s of students) {
      const next = Math.max(0, (s.dojo_points || 0) + delta);
      await db.prepare(`UPDATE users SET dojo_points = ? WHERE id = ?`).run(next, s.id);
      await db.prepare(
        `INSERT INTO store_transactions (id, student_id, item_id, item_name, price, kind, delta, reason, actor_id)
         VALUES (?, ?, NULL, ?, 0, 'adjust', ?, ?, ?)`
      ).run(randomUUID(), s.id, delta >= 0 ? "Whole-class reward" : "Whole-class penalty", delta, reason, req.user?.id ?? null);
      updated++;
    }
    res.json({ updated });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || "bulk adjust failed" });
  }
});

export default router;
