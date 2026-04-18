import React, { useEffect, useState, useCallback } from "react";

// ─── API base (mirrors lib/api.ts logic) ───────────────────────────────────
const BASE =
  (import.meta as any)?.env?.VITE_API_BASE ||
  (typeof window !== "undefined" && window.location.hostname === "localhost"
    ? "http://localhost:4000/api"
    : "/api");

async function req<T = any>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options?.headers,
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || res.statusText);
  }
  return res.json();
}

// ─── Types ──────────────────────────────────────────────────────────────────
interface Student {
  id: number;
  name: string;
  avatar: string;
  avatar_emoji?: string;
  reading_min: number;
  reading_max: number;
  math_min: number;
  math_max: number;
  writing_min: number;
  writing_max: number;
  behavior_points: number;
  active: boolean;
  skip_work_day_date: string | null;
  approved_video_url?: string | null;
  approved_video_title?: string | null;
  approved_video_set_at?: string | null;
}

interface AdminSettings {
  school_name?: string;
  class_name?: string;
  teacher_password?: string;
  remote_access_pin?: string;
  default_grade_min?: number;
  default_grade_max?: number;
}

interface BreakConfig {
  work_minutes_first?: number;
  work_minutes_next?: number;
  break_duration?: number;
  calming_corner_enabled?: boolean;
  break_system_enabled?: boolean;
  allowed_games?: string[];
}

interface YTRequest {
  id: number;
  student_id: number;
  student_name?: string;
  title: string;
  url?: string;
  status: "pending" | "approved" | "denied";
  created_at?: string;
  requested_at?: string;
}

interface YTApproved {
  id: number;
  title: string;
  url: string;
  category: string;
  thumbnail?: string;
}

interface WorksheetLibraryItem {
  id: number;
  title: string;
  subject: string;
  grades: string;
  source_site?: string;
  url?: string;
}

interface WorksheetAssignment {
  id: number;
  student_id: number;
  worksheet_id?: number;
  subject: string;
  due_date?: string;
  instructions?: string;
  url?: string;
}

interface BreakLog {
  id: number;
  student_name?: string;
  student_id: number;
  date: string;
  start_time: string;
  end_time?: string;
  option_chosen?: string;
  work_minutes_before?: number;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
const todayStr = () => new Date().toISOString().slice(0, 10);

const yt_thumb = (url: string) => {
  try {
    const u = new URL(url);
    const id =
      u.searchParams.get("v") ||
      (u.hostname === "youtu.be" ? u.pathname.slice(1) : null);
    return id ? `https://img.youtube.com/vi/${id}/mqdefault.jpg` : null;
  } catch {
    return null;
  }
};

// ─── Design tokens ────────────────────────────────────────────────────────────
const T = {
  bg: "#07071a",
  sidebar: "#0a0b20",
  sidebarBorder: "rgba(255,255,255,0.05)",
  card: "rgba(255,255,255,0.04)",
  cardBorder: "rgba(255,255,255,0.06)",
  input: {
    background: "rgba(255,255,255,0.06)",
    border: "1px solid rgba(255,255,255,0.1)",
    color: "white",
    borderRadius: 10,
    padding: "8px 12px",
    outline: "none",
    width: "100%",
    boxSizing: "border-box" as const,
    fontSize: 14,
  },
  sub: "rgba(255,255,255,0.4)",
  btn: {
    background: "#7c3aed",
    color: "white",
    border: "none",
    borderRadius: 10,
    padding: "8px 20px",
    cursor: "pointer",
    fontSize: 14,
    fontWeight: 600,
  },
  btnSm: {
    background: "#7c3aed",
    color: "white",
    border: "none",
    borderRadius: 8,
    padding: "5px 14px",
    cursor: "pointer",
    fontSize: 13,
    fontWeight: 600,
  },
  btnDanger: {
    background: "rgba(239,68,68,0.15)",
    color: "#f87171",
    border: "1px solid rgba(239,68,68,0.3)",
    borderRadius: 8,
    padding: "5px 14px",
    cursor: "pointer",
    fontSize: 13,
    fontWeight: 600,
  },
  btnGhost: {
    background: "rgba(255,255,255,0.06)",
    color: "rgba(255,255,255,0.7)",
    border: "1px solid rgba(255,255,255,0.1)",
    borderRadius: 8,
    padding: "5px 14px",
    cursor: "pointer",
    fontSize: 13,
    fontWeight: 600,
  },
  btnSuccess: {
    background: "rgba(16,185,129,0.15)",
    color: "#34d399",
    border: "1px solid rgba(16,185,129,0.3)",
    borderRadius: 8,
    padding: "5px 14px",
    cursor: "pointer",
    fontSize: 13,
    fontWeight: 600,
  },
};

const card: React.CSSProperties = {
  background: T.card,
  border: `1px solid ${T.cardBorder}`,
  borderRadius: 16,
  padding: 24,
};

const modal_backdrop: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,0.7)",
  zIndex: 1000,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};

const modal_card: React.CSSProperties = {
  background: "#0f1029",
  border: `1px solid ${T.cardBorder}`,
  borderRadius: 20,
  padding: 32,
  width: "min(520px, 95vw)",
  maxHeight: "90vh",
  overflowY: "auto",
};

const th: React.CSSProperties = {
  textAlign: "left",
  padding: "10px 12px",
  fontSize: 12,
  color: T.sub,
  fontWeight: 600,
  borderBottom: "1px solid rgba(255,255,255,0.06)",
  whiteSpace: "nowrap",
};

const td_style: React.CSSProperties = {
  padding: "10px 12px",
  fontSize: 13,
  color: "white",
  borderBottom: "1px solid rgba(255,255,255,0.04)",
};

// ─── Emoji avatar list ────────────────────────────────────────────────────────
const AVATARS = ["🐱","🐶","🦊","🐻","🐼","🐨","🐯","🦁","🐮","🐷","🐸","🐙","🦋","🐬","🦄","🐉","🌟","🚀","🎮","🏆","🎸","🌈","🦖","🐊","🦩","🐺","🦝","🐧","🦜","🐝"];

// ─── GAMES LIST ───────────────────────────────────────────────────────────────
const ALL_GAMES = ["snake","pong","brickbreaker","colorcatcher","memory","whackamole","flappy","spaceshooter"];

// ─── Sub-components ──────────────────────────────────────────────────────────

function Label({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 12, color: T.sub, fontWeight: 600, marginBottom: 6 }}>{children}</div>;
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 style={{ fontSize: 20, fontWeight: 700, color: "white", margin: "0 0 20px 0" }}>{children}</h2>;
}

function StatCard({ emoji, label, value, color }: { emoji: string; label: string; value: number | string; color: string }) {
  return (
    <div style={{ ...card, display: "flex", alignItems: "center", gap: 16 }}>
      <div style={{ fontSize: 32 }}>{emoji}</div>
      <div>
        <div style={{ fontSize: 28, fontWeight: 800, color }}>{value}</div>
        <div style={{ fontSize: 12, color: T.sub }}>{label}</div>
      </div>
    </div>
  );
}

// ─── Section: Dashboard ───────────────────────────────────────────────────────
function DashboardSection({ students }: { students: Student[] }) {
  const [tasks, setTasks] = useState<any[]>([]);
  const [ytCount, setYtCount] = useState(0);
  const [breaksToday, setBreaksToday] = useState(0);
  const today = todayStr();

  useEffect(() => {
    req("/tasks/today").then(setTasks).catch(() => {});
    req("/youtube/requests?status=pending").then((d: any[]) => setYtCount(d.length)).catch(() => {});
    req<any[]>("/breaks/log").then((logs) => {
      const count = logs.filter((l) => l.date?.startsWith(today)).length;
      setBreaksToday(count);
    }).catch(() => {});
  }, []);

  const activeStudents = students.filter((s) => s.active);
  const tasksCompletedToday = tasks.filter((t) => t.passed && t.date?.startsWith(today)).length;

  const skipDay = async (student: Student) => {
    const isActive = student.skip_work_day_date === today;
    try {
      if (isActive) {
        await req(`/students/${student.id}/skip-work-day`, { method: "DELETE" });
      } else {
        await req(`/students/${student.id}/skip-work-day`, { method: "POST" });
      }
      window.location.reload();
    } catch (e: any) {
      alert(e.message);
    }
  };

  return (
    <div>
      <SectionTitle>📊 Dashboard</SectionTitle>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 32 }}>
        <StatCard emoji="👥" label="Active Students" value={activeStudents.length} color="#a78bfa" />
        <StatCard emoji="✅" label="Tasks Completed Today" value={tasksCompletedToday} color="#34d399" />
        <StatCard emoji="📺" label="Pending YT Requests" value={ytCount} color="#fb923c" />
        <StatCard emoji="⏸️" label="Breaks Today" value={breaksToday} color="#60a5fa" />
      </div>

      <div style={card}>
        <h3 style={{ fontSize: 16, fontWeight: 700, color: "white", margin: "0 0 16px 0" }}>Student Progress</h3>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                {["Avatar","Name","Reading","Math","Writing","Status","Quick Actions"].map((h) => (
                  <th key={h} style={th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {activeStudents.map((s) => {
                const isSkip = s.skip_work_day_date === today;
                return (
                  <tr key={s.id}>
                    <td style={td_style}><span style={{ fontSize: 22 }}>{s.avatar || "🐱"}</span></td>
                    <td style={td_style}>
                      <div style={{ fontWeight: 600 }}>{s.name}</div>
                      {isSkip && <span style={{ fontSize: 11, background: "rgba(251,191,36,0.15)", color: "#fbbf24", borderRadius: 6, padding: "2px 7px" }}>🎉 Free Day</span>}
                    </td>
                    <td style={td_style}><span style={{ color: "#a78bfa" }}>Gr {s.reading_min}–{s.reading_max}</span></td>
                    <td style={td_style}><span style={{ color: "#34d399" }}>Gr {s.math_min}–{s.math_max}</span></td>
                    <td style={td_style}><span style={{ color: "#60a5fa" }}>Gr {s.writing_min}–{s.writing_max}</span></td>
                    <td style={td_style}>
                      <span style={{
                        fontSize: 11,
                        borderRadius: 6,
                        padding: "2px 8px",
                        background: s.active ? "rgba(16,185,129,0.12)" : "rgba(239,68,68,0.12)",
                        color: s.active ? "#34d399" : "#f87171",
                      }}>
                        {s.active ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td style={td_style}>
                      <div style={{ display: "flex", gap: 8 }}>
                        <button
                          onClick={() => skipDay(s)}
                          style={isSkip ? T.btnSuccess : T.btnGhost}
                        >
                          {isSkip ? "✓ Cancel Free Day" : "⏭ Skip Day"}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {activeStudents.length === 0 && (
                <tr>
                  <td colSpan={7} style={{ ...td_style, textAlign: "center", color: T.sub, padding: 40 }}>
                    No active students
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ─── Student Modal ────────────────────────────────────────────────────────────
function StudentModal({
  initial,
  onSave,
  onClose,
}: {
  initial?: Partial<Student>;
  onSave: (data: Partial<Student>) => Promise<void>;
  onClose: () => void;
}) {
  const [form, setForm] = useState<Partial<Student>>({
    name: "",
    avatar: "🐱",
    reading_min: 1,
    reading_max: 3,
    math_min: 1,
    math_max: 3,
    writing_min: 1,
    writing_max: 3,
    behavior_points: 0,
    active: true,
    ...initial,
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const set = (k: keyof Student, v: any) => setForm((f) => ({ ...f, [k]: v }));

  const save = async () => {
    if (!form.name?.trim()) { setErr("Name is required"); return; }
    setSaving(true);
    try {
      await onSave(form);
      onClose();
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={modal_backdrop} onClick={onClose}>
      <div style={modal_card} onClick={(e) => e.stopPropagation()}>
        <h3 style={{ fontSize: 18, fontWeight: 700, color: "white", margin: "0 0 20px 0" }}>
          {initial?.id ? "Edit Student" : "Add Student"}
        </h3>

        <div style={{ marginBottom: 16 }}>
          <Label>Name</Label>
          <input
            style={T.input}
            value={form.name || ""}
            onChange={(e) => set("name", e.target.value)}
            placeholder="Student name"
          />
        </div>

        <div style={{ marginBottom: 16 }}>
          <Label>Avatar</Label>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 8 }}>
            {AVATARS.map((emoji) => (
              <button
                key={emoji}
                onClick={() => set("avatar", emoji)}
                style={{
                  fontSize: 22,
                  width: 40,
                  height: 40,
                  borderRadius: 10,
                  border: form.avatar === emoji ? "2px solid var(--accent, #D97757)" : "2px solid var(--border, rgba(24,23,26,0.12))",
                  background: form.avatar === emoji ? "var(--accent-light, #fde8c7)" : "var(--bg-surface, #fffaf0)",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {emoji}
              </button>
            ))}
          </div>
        </div>

        {(["reading","math","writing"] as const).map((subj) => (
          <div key={subj} style={{ marginBottom: 16 }}>
            <Label>{subj.charAt(0).toUpperCase() + subj.slice(1)} Grade Range (Gr {form[`${subj}_min`]}–{form[`${subj}_max`]})</Label>
            <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 11, color: T.sub, marginBottom: 4 }}>Min</div>
                <input
                  type="range" min={1} max={12}
                  value={form[`${subj}_min` as keyof Student] as number || 1}
                  onChange={(e) => set(`${subj}_min` as keyof Student, Number(e.target.value))}
                  style={{ width: "100%", accentColor: "#7c3aed" }}
                />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 11, color: T.sub, marginBottom: 4 }}>Max</div>
                <input
                  type="range" min={1} max={12}
                  value={form[`${subj}_max` as keyof Student] as number || 3}
                  onChange={(e) => set(`${subj}_max` as keyof Student, Number(e.target.value))}
                  style={{ width: "100%", accentColor: "#7c3aed" }}
                />
              </div>
            </div>
          </div>
        ))}

        <div style={{ marginBottom: 20 }}>
          <Label>Behavior Points</Label>
          <input
            type="number"
            min={0}
            style={T.input}
            value={form.behavior_points || 0}
            onChange={(e) => set("behavior_points", Number(e.target.value))}
          />
        </div>

        {err && <div style={{ color: "#f87171", fontSize: 13, marginBottom: 12 }}>{err}</div>}

        <div style={{ display: "flex", gap: 12, justifyContent: "flex-end" }}>
          <button onClick={onClose} style={T.btnGhost}>Cancel</button>
          <button onClick={save} disabled={saving} style={{ ...T.btn, opacity: saving ? 0.6 : 1 }}>
            {saving ? "Saving…" : "Save Student"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Section: Students ────────────────────────────────────────────────────────
function StudentsSection({
  students,
  onRefresh,
}: {
  students: Student[];
  onRefresh: () => void;
}) {
  const [addOpen, setAddOpen] = useState(false);
  const [editStudent, setEditStudent] = useState<Student | null>(null);
  const today = todayStr();

  const handleAdd = async (data: Partial<Student>) => {
    await req("/students", { method: "POST", body: JSON.stringify(data) });
    onRefresh();
  };

  const handleEdit = async (data: Partial<Student>) => {
    await req(`/students/${editStudent!.id}`, { method: "PUT", body: JSON.stringify(data) });
    onRefresh();
  };

  const handleDelete = async (s: Student) => {
    if (!confirm(`Delete ${s.name}? This cannot be undone.`)) return;
    await req(`/students/${s.id}`, { method: "DELETE" });
    onRefresh();
  };

  const toggleActive = async (s: Student) => {
    await req(`/students/${s.id}`, { method: "PUT", body: JSON.stringify({ ...s, active: !s.active }) });
    onRefresh();
  };

  const toggleSkipDay = async (s: Student) => {
    const isActive = s.skip_work_day_date === today;
    if (isActive) {
      await req(`/students/${s.id}/skip-work-day`, { method: "DELETE" });
    } else {
      await req(`/students/${s.id}/skip-work-day`, { method: "POST" });
    }
    onRefresh();
  };

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
        <SectionTitle>👥 Students</SectionTitle>
        <button onClick={() => setAddOpen(true)} style={T.btn}>+ Add Student</button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 16 }}>
        {students.map((s) => {
          const isSkip = s.skip_work_day_date === today;
          const stars = Math.min(s.behavior_points, 5);
          const extra = s.behavior_points > 5 ? s.behavior_points - 5 : 0;

          return (
            <div
              key={s.id}
              style={{
                ...card,
                position: "relative",
                opacity: s.active ? 1 : 0.55,
                transition: "opacity 0.2s",
              }}
            >
              {isSkip && (
                <div style={{
                  position: "absolute",
                  top: 12,
                  right: 12,
                  background: "rgba(251,191,36,0.15)",
                  color: "#fbbf24",
                  borderRadius: 8,
                  padding: "3px 10px",
                  fontSize: 12,
                  fontWeight: 700,
                }}>
                  🎉 FREE DAY
                </div>
              )}

              <div style={{ fontSize: 48, textAlign: "center", marginBottom: 8 }}>{s.avatar || "🐱"}</div>
              <div style={{ fontSize: 16, fontWeight: 700, color: "white", textAlign: "center", marginBottom: 4 }}>{s.name}</div>

              <div style={{ fontSize: 12, color: T.sub, textAlign: "center", marginBottom: 12 }}>
                Read: {s.reading_min}–{s.reading_max} | Math: {s.math_min}–{s.math_max} | Write: {s.writing_min}–{s.writing_max}
              </div>

              <div style={{ textAlign: "center", marginBottom: 14, fontSize: 18 }}>
                {"⭐".repeat(stars)}{extra > 0 && <span style={{ fontSize: 12, color: T.sub }}> +{extra} more</span>}
                {stars === 0 && <span style={{ fontSize: 13, color: T.sub }}>No points yet</span>}
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <button
                  onClick={() => toggleSkipDay(s)}
                  style={isSkip ? T.btnSuccess : T.btnGhost}
                >
                  {isSkip ? "✓ Free Day Active (tap to cancel)" : "⏭ Give Free Day"}
                </button>

                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    onClick={() => toggleActive(s)}
                    style={{
                      ...T.btnGhost,
                      flex: 1,
                      color: s.active ? "#34d399" : T.sub as string,
                    }}
                  >
                    {s.active ? "● Active" : "○ Inactive"}
                  </button>
                  <button onClick={() => setEditStudent(s)} style={{ ...T.btnGhost }}>✏️ Edit</button>
                  <button onClick={() => handleDelete(s)} style={{ ...T.btnDanger }}>🗑️</button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {students.length === 0 && (
        <div style={{ ...card, textAlign: "center", color: T.sub, padding: 60, fontSize: 15 }}>
          No students yet. Click "+ Add Student" to get started.
        </div>
      )}

      {addOpen && (
        <StudentModal
          onSave={handleAdd}
          onClose={() => setAddOpen(false)}
        />
      )}
      {editStudent && (
        <StudentModal
          initial={editStudent}
          onSave={handleEdit}
          onClose={() => setEditStudent(null)}
        />
      )}
    </div>
  );
}

// ─── Section: Tasks Config ────────────────────────────────────────────────────
function TasksSection({ students }: { students: Student[] }) {
  const [settings, setSettings] = useState<any>({});
  const [selected, setSelected] = useState<string>("");
  const [overrides, setOverrides] = useState<any>({});
  const [behaviorLog, setBehaviorLog] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    req("/admin-settings").then(setSettings).catch(() => {});
    req("/behavior-log").then(setBehaviorLog).catch(() => {});
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      await req("/admin-settings", { method: "PUT", body: JSON.stringify(settings) });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e: any) {
      alert(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <SectionTitle>📋 Task Config</SectionTitle>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 20 }}>
        <div style={card}>
          <h3 style={{ fontSize: 15, fontWeight: 700, color: "white", margin: "0 0 16px 0" }}>Base Task Counts</h3>
          {(["reading","math","writing"] as const).map((subj) => {
            const key = `base_${subj}_count`;
            return (
              <div key={subj} style={{ marginBottom: 14 }}>
                <Label>{subj.charAt(0).toUpperCase() + subj.slice(1)} ({settings[key] ?? 3} tasks)</Label>
                <input
                  type="range"
                  min={1} max={10}
                  value={settings[key] ?? 3}
                  onChange={(e) => setSettings((s: any) => ({ ...s, [key]: Number(e.target.value) }))}
                  style={{ width: "100%", accentColor: "#7c3aed" }}
                />
              </div>
            );
          })}
          <button onClick={save} disabled={saving} style={{ ...T.btn, marginTop: 8, opacity: saving ? 0.6 : 1 }}>
            {saved ? "✓ Saved!" : saving ? "Saving…" : "Save"}
          </button>
        </div>

        <div style={card}>
          <h3 style={{ fontSize: 15, fontWeight: 700, color: "white", margin: "0 0 16px 0" }}>Per-Student Overrides</h3>
          <div style={{ marginBottom: 12 }}>
            <Label>Select Student</Label>
            <select
              style={{ ...T.input, appearance: "none" }}
              value={selected}
              onChange={(e) => setSelected(e.target.value)}
            >
              <option value="">— pick a student —</option>
              {students.map((s) => (
                <option key={s.id} value={String(s.id)}>{s.avatar} {s.name}</option>
              ))}
            </select>
          </div>
          {selected && (
            <div>
              {(["reading","math","writing"] as const).map((subj) => {
                const key = `override_${subj}`;
                return (
                  <div key={subj} style={{ marginBottom: 12 }}>
                    <Label>{subj.charAt(0).toUpperCase() + subj.slice(1)} override ({overrides[key] ?? "–"} tasks)</Label>
                    <input
                      type="range" min={0} max={10}
                      value={overrides[key] ?? 0}
                      onChange={(e) => setOverrides((o: any) => ({ ...o, [key]: Number(e.target.value) }))}
                      style={{ width: "100%", accentColor: "#7c3aed" }}
                    />
                  </div>
                );
              })}
              <button
                onClick={async () => {
                  try {
                    await req(`/students/${selected}/task-overrides`, { method: "PUT", body: JSON.stringify(overrides) });
                    alert("Overrides saved!");
                  } catch (e: any) {
                    alert(e.message);
                  }
                }}
                style={T.btnSm}
              >
                Save Overrides
              </button>
            </div>
          )}
        </div>
      </div>

      <div style={card}>
        <h3 style={{ fontSize: 15, fontWeight: 700, color: "white", margin: "0 0 16px 0" }}>Behavior Log (last 20)</h3>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                {["Student","Type","Note","Date"].map((h) => (
                  <th key={h} style={th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {behaviorLog.slice(0, 20).map((b: any, i) => (
                <tr key={i}>
                  <td style={td_style}>{b.student_name || `#${b.student_id}`}</td>
                  <td style={td_style}>
                    <span style={{
                      fontSize: 11,
                      padding: "2px 8px",
                      borderRadius: 6,
                      background: b.type === "positive" ? "rgba(16,185,129,0.12)" : "rgba(239,68,68,0.12)",
                      color: b.type === "positive" ? "#34d399" : "#f87171",
                    }}>
                      {b.type}
                    </span>
                  </td>
                  <td style={{ ...td_style, color: "rgba(255,255,255,0.6)" }}>{b.note || "—"}</td>
                  <td style={{ ...td_style, color: T.sub, fontSize: 12 }}>
                    {b.created_at ? new Date(b.created_at).toLocaleDateString() : "—"}
                  </td>
                </tr>
              ))}
              {behaviorLog.length === 0 && (
                <tr>
                  <td colSpan={4} style={{ ...td_style, textAlign: "center", color: T.sub, padding: 30 }}>No behavior logs yet</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ─── Section: Break Settings ──────────────────────────────────────────────────
function BreakSection() {
  const [config, setConfig] = useState<BreakConfig>({
    work_minutes_first: 10,
    work_minutes_next: 15,
    break_duration: 10,
    calming_corner_enabled: true,
    break_system_enabled: true,
    allowed_games: ["snake","pong","memory"],
  });
  const [log, setLog] = useState<BreakLog[]>([]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    req<BreakConfig>("/breaks/config").then((c) => setConfig((prev) => ({ ...prev, ...c }))).catch(() => {});
    req<BreakLog[]>("/breaks/log").then(setLog).catch(() => {});
  }, []);

  const set = (k: keyof BreakConfig, v: any) => setConfig((c) => ({ ...c, [k]: v }));

  const toggleGame = (game: string) => {
    const current = config.allowed_games || [];
    if (current.includes(game)) {
      set("allowed_games", current.filter((g) => g !== game));
    } else {
      if (current.length >= 3) { alert("Max 3 games allowed"); return; }
      set("allowed_games", [...current, game]);
    }
  };

  const save = async () => {
    setSaving(true);
    try {
      await req("/breaks/config", { method: "PUT", body: JSON.stringify(config) });
      if (config.allowed_games) {
        await req("/breaks/games", { method: "PUT", body: JSON.stringify({ games: config.allowed_games }) }).catch(() => {});
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e: any) {
      alert(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <SectionTitle>⏸️ Break Settings</SectionTitle>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 24 }}>
        <div style={card}>
          <h3 style={{ fontSize: 15, fontWeight: 700, color: "white", margin: "0 0 16px 0" }}>Timing</h3>

          <div style={{ marginBottom: 14 }}>
            <Label>Work minutes before FIRST break ({config.work_minutes_first} min)</Label>
            <input
              type="number" min={1} max={120}
              style={T.input}
              value={config.work_minutes_first ?? 10}
              onChange={(e) => set("work_minutes_first", Number(e.target.value))}
            />
          </div>

          <div style={{ marginBottom: 14 }}>
            <Label>Work minutes before NEXT break ({config.work_minutes_next} min)</Label>
            <input
              type="number" min={1} max={120}
              style={T.input}
              value={config.work_minutes_next ?? 15}
              onChange={(e) => set("work_minutes_next", Number(e.target.value))}
            />
          </div>

          <div style={{ marginBottom: 14 }}>
            <Label>Break duration ({config.break_duration} min)</Label>
            <input
              type="number" min={1} max={60}
              style={T.input}
              value={config.break_duration ?? 10}
              onChange={(e) => set("break_duration", Number(e.target.value))}
            />
          </div>
        </div>

        <div style={card}>
          <h3 style={{ fontSize: 15, fontWeight: 700, color: "white", margin: "0 0 16px 0" }}>Options</h3>

          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
            <div>
              <div style={{ color: "white", fontWeight: 600, fontSize: 14 }}>Break System Enabled</div>
              <div style={{ color: T.sub, fontSize: 12 }}>Globally enable/disable breaks</div>
            </div>
            <button
              onClick={() => set("break_system_enabled", !config.break_system_enabled)}
              style={{
                width: 44, height: 24, borderRadius: 12, border: "none", cursor: "pointer",
                background: config.break_system_enabled ? "#7c3aed" : "rgba(255,255,255,0.1)",
                position: "relative", transition: "background 0.2s",
              }}
            >
              <span style={{
                position: "absolute", top: 3, left: config.break_system_enabled ? 22 : 3,
                width: 18, height: 18, borderRadius: 9, background: "white",
                transition: "left 0.2s",
              }} />
            </button>
          </div>

          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
            <div>
              <div style={{ color: "white", fontWeight: 600, fontSize: 14 }}>Calming Corner</div>
              <div style={{ color: T.sub, fontSize: 12 }}>Show calming corner option</div>
            </div>
            <button
              onClick={() => set("calming_corner_enabled", !config.calming_corner_enabled)}
              style={{
                width: 44, height: 24, borderRadius: 12, border: "none", cursor: "pointer",
                background: config.calming_corner_enabled ? "#7c3aed" : "rgba(255,255,255,0.1)",
                position: "relative", transition: "background 0.2s",
              }}
            >
              <span style={{
                position: "absolute", top: 3, left: config.calming_corner_enabled ? 22 : 3,
                width: 18, height: 18, borderRadius: 9, background: "white",
                transition: "left 0.2s",
              }} />
            </button>
          </div>

          <div>
            <Label>Allowed Break Games (max 3 selected)</Label>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 8 }}>
              {ALL_GAMES.map((game) => {
                const selected = (config.allowed_games || []).includes(game);
                return (
                  <label
                    key={game}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      cursor: "pointer",
                      padding: "6px 10px",
                      borderRadius: 8,
                      background: selected ? "rgba(124,58,237,0.15)" : "rgba(255,255,255,0.04)",
                      border: selected ? "1px solid rgba(124,58,237,0.4)" : "1px solid rgba(255,255,255,0.06)",
                      fontSize: 13,
                      color: selected ? "#a78bfa" : "rgba(255,255,255,0.6)",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={selected}
                      onChange={() => toggleGame(game)}
                      style={{ accentColor: "#7c3aed" }}
                    />
                    {game}
                  </label>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      <div style={{ marginBottom: 24 }}>
        <button onClick={save} disabled={saving} style={{ ...T.btn, opacity: saving ? 0.6 : 1 }}>
          {saved ? "✓ Saved!" : saving ? "Saving…" : "Save Break Settings"}
        </button>
      </div>

      <div style={card}>
        <h3 style={{ fontSize: 15, fontWeight: 700, color: "white", margin: "0 0 16px 0" }}>Break Log</h3>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                {["Student","Date","Start","End","Option Chosen","Work Min Before"].map((h) => (
                  <th key={h} style={th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {log.map((l) => (
                <tr key={l.id}>
                  <td style={td_style}>{l.student_name || `#${l.student_id}`}</td>
                  <td style={{ ...td_style, color: T.sub }}>{l.date}</td>
                  <td style={{ ...td_style, color: T.sub }}>{l.start_time}</td>
                  <td style={{ ...td_style, color: T.sub }}>{l.end_time || "—"}</td>
                  <td style={td_style}>{l.option_chosen || "—"}</td>
                  <td style={{ ...td_style, color: T.sub }}>{l.work_minutes_before ?? "—"}</td>
                </tr>
              ))}
              {log.length === 0 && (
                <tr>
                  <td colSpan={6} style={{ ...td_style, textAlign: "center", color: T.sub, padding: 30 }}>No break logs yet</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ─── Section: Worksheets ──────────────────────────────────────────────────────
function WorksheetsSection({ students }: { students: Student[] }) {
  const [tab, setTab] = useState<"assign"|"library"|"find">("assign");
  const [library, setLibrary] = useState<WorksheetLibraryItem[]>([]);
  const [assignments, setAssignments] = useState<WorksheetAssignment[]>([]);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  // Assign form
  const [assignForm, setAssignForm] = useState({
    student_id: "",
    subject: "reading",
    worksheet_id: "",
    url: "",
    due_date: "",
    instructions: "",
  });
  const [assignSaving, setAssignSaving] = useState(false);

  // Library upload form
  const [libForm, setLibForm] = useState({ title: "", subject: "reading", grades: "", url: "", source_site: "" });
  const [libSaving, setLibSaving] = useState(false);

  useEffect(() => {
    req<WorksheetLibraryItem[]>("/worksheets/library").then(setLibrary).catch(() => {});
    req<WorksheetAssignment[]>("/worksheets/assignments").then(setAssignments).catch(() => {});
  }, []);

  const handleAssign = async () => {
    setAssignSaving(true);
    try {
      await req("/worksheets/assignments", {
        method: "POST",
        body: JSON.stringify({
          student_id: Number(assignForm.student_id) || null,
          subject: assignForm.subject,
          worksheet_id: Number(assignForm.worksheet_id) || null,
          url: assignForm.url,
          due_date: assignForm.due_date,
          instructions: assignForm.instructions,
        }),
      });
      alert("Worksheet assigned!");
      setAssignForm({ student_id: "", subject: "reading", worksheet_id: "", url: "", due_date: "", instructions: "" });
      req<WorksheetAssignment[]>("/worksheets/assignments").then(setAssignments).catch(() => {});
    } catch (e: any) {
      alert(e.message);
    } finally {
      setAssignSaving(false);
    }
  };

  const handleAddToLibrary = async () => {
    setLibSaving(true);
    try {
      const added = await req<WorksheetLibraryItem>("/worksheets/library", {
        method: "POST",
        body: JSON.stringify(libForm),
      });
      setLibrary((l) => [...l, added]);
      setLibForm({ title: "", subject: "reading", grades: "", url: "", source_site: "" });
    } catch (e: any) {
      alert(e.message);
    } finally {
      setLibSaving(false);
    }
  };

  const handleDeleteLib = async (id: number) => {
    if (!confirm("Remove from library?")) return;
    await req(`/worksheets/library/${id}`, { method: "DELETE" }).catch(() => {});
    setLibrary((l) => l.filter((x) => x.id !== id));
  };

  const TabBtn = ({ id, label }: { id: typeof tab; label: string }) => (
    <button
      onClick={() => setTab(id)}
      style={{
        padding: "8px 20px",
        borderRadius: 10,
        border: "none",
        cursor: "pointer",
        fontWeight: 600,
        fontSize: 14,
        background: tab === id ? "#7c3aed" : "rgba(255,255,255,0.06)",
        color: tab === id ? "white" : "rgba(255,255,255,0.5)",
        transition: "all 0.15s",
      }}
    >
      {label}
    </button>
  );

  return (
    <div>
      <SectionTitle>📄 Worksheets</SectionTitle>
      <div style={{ display: "flex", gap: 10, marginBottom: 24 }}>
        <TabBtn id="assign" label="Assign" />
        <TabBtn id="library" label="Library" />
        <TabBtn id="find" label="Find Online" />
      </div>

      {tab === "assign" && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
          <div style={card}>
            <h3 style={{ fontSize: 15, fontWeight: 700, color: "white", margin: "0 0 16px 0" }}>Assign Worksheet</h3>

            <div style={{ marginBottom: 12 }}>
              <Label>Student</Label>
              <select
                style={{ ...T.input, appearance: "none" }}
                value={assignForm.student_id}
                onChange={(e) => setAssignForm((f) => ({ ...f, student_id: e.target.value }))}
              >
                <option value="">All students</option>
                {students.map((s) => (
                  <option key={s.id} value={String(s.id)}>{s.avatar} {s.name}</option>
                ))}
              </select>
            </div>

            <div style={{ marginBottom: 12 }}>
              <Label>Subject</Label>
              <select style={{ ...T.input, appearance: "none" }} value={assignForm.subject}
                onChange={(e) => setAssignForm((f) => ({ ...f, subject: e.target.value }))}>
                <option value="reading">Reading</option>
                <option value="math">Math</option>
                <option value="writing">Writing</option>
              </select>
            </div>

            <div style={{ marginBottom: 12 }}>
              <Label>Choose from Library</Label>
              <select style={{ ...T.input, appearance: "none" }} value={assignForm.worksheet_id}
                onChange={(e) => setAssignForm((f) => ({ ...f, worksheet_id: e.target.value, url: "" }))}>
                <option value="">— none —</option>
                {library.map((w) => (
                  <option key={w.id} value={String(w.id)}>{w.title}</option>
                ))}
              </select>
            </div>

            <div style={{ marginBottom: 12 }}>
              <Label>Or Paste URL</Label>
              <input style={T.input} placeholder="https://…" value={assignForm.url}
                onChange={(e) => setAssignForm((f) => ({ ...f, url: e.target.value, worksheet_id: "" }))} />
            </div>

            <div style={{ marginBottom: 12 }}>
              <Label>Due Date</Label>
              <input type="date" style={{ ...T.input, colorScheme: "dark" }} value={assignForm.due_date}
                onChange={(e) => setAssignForm((f) => ({ ...f, due_date: e.target.value }))} />
            </div>

            <div style={{ marginBottom: 16 }}>
              <Label>Instructions</Label>
              <textarea
                style={{ ...T.input, height: 80, resize: "vertical" }}
                value={assignForm.instructions}
                onChange={(e) => setAssignForm((f) => ({ ...f, instructions: e.target.value }))}
                placeholder="Optional instructions for the student…"
              />
            </div>

            <button onClick={handleAssign} disabled={assignSaving} style={{ ...T.btn, opacity: assignSaving ? 0.6 : 1 }}>
              {assignSaving ? "Assigning…" : "Assign Worksheet"}
            </button>
          </div>

          <div style={card}>
            <h3 style={{ fontSize: 15, fontWeight: 700, color: "white", margin: "0 0 16px 0" }}>Recent Assignments</h3>
            <div style={{ overflowY: "auto", maxHeight: 400 }}>
              {assignments.slice(0, 20).map((a) => {
                const st = students.find((s) => s.id === a.student_id);
                return (
                  <div key={a.id} style={{
                    padding: "10px 0",
                    borderBottom: "1px solid rgba(255,255,255,0.06)",
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                  }}>
                    <span style={{ fontSize: 18 }}>{st?.avatar || "📄"}</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, color: "white" }}>{st?.name || "All"}</div>
                      <div style={{ fontSize: 11, color: T.sub }}>{a.subject} {a.due_date ? `· due ${a.due_date}` : ""}</div>
                    </div>
                    {a.url && (
                      <a href={a.url} target="_blank" rel="noreferrer"
                        style={{ fontSize: 11, color: "#a78bfa" }}>Open ↗</a>
                    )}
                  </div>
                );
              })}
              {assignments.length === 0 && (
                <div style={{ textAlign: "center", color: T.sub, padding: 30 }}>No assignments yet</div>
              )}
            </div>
          </div>
        </div>
      )}

      {tab === "library" && (
        <div>
          <div style={{ ...card, marginBottom: 20 }}>
            <h3 style={{ fontSize: 15, fontWeight: 700, color: "white", margin: "0 0 14px 0" }}>Add to Library</h3>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 12 }}>
              <div>
                <Label>Title</Label>
                <input style={T.input} value={libForm.title} onChange={(e) => setLibForm((f) => ({ ...f, title: e.target.value }))} placeholder="Worksheet title" />
              </div>
              <div>
                <Label>Subject</Label>
                <select style={{ ...T.input, appearance: "none" }} value={libForm.subject} onChange={(e) => setLibForm((f) => ({ ...f, subject: e.target.value }))}>
                  <option value="reading">Reading</option>
                  <option value="math">Math</option>
                  <option value="writing">Writing</option>
                </select>
              </div>
              <div>
                <Label>Grades</Label>
                <input style={T.input} value={libForm.grades} onChange={(e) => setLibForm((f) => ({ ...f, grades: e.target.value }))} placeholder="e.g. 2-4" />
              </div>
              <div>
                <Label>URL</Label>
                <input style={T.input} value={libForm.url} onChange={(e) => setLibForm((f) => ({ ...f, url: e.target.value }))} placeholder="https://…" />
              </div>
              <div>
                <Label>Source Site</Label>
                <input style={T.input} value={libForm.source_site} onChange={(e) => setLibForm((f) => ({ ...f, source_site: e.target.value }))} placeholder="e.g. Teachers Pay Teachers" />
              </div>
            </div>
            <button onClick={handleAddToLibrary} disabled={libSaving} style={{ ...T.btnSm, opacity: libSaving ? 0.6 : 1 }}>
              {libSaving ? "Adding…" : "+ Add to Library"}
            </button>
          </div>

          <div style={card}>
            <h3 style={{ fontSize: 15, fontWeight: 700, color: "white", margin: "0 0 16px 0" }}>Library ({library.length})</h3>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  {["Title","Subject","Grades","Source","Actions"].map((h) => (
                    <th key={h} style={th}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {library.map((w) => (
                  <tr key={w.id}>
                    <td style={td_style}>{w.title}</td>
                    <td style={{ ...td_style, color: T.sub }}>{w.subject}</td>
                    <td style={{ ...td_style, color: T.sub }}>{w.grades || "—"}</td>
                    <td style={{ ...td_style, color: T.sub, fontSize: 12 }}>{w.source_site || "—"}</td>
                    <td style={td_style}>
                      <div style={{ display: "flex", gap: 8 }}>
                        {w.url && (
                          <button onClick={() => setPreviewUrl(w.url!)} style={T.btnGhost}>👁 Preview</button>
                        )}
                        <button onClick={() => handleDeleteLib(w.id)} style={T.btnDanger}>Delete</button>
                      </div>
                    </td>
                  </tr>
                ))}
                {library.length === 0 && (
                  <tr>
                    <td colSpan={5} style={{ ...td_style, textAlign: "center", color: T.sub, padding: 30 }}>Library is empty</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === "find" && (
        <div style={{ ...card, textAlign: "center", padding: 60 }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>🤖</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: "white", marginBottom: 8 }}>AI Worksheet Search</div>
          <div style={{ color: T.sub, maxWidth: 400, margin: "0 auto" }}>
            AI-powered worksheet discovery is coming soon. This will search the web for curriculum-aligned worksheets and let you save them directly to your library.
          </div>
        </div>
      )}

      {previewUrl && (
        <div style={modal_backdrop} onClick={() => setPreviewUrl(null)}>
          <div
            style={{ ...modal_card, width: "min(800px, 95vw)", height: "80vh", padding: 0, overflow: "hidden" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px", borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
              <span style={{ color: "white", fontWeight: 600 }}>Preview</span>
              <button onClick={() => setPreviewUrl(null)} style={{ ...T.btnGhost, padding: "4px 12px" }}>✕ Close</button>
            </div>
            <iframe
              src={previewUrl}
              sandbox="allow-scripts allow-same-origin"
              style={{ width: "100%", height: "calc(100% - 55px)", border: "none", background: "white" }}
              title="Worksheet Preview"
            />
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Section: YouTube Queue ───────────────────────────────────────────────────
function YouTubeSection({ students: propStudents }: { students: Student[] }) {
  const [tab, setTab] = useState<"pending" | "active" | "denied">("pending");
  const [pending, setPending] = useState<YTRequest[]>([]);
  const [denied, setDenied] = useState<YTRequest[]>([]);
  // local copy of students so we can refresh after approve/revoke
  const [localStudents, setLocalStudents] = useState<Student[]>(propStudents);
  const [urlInputs, setUrlInputs] = useState<Record<number, string>>({});
  const [approving, setApproving] = useState<Record<number, boolean>>({});
  const [denying, setDenying] = useState<Record<number, boolean>>({});
  const [revoking, setRevoking] = useState<Record<number, boolean>>({});

  const load = useCallback(() => {
    req<YTRequest[]>("/youtube/requests?status=pending").then(setPending).catch(() => {});
    req<YTRequest[]>("/youtube/requests?status=denied").then(setDenied).catch(() => {});
    req<Student[]>("/students").then(setLocalStudents).catch(() => {});
  }, []);

  useEffect(() => { load(); }, [load]);
  // keep in sync if parent reloads students
  useEffect(() => { setLocalStudents(propStudents); }, [propStudents]);

  const studentObj = (id: number) =>
    localStudents.find((x) => Number(x.id) === Number(id));

  const studentDisplay = (id: number) => {
    const s = studentObj(id);
    if (!s) return `Student #${id}`;
    const icon = s.avatar_emoji || s.avatar || "🎓";
    return `${icon} ${s.name}`;
  };

  /** Approve: write URL to student record + mark request approved */
  const approve = async (r: YTRequest) => {
    const url = (urlInputs[r.id] || "").trim();
    if (!url) { alert("Paste a YouTube URL first."); return; }
    setApproving((p) => ({ ...p, [r.id]: true }));
    try {
      await req(`/students/${r.student_id}/approve-video`, {
        method: "PUT",
        body: JSON.stringify({ url, title: r.title }),
      });
      await req(`/youtube/requests/${r.id}/approve`, { method: "PUT" });
      setUrlInputs((p) => { const n = { ...p }; delete n[r.id]; return n; });
      load();
    } catch (e: any) {
      alert("Error approving: " + e.message);
    } finally {
      setApproving((p) => ({ ...p, [r.id]: false }));
    }
  };

  const deny = async (id: number) => {
    setDenying((p) => ({ ...p, [id]: true }));
    try {
      await req(`/youtube/requests/${id}/deny`, { method: "PUT" });
      load();
    } catch { /* ignore */ } finally {
      setDenying((p) => ({ ...p, [id]: false }));
    }
  };

  const revoke = async (studentId: number) => {
    if (!confirm("Remove this student's approved video?")) return;
    setRevoking((p) => ({ ...p, [studentId]: true }));
    try {
      await req(`/students/${studentId}/approve-video`, { method: "DELETE" });
      load();
    } catch { /* ignore */ } finally {
      setRevoking((p) => ({ ...p, [studentId]: false }));
    }
  };

  // Students who currently have an active approved video
  const activeVideos = localStudents.filter((s) => s.approved_video_url);

  const TabBtn = ({ id, label, count }: { id: typeof tab; label: string; count: number }) => (
    <button
      onClick={() => setTab(id)}
      style={{
        padding: "8px 20px",
        borderRadius: 10,
        border: "none",
        cursor: "pointer",
        fontWeight: 600,
        fontSize: 14,
        background: tab === id ? "#7c3aed" : "rgba(255,255,255,0.06)",
        color: tab === id ? "white" : "rgba(255,255,255,0.5)",
        display: "flex",
        alignItems: "center",
        gap: 8,
      }}
    >
      {label}
      {count > 0 && (
        <span style={{
          background: tab === id ? "rgba(255,255,255,0.25)" : "rgba(124,58,237,0.3)",
          color: tab === id ? "white" : "#a78bfa",
          borderRadius: 10,
          padding: "0 7px",
          fontSize: 11,
          fontWeight: 700,
        }}>
          {count}
        </span>
      )}
    </button>
  );

  return (
    <div>
      <SectionTitle>📺 YouTube Queue</SectionTitle>

      <div style={{ display: "flex", gap: 10, marginBottom: 24 }}>
        <TabBtn id="pending" label="Pending Requests" count={pending.length} />
        <TabBtn id="active" label="Active Videos" count={activeVideos.length} />
        <TabBtn id="denied" label="Denied" count={denied.length} />
      </div>

      {/* ── Pending Requests ── */}
      {tab === "pending" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {pending.map((r) => {
            const s = studentObj(r.student_id);
            const icon = s?.avatar_emoji || s?.avatar || "🎓";
            const inputUrl = urlInputs[r.id] || "";
            const inputThumb = inputUrl ? yt_thumb(inputUrl) : null;
            const isApproving = !!approving[r.id];
            const isDenying = !!denying[r.id];
            const ts = r.requested_at || r.created_at;
            return (
              <div key={r.id} style={{ ...card, padding: 20 }}>
                {/* Student + request info */}
                <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
                  <span style={{ fontSize: 32 }}>{icon}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, color: "white", fontSize: 16 }}>{s?.name || `Student #${r.student_id}`}</div>
                    <div style={{ fontSize: 13, color: T.sub, marginTop: 2 }}>
                      wants to watch: <span style={{ color: "#e2e8f0", fontWeight: 600 }}>"{r.title}"</span>
                    </div>
                  </div>
                  {ts && (
                    <div style={{ fontSize: 11, color: T.sub, flexShrink: 0 }}>
                      {new Date(ts).toLocaleString()}
                    </div>
                  )}
                </div>

                {/* URL paste row */}
                <div style={{ display: "flex", gap: 14, alignItems: "flex-end", marginBottom: 14 }}>
                  {inputThumb && (
                    <img
                      src={inputThumb}
                      alt=""
                      style={{ width: 100, height: 56, objectFit: "cover", borderRadius: 8, flexShrink: 0 }}
                    />
                  )}
                  <div style={{ flex: 1 }}>
                    <Label>Paste YouTube URL to approve</Label>
                    <input
                      style={{ ...T.input, marginTop: 4 }}
                      value={inputUrl}
                      onChange={(e) => setUrlInputs((p) => ({ ...p, [r.id]: e.target.value }))}
                      placeholder="https://www.youtube.com/watch?v=…"
                    />
                  </div>
                </div>

                {/* Actions */}
                <div style={{ display: "flex", gap: 10 }}>
                  <button
                    onClick={() => approve(r)}
                    disabled={isApproving || !inputUrl.trim()}
                    style={{
                      ...T.btnSuccess,
                      flex: 1,
                      opacity: isApproving || !inputUrl.trim() ? 0.5 : 1,
                    }}
                  >
                    {isApproving ? "Approving…" : `✓ Approve for ${s?.name || "Student"}`}
                  </button>
                  <button
                    onClick={() => deny(r.id)}
                    disabled={isDenying}
                    style={{ ...T.btnDanger, opacity: isDenying ? 0.5 : 1 }}
                  >
                    {isDenying ? "…" : "✕ Deny"}
                  </button>
                </div>
              </div>
            );
          })}
          {pending.length === 0 && (
            <div style={{ ...card, textAlign: "center", color: T.sub, padding: 40 }}>
              No pending requests 🎉
            </div>
          )}
        </div>
      )}

      {/* ── Active Videos (per-student approved video) ── */}
      {tab === "active" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {activeVideos.map((s) => {
            const thumb = s.approved_video_url ? yt_thumb(s.approved_video_url) : null;
            const icon = s.avatar_emoji || s.avatar || "🎓";
            return (
              <div
                key={s.id}
                style={{ ...card, display: "flex", gap: 16, alignItems: "center", padding: 16 }}
              >
                {thumb ? (
                  <img
                    src={thumb}
                    alt=""
                    style={{ width: 120, height: 68, objectFit: "cover", borderRadius: 8, flexShrink: 0 }}
                  />
                ) : (
                  <div style={{
                    width: 120, height: 68, background: "rgba(255,255,255,0.06)",
                    borderRadius: 8, flexShrink: 0, display: "flex",
                    alignItems: "center", justifyContent: "center", fontSize: 24,
                  }}>📺</div>
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                    <span style={{ fontSize: 22 }}>{icon}</span>
                    <span style={{ fontWeight: 700, color: "white", fontSize: 15 }}>{s.name}</span>
                  </div>
                  <div style={{ fontWeight: 600, color: "#e2e8f0", fontSize: 14, marginBottom: 4 }}>
                    {s.approved_video_title || "Untitled Video"}
                  </div>
                  <a
                    href={s.approved_video_url!}
                    target="_blank"
                    rel="noreferrer"
                    style={{ fontSize: 11, color: "#60a5fa", wordBreak: "break-all" }}
                  >
                    {s.approved_video_url}
                  </a>
                  {s.approved_video_set_at && (
                    <div style={{ fontSize: 11, color: T.sub, marginTop: 2 }}>
                      Approved {new Date(s.approved_video_set_at).toLocaleString()}
                    </div>
                  )}
                </div>
                <button
                  onClick={() => revoke(Number(s.id))}
                  disabled={!!revoking[Number(s.id)]}
                  style={{ ...T.btnDanger, flexShrink: 0, opacity: revoking[Number(s.id)] ? 0.5 : 1 }}
                >
                  {revoking[Number(s.id)] ? "Revoking…" : "Revoke"}
                </button>
              </div>
            );
          })}
          {activeVideos.length === 0 && (
            <div style={{ ...card, textAlign: "center", color: T.sub, padding: 40 }}>
              No students have an approved video right now
            </div>
          )}
        </div>
      )}

      {/* ── Denied ── */}
      {tab === "denied" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {denied.map((r) => {
            const s = studentObj(r.student_id);
            const icon = s?.avatar_emoji || s?.avatar || "🎓";
            const ts = r.requested_at || r.created_at;
            return (
              <div key={r.id} style={{ ...card, padding: 16 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <span style={{ fontSize: 26 }}>{icon}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, color: "white" }}>{s?.name || `Student #${r.student_id}`}</div>
                    <div style={{ fontSize: 12, color: T.sub, marginTop: 2 }}>
                      requested: <span style={{ color: "#e2e8f0" }}>"{r.title}"</span>
                    </div>
                  </div>
                  {ts && <div style={{ fontSize: 11, color: T.sub }}>{new Date(ts).toLocaleString()}</div>}
                </div>
              </div>
            );
          })}
          {denied.length === 0 && (
            <div style={{ ...card, textAlign: "center", color: T.sub, padding: 40 }}>
              No denied requests
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Section: Settings ────────────────────────────────────────────────────────
function SettingsSection() {
  const [settings, setSettings] = useState<AdminSettings>({});
  const [oldPw, setOldPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    req<AdminSettings>("/admin-settings").then(setSettings).catch(() => {});
  }, []);

  const set = (k: keyof AdminSettings, v: any) => setSettings((s) => ({ ...s, [k]: v }));

  const save = async () => {
    setSaving(true);
    setMsg("");
    try {
      const payload: any = { ...settings };
      if (newPw) {
        payload.old_password = oldPw;
        payload.teacher_password = newPw;
      }
      await req("/admin-settings", { method: "PUT", body: JSON.stringify(payload) });
      setSaved(true);
      setMsg("Settings saved successfully.");
      setTimeout(() => { setSaved(false); setMsg(""); }, 3000);
      setOldPw("");
      setNewPw("");
    } catch (e: any) {
      setMsg("Error: " + e.message);
    } finally {
      setSaving(false);
    }
  };

  const resetToday = async () => {
    if (!confirm("Reset all today's task completions? This cannot be undone.")) return;
    try {
      await req("/tasks/reset-today", { method: "POST" });
      alert("Today's completions reset.");
    } catch {
      alert("Reset endpoint not available. Contact your system admin.");
    }
  };

  return (
    <div>
      <SectionTitle>⚙️ Settings</SectionTitle>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
        <div style={card}>
          <h3 style={{ fontSize: 15, fontWeight: 700, color: "white", margin: "0 0 16px 0" }}>General</h3>
          <div style={{ marginBottom: 14 }}>
            <Label>School Name</Label>
            <input style={T.input} value={settings.school_name || ""} onChange={(e) => set("school_name", e.target.value)} placeholder="My School" />
          </div>
          <div style={{ marginBottom: 14 }}>
            <Label>Class Name</Label>
            <input style={T.input} value={settings.class_name || ""} onChange={(e) => set("class_name", e.target.value)} placeholder="Class 3B" />
          </div>
          <div style={{ marginBottom: 14 }}>
            <Label>Default Grade Min</Label>
            <input type="number" min={1} max={12} style={T.input} value={settings.default_grade_min || 1}
              onChange={(e) => set("default_grade_min", Number(e.target.value))} />
          </div>
          <div style={{ marginBottom: 14 }}>
            <Label>Default Grade Max</Label>
            <input type="number" min={1} max={12} style={T.input} value={settings.default_grade_max || 5}
              onChange={(e) => set("default_grade_max", Number(e.target.value))} />
          </div>
        </div>

        <div style={card}>
          <h3 style={{ fontSize: 15, fontWeight: 700, color: "white", margin: "0 0 16px 0" }}>Security</h3>
          <div style={{ marginBottom: 14 }}>
            <Label>Change Password — Current Password</Label>
            <input type="password" style={T.input} value={oldPw} onChange={(e) => setOldPw(e.target.value)} placeholder="Current password" />
          </div>
          <div style={{ marginBottom: 14 }}>
            <Label>New Password</Label>
            <input type="password" style={T.input} value={newPw} onChange={(e) => setNewPw(e.target.value)} placeholder="Leave blank to keep current" />
          </div>
          <div style={{ marginBottom: 14 }}>
            <Label>Remote Access PIN (4 digits)</Label>
            <input
              style={T.input}
              maxLength={4}
              value={settings.remote_access_pin || ""}
              onChange={(e) => set("remote_access_pin", e.target.value.replace(/\D/g, "").slice(0, 4))}
              placeholder="1234"
            />
            <div style={{ fontSize: 11, color: T.sub, marginTop: 4 }}>
              Share this PIN to allow remote access via ?pin=XXXX in the URL.
            </div>
          </div>
        </div>
      </div>

      <div style={{ ...card, marginTop: 20 }}>
        <h3 style={{ fontSize: 15, fontWeight: 700, color: "white", margin: "0 0 16px 0" }}>Data Management</h3>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
          <button onClick={resetToday} style={T.btnDanger}>🔄 Reset Today's Completions</button>
          <button
            onClick={() => alert("CSV export coming soon.")}
            style={T.btnGhost}
          >
            📥 Export Students CSV
          </button>
          <button
            onClick={() => alert("CSV export coming soon.")}
            style={T.btnGhost}
          >
            📥 Export Tasks CSV
          </button>
        </div>
      </div>

      {msg && (
        <div style={{
          marginTop: 16,
          padding: "10px 16px",
          borderRadius: 10,
          background: msg.startsWith("Error") ? "rgba(239,68,68,0.12)" : "rgba(16,185,129,0.12)",
          color: msg.startsWith("Error") ? "#f87171" : "#34d399",
          fontSize: 13,
        }}>
          {msg}
        </div>
      )}

      <div style={{ marginTop: 20 }}>
        <button onClick={save} disabled={saving} style={{ ...T.btn, opacity: saving ? 0.6 : 1 }}>
          {saved ? "✓ Saved!" : saving ? "Saving…" : "Save Settings"}
        </button>
      </div>
    </div>
  );
}

// ─── Section: Analytics ───────────────────────────────────────────────────────
function AnalyticsSection({ students }: { students: Student[] }) {
  const [tasks, setTasks] = useState<any[]>([]);
  const [libCount, setLibCount] = useState(0);
  const today = todayStr();

  useEffect(() => {
    req("/tasks/today").then(setTasks).catch(() => {});
    req<any[]>("/worksheets/library").then((l) => setLibCount(l.length)).catch(() => {});
  }, []);

  const todayTasks = tasks.filter((t) => t.date?.startsWith(today) && t.passed).length;

  return (
    <div>
      <SectionTitle>📈 Analytics</SectionTitle>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16, marginBottom: 32 }}>
        <StatCard emoji="👥" label="Total Students" value={students.length} color="#a78bfa" />
        <StatCard emoji="✅" label="Tasks Completed Today" value={todayTasks} color="#34d399" />
        <StatCard emoji="📄" label="Worksheets in Library" value={libCount} color="#60a5fa" />
      </div>

      <div style={{ ...card, textAlign: "center", padding: 60 }}>
        <div style={{ fontSize: 56, marginBottom: 16 }}>📈</div>
        <div style={{ fontSize: 20, fontWeight: 700, color: "white", marginBottom: 8 }}>Full Analytics Coming Soon</div>
        <div style={{ color: T.sub, maxWidth: 480, margin: "0 auto", lineHeight: 1.6 }}>
          We're integrating Recharts for rich visual analytics. Soon you'll see daily task completion trends,
          subject-by-subject progress charts, break frequency graphs, and behavior point histories for every student.
        </div>
      </div>
    </div>
  );
}

// ─── Auth Gate ────────────────────────────────────────────────────────────────
function AuthGate({ onAuth }: { onAuth: () => void }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (!password) return;
    setLoading(true);
    setError("");
    try {
      const res = await req<{ valid: boolean }>("/admin-settings/check-password", {
        method: "POST",
        body: JSON.stringify({ password }),
      });
      if (res.valid) {
        sessionStorage.setItem("admin_authed", "1");
        onAuth();
      } else {
        setError("Incorrect password. Please try again.");
      }
    } catch {
      setError("Could not connect to server.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: "100vh",
      background: T.bg,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
    }}>
      <div style={{
        background: "#0f1029",
        border: `1px solid ${T.cardBorder}`,
        borderRadius: 20,
        padding: 40,
        width: "min(400px, 90vw)",
        textAlign: "center",
      }}>
        <div style={{ fontSize: 48, marginBottom: 12 }}>⚙️</div>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: "white", margin: "0 0 4px 0" }}>Teacher Portal</h1>
        <p style={{ color: T.sub, fontSize: 14, margin: "0 0 28px 0" }}>Enter your password to access the admin portal</p>

        <input
          type="password"
          style={{ ...T.input, marginBottom: 12, textAlign: "center" }}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          placeholder="Password"
          autoFocus
        />

        {error && (
          <div style={{ color: "#f87171", fontSize: 13, marginBottom: 12 }}>{error}</div>
        )}

        <button
          onClick={submit}
          disabled={loading}
          style={{ ...T.btn, width: "100%", opacity: loading ? 0.6 : 1 }}
        >
          {loading ? "Checking…" : "Enter Portal"}
        </button>
      </div>
    </div>
  );
}

// ─── NAV ITEMS ────────────────────────────────────────────────────────────────
const NAV_ITEMS = [
  { id: "dashboard",   label: "Dashboard",      emoji: "📊" },
  { id: "students",    label: "Students",        emoji: "👥" },
  { id: "tasks",       label: "Tasks",           emoji: "📋" },
  { id: "breaks",      label: "Break Settings",  emoji: "⏸️" },
  { id: "worksheets",  label: "Worksheets",      emoji: "📄" },
  { id: "youtube",     label: "YouTube Queue",   emoji: "📺" },
  { id: "settings",    label: "Settings",        emoji: "⚙️" },
  { id: "analytics",   label: "Analytics",       emoji: "📈" },
] as const;

type Section = typeof NAV_ITEMS[number]["id"];

// ─── Main Portal ──────────────────────────────────────────────────────────────
function Portal() {
  const [activeSection, setActiveSection] = useState<Section>("dashboard");
  const [students, setStudents] = useState<Student[]>([]);
  const [sidebarHovered, setSidebarHovered] = useState<Section | null>(null);

  const loadStudents = useCallback(() => {
    req<Student[]>("/students").then(setStudents).catch(() => {});
  }, []);

  useEffect(() => { loadStudents(); }, [loadStudents]);

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: T.bg, color: "white", fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" }}>
      {/* Sidebar */}
      <aside style={{
        width: 220,
        background: T.sidebar,
        borderRight: `1px solid ${T.sidebarBorder}`,
        display: "flex",
        flexDirection: "column",
        flexShrink: 0,
        position: "sticky",
        top: 0,
        height: "100vh",
        overflowY: "auto",
      }}>
        {/* Logo */}
        <div style={{ padding: "24px 20px 20px", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
          <div style={{ fontSize: 22 }}>⚙️</div>
          <div style={{ fontSize: 15, fontWeight: 800, color: "white", marginTop: 4 }}>Teacher Portal</div>
          <div style={{ fontSize: 11, color: T.sub }}>BlockForge Classroom</div>
        </div>

        {/* Nav */}
        <nav style={{ padding: "12px 10px", flex: 1 }}>
          {NAV_ITEMS.map((item) => {
            const isActive = activeSection === item.id;
            const isHovered = sidebarHovered === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveSection(item.id)}
                onMouseEnter={() => setSidebarHovered(item.id)}
                onMouseLeave={() => setSidebarHovered(null)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  width: "100%",
                  padding: "9px 12px",
                  borderRadius: 10,
                  border: "none",
                  cursor: "pointer",
                  marginBottom: 2,
                  textAlign: "left",
                  background: isActive
                    ? "linear-gradient(135deg, rgba(124,58,237,0.3) 0%, rgba(99,102,241,0.2) 100%)"
                    : isHovered ? "rgba(255,255,255,0.04)" : "transparent",
                  borderLeft: isActive ? "2px solid #7c3aed" : "2px solid transparent",
                  transition: "all 0.15s",
                }}
              >
                <span style={{ fontSize: 16 }}>{item.emoji}</span>
                <span style={{
                  fontSize: 13,
                  fontWeight: isActive ? 700 : 500,
                  color: isActive ? "white" : "rgba(255,255,255,0.55)",
                }}>
                  {item.label}
                </span>
              </button>
            );
          })}
        </nav>

        {/* Footer */}
        <div style={{ padding: "12px 16px", borderTop: "1px solid rgba(255,255,255,0.05)", fontSize: 11, color: "rgba(255,255,255,0.2)" }}>
          {new Date().toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })}
        </div>
      </aside>

      {/* Main content */}
      <main style={{ flex: 1, overflowY: "auto", padding: 32, minWidth: 0 }}>
        {activeSection === "dashboard"  && <DashboardSection  students={students} />}
        {activeSection === "students"   && <StudentsSection   students={students} onRefresh={loadStudents} />}
        {activeSection === "tasks"      && <TasksSection      students={students} />}
        {activeSection === "breaks"     && <BreakSection />}
        {activeSection === "worksheets" && <WorksheetsSection students={students} />}
        {activeSection === "youtube"    && <YouTubeSection    students={students} />}
        {activeSection === "settings"   && <SettingsSection />}
        {activeSection === "analytics"  && <AnalyticsSection  students={students} />}
      </main>
    </div>
  );
}

// ─── Root Component ───────────────────────────────────────────────────────────
export default function TeacherAdmin() {
  const [authed, setAuthed] = useState<boolean | null>(null);

  useEffect(() => {
    // Check URL param first
    const params = new URLSearchParams(window.location.search);
    const pin = params.get("pin");

    if (pin) {
      req<{ valid: boolean }>(`/admin-settings/check-pin?pin=${encodeURIComponent(pin)}`)
        .then((res) => {
          if (res.valid) {
            sessionStorage.setItem("admin_authed", "1");
            setAuthed(true);
          } else {
            setAuthed(false);
          }
        })
        .catch(() => setAuthed(false));
      return;
    }

    // Check sessionStorage
    if (sessionStorage.getItem("admin_authed") === "1") {
      setAuthed(true);
    } else {
      setAuthed(false);
    }
  }, []);

  if (authed === null) {
    // Loading
    return (
      <div style={{ minHeight: "100vh", background: T.bg, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ fontSize: 32, animation: "spin 1s linear infinite" }}>⚙️</div>
      </div>
    );
  }

  if (!authed) {
    return <AuthGate onAuth={() => setAuthed(true)} />;
  }

  return <Portal />;
}
