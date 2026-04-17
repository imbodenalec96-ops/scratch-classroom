import { Router, Response } from "express";
import crypto from "crypto";
import db from "../db.js";
import { AuthRequest } from "../middleware/auth.js";
import { requireRole } from "../middleware/rbac.js";

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
    ]) {
      try { await db.exec(col); } catch { /* column already exists */ }
    }
    gradeColsReady = true;
  })();
  try { await gradeColsInFlight; } finally { gradeColsInFlight = null; }
}

// Lazy Anthropic client (same pattern as ai-tasks.ts)
function getAnthropic() {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return null;
  const { default: Anthropic } = require("@anthropic-ai/sdk");
  // 60s per-request timeout + 1 retry only. Default SDK config is 10min
  // timeout with 2 retries — that turns a single slow call into 30min of
  // hanging, which is what was blowing past our client-side 90s abort.
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
    const msg = await client.messages.create({
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
    teacherNotes, questionCount, estimatedMinutes, focusKeywords,
    learningObjective, hintsAllowed, questionType,
  } = req.body;
  const id = crypto.randomUUID();
  await ensureGradeCols();
  const tMin = targetGradeMin != null ? Number(targetGradeMin) : null;
  const tMax = targetGradeMax != null ? Number(targetGradeMax) : (tMin != null ? tMin : null);
  const tSub = targetSubject || null;

  try {
    await db.prepare(
      `INSERT INTO assignments (
        id, class_id, teacher_id, title, description, due_date, rubric,
        starter_project_id, content, scheduled_date,
        target_grade_min, target_grade_max, target_subject,
        teacher_notes, question_count, estimated_minutes,
        focus_keywords, learning_objective, hints_allowed, question_type
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
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
    classSettingsReady = true;
  } catch (e) { console.error('ensureClassSettings error:', e); }
}

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
      });
    }
    res.json({
      ...row,
      enabled_subjects: (() => { try { return JSON.parse(row.enabled_subjects); } catch { return ["reading","writing","spelling","math","sel"]; } })(),
      default_hints_allowed: !!row.default_hints_allowed,
    });
  } catch { res.json({}); }
});

router.put("/settings/:classId", requireRole("teacher", "admin"), async (req: AuthRequest, res: Response) => {
  await ensureClassSettings();
  const { enabled_subjects, default_variety_level, default_question_count, default_estimated_minutes, default_hints_allowed } = req.body;
  const now = new Date().toISOString();
  try {
    await db.prepare(
      `INSERT INTO class_settings (class_id, enabled_subjects, default_variety_level, default_question_count, default_estimated_minutes, default_hints_allowed, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (class_id) DO UPDATE SET
         enabled_subjects = excluded.enabled_subjects,
         default_variety_level = excluded.default_variety_level,
         default_question_count = excluded.default_question_count,
         default_estimated_minutes = excluded.default_estimated_minutes,
         default_hints_allowed = excluded.default_hints_allowed,
         updated_at = excluded.updated_at`
    ).run(
      req.params.classId,
      JSON.stringify(enabled_subjects || ["reading","writing","spelling","math","sel"]),
      default_variety_level || "medium",
      default_question_count != null ? Number(default_question_count) : 3,
      default_estimated_minutes != null ? Number(default_estimated_minutes) : 5,
      default_hints_allowed ? 1 : 0,
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

  const client = getAnthropic();
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

  const client = getAnthropic();
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
  const client = getAnthropic();
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
      // If no target set, assignment is for everyone
      if (r.target_grade_min == null) return true;
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

// List assignments for a class
router.get("/class/:classId", async (req: AuthRequest, res: Response) => {
  const rows = await db.prepare(
    "SELECT * FROM assignments WHERE class_id = ? ORDER BY due_date ASC"
  ).all(req.params.classId) as any[];
  rows.forEach((r) => { r.rubric = JSON.parse(r.rubric || "[]"); });
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
  } = req.body;
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
       question_type = COALESCE(?, question_type)
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
    req.params.id,
  );
  const row = await db.prepare("SELECT * FROM assignments WHERE id = ?").get(req.params.id) as any;
  if (row) row.rubric = JSON.parse(row.rubric || "[]");
  res.json(row);
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
  const client = getAnthropic();
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
    const msg = await client.messages.create({
      model: AI_MODEL,
      max_tokens: 900,
      system: "You are a creative elementary teacher. Return JSON ONLY matching the EXACT same shape as the input. No markdown, no preamble.",
      messages: [{
        role: "user",
        content: `Current task JSON:\n${JSON.stringify(current)}\n\n${directive}\nFor every multiple_choice question, keep the correctIndex field valid. Return ONLY the new JSON.`,
      }],
    });
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
  const client = getAnthropic();
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

export default router;
