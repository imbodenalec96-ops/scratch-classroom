import React, { useEffect, useState } from "react";
import { useTheme } from "../lib/theme.tsx";
import { api } from "../lib/api.ts";

const BASE =
  (import.meta as any)?.env?.VITE_API_BASE ||
  (typeof window !== "undefined" && window.location.hostname === "localhost"
    ? "http://localhost:4000/api"
    : "/api");

async function req<T = any>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...options?.headers },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || res.statusText);
  }
  return res.json();
}

// ─── Types ────────────────────────────────────────────────────────────────────

type SubjectKey = "reading" | "math" | "writing" | "spelling" | "sel" | "science" | "other";

interface SchedulePeriod {
  name: string;
  start_time: string;
  end_time: string;
  subject: SubjectKey;
}

interface ScheduleLink {
  assignmentId: string;
  assignmentTitle: string;
}

interface AdminAssignment {
  id: string;
  title: string;
  target_subject: string;
  target_grade_min: number;
  target_student_ids: string;
  scheduled_date: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const SUBJECT_COLORS: Record<SubjectKey, string> = {
  reading:  "#10b981",
  math:     "#3b82f6",
  writing:  "#a855f7",
  spelling: "#ec4899",
  sel:      "#f59e0b",
  science:  "#06b6d4",
  other:    "#6b7280",
};

const SUBJECT_LABELS: Record<SubjectKey, string> = {
  reading:  "Reading",
  math:     "Math",
  writing:  "Writing",
  spelling: "Spelling",
  sel:      "SEL",
  science:  "Science",
  other:    "Other",
};

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri"] as const;
type DayKey = typeof DAYS[number];

const DEFAULT_PERIODS: SchedulePeriod[] = [
  { name: "Morning Work",    start_time: "8:00",  end_time: "8:30",  subject: "reading"  },
  { name: "ELA Block",       start_time: "8:30",  end_time: "9:30",  subject: "reading"  },
  { name: "Math Block",      start_time: "9:30",  end_time: "10:30", subject: "math"     },
  { name: "Writing",         start_time: "10:30", end_time: "11:15", subject: "writing"  },
  { name: "Science / SEL",   start_time: "12:30", end_time: "1:15",  subject: "science"  },
  { name: "Spelling / Word", start_time: "1:15",  end_time: "2:00",  subject: "spelling" },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getTodayDayKey(): DayKey | null {
  const d = new Date().getDay();
  if (d === 0 || d === 6) return null;
  return DAYS[d - 1];
}

function getNextDateForDay(dayKey: DayKey): string {
  const idx = DAYS.indexOf(dayKey);
  const today = new Date();
  const todayIdx = (today.getDay() + 6) % 7;
  let diff = idx - todayIdx;
  if (diff < 0) diff += 7;
  const d = new Date(today);
  d.setDate(today.getDate() + diff);
  return d.toISOString().slice(0, 10);
}

// ─── CellPicker ───────────────────────────────────────────────────────────────

interface CellPickerProps {
  day: DayKey;
  period: SchedulePeriod;
  periodIdx: number;
  linked: ScheduleLink | null;
  classId: string;
  teacherId: string;
  onLink: (link: ScheduleLink) => void;
  onClose: () => void;
}

function CellPicker({ day, period, linked, classId, teacherId, onLink, onClose }: CellPickerProps) {
  const [assignments, setAssignments] = useState<AdminAssignment[]>([]);
  const [loadingList, setLoadingList]  = useState(true);
  const [creating, setCreating]        = useState(false);
  const [generating, setGenerating]    = useState(false);
  const [statusMsg, setStatusMsg]      = useState("");
  const date = getNextDateForDay(day);

  useEffect(() => {
    setLoadingList(true);
    fetch(`${BASE}/admin/assignments`)
      .then(r => r.json())
      .then((all: AdminAssignment[]) => {
        const filtered = all.filter(a => !period.subject || a.target_subject === period.subject);
        setAssignments(filtered.length ? filtered : all);
      })
      .catch(() => {})
      .finally(() => setLoadingList(false));
  }, [period.subject]);

  const handleCreate = async () => {
    setCreating(true);
    setStatusMsg("Creating assignment…");
    try {
      const body = {
        title: `${SUBJECT_LABELS[period.subject]} – ${period.name}`,
        subject: period.subject,
        grade: 3,
        studentIds: [],
        date,
        questions: [],
        classId,
        teacherId,
      };
      const res = await req<{ id: string; title: string }>("/admin/create-assignment", {
        method: "POST",
        body: JSON.stringify(body),
      });
      onLink({ assignmentId: res.id, assignmentTitle: res.title });
      setStatusMsg("Linked!");
    } catch (e: any) {
      setStatusMsg(`Error: ${e.message}`);
    } finally {
      setCreating(false);
    }
  };

  const handleAI = async () => {
    setGenerating(true);
    setStatusMsg("Asking AI to generate…");
    try {
      const params = new URLSearchParams({ subject: period.subject, grade: "3", date, classId });
      const res = await req<{ id: string; title: string }>(`/assignments/generate-slot?${params}`);
      onLink({ assignmentId: res.id, assignmentTitle: res.title });
      setStatusMsg("AI assignment linked!");
    } catch (e: any) {
      setStatusMsg(`Error: ${e.message}`);
    } finally {
      setGenerating(false);
    }
  };

  const subColor = SUBJECT_COLORS[period.subject];

  const panelInput: React.CSSProperties = {
    width: "100%",
    background: "rgba(255,255,255,0.06)",
    border: "1px solid rgba(255,255,255,0.12)",
    borderRadius: 8,
    padding: "7px 11px",
    color: "white",
    fontSize: 13,
    boxSizing: "border-box",
  };

  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)", zIndex: 2000, display: "flex", alignItems: "center", justifyContent: "center", backdropFilter: "blur(4px)" }}
      onClick={onClose}
    >
      <div
        style={{ background: "#0f1129", border: `1px solid ${subColor}44`, borderRadius: 18, padding: 28, width: "min(540px, 95vw)", maxHeight: "85vh", overflowY: "auto", boxShadow: `0 0 40px ${subColor}22` }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ width: 10, height: 10, borderRadius: "50%", background: subColor }} />
              <span style={{ fontSize: 16, fontWeight: 800, color: "white" }}>{day} — {period.name}</span>
            </div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.45)", marginTop: 4 }}>
              {period.start_time}–{period.end_time} · {SUBJECT_LABELS[period.subject]} · {date}
            </div>
          </div>
          <button onClick={onClose} style={{ background: "rgba(255,255,255,0.07)", border: "none", borderRadius: 8, color: "rgba(255,255,255,0.5)", padding: "6px 12px", cursor: "pointer", fontSize: 14 }}>
            ✕
          </button>
        </div>

        {linked && (
          <div style={{ background: `${subColor}18`, border: `1px solid ${subColor}44`, borderRadius: 12, padding: "12px 16px", marginBottom: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: subColor, marginBottom: 4, textTransform: "uppercase", letterSpacing: 1 }}>Currently Linked</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: "white" }}>{linked.assignmentTitle}</div>
          </div>
        )}

        <div style={{ display: "flex", gap: 10, marginBottom: 20 }}>
          <button onClick={handleCreate} disabled={creating || generating}
            style={{ flex: 1, background: `${subColor}22`, border: `1px solid ${subColor}55`, borderRadius: 10, color: "white", padding: "10px 14px", fontSize: 13, fontWeight: 700, cursor: "pointer", opacity: creating ? 0.6 : 1 }}>
            {creating ? "Creating…" : "+ Create New"}
          </button>
          <button onClick={handleAI} disabled={creating || generating}
            style={{ flex: 1, background: "linear-gradient(135deg, rgba(124,58,237,0.3), rgba(99,102,241,0.25))", border: "1px solid rgba(124,58,237,0.5)", borderRadius: 10, color: "white", padding: "10px 14px", fontSize: 13, fontWeight: 700, cursor: "pointer", opacity: generating ? 0.6 : 1 }}>
            {generating ? "Generating…" : "✨ Use AI"}
          </button>
        </div>

        {statusMsg && (
          <div style={{ fontSize: 13, color: statusMsg.startsWith("Error") ? "#f87171" : "#34d399", marginBottom: 14, textAlign: "center" }}>
            {statusMsg}
          </div>
        )}

        <div style={{ fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.4)", marginBottom: 10, textTransform: "uppercase", letterSpacing: 0.8 }}>
          Recent / Upcoming Assignments
        </div>
        {loadingList ? (
          <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 13, padding: "16px 0" }}>Loading…</div>
        ) : assignments.length === 0 ? (
          <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 13, padding: "16px 0" }}>No assignments yet. Create one above.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {assignments.slice(0, 12).map(a => {
              const isLinked = linked?.assignmentId === a.id;
              return (
                <button key={a.id} onClick={() => onLink({ assignmentId: a.id, assignmentTitle: a.title })}
                  style={{ display: "flex", alignItems: "center", gap: 12, background: isLinked ? `${subColor}22` : "rgba(255,255,255,0.04)", border: `1px solid ${isLinked ? subColor + "55" : "rgba(255,255,255,0.08)"}`, borderRadius: 10, padding: "10px 14px", cursor: "pointer", textAlign: "left", transition: "all 0.15s" }}>
                  <div style={{ width: 8, height: 8, borderRadius: "50%", background: SUBJECT_COLORS[a.target_subject as SubjectKey] || "#6b7280", flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "white", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.title}</div>
                    <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginTop: 2 }}>
                      {a.target_subject} · Grade {a.target_grade_min} · {a.scheduled_date}
                    </div>
                  </div>
                  {isLinked && <div style={{ fontSize: 11, color: subColor, fontWeight: 800 }}>✓ Linked</div>}
                </button>
              );
            })}
          </div>
        )}

        <div style={{ marginTop: 16 }}>
          <input
            style={panelInput}
            placeholder="Search assignments by title…"
            onChange={e => {
              const q = e.target.value.toLowerCase();
              fetch(`${BASE}/admin/assignments`)
                .then(r => r.json())
                .then((all: AdminAssignment[]) => {
                  setAssignments(q ? all.filter(a => a.title.toLowerCase().includes(q)) : all);
                })
                .catch(() => {});
            }}
          />
        </div>
      </div>
    </div>
  );
}

// ─── AddPeriodForm ─────────────────────────────────────────────────────────────

function AddPeriodForm({ onAdd }: { onAdd: (p: SchedulePeriod) => void }) {
  const [name, setName]           = useState("");
  const [startTime, setStartTime] = useState("9:00");
  const [endTime, setEndTime]     = useState("10:00");
  const [subject, setSubject]     = useState<SubjectKey>("reading");
  const [open, setOpen]           = useState(false);

  const formInput: React.CSSProperties = {
    background: "rgba(255,255,255,0.07)",
    border: "1px solid rgba(255,255,255,0.12)",
    borderRadius: 8,
    padding: "7px 11px",
    color: "white",
    fontSize: 13,
    boxSizing: "border-box",
    width: "100%",
  };

  const submit = () => {
    if (!name.trim()) return;
    onAdd({ name: name.trim(), start_time: startTime, end_time: endTime, subject });
    setName(""); setStartTime("9:00"); setEndTime("10:00"); setSubject("reading");
    setOpen(false);
  };

  return (
    <div>
      {!open ? (
        <button onClick={() => setOpen(true)}
          style={{ background: "rgba(124,58,237,0.15)", border: "1px dashed rgba(124,58,237,0.4)", borderRadius: 10, color: "#a78bfa", padding: "10px 18px", cursor: "pointer", fontSize: 13, fontWeight: 700, width: "100%" }}>
          + Add Period
        </button>
      ) : (
        <div style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(124,58,237,0.3)", borderRadius: 14, padding: 18 }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: "white", marginBottom: 14 }}>New Period</div>
          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1.5fr", gap: 10, marginBottom: 12 }}>
            <div>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginBottom: 4 }}>Name</div>
              <input style={formInput} value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Morning Work" />
            </div>
            <div>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginBottom: 4 }}>Start</div>
              <input style={formInput} value={startTime} onChange={e => setStartTime(e.target.value)} placeholder="9:00" />
            </div>
            <div>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginBottom: 4 }}>End</div>
              <input style={formInput} value={endTime} onChange={e => setEndTime(e.target.value)} placeholder="10:00" />
            </div>
            <div>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginBottom: 4 }}>Subject</div>
              <select style={{ ...formInput, cursor: "pointer" }} value={subject} onChange={e => setSubject(e.target.value as SubjectKey)}>
                {(Object.keys(SUBJECT_LABELS) as SubjectKey[]).map(s => (
                  <option key={s} value={s}>{SUBJECT_LABELS[s]}</option>
                ))}
              </select>
            </div>
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={submit} style={{ background: "#7c3aed", border: "none", borderRadius: 8, color: "white", padding: "8px 18px", cursor: "pointer", fontSize: 13, fontWeight: 700 }}>
              Add Period
            </button>
            <button onClick={() => setOpen(false)} style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, color: "rgba(255,255,255,0.5)", padding: "8px 14px", cursor: "pointer", fontSize: 13 }}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function AssignmentSchedulePage() {
  const { theme } = useTheme();
  const dk = theme === "dark";

  const [classId, setClassId]   = useState("");
  const [teacherId, setTeacherId] = useState("");

  const [periods, setPeriods] = useState<SchedulePeriod[]>(() => {
    try {
      const stored = localStorage.getItem("teacher_schedule_periods");
      return stored ? JSON.parse(stored) : DEFAULT_PERIODS;
    } catch {
      return DEFAULT_PERIODS;
    }
  });

  const [links, setLinks] = useState<Record<string, ScheduleLink>>(() => {
    try {
      const stored = localStorage.getItem("teacher_schedule_links");
      return stored ? JSON.parse(stored) : {};
    } catch {
      return {};
    }
  });

  const [activeCell, setActiveCell] = useState<{ day: DayKey; periodIdx: number } | null>(null);

  useEffect(() => {
    api.getClasses().then(cls => {
      if (cls.length > 0) {
        setClassId(cls[0].id);
        setTeacherId(cls[0].teacher_id || "");
      }
    }).catch(() => {});
  }, []);

  useEffect(() => {
    localStorage.setItem("teacher_schedule_periods", JSON.stringify(periods));
  }, [periods]);

  useEffect(() => {
    localStorage.setItem("teacher_schedule_links", JSON.stringify(links));
  }, [links]);

  const todayDay = getTodayDayKey();
  const cellKey = (day: DayKey, periodIdx: number) => `${day}:${periodIdx}`;

  const handleLink = (day: DayKey, periodIdx: number, link: ScheduleLink) => {
    setLinks(prev => ({ ...prev, [cellKey(day, periodIdx)]: link }));
    setActiveCell(null);
  };

  const addPeriod = (p: SchedulePeriod) => setPeriods(prev => [...prev, p]);

  const removePeriod = (idx: number) => {
    if (!confirm("Remove this period?")) return;
    setPeriods(prev => prev.filter((_, i) => i !== idx));
    setLinks(prev => {
      const next = { ...prev };
      DAYS.forEach(d => { delete next[cellKey(d, idx)]; });
      return next;
    });
  };

  const activePeriod = activeCell ? periods[activeCell.periodIdx] : null;
  const activeLink   = activeCell ? (links[cellKey(activeCell.day, activeCell.periodIdx)] ?? null) : null;

  const periodColWidth = 148;
  const dayColWidth    = 168;

  const border  = dk ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)";
  const surface = dk ? "rgba(255,255,255,0.03)" : "rgba(255,255,255,0.9)";

  return (
    <div style={{ minHeight: "100vh", background: dk ? "#07071a" : "#f0f1f8", color: dk ? "white" : "#0f172a", fontFamily: "'Inter', system-ui, sans-serif" }}>

      {/* Header */}
      <div style={{
        background: dk
          ? "linear-gradient(160deg,#0d0b1e 0%,#130d2e 55%,#090f1e 100%)"
          : "linear-gradient(160deg,#7c3aed 0%,#4f46e5 60%,#2563eb 100%)",
        padding: "28px 32px 28px",
        marginBottom: 32,
        position: "relative",
        overflow: "hidden",
      }}>
        <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse at 70% 40%,rgba(124,58,237,0.2) 0%,transparent 65%)", pointerEvents: "none" }} />
        <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.2em", textTransform: "uppercase", color: "rgba(255,255,255,0.45)", marginBottom: 8, position: "relative" }}>
          {new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
        </div>
        <h1 style={{ fontSize: 32, fontWeight: 900, letterSpacing: "-0.035em", margin: 0, lineHeight: 1.1, color: "white", position: "relative" }}>
          📅 Assignment Schedule
        </h1>
        <p style={{ fontSize: 13, marginTop: 8, color: "rgba(255,255,255,0.55)", position: "relative" }}>
          Map assignments to each class period for the week.
        </p>
      </div>

      <div style={{ padding: "0 28px 64px" }}>

        {/* Subject legend */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 28 }}>
          {(Object.keys(SUBJECT_COLORS) as SubjectKey[]).map(s => (
            <div key={s} style={{ display: "flex", alignItems: "center", gap: 6, background: dk ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.04)", border: `1px solid ${border}`, borderRadius: 20, padding: "5px 12px" }}>
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: SUBJECT_COLORS[s] }} />
              <span style={{ fontSize: 11, color: dk ? "rgba(255,255,255,0.6)" : "rgba(0,0,0,0.6)", fontWeight: 600 }}>{SUBJECT_LABELS[s]}</span>
            </div>
          ))}
          {todayDay && (
            <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6, background: "rgba(124,58,237,0.12)", border: "1px solid rgba(124,58,237,0.3)", borderRadius: 20, padding: "5px 12px" }}>
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#7c3aed" }} />
              <span style={{ fontSize: 11, color: "#a78bfa", fontWeight: 700 }}>Today: {todayDay}</span>
            </div>
          )}
        </div>

        {/* Grid */}
        <div style={{ background: dk ? "rgba(255,255,255,0.02)" : surface, borderRadius: 16, border: `1px solid ${border}`, overflowX: "auto", marginBottom: 16, boxShadow: dk ? "none" : "0 2px 16px rgba(0,0,0,0.06)" }}>
          <div style={{ minWidth: periodColWidth + dayColWidth * 5 }}>

            {/* Header row */}
            <div style={{ display: "grid", gridTemplateColumns: `${periodColWidth}px repeat(5, ${dayColWidth}px)`, borderBottom: `1px solid ${border}` }}>
              <div style={{ padding: "14px 16px", fontSize: 11, fontWeight: 700, color: dk ? "rgba(255,255,255,0.3)" : "rgba(0,0,0,0.35)", textTransform: "uppercase", letterSpacing: 1 }}>Period</div>
              {DAYS.map(day => {
                const isToday = day === todayDay;
                return (
                  <div key={day} style={{
                    padding: "14px 16px", fontSize: 13, fontWeight: 800,
                    color: isToday ? "#a78bfa" : dk ? "rgba(255,255,255,0.7)" : "rgba(0,0,0,0.7)",
                    textAlign: "center",
                    borderLeft: `1px solid ${border}`,
                    background: isToday ? "rgba(124,58,237,0.07)" : "transparent",
                    boxShadow: isToday ? "inset 0 0 20px rgba(124,58,237,0.08)" : "none",
                    position: "relative",
                  }}>
                    {day}
                    {isToday && (
                      <div style={{ position: "absolute", bottom: 0, left: "20%", right: "20%", height: 2, background: "linear-gradient(90deg, #7c3aed, #6366f1)", borderRadius: 2 }} />
                    )}
                  </div>
                );
              })}
            </div>

            {/* Period rows */}
            {periods.map((period, pidx) => {
              const subColor = SUBJECT_COLORS[period.subject];
              return (
                <div key={pidx} style={{ display: "grid", gridTemplateColumns: `${periodColWidth}px repeat(5, ${dayColWidth}px)`, borderBottom: `1px solid ${border}` }}>
                  {/* Period label */}
                  <div style={{ padding: "14px 16px", borderRight: `1px solid ${border}` }}>
                    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
                      <div>
                        <div style={{ fontSize: 12, fontWeight: 800, color: dk ? "white" : "#1e1b4b", marginBottom: 3 }}>{period.name}</div>
                        <div style={{ fontSize: 10, color: dk ? "rgba(255,255,255,0.35)" : "rgba(0,0,0,0.4)" }}>{period.start_time}–{period.end_time}</div>
                        <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 5 }}>
                          <div style={{ width: 6, height: 6, borderRadius: "50%", background: subColor }} />
                          <span style={{ fontSize: 10, color: subColor, fontWeight: 700 }}>{SUBJECT_LABELS[period.subject]}</span>
                        </div>
                      </div>
                      <button onClick={() => removePeriod(pidx)} title="Remove period"
                        style={{ background: "none", border: "none", color: dk ? "rgba(255,255,255,0.15)" : "rgba(0,0,0,0.2)", cursor: "pointer", fontSize: 11, padding: "2px 4px", lineHeight: 1, marginLeft: 4 }}>
                        ✕
                      </button>
                    </div>
                  </div>

                  {/* Day cells */}
                  {DAYS.map(day => {
                    const isToday  = day === todayDay;
                    const key      = cellKey(day, pidx);
                    const linked   = links[key] ?? null;
                    const isActive = activeCell?.day === day && activeCell?.periodIdx === pidx;

                    return (
                      <div key={day}
                        onClick={() => setActiveCell(isActive ? null : { day, periodIdx: pidx })}
                        style={{
                          padding: "12px 14px",
                          borderLeft: `1px solid ${border}`,
                          cursor: "pointer",
                          minHeight: 72,
                          transition: "background 0.15s",
                          background: isActive ? `${subColor}18` : isToday ? "rgba(124,58,237,0.04)" : "transparent",
                          position: "relative",
                          boxShadow: isToday ? "inset 0 0 15px rgba(124,58,237,0.05)" : "none",
                        }}
                        onMouseEnter={e => { if (!isActive) (e.currentTarget as HTMLDivElement).style.background = `${subColor}10`; }}
                        onMouseLeave={e => { if (!isActive) (e.currentTarget as HTMLDivElement).style.background = isToday ? "rgba(124,58,237,0.04)" : "transparent"; }}
                      >
                        {linked ? (
                          <div style={{
                            background: `${subColor}20`, border: `1px solid ${subColor}44`, borderRadius: 8,
                            padding: "6px 10px", fontSize: 11, fontWeight: 700, color: dk ? "white" : "#1e1b4b",
                            lineHeight: 1.4, overflow: "hidden", textOverflow: "ellipsis",
                            display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" as const,
                          }}>
                            {linked.assignmentTitle}
                          </div>
                        ) : (
                          <div style={{ fontSize: 11, color: dk ? "rgba(255,255,255,0.18)" : "rgba(0,0,0,0.2)", fontStyle: "italic", paddingTop: 4 }}>
                            + assign
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>

        {/* Add period button */}
        <AddPeriodForm onAdd={addPeriod} />

        {/* Help text */}
        <p style={{ marginTop: 20, fontSize: 12, color: dk ? "rgba(255,255,255,0.3)" : "rgba(0,0,0,0.35)", lineHeight: 1.6 }}>
          Click any cell to link an assignment to that period. Changes are saved locally and persist across sessions.
        </p>
      </div>

      {/* Cell picker modal */}
      {activeCell && activePeriod && classId && (
        <CellPicker
          day={activeCell.day}
          period={activePeriod}
          periodIdx={activeCell.periodIdx}
          linked={activeLink}
          classId={classId}
          teacherId={teacherId}
          onLink={(link) => handleLink(activeCell.day, activeCell.periodIdx, link)}
          onClose={() => setActiveCell(null)}
        />
      )}
    </div>
  );
}
