import React, { useEffect, useState } from "react";
import { api } from "../lib/api.ts";
import { useAuth } from "../lib/auth.tsx";
import { useTheme } from "../lib/theme.tsx";
import { useNavigate } from "react-router-dom";

const ALL_BADGES = [
  { id: "first_project", icon: "🚀", label: "First Project", desc: "Created your first project" },
  { id: "10_blocks", icon: "🧱", label: "Block Builder", desc: "Used 10+ blocks in a project" },
  { id: "3d_explorer", icon: "🌐", label: "3D Explorer", desc: "Created a 3D project" },
  { id: "quiz_ace", icon: "💯", label: "Quiz Ace", desc: "Scored 100% on a quiz" },
  { id: "team_player", icon: "🤝", label: "Team Player", desc: "Collaborated on a project" },
  { id: "streak_7", icon: "🔥", label: "7-Day Streak", desc: "Logged in 7 days in a row" },
  { id: "debugger", icon: "🐛", label: "Debugger", desc: "Fixed 10+ errors" },
  { id: "creative", icon: "🎨", label: "Creative Mind", desc: "Used 5+ sprite costumes" },
  { id: "helper", icon: "💬", label: "Class Helper", desc: "Sent 50+ chat messages" },
  { id: "speedster", icon: "⚡", label: "Speed Coder", desc: "Completed an assignment early" },
];

export default function Achievements() {
  const { user } = useAuth();
  const { theme } = useTheme();
  const dk = theme === "dark";
  const navigate = useNavigate();
  const [leaderboard, setLeaderboard] = useState<any>(null);
  const [barWidth, setBarWidth] = useState(0);

  useEffect(() => {
    api.getLeaderboard().then((entries) => {
      const me = entries.find((e: any) => e.user_id === user?.id);
      const data = me || { points: 0, level: 1, badges: [] };
      setLeaderboard(data);
      // Delay bar fill so the animation is visible
      setTimeout(() => setBarWidth(data.points % 100), 250);
    }).catch(() => {
      setLeaderboard({ points: 0, level: 1, badges: [] });
    });
  }, [user]);

  const earned = new Set(leaderboard?.badges || []);
  const xpForNext = (leaderboard?.level || 1) * 100;

  return (
    <div className="p-8 space-y-6">
      {/* Back button */}
      <button
        onClick={() => navigate(-1)}
        style={{
          position: "fixed",
          top: 18,
          left: 18,
          zIndex: 100,
          background: "rgba(139,92,246,0.18)",
          color: "#c4b5fd",
          border: "none",
          borderRadius: 14,
          padding: "10px 22px",
          fontWeight: 700,
          fontSize: 16,
          boxShadow: "0 2px 10px rgba(139,92,246,0.10)",
          cursor: "pointer",
          transition: "background 0.15s, color 0.15s",
        }}
        aria-label="Back"
      >
        ← Back
      </button>
      <h1 className="text-2xl font-bold tracking-tight text-t1 animate-slide-up">Achievements</h1>

      {leaderboard && (
        <div className="card max-w-md animate-slide-up" style={{ animationDelay: "80ms" }}>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-violet-600 flex items-center justify-center text-white text-xs font-bold shadow-lg shadow-violet-600/30">
                {leaderboard.level}
              </div>
              <span className="text-sm font-semibold text-t1">Level {leaderboard.level}</span>
            </div>
            <span className="text-xs text-t3 tabular-nums">{leaderboard.points} / {xpForNext} XP</span>
          </div>
          <div className="w-full h-3 rounded-full overflow-hidden" style={{ background: "var(--bg-hover)" }}>
            <div className="xp-bar-fill" style={{ width: `${barWidth}%` }} />
          </div>
          <div className="mt-2 flex items-center justify-between">
            <span className="text-xs text-t3">{xpForNext - (leaderboard.points % 100)} XP to next level</span>
            <span className="text-xs font-medium" style={{ color: "var(--text-accent)" }}>
              {earned.size} / {ALL_BADGES.length} badges
            </span>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {ALL_BADGES.map((badge, i) => {
          const isEarned = earned.has(badge.id);
          return (
            <div
              key={badge.id}
              className={`card text-center transition-all duration-300 animate-scale-in select-none ${
                isEarned
                  ? "ring-2 ring-yellow-400/30 hover:-translate-y-1 hover:shadow-lg cursor-default"
                  : "opacity-40 grayscale hover:opacity-55 hover:grayscale-0"
              }`}
              style={{
                animationDelay: `${160 + i * 50}ms`,
                ...(isEarned ? { background: dk ? "rgba(234,179,8,0.05)" : "rgba(234,179,8,0.04)" } : {}),
              }}
            >
              <div
                className={`text-4xl mb-2 transition-transform duration-200 ${isEarned ? "hover:scale-125 animate-bounce-in" : ""}`}
                style={{ animationDelay: `${200 + i * 50}ms` }}
              >
                {badge.icon}
              </div>
              <div className="text-sm font-semibold text-t1">{badge.label}</div>
              <div className="text-[10px] text-t3 mt-1 leading-tight">{badge.desc}</div>
              {isEarned && (
                <div className="text-[10px] text-yellow-500 mt-2 font-semibold flex items-center justify-center gap-1 animate-fade-in"
                  style={{ animationDelay: `${300 + i * 50}ms` }}>
                  <span className="animate-check-pop inline-block">✓</span> Earned
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
