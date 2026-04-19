import React, { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { api } from "../lib/api.ts";
import { useAuth } from "../lib/auth.tsx";
import { useTheme } from "../lib/theme.tsx";
import { CheckCircle2, MessageSquare, Clock, Bot, User as UserIcon, Eye } from "lucide-react";

type Scope = "today" | "week" | "all";

type Row = {
  assignment_id: string;
  title: string;
  description?: string | null;
  due_date?: string | null;
  scheduled_date?: string | null;
  subject?: string | null;
  submission_id?: string | null;
  submitted_at?: string | null;
  numeric_grade?: number | null;
  feedback?: string | null;
  ai_grade?: number | null;
  human_grade_pass: boolean | null;
  human_grade_feedback?: string | null;
  graded_by?: string | null;
  graded_at?: string | null;
  status: "graded" | "ai_only" | "needs_review" | "pending";
};

type StudentCard = {
  id: string;
  name: string;
  email?: string;
  class_id: string;
  class_name?: string;
  reading_grade_level?: number | null;
  math_grade_level?: number | null;
  writing_grade_level?: number | null;
};

const SUBJECT_ICON: Record<string, string> = {
  math: "🔢", reading: "📖", writing: "✏️", spelling: "🔤", sel: "💛",
  daily_news: "📰", review: "🔁", science: "🔬", social_studies: "🌎",
};
function subjectIcon(s: string | null | undefined): string {
  if (!s) return "📝";
  return SUBJECT_ICON[s] || "📝";
}

function StatusBadge({ status }: { status: Row["status"] }) {
  const cfg: Record<Row["status"], { label: string; icon: React.ReactNode; cls: string }> = {
    graded: { label: "Graded", icon: <CheckCircle2 size={12} />, cls: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" },
    ai_only: { label: "AI graded", icon: <Bot size={12} />, cls: "bg-violet-500/15 text-violet-400 border-violet-500/30" },
    needs_review: { label: "Needs review", icon: <UserIcon size={12} />, cls: "bg-amber-500/15 text-amber-400 border-amber-500/30" },
    pending: { label: "Pending", icon: <Clock size={12} />, cls: "bg-white/5 text-white/40 border-white/10" },
  };
  const c = cfg[status];
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full border ${c.cls}`}>
      {c.icon}{c.label}
    </span>
  );
}

export default function TeacherGradebook() {
  const { studentId: studentIdFromUrl } = useParams<{ studentId?: string }>();
  const { user } = useAuth();
  const { theme } = useTheme();
  const navigate = useNavigate();
  const dk = theme === "dark";

  // All students across the teacher's classes
  const [students, setStudents] = useState<StudentCard[]>([]);
  // Per-student "week ungraded count" for badge
  const [ungradedCounts, setUngradedCounts] = useState<Record<string, number>>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Assignments table state (selected student)
  const [rows, setRows] = useState<Row[]>([]);
  const [scope, setScope] = useState<Scope>("week");
  const [ungradedOnly, setUngradedOnly] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [feedbackDraft, setFeedbackDraft] = useState<Record<string, string>>({});
  const [feedbackOpenFor, setFeedbackOpenFor] = useState<string | null>(null);
  // Expanded work view (per assignment_id). Fetches full submission + assignment
  // content so teacher sees questions paired with the student's actual answers.
  const [workOpenFor, setWorkOpenFor] = useState<string | null>(null);
  const [workCache, setWorkCache] = useState<Record<string, any>>({});
  const [workLoading, setWorkLoading] = useState<string | null>(null);

  const toggleWork = async (row: Row) => {
    if (workOpenFor === row.assignment_id) { setWorkOpenFor(null); return; }
    setWorkOpenFor(row.assignment_id);
    if (!row.submission_id) return; // nothing to fetch
    if (workCache[row.submission_id]) return;
    setWorkLoading(row.submission_id);
    try {
      const sub = await api.getSubmission(row.submission_id);
      setWorkCache((p) => ({ ...p, [row.submission_id!]: sub }));
    } catch (e: any) {
      setError(e?.message || "Failed to load submission");
    } finally {
      setWorkLoading(null);
    }
  };

  // Auth guard
  useEffect(() => {
    if (user && user.role !== "teacher" && user.role !== "admin") {
      navigate("/", { replace: true });
    }
  }, [user, navigate]);

  // Load every student across teacher's classes + compute ungraded counts
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const classes = await api.getClasses();
        const allStudents: StudentCard[] = [];
        for (const c of classes || []) {
          const list = await api.getStudents(c.id).catch(() => [] as any[]);
          for (const s of (list || [])) {
            allStudents.push({
              id: s.id,
              name: s.name,
              email: s.email,
              class_id: c.id,
              class_name: c.name,
              reading_grade_level: s.reading_grade_level,
              math_grade_level: s.math_grade_level,
              writing_grade_level: s.writing_grade_level,
            });
          }
        }
        if (cancelled) return;
        setStudents(allStudents);

        // Default-select: URL param wins, else first student
        const firstId = studentIdFromUrl && allStudents.some((s) => s.id === studentIdFromUrl)
          ? studentIdFromUrl
          : allStudents[0]?.id ?? null;
        setSelectedId(firstId);

        // Per-student ungraded (week) counts — fire in parallel, don't block UI
        const countPromises = allStudents.map(async (s) => {
          try {
            const rows = await api.getStudentAssignments(s.id, "week");
            const n = (rows || []).filter((r: any) => r.status === "needs_review" || r.status === "ai_only").length;
            return [s.id, n] as const;
          } catch { return [s.id, 0] as const; }
        });
        const entries = await Promise.all(countPromises);
        if (!cancelled) setUngradedCounts(Object.fromEntries(entries));
      } catch (e: any) {
        if (!cancelled) setError(e?.message || "Failed to load students");
      }
    })();
    return () => { cancelled = true; };
  // Only load students once per user session; URL param only picks default
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectedStudent = useMemo(
    () => students.find((s) => s.id === selectedId) || null,
    [students, selectedId],
  );

  const loadRows = async (sid: string, sc: Scope) => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.getStudentAssignments(sid, sc);
      setRows(Array.isArray(data) ? data : []);
    } catch (e: any) {
      setError(e?.message || "Failed to load");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { if (selectedId) loadRows(selectedId, scope); }, [selectedId, scope]);

  // Keep URL in sync so links to /teacher/gradebook/:id still work as permalinks
  useEffect(() => {
    if (!selectedId) return;
    if (studentIdFromUrl !== selectedId) {
      navigate(`/teacher/gradebook/${selectedId}`, { replace: true });
    }
  }, [selectedId, studentIdFromUrl, navigate]);

  const visibleRows = useMemo(() => {
    if (!ungradedOnly) return rows;
    return rows.filter((r) => r.status === "needs_review" || r.status === "ai_only");
  }, [rows, ungradedOnly]);

  const totals = useMemo(() => {
    const submitted = rows.filter((r) => !!r.submission_id).length;
    const humanGraded = rows.filter((r) => r.status === "graded").length;
    const needsReview = rows.filter((r) => r.status === "needs_review" || r.status === "ai_only").length;
    return { total: rows.length, submitted, humanGraded, needsReview };
  }, [rows]);

  const doGrade = async (row: Row, passed: boolean, feedback?: string) => {
    if (!selectedId) return;
    setSavingId(row.assignment_id);
    try {
      const res = await api.humanGradeAssignment(row.assignment_id, selectedId, passed, feedback);
      setRows((prev) => prev.map((r) => {
        if (r.assignment_id !== row.assignment_id) return r;
        const sub = res.submission || {};
        return {
          ...r,
          submission_id: sub.id || r.submission_id,
          submitted_at: sub.submitted_at || r.submitted_at,
          human_grade_pass: passed,
          human_grade_feedback:
            typeof feedback === "string" ? feedback : r.human_grade_feedback,
          graded_by: sub.graded_by || r.graded_by,
          graded_at: sub.graded_at || new Date().toISOString(),
          status: "graded",
        };
      }));
      // Decrement the student's ungraded badge if the row was previously ungraded
      const wasUngraded = row.status === "needs_review" || row.status === "ai_only";
      if (wasUngraded) {
        setUngradedCounts((prev) => ({
          ...prev,
          [selectedId]: Math.max(0, (prev[selectedId] ?? 0) - 1),
        }));
      }
      setFeedbackOpenFor(null);
    } catch (e: any) {
      setError(e?.message || "Failed to save grade");
    } finally {
      setSavingId(null);
    }
  };

  return (
    <div className="flex h-[calc(100vh-56px)] overflow-hidden animate-fade-in" style={{ background: "var(--bg)" }}>
      {/* ── Left sidebar — student list ── */}
      <aside
        className="flex-shrink-0 flex flex-col overflow-hidden border-r"
        style={{ width: 240, background: "var(--bg-surface)", borderColor: "rgba(255,255,255,0.06)" }}
      >
        {/* Sidebar header */}
        <div className="px-4 pt-4 pb-3 border-b" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
          <div className="text-[11px] font-bold uppercase tracking-widest text-t3 mb-0.5">📓 Gradebook</div>
          {selectedStudent?.class_name && (
            <div className="text-xs text-t3 truncate">{selectedStudent.class_name}</div>
          )}
        </div>

        {/* Student list */}
        <div className="flex-1 overflow-y-auto py-1">
          {students.length === 0 && (
            <div className="px-4 py-6 text-xs text-t3">Loading students…</div>
          )}
          {students.map((s) => {
            const active = s.id === selectedId;
            const ungraded = ungradedCounts[s.id] ?? 0;
            return (
              <button
                key={s.id}
                onClick={() => setSelectedId(s.id)}
                className={`w-full flex items-center gap-2.5 px-3 py-2.5 text-left transition-colors cursor-pointer relative
                  ${active
                    ? "bg-indigo-500/15 text-t1"
                    : "text-t2 hover:bg-white/[0.04]"}`}
                style={active ? { boxShadow: "inset 3px 0 0 #6366f1" } : undefined}
                title={s.email || s.name}
              >
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-bold flex-shrink-0
                  ${active ? "bg-gradient-to-br from-indigo-500 to-violet-600" : "bg-gradient-to-br from-slate-600 to-slate-700"}`}>
                  {(s.name || "?").charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold truncate leading-tight">{s.name}</div>
                  <div className="text-[10px] text-t3 truncate">{s.class_name}</div>
                </div>
                {ungraded > 0 && (
                  <span className="flex-shrink-0 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[9px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                    {ungraded}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Sidebar footer nav */}
        <div className="px-4 py-3 border-t" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
          <Link to="/" className="text-[11px] text-t3 hover:text-t1 underline-offset-2 hover:underline">← Back to home</Link>
        </div>
      </aside>

      {/* ── Right panel ── */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top bar */}
        <div
          className="flex-shrink-0 flex items-center justify-between gap-4 px-5 py-3 border-b"
          style={{ background: "var(--bg-surface)", borderColor: "rgba(255,255,255,0.06)" }}
        >
          {/* Student name + stats */}
          <div className="flex items-center gap-4 min-w-0">
            <div className="min-w-0">
              <h1 className="text-lg font-extrabold text-t1 leading-tight truncate">
                {selectedStudent?.name || "Select a student"}
              </h1>
              {selectedStudent?.class_name && (
                <div className="text-[11px] text-t3">{selectedStudent.class_name}</div>
              )}
            </div>
            <div className="hidden sm:flex items-center gap-3">
              <StatPill label="Total" value={totals.total} />
              <StatPill label="Submitted" value={totals.submitted} color="emerald" />
              <StatPill label="Needs review" value={totals.needsReview} color={totals.needsReview > 0 ? "amber" : "gray"} />
            </div>
          </div>

          {/* Controls */}
          <div className="flex items-center gap-2 flex-shrink-0 flex-wrap">
            <div className="flex items-center rounded-lg border overflow-hidden" style={{ borderColor: "rgba(255,255,255,0.1)" }}>
              {(["today", "week", "all"] as Scope[]).map((s) => (
                <button
                  key={s}
                  onClick={() => setScope(s)}
                  className={`px-3 py-1.5 text-[11px] font-semibold transition-colors cursor-pointer
                    ${scope === s
                      ? "bg-indigo-500/20 text-indigo-300"
                      : "text-t3 hover:text-t2 hover:bg-white/[0.04]"}`}
                >
                  {s === "today" ? "Today" : s === "week" ? "Week" : "All"}
                </button>
              ))}
            </div>
            <label className="inline-flex items-center gap-1.5 text-[11px] text-t2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={ungradedOnly}
                onChange={(e) => setUngradedOnly(e.target.checked)}
                className="accent-violet-500"
              />
              Ungraded only
            </label>
          </div>
        </div>

        {error && (
          <div className="mx-5 mt-3 text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
            {error}
          </div>
        )}

        {/* ── Assignment table ── */}
        <div className="flex-1 overflow-auto">
          <table className="w-full text-sm border-collapse" style={{ minWidth: 680 }}>
            <thead>
              <tr
                className="sticky top-0 z-10 text-[10px] font-bold uppercase tracking-wider text-t3"
                style={{ background: "var(--bg-surface)", borderBottom: "1px solid rgba(255,255,255,0.06)" }}
              >
                <th className="text-left px-4 py-2.5 font-bold" style={{ minWidth: 200 }}>Assignment</th>
                <th className="text-left px-3 py-2.5 font-bold" style={{ width: 80 }}>Subject</th>
                <th className="text-left px-3 py-2.5 font-bold" style={{ width: 90 }}>Date</th>
                <th className="text-center px-3 py-2.5 font-bold" style={{ width: 70 }}>Score</th>
                <th className="text-left px-3 py-2.5 font-bold" style={{ width: 100 }}>Status</th>
                <th className="text-left px-3 py-2.5 font-bold" style={{ width: 80 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {!selectedId && (
                <tr>
                  <td colSpan={6} className="py-16 text-center text-t3 text-sm">
                    Select a student to view their assignments.
                  </td>
                </tr>
              )}
              {selectedId && loading && (
                <tr>
                  <td colSpan={6} className="py-16 text-center text-t3 text-sm">Loading…</td>
                </tr>
              )}
              {selectedId && !loading && visibleRows.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-16 text-center text-t3 text-sm">
                    {ungradedOnly ? "Everything is graded." : "No assignments in this range."}
                  </td>
                </tr>
              )}
              {selectedId && !loading && visibleRows.map((r, idx) => {
                const passKey = r.human_grade_pass;
                const isGradedPass = passKey === true;
                const isGradedFail = passKey === false;
                const saving = savingId === r.assignment_id;
                const dateText = r.scheduled_date || (r.due_date ? String(r.due_date).slice(0, 10) : "—");
                const fbOpen = feedbackOpenFor === r.assignment_id;
                const rowBg = idx % 2 === 1 ? "rgba(255,255,255,0.015)" : "transparent";
                return (
                  <React.Fragment key={r.assignment_id}>
                    <tr
                      className="group border-b transition-colors"
                      style={{
                        background: rowBg,
                        borderColor: "rgba(255,255,255,0.04)",
                        height: 36,
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(99,102,241,0.06)")}
                      onMouseLeave={(e) => (e.currentTarget.style.background = rowBg)}
                    >
                      <td className="px-4 py-1.5">
                        <div className="font-semibold text-t1 truncate max-w-xs leading-tight">{r.title}</div>
                        {r.human_grade_feedback && (
                          <div className="text-[10px] text-t3 italic truncate">"{r.human_grade_feedback}"</div>
                        )}
                      </td>
                      <td className="px-3 py-1.5">
                        <span className="text-base leading-none">{subjectIcon(r.subject)}</span>
                      </td>
                      <td className="px-3 py-1.5">
                        <span className="text-[11px] text-t3 font-mono tabular-nums">{dateText}</span>
                      </td>
                      <td className="px-3 py-1.5 text-center">
                        {r.numeric_grade != null ? (
                          <span className={`text-sm font-bold tabular-nums ${r.numeric_grade >= 70 ? "text-emerald-400" : "text-amber-400"}`}>
                            {r.numeric_grade}
                          </span>
                        ) : r.ai_grade != null ? (
                          <span className={`text-xs font-semibold ${r.ai_grade >= 70 ? "text-emerald-400" : "text-amber-400"}`}>
                            {r.ai_grade}%
                          </span>
                        ) : (
                          <span className="text-t3 text-xs">—</span>
                        )}
                      </td>
                      <td className="px-3 py-1.5">
                        <StatusBadge status={r.status} />
                      </td>
                      <td className="px-3 py-1.5">
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => toggleWork(r)}
                            className={`px-1.5 py-0.5 rounded text-[10px] font-bold border transition-colors cursor-pointer
                              ${workOpenFor === r.assignment_id
                                ? "bg-sky-500/20 border-sky-500/50 text-sky-300"
                                : "border-white/10 text-t3 hover:bg-white/[0.06] hover:text-t2"}`}
                            title={r.submission_id ? "View work" : "No submission"}
                            disabled={!r.submission_id}
                          >
                            <Eye size={10} className="inline" />
                          </button>
                          {isGradedPass ? (
                            <span className="text-emerald-400 text-xs font-bold px-1">✓</span>
                          ) : isGradedFail ? (
                            <span className="text-red-400 text-xs font-bold px-1">✗</span>
                          ) : (
                            <>
                              <button
                                onClick={() => doGrade(r, true, feedbackDraft[r.assignment_id])}
                                disabled={saving}
                                className="px-1.5 py-0.5 rounded text-[10px] font-bold border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10 transition-colors cursor-pointer disabled:opacity-50"
                                title="Pass"
                              >✓</button>
                              <button
                                onClick={() => doGrade(r, false, feedbackDraft[r.assignment_id])}
                                disabled={saving}
                                className="px-1.5 py-0.5 rounded text-[10px] font-bold border border-red-500/30 text-red-400 hover:bg-red-500/10 transition-colors cursor-pointer disabled:opacity-50"
                                title="Redo"
                              >✗</button>
                            </>
                          )}
                          <button
                            onClick={() => {
                              setFeedbackOpenFor(fbOpen ? null : r.assignment_id);
                              if (!fbOpen && !(r.assignment_id in feedbackDraft)) {
                                setFeedbackDraft((p) => ({ ...p, [r.assignment_id]: r.human_grade_feedback || "" }));
                              }
                            }}
                            className={`px-1.5 py-0.5 rounded text-[10px] font-bold border transition-colors cursor-pointer
                              ${fbOpen ? "bg-violet-500/20 border-violet-500/50 text-violet-300" : "border-white/10 text-t3 hover:bg-white/[0.06]"}`}
                            title="Feedback"
                          >
                            <MessageSquare size={10} className="inline" />
                          </button>
                        </div>
                      </td>
                    </tr>
                    {/* Work view expansion */}
                    {workOpenFor === r.assignment_id && (
                      <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                        <td colSpan={6} className="px-5 py-4" style={{ background: "rgba(255,255,255,0.02)" }}>
                          {!r.submission_id ? (
                            <p className="text-xs text-t3 italic">Student hasn't submitted yet.</p>
                          ) : workLoading === r.submission_id ? (
                            <p className="text-xs text-t3">Loading submission…</p>
                          ) : (
                            <SubmissionWorkView sub={workCache[r.submission_id]} dk={dk} />
                          )}
                        </td>
                      </tr>
                    )}
                    {/* Feedback expansion */}
                    {fbOpen && (
                      <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                        <td colSpan={6} className="px-5 py-3" style={{ background: "rgba(99,102,241,0.04)" }}>
                          <div className="flex gap-2 items-start">
                            <textarea
                              value={feedbackDraft[r.assignment_id] ?? ""}
                              onChange={(e) => setFeedbackDraft((p) => ({ ...p, [r.assignment_id]: e.target.value }))}
                              placeholder="Feedback for the student…"
                              className="flex-1 rounded-lg px-3 py-2 text-sm resize-y min-h-[52px] bg-white/[0.04] border border-white/[0.08] text-white"
                            />
                            <div className="flex flex-col gap-1">
                              <button
                                onClick={() => doGrade(r, true, feedbackDraft[r.assignment_id])}
                                disabled={saving}
                                className="px-3 py-1.5 rounded-lg text-xs font-bold bg-emerald-500/20 border border-emerald-500/40 text-emerald-200 hover:bg-emerald-500/30 disabled:opacity-50 cursor-pointer"
                              >Pass + save</button>
                              <button
                                onClick={() => doGrade(r, false, feedbackDraft[r.assignment_id])}
                                disabled={saving}
                                className="px-3 py-1.5 rounded-lg text-xs font-bold bg-red-500/20 border border-red-500/40 text-red-200 hover:bg-red-500/30 disabled:opacity-50 cursor-pointer"
                              >Redo + save</button>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, accent = "gray" }: { label: string; value: number; accent?: "gray" | "emerald" | "violet" | "amber" }) {
  const colors: Record<string, string> = {
    gray: "text-t1",
    emerald: "text-emerald-400",
    violet: "text-violet-400",
    amber: "text-amber-400",
  };
  return (
    <div className="flex flex-col items-end">
      <span className={`text-xl font-extrabold leading-none ${colors[accent]}`}>{value}</span>
      <span className="text-[10px] uppercase tracking-wider text-t3 mt-0.5">{label}</span>
    </div>
  );
}

function StatPill({ label, value, color = "gray" }: { label: string; value: number; color?: "gray" | "emerald" | "amber" }) {
  const cfg: Record<string, string> = {
    gray:    "bg-white/[0.06] text-t2",
    emerald: "bg-emerald-500/15 text-emerald-300",
    amber:   "bg-amber-500/15 text-amber-300",
  };
  return (
    <span className={`inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-full ${cfg[color]}`}>
      <span className="text-base font-extrabold tabular-nums leading-none">{value}</span>
      <span className="uppercase tracking-wider text-[9px] opacity-70">{label}</span>
    </span>
  );
}

// Inline viewer: renders question-by-question with the student's answer and a
// correctness marker when the assignment has an answer key. Falls back to a
// project-data dump for Scratch-style submissions.
function SubmissionWorkView({ sub, dk }: { sub: any; dk: boolean }) {
  if (!sub) return <p className="text-xs text-t3 italic">No submission data.</p>;
  const content = sub.assignment_content;
  const answers: Record<string, any> = sub.answers || {};
  const auto = sub.auto_grade_result;
  const when = sub.submitted_at ? new Date(sub.submitted_at).toLocaleString() : null;

  // Flatten content.sections[].questions[] so we can pair each with answers[idx]
  const questions: any[] = [];
  if (content?.sections) {
    for (const section of content.sections) {
      for (const q of (section.questions || [])) questions.push(q);
    }
  }

  const normalize = (s: any) => String(s ?? "").replace(/^[A-D]\.\s*/i, "").trim().toLowerCase();

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="text-[11px] uppercase tracking-wider text-t3 font-bold">Student's work</div>
        <div className="text-[11px] text-t3">
          {sub.student_name && <span>👤 {sub.student_name} · </span>}
          {when && <span>🕐 {when}</span>}
          {auto && <span> · AI {auto.score}%</span>}
        </div>
      </div>

      {questions.length > 0 ? (
        <div className="space-y-2">
          {questions.map((q, i) => {
            const ans = answers[String(i)] ?? answers[i as any];
            let correct: boolean | null = null;
            let correctOpt: string | undefined;
            if (q.type === "multiple_choice" && Array.isArray(q.options)) {
              const ci = q.correctIndex;
              if (ci !== undefined && ci !== null) {
                const idx = typeof ci === "string" ? parseInt(ci, 10) : Number(ci);
                correctOpt = isNaN(idx) ? undefined : q.options[idx];
              }
              if (!correctOpt && q.correctAnswer) correctOpt = String(q.correctAnswer);
              if (correctOpt !== undefined) correct = normalize(ans) === normalize(correctOpt);
            }
            return (
              <div key={i} className={`rounded-lg border p-3 ${dk ? "bg-white/[0.02] border-white/[0.06]" : "bg-white border-gray-200"}`}>
                <div className="flex items-start gap-2">
                  <span className="text-[10px] font-bold text-t3 mt-0.5">Q{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-t1">{q.text || `Question ${i + 1}`}</div>
                    {q.type === "multiple_choice" && Array.isArray(q.options) && (
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        {q.options.map((opt: string, oi: number) => {
                          const isStudent = normalize(opt) === normalize(ans);
                          const isKey = correctOpt !== undefined && normalize(opt) === normalize(correctOpt);
                          return (
                            <span
                              key={oi}
                              className={`text-[11px] px-2 py-1 rounded-md border ${
                                isStudent && isKey ? "bg-emerald-500/20 border-emerald-500/50 text-emerald-200 font-bold"
                                : isStudent ? "bg-red-500/15 border-red-500/40 text-red-300 font-bold"
                                : isKey ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300"
                                : dk ? "border-white/10 text-white/40" : "border-gray-200 text-gray-500"
                              }`}
                            >
                              {isStudent ? "▶ " : ""}{opt}{isKey ? " ✓" : ""}
                            </span>
                          );
                        })}
                      </div>
                    )}
                    {(q.type === "short_answer" || q.type === "fill_blank") && (
                      <div className={`mt-1.5 text-sm whitespace-pre-wrap rounded-md px-2 py-1.5 ${
                        ans ? (dk ? "bg-white/[0.04] text-white" : "bg-gray-100 text-gray-900")
                             : (dk ? "text-white/30 italic" : "text-gray-400 italic")
                      }`}>
                        {ans || "(no answer)"}
                      </div>
                    )}
                  </div>
                  {correct === true && <span className="text-xs font-bold text-emerald-400">✓</span>}
                  {correct === false && <span className="text-xs font-bold text-red-400">✗</span>}
                </div>
              </div>
            );
          })}
        </div>
      ) : auto?.checks ? (
        <div className="space-y-1">
          {auto.checks.map((c: any, i: number) => (
            <div key={i} className="text-xs flex items-start gap-2">
              <span className={c.passed ? "text-emerald-400" : "text-red-400"}>{c.passed ? "✓" : "✗"}</span>
              <span className="text-t1 font-semibold">{c.label}</span>
              <span className="text-t3">— {c.detail}</span>
            </div>
          ))}
        </div>
      ) : sub.project_id ? (
        <p className="text-xs text-t3 italic">Scratch project submission (ID {String(sub.project_id).slice(0, 8)}…). Open the project workspace to view blocks.</p>
      ) : (
        <p className="text-xs text-t3 italic">No answer data in this submission.</p>
      )}

      {sub.human_grade_feedback && (
        <div className="mt-2 text-xs rounded-lg border px-2 py-1.5"
             style={{ background: "rgba(139,92,246,0.08)", borderColor: "rgba(139,92,246,0.3)" }}>
          <span className="font-bold text-violet-300">Your feedback: </span>
          <span className="text-t2">{sub.human_grade_feedback}</span>
        </div>
      )}
    </div>
  );
}

// Kept as a named export so App.tsx's existing import still compiles. The
// standalone picker route is no longer used — /teacher/gradebook now renders
// the full single-page gradebook, so this just re-exports the default page.
export const GradebookStudentPicker = TeacherGradebook;
