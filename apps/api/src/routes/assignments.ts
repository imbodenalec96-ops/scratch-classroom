import { Router, Response } from "express";
import crypto from "crypto";
import multer from "multer";
import db from "../db.js";
import { AuthRequest } from "../middleware/auth.js";
import { requireRole } from "../middleware/rbac.js";
import { ensureHumanGradeCols } from "./submissions.js";

const router = Router();

// Ensure grade-target + per-student columns exist on assignments (idempotent).
let gradeColsReady = false;
let gradeColsInFlight: Promise<void> | null = null;
async function ensureGradeCols() {
  if (gradeColsReady) return;
  // Dedupe concurrent callers — if 10 /generate-slot requests hit a cold
  // instance simultaneously, only one of them runs the ALTER TABLEs; the
  // others await the same promise. Prevents thundering-herd lock contention
  // on Postgres DDL.
  if (gradeColsInFlight) return gradeColsInFlight;
  gradeColsInFlight = (async () => {
    for (const col of [
      "ALTER TABLE assignments ADD COLUMN target_grade_min INTEGER",
      "ALTER TABLE assignments ADD COLUMN target_grade_max INTEGER",
      "ALTER TABLE assignments ADD COLUMN target_subject TEXT",
      "ALTER TABLE assignments ADD COLUMN student_id TEXT",
      "ALTER TABLE assignments ADD COLUMN week_theme TEXT",
      "ALTER TABLE assignments ADD COLUMN teacher_notes TEXT",
      "ALTER TABLE assignments ADD COLUMN question_count INTEGER",
      "ALTER TABLE assignments ADD COLUMN estimated_minutes INTEGER",
      "ALTER TABLE assignments ADD COLUMN focus_keywords TEXT",
      "ALTER TABLE assignments ADD COLUMN learning_objective TEXT",
      "ALTER TABLE assignments ADD COLUMN hints_allowed INTEGER",
      "ALTER TABLE assignments ADD COLUMN question_type TEXT",
      // JSON-encoded array of user_ids; NULL => broadcast per legacy rules,
      // populated => only those student_ids see this assignment.
      "ALTER TABLE assignments ADD COLUMN target_student_ids TEXT",
      // Provenance for imported / uploaded content
      "ALTER TABLE assignments ADD COLUMN source TEXT",
      "ALTER TABLE assignments ADD COLUMN source_url TEXT",
      "ALTER TABLE assignments ADD COLUMN attached_pdf_path TEXT",
      // Group / center assignments — members reuse target_student_ids.
      // is_group=1 means the target students work together; UI shows shared notes.
      "ALTER TABLE assignments ADD COLUMN is_group INTEGER NOT NULL DEFAULT 0",
      "ALTER TABLE assignments ADD COLUMN group_name TEXT",
      "ALTER TABLE assignments ADD COLUMN video_url TEXT",
      // Afternoon work: only shown to students once they've cleared all
      // morning (default) assignments. Lets the teacher queue up extra work
      // for kids who finish early.
      "ALTER TABLE assignments ADD COLUMN is_afternoon INTEGER NOT NULL DEFAULT 0",
    ]) {
      try { await db.exec(col); } catch { /* column already exists */ }
    }
    // Storage for imported/uploaded PDFs (base64 in TEXT — works on both
    // Neon pg and the sqlite compat shim, survives Vercel's read-only FS)
    // Shared notes for group / center assignments — one row per assignment.
    // Every group member reads and writes the same `content` field.
    try {
      await db.exec(`CREATE TABLE IF NOT EXISTS group_notes (
        assignment_id TEXT PRIMARY KEY,
        content TEXT NOT NULL DEFAULT '',
        updated_at TEXT,
        updated_by TEXT
      )`);
    } catch {}
    try {
      await db.exec(`CREATE TABLE IF NOT EXISTS assignment_files (
        id TEXT PRIMARY KEY,
        assignment_id TEXT NOT NULL,
        filename TEXT,
        content_type TEXT,
        data_base64 TEXT NOT NULL,
        created_at TEXT
      )`);
    } catch {}
    gradeColsReady = true;
  })();
  try { await gradeColsInFlight; } finally { gradeColsInFlight = null; }
}

// Returns the OpenRouter API key if configured, else null.
function getAnthropic() {
  const orKey = process.env.OPENROUTER_API_KEY;
  return orKey ? { key: orKey, provider: "openrouter" as const } : null;
}
const AI_MODEL = "openai/gpt-4o-mini";        // OpenRouter fallback model
const GEMINI_MODEL = "gemini-2.5-flash";       // Default Gemini model — fast + cheap

// Single JSON-mode helper for Gemini. Returns parsed JSON or throws.
// systemInstruction lets us reuse the existing OpenAI-shaped prompts as-is.
async function callGeminiJSON(systemPrompt: string, userPrompt: string, opts?: {
  model?: string; maxTokens?: number; timeoutMs?: number; temperature?: number;
}): Promise<any> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY not set");
  const model = opts?.model || GEMINI_MODEL;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(key)}`;
  const body = {
    systemInstruction: { parts: [{ text: systemPrompt }] },
    contents: [{ role: "user", parts: [{ text: userPrompt }] }],
    generationConfig: {
      responseMimeType: "application/json",
      maxOutputTokens: opts?.maxTokens ?? 4096,
      temperature: opts?.temperature ?? 0.85,
    },
  };
  const HARD_TIMEOUT_MS = opts?.timeoutMs ?? 40_000;
  const fetchCall = fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).then(async r => {
    if (!r.ok) {
      const errTxt = await r.text().catch(() => "");
      throw new Error(`gemini ${r.status}: ${errTxt.slice(0, 200)}`);
    }
    return r.json() as Promise<any>;
  });
  const data: any = await Promise.race([
    fetchCall,
    new Promise<never>((_r, rej) => setTimeout(() => rej(new Error(`gemini hard-timeout ${HARD_TIMEOUT_MS}ms`)), HARD_TIMEOUT_MS)),
  ]);
  const cand = data?.candidates?.[0];
  if (!cand) throw new Error(`gemini empty response: ${JSON.stringify(data).slice(0, 200)}`);
  if (cand.finishReason && cand.finishReason !== "STOP" && cand.finishReason !== "MAX_TOKENS") {
    throw new Error(`gemini finishReason=${cand.finishReason}`);
  }
  let raw: string = (cand.content?.parts || []).map((p: any) => p?.text || "").join("").trim();
  if (!raw) throw new Error("gemini blank text");
  if (raw.startsWith("```")) raw = raw.replace(/^```[a-z]*\n?/i, "").replace(/```\s*$/i, "").trim();
  try {
    return JSON.parse(raw);
  } catch (e: any) {
    // Truncation tells us we hit the token cap before the JSON closed.
    if (cand.finishReason === "MAX_TOKENS") {
      throw new Error(`gemini hit MAX_TOKENS (${opts?.maxTokens ?? 4096}) before JSON closed; raise the cap`);
    }
    throw new Error(`gemini bad JSON: ${e?.message}; raw_len=${raw.length}`);
  }
}

function hashString(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return h;
}
const WEEKLY_THEMES = [
  "pirates and treasure","space and planets","dinosaurs","ocean creatures",
  "sports day","cooking","superheroes","farm animals","forest adventure",
  "building and construction","robots","weather","friendship","art and colors",
  "music","holidays","magic","cars and racing","nature walks","inventors",
];

/** Generate one assignment's worth of content for a single student+subject+day */
async function generateDailyAssignmentContent(_client: any, opts: {
  studentId: string;
  date: string;
  subject: string;
  gradeMin: number;
  gradeMax: number;
  weekTheme?: string;
  recentPrompts: string[];
  questionCount?: number;
  teacherNotes?: string;
  focusKeywords?: string;
  questionType?: string;
  learningObjective?: string;
}): Promise<{ title: string; content: any }> {
  if (!process.env.OPENROUTER_API_KEY) {
    throw new Error("OPENROUTER_API_KEY not set");
  }

  const seed = hashString(`${opts.studentId}|${opts.date}|${opts.subject}`);
  const theme = WEEKLY_THEMES[seed % WEEKLY_THEMES.length];
  const recent = opts.recentPrompts.slice(0, 8).map(p => "- " + (p || "").slice(0, 80)).join("\n");
  const qCount = opts.questionCount && opts.questionCount > 0 ? opts.questionCount : 3;
  const qTypeDirective = opts.questionType === "multiple_choice"
    ? "Every question must be multiple_choice."
    : opts.questionType === "short_answer"
    ? "Every question must be short_answer (free-text)."
    : opts.questionType === "fill_blank"
    ? "Every question must be fill_blank."
    : "Mix multiple_choice, short_answer, and fill_blank when natural.";

  const systemPrompt =
    "You are a kind, encouraging elementary teacher. Every assignment must TEACH the lesson first, THEN ask questions about what was just taught. The student should NEVER need to look anything up — every fact required for an answer must be stated plainly in the lesson. Aim for the EASIER end of the student's grade level — confidence-building, not challenging. Use simple vocabulary the student already knows, short sentences, and clear answer choices where one option is obviously correct after a moment of thought. For reading subjects, the lesson IS the passage — students read it then answer comprehension questions. For math, the lesson shows a worked example with the steps. For SPELLING: every single question must be about spelling words correctly — no trivia, no history, no inventors, no science facts. Choose a list of 5 grade-appropriate target words and quiz ONLY on those words. Acceptable question patterns: 'Which is the correct spelling: A. recieve B. receive C. receeve D. receave?', 'Fill in the missing letter: fri___nd', 'Spell the word that means a small dog: p_pp_'. The lesson must briefly introduce the spelling rule or word list. NEVER ask 'who invented X' or any non-spelling question. For science/history/vocabulary/sel, the lesson is a short, clear explanation of the concept with at least one concrete example. For multiple choice, distractors should be clearly wrong (no near-misses or trick answers). Hints should give a strong nudge toward the answer, not just a vague clue. Return JSON ONLY matching this exact shape (no markdown, no preamble):\n" +
    `{"title":"Short catchy title","instructions":"1–2 sentence intro to read before starting","lesson":"3–6 sentence kid-friendly mini-lesson that teaches everything needed to answer the questions below. For reading: this is the short passage (≤60 words). For math: include a worked example with the answer. For science/history/vocab: define the term + give an example.","sections":[{"title":"Section name","questions":[{"type":"multiple_choice","text":"Question?","options":["A. ...","B. ...","C. ...","D. ..."],"correctIndex":0,"points":5,"hint":"Gentle hint"}]}]}\n` +
    `Exactly ${qCount} questions per task. Every question must be answerable using ONLY the lesson text — no outside knowledge. ${qTypeDirective} multiple_choice MUST include correctIndex (0-based).`;

  const userPrompt =
`Subject: ${opts.subject}. Student grade: ${opts.gradeMin === opts.gradeMax ? opts.gradeMax : `${opts.gradeMin}–${opts.gradeMax}`}. Date: ${opts.date}.
Difficulty target: gentle / on the easier side of grade ${opts.gradeMax}. Prioritize student confidence over rigor.
Theme seed: ${theme}.${opts.weekTheme ? `\nThis week's focus: ${opts.weekTheme}.` : ""}
${opts.learningObjective ? `Learning objective: ${opts.learningObjective}.` : ""}
${opts.focusKeywords ? `Emphasize these topics/keywords: ${opts.focusKeywords}.` : ""}
${opts.teacherNotes ? `Private teacher notes (don't expose to student, but use when crafting): ${opts.teacherNotes}` : ""}
${recent ? `AVOID repeating these recent prompts (choose fresh angle, different question type):\n${recent}` : ""}
Make this feel different from other days this week. Return ONLY JSON.`;

  // Hard-locked to OpenRouter. (Gemini helper still exists in this file but
  // is no longer called from the assignment generator.)
  let parsed: any;
  {
    const orKey = process.env.OPENROUTER_API_KEY!;
    const HARD_TIMEOUT_MS = 40_000;
    const fetchCall = fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: { "Authorization": `Bearer ${orKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: AI_MODEL, max_tokens: 900,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      }),
    }).then(async r => {
      if (!r.ok) { const err = await r.json().catch(() => ({})); throw new Error(`${r.status} ${JSON.stringify(err)}`); }
      return r.json() as Promise<any>;
    });
    const data = await Promise.race([
      fetchCall,
      new Promise<never>((_r, rej) => setTimeout(() => rej(new Error(`openrouter hard-timeout ${HARD_TIMEOUT_MS}ms`)), HARD_TIMEOUT_MS)),
    ]);
    let raw: string = data.choices[0].message.content.trim();
    if (raw.startsWith("```")) raw = raw.replace(/^```[a-z]*\n?/i, "").replace(/```\s*$/i, "").trim();
    parsed = JSON.parse(raw);
  }
  if (!parsed.sections || !Array.isArray(parsed.sections)) throw new Error("bad shape: no sections array");
  return { title: parsed.title || "Assignment", content: parsed };
}

// Create assignment with full custom fields (Feature 29 rich customization)
router.post("/", requireRole("teacher", "admin"), async (req: AuthRequest, res: Response) => {
  const {
    classId, title, description, dueDate, rubric, starterProjectId, content, scheduledDate,
    targetGradeMin, targetGradeMax, targetSubject,
    targetStudentIds,
    teacherNotes, questionCount, estimatedMinutes, focusKeywords,
    learningObjective, hintsAllowed, questionType,
    isGroup, groupName, videoUrl,
  } = req.body;
  const id = crypto.randomUUID();
  await ensureGradeCols();
  const safeDueDate = dueDate && String(dueDate).trim() ? dueDate : null;
  const today = new Date().toISOString().slice(0, 10);
  const safeScheduledDate = scheduledDate && String(scheduledDate).trim() ? scheduledDate : today;
  const tMin = targetGradeMin != null ? Number(targetGradeMin) : null;
  const tMax = targetGradeMax != null ? Number(targetGradeMax) : (tMin != null ? tMin : null);
  const tSub = targetSubject || null;
  // Specific-students targeting: stored as JSON text. Only written when a
  // non-empty array is provided — empty/missing = legacy class/grade rules.
  const tStudents = Array.isArray(targetStudentIds) && targetStudentIds.length > 0
    ? JSON.stringify(targetStudentIds.filter((x: any) => typeof x === "string" && x))
    : null;

  try {
    await db.prepare(
      `INSERT INTO assignments (
        id, class_id, teacher_id, title, description, due_date, rubric,
        starter_project_id, content, scheduled_date,
        target_grade_min, target_grade_max, target_subject,
        teacher_notes, question_count, estimated_minutes,
        focus_keywords, learning_objective, hints_allowed, question_type,
        target_student_ids, is_group, group_name, video_url
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id, classId, req.user!.id, title, description, safeDueDate, JSON.stringify(rubric || []),
      starterProjectId, content ?? null, safeScheduledDate,
      tMin, tMax, tSub,
      teacherNotes || null,
      questionCount != null ? Number(questionCount) : null,
      estimatedMinutes != null ? Number(estimatedMinutes) : null,
      focusKeywords || null,
      learningObjective || null,
      hintsAllowed != null ? (hintsAllowed ? 1 : 0) : 1,
      questionType || null,
      tStudents,
      isGroup ? 1 : 0,
      groupName || null,
      videoUrl || null,
    );
  } catch (e: any) {
    console.error('assignment insert error:', e?.message, e);
    return res.status(500).json({ error: e?.message || String(e) || "Insert failed" });
  }
  const row = await db.prepare("SELECT * FROM assignments WHERE id = ?").get(id) as any;
  row.rubric = JSON.parse(row.rubric || "[]");
  res.json(row);
});

// ── Group / center shared notes ─────────────────────────────────
// Any group member (student in target_student_ids) OR teacher/admin can read/write.
// Notes are a single text blob per assignment — simple enough to sync via
// short-interval polling without needing websockets.
async function canAccessGroupNotes(req: AuthRequest, assignmentId: string): Promise<{ ok: boolean; reason?: string; assignment?: any }> {
  const role = req.user?.role;
  const userId = req.user?.id;
  if (!userId) return { ok: false, reason: "auth required" };
  const a: any = await db.prepare("SELECT id, is_group, target_student_ids FROM assignments WHERE id = ?").get(assignmentId);
  if (!a) return { ok: false, reason: "not found" };
  if (!Number(a.is_group)) return { ok: false, reason: "not a group assignment" };
  if (role === "teacher" || role === "admin") return { ok: true, assignment: a };
  let ids: string[] = [];
  try { const p = JSON.parse(a.target_student_ids || "[]"); if (Array.isArray(p)) ids = p; } catch {}
  if (!ids.includes(userId)) return { ok: false, reason: "not a member of this group" };
  return { ok: true, assignment: a };
}

router.get("/:id/group-notes", async (req: AuthRequest, res: Response) => {
  await ensureGradeCols();
  const check = await canAccessGroupNotes(req, req.params.id);
  if (!check.ok) return res.status(403).json({ error: check.reason });
  try {
    const row: any = await db.prepare("SELECT content, updated_at, updated_by FROM group_notes WHERE assignment_id = ?").get(req.params.id);
    res.json({ content: row?.content ?? "", updated_at: row?.updated_at ?? null, updated_by: row?.updated_by ?? null });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || "notes read failed" });
  }
});

router.put("/:id/group-notes", async (req: AuthRequest, res: Response) => {
  await ensureGradeCols();
  const check = await canAccessGroupNotes(req, req.params.id);
  if (!check.ok) return res.status(403).json({ error: check.reason });
  const content = String(req.body?.content ?? "").slice(0, 10000);
  const now = new Date().toISOString();
  try {
    const upd = await db.prepare(
      "UPDATE group_notes SET content = ?, updated_at = ?, updated_by = ? WHERE assignment_id = ?"
    ).run(content, now, req.user!.id, req.params.id);
    if (!upd.changes) {
      await db.prepare(
        "INSERT INTO group_notes (assignment_id, content, updated_at, updated_by) VALUES (?, ?, ?, ?)"
      ).run(req.params.id, content, now, req.user!.id);
    }
    res.json({ content, updated_at: now, updated_by: req.user!.id });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || "notes save failed" });
  }
});

// Class settings table — per-class defaults for the mega-button
let classSettingsReady = false;
async function ensureClassSettings() {
  if (classSettingsReady) return;
  try {
    await db.exec(`
      CREATE TABLE IF NOT EXISTS class_settings (
        class_id TEXT PRIMARY KEY,
        enabled_subjects TEXT NOT NULL DEFAULT '["reading","writing","spelling","vocabulary","math","science","history","sel"]',
        default_variety_level TEXT NOT NULL DEFAULT 'medium',
        default_question_count INTEGER NOT NULL DEFAULT 3,
        default_estimated_minutes INTEGER NOT NULL DEFAULT 5,
        default_hints_allowed INTEGER NOT NULL DEFAULT 1,
        updated_at TEXT NOT NULL DEFAULT ''
      )
    `);
    // Idempotent: per-subject "This Week's Focus" strings. Empty/null = no
    // directive (e.g. Math defaults to "Based Off Grade Level" → null).
    try { await db.exec("ALTER TABLE class_settings ADD COLUMN weekly_focus TEXT"); } catch { /* exists */ }
    classSettingsReady = true;
  } catch (e) { console.error('ensureClassSettings error:', e); }
}

// Default focus plan the user supplied. Applied to any class that hasn't
// explicitly saved its own weekly_focus yet.
const DEFAULT_WEEKLY_FOCUS: Record<string, string> = {
  reading: "phonics and beginning sounds",
  writing: "sentence structure",
  spelling: "weekly word list focus",
  vocabulary: "tier-2 academic words: define, use in a sentence, identify synonyms",
  math: "",                      // "Based Off Grade Level" → no directive
  science: "everyday observation: weather, plants, animals, the five senses",
  history: "early American history & community helpers — kid-friendly",
  sel: "theme: resilience",
};

router.get("/settings/:classId", requireRole("teacher", "admin"), async (req: AuthRequest, res: Response) => {
  await ensureClassSettings();
  try {
    const row = await db.prepare("SELECT * FROM class_settings WHERE class_id = ?").get(req.params.classId) as any;
    if (!row) {
      return res.json({
        enabled_subjects: ["reading", "writing", "spelling", "vocabulary", "math", "science", "history", "sel"],
        default_variety_level: "medium",
        default_question_count: 3,
        default_estimated_minutes: 5,
        default_hints_allowed: true,
        weekly_focus: DEFAULT_WEEKLY_FOCUS,
      });
    }
    let focus: any = DEFAULT_WEEKLY_FOCUS;
    try { if (row.weekly_focus) focus = JSON.parse(row.weekly_focus); } catch {}
    res.json({
      ...row,
      enabled_subjects: (() => { try { return JSON.parse(row.enabled_subjects); } catch { return ["reading","writing","spelling","vocabulary","math","science","history","sel"]; } })(),
      default_hints_allowed: !!row.default_hints_allowed,
      weekly_focus: focus,
    });
  } catch { res.json({}); }
});

router.put("/settings/:classId", requireRole("teacher", "admin"), async (req: AuthRequest, res: Response) => {
  await ensureClassSettings();
  const { enabled_subjects, default_variety_level, default_question_count, default_estimated_minutes, default_hints_allowed, weekly_focus } = req.body;
  const now = new Date().toISOString();
  try {
    await db.prepare(
      `INSERT INTO class_settings (class_id, enabled_subjects, default_variety_level, default_question_count, default_estimated_minutes, default_hints_allowed, weekly_focus, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (class_id) DO UPDATE SET
         enabled_subjects = excluded.enabled_subjects,
         default_variety_level = excluded.default_variety_level,
         default_question_count = excluded.default_question_count,
         default_estimated_minutes = excluded.default_estimated_minutes,
         default_hints_allowed = excluded.default_hints_allowed,
         weekly_focus = excluded.weekly_focus,
         updated_at = excluded.updated_at`
    ).run(
      req.params.classId,
      JSON.stringify(enabled_subjects || ["reading","writing","spelling","vocabulary","math","science","history","sel"]),
      default_variety_level || "medium",
      default_question_count != null ? Number(default_question_count) : 3,
      default_estimated_minutes != null ? Number(default_estimated_minutes) : 5,
      default_hints_allowed ? 1 : 0,
      weekly_focus ? JSON.stringify(weekly_focus) : JSON.stringify(DEFAULT_WEEKLY_FOCUS),
      now,
    );
    res.json({ ok: true });
  } catch (e: any) {
    console.error('class_settings put error:', e);
    res.status(500).json({ error: 'Failed' });
  }
});

// Create weekly assignments (Mon–Fri) — per-student × per-day, each uniquely generated
// Body: { classId, title, subject, grade, description, rubric, weekTheme? }
// For every student in the class × 5 weekdays: invokes the AI generator with a
// seed derived from student_id + date + subject so content is distinct. Falls
// back gracefully if OPENROUTER_API_KEY isn't set.
router.post("/weekly", requireRole("teacher", "admin"), async (req: AuthRequest, res: Response) => {
  const { classId, title, subject = "Reading", description, rubric, weekTheme } = req.body;
  await ensureGradeCols();

  const client = await getAnthropic();
  if (!client) {
    return res.status(503).json({
      error: "AI features not configured. Add OPENROUTER_API_KEY in Vercel env vars to enable weekly generation.",
      code: "AI_NOT_CONFIGURED",
    });
  }

  // Mon–Fri starting next Monday (or this Monday if today IS Monday)
  const today = new Date();
  const day = today.getDay();
  const daysUntilMonday = day === 0 ? 1 : day === 1 ? 0 : 8 - day;
  const monday = new Date(today);
  monday.setDate(today.getDate() + (day === 1 ? 0 : daysUntilMonday));
  const dayNames = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
  const dates: string[] = [];
  for (let i = 0; i < 5; i++) {
    const d = new Date(monday); d.setDate(monday.getDate() + i);
    dates.push(d.toISOString().slice(0, 10));
  }

  // Students in class
  const students = await db.prepare(
    "SELECT u.id, u.name FROM users u JOIN class_members cm ON cm.user_id::text = u.id::text WHERE cm.class_id::text = ? AND u.role = 'student'"
  ).all(classId) as any[];
  if (students.length === 0) {
    return res.status(400).json({ error: "No students enrolled in this class" });
  }

  const subjLower = String(subject).toLowerCase();
  const subjectKey = subjLower.includes("math") ? "math"
                   : subjLower.includes("writ") ? "writing" : "reading";

  // Look up per-student grades once
  const gradeRows = await db.prepare(
    "SELECT user_id, reading_grade, math_grade, writing_grade FROM user_grade_levels WHERE user_id::text IN (" +
    students.map(() => "?").join(",") + ")"
  ).all(...students.map(s => s.id)).catch(() => [] as any[]) as any[];
  const gradesById: Record<string, any> = {};
  for (const g of gradeRows) gradesById[g.user_id] = g;
  const gradeForStudent = (id: string): number => {
    const g = gradesById[id];
    if (!g) return 3;
    return Number(g[`${subjectKey}_grade`] ?? 3);
  };

  // Recent-prompts per student for dedup
  const recentPromptsByStudent: Record<string, string[]> = {};
  for (const s of students) {
    try {
      const rows = await db.prepare(
        "SELECT prompt FROM daily_tasks WHERE student_id::text = ? AND subject = ? AND date >= date('now','-14 day')"
      ).all(s.id, subjectKey) as any[];
      recentPromptsByStudent[s.id] = rows.map(r => r.prompt || "").slice(0, 10);
    } catch {
      recentPromptsByStudent[s.id] = [];
    }
  }

  // Build all tasks to generate: students × 5 days
  interface Slot { studentId: string; dateStr: string; dayName: string; dayIndex: number; }
  const slots: Slot[] = [];
  for (const s of students) {
    for (let i = 0; i < 5; i++) {
      slots.push({ studentId: s.id, dateStr: dates[i], dayName: dayNames[i], dayIndex: i });
    }
  }

  // Generate in batches of 5 concurrent calls — balances throughput vs. rate limits
  const BATCH = 5;
  const created: Array<{ id: string; student_id: string; day: string; date: string }> = [];
  const failed: Array<{ student_id: string; date: string; reason?: string }> = [];

  for (let i = 0; i < slots.length; i += BATCH) {
    const batch = slots.slice(i, i + BATCH);
    await Promise.all(batch.map(async (slot) => {
      const grade = gradeForStudent(slot.studentId);
      let final: { title: string; content: any };
      try {
        final = await generateDailyAssignmentContent(client, {
          studentId: slot.studentId, date: slot.dateStr, subject: subjectKey,
          gradeMin: grade, gradeMax: grade, weekTheme,
          recentPrompts: recentPromptsByStudent[slot.studentId] || [],
        });
      } catch {
        try {
          final = await generateDailyAssignmentContent(client, {
            studentId: slot.studentId, date: slot.dateStr + "|retry", subject: subjectKey,
            gradeMin: grade, gradeMax: grade, weekTheme,
            recentPrompts: recentPromptsByStudent[slot.studentId] || [],
          });
        } catch (e: any) {
          failed.push({ student_id: slot.studentId, date: slot.dateStr, reason: e?.message });
          return;
        }
      }
      // Add this generated prompt to the recent list so subsequent days in the
      // same batch run avoid repeating it too
      const firstPrompt = final.content?.sections?.[0]?.questions?.[0]?.text || "";
      if (firstPrompt) recentPromptsByStudent[slot.studentId]?.unshift(firstPrompt);

      const id = crypto.randomUUID();
      try {
        await db.prepare(
          `INSERT INTO assignments (id, class_id, teacher_id, student_id, title, description, due_date, rubric, content, scheduled_date, target_subject, target_grade_min, target_grade_max, week_theme)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).run(
          id, classId, req.user!.id, slot.studentId,
          `${title || final.title} — ${slot.dayName}`,
          description || final.content?.instructions || "",
          slot.dateStr,
          JSON.stringify(rubric || [{ label: "Correctness", maxPoints: 15 }]),
          JSON.stringify(final.content),
          slot.dateStr,
          subjectKey,
          grade,
          grade,
          weekTheme || null,
        );
        created.push({ id, student_id: slot.studentId, day: slot.dayName, date: slot.dateStr });
      } catch (e: any) {
        console.error("[weekly insert]", e?.message);
        failed.push({ student_id: slot.studentId, date: slot.dateStr, reason: e?.message });
      }
    }));
  }

  res.json({
    created: created.length,
    failed: failed.length,
    studentsAffected: students.length,
    daysPerStudent: 5,
    assignments: created,
    failures: failed,
  });
});

// Feature 29: Generate a full week of assignments across N subjects for every
// student in a class. Produces students × subjects × 5 rows — each distinct.
// Body: {
//   classId, weekStarting (optional Monday date),
//   subjects: ["reading","writing","spelling","math","sel", ...],
//   themeBySubject?: { reading: "...", math: "...", ... },
//   difficultyTweak?: "match" | "easier" | "harder",
//   varietyLevel?: "low" | "medium" | "high",
//   studentIds?: string[]  // default = all students in class
// }
router.post("/generate-full-week", requireRole("teacher", "admin"), async (req: AuthRequest, res: Response) => {
  const {
    classId, weekStarting,
    subjects = ["reading", "writing", "spelling", "vocabulary", "math", "science", "history", "sel"],
    themeBySubject = {},
    difficultyTweak = "match",
    varietyLevel = "medium",
    studentIds,
  } = req.body;
  await ensureGradeCols();

  const client = await getAnthropic();
  if (!client) {
    return res.status(503).json({
      error: "AI features not configured. Add OPENROUTER_API_KEY in Vercel env vars.",
      code: "AI_NOT_CONFIGURED",
    });
  }

  const ALL_DAY_NAMES_FW = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  let dates: string[];
  let dateDayNames: string[];
  if (weekStarting) {
    const start = new Date(weekStarting);
    dates = []; dateDayNames = [];
    for (let i = 0; i < 5; i++) {
      const d = new Date(start); d.setDate(start.getDate() + i);
      dates.push(d.toISOString().slice(0, 10));
      dateDayNames.push(ALL_DAY_NAMES_FW[d.getDay()]);
    }
  } else {
    const today2 = new Date();
    if (today2.getDay() === 6) today2.setDate(today2.getDate() + 2);
    else if (today2.getDay() === 0) today2.setDate(today2.getDate() + 1);
    const friday2 = new Date(today2); friday2.setDate(today2.getDate() + (5 - today2.getDay()));
    dates = []; dateDayNames = [];
    for (let d = new Date(today2); d <= friday2; d = new Date(d.getTime() + 86_400_000)) {
      if (d.getDay() >= 1 && d.getDay() <= 5) {
        dates.push(d.toISOString().slice(0, 10));
        dateDayNames.push(ALL_DAY_NAMES_FW[d.getDay()]);
      }
    }
  }

  // Roster — filter by studentIds if provided
  const roster = await db.prepare(
    "SELECT u.id, u.name FROM users u JOIN class_members cm ON cm.user_id::text = u.id::text WHERE cm.class_id::text = ? AND u.role = 'student'"
  ).all(classId) as any[];
  const students = (Array.isArray(studentIds) && studentIds.length)
    ? roster.filter(s => studentIds.includes(s.id))
    : roster;
  if (students.length === 0) return res.status(400).json({ error: "No students selected" });

  // Per-student grades
  const gradeRows = await db.prepare(
    "SELECT user_id, reading_grade, math_grade, writing_grade FROM user_grade_levels WHERE user_id::text IN (" +
    students.map(() => "?").join(",") + ")"
  ).all(...students.map(s => s.id)).catch(() => [] as any[]) as any[];
  const gradesById: Record<string, any> = {};
  for (const g of gradeRows) gradesById[g.user_id] = g;

  const subjectKey = (s: string): "reading" | "math" | "writing" => {
    const L = s.toLowerCase();
    if (L.includes("math")) return "math";
    if (L.includes("writ") || L.includes("spell")) return "writing";
    return "reading";
  };
  const gradeFor = (studentId: string, subject: string): number => {
    const g = gradesById[studentId];
    if (!g) return 3;
    const col = subjectKey(subject) + "_grade";
    let grade = Number(g[col] ?? 3);
    if (difficultyTweak === "easier") grade = Math.max(0, grade - 1);
    if (difficultyTweak === "harder") grade = Math.min(12, grade + 1);
    return grade;
  };

  // Pre-fetch recent prompts for each (student, subject) to avoid repeats
  const recent: Record<string, string[]> = {}; // key = studentId + "|" + subject
  for (const s of students) {
    for (const subj of subjects) {
      try {
        const rows = await db.prepare(
          "SELECT prompt FROM daily_tasks WHERE student_id::text = ? AND subject = ? AND date >= date('now','-14 day')"
        ).all(s.id, subjectKey(subj)) as any[];
        recent[`${s.id}|${subj}`] = rows.map((r: any) => r.prompt || "").slice(0, 10);
      } catch { recent[`${s.id}|${subj}`] = []; }
    }
  }

  // Build all slots
  interface Slot { studentId: string; subject: string; dateStr: string; dayName: string; }
  const slots: Slot[] = [];
  for (const s of students) {
    for (const subj of subjects) {
      for (let i = 0; i < dates.length; i++) {
        slots.push({ studentId: s.id, subject: subj, dateStr: dates[i], dayName: dateDayNames[i] });
      }
    }
  }

  const varietyHint = varietyLevel === "high"
    ? "IMPORTANT: make this DRAMATICALLY different from other days and past weeks — different question format, different theme, different angle."
    : varietyLevel === "low"
    ? "Keep this similar in style to recent work so it feels familiar."
    : "Mix it up — somewhat different format or angle from recent work.";

  const BATCH = 10;
  const created: any[] = [];
  const failed: any[] = [];

  for (let i = 0; i < slots.length; i += BATCH) {
    const batch = slots.slice(i, i + BATCH);
    await Promise.all(batch.map(async (slot) => {
      const grade = gradeFor(slot.studentId, slot.subject);
      const theme = themeBySubject[slot.subject] || themeBySubject[subjectKey(slot.subject)] || "";
      const recentList = recent[`${slot.studentId}|${slot.subject}`] || [];

      // Skip if this student already has an assignment for this date+subject —
      // lets the teacher rerun "Generate Full Week" to top up missing slots
      // without creating duplicates or touching student work in progress.
      try {
        const subjLowerSlot = String(slot.subject).trim().toLowerCase();
        const existingSlot = await db.prepare(
          "SELECT id FROM assignments WHERE student_id::text = ? AND scheduled_date = ? AND LOWER(title) LIKE ?"
        ).get(slot.studentId, slot.dateStr, subjLowerSlot + " —%") as any;
        if (existingSlot) {
          created.push({ id: existingSlot.id, student_id: slot.studentId, subject: slot.subject, date: slot.dateStr, skipped: true });
          return;
        }
      } catch { /* if check fails, fall through and let INSERT handle it */ }

      let final: { title: string; content: any };
      try {
        final = await generateDailyAssignmentContent(client, {
          studentId: slot.studentId,
          date: slot.dateStr + "|" + slot.subject,
          subject: subjectKey(slot.subject),
          gradeMin: grade, gradeMax: grade,
          weekTheme: [theme, varietyHint].filter(Boolean).join(". "),
          recentPrompts: recentList,
        });
      } catch {
        try {
          final = await generateDailyAssignmentContent(client, {
            studentId: slot.studentId, date: slot.dateStr + "|" + slot.subject + "|retry",
            subject: subjectKey(slot.subject), gradeMin: grade, gradeMax: grade,
            weekTheme: theme, recentPrompts: recentList,
          });
        } catch (e: any) {
          failed.push({ student_id: slot.studentId, date: slot.dateStr, subject: slot.subject, reason: e?.message });
          return;
        }
      }

      const firstPrompt = final.content?.sections?.[0]?.questions?.[0]?.text || "";
      if (firstPrompt) recent[`${slot.studentId}|${slot.subject}`]?.unshift(firstPrompt);

      const id = crypto.randomUUID();
      try {
        await db.prepare(
          `INSERT INTO assignments (id, class_id, teacher_id, student_id, title, description, due_date, rubric, content, scheduled_date, target_subject, target_grade_min, target_grade_max, week_theme)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).run(
          id, classId, req.user!.id, slot.studentId,
          `${slot.subject.charAt(0).toUpperCase() + slot.subject.slice(1)} — ${slot.dayName}`,
          final.content?.instructions || "",
          slot.dateStr,
          JSON.stringify([{ label: "Correctness", maxPoints: 15 }]),
          JSON.stringify(final.content),
          slot.dateStr,
          subjectKey(slot.subject),
          grade, grade,
          theme || null,
        );
        created.push({ id, student_id: slot.studentId, subject: slot.subject, date: slot.dateStr });
      } catch (e: any) {
        failed.push({ student_id: slot.studentId, date: slot.dateStr, subject: slot.subject, reason: e?.message });
      }
    }));
  }

  res.json({
    created: created.length, failed: failed.length,
    studentsAffected: students.length,
    subjectsPerStudent: subjects.length, daysPerSubject: 5,
    expected: students.length * subjects.length * 5,
    failures: failed,
  });
});

// Feature 29 v2: client-orchestrated full-week generation
// 1) POST /plan-full-week — returns the slot list (no AI). Fast, never
//    hits a serverless timeout, tells the client exactly what to render
//    in the progress bar.
// 2) POST /generate-slot — generates ONE student × subject × day. One AI
//    call (~5-10s), stays under every serverless budget. Client fires
//    these in parallel with its own concurrency limit.
router.post("/plan-full-week", requireRole("teacher", "admin"), async (req: AuthRequest, res: Response) => {
  const {
    classId, weekStarting,
    subjects = ["reading", "writing", "spelling", "vocabulary", "math", "science", "history", "sel"],
    themeBySubject = {},
    difficultyTweak = "match",
    varietyLevel = "medium",
    studentIds,
  } = req.body;
  await ensureGradeCols();

  // Fail fast if no AI provider configured — client shows a clear error
  if (!process.env.OPENROUTER_API_KEY) {
    return res.status(503).json({
      error: "AI features not configured. Add OPENROUTER_API_KEY in Vercel env vars to enable weekly generation.",
      code: "AI_NOT_CONFIGURED",
    });
  }

  const ALL_DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  let dates: string[];
  let slotDayNames: string[];

  if (weekStarting) {
    // Teacher picked a specific start date — generate Mon–Fri (5 days) from there
    const start = new Date(weekStarting);
    dates = [];
    slotDayNames = [];
    for (let i = 0; i < 5; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      dates.push(d.toISOString().slice(0, 10));
      slotDayNames.push(ALL_DAY_NAMES[d.getDay()]);
    }
  } else {
    // Default: today through Friday of this week
    const today = new Date();
    // If today is weekend, push to Monday
    if (today.getDay() === 6) today.setDate(today.getDate() + 2);
    else if (today.getDay() === 0) today.setDate(today.getDate() + 1);
    // Friday of the same week
    const friday = new Date(today);
    friday.setDate(today.getDate() + (5 - today.getDay()));
    dates = [];
    slotDayNames = [];
    for (let d = new Date(today); d <= friday; d = new Date(d.getTime() + 86_400_000)) {
      if (d.getDay() >= 1 && d.getDay() <= 5) {
        dates.push(d.toISOString().slice(0, 10));
        slotDayNames.push(ALL_DAY_NAMES[d.getDay()]);
      }
    }
  }

  const roster = await db.prepare(
    "SELECT u.id, u.name FROM users u JOIN class_members cm ON cm.user_id::text = u.id::text WHERE cm.class_id::text = ? AND u.role = 'student'"
  ).all(classId) as any[];
  const students = (Array.isArray(studentIds) && studentIds.length)
    ? roster.filter(s => studentIds.includes(s.id))
    : roster;
  if (students.length === 0) return res.status(400).json({ error: "No students in this class" });

  // Grades lookup
  const gradeRows = await db.prepare(
    "SELECT user_id, reading_grade, math_grade, writing_grade FROM user_grade_levels WHERE user_id::text IN (" +
    students.map(() => "?").join(",") + ")"
  ).all(...students.map(s => String(s.id))).catch(() => [] as any[]) as any[];
  const gradesById: Record<string, any> = {};
  for (const g of gradeRows) gradesById[String(g.user_id)] = g;

  const subjectKey = (s: string): "reading" | "math" | "writing" => {
    const L = s.toLowerCase();
    if (L.includes("math")) return "math";
    if (L.includes("writ") || L.includes("spell")) return "writing";
    return "reading";
  };
  const gradeFor = (studentId: string, subject: string): number => {
    const g = gradesById[String(studentId)];
    const raw = g ? Number(g[subjectKey(subject) + "_grade"] ?? 3) : 3;
    if (difficultyTweak === "easier") return Math.max(0, raw - 1);
    if (difficultyTweak === "harder") return Math.min(12, raw + 1);
    return raw;
  };

  const varietyHint = varietyLevel === "high"
    ? "Make this dramatically different from other days and past weeks."
    : varietyLevel === "low"
    ? "Keep this similar in style to recent work."
    : "Mix it up — somewhat different format or angle.";

  const slots: any[] = [];
  for (const s of students) {
    for (const subj of subjects) {
      for (let i = 0; i < dates.length; i++) {
        const grade = gradeFor(s.id, subj);
        slots.push({
          classId,
          studentId: s.id,
          studentName: s.name,
          subject: subj,
          subjectKey: subjectKey(subj),
          date: dates[i],
          dayName: slotDayNames[i],
          gradeMin: grade,
          gradeMax: grade,
          weekTheme: [themeBySubject[subj] || themeBySubject[subjectKey(subj)] || "", varietyHint].filter(Boolean).join(". "),
        });
      }
    }
  }

  res.json({
    slots,
    total: slots.length,
    students: students.length,
    subjects: subjects.length,
    days: dates.length,
    estimatedSecondsAtConcurrency: (s: number) => Math.ceil(slots.length / s * 6),
  });
});

// Generate ONE slot. One AI call per request. Client calls this N times
// in parallel with its own concurrency limit — always stays under the
// serverless function timeout regardless of class size.
router.post("/generate-slot", requireRole("teacher", "admin"), async (req: AuthRequest, res: Response) => {
  const T0 = Date.now();
  const tag = `[slot ${Math.random().toString(36).slice(2, 6)}]`;
  console.log(`${tag} ENTER +0ms body=${JSON.stringify(req.body).slice(0,200)}`);
  const client = await getAnthropic();
  if (!client) {
    console.log(`${tag} NO_KEY +${Date.now()-T0}ms`);
    return res.status(503).json({ error: "AI not configured: set OPENROUTER_API_KEY in Vercel env vars", code: "AI_NOT_CONFIGURED" });
  }
  console.log(`${tag} CLIENT_OK +${Date.now()-T0}ms`);
  try { await ensureGradeCols(); } catch (e: any) { console.log(`${tag} ENSURE_COLS_ERR +${Date.now()-T0}ms ${e?.message}`); }
  console.log(`${tag} COLS_READY +${Date.now()-T0}ms`);

  const {
    classId, studentId, subject, subjectKey = subject, date, dayName,
    gradeMin, gradeMax, weekTheme, teacherNotes, focusKeywords,
    learningObjective, questionType, questionCount, estimatedMinutes,
    hintsAllowed,
    force,
  } = req.body;

  if (!classId || !studentId || !subject || !date || gradeMin == null) {
    console.log(`${tag} BAD_REQ +${Date.now()-T0}ms`);
    return res.status(400).json({ error: "Missing required fields" });
  }

  // Look up any existing assignment for this (student, date, subject).
  //   force=false (default): skip — never duplicate, never touch existing.
  //   force=true: if the student has already SUBMITTED this assignment,
  //     skip (preserve their work). Otherwise we'll regenerate the content
  //     in place lower in the handler and UPDATE rather than INSERT.
  // Use title prefix (e.g. "spelling —") not target_subject, because both
  // "spelling" and "writing" map to target_subject="writing" and would
  // incorrectly block each other.
  let existingIdToUpdate: string | null = null;
  try {
    const subjLower = String(subject).trim().toLowerCase();
    const existing = await db.prepare(
      "SELECT id FROM assignments WHERE student_id::text = ? AND scheduled_date = ? AND LOWER(title) LIKE ?"
    ).get(studentId, date, subjLower + " —%") as any;
    if (existing) {
      if (!force) {
        console.log(`${tag} SKIP_EXISTING id=${existing.id}`);
        return res.json({ ok: true, skipped: true, existingId: existing.id });
      }
      // force=true — bail if already submitted, otherwise plan to UPDATE.
      const sub = await db.prepare(
        "SELECT id FROM submissions WHERE assignment_id = ? LIMIT 1"
      ).get(existing.id).catch(() => null) as any;
      if (sub) {
        console.log(`${tag} SKIP_SUBMITTED id=${existing.id}`);
        return res.json({ ok: true, skipped: true, submitted: true, existingId: existing.id });
      }
      existingIdToUpdate = existing.id as string;
      console.log(`${tag} WILL_REGEN id=${existing.id}`);
    }
  } catch (e: any) { console.log(`${tag} SKIP_CHECK_ERR ${e?.message}`); }

  // Recent prompts for dedup (bounded, fast)
  let recent: string[] = [];
  try {
    const rows = await db.prepare(
      "SELECT prompt FROM daily_tasks WHERE student_id = ? AND subject = ? AND date >= date('now','-14 day')"
    ).all(studentId, subjectKey) as any[];
    recent = rows.map((r: any) => r.prompt || "").slice(0, 6);
  } catch (e: any) { console.log(`${tag} RECENT_ERR +${Date.now()-T0}ms ${e?.message}`); }
  console.log(`${tag} RECENT_OK +${Date.now()-T0}ms n=${recent.length}`);

  console.log(`${tag} ANTHROPIC_START +${Date.now()-T0}ms`);
  let gen: { title: string; content: any };
  try {
    gen = await generateDailyAssignmentContent(client, {
      studentId, date: `${date}|${subject}`, subject: subjectKey,
      gradeMin: Number(gradeMin), gradeMax: Number(gradeMax ?? gradeMin),
      weekTheme, recentPrompts: recent,
      questionCount, teacherNotes, focusKeywords, questionType, learningObjective,
    });
    console.log(`${tag} ANTHROPIC_DONE +${Date.now()-T0}ms`);
  } catch (e: any) {
    console.error(`${tag} AI_ERR +${Date.now()-T0}ms`, e?.message);
    return res.status(500).json({ error: "Generation failed", detail: e?.message, tag });
  }

  // force=true + existing unsubmitted assignment → UPDATE in place so the
  // student sees the new (easier) content next time they open it. We only
  // touch fields that come from generation; we don't mess with class_id,
  // teacher_id, student_id, scheduled_date, etc.
  if (existingIdToUpdate) {
    try {
      await db.prepare(
        `UPDATE assignments SET title = ?, description = ?, content = ?, week_theme = ? WHERE id = ?`
      ).run(
        `${String(subject).charAt(0).toUpperCase() + String(subject).slice(1)} — ${dayName}`,
        gen.content?.instructions || "",
        JSON.stringify(gen.content),
        weekTheme || null,
        existingIdToUpdate,
      );
      console.log(`${tag} UPDATE_OK id=${existingIdToUpdate}`);
      return res.json({ ok: true, regenerated: true, id: existingIdToUpdate, student: studentId, date, subject });
    } catch (e: any) {
      console.error(`${tag} UPDATE_ERR`, e?.message);
      return res.status(500).json({ error: 'Update failed', detail: e?.message, classId, studentId });
    }
  }

  const id = crypto.randomUUID();
  try {
    const result = await db.prepare(
      `INSERT INTO assignments (id, class_id, teacher_id, student_id, title, description, due_date, rubric, content, scheduled_date, target_subject, target_grade_min, target_grade_max, week_theme, teacher_notes, question_count, estimated_minutes, focus_keywords, learning_objective, hints_allowed, question_type)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id, classId, req.user!.id, studentId,
      `${String(subject).charAt(0).toUpperCase() + String(subject).slice(1)} — ${dayName}`,
      gen.content?.instructions || "",
      date,
      JSON.stringify([{ label: "Correctness", maxPoints: 15 }]),
      JSON.stringify(gen.content),
      date,
      subjectKey,
      Number(gradeMin), Number(gradeMax ?? gradeMin),
      weekTheme || null,
      teacherNotes || null,
      questionCount != null ? Number(questionCount) : null,
      estimatedMinutes != null ? Number(estimatedMinutes) : null,
      focusKeywords || null,
      learningObjective || null,
      hintsAllowed != null ? (hintsAllowed ? 1 : 0) : 1,
      questionType || null,
    );
    console.log(`${tag} INSERT_OK changes=${result.changes} id=${id}`);
    if (!result.changes || result.changes < 1) {
      console.error(`${tag} INSERT_NO_ROWS id=${id} classId=${classId} studentId=${studentId}`);
      return res.status(500).json({ error: 'Insert wrote 0 rows', id, classId, studentId });
    }
    res.json({ ok: true, id, student: studentId, date, subject });
  } catch (e: any) {
    console.error(`${tag} INSERT_ERR`, e?.message, e?.stack?.slice(0, 400));
    res.status(500).json({ error: 'Insert failed', detail: e?.message, classId, studentId });
  }
});

// Delete all student-specific (AI-generated) assignments for a class within a date range.
// Body: { classId, dateFrom, dateTo }  — dateTo is inclusive.
router.delete("/class/:classId/generated", requireRole("teacher", "admin"), async (req: AuthRequest, res: Response) => {
  const classId = req.params.classId;
  const { dateFrom, dateTo } = req.body as { dateFrom?: string; dateTo?: string };
  if (!dateFrom || !dateTo) return res.status(400).json({ error: "dateFrom and dateTo required" });
  try {
    const result = await db.prepare(
      `DELETE FROM assignments WHERE class_id::text = ? AND student_id IS NOT NULL
         AND scheduled_date >= ? AND scheduled_date <= ?`
    ).run(classId, dateFrom, dateTo);
    res.json({ deleted: result.changes });
  } catch (e: any) {
    res.status(500).json({ error: e?.message });
  }
});

// Get all pending (unsubmitted) assignments for current student in a class.
// Honors per-assignment grade targeting:
//   - If target_grade_min IS NULL → assignment shows to everyone in class
//   - Else: student's grade for target_subject must fall in [min, max]
router.get("/class/:classId/pending", async (req: AuthRequest, res: Response) => {
  const userId = req.user!.id;
  const classId = req.params.classId;
  try {
    try { await ensureGradeCols(); } catch { /* non-fatal */ }
    // Paper-only students never see digital assignments — teacher prints them
    try {
      try { await db.exec(`ALTER TABLE users ADD COLUMN paper_only INTEGER NOT NULL DEFAULT 0`); } catch { /* already exists */ }
      const s: any = await db.prepare("SELECT paper_only FROM users WHERE id=?::uuid").get(userId);
      if (s && Number(s.paper_only) === 1) return res.json([]);
    } catch { /* column not yet migrated */ }
    // Honors per-student assignments via the student_id column:
    //   - student_id IS NULL  → class-wide assignment (everyone sees it)
    //   - student_id = userId → only this student sees it
    //   - student_id = someone else → hidden
    // All date math in Pacific time (PDT = UTC-7; PST = UTC-8 Nov–Mar).
    // Using UTC-7 covers the school year Apr–Oct; the teacher can update if needed.
    const PACIFIC_MS = -7 * 3600_000;
    const schoolNow = new Date(Date.now() + PACIFIC_MS);
    const todayStr = schoolNow.toISOString().slice(0, 10); // Pacific calendar date

    // After 3:10 PM Pacific, surface the next school day's assignments.
    const isAfterRelease = schoolNow.getUTCHours() > 15 ||
      (schoolNow.getUTCHours() === 15 && schoolNow.getUTCMinutes() >= 10);
    const nextDayStr = isAfterRelease
      ? new Date(schoolNow.getTime() + 86_400_000).toISOString().slice(0, 10)
      : todayStr; // same date → harmless duplicate in OR clause

    // Exclude heavy content column from list — client fetches it on demand via GET /:id
    const rows = await db.prepare(`
      SELECT a.id, a.class_id, a.teacher_id, a.student_id, a.title, a.description,
             a.due_date, a.rubric, a.scheduled_date, a.target_subject,
             a.target_grade_min, a.target_grade_max, a.target_student_ids,
             a.week_theme, a.hints_allowed, a.video_url, a.attached_pdf_path,
             a.source, a.is_group, a.group_name, a.created_at,
             a.question_count, a.estimated_minutes, a.is_afternoon
      FROM assignments a
      LEFT JOIN submissions s ON s.assignment_id::text = a.id::text AND s.student_id::text = ?
      WHERE a.class_id::text = ? AND s.id IS NULL
        AND (a.student_id IS NULL OR a.student_id::text = ?)
        AND (a.scheduled_date IS NULL OR a.scheduled_date = ? OR a.scheduled_date = ?)
      ORDER BY a.is_afternoon ASC, a.scheduled_date ASC, a.created_at ASC
    `).all(userId, classId, userId, todayStr, nextDayStr) as any[];

    // Look up this student's grade levels once
    let studentGrades: any = null;
    try {
      studentGrades = await db.prepare(
        "SELECT reading_grade, math_grade, writing_grade FROM user_grade_levels WHERE user_id::text = ?"
      ).get(userId);
    } catch { /* grades table may not exist yet */ }
    const gradeFor = (subject: string | null): number => {
      if (!studentGrades) return 3; // reasonable default
      const col = subject === 'math' ? 'math_grade'
                : subject === 'writing' ? 'writing_grade'
                : 'reading_grade';
      return Number(studentGrades[col] ?? 3);
    };

    const filtered = rows.filter((r: any) => {
      r.rubric = JSON.parse(r.rubric || "[]");
      // Direct-assign to specific students takes precedence: if the column is
      // populated, ONLY those student_ids see this assignment. NULL/empty =>
      // fall through to the legacy class/grade rules below.
      if (r.target_student_ids) {
        let ids: string[] = [];
        try { const parsed = JSON.parse(r.target_student_ids); if (Array.isArray(parsed)) ids = parsed; } catch {}
        if (ids.length > 0) return ids.includes(userId);
      }
      // If no grade target set, assignment is for everyone in class
      if (r.target_grade_min == null) return true;
      // If student has no grade levels configured, show them all grade-targeted assignments
      if (!studentGrades) return true;
      const tMin = Number(r.target_grade_min);
      const tMax = r.target_grade_max != null ? Number(r.target_grade_max) : tMin;
      const g = gradeFor(r.target_subject);
      return g >= tMin && g <= tMax;
    });

    // Show every pending assignment — afternoon/extension work appears in
    // the same list as morning work, sorted afternoon-last by the SQL ORDER
    // BY. Keeping a separate "afternoon-only-after-morning" gate caused
    // assignments to silently vanish for students whose state confused the
    // gate, so we just hand them the full list.
    res.json(filtered);
  } catch (e) {
    console.error('pending assignments error:', e);
    res.status(500).json({ error: 'Failed to fetch pending assignments' });
  }
});

// Debug: what does a specific student see? GET /class/:classId/debug-pending?studentId=XXX
// Returns raw rows + filter reason for each — teacher-only diagnostic tool
router.get("/class/:classId/debug-pending", requireRole("teacher", "admin"), async (req: AuthRequest, res: Response) => {
  const { studentId } = req.query as any;
  if (!studentId) return res.status(400).json({ error: "studentId query param required" });
  const todayStr = new Date().toISOString().slice(0, 10);
  try {
    const rows = await db.prepare(
      `SELECT a.id, a.title, a.student_id, a.target_student_ids, a.target_grade_min, a.target_grade_max,
              a.target_subject, a.scheduled_date, a.class_id,
              s.id as submission_id
       FROM assignments a
       LEFT JOIN submissions s ON s.assignment_id::text = a.id::text AND s.student_id::text = ?
       WHERE a.class_id::text = ?
       ORDER BY a.scheduled_date ASC, a.created_at ASC`
    ).all(studentId, req.params.classId) as any[];

    const studentGrades = await db.prepare(
      "SELECT reading_grade, math_grade, writing_grade FROM user_grade_levels WHERE user_id::text = ?"
    ).get(studentId) as any;

    const annotated = rows.map((r: any) => {
      let visible = true;
      let reason = "ok";

      if (r.submission_id) { visible = false; reason = "already submitted"; }
      else if (r.student_id && r.student_id !== studentId) { visible = false; reason = `student_id locked to ${r.student_id}`; }
      else if (r.scheduled_date && r.scheduled_date.slice(0,10) > todayStr) { visible = false; reason = `future: ${r.scheduled_date}`; }
      else if (r.target_student_ids) {
        try {
          const ids = JSON.parse(r.target_student_ids);
          if (Array.isArray(ids) && ids.length > 0 && !ids.includes(studentId)) {
            visible = false; reason = `target_student_ids excludes this student (${ids.join(",")})`;
          }
        } catch { reason = "target_student_ids parse error"; }
      } else if (r.target_grade_min != null) {
        const col = r.target_subject === 'math' ? 'math_grade' : r.target_subject === 'writing' ? 'writing_grade' : 'reading_grade';
        const g = studentGrades ? Number(studentGrades[col] ?? 3) : 3;
        const tMax = r.target_grade_max ?? r.target_grade_min;
        if (g < Number(r.target_grade_min) || g > Number(tMax)) {
          visible = false; reason = `grade ${g} outside [${r.target_grade_min}–${tMax}] for ${r.target_subject}`;
        }
      }
      return { ...r, visible, reason };
    });

    res.json({ todayStr, studentGrades, assignments: annotated });
  } catch (e: any) {
    res.status(500).json({ error: e?.message });
  }
});

// Get today's assignment for a class
router.get("/class/:classId/today", async (req: AuthRequest, res: Response) => {
  const today = new Date().toISOString().slice(0, 10);
  try {
    const rows = await db.prepare(
      `SELECT * FROM assignments WHERE class_id = ? AND (scheduled_date = ? OR (scheduled_date IS NULL AND date(due_date) = ?)) ORDER BY created_at DESC LIMIT 1`
    ).all(req.params.classId, today, today) as any[];
    rows.forEach((r) => { r.rubric = JSON.parse(r.rubric || "[]"); });
    res.json(rows);
  } catch {
    res.json([]);
  }
});

// List assignments for a class.
// Includes submission_count so the grading panel can sort/highlight assignments
// that actually have submissions to grade (otherwise teachers land on an empty
// assignment and assume grading is broken).
router.get("/class/:classId", async (req: AuthRequest, res: Response) => {
  const rows = await db.prepare(
    `SELECT a.*,
            (SELECT COUNT(*) FROM submissions s WHERE s.assignment_id = a.id) AS submission_count
       FROM assignments a
      WHERE a.class_id = ?
      ORDER BY a.due_date ASC`
  ).all(req.params.classId) as any[];
  rows.forEach((r) => {
    r.rubric = JSON.parse(r.rubric || "[]");
    r.submission_count = Number(r.submission_count || 0);
  });
  res.json(rows);
});

// Get single assignment
router.get("/:id", async (req: AuthRequest, res: Response) => {
  const row = await db.prepare("SELECT * FROM assignments WHERE id = ?").get(req.params.id) as any;
  if (!row) return res.status(404).json({ error: "Not found" });
  row.rubric = JSON.parse(row.rubric || "[]");
  res.json(row);
});

// Update assignment
router.put("/:id", requireRole("teacher", "admin"), async (req: AuthRequest, res: Response) => {
  await ensureGradeCols();
  const {
    title, description, dueDate, rubric, content,
    teacherNotes, questionCount, estimatedMinutes,
    focusKeywords, learningObjective, hintsAllowed, questionType,
    targetSubject, targetGradeMin, targetGradeMax, targetStudentIds,
    videoUrl,
  } = req.body;
  const encodedTargetStudents =
    targetStudentIds === undefined
      ? null
      : Array.isArray(targetStudentIds) && targetStudentIds.length > 0
        ? JSON.stringify(targetStudentIds)
        : ""; // empty-string sentinel → clear (distinct from COALESCE NULL keep)
  await db.prepare(
    `UPDATE assignments SET
       title = COALESCE(?, title),
       description = COALESCE(?, description),
       due_date = COALESCE(?, due_date),
       rubric = COALESCE(?, rubric),
       content = COALESCE(?, content),
       teacher_notes = COALESCE(?, teacher_notes),
       question_count = COALESCE(?, question_count),
       estimated_minutes = COALESCE(?, estimated_minutes),
       focus_keywords = COALESCE(?, focus_keywords),
       learning_objective = COALESCE(?, learning_objective),
       hints_allowed = COALESCE(?, hints_allowed),
       question_type = COALESCE(?, question_type),
       target_subject = COALESCE(?, target_subject),
       target_grade_min = COALESCE(?, target_grade_min),
       target_grade_max = COALESCE(?, target_grade_max),
       target_student_ids = CASE WHEN ? = '__KEEP__' THEN target_student_ids
                                 WHEN ? = '' THEN NULL
                                 ELSE ? END,
       video_url = CASE WHEN ? = '__KEEP__' THEN video_url WHEN ? = '' THEN NULL ELSE ? END
     WHERE id = ?`
  ).run(
    title, description, dueDate,
    rubric ? JSON.stringify(rubric) : null,
    content != null ? (typeof content === 'string' ? content : JSON.stringify(content)) : null,
    teacherNotes ?? null,
    questionCount != null ? Number(questionCount) : null,
    estimatedMinutes != null ? Number(estimatedMinutes) : null,
    focusKeywords ?? null,
    learningObjective ?? null,
    hintsAllowed != null ? (hintsAllowed ? 1 : 0) : null,
    questionType ?? null,
    targetSubject ?? null,
    targetGradeMin != null ? Number(targetGradeMin) : null,
    targetGradeMax != null ? Number(targetGradeMax) : null,
    encodedTargetStudents === null ? "__KEEP__" : encodedTargetStudents,
    encodedTargetStudents === null ? "__KEEP__" : encodedTargetStudents,
    encodedTargetStudents === null ? "__KEEP__" : encodedTargetStudents,
    videoUrl === undefined ? "__KEEP__" : (videoUrl || ""),
    videoUrl === undefined ? "__KEEP__" : (videoUrl || ""),
    videoUrl === undefined ? "__KEEP__" : (videoUrl || ""),
    req.params.id,
  );
  const row = await db.prepare("SELECT * FROM assignments WHERE id = ?").get(req.params.id) as any;
  if (row) row.rubric = JSON.parse(row.rubric || "[]");
  res.json(row);
});

// Bulk operations on multiple assignments at once.
// Body: { assignmentIds: string[], action: "assign"|"grade"|"delete",
//         studentIds?: string[], targetSubject?, targetGradeMin?, targetGradeMax? }
router.post("/bulk", requireRole("teacher", "admin"), async (req: AuthRequest, res: Response) => {
  await ensureGradeCols();
  const { assignmentIds, action, studentIds, targetSubject, targetGradeMin, targetGradeMax } = req.body || {};
  if (!Array.isArray(assignmentIds) || assignmentIds.length === 0) {
    return res.status(400).json({ error: "assignmentIds (non-empty array) required" });
  }
  const isAdmin = req.user!.role === "admin";
  const me = req.user!.id;

  const placeholders = assignmentIds.map(() => "?").join(",");
  const ownedRows = await db.prepare(
    `SELECT id, teacher_id FROM assignments WHERE id IN (${placeholders})`
  ).all(...assignmentIds) as any[];
  const allowed = ownedRows
    .filter(r => isAdmin || r.teacher_id === me)
    .map(r => r.id);
  if (allowed.length === 0) return res.status(403).json({ error: "No permission on selected assignments" });
  const allowedPh = allowed.map(() => "?").join(",");

  try {
    if (action === "assign") {
      const ids = Array.isArray(studentIds) ? studentIds.filter(Boolean) : [];
      const encoded = ids.length > 0 ? JSON.stringify(ids) : null;
      await db.prepare(
        `UPDATE assignments SET target_student_ids = ? WHERE id IN (${allowedPh})`
      ).run(encoded, ...allowed);
      return res.json({ updated: allowed.length, action, studentIds: ids });
    }
    if (action === "grade") {
      await db.prepare(
        `UPDATE assignments SET
           target_subject = COALESCE(?, target_subject),
           target_grade_min = COALESCE(?, target_grade_min),
           target_grade_max = COALESCE(?, target_grade_max)
         WHERE id IN (${allowedPh})`
      ).run(
        targetSubject ?? null,
        targetGradeMin != null ? Number(targetGradeMin) : null,
        targetGradeMax != null ? Number(targetGradeMax) : null,
        ...allowed,
      );
      return res.json({ updated: allowed.length, action });
    }
    if (action === "delete") {
      await db.prepare(`DELETE FROM submissions WHERE assignment_id IN (${allowedPh})`).run(...allowed).catch(() => {});
      await db.prepare(`DELETE FROM assignment_adjustments WHERE assignment_id IN (${allowedPh})`).run(...allowed).catch(() => {});
      await db.prepare(`DELETE FROM assignments WHERE id IN (${allowedPh})`).run(...allowed);
      return res.json({ deleted: allowed.length, action });
    }
    return res.status(400).json({ error: `Unknown action: ${action}` });
  } catch (e: any) {
    console.error("bulk op error:", e);
    res.status(500).json({ error: "Bulk op failed", detail: e?.message });
  }
});

// POST /api/assignments/:id/grade — teacher stamps a human pass/fail grade on
// a specific student's submission for this assignment. If the student hasn't
// submitted yet, we create a zero-content submission row so the grade still
// records (covers pencil-and-paper work the teacher is grading manually).
// Body: { studentId: string, passed: boolean, feedback?: string, score?: number }
// score accepts 0-100; passed is derived automatically when score is provided
router.post("/:id/grade", requireRole("teacher", "admin"), async (req: AuthRequest, res: Response) => {
  await ensureHumanGradeCols();
  const { studentId, passed, feedback, score } = req.body || {};
  if (!studentId) {
    return res.status(400).json({ error: "studentId required" });
  }
  // Derive passed from score if score provided; otherwise require explicit boolean
  let resolvedPassed: boolean;
  let resolvedScore: number | null = null;
  if (typeof score === "number" && !isNaN(score)) {
    resolvedScore = Math.max(0, Math.min(100, Math.round(score)));
    resolvedPassed = resolvedScore >= 60;
  } else if (typeof passed === "boolean") {
    resolvedPassed = passed;
  } else {
    return res.status(400).json({ error: "Either score (number) or passed (bool) required" });
  }
  const graderId = req.user!.id;
  const now = new Date().toISOString();
  const passInt = resolvedPassed ? 1 : 0;
  const fb = typeof feedback === "string" ? feedback : null;
  try {
    // Find the most recent submission by this student for this assignment.
    const existing = await db.prepare(
      `SELECT id FROM submissions
        WHERE assignment_id = ? AND student_id = ?
        ORDER BY submitted_at DESC
        LIMIT 1`
    ).get(req.params.id, studentId) as any;

    if (existing?.id) {
      await db.prepare(
        `UPDATE submissions
            SET human_grade_pass = ?,
                human_grade_score = ?,
                human_grade_feedback = COALESCE(?, human_grade_feedback),
                graded_by = ?,
                graded_at = ?
          WHERE id = ?`
      ).run(passInt, resolvedScore, fb, graderId, now, existing.id);
    } else {
      // No submission exists — create a placeholder row so the grade has a home.
      const subId = crypto.randomUUID();
      await db.prepare(
        `INSERT INTO submissions
           (id, assignment_id, student_id, submitted_at,
            human_grade_pass, human_grade_score, human_grade_feedback, graded_by, graded_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(subId, req.params.id, studentId, now, passInt, resolvedScore, fb, graderId, now);
    }

    const row = await db.prepare(
      `SELECT * FROM submissions
        WHERE assignment_id = ? AND student_id = ?
        ORDER BY submitted_at DESC
        LIMIT 1`
    ).get(req.params.id, studentId) as any;
    if (row?.auto_grade_result) {
      try { row.auto_grade_result = JSON.parse(row.auto_grade_result); } catch { /* noop */ }
    }
    res.json({ ok: true, submission: row });
  } catch (e) {
    console.error("POST /assignments/:id/grade failed:", e);
    res.status(500).json({ error: "Failed to save grade" });
  }
});

// How many students have already submitted this assignment? Teacher sees this
// before editing so they know the scope of "edits only affect new submissions".
router.get("/:id/submission-count", requireRole("teacher", "admin"), async (req: AuthRequest, res: Response) => {
  try {
    const row = await db.prepare(
      "SELECT COUNT(*) AS n FROM submissions WHERE assignment_id = ?"
    ).get(req.params.id) as any;
    res.json({ count: Number(row?.n || 0) });
  } catch { res.json({ count: 0 }); }
});

// Ensure the adjustments log table exists (idempotent)
let adjLogReady = false;
async function ensureAdjLog() {
  if (adjLogReady) return;
  try {
    await db.exec(`
      CREATE TABLE IF NOT EXISTS assignment_adjustments (
        id TEXT PRIMARY KEY,
        assignment_id TEXT NOT NULL,
        teacher_id TEXT NOT NULL,
        direction TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT ''
      )
    `);
    adjLogReady = true;
  } catch (e) { console.error('ensureAdjLog error:', e); }
}

// Adjust difficulty (make easier / harder) via AI
// POST /assignments/:id/adjust-difficulty  body: { direction: "easier" | "harder" }
router.post("/:id/adjust-difficulty", requireRole("teacher", "admin"), async (req: AuthRequest, res: Response) => {
  const { direction } = req.body;
  if (direction !== "easier" && direction !== "harder") {
    return res.status(400).json({ error: "direction must be 'easier' or 'harder'" });
  }
  await ensureAdjLog();
  const client = await getAnthropic();
  if (!client) {
    return res.status(503).json({ error: "AI features not configured. Add OPENROUTER_API_KEY." });
  }

  const row = await db.prepare("SELECT * FROM assignments WHERE id = ?").get(req.params.id) as any;
  if (!row) return res.status(404).json({ error: "Not found" });
  let current: any = {};
  try { current = row.content ? JSON.parse(row.content) : {}; } catch {}
  if (!current?.sections) return res.status(400).json({ error: "Assignment has no editable content" });

  const directive = direction === "easier"
    ? "Rewrite this to be EASIER. Use shorter sentences, simpler vocabulary, smaller numbers, more direct questions. Keep the same general topic and the same question count."
    : "Rewrite this to be MORE CHALLENGING. Use longer sentences, more advanced vocabulary, larger numbers, questions that require multi-step reasoning. Keep the same general topic and the same question count.";

  try {
    const sysAdj = "You are a creative elementary teacher. Return JSON ONLY matching the EXACT same shape as the input. No markdown, no preamble.";
    const userAdj = `Current task JSON:\n${JSON.stringify(current)}\n\n${directive}\nFor every multiple_choice question, keep the correctIndex field valid. Return ONLY the new JSON.`;
    let next: any;
    {
      const orKey = process.env.OPENROUTER_API_KEY!;
      const fetchCall2 = fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: { "Authorization": `Bearer ${orKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: AI_MODEL, max_tokens: 900,
          messages: [
            { role: "system", content: sysAdj },
            { role: "user", content: userAdj },
          ],
        }),
      }).then(async r => { if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(`${r.status} ${JSON.stringify(e)}`); } return r.json() as Promise<any>; });
      const data: any = await Promise.race([
        fetchCall2,
        new Promise<never>((_r, rej) => setTimeout(() => rej(new Error("openrouter hard-timeout 40000ms")), 40_000)),
      ]);
      let raw: string = data.choices[0].message.content.trim();
      if (raw.startsWith("```")) raw = raw.replace(/^```[a-z]*\n?/i, "").replace(/```\s*$/i, "").trim();
      next = JSON.parse(raw);
    }
    if (!next?.sections) throw new Error("bad shape");

    await db.prepare("UPDATE assignments SET content = ? WHERE id = ?")
      .run(JSON.stringify(next), req.params.id);

    // Log the adjustment
    await db.prepare(
      "INSERT INTO assignment_adjustments (id, assignment_id, teacher_id, direction, created_at) VALUES (?, ?, ?, ?, ?)"
    ).run(crypto.randomUUID(), req.params.id, req.user!.id, direction, new Date().toISOString()).catch(() => {});

    const updated = await db.prepare("SELECT * FROM assignments WHERE id = ?").get(req.params.id) as any;
    if (updated) updated.rubric = JSON.parse(updated.rubric || "[]");
    res.json({ ok: true, assignment: updated });
  } catch (e: any) {
    console.error("[adjust-difficulty]", e?.message);
    res.status(500).json({ error: "Adjust failed", detail: e?.message });
  }
});

// Regenerate fresh — completely new content, same grade/subject, different from
// current and recent history
// POST /assignments/:id/regenerate
router.post("/:id/regenerate", requireRole("teacher", "admin"), async (req: AuthRequest, res: Response) => {
  const client = await getAnthropic();
  if (!client) return res.status(503).json({ error: "AI features not configured. Add OPENROUTER_API_KEY." });

  const row = await db.prepare("SELECT * FROM assignments WHERE id = ?").get(req.params.id) as any;
  if (!row) return res.status(404).json({ error: "Not found" });

  const studentId = row.student_id || "class";
  const subject = row.target_subject || "reading";
  const gradeMin = row.target_grade_min != null ? Number(row.target_grade_min) : 3;
  const gradeMax = row.target_grade_max != null ? Number(row.target_grade_max) : gradeMin;
  const weekTheme = row.week_theme || undefined;
  const dateStr = row.scheduled_date || new Date().toISOString().slice(0, 10);

  // Pull current content so we can tell the model "make it different"
  let currentPrompts: string[] = [];
  try {
    const cur = row.content ? JSON.parse(row.content) : null;
    if (cur?.sections) {
      for (const s of cur.sections) for (const q of s.questions || []) if (q?.text) currentPrompts.push(q.text);
    }
  } catch {}

  let gen: { title: string; content: any };
  try {
    gen = await generateDailyAssignmentContent(client, {
      studentId, date: dateStr + "-regen-" + Date.now(),
      subject, gradeMin, gradeMax, weekTheme,
      recentPrompts: currentPrompts,
    });
  } catch (e: any) {
    return res.status(500).json({ error: "Regenerate failed", detail: e?.message });
  }

  await db.prepare("UPDATE assignments SET content = ?, title = COALESCE(title, ?) WHERE id = ?")
    .run(JSON.stringify(gen.content), gen.title, req.params.id);

  await db.prepare(
    "INSERT INTO assignment_adjustments (id, assignment_id, teacher_id, direction, created_at) VALUES (?, ?, ?, 'regenerate', ?)"
  ).run(crypto.randomUUID(), req.params.id, req.user!.id, new Date().toISOString()).catch(() => {});

  const updated = await db.prepare("SELECT * FROM assignments WHERE id = ?").get(req.params.id) as any;
  if (updated) updated.rubric = JSON.parse(updated.rubric || "[]");
  res.json({ ok: true, assignment: updated });
});

// Delete assignment. Teacher can delete their own; admin can delete any.
// Also cleans up submissions so we don't leave orphaned rows.
router.delete("/:id", requireRole("teacher", "admin"), async (req: AuthRequest, res: Response) => {
  // Verify existence + ownership
  const row = await db.prepare("SELECT id, teacher_id FROM assignments WHERE id = ?").get(req.params.id) as any;
  if (!row) return res.status(404).json({ error: "Not found" });
  if (req.user!.role !== 'admin' && row.teacher_id !== req.user!.id) {
    return res.status(403).json({ error: "Not your assignment to delete" });
  }
  try {
    await db.prepare("DELETE FROM submissions WHERE assignment_id = ?").run(req.params.id).catch(() => {});
    await db.prepare("DELETE FROM assignment_adjustments WHERE assignment_id = ?").run(req.params.id).catch(() => {});
    await db.prepare("DELETE FROM assignments WHERE id = ?").run(req.params.id);
    res.json({ deleted: true, id: req.params.id });
  } catch (e: any) {
    console.error('delete assignment error:', e);
    res.status(500).json({ error: 'Delete failed', detail: e?.message });
  }
});

// ── TPT free-URL import + PDF upload ─────────────────────────────────────────
// Scope: free resources only. Paid pages are refused at parse time.

const pdfUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 }, // 25MB cap
});

function slugify(s: string): string {
  return (s || "untitled")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "untitled";
}

async function saveAttachedPdf(assignmentId: string, filename: string, buf: Buffer): Promise<string> {
  const fileId = crypto.randomUUID();
  const b64 = buf.toString("base64");
  await db.prepare(
    `INSERT INTO assignment_files (id, assignment_id, filename, content_type, data_base64, created_at)
     VALUES (?, ?, ?, ?, ?, datetime('now'))`
  ).run(fileId, assignmentId, filename, "application/pdf", b64);
  return `/api/assignments/${assignmentId}/pdf`;
}

// (PDF-serving handler is registered directly on the app in app.ts so it
// can run without the Authorization-header requirement — iframes can't send
// headers. Assignment IDs are UUIDs, so they aren't practically enumerable.)

export async function servePdfAttachment(assignmentId: string, res: Response) {
  await ensureGradeCols();
  const row = await db.prepare(
    `SELECT f.* FROM assignment_files f WHERE f.assignment_id = ? ORDER BY f.created_at DESC LIMIT 1`
  ).get(assignmentId) as any;
  if (!row) return res.status(404).json({ error: "No PDF attached" });
  const buf = Buffer.from(row.data_base64, "base64");
  res.setHeader("Content-Type", row.content_type || "application/pdf");
  res.setHeader("Content-Disposition", `inline; filename="${row.filename || "assignment.pdf"}"`);
  res.setHeader("Cache-Control", "private, max-age=3600");
  res.send(buf);
}

// Parse a TPT product page. Returns title, description, gradeMin/Max, previewPdfUrl.
// TPT pages embed JSON-LD Product schema; we read that first, fall back to meta tags.
function parseTptPage(html: string): {
  title: string;
  description: string;
  gradeMin?: number;
  gradeMax?: number;
  previewPdfUrl?: string;
  priceDetected?: string | null;
} {
  const pick = (re: RegExp) => {
    const m = html.match(re);
    return m ? m[1].trim() : "";
  };

  // JSON-LD blocks
  const ldBlocks = [...html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)]
    .map(m => {
      try { return JSON.parse(m[1].trim()); } catch { return null; }
    })
    .filter(Boolean);

  let ldTitle = "", ldDesc = "", ldPrice: string | null = null;
  let gradeMin: number | undefined, gradeMax: number | undefined;
  for (const raw of ldBlocks) {
    const arr = Array.isArray(raw) ? raw : [raw];
    for (const node of arr) {
      if (node?.["@type"] === "Product" || node?.["@type"] === "CreativeWork") {
        if (node.name && !ldTitle) ldTitle = String(node.name);
        if (node.description && !ldDesc) ldDesc = String(node.description);
        const offers = node.offers;
        if (offers) {
          const price = Array.isArray(offers) ? offers[0]?.price : offers.price;
          if (price != null && Number(price) > 0) ldPrice = String(price);
        }
        if (node.typicalAgeRange) {
          const m = String(node.typicalAgeRange).match(/(\d+)[^\d]+(\d+)/);
          if (m) { gradeMin = Math.max(0, Number(m[1]) - 5); gradeMax = Math.max(0, Number(m[2]) - 5); }
        }
      }
    }
  }

  const title = ldTitle || pick(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i) || pick(/<title>([^<]+)<\/title>/i);
  const description = ldDesc || pick(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i) || pick(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i);

  // Grade inference from body text if not in structured data
  if (gradeMin == null) {
    const gradeMatch = html.match(/\b(?:Grade|Grades)[^\w]{1,3}(K|\d)(?:\s*-\s*(\d))?/i);
    if (gradeMatch) {
      const g1 = gradeMatch[1].toUpperCase() === "K" ? 0 : Number(gradeMatch[1]);
      const g2 = gradeMatch[2] ? Number(gradeMatch[2]) : g1;
      gradeMin = g1; gradeMax = g2;
    }
  }

  // Preview PDF — TPT hosts previews on ecdn.teacherspayteachers.com. Look
  // for PDF URLs in og:image fallbacks, data attributes, or script data.
  const pdfMatch = html.match(/(https?:\/\/[^\s"'<>]+?\.pdf(?:\?[^\s"'<>]*)?)/i);
  const previewPdfUrl = pdfMatch ? pdfMatch[1] : undefined;

  // Price signal: look for TPT price badge or ld+json offer price
  let priceDetected: string | null = ldPrice;
  if (!priceDetected) {
    const pm = html.match(/\$(\d+(?:\.\d{2})?)/);
    if (pm && Number(pm[1]) > 0) priceDetected = pm[1];
  }

  return { title, description, gradeMin, gradeMax, previewPdfUrl, priceDetected };
}

router.post("/import-tpt", requireRole("teacher", "admin"), async (req: AuthRequest, res: Response) => {
  await ensureGradeCols();
  const { url, classId } = req.body || {};
  if (!url || typeof url !== "string") return res.status(400).json({ error: "Missing url" });
  if (!/^https?:\/\/(www\.)?teacherspayteachers\.com\//i.test(url)) {
    return res.status(400).json({ error: "Only teacherspayteachers.com URLs are accepted" });
  }

  let html: string;
  try {
    const r = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5",
      },
      redirect: "follow",
    });
    if (r.status === 403 || r.status === 503) {
      return res.status(502).json({ error: "TPT is blocking our fetch — download the PDF yourself and use Upload PDF instead." });
    }
    if (!r.ok) return res.status(502).json({ error: `TPT fetch failed (${r.status})` });
    html = await r.text();
  } catch (e: any) {
    return res.status(502).json({ error: "TPT fetch failed", detail: e?.message });
  }

  const meta = parseTptPage(html);
  if (meta.priceDetected) {
    return res.status(402).json({
      error: `This is paid content ($${meta.priceDetected}). Purchase it on TPT, download the PDF, then use Upload PDF here.`,
      title: meta.title,
      price: meta.priceDetected,
    });
  }
  if (!meta.title) {
    return res.status(422).json({ error: "Could not parse title from page — not a TPT product page?" });
  }

  // Create the draft assignment first so we have an id for the PDF record
  const id = crypto.randomUUID();
  const tMin = meta.gradeMin ?? null;
  const tMax = meta.gradeMax ?? meta.gradeMin ?? null;
  await db.prepare(
    `INSERT INTO assignments (
       id, class_id, teacher_id, title, description, due_date, rubric,
       starter_project_id, content, scheduled_date,
       target_grade_min, target_grade_max, target_subject,
       source, source_url
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id, classId || null, req.user!.id, meta.title, meta.description || "", null,
    JSON.stringify([]), null, null, null,
    tMin, tMax, null,
    "tpt", url,
  );

  // Try to download preview PDF. If it fails or is absent, we still return
  // the draft — the teacher can upload the PDF manually after purchase.
  let pdfWarning: string | null = null;
  let attached_pdf_path: string | null = null;
  if (meta.previewPdfUrl) {
    try {
      const pr = await fetch(meta.previewPdfUrl, {
        headers: { "User-Agent": "Mozilla/5.0" },
        redirect: "follow",
      });
      if (pr.ok) {
        const ab = await pr.arrayBuffer();
        const buf = Buffer.from(ab);
        // Magic bytes: %PDF (0x25504446)
        if (buf.slice(0, 4).toString("ascii") !== "%PDF") {
          pdfWarning = "preview file is not a PDF (magic-byte check failed)";
        } else {
          attached_pdf_path = await saveAttachedPdf(id, `${slugify(meta.title)}-${id}.pdf`, buf);
          await db.prepare("UPDATE assignments SET attached_pdf_path = ? WHERE id = ?").run(attached_pdf_path, id);
        }
      } else {
        pdfWarning = `preview PDF fetch failed (${pr.status})`;
      }
    } catch (e: any) {
      pdfWarning = "preview PDF fetch errored: " + (e?.message || "unknown");
    }
  } else {
    pdfWarning = "no preview PDF link found on the page";
  }

  return res.json({
    id,
    title: meta.title,
    description: meta.description,
    target_grade_min: tMin,
    target_grade_max: tMax,
    source: "tpt",
    source_url: url,
    attached_pdf_path,
    pdfWarning,
  });
});

router.post("/upload-pdf", requireRole("teacher", "admin"), pdfUpload.single("file"), async (req: AuthRequest, res: Response) => {
  try {
    await ensureGradeCols();
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });
    const buf = req.file.buffer;
    if (req.file.mimetype !== "application/pdf") {
      return res.status(400).json({ error: "Only PDF files accepted (content-type mismatch)" });
    }
    if (buf.length < 4 || buf.slice(0, 4).toString("ascii") !== "%PDF") {
      return res.status(400).json({ error: "Not a valid PDF (magic-byte check failed)" });
    }

    const { classId, title, description, targetGradeMin, targetGradeMax, targetSubject } = req.body || {};
    const id = crypto.randomUUID();
    const finalTitle = (title && String(title).trim()) || req.file.originalname.replace(/\.pdf$/i, "") || "Uploaded assignment";
    const tMin = targetGradeMin != null && targetGradeMin !== "" ? Number(targetGradeMin) : null;
    const tMax = targetGradeMax != null && targetGradeMax !== "" ? Number(targetGradeMax) : tMin;

    await db.prepare(
      `INSERT INTO assignments (
         id, class_id, teacher_id, title, description, due_date, rubric,
         starter_project_id, content, scheduled_date,
         target_grade_min, target_grade_max, target_subject,
         source
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id, classId || null, req.user!.id, finalTitle, description || "", null,
      JSON.stringify([]), null, null, null,
      tMin, tMax, targetSubject || null,
      "manual",
    );

    const attached_pdf_path = await saveAttachedPdf(id, req.file.originalname || `${slugify(finalTitle)}-${id}.pdf`, buf);
    await db.prepare("UPDATE assignments SET attached_pdf_path = ? WHERE id = ?").run(attached_pdf_path, id);

    return res.json({
      id,
      title: finalTitle,
      source: "manual",
      attached_pdf_path,
      bytes: buf.length,
    });
  } catch (e: any) {
    console.error("[upload-pdf]", e?.message || e);
    return res.status(500).json({ error: e?.message || "Failed to upload PDF" });
  }
});

// ── PDF → structured-assignment JSON via Claude ───────────────────────────────
// Takes a fileId (which is the assignment_id returned by /upload-pdf since
// `saveAttachedPdf` stores rows keyed by assignment_id), pulls the base64 PDF
// out of assignment_files, and asks Claude to extract it into the editor's
// expected shape: { title, subject, grade, instructions, sections[] }.
router.post("/parse-pdf", requireRole("teacher", "admin"), async (req: AuthRequest, res: Response) => {
  await ensureGradeCols();
  const { fileId } = req.body || {};
  if (!fileId || typeof fileId !== "string") {
    return res.status(400).json({ error: "fileId is required" });
  }

  // Load the most recent PDF attached to this assignment. We look up by
  // assignment_id first (matches /upload-pdf's return shape) and fall back to
  // the assignment_files primary key so either id works.
  let row: any = null;
  try {
    row = await db.prepare(
      `SELECT * FROM assignment_files WHERE assignment_id = ? ORDER BY created_at DESC LIMIT 1`
    ).get(fileId);
    if (!row) {
      row = await db.prepare(`SELECT * FROM assignment_files WHERE id = ?`).get(fileId);
    }
  } catch (e: any) {
    return res.status(500).json({ error: "DB lookup failed: " + (e?.message || "unknown") });
  }
  if (!row || !row.data_base64) {
    return res.status(404).json({ error: "PDF not found for that fileId" });
  }

  const orKeyPdf = process.env.OPENROUTER_API_KEY;
  if (!orKeyPdf) {
    return res.status(500).json({ error: "OPENROUTER_API_KEY not configured on the server" });
  }

  try {
    const pdfRes = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: { "Authorization": `Bearer ${orKeyPdf}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "anthropic/claude-sonnet-4-5",
        max_tokens: 4096,
        messages: [{
          role: "user",
          content: [
            { type: "text", text: "Here is a base64-encoded PDF worksheet. Extract its content into a JSON assignment." },
            { type: "image_url", image_url: { url: `data:application/pdf;base64,${row.data_base64}` } },
            { type: "text", text: `Return ONLY valid JSON in this exact shape:
{"title":"string","subject":"math|reading|writing|science|social_studies|spelling","grade":"Kindergarten|1st Grade|2nd Grade|3rd Grade|4th Grade|5th Grade","instructions":"string","sections":[{"title":"Section name","questions":[{"type":"multiple_choice|short_answer|fill_blank","text":"Question text","options":["A","B","C","D"],"correctIndex":0,"points":1}]}]}
Only include "options" and "correctIndex" for multiple_choice questions.` },
          ],
        }],
      }),
    });
    if (!pdfRes.ok) {
      const err = await pdfRes.json().catch(() => ({}));
      return res.status(500).json({ error: `OpenRouter error ${pdfRes.status}`, detail: JSON.stringify(err) });
    }
    const pdfData: any = await pdfRes.json();
    const raw = (pdfData.choices?.[0]?.message?.content || "").trim();
    if (!raw) return res.status(500).json({ error: "AI returned no text" });

    // Tolerate ```json fences even though we asked for plain JSON.
    const cleaned = raw
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```\s*$/i, "")
      .trim();

    let parsed: any;
    try {
      parsed = JSON.parse(cleaned);
    } catch (e: any) {
      return res.status(500).json({ error: "Claude response was not valid JSON: " + (e?.message || "parse error") });
    }

    return res.json(parsed);
  } catch (e: any) {
    console.error("[parse-pdf]", e?.message || e);
    return res.status(500).json({ error: e?.message || "Claude request failed" });
  }
});

// ── Auto-by-grade: create one assignment per grade tier present in the class ──
// POST /assignments/class/:classId/create-by-grade
// Body: { title, subject, instructions, passage }
// For each distinct grade level found in user_grade_levels for the class,
// calls Mistral (or fallback AI) to generate grade-appropriate content and
// inserts one assignment with target_grade_min = target_grade_max = grade_level.
router.post("/class/:classId/create-by-grade", async (req: AuthRequest, res: Response) => {
  if (req.user!.role === "student") return res.status(403).json({ error: "Forbidden" });
  const { classId } = req.params;
  const { title, subject, instructions, passage } = req.body;
  if (!title || !classId) return res.status(400).json({ error: "title and classId are required" });

  const subjectCol =
    subject === "math" ? "ugl.math_grade" :
    subject === "writing" ? "ugl.writing_grade" :
    "ugl.reading_grade";

  await ensureGradeCols();

  // Distinct grade levels present in this class for the chosen subject
  let gradeRows: any[] = [];
  try {
    gradeRows = await db.prepare(`
      SELECT DISTINCT ${subjectCol} AS grade_level
      FROM user_grade_levels ugl
      JOIN class_members cm ON cm.user_id = ugl.user_id
      WHERE cm.class_id = ?
        AND ${subjectCol} IS NOT NULL
      ORDER BY grade_level
    `).all(classId);
  } catch (e: any) {
    return res.status(500).json({ error: "Could not query grade levels: " + (e?.message || String(e)) });
  }

  if (gradeRows.length === 0) {
    return res.status(422).json({ error: "No grade-level data found for students in this class. Set grade levels first." });
  }

  const MISTRAL_KEY = process.env.MISTRAL_API_KEY;
  const gradeNames: Record<number, string> = {
    0: "Kindergarten", 1: "1st Grade", 2: "2nd Grade", 3: "3rd Grade",
    4: "4th Grade", 5: "5th Grade", 6: "6th Grade", 7: "7th Grade",
    8: "8th Grade", 9: "9th Grade", 10: "10th Grade", 11: "11th Grade", 12: "12th Grade",
  };

  const created: any[] = [];

  for (const row of gradeRows) {
    const gradeLevel = Number(row.grade_level);
    const gradeName = gradeNames[gradeLevel] ?? `${gradeLevel}th Grade`;

    // Build the same prompt as generate-assignment but with this grade
    const subjectCapitalized = (subject || "reading").charAt(0).toUpperCase() + (subject || "reading").slice(1);
    const safePassage = passage ? passage.replace(/\r/g, "").trim() : "";
    const passageInstruction = safePassage
      ? `USE THIS PASSAGE exactly as written:\n---\n${safePassage}\n---\nAll reading/comprehension questions must refer to this passage. Put this passage verbatim in the "passage" field of the first section.`
      : subject === "reading" || subject === "Reading"
      ? `GENERATE a short age-appropriate reading passage (5-8 sentences) and include it as the "passage" field in the first section. All comprehension questions must refer to it.`
      : "";

    const subjectGuide =
      (subject === "math" || subject === "Math")
        ? `This is a MATH worksheet. Include real math problems with numbers, word problems, and fill-in equations. No reading comprehension questions.`
        : (subject === "reading" || subject === "Reading")
        ? `This is a READING / ELA worksheet. You MUST:
- Write a short reading passage (5-8 sentences) and put it in the "passage" field of the FIRST section
- All comprehension questions must refer to that passage
- Include vocabulary, main idea, inference, and short-answer evidence questions
- No math questions`
        : (subject === "writing" || subject === "Writing")
        ? `This is a WRITING / GRAMMAR worksheet. Include grammar correction, punctuation, sentence structure, and short writing tasks.`
        : `Create questions appropriate for a ${subjectCapitalized} worksheet at ${gradeName} level.`;

    const prompt = `You are an experienced elementary school teacher creating a printable paper worksheet.

Grade Level: ${gradeName}
Subject: ${subjectCapitalized}
Worksheet Title: ${title}
${instructions ? `Teacher's special instructions: ${instructions}` : ""}

${subjectGuide}

${passageInstruction}

Create a thorough, realistic worksheet with 2-3 sections and 8-12 total questions appropriate for ${gradeName} level.
Mix question types: multiple_choice, short_answer, fill_blank.

CRITICAL RULES:
1. Every multiple_choice question MUST have a "correctIndex" (0-based).
2. For reading assignments: the "passage" field in the first section is REQUIRED — write the full passage text there.

IMPORTANT: Return ONLY valid JSON, no markdown, no code fences — just the JSON object:
{
  "title": "string",
  "subject": "string",
  "grade": "string",
  "instructions": "string",
  "totalPoints": number,
  "sections": [
    {
      "title": "Part 1: Section Name (X pts each)",
      "passage": "FOR READING: the full 5-8 sentence passage goes here. For other subjects omit this field.",
      "questions": [
        { "type": "multiple_choice", "text": "Question?", "options": ["A. opt1","B. opt2","C. opt3","D. opt4"], "correctIndex": 0, "points": 5 },
        { "type": "short_answer", "text": "Question?", "points": 10, "lines": 3 },
        { "type": "fill_blank", "text": "The ___ is important.", "points": 5 }
      ]
    }
  ]
}`;

    let generatedContent: any = null;

    try {
      if (MISTRAL_KEY) {
        const response = await fetch("https://api.mistral.ai/v1/chat/completions", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${MISTRAL_KEY}` },
          body: JSON.stringify({ model: "mistral-small-latest", max_tokens: 6000, messages: [{ role: "user", content: prompt }] }),
        });
        if (!response.ok) throw new Error(`Mistral error: ${response.status} ${await response.text()}`);
        const data: any = await response.json();
        const text = data.choices?.[0]?.message?.content || "";
        const match = text.match(/\{[\s\S]*\}/);
        if (match) generatedContent = JSON.parse(match[0]);
      }
    } catch (aiErr: any) {
      console.error(`[create-by-grade] AI error for grade ${gradeLevel}:`, aiErr?.message);
      // Continue without generated content — use title/instructions as-is
    }

    // Insert one assignment for this grade level
    const id = crypto.randomUUID();
    const today = new Date().toISOString().slice(0, 10);
    const contentStr = generatedContent ? JSON.stringify(generatedContent) : null;
    const desc = generatedContent
      ? `[Generated] ${generatedContent.instructions || instructions || ""}\n\nSections: ${(generatedContent.sections || []).map((s: any) => s.title).join(", ")}`
      : (instructions || "");
    const rubric = generatedContent
      ? (generatedContent.sections || []).flatMap((s: any) =>
          (s.questions || []).map((q: any) => ({ label: (q.text || "").slice(0, 60), maxPoints: q.points || 10 }))
        )
      : [{ label: "Correctness", maxPoints: 50 }, { label: "Creativity", maxPoints: 50 }];

    try {
      await db.prepare(
        `INSERT INTO assignments (
          id, class_id, teacher_id, title, description, due_date, rubric,
          starter_project_id, content, scheduled_date,
          target_grade_min, target_grade_max, target_subject,
          teacher_notes, question_count, estimated_minutes,
          focus_keywords, learning_objective, hints_allowed, question_type,
          target_student_ids, is_group, group_name, video_url
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        id, classId, req.user!.id,
        `${title} (${gradeName})`,
        desc,
        null,
        JSON.stringify(rubric),
        null, contentStr, today,
        gradeLevel, gradeLevel, subject || "reading",
        null, null, null, null, null, 1, null, null, 0, null, null,
      );
      const row = await db.prepare("SELECT * FROM assignments WHERE id = ?").get(id) as any;
      if (row) {
        row.rubric = JSON.parse(row.rubric || "[]");
        created.push(row);
      }
    } catch (insertErr: any) {
      console.error(`[create-by-grade] insert error grade ${gradeLevel}:`, insertErr?.message);
    }
  }

  res.json({ created: created.length, assignments: created });
});

// Pre-made assignment content keyed by subject → grade
const PREMADE: Record<string, Record<number, { title: string; description: string; content: any }>> = {
  reading: {
    1: { title: "1st Grade Reading: Simple Words", description: "Read simple sight words and answer questions.", content: { title: "Simple Words", subject: "Reading", grade: "1st Grade", instructions: "Read each question carefully and choose the best answer.", totalPoints: 30, sections: [{ title: "Sight Word Practice", questions: [{ type: "multiple_choice", text: "Which word names a furry pet that says 'meow'?", options: ["A. dog", "B. cat", "C. bird", "D. fish"], correctIndex: 1, points: 6 }, { type: "multiple_choice", text: "Which word names a fruit that is red and grows on trees?", options: ["A. orange", "B. apple", "C. banana", "D. grape"], correctIndex: 1, points: 6 }, { type: "multiple_choice", text: "Which word names the color of fire trucks and stop signs?", options: ["A. blue", "B. green", "C. red", "D. yellow"], correctIndex: 2, points: 6 }, { type: "multiple_choice", text: "Which animal is the smallest?", options: ["A. elephant", "B. whale", "C. ant", "D. giraffe"], correctIndex: 2, points: 6 }, { type: "short_answer", text: "What color is the sun?", correctAnswer: "yellow or gold", points: 6 }] }] } },
    2: { title: "2nd Grade Reading: CVC Words", description: "Read consonant-vowel-consonant words.", content: { title: "CVC Words", subject: "Reading", grade: "2nd Grade", instructions: "Read each CVC word and answer the question.", totalPoints: 40, sections: [{ title: "CVC Word Reading", questions: [{ type: "multiple_choice", text: "What does 'cat' rhyme with?", options: ["A. dog", "B. bat", "C. tree", "D. run"], correctIndex: 1, points: 8 }, { type: "multiple_choice", text: "What is a 'hat'?", options: ["A. you wear on your foot", "B. you wear on your head", "C. you sit on", "D. you eat"], correctIndex: 1, points: 8 }, { type: "fill_blank", text: "A 'pot' is something you use to ___.", correctAnswer: "cook", points: 8 }, { type: "fill_blank", text: "When you 'run' you are moving ___.", correctAnswer: "fast or quickly", points: 8 }, { type: "short_answer", text: "What does 'sit' mean?", correctAnswer: "to be in a chair or down", points: 8 }] }] } },
    3: { title: "3rd Grade Reading: Short Stories", description: "Read and comprehend a short story.", content: { title: "Short Story: Max's Adventure", subject: "Reading", grade: "3rd Grade", instructions: "Read the story and answer the questions.", totalPoints: 50, sections: [{ title: "Story Comprehension", questions: [{ type: "multiple_choice", text: "Who is the main character in the story?", options: ["A. Sarah", "B. Max", "C. Tom", "D. Lisa"], correctIndex: 1, points: 10 }, { type: "multiple_choice", text: "What does Max find in the forest?", options: ["A. a key", "B. a map", "C. a treasure", "D. a friend"], correctIndex: 1, points: 10 }, { type: "fill_blank", text: "Max was _____ when he found something interesting.", correctAnswer: "excited or happy", points: 10 }, { type: "short_answer", text: "What did Max do after finding the treasure?", correctAnswer: "shared it or brought it home", points: 10 }, { type: "short_answer", text: "What is the lesson of this story?", correctAnswer: "adventure or exploration or curiosity", points: 10 }] }] } },
    5: { title: "5th Grade Reading: Complex Passage", description: "Read and analyze a complex narrative.", content: { title: "Complex Passage: The Island Mystery", subject: "Reading", grade: "5th Grade", instructions: "Read the passage carefully. Answer the questions based on details from the text.", totalPoints: 60, sections: [{ title: "Reading Comprehension & Analysis", questions: [{ type: "multiple_choice", text: "What was the narrator's primary motivation for exploring the island?", options: ["A. to find treasure", "B. to discover an ancient civilization", "C. curiosity and adventure", "D. to escape from society"], correctIndex: 2, points: 12 }, { type: "multiple_choice", text: "How did the environment of the island affect the story?", options: ["A. it had no effect", "B. it created challenges and mysteries", "C. it was purely decorative", "D. it was hostile"], correctIndex: 1, points: 12 }, { type: "fill_blank", text: "The ancient structures suggested that the island was once _____ by a civilization.", correctAnswer: "inhabited or occupied", points: 12 }, { type: "short_answer", text: "What is the author's tone in describing the discovery?", correctAnswer: "curious, thoughtful, or reverent", points: 12 }, { type: "short_answer", text: "What does this story suggest about human curiosity and exploration?", correctAnswer: "it drives discovery or it reveals history", points: 12 }] }] } },
  },
  math: {
    1: { title: "1st Grade Math: Counting", description: "Count objects and solve simple addition.", content: { title: "Counting and Simple Addition", subject: "Math", grade: "1st Grade", instructions: "Count the objects and answer the questions.", totalPoints: 40, sections: [{ title: "Counting Practice", questions: [{ type: "multiple_choice", text: "If you have 2 apples and I give you 1 more, how many do you have?", options: ["A. 1", "B. 2", "C. 3", "D. 4"], correctIndex: 2, points: 8 }, { type: "multiple_choice", text: "Count: 1, 2, ___, 4, 5. What comes next?", options: ["A. 1", "B. 2", "C. 3", "D. 6"], correctIndex: 2, points: 8 }, { type: "fill_blank", text: "If you have 3 toys and lose 1, you have ___ toys left.", correctAnswer: "2", points: 8 }, { type: "multiple_choice", text: "1 + 2 = ?", options: ["A. 1", "B. 2", "C. 3", "D. 4"], correctIndex: 2, points: 8 }, { type: "short_answer", text: "If you have 2 cats and 1 dog, how many pets do you have?", correctAnswer: "3", points: 8 }] }] } },
    2: { title: "2nd Grade Math: Add and Subtract", description: "Addition and subtraction within 20.", content: { title: "Addition and Subtraction", subject: "Math", grade: "2nd Grade", instructions: "Solve the problems.", totalPoints: 50, sections: [{ title: "Add and Subtract", questions: [{ type: "multiple_choice", text: "5 + 3 = ?", options: ["A. 6", "B. 7", "C. 8", "D. 9"], correctIndex: 2, points: 10 }, { type: "multiple_choice", text: "10 - 4 = ?", options: ["A. 5", "B. 6", "C. 7", "D. 8"], correctIndex: 1, points: 10 }, { type: "fill_blank", text: "7 + ___ = 12", correctAnswer: "5", points: 10 }, { type: "fill_blank", text: "15 - ___ = 9", correctAnswer: "6", points: 10 }, { type: "short_answer", text: "Tom has 8 marbles. He wins 3 more. How many does he have now?", correctAnswer: "11", points: 10 }] }] } },
    3: { title: "3rd Grade Math: Multiplication Intro", description: "Introduction to multiplication concepts.", content: { title: "Multiplication Introduction", subject: "Math", grade: "3rd Grade", instructions: "Use repeated addition to understand multiplication.", totalPoints: 50, sections: [{ title: "Multiplication as Repeated Addition", questions: [{ type: "multiple_choice", text: "3 groups of 2 equals: 2 + 2 + 2 = ?", options: ["A. 5", "B. 6", "C. 7", "D. 8"], correctIndex: 1, points: 10 }, { type: "multiple_choice", text: "4 × 5 = ?", options: ["A. 15", "B. 18", "C. 20", "D. 24"], correctIndex: 2, points: 10 }, { type: "fill_blank", text: "2 × 7 = ___", correctAnswer: "14", points: 10 }, { type: "fill_blank", text: "6 × 3 = ___", correctAnswer: "18", points: 10 }, { type: "short_answer", text: "If you have 4 bags with 3 apples each, how many apples total?", correctAnswer: "12", points: 10 }] }] } },
    4: { title: "4th Grade Math: Multi-Digit Multiplication", description: "Multiply two and three-digit numbers.", content: { title: "Multi-Digit Multiplication", subject: "Math", grade: "4th Grade", instructions: "Multiply larger numbers.", totalPoints: 50, sections: [{ title: "Multiplication Practice", questions: [{ type: "multiple_choice", text: "12 × 5 = ?", options: ["A. 50", "B. 55", "C. 60", "D. 65"], correctIndex: 2, points: 10 }, { type: "multiple_choice", text: "23 × 4 = ?", options: ["A. 88", "B. 90", "C. 92", "D. 96"], correctIndex: 3, points: 10 }, { type: "fill_blank", text: "15 × 3 = ___", correctAnswer: "45", points: 10 }, { type: "fill_blank", text: "11 × 8 = ___", correctAnswer: "88", points: 10 }, { type: "short_answer", text: "A bookstore has 13 shelves with 6 books each. How many books total?", correctAnswer: "78", points: 10 }] }] } },
    5: { title: "5th Grade Math: Decimals & Fractions", description: "Operations with decimals and fractions.", content: { title: "Decimals and Fractions", subject: "Math", grade: "5th Grade", instructions: "Work with decimals and fractions.", totalPoints: 50, sections: [{ title: "Decimal and Fraction Operations", questions: [{ type: "multiple_choice", text: "0.5 + 0.25 = ?", options: ["A. 0.7", "B. 0.75", "C. 0.8", "D. 0.9"], correctIndex: 1, points: 10 }, { type: "multiple_choice", text: "1/2 + 1/4 = ?", options: ["A. 1/6", "B. 2/6", "C. 3/4", "D. 3/8"], correctIndex: 2, points: 10 }, { type: "fill_blank", text: "2.5 × 4 = ___", correctAnswer: "10", points: 10 }, { type: "fill_blank", text: "3/4 ÷ 1/2 = ___", correctAnswer: "1.5 or 3/2", points: 10 }, { type: "short_answer", text: "A recipe calls for 2.5 cups of flour. If you double it, how much flour do you need?", correctAnswer: "5", points: 10 }] }] } },
  },
  writing: {
    0: { title: "Kindergarten Writing: Trace and Copy", description: "Trace letters and simple words.", content: { title: "Trace and Copy Letters", subject: "Writing", grade: "Kindergarten", instructions: "Copy simple letters and words.", totalPoints: 25, sections: [{ title: "Letter and Word Writing", questions: [{ type: "short_answer", text: "Copy the letter 'A':", lines: 2, points: 5 }, { type: "short_answer", text: "Copy the word 'cat':", lines: 2, points: 5 }, { type: "short_answer", text: "Copy the word 'dog':", lines: 2, points: 5 }, { type: "short_answer", text: "Write the first letter of your name:", lines: 2, points: 5 }, { type: "short_answer", text: "Draw and write about your favorite animal:", lines: 3, points: 5 }] }] } },
    1: { title: "1st Grade Writing: Simple Sentences", description: "Write simple sentences with a subject and verb.", content: { title: "Write Simple Sentences", subject: "Writing", grade: "1st Grade", instructions: "Write a sentence about each topic using simple words.", totalPoints: 30, sections: [{ title: "Sentence Writing", questions: [{ type: "short_answer", text: "Write a sentence about your pet or a pet you'd like.", lines: 2, points: 10 }, { type: "short_answer", text: "Write a sentence about what you like to eat.", lines: 2, points: 10 }, { type: "short_answer", text: "Write a sentence about something you can do at recess.", lines: 2, points: 10 }] }] } },
    2: { title: "2nd Grade Writing: Sentence Writing", description: "Write complete sentences.", content: { title: "Write Simple Sentences", subject: "Writing", grade: "2nd Grade", instructions: "Write complete sentences with a subject and verb.", totalPoints: 40, sections: [{ title: "Sentence Writing", questions: [{ type: "short_answer", text: "Write a sentence about your favorite food.", lines: 3, points: 10 }, { type: "short_answer", text: "Write a sentence about what you did today.", lines: 3, points: 10 }, { type: "short_answer", text: "Write a question about animals.", lines: 3, points: 10 }, { type: "short_answer", text: "Write a sentence about the weather.", lines: 3, points: 10 }] }] } },
    3: { title: "3rd Grade Writing: Narrative Paragraph", description: "Write a paragraph about an experience.", content: { title: "Write a Narrative Paragraph", subject: "Writing", grade: "3rd Grade", instructions: "Write a paragraph (4-5 sentences) about something that happened to you.", totalPoints: 50, sections: [{ title: "Narrative Writing", questions: [{ type: "short_answer", text: "Write about a time you had fun with a friend. Include what you did, where you were, and how it made you feel.", lines: 6, points: 50 }] }] } },
    4: { title: "4th Grade Writing: Informational Paragraph", description: "Write an informational paragraph about a topic.", content: { title: "Write an Informational Paragraph", subject: "Writing", grade: "4th Grade", instructions: "Write a paragraph (5-6 sentences) about a topic you know well. Include a topic sentence, details, and a closing sentence.", totalPoints: 50, sections: [{ title: "Informational Writing", questions: [{ type: "short_answer", text: "Write about an animal, sport, or hobby you know a lot about. Start with a topic sentence, give 3 facts, and end with a closing sentence.", lines: 7, points: 50 }] }] } },
    5: { title: "5th Grade Writing: Opinion Essay", description: "Write an opinion with supporting reasons.", content: { title: "Write an Opinion Essay", subject: "Writing", grade: "5th Grade", instructions: "Write a paragraph expressing your opinion with 2-3 reasons and examples.", totalPoints: 60, sections: [{ title: "Opinion Writing", questions: [{ type: "short_answer", text: "What is your favorite season? Write why you like it. Include at least 2-3 reasons with examples.", lines: 8, points: 60 }] }] } },
  },
  spelling: {
    0: { title: "Kindergarten Spelling: Basic Words", description: "Spell simple 3-letter words.", content: { title: "Kindergarten Spelling", subject: "Spelling", grade: "Kindergarten", instructions: "Fill in the missing letter for each word.", totalPoints: 25, sections: [{ title: "Spell the Word", questions: [{ type: "fill_blank", text: "c_t (a furry pet)", correctAnswer: "a", points: 5 }, { type: "fill_blank", text: "d_g (a barking pet)", correctAnswer: "o", points: 5 }, { type: "fill_blank", text: "s_n (shines in the sky)", correctAnswer: "u", points: 5 }, { type: "fill_blank", text: "r_d (a color)", correctAnswer: "e", points: 5 }, { type: "short_answer", text: "Spell the word for a thing you sit on:", correctAnswer: "chair", points: 5 }] }] } },
    1: { title: "1st Grade Spelling: Short Vowel Words", description: "Spell short vowel CVC words.", content: { title: "1st Grade Spelling", subject: "Spelling", grade: "1st Grade", instructions: "Spell the word that matches each clue.", totalPoints: 30, sections: [{ title: "Short Vowel Spelling", questions: [{ type: "short_answer", text: "Spell the word: a small insect that stings (b_g)", correctAnswer: "bug", points: 6 }, { type: "short_answer", text: "Spell the word: you wear it on your head (h_t)", correctAnswer: "hat", points: 6 }, { type: "short_answer", text: "Spell the word: opposite of hot (c_ld)", correctAnswer: "cold", points: 6 }, { type: "short_answer", text: "Spell the word: a number after 9 (t_n)", correctAnswer: "ten", points: 6 }, { type: "short_answer", text: "Spell the word: you sleep in it (b_d)", correctAnswer: "bed", points: 6 }] }] } },
    2: { title: "2nd Grade Spelling: Sight Words", description: "Spell common sight words correctly.", content: { title: "2nd Grade Spelling", subject: "Spelling", grade: "2nd Grade", instructions: "Choose the correct spelling for each word.", totalPoints: 40, sections: [{ title: "Sight Word Spelling", questions: [{ type: "multiple_choice", text: "Which is spelled correctly?", options: ["A. becaus", "B. because", "C. becuase", "D. becawse"], correctIndex: 1, points: 8 }, { type: "multiple_choice", text: "Which is spelled correctly?", options: ["A. frend", "B. freind", "C. friend", "D. friand"], correctIndex: 2, points: 8 }, { type: "multiple_choice", text: "Which is spelled correctly?", options: ["A. peple", "B. peeple", "C. pepole", "D. people"], correctIndex: 3, points: 8 }, { type: "short_answer", text: "Spell the word that means 'a lot': m_ny", correctAnswer: "many", points: 8 }, { type: "short_answer", text: "Spell the opposite of 'come': g_", correctAnswer: "go", points: 8 }] }] } },
    3: { title: "3rd Grade Spelling: Long Vowel Words", description: "Spell words with long vowel sounds.", content: { title: "3rd Grade Spelling", subject: "Spelling", grade: "3rd Grade", instructions: "Spell these long vowel words correctly.", totalPoints: 50, sections: [{ title: "Long Vowel Spelling", questions: [{ type: "multiple_choice", text: "Which is spelled correctly?", options: ["A. straet", "B. streat", "C. street", "D. streeat"], correctIndex: 2, points: 10 }, { type: "multiple_choice", text: "Which is spelled correctly?", options: ["A. trane", "B. train", "C. trayn", "D. trean"], correctIndex: 1, points: 10 }, { type: "short_answer", text: "Spell the word: a thing you dream of achieving (g__l)", correctAnswer: "goal", points: 10 }, { type: "short_answer", text: "Spell the word: a large body of water (o___n)", correctAnswer: "ocean", points: 10 }, { type: "short_answer", text: "Spell the word: opposite of night (d__)", correctAnswer: "day", points: 10 }] }] } },
    4: { title: "4th Grade Spelling: Prefixes & Suffixes", description: "Spell words with common prefixes and suffixes.", content: { title: "4th Grade Spelling", subject: "Spelling", grade: "4th Grade", instructions: "Add the correct prefix or suffix and spell the new word.", totalPoints: 50, sections: [{ title: "Prefix & Suffix Spelling", questions: [{ type: "short_answer", text: "Add 'un-' to 'happy'. Spell the new word:", correctAnswer: "unhappy", points: 10 }, { type: "short_answer", text: "Add '-ful' to 'care'. Spell the new word:", correctAnswer: "careful", points: 10 }, { type: "short_answer", text: "Add 're-' to 'write'. Spell the new word:", correctAnswer: "rewrite", points: 10 }, { type: "multiple_choice", text: "Which word uses the prefix 'mis-' correctly?", options: ["A. misread", "B. misless", "C. misrun", "D. miswalk"], correctIndex: 0, points: 10 }, { type: "short_answer", text: "Add '-less' to 'hope'. Spell the new word:", correctAnswer: "hopeless", points: 10 }] }] } },
    5: { title: "5th Grade Spelling: Academic Vocabulary", description: "Spell grade-level academic vocabulary words.", content: { title: "5th Grade Spelling", subject: "Spelling", grade: "5th Grade", instructions: "Spell these academic vocabulary words correctly.", totalPoints: 50, sections: [{ title: "Academic Vocabulary Spelling", questions: [{ type: "multiple_choice", text: "Which is spelled correctly?", options: ["A. comunnity", "B. comunity", "C. community", "D. commmunity"], correctIndex: 2, points: 10 }, { type: "multiple_choice", text: "Which is spelled correctly?", options: ["A. explaination", "B. explanation", "C. explanaton", "D. explanasion"], correctIndex: 1, points: 10 }, { type: "short_answer", text: "Spell the word that means 'to look at carefully': obs___ve", correctAnswer: "observe", points: 10 }, { type: "short_answer", text: "Spell the word that means 'a conclusion based on evidence': inf___ence", correctAnswer: "inference", points: 10 }, { type: "short_answer", text: "Spell the word that means 'to show or display': dem___strate", correctAnswer: "demonstrate", points: 10 }] }] } },
  },
};

const SEL_CONTENT = {
  title: "Growth Mindset: Learning from Challenges",
  description: "Watch a video about growth mindset and reflect on learning.",
  content: { title: "Growth Mindset: Learning from Challenges", subject: "Social-Emotional Learning", grade: "All Grades", instructions: "Watch the video about growth mindset. Then answer the reflection questions.", totalPoints: 40, video_url: "https://www.youtube.com/watch?v=2zrtHt3bBmQ", sections: [{ title: "Growth Mindset Reflection", questions: [{ type: "multiple_choice", text: "What is a growth mindset?", options: ["A. Believing you can't change", "B. Believing you can learn and grow with effort", "C. Giving up when something is hard", "D. Being afraid of mistakes"], correctIndex: 1, points: 10 }, { type: "short_answer", text: "Describe a time when you faced a challenge and learned from it.", lines: 4, points: 15 }, { type: "short_answer", text: "What's one thing you want to get better at? How will you use a growth mindset to help?", lines: 4, points: 15 }] }] },
};

// POST /assignments/class/:classId/generate-today
// One-click: creates grade-differentiated pre-made assignments for ALL subjects (reading, math, writing, spelling, SEL)
// based on each student's grade level. Uses pre-written content — no AI required.
router.post("/class/:classId/generate-today", requireRole("teacher", "admin"), async (req: AuthRequest, res: Response) => {
  const classId = req.params.classId;
  const subjectCol: Record<string, string> = { math: "math_grade", writing: "writing_grade", reading: "reading_grade", spelling: "reading_grade" };

  const created: any[] = [];
  const errors: string[] = [];

  // Insert per-grade assignments for reading, math, writing, spelling
  for (const subject of ["reading", "math", "writing", "spelling"] as const) {
    const col = subjectCol[subject];
    try {
      const gradeLevels = await db.prepare(
        `SELECT DISTINCT ${col} AS grade_level
         FROM user_grade_levels ugl
         JOIN class_members cm ON cm.user_id::text = ugl.user_id::text
         WHERE cm.class_id::text = ? AND ${col} IS NOT NULL
         ORDER BY grade_level`
      ).all(classId) as any[];

      for (const { grade_level } of gradeLevels) {
        if (grade_level === null || grade_level === undefined) continue;
        const gradeNum = Number(grade_level);
        const premade = PREMADE[subject]?.[gradeNum];
        if (!premade) continue; // no pre-made content for this grade

        // Skip if already exists (no scheduled_date = always-on)
        const existing: any = await db.prepare(
          `SELECT id FROM assignments WHERE class_id::text = ? AND target_subject = ? AND target_grade_min = ? AND scheduled_date IS NULL LIMIT 1`
        ).get(classId, subject, gradeNum);
        if (existing) { created.push({ title: premade.title, skipped: true }); continue; }

        const id = crypto.randomUUID();
        await db.prepare(
          `INSERT INTO assignments (id, class_id, teacher_id, title, description, content, target_subject, target_grade_min, target_grade_max, scheduled_date, rubric, hints_allowed)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, 1)`
        ).run(
          id, classId, req.user!.id, premade.title, premade.description,
          JSON.stringify(premade.content), subject, gradeNum, gradeNum,
          JSON.stringify([{ label: "Correctness", maxPoints: premade.content.totalPoints || 50 }])
        );
        created.push({ id, title: premade.title, grade: gradeNum, subject });
      }
    } catch (e: any) {
      errors.push(`${subject}: ${e?.message}`);
    }
  }

  // Insert SEL (class-wide, grades 1–5) if not already present
  try {
    const selExisting: any = await db.prepare(
      `SELECT id FROM assignments WHERE class_id::text = ? AND target_subject = 'sel' AND scheduled_date IS NULL LIMIT 1`
    ).get(classId);
    if (!selExisting) {
      const id = crypto.randomUUID();
      await db.prepare(
        `INSERT INTO assignments (id, class_id, teacher_id, title, description, content, target_subject, target_grade_min, target_grade_max, scheduled_date, rubric, hints_allowed)
         VALUES (?, ?, ?, ?, ?, ?, 'sel', 1, 5, NULL, ?, 1)`
      ).run(
        id, classId, req.user!.id, SEL_CONTENT.title, SEL_CONTENT.description,
        JSON.stringify(SEL_CONTENT.content),
        JSON.stringify([{ label: "Reflection", maxPoints: 40 }])
      );
      created.push({ id, title: SEL_CONTENT.title, subject: "sel" });
    } else {
      created.push({ title: SEL_CONTENT.title, skipped: true });
    }
  } catch (e: any) {
    errors.push(`sel: ${e?.message}`);
  }

  res.json({ created: created.length, assignments: created, errors });
});

// POST /assignments/class/:classId/generate-afternoon
// Adds 7 class-wide assignments using PREMADE content. Every student in
// the class sees all 7 in their pending list regardless of grade — no
// grade target, no special gate. The teacher can click this multiple
// times to keep stacking work for kids who blow through everything.
// scheduled_date is left NULL so the pending query treats them as
// always-on and shows them every day until submitted.
router.post("/class/:classId/generate-afternoon", requireRole("teacher", "admin"), async (req: AuthRequest, res: Response) => {
  const classId = req.params.classId;
  try { await ensureGradeCols(); } catch {}

  // 7 class-wide assignments spanning subjects + grade levels. NOT grade-
  // targeted (target_grade_min stays NULL) so every kid sees every one.
  // Mix of grades 3/4/5 lets kids self-pace through the difficulty range.
  const slots: Array<{ subject: "reading" | "math" | "writing" | "spelling"; grade: number }> = [
    { subject: "reading",  grade: 3 },
    { subject: "math",     grade: 3 },
    { subject: "reading",  grade: 4 },
    { subject: "math",     grade: 4 },
    { subject: "writing",  grade: 4 },
    { subject: "spelling", grade: 4 },
    { subject: "math",     grade: 5 },
  ];

  const created: any[] = [];
  const errors: string[] = [];

  for (const { subject, grade } of slots) {
    const premade = PREMADE[subject]?.[grade];
    if (!premade) {
      errors.push(`${subject} G${grade}: no premade content`);
      continue;
    }
    try {
      const id = crypto.randomUUID();
      const title = `🌅 Bonus — ${premade.title}`;
      // target_grade_min/max NULL → class-wide. scheduled_date NULL →
      // always-on, never excluded by the today/nextDay date filter.
      // is_afternoon=1 is kept purely as a label so the teacher's list
      // shows the 🌅 stamp; the pending query no longer filters on it.
      await db.prepare(
        `INSERT INTO assignments (id, class_id, teacher_id, title, description, content, target_subject, rubric, hints_allowed, is_afternoon)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, 1)`
      ).run(
        id, classId, req.user!.id, title, premade.description,
        JSON.stringify(premade.content),
        subject,
        JSON.stringify([{ label: "Correctness", maxPoints: premade.content.totalPoints || 50 }]),
      );
      created.push({ id, title, subject, grade });
    } catch (e: any) {
      errors.push(`${subject} G${grade}: ${e?.message}`);
    }
  }

  res.json({ created: created.length, assignments: created, errors });
});

// DELETE /assignments/class/:classId/afternoon
// Clears all afternoon assignments for the class (so the teacher can regenerate).
router.delete("/class/:classId/afternoon", requireRole("teacher", "admin"), async (req: AuthRequest, res: Response) => {
  try {
    const r = await db.prepare(
      `DELETE FROM assignments WHERE class_id::text = ? AND is_afternoon = 1`
    ).run(req.params.classId);
    res.json({ deleted: (r as any)?.changes ?? 0 });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || "delete failed" });
  }
});

export default router;
