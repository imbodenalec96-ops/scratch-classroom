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

  const [classes, setClasses]                   = useState<any[]>([]);
  const [selectedClassId, setSelectedClassId]   = useState<string>("");
  const [rows, setRows]                         = useState<any[]>([]);
  const [dirty, setDirty]                       = useState<Record<string, boolean>>({});
  const [saving, setSaving]                     = useState(false);
  const [flash, setFlash]                       = useState<string | null>(null);
  const [editCell, setEditCell]                 = useState<{ id: string; subject: string } | null>(null);
  const [studentsByClass, setStudentsByClass]   = useState<Record<string, number>>({});

  const showFlash = useCallback((t: string) => {
    setFlash(t);
    setTimeout(() => setFlash(null), 2800);
  }, []);

  useEffect(() => {
    api.getClasses().then(async (c) => {
      setClasses(c);
      const counts: Record<string, number> = {};
      await Promise.all(
        c.map(async (cls: any) => {
          try { const list = await api.getStudents(cls.id); counts[cls.id] = list.length; }
          catch { counts[cls.id] = 0; }
        }),
      );
      setStudentsByClass(counts);
      if (c.length > 0 && !selectedClassId) {
        const firstWithStudents = c.find((cls: any) => counts[cls.id] > 0);
        setSelectedClassId((firstWithStudents || c[0]).id);
      }
    }).catch(console.error);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!selectedClassId) return;
    api.getClassGrades(selectedClassId)
      .then((r) => { setRows(r); setDirty({}); setEditCell(null); })
      .catch(() => setRows([]));
  }, [selectedClassId]);

  const editGrade = (userId: string, subject: string, val: number) => {
    setRows((prev) => prev.map((r) => r.id === userId ? { ...r, [`${subject}_grade`]: val } : r));
    setDirty((d) => ({ ...d, [userId]: true }));
  };

  const saveAll = async () => {
    setSaving(true);
    const toSave = rows.filter((r) => dirty[r.id]);
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
    setRows((prev) => prev.map((r) => ({ ...r, [`${subject}_grade`]: grade })));
    const d: Record<string, boolean> = {};
    for (const r of rows) d[r.id] = true;
    setDirty(d);
  };

  const selectedClass = classes.find((c) => c.id === selectedClassId);
  const dirtyCount    = Object.values(dirty).filter(Boolean).length;

  // Color coding for grade levels
  const gradeColor = (g: number): { bg: string; text: string; border: string } => {
    if (g === 0) return { bg: "rgba(251,191,36,0.12)",  text: "#fbbf24", border: "rgba(251,191,36,0.28)" };
    if (g <= 2)  return { bg: "rgba(251,191,36,0.09)",  text: "#fcd34d", border: "rgba(251,191,36,0.2)"  };
    if (g <= 5)  return { bg: "rgba(52,211,153,0.12)",  text: "#34d399", border: "rgba(52,211,153,0.28)" };
    if (g <= 8)  return { bg: "rgba(56,189,248,0.11)",  text: "#38bdf8", border: "rgba(56,189,248,0.25)" };
    return              { bg: "rgba(167,139,250,0.11)", text: "#a78bfa", border: "rgba(167,139,250,0.25)" };
  };

  /* ── Layout constants ── */
  const NAME_COL_W  = 200;
  const GRADE_COL_W = 160;
  const borderCol   = "rgba(255,255,255,0.07)";
  const headerBg    = "rgba(255,255,255,0.045)";
  const surfaceBg   = "rgba(255,255,255,0.03)";

  return (
    <div
      className="p-6 space-y-5 animate-page-enter"
      style={{ maxWidth: 900, margin: "0 auto" }}
    >
      {/* ── Page header ── */}
      <header style={{ borderBottom: `1px solid ${borderCol}`, paddingBottom: 20 }}>
        <div
          style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            marginBottom: 6,
            fontSize: 10, fontWeight: 700, textTransform: "uppercase",
            letterSpacing: "0.16em", color: "var(--t3)",
          }}
        >
          <span>Classroom Settings</span>
          <span style={{ fontFamily: "monospace" }}>GRADES · PER STUDENT</span>
        </div>
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
          <div>
            <div
              style={{
                fontSize: 11, textTransform: "uppercase", letterSpacing: "0.12em",
                color: "var(--t3)", marginBottom: 6,
              }}
            >
              — Each student, each subject —
            </div>
            <h1
              style={{
                fontSize: 32, fontWeight: 800, lineHeight: 1.1,
                color: "var(--t1)", margin: 0,
              }}
            >
              Grade <em style={{ color: "#7c3aed", fontStyle: "italic" }}>levels.</em>
            </h1>
            <p style={{ fontSize: 13, marginTop: 8, maxWidth: 480, color: "var(--t2)" }}>
              Set each student's grade for <strong>Reading</strong>, <strong>Math</strong>, and{" "}
              <strong>Writing</strong> separately. The task generator tailors prompts to these
              per-student levels automatically.
            </p>
          </div>
          <Link
            to="/teacher"
            style={{
              display: "inline-flex", alignItems: "center", gap: 4,
              fontSize: 12, color: "var(--t3)",
              textDecoration: "none",
            }}
          >
            <ChevronLeft size={13} /> Back to dashboard
          </Link>
        </div>
      </header>

      {/* Flash toast */}
      {flash && (
        <div
          className="animate-slide-up"
          style={{
            display: "flex", alignItems: "center", gap: 8,
            padding: "8px 14px", fontSize: 13, fontWeight: 600, borderRadius: 8,
            background: "rgba(52,211,153,0.1)",
            color: "#34d399",
            border: "1px solid rgba(52,211,153,0.28)",
            borderLeft: "3px solid #34d399",
          }}
        >
          <CheckCircle2 size={14} />
          {flash}
        </div>
      )}

      {/* Class picker tabs */}
      {classes.length > 0 && (
        <div
          style={{
            display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap",
            padding: "10px 14px",
            background: surfaceBg,
            border: `1px solid ${borderCol}`,
            borderRadius: 10,
          }}
        >
          <span
            style={{
              fontSize: 10, fontWeight: 700, textTransform: "uppercase",
              letterSpacing: "0.12em", color: "var(--t3)", marginRight: 2,
            }}
          >
            Class
          </span>
          {classes.map((c) => {
            const n      = studentsByClass[c.id] ?? 0;
            const active = selectedClassId === c.id;
            return (
              <button
                key={c.id}
                onClick={() => setSelectedClassId(c.id)}
                style={{
                  display: "inline-flex", alignItems: "center", gap: 6,
                  padding: "5px 12px", borderRadius: 6,
                  fontSize: 12, fontWeight: 600, cursor: "pointer",
                  background: active ? "rgba(124,58,237,0.18)" : "transparent",
                  color: active ? "#c4b5fd" : "var(--t2)",
                  border: `1px solid ${active ? "rgba(124,58,237,0.45)" : borderCol}`,
                  transition: "all 0.12s",
                }}
              >
                {c.name}
                <span
                  style={{
                    padding: "1px 6px", borderRadius: 99, fontSize: 10, fontWeight: 700,
                    background: n > 0
                      ? (active ? "rgba(124,58,237,0.3)" : "rgba(255,255,255,0.06)")
                      : "rgba(255,255,255,0.04)",
                    color: n > 0 ? (active ? "#c4b5fd" : "var(--t2)") : "var(--t3)",
                  }}
                >
                  {n}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* ── Gradebook spreadsheet ── */}
      <div
        style={{
          borderRadius: 10, overflow: "hidden",
          border: `1px solid ${borderCol}`,
          background: surfaceBg,
        }}
      >
        {/* Table toolbar */}
        <div
          style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "10px 16px",
            background: headerBg,
            borderBottom: `1px solid ${borderCol}`,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <GraduationCap size={14} style={{ color: "#7c3aed" }} />
            <span style={{ fontSize: 13, fontWeight: 700, color: "var(--t1)" }}>
              {selectedClass?.name || "Roster"}
            </span>
            <span style={{ fontSize: 12, color: "var(--t3)" }}>
              {rows.length} {rows.length === 1 ? "student" : "students"}
            </span>
            {dirtyCount > 0 && (
              <span
                className="animate-fade-in"
                style={{
                  padding: "2px 8px", borderRadius: 99, fontSize: 10, fontWeight: 700,
                  background: "rgba(251,191,36,0.14)", color: "#fbbf24",
                  border: "1px solid rgba(251,191,36,0.3)",
                }}
              >
                {dirtyCount} unsaved
              </span>
            )}
          </div>
          <button
            onClick={saveAll}
            disabled={dirtyCount === 0 || saving}
            style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              padding: "6px 14px", borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: dirtyCount === 0 ? "default" : "pointer",
              background: dirtyCount > 0 ? "rgba(124,58,237,0.22)" : "rgba(255,255,255,0.05)",
              color: dirtyCount > 0 ? "#c4b5fd" : "var(--t3)",
              border: `1px solid ${dirtyCount > 0 ? "rgba(124,58,237,0.45)" : borderCol}`,
              opacity: dirtyCount === 0 || saving ? 0.6 : 1,
              transition: "all 0.12s",
            }}
          >
            <Save size={12} />
            {saving ? "Saving…" : dirtyCount > 0 ? `Save ${dirtyCount} change${dirtyCount !== 1 ? "s" : ""}` : "All saved"}
          </button>
        </div>

        {rows.length === 0 ? (
          <div
            style={{
              textAlign: "center", padding: "60px 0",
              fontSize: 13, color: "var(--t3)",
            }}
          >
            <Users size={36} style={{ display: "block", margin: "0 auto 12px", opacity: 0.3 }} />
            No students in this class yet.
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table
              style={{
                borderCollapse: "collapse",
                tableLayout: "fixed",
                width: NAME_COL_W + GRADE_COL_W * 3,
                minWidth: NAME_COL_W + GRADE_COL_W * 3,
              }}
            >
              <colgroup>
                <col style={{ width: NAME_COL_W }} />
                <col style={{ width: GRADE_COL_W }} />
                <col style={{ width: GRADE_COL_W }} />
                <col style={{ width: GRADE_COL_W }} />
              </colgroup>

              {/* ── Sticky header ── */}
              <thead>
                <tr
                  style={{
                    position: "sticky", top: 0, zIndex: 20,
                    background: headerBg,
                    borderBottom: `2px solid rgba(255,255,255,0.1)`,
                  }}
                >
                  {/* Student name column */}
                  <th
                    style={{
                      ...thBase,
                      position: "sticky", left: 0, zIndex: 30,
                      background: headerBg,
                      borderRight: `2px solid rgba(255,255,255,0.08)`,
                      width: NAME_COL_W,
                      textAlign: "left",
                    }}
                  >
                    Student
                  </th>
                  {(["reading", "math", "writing"] as const).map((subject) => (
                    <th key={subject} style={{ ...thBase, width: GRADE_COL_W }}>
                      <div
                        style={{
                          display: "flex", alignItems: "center",
                          justifyContent: "space-between", gap: 8,
                        }}
                      >
                        <span>{subjectLabel(subject)}</span>
                        <QuickSet subject={subject} onPick={(g) => bulkApply(subject, g)} />
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>

              {/* ── Body ── */}
              <tbody>
                {rows.map((r, idx) => {
                  const isAlt = idx % 2 === 1;
                  const rowBase = isAlt ? "rgba(255,255,255,0.015)" : "transparent";
                  return (
                    <tr
                      key={r.id}
                      style={{
                        background: rowBase,
                        borderBottom: `1px solid ${borderCol}`,
                        height: 44,
                        transition: "background 0.1s",
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(124,58,237,0.07)")}
                      onMouseLeave={(e) => (e.currentTarget.style.background = rowBase)}
                    >
                      {/* ── Frozen student name cell ── */}
                      <td
                        style={{
                          position: "sticky", left: 0, zIndex: 10,
                          background: "inherit",
                          borderRight: `2px solid rgba(255,255,255,0.07)`,
                          padding: "0 14px",
                          width: NAME_COL_W,
                          overflow: "hidden",
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                          <div
                            style={{
                              width: 28, height: 28, flexShrink: 0, borderRadius: 4,
                              background: "linear-gradient(135deg,#7c3aed,#6d28d9)",
                              display: "flex", alignItems: "center", justifyContent: "center",
                              color: "white", fontSize: 11, fontWeight: 700,
                            }}
                          >
                            {(r.name || "?").slice(0, 1).toUpperCase()}
                          </div>
                          <div style={{ minWidth: 0 }}>
                            <div
                              style={{
                                fontSize: 13, fontWeight: 600, color: "var(--t1)",
                                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                              }}
                            >
                              {r.name}
                            </div>
                            <div
                              style={{
                                fontSize: 10, color: "var(--t3)",
                                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                              }}
                            >
                              {r.email}
                            </div>
                          </div>
                          {dirty[r.id] && (
                            <span
                              style={{
                                marginLeft: 2, padding: "1px 6px",
                                fontSize: 9, fontWeight: 700,
                                letterSpacing: "0.08em", textTransform: "uppercase",
                                background: "rgba(251,191,36,0.14)", color: "#fbbf24",
                                border: "1px solid rgba(251,191,36,0.3)",
                                borderRadius: 4,
                              }}
                            >
                              •
                            </span>
                          )}
                        </div>
                      </td>

                      {/* ── Grade cells ── */}
                      {(["reading", "math", "writing"] as const).map((subject) => {
                        const val: number = r[`${subject}_grade`] ?? 0;
                        const colors = gradeColor(val);
                        const isEditing = editCell?.id === r.id && editCell?.subject === subject;
                        return (
                          <td
                            key={subject}
                            style={{
                              padding: "0 14px",
                              borderRight: `1px solid ${borderCol}`,
                              width: GRADE_COL_W,
                            }}
                          >
                            {isEditing ? (
                              <GradeSelectInline
                                value={val}
                                onChange={(g) => { editGrade(r.id, subject, g); setEditCell(null); }}
                                onBlur={() => setEditCell(null)}
                              />
                            ) : (
                              <button
                                onClick={() => setEditCell({ id: r.id, subject })}
                                style={{
                                  display: "inline-flex", alignItems: "center", gap: 6,
                                  padding: "4px 10px", borderRadius: 5,
                                  background: colors.bg, color: colors.text,
                                  border: `1px solid ${colors.border}`,
                                  fontSize: 12, fontWeight: 700,
                                  cursor: "pointer",
                                  transition: "opacity 0.1s, transform 0.1s",
                                  minWidth: 88, justifyContent: "space-between",
                                }}
                                onMouseEnter={(e) => {
                                  (e.currentTarget as HTMLElement).style.opacity = "0.8";
                                  (e.currentTarget as HTMLElement).style.transform = "translateY(-1px)";
                                }}
                                onMouseLeave={(e) => {
                                  (e.currentTarget as HTMLElement).style.opacity = "1";
                                  (e.currentTarget as HTMLElement).style.transform = "";
                                }}
                              >
                                <span>{gradeLabel(val)}</span>
                                <ChevronDown size={10} style={{ opacity: 0.55 }} />
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

      {/* Footer note */}
      <div style={{ fontSize: 11, color: "var(--t3)", display: "flex", alignItems: "center", gap: 5 }}>
        <GraduationCap size={11} />
        Grades drive the AI task generator. Two students in different grades will get different
        prompts on the same day, even in the same class.
      </div>
    </div>
  );
}

/* ── helpers ───────────────────────────────────────────── */

const thBase: React.CSSProperties = {
  textAlign: "left",
  padding: "10px 14px",
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: "0.09em",
  textTransform: "uppercase",
  color: "var(--t3)",
  whiteSpace: "nowrap",
};

function subjectLabel(s: string): string {
  return s === "reading" ? "📖 Reading" : s === "math" ? "🔢 Math" : "✏️ Writing";
}

function gradeLabel(g: number): string {
  if (g === 0) return "K";
  const sufx = (n: number) => {
    const s = ["th", "st", "nd", "rd"];
    const v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
  };
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
      onChange={(e) => onChange(Number(e.target.value))}
      onBlur={onBlur}
      style={{
        width: 140, padding: "4px 8px", fontSize: 12,
        borderRadius: 6, cursor: "pointer",
        background: "rgba(124,58,237,0.12)",
        border: "1px solid rgba(124,58,237,0.45)",
        color: "var(--t1)",
        boxShadow: "0 0 0 2px rgba(124,58,237,0.2)",
        outline: "none",
      }}
    >
      <option value={0}>Kindergarten</option>
      {Array.from({ length: 12 }).map((_, i) => (
        <option key={i + 1} value={i + 1}>{gradeLabel(i + 1)} grade</option>
      ))}
    </select>
  );
}

function QuickSet({ subject, onPick }: { subject: string; onPick: (g: number) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ position: "relative" }} onMouseLeave={() => setOpen(false)}>
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          padding: "2px 6px", fontSize: 9, fontWeight: 700,
          textTransform: "uppercase", letterSpacing: "0.08em",
          cursor: "pointer", borderRadius: 4,
          background: "rgba(255,255,255,0.05)",
          border: "1px solid rgba(255,255,255,0.08)",
          color: "var(--t3)",
          transition: "background 0.1s",
        }}
        title={`Set every student's ${subject} grade`}
      >
        Set all ▾
      </button>
      {open && (
        <div
          style={{
            position: "absolute", top: "100%", right: 0, marginTop: 4,
            background: "rgba(10,10,30,0.95)",
            border: "1px solid rgba(255,255,255,0.1)",
            borderRadius: 8,
            boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
            padding: 4, zIndex: 30, minWidth: 150,
            backdropFilter: "blur(8px)",
          }}
        >
          <DropItem onClick={() => { onPick(0); setOpen(false); }}>K — Kindergarten</DropItem>
          {Array.from({ length: 12 }).map((_, i) => (
            <DropItem key={i + 1} onClick={() => { onPick(i + 1); setOpen(false); }}>
              {gradeLabel(i + 1)} grade
            </DropItem>
          ))}
        </div>
      )}
    </div>
  );
}

function DropItem({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: "block", width: "100%", textAlign: "left",
        padding: "5px 10px", fontSize: 11, fontWeight: 600,
        color: "var(--t2)", background: "transparent",
        border: "none", cursor: "pointer", borderRadius: 5,
        transition: "background 0.1s",
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(124,58,237,0.18)")}
      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
    >
      {children}
    </button>
  );
}
