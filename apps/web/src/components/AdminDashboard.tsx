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

const ANIM = `
  @keyframes ad-fadeUp { from { opacity:0; transform:translateY(14px); } to { opacity:1; transform:translateY(0); } }
  @keyframes ad-shimmer { 0%{background-position:-200% center;} 100%{background-position:200% center;} }
`;

export default function AdminDashboard() {
  const { user } = useAuth();
  const { theme } = useTheme();
  const dk = theme === "dark";

  const [classes, setClasses]           = useState<any[]>([]);
  const [teachers, setTeachers]         = useState<any[]>([]);
  const [students, setStudents]         = useState<any[]>([]);
  const [studentsByClass, setStudentsByClass] = useState<Record<string, number>>({});
  const [youtubePending, setYoutubePending]   = useState(0);
  const [aiKeySet, setAiKeySet]         = useState<boolean | null>(null);
  const [genWarnings, setGenWarnings]   = useState<any[]>([]);
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
    fetch("/api/ai-tasks/task-config", { headers: { Authorization: "Bearer " + localStorage.getItem("token") } })
      .then(r => setAiKeySet(r.status !== 503)).catch(() => setAiKeySet(false));
    fetch("/api/ai-tasks/recent-warnings", { headers: { Authorization: "Bearer " + localStorage.getItem("token") } })
      .then(r => r.ok ? r.json() : []).then(rows => setGenWarnings(Array.isArray(rows) ? rows : [])).catch(() => setGenWarnings([]));
  }, []);

  const totalStudents = students.length;
  const totalTeachers = teachers.filter(t => t.role === "teacher").length;

  const handleForceUnlockAll = async () => {
    if (!confirm("Force-unlock EVERY class system-wide?")) return;
    try { await api.forceUnlockAll(); alert("✓ All classes unlocked."); }
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
  if (aiKeySet === false)      pendingTasks.push({ severity:"high", label:"Anthropic API key not configured — AI disabled",      link:"/settings" });
  if (youtubePending > 0)      pendingTasks.push({ severity:youtubePending>5?"high":"med", label:`${youtubePending} YouTube link${youtubePending===1?"":"s"} waiting`, link:"/youtube" });
  if (unstaffedClasses.length) pendingTasks.push({ severity:"high", label:`${unstaffedClasses.length} class${unstaffedClasses.length===1?"":"es"} without a teacher`, link:"/admin-dashboard" });
  if (emptyClasses.length)     pendingTasks.push({ severity:"low",  label:`${emptyClasses.length} empty class${emptyClasses.length===1?"":"es"} (no students)`, link:"/admin-dashboard" });
  if (totalTeachers === 0)     pendingTasks.push({ severity:"high", label:"No teachers on the platform yet", link:"/admin-dashboard" });
  if (genWarnings.length)      pendingTasks.push({ severity:"med",  label:`⚠️ ${genWarnings.length} off-grade task${genWarnings.length===1?"":"s"} flagged by CCSS`, link:"#gen-warnings" });

  const ADMIN_TOOLS = [
    { path:"/monitor",         icon:Monitor,       label:"Live Monitor",   desc:"Every student",           grad:"linear-gradient(135deg,#ec4899,#f43f5e)", glow:"rgba(236,72,153,0.3)"  },
    { path:"/class-grades",    icon:GraduationCap, label:"Class Grades",   desc:"Per-student levels",      grad:"linear-gradient(135deg,#14b8a6,#0d9488)", glow:"rgba(20,184,166,0.3)"  },
    { path:"/assignments",     icon:ClipboardList, label:"Assignments",    desc:"Create & manage",         grad:"linear-gradient(135deg,#8b5cf6,#7c3aed)", glow:"rgba(139,92,246,0.3)"  },
    { path:"/youtube",         icon:Youtube,       label:"YouTube Queue",  desc:`${youtubePending} pending`, grad:"linear-gradient(135deg,#ef4444,#dc2626)", glow:"rgba(239,68,68,0.3)"  },
    { path:"/analytics",       icon:BarChart3,     label:"Analytics",      desc:"School-wide reports",     grad:"linear-gradient(135deg,#f59e0b,#d97706)", glow:"rgba(245,158,11,0.3)"  },
    { path:"/leaderboard",     icon:Trophy,        label:"Leaderboard",    desc:"Rankings",                grad:"linear-gradient(135deg,#eab308,#ca8a04)", glow:"rgba(234,179,8,0.3)"   },
    { path:"/lesson-analytics",icon:BookOpen,      label:"Lesson Views",   desc:"Who read what",           grad:"linear-gradient(135deg,#6366f1,#4f46e5)", glow:"rgba(99,102,241,0.3)"  },
    { path:"/grading",         icon:CheckSquare,   label:"Grading",        desc:"Review work",             grad:"linear-gradient(135deg,#10b981,#059669)", glow:"rgba(16,185,129,0.3)"  },
    { path:"/quizzes",         icon:HelpCircle,    label:"Quizzes",        desc:"Build & grade",           grad:"linear-gradient(135deg,#3b82f6,#2563eb)", glow:"rgba(59,130,246,0.3)"  },
  ];

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  const ytWarn = youtubePending > 0 && youtubePending < 5;
  const healthItems: { label:string; ok:boolean; okText:string; failText:string; warn?:boolean }[] = [
    { label:"Anthropic API key", ok:aiKeySet===true,             okText:"Configured",           failText:"Not set — AI disabled" },
    { label:"YouTube queue",      ok:youtubePending===0,          okText:"All clear",            failText:`${youtubePending} awaiting approval`, warn: ytWarn },
    { label:"Unstaffed classes",  ok:unstaffedClasses.length===0, okText:"Every class staffed",  failText:`${unstaffedClasses.length} unstaffed` },
  ];

  const surface = dk ? "rgba(255,255,255,0.04)" : "rgba(255,255,255,0.9)";
  const border  = dk ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)";
  const text1   = dk ? "#f1f5f9" : "#0f172a";
  const text2   = dk ? "rgba(255,255,255,0.5)" : "rgba(0,0,0,0.5)";
  const card = { background:surface, border:`1px solid ${border}`, borderRadius:16, backdropFilter:"blur(12px)" } as const;

  const STATS = [
    { label:"Classes",    value:classes.length,  icon:School,       grad:"linear-gradient(135deg,#8b5cf6,#7c3aed)", glow:"rgba(139,92,246,0.35)" },
    { label:"Teachers",   value:totalTeachers,   icon:GraduationCap,grad:"linear-gradient(135deg,#14b8a6,#0d9488)", glow:"rgba(20,184,166,0.35)" },
    { label:"Students",   value:totalStudents,   icon:Users,        grad:"linear-gradient(135deg,#3b82f6,#2563eb)", glow:"rgba(59,130,246,0.35)" },
    { label:"YT Pending", value:youtubePending,  icon:Youtube,      grad:"linear-gradient(135deg,#ef4444,#dc2626)", glow:"rgba(239,68,68,0.35)"  },
  ];

  return (
    <div style={{ minHeight:"100vh", background:dk?"#070714":"#f0f1f8", color:text1, fontFamily:"'Inter', system-ui, sans-serif" }}>
      <style>{ANIM}</style>

      {/* ── Hero header ── */}
      <div style={{
        background:dk
          ?"linear-gradient(135deg,#0d0d28 0%,#1a0a3a 60%,#0a1228 100%)"
          :"linear-gradient(135deg,#0ea5e9 0%,#3b82f6 40%,#4f46e5 100%)",
        padding:"28px 32px 28px", marginBottom:28,
        position:"relative", overflow:"hidden",
      }}>
        <div style={{ position:"absolute",inset:0,background:"radial-gradient(ellipse at 80% 50%,rgba(255,255,255,0.06) 0%,transparent 60%)",pointerEvents:"none" }} />
        <header style={{ maxWidth:1280, margin:"0 auto", position:"relative", animation:"ad-fadeUp .5s ease both" }}>
          <div style={{ fontSize:11,fontWeight:600,letterSpacing:"0.18em",textTransform:"uppercase",color:"rgba(255,255,255,0.6)",marginBottom:8 }}>
            {new Date().toLocaleDateString("en-US",{weekday:"long",month:"long",day:"numeric"})} · Admin
          </div>
          <div style={{ display:"flex",alignItems:"flex-end",justifyContent:"space-between",gap:16,flexWrap:"wrap" }}>
            <div>
              <h1 style={{ fontSize:40,fontWeight:900,letterSpacing:"-0.03em",margin:0,lineHeight:1.05,color:"white" }}>
                {greeting}, {user?.name?.split(" ")[0] || "Admin"}.
              </h1>
              <p style={{ fontSize:13,marginTop:6,color:"rgba(255,255,255,0.65)" }}>
                School-wide overview. Flip into any teacher's seat with one click.
              </p>
            </div>
            <div style={{ display:"flex",gap:8,flexWrap:"wrap" }}>
              {classes[0]?.id && (
                <a href={`/board?class=${encodeURIComponent(classes[0].id)}`} target="_blank" rel="noopener noreferrer"
                  style={{ display:"flex",alignItems:"center",gap:6,padding:"8px 16px",borderRadius:10,fontSize:12,fontWeight:700,textDecoration:"none",
                    background:"rgba(255,255,255,0.2)",border:"1px solid rgba(255,255,255,0.35)",color:"white",backdropFilter:"blur(8px)" }}>
                  <Tv size={13}/> Open Board
                </a>
              )}
              <Link to="/teacher" style={{ display:"flex",alignItems:"center",gap:6,padding:"8px 16px",borderRadius:10,fontSize:12,fontWeight:600,textDecoration:"none",background:"rgba(255,255,255,0.12)",border:"1px solid rgba(255,255,255,0.25)",color:"rgba(255,255,255,0.85)" }}>
                <Eye size={13}/> View as Teacher
              </Link>
              <button onClick={handleExportCSV} style={{ display:"flex",alignItems:"center",gap:6,padding:"8px 16px",borderRadius:10,fontSize:12,fontWeight:600,cursor:"pointer",background:"rgba(255,255,255,0.12)",border:"1px solid rgba(255,255,255,0.25)",color:"rgba(255,255,255,0.85)" }}>
                <Download size={13}/> Export Students
              </button>
              <button onClick={handleForceUnlockAll} style={{ display:"flex",alignItems:"center",gap:6,padding:"8px 16px",borderRadius:10,fontSize:12,fontWeight:600,cursor:"pointer",background:"rgba(239,68,68,0.25)",border:"1px solid rgba(239,68,68,0.5)",color:"#fecaca" }}>
                <LockOpen size={13}/> Force Unlock All
              </button>
            </div>
          </div>
        </header>
      </div>

      <div style={{ padding:"0 32px 32px", maxWidth:1280, margin:"0 auto" }}>

      {/* ── Stats ── */}
      <div style={{ display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:12,marginBottom:24,animation:"ad-fadeUp .5s ease .06s both" }}>
        {STATS.map(s => (
          <div key={s.label} style={{ ...card, padding:"18px 20px", display:"flex",alignItems:"center",gap:14 }}>
            <div style={{ width:44,height:44,borderRadius:12,background:s.grad,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,boxShadow:`0 4px 16px ${s.glow}` }}>
              <s.icon size={20} color="white"/>
            </div>
            <div>
              <div style={{ fontSize:10,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.15em",color:text2 }}>{s.label}</div>
              <div style={{ fontSize:30,fontWeight:900,lineHeight:1.1,color:text1,letterSpacing:"-0.02em" }}>{s.value}</div>
            </div>
          </div>
        ))}
      </div>

      {/* ── Pending tasks ── */}
      {pendingTasks.length > 0 && (
        <div style={{ ...card,padding:"16px 20px",marginBottom:24,borderLeft:"3px solid #f59e0b",animation:"ad-fadeUp .5s ease .1s both" }}>
          <div style={{ display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12 }}>
            <div style={{ fontSize:13,fontWeight:800,color:text1 }}>
              ⚠️ Needs attention
            </div>
            <span style={{ fontSize:11,padding:"2px 10px",borderRadius:20,background:"rgba(245,158,11,0.18)",color:"#fbbf24",fontWeight:700 }}>
              {pendingTasks.length} item{pendingTasks.length===1?"":"s"}
            </span>
          </div>
          <div style={{ display:"flex",flexDirection:"column",gap:6 }}>
            {pendingTasks.map((t, i) => {
              const color = t.severity==="high"?"#f87171":t.severity==="med"?"#fbbf24":"rgba(255,255,255,0.4)";
              const inner = (
                <div style={{ display:"flex",alignItems:"center",gap:10,padding:"8px 10px",borderRadius:10,
                  background:dk?"rgba(255,255,255,0.03)":"rgba(0,0,0,0.02)",border:`1px solid ${border}` }}>
                  <AlertTriangle size={13} style={{ color,flexShrink:0 }}/>
                  <div style={{ fontSize:12,color:text1,flex:1 }}>{t.label}</div>
                  <span style={{ fontSize:10,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.1em",color,flexShrink:0 }}>
                    {t.severity==="high"?"High":t.severity==="med"?"Med":"Low"}
                  </span>
                </div>
              );
              if (t.link==="#gen-warnings") {
                return <button key={i} onClick={() => setShowWarnings(v => !v)} style={{ background:"transparent",border:"none",cursor:"pointer",textAlign:"left",display:"block",width:"100%" }}>{inner}</button>;
              }
              return <Link key={i} to={t.link} style={{ textDecoration:"none",display:"block" }}>{inner}</Link>;
            })}
          </div>
          {showWarnings && genWarnings.length > 0 && (
            <div style={{ marginTop:12,padding:12,borderRadius:10,background:dk?"rgba(255,255,255,0.03)":"rgba(0,0,0,0.02)",border:`1px solid ${border}`,maxHeight:280,overflowY:"auto" }}>
              <div style={{ fontSize:11,fontWeight:700,marginBottom:8,color:text2 }}>CCSS Validator flags</div>
              {genWarnings.map((w: any) => {
                let reasons: string[] = [];
                try { reasons = JSON.parse(w.generation_warnings || "[]"); } catch {}
                return (
                  <div key={w.id} style={{ marginBottom:10,paddingBottom:10,borderBottom:`1px solid ${border}` }}>
                    <div style={{ fontSize:10,color:text2 }}>{w.date} · {w.subject} · grade {w.target_grade??"?"}</div>
                    <div style={{ fontSize:12,color:text1,marginTop:2 }}>{w.prompt}</div>
                    <div style={{ fontSize:11,color:"#fbbf24",marginTop:2 }}>⚠️ {reasons.join("; ")}</div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Tools grid ── */}
      <div style={{ marginBottom:24, animation:"ad-fadeUp .5s ease .14s both" }}>
        <div style={{ fontSize:11,fontWeight:600,letterSpacing:"0.15em",textTransform:"uppercase",color:text2,marginBottom:12 }}>Admin Tools</div>
        <div style={{ display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(130px,1fr))",gap:10 }}>
          {ADMIN_TOOLS.map((t, i) => (
            <Link key={t.path} to={t.path} style={{
              display:"flex",flexDirection:"column",gap:10,padding:"14px 12px",borderRadius:14,textDecoration:"none",
              background:surface,border:`1px solid ${border}`,transition:"all 0.2s ease",
              animation:"ad-fadeUp .45s ease both",animationDelay:`${i*40}ms`,
            }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.transform="translateY(-3px)"; (e.currentTarget as HTMLElement).style.boxShadow=`0 8px 28px ${t.glow}`; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform=""; (e.currentTarget as HTMLElement).style.boxShadow=""; }}>
              <div style={{ width:36,height:36,borderRadius:10,background:t.grad,display:"flex",alignItems:"center",justifyContent:"center",boxShadow:`0 4px 12px ${t.glow}` }}>
                <t.icon size={17} color="white"/>
              </div>
              <div>
                <div style={{ fontSize:12,fontWeight:700,color:text1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap" }}>{t.label}</div>
                <div style={{ fontSize:10,color:text2,marginTop:2,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap" }}>{t.desc}</div>
              </div>
            </Link>
          ))}
        </div>
      </div>

      {/* ── Classes + Teachers 2-col ── */}
      <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:16,marginBottom:24,animation:"ad-fadeUp .5s ease .18s both" }}>
        {/* Classes */}
        <div style={{ ...card,padding:"18px 20px" }}>
          <div style={{ display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14 }}>
            <div>
              <div style={{ fontSize:11,fontWeight:600,letterSpacing:"0.15em",textTransform:"uppercase",color:text2,marginBottom:3 }}>Every Class</div>
              <div style={{ fontSize:18,fontWeight:800,color:text1 }}>Classrooms</div>
            </div>
            <span style={{ fontSize:11,padding:"3px 10px",borderRadius:20,background:dk?"rgba(255,255,255,0.06)":"rgba(0,0,0,0.06)",color:text2,fontWeight:600 }}>
              {classes.length} total
            </span>
          </div>
          {classes.length === 0
            ? <p style={{ fontSize:12,textAlign:"center",padding:"28px 0",color:text2 }}>No classes created yet.</p>
            : (
              <div style={{ display:"flex",flexDirection:"column",gap:4 }}>
                {classes.map(c => {
                  const teacher = teachers.find(t => t.id === c.teacher_id);
                  return (
                    <div key={c.id} style={{ display:"flex",alignItems:"center",gap:10,padding:"8px 10px",borderRadius:10,border:`1px solid transparent`,
                      transition:"all 0.15s ease" }}
                      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background=dk?"rgba(255,255,255,0.04)":"rgba(0,0,0,0.03)"; (e.currentTarget as HTMLElement).style.borderColor=border; }}
                      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background="transparent"; (e.currentTarget as HTMLElement).style.borderColor="transparent"; }}>
                      <div style={{ width:30,height:30,borderRadius:8,background:"linear-gradient(135deg,#8b5cf6,#7c3aed)",display:"flex",alignItems:"center",justifyContent:"center",color:"white",fontSize:12,fontWeight:800,flexShrink:0 }}>
                        {c.name?.charAt(0).toUpperCase()}
                      </div>
                      <div style={{ flex:1,minWidth:0 }}>
                        <div style={{ fontSize:12,fontWeight:600,color:text1 }}>
                          {c.name}
                          <span style={{ marginLeft:6,fontSize:10,fontFamily:"monospace",color:text2 }}>{c.code}</span>
                        </div>
                        <div style={{ fontSize:10,color:text2 }}>{teacher?.name||"No teacher"} · {studentsByClass[c.id]??"…"} students</div>
                      </div>
                      <Link to="/monitor" style={{ fontSize:10,fontWeight:600,color:"#a78bfa",textDecoration:"none",padding:"3px 8px",borderRadius:6,background:"rgba(124,58,237,0.12)" }}>Monitor →</Link>
                    </div>
                  );
                })}
              </div>
            )
          }
        </div>

        {/* Teachers */}
        <div style={{ ...card,padding:"18px 20px" }}>
          <div style={{ display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14 }}>
            <div>
              <div style={{ fontSize:11,fontWeight:600,letterSpacing:"0.15em",textTransform:"uppercase",color:text2,marginBottom:3 }}>Staff</div>
              <div style={{ fontSize:18,fontWeight:800,color:text1 }}>People</div>
            </div>
            <span style={{ fontSize:11,padding:"3px 10px",borderRadius:20,background:dk?"rgba(255,255,255,0.06)":"rgba(0,0,0,0.06)",color:text2,fontWeight:600 }}>
              {totalTeachers} teachers · {teachers.length-totalTeachers} admins
            </span>
          </div>
          {teachers.length === 0
            ? <p style={{ fontSize:12,textAlign:"center",padding:"28px 0",color:text2 }}>No teachers or admins yet.</p>
            : (
              <div style={{ display:"flex",flexDirection:"column",gap:4 }}>
                {teachers.map(t => {
                  const owns = classes.filter(c => c.teacher_id === t.id);
                  return (
                    <div key={t.id} style={{ display:"flex",alignItems:"center",gap:10,padding:"8px 10px",borderRadius:10,border:`1px solid transparent`,transition:"all 0.15s ease" }}
                      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background=dk?"rgba(255,255,255,0.04)":"rgba(0,0,0,0.03)"; (e.currentTarget as HTMLElement).style.borderColor=border; }}
                      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background="transparent"; (e.currentTarget as HTMLElement).style.borderColor="transparent"; }}>
                      <div style={{ width:30,height:30,borderRadius:8,flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center",color:"white",fontSize:12,fontWeight:800,
                        background:t.role==="admin"?"linear-gradient(135deg,#ef4444,#dc2626)":"linear-gradient(135deg,#14b8a6,#0d9488)",
                        boxShadow:t.role==="admin"?"0 2px 8px rgba(239,68,68,0.3)":"0 2px 8px rgba(20,184,166,0.3)",
                      }}>
                        {t.name?.charAt(0).toUpperCase()}
                      </div>
                      <div style={{ minWidth:0 }}>
                        <div style={{ fontSize:12,fontWeight:600,color:text1,display:"flex",alignItems:"center",gap:6 }}>
                          {t.name}
                          {t.role==="admin" && <span style={{ fontSize:9,fontWeight:800,padding:"1px 5px",borderRadius:4,background:"rgba(239,68,68,0.15)",color:"#f87171" }}>Admin</span>}
                        </div>
                        <div style={{ fontSize:10,color:text2,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap" }}>
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

      {/* ── System Health ── */}
      <div style={{ ...card,padding:"18px 20px",animation:"ad-fadeUp .5s ease .22s both" }}>
        <div style={{ fontSize:11,fontWeight:600,letterSpacing:"0.15em",textTransform:"uppercase",color:text2,marginBottom:12 }}>System Health</div>
        <div style={{ display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10 }}>
          {healthItems.map(s => {
            const color = s.ok ? "#34d399" : s.warn ? "#fbbf24" : "#f87171";
            return (
              <div key={s.label} style={{ padding:"12px 14px",borderRadius:10,borderLeft:`3px solid ${color}`,background:dk?"rgba(255,255,255,0.03)":"rgba(0,0,0,0.02)" }}>
                <div style={{ fontSize:10,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.12em",color:text2,marginBottom:4 }}>{s.label}</div>
                <div style={{ fontSize:12,fontWeight:700,color }}>{s.ok?"✓ ":s.warn?"⚠ ":"✕ "}{s.ok ? s.okText : s.failText}</div>
              </div>
            );
          })}
        </div>
      </div>
      </div>
    </div>
  );
}
