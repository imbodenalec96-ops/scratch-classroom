import React, { useEffect, useState } from "react";
import { useTheme } from "../lib/theme.tsx";
import { useAuth } from "../lib/auth.tsx";
import { api } from "../lib/api.ts";
import { Link } from "react-router-dom";
import {
  Users, GraduationCap, BookOpen, School, Eye,
  LockOpen, Youtube, BarChart3, Trophy,
  ClipboardList, Monitor, HelpCircle, CheckSquare,
  Download, AlertTriangle, Tv, CircleDot, ArrowRight,
  UserPlus, LogIn, Sparkles, KeyRound, Pencil, Search, X, Check,
} from "lucide-react";

const ANIM = `
  @keyframes ad-fadeUp { from { opacity:0; transform:translateY(14px); } to { opacity:1; transform:translateY(0); } }
  @keyframes ad-shimmer { 0%{background-position:-200% center;} 100%{background-position:200% center;} }
  @keyframes ad-dot-pulse { 0%,100%{opacity:1;transform:scale(1);} 50%{opacity:.55;transform:scale(0.7);} }
`;

/* ─── stat card accent colours ─── */
const STAT_COLORS = {
  Classes:    { top: "#8b5cf6", glow: "rgba(139,92,246,0.25)", grad: "linear-gradient(135deg,#8b5cf6,#6d28d9)" },
  Teachers:   { top: "#14b8a6", glow: "rgba(20,184,166,0.25)",  grad: "linear-gradient(135deg,#14b8a6,#0d9488)" },
  Students:   { top: "#3b82f6", glow: "rgba(59,130,246,0.25)",  grad: "linear-gradient(135deg,#3b82f6,#2563eb)" },
  "YT Pending":{ top: "#ef4444", glow: "rgba(239,68,68,0.25)",   grad: "linear-gradient(135deg,#ef4444,#dc2626)" },
} as const;

/* ─── synthetic recent activity types ─── */
type ActivityItem = { icon: React.ElementType; color: string; label: string; sub: string; time: string };

function buildActivity(
  students: any[],
  teachers: any[],
  youtubePending: number,
): ActivityItem[] {
  const items: ActivityItem[] = [];
  if (youtubePending > 0) {
    items.push({ icon: Youtube, color: "#ef4444", label: `${youtubePending} YouTube link${youtubePending === 1 ? "" : "s"} awaiting approval`, sub: "YouTube queue", time: "Pending" });
  }
  students.slice(0, 3).forEach(s => {
    items.push({ icon: UserPlus, color: "#3b82f6", label: s.name || "New student", sub: "Joined the platform", time: s.created_at ? new Date(s.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "Recently" });
  });
  teachers.slice(0, 2).forEach(t => {
    items.push({ icon: LogIn, color: "#14b8a6", label: t.name || "Teacher", sub: t.role === "admin" ? "Admin account" : "Teacher account", time: t.created_at ? new Date(t.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "Recently" });
  });
  return items.slice(0, 6);
}

export default function AdminDashboard() {
  const { user } = useAuth();
  const { theme } = useTheme();
  const dk = theme === "dark";

  const [classes, setClasses]                     = useState<any[]>([]);
  const [teachers, setTeachers]                   = useState<any[]>([]);
  const [students, setStudents]                   = useState<any[]>([]);
  const [studentsByClass, setStudentsByClass]     = useState<Record<string, number>>({});
  const [youtubePending, setYoutubePending]       = useState(0);
  const [aiKeySet, setAiKeySet]                   = useState<boolean | null>(null);
  const [genWarnings, setGenWarnings]             = useState<any[]>([]);
  const [showWarnings, setShowWarnings]           = useState(false);

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
    fetch("/api/ai-tasks/task-config", { headers: { Authorization: "Bearer " + localStorage.getItem("token") } })
      .then(r => setAiKeySet(r.status !== 503)).catch(() => setAiKeySet(false));
    fetch("/api/ai-tasks/recent-warnings", { headers: { Authorization: "Bearer " + localStorage.getItem("token") } })
      .then(r => r.ok ? r.json() : []).then(rows => setGenWarnings(Array.isArray(rows) ? rows : [])).catch(() => setGenWarnings([]));
  }, []);

  const totalStudents = students.length;
  const totalTeachers = teachers.filter(t => t.role === "teacher").length;

  const handleForceUnlockAll = async () => {
    if (!confirm("Force-unlock EVERY class system-wide?")) return;
    try { await api.forceUnlockAll(); alert("All classes unlocked."); }
    catch (e: any) { alert("Failed: " + e.message); }
  };

  const handleExportCSV = () => {
    const rows = [
      ["Name","Email","Role","Username","Created"],
      ...students.map(s => [s.name||"",s.email||"",s.role,s.username||"",s.created_at||""]),
    ];
    const csv = rows.map(r => r.map(c => `"${String(c??"").replace(/"/g,'""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type:"text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `students-${new Date().toISOString().slice(0,10)}.csv`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const unstaffedClasses = classes.filter(c => !c.teacher_id);
  const emptyClasses     = classes.filter(c => (studentsByClass[c.id] ?? -1) === 0);
  const pendingTasks: { severity: "high"|"med"|"low"; label:string; link:string }[] = [];
  if (aiKeySet === false)       pendingTasks.push({ severity:"high", label:"Anthropic API key not configured — AI disabled",      link:"/settings" });
  if (youtubePending > 0)       pendingTasks.push({ severity:youtubePending>5?"high":"med", label:`${youtubePending} YouTube link${youtubePending===1?"":"s"} waiting`, link:"/youtube" });
  if (unstaffedClasses.length)  pendingTasks.push({ severity:"high", label:`${unstaffedClasses.length} class${unstaffedClasses.length===1?"":"es"} without a teacher`, link:"/admin-dashboard" });
  if (emptyClasses.length)      pendingTasks.push({ severity:"low",  label:`${emptyClasses.length} empty class${emptyClasses.length===1?"":"es"} (no students)`, link:"/admin-dashboard" });
  if (totalTeachers === 0)      pendingTasks.push({ severity:"high", label:"No teachers on the platform yet", link:"/admin-dashboard" });
  if (genWarnings.length)       pendingTasks.push({ severity:"med",  label:`${genWarnings.length} off-grade task${genWarnings.length===1?"":"s"} flagged by CCSS`, link:"#gen-warnings" });

  const ADMIN_TOOLS = [
    { path:"/monitor",          icon:Monitor,       label:"Live Monitor",   desc:"Every student",             grad:"linear-gradient(135deg,#ec4899,#f43f5e)", glow:"rgba(236,72,153,0.3)"  },
    { path:"/class-grades",     icon:GraduationCap, label:"Class Grades",   desc:"Per-student levels",        grad:"linear-gradient(135deg,#14b8a6,#0d9488)", glow:"rgba(20,184,166,0.3)"  },
    { path:"/assignments",      icon:ClipboardList, label:"Assignments",    desc:"Create & manage",           grad:"linear-gradient(135deg,#8b5cf6,#7c3aed)", glow:"rgba(139,92,246,0.3)"  },
    { path:"/youtube",          icon:Youtube,       label:"YouTube Queue",  desc:`${youtubePending} pending`, grad:"linear-gradient(135deg,#ef4444,#dc2626)", glow:"rgba(239,68,68,0.3)"   },
    { path:"/analytics",        icon:BarChart3,     label:"Analytics",      desc:"School-wide reports",       grad:"linear-gradient(135deg,#f59e0b,#d97706)", glow:"rgba(245,158,11,0.3)"  },
    { path:"/leaderboard",      icon:Trophy,        label:"Leaderboard",    desc:"Rankings",                  grad:"linear-gradient(135deg,#eab308,#ca8a04)", glow:"rgba(234,179,8,0.3)"   },
    { path:"/lesson-analytics", icon:BookOpen,      label:"Lesson Views",   desc:"Who read what",             grad:"linear-gradient(135deg,#6366f1,#4f46e5)", glow:"rgba(99,102,241,0.3)"  },
    { path:"/grading",          icon:CheckSquare,   label:"Grading",        desc:"Review work",               grad:"linear-gradient(135deg,#10b981,#059669)", glow:"rgba(16,185,129,0.3)"  },
    { path:"/quizzes",          icon:HelpCircle,    label:"Quizzes",        desc:"Build & grade",             grad:"linear-gradient(135deg,#3b82f6,#2563eb)", glow:"rgba(59,130,246,0.3)"  },
  ];

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  const ytWarn = youtubePending > 0 && youtubePending < 5;
  const healthItems: { label:string; ok:boolean; okText:string; failText:string; warn?:boolean }[] = [
    { label:"Anthropic API key", ok:aiKeySet===true,             okText:"Configured",           failText:"Not set — AI disabled" },
    { label:"YouTube queue",      ok:youtubePending===0,          okText:"All clear",            failText:`${youtubePending} awaiting approval`, warn: ytWarn },
    { label:"Unstaffed classes",  ok:unstaffedClasses.length===0, okText:"Every class staffed",  failText:`${unstaffedClasses.length} unstaffed` },
  ];

  const surface   = dk ? "rgba(255,255,255,0.03)" : "rgba(255,255,255,0.9)";
  const border    = dk ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.07)";
  const text1     = dk ? "#f1f5f9" : "#0f172a";
  const text2     = dk ? "rgba(255,255,255,0.45)" : "rgba(0,0,0,0.45)";
  const cardStyle = { background:surface, border:`1px solid ${border}`, borderRadius:20, backdropFilter:"blur(16px)" } as const;

  const STATS = [
    { label:"Classes" as keyof typeof STAT_COLORS,    value:classes.length,  icon:School,        ...STAT_COLORS["Classes"]     },
    { label:"Teachers" as keyof typeof STAT_COLORS,   value:totalTeachers,   icon:GraduationCap, ...STAT_COLORS["Teachers"]    },
    { label:"Students" as keyof typeof STAT_COLORS,   value:totalStudents,   icon:Users,         ...STAT_COLORS["Students"]    },
    { label:"YT Pending" as keyof typeof STAT_COLORS, value:youtubePending,  icon:Youtube,       ...STAT_COLORS["YT Pending"]  },
  ];

  const activityFeed = buildActivity(students, teachers, youtubePending);

  /* ─── section divider ─── */
  const Divider = ({ label }: { label: string }) => (
    <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:14 }}>
      <div style={{ fontSize:10, fontWeight:700, letterSpacing:"0.18em", textTransform:"uppercase", color:text2, whiteSpace:"nowrap" }}>{label}</div>
      <div style={{ flex:1, height:1, background:border }} />
    </div>
  );

  return (
    <div style={{ minHeight:"100vh", background:dk?"#070714":"#f0f1f8", color:text1, fontFamily:"'Inter', system-ui, sans-serif" }}>
      <style>{ANIM}</style>

      {/* ─── Hero header ─── */}
      <div style={{
        background: dk
          ? "linear-gradient(160deg,#0d0b1e 0%,#130d2e 55%,#090f1e 100%)"
          : "linear-gradient(160deg,#0ea5e9 0%,#3b82f6 40%,#4f46e5 100%)",
        padding:"32px 32px 32px",
        marginBottom:32,
        position:"relative",
        overflow:"hidden",
      }}>
        <div style={{ position:"absolute",inset:0,background:"radial-gradient(ellipse at 70% 40%,rgba(124,58,237,0.18) 0%,transparent 65%)",pointerEvents:"none" }} />
        <div style={{ position:"absolute",inset:0,background:"radial-gradient(ellipse at 20% 80%,rgba(59,130,246,0.1) 0%,transparent 60%)",pointerEvents:"none" }} />
        <header style={{ maxWidth:"100%", margin:"0 auto", position:"relative", animation:"ad-fadeUp .45s ease both" }}>
          <div style={{ fontSize:11,fontWeight:600,letterSpacing:"0.2em",textTransform:"uppercase",color:"rgba(255,255,255,0.45)",marginBottom:10 }}>
            {new Date().toLocaleDateString("en-US",{weekday:"long",month:"long",day:"numeric"})} · Admin Portal
          </div>
          <div style={{ display:"flex",alignItems:"flex-end",justifyContent:"space-between",gap:16,flexWrap:"wrap" }}>
            <div>
              <h1 style={{ fontSize:38,fontWeight:900,letterSpacing:"-0.035em",margin:0,lineHeight:1.08,color:"white" }}>
                {greeting}, {user?.name?.split(" ")[0] || "Admin"}.
              </h1>
              <p style={{ fontSize:13,marginTop:8,color:"rgba(255,255,255,0.55)",letterSpacing:"0.01em" }}>
                School-wide overview. Flip into any teacher's seat with one click.
              </p>
            </div>
            <div style={{ display:"flex",gap:8,flexWrap:"wrap" }}>
              {classes[0]?.id && (
                <a href={`/board?class=${encodeURIComponent(classes[0].id)}`} target="_blank" rel="noopener noreferrer"
                  style={{ display:"flex",alignItems:"center",gap:7,padding:"9px 18px",borderRadius:12,fontSize:12,fontWeight:700,textDecoration:"none",
                    background:"rgba(255,255,255,0.18)",border:"1px solid rgba(255,255,255,0.3)",color:"white",backdropFilter:"blur(8px)",transition:"background 0.15s" }}>
                  <Tv size={13}/> Open Board
                </a>
              )}
              <Link to="/teacher" style={{ display:"flex",alignItems:"center",gap:7,padding:"9px 18px",borderRadius:12,fontSize:12,fontWeight:600,textDecoration:"none",
                background:"rgba(255,255,255,0.1)",border:"1px solid rgba(255,255,255,0.18)",color:"rgba(255,255,255,0.8)" }}>
                <Eye size={13}/> View as Teacher
              </Link>
              <button onClick={handleExportCSV} style={{ display:"flex",alignItems:"center",gap:7,padding:"9px 18px",borderRadius:12,fontSize:12,fontWeight:600,cursor:"pointer",
                background:"rgba(255,255,255,0.1)",border:"1px solid rgba(255,255,255,0.18)",color:"rgba(255,255,255,0.8)" }}>
                <Download size={13}/> Export CSV
              </button>
              <button onClick={handleForceUnlockAll} style={{ display:"flex",alignItems:"center",gap:7,padding:"9px 18px",borderRadius:12,fontSize:12,fontWeight:600,cursor:"pointer",
                background:"rgba(239,68,68,0.2)",border:"1px solid rgba(239,68,68,0.4)",color:"#fca5a5" }}>
                <LockOpen size={13}/> Force Unlock All
              </button>
            </div>
          </div>
        </header>
      </div>

      <div style={{ padding:"0 32px 56px", maxWidth:"100%", margin:"0 auto" }}>

        {/* ─── Stat cards (with top accent bar) ─── */}
        <div style={{ marginBottom:36, animation:"ad-fadeUp .5s ease .05s both" }}>
          <Divider label="Overview" />
          <div style={{ display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(220px,1fr))",gap:14 }}>
            {STATS.map(s => (
              <div key={s.label} style={{
                ...cardStyle,
                padding:"0 0 20px",
                overflow:"hidden",
                position:"relative",
              }}>
                {/* coloured top bar */}
                <div style={{ height:3, background:s.grad, borderRadius:"20px 20px 0 0", marginBottom:20 }} />
                <div style={{ display:"flex",alignItems:"center",gap:14,padding:"0 22px" }}>
                  <div style={{
                    width:46,height:46,borderRadius:13,background:s.grad,
                    display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,
                    boxShadow:`0 8px 22px ${s.glow}`,
                  }}>
                    <s.icon size={20} color="white"/>
                  </div>
                  <div>
                    <div style={{ fontSize:10,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.18em",color:text2,marginBottom:4 }}>{s.label}</div>
                    <div style={{ fontSize:30,fontWeight:900,lineHeight:1,color:text1,letterSpacing:"-0.03em" }}>{s.value}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ─── Needs attention ─── */}
        {pendingTasks.length > 0 && (
          <div style={{ ...cardStyle,padding:"18px 22px",marginBottom:36,borderLeft:"3px solid rgba(245,158,11,0.7)",animation:"ad-fadeUp .5s ease .1s both" }}>
            <div style={{ display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14 }}>
              <div style={{ display:"flex",alignItems:"center",gap:9 }}>
                <AlertTriangle size={15} style={{ color:"#fbbf24" }} />
                <span style={{ fontSize:13,fontWeight:800,color:text1 }}>Needs attention</span>
              </div>
              <span style={{ fontSize:11,padding:"3px 11px",borderRadius:20,background:"rgba(245,158,11,0.14)",color:"#fbbf24",fontWeight:700,letterSpacing:"0.04em" }}>
                {pendingTasks.length} item{pendingTasks.length===1?"":"s"}
              </span>
            </div>
            <div style={{ display:"flex",flexDirection:"column",gap:5 }}>
              {pendingTasks.map((t, i) => {
                const color = t.severity==="high"?"#f87171":t.severity==="med"?"#fbbf24":"rgba(255,255,255,0.35)";
                const bg    = t.severity==="high"?"rgba(239,68,68,0.07)":t.severity==="med"?"rgba(245,158,11,0.07)":"rgba(255,255,255,0.02)";
                const inner = (
                  <div style={{ display:"flex",alignItems:"center",gap:10,padding:"10px 12px",borderRadius:12,
                    background:bg,border:`1px solid ${t.severity==="high"?"rgba(239,68,68,0.15)":t.severity==="med"?"rgba(245,158,11,0.15)":border}` }}>
                    <div style={{ width:6,height:6,borderRadius:"50%",background:color,flexShrink:0 }} />
                    <div style={{ fontSize:12,color:text1,flex:1,letterSpacing:"0.01em" }}>{t.label}</div>
                    <div style={{ display:"flex",alignItems:"center",gap:6 }}>
                      <span style={{ fontSize:10,fontWeight:800,textTransform:"uppercase",letterSpacing:"0.12em",color,flexShrink:0 }}>
                        {t.severity==="high"?"High":t.severity==="med"?"Med":"Low"}
                      </span>
                      <ArrowRight size={11} style={{ color, opacity:0.6 }} />
                    </div>
                  </div>
                );
                if (t.link==="#gen-warnings") {
                  return <button key={i} onClick={() => setShowWarnings(v => !v)} style={{ background:"transparent",border:"none",cursor:"pointer",textAlign:"left",display:"block",width:"100%",padding:0 }}>{inner}</button>;
                }
                return <Link key={i} to={t.link} style={{ textDecoration:"none",display:"block" }}>{inner}</Link>;
              })}
            </div>
            {showWarnings && genWarnings.length > 0 && (
              <div style={{ marginTop:14,padding:14,borderRadius:14,background:dk?"rgba(255,255,255,0.02)":"rgba(0,0,0,0.02)",border:`1px solid ${border}`,maxHeight:280,overflowY:"auto" }}>
                <div style={{ fontSize:10,fontWeight:700,marginBottom:10,color:text2,textTransform:"uppercase",letterSpacing:"0.15em" }}>CCSS Validator flags</div>
                {genWarnings.map((w: any) => {
                  let reasons: string[] = [];
                  try { reasons = JSON.parse(w.generation_warnings || "[]"); } catch {}
                  return (
                    <div key={w.id} style={{ marginBottom:10,paddingBottom:10,borderBottom:`1px solid ${border}` }}>
                      <div style={{ fontSize:10,color:text2 }}>{w.date} · {w.subject} · grade {w.target_grade??"?"}</div>
                      <div style={{ fontSize:12,color:text1,marginTop:3 }}>{w.prompt}</div>
                      <div style={{ fontSize:11,color:"#fbbf24",marginTop:3 }}>{reasons.join("; ")}</div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ─── Admin Tools ─── */}
        <div style={{ marginBottom:36, animation:"ad-fadeUp .5s ease .14s both" }}>
          <Divider label="Admin Tools" />
          <div style={{ display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(148px,1fr))",gap:10 }}>
            {ADMIN_TOOLS.map((t, i) => (
              <Link key={t.path} to={t.path} style={{
                display:"flex",flexDirection:"column",gap:0,padding:0,borderRadius:16,textDecoration:"none",
                background:surface,border:`1px solid ${border}`,transition:"all 0.2s ease",overflow:"hidden",
                animation:"ad-fadeUp .45s ease both",animationDelay:`${i*35}ms`,
              }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.transform="translateY(-4px)"; (e.currentTarget as HTMLElement).style.boxShadow=`0 12px 32px ${t.glow}`; (e.currentTarget as HTMLElement).style.borderColor=`rgba(255,255,255,0.12)`; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform=""; (e.currentTarget as HTMLElement).style.boxShadow=""; (e.currentTarget as HTMLElement).style.borderColor=border; }}>
                {/* coloured top stripe */}
                <div style={{ height:2, background:t.grad }} />
                <div style={{ padding:"14px 14px 16px", display:"flex", flexDirection:"column", gap:11 }}>
                  <div style={{ width:40,height:40,borderRadius:12,background:t.grad,display:"flex",alignItems:"center",justifyContent:"center",boxShadow:`0 6px 16px ${t.glow}` }}>
                    <t.icon size={18} color="white"/>
                  </div>
                  <div>
                    <div style={{ fontSize:12,fontWeight:700,color:text1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",letterSpacing:"0.01em" }}>{t.label}</div>
                    <div style={{ fontSize:10,color:text2,marginTop:3,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap" }}>{t.desc}</div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>

        {/* ─── Classrooms + People ─── */}
        <div style={{ marginBottom:36, animation:"ad-fadeUp .5s ease .18s both" }}>
          <Divider label="Roster" />
          <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:16 }}>
            {/* Classrooms */}
            <div style={{ ...cardStyle,padding:"20px 22px" }}>
              <div style={{ display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:16 }}>
                <div>
                  <div style={{ fontSize:10,fontWeight:700,letterSpacing:"0.18em",textTransform:"uppercase",color:text2,marginBottom:4 }}>All Rooms</div>
                  <div style={{ fontSize:17,fontWeight:800,color:text1,letterSpacing:"-0.02em" }}>Classrooms</div>
                </div>
                <span style={{ fontSize:11,padding:"4px 12px",borderRadius:20,background:dk?"rgba(255,255,255,0.05)":"rgba(0,0,0,0.05)",color:text2,fontWeight:700,border:`1px solid ${border}` }}>
                  {classes.length} total
                </span>
              </div>
              {classes.length === 0
                ? <p style={{ fontSize:12,textAlign:"center",padding:"32px 0",color:text2 }}>No classes created yet.</p>
                : (
                  <div style={{ display:"flex",flexDirection:"column",gap:3 }}>
                    {classes.map(c => {
                      const teacher = teachers.find(t => t.id === c.teacher_id);
                      const sCount  = studentsByClass[c.id] ?? 0;
                      return (
                        <div key={c.id} style={{ display:"flex",alignItems:"center",gap:12,padding:"9px 10px",borderRadius:12,border:`1px solid transparent`,
                          transition:"all 0.15s ease" }}
                          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background=dk?"rgba(255,255,255,0.035)":"rgba(0,0,0,0.025)"; (e.currentTarget as HTMLElement).style.borderColor=border; }}
                          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background="transparent"; (e.currentTarget as HTMLElement).style.borderColor="transparent"; }}>
                          <div style={{ width:32,height:32,borderRadius:9,background:"linear-gradient(135deg,#8b5cf6,#6d28d9)",display:"flex",alignItems:"center",justifyContent:"center",color:"white",fontSize:12,fontWeight:800,flexShrink:0,boxShadow:"0 4px 12px rgba(139,92,246,0.25)" }}>
                            {c.name?.charAt(0).toUpperCase()}
                          </div>
                          <div style={{ flex:1,minWidth:0 }}>
                            <div style={{ fontSize:12,fontWeight:600,color:text1,display:"flex",alignItems:"center",gap:6 }}>
                              {c.name}
                              <span style={{ fontSize:9,fontFamily:"monospace",color:text2,background:dk?"rgba(255,255,255,0.06)":"rgba(0,0,0,0.06)",padding:"1px 5px",borderRadius:4 }}>{c.code}</span>
                            </div>
                            <div style={{ fontSize:10,color:text2,marginTop:2,display:"flex",alignItems:"center",gap:5 }}>
                              {teacher?.name||"No teacher"}
                              <span style={{ opacity:0.35 }}>·</span>
                              <span style={{ color:sCount>0?text2:"#f87171" }}>{sCount} student{sCount===1?"":"s"}</span>
                            </div>
                          </div>
                          <Link to="/monitor" style={{ fontSize:10,fontWeight:700,color:"#a78bfa",textDecoration:"none",padding:"4px 9px",borderRadius:7,background:"rgba(124,58,237,0.1)",border:"1px solid rgba(124,58,237,0.2)",whiteSpace:"nowrap" }}>Monitor</Link>
                        </div>
                      );
                    })}
                  </div>
                )
              }
            </div>

            {/* People */}
            <div style={{ ...cardStyle,padding:"20px 22px" }}>
              <div style={{ display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:16 }}>
                <div>
                  <div style={{ fontSize:10,fontWeight:700,letterSpacing:"0.18em",textTransform:"uppercase",color:text2,marginBottom:4 }}>Staff</div>
                  <div style={{ fontSize:17,fontWeight:800,color:text1,letterSpacing:"-0.02em" }}>People</div>
                </div>
                <span style={{ fontSize:11,padding:"4px 12px",borderRadius:20,background:dk?"rgba(255,255,255,0.05)":"rgba(0,0,0,0.05)",color:text2,fontWeight:700,border:`1px solid ${border}` }}>
                  {totalTeachers} teachers · {teachers.length-totalTeachers} admins
                </span>
              </div>
              {teachers.length === 0
                ? <p style={{ fontSize:12,textAlign:"center",padding:"32px 0",color:text2 }}>No teachers or admins yet.</p>
                : (
                  <div style={{ display:"flex",flexDirection:"column",gap:3 }}>
                    {teachers.map(t => {
                      const owns = classes.filter(c => c.teacher_id === t.id);
                      return (
                        <div key={t.id} style={{ display:"flex",alignItems:"center",gap:12,padding:"9px 10px",borderRadius:12,border:`1px solid transparent`,transition:"all 0.15s ease" }}
                          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background=dk?"rgba(255,255,255,0.035)":"rgba(0,0,0,0.025)"; (e.currentTarget as HTMLElement).style.borderColor=border; }}
                          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background="transparent"; (e.currentTarget as HTMLElement).style.borderColor="transparent"; }}>
                          <div style={{ width:32,height:32,borderRadius:9,flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center",color:"white",fontSize:12,fontWeight:800,
                            background:t.role==="admin"?"linear-gradient(135deg,#ef4444,#dc2626)":"linear-gradient(135deg,#14b8a6,#0d9488)",
                            boxShadow:t.role==="admin"?"0 4px 12px rgba(239,68,68,0.25)":"0 4px 12px rgba(20,184,166,0.25)",
                          }}>
                            {t.name?.charAt(0).toUpperCase()}
                          </div>
                          <div style={{ minWidth:0,flex:1 }}>
                            <div style={{ fontSize:12,fontWeight:600,color:text1,display:"flex",alignItems:"center",gap:6 }}>
                              {t.name}
                              {t.role==="admin" && <span style={{ fontSize:9,fontWeight:800,padding:"2px 6px",borderRadius:5,background:"rgba(239,68,68,0.12)",color:"#f87171",letterSpacing:"0.06em" }}>ADMIN</span>}
                            </div>
                            <div style={{ fontSize:10,color:text2,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",marginTop:2 }}>
                              {t.email} · {owns.length>0?`Teaches ${owns.map((c:any)=>c.name).join(", ")}`:"No classes"}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )
              }
            </div>
          </div>
        </div>

        {/* ─── Students admin panel ─── */}
        <StudentsAdminPanel
          students={students}
          classes={classes}
          cardStyle={cardStyle}
          dk={dk}
          border={border}
          text1={text1}
          text2={text2}
          Divider={Divider}
          onStudentUpdated={(updated) => {
            setStudents(list => list.map(s => s.id === updated.id ? { ...s, ...updated } : s));
          }}
        />

        {/* ─── System Health + Recent Activity ─── */}
        <div style={{ marginBottom:36, animation:"ad-fadeUp .5s ease .22s both" }}>
          <Divider label="Platform" />
          <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:16 }}>

            {/* System Health */}
            <div style={{ ...cardStyle,padding:"20px 22px" }}>
              <div style={{ display:"flex",alignItems:"center",gap:8,marginBottom:16 }}>
                <CircleDot size={14} style={{ color:"#34d399", animation:"ad-dot-pulse 2.4s ease infinite" }} />
                <div style={{ fontSize:13,fontWeight:800,letterSpacing:"-0.01em",color:text1 }}>System Health</div>
              </div>
              <div style={{ display:"flex",flexDirection:"column",gap:8 }}>
                {healthItems.map(s => {
                  const color = s.ok ? "#34d399" : s.warn ? "#fbbf24" : "#f87171";
                  const bg    = s.ok ? "rgba(52,211,153,0.07)" : s.warn ? "rgba(251,191,36,0.07)" : "rgba(248,113,113,0.07)";
                  const bdr   = s.ok ? "rgba(52,211,153,0.2)" : s.warn ? "rgba(251,191,36,0.2)" : "rgba(248,113,113,0.2)";
                  return (
                    <div key={s.label} style={{ display:"flex",alignItems:"center",gap:12,padding:"12px 14px",borderRadius:12,background:bg,border:`1px solid ${bdr}` }}>
                      <div style={{ width:7,height:7,borderRadius:"50%",background:color,flexShrink:0 }} />
                      <div style={{ flex:1 }}>
                        <div style={{ fontSize:10,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.14em",color:text2,marginBottom:2 }}>{s.label}</div>
                        <div style={{ fontSize:12,fontWeight:700,color }}>{s.ok ? s.okText : s.failText}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Recent Activity feed */}
            <div style={{ ...cardStyle,padding:"20px 22px" }}>
              <div style={{ display:"flex",alignItems:"center",gap:8,marginBottom:16 }}>
                <Sparkles size={14} style={{ color:"#a78bfa" }} />
                <div style={{ fontSize:13,fontWeight:800,letterSpacing:"-0.01em",color:text1 }}>Recent Activity</div>
              </div>
              {activityFeed.length === 0 ? (
                <div style={{ textAlign:"center",padding:"32px 0" }}>
                  <div style={{ width:40,height:40,borderRadius:12,background:dk?"rgba(255,255,255,0.04)":"rgba(0,0,0,0.04)",display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 12px",border:`1px solid ${border}` }}>
                    <Sparkles size={18} style={{ opacity:0.2 }} />
                  </div>
                  <p style={{ fontSize:12,color:text2,lineHeight:1.6 }}>No activity to show yet. Add students and teachers to get started.</p>
                </div>
              ) : (
                <div style={{ display:"flex",flexDirection:"column",gap:2 }}>
                  {activityFeed.map((a, i) => (
                    <div key={i} style={{ display:"flex",alignItems:"center",gap:11,padding:"9px 0",borderBottom:i<activityFeed.length-1?`1px solid ${border}`:"none" }}>
                      <div style={{ width:28,height:28,borderRadius:8,background:`${a.color}18`,border:`1px solid ${a.color}30`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0 }}>
                        <a.icon size={13} style={{ color:a.color }} />
                      </div>
                      <div style={{ flex:1,minWidth:0 }}>
                        <div style={{ fontSize:12,fontWeight:600,color:text1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap" }}>{a.label}</div>
                        <div style={{ fontSize:10,color:text2,marginTop:1 }}>{a.sub}</div>
                      </div>
                      <span style={{ fontSize:10,color:text2,flexShrink:0,whiteSpace:"nowrap" }}>{a.time}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}

/* ─── Student admin panel: search + per-row reset password + edit ─── */
function StudentsAdminPanel({
  students, classes, cardStyle, dk, border, text1, text2, Divider, onStudentUpdated,
}: {
  students: any[]; classes: any[]; cardStyle: React.CSSProperties;
  dk: boolean; border: string; text1: string; text2: string;
  Divider: (props: { label: string }) => React.JSX.Element;
  onStudentUpdated: (updated: any) => void;
}) {
  const [query, setQuery] = useState("");
  const [pwOpen, setPwOpen] = useState<string | null>(null);
  const [pwValue, setPwValue] = useState("");
  const [pwSaving, setPwSaving] = useState(false);
  const [pwDone, setPwDone] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editSaving, setEditSaving] = useState(false);

  const filtered = query.trim()
    ? students.filter(s =>
        (s.name || "").toLowerCase().includes(query.toLowerCase()) ||
        (s.email || "").toLowerCase().includes(query.toLowerCase()))
    : students;

  const resetPassword = async (id: string) => {
    if (!pwValue.trim()) return;
    setPwSaving(true);
    try {
      await api.resetUserPassword(id, pwValue.trim());
      setPwDone(id);
      setPwValue("");
      setPwOpen(null);
      setTimeout(() => setPwDone(null), 2500);
    } catch (e: any) {
      alert("Reset failed: " + (e?.message || "unknown"));
    } finally {
      setPwSaving(false);
    }
  };

  const saveEdit = async (id: string) => {
    if (!editName.trim() && !editEmail.trim()) return;
    setEditSaving(true);
    try {
      const updates: any = {};
      if (editName.trim()) updates.name = editName.trim();
      if (editEmail.trim()) updates.email = editEmail.trim();
      const updated = await api.updateUser(id, updates);
      onStudentUpdated(updated);
      setEditOpen(null);
    } catch (e: any) {
      alert("Save failed: " + (e?.message || "unknown"));
    } finally {
      setEditSaving(false);
    }
  };

  const openEdit = (s: any) => {
    setEditName(s.name || "");
    setEditEmail(s.email || "");
    setEditOpen(s.id);
  };

  return (
    <div style={{ marginBottom: 36, animation: "ad-fadeUp .5s ease .2s both" }}>
      <Divider label="Students" />
      <div style={{ ...cardStyle, padding: "20px 22px" }}>
        {/* Header + search */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.18em", textTransform: "uppercase", color: text2, marginBottom: 4 }}>Manage accounts</div>
            <div style={{ fontSize: 17, fontWeight: 800, color: text1, letterSpacing: "-0.02em" }}>All Students</div>
          </div>
          <div style={{ position: "relative", minWidth: 220 }}>
            <Search size={13} style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", color: text2 }} />
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search by name or email…"
              style={{
                width: "100%", boxSizing: "border-box",
                padding: "8px 12px 8px 32px", fontSize: 12, borderRadius: 10,
                background: dk ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.03)",
                border: `1px solid ${border}`, color: text1, outline: "none",
              }}
            />
          </div>
        </div>

        {/* List */}
        {filtered.length === 0 ? (
          <p style={{ fontSize: 12, textAlign: "center", padding: "32px 0", color: text2 }}>
            {query ? "No students match that search." : "No students yet."}
          </p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 440, overflowY: "auto", paddingRight: 4 }}>
            {filtered.map(s => {
              const initial = (s.name || "?").charAt(0).toUpperCase();
              const isPwOpen = pwOpen === s.id;
              const isEditOpen = editOpen === s.id;
              const justReset = pwDone === s.id;
              return (
                <div key={s.id} style={{
                  padding: "10px 12px", borderRadius: 12, border: `1px solid ${isPwOpen || isEditOpen ? "rgba(139,92,246,0.35)" : "transparent"}`,
                  background: isPwOpen || isEditOpen ? (dk ? "rgba(139,92,246,0.05)" : "rgba(139,92,246,0.04)") : "transparent",
                  transition: "all 0.15s ease",
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <div style={{
                      width: 32, height: 32, borderRadius: 9, flexShrink: 0,
                      background: "linear-gradient(135deg,#3b82f6,#2563eb)",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      color: "white", fontSize: 12, fontWeight: 800,
                      boxShadow: "0 4px 12px rgba(59,130,246,0.25)",
                    }}>
                      {s.avatar_emoji || initial}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: text1, display: "flex", alignItems: "center", gap: 8 }}>
                        {s.name}
                        {justReset && (
                          <span style={{ fontSize: 10, fontWeight: 700, color: "#34d399", display: "flex", alignItems: "center", gap: 3 }}>
                            <Check size={11} /> Password updated
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: 10, color: text2, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {s.email || "no email"}
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                      <button
                        onClick={() => { setEditOpen(null); openEdit(s); setPwOpen(null); }}
                        title="Edit student"
                        style={{
                          padding: "6px 10px", fontSize: 10, fontWeight: 700, cursor: "pointer",
                          border: `1px solid ${border}`, borderRadius: 8,
                          background: dk ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.03)",
                          color: text1, display: "flex", alignItems: "center", gap: 4,
                        }}
                      >
                        <Pencil size={11} /> Edit
                      </button>
                      <button
                        onClick={() => { setPwOpen(isPwOpen ? null : s.id); setPwValue(""); setEditOpen(null); }}
                        title="Reset password"
                        style={{
                          padding: "6px 10px", fontSize: 10, fontWeight: 700, cursor: "pointer",
                          border: "1px solid rgba(139,92,246,0.35)", borderRadius: 8,
                          background: "rgba(139,92,246,0.12)",
                          color: "#c4b5fd", display: "flex", alignItems: "center", gap: 4,
                        }}
                      >
                        <KeyRound size={11} /> Reset
                      </button>
                    </div>
                  </div>

                  {/* Reset password inline */}
                  {isPwOpen && (
                    <div style={{ marginTop: 10, padding: "10px 12px", borderRadius: 10, background: dk ? "rgba(0,0,0,0.2)" : "rgba(0,0,0,0.03)", display: "flex", gap: 8, alignItems: "center" }}>
                      <input
                        autoFocus
                        type="text"
                        value={pwValue}
                        onChange={e => setPwValue(e.target.value)}
                        onKeyDown={e => e.key === "Enter" && resetPassword(s.id)}
                        placeholder="New passcode…"
                        style={{
                          flex: 1, padding: "7px 10px", fontSize: 12, borderRadius: 8,
                          background: dk ? "rgba(255,255,255,0.06)" : "white",
                          border: `1px solid ${border}`, color: text1, outline: "none",
                        }}
                      />
                      <button
                        disabled={pwSaving || !pwValue.trim()}
                        onClick={() => resetPassword(s.id)}
                        style={{
                          padding: "7px 14px", fontSize: 11, fontWeight: 700, cursor: pwSaving || !pwValue.trim() ? "default" : "pointer",
                          border: "none", borderRadius: 8,
                          background: pwSaving || !pwValue.trim() ? (dk ? "rgba(255,255,255,0.06)" : "#e5e7eb") : "linear-gradient(135deg,#7c3aed,#6d28d9)",
                          color: pwSaving || !pwValue.trim() ? text2 : "white",
                          opacity: pwSaving ? 0.6 : 1,
                        }}
                      >
                        {pwSaving ? "Saving…" : "Save"}
                      </button>
                      <button
                        onClick={() => { setPwOpen(null); setPwValue(""); }}
                        style={{
                          padding: "7px 8px", fontSize: 11, cursor: "pointer",
                          border: "none", borderRadius: 8,
                          background: "transparent", color: text2,
                          display: "flex", alignItems: "center",
                        }}
                      >
                        <X size={14} />
                      </button>
                    </div>
                  )}

                  {/* Edit profile inline */}
                  {isEditOpen && (
                    <div style={{ marginTop: 10, padding: "10px 12px", borderRadius: 10, background: dk ? "rgba(0,0,0,0.2)" : "rgba(0,0,0,0.03)", display: "flex", flexDirection: "column", gap: 8 }}>
                      <div style={{ display: "flex", gap: 8 }}>
                        <input
                          autoFocus
                          type="text"
                          value={editName}
                          onChange={e => setEditName(e.target.value)}
                          placeholder="Name"
                          style={{
                            flex: 1, padding: "7px 10px", fontSize: 12, borderRadius: 8,
                            background: dk ? "rgba(255,255,255,0.06)" : "white",
                            border: `1px solid ${border}`, color: text1, outline: "none",
                          }}
                        />
                        <input
                          type="email"
                          value={editEmail}
                          onChange={e => setEditEmail(e.target.value)}
                          placeholder="email@example.com"
                          style={{
                            flex: 1, padding: "7px 10px", fontSize: 12, borderRadius: 8,
                            background: dk ? "rgba(255,255,255,0.06)" : "white",
                            border: `1px solid ${border}`, color: text1, outline: "none",
                          }}
                        />
                      </div>
                      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                        <button
                          onClick={() => setEditOpen(null)}
                          style={{
                            padding: "7px 14px", fontSize: 11, cursor: "pointer",
                            border: `1px solid ${border}`, borderRadius: 8,
                            background: "transparent", color: text2,
                          }}
                        >
                          Cancel
                        </button>
                        <button
                          disabled={editSaving}
                          onClick={() => saveEdit(s.id)}
                          style={{
                            padding: "7px 14px", fontSize: 11, fontWeight: 700, cursor: editSaving ? "default" : "pointer",
                            border: "none", borderRadius: 8,
                            background: "linear-gradient(135deg,#7c3aed,#6d28d9)",
                            color: "white", opacity: editSaving ? 0.6 : 1,
                          }}
                        >
                          {editSaving ? "Saving…" : "Save"}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
        <div style={{ marginTop: 14, fontSize: 10, color: text2, textAlign: "center" }}>
          Showing {filtered.length} of {students.length} students
        </div>
      </div>
    </div>
  );
}
