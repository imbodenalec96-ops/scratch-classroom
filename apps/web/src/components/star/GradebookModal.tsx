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
import { fireStarBoardEvent, onStarBoardEvent } from "../../lib/star/boardEvents.ts";
import { tokens as T } from "../../lib/star/theme.ts";
import { Modal, Button, Pill } from "./ui.tsx";

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
  const [status, setStatus] = useState<"completed" | "in-progress" | "absent" | "skipped" | "excused" | "makeup">("completed");
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
    // Non-counting statuses (Absent / Skipped / Excused / Makeup) get
    // a neutral letter grade ("—") and pct=0 so they don't show up as
    // a fake F in the gradebook history. They're already filtered out
    // of every average via countsTowardGrade.
    const isCounting = status === "completed" || status === "in-progress";
    const sub: StarSubmission = {
      studentId: s.id,
      studentName: `${s.firstName} ${s.lastName}`,
      completedDate: date,
      score:    isCounting ? score : 0,
      maxScore: max,
      pct:      isCounting ? pct   : 0,
      letterGrade: isCounting ? letter : "—",
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

    // ── IEP auto-log ──
    // If the assignment is tagged with an iepGoalId, write a daily IEP
    // log entry so the SEIF report picks up the progress automatically.
    // Thresholds come from the goal itself first (real IEPs vary —
    // "80% accuracy" vs "60% accuracy"), falling back to the global
    // defaults set in /star → Settings.
    if (
      isCounting &&
      (entry as any).iepGoalId &&
      s.id
    ) {
      const goalArea = (entry as any).iepGoalArea || "IEP";
      const goal = StarStore.getIepGoals().find((g) => g.id === (entry as any).iepGoalId);
      const metT     = goal?.metThreshold     ?? StarStore.getIepDefaultMetThreshold();
      const partialT = goal?.partialThreshold ?? StarStore.getIepDefaultPartialThreshold();
      const iepStatus = pct >= metT ? "met" : pct >= partialT ? "partial" : "not";
      const iepNote = `Auto: ${entry.name} → ${score}/${max} (${pct}%, ${letter}) · target ≥${metT}%`;
      try {
        StarStore.logIep(s.id, date, iepStatus, iepNote);
        console.info(`[STAR] IEP auto-logged: ${s.firstName} · ${goalArea} · ${iepStatus} (target ${metT}%)`);
      } catch (e) {
        console.warn("[STAR] IEP auto-log failed:", e);
      }
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
      <Modal
        onClose={onClose}
        kicker="⚠️ Barcode Not Found"
        title="Unknown barcode"
        width={520}
      >
        <p style={{ margin: 0, color: T.color.textMuted, fontSize: T.font.size.md, lineHeight: 1.55 }}>
          <span style={{ fontFamily: T.font.mono, color: T.color.accent }}>{barcode}</span> isn't a known assignment in this device's database. Hit 🔄 Sync in /star to refresh.
        </p>
      </Modal>
    );
  }

  if (entry.type !== "assignment") {
    return null;
  }

  const submissions = tracker?.submissions || [];

  return (
    <Modal
      onClose={onClose}
      kicker="📝 Assignment Gradebook"
      title={entry.subject}
      trailing={<Pill tone="accent" size="md"><span style={{ fontFamily: T.font.mono }}>{barcode}</span></Pill>}
      width={1000}
    >
        {/* IEP focus banner — only shown for IEP-tagged assignments */}
        {(entry as any).iepGoalText && (
          <div style={{
            marginBottom: 14, padding: "12px 14px", borderRadius: 12,
            background: "linear-gradient(135deg, rgba(168,85,247,0.18), rgba(236,72,153,0.10))",
            border: "1px solid rgba(168,85,247,0.45)",
            boxShadow: "inset 0 1px 0 rgba(255,255,255,0.04)",
          }}>
            <div style={{
              display: "inline-flex", alignItems: "center", gap: 7,
              padding: "3px 10px", borderRadius: 999,
              background: "rgba(236,72,153,0.20)",
              border: "1px solid rgba(236,72,153,0.40)",
              fontSize: 9, fontWeight: 800, letterSpacing: "0.22em", textTransform: "uppercase",
              color: "#fbcfe8", marginBottom: 8,
            }}>🎯 IEP Focus · Auto-Logs Progress</div>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#fce7f3", lineHeight: 1.5 }}>
              {(entry as any).iepGoalArea && (
                <span style={{ color: "#f9a8d4", fontWeight: 800, marginRight: 6 }}>
                  {(entry as any).iepGoalArea}:
                </span>
              )}
              {(entry as any).iepGoalText}
            </div>
            {(() => {
              const goal = StarStore.getIepGoals().find((g) => g.id === (entry as any).iepGoalId);
              const metT     = goal?.metThreshold     ?? StarStore.getIepDefaultMetThreshold();
              const partialT = goal?.partialThreshold ?? StarStore.getIepDefaultPartialThreshold();
              return (
                <div style={{
                  marginTop: 6, fontSize: 11, color: "rgba(196,181,253,0.65)", fontWeight: 600,
                }}>
                  Saving with score ≥{metT}% logs as <b style={{ color: "#86efac" }}>Met</b> ·
                  {partialT}–{metT - 1}% as <b style={{ color: "#fcd34d" }}>Partial</b> · &lt;{partialT}% as <b style={{ color: "#fca5a5" }}>Not yet</b>.
                  {goal?.metThreshold !== undefined && (
                    <span style={{ marginLeft: 6, color: "#f9a8d4" }}>· goal-specific</span>
                  )}
                </div>
              );
            })()}
          </div>
        )}

        {/* Info strip */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 8, marginBottom: 16 }}>
          <InfoCard label="Subject" value={`${entry.subject} · ${entry.gradeLevel || "—"}`} />
          <InfoCard label="Week / Day" value={`${entry.week ? `Week ${entry.week}` : "—"} · ${entry.day || "—"}`} />
          <InfoCard label="IEP Goal" value={(entry as any).iepGoalText || entry.goal || "—"} />
          <InfoCard label="Created" value={entry.createdDate ? new Date(entry.createdDate).toLocaleDateString() : "—"} />
        </div>

        {/* Lesson — what the student was supposed to learn */}
        <LessonPanel lesson={entry.lesson} />

        {/* Photos already attached for this assignment. Capture
            happens on the phone (open /star/phone — it auto-jumps
            to the camera when this barcode was scanned here). */}
        <PhotoStrip barcode={entry.id} />

        {/* Grade history */}
        <div style={{ marginBottom: 18 }}>
          <SectionPill icon="📊">
            Grade History{submissions.length ? ` · ${submissions.length}` : ""}
          </SectionPill>
          {submissions.length === 0 ? (
            <div style={{
              marginTop: 10,
              padding: "14px 16px", borderRadius: 12,
              background: "rgba(168,85,247,0.04)",
              border: "1px dashed rgba(168,85,247,0.25)",
              color: "rgba(196,181,253,0.65)", fontSize: 13, fontWeight: 600,
            }}>
              No grades logged yet.
            </div>
          ) : (
            <div style={{
              marginTop: 10,
              display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 10,
            }}>
              {submissions.map((s, i) => {
                const lc = letterGradeColor(s.letterGrade);
                return (
                <div key={i} style={{
                  padding: "10px 12px", borderRadius: 12,
                  background: `linear-gradient(135deg, ${lc}1a 0%, rgba(10,4,20,0.30) 100%)`,
                  border: `1px solid ${lc}55`,
                  display: "flex", alignItems: "center", gap: 12,
                }}>
                  <div style={{
                    width: 52, height: 52, borderRadius: 12,
                    background: `${lc}25`,
                    border: `2px solid ${lc}`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontWeight: 900, fontSize: 24, color: lc,
                    flexShrink: 0,
                    textShadow: `0 0 12px ${lc}55`,
                  }}>{s.letterGrade}</div>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontWeight: 800, fontSize: 14, color: "#fce7f3", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", letterSpacing: "-0.005em" }}>
                      {s.studentName}
                    </div>
                    <div style={{ fontSize: 12, color: "rgba(196,181,253,0.75)", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{s.score}/{s.maxScore} · {s.pct}%</div>
                    <div style={{ fontSize: 11, color: "rgba(196,181,253,0.55)", fontWeight: 600 }}>{s.completedDate}</div>
                  </div>
                </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Add new grade */}
        <div style={{
          padding: 16, borderRadius: 16,
          background: "linear-gradient(180deg, rgba(168,85,247,0.10) 0%, rgba(99,102,241,0.05) 100%)",
          border: "1px solid rgba(168,85,247,0.30)",
          boxShadow: "inset 0 1px 0 rgba(255,255,255,0.04), 0 4px 18px -8px rgba(168,85,247,0.30)",
        }}>
          <div style={{ marginBottom: 12 }}>
            <SectionPill icon="✏️">Add New Grade Entry</SectionPill>
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
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(110px, 1fr))", gap: 6 }}>
                  {([
                    { id: "completed",   label: "Completed",   icon: "✅", color: "#10b981" },
                    { id: "absent",      label: "Absent",      icon: "🚫", color: "#ef4444" },
                    { id: "skipped",     label: "Skipped",     icon: "⏭",  color: "#f59e0b" },
                    { id: "excused",     label: "Excused",     icon: "🩹", color: "#3b82f6" },
                    { id: "makeup",      label: "Makeup",      icon: "🔁", color: "#a855f7" },
                    { id: "in-progress", label: "In progress", icon: "⏳", color: "#94a3b8" },
                  ] as const).map((s) => {
                    const active = status === s.id;
                    return (
                      <button key={s.id} onClick={() => setStatus(s.id as any)} style={{
                        padding: "10px 8px", borderRadius: 8,
                        background: active ? `linear-gradient(135deg, ${s.color}55, ${s.color}25)` : "rgba(255,255,255,0.04)",
                        border: active ? `2px solid ${s.color}` : "1px solid rgba(255,255,255,0.10)",
                        color: "white", cursor: "pointer",
                        display: "flex", flexDirection: "column", alignItems: "center", gap: 4,
                        fontSize: 12, fontWeight: active ? 800 : 600,
                      }}>
                        <span style={{ fontSize: 20 }}>{s.icon}</span>
                        <span>{s.label}</span>
                      </button>
                    );
                  })}
                </div>
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
                <div style={{ marginBottom: 10 }}>
                  <SectionPill icon="✓">Mark Questions · auto-scores</SectionPill>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 420, overflow: "auto", paddingRight: 4 }}>
                  {questions.map((q) => {
                    const mark = qMarks[q.num];
                    const isMCQ = Array.isArray(q.choices) && q.choices.length > 0;
                    return (
                      <div key={q.num} style={{
                        padding: 10, borderRadius: 10,
                        background: mark === "correct" ? "linear-gradient(135deg, rgba(16,185,129,0.18), rgba(168,85,247,0.05))" :
                                    mark === "wrong"   ? "linear-gradient(135deg, rgba(239,68,68,0.18), rgba(236,72,153,0.05))" :
                                                          "rgba(168,85,247,0.04)",
                        border: `1px solid ${mark === "correct" ? "rgba(16,185,129,0.45)" : mark === "wrong" ? "rgba(239,68,68,0.45)" : "rgba(168,85,247,0.18)"}`,
                      }}>
                        <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                          <div style={{
                            fontWeight: 900, fontSize: 11,
                            color: "#c4b5fd",
                            padding: "2px 7px", borderRadius: 999,
                            background: "rgba(168,85,247,0.12)",
                            border: "1px solid rgba(168,85,247,0.30)",
                            minWidth: 30, textAlign: "center",
                            flexShrink: 0,
                          }}>#{q.num}</div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 12.5, marginBottom: 4, color: "#fce7f3", fontWeight: 600, lineHeight: 1.4 }}>{q.text}</div>
                            {isMCQ ? (
                              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "3px 10px", marginTop: 4 }}>
                                {q.choices!.map((c, i) => {
                                  const correct = c === q.answer;
                                  return (
                                    <div key={i} style={{
                                      fontSize: 11.5, fontWeight: 700,
                                      color: correct ? "#86efac" : "rgba(196,181,253,0.85)",
                                      display: "flex", alignItems: "center", gap: 5,
                                    }}>
                                      <span style={{
                                        display: "inline-flex", alignItems: "center", justifyContent: "center",
                                        width: 18, height: 18, borderRadius: "50%",
                                        background: correct ? "rgba(16,185,129,0.20)" : "rgba(168,85,247,0.10)",
                                        border: correct ? "1.5px solid #10b981" : "1px solid rgba(168,85,247,0.30)",
                                        fontSize: 10, fontWeight: 900,
                                      }}>{String.fromCharCode(65 + i)}</span>
                                      {c}{correct ? " ✓" : ""}
                                    </div>
                                  );
                                })}
                              </div>
                            ) : (
                              <div style={{ fontSize: 12, color: "#86efac", fontWeight: 800, fontFamily: "Menlo, monospace" }}>
                                ✓ {q.answer}
                              </div>
                            )}
                          </div>
                          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                            <button onClick={() => setMark(q.num, "correct")} aria-label="Mark correct" style={markBtn(mark === "correct", "#10b981")}>✓</button>
                            <button onClick={() => setMark(q.num, "wrong")} aria-label="Mark wrong" style={markBtn(mark === "wrong", "#ef4444")}>✗</button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div style={{ marginTop: 8, fontSize: 12, color: "rgba(196,181,253,0.65)", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
                  Marked {Object.keys(qMarks).length} / {totalQ} · {correctCount} correct
                </div>
              </div>
            )}
          </div>

          <div style={{
            display: "flex", gap: T.space.md, justifyContent: "space-between", alignItems: "center",
            marginTop: T.space.lg, paddingTop: T.space.lg,
            borderTop: `1px solid ${T.color.border}`,
          }}>
            <div style={{ fontSize: T.font.size.sm, color: T.color.textMuted }}>
              {status === "completed" && StarStore.getPointsPerCompletion() > 0
                ? `🎁 +${StarStore.getPointsPerCompletion()} points to ${students.find((x) => x.id === studentId)?.firstName || "student"} on save`
                : ""}
            </div>
            <div style={{ display: "flex", gap: T.space.sm }}>
              <Button variant="ghost" onClick={onClose}>Close</Button>
              <Button
                variant={savedFlash ? "success" : "primary"}
                onClick={save}
                loading={saving}
                size="lg"
              >
                {saving ? "Saving…" : savedFlash ? "✓ Saved" : "✅ Save Grade"}
              </Button>
            </div>
          </div>
        </div>
    </Modal>
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
function PhotoStrip({ barcode }: { barcode: string }) {
  const [photos, setPhotos] = useState(() => StarStore.getPhotos()[barcode] || []);
  const [zoom, setZoom] = useState<string | null>(null);
  useEffect(() => {
    return onStarBoardEvent((e) => {
      if (e.kind !== "photo-saved" || e.barcode !== barcode) return;
      setTimeout(() => setPhotos(StarStore.getPhotos()[barcode] || []), 50);
    });
  }, [barcode]);
  const remove = (id: string) => {
    if (!window.confirm("Delete this photo?")) return;
    StarStore.deletePhoto(barcode, id);
    setPhotos(StarStore.getPhotos()[barcode] || []);
  };
  if (photos.length === 0) {
    return (
      <div style={{
        marginBottom: 16, padding: "14px 16px", borderRadius: 14,
        background: "linear-gradient(135deg, rgba(168,85,247,0.06), rgba(99,102,241,0.03))",
        border: "1px dashed rgba(168,85,247,0.28)",
        color: "rgba(196,181,253,0.65)", fontSize: 13, lineHeight: 1.55, fontWeight: 600,
      }}>
        <div style={{ marginBottom: 6 }}>
          <SectionPill icon="📷">Captured Worksheets</SectionPill>
        </div>
        No photos yet. Open <b style={{ color: "#fce7f3" }}>/star/phone</b> on your phone — when this barcode was scanned here, your phone auto-jumps to the camera. Photos appear here within a second of saving.
      </div>
    );
  }
  return (
    <div style={{
      marginBottom: 16, padding: 14, borderRadius: 14,
      background: "linear-gradient(135deg, rgba(168,85,247,0.10), rgba(99,102,241,0.05))",
      border: "1px solid rgba(168,85,247,0.30)",
    }}>
      <div style={{ marginBottom: 10 }}>
        <SectionPill icon="📷">Captured Worksheets · {photos.length}</SectionPill>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 8 }}>
        {photos.map((p) => (
          <div key={p.id} style={{ position: "relative", borderRadius: 8, overflow: "hidden", border: "1px solid rgba(255,255,255,0.10)" }}>
            <img src={p.dataUrl} alt="" onClick={() => setZoom(p.dataUrl)} style={{ width: "100%", display: "block", cursor: "zoom-in" }} />
            <div style={{ padding: "6px 8px", fontSize: 11, background: "rgba(0,0,0,0.50)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontWeight: 700, color: "#fde68a", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {p.studentName || "—"}
              </span>
              <button onClick={() => remove(p.id)} style={{ background: "transparent", color: "#fca5a5", border: "none", cursor: "pointer", fontSize: 13 }}>🗑</button>
            </div>
            {p.note && <div style={{ padding: "4px 8px", fontSize: 11, opacity: 0.8, background: "rgba(0,0,0,0.30)" }}>{p.note}</div>}
          </div>
        ))}
      </div>
      {zoom && (
        <div onClick={() => setZoom(null)} style={{
          position: "fixed", inset: 0, zIndex: 900,
          background: "rgba(0,0,0,0.92)", padding: 20,
          display: "flex", alignItems: "center", justifyContent: "center", cursor: "zoom-out",
        }}>
          <img src={zoom} alt="" style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }} />
        </div>
      )}
    </div>
  );
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
      marginBottom: 16, padding: 14, borderRadius: 14,
      background: "linear-gradient(135deg, rgba(168,85,247,0.10), rgba(99,102,241,0.05))",
      border: "1px solid rgba(168,85,247,0.30)",
    }}>
      <button
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        style={{
          width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center",
          gap: 10, padding: 0, background: "transparent", border: "none",
          color: "inherit", textAlign: "left", cursor: "pointer",
        }}
      >
        <div>
          <SectionPill icon="📖">Lesson · what the student should know</SectionPill>
          <div style={{
            fontSize: 17, fontWeight: 900, marginTop: 6, letterSpacing: "-0.015em",
            background: "linear-gradient(135deg, #f5f1e8 0%, #f9a8d4 100%)",
            WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text",
          }}>{title}</div>
        </div>
        <span style={{ fontSize: 18, color: "#c4b5fd", fontWeight: 800 }}>{open ? "▾" : "▸"}</span>
      </button>
      {open && (
        <div style={{ marginTop: 10, fontSize: 13, lineHeight: 1.55, color: "rgba(245,241,232,0.92)" }}>
          {intro && <p style={{ margin: "0 0 8px" }}>{intro}</p>}
          {body && <p style={{ margin: "0 0 8px", color: "rgba(245,241,232,0.80)", whiteSpace: "pre-wrap" }}>{body}</p>}
          {keyPoints.length > 0 && (
            <ul style={{ margin: "0 0 8px 18px", padding: 0 }}>
              {keyPoints.map((p, i) => <li key={i} style={{ marginBottom: 2 }}>{p}</li>)}
            </ul>
          )}
          {example && (
            <div style={{
              padding: "8px 12px", borderRadius: 10, marginBottom: 8,
              background: "rgba(10,4,20,0.40)",
              border: "1px solid rgba(168,85,247,0.20)",
            }}>
              <b style={{ color: "#fce7f3" }}>Example:</b> {example.problem} → <span style={{ color: "#86efac", fontWeight: 800 }}>{example.solution}</span>
            </div>
          )}
          {vocab.length > 0 && (
            <div style={{
              padding: 10, borderRadius: 10,
              background: "linear-gradient(135deg, rgba(16,185,129,0.12), rgba(168,85,247,0.05))",
              border: "1px solid rgba(16,185,129,0.40)",
            }}>
              <div style={{ marginBottom: 8 }}>
                <SectionPill icon="📖">Vocabulary · words you need</SectionPill>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 6 }}>
                {vocab.map((v, i) => (
                  <div key={i} style={{
                    padding: "8px 10px", borderRadius: 8,
                    background: "rgba(10,4,20,0.40)",
                    border: "1px solid rgba(16,185,129,0.30)",
                  }}>
                    <div style={{ fontWeight: 900, fontSize: 12, color: "#fce7f3", letterSpacing: "-0.005em" }}>{v.term}</div>
                    <div style={{ fontSize: 11.5, color: "rgba(196,181,253,0.80)", marginTop: 2, fontWeight: 600 }}>{v.definition}</div>
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
      padding: "10px 12px", borderRadius: 12,
      background: "linear-gradient(180deg, rgba(168,85,247,0.08) 0%, rgba(99,102,241,0.04) 100%)",
      border: "1px solid rgba(168,85,247,0.20)",
    }}>
      <div style={{
        fontSize: 9, fontWeight: 800, letterSpacing: "0.22em", textTransform: "uppercase",
        color: "rgba(196,181,253,0.65)", marginBottom: 4,
      }}>{label}</div>
      <div style={{ fontSize: 13, fontWeight: 800, color: "#fce7f3", letterSpacing: "-0.005em" }}>{value}</div>
    </div>
  );
}
function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{
        fontSize: 9, fontWeight: 800, letterSpacing: "0.22em", textTransform: "uppercase",
        color: "rgba(196,181,253,0.65)", marginBottom: 5,
      }}>{label}</div>
      {children}
    </div>
  );
}
function SectionPill({ icon, children }: { icon: string; children: React.ReactNode }) {
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 7,
      padding: "4px 12px", borderRadius: 999,
      background: "rgba(168,85,247,0.10)",
      border: "1px solid rgba(168,85,247,0.30)",
      fontSize: 10, fontWeight: 800, letterSpacing: "0.22em", textTransform: "uppercase",
      color: "#c4b5fd",
    }}>
      <span aria-hidden>{icon}</span>{children}
    </span>
  );
}
function inpStyle(): React.CSSProperties {
  return {
    width: "100%", padding: "10px 12px", borderRadius: 10,
    background: "rgba(10,4,20,0.45)", color: "#fce7f3",
    border: "1px solid rgba(168,85,247,0.25)",
    fontSize: 14, outline: "none", fontWeight: 600,
    boxSizing: "border-box",
  };
}
function selStyle(): React.CSSProperties {
  return { ...inpStyle(), appearance: "none" as any };
}
function markBtn(active: boolean, color: string): React.CSSProperties {
  return {
    width: 36, height: 32, borderRadius: 8,
    background: active ? `linear-gradient(135deg, ${color}, ${color}cc)` : "rgba(168,85,247,0.06)",
    border: `1px solid ${active ? color : "rgba(168,85,247,0.20)"}`,
    color: active ? "white" : color,
    fontWeight: 900, fontSize: 16, cursor: "pointer",
    boxShadow: active ? `0 0 12px ${color}55` : undefined,
    touchAction: "manipulation",
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
