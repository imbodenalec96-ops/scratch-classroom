import React, { useEffect, useState, useCallback, useRef } from "react";
import { useTheme } from "../lib/theme.tsx";
import { api } from "../lib/api.ts";
import { getSocket } from "../lib/ws.ts";
import { Link } from "react-router-dom";
import {
  Users, Wifi, WifiOff, Lock, LockOpen, Megaphone,
  ChevronLeft, Monitor, Activity, Box, ExternalLink,
  Youtube, X, Play, Square, Eye,
} from "lucide-react";

/* ── helpers ──────────────────────────────────────────────── */

interface StudentPresence {
  isOnline: boolean;
  lastActive: number;
  lastAction: string;
  projectId?: string;
  projectName?: string;
  blockCount?: number;
  unityRoom?: string;   // multiplayer room code when in Unity stage
}

function timeAgo(ts: number): string {
  if (!ts) return "No activity yet";
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 5)    return "just now";
  if (s < 60)   return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
}

function avatarGradient(name: string): string {
  const palettes = [
    "from-violet-500 to-indigo-600","from-cyan-500 to-blue-600",
    "from-emerald-500 to-teal-600","from-amber-500 to-orange-600",
    "from-pink-500 to-rose-600","from-sky-500 to-cyan-600",
    "from-fuchsia-500 to-purple-600","from-lime-500 to-green-600",
  ];
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xffff;
  return palettes[h % palettes.length];
}

function extractYouTubeId(url: string): string | null {
  if (!url) return null;
  if (/^[A-Za-z0-9_-]{11}$/.test(url.trim())) return url.trim();
  const m = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([A-Za-z0-9_-]{11})/);
  return m ? m[1] : null;
}

/* ── main component ────────────────────────────────────────── */

export default function MonitorPage() {
  const { theme } = useTheme();
  const dk = theme === "dark";

  const [classes, setClasses]               = useState<any[]>([]);
  const [selectedClass, setSelectedClass]   = useState<any>(null);
  const [students, setStudents]             = useState<any[]>([]);
  const [presence, setPresence]             = useState<Record<string, StudentPresence>>({});
  const [announcement, setAnnouncement]     = useState("");
  const [announceSent, setAnnounceSent]     = useState(false);
  const [wsConnected, setWsConnected]       = useState(false);
  const [loading, setLoading]               = useState(true);
  const [tick, setTick]                     = useState(0);
  const announceRef                         = useRef<HTMLInputElement>(null);

  // Video sharing
  const [videoUrl, setVideoUrl]             = useState("");
  const [videoTitle, setVideoTitle]         = useState("");
  const [activeVideo, setActiveVideo]       = useState<string | null>(null); // videoId when live
  const [showVideoInput, setShowVideoInput] = useState(false);

  // Unity live view
  const [watchingRoom, setWatchingRoom]     = useState<string | null>(null); // room code being watched
  const [watchingName, setWatchingName]     = useState("");

  // Refresh time-ago every 15 s
  useEffect(() => {
    const iv = setInterval(() => setTick((t) => t + 1), 15000);
    return () => clearInterval(iv);
  }, []);

  // Load classes on mount
  useEffect(() => {
    api.getClasses()
      .then((c) => {
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
      const init: Record<string, StudentPresence> = {};
      for (const s of studs) {
        init[s.id] = { isOnline: false, lastActive: 0, lastAction: "No activity yet" };
      }
      setPresence(init);
    } catch {
      setStudents([]); setPresence({});
    } finally {
      setLoading(false);
    }
  }, []);

  const handleClassChange = (classId: string) => {
    const cls = classes.find((c) => c.id === classId);
    if (!cls) return;
    setSelectedClass(cls); loadClass(cls);
  };

  // WebSocket live presence
  useEffect(() => {
    const socket = getSocket();
    setWsConnected(socket.connected);
    const onConnect    = () => setWsConnected(true);
    const onDisconnect = () => setWsConnected(false);
    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);

    const mark = (data: any, action: string) => {
      setStudents((prev) => {
        const matched = prev.find(
          (s) => (data.userId && s.id === data.userId) || (data.userName && s.name === data.userName)
        );
        if (!matched) return prev;
        setPresence((p) => ({
          ...p,
          [matched.id]: {
            ...p[matched.id],
            isOnline: true, lastActive: Date.now(), lastAction: action,
            ...(data.projectId   ? { projectId:   data.projectId   } : {}),
            ...(data.projectName ? { projectName: data.projectName } : {}),
            ...(Array.isArray(data.blocks) ? { blockCount: data.blocks.length } : {}),
          },
        }));
        return prev;
      });
    };

    // Track students joining Unity rooms
    const onUnityJoin = (data: any) => {
      setStudents((prev) => {
        const matched = prev.find(
          (s) => (data.userId && s.id === data.userId) || (data.userName && s.name === data.userName)
        );
        if (!matched) return prev;
        setPresence((p) => ({
          ...p,
          [matched.id]: {
            ...p[matched.id],
            isOnline: true, lastActive: Date.now(),
            lastAction: "in Unity 3D stage",
            unityRoom: data.room,
          },
        }));
        return prev;
      });
    };

    socket.on("project:update", (d) => mark(d, d.action || "updated project"));
    socket.on("chat:message",   (d) => mark(d, "sent a message"));
    socket.on("unity:join",     onUnityJoin);

    return () => {
      socket.off("connect", onConnect); socket.off("disconnect", onDisconnect);
      socket.off("project:update"); socket.off("chat:message"); socket.off("unity:join", onUnityJoin);
    };
  }, []);

  // Mark students offline after 3 min of inactivity
  useEffect(() => {
    const iv = setInterval(() => {
      const now = Date.now();
      setPresence((prev) => {
        let changed = false;
        const next = { ...prev };
        for (const [id, p] of Object.entries(prev)) {
          if (p.isOnline && p.lastActive && now - p.lastActive > 180_000) {
            next[id] = { ...p, isOnline: false }; changed = true;
          }
        }
        return changed ? next : prev;
      });
    }, 30_000);
    return () => clearInterval(iv);
  }, []);

  const handleAnnounce = useCallback(() => {
    if (!announcement.trim() || !selectedClass) return;
    getSocket().emit("class:broadcast", { classId: selectedClass.id, message: announcement.trim() });
    setAnnouncement(""); setAnnounceSent(true);
    setTimeout(() => setAnnounceSent(false), 2000);
    announceRef.current?.blur();
  }, [announcement, selectedClass]);

  const handleLockAll = useCallback(async (locked: boolean) => {
    if (!selectedClass) return;
    getSocket().emit("class:lock", { classId: selectedClass.id, locked });
    for (const s of students) {
      api.updateControls(selectedClass.id, s.id, { screen_locked: locked }).catch(() => {});
    }
  }, [selectedClass, students]);

  // ── Video sharing ──────────────────────────────────────────
  const handleShareVideo = () => {
    if (!selectedClass) return;
    const id = extractYouTubeId(videoUrl);
    if (!id) { alert("Couldn't find a YouTube video ID. Paste a YouTube link or video ID."); return; }
    getSocket().emit("class:video", {
      classId: selectedClass.id,
      videoId: id,
      url: videoUrl,
      title: videoTitle || "Class Video",
    });
    setActiveVideo(id);
    setShowVideoInput(false);
    setVideoUrl(""); setVideoTitle("");
  };

  const handleStopVideo = () => {
    if (!selectedClass) return;
    getSocket().emit("class:video:stop", { classId: selectedClass.id });
    setActiveVideo(null);
  };

  const onlineCount  = Object.values(presence).filter((p) => p.isOnline).length;
  const offlineCount = students.length - onlineCount;

  return (
    <div className="p-7 space-y-5 animate-page-enter">

      {/* Unity Live View Modal */}
      {watchingRoom && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 200,
          background: "rgba(0,0,0,0.85)", backdropFilter: "blur(8px)",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <div style={{
            width: "min(960px, 96vw)", borderRadius: 16, overflow: "hidden",
            border: "1px solid rgba(34,211,238,0.3)",
            boxShadow: "0 0 80px rgba(34,211,238,0.15)",
            display: "flex", flexDirection: "column",
            background: "#07071a",
          }}>
            {/* Modal header */}
            <div style={{
              display: "flex", alignItems: "center", gap: 10,
              padding: "10px 16px",
              background: "rgba(34,211,238,0.07)",
              borderBottom: "1px solid rgba(34,211,238,0.15)",
            }}>
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#22d3ee", boxShadow: "0 0 8px #22d3ee" }} />
              <span style={{ color: "#22d3ee", fontWeight: 700, fontSize: 13 }}>
                👁 Watching {watchingName}'s Unity Stage — Room: {watchingRoom}
              </span>
              <button
                onClick={() => { setWatchingRoom(null); setWatchingName(""); }}
                style={{
                  marginLeft: "auto", background: "rgba(255,255,255,0.07)",
                  border: "1px solid rgba(255,255,255,0.12)",
                  color: "rgba(255,255,255,0.6)", borderRadius: 8,
                  padding: "4px 12px", cursor: "pointer", fontSize: 12, fontWeight: 600,
                }}
              >
                ✕ Close
              </button>
            </div>
            {/* Unity iframe */}
            <iframe
              src={`/unity-games/blockforge-stage/index.html?room=${encodeURIComponent(watchingRoom)}&spectator=1`}
              style={{ width: "100%", height: 540, border: "none" }}
              allow="autoplay; fullscreen; pointer-lock"
              title="Unity Live View"
            />
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className={`text-2xl font-bold tracking-tight flex items-center gap-2 ${dk ? "text-white" : "text-gray-900"}`}>
            <Monitor size={22} className="text-pink-400" />
            Student Monitor
          </h1>
          <p className={`text-sm mt-0.5 ${dk ? "text-white/40" : "text-gray-500"}`}>
            {loading ? "Loading…" : `${onlineCount} online · ${offlineCount} offline · ${students.length} total`}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* WS status */}
          <div className={`flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-full ${
            wsConnected
              ? dk ? "bg-emerald-500/10 text-emerald-400" : "bg-emerald-50 text-emerald-600"
              : dk ? "bg-white/5 text-white/25"           : "bg-gray-100 text-gray-400"
          }`}>
            {wsConnected
              ? <><span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" /><Wifi size={11} /> Live</>
              : <><span className="w-1.5 h-1.5 rounded-full bg-gray-400" /><WifiOff size={11} /> Offline</>
            }
          </div>
          {/* Class selector */}
          {classes.length > 1 && (
            <select value={selectedClass?.id ?? ""} onChange={(e) => handleClassChange(e.target.value)} className="input py-2 text-sm w-44">
              {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          )}
          <Link to="/teacher" className={`flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-xl border transition-colors ${
            dk ? "border-white/[0.07] text-white/50 hover:text-white hover:bg-white/[0.04]"
               : "border-gray-200 text-gray-500 hover:text-gray-800 hover:bg-gray-50"
          }`}>
            <ChevronLeft size={13} /> Dashboard
          </Link>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label:"Online",     value:onlineCount,     color:"text-emerald-400", bg:dk?"bg-emerald-500/10":"bg-emerald-50",  border:dk?"border-emerald-500/20":"border-emerald-200",  icon:<Wifi size={15}/> },
          { label:"Offline",    value:offlineCount,    color:"text-red-400",     bg:dk?"bg-red-500/10":"bg-red-50",          border:dk?"border-red-500/20":"border-red-200",          icon:<WifiOff size={15}/> },
          { label:"Students",   value:students.length, color:"text-violet-400",  bg:dk?"bg-violet-500/10":"bg-violet-50",    border:dk?"border-violet-500/20":"border-violet-200",    icon:<Users size={15}/> },
          { label:"Active Now", value:onlineCount,     color:"text-blue-400",    bg:dk?"bg-blue-500/10":"bg-blue-50",        border:dk?"border-blue-500/20":"border-blue-200",        icon:<Activity size={15}/> },
        ].map((stat) => (
          <div key={stat.label} className={`rounded-xl px-4 py-3 border flex items-center gap-3 ${stat.bg} ${stat.border}`}>
            <div className={stat.color}>{stat.icon}</div>
            <div>
              <div className={`text-xs ${dk?"text-white/40":"text-gray-500"}`}>{stat.label}</div>
              <div className={`text-2xl font-bold leading-tight ${dk?"text-white":"text-gray-900"}`}>{stat.value}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Controls */}
      {selectedClass && (
        <div className="card space-y-3">
          <h3 className={`text-sm font-semibold flex items-center gap-2 ${dk?"text-white/70":"text-gray-700"}`}>
            Classroom Controls
            <span className={`text-xs font-normal ${dk?"text-white/25":"text-gray-400"}`}>— {selectedClass.name}</span>
          </h3>

          {/* Row 1: announce + lock */}
          <div className="flex flex-wrap gap-2">
            <div className="flex gap-2 flex-1 min-w-0">
              <input
                ref={announceRef}
                value={announcement}
                onChange={(e) => setAnnouncement(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAnnounce()}
                placeholder="Type announcement to broadcast…"
                className="input text-sm flex-1"
              />
              <button onClick={handleAnnounce} disabled={!announcement.trim()}
                className={`btn-primary gap-2 px-4 transition-all ${announceSent?"bg-emerald-500 border-emerald-500":""}`}>
                {announceSent ? "Sent!" : <><Megaphone size={14}/> Announce</>}
              </button>
            </div>
            <button onClick={() => handleLockAll(true)}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium border transition-colors cursor-pointer ${
                dk?"bg-red-500/10 hover:bg-red-500/15 text-red-400 border-red-500/20"
                  :"bg-red-50 hover:bg-red-100 text-red-600 border-red-200"}`}>
              <Lock size={13}/> Lock All
            </button>
            <button onClick={() => handleLockAll(false)}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium border transition-colors cursor-pointer ${
                dk?"bg-emerald-500/10 hover:bg-emerald-500/15 text-emerald-400 border-emerald-500/20"
                  :"bg-emerald-50 hover:bg-emerald-100 text-emerald-600 border-emerald-200"}`}>
              <LockOpen size={13}/> Unlock All
            </button>
          </div>

          {/* Row 2: Video sharing */}
          <div className={`flex flex-wrap gap-2 items-center pt-2 border-t ${dk?"border-white/[0.05]":"border-gray-100"}`}>
            <Youtube size={15} className="text-red-400 flex-shrink-0" />
            <span className={`text-xs font-semibold ${dk?"text-white/50":"text-gray-600"}`}>Share Video to Class</span>

            {activeVideo ? (
              <>
                <div className="flex-1 flex items-center gap-2 min-w-0">
                  <div style={{
                    display:"flex",alignItems:"center",gap:8,
                    background:"rgba(239,68,68,0.1)",border:"1px solid rgba(239,68,68,0.3)",
                    borderRadius:8,padding:"4px 12px",
                  }}>
                    <span style={{width:8,height:8,borderRadius:"50%",background:"#ef4444",display:"inline-block",animation:"pulse 1.5s infinite"}} />
                    <span style={{color:"#f87171",fontSize:12,fontWeight:600}}>Video Live</span>
                    <img
                      src={`https://img.youtube.com/vi/${activeVideo}/default.jpg`}
                      style={{width:32,height:24,objectFit:"cover",borderRadius:4}}
                      alt="thumb"
                    />
                  </div>
                </div>
                <button onClick={handleStopVideo}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium border cursor-pointer transition-colors"
                  style={{background:"rgba(239,68,68,0.12)",color:"#f87171",border:"1px solid rgba(239,68,68,0.3)"}}>
                  <Square size={12}/> Stop Video
                </button>
              </>
            ) : showVideoInput ? (
              <>
                <input
                  value={videoUrl}
                  onChange={(e) => setVideoUrl(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleShareVideo()}
                  placeholder="YouTube URL or video ID…"
                  className="input text-sm flex-1"
                  autoFocus
                />
                <input
                  value={videoTitle}
                  onChange={(e) => setVideoTitle(e.target.value)}
                  placeholder="Title (optional)"
                  className="input text-sm w-40"
                />
                <button onClick={handleShareVideo}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium cursor-pointer"
                  style={{background:"rgba(239,68,68,0.15)",color:"#f87171",border:"1px solid rgba(239,68,68,0.3)"}}>
                  <Play size={12}/> Share
                </button>
                <button onClick={() => { setShowVideoInput(false); setVideoUrl(""); setVideoTitle(""); }}
                  className={`p-2 rounded-lg cursor-pointer ${dk?"text-white/30 hover:text-white/60":"text-gray-400 hover:text-gray-700"}`}>
                  <X size={14}/>
                </button>
              </>
            ) : (
              <button onClick={() => setShowVideoInput(true)}
                className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium border cursor-pointer transition-colors"
                style={{background:"rgba(239,68,68,0.1)",color:"#f87171",border:"1px solid rgba(239,68,68,0.25)"}}>
                <Youtube size={13}/> Share YouTube Video
              </button>
            )}
          </div>
        </div>
      )}

      {/* Student grid */}
      {loading ? (
        <div className={`text-center py-16 text-sm ${dk?"text-white/20":"text-gray-400"}`}>Loading students…</div>
      ) : students.length === 0 ? (
        <div className={`card text-center py-16 ${dk?"text-white/20":"text-gray-400"}`}>
          <Users size={36} className="mx-auto mb-3 opacity-30" />
          <p className="text-sm">
            {selectedClass
              ? <>No students in {selectedClass.name} yet. Share code <strong className={`font-mono ${dk?"text-violet-400":"text-violet-600"}`}>{selectedClass.code}</strong></>
              : "Select a class to begin."}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {students.map((s) => {
            const pr = presence[s.id] ?? { isOnline:false, lastActive:0, lastAction:"No activity yet" };
            return (
              <StudentCard
                key={s.id}
                student={s}
                presence={pr}
                dk={dk}
                tick={tick}
                onWatchUnity={(room, name) => { setWatchingRoom(room); setWatchingName(name); }}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ── StudentCard ──────────────────────────────────────────── */

interface StudentCardProps {
  student: any;
  presence: StudentPresence;
  dk: boolean;
  tick: number;
  onWatchUnity: (room: string, name: string) => void;
}

function StudentCard({ student, presence, dk, onWatchUnity }: StudentCardProps) {
  const gradient = avatarGradient(student.name || "?");
  const initials = (student.name || "?").split(" ").map((w: string) => w[0]).join("").toUpperCase().slice(0, 2);

  return (
    <div className={`rounded-2xl border transition-all duration-200 overflow-hidden ${
      presence.isOnline
        ? dk ? "border-emerald-500/25 shadow-lg shadow-emerald-500/5" : "border-emerald-300/60 shadow-md shadow-emerald-100"
        : dk ? "border-white/[0.06]" : "border-gray-200"
    }`} style={{ background: "var(--bg-surface)" }}>
      {presence.isOnline && <div className="h-0.5 bg-gradient-to-r from-emerald-500/60 via-emerald-400/80 to-emerald-500/60" />}

      <div className="p-4">
        {/* Avatar + status */}
        <div className="flex items-start justify-between mb-3">
          <div className="relative">
            <div className={`w-11 h-11 rounded-xl bg-gradient-to-br ${gradient} flex items-center justify-center text-white text-sm font-bold shadow-md`}>
              {initials}
            </div>
            <span className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 ${dk?"border-[#0f1029]":"border-white"} ${presence.isOnline?"bg-emerald-400":dk?"bg-white/20":"bg-gray-300"}`} />
          </div>
          <span className={`flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full ${
            presence.isOnline
              ? dk?"bg-emerald-500/10 text-emerald-400":"bg-emerald-50 text-emerald-600"
              : dk?"bg-white/5 text-white/25":"bg-gray-100 text-gray-400"
          }`}>
            <span className={`w-1.5 h-1.5 rounded-full ${presence.isOnline?"bg-emerald-400 animate-pulse":dk?"bg-white/20":"bg-gray-300"}`} />
            {presence.isOnline ? "Online" : "Offline"}
          </span>
        </div>

        {/* Name */}
        <div className="mb-2 min-w-0">
          <div className={`font-semibold text-sm leading-tight truncate ${dk?"text-white":"text-gray-900"}`}>{student.name}</div>
          <div className={`text-[11px] truncate mt-0.5 ${dk?"text-white/30":"text-gray-400"}`}>{student.email}</div>
        </div>

        {/* Last activity */}
        <div className={`text-[11px] leading-snug mb-3 ${dk?"text-white/35":"text-gray-500"}`}>
          {presence.lastActive ? (
            <><span className={`font-medium ${dk?"text-white/55":"text-gray-600"}`}>{timeAgo(presence.lastActive)}</span>{" — "}<span className="truncate">{presence.lastAction}</span></>
          ) : (
            <span className={dk?"text-white/20":"text-gray-400"}>No activity yet</span>
          )}
        </div>

        {/* Project info */}
        {presence.projectName && (
          <div className={`text-[11px] flex items-center gap-1 mb-2 truncate ${dk?"text-white/30":"text-gray-400"}`}>
            <Box size={10} className="flex-shrink-0" />
            <span className="truncate">{presence.projectName}</span>
            {typeof presence.blockCount === "number" && presence.blockCount > 0 && (
              <span className={`ml-auto flex-shrink-0 font-mono ${dk?"text-white/20":"text-gray-400"}`}>{presence.blockCount} blk</span>
            )}
          </div>
        )}

        {/* Buttons */}
        <div className="flex flex-col gap-1.5 mt-2">
          {/* View Project */}
          {presence.projectId ? (
            <Link to={`/project/${presence.projectId}`}
              className={`flex items-center justify-center gap-1.5 w-full py-1.5 rounded-xl text-xs font-medium border transition-colors ${
                dk?"bg-violet-500/10 hover:bg-violet-500/18 text-violet-400 border-violet-500/20"
                  :"bg-violet-50 hover:bg-violet-100 text-violet-600 border-violet-200"}`}>
              <ExternalLink size={11}/> View Project
            </Link>
          ) : (
            <div className={`text-center text-[11px] py-1 ${dk?"text-white/15":"text-gray-300"}`}>No project yet</div>
          )}

          {/* Watch Unity — only shown when student is in a Unity room */}
          {presence.unityRoom && (
            <button
              onClick={() => onWatchUnity(presence.unityRoom!, student.name)}
              className="flex items-center justify-center gap-1.5 w-full py-1.5 rounded-xl text-xs font-medium border transition-colors cursor-pointer"
              style={{
                background:"rgba(34,211,238,0.1)",
                color:"#22d3ee",
                border:"1px solid rgba(34,211,238,0.25)",
              }}>
              <Eye size={11}/> Watch Unity Live
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
