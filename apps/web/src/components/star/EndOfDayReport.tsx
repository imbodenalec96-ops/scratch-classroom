// End-of-Day Report — one-tap printable + on-screen recap of
// everything that happened today. Pulls from local STAR data:
//   • Completed assignments (per kid)
//   • Behavior log entries (full reports + quick logs)
//   • Refusal log
//   • Pass log (bathroom / water / break)
//   • Movement log (specials / lunch out / in)
//   • Free time + supply checkouts
//
// Two outputs:
//   • On-screen view inside /star → 📊 Reports → End of day
//   • Printable PDF for: filing / sharing with admin / parents who
//     want a daily recap

import { useEffect, useMemo, useState } from "react";
import {
  StarStore, letterGradeColor, countsTowardGrade,
  CLASS_NOTE_STUDENT_ID,
  type StarStudent, type BehaviorDef, type BehaviorEvent,
  type StarTrackerEntry, type StarRefusalLog, type DailyNote,
} from "../../lib/star/storage.ts";
import { loggedBeep, successBeep } from "../../lib/star/sounds.ts";

const MOOD_OPTIONS: Array<{ value: NonNullable<DailyNote["mood"]>; emoji: string; label: string; color: string }> = [
  { value: "great",  emoji: "🌟", label: "Great",  color: "#10b981" },
  { value: "good",   emoji: "🙂", label: "Good",   color: "#3b82f6" },
  { value: "ok",     emoji: "😐", label: "OK",     color: "#a855f7" },
  { value: "hard",   emoji: "😔", label: "Hard",   color: "#f59e0b" },
  { value: "crisis", emoji: "🚨", label: "Crisis", color: "#ef4444" },
];

const ATTENDANCE_OPTIONS: Array<{ value: NonNullable<DailyNote["attendance"]>; label: string }> = [
  { value: "present",     label: "Present" },
  { value: "tardy",       label: "Tardy" },
  { value: "left-early",  label: "Left early" },
  { value: "partial",     label: "Partial day" },
  { value: "absent",      label: "Absent" },
];

interface PerKidSummary {
  student: StarStudent;
  grades: Array<{ name: string; subject: string; pct: number; letter: string; counted: boolean }>;
  avg: number | null;
  positiveCount: number;
  challengeCount: number;
  neutralCount: number;
  refusalCount: number;
  passCount: number;
  totalQuestions: number;
  events: BehaviorEvent[];
  fullReports: BehaviorEvent[];   // events with antecedent or behaviorDetail filled
  highSeverity: BehaviorEvent[];  // severity ≥ 4
}

function todayPacific(): string {
  const d = new Date(Date.now() - 7 * 3600_000);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

export default function EndOfDayReport() {
  const [students] = useState<StarStudent[]>(() => StarStore.getStudents());
  const [defs] = useState<BehaviorDef[]>(() => StarStore.getBehaviorDefs());
  const [date, setDate] = useState<string>(() => todayPacific());
  const [tick, setTick] = useState(0);

  // Recompute when storage might have changed (focus, tick).
  useEffect(() => {
    const refresh = () => setTick((t) => t + 1);
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, []);

  // Daily notes — load both class-wide + per-kid for the picked
  // date. Shape kept loose so we re-render whenever upserted.
  const allNotes = useMemo(() => StarStore.getDailyNotes(), [date, tick]);
  const classNote: DailyNote = allNotes[`${date}::${CLASS_NOTE_STUDENT_ID}`] || {
    date, studentId: CLASS_NOTE_STUDENT_ID, updatedAt: "",
  };
  const noteFor = (sid: string): DailyNote => allNotes[`${date}::${sid}`] || {
    date, studentId: sid, updatedAt: "",
  };

  const upsertNote = (note: DailyNote) => {
    StarStore.upsertDailyNote(note);
    setTick((t) => t + 1);
  };

  const data = useMemo(() => {
    const tracker = StarStore.getAsnTrack();
    const refusalLog = StarStore.getLog();
    const passLog = StarStore.getPassLog();
    const behaviorLog = StarStore.getBehaviorLog();
    const summaries: PerKidSummary[] = students.map((s) => {
      const first = (s.firstName || "").trim().toLowerCase();
      const isMine = (sid: string | undefined, sname: string | undefined) => {
        if (sid && sid === s.id) return true;
        if (!sid && sname) return (sname || "").trim().toLowerCase().split(/\s+/)[0] === first;
        return false;
      };

      // Grades for this date
      const grades: PerKidSummary["grades"] = [];
      let totalQ = 0;
      for (const t of Object.values(tracker) as StarTrackerEntry[]) {
        for (const sub of t.submissions || []) {
          if (sub.completedDate !== date) continue;
          if (!isMine(sub.studentId, sub.studentName)) continue;
          grades.push({
            name: t.name, subject: t.subject || "Other",
            pct: sub.pct, letter: sub.letterGrade,
            counted: countsTowardGrade(sub),
          });
          totalQ += (typeof sub.maxScore === "number" && sub.maxScore > 0) ? sub.maxScore : (t.questions || []).length;
        }
      }
      const counted = grades.filter((g) => g.counted);
      const avg = counted.length ? Math.round(counted.reduce((a, g) => a + g.pct, 0) / counted.length) : null;

      // Behaviors for this date
      const events = behaviorLog.filter((e) => e.studentId === s.id && e.date === date);
      let positive = 0, challenge = 0, neutral = 0;
      for (const ev of events) {
        const def = defs.find((d) => d.id === ev.defId);
        if (!def) continue;
        if (def.tone === "positive") positive++;
        else if (def.tone === "challenge") challenge++;
        else neutral++;
      }
      const fullReports = events.filter((e) => (e.antecedent || e.behaviorDetail || e.response || e.outcome));
      const highSeverity = events.filter((e) => (e.severity || 0) >= 4);

      // Refusals + passes for this date
      const refusalCount = (refusalLog as StarRefusalLog[]).filter((r) => r.date === date && (r.studentId === s.id || (!r.studentId && r.student.trim().toLowerCase().split(/\s+/)[0] === first))).length;
      const passCount = passLog.filter((p) => (p.startedAt || "").slice(0, 10) === date && isMine(p.studentId, p.studentName)).length;

      return {
        student: s, grades, avg,
        positiveCount: positive, challengeCount: challenge, neutralCount: neutral,
        refusalCount, passCount, totalQuestions: totalQ,
        events, fullReports, highSeverity,
      };
    });

    // Class-wide rollups
    const totalAssignments = summaries.reduce((a, s) => a + s.grades.length, 0);
    const totalPositive = summaries.reduce((a, s) => a + s.positiveCount, 0);
    const totalChallenge = summaries.reduce((a, s) => a + s.challengeCount, 0);
    const totalRefusals = summaries.reduce((a, s) => a + s.refusalCount, 0);
    const totalPasses = summaries.reduce((a, s) => a + s.passCount, 0);
    const totalReports = summaries.reduce((a, s) => a + s.fullReports.length, 0);
    const totalQuestions = summaries.reduce((a, s) => a + s.totalQuestions, 0);
    const highSeverityToday = summaries.flatMap((s) => s.highSeverity);

    return {
      summaries, totalAssignments, totalPositive, totalChallenge,
      totalRefusals, totalPasses, totalReports, totalQuestions,
      highSeverityToday,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [students, defs, date, tick]);

  const dateLabel = new Date(date + "T00:00:00").toLocaleDateString("en-US", {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
  });

  const print = () => {
    openPrintWindow(data, defs, dateLabel, classNote, allNotes);
    loggedBeep();
    successBeep();
  };

  return (
    <div style={{ color: "#f5f1e8" }}>
      {/* Date picker + actions */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.22em", textTransform: "uppercase", color: "rgba(196,181,253,0.65)", marginBottom: 5 }}>
            Date
          </div>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={inp()} />
        </div>
        <button onClick={print} style={primary(false)}>🖨 Print end-of-day report</button>
      </div>

      <div style={{ marginBottom: 8, fontSize: 14, fontWeight: 700, color: "rgba(196,181,253,0.85)" }}>
        {dateLabel}
      </div>

      {/* Class rollup stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 8, marginBottom: 14 }}>
        <Stat label="Assignments completed" value={data.totalAssignments} accent="#10b981" />
        <Stat label="Questions answered" value={data.totalQuestions} accent="#a855f7" />
        <Stat label="Positive behaviors" value={data.totalPositive} accent="#10b981" />
        <Stat label="Challenge behaviors" value={data.totalChallenge} accent="#f59e0b" />
        <Stat label="Refusals" value={data.totalRefusals} accent="#ef4444" />
        <Stat label="Passes out" value={data.totalPasses} accent="#fbbf24" />
        <Stat label="Full reports" value={data.totalReports} accent="#8b5cf6" />
      </div>

      {/* High-severity callout */}
      {data.highSeverityToday.length > 0 && (
        <div style={{
          padding: "12px 14px", borderRadius: 12, marginBottom: 16,
          background: "rgba(239,68,68,0.10)",
          border: "1.5px solid rgba(239,68,68,0.45)",
        }}>
          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.18em", textTransform: "uppercase", color: "#fca5a5", marginBottom: 6 }}>
            ⚠ High-severity incidents today ({data.highSeverityToday.length})
          </div>
          {data.highSeverityToday.map((e) => {
            const def = defs.find((d) => d.id === e.defId);
            const stu = students.find((s) => s.id === e.studentId);
            return (
              <div key={e.id} style={{ fontSize: 13, color: "#fce7f3", marginBottom: 4 }}>
                <b>{stu?.firstName} {stu?.lastName}</b> · {def?.emoji} {def?.label} · severity {e.severity}{e.parentNotified ? " · parent notified" : " · ⚠ parent NOT notified"}
              </div>
            );
          })}
        </div>
      )}

      {/* CLASS-WIDE NOTE — what we did as a class today */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.18em", textTransform: "uppercase", color: "rgba(196,181,253,0.65)", marginBottom: 8 }}>
          📝 What we did as a class today
        </div>
        <textarea
          value={classNote.body || ""}
          onChange={(e) => upsertNote({ ...classNote, body: e.target.value })}
          rows={3}
          placeholder="Themes, special events, sub plans deviations, anything the whole class shared today…"
          style={ta()}
        />
      </div>

      {/* Per-kid roster */}
      <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.18em", textTransform: "uppercase", color: "rgba(196,181,253,0.65)", marginBottom: 8 }}>
        Per-kid breakdown · tap a card to write a narrative
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {data.summaries.map((sum) => (
          <KidCard
            key={sum.student.id}
            sum={sum}
            defs={defs}
            note={noteFor(sum.student.id)}
            onNoteChange={upsertNote}
          />
        ))}
      </div>

      <div style={{ marginTop: 10, fontSize: 11, opacity: 0.65 }}>
        💡 Print this at 3pm to file with admin or share with co-teachers. Pulls from local data — refresh by tapping back into the page.
      </div>
    </div>
  );
}

/* ── Per-kid card: stats + timeline + notes editor ──────────────── */

function KidCard({ sum, defs, note, onNoteChange }: {
  sum: PerKidSummary;
  defs: BehaviorDef[];
  note: DailyNote;
  onNoteChange: (n: DailyNote) => void;
}) {
  const [open, setOpen] = useState(false);
  const accent = gradeAccent(sum.student.grade);
  const filledFields =
    (note.body ? 1 : 0) +
    (note.highlights ? 1 : 0) +
    (note.growthAreas ? 1 : 0) +
    (note.mood ? 1 : 0) +
    (note.attendance ? 1 : 0) +
    (note.parentFollowUp ? 1 : 0);
  const hasNote = filledFields > 0;
  // Build a unified timeline: behaviors + grades sorted by time.
  const timeline = useMemo(() => {
    const items: Array<{ ts: string; kind: "behavior" | "grade"; render: React.ReactNode }> = [];
    for (const ev of sum.events) {
      const def = defs.find((d) => d.id === ev.defId);
      const c = def?.tone === "positive" ? "#10b981" : def?.tone === "challenge" ? "#f59e0b" : "#3b82f6";
      const isReport = !!(ev.antecedent || ev.behaviorDetail || ev.response || ev.outcome);
      const sev = ev.severity ? ` · sev ${ev.severity}` : "";
      items.push({
        ts: ev.ts, kind: "behavior",
        render: (
          <div key={ev.id} style={{ display: "flex", gap: 8, padding: "4px 0", borderLeft: `2px solid ${c}`, paddingLeft: 8 }}>
            <span style={{ fontFamily: "Menlo, monospace", fontSize: 11, color: "rgba(196,181,253,0.65)", minWidth: 60 }}>
              {new Date(ev.ts).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
            </span>
            <span style={{ fontSize: 12, color: "#fce7f3", flex: 1 }}>
              {def?.emoji} <b>{def?.label}</b>
              {sev && <span style={{ color: c, fontWeight: 700 }}>{sev}</span>}
              {ev.location && <span style={{ opacity: 0.6 }}> · {ev.location}</span>}
              {isReport && <span style={{ marginLeft: 6, fontSize: 9, padding: "1px 6px", borderRadius: 999, background: "rgba(168,85,247,0.20)", color: "#f9a8d4", fontWeight: 800, letterSpacing: "0.06em" }}>FULL REPORT</span>}
              {ev.note && <div style={{ fontSize: 11, color: "rgba(196,181,253,0.85)", fontStyle: "italic", marginTop: 2 }}>"{ev.note}"</div>}
            </span>
          </div>
        ),
      });
    }
    items.sort((a, b) => a.ts.localeCompare(b.ts));
    return items;
  }, [sum, defs]);

  const moodChoice = MOOD_OPTIONS.find((m) => m.value === note.mood);

  return (
    <div style={{
      borderRadius: 12,
      background: "rgba(0,0,0,0.30)",
      border: `1px solid ${accent.from}55`,
      borderLeft: `5px solid ${accent.from}`,
      overflow: "hidden",
    }}>
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          width: "100%", padding: "12px 14px", border: "none", background: "transparent",
          color: "inherit", cursor: "pointer", textAlign: "left",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
          <div style={{ fontSize: 16, fontWeight: 900, color: "#fce7f3", flex: 1 }}>
            {sum.student.firstName} {sum.student.lastName}
            {sum.student.grade && <span style={{ marginLeft: 8, fontSize: 10, padding: "2px 8px", borderRadius: 999, background: accent.from, color: "white", fontWeight: 800, letterSpacing: "0.06em", verticalAlign: "middle" }}>{sum.student.grade.toUpperCase()}</span>}
            {moodChoice && <span style={{ marginLeft: 8, fontSize: 14 }} title={`Mood: ${moodChoice.label}`}>{moodChoice.emoji}</span>}
            {note.attendance && note.attendance !== "present" && <span style={{ marginLeft: 6, fontSize: 9, padding: "2px 6px", borderRadius: 999, background: "rgba(245,158,11,0.20)", color: "#fde68a", fontWeight: 800, letterSpacing: "0.06em" }}>{note.attendance.toUpperCase()}</span>}
            {hasNote && <span style={{ marginLeft: 6, fontSize: 9, padding: "2px 6px", borderRadius: 999, background: "rgba(16,185,129,0.20)", color: "#bbf7d0", fontWeight: 800, letterSpacing: "0.06em" }}>NOTED</span>}
            {note.parentFollowUp && <span style={{ marginLeft: 6, fontSize: 9, padding: "2px 6px", borderRadius: 999, background: "rgba(236,72,153,0.20)", color: "#f9a8d4", fontWeight: 800, letterSpacing: "0.06em" }}>📞 PARENT</span>}
          </div>
          {sum.avg !== null && (
            <div style={{ fontSize: 14, fontWeight: 900, color: letterGradeColor(letterFor(sum.avg)), fontFamily: "Menlo, monospace" }}>
              {letterFor(sum.avg)} · {sum.avg}%
            </div>
          )}
          <span style={{ fontSize: 12, color: "rgba(196,181,253,0.55)" }}>{open ? "▲" : "▼"}</span>
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", fontSize: 12, fontWeight: 700 }}>
          <Mini label="✅" value={sum.grades.length} color="#a855f7" />
          <Mini label="🟢" value={sum.positiveCount} color="#10b981" />
          <Mini label="🟡" value={sum.challengeCount} color="#f59e0b" />
          <Mini label="🚨" value={sum.refusalCount} color="#ef4444" />
          <Mini label="🚪" value={sum.passCount} color="#fbbf24" />
          {sum.fullReports.length > 0 && <Mini label="📝" value={sum.fullReports.length} color="#8b5cf6" />}
        </div>
        {sum.highSeverity.length > 0 && (
          <div style={{ marginTop: 6, fontSize: 11, color: "#fca5a5", fontWeight: 700 }}>
            ⚠ {sum.highSeverity.length} high-severity incident{sum.highSeverity.length === 1 ? "" : "s"}
          </div>
        )}
      </button>

      {open && (
        <div style={{ padding: "0 14px 14px", borderTop: "1px solid rgba(168,85,247,0.20)" }}>
          {/* TIMELINE — every behavior incident with time */}
          {timeline.length > 0 && (
            <div style={{ marginTop: 10 }}>
              <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.18em", textTransform: "uppercase", color: "rgba(196,181,253,0.65)", marginBottom: 6 }}>
                Timeline · {timeline.length} event{timeline.length === 1 ? "" : "s"}
              </div>
              <div>{timeline.map((t) => t.render)}</div>
            </div>
          )}

          {/* NOTE EDITOR */}
          <div style={{
            marginTop: 12, padding: 10, borderRadius: 10,
            background: "rgba(168,85,247,0.04)",
            border: "1px solid rgba(168,85,247,0.20)",
          }}>
            <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.18em", textTransform: "uppercase", color: "rgba(196,181,253,0.65)", marginBottom: 8 }}>
              ✍️ Daily narrative for {sum.student.firstName}
            </div>

            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
              {MOOD_OPTIONS.map((m) => (
                <button
                  key={m.value}
                  onClick={() => onNoteChange({ ...note, mood: note.mood === m.value ? undefined : m.value })}
                  style={{
                    padding: "5px 10px", borderRadius: 999,
                    background: note.mood === m.value ? `${m.color}30` : "rgba(255,255,255,0.04)",
                    border: `1.5px solid ${note.mood === m.value ? m.color : "rgba(255,255,255,0.10)"}`,
                    color: note.mood === m.value ? m.color : "rgba(245,241,232,0.65)",
                    fontSize: 12, fontWeight: 800, cursor: "pointer",
                  }}
                >{m.emoji} {m.label}</button>
              ))}
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
              <div>
                <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.18em", textTransform: "uppercase", color: "rgba(196,181,253,0.55)", marginBottom: 4 }}>Attendance</div>
                <select value={note.attendance || ""} onChange={(e) => onNoteChange({ ...note, attendance: e.target.value as DailyNote["attendance"] || undefined })} style={inp()}>
                  <option value="">— not set —</option>
                  {ATTENDANCE_OPTIONS.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
                </select>
              </div>
              <div>
                <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.18em", textTransform: "uppercase", color: "rgba(196,181,253,0.55)", marginBottom: 4 }}>Parent follow-up</div>
                <label style={{ display: "flex", alignItems: "center", gap: 6, padding: "10px 12px", borderRadius: 10, background: "rgba(0,0,0,0.30)", border: "1px solid rgba(168,85,247,0.25)", cursor: "pointer", fontSize: 13, color: "#fce7f3", fontWeight: 700 }}>
                  <input type="checkbox" checked={!!note.parentFollowUp} onChange={(e) => onNoteChange({ ...note, parentFollowUp: e.target.checked })} style={{ accentColor: "#a855f7" }} />
                  Notify parents about today
                </label>
              </div>
            </div>

            <div style={{ marginBottom: 6, fontSize: 10, fontWeight: 800, letterSpacing: "0.18em", textTransform: "uppercase", color: "rgba(196,181,253,0.55)" }}>
              📝 What did they do today?
            </div>
            <textarea
              value={note.body || ""}
              onChange={(e) => onNoteChange({ ...note, body: e.target.value })}
              rows={3}
              placeholder={`How was ${sum.student.firstName}'s day overall? Wins, hard moments, what worked, what didn't…`}
              style={ta()}
            />

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 8 }}>
              <div>
                <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.18em", textTransform: "uppercase", color: "rgba(196,181,253,0.55)", marginBottom: 4 }}>⭐ Highlights</div>
                <textarea
                  value={note.highlights || ""}
                  onChange={(e) => onNoteChange({ ...note, highlights: e.target.value })}
                  rows={2}
                  placeholder="Wins / shoutouts"
                  style={ta()}
                />
              </div>
              <div>
                <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.18em", textTransform: "uppercase", color: "rgba(196,181,253,0.55)", marginBottom: 4 }}>🌱 To work on tomorrow</div>
                <textarea
                  value={note.growthAreas || ""}
                  onChange={(e) => onNoteChange({ ...note, growthAreas: e.target.value })}
                  rows={2}
                  placeholder="What needs revisiting"
                  style={ta()}
                />
              </div>
            </div>

            {note.parentFollowUp && (
              <div style={{ marginTop: 8 }}>
                <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.18em", textTransform: "uppercase", color: "rgba(196,181,253,0.55)", marginBottom: 4 }}>📞 What to tell the parent</div>
                <textarea
                  value={note.parentFollowNote || ""}
                  onChange={(e) => onNoteChange({ ...note, parentFollowNote: e.target.value })}
                  rows={2}
                  placeholder="Specific message — copy into ClassDojo / call notes"
                  style={ta()}
                />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function ta(): React.CSSProperties {
  return {
    width: "100%", padding: "10px 12px", borderRadius: 10,
    background: "rgba(10,4,20,0.45)", color: "#fce7f3",
    border: "1px solid rgba(168,85,247,0.25)",
    fontSize: 13, outline: "none", fontWeight: 500,
    boxSizing: "border-box", resize: "vertical", fontFamily: "inherit",
  };
}

function letterFor(pct: number): string {
  return pct >= 90 ? "A" : pct >= 80 ? "B" : pct >= 70 ? "C" : pct >= 60 ? "D" : "F";
}

function gradeAccent(grade: string | undefined): { from: string; to: string; ink: string } {
  const g = (grade || "").toUpperCase();
  if (g === "K" || g === "KG")  return { from: "#fbbf24", to: "#f59e0b", ink: "#78350f" };
  if (g.startsWith("1"))         return { from: "#fb7185", to: "#e11d48", ink: "#881337" };
  if (g.startsWith("2"))         return { from: "#fb923c", to: "#ea580c", ink: "#7c2d12" };
  if (g.startsWith("3"))         return { from: "#34d399", to: "#10b981", ink: "#065f46" };
  if (g.startsWith("4"))         return { from: "#60a5fa", to: "#2563eb", ink: "#1e3a8a" };
  if (g.startsWith("5"))         return { from: "#a78bfa", to: "#7c3aed", ink: "#4c1d95" };
  return { from: "#a78bfa", to: "#7c3aed", ink: "#4c1d95" };
}

/* ── Print template ─────────────────────────────────────────────── */

function openPrintWindow(data: ReturnType<typeof useMemo> extends infer X ? X : any, defs: BehaviorDef[], dateLabel: string, classNote: DailyNote, allNotes: Record<string, DailyNote>) {
  const w = window.open("", "_blank", "width=900,height=1100");
  if (!w) return;
  const d = data as {
    summaries: PerKidSummary[];
    totalAssignments: number; totalPositive: number; totalChallenge: number;
    totalRefusals: number; totalPasses: number; totalReports: number; totalQuestions: number;
    highSeverityToday: BehaviorEvent[];
  };

  const moodLabel = (m: DailyNote["mood"]) => {
    const opt = MOOD_OPTIONS.find((x) => x.value === m);
    return opt ? `${opt.emoji} ${opt.label}` : "";
  };

  const kidRows = d.summaries.map((sum) => {
    const accent = gradeAccent(sum.student.grade);
    const note = allNotes[`${sum.events[0]?.date || ""}::${sum.student.id}`]
      || Object.values(allNotes).find((n) => n.studentId === sum.student.id)
      || ({ date: "", studentId: sum.student.id, updatedAt: "" } as DailyNote);
    const sortedEvents = [...sum.events].sort((a, b) => a.ts.localeCompare(b.ts));
    const eventList = sortedEvents.length === 0 ? "" : `<table class="timeline">
      <thead><tr><th>Time</th><th>Behavior</th><th>Sev</th><th>Detail</th></tr></thead>
      <tbody>${sortedEvents.map((ev) => {
        const def = defs.find((dd) => dd.id === ev.defId);
        const time = new Date(ev.ts).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
        const isReport = !!(ev.antecedent || ev.behaviorDetail || ev.response || ev.outcome);
        const detailParts: string[] = [];
        if (ev.location) detailParts.push(escapeHtml(ev.location));
        if (ev.note) detailParts.push(`"${escapeHtml(ev.note)}"`);
        if (ev.antecedent) detailParts.push(`<b>A:</b> ${escapeHtml(ev.antecedent)}`);
        if (ev.behaviorDetail) detailParts.push(`<b>B:</b> ${escapeHtml(ev.behaviorDetail)}`);
        if (ev.response) detailParts.push(`<b>C:</b> ${escapeHtml(ev.response)}`);
        if (ev.outcome) detailParts.push(`<b>Outcome:</b> ${escapeHtml(ev.outcome)}`);
        if (ev.parentNotified) detailParts.push(`📞 parent notified`);
        return `<tr>
          <td class="t">${escapeHtml(time)}</td>
          <td><b>${def?.emoji || ""} ${escapeHtml(def?.label || "?")}</b>${isReport ? ' <span class="rep">FULL</span>' : ""}</td>
          <td class="sev">${ev.severity || "—"}</td>
          <td class="detail">${detailParts.join(" · ") || "—"}</td>
        </tr>`;
      }).join("")}</tbody>
    </table>`;
    const high = sum.highSeverity.length > 0
      ? `<div class="warn">⚠ ${sum.highSeverity.length} high-severity incident${sum.highSeverity.length === 1 ? "" : "s"}</div>`
      : "";
    const noteBlock = (note.body || note.highlights || note.growthAreas || note.mood || note.attendance || note.parentFollowUp)
      ? `<div class="kid-note">
          <div class="kid-note-head">
            <span>✍️ Daily narrative</span>
            ${note.mood ? `<span class="mood">${escapeHtml(moodLabel(note.mood))}</span>` : ""}
            ${note.attendance && note.attendance !== "present" ? `<span class="att">${escapeHtml(note.attendance.toUpperCase())}</span>` : ""}
            ${note.parentFollowUp ? `<span class="parent">📞 PARENT FOLLOW-UP</span>` : ""}
          </div>
          ${note.body ? `<div class="note-body">${escapeHtml(note.body)}</div>` : ""}
          ${(note.highlights || note.growthAreas) ? `<div class="note-grid">
            ${note.highlights ? `<div><div class="lbl">⭐ Highlights</div><div>${escapeHtml(note.highlights)}</div></div>` : ""}
            ${note.growthAreas ? `<div><div class="lbl">🌱 Tomorrow</div><div>${escapeHtml(note.growthAreas)}</div></div>` : ""}
          </div>` : ""}
          ${note.parentFollowUp && note.parentFollowNote ? `<div class="parent-msg"><b>📞 Tell parents:</b> ${escapeHtml(note.parentFollowNote)}</div>` : ""}
        </div>`
      : "";
    return `<div class="kid" style="border-left:5px solid ${accent.from}">
      <div class="kid-head">
        <div class="kid-name">${escapeHtml(sum.student.firstName)} ${escapeHtml(sum.student.lastName)}${sum.student.grade ? ` <span class="grade-pill" style="background:${accent.from}">${escapeHtml(sum.student.grade.toUpperCase())}</span>` : ""}</div>
        <div class="kid-stats">
          ${sum.avg !== null ? `<span class="avg">${letterFor(sum.avg)} · ${sum.avg}%</span>` : ""}
          <span>✅ ${sum.grades.length}</span>
          <span>🟢 ${sum.positiveCount}</span>
          <span>🟡 ${sum.challengeCount}</span>
          ${sum.refusalCount > 0 ? `<span style="color:#dc2626">🚨 ${sum.refusalCount}</span>` : ""}
          ${sum.passCount > 0 ? `<span>🚪 ${sum.passCount}</span>` : ""}
          ${sum.fullReports.length > 0 ? `<span>📝 ${sum.fullReports.length}</span>` : ""}
        </div>
      </div>
      ${high}
      ${noteBlock}
      ${eventList}
    </div>`;
  }).join("");

  const classNoteHtml = classNote.body
    ? `<h2>📝 What we did as a class today</h2>
       <div class="class-note">${escapeHtml(classNote.body)}</div>`
    : "";

  const parentFollowUpKids = d.summaries.filter((s) => {
    const n = Object.values(allNotes).find((x) => x.studentId === s.student.id);
    return n?.parentFollowUp;
  });
  const parentFollowSection = parentFollowUpKids.length === 0 ? "" : `
    <h2>📞 Parents to contact today</h2>
    <ul class="parents">${parentFollowUpKids.map((s) => {
      const n = Object.values(allNotes).find((x) => x.studentId === s.student.id);
      return `<li><b>${escapeHtml(s.student.firstName)} ${escapeHtml(s.student.lastName)}</b>${n?.parentFollowNote ? ` — ${escapeHtml(n.parentFollowNote)}` : ""}</li>`;
    }).join("")}</ul>
  `;

  const highSeverityHtml = d.highSeverityToday.length === 0 ? "" : `
    <h2>⚠ High-severity incidents today</h2>
    <table class="hs">
      <thead><tr><th>Student</th><th>Behavior</th><th>Severity</th><th>Time</th><th>Parent notified</th></tr></thead>
      <tbody>${d.highSeverityToday.map((e) => {
        const def = defs.find((dd) => dd.id === e.defId);
        const stu = d.summaries.find((s) => s.student.id === e.studentId)?.student;
        const time = new Date(e.ts).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
        return `<tr>
          <td><b>${escapeHtml(stu?.firstName || "")} ${escapeHtml(stu?.lastName || "")}</b></td>
          <td>${def?.emoji || ""} ${escapeHtml(def?.label || "?")}</td>
          <td class="sev">${e.severity}</td>
          <td>${escapeHtml(time)}</td>
          <td>${e.parentNotified ? `Yes${e.parentNotifyMethod ? " · " + escapeHtml(e.parentNotifyMethod) : ""}` : `<span class="no">⚠ NO</span>`}</td>
        </tr>`;
      }).join("")}</tbody>
    </table>
  `;

  w.document.write(`<!doctype html><html><head><title>End-of-Day Report — ${escapeHtml(dateLabel)}</title>
    <style>
      @media print { @page { size: letter; margin: 0.55in; } .no-print { display: none; } }
      body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: #111; padding: 0; margin: 0; line-height: 1.55; background: white; }
      .toolbar { padding: 12px 24px; background: #faf5ff; border-bottom: 1px solid #d8b4fe; display: flex; justify-content: space-between; align-items: center; font-weight: 800; color: #4c1d95; }
      .toolbar button { padding: 8px 14px; border-radius: 8px; border: 1px solid #6d28d9; background: #6d28d9; color: white; font-weight: 700; cursor: pointer; }
      .page { padding: 28px 32px; max-width: 760px; margin: 0 auto; }
      h1 { margin: 0 0 6px; font-size: 24px; letter-spacing: -0.02em; }
      .meta { font-size: 12px; color: #555; margin-bottom: 18px; }
      h2 { font-size: 12px; margin: 18px 0 6px; letter-spacing: 0.10em; text-transform: uppercase; color: #4c1d95; border-bottom: 2px solid #ede9fe; padding-bottom: 4px; }
      .stats { display: grid; grid-template-columns: repeat(7, 1fr); gap: 6px; margin-bottom: 16px; }
      .stat { padding: 8px 6px; border-radius: 8px; background: #faf5ff; border: 1px solid #d8b4fe; text-align: center; }
      .stat .n { font-size: 18px; font-weight: 900; color: #6d28d9; line-height: 1; }
      .stat .l { font-size: 8px; font-weight: 800; color: #6d28d9; opacity: 0.75; letter-spacing: 0.06em; text-transform: uppercase; margin-top: 3px; }
      .kid { padding: 10px 12px; border-radius: 8px; background: #faf5ff; border: 1px solid #ede9fe; margin-bottom: 6px; page-break-inside: avoid; }
      .kid-head { display: flex; justify-content: space-between; align-items: baseline; gap: 10px; flex-wrap: wrap; }
      .kid-name { font-size: 15px; font-weight: 900; color: #1f1235; }
      .grade-pill { display: inline-block; padding: 1px 7px; border-radius: 999px; color: white; font-size: 9px; font-weight: 900; letter-spacing: 0.08em; margin-left: 6px; vertical-align: middle; }
      .kid-stats { display: flex; gap: 8px; font-size: 12px; font-weight: 700; color: #4c1d95; flex-wrap: wrap; }
      .avg { font-family: Menlo, monospace; }
      .warn { margin-top: 4px; padding: 4px 8px; border-radius: 6px; background: #fef2f2; border: 1px solid #fecaca; color: #991b1b; font-size: 11px; font-weight: 800; }
      table.timeline { width: 100%; border-collapse: collapse; margin-top: 6px; font-size: 11px; }
      table.timeline th { text-align: left; padding: 4px 6px; background: #faf5ff; border-bottom: 1.5px solid #d8b4fe; font-size: 9px; font-weight: 800; letter-spacing: 0.06em; text-transform: uppercase; color: #6d28d9; }
      table.timeline td { padding: 4px 6px; border-bottom: 1px solid #f3f4f6; vertical-align: top; }
      table.timeline td.t { font-family: Menlo, monospace; white-space: nowrap; color: #6d28d9; font-weight: 700; width: 70px; }
      table.timeline td.sev { text-align: center; font-weight: 800; color: #b45309; width: 40px; }
      table.timeline td.detail { font-size: 10.5px; color: #1f1235; }
      table.timeline .rep { display: inline-block; padding: 0 4px; border-radius: 3px; background: #ede9fe; color: #6d28d9; font-size: 8px; font-weight: 800; letter-spacing: 0.06em; vertical-align: middle; }
      .kid-note { margin-top: 8px; padding: 8px 10px; border-radius: 8px; background: #f0fdf4; border: 1px solid #86efac; }
      .kid-note-head { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; font-size: 11px; font-weight: 800; color: #065f46; margin-bottom: 4px; }
      .kid-note .mood, .kid-note .att, .kid-note .parent { padding: 1px 6px; border-radius: 999px; font-size: 9px; font-weight: 800; letter-spacing: 0.06em; }
      .kid-note .mood { background: #dbeafe; color: #1e3a8a; }
      .kid-note .att { background: #fef3c7; color: #92400e; }
      .kid-note .parent { background: #fce7f3; color: #be185d; }
      .note-body { font-size: 12px; color: #1f1235; line-height: 1.45; white-space: pre-wrap; }
      .note-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 6px; font-size: 11px; color: #1f1235; }
      .note-grid .lbl { font-size: 9px; font-weight: 800; letter-spacing: 0.06em; color: #065f46; margin-bottom: 2px; }
      .parent-msg { margin-top: 6px; padding: 6px 8px; border-radius: 6px; background: #fdf2f8; border: 1px solid #f9a8d4; font-size: 11px; color: #831843; }
      .class-note { padding: 10px 12px; border-radius: 8px; background: #faf5ff; border: 1px solid #ede9fe; font-size: 13px; color: #1f1235; line-height: 1.55; white-space: pre-wrap; margin-bottom: 14px; }
      ul.parents { margin: 0 0 14px; padding-left: 18px; font-size: 12px; color: #1f1235; }
      ul.parents li { margin-bottom: 2px; }
      table.hs { width: 100%; border-collapse: collapse; font-size: 12px; }
      table.hs th { text-align: left; padding: 6px 8px; background: #fef2f2; border-bottom: 2px solid #fecaca; font-size: 9px; font-weight: 800; letter-spacing: 0.08em; text-transform: uppercase; color: #991b1b; }
      table.hs td { padding: 6px 8px; border-bottom: 1px solid #f3f4f6; }
      table.hs td.sev { text-align: center; font-weight: 800; }
      .no { color: #dc2626; font-weight: 800; }
      .footnote { margin-top: 18px; font-size: 9px; text-align: center; color: #888; }
    </style></head><body>
    <div class="toolbar no-print">
      <div>📊 End-of-Day Report — ${escapeHtml(dateLabel)}</div>
      <button onclick="window.print()">🖨 Print</button>
    </div>
    <section class="page">
      <h1>📊 End-of-Day Report</h1>
      <div class="meta">${escapeHtml(dateLabel)}</div>

      <h2>Class rollup</h2>
      <div class="stats">
        <div class="stat"><div class="n">${d.totalAssignments}</div><div class="l">Done</div></div>
        <div class="stat"><div class="n">${d.totalQuestions}</div><div class="l">Q's</div></div>
        <div class="stat"><div class="n">${d.totalPositive}</div><div class="l">Positive</div></div>
        <div class="stat"><div class="n">${d.totalChallenge}</div><div class="l">Challenge</div></div>
        <div class="stat"><div class="n">${d.totalRefusals}</div><div class="l">Refusals</div></div>
        <div class="stat"><div class="n">${d.totalPasses}</div><div class="l">Passes</div></div>
        <div class="stat"><div class="n">${d.totalReports}</div><div class="l">Reports</div></div>
      </div>

      ${classNoteHtml}

      ${highSeverityHtml}

      ${parentFollowSection}

      <h2>Per-kid breakdown</h2>
      ${kidRows}

      <div class="footnote">Generated by STAR · ${escapeHtml(dateLabel)} · pulled from local STAR data on this device.</div>
    </section>
    <script>window.addEventListener("load",()=>setTimeout(()=>window.print(),250))</script>
  </body></html>`);
  w.document.close();
}

/* ── small UI helpers ───────────────────────────────────────────── */

function Stat({ label, value, accent }: { label: string; value: number | string; accent: string }) {
  return (
    <div style={{
      padding: "10px 12px", borderRadius: 10,
      background: "rgba(0,0,0,0.30)",
      border: `1px solid ${accent}55`,
      textAlign: "center",
    }}>
      <div style={{ fontSize: 22, fontWeight: 900, color: accent, lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: "0.18em", textTransform: "uppercase", color: "rgba(196,181,253,0.65)", marginTop: 4 }}>{label}</div>
    </div>
  );
}
function Mini({ label, value, color }: { label: string; value: number; color: string }) {
  if (value === 0) return null;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 4,
      padding: "3px 8px", borderRadius: 999,
      background: `${color}20`,
      border: `1px solid ${color}55`,
      color: "#fce7f3",
      fontSize: 11, fontFamily: "Menlo, monospace",
    }}>
      {label} <b>{value}</b>
    </span>
  );
}
function inp(): React.CSSProperties {
  return {
    padding: "10px 12px", borderRadius: 10,
    background: "rgba(10,4,20,0.45)", color: "#fce7f3",
    border: "1px solid rgba(168,85,247,0.25)",
    fontSize: 14, outline: "none", fontWeight: 600,
  };
}
function primary(disabled: boolean): React.CSSProperties {
  return {
    padding: "11px 18px", borderRadius: 12,
    background: disabled ? "rgba(168,85,247,0.18)" : "linear-gradient(135deg, #6366f1 0%, #a855f7 50%, #ec4899 100%)",
    color: "white", border: "none", fontWeight: 900,
    cursor: disabled ? "not-allowed" : "pointer", fontSize: 14,
    opacity: disabled ? 0.55 : 1,
    boxShadow: disabled ? "none" : "0 8px 22px -6px rgba(168,85,247,0.55)",
  };
}
function escapeHtml(s: string): string {
  return (s || "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}
