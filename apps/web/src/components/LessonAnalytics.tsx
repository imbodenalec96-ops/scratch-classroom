import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useTheme } from "../lib/theme.tsx";
import { api } from "../lib/api.ts";
import { BookOpen, ChevronLeft, CheckCircle2, Eye, Clock } from "lucide-react";

/**
 * LessonAnalytics — teacher-side view of which students have opened and
 * marked-as-read each lesson. Simple matrix: rows = students, cols = lessons.
 */
export default function LessonAnalytics() {
  const { theme } = useTheme();
  const dk = theme === "dark";
  const [classes, setClasses] = useState<any[]>([]);
  const [selectedClassId, setSelectedClassId] = useState<string>("");
  const [students, setStudents] = useState<any[]>([]);
  const [views, setViews] = useState<any[]>([]); // rows from /lessons/class/:id/views
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api.getClasses().then(c => {
      setClasses(c);
      if (c.length > 0 && !selectedClassId) setSelectedClassId(c[0].id);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!selectedClassId) return;
    setLoading(true);
    Promise.all([
      api.getStudents(selectedClassId).catch(() => []),
      api.getClassLessonViews(selectedClassId).catch(() => []),
    ]).then(([s, v]) => { setStudents(s); setViews(v); }).finally(() => setLoading(false));
  }, [selectedClassId]);

  // Derive unique lesson IDs seen across all views + sort by first-opened
  const lessonIds = Array.from(new Set(views.map(v => v.lesson_id))).sort();

  const statusFor = (studentId: string, lessonId: string) => {
    const v = views.find(x => x.student_id === studentId && x.lesson_id === lessonId);
    if (!v) return "none";
    if (v.marked_read_at) return "read";
    return "opened";
  };

  const readCount = (studentId: string) =>
    views.filter(v => v.student_id === studentId && v.marked_read_at).length;
  const openedCount = (studentId: string) =>
    views.filter(v => v.student_id === studentId).length;

  return (
    <div className="p-6 space-y-5 animate-page-enter max-w-6xl mx-auto">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className={`text-2xl font-bold tracking-tight flex items-center gap-2 ${dk?"text-white":"text-gray-900"}`}>
            <BookOpen size={22} className="text-indigo-400" />
            Lesson Analytics
          </h1>
          <p className={`text-sm mt-0.5 ${dk?"text-white/40":"text-gray-500"}`}>
            See which students have opened and marked-as-read each lesson
          </p>
        </div>
        <Link to="/teacher" className={`flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-xl border ${
          dk?"border-white/[0.07] text-white/50 hover:text-white hover:bg-white/[0.04]":"border-gray-200 text-gray-500 hover:text-gray-800 hover:bg-gray-50"
        }`}>
          <ChevronLeft size={13}/> Back to Dashboard
        </Link>
      </div>

      {/* Class picker */}
      {classes.length > 1 && (
        <div className="card flex items-center gap-3 flex-wrap">
          <span className={`text-xs font-semibold ${dk?"text-white/50":"text-gray-600"}`}>Class:</span>
          {classes.map(c => (
            <button key={c.id} onClick={() => setSelectedClassId(c.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all cursor-pointer ${
                selectedClassId === c.id
                  ? "bg-violet-500/15 text-violet-400 border-violet-500/30"
                  : dk ? "text-white/50 border-white/[0.08] hover:bg-white/[0.03]" : "text-gray-600 border-gray-200 hover:bg-gray-50"
              }`}>{c.name}</button>
          ))}
        </div>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Students",    value: students.length,       icon: Eye },
          { label: "Lessons seen",value: lessonIds.length,      icon: BookOpen },
          { label: "Opens",       value: views.length,          icon: Clock },
          { label: "Marked read", value: views.filter(v => v.marked_read_at).length, icon: CheckCircle2 },
        ].map(s => (
          <div key={s.label} className="card flex items-center gap-3">
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${dk?"bg-indigo-500/10":"bg-indigo-50"}`}>
              <s.icon size={16} className="text-indigo-400" />
            </div>
            <div>
              <div className={`text-2xl font-bold leading-none ${dk?"text-white":"text-gray-900"}`}>{s.value}</div>
              <div className={`text-xs mt-1 ${dk?"text-white/40":"text-gray-500"}`}>{s.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Matrix */}
      <div className="card">
        <h3 className={`text-sm font-semibold mb-3 ${dk?"text-white/70":"text-gray-700"}`}>
          Student × Lesson Matrix
        </h3>
        {loading ? (
          <div className={`text-center py-10 text-sm ${dk?"text-white/25":"text-gray-400"}`}>Loading…</div>
        ) : students.length === 0 ? (
          <div className={`text-center py-10 text-sm ${dk?"text-white/25":"text-gray-400"}`}>
            No students in this class yet.
          </div>
        ) : lessonIds.length === 0 ? (
          <div className={`text-center py-10 text-sm ${dk?"text-white/25":"text-gray-400"}`}>
            No lesson activity yet. Once students open lessons, they'll show up here.
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 520 }}>
              <thead>
                <tr>
                  <th style={{ textAlign: "left", padding: "8px 10px", fontSize: 11, fontWeight: 700, color: dk?"rgba(255,255,255,0.5)":"#6b7280", letterSpacing: "0.05em", textTransform: "uppercase", position: "sticky", left: 0, background: dk?"var(--bg-surface)":"white" }}>
                    Student
                  </th>
                  <th style={{ textAlign: "center", padding: "8px 10px", fontSize: 11, fontWeight: 700, color: dk?"rgba(255,255,255,0.5)":"#6b7280", letterSpacing: "0.05em", textTransform: "uppercase" }}>
                    Read / Opens
                  </th>
                  {lessonIds.map(id => (
                    <th key={id} style={{ textAlign: "center", padding: "8px 6px", fontSize: 10, fontWeight: 700, color: dk?"rgba(255,255,255,0.4)":"#9ca3af", fontFamily: "monospace" }}
                        title={id}>
                      {id.slice(0, 8)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {students.map(s => (
                  <tr key={s.id} style={{ borderTop: dk?"1px solid rgba(255,255,255,0.04)":"1px solid #f1f5f9" }}>
                    <td style={{ padding: "8px 10px", fontSize: 13, fontWeight: 600, color: dk?"white":"#111827", position: "sticky", left: 0, background: dk?"var(--bg-surface)":"white" }}>
                      {s.name}
                    </td>
                    <td style={{ padding: "8px 10px", textAlign: "center", fontSize: 12, color: dk?"rgba(255,255,255,0.5)":"#6b7280", fontFamily: "monospace" }}>
                      {readCount(s.id)} / {openedCount(s.id)}
                    </td>
                    {lessonIds.map(id => {
                      const st = statusFor(s.id, id);
                      const cellBg = st === "read" ? (dk?"rgba(16,185,129,0.18)":"#d1fae5")
                                    : st === "opened" ? (dk?"rgba(245,158,11,0.15)":"#fef3c7")
                                    : (dk?"rgba(255,255,255,0.02)":"#f8fafc");
                      const cellFg = st === "read" ? (dk?"#34d399":"#065f46")
                                    : st === "opened" ? (dk?"#fbbf24":"#92400e")
                                    : (dk?"rgba(255,255,255,0.2)":"#d1d5db");
                      const icon = st === "read" ? "✓" : st === "opened" ? "•" : "—";
                      return (
                        <td key={id} style={{ padding: 4, textAlign: "center" }}>
                          <div style={{ display: "inline-flex", alignItems: "center", justifyContent: "center",
                            width: 28, height: 24, borderRadius: 6, fontSize: 12, fontWeight: 700,
                            background: cellBg, color: cellFg }}
                            title={`${s.name} – ${id} – ${st}`}>
                            {icon}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className={`mt-3 flex items-center gap-4 text-[10px] ${dk?"text-white/40":"text-gray-500"}`}>
          <span><span style={{ padding: "1px 6px", borderRadius: 4, background: dk?"rgba(16,185,129,0.18)":"#d1fae5", color: dk?"#34d399":"#065f46" }}>✓</span> Marked read</span>
          <span><span style={{ padding: "1px 6px", borderRadius: 4, background: dk?"rgba(245,158,11,0.15)":"#fef3c7", color: dk?"#fbbf24":"#92400e" }}>•</span> Opened only</span>
          <span><span style={{ padding: "1px 6px", borderRadius: 4, color: dk?"rgba(255,255,255,0.2)":"#d1d5db" }}>—</span> Not yet</span>
        </div>
      </div>
    </div>
  );
}
