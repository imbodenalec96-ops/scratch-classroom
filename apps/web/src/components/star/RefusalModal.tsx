// Refusal log modal — pops when a refusal-type barcode is scanned.
// Logs to star_l (refusal log) AND star_rfgtrack (form tracker).

import { useEffect, useState } from "react";
import { StarStore, saveAll, type StarRefusalLog, type StarRfgTrackerEntry, type StarStudent } from "../../lib/star/storage.ts";
import { loggedBeep, errorBeep } from "../../lib/star/sounds.ts";
import { fireStarBoardEvent } from "../../lib/star/boardEvents.ts";

interface Props {
  barcode: string;
  type: "Work Refusal" | "Specials Refusal";
  onClose: () => void;
}

const BEHAVIORS = ["Refused verbally", "Put head down", "Pushed materials", "Tore/crumpled", "Ignored prompts", "Walked away", "Threw items", "Other"];
const INTERVENTIONS = ["Verbal 1×", "Verbal 3×", "Break offered", "Task modified", "Choice offered", "Visual support", "Token board", "First-Then", "Redirection"];
const ACTIONS = ["Parent contacted", "Admin notified", "Privileges removed", "Work sent home", "Free time removed", "Tech time removed"];
const PARENT_OPTS = ["No", "Yes", "Voicemail", "Email Sent"];
const ADMIN_OPTS  = ["No", "Yes", "Pending"];

const SUBJECTS = ["Math", "Reading", "Writing", "Science", "Social Studies", "PE", "Art", "Library", "Music"];

export default function RefusalModal({ barcode, type, onClose }: Props) {
  const [students] = useState<StarStudent[]>(() => StarStore.getStudents());
  const [tpls] = useState<string[]>(() => StarStore.getTpls());
  const [studentId, setStudentId] = useState<string>("");
  const [refusalType, setRefusalType] = useState<"Work Refusal" | "Specials Refusal">(type);
  const [subject, setSubject] = useState<string>("");
  const [task, setTask] = useState<string>("");
  const [behaviors, setBehaviors] = useState<string[]>([]);
  const [interventions, setInterventions] = useState<string[]>([]);
  const [actions, setActions] = useState<string[]>([]);
  const [parent, setParent] = useState<string>("No");
  const [admin, setAdmin] = useState<string>("No");
  const [notes, setNotes] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);

  // If the barcode is a known assignment-form, prefill subject from bcDB
  useEffect(() => {
    const bc = StarStore.getBcDB()[barcode];
    if (bc && bc.type === "assignment") {
      setSubject(bc.subject);
      setTask(bc.name);
      if (bc.studentName) {
        const s = students.find((x) => `${x.firstName} ${x.lastName}` === bc.studentName);
        if (s) setStudentId(s.id);
      }
    }
  }, [barcode, students]);

  const toggle = (arr: string[], setter: (v: string[]) => void, value: string) => {
    setter(arr.includes(value) ? arr.filter((x) => x !== value) : [...arr, value]);
  };

  const save = () => {
    if (!studentId) { errorBeep(); alert("Pick a student first."); return; }
    const student = students.find((s) => s.id === studentId);
    if (!student) return;
    setSaving(true);
    const now = new Date();
    const dateStr = now.toLocaleDateString();
    const timeStr = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    const log = StarStore.getLog();
    const num = log.length + 1;
    const entry: StarRefusalLog = {
      id: Date.now(),
      num,
      barcode,
      date: dateStr,
      time: timeStr,
      student: `${student.firstName} ${student.lastName}`,
      studentId: student.id,
      type: refusalType,
      subject,
      task,
      behaviors: behaviors.join(", "),
      interventions: interventions.join(", "),
      actions: actions.join(", "),
      parent,
      admin,
      notes,
    };
    log.unshift(entry);

    const tracker = StarStore.getRfgTrack();
    const trackEntry: StarRfgTrackerEntry = {
      id: `RFL-${entry.id}`,
      type: refusalType === "Specials Refusal" ? "specials" : "work",
      studentName: entry.student,
      studentId: entry.studentId,
      date: dateStr,
      time: timeStr,
      subject,
      task,
      behaviors: entry.behaviors,
      interventions: entry.interventions,
      actions: entry.actions,
      parentContacted: parent,
      adminNotified: admin,
      status: "logged",
      followUp: "",
      resolution: "",
      notes,
      barcode,
      createdAt: now.toISOString(),
    };
    tracker.unshift(trackEntry);

    saveAll({ log, rfgTracker: tracker });

    // Broadcast to the ClassroomBoard so it can show the big alert overlay.
    fireStarBoardEvent({
      kind: "refusal",
      studentName: `${student.firstName} ${student.lastName}`.trim(),
      studentId: student.id,
      refusalType,
      detail: subject ? `${subject}${task ? ` · ${task}` : ""}` : task || undefined,
    });

    loggedBeep();
    setSaving(false);
    setSavedFlash(true);
    setTimeout(() => { setSavedFlash(false); onClose(); }, 900);
  };

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
      <div style={{
        background: "linear-gradient(180deg, #0f172a 0%, #1e1b2e 100%)",
        border: "1px solid rgba(255,255,255,0.10)",
        borderRadius: 18, width: "min(880px, 96vw)", maxHeight: "92vh",
        overflow: "auto", padding: 22, color: "#f5f1e8",
        boxShadow: "0 24px 64px rgba(0,0,0,0.5)",
      }}>
        <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.2em", textTransform: "uppercase", opacity: 0.55 }}>
              {refusalType}
            </div>
            <div style={{ fontSize: 22, fontWeight: 800, marginTop: 2 }}>
              Log refusal — <span style={{ fontFamily: "Menlo, monospace", color: "#fde68a" }}>{barcode}</span>
            </div>
          </div>
          <button onClick={onClose} style={closeBtn()}>✕</button>
        </header>

        {/* Refusal type toggle */}
        <Row label="Type">
          <div style={{ display: "flex", gap: 8 }}>
            {(["Work Refusal", "Specials Refusal"] as const).map((t) => (
              <button key={t} onClick={() => setRefusalType(t)} style={pill(refusalType === t)}>
                {t}
              </button>
            ))}
          </div>
        </Row>

        {/* Student grid */}
        <Row label="Student">
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(110px, 1fr))", gap: 8 }}>
            {students.map((s) => {
              const selected = studentId === s.id;
              const initial = s.firstName[0].toUpperCase();
              return (
                <button key={s.id} onClick={() => setStudentId(s.id)} style={{
                  padding: "10px 8px", borderRadius: 10,
                  background: selected ? "linear-gradient(135deg, #b23a48, #d97706)" : "rgba(255,255,255,0.04)",
                  border: selected ? "1px solid rgba(251,191,36,0.55)" : "1px solid rgba(255,255,255,0.10)",
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

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <Row label="Subject">
            <select value={subject} onChange={(e) => setSubject(e.target.value)} style={selStyle()}>
              <option value="">—</option>
              {SUBJECTS.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </Row>
          <Row label="Assignment / Task">
            <input value={task} onChange={(e) => setTask(e.target.value)} placeholder="e.g. Multiplication WS p.12" style={inpStyle()} />
          </Row>
        </div>

        <Row label="Behaviors observed">
          <CheckGrid items={BEHAVIORS} selected={behaviors} onToggle={(v) => toggle(behaviors, setBehaviors, v)} />
        </Row>
        <Row label="Interventions tried">
          <CheckGrid items={INTERVENTIONS} selected={interventions} onToggle={(v) => toggle(interventions, setInterventions, v)} />
        </Row>
        <Row label="Actions taken">
          <CheckGrid items={ACTIONS} selected={actions} onToggle={(v) => toggle(actions, setActions, v)} />
        </Row>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <Row label="Parent contacted">
            <select value={parent} onChange={(e) => setParent(e.target.value)} style={selStyle()}>
              {PARENT_OPTS.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          </Row>
          <Row label="Admin notified">
            <select value={admin} onChange={(e) => setAdmin(e.target.value)} style={selStyle()}>
              {ADMIN_OPTS.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          </Row>
        </div>

        <Row label="Notes (tap a template to insert)">
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
            {tpls.map((t, i) => (
              <button key={i} onClick={() => setNotes((n) => (n ? n + " " + t : t))} style={tplBtn()}>
                {t}
              </button>
            ))}
          </div>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder="Anything else?" style={{ ...inpStyle(), resize: "vertical", fontFamily: "inherit" }} />
        </Row>

        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 18 }}>
          <button onClick={onClose} style={btnGhost()}>Cancel</button>
          <button onClick={save} disabled={saving} style={btnPrimary(savedFlash)}>
            {saving ? "Saving…" : savedFlash ? "✓ Saved" : "Save log"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── small styled helpers ───────────────────────────────────────── */

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.18em", textTransform: "uppercase", opacity: 0.55, marginBottom: 6 }}>
        {label}
      </div>
      {children}
    </div>
  );
}
function CheckGrid({ items, selected, onToggle }: { items: string[]; selected: string[]; onToggle: (v: string) => void }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 6 }}>
      {items.map((it) => {
        const on = selected.includes(it);
        return (
          <button key={it} onClick={() => onToggle(it)} style={{
            padding: "8px 12px", borderRadius: 10,
            background: on ? "rgba(34,197,94,0.18)" : "rgba(255,255,255,0.04)",
            border: on ? "1px solid rgba(34,197,94,0.55)" : "1px solid rgba(255,255,255,0.10)",
            color: on ? "#bbf7d0" : "rgba(245,241,232,0.85)",
            fontSize: 12, fontWeight: 700, cursor: "pointer",
            textAlign: "left",
          }}>{on ? "✓ " : ""}{it}</button>
        );
      })}
    </div>
  );
}
function inpStyle(): React.CSSProperties {
  return {
    width: "100%", boxSizing: "border-box",
    padding: "10px 14px", borderRadius: 10,
    background: "rgba(0,0,0,0.30)",
    border: "1px solid rgba(255,255,255,0.12)",
    color: "white", fontSize: 14, fontWeight: 600, outline: "none",
  };
}
function selStyle(): React.CSSProperties { return inpStyle(); }
function pill(active: boolean): React.CSSProperties {
  return {
    padding: "8px 16px", borderRadius: 999,
    background: active ? "linear-gradient(135deg,#b23a48,#d97706)" : "rgba(255,255,255,0.05)",
    border: active ? "none" : "1px solid rgba(255,255,255,0.12)",
    color: "white", fontWeight: 800, fontSize: 13, cursor: "pointer",
  };
}
function tplBtn(): React.CSSProperties {
  return {
    padding: "5px 10px", borderRadius: 999,
    background: "rgba(124,58,237,0.10)",
    border: "1px solid rgba(124,58,237,0.35)",
    color: "#c4b5fd", fontSize: 11, fontWeight: 700, cursor: "pointer",
  };
}
function btnGhost(): React.CSSProperties {
  return {
    padding: "10px 18px", borderRadius: 10,
    background: "rgba(255,255,255,0.05)",
    border: "1px solid rgba(255,255,255,0.12)",
    color: "rgba(245,241,232,0.85)", fontWeight: 700, cursor: "pointer",
  };
}
function btnPrimary(saved: boolean): React.CSSProperties {
  return {
    padding: "10px 22px", borderRadius: 10,
    background: saved ? "linear-gradient(135deg,#15803d,#22c55e)" : "linear-gradient(135deg,#b23a48,#d97706)",
    border: "none", color: "white", fontWeight: 800, fontSize: 13, cursor: "pointer",
  };
}
function closeBtn(): React.CSSProperties {
  return {
    width: 36, height: 36, borderRadius: "50%",
    background: "rgba(255,255,255,0.08)",
    border: "1px solid rgba(255,255,255,0.15)",
    color: "white", fontSize: 18, fontWeight: 700, cursor: "pointer",
  };
}
