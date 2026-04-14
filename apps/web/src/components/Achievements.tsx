import React, { useEffect, useState } from "react";
import { api } from "../lib/api.ts";
import { useAuth } from "../lib/auth.tsx";

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
  const [leaderboard, setLeaderboard] = useState<any>(null);

  useEffect(() => {
    api.getLeaderboard().then((entries) => {
      const me = entries.find((e: any) => e.user_id === user?.id);
      setLeaderboard(me || { points: 0, level: 1, badges: [] });
    }).catch(() => setLeaderboard({ points: 0, level: 1, badges: [] }));
  }, [user]);

  const earned = new Set(leaderboard?.badges || []);
  const xpForNext = (leaderboard?.level || 1) * 100;
  const progress = leaderboard ? (leaderboard.points % 100) : 0;

  return (
    <div className="p-8 space-y-6 animate-fade-in">
      <h1 className="text-3xl font-bold text-white">Achievements</h1>
      {leaderboard && (
        <div className="card max-w-md">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-white">Level {leaderboard.level}</span>
            <span className="text-xs text-white/30">{leaderboard.points} / {xpForNext} XP</span>
          </div>
          <div className="w-full h-3 bg-white/[0.06] rounded-full overflow-hidden">
            <div className="h-full bg-gradient-to-r from-violet-500 to-indigo-400 rounded-full transition-all"
              style={{ width: `${progress}%` }} />
          </div>
          <div className="mt-2 text-xs text-white/30 text-center">{xpForNext - (leaderboard.points % 100)} XP to next level</div>
        </div>
      )}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {ALL_BADGES.map((badge) => {
          const isEarned = earned.has(badge.id);
          return (
            <div key={badge.id}
              className={`card text-center transition-all ${isEarned ? "ring-2 ring-yellow-400/30 bg-yellow-500/5" : "opacity-40 grayscale"}`}>
              <div className="text-4xl mb-2">{badge.icon}</div>
              <div className="text-sm font-semibold text-white">{badge.label}</div>
              <div className="text-[10px] text-white/40 mt-1">{badge.desc}</div>
              {isEarned && <div className="text-[10px] text-yellow-400 mt-2">✓ Earned</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
