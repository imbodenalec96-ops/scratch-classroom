import React, { useEffect, useState, useCallback, useRef } from "react";
import { useTheme } from "../lib/theme.tsx";
import { useAuth } from "../lib/auth.tsx";
import { api } from "../lib/api.ts";
import { getSocket } from "../lib/ws.ts";
import { Link, useNavigate } from "react-router-dom";
import {
  Users, Wifi, WifiOff, Lock, LockOpen, Megaphone,
  ChevronLeft, Monitor, Activity, Box, ExternalLink,
  Youtube, X, Play, Square, Eye, Send, Navigation,
  Gamepad2, BookOpen, LayoutDashboard, MessageSquare,
} from "lucide-react";
import StudentDrawer from "./StudentDrawer.tsx";

/* ── helpers ──────────────────────────────────────────────── */

function timeAgo(ts: number): string {
  if (!ts) return "No activity yet";
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 5)    return "just now";
  if (s < 60)   return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
}

function avatarGradient(name: string): string {
  const p = [
    "from-violet-500 to-indigo-600","from-cyan-500 to-blue-600",
    "from-emerald-500 to-teal-600","from-amber-500 to-orange-600",
    "from-pink-500 to-rose-600","from-sky-500 to-cyan-600",
    "from-fuchsia-500 to-purple-600","from-lime-500 to-green-600",
  ];
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xffff;
  return p[h % p.length];
}

function extractYouTubeId(url: string): string | null {
  if (!url) return null;
  if (/^[A-Za-z0-9_-]{11}$/.test(url.trim())) return url.trim();
  const m = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([A-Za-z0-9_-]{11})/);
  return m ? m[1] : null;
}

/** Maps presence activity string to an icon/label for the tile preview */
function activityPreview(activity: string): { emoji: string; label: string; color: string } {
  const a = (activity || "").toLowerCase();
  if (a.includes("arcade") || a.includes("game"))  return { emoji: "🎮", label: "In Arcade",       color: "#8b5cf6" };
  if (a.includes("assignment") || a.includes("quiz")) return { emoji: "📝", label: "On Assignment", color: "#f59e0b" };
  if (a.includes("project"))                        return { emoji: "💻", label: "In Projects",     color: "#06b6d4" };
  if (a.includes("lesson"))                         return { emoji: "📖", label: "Reading Lessons", color: "#10b981" };
  if (a.includes("video"))                          return { emoji: "📺", label: "Watching Video",  color: "#ef4444" };
  if (a.includes("dashboard"))                      return { emoji: "🏠", label: "On Dashboard",   color: "#6366f1" };
  return { emoji: "🟢", label: activity || "Online",                                                color: "#34d399" };
}

const PUSH_PAGES = [
  { label: "Dashboard",  path: "/student",  icon: LayoutDashboard },
  { label: "Lessons",    path: "/lessons",  icon: BookOpen },
  { label: "Assignments",path: "/assignments", icon: BookOpen },
  { label: "Arcade",     path: "/arcade",   icon: Gamepad2 },
];

/* ── main component ────────────────────────────────────────── */

export default function MonitorPage() {
  const { theme } = useTheme();
  const { user } = useAuth();
  const dk = theme === "dark";

  const [classes, setClasses]               = useState<any[]>([]);
  const [selectedClass, setSelectedClass]   = useState<any>(null);
  const [students, setStudents]             = useState<any[]>([]);
  const [presence, setPresence]             = useState<Record<string, any>>({});
  const [announcement, setAnnouncement]     = useState("");
  const [announceSent, setAnnounceSent]     = useState(false);
  const [wsConnected, setWsConnected]       = useState(false);
  const [loading, setLoading]               = useState(true);
  const [tick, setTick]                     = useState(0);
  const [isClassLocked, setIsClassLocked]   = useState(false);
  const [lockMsg, setLockMsg]               = useState("");
  const [pollOk, setPollOk]                 = useState(false);
  const [lastPollAt, setLastPollAt]         = useState<number>(0);
  const [snapshots, setSnapshots]           = useState<Record<string, { data: string; path: string; capturedAt: string }>>({});
  const [zoomedSnapshot, setZoomedSnapshot] = useState<{ name: string; data: string; path: string } | null>(null);
  const [drawerStudent, setDrawerStudent]   = useState<any>(null);
  const [period, setPeriod]                 = useState<string>(() => localStorage.getItem("monitor_period") || "None");
  const [showConfigPanel, setShowConfigPanel] = useState(false);
  const [freeTimeConfig, setFreeTimeConfig] = useState<any>({
    arcadeEnabled: true, projectsEnabled: true, unityEnabled: true,
    blockforgeEnabled: true, youtubeEnabled: true, dailyCapMinutes: 0,
  });

  useEffect(() => { localStorage.setItem("monitor_period", period); }, [period]);

  // Load per-class config
  useEffect(() => {
    if (!selectedClass) return;
    api.getClassConfig(selectedClass.id).then((cfg: any) => {
      if (cfg && typeof cfg === 'object') setFreeTimeConfig((prev: any) => ({ ...prev, ...cfg }));
    }).catch(() => {});
  }, [selectedClass]);

  const saveConfig = useCallback(async () => {
    if (!selectedClass) return;
    try {
      await api.updateClassConfig(selectedClass.id, freeTimeConfig);
      alert("✓ Free-time config saved");
    } catch (e: any) { alert("Failed: " + e.message); }
  }, [selectedClass, freeTimeConfig]);

  const handleGrantAll = async () => {
    if (!selectedClass) return;
    if (!confirm(`Grant free time to every student in ${selectedClass.name}?`)) return;
    try { const r = await api.grantFreeTimeAll(selectedClass.id); alert(`✓ Free time granted to ${r.studentsAffected} students`); }
    catch (e: any) { alert("Failed: " + e.message); }
  };
  const handleRevokeAll = async () => {
    if (!selectedClass) return;
    if (!confirm(`Revoke free time for every student in ${selectedClass.name}? They'll be pushed back to assignments.`)) return;
    try { const r = await api.revokeFreeTimeAll(selectedClass.id); alert(`⛔ Free time revoked for ${r.studentsAffected} students`); }
    catch (e: any) { alert("Failed: " + e.message); }
  };
  const [showMsgModal, setShowMsgModal]     = useState<string | null>(null); // studentId or "all"
  const [msgText, setMsgText]               = useState("");
  const [showPushMenu, setShowPushMenu]     = useState(false);
  const announceRef                         = useRef<HTMLInputElement>(null);

  // Video sharing
  const [videoUrl, setVideoUrl]             = useState("");
  const [videoTitle, setVideoTitle]         = useState("");
  const [activeVideo, setActiveVideo]       = useState<string | null>(null);
  const [showVideoInput, setShowVideoInput] = useState(false);

  // Unity live view
  const [watchingRoom, setWatchingRoom]     = useState<string | null>(null);
  const [watchingName, setWatchingName]     = useState("");

  // Refresh time-ago every 10s
  useEffect(() => {
    const iv = setInterval(() => setTick(t => t + 1), 10000);
    return () => clearInterval(iv);
  }, []);

  // Load classes
  useEffect(() => {
    api.getClasses()
      .then(c => {
        setClasses(c);
        if (c.length > 0) { setSelectedClass(c[0]); loadClass(c[0]); }
        else setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const loadClass = useCallback(async (cls: any) => {
    setLoading(true);
    try {
      const studs = await api.getStudents(cls.id);
      setStudents(studs);
      const init: Record<string, any> = {};
      for (const s of studs) init[s.id] = { isOnline: false, lastActive: 0, lastAction: "No activity yet" };
      setPresence(init);
    } catch {
      setStudents([]); setPresence({});
    } finally { setLoading(false); }
  }, []);

  const handleClassChange = (classId: string) => {
    const cls = classes.find(c => c.id === classId);
    if (!cls) return;
    setSelectedClass(cls); loadClass(cls);
    setIsClassLocked(false);
  };

  // HTTP polling for presence every 5s
  useEffect(() => {
    if (!selectedClass) return;
    const fetchPresence = async () => {
      try {
        const data = await api.getClassPresence(selectedClass.id);
        setPresence(prev => {
          const next = { ...prev };
          for (const s of data) {
            next[s.id] = {
              ...prev[s.id],
              isOnline: s.isOnline,
              lastActive: s.last_seen ? new Date(s.last_seen).getTime() : (prev[s.id]?.lastActive ?? 0),
              lastAction: s.activity || prev[s.id]?.lastAction || "online",
            };
          }
          return next;
        });
        setPollOk(true);
        setLastPollAt(Date.now());
      } catch (e) {
        console.warn('presence poll failed:', e);
        setPollOk(false);
      }
    };
    fetchPresence();
    const iv = setInterval(fetchPresence, 5000);
    return () => clearInterval(iv);
  }, [selectedClass]);

  // Poll snapshot thumbnails every 6 seconds
  useEffect(() => {
    if (!selectedClass) return;
    const fetchSnaps = async () => {
      try {
        const data = await api.getClassSnapshots(selectedClass.id);
        setSnapshots(() => {
          const next: Record<string, any> = {};
          for (const s of data) next[s.userId] = s;
          return next;
        });
      } catch { /* silent */ }
    };
    fetchSnaps();
    const iv = setInterval(fetchSnaps, 6000);
    return () => clearInterval(iv);
  }, [selectedClass]);

  // WebSocket live presence
  useEffect(() => {
    const socket = getSocket();
    setWsConnected(socket.connected);
    const onConnect    = () => setWsConnected(true);
    const onDisconnect = () => setWsConnected(false);
    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    const mark = (data: any, action: string) => {
      setStudents(prev => {
        const matched = prev.find(s =>
          (data.userId && s.id === data.userId) || (data.userName && s.name === data.userName)
        );
        if (!matched) return prev;
        setPresence(p => ({
          ...p,
          [matched.id]: {
            ...p[matched.id],
            isOnline: true, lastActive: Date.now(), lastAction: action,
            ...(data.projectId   ? { projectId: data.projectId }   : {}),
            ...(data.projectName ? { projectName: data.projectName } : {}),
            ...(Array.isArray(data.blocks) ? { blockCount: data.blocks.length } : {}),
          },
        }));
        return prev;
      });
    };
    const onUnityJoin = (data: any) => {
      setStudents(prev => {
        const matched = prev.find(s =>
          (data.userId && s.id === data.userId) || (data.userName && s.name === data.userName)
        );
        if (!matched) return prev;
        setPresence(p => ({
          ...p,
          [matched.id]: { ...p[matched.id], isOnline: true, lastActive: Date.now(), lastAction: "in Unity 3D", unityRoom: data.room },
        }));
        return prev;
      });
    };
    socket.on("project:update", d => mark(d, d.action || "updated project"));
    socket.on("chat:message",   d => mark(d, "sent a message"));
    socket.on("unity:join", onUnityJoin);
    return () => {
      socket.off("connect", onConnect); socket.off("disconnect", onDisconnect);
      socket.off("project:update"); socket.off("chat:message"); socket.off("unity:join", onUnityJoin);
    };
  }, []);

  // ── GoGuardian actions ─────────────────────────────────────

  const handleLockAll = useCallback(async (locked: boolean) => {
    if (!selectedClass) return;
    if (locked) {
      await api.lockClass(selectedClass.id, lockMsg).catch(console.error);
    } else {
      await api.unlockClass(selectedClass.id).catch(console.error);
    }
    setIsClassLocked(locked);
    // Also emit WS for fast response on same-origin clients
    getSocket().emit("class:lock", { classId: selectedClass.id, locked });
  }, [selectedClass, lockMsg]);

  const handlePushToPage = useCallback(async (path: string) => {
    if (!selectedClass) return;
    await api.sendClassCommand(selectedClass.id, "NAVIGATE", path).catch(console.error);
    setShowPushMenu(false);
  }, [selectedClass]);

  const handleSendMessage = useCallback(async () => {
    if (!selectedClass || !msgText.trim()) return;
    if (showMsgModal === "all") {
      await api.sendClassCommand(selectedClass.id, "MESSAGE", msgText.trim()).catch(console.error);
    } else if (showMsgModal) {
      await api.sendClassCommand(selectedClass.id, "MESSAGE", msgText.trim(), showMsgModal).catch(console.error);
    }
    setMsgText(""); setShowMsgModal(null);
  }, [selectedClass, showMsgModal, msgText]);

  const handleKick = useCallback(async (studentId: string) => {
    if (!selectedClass) return;
    await api.sendClassCommand(selectedClass.id, "KICK", "/student", studentId).catch(console.error);
  }, [selectedClass]);

  const handleAnnounce = useCallback(() => {
    if (!announcement.trim() || !selectedClass) return;
    getSocket().emit("class:broadcast", { classId: selectedClass.id, message: announcement.trim() });
    setAnnouncement(""); setAnnounceSent(true);
    setTimeout(() => setAnnounceSent(false), 2000);
    announceRef.current?.blur();
  }, [announcement, selectedClass]);

  // Video sharing
  const handleShareVideo = () => {
    if (!selectedClass) return;
    const id = extractYouTubeId(videoUrl);
    if (!id) { alert("Couldn't find a YouTube video ID."); return; }
    getSocket().emit("class:video", { classId: selectedClass.id, videoId: id, url: videoUrl, title: videoTitle || "Class Video" });
    api.shareClassVideo(selectedClass.id, id, videoTitle || "Class Video").catch(() => {});
    setActiveVideo(id); setShowVideoInput(false); setVideoUrl(""); setVideoTitle("");
  };

  const handleStopVideo = () => {
    if (!selectedClass) return;
    getSocket().emit("class:video:stop", { classId: selectedClass.id });
    api.stopClassVideo(selectedClass.id).catch(() => {});
    setActiveVideo(null);
  };

  const onlineCount  = Object.values(presence).filter(p => p.isOnline).length;
  const offlineCount = students.length - onlineCount;

  return (
    <div className="p-6 space-y-5 animate-page-enter">

      {/* Per-student control drawer */}
      {drawerStudent && selectedClass && (
        <StudentDrawer
          open={!!drawerStudent}
          onClose={() => setDrawerStudent(null)}
          student={drawerStudent}
          classId={selectedClass.id}
          presence={presence[drawerStudent.id] || {}}
          dk={dk}
        />
      )}

      {/* Zoomed snapshot modal */}
      {zoomedSnapshot && (
        <div onClick={() => setZoomedSnapshot(null)}
          style={{ position:"fixed",inset:0,zIndex:300,background:"rgba(0,0,0,0.85)",backdropFilter:"blur(8px)",display:"flex",alignItems:"center",justifyContent:"center",padding:20,cursor:"pointer" }}>
          <div onClick={e => e.stopPropagation()} style={{ maxWidth: 960, width:"100%", cursor:"default" }}>
            <div style={{ display:"flex", alignItems:"center", gap:10, padding:"10px 16px", background:"rgba(139,92,246,0.1)", borderRadius:"12px 12px 0 0", border:"1px solid rgba(139,92,246,0.25)", borderBottom:"none" }}>
              <div style={{ width:8, height:8, borderRadius:"50%", background:"#10b981", boxShadow:"0 0 8px #10b981", animation:"pulse 2s infinite" }} />
              <span style={{ color:"white", fontWeight:700, fontSize:13 }}>{zoomedSnapshot.name}'s screen</span>
              <span style={{ color:"rgba(255,255,255,0.4)", fontSize:11 }}>{zoomedSnapshot.path}</span>
              <button onClick={() => setZoomedSnapshot(null)} style={{ marginLeft:"auto", background:"rgba(255,255,255,0.08)", border:"1px solid rgba(255,255,255,0.12)", color:"rgba(255,255,255,0.7)", borderRadius:8, padding:"4px 12px", cursor:"pointer", fontSize:12, fontWeight:600 }}>✕ Close</button>
            </div>
            <img src={zoomedSnapshot.data} alt="student screen" style={{ width:"100%", display:"block", borderRadius:"0 0 12px 12px", border:"1px solid rgba(139,92,246,0.25)" }} />
          </div>
        </div>
      )}

      {/* Unity live view modal */}
      {watchingRoom && (
        <div style={{ position:"fixed",inset:0,zIndex:200,background:"rgba(0,0,0,0.85)",backdropFilter:"blur(8px)",display:"flex",alignItems:"center",justifyContent:"center" }}>
          <div style={{ width:"min(960px,96vw)",borderRadius:16,overflow:"hidden",border:"1px solid rgba(34,211,238,0.3)",background:"#07071a",display:"flex",flexDirection:"column" }}>
            <div style={{ display:"flex",alignItems:"center",gap:10,padding:"10px 16px",background:"rgba(34,211,238,0.07)",borderBottom:"1px solid rgba(34,211,238,0.15)" }}>
              <div style={{ width:8,height:8,borderRadius:"50%",background:"#22d3ee",boxShadow:"0 0 8px #22d3ee" }} />
              <span style={{ color:"#22d3ee",fontWeight:700,fontSize:13 }}>👁 Watching {watchingName}'s Unity Stage — Room: {watchingRoom}</span>
              <button onClick={() => { setWatchingRoom(null); setWatchingName(""); }} style={{ marginLeft:"auto",background:"rgba(255,255,255,0.07)",border:"1px solid rgba(255,255,255,0.12)",color:"rgba(255,255,255,0.6)",borderRadius:8,padding:"4px 12px",cursor:"pointer",fontSize:12,fontWeight:600 }}>✕ Close</button>
            </div>
            <iframe src={`/unity-games/blockforge-stage/index.html?room=${encodeURIComponent(watchingRoom)}&spectator=1`} style={{ width:"100%",height:540,border:"none" }} allow="autoplay; fullscreen; pointer-lock" title="Unity Live View" />
          </div>
        </div>
      )}

      {/* Message modal */}
      {showMsgModal && (
        <div style={{ position:"fixed",inset:0,zIndex:300,background:"rgba(0,0,0,0.6)",backdropFilter:"blur(4px)",display:"flex",alignItems:"center",justifyContent:"center" }}
          onClick={e => { if (e.target === e.currentTarget) setShowMsgModal(null); }}>
          <div className={`rounded-2xl p-6 w-full max-w-md shadow-2xl border ${dk ? "bg-[#0f1029] border-white/[0.08]" : "bg-white border-gray-200"}`}>
            <h3 className={`font-bold text-lg mb-4 ${dk ? "text-white" : "text-gray-900"}`}>
              💬 Send Message{showMsgModal === "all" ? " to Everyone" : ` to ${students.find(s => s.id === showMsgModal)?.name}`}
            </h3>
            <textarea
              value={msgText}
              onChange={e => setMsgText(e.target.value)}
              placeholder="Type your message…"
              className="input w-full text-sm resize-none"
              rows={3}
              autoFocus
              onKeyDown={e => { if (e.key === "Enter" && e.metaKey) handleSendMessage(); }}
            />
            <div className="flex gap-2 mt-4">
              <button onClick={handleSendMessage} disabled={!msgText.trim()} className="btn-primary flex-1 gap-2">
                <Send size={14} /> Send
              </button>
              <button onClick={() => { setShowMsgModal(null); setMsgText(""); }} className="btn-secondary px-4">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className={`text-2xl font-bold tracking-tight flex items-center gap-2 ${dk ? "text-white" : "text-gray-900"}`}>
            <Monitor size={22} className="text-pink-400" />
            Student Monitor
          </h1>
          <p className={`text-sm mt-0.5 ${dk ? "text-white/40" : "text-gray-500"}`}>
            {loading ? "Loading…" : `${onlineCount} online · ${offlineCount} offline · ${students.length} total`}
          </p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <div className={`flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-full ${
            pollOk || wsConnected
              ? dk ? "bg-emerald-500/10 text-emerald-400" : "bg-emerald-50 text-emerald-600"
              : dk ? "bg-red-500/10 text-red-400" : "bg-red-50 text-red-600"
          }`}>
            {pollOk || wsConnected ? (
              <><span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                <Wifi size={11}/> {wsConnected ? "Live" : "Connected"}</>
            ) : (
              <><span className="w-1.5 h-1.5 rounded-full bg-red-400" />
                <WifiOff size={11}/> Disconnected</>
            )}
          </div>
          {/* Force Unlock All — panic button */}
          <button
            onClick={async () => {
              if (!confirm("Force-unlock EVERY class?")) return;
              try { await api.forceUnlockAll(); setIsClassLocked(false); alert("✓ All classes unlocked."); }
              catch (e: any) { alert("Failed: " + (e?.message || e)); }
            }}
            title="Clear every active lock system-wide"
            className={`flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1.5 rounded-full cursor-pointer transition-all ${
              dk ? "bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/25"
                 : "bg-red-50 hover:bg-red-100 text-red-600 border border-red-200"
            }`}
          >
            <LockOpen size={11}/> Force Unlock All
          </button>
          {/* Period selector — label-only, doesn't auto-trigger (per user spec) */}
          <select value={period} onChange={e => setPeriod(e.target.value)}
            className="input py-2 text-xs w-36"
            title="Class period — just a label to scope your current settings"
          >
            <option value="None">No period</option>
            {["Period 1","Period 2","Period 3","Period 4","Period 5","Period 6","Free Time"].map(p =>
              <option key={p} value={p}>{p}</option>
            )}
          </select>
          {classes.length > 1 && (
            <select value={selectedClass?.id ?? ""} onChange={e => handleClassChange(e.target.value)} className="input py-2 text-sm w-44">
              {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          )}
          <Link to="/teacher" className={`flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-xl border transition-colors ${dk ? "border-white/[0.07] text-white/50 hover:text-white hover:bg-white/[0.04]" : "border-gray-200 text-gray-500 hover:text-gray-800 hover:bg-gray-50"}`}>
            <ChevronLeft size={13}/> Dashboard
          </Link>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label:"Online",    value:onlineCount,     color:"text-emerald-400", bg:dk?"bg-emerald-500/10":"bg-emerald-50", border:dk?"border-emerald-500/20":"border-emerald-200", icon:<Wifi size={14}/> },
          { label:"Offline",   value:offlineCount,    color:"text-red-400",     bg:dk?"bg-red-500/10":"bg-red-50",         border:dk?"border-red-500/20":"border-red-200",         icon:<WifiOff size={14}/> },
          { label:"Students",  value:students.length, color:"text-violet-400",  bg:dk?"bg-violet-500/10":"bg-violet-50",   border:dk?"border-violet-500/20":"border-violet-200",   icon:<Users size={14}/> },
          { label:"Active Now",value:onlineCount,     color:"text-blue-400",    bg:dk?"bg-blue-500/10":"bg-blue-50",       border:dk?"border-blue-500/20":"border-blue-200",       icon:<Activity size={14}/> },
        ].map(stat => (
          <div key={stat.label} className={`rounded-xl px-4 py-3 border flex items-center gap-3 ${stat.bg} ${stat.border}`}>
            <div className={stat.color}>{stat.icon}</div>
            <div>
              <div className={`text-xs ${dk?"text-white/40":"text-gray-500"}`}>{stat.label}</div>
              <div className={`text-2xl font-bold leading-tight ${dk?"text-white":"text-gray-900"}`}>{stat.value}</div>
            </div>
          </div>
        ))}
      </div>

      {/* GoGuardian Controls */}
      {selectedClass && (
        <div className="card space-y-3">
          <div className="flex items-center justify-between">
            <h3 className={`text-sm font-semibold flex items-center gap-2 ${dk?"text-white/70":"text-gray-700"}`}>
              <Monitor size={14} className="text-pink-400" />
              Classroom Controls
              <span className={`text-xs font-normal ${dk?"text-white/25":"text-gray-400"}`}>— {selectedClass.name}</span>
            </h3>
            {isClassLocked && (
              <span className="flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-full bg-red-500/15 text-red-400 border border-red-500/25 animate-pulse">
                <Lock size={11}/> LOCKED
              </span>
            )}
          </div>

          {/* Row 1: Lock controls + Push to Page */}
          <div className="flex flex-wrap gap-2">
            <button onClick={() => handleLockAll(true)}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium border transition-all cursor-pointer ${isClassLocked ? "bg-red-500/20 text-red-300 border-red-400/40" : dk?"bg-red-500/10 hover:bg-red-500/18 text-red-400 border-red-500/20":"bg-red-50 hover:bg-red-100 text-red-600 border-red-200"}`}>
              <Lock size={13}/> Lock All
            </button>
            <button onClick={() => handleLockAll(false)}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium border transition-all cursor-pointer ${dk?"bg-emerald-500/10 hover:bg-emerald-500/18 text-emerald-400 border-emerald-500/20":"bg-emerald-50 hover:bg-emerald-100 text-emerald-600 border-emerald-200"}`}>
              <LockOpen size={13}/> Unlock All
            </button>

            {/* Optional lock message */}
            <input
              value={lockMsg}
              onChange={e => setLockMsg(e.target.value)}
              placeholder="Lock message (optional)…"
              className="input text-sm flex-1 min-w-0"
            />

            {/* Push to Page */}
            <div className="relative">
              <button
                onClick={() => setShowPushMenu(v => !v)}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium border transition-all cursor-pointer ${dk?"bg-blue-500/10 hover:bg-blue-500/18 text-blue-400 border-blue-500/20":"bg-blue-50 hover:bg-blue-100 text-blue-600 border-blue-200"}`}>
                <Navigation size={13}/> Push to Page ▾
              </button>
              {showPushMenu && (
                <div className={`absolute top-full mt-1 right-0 rounded-xl shadow-2xl border overflow-hidden z-50 ${dk?"bg-[#0f1029] border-white/[0.08]":"bg-white border-gray-200"}`} style={{ minWidth: 180 }}>
                  {PUSH_PAGES.map(p => (
                    <button key={p.path} onClick={() => handlePushToPage(p.path)}
                      className={`w-full flex items-center gap-2 px-4 py-2.5 text-sm text-left transition-colors cursor-pointer ${dk?"hover:bg-white/[0.05] text-white/70 hover:text-white":"hover:bg-gray-50 text-gray-700"}`}>
                      <p.icon size={14}/> {p.label}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Broadcast message */}
            <button onClick={() => setShowMsgModal("all")}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium border transition-all cursor-pointer ${dk?"bg-violet-500/10 hover:bg-violet-500/18 text-violet-400 border-violet-500/20":"bg-violet-50 hover:bg-violet-100 text-violet-600 border-violet-200"}`}>
              <MessageSquare size={13}/> Message All
            </button>
          </div>

          {/* Bulk free-time actions + config toggle */}
          <div className={`flex flex-wrap gap-2 items-center pt-2 border-t ${dk?"border-white/[0.05]":"border-gray-100"}`}>
            <span className={`text-xs font-semibold ${dk?"text-white/50":"text-gray-600"}`}>Free Time:</span>
            <button onClick={handleGrantAll}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-semibold border cursor-pointer transition-all ${dk?"bg-yellow-500/10 hover:bg-yellow-500/20 text-yellow-400 border-yellow-500/25":"bg-yellow-50 hover:bg-yellow-100 text-yellow-600 border-yellow-200"}`}>
              🎁 Grant All
            </button>
            <button onClick={handleRevokeAll}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-semibold border cursor-pointer transition-all ${dk?"bg-red-500/10 hover:bg-red-500/20 text-red-400 border-red-500/25":"bg-red-50 hover:bg-red-100 text-red-600 border-red-200"}`}>
              ⛔ Revoke All
            </button>
            <button onClick={() => setShowConfigPanel(v => !v)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-semibold border cursor-pointer transition-all ${showConfigPanel ? (dk?"bg-blue-500/20 text-blue-300 border-blue-500/40":"bg-blue-100 text-blue-700 border-blue-300") : (dk?"bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 border-blue-500/25":"bg-blue-50 hover:bg-blue-100 text-blue-600 border-blue-200")}`}>
              ⚙️ Free Time Settings
            </button>
            {period !== "None" && (
              <span className={`ml-auto text-[10px] font-semibold px-2 py-1 rounded-full ${dk?"bg-white/[0.04] text-white/45":"bg-gray-100 text-gray-600"}`}>
                Scope: {period}
              </span>
            )}
          </div>

          {/* Free-time config panel */}
          {showConfigPanel && (
            <div className={`mt-3 p-4 rounded-xl space-y-3 animate-slide-in ${dk ? "bg-white/[0.03] border border-white/[0.06]" : "bg-gray-50 border border-gray-200"}`}>
              <div className={`text-xs font-bold uppercase tracking-wider ${dk?"text-white/40":"text-gray-500"}`}>
                Free Time includes:
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {[
                  { key: "arcadeEnabled",    label: "🎮 Arcade" },
                  { key: "projectsEnabled",  label: "💻 Projects" },
                  { key: "unityEnabled",     label: "🎮 Unity 3D" },
                  { key: "blockforgeEnabled",label: "🔮 BlockForge" },
                  { key: "youtubeEnabled",   label: "📺 YouTube" },
                ].map(f => (
                  <label key={f.key} className={`flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer text-xs font-semibold ${freeTimeConfig[f.key] ? (dk?"bg-emerald-500/10 text-emerald-400":"bg-emerald-50 text-emerald-700") : (dk?"bg-white/[0.03] text-white/40":"bg-white text-gray-400")}`}>
                    <input type="checkbox" checked={!!freeTimeConfig[f.key]}
                      onChange={e => setFreeTimeConfig((cfg: any) => ({ ...cfg, [f.key]: e.target.checked }))} />
                    {f.label}
                  </label>
                ))}
                <div className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold ${dk?"bg-white/[0.03] text-white/50":"bg-white text-gray-500"}`}>
                  <span>Daily cap (min):</span>
                  <input type="number" value={freeTimeConfig.dailyCapMinutes || 0} min={0} max={240}
                    onChange={e => setFreeTimeConfig((cfg: any) => ({ ...cfg, dailyCapMinutes: parseInt(e.target.value) || 0 }))}
                    className="input text-xs w-16 py-1" />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={saveConfig} className="btn-primary gap-1.5 px-4 text-xs">
                  Save & Apply
                </button>
                <span className={`text-[10px] ${dk?"text-white/25":"text-gray-400"}`}>
                  Applies to all students in {selectedClass?.name} on next poll
                </span>
              </div>
            </div>
          )}

          {/* Row 2: Announce */}
          <div className="flex gap-2">
            <input
              ref={announceRef}
              value={announcement}
              onChange={e => setAnnouncement(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleAnnounce()}
              placeholder="Type announcement to broadcast (WebSocket)…"
              className="input text-sm flex-1"
            />
            <button onClick={handleAnnounce} disabled={!announcement.trim()}
              className={`btn-primary gap-2 px-4 transition-all ${announceSent?"bg-emerald-500 border-emerald-500":""}`}>
              {announceSent ? "Sent!" : <><Megaphone size={14}/> Announce</>}
            </button>
          </div>

          {/* Row 3: Video sharing */}
          <div className={`flex flex-wrap gap-2 items-center pt-2 border-t ${dk?"border-white/[0.05]":"border-gray-100"}`}>
            <Youtube size={15} className="text-red-400 flex-shrink-0" />
            <span className={`text-xs font-semibold ${dk?"text-white/50":"text-gray-600"}`}>Share Video to Class</span>
            {activeVideo ? (
              <>
                <div style={{ display:"flex",alignItems:"center",gap:8,background:"rgba(239,68,68,0.1)",border:"1px solid rgba(239,68,68,0.3)",borderRadius:8,padding:"4px 12px" }}>
                  <span style={{ width:8,height:8,borderRadius:"50%",background:"#ef4444",display:"inline-block",animation:"pulse 1.5s infinite" }} />
                  <span style={{ color:"#f87171",fontSize:12,fontWeight:600 }}>Video Live</span>
                  <img src={`https://img.youtube.com/vi/${activeVideo}/default.jpg`} style={{ width:32,height:24,objectFit:"cover",borderRadius:4 }} alt="thumb" />
                </div>
                <button onClick={handleStopVideo} className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium border cursor-pointer" style={{ background:"rgba(239,68,68,0.12)",color:"#f87171",border:"1px solid rgba(239,68,68,0.3)" }}>
                  <Square size={12}/> Stop Video
                </button>
              </>
            ) : showVideoInput ? (
              <>
                <input value={videoUrl} onChange={e => setVideoUrl(e.target.value)} onKeyDown={e => e.key === "Enter" && handleShareVideo()} placeholder="YouTube URL or video ID…" className="input text-sm flex-1" autoFocus />
                <input value={videoTitle} onChange={e => setVideoTitle(e.target.value)} placeholder="Title (optional)" className="input text-sm w-40" />
                <button onClick={handleShareVideo} className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium cursor-pointer" style={{ background:"rgba(239,68,68,0.15)",color:"#f87171",border:"1px solid rgba(239,68,68,0.3)" }}>
                  <Play size={12}/> Share
                </button>
                <button onClick={() => { setShowVideoInput(false); setVideoUrl(""); setVideoTitle(""); }} className={`p-2 rounded-lg cursor-pointer ${dk?"text-white/30 hover:text-white/60":"text-gray-400 hover:text-gray-700"}`}><X size={14}/></button>
              </>
            ) : (
              <button onClick={() => setShowVideoInput(true)} className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium border cursor-pointer" style={{ background:"rgba(239,68,68,0.1)",color:"#f87171",border:"1px solid rgba(239,68,68,0.25)" }}>
                <Youtube size={13}/> Share YouTube Video
              </button>
            )}
          </div>
        </div>
      )}

      {/* Student tile grid */}
      {loading ? (
        <div className={`text-center py-16 text-sm ${dk?"text-white/20":"text-gray-400"}`}>Loading students…</div>
      ) : students.length === 0 ? (
        <div className={`card text-center py-16 ${dk?"text-white/20":"text-gray-400"}`}>
          <Users size={36} className="mx-auto mb-3 opacity-30" />
          <p className="text-sm">
            {selectedClass
              ? <>No students yet. Share code <strong className={`font-mono ${dk?"text-violet-400":"text-violet-600"}`}>{selectedClass?.code}</strong></>
              : "Select a class to begin."}
          </p>
          <p className={`text-xs mt-2 ${dk?"text-white/20":"text-gray-400"}`}>
            Students are quiet right now. Check back when class starts! 🎒
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {students.map((s, i) => {
            const pr = presence[s.id] ?? { isOnline:false, lastActive:0, lastAction:"No activity yet" };
            const snap = snapshots[s.id];
            return (
              <StudentTile
                key={s.id}
                student={s}
                presence={pr}
                snapshot={snap}
                dk={dk}
                tick={tick}
                animDelay={i * 40}
                onWatchUnity={(room, name) => { setWatchingRoom(room); setWatchingName(name); }}
                onMessage={() => setShowMsgModal(s.id)}
                onKick={() => handleKick(s.id)}
                onZoom={snap?.data ? () => setZoomedSnapshot({ name: s.name, data: snap.data, path: snap.path }) : undefined}
                onOpenDrawer={() => setDrawerStudent(s)}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ── StudentTile ──────────────────────────────────────────── */

interface TileProps {
  student: any;
  presence: any;
  snapshot?: { data: string; path: string; capturedAt: string };
  dk: boolean;
  tick: number;
  animDelay: number;
  onWatchUnity: (room: string, name: string) => void;
  onMessage: () => void;
  onKick: () => void;
  onZoom?: () => void;
  onOpenDrawer?: () => void;
}

function StudentTile({ student, presence, snapshot, dk, tick, animDelay, onWatchUnity, onMessage, onKick, onZoom, onOpenDrawer }: TileProps) {
  const gradient = avatarGradient(student.name || "?");
  const initials = (student.name || "?").split(" ").map((w: string) => w[0]).join("").toUpperCase().slice(0, 2);
  const { emoji, label, color } = activityPreview(presence.lastAction || "");
  const hasSnap = !!snapshot?.data;
  const snapAgeSec = snapshot?.capturedAt ? Math.floor((Date.now() - new Date(snapshot.capturedAt).getTime()) / 1000) : null;

  return (
    <div
      onClick={onOpenDrawer}
      className={`rounded-2xl border transition-all duration-200 overflow-hidden animate-slide-in group cursor-pointer hover:-translate-y-0.5 hover:shadow-xl ${
        presence.isOnline
          ? dk ? "border-emerald-500/25 shadow-lg shadow-emerald-500/5" : "border-emerald-300/60 shadow-md shadow-emerald-100"
          : dk ? "border-white/[0.06]" : "border-gray-200"
      }`}
      style={{ background: "var(--bg-surface)", animationDelay: `${animDelay}ms` }}
    >
      {/* Online accent stripe */}
      {presence.isOnline && <div className="h-0.5 bg-gradient-to-r from-emerald-500/60 via-emerald-400 to-emerald-500/60" />}

      {/* Screenshot preview pane — click to zoom (no stopPropagation so tile opens drawer) */}
      <div
        style={{
          position: "relative",
          height: 140,
          display: "flex", alignItems: "center", justifyContent: "center",
          flexDirection: "column", gap: 4,
          background: hasSnap ? "#07071a" : presence.isOnline ? `${color}12` : dk ? "rgba(255,255,255,0.02)" : "rgba(0,0,0,0.02)",
          borderBottom: dk ? "1px solid rgba(255,255,255,0.04)" : "1px solid rgba(0,0,0,0.05)",
          overflow: "hidden",
        }}>
        {hasSnap ? (
          <>
            <img src={snapshot!.data} alt={`${student.name}'s screen`}
              style={{ width:"100%", height:"100%", objectFit:"cover", display:"block",
                filter: presence.isOnline ? "none" : "grayscale(60%) brightness(0.5)",
                transition: "filter 0.25s" }} />
            {/* Activity badge overlay */}
            <div style={{ position:"absolute", bottom: 4, left: 4, right: 4,
              display:"flex", alignItems:"center", gap:4,
              background:"rgba(0,0,0,0.6)", backdropFilter:"blur(4px)",
              padding:"2px 6px", borderRadius: 6,
              fontSize: 9, fontWeight: 700, color:"white", letterSpacing:"0.03em" }}>
              <span>{emoji}</span>
              <span style={{ overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{label}</span>
              {snapAgeSec !== null && (
                <span style={{ marginLeft:"auto", color:"rgba(255,255,255,0.6)", fontSize:9 }}>{snapAgeSec}s</span>
              )}
            </div>
            {!presence.isOnline && (
              <div style={{ position:"absolute", top: 6, right: 6, background:"rgba(239,68,68,0.75)", color:"white", fontSize:9, fontWeight:700, padding:"1px 6px", borderRadius:4, letterSpacing:"0.05em" }}>AWAY</div>
            )}
          </>
        ) : presence.isOnline ? (
          <>
            <span style={{ fontSize: 28 }}>{emoji}</span>
            <span style={{ fontSize: 10, fontWeight: 700, color, letterSpacing: "0.05em", textTransform: "uppercase" }}>{label}</span>
            <span style={{ fontSize: 9, opacity: 0.5, marginTop: 2 }}>Preview loading…</span>
          </>
        ) : (
          <span style={{ fontSize: 24, opacity: 0.2 }}>💤</span>
        )}
      </div>

      <div className="p-3">
        {/* Avatar + status */}
        <div className="flex items-start justify-between mb-2">
          <div className="relative">
            <div className={`w-9 h-9 rounded-xl bg-gradient-to-br ${gradient} flex items-center justify-center text-white text-xs font-bold shadow-md`}>
              {initials}
            </div>
            <span className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 ${dk?"border-[#0f1029]":"border-white"} ${presence.isOnline?"bg-emerald-400":dk?"bg-white/20":"bg-gray-300"}`} />
          </div>
          <span className={`flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full ${presence.isOnline ? dk?"bg-emerald-500/10 text-emerald-400":"bg-emerald-50 text-emerald-600" : dk?"bg-white/5 text-white/25":"bg-gray-100 text-gray-400"}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${presence.isOnline?"bg-emerald-400 animate-pulse":dk?"bg-white/20":"bg-gray-300"}`} />
            {presence.isOnline ? "Live" : "Away"}
          </span>
        </div>

        {/* Name + time */}
        <div className="mb-2 min-w-0">
          <div className={`font-semibold text-sm leading-tight truncate ${dk?"text-white":"text-gray-900"}`}>{student.name}</div>
          <div className={`text-[10px] mt-0.5 ${dk?"text-white/25":"text-gray-400"}`}>
            {presence.lastActive ? timeAgo(presence.lastActive) : "No activity yet"}
          </div>
        </div>

        {/* Action buttons — visible on hover */}
        <div className="flex gap-1.5 mt-2" onClick={e => e.stopPropagation()}>
          {presence.projectId ? (
            <Link to={`/project/${presence.projectId}`} className={`flex items-center justify-center gap-1 flex-1 py-1.5 rounded-lg text-[10px] font-medium border transition-colors ${dk?"bg-violet-500/10 hover:bg-violet-500/18 text-violet-400 border-violet-500/20":"bg-violet-50 hover:bg-violet-100 text-violet-600 border-violet-200"}`}>
              <ExternalLink size={9}/> View
            </Link>
          ) : (
            <div className={`flex-1 text-center text-[10px] py-1.5 ${dk?"text-white/15":"text-gray-300"}`}>No project</div>
          )}
          <button onClick={e => { e.stopPropagation(); onMessage(); }} title="Send message"
            className={`p-1.5 rounded-lg border transition-all cursor-pointer ${dk?"bg-blue-500/10 hover:bg-blue-500/18 text-blue-400 border-blue-500/20":"bg-blue-50 hover:bg-blue-100 text-blue-600 border-blue-200"}`}>
            <MessageSquare size={11}/>
          </button>
          <button onClick={e => { e.stopPropagation(); onKick(); }} title="Kick to dashboard"
            className={`p-1.5 rounded-lg border transition-all cursor-pointer ${dk?"bg-amber-500/10 hover:bg-amber-500/18 text-amber-400 border-amber-500/20":"bg-amber-50 hover:bg-amber-100 text-amber-600 border-amber-200"}`}>
            <Navigation size={11}/>
          </button>
          {presence.unityRoom && (
            <button onClick={e => { e.stopPropagation(); onWatchUnity(presence.unityRoom!, student.name); }} title="Watch Unity"
              className="p-1.5 rounded-lg border transition-all cursor-pointer" style={{ background:"rgba(34,211,238,0.1)",color:"#22d3ee",border:"1px solid rgba(34,211,238,0.25)" }}>
              <Eye size={11}/>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
