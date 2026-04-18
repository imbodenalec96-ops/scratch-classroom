import React, { useEffect, useState } from "react";
import { useTheme } from "../lib/theme.tsx";
import { useAuth } from "../lib/auth.tsx";
import { api } from "../lib/api.ts";
import { Link } from "react-router-dom";
import {
  Users, GraduationCap, BookOpen, School, Eye,
  LockOpen, Youtube, BarChart3, Trophy,
  ClipboardList, Monitor, HelpCircle, CheckSquare,
  Download, AlertTriangle, Tv,
} from "lucide-react";

/**
 * AdminDashboard — school-wide view for admins.
 * Teachers land on /teacher (TeacherDashboard). Admins land here.
 * Admins can still access every teacher surface via the sidebar or
 * the "View as Teacher" link at the top.
 */
export default function AdminDashboard() {
  const { user } = useAuth();
  const { theme } = useTheme();
  const dk = theme === "dark";

  const [classes, setClasses] = useState<any[]>([]);
  const [teachers, setTeachers] = useState<any[]>([]);
  const [students, setStudents] = useState<any[]>([]);
  const [studentsByClass, setStudentsByClass] = useState<Record<string, number>>({});
  const [youtubePending, setYoutubePending] = useState(0);
  const [aiKeySet, setAiKeySet] = useState<boolean | null>(null);
  const [genWarnings, setGenWarnings] = useState<any[]>([]);
  const [showWarnings, setShowWarnings] = useState(false);

  useEffect(() => {
    Promise.all([
      api.getClasses().catch(() => []),
      api.getUsers().catch(() => []),
      api.getYouTubeRequests("pending").catch(() => []),
    ]).then(async ([cls, users, yt]) => {
      setClasses(cls);
      setTeachers(users.filter((u: any) => u.role === "teacher" || u.role === "admin"));
      setStudents(users.filter((u: any) => u.role === "student"));
      setYoutubePending(yt.length);
      const counts: Record<string, number> = {};
      await Promise.all(cls.map(async (c: any) => {
        try { counts[c.id] = (await api.getStudents(c.id)).length; } catch { counts[c.id] = 0; }
      }));
      setStudentsByClass(counts);
    });
    // Probe AI key via a cheap call that returns 503 if missing
    fetch("/api/ai-tasks/task-config", { headers: { Authorization: "Bearer " + localStorage.getItem("token") } })
      .then(r => setAiKeySet(r.status !== 503))
      .catch(() => setAiKeySet(false));
    fetch("/api/ai-tasks/recent-warnings", { headers: { Authorization: "Bearer " + localStorage.getItem("token") } })
      .then(r => r.ok ? r.json() : [])
      .then(rows => setGenWarnings(Array.isArray(rows) ? rows : []))
      .catch(() => setGenWarnings([]));
  }, []);

  const totalStudents = students.length;
  const totalTeachers = teachers.filter(t => t.role === "teacher").length;

  const handleForceUnlockAll = async () => {
    if (!confirm("Force-unlock EVERY class system-wide? This releases every active lock.")) return;
    try { await api.forceUnlockAll(); alert("✓ All classes unlocked."); }
    catch (e: any) { alert("Failed: " + e.message); }
  };

  const handleExportCSV = () => {
    const classNameById: Record<string, string> = {};
    classes.forEach(c => { classNameById[c.id] = c.name; });
    const rows = [
      ["Name", "Email", "Role", "Username", "Created"],
      ...students.map(s => [s.name || "", s.email || "", s.role, s.username || "", s.created_at || ""]),
    ];
    const csv = rows
      .map(r => r.map(cell => `"${String(cell ?? "").replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `students-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Pending admin tasks — computed synchronously from loaded data
  const unstaffedClasses = classes.filter(c => !c.teacher_id);
  const emptyClasses = classes.filter(c => (studentsByClass[c.id] ?? -1) === 0);
  const pendingTasks: { severity: "high" | "med" | "low"; label: string; link: string }[] = [];
  if (aiKeySet === false)   pendingTasks.push({ severity: "high", label: "Anthropic API key not configured — AI generation disabled", link: "/settings" });
  if (youtubePending > 0)   pendingTasks.push({ severity: youtubePending > 5 ? "high" : "med", label: `${youtubePending} YouTube link${youtubePending === 1 ? "" : "s"} waiting for approval`, link: "/youtube" });
  if (unstaffedClasses.length > 0) pendingTasks.push({ severity: "high", label: `${unstaffedClasses.length} class${unstaffedClasses.length === 1 ? "" : "es"} without a teacher`, link: "/admin-dashboard" });
  if (emptyClasses.length > 0)     pendingTasks.push({ severity: "low", label: `${emptyClasses.length} empty class${emptyClasses.length === 1 ? "" : "es"} (no students enrolled)`, link: "/admin-dashboard" });
  if (totalTeachers === 0)         pendingTasks.push({ severity: "high", label: "No teachers on the platform yet", link: "/admin-dashboard" });
  if (genWarnings.length > 0)      pendingTasks.push({ severity: "med", label: `⚠️ ${genWarnings.length} off-grade task${genWarnings.length === 1 ? "" : "s"} flagged by CCSS validator`, link: "#gen-warnings" });

  const ADMIN_TOOLS = [
    { path: "/monitor",          icon: Monitor,        label: "Live Monitor",     desc: "Every student, every class", accent: "var(--accent)" },
    { path: "/class-grades",     icon: GraduationCap,  label: "Class Grades",     desc: "Per-student grade levels",   accent: "var(--accent-sage)" },
    { path: "/assignments",      icon: ClipboardList,  label: "Assignments",      desc: "Create & manage",            accent: "var(--accent)" },
    { path: "/youtube",          icon: Youtube,        label: "YouTube Queue",    desc: `${youtubePending} pending`,  accent: "var(--danger)" },
    { path: "/analytics",        icon: BarChart3,      label: "Analytics",        desc: "School-wide reports",        accent: "var(--warning)" },
    { path: "/leaderboard",      icon: Trophy,         label: "Leaderboard",      desc: "Rankings",                   accent: "var(--warning)" },
    { path: "/lesson-analytics", icon: BookOpen,       label: "Lesson Views",     desc: "Who read what",              accent: "var(--info)" },
    { path: "/grading",          icon: CheckSquare,    label: "Grading",          desc: "Review student work",        accent: "var(--accent-sage)" },
    { path: "/quizzes",          icon: HelpCircle,     label: "Quizzes",          desc: "Build & grade",              accent: "var(--info)" },
  ];

  return (
    <div className="p-7 space-y-6 animate-page-enter max-w-7xl mx-auto">
      {/* ── Editorial masthead ── */}
      <header className="border-b pb-5" style={{ borderColor: "var(--border)" }}>
        <div className="flex items-center justify-between mb-2 text-[10px] uppercase tracking-[0.16em]" style={{ color: "var(--text-3)" }}>
          <span>{new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}</span>
          <span className="font-mono">BLOCKFORGE · ADMIN</span>
        </div>
        <div className="flex items-end justify-between gap-4 flex-wrap">
          <div>
            <div className="section-label mb-2">— School-wide overview —</div>
            <h1 className="font-display text-4xl sm:text-5xl leading-[1.02]" style={{ color: "var(--text-1)" }}>
              Good {new Date().getHours() < 12 ? "morning" : new Date().getHours() < 17 ? "afternoon" : "evening"}, <em style={{ color: "var(--accent)", fontStyle: "italic" }}>{user?.name?.split(" ")[0] || "Admin"}.</em>
            </h1>
            <p className="text-sm mt-2 max-w-xl" style={{ color: "var(--text-2)" }}>
              A calm view of everything. Flip into any teacher's seat with one click.
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {classes[0]?.id && (
              <a
                href={`/board?class=${encodeURIComponent(classes[0].id)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold border cursor-pointer transition-colors"
                style={{
                  color: "var(--text-1)",
                  background: "var(--surface-1)",
                  borderColor: "var(--border-md)",
                  borderRadius: "var(--r-md)",
                }}
                title="Open the classroom TV/projector board"
              >
                <Tv size={13} /> 📺 Classroom Board
              </a>
            )}
            <Link to="/teacher" className="btn-secondary gap-1.5 text-xs">
              <Eye size={13} /> View as Teacher
            </Link>
            <button onClick={handleExportCSV}
              className="flex items-center gap-2 px-3 py-2 text-xs font-semibold border cursor-pointer transition-colors"
              style={{
                color: "var(--text-2)",
                background: "transparent",
                borderColor: "var(--border-md)",
                borderRadius: "var(--r-md)",
              }}
              title="Download student roster as CSV">
              <Download size={13}/> Export Students
            </button>
            <button onClick={handleForceUnlockAll}
              className="flex items-center gap-2 px-3 py-2 text-xs font-semibold border cursor-pointer transition-colors"
              style={{
                color: "var(--danger)",
                background: "color-mix(in srgb, var(--danger) 8%, transparent)",
                borderColor: "color-mix(in srgb, var(--danger) 30%, transparent)",
                borderRadius: "var(--r-md)",
              }}>
              <LockOpen size={13}/> Force Unlock All
            </button>
          </div>
        </div>
      </header>

      {/* ── Stats row ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Classes",   value: classes.length,    icon: School,        accent: "var(--accent)" },
          { label: "Teachers",  value: totalTeachers,     icon: GraduationCap, accent: "var(--accent-sage)" },
          { label: "Students",  value: totalStudents,     icon: Users,         accent: "var(--info)" },
          { label: "YT Pending",value: youtubePending,    icon: Youtube,       accent: "var(--danger)" },
        ].map(s => (
          <div key={s.label} className="card flex items-baseline gap-3" style={{ padding: "14px 16px", borderLeft: `3px solid ${s.accent}` }}>
            <div style={{ color: s.accent }}><s.icon size={15}/></div>
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-3)" }}>{s.label}</div>
              <div className="font-display text-3xl leading-none mt-1 tabular-nums" style={{ color: "var(--text-1)" }}>{s.value}</div>
            </div>
          </div>
        ))}
      </div>

      {/* ── Pending admin tasks ── */}
      {pendingTasks.length > 0 && (
        <div className="card" style={{ borderLeft: "3px solid var(--warning)" }}>
          <div className="flex items-center justify-between mb-3">
            <div>
              <div className="section-label">— Pending tasks —</div>
              <h3 className="font-display text-2xl leading-tight" style={{ color: "var(--text-1)" }}>
                Needs your attention.
              </h3>
            </div>
            <span className="chip">{pendingTasks.length} item{pendingTasks.length === 1 ? "" : "s"}</span>
          </div>
          <div className="space-y-1.5">
            {pendingTasks.map((t, i) => {
              const color = t.severity === "high" ? "var(--danger)"
                          : t.severity === "med"  ? "var(--warning)"
                          : "var(--text-3)";
              const inner = (
                <>
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <AlertTriangle size={14} style={{ color, flexShrink: 0 }} />
                    <div className="text-sm" style={{ color: "var(--text-1)" }}>{t.label}</div>
                  </div>
                  <span className="text-[10px] uppercase tracking-wider font-semibold" style={{ color }}>
                    {t.severity === "high" ? "High" : t.severity === "med" ? "Medium" : "Low"}
                  </span>
                </>
              );
              if (t.link === "#gen-warnings") {
                return (
                  <button key={i} onClick={() => setShowWarnings(v => !v)} className="list-row" style={{ width: "100%", textAlign: "left", background: "transparent", border: "none", cursor: "pointer" }}>
                    {inner}
                  </button>
                );
              }
              return (
                <Link key={i} to={t.link} className="list-row" style={{ textDecoration: "none" }}>
                  {inner}
                </Link>
              );
            })}
          </div>
          {showWarnings && genWarnings.length > 0 && (
            <div className="mt-3 p-3 rounded" style={{ background: "var(--bg-raised)", border: "1px solid var(--border)", maxHeight: 320, overflowY: "auto" }}>
              <div className="text-xs font-bold mb-2" style={{ color: "var(--text-2)" }}>CCSS Validator flags — recent 100</div>
              {genWarnings.map((w: any) => {
                let reasons: string[] = [];
                try { reasons = JSON.parse(w.generation_warnings || "[]"); } catch {}
                return (
                  <div key={w.id} className="mb-2 pb-2" style={{ borderBottom: "1px solid var(--border)" }}>
                    <div className="text-[11px]" style={{ color: "var(--text-3)" }}>
                      {w.date} · {w.subject} · grade {w.target_grade ?? "?"} · student {String(w.student_id).slice(0, 8)}
                    </div>
                    <div className="text-sm mt-0.5" style={{ color: "var(--text-1)" }}>{w.prompt}</div>
                    <div className="text-[11px] mt-0.5" style={{ color: "var(--warning)" }}>⚠️ {reasons.join("; ")}</div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Admin tools grid ── */}
      <div>
        <div className="section-label mb-3">— Admin tools —</div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {ADMIN_TOOLS.map((t, i) => (
            <Link key={t.path + t.label} to={t.path}
              className="group flex flex-col gap-2 p-3 transition-all animate-slide-in card-hover"
              style={{
                animationDelay: `${i * 40}ms`,
                background: "var(--bg-surface)",
                border: "1px solid var(--border)",
                borderLeft: `3px solid ${t.accent}`,
                borderRadius: "var(--r-md)",
                textDecoration: "none",
              }}>
              <div style={{ color: t.accent }}><t.icon size={16}/></div>
              <div className="min-w-0">
                <div className="font-semibold text-xs leading-tight truncate" style={{ color: "var(--text-1)" }}>{t.label}</div>
                <div className="text-[10px] truncate mt-0.5" style={{ color: "var(--text-3)" }}>{t.desc}</div>
              </div>
            </Link>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* ── All classes ── */}
        <div className="card">
          <div className="flex items-center justify-between mb-3">
            <div>
              <div className="section-label">— Every class —</div>
              <h3 className="font-display text-2xl leading-tight" style={{ color: "var(--text-1)" }}>Classrooms</h3>
            </div>
            <span className="chip">{classes.length} total</span>
          </div>
          {classes.length === 0 ? (
            <p className="text-sm py-8 text-center" style={{ color: "var(--text-3)" }}>No classes created yet.</p>
          ) : (
            <div className="space-y-1.5">
              {classes.map(c => {
                const teacher = teachers.find(t => t.id === c.teacher_id);
                return (
                  <div key={c.id} className="list-row">
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <div className="w-8 h-8 flex items-center justify-center text-xs font-bold flex-shrink-0"
                        style={{ background: "var(--accent-light)", color: "var(--text-accent)", borderRadius: "var(--r-sm)" }}>
                        {c.name?.charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-semibold" style={{ color: "var(--text-1)" }}>
                          {c.name}
                          <span className="ml-2 text-[10px] font-mono" style={{ color: "var(--text-3)" }}>{c.code}</span>
                        </div>
                        <div className="text-[11px]" style={{ color: "var(--text-3)" }}>
                          {teacher?.name || "No teacher assigned"} · {studentsByClass[c.id] ?? "…"} students
                        </div>
                      </div>
                    </div>
                    <Link to="/monitor" className="btn-ghost text-[10px]" style={{ padding: "4px 10px" }}>
                      Monitor →
                    </Link>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ── Teachers ── */}
        <div className="card">
          <div className="flex items-center justify-between mb-3">
            <div>
              <div className="section-label">— Teachers —</div>
              <h3 className="font-display text-2xl leading-tight" style={{ color: "var(--text-1)" }}>People</h3>
            </div>
            <span className="chip">{totalTeachers} teachers · {teachers.length - totalTeachers} admins</span>
          </div>
          {teachers.length === 0 ? (
            <p className="text-sm py-8 text-center" style={{ color: "var(--text-3)" }}>No teachers or admins yet.</p>
          ) : (
            <div className="space-y-1.5">
              {teachers.map(t => {
                const ownsClasses = classes.filter(c => c.teacher_id === t.id);
                return (
                  <div key={t.id} className="list-row">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 flex items-center justify-center text-xs font-bold"
                        style={{
                          background: t.role === "admin" ? "color-mix(in srgb, var(--danger) 12%, transparent)" : "var(--accent-light)",
                          color: t.role === "admin" ? "var(--danger)" : "var(--text-accent)",
                          borderRadius: "var(--r-sm)",
                        }}>
                        {t.name?.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <div className="text-sm font-semibold" style={{ color: "var(--text-1)" }}>
                          {t.name}
                          {t.role === "admin" && <span className="stamp ml-2">Admin</span>}
                        </div>
                        <div className="text-[11px]" style={{ color: "var(--text-3)" }}>
                          {t.email} · {ownsClasses.length > 0 ? `Teaches ${ownsClasses.map(c => c.name).join(", ")}` : "No classes"}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── System Health ── */}
      <div className="card">
        <div className="section-label mb-2">— System health —</div>
        <h3 className="font-display text-xl leading-tight mb-3" style={{ color: "var(--text-1)" }}>What's working</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
          <StatusCell
            label="Anthropic API key"
            ok={aiKeySet === true}
            okText="Configured"
            failText="Not set — AI generation disabled"
          />
          <StatusCell
            label="YouTube queue"
            ok={youtubePending === 0}
            okText="All clear"
            failText={`${youtubePending} awaiting approval`}
            warn={youtubePending > 0 && youtubePending < 5}
          />
          <StatusCell
            label="Unstaffed classes"
            ok={classes.filter(c => !c.teacher_id).length === 0}
            okText="Every class staffed"
            failText={`${classes.filter(c => !c.teacher_id).length} unstaffed`}
          />
        </div>
      </div>
    </div>
  );
}

function StatusCell({ label, ok, okText, failText, warn }: {
  label: string; ok: boolean; okText: string; failText: string; warn?: boolean;
}) {
  const color = ok ? "var(--success)" : warn ? "var(--warning)" : "var(--danger)";
  return (
    <div style={{ borderLeft: `3px solid ${color}`, padding: "8px 12px", borderRadius: "var(--r-sm)", background: "var(--bg-muted)" }}>
      <div className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-3)" }}>{label}</div>
      <div className="text-xs mt-1 font-semibold" style={{ color }}>
        {ok ? "✓ " : warn ? "⚠ " : "✕ "}
        {ok ? okText : failText}
      </div>
    </div>
  );
}
