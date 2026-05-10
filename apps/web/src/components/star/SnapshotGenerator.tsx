// "Today's Snapshot" — one-tap PDF for any kid, in two flavors:
//
//   • Parent edition  — formal, full data, signature line, contact info.
//   • Student edition — first-person, kid-friendly, encouraging tone,
//                       big colorful blocks they can take home.
//
// Pulls everything from local STAR storage (offline-capable):
//   - Today's grades   ← StarStore.getAsnTrack()
//   - IEP progress     ← StarStore.getIepLog() + getIepGoals()
//   - 1 photo of work  ← StarStore.getPhotos() filtered by student
//   - Pass log         ← StarStore.getPassLog()

import { useMemo, useState } from "react";
import {
  StarStore, countsTowardGrade, letterGradeColor,
  type StarStudent, type IepGoal, type IepLogEntry,
  type StarPhoto, type StarTrackerEntry,
} from "../../lib/star/storage.ts";
import { successBeep, loggedBeep } from "../../lib/star/sounds.ts";

type Variant = "parent" | "student";

interface DayData {
  grades: Array<{ name: string; subject: string; pct: number; letter: string; counted: boolean }>;
  iepEntries: Array<{ goal: IepGoal | null; entry: IepLogEntry }>;
  photo: StarPhoto | null;
  passes: number;
}

function todayPacific(): string {
  const d = new Date(Date.now() - 7 * 3600_000);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

function gatherDayData(s: StarStudent, date: string): DayData {
  const tracker = StarStore.getAsnTrack();
  const iepGoals = StarStore.getIepGoals();
  const log = StarStore.getIepLog();
  const photos = StarStore.getPhotos();
  const passLog = StarStore.getPassLog();
  const first = (s.firstName || "").trim().toLowerCase();
  const matchesStudent = (sid: string | undefined, sname: string | undefined): boolean => {
    if (sid && sid === s.id) return true;
    if (!sid && sname) {
      return (sname || "").trim().toLowerCase().split(/\s+/)[0] === first;
    }
    return false;
  };

  // Grades for this date
  const grades: DayData["grades"] = [];
  for (const t of Object.values(tracker) as StarTrackerEntry[]) {
    for (const sub of t.submissions || []) {
      if (sub.completedDate !== date) continue;
      if (!matchesStudent(sub.studentId, sub.studentName)) continue;
      grades.push({
        name: t.name, subject: t.subject || "Other",
        pct: sub.pct, letter: sub.letterGrade,
        counted: countsTowardGrade(sub),
      });
    }
  }

  // IEP entries for this date
  const iepEntries = log
    .filter((e) => e.studentId === s.id && e.date === date)
    .map((entry) => ({ goal: iepGoals.find((g) => g.studentId === s.id) || null, entry }));

  // Most recent photo from today (any barcode)
  let photo: StarPhoto | null = null;
  for (const list of Object.values(photos)) {
    for (const p of list) {
      const dateStr = new Date(p.ts).toISOString().slice(0, 10);
      if (dateStr !== date) continue;
      const matches = (p.studentId && p.studentId === s.id) ||
        (!p.studentId && p.studentName && (p.studentName || "").trim().toLowerCase().split(/\s+/)[0] === first);
      if (matches) {
        if (!photo || p.ts > photo.ts) photo = p;
      }
    }
  }

  // Bathroom / water passes today
  const passes = passLog.filter((p) => {
    const dateStr = (p.startedAt || "").slice(0, 10);
    if (dateStr !== date) return false;
    return matchesStudent(p.studentId, p.studentName);
  }).length;

  return { grades, iepEntries, photo, passes };
}

export default function SnapshotGenerator() {
  const [students] = useState<StarStudent[]>(() => StarStore.getStudents());
  const [studentId, setStudentId] = useState("");
  const [variant, setVariant] = useState<Variant>("parent");
  const [teacherName, setTeacherName] = useState("");
  const [teacherMessage, setTeacherMessage] = useState("");
  const [date, setDate] = useState(todayPacific());

  const sel = students.find((s) => s.id === studentId);
  const data = useMemo(() => sel ? gatherDayData(sel, date) : null, [sel, date]);

  const print = () => {
    if (!sel || !data) return;
    openSnapshotWindow({
      student: sel,
      data,
      variant,
      date,
      teacherName: teacherName.trim(),
      teacherMessage: teacherMessage.trim(),
    });
    loggedBeep();
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
        <Field label="Date">
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={inp()} />
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
            <Stat n={data.grades.length}    l="Grades" />
            <Stat n={data.iepEntries.length} l="IEP entries" />
            <Stat n={data.photo ? 1 : 0}     l="Photo" />
            <Stat n={data.passes}            l="Passes out" />
          </div>
        </div>
      )}

      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 12, gap: 8 }}>
        <button onClick={print} disabled={!sel} style={primaryBtn(!sel)}>
          🖨 Print {variant === "parent" ? "Parent" : "Student"} Snapshot
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
  date: string;
  teacherName: string;
  teacherMessage: string;
}) {
  const w = window.open("", "_blank", "width=900,height=1100");
  if (!w) return;
  const { student, data, variant, date, teacherName, teacherMessage } = args;
  const dateLabel = new Date(date + "T00:00:00").toLocaleDateString("en-US", {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
  });

  const html = variant === "parent"
    ? renderParent(student, data, dateLabel, teacherName, teacherMessage)
    : renderStudent(student, data, dateLabel, teacherName, teacherMessage);

  w.document.write(html);
  w.document.close();
  successBeep();
}

function renderParent(s: StarStudent, d: DayData, dateLabel: string, teacher: string, message: string): string {
  const counted = d.grades.filter((g) => g.counted);
  const avg = counted.length ? Math.round(counted.reduce((a, g) => a + g.pct, 0) / counted.length) : null;

  const grades = d.grades.length === 0
    ? `<div class="empty">No graded work today.</div>`
    : `<table>
        <thead><tr><th>Subject</th><th>Assignment</th><th>Score</th><th>Grade</th></tr></thead>
        <tbody>${d.grades.map((g) => {
          const c = g.counted ? letterGradeColor(g.letter) : "#94a3b8";
          return `<tr>
            <td>${escapeHtml(g.subject)}</td>
            <td>${escapeHtml(g.name)}</td>
            <td>${g.counted ? `${g.pct}%` : "—"}</td>
            <td><span class="badge" style="background:${c}25;color:${c};border:1px solid ${c}">${g.counted ? g.letter : "—"}</span></td>
          </tr>`;
        }).join("")}</tbody>
      </table>`;

  const iep = d.iepEntries.length === 0
    ? `<div class="empty">No IEP progress logged today.</div>`
    : `<ul class="iep">${d.iepEntries.map(({ entry, goal }) => {
        const lbl = entry.status === "met" ? "Met"
                  : entry.status === "partial" ? "Partial" : "Not yet";
        const c = entry.status === "met" ? "#10b981"
                : entry.status === "partial" ? "#f59e0b" : "#ef4444";
        return `<li>
          <span class="iep-pill" style="background:${c}20;color:${c};border:1px solid ${c}">${lbl}</span>
          <b>${goal?.area ? escapeHtml(goal.area) + ":" : "IEP:"}</b>
          ${escapeHtml(goal?.goalText || "—")}
          ${entry.note ? `<div class="note">📝 ${escapeHtml(entry.note)}</div>` : ""}
        </li>`;
      }).join("")}</ul>`;

  return `<!doctype html><html><head><title>Today's Snapshot — ${escapeHtml(s.firstName)} ${escapeHtml(s.lastName)}</title>
    <style>${PARENT_CSS}</style></head>
    <body>
      <div class="toolbar no-print">
        <div>📤 ${escapeHtml(s.firstName)}'s Snapshot — Parent Edition</div>
        <button onclick="window.print()">🖨 Print</button>
      </div>
      <section class="page">
        <header class="hero">
          <div>
            <div class="kicker">Today's Snapshot</div>
            <h1>${escapeHtml(s.firstName)} ${escapeHtml(s.lastName)}</h1>
            <div class="meta">${escapeHtml(dateLabel)}${s.grade ? ` · Grade ${escapeHtml(s.grade)}` : ""}</div>
          </div>
          <div class="hero-stat">
            ${avg !== null ? `<div class="big">${avg}<span>%</span></div><div class="small">Today's average</div>` : `<div class="small">No grades yet today</div>`}
          </div>
        </header>

        ${message ? `<div class="msg"><b>From your teacher${teacher ? ` (${escapeHtml(teacher)})` : ""}:</b> ${escapeHtml(message)}</div>` : ""}

        <h2>📚 Today's grades</h2>
        ${grades}

        <h2>🎯 IEP progress today</h2>
        ${iep}

        ${d.photo ? `
          <h2>📷 Sample of today's work</h2>
          <div class="photo-frame">
            <img src="${d.photo.dataUrl}" alt="Sample of student work" />
            ${d.photo.note ? `<div class="caption">${escapeHtml(d.photo.note)}</div>` : ""}
          </div>
        ` : ""}

        <div class="footer">
          <div>
            <div class="signlbl">Teacher signature</div>
            <div class="signline"></div>
            ${teacher ? `<div class="signname">${escapeHtml(teacher)}</div>` : ""}
          </div>
          <div>
            <div class="signlbl">Parent acknowledged</div>
            <div class="signline"></div>
          </div>
        </div>

        <div class="meta footnote">
          Sent home from STAR · ${escapeHtml(dateLabel)}
          ${s.parentEmail ? ` · ${escapeHtml(s.parentEmail)}` : ""}
        </div>
      </section>
      <script>window.addEventListener("load",()=>setTimeout(()=>window.print(),250))</script>
    </body></html>`;
}

function renderStudent(s: StarStudent, d: DayData, dateLabel: string, teacher: string, message: string): string {
  const wins = d.iepEntries.filter((e) => e.entry.status === "met").length;
  const greatGrade = d.grades.find((g) => g.counted && g.pct >= 80);
  const cheers: string[] = [];
  if (wins > 0) cheers.push(`${wins} IEP win${wins === 1 ? "" : "s"}`);
  if (greatGrade) cheers.push(`A great ${greatGrade.subject} grade`);
  if (d.photo) cheers.push(`Awesome work in the photo`);
  if (cheers.length === 0) cheers.push("Showed up and tried");

  const grades = d.grades.length === 0
    ? `<div class="kid-empty">No work scored today — that's OK!</div>`
    : `<div class="kid-grades">${d.grades.map((g) => {
        const c = g.counted ? letterGradeColor(g.letter) : "#94a3b8";
        return `<div class="kid-grade" style="border-color:${c}; background:${c}15">
          <div class="kid-grade-letter" style="color:${c}">${g.counted ? g.letter : "—"}</div>
          <div class="kid-grade-info">
            <div class="kid-grade-name">${escapeHtml(g.name)}</div>
            <div class="kid-grade-meta">${escapeHtml(g.subject)}${g.counted ? ` · ${g.pct}%` : ""}</div>
          </div>
        </div>`;
      }).join("")}</div>`;

  const iep = d.iepEntries.length === 0
    ? `<div class="kid-empty">No IEP goal practice today.</div>`
    : `<div class="kid-iep">${d.iepEntries.map(({ entry, goal }) => {
        const lbl = entry.status === "met" ? "I MET IT! ⭐"
                  : entry.status === "partial" ? "Almost there!"
                  : "We'll try again tomorrow";
        const c = entry.status === "met" ? "#10b981"
                : entry.status === "partial" ? "#f59e0b" : "#a855f7";
        return `<div class="kid-iep-row" style="border-color:${c}; background:${c}10">
          <div class="kid-iep-status" style="background:${c}; color:white">${lbl}</div>
          <div class="kid-iep-text">${goal?.area ? "<b>" + escapeHtml(goal.area) + "</b><br>" : ""}${escapeHtml(goal?.goalText || "—")}</div>
        </div>`;
      }).join("")}</div>`;

  return `<!doctype html><html><head><title>${escapeHtml(s.firstName)}'s Day</title>
    <style>${STUDENT_CSS}</style></head>
    <body>
      <div class="toolbar no-print">
        <div>🎒 ${escapeHtml(s.firstName)}'s Snapshot — Student Edition</div>
        <button onclick="window.print()">🖨 Print</button>
      </div>
      <section class="kid-page">
        <header class="kid-hero">
          <div class="kid-confetti">🎉</div>
          <div>
            <div class="kid-kicker">${escapeHtml(dateLabel)}</div>
            <h1>Hi, ${escapeHtml(s.firstName)}!</h1>
            <div class="kid-sub">Look at everything you did today 👇</div>
          </div>
        </header>

        ${message ? `<div class="kid-msg">💬 ${escapeHtml(message)}${teacher ? ` <span class="kid-msg-from">— ${escapeHtml(teacher)}</span>` : ""}</div>` : ""}

        <div class="kid-cheer">
          <div class="kid-cheer-label">⭐ Today you crushed it with:</div>
          <div class="kid-cheer-list">${cheers.map((c) => `<span class="kid-chip">${escapeHtml(c)}</span>`).join("")}</div>
        </div>

        <h2>📚 My work today</h2>
        ${grades}

        <h2>🎯 My IEP goals today</h2>
        ${iep}

        ${d.photo ? `
          <h2>📷 Look what I made!</h2>
          <div class="kid-photo">
            <img src="${d.photo.dataUrl}" alt="My work" />
          </div>
        ` : ""}

        <div class="kid-end">
          <div class="kid-end-line">High five! ✋ See you tomorrow.</div>
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

function escapeHtml(s: string): string {
  return (s || "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}
