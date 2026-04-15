import React, { useEffect, useState, useCallback } from "react";
import { getSocket } from "../lib/ws.ts";
import { api } from "../lib/api.ts";
import { Link } from "react-router-dom";

interface StudentActivity {
  blockCount: number;
  projectName: string;
  lastActive: number; // timestamp
  isOnline: boolean;
}

export default function MonitorPanel() {
  const [classes, setClasses] = useState<any[]>([]);
  const [classId, setClassId] = useState("");
  const [students, setStudents] = useState<any[]>([]);
  const [screenshots, setScreenshots] = useState<Record<string, string>>({});
  const [activity, setActivity] = useState<Record<string, StudentActivity>>({});
  const [selectedStudent, setSelectedStudent] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [autoRefresh, setAutoRefresh] = useState(true);

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
      // Initialize activity with mock data based on student count
      const act: Record<string, StudentActivity> = {};
      s.forEach((stu: any, i: number) => {
        act[stu.id] = {
          blockCount: Math.floor(Math.random() * 30) + 5,
          projectName: ["My Game", "Animation", "Quiz", "Story"][i % 4],
          lastActive: Date.now() - Math.floor(Math.random() * 300000),
          isOnline: Math.random() > 0.3,
        };
      });
      setActivity(act);
    } catch {
      setStudents([]);
    }
  };

  // Auto-refresh student list
  useEffect(() => {
    if (!autoRefresh || !classId) return;
    const iv = setInterval(() => loadStudents(classId), 15000);
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
          [data.userId]: {
            ...prev[data.userId],
            blockCount: data.blocks!.length,
            lastActive: Date.now(),
            isOnline: true,
          },
        }));
      }
    };
    socket.on("student:screen", screenHandler);
    socket.on("project:update", projectHandler);
    return () => { socket.off("student:screen", screenHandler); socket.off("project:update", projectHandler); };
  }, []);

  const sendMessage = useCallback((studentId: string) => {
    if (!message.trim()) return;
    getSocket().emit("class:broadcast", { classId, message: `[To ${students.find(s => s.id === studentId)?.name}] ${message.trim()}` });
    setMessage("");
  }, [classId, message, students]);

  const lockStudent = useCallback((studentId: string, locked: boolean) => {
    getSocket().emit("class:lock", { classId, locked, studentId });
  }, [classId]);

  const timeSince = (ts: number) => {
    const secs = Math.floor((Date.now() - ts) / 1000);
    if (secs < 60) return "just now";
    if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
    return `${Math.floor(secs / 3600)}h ago`;
  };

  const onlineCount = Object.values(activity).filter(a => a.isOnline).length;

  return (
    <div className="p-8 space-y-5 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white">Student Monitor</h1>
          <p className="text-white/40 text-sm mt-1">
            {onlineCount} of {students.length} students online
          </p>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-xs text-white/40 cursor-pointer">
            <input type="checkbox" checked={autoRefresh} onChange={(e) => setAutoRefresh(e.target.checked)}
              className="rounded border-white/20 bg-white/5" />
            Auto-refresh
          </label>
          <div className="flex bg-white/[0.06] rounded-lg p-0.5">
            <button onClick={() => setViewMode("grid")}
              className={`px-3 py-1.5 text-xs rounded-md transition ${viewMode === "grid" ? "bg-violet-600 text-white" : "text-white/40"}`}>
              Grid
            </button>
            <button onClick={() => setViewMode("list")}
              className={`px-3 py-1.5 text-xs rounded-md transition ${viewMode === "list" ? "bg-violet-600 text-white" : "text-white/40"}`}>
              List
            </button>
          </div>
          <select value={classId} onChange={(e) => { setClassId(e.target.value); loadStudents(e.target.value); }}
            className="bg-white/[0.06] border border-white/[0.08] rounded-xl px-4 py-2.5 text-white text-sm focus:border-violet-500/50 focus:outline-none">
            {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <Link to="/teacher" className="text-xs text-violet-400 hover:text-violet-300">← Dashboard</Link>
        </div>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: "Online", value: onlineCount, color: "emerald", icon: "●" },
          { label: "Offline", value: students.length - onlineCount, color: "red", icon: "○" },
          { label: "Avg Blocks", value: students.length ? Math.round(Object.values(activity).reduce((s, a) => s + a.blockCount, 0) / Math.max(students.length, 1)) : 0, color: "blue", icon: "◆" },
          { label: "Total Students", value: students.length, color: "violet", icon: "◈" },
        ].map((stat) => (
          <div key={stat.label} className="bg-white/[0.04] rounded-xl px-4 py-3 border border-white/[0.06]">
            <div className="flex items-center gap-2 mb-1">
              <span className={`text-${stat.color}-400 text-xs`}>{stat.icon}</span>
              <span className="text-white/40 text-xs">{stat.label}</span>
            </div>
            <span className="text-2xl font-bold text-white">{stat.value}</span>
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
              <div key={s.id} className={`bg-white/[0.03] rounded-xl border transition-all cursor-pointer ${
                selectedStudent === s.id
                  ? "border-violet-500/40 ring-1 ring-violet-500/20"
                  : "border-white/[0.06] hover:border-white/[0.12]"
              }`} onClick={() => setSelectedStudent(selectedStudent === s.id ? null : s.id)}>
                {/* Screen preview */}
                <div className="h-36 rounded-t-xl bg-[#0a0a1a] flex items-center justify-center overflow-hidden relative">
                  {screenshots[s.id] ? (
                    <img src={screenshots[s.id]} alt={`${s.name}'s screen`} className="w-full h-full object-cover" />
                  ) : (
                    <div className="flex flex-col items-center gap-2">
                      <span className="text-2xl">🖥️</span>
                      <span className="text-white/15 text-xs">No screen data</span>
                    </div>
                  )}
                  {/* Status badge */}
                  <div className={`absolute top-2 right-2 flex items-center gap-1.5 px-2 py-1 rounded-full text-[10px] font-medium ${
                    isOnline ? "bg-emerald-500/20 text-emerald-300" : "bg-red-500/20 text-red-300"
                  }`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${isOnline ? "bg-emerald-400 animate-pulse" : "bg-red-400"}`} />
                    {isOnline ? "Online" : "Offline"}
                  </div>
                </div>

                {/* Student info */}
                <div className="p-3">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center text-white text-xs font-bold">
                        {s.name.charAt(0)}
                      </div>
                      <div>
                        <div className="text-sm text-white font-medium">{s.name}</div>
                        <div className="text-[10px] text-white/25">{act ? timeSince(act.lastActive) : "—"}</div>
                      </div>
                    </div>
                  </div>

                  {/* Activity stats */}
                  <div className="flex items-center gap-3 text-[11px] text-white/35">
                    <span>🧩 {act?.blockCount ?? 0} blocks</span>
                    <span>📁 {act?.projectName ?? "—"}</span>
                  </div>

                  {/* Expanded controls */}
                  {selectedStudent === s.id && (
                    <div className="mt-3 pt-3 border-t border-white/[0.06] space-y-2">
                      <div className="flex gap-2">
                        <input value={message} onChange={(e) => setMessage(e.target.value)}
                          placeholder="Send message..."
                          className="flex-1 px-2.5 py-1.5 bg-white/[0.06] border border-white/[0.08] rounded-lg text-xs text-white placeholder-white/20 focus:outline-none focus:ring-1 focus:ring-violet-500/50"
                          onKeyDown={(e) => e.key === "Enter" && sendMessage(s.id)}
                          onClick={(e) => e.stopPropagation()} />
                        <button onClick={(e) => { e.stopPropagation(); sendMessage(s.id); }}
                          className="px-3 py-1.5 bg-violet-600 hover:bg-violet-500 text-white text-xs rounded-lg font-medium">Send</button>
                      </div>
                      <div className="flex gap-2">
                        <button onClick={(e) => { e.stopPropagation(); lockStudent(s.id, true); }}
                          className="flex-1 px-2 py-1.5 bg-red-500/15 hover:bg-red-500/25 text-red-300 text-xs rounded-lg">🔒 Lock</button>
                        <button onClick={(e) => { e.stopPropagation(); lockStudent(s.id, false); }}
                          className="flex-1 px-2 py-1.5 bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 text-xs rounded-lg">🔓 Unlock</button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
          {students.length === 0 && (
            <div className="col-span-3 text-center py-12">
              <span className="text-3xl block mb-3">👀</span>
              <p className="text-white/30 text-sm">No students in this class yet</p>
            </div>
          )}
        </div>
      ) : (
        /* List View */
        <div className="bg-white/[0.03] rounded-xl border border-white/[0.06] overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/[0.06]">
                <th className="text-left text-white/40 text-xs font-medium px-4 py-3">Student</th>
                <th className="text-left text-white/40 text-xs font-medium px-4 py-3">Status</th>
                <th className="text-left text-white/40 text-xs font-medium px-4 py-3">Project</th>
                <th className="text-left text-white/40 text-xs font-medium px-4 py-3">Blocks</th>
                <th className="text-left text-white/40 text-xs font-medium px-4 py-3">Last Active</th>
                <th className="text-left text-white/40 text-xs font-medium px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {students.map((s) => {
                const act = activity[s.id];
                const isOnline = act?.isOnline ?? false;
                return (
                  <tr key={s.id} className="border-b border-white/[0.04] hover:bg-white/[0.02]">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center text-white text-xs font-bold">
                          {s.name.charAt(0)}
                        </div>
                        <div>
                          <div className="text-white font-medium">{s.name}</div>
                          <div className="text-white/25 text-xs">{s.email}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs ${
                        isOnline ? "bg-emerald-500/15 text-emerald-300" : "bg-white/5 text-white/30"
                      }`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${isOnline ? "bg-emerald-400 animate-pulse" : "bg-white/20"}`} />
                        {isOnline ? "Online" : "Offline"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-white/50">{act?.projectName ?? "—"}</td>
                    <td className="px-4 py-3">
                      <span className="text-white/60 font-mono">{act?.blockCount ?? 0}</span>
                    </td>
                    <td className="px-4 py-3 text-white/35 text-xs">{act ? timeSince(act.lastActive) : "—"}</td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1.5">
                        <button onClick={() => lockStudent(s.id, true)} className="px-2 py-1 bg-red-500/10 hover:bg-red-500/20 text-red-300 text-xs rounded">Lock</button>
                        <button onClick={() => lockStudent(s.id, false)} className="px-2 py-1 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 text-xs rounded">Unlock</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {students.length === 0 && (
            <div className="text-center py-8 text-white/30 text-sm">No students in this class</div>
          )}
        </div>
      )}
    </div>
  );
}
