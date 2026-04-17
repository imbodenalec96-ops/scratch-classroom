import React, { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { useTheme } from "../lib/theme.tsx";
import { api } from "../lib/api.ts";
import { GraduationCap, ChevronLeft, Save, Users } from "lucide-react";

/**
 * ClassGrades — per-student grade-level editor.
 * Teacher picks a class → sees every student with Reading / Math / Writing
 * grade dropdowns. Edits are optimistic; "Save all" flushes to server.
 * Also exposes a bulk "Set everyone to grade N" row.
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

  const showFlash = useCallback((t: string) => { setFlash(t); setTimeout(() => setFlash(null), 2500); }, []);

  useEffect(() => {
    api.getClasses().then(c => {
      setClasses(c);
      if (c.length > 0 && !selectedClassId) setSelectedClassId(c[0].id);
    }).catch(console.error);
  }, []);

  useEffect(() => {
    if (!selectedClassId) return;
    api.getClassGrades(selectedClassId).then(r => { setRows(r); setDirty({}); }).catch(() => setRows([]));
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
    showFlash(`✓ Saved ${toSave.length} students`);
  };

  // Bulk: "apply grade N to everyone in column" — per-subject
  const bulkApply = (subject: string, grade: number) => {
    if (!confirm(`Set every student's ${subject} grade to ${gradeLabel(grade)}?`)) return;
    setRows(prev => prev.map(r => ({ ...r, [`${subject}_grade`]: grade })));
    // Mark everyone dirty so Save All picks them up
    const d: Record<string, boolean> = {};
    for (const r of rows) d[r.id] = true;
    setDirty(d);
  };

  const selectedClass = classes.find(c => c.id === selectedClassId);
  const dirtyCount = Object.values(dirty).filter(Boolean).length;

  return (
    <div className="p-7 space-y-6 animate-page-enter max-w-5xl mx-auto">
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
            <ChevronLeft size={13}/> Back to dashboard
          </Link>
        </div>
      </header>

      {/* Flash toast */}
      {flash && (
        <div className="px-4 py-2 text-sm font-medium" style={{
          background: "color-mix(in srgb, var(--success) 12%, transparent)",
          color: "var(--success)",
          border: "1px solid color-mix(in srgb, var(--success) 30%, transparent)",
          borderLeft: "3px solid var(--success)",
          borderRadius: "var(--r-md)",
        }}>{flash}</div>
      )}

      {/* Class picker */}
      {classes.length > 0 && (
        <div className="card flex items-center gap-3 flex-wrap">
          <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-3)" }}>Class</span>
          {classes.map(c => (
            <button key={c.id} onClick={() => setSelectedClassId(c.id)}
              className="px-3 py-1.5 text-xs font-semibold border transition-colors cursor-pointer"
              style={{
                borderRadius: "var(--r-md)",
                background: selectedClassId === c.id ? "var(--accent-light)" : "transparent",
                color: selectedClassId === c.id ? "var(--text-accent)" : "var(--text-2)",
                borderColor: selectedClassId === c.id ? "var(--accent)" : "var(--border-md)",
              }}>{c.name}</button>
          ))}
        </div>
      )}

      {/* Grid */}
      <div className="card p-0 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: "var(--border)" }}>
          <h3 className="font-display text-xl" style={{ color: "var(--text-1)" }}>
            {selectedClass?.name || "Roster"}
            <span className="ml-3 text-xs font-sans font-normal" style={{ color: "var(--text-3)" }}>
              {rows.length} {rows.length === 1 ? "student" : "students"}
            </span>
          </h3>
          <button onClick={saveAll} disabled={dirtyCount === 0 || saving}
            className="btn-primary gap-1.5 text-xs">
            <Save size={13}/> {saving ? "Saving…" : dirtyCount > 0 ? `Save (${dirtyCount})` : "All saved"}
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
              <thead>
                <tr style={{ background: "var(--bg-muted)" }}>
                  <th style={thStyle}>Student</th>
                  <th style={thStyle}>
                    <div className="flex items-center justify-between">
                      <span>📖 Reading</span>
                      <QuickSet subject="reading" onPick={(g) => bulkApply("reading", g)} dk={dk} />
                    </div>
                  </th>
                  <th style={thStyle}>
                    <div className="flex items-center justify-between">
                      <span>🔢 Math</span>
                      <QuickSet subject="math" onPick={(g) => bulkApply("math", g)} dk={dk} />
                    </div>
                  </th>
                  <th style={thStyle}>
                    <div className="flex items-center justify-between">
                      <span>✏️ Writing</span>
                      <QuickSet subject="writing" onPick={(g) => bulkApply("writing", g)} dk={dk} />
                    </div>
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.id} style={{ borderTop: "1px solid var(--border)" }}>
                    <td style={{ padding: "10px 16px" }}>
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 flex items-center justify-center text-xs font-bold"
                          style={{ background: "var(--accent-light)", color: "var(--text-accent)", borderRadius: "var(--r-sm)" }}>
                          {(r.name || "?").slice(0, 1).toUpperCase()}
                        </div>
                        <div>
                          <div className="text-sm font-semibold" style={{ color: "var(--text-1)" }}>{r.name}</div>
                          <div className="text-[10px]" style={{ color: "var(--text-3)" }}>{r.email}</div>
                        </div>
                        {dirty[r.id] && (
                          <span className="stamp" style={{ marginLeft: 6 }}>Unsaved</span>
                        )}
                      </div>
                    </td>
                    <td style={{ padding: "10px 16px" }}>
                      <GradeSelect value={r.reading_grade} onChange={g => editGrade(r.id, "reading", g)} />
                    </td>
                    <td style={{ padding: "10px 16px" }}>
                      <GradeSelect value={r.math_grade} onChange={g => editGrade(r.id, "math", g)} />
                    </td>
                    <td style={{ padding: "10px 16px" }}>
                      <GradeSelect value={r.writing_grade} onChange={g => editGrade(r.id, "writing", g)} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Footer hint */}
      <div className="text-[11px]" style={{ color: "var(--text-3)" }}>
        <GraduationCap size={11} className="inline mr-1" />
        Grades drive the AI task generator. Two students in different grades will get different
        prompts on the same day, even in the same class.
      </div>
    </div>
  );
}

/* ── helpers ───────────────────────────────────────────── */

const thStyle: React.CSSProperties = {
  textAlign: "left",
  padding: "12px 16px",
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: "0.06em",
  textTransform: "uppercase",
  color: "var(--text-3)",
};

function gradeLabel(g: number): string {
  if (g === 0) return "K";
  const sufx = (n: number) => { const s = ["th","st","nd","rd"]; const v = n % 100; return n + (s[(v-20)%10] || s[v] || s[0]); };
  return `${sufx(g)}`;
}

function GradeSelect({ value, onChange }: { value: number; onChange: (g: number) => void }) {
  return (
    <select value={value} onChange={e => onChange(Number(e.target.value))} className="input text-sm py-1.5" style={{ width: 120 }}>
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
      <button onClick={() => setOpen(v => !v)}
        className="text-[10px] font-semibold normal-case tracking-normal px-2 py-0.5 cursor-pointer"
        style={{ color: "var(--text-3)", borderRadius: "var(--r-sm)" }}
        title={`Set every student's ${subject} grade`}>
        Set all ▾
      </button>
      {open && (
        <div style={{
          position: "absolute", top: "100%", right: 0, marginTop: 4,
          background: "var(--bg-surface)",
          border: "1px solid var(--border-md)",
          borderRadius: "var(--r-md)",
          boxShadow: "0 6px 16px rgba(0,0,0,0.12)",
          padding: 4, zIndex: 20, minWidth: 140,
        }}>
          <button onClick={() => { onPick(0); setOpen(false); }} style={menuItem}>K</button>
          {Array.from({ length: 12 }).map((_, i) => (
            <button key={i + 1} onClick={() => { onPick(i + 1); setOpen(false); }} style={menuItem}>{gradeLabel(i + 1)} grade</button>
          ))}
        </div>
      )}
    </div>
  );
}

const menuItem: React.CSSProperties = {
  display: "block", width: "100%", textAlign: "left",
  padding: "5px 10px", fontSize: 11, fontWeight: 600,
  color: "var(--text-2)", background: "transparent",
  border: "none", cursor: "pointer", borderRadius: "var(--r-sm)",
};
