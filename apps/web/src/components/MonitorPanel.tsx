import React, { useEffect, useState, useCallback } from "react";
import { getSocket } from "../lib/ws.ts";
import { api } from "../lib/api.ts";
import { Link } from "react-router-dom";
import { useTheme } from "../lib/theme.tsx";
import { Monitor, Users, Box, Wifi, WifiOff, Lock, LockOpen, Send, LayoutGrid, List, ChevronLeft } from "lucide-react";

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

  const timeSince = (ts: number) => {
    const secs = Math.floor((Date.now() - ts) / 1000);
    if (secs < 60) return "just now";
    if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
    return `${Math.floor(secs / 3600)}h ago`;
  };

  const onlineCount = Object.values(activity).filter(a => a.isOnline).length;
  const avgBlocks = students.length ? Math.round(Object.values(activity).reduce((s, a) => s + a.blockCount, 0) / Math.max(students.length, 1)) : 0;

  const summaryStats = [
    { label: "Online", value: onlineCount, icon: <Wifi size={16} />, color: "text-emerald-400", bg: dk ? "bg-emerald-500/10" : "bg-emerald-50", border: "border-emerald-500/20" },
    { label: "Offline", value: students.length - onlineCount, icon: <WifiOff size={16} />, color: "text-red-400", bg: dk ? "bg-red-500/10" : "bg-red-50", border: "border-red-500/20" },
    { label: "Avg Blocks", value: avgBlocks, icon: <Box size={16} />, color: "text-blue-400", bg: dk ? "bg-blue-500/10" : "bg-blue-50", border: "border-blue-500/20" },
    { label: "Total Students", value: students.length, icon: <Users size={16} />, color: "text-violet-400", bg: dk ? "bg-violet-500/10" : "bg-violet-50", border: "border-violet-500/20" },
  ];

  return (
    <div className="p-8 space-y-5 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-t1">Student Monitor</h1>
          <p className="text-t3 text-sm mt-1">{onlineCount} of {students.length} students online</p>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-xs text-t3 cursor-pointer">
            <input type="checkbox" checked={autoRefresh} onChange={(e) => setAutoRefresh(e.target.checked)}
              className="rounded" />
            Auto-refresh
          </label>
          <div className="flex rounded-lg p-0.5" style={{ background: "var(--bg-hover)" }}>
            <button onClick={() => setViewMode("grid")}
              className={`px-3 py-1.5 text-xs rounded-md transition flex items-center gap-1.5 cursor-pointer ${viewMode === "grid" ? "bg-violet-600 text-white" : "text-t3"}`}>
              <LayoutGrid size={13} /> Grid
            </button>
            <button onClick={() => setViewMode("list")}
              className={`px-3 py-1.5 text-xs rounded-md transition flex items-center gap-1.5 cursor-pointer ${viewMode === "list" ? "bg-violet-600 text-white" : "text-t3"}`}>
              <List size={13} /> List
            </button>
          </div>
          <select value={classId} onChange={(e) => { setClassId(e.target.value); loadStudents(e.target.value); }}
            className="input w-44 py-2">
            {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <Link to="/teacher" className="flex items-center gap-1 text-xs text-violet-400 hover:text-violet-300">
            <ChevronLeft size={14} /> Dashboard
          </Link>
        </div>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-4 gap-3">
        {summaryStats.map((stat) => (
          <div key={stat.label} className={`rounded-xl px-4 py-3 border flex items-center gap-3 ${stat.bg} ${stat.border}`}>
            <div className={stat.color}>{stat.icon}</div>
            <div>
              <div className="text-xs text-t3">{stat.label}</div>
              <div className="text-2xl font-bold text-t1 leading-tight">{stat.value}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Grid View */}
      {viewMode === "grid" ? (
        <div className="grid grid-cols-3 gap-4">
          {students.map((s) => {
            const act = activity[s.id];
            const isOnline = act?.isOnline ?? false;
            return (
              <div
                key={s.id}
                className={`rounded-xl border transition-all cursor-pointer ${
                  selectedStudent === s.id
                    ? "border-violet-500/50 ring-1 ring-violet-500/20"
                    : ""
                }`}
                style={{
                  background: "var(--bg-surface)",
                  borderColor: selectedStudent === s.id ? undefined : "var(--border)",
                }}
                onClick={() => setSelectedStudent(selectedStudent === s.id ? null : s.id)}
              >
                {/* Screen preview */}
                <div className={`h-36 rounded-t-xl flex items-center justify-center overflow-hidden relative ${dk ? "bg-[#07071a]" : "bg-gray-100"}`}>
                  {screenshots[s.id] ? (
                    <img src={screenshots[s.id]} alt={`${s.name}'s screen`} className="w-full h-full object-cover" />
                  ) : projectPreviews[s.id] ? (
                    <img src={projectPreviews[s.id]} alt={`${s.name}'s project`} className="w-full h-full object-contain p-3 opacity-90" />
                  ) : (
                    <div className="flex flex-col items-center gap-2">
                      <Monitor size={28} className="text-t3 opacity-40" />
                      <span className="text-t3 text-xs opacity-50">No screen data</span>
                    </div>
                  )}
                  <div className={`absolute top-2 right-2 flex items-center gap-1.5 px-2 py-1 rounded-full text-[10px] font-medium ${
                    isOnline ? "bg-emerald-500/20 text-emerald-400" : dk ? "bg-white/10 text-white/30" : "bg-gray-200 text-gray-400"
                  }`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${isOnline ? "bg-emerald-400 animate-pulse" : dk ? "bg-white/20" : "bg-gray-300"}`} />
                    {isOnline ? "Online" : "Offline"}
                  </div>
                </div>

                {/* Student info */}
                <div className="p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                      {s.name.charAt(0)}
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm text-t1 font-medium truncate">{s.name}</div>
                      <div className="text-[10px] text-t3">{act ? timeSince(act.lastActive) : "—"}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 text-[11px] text-t3">
                    <span className="flex items-center gap-1"><Box size={11} /> {act?.blockCount ?? 0}</span>
                    <span className="truncate">{act?.projectName ?? "—"}</span>
                  </div>
                  {projectIds[s.id] && (
                    <div className="mt-2">
                      <Link to={`/project/${projectIds[s.id]}`} onClick={(e) => e.stopPropagation()}
                        className="text-[11px] text-violet-400 hover:text-violet-300 underline underline-offset-2">
                        Open latest project
                      </Link>
                    </div>
                  )}
                  {selectedStudent === s.id && (
                    <div className="mt-3 pt-3 border-t space-y-2" style={{ borderColor: "var(--border)" }}>
                      <div className="flex gap-2">
                        <input value={message} onChange={(e) => setMessage(e.target.value)}
                          placeholder="Send message..." className="input flex-1 py-1.5 text-xs"
                          onKeyDown={(e) => e.key === "Enter" && sendMessage(s.id)}
                          onClick={(e) => e.stopPropagation()} />
                        <button onClick={(e) => { e.stopPropagation(); sendMessage(s.id); }}
                          className="btn-primary px-2.5 py-1.5 text-xs gap-1">
                          <Send size={12} />
                        </button>
                      </div>
                      <div className="flex gap-2">
                        <button onClick={(e) => { e.stopPropagation(); lockStudent(s.id, true); }}
                          className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 bg-red-500/15 hover:bg-red-500/25 text-red-400 text-xs rounded-lg cursor-pointer transition-colors">
                          <Lock size={11} /> Lock
                        </button>
                        <button onClick={(e) => { e.stopPropagation(); lockStudent(s.id, false); }}
                          className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-400 text-xs rounded-lg cursor-pointer transition-colors">
                          <LockOpen size={11} /> Unlock
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
          {students.length === 0 && (
            <div className="col-span-3 text-center py-12">
              <Users size={36} className="mx-auto mb-3 text-t3 opacity-40" />
              <p className="text-t3 text-sm">No students in this class yet</p>
            </div>
          )}
        </div>
      ) : (
        /* List View */
        <div className="card overflow-hidden p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b" style={{ borderColor: "var(--border)" }}>
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
                  <tr key={s.id} className="border-b transition-colors" style={{ borderColor: "var(--border)" }}
                    onMouseEnter={(e) => (e.currentTarget as HTMLElement).style.background = "var(--bg-hover)"}
                    onMouseLeave={(e) => (e.currentTarget as HTMLElement).style.background = ""}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center text-white text-xs font-bold">
                          {s.name.charAt(0)}
                        </div>
                        <div>
                          <div className="text-t1 font-medium">{s.name}</div>
                          <div className="text-t3 text-xs">{s.email}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs ${
                        isOnline ? "bg-emerald-500/15 text-emerald-400" : dk ? "bg-white/5 text-white/30" : "bg-gray-100 text-gray-400"
                      }`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${isOnline ? "bg-emerald-400 animate-pulse" : dk ? "bg-white/20" : "bg-gray-300"}`} />
                        {isOnline ? "Online" : "Offline"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-t2">{act?.projectName ?? "—"}</td>
                    <td className="px-4 py-3">
                      <span className="text-t2 font-mono">{act?.blockCount ?? 0}</span>
                    </td>
                    <td className="px-4 py-3 text-t3 text-xs">{act ? timeSince(act.lastActive) : "—"}</td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1.5 items-center">
                        {projectIds[s.id] && (
                          <Link to={`/project/${projectIds[s.id]}`}
                            className="px-2 py-1 bg-violet-500/10 hover:bg-violet-500/20 text-violet-400 text-xs rounded cursor-pointer">
                            Project
                          </Link>
                        )}
                        <button onClick={() => lockStudent(s.id, true)}
                          className="px-2 py-1 bg-red-500/10 hover:bg-red-500/20 text-red-400 text-xs rounded cursor-pointer">
                          Lock
                        </button>
                        <button onClick={() => lockStudent(s.id, false)}
                          className="px-2 py-1 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 text-xs rounded cursor-pointer">
                          Unlock
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {students.length === 0 && (
            <div className="text-center py-8 text-t3 text-sm">No students in this class</div>
          )}
        </div>
      )}
    </div>
  );
}
