import React, { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { api } from "../lib/api.ts";
import { useAuth } from "../lib/auth.tsx";
import { useTheme } from "../lib/theme.tsx";
import { CheckCircle2, MessageSquare, Clock, Bot, User as UserIcon } from "lucide-react";

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
    <div className="p-6 max-w-6xl mx-auto animate-fade-in">
      <div className="flex items-end justify-between mb-4 flex-wrap gap-2">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-wider text-t3 mb-0.5">Gradebook</div>
          <h1 className="text-2xl font-extrabold text-t1 leading-tight">
            {selectedStudent?.name || "Pick a student"}
          </h1>
          <div className="text-xs text-t3 mt-1 flex flex-wrap gap-3">
            {selectedStudent?.class_name && <span>📚 {selectedStudent.class_name}</span>}
            {selectedStudent?.email && <span>✉️ {selectedStudent.email}</span>}
            {selectedStudent?.reading_grade_level != null && <span>Reading G{selectedStudent.reading_grade_level}</span>}
            {selectedStudent?.math_grade_level != null && <span>Math G{selectedStudent.math_grade_level}</span>}
            {selectedStudent?.writing_grade_level != null && <span>Writing G{selectedStudent.writing_grade_level}</span>}
          </div>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <Stat label="Assignments" value={totals.total} />
          <Stat label="Submitted" value={totals.submitted} accent="emerald" />
          <Stat label="Graded" value={totals.humanGraded} accent="violet" />
          <Stat label="Needs review" value={totals.needsReview} accent={totals.needsReview > 0 ? "amber" : "gray"} />
        </div>
      </div>

      {/* ── Student row ── */}
      <div className={`rounded-2xl border p-3 mb-5 ${dk ? "border-white/[0.06] bg-white/[0.02]" : "border-gray-200 bg-white"}`}>
        <div className="overflow-x-auto">
          <div className="flex gap-2 pb-1" style={{ minWidth: "min-content" }}>
            {students.length === 0 && (
              <div className="text-sm text-t3 py-4 px-2">Loading students…</div>
            )}
            {students.map((s) => {
              const active = s.id === selectedId;
              const ungraded = ungradedCounts[s.id] ?? 0;
              return (
                <button
                  key={s.id}
                  onClick={() => setSelectedId(s.id)}
                  className={`flex-shrink-0 flex items-center gap-2.5 px-3 py-2 rounded-xl border text-left transition-all cursor-pointer
                    ${active
                      ? "border-violet-500 bg-violet-500/20 text-violet-100 shadow-lg shadow-violet-600/20"
                      : dk
                        ? "border-white/5 bg-white/[0.02] text-white/70 hover:bg-white/[0.06] hover:border-white/10"
                        : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50 hover:border-gray-300"}`}
                  title={s.email || s.name}
                >
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-white text-sm font-bold shadow-md flex-shrink-0
                    ${active ? "bg-gradient-to-br from-violet-500 to-indigo-600" : "bg-gradient-to-br from-emerald-500 to-green-600"}`}>
                    {(s.name || "?").charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-semibold truncate max-w-[140px]">{s.name}</div>
                    <div className="text-[10px] text-t3 truncate max-w-[140px]">{s.class_name}</div>
                  </div>
                  {ungraded > 0 && (
                    <span
                      className="flex-shrink-0 inline-flex items-center justify-center min-w-[22px] h-[22px] px-1.5 rounded-full text-[10px] font-bold bg-amber-500/25 text-amber-300 border border-amber-500/40"
                      title={`${ungraded} ungraded this week`}
                    >
                      {ungraded}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── Controls ── */}
      <div className="flex items-center gap-2 flex-wrap mb-4">
        {(["today", "week", "all"] as Scope[]).map((s) => (
          <button
            key={s}
            onClick={() => setScope(s)}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-colors cursor-pointer
              ${scope === s
                ? "border-violet-500 bg-violet-500/20 text-violet-200"
                : dk ? "border-white/10 text-white/50 hover:border-violet-500/40" : "border-gray-200 text-gray-500 hover:border-violet-300"}`}
          >
            {s === "today" ? "Today" : s === "week" ? "This week" : "All time"}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-2">
          <label className="inline-flex items-center gap-2 text-xs text-t2 cursor-pointer">
            <input
              type="checkbox"
              checked={ungradedOnly}
              onChange={(e) => setUngradedOnly(e.target.checked)}
              className="accent-violet-500"
            />
            Ungraded only
          </label>
          <Link to="/" className="text-xs text-t3 hover:text-t1 underline-offset-2 hover:underline">← Back</Link>
        </div>
      </div>

      {error && (
        <div className="mb-3 text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2">
          {error}
        </div>
      )}

      {/* ── Table ── */}
      <div className={`rounded-2xl border overflow-hidden ${dk ? "border-white/[0.06] bg-white/[0.02]" : "border-gray-200 bg-white"}`}>
        <div className={`grid grid-cols-[110px_36px_1fr_70px_70px_120px_200px] gap-3 px-4 py-2.5 text-[10px] font-bold uppercase tracking-wider border-b ${dk ? "text-white/40 border-white/5" : "text-gray-400 border-gray-100"}`}>
          <div>Date</div>
          <div></div>
          <div>Title</div>
          <div>AI</div>
          <div>Human</div>
          <div>Status</div>
          <div>Actions</div>
        </div>
        {!selectedId && (
          <div className="py-10 text-center text-t3 text-sm">Select a student above to see their assignments.</div>
        )}
        {selectedId && loading && (
          <div className="py-10 text-center text-t3 text-sm">Loading…</div>
        )}
        {selectedId && !loading && visibleRows.length === 0 && (
          <div className="py-10 text-center text-t3 text-sm">
            {ungradedOnly ? "Everything's graded. 🎉" : "No assignments in this range."}
          </div>
        )}
        {selectedId && !loading && visibleRows.map((r) => {
          const passKey = r.human_grade_pass;
          const isGradedPass = passKey === true;
          const isGradedFail = passKey === false;
          const saving = savingId === r.assignment_id;
          const dateText = r.scheduled_date || (r.due_date ? String(r.due_date).slice(0, 10) : "—");
          const fbOpen = feedbackOpenFor === r.assignment_id;
          return (
            <div
              key={r.assignment_id}
              className={`grid grid-cols-[110px_36px_1fr_70px_70px_120px_200px] gap-3 px-4 py-3 text-sm items-center border-b last:border-b-0 ${dk ? "border-white/[0.04]" : "border-gray-100"}`}
            >
              <div className="text-xs text-t3 font-mono">{dateText}</div>
              <div className="text-xl">{subjectIcon(r.subject)}</div>
              <div className="min-w-0">
                <div className="font-semibold text-t1 truncate">{r.title}</div>
                {r.human_grade_feedback && (
                  <div className="text-[11px] text-t3 italic truncate">“{r.human_grade_feedback}”</div>
                )}
              </div>
              <div className="text-xs">
                {r.ai_grade != null ? (
                  <span className={`font-bold ${r.ai_grade >= 70 ? "text-emerald-400" : "text-amber-400"}`}>{r.ai_grade}%</span>
                ) : <span className="text-t3">—</span>}
              </div>
              <div className="text-xs">
                {isGradedPass ? <span className="font-bold text-emerald-400">Pass</span>
                  : isGradedFail ? <span className="font-bold text-red-400">Redo</span>
                  : <span className="text-t3">—</span>}
              </div>
              <div><StatusBadge status={r.status} /></div>
              <div className="flex items-center gap-1.5 flex-wrap">
                <button
                  onClick={() => doGrade(r, true, feedbackDraft[r.assignment_id])}
                  disabled={saving}
                  className={`px-2 py-1 rounded-lg text-[11px] font-bold border transition-colors cursor-pointer
                    ${isGradedPass ? "bg-emerald-500/20 border-emerald-500/50 text-emerald-300"
                      : "border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10"}
                    disabled:opacity-50 disabled:cursor-wait`}
                  title="Mark as passed"
                >
                  ✓ Pass
                </button>
                <button
                  onClick={() => doGrade(r, false, feedbackDraft[r.assignment_id])}
                  disabled={saving}
                  className={`px-2 py-1 rounded-lg text-[11px] font-bold border transition-colors cursor-pointer
                    ${isGradedFail ? "bg-red-500/20 border-red-500/50 text-red-300"
                      : "border-red-500/30 text-red-400 hover:bg-red-500/10"}
                    disabled:opacity-50 disabled:cursor-wait`}
                  title="Mark as needing a redo"
                >
                  ✗ Redo
                </button>
                <button
                  onClick={() => {
                    setFeedbackOpenFor(fbOpen ? null : r.assignment_id);
                    if (!fbOpen && !(r.assignment_id in feedbackDraft)) {
                      setFeedbackDraft((p) => ({ ...p, [r.assignment_id]: r.human_grade_feedback || "" }));
                    }
                  }}
                  className={`px-2 py-1 rounded-lg text-[11px] font-bold border transition-colors cursor-pointer
                    ${fbOpen ? "bg-violet-500/20 border-violet-500/50 text-violet-200"
                      : dk ? "border-white/15 text-white/60 hover:bg-white/5" : "border-gray-300 text-gray-500 hover:bg-gray-50"}`}
                  title="Leave feedback"
                >
                  <MessageSquare size={11} className="inline mr-0.5" /> Feedback
                </button>
              </div>
              {fbOpen && (
                <div className="col-span-7 mt-2 flex gap-2 items-start">
                  <textarea
                    value={feedbackDraft[r.assignment_id] ?? ""}
                    onChange={(e) =>
                      setFeedbackDraft((p) => ({ ...p, [r.assignment_id]: e.target.value }))
                    }
                    placeholder="Feedback for the student…"
                    className={`flex-1 rounded-xl px-3 py-2 text-sm resize-y min-h-[56px] ${
                      dk ? "bg-white/[0.04] border border-white/[0.08] text-white" : "bg-gray-50 border border-gray-200 text-gray-900"
                    }`}
                  />
                  <div className="flex flex-col gap-1">
                    <button
                      onClick={() => doGrade(r, true, feedbackDraft[r.assignment_id])}
                      disabled={saving}
                      className="px-3 py-1.5 rounded-lg text-xs font-bold bg-emerald-500/20 border border-emerald-500/40 text-emerald-200 hover:bg-emerald-500/30 disabled:opacity-50"
                    >
                      Pass + save
                    </button>
                    <button
                      onClick={() => doGrade(r, false, feedbackDraft[r.assignment_id])}
                      disabled={saving}
                      className="px-3 py-1.5 rounded-lg text-xs font-bold bg-red-500/20 border border-red-500/40 text-red-200 hover:bg-red-500/30 disabled:opacity-50"
                    >
                      Redo + save
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
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

// Kept as a named export so App.tsx's existing import still compiles. The
// standalone picker route is no longer used — /teacher/gradebook now renders
// the full single-page gradebook, so this just re-exports the default page.
export const GradebookStudentPicker = TeacherGradebook;
