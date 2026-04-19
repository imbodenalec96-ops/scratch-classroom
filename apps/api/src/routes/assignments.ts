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

// Lazy Anthropic client — uses dynamic import (ESM-safe, no require())
async function getAnthropic() {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return null;
  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  return new Anthropic({ apiKey: key, timeout: 45_000, maxRetries: 0 });
}
const AI_MODEL = "claude-sonnet-4-20250514";

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
async function generateDailyAssignmentContent(client: any, opts: {
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
}): Promise<{ title: string; content: any } | null> {
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

  try {
    // Explicit Promise.race hard-timeout. The SDK's `timeout` config is
    // unreliable under rate-limit backoff — calls can stall past 120s even
    // with maxRetries:0. This forcibly rejects at 40s regardless of SDK state.
    const HARD_TIMEOUT_MS = 40_000;
    const apiCall = client.messages.create({
      model: AI_MODEL,
      max_tokens: 900,
      system:
        "You are a creative elementary teacher. Return JSON ONLY matching this exact shape (no markdown, no preamble):\n" +
        `{"title":"Short catchy title","instructions":"1–2 sentence intro to read before starting","sections":[{"title":"Section name","questions":[{"type":"multiple_choice","text":"Question?","options":["A. ...","B. ...","C. ...","D. ..."],"correctIndex":0,"points":5,"hint":"Gentle hint"}]}]}\n` +
        `Exactly ${qCount} questions per task. ${qTypeDirective} multiple_choice MUST include correctIndex (0-based).`,
      messages: [{
        role: "user",
        content:
`Subject: ${opts.subject}. Student grade: ${opts.gradeMin === opts.gradeMax ? opts.gradeMax : `${opts.gradeMin}–${opts.gradeMax}`}. Date: ${opts.date}.
Theme seed: ${theme}.${opts.weekTheme ? `\nThis week's focus: ${opts.weekTheme}.` : ""}
${opts.learningObjective ? `Learning objective: ${opts.learningObjective}.` : ""}
${opts.focusKeywords ? `Emphasize these topics/keywords: ${opts.focusKeywords}.` : ""}
${opts.teacherNotes ? `Private teacher notes (don't expose to student, but use when crafting): ${opts.teacherNotes}` : ""}
${recent ? `AVOID repeating these recent prompts (choose fresh angle, different question type):\n${recent}` : ""}
Make this feel different from other days this week. Return ONLY JSON.`,
      }],
    });
    const msg: any = await Promise.race([
      apiCall,
      new Promise((_r, rej) => setTimeout(() => rej(new Error(`anthropic hard-timeout ${HARD_TIMEOUT_MS}ms`)), HARD_TIMEOUT_MS)),
    ]);
    const raw = (msg.content[0] as any).text.trim();
    const parsed = JSON.parse(raw);
    if (!parsed.sections || !Array.isArray(parsed.sections)) throw new Error("bad shape");
    return { title: parsed.title || "Assignment", content: parsed };
  } catch (e: any) {
    console.error("[weekly gen]", opts.studentId.slice(0, 8), opts.date, opts.subject, e?.message);
    return null;
  }
}

// Create assignment with full custom fields (Feature 29 rich customization)
router.post("/", requireRole("teacher", "admin"), async (req: AuthRequest, res: Response) => {
  const {
    classId, title, description, dueDate, rubric, starterProjectId, content, scheduledDate,
    targetGradeMin, targetGradeMax, targetSubject,
    targetStudentIds,
    teacherNotes, questionCount, estimatedMinutes, focusKeywords,
    learningObjective, hintsAllowed, questionType,
    isGroup, groupName,
  } = req.body;
  const id = crypto.randomUUID();
  await ensureGradeCols();
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
        target_student_ids, is_group, group_name
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id, classId, req.user!.id, title, description, dueDate, JSON.stringify(rubric || []),
      starterProjectId, content ?? null, scheduledDate ?? null,
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
    );
  } catch (e: any) {
    console.error('assignment insert error:', e?.message);
    // fallback without new cols
    try { await db.exec("ALTER TABLE assignments ADD COLUMN content TEXT"); } catch {}
    try { await db.exec("ALTER TABLE assignments ADD COLUMN scheduled_date TEXT"); } catch {}
    await db.prepare(
      `INSERT INTO assignments (id, class_id, teacher_id, title, description, due_date, rubric, starter_project_id, content, scheduled_date, target_grade_min, target_grade_max, target_subject)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(id, classId, req.user!.id, title, description, dueDate, JSON.stringify(rubric || []), starterProjectId, content ?? null, scheduledDate ?? null, tMin, tMax, tSub);
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
        enabled_subjects TEXT NOT NULL DEFAULT '["reading","writing","spelling","math","sel"]',
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
  math: "",                      // "Based Off Grade Level" → no directive
  sel: "theme: resilience",
};

router.get("/settings/:classId", requireRole("teacher", "admin"), async (req: AuthRequest, res: Response) => {
  await ensureClassSettings();
  try {
    const row = await db.prepare("SELECT * FROM class_settings WHERE class_id = ?").get(req.params.classId) as any;
    if (!row) {
      return res.json({
        enabled_subjects: ["reading", "writing", "spelling", "math", "sel"],
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
      enabled_subjects: (() => { try { return JSON.parse(row.enabled_subjects); } catch { return ["reading","writing","spelling","math","sel"]; } })(),
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
      JSON.stringify(enabled_subjects || ["reading","writing","spelling","math","sel"]),
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
// back gracefully if ANTHROPIC_API_KEY isn't set.
router.post("/weekly", requireRole("teacher", "admin"), async (req: AuthRequest, res: Response) => {
  const { classId, title, subject = "Reading", description, rubric, weekTheme } = req.body;
  await ensureGradeCols();

  const client = await getAnthropic();
  if (!client) {
    return res.status(503).json({
      error: "AI features not configured. Add ANTHROPIC_API_KEY in Vercel env vars to enable weekly generation.",
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
    "SELECT u.id, u.name FROM users u JOIN class_members cm ON cm.user_id = u.id WHERE cm.class_id = ? AND u.role = 'student'"
  ).all(classId) as any[];
  if (students.length === 0) {
    return res.status(400).json({ error: "No students enrolled in this class" });
  }

  const subjLower = String(subject).toLowerCase();
  const subjectKey = subjLower.includes("math") ? "math"
                   : subjLower.includes("writ") ? "writing" : "reading";

  // Look up per-student grades once
  const gradeRows = await db.prepare(
    "SELECT user_id, reading_grade, math_grade, writing_grade FROM user_grade_levels WHERE user_id IN (" +
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
        "SELECT prompt FROM daily_tasks WHERE student_id = ? AND subject = ? AND date >= date('now','-14 day')"
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
      const gen = await generateDailyAssignmentContent(client, {
        studentId: slot.studentId,
        date: slot.dateStr,
        subject: subjectKey,
        gradeMin: grade,
        gradeMax: grade,
        weekTheme,
        recentPrompts: recentPromptsByStudent[slot.studentId] || [],
      });
      // Retry once
      const final = gen || await generateDailyAssignmentContent(client, {
        studentId: slot.studentId, date: slot.dateStr, subject: subjectKey,
        gradeMin: grade, gradeMax: grade, weekTheme,
        recentPrompts: recentPromptsByStudent[slot.studentId] || [],
      });
      if (!final) {
        failed.push({ student_id: slot.studentId, date: slot.dateStr });
        return;
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
    subjects = ["reading", "writing", "spelling", "math", "sel"],
    themeBySubject = {},
    difficultyTweak = "match",
    varietyLevel = "medium",
    studentIds,
  } = req.body;
  await ensureGradeCols();

  const client = await getAnthropic();
  if (!client) {
    return res.status(503).json({
      error: "AI features not configured. Add ANTHROPIC_API_KEY in Vercel env vars.",
      code: "AI_NOT_CONFIGURED",
    });
  }

  // Monday of the target week
  const start = weekStarting ? new Date(weekStarting) : (() => {
    const t = new Date();
    const d = t.getDay();
    const plus = d === 0 ? 1 : d === 1 ? 0 : 8 - d;
    const m = new Date(t); m.setDate(t.getDate() + plus);
    return m;
  })();
  const dayNames = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
  const dates: string[] = [];
  for (let i = 0; i < 5; i++) {
    const d = new Date(start); d.setDate(start.getDate() + i);
    dates.push(d.toISOString().slice(0, 10));
  }

  // Roster — filter by studentIds if provided
  const roster = await db.prepare(
    "SELECT u.id, u.name FROM users u JOIN class_members cm ON cm.user_id = u.id WHERE cm.class_id = ? AND u.role = 'student'"
  ).all(classId) as any[];
  const students = (Array.isArray(studentIds) && studentIds.length)
    ? roster.filter(s => studentIds.includes(s.id))
    : roster;
  if (students.length === 0) return res.status(400).json({ error: "No students selected" });

  // Per-student grades
  const gradeRows = await db.prepare(
    "SELECT user_id, reading_grade, math_grade, writing_grade FROM user_grade_levels WHERE user_id IN (" +
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
          "SELECT prompt FROM daily_tasks WHERE student_id = ? AND subject = ? AND date >= date('now','-14 day')"
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
      for (let i = 0; i < 5; i++) {
        slots.push({ studentId: s.id, subject: subj, dateStr: dates[i], dayName: dayNames[i] });
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

      const gen = await generateDailyAssignmentContent(client, {
        studentId: slot.studentId,
        date: slot.dateStr + "|" + slot.subject, // include subject in seed so same-day different-subject diverge
        subject: subjectKey(slot.subject),
        gradeMin: grade, gradeMax: grade,
        weekTheme: [theme, varietyHint].filter(Boolean).join(". "),
        recentPrompts: recentList,
      });
      const final = gen || await generateDailyAssignmentContent(client, {
        studentId: slot.studentId, date: slot.dateStr + "|" + slot.subject + "|retry",
        subject: subjectKey(slot.subject), gradeMin: grade, gradeMax: grade,
        weekTheme: theme, recentPrompts: recentList,
      });
      if (!final) { failed.push({ student_id: slot.studentId, date: slot.dateStr, subject: slot.subject }); return; }

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
    subjects = ["reading", "writing", "spelling", "math", "sel"],
    themeBySubject = {},
    difficultyTweak = "match",
    varietyLevel = "medium",
    studentIds,
  } = req.body;
  await ensureGradeCols();

  // Fail fast if no API key — client shows a clear error instead of grinding
  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(503).json({
      error: "AI features not configured. Add ANTHROPIC_API_KEY in Vercel env vars to enable weekly generation.",
      code: "AI_NOT_CONFIGURED",
    });
  }

  const start = weekStarting ? new Date(weekStarting) : (() => {
    const t = new Date();
    const d = t.getDay();
    const plus = d === 0 ? 1 : d === 1 ? 0 : 8 - d;
    const m = new Date(t); m.setDate(t.getDate() + plus);
    return m;
  })();
  const dayNames = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
  const dates: string[] = [];
  for (let i = 0; i < 5; i++) {
    const d = new Date(start); d.setDate(start.getDate() + i);
    dates.push(d.toISOString().slice(0, 10));
  }

  const roster = await db.prepare(
    "SELECT u.id, u.name FROM users u JOIN class_members cm ON cm.user_id = u.id WHERE cm.class_id = ? AND u.role = 'student'"
  ).all(classId) as any[];
  const students = (Array.isArray(studentIds) && studentIds.length)
    ? roster.filter(s => studentIds.includes(s.id))
    : roster;
  if (students.length === 0) return res.status(400).json({ error: "No students in this class" });

  // Grades lookup
  const gradeRows = await db.prepare(
    "SELECT user_id, reading_grade, math_grade, writing_grade FROM user_grade_levels WHERE user_id IN (" +
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
      for (let i = 0; i < 5; i++) {
        const grade = gradeFor(s.id, subj);
        slots.push({
          classId,
          studentId: s.id,
          studentName: s.name,
          subject: subj,
          subjectKey: subjectKey(subj),
          date: dates[i],
          dayName: dayNames[i],
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
    days: 5,
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
    return res.status(503).json({ error: "ANTHROPIC_API_KEY not set", code: "AI_NOT_CONFIGURED" });
  }
  console.log(`${tag} CLIENT_OK +${Date.now()-T0}ms`);
  try { await ensureGradeCols(); } catch (e: any) { console.log(`${tag} ENSURE_COLS_ERR +${Date.now()-T0}ms ${e?.message}`); }
  console.log(`${tag} COLS_READY +${Date.now()-T0}ms`);

  const {
    classId, studentId, subject, subjectKey = subject, date, dayName,
    gradeMin, gradeMax, weekTheme, teacherNotes, focusKeywords,
    learningObjective, questionType, questionCount, estimatedMinutes,
    hintsAllowed,
  } = req.body;

  if (!classId || !studentId || !subject || !date || gradeMin == null) {
    console.log(`${tag} BAD_REQ +${Date.now()-T0}ms`);
    return res.status(400).json({ error: "Missing required fields" });
  }

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
  const gen = await generateDailyAssignmentContent(client, {
    studentId, date: `${date}|${subject}`, subject: subjectKey,
    gradeMin: Number(gradeMin), gradeMax: Number(gradeMax ?? gradeMin),
    weekTheme, recentPrompts: recent,
    questionCount, teacherNotes, focusKeywords, questionType, learningObjective,
  });
  console.log(`${tag} ANTHROPIC_DONE +${Date.now()-T0}ms ok=${!!gen}`);
  if (!gen) return res.status(500).json({ error: "Generation failed", tag });

  const id = crypto.randomUUID();
  try {
    await db.prepare(
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
    res.json({ ok: true, id, student: studentId, date, subject });
  } catch (e: any) {
    console.error('generate-slot insert', e?.message);
    res.status(500).json({ error: 'Insert failed', detail: e?.message });
  }
});

// Get all pending (unsubmitted) assignments for current student in a class.
// Honors per-assignment grade targeting:
//   - If target_grade_min IS NULL → assignment shows to everyone in class
//   - Else: student's grade for target_subject must fall in [min, max]
router.get("/class/:classId/pending", async (req: AuthRequest, res: Response) => {
  const userId = req.user!.id;
  const classId = req.params.classId;
  await ensureGradeCols();
  try {
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
    const rows = await db.prepare(`
      SELECT a.* FROM assignments a
      LEFT JOIN submissions s ON s.assignment_id = a.id AND s.student_id = ?
      WHERE a.class_id = ? AND s.id IS NULL
        AND (a.student_id IS NULL OR a.student_id = ?)
      ORDER BY a.scheduled_date ASC, a.created_at ASC
    `).all(userId, classId, userId) as any[];

    // Look up this student's grade levels once
    let studentGrades: any = null;
    try {
      studentGrades = await db.prepare(
        "SELECT reading_grade, math_grade, writing_grade FROM user_grade_levels WHERE user_id = ?"
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

    res.json(filtered);
  } catch (e) {
    console.error('pending assignments error:', e);
    res.json([]);
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
                                 ELSE ? END
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
// Body: { studentId: string, passed: boolean, feedback?: string }
router.post("/:id/grade", requireRole("teacher", "admin"), async (req: AuthRequest, res: Response) => {
  await ensureHumanGradeCols();
  const { studentId, passed, feedback } = req.body || {};
  if (!studentId || typeof passed !== "boolean") {
    return res.status(400).json({ error: "studentId (string) and passed (bool) required" });
  }
  const graderId = req.user!.id;
  const now = new Date().toISOString();
  const passInt = passed ? 1 : 0;
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
                human_grade_feedback = COALESCE(?, human_grade_feedback),
                graded_by = ?,
                graded_at = ?
          WHERE id = ?`
      ).run(passInt, fb, graderId, now, existing.id);
    } else {
      // No submission exists — create a placeholder row so the grade has a
      // home. answers stays empty; auto_grade_result stays null.
      const subId = crypto.randomUUID();
      await db.prepare(
        `INSERT INTO submissions
           (id, assignment_id, student_id, submitted_at,
            human_grade_pass, human_grade_feedback, graded_by, graded_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(subId, req.params.id, studentId, now, passInt, fb, graderId, now);
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
    return res.status(503).json({ error: "AI features not configured. Add ANTHROPIC_API_KEY." });
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
    const apiCall2 = client.messages.create({
      model: AI_MODEL,
      max_tokens: 900,
      system: "You are a creative elementary teacher. Return JSON ONLY matching the EXACT same shape as the input. No markdown, no preamble.",
      messages: [{
        role: "user",
        content: `Current task JSON:\n${JSON.stringify(current)}\n\n${directive}\nFor every multiple_choice question, keep the correctIndex field valid. Return ONLY the new JSON.`,
      }],
    });
    const msg: any = await Promise.race([
      apiCall2,
      new Promise((_r, rej) => setTimeout(() => rej(new Error("anthropic hard-timeout 40000ms")), 40_000)),
    ]);
    const raw = (msg.content[0] as any).text.trim();
    const next = JSON.parse(raw);
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
  if (!client) return res.status(503).json({ error: "AI features not configured. Add ANTHROPIC_API_KEY." });

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

  const gen = await generateDailyAssignmentContent(client, {
    studentId, date: dateStr + "-regen-" + Date.now(),
    subject, gradeMin, gradeMax, weekTheme,
    recentPrompts: currentPrompts,
  });
  if (!gen) return res.status(500).json({ error: "Regenerate failed" });

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

  let client: any;
  try { client = await getAnthropic(); } catch (e: any) {
    return res.status(500).json({ error: "Failed to init AI client: " + (e?.message || "unknown") });
  }
  if (!client) {
    return res.status(500).json({ error: "ANTHROPIC_API_KEY not configured on the server" });
  }

  try {
    const response = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 4096,
      messages: [{
        role: "user",
        content: [
          {
            type: "document",
            source: { type: "base64", media_type: "application/pdf", data: row.data_base64 },
          },
          {
            type: "text",
            text: `Extract this worksheet into a JSON assignment. Return ONLY valid JSON in this exact shape:
{
  "title": "string",
  "subject": "math|reading|writing|science|social_studies|spelling",
  "grade": "Kindergarten|1st Grade|2nd Grade|3rd Grade|4th Grade|5th Grade",
  "instructions": "string (the overall directions)",
  "sections": [
    {
      "title": "Section name",
      "questions": [
        {
          "type": "multiple_choice|short_answer|fill_blank",
          "text": "Question text",
          "options": ["A", "B", "C", "D"],
          "correctIndex": 0,
          "points": 1
        }
      ]
    }
  ]
}
Only include "options" and "correctIndex" for multiple_choice questions.`,
          },
        ],
      }],
    });

    // Claude returns content as an array of blocks; grab the first text block.
    const textBlock = (response.content || []).find((b: any) => b.type === "text");
    const raw = (textBlock as any)?.text?.trim() || "";
    if (!raw) return res.status(500).json({ error: "Claude returned no text" });

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

export default router;
