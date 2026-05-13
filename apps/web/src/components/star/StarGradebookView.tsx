// Full STAR gradebook. Two views:
//   • Matrix — rows = students, columns = subjects; each cell shows
//     the average letter grade + percentage and submission count.
//     Click a student name → student detail.
//   • Student detail — every assignment + every submission for one
//     student, grouped by subject, with letter grade pills.
//
// Click any assignment row to open the GradebookModal so the teacher
// can grade more attempts for that barcode.

import { useMemo, useState } from "react";
import {
  StarStore, letterGradeColor, countsTowardGrade,
  type StarStudent, type StarTrackerEntry, type Subject,
} from "../../lib/star/storage.ts";
import GradebookModal from "./GradebookModal.tsx";

const SUBJECTS: Subject[] = ["Math", "Reading", "Writing", "Science", "Social Studies"];

interface StudentSummary {
  student: StarStudent;
  // Per subject: latest submissions[] for that subject's assignments.
  bySubject: Record<string, Array<{
    assignmentId: string;
    assignmentName: string;
    pct: number;
    letter: string;
    completedDate: string;
    // True only when this submission counts toward the student's grade
    // average (completed / in-progress). Absent / Skipped / Excused /
    // Makeup are tracked but excluded from rollups.
    counted: boolean;
  }>>;
}

export default function StarGradebookView() {
  const [openBarcode, setOpenBarcode] = useState<string | null>(null);
  const [selectedStudent, setSelectedStudent] = useState<string | null>(null);
  const [q, setQ] = useState("");
  // Bumped on delete so the memoized tracker rebuilds.
  const [refreshKey, setRefreshKey] = useState(0);

  const students = useMemo(() => StarStore.getStudents(), [refreshKey]);
  const tracker = useMemo(() => StarStore.getAsnTrack(), [refreshKey]);

  // Build per-student summaries by walking each assignment's
  // submissions and grouping by submission's studentId. We DEDUPE to
  // most-recent per (assignment × student) so a re-grade overrides
  // the old grade instead of being averaged with it. Pre-existing
  // localStorage data may still have stale duplicates from before
  // the save path was fixed — this guards the display.
  const summaries = useMemo<StudentSummary[]>(() => {
    const map = new Map<string, StudentSummary>();
    for (const s of students) {
      map.set(s.id, { student: s, bySubject: {} });
    }
    for (const trk of Object.values(tracker)) {
      // Latest submission per student for THIS assignment.
      const latestByStudent: Record<string, any> = {};
      for (const sub of trk.submissions || []) {
        const sid = sub.studentId;
        if (!sid) continue;
        const ts = Date.parse(sub.loggedAt || sub.completedDate || "") || 0;
        const prior = latestByStudent[sid];
        if (!prior || ts >= (Date.parse(prior.loggedAt || prior.completedDate || "") || 0)) {
          latestByStudent[sid] = sub;
        }
      }
      for (const sid in latestByStudent) {
        const sub = latestByStudent[sid];
        const summary = map.get(sid);
        if (!summary) continue;
        const subj = trk.subject || "Other";
        if (!summary.bySubject[subj]) summary.bySubject[subj] = [];
        summary.bySubject[subj].push({
          assignmentId: trk.id,
          assignmentName: trk.name,
          pct: sub.pct,
          letter: sub.letterGrade,
          completedDate: sub.completedDate,
          counted: countsTowardGrade(sub),
        });
      }
    }
    return Array.from(map.values());
  }, [students, tracker]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return summaries;
    return summaries.filter((s) => `${s.student.firstName} ${s.student.lastName}`.toLowerCase().includes(needle));
  }, [summaries, q]);

  const detail = selectedStudent ? summaries.find((s) => s.student.id === selectedStudent) : null;

  return (
    <div>
      {!detail ? (
        <>
          {/* Search */}
          <div style={{ marginBottom: 14 }}>
            <input
              value={q} onChange={(e) => setQ(e.target.value)}
              placeholder="🔍 Search students…"
              style={{
                width: "100%", padding: "12px 16px", borderRadius: 12,
                background: "rgba(10,4,20,0.45)", color: "#fce7f3",
                border: "1px solid rgba(168,85,247,0.25)",
                fontSize: 14, outline: "none", fontWeight: 600,
                boxSizing: "border-box",
              }}
            />
          </div>

          {/* Matrix */}
          <div style={{
            background: "linear-gradient(180deg, rgba(168,85,247,0.06) 0%, rgba(99,102,241,0.03) 100%)",
            border: "1px solid rgba(168,85,247,0.20)",
            borderRadius: 16, overflow: "auto",
            boxShadow: "0 12px 32px -12px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.04)",
          }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr>
                  <th style={th()}>Student</th>
                  {SUBJECTS.map((s) => <th key={s} style={th()}>{s}</th>)}
                </tr>
              </thead>
              <tbody>
                {filtered.map((s) => (
                  <tr key={s.student.id} style={{ borderTop: "1px solid rgba(168,85,247,0.10)" }}>
                    <td style={tdName()}>
                      <button onClick={() => setSelectedStudent(s.student.id)} style={nameBtn()}>
                        <span style={avatarStyle()}>{(s.student.firstName || "?")[0].toUpperCase()}</span>
                        <span>
                          <div style={{ fontWeight: 800, color: "#f5f1e8", letterSpacing: "-0.01em" }}>{s.student.firstName} {s.student.lastName}</div>
                          {s.student.grade && <div style={{ fontSize: 11, color: "rgba(196,181,253,0.65)", fontWeight: 700, letterSpacing: "0.04em" }}>{s.student.grade}</div>}
                        </span>
                      </button>
                    </td>
                    {SUBJECTS.map((subj) => {
                      const subs = s.bySubject[subj] || [];
                      if (subs.length === 0) return <td key={subj} style={tdEmpty()}>—</td>;
                      const counted = subs.filter((b) => b.counted);
                      if (counted.length === 0) return <td key={subj} style={tdEmpty()}>—</td>;
                      const avg = Math.round(counted.reduce((a, b) => a + b.pct, 0) / counted.length);
                      const letter = letterFromPct(avg);
                      const color = letterGradeColor(letter);
                      return (
                        <td key={subj} style={td()}>
                          <button onClick={() => setSelectedStudent(s.student.id)} style={cellBtn(color)}>
                            <div style={{ fontSize: 22, fontWeight: 900, color, lineHeight: 1, textShadow: `0 0 12px ${color}55` }}>{letter}</div>
                            <div style={{ fontSize: 12, fontWeight: 800, color: "#fce7f3" }}>{avg}%</div>
                            <div style={{ fontSize: 10, fontWeight: 700, color: "rgba(196,181,253,0.55)", letterSpacing: "0.04em" }}>{subs.length}×</div>
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {filtered.length === 0 && (
            <div style={{ padding: 22, color: "rgba(196,181,253,0.55)", textAlign: "center", fontSize: 13, fontWeight: 600 }}>
              No students. Visit Settings → Students or hit 🔄 Sync from Classroom.
            </div>
          )}
        </>
      ) : (
        <StudentDetail
          summary={detail}
          tracker={tracker}
          onBack={() => setSelectedStudent(null)}
          onOpenAssignment={(bc) => setOpenBarcode(bc)}
          onDeleted={() => setRefreshKey((n) => n + 1)}
        />
      )}

      {openBarcode && (
        <GradebookModal barcode={openBarcode} onClose={() => setOpenBarcode(null)} />
      )}
    </div>
  );
}

function StudentDetail({ summary, tracker, onBack, onOpenAssignment, onDeleted }: {
  summary: StudentSummary;
  tracker: Record<string, StarTrackerEntry>;
  onBack: () => void;
  onOpenAssignment: (bc: string) => void;
  onDeleted?: () => void;
}) {
  const confirmDelete = (id: string, name: string, submissionCount: number) => {
    const msg = submissionCount > 0
      ? `Delete "${name}" (${id}) and its ${submissionCount} graded submission(s)? This cannot be undone.`
      : `Delete "${name}" (${id})?`;
    if (window.confirm(msg)) {
      StarStore.deleteAssignment(id);
      onDeleted?.();
    }
  };
  const totalSubs = Object.values(summary.bySubject).reduce((a, arr) => a + arr.length, 0);
  // Overall grade is averaged ONLY across counted submissions — absent /
  // skipped / excused / makeup don't drag the kid's average down.
  const countedSubs = Object.values(summary.bySubject).flat().filter((s) => s.counted);
  const overallAvg = countedSubs.length > 0
    ? Math.round(countedSubs.reduce((a, b) => a + b.pct, 0) / countedSubs.length)
    : 0;
  const overallLetter = letterFromPct(overallAvg);

  // Assignments not yet graded for this student — pulled from tracker rows
  // matching their studentId (set by sync) where no submission exists yet.
  const pending = Object.values(tracker).filter(
    (t) => t.studentId === summary.student.id && (t.submissions || []).length === 0,
  );

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18, flexWrap: "wrap", gap: 10 }}>
        <button onClick={onBack} style={{
          padding: "9px 16px", borderRadius: 999,
          background: "rgba(168,85,247,0.06)", color: "#fce7f3",
          border: "1px solid rgba(168,85,247,0.30)",
          fontWeight: 800, cursor: "pointer", fontSize: 13,
        }}>← All students</button>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <span style={{ ...avatarStyle(), width: 60, height: 60, fontSize: 26 }}>
            {(summary.student.firstName || "?")[0].toUpperCase()}
          </span>
          <div>
            <div style={{
              fontSize: 26, fontWeight: 900, letterSpacing: "-0.025em", lineHeight: 1.1,
              background: "linear-gradient(135deg, #f5f1e8 0%, #c4b5fd 50%, #f9a8d4 100%)",
              WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
              backgroundClip: "text",
            }}>
              {summary.student.firstName} {summary.student.lastName}
            </div>
            <div style={{ fontSize: 12, color: "rgba(196,181,253,0.65)", marginTop: 4, fontWeight: 600 }}>
              {summary.student.grade || "—"} · {countedSubs.length} graded
              {totalSubs > countedSubs.length && <span style={{ opacity: 0.7 }}> · {totalSubs - countedSubs.length} not counted</span>}
              {" · Overall: "}
              <span style={{
                color: letterGradeColor(overallLetter), fontWeight: 900, marginLeft: 6,
                textShadow: `0 0 10px ${letterGradeColor(overallLetter)}55`,
              }}>
                {countedSubs.length > 0 ? `${overallLetter} (${overallAvg}%)` : "—"}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* By subject */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 14, marginBottom: 18 }}>
        {SUBJECTS.map((subj) => {
          const subs = summary.bySubject[subj] || [];
          return (
            <div key={subj} style={{
              padding: 16, borderRadius: 14,
              background: "linear-gradient(180deg, rgba(168,85,247,0.06) 0%, rgba(99,102,241,0.03) 100%)",
              border: "1px solid rgba(168,85,247,0.20)",
              boxShadow: "inset 0 1px 0 rgba(255,255,255,0.04), 0 4px 18px -8px rgba(0,0,0,0.45)",
            }}>
              <div style={{
                display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10,
              }}>
                <div style={{
                  fontSize: 11, fontWeight: 800, letterSpacing: "-0.005em",
                  color: "#fce7f3",
                }}>
                  {subj}
                </div>
                <div style={{
                  fontSize: 9, fontWeight: 800, letterSpacing: "0.16em", textTransform: "uppercase",
                  color: "rgba(196,181,253,0.55)",
                  padding: "2px 8px", borderRadius: 999,
                  background: "rgba(168,85,247,0.10)",
                  border: "1px solid rgba(168,85,247,0.20)",
                }}>{subs.length} graded</div>
              </div>
              {subs.length === 0 ? (
                <div style={{ fontSize: 12, color: "rgba(196,181,253,0.45)", fontWeight: 600 }}>No submissions yet.</div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {subs.map((s, i) => {
                    const lc = letterGradeColor(s.letter);
                    return (
                    <div key={i} style={{
                      padding: "9px 12px", borderRadius: 10,
                      background: `linear-gradient(135deg, ${lc}1a 0%, rgba(10,4,20,0.30) 100%)`,
                      color: "white",
                      border: `1px solid ${lc}55`,
                      display: "flex", alignItems: "center", gap: 10,
                    }}>
                      <button onClick={() => onOpenAssignment(s.assignmentId)} style={{
                        background: "transparent", border: "none", color: "white",
                        cursor: "pointer", textAlign: "left", padding: 0,
                        display: "flex", flex: 1, minWidth: 0, alignItems: "center", gap: 10,
                      }}>
                        <span style={{
                          fontSize: 18, fontWeight: 900, color: lc,
                          minWidth: 24, textAlign: "center",
                          textShadow: `0 0 10px ${lc}55`,
                        }}>{s.letter}</span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 12, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                            {s.assignmentName}
                          </div>
                          <div style={{ fontSize: 10, color: "rgba(196,181,253,0.65)", fontWeight: 600 }}>{s.completedDate} · {s.pct}%</div>
                        </div>
                        <span style={{
                          fontFamily: "Menlo, monospace", fontSize: 9, color: "#f9a8d4",
                          fontWeight: 700, letterSpacing: "0.04em",
                        }}>
                          {s.assignmentId.split("-").slice(-1)[0]}
                        </span>
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); confirmDelete(s.assignmentId, s.assignmentName, tracker[s.assignmentId]?.submissions?.length || 0); }}
                        title="Delete assignment"
                        style={{
                          padding: "5px 7px", borderRadius: 6,
                          background: "rgba(239,68,68,0.12)", color: "#fca5a5",
                          border: "1px solid rgba(239,68,68,0.40)",
                          cursor: "pointer", fontSize: 11, flexShrink: 0,
                        }}>🗑</button>
                    </div>
                  )})}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Pending */}
      {pending.length > 0 && (
        <div style={{
          padding: 16, borderRadius: 14,
          background: "linear-gradient(135deg, rgba(168,85,247,0.10), rgba(236,72,153,0.06))",
          border: "1px solid rgba(168,85,247,0.30)",
          boxShadow: "0 4px 18px -8px rgba(168,85,247,0.30)",
        }}>
          <div style={{
            display: "inline-flex", alignItems: "center", gap: 7,
            padding: "3px 10px", borderRadius: 999,
            background: "rgba(168,85,247,0.20)",
            border: "1px solid rgba(168,85,247,0.40)",
            fontSize: 10, fontWeight: 800, letterSpacing: "0.18em", textTransform: "uppercase",
            color: "#c4b5fd", marginBottom: 10,
          }}>
            ⏳ Assigned · not yet graded · {pending.length}
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {pending.map((p) => (
              <div key={p.id} style={{
                display: "flex", alignItems: "center", gap: 4,
                borderRadius: 999,
                background: "linear-gradient(135deg, rgba(168,85,247,0.10), rgba(99,102,241,0.05))",
                border: "1px solid rgba(168,85,247,0.35)",
              }}>
                <button onClick={() => onOpenAssignment(p.id)} style={{
                  padding: "8px 8px 8px 14px", borderRadius: 999,
                  background: "transparent", color: "#fce7f3", border: "none",
                  cursor: "pointer", fontSize: 12, fontWeight: 700,
                }}>
                  {p.subject} · {p.name} · <span style={{ fontFamily: "Menlo, monospace", fontSize: 10, color: "#f9a8d4", fontWeight: 700 }}>{p.id}</span>
                </button>
                <button
                  onClick={() => confirmDelete(p.id, p.name, 0)}
                  title="Delete"
                  style={{
                    padding: "4px 10px", borderRadius: 999,
                    background: "transparent", color: "#fca5a5",
                    border: "none", cursor: "pointer", fontSize: 11,
                  }}>🗑</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Timeline — chronological strip of every event for this kid:
          submissions, refusals, passes. Pulled from local storage. */}
      <StudentTimeline studentId={summary.student.id} firstName={summary.student.firstName} />
    </div>
  );
}

function StudentTimeline({ studentId, firstName }: { studentId: string; firstName: string }) {
  const items = useMemo(() => {
    const out: Array<{ id: string; ts: number; icon: string; color: string; title: string; meta: string }> = [];
    const tracker = StarStore.getAsnTrack();
    for (const t of Object.values(tracker)) {
      for (const sub of (t.submissions || [])) {
        if (sub.studentId !== studentId) continue;
        const isCounted = countsTowardGrade(sub);
        out.push({
          id: `sub-${t.id}-${sub.loggedAt}`,
          ts: new Date(sub.loggedAt).getTime() || 0,
          icon: sub.status === "completed" ? "✅"
              : sub.status === "absent"    ? "🚫"
              : sub.status === "skipped"   ? "⏭"
              : sub.status === "excused"   ? "🩹"
              : sub.status === "makeup"    ? "🔁" : "⏳",
          color: !isCounted ? "#94a3b8" : letterGradeColor(sub.letterGrade),
          title: t.name,
          meta: `${t.subject} · ${isCounted ? `${sub.letterGrade} (${sub.pct}%)` : sub.status} · ${sub.completedDate}`,
        });
      }
    }
    for (const r of StarStore.getLog()) {
      if (r.studentId !== studentId) continue;
      out.push({
        id: `ref-${r.id}`,
        ts: new Date(`${r.date} ${r.time}`).getTime() || Date.now(),
        icon: "🚨", color: "#ef4444",
        title: r.type, meta: `${r.subject || ""}${r.task ? ` — ${r.task}` : ""}`.trim(),
      });
    }
    for (const p of StarStore.getPassLog()) {
      if (p.studentId !== studentId) continue;
      out.push({
        id: `pass-${p.studentId}-${p.startedAt}`,
        ts: new Date(p.endedAt).getTime() || 0,
        icon: "🚻", color: "#fbbf24",
        title: `${p.passKind} pass`,
        meta: `Out for ${Math.floor(p.elapsedSec / 60)}:${String(p.elapsedSec % 60).padStart(2, "0")}`,
      });
    }
    out.sort((a, b) => b.ts - a.ts);
    return out;
  }, [studentId]);

  if (items.length === 0) return null;

  return (
    <div style={{ marginTop: 18 }}>
      <div style={{
        display: "inline-flex", alignItems: "center", gap: 7,
        padding: "4px 12px", borderRadius: 999,
        background: "rgba(168,85,247,0.10)",
        border: "1px solid rgba(168,85,247,0.30)",
        fontSize: 10, fontWeight: 800, letterSpacing: "0.20em", textTransform: "uppercase",
        color: "#c4b5fd", marginBottom: 12,
      }}>
        🕐 {firstName}'s Timeline · {items.length}
      </div>
      <div style={{
        position: "relative", paddingLeft: 26,
        borderLeft: "2px solid rgba(168,85,247,0.20)",
        display: "flex", flexDirection: "column", gap: 8,
      }}>
        {items.map((it) => (
          <div key={it.id} style={{ position: "relative" }}>
            <span style={{
              position: "absolute", left: -36, top: 8,
              width: 24, height: 24, borderRadius: "50%",
              background: `${it.color}25`,
              border: `2px solid ${it.color}`,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 11,
              boxShadow: `0 0 10px ${it.color}55`,
            }}>{it.icon}</span>
            <div style={{
              padding: "10px 14px", borderRadius: 10,
              background: `linear-gradient(135deg, ${it.color}1a 0%, rgba(10,4,20,0.30) 100%)`,
              border: `1px solid ${it.color}40`,
            }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: "#fce7f3", letterSpacing: "-0.005em" }}>{it.title}</div>
              <div style={{ fontSize: 11, color: "rgba(196,181,253,0.75)", marginTop: 3, fontWeight: 600 }}>{it.meta}</div>
              <div style={{ fontSize: 10, color: "rgba(196,181,253,0.45)", marginTop: 3, fontWeight: 600 }}>
                {it.ts ? new Date(it.ts).toLocaleString() : ""}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── helpers ─────────────────────────────────────────────────────── */

function letterFromPct(pct: number): string {
  if (pct >= 90) return "A";
  if (pct >= 80) return "B";
  if (pct >= 70) return "C";
  if (pct >= 60) return "D";
  return "F";
}

function th(): React.CSSProperties {
  return {
    textAlign: "left", padding: "14px 16px",
    fontSize: 10, fontWeight: 800, letterSpacing: "0.20em",
    textTransform: "uppercase", color: "#c4b5fd",
    position: "sticky", top: 0,
    background: "linear-gradient(180deg, rgba(168,85,247,0.18) 0%, rgba(99,102,241,0.10) 100%)",
    borderBottom: "1px solid rgba(168,85,247,0.25)",
  };
}
function td(): React.CSSProperties {
  return { padding: "12px 16px", verticalAlign: "middle" };
}
function tdName(): React.CSSProperties {
  return { padding: "10px 16px", verticalAlign: "middle", minWidth: 200 };
}
function tdEmpty(): React.CSSProperties {
  return { padding: "12px 16px", textAlign: "center", color: "rgba(196,181,253,0.30)", fontSize: 16 };
}
function nameBtn(): React.CSSProperties {
  return {
    display: "flex", alignItems: "center", gap: 12,
    padding: 6, borderRadius: 10,
    background: "transparent", color: "white",
    border: "none", cursor: "pointer", textAlign: "left",
    width: "100%",
  };
}
function avatarStyle(): React.CSSProperties {
  return {
    width: 38, height: 38, borderRadius: "50%",
    background: "linear-gradient(135deg, #6366f1 0%, #a855f7 50%, #ec4899 100%)",
    display: "flex", alignItems: "center", justifyContent: "center",
    fontWeight: 900, fontSize: 16, color: "white", flexShrink: 0,
    boxShadow: "0 4px 14px -4px rgba(168,85,247,0.55), inset 0 2px 0 rgba(255,255,255,0.15)",
  };
}
function cellBtn(color: string): React.CSSProperties {
  return {
    padding: "8px 10px", borderRadius: 10,
    background: `linear-gradient(135deg, ${color}22 0%, ${color}08 100%)`,
    border: `1px solid ${color}55`,
    color: "white", cursor: "pointer", textAlign: "center",
    minWidth: 70,
  };
}
