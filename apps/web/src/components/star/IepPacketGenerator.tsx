// IEP Goal Packet — one tap, one PDF with EVERY kid × EVERY goal.
// For each picked student:
//   • If they have IEP goals, mint one aligned assignment per goal.
//   • If they have none, synthesize a sensible grade-level goal so the
//     packet still has something for them (won't write the synth goal
//     back to storage — it's print-only, fixed in the worksheet).
// Each minted assignment gets its own barcode, lands in bcDB +
// tracker, and pushes to the relay so any device can scan it.

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
import {
  inferSubject, inferFormatFromGoal,
  buildQuizForGoal, buildReflectionQuestions,
} from "./IepAssignmentGenerator.tsx";

type Format = "worksheet" | "quiz" | "reflection";

interface PacketItem {
  barcode: string;
  student: StarStudent;
  goal: IepGoal;
  goalSynthesized: boolean;
  format: Format;
  subject: Subject;
  grade: string;
  questions: StarQuestion[];
  lesson: any;
}

const COUNTS = [5, 8, 10];
const DIFFICULTIES = ["Easy", "Medium", "Hard"] as const;
type Difficulty = typeof DIFFICULTIES[number];

export default function IepPacketGenerator() {
  const [students] = useState<StarStudent[]>(() => StarStore.getStudents());
  const [allGoals] = useState<IepGoal[]>(() => StarStore.getIepGoals());
  const [picked, setPicked] = useState<Set<string>>(() => new Set(students.map((s) => s.id)));
  const [count, setCount] = useState<number>(8);
  const [difficulty, setDifficulty] = useState<Difficulty>("Medium");
  const [busy, setBusy] = useState(false);
  const [generated, setGenerated] = useState<PacketItem[]>([]);

  const togglePick = (id: string) => {
    setPicked((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  // Goal count preview per kid (so the teacher sees what the packet
  // will produce before generating).
  const goalCountByStudent = useMemo(() => {
    const map: Record<string, number> = {};
    for (const s of students) {
      map[s.id] = Math.max(1, allGoals.filter((g) => g.studentId === s.id).length);
    }
    return map;
  }, [students, allGoals]);

  const totalPages = useMemo(() => {
    let n = 0;
    for (const s of students) if (picked.has(s.id)) n += goalCountByStudent[s.id] || 1;
    return n;
  }, [students, picked, goalCountByStudent]);

  const generatePacket = () => {
    if (picked.size === 0) { errorBeep(); return; }
    setBusy(true);
    try {
      const bcDB = StarStore.getBcDB();
      const tracker = StarStore.getAsnTrack();
      const asns = StarStore.getAsns();
      const out: PacketItem[] = [];
      // Track per-kid topic exclusions so multi-goal kids don't
      // get the same story twice.
      const exclByKid: Record<string, Set<string>> = {};
      for (const s of students) {
        if (!picked.has(s.id)) continue;
        const grade = s.grade || "3rd";
        const studentName = `${s.firstName} ${s.lastName}`.trim();
        const goals = allGoals.filter((g) => g.studentId === s.id);
        const useGoals: Array<{ goal: IepGoal; synthesized: boolean }> = goals.length > 0
          ? goals.map((g) => ({ goal: g, synthesized: false }))
          : [{ goal: synthesizeGoalForGrade(s.id, grade), synthesized: true }];

        exclByKid[s.id] ||= new Set<string>();

        for (const { goal, synthesized } of useGoals) {
          const subject = inferSubject(goal);
          const format = inferFormatFromGoal(goal);
          let questions: StarQuestion[] = [];
          let lesson: any = null;
          if (format === "reflection") {
            questions = buildReflectionQuestions(goal, count);
          } else if (format === "quiz") {
            questions = buildQuizForGoal(goal, subject, count, difficulty, grade);
          } else {
            const built = buildLocalLesson({
              subject, grade, count, difficulty,
              goal: `${goal.area ? goal.area + " — " : ""}${goal.goalText}`,
              excludeTitles: exclByKid[s.id],
            });
            questions = built.questions;
            lesson = built.lesson;
            if (built.topicTitle) exclByKid[s.id].add(built.topicTitle);
          }

          const barcode = nextBarcode("AS", bcDB);
          const name = `🎯 ${goal.area || "IEP"} · ${studentName}`;
          const entry: BcEntry = {
            id: barcode, type: "assignment",
            name, subject, gradeLevel: grade,
            studentName, studentId: s.id,
            questions, lesson,
            createdDate: new Date().toISOString(),
            iepGoalId: goal.id,
            iepGoalArea: goal.area,
            iepGoalText: goal.goalText,
          };
          bcDB[barcode] = entry;
          tracker[barcode] = {
            id: barcode, name, subject, gradeLevel: grade,
            studentName, studentId: s.id,
            questions, lesson,
            createdDate: new Date().toISOString(),
            status: "assigned", submissions: [],
            iepGoalId: goal.id, iepGoalArea: goal.area, iepGoalText: goal.goalText,
          };
          asns.unshift({ id: barcode, name, subject, type: "Assignment", grade });
          out.push({ barcode, student: s, goal, goalSynthesized: synthesized, format, subject, grade, questions, lesson });
        }
      }
      saveAll({ bcDB, asnTracker: tracker, asns });
      for (const item of out) pushBarcodeToServer(bcDB[item.barcode]);
      setGenerated(out);
      successBeep();
    } catch (e: any) {
      errorBeep();
      alert(`Packet generation failed: ${e?.message || e}`);
    } finally {
      setBusy(false);
    }
  };

  const printAll = () => {
    if (generated.length === 0) return;
    openIepPacketPrintWindow(generated);
    loggedBeep();
  };

  return (
    <div style={{ color: "#f5f1e8" }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 10, marginBottom: 12 }}>
        <Field label="Questions per assignment">
          <select value={count} onChange={(e) => setCount(Number(e.target.value))} style={inp()}>
            {COUNTS.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </Field>
        <Field label="Difficulty">
          <select value={difficulty} onChange={(e) => setDifficulty(e.target.value as Difficulty)} style={inp()}>
            {DIFFICULTIES.map((d) => <option key={d}>{d}</option>)}
          </select>
        </Field>
      </div>

      <div style={{ marginBottom: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.18em", textTransform: "uppercase", opacity: 0.6 }}>
            Students ({picked.size}/{students.length}) · packet will be <b style={{ color: "#f9a8d4" }}>{totalPages}</b> pages
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <button onClick={() => setPicked(new Set(students.map((s) => s.id)))} style={ghost()}>All</button>
            <button onClick={() => setPicked(new Set())} style={ghost()}>None</button>
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {students.map((s) => {
            const sel = picked.has(s.id);
            const goalsForKid = allGoals.filter((g) => g.studentId === s.id);
            const synth = goalsForKid.length === 0;
            return (
              <label key={s.id} style={{
                display: "grid",
                gridTemplateColumns: "auto 1fr auto",
                gap: 10, alignItems: "center",
                padding: "8px 12px", borderRadius: 10,
                background: sel ? "rgba(168,85,247,0.12)" : "rgba(255,255,255,0.03)",
                border: `1px solid ${sel ? "rgba(168,85,247,0.40)" : "rgba(255,255,255,0.08)"}`,
                cursor: "pointer",
              }}>
                <input type="checkbox" checked={sel} onChange={() => togglePick(s.id)} style={{ accentColor: "#a855f7", width: 16, height: 16 }} />
                <div style={{ fontSize: 13 }}>
                  <span style={{ fontWeight: 800 }}>{s.firstName} {s.lastName}</span>
                  {s.grade && <span style={{ opacity: 0.55, fontWeight: 600 }}> · {s.grade}</span>}
                  {synth && <span style={{ marginLeft: 8, fontSize: 10, padding: "1px 8px", borderRadius: 999, background: "rgba(245,158,11,0.18)", border: "1px solid rgba(245,158,11,0.40)", color: "#fde68a", fontWeight: 800 }}>NO IEP — WILL SYNTHESIZE</span>}
                </div>
                <span style={{ fontSize: 11, fontWeight: 800, color: "#c4b5fd" }}>
                  {synth ? 1 : goalsForKid.length} goal{(synth ? 1 : goalsForKid.length) === 1 ? "" : "s"}
                </span>
              </label>
            );
          })}
        </div>
      </div>

      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
        <button onClick={generatePacket} disabled={busy || picked.size === 0} style={primary(busy || picked.size === 0)}>
          {busy ? "Building…" : `🎯 Generate IEP Packet (${totalPages} pages)`}
        </button>
      </div>

      {generated.length > 0 && (
        <div style={{
          marginTop: 14, padding: 14, borderRadius: 12,
          background: "linear-gradient(135deg, rgba(168,85,247,0.12), rgba(99,102,241,0.05))",
          border: "1px solid rgba(168,85,247,0.30)",
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <div style={{ fontSize: 12, color: "#fce7f3" }}>
              {generated.length} IEP assignment{generated.length === 1 ? "" : "s"} ready · barcoded + saved · scans auto-log Met/Partial/Not yet
            </div>
            <button onClick={printAll} style={primary(false)}>🖨 Print the whole packet</button>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 6 }}>
            {generated.map((it) => (
              <div key={it.barcode} style={{
                padding: "6px 10px", borderRadius: 8,
                background: "rgba(0,0,0,0.30)",
                border: "1px solid rgba(168,85,247,0.20)",
                fontSize: 11,
              }}>
                <div style={{ fontWeight: 800, color: "#fce7f3" }}>{it.student.firstName} · {it.goal.area || "IEP"}</div>
                <div style={{ color: "rgba(196,181,253,0.65)", fontFamily: "Menlo, monospace", fontSize: 10 }}>{it.barcode}</div>
                {it.goalSynthesized && <div style={{ fontSize: 9, color: "#fde68a", fontWeight: 800, marginTop: 2 }}>synthesized</div>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Goal synthesizer (kid has no IEP yet) ─────────────────────── */

function synthesizeGoalForGrade(studentId: string, grade: string): IepGoal {
  const g = (grade || "").toUpperCase();
  let area = "Reading";
  let goalText = "Will read a grade-level passage and answer 4 of 5 comprehension questions correctly on 4 of 5 monitoring assessments.";
  if (g === "K" || g === "KG") {
    area = "Phonics";
    goalText = "Will identify the letter sound for 20 of 26 letters of the alphabet on 4 of 5 monitoring assessments.";
  } else if (g.startsWith("1")) {
    area = "Phonics";
    goalText = "Will read 8 of 10 grade-level CVC words and short-vowel sight words correctly on 4 of 5 monitoring assessments.";
  } else if (g.startsWith("2")) {
    area = "Math";
    goalText = "Will solve 8 of 10 single-digit addition and subtraction problems within 20 on 4 of 5 monitoring assessments.";
  } else if (g.startsWith("3")) {
    area = "Reading";
    goalText = "Will read a 3rd-grade passage and answer 4 of 5 main-idea / detail questions on 4 of 5 monitoring assessments.";
  } else if (g.startsWith("4")) {
    area = "Math";
    goalText = "Will fluently recall 9 of 10 multiplication facts (×0 through ×10) on 4 of 5 monitoring assessments.";
  } else if (g.startsWith("5")) {
    area = "Writing";
    goalText = "Will write a 5-sentence paragraph with topic sentence, 3 details, and a closing sentence on 4 of 5 monitoring assessments.";
  }
  const now = new Date().toISOString();
  return {
    id: `synth-${studentId}-${Date.now()}`,
    studentId,
    goalText,
    area,
    metThreshold: 80,
    partialThreshold: 50,
    createdDate: now,
    updatedDate: now,
  };
}

/* ── Print template — one page per assignment, kid+goal banner ──── */

function openIepPacketPrintWindow(items: PacketItem[]) {
  const w = window.open("", "_blank", "width=900,height=1100");
  if (!w) return;
  const today = new Date().toLocaleDateString();

  const pages = items.map((it) => {
    const barcodeSvg = bc128svg(it.barcode, 0, 80, true, 2.0);
    const isMCQ = it.questions.some((q) => Array.isArray(q.choices) && q.choices.length > 0);
    const isReflection = it.format === "reflection";
    const lesson = it.lesson;

    const qBlocks = it.questions.map((q) => {
      const choices = Array.isArray(q.choices) ? q.choices : [];
      const body = choices.length > 0
        ? `<div class="choices">${choices.map((c, i) => `
            <div class="choice"><span class="bubble"></span><b>${String.fromCharCode(65 + i)}.</b> ${escapeHtml(c)}</div>
          `).join("")}</div>`
        : isReflection
          ? `<div class="answer-box"></div>`
          : `<div class="answer-line"></div>`;
      return `
        <div class="question">
          <div class="qhead"><span class="qnum">${q.num}</span><span class="qtext">${escapeHtml(q.text)}</span></div>
          ${body}
        </div>`;
    }).join("");

    const lessonHtml = lesson && !isReflection ? `
      <div class="lesson">
        <div class="lesson-pill">📚 Lesson — read this first</div>
        <div class="lesson-title">${escapeHtml(lesson.title || "")}</div>
        ${lesson.intro ? `<div class="lesson-intro">${escapeHtml(lesson.intro)}</div>` : ""}
        ${lesson.body ? `<div class="lesson-body">${escapeHtml(String(lesson.body))}</div>` : ""}
        ${Array.isArray(lesson.keyPoints) && lesson.keyPoints.length ? `<ul class="kp">${lesson.keyPoints.map((kp: string) => `<li>${escapeHtml(kp)}</li>`).join("")}</ul>` : ""}
      </div>
    ` : "";

    return `
      <section class="page">
        <div class="top">
          <div>
            <div class="kicker">${isReflection ? "💭 Reflection" : isMCQ ? "🎯 IEP Quiz" : "📝 IEP Worksheet"} · ${escapeHtml(it.subject)}</div>
            <h1>${escapeHtml(it.student.firstName)} ${escapeHtml(it.student.lastName)}</h1>
            <div class="meta"><span class="pill">${escapeHtml(it.grade)}</span> · ${today}${it.goalSynthesized ? ' · <span class="synth">starter goal (no IEP on file)</span>' : ""}</div>
          </div>
          <div>${barcodeSvg}</div>
        </div>

        <div class="iep-banner">
          <span class="iep-label">🎯 IEP Focus</span>
          ${it.goal.area ? `<span class="iep-area">${escapeHtml(it.goal.area)}:</span>` : ""}
          <span class="iep-text">${escapeHtml(it.goal.goalText)}</span>
        </div>

        ${lessonHtml}
        ${qBlocks}
      </section>
    `;
  }).join("");

  const css = `
    @media print { @page { size: letter; margin: 0.55in; } }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: #111; padding: 0; margin: 0; line-height: 1.5; }
    .page { padding: 16px; page-break-after: always; }
    .page:last-child { page-break-after: auto; }
    h1 { font-size: 22px; margin: 0 0 4px; letter-spacing: -0.02em; }
    .kicker { font-size: 11px; font-weight: 800; letter-spacing: 0.18em; text-transform: uppercase; color: #6d28d9; }
    .meta { font-size: 12px; color: #555; }
    .pill { display: inline-block; padding: 2px 8px; border-radius: 999px; background: #ede9fe; color: #5b21b6; font-size: 11px; font-weight: 800; letter-spacing: 0.06em; text-transform: uppercase; }
    .synth { display: inline-block; padding: 1px 6px; border-radius: 4px; background: #fef3c7; color: #92400e; font-size: 10px; font-weight: 800; }
    .top { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; }
    .iep-banner { margin: 12px 0 16px; padding: 10px 14px; border-radius: 10px; background: linear-gradient(135deg, #faf5ff, #fdf2f8); border: 1.5px solid #d8b4fe; font-size: 13px; }
    .iep-label { display: inline-block; padding: 2px 8px; border-radius: 4px; background: #6d28d9; color: #fff; font-size: 10px; font-weight: 800; letter-spacing: 0.06em; text-transform: uppercase; margin-right: 6px; }
    .iep-area { font-weight: 800; color: #5b21b6; margin-right: 6px; }
    .iep-text { color: #1f1235; }
    .lesson { background: #F0F6FF; border: 2px solid #1B5EA8; border-radius: 8px; padding: 12px 14px; margin-bottom: 14px; }
    .lesson-pill { display: inline-block; padding: 4px 10px; border-radius: 4px; background: #002855; color: #F0A500; font-size: 11px; font-weight: 800; letter-spacing: 0.06em; }
    .lesson-title { font-size: 15px; font-weight: 800; color: #002855; margin: 8px 0 4px; }
    .lesson-intro { font-size: 13px; color: #374151; margin-bottom: 6px; }
    .lesson-body { font-size: 13px; color: #374151; line-height: 1.6; white-space: pre-wrap; }
    .kp { margin: 8px 0 0; padding-left: 20px; font-size: 12.5px; color: #374151; }
    .kp li { margin-bottom: 2px; }
    .question { padding: 10px 0; border-bottom: 1px dashed #ccc; }
    .qhead { display: flex; gap: 8px; align-items: flex-start; }
    .qnum { display: inline-block; min-width: 22px; height: 22px; border-radius: 50%; background: #6d28d9; color: white; text-align: center; line-height: 22px; font-weight: 800; font-size: 12px; flex-shrink: 0; }
    .qtext { font-size: 14px; font-weight: 600; flex: 1; }
    .choices { margin: 6px 0 0 32px; display: grid; grid-template-columns: 1fr 1fr; gap: 4px 24px; }
    .choice { display: flex; align-items: center; gap: 6px; font-size: 13px; }
    .bubble { display: inline-block; width: 16px; height: 16px; border: 1.5px solid #444; border-radius: 50%; flex-shrink: 0; }
    .answer-line { border-bottom: 1px solid #444; height: 26px; margin: 6px 0 0 32px; }
    .answer-box { border: 1px solid #d8b4fe; border-radius: 6px; height: 60px; margin: 6px 0 0 32px; background: #faf5ff; }
  `;

  w.document.write(`<!doctype html><html><head><title>IEP Packet — ${items.length} pages</title><style>${css}</style></head><body>
    ${pages}
    <script>window.addEventListener('load', () => setTimeout(() => window.print(), 300));</script>
  </body></html>`);
  w.document.close();
}

/* ── UI helpers ─────────────────────────────────────────────────── */

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
    width: "100%", padding: "9px 10px", borderRadius: 8,
    background: "rgba(0,0,0,0.30)", color: "white",
    border: "1px solid rgba(255,255,255,0.12)",
    fontSize: 13, outline: "none",
    boxSizing: "border-box",
  };
}
function primary(disabled: boolean): React.CSSProperties {
  return {
    padding: "10px 16px", borderRadius: 10,
    background: disabled
      ? "rgba(168,85,247,0.18)"
      : "linear-gradient(135deg, #6366f1 0%, #a855f7 50%, #ec4899 100%)",
    color: "white", border: "none", fontWeight: 800,
    cursor: disabled ? "not-allowed" : "pointer", fontSize: 14,
    opacity: disabled ? 0.55 : 1,
  };
}
function ghost(): React.CSSProperties {
  return {
    padding: "6px 10px", borderRadius: 8,
    background: "rgba(255,255,255,0.05)", color: "white",
    border: "1px solid rgba(255,255,255,0.15)",
    fontWeight: 700, cursor: "pointer", fontSize: 12,
  };
}

function escapeHtml(s: string): string {
  return (s || "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}
