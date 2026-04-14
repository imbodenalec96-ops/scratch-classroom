import React, { useEffect, useState } from "react";
import { api } from "../lib/api.ts";

export default function AnalyticsPanel() {
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

  return (
    <div className="p-8 space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-white">Analytics</h1>
        <select value={classId} onChange={(e) => { setClassId(e.target.value); loadAnalytics(e.target.value); }}
          className="w-48 bg-white/[0.06] border border-white/[0.08] rounded-xl px-4 py-2.5 text-white text-sm focus:border-violet-500/50 focus:outline-none">
          {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>

      {classAnalytics && (
        <div className="grid grid-cols-4 gap-4">
          {[
            { label: "Avg Time", value: formatTime(classAnalytics.avgTime || 0), gradient: "from-violet-500 to-indigo-600", icon: "⏱" },
            { label: "Avg Blocks", value: Math.round(classAnalytics.avgBlocks || 0), gradient: "from-blue-500 to-cyan-600", icon: "🧱" },
            { label: "Total Projects", value: classAnalytics.totalProjects || 0, gradient: "from-emerald-500 to-green-600", icon: "📁" },
            { label: "Avg Errors", value: Math.round(classAnalytics.avgErrors || 0), gradient: "from-amber-500 to-orange-600", icon: "⚠" },
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
      )}

      <div className="card">
        <h2 className="text-lg font-semibold text-white mb-3">Student Progress</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/[0.06]">
                <th className="text-left py-2 px-3 table-header">Student</th>
                <th className="text-left py-2 px-3 table-header">Time Spent</th>
                <th className="text-left py-2 px-3 table-header">Blocks Used</th>
                <th className="text-left py-2 px-3 table-header">Errors</th>
                <th className="text-left py-2 px-3 table-header">Last Active</th>
              </tr>
            </thead>
            <tbody>
              {analytics.map((a, i) => (
                <tr key={i} className="border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors">
                  <td className="py-2 px-3 text-white font-medium">{a.student_name || a.user_id}</td>
                  <td className="py-2 px-3 text-white/50">{formatTime(a.time_spent || 0)}</td>
                  <td className="py-2 px-3 text-white/50">{a.blocks_used || 0}</td>
                  <td className="py-2 px-3 text-white/50">{a.errors_made || 0}</td>
                  <td className="py-2 px-3 text-white/30 text-xs">{a.last_active ? new Date(a.last_active).toLocaleString() : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
