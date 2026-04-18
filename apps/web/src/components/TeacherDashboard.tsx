import React, { useEffect, useState, useCallback } from "react";
import { useAuth } from "../lib/auth.tsx";
import { useTheme } from "../lib/theme.tsx";
import { api } from "../lib/api.ts";
import { Link } from "react-router-dom";
import { getSocket } from "../lib/ws.ts";
import {
  Monitor, ClipboardList, HelpCircle, CheckSquare, BarChart3,
  Lock, LockOpen, Megaphone, Eye, Users, Plus, Activity,
  Youtube, Trophy, Navigation, MessageSquare, Gamepad2,
  Send, X, GraduationCap,
} from "lucide-react";

/** Count-up animation for stat numbers */
function useCountUp(target: number, duration = 600) {
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

const TOOLS = (dk: boolean) => [
  { path: "/monitor",     icon: Monitor,      label: "Monitor",      desc: "Live student view", color: "text-pink-400",    bg: dk ? "bg-pink-500/10"    : "bg-pink-50",    accent: "border-l-pink-400"    },
  { path: "/assignments", icon: ClipboardList,label: "Assignments",  desc: "Create & manage",   color: "text-violet-400",  bg: dk ? "bg-violet-500/10"  : "bg-violet-50",  accent: "border-l-violet-400"  },
  { path: "/quizzes",     icon: HelpCircle,   label: "Quizzes",      desc: "Build & grade",     color: "text-blue-400",    bg: dk ? "bg-blue-500/10"    : "bg-blue-50",    accent: "border-l-blue-400"    },
  { path: "/grading",     icon: CheckSquare,  label: "Grading",      desc: "Review student work",color: "text-emerald-400", bg: dk ? "bg-emerald-500/10" : "bg-emerald-50", accent: "border-l-emerald-400" },
  { path: "/analytics",   icon: BarChart3,    label: "Analytics",    desc: "View reports",      color: "text-amber-400",   bg: dk ? "bg-amber-500/10"   : "bg-amber-50",   accent: "border-l-amber-400"   },
  { path: "/youtube",     icon: Youtube,      label: "YouTube Queue",desc: "Library + requests",color: "text-red-400",     bg: dk ? "bg-red-500/10"     : "bg-red-50",     accent: "border-l-red-400" },
  { path: "/leaderboard", icon: Trophy,       label: "Leaderboard",  desc: "Student rankings",  color: "text-yellow-400",  bg: dk ? "bg-yellow-500/10"  : "bg-yellow-50",  accent: "border-l-yellow-400"  },
  { path: "/lesson-analytics", icon: ClipboardList, label: "Lesson Views", desc: "Who read what",  color: "text-indigo-400",  bg: dk ? "bg-indigo-500/10"  : "bg-indigo-50",  accent: "border-l-indigo-400"  },
  { path: "/class-grades", icon: GraduationCap, label: "Class Grades", desc: "Per-student levels", color: "text-teal-400", bg: dk ? "bg-teal-500/10" : "bg-teal-50", accent: "border-l-teal-400" },
];

const PUSH_PAGES = [
  { label: "Dashboard",   path: "/student" },
  { label: "Lessons",     path: "/lessons" },
  { label: "Assignments", path: "/assignments" },
  { label: "Arcade",      path: "/arcade" },
];

export default function TeacherDashboard() {
  const { user } = useAuth();
  const { theme } = useTheme();
  const dk = theme === "dark";
  const [classes, setClasses]         = useState<any[]>([]);
  const [newClassName, setNewClassName] = useState("");
  const [selectedClass, setSelectedClass] = useState<any>(null);
  const [students, setStudents]       = useState<any[]>([]);
  const [announcement, setAnnouncement] = useState("");
  const [announceSent, setAnnounceSent] = useState(false);
  const [recentActivity, setRecentActivity] = useState<{ name: string; action: string; time: string }[]>([]);
  const [isClassLocked, setIsClassLocked] = useState(false);
  const [lockMsg, setLockMsg]         = useState("");
  const [showPushMenu, setShowPushMenu] = useState(false);
  const [showMsgModal, setShowMsgModal] = useState(false);
  const [msgText, setMsgText]         = useState("");
  const [pendingYouTube, setPendingYouTube] = useState(0);

  const tools = TOOLS(dk);

  useEffect(() => {
    api.getClasses().then(c => {
      setClasses(c);
      if (c.length > 0) { setSelectedClass(c[0]); loadStudents(c[0].id); }
    }).catch(console.error);

    // Count pending YouTube requests for badge
    api.getYouTubeRequests("pending").then(r => setPendingYouTube(r.length)).catch(() => {});
  }, []);

  useEffect(() => {
    const socket = getSocket();
    const handler = (data: any) => {
      setRecentActivity(prev => [
        { name: data.userName || "Student", action: data.action || "updated project", time: "just now" },
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
    if (locked) {
      await api.lockClass(selectedClass.id, lockMsg).catch(console.error);
    } else {
      await api.unlockClass(selectedClass.id).catch(console.error);
    }
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
    try {
      await api.forceUnlockAll();
      setIsClassLocked(false);
      alert("✓ All classes unlocked.");
    } catch (e: any) {
      alert("Failed: " + (e?.message || e));
    }
  };

  const onlineCount = useCountUp(students.length);

  return (
    <div className="p-7 space-y-6 animate-page-enter">

      {/* Message modal */}
      {showMsgModal && (
        <div style={{ position:"fixed",inset:0,zIndex:300,background:"rgba(0,0,0,0.5)",backdropFilter:"blur(4px)",display:"flex",alignItems:"center",justifyContent:"center" }}
          onClick={e => { if (e.target === e.currentTarget) setShowMsgModal(false); }}>
          <div className={`rounded-2xl p-6 w-full max-w-md shadow-2xl border ${dk?"bg-[#0f1029] border-white/[0.08]":"bg-white border-gray-200"}`}>
            <h3 className={`font-bold text-lg mb-4 ${dk?"text-white":"text-gray-900"}`}>💬 Message Everyone</h3>
            <textarea value={msgText} onChange={e => setMsgText(e.target.value)} placeholder="Type your message…" className="input w-full text-sm resize-none" rows={3} autoFocus />
            <div className="flex gap-2 mt-4">
              <button onClick={handleSendMessage} disabled={!msgText.trim()} className="btn-primary flex-1 gap-2"><Send size={14}/> Send</button>
              <button onClick={() => { setShowMsgModal(false); setMsgText(""); }} className="btn-secondary px-4">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Editorial masthead header ── */}
      <header className="border-b pb-5" style={{ borderColor: "var(--border)" }}>
        <div className="flex items-center justify-between mb-2 text-[10px] uppercase tracking-[0.16em]" style={{ color: "var(--text-3)" }}>
          <span>{new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}</span>
          <span className="font-mono">{user?.role === "admin" ? "BLOCKFORGE · ADMIN" : "BLOCKFORGE · TEACHER"}</span>
        </div>
        <div className="flex items-end justify-between gap-4 flex-wrap">
          <div>
            <div className="section-label mb-2">— Today's classroom —</div>
            <h1 className="font-display text-4xl sm:text-5xl leading-[1.02]" style={{ color: "var(--text-1)" }}>
              Morning, <em style={{ color: "var(--accent)", fontStyle: "italic" }}>{user?.name?.split(" ")[0]}.</em>
            </h1>
            <p className="text-sm mt-2" style={{ color: "var(--text-2)" }}>
              Quiet tools for a busy classroom. Monitor students, push assignments, keep the day running.
            </p>
          </div>
          <button
            onClick={handleForceUnlockAll}
            title="Clear every active lock system-wide — use if a student gets stuck"
            className="flex items-center gap-2 px-3 py-2 text-xs font-semibold border cursor-pointer transition-colors"
            style={{
              color: "var(--danger)",
              background: "color-mix(in srgb, var(--danger) 8%, transparent)",
              borderColor: "color-mix(in srgb, var(--danger) 30%, transparent)",
              borderRadius: "var(--r-md)",
            }}
          >
            <LockOpen size={13}/> Force Unlock All
          </button>
        </div>
      </header>

      {/* Quick-access tools grid — staggered fade in */}
      <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-7 gap-3">
        {tools.map((item, i) => (
          <Link
            key={item.path + item.label}
            to={item.path}
            className={`group flex flex-col gap-2 p-3 rounded-2xl border transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg animate-slide-in cursor-pointer ${
              dk
                ? `bg-white/[0.03] border-white/[0.06] hover:bg-white/[0.06] hover:border-white/[0.12] border-l-2 ${item.accent}`
                : `bg-white border-gray-200 hover:border-gray-300 hover:shadow-md border-l-2 ${item.accent}`
            }`}
            style={{ animationDelay: `${i * 50}ms` }}
          >
            <div className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 ${item.bg}`}>
              <item.icon size={16} className={item.color} />
            </div>
            <div className="min-w-0">
              <div className={`font-semibold text-xs leading-tight truncate ${dk ? "text-white" : "text-gray-900"}`}>
                {item.label}
                {item.label === "YouTube Queue" && pendingYouTube > 0 && (
                  <span className="ml-1 text-[9px] bg-red-500 text-white rounded-full px-1 py-0.5 font-bold">{pendingYouTube}</span>
                )}
              </div>
              <div className={`text-[10px] truncate mt-0.5 ${dk ? "text-white/30" : "text-gray-400"}`}>{item.desc}</div>
            </div>
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-4">
        {/* Classes panel */}
        <div className="card animate-slide-in" style={{ animationDelay: "80ms" }}>
          <h2 className={`text-sm font-semibold mb-3 ${dk ? "text-white/70" : "text-gray-700"}`}>My Classes</h2>
          <div className="flex gap-2 mb-3">
            <input
              value={newClassName}
              onChange={e => setNewClassName(e.target.value)}
              placeholder="Class name…"
              className="input text-sm flex-1"
              onKeyDown={e => e.key === "Enter" && handleCreateClass()}
            />
            <button onClick={handleCreateClass} className="btn-primary px-3 gap-1">
              <Plus size={14} />
            </button>
          </div>
          <div className="space-y-1">
            {classes.map(cls => (
              <button
                key={cls.id}
                onClick={() => { setSelectedClass(cls); loadStudents(cls.id); setIsClassLocked(false); }}
                className={`w-full text-left px-3 py-2.5 rounded-xl transition-all text-sm cursor-pointer ${
                  selectedClass?.id === cls.id
                    ? "bg-violet-600/15 text-violet-300 border border-violet-500/20"
                    : dk ? "text-white/55 hover:text-white hover:bg-white/[0.04]" : "text-gray-600 hover:text-gray-900 hover:bg-gray-100"
                }`}
              >
                <div className="font-medium leading-tight">{cls.name}</div>
                <div className={`text-xs font-mono mt-0.5 ${dk ? "text-white/25" : "text-gray-400"}`}>{cls.code}</div>
              </button>
            ))}
            {classes.length === 0 && (
              <p className={`text-xs text-center py-6 ${dk ? "text-white/25" : "text-gray-400"}`}>No classes yet</p>
            )}
          </div>
        </div>

        {/* Main panel */}
        <div className="col-span-2 space-y-4">
          {selectedClass ? (
            <>
              {/* Classroom controls — GoGuardian style */}
              <div className="card animate-slide-in" style={{ animationDelay: "120ms" }}>
                <div className="flex items-center justify-between mb-3">
                  <h3 className={`text-sm font-semibold flex items-center gap-2 ${dk ? "text-white/70" : "text-gray-700"}`}>
                    Classroom Controls
                    <span className={`text-xs font-normal ${dk ? "text-white/25" : "text-gray-400"}`}>{selectedClass.name}</span>
                  </h3>
                  {isClassLocked && (
                    <span className="flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-full bg-red-500/15 text-red-400 border border-red-500/25 animate-pulse">
                      <Lock size={11}/> LOCKED
                    </span>
                  )}
                </div>

                {/* Announce */}
                <div className="flex gap-2 mb-3">
                  <input value={announcement} onChange={e => setAnnouncement(e.target.value)} placeholder="Type announcement…" className="input text-sm flex-1" onKeyDown={e => e.key === "Enter" && handleBroadcast()} />
                  <button onClick={handleBroadcast} className={`btn-primary gap-2 px-4 transition-all ${announceSent?"bg-emerald-500 border-emerald-500":""}`}>
                    {announceSent ? "Sent!" : <><Megaphone size={14}/> Broadcast</>}
                  </button>
                </div>

                {/* Lock message */}
                <input value={lockMsg} onChange={e => setLockMsg(e.target.value)} placeholder="Lock screen message (optional)…" className="input text-sm w-full mb-3" />

                {/* Actions */}
                <div className="flex flex-wrap gap-2">
                  <button onClick={() => handleLockScreens(true)} className={`btn-danger gap-2 ${isClassLocked ? "opacity-60" : ""}`}>
                    <Lock size={13}/> Lock Screens
                  </button>
                  <button onClick={() => handleLockScreens(false)} className="btn-secondary gap-2">
                    <LockOpen size={13}/> Unlock
                  </button>

                  {/* Push to Page dropdown */}
                  <div className="relative">
                    <button onClick={() => setShowPushMenu(v => !v)}
                      className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium border cursor-pointer transition-all ${dk?"bg-blue-500/10 hover:bg-blue-500/18 text-blue-400 border-blue-500/20":"bg-blue-50 hover:bg-blue-100 text-blue-600 border-blue-200"}`}>
                      <Navigation size={12}/> Push to Page ▾
                    </button>
                    {showPushMenu && (
                      <div className={`absolute top-full mt-1 left-0 rounded-xl shadow-2xl border z-50 overflow-hidden ${dk?"bg-[#0f1029] border-white/[0.08]":"bg-white border-gray-200"}`} style={{ minWidth: 160 }}>
                        {PUSH_PAGES.map(p => (
                          <button key={p.path} onClick={() => handlePushToPage(p.path)}
                            className={`w-full text-left px-4 py-2.5 text-xs cursor-pointer transition-colors ${dk?"hover:bg-white/[0.05] text-white/70 hover:text-white":"hover:bg-gray-50 text-gray-700"}`}>
                            → {p.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  <button onClick={() => setShowMsgModal(true)}
                    className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium border cursor-pointer transition-all ${dk?"bg-violet-500/10 hover:bg-violet-500/18 text-violet-400 border-violet-500/20":"bg-violet-50 hover:bg-violet-100 text-violet-600 border-violet-200"}`}>
                    <MessageSquare size={12}/> Message All
                  </button>

                  <Link to="/monitor" className={`ml-auto flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium transition-all cursor-pointer ${dk?"bg-pink-500/10 hover:bg-pink-500/18 text-pink-400 border border-pink-500/20":"bg-pink-50 hover:bg-pink-100 text-pink-600 border border-pink-200"}`}>
                    <Eye size={12}/> Open Monitor
                  </Link>
                </div>
              </div>

              {/* Students list */}
              <div className="card animate-slide-in" style={{ animationDelay: "160ms" }}>
                <div className="flex items-center justify-between mb-3">
                  <h3 className={`text-sm font-semibold flex items-center gap-2 ${dk ? "text-white/70" : "text-gray-700"}`}>
                    <Users size={14}/> Students ({students.length})
                  </h3>
                  <Link to="/monitor" className={`text-xs font-medium transition-colors ${dk ? "text-violet-400 hover:text-violet-300" : "text-violet-600 hover:text-violet-700"}`}>
                    Full monitor →
                  </Link>
                </div>
                <div className="space-y-1.5">
                  {students.map(s => (
                    <Link
                      key={s.id}
                      to={`/teacher/gradebook/${s.id}`}
                      className="list-row group cursor-pointer hover:bg-white/[0.04] transition-colors"
                      title="Open gradebook"
                    >
                      <div className="flex items-center gap-3">
                        <div className="relative">
                          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-emerald-500 to-green-600 flex items-center justify-center text-white text-xs font-bold shadow-md">
                            {s.name.charAt(0)}
                          </div>
                          <span className={`absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full bg-gray-400 border-2 ${dk?"border-[#0f1029]":"border-white"}`} />
                        </div>
                        <div>
                          <div className={`text-sm font-medium ${dk ? "text-white" : "text-gray-900"}`}>{s.name}</div>
                          <div className={`text-xs ${dk ? "text-white/25" : "text-gray-400"}`}>{s.email}</div>
                        </div>
                      </div>
                      <span className={`text-xs font-medium opacity-0 group-hover:opacity-100 transition-opacity ${dk ? "text-violet-400" : "text-violet-600"}`}>
                        Gradebook →
                      </span>
                    </Link>
                  ))}
                  {students.length === 0 && (
                    <p className={`text-sm text-center py-7 ${dk ? "text-white/25" : "text-gray-400"}`}>
                      Share code{" "}
                      <strong className={`font-mono ${dk?"text-violet-400":"text-violet-600"}`}>{selectedClass.code}</strong>{" "}
                      to add students
                    </p>
                  )}
                </div>
              </div>

              {/* Activity feed */}
              <div className="card animate-slide-in" style={{ animationDelay: "200ms" }}>
                <h3 className={`text-sm font-semibold mb-3 flex items-center gap-2 ${dk ? "text-white/70" : "text-gray-700"}`}>
                  <Activity size={14}/> Recent Activity
                </h3>
                {recentActivity.length > 0 ? (
                  <div className="space-y-1">
                    {recentActivity.map((a, i) => (
                      <div key={i} className={`flex items-center gap-3 text-xs py-2 border-b last:border-0 ${dk?"text-white/35 border-white/[0.04]":"text-gray-500 border-gray-100"}`}>
                        <span className="w-1.5 h-1.5 rounded-full bg-violet-400/60 flex-shrink-0" />
                        <span><strong className={dk?"text-white/55":"text-gray-700"}>{a.name}</strong> {a.action}</span>
                        <span className={`ml-auto flex-shrink-0 ${dk?"text-white/20":"text-gray-400"}`}>{a.time}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <p className="text-2xl mb-2">🎒</p>
                    <p className={`text-xs ${dk?"text-white/25":"text-gray-400"}`}>
                      Students are quiet right now. Check back when class starts!
                    </p>
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className={`card flex flex-col items-center justify-center py-16 text-center ${dk?"text-white/20":"text-gray-400"}`}>
              <Users size={32} className="mb-3 opacity-40" />
              <p className="text-sm">Create or select a class to get started</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
