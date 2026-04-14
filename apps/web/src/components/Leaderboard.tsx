import React, { useEffect, useState } from "react";
import { api } from "../lib/api.ts";
import { useAuth } from "../lib/auth.tsx";

export default function Leaderboard() {
  const { user } = useAuth();
  const [entries, setEntries] = useState<any[]>([]);

  useEffect(() => { api.getLeaderboard().then(setEntries).catch(console.error); }, []);

  const medals = ["🥇", "🥈", "🥉"];

  return (
    <div className="p-8 space-y-6 animate-fade-in">
      <h1 className="text-3xl font-bold text-white">Leaderboard</h1>
      <div className="max-w-2xl mx-auto space-y-2">
        {entries.map((entry, i) => {
          const isMe = entry.user_id === user?.id;
          return (
            <div key={entry.user_id}
              className={`card flex items-center gap-4 transition-all duration-200 hover:scale-[1.01] ${isMe ? "ring-2 ring-violet-400/50" : ""}`}>
              <div className="text-2xl w-10 text-center">
                {i < 3 ? medals[i] : <span className="text-white/20 text-sm">#{i + 1}</span>}
              </div>
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center text-white font-bold">
                {entry.name?.charAt(0) || "?"}
              </div>
              <div className="flex-1">
                <div className="font-medium text-white">
                  {entry.name} {isMe && <span className="text-xs text-violet-400">(You)</span>}
                </div>
                <div className="text-xs text-white/30">Level {entry.level}</div>
              </div>
              <div className="flex items-center gap-4">
                <div className="flex gap-1">
                  {(entry.badges || []).slice(0, 3).map((b: string, j: number) => (
                    <span key={j} className="text-xs px-1.5 py-0.5 rounded bg-yellow-500/10 text-yellow-400" title={b}>🏅</span>
                  ))}
                </div>
                <div className="text-right">
                  <div className="text-lg font-bold text-white">{entry.points}</div>
                  <div className="text-[10px] text-white/30">points</div>
                </div>
              </div>
            </div>
          );
        })}
        {entries.length === 0 && <div className="text-center text-white/30 py-8">No leaderboard data yet</div>}
      </div>
    </div>
  );
}
