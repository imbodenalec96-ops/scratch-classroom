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
  // ── Added topics ─────────────────────────────────────────
  {
    title: "Rules and Laws",
    intro: "Read about why we have rules and laws.",
    body: "Rules are made for small groups, like a family or a classroom. Laws are made for everyone in a town, a state, or a country. We have rules and laws to keep people safe and fair. Parents make rules at home. Teachers make rules at school. The government makes laws for everyone. A speed limit is a law that keeps drivers safe. Raising your hand is a rule that keeps the classroom calm. People who break the law can get in trouble with the police. We follow rules to be good citizens.",
    qa: [
      { text: "Who are rules for?", answer: "Small groups like a family or classroom" },
      { text: "Who are laws for?", answer: "Everyone in a town, state, or country" },
      { text: "Why do we have rules and laws?", answer: "To keep people safe and fair" },
      { text: "Who makes rules at home?", answer: "Parents" },
      { text: "Who makes rules at school?", answer: "Teachers" },
      { text: "Who makes laws for everyone?", answer: "The government" },
      { text: "What kind of law keeps drivers safe?", answer: "A speed limit" },
      { text: "What is a classroom rule from the story?", answer: "Raising your hand" },
      { text: "Who can people get in trouble with for breaking the law?", answer: "The police" },
      { text: "Why do we follow rules?", answer: "To be good citizens" },
    ],
    gradeMin: 1, gradeMax: 3,
  },
  {
    title: "Native Americans Before the Colonists",
    intro: "Read about the first people who lived in North America.",
    body: "Long before the colonists arrived, Native Americans lived all across North America. Different tribes lived in different places and had different ways of life. The Lakota lived on the Great Plains and hunted buffalo. The Wampanoag lived near the East Coast and fished and farmed corn, beans, and squash. The Navajo lived in the Southwest and raised sheep. Native Americans built homes that fit their land — tipis on the plains, longhouses in the forests, and pueblos in the desert. They had their own languages, songs, and stories. When the Pilgrims arrived at Plymouth in 1620, the Wampanoag people taught them how to grow food and survive the winter.",
    qa: [
      { text: "Who lived in North America before the colonists?", answer: "Native Americans" },
      { text: "Where did the Lakota live?", answer: "On the Great Plains" },
      { text: "What animal did the Lakota hunt?", answer: "Buffalo" },
      { text: "Where did the Wampanoag live?", answer: "Near the East Coast" },
      { text: "What three crops did the Wampanoag farm?", answer: "Corn, beans, and squash" },
      { text: "Where did the Navajo live?", answer: "In the Southwest" },
      { text: "What homes did people on the plains build?", answer: "Tipis" },
      { text: "What homes did desert people build?", answer: "Pueblos" },
      { text: "Who taught the Pilgrims to grow food?", answer: "The Wampanoag" },
      { text: "When did the Pilgrims arrive at Plymouth?", answer: "1620" },
    ],
    gradeMin: 3, gradeMax: 5,
  },
  {
    title: "Goods and Services",
    intro: "Read about two things people buy.",
    body: "People buy two kinds of things: goods and services. Goods are things you can touch, like apples, shoes, or a bike. Services are jobs people do for you, like cutting hair or fixing a car. A bakery sells goods — bread and cupcakes. A doctor sells a service — a checkup. Money is what we use to buy goods and services. People who make goods are called producers. People who buy them are called consumers. Sometimes one person is both — a farmer who grows tomatoes is a producer, but at the store they are also a consumer.",
    qa: [
      { text: "What are two kinds of things people buy?", answer: "Goods and services" },
      { text: "What are goods?", answer: "Things you can touch" },
      { text: "Give an example of a good from the story.", answer: "Apples, shoes, or a bike" },
      { text: "What are services?", answer: "Jobs people do for you" },
      { text: "What service does a doctor sell?", answer: "A checkup" },
      { text: "What does a bakery sell?", answer: "Bread and cupcakes" },
      { text: "What do we use to buy goods and services?", answer: "Money" },
      { text: "What do we call people who make goods?", answer: "Producers" },
      { text: "What do we call people who buy goods?", answer: "Consumers" },
      { text: "Can one person be both a producer and a consumer?", answer: "Yes" },
    ],
    gradeMin: 2, gradeMax: 4,
  },
  // ── Round 2 ──────────────────────────────────────────────
  {
    title: "Why We Vote",
    intro: "Read about voting in our country.",
    body: "VOTING is how people in our country choose their leaders. The United States is a DEMOCRACY, which means the people get to pick. Every election, citizens 18 years old and older can vote. They go to a polling place or mail in a ballot. Each person gets ONE vote. The candidate with the most votes usually wins. We vote for our president, governors, mayors, and even for school board members. Voting matters because the leaders we pick make the laws and decisions that affect everyone. People without the right to vote in the past — including women and Black Americans — fought hard for it, and we honor that history every time we vote.",
    qa: [
      { text: "What is voting?", answer: "How people choose their leaders" },
      { text: "What kind of country is the United States?", answer: "A democracy" },
      { text: "How old must you be to vote?", answer: "18 years old" },
      { text: "Where do people go to vote?", answer: "A polling place" },
      { text: "What is another way to vote?", answer: "Mail in a ballot" },
      { text: "How many votes does each person get?", answer: "One" },
      { text: "Name one leader we vote for.", answer: "President, governor, mayor, or school board member" },
      { text: "Who usually wins an election?", answer: "The candidate with the most votes" },
      { text: "Why does voting matter?", answer: "Leaders we pick make the laws and decisions" },
      { text: "Who fought for the right to vote in the past?", answer: "Women and Black Americans" },
    ],
    gradeMin: 3, gradeMax: 5,
  },
  {
    title: "Continents and Oceans",
    intro: "Read about the big pieces of land and water on Earth.",
    body: "Earth has SEVEN continents and FIVE oceans. The continents are: NORTH AMERICA, SOUTH AMERICA, EUROPE, ASIA, AFRICA, AUSTRALIA, and ANTARCTICA. ASIA is the biggest continent and has the most people. AUSTRALIA is the smallest. ANTARCTICA is the coldest — it is covered in ice. The five oceans are: PACIFIC, ATLANTIC, INDIAN, ARCTIC, and SOUTHERN. The PACIFIC is the biggest and deepest ocean. The ARCTIC is the smallest. The United States is in NORTH AMERICA. We are bordered by the ATLANTIC OCEAN on the east and the PACIFIC OCEAN on the west.",
    qa: [
      { text: "How many continents are there?", answer: "Seven" },
      { text: "How many oceans are there?", answer: "Five" },
      { text: "Which continent is the biggest?", answer: "Asia" },
      { text: "Which continent has the most people?", answer: "Asia" },
      { text: "Which continent is the smallest?", answer: "Australia" },
      { text: "Which continent is the coldest?", answer: "Antarctica" },
      { text: "Which ocean is the biggest?", answer: "The Pacific" },
      { text: "Which ocean is the smallest?", answer: "The Arctic" },
      { text: "Which continent is the United States on?", answer: "North America" },
      { text: "Which ocean is on the east coast of the United States?", answer: "The Atlantic" },
    ],
    gradeMin: 2, gradeMax: 5,
  },
  {
    title: "Money in the United States",
    intro: "Read about how American money works.",
    body: "American money comes in COINS and BILLS. The four coins kids learn first are the PENNY (1 cent), NICKEL (5 cents), DIME (10 cents), and QUARTER (25 cents). 100 pennies make a DOLLAR. Bills come in $1, $5, $10, $20, $50, and $100. Different presidents are pictured on each bill. George Washington is on the $1, Abraham Lincoln is on the $5, and Andrew Jackson is on the $20. We use money to buy things we need (like food and clothes) and things we want (like toys and games). When you put money away to use later, that's called SAVING. When you spend money, you usually get back CHANGE if you paid more than the price.",
    qa: [
      { text: "What two main forms does money come in?", answer: "Coins and bills" },
      { text: "How much is a penny worth?", answer: "1 cent" },
      { text: "How much is a nickel worth?", answer: "5 cents" },
      { text: "How much is a dime worth?", answer: "10 cents" },
      { text: "How much is a quarter worth?", answer: "25 cents" },
      { text: "How many pennies make a dollar?", answer: "100" },
      { text: "Which president is on the $1 bill?", answer: "George Washington" },
      { text: "Which president is on the $5 bill?", answer: "Abraham Lincoln" },
      { text: "What do we call putting money away to use later?", answer: "Saving" },
      { text: "What do we call money you get back when you pay more than the price?", answer: "Change" },
    ],
    gradeMin: 1, gradeMax: 4,
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
  // ── Added topics ─────────────────────────────────────────
  {
    title: "Weather and the Seasons",
    intro: "Read about the four seasons of the year.",
    body: "A year has four seasons: spring, summer, fall, and winter. In SPRING, the weather warms up. Flowers bloom and baby animals are born. In SUMMER, the days are long and hot. Many people swim and play outside. In FALL, the air gets cool and leaves on trees turn red, orange, and yellow before falling off. In WINTER, the days are short and cold. In some places it snows. The Earth tilts as it goes around the Sun, and that tilt is what causes the seasons to change. Each season lasts about three months.",
    qa: [
      { text: "How many seasons are in a year?", answer: "Four" },
      { text: "Name the four seasons.", answer: "Spring, summer, fall, and winter" },
      { text: "In what season do flowers bloom?", answer: "Spring" },
      { text: "Which season has the longest and hottest days?", answer: "Summer" },
      { text: "What colors do leaves turn in fall?", answer: "Red, orange, and yellow" },
      { text: "In what season does it snow in some places?", answer: "Winter" },
      { text: "What causes the seasons?", answer: "The Earth's tilt as it goes around the Sun" },
      { text: "About how long does each season last?", answer: "Three months" },
      { text: "Which season comes after fall?", answer: "Winter" },
      { text: "When are baby animals born?", answer: "In spring" },
    ],
    gradeMin: 1, gradeMax: 3,
  },
  {
    title: "Animal Habitats",
    intro: "Read about where animals live.",
    body: "A HABITAT is the place where an animal lives and gets what it needs. Different animals need different habitats. A FOREST is a habitat full of trees, with bears, deer, and owls living there. A DESERT is a hot, dry habitat with very little water — lizards, snakes, and cactus plants live there. An OCEAN is a habitat full of salty water where fish, whales, and dolphins live. The ARCTIC is a very cold habitat covered with ice; polar bears and penguins live there. Every animal's body is built for its habitat. A polar bear has thick fur to stay warm. A camel can go a long time without water because the desert is dry.",
    qa: [
      { text: "What is a habitat?", answer: "The place where an animal lives" },
      { text: "Name three animals that live in a forest.", answer: "Bears, deer, and owls" },
      { text: "What is the desert like?", answer: "Hot and dry" },
      { text: "Name two animals that live in the desert.", answer: "Lizards and snakes" },
      { text: "What kind of water is in the ocean?", answer: "Salty" },
      { text: "Name two ocean animals.", answer: "Whales and dolphins" },
      { text: "What is the Arctic like?", answer: "Very cold and covered with ice" },
      { text: "What animal has thick fur to stay warm?", answer: "A polar bear" },
      { text: "Why can a camel survive in the desert?", answer: "It can go a long time without water" },
      { text: "What is built for an animal's habitat?", answer: "Its body" },
    ],
    gradeMin: 1, gradeMax: 3,
  },
  {
    title: "Food Chains",
    intro: "Read about how energy passes from one living thing to another.",
    body: "A FOOD CHAIN shows how energy moves from one living thing to another. Every food chain starts with the SUN. Plants are PRODUCERS — they use sunlight to make their own food. Animals that eat plants are called HERBIVORES, like rabbits and deer. Animals that eat other animals are called CARNIVORES, like wolves and hawks. Animals that eat both plants and other animals are called OMNIVORES, like bears and people. DECOMPOSERS, like mushrooms and worms, break down dead things and return nutrients to the soil so plants can grow again. A simple food chain could be: sun → grass → rabbit → fox.",
    qa: [
      { text: "What does a food chain show?", answer: "How energy moves from one living thing to another" },
      { text: "What does every food chain start with?", answer: "The sun" },
      { text: "What are plants called in a food chain?", answer: "Producers" },
      { text: "What do plants use to make food?", answer: "Sunlight" },
      { text: "What is an animal that eats only plants called?", answer: "An herbivore" },
      { text: "Name an herbivore from the story.", answer: "A rabbit or a deer" },
      { text: "What is an animal that eats only other animals called?", answer: "A carnivore" },
      { text: "What is an animal that eats both plants and animals called?", answer: "An omnivore" },
      { text: "What do decomposers do?", answer: "Break down dead things and return nutrients to the soil" },
      { text: "Give an example of a decomposer.", answer: "A mushroom or a worm" },
    ],
    gradeMin: 3, gradeMax: 5,
  },
  {
    title: "The Human Body — Major Systems",
    intro: "Read about how your body keeps you alive.",
    body: "Your body has many systems that work together. The SKELETAL system is your bones — they hold you up and protect organs like your brain and heart. The MUSCULAR system is your muscles — they pull on bones to move you. The CIRCULATORY system is your heart and blood vessels — your heart pumps blood that carries oxygen to every part of your body. The RESPIRATORY system is your lungs — they take in oxygen from the air and breathe out carbon dioxide. The DIGESTIVE system breaks down food in your stomach and intestines so your body can use it for energy. The NERVOUS system is your brain and nerves — it sends messages all over your body. All these systems work together every second of every day.",
    qa: [
      { text: "What system is made of bones?", answer: "The skeletal system" },
      { text: "What do bones do?", answer: "Hold you up and protect organs" },
      { text: "What system is made of muscles?", answer: "The muscular system" },
      { text: "What does the heart do?", answer: "Pumps blood" },
      { text: "What does blood carry?", answer: "Oxygen" },
      { text: "What do your lungs take in?", answer: "Oxygen" },
      { text: "What do your lungs breathe out?", answer: "Carbon dioxide" },
      { text: "Where is food broken down?", answer: "In the stomach and intestines" },
      { text: "What is the digestive system used for?", answer: "Breaking down food for energy" },
      { text: "What system sends messages all over your body?", answer: "The nervous system" },
    ],
    gradeMin: 3, gradeMax: 5,
  },
  // ── Round 2 ──────────────────────────────────────────────
  {
    title: "Day and Night",
    intro: "Read about why we have day and night.",
    body: "Earth is shaped like a giant ball, and it spins around once every 24 hours. The side of Earth facing the SUN has DAY. The side facing away from the Sun has NIGHT. The Sun does not actually move across the sky — Earth's spinning makes it look that way. We see the Sun rise in the EAST in the morning and set in the WEST in the evening. At night we can see the MOON and STARS because the Sun's bright light is on the other side of the planet. Earth keeps spinning, so day and night happen everywhere, just at different times.",
    qa: [
      { text: "What shape is Earth?", answer: "Like a giant ball" },
      { text: "How long does Earth take to spin once?", answer: "24 hours" },
      { text: "Which side of Earth has day?", answer: "The side facing the Sun" },
      { text: "Which side has night?", answer: "The side facing away from the Sun" },
      { text: "Does the Sun actually move across the sky?", answer: "No" },
      { text: "What direction does the Sun rise?", answer: "East" },
      { text: "What direction does the Sun set?", answer: "West" },
      { text: "What can we see in the night sky?", answer: "The Moon and stars" },
      { text: "Why can't we see the Sun at night?", answer: "It is on the other side of the planet" },
      { text: "Does day and night happen everywhere on Earth?", answer: "Yes" },
    ],
    gradeMin: 1, gradeMax: 3,
  },
  {
    title: "Magnets",
    intro: "Read about a special force called magnetism.",
    body: "A MAGNET is an object that can pull certain metals toward it without touching them. The pulling force is called MAGNETISM. Magnets only stick to a few metals — mostly IRON, STEEL, NICKEL, and COBALT. They do not stick to wood, plastic, glass, paper, or aluminum. Every magnet has two ends called POLES: a NORTH pole and a SOUTH pole. Opposite poles attract each other (a north pole and a south pole pull together). Same poles repel each other (two norths push apart). The Earth itself acts like a giant magnet, which is why a compass needle always points to the North Pole.",
    qa: [
      { text: "What is a magnet?", answer: "An object that can pull certain metals toward it" },
      { text: "What is the pulling force called?", answer: "Magnetism" },
      { text: "Name two metals magnets stick to.", answer: "Iron and steel" },
      { text: "Name something a magnet does NOT stick to.", answer: "Wood, plastic, glass, paper, or aluminum" },
      { text: "What are the two ends of a magnet called?", answer: "Poles" },
      { text: "What are the names of the two poles?", answer: "North and south" },
      { text: "What happens with opposite poles?", answer: "They attract" },
      { text: "What happens with same poles?", answer: "They repel" },
      { text: "What does Earth act like?", answer: "A giant magnet" },
      { text: "Why does a compass needle point north?", answer: "Because Earth acts like a giant magnet" },
    ],
    gradeMin: 2, gradeMax: 4,
  },
  {
    title: "Sound and How We Hear It",
    intro: "Read about what sound is.",
    body: "SOUND is made when something VIBRATES, or shakes back and forth very fast. When you pluck a guitar string, the string vibrates. The vibration pushes the air around it. The air carries the vibration in waves to your ears. Inside your ear, a small skin called the EARDRUM catches the wave and starts to vibrate too. Tiny bones pass the vibration to your brain, which understands it as sound. LOUD sounds have BIG vibrations; QUIET sounds have small ones. HIGH-PITCHED sounds (like a whistle) have FAST vibrations; LOW-PITCHED sounds (like a drum) have slow ones. Sound cannot travel through empty space — it needs air, water, or another material to carry the vibration.",
    qa: [
      { text: "What makes sound?", answer: "Something vibrating" },
      { text: "What does vibrate mean?", answer: "Shake back and forth very fast" },
      { text: "What carries sound to your ears?", answer: "Waves in the air" },
      { text: "What part of your ear catches the wave?", answer: "The eardrum" },
      { text: "What pass the vibration to your brain?", answer: "Tiny bones" },
      { text: "Do loud sounds have big or small vibrations?", answer: "Big" },
      { text: "What kind of vibrations make a high-pitched sound?", answer: "Fast" },
      { text: "What kind of vibrations make a low-pitched sound?", answer: "Slow" },
      { text: "Give an example of a high-pitched sound.", answer: "A whistle" },
      { text: "Can sound travel through empty space?", answer: "No" },
    ],
    gradeMin: 3, gradeMax: 5,
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
  // ── Added stories ────────────────────────────────────────
  {
    title: "Theo's Loose Tooth",
    intro: "Read about Theo's big day.",
    body: "Theo had a loose tooth that wiggled when he ate. On Tuesday morning at breakfast, he bit into a green apple and the tooth fell right out. Theo screamed, but his mom laughed and gave him a hug. She put the tiny tooth in a small plastic bag for safekeeping. At school, Theo showed his best friend Owen the gap in his smile. Owen said it looked cool. That night, Theo placed the tooth under his pillow. When he woke up Wednesday morning, the tooth was gone and a shiny silver dollar was in its place.",
    qa: [
      { text: "Whose tooth fell out?", answer: "Theo's" },
      { text: "What day did the tooth fall out?", answer: "Tuesday" },
      { text: "What was Theo eating when the tooth fell out?", answer: "A green apple" },
      { text: "What did Theo do when the tooth fell out?", answer: "Screamed" },
      { text: "What did his mom put the tooth in?", answer: "A small plastic bag" },
      { text: "Who is Theo's best friend?", answer: "Owen" },
      { text: "What did Owen say the gap looked like?", answer: "Cool" },
      { text: "Where did Theo put the tooth at night?", answer: "Under his pillow" },
      { text: "What day did Theo wake up to find the tooth gone?", answer: "Wednesday" },
      { text: "What did Theo find in place of the tooth?", answer: "A shiny silver dollar" },
    ],
    gradeMin: 1, gradeMax: 2,
  },
  {
    title: "The Field Trip to the Aquarium",
    intro: "Read about Ms. Park's class on a field trip.",
    body: "Ms. Park's third grade class took a field trip to the city aquarium on a rainy Friday in April. There were 22 students. Every student wore a bright yellow shirt so they were easy to spot. At the aquarium, they saw three things they would never forget: a giant sea turtle named Goliath, a tank full of jellyfish that glowed blue, and a sharks-and-stingrays tunnel where you could walk underneath the water. The class ate lunch in a picnic area near the gift shop. Most kids bought a postcard or a stuffed octopus. On the bus ride home, every single student fell asleep — even the loud ones.",
    qa: [
      { text: "Whose class went on the field trip?", answer: "Ms. Park's" },
      { text: "What grade was the class?", answer: "Third grade" },
      { text: "Where did they go?", answer: "To the city aquarium" },
      { text: "What month was the trip?", answer: "April" },
      { text: "What was the weather like?", answer: "Rainy" },
      { text: "How many students were on the trip?", answer: "22" },
      { text: "What color shirts did the students wear?", answer: "Bright yellow" },
      { text: "What was the giant sea turtle's name?", answer: "Goliath" },
      { text: "What color did the jellyfish glow?", answer: "Blue" },
      { text: "What happened to the students on the bus ride home?", answer: "Every one of them fell asleep" },
    ],
    gradeMin: 2, gradeMax: 3,
  },
  {
    title: "The Soccer Tryouts",
    intro: "Read about Priya's big chance.",
    body: "Priya had wanted to make the school soccer team since she was in second grade. Now she was in fifth, and tryouts were finally here. She practiced in her backyard every night for two weeks before the tryouts began. On the morning of the tryout, she ate oatmeal and a banana for breakfast — her dad said it was 'fuel' for her muscles. When she got to the field, fifty kids were already there. Coach Diaz blew her whistle and the drills began: dribbling, passing, sprinting, and finally a scrimmage game. Priya scored two goals in the scrimmage. Three days later, the coach posted the team list outside the gym. Priya's name was on it. She called her dad right away and yelled, 'I MADE IT!' so loud that her dad had to hold the phone away from his ear.",
    qa: [
      { text: "What sport did Priya want to play?", answer: "Soccer" },
      { text: "Since what grade did Priya want to make the team?", answer: "Second grade" },
      { text: "What grade is Priya in now?", answer: "Fifth" },
      { text: "How long did she practice before tryouts?", answer: "Two weeks" },
      { text: "What did Priya eat for breakfast on tryout day?", answer: "Oatmeal and a banana" },
      { text: "What did Priya's dad call her breakfast?", answer: "Fuel" },
      { text: "How many kids were at the tryouts?", answer: "Fifty" },
      { text: "What is the coach's name?", answer: "Coach Diaz" },
      { text: "How many goals did Priya score in the scrimmage?", answer: "Two" },
      { text: "How many days later was the team list posted?", answer: "Three days" },
    ],
    gradeMin: 4, gradeMax: 5,
  },
  // ── Round 2 of added stories ─────────────────────────────
  {
    title: "The Puddle on the Way to School",
    intro: "Read about a small thing that turned into a big mess.",
    body: "On a foggy Wednesday morning, Eli walked to school in new white sneakers. His mom had warned him to walk around any puddles. Halfway to school, he saw the biggest puddle he had ever seen — it took up the whole sidewalk. Eli decided to jump it. He took five running steps, leaped, and landed exactly in the middle. Brown water splashed up to his knees. His sneakers turned the color of mud. When he got to class, his teacher Mrs. Hill laughed kindly and lent him an old pair of gym shoes. Eli rinsed his sneakers in the bathroom sink. They never went back to perfect white again, but they were still his favorite.",
    qa: [
      { text: "What is the boy's name?", answer: "Eli" },
      { text: "What day was it?", answer: "Wednesday" },
      { text: "What was the weather like?", answer: "Foggy" },
      { text: "What color were Eli's new sneakers?", answer: "White" },
      { text: "What did Eli's mom warn him about?", answer: "Puddles" },
      { text: "How many running steps did Eli take?", answer: "Five" },
      { text: "Where did the splash reach?", answer: "His knees" },
      { text: "Who is Eli's teacher?", answer: "Mrs. Hill" },
      { text: "What did Mrs. Hill lend him?", answer: "An old pair of gym shoes" },
      { text: "Did the sneakers go back to perfect white?", answer: "No" },
    ],
    gradeMin: 1, gradeMax: 2,
  },
  {
    title: "Grandma's Pancake Recipe",
    intro: "Read about a special Saturday tradition.",
    body: "Every Saturday morning, Mei and her grandmother make pancakes together. The recipe came from Grandma's mother in Taiwan, written on a yellow index card that is now soft and faded. They mix two cups of flour, two tablespoons of sugar, one teaspoon of baking powder, and a pinch of salt in a big blue bowl. Then Mei cracks the egg — sometimes the shell falls in and they have to fish it out with a spoon. They pour in milk and a splash of vanilla. The secret ingredient is a small mashed banana, which makes the pancakes sweeter than any other recipe Mei has tried. Grandma flips the pancakes high in the air, but Mei is still learning. They eat them with warm maple syrup at the kitchen table while it is still dark outside.",
    qa: [
      { text: "What do Mei and her grandmother make every Saturday?", answer: "Pancakes" },
      { text: "What country is the recipe from?", answer: "Taiwan" },
      { text: "What color is the index card?", answer: "Yellow" },
      { text: "How many cups of flour go in?", answer: "Two" },
      { text: "What color is the mixing bowl?", answer: "Blue" },
      { text: "What does Mei sometimes drop in by accident?", answer: "The eggshell" },
      { text: "What is the secret ingredient?", answer: "A small mashed banana" },
      { text: "What does the banana make the pancakes?", answer: "Sweeter" },
      { text: "Who flips the pancakes high in the air?", answer: "Grandma" },
      { text: "What do they eat the pancakes with?", answer: "Warm maple syrup" },
    ],
    gradeMin: 2, gradeMax: 3,
  },
  {
    title: "The Mystery of the Missing Library Book",
    intro: "Read this short mystery.",
    body: "Ms. Carter the librarian discovered that the most popular book in the school library — Captain Comet and the Crater Caper — was missing from the shelf. She had loaned it to Jordan last Friday, and Jordan had returned it Monday morning. But by Tuesday lunch, the book was gone. Ms. Carter checked the cart, the return bin, and even her own desk. Then she remembered that Mr. Diaz, the music teacher, had borrowed three books that morning. She walked down to the music room. There, on the piano, sat all three books — including Captain Comet. Mr. Diaz had grabbed the wrong one by accident. He apologized, and Ms. Carter put the book back on its proper shelf, where Lila checked it out for the weekend.",
    qa: [
      { text: "Who is the librarian?", answer: "Ms. Carter" },
      { text: "What is the name of the missing book?", answer: "Captain Comet and the Crater Caper" },
      { text: "Who had it last Friday?", answer: "Jordan" },
      { text: "When did Jordan return it?", answer: "Monday morning" },
      { text: "When was the book noticed missing?", answer: "Tuesday lunch" },
      { text: "Name two places Ms. Carter checked.", answer: "The cart and the return bin" },
      { text: "What does Mr. Diaz teach?", answer: "Music" },
      { text: "How many books did Mr. Diaz borrow that morning?", answer: "Three" },
      { text: "Where were the books found?", answer: "On the piano" },
      { text: "Who checked the book out for the weekend?", answer: "Lila" },
    ],
    gradeMin: 3, gradeMax: 5,
  },
  {
    title: "The Storm That Took Out the Power",
    intro: "Read about a long night with no electricity.",
    body: "On a Thursday night in October, a powerful storm rolled across town. Wind shook the trees and rain hammered the roof. At 8:47 p.m., the lights flickered twice and then went out. Sofia and her little brother Marco ran to find their mom in the kitchen. She was already lighting candles she kept in a drawer for emergencies. The whole family — including their black cat Pepper — gathered in the living room. They could not watch TV or play video games, so Marco suggested they tell stories instead. Sofia told a true story about her field trip to the aquarium. Mom told one about growing up in Mexico. Marco's story was about a dragon, and it was wonderfully silly. The power did not come back until 6:30 the next morning, but Sofia later said it was one of her favorite nights ever.",
    qa: [
      { text: "What month was the storm?", answer: "October" },
      { text: "What day of the week did it happen?", answer: "Thursday" },
      { text: "What time did the power go out?", answer: "8:47 p.m." },
      { text: "What is the little brother's name?", answer: "Marco" },
      { text: "What is the older sister's name?", answer: "Sofia" },
      { text: "Where did Mom keep the candles?", answer: "In a drawer" },
      { text: "What is the cat's name?", answer: "Pepper" },
      { text: "Who suggested telling stories?", answer: "Marco" },
      { text: "What was Marco's story about?", answer: "A dragon" },
      { text: "What time did the power come back?", answer: "6:30 the next morning" },
    ],
    gradeMin: 3, gradeMax: 5,
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
  // ── Added topics ─────────────────────────────────────────
  {
    title: "Commas in a List",
    intro: "Read about how to use commas in a list.",
    body: "When you write a list of three or more things, you use commas to separate them. The comma tells the reader to take a tiny pause. Look at this sentence: 'I packed apples, sandwiches, and juice for the picnic.' There is a comma after 'apples' and a comma after 'sandwiches.' The word 'and' comes before the last item. If you only have two things, you do NOT use a comma — just write 'apples and juice.' Commas in a list make your writing clearer and easier to read.",
    qa: [
      { text: "What do you use to separate items in a list?", answer: "Commas" },
      { text: "How many items do you need before using list commas?", answer: "Three or more" },
      { text: "What word usually comes before the last item?", answer: "And" },
      { text: "Do you use a comma for only two things?", answer: "No" },
      { text: "In 'apples, sandwiches, and juice,' how many commas are there?", answer: "Two" },
      { text: "What does the comma tell the reader to do?", answer: "Take a tiny pause" },
      { text: "Why do we use commas in a list?", answer: "To make writing clearer and easier to read" },
      { text: "Do you need a comma in 'apples and juice'?", answer: "No" },
    ],
    gradeMin: 2, gradeMax: 4,
  },
  {
    title: "Apostrophes: Contractions and Possession",
    intro: "Read about the two main jobs of an apostrophe.",
    body: "An apostrophe ( ' ) has two jobs. Job 1: CONTRACTIONS. An apostrophe takes the place of missing letters when we squish two words together. 'Do not' becomes 'don't' — the apostrophe replaces the 'o' in 'not.' 'I am' becomes 'I'm.' 'It is' becomes 'it's.' Job 2: POSSESSION. An apostrophe shows that something belongs to someone. 'Maya's book' means the book belongs to Maya. For a singular owner, add 's: the dog's bowl. For plural owners that end in s, add only an apostrophe: the dogs' bowls (many dogs). Watch out: 'its' shows possession with NO apostrophe, but 'it's' is the contraction for 'it is.'",
    qa: [
      { text: "How many main jobs does an apostrophe have?", answer: "Two" },
      { text: "What is the first job of an apostrophe?", answer: "Contractions" },
      { text: "What is 'do not' as a contraction?", answer: "Don't" },
      { text: "What letter does the apostrophe replace in 'don't'?", answer: "The o" },
      { text: "What is 'I am' as a contraction?", answer: "I'm" },
      { text: "What is the second job of an apostrophe?", answer: "Possession" },
      { text: "What does 'Maya's book' mean?", answer: "The book belongs to Maya" },
      { text: "How do you show one dog owns a bowl?", answer: "The dog's bowl" },
      { text: "Does 'its' (possession) have an apostrophe?", answer: "No" },
      { text: "What does 'it's' (with apostrophe) mean?", answer: "It is" },
    ],
    gradeMin: 3, gradeMax: 5,
  },
  // ── Round 2 ──────────────────────────────────────────────
  {
    title: "Quotation Marks for Talking",
    intro: "Read about how to show somebody is speaking.",
    body: "When you write what a person says out loud, you put their words inside QUOTATION MARKS. Quotation marks look like this: \" \". They go at the START and END of the spoken words. Example: Maya said, \"I love pancakes.\" The comma comes BEFORE the first quotation mark, and the period (or exclamation point or question mark) goes INSIDE the closing quotation mark. If the speaking part comes second, write the spoken words first: \"I love pancakes,\" said Maya. Always start a new line every time a different person starts talking. This makes it easy for the reader to keep track of who is speaking.",
    qa: [
      { text: "What punctuation shows that someone is speaking?", answer: "Quotation marks" },
      { text: "Where do quotation marks go?", answer: "At the start and end of the spoken words" },
      { text: "Where does the period go?", answer: "Inside the closing quotation mark" },
      { text: "What punctuation comes before the first quotation mark in 'Maya said,'?", answer: "A comma" },
      { text: "Should you start a new line when a new person speaks?", answer: "Yes" },
      { text: "Why do we start a new line for each new speaker?", answer: "So the reader can keep track of who is speaking" },
      { text: "Can a question mark go inside quotation marks?", answer: "Yes" },
      { text: "Can an exclamation point go inside quotation marks?", answer: "Yes" },
    ],
    gradeMin: 3, gradeMax: 5,
  },
  {
    title: "Subject and Predicate",
    intro: "Read about the two main parts of every sentence.",
    body: "Every complete sentence has TWO main parts: a SUBJECT and a PREDICATE. The SUBJECT tells WHO or WHAT the sentence is about. The PREDICATE tells what the subject IS or DOES. Example: 'The big brown dog | barked at the mail truck.' The subject is 'the big brown dog' and the predicate is 'barked at the mail truck.' Every predicate must contain a VERB — an action or being word. If a sentence is missing a subject or a predicate, it is called a FRAGMENT — and a fragment is not a complete sentence.",
    qa: [
      { text: "How many main parts does every sentence have?", answer: "Two" },
      { text: "What are the two main parts called?", answer: "Subject and predicate" },
      { text: "What does the subject tell?", answer: "Who or what the sentence is about" },
      { text: "What does the predicate tell?", answer: "What the subject is or does" },
      { text: "In 'The big brown dog barked,' what is the subject?", answer: "The big brown dog" },
      { text: "In 'The big brown dog barked,' what is the predicate?", answer: "Barked at the mail truck" },
      { text: "What must every predicate contain?", answer: "A verb" },
      { text: "What is a sentence missing a subject or predicate called?", answer: "A fragment" },
      { text: "Is a fragment a complete sentence?", answer: "No" },
      { text: "What is a verb?", answer: "An action or being word" },
    ],
    gradeMin: 3, gradeMax: 5,
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
  // ── Added topics ─────────────────────────────────────────
  {
    title: "Long Vowel Teams: ai, ay, ee, ea",
    intro: "Read about long vowel teams.",
    body: "Two vowels next to each other can team up to make one long vowel sound. The team AI makes the long A sound, as in 'rain' and 'mail.' The team AY also makes the long A sound, usually at the end of a word, as in 'play' and 'day.' The team EE makes the long E sound, as in 'tree' and 'sheep.' The team EA also makes the long E sound, as in 'beach' and 'leaf.' Quick rule: 'When two vowels go walking, the first one does the talking.' That means the first vowel says its long-vowel name and the second one is silent.",
    qa: [
      { text: "How do you spell the word that means a falling water sound?", answer: "rain" },
      { text: "What vowel team is in 'rain'?", answer: "ai" },
      { text: "What sound does 'ai' make?", answer: "Long A" },
      { text: "What vowel team is usually at the END of a word for long A?", answer: "ay" },
      { text: "How do you spell the word that means a tall plant with leaves?", answer: "tree" },
      { text: "What vowel team is in 'tree'?", answer: "ee" },
      { text: "What sound does 'ea' make in 'beach'?", answer: "Long E" },
      { text: "How do you spell the word that means a place with sand and water?", answer: "beach" },
      { text: "In the rhyme, which vowel 'does the talking'?", answer: "The first one" },
      { text: "Which vowel is silent in a vowel team?", answer: "The second one" },
    ],
    gradeMin: 1, gradeMax: 3,
  },
  {
    title: "Common Homophones: their / there / they're",
    intro: "Read about three words that sound the same but mean different things.",
    body: "HOMOPHONES are words that sound the same but are spelled differently and mean different things. Three tricky homophones are 'their,' 'there,' and 'they're.' THEIR shows that something belongs to a group of people — 'That is their dog.' THERE is a place, like 'over there by the door,' or it starts a sentence about something existing — 'There is a cat in the yard.' THEY'RE is a contraction for 'they are' — 'They're running fast.' Memory trick: if you can replace it with 'they are,' use they're. If it's about a place, use there. If it shows ownership, use their.",
    qa: [
      { text: "What are homophones?", answer: "Words that sound the same but are spelled differently" },
      { text: "Which spelling shows ownership?", answer: "their" },
      { text: "Which spelling means a place?", answer: "there" },
      { text: "Which spelling is a contraction?", answer: "they're" },
      { text: "What does 'they're' stand for?", answer: "They are" },
      { text: "Which spelling fits: 'That is ___ dog'?", answer: "their" },
      { text: "Which spelling fits: 'Over ___ by the door'?", answer: "there" },
      { text: "Which spelling fits: '___ running fast'?", answer: "they're" },
      { text: "How can you tell if you should use 'they're'?", answer: "If you can replace it with 'they are'" },
      { text: "How can you tell if you should use 'there'?", answer: "If it's about a place" },
    ],
    gradeMin: 3, gradeMax: 5,
  },
  // ── Round 2 ──────────────────────────────────────────────
  {
    title: "Compound Words",
    intro: "Read about words made of two smaller words.",
    body: "A COMPOUND WORD is one big word made by joining two smaller words together. The meaning of the compound word usually comes from the two parts. For example, 'sunlight' is 'sun' + 'light' = the light that comes from the sun. Other examples: 'football' (foot + ball), 'rainbow' (rain + bow), 'butterfly' (butter + fly), 'classroom' (class + room), 'backpack' (back + pack), 'snowman' (snow + man), and 'birthday' (birth + day). When you see a long word, try splitting it into two — you may discover it's a compound. Compound words are spelled with NO space and NO hyphen between the two parts.",
    qa: [
      { text: "What is a compound word?", answer: "One big word made by joining two smaller words" },
      { text: "What two words make 'sunlight'?", answer: "Sun and light" },
      { text: "What two words make 'football'?", answer: "Foot and ball" },
      { text: "What two words make 'rainbow'?", answer: "Rain and bow" },
      { text: "What two words make 'butterfly'?", answer: "Butter and fly" },
      { text: "What two words make 'classroom'?", answer: "Class and room" },
      { text: "What two words make 'backpack'?", answer: "Back and pack" },
      { text: "What two words make 'snowman'?", answer: "Snow and man" },
      { text: "Are compound words spelled with a space?", answer: "No" },
      { text: "Are compound words spelled with a hyphen?", answer: "No" },
    ],
    gradeMin: 1, gradeMax: 3,
  },
  {
    title: "Prefixes: un-, re-, pre-, dis-",
    intro: "Read about little word parts that change a word's meaning.",
    body: "A PREFIX is a small group of letters added to the BEGINNING of a word that changes its meaning. UN- means 'not' or 'opposite of': unhappy = not happy, unlock = the opposite of lock. RE- means 'again': redo = do again, reread = read again. PRE- means 'before': preview = view before, preheat = heat before. DIS- often means 'not' or 'opposite of': disagree = not agree, dishonest = not honest. Knowing prefixes helps you figure out what a new word means even if you've never seen it before.",
    qa: [
      { text: "What is a prefix?", answer: "A small group of letters added to the beginning of a word" },
      { text: "What does 'un-' mean?", answer: "Not, or the opposite of" },
      { text: "What does 'unhappy' mean?", answer: "Not happy" },
      { text: "What does 're-' mean?", answer: "Again" },
      { text: "What does 'redo' mean?", answer: "Do again" },
      { text: "What does 'pre-' mean?", answer: "Before" },
      { text: "What does 'preview' mean?", answer: "View before" },
      { text: "What does 'dis-' often mean?", answer: "Not, or the opposite of" },
      { text: "What does 'disagree' mean?", answer: "Not agree" },
      { text: "Why are prefixes useful?", answer: "They help you figure out what a new word means" },
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
  // ── Added topics ─────────────────────────────────────────
  {
    title: "Self-Advocacy: Asking for What You Need",
    intro: "Read about how to speak up for yourself.",
    body: "SELF-ADVOCACY means speaking up for what you need, in a kind and clear way. Everyone needs help sometimes — that doesn't mean you're weak, it means you're smart enough to ask. To self-advocate well, follow three steps. STEP 1: Notice what you need (a break, a quieter spot, a different pencil, more time). STEP 2: Find the right person to ask (a teacher, a parent, a friend, a counselor). STEP 3: Use polite words and explain why. Example: 'Mrs. Park, can I take a 5-minute break? My brain feels foggy and a quick walk would help me focus.' Self-advocacy works at school, at home, and with friends. The more you practice, the easier it gets.",
    qa: [
      { text: "What does self-advocacy mean?", answer: "Speaking up for what you need" },
      { text: "How should you speak up — in what kind of way?", answer: "Kind and clear" },
      { text: "Does asking for help mean you're weak?", answer: "No" },
      { text: "How many steps are in good self-advocacy?", answer: "Three" },
      { text: "What is Step 1?", answer: "Notice what you need" },
      { text: "What is Step 2?", answer: "Find the right person to ask" },
      { text: "What is Step 3?", answer: "Use polite words and explain why" },
      { text: "Name one thing you might need a break from in the story.", answer: "A foggy brain (or to focus)" },
      { text: "Where does self-advocacy work?", answer: "At school, at home, and with friends" },
      { text: "How do you get better at self-advocacy?", answer: "Practice" },
    ],
    gradeMin: 3, gradeMax: 5,
  },
  {
    title: "Honesty and Telling the Truth",
    intro: "Read about why honesty matters.",
    body: "Being HONEST means telling the truth even when it's hard. People trust honest people. If you break something by accident, telling the truth is brave. You might feel scared, but adults usually appreciate honesty more than the broken thing. LIES can grow — one lie often leads to more lies to cover the first one. That's called a 'snowball.' If you DID lie and want to fix it, you can use these three steps. ONE: Take a deep breath. TWO: Say 'I have to tell you the truth — I was not honest before.' THREE: Tell what really happened. People may be a little upset at first, but they will trust you more for owning up to it.",
    qa: [
      { text: "What does it mean to be honest?", answer: "Telling the truth even when it's hard" },
      { text: "What do honest people earn?", answer: "Trust" },
      { text: "Is it brave to tell the truth after an accident?", answer: "Yes" },
      { text: "What do lies often do?", answer: "Grow into more lies" },
      { text: "What is the nickname for one lie leading to more?", answer: "A snowball" },
      { text: "How many steps are there to fix a lie?", answer: "Three" },
      { text: "What is Step 1?", answer: "Take a deep breath" },
      { text: "What is Step 2?", answer: "Say 'I have to tell you the truth'" },
      { text: "What is Step 3?", answer: "Tell what really happened" },
      { text: "Why will people trust you more after owning up?", answer: "Because you were honest" },
    ],
    gradeMin: 2, gradeMax: 5,
  },
  {
    title: "Perseverance: When Something Is Hard",
    intro: "Read about not giving up.",
    body: "PERSEVERANCE means to keep trying when something is hard. It does NOT mean you never feel frustrated — it means you don't quit just because you feel frustrated. Think about learning to ride a bike. The first time, you probably fell. Maybe you fell ten times. But each fall taught your body a little more about balance, and one day you rode all the way down the sidewalk. That's perseverance. When you feel like giving up, try one of these tricks: take a break and come back, ask for help, break the big task into smaller pieces, or remind yourself how good it will feel when you finish. Hard things make our brains grow. Every time you stick with something hard, you are getting smarter and stronger.",
    qa: [
      { text: "What does perseverance mean?", answer: "Keep trying when something is hard" },
      { text: "Does perseverance mean you never feel frustrated?", answer: "No" },
      { text: "What example does the story use to explain perseverance?", answer: "Learning to ride a bike" },
      { text: "What did each fall teach your body?", answer: "About balance" },
      { text: "Name one trick for when you feel like giving up.", answer: "Take a break, ask for help, break the task into smaller pieces, or remind yourself how good it will feel when you finish" },
      { text: "Why is breaking a big task into pieces helpful?", answer: "It makes the hard thing easier to start" },
      { text: "What do hard things do to our brains?", answer: "Make them grow" },
      { text: "What two things does sticking with something hard make you?", answer: "Smarter and stronger" },
      { text: "Is it okay to ask for help and still call it perseverance?", answer: "Yes" },
      { text: "What is the opposite of perseverance?", answer: "Quitting" },
    ],
    gradeMin: 2, gradeMax: 5,
  },
  // ── Round 2 ──────────────────────────────────────────────
  {
    title: "Listening: Whole-Body Listening",
    intro: "Read about how to be a great listener.",
    body: "Listening is more than just hearing — it's using your WHOLE BODY to show someone you're paying attention. Whole-body listening has five parts. EYES on the speaker. EARS open and quiet. MOUTH closed (no talking over the other person). HANDS still (not playing with stuff). BRAIN thinking about what's being said. When you listen this way, the speaker feels respected and you actually understand more. Hard truth: listening is a skill — even adults are still working on it. The good news is that every conversation is practice.",
    qa: [
      { text: "Is listening more than just hearing?", answer: "Yes" },
      { text: "What kind of listening does the story describe?", answer: "Whole-body listening" },
      { text: "How many parts are there to whole-body listening?", answer: "Five" },
      { text: "What should your eyes do?", answer: "Look at the speaker" },
      { text: "What should your ears do?", answer: "Be open and quiet" },
      { text: "What should your mouth do?", answer: "Stay closed" },
      { text: "What should your hands do?", answer: "Stay still" },
      { text: "What should your brain do?", answer: "Think about what's being said" },
      { text: "How does the speaker feel when you listen with your whole body?", answer: "Respected" },
      { text: "Is listening a skill?", answer: "Yes" },
    ],
    gradeMin: 1, gradeMax: 4,
  },
  {
    title: "Personal Space and Boundaries",
    intro: "Read about an invisible bubble around every person.",
    body: "Imagine every person walks around inside an invisible BUBBLE called PERSONAL SPACE. The bubble keeps people comfortable — about an arm's length away in most places. Standing too close can make others feel uncomfortable, even if you're being friendly. A BOUNDARY is a rule a person has about how they want to be treated. 'Please don't touch my hair' is a boundary. 'I don't like being tickled' is a boundary. We respect other people's boundaries by listening the FIRST time they ask. We also have the right to set our own boundaries — saying 'stop' is okay, and the other person should listen.",
    qa: [
      { text: "What is the invisible bubble around a person called?", answer: "Personal space" },
      { text: "About how big is most people's personal space?", answer: "An arm's length" },
      { text: "How does standing too close make people feel?", answer: "Uncomfortable" },
      { text: "What is a boundary?", answer: "A rule about how a person wants to be treated" },
      { text: "Give an example of a boundary from the story.", answer: "Please don't touch my hair, or I don't like being tickled" },
      { text: "How many times should you have to ask someone to stop?", answer: "Just one — they should listen the first time" },
      { text: "Do we have the right to set our own boundaries?", answer: "Yes" },
      { text: "Is saying 'stop' okay?", answer: "Yes" },
      { text: "What should the other person do when you say 'stop'?", answer: "Listen" },
      { text: "How do we respect other people's boundaries?", answer: "By listening the first time they ask" },
    ],
    gradeMin: 1, gradeMax: 5,
  },
  {
    title: "Gratitude: Noticing the Good",
    intro: "Read about a small habit that grows happiness.",
    body: "GRATITUDE is the feeling of being thankful for something good in your life. It can be big (a family member, a pet) or small (a sunny day, your favorite snack). Scientists have studied gratitude and found that people who notice good things on purpose feel HAPPIER and SLEEP BETTER. One easy way to practice is the 'three good things' habit: every night before bed, name three good things from your day. They don't have to be huge. 'I had pizza for lunch' counts. 'My friend laughed at my joke' counts. Over time, your brain gets better at noticing the good — even on hard days.",
    qa: [
      { text: "What is gratitude?", answer: "The feeling of being thankful for something good" },
      { text: "Can gratitude be for small things?", answer: "Yes" },
      { text: "Give an example of a big thing to be grateful for.", answer: "A family member or a pet" },
      { text: "Give an example of a small thing.", answer: "A sunny day or your favorite snack" },
      { text: "Who has studied gratitude?", answer: "Scientists" },
      { text: "Name one thing scientists found about people who notice good things.", answer: "They feel happier and sleep better" },
      { text: "What is the easy gratitude habit called?", answer: "Three good things" },
      { text: "When do you do the three-good-things habit?", answer: "Every night before bed" },
      { text: "How many good things do you name?", answer: "Three" },
      { text: "What does your brain get better at over time?", answer: "Noticing the good" },
    ],
    gradeMin: 2, gradeMax: 5,
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

function pickTopic(bank: LocalTopic[], goal: string, grade?: string, excludeTitles?: Set<string>): LocalTopic {
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
  // Drop already-used titles. If everything in the in-grade pool is
  // exhausted, fall back to the full in-grade pool (still better than
  // crashing on a 30-kid pack with only 6 in-grade topics).
  if (excludeTitles && excludeTitles.size > 0) {
    const fresh = pool.filter((t) => !excludeTitles.has(t.title));
    if (fresh.length > 0) pool = fresh;
  }
  // Goal-string match within the (filtered) pool — lets a teacher
  // type "vowels" or "fractions" and steer to a matching topic.
  if (goal) {
    const gLower = goal.toLowerCase();
    const matched = pool.find((t) => t.title.toLowerCase().includes(gLower) || t.body.toLowerCase().includes(gLower));
    if (matched) return matched;
  }
  return pool[Math.floor(Math.random() * pool.length)];
}

export function buildLocalLesson(opts: { subject: Subject; grade: string; count: number; difficulty: string; goal: string; excludeTitles?: Set<string> }): { questions: StarQuestion[]; lesson: Lesson; topicTitle?: string } {
  const { subject, count, difficulty, goal, excludeTitles } = opts;

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

  const topic = pickTopic(bank, goal, opts.grade, excludeTitles);

  // CORRELATION RULE: only pull questions from the picked topic's own qa.
  // Cross-topic borrowing was leaving kids with a story about Maya's
  // Garden and questions about a different kid's backpack — answers
  // nowhere in the displayed body. If the topic doesn't have enough
  // unique QAs, we ship fewer questions (cleaner than a wrong story).
  const seen = new Set<string>();
  const pool: Array<{ text: string; answer: string }> = [];
  for (const q of topic.qa) {
    const key = q.text.trim().toLowerCase();
    if (!seen.has(key)) { seen.add(key); pool.push({ text: q.text, answer: q.answer }); }
  }
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

  return { questions, lesson, topicTitle: topic.title };
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
