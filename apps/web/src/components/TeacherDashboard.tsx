import React, { useEffect, useState, useCallback } from "react";
import { useAuth } from "../lib/auth.tsx";
import { useTheme } from "../lib/theme.tsx";
import { api } from "../lib/api.ts";
import { Link } from "react-router-dom";
import { getSocket } from "../lib/ws.ts";
import DailyNewsAdmin from "./DailyNewsAdmin.tsx";
import {
  Monitor, ClipboardList, HelpCircle, CheckSquare, BarChart3,
  Lock, LockOpen, Megaphone, Eye, Users, Plus, Activity,
  Youtube, Trophy, Navigation, MessageSquare,
  Send, GraduationCap, Tv,
} from "lucide-react";

function useCountUp(target: number, duration = 700) {
  const [v, setV] = useState(0);
  useEffect(() => {
    if (target === 0) { setV(0); return; }
    const start = performance.now();
    const tick = (now: number) => {
      const pct = Math.min((now - start) / duration, 1);
      setV(Math.round((1 - Math.pow(1 - pct, 3)) * target));
      if (pct < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, [target, duration]);
  return v;
}

const TOOLS = [
  { path: "/monitor",          icon: Monitor,       label: "Monitor",       desc: "Live student view",   grad: "linear-gradient(135deg,#ec4899,#f43f5e)", glow: "rgba(236,72,153,0.3)" },
  { path: "/assignments",      icon: ClipboardList, label: "Assignments",   desc: "Create & manage",     grad: "linear-gradient(135deg,#8b5cf6,#7c3aed)", glow: "rgba(139,92,246,0.3)" },
  { path: "/quizzes",          icon: HelpCircle,    label: "Quizzes",       desc: "Build & grade",       grad: "linear-gradient(135deg,#3b82f6,#2563eb)", glow: "rgba(59,130,246,0.3)" },
  { path: "/grading",          icon: CheckSquare,   label: "Grading",       desc: "Review work",         grad: "linear-gradient(135deg,#10b981,#059669)", glow: "rgba(16,185,129,0.3)" },
  { path: "/analytics",        icon: BarChart3,     label: "Analytics",     desc: "View reports",        grad: "linear-gradient(135deg,#f59e0b,#d97706)", glow: "rgba(245,158,11,0.3)" },
  { path: "/youtube",          icon: Youtube,       label: "YouTube",       desc: "Library + requests",  grad: "linear-gradient(135deg,#ef4444,#dc2626)", glow: "rgba(239,68,68,0.3)"  },
  { path: "/leaderboard",      icon: Trophy,        label: "Leaderboard",   desc: "Student rankings",    grad: "linear-gradient(135deg,#eab308,#ca8a04)", glow: "rgba(234,179,8,0.3)"  },
  { path: "/lesson-analytics", icon: ClipboardList, label: "Lesson Views",  desc: "Who read what",       grad: "linear-gradient(135deg,#6366f1,#4f46e5)", glow: "rgba(99,102,241,0.3)" },
  { path: "/class-grades",     icon: GraduationCap, label: "Class Grades",  desc: "Per-student levels",  grad: "linear-gradient(135deg,#14b8a6,#0d9488)", glow: "rgba(20,184,166,0.3)" },
];

const PUSH_PAGES = [
  { label: "Dashboard",   path: "/student" },
  { label: "Lessons",     path: "/lessons" },
  { label: "Assignments", path: "/assignments" },
  { label: "Arcade",      path: "/arcade" },
];

const ANIM = `
  @keyframes td-fadeUp { from { opacity:0; transform:translateY(12px); } to { opacity:1; transform:translateY(0); } }
  @keyframes td-shimmer { 0%{background-position:-200% center;} 100%{background-position:200% center;} }
  @keyframes td-pulse { 0%,100%{opacity:1;} 50%{opacity:.5;} }
`;

export default function TeacherDashboard() {
  const { user } = useAuth();
  const { theme } = useTheme();
  const dk = theme === "dark";

  const [classes, setClasses]           = useState<any[]>([]);
  const [newClassName, setNewClassName] = useState("");
  const [selectedClass, setSelectedClass] = useState<any>(null);
  const [students, setStudents]         = useState<any[]>([]);
  const [announcement, setAnnouncement] = useState("");
  const [announceSent, setAnnounceSent] = useState(false);
  const [recentActivity, setRecentActivity] = useState<{ name: string; action: string; time: string }[]>([]);
  const [isClassLocked, setIsClassLocked] = useState(false);
  const [lockMsg, setLockMsg]           = useState("");
  const [showPushMenu, setShowPushMenu] = useState(false);
  const [showMsgModal, setShowMsgModal] = useState(false);
  const [msgText, setMsgText]           = useState("");
  const [pendingYouTube, setPendingYouTube] = useState(0);

  const studentCount = useCountUp(students.length);

  useEffect(() => {
    api.getClasses().then(c => {
      setClasses(c);
      if (c.length > 0) { setSelectedClass(c[0]); loadStudents(c[0].id); }
    }).catch(console.error);
    api.getYouTubeRequests("pending").then(r => setPendingYouTube(r.length)).catch(() => {});
  }, []);

  useEffect(() => {
    const socket = getSocket();
    const handler = (data: any) => {
      setRecentActivity(prev => [
        { name: data.userName || "Student", action: data.action || "updated", time: "just now" },
        ...prev.slice(0, 9),
      ]);
    };
    socket.on("project:update", handler);
    socket.on("chat:message", handler);
    return () => { socket.off("project:update", handler); socket.off("chat:message", handler); };
  }, []);

  const loadStudents = async (classId: string) => {
    const s = await api.getStudents(classId);
    setStudents(s);
  };

  const handleCreateClass = async () => {
    if (!newClassName.trim()) return;
    const cls = await api.createClass(newClassName.trim());
    setClasses(prev => [cls, ...prev]);
    setNewClassName("");
  };

  const handleBroadcast = () => {
    if (!announcement.trim() || !selectedClass) return;
    getSocket().emit("class:broadcast", { classId: selectedClass.id, message: announcement.trim() });
    setAnnouncement(""); setAnnounceSent(true);
    setTimeout(() => setAnnounceSent(false), 2000);
  };

  const handleLockScreens = async (locked: boolean) => {
    if (!selectedClass) return;
    if (locked) await api.lockClass(selectedClass.id, lockMsg).catch(console.error);
    else await api.unlockClass(selectedClass.id).catch(console.error);
    setIsClassLocked(locked);
    getSocket().emit("class:lock", { classId: selectedClass.id, locked });
  };

  const handlePushToPage = async (path: string) => {
    if (!selectedClass) return;
    await api.sendClassCommand(selectedClass.id, "NAVIGATE", path).catch(console.error);
    setShowPushMenu(false);
  };

  const handleSendMessage = async () => {
    if (!selectedClass || !msgText.trim()) return;
    await api.sendClassCommand(selectedClass.id, "MESSAGE", msgText.trim()).catch(console.error);
    setMsgText(""); setShowMsgModal(false);
  };

  const handleForceUnlockAll = async () => {
    if (!confirm("Force-unlock EVERY class? This clears all active locks system-wide.")) return;
    try { await api.forceUnlockAll(); setIsClassLocked(false); alert("✓ All classes unlocked."); }
    catch (e: any) { alert("Failed: " + (e?.message || e)); }
  };

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  const g = (a: number) => `rgba(255,255,255,${a})`;
  const surface = dk ? "rgba(255,255,255,0.04)" : "rgba(255,255,255,0.9)";
  const border  = dk ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)";
  const text1   = dk ? "#f1f5f9" : "#0f172a";
  const text2   = dk ? "rgba(255,255,255,0.5)" : "rgba(0,0,0,0.5)";
  const card = {
    background: surface, border: `1px solid ${border}`,
    borderRadius: 16, backdropFilter: "blur(12px)",
  } as const;

  return (
    <div style={{ minHeight: "100vh", background: dk ? "#070714" : "#f0f1f8", color: text1, fontFamily: "'Inter', system-ui, sans-serif" }}>
      <style>{ANIM}</style>

      {/* Message modal */}
      {showMsgModal && (
        <div style={{ position:"fixed",inset:0,zIndex:300,background:"rgba(0,0,0,0.6)",backdropFilter:"blur(6px)",display:"flex",alignItems:"center",justifyContent:"center" }}
          onClick={e => { if (e.target === e.currentTarget) setShowMsgModal(false); }}>
          <div style={{ ...card, padding: 24, width: "100%", maxWidth: 440, boxShadow: "0 24px 64px rgba(0,0,0,0.4)" }}>
            <h3 style={{ fontWeight: 800, fontSize: 17, marginBottom: 16, color: text1 }}>💬 Message Everyone</h3>
            <textarea value={msgText} onChange={e => setMsgText(e.target.value)} placeholder="Type your message…"
              className="input w-full text-sm resize-none" rows={3} autoFocus />
            <div style={{ display:"flex", gap:8, marginTop:14 }}>
              <button onClick={handleSendMessage} disabled={!msgText.trim()} className="btn-primary flex-1 gap-2"><Send size={14}/> Send</button>
              <button onClick={() => { setShowMsgModal(false); setMsgText(""); }} className="btn-secondary px-4">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Hero header ── */}
      <div style={{
        background: dk
          ? "linear-gradient(135deg, #0d0d28 0%, #1a0a3a 60%, #0a1228 100%)"
          : "linear-gradient(135deg, #7c3aed 0%, #4f46e5 60%, #2563eb 100%)",
        padding: "28px 32px 28px", marginBottom: 28,
        position: "relative", overflow: "hidden",
      }}>
        <div style={{ position:"absolute",inset:0,background:"radial-gradient(ellipse at 80% 50%, rgba(255,255,255,0.06) 0%, transparent 60%)",pointerEvents:"none" }} />

      <header style={{ maxWidth: 1280, margin: "0 auto", position: "relative", animation: "td-fadeUp .5s ease both" }}>
        <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.18em", textTransform: "uppercase", color: "rgba(255,255,255,0.6)", marginBottom: 8 }}>
          {new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
        </div>
        <div style={{ display:"flex", alignItems:"flex-end", justifyContent:"space-between", gap:16, flexWrap:"wrap" }}>
          <div>
            <h1 style={{
              fontSize: 42, fontWeight: 900, letterSpacing: "-0.03em", margin: 0, lineHeight: 1.05,
              color: "white",
              backgroundSize: "200% auto",
              WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
              animation: "td-shimmer 6s linear infinite",
            }}>
              {greeting}, {user?.name?.split(" ")[0]}.
            </h1>
            <p style={{ fontSize: 13, marginTop: 6, color: "rgba(255,255,255,0.65)" }}>
              Manage your classroom, monitor students, keep the day on track.
            </p>
          </div>
          <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
            {classes[0]?.id && (
              <a href={`/board?class=${encodeURIComponent(classes[0].id)}`} target="_blank" rel="noopener noreferrer"
                style={{ display:"flex",alignItems:"center",gap:6,padding:"8px 16px",borderRadius:10,fontSize:12,fontWeight:700,textDecoration:"none",
                  background:"rgba(255,255,255,0.2)", border:"1px solid rgba(255,255,255,0.35)", color:"white",
                  backdropFilter:"blur(8px)",
                }}>
                <Tv size={13}/> Open Board
              </a>
            )}
            <Link to="/teacher/board-settings" style={{ display:"flex",alignItems:"center",gap:6,padding:"8px 16px",borderRadius:10,fontSize:12,fontWeight:600,textDecoration:"none",
              background:"rgba(255,255,255,0.12)", border:"1px solid rgba(255,255,255,0.25)", color:"rgba(255,255,255,0.85)" }}>
              <Tv size={13}/> Board Settings
            </Link>
            <button onClick={handleForceUnlockAll} style={{ display:"flex",alignItems:"center",gap:6,padding:"8px 16px",borderRadius:10,fontSize:12,fontWeight:600,cursor:"pointer",
              background:"rgba(239,68,68,0.25)", border:"1px solid rgba(239,68,68,0.5)", color:"#fecaca" }}>
              <LockOpen size={13}/> Force Unlock All
            </button>
          </div>
        </div>
      </header>
      </div>

      <div style={{ padding: "0 32px 32px", maxWidth: 1280, margin: "0 auto" }}>

      {/* ── Tools grid ── */}
      <div style={{
        display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(120px, 1fr))", gap:10, marginBottom:24,
        animation: "td-fadeUp .5s ease .08s both",
      }}>
        {TOOLS.map((t, i) => (
          <Link key={t.path} to={t.path} style={{
            display:"flex",flexDirection:"column",gap:10,padding:"14px 12px",
            borderRadius:14, textDecoration:"none",
            background: surface, border:`1px solid ${border}`,
            transition:"all 0.2s ease",
            animationDelay: `${i * 45}ms`,
            animation: "td-fadeUp .45s ease both",
          }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLElement).style.transform = "translateY(-3px)";
              (e.currentTarget as HTMLElement).style.boxShadow = `0 8px 28px ${t.glow}`;
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLElement).style.transform = "";
              (e.currentTarget as HTMLElement).style.boxShadow = "";
            }}
          >
            <div style={{
              width: 36, height: 36, borderRadius: 10, flexShrink: 0,
              background: t.grad, display:"flex", alignItems:"center", justifyContent:"center",
              boxShadow: `0 4px 12px ${t.glow}`,
            }}>
              <t.icon size={17} color="white" />
            </div>
            <div style={{ minWidth:0 }}>
              <div style={{ fontSize:12, fontWeight:700, color:text1, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>
                {t.label}
                {t.label === "YouTube" && pendingYouTube > 0 && (
                  <span style={{ marginLeft:4, fontSize:9, background:"#ef4444", color:"white", borderRadius:20, padding:"1px 5px", fontWeight:800 }}>{pendingYouTube}</span>
                )}
              </div>
              <div style={{ fontSize:10, color:text2, marginTop:2, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{t.desc}</div>
            </div>
          </Link>
        ))}
      </div>

      {/* ── 3-col lower grid ── */}
      <div style={{ display:"grid", gridTemplateColumns:"200px 1fr", gap:16, animation:"td-fadeUp .5s ease .15s both" }}>

        {/* Classes panel */}
        <div style={{ ...card, padding:"16px 14px" }}>
          <div style={{ fontSize:11, fontWeight:700, letterSpacing:"0.15em", textTransform:"uppercase", color:text2, marginBottom:10 }}>My Classes</div>
          <div style={{ display:"flex", gap:6, marginBottom:10 }}>
            <input value={newClassName} onChange={e => setNewClassName(e.target.value)} placeholder="Class name…"
              className="input text-sm flex-1" style={{ fontSize:12 }}
              onKeyDown={e => e.key === "Enter" && handleCreateClass()} />
            <button onClick={handleCreateClass} className="btn-primary" style={{ padding:"6px 10px" }}>
              <Plus size={13}/>
            </button>
          </div>
          <div style={{ display:"flex", flexDirection:"column", gap:3 }}>
            {classes.map(cls => (
              <button key={cls.id}
                onClick={() => { setSelectedClass(cls); loadStudents(cls.id); setIsClassLocked(false); }}
                style={{
                  textAlign:"left", padding:"8px 10px", borderRadius:10, fontSize:12, cursor:"pointer",
                  border:`1px solid ${selectedClass?.id === cls.id ? "rgba(124,58,237,0.4)" : "transparent"}`,
                  background: selectedClass?.id === cls.id
                    ? "linear-gradient(135deg, rgba(124,58,237,0.2), rgba(79,70,229,0.12))"
                    : "transparent",
                  color: selectedClass?.id === cls.id ? "#a78bfa" : text2,
                  transition:"all 0.15s ease",
                }}>
                <div style={{ fontWeight:700 }}>{cls.name}</div>
                <div style={{ fontFamily:"monospace", fontSize:10, opacity:0.5, marginTop:2 }}>{cls.code}</div>
              </button>
            ))}
            {classes.length === 0 && <p style={{ fontSize:12, textAlign:"center", padding:"20px 0", color:text2 }}>No classes yet</p>}
          </div>
        </div>

        {/* Right: controls + students + activity */}
        <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
          {selectedClass ? (
            <>
              <DailyNewsAdmin classId={selectedClass.id} dk={dk} />

              {/* Classroom controls */}
              <div style={{ ...card, padding:"16px 18px" }}>
                <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:12 }}>
                  <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                    <div style={{ fontSize:13, fontWeight:700, color:text1 }}>Classroom Controls</div>
                    <span style={{ fontSize:11, color:text2 }}>{selectedClass.name}</span>
                  </div>
                  {isClassLocked && (
                    <span style={{ display:"flex",alignItems:"center",gap:6,fontSize:11,fontWeight:700,padding:"3px 10px",borderRadius:20,
                      background:"rgba(239,68,68,0.15)", color:"#f87171", border:"1px solid rgba(239,68,68,0.3)",
                      animation:"td-pulse 2s infinite",
                    }}>
                      <Lock size={11}/> LOCKED
                    </span>
                  )}
                </div>

                <div style={{ display:"flex", gap:8, marginBottom:10 }}>
                  <input value={announcement} onChange={e => setAnnouncement(e.target.value)}
                    placeholder="Type announcement…" className="input text-sm flex-1"
                    onKeyDown={e => e.key === "Enter" && handleBroadcast()} />
                  <button onClick={handleBroadcast}
                    style={{ display:"flex",alignItems:"center",gap:6,padding:"8px 14px",borderRadius:10,fontSize:12,fontWeight:700,cursor:"pointer",
                      border:"none",
                      background: announceSent ? "linear-gradient(135deg,#10b981,#059669)" : "linear-gradient(135deg,#8b5cf6,#7c3aed)",
                      color:"white", transition:"all 0.2s ease",
                    }}>
                    {announceSent ? "Sent!" : <><Megaphone size={13}/> Broadcast</>}
                  </button>
                </div>

                <input value={lockMsg} onChange={e => setLockMsg(e.target.value)}
                  placeholder="Lock screen message (optional)…" className="input text-sm w-full" style={{ marginBottom:10 }} />

                <div style={{ display:"flex", flexWrap:"wrap", gap:8, alignItems:"center" }}>
                  <button onClick={() => handleLockScreens(true)} style={{
                    display:"flex",alignItems:"center",gap:6,padding:"7px 12px",borderRadius:10,fontSize:12,fontWeight:700,cursor:"pointer",
                    background:"rgba(239,68,68,0.15)",border:"1px solid rgba(239,68,68,0.3)",color:"#f87171",opacity:isClassLocked?0.5:1,
                  }}><Lock size={12}/> Lock Screens</button>

                  <button onClick={() => handleLockScreens(false)} style={{
                    display:"flex",alignItems:"center",gap:6,padding:"7px 12px",borderRadius:10,fontSize:12,fontWeight:600,cursor:"pointer",
                    background: surface, border:`1px solid ${border}`, color:text2,
                  }}><LockOpen size={12}/> Unlock</button>

                  <div style={{ position:"relative" }}>
                    <button onClick={() => setShowPushMenu(v => !v)} style={{
                      display:"flex",alignItems:"center",gap:6,padding:"7px 12px",borderRadius:10,fontSize:12,fontWeight:600,cursor:"pointer",
                      background:"rgba(59,130,246,0.12)",border:"1px solid rgba(59,130,246,0.28)",color:"#93c5fd",
                    }}><Navigation size={12}/> Push to Page ▾</button>
                    {showPushMenu && (
                      <div style={{ position:"absolute",top:"calc(100% + 4px)",left:0,borderRadius:12,boxShadow:"0 12px 40px rgba(0,0,0,0.3)",
                        border:`1px solid ${border}`, background:dk?"#0d0d24":"white", overflow:"hidden",zIndex:50,minWidth:160 }}>
                        {PUSH_PAGES.map(p => (
                          <button key={p.path} onClick={() => handlePushToPage(p.path)}
                            style={{ display:"block",width:"100%",textAlign:"left",padding:"9px 14px",fontSize:12,cursor:"pointer",
                              color:text1, background:"transparent", border:"none",
                            }}
                            onMouseEnter={e => (e.currentTarget.style.background = dk ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)")}
                            onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>
                            → {p.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  <button onClick={() => setShowMsgModal(true)} style={{
                    display:"flex",alignItems:"center",gap:6,padding:"7px 12px",borderRadius:10,fontSize:12,fontWeight:600,cursor:"pointer",
                    background:"rgba(139,92,246,0.12)",border:"1px solid rgba(139,92,246,0.28)",color:"#c4b5fd",
                  }}><MessageSquare size={12}/> Message All</button>

                  <Link to="/monitor" style={{ marginLeft:"auto",display:"flex",alignItems:"center",gap:6,padding:"7px 12px",borderRadius:10,fontSize:12,fontWeight:700,
                    textDecoration:"none",
                    background:"linear-gradient(135deg,rgba(236,72,153,0.18),rgba(244,63,94,0.1))",
                    border:"1px solid rgba(236,72,153,0.3)",color:"#f9a8d4",
                  }}><Eye size={12}/> Open Monitor</Link>
                </div>
              </div>

              {/* Students + Activity 2-col */}
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:14 }}>
                {/* Students */}
                <div style={{ ...card, padding:"16px 18px" }}>
                  <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:12 }}>
                    <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                      <div style={{ width:28,height:28,borderRadius:8,background:"linear-gradient(135deg,#14b8a6,#0d9488)",display:"flex",alignItems:"center",justifyContent:"center",boxShadow:"0 3px 10px rgba(20,184,166,0.3)" }}>
                        <Users size={13} color="white"/>
                      </div>
                      <span style={{ fontSize:13,fontWeight:700,color:text1 }}>Students ({studentCount})</span>
                    </div>
                    <Link to="/monitor" style={{ fontSize:11,fontWeight:600,color:"#a78bfa",textDecoration:"none" }}>
                      Full monitor →
                    </Link>
                  </div>
                  <div style={{ display:"flex",flexDirection:"column",gap:4 }}>
                    {students.map(s => (
                      <Link key={s.id} to={`/teacher/gradebook/${s.id}`} style={{
                        display:"flex",alignItems:"center",gap:10,padding:"8px 10px",borderRadius:10,
                        textDecoration:"none",border:`1px solid transparent`,
                        transition:"all 0.15s ease",
                      }}
                        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = dk?"rgba(255,255,255,0.04)":"rgba(0,0,0,0.03)"; (e.currentTarget as HTMLElement).style.borderColor = border; }}
                        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "transparent"; (e.currentTarget as HTMLElement).style.borderColor = "transparent"; }}>
                        <div style={{ width:30,height:30,borderRadius:9,background:"linear-gradient(135deg,#10b981,#059669)",display:"flex",alignItems:"center",justifyContent:"center",color:"white",fontSize:12,fontWeight:800,flexShrink:0 }}>
                          {s.name.charAt(0)}
                        </div>
                        <div style={{ flex:1,minWidth:0 }}>
                          <div style={{ fontSize:12,fontWeight:600,color:text1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap" }}>{s.name}</div>
                          <div style={{ fontSize:10,color:text2,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap" }}>{s.email}</div>
                        </div>
                      </Link>
                    ))}
                    {students.length === 0 && (
                      <p style={{ fontSize:12,textAlign:"center",padding:"24px 0",color:text2 }}>
                        Share code <strong style={{ color:"#a78bfa",fontFamily:"monospace" }}>{selectedClass.code}</strong> to add students
                      </p>
                    )}
                  </div>
                </div>

                {/* Activity feed */}
                <div style={{ ...card, padding:"16px 18px" }}>
                  <div style={{ display:"flex",alignItems:"center",gap:8,marginBottom:12 }}>
                    <div style={{ width:28,height:28,borderRadius:8,background:"linear-gradient(135deg,#8b5cf6,#7c3aed)",display:"flex",alignItems:"center",justifyContent:"center",boxShadow:"0 3px 10px rgba(139,92,246,0.3)" }}>
                      <Activity size={13} color="white"/>
                    </div>
                    <span style={{ fontSize:13,fontWeight:700,color:text1 }}>Recent Activity</span>
                  </div>
                  {recentActivity.length > 0 ? (
                    <div style={{ display:"flex",flexDirection:"column",gap:2 }}>
                      {recentActivity.map((a, i) => (
                        <div key={i} style={{ display:"flex",alignItems:"center",gap:10,padding:"7px 0",borderBottom:`1px solid ${border}`,fontSize:11 }}>
                          <span style={{ width:6,height:6,borderRadius:"50%",background:"rgba(139,92,246,0.6)",flexShrink:0 }} />
                          <span style={{ color:text2 }}><strong style={{ color:text1 }}>{a.name}</strong> {a.action}</span>
                          <span style={{ marginLeft:"auto",color:text2,flexShrink:0 }}>{a.time}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div style={{ textAlign:"center",padding:"32px 0" }}>
                      <p style={{ fontSize:24,marginBottom:8 }}>🎒</p>
                      <p style={{ fontSize:12,color:text2 }}>Quiet right now. Check back when class starts!</p>
                    </div>
                  )}
                </div>
              </div>
            </>
          ) : (
            <div style={{ ...card, display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:"64px 0",textAlign:"center" }}>
              <Users size={32} style={{ opacity:0.2,marginBottom:10 }} />
              <p style={{ fontSize:13,color:text2 }}>Create or select a class to get started</p>
            </div>
          )}
        </div>
      </div>
      </div>
    </div>
  );
}
