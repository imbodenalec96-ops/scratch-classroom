// Assignment gradebook modal — pops when an assignment barcode is scanned.
// Shows the assignment info, prior grade history, and a grade-entry form
// with per-question ✓/✗ marking that auto-calculates the score.

import { useEffect, useMemo, useState } from "react";
import {
  StarStore, saveAll, letterGrade, letterGradeColor,
  type BcEntry, type StarStudent, type StarSubmission, type StarTrackerEntry,
} from "../../lib/star/storage.ts";
import { successBeep, errorBeep, loggedBeep } from "../../lib/star/sounds.ts";
import { api } from "../../lib/api.ts";
import { fireStarBoardEvent } from "../../lib/star/boardEvents.ts";

interface Props {
  barcode: string;
  onClose: () => void;
}

export default function GradebookModal({ barcode, onClose }: Props) {
  const [students] = useState<StarStudent[]>(() => StarStore.getStudents());
  const [entry, setEntry] = useState<BcEntry | null>(null);
  const [tracker, setTracker] = useState<StarTrackerEntry | null>(null);

  // Form state
  const [studentId, setStudentId] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [time, setTime] = useState("");
  const [status, setStatus] = useState<"completed" | "in-progress" | "missing" | "excused">("completed");
  const [feedback, setFeedback] = useState("");
  const [notes, setNotes] = useState("");
  const [qMarks, setQMarks] = useState<Record<number, "correct" | "wrong">>({});
  const [scoreOverride, setScoreOverride] = useState<number | null>(null);
  const [maxOverride, setMaxOverride] = useState<number | null>(null);
  const [savedFlash, setSavedFlash] = useState(false);
  const [saving, setSaving] = useState(false);

  // Load entry + tracker on mount
  useEffect(() => {
    const bc = StarStore.getBcDB()[barcode];
    if (!bc || bc.type !== "assignment") {
      errorBeep();
      return;
    }
    setEntry(bc);
    const trk = StarStore.getAsnTrack()[bc.id];
    if (trk) {
      setTracker(trk);
    } else {
      // Build tracker entry on-the-fly so saving works even for legacy bcDB rows
      const fresh: StarTrackerEntry = {
        id: bc.id,
        name: bc.name,
        subject: bc.subject,
        gradeLevel: bc.gradeLevel,
        studentName: bc.studentName,
        studentId: bc.studentId,
        week: bc.week,
        day: bc.day,
        goal: bc.goal,
        questions: bc.questions || [],
        lesson: bc.lesson,
        createdDate: bc.createdDate,
        status: "assigned",
        submissions: [],
      };
      setTracker(fresh);
    }
    // Auto-pick the assigned student so a single scan + Save works.
    // Prefer the explicit studentId saved on the entry; fall back to a
    // first-name match against the roster.
    let preselect = "";
    if (bc.studentId) preselect = bc.studentId;
    else if (bc.studentName) {
      const needle = bc.studentName.trim().toLowerCase();
      const match = students.find((s) => {
        const full = `${s.firstName} ${s.lastName}`.trim().toLowerCase();
        return full === needle || s.firstName.trim().toLowerCase() === needle;
      });
      if (match) preselect = match.id;
    }
    if (preselect) setStudentId(preselect);
    successBeep();
  }, [barcode, students]);

  const questions = useMemo(() => entry?.type === "assignment" ? entry.questions || [] : [], [entry]);
  const totalQ = questions.length;

  const correctCount = useMemo(() => {
    return Object.values(qMarks).filter((v) => v === "correct").length;
  }, [qMarks]);

  const score = scoreOverride ?? correctCount;
  const max = maxOverride ?? (totalQ || 1);
  const pct = max > 0 ? Math.round((score / max) * 100) : 0;
  const letter = letterGrade(pct);

  const setMark = (n: number, mark: "correct" | "wrong") => {
    setQMarks((m) => ({ ...m, [n]: mark }));
    setScoreOverride(null); // re-enable auto-calc once user marks
  };

  const save = async () => {
    if (!entry || !tracker) return;
    if (!studentId) { errorBeep(); alert("Pick a student first."); return; }
    const s = students.find((x) => x.id === studentId);
    if (!s) return;
    setSaving(true);
    const sub: StarSubmission = {
      studentId: s.id,
      studentName: `${s.firstName} ${s.lastName}`,
      completedDate: date,
      score,
      maxScore: max,
      pct,
      letterGrade: letter,
      feedback,
      timeSpent: time,
      notes,
      status,
      qMarks: Object.fromEntries(Object.entries(qMarks).map(([k, v]) => [String(k), v])),
      loggedAt: new Date().toISOString(),
    };
    const trk: StarTrackerEntry = {
      ...tracker,
      submissions: [sub, ...(tracker.submissions || [])],
      status: status === "completed" ? "completed" : status,
    };
    const allTrack = StarStore.getAsnTrack();
    allTrack[entry.id] = trk;

    // Make sure bcDB has the entry (for re-scanning)
    const bcDB = StarStore.getBcDB();
    if (!bcDB[entry.id]) bcDB[entry.id] = entry;

    saveAll({ asnTracker: allTrack, bcDB });
    setTracker(trk);

    // Award class-store points for a completed assignment. We try the API
    // call regardless of how the student id looks — if it's not a real DB
    // user, the call fails and we surface that to the teacher so they
    // know to fix the roster instead of silently dropping points.
    let pointsAwarded = 0;
    let pointsError: string | null = null;
    if (status === "completed") {
      const ppc = StarStore.getPointsPerCompletion();
      if (ppc > 0) {
        try {
          await api.adjustStudentPoints(s.id, ppc, `STAR: ${entry.name} — ${letter}`);
          pointsAwarded = ppc;
        } catch (e: any) {
          pointsError = e?.message || String(e);
          console.warn("[STAR] points award failed:", pointsError);
        }
      }
    }

    // Broadcast to the ClassroomBoard so it can show the big celebration.
    if (status === "completed") {
      fireStarBoardEvent({
        kind: "completion",
        studentName: `${s.firstName} ${s.lastName}`.trim(),
        studentId: s.id,
        detail: entry.name,
        pct, letter, pointsAwarded,
      });
    }

    if (pointsError) {
      // Show but don't block the save flow — grade is still recorded.
      window.alert(`Saved the grade, but couldn't award ${StarStore.getPointsPerCompletion()} points to ${s.firstName}: ${pointsError}\n\nTip: hit 🔄 Sync in /star to refresh the roster with real DB ids.`);
    }

    loggedBeep();
    setSaving(false);
    setSavedFlash(true);
    setTimeout(() => {
      setSavedFlash(false);
      // Reset form for next student, keep modal open so teacher can grade many.
      setStudentId("");
      setQMarks({});
      setFeedback("");
      setNotes("");
      setScoreOverride(null);
      setMaxOverride(null);
    }, 900);
  };

  if (!entry) {
    return (
      <Backdrop onClose={onClose}>
        <div style={shellStyle()}>
          <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ fontSize: 16, fontWeight: 800 }}>Unknown barcode</div>
            <button onClick={onClose} style={closeBtn()}>✕</button>
          </header>
          <p style={{ marginTop: 12, opacity: 0.7 }}>
            <span style={{ fontFamily: "Menlo, monospace", color: "#fde68a" }}>{barcode}</span> isn't a known assignment.
          </p>
        </div>
      </Backdrop>
    );
  }

  if (entry.type !== "assignment") {
    return null;
  }

  const submissions = tracker?.submissions || [];

  return (
    <Backdrop onClose={onClose}>
      <div style={shellStyle()}>
        <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.2em", textTransform: "uppercase", opacity: 0.55 }}>
              📝 Assignment Gradebook
            </div>
            <div style={{ fontSize: 22, fontWeight: 800, marginTop: 2 }}>{entry.subject}</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{
              padding: "6px 12px", borderRadius: 999,
              background: "#fde68a", color: "#78350f",
              fontFamily: "Menlo, monospace", fontWeight: 800, fontSize: 13,
            }}>{barcode}</span>
            <button onClick={onClose} style={closeBtn()}>✕</button>
          </div>
        </header>

        {/* Info strip */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 8, marginBottom: 16 }}>
          <InfoCard label="Subject" value={`${entry.subject} · ${entry.gradeLevel || "—"}`} />
          <InfoCard label="Week / Day" value={`${entry.week ? `Week ${entry.week}` : "—"} · ${entry.day || "—"}`} />
          <InfoCard label="IEP Goal" value={entry.goal || "—"} />
          <InfoCard label="Created" value={entry.createdDate ? new Date(entry.createdDate).toLocaleDateString() : "—"} />
        </div>

        {/* Lesson — what the student was supposed to learn */}
        <LessonPanel lesson={entry.lesson} />

        {/* Grade history */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.18em", textTransform: "uppercase", opacity: 0.55, marginBottom: 8 }}>
            📊 Grade History {submissions.length ? `(${submissions.length})` : ""}
          </div>
          {submissions.length === 0 ? (
            <div style={{ padding: 12, borderRadius: 12, background: "rgba(255,255,255,0.04)", border: "1px dashed rgba(255,255,255,0.10)", opacity: 0.6, fontSize: 13 }}>
              No grades logged yet.
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 8 }}>
              {submissions.map((s, i) => (
                <div key={i} style={{
                  padding: 10, borderRadius: 12,
                  background: "rgba(255,255,255,0.04)",
                  border: `1px solid ${letterGradeColor(s.letterGrade)}55`,
                  display: "flex", alignItems: "center", gap: 10,
                }}>
                  <div style={{
                    width: 52, height: 52, borderRadius: 12,
                    background: `${letterGradeColor(s.letterGrade)}33`,
                    border: `2px solid ${letterGradeColor(s.letterGrade)}`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontWeight: 900, fontSize: 26, color: letterGradeColor(s.letterGrade),
                    flexShrink: 0,
                  }}>{s.letterGrade}</div>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontWeight: 700, fontSize: 14, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {s.studentName}
                    </div>
                    <div style={{ fontSize: 12, opacity: 0.75 }}>{s.score}/{s.maxScore} · {s.pct}%</div>
                    <div style={{ fontSize: 11, opacity: 0.55 }}>{s.completedDate}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Add new grade */}
        <div style={{
          padding: 12, borderRadius: 12,
          background: "rgba(99,102,241,0.06)",
          border: "1px solid rgba(99,102,241,0.30)",
        }}>
          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.18em", textTransform: "uppercase", opacity: 0.7, marginBottom: 10, color: "#a5b4fc" }}>
            ✏️ Add New Grade Entry
          </div>

          <div style={{ display: "grid", gridTemplateColumns: totalQ > 0 ? "1fr 1fr" : "1fr", gap: 14 }}>
            {/* Left col — student/score/feedback */}
            <div>
              <Row label="Student">
                <select value={studentId} onChange={(e) => setStudentId(e.target.value)} style={selStyle()}>
                  <option value="">— Pick a student —</option>
                  {students.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.firstName} {s.lastName} {s.grade ? `(${s.grade})` : ""}
                    </option>
                  ))}
                </select>
              </Row>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
                <Row label="Score">
                  <input
                    type="number" min={0}
                    value={scoreOverride ?? correctCount}
                    onChange={(e) => setScoreOverride(Number(e.target.value))}
                    style={inpStyle()}
                  />
                </Row>
                <Row label="Out Of">
                  <input
                    type="number" min={1}
                    value={maxOverride ?? (totalQ || 1)}
                    onChange={(e) => setMaxOverride(Number(e.target.value))}
                    style={inpStyle()}
                  />
                </Row>
                <Row label="Grade">
                  <div style={{
                    padding: "9px 10px", borderRadius: 8,
                    background: "rgba(0,0,0,0.30)",
                    border: `1px solid ${letterGradeColor(letter)}66`,
                    color: letterGradeColor(letter),
                    fontWeight: 800, textAlign: "center",
                  }}>
                    {letter} · {pct}%
                  </div>
                </Row>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                <Row label="Date Completed">
                  <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={inpStyle()} />
                </Row>
                <Row label="Time Spent (min)">
                  <input type="text" value={time} onChange={(e) => setTime(e.target.value)} placeholder="e.g. 25" style={inpStyle()} />
                </Row>
              </div>

              <Row label="Status">
                <select value={status} onChange={(e) => setStatus(e.target.value as any)} style={selStyle()}>
                  <option value="completed">Completed</option>
                  <option value="in-progress">In progress</option>
                  <option value="missing">Missing</option>
                  <option value="excused">Excused</option>
                </select>
              </Row>

              <Row label="Feedback (visible to student)">
                <textarea value={feedback} onChange={(e) => setFeedback(e.target.value)} rows={2} style={{ ...inpStyle(), resize: "vertical", fontFamily: "inherit" }} />
              </Row>

              <Row label="Internal Staff Notes">
                <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} style={{ ...inpStyle(), resize: "vertical", fontFamily: "inherit" }} />
              </Row>
            </div>

            {/* Right col — mark questions */}
            {totalQ > 0 && (
              <div>
                <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.18em", textTransform: "uppercase", opacity: 0.7, marginBottom: 8, color: "#86efac" }}>
                  ✓ Mark Questions — Auto-calculates Score
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 380, overflow: "auto", paddingRight: 4 }}>
                  {questions.map((q) => {
                    const mark = qMarks[q.num];
                    return (
                      <div key={q.num} style={{
                        padding: 8, borderRadius: 10,
                        background: mark === "correct" ? "rgba(16,185,129,0.10)" :
                                    mark === "wrong"   ? "rgba(239,68,68,0.10)" :
                                                          "rgba(255,255,255,0.04)",
                        border: `1px solid ${mark === "correct" ? "#10b98166" : mark === "wrong" ? "#ef444466" : "rgba(255,255,255,0.10)"}`,
                      }}>
                        <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                          <div style={{ fontWeight: 800, fontSize: 12, opacity: 0.7, minWidth: 22 }}>#{q.num}</div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 12, marginBottom: 4, opacity: 0.85 }}>{q.text}</div>
                            <div style={{ fontSize: 12, color: "#86efac", fontWeight: 700, fontFamily: "Menlo, monospace" }}>
                              ✓ {q.answer}
                            </div>
                          </div>
                          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                            <button onClick={() => setMark(q.num, "correct")} style={markBtn(mark === "correct", "#10b981")}>✓</button>
                            <button onClick={() => setMark(q.num, "wrong")} style={markBtn(mark === "wrong", "#ef4444")}>✗</button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div style={{ marginTop: 8, fontSize: 12, opacity: 0.7 }}>
                  Marked {Object.keys(qMarks).length} / {totalQ} · {correctCount} correct
                </div>
              </div>
            )}
          </div>

          <div style={{ display: "flex", gap: 10, justifyContent: "space-between", alignItems: "center", marginTop: 14 }}>
            <div style={{ fontSize: 12, opacity: 0.7 }}>
              {status === "completed" && StarStore.getPointsPerCompletion() > 0
                ? `🎁 +${StarStore.getPointsPerCompletion()} points to ${students.find((x) => x.id === studentId)?.firstName || "student"} on save`
                : ""}
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={onClose} style={btnGhost()}>Close</button>
              <button onClick={save} disabled={saving} style={btnPrimary(savedFlash)}>
                {saving ? "Saving…" : savedFlash ? "✓ Saved" : "✅ Save Grade"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </Backdrop>
  );
}

/* ── small styled helpers ───────────────────────────────────────── */

function Backdrop({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: "fixed", inset: 0, zIndex: 800,
        background: "rgba(0,0,0,0.65)", backdropFilter: "blur(6px)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 20,
      }}
    >
      {children}
    </div>
  );
}
function shellStyle(): React.CSSProperties {
  return {
    background: "linear-gradient(180deg, #0f172a 0%, #1e1b2e 100%)",
    border: "1px solid rgba(255,255,255,0.10)",
    borderRadius: 18, width: "min(1000px, 96vw)", maxHeight: "92vh",
    overflow: "auto", padding: 22, color: "#f5f1e8",
    boxShadow: "0 24px 64px rgba(0,0,0,0.5)",
  };
}
function LessonPanel({ lesson }: { lesson: any }) {
  const [open, setOpen] = useState(true);
  if (!lesson) return null;
  const title: string = lesson.title || "Lesson";
  const intro: string = lesson.intro || "";
  const body: string  = lesson.body || "";
  const keyPoints: string[] = Array.isArray(lesson.keyPoints) ? lesson.keyPoints : [];
  const example = lesson.workedExample || null;
  const vocab: { term: string; definition: string }[] = Array.isArray(lesson.vocab) ? lesson.vocab : [];

  return (
    <div style={{
      marginBottom: 16, padding: 14, borderRadius: 12,
      background: "rgba(99,102,241,0.07)",
      border: "1px solid rgba(99,102,241,0.30)",
    }}>
      <div onClick={() => setOpen(!open)} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer" }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.18em", textTransform: "uppercase", opacity: 0.7, color: "#a5b4fc" }}>
            📖 Lesson — what the student should know
          </div>
          <div style={{ fontSize: 16, fontWeight: 800, marginTop: 2 }}>{title}</div>
        </div>
        <span style={{ fontSize: 18, opacity: 0.7 }}>{open ? "▾" : "▸"}</span>
      </div>
      {open && (
        <div style={{ marginTop: 10, fontSize: 13, lineHeight: 1.55 }}>
          {intro && <p style={{ margin: "0 0 8px", opacity: 0.95 }}>{intro}</p>}
          {body && <p style={{ margin: "0 0 8px", opacity: 0.85, whiteSpace: "pre-wrap" }}>{body}</p>}
          {keyPoints.length > 0 && (
            <ul style={{ margin: "0 0 8px 18px", padding: 0 }}>
              {keyPoints.map((p, i) => <li key={i} style={{ marginBottom: 2 }}>{p}</li>)}
            </ul>
          )}
          {example && (
            <div style={{ padding: 8, borderRadius: 8, background: "rgba(0,0,0,0.25)", marginBottom: 8 }}>
              <b>Example:</b> {example.problem} → <span style={{ color: "#86efac", fontWeight: 700 }}>{example.solution}</span>
            </div>
          )}
          {vocab.length > 0 && (
            <div style={{
              padding: 10, borderRadius: 8,
              background: "rgba(16,185,129,0.10)",
              border: "1px solid rgba(16,185,129,0.40)",
            }}>
              <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.18em", textTransform: "uppercase", marginBottom: 8, color: "#86efac" }}>
                📖 Vocabulary — Words You Need to Know
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 6 }}>
                {vocab.map((v, i) => (
                  <div key={i} style={{
                    padding: "6px 8px", borderRadius: 5,
                    background: "rgba(0,0,0,0.30)",
                    border: "1px solid rgba(16,185,129,0.30)",
                  }}>
                    <div style={{ fontWeight: 800, fontSize: 12, color: "#fde68a" }}>{v.term}</div>
                    <div style={{ fontSize: 11.5, opacity: 0.85, marginTop: 2 }}>{v.definition}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <div style={{
      padding: 10, borderRadius: 10,
      background: "rgba(255,255,255,0.04)",
      border: "1px solid rgba(255,255,255,0.08)",
    }}>
      <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.18em", textTransform: "uppercase", opacity: 0.55, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 13, fontWeight: 700 }}>{value}</div>
    </div>
  );
}
function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.18em", textTransform: "uppercase", opacity: 0.55, marginBottom: 4 }}>{label}</div>
      {children}
    </div>
  );
}
function inpStyle(): React.CSSProperties {
  return {
    width: "100%", padding: "9px 10px", borderRadius: 8,
    background: "rgba(0,0,0,0.30)", color: "white",
    border: "1px solid rgba(255,255,255,0.12)",
    fontSize: 13, outline: "none",
  };
}
function selStyle(): React.CSSProperties {
  return { ...inpStyle(), appearance: "none" as any };
}
function markBtn(active: boolean, color: string): React.CSSProperties {
  return {
    width: 32, height: 26, borderRadius: 6,
    background: active ? color : "rgba(255,255,255,0.06)",
    border: `1px solid ${active ? color : "rgba(255,255,255,0.15)"}`,
    color: active ? "white" : color,
    fontWeight: 800, fontSize: 14, cursor: "pointer",
  };
}
function btnGhost(): React.CSSProperties {
  return {
    padding: "10px 14px", borderRadius: 10,
    background: "rgba(255,255,255,0.05)", color: "white",
    border: "1px solid rgba(255,255,255,0.15)",
    fontWeight: 700, cursor: "pointer",
  };
}
function btnPrimary(flash: boolean): React.CSSProperties {
  return {
    padding: "10px 16px", borderRadius: 10,
    background: flash ? "#10b981" : "linear-gradient(135deg, #6366f1, #b23a48)",
    color: "white", border: "none", fontWeight: 800, cursor: "pointer",
    fontSize: 14,
  };
}
function closeBtn(): React.CSSProperties {
  return {
    width: 34, height: 34, borderRadius: 8,
    background: "rgba(255,255,255,0.05)", color: "white",
    border: "1px solid rgba(255,255,255,0.15)",
    cursor: "pointer", fontWeight: 800,
  };
}
