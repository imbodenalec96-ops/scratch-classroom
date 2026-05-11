// "Snapshot" — one-tap PDF for any kid, two audience flavors × two
// period flavors:
//
//   • Today's   — single-day rollup
//   • Monthly   — month-to-date rollup (calendar month)
//
//   • Parent edition  — formal, full data, signature line, contact info.
//   • Student edition — first-person, kid-friendly, encouraging tone,
//                       big colorful blocks they can take home.
//
// Computed sections (all pulled from local STAR storage, offline):
//   - Grades, photo, pass breakdown, refusal count, vocabulary mastered,
//     streak, total questions, best grade, most-improved subject,
//     prior-period delta, calendar heatmap (monthly), birthday banner.
//
// Deferred (need new infra, not in this pass):
//   - Audio voice-memo from teacher (MediaRecorder + storage)
//   - Sign-and-return QR (needs backend ack endpoint)
//   - Whole-family combined snapshot (separate flow)

import { useMemo, useState } from "react";
import {
  StarStore, countsTowardGrade, letterGradeColor,
  type StarStudent,
  type StarPhoto, type StarTrackerEntry,
} from "../../lib/star/storage.ts";
import { successBeep, loggedBeep } from "../../lib/star/sounds.ts";

type Variant = "parent" | "student";
type Period  = "day" | "month";
type Lang    = "en" | "es";

interface PassBreakdown { bathroom: number; water: number; break: number }

interface DayData {
  grades: Array<{ name: string; subject: string; pct: number; letter: string; counted: boolean; date: string; questionCount: number }>;
  photo: StarPhoto | null;
  passes: number;
  passBreakdown: PassBreakdown;
  refusals: number;
  totalQuestions: number;
  bestGrade: { name: string; pct: number; subject: string } | null;
  vocab: Array<{ term: string; definition: string }>;
  streakDays: number;            // consecutive days ending at `end` with at least one completed assignment
  daysWithWork: string[];        // ISO date strings within range that had completed work
  subjectAverages: Array<{ subject: string; avg: number; n: number }>;
  prior: { avg: number | null; gradesCount: number } | null;  // same-length window immediately before
  mostImproved: { subject: string; delta: number; cur: number; prev: number } | null;
  isBirthday: boolean;
}

function todayPacific(): string {
  const d = new Date(Date.now() - 7 * 3600_000);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

function monthBoundsPacific(refDate: string): { start: string; end: string } {
  const [y, m] = refDate.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const mm = String(m).padStart(2, "0");
  return { start: `${y}-${mm}-01`, end: `${y}-${mm}-${String(last).padStart(2, "0")}` };
}

function inRange(date: string | undefined, start: string, end: string): boolean {
  if (!date) return false;
  return date >= start && date <= end;
}

// Subtract one day from a YYYY-MM-DD string.
function addDays(date: string, days: number): string {
  const d = new Date(date + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

function dayDiff(a: string, b: string): number {
  const da = new Date(a + "T00:00:00Z").getTime();
  const db = new Date(b + "T00:00:00Z").getTime();
  return Math.round((db - da) / 86400000);
}

function gatherData(s: StarStudent, start: string, end: string): DayData {
  const tracker = StarStore.getAsnTrack();
  const photos = StarStore.getPhotos();
  const passLog = StarStore.getPassLog();
  const refusalLog = StarStore.getLog();
  const first = (s.firstName || "").trim().toLowerCase();
  const matchesStudent = (sid: string | undefined, sname: string | undefined): boolean => {
    if (sid && sid === s.id) return true;
    if (!sid && sname) {
      return (sname || "").trim().toLowerCase().split(/\s+/)[0] === first;
    }
    return false;
  };

  // ── Grades + per-grade question count + vocab harvest ────────
  const grades: DayData["grades"] = [];
  const vocabSeen = new Set<string>();
  const vocab: Array<{ term: string; definition: string }> = [];
  for (const t of Object.values(tracker) as StarTrackerEntry[]) {
    for (const sub of t.submissions || []) {
      if (!inRange(sub.completedDate, start, end)) continue;
      if (!matchesStudent(sub.studentId, sub.studentName)) continue;
      const qCount = (typeof sub.maxScore === "number" && sub.maxScore > 0)
        ? sub.maxScore
        : Array.isArray(t.questions) ? t.questions.length : 0;
      grades.push({
        name: t.name, subject: t.subject || "Other",
        pct: sub.pct, letter: sub.letterGrade,
        counted: countsTowardGrade(sub),
        date: sub.completedDate || "",
        questionCount: qCount,
      });
      // Harvest vocab from the lesson the kid actually completed.
      const v = (t.lesson as any)?.vocab as Array<{ term: string; definition: string }> | undefined;
      if (Array.isArray(v)) {
        for (const w of v) {
          const k = (w?.term || "").trim().toLowerCase();
          if (k && !vocabSeen.has(k)) { vocabSeen.add(k); vocab.push({ term: w.term, definition: w.definition }); }
        }
      }
    }
  }
  grades.sort((a, b) => b.date.localeCompare(a.date));

  // ── Photo (most recent in range) ────────────────────────────
  let photo: StarPhoto | null = null;
  for (const list of Object.values(photos)) {
    for (const p of list) {
      const dateStr = new Date(p.ts).toISOString().slice(0, 10);
      if (!inRange(dateStr, start, end)) continue;
      const matches = (p.studentId && p.studentId === s.id) ||
        (!p.studentId && p.studentName && (p.studentName || "").trim().toLowerCase().split(/\s+/)[0] === first);
      if (matches) {
        if (!photo || p.ts > photo.ts) photo = p;
      }
    }
  }

  // ── Passes (count + breakdown by kind) ──────────────────────
  const passBreakdown: PassBreakdown = { bathroom: 0, water: 0, break: 0 };
  let passes = 0;
  for (const p of passLog) {
    const dateStr = (p.startedAt || "").slice(0, 10);
    if (!inRange(dateStr, start, end)) continue;
    if (!matchesStudent(p.studentId, p.studentName)) continue;
    passes += 1;
    const k = String(p.passKind || "").toLowerCase();
    if (k === "bathroom") passBreakdown.bathroom += 1;
    else if (k === "water") passBreakdown.water += 1;
    else if (k === "break") passBreakdown.break += 1;
  }

  // ── Refusals in range ───────────────────────────────────────
  const refusals = refusalLog.filter((r) => {
    if (!inRange(r.date, start, end)) return false;
    if (r.studentId && r.studentId === s.id) return true;
    if (!r.studentId && r.student) {
      return r.student.trim().toLowerCase().split(/\s+/)[0] === first;
    }
    return false;
  }).length;

  // ── Aggregates ───────────────────────────────────────────────
  const totalQuestions = grades.reduce((a, g) => a + (g.questionCount || 0), 0);
  const counted = grades.filter((g) => g.counted);
  let bestGrade: DayData["bestGrade"] = null;
  for (const g of counted) {
    if (!bestGrade || g.pct > bestGrade.pct) {
      bestGrade = { name: g.name, pct: g.pct, subject: g.subject };
    }
  }

  // ── Per-subject averages ────────────────────────────────────
  const bySubject: Record<string, { sum: number; n: number }> = {};
  for (const g of counted) {
    const k = g.subject || "Other";
    (bySubject[k] ||= { sum: 0, n: 0 }).sum += g.pct;
    bySubject[k].n += 1;
  }
  const subjectAverages = Object.entries(bySubject)
    .map(([subject, v]) => ({ subject, avg: Math.round(v.sum / v.n), n: v.n }))
    .sort((a, b) => b.avg - a.avg);

  // ── Days-with-work + streak ─────────────────────────────────
  const dayKeys = new Set<string>();
  for (const g of grades) if (g.date) dayKeys.add(g.date);
  const daysWithWork = Array.from(dayKeys).sort();
  let streakDays = 0;
  for (let i = 0; ; i++) {
    const day = addDays(end, -i);
    if (dayKeys.has(day)) streakDays += 1;
    else break;
  }

  // ── Prior-period comparison (same-length window before) ─────
  const len = dayDiff(start, end) + 1; // inclusive
  const priorEnd = addDays(start, -1);
  const priorStart = addDays(priorEnd, -(len - 1));
  const priorGrades: Array<{ subject: string; pct: number; counted: boolean }> = [];
  for (const t of Object.values(tracker) as StarTrackerEntry[]) {
    for (const sub of t.submissions || []) {
      if (!inRange(sub.completedDate, priorStart, priorEnd)) continue;
      if (!matchesStudent(sub.studentId, sub.studentName)) continue;
      priorGrades.push({
        subject: t.subject || "Other",
        pct: sub.pct,
        counted: countsTowardGrade(sub),
      });
    }
  }
  const priorCounted = priorGrades.filter((g) => g.counted);
  const prior = priorCounted.length === 0
    ? null
    : { avg: Math.round(priorCounted.reduce((a, g) => a + g.pct, 0) / priorCounted.length), gradesCount: priorCounted.length };

  // ── Most-improved subject (current avg vs prior avg) ───────
  const priorBySubject: Record<string, { sum: number; n: number }> = {};
  for (const g of priorCounted) {
    const k = g.subject || "Other";
    (priorBySubject[k] ||= { sum: 0, n: 0 }).sum += g.pct;
    priorBySubject[k].n += 1;
  }
  let mostImproved: DayData["mostImproved"] = null;
  for (const cur of subjectAverages) {
    const p = priorBySubject[cur.subject];
    if (!p || p.n === 0) continue;
    const prevAvg = Math.round(p.sum / p.n);
    const delta = cur.avg - prevAvg;
    if (!mostImproved || delta > mostImproved.delta) {
      mostImproved = { subject: cur.subject, delta, cur: cur.avg, prev: prevAvg };
    }
  }
  if (mostImproved && mostImproved.delta <= 0) mostImproved = null; // only celebrate gains

  // ── Birthday detection (against `end`) ──────────────────────
  let isBirthday = false;
  try {
    const bdayKey = "star_student_birthdays";
    const map: Record<string, string> = JSON.parse(localStorage.getItem(bdayKey) || "{}");
    const stored = map[s.id];
    if (stored) {
      const md = stored.length === 5 ? stored : stored.slice(5);
      const endMD = end.slice(5);
      if (md === endMD) isBirthday = true;
    }
  } catch {}

  return {
    grades, photo, passes, passBreakdown, refusals, totalQuestions,
    bestGrade, vocab, streakDays, daysWithWork, subjectAverages,
    prior, mostImproved, isBirthday,
  };
}

export default function SnapshotGenerator() {
  const [students] = useState<StarStudent[]>(() => StarStore.getStudents());
  const [studentId, setStudentId] = useState("");
  const [variant, setVariant] = useState<Variant>("parent");
  const [period,  setPeriod]  = useState<Period>("day");
  const [lang,    setLang]    = useState<Lang>("en");
  const [teacherName, setTeacherName] = useState("");
  const [teacherMessage, setTeacherMessage] = useState("");
  const [date, setDate] = useState(todayPacific());

  const sel = students.find((s) => s.id === studentId);
  const { start, end } = useMemo(() => {
    return period === "month" ? monthBoundsPacific(date) : { start: date, end: date };
  }, [period, date]);
  const data = useMemo(() => sel ? gatherData(sel, start, end) : null, [sel, start, end]);

  const print = () => {
    if (!sel || !data) return;
    openSnapshotWindow({
      student: sel,
      data,
      variant,
      period,
      lang,
      date,
      start,
      end,
      teacherName: teacherName.trim(),
      teacherMessage: teacherMessage.trim(),
    });
    loggedBeep();
  };

  // Email button uses a basic mailto: with a plain-text summary (HTML
  // bodies aren't supported across mail clients). The full PDF still
  // has to print, but the parent gets a quick text recap right away.
  const emailToParent = () => {
    if (!sel || !data) return;
    const to = sel.parentEmail || "";
    const periodLabel = period === "month"
      ? new Date(start + "T00:00:00").toLocaleDateString("en-US", { year: "numeric", month: "long" })
      : new Date(date + "T00:00:00").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
    const counted = data.grades.filter((g) => g.counted);
    const avg = counted.length ? Math.round(counted.reduce((a, g) => a + g.pct, 0) / counted.length) : null;
    const lines = [
      `${sel.firstName} ${sel.lastName} — ${period === "month" ? "Monthly" : "Today's"} Snapshot`,
      periodLabel,
      "",
      avg !== null ? `Average: ${avg}%` : "No graded work this period.",
      `Assignments completed: ${counted.length}`,
      `Questions answered: ${data.totalQuestions}`,
      data.bestGrade ? `Best work: ${data.bestGrade.name} (${data.bestGrade.pct}%)` : "",
      data.streakDays > 1 ? `Streak: ${data.streakDays} days in a row` : "",
      data.refusals > 0 ? `Refusals to note: ${data.refusals}` : "",
      teacherMessage ? `\nTeacher note: ${teacherMessage}` : "",
      `\n— ${teacherName || "Mrs. Imboden"}`,
    ].filter(Boolean).join("\n");
    const subj = encodeURIComponent(`${sel.firstName}'s ${period === "month" ? "monthly" : "daily"} snapshot — ${periodLabel}`);
    const body = encodeURIComponent(lines);
    window.open(`mailto:${encodeURIComponent(to)}?subject=${subj}&body=${body}`, "_blank");
  };

  return (
    <div style={{ color: "#f5f1e8" }}>
      <div style={{
        display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
        gap: 10, marginBottom: 12,
      }}>
        <Field label="Student">
          <select value={studentId} onChange={(e) => setStudentId(e.target.value)} style={inp()}>
            <option value="">— Pick a student —</option>
            {students.map((s) => (
              <option key={s.id} value={s.id}>
                {s.firstName} {s.lastName} {s.grade ? `(${s.grade})` : ""}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Audience">
          <select value={variant} onChange={(e) => setVariant(e.target.value as Variant)} style={inp()}>
            <option value="parent">👨‍👩‍👧 Parent edition</option>
            <option value="student">🎒 Student edition</option>
          </select>
        </Field>
        <Field label="Period">
          <select value={period} onChange={(e) => setPeriod(e.target.value as Period)} style={inp()}>
            <option value="day">📅 Today's snapshot</option>
            <option value="month">🗓 Monthly snapshot</option>
          </select>
        </Field>
        <Field label={period === "month" ? "Month of" : "Date"}>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={inp()} />
        </Field>
        <Field label="Language">
          <select value={lang} onChange={(e) => setLang(e.target.value as Lang)} style={inp()}>
            <option value="en">English</option>
            <option value="es">Español</option>
          </select>
        </Field>
        <Field label="Teacher (optional)">
          <input value={teacherName} onChange={(e) => setTeacherName(e.target.value)} placeholder="Your name" style={inp()} />
        </Field>
      </div>

      <Field label="Note (optional)">
        <textarea
          value={teacherMessage}
          onChange={(e) => setTeacherMessage(e.target.value)}
          rows={2}
          placeholder={variant === "parent"
            ? "A line for the parent — e.g. 'Anna had a strong reading day…'"
            : "A line just for the kid — e.g. 'I'm proud of how you stayed focused today!'"}
          style={{ ...inp(), resize: "vertical", fontFamily: "inherit" }}
        />
      </Field>

      {sel && data && (
        <div style={{
          marginTop: 14, padding: 14, borderRadius: 12,
          background: "linear-gradient(135deg, rgba(168,85,247,0.10), rgba(99,102,241,0.05))",
          border: "1px solid rgba(168,85,247,0.30)",
        }}>
          <div style={{
            fontSize: 10, fontWeight: 800, letterSpacing: "0.22em", textTransform: "uppercase",
            color: "#f9a8d4", marginBottom: 6,
          }}>Preview</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 8 }}>
            <Stat n={data.grades.length}    l={period === "month" ? "Grades this month" : "Grades"} />
            <Stat n={data.totalQuestions}    l="Questions answered" />
            <Stat n={data.streakDays}        l="Day streak" />
            <Stat n={data.passes}            l={period === "month" ? "Passes this month" : "Passes"} />
            <Stat n={data.vocab.length}      l="Vocab words" />
            <Stat n={data.refusals}          l="Refusals" />
          </div>
        </div>
      )}

      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 12, gap: 8, flexWrap: "wrap" }}>
        {variant === "parent" && (
          <button
            onClick={emailToParent}
            disabled={!sel || !(sel.parentEmail)}
            title={sel && !sel.parentEmail ? "Add a parent email in /star → Settings to enable" : "Open mail client with a quick text recap"}
            style={ghostBtn(!sel || !sel?.parentEmail)}
          >
            ✉️ Email parent recap
          </button>
        )}
        <button onClick={print} disabled={!sel} style={primaryBtn(!sel)}>
          🖨 Print {period === "month" ? "Monthly" : "Today's"} {variant === "parent" ? "Parent" : "Student"} Snapshot
        </button>
      </div>
    </div>
  );
}

/* ── Print template ──────────────────────────────────────────────── */

function openSnapshotWindow(args: {
  student: StarStudent;
  data: DayData;
  variant: Variant;
  period: Period;
  lang: Lang;
  date: string;
  start: string;
  end: string;
  teacherName: string;
  teacherMessage: string;
}) {
  const w = window.open("", "_blank", "width=900,height=1100");
  if (!w) return;
  const { student, data, variant, period, lang, date, start, end, teacherName, teacherMessage } = args;
  const localeTag = lang === "es" ? "es-ES" : "en-US";
  const periodLabel = period === "month"
    ? new Date(start + "T00:00:00").toLocaleDateString(localeTag, { year: "numeric", month: "long" })
    : new Date(date + "T00:00:00").toLocaleDateString(localeTag, { weekday: "long", year: "numeric", month: "long", day: "numeric" });
  const titleWord = period === "month" ? "Monthly" : "Today's";

  const html = variant === "parent"
    ? renderParent(student, data, periodLabel, titleWord, teacherName, teacherMessage, period, start, end, lang)
    : renderStudent(student, data, periodLabel, titleWord, teacherName, teacherMessage, period, lang);

  w.document.write(html);
  w.document.close();
  successBeep();
}

// ── Translation dictionary (parent + student static labels) ────
const STR: Record<Lang, Record<string, string>> = {
  en: {
    snapshot: "Snapshot", todays: "Today's", monthly: "Monthly", parentEd: "Parent Edition",
    studentEd: "Student Edition", grade: "Grade", today: "today", thisMonth: "this month",
    average: "average", noGradesYet: "No grades yet",
    grades: "Grades", subject: "Subject", assignment: "Assignment", date: "Date",
    score: "Score", vsPrior: "vs. prior period", noChange: "no change",
    bestWork: "Best work", improvedMost: "Most-improved subject",
    photo: "Sample of work", vocab: "Vocabulary learned",
    questionsAnswered: "Questions answered", streak: "Day streak",
    passes: "Bathroom passes", break: "Sensory breaks", water: "Water breaks",
    refusalsToNote: "Work refusals to note this period",
    bathroom: "Bathroom",
    teacherSig: "Teacher signature", parentAck: "Parent acknowledged",
    sentHome: "Sent home from STAR",
    happyBirthday: "Happy Birthday!",
    monthlyAtAGlance: "Month at a glance",
    subjectBars: "Subject averages",
    fromTeacher: "From your teacher",
    noGradedWork: "No graded work this period.",
    learnedWords: "Words learned",
  },
  es: {
    snapshot: "Resumen", todays: "de Hoy", monthly: "Mensual", parentEd: "Edición para Padres",
    studentEd: "Edición para el Estudiante", grade: "Grado", today: "hoy", thisMonth: "este mes",
    average: "promedio", noGradesYet: "Aún no hay calificaciones",
    grades: "Calificaciones", subject: "Materia", assignment: "Tarea", date: "Fecha",
    score: "Puntuación", vsPrior: "vs. periodo anterior", noChange: "sin cambio",
    bestWork: "Mejor trabajo", improvedMost: "Materia con más mejora",
    photo: "Muestra de trabajo", vocab: "Vocabulario aprendido",
    questionsAnswered: "Preguntas respondidas", streak: "Días seguidos",
    passes: "Pases al baño", break: "Pausas sensoriales", water: "Pausas de agua",
    refusalsToNote: "Negativas a trabajar este periodo",
    bathroom: "Baño",
    teacherSig: "Firma del maestro", parentAck: "Firma del padre/madre",
    sentHome: "Enviado a casa desde STAR",
    happyBirthday: "¡Feliz cumpleaños!",
    monthlyAtAGlance: "El mes de un vistazo",
    subjectBars: "Promedios por materia",
    fromTeacher: "De su maestro/a",
    noGradedWork: "No hubo trabajo calificado en este periodo.",
    learnedWords: "Palabras aprendidas",
  },
};

function tr(lang: Lang, key: keyof typeof STR["en"]): string {
  return STR[lang][key] || STR.en[key] || String(key);
}

function renderParent(s: StarStudent, d: DayData, periodLabel: string, titleWord: string, teacher: string, message: string, period: Period, start: string, end: string, lang: Lang): string {
  const counted = d.grades.filter((g) => g.counted);
  const avg = counted.length ? Math.round(counted.reduce((a, g) => a + g.pct, 0) / counted.length) : null;
  const periodLower = titleWord === "Monthly" ? tr(lang, "thisMonth") : tr(lang, "today");

  // Trend strip — period vs prior
  const trend = (avg !== null && d.prior?.avg != null)
    ? (() => {
        const delta = avg - d.prior!.avg;
        const arrow = delta > 0 ? "▲" : delta < 0 ? "▼" : "■";
        const color = delta > 0 ? "#16a34a" : delta < 0 ? "#dc2626" : "#6b7280";
        const lbl = delta === 0 ? tr(lang, "noChange") : `${delta > 0 ? "+" : ""}${delta} pts`;
        return `<span class="trend" style="color:${color}">${arrow} ${escapeHtml(lbl)} <small>${escapeHtml(tr(lang, "vsPrior"))}</small></span>`;
      })()
    : "";

  // Grades table
  const grades = d.grades.length === 0
    ? `<div class="empty">${escapeHtml(tr(lang, "noGradedWork"))}</div>`
    : `<table>
        <thead><tr><th>${escapeHtml(tr(lang, "subject"))}</th><th>${escapeHtml(tr(lang, "assignment"))}</th>${titleWord === "Monthly" ? `<th>${escapeHtml(tr(lang, "date"))}</th>` : ""}<th>${escapeHtml(tr(lang, "score"))}</th><th>${escapeHtml(tr(lang, "grade"))}</th></tr></thead>
        <tbody>${d.grades.map((g) => {
          const c = g.counted ? letterGradeColor(g.letter) : "#94a3b8";
          const isBest = !!d.bestGrade && g.name === d.bestGrade.name && g.pct === d.bestGrade.pct;
          const datePart = titleWord === "Monthly"
            ? `<td>${g.date ? new Date(g.date + "T00:00:00").toLocaleDateString(lang === "es" ? "es-ES" : "en-US", { month: "short", day: "numeric" }) : "—"}</td>`
            : "";
          return `<tr${isBest ? ` style="background:#fef3c7"` : ""}>
            <td>${escapeHtml(g.subject)}</td>
            <td>${escapeHtml(g.name)}${isBest ? ' <span class="best-pill">⭐</span>' : ""}</td>
            ${datePart}
            <td>${g.counted ? `${g.pct}%` : "—"}</td>
            <td><span class="badge" style="background:${c}25;color:${c};border:1px solid ${c}">${g.counted ? g.letter : "—"}</span></td>
          </tr>`;
        }).join("")}</tbody>
      </table>`;

  // Subject bar chart (only when there are at least 2 subjects)
  const subjectBars = d.subjectAverages.length >= 2 ? `
    <h2>📊 ${escapeHtml(tr(lang, "subjectBars"))}</h2>
    <div class="bars">
      ${d.subjectAverages.map((sa) => {
        const c = letterGradeColor(sa.avg >= 90 ? "A" : sa.avg >= 80 ? "B" : sa.avg >= 70 ? "C" : sa.avg >= 60 ? "D" : "F");
        return `<div class="bar-row">
          <div class="bar-lbl">${escapeHtml(sa.subject)}</div>
          <div class="bar-track"><div class="bar-fill" style="width:${sa.avg}%;background:${c}"></div></div>
          <div class="bar-val">${sa.avg}%</div>
        </div>`;
      }).join("")}
    </div>
  ` : "";

  // Calendar heatmap (monthly only)
  const heatmap = period === "month" ? renderHeatmap(start, end, new Set(d.daysWithWork), lang) : "";

  // Best-grade callout
  const bestCallout = d.bestGrade ? `
    <div class="callout best">
      <div class="callout-lbl">⭐ ${escapeHtml(tr(lang, "bestWork"))}</div>
      <div class="callout-body"><b>${escapeHtml(d.bestGrade.name)}</b> — ${d.bestGrade.pct}% · ${escapeHtml(d.bestGrade.subject)}</div>
    </div>
  ` : "";

  // Most-improved subject (only if positive delta + only meaningful for monthly)
  const improvedCallout = (period === "month" && d.mostImproved) ? `
    <div class="callout improved">
      <div class="callout-lbl">📈 ${escapeHtml(tr(lang, "improvedMost"))}</div>
      <div class="callout-body"><b>${escapeHtml(d.mostImproved.subject)}</b> +${d.mostImproved.delta} pts (${d.mostImproved.prev}% → ${d.mostImproved.cur}%)</div>
    </div>
  ` : "";

  // Refusal callout (parent only)
  const refusalCallout = d.refusals > 0 ? `
    <div class="callout refusal">
      <div class="callout-lbl">⚠️ ${escapeHtml(tr(lang, "refusalsToNote"))}</div>
      <div class="callout-body">${d.refusals}</div>
    </div>
  ` : "";

  // Pass breakdown
  const passBreakdown = d.passes > 0 ? `
    <h2>🚪 ${escapeHtml(tr(lang, "passes"))}</h2>
    <div class="pass-row">
      <span class="pass-chip">🚻 ${escapeHtml(tr(lang, "bathroom"))}: <b>${d.passBreakdown.bathroom}</b></span>
      <span class="pass-chip">💧 ${escapeHtml(tr(lang, "water"))}: <b>${d.passBreakdown.water}</b></span>
      <span class="pass-chip">🛋 ${escapeHtml(tr(lang, "break"))}: <b>${d.passBreakdown["break"]}</b></span>
    </div>
  ` : "";

  // Vocabulary mastered
  const vocabHtml = d.vocab.length > 0 ? `
    <h2>📖 ${escapeHtml(tr(lang, "vocab"))}</h2>
    <div class="vocab-grid">
      ${d.vocab.slice(0, 24).map((v) => `
        <div class="vocab-card">
          <div class="vocab-term">${escapeHtml(v.term)}</div>
          <div class="vocab-def">${escapeHtml(v.definition)}</div>
        </div>
      `).join("")}
    </div>
  ` : "";

  // Birthday banner
  const birthday = d.isBirthday ? `<div class="bday">🎂 ${escapeHtml(tr(lang, "happyBirthday"))}</div>` : "";

  // Fun stats row
  const funStats = `
    <div class="stats-row">
      <div class="stat-card"><div class="stat-n">${d.totalQuestions}</div><div class="stat-l">${escapeHtml(tr(lang, "questionsAnswered"))}</div></div>
      <div class="stat-card"><div class="stat-n">${d.streakDays}</div><div class="stat-l">${escapeHtml(tr(lang, "streak"))}</div></div>
      <div class="stat-card"><div class="stat-n">${counted.length}</div><div class="stat-l">${escapeHtml(tr(lang, "assignment"))}</div></div>
      <div class="stat-card"><div class="stat-n">${d.vocab.length}</div><div class="stat-l">${escapeHtml(tr(lang, "learnedWords"))}</div></div>
    </div>
  `;

  return `<!doctype html><html lang="${lang}"><head><title>${escapeHtml(titleWord)} Snapshot — ${escapeHtml(s.firstName)} ${escapeHtml(s.lastName)}</title>
    <style>${PARENT_CSS}</style></head>
    <body>
      <div class="toolbar no-print">
        <div>📤 ${escapeHtml(s.firstName)}'s ${escapeHtml(tr(lang, "snapshot"))} — ${escapeHtml(tr(lang, "parentEd"))}</div>
        <button onclick="window.print()">🖨 Print</button>
      </div>
      <section class="page">
        ${birthday}
        <header class="hero">
          <div>
            <div class="kicker">${escapeHtml(titleWord === "Monthly" ? tr(lang, "monthly") : tr(lang, "todays"))} ${escapeHtml(tr(lang, "snapshot"))}</div>
            <h1>${escapeHtml(s.firstName)} ${escapeHtml(s.lastName)}</h1>
            <div class="meta">${escapeHtml(periodLabel)}${s.grade ? ` · ${escapeHtml(tr(lang, "grade"))} ${escapeHtml(s.grade)}` : ""}</div>
          </div>
          <div class="hero-stat">
            ${avg !== null ? `<div class="big">${avg}<span>%</span></div><div class="small">${escapeHtml(periodLower)} ${escapeHtml(tr(lang, "average"))}</div>${trend}` : `<div class="small">${escapeHtml(tr(lang, "noGradesYet"))} ${escapeHtml(periodLower)}</div>`}
          </div>
        </header>

        ${message ? `<div class="msg"><b>${escapeHtml(tr(lang, "fromTeacher"))}${teacher ? ` (${escapeHtml(teacher)})` : ""}:</b> ${escapeHtml(message)}</div>` : ""}

        ${funStats}

        ${bestCallout}
        ${improvedCallout}
        ${refusalCallout}

        <h2>📚 ${escapeHtml(tr(lang, "grades"))} ${escapeHtml(periodLower)}</h2>
        ${grades}

        ${subjectBars}

        ${heatmap}

        ${passBreakdown}

        ${vocabHtml}

        ${d.photo ? `
          <h2>📷 ${escapeHtml(tr(lang, "photo"))}</h2>
          <div class="photo-frame">
            <img src="${d.photo.dataUrl}" alt="Sample of student work" />
            ${d.photo.note ? `<div class="caption">${escapeHtml(d.photo.note)}</div>` : ""}
          </div>
        ` : ""}

        <div class="footer">
          <div>
            <div class="signlbl">${escapeHtml(tr(lang, "teacherSig"))}</div>
            <div class="signline"></div>
            ${teacher ? `<div class="signname">${escapeHtml(teacher)}</div>` : ""}
          </div>
          <div>
            <div class="signlbl">${escapeHtml(tr(lang, "parentAck"))}</div>
            <div class="signline"></div>
          </div>
        </div>

        <div class="meta footnote">
          ${escapeHtml(tr(lang, "sentHome"))} · ${escapeHtml(periodLabel)}
          ${s.parentEmail ? ` · ${escapeHtml(s.parentEmail)}` : ""}
        </div>
      </section>
      <script>window.addEventListener("load",()=>setTimeout(()=>window.print(),250))</script>
    </body></html>`;
}

// Mini calendar heatmap of the month — one cell per day, green if work
// was completed, gray if not, dim border if outside the month.
function renderHeatmap(start: string, end: string, daysWithWork: Set<string>, lang: Lang): string {
  const startD = new Date(start + "T00:00:00Z");
  const endD = new Date(end + "T00:00:00Z");
  const firstDow = startD.getUTCDay(); // 0=Sun
  const totalDays = Math.round((endD.getTime() - startD.getTime()) / 86400000) + 1;
  const cells: string[] = [];
  for (let i = 0; i < firstDow; i++) cells.push(`<div class="hm-cell hm-blank"></div>`);
  for (let i = 0; i < totalDays; i++) {
    const d = new Date(startD.getTime() + i * 86400000);
    const iso = d.toISOString().slice(0, 10);
    const has = daysWithWork.has(iso);
    cells.push(`<div class="hm-cell${has ? " hm-on" : ""}" title="${iso}">${d.getUTCDate()}</div>`);
  }
  const dows = lang === "es"
    ? ["D", "L", "M", "X", "J", "V", "S"]
    : ["S", "M", "T", "W", "T", "F", "S"];
  return `
    <h2>🗓 ${escapeHtml(tr(lang, "monthlyAtAGlance"))}</h2>
    <div class="hm">
      <div class="hm-row hm-head">${dows.map((d) => `<div class="hm-cell hm-dow">${escapeHtml(d)}</div>`).join("")}</div>
      <div class="hm-grid">${cells.join("")}</div>
    </div>
  `;
}

function renderStudent(s: StarStudent, d: DayData, periodLabel: string, titleWord: string, teacher: string, message: string, period: Period, lang: Lang): string {
  const isMonth = titleWord === "Monthly";
  const counted = d.grades.filter((g) => g.counted);
  const aCount = counted.filter((g) => g.letter === "A").length;
  const bCount = counted.filter((g) => g.letter === "B").length;
  const cheers: string[] = [];
  if (lang === "es") {
    if (aCount > 0) cheers.push(`${aCount} ${aCount === 1 ? "calificación de A" : "calificaciones de A"} 🎉`);
    if (bCount > 0) cheers.push(`${bCount} ${bCount === 1 ? "B" : "Bs"} sólidas`);
    if (d.streakDays >= 2) cheers.push(`${d.streakDays} días seguidos de trabajo 🔥`);
    if (d.bestGrade) cheers.push(`¡Mejor trabajo: ${d.bestGrade.pct}%!`);
    if (d.photo) cheers.push("Foto de trabajo increíble");
    if (d.totalQuestions >= 20) cheers.push(`${d.totalQuestions} preguntas respondidas`);
    if (cheers.length === 0) cheers.push("Te presentaste y lo intentaste");
  } else {
    if (aCount > 0) cheers.push(`${aCount} A${aCount === 1 ? "" : "s"}!`);
    if (bCount > 0) cheers.push(`${bCount} solid B${bCount === 1 ? "" : "s"}`);
    if (d.streakDays >= 2) cheers.push(`🔥 ${d.streakDays}-day streak`);
    if (d.bestGrade) cheers.push(`Best work: ${d.bestGrade.pct}%`);
    if (d.photo) cheers.push("Awesome photo of your work");
    if (d.totalQuestions >= 20) cheers.push(`${d.totalQuestions} questions answered`);
    if (cheers.length === 0) cheers.push("Showed up and tried");
  }

  const periodLower = isMonth ? tr(lang, "thisMonth") : tr(lang, "today");
  const grades = d.grades.length === 0
    ? `<div class="kid-empty">${escapeHtml(lang === "es" ? `Hoy no hay trabajo calificado — ¡está bien!` : `No work scored ${periodLower} — that's OK!`)}</div>`
    : `<div class="kid-grades">${d.grades.map((g) => {
        const c = g.counted ? letterGradeColor(g.letter) : "#94a3b8";
        const isBest = !!d.bestGrade && g.name === d.bestGrade.name && g.pct === d.bestGrade.pct;
        const dateBit = isMonth && g.date ? ` · ${new Date(g.date + "T00:00:00").toLocaleDateString(lang === "es" ? "es-ES" : "en-US", { month: "short", day: "numeric" })}` : "";
        return `<div class="kid-grade" style="border-color:${c}; background:${c}15">
          ${isBest ? `<div class="kid-best-badge">⭐ ${escapeHtml(tr(lang, "bestWork"))}</div>` : ""}
          <div class="kid-grade-letter" style="color:${c}">${g.counted ? g.letter : "—"}</div>
          <div class="kid-grade-info">
            <div class="kid-grade-name">${escapeHtml(g.name)}</div>
            <div class="kid-grade-meta">${escapeHtml(g.subject)}${g.counted ? ` · ${g.pct}%` : ""}${dateBit}</div>
          </div>
        </div>`;
      }).join("")}</div>`;

  // Streak ribbon (kid edition only — feels duo-like)
  const streakRibbon = d.streakDays >= 2 ? `
    <div class="kid-streak">
      <div class="kid-streak-fire">🔥</div>
      <div class="kid-streak-num">${d.streakDays}</div>
      <div class="kid-streak-lbl">${escapeHtml(lang === "es" ? "días seguidos!" : "day streak!")}</div>
    </div>
  ` : "";

  // Vocabulary I learned
  const vocabHtml = d.vocab.length > 0 ? `
    <h2>📖 ${escapeHtml(lang === "es" ? "¡Aprendí estas palabras!" : "Words I learned!")}</h2>
    <div class="kid-vocab">
      ${d.vocab.slice(0, 12).map((v) => `
        <div class="kid-vocab-card">
          <div class="kid-vocab-term">${escapeHtml(v.term)}</div>
          <div class="kid-vocab-def">${escapeHtml(v.definition)}</div>
        </div>
      `).join("")}
    </div>
  ` : "";

  // Birthday
  const birthday = d.isBirthday ? `<div class="kid-bday">🎂🎈 ${escapeHtml(tr(lang, "happyBirthday"))} 🎈🎂</div>` : "";

  // Mini fun-stats row
  const funStats = `
    <div class="kid-stats">
      <div class="kid-stat"><div class="kid-stat-n">${d.totalQuestions}</div><div class="kid-stat-l">${escapeHtml(lang === "es" ? "preguntas" : "questions")}</div></div>
      <div class="kid-stat"><div class="kid-stat-n">${counted.length}</div><div class="kid-stat-l">${escapeHtml(lang === "es" ? "tareas" : "assignments")}</div></div>
      <div class="kid-stat"><div class="kid-stat-n">${d.vocab.length}</div><div class="kid-stat-l">${escapeHtml(lang === "es" ? "palabras" : "words")}</div></div>
    </div>
  `;

  void period;

  return `<!doctype html><html lang="${lang}"><head><title>${escapeHtml(s.firstName)}'s ${escapeHtml(isMonth ? "Month" : "Day")}</title>
    <style>${STUDENT_CSS}</style></head>
    <body>
      <div class="toolbar no-print">
        <div>🎒 ${escapeHtml(s.firstName)}'s ${escapeHtml(titleWord)} ${escapeHtml(tr(lang, "snapshot"))} — ${escapeHtml(tr(lang, "studentEd"))}</div>
        <button onclick="window.print()">🖨 Print</button>
      </div>
      <section class="kid-page">
        ${birthday}
        <header class="kid-hero">
          <div class="kid-confetti">🎉</div>
          <div>
            <div class="kid-kicker">${escapeHtml(periodLabel)}</div>
            <h1>${escapeHtml(lang === "es" ? `¡Hola, ${s.firstName}!` : `Hi, ${s.firstName}!`)}</h1>
            <div class="kid-sub">${escapeHtml(lang === "es" ? `Mira todo lo que hiciste ${periodLower} 👇` : `Look at everything you did ${periodLower} 👇`)}</div>
          </div>
        </header>

        ${streakRibbon}

        ${message ? `<div class="kid-msg">💬 ${escapeHtml(message)}${teacher ? ` <span class="kid-msg-from">— ${escapeHtml(teacher)}</span>` : ""}</div>` : ""}

        <div class="kid-cheer">
          <div class="kid-cheer-label">⭐ ${escapeHtml(lang === "es" ? "Lo lograste con:" : (isMonth ? "This month you crushed it with:" : "Today you crushed it with:"))}</div>
          <div class="kid-cheer-list">${cheers.map((c) => `<span class="kid-chip">${escapeHtml(c)}</span>`).join("")}</div>
        </div>

        ${funStats}

        <h2>📚 ${escapeHtml(lang === "es" ? `Mi trabajo ${periodLower}` : `My work ${periodLower}`)}</h2>
        ${grades}

        ${vocabHtml}

        ${d.photo ? `
          <h2>📷 ${escapeHtml(lang === "es" ? "¡Mira lo que hice!" : "Look what I made!")}</h2>
          <div class="kid-photo">
            <img src="${d.photo.dataUrl}" alt="My work" />
          </div>
        ` : ""}

        <div class="kid-end">
          <div class="kid-end-line">${escapeHtml(lang === "es" ? "¡Choca esos cinco! ✋" : "High five! ✋")} ${escapeHtml(isMonth ? (lang === "es" ? "¡Mes increíble!" : "Awesome month!") : (lang === "es" ? "¡Hasta mañana!" : "See you tomorrow."))}</div>
        </div>
      </section>
      <script>window.addEventListener("load",()=>setTimeout(()=>window.print(),250))</script>
    </body></html>`;
}

const PARENT_CSS = `
  @media print { @page { size: letter; margin: 0.55in; } .no-print { display: none; } }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: #111; padding: 0; margin: 0; line-height: 1.55; }
  .toolbar { padding: 12px 24px; background: #faf5ff; border-bottom: 1px solid #d8b4fe; display: flex; justify-content: space-between; align-items: center; font-weight: 800; color: #4c1d95; }
  .toolbar button { padding: 8px 14px; border-radius: 8px; border: 1px solid #6d28d9; background: #6d28d9; color: white; font-weight: 700; cursor: pointer; }
  .page { padding: 24px; max-width: 720px; margin: 0 auto; }
  .hero { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; padding: 16px 18px; border-radius: 14px; background: linear-gradient(135deg, #faf5ff, #fdf2f8); border: 1.5px solid #d8b4fe; }
  .hero h1 { margin: 4px 0 6px; font-size: 28px; letter-spacing: -0.025em; }
  .kicker { font-size: 10px; font-weight: 800; letter-spacing: 0.22em; text-transform: uppercase; color: #6d28d9; }
  .meta { font-size: 12px; color: #555; }
  .hero-stat { text-align: right; }
  .hero-stat .big { font-size: 44px; font-weight: 900; color: #6d28d9; line-height: 1; }
  .hero-stat .big span { font-size: 22px; }
  .hero-stat .small { font-size: 11px; color: #666; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; }
  h2 { font-size: 14px; margin: 20px 0 8px; letter-spacing: 0.04em; text-transform: uppercase; color: #4c1d95; border-bottom: 2px solid #ede9fe; padding-bottom: 4px; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th { text-align: left; padding: 6px 8px; background: #faf5ff; border-bottom: 2px solid #d8b4fe; font-size: 10px; font-weight: 800; letter-spacing: 0.08em; text-transform: uppercase; color: #4c1d95; }
  td { padding: 6px 8px; border-bottom: 1px solid #f3f4f6; vertical-align: middle; }
  .badge { display: inline-block; padding: 1px 8px; border-radius: 999px; font-size: 11px; font-weight: 800; }
  ul.iep { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 6px; }
  ul.iep li { padding: 8px 12px; border-radius: 8px; background: #faf5ff; border: 1px solid #d8b4fe; font-size: 13px; }
  .iep-pill { display: inline-block; padding: 1px 8px; border-radius: 999px; font-size: 10px; font-weight: 800; letter-spacing: 0.06em; text-transform: uppercase; margin-right: 6px; }
  .note { margin-top: 4px; font-size: 11px; color: #555; font-style: italic; }
  .empty { padding: 14px; background: #faf5ff; border: 1px dashed #d8b4fe; border-radius: 8px; color: #6d28d9; font-size: 12px; text-align: center; }
  .photo-frame { border: 1.5px solid #d8b4fe; border-radius: 10px; overflow: hidden; background: #faf5ff; }
  .photo-frame img { width: 100%; max-height: 320px; object-fit: contain; display: block; background: white; }
  .photo-frame .caption { padding: 6px 10px; font-size: 11px; color: #555; font-style: italic; }
  .msg { margin: 14px 0; padding: 12px 14px; border-left: 4px solid #ec4899; background: #fdf2f8; border-radius: 0 8px 8px 0; font-size: 13px; color: #831843; }
  .footer { margin-top: 28px; display: grid; grid-template-columns: 1fr 1fr; gap: 24px; }
  .signlbl { font-size: 10px; font-weight: 800; letter-spacing: 0.10em; text-transform: uppercase; color: #555; }
  .signline { border-bottom: 1.5px solid #444; height: 30px; margin-top: 4px; }
  .signname { font-size: 11px; color: #777; margin-top: 2px; }
  .footnote { margin-top: 18px; font-size: 10px; text-align: center; color: #888; }
  .trend { display: inline-block; margin-top: 4px; font-size: 11px; font-weight: 800; }
  .trend small { font-weight: 600; opacity: 0.7; margin-left: 4px; }
  .stats-row { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin: 12px 0 16px; }
  .stat-card { padding: 8px 10px; border-radius: 10px; background: linear-gradient(135deg, #f5f3ff, #fdf2f8); border: 1px solid #d8b4fe; text-align: center; }
  .stat-n { font-size: 20px; font-weight: 900; color: #6d28d9; line-height: 1; }
  .stat-l { font-size: 9px; font-weight: 800; letter-spacing: 0.10em; text-transform: uppercase; color: #6d28d9; opacity: 0.75; margin-top: 3px; }
  .callout { display: flex; gap: 10px; align-items: baseline; padding: 10px 14px; border-radius: 10px; margin: 8px 0; font-size: 13px; }
  .callout.best { background: #fef3c7; border: 1px solid #fbbf24; color: #92400e; }
  .callout.improved { background: #ecfdf5; border: 1px solid #10b981; color: #065f46; }
  .callout.refusal { background: #fef2f2; border: 1px solid #f87171; color: #991b1b; }
  .callout-lbl { font-size: 10px; font-weight: 800; letter-spacing: 0.12em; text-transform: uppercase; flex-shrink: 0; }
  .callout-body { flex: 1; }
  .best-pill { display: inline-block; font-size: 12px; }
  .bars { display: flex; flex-direction: column; gap: 6px; }
  .bar-row { display: grid; grid-template-columns: 90px 1fr 50px; gap: 8px; align-items: center; font-size: 12px; }
  .bar-lbl { font-weight: 700; color: #4c1d95; }
  .bar-track { height: 14px; background: #f3f4f6; border-radius: 7px; overflow: hidden; border: 1px solid #e5e7eb; }
  .bar-fill { height: 100%; border-radius: 7px; }
  .bar-val { font-weight: 800; color: #4c1d95; text-align: right; }
  .pass-row { display: flex; gap: 8px; flex-wrap: wrap; }
  .pass-chip { padding: 6px 12px; border-radius: 999px; background: #faf5ff; border: 1px solid #d8b4fe; font-size: 12px; color: #4c1d95; }
  .vocab-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 6px; }
  .vocab-card { padding: 6px 9px; border-radius: 6px; background: #f0fdf4; border: 1px solid #86efac; }
  .vocab-term { font-weight: 800; font-size: 12px; color: #065f46; }
  .vocab-def { font-size: 11px; color: #064e3b; margin-top: 2px; }
  .bday { padding: 10px 14px; margin-bottom: 12px; border-radius: 12px; background: linear-gradient(90deg, #fce7f3, #fef3c7, #ede9fe); font-size: 16px; font-weight: 800; text-align: center; color: #831843; border: 2px dashed #ec4899; }
  .hm { font-family: -apple-system, sans-serif; }
  .hm-row, .hm-grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 3px; }
  .hm-grid { margin-top: 3px; }
  .hm-cell { aspect-ratio: 1 / 1; border-radius: 4px; background: #f3f4f6; border: 1px solid #e5e7eb; font-size: 9px; color: #6b7280; display: flex; align-items: flex-start; justify-content: flex-start; padding: 2px 4px; font-weight: 700; }
  .hm-cell.hm-on { background: #6d28d9; border-color: #6d28d9; color: white; }
  .hm-cell.hm-blank { background: transparent; border: none; }
  .hm-cell.hm-dow { aspect-ratio: auto; padding: 4px 0; justify-content: center; align-items: center; background: transparent; border: none; font-size: 9px; color: #6d28d9; font-weight: 800; letter-spacing: 0.06em; }
`;

const STUDENT_CSS = `
  @media print { @page { size: letter; margin: 0.5in; } .no-print { display: none; } }
  body { font-family: "Comic Sans MS", -apple-system, BlinkMacSystemFont, sans-serif; color: #1f1235; padding: 0; margin: 0; line-height: 1.5; background: #fdf4ff; }
  .toolbar { padding: 12px 24px; background: linear-gradient(135deg, #ec4899, #a855f7); color: white; display: flex; justify-content: space-between; align-items: center; font-weight: 800; font-family: -apple-system, sans-serif; }
  .toolbar button { padding: 8px 14px; border-radius: 999px; border: none; background: white; color: #6d28d9; font-weight: 800; cursor: pointer; }
  .kid-page { padding: 24px; max-width: 720px; margin: 0 auto; background: white; border-radius: 16px; box-shadow: 0 12px 40px rgba(168,85,247,0.18); margin-top: 16px; margin-bottom: 16px; }
  .kid-hero { display: flex; align-items: center; gap: 16px; padding: 18px; border-radius: 16px; background: linear-gradient(135deg, #fce7f3, #ede9fe, #c7d2fe); margin-bottom: 12px; }
  .kid-confetti { font-size: 64px; line-height: 1; }
  .kid-hero h1 { margin: 4px 0; font-size: 36px; color: #6d28d9; letter-spacing: -0.02em; }
  .kid-kicker { font-size: 11px; font-weight: 800; color: #be185d; text-transform: uppercase; letter-spacing: 0.10em; }
  .kid-sub { font-size: 14px; color: #6b21a8; font-weight: 700; }
  .kid-msg { padding: 12px 16px; border-radius: 14px; background: #fff7ed; border: 2px solid #fdba74; margin-bottom: 14px; font-size: 15px; color: #7c2d12; font-weight: 600; }
  .kid-msg-from { font-style: italic; color: #c2410c; }
  .kid-cheer { padding: 14px 16px; border-radius: 14px; background: linear-gradient(135deg, #fef3c7, #fce7f3); border: 2px solid #fbbf24; margin-bottom: 16px; }
  .kid-cheer-label { font-size: 14px; font-weight: 800; color: #b45309; margin-bottom: 6px; }
  .kid-cheer-list { display: flex; flex-wrap: wrap; gap: 6px; }
  .kid-chip { display: inline-block; padding: 4px 12px; border-radius: 999px; background: white; border: 2px solid #ec4899; color: #be185d; font-size: 13px; font-weight: 800; }
  h2 { font-size: 18px; margin: 18px 0 10px; color: #6d28d9; }
  .kid-grades { display: flex; flex-direction: column; gap: 8px; }
  .kid-grade { display: flex; align-items: center; gap: 12px; padding: 10px 14px; border-radius: 12px; border: 2px solid; }
  .kid-grade-letter { font-size: 32px; font-weight: 900; min-width: 38px; text-align: center; }
  .kid-grade-info { flex: 1; }
  .kid-grade-name { font-size: 15px; font-weight: 700; color: #1f1235; }
  .kid-grade-meta { font-size: 12px; color: #6b21a8; font-weight: 600; }
  .kid-iep { display: flex; flex-direction: column; gap: 8px; }
  .kid-iep-row { padding: 10px 14px; border-radius: 12px; border: 2px solid; }
  .kid-iep-status { display: inline-block; padding: 3px 12px; border-radius: 999px; font-size: 11px; font-weight: 900; letter-spacing: 0.04em; margin-bottom: 6px; }
  .kid-iep-text { font-size: 13px; color: #1f1235; line-height: 1.45; }
  .kid-empty { padding: 14px; background: #faf5ff; border: 2px dashed #c4b5fd; border-radius: 12px; color: #6b21a8; font-size: 13px; text-align: center; font-weight: 700; }
  .kid-photo { border: 3px solid #ec4899; border-radius: 16px; overflow: hidden; background: white; box-shadow: 0 8px 24px rgba(236,72,153,0.25); }
  .kid-photo img { width: 100%; max-height: 360px; object-fit: contain; display: block; }
  .kid-end { margin-top: 24px; padding: 16px; border-radius: 14px; background: linear-gradient(135deg, #ec4899, #a855f7); color: white; text-align: center; }
  .kid-end-line { font-size: 18px; font-weight: 900; }
  .kid-bday { padding: 12px; margin-bottom: 12px; border-radius: 16px; background: linear-gradient(90deg, #fce7f3, #fef3c7, #ede9fe); border: 3px dashed #ec4899; text-align: center; font-size: 22px; font-weight: 900; color: #be185d; }
  .kid-streak { display: flex; align-items: center; gap: 12px; padding: 12px 16px; margin-bottom: 14px; border-radius: 16px; background: linear-gradient(135deg, #fed7aa, #fda4af); border: 3px solid #f97316; }
  .kid-streak-fire { font-size: 38px; line-height: 1; }
  .kid-streak-num { font-size: 38px; font-weight: 900; color: #9a3412; line-height: 1; }
  .kid-streak-lbl { font-size: 18px; font-weight: 800; color: #9a3412; }
  .kid-stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin: 8px 0 14px; }
  .kid-stat { padding: 10px; border-radius: 12px; background: #faf5ff; border: 2px solid #c4b5fd; text-align: center; }
  .kid-stat-n { font-size: 28px; font-weight: 900; color: #6d28d9; line-height: 1; }
  .kid-stat-l { font-size: 11px; font-weight: 800; color: #6b21a8; margin-top: 4px; }
  .kid-best-badge { font-size: 10px; font-weight: 800; color: #b45309; margin-bottom: 4px; }
  .kid-vocab { display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 8px; }
  .kid-vocab-card { padding: 8px 10px; border-radius: 10px; background: #ecfdf5; border: 2px solid #86efac; }
  .kid-vocab-term { font-weight: 900; color: #065f46; font-size: 14px; }
  .kid-vocab-def { font-size: 12px; color: #064e3b; margin-top: 2px; }
`;

/* ── small UI helpers ────────────────────────────────────────────── */

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.22em", textTransform: "uppercase", color: "rgba(196,181,253,0.65)", marginBottom: 5 }}>{label}</div>
      {children}
    </div>
  );
}

function Stat({ n, l }: { n: number; l: string }) {
  return (
    <div style={{
      padding: "10px 12px", borderRadius: 10,
      background: "rgba(10,4,20,0.40)",
      border: "1px solid rgba(168,85,247,0.20)",
    }}>
      <div style={{ fontSize: 22, fontWeight: 900, color: "#fce7f3", letterSpacing: "-0.02em" }}>{n}</div>
      <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: "0.22em", textTransform: "uppercase", color: "rgba(196,181,253,0.65)", marginTop: 2 }}>{l}</div>
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

function ghostBtn(disabled: boolean): React.CSSProperties {
  return {
    padding: "11px 16px", borderRadius: 12,
    background: "rgba(168,85,247,0.10)", color: "#fce7f3",
    border: "1px solid rgba(168,85,247,0.40)",
    fontWeight: 800, fontSize: 13,
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.45 : 1,
    touchAction: "manipulation",
  };
}

function escapeHtml(s: string): string {
  return (s || "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}
