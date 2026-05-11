// IEP-aligned assignment generator. Pick a kid → pick one of their
// IEP goals → mint a barcoded worksheet or quiz tied to that goal.
//
// When the resulting barcode is scanned in /star and graded, the
// GradebookModal auto-logs an IepLogEntry (Met / Partial / Not yet)
// based on the score, so every IEP-aligned assignment doubles as
// progress data for the SEIF report.
//
// The print template carries a "🎯 IEP focus" banner with the goal
// area + text snapshot so parents/case managers see what's being
// practiced — matches the Universal Design for Learning standard.

import { useMemo, useState } from "react";
import {
  StarStore, saveAll, nextBarcode,
  type StarStudent, type IepGoal, type Subject, type StarQuestion,
  type BcEntry, type StarTrackerEntry,
} from "../../lib/star/storage.ts";
import { bc128svg } from "../../lib/star/barcode.ts";
import { successBeep, errorBeep, loggedBeep } from "../../lib/star/sounds.ts";
import { pushBarcodeToServer } from "../../lib/star/barcodeRelay.ts";
import { buildLocalLesson } from "./AssignmentGenerator.tsx";

const COUNTS = [5, 8, 10, 15];
const DIFFICULTIES = ["Easy", "Medium", "Hard"] as const;
type Difficulty = typeof DIFFICULTIES[number];
type Format = "worksheet" | "quiz" | "reflection";

interface Result {
  barcode: string;
  studentName: string;
  goal: IepGoal;
  questions: StarQuestion[];
  lesson: any;
  subject: Subject;
  format: Format;
  grade: string;
}

export default function IepAssignmentGenerator() {
  const [students] = useState<StarStudent[]>(() => StarStore.getStudents());
  const [allGoals] = useState<IepGoal[]>(() => StarStore.getIepGoals());
  const [studentId, setStudentId] = useState<string>("");
  const [goalId, setGoalId] = useState<string>("");
  const [format, setFormat] = useState<Format>("worksheet");
  const [count, setCount] = useState<number>(10);
  const [difficulty, setDifficulty] = useState<Difficulty>("Medium");
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<Result | null>(null);

  const studentsWithGoals = useMemo(() => {
    const set = new Set(allGoals.map((g) => g.studentId));
    return students.filter((s) => set.has(s.id));
  }, [students, allGoals]);

  const studentGoals = useMemo(
    () => allGoals.filter((g) => g.studentId === studentId),
    [allGoals, studentId]
  );
  const goal = studentGoals.find((g) => g.id === goalId);

  // When goal changes, infer best format for it.
  const onPickGoal = (g: IepGoal) => {
    setGoalId(g.id);
    const inferred = inferFormatFromGoal(g);
    setFormat(inferred);
  };

  const onPickStudent = (sid: string) => {
    setStudentId(sid);
    const first = allGoals.find((g) => g.studentId === sid);
    if (first) {
      setGoalId(first.id);
      setFormat(inferFormatFromGoal(first));
    } else {
      setGoalId("");
    }
  };

  const generate = async () => {
    if (!studentId || !goal) { errorBeep(); return; }
    const s = students.find((x) => x.id === studentId);
    if (!s) { errorBeep(); return; }
    setBusy(true);
    try {
      const subject = inferSubject(goal);
      const grade = s.grade || "3rd";
      let questions: StarQuestion[] = [];
      let lesson: any = null;

      if (format === "reflection") {
        questions = buildReflectionQuestions(goal, count);
      } else if (format === "quiz") {
        const { generateQuizForArea } = await import("./QuizGenerator.tsx").then(
          () => ({ generateQuizForArea: buildQuizForGoal })
        );
        questions = generateQuizForArea(goal, subject, count, difficulty, grade);
      } else {
        // worksheet — open response. Reuse the existing local lesson builder.
        const built = buildLocalLesson({
          subject, grade, count, difficulty,
          goal: `${goal.area ? goal.area + " — " : ""}${goal.goalText}`,
        });
        questions = built.questions;
        lesson = built.lesson;
      }

      const studentName = `${s.firstName} ${s.lastName}`.trim();
      const bcDB = StarStore.getBcDB();
      const tracker = StarStore.getAsnTrack();
      const barcode = nextBarcode("AS", bcDB);
      const name = `🎯 ${goal.area || "IEP"} · ${studentName} (${formatLabel(format)})`;

      const entry: BcEntry = {
        id: barcode, type: "assignment",
        name, subject, gradeLevel: grade,
        studentName, studentId,
        questions, lesson,
        createdDate: new Date().toISOString(),
        iepGoalId: goal.id,
        iepGoalArea: goal.area,
        iepGoalText: goal.goalText,
      };
      bcDB[barcode] = entry;
      tracker[barcode] = {
        id: barcode, name, subject, gradeLevel: grade,
        studentName, studentId,
        questions, lesson,
        createdDate: new Date().toISOString(),
        status: "assigned", submissions: [],
        iepGoalId: goal.id, iepGoalArea: goal.area, iepGoalText: goal.goalText,
      };
      saveAll({ bcDB, asnTracker: tracker });
      pushBarcodeToServer(entry);
      successBeep();
      setCreated({ barcode, studentName, goal, questions, lesson, subject, format, grade });
    } finally {
      setBusy(false);
    }
  };

  const print = () => {
    if (!created) return;
    openIepPrintWindow(created);
    loggedBeep();
  };

  return (
    <div style={{ color: "#f5f1e8" }}>
      {/* No-data hint */}
      {studentsWithGoals.length === 0 && (
        <div style={hint()}>
          No students have IEP goals yet. Open <b style={{ color: "#fce7f3" }}>Settings → 🎯 IEP Goals</b> first
          (or hit "Load my class goals" to bulk-import).
        </div>
      )}

      {studentsWithGoals.length > 0 && (
        <>
          <div style={{
            display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
            gap: 10, marginBottom: 14,
          }}>
            <Field label="Student (only kids with goals)">
              <select value={studentId} onChange={(e) => onPickStudent(e.target.value)} style={inp()}>
                <option value="">— Pick a student —</option>
                {studentsWithGoals.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.firstName} {s.lastName} {s.grade ? `(${s.grade})` : ""}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Format">
              <select value={format} onChange={(e) => setFormat(e.target.value as Format)} style={inp()}>
                <option value="worksheet">📝 Worksheet (open response)</option>
                <option value="quiz">🎯 Quiz (multiple choice)</option>
                <option value="reflection">💭 Reflection (behavior / SEL)</option>
              </select>
            </Field>
            <Field label="Questions">
              <select value={count} onChange={(e) => setCount(Number(e.target.value))} style={inp()}>
                {COUNTS.map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </Field>
            <Field label="Difficulty">
              <select
                value={difficulty}
                onChange={(e) => setDifficulty(e.target.value as Difficulty)}
                disabled={format === "reflection"}
                style={{ ...inp(), opacity: format === "reflection" ? 0.5 : 1 }}
              >
                {DIFFICULTIES.map((d) => <option key={d}>{d}</option>)}
              </select>
            </Field>
          </div>

          {/* Goal picker — list of pills, one per goal */}
          {studentId && (
            <>
              <div style={{
                fontSize: 10, fontWeight: 800, letterSpacing: "0.22em", textTransform: "uppercase",
                color: "rgba(196,181,253,0.65)", marginBottom: 8,
              }}>
                IEP Goal · {studentGoals.length}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 14 }}>
                {studentGoals.map((g) => {
                  const sel = g.id === goalId;
                  return (
                    <button
                      key={g.id}
                      onClick={() => onPickGoal(g)}
                      aria-pressed={sel}
                      style={{
                        textAlign: "left",
                        padding: "12px 14px", borderRadius: 12,
                        background: sel
                          ? "linear-gradient(135deg, rgba(168,85,247,0.30), rgba(236,72,153,0.10))"
                          : "rgba(168,85,247,0.04)",
                        border: sel
                          ? "1.5px solid rgba(236,72,153,0.55)"
                          : "1px solid rgba(168,85,247,0.18)",
                        color: "#fce7f3", cursor: "pointer", fontSize: 13,
                        fontWeight: 600, lineHeight: 1.45,
                        boxShadow: sel ? "0 0 14px rgba(236,72,153,0.30)" : "none",
                        touchAction: "manipulation",
                      }}
                    >
                      {g.area && (
                        <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.18em", textTransform: "uppercase", color: sel ? "#f9a8d4" : "#c4b5fd", marginBottom: 4 }}>
                          {g.area}
                        </div>
                      )}
                      {g.goalText}
                    </button>
                  );
                })}
              </div>
            </>
          )}

          {/* Inference + actions */}
          {goal && (
            <div style={{
              padding: "10px 14px", borderRadius: 12, marginBottom: 14,
              background: "rgba(168,85,247,0.06)",
              border: "1px solid rgba(168,85,247,0.25)",
              color: "rgba(196,181,253,0.85)", fontSize: 12, fontWeight: 600,
            }}>
              <span style={{ color: "#f9a8d4", fontWeight: 800 }}>Auto-detected:</span>{" "}
              {format === "reflection"
                ? "Reflection prompts (good for behavior + SEL goals)"
                : `${inferSubject(goal)} · ${formatLabel(format)} format`}
              {format !== "reflection" && (
                <span style={{ marginLeft: 8, color: "rgba(196,181,253,0.55)" }}>
                  · change Format above to switch
                </span>
              )}
            </div>
          )}

          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
            <button
              onClick={generate}
              disabled={busy || !goal}
              style={primaryBtn(busy || !goal)}
            >
              {busy ? "Building…" : "✨ Make IEP Assignment"}
            </button>
          </div>
        </>
      )}

      {created && (
        <div style={{
          marginTop: 14, padding: 16, borderRadius: 14,
          background: "linear-gradient(135deg, rgba(168,85,247,0.12), rgba(99,102,241,0.05))",
          border: "1px solid rgba(168,85,247,0.30)",
          boxShadow: "0 4px 18px -8px rgba(168,85,247,0.40), inset 0 1px 0 rgba(255,255,255,0.04)",
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
            <div>
              <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.22em", textTransform: "uppercase", color: "#f9a8d4" }}>
                IEP Assignment · {created.subject} · {created.questions.length} questions
              </div>
              <div style={{ fontFamily: "Menlo, monospace", fontWeight: 800, fontSize: 18, color: "#fce7f3", marginTop: 2 }}>
                {created.barcode}
              </div>
              <div style={{ fontSize: 12, color: "rgba(196,181,253,0.75)", fontWeight: 600, marginTop: 2 }}>
                For {created.studentName} · {created.grade}
              </div>
            </div>
            <button onClick={print} style={ghostBtn()}>🖨 Print</button>
          </div>
          <div style={{
            marginTop: 12, padding: "8px 12px", borderRadius: 10,
            background: "rgba(10,4,20,0.40)",
            border: "1px solid rgba(168,85,247,0.20)",
            fontSize: 12, color: "#fce7f3", fontWeight: 600, lineHeight: 1.5,
          }}>
            <span style={{ color: "#f9a8d4", fontWeight: 800 }}>🎯 {created.goal.area || "IEP"}:</span> {created.goal.goalText}
          </div>
          <div style={{ marginTop: 12 }} dangerouslySetInnerHTML={{ __html: bc128svg(created.barcode, 0, 70, true, 2.0) }} />
          <div style={{
            marginTop: 8, fontSize: 11, color: "rgba(196,181,253,0.65)", fontWeight: 600,
          }}>
            💡 When you scan + grade this barcode, an IEP log entry is auto-created
            (Met if ≥80%, Partial 50–79%, Not yet &lt;50%).
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Subject + format inference ──────────────────────────────────── */

const READING = /\b(read|phonic|decod|blend|comprehens|context\s*clue|main\s*idea|sight\s*word|vowel|syllable|prefix|root|fluency)/i;
const WRITING = /\b(writ|convention|sentence|punctuat|capitaliz|paragraph|dictat|spell)/i;
const MATH    = /\b(math|addition|subtract|multipl|divide|division|place\s*value|number\s*line|fraction|decimal|count|equation|algorithm)/i;
const BEHAVIOR= /\b(behavi|transition|on[-\s]?task|conflict|emotional|social|calm|cope|frustrat|self[-\s]?regulat|articulat|maladaptive|productive\s*school|ethical|if[-\s]?then|expectation|bullying|teasing|upsetting)/i;

export function inferSubject(goal: IepGoal): Subject {
  const hay = `${goal.area || ""} ${goal.goalText}`;
  if (MATH.test(hay)) return "Math";
  if (READING.test(hay)) return "Reading";
  if (WRITING.test(hay)) return "Writing";
  if (/spell/i.test(hay)) return "Spelling";
  if (/scien/i.test(hay)) return "Science";
  if (/social\s+studies|geograph|histor/i.test(hay)) return "Social Studies";
  if (BEHAVIOR.test(hay)) return "SEL"; // SEL is in the Subject union
  return "Reading";
}

export function inferFormatFromGoal(goal: IepGoal): Format {
  const hay = `${goal.area || ""} ${goal.goalText}`;
  if (BEHAVIOR.test(hay) && !READING.test(hay) && !MATH.test(hay) && !WRITING.test(hay)) {
    return "reflection";
  }
  // Default: quiz for short-answer-style goals (decoding, sight words),
  // worksheet for longer-form goals.
  if (/sight\s*word|decod|blend|spell|fluency/i.test(hay)) return "quiz";
  return "worksheet";
}

function formatLabel(f: Format): string {
  return f === "worksheet" ? "Worksheet" : f === "quiz" ? "Quiz" : "Reflection";
}

/* ── Quiz builder for IEP context (uses the QuizGenerator pools) ───
   Avoid circular imports — duplicate the small bits we need. */

export function buildQuizForGoal(goal: IepGoal, subject: Subject, count: number, difficulty: Difficulty, grade: string): StarQuestion[] {
  // Reuse the QuizGenerator pools. Import lazily to avoid module cycle.
  // The pools function is internal to QuizGenerator.tsx — we re-implement
  // a tiny picker here with very small defaults so this still works
  // even if pools change. For now, route to the generic pool.
  const gradeNum = grade === "K" ? 0 : Number(grade.replace(/\D/g, "")) || 3;
  return buildGenericQuiz(subject, count, difficulty, gradeNum);
}

function buildGenericQuiz(subject: Subject, count: number, difficulty: Difficulty, gradeNum: number): StarQuestion[] {
  // Minimal MCQ pools — kept here so this file stays self-contained.
  // For richer pools, the regular QuizGenerator is still available.
  type Raw = { text: string; answer: string; distractors: string[] };
  const pool: Raw[] = [];
  if (subject === "Math") {
    const max = difficulty === "Easy" ? Math.max(10, gradeNum * 5) : difficulty === "Medium" ? Math.max(20, gradeNum * 10) : Math.max(50, gradeNum * 20);
    for (let i = 0; i < 30; i++) {
      const a = 1 + Math.floor(Math.random() * max);
      const b = 1 + Math.floor(Math.random() * max);
      const ans = a + b;
      pool.push({ text: `What is ${a} + ${b}?`, answer: String(ans), distractors: [String(ans + 1), String(Math.max(0, ans - 1)), String(ans + 2)] });
    }
  } else {
    pool.push(
      { text: "Which word is a noun?", answer: "dog", distractors: ["run", "blue", "quickly"] },
      { text: "Pick the synonym for 'fast'.", answer: "quick", distractors: ["slow", "loud", "tired"] },
      { text: "Pick the antonym for 'hot'.", answer: "cold", distractors: ["warm", "spicy", "wet"] },
      { text: "What punctuation ends a question?", answer: "?", distractors: [".", "!", ","] },
      { text: "Which is a complete sentence?", answer: "The cat ran fast.", distractors: ["Ran fast.", "The cat", "Cat the ran"] },
      { text: "What's the plural of 'mouse'?", answer: "mice", distractors: ["mouses", "mouse", "mices"] },
      { text: "Pick a homophone for 'their'.", answer: "there", distractors: ["here", "those", "them"] },
      { text: "Which word rhymes with 'cat'?", answer: "bat", distractors: ["dog", "fish", "tree"] },
    );
  }
  const shuffled = pool.slice().sort(() => Math.random() - 0.5).slice(0, count);
  return shuffled.map((q, i) => ({
    num: i + 1, text: q.text, answer: q.answer,
    choices: [q.answer, ...q.distractors].sort(() => Math.random() - 0.5).slice(0, 4),
  }));
}

/* ── Reflection prompts for behavior / SEL goals ─────────────────── */

export function buildReflectionQuestions(goal: IepGoal, count: number): StarQuestion[] {
  const base: string[] = [];
  const area = (goal.area || "").toLowerCase();
  if (area.includes("on-task") || /on[-\s]?task/i.test(goal.goalText)) {
    base.push(
      "How long did you stay focused on your work today? (in minutes)",
      "What helped you stay on-task today?",
      "What pulled your attention away from the work?",
      "What strategy will you try next time?",
    );
  }
  if (area.includes("transition") || /transition/i.test(goal.goalText)) {
    base.push(
      "How did the transition go? (smooth / okay / hard)",
      "Which strategy from the anchor chart did you use?",
      "If it was hard, what made it hard?",
      "What will help next time?",
    );
  }
  if (area.includes("emotion") || /frustrat|upset|calm|emotion/i.test(goal.goalText)) {
    base.push(
      "What emotion did you feel today during a tough moment?",
      "What did you try to calm down?",
      "Did it work? Why or why not?",
      "Who could you ask for help next time?",
    );
  }
  if (area.includes("conflict") || /conflict|bullying|teasing/i.test(goal.goalText)) {
    base.push(
      "Describe a conflict or hard moment you had today.",
      "List 3 positive strategies you could have used.",
      "Which strategy will you try next time?",
    );
  }
  if (area.includes("if-then") || /if[-\s]?then/i.test(goal.goalText)) {
    base.push(
      "Pick a behavior from today. Write it as: 'If I ___, then ___ might feel ___.'",
      "Was the result what you expected? Explain.",
      "Try another If/Then for tomorrow.",
    );
  }
  // Generic fallback
  if (base.length === 0) {
    base.push(
      "How did today go for this goal? (great / okay / hard)",
      "What worked well today?",
      "What was hard?",
      "What's one thing to try tomorrow?",
    );
  }
  // Pad / trim to count
  const out: string[] = [];
  while (out.length < count) {
    out.push(...base);
  }
  return out.slice(0, count).map((text, i) => ({
    num: i + 1, text, answer: "—", // open-response: any thoughtful answer
  }));
}

/* ── Print template — IEP-aware, prints the goal at the top ──────── */

function openIepPrintWindow(r: Result) {
  const w = window.open("", "_blank", "width=900,height=1100");
  if (!w) return;
  const today = new Date().toLocaleDateString();
  const barcodeSvg = bc128svg(r.barcode, 0, 90, true, 2.0);
  const isMCQ = r.questions.some((q) => Array.isArray(q.choices) && q.choices.length > 0);
  const isReflection = r.format === "reflection";

  const css = `
    @media print { @page { size: letter; margin: 0.55in; } }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: #111; padding: 16px; line-height: 1.5; }
    h1 { font-size: 22px; margin: 0 0 4px; letter-spacing: -0.02em; }
    .meta { font-size: 12px; color: #555; }
    .pill { display: inline-block; padding: 2px 8px; border-radius: 999px; background: #ede9fe; color: #5b21b6; font-size: 11px; font-weight: 800; letter-spacing: 0.06em; text-transform: uppercase; }
    .iep-banner { margin: 12px 0 16px; padding: 12px 14px; border-radius: 10px; background: linear-gradient(135deg, #faf5ff 0%, #fdf2f8 100%); border: 1.5px solid #d8b4fe; }
    .iep-banner .label { display: inline-block; padding: 2px 8px; border-radius: 4px; background: #6d28d9; color: #fff; font-size: 10px; font-weight: 800; letter-spacing: 0.06em; text-transform: uppercase; margin-right: 6px; }
    .iep-banner .area { font-weight: 800; color: #5b21b6; margin-right: 6px; }
    .iep-banner .text { font-size: 13px; color: #1f1235; }
    .question { padding: 10px 0; border-bottom: 1px dashed #ccc; }
    .qhead { display: flex; gap: 8px; align-items: flex-start; }
    .qnum { display: inline-block; min-width: 22px; height: 22px; border-radius: 50%; background: #6d28d9; color: white; text-align: center; line-height: 22px; font-weight: 800; font-size: 12px; flex-shrink: 0; }
    .qtext { font-size: 14px; font-weight: 600; flex: 1; }
    .choices { margin: 6px 0 0 32px; display: grid; grid-template-columns: 1fr 1fr; gap: 4px 24px; }
    .choice { display: flex; align-items: center; gap: 6px; font-size: 13px; }
    .bubble { display: inline-block; width: 16px; height: 16px; border: 1.5px solid #444; border-radius: 50%; flex-shrink: 0; }
    .answer-line { border-bottom: 1px solid #444; height: 26px; margin: 6px 0 0 32px; }
    .answer-box { border: 1px solid #d8b4fe; border-radius: 6px; height: 60px; margin: 6px 0 0 32px; background: #faf5ff; }
    .top { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; }
  `;

  const qBlocks = r.questions.map((q) => {
    const choices = Array.isArray(q.choices) ? q.choices : [];
    const blockBody = choices.length > 0
      ? `<div class="choices">${choices.map((c, i) => `
          <div class="choice"><span class="bubble"></span><b>${String.fromCharCode(65 + i)}.</b> ${escapeHtml(c)}</div>
        `).join("")}</div>`
      : isReflection
        ? `<div class="answer-box"></div>`
        : `<div class="answer-line"></div>`;
    return `
      <div class="question">
        <div class="qhead">
          <span class="qnum">${q.num}</span>
          <span class="qtext">${escapeHtml(q.text)}</span>
        </div>
        ${blockBody}
      </div>`;
  }).join("");

  const html = `<!doctype html><html><head><title>IEP — ${escapeHtml(r.goal.area || "")} — ${escapeHtml(r.studentName)}</title><style>${css}</style></head>
    <body>
      <div class="top">
        <div>
          <h1>${isReflection ? "💭 Reflection" : isMCQ ? "🎯 IEP Quiz" : "📝 IEP Worksheet"} — ${escapeHtml(r.subject)}</h1>
          <div class="meta"><span class="pill">${escapeHtml(r.grade)}</span> · For <b>${escapeHtml(r.studentName)}</b> · ${today}</div>
        </div>
        <div>${barcodeSvg}</div>
      </div>

      <div class="iep-banner">
        <div><span class="label">🎯 IEP Focus</span>${r.goal.area ? `<span class="area">${escapeHtml(r.goal.area)}:</span>` : ""}<span class="text">${escapeHtml(r.goal.goalText)}</span></div>
      </div>

      ${qBlocks}

      <div style="margin-top:18px;font-size:10px;color:#888">
        Scan the barcode in /star to open the gradebook for this assignment. Score auto-logs IEP progress.
      </div>
      <script>window.addEventListener("load",()=>setTimeout(()=>window.print(),200))</script>
    </body></html>`;
  w.document.write(html);
  w.document.close();
}

function escapeHtml(s: string): string {
  return (s || "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

/* ── small UI helpers ────────────────────────────────────────────── */

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.22em", textTransform: "uppercase", color: "rgba(196,181,253,0.65)", marginBottom: 5 }}>{label}</div>
      {children}
    </div>
  );
}

function inp(): React.CSSProperties {
  return {
    width: "100%", padding: "10px 12px", borderRadius: 10,
    background: "rgba(10,4,20,0.45)", color: "#fce7f3",
    border: "1px solid rgba(168,85,247,0.25)",
    fontSize: 14, outline: "none", fontWeight: 600,
    boxSizing: "border-box",
  };
}

function primaryBtn(disabled: boolean): React.CSSProperties {
  return {
    padding: "11px 18px", borderRadius: 12,
    background: disabled
      ? "rgba(168,85,247,0.18)"
      : "linear-gradient(135deg, #6366f1 0%, #a855f7 50%, #ec4899 100%)",
    color: "white", border: "none", fontWeight: 900,
    cursor: disabled ? "not-allowed" : "pointer", fontSize: 14,
    opacity: disabled ? 0.55 : 1,
    boxShadow: disabled ? "none" : "0 8px 22px -6px rgba(168,85,247,0.55)",
    touchAction: "manipulation",
  };
}

function ghostBtn(): React.CSSProperties {
  return {
    padding: "10px 14px", borderRadius: 12,
    background: "rgba(168,85,247,0.06)", color: "#fce7f3",
    border: "1px solid rgba(168,85,247,0.30)",
    fontWeight: 800, fontSize: 13,
    cursor: "pointer", touchAction: "manipulation",
  };
}

function hint(): React.CSSProperties {
  return {
    padding: "14px 16px", borderRadius: 12,
    background: "rgba(168,85,247,0.04)",
    border: "1px dashed rgba(168,85,247,0.25)",
    color: "rgba(196,181,253,0.75)", fontSize: 13, fontWeight: 600, lineHeight: 1.5,
  };
}
