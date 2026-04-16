import React, { useEffect, useState, useRef } from "react";
import { useTheme } from "../lib/theme.tsx";
import { api } from "../lib/api.ts";
import { getSocket } from "../lib/ws.ts";
import { Link } from "react-router-dom";
import {
  Users, GraduationCap, BookOpen, School, Trash2, ExternalLink,
  Search, Download, Activity, Wifi, WifiOff, X,
} from "lucide-react";

interface LiveEvent {
  id: number;
  name: string;
  action: string;
  ts: number;
}

let _evId = 0;

function timeAgo(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 5) return "just now";
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
}

function avatarColor(name: string): string {
  const colors = [
    "from-violet-500 to-indigo-600",
    "from-cyan-500 to-blue-600",
    "from-emerald-500 to-green-600",
    "from-amber-500 to-orange-600",
    "from-pink-500 to-rose-600",
    "from-teal-500 to-cyan-600",
  ];
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xfffff;
  return colors[h % colors.length];
}

export default function AdminDashboard() {
  const { theme } = useTheme();
  const dk = theme === "dark";

  const [users, setUsers] = useState<any[]>([]);
  const [classes, setClasses] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [stats, setStats] = useState({ users: 0, teachers: 0, students: 0, classes: 0 });
  const [liveEvents, setLiveEvents] = useState<LiveEvent[]>([]);
  const [wsConnected, setWsConnected] = useState(false);
  const [userSearch, setUserSearch] = useState("");
  const [projectSearch, setProjectSearch] = useState("");
  const [tick, setTick] = useState(0);

  // Refresh "time ago" labels every 15s
  useEffect(() => {
    const iv = setInterval(() => setTick((t) => t + 1), 15000);
    return () => clearInterval(iv);
  }, []);

  useEffect(() => {
    api.getUsers().then((u) => {
      setUsers(u);
      setStats((prev) => ({
        ...prev,
        users: u.length,
        teachers: u.filter((x: any) => x.role === "teacher").length,
        students: u.filter((x: any) => x.role === "student").length,
      }));
    }).catch(() => {});
    api.getClasses().then((c) => {
      setClasses(c);
      setStats((prev) => ({ ...prev, classes: c.length }));
    }).catch(() => {});
    api.getAllProjects().then((p) => {
      // Sort by updated_at descending
      const sorted = [...p].sort((a, b) =>
        new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
      );
      setProjects(sorted);
    }).catch(() => {});
  }, []);

  // WebSocket live activity
  useEffect(() => {
    const socket = getSocket();

    const checkConnected = () => setWsConnected(socket.connected);
    checkConnected();
    socket.on("connect", () => setWsConnected(true));
    socket.on("disconnect", () => setWsConnected(false));

    const addEvent = (data: any, defaultAction: string) => {
      setLiveEvents((prev) => [
        {
          id: ++_evId,
          name: data.userName || data.name || "Unknown",
          action: data.action || defaultAction,
          ts: Date.now(),
        },
        ...prev.slice(0, 14),
      ]);
    };

    const onProject = (d: any) => addEvent(d, "updated a project");
    const onChat = (d: any) => addEvent(d, "sent a message");

    socket.on("project:update", onProject);
    socket.on("chat:message", onChat);

    return () => {
      socket.off("connect", checkConnected);
      socket.off("disconnect", checkConnected);
      socket.off("project:update", onProject);
      socket.off("chat:message", onChat);
    };
  }, []);

  const handleDeleteUser = async (userId: string) => {
    if (!confirm("Delete this user? This cannot be undone.")) return;
    await api.deleteUser(userId);
    setUsers((prev) => prev.filter((u) => u.id !== userId));
    setStats((prev) => ({ ...prev, users: prev.users - 1 }));
  };

  const handleRoleChange = async (userId: string, role: string) => {
    await api.updateRole(userId, role);
    setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, role } : u)));
    setStats((prev) => {
      const updated = prev.users;
      const updated_users = users.map((u) => (u.id === userId ? { ...u, role } : u));
      return {
        ...prev,
        teachers: updated_users.filter((x) => x.role === "teacher").length,
        students: updated_users.filter((x) => x.role === "student").length,
        users: updated,
      };
    });
  };

  const handleDeleteClass = async (classId: string) => {
    if (!confirm("Delete this class?")) return;
    await api.deleteClass(classId);
    setClasses((prev) => prev.filter((c) => c.id !== classId));
    setStats((prev) => ({ ...prev, classes: Math.max(0, prev.classes - 1) }));
  };

  const handleDeleteProject = async (projectId: string) => {
    if (!confirm("Delete this project?")) return;
    await api.deleteProject(projectId);
    setProjects((prev) => prev.filter((p) => p.id !== projectId));
  };

  const exportUsersCSV = () => {
    const header = ["Name", "Email", "Role", "Created"];
    const rows = filteredUsers.map((u) => [
      `"${u.name}"`,
      `"${u.email}"`,
      u.role,
      new Date(u.created_at).toLocaleDateString(),
    ]);
    const csv = [header.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "thign-users.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const filteredUsers = users.filter((u) => {
    const q = userSearch.toLowerCase();
    return !q || u.name?.toLowerCase().includes(q) || u.email?.toLowerCase().includes(q) || u.role?.includes(q);
  });

  const filteredProjects = projects
    .filter((p) => {
      const q = projectSearch.toLowerCase();
      return !q || p.title?.toLowerCase().includes(q) || p.owner_name?.toLowerCase().includes(q) || p.owner_email?.toLowerCase().includes(q);
    })
    .slice(0, 150);

  const statItems = [
    { label: "Total Users", value: stats.users,   icon: Users,         color: "text-violet-400",  bg: dk ? "bg-violet-500/10"  : "bg-violet-50"  },
    { label: "Teachers",    value: stats.teachers, icon: GraduationCap, color: "text-cyan-400",    bg: dk ? "bg-cyan-500/10"    : "bg-cyan-50"    },
    { label: "Students",    value: stats.students, icon: BookOpen,      color: "text-emerald-400", bg: dk ? "bg-emerald-500/10" : "bg-emerald-50" },
    { label: "Classes",     value: stats.classes,  icon: School,        color: "text-amber-400",   bg: dk ? "bg-amber-500/10"   : "bg-amber-50"   },
  ];

  const roleBadge = (role: string) => {
    if (role === "admin")   return dk ? "bg-violet-500/15 text-violet-300" : "bg-violet-100 text-violet-700";
    if (role === "teacher") return dk ? "bg-cyan-500/15 text-cyan-300"     : "bg-cyan-100 text-cyan-700";
    return                         dk ? "bg-emerald-500/15 text-emerald-300" : "bg-emerald-100 text-emerald-700";
  };

  return (
    <div className="p-7 space-y-6 animate-fade-in">
      {/* Header */}
      <div>
        <h1 className={`text-2xl font-bold tracking-tight ${dk ? "text-white" : "text-gray-900"}`}>
          Admin Dashboard
        </h1>
        <p className={`text-sm mt-0.5 ${dk ? "text-white/40" : "text-gray-500"}`}>
          Platform overview and user management
        </p>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-4 gap-4">
        {statItems.map((s) => (
          <div key={s.label} className="stat-card">
            <div className={`stat-icon ${s.bg}`}>
              <s.icon size={18} className={s.color} />
            </div>
            <div>
              <div className={`text-2xl font-bold ${dk ? "text-white" : "text-gray-900"}`}>{s.value}</div>
              <div className={`text-xs ${dk ? "text-white/40" : "text-gray-500"}`}>{s.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Live Activity */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h2 className={`text-base font-semibold flex items-center gap-2 ${dk ? "text-white" : "text-gray-900"}`}>
            <Activity size={16} className="text-violet-400" />
            Live Activity
          </h2>
          <div className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full ${
            wsConnected
              ? dk ? "bg-emerald-500/10 text-emerald-400" : "bg-emerald-50 text-emerald-600"
              : dk ? "bg-white/5 text-white/25"           : "bg-gray-100 text-gray-400"
          }`}>
            {wsConnected ? (
              <>
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                <Wifi size={11} /> Connected
              </>
            ) : (
              <>
                <span className="w-1.5 h-1.5 rounded-full bg-gray-400" />
                <WifiOff size={11} /> Offline
              </>
            )}
          </div>
        </div>

        {liveEvents.length > 0 ? (
          <div className="space-y-1">
            {liveEvents.map((ev) => (
              <div
                key={ev.id}
                className={`flex items-center gap-3 text-xs py-2 px-3 rounded-lg transition-all ${
                  dk ? "hover:bg-white/[0.03]" : "hover:bg-gray-50"
                }`}
              >
                <span className="w-2 h-2 rounded-full bg-violet-400/60 flex-shrink-0 animate-pulse" style={{ animationDuration: "3s" }} />
                <span className={dk ? "text-white/60" : "text-gray-600"}>
                  <strong className={dk ? "text-white/80 font-medium" : "text-gray-800 font-medium"}>
                    {ev.name}
                  </strong>{" "}
                  {ev.action}
                </span>
                <span className={`ml-auto flex-shrink-0 tabular-nums ${dk ? "text-white/20" : "text-gray-400"}`}>
                  {timeAgo(ev.ts)}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div className={`text-xs text-center py-8 rounded-xl border border-dashed ${
            dk ? "text-white/20 border-white/[0.06]" : "text-gray-400 border-gray-200"
          }`}>
            {wsConnected
              ? "Waiting for student activity…"
              : "WebSocket not connected — activity will appear here when students are online"}
          </div>
        )}
      </div>

      {/* User Management */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h2 className={`text-base font-semibold ${dk ? "text-white" : "text-gray-900"}`}>
            User Management
            <span className={`ml-2 text-xs font-normal ${dk ? "text-white/30" : "text-gray-400"}`}>
              {filteredUsers.length} of {users.length}
            </span>
          </h2>
          <div className="flex items-center gap-2">
            <div className={`flex items-center gap-2 rounded-xl px-3 py-2 border text-sm ${
              dk ? "bg-white/[0.04] border-white/[0.07] text-white/70" : "bg-gray-50 border-gray-200 text-gray-700"
            }`}>
              <Search size={13} className={dk ? "text-white/30" : "text-gray-400"} />
              <input
                value={userSearch}
                onChange={(e) => setUserSearch(e.target.value)}
                placeholder="Search users…"
                className="bg-transparent outline-none w-44 placeholder:text-current placeholder:opacity-40"
              />
              {userSearch && (
                <button onClick={() => setUserSearch("")} className="opacity-40 hover:opacity-70 cursor-pointer">
                  <X size={12} />
                </button>
              )}
            </div>
            <button
              onClick={exportUsersCSV}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium border transition-colors cursor-pointer ${
                dk
                  ? "bg-white/[0.04] border-white/[0.07] text-white/60 hover:text-white hover:bg-white/[0.07]"
                  : "bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100"
              }`}
            >
              <Download size={13} />
              Export CSV
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className={`border-b ${dk ? "border-white/[0.06]" : "border-gray-200"}`}>
                <th className="text-left py-3 px-4 table-header">User</th>
                <th className="text-left py-3 px-4 table-header">Email</th>
                <th className="text-left py-3 px-4 table-header">Role</th>
                <th className="text-left py-3 px-4 table-header">Joined</th>
                <th className="text-right py-3 px-4 table-header">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.map((u) => (
                <tr
                  key={u.id}
                  className={`border-b transition-colors ${
                    dk ? "border-white/[0.03] hover:bg-white/[0.02]" : "border-gray-100 hover:bg-gray-50"
                  }`}
                >
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-2.5">
                      <div className={`w-7 h-7 rounded-lg bg-gradient-to-br ${avatarColor(u.name || "?")} flex items-center justify-center text-white text-xs font-bold flex-shrink-0 shadow-sm`}>
                        {(u.name || "?").charAt(0).toUpperCase()}
                      </div>
                      <span className={`font-medium ${dk ? "text-white" : "text-gray-900"}`}>{u.name}</span>
                    </div>
                  </td>
                  <td className={`py-3 px-4 ${dk ? "text-white/50" : "text-gray-500"}`}>{u.email}</td>
                  <td className="py-3 px-4">
                    <select
                      value={u.role}
                      onChange={(e) => handleRoleChange(u.id, e.target.value)}
                      className={`text-xs rounded-lg px-2.5 py-1.5 border font-medium cursor-pointer ${roleBadge(u.role)} ${
                        dk ? "border-white/[0.08]" : "border-current/20 border-opacity-20"
                      }`}
                      style={{ borderColor: "transparent" }}
                    >
                      <option value="admin">Admin</option>
                      <option value="teacher">Teacher</option>
                      <option value="student">Student</option>
                    </select>
                  </td>
                  <td className={`py-3 px-4 text-xs ${dk ? "text-white/30" : "text-gray-400"}`}>
                    {new Date(u.created_at).toLocaleDateString()}
                  </td>
                  <td className="py-3 px-4 text-right">
                    <button
                      onClick={() => handleDeleteUser(u.id)}
                      className="inline-flex items-center gap-1 text-red-400 hover:text-red-300 text-xs font-medium cursor-pointer transition-colors"
                    >
                      <Trash2 size={12} /> Delete
                    </button>
                  </td>
                </tr>
              ))}
              {filteredUsers.length === 0 && (
                <tr>
                  <td colSpan={5} className={`py-10 text-center text-sm ${dk ? "text-white/20" : "text-gray-400"}`}>
                    No users match "{userSearch}"
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Classes */}
      <div className="card">
        <h2 className={`text-base font-semibold mb-4 ${dk ? "text-white" : "text-gray-900"}`}>
          Classes
          <span className={`ml-2 text-xs font-normal ${dk ? "text-white/30" : "text-gray-400"}`}>
            {classes.length} total
          </span>
        </h2>
        <div className="grid grid-cols-3 gap-3">
          {classes.map((c) => (
            <div
              key={c.id}
              className={`rounded-xl p-4 border transition-all ${
                dk
                  ? "bg-white/[0.03] border-white/[0.04] hover:bg-white/[0.06]"
                  : "bg-gray-50 border-gray-200 hover:bg-gray-100"
              }`}
            >
              <Link to={`/classes/${c.id}`} className="block group">
                <div className={`font-semibold text-sm group-hover:text-violet-400 transition-colors ${dk ? "text-white" : "text-gray-900"}`}>
                  {c.name}
                </div>
                <div className={`text-xs mt-1 font-mono ${dk ? "text-white/30" : "text-gray-400"}`}>
                  Code: <span className={dk ? "text-violet-400" : "text-violet-600"}>{c.code}</span>
                </div>
                {c.teacher_name && (
                  <div className={`text-xs mt-1 ${dk ? "text-white/25" : "text-gray-400"}`}>
                    Teacher: {c.teacher_name}
                  </div>
                )}
                {typeof c.students_count === "number" && (
                  <div className={`text-xs mt-1 flex items-center gap-1 ${dk ? "text-white/25" : "text-gray-400"}`}>
                    <Users size={10} /> {c.students_count} student{c.students_count !== 1 ? "s" : ""}
                  </div>
                )}
              </Link>
              <div className="mt-3 flex justify-end">
                <button
                  onClick={() => handleDeleteClass(c.id)}
                  className="text-xs text-red-400 hover:text-red-300 transition-colors cursor-pointer"
                >
                  Delete class
                </button>
              </div>
            </div>
          ))}
          {classes.length === 0 && (
            <div className={`col-span-3 py-10 text-center text-sm ${dk ? "text-white/20" : "text-gray-400"}`}>
              No classes yet
            </div>
          )}
        </div>
      </div>

      {/* Projects */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h2 className={`text-base font-semibold ${dk ? "text-white" : "text-gray-900"}`}>
            Projects
            <span className={`ml-2 text-xs font-normal ${dk ? "text-white/30" : "text-gray-400"}`}>
              showing {filteredProjects.length} of {projects.length}
            </span>
          </h2>
          <div className={`flex items-center gap-2 rounded-xl px-3 py-2 border text-sm ${
            dk ? "bg-white/[0.04] border-white/[0.07] text-white/70" : "bg-gray-50 border-gray-200 text-gray-700"
          }`}>
            <Search size={13} className={dk ? "text-white/30" : "text-gray-400"} />
            <input
              value={projectSearch}
              onChange={(e) => setProjectSearch(e.target.value)}
              placeholder="Search by title or owner…"
              className="bg-transparent outline-none w-52 placeholder:text-current placeholder:opacity-40"
            />
            {projectSearch && (
              <button onClick={() => setProjectSearch("")} className="opacity-40 hover:opacity-70 cursor-pointer">
                <X size={12} />
              </button>
            )}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className={`border-b ${dk ? "border-white/[0.06]" : "border-gray-200"}`}>
                <th className="text-left py-3 px-4 table-header">Title</th>
                <th className="text-left py-3 px-4 table-header">Owner</th>
                <th className="text-left py-3 px-4 table-header">Last Updated</th>
                <th className="text-right py-3 px-4 table-header">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredProjects.map((p) => (
                <tr
                  key={p.id}
                  className={`border-b transition-colors ${
                    dk ? "border-white/[0.03] hover:bg-white/[0.02]" : "border-gray-100 hover:bg-gray-50"
                  }`}
                >
                  <td className={`py-3 px-4 font-medium ${dk ? "text-white" : "text-gray-900"}`}>{p.title}</td>
                  <td className={`py-3 px-4 ${dk ? "text-white/50" : "text-gray-500"}`}>
                    {p.owner_name}
                    {p.owner_email && (
                      <span className={`ml-1.5 text-xs ${dk ? "text-white/25" : "text-gray-400"}`}>
                        ({p.owner_email})
                      </span>
                    )}
                  </td>
                  <td className={`py-3 px-4 text-xs ${dk ? "text-white/30" : "text-gray-400"}`}>
                    {new Date(p.updated_at).toLocaleString()}
                  </td>
                  <td className="py-3 px-4 text-right">
                    <Link
                      to={`/project/${p.id}`}
                      className="inline-flex items-center gap-1 text-violet-400 hover:text-violet-300 text-xs font-medium mr-3 transition-colors"
                    >
                      <ExternalLink size={11} /> Open
                    </Link>
                    <button
                      onClick={() => handleDeleteProject(p.id)}
                      className="inline-flex items-center gap-1 text-red-400 hover:text-red-300 text-xs font-medium cursor-pointer transition-colors"
                    >
                      <Trash2 size={11} /> Delete
                    </button>
                  </td>
                </tr>
              ))}
              {filteredProjects.length === 0 && (
                <tr>
                  <td colSpan={4} className={`py-10 text-center text-sm ${dk ? "text-white/20" : "text-gray-400"}`}>
                    {projectSearch ? `No projects match "${projectSearch}"` : "No projects yet"}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
