// Pops when a status-action barcode is scanned (Absent / Skipped /
// Excused / Makeup). Asks for student + assignment, then writes a
// submission with the matching status so it shows up correctly in
// the gradebook + reports without going through the full grade form.

import { useMemo, useState } from "react";
import {
  StarStore, saveAll,
  type StarStudent, type StarTrackerEntry, type StarSubmission,
} from "../../lib/star/storage.ts";
import { successBeep, errorBeep, loggedBeep } from "../../lib/star/sounds.ts";
import { fireStarBoardEvent } from "../../lib/star/boardEvents.ts";
import { Modal } from "./ui.tsx";

interface Props {
  statusKind: "Absent" | "Skipped" | "Excused" | "Makeup";
  onClose: () => void;
}

const STATUS_TO_SUB: Record<Props["statusKind"], StarSubmission["status"]> = {
  Absent:  "absent",
  Skipped: "skipped",
  Excused: "excused",
  Makeup:  "makeup",
};

const STATUS_ICON: Record<Props["statusKind"], string> = {
  Absent: "🚫", Skipped: "⏭", Excused: "🩹", Makeup: "🔁",
};

const STATUS_COLOR: Record<Props["statusKind"], string> = {
  Absent: "#ef4444", Skipped: "#f59e0b", Excused: "#3b82f6", Makeup: "#a855f7",
};

export default function StatusModal({ statusKind, onClose }: Props) {
  const [students] = useState<StarStudent[]>(() => StarStore.getStudents());
  const [studentId, setStudentId] = useState("");
  const [assignmentId, setAssignmentId] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);

  // Show this kid's pending assignments first; fall back to all if empty.
  const tracker = useMemo(() => StarStore.getAsnTrack(), []);
  const assignments = useMemo(() => {
    const all = Object.values(tracker).sort((a, b) => (b.createdDate || "").localeCompare(a.createdDate || ""));
    if (!studentId) return all;
    const owned = all.filter((t) => t.studentId === studentId || (!t.studentId && !t.studentName));
    return owned.length ? owned : all;
  }, [tracker, studentId]);

  const accent = STATUS_COLOR[statusKind];

  const save = () => {
    if (!studentId) { errorBeep(); alert("Pick a student."); return; }
    if (!assignmentId) { errorBeep(); alert("Pick an assignment."); return; }
    const s = students.find((x) => x.id === studentId);
    const t = tracker[assignmentId];
    if (!s || !t) return;
    setSaving(true);

    const sub: StarSubmission = {
      studentId: s.id,
      studentName: `${s.firstName} ${s.lastName}`.trim(),
      completedDate: new Date().toISOString().slice(0, 10),
      score: 0,
      maxScore: t.questions?.length || 1,
      pct: 0,
      letterGrade: statusKind === "Excused" ? "—" : "F",
      feedback: `Marked ${statusKind}${note ? ` — ${note}` : ""}`,
      timeSpent: "",
      notes: note,
      status: STATUS_TO_SUB[statusKind],
      qMarks: {},
      loggedAt: new Date().toISOString(),
    };

    const all = StarStore.getAsnTrack();
    const cur = all[assignmentId];
    all[assignmentId] = {
      ...cur,
      submissions: [sub, ...(cur.submissions || [])],
      status: STATUS_TO_SUB[statusKind],
    };
    saveAll({ asnTracker: all });

    fireStarBoardEvent({
      kind: "refusal", // re-uses the alert overlay style for "something happened"
      studentName: sub.studentName,
      studentId: s.id,
      detail: `${t.name} marked ${statusKind}${note ? ` — ${note}` : ""}`,
      refusalType: `${statusKind} on assignment`,
    });

    loggedBeep();
    setSaving(false);
    setSavedFlash(true);
    setTimeout(() => { setSavedFlash(false); onClose(); }, 900);
  };

  return (
    <Modal
      onClose={onClose}
      kicker={<span style={{ color: accent }}>{STATUS_ICON[statusKind]} Mark Assignment {statusKind}</span>}
      title="Pick the student + assignment"
      width={720}
    >

        {/* Student grid */}
        <Row label="Student">
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(110px, 1fr))", gap: 8 }}>
            {students.map((s) => {
              const selected = studentId === s.id;
              const initial = (s.firstName || "?")[0].toUpperCase();
              return (
                <button key={s.id} onClick={() => setStudentId(s.id)} style={{
                  padding: "10px 8px", borderRadius: 10,
                  background: selected ? `linear-gradient(135deg, ${accent}55, ${accent}25)` : "rgba(255,255,255,0.04)",
                  border: selected ? `1px solid ${accent}` : "1px solid rgba(255,255,255,0.10)",
                  color: "white", cursor: "pointer",
                  display: "flex", flexDirection: "column", alignItems: "center", gap: 6,
                }}>
                  <div style={{
                    width: 36, height: 36, borderRadius: "50%",
                    background: "linear-gradient(135deg, #6366f1, #b23a48)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontWeight: 800, fontSize: 16,
                  }}>{initial}</div>
                  <span style={{ fontSize: 12, fontWeight: 700 }}>{s.firstName}</span>
                  {s.grade && <span style={{ fontSize: 10, opacity: 0.6 }}>{s.grade}</span>}
                </button>
              );
            })}
          </div>
        </Row>

        {/* Assignment dropdown */}
        <Row label={`Assignment ${studentId ? "(theirs first)" : ""}`}>
          <select value={assignmentId} onChange={(e) => setAssignmentId(e.target.value)} style={inp()}>
            <option value="">— Pick an assignment —</option>
            {assignments.slice(0, 200).map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} · {a.subject} · {a.gradeLevel || "—"} · {a.id}
              </option>
            ))}
          </select>
        </Row>

        <Row label="Optional note (visible in gradebook)">
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. flu, family event, will do tomorrow" style={inp()} />
        </Row>

        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 18 }}>
          <button onClick={onClose} style={ghost()}>Cancel</button>
          <button onClick={save} disabled={saving} style={{
            padding: "10px 16px", borderRadius: 10,
            background: savedFlash ? "#10b981" : `linear-gradient(135deg, ${accent}, #b23a48)`,
            color: "white", border: "none", fontWeight: 800, cursor: "pointer", fontSize: 14,
          }}>
            {saving ? "Saving…" : savedFlash ? "✓ Saved" : `${STATUS_ICON[statusKind]} Mark ${statusKind}`}
          </button>
        </div>
    </Modal>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.18em", textTransform: "uppercase", opacity: 0.55, marginBottom: 6 }}>{label}</div>
      {children}
    </div>
  );
}
function inp(): React.CSSProperties {
  return {
    width: "100%", padding: "9px 10px", borderRadius: 8,
    background: "rgba(0,0,0,0.30)", color: "white",
    border: "1px solid rgba(255,255,255,0.12)", fontSize: 13, outline: "none",
  };
}
function ghost(): React.CSSProperties {
  return {
    padding: "10px 14px", borderRadius: 10,
    background: "rgba(255,255,255,0.05)", color: "white",
    border: "1px solid rgba(255,255,255,0.15)",
    fontWeight: 700, cursor: "pointer",
  };
}
