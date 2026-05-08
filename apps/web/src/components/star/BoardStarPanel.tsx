// Board-side STAR widget. Adds a small toggle button to the ClassroomBoard
// that opens a slide-over panel showing:
//   • Today's assignment completion tracker — bar per student per subject
//   • Live grades view — same matrix layout as the /star Gradebook tab,
//     resized for the projector.
//
// Reads everything from localStorage (synced via the cross-device server
// poll already running in StarBoardOverlay). Polls every second so saves
// from the iPad show up on the projector immediately.

import { useEffect, useMemo, useState } from "react";
import {
  StarStore, letterGradeColor,
  type StarStudent, type StarTrackerEntry, type Subject,
} from "../../lib/star/storage.ts";

const SUBJECTS: Subject[] = ["Math", "Reading", "Writing", "Science", "Social Studies"];

export default function BoardStarPanel() {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<"completion" | "grades">("completion");

  return (
    <>
      {/* Toggle — editorial pill matching The Roster's typography. Numbered
          like other sections (№ 05) with small-caps serif tracking and a
          thin amber rule. Amber pin dot stands in for the section dots
          on every card; sits flush with the existing top-row furniture. */}
      <button onClick={() => setOpen(!open)} style={{
        position: "fixed", top: 16, right: 16, zIndex: 250,
        padding: "8px 14px 9px",
        background: "linear-gradient(180deg, rgba(255,255,255,0.04), rgba(255,255,255,0.012))",
        color: "#f5f1e8",
        border: `1px solid ${open ? "rgba(251,191,36,0.50)" : "rgba(255,255,255,0.10)"}`,
        borderRadius: 6,
        cursor: "pointer",
        boxShadow: open ? "0 8px 24px rgba(251,191,36,0.18)" : "0 2px 6px rgba(0,0,0,0.35)",
        backdropFilter: "blur(8px)",
        display: "flex", alignItems: "baseline", gap: 10,
        fontFamily: "'Fraunces', 'Playfair Display', Georgia, serif",
        transition: "border-color 0.2s ease, box-shadow 0.2s ease",
      }}>
        {/* Pin dot — same vocab as the cards on the roster */}
        <span style={{
          alignSelf: "center",
          display: "inline-block", width: 6, height: 6, borderRadius: "50%",
          background: open ? "#fbbf24" : "rgba(245,241,232,0.40)",
          boxShadow: open ? "0 0 6px rgba(251,191,36,0.55)" : "none",
          flexShrink: 0,
        }} />
        <span style={{
          fontSize: 11, fontWeight: 600, fontStyle: "italic",
          color: open ? "#fbbf24" : "rgba(245,241,232,0.55)",
          letterSpacing: "0.04em",
        }}>№ 05</span>
        <span style={{
          fontSize: 14, fontWeight: 600,
          letterSpacing: "0.22em", textTransform: "uppercase",
          color: "#f5f1e8",
        }}>Star</span>
        {open && (
          <span style={{
            fontSize: 11, fontStyle: "italic", fontWeight: 500,
            color: "rgba(245,241,232,0.55)",
            letterSpacing: "0.04em",
            marginLeft: 2,
          }}>close ✕</span>
        )}
      </button>

      {/* Slide-over panel */}
      {open && (
        <div onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }} style={{
          position: "fixed", inset: 0, zIndex: 240,
          background: "rgba(0,0,0,0.55)", backdropFilter: "blur(8px)",
        }}>
          <div style={{
            position: "absolute", top: 0, right: 0, bottom: 0,
            width: "min(900px, 96vw)",
            background: "linear-gradient(180deg, #0f172a 0%, #1e1b2e 100%)",
            borderLeft: "1px solid rgba(255,255,255,0.10)",
            color: "#f5f1e8", padding: 24, overflow: "auto",
            boxShadow: "-24px 0 64px rgba(0,0,0,0.5)",
          }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.18em", textTransform: "uppercase", opacity: 0.6 }}>
                  ⭐ STAR · Class Live View
                </div>
                <h2 style={{ fontSize: 22, fontWeight: 900, margin: "4px 0 0" }}>
                  {view === "completion" ? "Today's Completion" : "Student Grades"}
                </h2>
              </div>
              <button onClick={() => setOpen(false)} style={closeBtn()}>✕</button>
            </div>

            {/* View toggle */}
            <div style={{ display: "flex", gap: 6, marginBottom: 14, flexWrap: "wrap" }}>
              <ToggleBtn active={view === "completion"} onClick={() => setView("completion")} icon="✅" label="Completion" />
              <ToggleBtn active={view === "grades"} onClick={() => setView("grades")} icon="📚" label="Grades Matrix" />
            </div>

            {view === "completion" ? <CompletionView /> : <GradesMatrixView />}
          </div>
        </div>
      )}
    </>
  );
}

/* ── completion tracker ──────────────────────────────────────────── */

function CompletionView() {
  const [tick, setTick] = useState(0);
  // 1-second poll so iPad saves show up on the projector instantly.
  useEffect(() => { const iv = window.setInterval(() => setTick((n) => n + 1), 1000); return () => window.clearInterval(iv); }, []);

  const data = useMemo(() => {
    const tracker = StarStore.getAsnTrack();
    const students = StarStore.getStudents();
    const todayStr = new Date().toLocaleDateString();

    // Today's assignments — anything created today OR with a submission today.
    const todays: StarTrackerEntry[] = Object.values(tracker).filter((t) => {
      const created = t.createdDate ? new Date(t.createdDate).toLocaleDateString() === todayStr : false;
      const submittedToday = (t.submissions || []).some((s) => new Date(s.loggedAt).toLocaleDateString() === todayStr);
      return created || submittedToday;
    });

    // For each student, find which of today's assignments they've completed.
    const rows = students.map((stu) => {
      const completedFor = new Set<string>();
      const subjectsToday = new Set<string>();
      for (const t of todays) {
        // Either targeted at this student via studentId, or open to anyone
        // (no assigned student) — both count toward the matrix below.
        if (t.studentId && t.studentId !== stu.id) continue;
        subjectsToday.add(t.subject);
        const sub = (t.submissions || []).find((s) => s.studentId === stu.id);
        if (sub) completedFor.add(t.id);
      }
      const total = todays.filter((t) => !t.studentId || t.studentId === stu.id).length;
      return { stu, completed: completedFor.size, total, subjectsToday };
    });

    return { todays, rows };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick]);

  if (data.todays.length === 0) {
    return (
      <div style={{ padding: 24, opacity: 0.6, textAlign: "center", fontSize: 14, borderRadius: 12, background: "rgba(255,255,255,0.04)" }}>
        No assignments created or graded today yet.
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {data.rows.map(({ stu, completed, total }) => {
        if (total === 0) return null;
        const pct = Math.round((completed / total) * 100);
        const allDone = completed === total && total > 0;
        return (
          <div key={stu.id} style={{
            padding: 12, borderRadius: 12,
            background: allDone ? "rgba(16,185,129,0.10)" : "rgba(255,255,255,0.04)",
            border: `1px solid ${allDone ? "rgba(16,185,129,0.40)" : "rgba(255,255,255,0.10)"}`,
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 6 }}>
              <span style={avatar()}>{(stu.firstName || "?")[0].toUpperCase()}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 16, fontWeight: 800 }}>{stu.firstName} {stu.lastName}</div>
                <div style={{ fontSize: 11, opacity: 0.6 }}>{completed} of {total} done {allDone ? "🎉" : ""}</div>
              </div>
              <div style={{ fontSize: 22, fontWeight: 900, color: allDone ? "#10b981" : "#fde68a" }}>{pct}%</div>
            </div>
            <div style={{ height: 8, borderRadius: 999, background: "rgba(0,0,0,0.40)", overflow: "hidden" }}>
              <div style={{
                width: `${pct}%`, height: "100%",
                background: allDone ? "linear-gradient(90deg,#10b981,#34d399)" : "linear-gradient(90deg,#6366f1,#fbbf24)",
                transition: "width 0.5s ease",
              }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ── grades matrix ───────────────────────────────────────────────── */

function GradesMatrixView() {
  const [tick, setTick] = useState(0);
  useEffect(() => { const iv = window.setInterval(() => setTick((n) => n + 1), 2000); return () => window.clearInterval(iv); }, []);

  const data = useMemo(() => {
    const students = StarStore.getStudents();
    const tracker = StarStore.getAsnTrack();
    const rows = students.map((stu) => {
      const bySubj: Record<string, { pct: number; letter: string; count: number }> = {};
      for (const t of Object.values(tracker)) {
        const subs = (t.submissions || []).filter((s) => s.studentId === stu.id);
        if (subs.length === 0) continue;
        const totalPct = subs.reduce((a, b) => a + b.pct, 0);
        const cur = bySubj[t.subject] || { pct: 0, letter: "F", count: 0 };
        cur.pct = (cur.pct * cur.count + totalPct) / (cur.count + subs.length);
        cur.count += subs.length;
        cur.letter = letterFromPct(Math.round(cur.pct));
        bySubj[t.subject] = cur;
      }
      return { stu, bySubj };
    });
    return rows;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick]);

  return (
    <div style={{ overflow: "auto", borderRadius: 12, border: "1px solid rgba(255,255,255,0.10)" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
        <thead style={{ background: "rgba(0,0,0,0.50)" }}>
          <tr>
            <th style={th()}>Student</th>
            {SUBJECTS.map((s) => <th key={s} style={th()}>{s}</th>)}
          </tr>
        </thead>
        <tbody>
          {data.map(({ stu, bySubj }) => (
            <tr key={stu.id} style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
              <td style={{ padding: "10px 14px", verticalAlign: "middle", display: "flex", alignItems: "center", gap: 10 }}>
                <span style={avatar()}>{(stu.firstName || "?")[0].toUpperCase()}</span>
                <div>
                  <div style={{ fontWeight: 800 }}>{stu.firstName} {stu.lastName}</div>
                  {stu.grade && <div style={{ fontSize: 11, opacity: 0.6 }}>{stu.grade}</div>}
                </div>
              </td>
              {SUBJECTS.map((subj) => {
                const cell = bySubj[subj];
                if (!cell) return <td key={subj} style={{ padding: "10px 14px", textAlign: "center", opacity: 0.3 }}>—</td>;
                const color = letterGradeColor(cell.letter);
                const pct = Math.round(cell.pct);
                return (
                  <td key={subj} style={{ padding: "10px 14px", textAlign: "center" }}>
                    <div style={{
                      display: "inline-flex", flexDirection: "column", alignItems: "center",
                      padding: "6px 10px", borderRadius: 10,
                      background: `${color}15`, border: `1px solid ${color}55`,
                    }}>
                      <span style={{ fontSize: 20, fontWeight: 900, color, lineHeight: 1 }}>{cell.letter}</span>
                      <span style={{ fontSize: 11, opacity: 0.85 }}>{pct}% · {cell.count}×</span>
                    </div>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ── shared ──────────────────────────────────────────────────────── */

function ToggleBtn({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: string; label: string }) {
  return (
    <button onClick={onClick} style={{
      padding: "10px 16px", borderRadius: 999,
      background: active ? "linear-gradient(135deg,#6366f1,#b23a48)" : "rgba(255,255,255,0.05)",
      color: "white",
      border: active ? "1px solid rgba(251,191,36,0.55)" : "1px solid rgba(255,255,255,0.12)",
      fontWeight: 700, cursor: "pointer", fontSize: 13,
      display: "flex", alignItems: "center", gap: 6,
    }}>
      <span>{icon}</span>
      <span>{label}</span>
    </button>
  );
}
function avatar(): React.CSSProperties {
  return {
    width: 36, height: 36, borderRadius: "50%",
    background: "linear-gradient(135deg, #6366f1, #b23a48)",
    display: "flex", alignItems: "center", justifyContent: "center",
    fontWeight: 800, fontSize: 16, color: "white", flexShrink: 0,
  };
}
function th(): React.CSSProperties {
  return {
    textAlign: "left", padding: "12px 14px",
    fontSize: 11, fontWeight: 800, letterSpacing: "0.14em",
    textTransform: "uppercase", opacity: 0.7, color: "white",
  };
}
function closeBtn(): React.CSSProperties {
  return {
    width: 36, height: 36, borderRadius: 8,
    background: "rgba(255,255,255,0.05)", color: "white",
    border: "1px solid rgba(255,255,255,0.15)",
    cursor: "pointer", fontWeight: 800, fontSize: 14,
  };
}
function letterFromPct(pct: number): string {
  if (pct >= 90) return "A";
  if (pct >= 80) return "B";
  if (pct >= 70) return "C";
  if (pct >= 60) return "D";
  return "F";
}
