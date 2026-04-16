import React, { useEffect, useState } from "react";
import { api } from "../lib/api.ts";
import { useAuth } from "../lib/auth.tsx";
import { useTheme } from "../lib/theme.tsx";

export default function Leaderboard() {
  const { user } = useAuth();
  const { theme } = useTheme();
  const dk = theme === "dark";
  const [entries, setEntries] = useState<any[]>([]);

  useEffect(() => { api.getLeaderboard().then(setEntries).catch(console.error); }, []);

  const medals = ["🥇", "🥈", "🥉"];

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center gap-3 animate-slide-up">
        <h1 className="text-2xl font-bold tracking-tight text-t1">Leaderboard</h1>
        {entries.length > 0 && (
          <span className="text-xs text-t3 px-2.5 py-1 rounded-full border animate-fade-in" style={{ background: "var(--bg-muted)", borderColor: "var(--border)" }}>
            {entries.length} students
          </span>
        )}
      </div>

      <div className="max-w-2xl mx-auto space-y-2">
        {entries.map((entry, i) => {
          const isMe = entry.user_id === user?.id;
          return (
            <div
              key={entry.user_id}
              className={`card flex items-center gap-4 transition-all duration-200 hover:scale-[1.015] hover:-translate-y-px animate-slide-in-right ${
                isMe ? "ring-2 ring-violet-400/40 animate-glow-pulse" : ""
              }`}
              style={{ animationDelay: `${100 + i * 50}ms` }}
            >
              {/* Rank */}
              <div className="text-2xl w-10 text-center flex-shrink-0">
                {i < 3 ? (
                  <span className="animate-rank-drop inline-block" style={{ animationDelay: `${160 + i * 80}ms` }}>
                    {medals[i]}
                  </span>
                ) : (
                  <span className="text-t3 text-sm font-mono">#{i + 1}</span>
                )}
              </div>

              {/* Avatar */}
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center text-white font-bold flex-shrink-0 shadow-md shadow-violet-600/20">
                {entry.name?.charAt(0) || "?"}
              </div>

              {/* Name */}
              <div className="flex-1 min-w-0">
                <div className="font-medium text-t1 flex items-center gap-2 flex-wrap">
                  <span className="truncate">{entry.name}</span>
                  {isMe && (
                    <span className="text-xs px-1.5 py-0.5 rounded-full font-semibold animate-scale-in flex-shrink-0"
                      style={{ color: "var(--text-accent)", background: "var(--accent-light)", border: "1px solid color-mix(in srgb,var(--accent) 30%,transparent)" }}>
                      You
                    </span>
                  )}
                </div>
                <div className="text-xs text-t3">Level {entry.level}</div>
              </div>

              {/* Badges + points */}
              <div className="flex items-center gap-4 flex-shrink-0">
                <div className="flex gap-1">
                  {(entry.badges || []).slice(0, 3).map((b: string, j: number) => (
                    <span key={j} className="text-xs px-1.5 py-0.5 rounded bg-yellow-500/10 text-yellow-500 border border-yellow-500/10 hover:scale-110 transition-transform cursor-default" title={b}>🏅</span>
                  ))}
                </div>
                <div className="text-right min-w-[56px]">
                  <div className="text-lg font-bold text-t1 tabular-nums">{entry.points.toLocaleString()}</div>
                  <div className="text-[10px] text-t3">points</div>
                </div>
              </div>
            </div>
          );
        })}
        {entries.length === 0 && (
          <div className="text-center text-t3 py-12 flex flex-col items-center gap-3 animate-fade-in">
            <span className="text-5xl animate-float">🏆</span>
            <span className="text-sm">No leaderboard data yet</span>
          </div>
        )}
      </div>
    </div>
  );
}
