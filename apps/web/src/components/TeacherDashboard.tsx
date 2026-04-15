import React, { useEffect, useState } from "react";
import { useAuth } from "../lib/auth.tsx";
import { api } from "../lib/api.ts";
import { Link } from "react-router-dom";
import { getSocket } from "../lib/ws.ts";

export default function TeacherDashboard() {
  const { user } = useAuth();
  const [classes, setClasses] = useState<any[]>([]);
  const [newClassName, setNewClassName] = useState("");
  const [selectedClass, setSelectedClass] = useState<any>(null);
  const [students, setStudents] = useState<any[]>([]);
  const [announcement, setAnnouncement] = useState("");
  const [recentActivity, setRecentActivity] = useState<{ name: string; action: string; time: string }[]>([]);

  useEffect(() => {
    api.getClasses().then((c) => {
      setClasses(c);
      if (c.length > 0) { setSelectedClass(c[0]); loadStudents(c[0].id); }
    }).catch(console.error);
  }, []);

  useEffect(() => {
    const socket = getSocket();
    const handler = (data: any) => {
      setRecentActivity((prev) => [
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
    setClasses((prev) => [cls, ...prev]);
    setNewClassName("");
  };

  const handleBroadcast = () => {
    if (!announcement.trim() || !selectedClass) return;
    getSocket().emit("class:broadcast", { classId: selectedClass.id, message: announcement.trim() });
    setAnnouncement("");
  };

  const handleLockScreens = (locked: boolean) => {
    if (!selectedClass) return;
    getSocket().emit("class:lock", { classId: selectedClass.id, locked });
  };

  return (
    <div className="p-8 space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white">Teacher Dashboard</h1>
          <p className="text-white/40 text-sm mt-1">Manage your classes and students</p>
        </div>
        <span className="text-white/30 text-sm">Welcome, {user?.name}</span>
      </div>

      {/* Quick-access cards */}
      <div className="grid grid-cols-5 gap-4">
        {[
          { path: "/monitor", icon: "👁", label: "Monitor", desc: "Live view", gradient: "from-pink-500 to-rose-600" },
          { path: "/assignments", icon: "✎", label: "Assignments", desc: "Create & manage", gradient: "from-violet-500 to-indigo-600" },
          { path: "/quizzes", icon: "?", label: "Quizzes", desc: "Build & grade", gradient: "from-blue-500 to-cyan-600" },
          { path: "/grading", icon: "✓", label: "Grading", desc: "Review work", gradient: "from-emerald-500 to-green-600" },
          { path: "/analytics", icon: "◎", label: "Analytics", desc: "View reports", gradient: "from-amber-500 to-orange-600" },
        ].map((item) => (
          <Link key={item.path} to={item.path}
            className="card-hover flex items-center gap-4">
            <div className={`stat-icon bg-gradient-to-br ${item.gradient}`}>
              <span className="text-white text-lg">{item.icon}</span>
            </div>
            <div>
              <div className="font-semibold text-white">{item.label}</div>
              <div className="text-xs text-white/30">{item.desc}</div>
            </div>
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-4">
        {/* Classes panel */}
        <div className="card">
          <h2 className="text-sm font-semibold text-white/80 mb-3">My Classes</h2>
          <div className="flex gap-2 mb-3">
            <input value={newClassName} onChange={(e) => setNewClassName(e.target.value)}
              placeholder="New class name..." className="input text-sm flex-1"
              onKeyDown={(e) => e.key === "Enter" && handleCreateClass()} />
            <button onClick={handleCreateClass} className="btn-primary text-xs px-3">Create</button>
          </div>
          <div className="space-y-1.5">
            {classes.map((cls) => (
              <button key={cls.id}
                onClick={() => { setSelectedClass(cls); loadStudents(cls.id); }}
                className={`w-full text-left px-3 py-2.5 rounded-xl transition-all text-sm ${
                  selectedClass?.id === cls.id
                    ? "bg-gradient-to-r from-violet-600/20 to-indigo-600/20 text-violet-300 border border-violet-500/20"
                    : "text-white/60 hover:text-white hover:bg-white/[0.04]"
                }`}>
                <div className="font-medium">{cls.name}</div>
                <div className="text-xs text-white/30 font-mono">Code: {cls.code}</div>
              </button>
            ))}
            {classes.length === 0 && <p className="text-white/30 text-xs text-center py-4">No classes yet</p>}
          </div>
        </div>

        {/* Main panel */}
        <div className="col-span-2 space-y-4">
          {selectedClass && (
            <>
              {/* Controls */}
              <div className="card">
                <h3 className="text-sm font-semibold text-white/80 mb-3">Classroom Controls</h3>
                <div className="flex gap-2 mb-3">
                  <input value={announcement} onChange={(e) => setAnnouncement(e.target.value)}
                    placeholder="Type announcement..." className="input text-sm flex-1"
                    onKeyDown={(e) => e.key === "Enter" && handleBroadcast()} />
                  <button onClick={handleBroadcast} className="btn-primary text-xs px-4">Broadcast</button>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => handleLockScreens(true)} className="btn-danger text-xs py-2 px-3">🔒 Lock Screens</button>
                  <button onClick={() => handleLockScreens(false)} className="btn-secondary text-xs py-2 px-3">🔓 Unlock</button>
                  <Link to="/monitor" className="ml-auto flex items-center gap-2 px-4 py-2 bg-pink-600/20 hover:bg-pink-600/30 text-pink-300 text-xs rounded-xl font-medium transition">
                    👁 Open Monitor
                  </Link>
                </div>
              </div>

              {/* Students */}
              <div className="card">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-white/80">
                    Students ({students.length})
                  </h3>
                  <Link to="/monitor" className="text-xs text-violet-400 hover:text-violet-300">View all in monitor →</Link>
                </div>
                <div className="space-y-2">
                  {students.map((s) => (
                    <div key={s.id} className="flex items-center justify-between bg-white/[0.03] rounded-xl px-4 py-3 border border-white/[0.04] group hover:border-white/[0.08] transition">
                      <div className="flex items-center gap-3">
                        <div className="relative">
                          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-500 to-green-600 flex items-center justify-center text-white text-sm font-bold shadow-lg">
                            {s.name.charAt(0)}
                          </div>
                          <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-400 border-2 border-[#16163a] animate-pulse" />
                        </div>
                        <div>
                          <div className="text-sm text-white font-medium">{s.name}</div>
                          <div className="text-xs text-white/30">{s.email}</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-xs text-white/20 opacity-0 group-hover:opacity-100 transition">🧩 blocks</span>
                        <Link to="/monitor" className="text-xs text-violet-400 hover:text-violet-300">Monitor</Link>
                      </div>
                    </div>
                  ))}
                  {students.length === 0 && (
                    <p className="text-white/30 text-sm text-center py-6">
                      No students yet. Share code <strong className="text-violet-400 font-mono">{selectedClass.code}</strong>
                    </p>
                  )}
                </div>
              </div>

              {/* Recent Activity Feed */}
              <div className="card">
                <h3 className="text-sm font-semibold text-white/80 mb-3">Recent Activity</h3>
                {recentActivity.length > 0 ? (
                  <div className="space-y-2">
                    {recentActivity.map((a, i) => (
                      <div key={i} className="flex items-center gap-3 text-xs text-white/40 py-1.5 border-b border-white/[0.03] last:border-0">
                        <span className="w-1.5 h-1.5 rounded-full bg-violet-400/60 flex-shrink-0" />
                        <span><strong className="text-white/60">{a.name}</strong> {a.action}</span>
                        <span className="ml-auto text-white/20">{a.time}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-white/20 text-xs text-center py-4">Activity will appear here as students work</p>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
