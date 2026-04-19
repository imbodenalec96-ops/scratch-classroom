import React, { useEffect, useState } from "react";
import { api } from "../lib/api.ts";
import { useAuth } from "../lib/auth.tsx";
import { useTheme } from "../lib/theme.tsx";

const ANIM = `
  @keyframes lb-up { from { opacity:0; transform:translateY(14px); } to { opacity:1; transform:translateY(0); } }
  @keyframes lb-shine { 0%,100%{opacity:1;} 50%{opacity:.65;} }
  @keyframes lb-pop { 0%{transform:scale(.8);opacity:0;} 60%{transform:scale(1.12);} 100%{transform:scale(1);opacity:1;} }
`;

const MEDALS = ["🥇", "🥈", "🥉"];

export default function Leaderboard() {
  const { user } = useAuth();
  const { theme } = useTheme();
  const dk = theme === "dark";

  const [tab, setTab] = useState<"stars" | "assignments">("stars");
  const [stars, setStars] = useState<any[]>([]);
  const [assignments, setAssignments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      api.getLeaderboard().catch(() => []),
      api.getAssignmentLeaderboard().catch(() => []),
    ]).then(([s, a]) => {
      setStars(s);
      setAssignments(a);
      setLoading(false);
    });
  }, []);

  const bg = dk ? "#070714" : "#f0f1f8";
  const surface = dk ? "rgba(255,255,255,0.05)" : "rgba(255,255,255,0.95)";
  const border = dk ? "rgba(255,255,255,0.09)" : "rgba(0,0,0,0.07)";
  const text1 = dk ? "#f1f5f9" : "#0f172a";
  const text2 = dk ? "rgba(255,255,255,0.45)" : "rgba(0,0,0,0.45)";

  const entries = tab === "stars" ? stars : assignments;

  function rankColor(i: number) {
    if (i === 0) return { bg: "linear-gradient(135deg,rgba(245,158,11,0.18),rgba(234,179,8,0.1))", border: "rgba(245,158,11,0.5)", glow: "rgba(245,158,11,0.25)" };
    if (i === 1) return { bg: "linear-gradient(135deg,rgba(148,163,184,0.14),rgba(100,116,139,0.08))", border: "rgba(148,163,184,0.45)", glow: "transparent" };
    if (i === 2) return { bg: "linear-gradient(135deg,rgba(251,146,60,0.14),rgba(234,88,12,0.08))", border: "rgba(251,146,60,0.4)", glow: "transparent" };
    return { bg: surface, border, glow: "transparent" };
  }

  return (
    <div style={{ minHeight: "100vh", background: bg, padding: "32px 24px", fontFamily: "'Inter',system-ui,sans-serif", color: text1 }}>
      <style>{ANIM}</style>

      {/* Header */}
      <div style={{ maxWidth: 680, margin: "0 auto 28px" }}>
        <div style={{ animation: "lb-up .5s ease both" }}>
          <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.18em", textTransform: "uppercase", color: text2, marginBottom: 8 }}>
            Rankings
          </div>
          <h1 style={{
            fontSize: 38, fontWeight: 900, letterSpacing: "-0.03em", margin: 0,
            background: dk
              ? "linear-gradient(90deg,#f1f5f9,#a78bfa,#818cf8)"
              : "linear-gradient(90deg,#0f172a,#7c3aed,#4f46e5)",
            WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
          }}>
            Leaderboard
          </h1>
          <p style={{ fontSize: 13, marginTop: 6, color: text2 }}>
            {tab === "stars" ? "Top students by stars earned" : "Top students by assignments completed"}
          </p>
        </div>

        {/* Tabs */}
        <div style={{
          display: "flex", gap: 6, marginTop: 20,
          background: dk ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.05)",
          borderRadius: 12, padding: 4, width: "fit-content",
          animation: "lb-up .5s ease .1s both",
        }}>
          {(["stars", "assignments"] as const).map(t => (
            <button key={t} onClick={() => setTab(t)} style={{
              padding: "7px 18px", borderRadius: 9, border: "none", cursor: "pointer",
              fontSize: 12, fontWeight: 700, transition: "all 0.2s",
              background: tab === t
                ? (dk ? "rgba(124,58,237,0.35)" : "#fff")
                : "transparent",
              color: tab === t ? (dk ? "#c4b5fd" : "#7c3aed") : text2,
              boxShadow: tab === t ? (dk ? "none" : "0 1px 4px rgba(0,0,0,0.12)") : "none",
            }}>
              {t === "stars" ? "⭐ Stars & Points" : "✅ Assignments"}
            </button>
          ))}
        </div>
      </div>

      {/* List */}
      <div style={{ maxWidth: 680, margin: "0 auto", display: "flex", flexDirection: "column", gap: 8 }}>
        {loading && (
          <div style={{ textAlign: "center", padding: "48px 0", color: text2, fontSize: 14, animation: "lb-shine 1.5s infinite" }}>
            Loading…
          </div>
        )}

        {!loading && entries.length === 0 && (
          <div style={{ textAlign: "center", padding: "64px 0", color: text2, fontSize: 14, animation: "lb-up .5s ease both" }}>
            <div style={{ fontSize: 52, marginBottom: 12 }}>🏆</div>
            <div>No data yet — keep going!</div>
          </div>
        )}

        {!loading && entries.map((entry, i) => {
          const isMe = entry.user_id === user?.id;
          const rc = rankColor(i);
          const behaviorStars = Math.max(0, Math.min(5, entry.behavior_stars || 0));
          const mainStat = tab === "stars"
            ? { value: behaviorStars, label: "stars", sub: `${(entry.points || 0).toLocaleString()} pts · Lv${entry.level || 1}` }
            : { value: String(entry.completed || 0), label: "done", sub: `${entry.total_assigned || 0} assigned` };

          return (
            <div key={entry.user_id} style={{
              display: "flex", alignItems: "center", gap: 14,
              padding: "14px 18px",
              background: isMe ? "linear-gradient(135deg,rgba(124,58,237,0.16),rgba(99,102,241,0.10))" : rc.bg,
              border: `1px solid ${isMe ? "rgba(124,58,237,0.45)" : rc.border}`,
              borderRadius: 16, backdropFilter: "blur(8px)",
              boxShadow: isMe ? "0 0 0 2px rgba(124,58,237,0.25)" : (rc.glow !== "transparent" ? `0 0 24px ${rc.glow}` : "none"),
              animation: `lb-up .45s ease ${100 + i * 40}ms both`,
              transition: "transform 0.15s",
            }}
              onMouseEnter={e => (e.currentTarget as HTMLElement).style.transform = "translateX(3px)"}
              onMouseLeave={e => (e.currentTarget as HTMLElement).style.transform = ""}
            >
              {/* Rank */}
              <div style={{ width: 38, textAlign: "center", flexShrink: 0 }}>
                {i < 3 ? (
                  <span style={{ fontSize: 24, animation: `lb-pop .5s ease ${160 + i * 80}ms both`, display: "inline-block" }}>
                    {MEDALS[i]}
                  </span>
                ) : (
                  <span style={{ fontSize: 13, fontWeight: 800, fontFamily: "monospace", color: text2 }}>#{i + 1}</span>
                )}
              </div>

              {/* Avatar */}
              <div style={{
                width: 42, height: 42, borderRadius: "50%", flexShrink: 0,
                background: isMe
                  ? "linear-gradient(135deg,#7c3aed,#4f46e5)"
                  : (i === 0 ? "linear-gradient(135deg,#f59e0b,#d97706)" : "linear-gradient(135deg,#6366f1,#8b5cf6)"),
                display: "flex", alignItems: "center", justifyContent: "center",
                color: "white", fontWeight: 800, fontSize: 16,
                boxShadow: i === 0 ? "0 4px 12px rgba(245,158,11,0.4)" : "none",
              }}>
                {(entry.name || "?")[0].toUpperCase()}
              </div>

              {/* Name */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <span style={{ fontWeight: 700, fontSize: 15, color: text1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {entry.name}
                  </span>
                  {isMe && (
                    <span style={{
                      fontSize: 10, fontWeight: 800, padding: "2px 8px", borderRadius: 20,
                      background: "rgba(124,58,237,0.2)", color: "#a78bfa",
                      border: "1px solid rgba(124,58,237,0.35)",
                    }}>
                      You
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 12, color: text2, marginTop: 1 }}>{mainStat.sub}</div>
              </div>

              {/* Stat */}
              <div style={{ textAlign: "right", flexShrink: 0 }}>
                {tab === "stars" ? (
                  <>
                    <div style={{ display: "flex", gap: 2, justifyContent: "flex-end", marginBottom: 3 }}>
                      {Array.from({ length: 5 }, (_, si) => (
                        <span key={si} style={{
                          fontSize: 16, lineHeight: 1,
                          opacity: si < behaviorStars ? 1 : 0.15,
                          filter: si < behaviorStars ? (i === 0 ? "drop-shadow(0 0 4px rgba(251,191,36,0.8))" : "none") : "grayscale(1)",
                        }}>⭐</span>
                      ))}
                    </div>
                    <div style={{ fontSize: 10, color: text2, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                      {mainStat.sub}
                    </div>
                  </>
                ) : (
                  <>
                    <div style={{ fontSize: 22, fontWeight: 900, fontVariantNumeric: "tabular-nums", color: i === 0 ? "#fbbf24" : text1 }}>
                      {mainStat.value}
                    </div>
                    <div style={{ fontSize: 10, color: text2, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                      {mainStat.label}
                    </div>
                  </>
                )}
              </div>

              {/* Badges (stars tab only) */}
              {tab === "stars" && (entry.badges || []).slice(0, 3).length > 0 && (
                <div style={{ display: "flex", gap: 3, flexShrink: 0 }}>
                  {(entry.badges || []).slice(0, 3).map((b: string, j: number) => (
                    <span key={j} style={{
                      fontSize: 11, padding: "2px 6px", borderRadius: 8,
                      background: "rgba(245,158,11,0.12)", color: "#fbbf24",
                      border: "1px solid rgba(245,158,11,0.2)",
                    }} title={b}>🏅</span>
                  ))}
                </div>
              )}

              {/* Progress bar (assignments tab) */}
              {tab === "assignments" && (entry.total_assigned || 0) > 0 && (
                <div style={{ width: 60, flexShrink: 0 }}>
                  <div style={{ height: 6, borderRadius: 3, background: dk ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.08)", overflow: "hidden" }}>
                    <div style={{
                      height: "100%", borderRadius: 3, transition: "width 1s ease",
                      background: "linear-gradient(90deg,#10b981,#34d399)",
                      width: `${Math.round(((entry.completed || 0) / (entry.total_assigned || 1)) * 100)}%`,
                    }} />
                  </div>
                  <div style={{ fontSize: 10, color: text2, marginTop: 3, textAlign: "center" }}>
                    {Math.round(((entry.completed || 0) / (entry.total_assigned || 1)) * 100)}%
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
