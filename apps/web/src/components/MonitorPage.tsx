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

type StatusKey = "online" | "working" | "idle" | "offline";

/** Derive a 4-state status from presence data */
function deriveStatus(pr: any): StatusKey {
  if (!pr.isOnline) return "offline";
  const a = (pr.lastAction || "").toLowerCase();
  if (a.includes("assignment") || a.includes("project") || a.includes("quiz") || a.includes("lesson"))
    return "working";
  const secsAgo = pr.lastActive ? Math.floor((Date.now() - pr.lastActive) / 1000) : 9999;
  if (secsAgo > 120) return "idle";
  return "online";
}

const STATUS_META: Record<StatusKey, { label: string; dot: string; ring: string; text: string; bg: string }> = {
  online:  { label: "Online",   dot: "#34d399", ring: "rgba(52,211,153,0.25)",  text: "#34d399", bg: "rgba(52,211,153,0.08)"  },
  working: { label: "Working",  dot: "#8b5cf6", ring: "rgba(139,92,246,0.25)", text: "#a78bfa", bg: "rgba(139,92,246,0.08)" },
  idle:    { label: "Idle",     dot: "#f59e0b", ring: "rgba(245,158,11,0.20)",  text: "#fbbf24", bg: "rgba(245,158,11,0.06)"  },
  offline: { label: "Offline",  dot: "#475569", ring: "transparent",            text: "#64748b", bg: "transparent"            },
};

/** Maps presence activity string to an icon/label for the tile preview */
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

// Catalog for the per-game whitelist UI in Free Time Settings. Kept in sync
// with ArcadePage GAMES manually since we don't want to import the whole
// game registry (which pulls in all games + Unity iframes).
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
  const handleEndAllBreaks = async () => {
    if (!selectedClass) return;
    if (!confirm(`End every active break in ${selectedClass.name}? Students will be kicked back to /student with a toast.`)) return;
    try { const r = await api.endAllBreaks(selectedClass.id); alert(`⏰ Break-end signal sent to ${r.studentsNotified} students`); }
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
    // Fire legacy class_video write + new student_commands fan-out in parallel.
    // New pipe is authoritative for students on the new overlay path.
    Promise.allSettled([
      api.shareClassVideo(selectedClass.id, id, videoTitle || "Class Video"),
      api.broadcastClassVideo(selectedClass.id, videoUrl),
    ]).catch(() => {});
    setActiveVideo(id); setShowVideoInput(false); setVideoUrl(""); setVideoTitle("");
  };

  const handleStopVideo = async () => {
    if (!selectedClass) return;
    // Fire socket notification immediately for fast student dismiss,
    // but ONLY clear local "Stop Video" UI state after the server DELETE
    // succeeds — otherwise the teacher sees the button disappear while the
    // broadcast is still live in the DB (the bug users were hitting).
    try {
      getSocket().emit("class:video:stop", { classId: selectedClass.id });
      // Fire both paths — new pipe sends END_BROADCAST to every student; legacy
      // path also drops the class_video row. Use allSettled so a failure in
      // one doesn't block the other, but still surface to the teacher if the
      // legacy DELETE (the authoritative "still live in DB" signal) fails.
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
      // Do NOT clear activeVideo here; leave the button so the teacher can retry.
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
        <div
          onClick={() => setZoomedSnapshot(null)}
          style={{
            position: "fixed", inset: 0, zIndex: 300,
            background: "rgba(0,0,0,0.88)", backdropFilter: "blur(10px)",
            display: "flex", alignItems: "center", justifyContent: "center",
            padding: 20, cursor: "pointer",
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{ maxWidth: 960, width: "100%", cursor: "default", borderRadius: 16, overflow: "hidden",
              border: "1px solid rgba(139,92,246,0.3)", boxShadow: "0 32px 80px rgba(0,0,0,0.6)" }}
          >
            {/* Modal header */}
            <div style={{
              display: "flex", alignItems: "center", gap: 10, padding: "10px 16px",
              background: "rgba(139,92,246,0.12)", borderBottom: "1px solid rgba(139,92,246,0.2)",
            }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#10b981",
                boxShadow: "0 0 8px #10b981", display: "inline-block", animation: "pulse 2s infinite" }} />
              <span style={{ color: "white", fontWeight: 700, fontSize: 13 }}>{zoomedSnapshot.name}'s screen</span>
              <span style={{ color: "rgba(255,255,255,0.35)", fontSize: 11, fontFamily: "monospace" }}>{zoomedSnapshot.path}</span>
              <button
                onClick={() => setZoomedSnapshot(null)}
                style={{
                  marginLeft: "auto", background: "rgba(255,255,255,0.07)",
                  border: "1px solid rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.6)",
                  borderRadius: 8, padding: "4px 12px", cursor: "pointer", fontSize: 12, fontWeight: 600,
                }}
              >
                Close
              </button>
            </div>
            <img
              src={zoomedSnapshot.data}
              alt="student screen"
              style={{ width: "100%", display: "block" }}
            />
          </div>
        </div>
      )}

      {/* Unity live view modal */}
      {watchingRoom && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 200,
          background: "rgba(0,0,0,0.88)", backdropFilter: "blur(10px)",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <div style={{
            width: "min(960px,96vw)", borderRadius: 16, overflow: "hidden",
            border: "1px solid rgba(34,211,238,0.3)", background: "#07071a",
            display: "flex", flexDirection: "column",
            boxShadow: "0 32px 80px rgba(0,0,0,0.6)",
          }}>
            <div style={{
              display: "flex", alignItems: "center", gap: 10, padding: "10px 16px",
              background: "rgba(34,211,238,0.07)", borderBottom: "1px solid rgba(34,211,238,0.15)",
            }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#22d3ee", boxShadow: "0 0 8px #22d3ee", display: "inline-block" }} />
              <span style={{ color: "#22d3ee", fontWeight: 700, fontSize: 13 }}>
                Watching {watchingName}'s Unity Stage — Room: {watchingRoom}
              </span>
              <button
                onClick={() => { setWatchingRoom(null); setWatchingName(""); }}
                style={{
                  marginLeft: "auto", background: "rgba(255,255,255,0.07)",
                  border: "1px solid rgba(255,255,255,0.12)", color: "rgba(255,255,255,0.6)",
                  borderRadius: 8, padding: "4px 12px", cursor: "pointer", fontSize: 12, fontWeight: 600,
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

      {/* Message modal */}
      {showMsgModal && (
        <div
          style={{ position: "fixed", inset: 0, zIndex: 300, background: "rgba(0,0,0,0.65)", backdropFilter: "blur(6px)", display: "flex", alignItems: "center", justifyContent: "center" }}
          onClick={e => { if (e.target === e.currentTarget) setShowMsgModal(null); }}
        >
          <div className="card animate-scale-in" style={{ width: "100%", maxWidth: 420, padding: 24, boxShadow: "0 24px 60px rgba(0,0,0,0.5)" }}>
            <div className="flex items-center gap-3 mb-4">
              <div style={{ width: 36, height: 36, borderRadius: 10, background: "rgba(99,102,241,0.12)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <MessageSquare size={16} style={{ color: "var(--accent)" }} />
              </div>
              <div>
                <div className="font-semibold text-sm" style={{ color: "var(--text-1)" }}>Send Message</div>
                <div className="text-xs" style={{ color: "var(--text-3)" }}>
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
            <div className="flex gap-2 mt-3">
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

      {/* ── Page header ── */}
      <header>
        <div className="flex items-center justify-between mb-4">
          {/* Left: title + class selector */}
          <div className="flex items-center gap-3 min-w-0">
            <Link to="/teacher" className="btn-ghost px-2 py-1.5 text-xs flex-shrink-0">
              <ChevronLeft size={13} /> Back
            </Link>
            <div className="w-px h-4 flex-shrink-0" style={{ background: "var(--border)" }} />
            <div className="min-w-0">
              <div className="section-label mb-0.5">Live Monitor</div>
              <h1 className="font-display text-xl leading-tight truncate" style={{ color: "var(--text-1)" }}>
                {selectedClass?.name || "No class selected"}
              </h1>
            </div>
            {classes.length > 1 && (
              <select
                value={selectedClass?.id ?? ""}
                onChange={e => handleClassChange(e.target.value)}
                className="input py-1.5 text-sm w-40 flex-shrink-0"
              >
                {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            )}
          </div>

          {/* Right: status chips + period + panic button */}
          <div className="flex items-center gap-2 flex-shrink-0">
            {/* Live / disconnected pill */}
            <div className={`flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1.5 rounded-full border ${
              isLive
                ? dk ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" : "bg-emerald-50 text-emerald-600 border-emerald-200"
                : dk ? "bg-red-500/10 text-red-400 border-red-500/20" : "bg-red-50 text-red-600 border-red-200"
            }`}>
              {isLive
                ? <><span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" /><Wifi size={11} /> Live</>
                : <><span className="w-1.5 h-1.5 rounded-full bg-red-400" /><WifiOff size={11} /> Offline</>
              }
            </div>

            {/* Period selector */}
            <select
              value={period}
              onChange={e => setPeriod(e.target.value)}
              className="input py-1.5 text-xs w-32"
              title="Class period label"
            >
              <option value="None">No period</option>
              {["Period 1","Period 2","Period 3","Period 4","Period 5","Period 6","Free Time"].map(p =>
                <option key={p} value={p}>{p}</option>
              )}
            </select>

            {/* Class lock status badge */}
            {isClassLocked && (
              <span className="flex items-center gap-1.5 text-xs font-bold px-2.5 py-1.5 rounded-full bg-red-500/15 text-red-400 border border-red-500/25 animate-pulse">
                <Lock size={11} /> LOCKED
              </span>
            )}

            {/* Force unlock all */}
            <button
              onClick={async () => {
                if (!confirm("Force-unlock EVERY class?")) return;
                try { await api.forceUnlockAll(); setIsClassLocked(false); alert("✓ All classes unlocked."); }
                catch (e: any) { alert("Failed: " + (e?.message || e)); }
              }}
              title="Clear every active lock system-wide"
              className={`flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1.5 rounded-full cursor-pointer transition-all border ${
                dk ? "bg-red-500/10 hover:bg-red-500/20 text-red-400 border-red-500/25"
                   : "bg-red-50 hover:bg-red-100 text-red-600 border-red-200"
              }`}
            >
              <LockOpen size={11} /> Force Unlock All
            </button>
          </div>
        </div>
      </header>

      {/* ── Status summary bar ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {[
          { label: "Online",   value: onlineCount,   color: STATUS_META.online.dot,   bg: STATUS_META.online.bg,   icon: <Wifi size={12} /> },
          { label: "Working",  value: workingCount,  color: STATUS_META.working.dot,  bg: STATUS_META.working.bg,  icon: <Activity size={12} /> },
          { label: "Idle",     value: idleCount,     color: STATUS_META.idle.dot,     bg: STATUS_META.idle.bg,     icon: <Clock size={12} /> },
          { label: "Offline",  value: offlineCount,  color: STATUS_META.offline.dot,  bg: "rgba(71,85,105,0.06)",  icon: <WifiOff size={12} /> },
        ].map(stat => (
          <div
            key={stat.label}
            className="card flex items-center gap-3"
            style={{ padding: "12px 14px", borderLeft: `3px solid ${stat.color}` }}
          >
            <div style={{
              width: 32, height: 32, borderRadius: 8, flexShrink: 0,
              background: stat.bg, display: "flex", alignItems: "center", justifyContent: "center",
              color: stat.color,
            }}>
              {stat.icon}
            </div>
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-3)" }}>
                {stat.label}
              </div>
              <div className="font-display text-2xl leading-none mt-0.5" style={{ color: "var(--text-1)" }}>
                {stat.value}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* ── Classroom Controls ── */}
      {selectedClass && (
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>

          {/* Controls header */}
          <div
            className="flex items-center justify-between px-5 py-3"
            style={{ borderBottom: "1px solid var(--border)" }}
          >
            <div className="flex items-center gap-2">
              <Zap size={14} style={{ color: "var(--accent)" }} />
              <span className="font-semibold text-sm" style={{ color: "var(--text-1)" }}>Class Controls</span>
              {period !== "None" && (
                <span className="chip">{period}</span>
              )}
            </div>
            {isClassLocked && (
              <span className="flex items-center gap-1.5 text-xs font-bold px-2 py-0.5 rounded-full bg-red-500/15 text-red-400 border border-red-500/20">
                <Lock size={10} /> LOCKED
              </span>
            )}
          </div>

          <div className="p-5 space-y-4">

            {/* Row 1: Lock / Unlock + Push + Message */}
            <div className="flex flex-wrap gap-2 items-center">
              {/* Lock controls group */}
              <div className="flex items-center gap-1.5 rounded-xl p-1" style={{ background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.12)" }}>
                <button
                  onClick={() => handleLockAll(true)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border cursor-pointer transition-all ${
                    isClassLocked
                      ? "bg-red-500/25 text-red-300 border-red-400/40"
                      : dk ? "bg-red-500/12 hover:bg-red-500/20 text-red-400 border-red-500/20" : "bg-red-50 hover:bg-red-100 text-red-600 border-red-200"
                  }`}
                >
                  <Lock size={11} /> Lock All
                </button>
                <button
                  onClick={() => handleLockAll(false)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border cursor-pointer transition-all ${
                    dk ? "bg-emerald-500/10 hover:bg-emerald-500/18 text-emerald-400 border-emerald-500/20"
                       : "bg-emerald-50 hover:bg-emerald-100 text-emerald-600 border-emerald-200"
                  }`}
                >
                  <LockOpen size={11} /> Unlock
                </button>
              </div>

              {/* Lock message */}
              <input
                value={lockMsg}
                onChange={e => setLockMsg(e.target.value)}
                placeholder="Lock screen message (optional)…"
                className="input text-xs flex-1 min-w-0"
                style={{ minWidth: 160, maxWidth: 280 }}
              />

              <div className="flex-1" />

              {/* Push to page */}
              <div className="relative">
                <button
                  onClick={() => setShowPushMenu(v => !v)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border cursor-pointer transition-all ${
                    showPushMenu
                      ? dk ? "bg-blue-500/20 text-blue-300 border-blue-500/35" : "bg-blue-100 text-blue-700 border-blue-300"
                      : dk ? "bg-blue-500/10 hover:bg-blue-500/18 text-blue-400 border-blue-500/20" : "bg-blue-50 hover:bg-blue-100 text-blue-600 border-blue-200"
                  }`}
                >
                  <Navigation size={11} /> Push to Page
                </button>
                {showPushMenu && (
                  <div
                    className="absolute top-full mt-1.5 right-0 rounded-xl shadow-2xl border overflow-hidden z-50 animate-scale-in"
                    style={{
                      minWidth: 176,
                      background: dk ? "var(--bg-raised)" : "white",
                      borderColor: "var(--border-md)",
                    }}
                  >
                    {PUSH_PAGES.map(p => (
                      <button
                        key={p.path}
                        onClick={() => handlePushToPage(p.path)}
                        className="w-full flex items-center gap-2 px-4 py-2.5 text-xs font-medium text-left cursor-pointer transition-colors"
                        style={{ color: "var(--text-2)" }}
                        onMouseEnter={e => (e.currentTarget.style.background = "var(--bg-hover)")}
                        onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                      >
                        <p.icon size={13} style={{ color: "var(--accent)", flexShrink: 0 }} />
                        {p.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Broadcast message */}
              <button
                onClick={() => setShowMsgModal("all")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border cursor-pointer transition-all ${
                  dk ? "bg-violet-500/10 hover:bg-violet-500/18 text-violet-400 border-violet-500/20"
                     : "bg-violet-50 hover:bg-violet-100 text-violet-600 border-violet-200"
                }`}
              >
                <MessageSquare size={11} /> Message All
              </button>
            </div>

            {/* Row 2: Announce broadcast */}
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Radio size={13} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--text-3)", pointerEvents: "none" }} />
                <input
                  ref={announceRef}
                  value={announcement}
                  onChange={e => setAnnouncement(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && handleAnnounce()}
                  placeholder="Broadcast announcement to all students…"
                  className="input text-sm w-full"
                  style={{ paddingLeft: 30 }}
                />
              </div>
              <button
                onClick={handleAnnounce}
                disabled={!announcement.trim()}
                className={`btn-primary gap-1.5 px-4 flex-shrink-0 transition-all ${announceSent ? "bg-emerald-500 border-emerald-500" : ""}`}
                style={announceSent ? { background: "#10b981" } : {}}
              >
                {announceSent ? "Sent!" : <><Megaphone size={13} /> Announce</>}
              </button>
            </div>

            {/* Row 3: Free time actions */}
            <div
              className="flex flex-wrap gap-2 items-center pt-3"
              style={{ borderTop: "1px solid var(--border)" }}
            >
              <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--text-3)" }}>
                Free Time
              </span>
              <button
                onClick={handleGrantAll}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border cursor-pointer transition-all ${
                  dk ? "bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border-amber-500/25"
                     : "bg-amber-50 hover:bg-amber-100 text-amber-600 border-amber-200"
                }`}
              >
                <Gift size={11} /> Grant All
              </button>
              <button
                onClick={handleRevokeAll}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border cursor-pointer transition-all ${
                  dk ? "bg-red-500/10 hover:bg-red-500/20 text-red-400 border-red-500/25"
                     : "bg-red-50 hover:bg-red-100 text-red-600 border-red-200"
                }`}
              >
                <XCircle size={11} /> Revoke All
              </button>
              <button
                onClick={handleEndAllBreaks}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border cursor-pointer transition-all ${
                  dk ? "bg-violet-500/10 hover:bg-violet-500/20 text-violet-400 border-violet-500/25"
                     : "bg-violet-50 hover:bg-violet-100 text-violet-600 border-violet-200"
                }`}
              >
                <Clock size={11} /> End All Breaks
              </button>
              <button
                onClick={() => setShowConfigPanel(v => !v)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border cursor-pointer transition-all ${
                  showConfigPanel
                    ? dk ? "bg-blue-500/20 text-blue-300 border-blue-500/35" : "bg-blue-100 text-blue-700 border-blue-300"
                    : dk ? "bg-white/5 hover:bg-white/8 text-white/50 border-white/10" : "bg-gray-50 hover:bg-gray-100 text-gray-600 border-gray-200"
                }`}
              >
                <Settings2 size={11} /> Settings
              </button>
            </div>

            {/* Free-time config panel */}
            {showConfigPanel && (
              <div
                className="rounded-xl p-4 space-y-3 animate-slide-up"
                style={{
                  background: dk ? "rgba(255,255,255,0.02)" : "rgba(0,0,0,0.02)",
                  border: "1px solid var(--border)",
                }}
              >
                <div className="text-xs font-bold uppercase tracking-wider" style={{ color: "var(--text-3)" }}>
                  Free time includes:
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {[
                    { key: "arcadeEnabled",    label: "Arcade" },
                    { key: "projectsEnabled",  label: "Projects" },
                    { key: "unityEnabled",     label: "Unity 3D" },
                    { key: "blockforgeEnabled",label: "BlockForge" },
                    { key: "youtubeEnabled",   label: "YouTube" },
                  ].map(f => (
                    <label
                      key={f.key}
                      className={`flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer text-xs font-semibold transition-colors ${
                        freeTimeConfig[f.key]
                          ? dk ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" : "bg-emerald-50 text-emerald-700 border border-emerald-200"
                          : dk ? "bg-white/[0.03] text-white/30 border border-white/[0.06]" : "bg-white text-gray-400 border border-gray-200"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={!!freeTimeConfig[f.key]}
                        onChange={e => setFreeTimeConfig((cfg: any) => ({ ...cfg, [f.key]: e.target.checked }))}
                      />
                      {f.label}
                    </label>
                  ))}
                  <div className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold border ${
                    dk ? "bg-white/[0.03] text-white/40 border-white/[0.06]" : "bg-white text-gray-500 border-gray-200"
                  }`}>
                    <span>Daily cap (min):</span>
                    <input
                      type="number"
                      value={freeTimeConfig.dailyCapMinutes || 0}
                      min={0}
                      max={240}
                      onChange={e => setFreeTimeConfig((cfg: any) => ({ ...cfg, dailyCapMinutes: parseInt(e.target.value) || 0 }))}
                      className="input text-xs w-14 py-1"
                    />
                  </div>
                </div>

                {/* Per-game whitelist */}
                <details className="rounded-lg overflow-hidden" style={{ background: dk ? "rgba(255,255,255,0.02)" : "rgba(0,0,0,0.02)", border: "1px solid var(--border)" }}>
                  <summary className={`cursor-pointer font-semibold select-none text-xs px-3 py-2 ${dk ? "text-white/50" : "text-gray-500"}`}>
                    Allowed arcade games {freeTimeConfig.allowedGameIds?.length ? `(${freeTimeConfig.allowedGameIds.length} selected)` : "(all allowed)"}
                  </summary>
                  <div className="px-3 pb-3 pt-1 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-1">
                    {ARCADE_GAME_CATALOG.map(g => {
                      const whitelist: string[] | undefined = freeTimeConfig.allowedGameIds;
                      const checked = !whitelist || whitelist.length === 0 || whitelist.includes(g.id);
                      return (
                        <label
                          key={g.id}
                          className={`flex items-center gap-1.5 px-2 py-1 rounded cursor-pointer text-[11px] font-medium transition-colors ${
                            checked
                              ? dk ? "bg-emerald-500/8 text-emerald-400" : "bg-emerald-50 text-emerald-700"
                              : dk ? "bg-white/[0.02] text-white/25" : "bg-white text-gray-400"
                          }`}
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
                          <span className="truncate">{g.label}</span>
                        </label>
                      );
                    })}
                  </div>
                  <button
                    onClick={() => setFreeTimeConfig((cfg: any) => ({ ...cfg, allowedGameIds: null }))}
                    className={`mx-3 mb-2 text-[10px] font-medium px-2 py-1 rounded cursor-pointer transition-colors ${
                      dk ? "text-white/35 hover:text-white/55" : "text-gray-400 hover:text-gray-600"
                    }`}
                  >
                    Reset — allow all games
                  </button>
                </details>

                <div className="flex items-center gap-3">
                  <button onClick={saveConfig} className="btn-primary gap-1.5 text-xs px-4">
                    Save & Apply
                  </button>
                  <span className="text-[10px]" style={{ color: "var(--text-3)" }}>
                    Applies to all students in {selectedClass?.name} on next poll
                  </span>
                </div>
              </div>
            )}

            {/* Row 4: Video sharing */}
            <div
              className="flex flex-wrap gap-2 items-center pt-3"
              style={{ borderTop: "1px solid var(--border)" }}
            >
              <Youtube size={13} style={{ color: "#f87171", flexShrink: 0 }} />
              <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--text-3)" }}>
                Video
              </span>

              {activeVideo ? (
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-semibold"
                    style={{ background: "rgba(239,68,68,0.10)", border: "1px solid rgba(239,68,68,0.25)", color: "#f87171" }}>
                    <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#ef4444", display: "inline-block", animation: "pulse 1.5s infinite" }} />
                    Live
                    <img src={`https://img.youtube.com/vi/${activeVideo}/default.jpg`}
                      style={{ width: 28, height: 20, objectFit: "cover", borderRadius: 4, marginLeft: 2 }} alt="thumb" />
                  </div>
                  <button
                    onClick={handleStopVideo}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold cursor-pointer border"
                    style={{ background: "rgba(239,68,68,0.10)", color: "#f87171", border: "1px solid rgba(239,68,68,0.25)" }}
                  >
                    <Square size={11} /> Stop
                  </button>
                </div>
              ) : showVideoInput ? (
                <div className="flex items-center gap-2 flex-wrap flex-1">
                  <input
                    value={videoUrl}
                    onChange={e => setVideoUrl(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && handleShareVideo()}
                    placeholder="YouTube URL or video ID…"
                    className="input text-xs flex-1"
                    autoFocus
                  />
                  <input
                    value={videoTitle}
                    onChange={e => setVideoTitle(e.target.value)}
                    placeholder="Title (optional)"
                    className="input text-xs w-36"
                  />
                  <button
                    onClick={handleShareVideo}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold cursor-pointer"
                    style={{ background: "rgba(239,68,68,0.12)", color: "#f87171", border: "1px solid rgba(239,68,68,0.3)" }}
                  >
                    <Play size={11} /> Share
                  </button>
                  <button
                    onClick={() => { setShowVideoInput(false); setVideoUrl(""); setVideoTitle(""); }}
                    className={`p-1.5 rounded-lg cursor-pointer transition-colors ${dk ? "text-white/30 hover:text-white/55" : "text-gray-400 hover:text-gray-600"}`}
                  >
                    <X size={13} />
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setShowVideoInput(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold cursor-pointer border"
                  style={{ background: "rgba(239,68,68,0.07)", color: "#f87171", border: "1px solid rgba(239,68,68,0.2)" }}
                >
                  <Youtube size={11} /> Share YouTube Video
                </button>
              )}
            </div>

          </div>
        </div>
      )}

      {/* ── Student presence grid ── */}
      {loading ? (
        <div className="card flex flex-col items-center justify-center py-16 gap-3">
          <div style={{ width: 32, height: 32, borderRadius: "50%", border: "2px solid var(--border)", borderTop: "2px solid var(--accent)", animation: "spin 0.8s linear infinite" }} />
          <span className="text-sm" style={{ color: "var(--text-3)" }}>Loading students…</span>
        </div>
      ) : students.length === 0 ? (
        <div className="card flex flex-col items-center justify-center py-16 gap-3">
          <Users size={36} style={{ color: "var(--text-3)", opacity: 0.3 }} />
          <p className="text-sm" style={{ color: "var(--text-3)" }}>
            {selectedClass
              ? <>No students yet. Share class code <strong className="font-mono" style={{ color: "var(--accent)" }}>{selectedClass?.code}</strong></>
              : "Select a class to begin."}
          </p>
        </div>
      ) : (
        <>
          {/* Section label with count summary */}
          <div className="flex items-center justify-between">
            <div className="section-label">— {students.length} students —</div>
            <div className="flex items-center gap-3 text-xs" style={{ color: "var(--text-3)" }}>
              {[
                { key: "online" as StatusKey,  count: onlineCount },
                { key: "working" as StatusKey, count: workingCount },
                { key: "idle" as StatusKey,    count: idleCount },
                { key: "offline" as StatusKey, count: offlineCount },
              ].map(({ key, count }) => (
                <span key={key} className="flex items-center gap-1">
                  <span style={{ width: 7, height: 7, borderRadius: "50%", background: STATUS_META[key].dot, display: "inline-block" }} />
                  {count} {STATUS_META[key].label.toLowerCase()}
                </span>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
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
        </>
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
  const { emoji, label: actLabel, color: actColor } = activityPreview(presence.lastAction || "");
  const hasSnap = !!snapshot?.data;
  const snapAgeSec = snapshot?.capturedAt
    ? Math.floor((Date.now() - new Date(snapshot.capturedAt).getTime()) / 1000)
    : null;

  return (
    <div
      onClick={onOpenDrawer}
      className="animate-slide-up group cursor-pointer"
      style={{
        animationDelay: `${animDelay}ms`,
        background: "var(--bg-surface)",
        border: `1px solid ${status !== "offline" ? meta.ring : "var(--border)"}`,
        borderRadius: 14,
        overflow: "hidden",
        transition: "border-color 0.2s, box-shadow 0.2s, transform 0.15s",
        boxShadow: status !== "offline" ? `0 0 0 1px ${meta.ring}` : "none",
      }}
      onMouseEnter={e => {
        (e.currentTarget as HTMLDivElement).style.transform = "translateY(-2px)";
        (e.currentTarget as HTMLDivElement).style.boxShadow = `0 8px 24px rgba(0,0,0,0.25), 0 0 0 1px ${meta.ring}`;
      }}
      onMouseLeave={e => {
        (e.currentTarget as HTMLDivElement).style.transform = "translateY(0)";
        (e.currentTarget as HTMLDivElement).style.boxShadow = status !== "offline" ? `0 0 0 1px ${meta.ring}` : "none";
      }}
    >
      {/* Top status stripe */}
      <div style={{
        height: 3,
        background: status !== "offline"
          ? `linear-gradient(90deg, transparent, ${meta.dot}, transparent)`
          : "transparent",
      }} />

      {/* Screenshot / activity preview pane */}
      <div
        style={{
          position: "relative",
          height: 130,
          background: hasSnap ? "#07071a" : status !== "offline" ? `${actColor}10` : dk ? "rgba(255,255,255,0.015)" : "rgba(0,0,0,0.02)",
          overflow: "hidden",
        }}
      >
        {hasSnap ? (
          <>
            <img
              src={snapshot!.data}
              alt={`${student.name}'s screen`}
              style={{
                width: "100%", height: "100%", objectFit: "cover", display: "block",
                filter: status === "offline" ? "grayscale(80%) brightness(0.4)" : "none",
                transition: "filter 0.3s",
              }}
            />
            {/* Activity overlay */}
            <div style={{
              position: "absolute", bottom: 0, left: 0, right: 0,
              padding: "12px 8px 6px",
              background: "linear-gradient(to top, rgba(0,0,0,0.75) 0%, transparent 100%)",
              display: "flex", alignItems: "center", gap: 4,
            }}>
              <span style={{ fontSize: 10, flexShrink: 0 }}>{emoji}</span>
              <span style={{ fontSize: 9, fontWeight: 700, color: "white", letterSpacing: "0.04em", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>
                {actLabel}
              </span>
              {snapAgeSec !== null && (
                <span style={{ fontSize: 9, color: "rgba(255,255,255,0.5)", flexShrink: 0 }}>{snapAgeSec}s</span>
              )}
            </div>
            {/* Zoom button */}
            {onZoom && (
              <button
                onClick={e => { e.stopPropagation(); onZoom(); }}
                title="View full screen"
                style={{
                  position: "absolute", top: 6, right: 6,
                  width: 24, height: 24, borderRadius: 6,
                  background: "rgba(0,0,0,0.5)", border: "1px solid rgba(255,255,255,0.15)",
                  color: "white", display: "flex", alignItems: "center", justifyContent: "center",
                  cursor: "pointer", opacity: 0, transition: "opacity 0.15s",
                }}
                className="group-hover:opacity-100"
              >
                <ExternalLink size={10} />
              </button>
            )}
            {status === "offline" && (
              <div style={{
                position: "absolute", top: 6, left: 6,
                background: "rgba(71,85,105,0.8)", color: "rgba(255,255,255,0.6)",
                fontSize: 9, fontWeight: 700, padding: "2px 6px", borderRadius: 4, letterSpacing: "0.05em",
              }}>AWAY</div>
            )}
          </>
        ) : status !== "offline" ? (
          <div style={{ height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 4 }}>
            <span style={{ fontSize: 26 }}>{emoji}</span>
            <span style={{ fontSize: 10, fontWeight: 700, color: actColor, letterSpacing: "0.06em", textTransform: "uppercase" }}>{actLabel}</span>
            <span style={{ fontSize: 9, color: "var(--text-3)", marginTop: 2 }}>Preview loading…</span>
          </div>
        ) : (
          <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <span style={{ fontSize: 22, opacity: 0.15 }}>💤</span>
          </div>
        )}
      </div>

      {/* Card body */}
      <div style={{ padding: "10px 12px 10px" }}>
        {/* Avatar row */}
        <div className="flex items-center gap-2 mb-2">
          <div className="relative flex-shrink-0">
            <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${gradient} flex items-center justify-center text-white text-xs font-bold`}>
              {initials}
            </div>
            {/* Status dot */}
            <span
              style={{
                position: "absolute", bottom: -1, right: -1,
                width: 9, height: 9, borderRadius: "50%",
                background: meta.dot,
                border: `2px solid var(--bg-surface)`,
                boxShadow: status !== "offline" ? `0 0 6px ${meta.dot}` : "none",
              }}
            />
          </div>

          <div className="flex-1 min-w-0">
            <div className="font-semibold text-xs leading-tight truncate" style={{ color: "var(--text-1)" }}>
              {student.name}
            </div>
            <div className="text-[10px] truncate" style={{ color: meta.text, fontWeight: 600 }}>
              {meta.label}
              {presence.lastActive && status !== "offline"
                ? <span style={{ color: "var(--text-3)", fontWeight: 400 }}> · {timeAgo(presence.lastActive)}</span>
                : null}
            </div>
          </div>
        </div>

        {/* Action row */}
        <div className="flex gap-1" onClick={e => e.stopPropagation()}>
          {presence.projectId ? (
            <Link
              to={`/project/${presence.projectId}`}
              className="flex items-center justify-center gap-1 flex-1 py-1 rounded-md text-[10px] font-semibold border transition-colors"
              style={{
                background: "rgba(99,102,241,0.07)", color: "var(--accent)",
                border: "1px solid rgba(99,102,241,0.18)",
              }}
            >
              <ExternalLink size={9} /> View
            </Link>
          ) : (
            <div className="flex-1 text-center text-[10px] py-1" style={{ color: "var(--text-3)" }}>No project</div>
          )}
          <button
            onClick={e => { e.stopPropagation(); onMessage(); }}
            title="Send message"
            className="flex items-center justify-center p-1.5 rounded-md border cursor-pointer transition-colors"
            style={{ background: "rgba(99,102,241,0.07)", color: "var(--accent)", border: "1px solid rgba(99,102,241,0.15)", minWidth: 26 }}
          >
            <MessageSquare size={10} />
          </button>
          <button
            onClick={e => { e.stopPropagation(); onKick(); }}
            title="Redirect to dashboard"
            className="flex items-center justify-center p-1.5 rounded-md border cursor-pointer transition-colors"
            style={{ background: "rgba(245,158,11,0.07)", color: "#fbbf24", border: "1px solid rgba(245,158,11,0.18)", minWidth: 26 }}
          >
            <Navigation size={10} />
          </button>
          {presence.unityRoom && (
            <button
              onClick={e => { e.stopPropagation(); onWatchUnity(presence.unityRoom!, student.name); }}
              title="Watch Unity stage"
              className="flex items-center justify-center p-1.5 rounded-md border cursor-pointer transition-colors"
              style={{ background: "rgba(34,211,238,0.07)", color: "#22d3ee", border: "1px solid rgba(34,211,238,0.2)", minWidth: 26 }}
            >
              <Eye size={10} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
