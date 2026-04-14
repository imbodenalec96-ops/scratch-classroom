import React, { useEffect, useState } from "react";
import { useAuth } from "../lib/auth.tsx";
import { api } from "../lib/api.ts";
import { Link } from "react-router-dom";

export default function AdminDashboard() {
  const { user } = useAuth();
  const [users, setUsers] = useState<any[]>([]);
  const [classes, setClasses] = useState<any[]>([]);
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
  }, []);

  const handleDeleteUser = async (userId: string) => {
    await api.deleteUser(userId);
    setUsers((prev) => prev.filter((u) => u.id !== userId));
  };

  const handleRoleChange = async (userId: string, role: string) => {
    await api.updateRole(userId, role);
    setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, role } : u)));
  };

  return (
    <div className="p-8 space-y-6 animate-fade-in">
      <div>
        <h1 className="text-3xl font-bold text-white">Admin Dashboard</h1>
        <p className="text-white/40 text-sm mt-1">Platform overview and user management</p>
      </div>

      <div className="grid grid-cols-4 gap-4">
        {[
          { label: "Total Users", value: stats.users, gradient: "from-violet-500 to-indigo-600", icon: "👥" },
          { label: "Teachers", value: stats.teachers, gradient: "from-blue-500 to-cyan-600", icon: "🧑‍🏫" },
          { label: "Students", value: stats.students, gradient: "from-emerald-500 to-green-600", icon: "🧑‍🎓" },
          { label: "Classes", value: stats.classes, gradient: "from-amber-500 to-orange-600", icon: "🏫" },
        ].map((s) => (
          <div key={s.label} className="stat-card">
            <div className={`stat-icon bg-gradient-to-br ${s.gradient}`}>{s.icon}</div>
            <div>
              <div className="text-2xl font-bold text-white">{s.value}</div>
              <div className="text-xs text-white/40">{s.label}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="card">
        <h2 className="text-lg font-semibold text-white mb-4">User Management</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/[0.06]">
                <th className="text-left py-3 px-4 table-header">Name</th>
                <th className="text-left py-3 px-4 table-header">Email</th>
                <th className="text-left py-3 px-4 table-header">Role</th>
                <th className="text-left py-3 px-4 table-header">Created</th>
                <th className="text-right py-3 px-4 table-header">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors">
                  <td className="py-3 px-4 text-white font-medium">{u.name}</td>
                  <td className="py-3 px-4 text-white/50">{u.email}</td>
                  <td className="py-3 px-4">
                    <select value={u.role} onChange={(e) => handleRoleChange(u.id, e.target.value)}
                      className="bg-white/[0.06] text-white text-xs rounded-lg px-2.5 py-1.5 border border-white/[0.08]">
                      <option value="admin">Admin</option>
                      <option value="teacher">Teacher</option>
                      <option value="student">Student</option>
                    </select>
                  </td>
                  <td className="py-3 px-4 text-white/30 text-xs">{new Date(u.created_at).toLocaleDateString()}</td>
                  <td className="py-3 px-4 text-right">
                    <button onClick={() => handleDeleteUser(u.id)} className="text-red-400 hover:text-red-300 text-xs font-medium">Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <h2 className="text-lg font-semibold text-white mb-4">Classes</h2>
        <div className="grid grid-cols-3 gap-3">
          {classes.map((c) => (
            <Link key={c.id} to={`/classes/${c.id}`}
              className="bg-white/[0.03] rounded-xl p-4 hover:bg-white/[0.06] border border-white/[0.04] transition-all">
              <div className="font-medium text-white">{c.name}</div>
              <div className="text-xs text-white/30 mt-1 font-mono">Code: {c.code}</div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
