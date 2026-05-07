// Assignment generator. Builds a STAR assignment via OpenRouter AI
// (or a local fallback lesson) and registers it into bcDB so the
// scanner can pull up the gradebook for it later.

import { useState } from "react";
import {
  StarStore, saveAll,
  type Subject, type StarQuestion, type StarTrackerEntry, type BcEntry,
} from "../../lib/star/storage.ts";
import { bc128svg } from "../../lib/star/barcode.ts";
import { successBeep, errorBeep, loggedBeep } from "../../lib/star/sounds.ts";

const SUBJECTS: Subject[] = ["Math", "Reading", "Writing", "Science", "Social Studies"];
const GRADES = ["K", "1st", "2nd", "3rd", "4th", "5th"];
const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
const Q_COUNTS = [5, 10, 15, 20];
const DIFFICULTIES = ["Easy", "Medium", "Hard"] as const;

interface Lesson {
  title: string;
  intro: string;
  keyPoints: string[];
  workedExample?: { problem: string; solution: string };
  vocab?: { term: string; definition: string }[];
}

export default function AssignmentGenerator({ onCreated }: { onCreated?: (id: string) => void }) {
  const [studentName, setStudentName] = useState("");
  const [subject, setSubject] = useState<Subject>("Math");
  const [grade, setGrade] = useState("3rd");
  const [week, setWeek] = useState("1");
  const [day, setDay] = useState("Monday");
  const [count, setCount] = useState<number>(10);
  const [difficulty, setDifficulty] = useState<typeof DIFFICULTIES[number]>("Medium");
  const [goal, setGoal] = useState("");
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
                  content: buildPrompt({ subject, grade, count, difficulty, goal, studentName }),
                },
              ],
              temperature: 0.6,
            }),
          });
          const data = await res.json();
          const content = data?.choices?.[0]?.message?.content || "";
          const parsed = safeParseJSON(content);
          if (parsed?.questions && Array.isArray(parsed.questions)) {
            questions = parsed.questions.map((q: any, i: number) => ({
              num: i + 1,
              text: String(q.text || q.question || `Question ${i + 1}`),
              answer: String(q.answer || ""),
            }));
            lesson = parsed.lesson || null;
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
        studentName: studentName || undefined, week, day, goal: goal || undefined,
        questions: questions!, lesson, createdDate: now.toISOString(),
      };
      bcDB[id] = entry;

      const trk: StarTrackerEntry = {
        id, name, subject, gradeLevel: grade,
        studentName: studentName || undefined, week, day, goal: goal || undefined,
        questions: questions!, lesson, createdDate: now.toISOString(),
        status: "assigned", submissions: [],
      };
      tracker[id] = trk;

      // Also drop into star_a so the assignment list stays in sync.
      const asns = StarStore.getAsns();
      asns.unshift({ id, name, subject, type: "Assignment", grade });

      saveAll({ bcDB, asnTracker: tracker, asns });
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

  const printAssignment = () => {
    if (!created) return;
    const bc = StarStore.getBcDB()[created.id];
    if (!bc || bc.type !== "assignment") return;
    openPrintWindow(bc, created.questions, created.lesson, false);
    loggedBeep();
  };
  const printAnswerKey = () => {
    if (!created) return;
    const bc = StarStore.getBcDB()[created.id];
    if (!bc || bc.type !== "assignment") return;
    openPrintWindow(bc, created.questions, created.lesson, true);
    loggedBeep();
  };

  return (
    <div style={{
      background: "rgba(255,255,255,0.04)",
      border: "1px solid rgba(255,255,255,0.10)",
      borderRadius: 14, padding: 16, color: "#f5f1e8",
    }}>
      <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 12 }}>
        ✨ Build a STAR Assignment
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <Field label="Student (optional)">
          <input value={studentName} onChange={(e) => setStudentName(e.target.value)} placeholder="e.g. Ryan Carter" style={inp()} />
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

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 14, gap: 10, flexWrap: "wrap" }}>
        <div style={{ fontSize: 12, opacity: 0.6 }}>
          {StarStore.getApiKey() ? "🤖 OpenRouter AI key set" : "💡 No AI key — will use local generator"}
        </div>
        <button onClick={generate} disabled={busy} style={primaryBtn()}>
          {busy ? "Generating…" : "✨ Generate Assignment"}
        </button>
      </div>

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
              <button onClick={printAssignment} style={ghostBtn()}>🖨 Student Copy</button>
              <button onClick={printAnswerKey} style={ghostBtn()}>🔑 Answer Key</button>
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

function buildPrompt(opts: { subject: Subject; grade: string; count: number; difficulty: string; goal: string; studentName: string }) {
  return `Create a ${opts.difficulty.toLowerCase()} ${opts.subject} worksheet for a ${opts.grade}-grade student${opts.studentName ? ` named ${opts.studentName}` : ""}.
${opts.goal ? `IEP goal focus: ${opts.goal}\n` : ""}
Return ONLY this JSON shape (no markdown):
{
  "lesson": {
    "title": "...",
    "intro": "1-2 sentence student-friendly explanation",
    "keyPoints": ["..."],
    "workedExample": { "problem": "...", "solution": "..." },
    "vocab": [{ "term": "...", "definition": "..." }]
  },
  "questions": [
    { "text": "...", "answer": "..." }
  ]
}
Generate exactly ${opts.count} questions. Keep math clean, reading short, language age-appropriate.`;
}

function safeParseJSON(s: string): any | null {
  try { return JSON.parse(s); } catch {}
  // strip code fences
  const m = s.match(/\{[\s\S]*\}/);
  if (m) {
    try { return JSON.parse(m[0]); } catch {}
  }
  return null;
}

function buildLocalLesson(opts: { subject: Subject; grade: string; count: number; difficulty: string; goal: string }): { questions: StarQuestion[]; lesson: Lesson } {
  const { subject, count, difficulty } = opts;
  const lesson: Lesson = {
    title: `${subject} Practice — ${opts.grade}`,
    intro: opts.goal ? `Today we're practicing ${opts.goal}.` : `Let's practice some ${subject.toLowerCase()}!`,
    keyPoints: [
      "Read each question carefully.",
      "Show your work in the space provided.",
      "Check your answer before moving on.",
    ],
  };

  const questions: StarQuestion[] = [];
  if (subject === "Math") {
    for (let i = 0; i < count; i++) {
      const range = difficulty === "Easy" ? 12 : difficulty === "Medium" ? 50 : 200;
      const a = Math.floor(Math.random() * range) + 1;
      const b = Math.floor(Math.random() * range) + 1;
      const op = ["+", "-", "×"][i % 3];
      const ans = op === "+" ? a + b : op === "-" ? a - b : a * b;
      questions.push({ num: i + 1, text: `${a} ${op} ${b} = ?`, answer: String(ans) });
    }
    lesson.workedExample = { problem: "12 + 7 = ?", solution: "12 + 7 = 19" };
  } else if (subject === "Reading") {
    const passage = "The fox spotted a rabbit by the old oak tree.";
    for (let i = 0; i < count; i++) {
      const qs = [
        { text: "Who spotted the rabbit?", answer: "The fox" },
        { text: "Where was the rabbit?", answer: "By the old oak tree" },
        { text: "What kind of tree is mentioned?", answer: "Oak tree" },
        { text: "What did the fox see?", answer: "A rabbit" },
        { text: "Was the tree young or old?", answer: "Old" },
      ];
      questions.push({ num: i + 1, ...qs[i % qs.length] });
    }
    lesson.intro = `Read the passage: "${passage}"`;
  } else if (subject === "Writing") {
    for (let i = 0; i < count; i++) {
      questions.push({ num: i + 1, text: `Write a complete sentence using the word "${["happy","quick","brave","quiet","kind"][i % 5]}".`, answer: "Sample sentence." });
    }
  } else if (subject === "Science") {
    const facts = [
      { text: "Plants need ___ and water to grow.", answer: "sunlight" },
      { text: "The largest planet in our solar system is ___.", answer: "Jupiter" },
      { text: "Water boils at ___ °C.", answer: "100" },
      { text: "Animals that eat only plants are called ___.", answer: "herbivores" },
      { text: "The Earth orbits the ___.", answer: "Sun" },
    ];
    for (let i = 0; i < count; i++) questions.push({ num: i + 1, ...facts[i % facts.length] });
  } else {
    const facts = [
      { text: "The capital of the United States is ___.", answer: "Washington, D.C." },
      { text: "The first president was ___.", answer: "George Washington" },
      { text: "The 4th of July celebrates ___.", answer: "Independence Day" },
      { text: "The 50 stars on the U.S. flag represent the ___.", answer: "states" },
    ];
    for (let i = 0; i < count; i++) questions.push({ num: i + 1, ...facts[i % facts.length] });
  }
  return { questions, lesson };
}

function openPrintWindow(bc: BcEntry & { type: "assignment" }, questions: StarQuestion[], lesson: Lesson | null, isKey: boolean) {
  const w = window.open("", "_blank", "width=900,height=1100");
  if (!w) return;
  const barcodeSvg = bc128svg(bc.id, 0, 80, true, 2.0);
  const studentName = bc.studentName || "______________________";
  const head = `
    <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:12px">
      <div>
        <div style="font-size:11px;letter-spacing:0.2em;text-transform:uppercase;color:#555">${isKey ? "📑 Teacher Answer Key" : "📝 Student Worksheet"}</div>
        <div style="font-size:22px;font-weight:800;margin-top:2px">${escapeHtml(bc.name)}</div>
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
  const lessonHtml = lesson ? `
    <div style="border:1px solid #ddd;border-radius:8px;padding:12px 14px;margin-bottom:14px;background:#fafafa">
      <div style="font-size:16px;font-weight:800;margin-bottom:6px">📖 ${escapeHtml(lesson.title)}</div>
      ${lesson.intro ? `<div style="font-size:13px;margin-bottom:8px">${escapeHtml(lesson.intro)}</div>` : ""}
      ${lessonAny.body ? `<div style="font-size:13px;margin-bottom:8px;line-height:1.55;white-space:pre-wrap">${escapeHtml(String(lessonAny.body))}</div>` : ""}
      ${lesson.keyPoints?.length ? `<ul style="margin:0 0 8px 18px;padding:0;font-size:13px">${lesson.keyPoints.map((p) => `<li>${escapeHtml(p)}</li>`).join("")}</ul>` : ""}
      ${lesson.workedExample ? `<div style="font-size:13px;margin-top:6px"><b>Example:</b> ${escapeHtml(lesson.workedExample.problem)} → <span style="color:#16a34a;font-weight:700">${escapeHtml(lesson.workedExample.solution)}</span></div>` : ""}
      ${lesson.vocab?.length ? `<div style="font-size:13px;margin-top:6px"><b>Vocab:</b> ${lesson.vocab.map((v) => `<span style="margin-right:10px"><b>${escapeHtml(v.term)}</b>: ${escapeHtml(v.definition)}</span>`).join("")}</div>` : ""}
    </div>
  ` : "";

  const qHtml = questions.map((q) => `
    <div style="margin-bottom:14px;page-break-inside:avoid">
      <div style="font-size:14px"><b>${q.num}.</b> ${escapeHtml(q.text)}</div>
      ${isKey
        ? `<div style="font-size:13px;color:#16a34a;font-weight:700;margin-top:4px;font-family:Menlo,monospace">✓ ${escapeHtml(q.answer)}</div>`
        : `<div style="border-bottom:1px solid #999;height:32px;margin-top:6px"></div>`}
    </div>
  `).join("");

  w.document.write(`<!doctype html><html><head><title>${escapeHtml(bc.name)} ${isKey ? "(Key)" : ""}</title>
    <style>
      @media print { @page { size: letter; margin: 0.5in; } }
      body { font-family: -apple-system, sans-serif; color: #111; padding: 16px; }
    </style>
  </head><body>${head}${lessonHtml}<div>${qHtml}</div>
  <script>window.addEventListener('load', () => setTimeout(() => window.print(), 200));</script>
  </body></html>`);
  w.document.close();
}

function escapeHtml(s: string): string {
  return (s || "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}
