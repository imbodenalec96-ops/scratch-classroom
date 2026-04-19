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

// Editorial palette: each grade is a distinct tradition, not a tint of purple
//   3rd — deep teal (study / library green)
//   4th — warm amber (afternoon sun)
//   5th — brick red (masthead / upperclass)
const GRADE_COLORS: Record<number, { from: string; to: string; border: string; text: string; glow: string; ink: string; motif: string }> = {
  3: { from: "rgba(42,111,106,0.28)", to: "rgba(42,111,106,0.08)", border: "rgba(94,234,212,0.55)", text: "#7dd3c5", glow: "rgba(20,184,166,0.35)", ink: "#0f2b29", motif: "3RD" },
  4: { from: "rgba(217,119,6,0.28)",  to: "rgba(217,119,6,0.08)",  border: "rgba(251,191,36,0.55)", text: "#fbbf24", glow: "rgba(245,158,11,0.35)", ink: "#2a1805", motif: "4TH" },
  5: { from: "rgba(178,58,72,0.28)",  to: "rgba(178,58,72,0.08)",  border: "rgba(248,113,113,0.55)", text: "#fca5a5", glow: "rgba(178,58,72,0.35)",  ink: "#2b0d11", motif: "5TH" },
};

// Behavior levels: keep semantic traffic-light logic but shift off candy tones
const BEHAVIOR_LEVELS: Record<number, { label: string; short: string; icon: string; color: string; bg: string; glow: string }> = {
  1: { label: "Level 1",  short: "Lv 1",  icon: "1", color: "#f87171", bg: "rgba(178,58,72,0.28)",  glow: "rgba(178,58,72,0.28)" },
  2: { label: "Level 2",  short: "Lv 2",  icon: "2", color: "#fb923c", bg: "rgba(217,119,6,0.28)",  glow: "rgba(217,119,6,0.28)" },
  3: { label: "Level 3",  short: "Lv 3",  icon: "3", color: "#fbbf24", bg: "rgba(202,138,4,0.28)",  glow: "rgba(202,138,4,0.28)" },
  4: { label: "Level 4",  short: "Lv 4",  icon: "4", color: "#86efac", bg: "rgba(21,128,61,0.28)",  glow: "rgba(21,128,61,0.28)" },
  5: { label: "Level 5",  short: "Lv 5",  icon: "5", color: "#7dd3c5", bg: "rgba(42,111,106,0.32)", glow: "rgba(42,111,106,0.32)" },
};

const ACTIVITY_EMOJI: Array<[string, string]> = [
  ["PE", "🏃"], ["Gym", "🏃"], ["Music", "🎵"], ["Art", "🎨"], ["Library", "📚"],
  ["Tech", "💻"], ["Dance", "💃"], ["Science", "🔬"], ["Drama", "🎭"], ["Spanish", "🗣"],
];
function actEmoji(name = "") {
  for (const [k, v] of ACTIVITY_EMOJI) if (name.toLowerCase().includes(k.toLowerCase())) return v;
  return "✨";
}

// Subject accents use the editorial palette (teal/amber/brick/ink) — not rainbow
const SUBJECT_ACCENT: Record<string, string> = {
  math: "#b23a48", sel: "#d97706", coding_art_gym: "#2a6f6a",
  video_learning: "#5b7ca8", writing: "#2a6f6a", daily_news: "#8a6d3b",
  review: "#b23a48", cashout: "#d97706", lunch: "#5b8a6e", recess: "#5b8a6e",
  calm_down: "#5b7ca8", ted_talk: "#5b7ca8",
};

// Motion policy: two focal animations (full-star celebration + urgent countdown).
// Everything else is still — editorial pages don't breathe.
const ANIM = `
  @keyframes starGlow {
    0%,100% { filter: drop-shadow(0 0 3px rgba(251,191,36,.7)); }
    50%     { filter: drop-shadow(0 0 9px rgba(251,191,36,.95)) drop-shadow(0 0 18px rgba(217,119,6,.55)); }
  }
  @keyframes fadeUp {
    from { opacity: 0; transform: translateY(4px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  @keyframes tickPulse {
    0%,100% { opacity: 1; }
    50%     { opacity: .55; }
  }
  @keyframes fullCard {
    0%,100% { box-shadow: 0 0 0 1px rgba(251,191,36,.4), 0 6px 24px rgba(217,119,6,.18); }
    50%     { box-shadow: 0 0 0 1px rgba(251,191,36,.75), 0 10px 36px rgba(217,119,6,.35); }
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
  // Editorial deep-night background — ink navy with a whisper of warmth,
  // a subtle paper-grain overlay, and a single brick-red corner mark.
  const bg = "radial-gradient(ellipse at top left, #17192b 0%, #0d1321 55%, #07080f 100%)";
  const musicPreset = MUSIC_PRESETS.find(p => p.id === (board.settings?.music_playlist_id || ""));
  const blockAccent = SUBJECT_ACCENT[currentBlock?.subject || ""] || "#d97706";

  const g = (a: number) => `rgba(255,255,255,${a})`;
  // Serif for the masthead / hero moments, Inter for dense data.
  const serif = "'Fraunces', 'Playfair Display', Georgia, serif";
  const mono  = "'JetBrains Mono', 'SF Mono', ui-monospace, monospace";

  // Editorial section label: small-caps serif + tracking + a thin rule, numbered.
  const SectionLabel: React.FC<{ n: string; title: string; kicker?: string; align?: "left" | "right" }> = ({ n, title, kicker, align = "left" }) => (
    <div style={{
      display: "flex", alignItems: "baseline", gap: 10,
      borderBottom: `1px solid ${g(0.08)}`, paddingBottom: 4, marginBottom: 7,
      flexDirection: align === "right" ? "row-reverse" : "row",
    }}>
      <span style={{
        fontFamily: serif, fontSize: 11, fontWeight: 600, fontStyle: "italic",
        color: "rgba(217,119,6,0.9)", letterSpacing: "0.02em",
      }}>№ {n}</span>
      <span style={{
        fontFamily: serif, fontSize: 14, fontWeight: 600, letterSpacing: "0.18em",
        textTransform: "uppercase", color: "rgba(255,255,255,0.88)",
      }}>{title}</span>
      {kicker && (
        <span style={{
          fontFamily: "'Inter', sans-serif", fontSize: 10, fontWeight: 500,
          color: "rgba(255,255,255,0.35)", letterSpacing: "0.08em", marginLeft: align === "right" ? 0 : "auto", marginRight: align === "right" ? "auto" : 0,
        }}>{kicker}</span>
      )}
    </div>
  );

  const card = {
    background: "linear-gradient(180deg, rgba(255,255,255,0.025), rgba(255,255,255,0.008))",
    border: `1px solid ${g(0.07)}`,
    borderRadius: 6,
  } as const;

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 999,
      overflow: "hidden", display: "grid",
      gridTemplateRows: "62px 82px 1fr 50px",
      gap: 6, padding: "10px 14px 10px 14px",
      background: bgUrl ? `url(${bgUrl}) center/cover no-repeat fixed` : bg,
      color: "white", fontFamily: "'Inter', system-ui, sans-serif",
    }}>
      <style>{ANIM}</style>

      {/* Dark tint for bg image path */}
      {bgUrl && <div style={{ position: "absolute", inset: 0, background: "rgba(7,8,15,.78)", pointerEvents: "none", zIndex: 0 }} />}

      {/* Paper-grain overlay — subtle, static, not a gradient */}
      {!bgUrl && (
        <div style={{
          position: "absolute", inset: 0, pointerEvents: "none", zIndex: 0, opacity: 0.35,
          backgroundImage:
            "radial-gradient(rgba(255,255,255,0.045) 1px, transparent 1px)," +
            "radial-gradient(rgba(255,255,255,0.025) 1px, transparent 1px)",
          backgroundSize: "3px 3px, 7px 7px",
          backgroundPosition: "0 0, 1px 2px",
          mixBlendMode: "screen",
        }} />
      )}

      {/* Single bold brick-red masthead mark — top-left corner, structural not decorative */}
      {!bgUrl && (
        <div style={{
          position: "absolute", top: 0, left: 0, width: 200, height: 3,
          background: "linear-gradient(90deg, #b23a48 0%, #d97706 55%, transparent 100%)",
          pointerEvents: "none", zIndex: 2,
        }} />
      )}

      {/* ── ROW 1: Masthead header ── */}
      <header style={{
        position: "relative", zIndex: 1,
        display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center", gap: 12,
        borderBottom: `1px solid ${g(0.12)}`, paddingBottom: 6,
      }}>
        {/* Left: class identity */}
        <div style={{ display: "flex", alignItems: "baseline", gap: 14 }}>
          <h1 style={{
            fontFamily: serif, fontSize: 38, fontWeight: 500, fontStyle: "italic",
            letterSpacing: "-0.015em", margin: 0, color: "#f5f1e8",
            lineHeight: 1,
          }}>{cls.name}</h1>
          <span style={{
            fontFamily: serif, fontStyle: "italic", fontSize: 13,
            color: "rgba(245,241,232,0.45)", letterSpacing: "0.01em",
          }}>— {dateStr}</span>
        </div>

        {/* Center: Day letter medallion — the one decorative focal point */}
        <div style={{
          display: "flex", flexDirection: "column", alignItems: "center",
          padding: "2px 14px",
          borderLeft: `1px solid ${g(0.1)}`, borderRight: `1px solid ${g(0.1)}`,
        }}>
          <span style={{
            fontFamily: serif, fontStyle: "italic", fontSize: 9, fontWeight: 500,
            color: "rgba(217,119,6,0.85)", letterSpacing: "0.28em", textTransform: "uppercase",
          }}>Cycle Day</span>
          <span style={{
            fontFamily: serif, fontSize: 32, fontWeight: 600, lineHeight: 1,
            color: "#fbbf24", letterSpacing: "-0.02em",
          }}>{dayLetter}</span>
        </div>

        {/* Right: time + controls */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 10 }}>
          {musicPreset && (
            <button onClick={toggleMusic} style={{
              display: "flex", alignItems: "center", gap: 7, padding: "5px 11px",
              borderRadius: 3, border: `1px solid ${g(0.16)}`,
              background: musicPlaying ? "rgba(42,111,106,0.2)" : "transparent",
              color: "rgba(255,255,255,0.85)", cursor: "pointer",
              fontSize: 12, fontWeight: 500, letterSpacing: "0.02em",
              fontFamily: serif, fontStyle: "italic",
            }}>
              <span style={{ fontStyle: "normal" }}>{musicPreset.emoji}</span>
              <span>{musicPreset.label}</span>
              <span style={{ fontSize: 11, opacity: 0.7, fontStyle: "normal" }}>{musicPlaying ? "❙❙" : "▸"}</span>
            </button>
          )}
          <div style={{
            fontFamily: mono, fontSize: 30, fontWeight: 500,
            fontVariantNumeric: "tabular-nums", letterSpacing: "-0.02em",
            color: "#f5f1e8",
          }}>{timeStr}</div>
          <button onClick={toggleFullscreen} style={{
            padding: "5px 9px", borderRadius: 3, border: `1px solid ${g(0.16)}`,
            background: "transparent", color: g(0.55), cursor: "pointer",
            fontSize: 11, fontWeight: 600,
          }}>{isFullscreen ? "✕" : "⛶"}</button>
        </div>
      </header>

      {/* ── ROW 2: Right Now — the editorial "lead story" ── */}
      <section style={{
        position: "relative", zIndex: 1,
        borderRadius: 4,
        background: `linear-gradient(100deg, ${blockAccent}26 0%, ${blockAccent}10 45%, rgba(13,19,33,0.3) 100%)`,
        border: `1px solid ${blockAccent}55`,
        borderLeft: `4px solid ${blockAccent}`,
        display: "flex", alignItems: "center", padding: "0 20px", gap: 18,
      }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontFamily: serif, fontStyle: "italic", fontSize: 10, fontWeight: 500,
            color: `${blockAccent}`, opacity: 0.9,
            textTransform: "uppercase", letterSpacing: "0.28em", marginBottom: 3,
          }}>The Hour</div>
          {currentBlock ? (
            <div style={{ display: "flex", alignItems: "baseline", gap: 14, flexWrap: "wrap" }}>
              <span style={{
                fontFamily: serif, fontSize: 30, fontWeight: 600,
                letterSpacing: "-0.02em", color: "#f5f1e8", lineHeight: 1,
              }}>{currentBlock.label || currentBlock.subject}</span>
              <span style={{
                fontFamily: mono, fontSize: 13, color: "rgba(245,241,232,0.55)",
                fontVariantNumeric: "tabular-nums",
              }}>{currentBlock.start_time}–{currentBlock.end_time}</span>
              {currentBlock.is_break && (
                <span style={{
                  fontFamily: serif, fontStyle: "italic", fontSize: 12, fontWeight: 500,
                  padding: "2px 10px", borderRadius: 2,
                  background: "rgba(42,111,106,0.25)", color: "#7dd3c5",
                  border: "1px solid rgba(42,111,106,0.45)",
                }}>Break</span>
              )}
              {nextBlock && (
                <span style={{
                  fontFamily: serif, fontStyle: "italic", fontSize: 12,
                  color: "rgba(245,241,232,0.45)",
                }}>then <span style={{ color: "rgba(245,241,232,0.75)", fontStyle: "normal", fontWeight: 500 }}>{nextBlock.block.label}</span> <span style={{ fontFamily: mono }}>{nextBlock.block.start_time}</span></span>
              )}
            </div>
          ) : (
            <span style={{
              fontFamily: serif, fontStyle: "italic", fontSize: 22,
              color: "rgba(245,241,232,0.4)", fontWeight: 500,
            }}>the room is between blocks</span>
          )}
        </div>
        {countdown && (
          <div style={{
            display: "flex", flexDirection: "column", alignItems: "center",
            padding: "4px 16px", borderRadius: 3,
            background: countdown.urgent ? "rgba(178,58,72,.25)" : "rgba(7,8,15,.5)",
            border: `1px solid ${countdown.urgent ? "rgba(178,58,72,.6)" : g(0.12)}`,
            animation: countdown.urgent ? "tickPulse 1s ease-in-out infinite" : undefined,
          }}>
            <div style={{
              fontFamily: serif, fontStyle: "italic", fontSize: 10, fontWeight: 500,
              color: countdown.urgent ? "rgba(252,165,165,0.85)" : "rgba(245,241,232,0.55)",
              textTransform: "uppercase", letterSpacing: "0.22em",
            }}>ends in</div>
            <div style={{
              fontFamily: mono, fontSize: 26, fontWeight: 500,
              color: countdown.urgent ? "#fca5a5" : "#f5f1e8",
              fontVariantNumeric: "tabular-nums",
            }}>{countdown.str}</div>
          </div>
        )}
        {board.settings?.specialist_name && (
          <div style={{
            padding: "5px 14px", borderRadius: 3,
            background: "rgba(217,119,6,.14)",
            border: "1px solid rgba(217,119,6,.4)",
            borderLeft: "3px solid #d97706",
            textAlign: "left",
          }}>
            <div style={{
              fontFamily: serif, fontStyle: "italic", fontSize: 10, fontWeight: 500,
              color: "rgba(217,119,6,0.9)",
              textTransform: "uppercase", letterSpacing: "0.22em",
            }}>11 o'clock specialist</div>
            <div style={{
              fontFamily: serif, fontSize: 16, fontWeight: 600,
              color: "#fbbf24", letterSpacing: "-0.01em",
            }}>{board.settings.specialist_name}</div>
          </div>
        )}
      </section>

      {/* ── ROW 3: Main content ── */}
      <div style={{ position: "relative", zIndex: 1, display: "grid", gridTemplateColumns: "55% 1fr", gap: 8, overflow: "hidden", minHeight: 0 }}>

        {/* LEFT: Behavior Stars — "The Roster" */}
        <section style={{ ...card, display: "flex", flexDirection: "column", overflow: "hidden", minHeight: 0, padding: "10px 14px" }}>
          <SectionLabel n="01" title="The Roster" kicker="Five stars earns a reward" />
          {(() => {
            const n = board.students.length || 1;
            const cols = n <= 4 ? 2 : n <= 9 ? 3 : n <= 16 ? 4 : 5;
            const rows = Math.ceil(n / cols);
            return (
          <div style={{
            flex: 1, minHeight: 0,
            display: "grid",
            gridTemplateColumns: `repeat(${cols}, 1fr)`,
            gridTemplateRows: `repeat(${rows}, 1fr)`,
            gap: 8,
          }}>
            {board.students.map((s, idx) => {
              const stars = Math.max(0, Math.min(5, s.behavior_stars || 0));
              const lv = s.level || 1;
              const isFull = stars >= 5;
              const lc = BEHAVIOR_LEVELS[lv];
              const initial = (s.name || "?")[0].toUpperCase();
              const firstName = (s.name || "?").split(" ")[0];
              return (
                <div key={s.id} style={{
                  borderRadius: 4, display: "flex", flexDirection: "column",
                  alignItems: "stretch", textAlign: "center",
                  background: isFull
                    ? "linear-gradient(180deg, rgba(217,119,6,0.18) 0%, rgba(178,58,72,0.08) 100%)"
                    : "linear-gradient(180deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.01) 100%)",
                  border: isFull ? "1px solid rgba(251,191,36,.55)" : `1px solid ${g(0.08)}`,
                  animation: isFull
                    ? `fullCard 3.5s ease-in-out infinite, fadeUp .5s ease ${idx * 0.04}s both`
                    : `fadeUp .5s ease ${idx * 0.04}s both`,
                  overflow: "hidden",
                  position: "relative",
                }}>
                  {/* Left spine: level color as a vertical rule (magazine pull-quote treatment) */}
                  <div style={{
                    position: "absolute", left: 0, top: 0, bottom: 0, width: 3,
                    background: isFull
                      ? "linear-gradient(180deg, #fbbf24, #d97706)"
                      : lc.color,
                    opacity: isFull ? 1 : 0.85,
                  }} />

                  {/* Level marker — small-caps serif, top-right, editorial footnote vibe */}
                  <div style={{
                    position: "absolute", top: 7, right: 9,
                    fontFamily: serif, fontStyle: "italic",
                    fontSize: 11, fontWeight: 600, color: lc.color,
                    letterSpacing: "0.04em",
                    zIndex: 1,
                  }}>lv.{lv}</div>

                  {/* Card body */}
                  <div style={{ flex: 1, padding: "10px 8px 10px 10px", display: "flex", flexDirection: "column", alignItems: "center", gap: 6, justifyContent: "center" }}>
                    {/* Avatar — flat disc, no inner glow soup */}
                    <div style={{
                      width: 66, height: 66, borderRadius: "50%", flexShrink: 0, overflow: "hidden",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontFamily: serif, fontSize: s.avatar_emoji ? 34 : 28, fontWeight: 600, color: "#0d1321",
                      background: isFull
                        ? "radial-gradient(circle at 35% 30%, #fde68a 0%, #d97706 85%)"
                        : `radial-gradient(circle at 35% 30%, ${lc.color} 0%, ${lc.color}aa 85%)`,
                      border: isFull ? "2px solid rgba(251,191,36,.85)" : `2px solid ${lc.color}cc`,
                      boxShadow: isFull
                        ? "0 4px 14px rgba(217,119,6,.35)"
                        : "0 2px 10px rgba(0,0,0,0.3)",
                    }}>
                      {s.avatar_url
                        ? <img src={s.avatar_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                        : s.avatar_emoji
                        ? s.avatar_emoji
                        : initial}
                    </div>

                    {/* Name — serif, italic when full (they're the featured story) */}
                    <div style={{
                      fontFamily: serif, fontSize: 17,
                      fontWeight: isFull ? 600 : 500,
                      fontStyle: isFull ? "italic" : "normal",
                      lineHeight: 1.05, letterSpacing: "-0.01em",
                      maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", padding: "0 6px",
                      color: isFull ? "#fde68a" : "#f5f1e8",
                    }}>
                      {firstName}
                    </div>

                    {/* Stars — plain row on a thin rule, no bubble chrome */}
                    <div style={{
                      display: "flex", alignItems: "center", gap: 3, justifyContent: "center",
                      padding: "2px 0",
                    }}>
                      {Array.from({ length: 5 }, (_, i) => (
                        <span key={i} style={{
                          fontSize: 13, lineHeight: 1,
                          opacity: i < stars ? 1 : 0.14,
                          filter: i < stars ? (isFull ? "drop-shadow(0 0 4px rgba(251,191,36,.9))" : "none") : "none",
                          animation: i < stars && isFull ? `starGlow 2.2s ease-in-out ${i * 0.15}s infinite` : undefined,
                          color: i < stars ? (isFull ? "#fbbf24" : "#fde68a") : "rgba(245,241,232,0.3)",
                        }}>★</span>
                      ))}
                    </div>

                    {/* Schedule pills — teal/brick editorial ticket style */}
                    {(() => {
                      const studentSchedules = board.schedules
                        .filter((sc: any) => sc.student_id === s.id)
                        .sort((a: any, b: any) => a.start_time.localeCompare(b.start_time))
                        .slice(0, 2);
                      return studentSchedules.length > 0 ? (
                        <div style={{ display: "flex", flexDirection: "column", gap: 2, alignItems: "center", width: "100%", padding: "0 4px" }}>
                          {studentSchedules.map((sc: any, i: number) => (
                            <div key={i} style={{
                              fontSize: 10, padding: "2px 6px", borderRadius: 2,
                              background: "rgba(42,111,106,0.22)", color: "#7dd3c5",
                              border: "1px solid rgba(42,111,106,0.4)",
                              borderLeft: "2px solid #2a6f6a", width: "100%",
                              fontWeight: 600, letterSpacing: "0.01em", textAlign: "left",
                              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                              fontFamily: "'Inter', sans-serif",
                            }}>
                              <span style={{ opacity: 0.8, marginRight: 4 }}>{actEmoji(sc.activity)}</span>{sc.activity}
                            </div>
                          ))}
                        </div>
                      ) : null;
                    })()}

                    {/* Reward tally — restrained, serif italic */}
                    {s.reward_count > 0 && (
                      <div style={{
                        fontFamily: serif, fontStyle: "italic", fontSize: 11, fontWeight: 500,
                        padding: "1px 8px", borderRadius: 2,
                        background: "rgba(178,58,72,0.2)", color: "#fca5a5",
                        border: "1px solid rgba(178,58,72,0.4)",
                      }}>{s.reward_count}× rewarded</div>
                    )}
                  </div>
                </div>
              );
            })}
            {board.students.length === 0 && (
              <div style={{
                gridColumn: "1/-1", display: "flex", alignItems: "center", justifyContent: "center",
                fontFamily: serif, fontStyle: "italic",
                color: "rgba(245,241,232,0.35)", fontSize: 15,
              }}>
                No students enrolled in this class yet.
              </div>
            )}
          </div>
            );
          })()}
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
            background: "linear-gradient(160deg, rgba(12,8,28,0.97), rgba(6,4,18,0.99))",
            padding: "10px 10px 8px",
            boxShadow: "inset 0 1px 0 rgba(255,255,255,0.07)",
          }}>
            <div style={{ fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.25em", color: "rgba(255,255,255,0.35)", marginBottom: 8, flexShrink: 0 }}>WEEK SCHEDULE</div>
            <div style={{ flex: 1, overflow: "hidden", minHeight: 0, display: "flex", flexDirection: "column", gap: 4 }}>
              {/* Day header */}
              <div style={{ display: "grid", gridTemplateColumns: "38px repeat(6, 1fr)", gap: 3, flexShrink: 0 }}>
                <div />
                {DAY_LETTERS.map(d => {
                  const isToday = d === dayLetter;
                  return (
                    <div key={d} style={{
                      textAlign: "center", fontSize: 14, fontWeight: 900,
                      padding: "6px 2px", borderRadius: 9,
                      background: isToday
                        ? "linear-gradient(135deg, rgba(245,158,11,0.5), rgba(251,191,36,0.3))"
                        : "rgba(255,255,255,0.05)",
                      color: isToday ? "#fde68a" : "rgba(255,255,255,0.35)",
                      border: isToday ? "1.5px solid rgba(245,158,11,0.7)" : "1px solid rgba(255,255,255,0.07)",
                      boxShadow: isToday ? "0 0 16px rgba(245,158,11,0.4), inset 0 1px 0 rgba(255,255,255,0.15)" : "none",
                      letterSpacing: "0.04em",
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
                  <div key={grade} style={{ display: "grid", gridTemplateColumns: "38px repeat(6, 1fr)", gap: 3, flex: 1, minHeight: 0 }}>
                    {/* Grade label */}
                    <div style={{
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 13, fontWeight: 900, borderRadius: 9,
                      color: gc.text,
                      background: `linear-gradient(135deg, ${gc.from.replace("0.22","0.5")}, ${gc.to.replace("0.12","0.25")})`,
                      border: `1.5px solid ${gc.border}`,
                      boxShadow: `0 0 8px ${gc.glow}`,
                    }}>{grade}th</div>
                    {DAY_LETTERS.map(day => {
                      const c = board.specials.find(r => Number(r.grade) === grade && String(r.day_letter).toUpperCase() === day);
                      const isToday = day === dayLetter;
                      return (
                        <div key={day} style={{
                          display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                          textAlign: "center", borderRadius: 9, padding: "4px 2px",
                          background: isToday
                            ? `linear-gradient(160deg, ${gc.from.replace("0.22","0.5")}, ${gc.to.replace("0.12","0.28")})`
                            : "rgba(255,255,255,0.03)",
                          border: isToday ? `1.5px solid ${gc.border}` : "1px solid rgba(255,255,255,0.06)",
                          boxShadow: isToday && c ? `0 0 10px ${gc.glow}, inset 0 1px 0 rgba(255,255,255,0.1)` : "none",
                          gap: 2, overflow: "hidden",
                        }}>
                          {c?.activity ? (
                            <>
                              <span style={{ fontSize: 16, lineHeight: 1 }}>{actEmoji(c.activity)}</span>
                              <span style={{
                                fontSize: 12, fontWeight: 900, lineHeight: 1.15,
                                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                                maxWidth: "100%", padding: "0 3px",
                                color: isToday ? gc.text : "rgba(255,255,255,0.65)",
                                textShadow: isToday ? `0 0 8px ${gc.glow}` : "none",
                              }}>{c.activity}</span>
                            </>
                          ) : (
                            <span style={{ opacity: 0.12, fontSize: 14 }}>✦</span>
                          )}
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
