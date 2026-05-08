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

  // Build per-student summaries by walking each assignment's submissions
  // and grouping by submission's studentId.
  const summaries = useMemo<StudentSummary[]>(() => {
    const map = new Map<string, StudentSummary>();
    for (const s of students) {
      map.set(s.id, { student: s, bySubject: {} });
    }
    for (const trk of Object.values(tracker)) {
      for (const sub of trk.submissions || []) {
        const summary = map.get(sub.studentId);
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
          <div style={{ marginBottom: 12 }}>
            <input
              value={q} onChange={(e) => setQ(e.target.value)}
              placeholder="🔍 Search students…"
              style={{
                width: "100%", padding: "10px 14px", borderRadius: 10,
                background: "rgba(0,0,0,0.30)", color: "white",
                border: "1px solid rgba(255,255,255,0.12)",
                fontSize: 14, outline: "none",
              }}
            />
          </div>

          {/* Matrix */}
          <div style={{
            background: "rgba(255,255,255,0.04)",
            border: "1px solid rgba(255,255,255,0.10)",
            borderRadius: 14, overflow: "auto",
          }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead style={{ background: "rgba(0,0,0,0.40)" }}>
                <tr>
                  <th style={th()}>Student</th>
                  {SUBJECTS.map((s) => <th key={s} style={th()}>{s}</th>)}
                </tr>
              </thead>
              <tbody>
                {filtered.map((s) => (
                  <tr key={s.student.id} style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                    <td style={tdName()}>
                      <button onClick={() => setSelectedStudent(s.student.id)} style={nameBtn()}>
                        <span style={avatarStyle()}>{(s.student.firstName || "?")[0].toUpperCase()}</span>
                        <span>
                          <div style={{ fontWeight: 800 }}>{s.student.firstName} {s.student.lastName}</div>
                          {s.student.grade && <div style={{ fontSize: 11, opacity: 0.6 }}>{s.student.grade}</div>}
                        </span>
                      </button>
                    </td>
                    {SUBJECTS.map((subj) => {
                      const subs = s.bySubject[subj] || [];
                      if (subs.length === 0) return <td key={subj} style={tdEmpty()}>—</td>;
                      // Only counted submissions (not absent/skipped/etc.) factor into the average.
                      const counted = subs.filter((b) => b.counted);
                      if (counted.length === 0) return <td key={subj} style={tdEmpty()}>—</td>;
                      const avg = Math.round(counted.reduce((a, b) => a + b.pct, 0) / counted.length);
                      const letter = letterFromPct(avg);
                      const color = letterGradeColor(letter);
                      return (
                        <td key={subj} style={td()}>
                          <button onClick={() => setSelectedStudent(s.student.id)} style={cellBtn(color)}>
                            <div style={{ fontSize: 22, fontWeight: 900, color, lineHeight: 1 }}>{letter}</div>
                            <div style={{ fontSize: 12, fontWeight: 700, opacity: 0.85 }}>{avg}%</div>
                            <div style={{ fontSize: 10, opacity: 0.55 }}>{subs.length}×</div>
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
            <div style={{ padding: 20, opacity: 0.6, textAlign: "center", fontSize: 13 }}>
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
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14, flexWrap: "wrap", gap: 10 }}>
        <button onClick={onBack} style={{
          padding: "8px 14px", borderRadius: 10,
          background: "rgba(255,255,255,0.05)", color: "white",
          border: "1px solid rgba(255,255,255,0.15)",
          fontWeight: 700, cursor: "pointer", fontSize: 13,
        }}>← All students</button>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <span style={{ ...avatarStyle(), width: 56, height: 56, fontSize: 24 }}>
            {(summary.student.firstName || "?")[0].toUpperCase()}
          </span>
          <div>
            <div style={{ fontSize: 24, fontWeight: 900 }}>
              {summary.student.firstName} {summary.student.lastName}
            </div>
            <div style={{ fontSize: 12, opacity: 0.6 }}>
              {summary.student.grade || "—"} · {countedSubs.length} graded
              {totalSubs > countedSubs.length && <span style={{ opacity: 0.6 }}> · {totalSubs - countedSubs.length} not counted</span>}
              {" · Overall: "}
              <span style={{ color: letterGradeColor(overallLetter), fontWeight: 800, marginLeft: 6 }}>
                {countedSubs.length > 0 ? `${overallLetter} (${overallAvg}%)` : "—"}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* By subject */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 12, marginBottom: 16 }}>
        {SUBJECTS.map((subj) => {
          const subs = summary.bySubject[subj] || [];
          return (
            <div key={subj} style={{
              padding: 14, borderRadius: 12,
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.10)",
            }}>
              <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.16em", textTransform: "uppercase", opacity: 0.6, marginBottom: 8 }}>
                {subj} · {subs.length} graded
              </div>
              {subs.length === 0 ? (
                <div style={{ fontSize: 12, opacity: 0.5 }}>No submissions yet.</div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {subs.map((s, i) => (
                    <div key={i} style={{
                      padding: "8px 10px", borderRadius: 8,
                      background: "rgba(0,0,0,0.30)", color: "white",
                      border: `1px solid ${letterGradeColor(s.letter)}55`,
                      display: "flex", alignItems: "center", gap: 10,
                    }}>
                      <button onClick={() => onOpenAssignment(s.assignmentId)} style={{
                        background: "transparent", border: "none", color: "white",
                        cursor: "pointer", textAlign: "left", padding: 0,
                        display: "flex", flex: 1, minWidth: 0, alignItems: "center", gap: 10,
                      }}>
                        <span style={{
                          fontSize: 18, fontWeight: 900, color: letterGradeColor(s.letter),
                          minWidth: 22, textAlign: "center",
                        }}>{s.letter}</span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 12, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                            {s.assignmentName}
                          </div>
                          <div style={{ fontSize: 10, opacity: 0.6 }}>{s.completedDate} · {s.pct}%</div>
                        </div>
                        <span style={{ fontFamily: "Menlo, monospace", fontSize: 9, color: "#fde68a", opacity: 0.7 }}>
                          {s.assignmentId.split("-").slice(-1)[0]}
                        </span>
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); confirmDelete(s.assignmentId, s.assignmentName, tracker[s.assignmentId]?.submissions?.length || 0); }}
                        title="Delete assignment"
                        style={{
                          padding: "4px 6px", borderRadius: 4,
                          background: "rgba(239,68,68,0.10)", color: "#fca5a5",
                          border: "1px solid rgba(239,68,68,0.40)",
                          cursor: "pointer", fontSize: 11, flexShrink: 0,
                        }}>🗑</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Pending */}
      {pending.length > 0 && (
        <div style={{
          padding: 14, borderRadius: 12,
          background: "rgba(251,191,36,0.05)",
          border: "1px solid rgba(251,191,36,0.30)",
        }}>
          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.16em", textTransform: "uppercase", color: "#fbbf24", marginBottom: 8 }}>
            ⏳ Assigned but not yet graded ({pending.length})
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {pending.map((p) => (
              <div key={p.id} style={{
                display: "flex", alignItems: "center", gap: 4,
                padding: "0", borderRadius: 999,
                background: "rgba(0,0,0,0.30)",
                border: "1px solid rgba(251,191,36,0.40)",
              }}>
                <button onClick={() => onOpenAssignment(p.id)} style={{
                  padding: "8px 6px 8px 12px", borderRadius: 999,
                  background: "transparent", color: "white", border: "none",
                  cursor: "pointer", fontSize: 12, fontWeight: 700,
                }}>
                  {p.subject} · {p.name} · <span style={{ fontFamily: "Menlo, monospace", fontSize: 10, color: "#fde68a" }}>{p.id}</span>
                </button>
                <button
                  onClick={() => confirmDelete(p.id, p.name, 0)}
                  title="Delete"
                  style={{
                    padding: "4px 8px", borderRadius: 999,
                    background: "transparent", color: "#fca5a5",
                    border: "none", cursor: "pointer", fontSize: 11,
                  }}>🗑</button>
              </div>
            ))}
          </div>
        </div>
      )}
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
    textAlign: "left", padding: "12px 14px",
    fontSize: 11, fontWeight: 800, letterSpacing: "0.14em",
    textTransform: "uppercase", opacity: 0.7, color: "white",
    position: "sticky", top: 0, background: "rgba(0,0,0,0.80)",
  };
}
function td(): React.CSSProperties {
  return { padding: "10px 14px", verticalAlign: "middle" };
}
function tdName(): React.CSSProperties {
  return { padding: "8px 14px", verticalAlign: "middle", minWidth: 200 };
}
function tdEmpty(): React.CSSProperties {
  return { padding: "10px 14px", textAlign: "center", opacity: 0.3, fontSize: 16 };
}
function nameBtn(): React.CSSProperties {
  return {
    display: "flex", alignItems: "center", gap: 10,
    padding: 6, borderRadius: 8,
    background: "transparent", color: "white",
    border: "none", cursor: "pointer", textAlign: "left",
    width: "100%",
  };
}
function avatarStyle(): React.CSSProperties {
  return {
    width: 36, height: 36, borderRadius: "50%",
    background: "linear-gradient(135deg, #6366f1, #b23a48)",
    display: "flex", alignItems: "center", justifyContent: "center",
    fontWeight: 800, fontSize: 16, color: "white", flexShrink: 0,
  };
}
function cellBtn(color: string): React.CSSProperties {
  return {
    padding: "6px 8px", borderRadius: 8,
    background: `${color}15`, border: `1px solid ${color}55`,
    color: "white", cursor: "pointer", textAlign: "center",
    minWidth: 64,
  };
}
