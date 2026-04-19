import React, { useEffect, useState } from "react";
import { api } from "../lib/api.ts";
import { useAuth } from "../lib/auth.tsx";
import { useTheme } from "../lib/theme.tsx";

const ANIM = `
  @keyframes lb-up    { from { opacity:0; transform:translateY(16px); } to { opacity:1; transform:translateY(0); } }
  @keyframes lb-shine { 0%,100%{opacity:1;} 50%{opacity:.6;} }
  @keyframes lb-pop   { 0%{transform:scale(.75);opacity:0;} 60%{transform:scale(1.15);} 100%{transform:scale(1);opacity:1;} }
  @keyframes lb-rise  { from { opacity:0; transform:translateY(32px) scaleY(.85); } to { opacity:1; transform:translateY(0) scaleY(1); } }
  @keyframes lb-crown { 0%,100%{transform:rotate(-6deg);} 50%{transform:rotate(6deg);} }
  @keyframes lb-glow  { 0%,100%{box-shadow:0 0 24px rgba(245,158,11,0.35);} 50%{box-shadow:0 0 40px rgba(245,158,11,0.55);} }
`;

// Gold / Silver / Bronze palette
const TIER = [
  {
    medal:   "🥇",
    label:   "1st",
    avatarBg: "linear-gradient(135deg,#f59e0b,#d97706)",
    colBg:   "linear-gradient(180deg,rgba(245,158,11,0.18) 0%,transparent 80%)",
    border:  "rgba(245,158,11,0.5)",
    glow:    "0 4px 32px rgba(245,158,11,0.3)",
    textCol: "#fbbf24",
    height:  148,  // podium block height
  },
  {
    medal:   "🥈",
    label:   "2nd",
    avatarBg: "linear-gradient(135deg,#94a3b8,#64748b)",
    colBg:   "linear-gradient(180deg,rgba(148,163,184,0.12) 0%,transparent 80%)",
    border:  "rgba(148,163,184,0.4)",
    glow:    "none",
    textCol: "#cbd5e1",
    height:  112,
  },
  {
    medal:   "🥉",
    label:   "3rd",
    avatarBg: "linear-gradient(135deg,#fb923c,#ea580c)",
    colBg:   "linear-gradient(180deg,rgba(251,146,60,0.12) 0%,transparent 80%)",
    border:  "rgba(251,146,60,0.35)",
    glow:    "none",
    textCol: "#fb923c",
    height:  96,
  },
];

// Podium column order: 2nd (left), 1st (center), 3rd (right)
const PODIUM_ORDER = [1, 0, 2];

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

  const bg     = dk ? "#070714" : "#f0f1f8";
  const surface = dk ? "rgba(255,255,255,0.05)" : "rgba(255,255,255,0.95)";
  const cardBg  = dk ? "rgba(255,255,255,0.03)" : "rgba(255,255,255,0.9)";
  const border  = dk ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.07)";
  const text1   = dk ? "#f1f5f9" : "#0f172a";
  const text2   = dk ? "rgba(255,255,255,0.4)" : "rgba(0,0,0,0.4)";
  const text3   = dk ? "rgba(255,255,255,0.22)" : "rgba(0,0,0,0.22)";

  const entries = tab === "stars" ? stars : assignments;
  const top3    = entries.slice(0, 3);
  const rest    = entries.slice(3);

  function getStat(entry: any) {
    if (tab === "stars") {
      const behaviorStars = Math.max(0, Math.min(5, entry.behavior_stars || 0));
      return {
        primary: behaviorStars,
        secondary: `${(entry.points || 0).toLocaleString()} pts · Lv${entry.level || 1}`,
        pct: null,
      };
    }
    const pct = entry.total_assigned > 0
      ? Math.round(((entry.completed || 0) / entry.total_assigned) * 100)
      : 0;
    return {
      primary: entry.completed || 0,
      secondary: `of ${entry.total_assigned || 0} assigned`,
      pct,
    };
  }

  return (
    <div style={{ minHeight: "100vh", background: bg, padding: "36px 24px 64px", fontFamily: "'Inter',system-ui,sans-serif", color: text1 }}>
      <style>{ANIM}</style>

      {/* ── Header ── */}
      <div style={{ maxWidth: 700, margin: "0 auto 32px", animation: "lb-up .5s ease both" }}>
        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.2em", textTransform: "uppercase", color: text2, marginBottom: 6 }}>
          Rankings
        </div>
        <h1 style={{
          fontSize: 40, fontWeight: 900, letterSpacing: "-0.035em", margin: "0 0 4px",
          background: dk
            ? "linear-gradient(95deg,#f1f5f9 20%,#a78bfa 60%,#818cf8)"
            : "linear-gradient(95deg,#0f172a 20%,#7c3aed 60%,#4f46e5)",
          WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
        }}>
          Leaderboard
        </h1>
        <p style={{ fontSize: 13, color: text2, margin: 0 }}>
          {tab === "stars" ? "Top students by stars earned" : "Top students by assignments completed"}
        </p>

        {/* Tabs */}
        <div style={{
          display: "inline-flex", gap: 4, marginTop: 20,
          background: dk ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.06)",
          borderRadius: 14, padding: 4,
          animation: "lb-up .5s ease .1s both",
        }}>
          {(["stars", "assignments"] as const).map(t => (
            <button key={t} onClick={() => setTab(t)} style={{
              padding: "8px 20px", borderRadius: 11, border: "none", cursor: "pointer",
              fontSize: 12, fontWeight: 700, transition: "all 0.2s",
              background: tab === t
                ? (dk ? "rgba(124,58,237,0.4)" : "#fff")
                : "transparent",
              color: tab === t ? (dk ? "#c4b5fd" : "#7c3aed") : text2,
              boxShadow: tab === t ? (dk ? "0 2px 12px rgba(124,58,237,0.3)" : "0 1px 6px rgba(0,0,0,0.12)") : "none",
            }}>
              {t === "stars" ? "⭐ Stars & Points" : "✅ Assignments"}
            </button>
          ))}
        </div>
      </div>

      <div style={{ maxWidth: 700, margin: "0 auto" }}>
        {/* ── Loading ── */}
        {loading && (
          <div style={{ textAlign: "center", padding: "64px 0", color: text2, fontSize: 14, animation: "lb-shine 1.5s infinite" }}>
            Loading…
          </div>
        )}

        {/* ── Empty ── */}
        {!loading && entries.length === 0 && (
          <div style={{ textAlign: "center", padding: "80px 0", color: text2, fontSize: 14, animation: "lb-up .5s ease both" }}>
            <div style={{ fontSize: 56, marginBottom: 14 }}>🏆</div>
            <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 6, color: text1 }}>No rankings yet</div>
            <div style={{ fontSize: 13 }}>Keep going — rankings will appear here!</div>
          </div>
        )}

        {/* ── Podium (top 3) ── */}
        {!loading && top3.length > 0 && (
          <div style={{
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "center",
            gap: 10,
            marginBottom: 28,
            animation: "lb-up .55s ease .05s both",
          }}>
            {PODIUM_ORDER.map((rankIdx) => {
              const entry = top3[rankIdx];
              if (!entry) return <div key={rankIdx} style={{ width: 180 }} />;

              const tier = TIER[rankIdx];
              const isMe = entry.user_id === user?.id;
              const isFirst = rankIdx === 0;
              const stat = getStat(entry);

              return (
                <div key={entry.user_id} style={{
                  flex: 1,
                  maxWidth: isFirst ? 220 : 190,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  animation: `lb-rise .65s cubic-bezier(.22,1,.36,1) ${160 + rankIdx * 80}ms both`,
                }}>
                  {/* Avatar area */}
                  <div style={{ position: "relative", marginBottom: 10 }}>
                    {/* Crown for 1st */}
                    {isFirst && (
                      <div style={{
                        position: "absolute", top: -22, left: "50%", transform: "translateX(-50%)",
                        fontSize: 22, animation: "lb-crown 3s ease-in-out infinite",
                        filter: "drop-shadow(0 2px 6px rgba(245,158,11,0.6))",
                      }}>
                        👑
                      </div>
                    )}

                    {/* Avatar circle */}
                    <div style={{
                      width: isFirst ? 72 : 58,
                      height: isFirst ? 72 : 58,
                      borderRadius: "50%",
                      background: isMe ? "linear-gradient(135deg,#7c3aed,#4f46e5)" : tier.avatarBg,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      color: "white", fontWeight: 800,
                      fontSize: isFirst ? 26 : 22,
                      border: `3px solid ${tier.border}`,
                      boxShadow: isFirst
                        ? `0 0 0 4px ${dk ? "rgba(245,158,11,0.15)" : "rgba(245,158,11,0.2)"}, ${tier.glow}`
                        : `0 4px 16px rgba(0,0,0,0.25)`,
                      animation: isFirst ? "lb-glow 2.5s ease-in-out infinite" : undefined,
                      transition: "transform .15s",
                    }}>
                      {(entry.name || "?")[0].toUpperCase()}
                    </div>

                    {/* Medal badge */}
                    <div style={{
                      position: "absolute", bottom: -6, right: -6,
                      fontSize: isFirst ? 22 : 18,
                      animation: `lb-pop .55s ease ${200 + rankIdx * 100}ms both`,
                      filter: "drop-shadow(0 2px 4px rgba(0,0,0,0.3))",
                      lineHeight: 1,
                    }}>
                      {tier.medal}
                    </div>
                  </div>

                  {/* Name */}
                  <div style={{
                    fontWeight: 800,
                    fontSize: isFirst ? 15 : 13,
                    color: text1,
                    textAlign: "center",
                    marginBottom: 2,
                    maxWidth: "100%",
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    paddingInline: 4,
                  }}>
                    {entry.name}
                    {isMe && (
                      <span style={{
                        marginLeft: 6, fontSize: 9, fontWeight: 800, padding: "2px 6px",
                        borderRadius: 20, verticalAlign: "middle",
                        background: "rgba(124,58,237,0.2)", color: "#a78bfa",
                        border: "1px solid rgba(124,58,237,0.3)",
                      }}>You</span>
                    )}
                  </div>

                  {/* Stat */}
                  <div style={{
                    fontWeight: 900,
                    fontSize: isFirst ? 22 : 18,
                    color: tier.textCol,
                    lineHeight: 1,
                    marginBottom: 2,
                    fontVariantNumeric: "tabular-nums",
                  }}>
                    {tab === "stars" ? (
                      <span style={{ fontSize: isFirst ? 18 : 14 }}>
                        {"⭐".repeat(stat.primary as number)}
                        <span style={{ opacity: 0.2 }}>{"⭐".repeat(5 - (stat.primary as number))}</span>
                      </span>
                    ) : stat.primary}
                  </div>
                  <div style={{ fontSize: 10, color: text2, textAlign: "center" }}>{stat.secondary}</div>

                  {/* Podium block */}
                  <div style={{
                    width: "100%",
                    height: tier.height,
                    marginTop: 14,
                    borderRadius: "12px 12px 0 0",
                    background: tier.colBg,
                    border: `1px solid ${tier.border}`,
                    borderBottom: "none",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}>
                    <span style={{
                      fontSize: isFirst ? 32 : 26,
                      opacity: 0.18,
                      fontWeight: 900,
                      color: tier.textCol,
                    }}>
                      {rankIdx + 1}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ── Rest of rankings (4th+) ── */}
        {!loading && rest.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {rest.map((entry, i) => {
              const rank = i + 4;
              const isMe = entry.user_id === user?.id;
              const stat = getStat(entry);
              const behaviorStars = Math.max(0, Math.min(5, entry.behavior_stars || 0));

              return (
                <div
                  key={entry.user_id}
                  style={{
                    display: "flex", alignItems: "center", gap: 14,
                    padding: "13px 16px",
                    borderRadius: 16,
                    background: isMe
                      ? "linear-gradient(135deg,rgba(124,58,237,0.14),rgba(99,102,241,0.08))"
                      : cardBg,
                    border: `1px solid ${isMe ? "rgba(124,58,237,0.4)" : border}`,
                    boxShadow: isMe ? "0 0 0 2px rgba(124,58,237,0.18)" : "none",
                    backdropFilter: "blur(8px)",
                    animation: `lb-up .4s ease ${(i + 3) * 45}ms both`,
                    transition: "transform .15s",
                  }}
                  onMouseEnter={e => (e.currentTarget as HTMLElement).style.transform = "translateX(3px)"}
                  onMouseLeave={e => (e.currentTarget as HTMLElement).style.transform = ""}
                >
                  {/* Rank number */}
                  <div style={{
                    width: 36, textAlign: "center", flexShrink: 0,
                    fontSize: 13, fontWeight: 800,
                    fontFamily: "monospace",
                    color: text3,
                  }}>
                    #{rank}
                  </div>

                  {/* Avatar */}
                  <div style={{
                    width: 40, height: 40, borderRadius: "50%", flexShrink: 0,
                    background: isMe
                      ? "linear-gradient(135deg,#7c3aed,#4f46e5)"
                      : "linear-gradient(135deg,#6366f1,#8b5cf6)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    color: "white", fontWeight: 800, fontSize: 15,
                  }}>
                    {(entry.name || "?")[0].toUpperCase()}
                  </div>

                  {/* Name + sub */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <span style={{ fontWeight: 700, fontSize: 14, color: text1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {entry.name}
                      </span>
                      {isMe && (
                        <span style={{
                          fontSize: 9, fontWeight: 800, padding: "2px 7px", borderRadius: 20,
                          background: "rgba(124,58,237,0.2)", color: "#a78bfa",
                          border: "1px solid rgba(124,58,237,0.3)",
                        }}>You</span>
                      )}
                    </div>
                    <div style={{ fontSize: 11, color: text2, marginTop: 1 }}>{stat.secondary}</div>
                  </div>

                  {/* Stat — stars row or number */}
                  <div style={{ textAlign: "right", flexShrink: 0 }}>
                    {tab === "stars" ? (
                      <div style={{ display: "flex", gap: 2, justifyContent: "flex-end" }}>
                        {Array.from({ length: 5 }, (_, si) => (
                          <span key={si} style={{
                            fontSize: 14, lineHeight: 1,
                            opacity: si < behaviorStars ? 1 : 0.14,
                            filter: si < behaviorStars ? "none" : "grayscale(1)",
                          }}>⭐</span>
                        ))}
                      </div>
                    ) : (
                      <div style={{ fontSize: 20, fontWeight: 900, fontVariantNumeric: "tabular-nums", color: text1 }}>
                        {stat.primary}
                      </div>
                    )}
                  </div>

                  {/* Badges (stars tab) */}
                  {tab === "stars" && (entry.badges || []).slice(0, 3).length > 0 && (
                    <div style={{ display: "flex", gap: 3, flexShrink: 0 }}>
                      {(entry.badges || []).slice(0, 3).map((b: string, j: number) => (
                        <span key={j} style={{
                          fontSize: 10, padding: "2px 6px", borderRadius: 8,
                          background: "rgba(245,158,11,0.1)", color: "#fbbf24",
                          border: "1px solid rgba(245,158,11,0.18)",
                        }} title={b}>🏅</span>
                      ))}
                    </div>
                  )}

                  {/* Progress bar (assignments tab) */}
                  {tab === "assignments" && (entry.total_assigned || 0) > 0 && (
                    <div style={{ width: 56, flexShrink: 0 }}>
                      <div style={{ height: 5, borderRadius: 3, background: dk ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)", overflow: "hidden" }}>
                        <div style={{
                          height: "100%", borderRadius: 3, transition: "width 1.2s ease",
                          background: "linear-gradient(90deg,#10b981,#34d399)",
                          width: `${stat.pct}%`,
                        }} />
                      </div>
                      <div style={{ fontSize: 10, color: text2, marginTop: 3, textAlign: "center" }}>
                        {stat.pct}%
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
