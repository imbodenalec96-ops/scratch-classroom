import React, { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { api } from "../lib/api.ts";
import { useAuth } from "../lib/auth.tsx";
import { useTheme } from "../lib/theme.tsx";
import { MessageSquare, Eye, ChevronLeft, ChevronDown, ChevronRight, X, MoreHorizontal } from "lucide-react";

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
  human_grade_score?: number | null;
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
const SUBJECT_LABEL: Record<string, string> = {
  math: "Math", reading: "Reading", writing: "Writing", spelling: "Spelling", sel: "SEL",
  daily_news: "Daily News", review: "Review", science: "Science", social_studies: "Social Studies",
};
function subjectIcon(s: string | null | undefined): string {
  if (!s) return "📝";
  return SUBJECT_ICON[s] || "📝";
}
function subjectLabel(s: string | null | undefined): string {
  if (!s) return "Other";
  return SUBJECT_LABEL[s] || s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Status → { label, color, dotBg } for the consolidated Status column. */
function statusMeta(status: Row["status"], hasSubmission: boolean): {
  label: string; fg: string; bg: string; border: string;
} {
  if (status === "graded")       return { label: "Graded",       fg: "#34d399", bg: "rgba(52,211,153,0.12)", border: "rgba(52,211,153,0.28)" };
  if (status === "needs_review") return { label: "Needs review", fg: "#fbbf24", bg: "rgba(251,191,36,0.12)", border: "rgba(251,191,36,0.3)" };
  if (status === "ai_only")      return { label: "AI graded",    fg: "#a78bfa", bg: "rgba(124,58,237,0.14)", border: "rgba(124,58,237,0.35)" };
  if (hasSubmission)             return { label: "Submitted",    fg: "#93c5fd", bg: "rgba(59,130,246,0.12)", border: "rgba(59,130,246,0.28)" };
  return                                { label: "Not started",  fg: "rgba(255,255,255,0.38)", bg: "rgba(255,255,255,0.03)", border: "rgba(255,255,255,0.07)" };
}

function formatDueDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const s = String(iso);
  // Handles both "2026-04-24" and full ISO timestamps
  const match = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return s;
  const [, , mo, d] = match;
  const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const miNum = parseInt(mo, 10) - 1;
  if (miNum < 0 || miNum > 11) return s;
  return `${MONTHS[miNum]} ${parseInt(d, 10)}`;
}

/** Color-coded grade cell — maps score to green/yellow/red/gray */
function gradeCell(score: number | null | undefined, pass: boolean | null, status: Row["status"]): {
  bg: string; text: string; border: string; label: string;
} {
  if (status === "pending" || (score == null && pass == null)) {
    return { bg: "rgba(255,255,255,0.04)", text: "rgba(255,255,255,0.25)", border: "rgba(255,255,255,0.07)", label: "—" };
  }
  // Pass/fail from human grade
  if (pass === true)  return { bg: "rgba(52,211,153,0.15)",  text: "#34d399", border: "rgba(52,211,153,0.3)",  label: score != null ? `${score}` : "P" };
  if (pass === false) return { bg: "rgba(239,68,68,0.13)",   text: "#f87171", border: "rgba(239,68,68,0.28)",  label: score != null ? `${score}` : "R" };
  // Numeric score
  const s = score ?? 0;
  if (s >= 90) return { bg: "rgba(52,211,153,0.15)",  text: "#34d399", border: "rgba(52,211,153,0.3)",  label: `${s}` };
  if (s >= 80) return { bg: "rgba(52,211,153,0.10)",  text: "#6ee7b7", border: "rgba(52,211,153,0.2)",  label: `${s}` };
  if (s >= 70) return { bg: "rgba(251,191,36,0.13)",  text: "#fbbf24", border: "rgba(251,191,36,0.3)",  label: `${s}` };
  if (s >= 60) return { bg: "rgba(251,146,60,0.13)",  text: "#fb923c", border: "rgba(251,146,60,0.28)", label: `${s}` };
  return           { bg: "rgba(239,68,68,0.13)",   text: "#f87171", border: "rgba(239,68,68,0.28)",  label: `${s}` };
}

/* ── Letter → numeric map ── */
const LETTER_TO_SCORE: Record<string, number> = {
  "a+": 98, "a": 95, "a-": 92,
  "b+": 88, "b": 85, "b-": 82,
  "c+": 78, "c": 75, "c-": 72,
  "d+": 68, "d": 65, "d-": 62,
  "f": 50,
};

function parseGradeInput(raw: string): { score: number; passed: boolean } | null {
  const s = raw.trim().toLowerCase();
  if (!s) return null;
  if (s in LETTER_TO_SCORE) {
    const score = LETTER_TO_SCORE[s];
    return { score, passed: score >= 60 };
  }
  const n = Number(s);
  if (!isNaN(n) && n >= 0 && n <= 100) {
    return { score: Math.round(n), passed: Math.round(n) >= 60 };
  }
  return null;
}

export default function TeacherGradebook() {
  const { studentId: studentIdFromUrl } = useParams<{ studentId?: string }>();
  const { user } = useAuth();
  const { theme } = useTheme();
  const navigate = useNavigate();
  const dk = theme === "dark";

  const [students, setStudents] = useState<StudentCard[]>([]);
  const [ungradedCounts, setUngradedCounts] = useState<Record<string, number>>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const [rows, setRows] = useState<Row[]>([]);
  const [scope, setScope] = useState<Scope>("week");
  const [ungradedOnly, setUngradedOnly] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [feedbackDraft, setFeedbackDraft] = useState<Record<string, string>>({});
  const [feedbackOpenFor, setFeedbackOpenFor] = useState<string | null>(null);
  const [workOpenFor, setWorkOpenFor] = useState<string | null>(null);
  const [workCache, setWorkCache] = useState<Record<string, any>>({});
  const [workLoading, setWorkLoading] = useState<string | null>(null);

  // Feature N: grade inputs
  const [gradeInputs, setGradeInputs] = useState<Record<string, string>>({});

  // Feature O: assignment preview panel
  const [previewAssignment, setPreviewAssignment] = useState<Row | null>(null);

  // Collapsed subject groups (by subject key)
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});
  const toggleGroup = (key: string) =>
    setCollapsedGroups((p) => ({ ...p, [key]: !p[key] }));

  // Per-row overflow menu
  const [menuOpenFor, setMenuOpenFor] = useState<string | null>(null);

  const toggleWork = async (row: Row) => {
    if (workOpenFor === row.assignment_id) { setWorkOpenFor(null); return; }
    setWorkOpenFor(row.assignment_id);
    if (!row.submission_id) return;
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

  // Load submission into workCache for the preview panel
  const loadSubmissionForPreview = async (row: Row) => {
    if (!row.submission_id) return;
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

  useEffect(() => {
    if (user && user.role !== "teacher" && user.role !== "admin") {
      navigate("/", { replace: true });
    }
  }, [user, navigate]);

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
              id: s.id, name: s.name, email: s.email,
              class_id: c.id, class_name: c.name,
              reading_grade_level: s.reading_grade_level,
              math_grade_level: s.math_grade_level,
              writing_grade_level: s.writing_grade_level,
            });
          }
        }
        if (cancelled) return;
        setStudents(allStudents);
        const firstId = studentIdFromUrl && allStudents.some((s) => s.id === studentIdFromUrl)
          ? studentIdFromUrl : allStudents[0]?.id ?? null;
        setSelectedId(firstId);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectedStudent = useMemo(
    () => students.find((s) => s.id === selectedId) || null,
    [students, selectedId],
  );

  const loadRows = async (sid: string, sc: Scope) => {
    setLoading(true); setError(null);
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

  useEffect(() => {
    if (!selectedId) return;
    if (studentIdFromUrl !== selectedId) navigate(`/teacher/gradebook/${selectedId}`, { replace: true });
  }, [selectedId, studentIdFromUrl, navigate]);

  const visibleRows = useMemo(() => {
    if (!ungradedOnly) return rows;
    return rows.filter((r) => r.status === "needs_review" || r.status === "ai_only");
  }, [rows, ungradedOnly]);

  // Group by subject, preserving first-seen order
  const grouped = useMemo(() => {
    const order: string[] = [];
    const map: Record<string, Row[]> = {};
    for (const r of visibleRows) {
      const key = r.subject || "other";
      if (!(key in map)) { map[key] = []; order.push(key); }
      map[key].push(r);
    }
    return order.map((key) => ({ key, rows: map[key] }));
  }, [visibleRows]);

  const totals = useMemo(() => {
    const submitted  = rows.filter((r) => !!r.submission_id).length;
    const humanGraded= rows.filter((r) => r.status === "graded").length;
    const needsReview= rows.filter((r) => r.status === "needs_review" || r.status === "ai_only").length;
    return { total: rows.length, submitted, humanGraded, needsReview };
  }, [rows]);

  // Feature N: updated doGrade accepts optional score
  const doGrade = async (row: Row, passed: boolean, feedback?: string, score?: number) => {
    if (!selectedId) return;
    setSavingId(row.assignment_id);
    try {
      const res = await api.humanGradeAssignment(row.assignment_id, selectedId, passed, feedback, score);
      setRows((prev) => prev.map((r) => {
        if (r.assignment_id !== row.assignment_id) return r;
        const sub = res.submission || {};
        return {
          ...r,
          submission_id: sub.id || r.submission_id,
          submitted_at: sub.submitted_at || r.submitted_at,
          human_grade_pass: passed,
          human_grade_score: score ?? r.human_grade_score,
          human_grade_feedback: typeof feedback === "string" ? feedback : r.human_grade_feedback,
          graded_by: sub.graded_by || r.graded_by,
          graded_at: sub.graded_at || new Date().toISOString(),
          status: "graded",
        };
      }));
      const wasUngraded = row.status === "needs_review" || row.status === "ai_only";
      if (wasUngraded) {
        setUngradedCounts((prev) => ({ ...prev, [selectedId]: Math.max(0, (prev[selectedId] ?? 0) - 1) }));
      }
      setFeedbackOpenFor(null);
      // Update preview panel row if open
      if (previewAssignment?.assignment_id === row.assignment_id) {
        setPreviewAssignment((prev) => prev ? {
          ...prev,
          human_grade_pass: passed,
          human_grade_score: score ?? prev.human_grade_score,
          human_grade_feedback: typeof feedback === "string" ? feedback : prev.human_grade_feedback,
          status: "graded",
        } : null);
      }
    } catch (e: any) {
      setError(e?.message || "Failed to save grade");
    } finally {
      setSavingId(null);
    }
  };

  // Feature N: handle grade input commit (Enter or blur)
  const commitGradeInput = (row: Row) => {
    const raw = gradeInputs[row.assignment_id];
    if (raw === undefined || raw.trim() === "") return;
    const parsed = parseGradeInput(raw);
    if (!parsed) return;
    doGrade(row, parsed.passed, feedbackDraft[row.assignment_id], parsed.score);
  };

  /* ── Styles ── */
  const surfaceBg  = "rgba(255,255,255,0.03)";
  const borderCol  = "rgba(255,255,255,0.07)";
  const headerBg   = "rgba(255,255,255,0.045)";
  const raisedBg   = "rgba(255,255,255,0.06)";

  return (
    <div
      className="flex h-[calc(100vh-56px)] overflow-hidden animate-fade-in"
      style={{ background: "var(--bg)", position: "relative" }}
    >
      {/* ── Left sidebar — student roster ── */}
      <aside
        className="flex-shrink-0 flex flex-col overflow-hidden"
        style={{
          width: 220,
          background: surfaceBg,
          borderRight: `1px solid ${borderCol}`,
        }}
      >
        {/* Sidebar header */}
        <div
          className="px-4 pt-4 pb-3"
          style={{ borderBottom: `1px solid ${borderCol}` }}
        >
          <div
            className="text-[10px] font-bold uppercase tracking-[0.14em] mb-1"
            style={{ color: "var(--t3)" }}
          >
            Gradebook
          </div>
          <div className="text-xs font-semibold" style={{ color: "var(--t2)" }}>
            Student roster
          </div>
        </div>

        {/* Student list */}
        <div className="flex-1 overflow-y-auto">
          {students.length === 0 && (
            <div className="px-4 py-8 text-xs" style={{ color: "var(--t3)" }}>
              Loading…
            </div>
          )}
          {students.map((s) => {
            const active   = s.id === selectedId;
            const ungraded = ungradedCounts[s.id] ?? 0;
            return (
              <button
                key={s.id}
                onClick={() => setSelectedId(s.id)}
                title={s.email || s.name}
                style={{
                  width: "100%",
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "8px 12px",
                  background: active ? "rgba(124,58,237,0.18)" : "transparent",
                  borderLeft: active ? "3px solid #7c3aed" : "3px solid transparent",
                  cursor: "pointer",
                  textAlign: "left",
                  transition: "background 0.12s",
                }}
                onMouseEnter={(e) => {
                  if (!active) (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.04)";
                }}
                onMouseLeave={(e) => {
                  if (!active) (e.currentTarget as HTMLElement).style.background = "transparent";
                }}
              >
                <div
                  style={{
                    width: 28, height: 28, flexShrink: 0, borderRadius: 4,
                    background: active
                      ? "linear-gradient(135deg,#7c3aed,#6d28d9)"
                      : "rgba(255,255,255,0.08)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    color: active ? "white" : "rgba(255,255,255,0.5)",
                    fontSize: 11, fontWeight: 700,
                  }}
                >
                  {(s.name || "?").charAt(0).toUpperCase()}
                </div>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div
                    style={{
                      fontSize: 12, fontWeight: active ? 700 : 500,
                      color: active ? "var(--t1)" : "var(--t2)",
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    }}
                  >
                    {s.name}
                  </div>
                  <div style={{ fontSize: 10, color: "var(--t3)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {s.class_name}
                  </div>
                </div>
                {ungraded > 0 && (
                  <span
                    style={{
                      flexShrink: 0, minWidth: 16, height: 16, padding: "0 4px",
                      borderRadius: 99, fontSize: 9, fontWeight: 800,
                      display: "inline-flex", alignItems: "center", justifyContent: "center",
                      background: "rgba(251,191,36,0.2)", color: "#fbbf24",
                      border: "1px solid rgba(251,191,36,0.35)",
                    }}
                  >
                    {ungraded}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Sidebar footer */}
        <div className="px-4 py-3" style={{ borderTop: `1px solid ${borderCol}` }}>
          <Link to="/" className="flex items-center gap-1 text-[11px]" style={{ color: "var(--t3)" }}>
            <ChevronLeft size={11} /> Back to home
          </Link>
        </div>
      </aside>

      {/* ── Right panel ── */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* ── Top toolbar ── */}
        <div
          className="flex-shrink-0 flex items-center justify-between gap-4 px-4 py-2.5"
          style={{
            background: raisedBg,
            borderBottom: `1px solid ${borderCol}`,
            minHeight: 46,
          }}
        >
          {/* Student name + stats */}
          <div className="flex items-center gap-4 min-w-0">
            <div className="min-w-0">
              <span
                className="font-bold text-sm"
                style={{ color: "var(--t1)" }}
              >
                {selectedStudent?.name || "Select a student"}
              </span>
              {selectedStudent?.class_name && (
                <span
                  className="ml-2 text-[11px]"
                  style={{ color: "var(--t3)" }}
                >
                  {selectedStudent.class_name}
                </span>
              )}
            </div>
            {/* Stat pills */}
            <div className="hidden sm:flex items-center gap-2">
              <StatPill label="Total"        value={totals.total} />
              <StatPill label="Submitted"    value={totals.submitted}    color="emerald" />
              <StatPill label="Needs review" value={totals.needsReview}  color={totals.needsReview > 0 ? "amber" : "gray"} />
            </div>
          </div>

          {/* Controls */}
          <div className="flex items-center gap-2 flex-shrink-0">
            <div
              className="flex items-center overflow-hidden"
              style={{ border: `1px solid ${borderCol}`, borderRadius: 6 }}
            >
              {(["today", "week", "all"] as Scope[]).map((s) => (
                <button
                  key={s}
                  onClick={() => setScope(s)}
                  style={{
                    padding: "4px 10px",
                    fontSize: 11, fontWeight: 600,
                    cursor: "pointer",
                    background: scope === s ? "rgba(124,58,237,0.2)" : "transparent",
                    color: scope === s ? "#a78bfa" : "var(--t3)",
                    borderRight: s !== "all" ? `1px solid ${borderCol}` : "none",
                    transition: "background 0.12s",
                  }}
                >
                  {s === "today" ? "Today" : s === "week" ? "Week" : "All"}
                </button>
              ))}
            </div>
            <label
              className="inline-flex items-center gap-1.5 text-[11px] cursor-pointer select-none"
              style={{ color: "var(--t2)" }}
            >
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
          <div
            className="mx-4 mt-2 text-xs px-3 py-2 rounded"
            style={{
              color: "#f87171",
              background: "rgba(239,68,68,0.08)",
              border: "1px solid rgba(239,68,68,0.2)",
            }}
          >
            {error}
          </div>
        )}

        {/* ── Assignments table ── */}
        <div className="flex-1 overflow-auto" style={{ position: "relative" }}>
          {!selectedId && (
            <div className="flex items-center justify-center h-full" style={{ color: "var(--t3)" }}>
              <div className="text-sm">Select a student from the roster</div>
            </div>
          )}

          {selectedId && loading && (
            <div className="flex items-center justify-center h-full" style={{ color: "var(--t3)" }}>
              <div className="text-sm">Loading…</div>
            </div>
          )}

          {selectedId && !loading && visibleRows.length === 0 && (
            <div className="flex items-center justify-center h-full" style={{ color: "var(--t3)" }}>
              <div className="text-sm">
                {ungradedOnly ? "Everything is graded." : "No assignments in this range."}
              </div>
            </div>
          )}

          {selectedId && !loading && visibleRows.length > 0 && (
            <table
              style={{
                width: "100%",
                minWidth: 720,
                borderCollapse: "collapse",
                tableLayout: "fixed",
              }}
            >
              {/* ── Column widths ── */}
              <colgroup>
                <col /* Assignment (flex) */ />
                <col style={{ width: 130 }} /* Subject */ />
                <col style={{ width: 90 }}  /* Due */ />
                <col style={{ width: 140 }} /* Status */ />
                <col style={{ width: 78 }}  /* Grade */ />
                <col style={{ width: 120 }} /* Actions */ />
              </colgroup>

              {/* ── Header ── */}
              <thead>
                <tr>
                  {["Assignment", "Subject", "Due", "Status", "Grade", "Actions"].map((h, i) => (
                    <th
                      key={h}
                      style={{
                        position: "sticky", top: 0, zIndex: 20,
                        background: headerBg,
                        borderBottom: `1px solid ${borderCol}`,
                        padding: "10px 14px",
                        height: 40,
                        textAlign: i >= 4 ? "center" : "left",
                        fontSize: 10, fontWeight: 700,
                        letterSpacing: "0.1em", textTransform: "uppercase",
                        color: "var(--t3)",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>

              {/* ── Body: rows grouped by subject ── */}
              <tbody>
                {grouped.map(({ key: subjectKey, rows: groupRows }) => {
                  const collapsed = !!collapsedGroups[subjectKey];
                  return (
                    <React.Fragment key={subjectKey}>
                      {/* Subject group header */}
                      <tr>
                        <td
                          colSpan={6}
                          style={{
                            background: "rgba(255,255,255,0.025)",
                            borderTop: `1px solid ${borderCol}`,
                            borderBottom: `1px solid ${borderCol}`,
                            padding: "8px 12px",
                            cursor: "pointer",
                            userSelect: "none",
                          }}
                          onClick={() => toggleGroup(subjectKey)}
                        >
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            {collapsed
                              ? <ChevronRight size={13} style={{ color: "var(--t3)" }} />
                              : <ChevronDown  size={13} style={{ color: "var(--t3)" }} />}
                            <span style={{ fontSize: 14 }}>{subjectIcon(subjectKey)}</span>
                            <span style={{ fontSize: 12, fontWeight: 700, color: "var(--t2)", letterSpacing: "0.02em" }}>
                              {subjectLabel(subjectKey)}
                            </span>
                            <span style={{ fontSize: 11, color: "var(--t3)" }}>
                              · {groupRows.length} {groupRows.length === 1 ? "assignment" : "assignments"}
                            </span>
                          </div>
                        </td>
                      </tr>

                      {/* Rows within the group */}
                      {!collapsed && groupRows.map((r) => {
                        const savedScore    = r.human_grade_score ?? r.numeric_grade ?? r.ai_grade;
                        const cell          = gradeCell(savedScore, r.human_grade_pass, r.status);
                        const saving        = savingId === r.assignment_id;
                        const fbOpen        = feedbackOpenFor === r.assignment_id;
                        const wkOpen        = workOpenFor === r.assignment_id;
                        const menuOpen      = menuOpenFor === r.assignment_id;
                        const hasSub        = !!r.submission_id;
                        const status        = statusMeta(r.status, hasSub);
                        const notStarted    = r.status === "pending" && !hasSub;
                        const rowBg         = notStarted ? "transparent" : "transparent";
                        const rowOpacity    = notStarted ? 0.55 : 1;

                        const gradeInputVal = gradeInputs[r.assignment_id] !== undefined
                          ? gradeInputs[r.assignment_id]
                          : (savedScore != null ? String(savedScore) : "");

                        // Primary CTA depends on status
                        const needsAction = r.status === "needs_review" || r.status === "ai_only" || (hasSub && r.status !== "graded");
                        const primaryLabel = r.status === "graded" ? "Review" : needsAction ? "Grade" : hasSub ? "View" : "—";

                        const openPreview = () => {
                          setPreviewAssignment(r);
                          loadSubmissionForPreview(r);
                          if (!(r.assignment_id in feedbackDraft)) {
                            setFeedbackDraft((p) => ({ ...p, [r.assignment_id]: r.human_grade_feedback || "" }));
                          }
                        };

                        return (
                          <React.Fragment key={r.assignment_id}>
                            <tr
                              style={{
                                background: rowBg,
                                opacity: rowOpacity,
                                transition: "background 0.1s",
                              }}
                              onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(124,58,237,0.06)")}
                              onMouseLeave={(e) => (e.currentTarget.style.background = rowBg)}
                            >
                              {/* Assignment */}
                              <td
                                style={{
                                  padding: "10px 14px",
                                  borderBottom: `1px solid ${borderCol}`,
                                  overflow: "hidden",
                                }}
                              >
                                <button
                                  onClick={openPreview}
                                  title={`Preview: ${r.title}`}
                                  style={{
                                    background: "none", border: "none", padding: 0,
                                    cursor: "pointer", textAlign: "left",
                                    fontSize: 13, fontWeight: 600, color: "var(--t1)",
                                    maxWidth: "100%",
                                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                                    width: "100%",
                                  }}
                                  onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = "#a78bfa"; }}
                                  onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = "var(--t1)"; }}
                                >
                                  {r.title}
                                </button>
                              </td>

                              {/* Subject */}
                              <td
                                style={{
                                  padding: "10px 14px",
                                  borderBottom: `1px solid ${borderCol}`,
                                  fontSize: 12, color: "var(--t2)",
                                  whiteSpace: "nowrap",
                                  overflow: "hidden", textOverflow: "ellipsis",
                                }}
                              >
                                <span style={{ marginRight: 6 }}>{subjectIcon(r.subject)}</span>
                                {subjectLabel(r.subject)}
                              </td>

                              {/* Due */}
                              <td
                                style={{
                                  padding: "10px 14px",
                                  borderBottom: `1px solid ${borderCol}`,
                                  fontSize: 12, color: "var(--t3)",
                                  fontVariantNumeric: "tabular-nums",
                                  whiteSpace: "nowrap",
                                }}
                              >
                                {formatDueDate(r.scheduled_date || r.due_date)}
                              </td>

                              {/* Status */}
                              <td
                                style={{
                                  padding: "10px 14px",
                                  borderBottom: `1px solid ${borderCol}`,
                                }}
                              >
                                <span
                                  style={{
                                    display: "inline-flex", alignItems: "center", gap: 6,
                                    padding: "3px 8px", borderRadius: 99,
                                    background: status.bg, color: status.fg,
                                    border: `1px solid ${status.border}`,
                                    fontSize: 11, fontWeight: 700,
                                    whiteSpace: "nowrap",
                                  }}
                                >
                                  <span
                                    style={{
                                      width: 6, height: 6, borderRadius: 99,
                                      background: status.fg, flexShrink: 0,
                                    }}
                                  />
                                  {status.label}
                                </span>
                              </td>

                              {/* Grade */}
                              <td
                                style={{
                                  padding: "6px 10px",
                                  borderBottom: `1px solid ${borderCol}`,
                                  textAlign: "center",
                                }}
                              >
                                <input
                                  type="text"
                                  value={gradeInputVal}
                                  placeholder="—"
                                  onChange={(e) => setGradeInputs((p) => ({ ...p, [r.assignment_id]: e.target.value }))}
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter") {
                                      e.currentTarget.blur();
                                      commitGradeInput(r);
                                    }
                                    if (e.key === "Escape") {
                                      setGradeInputs((p) => {
                                        const next = { ...p };
                                        delete next[r.assignment_id];
                                        return next;
                                      });
                                      e.currentTarget.blur();
                                    }
                                  }}
                                  onBlur={() => commitGradeInput(r)}
                                  onFocus={() => {
                                    if (gradeInputs[r.assignment_id] === undefined) {
                                      setGradeInputs((p) => ({
                                        ...p,
                                        [r.assignment_id]: savedScore != null ? String(savedScore) : "",
                                      }));
                                    }
                                  }}
                                  style={{
                                    width: 56, height: 28, borderRadius: 5,
                                    background: cell.bg,
                                    color: cell.text,
                                    border: `1px solid ${cell.border}`,
                                    fontSize: 12, fontWeight: 800,
                                    fontVariantNumeric: "tabular-nums",
                                    letterSpacing: "-0.01em",
                                    textAlign: "center",
                                    outline: "none",
                                    cursor: "text",
                                  }}
                                />
                              </td>

                              {/* Actions — primary button + overflow */}
                              <td
                                style={{
                                  padding: "6px 10px",
                                  borderBottom: `1px solid ${borderCol}`,
                                  textAlign: "center",
                                  position: "relative",
                                }}
                              >
                                <div style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                                  <button
                                    onClick={openPreview}
                                    disabled={primaryLabel === "—"}
                                    style={{
                                      height: 28, padding: "0 12px",
                                      borderRadius: 5,
                                      background: needsAction
                                        ? "rgba(124,58,237,0.22)"
                                        : "rgba(255,255,255,0.06)",
                                      color: needsAction ? "#c4b5fd" : "var(--t2)",
                                      border: `1px solid ${needsAction ? "rgba(124,58,237,0.45)" : "rgba(255,255,255,0.1)"}`,
                                      fontSize: 11, fontWeight: 700,
                                      cursor: primaryLabel === "—" ? "not-allowed" : "pointer",
                                      opacity: primaryLabel === "—" ? 0.35 : 1,
                                      whiteSpace: "nowrap",
                                    }}
                                    title={primaryLabel === "—" ? "No submission yet" : `${primaryLabel} ${r.title}`}
                                  >
                                    {primaryLabel}
                                  </button>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setMenuOpenFor(menuOpen ? null : r.assignment_id);
                                    }}
                                    title="More actions"
                                    style={{
                                      width: 28, height: 28,
                                      display: "inline-flex", alignItems: "center", justifyContent: "center",
                                      background: menuOpen ? "rgba(124,58,237,0.18)" : "rgba(255,255,255,0.04)",
                                      border: `1px solid ${menuOpen ? "rgba(124,58,237,0.4)" : "rgba(255,255,255,0.1)"}`,
                                      borderRadius: 5,
                                      color: "var(--t2)",
                                      cursor: "pointer",
                                    }}
                                  >
                                    <MoreHorizontal size={13} />
                                  </button>
                                </div>

                                {menuOpen && (
                                  <div
                                    onMouseLeave={() => setMenuOpenFor(null)}
                                    style={{
                                      position: "absolute",
                                      top: "100%", right: 10,
                                      zIndex: 15,
                                      marginTop: 2,
                                      minWidth: 180,
                                      background: "rgba(22,22,28,0.98)",
                                      border: "1px solid rgba(255,255,255,0.12)",
                                      borderRadius: 6,
                                      boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
                                      padding: 4,
                                      textAlign: "left",
                                    }}
                                  >
                                    <MenuItem
                                      icon={<Eye size={12} />}
                                      label="View work inline"
                                      disabled={!hasSub}
                                      onClick={() => { setMenuOpenFor(null); toggleWork(r); }}
                                    />
                                    <MenuItem
                                      icon={<MessageSquare size={12} />}
                                      label="Quick feedback"
                                      onClick={() => {
                                        setMenuOpenFor(null);
                                        setFeedbackOpenFor(r.assignment_id);
                                        if (!(r.assignment_id in feedbackDraft)) {
                                          setFeedbackDraft((p) => ({ ...p, [r.assignment_id]: r.human_grade_feedback || "" }));
                                        }
                                      }}
                                    />
                                    <div style={{ height: 1, background: "rgba(255,255,255,0.08)", margin: "4px 0" }} />
                                    <MenuItem
                                      label="Mark pass"
                                      accent="emerald"
                                      disabled={saving}
                                      onClick={() => { setMenuOpenFor(null); doGrade(r, true, feedbackDraft[r.assignment_id]); }}
                                    />
                                    <MenuItem
                                      label="Mark redo"
                                      accent="red"
                                      disabled={saving}
                                      onClick={() => { setMenuOpenFor(null); doGrade(r, false, feedbackDraft[r.assignment_id]); }}
                                    />
                                  </div>
                                )}
                              </td>
                            </tr>

                            {/* Inline work view (opened from overflow menu) */}
                            {wkOpen && (
                              <tr>
                                <td colSpan={6} style={{ borderBottom: `1px solid ${borderCol}`, padding: "12px 16px", background: "rgba(255,255,255,0.02)" }}>
                                  {!r.submission_id ? (
                                    <p style={{ fontSize: 12, color: "var(--t3)", fontStyle: "italic" }}>Student hasn't submitted yet.</p>
                                  ) : workLoading === r.submission_id ? (
                                    <p style={{ fontSize: 12, color: "var(--t3)" }}>Loading submission…</p>
                                  ) : (
                                    <SubmissionWorkView sub={workCache[r.submission_id]} dk={dk} />
                                  )}
                                </td>
                              </tr>
                            )}

                            {/* Inline feedback drawer */}
                            {fbOpen && (
                              <tr>
                                <td colSpan={6} style={{ borderBottom: `1px solid ${borderCol}`, padding: "10px 16px", background: "rgba(124,58,237,0.04)" }}>
                                  <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                                    <textarea
                                      value={feedbackDraft[r.assignment_id] ?? ""}
                                      onChange={(e) => setFeedbackDraft((p) => ({ ...p, [r.assignment_id]: e.target.value }))}
                                      placeholder="Feedback for the student…"
                                      style={{
                                        flex: 1, borderRadius: 6, padding: "6px 10px",
                                        fontSize: 12, resize: "vertical", minHeight: 52,
                                        background: "rgba(255,255,255,0.04)",
                                        border: "1px solid rgba(255,255,255,0.08)",
                                        color: "var(--t1)",
                                        outline: "none",
                                      }}
                                    />
                                    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                                      <FeedbackSaveBtn color="emerald" disabled={saving} onClick={() => doGrade(r, true, feedbackDraft[r.assignment_id])}>
                                        Pass + save
                                      </FeedbackSaveBtn>
                                      <FeedbackSaveBtn color="red" disabled={saving} onClick={() => doGrade(r, false, feedbackDraft[r.assignment_id])}>
                                        Redo + save
                                      </FeedbackSaveBtn>
                                    </div>
                                  </div>
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        );
                      })}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* ── Feature O: Assignment preview panel ── */}
      {previewAssignment && (
        <AssignmentPreviewPanel
          row={previewAssignment}
          workCache={workCache}
          workLoading={workLoading}
          feedbackDraft={feedbackDraft}
          setFeedbackDraft={setFeedbackDraft}
          savingId={savingId}
          dk={dk}
          borderCol={borderCol}
          onClose={() => setPreviewAssignment(null)}
          onGrade={(passed, feedback, score) => doGrade(previewAssignment, passed, feedback, score)}
        />
      )}
    </div>
  );
}

/* ── Feature O: Preview panel component ─────────────────── */

function AssignmentPreviewPanel({
  row,
  workCache,
  workLoading,
  feedbackDraft,
  setFeedbackDraft,
  savingId,
  dk,
  borderCol,
  onClose,
  onGrade,
}: {
  row: Row;
  workCache: Record<string, any>;
  workLoading: string | null;
  feedbackDraft: Record<string, string>;
  setFeedbackDraft: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  savingId: string | null;
  dk: boolean;
  borderCol: string;
  onClose: () => void;
  onGrade: (passed: boolean, feedback?: string, score?: number) => void;
}) {
  const saving = savingId === row.assignment_id;
  const sub = row.submission_id ? workCache[row.submission_id] : null;
  const loadingThis = workLoading === row.submission_id;

  // Local grade input state for the panel
  const [panelGradeInput, setPanelGradeInput] = useState<string>(
    row.human_grade_score != null
      ? String(row.human_grade_score)
      : row.numeric_grade != null
      ? String(row.numeric_grade)
      : row.ai_grade != null
      ? String(row.ai_grade)
      : ""
  );
  const [panelGradeError, setPanelGradeError] = useState<string | null>(null);

  const handleSave = () => {
    const feedback = feedbackDraft[row.assignment_id] || "";
    if (panelGradeInput.trim()) {
      const parsed = parseGradeInput(panelGradeInput);
      if (!parsed) {
        setPanelGradeError("Enter a letter (A, B+, C-…) or number 0–100");
        return;
      }
      setPanelGradeError(null);
      onGrade(parsed.passed, feedback, parsed.score);
    } else {
      // No score — just save feedback with existing pass/fail, default to pass if not set
      const passed = row.human_grade_pass !== null ? row.human_grade_pass : true;
      onGrade(passed, feedback, undefined);
    }
  };

  const dateStr = row.scheduled_date || (row.due_date ? String(row.due_date).slice(0, 10) : null);

  return (
    <div
      style={{
        position: "fixed",
        top: 56, // below nav bar
        right: 0,
        bottom: 0,
        width: 380,
        zIndex: 50,
        display: "flex",
        flexDirection: "column",
        background: "var(--bg)",
        borderLeft: `1px solid rgba(255,255,255,0.1)`,
        boxShadow: "-8px 0 32px rgba(0,0,0,0.35)",
        animation: "slideInRight 0.18s ease",
      }}
    >
      <style>{`
        @keyframes slideInRight {
          from { transform: translateX(100%); opacity: 0; }
          to   { transform: translateX(0);    opacity: 1; }
        }
      `}</style>

      {/* Panel header */}
      <div
        style={{
          padding: "14px 16px 12px",
          borderBottom: `1px solid ${borderCol}`,
          display: "flex",
          alignItems: "flex-start",
          gap: 10,
          flexShrink: 0,
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
            <span style={{ fontSize: 16 }}>{subjectIcon(row.subject)}</span>
            <span
              style={{
                fontSize: 13, fontWeight: 700, color: "var(--t1)",
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
              }}
              title={row.title}
            >
              {row.title}
            </span>
          </div>
          {dateStr && (
            <div style={{ fontSize: 10, color: "var(--t3)" }}>
              {row.scheduled_date ? "Scheduled" : "Due"}: {dateStr}
            </div>
          )}
        </div>
        <button
          onClick={onClose}
          title="Close preview"
          style={{
            flexShrink: 0,
            width: 26, height: 26,
            display: "flex", alignItems: "center", justifyContent: "center",
            borderRadius: 4,
            background: "rgba(255,255,255,0.06)",
            border: "1px solid rgba(255,255,255,0.1)",
            color: "var(--t3)",
            cursor: "pointer",
          }}
        >
          <X size={13} />
        </button>
      </div>

      {/* Panel body — scrollable */}
      <div style={{ flex: 1, overflowY: "auto", padding: "14px 16px", display: "flex", flexDirection: "column", gap: 14 }}>

        {/* Description */}
        {row.description && (
          <div>
            <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.1em", fontWeight: 700, color: "var(--t3)", marginBottom: 6 }}>
              Description
            </div>
            <div
              style={{
                fontSize: 12, color: "var(--t2)", lineHeight: 1.6,
                background: "rgba(255,255,255,0.03)",
                border: `1px solid ${borderCol}`,
                borderRadius: 6, padding: "8px 10px",
              }}
            >
              {row.description}
            </div>
          </div>
        )}

        {/* Student's submission */}
        <div>
          <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.1em", fontWeight: 700, color: "var(--t3)", marginBottom: 6 }}>
            Student's submission
          </div>
          {!row.submission_id ? (
            <p style={{ fontSize: 12, color: "var(--t3)", fontStyle: "italic" }}>No submission yet.</p>
          ) : loadingThis ? (
            <p style={{ fontSize: 12, color: "var(--t3)" }}>Loading submission…</p>
          ) : sub ? (
            <SubmissionWorkView sub={sub} dk={dk} />
          ) : (
            <p style={{ fontSize: 12, color: "var(--t3)", fontStyle: "italic" }}>Submission not loaded.</p>
          )}
        </div>

        {/* Grade input */}
        <div>
          <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.1em", fontWeight: 700, color: "var(--t3)", marginBottom: 6 }}>
            Grade
          </div>
          <input
            type="text"
            value={panelGradeInput}
            placeholder="e.g. A, B+, 87"
            onChange={(e) => {
              setPanelGradeInput(e.target.value);
              setPanelGradeError(null);
            }}
            style={{
              width: "100%",
              padding: "7px 10px",
              borderRadius: 6,
              fontSize: 13,
              background: "rgba(255,255,255,0.04)",
              border: `1px solid ${panelGradeError ? "rgba(239,68,68,0.5)" : "rgba(255,255,255,0.1)"}`,
              color: "var(--t1)",
              outline: "none",
            }}
          />
          {panelGradeError && (
            <div style={{ fontSize: 10, color: "#f87171", marginTop: 4 }}>{panelGradeError}</div>
          )}
          <div style={{ fontSize: 10, color: "var(--t3)", marginTop: 4 }}>
            Letters: A+, A, A-, B+… F &nbsp;·&nbsp; Numbers: 0–100 &nbsp;·&nbsp; Pass ≥ 60
          </div>
        </div>

        {/* Feedback textarea */}
        <div>
          <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.1em", fontWeight: 700, color: "var(--t3)", marginBottom: 6 }}>
            Feedback
          </div>
          <textarea
            value={feedbackDraft[row.assignment_id] ?? row.human_grade_feedback ?? ""}
            onChange={(e) => setFeedbackDraft((p) => ({ ...p, [row.assignment_id]: e.target.value }))}
            placeholder="Feedback for the student…"
            rows={4}
            style={{
              width: "100%",
              borderRadius: 6, padding: "7px 10px",
              fontSize: 12, resize: "vertical",
              background: "rgba(255,255,255,0.04)",
              border: `1px solid rgba(255,255,255,0.08)`,
              color: "var(--t1)",
              outline: "none",
            }}
          />
        </div>
      </div>

      {/* Panel footer — Save button */}
      <div
        style={{
          padding: "12px 16px",
          borderTop: `1px solid ${borderCol}`,
          display: "flex",
          gap: 8,
          flexShrink: 0,
        }}
      >
        <button
          onClick={handleSave}
          disabled={saving}
          style={{
            flex: 1,
            padding: "8px 12px",
            borderRadius: 6,
            fontSize: 12, fontWeight: 700,
            background: saving ? "rgba(124,58,237,0.1)" : "rgba(124,58,237,0.2)",
            color: saving ? "#a78bfa80" : "#a78bfa",
            border: "1px solid rgba(124,58,237,0.4)",
            cursor: saving ? "not-allowed" : "pointer",
            transition: "background 0.12s",
          }}
        >
          {saving ? "Saving…" : "Save grade & feedback"}
        </button>
        <button
          onClick={() => onGrade(true, feedbackDraft[row.assignment_id])}
          disabled={saving}
          title="Quick pass"
          style={{
            padding: "8px 12px",
            borderRadius: 6,
            fontSize: 12, fontWeight: 700,
            background: "rgba(52,211,153,0.12)",
            color: "#34d399",
            border: "1px solid rgba(52,211,153,0.3)",
            cursor: saving ? "not-allowed" : "pointer",
          }}
        >
          ✓
        </button>
        <button
          onClick={() => onGrade(false, feedbackDraft[row.assignment_id])}
          disabled={saving}
          title="Quick redo"
          style={{
            padding: "8px 12px",
            borderRadius: 6,
            fontSize: 12, fontWeight: 700,
            background: "rgba(239,68,68,0.1)",
            color: "#f87171",
            border: "1px solid rgba(239,68,68,0.28)",
            cursor: saving ? "not-allowed" : "pointer",
          }}
        >
          ✗
        </button>
      </div>
    </div>
  );
}

/* ── Small reusable pieces ─────────────────────────────── */

function MenuItem({
  icon, label, onClick, disabled = false, accent,
}: {
  icon?: React.ReactNode;
  label: string;
  onClick?: () => void;
  disabled?: boolean;
  accent?: "emerald" | "red";
}) {
  const color =
    accent === "emerald" ? "#6ee7b7" :
    accent === "red"     ? "#fca5a5" :
    "var(--t2)";
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        width: "100%",
        display: "flex", alignItems: "center", gap: 8,
        padding: "7px 10px",
        background: "transparent",
        border: "none",
        borderRadius: 4,
        color,
        fontSize: 12, fontWeight: 600,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.4 : 1,
        textAlign: "left",
      }}
      onMouseEnter={(e) => { if (!disabled) (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.06)"; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
    >
      {icon && <span style={{ display: "inline-flex", width: 14, justifyContent: "center" }}>{icon}</span>}
      <span>{label}</span>
    </button>
  );
}

function FeedbackSaveBtn({
  children, color, disabled, onClick,
}: { children: React.ReactNode; color: "emerald" | "red"; disabled?: boolean; onClick?: () => void }) {
  const palette = {
    emerald: { bg: "rgba(52,211,153,0.15)",  text: "#6ee7b7", border: "rgba(52,211,153,0.4)" },
    red:     { bg: "rgba(239,68,68,0.12)",   text: "#fca5a5", border: "rgba(239,68,68,0.35)" },
  }[color];
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        padding: "4px 10px", borderRadius: 5,
        fontSize: 11, fontWeight: 700,
        background: palette.bg, color: palette.text, border: `1px solid ${palette.border}`,
        cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.5 : 1,
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </button>
  );
}

function StatPill({ label, value, color = "gray" }: { label: string; value: number; color?: "gray" | "emerald" | "amber" }) {
  const cfg: Record<string, { bg: string; text: string }> = {
    gray:    { bg: "rgba(255,255,255,0.06)", text: "var(--t2)" },
    emerald: { bg: "rgba(52,211,153,0.12)",  text: "#6ee7b7" },
    amber:   { bg: "rgba(251,191,36,0.13)",  text: "#fbbf24" },
  };
  const c = cfg[color];
  return (
    <span
      style={{
        display: "inline-flex", alignItems: "center", gap: 5,
        padding: "3px 8px", borderRadius: 99,
        background: c.bg, color: c.text,
        fontSize: 11, fontWeight: 700,
      }}
    >
      <span style={{ fontSize: 13, fontVariantNumeric: "tabular-nums", lineHeight: 1 }}>{value}</span>
      <span style={{ fontSize: 9, textTransform: "uppercase", letterSpacing: "0.08em", opacity: 0.7 }}>{label}</span>
    </span>
  );
}

// Inline viewer: renders question-by-question with the student's answer and a
// correctness marker when the assignment has an answer key.
function SubmissionWorkView({ sub, dk }: { sub: any; dk: boolean }) {
  if (!sub) return <p style={{ fontSize: 12, color: "var(--t3)", fontStyle: "italic" }}>No submission data.</p>;
  const content = sub.assignment_content;
  const answers: Record<string, any> = sub.answers || {};
  const auto = sub.auto_grade_result;
  const when = sub.submitted_at ? new Date(sub.submitted_at).toLocaleString() : null;

  const questions: any[] = [];
  if (content?.sections) {
    for (const section of content.sections) {
      for (const q of (section.questions || [])) questions.push(q);
    }
  }

  const normalize = (s: any) => String(s ?? "").replace(/^[A-D]\.\s*/i, "").trim().toLowerCase();

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
        <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.12em", fontWeight: 700, color: "var(--t3)" }}>
          Student's work
        </div>
        <div style={{ fontSize: 11, color: "var(--t3)" }}>
          {sub.student_name && <span>👤 {sub.student_name} · </span>}
          {when && <span>🕐 {when}</span>}
          {auto && <span> · AI {auto.score}%</span>}
        </div>
      </div>

      {questions.length > 0 ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
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
              <div
                key={i}
                style={{
                  borderRadius: 6, padding: "10px 12px",
                  background: "rgba(255,255,255,0.02)",
                  border: "1px solid rgba(255,255,255,0.06)",
                }}
              >
                <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                  <span style={{ fontSize: 10, fontWeight: 700, color: "var(--t3)", marginTop: 2 }}>Q{i + 1}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "var(--t1)" }}>{q.text || `Question ${i + 1}`}</div>
                    {q.type === "multiple_choice" && Array.isArray(q.options) && (
                      <div style={{ marginTop: 6, display: "flex", flexWrap: "wrap", gap: 4 }}>
                        {q.options.map((opt: string, oi: number) => {
                          const isStudent = normalize(opt) === normalize(ans);
                          const isKey = correctOpt !== undefined && normalize(opt) === normalize(correctOpt);
                          const bg = isStudent && isKey ? "rgba(52,211,153,0.2)"
                            : isStudent ? "rgba(239,68,68,0.14)"
                            : isKey ? "rgba(52,211,153,0.1)"
                            : "rgba(255,255,255,0.04)";
                          const col = isStudent && isKey ? "#6ee7b7"
                            : isStudent ? "#fca5a5"
                            : isKey ? "#34d399"
                            : "rgba(255,255,255,0.38)";
                          const bdr = isStudent && isKey ? "rgba(52,211,153,0.5)"
                            : isStudent ? "rgba(239,68,68,0.4)"
                            : isKey ? "rgba(52,211,153,0.3)"
                            : "rgba(255,255,255,0.08)";
                          return (
                            <span
                              key={oi}
                              style={{
                                fontSize: 11, padding: "3px 8px", borderRadius: 4,
                                background: bg, color: col, border: `1px solid ${bdr}`,
                                fontWeight: isStudent || isKey ? 700 : 400,
                              }}
                            >
                              {isStudent ? "▶ " : ""}{opt}{isKey ? " ✓" : ""}
                            </span>
                          );
                        })}
                      </div>
                    )}
                    {(q.type === "short_answer" || q.type === "fill_blank") && (
                      <div
                        style={{
                          marginTop: 6, fontSize: 12, padding: "5px 8px", borderRadius: 4,
                          background: ans ? "rgba(255,255,255,0.04)" : "transparent",
                          color: ans ? "var(--t1)" : "var(--t3)",
                          fontStyle: ans ? "normal" : "italic",
                          whiteSpace: "pre-wrap",
                        }}
                      >
                        {ans || "(no answer)"}
                      </div>
                    )}
                  </div>
                  {correct === true  && <span style={{ fontSize: 12, fontWeight: 800, color: "#34d399" }}>✓</span>}
                  {correct === false && <span style={{ fontSize: 12, fontWeight: 800, color: "#f87171" }}>✗</span>}
                </div>
              </div>
            );
          })}
        </div>
      ) : auto?.checks ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {auto.checks.map((c: any, i: number) => (
            <div key={i} style={{ fontSize: 12, display: "flex", alignItems: "flex-start", gap: 8 }}>
              <span style={{ color: c.passed ? "#34d399" : "#f87171" }}>{c.passed ? "✓" : "✗"}</span>
              <span style={{ fontWeight: 600, color: "var(--t1)" }}>{c.label}</span>
              <span style={{ color: "var(--t3)" }}>— {c.detail}</span>
            </div>
          ))}
        </div>
      ) : sub.project_id ? (
        <p style={{ fontSize: 12, color: "var(--t3)", fontStyle: "italic" }}>
          Scratch project submission (ID {String(sub.project_id).slice(0, 8)}…). Open the project workspace to view blocks.
        </p>
      ) : (
        <p style={{ fontSize: 12, color: "var(--t3)", fontStyle: "italic" }}>No answer data in this submission.</p>
      )}

      {sub.human_grade_feedback && (
        <div
          style={{
            marginTop: 4, fontSize: 12, borderRadius: 6, padding: "6px 10px",
            background: "rgba(124,58,237,0.08)", border: "1px solid rgba(124,58,237,0.28)",
          }}
        >
          <span style={{ fontWeight: 700, color: "#c4b5fd" }}>Your feedback: </span>
          <span style={{ color: "var(--t2)" }}>{sub.human_grade_feedback}</span>
        </div>
      )}
    </div>
  );
}

// Kept as a named export so App.tsx's existing import still compiles.
export const GradebookStudentPicker = TeacherGradebook;
