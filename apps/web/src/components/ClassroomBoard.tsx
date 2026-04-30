import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "../lib/api.ts";
import { findCurrentBlock, findNextBlock, type ScheduleBlock } from "../lib/useCurrentBlock.ts";
import { getSocket } from "../lib/ws.ts";
import { useAuth } from "../lib/auth.tsx";

function extractYouTubeId(url: string): string | null {
  if (!url) return null;
  if (/^[A-Za-z0-9_-]{11}$/.test(url.trim())) return url.trim();
  const m = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)([A-Za-z0-9_-]{11})/);
  return m ? m[1] : null;
}


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
  @keyframes helpPulse {
    0%,100% { box-shadow: 0 0 0 0 rgba(239,68,68,0.7), 0 8px 24px rgba(239,68,68,0.45); transform: scale(1); }
    50%     { box-shadow: 0 0 0 14px rgba(239,68,68,0.0), 0 12px 32px rgba(239,68,68,0.6); transform: scale(1.02); }
  }
  @keyframes presPulse {
    0%,100% { transform: scale(1); opacity: 0.9; }
    50%     { transform: scale(1.18); opacity: 1; }
  }
  @keyframes helpBannerSlide {
    from { opacity: 0; transform: translateY(-8px); }
    to   { opacity: 1; transform: translateY(0); }
  }
`;

export default function ClassroomBoard() {
  const [params] = useSearchParams();
  const { user } = useAuth();
  const isTeacher = user?.role === "teacher" || user?.role === "admin";
  const classParam = (params.get("class") || "").trim().toLowerCase();

  const [cls, setCls] = useState<any | null>(null);
  const [schedule, setSchedule] = useState<ScheduleBlock[]>([]);
  const [board, setBoard] = useState<{ students: any[]; schedules: any[]; specials: any[]; settings: Record<string,string> }>(
    { students: [], schedules: [], specials: [], settings: {} }
  );
  const [now, setNow] = useState(new Date());

  // Help requests + presence — polled every 8s so the board reflects live
  // classroom state. helpByStudent and presenceByStudent are id→data maps
  // for fast per-tile lookups during render.
  const [helpRequests, setHelpRequests] = useState<any[]>([]);
  const [presenceByStudent, setPresenceByStudent] = useState<Record<string, { last_seen: string; activity: string; isOnline: boolean }>>({});
  useEffect(() => {
    if (!cls?.id) return;
    let cancelled = false;
    const tick = async () => {
      try {
        const [help, presence] = await Promise.all([
          api.getClassHelpRequests(cls.id).catch(() => ({ requests: [] as any[] })),
          isTeacher ? api.getClassPresence(cls.id).catch(() => [] as any[]) : Promise.resolve([] as any[]),
        ]);
        if (cancelled) return;
        setHelpRequests(help.requests || []);
        const map: Record<string, any> = {};
        for (const p of presence as any[]) {
          if (p?.id) map[p.id] = { last_seen: p.last_seen, activity: p.activity || "", isOnline: !!p.isOnline };
        }
        setPresenceByStudent(map);
      } catch {}
    };
    tick();
    const iv = setInterval(tick, 8000);
    return () => { cancelled = true; clearInterval(iv); };
  }, [cls?.id, isTeacher]);
  const helpByStudent = useMemo(() => {
    const map: Record<string, any> = {};
    for (const r of helpRequests) map[r.student_id] = r;
    return map;
  }, [helpRequests]);

  // Class timer — polled by everyone (board needs to display countdown),
  // controls only render for teachers. Uses ends_at wall-clock time so
  // every device shows the same countdown without server round-trips.
  const [timer, setTimer] = useState<{
    state: "idle" | "running" | "paused";
    duration_ms: number;
    ends_at?: string | null;
    remaining_ms?: number | null;
    label?: string | null;
  } | null>(null);
  const [timerNow, setTimerNow] = useState(Date.now());
  useEffect(() => {
    if (!cls?.id) return;
    let cancelled = false;
    const tick = async () => {
      try {
        const t = await api.getClassTimer(cls.id);
        if (!cancelled) setTimer(t);
      } catch {}
    };
    tick();
    const iv = setInterval(tick, 5_000);
    return () => { cancelled = true; clearInterval(iv); };
  }, [cls?.id]);
  // Local 1Hz tick so the countdown doesn't lag the server-poll cadence
  useEffect(() => {
    const iv = setInterval(() => setTimerNow(Date.now()), 1000);
    return () => clearInterval(iv);
  }, []);

  const timerRemainingMs = (() => {
    if (!timer) return 0;
    if (timer.state === "running" && timer.ends_at) {
      return Math.max(0, new Date(timer.ends_at).getTime() - timerNow);
    }
    if (timer.state === "paused" && timer.remaining_ms != null) return timer.remaining_ms;
    return timer.duration_ms || 0;
  })();
  const timerVisible = !!timer && (timer.state === "running" || timer.state === "paused");
  const timerExpiringSoon = timer?.state === "running" && timerRemainingMs > 0 && timerRemainingMs <= 60_000;
  const timerHitZero = timer?.state === "running" && timerRemainingMs === 0;
  const fmtTime = (ms: number) => {
    const total = Math.ceil(ms / 1000);
    const m = Math.floor(total / 60);
    const s = total % 60;
    return `${m}:${String(s).padStart(2, "0")}`;
  };

  // Teacher controls — set duration, start/pause/resume/reset.
  const [timerControlsOpen, setTimerControlsOpen] = useState(false);
  const [timerMinutes, setTimerMinutes] = useState(20);
  const sendTimer = async (action: "set" | "start" | "pause" | "resume" | "reset", minutes?: number) => {
    if (!cls?.id) return;
    try {
      const t = await api.setClassTimer(cls.id, { minutes: minutes ?? timerMinutes, action });
      setTimer(t as any);
    } catch {}
  };

  // Live class progress (teacher-only widget on the board)
  const [classProgress, setClassProgress] = useState<{
    pct: number;
    studentsDone: number;
    totalStudents: number;
    totalDone?: number;
    totalAssigned?: number;
    topToday: Array<{ student_id: string; name: string; count: number }>;
    recent: Array<{ name: string; title: string; ts: string }>;
    byStudent?: Record<string, { open: number; done: number; total: number; pct: number }>;
  } | null>(null);
  useEffect(() => {
    if (!cls?.id || !isTeacher) return;
    let cancelled = false;
    const tick = async () => {
      try {
        const d = await api.getBoardLiveProgress(cls.id);
        if (!cancelled) setClassProgress(d);
      } catch {}
    };
    tick();
    const iv = setInterval(tick, 8_000);
    return () => { cancelled = true; clearInterval(iv); };
  }, [cls?.id, isTeacher]);
  const [error, setError] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [musicPlaying, setMusicPlaying] = useState(false);
  const [musicLoaded, setMusicLoaded] = useState(false);
  const musicRef = useRef<HTMLIFrameElement>(null);
  const [boardVideo, setBoardVideo] = useState<{ videoId: string; title: string; url?: string } | null>(null);
  const [boardMuted, setBoardMuted] = useState(true);
  const boardIframeRef = useRef<HTMLIFrameElement>(null);
  const boardVideoIdRef = useRef<string | null>(null);

  // Scale the board to fill any viewport while preserving the 1920×1080 design
  const [scale, setScale] = useState(1);
  useEffect(() => {
    const update = () => setScale(Math.min(window.innerWidth / 1920, window.innerHeight / 1080));
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

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

  // Auto-unmute after YouTube signals ready; 3s fallback
  useEffect(() => {
    if (!boardVideo?.videoId || boardVideo.videoId === boardVideoIdRef.current) return;
    boardVideoIdRef.current = boardVideo.videoId;
    setBoardMuted(true);

    let unmuted = false;
    const doUnmute = () => {
      if (unmuted) return;
      unmuted = true;
      const f = (cmd: string) => boardIframeRef.current?.contentWindow?.postMessage(
        JSON.stringify({ event: "command", func: cmd, args: [] }), "*"
      );
      f("unMute"); f("playVideo");
      setBoardMuted(false);
    };

    const onMessage = (e: MessageEvent) => {
      try {
        const d = typeof e.data === "string" ? JSON.parse(e.data) : e.data;
        if (d?.event === "onReady" || d?.event === "infoDelivery") doUnmute();
      } catch {}
    };
    window.addEventListener("message", onMessage);
    const fallback = setTimeout(doUnmute, 3000);
    return () => { window.removeEventListener("message", onMessage); clearTimeout(fallback); };
  }, [boardVideo?.videoId]);

  // Listen for manually-broadcast videos from the teacher panel
  useEffect(() => {
    if (!cls?.id) return;
    const socket = getSocket();
    socket.emit("join:class", cls.id);
    const onVideo = (data: any) => {
      if (data.classId !== cls.id) return;
      const id = extractYouTubeId(data.url || data.videoId || "");
      if (id) setBoardVideo({ videoId: id, title: data.title || "Class Video", url: data.url });
    };
    const onStop = (data: any) => {
      if (data?.classId && data.classId !== cls.id) return;
      setBoardVideo(null);
    };
    socket.on("class:video", onVideo);
    socket.on("class:video:stop", onStop);
    return () => { socket.off("class:video", onVideo); socket.off("class:video:stop", onStop); };
  }, [cls?.id]);

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
        // Hide any 'test' / 'demo' / 'example' accounts from the board so
        // they don't take up a tile in front of the actual class.
        const filtered = (d?.students || []).filter((s: any) => {
          const name = String(s?.name || "").toLowerCase().trim();
          if (!name) return true;
          if (name === "test" || name === "demo" || name === "example") return false;
          if (/^test\b/.test(name) || /\btest\s*student\b/.test(name)) return false;
          return true;
        });
        setBoard({ students: filtered, schedules: d?.schedules||[], specials: d?.specials||[], settings: d?.settings||{} });
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

  // ── Full-screen video takeover ────────────────────────────────────────────
  if (boardVideo) {
    const origin = encodeURIComponent(window.location.origin);
    const src = `https://www.youtube-nocookie.com/embed/${boardVideo.videoId}?autoplay=1&mute=1&enablejsapi=1&origin=${origin}&rel=0&modestbranding=1&playsinline=1`;
    const stopAll = () => {
      setBoardVideo(null);
      setBoardMuted(true);
      boardVideoIdRef.current = null;
      const s = getSocket();
      s.emit("class:video:stop", { classId: cls.id });
      api.stopClassVideo(cls.id).catch(() => {});
      api.endClassBroadcast(cls.id).catch(() => {});
    };
    const toggleMute = () => {
      const cmd = boardMuted ? "unMute" : "mute";
      boardIframeRef.current?.contentWindow?.postMessage(JSON.stringify({ event: "command", func: cmd, args: [] }), "*");
      setBoardMuted(m => !m);
    };
    return (
      <div style={{ position: "fixed", inset: 0, background: "#000", zIndex: 9999, display: "flex", flexDirection: "column" }}>
        <div style={{
          position: "absolute", top: 0, left: 0, right: 0, zIndex: 1, height: 48,
          background: "rgba(0,0,0,0.9)", borderBottom: "1px solid rgba(255,255,255,0.07)",
          padding: "0 20px", display: "flex", alignItems: "center", justifyContent: "space-between",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#ef4444", boxShadow: "0 0 8px #ef4444" }} />
            <span style={{ color: "#fff", fontWeight: 700, fontSize: 14 }}>{boardVideo.title}</span>
            <span style={{ color: "rgba(255,255,255,0.4)", fontSize: 11 }}>Broadcasting to all devices</span>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={toggleMute} style={{
              background: boardMuted ? "rgba(234,179,8,0.2)" : "rgba(255,255,255,0.1)",
              border: `1px solid ${boardMuted ? "rgba(234,179,8,0.5)" : "rgba(255,255,255,0.15)"}`,
              color: boardMuted ? "#fbbf24" : "#fff", borderRadius: 6, padding: "4px 14px", cursor: "pointer", fontSize: 12,
            }}>{boardMuted ? "🔇 Unmute" : "🔊 Mute"}</button>
            <button onClick={stopAll} style={{
              background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.15)",
              color: "#fff", borderRadius: 6, padding: "4px 14px", cursor: "pointer", fontSize: 12,
            }}>✕ End</button>
          </div>
        </div>
        <iframe
          ref={boardIframeRef}
          src={src}
          style={{ position: "absolute", top: 48, left: 0, right: 0, bottom: 0, width: "100%", height: "calc(100% - 48px)", border: "none" }}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          title={boardVideo.title}
          allowFullScreen
        />
      </div>
    );
  }

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
        fontFamily: serif, fontSize: 12, fontWeight: 600, fontStyle: "italic",
        color: "rgba(217,119,6,0.9)", letterSpacing: "0.02em",
      }}>№ {n}</span>
      <span style={{
        fontFamily: serif, fontSize: 16, fontWeight: 600, letterSpacing: "0.18em",
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
      overflow: "hidden",
      background: bgUrl ? `url(${bgUrl}) center/cover no-repeat` : bg,
    }}>
    <div style={{
      position: "absolute",
      top: "50%", left: "50%",
      width: 1920, height: 1080,
      transform: `translate(-50%, -50%) scale(${scale})`,
      transformOrigin: "center center",
      overflow: "hidden", display: "grid",
      gridTemplateRows: "72px 156px 1fr 56px",
      gap: 8, padding: "12px 16px 12px 16px",
      color: "white", fontFamily: "'Inter', system-ui, sans-serif",
      background: bgUrl ? `url(${bgUrl}) center/cover no-repeat` : bg,
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

      {/* ── HELP BANNER: shown when any student raised their hand ── */}
      {helpRequests.length > 0 && (
        <div
          style={{
            position: "absolute",
            top: 8, left: "50%", transform: "translateX(-50%)",
            zIndex: 50,
            background: "linear-gradient(135deg, rgba(239,68,68,0.95), rgba(220,38,38,0.85))",
            color: "white",
            padding: "10px 22px",
            borderRadius: 14,
            fontWeight: 800,
            fontSize: 18,
            display: "flex", alignItems: "center", gap: 14,
            boxShadow: "0 12px 32px rgba(239,68,68,0.45)",
            border: "2px solid #fca5a5",
            animation: "helpBannerSlide .35s ease both, helpPulse 1.6s ease-in-out infinite",
          }}
        >
          <span style={{ fontSize: 28 }}>✋</span>
          <span>
            {helpRequests.length === 1
              ? `${helpRequests[0].student_name} needs help!`
              : `${helpRequests.length} students need help — ${helpRequests.slice(0, 4).map((r) => (r.student_name || "?").split(" ")[0]).join(", ")}${helpRequests.length > 4 ? "…" : ""}`}
          </span>
        </div>
      )}

      {/* ── LIVE CLASS PROGRESS — subtle line that hugs the bottom of the
          board. Editorial label + thin amber/teal hairline that blends in
          rather than competing with the student grid. Read-only, teachers
          only. Refreshes every 15s so it tracks any newly-posted work. */}
      {isTeacher && classProgress && (
        <div
          style={{
            position: "absolute",
            bottom: 8, left: 16, right: 16,
            zIndex: 40,
            display: "flex",
            alignItems: "center",
            gap: 14,
            pointerEvents: "none",
          }}
        >
          <div style={{
            fontFamily: serif, fontStyle: "italic",
            fontSize: 11, fontWeight: 600,
            letterSpacing: "0.16em", textTransform: "uppercase",
            color: g(0.45),
            whiteSpace: "nowrap",
          }}>
            Class progress
          </div>

          {/* Hairline rail with subtle accent fill */}
          <div style={{
            flex: 1,
            height: 2,
            background: g(0.08),
            borderRadius: 1,
            overflow: "hidden",
            position: "relative",
          }}>
            <div style={{
              position: "absolute",
              top: -1, left: 0, height: 4,
              width: `${classProgress.pct}%`,
              background: classProgress.pct >= 100
                ? "linear-gradient(90deg, transparent, #5b8a6e 40%, #7dd3c5 80%)"
                : "linear-gradient(90deg, transparent, #d97706 40%, #fbbf24 80%)",
              borderRadius: 2,
              transition: "width .8s cubic-bezier(0.22,1,0.36,1)",
              boxShadow: classProgress.pct >= 100
                ? "0 0 8px rgba(125,211,197,0.5)"
                : "0 0 8px rgba(251,191,36,0.4)",
            }} />
          </div>

          <div style={{
            fontFamily: serif, fontStyle: "italic",
            fontSize: 13, fontWeight: 500,
            color: classProgress.pct >= 100 ? "#7dd3c5" : "#fde68a",
            whiteSpace: "nowrap",
          }}>
            {/* Show actual work done across the class — done/total
                assignments, not just "students who finished". This
                makes the bar move continuously as kids submit. */}
            {(classProgress.totalDone ?? 0)}/{(classProgress.totalAssigned ?? 0)} · {classProgress.pct}%
          </div>

          {classProgress.recent[0] && (
            <div style={{
              fontFamily: serif, fontStyle: "italic",
              fontSize: 11, color: g(0.45),
              whiteSpace: "nowrap",
              overflow: "hidden", textOverflow: "ellipsis",
              maxWidth: 280,
            }}>
              · just turned in: {(classProgress.recent[0].name || "?").split(" ")[0]} — {classProgress.recent[0].title}
            </div>
          )}
        </div>
      )}

      {/* ── CLASS TIMER ── Big countdown when active. Teacher controls
          appear as a small icon (top-left) that opens a panel. The
          controls only render for teachers, so kids touching the board
          don't see anything to tap. */}
      {timerVisible && (
        <div
          style={{
            position: "absolute",
            top: 78, left: "50%", transform: "translateX(-50%)",
            zIndex: 35,
            display: "flex", flexDirection: "column", alignItems: "center",
            background: "linear-gradient(180deg, rgba(13,19,33,0.92) 0%, rgba(7,8,15,0.92) 100%)",
            borderTop: `2px solid ${timerHitZero ? "#22c55e" : timerExpiringSoon ? "#b23a48" : "#7dd3c5"}`,
            border: `1px solid ${g(0.14)}`,
            borderRadius: 4,
            padding: "8px 22px 10px",
            pointerEvents: "none",
            boxShadow: timerExpiringSoon ? "0 0 24px rgba(178,58,72,0.45)" : "0 6px 20px rgba(0,0,0,0.4)",
            animation: timerExpiringSoon ? "helpPulse 1s ease-in-out infinite" : undefined,
          }}
        >
          {timer?.label && (
            <div style={{
              fontFamily: serif, fontStyle: "italic",
              fontSize: 11, fontWeight: 600,
              letterSpacing: "0.16em", textTransform: "uppercase",
              color: g(0.55), marginBottom: 2,
            }}>
              {timer.label}
            </div>
          )}
          <div style={{
            fontFamily: serif, fontSize: 56, fontWeight: 500, fontStyle: "italic",
            letterSpacing: "-0.02em", lineHeight: 1,
            color: timerHitZero ? "#86efac" : timerExpiringSoon ? "#fca5a5" : "#fde68a",
            fontVariantNumeric: "tabular-nums",
          }}>
            {timerHitZero ? "Time!" : fmtTime(timerRemainingMs)}
          </div>
          {timer?.state === "paused" && (
            <div style={{
              fontFamily: serif, fontStyle: "italic",
              fontSize: 11, color: g(0.5),
              marginTop: 2, letterSpacing: "0.1em", textTransform: "uppercase",
            }}>
              ⏸ paused
            </div>
          )}
        </div>
      )}

      {/* Teacher-only timer controls — discreet icon, opens a panel */}
      {isTeacher && (
        <button
          onClick={() => setTimerControlsOpen((v) => !v)}
          title="Class timer controls"
          style={{
            position: "absolute",
            top: 12, left: 14,
            zIndex: 36,
            width: 36, height: 36, borderRadius: "50%",
            background: "rgba(13,19,33,0.85)",
            border: `1px solid ${g(0.18)}`,
            color: "#fde68a",
            fontSize: 18,
            cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center",
            touchAction: "manipulation",
          }}
        >
          ⏱
        </button>
      )}

      {isTeacher && timerControlsOpen && (
        <div
          style={{
            position: "absolute",
            top: 56, left: 14,
            zIndex: 50,
            background: "linear-gradient(180deg, rgba(13,19,33,0.96) 0%, rgba(7,8,15,0.96) 100%)",
            borderTop: "2px solid #b23a48",
            border: `1px solid ${g(0.14)}`,
            borderRadius: 4,
            padding: "14px 18px",
            color: "#f5f1e8",
            minWidth: 280,
            boxShadow: "0 12px 32px rgba(0,0,0,0.5)",
          }}
        >
          <div style={{
            fontFamily: serif, fontStyle: "italic", fontSize: 11, fontWeight: 600,
            letterSpacing: "0.16em", textTransform: "uppercase",
            color: "#7dd3c5", marginBottom: 10,
            borderBottom: `1px solid ${g(0.10)}`, paddingBottom: 6,
          }}>
            ⏱ Class timer
          </div>
          {/* Minutes setter */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
            <button
              onClick={() => setTimerMinutes((m) => Math.max(1, m - 5))}
              style={{ width: 32, height: 32, borderRadius: 4, background: g(0.08), border: `1px solid ${g(0.18)}`, color: "#f5f1e8", fontSize: 18, fontWeight: 700, cursor: "pointer" }}
            >−</button>
            <div style={{ flex: 1, textAlign: "center", fontFamily: serif, fontSize: 22, fontStyle: "italic", color: "#fde68a", fontVariantNumeric: "tabular-nums" }}>
              {timerMinutes} min
            </div>
            <button
              onClick={() => setTimerMinutes((m) => Math.min(120, m + 5))}
              style={{ width: 32, height: 32, borderRadius: 4, background: g(0.08), border: `1px solid ${g(0.18)}`, color: "#f5f1e8", fontSize: 18, fontWeight: 700, cursor: "pointer" }}
            >+</button>
          </div>
          {/* Quick presets */}
          <div style={{ display: "flex", gap: 4, marginBottom: 12, flexWrap: "wrap" }}>
            {[5, 10, 15, 20, 30, 45, 60].map((m) => (
              <button
                key={m}
                onClick={() => setTimerMinutes(m)}
                style={{
                  padding: "4px 10px", borderRadius: 99,
                  background: timerMinutes === m ? "#7dd3c5" : g(0.06),
                  border: `1px solid ${timerMinutes === m ? "#7dd3c5" : g(0.14)}`,
                  color: timerMinutes === m ? "#0d1321" : g(0.7),
                  fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: serif,
                }}
              >{m}</button>
            ))}
          </div>
          {/* Action buttons */}
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {timer?.state !== "running" && (
              <button
                onClick={() => sendTimer(timer?.state === "paused" ? "resume" : "start")}
                style={{ flex: 1, padding: "8px 12px", borderRadius: 4, background: "linear-gradient(135deg, #5b8a6e, #2a6f6a)", color: "#f5f1e8", border: "none", fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: serif, fontStyle: "italic" }}
              >
                ▶ {timer?.state === "paused" ? "Resume" : "Start"}
              </button>
            )}
            {timer?.state === "running" && (
              <button
                onClick={() => sendTimer("pause")}
                style={{ flex: 1, padding: "8px 12px", borderRadius: 4, background: "linear-gradient(135deg, #d97706, #b45309)", color: "#f5f1e8", border: "none", fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: serif, fontStyle: "italic" }}
              >
                ⏸ Pause
              </button>
            )}
            <button
              onClick={() => sendTimer("reset")}
              style={{ flex: 1, padding: "8px 12px", borderRadius: 4, background: g(0.08), border: `1px solid ${g(0.18)}`, color: "#f5f1e8", fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: serif, fontStyle: "italic" }}
            >
              ↻ Reset
            </button>
          </div>
        </div>
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
            fontFamily: serif, fontSize: 44, fontWeight: 500, fontStyle: "italic",
            letterSpacing: "-0.015em", margin: 0, color: "#f5f1e8",
            lineHeight: 1,
          }}>{cls.name}</h1>
          <span style={{
            fontFamily: serif, fontStyle: "italic", fontSize: 15,
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
            fontFamily: serif, fontStyle: "italic", fontSize: 10, fontWeight: 500,
            color: "rgba(217,119,6,0.85)", letterSpacing: "0.28em", textTransform: "uppercase",
          }}>Cycle Day</span>
          <span style={{
            fontFamily: serif, fontSize: 38, fontWeight: 600, lineHeight: 1,
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
            fontFamily: mono, fontSize: 36, fontWeight: 500,
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
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 14, flexWrap: "wrap" }}>
                <span style={{
                  fontFamily: serif, fontSize: 56, fontWeight: 600,
                  letterSpacing: "-0.02em", color: "#f5f1e8", lineHeight: 1,
                }}>{currentBlock.label || currentBlock.subject}</span>
                <span style={{
                  fontFamily: mono, fontSize: 20, color: "rgba(245,241,232,0.7)",
                  fontVariantNumeric: "tabular-nums",
                }}>{currentBlock.start_time}–{currentBlock.end_time}</span>
                {currentBlock.is_break && (
                  <span style={{
                    fontFamily: serif, fontStyle: "italic", fontSize: 14, fontWeight: 500,
                    padding: "3px 12px", borderRadius: 3,
                    background: "rgba(42,111,106,0.25)", color: "#7dd3c5",
                    border: "1px solid rgba(42,111,106,0.45)",
                  }}>Break</span>
                )}
              </div>
              {/* Up next strip — show the next 3 blocks so kids can see
                  what's coming for the rest of the day, not just the
                  immediate next block. */}
              {(() => {
                const upcoming: ScheduleBlock[] = [];
                if (Array.isArray(schedule) && currentBlock) {
                  const idx = schedule.findIndex((b) => b.start_time === currentBlock.start_time && b.end_time === currentBlock.end_time);
                  if (idx >= 0) {
                    for (let i = idx + 1; i < schedule.length && upcoming.length < 3; i++) {
                      upcoming.push(schedule[i]);
                    }
                  }
                }
                if (upcoming.length === 0) return null;
                return (
                  <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                    <span style={{
                      fontFamily: serif, fontStyle: "italic", fontSize: 12,
                      color: "rgba(245,241,232,0.45)", letterSpacing: "0.16em",
                      textTransform: "uppercase", fontWeight: 600,
                    }}>Up Next</span>
                    {upcoming.map((b, i) => (
                      <span key={i} style={{
                        display: "inline-flex", alignItems: "baseline", gap: 6,
                        padding: "4px 12px", borderRadius: 3,
                        background: "rgba(255,255,255,0.05)",
                        border: `1px solid ${g(0.10)}`,
                      }}>
                        <span style={{
                          fontFamily: mono, fontSize: 12, fontWeight: 600,
                          color: "rgba(245,241,232,0.85)",
                          fontVariantNumeric: "tabular-nums",
                        }}>{b.start_time}</span>
                        <span style={{
                          fontFamily: serif, fontSize: 14, fontWeight: 500,
                          color: "#f5f1e8", letterSpacing: "-0.01em",
                        }}>{b.label || b.subject}</span>
                      </span>
                    ))}
                  </div>
                );
              })()}
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
              fontFamily: mono, fontSize: 30, fontWeight: 500,
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
            }}>11 O'Clock Specialist</div>
            <div style={{
              fontFamily: serif, fontSize: 16, fontWeight: 600,
              color: "#fbbf24", letterSpacing: "-0.01em",
            }}>{board.settings.specialist_name}</div>
          </div>
        )}
      </section>

      {/* ── ROW 3: Main content ── */}
      <div style={{ position: "relative", zIndex: 1, display: "grid", gridTemplateColumns: "62% 1fr", gap: 10, overflow: "hidden", minHeight: 0 }}>

        {/* LEFT: Behavior Stars — "The Roster" */}
        <section style={{ ...card, display: "flex", flexDirection: "column", overflow: "hidden", minHeight: 0, padding: "10px 14px" }}>
          <SectionLabel n="01" title="The Roster" kicker="Five stars earns McDonald's! 🍔" />
          {(() => {
            const n = board.students.length || 1;
            const cols = n <= 4 ? 2 : n <= 8 ? 4 : n <= 12 ? 4 : n <= 16 ? 4 : 5;
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

                  {/* Presence dot — green = online, gray = offline. Sits top-left
                      so teacher can scan the room at a glance. */}
                  {(() => {
                    const pres = presenceByStudent[s.id];
                    const online = pres?.isOnline;
                    return (
                      <div
                        title={online ? `Working — ${pres?.activity || "active"}` : "Offline"}
                        style={{
                          position: "absolute", top: 7, left: 7,
                          width: 10, height: 10, borderRadius: "50%",
                          background: online ? "#22c55e" : "rgba(255,255,255,0.18)",
                          boxShadow: online ? "0 0 8px rgba(34,197,94,0.7)" : undefined,
                          animation: online ? "presPulse 2.4s ease-in-out infinite" : undefined,
                          zIndex: 1,
                        }}
                      />
                    );
                  })()}

                  {/* Help-request alert overlay — display only. Kids can
                      walk up and touch the projector; nothing should
                      respond to that. Teachers clear from their own
                      device's TeacherDashboard or the help-list endpoint. */}
                  {helpByStudent[s.id] && (
                    <div
                      style={{
                        position: "absolute", inset: 0, zIndex: 5,
                        background: "linear-gradient(135deg, rgba(239,68,68,0.85), rgba(220,38,38,0.65))",
                        border: "3px solid #fca5a5",
                        borderRadius: 4,
                        pointerEvents: "none",
                        display: "flex", flexDirection: "column",
                        alignItems: "center", justifyContent: "center",
                        animation: "helpPulse 1s ease-in-out infinite",
                        color: "white",
                      }}
                    >
                      <div style={{ fontSize: 38 }}>✋</div>
                      <div style={{ fontSize: 13, fontWeight: 900, marginTop: 4, textShadow: "0 2px 6px rgba(0,0,0,0.5)" }}>
                        NEEDS HELP
                      </div>
                      <div style={{ fontSize: 11, fontWeight: 700, opacity: 0.9, marginTop: 2 }}>
                        {firstName}
                      </div>
                    </div>
                  )}

                  {/* Card body */}
                  <div style={{ flex: 1, padding: "12px 8px 10px 10px", display: "flex", flexDirection: "column", alignItems: "center", gap: 7, justifyContent: "center" }}>
                    {/* Avatar — flat disc, no inner glow soup */}
                    <div style={{
                      width: 74, height: 74, borderRadius: "50%", flexShrink: 0, overflow: "hidden",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontFamily: serif, fontSize: s.avatar_emoji ? 38 : 32, fontWeight: 600, color: "#0d1321",
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
                      fontFamily: serif, fontSize: 20,
                      fontWeight: isFull ? 600 : 500,
                      fontStyle: isFull ? "italic" : "normal",
                      lineHeight: 1.05, letterSpacing: "-0.01em",
                      maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", padding: "0 6px",
                      color: isFull ? "#fde68a" : "#f5f1e8",
                    }}>
                      {firstName}
                    </div>

                    {/* Stars — bigger, brighter, with a gentle glow on every filled star */}
                    <div style={{
                      display: "flex", alignItems: "center", gap: 5, justifyContent: "center",
                      padding: "3px 0 1px",
                    }}>
                      {Array.from({ length: 5 }, (_, i) => (
                        <span key={i} style={{
                          fontSize: 22, lineHeight: 1,
                          opacity: i < stars ? 1 : 0.18,
                          filter: i < stars
                            ? (isFull
                                ? "drop-shadow(0 0 6px rgba(251,191,36,1)) drop-shadow(0 0 12px rgba(245,158,11,.6))"
                                : "drop-shadow(0 0 3px rgba(251,191,36,.45))")
                            : "none",
                          animation: i < stars && isFull ? `starGlow 2.2s ease-in-out ${i * 0.15}s infinite` : undefined,
                          color: i < stars ? (isFull ? "#fbbf24" : "#fcd34d") : "rgba(245,241,232,0.28)",
                          transition: "all .3s ease",
                        }}>★</span>
                      ))}
                    </div>

                    {/* Per-student daily progress — `done` of `total`
                        assignments visible to this kid today (matches what
                        they actually see in their dashboard queue). The bar
                        only appears if the student has work assigned. */}
                    {(() => {
                      const sp = classProgress?.byStudent?.[String(s.id)];
                      if (!sp || sp.total <= 0) return null;
                      const fillsClass = sp.pct >= 100;
                      return (
                        <div style={{
                          width: "82%",
                          display: "flex", flexDirection: "column", alignItems: "stretch", gap: 3,
                          padding: "2px 0 0",
                        }}>
                          <div style={{
                            height: 4,
                            background: "rgba(245,241,232,0.10)",
                            borderRadius: 2,
                            overflow: "hidden",
                            position: "relative",
                          }}>
                            <div style={{
                              height: "100%",
                              width: `${sp.pct}%`,
                              background: fillsClass
                                ? "linear-gradient(90deg, #5b8a6e 0%, #7dd3c5 100%)"
                                : "linear-gradient(90deg, #d97706 0%, #fbbf24 100%)",
                              borderRadius: 2,
                              transition: "width .8s cubic-bezier(0.22,1,0.36,1)",
                              boxShadow: fillsClass
                                ? "0 0 6px rgba(125,211,197,0.55)"
                                : "0 0 5px rgba(251,191,36,0.45)",
                            }} />
                          </div>
                          <div style={{
                            fontFamily: serif, fontStyle: "italic",
                            fontSize: 10, lineHeight: 1,
                            color: fillsClass ? "#7dd3c5" : "rgba(253,230,138,0.85)",
                            fontVariantNumeric: "tabular-nums",
                            textAlign: "center",
                          }}>
                            {sp.done}/{sp.total}{fillsClass ? " ✓" : ""}
                          </div>
                        </div>
                      );
                    })()}

                    {/* Points — ClassDojo-style amber chip with coin icon */}
                    {typeof s.dojo_points === "number" && (
                      <div style={{
                        fontFamily: "'Inter', sans-serif",
                        display: "inline-flex", alignItems: "center", gap: 5,
                        padding: "3px 10px", borderRadius: 999,
                        background: "linear-gradient(135deg, rgba(217,119,6,0.22), rgba(251,191,36,0.12))",
                        border: "1px solid rgba(251,191,36,0.45)",
                        fontSize: 14, fontWeight: 700,
                        color: "#fde68a",
                        letterSpacing: "0.01em",
                        boxShadow: "0 1px 4px rgba(0,0,0,0.25)",
                      }}>
                        <span style={{ fontSize: 12 }}>🪙</span>
                        {s.dojo_points}
                        <span style={{ fontSize: 10, fontWeight: 500, opacity: 0.65, marginLeft: 2 }}>pts</span>
                      </div>
                    )}

                    {/* Next schedule entry — most imminent upcoming activity */}
                    {(() => {
                      const formatTimeShort = (t: string) => {
                        if (!t) return "";
                        const [hRaw, m] = t.split(":").map((x) => String(x).trim());
                        const h = Number(hRaw);
                        if (!Number.isFinite(h)) return t;
                        const ampm = h >= 12 ? "p" : "a";
                        const h12 = ((h % 12) || 12);
                        return `${h12}:${(m || "00").padStart(2, "0")}${ampm}`;
                      };
                      const nowHHMM = `${String(now.getHours()).padStart(2,"0")}:${String(now.getMinutes()).padStart(2,"0")}`;
                      const all = board.schedules
                        .filter((sc: any) => sc.student_id === s.id)
                        .sort((a: any, b: any) => a.start_time.localeCompare(b.start_time));
                      const sc = all.find((sc: any) => sc.start_time >= nowHHMM) || all[all.length - 1];
                      if (!sc) return null;
                      const act = String(sc.activity || "").trim();
                      return (
                        <div style={{ padding: "0 4px", marginTop: 2 }}>
                          <div style={{
                            display: "flex", alignItems: "center", gap: 4,
                            fontSize: 10, padding: "2px 5px", borderRadius: 3,
                            background: "rgba(42,111,106,0.2)",
                            border: "1px solid rgba(42,111,106,0.35)",
                            borderLeft: "2px solid #2a6f6a",
                          }}>
                            <span style={{
                              fontFamily: "ui-monospace, Menlo, monospace",
                              fontSize: 9, fontWeight: 700,
                              color: "#94e0d4", flexShrink: 0,
                              fontVariantNumeric: "tabular-nums",
                            }}>
                              {formatTimeShort(sc.start_time)}
                            </span>
                            <span style={{ opacity: 0.7, fontSize: 10, flexShrink: 0 }}>{actEmoji(act)}</span>
                            <span style={{
                              color: "#c9ece3", fontWeight: 600, flex: 1, minWidth: 0,
                              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 10,
                            }}>
                              {act}
                            </span>
                          </div>
                        </div>
                      );
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

        {/* RIGHT: Point Leaders (top) + Specials Today (mid) + Specials Rotation (bottom) */}
        <div style={{ display: "grid", gridTemplateRows: "1fr 1fr 1.1fr", gap: 10, overflow: "hidden", minHeight: 0 }}>

          {/* Point Leaders — top 3 by dojo_points, always 3 slots */}
          <section style={{
            ...card,
            display: "flex", flexDirection: "column", overflow: "hidden", minHeight: 0,
            padding: "10px 14px",
          }}>
            <SectionLabel n="02" title="Point Leaders" kicker="Top 3 this week" />
            <div style={{ flex: 1, overflow: "hidden", minHeight: 0, display: "flex", flexDirection: "column", gap: 5, justifyContent: "center" }}>
              {(() => {
                const withPts = [...board.students]
                  .filter(s => s.dojo_points != null && s.dojo_points > 0)
                  .sort((a, b) => (b.dojo_points || 0) - (a.dojo_points || 0));
                const medals = ["🥇", "🥈", "🥉"];
                const accents = ["#fbbf24", "#cbd5e1", "#fb923c"];
                return [0, 1, 2].map(i => {
                  const s = withPts[i];
                  return (
                    <div key={i} style={{
                      display: "flex", alignItems: "center", gap: 10,
                      padding: "8px 12px", borderRadius: 4,
                      background: i === 0 ? "rgba(217,119,6,0.12)" : "rgba(255,255,255,0.025)",
                      borderLeft: `3px solid ${s ? accents[i] : "rgba(255,255,255,0.08)"}`,
                      flex: 1, minHeight: 0,
                    }}>
                      <div style={{ fontSize: 24, flexShrink: 0, width: 30, opacity: s ? 1 : 0.25 }}>{medals[i]}</div>
                      <div style={{ flex: 1, minWidth: 0, overflow: "hidden" }}>
                        <div style={{
                          fontFamily: serif,
                          fontSize: i === 0 ? 28 : 22,
                          fontWeight: i === 0 ? 700 : 500,
                          fontStyle: i === 0 ? "italic" : "normal",
                          color: s ? "#f5f1e8" : "rgba(245,241,232,0.2)",
                          lineHeight: 1.05,
                          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                        }}>
                          {s ? (s.name || "?").split(" ")[0] : "—"}
                        </div>
                      </div>
                      {s && (
                        <div style={{
                          fontFamily: "'Inter', sans-serif",
                          fontSize: i === 0 ? 30 : 24,
                          fontWeight: 800,
                          color: accents[i],
                          fontVariantNumeric: "tabular-nums",
                          display: "flex", alignItems: "center", gap: 4,
                          flexShrink: 0,
                        }}>
                          {s.dojo_points}
                          <span style={{ fontSize: 16, opacity: 0.8 }}>🪙</span>
                        </div>
                      )}
                    </div>
                  );
                });
              })()}
            </div>
          </section>

          {/* Specials Today — "On Today" editorial feature */}
          <section style={{
            ...card,
            display: "flex", flexDirection: "column", overflow: "hidden", minHeight: 0,
            padding: "10px 14px",
          }}>
            <SectionLabel n="03" title="On Today" kicker={`Day ${dayLetter}`} />
            <div style={{ flex: 1, overflow: "hidden", minHeight: 0, display: "flex", flexDirection: "column", gap: 6 }}>
              {GRADES.map((grade, gi) => {
                const students = board.students.filter(s => Number(s.specials_grade) === grade);
                if (students.length === 0) return null;
                const act = board.specials.find(r => Number(r.grade) === grade && String(r.day_letter).toUpperCase() === dayLetter)?.activity;
                const gc = GRADE_COLORS[grade];
                const emoji = actEmoji(act || "");
                return (
                  <div key={grade} style={{
                    flex: 1, borderRadius: 4, overflow: "hidden",
                    display: "flex", alignItems: "stretch",
                    background: `linear-gradient(95deg, ${gc.from} 0%, rgba(13,19,33,0.06) 85%)`,
                    border: `1px solid ${gc.border}`,
                    animation: `fadeUp .5s ease ${gi * 0.06}s both`,
                  }}>
                    {/* Emoji + grade badge */}
                    <div style={{
                      width: 60, flexShrink: 0, display: "flex", flexDirection: "column",
                      alignItems: "center", justifyContent: "center", gap: 3,
                      borderRight: `1px solid ${gc.border}`,
                      background: "rgba(7,8,15,0.30)",
                    }}>
                      <div style={{ fontSize: 22, lineHeight: 1 }}>{emoji}</div>
                      <div style={{
                        fontFamily: serif, fontStyle: "italic",
                        fontSize: 13, fontWeight: 700, color: gc.text,
                        letterSpacing: "0.05em",
                      }}>{gc.motif}</div>
                    </div>
                    {/* Activity + roster */}
                    <div style={{
                      flex: 1, padding: "8px 12px", display: "flex", flexDirection: "column", justifyContent: "center", gap: 4,
                      minWidth: 0,
                    }}>
                      <div style={{
                        fontFamily: serif, fontSize: 22, fontWeight: 700,
                        color: gc.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                        lineHeight: 1.05, letterSpacing: "-0.01em",
                      }}>
                        {act || <span style={{ opacity: 0.35, fontStyle: "italic", fontWeight: 500 }}>not yet scheduled</span>}
                      </div>
                      <div style={{
                        fontFamily: "'Inter', sans-serif", fontSize: 13, fontWeight: 400,
                        color: "rgba(245,241,232,0.65)", letterSpacing: "0.01em",
                      }}>
                        {students.map(s => (s.name || "?").split(" ")[0]).join("  ·  ")}
                      </div>
                    </div>
                  </div>
                );
              })}
              {board.students.filter(s => !s.specials_grade).length > 0 && (
                <div style={{
                  borderRadius: 3, padding: "5px 12px", display: "flex", alignItems: "center", gap: 10,
                  background: "rgba(255,255,255,0.02)", border: `1px dashed ${g(0.1)}`,
                }}>
                  <div style={{
                    fontFamily: serif, fontStyle: "italic", fontSize: 11, fontWeight: 500,
                    color: "rgba(245,241,232,0.3)", letterSpacing: "0.16em", textTransform: "uppercase", flexShrink: 0,
                  }}>unassigned</div>
                  <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 13, color: "rgba(245,241,232,0.4)" }}>
                    {board.students.filter(s => !s.specials_grade).map(s => (s.name || "?").split(" ")[0]).join("  ·  ")}
                  </div>
                </div>
              )}
            </div>
          </section>

          {/* Specials Rotation — "The Cycle" week-at-a-glance, newspaper grid */}
          <section style={{
            ...card,
            display: "flex", flexDirection: "column", overflow: "hidden", minHeight: 0,
            padding: "10px 14px",
          }}>
            <SectionLabel n="04" title="The Cycle" kicker="A–F rotation" />
            <div style={{ flex: 1, overflow: "hidden", minHeight: 0, display: "flex", flexDirection: "column", gap: 4 }}>
              {/* Day header row */}
              <div style={{
                display: "grid", gridTemplateColumns: "38px repeat(6, 1fr)", gap: 4, flexShrink: 0,
              }}>
                <div />
                {DAY_LETTERS.map(d => {
                  const isToday = d === dayLetter;
                  return (
                    <div key={d} style={{
                      textAlign: "center",
                      fontFamily: serif, fontSize: 20,
                      fontWeight: isToday ? 700 : 500,
                      fontStyle: isToday ? "normal" : "italic",
                      padding: "5px 2px", borderRadius: 4,
                      background: isToday ? "rgba(217,119,6,0.75)" : "transparent",
                      color: isToday ? "#fff" : "rgba(245,241,232,0.35)",
                      border: isToday ? "1px solid #d97706" : "1px solid transparent",
                      letterSpacing: "0.04em",
                    }}>
                      {d}
                    </div>
                  );
                })}
              </div>
              {/* Grade rows */}
              {GRADES.map(grade => {
                const gc = GRADE_COLORS[grade];
                return (
                  <div key={grade} style={{ display: "grid", gridTemplateColumns: "38px repeat(6, 1fr)", gap: 4, flex: 1, minHeight: 0 }}>
                    {/* Grade label cell */}
                    <div style={{
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontFamily: serif, fontStyle: "italic",
                      fontSize: 18, fontWeight: 700, borderRadius: 4,
                      color: gc.text,
                      background: `linear-gradient(180deg, ${gc.from}, rgba(13,19,33,0.2))`,
                      border: `1px solid ${gc.border}`,
                    }}>{grade}</div>
                    {DAY_LETTERS.map(day => {
                      const c = board.specials.find(r => Number(r.grade) === grade && String(r.day_letter).toUpperCase() === day);
                      const isToday = day === dayLetter;
                      return (
                        <div key={day} style={{
                          display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                          textAlign: "center", borderRadius: 4, padding: "4px 2px",
                          background: isToday ? `linear-gradient(160deg, rgba(217,119,6,0.55) 0%, rgba(217,119,6,0.25) 100%)` : "rgba(255,255,255,0.018)",
                          border: isToday ? `1px solid rgba(217,119,6,0.7)` : `1px solid ${g(0.06)}`,
                          gap: 2, overflow: "hidden", minHeight: 0,
                          boxShadow: isToday ? "inset 0 0 12px rgba(217,119,6,0.18)" : "none",
                        }}>
                          {c?.activity ? (
                            <>
                              <span style={{ fontSize: 18, lineHeight: 1, opacity: isToday ? 1 : 0.6 }}>{actEmoji(c.activity)}</span>
                              <span style={{
                                fontFamily: serif,
                                fontSize: 11,
                                fontWeight: isToday ? 600 : 400,
                                fontStyle: "italic",
                                lineHeight: 1.15,
                                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                                maxWidth: "100%", padding: "0 2px",
                                color: isToday ? "#fde68a" : "rgba(245,241,232,0.45)",
                              }}>{c.activity}</span>
                            </>
                          ) : (
                            <span style={{ opacity: 0.15, fontSize: 14 }}>·</span>
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

      {/* ── ROW 4: "The Ledger" — Behavior Levels strip ── */}
      <section style={{
        position: "relative", zIndex: 1,
        ...card, borderRadius: 3,
        display: "flex", alignItems: "center", gap: 14, padding: "0 16px",
        overflow: "hidden", flexShrink: 0,
        borderTop: `1px solid ${g(0.12)}`,
      }}>
        <div style={{
          fontFamily: serif, fontStyle: "italic", fontSize: 13, fontWeight: 600,
          color: "rgba(217,119,6,0.85)", letterSpacing: "0.16em", textTransform: "uppercase",
          flexShrink: 0, borderRight: `1px solid ${g(0.12)}`, paddingRight: 14,
        }}>№ 04 · The Ledger</div>
        <div style={{ flex: 1, display: "flex", gap: 16, alignItems: "center", overflow: "hidden" }}>
          {[5, 4, 3, 2, 1].map(lv => {
            const at = board.students.filter(s => (s.level || 1) === lv);
            if (at.length === 0) return null;
            const lc = BEHAVIOR_LEVELS[lv];
            return (
              <div key={lv} style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                <div style={{
                  fontFamily: serif, fontStyle: "italic",
                  fontSize: 13, fontWeight: 600,
                  padding: "2px 10px 2px", borderRadius: 2,
                  background: lc.bg, color: lc.color,
                  borderLeft: `2px solid ${lc.color}`,
                  letterSpacing: "0.02em",
                }}>Lv {lv}</div>
                {at.map((s, si) => (
                  <span key={s.id} style={{
                    fontFamily: "'Inter', sans-serif",
                    fontSize: 13, fontWeight: 500,
                    color: "rgba(245,241,232,0.82)",
                    letterSpacing: "0.01em",
                    paddingRight: si < at.length - 1 ? 6 : 0,
                    borderRight: si < at.length - 1 ? `1px solid ${g(0.1)}` : "none",
                  }}>{s.name}</span>
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
          style={{ position: "absolute", bottom: 0, right: 0, opacity: 0.01, pointerEvents: "none" }}
          src="about:blank"
          allow="autoplay"
        />
      )}
    </div>
    </div>
  );
}
