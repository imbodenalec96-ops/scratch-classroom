import { Router, Response } from "express";
import crypto from "crypto";
import db from "../db.js";
import { AuthRequest } from "../middleware/auth.js";
import { requireRole } from "../middleware/rbac.js";

const router = Router();

// ── Idempotent migrations ──────────────────────────────────────────
let migrated = false;
let seeded = false;

// v2 — all sites verified to allow iframe embedding (no X-Frame-Options: DENY/SAMEORIGIN)
const SEED_VERSION = 2;
const DEFAULT_WEBSITES = [
  { title: "Poki Games",           url: "https://poki.com",                       category: "Games",          icon: "🎮" },
  { title: "Cool Math Games",      url: "https://www.coolmathgames.com",          category: "Math Games",     icon: "🧮" },
  { title: "ABCya!",               url: "https://www.abcya.com",                  category: "Learning Games", icon: "🎯" },
  { title: "Hooda Math",           url: "https://www.hoodamath.com",              category: "Math",           icon: "🔢" },
  { title: "Math Playground",      url: "https://www.mathplayground.com",         category: "Math",           icon: "🏀" },
  { title: "Arcademics",           url: "https://www.arcademics.com",             category: "Academic Games", icon: "🏆" },
  { title: "Sheppard Software",    url: "https://www.sheppardsoftware.com",       category: "Educational",    icon: "🦊" },
  { title: "Soft Schools",         url: "https://www.softschools.com",            category: "Educational",    icon: "📚" },
  { title: "Turtle Diary",         url: "https://www.turtlediary.com",            category: "Learning Games", icon: "🐢" },
  { title: "Primary Games",        url: "https://www.primarygames.com",           category: "Games",          icon: "🌟" },
  { title: "Funbrain",             url: "https://www.funbrain.com",               category: "Learning",       icon: "🧠" },
  { title: "PBS Kids",             url: "https://pbskids.org",                    category: "Educational",    icon: "📺" },
  { title: "Storyline Online",     url: "https://storylineonline.net",            category: "Reading",        icon: "📖" },
  { title: "Nitro Type",           url: "https://www.nitrotype.com",              category: "Typing",         icon: "🚗" },
  { title: "Typing Club",          url: "https://www.typingclub.com",             category: "Typing",         icon: "⌨️" },
  { title: "Word Wall",            url: "https://wordwall.net",                   category: "Vocabulary",     icon: "🔤" },
  { title: "XtraMath",             url: "https://xtramath.org",                   category: "Math",           icon: "➕" },
  { title: "Starfall",             url: "https://www.starfall.com",               category: "Reading",        icon: "⭐" },
  { title: "Nat Geo Kids",         url: "https://kids.nationalgeographic.com",    category: "Science",        icon: "🌍" },
  { title: "NASA STEM",            url: "https://www.nasa.gov/stem/forstudents/k-4/index.html", category: "Science", icon: "🚀" },
];

async function ensureTables() {
  if (migrated) return;
  try {
    await db.exec(`
      CREATE TABLE IF NOT EXISTS website_requests (
        id TEXT PRIMARY KEY,
        student_id TEXT NOT NULL,
        title TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        teacher_note TEXT,
        requested_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await db.exec(`
      CREATE TABLE IF NOT EXISTS approved_websites (
        id TEXT PRIMARY KEY,
        class_id TEXT,
        title TEXT NOT NULL,
        url TEXT NOT NULL,
        category TEXT,
        thumbnail_url TEXT,
        icon_emoji TEXT,
        added_by TEXT,
        added_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await db.exec(`
      CREATE TABLE IF NOT EXISTS student_approved_websites (
        id TEXT PRIMARY KEY,
        student_id TEXT NOT NULL,
        approved_website_id TEXT NOT NULL,
        granted_by TEXT,
        granted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
    // Postgres: ADD COLUMN IF NOT EXISTS; SQLite silently fails the outer catch
    try { await db.exec(`ALTER TABLE approved_websites ADD COLUMN IF NOT EXISTS icon_emoji TEXT`); } catch {
      try { await db.exec(`ALTER TABLE approved_websites ADD COLUMN icon_emoji TEXT`); } catch {}
    }
  } catch (e) {
    console.error("[websites] migration error:", e);
  }
  migrated = true;
}

// Separate seed fn — checks version tag on each cold start so updating
// DEFAULT_WEBSITES triggers a re-seed automatically.
async function seedDefaultsIfEmpty() {
  if (seeded) return;
  seeded = true;
  try {
    await ensureTables();
    // Check stored seed version via a sentinel row with title='__seed_version__'
    const versionRow = await db.prepare(
      `SELECT url FROM approved_websites WHERE added_by = 'system' AND title = '__seed_version__' LIMIT 1`
    ).get() as any;
    const currentVersion = parseInt(String(versionRow?.url ?? "0"), 10);
    if (currentVersion >= SEED_VERSION) return; // already at current version

    // Remove old system-seeded sites and re-seed with the new list
    await db.prepare(`DELETE FROM approved_websites WHERE added_by = 'system'`).run();
    for (const site of DEFAULT_WEBSITES) {
      const id = crypto.randomUUID();
      await db.prepare(
        `INSERT INTO approved_websites (id, class_id, title, url, category, icon_emoji, added_by) VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).run(id, null, site.title, site.url, site.category, site.icon, "system");
    }
    // Store version sentinel
    await db.prepare(
      `INSERT INTO approved_websites (id, class_id, title, url, category, icon_emoji, added_by) VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(crypto.randomUUID(), null, "__seed_version__", String(SEED_VERSION), null, null, "system");
    console.log(`[websites] seeded v${SEED_VERSION} — ${DEFAULT_WEBSITES.length} default sites`);
  } catch (e) {
    seeded = false;
    console.error("[websites] seed error:", e);
  }
}

// Eager cold-start seed — runs when module loads so the library is
// populated before the first request arrives.
ensureTables().then(seedDefaultsIfEmpty).catch(e => console.error("[websites] startup seed error:", e));

// ── Student: submit a new website request ──────────────────────────
// Student ONLY provides a title — no URL. Teacher vets and adds the URL.
router.post("/request", async (req: AuthRequest, res: Response) => {
  await ensureTables();
  const title = String(req.body?.title || "").trim();
  if (!title) return res.status(400).json({ error: "title is required" });
  if (title.length > 200) return res.status(400).json({ error: "title too long" });
  const id = crypto.randomUUID();
  await db.prepare(
    `INSERT INTO website_requests (id, student_id, title, status) VALUES (?, ?, ?, 'pending')`
  ).run(id, req.user!.id, title);
  const row = await db.prepare("SELECT * FROM website_requests WHERE id = ?").get(id);
  res.json(row);
});

// ── Student: my granted websites ───────────────────────────────────
router.get("/mine", async (req: AuthRequest, res: Response) => {
  try {
    await ensureTables();
    await seedDefaultsIfEmpty();
    const userId = req.user!.id;
    // Individually granted sites
    const granted = await db.prepare(
      `SELECT w.id, w.title, w.url, w.category, w.thumbnail_url, w.icon_emoji, w.added_at,
              sw.granted_at
         FROM student_approved_websites sw
         JOIN approved_websites w ON w.id = sw.approved_website_id
        WHERE sw.student_id = ?
        ORDER BY sw.granted_at DESC`
    ).all(userId) as any[];
    // Class-library sites: websites in classes the student is enrolled in, plus global (class_id IS NULL) entries
    let classLibrary: any[] = [];
    try {
      classLibrary = await db.prepare(
        `SELECT DISTINCT w.id, w.title, w.url, w.category, w.thumbnail_url, w.icon_emoji, w.added_at,
                w.added_at AS granted_at
           FROM approved_websites w
          WHERE (w.class_id IN (SELECT class_id FROM class_members WHERE user_id = ?) OR w.class_id IS NULL)
            AND w.title != '__seed_version__'
          ORDER BY w.added_at DESC`
      ).all(userId) as any[];
    } catch {
      // Fallback: just return global (class_id IS NULL) sites if class_members query fails
      classLibrary = await db.prepare(
        `SELECT w.id, w.title, w.url, w.category, w.thumbnail_url, w.icon_emoji, w.added_at,
                w.added_at AS granted_at
           FROM approved_websites w
          WHERE w.class_id IS NULL AND w.title != '__seed_version__'
          ORDER BY w.added_at DESC`
      ).all() as any[];
    }
    // Merge: deduplicate by id, granted entries take priority
    const seen = new Set<string>();
    const merged: any[] = [];
    for (const w of [...granted, ...classLibrary]) {
      if (!seen.has(w.id)) { seen.add(w.id); merged.push(w); }
    }
    res.json(merged);
  } catch (e: any) {
    console.error("[websites/mine]", e);
    res.status(500).json({ error: e?.message || "Failed to load websites" });
  }
});

// ── Student: resolve one website by id (for the embedded viewer) ───
// Returns the website row only if this student has been granted access.
// Prevents a student from typing /app/<someoneElsesId> and getting a URL.
router.get("/mine/:id", async (req: AuthRequest, res: Response) => {
  try {
    await ensureTables();
    const userId = req.user!.id;
    const id = req.params.id;
    // Check individually granted first
    let row: any = await db.prepare(
      `SELECT w.id, w.title, w.url, w.category, w.thumbnail_url, w.icon_emoji
         FROM student_approved_websites sw
         JOIN approved_websites w ON w.id = sw.approved_website_id
        WHERE sw.student_id = ? AND w.id = ?
        LIMIT 1`
    ).get(userId, id);
    // Fall back to class library + global (class_id IS NULL) sites
    if (!row) {
      try {
        row = await db.prepare(
          `SELECT w.id, w.title, w.url, w.category, w.thumbnail_url, w.icon_emoji
             FROM approved_websites w
            WHERE w.id = ?
              AND (w.class_id IN (SELECT class_id FROM class_members WHERE user_id = ?)
                   OR w.class_id IS NULL)
            LIMIT 1`
        ).get(id, userId);
      } catch {
        // class_members join failed — fall back to global-only check
        row = await db.prepare(
          `SELECT w.id, w.title, w.url, w.category, w.thumbnail_url, w.icon_emoji
             FROM approved_websites w
            WHERE w.id = ? AND w.class_id IS NULL
            LIMIT 1`
        ).get(id);
      }
    }
    if (!row) return res.status(404).json({ error: "Website not found or not unlocked for you" });
    res.json(row);
  } catch (e: any) {
    console.error("[websites/mine/:id]", e);
    res.status(500).json({ error: e?.message || "Failed to load website" });
  }
});

// ── Teacher/admin: list all pending requests across the teacher's classes ──
// Class-scoped list: returns pending requests from students who are members
// of any class the teacher owns (admin sees all).
router.get("/requests/pending", requireRole("teacher", "admin"), async (req: AuthRequest, res: Response) => {
  await ensureTables();
  let rows: any[];
  if (req.user!.role === "admin") {
    rows = await db.prepare(
      `SELECT r.*, u.name AS student_name
         FROM website_requests r
         JOIN users u ON u.id = r.student_id
        WHERE r.status = 'pending'
        ORDER BY r.requested_at DESC`
    ).all() as any[];
  } else {
    // Show all pending requests — teacher doesn't need to own the class
    rows = await db.prepare(
      `SELECT r.*, u.name AS student_name
         FROM website_requests r
         JOIN users u ON u.id = r.student_id
        WHERE r.status = 'pending'
        ORDER BY r.requested_at DESC`
    ).all() as any[];
  }
  res.json(rows);
});

// ── Teacher/admin: class website requests (same shape, filtered by class) ──
router.get("/classes/:classId/requests", requireRole("teacher", "admin"), async (req: AuthRequest, res: Response) => {
  await ensureTables();
  const rows = await db.prepare(
    `SELECT DISTINCT r.*, u.name AS student_name
       FROM website_requests r
       JOIN users u ON u.id = r.student_id
       JOIN class_members cm ON cm.user_id = r.student_id
      WHERE r.status = 'pending' AND cm.class_id = ?
      ORDER BY r.requested_at DESC`
  ).all(req.params.classId) as any[];
  res.json(rows);
});

// ── Teacher/admin: approve — add URL to library + mark request approved ──
// Body: { requestId?, title, url, category?, classId?, thumbnailUrl? }
// If requestId is provided, its status becomes 'approved' and it links to
// the new library entry via teacher_note (kept simple: stringified refs).
router.post("/approve", requireRole("teacher", "admin"), async (req: AuthRequest, res: Response) => {
  try {
    await ensureTables();
    const { requestId, title, url, category, classId, thumbnailUrl, iconEmoji } = req.body || {};
    const cleanTitle = String(title || "").trim();
    const cleanUrl = String(url || "").trim();
    if (!cleanTitle || !cleanUrl) return res.status(400).json({ error: "title and url required" });
    if (!/^https?:\/\//i.test(cleanUrl)) return res.status(400).json({ error: "url must start with http:// or https://" });

    const id = crypto.randomUUID();
    await db.prepare(
      `INSERT INTO approved_websites (id, class_id, title, url, category, thumbnail_url, icon_emoji, added_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(id, classId || null, cleanTitle, cleanUrl, category || null, thumbnailUrl || null, iconEmoji || null, req.user!.id);

    if (requestId) {
      await db.prepare(
        `UPDATE website_requests SET status = 'approved', teacher_note = ? WHERE id = ?`
      ).run(`website:${id}`, requestId);
      const req_row = await db.prepare(`SELECT student_id FROM website_requests WHERE id = ?`).get(requestId) as any;
      if (req_row?.student_id) {
        const grantExists = await db.prepare(
          `SELECT id FROM student_approved_websites WHERE student_id = ? AND approved_website_id = ?`
        ).get(req_row.student_id, id) as any;
        if (!grantExists) {
          const grantId = crypto.randomUUID();
          await db.prepare(
            `INSERT INTO student_approved_websites (id, student_id, approved_website_id, granted_by) VALUES (?, ?, ?, ?)`
          ).run(grantId, req_row.student_id, id, req.user!.id);
        }
      }
    }

    const row = await db.prepare("SELECT * FROM approved_websites WHERE id = ?").get(id);
    res.json(row);
  } catch (e: any) {
    console.error("[websites/approve]", e);
    res.status(500).json({ error: e?.message || "Failed to add website" });
  }
});

// ── Teacher/admin: deny a request ──────────────────────────────────
router.post("/deny", requireRole("teacher", "admin"), async (req: AuthRequest, res: Response) => {
  try {
    await ensureTables();
    const { requestId, note } = req.body || {};
    if (!requestId) return res.status(400).json({ error: "requestId required" });
    await db.prepare(
      `UPDATE website_requests SET status = 'denied', teacher_note = ? WHERE id = ?`
    ).run(String(note || ""), requestId);
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || "Failed to deny request" });
  }
});

// ── Teacher/admin: library (list approved websites) ─────────────────
router.get("/library", requireRole("teacher", "admin"), async (req: AuthRequest, res: Response) => {
  try {
    await ensureTables();
    await seedDefaultsIfEmpty();
    const classId = req.query.classId ? String(req.query.classId) : null;
    const rows = classId
      ? await db.prepare(
          `SELECT * FROM approved_websites WHERE (class_id = ? OR class_id IS NULL) AND title != '__seed_version__' ORDER BY added_at DESC`
        ).all(classId)
      : await db.prepare(`SELECT * FROM approved_websites WHERE title != '__seed_version__' ORDER BY added_at DESC`).all();
    res.json(rows);
  } catch (e: any) {
    console.error("[websites/library GET]", e);
    res.status(500).json({ error: e?.message || "Failed to load library" });
  }
});

// ── Teacher/admin: delete a library entry ──────────────────────────
router.delete("/library/:id", requireRole("teacher", "admin"), async (req: AuthRequest, res: Response) => {
  try {
    await ensureTables();
    await db.prepare("DELETE FROM student_approved_websites WHERE approved_website_id = ?").run(req.params.id);
    await db.prepare("DELETE FROM approved_websites WHERE id = ?").run(req.params.id);
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || "Failed to delete website" });
  }
});

// ── Teacher/admin: grant a website to a student ────────────────────
router.post("/grant", requireRole("teacher", "admin"), async (req: AuthRequest, res: Response) => {
  await ensureTables();
  const { studentId, websiteId } = req.body || {};
  if (!studentId || !websiteId) return res.status(400).json({ error: "studentId + websiteId required" });
  // Upsert-style: dedupe so a repeat grant doesn't create dupes
  const existing = await db.prepare(
    `SELECT id FROM student_approved_websites WHERE student_id = ? AND approved_website_id = ?`
  ).get(studentId, websiteId) as any;
  if (existing) return res.json({ ok: true, id: existing.id, deduped: true });
  const id = crypto.randomUUID();
  await db.prepare(
    `INSERT INTO student_approved_websites (id, student_id, approved_website_id, granted_by)
     VALUES (?, ?, ?, ?)`
  ).run(id, studentId, websiteId, req.user!.id);
  res.json({ ok: true, id });
});

// ── Teacher/admin: revoke a student's grant ────────────────────────
router.post("/revoke", requireRole("teacher", "admin"), async (req: AuthRequest, res: Response) => {
  await ensureTables();
  const { studentId, websiteId } = req.body || {};
  if (!studentId || !websiteId) return res.status(400).json({ error: "studentId + websiteId required" });
  await db.prepare(
    `DELETE FROM student_approved_websites WHERE student_id = ? AND approved_website_id = ?`
  ).run(studentId, websiteId);
  res.json({ ok: true });
});

// ── Teacher/admin: list a student's grants ─────────────────────────
router.get("/student/:id/grants", requireRole("teacher", "admin"), async (req: AuthRequest, res: Response) => {
  await ensureTables();
  const rows = await db.prepare(
    `SELECT w.*, sw.granted_at, sw.id AS grant_id
       FROM student_approved_websites sw
       JOIN approved_websites w ON w.id = sw.approved_website_id
      WHERE sw.student_id = ?
      ORDER BY sw.granted_at DESC`
  ).all(req.params.id);
  res.json(rows);
});

export default router;
