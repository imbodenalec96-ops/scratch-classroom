import React, { useEffect, useMemo, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { api } from "../lib/api.ts";
import { useAuth } from "../lib/auth.tsx";
import { useTheme } from "../lib/theme.tsx";
import { CheckCircle2, XCircle, MessageSquare, Clock, Bot, User as UserIcon } from "lucide-react";

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
  const { studentId } = useParams<{ studentId: string }>();
  const { user } = useAuth();
  const { theme } = useTheme();
  const navigate = useNavigate();
  const dk = theme === "dark";

  const [student, setStudent] = useState<any | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [scope, setScope] = useState<Scope>("week");
  const [ungradedOnly, setUngradedOnly] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [feedbackDraft, setFeedbackDraft] = useState<Record<string, string>>({});
  const [feedbackOpenFor, setFeedbackOpenFor] = useState<string | null>(null);

  // Auth guard — teacher/admin only. Students who stumble on the URL get
  // bounced to their dashboard. (Route-level guard is in App.tsx too.)
  useEffect(() => {
    if (user && user.role !== "teacher" && user.role !== "admin") {
      navigate("/", { replace: true });
    }
  }, [user, navigate]);

  // Resolve student info — we don't have a direct getUser, so we pull from
  // the first class the current teacher/admin has that contains the student.
  useEffect(() => {
    if (!studentId) return;
    let cancelled = false;
    (async () => {
      try {
        const classes = await api.getClasses();
        for (const c of classes || []) {
          const students = await api.getStudents(c.id).catch(() => [] as any[]);
          const hit = (students || []).find((s: any) => s.id === studentId || s.user_id === studentId);
          if (hit) {
            if (cancelled) return;
            setStudent({ ...hit, class_id: c.id, class_name: c.name });
            return;
          }
        }
        if (!cancelled) setStudent({ id: studentId, name: "Unknown student" });
      } catch (e: any) {
        if (!cancelled) setError(e?.message || "Failed to load student");
      }
    })();
    return () => { cancelled = true; };
  }, [studentId]);

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

  useEffect(() => { if (studentId) loadRows(studentId, scope); }, [studentId, scope]);

  const visibleRows = useMemo(() => {
    if (!ungradedOnly) return rows;
    return rows.filter((r) => r.status === "needs_review" || r.status === "ai_only");
  }, [rows, ungradedOnly]);

  const totals = useMemo(() => {
    const weekRows = rows; // scope already applied
    const submitted = weekRows.filter((r) => !!r.submission_id).length;
    const humanGraded = weekRows.filter((r) => r.status === "graded").length;
    const needsReview = weekRows.filter((r) => r.status === "needs_review" || r.status === "ai_only").length;
    return { total: weekRows.length, submitted, humanGraded, needsReview };
  }, [rows]);

  const doGrade = async (row: Row, passed: boolean, feedback?: string) => {
    if (!studentId) return;
    setSavingId(row.assignment_id);
    try {
      const res = await api.humanGradeAssignment(row.assignment_id, studentId, passed, feedback);
      // Merge returned submission into local state without a full refetch.
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
      setFeedbackOpenFor(null);
    } catch (e: any) {
      setError(e?.message || "Failed to save grade");
    } finally {
      setSavingId(null);
    }
  };

  if (!studentId) {
    return <div className="p-8 text-t1">No student selected.</div>;
  }

  return (
    <div className="p-6 max-w-6xl mx-auto animate-fade-in">
      {/* ── Header card ── */}
      <div className={`rounded-2xl p-5 mb-5 border ${dk ? "bg-white/[0.02] border-white/[0.06]" : "bg-white border-gray-200"}`}>
        <div className="flex items-start gap-4 flex-wrap">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center text-white text-xl font-bold shadow-lg shadow-violet-600/20 flex-shrink-0">
            {(student?.name || "?").charAt(0).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-t3 mb-0.5">Gradebook</div>
            <h1 className="text-2xl font-extrabold text-t1 leading-tight">{student?.name || "Loading…"}</h1>
            <div className="text-xs text-t3 mt-1 flex flex-wrap gap-3">
              {student?.class_name && <span>📚 {student.class_name}</span>}
              {student?.email && <span>✉️ {student.email}</span>}
              {student?.reading_grade_level != null && <span>Reading G{student.reading_grade_level}</span>}
              {student?.math_grade_level != null && <span>Math G{student.math_grade_level}</span>}
              {student?.writing_grade_level != null && <span>Writing G{student.writing_grade_level}</span>}
            </div>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <Stat label="Assignments" value={totals.total} />
            <Stat label="Submitted" value={totals.submitted} accent="emerald" />
            <Stat label="Graded" value={totals.humanGraded} accent="violet" />
            <Stat label="Needs review" value={totals.needsReview} accent={totals.needsReview > 0 ? "amber" : "gray"} />
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
        {loading && (
          <div className="py-10 text-center text-t3 text-sm">Loading…</div>
        )}
        {!loading && visibleRows.length === 0 && (
          <div className="py-10 text-center text-t3 text-sm">
            {ungradedOnly ? "Everything's graded. 🎉" : "No assignments in this range."}
          </div>
        )}
        {!loading && visibleRows.map((r) => {
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
    gray: "text-t2",
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

// ── Student picker ─────────────────────────────────────────────
// Sidebar entry "Gradebook" opens here; user picks a class then a student,
// then we navigate to /teacher/gradebook/:studentId.
export function GradebookStudentPicker() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [classes, setClasses] = useState<any[]>([]);
  const [studentsByClass, setStudentsByClass] = useState<Record<string, any[]>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user || (user.role !== "teacher" && user.role !== "admin")) {
      navigate("/", { replace: true });
      return;
    }
    (async () => {
      try {
        const cls = await api.getClasses();
        setClasses(cls);
        const map: Record<string, any[]> = {};
        for (const c of cls) {
          try { map[c.id] = await api.getStudents(c.id); } catch { map[c.id] = []; }
        }
        setStudentsByClass(map);
      } finally {
        setLoading(false);
      }
    })();
  }, [user, navigate]);

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <h1 className="text-2xl font-extrabold mb-1 text-t1">Gradebook</h1>
      <p className="text-sm text-t3 mb-6">Pick a student to open their gradebook.</p>
      {loading ? (
        <p className="text-sm text-t3">Loading…</p>
      ) : classes.length === 0 ? (
        <p className="text-sm text-t3">You don't have any classes yet.</p>
      ) : (
        <div className="space-y-6">
          {classes.map((c) => (
            <div key={c.id} className="card">
              <h2 className="text-sm font-bold text-t1 mb-3 flex items-center gap-2">
                <span>{c.name}</span>
                <span className="text-xs font-normal text-t3">
                  ({(studentsByClass[c.id] || []).length} students)
                </span>
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {(studentsByClass[c.id] || []).map((s) => (
                  <Link
                    key={s.id}
                    to={`/teacher/gradebook/${s.id}`}
                    className="flex items-center gap-3 p-2.5 rounded-xl border border-white/5 bg-white/[0.02] hover:bg-white/[0.06] transition-colors"
                  >
                    <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-emerald-500 to-green-600 flex items-center justify-center text-white text-xs font-bold shadow">
                      {(s.name || "?").charAt(0)}
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-semibold truncate text-t1">{s.name}</div>
                      <div className="text-[11px] truncate text-t3">{s.email}</div>
                    </div>
                  </Link>
                ))}
                {(studentsByClass[c.id] || []).length === 0 && (
                  <p className="text-xs text-t3 col-span-full py-4 text-center">No students in this class.</p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
