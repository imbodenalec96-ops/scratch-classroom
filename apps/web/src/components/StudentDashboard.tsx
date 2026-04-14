import React, { useEffect, useState } from "react";
import { useAuth } from "../lib/auth.tsx";
import { api } from "../lib/api.ts";
import { Link, useNavigate } from "react-router-dom";
import { useSocket } from "../lib/ws.ts";

export default function StudentDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [classes, setClasses] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [submissions, setSubmissions] = useState<any[]>([]);
  const [joinCode, setJoinCode] = useState("");
  const [leaderboard, setLeaderboard] = useState<any[]>([]);
  const [lockedScreen, setLockedScreen] = useState(false);
  const [broadcast, setBroadcast] = useState<string | null>(null);

  useEffect(() => {
    api.getClasses().then(setClasses).catch(() => {});
    api.getProjects().then(setProjects).catch(() => {});
    api.getMySubmissions().then(setSubmissions).catch(() => {});
    api.getLeaderboard().then(setLeaderboard).catch(() => {});
  }, []);

  useSocket("class:lock", (data) => setLockedScreen(data.locked));
  useSocket("class:broadcast", (data) => {
    setBroadcast(`${data.from}: ${data.message}`);
    setTimeout(() => setBroadcast(null), 10000);
  });

  const handleJoinClass = async () => {
    if (!joinCode.trim()) return;
    try {
      await api.joinClass(joinCode.trim().toUpperCase());
      setClasses(await api.getClasses());
      setJoinCode("");
    } catch (err: any) { alert(err.message); }
  };

  const handleNewProject = async () => {
    const proj = await api.createProject("New Project", "2d");
    navigate(`/project/${proj.id}`);
  };

  const myEntry = leaderboard.find((e) => e.user_id === user?.id);

  return (
    <div className="p-8 space-y-6 animate-fade-in relative">
      {lockedScreen && (
        <div className="fixed inset-0 z-50 bg-[#0a0a1a]/98 backdrop-blur-xl flex items-center justify-center">
          <div className="text-center"><span className="text-7xl mb-4 block">🔒</span>
            <h2 className="text-2xl font-bold text-white">Screen Locked</h2>
            <p className="text-white/40 mt-2">Your teacher has locked screens.</p>
          </div>
        </div>
      )}
      {broadcast && (
        <div className="fixed top-0 left-0 right-0 z-40 bg-gradient-to-r from-violet-600 to-indigo-600 text-white px-6 py-3 text-center font-medium animate-slide-up shadow-xl">
          📢 {broadcast}
        </div>
      )}

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white">Welcome back, {user?.name?.split(" ")[0]} 👋</h1>
          <p className="text-white/40 text-sm mt-1">Here's what's happening with your projects</p>
        </div>
        {myEntry && (
          <div className="flex items-center gap-3 bg-white/[0.04] backdrop-blur-xl rounded-2xl border border-white/[0.08] px-4 py-2.5">
            <span className="text-yellow-400 text-lg">★</span>
            <span className="text-sm font-semibold text-white">{myEntry.points} pts</span>
            <span className="text-xs text-white/30 bg-white/[0.06] px-2 py-0.5 rounded-full">Lvl {myEntry.level}</span>
          </div>
        )}
      </div>

      <div className="grid grid-cols-4 gap-4">
        {[
          { label: "Projects", value: projects.length, gradient: "from-violet-500 to-indigo-600", icon: "◆" },
          { label: "Classes", value: classes.length, gradient: "from-blue-500 to-cyan-600", icon: "◎" },
          { label: "Submitted", value: submissions.length, gradient: "from-emerald-500 to-green-600", icon: "✓" },
          { label: "Graded", value: submissions.filter((s) => s.grade !== null).length, gradient: "from-amber-500 to-orange-600", icon: "★" },
        ].map((s) => (
          <div key={s.label} className="stat-card">
            <div className={`stat-icon bg-gradient-to-br ${s.gradient} shadow-lg`}>
              <span className="text-white">{s.icon}</span>
            </div>
            <div>
              <div className="text-2xl font-bold text-white">{s.value}</div>
              <div className="text-xs text-white/40">{s.label}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="card">
          <h2 className="text-sm font-semibold text-white/80 mb-3">Join a Class</h2>
          <div className="flex gap-2">
            <input value={joinCode} onChange={(e) => setJoinCode(e.target.value)}
              placeholder="Enter class code..." className="input text-sm flex-1 uppercase"
              onKeyDown={(e) => e.key === "Enter" && handleJoinClass()} />
            <button onClick={handleJoinClass} className="btn-primary px-5">Join</button>
          </div>
        </div>
        <div className="card">
          <h2 className="text-sm font-semibold text-white/80 mb-3">Quick Start</h2>
          <button onClick={handleNewProject} className="btn-primary w-full py-2.5">+ New Project</button>
        </div>
      </div>

      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-white">My Projects</h2>
          <Link to="/projects" className="text-xs text-violet-400 hover:text-violet-300 font-medium">View All →</Link>
        </div>
        <div className="grid grid-cols-4 gap-3">
          {projects.slice(0, 4).map((p) => (
            <Link key={p.id} to={`/project/${p.id}`}
              className="bg-white/[0.03] rounded-xl p-3 hover:bg-white/[0.08] border border-white/[0.06] transition-all duration-200 hover:scale-[1.02] group">
              <div className="w-full h-20 bg-gradient-to-br from-violet-500/10 to-indigo-500/10 rounded-lg mb-2 flex items-center justify-center text-2xl group-hover:from-violet-500/20 group-hover:to-indigo-500/20 transition-all">
                {p.mode === "3d" ? "🧊" : "🎨"}
              </div>
              <div className="font-medium text-white text-sm truncate">{p.title}</div>
              <div className="text-xs text-white/30">{(p.mode || "2d").toUpperCase()}</div>
            </Link>
          ))}
          {projects.length === 0 && (
            <div className="col-span-4 text-center text-white/30 py-8">No projects yet — create one!</div>
          )}
        </div>
      </div>

      <div className="card">
        <h2 className="text-lg font-semibold text-white mb-3">Recent Grades</h2>
        <div className="space-y-2">
          {submissions.slice(0, 5).map((s) => (
            <div key={s.id} className="flex items-center justify-between bg-white/[0.03] rounded-xl px-4 py-3 border border-white/[0.04]">
              <div>
                <div className="text-sm text-white font-medium">{s.assignment_title || "Assignment"}</div>
                <div className="text-xs text-white/30">{new Date(s.submitted_at).toLocaleDateString()}</div>
              </div>
              <div className="text-right">
                {s.grade !== null ? (
                  <span className={`text-sm font-bold ${s.grade >= 70 ? "text-emerald-400" : "text-red-400"}`}>{s.grade}%</span>
                ) : (
                  <span className="text-xs text-white/30 bg-white/[0.06] px-2 py-0.5 rounded-full">Pending</span>
                )}
              </div>
            </div>
          ))}
          {submissions.length === 0 && <p className="text-center text-white/30 text-sm py-6">No submissions yet</p>}
        </div>
      </div>
    </div>
  );
}
