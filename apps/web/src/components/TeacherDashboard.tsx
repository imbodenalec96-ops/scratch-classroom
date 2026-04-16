import React, { useEffect, useState } from "react";
import { useAuth } from "../lib/auth.tsx";
import { useTheme } from "../lib/theme.tsx";
import { api } from "../lib/api.ts";
import { Link } from "react-router-dom";
import { getSocket } from "../lib/ws.ts";
import {
  Monitor, ClipboardList, HelpCircle, CheckSquare, BarChart3,
  Lock, LockOpen, Megaphone, Eye, Users, Plus, Activity,
} from "lucide-react";

export default function TeacherDashboard() {
  const { user } = useAuth();
  const { theme } = useTheme();
  const dk = theme === "dark";
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

  const handleLockScreens = async (locked: boolean) => {
    if (!selectedClass) return;
    for (const s of students) {
      try { await api.updateControls(selectedClass.id, s.id, { screen_locked: locked }); }
      catch { /* ignore */ }
    }
    getSocket().emit("class:lock", { classId: selectedClass.id, locked });
  };

  const TOOLS = [
    { path: "/monitor",     icon: Monitor,      label: "Monitor",     desc: "Live view",      color: "text-pink-400",    bg: dk ? "bg-pink-500/10"    : "bg-pink-50"    },
    { path: "/assignments", icon: ClipboardList,label: "Assignments", desc: "Create & manage",color: "text-violet-400",  bg: dk ? "bg-violet-500/10"  : "bg-violet-50"  },
    { path: "/quizzes",     icon: HelpCircle,   label: "Quizzes",     desc: "Build & grade",  color: "text-blue-400",    bg: dk ? "bg-blue-500/10"    : "bg-blue-50"    },
    { path: "/grading",     icon: CheckSquare,  label: "Grading",     desc: "Review work",    color: "text-emerald-400", bg: dk ? "bg-emerald-500/10" : "bg-emerald-50" },
    { path: "/analytics",   icon: BarChart3,    label: "Analytics",   desc: "View reports",   color: "text-amber-400",   bg: dk ? "bg-amber-500/10"   : "bg-amber-50"   },
  ];

  return (
    <div className="p-7 space-y-6 animate-page-enter">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className={`text-2xl font-bold tracking-tight ${dk ? "text-white" : "text-gray-900"}`}>
            Teacher Dashboard
          </h1>
          <p className={`text-sm mt-0.5 ${dk ? "text-white/40" : "text-gray-500"}`}>
            Welcome back, {user?.name}
          </p>
        </div>
      </div>

      {/* Quick-access tools */}
      <div className="grid grid-cols-5 gap-3">
        {TOOLS.map((item) => (
          <Link
            key={item.path}
            to={item.path}
            className="card-hover flex items-center gap-3"
          >
            <div className={`stat-icon ${item.bg}`}>
              <item.icon size={18} className={item.color} />
            </div>
            <div className="min-w-0">
              <div className={`font-semibold text-sm ${dk ? "text-white" : "text-gray-900"}`}>{item.label}</div>
              <div className={`text-xs truncate ${dk ? "text-white/30" : "text-gray-400"}`}>{item.desc}</div>
            </div>
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-4">
        {/* Classes panel */}
        <div className="card">
          <h2 className={`text-sm font-semibold mb-3 ${dk ? "text-white/70" : "text-gray-700"}`}>My Classes</h2>
          <div className="flex gap-2 mb-3">
            <input
              value={newClassName}
              onChange={(e) => setNewClassName(e.target.value)}
              placeholder="Class name…"
              className="input text-sm flex-1"
              onKeyDown={(e) => e.key === "Enter" && handleCreateClass()}
            />
            <button onClick={handleCreateClass} className="btn-primary px-3 gap-1">
              <Plus size={14} />
            </button>
          </div>
          <div className="space-y-1">
            {classes.map((cls) => (
              <button
                key={cls.id}
                onClick={() => { setSelectedClass(cls); loadStudents(cls.id); }}
                className={`w-full text-left px-3 py-2.5 rounded-xl transition-all text-sm cursor-pointer ${
                  selectedClass?.id === cls.id
                    ? "bg-violet-600/15 text-violet-300 border border-violet-500/20"
                    : dk
                      ? "text-white/55 hover:text-white hover:bg-white/[0.04]"
                      : "text-gray-600 hover:text-gray-900 hover:bg-gray-100"
                }`}
              >
                <div className="font-medium leading-tight">{cls.name}</div>
                <div className={`text-xs font-mono mt-0.5 ${dk ? "text-white/25" : "text-gray-400"}`}>
                  {cls.code}
                </div>
              </button>
            ))}
            {classes.length === 0 && (
              <p className={`text-xs text-center py-6 ${dk ? "text-white/25" : "text-gray-400"}`}>
                No classes yet
              </p>
            )}
          </div>
        </div>

        {/* Main panel */}
        <div className="col-span-2 space-y-4">
          {selectedClass ? (
            <>
              {/* Classroom controls */}
              <div className="card">
                <h3 className={`text-sm font-semibold mb-3 ${dk ? "text-white/70" : "text-gray-700"}`}>
                  Classroom Controls
                  <span className={`ml-2 text-xs font-normal ${dk ? "text-white/25" : "text-gray-400"}`}>
                    {selectedClass.name}
                  </span>
                </h3>
                <div className="flex gap-2 mb-3">
                  <input
                    value={announcement}
                    onChange={(e) => setAnnouncement(e.target.value)}
                    placeholder="Type announcement…"
                    className="input text-sm flex-1"
                    onKeyDown={(e) => e.key === "Enter" && handleBroadcast()}
                  />
                  <button onClick={handleBroadcast} className="btn-primary gap-2 px-4">
                    <Megaphone size={14} />
                    Broadcast
                  </button>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => handleLockScreens(true)} className="btn-danger gap-2">
                    <Lock size={13} />
                    Lock Screens
                  </button>
                  <button onClick={() => handleLockScreens(false)} className="btn-secondary gap-2">
                    <LockOpen size={13} />
                    Unlock
                  </button>
                  <Link
                    to="/monitor"
                    className={`ml-auto flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all cursor-pointer ${
                      dk
                        ? "bg-pink-500/10 hover:bg-pink-500/15 text-pink-400 border border-pink-500/20"
                        : "bg-pink-50 hover:bg-pink-100 text-pink-600 border border-pink-200"
                    }`}
                  >
                    <Eye size={14} />
                    Open Monitor
                  </Link>
                </div>
              </div>

              {/* Students list */}
              <div className="card">
                <div className="flex items-center justify-between mb-3">
                  <h3 className={`text-sm font-semibold flex items-center gap-2 ${dk ? "text-white/70" : "text-gray-700"}`}>
                    <Users size={14} />
                    Students ({students.length})
                  </h3>
                  <Link
                    to="/monitor"
                    className={`text-xs font-medium transition-colors ${dk ? "text-violet-400 hover:text-violet-300" : "text-violet-600 hover:text-violet-700"}`}
                  >
                    View in monitor →
                  </Link>
                </div>
                <div className="space-y-1.5">
                  {students.map((s) => (
                    <div key={s.id} className="list-row group">
                      <div className="flex items-center gap-3">
                        <div className="relative">
                          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-emerald-500 to-green-600 flex items-center justify-center text-white text-xs font-bold shadow-md">
                            {s.name.charAt(0)}
                          </div>
                          <span className={`absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full bg-emerald-400 border-2 ${dk ? "border-[#0f1029]" : "border-white"}`} />
                        </div>
                        <div>
                          <div className={`text-sm font-medium ${dk ? "text-white" : "text-gray-900"}`}>{s.name}</div>
                          <div className={`text-xs ${dk ? "text-white/25" : "text-gray-400"}`}>{s.email}</div>
                        </div>
                      </div>
                      <Link
                        to="/monitor"
                        className={`text-xs font-medium opacity-0 group-hover:opacity-100 transition-opacity ${dk ? "text-violet-400" : "text-violet-600"}`}
                      >
                        Monitor
                      </Link>
                    </div>
                  ))}
                  {students.length === 0 && (
                    <p className={`text-sm text-center py-7 ${dk ? "text-white/25" : "text-gray-400"}`}>
                      No students yet. Share code{" "}
                      <strong className={`font-mono ${dk ? "text-violet-400" : "text-violet-600"}`}>
                        {selectedClass.code}
                      </strong>
                    </p>
                  )}
                </div>
              </div>

              {/* Activity feed */}
              <div className="card">
                <h3 className={`text-sm font-semibold mb-3 flex items-center gap-2 ${dk ? "text-white/70" : "text-gray-700"}`}>
                  <Activity size={14} />
                  Recent Activity
                </h3>
                {recentActivity.length > 0 ? (
                  <div className="space-y-1">
                    {recentActivity.map((a, i) => (
                      <div
                        key={i}
                        className={`flex items-center gap-3 text-xs py-2 border-b last:border-0 ${
                          dk ? "text-white/35 border-white/[0.04]" : "text-gray-500 border-gray-100"
                        }`}
                      >
                        <span className="w-1.5 h-1.5 rounded-full bg-violet-400/60 flex-shrink-0" />
                        <span>
                          <strong className={dk ? "text-white/55" : "text-gray-700"}>{a.name}</strong>{" "}
                          {a.action}
                        </span>
                        <span className={`ml-auto flex-shrink-0 ${dk ? "text-white/20" : "text-gray-400"}`}>
                          {a.time}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className={`text-xs text-center py-5 ${dk ? "text-white/20" : "text-gray-400"}`}>
                    Activity will appear here as students work
                  </p>
                )}
              </div>
            </>
          ) : (
            <div className={`card flex flex-col items-center justify-center py-16 text-center ${dk ? "text-white/20" : "text-gray-400"}`}>
              <Users size={32} className="mb-3 opacity-40" />
              <p className="text-sm">Create or select a class to get started</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
