/**
 * AI-Tasks Route — CCSS-anchored grade-level generator.
 * Task generation & grading via claude-sonnet-4-20250514.
 * If ANTHROPIC_API_KEY is not set, returns 503 with a friendly message.
 */

import { Router, Response } from "express";
import { AuthRequest } from "../middleware/auth.js";
import { requireRole } from "../middleware/rbac.js";
import db from "../db.js";

const router = Router();

function getAnthropic() {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return null;
  const { default: Anthropic } = require("@anthropic-ai/sdk");
  return new Anthropic({ apiKey: key, timeout: 60_000, maxRetries: 1 });
}

const AI_UNAVAILABLE = {
  error: "AI features not yet configured. Add ANTHROPIC_API_KEY in Vercel env vars to enable.",
  code: "AI_NOT_CONFIGURED",
};

const MODEL = "claude-sonnet-4-20250514";

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

// ── Table bootstrap (idempotent, pg-compatible) ──────────────────────────────
let tablesReady = false;
async function ensureTables() {
  if (tablesReady) return;
  try {
    await (db as any).exec(`
      CREATE TABLE IF NOT EXISTS daily_tasks (
        id TEXT PRIMARY KEY,
        student_id TEXT NOT NULL,
        date TEXT NOT NULL,
        subject TEXT NOT NULL,
        prompt TEXT NOT NULL,
        hint TEXT,
        student_answer TEXT,
        passed INTEGER,
        ai_feedback TEXT,
        assigned_at TEXT,
        completed_at TEXT
      );
    `);
  } catch {}
  try {
    await (db as any).exec(`
      CREATE TABLE IF NOT EXISTS task_config (
        subject TEXT PRIMARY KEY,
        base_count INTEGER NOT NULL DEFAULT 1,
        updated_at TEXT
      );
    `);
  } catch {}
  // Idempotent column adds (pg-safe via try/catch; shim has no transactions)
  for (const sql of [
    `ALTER TABLE daily_tasks ADD COLUMN generation_warnings TEXT`,
    `ALTER TABLE daily_tasks ADD COLUMN target_grade INTEGER`,
  ]) {
    try { await (db as any).exec(sql); } catch {}
  }
  tablesReady = true;
}

// ── CCSS grade anchors (K-5) ────────────────────────────────────────────────
// Concise, operational anchors — not a full standards dump. Written to fit
// in the prompt budget while still constraining vocab + number range tightly.
const CCSS_ANCHORS: Record<string, Record<number, string>> = {
  reading: {
    0: "RF.K.2–3 / RL.K: letter sounds, rhyming, CVC words (cat, dog, run). 3–5 word sentences. Vocabulary: 300–500 common sight words. Avg word length <5 chars.",
    1: "RF.1.3 / RL.1: blend CVC, digraphs (sh/ch/th), short vowels, simple 1-sentence comprehension. Vocab: ~1000 sight words. Avg word length <5 chars.",
    2: "RF.2.3 / RL.2: long vowels, vowel teams, 2-syllable decoding, main idea from 2–3 sentence passages. Avg word length <7 chars, no multi-clause sentences.",
    3: "RF.3.3 / RL.3: prefixes/suffixes, context clues, inferring from a short paragraph. Avg word length <8 chars. Allow multi-clause sentences.",
    4: "RL.4 / RI.4: figurative language, theme, citing text evidence from a paragraph passage. Academic vocabulary permitted.",
    5: "RL.5 / RI.5: author's purpose, point of view, multi-paragraph passages, analysis of nonfiction text features.",
  },
  writing: {
    0: "W.K.1–3: label pictures with 1 word, trace letters, write own name, 3-word 'I see' sentences.",
    1: "W.1.1–3: 'I like/can' sentences with capital + period, 2-sentence opinion or observation, illustrate with caption.",
    2: "W.2.1–3: 3–4 sentence paragraph (topic + 2 details + closing), basic punctuation including commas in a series.",
    3: "W.3.1–5: paragraph with topic sentence + 3 details + closing, proper noun capitalization, commas in lists, revise for complete sentences.",
    4: "W.4.1–3: multi-paragraph narrative/opinion with transitions, dialogue punctuation, concrete details.",
    5: "W.5.1–4: intro-body-conclusion opinion/informative/narrative essays with evidence and linking words.",
  },
  spelling: {
    0: "L.K.2d: spell 3-letter CVC words from a short word list (cat, pig, mom).",
    1: "L.1.2d–e: CVC words, short-vowel patterns, common sight words (the, and, was, you).",
    2: "L.2.2d: long-vowel patterns (silent e, ai, ee), digraphs, basic plurals.",
    3: "L.3.2: prefixes/suffixes (un-, re-, -ing, -ed), homophones (to/too/two), 2-syllable words.",
    4: "L.4.2: Greek/Latin roots (tele-, -graph), irregular plurals, commonly confused words.",
    5: "L.5.2: advanced suffixes, derivational spelling (define→definition), academic vocabulary.",
  },
  math: {
    0: "K.CC / K.OA: numbers 0–20 ONLY, counting, comparing, addition/subtraction within 10, 2D shapes (circle, square, triangle, rectangle).",
    1: "1.OA / 1.NBT: numbers 0–120, addition/subtraction within 20, place value (tens/ones), comparing 2-digit numbers, telling time to half-hour.",
    2: "2.OA / 2.NBT / 2.MD: numbers 0–1000, addition/subtraction within 100 (fluently) and 1000 (with regrouping), arrays, skip-counting, money (coins), time to 5-min.",
    3: "3.OA / 3.NF: multiplication/division within 100, fractions on number line (halves, thirds, fourths, sixths, eighths), area, perimeter, elapsed time.",
    4: "4.OA / 4.NBT / 4.NF: multi-digit multiplication, long division, equivalent fractions, decimal notation for fractions of 10 and 100, angle measurement.",
    5: "5.NBT / 5.NF / 5.G: decimal operations to hundredths, fraction +/-/*/÷, volume, coordinate plane (first quadrant), 2D shape categorization.",
  },
  sel: {
    0: "Social skills at kinder level: naming feelings (happy, sad, mad, scared), taking turns, using kind words.",
    1: "1st-grade SEL: identifying 5–6 feelings, asking for help, giving compliments, sharing.",
    2: "2nd-grade SEL: perspective-taking (how does a friend feel?), calming strategies, conflict basics.",
    3: "3rd-grade SEL: empathy, goal-setting, identifying strengths, friendship skills.",
    4: "4th-grade SEL: self-reflection, responsible decision-making, recognizing peer pressure.",
    5: "5th-grade SEL: coping strategies, growth mindset, ethical reasoning in realistic scenarios.",
  },
};

function anchorFor(subject: string, grade: number): string {
  const s = CCSS_ANCHORS[subject] ?? CCSS_ANCHORS.reading;
  const g = Math.max(0, Math.min(5, grade));
  return s[g] ?? s[3];
}

function gradeLabel(g: number): string {
  return g <= 0 ? "Kindergarten" : `Grade ${g}`;
}

// ── Heuristic validator ──────────────────────────────────────────────────────
// Cheap post-gen check. Flags off-grade content so we can retry once.
type ValidationResult = { ok: true } | { ok: false; reason: string };

function validateTask(
  subject: string,
  grade: number,
  prompt: string,
  hint: string,
): ValidationResult {
  const text = `${prompt} ${hint}`;
  if (!prompt.trim()) return { ok: false, reason: "empty prompt" };

  if (subject === "math") {
    // Extract integers and decimals, flag if any exceed grade-appropriate range
    const nums = (text.match(/\b\d{1,6}(?:\.\d+)?\b/g) || []).map(Number);
    const maxAllowed: Record<number, number> = { 0: 20, 1: 120, 2: 1000, 3: 1000, 4: 1_000_000, 5: 1_000_000 };
    const cap = maxAllowed[Math.max(0, Math.min(5, grade))] ?? 1000;
    const over = nums.find(n => n > cap);
    if (over !== undefined) return { ok: false, reason: `grade-${grade} math contains number ${over} > cap ${cap}` };
    // Decimals not allowed before grade 4
    if (grade < 4 && /\d+\.\d+/.test(text)) {
      return { ok: false, reason: `grade-${grade} math contains decimals (not introduced until grade 4)` };
    }
    // Fractions rarely before grade 3 (allowed halves maybe)
    if (grade < 3 && /\b\d+\/\d+\b/.test(text)) {
      return { ok: false, reason: `grade-${grade} math contains fractions (not introduced until grade 3)` };
    }
  }

  if (subject === "reading" || subject === "writing" || subject === "spelling") {
    // Avg word length heuristic
    const words = prompt.replace(/[^\p{L}\s'-]/gu, " ").split(/\s+/).filter(w => w.length > 0);
    if (words.length > 0) {
      const avg = words.reduce((s, w) => s + w.length, 0) / words.length;
      const caps: Record<number, number> = { 0: 4.5, 1: 5.0, 2: 5.5, 3: 6.5, 4: 7.5, 5: 9.0 };
      const cap = caps[Math.max(0, Math.min(5, grade))] ?? 6.5;
      if (avg > cap + 0.5) return { ok: false, reason: `grade-${grade} ${subject} avg word length ${avg.toFixed(1)} exceeds ~${cap}` };
    }
  }

  return { ok: true };
}

// ── Core generate-one helper (shared by both routes) ─────────────────────────
async function generateOne(
  client: any,
  params: {
    subject: string;
    grade: number;       // canonical grade used for anchors + validation
    gradeMin: number;
    gradeMax: number;
    theme: string;
    focusHint: string;
    recentSnippet: string;
    classwide: boolean;
    taskIndex: number;
    totalCount: number;
  },
): Promise<{ prompt: string; hint: string; warnings: string[] }> {
  const { subject, grade, gradeMin, gradeMax, theme, focusHint, recentSnippet, classwide, taskIndex, totalCount } = params;
  const anchor = anchorFor(subject, grade);
  const gLabel = gradeLabel(grade);

  const system = `You are a careful elementary teacher writing ONE task that PRECISELY matches Common Core State Standards for the specified grade. You must stay on-grade: no vocabulary, numbers, or concepts above grade level. No preamble. No markdown. Return JSON ONLY: {"prompt": string, "hint": string}. The hint must reference the CCSS anchor code (e.g. "aligns with 2.NBT.5").`;

  const userPrompt = (correction?: string) => `Subject: ${subject}. ${gLabel} (range ${gradeMin}–${gradeMax}). Task ${taskIndex + 1} of ${totalCount}.
CCSS anchor for this grade: ${anchor}
Theme seed: ${theme}.
${focusHint}
${recentSnippet}
${correction ?? ""}
Hard constraints:
- Match vocabulary and sentence complexity to ${gLabel} exactly.
- Math: stay within the number range listed in the anchor. No decimals before grade 4. No fractions before grade 3.
- Reading/writing: keep sentences at ${gLabel} level.
- Keep under 5 minutes for a student to complete.
- Vary task type from recent prompts (word problem, visual, short writing, pattern, reflection).
${classwide ? "Whole-class task; no student-specific references." : ""}
Return JSON: {"prompt":"...","hint":"... (includes CCSS code)"}`;

  const warnings: string[] = [];

  const callOnce = async (correction?: string) => {
    const msg = await client.messages.create({
      model: MODEL,
      max_tokens: 380,
      system,
      messages: [{ role: "user", content: userPrompt(correction) }],
    });
    const raw = (msg.content[0] as any).text.trim();
    try {
      const parsed = JSON.parse(raw);
      return { prompt: String(parsed.prompt ?? ""), hint: String(parsed.hint ?? "") };
    } catch {
      return { prompt: "", hint: "" };
    }
  };

  let result = await callOnce();
  const check = validateTask(subject, grade, result.prompt, result.hint);
  if (check.ok === false) {
    const firstReason = check.reason;
    warnings.push(`first-pass: ${firstReason}`);
    const correction = `CORRECTION: The previous draft was off-grade — ${firstReason}. Regenerate at exactly ${gLabel}. Stay strictly within the CCSS anchor above.`;
    const retry = await callOnce(correction);
    const check2 = validateTask(subject, grade, retry.prompt, retry.hint);
    if (!check2.ok) {
      warnings.push(`retry-still-off: ${check2.reason}`);
      // Prefer retry output over bad first pass even if still flagged
      result = retry.prompt ? retry : result;
    } else {
      result = retry;
    }
  }

  if (!result.prompt) {
    result = { prompt: `Write a short ${subject} response about ${theme}.`, hint: "Use your best thinking!" };
    warnings.push("fallback-default");
  }

  return { prompt: result.prompt, hint: result.hint, warnings };
}

function warningsToJson(w: string[]): string | null {
  return w.length ? JSON.stringify(w) : null;
}

// ── Task generation (per-student) ────────────────────────────────────────────
router.post("/generate", async (req: AuthRequest, res: Response) => {
  const client = getAnthropic();
  if (!client) return res.status(503).json(AI_UNAVAILABLE);
  await ensureTables();

  const { student_id, date, subject, focus } = req.body;
  let { grade_min, grade_max } = req.body;
  if (!student_id || !date || !subject) {
    return res.status(400).json({ error: "Missing required fields" });
  }
  if (grade_min == null || grade_max == null) {
    try {
      const g = await db.prepare(
        "SELECT reading_grade, math_grade, writing_grade FROM user_grade_levels WHERE user_id = ?"
      ).get(student_id) as any;
      const col = subject === "math" ? "math_grade" : subject === "writing" ? "writing_grade" : "reading_grade";
      const single = g?.[col] ?? 3;
      if (grade_min == null) grade_min = single;
      if (grade_max == null) grade_max = single;
    } catch { grade_min = grade_min ?? 3; grade_max = grade_max ?? 3; }
  }

  const existing = (db as any).prepare(
    "SELECT * FROM daily_tasks WHERE student_id=? AND date=? AND subject=?"
  ).all(student_id, date, subject);
  if (existing.length > 0) return res.json(existing);

  const configRow = (db as any).prepare(
    "SELECT base_count FROM task_config WHERE subject=? LIMIT 1"
  ).get(subject) as any;
  const count = configRow?.base_count ?? 1;

  const recent = (db as any).prepare(
    `SELECT prompt FROM daily_tasks WHERE student_id=? AND subject=? AND date >= date('now','-7 day')`
  ).all(student_id, subject) as any[];
  const recentSnippet = recent.length
    ? `AVOID repeating these recent prompts (rephrase or pick a fresh angle):\n${recent.slice(0, 7).map((r: any) => "- " + (r.prompt || "").slice(0, 80)).join("\n")}`
    : "";

  const seed = hashString(`${student_id}|${date}|${subject}`);
  const theme = VARIETY_THEMES[seed % VARIETY_THEMES.length];
  const focusHint = focus ? `Teacher focus note: ${focus}.` : "";

  const canonicalGrade = Math.round((Number(grade_min) + Number(grade_max)) / 2);

  const tasks: any[] = [];
  try {
    for (let i = 0; i < count; i++) {
      const { prompt, hint, warnings } = await generateOne(client, {
        subject, grade: canonicalGrade,
        gradeMin: grade_min, gradeMax: grade_max,
        theme, focusHint, recentSnippet,
        classwide: false, taskIndex: i, totalCount: count,
      });
      const id = crypto.randomUUID();
      (db as any).prepare(
        `INSERT INTO daily_tasks (id, student_id, date, subject, prompt, hint, target_grade, generation_warnings) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(id, student_id, date, subject, prompt, hint, canonicalGrade, warningsToJson(warnings));
      tasks.push({ id, student_id, date, subject, prompt, hint, target_grade: canonicalGrade, generation_warnings: warningsToJson(warnings) });
    }
    return res.json(tasks);
  } catch (err: any) {
    console.error("[ai-tasks/generate]", err?.message);
    return res.status(500).json({ error: "Task generation failed", detail: err?.message });
  }
});

// ── Classwide generation ─────────────────────────────────────────────────────
router.post("/generate-classwide", async (req: AuthRequest, res: Response) => {
  const client = getAnthropic();
  if (!client) return res.status(503).json(AI_UNAVAILABLE);
  await ensureTables();

  const { class_id, date, subject, grade_min, grade_max, focus } = req.body;
  if (!class_id || !date || !subject || grade_min == null || grade_max == null) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  const students = await db.prepare(
    "SELECT u.id FROM users u JOIN class_members cm ON cm.user_id = u.id WHERE cm.class_id = ? AND u.role = 'student'"
  ).all(class_id) as any[];
  if (students.length === 0) return res.json({ studentsAffected: 0, tasks: [] });

  const configRow = (db as any).prepare(
    "SELECT base_count FROM task_config WHERE subject=? LIMIT 1"
  ).get(subject) as any;
  const count = configRow?.base_count ?? 1;

  const canonicalGrade = Math.round((Number(grade_min) + Number(grade_max)) / 2);
  const seed = hashString(`${class_id}|${date}|${subject}`);
  const theme = VARIETY_THEMES[seed % VARIETY_THEMES.length];
  const focusHint = focus ? `Teacher focus note: ${focus}.` : "";

  const generated: { prompt: string; hint: string; warnings: string[] }[] = [];
  try {
    for (let i = 0; i < count; i++) {
      const one = await generateOne(client, {
        subject, grade: canonicalGrade,
        gradeMin: grade_min, gradeMax: grade_max,
        theme, focusHint, recentSnippet: "",
        classwide: true, taskIndex: i, totalCount: count,
      });
      generated.push(one);
    }

    let inserted = 0;
    for (const s of students) {
      await db.prepare(
        "DELETE FROM daily_tasks WHERE student_id=? AND date=? AND subject=?"
      ).run(s.id, date, subject).catch(() => {});
      for (const t of generated) {
        const id = crypto.randomUUID();
        await db.prepare(
          `INSERT INTO daily_tasks (id, student_id, date, subject, prompt, hint, target_grade, generation_warnings) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
        ).run(id, s.id, date, subject, t.prompt, t.hint, canonicalGrade, warningsToJson(t.warnings));
        inserted++;
      }
    }

    return res.json({
      studentsAffected: students.length,
      tasksInserted: inserted,
      tasks: generated.map(g => ({ prompt: g.prompt, hint: g.hint, generation_warnings: warningsToJson(g.warnings) })),
    });
  } catch (err: any) {
    console.error("[ai-tasks/generate-classwide]", err?.message);
    return res.status(500).json({ error: "Classwide generation failed", detail: err?.message });
  }
});

// ── Recent generation warnings (teacher/admin) ───────────────────────────────
router.get("/recent-warnings", requireRole("teacher", "admin"), async (_req: AuthRequest, res: Response) => {
  await ensureTables();
  try {
    const rows = (db as any).prepare(
      `SELECT id, student_id, date, subject, target_grade, prompt, generation_warnings
       FROM daily_tasks
       WHERE generation_warnings IS NOT NULL AND generation_warnings <> ''
       ORDER BY date DESC
       LIMIT 100`
    ).all() as any[];
    return res.json(rows);
  } catch (err: any) {
    return res.json([]);
  }
});

// ── Task grading (streaming) ──────────────────────────────────────────────────
router.post("/grade", async (req: AuthRequest, res: Response) => {
  const client = getAnthropic();
  if (!client) return res.status(503).json(AI_UNAVAILABLE);

  const { task_id, student_answer, grade_min, grade_max } = req.body;
  if (!task_id || !student_answer) {
    return res.status(400).json({ error: "Missing task_id or student_answer" });
  }

  const task = (db as any).prepare("SELECT * FROM daily_tasks WHERE id=?").get(task_id) as any;
  if (!task) return res.status(404).json({ error: "Task not found" });

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
const wsSearchCache = new Map<string, { ts: number; results: any[] }>();

router.post("/worksheet-search", async (req: AuthRequest, res: Response) => {
  const client = getAnthropic();
  if (!client) return res.status(503).json(AI_UNAVAILABLE);

  const { query, grade_min, grade_max } = req.body;
  if (!query) return res.status(400).json({ error: "Missing query" });

  const cacheKey = `${query}:${grade_min}:${grade_max}`;
  const cached = wsSearchCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < 3_600_000) return res.json(cached.results);

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

// ── Task config ──────────────────────────────────────────────────────────────
router.get("/task-config", (_req: AuthRequest, res: Response) => {
  try {
    const rows = (db as any).prepare("SELECT * FROM task_config").all();
    res.json(rows);
  } catch {
    res.json([]);
  }
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
