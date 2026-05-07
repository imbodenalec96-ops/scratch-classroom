// Sync the real classroom roster + assignments into the STAR system so:
//   • the student grid in the refusal/gradebook modals shows real kids
//   • every existing classroom assignment gets a scannable barcode
//
// Both syncs are idempotent — re-running won't create duplicates.

import { api } from "../api.ts";
import {
  StarStore, saveAll,
  type StarStudent, type StarAssignment, type StarTrackerEntry,
  type BcEntry, type Subject, type StarQuestion,
} from "./storage.ts";

const SUBJECT_NORMALIZE: Record<string, Subject> = {
  math: "Math", reading: "Reading", writing: "Writing", english: "Writing",
  ela: "Reading", science: "Science", "social studies": "Social Studies",
  socialstudies: "Social Studies", history: "Social Studies",
  pe: "PE", "physical education": "PE", art: "Art", music: "Music", library: "Library",
};

// Map a subject string to a 2-char barcode prefix.
const SUBJECT_PREFIX: Record<Subject, string> = {
  Math: "MA", Reading: "RD", Writing: "WR", Science: "SC",
  "Social Studies": "SS", PE: "PE", Art: "AR", Music: "MU", Library: "LB",
};

function normalizeSubject(s: string | null | undefined): Subject {
  if (!s) return "Math";
  const k = String(s).toLowerCase().trim();
  return SUBJECT_NORMALIZE[k] || (s as Subject) || "Math";
}

function gradeLabel(min?: number | null, max?: number | null): string {
  const g = min ?? max;
  if (g == null) return "";
  if (g === 0) return "K";
  return `${g}${["th","st","nd","rd"][((g % 100 - 20) % 10 + 10) % 10] || "th"}`;
}

// Pick a class id we can actually fetch from. Caches the answer for the
// rest of the session so the StarPage doesn't re-fetch /classes on every render.
let classIdCache: string | null = null;
async function pickClassId(): Promise<string | null> {
  if (classIdCache) return classIdCache;
  try {
    const classes = await api.getClasses();
    if (Array.isArray(classes) && classes.length > 0) {
      classIdCache = classes[0].id;
      return classIdCache;
    }
  } catch { /* not signed in / not allowed */ }
  return null;
}

export interface SyncResult {
  ok: boolean;
  studentsAdded: number;
  studentsTotal: number;
  assignmentsAdded: number;
  assignmentsTotal: number;
  message: string;
}

export async function syncFromClassroom(): Promise<SyncResult> {
  const classId = await pickClassId();
  if (!classId) {
    return {
      ok: false, studentsAdded: 0, studentsTotal: 0,
      assignmentsAdded: 0, assignmentsTotal: 0,
      message: "No classroom found — log in as a teacher/admin first.",
    };
  }

  let studentsAdded = 0;
  let studentsTotal = 0;
  let assignmentsAdded = 0;
  let assignmentsTotal = 0;

  // ── Students ─────────────────────────────────────────────────
  try {
    const rows = (await api.getStudents(classId)) as Array<{ id: string; name: string; email?: string }>;
    if (Array.isArray(rows) && rows.length > 0) {
      studentsTotal = rows.length;
      const next: StarStudent[] = rows.map((r) => {
        const parts = (r.name || "").trim().split(/\s+/);
        const firstName = parts[0] || r.name || "";
        const lastName  = parts.slice(1).join(" ") || "";
        return {
          id: r.id,
          firstName, lastName,
          email: r.email,
        };
      });
      // Preserve any locally added students that aren't in the API roster.
      const existing = StarStore.getStudents();
      const apiIds = new Set(next.map((s) => s.id));
      const merged = [...next, ...existing.filter((s) => !apiIds.has(s.id))];
      const beforeCount = existing.filter((s) => apiIds.has(s.id)).length;
      studentsAdded = next.length - beforeCount;
      StarStore.setStudents(merged);
    }
  } catch (e) {
    console.warn("[star sync] students:", e);
  }

  // ── Assignments ──────────────────────────────────────────────
  try {
    const rows = (await api.getAssignments(classId)) as Array<{
      id: string; title: string; description?: string;
      target_subject?: string; target_grade_min?: number; target_grade_max?: number;
      question_count?: number; learning_objective?: string;
      due_date?: string; created_at?: string; scheduled_date?: string;
      content?: string;
    }>;
    if (Array.isArray(rows)) {
      assignmentsTotal = rows.length;
      const bcDB = StarStore.getBcDB();
      const tracker = StarStore.getAsnTrack();
      const asns = StarStore.getAsns();

      // Index existing STAR entries by their sourceId so we don't double-create.
      const bySourceId = new Map<string, string>();
      for (const [bc, entry] of Object.entries(bcDB)) {
        if (entry.type === "assignment" && entry.sourceId) bySourceId.set(entry.sourceId, bc);
      }

      // Track per-prefix sequences as we mint barcodes within this sync run
      // so a single sync that creates many same-day MA-* barcodes increments correctly.
      const todaySeq: Record<string, number> = {};
      const today = new Date();
      const yy = String(today.getFullYear() % 100).padStart(2, "0");
      const mm = String(today.getMonth() + 1).padStart(2, "0");
      const dd = String(today.getDate()).padStart(2, "0");
      const datePart = `${yy}${mm}${dd}`;

      for (const a of rows) {
        if (bySourceId.has(a.id)) continue; // already synced

        const subject = normalizeSubject(a.target_subject);
        const grade = gradeLabel(a.target_grade_min, a.target_grade_max);
        const prefix = SUBJECT_PREFIX[subject] || "AS";
        // Find next free sequence for this prefix+date in current bcDB.
        if (todaySeq[prefix] == null) {
          let n = 1;
          while (bcDB[`${prefix}-${datePart}-${String(n).padStart(3, "0")}`]) n++;
          todaySeq[prefix] = n;
        }
        const seq = todaySeq[prefix]++;
        const barcode = `${prefix}-${datePart}-${String(seq).padStart(3, "0")}`;

        // The classroom AssignmentBuilder stores the full teacher-generated
        // lesson + question bank as JSON in `content`. Pull that through so
        // STAR shows the same lesson + real answer keys instead of placeholders.
        const parsed = parseAssignmentContent(a.content, a.description);
        const fallbackCount = Math.max(1, Number(a.question_count) || 10);
        const questions: StarQuestion[] = parsed.questions.length > 0
          ? parsed.questions
          : Array.from({ length: fallbackCount }, (_, i) => ({
              num: i + 1, text: `Question ${i + 1}`, answer: "—",
            }));

        const lesson = parsed.lesson;

        const created = a.scheduled_date || a.due_date || a.created_at || new Date().toISOString();

        const entry: BcEntry = {
          id: barcode,
          type: "assignment",
          name: a.title || "Untitled assignment",
          subject,
          gradeLevel: grade,
          goal: a.learning_objective || undefined,
          questions,
          lesson,
          createdDate: created,
          sourceId: a.id,
        };
        bcDB[barcode] = entry;

        const trk: StarTrackerEntry = {
          id: barcode,
          name: entry.name,
          subject, gradeLevel: grade,
          goal: entry.goal,
          questions,
          lesson,
          createdDate: created,
          status: "assigned",
          submissions: [],
        };
        tracker[barcode] = trk;

        const asn: StarAssignment = {
          id: barcode, name: entry.name, subject,
          type: "Assignment", grade,
        };
        asns.unshift(asn);
        assignmentsAdded++;
      }

      saveAll({ bcDB, asnTracker: tracker, asns });
    }
  } catch (e) {
    console.warn("[star sync] assignments:", e);
  }

  return {
    ok: true,
    studentsAdded, studentsTotal,
    assignmentsAdded, assignmentsTotal,
    message: `Synced ${studentsTotal} students · ${assignmentsAdded} new barcodes from ${assignmentsTotal} assignments.`,
  };
}

/* ── content parser ──────────────────────────────────────────────── */

interface ParsedContent {
  lesson: {
    title: string;
    intro: string;
    keyPoints: string[];
    workedExample?: { problem: string; solution: string };
    body?: string;
  } | null;
  questions: StarQuestion[];
}

// Parse the JSON content field stored on a classroom assignment row.
// The AssignmentBuilder writes shapes like:
//   { title, instructions, lesson: "<paragraph>", sections: [{ questions: [...] }] }
// where each question has `text` plus either `correctIndex`+`options` (multiple
// choice) or `correctAnswer` (short answer). Older rows may have a flat
// `questions` array. We normalize both into StarQuestion[].
function parseAssignmentContent(content: any, description?: string): ParsedContent {
  let parsed: any = null;
  if (typeof content === "string") {
    const s = content.trim();
    if (s.startsWith("{") || s.startsWith("[")) {
      try { parsed = JSON.parse(s); } catch { /* fall through */ }
    }
  } else if (content && typeof content === "object") {
    parsed = content;
  }

  if (!parsed) {
    return {
      lesson: description ? { title: "Instructions", intro: String(description), keyPoints: [] } : null,
      questions: [],
    };
  }

  // Collect questions from sections[*].questions, or top-level questions array
  const sections: any[] = Array.isArray(parsed.sections) ? parsed.sections : [];
  const flatQuestions: any[] = sections.flatMap((sec) => Array.isArray(sec?.questions) ? sec.questions : []);
  const fromTop: any[] = Array.isArray(parsed.questions) ? parsed.questions : [];
  const allQs = flatQuestions.length ? flatQuestions : fromTop;

  const questions: StarQuestion[] = allQs.map((q, i) => {
    const text = String(q?.text || q?.question || `Question ${i + 1}`);
    let answer = "";
    if (typeof q?.correctIndex === "number" && Array.isArray(q?.options)) {
      // strip leading "A. " etc. from option text so the answer is just the value
      const raw = String(q.options[q.correctIndex] || "");
      answer = raw.replace(/^[A-Da-d][.)]\s*/, "").trim();
    } else if (q?.correctAnswer != null) {
      answer = String(q.correctAnswer);
    } else if (q?.answer != null) {
      answer = String(q.answer);
    }
    return { num: i + 1, text, answer };
  });

  // Build lesson block. The classroom format puts the teaching paragraph in
  // `lesson` (a string) plus an `instructions` blurb. Pack both into our
  // structured Lesson shape so the modal + print template can render them.
  const lessonText = typeof parsed.lesson === "string" ? parsed.lesson.trim() : "";
  const instructions = typeof parsed.instructions === "string" ? parsed.instructions.trim() : "";
  const title = typeof parsed.title === "string" ? parsed.title.trim() : "Lesson";

  let lesson: ParsedContent["lesson"] = null;
  if (lessonText || instructions) {
    lesson = {
      title: title || "Lesson",
      intro: instructions || (lessonText.split(/[.!?]\s/)[0] + "."),
      keyPoints: [],
      body: lessonText || undefined,
    };
  } else if (description) {
    lesson = { title: "Instructions", intro: String(description), keyPoints: [] };
  }

  return { lesson, questions };
}
