// Assignment generator. Builds a STAR assignment via OpenRouter AI
// (or a local fallback lesson) and registers it into bcDB so the
// scanner can pull up the gradebook for it later.

import { useState } from "react";
import {
  StarStore, saveAll,
  type Subject, type StarQuestion, type StarTrackerEntry, type BcEntry, type StarStudent, type StarTemplate,
} from "../../lib/star/storage.ts";
import { bc128svg } from "../../lib/star/barcode.ts";
import { successBeep, errorBeep, loggedBeep } from "../../lib/star/sounds.ts";
import { pushBarcodeToServer } from "../../lib/star/barcodeRelay.ts";

const SUBJECTS: Subject[] = ["Math", "Reading", "Writing", "Spelling", "Science", "Social Studies", "SEL"];
const GRADES = ["K", "1st", "2nd", "3rd", "4th", "5th"];
const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
const Q_COUNTS = [5, 10, 15, 20];
const DIFFICULTIES = ["Easy", "Medium", "Hard"] as const;

export interface Lesson {
  title: string;
  intro: string;
  body?: string;
  keyPoints: string[];
  workedExample?: { problem: string; solution: string };
  vocab?: { term: string; definition: string }[];
}

export default function AssignmentGenerator({ onCreated }: { onCreated?: (id: string) => void }) {
  const [students] = useState<StarStudent[]>(() => StarStore.getStudents());
  const [studentId, setStudentId] = useState("");
  const studentName = studentId
    ? (() => { const s = students.find((x) => x.id === studentId); return s ? `${s.firstName} ${s.lastName}`.trim() : ""; })()
    : "";
  const [subject, setSubject] = useState<Subject>("Math");
  const [grade, setGrade] = useState("3rd");
  const [week, setWeek] = useState("1");
  const [day, setDay] = useState("Monday");
  const [count, setCount] = useState<number>(10);
  const [difficulty, setDifficulty] = useState<typeof DIFFICULTIES[number]>("Medium");
  const [goal, setGoal] = useState("");
  // Multiple-choice mode — when on, every question gets 4 plausible
  // choices (one correct + 3 distractors). The print + GradebookModal
  // both already honor q.choices[], so no rendering changes needed
  // elsewhere.
  const [mcqMode, setMcqMode] = useState(false);
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<{ id: string; questions: StarQuestion[]; lesson: Lesson } | null>(null);

  const generate = async () => {
    setBusy(true);
    try {
      const apiKey = StarStore.getApiKey();
      const model = StarStore.getAiModel() || "openrouter/auto";
      let questions: StarQuestion[] | null = null;
      let lesson: Lesson | null = null;

      if (apiKey) {
        try {
          const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${apiKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model,
              messages: [
                {
                  role: "system",
                  content: "You are an expert special-education teacher creating short, scaffolded worksheets. ALWAYS reply with raw JSON only. No markdown, no fences, no commentary.",
                },
                {
                  role: "user",
                  content: buildPrompt({ subject, grade, count, difficulty, goal, studentName, mcq: mcqMode }),
                },
              ],
              temperature: 0.6,
            }),
          });
          const data = await res.json();
          const content = data?.choices?.[0]?.message?.content || "";
          const parsed = safeParseJSON(content);
          // Some models return the full {lesson, questions} shape, others
          // shortcut to a bare array of questions. Support both.
          const qSource: any[] | null = Array.isArray(parsed)
            ? parsed
            : Array.isArray(parsed?.questions) ? parsed.questions : null;
          if (qSource) {
            const seen = new Set<string>();
            questions = qSource.map((q: any, i: number) => ({
              num: Number(q?.num ?? q?.number ?? (i + 1)) || (i + 1),
              text: String(q?.text || q?.question || q?.prompt || q?.q || `Question ${i + 1}`).trim(),
              answer: String(q?.answer || q?.response || q?.a || q?.solution || "").trim(),
              choices: Array.isArray(q?.choices) && q.choices.length >= 2
                ? q.choices.map((c: any) => String(c).trim()).filter(Boolean).slice(0, 4)
                : undefined,
            })).filter((q: StarQuestion) => {
              if (!q.text || q.text.length <= 2) return false;
              const key = q.text.toLowerCase();
              if (seen.has(key)) return false; // drop duplicates the model emitted
              seen.add(key);
              return true;
            }).map((q: StarQuestion, i: number) => ({ ...q, num: i + 1 }));
            lesson = parsed?.lesson || null;
          }
        } catch {
          // fall through to local
        }
      }

      if (!questions) {
        const local = buildLocalLesson({ subject, grade, count, difficulty, goal });
        questions = local.questions;
        lesson = local.lesson;
      }

      // MCQ mode — synthesize 4 choices per question if the generator
      // didn't produce them (always true for the local fallback; AI may
      // or may not honor the prompt). Distractors are drawn from other
      // answers in the same set, which keeps them on-topic.
      if (mcqMode && questions) {
        questions = synthesizeChoicesForAll(questions);
      }

      // Build barcode ID
      const now = new Date();
      const yy = String(now.getFullYear() % 100).padStart(2, "0");
      const mm = String(now.getMonth() + 1).padStart(2, "0");
      const dd = String(now.getDate()).padStart(2, "0");
      const subjPrefix = subject.slice(0, 2).toUpperCase();
      const bcDB = StarStore.getBcDB();
      let n = 1;
      let id = "";
      while (true) {
        id = `${subjPrefix}-${yy}${mm}${dd}-${String(n).padStart(3, "0")}`;
        if (!bcDB[id]) break;
        n++;
      }

      const name = `${subject} · ${grade} · Week ${week} ${day}`;
      const tracker = StarStore.getAsnTrack();
      const entry: BcEntry = {
        id, type: "assignment", name, subject, gradeLevel: grade,
        studentName: studentName || undefined, studentId: studentId || undefined, week, day, goal: goal || undefined,
        questions: questions!, lesson, createdDate: now.toISOString(),
      };
      bcDB[id] = entry;

      const trk: StarTrackerEntry = {
        id, name, subject, gradeLevel: grade,
        studentName: studentName || undefined, studentId: studentId || undefined, week, day, goal: goal || undefined,
        questions: questions!, lesson, createdDate: now.toISOString(),
        status: "assigned", submissions: [],
      };
      tracker[id] = trk;

      // Also drop into star_a so the assignment list stays in sync.
      const asns = StarStore.getAsns();
      asns.unshift({ id, name, subject, type: "Assignment", grade });

      saveAll({ bcDB, asnTracker: tracker, asns });
      pushBarcodeToServer(bcDB[id]);
      successBeep();
      setCreated({ id, questions: questions!, lesson: lesson! });
      onCreated?.(id);
    } catch (e) {
      console.error(e);
      errorBeep();
      alert("Something went wrong generating the assignment.");
    } finally {
      setBusy(false);
    }
  };

  const printIn = (mode: PrintMode) => {
    if (!created) return;
    const bc = StarStore.getBcDB()[created.id];
    if (!bc || bc.type !== "assignment") return;
    openPrintWindow(bc, created.questions, created.lesson, mode);
    loggedBeep();
  };

  return (
    <div style={{ color: "#f5f1e8" }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <Field label="Student (optional)">
          <select value={studentId} onChange={(e) => setStudentId(e.target.value)} style={inp()}>
            <option value="">— Pick a student —</option>
            {students.map((s) => (
              <option key={s.id} value={s.id}>
                {`${s.firstName} ${s.lastName}`.trim()}{s.grade ? ` (${s.grade})` : ""}
              </option>
            ))}
          </select>
        </Field>
        <Field label="IEP Goal (optional)">
          <input value={goal} onChange={(e) => setGoal(e.target.value)} placeholder="e.g. multi-digit subtraction with regrouping" style={inp()} />
        </Field>

        <Field label="Subject">
          <select value={subject} onChange={(e) => setSubject(e.target.value as Subject)} style={inp()}>
            {SUBJECTS.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </Field>
        <Field label="Grade">
          <select value={grade} onChange={(e) => setGrade(e.target.value)} style={inp()}>
            {GRADES.map((g) => <option key={g} value={g}>{g}</option>)}
          </select>
        </Field>

        <Field label="Week #">
          <input value={week} onChange={(e) => setWeek(e.target.value)} style={inp()} />
        </Field>
        <Field label="Day">
          <select value={day} onChange={(e) => setDay(e.target.value)} style={inp()}>
            {DAYS.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
        </Field>

        <Field label="Number of Questions">
          <select value={count} onChange={(e) => setCount(Number(e.target.value))} style={inp()}>
            {Q_COUNTS.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </Field>
        <Field label="Difficulty">
          <select value={difficulty} onChange={(e) => setDifficulty(e.target.value as any)} style={inp()}>
            {DIFFICULTIES.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
        </Field>
      </div>

      <div style={{ marginTop: 10 }}>
        <label style={{
          display: "inline-flex", alignItems: "center", gap: 10, cursor: "pointer",
          padding: "8px 12px", borderRadius: 10,
          background: mcqMode
            ? "linear-gradient(135deg, rgba(16,185,129,0.20), rgba(99,102,241,0.10))"
            : "rgba(255,255,255,0.04)",
          border: `1px solid ${mcqMode ? "rgba(16,185,129,0.50)" : "rgba(255,255,255,0.10)"}`,
          fontSize: 13, color: mcqMode ? "#bbf7d0" : "rgba(245,241,232,0.75)", fontWeight: 700,
        }}>
          <input
            type="checkbox" checked={mcqMode}
            onChange={(e) => setMcqMode(e.target.checked)}
            style={{ accentColor: "#a855f7", width: 16, height: 16 }}
          />
          <span>🅰️ Multiple choice (A/B/C/D)</span>
          <span style={{ fontSize: 11, fontWeight: 500, opacity: 0.65 }}>
            — 4 options per question, real answer + 3 plausible distractors
          </span>
        </label>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 14, gap: 10, flexWrap: "wrap" }}>
        <div style={{ fontSize: 12, opacity: 0.6 }}>
          {StarStore.getApiKey() ? "🤖 OpenRouter AI key set" : "💡 No AI key — will use local generator"}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => {
            const name = window.prompt("Name this template (e.g. 'Daily Math · 3rd'):", `${subject} · ${grade}`);
            if (!name) return;
            const stuName = studentName || (students.find((x) => x.id === studentId) ? `${students.find((x) => x.id === studentId)!.firstName}` : undefined);
            StarStore.addTemplate({
              id: `tpl-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
              name, subject, grade, count, difficulty, goal,
              studentId: studentId || undefined,
              studentName: stuName,
              createdAt: new Date().toISOString(),
              uses: 0,
            });
            successBeep();
          }} title="Save current settings as a template" style={ghostBtn()}>
            💾 Save Template
          </button>
          <button onClick={generate} disabled={busy} style={primaryBtn()}>
            {busy ? "Generating…" : "✨ Generate Assignment"}
          </button>
        </div>
      </div>

      <TemplatesPanel
        onUse={(t) => {
          // Apply template + immediately regenerate. Bumps the use count.
          setSubject(t.subject);
          setGrade(t.grade);
          setCount(t.count);
          setDifficulty(t.difficulty);
          setGoal(t.goal || "");
          if (t.studentId) setStudentId(t.studentId);
          StarStore.bumpTemplate(t.id);
          // Tiny delay so React commits the form-state update before generate reads it.
          setTimeout(() => generate(), 80);
        }}
      />

      {created && (
        <div style={{
          marginTop: 16, padding: 14, borderRadius: 12,
          background: "rgba(16,185,129,0.10)",
          border: "1px solid rgba(16,185,129,0.40)",
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
            <div>
              <div style={{ fontSize: 12, opacity: 0.7, fontWeight: 700, letterSpacing: "0.15em", textTransform: "uppercase" }}>
                Assignment created
              </div>
              <div style={{ fontFamily: "Menlo, monospace", fontWeight: 800, fontSize: 18, color: "#fde68a" }}>{created.id}</div>
              <div style={{ fontSize: 12, opacity: 0.7, marginTop: 2 }}>
                {created.questions.length} questions · scan barcode anytime to grade
              </div>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => printIn("student")}    style={ghostBtn()} title="Standard student worksheet">🖨 Student</button>
              <button onClick={() => printIn("key")}        style={ghostBtn()} title="Teacher answer key with green answers">🔑 Answer Key</button>
              <button onClick={() => printIn("large")}      style={ghostBtn()} title="Large-print version — bigger fonts + spacing">🔍 Large Print</button>
              <button onClick={() => printIn("quiz")}       style={ghostBtn()} title="Compact quiz format with multiple-choice slots">📋 Quick Quiz</button>
              <button onClick={() => printIn("notebook")}   style={ghostBtn()} title="Notebook format with extra-wide writing lines">📔 Notebook</button>
              <button onClick={() => printIn("flashcards")} style={ghostBtn()} title="Cut-out flashcards (question front, answer back)">🃏 Flashcards</button>
            </div>
          </div>
          <div style={{ marginTop: 12 }}
            dangerouslySetInnerHTML={{ __html: bc128svg(created.id, 0, 70, true, 2.0) }}
          />
        </div>
      )}
    </div>
  );
}

/* ── templates panel ─────────────────────────────────────────────── */

function TemplatesPanel({ onUse }: { onUse: (t: StarTemplate) => void }) {
  const [tpls, setTpls] = useState(() => StarStore.getTemplates());
  if (tpls.length === 0) return null;
  const remove = (id: string) => {
    if (!window.confirm("Delete this template?")) return;
    StarStore.deleteTemplate(id);
    setTpls(StarStore.getTemplates());
  };
  return (
    <div style={{
      marginTop: 14, paddingTop: 12,
      borderTop: "1px solid rgba(255,255,255,0.08)",
    }}>
      <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.18em", textTransform: "uppercase", opacity: 0.55, marginBottom: 8 }}>
        💾 Saved Templates ({tpls.length}) — tap to regenerate fresh content
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {tpls.map((t) => (
          <div key={t.id} style={{
            display: "flex", alignItems: "center", gap: 8,
            padding: "8px 10px", borderRadius: 8,
            background: "rgba(255,255,255,0.04)",
            border: "1px solid rgba(255,255,255,0.10)",
          }}>
            <button onClick={() => onUse(t)} style={{
              flex: 1, minWidth: 0, padding: 0,
              background: "transparent", color: "white", border: "none",
              cursor: "pointer", textAlign: "left",
            }}>
              <div style={{ fontSize: 13, fontWeight: 800 }}>{t.name}</div>
              <div style={{ fontSize: 11, opacity: 0.65 }}>
                {t.subject} · {t.grade} · {t.count}q · {t.difficulty}
                {t.studentName ? ` · for ${t.studentName}` : ""} · used {t.uses}×
              </div>
            </button>
            <button onClick={() => onUse(t)} title="Regenerate fresh content from this template" style={{
              padding: "6px 10px", borderRadius: 6,
              background: "linear-gradient(135deg,#6366f1,#b23a48)", color: "white",
              border: "none", fontSize: 12, fontWeight: 700, cursor: "pointer",
            }}>🔁 Run</button>
            <button onClick={() => remove(t.id)} title="Delete template" style={{
              padding: "6px 8px", borderRadius: 6,
              background: "rgba(239,68,68,0.10)", color: "#fca5a5",
              border: "1px solid rgba(239,68,68,0.40)",
              cursor: "pointer", fontSize: 11,
            }}>🗑</button>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── helpers ─────────────────────────────────────────────────────── */

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.18em", textTransform: "uppercase", opacity: 0.55, marginBottom: 4 }}>{label}</div>
      {children}
    </div>
  );
}
function inp(): React.CSSProperties {
  return {
    width: "100%", padding: "9px 10px", borderRadius: 8,
    background: "rgba(0,0,0,0.30)", color: "white",
    border: "1px solid rgba(255,255,255,0.12)",
    fontSize: 13, outline: "none",
  };
}
function primaryBtn(): React.CSSProperties {
  return {
    padding: "10px 16px", borderRadius: 10,
    background: "linear-gradient(135deg, #6366f1, #b23a48)",
    color: "white", border: "none", fontWeight: 800, cursor: "pointer", fontSize: 14,
  };
}
function ghostBtn(): React.CSSProperties {
  return {
    padding: "8px 12px", borderRadius: 8,
    background: "rgba(255,255,255,0.05)", color: "white",
    border: "1px solid rgba(255,255,255,0.15)",
    fontWeight: 700, cursor: "pointer", fontSize: 13,
  };
}

function gradeMathScope(grade: string): string {
  const g = (grade || "").toUpperCase();
  if (g === "K" || g === "KG") return "Kindergarten: ONLY addition within 5 (e.g., 2+3, 4+1). No subtraction, no multiplication, no division. Use objects and finger counting.";
  if (g.startsWith("1")) return "1st grade: addition and subtraction within 20 ONLY. NO multiplication. NO division. NO 2-digit operations.";
  if (g.startsWith("2")) return "2nd grade: addition and subtraction within 100 ONLY. ABSOLUTELY NO multiplication and NO division — those start in 3rd grade. Skip counting (2s, 5s, 10s) is okay.";
  if (g.startsWith("3")) return "3rd grade: addition/subtraction within 1000, AND beginning multiplication facts ×0 through ×10. Light division as the inverse of multiplication. NO long division, NO multi-digit multiplication.";
  if (g.startsWith("4")) return "4th grade: multi-digit addition/subtraction, multiplication facts to ×12, 2-digit × 1-digit multiplication, simple division with whole-number quotients. Beginning fractions.";
  return "5th grade: all four operations with larger numbers, multi-digit multiplication, long division with whole-number quotients, fractions with same denominator.";
}

// Hard subject lock — keeps the AI from drifting into the wrong subject.
// (e.g. "Math" assignments coming back as fact recall about presidents.)
const SUBJECT_RULES: Record<string, string> = {
  Math:             "ONLY math questions using numbers, arithmetic, or word problems. Every question must contain numbers and have a numeric answer.",
  Reading:          "ONLY reading comprehension, vocabulary, or phonics questions whose answers come from the lesson body.",
  Writing:          "ONLY grammar, punctuation, sentence-correction, or capitalization questions.",
  Spelling:         "ONLY spelling questions. Every question must be about how to spell a target word — multiple choice between correct/incorrect spellings, fill-in-the-missing-letter, or 'spell this word' prompts. NEVER ask trivia, NEVER ask history, science, or vocabulary definitions.",
  SEL:              "ONLY social-emotional learning questions about feelings, calming strategies, friendship, kindness, empathy, growth mindset, conflict resolution, or self-awareness. No academic content (no math, no science, no history). Use kid-friendly language.",
  Science:          "ONLY science questions about plants, animals, weather, earth, the human body, matter, or the water cycle. No history or math.",
  "Social Studies": "ONLY social studies questions about community, citizenship, maps, geography, or U.S. history. No math or science.",
  PE:               "ONLY questions about physical activity, sportsmanship, body movement, or healthy habits.",
  Art:              "ONLY questions about colors, shapes, art techniques, or famous artists.",
  Music:            "ONLY questions about rhythm, instruments, notes, or music basics.",
  Library:          "ONLY questions about books, authors, library organization, or reading habits.",
};

// Add 4 plausible multiple-choice options to every question. Real
// answer always included; distractors drawn from other answers in
// the same pool (kept on-topic), padded with generic close-misses
// when the pool is too small. Final list is shuffled.
export function synthesizeChoicesForAll(qs: StarQuestion[]): StarQuestion[] {
  const pool = qs.map((q) => q.answer).filter((a) => a && a.length > 0);
  return qs.map((q) => {
    if (Array.isArray(q.choices) && q.choices.length >= 2) return q;
    const others = pool.filter((a) => a.toLowerCase() !== (q.answer || "").toLowerCase());
    const picked: string[] = [];
    const seen = new Set([q.answer.toLowerCase()]);
    const shuffled = [...others].sort(() => Math.random() - 0.5);
    for (const o of shuffled) {
      const key = o.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      picked.push(o);
      if (picked.length === 3) break;
    }
    // Pad with simple close-misses for math (off-by-one / off-by-ten)
    // and generic placeholders for everything else.
    const num = Number(q.answer);
    while (picked.length < 3) {
      let extra = "";
      if (Number.isFinite(num)) {
        const offsets = [-1, 1, -2, 2, -10, 10];
        for (const d of offsets) {
          const cand = String(num + d);
          if (!seen.has(cand.toLowerCase())) { extra = cand; break; }
        }
      }
      if (!extra) extra = ["None of these", "All of these", "Not sure", "Other"][picked.length] || `Option ${picked.length + 1}`;
      if (seen.has(extra.toLowerCase())) { extra = extra + " "; }
      seen.add(extra.toLowerCase());
      picked.push(extra);
    }
    const choices = [q.answer, ...picked.slice(0, 3)].sort(() => Math.random() - 0.5);
    return { ...q, choices };
  });
}

function buildPrompt(opts: { subject: Subject; grade: string; count: number; difficulty: string; goal: string; studentName: string; mcq?: boolean }) {
  const subjectBodyGuidance: Record<string, string> = {
    "Social Studies":
      "Write the lesson body as a SHORT NARRATIVE STORY (5–9 kid-friendly sentences) that names every fact a student needs.",
    "Science":
      "Write the lesson body as a SHORT EXPLANATION + EXAMPLE (5–9 sentences) that names every fact.",
    "Reading":
      "Write the lesson body as a SHORT STORY OR PASSAGE (5–9 sentences) at the student's grade level.",
    "Writing":
      "Write the lesson body as a CLEAR RULE + 1 WORKED EXAMPLE (3–6 sentences).",
    "Spelling":
      "Write the lesson body as a SPELLING RULE or WORD LIST + 1 WORKED EXAMPLE (3–6 sentences). Pick 5–8 grade-appropriate target words and quiz only on those. Acceptable question patterns: 'Which spelling is correct: A. recieve B. receive C. receeve?', 'Fill in the missing letter: fri___nd', 'Spell the word that means a small dog: p_pp_'. NEVER ask trivia or content questions — only spelling.",
    "SEL":
      "Write the lesson body as a SHORT KID-FRIENDLY EXPLANATION + 1 RELATABLE EXAMPLE (4–7 sentences) about a feeling, friendship skill, calming strategy, or growth-mindset idea. Questions ask the student to identify feelings, name a strategy, or pick the kind/empathetic choice. No academic content.",
    "Math":
      `Write the lesson body as the RULE STATED PLAINLY + 1 WORKED EXAMPLE end-to-end. Example: "To add fractions with the same denominator, just add the top numbers. The bottom number stays the same. Example: 2/5 + 1/5 = 3/5." STRICT GRADE SCOPE: ${gradeMathScope(opts.grade)} Do NOT introduce operations above the listed grade. A 2nd grader does NOT do multiplication.`,
    "PE":      "Write the lesson body as a short paragraph about exercise/teamwork (4–6 sentences) with clear facts.",
    "Art":     "Write the lesson body as a short paragraph about an art technique or famous artist (4–6 sentences).",
    "Music":   "Write the lesson body as a short paragraph about music basics (4–6 sentences).",
    "Library": "Write the lesson body as a short paragraph about a book topic (4–6 sentences).",
  };
  const bodyGuidance = subjectBodyGuidance[opts.subject] || subjectBodyGuidance["Reading"];
  const subjectRule = SUBJECT_RULES[opts.subject] || "Stay strictly on the requested subject.";
  const diffTxt = opts.difficulty === "Easy" ? "very simple" : opts.difficulty === "Hard" ? "challenging" : "grade-appropriate";

  return `You are a special-education teacher building a SELF-CONTAINED ${opts.subject} worksheet for a ${opts.grade}-grade student${opts.studentName ? ` named ${opts.studentName}` : ""}. Difficulty: ${diffTxt}.
${opts.goal ? `IEP / topic focus: ${opts.goal}\n` : ""}

SUBJECT LOCK — ${subjectRule}

CRITICAL RULES:
1. The "lesson" must teach EVERYTHING the student needs to answer every question — no outside knowledge.
2. ${bodyGuidance}
3. Use kid-friendly vocabulary appropriate for ${opts.grade} grade.
4. Aim for the EASIER end of grade level — confidence-building, not challenging.
5. Every "answer" field must be the exact correct answer findable in the lesson body.
6. Generate exactly ${opts.count} questions.

Return ONLY raw JSON in this exact shape (no markdown, no fences):
{
  "lesson": {
    "title": "Catchy student-friendly title",
    "intro": "1-sentence what we're learning today",
    "body": "5-9 sentence story/passage/explanation that contains every answer (most important field)",
    "keyPoints": ["3-5 short bullet recap points pulled from the body"],
    "workedExample": { "problem": "(optional) one example problem", "solution": "the answer" },
    "vocab": [{ "term": "key word", "definition": "kid-friendly meaning" }]
  },
  "questions": [
    { "text": "Question that's answered in the body above", "answer": "Exact answer from the body"${opts.mcq ? `, "choices": ["correct answer", "plausible distractor #1", "plausible distractor #2", "plausible distractor #3"]` : ""} }
  ]
}${opts.mcq ? `

MULTIPLE-CHOICE MODE: every question MUST include a "choices" array of EXACTLY 4 strings. The correct answer is one of them (do not mark which — the app shuffles them). The other 3 are plausible but wrong distractors at the same grade level. Distractors must NOT match the correct answer in meaning. For math, use off-by-one / off-by-ten style misses. For Reading/Science/Social Studies, pick close-but-wrong facts from the lesson body.` : ""}`;
}

function safeParseJSON(s: string): any | null {
  // Strip code fences first — some models wrap the JSON in ```json ... ```
  const cleaned = s.replace(/```json|```/g, "").trim();
  try { return JSON.parse(cleaned); } catch {}
  // Try to slice out the largest JSON object …
  const obj = cleaned.match(/\{[\s\S]*\}/);
  if (obj) {
    try { return JSON.parse(obj[0]); } catch {}
  }
  // … or a bare array (some models reply with just questions[]).
  const start = cleaned.indexOf("[");
  const end = cleaned.lastIndexOf("]");
  if (start !== -1 && end > start) {
    try { return JSON.parse(cleaned.slice(start, end + 1)); } catch {}
  }
  return null;
}

// Topic banks. Each topic carries a self-contained passage that holds
// every answer, plus a question/answer pair list. The generator picks
// a topic (preferring one matched by the IEP-goal text) and returns
// `count` questions. This is the no-API-key fallback — the AI prompt
// produces fresher content when a key is set.
interface LocalTopic {
  title: string;
  intro: string;
  body: string;
  qa: { text: string; answer: string }[];
  keyPoints?: string[];
  vocab?: { term: string; definition: string }[];
  // Grade scope: 0 = Kindergarten, 1..5 = 1st..5th. A topic is "in scope"
  // for the picked grade if gradeMin <= g <= gradeMax. If unset, the
  // topic is treated as 3rd–5th (the original default).
  gradeMin?: number;
  gradeMax?: number;
}

function gradeNum(grade: string): number {
  const g = (grade || "").trim().toUpperCase();
  if (g === "K" || g === "KG" || g === "KINDERGARTEN") return 0;
  const n = parseInt(g, 10);
  return Number.isFinite(n) ? n : 3;
}

const SOCIAL_STUDIES_TOPICS: LocalTopic[] = [
  // ── K–1 ──────────────────────────────────────────────────
  {
    title: "Community Helpers",
    intro: "Today we will learn about people who help us.",
    body: "Community helpers are people who help us in our town. A teacher helps us learn. A doctor helps us when we are sick. A firefighter helps put out fires and keeps us safe. A police officer helps keep our town safe. A mail carrier brings letters to our home. We can thank our community helpers for the work they do.",
    qa: [
      { text: "Who helps us learn?", answer: "A teacher" },
      { text: "Who helps us when we are sick?", answer: "A doctor" },
      { text: "Who puts out fires?", answer: "A firefighter" },
      { text: "Who keeps our town safe?", answer: "A police officer" },
      { text: "Who brings letters to our home?", answer: "A mail carrier" },
      { text: "What is a community helper?", answer: "A person who helps us in our town" },
      { text: "Should we thank community helpers?", answer: "Yes" },
    ],
    keyPoints: ["Helpers help our town", "Teachers, doctors, firefighters, police, mail carriers"],
    gradeMin: 0, gradeMax: 1,
  },
  {
    title: "My Family",
    intro: "Families are the people who love us.",
    body: "A family is a group of people who love each other. Some families are big and some families are small. A mom and a dad are parents. Children are sons and daughters. Brothers and sisters are siblings. Grandparents are the parents of your parents. We help our family by being kind and listening.",
    qa: [
      { text: "What is a family?", answer: "A group of people who love each other" },
      { text: "What are mom and dad called?", answer: "Parents" },
      { text: "What are brothers and sisters called?", answer: "Siblings" },
      { text: "Who are the parents of your parents?", answer: "Grandparents" },
      { text: "How can we help our family?", answer: "By being kind and listening" },
    ],
    gradeMin: 0, gradeMax: 1,
  },
  // ── 2nd ──────────────────────────────────────────────────
  {
    title: "Maps and Globes",
    intro: "Maps and globes help us see where places are.",
    body: "A map is a flat picture of a place. A globe is a round model of the Earth. Maps and globes help us find places. The Earth has seven continents: North America, South America, Africa, Europe, Asia, Australia, and Antarctica. The Earth has five oceans: the Pacific, Atlantic, Indian, Arctic, and Southern. We live on the continent of North America. The United States is a country in North America.",
    qa: [
      { text: "What is a map?", answer: "A flat picture of a place" },
      { text: "What is a globe?", answer: "A round model of the Earth" },
      { text: "How many continents are there?", answer: "Seven" },
      { text: "How many oceans are there?", answer: "Five" },
      { text: "On which continent do we live?", answer: "North America" },
      { text: "Name one ocean.", answer: "Pacific" },
      { text: "Is the United States a country?", answer: "Yes" },
    ],
    keyPoints: ["Map = flat picture", "Globe = round Earth", "7 continents, 5 oceans"],
    gradeMin: 1, gradeMax: 3,
  },
  // ── 3rd–5th ──────────────────────────────────────────────
  {
    title: "American Symbols",
    intro: "Today we'll learn what some of America's symbols stand for.",
    body: "The United States has special symbols that stand for the country. The American flag has 13 stripes — one for each of the first 13 states — and 50 white stars on a blue square — one for each state today. The colors mean something too: red stands for bravery, white for peace, and blue for justice. The bald eagle is the national bird. It was chosen because it is strong, free, and lives only in North America. The Statue of Liberty stands in New York Harbor and welcomes new people to America. The Liberty Bell is in Philadelphia and rang to celebrate freedom.",
    qa: [
      { text: "How many stripes does the American flag have?", answer: "13" },
      { text: "How many stars are on the American flag?", answer: "50" },
      { text: "What does each star stand for?", answer: "A state" },
      { text: "What is the national bird?", answer: "The bald eagle" },
      { text: "Which color on the flag stands for bravery?", answer: "Red" },
      { text: "What does the color white stand for?", answer: "Peace" },
      { text: "What does the color blue stand for?", answer: "Justice" },
      { text: "Where is the Statue of Liberty?", answer: "New York Harbor" },
      { text: "Where is the Liberty Bell?", answer: "Philadelphia" },
      { text: "Why was the bald eagle chosen?", answer: "It is strong and free" },
    ],
    keyPoints: ["13 stripes = first 13 states", "50 stars = 50 states today", "Eagle = strong + free"],
    gradeMin: 2, gradeMax: 5,
  },
  {
    title: "Branches of Government",
    intro: "The U.S. government has three branches that work together.",
    body: "The United States government has three branches. The first branch is the Legislative branch — it is called Congress, and Congress writes the laws. Congress has two parts: the Senate and the House of Representatives. The second branch is the Executive branch. The President leads this branch and signs laws. The President lives in the White House in Washington, D.C. The third branch is the Judicial branch. Judges work in this branch, and the highest court is the Supreme Court. The Supreme Court has nine judges called Justices. Each branch checks the others so no one branch has too much power.",
    qa: [
      { text: "How many branches of government are there?", answer: "Three" },
      { text: "What does Congress do?", answer: "Writes the laws" },
      { text: "Which branch does the President lead?", answer: "Executive" },
      { text: "Where does the President live?", answer: "The White House" },
      { text: "What is the highest court?", answer: "The Supreme Court" },
      { text: "How many Justices are on the Supreme Court?", answer: "Nine" },
      { text: "Which branch has judges?", answer: "Judicial" },
      { text: "What are the two parts of Congress?", answer: "The Senate and the House of Representatives" },
      { text: "Which branch writes laws?", answer: "Legislative" },
      { text: "Why do the branches check each other?", answer: "So no branch has too much power" },
    ],
    keyPoints: ["Legislative = makes laws", "Executive = President signs laws", "Judicial = judges decide cases"],
    gradeMin: 4, gradeMax: 5,
  },
  {
    title: "The Thirteen Colonies",
    intro: "Long ago, America began as 13 small colonies along the East Coast.",
    body: "Before the United States was a country, it was 13 colonies belonging to England. The colonies were on the East Coast of North America. Some of the colonies were Massachusetts, Virginia, New York, and Georgia. The first colony settled was Virginia in 1607 at Jamestown. The Pilgrims came to Massachusetts in 1620 on a ship called the Mayflower. The colonists wanted to be free from England's king. In 1776, the colonies wrote the Declaration of Independence and became the United States of America. The man who wrote most of the Declaration was Thomas Jefferson. The first President was George Washington.",
    qa: [
      { text: "How many colonies were there?", answer: "13" },
      { text: "Which country owned the colonies?", answer: "England" },
      { text: "What was the first colony?", answer: "Virginia" },
      { text: "What ship did the Pilgrims sail on?", answer: "The Mayflower" },
      { text: "When did the Pilgrims arrive?", answer: "1620" },
      { text: "When was the Declaration of Independence written?", answer: "1776" },
      { text: "Who wrote most of the Declaration of Independence?", answer: "Thomas Jefferson" },
      { text: "Who was the first President?", answer: "George Washington" },
      { text: "On which coast were the colonies?", answer: "The East Coast" },
      { text: "What did the colonists want?", answer: "To be free from England's king" },
    ],
    gradeMin: 4, gradeMax: 5,
  },
];

const SCIENCE_TOPICS: LocalTopic[] = [
  // ── K–1 ──────────────────────────────────────────────────
  {
    title: "Living and Non-Living",
    intro: "Some things are alive and some things are not.",
    body: "Living things grow and need food and water. A dog is a living thing. A tree is a living thing. A person is a living thing. Non-living things do not grow. A rock is non-living. A toy is non-living. A book is non-living. Living things move and change. Non-living things stay the same.",
    qa: [
      { text: "Do living things grow?", answer: "Yes" },
      { text: "Is a dog living or non-living?", answer: "Living" },
      { text: "Is a rock living or non-living?", answer: "Non-living" },
      { text: "Is a tree living?", answer: "Yes" },
      { text: "What do living things need?", answer: "Food and water" },
      { text: "Is a toy living?", answer: "No" },
    ],
    gradeMin: 0, gradeMax: 1,
  },
  {
    title: "The Five Senses",
    intro: "We use our five senses to learn about the world.",
    body: "We have five senses. We use our EYES to see. We use our EARS to hear. We use our NOSE to smell. We use our TONGUE to taste. We use our SKIN to touch and feel. The five senses help us understand the world around us.",
    qa: [
      { text: "How many senses do we have?", answer: "Five" },
      { text: "What do we use to see?", answer: "Our eyes" },
      { text: "What do we use to hear?", answer: "Our ears" },
      { text: "What do we use to smell?", answer: "Our nose" },
      { text: "What do we use to taste?", answer: "Our tongue" },
      { text: "What do we use to touch?", answer: "Our skin" },
    ],
    gradeMin: 0, gradeMax: 2,
  },
  // ── 2nd–3rd ──────────────────────────────────────────────
  {
    title: "How Plants Grow",
    intro: "Plants are living things — let's learn what they need to grow.",
    body: "Plants are living things that make their own food. They need three things to grow: sunlight, water, and soil. The leaves of a plant catch sunlight. The roots of a plant pull water and nutrients from the soil. When a plant uses sunlight, water, and a gas called carbon dioxide, it makes its own food. This whole process is called photosynthesis. The food the plant makes is a kind of sugar. Plants give off oxygen, which is the gas people and animals need to breathe. So plants help us live, and we help plants by giving them water and sunlight.",
    qa: [
      { text: "What three things do plants need to grow?", answer: "Sunlight, water, and soil" },
      { text: "What part of a plant catches sunlight?", answer: "The leaves" },
      { text: "What part of a plant takes in water?", answer: "The roots" },
      { text: "What is the process of plants making food called?", answer: "Photosynthesis" },
      { text: "What gas do plants give off?", answer: "Oxygen" },
      { text: "What kind of food do plants make?", answer: "Sugar" },
      { text: "What gas do plants take in?", answer: "Carbon dioxide" },
      { text: "Are plants living things?", answer: "Yes" },
      { text: "How can people help plants?", answer: "By giving them water and sunlight" },
      { text: "What do plants give us that we need to breathe?", answer: "Oxygen" },
    ],
    vocab: [
      { term: "photosynthesis", definition: "How plants use sunlight to make food" },
      { term: "roots", definition: "The part of a plant that goes into the soil" },
    ],
    gradeMin: 2, gradeMax: 4,
  },
  {
    title: "The Water Cycle",
    intro: "Water moves around our planet in a never-ending cycle.",
    body: "Water on Earth keeps moving in a pattern called the water cycle. First, the sun heats water in lakes, rivers, and oceans. The water turns into a gas called water vapor. This step is called evaporation. The water vapor rises high in the sky and cools down. When it cools, it turns back into tiny water drops that form clouds. This step is called condensation. When the clouds get too heavy, the water falls back down as rain or snow. This step is called precipitation. The water then collects in rivers and oceans, and the whole cycle starts again.",
    qa: [
      { text: "What is it called when water turns into a gas?", answer: "Evaporation" },
      { text: "What heats up water in the water cycle?", answer: "The sun" },
      { text: "What is water vapor?", answer: "Water that has turned into a gas" },
      { text: "What forms when water vapor cools?", answer: "Clouds" },
      { text: "What is it called when water vapor turns back to liquid?", answer: "Condensation" },
      { text: "What is it called when water falls from clouds?", answer: "Precipitation" },
      { text: "What are two examples of precipitation?", answer: "Rain and snow" },
      { text: "Where does water collect after it falls?", answer: "Rivers and oceans" },
      { text: "Does the water cycle ever stop?", answer: "No" },
      { text: "What is the whole pattern called?", answer: "The water cycle" },
    ],
    gradeMin: 3, gradeMax: 5,
  },
  {
    title: "States of Matter",
    intro: "Everything around us is made of matter, and matter has states.",
    body: "Matter is anything that takes up space. Matter has three main states: solid, liquid, and gas. A solid keeps its shape — like a rock or an ice cube. A liquid takes the shape of its container — like water in a cup. A gas spreads out to fill its space — like air in a balloon. Matter can change from one state to another. When ice gets warm, it melts into water. When water gets very hot, it turns into a gas called steam. When steam cools, it turns back into water. Water freezes back into ice when it gets very cold.",
    qa: [
      { text: "What is matter?", answer: "Anything that takes up space" },
      { text: "What are the three main states of matter?", answer: "Solid, liquid, and gas" },
      { text: "Which state keeps its shape?", answer: "Solid" },
      { text: "Which state takes the shape of its container?", answer: "Liquid" },
      { text: "Which state spreads out to fill its space?", answer: "Gas" },
      { text: "What happens when ice gets warm?", answer: "It melts into water" },
      { text: "What is steam?", answer: "Water as a gas" },
      { text: "What happens when water gets very cold?", answer: "It freezes into ice" },
      { text: "Give one example of a solid.", answer: "A rock" },
      { text: "Give one example of a gas.", answer: "Air" },
    ],
    gradeMin: 2, gradeMax: 5,
  },
  // ── 4th–5th ──────────────────────────────────────────────
  {
    title: "The Solar System",
    intro: "Our Sun and the planets that orbit around it.",
    body: "Our solar system has the Sun at the center and eight planets that orbit around it. The order from closest to the Sun is: Mercury, Venus, Earth, Mars, Jupiter, Saturn, Uranus, and Neptune. Earth is the third planet from the Sun and the only one we know of that has life. Jupiter is the largest planet. The four inner planets (Mercury, Venus, Earth, Mars) are called rocky planets. The four outer planets are called gas giants. The Sun is actually a star — a giant ball of hot gas. Pluto used to be called a planet but is now called a dwarf planet.",
    qa: [
      { text: "What is at the center of our solar system?", answer: "The Sun" },
      { text: "How many planets are in our solar system?", answer: "Eight" },
      { text: "What is the closest planet to the Sun?", answer: "Mercury" },
      { text: "What is the third planet from the Sun?", answer: "Earth" },
      { text: "What is the largest planet?", answer: "Jupiter" },
      { text: "What planet is fourth from the Sun?", answer: "Mars" },
      { text: "Are the four outer planets called gas giants?", answer: "Yes" },
      { text: "What is the Sun?", answer: "A star" },
      { text: "What is Pluto called now?", answer: "A dwarf planet" },
      { text: "Which is the only planet known to have life?", answer: "Earth" },
    ],
    gradeMin: 4, gradeMax: 5,
  },
  {
    title: "Force and Motion",
    intro: "Forces make things move, stop, or change direction.",
    body: "A FORCE is a push or a pull. When you kick a ball, you give it a force that makes it move. When you stop a moving ball, you use a force called friction. GRAVITY is a force that pulls everything toward the ground. That's why a dropped ball falls down. INERTIA is the rule that says objects keep doing what they're doing — a moving ball keeps rolling unless something stops it. The more MASS an object has, the more force you need to move it. A bowling ball is harder to push than a soccer ball because it has more mass.",
    qa: [
      { text: "What is a force?", answer: "A push or a pull" },
      { text: "What force pulls things toward the ground?", answer: "Gravity" },
      { text: "What force stops a moving ball?", answer: "Friction" },
      { text: "What is inertia?", answer: "Objects keep doing what they're doing" },
      { text: "What is mass?", answer: "How much matter an object has" },
      { text: "Why is a bowling ball harder to push than a soccer ball?", answer: "It has more mass" },
      { text: "If you drop a ball, what makes it fall?", answer: "Gravity" },
      { text: "Is a kick a push or a pull?", answer: "A push" },
    ],
    gradeMin: 4, gradeMax: 5,
  },
];

const READING_TOPICS: LocalTopic[] = [
  // ── K–1 ──────────────────────────────────────────────────
  {
    title: "The Cat and the Mat",
    intro: "Read the short story. Every answer is in the story.",
    body: "Sam has a cat. The cat is black. The cat sits on a red mat. The cat naps every day. Sam pets the cat. The cat purrs.",
    qa: [
      { text: "Who has a cat?", answer: "Sam" },
      { text: "What color is the cat?", answer: "Black" },
      { text: "What does the cat sit on?", answer: "A red mat" },
      { text: "What color is the mat?", answer: "Red" },
      { text: "What does the cat do every day?", answer: "Naps" },
      { text: "What does Sam do?", answer: "Pets the cat" },
      { text: "What sound does the cat make?", answer: "Purrs" },
    ],
    gradeMin: 0, gradeMax: 1,
  },
  {
    title: "A Big Red Bus",
    intro: "Read the short story.",
    body: "Lily rides a big red bus to school. The bus stops at her house. Lily gets on the bus. She sits with her friend Jack. The bus drives to school. Lily and Jack laugh on the way.",
    qa: [
      { text: "What is the girl's name?", answer: "Lily" },
      { text: "What color is the bus?", answer: "Red" },
      { text: "Where does the bus go?", answer: "To school" },
      { text: "Who does Lily sit with?", answer: "Jack" },
      { text: "Where does the bus stop?", answer: "At her house" },
      { text: "What do Lily and Jack do?", answer: "Laugh" },
    ],
    gradeMin: 0, gradeMax: 1,
  },
  // ── 2nd–3rd ──────────────────────────────────────────────
  {
    title: "Maya's Garden",
    intro: "Read the passage carefully — every answer is in the story.",
    body: "Maya planted a garden in her backyard last spring. She planted three things: red tomatoes, sweet carrots, and tall sunflowers. Every morning before school, Maya watered her garden with a small green watering can. Her dog Buddy followed her around but was not allowed to dig. After two months, Maya's tomatoes turned bright red. The sunflowers grew taller than Maya. Maya picked the carrots and gave one to her grandmother, who said it was the best carrot she had ever tasted.",
    qa: [
      { text: "Whose garden is in the story?", answer: "Maya's" },
      { text: "What three things did Maya plant?", answer: "Tomatoes, carrots, and sunflowers" },
      { text: "What color is Maya's watering can?", answer: "Green" },
      { text: "What is the name of Maya's dog?", answer: "Buddy" },
      { text: "What was Buddy not allowed to do?", answer: "Dig" },
      { text: "When did Maya water the garden?", answer: "Every morning before school" },
      { text: "Who did Maya give a carrot to?", answer: "Her grandmother" },
      { text: "How tall did the sunflowers grow?", answer: "Taller than Maya" },
      { text: "What color did the tomatoes turn?", answer: "Bright red" },
      { text: "What did Grandmother say about the carrot?", answer: "It was the best carrot she had ever tasted" },
    ],
    gradeMin: 2, gradeMax: 3,
  },
  {
    title: "The Lost Backpack",
    intro: "Read carefully and find clues in the story.",
    body: "Liam left his blue backpack on the bus on Monday. Inside the backpack were his math book, a green pencil case, and his lunchbox. The bus driver, Mr. Park, found the backpack at the end of the day. He brought it to the school office. The next morning, Liam went to the office and got his backpack back. Liam thanked Mr. Park and promised to be more careful. The school secretary gave Liam a sticker for being polite.",
    qa: [
      { text: "What is the boy's name?", answer: "Liam" },
      { text: "What color is the backpack?", answer: "Blue" },
      { text: "Where did Liam leave the backpack?", answer: "On the bus" },
      { text: "On what day did this happen?", answer: "Monday" },
      { text: "Who found the backpack?", answer: "Mr. Park" },
      { text: "Where did Mr. Park bring the backpack?", answer: "The school office" },
      { text: "What was inside the backpack?", answer: "A math book, a green pencil case, and a lunchbox" },
      { text: "What did Liam promise?", answer: "To be more careful" },
      { text: "Who gave Liam a sticker?", answer: "The school secretary" },
      { text: "Why did Liam get a sticker?", answer: "For being polite" },
    ],
    gradeMin: 2, gradeMax: 3,
  },
  // ── 3rd–4th ──────────────────────────────────────────────
  {
    title: "The Class Hamster",
    intro: "A story about helping take care of a classroom pet.",
    body: "Mrs. Diaz's third-grade class has a pet hamster named Pepper. Every Friday, the class picks one student to take Pepper home for the weekend. The job comes with rules: feed Pepper twice a day, give her fresh water, and clean her cage on Saturday morning. This Friday, Mrs. Diaz picked Tomas. Tomas was excited but also nervous because his little brother might scare Pepper. Mrs. Diaz told Tomas to keep the cage on a high shelf. Tomas agreed and promised to follow every rule.",
    qa: [
      { text: "Who is the teacher?", answer: "Mrs. Diaz" },
      { text: "What grade is the class?", answer: "Third grade" },
      { text: "What is the hamster's name?", answer: "Pepper" },
      { text: "How often does a student take Pepper home?", answer: "Every Friday" },
      { text: "How many times a day should Pepper be fed?", answer: "Twice" },
      { text: "When should the cage be cleaned?", answer: "Saturday morning" },
      { text: "Who got picked this Friday?", answer: "Tomas" },
      { text: "Why was Tomas nervous?", answer: "His little brother might scare Pepper" },
      { text: "Where should Tomas keep the cage?", answer: "On a high shelf" },
      { text: "What did Tomas promise?", answer: "To follow every rule" },
    ],
    gradeMin: 3, gradeMax: 4,
  },
  // ── 4th–5th ──────────────────────────────────────────────
  {
    title: "The Time Capsule",
    intro: "A longer passage with more detail to track.",
    body: "Last spring, the fifth-grade class at Maple Hill School decided to make a time capsule. They wanted future students to learn about life in 2026. The class voted on what to put inside. They chose a school newspaper, a popular kid's book, a small American flag, photos of every student, and a letter from Mrs. Patel, their teacher. They sealed everything inside a metal box. The class buried the box near the playground oak tree. They marked the spot with a small stone plaque that read: \"Open in 2046.\" The students felt proud knowing they were sending a message to the future.",
    qa: [
      { text: "What grade decided to make the time capsule?", answer: "Fifth grade" },
      { text: "What is the school name?", answer: "Maple Hill School" },
      { text: "What year were they writing from?", answer: "2026" },
      { text: "Who is the teacher?", answer: "Mrs. Patel" },
      { text: "Name three things they put in the capsule.", answer: "A school newspaper, a popular kid's book, a small American flag" },
      { text: "What kind of box did they use?", answer: "A metal box" },
      { text: "Where did they bury the box?", answer: "Near the playground oak tree" },
      { text: "What year does the plaque say to open it?", answer: "2046" },
      { text: "What did Mrs. Patel contribute?", answer: "A letter" },
      { text: "How did the students feel?", answer: "Proud" },
    ],
    gradeMin: 4, gradeMax: 5,
  },
];

const WRITING_TOPICS: LocalTopic[] = [
  // ── K–1 ──────────────────────────────────────────────────
  {
    title: "Capital Letters at the Start",
    intro: "Every sentence starts with a capital letter.",
    body: "When we write a sentence, the first letter must be a CAPITAL letter. Capital letters are big letters like A, B, C. Small letters are like a, b, c. We always start with a capital. We also use capitals for names. \"Maya\" is a name, so M is a capital. The word \"i\" when it talks about you is always capital — \"I\" — even in the middle of a sentence.",
    qa: [
      { text: "What kind of letter starts every sentence?", answer: "A capital letter" },
      { text: "Are capital letters big or small?", answer: "Big" },
      { text: "Should the M in 'Maya' be capital?", answer: "Yes" },
      { text: "Is the word 'I' (about you) always capital?", answer: "Yes" },
      { text: "Give an example of a capital letter.", answer: "A" },
      { text: "Give an example of a small letter.", answer: "a" },
    ],
    gradeMin: 0, gradeMax: 1,
  },
  {
    title: "Period, Question Mark, Exclamation",
    intro: "Sentences end with a punctuation mark.",
    body: "Every sentence ends with one of three marks. A telling sentence ends with a PERIOD (.). Example: \"The dog ran.\" An asking sentence ends with a QUESTION MARK (?). Example: \"Where is the cat?\" An excited sentence ends with an EXCLAMATION MARK (!). Example: \"Look at that!\" Every sentence needs an end mark.",
    qa: [
      { text: "What mark ends a telling sentence?", answer: "A period" },
      { text: "What mark ends an asking sentence?", answer: "A question mark" },
      { text: "What mark ends an excited sentence?", answer: "An exclamation mark" },
      { text: "Does every sentence need an end mark?", answer: "Yes" },
      { text: "What mark is a period?", answer: "." },
      { text: "What mark is a question mark?", answer: "?" },
    ],
    gradeMin: 0, gradeMax: 2,
  },
  // ── 2nd–3rd ──────────────────────────────────────────────
  {
    title: "Writing Complete Sentences",
    intro: "A complete sentence has a subject and a verb.",
    body: "Every complete sentence needs two parts. The first part is the SUBJECT — who or what the sentence is about. The second part is the VERB — what the subject does. A complete sentence also starts with a capital letter and ends with a period, question mark, or exclamation mark. \"The dog runs.\" is a complete sentence: \"the dog\" is the subject and \"runs\" is the verb. \"Runs fast\" is NOT a complete sentence because it has no subject.",
    qa: [
      { text: "What two parts does every complete sentence need?", answer: "A subject and a verb" },
      { text: "What does the subject tell?", answer: "Who or what the sentence is about" },
      { text: "What does the verb tell?", answer: "What the subject does" },
      { text: "What letter must a sentence start with?", answer: "A capital letter" },
      { text: "Name one mark a sentence can end with.", answer: "A period" },
      { text: "Is 'Runs fast' a complete sentence?", answer: "No" },
      { text: "Why is 'Runs fast' not a complete sentence?", answer: "It has no subject" },
      { text: "In 'The dog runs.' what is the subject?", answer: "The dog" },
      { text: "In 'The dog runs.' what is the verb?", answer: "runs" },
      { text: "Name another end mark besides a period.", answer: "Question mark" },
    ],
    gradeMin: 2, gradeMax: 4,
  },
  {
    title: "Nouns, Verbs, and Adjectives",
    intro: "These three kinds of words are the building blocks of sentences.",
    body: "A NOUN is a person, place, or thing. \"Dog,\" \"school,\" and \"apple\" are nouns. A VERB is an action or state of being. \"Run,\" \"jump,\" and \"is\" are verbs. An ADJECTIVE is a word that describes a noun. \"Big,\" \"red,\" and \"happy\" are adjectives. In the sentence \"The big dog runs,\" \"dog\" is the noun, \"runs\" is the verb, and \"big\" is the adjective.",
    qa: [
      { text: "What is a noun?", answer: "A person, place, or thing" },
      { text: "What is a verb?", answer: "An action or state of being" },
      { text: "What is an adjective?", answer: "A word that describes a noun" },
      { text: "Is 'apple' a noun?", answer: "Yes" },
      { text: "Is 'jump' a verb?", answer: "Yes" },
      { text: "Is 'red' an adjective?", answer: "Yes" },
      { text: "In 'The big dog runs,' what is the noun?", answer: "dog" },
      { text: "In 'The big dog runs,' what is the verb?", answer: "runs" },
      { text: "In 'The big dog runs,' what is the adjective?", answer: "big" },
    ],
    gradeMin: 2, gradeMax: 4,
  },
  // ── 4th–5th ──────────────────────────────────────────────
  {
    title: "Paragraph Structure",
    intro: "A paragraph has a topic sentence, details, and a closing.",
    body: "A PARAGRAPH is a group of sentences about ONE topic. The first sentence is the TOPIC SENTENCE — it tells the main idea. The middle sentences are DETAIL SENTENCES — they give facts and examples that support the topic. The last sentence is the CLOSING SENTENCE — it wraps up the paragraph. A good paragraph has at least three to five sentences and stays focused on one idea.",
    qa: [
      { text: "What is a paragraph?", answer: "A group of sentences about one topic" },
      { text: "What is the first sentence of a paragraph called?", answer: "The topic sentence" },
      { text: "What does the topic sentence tell?", answer: "The main idea" },
      { text: "What are the middle sentences called?", answer: "Detail sentences" },
      { text: "What is the last sentence called?", answer: "The closing sentence" },
      { text: "How many sentences should a good paragraph have at least?", answer: "Three to five" },
      { text: "How many topics should a paragraph have?", answer: "One" },
    ],
    gradeMin: 4, gradeMax: 5,
  },
];

const SPELLING_TOPICS: LocalTopic[] = [
  // ── K ──────────────────────────────────────────────────
  {
    title: "Sight Words: Set 1",
    intro: "Sight words are short words we read every day.",
    body: "These five sight words show up in almost every book: \"the,\" \"and,\" \"a,\" \"to,\" and \"is.\" Practice spelling each one. Notice the letters: T-H-E spells the. A-N-D spells and. The letter A by itself spells a. T-O spells to. I-S spells is. Knowing these words by sight makes reading much easier.",
    qa: [
      { text: "Spell the word: the", answer: "t-h-e" },
      { text: "Spell the word: and", answer: "a-n-d" },
      { text: "Spell the word: to", answer: "t-o" },
      { text: "Spell the word: is", answer: "i-s" },
      { text: "Which word is spelled A?", answer: "a" },
      { text: "How many letters in 'the'?", answer: "Three" },
    ],
    gradeMin: 0, gradeMax: 1,
  },
  // ── 1st–2nd ──────────────────────────────────────────────
  {
    title: "Short A Words",
    intro: "Short A makes the sound in cat.",
    body: "The letter A makes a short sound — like the A in CAT. Words with short A: cat, hat, mat, bat, rat, sat, pan, can, man, ran. Notice the pattern: a consonant, then short A, then a consonant. We call this CVC: consonant-vowel-consonant.",
    qa: [
      { text: "What sound does short A make? Give a word.", answer: "Cat" },
      { text: "Spell: cat", answer: "c-a-t" },
      { text: "Spell: hat", answer: "h-a-t" },
      { text: "Spell: pan", answer: "p-a-n" },
      { text: "Spell: man", answer: "m-a-n" },
      { text: "What is CVC?", answer: "Consonant-vowel-consonant" },
      { text: "Is 'cat' a CVC word?", answer: "Yes" },
    ],
    gradeMin: 0, gradeMax: 2,
  },
  {
    title: "Short Vowels: a, e, i, o, u",
    intro: "Each short vowel has its own sound.",
    body: "There are five vowels: A, E, I, O, U. Short A is the sound in CAT. Short E is the sound in BED. Short I is the sound in PIG. Short O is the sound in DOG. Short U is the sound in CUP. Practice these: cat, bed, pig, dog, cup.",
    qa: [
      { text: "What are the five vowels?", answer: "A, E, I, O, U" },
      { text: "Spell a word with short A.", answer: "cat" },
      { text: "Spell a word with short E.", answer: "bed" },
      { text: "Spell a word with short I.", answer: "pig" },
      { text: "Spell a word with short O.", answer: "dog" },
      { text: "Spell a word with short U.", answer: "cup" },
      { text: "How many vowels are there?", answer: "Five" },
    ],
    gradeMin: 1, gradeMax: 2,
  },
  // ── 2nd–3rd ──────────────────────────────────────────────
  {
    title: "Silent E (Magic E)",
    intro: "When E is at the end, the vowel says its name.",
    body: "Silent E is the magic letter at the end of a word. When you add E to a short-vowel word, the vowel says its NAME instead of its short sound. CAP becomes CAPE. KIT becomes KITE. HOP becomes HOPE. CUB becomes CUBE. The E at the end is silent — you don't say it, but it changes the word.",
    qa: [
      { text: "What does silent E do to the vowel?", answer: "Makes it say its name" },
      { text: "What does CAP become with silent E?", answer: "Cape" },
      { text: "What does KIT become with silent E?", answer: "Kite" },
      { text: "What does HOP become with silent E?", answer: "Hope" },
      { text: "What does CUB become with silent E?", answer: "Cube" },
      { text: "Do you say the silent E?", answer: "No" },
      { text: "Spell: cape", answer: "c-a-p-e" },
    ],
    gradeMin: 1, gradeMax: 3,
  },
  {
    title: "Common Spelling: -ing endings",
    intro: "Many action words end with -ing.",
    body: "When we want to show action happening NOW, we add -ing to the verb. Run + ing = running. Jump + ing = jumping. Sit + ing = sitting. Notice: when a word ends in a consonant after a short vowel, we DOUBLE the consonant before adding -ing. RUN has only one N, but RUNNING has two N's. SIT becomes SITTING. JUMP keeps one P because there are two consonants already (m-p): jumping.",
    qa: [
      { text: "What ending shows action happening now?", answer: "-ing" },
      { text: "Spell: running", answer: "r-u-n-n-i-n-g" },
      { text: "Spell: jumping", answer: "j-u-m-p-i-n-g" },
      { text: "Spell: sitting", answer: "s-i-t-t-i-n-g" },
      { text: "How many N's in 'running'?", answer: "Two" },
      { text: "Why do we double the N in 'running'?", answer: "Because RUN has a short vowel and one consonant" },
    ],
    gradeMin: 2, gradeMax: 4,
  },
  // ── 4th–5th ──────────────────────────────────────────────
  {
    title: "Tricky Spellings: ie vs ei",
    intro: "There's a rule: I before E except after C.",
    body: "When spelling words with the EE sound, use IE most of the time — like \"believe,\" \"piece,\" \"field.\" But after the letter C, use EI — like \"receive,\" \"ceiling,\" \"deceive.\" The rhyme says: \"I before E, except after C.\" There are exceptions: \"weird\" and \"science\" break the rule, so memorize them.",
    qa: [
      { text: "What is the spelling rule for IE and EI?", answer: "I before E except after C" },
      { text: "Spell: believe", answer: "b-e-l-i-e-v-e" },
      { text: "Spell: piece", answer: "p-i-e-c-e" },
      { text: "Spell: receive", answer: "r-e-c-e-i-v-e" },
      { text: "Spell: ceiling", answer: "c-e-i-l-i-n-g" },
      { text: "Does 'receive' use IE or EI?", answer: "EI" },
      { text: "Does 'piece' use IE or EI?", answer: "IE" },
      { text: "Name an exception to the rule.", answer: "weird" },
    ],
    gradeMin: 4, gradeMax: 5,
  },
  {
    title: "Plurals: -s, -es, -ies",
    intro: "Three rules for making words plural.",
    body: "To make most words plural, just add -S: cat → cats, book → books. If a word ends in S, X, Z, CH, or SH, add -ES: bus → buses, box → boxes, dish → dishes. If a word ends in a consonant + Y, change the Y to I and add -ES: baby → babies, story → stories, city → cities.",
    qa: [
      { text: "How do you make most words plural?", answer: "Add -s" },
      { text: "What is the plural of cat?", answer: "cats" },
      { text: "What is the plural of bus?", answer: "buses" },
      { text: "What is the plural of box?", answer: "boxes" },
      { text: "What is the plural of dish?", answer: "dishes" },
      { text: "What is the plural of baby?", answer: "babies" },
      { text: "What is the plural of city?", answer: "cities" },
      { text: "What ending do you add to a word ending in CH?", answer: "-es" },
    ],
    gradeMin: 3, gradeMax: 5,
  },
];

const SEL_TOPICS: LocalTopic[] = [
  // ── K–1 ──────────────────────────────────────────────────
  {
    title: "Big Feelings",
    intro: "We all have feelings every day.",
    body: "Everyone has feelings. Sometimes we feel HAPPY — like when we play with friends or get a hug. Sometimes we feel SAD — like when we miss someone or lose a toy. Sometimes we feel ANGRY — like when something feels unfair. Sometimes we feel SCARED — like when there's a loud noise. All feelings are okay. We can talk about our feelings with a grown-up.",
    qa: [
      { text: "Does everyone have feelings?", answer: "Yes" },
      { text: "What feeling might you have when you play with friends?", answer: "Happy" },
      { text: "What feeling might you have when you miss someone?", answer: "Sad" },
      { text: "What feeling might you have when something feels unfair?", answer: "Angry" },
      { text: "What feeling might you have when there's a loud noise?", answer: "Scared" },
      { text: "Are all feelings okay?", answer: "Yes" },
      { text: "Who can you talk to about your feelings?", answer: "A grown-up" },
    ],
    gradeMin: 0, gradeMax: 1,
  },
  {
    title: "What My Body Tells Me",
    intro: "Our bodies give us clues about how we feel.",
    body: "Our body sends us signals when we have feelings. When we're happy, we might smile and feel light. When we're sad, our eyes might fill with tears. When we're angry, our hands might curl into fists and our face might feel hot. When we're scared, our heart might beat fast. When we notice these body clues, we know it's time to take a breath and ask for help.",
    qa: [
      { text: "What might your body do when you're happy?", answer: "Smile" },
      { text: "What might your eyes do when you're sad?", answer: "Fill with tears" },
      { text: "What might your hands do when you're angry?", answer: "Curl into fists" },
      { text: "What might your heart do when you're scared?", answer: "Beat fast" },
      { text: "What should you do when you notice body clues?", answer: "Take a breath and ask for help" },
    ],
    gradeMin: 0, gradeMax: 2,
  },
  // ── 1st–2nd ──────────────────────────────────────────────
  {
    title: "Calming Down",
    intro: "Three calming tricks that work.",
    body: "When big feelings come, we can calm our body down. Try BELLY BREATHING: put your hand on your belly and breathe in slow through your nose, then out through your mouth. Try the COUNT TO 10 trick: slowly count from 1 to 10. Try the FIVE SENSES trick: name five things you can see, four things you can touch, three things you can hear, two things you can smell, and one thing you can taste. These tricks tell your brain it's okay.",
    qa: [
      { text: "Where do you put your hand for belly breathing?", answer: "On your belly" },
      { text: "How do you breathe in for belly breathing?", answer: "Slow through your nose" },
      { text: "What do you count to in the counting trick?", answer: "Ten" },
      { text: "How many things do you SEE in the five senses trick?", answer: "Five" },
      { text: "How many things do you HEAR in the five senses trick?", answer: "Three" },
      { text: "What do calming tricks tell your brain?", answer: "It's okay" },
    ],
    gradeMin: 1, gradeMax: 3,
  },
  {
    title: "Being a Good Friend",
    intro: "What it takes to be a good friend.",
    body: "Good friends help each other. A good friend SHARES — like sharing crayons or a book. A good friend LISTENS when the other person is talking. A good friend says KIND words instead of mean words. A good friend INCLUDES others in games. A good friend tells the TRUTH. When we are a good friend, we feel proud and happy too.",
    qa: [
      { text: "What does a good friend do with crayons?", answer: "Shares" },
      { text: "What should a good friend do when someone else is talking?", answer: "Listen" },
      { text: "Should a good friend say kind or mean words?", answer: "Kind" },
      { text: "Who should a good friend include in games?", answer: "Others" },
      { text: "Should a good friend tell the truth?", answer: "Yes" },
      { text: "How do you feel when you are a good friend?", answer: "Proud and happy" },
    ],
    gradeMin: 1, gradeMax: 3,
  },
  // ── 3rd–4th ──────────────────────────────────────────────
  {
    title: "Empathy: Feeling With Others",
    intro: "Empathy means understanding how someone else feels.",
    body: "EMPATHY is when you imagine how another person feels. If your friend falls down, you might feel sad with them — that's empathy. People show empathy by saying kind things like \"Are you okay?\" or by giving a hug. Empathy is different from SYMPATHY — sympathy is feeling sorry FOR someone, while empathy is feeling WITH them. When we use empathy, we treat others the way we would want to be treated.",
    qa: [
      { text: "What is empathy?", answer: "Imagining how another person feels" },
      { text: "If your friend falls down, what feeling might empathy give you?", answer: "Sad" },
      { text: "Name one way to show empathy.", answer: "Saying 'Are you okay?'" },
      { text: "What is the difference between empathy and sympathy?", answer: "Empathy is feeling WITH them, sympathy is feeling sorry FOR them" },
      { text: "How should we treat others when we use empathy?", answer: "The way we would want to be treated" },
    ],
    gradeMin: 3, gradeMax: 5,
  },
  {
    title: "Apologies and Repair",
    intro: "How to make things right when you mess up.",
    body: "Everyone makes mistakes. When we hurt someone — even by accident — we make it right by APOLOGIZING. A real apology has three parts. First, say what you did: \"I'm sorry I broke your pencil.\" Second, name how the other person might feel: \"I bet you're upset.\" Third, offer to FIX it: \"I'll get you a new one.\" An apology is not just \"sorry\" — it's three steps. After you apologize, listen to the other person.",
    qa: [
      { text: "Does everyone make mistakes?", answer: "Yes" },
      { text: "How many parts does a real apology have?", answer: "Three" },
      { text: "What is the first part of a real apology?", answer: "Say what you did" },
      { text: "What is the second part?", answer: "Name how the other person might feel" },
      { text: "What is the third part?", answer: "Offer to fix it" },
      { text: "Is just saying 'sorry' a real apology?", answer: "No" },
      { text: "What should you do after you apologize?", answer: "Listen to the other person" },
    ],
    gradeMin: 3, gradeMax: 5,
  },
  // ── 4th–5th ──────────────────────────────────────────────
  {
    title: "Growth Mindset",
    intro: "Your brain grows when you try hard things.",
    body: "A GROWTH MINDSET is the belief that you can get smarter and better at things by working at them. The opposite is a FIXED MINDSET — thinking you can't change. Brains have something called NEURONS that make new connections every time you learn. Mistakes actually help your brain GROW. Instead of saying \"I can't do this,\" try \"I can't do this YET.\" That one word — yet — opens the door to growth.",
    qa: [
      { text: "What is a growth mindset?", answer: "The belief that you can get smarter by working at things" },
      { text: "What is the opposite of growth mindset?", answer: "Fixed mindset" },
      { text: "What in your brain makes new connections when you learn?", answer: "Neurons" },
      { text: "Do mistakes hurt or help your brain grow?", answer: "Help" },
      { text: "What word should you add to 'I can't do this'?", answer: "Yet" },
      { text: "What does 'yet' open the door to?", answer: "Growth" },
    ],
    gradeMin: 4, gradeMax: 5,
  },
  {
    title: "Solving Problems With Others",
    intro: "Conflict happens — here's how to work it out.",
    body: "When two people disagree, that's a CONFLICT. Conflicts are normal — even friends have them. To solve a conflict, follow four steps: COOL DOWN first (use a calming trick). LISTEN to the other person without interrupting. SAY YOUR SIDE using \"I feel\" words instead of blame, like \"I feel hurt when you take my pencil.\" Last, BRAINSTORM a fair solution together. If you can't solve it, ask an adult for help.",
    qa: [
      { text: "What is a conflict?", answer: "When two people disagree" },
      { text: "How many steps are there to solve a conflict?", answer: "Four" },
      { text: "What is the first step?", answer: "Cool down" },
      { text: "What is the second step?", answer: "Listen" },
      { text: "What kind of words should you use when you say your side?", answer: "I feel words" },
      { text: "What is the fourth step?", answer: "Brainstorm a fair solution" },
      { text: "Who can you ask if you can't solve the conflict?", answer: "An adult" },
    ],
    gradeMin: 4, gradeMax: 5,
  },
];

// Grade → which math operations are appropriate, and the number range
// each one should stay within. Pulled from common elementary scope &
// sequence: K and 1st never multiply, 2nd is +/− to 100 with skip counting,
// 3rd introduces basic multiplication facts (×0–10), 4th adds simple
// division and 2-digit × 1-digit, 5th allows larger numbers + light division.
interface GradeMath {
  ops: Array<"+" | "-" | "×" | "÷">;
  // Per-op number bounds: [maxA, maxB]
  range: Partial<Record<"+" | "-" | "×" | "÷", [number, number]>>;
  intro: string;
  body: string;
  keyPoints: string[];
  workedExample: { problem: string; solution: string };
}

function gradeKey(grade: string): "K" | "1" | "2" | "3" | "4" | "5" {
  const g = (grade || "").trim().toUpperCase();
  if (g === "K" || g === "KG" || g === "KINDERGARTEN") return "K";
  const n = parseInt(g, 10);
  if (n === 1) return "1";
  if (n === 2) return "2";
  if (n === 3) return "3";
  if (n === 4) return "4";
  return "5";
}

const GRADE_MATH: Record<"K" | "1" | "2" | "3" | "4" | "5", GradeMath> = {
  K: {
    ops: ["+"],
    range: { "+": [5, 5] },
    intro: "Today we are adding small numbers. We add when we put things together.",
    body: "When we ADD, we put two groups together to find how many in all. The symbol + means add. Example: 2 + 3. We can count: 1, 2 … then keep going 3, 4, 5. So 2 + 3 = 5. Try counting on your fingers if you need help.",
    keyPoints: ["+ means add", "Count to find the total", "You can use your fingers"],
    workedExample: { problem: "2 + 3 = ?", solution: "5" },
  },
  "1": {
    ops: ["+", "-"],
    range: { "+": [10, 10], "-": [10, 5] },
    intro: "Today we are adding and subtracting up to 20.",
    body: "When we ADD (+), we put two numbers together. Example: 6 + 4 = 10. When we SUBTRACT (−), we take one number away. Example: 8 − 3 = 5. We can count up for adding and count back for subtracting.",
    keyPoints: ["+ means put together", "− means take away", "Add by counting up, subtract by counting back"],
    workedExample: { problem: "6 + 4 = ?", solution: "10" },
  },
  "2": {
    ops: ["+", "-"],
    range: { "+": [50, 50], "-": [50, 30] },
    intro: "Today we are adding and subtracting numbers up to 100. (No multiplication yet — that starts in 3rd grade.)",
    body: "When we ADD (+), we put numbers together. Example: 23 + 14 = 37. When we SUBTRACT (−), we take one number from another. Example: 50 − 18 = 32. For 2-digit numbers, line up the ones place and the tens place. Add or subtract the ones first, then the tens.",
    keyPoints: ["Line up the ones and tens", "Ones place first, then tens", "+ adds, − takes away"],
    workedExample: { problem: "23 + 14 = ?", solution: "37" },
  },
  "3": {
    ops: ["+", "-", "×"],
    range: { "+": [100, 100], "-": [100, 50], "×": [10, 10] },
    intro: "Today we are practicing addition, subtraction, and beginning multiplication facts (×0 to ×10).",
    body: "When we MULTIPLY (×), we add a number to itself in equal groups. Example: 4 × 3 means 3 groups of 4, or 4 + 4 + 4 = 12. When we ADD (+), we put numbers together: 45 + 27 = 72. When we SUBTRACT (−), we take one away: 80 − 35 = 45. The × symbol means \"groups of\" or \"times.\"",
    keyPoints: ["× means groups of", "3 × 4 = 4 + 4 + 4 = 12", "Multiplication is fast adding"],
    workedExample: { problem: "4 × 3 = ?", solution: "12" },
  },
  "4": {
    ops: ["+", "-", "×", "÷"],
    range: { "+": [500, 500], "-": [500, 200], "×": [12, 9], "÷": [99, 9] },
    intro: "Today we are practicing addition, subtraction, multiplication facts, and beginning division.",
    body: "When we MULTIPLY (×), we count equal groups: 7 × 8 = 56. When we DIVIDE (÷), we split into equal groups: 56 ÷ 8 = 7. Multiplication and division are opposite operations — if 7 × 8 = 56, then 56 ÷ 8 = 7. We also keep practicing larger addition and subtraction.",
    keyPoints: ["× and ÷ are opposites", "If 7×8=56 then 56÷8=7", "Bigger numbers — line them up"],
    workedExample: { problem: "56 ÷ 8 = ?", solution: "7" },
  },
  "5": {
    ops: ["+", "-", "×", "÷"],
    range: { "+": [1000, 1000], "-": [1000, 500], "×": [25, 12], "÷": [144, 12] },
    intro: "Today we are practicing all four operations with larger numbers.",
    body: "All four operations are tools for solving problems. ADDITION (+) puts amounts together. SUBTRACTION (−) finds the difference. MULTIPLICATION (×) is fast adding of equal groups. DIVISION (÷) splits into equal groups. Multiplication and division are opposites — and so are addition and subtraction. Read carefully and pick the right operation.",
    keyPoints: ["+ and − are opposites", "× and ÷ are opposites", "Pick the right operation"],
    workedExample: { problem: "12 × 11 = ?", solution: "132" },
  },
};

// Random helpers — keep word problems feeling fresh from one generation
// to the next. The names/items rotate so two assignments back-to-back
// don't read identically.
const NAMES = ["Maya", "Liam", "Aiden", "Zoey", "Anna", "Ryan", "Kaleb", "Rayden", "Ameer", "Jaida", "Ava", "Noah", "Mia", "Eli", "Sofia"];
const FRUITS = ["apples", "oranges", "strawberries", "grapes", "bananas", "pears", "peaches"];
const ITEMS  = ["stickers", "marbles", "pencils", "blocks", "books", "crayons", "cards", "shells"];
const ANIMALS = ["birds", "puppies", "kittens", "fish", "rabbits", "ducks"];
const PLACES  = ["jar", "box", "basket", "bag", "shelf", "tray"];
function pick<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)]; }
function rand(maxA: number, maxB: number): [number, number] {
  return [Math.max(1, Math.floor(Math.random() * maxA) + 1), Math.max(1, Math.floor(Math.random() * maxB) + 1)];
}

// Word-problem builders per operation. Each returns { text, answer }
// using grade-bounded numbers passed in. The builder picks fresh actors,
// items, and phrasing so successive calls don't repeat.
type WordBuilder = (a: number, b: number) => { text: string; answer: string };

const WORD_ADD: WordBuilder[] = [
  (a, b) => ({ text: `${pick(NAMES)} has ${a} ${pick(FRUITS)}. Then ${pick(NAMES)} gives ${pick(["her","him"])} ${b} more. How many ${pick(FRUITS)} does ${pick(NAMES)} have in all?`, answer: String(a + b) }),
  (a, b) => {
    const item = pick(ITEMS);
    return { text: `There are ${a} ${item} in a ${pick(PLACES)}. ${pick(NAMES)} adds ${b} more ${item}. How many ${item} are in the ${pick(PLACES)} now?`, answer: String(a + b) };
  },
  (a, b) => ({ text: `${pick(NAMES)} read ${a} pages on Monday and ${b} pages on Tuesday. How many pages in total?`, answer: String(a + b) }),
  (a, b) => ({ text: `A pet store has ${a} ${pick(ANIMALS)} and gets ${b} more. How many ${pick(ANIMALS)} now?`, answer: String(a + b) }),
];

const WORD_SUB: WordBuilder[] = [
  (a, b) => ({ text: `${pick(NAMES)} had ${a} ${pick(ITEMS)}. ${pick(NAMES)} gave away ${b}. How many are left?`, answer: String(a - b) }),
  (a, b) => ({ text: `There were ${a} ${pick(ANIMALS)} on a fence. ${b} flew away. How many are still on the fence?`, answer: String(a - b) }),
  (a, b) => ({ text: `A bag had ${a} ${pick(FRUITS)}. ${pick(NAMES)} ate ${b}. How many ${pick(FRUITS)} are left in the bag?`, answer: String(a - b) }),
  (a, b) => ({ text: `${pick(NAMES)} saved $${a}. Then ${pick(["she","he"])} spent $${b} on a toy. How much money is left?`, answer: String(a - b) }),
];

const WORD_MUL: WordBuilder[] = [
  (a, b) => ({ text: `Each ${pick(PLACES)} has ${a} ${pick(ITEMS)}. There are ${b} ${pick(PLACES)}s. How many ${pick(ITEMS)} in all?`, answer: String(a * b) }),
  (a, b) => ({ text: `${pick(NAMES)} packs ${a} ${pick(FRUITS)} into each lunch. ${pick(["She","He"])} packs ${b} lunches. How many ${pick(FRUITS)} did ${pick(NAMES)} use?`, answer: String(a * b) }),
  (a, b) => ({ text: `A class has ${b} tables. Each table has ${a} students. How many students in the class?`, answer: String(a * b) }),
  (a, b) => ({ text: `There are ${a} rows of seats with ${b} seats in each row. How many seats are there?`, answer: String(a * b) }),
];

const WORD_DIV: WordBuilder[] = [
  // a is the dividend, b is the divisor (caller ensures clean division).
  (a, b) => ({ text: `${pick(NAMES)} has ${a} ${pick(ITEMS)} to share equally with ${b} friends. How many ${pick(ITEMS)} does each friend get?`, answer: String(a / b) }),
  (a, b) => ({ text: `${a} ${pick(FRUITS)} are split into ${b} equal ${pick(PLACES)}s. How many ${pick(FRUITS)} are in each ${pick(PLACES)}?`, answer: String(a / b) }),
  (a, b) => ({ text: `A baker bakes ${a} cookies and packs them into bags of ${b}. How many bags can be filled?`, answer: String(a / b) }),
];

function buildMathLesson(opts: { subject: Subject; grade: string; count: number; difficulty: string; goal: string }): { questions: StarQuestion[]; lesson: Lesson } {
  const g = gradeKey(opts.grade);
  const cfg = GRADE_MATH[g];

  // Honor difficulty by scaling up or down WITHIN the grade band — never
  // crossing into operations the student hasn't learned yet.
  const scale = opts.difficulty === "Easy" ? 0.5 : opts.difficulty === "Hard" ? 1.0 : 0.75;

  const questions: StarQuestion[] = [];
  const seen = new Set<string>(); // dedupe by exact question text
  let attempts = 0;
  const maxAttempts = opts.count * 30; // give it 30x slack to find unique problems
  while (questions.length < opts.count && attempts < maxAttempts) {
    attempts += 1;
    const op = cfg.ops[questions.length % cfg.ops.length];
    const [maxA, maxB] = cfg.range[op]!;
    let a = Math.max(1, Math.floor(Math.random() * Math.ceil(maxA * scale)) + 1);
    let b = Math.max(1, Math.floor(Math.random() * Math.ceil(maxB * scale)) + 1);

    const wordChance = g === "K" || g === "1" ? 0.7 : 0.5;
    const isWord = Math.random() < wordChance;

    let text: string; let answer: string;
    if (op === "+") {
      if (isWord) ({ text, answer } = pick(WORD_ADD)(a, b));
      else { answer = String(a + b); text = `${a} + ${b} = ?`; }
    } else if (op === "-") {
      if (b > a) [a, b] = [b, a];
      if (isWord) ({ text, answer } = pick(WORD_SUB)(a, b));
      else { answer = String(a - b); text = `${a} − ${b} = ?`; }
    } else if (op === "×") {
      if (isWord) ({ text, answer } = pick(WORD_MUL)(a, b));
      else { answer = String(a * b); text = `${a} × ${b} = ?`; }
    } else {
      const divisor = Math.max(2, b);
      const quotient = Math.max(1, Math.floor(Math.random() * Math.ceil(maxA / divisor)) + 1);
      const dividend = divisor * quotient;
      if (isWord) ({ text, answer } = pick(WORD_DIV)(dividend, divisor));
      else { answer = String(quotient); text = `${dividend} ÷ ${divisor} = ?`; }
    }
    const key = text.trim().toLowerCase();
    if (seen.has(key)) continue; // skip duplicate problem
    seen.add(key);
    questions.push({ num: questions.length + 1, text, answer });
  }

  return {
    questions,
    lesson: {
      title: `Math — ${opts.grade} Grade`,
      intro: opts.goal ? `Today we're practicing ${opts.goal}.` : cfg.intro,
      body: cfg.body,
      keyPoints: cfg.keyPoints,
      workedExample: cfg.workedExample,
      vocab: MATH_VOCAB,
    },
  };
}

const MATH_VOCAB = [
  { term: "sum",        definition: "the answer when you add numbers together" },
  { term: "difference", definition: "the answer when you subtract one number from another" },
  { term: "product",    definition: "the answer when you multiply two numbers" },
  { term: "quotient",   definition: "the answer when you divide one number by another" },
  { term: "equation",   definition: "a math sentence with an equals sign, like 2 + 3 = 5" },
];

function pickTopic(bank: LocalTopic[], goal: string, grade?: string): LocalTopic {
  // Filter by grade level first — only topics whose [gradeMin, gradeMax]
  // include this grade survive. Untagged topics fall through (legacy).
  let pool = bank;
  if (grade) {
    const g = gradeNum(grade);
    const inGrade = bank.filter((t) => {
      const lo = t.gradeMin ?? 0;
      const hi = t.gradeMax ?? 5;
      return g >= lo && g <= hi;
    });
    if (inGrade.length > 0) pool = inGrade;
  }
  // Goal-string match within the grade-filtered pool — lets a teacher
  // type "vowels" or "fractions" and steer to a matching topic.
  if (goal) {
    const gLower = goal.toLowerCase();
    const matched = pool.find((t) => t.title.toLowerCase().includes(gLower) || t.body.toLowerCase().includes(gLower));
    if (matched) return matched;
  }
  return pool[Math.floor(Math.random() * pool.length)];
}

export function buildLocalLesson(opts: { subject: Subject; grade: string; count: number; difficulty: string; goal: string }): { questions: StarQuestion[]; lesson: Lesson } {
  const { subject, count, difficulty, goal } = opts;

  // Math is procedural — generate fresh problems, but the operations and
  // number ranges have to follow the student's actual grade level. A 2nd
  // grader does NOT do multiplication; a kindergartener does NOT subtract
  // past 10. Multiplication starts in 3rd; multi-digit multiplication and
  // long division in 4th–5th.
  if (subject === "Math") {
    return buildMathLesson(opts);
  }

  const bank: LocalTopic[] =
    subject === "Social Studies" ? SOCIAL_STUDIES_TOPICS :
    subject === "Science"        ? SCIENCE_TOPICS :
    subject === "Reading"        ? READING_TOPICS :
    subject === "Writing"        ? WRITING_TOPICS :
    subject === "Spelling"       ? SPELLING_TOPICS :
    subject === "SEL"            ? SEL_TOPICS :
    /* Art / Music / Library / PE */ READING_TOPICS;

  const topic = pickTopic(bank, goal, opts.grade);

  // Build a unique question pool. Start with this topic's qa, then borrow
  // from sibling in-grade topics if we need more — never repeat a question
  // text within a single worksheet.
  const seen = new Set<string>();
  const collectFrom = (t: LocalTopic) => {
    for (const q of t.qa) {
      const key = q.text.trim().toLowerCase();
      if (!seen.has(key)) { seen.add(key); pool.push({ ...q, _from: t.title }); }
    }
  };
  const pool: Array<{ text: string; answer: string; _from?: string }> = [];
  collectFrom(topic);
  if (pool.length < count) {
    // Pull from other in-grade topics in the same bank (skip the picked one).
    const g = gradeNum(opts.grade);
    const inGrade = bank.filter((t) => {
      if (t.title === topic.title) return false;
      const lo = t.gradeMin ?? 0;
      const hi = t.gradeMax ?? 5;
      return g >= lo && g <= hi;
    });
    for (const t of inGrade) {
      if (pool.length >= count) break;
      collectFrom(t);
    }
  }
  // Shuffle the deduplicated pool, then take exactly `count` (or all of
  // pool if smaller — better to ship 8 unique questions than 10 with repeats).
  pool.sort(() => Math.random() - 0.5);
  const taken = pool.slice(0, count);
  const questions: StarQuestion[] = taken.map((q, i) => ({
    num: i + 1, text: q.text, answer: q.answer,
  }));

  const lesson: Lesson = {
    title: topic.title,
    intro: topic.intro,
    body: topic.body,
    keyPoints: topic.keyPoints || [],
    vocab: topic.vocab,
  };

  return { questions, lesson };
}

type PrintMode = "student" | "key" | "large" | "quiz" | "notebook" | "flashcards";

function openPrintWindow(bc: BcEntry & { type: "assignment" }, questions: StarQuestion[], lesson: Lesson | null, mode: PrintMode) {
  const w = window.open("", "_blank", "width=900,height=1100");
  if (!w) return;
  const isKey = mode === "key";

  // Flashcards mode: simple cut-out grid, no lesson, no answer lines.
  // 6 cards per page, question on front, answer on back (printed as
  // alternating pages so duplex front/back works).
  if (mode === "flashcards") {
    const barcodeSvg = bc128svg(bc.id, 0, 50, false, 1.4);
    const cardsPerPage = 6;
    const pages: string[] = [];
    for (let i = 0; i < questions.length; i += cardsPerPage) {
      const chunk = questions.slice(i, i + cardsPerPage);
      const front = chunk.map((q) => `
        <div style="border:2px solid #002855;border-radius:8px;padding:14px;display:flex;flex-direction:column;justify-content:space-between;height:2.4in;page-break-inside:avoid">
          <div style="font-size:10px;color:#999;font-weight:700">#${q.num}</div>
          <div style="font-size:18px;font-weight:600;color:#002855;text-align:center;line-height:1.3">${escapeHtml(q.text)}</div>
          <div style="text-align:right;opacity:0.5">${barcodeSvg}</div>
        </div>
      `).join("");
      const back = chunk.map((q) => `
        <div style="border:2px solid #16a34a;border-radius:8px;padding:14px;display:flex;align-items:center;justify-content:center;height:2.4in;page-break-inside:avoid">
          <div style="font-size:24px;font-weight:800;color:#16a34a;text-align:center">${escapeHtml(q.answer)}</div>
        </div>
      `).join("");
      pages.push(`
        <div style="display:grid;grid-template-columns:1fr 1fr;grid-template-rows:repeat(3,1fr);gap:8px;page-break-after:always">${front}</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;grid-template-rows:repeat(3,1fr);gap:8px;page-break-after:always">${back}</div>
      `);
    }
    w.document.write(`<!doctype html><html><head><title>${escapeHtml(bc.name)} — Flashcards</title>
      <style>
        @media print { @page { size: letter; margin: 0.4in; } }
        body { font-family: -apple-system, sans-serif; color: #111; padding: 12px; }
        h1 { font-size: 16px; margin: 0 0 12px; }
      </style></head><body>
      <h1>${escapeHtml(bc.name)} — Cut-out Flashcards</h1>
      ${pages.join("")}
      <script>window.addEventListener('load', () => setTimeout(() => window.print(), 200));</script>
    </body></html>`);
    w.document.close();
    return;
  }

  // Layout knobs by mode — controls font size, spacing, and answer-line
  // height so the same template can produce a normal student copy, a
  // large-print version, a compact quiz, or a notebook with extra-wide
  // writing space without forking the whole template.
  const layout = {
    student:   { titleFs: 22, qFs: 14, lineH: 32, gap: 14, intro: 13, body: 13 },
    key:       { titleFs: 22, qFs: 14, lineH: 0,  gap: 14, intro: 13, body: 13 },
    large:     { titleFs: 28, qFs: 20, lineH: 56, gap: 22, intro: 17, body: 17 },
    quiz:      { titleFs: 18, qFs: 12, lineH: 0,  gap: 8,  intro: 12, body: 12 },
    notebook:  { titleFs: 22, qFs: 16, lineH: 96, gap: 24, intro: 14, body: 14 },
    flashcards:{ titleFs: 22, qFs: 14, lineH: 32, gap: 14, intro: 13, body: 13 }, // unused
  }[mode];

  const barcodeSvg = bc128svg(bc.id, 0, mode === "large" ? 110 : 80, true, mode === "large" ? 2.6 : 2.0);
  const studentName = bc.studentName || "______________________";
  const headerLabel =
    mode === "key"      ? "📑 Teacher Answer Key" :
    mode === "large"    ? "📝 Student Worksheet — Large Print" :
    mode === "quiz"     ? "📋 Quick Quiz" :
    mode === "notebook" ? "📔 Notebook Worksheet" :
                          "📝 Student Worksheet";
  const head = `
    <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:12px">
      <div>
        <div style="font-size:11px;letter-spacing:0.2em;text-transform:uppercase;color:#555">${headerLabel}</div>
        <div style="font-size:${layout.titleFs}px;font-weight:800;margin-top:2px">${escapeHtml(bc.name)}</div>
        <div style="font-size:13px;color:#555;margin-top:4px">
          Student: <b>${escapeHtml(studentName)}</b> · Grade: ${escapeHtml(bc.gradeLevel || "")}
          · ${bc.week ? "Week " + escapeHtml(bc.week) + " · " : ""}${escapeHtml(bc.day || "")}
        </div>
        ${bc.goal ? `<div style="font-size:12px;color:#555;margin-top:4px">IEP Goal: ${escapeHtml(bc.goal)}</div>` : ""}
      </div>
      <div style="text-align:right">${barcodeSvg}</div>
    </div>
  `;

  const lessonAny: any = lesson;
  const vocabCards = lesson?.vocab?.length ? `
    <div style="margin-top:12px;padding:10px 12px;background:#F0FFF4;border:1px solid #16A34A;border-radius:6px">
      <div style="font-size:10px;font-weight:800;color:#16A34A;text-transform:uppercase;margin-bottom:8px;letter-spacing:.08em">📖 Vocabulary — Words You Need to Know</div>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:6px">
        ${lesson.vocab.map((v) => `
          <div style="background:white;border-radius:5px;padding:6px 8px;border:1px solid #BBF7D0">
            <div style="font-weight:800;font-size:12px;color:#002855">${escapeHtml(v.term)}</div>
            <div style="font-size:11.5px;color:#374151;margin-top:2px">${escapeHtml(v.definition)}</div>
          </div>
        `).join("")}
      </div>
    </div>
  ` : "";

  const keyPointsBox = lesson?.keyPoints?.length ? `
    <div style="margin-bottom:10px;background:white;border-radius:6px;padding:8px 12px;border:1px solid #BFDBFE">
      <div style="font-size:10px;font-weight:800;color:#002855;text-transform:uppercase;letter-spacing:.08em;margin-bottom:6px">⭐ Key Points</div>
      ${lesson.keyPoints.map((p) => `
        <div style="display:flex;gap:6px;margin-bottom:4px;font-size:12.5px;color:#374151">
          <span style="color:#1B5EA8;font-weight:700">•</span>${escapeHtml(p)}
        </div>
      `).join("")}
    </div>
  ` : "";

  const exampleBox = lesson?.workedExample ? `
    <div style="background:#FFFBEE;border:1.5px solid #F0A500;border-radius:6px;padding:10px 12px">
      <div style="font-size:10px;font-weight:800;color:#D97706;text-transform:uppercase;letter-spacing:.08em;margin-bottom:5px">✏️ Worked Example</div>
      <div style="font-size:13px;color:#374151;font-weight:500">${escapeHtml(lesson.workedExample.problem)} → <span style="color:#16a34a;font-weight:800">${escapeHtml(lesson.workedExample.solution)}</span></div>
    </div>
  ` : "";

  const lessonHtml = lesson ? `
    <div style="background:#F0F6FF;border:2px solid #1B5EA8;border-radius:8px;padding:14px 16px;margin-bottom:16px">
      <div style="background:#002855;color:#F0A500;font-size:11px;font-weight:800;padding:5px 10px;border-radius:4px;margin-bottom:10px;display:inline-block;letter-spacing:.08em">📚 LESSON — READ THIS FIRST</div>
      <div style="font-size:15px;font-weight:800;color:#002855;margin-bottom:8px">${escapeHtml(lesson.title)}</div>
      ${lesson.intro ? `<div style="font-size:13px;color:#374151;line-height:1.7;margin-bottom:10px">${escapeHtml(lesson.intro)}</div>` : ""}
      ${lessonAny.body ? `<div style="font-size:13px;color:#374151;line-height:1.7;margin-bottom:10px;white-space:pre-wrap">${escapeHtml(String(lessonAny.body))}</div>` : ""}
      ${keyPointsBox}
      ${exampleBox}
      ${vocabCards}
    </div>
  ` : "";

  // Quiz mode: skip the lesson box entirely, render compactly with
  // multiple-choice slots A/B/C/D for short-answer recall.
  const showLesson = mode !== "quiz";

  const qHtml = questions.map((q) => {
    if (mode === "quiz") {
      // Compact two-column quiz cell — just question + four blank slots.
      return `
        <div style="display:flex;gap:10px;margin-bottom:${layout.gap}px;page-break-inside:avoid;font-size:${layout.qFs}px">
          <span style="font-weight:700;color:#555;min-width:24px">#${q.num}</span>
          <div style="flex:1">
            <div>${escapeHtml(q.text)}</div>
            <div style="display:flex;gap:18px;margin-top:4px;color:#666;font-size:${layout.qFs - 1}px">
              <span>A. ___</span><span>B. ___</span><span>C. ___</span><span>D. ___</span>
            </div>
          </div>
          ${isKey ? `<div style="color:#16a34a;font-weight:800">${escapeHtml(q.answer)}</div>` : ""}
        </div>`;
    }
    if (mode === "notebook") {
      // Notebook — extra-wide writing area with light blue rules.
      return `
        <div style="margin-bottom:${layout.gap}px;page-break-inside:avoid">
          <div style="font-size:${layout.qFs}px;font-weight:600"><b>${q.num}.</b> ${escapeHtml(q.text)}</div>
          ${isKey
            ? `<div style="font-size:${layout.qFs - 2}px;color:#16a34a;font-weight:700;margin-top:4px;font-family:Menlo,monospace">✓ ${escapeHtml(q.answer)}</div>`
            : `
              <div style="margin-top:8px;border-top:1px solid #93c5fd;padding-top:${layout.lineH/3}px;border-bottom:1px solid #93c5fd;height:${layout.lineH}px;background:repeating-linear-gradient(transparent,transparent 31px,#dbeafe 31px,#dbeafe 32px)"></div>
            `}
        </div>`;
    }
    // student / key / large — same layout, knobs scale font + line height.
    const hasChoices = Array.isArray(q.choices) && q.choices.length >= 2;
    const mcqBlock = hasChoices ? `
      <div style="margin-top:6px;display:grid;grid-template-columns:1fr 1fr;gap:4px 24px">
        ${q.choices!.map((c, i) => {
          const letter = String.fromCharCode(65 + i);
          const isCorrect = isKey && c.trim().toLowerCase() === (q.answer || "").trim().toLowerCase();
          return `<div style="font-size:${layout.qFs - 1}px;display:flex;gap:8px;align-items:flex-start;${isCorrect ? "color:#16a34a;font-weight:800" : "color:#222"}">
            <span style="border:1.5px solid #555;border-radius:50%;width:18px;height:18px;display:inline-flex;align-items:center;justify-content:center;font-weight:700;font-size:11px;flex-shrink:0;${isCorrect ? "border-color:#16a34a;background:#16a34a;color:white" : ""}">${letter}</span>
            <span>${escapeHtml(c)}</span>
          </div>`;
        }).join("")}
      </div>
    ` : "";
    return `
      <div style="margin-bottom:${layout.gap}px;page-break-inside:avoid">
        <div style="font-size:${layout.qFs}px"><b>${q.num}.</b> ${escapeHtml(q.text)}</div>
        ${hasChoices
          ? mcqBlock
          : (isKey
              ? `<div style="font-size:${layout.qFs - 1}px;color:#16a34a;font-weight:700;margin-top:4px;font-family:Menlo,monospace">✓ ${escapeHtml(q.answer)}</div>`
              : `<div style="border-bottom:1.5px solid #444;height:${layout.lineH}px;margin-top:6px"></div>`)}
      </div>`;
  }).join("");

  // Lesson body honors the layout's body font size for Large Print.
  const adjustedLessonHtml = mode === "large"
    ? lessonHtml
        .replace(/font-size:13px/g, `font-size:${layout.body}px`)
        .replace(/font-size:15px/g, `font-size:${layout.body + 4}px`)
    : lessonHtml;

  w.document.write(`<!doctype html><html><head><title>${escapeHtml(bc.name)} — ${headerLabel}</title>
    <style>
      @media print { @page { size: letter; margin: 0.5in; } }
      body { font-family: -apple-system, sans-serif; color: #111; padding: 16px; }
    </style>
  </head><body>${head}${showLesson ? adjustedLessonHtml : ""}<div>${qHtml}</div>
  <script>window.addEventListener('load', () => setTimeout(() => window.print(), 200));</script>
  </body></html>`);
  w.document.close();
}

function escapeHtml(s: string): string {
  return (s || "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}
