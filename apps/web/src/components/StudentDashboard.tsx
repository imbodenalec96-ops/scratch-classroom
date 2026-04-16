import React, { useEffect, useState, useRef } from "react";
import { useAuth } from "../lib/auth.tsx";
import { useTheme } from "../lib/theme.tsx";
import { api } from "../lib/api.ts";
import { Link, useNavigate } from "react-router-dom";
import { useSocket } from "../lib/ws.ts";
import {
  FolderOpen, Users, CheckCircle, Star, Plus, ArrowRight,
  Lock, Megaphone, Box, Palette, Trophy, Clock, Gamepad2, Zap,
} from "lucide-react";

/* Animate a number from 0 to target with ease-out */
function useCountUp(target: number, duration = 900, delay = 0) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    if (target === 0) { setValue(0); return; }
    const t = setTimeout(() => {
      const start = performance.now();
      const tick = (now: number) => {
        const pct = Math.min((now - start) / duration, 1);
        setValue(Math.round((1 - Math.pow(1 - pct, 3)) * target));
        if (pct < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    }, delay);
    return () => clearTimeout(t);
  }, [target, duration, delay]);
  return value;
}

/* Confetti burst anchored to an element */
function spawnConfetti(anchor: HTMLElement) {
  const glyphs = ["🎉", "✨", "🌟", "💫", "🎊"];
  const rect = anchor.getBoundingClientRect();
  for (let i = 0; i < 8; i++) {
    const el = document.createElement("span");
    el.textContent = glyphs[i % glyphs.length];
    el.style.cssText = `position:fixed;left:${rect.left + rect.width / 2}px;top:${rect.top + rect.height / 2}px;font-size:1.1rem;pointer-events:none;z-index:9999;transition:transform .65s cubic-bezier(.16,1,.3,1),opacity .65s ease;transform:translate(0,0) scale(.5);opacity:1;`;
    document.body.appendChild(el);
    requestAnimationFrame(() => {
      const angle = (i / 8) * Math.PI * 2;
      const d = 55 + Math.random() * 35;
      el.style.transform = `translate(${Math.cos(angle) * d}px,${Math.sin(angle) * d - 30}px) scale(1)`;
      el.style.opacity = "0";
    });
    setTimeout(() => el.remove(), 750);
  }
}

export default function StudentDashboard() {
  const { user } = useAuth();
  const { theme } = useTheme();
  const dk = theme === "dark";
  const navigate = useNavigate();
  const [classes, setClasses] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [submissions, setSubmissions] = useState<any[]>([]);
  const [joinCode, setJoinCode] = useState("");
  const [leaderboard, setLeaderboard] = useState<any[]>([]);
  const [lockedScreen, setLockedScreen] = useState(false);
  const [broadcast, setBroadcast] = useState<string | null>(null);
  const [joinSuccess, setJoinSuccess] = useState(false);
  const joinBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    api.getClasses().then(setClasses).catch(() => {});
    api.getProjects().then(setProjects).catch(() => {});
    api.getMySubmissions().then(setSubmissions).catch(() => {});
    api.getLeaderboard().then(setLeaderboard).catch(() => {});
  }, []);

  useEffect(() => {
    if (!user || classes.length === 0) return;
    const checkLock = async () => {
      for (const cls of classes) {
        try {
          const ctrl = await api.getMyControls(cls.id);
          if (ctrl?.screen_locked) { setLockedScreen(true); return; }
        } catch { /* ignore */ }
      }
      setLockedScreen(false);
    };
    checkLock();
    const iv = setInterval(checkLock, 5000);
    return () => clearInterval(iv);
  }, [user, classes]);

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
      setJoinSuccess(true);
      if (joinBtnRef.current) spawnConfetti(joinBtnRef.current);
      setTimeout(() => setJoinSuccess(false), 2000);
    } catch (err: any) { alert(err.message); }
  };

  const handleNewProject = async () => {
    const proj = await api.createProject("New Project", "2d");
    navigate(`/project/${proj.id}`);
  };

  const myEntry = leaderboard.find((e) => e.user_id === user?.id);

  const rawStats = [
    { label: "Projects",  value: projects.length,                                    icon: FolderOpen,  color: "text-violet-400",  bg: dk ? "bg-violet-500/10" : "bg-violet-50" },
    { label: "Classes",   value: classes.length,                                     icon: Users,       color: "text-cyan-400",    bg: dk ? "bg-cyan-500/10"   : "bg-cyan-50"   },
    { label: "Submitted", value: submissions.length,                                 icon: CheckCircle, color: "text-emerald-400", bg: dk ? "bg-emerald-500/10": "bg-emerald-50"},
    { label: "Graded",    value: submissions.filter((s) => s.grade !== null).length, icon: Star,        color: "text-amber-400",   bg: dk ? "bg-amber-500/10"  : "bg-amber-50"  },
  ];
  const c0 = useCountUp(rawStats[0].value, 900, 200);
  const c1 = useCountUp(rawStats[1].value, 900, 290);
  const c2 = useCountUp(rawStats[2].value, 900, 380);
  const c3 = useCountUp(rawStats[3].value, 900, 470);
  const countValues = [c0, c1, c2, c3];
  const stats = rawStats;

  return (
    <div className="p-7 space-y-6 animate-page-enter relative">
      {/* Screen lock overlay */}
      {lockedScreen && (
        <div className={`fixed inset-0 z-50 flex items-center justify-center ${dk ? "bg-[#07071a]/98" : "bg-white/95"} backdrop-blur-xl`}>
          <div className="text-center screen-shake">
            <div className={`w-20 h-20 rounded-2xl flex items-center justify-center mx-auto mb-4 ${dk ? "bg-white/[0.06]" : "bg-gray-100"}`}>
              <Lock size={36} className={dk ? "text-white/60" : "text-gray-400"} />
            </div>
            <h2 className={`text-2xl font-bold ${dk ? "text-white" : "text-gray-900"}`}>Screen Locked</h2>
            <p className={`mt-2 text-sm ${dk ? "text-white/40" : "text-gray-500"}`}>Your teacher has locked screens.</p>
          </div>
        </div>
      )}

      {/* Broadcast banner */}
      {broadcast && (
        <div className="fixed top-0 left-0 right-0 z-40 bg-violet-600 text-white px-6 py-3 text-center text-sm font-medium animate-broadcast-in shadow-xl flex items-center justify-center gap-2">
          <Megaphone size={15} />
          {broadcast}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className={`text-2xl font-bold tracking-tight ${dk ? "text-white" : "text-gray-900"}`}>
            Welcome back, {user?.name?.split(" ")[0]}
          </h1>
          <p className={`text-sm mt-0.5 ${dk ? "text-white/40" : "text-gray-500"}`}>
            Here's what's happening with your projects
          </p>
        </div>
        {myEntry && (
          <div className={`flex items-center gap-3 rounded-2xl px-4 py-2.5 border ${
            dk ? "bg-amber-500/[0.08] border-amber-500/20" : "bg-amber-50 border-amber-200"
          }`}>
            <Trophy size={16} className="text-amber-400" />
            <div>
              <span className={`text-sm font-bold ${dk ? "text-white" : "text-gray-900"}`}>
                {myEntry.points} pts
              </span>
              <span className={`text-xs ml-2 ${dk ? "text-white/35" : "text-gray-400"}`}>
                Lvl {myEntry.level}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        {stats.map((s, i) => (
          <div key={s.label} className="card flex items-center gap-3.5 animate-slide-up" style={{ animationDelay: `${80 + i * 65}ms` }}>
            <div className={`stat-icon ${s.bg} transition-transform duration-200 group-hover:scale-110`}>
              <s.icon size={18} className={s.color} />
            </div>
            <div>
              <div className={`text-2xl font-bold leading-none tabular-nums ${dk ? "text-white" : "text-gray-900"}`}>
                {countValues[i]}
              </div>
              <div className={`text-xs mt-0.5 ${dk ? "text-white/35" : "text-gray-400"}`}>{s.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* ── Arcade banner ── */}
      <Link
        to="/arcade"
        className="relative rounded-2xl overflow-hidden flex items-center gap-5 px-6 py-5 group animate-slide-up"
        style={{
          background: "linear-gradient(135deg, #1a0a35 0%, #0f0726 100%)",
          border: "1px solid rgba(139,92,246,0.35)",
          boxShadow: "0 8px 24px rgba(139,92,246,0.2)",
          animationDelay: "320ms",
          textDecoration: "none",
        }}
      >
        {/* Background glow */}
        <div className="absolute inset-0 opacity-30 pointer-events-none" style={{ background: "radial-gradient(ellipse at 80% 50%, #8b5cf6 0%, transparent 60%)" }} />
        {/* Floating emoji */}
        <span className="text-5xl flex-shrink-0 relative z-10 animate-arcade-float" style={{ filter: "drop-shadow(0 0 14px rgba(167,139,250,0.8))" }}>🎮</span>
        <div className="flex-1 min-w-0 relative z-10">
          <div className="text-[10px] font-bold uppercase tracking-widest text-violet-400 mb-0.5">New · Free to Play</div>
          <div className="text-white font-extrabold text-lg leading-tight">BlockForge Arcade</div>
          <div className="text-white/50 text-xs mt-0.5">Snake, Pong, Brick Breaker, Memory Match &amp; more — play now!</div>
        </div>
        <div
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-sm text-white flex-shrink-0 relative z-10 transition-all duration-200 group-hover:scale-105"
          style={{ background: "linear-gradient(135deg, #8b5cf6, #6366f1)", boxShadow: "0 4px 14px rgba(139,92,246,0.5)" }}
        >
          <Gamepad2 size={15} />
          Play Now
        </div>
      </Link>

      {/* Quick actions */}
      <div className="grid grid-cols-2 gap-4">
        <div className="card animate-slide-up" style={{ animationDelay: "340ms" }}>
          <h2 className={`text-sm font-semibold mb-3 ${dk ? "text-white/70" : "text-gray-700"}`}>Join a Class</h2>
          <div className="flex gap-2">
            <input
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value)}
              placeholder="Enter class code…"
              className="input text-sm flex-1 uppercase tracking-widest"
              onKeyDown={(e) => e.key === "Enter" && handleJoinClass()}
            />
            <button
              ref={joinBtnRef}
              onClick={handleJoinClass}
              className={`btn-primary px-4 transition-all duration-200 ${joinSuccess ? "bg-emerald-500 hover:bg-emerald-500 shadow-emerald-500/30" : ""}`}
            >
              {joinSuccess ? <span className="animate-check-pop inline-block">✓</span> : "Join"}
            </button>
          </div>
        </div>
        <div className="card flex flex-col justify-between animate-slide-up" style={{ animationDelay: "410ms" }}>
          <h2 className={`text-sm font-semibold mb-3 ${dk ? "text-white/70" : "text-gray-700"}`}>Quick Start</h2>
          <button onClick={handleNewProject} className="btn-primary w-full gap-2">
            <Plus size={15} />
            New Project
          </button>
        </div>
      </div>

      {/* Projects */}
      <div className="card animate-slide-up" style={{ animationDelay: "480ms" }}>
        <div className="flex items-center justify-between mb-4">
          <h2 className={`text-base font-semibold ${dk ? "text-white" : "text-gray-900"}`}>My Projects</h2>
          <Link
            to="/projects"
            className={`flex items-center gap-1 text-xs font-medium transition-colors ${
              dk ? "text-violet-400 hover:text-violet-300" : "text-violet-600 hover:text-violet-700"
            }`}
          >
            View All <ArrowRight size={12} />
          </Link>
        </div>
        <div className="grid grid-cols-4 gap-3">
          {projects.slice(0, 4).map((p, i) => (
            <Link
              key={p.id}
              to={`/project/${p.id}`}
              className={`rounded-xl p-3 border transition-all duration-200 hover:scale-[1.04] hover:-translate-y-0.5 group cursor-pointer animate-scale-in ${
                dk
                  ? "bg-white/[0.025] hover:bg-white/[0.06] border-white/[0.05] hover:border-white/[0.10]"
                  : "bg-gray-50 hover:bg-gray-100 border-gray-100 hover:border-gray-200"
              }`}
              style={{ animationDelay: `${540 + i * 55}ms` }}
            >
              <div className={`w-full h-16 rounded-lg mb-2.5 flex items-center justify-center transition-all ${
                dk ? "bg-violet-500/10 group-hover:bg-violet-500/20" : "bg-violet-50 group-hover:bg-violet-100"
              }`}>
                {p.mode === "3d"
                  ? <Box size={22} className="text-violet-400" />
                  : <Palette size={22} className="text-violet-400" />
                }
              </div>
              <div className={`font-semibold text-xs truncate ${dk ? "text-white" : "text-gray-900"}`}>
                {p.title}
              </div>
              <div className={`text-[10px] mt-0.5 uppercase tracking-wide ${dk ? "text-white/25" : "text-gray-400"}`}>
                {(p.mode || "2d")}
              </div>
            </Link>
          ))}
          {projects.length === 0 && (
            <div className={`col-span-4 text-center py-10 ${dk ? "text-white/25" : "text-gray-400"}`}>
              <FolderOpen size={28} className="mx-auto mb-2 opacity-40 animate-float" />
              <p className="text-sm">No projects yet — create one above!</p>
            </div>
          )}
        </div>
      </div>

      {/* Recent Grades */}
      <div className="card">
        <h2 className={`text-base font-semibold mb-4 ${dk ? "text-white" : "text-gray-900"}`}>Recent Grades</h2>
        <div className="space-y-2">
          {submissions.slice(0, 5).map((s, i) => (
            <div key={s.id} className="list-row animate-slide-in-right" style={{ animationDelay: `${650 + i * 50}ms` }}>
              <div className="flex items-center gap-3">
                <div className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 ${
                  dk ? "bg-violet-500/10" : "bg-violet-50"
                }`}>
                  <CheckCircle size={14} className="text-violet-400" />
                </div>
                <div>
                  <div className={`text-sm font-medium ${dk ? "text-white" : "text-gray-900"}`}>
                    {s.assignment_title || "Assignment"}
                  </div>
                  <div className={`text-xs flex items-center gap-1 ${dk ? "text-white/30" : "text-gray-400"}`}>
                    <Clock size={10} />
                    {new Date(s.submitted_at).toLocaleDateString()}
                  </div>
                </div>
              </div>
              <div>
                {s.grade !== null ? (
                  <span className={`text-sm font-bold ${s.grade >= 70 ? "text-emerald-400" : "text-red-400"}`}>
                    {s.grade}%
                  </span>
                ) : (
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                    dk ? "text-white/30 bg-white/[0.05]" : "text-gray-500 bg-gray-100"
                  }`}>
                    Pending
                  </span>
                )}
              </div>
            </div>
          ))}
          {submissions.length === 0 && (
            <p className={`text-center text-sm py-8 ${dk ? "text-white/25" : "text-gray-400"}`}>
              No submissions yet
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
