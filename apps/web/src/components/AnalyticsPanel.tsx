import React, { useEffect, useState } from "react";
import { api } from "../lib/api.ts";
import { useTheme } from "../lib/theme.tsx";
import { Clock, Box, FolderOpen, AlertTriangle } from "lucide-react";

export default function AnalyticsPanel() {
  const { theme } = useTheme();
  const dk = theme === "dark";
  const [classes, setClasses] = useState<any[]>([]);
  const [classId, setClassId] = useState("");
  const [analytics, setAnalytics] = useState<any[]>([]);
  const [classAnalytics, setClassAnalytics] = useState<any>(null);

  useEffect(() => {
    api.getClasses().then((c) => { setClasses(c); if (c.length > 0) { setClassId(c[0].id); loadAnalytics(c[0].id); } }).catch(console.error);
  }, []);

  const loadAnalytics = async (cid: string) => {
    try { const ca = await api.getClassAnalytics(cid); setClassAnalytics(ca); } catch { setClassAnalytics(null); }
    try { const a = await api.getClassAnalytics(cid); setAnalytics(a); } catch { setAnalytics([]); }
  };

  const formatTime = (s: number) => { const m = Math.round(s / 60); return m < 60 ? `${m}m` : `${Math.floor(m/60)}h ${m%60}m`; };

  const stats = classAnalytics ? [
    { label: "Avg Time", value: formatTime(classAnalytics.avgTime || 0), icon: <Clock size={18} className="text-white" />, gradient: "from-violet-500 to-indigo-600" },
    { label: "Avg Blocks", value: Math.round(classAnalytics.avgBlocks || 0), icon: <Box size={18} className="text-white" />, gradient: "from-blue-500 to-cyan-600" },
    { label: "Total Projects", value: classAnalytics.totalProjects || 0, icon: <FolderOpen size={18} className="text-white" />, gradient: "from-emerald-500 to-green-600" },
    { label: "Avg Errors", value: Math.round(classAnalytics.avgErrors || 0), icon: <AlertTriangle size={18} className="text-white" />, gradient: "from-amber-500 to-orange-600" },
  ] : [];

  return (
    <div className="p-8 space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold" style={{ color: "var(--text-1)" }}>Analytics</h1>
        <select
          value={classId}
          onChange={(e) => { setClassId(e.target.value); loadAnalytics(e.target.value); }}
          className="input w-48"
        >
          {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>

      {classAnalytics && (
        <div className="grid grid-cols-4 gap-4">
          {stats.map((s) => (
            <div key={s.label} className="stat-card">
              <div className={`stat-icon bg-gradient-to-br ${s.gradient}`}>{s.icon}</div>
              <div>
                <div className="text-2xl font-bold" style={{ color: "var(--text-1)" }}>{s.value}</div>
                <div className="text-xs" style={{ color: "var(--text-3)" }}>{s.label}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="card">
        <h2 className="text-lg font-semibold mb-3" style={{ color: "var(--text-1)" }}>Student Progress</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b" style={{ borderColor: "var(--border)" }}>
                <th className="text-left py-2 px-3 table-header">Student</th>
                <th className="text-left py-2 px-3 table-header">Time Spent</th>
                <th className="text-left py-2 px-3 table-header">Blocks Used</th>
                <th className="text-left py-2 px-3 table-header">Errors</th>
                <th className="text-left py-2 px-3 table-header">Last Active</th>
              </tr>
            </thead>
            <tbody>
              {analytics.map((a, i) => (
                <tr key={i} className="border-b transition-colors" style={{ borderColor: "var(--border)" }}
                  onMouseEnter={(e) => (e.currentTarget as HTMLElement).style.background = "var(--bg-hover)"}
                  onMouseLeave={(e) => (e.currentTarget as HTMLElement).style.background = ""}
                >
                  <td className="py-2 px-3 font-medium" style={{ color: "var(--text-1)" }}>{a.student_name || a.user_id}</td>
                  <td className="py-2 px-3" style={{ color: "var(--text-2)" }}>{formatTime(a.time_spent || 0)}</td>
                  <td className="py-2 px-3" style={{ color: "var(--text-2)" }}>{a.blocks_used || 0}</td>
                  <td className="py-2 px-3" style={{ color: "var(--text-2)" }}>{a.errors_made || 0}</td>
                  <td className="py-2 px-3 text-xs" style={{ color: "var(--text-3)" }}>{a.last_active ? new Date(a.last_active).toLocaleString() : "—"}</td>
                </tr>
              ))}
              {analytics.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-sm" style={{ color: "var(--text-3)" }}>
                    No analytics data yet
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
