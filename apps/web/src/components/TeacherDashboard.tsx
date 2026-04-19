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
  LayoutDashboard, BookOpen, Gamepad2, FileText,
  Wifi, WifiOff, Radio,
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

/* Push-to-page entries with icons and accent colours */
const PUSH_PAGES = [
  { label: "Dashboard",   path: "/student",      icon: LayoutDashboard, color: "#8b5cf6", desc: "Home screen" },
  { label: "Lessons",     path: "/lessons",      icon: BookOpen,        color: "#3b82f6", desc: "Reading & content" },
  { label: "Assignments", path: "/assignments",  icon: FileText,        color: "#10b981", desc: "Tasks & projects" },
  { label: "Arcade",      path: "/arcade",       icon: Gamepad2,        color: "#f59e0b", desc: "Games & challenges" },
];

const ANIM = `
  @keyframes td-fadeUp { from { opacity:0; transform:translateY(12px); } to { opacity:1; transform:translateY(0); } }
  @keyframes td-shimmer { 0%{background-position:-200% center;} 100%{background-position:200% center;} }
  @keyframes td-pulse { 0%,100%{opacity:1;} 50%{opacity:.45;} }
  @keyframes td-live-dot { 0%,100%{transform:scale(1);opacity:1;} 50%{transform:scale(0.65);opacity:0.5;} }
`;

export default function TeacherDashboard() {
  const { user } = useAuth();
  const { theme } = useTheme();
  const dk = theme === "dark";

  const [classes, setClasses]               = useState<any[]>([]);
  const [newClassName, setNewClassName]     = useState("");
  const [selectedClass, setSelectedClass]   = useState<any>(null);
  const [students, setStudents]             = useState<any[]>([]);
  const [announcement, setAnnouncement]     = useState("");
  const [announceSent, setAnnounceSent]     = useState(false);
  const [recentActivity, setRecentActivity] = useState<{ name: string; action: string; time: string }[]>([]);
  const [isClassLocked, setIsClassLocked]   = useState(false);
  const [lockMsg, setLockMsg]               = useState("");
  const [showPushMenu, setShowPushMenu]     = useState(false);
  const [showMsgModal, setShowMsgModal]     = useState(false);
  const [msgText, setMsgText]               = useState("");
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
    try { await api.forceUnlockAll(); setIsClassLocked(false); alert("All classes unlocked."); }
    catch (e: any) { alert("Failed: " + (e?.message || e)); }
  };

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  const surface   = dk ? "rgba(255,255,255,0.03)" : "rgba(255,255,255,0.9)";
  const border    = dk ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.07)";
  const text1     = dk ? "#f1f5f9" : "#0f172a";
  const text2     = dk ? "rgba(255,255,255,0.45)" : "rgba(0,0,0,0.45)";
  const cardStyle = {
    background: surface, border: `1px solid ${border}`,
    borderRadius: 20, backdropFilter: "blur(16px)",
  } as const;

  /* Activity dot colour cycle */
  const actDotColors = ["#a78bfa","#34d399","#60a5fa","#f9a8d4","#fbbf24"];

  return (
    <div style={{ minHeight: "100vh", background: dk ? "#070714" : "#f0f1f8", color: text1, fontFamily: "'Inter', system-ui, sans-serif" }}>
      <style>{ANIM}</style>

      {/* ─── Message modal ─── */}
      {showMsgModal && (
        <div style={{ position:"fixed",inset:0,zIndex:300,background:"rgba(0,0,0,0.65)",backdropFilter:"blur(8px)",display:"flex",alignItems:"center",justifyContent:"center" }}
          onClick={e => { if (e.target === e.currentTarget) setShowMsgModal(false); }}>
          <div style={{ ...cardStyle, padding: 28, width: "100%", maxWidth: 440, boxShadow: "0 32px 80px rgba(0,0,0,0.45)" }}>
            <h3 style={{ fontWeight: 800, fontSize: 16, marginBottom: 18, color: text1, letterSpacing:"-0.01em" }}>Message Everyone</h3>
            <textarea value={msgText} onChange={e => setMsgText(e.target.value)} placeholder="Type your message…"
              className="input w-full text-sm resize-none" rows={3} autoFocus />
            <div style={{ display:"flex", gap:8, marginTop:16 }}>
              <button onClick={handleSendMessage} disabled={!msgText.trim()} className="btn-primary flex-1 gap-2"><Send size={14}/> Send</button>
              <button onClick={() => { setShowMsgModal(false); setMsgText(""); }} className="btn-secondary px-4">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Hero header ─── */}
      <div style={{
        background: dk
          ? "linear-gradient(160deg,#0d0b1e 0%,#130d2e 55%,#090f1e 100%)"
          : "linear-gradient(160deg,#7c3aed 0%,#4f46e5 60%,#2563eb 100%)",
        padding: "32px 40px 32px",
        marginBottom: 32,
        position: "relative",
        overflow: "hidden",
      }}>
        <div style={{ position:"absolute",inset:0,background:"radial-gradient(ellipse at 70% 40%,rgba(124,58,237,0.2) 0%,transparent 65%)",pointerEvents:"none" }} />
        <div style={{ position:"absolute",inset:0,background:"radial-gradient(ellipse at 15% 80%,rgba(59,130,246,0.1) 0%,transparent 60%)",pointerEvents:"none" }} />

        <header style={{ maxWidth: 1280, margin: "0 auto", position: "relative", animation: "td-fadeUp .45s ease both" }}>
          <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.2em", textTransform: "uppercase", color: "rgba(255,255,255,0.45)", marginBottom: 10 }}>
            {new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
          </div>
          <div style={{ display:"flex", alignItems:"flex-end", justifyContent:"space-between", gap:16, flexWrap:"wrap" }}>
            <div>
              <h1 style={{ fontSize: 38, fontWeight: 900, letterSpacing: "-0.035em", margin: 0, lineHeight: 1.08, color: "white" }}>
                {greeting}, {user?.name?.split(" ")[0]}.
              </h1>
              <p style={{ fontSize: 13, marginTop: 8, color: "rgba(255,255,255,0.55)", letterSpacing:"0.01em" }}>
                Manage your classroom, monitor students, keep the day on track.
              </p>
            </div>
            <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
              {classes[0]?.id && (
                <a href={`/board?class=${encodeURIComponent(classes[0].id)}`} target="_blank" rel="noopener noreferrer"
                  style={{ display:"flex",alignItems:"center",gap:7,padding:"9px 18px",borderRadius:12,fontSize:12,fontWeight:700,textDecoration:"none",
                    background:"rgba(255,255,255,0.18)", border:"1px solid rgba(255,255,255,0.3)", color:"white", backdropFilter:"blur(8px)" }}>
                  <Tv size={13}/> Open Board
                </a>
              )}
              <Link to="/teacher/board-settings" style={{ display:"flex",alignItems:"center",gap:7,padding:"9px 18px",borderRadius:12,fontSize:12,fontWeight:600,textDecoration:"none",
                background:"rgba(255,255,255,0.1)", border:"1px solid rgba(255,255,255,0.18)", color:"rgba(255,255,255,0.8)" }}>
                <Tv size={13}/> Board Settings
              </Link>
              <button onClick={handleForceUnlockAll} style={{ display:"flex",alignItems:"center",gap:7,padding:"9px 18px",borderRadius:12,fontSize:12,fontWeight:600,cursor:"pointer",
                background:"rgba(239,68,68,0.2)", border:"1px solid rgba(239,68,68,0.4)", color:"#fca5a5" }}>
                <LockOpen size={13}/> Force Unlock All
              </button>
            </div>
          </div>
        </header>
      </div>

      <div style={{ padding: "0 40px 48px", maxWidth: 1280, margin: "0 auto" }}>

        {/* ─── Tool quick-links ─── */}
        <div style={{
          display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(130px, 1fr))", gap:10, marginBottom:32,
          animation: "td-fadeUp .5s ease .08s both",
        }}>
          {TOOLS.map((t, i) => (
            <Link key={t.path} to={t.path} style={{
              display:"flex",flexDirection:"column",gap:0,padding:0,
              borderRadius:16, textDecoration:"none", overflow:"hidden",
              background: surface, border:`1px solid ${border}`,
              transition:"all 0.2s ease",
              animationDelay: `${i * 40}ms`,
              animation: "td-fadeUp .45s ease both",
            }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLElement).style.transform = "translateY(-4px)";
                (e.currentTarget as HTMLElement).style.boxShadow = `0 12px 32px ${t.glow}`;
                (e.currentTarget as HTMLElement).style.borderColor = "rgba(255,255,255,0.12)";
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLElement).style.transform = "";
                (e.currentTarget as HTMLElement).style.boxShadow = "";
                (e.currentTarget as HTMLElement).style.borderColor = border;
              }}
            >
              {/* coloured top stripe */}
              <div style={{ height:2, background:t.grad, flexShrink:0 }} />
              <div style={{ padding:"13px 14px 15px", display:"flex", flexDirection:"column", gap:10 }}>
                <div style={{
                  width: 38, height: 38, borderRadius: 11, flexShrink: 0,
                  background: t.grad, display:"flex", alignItems:"center", justifyContent:"center",
                  boxShadow: `0 6px 16px ${t.glow}`,
                }}>
                  <t.icon size={17} color="white" />
                </div>
                <div style={{ minWidth:0 }}>
                  <div style={{ fontSize:12, fontWeight:700, color:text1, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis", letterSpacing:"0.01em" }}>
                    {t.label}
                    {t.label === "YouTube" && pendingYouTube > 0 && (
                      <span style={{ marginLeft:5, fontSize:9, background:"#ef4444", color:"white", borderRadius:20, padding:"2px 6px", fontWeight:800, verticalAlign:"middle" }}>{pendingYouTube}</span>
                    )}
                  </div>
                  <div style={{ fontSize:10, color:text2, marginTop:3, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{t.desc}</div>
                </div>
              </div>
            </Link>
          ))}
        </div>

        {/* ─── Main layout: sidebar + content ─── */}
        <div style={{ display:"grid", gridTemplateColumns:"220px 1fr", gap:16, animation:"td-fadeUp .5s ease .15s both" }}>

          {/* ─── Class selector sidebar (polished tab strip) ─── */}
          <div style={{ ...cardStyle, padding:"18px 0", display:"flex", flexDirection:"column" }}>
            <div style={{ padding:"0 16px 10px", fontSize:10, fontWeight:700, letterSpacing:"0.18em", textTransform:"uppercase", color:text2 }}>My Classes</div>

            {/* Create new class input */}
            <div style={{ display:"flex", gap:6, padding:"0 10px", marginBottom:10 }}>
              <input value={newClassName} onChange={e => setNewClassName(e.target.value)} placeholder="New class…"
                className="input text-sm flex-1" style={{ fontSize:12 }}
                onKeyDown={e => e.key === "Enter" && handleCreateClass()} />
              <button onClick={handleCreateClass} className="btn-primary" style={{ padding:"6px 10px", borderRadius:10 }}>
                <Plus size={13}/>
              </button>
            </div>

            {/* Tab items */}
            <div style={{ display:"flex", flexDirection:"column", gap:2, padding:"0 8px", flex:1 }}>
              {classes.map(cls => {
                const active = selectedClass?.id === cls.id;
                return (
                  <button key={cls.id}
                    onClick={() => { setSelectedClass(cls); loadStudents(cls.id); setIsClassLocked(false); }}
                    style={{
                      textAlign:"left", padding:"10px 10px", borderRadius:11, fontSize:12, cursor:"pointer",
                      border:"none",
                      background: active
                        ? "linear-gradient(135deg, rgba(124,58,237,0.22), rgba(79,70,229,0.12))"
                        : "transparent",
                      color: active ? "#c4b5fd" : text2,
                      transition:"all 0.15s ease",
                      position:"relative",
                    }}
                    onMouseEnter={e => { if (!active) (e.currentTarget as HTMLElement).style.background = dk ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.04)"; }}
                    onMouseLeave={e => { if (!active) (e.currentTarget as HTMLElement).style.background = "transparent"; }}>
                    {/* active indicator bar */}
                    {active && (
                      <div style={{ position:"absolute", left:0, top:"20%", bottom:"20%", width:3, borderRadius:4, background:"linear-gradient(180deg,#8b5cf6,#6d28d9)" }} />
                    )}
                    <div style={{ fontWeight: active ? 700 : 500, fontSize:12, paddingLeft: active ? 8 : 4 }}>{cls.name}</div>
                    <div style={{ fontFamily:"monospace", fontSize:10, opacity:0.45, marginTop:1, paddingLeft: active ? 8 : 4 }}>{cls.code}</div>
                  </button>
                );
              })}
              {classes.length === 0 && <p style={{ fontSize:12, textAlign:"center", padding:"24px 0", color:text2 }}>No classes yet</p>}
            </div>
          </div>

          {/* ─── Right content pane ─── */}
          <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
            {selectedClass ? (
              <>
                <DailyNewsAdmin classId={selectedClass.id} dk={dk} />

                {/* ─── Broadcast & Controls (elevated prominence) ─── */}
                <div style={{
                  ...cardStyle,
                  padding:"0",
                  overflow:"hidden",
                  border: isClassLocked ? "1px solid rgba(239,68,68,0.3)" : `1px solid ${border}`,
                }}>
                  {/* purple top bar to signal this is the "command" zone */}
                  <div style={{ height:3, background:"linear-gradient(90deg,#8b5cf6,#6d28d9,#4f46e5)" }} />
                  <div style={{ padding:"18px 20px" }}>
                    {/* Header row */}
                    <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:16 }}>
                      <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                        <div style={{ width:30,height:30,borderRadius:9,background:"linear-gradient(135deg,#8b5cf6,#7c3aed)",display:"flex",alignItems:"center",justifyContent:"center",boxShadow:"0 4px 12px rgba(139,92,246,0.3)" }}>
                          <Radio size={14} color="white"/>
                        </div>
                        <div>
                          <div style={{ fontSize:13, fontWeight:800, color:text1, letterSpacing:"-0.01em", lineHeight:1 }}>Classroom Controls</div>
                          <div style={{ fontSize:10, color:text2, marginTop:2 }}>{selectedClass.name}</div>
                        </div>
                      </div>
                      {isClassLocked ? (
                        <span style={{ display:"flex",alignItems:"center",gap:6,fontSize:11,fontWeight:800,padding:"5px 12px",borderRadius:20,
                          background:"rgba(239,68,68,0.12)", color:"#f87171", border:"1px solid rgba(239,68,68,0.25)",
                          animation:"td-pulse 2s infinite", letterSpacing:"0.06em",
                        }}>
                          <Lock size={11}/> LOCKED
                        </span>
                      ) : (
                        <span style={{ display:"flex",alignItems:"center",gap:5,fontSize:10,fontWeight:700,padding:"4px 10px",borderRadius:20,
                          background:"rgba(52,211,153,0.08)", color:"#34d399", border:"1px solid rgba(52,211,153,0.2)", letterSpacing:"0.04em" }}>
                          <div style={{ width:6,height:6,borderRadius:"50%",background:"#34d399",animation:"td-live-dot 1.8s ease infinite" }} />
                          LIVE
                        </span>
                      )}
                    </div>

                    {/* Broadcast row — most prominent action */}
                    <div style={{
                      background: dk ? "rgba(139,92,246,0.07)" : "rgba(139,92,246,0.04)",
                      border:"1px solid rgba(139,92,246,0.18)",
                      borderRadius:14,
                      padding:"14px 16px",
                      marginBottom:12,
                    }}>
                      <div style={{ fontSize:10, fontWeight:700, textTransform:"uppercase", letterSpacing:"0.14em", color:"#a78bfa", marginBottom:10, display:"flex",alignItems:"center",gap:6 }}>
                        <Megaphone size={11}/> Broadcast to class
                      </div>
                      <div style={{ display:"flex", gap:8 }}>
                        <input value={announcement} onChange={e => setAnnouncement(e.target.value)}
                          placeholder="Type announcement to all students…" className="input text-sm flex-1"
                          onKeyDown={e => e.key === "Enter" && handleBroadcast()} />
                        <button onClick={handleBroadcast}
                          style={{ display:"flex",alignItems:"center",gap:7,padding:"9px 20px",borderRadius:11,fontSize:12,fontWeight:700,cursor:"pointer",
                            border:"none", whiteSpace:"nowrap",
                            background: announceSent ? "linear-gradient(135deg,#10b981,#059669)" : "linear-gradient(135deg,#8b5cf6,#7c3aed)",
                            color:"white", transition:"all 0.2s ease",
                            boxShadow: announceSent ? "0 4px 14px rgba(16,185,129,0.35)" : "0 4px 14px rgba(139,92,246,0.35)",
                          }}>
                          {announceSent ? "Sent!" : <><Megaphone size={13}/> Send</>}
                        </button>
                      </div>
                    </div>

                    {/* Lock message */}
                    <input value={lockMsg} onChange={e => setLockMsg(e.target.value)}
                      placeholder="Lock screen message (optional)…" className="input text-sm w-full" style={{ marginBottom:12 }} />

                    {/* Action buttons row */}
                    <div style={{ display:"flex", flexWrap:"wrap", gap:8, alignItems:"center" }}>
                      <button onClick={() => handleLockScreens(true)} style={{
                        display:"flex",alignItems:"center",gap:6,padding:"8px 14px",borderRadius:11,fontSize:12,fontWeight:700,cursor:"pointer",
                        background:"rgba(239,68,68,0.12)",border:"1px solid rgba(239,68,68,0.28)",color:"#f87171",opacity:isClassLocked?0.5:1,
                      }}><Lock size={12}/> Lock</button>

                      <button onClick={() => handleLockScreens(false)} style={{
                        display:"flex",alignItems:"center",gap:6,padding:"8px 14px",borderRadius:11,fontSize:12,fontWeight:600,cursor:"pointer",
                        background: surface, border:`1px solid ${border}`, color:text2,
                      }}><LockOpen size={12}/> Unlock</button>

                      {/* Push to page — dropdown with page icons */}
                      <div style={{ position:"relative" }}>
                        <button onClick={() => setShowPushMenu(v => !v)} style={{
                          display:"flex",alignItems:"center",gap:6,padding:"8px 14px",borderRadius:11,fontSize:12,fontWeight:600,cursor:"pointer",
                          background:"rgba(59,130,246,0.1)",border:"1px solid rgba(59,130,246,0.25)",color:"#93c5fd",
                        }}><Navigation size={12}/> Push to Page</button>
                        {showPushMenu && (
                          <div style={{ position:"absolute",top:"calc(100% + 8px)",left:0,borderRadius:16,
                            boxShadow:"0 20px 56px rgba(0,0,0,0.4)",
                            border:`1px solid ${border}`, background:dk?"#0e0c1f":"white",
                            overflow:"hidden",zIndex:50,minWidth:210 }}>
                            <div style={{ padding:"10px 14px 8px", fontSize:9, fontWeight:700, textTransform:"uppercase", letterSpacing:"0.16em", color:text2, borderBottom:`1px solid ${border}` }}>
                              Navigate all students to
                            </div>
                            {PUSH_PAGES.map(p => (
                              <button key={p.path} onClick={() => handlePushToPage(p.path)}
                                style={{ display:"flex",alignItems:"center",gap:11,width:"100%",textAlign:"left",padding:"11px 14px",fontSize:12,cursor:"pointer",
                                  color:text1, background:"transparent", border:"none", fontWeight:500,
                                }}
                                onMouseEnter={e => (e.currentTarget.style.background = dk ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)")}
                                onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>
                                <div style={{ width:30,height:30,borderRadius:9,background:`${p.color}18`,border:`1px solid ${p.color}28`,
                                  display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0 }}>
                                  <p.icon size={14} style={{ color:p.color }} />
                                </div>
                                <div>
                                  <div style={{ fontWeight:600,fontSize:12,color:text1 }}>{p.label}</div>
                                  <div style={{ fontSize:10,color:text2,marginTop:1 }}>{p.desc}</div>
                                </div>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>

                      <button onClick={() => setShowMsgModal(true)} style={{
                        display:"flex",alignItems:"center",gap:6,padding:"8px 14px",borderRadius:11,fontSize:12,fontWeight:600,cursor:"pointer",
                        background:"rgba(139,92,246,0.1)",border:"1px solid rgba(139,92,246,0.25)",color:"#c4b5fd",
                      }}><MessageSquare size={12}/> Message All</button>

                      <Link to="/monitor" style={{ marginLeft:"auto",display:"flex",alignItems:"center",gap:6,padding:"8px 14px",borderRadius:11,fontSize:12,fontWeight:700,
                        textDecoration:"none",
                        background:"linear-gradient(135deg,rgba(236,72,153,0.15),rgba(244,63,94,0.08))",
                        border:"1px solid rgba(236,72,153,0.28)",color:"#f9a8d4",
                      }}><Eye size={12}/> Open Monitor</Link>
                    </div>
                  </div>
                </div>

                {/* ─── Students + Activity ─── */}
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:14 }}>

                  {/* Students list with class-health indicator */}
                  <div style={{ ...cardStyle, padding:"18px 20px" }}>
                    <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:14 }}>
                      <div style={{ display:"flex", alignItems:"center", gap:9 }}>
                        <div style={{ width:30,height:30,borderRadius:9,background:"linear-gradient(135deg,#14b8a6,#0d9488)",display:"flex",alignItems:"center",justifyContent:"center",boxShadow:"0 4px 12px rgba(20,184,166,0.25)" }}>
                          <Users size={13} color="white"/>
                        </div>
                        <div>
                          <span style={{ fontSize:13,fontWeight:800,color:text1,letterSpacing:"-0.01em" }}>Students</span>
                          {/* class-health badge */}
                          <div style={{ display:"flex",alignItems:"center",gap:5,marginTop:2 }}>
                            <span style={{ fontSize:10,fontWeight:700,color:students.length>0?"#34d399":text2 }}>
                              {studentCount} enrolled
                            </span>
                            {students.length > 0 && (
                              <span style={{ display:"inline-flex",alignItems:"center",gap:4,fontSize:9,fontWeight:700,padding:"2px 7px",borderRadius:20,
                                background:"rgba(52,211,153,0.1)",color:"#34d399",border:"1px solid rgba(52,211,153,0.2)",letterSpacing:"0.04em" }}>
                                <Wifi size={9}/> Active
                              </span>
                            )}
                            {students.length === 0 && (
                              <span style={{ display:"inline-flex",alignItems:"center",gap:4,fontSize:9,fontWeight:700,padding:"2px 7px",borderRadius:20,
                                background:"rgba(239,68,68,0.08)",color:"#f87171",border:"1px solid rgba(239,68,68,0.18)",letterSpacing:"0.04em" }}>
                                <WifiOff size={9}/> Empty
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      <Link to="/monitor" style={{ fontSize:11,fontWeight:600,color:"#a78bfa",textDecoration:"none",padding:"3px 9px",borderRadius:7,background:"rgba(124,58,237,0.1)",border:"1px solid rgba(124,58,237,0.18)" }}>
                        Monitor
                      </Link>
                    </div>
                    <div style={{ display:"flex",flexDirection:"column",gap:3 }}>
                      {students.map(s => (
                        <Link key={s.id} to={`/teacher/gradebook/${s.id}`} style={{
                          display:"flex",alignItems:"center",gap:11,padding:"8px 10px",borderRadius:12,
                          textDecoration:"none",border:`1px solid transparent`,
                          transition:"all 0.15s ease",
                        }}
                          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = dk?"rgba(255,255,255,0.035)":"rgba(0,0,0,0.025)"; (e.currentTarget as HTMLElement).style.borderColor = border; }}
                          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "transparent"; (e.currentTarget as HTMLElement).style.borderColor = "transparent"; }}>
                          <div style={{ width:30,height:30,borderRadius:9,background:"linear-gradient(135deg,#10b981,#059669)",display:"flex",alignItems:"center",justifyContent:"center",color:"white",fontSize:12,fontWeight:800,flexShrink:0,boxShadow:"0 3px 10px rgba(16,185,129,0.2)" }}>
                            {s.name.charAt(0)}
                          </div>
                          <div style={{ flex:1,minWidth:0 }}>
                            <div style={{ fontSize:12,fontWeight:600,color:text1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap" }}>{s.name}</div>
                            <div style={{ fontSize:10,color:text2,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",marginTop:2 }}>{s.email}</div>
                          </div>
                        </Link>
                      ))}
                      {students.length === 0 && (
                        <div style={{ textAlign:"center",padding:"28px 0" }}>
                          <div style={{ width:36,height:36,borderRadius:11,background:dk?"rgba(255,255,255,0.04)":"rgba(0,0,0,0.04)",display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 10px",border:`1px solid ${border}` }}>
                            <Users size={16} style={{ opacity:0.2 }} />
                          </div>
                          <p style={{ fontSize:12,color:text2,lineHeight:1.6 }}>
                            Share code{" "}
                            <strong style={{ color:"#a78bfa",fontFamily:"monospace",background:"rgba(124,58,237,0.1)",padding:"2px 7px",borderRadius:6 }}>{selectedClass.code}</strong>
                            {" "}to add students
                          </p>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Recent Activity feed — richer design */}
                  <div style={{ ...cardStyle, padding:"18px 20px" }}>
                    <div style={{ display:"flex",alignItems:"center",justifyContent:"space-between",gap:9,marginBottom:14 }}>
                      <div style={{ display:"flex",alignItems:"center",gap:9 }}>
                        <div style={{ width:30,height:30,borderRadius:9,background:"linear-gradient(135deg,#8b5cf6,#7c3aed)",display:"flex",alignItems:"center",justifyContent:"center",boxShadow:"0 4px 12px rgba(139,92,246,0.25)" }}>
                          <Activity size={13} color="white"/>
                        </div>
                        <span style={{ fontSize:13,fontWeight:800,color:text1,letterSpacing:"-0.01em" }}>Recent Activity</span>
                      </div>
                      {recentActivity.length > 0 && (
                        <span style={{ fontSize:9,fontWeight:700,padding:"3px 9px",borderRadius:20,
                          background:"rgba(139,92,246,0.1)",color:"#a78bfa",border:"1px solid rgba(139,92,246,0.2)",letterSpacing:"0.06em" }}>
                          LIVE
                        </span>
                      )}
                    </div>
                    {recentActivity.length > 0 ? (
                      <div style={{ display:"flex",flexDirection:"column",gap:2 }}>
                        {recentActivity.map((a, i) => (
                          <div key={i} style={{ display:"flex",alignItems:"center",gap:10,padding:"9px 0",borderBottom:i<recentActivity.length-1?`1px solid ${border}`:"none" }}>
                            <div style={{ width:28,height:28,borderRadius:8,background:dk?"rgba(255,255,255,0.04)":"rgba(0,0,0,0.04)",border:`1px solid ${border}`,
                              display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0 }}>
                              <div style={{ width:7,height:7,borderRadius:"50%",background:actDotColors[i%actDotColors.length] }} />
                            </div>
                            <div style={{ flex:1,minWidth:0 }}>
                              <div style={{ fontSize:12,color:text1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap" }}>
                                <strong style={{ fontWeight:700 }}>{a.name}</strong>
                                {" "}<span style={{ color:text2 }}>{a.action}</span>
                              </div>
                            </div>
                            <span style={{ fontSize:10,color:text2,flexShrink:0,whiteSpace:"nowrap",
                              background:dk?"rgba(255,255,255,0.04)":"rgba(0,0,0,0.04)",padding:"2px 7px",borderRadius:6,border:`1px solid ${border}` }}>
                              {a.time}
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div style={{ textAlign:"center",padding:"36px 0" }}>
                        <div style={{ width:44,height:44,borderRadius:13,background:dk?"rgba(255,255,255,0.04)":"rgba(0,0,0,0.04)",
                          display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 12px",border:`1px solid ${border}` }}>
                          <Activity size={20} style={{ opacity:0.2 }} />
                        </div>
                        <p style={{ fontSize:12,fontWeight:600,color:text2,marginBottom:4 }}>Quiet right now</p>
                        <p style={{ fontSize:11,color:text2,opacity:0.7,lineHeight:1.5 }}>Activity appears here live as students<br/>work on their projects.</p>
                      </div>
                    )}
                  </div>
                </div>
              </>
            ) : (
              <div style={{ ...cardStyle, display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:"72px 0",textAlign:"center" }}>
                <div style={{ width:48,height:48,borderRadius:14,background:dk?"rgba(255,255,255,0.04)":"rgba(0,0,0,0.04)",display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 12px",border:`1px solid ${border}` }}>
                  <Users size={20} style={{ opacity:0.2 }} />
                </div>
                <p style={{ fontSize:13,color:text2 }}>Create or select a class to get started</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
