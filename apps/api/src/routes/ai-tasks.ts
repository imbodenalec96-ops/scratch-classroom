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

// ── Task generation ───────────────────────────────────────────────────────────
// POST /api/ai-tasks/generate
// Body: { student_id, date, subject, grade_min, grade_max }
// Returns: { id, prompt, hint } — also saves to daily_tasks
router.post("/generate", async (req: AuthRequest, res: Response) => {
  const client = getAnthropic();
  if (!client) return res.status(503).json(AI_UNAVAILABLE);

  const { student_id, date, subject, grade_min, grade_max } = req.body;
  if (!student_id || !date || !subject || grade_min == null || grade_max == null) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  // Check if task already exists for this student/date/subject
  const existing = (db as any).prepare(
    "SELECT * FROM daily_tasks WHERE student_id=? AND date=? AND subject=?"
  ).all(student_id, date, subject);
  if (existing.length > 0) {
    return res.json(existing);
  }

  // Load task count config
  const configRow = (db as any).prepare(
    "SELECT base_count FROM task_config WHERE subject=? LIMIT 1"
  ).get(subject) as any;
  const count = configRow?.base_count ?? 1;

  const tasks: any[] = [];
  try {
    for (let i = 0; i < count; i++) {
      const msg = await client.messages.create({
        model: MODEL,
        max_tokens: 256,
        system: "You are a teacher. Return JSON only with prompt string and hint string. No preamble. No markdown.",
        messages: [{
          role: "user",
          content: `Subject ${subject}. Grade range ${grade_min} to ${grade_max}. One short engaging task achievable in 5 minutes for an elementary student.`,
        }],
      });

      let parsed: any = {};
      try {
        const raw = (msg.content[0] as any).text.trim();
        parsed = JSON.parse(raw);
      } catch {
        parsed = { prompt: `Write a short ${subject} response about something you learned today.`, hint: "Think about what you did at school recently." };
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
