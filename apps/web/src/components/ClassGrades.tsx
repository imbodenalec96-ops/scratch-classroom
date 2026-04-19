import React, { useEffect, useState, useCallback, useRef } from "react";
import { Link } from "react-router-dom";
import { useTheme } from "../lib/theme.tsx";
import { api } from "../lib/api.ts";
import { GraduationCap, ChevronLeft, Save, Users, CheckCircle2, ChevronDown } from "lucide-react";

/**
 * ClassGrades — per-student grade-level editor.
 * Spreadsheet/gradebook layout. Rows = students, cols = Reading/Math/Writing.
 * Inline editing: click a grade cell to open an input.
 * Color-coded by grade level. Sticky header. Infinite Campus-inspired layout.
 */
export default function ClassGrades() {
  const { theme } = useTheme();
  const dk = theme === "dark";

  const [classes, setClasses] = useState<any[]>([]);
  const [selectedClassId, setSelectedClassId] = useState<string>("");
  const [rows, setRows] = useState<any[]>([]);
  const [dirty, setDirty] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  const [editCell, setEditCell] = useState<{ id: string; subject: string } | null>(null);
  const [studentsByClass, setStudentsByClass] = useState<Record<string, number>>({});

  const showFlash = useCallback((t: string) => { setFlash(t); setTimeout(() => setFlash(null), 2800); }, []);

  useEffect(() => {
    api.getClasses().then(async c => {
      setClasses(c);
      const counts: Record<string, number> = {};
      await Promise.all(c.map(async (cls: any) => {
        try { const list = await api.getStudents(cls.id); counts[cls.id] = list.length; }
        catch { counts[cls.id] = 0; }
      }));
      setStudentsByClass(counts);
      if (c.length > 0 && !selectedClassId) {
        const firstWithStudents = c.find((cls: any) => counts[cls.id] > 0);
        setSelectedClassId((firstWithStudents || c[0]).id);
      }
    }).catch(console.error);
  }, []);

  useEffect(() => {
    if (!selectedClassId) return;
    api.getClassGrades(selectedClassId).then(r => { setRows(r); setDirty({}); setEditCell(null); }).catch(() => setRows([]));
  }, [selectedClassId]);

  const editGrade = (userId: string, subject: string, val: number) => {
    setRows(prev => prev.map(r => r.id === userId ? { ...r, [`${subject}_grade`]: val } : r));
    setDirty(d => ({ ...d, [userId]: true }));
  };

  const saveAll = async () => {
    setSaving(true);
    const toSave = rows.filter(r => dirty[r.id]);
    for (const r of toSave) {
      try {
        await api.setStudentGrades(r.id, {
          reading_grade: r.reading_grade,
          math_grade:    r.math_grade,
          writing_grade: r.writing_grade,
        });
      } catch { /* keep going */ }
    }
    setDirty({});
    setSaving(false);
    setEditCell(null);
    showFlash(`Saved ${toSave.length} student${toSave.length !== 1 ? "s" : ""}`);
  };

  const bulkApply = (subject: string, grade: number) => {
    if (!confirm(`Set every student's ${subject} grade to ${gradeLabel(grade)}?`)) return;
    setRows(prev => prev.map(r => ({ ...r, [`${subject}_grade`]: grade })));
    const d: Record<string, boolean> = {};
    for (const r of rows) d[r.id] = true;
    setDirty(d);
  };

  const selectedClass = classes.find(c => c.id === selectedClassId);
  const dirtyCount = Object.values(dirty).filter(Boolean).length;

  // Color coding for grade levels
  const gradeColor = (g: number): { bg: string; text: string; border: string } => {
    if (g === 0)  return dk ? { bg: "rgba(251,191,36,0.12)",  text: "#fbbf24", border: "rgba(251,191,36,0.25)"  } : { bg: "#fffbeb", text: "#b45309", border: "#fde68a" };
    if (g <= 2)   return dk ? { bg: "rgba(251,191,36,0.10)",  text: "#fcd34d", border: "rgba(251,191,36,0.2)"   } : { bg: "#fefce8", text: "#a16207", border: "#fef08a" };
    if (g <= 5)   return dk ? { bg: "rgba(52,211,153,0.12)",  text: "#34d399", border: "rgba(52,211,153,0.25)"  } : { bg: "#f0fdf4", text: "#16a34a", border: "#bbf7d0" };
    if (g <= 8)   return dk ? { bg: "rgba(56,189,248,0.12)",  text: "#38bdf8", border: "rgba(56,189,248,0.25)"  } : { bg: "#eff6ff", text: "#1d4ed8", border: "#bfdbfe" };
    return           dk ? { bg: "rgba(167,139,250,0.12)", text: "#a78bfa", border: "rgba(167,139,250,0.25)" } : { bg: "#f5f3ff", text: "#7c3aed", border: "#ddd6fe" };
  };

  return (
    <div className="p-7 space-y-5 animate-page-enter max-w-5xl mx-auto">
      {/* ── Masthead header ── */}
      <header className="border-b pb-5" style={{ borderColor: "var(--border)" }}>
        <div className="flex items-center justify-between mb-2 text-[10px] uppercase tracking-[0.16em]" style={{ color: "var(--text-3)" }}>
          <span>Classroom Settings</span>
          <span className="font-mono">GRADES · PER STUDENT</span>
        </div>
        <div className="flex items-end justify-between gap-4 flex-wrap">
          <div>
            <div className="section-label mb-2">— Each student, each subject —</div>
            <h1 className="font-display text-4xl leading-tight" style={{ color: "var(--text-1)" }}>
              Grade <em style={{ color: "var(--accent)", fontStyle: "italic" }}>levels.</em>
            </h1>
            <p className="text-sm mt-2 max-w-xl" style={{ color: "var(--text-2)" }}>
              Set each student's grade for <strong>Reading</strong>, <strong>Math</strong>, and <strong>Writing</strong> separately.
              The task generator tailors prompts to these per-student levels automatically.
            </p>
          </div>
          <Link to="/teacher" className="btn-ghost text-xs">
            <ChevronLeft size={13} /> Back to dashboard
          </Link>
        </div>
      </header>

      {/* Flash toast */}
      {flash && (
        <div className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium animate-slide-up" style={{
          background: "color-mix(in srgb, var(--success) 10%, transparent)",
          color: "var(--success)",
          border: "1px solid color-mix(in srgb, var(--success) 28%, transparent)",
          borderLeft: "3px solid var(--success)",
          borderRadius: "var(--r-md)",
        }}>
          <CheckCircle2 size={15} />
          {flash}
        </div>
      )}

      {/* Class picker */}
      {classes.length > 0 && (
        <div className="card flex items-center gap-3 flex-wrap">
          <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-3)" }}>Class</span>
          {classes.map(c => {
            const n = studentsByClass[c.id] ?? 0;
            const active = selectedClassId === c.id;
            return (
              <button key={c.id} onClick={() => setSelectedClassId(c.id)}
                className="px-3 py-1.5 text-xs font-semibold border transition-all cursor-pointer flex items-center gap-1.5"
                style={{
                  borderRadius: "var(--r-md)",
                  background: active ? "var(--accent-light)" : "transparent",
                  color: active ? "var(--text-accent)" : "var(--text-2)",
                  borderColor: active ? "var(--accent)" : "var(--border-md)",
                  transform: active ? "none" : undefined,
                }}>
                {c.name}
                <span style={{
                  padding: "1px 6px", borderRadius: 99, fontSize: 10, fontWeight: 700,
                  background: n > 0 ? "color-mix(in srgb, var(--accent) 20%, transparent)" : "var(--bg-muted)",
                  color: n > 0 ? "var(--text-accent)" : "var(--text-3)",
                }}>{n}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* ── Gradebook table ── */}
      <div className="rounded-xl overflow-hidden" style={{
        border: "1px solid var(--border)",
        background: dk ? "var(--bg-surface)" : "white",
        boxShadow: dk ? "none" : "0 1px 8px rgba(0,0,0,0.06)",
      }}>
        {/* Table toolbar */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b" style={{
          borderColor: "var(--border)",
          background: dk ? "var(--bg-raised)" : "#f8fafc",
        }}>
          <div className="flex items-center gap-3">
            <GraduationCap size={15} style={{ color: "var(--text-accent)" }} />
            <h3 className="font-semibold text-sm" style={{ color: "var(--text-1)" }}>
              {selectedClass?.name || "Roster"}
            </h3>
            <span className="text-xs" style={{ color: "var(--text-3)" }}>
              {rows.length} {rows.length === 1 ? "student" : "students"}
            </span>
            {dirtyCount > 0 && (
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full animate-fade-in" style={{
                background: "rgba(251,191,36,0.15)", color: "#fbbf24",
                border: "1px solid rgba(251,191,36,0.3)",
              }}>
                {dirtyCount} unsaved
              </span>
            )}
          </div>
          <button onClick={saveAll} disabled={dirtyCount === 0 || saving}
            className="btn-primary gap-1.5 text-xs">
            <Save size={12} />
            {saving ? "Saving…" : dirtyCount > 0 ? `Save ${dirtyCount} change${dirtyCount !== 1 ? "s" : ""}` : "All saved"}
          </button>
        </div>

        {rows.length === 0 ? (
          <div className="text-center py-16 text-sm" style={{ color: "var(--text-3)" }}>
            <Users size={36} className="mx-auto mb-3 opacity-40" />
            No students in this class yet.
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              {/* Sticky header */}
              <thead style={{ position: "sticky", top: 0, zIndex: 10 }}>
                <tr style={{
                  background: dk ? "var(--bg-raised)" : "#f1f5f9",
                  borderBottom: `2px solid ${dk ? "var(--border-md)" : "#e2e8f0"}`,
                }}>
                  <th style={{ ...thBase, width: "34%" }}>
                    Student
                  </th>
                  {(["reading", "math", "writing"] as const).map(subject => (
                    <th key={subject} style={{ ...thBase, width: "22%" }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                        <span>{subjectLabel(subject)}</span>
                        <QuickSet subject={subject} onPick={(g) => bulkApply(subject, g)} dk={dk} />
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r, idx) => {
                  const isAlternate = idx % 2 === 1;
                  return (
                    <tr key={r.id} style={{
                      borderBottom: `1px solid ${dk ? "var(--border)" : "#e9ecef"}`,
                      background: isAlternate
                        ? (dk ? "rgba(255,255,255,0.015)" : "#f8fafc")
                        : "transparent",
                      transition: "background 0.15s",
                    }}
                    onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = dk ? "rgba(99,102,241,0.06)" : "rgba(99,102,241,0.04)"}
                    onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = isAlternate ? (dk ? "rgba(255,255,255,0.015)" : "#f8fafc") : "transparent"}>
                      {/* Student name cell */}
                      <td style={{ padding: "10px 16px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <div style={{
                            width: 32, height: 32, flexShrink: 0,
                            background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
                            borderRadius: "var(--r-md)",
                            display: "flex", alignItems: "center", justifyContent: "center",
                            color: "white", fontSize: 12, fontWeight: 700,
                          }}>
                            {(r.name || "?").slice(0, 1).toUpperCase()}
                          </div>
                          <div>
                            <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-1)" }}>{r.name}</div>
                            <div style={{ fontSize: 10, color: "var(--text-3)" }}>{r.email}</div>
                          </div>
                          {dirty[r.id] && (
                            <span style={{
                              marginLeft: 4, padding: "1px 7px", fontSize: 9,
                              fontWeight: 700, letterSpacing: "0.08em",
                              textTransform: "uppercase",
                              background: "rgba(251,191,36,0.15)",
                              color: "#fbbf24",
                              border: "1px solid rgba(251,191,36,0.3)",
                              borderRadius: "var(--r-sm)",
                            }}>•</span>
                          )}
                        </div>
                      </td>
                      {/* Grade cells */}
                      {(["reading", "math", "writing"] as const).map(subject => {
                        const val: number = r[`${subject}_grade`] ?? 0;
                        const colors = gradeColor(val);
                        const isEditing = editCell?.id === r.id && editCell?.subject === subject;
                        return (
                          <td key={subject} style={{ padding: "8px 16px" }}>
                            {isEditing ? (
                              <GradeSelectInline
                                value={val}
                                onChange={g => { editGrade(r.id, subject, g); setEditCell(null); }}
                                onBlur={() => setEditCell(null)}
                              />
                            ) : (
                              <button
                                data-no-hover
                                onClick={() => setEditCell({ id: r.id, subject })}
                                style={{
                                  display: "inline-flex",
                                  alignItems: "center",
                                  gap: 6,
                                  padding: "4px 10px",
                                  borderRadius: "var(--r-md)",
                                  background: colors.bg,
                                  color: colors.text,
                                  border: `1px solid ${colors.border}`,
                                  fontSize: 12,
                                  fontWeight: 700,
                                  cursor: "pointer",
                                  transition: "all 0.15s",
                                  minWidth: 90,
                                  justifyContent: "space-between",
                                }}
                                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.opacity = "0.8"; (e.currentTarget as HTMLElement).style.transform = "translateY(-1px)"; }}
                                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.opacity = "1"; (e.currentTarget as HTMLElement).style.transform = ""; }}
                              >
                                <span>{gradeLabel(val)}</span>
                                <ChevronDown size={10} style={{ opacity: 0.6 }} />
                              </button>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Footer */}
      <div style={{ fontSize: 11, color: "var(--text-3)" }}>
        <GraduationCap size={11} className="inline mr-1.5" />
        Grades drive the AI task generator. Two students in different grades will get different
        prompts on the same day, even in the same class.
      </div>
    </div>
  );
}

/* ── helpers ───────────────────────────────────────────── */

const thBase: React.CSSProperties = {
  textAlign: "left",
  padding: "11px 16px",
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: "0.07em",
  textTransform: "uppercase",
  color: "var(--text-3)",
  whiteSpace: "nowrap",
};

function subjectLabel(s: string): string {
  return s === "reading" ? "📖 Reading" : s === "math" ? "🔢 Math" : "✏️ Writing";
}

function gradeLabel(g: number): string {
  if (g === 0) return "K";
  const sufx = (n: number) => { const s = ["th","st","nd","rd"]; const v = n % 100; return n + (s[(v-20)%10] || s[v] || s[0]); };
  return `${sufx(g)}`;
}

/** Inline select that auto-focuses and closes on change or blur */
function GradeSelectInline({
  value,
  onChange,
  onBlur,
}: { value: number; onChange: (g: number) => void; onBlur: () => void }) {
  const ref = useRef<HTMLSelectElement>(null);
  useEffect(() => { ref.current?.focus(); }, []);
  return (
    <select
      ref={ref}
      value={value}
      autoFocus
      onChange={e => onChange(Number(e.target.value))}
      onBlur={onBlur}
      className="input text-sm py-1"
      style={{ width: 130, borderColor: "var(--accent)", boxShadow: "0 0 0 2px rgba(99,102,241,0.2)" }}
    >
      <option value={0}>Kindergarten</option>
      {Array.from({ length: 12 }).map((_, i) => (
        <option key={i + 1} value={i + 1}>{gradeLabel(i + 1)} grade</option>
      ))}
    </select>
  );
}

function QuickSet({ subject, onPick, dk }: { subject: string; onPick: (g: number) => void; dk: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ position: "relative" }} onMouseLeave={() => setOpen(false)}>
      <button
        data-no-hover
        onClick={() => setOpen(v => !v)}
        className="text-[10px] font-semibold normal-case tracking-normal px-2 py-0.5 cursor-pointer rounded transition-colors"
        style={{ color: "var(--text-3)" }}
        title={`Set every student's ${subject} grade`}
      >
        Set all ▾
      </button>
      {open && (
        <div style={{
          position: "absolute", top: "100%", right: 0, marginTop: 4,
          background: "var(--bg-surface)",
          border: "1px solid var(--border-md)",
          borderRadius: "var(--r-md)",
          boxShadow: dk ? "0 8px 24px rgba(0,0,0,0.5)" : "0 6px 16px rgba(0,0,0,0.12)",
          padding: 4, zIndex: 30, minWidth: 140,
        }}>
          <button data-no-hover onClick={() => { onPick(0); setOpen(false); }} style={menuItem}>K — Kindergarten</button>
          {Array.from({ length: 12 }).map((_, i) => (
            <button data-no-hover key={i + 1} onClick={() => { onPick(i + 1); setOpen(false); }} style={menuItem}>
              {gradeLabel(i + 1)} grade
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const menuItem: React.CSSProperties = {
  display: "block", width: "100%", textAlign: "left",
  padding: "6px 10px", fontSize: 11, fontWeight: 600,
  color: "var(--text-2)", background: "transparent",
  border: "none", cursor: "pointer", borderRadius: "var(--r-sm)",
};
