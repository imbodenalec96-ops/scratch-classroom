import React, { useEffect, useState } from "react";
import { api } from "../lib/api.ts";
import { useAuth } from "../lib/auth.tsx";
import { useTheme } from "../lib/theme.tsx";
import { useNavigate } from "react-router-dom";

// Assignment-only achievements. IDs match what /leaderboard/auto-award
// awards on the server, so cards light up automatically as kids hit them.
const ALL_BADGES = [
  // Volume
  { id: "first_assignment",   icon: "🎯",  label: "First One Done",   desc: "Finished your first assignment" },
  { id: "5_assignments",      icon: "🔥",  label: "On a Roll",         desc: "Finished 5 assignments" },
  { id: "10_assignments",     icon: "⭐",  label: "Star Student",      desc: "Finished 10 assignments" },
  { id: "25_assignments",     icon: "🏆",  label: "Champion",          desc: "Finished 25 assignments" },
  { id: "50_assignments",     icon: "💎",  label: "Diamond Worker",    desc: "Finished 50 assignments" },
  { id: "100_assignments",    icon: "👑",  label: "Hall of Fame",      desc: "Finished 100 assignments" },
  { id: "200_assignments",    icon: "🌌",  label: "Cosmic Worker",     desc: "Finished 200 assignments" },
  // Quality
  { id: "perfect_score",      icon: "💯",  label: "Perfect Score",     desc: "Got 100% on an assignment" },
  { id: "3_perfect",          icon: "✨",  label: "Triple Perfect",    desc: "Got 100% three times" },
  { id: "10_perfect",         icon: "🥇",  label: "Always Right",      desc: "Got 100% ten times" },
  { id: "50_perfect",         icon: "💠",  label: "Perfectionist",     desc: "Got 100% fifty times" },
  { id: "all_subjects",       icon: "🌟",  label: "Well Rounded",      desc: "Finished an assignment in every subject" },
  // Daily push
  { id: "3_in_a_day",         icon: "⚡",  label: "Speedster",         desc: "Finished 3 assignments in one day" },
  { id: "5_in_a_day",         icon: "🚀",  label: "Power Day",         desc: "Finished 5 assignments in one day" },
  { id: "7_in_a_day",         icon: "🌪️", label: "Tornado Day",       desc: "Finished 7 assignments in one day" },
  // Core subject masters
  { id: "reading_master",     icon: "📚",  label: "Reading Master",    desc: "Finished 10 reading assignments" },
  { id: "math_master",        icon: "🔢",  label: "Math Master",       desc: "Finished 10 math assignments" },
  { id: "writing_master",     icon: "✍️",  label: "Writing Master",    desc: "Finished 10 writing assignments" },
  { id: "spelling_master",    icon: "🔤",  label: "Spelling Master",   desc: "Finished 10 spelling assignments" },
  // Specialty subject masters
  { id: "sel_master",         icon: "🧠",  label: "Mindful",           desc: "Finished 3 SEL lessons" },
  { id: "history_master",     icon: "📜",  label: "Historian",         desc: "Finished 3 history lessons" },
  { id: "science_master",     icon: "🔬",  label: "Scientist",         desc: "Finished 3 science lessons" },
  { id: "vocab_master",       icon: "📖",  label: "Word Wizard",       desc: "Finished 3 vocabulary lessons" },
  // Bonus work
  { id: "bonus_buster",       icon: "🌅",  label: "Bonus Buster",      desc: "Finished an afternoon bonus" },
  { id: "5_bonus",            icon: "✨",  label: "Bonus Champion",    desc: "Finished 5 afternoon bonuses" },
  // Streaks
  { id: "streak_3",           icon: "📅",  label: "3-Day Streak",      desc: "Submitted on 3 days in a row" },
  { id: "streak_5",           icon: "🔥",  label: "5-Day Streak",      desc: "Submitted on 5 days in a row" },
  { id: "streak_10",          icon: "🏅",  label: "10-Day Streak",     desc: "Submitted on 10 days in a row" },
  { id: "streak_15",          icon: "⚡",  label: "Lightning Streak",  desc: "Submitted on 15 days in a row" },
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
      const raw = me || { dojo_points: 0, points: 0, level: 1, badges: [] };
      // Use cumulative dojo_points (badge claims + teacher hand-outs) as
      // the XP source — the legacy `points` column is always 0 for new
      // users so the bar would otherwise look empty even when a kid had
      // earned plenty of badges. Level = 1 + floor(points / 50) so a
      // realistic schoolyear of work fills several levels.
      const xp = Number(raw.dojo_points ?? raw.points ?? 0);
      const computedLevel = 1 + Math.floor(xp / 50);
      const data = { ...raw, points: xp, level: computedLevel, badges: raw.badges || [] };
      setLeaderboard(data);
      // Delay bar fill so the animation is visible
      setTimeout(() => setBarWidth(((xp % 50) / 50) * 100), 250);
    }).catch(() => {
      setLeaderboard({ points: 0, level: 1, badges: [] });
    });
  }, [user]);

  const earned = new Set(leaderboard?.badges || []);
  const xpPerLevel = 50;
  const xpInLevel = (leaderboard?.points ?? 0) % xpPerLevel;
  const xpForNext = xpPerLevel;

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center gap-4">
        <button
          onClick={() => navigate(-1)}
          style={{
            background: "rgba(99,102,241,0.18)",
            color: "#a5b4fc",
            border: "none",
            borderRadius: 14,
            padding: "10px 22px",
            fontWeight: 700,
            fontSize: 15,
            boxShadow: "0 2px 10px rgba(99,102,241,0.12)",
            cursor: "pointer",
            flexShrink: 0,
          }}
          aria-label="Back"
        >
          ← Back
        </button>
        <h1 className="text-2xl font-bold tracking-tight text-t1 animate-slide-up">Achievements</h1>
      </div>

      {leaderboard && (
        <div className="card max-w-md animate-slide-up" style={{ animationDelay: "80ms" }}>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-violet-600 flex items-center justify-center text-white text-xs font-bold shadow-lg shadow-violet-600/30">
                {leaderboard.level}
              </div>
              <span className="text-sm font-semibold text-t1">Level {leaderboard.level}</span>
            </div>
            <span className="text-xs text-t3 tabular-nums">{xpInLevel} / {xpForNext} XP</span>
          </div>
          <div className="w-full h-3 rounded-full overflow-hidden" style={{ background: "var(--bg-hover)" }}>
            <div className="xp-bar-fill" style={{ width: `${barWidth}%` }} />
          </div>
          <div className="mt-2 flex items-center justify-between">
            <span className="text-xs text-t3">{xpForNext - xpInLevel} XP to next level</span>
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
