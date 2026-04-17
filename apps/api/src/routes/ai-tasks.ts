/**
 * AI-Tasks Route — Step 6
 * Task generation & grading via claude-sonnet-4-20250514.
 * If ANTHROPIC_API_KEY is not set, returns 503 with a friendly message.
 * All endpoints degrade gracefully so the UI can show a placeholder state.
 */

import { Router, Response } from "express";
import { AuthRequest } from "../middleware/auth.js";
import db from "../db.js";

const router = Router();

// ── Anthropic client (lazy init so missing key doesn't crash on import) ──────

function getAnthropic() {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return null;
  // Dynamic import keeps the optional dep from crashing at module load time
  // We use the SDK synchronously after the key check
  const { default: Anthropic } = require("@anthropic-ai/sdk");
  return new Anthropic({ apiKey: key });
}

const AI_UNAVAILABLE = {
  error: "AI features not yet configured. Add ANTHROPIC_API_KEY in Vercel env vars to enable.",
  code: "AI_NOT_CONFIGURED",
};

const MODEL = "claude-sonnet-4-20250514";

// Theme pool for per-student randomization (seeds variety into prompt)
const VARIETY_THEMES = [
  "pirates and treasure", "space and planets", "dinosaurs", "ocean creatures",
  "sports", "cooking and food", "superheroes", "farm animals", "forest adventure",
  "building and construction", "robots and gadgets", "weather and seasons",
  "friendship and sharing", "family", "art and colors", "music and instruments",
  "holidays and celebrations", "magic and wizards", "cars and racing", "nature walks",
];

function hashString(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h;
}

// ── Task generation ───────────────────────────────────────────────────────────
// POST /api/ai-tasks/generate
// Body: { student_id, date, subject, grade_min, grade_max, focus?, mode? }
//   mode: 'individualized' (default) — unique prompt per student, seeded by
//         student_id + date; 7-day recent-prompt dedup.
// Returns: array of { id, prompt, hint } — also saves to daily_tasks
router.post("/generate", async (req: AuthRequest, res: Response) => {
  const client = getAnthropic();
  if (!client) return res.status(503).json(AI_UNAVAILABLE);

  const { student_id, date, subject, grade_min, grade_max, focus } = req.body;
  if (!student_id || !date || !subject || grade_min == null || grade_max == null) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  const existing = (db as any).prepare(
    "SELECT * FROM daily_tasks WHERE student_id=? AND date=? AND subject=?"
  ).all(student_id, date, subject);
  if (existing.length > 0) return res.json(existing);

  const configRow = (db as any).prepare(
    "SELECT base_count FROM task_config WHERE subject=? LIMIT 1"
  ).get(subject) as any;
  const count = configRow?.base_count ?? 1;

  // Recent prompts (last 7 days) to avoid repeating
  const recent = (db as any).prepare(
    `SELECT prompt FROM daily_tasks WHERE student_id=? AND subject=? AND date >= date('now','-7 day')`
  ).all(student_id, subject) as any[];
  const recentSnippet = recent.length
    ? `AVOID repeating these recent prompts (rephrase or pick a fresh angle):\n${recent.slice(0, 7).map((r: any) => '- ' + (r.prompt || '').slice(0, 80)).join('\n')}`
    : '';

  // Deterministic per-student variety: pick a theme based on hash
  const seed = hashString(`${student_id}|${date}|${subject}`);
  const theme = VARIETY_THEMES[seed % VARIETY_THEMES.length];
  const focusHint = focus ? `Teacher focus note: ${focus}.` : '';

  const tasks: any[] = [];
  try {
    for (let i = 0; i < count; i++) {
      const msg = await client.messages.create({
        model: MODEL,
        max_tokens: 320,
        system: "You are a creative elementary teacher. Return JSON only: {\"prompt\": string, \"hint\": string}. Vary the task type each time (word problem, short writing, visual description, pattern, puzzle, reflection). No preamble. No markdown.",
        messages: [{
          role: "user",
          content: `Subject: ${subject}. Grade: ${grade_min}–${grade_max}. Task #${i + 1} of ${count}.
Theme seed: ${theme}.
${focusHint}
${recentSnippet}
Write ONE short engaging task (under 5 min) that fits grade level and is different in style from recent prompts. Return JSON.`,
        }],
      });

      let parsed: any = {};
      try {
        const raw = (msg.content[0] as any).text.trim();
        parsed = JSON.parse(raw);
      } catch {
        parsed = { prompt: `Write a short ${subject} response about ${theme}.`, hint: "Use your imagination!" };
      }

      const id = crypto.randomUUID();
      (db as any).prepare(
        `INSERT INTO daily_tasks (id, student_id, date, subject, prompt, hint) VALUES (?, ?, ?, ?, ?, ?)`
      ).run(id, student_id, date, subject, parsed.prompt ?? "", parsed.hint ?? "");

      tasks.push({ id, student_id, date, subject, prompt: parsed.prompt, hint: parsed.hint });
    }
    return res.json(tasks);
  } catch (err: any) {
    console.error("[ai-tasks/generate]", err?.message);
    return res.status(500).json({ error: "Task generation failed", detail: err?.message });
  }
});

// ── Classwide generation ──────────────────────────────────────────────────────
// POST /api/ai-tasks/generate-classwide
// Body: { class_id, date, subject, grade_min, grade_max, focus? }
// Generates ONE set of tasks (based on class's grade range) and inserts a copy
// for every student in the class. Use this when teacher wants same tasks for all.
router.post("/generate-classwide", async (req: AuthRequest, res: Response) => {
  const client = getAnthropic();
  if (!client) return res.status(503).json(AI_UNAVAILABLE);

  const { class_id, date, subject, grade_min, grade_max, focus } = req.body;
  if (!class_id || !date || !subject || grade_min == null || grade_max == null) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  // Students in class
  const students = await db.prepare(
    "SELECT u.id FROM users u JOIN class_members cm ON cm.user_id = u.id WHERE cm.class_id = ? AND u.role = 'student'"
  ).all(class_id) as any[];
  if (students.length === 0) return res.json({ studentsAffected: 0, tasks: [] });

  const configRow = (db as any).prepare(
    "SELECT base_count FROM task_config WHERE subject=? LIMIT 1"
  ).get(subject) as any;
  const count = configRow?.base_count ?? 1;

  const generated: { prompt: string; hint: string }[] = [];
  try {
    for (let i = 0; i < count; i++) {
      const msg = await client.messages.create({
        model: MODEL,
        max_tokens: 320,
        system: "You are a creative elementary teacher. Return JSON only: {\"prompt\": string, \"hint\": string}. No preamble. No markdown.",
        messages: [{
          role: "user",
          content: `Whole class task. Subject: ${subject}. Grade: ${grade_min}–${grade_max}. Task #${i + 1} of ${count}.
${focus ? `Focus: ${focus}.` : ''}
Write ONE engaging task under 5 min for the whole class. Return JSON.`,
        }],
      });
      let parsed: any = {};
      try {
        parsed = JSON.parse((msg.content[0] as any).text.trim());
      } catch {
        parsed = { prompt: `Short ${subject} task for the class.`, hint: "Do your best!" };
      }
      generated.push({ prompt: parsed.prompt ?? '', hint: parsed.hint ?? '' });
    }

    // Insert a copy for every student (deleting any existing tasks for today first)
    let inserted = 0;
    for (const s of students) {
      await db.prepare(
        "DELETE FROM daily_tasks WHERE student_id=? AND date=? AND subject=?"
      ).run(s.id, date, subject).catch(() => {});
      for (const t of generated) {
        const id = crypto.randomUUID();
        await db.prepare(
          "INSERT INTO daily_tasks (id, student_id, date, subject, prompt, hint) VALUES (?, ?, ?, ?, ?, ?)"
        ).run(id, s.id, date, subject, t.prompt, t.hint);
        inserted++;
      }
    }

    return res.json({ studentsAffected: students.length, tasksInserted: inserted, tasks: generated });
  } catch (err: any) {
    console.error("[ai-tasks/generate-classwide]", err?.message);
    return res.status(500).json({ error: "Classwide generation failed", detail: err?.message });
  }
});

// ── Task grading (streaming) ──────────────────────────────────────────────────
// POST /api/ai-tasks/grade
// Body: { task_id, student_answer, grade_min, grade_max }
// Streams SSE: data: {"token":"..."}\n\n … then data: {"done":true,"passed":bool,"feedback":"…"}\n\n
router.post("/grade", async (req: AuthRequest, res: Response) => {
  const client = getAnthropic();
  if (!client) return res.status(503).json(AI_UNAVAILABLE);

  const { task_id, student_answer, grade_min, grade_max } = req.body;
  if (!task_id || !student_answer) {
    return res.status(400).json({ error: "Missing task_id or student_answer" });
  }

  const task = (db as any).prepare("SELECT * FROM daily_tasks WHERE id=?").get(task_id) as any;
  if (!task) return res.status(404).json({ error: "Task not found" });

  // SSE headers
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  let fullText = "";
  try {
    const stream = client.messages.stream({
      model: MODEL,
      max_tokens: 256,
      system: "You are a kind elementary teacher. Return JSON only with passed boolean and feedback string. Feedback max 2 sentences always encouraging. No preamble.",
      messages: [{
        role: "user",
        content: `Assignment: ${task.prompt}\nStudent answer: ${student_answer}\nGrade range: ${grade_min ?? 1} to ${grade_max ?? 6}. Pass if genuine effort and got the main idea.`,
      }],
    });

    for await (const chunk of stream) {
      if (chunk.type === "content_block_delta" && chunk.delta.type === "text_delta") {
        const token = chunk.delta.text;
        fullText += token;
        res.write(`data: ${JSON.stringify({ token })}\n\n`);
      }
    }
  } catch (err: any) {
    res.write(`data: ${JSON.stringify({ error: err?.message })}\n\n`);
    res.end();
    return;
  }

  // Parse result and save
  let passed = false;
  let feedback = "Great effort! Keep going!";
  try {
    const parsed = JSON.parse(fullText.trim());
    passed = Boolean(parsed.passed);
    feedback = parsed.feedback ?? feedback;
  } catch { /* use defaults */ }

  (db as any).prepare(
    "UPDATE daily_tasks SET passed=?, ai_feedback=?, completed_at=datetime('now') WHERE id=?"
  ).run(passed ? 1 : 0, feedback, task_id);

  res.write(`data: ${JSON.stringify({ done: true, passed, feedback })}\n\n`);
  res.end();
});

// ── Worksheet search ──────────────────────────────────────────────────────────
// POST /api/ai-tasks/worksheet-search
// Body: { query, grade_min, grade_max }
// Returns: array of { title, url, subject, grade_level, source_site, description }
const wsSearchCache = new Map<string, { ts: number; results: any[] }>();

router.post("/worksheet-search", async (req: AuthRequest, res: Response) => {
  const client = getAnthropic();
  if (!client) return res.status(503).json(AI_UNAVAILABLE);

  const { query, grade_min, grade_max } = req.body;
  if (!query) return res.status(400).json({ error: "Missing query" });

  const cacheKey = `${query}:${grade_min}:${grade_max}`;
  const cached = wsSearchCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < 3_600_000) {
    return res.json(cached.results);
  }

  try {
    const msg = await client.messages.create({
      model: MODEL,
      max_tokens: 1024,
      system: "You are a teacher finding free worksheets. Return JSON only as array of objects with title, url, subject, grade_level, source_site, and description. Max 8 results. Free worksheets only from trusted educational sites. No preamble.",
      messages: [{
        role: "user",
        content: `Find free printable worksheets for ${query}. Grade level ${grade_min ?? 1} to ${grade_max ?? 6}. Prefer K5Learning, CommonCoreSheets, Math-Drills, SuperTeacherWorksheets, WorksheetWorks, Education.com free section.`,
      }],
    });

    const raw = (msg.content[0] as any).text.trim();
    let results: any[] = [];
    try { results = JSON.parse(raw); } catch { results = []; }

    wsSearchCache.set(cacheKey, { ts: Date.now(), results });
    return res.json(results);
  } catch (err: any) {
    return res.status(500).json({ error: "Search failed", detail: err?.message });
  }
});

// ── Task config (base count per subject) ─────────────────────────────────────
router.get("/task-config", (_req: AuthRequest, res: Response) => {
  const rows = (db as any).prepare("SELECT * FROM task_config").all();
  res.json(rows);
});

router.put("/task-config/:subject", async (req: AuthRequest, res: Response) => {
  const { subject } = req.params;
  const { base_count } = req.body;
  (db as any).prepare(
    "UPDATE task_config SET base_count=?, updated_at=datetime('now') WHERE subject=?"
  ).run(base_count, subject);
  res.json({ ok: true });
});

export default router;
