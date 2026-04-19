import React, { useEffect, useState, useCallback } from "react";
import { getSocket } from "../lib/ws.ts";
import { api } from "../lib/api.ts";
import { Link } from "react-router-dom";
import { useTheme } from "../lib/theme.tsx";
import {
  Monitor, Users, Box, Wifi, WifiOff, Lock, LockOpen, Send,
  LayoutGrid, List, ChevronLeft, RefreshCw, MessageSquare, ExternalLink,
} from "lucide-react";

interface StudentActivity {
  blockCount: number;
  projectName: string;
  lastActive: number;
  isOnline: boolean;
}

export default function MonitorPanel() {
  const { theme } = useTheme();
  const dk = theme === "dark";
  const [classes, setClasses] = useState<any[]>([]);
  const [classId, setClassId] = useState("");
  const [students, setStudents] = useState<any[]>([]);
  const [screenshots, setScreenshots] = useState<Record<string, string>>({});
  const [activity, setActivity] = useState<Record<string, StudentActivity>>({});
  const [projectIds, setProjectIds] = useState<Record<string, string>>({});
  const [projectPreviews, setProjectPreviews] = useState<Record<string, string>>({});
  const [selectedStudent, setSelectedStudent] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [autoRefresh, setAutoRefresh] = useState(true);

  const buildActivity = useCallback(async (cid: string, stu: any[]) => {
    const [studentProjects, classAnalytics] = await Promise.all([
      api.getStudentProjectsByClass(cid).catch(() => []),
      api.getClassAnalytics(cid).catch(() => []),
    ]);
    const projectMap = new Map<string, any>();
    for (const p of studentProjects) projectMap.set(p.userId, p);
    const ids: Record<string, string> = {};
    const previews: Record<string, string> = {};
    for (const p of studentProjects) {
      if (p?.userId && p?.id) ids[p.userId] = p.id;
      if (p?.userId && p?.previewUrl) previews[p.userId] = p.previewUrl;
    }
    setProjectIds(ids);
    setProjectPreviews(previews);
    const analyticsByUser = new Map<string, any>();
    for (const a of classAnalytics) {
      if (!analyticsByUser.has(a.user_id)) analyticsByUser.set(a.user_id, a);
    }
    const now = Date.now();
    const act: Record<string, StudentActivity> = {};
    for (const s of stu) {
      const p = projectMap.get(s.id);
      const a = analyticsByUser.get(s.id);
      const last = p?.updatedAt ? new Date(p.updatedAt).getTime() : (a?.last_active ? new Date(a.last_active).getTime() : now - 3600000);
      act[s.id] = {
        blockCount: Number(p?.blockCount ?? a?.blocks_used ?? 0),
        projectName: p?.title || a?.project_title || "No project yet",
        lastActive: Number.isFinite(last) ? last : now - 3600000,
        isOnline: now - (Number.isFinite(last) ? last : 0) < 120000,
      };
    }
    setActivity(act);
  }, []);

  useEffect(() => {
    api.getClasses().then((c) => {
      setClasses(c);
      if (c.length > 0) { setClassId(c[0].id); loadStudents(c[0].id); }
    }).catch(console.error);
  }, []);

  const loadStudents = async (cid: string) => {
    try {
      const s = await api.getStudents(cid);
      setStudents(s);
      await buildActivity(cid, s);
    } catch {
      setStudents([]);
      setActivity({});
      setProjectIds({});
      setProjectPreviews({});
    }
  };

  useEffect(() => {
    if (!autoRefresh || !classId) return;
    const iv = setInterval(() => loadStudents(classId), 5000);
    return () => clearInterval(iv);
  }, [autoRefresh, classId]);

  useEffect(() => {
    const socket = getSocket();
    const screenHandler = (data: { studentId: string; screenshot: string }) => {
      setScreenshots((prev) => ({ ...prev, [data.studentId]: data.screenshot }));
      setActivity((prev) => ({
        ...prev,
        [data.studentId]: { ...prev[data.studentId], lastActive: Date.now(), isOnline: true },
      }));
    };
    const projectHandler = (data: { userId: string; blocks?: any[] }) => {
      if (data.userId && data.blocks) {
        setActivity((prev) => ({
          ...prev,
          [data.userId]: { ...prev[data.userId], blockCount: data.blocks!.length, lastActive: Date.now(), isOnline: true },
        }));
      }
    };
    socket.on("student:screen", screenHandler);
    socket.on("project:update", projectHandler);
    return () => { socket.off("student:screen", screenHandler); socket.off("project:update", projectHandler); };
  }, []);

  const sendMessage = useCallback(async (studentId: string) => {
    const trimmed = message.trim();
    if (!trimmed || !classId) return;
    const targetName = students.find((s) => s.id === studentId)?.name || "Student";
    const text = `[To ${targetName}] ${trimmed}`;
    try { await api.sendChat(classId, text); } catch {}
    getSocket().emit("class:broadcast", { classId, message: text });
    setMessage("");
  }, [classId, message, students]);

  const lockStudent = useCallback(async (studentId: string, locked: boolean) => {
    if (!classId) return;
    try {
      await api.getControls(classId, studentId);
      await api.updateControls(classId, studentId, { screen_locked: locked });
    } catch {}
    getSocket().emit("class:lock", { classId, locked, studentId });
  }, [classId]);

  const lockAll = useCallback(() => {
    for (const s of students) lockStudent(s.id, true);
  }, [students, lockStudent]);

  const unlockAll = useCallback(() => {
    for (const s of students) lockStudent(s.id, false);
  }, [students, lockStudent]);

  const timeSince = (ts: number) => {
    const secs = Math.floor((Date.now() - ts) / 1000);
    if (secs < 60) return "just now";
    if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
    return `${Math.floor(secs / 3600)}h ago`;
  };

  const onlineCount = Object.values(activity).filter(a => a.isOnline).length;
  const avgBlocks = students.length ? Math.round(Object.values(activity).reduce((s, a) => s + a.blockCount, 0) / Math.max(students.length, 1)) : 0;

  const summaryStats = [
    {
      label: "Online",
      value: onlineCount,
      icon: <Wifi size={18} />,
      color: "text-emerald-400",
      gradient: "from-emerald-500/20 to-emerald-600/10",
      glow: "rgba(52,211,153,0.2)",
      border: "rgba(52,211,153,0.25)",
    },
    {
      label: "Offline",
      value: students.length - onlineCount,
      icon: <WifiOff size={18} />,
      color: "text-red-400",
      gradient: "from-red-500/20 to-red-600/10",
      glow: "rgba(244,63,94,0.2)",
      border: "rgba(244,63,94,0.25)",
    },
    {
      label: "Avg Blocks",
      value: avgBlocks,
      icon: <Box size={18} />,
      color: "text-blue-400",
      gradient: "from-blue-500/20 to-blue-600/10",
      glow: "rgba(56,189,248,0.2)",
      border: "rgba(56,189,248,0.25)",
    },
    {
      label: "Total Students",
      value: students.length,
      icon: <Users size={18} />,
      color: "text-violet-400",
      gradient: "from-violet-500/20 to-violet-600/10",
      glow: "rgba(167,139,250,0.2)",
      border: "rgba(167,139,250,0.25)",
    },
  ];

  return (
    <div className="p-8 space-y-5 animate-fade-in">

      {/* ── Hero Header ── */}
      <div className="rounded-2xl p-6 relative overflow-hidden" style={{
        background: dk
          ? "linear-gradient(135deg, #0f1029 0%, #171935 60%, #1a1040 100%)"
          : "linear-gradient(135deg, #eef0fa 0%, #e0e7ff 100%)",
        border: "1px solid rgba(99,102,241,0.18)",
        boxShadow: dk ? "0 0 40px rgba(99,102,241,0.08), inset 0 1px 0 rgba(255,255,255,0.04)" : "0 2px 16px rgba(99,102,241,0.10)",
      }}>
        {/* Background glow orb */}
        <div style={{
          position: "absolute", right: -60, top: -60,
          width: 240, height: 240,
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(99,102,241,0.12) 0%, transparent 70%)",
          pointerEvents: "none",
        }} />

        <div className="flex items-center justify-between relative z-10">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0" style={{
              background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
              boxShadow: "0 4px 20px rgba(99,102,241,0.4)",
            }}>
              <Monitor size={22} className="text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2.5 mb-0.5">
                <h1 className="text-2xl font-bold" style={{
                  background: "linear-gradient(135deg, #a78bfa, #6366f1)",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                }}>
                  Student Monitor
                </h1>
                {/* Live pulse indicator */}
                <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold" style={{
                  background: autoRefresh ? "rgba(52,211,153,0.15)" : "rgba(148,163,184,0.1)",
                  border: `1px solid ${autoRefresh ? "rgba(52,211,153,0.3)" : "rgba(148,163,184,0.15)"}`,
                  color: autoRefresh ? "#34d399" : "var(--text-3)",
                }}>
                  <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${autoRefresh ? "bg-emerald-400 animate-pulse" : "bg-slate-500"}`} />
                  {autoRefresh ? "LIVE" : "PAUSED"}
                </div>
              </div>
              <p style={{ color: "var(--text-3)", fontSize: 13 }}>
                {onlineCount} of {students.length} students online
              </p>
            </div>
          </div>

          {/* Controls */}
          <div className="flex items-center gap-2.5">
            {/* Lock All / Unlock All */}
            {students.length > 0 && (
              <>
                <button
                  onClick={lockAll}
                  data-no-hover
                  className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg cursor-pointer transition-colors"
                  style={{
                    background: "rgba(244,63,94,0.15)",
                    border: "1px solid rgba(244,63,94,0.3)",
                    color: "#f43f5e",
                  }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "rgba(244,63,94,0.25)"; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "rgba(244,63,94,0.15)"; }}
                >
                  <Lock size={13} /> Lock All
                </button>
                <button
                  onClick={unlockAll}
                  data-no-hover
                  className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg cursor-pointer transition-colors"
                  style={{
                    background: "rgba(52,211,153,0.15)",
                    border: "1px solid rgba(52,211,153,0.3)",
                    color: "#34d399",
                  }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "rgba(52,211,153,0.25)"; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "rgba(52,211,153,0.15)"; }}
                >
                  <LockOpen size={13} /> Unlock All
                </button>
              </>
            )}

            {/* Auto-refresh toggle */}
            <button
              data-no-hover
              onClick={() => setAutoRefresh(v => !v)}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg cursor-pointer transition-colors"
              style={{
                background: autoRefresh ? "rgba(99,102,241,0.15)" : "var(--bg-hover)",
                border: "1px solid " + (autoRefresh ? "rgba(99,102,241,0.3)" : "var(--border)"),
                color: autoRefresh ? "var(--text-accent)" : "var(--text-3)",
              }}
            >
              <RefreshCw size={12} className={autoRefresh ? "animate-spin" : ""} style={{ animationDuration: "3s" }} />
              Auto
            </button>

            {/* View mode switcher */}
            <div className="flex rounded-lg p-0.5" style={{ background: "var(--bg-hover)" }}>
              <button data-no-hover onClick={() => setViewMode("grid")}
                className={`px-3 py-1.5 text-xs rounded-md transition flex items-center gap-1.5 cursor-pointer ${viewMode === "grid" ? "bg-violet-600 text-white" : "text-t3"}`}>
                <LayoutGrid size={13} /> Grid
              </button>
              <button data-no-hover onClick={() => setViewMode("list")}
                className={`px-3 py-1.5 text-xs rounded-md transition flex items-center gap-1.5 cursor-pointer ${viewMode === "list" ? "bg-violet-600 text-white" : "text-t3"}`}>
                <List size={13} /> List
              </button>
            </div>

            <select value={classId} onChange={(e) => { setClassId(e.target.value); loadStudents(e.target.value); }}
              className="input w-44 py-2">
              {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>

            <Link to="/teacher" className="flex items-center gap-1 text-xs" style={{ color: "var(--text-accent)" }}>
              <ChevronLeft size={14} /> Dashboard
            </Link>
          </div>
        </div>
      </div>

      {/* ── Summary Stats ── */}
      <div className="grid grid-cols-4 gap-3">
        {summaryStats.map((stat) => (
          <div key={stat.label} className="rounded-xl p-4 relative overflow-hidden" style={{
            background: dk
              ? `linear-gradient(135deg, var(--bg-surface), var(--bg-raised))`
              : "white",
            border: `1px solid ${stat.border}`,
            boxShadow: `0 2px 16px ${stat.glow}, inset 0 1px 0 rgba(255,255,255,0.04)`,
          }}>
            <div style={{
              position: "absolute", top: -20, right: -20,
              width: 80, height: 80, borderRadius: "50%",
              background: `radial-gradient(circle, ${stat.glow} 0%, transparent 70%)`,
              pointerEvents: "none",
            }} />
            <div className="relative z-10">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-3 ${stat.color}`} style={{
                background: `${stat.glow.replace("0.2", "0.15")}`,
                border: `1px solid ${stat.border}`,
              }}>
                {stat.icon}
              </div>
              <div className="text-3xl font-black leading-none mb-1" style={{ color: "var(--text-1)" }}>
                {stat.value}
              </div>
              <div className="text-xs font-medium" style={{ color: "var(--text-3)" }}>{stat.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* ── Grid View ── */}
      {viewMode === "grid" ? (
        <div className="grid grid-cols-3 gap-4">
          {students.map((s) => {
            const act = activity[s.id];
            const isOnline = act?.isOnline ?? false;
            const isSelected = selectedStudent === s.id;
            return (
              <div
                key={s.id}
                className="group rounded-xl border transition-all cursor-pointer overflow-hidden"
                style={{
                  background: "var(--bg-surface)",
                  borderColor: isSelected ? "rgba(99,102,241,0.5)" : "var(--border)",
                  boxShadow: isSelected
                    ? "0 0 0 1px rgba(99,102,241,0.2), 0 4px 20px rgba(99,102,241,0.12)"
                    : "none",
                  transform: isSelected ? "translateY(-2px)" : undefined,
                }}
                onClick={() => setSelectedStudent(isSelected ? null : s.id)}
              >
                {/* Screen preview — taller, with overlay toolbar */}
                <div className="h-44 relative overflow-hidden" style={{
                  background: dk ? "#07071a" : "#f1f5f9",
                }}>
                  {screenshots[s.id] ? (
                    <img src={screenshots[s.id]} alt={`${s.name}'s screen`} className="w-full h-full object-cover" />
                  ) : projectPreviews[s.id] ? (
                    <img src={projectPreviews[s.id]} alt={`${s.name}'s project`} className="w-full h-full object-contain p-3 opacity-90" />
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center gap-2">
                      <Monitor size={32} style={{ color: "var(--text-3)", opacity: 0.35 }} />
                      <span style={{ color: "var(--text-3)", fontSize: 11, opacity: 0.5 }}>No screen data</span>
                    </div>
                  )}

                  {/* Online badge */}
                  <div className="absolute top-2 left-2 flex items-center gap-1.5 px-2 py-1 rounded-full text-[10px] font-semibold backdrop-blur-sm" style={{
                    background: isOnline ? "rgba(52,211,153,0.2)" : "rgba(0,0,0,0.4)",
                    border: `1px solid ${isOnline ? "rgba(52,211,153,0.35)" : "rgba(255,255,255,0.08)"}`,
                    color: isOnline ? "#34d399" : "rgba(255,255,255,0.4)",
                  }}>
                    <span className={`w-1.5 h-1.5 rounded-full ${isOnline ? "bg-emerald-400 animate-pulse" : "bg-white/20"}`} />
                    {isOnline ? "Online" : "Offline"}
                  </div>

                  {/* Hover icon toolbar — appears on card hover */}
                  <div className="absolute top-2 right-2 flex gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                    <button
                      data-no-hover
                      onClick={e => { e.stopPropagation(); lockStudent(s.id, true); }}
                      className="w-7 h-7 flex items-center justify-center rounded-lg cursor-pointer backdrop-blur-sm transition-colors"
                      style={{ background: "rgba(244,63,94,0.2)", border: "1px solid rgba(244,63,94,0.3)", color: "#f43f5e" }}
                      title="Lock"
                    >
                      <Lock size={12} />
                    </button>
                    <button
                      data-no-hover
                      onClick={e => { e.stopPropagation(); lockStudent(s.id, false); }}
                      className="w-7 h-7 flex items-center justify-center rounded-lg cursor-pointer backdrop-blur-sm transition-colors"
                      style={{ background: "rgba(52,211,153,0.2)", border: "1px solid rgba(52,211,153,0.3)", color: "#34d399" }}
                      title="Unlock"
                    >
                      <LockOpen size={12} />
                    </button>
                    <button
                      data-no-hover
                      onClick={e => { e.stopPropagation(); setSelectedStudent(isSelected ? null : s.id); }}
                      className="w-7 h-7 flex items-center justify-center rounded-lg cursor-pointer backdrop-blur-sm transition-colors"
                      style={{ background: "rgba(99,102,241,0.2)", border: "1px solid rgba(99,102,241,0.3)", color: "#a78bfa" }}
                      title="Message"
                    >
                      <MessageSquare size={12} />
                    </button>
                    {projectIds[s.id] && (
                      <Link
                        to={`/project/${projectIds[s.id]}`}
                        onClick={e => e.stopPropagation()}
                        className="w-7 h-7 flex items-center justify-center rounded-lg cursor-pointer backdrop-blur-sm transition-colors"
                        style={{ background: "rgba(56,189,248,0.2)", border: "1px solid rgba(56,189,248,0.3)", color: "#38bdf8" }}
                        title="Open project"
                      >
                        <ExternalLink size={12} />
                      </Link>
                    )}
                  </div>

                  {/* Student name overlay at bottom — blurred bg */}
                  <div className="absolute bottom-0 left-0 right-0 px-3 py-2 backdrop-blur-md" style={{
                    background: "linear-gradient(to top, rgba(7,7,26,0.85) 0%, rgba(7,7,26,0.4) 70%, transparent 100%)",
                  }}>
                    <div className="flex items-center gap-2">
                      <div className="w-5 h-5 rounded-md bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center text-white text-[9px] font-bold flex-shrink-0">
                        {s.name.charAt(0)}
                      </div>
                      <span className="text-xs font-semibold text-white truncate">{s.name}</span>
                      <span className="text-[10px] ml-auto flex-shrink-0" style={{ color: "rgba(255,255,255,0.45)" }}>
                        {act ? timeSince(act.lastActive) : "—"}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Student info row */}
                <div className="px-3 py-2.5">
                  <div className="flex items-center gap-3 text-[11px]" style={{ color: "var(--text-3)" }}>
                    <span className="flex items-center gap-1">
                      <Box size={11} /> {act?.blockCount ?? 0} blocks
                    </span>
                    <span className="truncate">{act?.projectName ?? "—"}</span>
                  </div>

                  {/* Expanded message panel when selected */}
                  {isSelected && (
                    <div className="mt-2.5 pt-2.5 border-t space-y-2 animate-scale-in" style={{ borderColor: "var(--border)" }}>
                      <div className="flex gap-2">
                        <input value={message} onChange={(e) => setMessage(e.target.value)}
                          placeholder="Send message..." className="input flex-1 py-1.5 text-xs"
                          onKeyDown={(e) => e.key === "Enter" && sendMessage(s.id)}
                          onClick={(e) => e.stopPropagation()} />
                        <button data-no-hover onClick={(e) => { e.stopPropagation(); sendMessage(s.id); }}
                          className="btn-primary px-2.5 py-1.5 text-xs gap-1">
                          <Send size={12} />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
          {students.length === 0 && (
            <div className="col-span-3 text-center py-16">
              <Users size={40} className="mx-auto mb-3" style={{ color: "var(--text-3)", opacity: 0.35 }} />
              <p className="text-sm" style={{ color: "var(--text-3)" }}>No students in this class yet</p>
            </div>
          )}
        </div>
      ) : (
        /* ── List View ── */
        <div className="card overflow-hidden p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b" style={{ borderColor: "var(--border)", background: "var(--bg-muted)" }}>
                {["Student", "Status", "Project", "Blocks", "Last Active", "Actions"].map((h) => (
                  <th key={h} className="text-left table-header px-4 py-3">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {students.map((s) => {
                const act = activity[s.id];
                const isOnline = act?.isOnline ?? false;
                return (
                  <tr key={s.id} className="border-b" style={{ borderColor: "var(--border)" }}
                    onMouseEnter={(e) => (e.currentTarget as HTMLElement).style.background = "var(--bg-hover)"}
                    onMouseLeave={(e) => (e.currentTarget as HTMLElement).style.background = ""}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center text-white text-xs font-bold">
                          {s.name.charAt(0)}
                        </div>
                        <div>
                          <div style={{ color: "var(--text-1)", fontWeight: 500 }}>{s.name}</div>
                          <div style={{ color: "var(--text-3)", fontSize: 11 }}>{s.email}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs" style={{
                        background: isOnline ? "rgba(52,211,153,0.12)" : dk ? "rgba(255,255,255,0.05)" : "#f1f5f9",
                        color: isOnline ? "#34d399" : dk ? "rgba(255,255,255,0.25)" : "#94a3b8",
                        border: `1px solid ${isOnline ? "rgba(52,211,153,0.25)" : "transparent"}`,
                      }}>
                        <span className={`w-1.5 h-1.5 rounded-full ${isOnline ? "bg-emerald-400 animate-pulse" : dk ? "bg-white/20" : "bg-gray-300"}`} />
                        {isOnline ? "Online" : "Offline"}
                      </span>
                    </td>
                    <td className="px-4 py-3" style={{ color: "var(--text-2)" }}>{act?.projectName ?? "—"}</td>
                    <td className="px-4 py-3">
                      <span className="font-mono" style={{ color: "var(--text-2)" }}>{act?.blockCount ?? 0}</span>
                    </td>
                    <td className="px-4 py-3 text-xs" style={{ color: "var(--text-3)" }}>{act ? timeSince(act.lastActive) : "—"}</td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1.5 items-center">
                        {projectIds[s.id] && (
                          <Link to={`/project/${projectIds[s.id]}`}
                            className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs cursor-pointer transition-colors"
                            style={{ background: "rgba(99,102,241,0.1)", color: "#a78bfa" }}>
                            <ExternalLink size={10} /> Project
                          </Link>
                        )}
                        <button data-no-hover onClick={() => lockStudent(s.id, true)}
                          className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs cursor-pointer transition-colors"
                          style={{ background: "rgba(244,63,94,0.1)", color: "#f43f5e" }}
                          onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "rgba(244,63,94,0.2)"}
                          onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = "rgba(244,63,94,0.1)"}>
                          <Lock size={10} /> Lock
                        </button>
                        <button data-no-hover onClick={() => lockStudent(s.id, false)}
                          className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs cursor-pointer transition-colors"
                          style={{ background: "rgba(52,211,153,0.1)", color: "#34d399" }}
                          onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "rgba(52,211,153,0.2)"}
                          onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = "rgba(52,211,153,0.1)"}>
                          <LockOpen size={10} /> Unlock
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {students.length === 0 && (
            <div className="text-center py-8 text-sm" style={{ color: "var(--text-3)" }}>No students in this class</div>
          )}
        </div>
      )}
    </div>
  );
}
