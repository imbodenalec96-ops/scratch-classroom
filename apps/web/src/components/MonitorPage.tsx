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
  Settings2, Gift, XCircle, Clock, Zap, Radio,
  ChevronDown, ChevronRight, BarChart2,
} from "lucide-react";
import StudentDrawer from "./StudentDrawer.tsx";

/* ── keyframe styles injected once ───────────────────────────── */

const GLOBAL_STYLES = `
@keyframes mon-pulse-ring {
  0%   { box-shadow: 0 0 0 0 var(--ring-color, rgba(139,92,246,0.5)); }
  70%  { box-shadow: 0 0 0 6px transparent; }
  100% { box-shadow: 0 0 0 0 transparent; }
}
@keyframes mon-slide-up {
  from { opacity: 0; transform: translateY(14px); }
  to   { opacity: 1; transform: translateY(0); }
}
@keyframes mon-fade-in {
  from { opacity: 0; }
  to   { opacity: 1; }
}
@keyframes mon-live-dot {
  0%, 100% { opacity: 1; }
  50%       { opacity: 0.35; }
}
@keyframes mon-card-glow {
  0%, 100% { box-shadow: 0 0 12px 0 var(--glow, rgba(139,92,246,0.25)); }
  50%       { box-shadow: 0 0 22px 2px var(--glow, rgba(139,92,246,0.45)); }
}
`;

function ensureGlobalStyles() {
  if (typeof document === "undefined") return;
  if (document.getElementById("mon-global-styles")) return;
  const s = document.createElement("style");
  s.id = "mon-global-styles";
  s.textContent = GLOBAL_STYLES;
  document.head.appendChild(s);
}

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

type StatusKey = "online" | "working" | "idle" | "offline";

function deriveStatus(pr: any): StatusKey {
  if (!pr.isOnline) return "offline";
  const a = (pr.lastAction || "").toLowerCase();
  if (a.includes("assignment") || a.includes("project") || a.includes("quiz") || a.includes("lesson"))
    return "working";
  const secsAgo = pr.lastActive ? Math.floor((Date.now() - pr.lastActive) / 1000) : 9999;
  if (secsAgo > 120) return "idle";
  return "online";
}

const STATUS_META: Record<StatusKey, {
  label: string; dot: string; ring: string; text: string; bg: string;
  gradStart: string; gradEnd: string; glow: string; emoji: string;
}> = {
  online:  {
    label: "Online",  dot: "#34d399", ring: "rgba(52,211,153,0.35)",
    text: "#34d399",  bg: "rgba(52,211,153,0.08)",
    gradStart: "rgba(52,211,153,0.18)", gradEnd: "rgba(52,211,153,0.04)",
    glow: "rgba(52,211,153,0.3)", emoji: "🟢",
  },
  working: {
    label: "Working", dot: "#8b5cf6", ring: "rgba(139,92,246,0.45)",
    text: "#a78bfa",  bg: "rgba(139,92,246,0.10)",
    gradStart: "rgba(139,92,246,0.22)", gradEnd: "rgba(139,92,246,0.04)",
    glow: "rgba(139,92,246,0.35)", emoji: "💻",
  },
  idle:    {
    label: "Idle",    dot: "#f59e0b", ring: "rgba(245,158,11,0.30)",
    text: "#fbbf24",  bg: "rgba(245,158,11,0.07)",
    gradStart: "rgba(245,158,11,0.16)", gradEnd: "rgba(245,158,11,0.03)",
    glow: "rgba(245,158,11,0.25)", emoji: "💤",
  },
  offline: {
    label: "Offline", dot: "#475569", ring: "rgba(71,85,105,0.15)",
    text: "#64748b",  bg: "transparent",
    gradStart: "rgba(71,85,105,0.10)", gradEnd: "rgba(71,85,105,0.03)",
    glow: "transparent", emoji: "⭕",
  },
};

function activityPreview(activity: string): { emoji: string; label: string; color: string } {
  const a = (activity || "").toLowerCase();
  if (a.includes("arcade") || a.includes("game"))       return { emoji: "🎮", label: "In Arcade",       color: "#8b5cf6" };
  if (a.includes("assignment") || a.includes("quiz"))   return { emoji: "📝", label: "On Assignment",   color: "#f59e0b" };
  if (a.includes("project"))                            return { emoji: "💻", label: "In Projects",     color: "#06b6d4" };
  if (a.includes("lesson"))                             return { emoji: "📖", label: "Reading Lessons", color: "#10b981" };
  if (a.includes("video"))                              return { emoji: "📺", label: "Watching Video",  color: "#ef4444" };
  if (a.includes("dashboard"))                          return { emoji: "🏠", label: "On Dashboard",   color: "#6366f1" };
  return { emoji: "🟢", label: activity || "Online",                                                    color: "#34d399" };
}

const PUSH_PAGES = [
  { label: "Dashboard",   path: "/student",     icon: LayoutDashboard },
  { label: "Lessons",     path: "/lessons",     icon: BookOpen },
  { label: "Assignments", path: "/assignments", icon: BookOpen },
  { label: "Arcade",      path: "/arcade",      icon: Gamepad2 },
];

const ARCADE_GAME_CATALOG = [
  { id: "snake",          emoji: "🐍", label: "Snake XL" },
  { id: "pong",           emoji: "🏓", label: "Pong vs AI" },
  { id: "brickbreaker",   emoji: "🧱", label: "Brick Breaker" },
  { id: "colorcatcher",   emoji: "🎨", label: "Color Catcher" },
  { id: "memory",         emoji: "🃏", label: "Memory Match" },
  { id: "mathblitz",      emoji: "🧠", label: "Math Blitz" },
  { id: "playground",     emoji: "🔮", label: "BlockForge Studio" },
  { id: "whackamole",     emoji: "🐹", label: "Whack-a-Mole" },
  { id: "flappy",         emoji: "🐦", label: "Flappy Bird" },
  { id: "space",          emoji: "🚀", label: "Space Shooter" },
  { id: "tetris",         emoji: "🟦", label: "Tetris" },
  { id: "2048",           emoji: "🔢", label: "2048" },
  { id: "tictactoe",      emoji: "❌", label: "Tic-Tac-Toe" },
  { id: "connect4",       emoji: "🔴", label: "Connect Four" },
  { id: "runner",         emoji: "🏃", label: "Endless Runner" },
  { id: "bubble",         emoji: "🫧", label: "Bubble Shooter" },
  { id: "coloringbook",   emoji: "🖍️", label: "Coloring Book" },
  { id: "dressup",        emoji: "👕", label: "Dress Up" },
  { id: "pixelart",       emoji: "🎨", label: "Pixel Art" },
  { id: "bridge",         emoji: "🌉", label: "Bridge Builder" },
  { id: "basketball",     emoji: "🏀", label: "Basketball" },
  { id: "simon",          emoji: "🟢", label: "Simon Says" },
  { id: "towerdefense",   emoji: "🌹", label: "Tower Defense" },
  { id: "racing",         emoji: "🏎️", label: "Racing" },
  { id: "minesweeper",    emoji: "💣", label: "Minesweeper" },
  { id: "wordsearch",     emoji: "🔤", label: "Word Search" },
  { id: "sudoku",         emoji: "🔢", label: "Sudoku" },
  { id: "sandbox",        emoji: "🏗️", label: "Sandbox" },
  { id: "sandbox-3d",     emoji: "🎮", label: "3D Stage" },
];

/* ── main component ────────────────────────────────────────── */

export default function MonitorPage() {
  ensureGlobalStyles();

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
  const [controlsCollapsed, setControlsCollapsed] = useState(false);

  useEffect(() => { localStorage.setItem("monitor_period", period); }, [period]);

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
  const handleEndAllBreaks = async () => {
    if (!selectedClass) return;
    if (!confirm(`End every active break in ${selectedClass.name}? Students will be kicked back to /student with a toast.`)) return;
    try { const r = await api.endAllBreaks(selectedClass.id); alert(`⏰ Break-end signal sent to ${r.studentsNotified} students`); }
    catch (e: any) { alert("Failed: " + e.message); }
  };
  const [showMsgModal, setShowMsgModal]     = useState<string | null>(null);
  const [msgText, setMsgText]               = useState("");
  const [showPushMenu, setShowPushMenu]     = useState(false);
  const announceRef                         = useRef<HTMLInputElement>(null);

  const [videoUrl, setVideoUrl]             = useState("");
  const [videoTitle, setVideoTitle]         = useState("");
  const [activeVideo, setActiveVideo]       = useState<string | null>(null);
  const [showVideoInput, setShowVideoInput] = useState(false);

  const [watchingRoom, setWatchingRoom]     = useState<string | null>(null);
  const [watchingName, setWatchingName]     = useState("");

  useEffect(() => {
    const iv = setInterval(() => setTick(t => t + 1), 10000);
    return () => clearInterval(iv);
  }, []);

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

  const handleLockAll = useCallback(async (locked: boolean) => {
    if (!selectedClass) return;
    if (locked) {
      await api.lockClass(selectedClass.id, lockMsg).catch(console.error);
    } else {
      await api.unlockClass(selectedClass.id).catch(console.error);
    }
    setIsClassLocked(locked);
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

  const handleShareVideo = () => {
    if (!selectedClass) return;
    const id = extractYouTubeId(videoUrl);
    if (!id) { alert("Couldn't find a YouTube video ID."); return; }
    getSocket().emit("class:video", { classId: selectedClass.id, videoId: id, url: videoUrl, title: videoTitle || "Class Video" });
    Promise.allSettled([
      api.shareClassVideo(selectedClass.id, id, videoTitle || "Class Video"),
      api.broadcastClassVideo(selectedClass.id, videoUrl),
    ]).catch(() => {});
    setActiveVideo(id); setShowVideoInput(false); setVideoUrl(""); setVideoTitle("");
  };

  const handleStopVideo = async () => {
    if (!selectedClass) return;
    try {
      getSocket().emit("class:video:stop", { classId: selectedClass.id });
      const [cmdRes, legacyRes] = await Promise.allSettled([
        api.endClassBroadcast(selectedClass.id),
        api.stopClassVideo(selectedClass.id),
      ]);
      if (legacyRes.status === "rejected") throw legacyRes.reason;
      void cmdRes;
      setActiveVideo(null);
    } catch (e: any) {
      console.error("stopClassVideo failed:", e);
      alert("Failed to stop video: " + (e?.message || "unknown error") + "\n\nThe broadcast may still be live — please try again or refresh.");
    }
  };

  const onlineCount  = Object.values(presence).filter(p => p.isOnline).length;
  const offlineCount = students.length - onlineCount;
  const workingCount = students.filter(s => {
    const pr = presence[s.id];
    return pr && deriveStatus(pr) === "working";
  }).length;
  const idleCount = students.filter(s => {
    const pr = presence[s.id];
    return pr && deriveStatus(pr) === "idle";
  }).length;

  const isLive = pollOk || wsConnected;

  // ── Derived theme tokens ──────────────────────────────────
  const pageBg   = "#070714";
  const surfaceBg = dk ? "rgba(255,255,255,0.035)" : "rgba(255,255,255,0.9)";
  const raisedBg  = dk ? "rgba(255,255,255,0.055)" : "white";
  const borderClr = dk ? "rgba(255,255,255,0.08)"  : "rgba(0,0,0,0.08)";
  const text1     = dk ? "#f1f5f9" : "#0f172a";
  const text2     = dk ? "#94a3b8" : "#475569";
  const text3     = dk ? "#64748b" : "#94a3b8";

  return (
    <div style={{ minHeight: "100vh", background: pageBg, color: text1, display: "flex", flexDirection: "column" }}>

      {/* ── Modals ─────────────────────────────────────────── */}

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

      {zoomedSnapshot && (
        <div
          onClick={() => setZoomedSnapshot(null)}
          style={{
            position: "fixed", inset: 0, zIndex: 300,
            background: "rgba(0,0,0,0.92)", backdropFilter: "blur(16px)",
            display: "flex", alignItems: "center", justifyContent: "center",
            padding: 24, cursor: "pointer",
            animation: "mon-fade-in 0.15s ease",
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              maxWidth: 960, width: "100%", cursor: "default", borderRadius: 20,
              overflow: "hidden", border: "1px solid rgba(139,92,246,0.35)",
              boxShadow: "0 40px 100px rgba(0,0,0,0.7), 0 0 0 1px rgba(139,92,246,0.2)",
            }}
          >
            <div style={{
              display: "flex", alignItems: "center", gap: 10, padding: "12px 18px",
              background: "rgba(139,92,246,0.15)", borderBottom: "1px solid rgba(139,92,246,0.25)",
            }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#10b981",
                boxShadow: "0 0 10px #10b981", display: "inline-block", animation: "mon-live-dot 2s infinite" }} />
              <span style={{ color: "white", fontWeight: 700, fontSize: 14 }}>{zoomedSnapshot.name}'s screen</span>
              <span style={{ color: "rgba(255,255,255,0.35)", fontSize: 11, fontFamily: "monospace" }}>{zoomedSnapshot.path}</span>
              <button
                onClick={() => setZoomedSnapshot(null)}
                style={{
                  marginLeft: "auto", background: "rgba(255,255,255,0.08)",
                  border: "1px solid rgba(255,255,255,0.12)", color: "rgba(255,255,255,0.7)",
                  borderRadius: 10, padding: "5px 14px", cursor: "pointer", fontSize: 12, fontWeight: 600,
                }}
              >
                Close
              </button>
            </div>
            <img src={zoomedSnapshot.data} alt="student screen" style={{ width: "100%", display: "block" }} />
          </div>
        </div>
      )}

      {watchingRoom && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 200,
          background: "rgba(0,0,0,0.92)", backdropFilter: "blur(16px)",
          display: "flex", alignItems: "center", justifyContent: "center",
          animation: "mon-fade-in 0.15s ease",
        }}>
          <div style={{
            width: "min(960px,96vw)", borderRadius: 20, overflow: "hidden",
            border: "1px solid rgba(34,211,238,0.3)", background: "#07071a",
            display: "flex", flexDirection: "column",
            boxShadow: "0 40px 100px rgba(0,0,0,0.7)",
          }}>
            <div style={{
              display: "flex", alignItems: "center", gap: 10, padding: "12px 18px",
              background: "rgba(34,211,238,0.08)", borderBottom: "1px solid rgba(34,211,238,0.18)",
            }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#22d3ee", boxShadow: "0 0 10px #22d3ee", display: "inline-block" }} />
              <span style={{ color: "#22d3ee", fontWeight: 700, fontSize: 13 }}>
                Watching {watchingName}'s Unity Stage — Room: {watchingRoom}
              </span>
              <button
                onClick={() => { setWatchingRoom(null); setWatchingName(""); }}
                style={{
                  marginLeft: "auto", background: "rgba(255,255,255,0.07)",
                  border: "1px solid rgba(255,255,255,0.12)", color: "rgba(255,255,255,0.6)",
                  borderRadius: 10, padding: "5px 14px", cursor: "pointer", fontSize: 12, fontWeight: 600,
                }}
              >
                Close
              </button>
            </div>
            <iframe
              src={`/unity-games/blockforge-stage/index.html?room=${encodeURIComponent(watchingRoom)}&spectator=1`}
              style={{ width: "100%", height: 540, border: "none" }}
              allow="autoplay; fullscreen; pointer-lock"
              title="Unity Live View"
            />
          </div>
        </div>
      )}

      {showMsgModal && (
        <div
          style={{ position: "fixed", inset: 0, zIndex: 300, background: "rgba(0,0,0,0.7)", backdropFilter: "blur(8px)", display: "flex", alignItems: "center", justifyContent: "center", animation: "mon-fade-in 0.15s ease" }}
          onClick={e => { if (e.target === e.currentTarget) setShowMsgModal(null); }}
        >
          <div style={{
            width: "100%", maxWidth: 420, padding: 28,
            background: raisedBg, borderRadius: 20,
            border: `1px solid ${borderClr}`,
            boxShadow: "0 32px 80px rgba(0,0,0,0.5)",
            animation: "mon-slide-up 0.2s ease",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
              <div style={{ width: 40, height: 40, borderRadius: 12, background: "rgba(99,102,241,0.15)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <MessageSquare size={18} style={{ color: "#818cf8" }} />
              </div>
              <div>
                <div style={{ fontWeight: 700, fontSize: 15, color: text1 }}>Send Message</div>
                <div style={{ fontSize: 12, color: text3, marginTop: 1 }}>
                  {showMsgModal === "all" ? "To everyone in class" : `To ${students.find(s => s.id === showMsgModal)?.name}`}
                </div>
              </div>
            </div>
            <textarea
              value={msgText}
              onChange={e => setMsgText(e.target.value)}
              placeholder="Type your message…"
              className="input w-full text-sm resize-none"
              rows={3}
              autoFocus
              onKeyDown={e => { if (e.key === "Enter" && e.metaKey) handleSendMessage(); }}
            />
            <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
              <button onClick={handleSendMessage} disabled={!msgText.trim()} className="btn-primary flex-1 gap-2">
                <Send size={13} /> Send
              </button>
              <button onClick={() => { setShowMsgModal(null); setMsgText(""); }} className="btn-secondary px-4">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Top Toolbar ─────────────────────────────────────── */}
      <div style={{
        position: "sticky", top: 0, zIndex: 50,
        background: "rgba(7,7,20,0.92)", backdropFilter: "blur(20px)",
        borderBottom: "1px solid rgba(255,255,255,0.07)",
        padding: "0 24px",
        display: "flex", alignItems: "center", gap: 12, height: 58,
      }}>
        {/* Back */}
        <Link
          to="/teacher"
          style={{
            display: "flex", alignItems: "center", gap: 5, color: text3,
            fontSize: 12, fontWeight: 600, textDecoration: "none",
            padding: "5px 10px", borderRadius: 8,
            border: "1px solid rgba(255,255,255,0.07)",
            background: "rgba(255,255,255,0.04)",
            transition: "background 0.15s",
          }}
          onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,0.08)")}
          onMouseLeave={e => (e.currentTarget.style.background = "rgba(255,255,255,0.04)")}
        >
          <ChevronLeft size={13} /> Back
        </Link>

        <div style={{ width: 1, height: 22, background: "rgba(255,255,255,0.08)" }} />

        {/* Monitor icon + title */}
        <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
          <div style={{
            width: 32, height: 32, borderRadius: 9,
            background: "linear-gradient(135deg, #7c3aed, #4f46e5)",
            display: "flex", alignItems: "center", justifyContent: "center",
            boxShadow: "0 4px 12px rgba(124,58,237,0.4)",
          }}>
            <Monitor size={15} color="white" />
          </div>
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", color: text3, textTransform: "uppercase" }}>Live Monitor</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: text1, lineHeight: 1.1 }}>
              {selectedClass?.name || "No class selected"}
            </div>
          </div>
        </div>

        {/* Class selector */}
        {classes.length > 1 && (
          <select
            value={selectedClass?.id ?? ""}
            onChange={e => handleClassChange(e.target.value)}
            className="input py-1.5 text-sm"
            style={{ width: 160 }}
          >
            {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        )}

        {/* Spacer */}
        <div style={{ flex: 1 }} />

        {/* Period */}
        <select
          value={period}
          onChange={e => setPeriod(e.target.value)}
          className="input py-1.5 text-xs"
          style={{ width: 120 }}
          title="Class period label"
        >
          <option value="None">No period</option>
          {["Period 1","Period 2","Period 3","Period 4","Period 5","Period 6","Free Time"].map(p =>
            <option key={p} value={p}>{p}</option>
          )}
        </select>

        {/* Live indicator */}
        <div style={{
          display: "flex", alignItems: "center", gap: 6, fontSize: 11, fontWeight: 700,
          padding: "5px 12px", borderRadius: 20,
          background: isLive ? "rgba(16,185,129,0.12)" : "rgba(239,68,68,0.12)",
          border: `1px solid ${isLive ? "rgba(16,185,129,0.25)" : "rgba(239,68,68,0.25)"}`,
          color: isLive ? "#34d399" : "#f87171",
          letterSpacing: "0.05em",
        }}>
          <span style={{
            width: 7, height: 7, borderRadius: "50%",
            background: isLive ? "#34d399" : "#ef4444",
            display: "inline-block",
            animation: isLive ? "mon-live-dot 1.4s ease-in-out infinite" : "none",
          }} />
          {isLive ? "LIVE" : "OFFLINE"}
        </div>

        {/* Locked badge */}
        {isClassLocked && (
          <div style={{
            display: "flex", alignItems: "center", gap: 6, fontSize: 11, fontWeight: 800,
            padding: "5px 12px", borderRadius: 20,
            background: "rgba(239,68,68,0.15)", border: "1px solid rgba(239,68,68,0.3)",
            color: "#f87171", letterSpacing: "0.06em",
            animation: "mon-live-dot 1.2s ease-in-out infinite",
          }}>
            <Lock size={10} /> LOCKED
          </div>
        )}

        {/* Force unlock */}
        <button
          onClick={async () => {
            if (!confirm("Force-unlock EVERY class?")) return;
            try { await api.forceUnlockAll(); setIsClassLocked(false); alert("✓ All classes unlocked."); }
            catch (e: any) { alert("Failed: " + (e?.message || e)); }
          }}
          title="Clear every active lock system-wide"
          style={{
            display: "flex", alignItems: "center", gap: 5, fontSize: 11, fontWeight: 600,
            padding: "5px 11px", borderRadius: 8, cursor: "pointer", border: "1px solid rgba(239,68,68,0.25)",
            background: "rgba(239,68,68,0.08)", color: "#f87171", transition: "background 0.15s",
          }}
          onMouseEnter={e => (e.currentTarget.style.background = "rgba(239,68,68,0.15)")}
          onMouseLeave={e => (e.currentTarget.style.background = "rgba(239,68,68,0.08)")}
        >
          <LockOpen size={11} /> Force Unlock
        </button>
      </div>

      {/* ── Hero Stats Bar ──────────────────────────────────── */}
      <div style={{
        padding: "20px 24px 0",
        display: "grid",
        gridTemplateColumns: "repeat(5, 1fr)",
        gap: 12,
      }}>
        {/* Total */}
        <div style={{
          borderRadius: 16, padding: "16px 18px",
          background: "rgba(255,255,255,0.04)",
          border: "1px solid rgba(255,255,255,0.07)",
          display: "flex", alignItems: "center", gap: 14,
        }}>
          <div style={{
            width: 44, height: 44, borderRadius: 12, flexShrink: 0,
            background: "rgba(99,102,241,0.15)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <Users size={20} style={{ color: "#818cf8" }} />
          </div>
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.07em", color: text3, textTransform: "uppercase" }}>Total</div>
            <div style={{ fontSize: 32, fontWeight: 800, color: text1, lineHeight: 1.1, letterSpacing: "-0.02em" }}>{students.length}</div>
          </div>
        </div>

        {/* Online / Working / Idle / Offline */}
        {([
          { key: "online"  as StatusKey, value: onlineCount,  icon: <Wifi size={20} /> },
          { key: "working" as StatusKey, value: workingCount, icon: <Activity size={20} /> },
          { key: "idle"    as StatusKey, value: idleCount,    icon: <Clock size={20} /> },
          { key: "offline" as StatusKey, value: offlineCount, icon: <WifiOff size={20} /> },
        ] as const).map(({ key, value, icon }) => {
          const m = STATUS_META[key];
          return (
            <div key={key} style={{
              borderRadius: 16, padding: "16px 18px",
              background: `linear-gradient(135deg, ${m.gradStart} 0%, ${m.gradEnd} 100%)`,
              border: `1px solid ${m.ring}`,
              display: "flex", alignItems: "center", gap: 14,
            }}>
              <div style={{
                width: 44, height: 44, borderRadius: 12, flexShrink: 0,
                background: `rgba(0,0,0,0.25)`,
                border: `1px solid ${m.ring}`,
                display: "flex", alignItems: "center", justifyContent: "center",
                color: m.dot,
              }}>
                {icon}
              </div>
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.07em", color: m.text, textTransform: "uppercase", opacity: 0.8 }}>{m.label}</div>
                <div style={{ fontSize: 32, fontWeight: 800, color: text1, lineHeight: 1.1, letterSpacing: "-0.02em" }}>{value}</div>
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Main content: grid + sidebar ───────────────────── */}
      {selectedClass && (
        <div style={{ display: "flex", flex: 1, gap: 0, padding: "16px 24px 24px", minHeight: 0 }}>

          {/* ── Student grid area ─────────────────────────── */}
          <div style={{ flex: 1, minWidth: 0, marginRight: 20 }}>

            {/* Section label */}
            {!loading && students.length > 0 && (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", color: text3, textTransform: "uppercase" }}>
                    Students
                  </span>
                  <span style={{
                    fontSize: 11, fontWeight: 700, padding: "2px 9px", borderRadius: 20,
                    background: "rgba(124,58,237,0.15)", color: "#a78bfa",
                    border: "1px solid rgba(124,58,237,0.25)",
                  }}>{students.length}</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  {([
                    { key: "online" as StatusKey, count: onlineCount },
                    { key: "working" as StatusKey, count: workingCount },
                    { key: "idle" as StatusKey, count: idleCount },
                    { key: "offline" as StatusKey, count: offlineCount },
                  ] as const).map(({ key, count }) => (
                    <span key={key} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: text3 }}>
                      <span style={{ width: 7, height: 7, borderRadius: "50%", background: STATUS_META[key].dot, display: "inline-block" }} />
                      {count} {STATUS_META[key].label.toLowerCase()}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Loading state */}
            {loading ? (
              <div style={{
                display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                padding: "80px 0", gap: 14, borderRadius: 20,
                background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.06)",
              }}>
                <div style={{ width: 36, height: 36, borderRadius: "50%", border: "2.5px solid rgba(255,255,255,0.08)", borderTop: "2.5px solid #7c3aed", animation: "spin 0.8s linear infinite" }} />
                <span style={{ fontSize: 13, color: text3 }}>Loading students…</span>
              </div>
            ) : students.length === 0 ? (
              <div style={{
                display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                padding: "80px 0", gap: 12, borderRadius: 20,
                background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.06)",
              }}>
                <Users size={40} style={{ color: text3, opacity: 0.25 }} />
                <p style={{ fontSize: 13, color: text3 }}>
                  {selectedClass
                    ? <>No students yet. Share class code <strong style={{ color: "#7c3aed", fontFamily: "monospace" }}>{selectedClass?.code}</strong></>
                    : "Select a class to begin."}
                </p>
              </div>
            ) : (
              <div style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(172px, 1fr))",
                gap: 14,
              }}>
                {students.map((s, i) => {
                  const pr = presence[s.id] ?? { isOnline: false, lastActive: 0, lastAction: "No activity yet" };
                  const snap = snapshots[s.id];
                  return (
                    <StudentTile
                      key={s.id}
                      student={s}
                      presence={pr}
                      snapshot={snap}
                      dk={dk}
                      tick={tick}
                      animDelay={i * 35}
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

          {/* ── Sidebar Controls ──────────────────────────── */}
          <div style={{
            width: 288, flexShrink: 0,
            display: "flex", flexDirection: "column", gap: 10,
          }}>

            {/* Lock / Unlock panel */}
            <div style={{
              borderRadius: 18, overflow: "hidden",
              background: "rgba(255,255,255,0.035)",
              border: "1px solid rgba(255,255,255,0.07)",
            }}>
              <div style={{
                padding: "12px 16px", borderBottom: "1px solid rgba(255,255,255,0.06)",
                display: "flex", alignItems: "center", gap: 8,
              }}>
                <Lock size={13} style={{ color: "#f87171" }} />
                <span style={{ fontSize: 12, fontWeight: 700, color: text1, letterSpacing: "0.02em" }}>Class Lock</span>
                {isClassLocked && (
                  <span style={{
                    marginLeft: "auto", fontSize: 10, fontWeight: 800, letterSpacing: "0.07em",
                    padding: "2px 8px", borderRadius: 20,
                    background: "rgba(239,68,68,0.18)", color: "#f87171",
                    border: "1px solid rgba(239,68,68,0.3)",
                  }}>LOCKED</span>
                )}
              </div>
              <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    onClick={() => handleLockAll(true)}
                    style={{
                      flex: 1, padding: "11px 0", borderRadius: 12, cursor: "pointer",
                      fontSize: 13, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", gap: 7,
                      background: isClassLocked
                        ? "rgba(239,68,68,0.3)"
                        : "rgba(239,68,68,0.14)",
                      color: "#f87171",
                      border: `1px solid ${isClassLocked ? "rgba(239,68,68,0.5)" : "rgba(239,68,68,0.25)"}`,
                      transition: "background 0.15s, border-color 0.15s",
                      boxShadow: isClassLocked ? "0 0 16px rgba(239,68,68,0.2)" : "none",
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background = "rgba(239,68,68,0.25)")}
                    onMouseLeave={e => (e.currentTarget.style.background = isClassLocked ? "rgba(239,68,68,0.3)" : "rgba(239,68,68,0.14)")}
                  >
                    <Lock size={14} /> Lock All
                  </button>
                  <button
                    onClick={() => handleLockAll(false)}
                    style={{
                      flex: 1, padding: "11px 0", borderRadius: 12, cursor: "pointer",
                      fontSize: 13, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", gap: 7,
                      background: "rgba(52,211,153,0.12)", color: "#34d399",
                      border: "1px solid rgba(52,211,153,0.25)",
                      transition: "background 0.15s",
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background = "rgba(52,211,153,0.22)")}
                    onMouseLeave={e => (e.currentTarget.style.background = "rgba(52,211,153,0.12)")}
                  >
                    <LockOpen size={14} /> Unlock
                  </button>
                </div>
                <input
                  value={lockMsg}
                  onChange={e => setLockMsg(e.target.value)}
                  placeholder="Lock screen message (optional)…"
                  className="input text-xs w-full"
                  style={{ fontSize: 12 }}
                />
              </div>
            </div>

            {/* Push to page */}
            <div style={{
              borderRadius: 18, overflow: "hidden",
              background: "rgba(255,255,255,0.035)",
              border: "1px solid rgba(255,255,255,0.07)",
            }}>
              <div style={{
                padding: "12px 16px", borderBottom: "1px solid rgba(255,255,255,0.06)",
                display: "flex", alignItems: "center", gap: 8,
              }}>
                <Navigation size={13} style={{ color: "#60a5fa" }} />
                <span style={{ fontSize: 12, fontWeight: 700, color: text1 }}>Push to Page</span>
              </div>
              <div style={{ padding: 10, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                {PUSH_PAGES.map(p => (
                  <button
                    key={p.path}
                    onClick={() => handlePushToPage(p.path)}
                    style={{
                      padding: "9px 8px", borderRadius: 10, cursor: "pointer",
                      fontSize: 11, fontWeight: 600,
                      display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                      background: "rgba(96,165,250,0.08)", color: "#60a5fa",
                      border: "1px solid rgba(96,165,250,0.18)",
                      transition: "background 0.15s",
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background = "rgba(96,165,250,0.18)")}
                    onMouseLeave={e => (e.currentTarget.style.background = "rgba(96,165,250,0.08)")}
                  >
                    <p.icon size={12} /> {p.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Broadcast */}
            <div style={{
              borderRadius: 18, overflow: "hidden",
              background: "rgba(255,255,255,0.035)",
              border: "1px solid rgba(255,255,255,0.07)",
            }}>
              <div style={{
                padding: "12px 16px", borderBottom: "1px solid rgba(255,255,255,0.06)",
                display: "flex", alignItems: "center", gap: 8,
              }}>
                <Megaphone size={13} style={{ color: "#a78bfa" }} />
                <span style={{ fontSize: 12, fontWeight: 700, color: text1 }}>Broadcast</span>
              </div>
              <div style={{ padding: 12, display: "flex", flexDirection: "column", gap: 8 }}>
                <div style={{ position: "relative" }}>
                  <Radio size={12} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: text3, pointerEvents: "none" }} />
                  <input
                    ref={announceRef}
                    value={announcement}
                    onChange={e => setAnnouncement(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && handleAnnounce()}
                    placeholder="Announcement to all…"
                    className="input text-sm w-full"
                    style={{ paddingLeft: 30, fontSize: 12 }}
                  />
                </div>
                <div style={{ display: "flex", gap: 7 }}>
                  <button
                    onClick={handleAnnounce}
                    disabled={!announcement.trim()}
                    style={{
                      flex: 1, padding: "9px 0", borderRadius: 10, cursor: "pointer",
                      fontSize: 12, fontWeight: 700,
                      display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                      background: announceSent ? "rgba(16,185,129,0.22)" : "rgba(139,92,246,0.2)",
                      color: announceSent ? "#34d399" : "#a78bfa",
                      border: `1px solid ${announceSent ? "rgba(16,185,129,0.35)" : "rgba(139,92,246,0.35)"}`,
                      transition: "background 0.2s, color 0.2s",
                      opacity: announcement.trim() ? 1 : 0.5,
                    }}
                  >
                    {announceSent ? "Sent!" : <><Megaphone size={12} /> Announce</>}
                  </button>
                  <button
                    onClick={() => setShowMsgModal("all")}
                    style={{
                      padding: "9px 12px", borderRadius: 10, cursor: "pointer",
                      fontSize: 12, fontWeight: 600,
                      display: "flex", alignItems: "center", gap: 5,
                      background: "rgba(139,92,246,0.1)", color: "#a78bfa",
                      border: "1px solid rgba(139,92,246,0.2)",
                      transition: "background 0.15s",
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background = "rgba(139,92,246,0.2)")}
                    onMouseLeave={e => (e.currentTarget.style.background = "rgba(139,92,246,0.1)")}
                  >
                    <MessageSquare size={12} />
                  </button>
                </div>
              </div>
            </div>

            {/* Free time */}
            <div style={{
              borderRadius: 18, overflow: "hidden",
              background: "rgba(255,255,255,0.035)",
              border: "1px solid rgba(255,255,255,0.07)",
            }}>
              <div style={{
                padding: "12px 16px", borderBottom: "1px solid rgba(255,255,255,0.06)",
                display: "flex", alignItems: "center", gap: 8,
              }}>
                <Gift size={13} style={{ color: "#fbbf24" }} />
                <span style={{ fontSize: 12, fontWeight: 700, color: text1 }}>Free Time</span>
              </div>
              <div style={{ padding: 12, display: "flex", flexDirection: "column", gap: 7 }}>
                <div style={{ display: "flex", gap: 7 }}>
                  <button
                    onClick={handleGrantAll}
                    style={{
                      flex: 1, padding: "9px 0", borderRadius: 10, cursor: "pointer",
                      fontSize: 11, fontWeight: 700,
                      display: "flex", alignItems: "center", justifyContent: "center", gap: 5,
                      background: "rgba(245,158,11,0.12)", color: "#fbbf24",
                      border: "1px solid rgba(245,158,11,0.25)",
                      transition: "background 0.15s",
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background = "rgba(245,158,11,0.22)")}
                    onMouseLeave={e => (e.currentTarget.style.background = "rgba(245,158,11,0.12)")}
                  >
                    <Gift size={11} /> Grant All
                  </button>
                  <button
                    onClick={handleRevokeAll}
                    style={{
                      flex: 1, padding: "9px 0", borderRadius: 10, cursor: "pointer",
                      fontSize: 11, fontWeight: 700,
                      display: "flex", alignItems: "center", justifyContent: "center", gap: 5,
                      background: "rgba(239,68,68,0.10)", color: "#f87171",
                      border: "1px solid rgba(239,68,68,0.22)",
                      transition: "background 0.15s",
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background = "rgba(239,68,68,0.2)")}
                    onMouseLeave={e => (e.currentTarget.style.background = "rgba(239,68,68,0.10)")}
                  >
                    <XCircle size={11} /> Revoke All
                  </button>
                </div>
                <button
                  onClick={handleEndAllBreaks}
                  style={{
                    width: "100%", padding: "9px 0", borderRadius: 10, cursor: "pointer",
                    fontSize: 11, fontWeight: 700,
                    display: "flex", alignItems: "center", justifyContent: "center", gap: 5,
                    background: "rgba(139,92,246,0.10)", color: "#a78bfa",
                    border: "1px solid rgba(139,92,246,0.22)",
                    transition: "background 0.15s",
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = "rgba(139,92,246,0.2)")}
                  onMouseLeave={e => (e.currentTarget.style.background = "rgba(139,92,246,0.10)")}
                >
                  <Clock size={11} /> End All Breaks
                </button>
                <button
                  onClick={() => setShowConfigPanel(v => !v)}
                  style={{
                    width: "100%", padding: "8px 0", borderRadius: 10, cursor: "pointer",
                    fontSize: 11, fontWeight: 600,
                    display: "flex", alignItems: "center", justifyContent: "center", gap: 5,
                    background: showConfigPanel ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.04)",
                    color: text3,
                    border: "1px solid rgba(255,255,255,0.08)",
                    transition: "background 0.15s",
                  }}
                >
                  <Settings2 size={11} /> {showConfigPanel ? "Hide Settings" : "Settings"}
                  {showConfigPanel ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
                </button>

                {showConfigPanel && (
                  <div style={{
                    padding: 12, borderRadius: 12,
                    background: "rgba(0,0,0,0.2)",
                    border: "1px solid rgba(255,255,255,0.06)",
                    display: "flex", flexDirection: "column", gap: 8,
                    animation: "mon-slide-up 0.15s ease",
                  }}>
                    <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", color: text3, textTransform: "uppercase" }}>
                      Free time includes:
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 5 }}>
                      {[
                        { key: "arcadeEnabled",    label: "Arcade" },
                        { key: "projectsEnabled",  label: "Projects" },
                        { key: "unityEnabled",     label: "Unity 3D" },
                        { key: "blockforgeEnabled",label: "BlockForge" },
                        { key: "youtubeEnabled",   label: "YouTube" },
                      ].map(f => (
                        <label
                          key={f.key}
                          style={{
                            display: "flex", alignItems: "center", gap: 6,
                            padding: "6px 8px", borderRadius: 8, cursor: "pointer",
                            fontSize: 11, fontWeight: 600,
                            background: freeTimeConfig[f.key] ? "rgba(52,211,153,0.10)" : "rgba(255,255,255,0.03)",
                            color: freeTimeConfig[f.key] ? "#34d399" : text3,
                            border: `1px solid ${freeTimeConfig[f.key] ? "rgba(52,211,153,0.22)" : "rgba(255,255,255,0.06)"}`,
                            transition: "all 0.15s",
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={!!freeTimeConfig[f.key]}
                            onChange={e => setFreeTimeConfig((cfg: any) => ({ ...cfg, [f.key]: e.target.checked }))}
                          />
                          {f.label}
                        </label>
                      ))}
                      <div style={{
                        display: "flex", alignItems: "center", gap: 6,
                        padding: "6px 8px", borderRadius: 8,
                        fontSize: 11, fontWeight: 600, color: text3,
                        background: "rgba(255,255,255,0.03)",
                        border: "1px solid rgba(255,255,255,0.06)",
                        gridColumn: "span 2",
                      }}>
                        <span>Daily cap (min):</span>
                        <input
                          type="number"
                          value={freeTimeConfig.dailyCapMinutes || 0}
                          min={0} max={240}
                          onChange={e => setFreeTimeConfig((cfg: any) => ({ ...cfg, dailyCapMinutes: parseInt(e.target.value) || 0 }))}
                          className="input text-xs"
                          style={{ width: 52, padding: "2px 6px", fontSize: 11 }}
                        />
                      </div>
                    </div>

                    <details style={{ borderRadius: 8, overflow: "hidden", background: "rgba(0,0,0,0.15)", border: "1px solid rgba(255,255,255,0.05)" }}>
                      <summary style={{ cursor: "pointer", fontWeight: 600, fontSize: 10, padding: "7px 10px", color: text3, letterSpacing: "0.04em" }}>
                        Arcade whitelist {freeTimeConfig.allowedGameIds?.length ? `(${freeTimeConfig.allowedGameIds.length})` : "(all)"}
                      </summary>
                      <div style={{ padding: "6px 8px 8px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 3 }}>
                        {ARCADE_GAME_CATALOG.map(g => {
                          const whitelist: string[] | undefined = freeTimeConfig.allowedGameIds;
                          const checked = !whitelist || whitelist.length === 0 || whitelist.includes(g.id);
                          return (
                            <label
                              key={g.id}
                              style={{
                                display: "flex", alignItems: "center", gap: 5,
                                padding: "4px 6px", borderRadius: 6, cursor: "pointer",
                                fontSize: 10, fontWeight: 500,
                                background: checked ? "rgba(52,211,153,0.07)" : "rgba(255,255,255,0.02)",
                                color: checked ? "#34d399" : text3,
                              }}
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={e => {
                                  setFreeTimeConfig((cfg: any) => {
                                    const cur: string[] = cfg.allowedGameIds || ARCADE_GAME_CATALOG.map(x => x.id);
                                    if (e.target.checked) return { ...cfg, allowedGameIds: [...cur.filter(x => x !== g.id), g.id] };
                                    return { ...cfg, allowedGameIds: cur.filter(x => x !== g.id) };
                                  });
                                }}
                              />
                              <span>{g.emoji}</span>
                              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{g.label}</span>
                            </label>
                          );
                        })}
                      </div>
                      <button
                        onClick={() => setFreeTimeConfig((cfg: any) => ({ ...cfg, allowedGameIds: null }))}
                        style={{ margin: "0 8px 8px", fontSize: 10, color: text3, background: "none", border: "none", cursor: "pointer" }}
                      >
                        Reset — allow all
                      </button>
                    </details>

                    <button
                      onClick={saveConfig}
                      className="btn-primary gap-1.5 text-xs"
                      style={{ width: "100%", justifyContent: "center" }}
                    >
                      Save & Apply
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Video panel */}
            <div style={{
              borderRadius: 18, overflow: "hidden",
              background: "rgba(255,255,255,0.035)",
              border: "1px solid rgba(255,255,255,0.07)",
            }}>
              <div style={{
                padding: "12px 16px", borderBottom: "1px solid rgba(255,255,255,0.06)",
                display: "flex", alignItems: "center", gap: 8,
              }}>
                <Youtube size={13} style={{ color: "#f87171" }} />
                <span style={{ fontSize: 12, fontWeight: 700, color: text1 }}>Video Share</span>
              </div>
              <div style={{ padding: 12 }}>
                {activeVideo ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    <div style={{
                      borderRadius: 10, overflow: "hidden", position: "relative",
                      border: "1px solid rgba(239,68,68,0.25)",
                    }}>
                      <img
                        src={`https://img.youtube.com/vi/${activeVideo}/mqdefault.jpg`}
                        style={{ width: "100%", display: "block", opacity: 0.85 }}
                        alt="active video"
                      />
                      <div style={{
                        position: "absolute", top: 7, left: 7,
                        display: "flex", alignItems: "center", gap: 5,
                        background: "rgba(0,0,0,0.65)", borderRadius: 6, padding: "3px 8px",
                        fontSize: 10, fontWeight: 700, color: "#f87171",
                      }}>
                        <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#ef4444", display: "inline-block", animation: "mon-live-dot 1.2s infinite" }} />
                        LIVE
                      </div>
                    </div>
                    <button
                      onClick={handleStopVideo}
                      style={{
                        width: "100%", padding: "9px 0", borderRadius: 10, cursor: "pointer",
                        fontSize: 12, fontWeight: 700,
                        display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                        background: "rgba(239,68,68,0.14)", color: "#f87171",
                        border: "1px solid rgba(239,68,68,0.28)",
                        transition: "background 0.15s",
                      }}
                      onMouseEnter={e => (e.currentTarget.style.background = "rgba(239,68,68,0.24)")}
                      onMouseLeave={e => (e.currentTarget.style.background = "rgba(239,68,68,0.14)")}
                    >
                      <Square size={12} /> Stop Broadcast
                    </button>
                  </div>
                ) : showVideoInput ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                    <input
                      value={videoUrl}
                      onChange={e => setVideoUrl(e.target.value)}
                      onKeyDown={e => e.key === "Enter" && handleShareVideo()}
                      placeholder="YouTube URL or video ID…"
                      className="input text-xs w-full"
                      autoFocus
                      style={{ fontSize: 12 }}
                    />
                    <input
                      value={videoTitle}
                      onChange={e => setVideoTitle(e.target.value)}
                      placeholder="Title (optional)"
                      className="input text-xs w-full"
                      style={{ fontSize: 12 }}
                    />
                    <div style={{ display: "flex", gap: 7 }}>
                      <button
                        onClick={handleShareVideo}
                        style={{
                          flex: 1, padding: "9px 0", borderRadius: 10, cursor: "pointer",
                          fontSize: 12, fontWeight: 700,
                          display: "flex", alignItems: "center", justifyContent: "center", gap: 5,
                          background: "rgba(239,68,68,0.14)", color: "#f87171",
                          border: "1px solid rgba(239,68,68,0.28)",
                        }}
                      >
                        <Play size={11} /> Share
                      </button>
                      <button
                        onClick={() => { setShowVideoInput(false); setVideoUrl(""); setVideoTitle(""); }}
                        style={{
                          padding: "9px 10px", borderRadius: 10, cursor: "pointer",
                          background: "rgba(255,255,255,0.05)", color: text3,
                          border: "1px solid rgba(255,255,255,0.08)",
                        }}
                      >
                        <X size={12} />
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => setShowVideoInput(true)}
                    style={{
                      width: "100%", padding: "10px 0", borderRadius: 10, cursor: "pointer",
                      fontSize: 12, fontWeight: 600,
                      display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                      background: "rgba(239,68,68,0.08)", color: "#f87171",
                      border: "1px solid rgba(239,68,68,0.18)",
                      transition: "background 0.15s",
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background = "rgba(239,68,68,0.16)")}
                    onMouseLeave={e => (e.currentTarget.style.background = "rgba(239,68,68,0.08)")}
                  >
                    <Youtube size={13} /> Share YouTube Video
                  </button>
                )}
              </div>
            </div>

          </div>
        </div>
      )}

      {/* No class state */}
      {!selectedClass && !loading && (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", flex: 1, gap: 12 }}>
          <Monitor size={48} style={{ color: text3, opacity: 0.2 }} />
          <p style={{ fontSize: 14, color: text3 }}>No class selected</p>
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
  const status = deriveStatus(presence);
  const meta = STATUS_META[status];
  const { emoji: actEmoji, label: actLabel, color: actColor } = activityPreview(presence.lastAction || "");
  const hasSnap = !!snapshot?.data;
  const snapAgeSec = snapshot?.capturedAt
    ? Math.floor((Date.now() - new Date(snapshot.capturedAt).getTime()) / 1000)
    : null;

  const isWorking = status === "working";
  const isOnline  = status !== "offline";

  return (
    <div
      onClick={onOpenDrawer}
      className="group"
      style={{
        position: "relative",
        borderRadius: 18,
        overflow: "hidden",
        cursor: "pointer",
        minHeight: 216,
        background: `linear-gradient(160deg, ${meta.gradStart} 0%, rgba(7,7,20,0.95) 55%)`,
        border: `1.5px solid ${isOnline ? meta.ring : "rgba(255,255,255,0.06)"}`,
        transition: "transform 0.18s ease, box-shadow 0.18s ease",
        boxShadow: isWorking
          ? `0 4px 20px rgba(0,0,0,0.35), 0 0 0 1px ${meta.ring}`
          : isOnline
            ? `0 4px 16px rgba(0,0,0,0.28), 0 0 0 1px ${meta.ring}`
            : "0 2px 8px rgba(0,0,0,0.2)",
        animation: `mon-slide-up 0.35s ease both, ${isWorking ? "mon-card-glow 2.4s ease-in-out infinite" : "none"}`,
        animationDelay: `${animDelay}ms`,
        ["--glow" as any]: meta.glow,
        ["--ring-color" as any]: meta.ring,
      }}
      onMouseEnter={e => {
        const el = e.currentTarget as HTMLDivElement;
        el.style.transform = "translateY(-4px) scale(1.015)";
        el.style.boxShadow = `0 16px 40px rgba(0,0,0,0.45), 0 0 0 1.5px ${meta.ring}`;
      }}
      onMouseLeave={e => {
        const el = e.currentTarget as HTMLDivElement;
        el.style.transform = "translateY(0) scale(1)";
        el.style.boxShadow = isWorking
          ? `0 4px 20px rgba(0,0,0,0.35), 0 0 0 1px ${meta.ring}`
          : isOnline
            ? `0 4px 16px rgba(0,0,0,0.28), 0 0 0 1px ${meta.ring}`
            : "0 2px 8px rgba(0,0,0,0.2)";
      }}
    >
      {/* Pulsing top glow strip for working students */}
      {isWorking && (
        <div style={{
          position: "absolute", top: 0, left: 0, right: 0, height: 2,
          background: `linear-gradient(90deg, transparent, ${meta.dot} 30%, ${meta.dot} 70%, transparent)`,
          animation: "mon-live-dot 1.8s ease-in-out infinite",
        }} />
      )}

      {/* Activity preview area (top 110px) */}
      <div style={{
        position: "relative", height: 110, overflow: "hidden",
      }}>
        {hasSnap ? (
          <>
            <img
              src={snapshot!.data}
              alt={`${student.name}'s screen`}
              style={{
                width: "100%", height: "100%", objectFit: "cover", display: "block",
                filter: status === "offline" ? "grayscale(90%) brightness(0.35)" : "brightness(0.92)",
                transition: "filter 0.4s",
              }}
            />
            {/* Gradient overlay at bottom */}
            <div style={{
              position: "absolute", bottom: 0, left: 0, right: 0, height: 50,
              background: "linear-gradient(to top, rgba(7,7,20,1) 0%, rgba(7,7,20,0.7) 50%, transparent 100%)",
            }} />
            {/* Activity label */}
            <div style={{
              position: "absolute", bottom: 7, left: 8, right: 8,
              display: "flex", alignItems: "center", gap: 4,
            }}>
              <span style={{ fontSize: 10 }}>{actEmoji}</span>
              <span style={{ fontSize: 9.5, fontWeight: 700, color: "rgba(255,255,255,0.9)", letterSpacing: "0.03em", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>
                {actLabel}
              </span>
              {snapAgeSec !== null && (
                <span style={{ fontSize: 9, color: "rgba(255,255,255,0.4)", flexShrink: 0 }}>{snapAgeSec}s</span>
              )}
            </div>
            {/* Zoom button (hover) */}
            {onZoom && (
              <button
                onClick={e => { e.stopPropagation(); onZoom(); }}
                title="View full screen"
                style={{
                  position: "absolute", top: 7, right: 7,
                  width: 26, height: 26, borderRadius: 7,
                  background: "rgba(0,0,0,0.55)", border: "1px solid rgba(255,255,255,0.18)",
                  color: "white", display: "flex", alignItems: "center", justifyContent: "center",
                  cursor: "pointer", opacity: 0, transition: "opacity 0.15s",
                }}
                className="group-hover:opacity-100"
              >
                <ExternalLink size={11} />
              </button>
            )}
            {status === "offline" && (
              <div style={{
                position: "absolute", top: 7, left: 7,
                background: "rgba(15,15,30,0.75)", color: "rgba(255,255,255,0.45)",
                fontSize: 9, fontWeight: 800, padding: "2px 7px", borderRadius: 5,
                letterSpacing: "0.07em", border: "1px solid rgba(255,255,255,0.1)",
              }}>AWAY</div>
            )}
          </>
        ) : isOnline ? (
          /* No screenshot yet — show big emoji placeholder */
          <div style={{
            height: "100%", display: "flex", flexDirection: "column",
            alignItems: "center", justifyContent: "center", gap: 5,
            background: `radial-gradient(circle at 50% 60%, ${meta.gradStart}, transparent 70%)`,
          }}>
            <span style={{ fontSize: 30, filter: "drop-shadow(0 2px 8px rgba(0,0,0,0.4))" }}>{actEmoji}</span>
            <span style={{ fontSize: 9.5, fontWeight: 800, color: actColor, letterSpacing: "0.08em", textTransform: "uppercase" }}>{actLabel}</span>
          </div>
        ) : (
          /* Offline */
          <div style={{
            height: "100%", display: "flex", alignItems: "center", justifyContent: "center",
            background: "rgba(7,7,20,0.5)",
          }}>
            <span style={{ fontSize: 28, opacity: 0.18 }}>⭕</span>
          </div>
        )}
      </div>

      {/* Card body */}
      <div style={{ padding: "10px 12px 11px" }}>
        {/* Name + status row */}
        <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 9 }}>
          {/* Avatar */}
          <div style={{ position: "relative", flexShrink: 0 }}>
            <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${gradient} flex items-center justify-center text-white font-bold`}
              style={{ fontSize: 11, boxShadow: isOnline ? `0 2px 10px ${meta.glow}` : "none" }}>
              {initials}
            </div>
            {/* Status dot */}
            <span style={{
              position: "absolute", bottom: -1, right: -1,
              width: 9, height: 9, borderRadius: "50%",
              background: meta.dot,
              border: "2px solid #070714",
              boxShadow: isOnline ? `0 0 7px ${meta.dot}` : "none",
              animation: isWorking ? "mon-live-dot 1.6s ease-in-out infinite" : "none",
            }} />
          </div>

          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 12, color: "#f1f5f9", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {student.name}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 1 }}>
              <span style={{
                fontSize: 9.5, fontWeight: 700,
                padding: "1px 6px", borderRadius: 20,
                background: `${meta.dot}1a`, color: meta.text,
                border: `1px solid ${meta.ring}`,
              }}>
                {meta.label}
              </span>
              {presence.lastActive && isOnline && (
                <span style={{ fontSize: 9, color: "rgba(255,255,255,0.3)" }}>
                  {timeAgo(presence.lastActive)}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Action buttons */}
        <div style={{ display: "flex", gap: 5 }} onClick={e => e.stopPropagation()}>
          {presence.projectId ? (
            <Link
              to={`/project/${presence.projectId}`}
              style={{
                flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 4,
                padding: "5px 0", borderRadius: 7, textDecoration: "none",
                fontSize: 10, fontWeight: 700,
                background: "rgba(99,102,241,0.12)", color: "#818cf8",
                border: "1px solid rgba(99,102,241,0.22)",
                transition: "background 0.15s",
              }}
              onMouseEnter={e => (e.currentTarget.style.background = "rgba(99,102,241,0.22)")}
              onMouseLeave={e => (e.currentTarget.style.background = "rgba(99,102,241,0.12)")}
            >
              <ExternalLink size={9} /> View
            </Link>
          ) : (
            <div style={{ flex: 1, textAlign: "center", fontSize: 9.5, padding: "5px 0", color: "rgba(255,255,255,0.2)" }}>
              No project
            </div>
          )}
          <button
            onClick={e => { e.stopPropagation(); onMessage(); }}
            title="Send message"
            style={{
              display: "flex", alignItems: "center", justifyContent: "center",
              width: 26, height: 26, borderRadius: 7, cursor: "pointer",
              background: "rgba(99,102,241,0.10)", color: "#818cf8",
              border: "1px solid rgba(99,102,241,0.18)",
              transition: "background 0.15s",
              flexShrink: 0,
            }}
            onMouseEnter={e => (e.currentTarget.style.background = "rgba(99,102,241,0.22)")}
            onMouseLeave={e => (e.currentTarget.style.background = "rgba(99,102,241,0.10)")}
          >
            <MessageSquare size={10} />
          </button>
          <button
            onClick={e => { e.stopPropagation(); onKick(); }}
            title="Redirect to dashboard"
            style={{
              display: "flex", alignItems: "center", justifyContent: "center",
              width: 26, height: 26, borderRadius: 7, cursor: "pointer",
              background: "rgba(245,158,11,0.08)", color: "#fbbf24",
              border: "1px solid rgba(245,158,11,0.18)",
              transition: "background 0.15s",
              flexShrink: 0,
            }}
            onMouseEnter={e => (e.currentTarget.style.background = "rgba(245,158,11,0.18)")}
            onMouseLeave={e => (e.currentTarget.style.background = "rgba(245,158,11,0.08)")}
          >
            <Navigation size={10} />
          </button>
          {presence.unityRoom && (
            <button
              onClick={e => { e.stopPropagation(); onWatchUnity(presence.unityRoom!, student.name); }}
              title="Watch Unity stage"
              style={{
                display: "flex", alignItems: "center", justifyContent: "center",
                width: 26, height: 26, borderRadius: 7, cursor: "pointer",
                background: "rgba(34,211,238,0.08)", color: "#22d3ee",
                border: "1px solid rgba(34,211,238,0.2)",
                transition: "background 0.15s",
                flexShrink: 0,
              }}
              onMouseEnter={e => (e.currentTarget.style.background = "rgba(34,211,238,0.18)")}
              onMouseLeave={e => (e.currentTarget.style.background = "rgba(34,211,238,0.08)")}
            >
              <Eye size={10} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
