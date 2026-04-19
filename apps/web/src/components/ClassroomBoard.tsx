import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "../lib/api.ts";
import { findCurrentBlock, findNextBlock, type ScheduleBlock } from "../lib/useCurrentBlock.ts";

const DAY_LETTERS = ["A", "B", "C", "D", "E", "F"] as const;
const GRADES = [3, 4, 5] as const;

const MUSIC_PRESETS: { id: string; label: string; videoId: string; emoji: string }[] = [
  { id: "forest",   label: "Forest Spa",     videoId: "xNN7iTA57jM", emoji: "🌿" },
  { id: "ocean",    label: "Ocean Waves",    videoId: "MIr3RsUWrdo", emoji: "🌊" },
  { id: "rain",     label: "Gentle Rain",    videoId: "mPZkdNFkNps", emoji: "🌧" },
  { id: "piano",    label: "Spa Piano",      videoId: "4xDzrJKXOOY", emoji: "🎹" },
  { id: "tibetan",  label: "Healing Bowls",  videoId: "UgHKb_7884o", emoji: "🔔" },
];

const GRADE_COLORS: Record<number, { from: string; to: string; border: string; text: string; glow: string }> = {
  3: { from: "rgba(20,184,166,0.22)", to: "rgba(6,182,212,0.12)", border: "rgba(20,184,166,0.55)", text: "#5eead4", glow: "rgba(20,184,166,0.4)" },
  4: { from: "rgba(251,146,60,0.22)", to: "rgba(245,158,11,0.12)", border: "rgba(251,146,60,0.55)", text: "#fdba74", glow: "rgba(251,146,60,0.4)" },
  5: { from: "rgba(167,139,250,0.22)", to: "rgba(139,92,246,0.12)", border: "rgba(167,139,250,0.55)", text: "#c4b5fd", glow: "rgba(167,139,250,0.4)" },
};

const BEHAVIOR_LEVELS: Record<number, { label: string; short: string; icon: string; color: string; bg: string; glow: string }> = {
  1: { label: "Level 1",  short: "Lv 1",  icon: "1", color: "#fca5a5", bg: "rgba(239,68,68,0.22)",   glow: "rgba(239,68,68,0.25)" },
  2: { label: "Level 2",  short: "Lv 2",  icon: "2", color: "#fdba74", bg: "rgba(251,146,60,0.22)", glow: "rgba(251,146,60,0.25)" },
  3: { label: "Level 3",  short: "Lv 3",  icon: "3", color: "#fcd34d", bg: "rgba(245,158,11,0.22)", glow: "rgba(245,158,11,0.25)" },
  4: { label: "Level 4",  short: "Lv 4",  icon: "4", color: "#86efac", bg: "rgba(34,197,94,0.22)",  glow: "rgba(34,197,94,0.25)" },
  5: { label: "Level 5",  short: "Lv 5",  icon: "5", color: "#6ee7b7", bg: "rgba(16,185,129,0.25)", glow: "rgba(16,185,129,0.3)" },
};

const ACTIVITY_EMOJI: Array<[string, string]> = [
  ["PE", "🏃"], ["Gym", "🏃"], ["Music", "🎵"], ["Art", "🎨"], ["Library", "📚"],
  ["Tech", "💻"], ["Dance", "💃"], ["Science", "🔬"], ["Drama", "🎭"], ["Spanish", "🗣"],
];
function actEmoji(name = "") {
  for (const [k, v] of ACTIVITY_EMOJI) if (name.toLowerCase().includes(k.toLowerCase())) return v;
  return "✨";
}

const SUBJECT_ACCENT: Record<string, string> = {
  math: "#ef4444", sel: "#f59e0b", coding_art_gym: "#a78bfa",
  video_learning: "#3b82f6", writing: "#10b981", daily_news: "#6366f1",
  review: "#ec4899", cashout: "#f59e0b", lunch: "#22c55e", recess: "#22c55e",
  calm_down: "#a78bfa", ted_talk: "#3b82f6",
};

const ANIM = `
  @keyframes starGlow {
    0%,100% { filter: drop-shadow(0 0 4px rgba(251,191,36,.9)); }
    50%      { filter: drop-shadow(0 0 11px rgba(251,191,36,1)) drop-shadow(0 0 22px rgba(245,158,11,.7)); }
  }
  @keyframes cardPulse {
    0%,100% { box-shadow: 0 0 18px rgba(245,158,11,.3), inset 0 0 16px rgba(245,158,11,.06); }
    50%      { box-shadow: 0 0 36px rgba(245,158,11,.55), inset 0 0 28px rgba(245,158,11,.12); }
  }
  @keyframes popIn {
    from { opacity:0; transform:scale(.9) translateY(6px); }
    to   { opacity:1; transform:scale(1)  translateY(0); }
  }
  @keyframes shimmer {
    0%   { background-position:-200% center; }
    100% { background-position: 200% center; }
  }
  @keyframes breathe {
    0%,100% { transform:scale(1); opacity:.85; }
    50%     { transform:scale(1.015); opacity:1; }
  }
  @keyframes rewardBounce {
    0%,100% { transform:scale(1) rotate(0deg); }
    30%     { transform:scale(1.25) rotate(-8deg); }
    60%     { transform:scale(1.15) rotate(6deg); }
  }
  @keyframes blockBreathe {
    0%,100% { box-shadow:0 0 25px rgba(139,92,246,.3); }
    50%     { box-shadow:0 0 50px rgba(139,92,246,.6), 0 0 80px rgba(99,102,241,.2); }
  }
  @keyframes tickPulse {
    0%,100% { opacity:1; }
    50%     { opacity:.55; }
  }
  @keyframes gradShift {
    0%,100% { background-position:0% 50%; }
    50%     { background-position:100% 50%; }
  }
  @keyframes floatUp {
    0%,100% { transform:translateY(0); }
    50%     { transform:translateY(-3px); }
  }
  @keyframes slideIn {
    from { opacity: 0; transform: translateX(-8px); }
    to   { opacity: 1; transform: translateX(0); }
  }
  @keyframes pulseRing {
    0%   { box-shadow: 0 0 0 0 rgba(139,92,246,0.5); }
    70%  { box-shadow: 0 0 0 10px rgba(139,92,246,0); }
    100% { box-shadow: 0 0 0 0 rgba(139,92,246,0); }
  }
  @keyframes starPop {
    0%   { transform: scale(1); }
    40%  { transform: scale(1.35) rotate(-5deg); }
    70%  { transform: scale(0.9) rotate(3deg); }
    100% { transform: scale(1) rotate(0deg); }
  }
`;

export default function ClassroomBoard() {
  const [params] = useSearchParams();
  const classParam = (params.get("class") || "").trim().toLowerCase();

  const [cls, setCls] = useState<any | null>(null);
  const [schedule, setSchedule] = useState<ScheduleBlock[]>([]);
  const [board, setBoard] = useState<{ students: any[]; schedules: any[]; specials: any[]; settings: Record<string,string> }>(
    { students: [], schedules: [], specials: [], settings: {} }
  );
  const [now, setNow] = useState(new Date());
  const [error, setError] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [musicPlaying, setMusicPlaying] = useState(false);
  const [musicLoaded, setMusicLoaded] = useState(false);
  const musicRef = useRef<HTMLIFrameElement>(null);

  const toggleFullscreen = useCallback(async () => {
    if (!document.fullscreenElement) {
      await document.documentElement.requestFullscreen?.().catch(() => {});
    } else {
      await document.exitFullscreen?.().catch(() => {});
    }
  }, []);

  const toggleMusic = useCallback(() => {
    if (!musicRef.current) return;
    const preset = MUSIC_PRESETS.find(p => p.id === (board.settings?.music_playlist_id || ""));
    if (!preset) return;
    if (!musicLoaded) {
      // First tap: assign src synchronously inside gesture so iOS allows autoplay
      musicRef.current.src = `https://www.youtube-nocookie.com/embed/${preset.videoId}?autoplay=1&loop=1&playlist=${preset.videoId}&enablejsapi=1`;
      setMusicLoaded(true);
      setMusicPlaying(true);
    } else {
      const fn = musicPlaying ? "pauseVideo" : "playVideo";
      musicRef.current.contentWindow?.postMessage(JSON.stringify({ event: "command", func: fn, args: "" }), "*");
      setMusicPlaying(p => !p);
    }
  }, [musicPlaying, musicLoaded, board.settings]);

  useEffect(() => {
    const h = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", h);
    return () => document.removeEventListener("fullscreenchange", h);
  }, []);
  useEffect(() => { const iv = setInterval(() => setNow(new Date()), 15_000); return () => clearInterval(iv); }, []);

  // Prevent any scroll bleed from the parent page
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
      document.documentElement.style.overflow = "";
    };
  }, []);

  useEffect(() => {
    let done = false;
    api.getClasses().then((cs: any[]) => {
      if (done) return;
      if (!cs?.length) { setError("No classes available"); return; }
      setCls(cs.find(c => c.id === classParam) || cs.find(c => String(c.name).toLowerCase() === classParam) || cs[0]);
    }).catch(() => { if (!done) setError("Couldn't load classes"); });
    return () => { done = true; };
  }, [classParam]);

  useEffect(() => {
    if (!cls?.id) return;
    let done = false;
    const load = () => {
      api.getClassSchedule(cls.id).then(r => { if (!done) setSchedule(Array.isArray(r) ? r : []); }).catch(() => {});
      api.getBoardData(cls.id).then((d: any) => {
        if (done) return;
        setBoard({ students: d?.students||[], schedules: d?.schedules||[], specials: d?.specials||[], settings: d?.settings||{} });
      }).catch(() => {});
    };
    load();
    const iv = setInterval(load, 15_000);
    return () => { done = true; clearInterval(iv); };
  }, [cls?.id]);

  const currentBlock = useMemo(() => findCurrentBlock(schedule, now), [schedule, now]);
  const nextBlock    = useMemo(() => findNextBlock(schedule, now), [schedule, now]);

  const timeStr = now.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  const dateStr = now.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
  const dayLetter = (board.settings?.current_specials_day || "A").toUpperCase();

  const countdown = useMemo(() => {
    if (!currentBlock) return null;
    const [h, m] = (currentBlock.end_time || "").split(":").map(Number);
    if (!Number.isFinite(h)) return null;
    const diff = new Date(now).setHours(h, m, 0, 0) - now.getTime();
    if (diff <= 0) return null;
    const mm = Math.floor(diff / 60000), ss = Math.floor((diff % 60000) / 1000);
    return { str: `${mm}:${String(ss).padStart(2, "0")}`, urgent: mm < 2 };
  }, [currentBlock, now]);

  if (error) return <div className="min-h-screen flex items-center justify-center bg-black text-red-400 text-2xl">{error}</div>;
  if (!cls)  return <div className="min-h-screen flex items-center justify-center bg-black text-white/60 text-2xl">Loading…</div>;

  const bgUrl = board.settings?.background_image_url;
  const bg = "linear-gradient(135deg, #0b0520 0%, #14082e 40%, #0d1a3a 70%, #0a0520 100%)";
  const musicPreset = MUSIC_PRESETS.find(p => p.id === (board.settings?.music_playlist_id || ""));
  const blockAccent = SUBJECT_ACCENT[currentBlock?.subject || ""] || "#8b5cf6";

  const g = (a: number) => `rgba(255,255,255,${a})`;
  const card = { background: g(0.04), border: `1px solid ${g(0.1)}`, borderRadius: 14, backdropFilter: "blur(10px)" } as const;

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 999,
      overflow: "hidden", display: "grid",
      gridTemplateRows: "54px 72px 1fr 50px",
      gap: 5, padding: "8px 10px 8px 10px",
      background: bgUrl ? `url(${bgUrl}) center/cover no-repeat fixed` : bg,
      color: "white", fontFamily: "'Inter', system-ui, sans-serif",
    }}>
      <style>{ANIM}</style>

      {/* Dark tint */}
      <div style={{ position: "absolute", inset: 0, background: bgUrl ? "rgba(4,2,16,.7)" : "rgba(4,2,16,.2)", pointerEvents: "none", zIndex: 0 }} />

      {/* ── ROW 1: Header ── */}
      <header style={{ position: "relative", zIndex: 1, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, borderBottom: `1px solid ${g(0.08)}`, paddingBottom: 5 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
          <h1 style={{
            fontSize: 28, fontWeight: 900, letterSpacing: "-0.02em", margin: 0,
            background: "linear-gradient(90deg,#e0c3fc,#a78bfa,#c4b5fd)",
            backgroundSize: "200% auto",
            WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
            animation: "gradShift 4s linear infinite",
          }}>{cls.name}</h1>
          <span style={{ fontSize: 12, opacity: 0.5, fontWeight: 600 }}>{dateStr}</span>
          <span style={{
            fontSize: 13, fontWeight: 800, padding: "2px 10px", borderRadius: 8,
            background: "rgba(245,158,11,.22)", color: "#fbbf24", border: "1px solid rgba(245,158,11,.4)",
          }}>Day {dayLetter}</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {musicPreset && (
            <button onClick={toggleMusic} style={{
              display: "flex", alignItems: "center", gap: 6, padding: "4px 12px",
              borderRadius: 10, border: `1px solid ${g(0.18)}`, background: g(0.08),
              color: "white", cursor: "pointer", fontSize: 13, fontWeight: 600,
            }}>
              <span>{musicPreset.emoji}</span>
              <span style={{ opacity: 0.8 }}>{musicPreset.label}</span>
              <span style={{ fontSize: 16 }}>{musicPlaying ? "⏸" : "▶"}</span>
            </button>
          )}
          <div style={{ fontSize: 32, fontWeight: 800, fontVariantNumeric: "tabular-nums", letterSpacing: "-0.03em" }}>{timeStr}</div>
          <button onClick={toggleFullscreen} style={{
            padding: "4px 10px", borderRadius: 8, border: `1px solid ${g(0.18)}`,
            background: g(0.08), color: g(0.7), cursor: "pointer", fontSize: 11, fontWeight: 600,
          }}>{isFullscreen ? "✕" : "⛶"}</button>
        </div>
      </header>

      {/* ── ROW 2: Current Block ── */}
      <section style={{
        position: "relative", zIndex: 1,
        ...card, borderRadius: 16,
        background: `linear-gradient(135deg, ${blockAccent}33, ${blockAccent}18)`,
        border: `1px solid ${blockAccent}55`,
        animation: "blockBreathe 3s ease-in-out infinite",
        display: "flex", alignItems: "center", padding: "0 18px", gap: 14,
      }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 11, opacity: 0.5, textTransform: "uppercase", letterSpacing: "0.25em", marginBottom: 2 }}>Right Now</div>
          {currentBlock ? (
            <div style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
              <span style={{ fontSize: 26, fontWeight: 900, letterSpacing: "-0.02em" }}>{currentBlock.label || currentBlock.subject}</span>
              <span style={{ fontSize: 13, opacity: 0.6, fontFamily: "monospace" }}>{currentBlock.start_time}–{currentBlock.end_time}</span>
              {currentBlock.is_break && <span style={{ fontSize: 12, padding: "2px 10px", borderRadius: 20, background: "rgba(34,197,94,.25)", color: "#86efac" }}>☕ Break</span>}
              {nextBlock && <span style={{ fontSize: 12, opacity: 0.5 }}>→ {nextBlock.block.label} <span style={{ fontFamily: "monospace" }}>{nextBlock.block.start_time}</span></span>}
            </div>
          ) : (
            <span style={{ fontSize: 22, opacity: 0.45, fontWeight: 700 }}>No active block</span>
          )}
        </div>
        {countdown && (
          <div style={{
            display: "flex", flexDirection: "column", alignItems: "center",
            padding: "6px 18px", borderRadius: 14,
            background: countdown.urgent ? "rgba(239,68,68,.25)" : "rgba(0,0,0,.35)",
            border: `1px solid ${countdown.urgent ? "rgba(239,68,68,.5)" : g(0.12)}`,
            animation: countdown.urgent ? "tickPulse 1s ease-in-out infinite" : undefined,
          }}>
            <div style={{ fontSize: 10, opacity: 0.55, textTransform: "uppercase", letterSpacing: "0.2em" }}>Ends in</div>
            <div style={{ fontSize: 28, fontWeight: 900, fontFamily: "monospace", color: countdown.urgent ? "#fca5a5" : "white" }}>{countdown.str}</div>
          </div>
        )}
        {board.settings?.specialist_name && (
          <div style={{ padding: "6px 14px", borderRadius: 12, background: "rgba(245,158,11,.18)", border: "1px solid rgba(245,158,11,.35)", textAlign: "center" }}>
            <div style={{ fontSize: 10, opacity: 0.55, textTransform: "uppercase", letterSpacing: "0.2em" }}>11AM Specialist</div>
            <div style={{ fontSize: 14, fontWeight: 800, color: "#fbbf24" }}>{board.settings.specialist_name}</div>
          </div>
        )}
      </section>

      {/* ── ROW 3: Main content ── */}
      <div style={{ position: "relative", zIndex: 1, display: "grid", gridTemplateColumns: "55% 1fr", gap: 5, overflow: "hidden", minHeight: 0 }}>

        {/* LEFT: Behavior Stars */}
        <section style={{ ...card, display: "flex", flexDirection: "column", overflow: "hidden", minHeight: 0, padding: "10px 12px" }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 8, flexShrink: 0 }}>
            <div style={{ fontSize: 11, fontWeight: 700, opacity: 0.5, textTransform: "uppercase", letterSpacing: "0.28em" }}>⭐ Behavior Stars</div>
            <div style={{ fontSize: 11, opacity: 0.35 }}>5 = McDonald's</div>
          </div>
          <div style={{
            overflowY: "auto", flex: 1,
            display: "grid",
            gridTemplateColumns: `repeat(auto-fill, minmax(130px, 1fr))`,
            gridAutoRows: "minmax(min-content, 1fr)",
            alignContent: "stretch",
            gap: 6,
          }}>
            {board.students.map((s, idx) => {
              const stars = Math.max(0, Math.min(5, s.behavior_stars || 0));
              const lv = s.level || 1;
              const isFull = stars >= 5;
              const isHigh = stars >= 3;
              const lc = BEHAVIOR_LEVELS[lv];
              const initial = (s.name || "?")[0].toUpperCase();
              return (
                <div key={s.id} style={{
                  borderRadius: 10, display: "flex", flexDirection: "column",
                  alignItems: "stretch", textAlign: "center",
                  background: isFull
                    ? "linear-gradient(160deg, rgba(245,158,11,.28), rgba(234,179,8,.14))"
                    : "linear-gradient(160deg, rgba(139,92,246,.15), rgba(99,102,241,.08))",
                  border: isFull ? "1px solid rgba(245,158,11,.55)" : `1px solid ${g(0.1)}`,
                  boxShadow: isFull ? `0 0 20px rgba(245,158,11,.22)` : `0 0 0 0 transparent`,
                  animation: isFull ? `cardPulse 2.5s ease-in-out infinite, popIn .4s ease ${idx * 0.05}s both` : `popIn .4s ease ${idx * 0.05}s both`,
                  overflow: "hidden",
                }}>
                  {/* Level color stripe at top */}
                  <div style={{
                    height: 4, flexShrink: 0,
                    background: `linear-gradient(90deg, ${lc.color}, ${lc.color}88)`,
                    boxShadow: `0 0 8px ${lc.glow}`,
                  }} />

                  {/* Card body */}
                  <div style={{ flex: 1, padding: "10px 6px 8px", display: "flex", flexDirection: "column", alignItems: "center", gap: 6, justifyContent: "center" }}>
                    {/* Avatar */}
                    <div style={{
                      width: 58, height: 58, borderRadius: "50%", flexShrink: 0, overflow: "hidden",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 20, fontWeight: 900, color: "white",
                      background: isFull
                        ? "linear-gradient(135deg, #f59e0b, #d97706)"
                        : `linear-gradient(135deg, ${lc.color}88, ${lc.color}44)`,
                      border: `2px solid ${isFull ? "rgba(245,158,11,.7)" : lc.color + "55"}`,
                      boxShadow: isFull ? `0 0 12px rgba(245,158,11,.5)` : `0 0 7px ${lc.glow}`,
                      animation: isFull ? "popIn .4s ease both, pulseRing 2s ease-in-out 0.5s infinite" : undefined,
                    }}>
                      {s.avatar_url
                        ? <img src={s.avatar_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                        : initial}
                    </div>

                    {/* Name */}
                    <div style={{ fontSize: 15, fontWeight: 900, lineHeight: 1.1, maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", padding: "0 2px" }}>
                      {s.name}
                    </div>

                    {/* Stars */}
                    <div style={{ display: "flex", gap: 2, justifyContent: "center", background: "rgba(0,0,0,0.2)", borderRadius: 8, padding: "3px 6px" }}>
                      {Array.from({ length: 5 }, (_, i) => (
                        <span key={i} style={{
                          fontSize: 18,
                          lineHeight: 1,
                          opacity: i < stars ? 1 : 0.13,
                          filter: i < stars ? (isFull ? "drop-shadow(0 0 4px rgba(251,191,36,0.9))" : "none") : "grayscale(1) brightness(.25)",
                          animation: i < stars && isFull ? `starGlow 2s ease-in-out ${i * 0.15}s infinite` : undefined,
                        }}>⭐</span>
                      ))}
                    </div>

                    {/* Schedule pills — show all entries, no day filter */}
                    {(() => {
                      const studentSchedules = board.schedules
                        .filter((sc: any) => sc.student_id === s.id)
                        .sort((a: any, b: any) => a.start_time.localeCompare(b.start_time))
                        .slice(0, 3);
                      return studentSchedules.length > 0 ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, alignItems: 'center', maxWidth: '100%' }}>
                          {studentSchedules.map((sc: any, i: number) => (
                            <span key={i} style={{
                              fontSize: 8, padding: '1px 6px', borderRadius: 10,
                              background: 'rgba(99,102,241,0.18)', color: 'rgba(167,139,250,0.9)',
                              border: '1px solid rgba(99,102,241,0.28)', whiteSpace: 'nowrap' as const,
                              fontWeight: 700, letterSpacing: '0.02em', maxWidth: '100%',
                              overflow: 'hidden', textOverflow: 'ellipsis',
                              animation: `slideIn .3s ease ${i * 0.08}s both`,
                            }}>
                              {sc.start_time.slice(0, 5)} {sc.activity}
                            </span>
                          ))}
                        </div>
                      ) : null;
                    })()}

                    {/* Level badge */}
                    <div style={{ display: "flex", gap: 2, alignItems: "center", flexWrap: "wrap", justifyContent: "center" }}>
                      <div style={{
                        fontSize: 10, width: 22, height: 22, borderRadius: "50%",
                        background: lc.bg, color: lc.color, fontWeight: 900,
                        border: `1px solid ${lc.color}55`,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        lineHeight: 1,
                      }}>
                        {lv}
                      </div>
                      {s.reward_count > 0 && (
                        <div style={{
                          fontSize: 8, padding: "1px 5px", borderRadius: 20,
                          background: "rgba(245,158,11,.3)", color: "#fcd34d", fontWeight: 800,
                          border: "1px solid rgba(245,158,11,.45)",
                          animation: "rewardBounce 1.5s ease-in-out infinite",
                        }}>🏆 {s.reward_count}</div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
            {board.students.length === 0 && (
              <div style={{ gridColumn: "1/-1", display: "flex", alignItems: "center", justifyContent: "center", opacity: 0.35, fontSize: 14 }}>
                No students in this class yet.
              </div>
            )}
          </div>
        </section>

        {/* RIGHT: Specials Today (top) + Specials Rotation (bottom) */}
        <div style={{ display: "grid", gridTemplateRows: "1fr 1fr", gap: 5, overflow: "hidden", minHeight: 0 }}>

          {/* Specials Today — hero cards */}
          <section style={{
            display: "flex", flexDirection: "column", overflow: "hidden", minHeight: 0,
            borderRadius: 16, border: "1px solid rgba(255,255,255,0.1)",
            background: "linear-gradient(160deg, rgba(15,10,35,0.95), rgba(8,4,20,0.98))",
            padding: "10px 10px 8px",
            boxShadow: "inset 0 1px 0 rgba(255,255,255,0.07)",
          }}>
            {/* Header row */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 7, flexShrink: 0 }}>
              <div style={{ fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.25em", color: "rgba(255,255,255,0.35)" }}>NOW IN SESSION</div>
              <div style={{
                fontSize: 13, fontWeight: 900, padding: "2px 10px", borderRadius: 10,
                background: "linear-gradient(135deg, rgba(245,158,11,0.35), rgba(251,191,36,0.2))",
                color: "#fde68a", border: "1px solid rgba(245,158,11,0.6)",
                boxShadow: "0 0 10px rgba(245,158,11,0.25)",
              }}>DAY {dayLetter}</div>
            </div>
            {/* Grade hero cards */}
            <div style={{ flex: 1, overflow: "hidden", minHeight: 0, display: "flex", flexDirection: "column", gap: 4 }}>
              {GRADES.map((grade, gi) => {
                const students = board.students.filter(s => s.specials_grade === grade);
                if (students.length === 0) return null;
                const act = board.specials.find(r => Number(r.grade) === grade && String(r.day_letter).toUpperCase() === dayLetter)?.activity;
                const gc = GRADE_COLORS[grade];
                const emoji = actEmoji(act || "");
                return (
                  <div key={grade} style={{
                    flex: 1, borderRadius: 10, overflow: "hidden",
                    display: "flex", alignItems: "stretch",
                    border: `1px solid ${gc.border}`,
                    boxShadow: `0 0 12px ${gc.glow}, inset 0 1px 0 rgba(255,255,255,0.08)`,
                    animation: `popIn .4s ease ${gi * 0.07}s both`,
                  }}>
                    {/* Left accent */}
                    <div style={{
                      width: 34, flexShrink: 0, display: "flex", flexDirection: "column",
                      alignItems: "center", justifyContent: "center", gap: 2,
                      background: `linear-gradient(180deg, ${gc.from.replace("0.22", "0.55")}, ${gc.to.replace("0.12", "0.3")})`,
                      borderRight: `1px solid ${gc.border}`,
                    }}>
                      <div style={{ fontSize: 20, lineHeight: 1 }}>{emoji}</div>
                      <div style={{ fontSize: 9, fontWeight: 900, color: gc.text, letterSpacing: "0.05em" }}>{grade}TH</div>
                    </div>
                    {/* Right content */}
                    <div style={{
                      flex: 1, padding: "5px 8px", display: "flex", flexDirection: "column", justifyContent: "center",
                      background: `linear-gradient(135deg, ${gc.from.replace("0.22", "0.15")}, rgba(0,0,0,0))`,
                    }}>
                      <div style={{ fontSize: 13, fontWeight: 900, color: gc.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", lineHeight: 1.2 }}>
                        {act || <span style={{ opacity: 0.3, fontStyle: "italic", fontWeight: 500 }}>not set</span>}
                      </div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 3, marginTop: 3 }}>
                        {students.map(s => (
                          <span key={s.id} style={{
                            fontSize: 10, fontWeight: 700, padding: "1px 7px", borderRadius: 20,
                            background: "rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.8)",
                            border: "1px solid rgba(255,255,255,0.08)",
                          }}>{s.name}</span>
                        ))}
                      </div>
                    </div>
                  </div>
                );
              })}
              {board.students.filter(s => !s.specials_grade).length > 0 && (
                <div style={{
                  borderRadius: 10, padding: "5px 8px", display: "flex", alignItems: "center", gap: 8,
                  background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)",
                }}>
                  <div style={{ fontSize: 9, fontWeight: 800, color: "rgba(255,255,255,0.25)", letterSpacing: "0.1em" }}>TBD</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 3 }}>
                    {board.students.filter(s => !s.specials_grade).map(s => (
                      <span key={s.id} style={{ fontSize: 10, padding: "1px 7px", borderRadius: 20, background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.45)" }}>{s.name}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </section>

          {/* Specials Rotation — week-at-a-glance */}
          <section style={{
            display: "flex", flexDirection: "column", overflow: "hidden", minHeight: 0,
            borderRadius: 16, border: "1px solid rgba(255,255,255,0.1)",
            background: "linear-gradient(160deg, rgba(15,10,35,0.95), rgba(8,4,20,0.98))",
            padding: "10px 10px 8px",
            boxShadow: "inset 0 1px 0 rgba(255,255,255,0.07)",
          }}>
            <div style={{ fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.25em", color: "rgba(255,255,255,0.35)", marginBottom: 7, flexShrink: 0 }}>WEEK SCHEDULE</div>
            <div style={{ flex: 1, overflow: "hidden", minHeight: 0, display: "flex", flexDirection: "column", gap: 3 }}>
              {/* Day header */}
              <div style={{ display: "grid", gridTemplateColumns: "32px repeat(6, 1fr)", gap: 3, flexShrink: 0 }}>
                <div />
                {DAY_LETTERS.map(d => {
                  const isToday = d === dayLetter;
                  return (
                    <div key={d} style={{
                      textAlign: "center", fontSize: 11, fontWeight: 900,
                      padding: "4px 2px", borderRadius: 8,
                      background: isToday ? "linear-gradient(135deg, rgba(245,158,11,0.4), rgba(251,191,36,0.25))" : "rgba(255,255,255,0.04)",
                      color: isToday ? "#fde68a" : "rgba(255,255,255,0.25)",
                      border: isToday ? "1px solid rgba(245,158,11,0.6)" : "1px solid rgba(255,255,255,0.05)",
                      boxShadow: isToday ? "0 0 12px rgba(245,158,11,0.3)" : "none",
                      letterSpacing: isToday ? "0.05em" : 0,
                    }}>
                      {d}{isToday ? " ★" : ""}
                    </div>
                  );
                })}
              </div>
              {/* Grade rows */}
              {GRADES.map(grade => {
                const gc = GRADE_COLORS[grade];
                return (
                  <div key={grade} style={{ display: "grid", gridTemplateColumns: "32px repeat(6, 1fr)", gap: 3, flex: 1, minHeight: 0 }}>
                    {/* Grade label */}
                    <div style={{
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 10, fontWeight: 900, borderRadius: 8,
                      color: gc.text,
                      background: `linear-gradient(135deg, ${gc.from.replace("0.22","0.45")}, ${gc.to.replace("0.12","0.2")})`,
                      border: `1px solid ${gc.border}`,
                      boxShadow: `0 0 6px ${gc.glow}`,
                    }}>{grade}th</div>
                    {DAY_LETTERS.map(day => {
                      const c = board.specials.find(r => Number(r.grade) === grade && String(r.day_letter).toUpperCase() === day);
                      const isToday = day === dayLetter;
                      return (
                        <div key={day} style={{
                          display: "flex", alignItems: "center", justifyContent: "center",
                          fontSize: 9, fontWeight: 700, textAlign: "center", borderRadius: 8, padding: "1px 2px",
                          background: isToday
                            ? `linear-gradient(135deg, ${gc.from.replace("0.22","0.45")}, ${gc.to.replace("0.12","0.25")})`
                            : "rgba(255,255,255,0.03)",
                          border: isToday ? `1px solid ${gc.border}` : "1px solid rgba(255,255,255,0.05)",
                          color: isToday ? gc.text : "rgba(255,255,255,0.35)",
                          overflow: "hidden",
                          boxShadow: isToday && c ? `0 0 8px ${gc.glow}` : "none",
                        }}>
                          {c?.activity
                            ? <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "100%", padding: "0 1px" }}>
                                {actEmoji(c.activity)}{isToday ? ` ${c.activity}` : ""}
                              </span>
                            : <span style={{ opacity: 0.15 }}>—</span>}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </section>
        </div>
      </div>

      {/* ── ROW 4: Behavior Levels strip ── */}
      <section style={{
        position: "relative", zIndex: 1,
        ...card, borderRadius: 12,
        display: "flex", alignItems: "center", gap: 8, padding: "0 12px", overflow: "hidden", flexShrink: 0,
        animation: "pulseRing 2.5s ease-in-out infinite",
      }}>
        <div style={{ fontSize: 10, fontWeight: 700, opacity: 0.45, textTransform: "uppercase", letterSpacing: "0.25em", flexShrink: 0 }}>Behavior Levels</div>
        <div style={{ flex: 1, display: "flex", gap: 6, alignItems: "center", overflow: "hidden" }}>
          {[5, 4, 3, 2, 1].map(lv => {
            const at = board.students.filter(s => (s.level || 1) === lv);
            if (at.length === 0) return null;
            const lc = BEHAVIOR_LEVELS[lv];
            return (
              <div key={lv} style={{ display: "flex", alignItems: "center", gap: 5, flexShrink: 0 }}>
                <div style={{ fontSize: 10, fontWeight: 800, padding: "2px 8px", borderRadius: 20, background: lc.bg, color: lc.color }}>{lc.label}</div>
                {at.map(s => (
                  <div key={s.id} style={{ fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 20, background: g(0.1), color: g(0.85) }}>{s.name}</div>
                ))}
              </div>
            );
          })}
        </div>
      </section>

      {/* Music iframe — src is blank until first tap (iOS autoplay policy) */}
      {musicPreset && (
        <iframe
          ref={musicRef}
          title="ambient-music"
          width="1" height="1"
          style={{ position: "fixed", bottom: 0, right: 0, opacity: 0.01, pointerEvents: "none" }}
          src="about:blank"
          allow="autoplay"
        />
      )}
    </div>
  );
}
