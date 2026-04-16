import React, { useEffect, useState } from "react";
import { useAuth } from "../lib/auth.tsx";
import { useTheme } from "../lib/theme.tsx";
import { api } from "../lib/api.ts";
import { Link } from "react-router-dom";
import { Users, GraduationCap, BookOpen, School, Trash2, ExternalLink } from "lucide-react";

export default function AdminDashboard() {
  const { user } = useAuth();
  const { theme } = useTheme();
  const dk = theme === "dark";
  const [users, setUsers] = useState<any[]>([]);
  const [classes, setClasses] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [stats, setStats] = useState({ users: 0, teachers: 0, students: 0, classes: 0 });

  useEffect(() => {
    api.getUsers().then((u) => {
      setUsers(u);
      setStats({ users: u.length, teachers: u.filter((x: any) => x.role === "teacher").length,
        students: u.filter((x: any) => x.role === "student").length, classes: 0 });
    }).catch(() => {});
    api.getClasses().then((c) => {
      setClasses(c);
      setStats((prev) => ({ ...prev, classes: c.length }));
    }).catch(() => {});
    api.getAllProjects().then(setProjects).catch(() => {});
  }, []);

  const handleDeleteUser = async (userId: string) => {
    await api.deleteUser(userId);
    setUsers((prev) => prev.filter((u) => u.id !== userId));
  };

  const handleRoleChange = async (userId: string, role: string) => {
    await api.updateRole(userId, role);
    setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, role } : u)));
  };

  const handleDeleteClass = async (classId: string) => {
    await api.deleteClass(classId);
    setClasses((prev) => prev.filter((c) => c.id !== classId));
    setStats((prev) => ({ ...prev, classes: Math.max(0, prev.classes - 1) }));
  };

  const handleDeleteProject = async (projectId: string) => {
    await api.deleteProject(projectId);
    setProjects((prev) => prev.filter((p) => p.id !== projectId));
  };

  const statItems = [
    { label: "Total Users", value: stats.users,    icon: Users,          color: "text-violet-400",  bg: dk ? "bg-violet-500/10"  : "bg-violet-50"  },
    { label: "Teachers",    value: stats.teachers,  icon: GraduationCap,  color: "text-cyan-400",    bg: dk ? "bg-cyan-500/10"    : "bg-cyan-50"    },
    { label: "Students",    value: stats.students,  icon: BookOpen,       color: "text-emerald-400", bg: dk ? "bg-emerald-500/10" : "bg-emerald-50" },
    { label: "Classes",     value: stats.classes,   icon: School,         color: "text-amber-400",   bg: dk ? "bg-amber-500/10"   : "bg-amber-50"   },
  ];

  return (
    <div className="p-7 space-y-6 animate-fade-in">
      <div>
        <h1 className={`text-2xl font-bold tracking-tight ${dk ? "text-white" : "text-gray-900"}`}>Admin Dashboard</h1>
        <p className={`text-sm mt-0.5 ${dk ? "text-white/40" : "text-gray-500"}`}>Platform overview and user management</p>
      </div>

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

      <div className="card">
        <h2 className={`text-base font-semibold mb-4 ${dk ? "text-white" : "text-gray-900"}`}>User Management</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className={`border-b ${dk ? "border-white/[0.06]" : "border-gray-200"}`}>
                <th className="text-left py-3 px-4 table-header">Name</th>
                <th className="text-left py-3 px-4 table-header">Email</th>
                <th className="text-left py-3 px-4 table-header">Role</th>
                <th className="text-left py-3 px-4 table-header">Created</th>
                <th className="text-right py-3 px-4 table-header">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className={`border-b transition-colors ${dk ? "border-white/[0.03] hover:bg-white/[0.02]" : "border-gray-100 hover:bg-gray-50"}`}>
                  <td className={`py-3 px-4 font-medium ${dk ? "text-white" : "text-gray-900"}`}>{u.name}</td>
                  <td className={`py-3 px-4 ${dk ? "text-white/50" : "text-gray-500"}`}>{u.email}</td>
                  <td className="py-3 px-4">
                    <select value={u.role} onChange={(e) => handleRoleChange(u.id, e.target.value)}
                      className={`text-xs rounded-lg px-2.5 py-1.5 border ${dk ? "bg-white/[0.06] text-white border-white/[0.08]" : "bg-gray-50 text-gray-800 border-gray-200"}`}>
                      <option value="admin">Admin</option>
                      <option value="teacher">Teacher</option>
                      <option value="student">Student</option>
                    </select>
                  </td>
                  <td className={`py-3 px-4 text-xs ${dk ? "text-white/30" : "text-gray-400"}`}>{new Date(u.created_at).toLocaleDateString()}</td>
                  <td className="py-3 px-4 text-right">
                    <button onClick={() => handleDeleteUser(u.id)} className="inline-flex items-center gap-1 text-red-400 hover:text-red-300 text-xs font-medium cursor-pointer transition-colors">
                      <Trash2 size={12} /> Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <h2 className={`text-base font-semibold mb-4 ${dk ? "text-white" : "text-gray-900"}`}>Classes</h2>
        <div className="grid grid-cols-3 gap-3">
          {classes.map((c) => (
            <div key={c.id} className={`rounded-xl p-4 border transition-all ${dk ? "bg-white/[0.03] border-white/[0.04] hover:bg-white/[0.06]" : "bg-gray-50 border-gray-200 hover:bg-gray-100"}`}>
              <Link to={`/classes/${c.id}`} className="block">
                <div className={`font-medium ${dk ? "text-white" : "text-gray-900"}`}>{c.name}</div>
                <div className={`text-xs mt-1 font-mono ${dk ? "text-white/30" : "text-gray-400"}`}>Code: {c.code}</div>
              </Link>
              <div className="mt-3 flex justify-end">
                <button onClick={() => handleDeleteClass(c.id)} className="text-xs text-red-400 hover:text-red-300">Delete class</button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="card">
        <h2 className={`text-base font-semibold mb-4 ${dk ? "text-white" : "text-gray-900"}`}>Project Management</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className={`border-b ${dk ? "border-white/[0.06]" : "border-gray-200"}`}>
                <th className="text-left py-3 px-4 table-header">Title</th>
                <th className="text-left py-3 px-4 table-header">Owner</th>
                <th className="text-left py-3 px-4 table-header">Updated</th>
                <th className="text-right py-3 px-4 table-header">Actions</th>
              </tr>
            </thead>
            <tbody>
              {projects.slice(0, 150).map((p) => (
                <tr key={p.id} className={`border-b transition-colors ${dk ? "border-white/[0.03] hover:bg-white/[0.02]" : "border-gray-100 hover:bg-gray-50"}`}>
                  <td className={`py-3 px-4 font-medium ${dk ? "text-white" : "text-gray-900"}`}>{p.title}</td>
                  <td className={`py-3 px-4 ${dk ? "text-white/50" : "text-gray-500"}`}>{p.owner_name} <span className={dk ? "text-white/25" : "text-gray-400"}>({p.owner_email})</span></td>
                  <td className={`py-3 px-4 text-xs ${dk ? "text-white/30" : "text-gray-400"}`}>{new Date(p.updated_at).toLocaleString()}</td>
                  <td className="py-3 px-4 text-right">
                    <Link to={`/project/${p.id}`} className="inline-flex items-center gap-1 text-violet-400 hover:text-violet-300 text-xs font-medium mr-3 transition-colors">
                      <ExternalLink size={11} /> Open
                    </Link>
                    <button onClick={() => handleDeleteProject(p.id)} className="inline-flex items-center gap-1 text-red-400 hover:text-red-300 text-xs font-medium cursor-pointer transition-colors">
                      <Trash2 size={11} /> Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
