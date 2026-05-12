import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "../lib/api.ts";
import { findCurrentBlock, findNextBlock, type ScheduleBlock } from "../lib/useCurrentBlock.ts";
import { getSocket } from "../lib/ws.ts";
import { useAuth } from "../lib/auth.tsx";
import BoardConsole from "./BoardConsole.tsx";
import PinPad from "./PinPad.tsx";
import BirthdayCelebration from "./BirthdayCelebration.tsx";
import FlashLeaderboard from "./FlashLeaderboard.tsx";
import ReactionRain from "./ReactionRain.tsx";
import ActivePassesStrip from "./star/ActivePassesStrip.tsx";
import BoardStarPanel, { toggleStarPanel } from "./star/BoardStarPanel.tsx";
import BoardClassroomTools, { fireRandomPicker, fireEyesOnMe } from "./star/BoardClassroomTools.tsx";
import { StarStore, countsTowardGrade, backfillStudentGrades, type ActivePass } from "../lib/star/storage.ts";
import { setActiveClassId, fireStarBoardEvent } from "../lib/star/boardEvents.ts";
import StudentWallet from "./StudentWallet.tsx";
import MorningSlide from "./MorningSlide.tsx";

function extractYouTubeId(url: string): string | null {
  if (!url) return null;
  if (/^[A-Za-z0-9_-]{11}$/.test(url.trim())) return url.trim();
  const m = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)([A-Za-z0-9_-]{11})/);
  return m ? m[1] : null;
}


const DAY_LETTERS = ["A", "B", "C", "D", "E", "F"] as const;
const GRADES = [3, 4, 5] as const;

// Curated calming-music library. Categories so the picker can group
// them. videoId fields point to long, ad-light YouTube tracks/streams
// known to be widely available; if a track 404s, the picker shows the
// next one in the list and the teacher can disable that preset in
// /board → Settings.
//
// Mood tag drives the chip colors + emoji. Adding new tracks is a
// matter of pushing to this array (no schema change). Items here are
// also seeded into the classroom store as redeemable rewards via the
// "Seed music in store" action in /star → Store.
type MusicMood = "nature" | "instrumental" | "lofi" | "focus" | "kids";
const MUSIC_PRESETS: { id: string; label: string; videoId: string; emoji: string; mood: MusicMood; price?: number }[] = [
  // Nature (existing four — known-good stations)
  { id: "forest",     label: "Forest Spa",          videoId: "xNN7iTA57jM", emoji: "🌿", mood: "nature", price: 15 },
  { id: "ocean",      label: "Ocean Waves",         videoId: "MIr3RsUWrdo", emoji: "🌊", mood: "nature", price: 15 },
  { id: "rain",       label: "Gentle Rain",         videoId: "mPZkdNFkNps", emoji: "🌧", mood: "nature", price: 15 },
  { id: "rain-window",label: "Rain on a Window",    videoId: "q76bMs-NwRk", emoji: "💧", mood: "nature", price: 15 },
  { id: "thunder",    label: "Distant Thunder",     videoId: "nDqvhilTrI8", emoji: "⛈",  mood: "nature", price: 20 },
  { id: "creek",      label: "Forest Creek",        videoId: "ABO9aRtPbCY", emoji: "🍃", mood: "nature", price: 15 },
  { id: "fire",       label: "Crackling Fireplace", videoId: "L_LUpnjgPso", emoji: "🔥", mood: "nature", price: 15 },
  { id: "snow",       label: "Soft Snowfall",       videoId: "NF6L4FXBmbY", emoji: "❄️", mood: "nature", price: 15 },
  { id: "birds",      label: "Birds in the Garden", videoId: "DOgkM_p2EpE", emoji: "🐦", mood: "nature", price: 15 },

  // Instrumental
  { id: "piano",      label: "Spa Piano",           videoId: "4xDzrJKXOOY", emoji: "🎹", mood: "instrumental", price: 15 },
  { id: "tibetan",    label: "Healing Bowls",       videoId: "UgHKb_7884o", emoji: "🔔", mood: "instrumental", price: 20 },
  { id: "guitar",     label: "Soft Acoustic",       videoId: "EBlPlrxsZzs", emoji: "🎸", mood: "instrumental", price: 15 },
  { id: "harp",       label: "Floating Harp",       videoId: "fjfwQOLPnPE", emoji: "🪕", mood: "instrumental", price: 20 },
  { id: "celtic",     label: "Celtic Calm",         videoId: "9KGv9TmFqi0", emoji: "🍀", mood: "instrumental", price: 20 },
  { id: "classical",  label: "Classical for Focus", videoId: "VgRYPNX1uHM", emoji: "🎼", mood: "instrumental", price: 20 },

  // Lo-fi (kid-safe instrumental beats)
  { id: "lofi-study", label: "Lo-Fi Study Beats",   videoId: "jfKfPfyJRdk", emoji: "📚", mood: "lofi", price: 10 },
  { id: "lofi-chill", label: "Chill Lo-Fi",         videoId: "rUxyKA_-grg", emoji: "🌙", mood: "lofi", price: 10 },
  { id: "lofi-jazz",  label: "Lo-Fi Jazz",          videoId: "Dx5qFachd3A", emoji: "🎷", mood: "lofi", price: 10 },

  // Focus / brain
  { id: "alpha",      label: "Alpha Focus Waves",   videoId: "WPni755-Krg", emoji: "🧠", mood: "focus", price: 25 },
  { id: "study-deep", label: "Deep Focus",          videoId: "5qap5aO4i9A", emoji: "🎯", mood: "focus", price: 20 },

  // Kids — gentle children's tunes
  { id: "lullaby",    label: "Storybook Lullabies", videoId: "GVZP-CtxgVM", emoji: "🧸", mood: "kids", price: 10 },
  { id: "music-box",  label: "Music Box",           videoId: "GS3i6OdrCpw", emoji: "🎵", mood: "kids", price: 10 },
];

// Editorial palette: each grade is a distinct tradition, not a tint of purple
//   3rd — deep teal (study / library green)
//   4th — warm amber (afternoon sun)
//   5th — brick red (masthead / upperclass)
const GRADE_COLORS: Record<number, { from: string; to: string; border: string; text: string; glow: string; ink: string; motif: string }> = {
  3: { from: "rgba(99,102,241,0.30)",  to: "rgba(99,102,241,0.08)",  border: "rgba(99,102,241,0.55)",  text: "#a5b4fc", glow: "rgba(99,102,241,0.40)",  ink: "#0f0a2e", motif: "3RD" },
  4: { from: "rgba(168,85,247,0.30)",  to: "rgba(168,85,247,0.08)",  border: "rgba(168,85,247,0.55)",  text: "#c4b5fd", glow: "rgba(168,85,247,0.40)",  ink: "#1a0f2e", motif: "4TH" },
  5: { from: "rgba(236,72,153,0.30)",  to: "rgba(236,72,153,0.08)",  border: "rgba(236,72,153,0.55)",  text: "#f9a8d4", glow: "rgba(236,72,153,0.40)",  ink: "#2e0f24", motif: "5TH" },
};

// Behavior levels: traffic-light logic recolored to fit the violet/pink identity
const BEHAVIOR_LEVELS: Record<number, { label: string; short: string; icon: string; color: string; bg: string; glow: string }> = {
  1: { label: "Level 1",  short: "Lv 1",  icon: "1", color: "#f87171", bg: "rgba(239,68,68,0.28)",   glow: "rgba(239,68,68,0.30)"   },
  2: { label: "Level 2",  short: "Lv 2",  icon: "2", color: "#fb7185", bg: "rgba(244,63,94,0.28)",   glow: "rgba(244,63,94,0.30)"   },
  3: { label: "Level 3",  short: "Lv 3",  icon: "3", color: "#f472b6", bg: "rgba(236,72,153,0.28)",  glow: "rgba(236,72,153,0.30)"  },
  4: { label: "Level 4",  short: "Lv 4",  icon: "4", color: "#c084fc", bg: "rgba(168,85,247,0.28)",  glow: "rgba(168,85,247,0.30)"  },
  5: { label: "Level 5",  short: "Lv 5",  icon: "5", color: "#a5b4fc", bg: "rgba(99,102,241,0.32)",  glow: "rgba(99,102,241,0.32)"  },
};

const ACTIVITY_EMOJI: Array<[string, string]> = [
  ["PE", "🏃"], ["Gym", "🏃"], ["Music", "🎵"], ["Art", "🎨"], ["Library", "📚"],
  ["Tech", "💻"], ["Dance", "💃"], ["Science", "🔬"], ["Drama", "🎭"], ["Spanish", "🗣"],
];
function actEmoji(name = "") {
  for (const [k, v] of ACTIVITY_EMOJI) if (name.toLowerCase().includes(k.toLowerCase())) return v;
  return "✨";
}

// Subject accents — violet/pink/indigo identity
const SUBJECT_ACCENT: Record<string, string> = {
  math: "#ec4899", sel: "#a855f7", coding_art_gym: "#6366f1",
  video_learning: "#818cf8", writing: "#6366f1", daily_news: "#c084fc",
  review: "#ec4899", cashout: "#a855f7", lunch: "#22c55e", recess: "#22c55e",
  calm_down: "#818cf8", ted_talk: "#818cf8",
};

// Motion policy: two focal animations (full-star celebration + urgent countdown).
// Everything else is still — editorial pages don't breathe.
const ANIM = `
  @keyframes starGlow {
    0%,100% { filter: drop-shadow(0 0 4px rgba(236,72,153,.7)); }
    50%     { filter: drop-shadow(0 0 10px rgba(236,72,153,.95)) drop-shadow(0 0 20px rgba(168,85,247,.6)); }
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
    0%,100% { box-shadow: 0 0 0 1px rgba(236,72,153,.45), 0 8px 28px -8px rgba(168,85,247,.40); }
    50%     { box-shadow: 0 0 0 1px rgba(236,72,153,.85), 0 14px 42px -8px rgba(168,85,247,.65); }
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

// Per-student STAR progress — counts EVERY STAR assignment credited to
// the kid (no date filter). Used by the roster card progress bar.
// Pass in the board's students so we can match tracker entries by name
// (CSV imports + manual entries store studentName but no studentId).
// Returns { boardStudentId: { done, total, pct } }.
function computeStarProgressByStudent(
  boardStudents: Array<{ id: any; name?: string }>,
): Record<string, { done: number; total: number; pct: number }> {
  const out: Record<string, { done: number; total: number; pct: number }> = {};
  try {
    const tracker = StarStore.getAsnTrack();
    const all = Object.values(tracker);

    // Build name lookup for the board's roster.
    const idByFirstName = new Map<string, string>();
    const idByFullName  = new Map<string, string>();
    for (const bs of boardStudents) {
      const sid = String(bs.id);
      const full = String(bs.name || "").trim();
      if (full) idByFullName.set(full.toLowerCase(), sid);
      const first = full.split(/\s+/)[0];
      if (first) idByFirstName.set(first.toLowerCase(), sid);
    }

    const resolveBoardId = (t: { studentId?: string; studentName?: string }): string | null => {
      if (t.studentId) {
        if (boardStudents.some((b) => String(b.id) === t.studentId)) return t.studentId;
      }
      if (t.studentName) {
        const tName = String(t.studentName).trim().toLowerCase();
        const tFirst = tName.split(/\s+/)[0];
        return idByFullName.get(tName) || idByFirstName.get(tFirst) || null;
      }
      return null;
    };

    for (const t of all) {
      const sid = resolveBoardId(t);
      if (!sid) continue;
      const cur = out[sid] || { done: 0, total: 0, pct: 0 };
      cur.total += 1;
      const isDone = (t.submissions || []).some((s) =>
        s.studentId === sid ||
        (t.studentId && s.studentId === t.studentId) ||
        s.studentId === "imported"
      );
      if (isDone) cur.done += 1;
      out[sid] = cur;
    }
    for (const sid in out) {
      const r = out[sid];
      r.pct = r.total > 0 ? Math.round((r.done / r.total) * 100) : 0;
    }
  } catch {}
  return out;
}

// Compact teacher-action icon used in the board header. Square, single
// emoji, hover-tooltip via the native title attr. Tint is the accent
// color for the per-action border + faint background fill. Adds gentle
// hover scale + visible focus ring for accessibility.
function ToolIcon({ emoji, title, tint, onClick }: {
  emoji: string; title: string; tint: string; onClick: () => void;
}) {
  const fill = tint.replace(/0\.65\)/, "0.14)").replace(/aa$/, "22");
  const fillHover = tint.replace(/0\.65\)/, "0.28)").replace(/aa$/, "44");
  return (
    <button
      onClick={onClick}
      title={title}
      aria-label={title}
      style={{
        width: 32, height: 32, borderRadius: 6,
        border: `1px solid ${tint}`,
        background: fill,
        color: "white",
        cursor: "pointer", fontSize: 16, lineHeight: 1,
        padding: 0,
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        flexShrink: 0, outline: "none",
        transition: "transform 120ms cubic-bezier(0.22,1,0.36,1), background 180ms cubic-bezier(0.22,1,0.36,1), box-shadow 180ms cubic-bezier(0.22,1,0.36,1)",
      }}
      onMouseEnter={(e) => {
        const el = e.currentTarget as HTMLElement;
        el.style.background = fillHover;
        el.style.transform = "translateY(-1px)";
      }}
      onMouseLeave={(e) => {
        const el = e.currentTarget as HTMLElement;
        el.style.background = fill;
        el.style.transform = "translateY(0)";
      }}
      onMouseDown={(e) => { (e.currentTarget as HTMLElement).style.transform = "scale(0.94)"; }}
      onMouseUp={(e) => { (e.currentTarget as HTMLElement).style.transform = "translateY(-1px)"; }}
      onFocus={(e) => { (e.currentTarget as HTMLElement).style.boxShadow = `0 0 0 3px ${tint.replace(/0\.65\)/, "0.45)").replace(/aa$/, "66")}`; }}
      onBlur={(e) => { (e.currentTarget as HTMLElement).style.boxShadow = ""; }}
    >{emoji}</button>
  );
}

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
  useEffect(() => { backfillStudentGrades(); }, []);
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

  // ── Done-chime ─────────────────────────────────────────────────
  // Plays a synthesized 3-beep bell when the class timer hits zero.
  // No audio asset needed — pure WebAudio. Guarded by a ref keyed to
  // timer.ends_at so we play exactly once per timer instance even
  // though timerHitZero stays true for the rest of that tick window.
  const playedChimeForRef = useRef<string | null>(null);
  useEffect(() => {
    if (!timerHitZero) return;
    const key = String(timer?.ends_at || "");
    if (!key || playedChimeForRef.current === key) return;
    playedChimeForRef.current = key;
    try {
      const Ctx: any = (window as any).AudioContext || (window as any).webkitAudioContext;
      if (!Ctx) return;
      const ctx = new Ctx();
      const beep = (when: number, freq: number, dur: number) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(freq, ctx.currentTime + when);
        gain.gain.setValueAtTime(0, ctx.currentTime + when);
        gain.gain.linearRampToValueAtTime(0.55, ctx.currentTime + when + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + when + dur);
        osc.connect(gain).connect(ctx.destination);
        osc.start(ctx.currentTime + when);
        osc.stop(ctx.currentTime + when + dur + 0.02);
      };
      beep(0,    880, 0.35);
      beep(0.45, 880, 0.35);
      beep(0.90, 1175, 0.55);
      setTimeout(() => { try { ctx.close(); } catch {} }, 2200);
    } catch {}
  }, [timerHitZero, timer?.ends_at]);

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

  // Cross-tab localStorage listener — when the iPad in another tab
  // (or split-screen) writes to star_active_movement / freetime / supply,
  // the browser fires a "storage" event. Force a re-render so the
  // roster card status pills appear immediately without waiting for
  // the per-second timerNow tick.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (!e.key) return;
      if (
        e.key === "star_active_movement" ||
        e.key === "star_active_freetime" ||
        e.key === "star_supply_checkouts" ||
        e.key === "star_active_passes"
      ) {
        setTimerNow(Date.now());
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  // Cross-device scan listener — handles events fired from the iPad
  // (or any other device) so the projector reflects them too:
  //   • start-class-timer → kick off the board's visual countdown
  //   • freetime/movement/supply start/end → mirror to local
  //     localStorage so the roster card status pills render correctly
  //     (the renderer reads StarStore.getActive*() directly).
  // Without this mirror step, scans on iPad would update only the
  // iPad's localStorage; the projector's roster wouldn't know.
  useEffect(() => {
    if (!isTeacher) return;
    let unsub: (() => void) | null = null;
    (async () => {
      const { onStarBoardEvent } = await import("../lib/star/boardEvents.ts");
      unsub = onStarBoardEvent((e: any) => {
        if (!e?.kind) return;
        try {
          if (e.kind === "start-class-timer") {
            const m = /^(\d+)\s*min/i.exec(String(e.detail || ""));
            const mins = m ? Math.max(1, Math.min(120, Number(m[1]))) : 10;
            setTimerMinutes(mins);
            sendTimer("start", mins);
            return;
          }
          if (e.kind === "freetime-start") {
            const m = /^(\d+)\s*min/i.exec(String(e.detail || ""));
            const mins = m ? Math.max(1, Math.min(120, Number(m[1]))) : 10;
            StarStore.startFreetime({
              studentId: e.studentId || "", studentName: e.studentName || "",
              durationMin: mins, startedAt: new Date().toISOString(),
            });
            setTimerNow(Date.now()); // force re-render
            return;
          }
          if (e.kind === "freetime-end") {
            if (e.studentId) StarStore.endFreetime(e.studentId);
            setTimerNow(Date.now());
            return;
          }
          if (e.kind === "movement-out") {
            // detail format: "🎨 Specials" / "🍱 Lunch"
            const lower = String(e.detail || "").toLowerCase();
            const kind: "specials" | "lunch" = lower.includes("lunch") ? "lunch" : "specials";
            StarStore.startMovement({
              studentId: e.studentId || "", studentName: e.studentName || "",
              kind, startedAt: new Date().toISOString(),
            });
            setTimerNow(Date.now());
            return;
          }
          if (e.kind === "movement-in") {
            const lower = String(e.detail || "").toLowerCase();
            const kind: "specials" | "lunch" = lower.includes("lunch") ? "lunch" : "specials";
            if (e.studentId) StarStore.endMovement(e.studentId, kind);
            setTimerNow(Date.now());
            return;
          }
          if (e.kind === "supply-out") {
            const lower = String(e.detail || "").toLowerCase();
            let supplyKind: "Pencil" | "Tablet" | "Headphones" | "Book" = "Pencil";
            if (lower.includes("tablet"))     supplyKind = "Tablet";
            else if (lower.includes("headph")) supplyKind = "Headphones";
            else if (lower.includes("book") || lower.includes("\""))     supplyKind = "Book";
            // For Book detail "📚 \"Title\"" — pull title between quotes
            const titleMatch = /["']([^"']+)["']/.exec(String(e.detail || ""));
            StarStore.checkoutSupply({
              studentId: e.studentId || "",
              studentName: e.studentName || "",
              supplyKind,
              bookTitle: supplyKind === "Book" && titleMatch ? titleMatch[1] : undefined,
            });
            setTimerNow(Date.now());
            return;
          }
          if (e.kind === "supply-in") {
            // Best-effort: find a matching active checkout and end it
            const lower = String(e.detail || "").toLowerCase();
            const all = StarStore.getSupplyCheckouts();
            const guess = all.find((c) =>
              (c.studentId === e.studentId) &&
              lower.includes(c.supplyKind.toLowerCase())
            );
            if (guess) StarStore.returnSupply(guess.id);
            setTimerNow(Date.now());
            return;
          }
        } catch {}
      });
    })();
    return () => { if (unsub) unsub(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isTeacher, cls?.id]);

  // Sunday auto-clear of McDonald's stars. Once per Sunday (Pacific),
  // wipe every kid's stars=5 → 0 since the reward day (Saturday) has
  // passed. localStorage gate keeps it idempotent within the day.
  useEffect(() => {
    if (!isTeacher) return; // teacher's session triggers it for the class
    const pacific = new Date(Date.now() - 7 * 3600_000);
    if (pacific.getUTCDay() !== 0) return; // only Sunday
    const dayKey = pacific.toISOString().slice(0, 10);
    const seenKey = `thign:mcdClear:${dayKey}`;
    if (localStorage.getItem(seenKey)) return;
    const apiBase = (import.meta as any)?.env?.VITE_API_BASE ||
      (window.location.hostname === "localhost"
        ? "http://localhost:4000/api"
        : "https://scratch-classroom-api-td1x.vercel.app/api");
    fetch(`${apiBase}/admin/clear-mcdonalds-week`, { method: "POST" })
      .then((r) => r.json())
      .then((d) => { if (d?.cleared >= 0) localStorage.setItem(seenKey, "1"); })
      .catch(() => {});
  }, [isTeacher]);

  // Helper-of-the-day (additive — picks the kid with the most
  // submissions today; renders as a small pill if available, otherwise
  // nothing). Polls on the same cadence as live-progress.
  const [helperOfDay, setHelperOfDay] = useState<{ id: string; name: string; count: number } | null>(null);
  useEffect(() => {
    if (!cls?.id) return;
    let cancelled = false;
    const tick = async () => {
      try {
        const d = await api.getHelperOfDay(cls.id);
        if (!cancelled) setHelperOfDay(d?.helper ?? null);
      } catch { /* extras optional */ }
    };
    tick();
    const iv = setInterval(tick, 30_000);
    return () => { cancelled = true; clearInterval(iv); };
  }, [cls?.id]);

  // Birthdays for the roster cards. Map of student_id → MM-DD string.
  // Quietly fetched per-student; missing = no ribbon.
  const [birthdaysByStudent, setBirthdaysByStudent] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!cls?.id || !board?.students?.length) return;
    let cancelled = false;
    (async () => {
      const next: Record<string, string> = {};
      await Promise.all(board.students.map(async (s: any) => {
        try {
          const r = await api.getBirthday(s.id);
          if (r?.birthday) next[s.id] = r.birthday;
        } catch { /* skip on failure */ }
      }));
      if (!cancelled) setBirthdaysByStudent(next);
    })();
    return () => { cancelled = true; };
  }, [cls?.id, board?.students?.length]);

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
  const [showConsole, setShowConsole] = useState(false);
  // Student wallet — kid taps face, types PIN, sees own points + badges
  // and can spend at the store from the same view.
  const [showWallet, setShowWallet] = useState(false);
  // Morning slide — full-screen instructions overlay, teacher-toggleable.
  const [showMorningSlide, setShowMorningSlide] = useState(false);
  // PIN gate before opening the console — keeps kids from poking at
  // teacher tools when they walk past the projector. PIN is checked
  // against admin_settings.remote_access_pin / teacher_password via
  // /admin-settings/check-skip-code (same gate as the bypass flow).
  const [consolePinModal, setConsolePinModal] = useState(false);
  const [consolePin, setConsolePin] = useState("");
  const [consolePinError, setConsolePinError] = useState("");
  const [consolePinLoading, setConsolePinLoading] = useState(false);
  const tryConsoleUnlock = async () => {
    if (!consolePin.trim()) return;
    setConsolePinLoading(true);
    setConsolePinError("");
    try {
      const apiBase = (import.meta as any)?.env?.VITE_API_BASE ||
        (window.location.hostname === "localhost"
          ? "http://localhost:4000/api"
          : "https://scratch-classroom-api-td1x.vercel.app/api");
      const token = localStorage.getItem("token") || "";
      const r = await fetch(`${apiBase}/admin-settings/check-skip-code?code=${encodeURIComponent(consolePin.trim())}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const data = await r.json();
      if (data?.valid) {
        setConsolePinModal(false);
        setConsolePin("");
        setShowConsole(true);
      } else {
        setConsolePinError("Wrong PIN — try again");
        setConsolePin("");
      }
    } catch {
      setConsolePinError("Could not verify. Check connection.");
    } finally {
      setConsolePinLoading(false);
    }
  };
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

  // Active track override — when a kid cashes out a music store item,
  // we override the teacher-selected playlist for ~25 minutes. After
  // that the board falls back to the teacher's default. Stored in a
  // ref because we read it from polling effects without forcing
  // re-renders on every check.
  const [activeMusicOverride, setActiveMusicOverride] = useState<{ presetId: string; until: number } | null>(null);

  const effectiveMusicPresetId = useMemo(() => {
    if (activeMusicOverride && Date.now() < activeMusicOverride.until) return activeMusicOverride.presetId;
    return board.settings?.music_playlist_id || "";
  }, [activeMusicOverride, board.settings]);

  const toggleMusic = useCallback(() => {
    if (!musicRef.current) return;
    const preset = MUSIC_PRESETS.find(p => p.id === effectiveMusicPresetId);
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
  }, [musicPlaying, musicLoaded, effectiveMusicPresetId]);

  // When the effective preset changes (override expires, kid redeems
  // a different track, teacher swaps default), reload the iframe so
  // the new track plays. Only fires when music has already been
  // started by a teacher tap (musicLoaded), since browsers block
  // autoplay before user interaction.
  useEffect(() => {
    if (!musicLoaded || !musicRef.current || !effectiveMusicPresetId) return;
    const preset = MUSIC_PRESETS.find(p => p.id === effectiveMusicPresetId);
    if (!preset) return;
    musicRef.current.src = `https://www.youtube-nocookie.com/embed/${preset.videoId}?autoplay=1&loop=1&playlist=${preset.videoId}&enablejsapi=1`;
    setMusicPlaying(true);
  }, [effectiveMusicPresetId, musicLoaded]);

  // Poll store transactions for music redemptions. Format: a store
  // item whose name starts with "🎵 Music · <Track Label>" — when
  // redeemed in the last 5 min, override the playlist for 25 min.
  // Keeps a "seen" set so each tx fires once per board session.
  const seenMusicTxRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!cls?.id) return;
    let cancelled = false;
    const tick = async () => {
      try {
        const tx: any[] = await api.getStoreClassTransactions(cls.id);
        if (cancelled || !Array.isArray(tx)) return;
        const fiveMinAgo = Date.now() - 5 * 60_000;
        for (const t of tx) {
          if (t.kind !== "redeem") continue;
          const name = String(t.item_name || "");
          const m = /^🎵 Music · (.+)$/.exec(name);
          if (!m) continue;
          if (seenMusicTxRef.current.has(t.id)) continue;
          const ts = new Date(t.created_at).getTime();
          if (ts < fiveMinAgo) { seenMusicTxRef.current.add(t.id); continue; }
          const trackLabel = m[1].trim();
          const preset = MUSIC_PRESETS.find(p => p.label.toLowerCase() === trackLabel.toLowerCase());
          if (!preset) { seenMusicTxRef.current.add(t.id); continue; }
          seenMusicTxRef.current.add(t.id);
          setActiveMusicOverride({ presetId: preset.id, until: Date.now() + 25 * 60_000 });
          // Surface a board overlay so the class sees who picked the track
          fireStarBoardEvent({
            kind: "completion",
            studentName: t.student_name || "Someone",
            detail: `🎵 picked ${preset.emoji} ${preset.label}`,
          });
        }
      } catch {}
    };
    tick();
    const iv = setInterval(tick, 20_000);
    return () => { cancelled = true; clearInterval(iv); };
  }, [cls?.id]);

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
      const picked = cs.find(c => c.id === classParam) || cs.find(c => String(c.name).toLowerCase() === classParam) || cs[0];
      setCls(picked);
      // Tell the STAR cross-device relay which class this device is in,
      // so saves on the iPad POST to the right relay AND this projector
      // tab knows which class id to poll for incoming events.
      if (picked?.id) setActiveClassId(picked.id);
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

  // ── Whole-class reward goal — sum of behavior_stars across the
  // class. Renders as a slim banner above the Ledger when target > 0,
  // and fires a one-time celebration when total ≥ target.
  const rewardTarget = Number(board.settings?.class_reward_target || 0);
  const rewardLabel = (board.settings?.class_reward_label || "").trim();
  const rewardEmoji = (board.settings?.class_reward_emoji || "🎉").trim();
  const rewardTotal = useMemo(
    () => board.students.reduce((sum, s) => sum + (Number((s as any).behavior_stars) || 0), 0),
    [board.students]
  );
  const rewardActive = rewardTarget > 0;
  const rewardPct = rewardActive ? Math.min(100, Math.round((rewardTotal / rewardTarget) * 100)) : 0;
  const rewardEarned = rewardActive && rewardTotal >= rewardTarget;

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
  // Background: deep near-black with subtle violet+pink radial accents
  // in opposite corners — matches the STAR /star page identity for
  // visual continuity across the whole product.
  const bg = `radial-gradient(1400px 900px at 0% 0%, rgba(168,85,247,0.20) 0%, transparent 55%), radial-gradient(1200px 800px at 100% 100%, rgba(236,72,153,0.18) 0%, transparent 55%), radial-gradient(900px 600px at 50% 0%, rgba(99,102,241,0.14) 0%, transparent 60%), radial-gradient(ellipse at center, #1a0f2e 0%, #0a0414 100%)`;
  const musicPreset = MUSIC_PRESETS.find(p => p.id === effectiveMusicPresetId);
  const blockAccent = SUBJECT_ACCENT[currentBlock?.subject || ""] || "#d97706";

  const g = (a: number) => `rgba(255,255,255,${a})`;
  // Serif for the masthead / hero moments, Inter for dense data.
  const serif = "'Fraunces', 'Playfair Display', Georgia, serif";
  const mono  = "'JetBrains Mono', 'SF Mono', ui-monospace, monospace";

  // Editorial section label: small-caps serif + tracking + a thin rule,
  // numbered. Accent number now violet (matches the STAR identity)
  // with a tiny dot bullet to reinforce the "section" feel.
  const SectionLabel: React.FC<{ n: string; title: string; kicker?: string; align?: "left" | "right" }> = ({ n, title, kicker, align = "left" }) => (
    <div style={{
      display: "flex", alignItems: "center", gap: 10,
      paddingBottom: 8, marginBottom: 10,
      borderBottom: `1px solid rgba(168,85,247,0.15)`,
      flexDirection: align === "right" ? "row-reverse" : "row",
    }}>
      <span style={{
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        width: 26, height: 22, borderRadius: 7,
        fontFamily: "'Inter', sans-serif",
        fontSize: 10, fontWeight: 900,
        background: "linear-gradient(135deg, #ec4899, #a855f7)",
        color: "white", letterSpacing: "0.04em",
        boxShadow: "0 0 12px rgba(168,85,247,0.45)",
      }}>{n}</span>
      <span style={{
        fontFamily: "'Inter', sans-serif",
        fontSize: 16, fontWeight: 800, letterSpacing: "-0.01em",
        background: "linear-gradient(135deg, #f5f1e8 0%, #c4b5fd 100%)",
        WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
        backgroundClip: "text",
      }}>{title}</span>
      {kicker && (
        <span style={{
          fontFamily: "'Inter', sans-serif", fontSize: 10, fontWeight: 700,
          color: "rgba(196,181,253,0.65)", letterSpacing: "0.16em",
          textTransform: "uppercase",
          marginLeft: align === "right" ? 0 : "auto", marginRight: align === "right" ? "auto" : 0,
        }}>{kicker}</span>
      )}
    </div>
  );

  const card = {
    background: "linear-gradient(180deg, rgba(168,85,247,0.06) 0%, rgba(99,102,241,0.03) 50%, rgba(15,15,28,0.20) 100%)",
    border: `1px solid rgba(168,85,247,0.18)`,
    borderRadius: 14,
    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.04), 0 4px 18px -8px rgba(0,0,0,0.5)",
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
      gridTemplateRows: rewardActive ? "72px 156px 1fr 52px 56px" : "72px 156px 1fr 56px",
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

      {/* Top-edge violet/pink gradient strip — structural masthead mark */}
      {!bgUrl && (
        <div style={{
          position: "absolute", top: 0, left: 0, right: 0, height: 3,
          background: "linear-gradient(90deg, #ec4899 0%, #a855f7 35%, #6366f1 65%, transparent 100%)",
          pointerEvents: "none", zIndex: 2,
          boxShadow: "0 0 24px rgba(168,85,247,0.45)",
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
            fontFamily: "'Inter', sans-serif",
            fontSize: 10, fontWeight: 800,
            letterSpacing: "0.22em", textTransform: "uppercase",
            color: "rgba(196,181,253,0.65)",
            whiteSpace: "nowrap",
          }}>
            Class Progress
          </div>

          {/* Violet/pink rail with bright fill */}
          <div style={{
            flex: 1,
            height: 4,
            background: "rgba(168,85,247,0.10)",
            borderRadius: 999,
            overflow: "hidden",
            position: "relative",
            border: "1px solid rgba(168,85,247,0.18)",
          }}>
            <div style={{
              position: "absolute",
              top: 0, left: 0, height: "100%",
              width: `${classProgress.pct}%`,
              background: classProgress.pct >= 100
                ? "linear-gradient(90deg, #6366f1 0%, #a855f7 50%, #ec4899 100%)"
                : "linear-gradient(90deg, #6366f1 0%, #a855f7 100%)",
              borderRadius: 999,
              transition: "width .8s cubic-bezier(0.22,1,0.36,1)",
              boxShadow: classProgress.pct >= 100
                ? "0 0 14px rgba(236,72,153,0.55)"
                : "0 0 12px rgba(168,85,247,0.45)",
            }} />
          </div>

          <div style={{
            fontFamily: "'Inter', sans-serif",
            fontSize: 13, fontWeight: 800,
            color: classProgress.pct >= 100 ? "#f9a8d4" : "#c4b5fd",
            whiteSpace: "nowrap",
            fontVariantNumeric: "tabular-nums",
          }}>
            {(classProgress.totalDone ?? 0)}/{(classProgress.totalAssigned ?? 0)} · {classProgress.pct}%
          </div>

          {classProgress.recent[0] && (
            <div style={{
              fontFamily: "'Inter', sans-serif",
              fontSize: 11, fontWeight: 600, color: "rgba(196,181,253,0.55)",
              whiteSpace: "nowrap",
              overflow: "hidden", textOverflow: "ellipsis",
              maxWidth: 280,
            }}>
              · just turned in: {(classProgress.recent[0].name || "?").split(" ")[0]} — {classProgress.recent[0].title}
            </div>
          )}
          {helperOfDay && helperOfDay.count > 0 && (
            <div style={{
              fontFamily: "'Inter', sans-serif",
              fontSize: 10, fontWeight: 800,
              color: "#fce7f3",
              whiteSpace: "nowrap",
              padding: "3px 10px",
              borderRadius: 999,
              background: "linear-gradient(135deg, rgba(236,72,153,0.25), rgba(168,85,247,0.12))",
              border: "1px solid rgba(236,72,153,0.40)",
              letterSpacing: "0.06em", textTransform: "uppercase",
              boxShadow: "0 0 10px rgba(236,72,153,0.20)",
            }}>
              ★ helper of day: {helperOfDay.name.split(" ")[0]} ({helperOfDay.count})
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
            background: "linear-gradient(180deg, rgba(26,15,46,0.94) 0%, rgba(10,4,20,0.94) 100%)",
            border: timerHitZero
              ? "1px solid rgba(34,197,94,0.55)"
              : timerExpiringSoon
                ? "1px solid rgba(239,68,68,0.65)"
                : "1px solid rgba(168,85,247,0.45)",
            borderRadius: 16,
            padding: "10px 26px 12px",
            pointerEvents: "none",
            boxShadow: timerExpiringSoon
              ? "0 0 32px rgba(239,68,68,0.55), inset 0 1px 0 rgba(255,255,255,0.08)"
              : "0 0 28px rgba(168,85,247,0.40), inset 0 1px 0 rgba(255,255,255,0.08)",
            animation: timerExpiringSoon ? "helpPulse 1s ease-in-out infinite" : undefined,
          }}
        >
          {timer?.label && (
            <div style={{
              fontFamily: "'Inter', sans-serif",
              fontSize: 10, fontWeight: 800,
              letterSpacing: "0.22em", textTransform: "uppercase",
              color: "rgba(196,181,253,0.75)", marginBottom: 3,
            }}>
              {timer.label}
            </div>
          )}
          <div style={{
            fontFamily: mono, fontSize: 60, fontWeight: 800,
            letterSpacing: "-0.025em", lineHeight: 1,
            color: timerHitZero ? "#86efac" : timerExpiringSoon ? "#fecaca" : "#fce7f3",
            fontVariantNumeric: "tabular-nums",
            textShadow: timerExpiringSoon
              ? "0 0 18px rgba(252,165,165,0.55)"
              : "0 0 18px rgba(252,231,243,0.40)",
          }}>
            {timerHitZero ? "Time!" : fmtTime(timerRemainingMs)}
          </div>
          {timer?.state === "paused" && (
            <div style={{
              fontFamily: "'Inter', sans-serif",
              fontSize: 10, fontWeight: 800,
              color: "rgba(196,181,253,0.6)",
              marginTop: 3, letterSpacing: "0.18em", textTransform: "uppercase",
            }}>
              ⏸ Paused
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
            background: "linear-gradient(135deg, rgba(168,85,247,0.18), rgba(99,102,241,0.10))",
            border: `1px solid rgba(168,85,247,0.35)`,
            color: "#fce7f3",
            fontSize: 18,
            cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center",
            touchAction: "manipulation",
            boxShadow: "0 0 12px rgba(168,85,247,0.25)",
          }}
        >
          ⏱
        </button>
      )}

      {isTeacher && timerControlsOpen && (
        <div
          role="dialog"
          aria-label="Class timer controls"
          style={{
            position: "absolute",
            top: 56, left: 14,
            zIndex: 50,
            background: "radial-gradient(400px 300px at 0% 0%, rgba(168,85,247,0.18) 0%, transparent 60%), linear-gradient(180deg, #1a0f2e 0%, #0a0414 100%)",
            border: "1px solid rgba(168,85,247,0.40)",
            borderRadius: 16,
            padding: "16px 18px",
            color: "#fce7f3",
            minWidth: 300,
            boxShadow: "0 24px 48px -12px rgba(168,85,247,0.45), inset 0 1px 0 rgba(255,255,255,0.06)",
          }}
        >
          <div style={{
            display: "inline-flex", alignItems: "center", gap: 7,
            padding: "4px 12px", borderRadius: 999,
            background: "linear-gradient(135deg, rgba(168,85,247,0.20), rgba(236,72,153,0.10))",
            border: "1px solid rgba(168,85,247,0.30)",
            fontSize: 10, fontWeight: 800, letterSpacing: "0.28em", textTransform: "uppercase",
            color: "#f9a8d4",
            marginBottom: 10,
          }}>
            ⏱ Class Timer
          </div>
          {/* Minutes setter */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
            <button
              onClick={() => setTimerMinutes((m) => Math.max(1, m - 5))}
              aria-label="Decrease 5 minutes"
              style={{
                width: 40, height: 40, borderRadius: 10,
                background: "linear-gradient(135deg, rgba(168,85,247,0.15), rgba(99,102,241,0.05))",
                border: "1px solid rgba(168,85,247,0.30)",
                color: "#fce7f3", fontSize: 20, fontWeight: 800, cursor: "pointer",
                touchAction: "manipulation",
              }}
            >−</button>
            <div style={{
              flex: 1, textAlign: "center",
              fontFamily: mono, fontSize: 26, fontWeight: 800,
              color: "#fce7f3", fontVariantNumeric: "tabular-nums",
              letterSpacing: "-0.02em",
            }}>
              {timerMinutes} <span style={{ fontSize: 13, color: "rgba(196,181,253,0.65)", fontWeight: 700 }}>min</span>
            </div>
            <button
              onClick={() => setTimerMinutes((m) => Math.min(120, m + 5))}
              aria-label="Increase 5 minutes"
              style={{
                width: 40, height: 40, borderRadius: 10,
                background: "linear-gradient(135deg, rgba(168,85,247,0.15), rgba(99,102,241,0.05))",
                border: "1px solid rgba(168,85,247,0.30)",
                color: "#fce7f3", fontSize: 20, fontWeight: 800, cursor: "pointer",
                touchAction: "manipulation",
              }}
            >+</button>
          </div>
          {/* Quick presets */}
          <div style={{ display: "flex", gap: 5, marginBottom: 14, flexWrap: "wrap" }}>
            {[5, 10, 15, 20, 30, 45, 60].map((m) => {
              const active = timerMinutes === m;
              return (
                <button
                  key={m}
                  onClick={() => setTimerMinutes(m)}
                  style={{
                    padding: "5px 12px", borderRadius: 999,
                    background: active
                      ? "linear-gradient(135deg, #ec4899, #a855f7)"
                      : "rgba(168,85,247,0.06)",
                    border: active
                      ? "1px solid rgba(236,72,153,0.55)"
                      : "1px solid rgba(168,85,247,0.20)",
                    color: active ? "white" : "rgba(196,181,253,0.75)",
                    fontSize: 12, fontWeight: 800, cursor: "pointer",
                    fontFamily: "'Inter', sans-serif",
                    letterSpacing: "0.02em",
                    boxShadow: active ? "0 0 12px rgba(236,72,153,0.40)" : "none",
                    touchAction: "manipulation",
                  }}
                >{m}</button>
              );
            })}
          </div>
          {/* Action buttons */}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {timer?.state !== "running" && (
              <button
                onClick={() => sendTimer(timer?.state === "paused" ? "resume" : "start")}
                style={{
                  flex: 1, padding: "11px 14px", borderRadius: 10,
                  background: "linear-gradient(135deg, #6366f1 0%, #a855f7 50%, #ec4899 100%)",
                  color: "white", border: "none",
                  fontWeight: 900, fontSize: 14, cursor: "pointer",
                  letterSpacing: "-0.005em",
                  boxShadow: "0 8px 22px -6px rgba(168,85,247,0.55)",
                  touchAction: "manipulation",
                }}
              >
                ▶ {timer?.state === "paused" ? "Resume" : "Start"}
              </button>
            )}
            {timer?.state === "running" && (
              <button
                onClick={() => sendTimer("pause")}
                style={{
                  flex: 1, padding: "11px 14px", borderRadius: 10,
                  background: "linear-gradient(135deg, #ec4899, #f97316)",
                  color: "white", border: "none",
                  fontWeight: 900, fontSize: 14, cursor: "pointer",
                  boxShadow: "0 8px 22px -6px rgba(236,72,153,0.55)",
                  touchAction: "manipulation",
                }}
              >
                ⏸ Pause
              </button>
            )}
            <button
              onClick={() => sendTimer("reset")}
              style={{
                flex: 1, padding: "11px 14px", borderRadius: 10,
                background: "rgba(168,85,247,0.06)",
                border: "1px solid rgba(168,85,247,0.30)",
                color: "#fce7f3",
                fontWeight: 800, fontSize: 14, cursor: "pointer",
                touchAction: "manipulation",
              }}
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
        borderBottom: `1px solid rgba(168,85,247,0.20)`, paddingBottom: 8,
      }}>
        {/* Left: class identity */}
        <div style={{ display: "flex", alignItems: "baseline", gap: 14 }}>
          <h1 style={{
            fontFamily: "'Inter', system-ui, sans-serif",
            fontSize: 46, fontWeight: 900,
            letterSpacing: "-0.035em", margin: 0,
            background: "linear-gradient(135deg, #f5f1e8 0%, #c4b5fd 40%, #f9a8d4 100%)",
            WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
            backgroundClip: "text",
            lineHeight: 1,
            textShadow: "none",
          }}>{cls.name}</h1>
          <span style={{
            fontFamily: "'Inter', sans-serif",
            fontSize: 12, fontWeight: 700,
            color: "rgba(196,181,253,0.65)", letterSpacing: "0.18em",
            textTransform: "uppercase",
            padding: "4px 10px", borderRadius: 999,
            background: "rgba(168,85,247,0.10)",
            border: "1px solid rgba(168,85,247,0.20)",
          }}>{dateStr}</span>
        </div>

        {/* Center: Day letter medallion — circular violet badge with conic ring */}
        <div style={{
          display: "flex", alignItems: "center", gap: 12,
          padding: "0 18px",
        }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 1, textAlign: "right" }}>
            <span style={{
              fontFamily: "'Inter', sans-serif",
              fontSize: 9, fontWeight: 800,
              color: "rgba(196,181,253,0.85)",
              letterSpacing: "0.28em", textTransform: "uppercase",
            }}>Cycle</span>
            <span style={{
              fontFamily: "'Inter', sans-serif",
              fontSize: 9, fontWeight: 800,
              color: "rgba(245,241,232,0.45)",
              letterSpacing: "0.28em", textTransform: "uppercase",
            }}>Day</span>
          </div>
          <div style={{ position: "relative", width: 64, height: 64 }}>
            <div style={{
              position: "absolute", inset: -2, borderRadius: "50%",
              background: "conic-gradient(from 0deg, #ec4899, #a855f7, #6366f1, #ec4899)",
              animation: "starGlow 6s linear infinite",
              opacity: 0.85,
            }} />
            <div style={{
              position: "absolute", inset: 0, borderRadius: "50%",
              background: "linear-gradient(135deg, #1a0f2e 0%, #0f0a1f 100%)",
              display: "flex", alignItems: "center", justifyContent: "center",
              boxShadow: "inset 0 2px 0 rgba(255,255,255,0.08), 0 0 24px rgba(168,85,247,0.35)",
            }}>
              <span style={{
                fontFamily: "'Inter', sans-serif",
                fontSize: 38, fontWeight: 900, lineHeight: 1,
                background: "linear-gradient(135deg, #f9a8d4 0%, #c4b5fd 100%)",
                WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
                backgroundClip: "text",
                letterSpacing: "-0.04em",
              }}>{dayLetter}</span>
            </div>
          </div>
        </div>

        {/* Right: time + controls */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 10 }}>
          {musicPreset && (
            <button onClick={toggleMusic} style={{
              display: "flex", alignItems: "center", gap: 7, padding: "6px 12px",
              borderRadius: 999,
              border: musicPlaying
                ? "1px solid rgba(168,85,247,0.45)"
                : "1px solid rgba(168,85,247,0.20)",
              background: musicPlaying
                ? "linear-gradient(135deg, rgba(168,85,247,0.20), rgba(99,102,241,0.10))"
                : "rgba(168,85,247,0.04)",
              color: "#f5f1e8", cursor: "pointer",
              fontSize: 12, fontWeight: 700, letterSpacing: "0.02em",
              fontFamily: "'Inter', sans-serif",
              boxShadow: musicPlaying ? "0 0 12px rgba(168,85,247,0.25)" : undefined,
            }}>
              <span>{musicPreset.emoji}</span>
              <span>{musicPreset.label}</span>
              <span style={{ fontSize: 11, opacity: 0.85 }}>{musicPlaying ? "❙❙" : "▸"}</span>
            </button>
          )}
          <div style={{
            fontFamily: mono, fontSize: 38, fontWeight: 700,
            fontVariantNumeric: "tabular-nums", letterSpacing: "-0.025em",
            background: "linear-gradient(135deg, #f5f1e8 0%, #c4b5fd 100%)",
            WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
            backgroundClip: "text",
          }}>{timeStr}</div>
          {isTeacher && (
            <>
              {/* Morning slide — opens the full-screen instructions
                  overlay. Teacher toggles whenever class needs the
                  routine on the board. */}
              {/* Teacher icon row — compact 28×28 squares with hover
                  tooltips. Keeps the header lean even with 6 actions. */}
              <ToolIcon emoji="🌅" title="Morning slide — class instructions" tint="rgba(217,119,6,0.65)" onClick={() => setShowMorningSlide(true)} />
              <ToolIcon emoji="💼" title="Wallet — students unlock with PIN"   tint="rgba(124,58,237,0.65)" onClick={() => setShowWallet(true)} />
              <ToolIcon emoji="🔒" title="Tools — teacher console (PIN)"        tint={`${blockAccent}aa`} onClick={() => { setConsolePin(""); setConsolePinError(""); setConsolePinModal(true); }} />
              <ToolIcon emoji="⭐" title="STAR — gradebook + completion"        tint="rgba(251,191,36,0.65)" onClick={() => { toggleStarPanel(); }} />
              <ToolIcon emoji="🎲" title="Random pick — fair caller spinner"    tint="rgba(99,102,241,0.65)" onClick={() => fireRandomPicker()} />
              <ToolIcon emoji="👀" title="EYES ON ME — projector takeover"      tint="rgba(239,68,68,0.65)"  onClick={() => fireEyesOnMe()} />
            </>
          )}
          <button onClick={toggleFullscreen} style={{
            padding: "6px 10px", borderRadius: 8, border: `1px solid rgba(168,85,247,0.20)`,
            background: "rgba(168,85,247,0.04)", color: "#c4b5fd", cursor: "pointer",
            fontSize: 12, fontWeight: 700,
          }}>{isFullscreen ? "✕" : "⛶"}</button>
        </div>
      </header>

      {/* ── ROW 2: Right Now — the editorial "lead story" ── */}
      <section style={{
        position: "relative", zIndex: 1,
        borderRadius: 18,
        background: `
          radial-gradient(circle at 0% 0%, rgba(236,72,153,0.18) 0%, transparent 45%),
          radial-gradient(circle at 100% 100%, rgba(99,102,241,0.18) 0%, transparent 50%),
          linear-gradient(135deg, ${blockAccent}1f 0%, rgba(168,85,247,0.10) 45%, rgba(15,15,28,0.40) 100%)
        `,
        border: `1px solid rgba(168,85,247,0.30)`,
        boxShadow: `0 0 0 1px ${blockAccent}22 inset, 0 12px 40px -16px rgba(168,85,247,0.45), inset 0 1px 0 rgba(255,255,255,0.06)`,
        display: "flex", alignItems: "center", padding: "0 24px", gap: 20,
        overflow: "hidden",
      }}>
        {/* Decorative gradient bar on the left edge */}
        <div style={{
          position: "absolute", left: 0, top: 14, bottom: 14, width: 4,
          borderRadius: 999,
          background: "linear-gradient(180deg, #ec4899 0%, #a855f7 50%, #6366f1 100%)",
          boxShadow: "0 0 16px rgba(168,85,247,0.6)",
        }} />
        {/* Bottom-right glow accent */}
        <div style={{
          position: "absolute", right: -60, bottom: -60,
          width: 220, height: 220, borderRadius: "50%",
          background: "radial-gradient(circle, rgba(236,72,153,0.18) 0%, transparent 65%)",
          pointerEvents: "none",
        }} />
        <div style={{ flex: 1, minWidth: 0, position: "relative", zIndex: 1 }}>
          <div style={{
            fontFamily: "'Inter', sans-serif",
            fontSize: 11, fontWeight: 800,
            color: "#f9a8d4",
            textTransform: "uppercase", letterSpacing: "0.32em", marginBottom: 6,
            display: "inline-flex", alignItems: "center", gap: 8,
          }}>
            <span style={{
              display: "inline-block", width: 6, height: 6, borderRadius: "50%",
              background: "#ec4899", boxShadow: "0 0 10px rgba(236,72,153,0.85)",
              animation: "presPulse 2s ease-in-out infinite",
            }} />
            Right Now
          </div>
          {currentBlock ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 16, flexWrap: "wrap" }}>
                <span style={{
                  fontFamily: "'Inter', system-ui, sans-serif",
                  fontSize: 60, fontWeight: 900,
                  letterSpacing: "-0.035em", lineHeight: 1,
                  background: "linear-gradient(135deg, #f5f1e8 0%, #f9a8d4 100%)",
                  WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
                  backgroundClip: "text",
                }}>{currentBlock.label || currentBlock.subject}</span>
                <span style={{
                  fontFamily: mono, fontSize: 18, fontWeight: 700,
                  color: "#c4b5fd",
                  fontVariantNumeric: "tabular-nums",
                  padding: "4px 12px", borderRadius: 999,
                  background: "rgba(168,85,247,0.12)",
                  border: "1px solid rgba(168,85,247,0.28)",
                }}>{currentBlock.start_time}–{currentBlock.end_time}</span>
                {currentBlock.is_break && (
                  <span style={{
                    fontFamily: "'Inter', sans-serif",
                    fontSize: 13, fontWeight: 800,
                    padding: "4px 12px", borderRadius: 999,
                    background: "linear-gradient(135deg, rgba(34,197,94,0.25), rgba(125,211,197,0.15))",
                    color: "#86efac",
                    border: "1px solid rgba(34,197,94,0.45)",
                    letterSpacing: "0.10em", textTransform: "uppercase",
                  }}>☕ Break</span>
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
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <span style={{
                      fontFamily: "'Inter', sans-serif", fontSize: 10, fontWeight: 800,
                      color: "rgba(196,181,253,0.65)", letterSpacing: "0.22em",
                      textTransform: "uppercase",
                    }}>Up Next</span>
                    {upcoming.map((b, i) => (
                      <span key={i} style={{
                        display: "inline-flex", alignItems: "center", gap: 7,
                        padding: "4px 12px", borderRadius: 999,
                        background: "linear-gradient(135deg, rgba(99,102,241,0.18), rgba(168,85,247,0.08))",
                        border: `1px solid rgba(168,85,247,0.25)`,
                      }}>
                        <span style={{
                          fontFamily: mono, fontSize: 11, fontWeight: 700,
                          color: "#c4b5fd",
                          fontVariantNumeric: "tabular-nums",
                        }}>{b.start_time}</span>
                        <span style={{
                          fontFamily: "'Inter', sans-serif", fontSize: 13, fontWeight: 700,
                          color: "#f5f1e8", letterSpacing: "-0.005em",
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
            position: "relative", zIndex: 1,
            display: "flex", flexDirection: "column", alignItems: "center",
            padding: "8px 22px", borderRadius: 14,
            background: countdown.urgent
              ? "linear-gradient(135deg, rgba(239,68,68,0.30), rgba(236,72,153,0.18))"
              : "linear-gradient(135deg, rgba(168,85,247,0.18), rgba(99,102,241,0.10))",
            border: countdown.urgent
              ? "1px solid rgba(239,68,68,0.55)"
              : "1px solid rgba(168,85,247,0.35)",
            boxShadow: countdown.urgent
              ? "0 0 24px rgba(239,68,68,0.35)"
              : "0 0 18px rgba(168,85,247,0.25)",
            animation: countdown.urgent ? "tickPulse 1s ease-in-out infinite" : undefined,
          }}>
            <div style={{
              fontFamily: "'Inter', sans-serif", fontSize: 9, fontWeight: 800,
              color: countdown.urgent ? "#fca5a5" : "#c4b5fd",
              textTransform: "uppercase", letterSpacing: "0.28em",
              marginBottom: 2,
            }}>Ends In</div>
            <div style={{
              fontFamily: mono, fontSize: 34, fontWeight: 800,
              color: countdown.urgent ? "#fecaca" : "#fce7f3",
              fontVariantNumeric: "tabular-nums",
              letterSpacing: "-0.02em",
              textShadow: countdown.urgent
                ? "0 0 14px rgba(252,165,165,0.55)"
                : "0 0 14px rgba(252,231,243,0.35)",
            }}>{countdown.str}</div>
          </div>
        )}
        {board.settings?.specialist_name && (
          <div style={{
            position: "relative", zIndex: 1,
            padding: "8px 16px", borderRadius: 14,
            background: "linear-gradient(135deg, rgba(236,72,153,0.18), rgba(168,85,247,0.10))",
            border: "1px solid rgba(236,72,153,0.40)",
            textAlign: "left",
            boxShadow: "0 0 18px rgba(236,72,153,0.20)",
          }}>
            <div style={{
              fontFamily: "'Inter', sans-serif", fontSize: 9, fontWeight: 800,
              color: "#f9a8d4",
              textTransform: "uppercase", letterSpacing: "0.22em",
            }}>11 O'Clock Specialist</div>
            <div style={{
              fontFamily: "'Inter', sans-serif",
              fontSize: 17, fontWeight: 800,
              color: "#fce7f3", letterSpacing: "-0.015em",
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
            // Per-board-student grade lookup. PURELY from /star → Settings →
            // Students.grade — no auto-derive guesses (those were unreliable
            // because the same kid often has tracker entries at multiple
            // grade levels). To set a kid's grade: open /star, hit Settings,
            // type the grade level (e.g. "2nd") and Save.
            const starGradeById: Record<string, string> = {};
            const starStudents = StarStore.getStudents();
            const starById = new Map(starStudents.map((s) => [s.id, s]));
            const starByFirstName = new Map<string, typeof starStudents[number]>();
            for (const ss of starStudents) {
              const fn = (ss.firstName || "").trim().toLowerCase();
              if (fn && ss.grade) starByFirstName.set(fn, ss);
            }
            for (const bs of board.students) {
              const sid = String(bs.id);
              const direct = starById.get(sid);
              if (direct?.grade) { starGradeById[sid] = direct.grade; continue; }
              const firstName = String(bs.name || "").trim().split(/\s+/)[0]?.toLowerCase();
              const byName = firstName ? starByFirstName.get(firstName) : undefined;
              if (byName?.grade) starGradeById[sid] = byName.grade;
            }
            const starProgressById = computeStarProgressByStudent(board.students);
            // Active passes — map each board student id to their current
            // pass (if any) so the roster card can render a live timer
            // ribbon and pulse red after 5 minutes.
            const passByStudentId: Record<string, ActivePass> = {};
            (() => {
              const passes = StarStore.getActivePasses();
              const idByFirstName = new Map<string, string>();
              const idByFullName  = new Map<string, string>();
              for (const bs of board.students) {
                const sid = String(bs.id);
                const full = String(bs.name || "").trim().toLowerCase();
                if (full) idByFullName.set(full, sid);
                const first = full.split(/\s+/)[0];
                if (first) idByFirstName.set(first, sid);
              }
              for (const p of passes) {
                let sid: string | null = null;
                if (board.students.some((b) => String(b.id) === p.studentId)) sid = p.studentId;
                else if (p.studentName) {
                  const lower = String(p.studentName).trim().toLowerCase();
                  sid = idByFullName.get(lower) || idByFirstName.get(lower.split(/\s+/)[0]) || null;
                }
                if (sid) passByStudentId[sid] = p;
              }
            })();
            // Active free time / movement (specials, lunch) / supply
            // checkouts — collected per-student so the roster card can
            // surface a status pill at a glance.
            interface CardStatus {
              kind: "freetime" | "movement-specials" | "movement-lunch" | "supply";
              label: string;
              icon: string;
              tone: "violet" | "indigo" | "pink" | "amber" | "green";
              startedAt: string;
            }
            const statusByStudentId: Record<string, CardStatus[]> = {};
            (() => {
              const idByFirstName = new Map<string, string>();
              const idByFullName  = new Map<string, string>();
              for (const bs of board.students) {
                const sid = String(bs.id);
                // Same normalization as the resolve fn — strip punctuation,
                // collapse whitespace, lowercase. So "Aiden Smith" matches
                // "aiden smith" matches "Aiden  Smith." matches "AIDEN".
                const norm = String(bs.name || "").trim().toLowerCase().replace(/[^\w\s]/g, "").replace(/\s+/g, " ");
                if (norm) idByFullName.set(norm, sid);
                const first = norm.split(/\s+/)[0];
                if (first) idByFirstName.set(first, sid);
              }
              const resolve = (sid: string | undefined, sname: string | undefined): string | null => {
                if (sid && board.students.some((b) => String(b.id) === sid)) return sid;
                if (sname) {
                  const norm = sname.trim().toLowerCase().replace(/[^\w\s]/g, "").replace(/\s+/g, " ");
                  if (idByFullName.get(norm)) return idByFullName.get(norm)!;
                  const first = norm.split(/\s+/)[0];
                  if (first && idByFirstName.get(first)) return idByFirstName.get(first)!;
                }
                // Last resort: cross-reference STAR's own roster — the iPad
                // might be sending a STAR-local id that doesn't match the
                // board's API id, but the names should line up.
                if (sid) {
                  try {
                    const starStudent = StarStore.getStudents().find((x) => x.id === sid);
                    if (starStudent) {
                      const fname = (starStudent.firstName || "").trim().toLowerCase();
                      if (fname && idByFirstName.get(fname)) return idByFirstName.get(fname)!;
                    }
                  } catch {}
                }
                return null;
              };
              const push = (sid: string, status: CardStatus) => {
                (statusByStudentId[sid] ||= []).push(status);
              };
              try {
                for (const f of StarStore.getActiveFreetime()) {
                  const sid = resolve(f.studentId, f.studentName);
                  if (sid) push(sid, { kind: "freetime", icon: "🎮", label: `Free ${f.durationMin}m`, tone: "pink", startedAt: f.startedAt });
                }
              } catch {}
              try {
                for (const m of StarStore.getActiveMovement()) {
                  const sid = resolve(m.studentId, m.studentName);
                  if (sid) push(sid, {
                    kind: m.kind === "specials" ? "movement-specials" : "movement-lunch",
                    icon: m.kind === "specials" ? "🎨" : "🍱",
                    label: m.kind === "specials" ? "Specials" : "Lunch",
                    tone: m.kind === "specials" ? "violet" : "amber",
                    startedAt: m.startedAt,
                  });
                }
              } catch {}
              try {
                for (const c of StarStore.getSupplyCheckouts()) {
                  const sid = resolve(c.studentId, c.studentName);
                  if (sid) push(sid, {
                    kind: "supply",
                    icon: c.supplyKind === "Pencil" ? "✏️" : c.supplyKind === "Tablet" ? "📱" : c.supplyKind === "Headphones" ? "🎧" : "📚",
                    label: c.supplyKind === "Book" && c.bookTitle ? c.bookTitle.slice(0, 18) : c.supplyKind,
                    tone: "green",
                    startedAt: c.checkedOutAt,
                  });
                }
              } catch {}
            })();
            const TONE_BG: Record<string, { bg: string; border: string; color: string }> = {
              violet: { bg: "rgba(168,85,247,0.20)", border: "rgba(168,85,247,0.55)", color: "#e9d5ff" },
              indigo: { bg: "rgba(99,102,241,0.20)", border: "rgba(99,102,241,0.55)", color: "#c4b5fd" },
              pink:   { bg: "rgba(236,72,153,0.20)", border: "rgba(236,72,153,0.55)", color: "#fce7f3" },
              amber:  { bg: "rgba(245,158,11,0.22)", border: "rgba(245,158,11,0.55)", color: "#fde68a" },
              green:  { bg: "rgba(16,185,129,0.20)", border: "rgba(16,185,129,0.55)", color: "#bbf7d0" },
            };
            // Per-student overall letter grade — average percentage across
            // every STAR submission credited to this kid. Same name+id
            // matching pattern as the progress bar so CSV imports + new
            // entries both contribute. Hidden when no submissions exist.
            const starLetterById: Record<string, { letter: string; pct: number }> = {};
            (() => {
              const tracker = StarStore.getAsnTrack();
              const idByFirstName = new Map<string, string>();
              const idByFullName  = new Map<string, string>();
              for (const bs of board.students) {
                const sid = String(bs.id);
                const full = String(bs.name || "").trim().toLowerCase();
                if (full) idByFullName.set(full, sid);
                const first = full.split(/\s+/)[0];
                if (first) idByFirstName.set(first, sid);
              }
              const totalsBySid: Record<string, { sum: number; n: number }> = {};
              for (const t of Object.values(tracker)) {
                const subs = t.submissions || [];
                if (subs.length === 0) continue;
                for (const sub of subs) {
                  // Skip non-counting statuses (absent / skipped / excused
                  // / makeup) so they don't drag the average down.
                  if (!countsTowardGrade(sub)) continue;
                  // Resolve which board student this submission is for.
                  let sid: string | null = null;
                  if (board.students.some((b) => String(b.id) === sub.studentId)) sid = sub.studentId;
                  else if (sub.studentName) {
                    const sn = String(sub.studentName).trim().toLowerCase();
                    sid = idByFullName.get(sn) || idByFirstName.get(sn.split(/\s+/)[0]) || null;
                  } else if (t.studentName) {
                    const tn = String(t.studentName).trim().toLowerCase();
                    sid = idByFullName.get(tn) || idByFirstName.get(tn.split(/\s+/)[0]) || null;
                  }
                  if (!sid) continue;
                  const cur = totalsBySid[sid] || { sum: 0, n: 0 };
                  cur.sum += sub.pct || 0;
                  cur.n += 1;
                  totalsBySid[sid] = cur;
                }
              }
              for (const sid in totalsBySid) {
                const { sum, n } = totalsBySid[sid];
                const pct = Math.round(sum / n);
                const letter = pct >= 90 ? "A" : pct >= 80 ? "B" : pct >= 70 ? "C" : pct >= 60 ? "D" : "F";
                starLetterById[sid] = { letter, pct };
              }
            })();
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
              // Birthday check — Pacific MM-DD vs stored YYYY-MM-DD or MM-DD.
              const bday = birthdaysByStudent[s.id];
              const todayMD = (() => {
                const d = new Date(Date.now() - 7 * 3600_000);
                return `${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
              })();
              const isBirthday = !!bday && bday.slice(-5) === todayMD;
              return (
                <div key={s.id} data-student-id={s.id} className="star-roster-card" style={{
                  borderRadius: 14, display: "flex", flexDirection: "column",
                  alignItems: "stretch", textAlign: "center",
                  background: isFull
                    ? "linear-gradient(155deg, rgba(236,72,153,0.22) 0%, rgba(168,85,247,0.16) 50%, rgba(99,102,241,0.10) 100%)"
                    : "linear-gradient(155deg, rgba(168,85,247,0.07) 0%, rgba(99,102,241,0.04) 60%, rgba(15,15,28,0.20) 100%)",
                  border: isFull
                    ? "1px solid rgba(236,72,153,0.55)"
                    : `1px solid rgba(168,85,247,0.18)`,
                  boxShadow: isFull
                    ? "0 0 0 1px rgba(236,72,153,0.25), 0 12px 32px -10px rgba(168,85,247,0.55)"
                    : "0 4px 18px -8px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.04)",
                  animation: isFull
                    ? `fullCard 3.5s ease-in-out infinite, fadeUp .5s ease ${idx * 0.04}s both`
                    : `fadeUp .5s ease ${idx * 0.04}s both`,
                  overflow: "hidden",
                  position: "relative",
                }}>
                  {/* Top accent strip: full-width gradient bar — replaces the
                      old skinny left spine. Much more visible at a distance. */}
                  <div style={{
                    position: "absolute", left: 0, right: 0, top: 0, height: 3,
                    background: isFull
                      ? "linear-gradient(90deg, #ec4899 0%, #a855f7 50%, #6366f1 100%)"
                      : `linear-gradient(90deg, transparent 0%, ${lc.color} 50%, transparent 100%)`,
                    opacity: isFull ? 1 : 0.7,
                  }} />

                  {/* Soft violet glow in the bottom-right corner — adds depth
                      without competing with content */}
                  {!isFull && (
                    <div style={{
                      position: "absolute", right: -30, bottom: -30,
                      width: 90, height: 90, borderRadius: "50%",
                      background: "radial-gradient(circle, rgba(168,85,247,0.18) 0%, transparent 70%)",
                      pointerEvents: "none",
                    }} />
                  )}

                  {/* Level chip — solid pill, top-right, easy to scan */}
                  <div style={{
                    position: "absolute", top: 8, right: 8,
                    padding: "2px 7px", borderRadius: 999,
                    background: isFull
                      ? "linear-gradient(135deg, #ec4899, #a855f7)"
                      : `linear-gradient(135deg, ${lc.color}cc, ${lc.color}66)`,
                    fontFamily: "'Inter', sans-serif",
                    fontSize: 9, fontWeight: 800, color: "white",
                    letterSpacing: "0.10em", textTransform: "uppercase",
                    boxShadow: isFull
                      ? "0 0 10px rgba(236,72,153,0.55)"
                      : `0 0 6px ${lc.color}55`,
                    zIndex: 2,
                  }}>L{lv}</div>

                  {/* Presence dot — green = online, gray = offline. Sits top-left
                      so teacher can scan the room at a glance. */}
                  {(() => {
                    const pres = presenceByStudent[s.id];
                    const online = pres?.isOnline;
                    return (
                      <div
                        title={online ? `Working — ${pres?.activity || "active"}` : "Offline"}
                        style={{
                          position: "absolute", top: 9, left: 9,
                          width: 10, height: 10, borderRadius: "50%",
                          background: online ? "#22c55e" : "rgba(255,255,255,0.14)",
                          boxShadow: online
                            ? "0 0 0 2px rgba(34,197,94,0.18), 0 0 10px rgba(34,197,94,0.7)"
                            : "0 0 0 2px rgba(255,255,255,0.04)",
                          animation: online ? "presPulse 2.4s ease-in-out infinite" : undefined,
                          zIndex: 2,
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

                  {/* Active pass — full-card overlay when this student is
                      currently out on a bathroom / water / sensory break.
                      Shows the live elapsed time and pulses red after 5
                      minutes so the room sees who's been gone too long. */}
                  {passByStudentId[String(s.id)] && (() => {
                    const p = passByStudentId[String(s.id)];
                    const startedMs = new Date(p.startedAt).getTime();
                    const elapsedSec = Math.max(0, Math.round((timerNow - startedMs) / 1000));
                    const over = elapsedSec > 5 * 60;
                    const icon = p.passKind === "Bathroom" ? "🚻" : p.passKind === "Water" ? "💧" : "🛋";
                    const fmt = `${Math.floor(elapsedSec / 60)}:${String(elapsedSec % 60).padStart(2, "0")}`;
                    return (
                      <div style={{
                        position: "absolute", inset: 0, zIndex: 4,
                        pointerEvents: "none",
                        background: over
                          ? "linear-gradient(135deg, rgba(239,68,68,0.78), rgba(178,58,72,0.45))"
                          : "linear-gradient(135deg, rgba(217,119,6,0.55), rgba(251,191,36,0.20))",
                        border: over ? "3px solid #fca5a5" : "2px solid rgba(251,191,36,0.65)",
                        borderRadius: 4,
                        display: "flex", flexDirection: "column",
                        alignItems: "center", justifyContent: "center",
                        color: "white",
                        animation: over ? "helpPulse 1s ease-in-out infinite" : undefined,
                      }}>
                        <div style={{ fontSize: 42, lineHeight: 1 }}>{icon}</div>
                        <div style={{
                          fontSize: 13, fontWeight: 900, marginTop: 4, letterSpacing: "0.18em",
                          textTransform: "uppercase", textShadow: "0 2px 6px rgba(0,0,0,0.5)",
                        }}>
                          {p.passKind}{over ? " — too long" : ""}
                        </div>
                        <div style={{
                          fontFamily: "Menlo, monospace", fontSize: 26, fontWeight: 800,
                          marginTop: 4, color: over ? "#fecaca" : "#fde68a",
                          textShadow: "0 2px 6px rgba(0,0,0,0.5)",
                        }}>{fmt}</div>
                        <div style={{ fontSize: 11, fontWeight: 700, opacity: 0.9, marginTop: 2 }}>
                          {firstName}
                        </div>
                      </div>
                    );
                  })()}

                  {/* Birthday ribbon — diagonal corner banner across the
                      top-right of the card on the kid's birthday. Stays
                      out of the existing layout (absolute, no flow). */}
                  {isBirthday && (
                    <div style={{
                      position: "absolute",
                      top: 6, left: 6,
                      zIndex: 4, pointerEvents: "none",
                      padding: "3px 8px",
                      borderRadius: 999,
                      background: "linear-gradient(135deg, #f472b6, #ec4899)",
                      color: "white",
                      fontSize: 11, fontWeight: 800,
                      letterSpacing: "0.04em",
                      boxShadow: "0 2px 6px rgba(236,72,153,0.45)",
                      animation: "starGlow 2.4s ease-in-out infinite",
                    }}>
                      🎂 Birthday!
                    </div>
                  )}

                  {/* Card body */}
                  <div style={{ flex: 1, padding: "16px 10px 12px 10px", display: "flex", flexDirection: "column", alignItems: "center", gap: 8, justifyContent: "center", position: "relative", zIndex: 1 }}>
                    {/* Avatar — modern with violet halo ring + subtle gradient disc */}
                    <div style={{
                      position: "relative",
                      width: 78, height: 78, flexShrink: 0,
                      display: "flex", alignItems: "center", justifyContent: "center",
                    }}>
                      {/* halo ring */}
                      <div style={{
                        position: "absolute", inset: -3,
                        borderRadius: "50%",
                        background: isFull
                          ? "conic-gradient(from 90deg, #ec4899, #a855f7, #6366f1, #ec4899)"
                          : `conic-gradient(from 90deg, ${lc.color}, ${lc.color}66, ${lc.color})`,
                        opacity: isFull ? 1 : 0.55,
                        filter: isFull ? "blur(0.5px)" : undefined,
                        animation: isFull ? "starGlow 4s linear infinite" : undefined,
                      }} />
                      {/* avatar disc */}
                      <div style={{
                        position: "relative",
                        width: 74, height: 74, borderRadius: "50%", overflow: "hidden",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontFamily: "'Inter', sans-serif",
                        fontSize: s.avatar_emoji ? 40 : 30, fontWeight: 800, color: "#fff",
                        background: isFull
                          ? "linear-gradient(135deg, #ec4899 0%, #a855f7 50%, #6366f1 100%)"
                          : `linear-gradient(135deg, ${lc.color} 0%, ${lc.color}aa 100%)`,
                        boxShadow: "inset 0 2px 0 rgba(255,255,255,0.18), inset 0 -10px 14px rgba(0,0,0,0.18)",
                      }}>
                        {s.avatar_url
                          ? <img src={s.avatar_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                          : s.avatar_emoji
                          ? s.avatar_emoji
                          : initial}
                      </div>
                    </div>

                    {/* Name — sans-serif, bold, modern */}
                    <div style={{
                      fontFamily: "'Inter', system-ui, sans-serif",
                      fontSize: 19, fontWeight: 800,
                      lineHeight: 1.05, letterSpacing: "-0.015em",
                      maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", padding: "0 6px",
                      color: isFull ? "#fce7f3" : "#f5f1e8",
                      textShadow: isFull ? "0 0 12px rgba(236,72,153,0.45)" : undefined,
                    }}>
                      {firstName}
                    </div>

                    {/* Grade level + letter grade — small pills below the name.
                        Grade level (e.g. "3rd") is set in /star → Settings.
                        Letter grade (A/B/C/D/F) is the average across the
                        kid's STAR submissions. Both hidden when unset. */}
                    {(starGradeById[String(s.id)] || starLetterById[String(s.id)]) && (
                      <div style={{
                        display: "flex", justifyContent: "center", alignItems: "baseline", gap: 8,
                        lineHeight: 1,
                      }}>
                        {starGradeById[String(s.id)] && (
                          <span style={{
                            fontFamily: serif, fontStyle: "italic",
                            fontSize: 11,
                            color: "rgba(245,241,232,0.55)",
                            letterSpacing: "0.06em",
                          }}>{starGradeById[String(s.id)]}</span>
                        )}
                        {starLetterById[String(s.id)] && (() => {
                          const lg = starLetterById[String(s.id)];
                          const color = lg.letter === "A" ? "#10b981"
                            : lg.letter === "B" ? "#3b82f6"
                            : lg.letter === "C" ? "#f59e0b"
                            : lg.letter === "D" ? "#f97316"
                            : "#ef4444";
                          return (
                            <span style={{
                              display: "inline-flex", alignItems: "baseline", gap: 6,
                              padding: "4px 12px", borderRadius: 999,
                              background: `${color}26`,
                              border: `1.5px solid ${color}77`,
                              boxShadow: `0 0 12px -2px ${color}55`,
                              fontFamily: serif,
                            }}>
                              <span style={{ fontSize: 20, fontWeight: 800, color, letterSpacing: "0.02em", textShadow: `0 0 8px ${color}88` }}>{lg.letter}</span>
                              <span style={{ fontSize: 13, fontWeight: 700, fontStyle: "italic", color: "rgba(245,241,232,0.85)" }}>{lg.pct}%</span>
                            </span>
                          );
                        })()}
                      </div>
                    )}

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
                                ? "drop-shadow(0 0 6px rgba(236,72,153,1)) drop-shadow(0 0 12px rgba(168,85,247,.6))"
                                : "drop-shadow(0 0 3px rgba(236,72,153,.55))")
                            : "none",
                          animation: i < stars && isFull ? `starGlow 2.2s ease-in-out ${i * 0.15}s infinite` : undefined,
                          color: i < stars ? (isFull ? "#f9a8d4" : "#fbcfe8") : "rgba(196,181,253,0.22)",
                          transition: "all .3s ease",
                        }}>★</span>
                      ))}
                    </div>

                    {/* 🍔 EARNED McDONALD'S! pill — shown when full stars.
                        Reads the date stored when the teacher marked the
                        kid (board_user_data.mcdonalds_for) and renders a
                        friendly label ("Today!"/"Tomorrow!"/"Saturday!"/
                        "Sat May 3"). When the date passes, the pill text
                        switches to "Today!" briefly until the daily
                        auto-clear or manual reset. */}
                    {isFull && (() => {
                      const mcd: string | undefined = (s as any).mcdonalds_for;
                      let label = "Earned!";
                      if (mcd) {
                        const today = new Date(Date.now() - 7 * 3600_000);
                        today.setUTCHours(0, 0, 0, 0);
                        const target = new Date(mcd + "T00:00:00Z");
                        const diff = Math.round((target.getTime() - today.getTime()) / 86_400_000);
                        if (diff <= 0) label = "Today!";
                        else if (diff === 1) label = "Tomorrow!";
                        else if (diff < 7) label = target.toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" }) + "!";
                        else label = target.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
                      }
                      return (
                        <div style={{
                          marginTop: 4,
                          display: "inline-flex", alignItems: "center", gap: 4,
                          padding: "3px 10px", borderRadius: 999,
                          fontSize: 11, fontWeight: 800,
                          letterSpacing: "0.06em",
                          textTransform: "uppercase",
                          background: "linear-gradient(135deg, #dc2626, #f97316)",
                          color: "white",
                          boxShadow: "0 0 12px rgba(249,115,22,0.55)",
                          animation: "starGlow 1.6s ease-in-out infinite",
                          whiteSpace: "nowrap",
                        }}>
                          🍔 McDonald's {label}
                        </div>
                      );
                    })()}

                    {/* Per-student STAR progress — barcoded assignments
                        only, no classroom assignments folded in. The bar
                        only appears if the student has STAR work today. */}
                    {(() => {
                      const sp = starProgressById[String(s.id)];
                      if (!sp || sp.total <= 0) return null;
                      const fillsStar = sp.pct >= 100;
                      return (
                        <div style={{
                          width: "82%",
                          display: "flex", flexDirection: "column", alignItems: "stretch", gap: 3,
                          padding: "2px 0 0",
                        }}>
                          <div style={{
                            height: 5,
                            background: "rgba(168,85,247,0.10)",
                            borderRadius: 999,
                            overflow: "hidden",
                            position: "relative",
                            border: "1px solid rgba(168,85,247,0.18)",
                          }}>
                            <div style={{
                              height: "100%",
                              width: `${sp.pct}%`,
                              background: fillsStar
                                ? "linear-gradient(90deg, #6366f1 0%, #a855f7 50%, #ec4899 100%)"
                                : "linear-gradient(90deg, #6366f1 0%, #a855f7 100%)",
                              borderRadius: 999,
                              transition: "width .8s cubic-bezier(0.22,1,0.36,1)",
                              boxShadow: fillsStar
                                ? "0 0 8px rgba(236,72,153,0.55)"
                                : "0 0 6px rgba(168,85,247,0.45)",
                            }} />
                          </div>
                          <div style={{
                            fontFamily: "'Inter', sans-serif",
                            fontSize: 10, lineHeight: 1, fontWeight: 800,
                            color: fillsStar ? "#f9a8d4" : "#c4b5fd",
                            fontVariantNumeric: "tabular-nums",
                            textAlign: "center",
                            letterSpacing: "0.04em",
                          }}>
                            ★ {sp.done}/{sp.total}{fillsStar ? " ✓" : ""}
                          </div>
                        </div>
                      );
                    })()}

                    {/* Points — modern violet/pink chip with coin icon */}
                    {typeof s.dojo_points === "number" && (
                      <div style={{
                        fontFamily: "'Inter', sans-serif",
                        display: "inline-flex", alignItems: "center", gap: 5,
                        padding: "4px 12px", borderRadius: 999,
                        background: "linear-gradient(135deg, rgba(168,85,247,0.30), rgba(236,72,153,0.18))",
                        border: "1px solid rgba(236,72,153,0.45)",
                        fontSize: 14, fontWeight: 800,
                        color: "#fde68a",
                        letterSpacing: "0.01em",
                        boxShadow: "0 2px 8px -2px rgba(168,85,247,0.45)",
                      }}>
                        <span style={{ fontSize: 12 }}>🪙</span>
                        {s.dojo_points}
                        <span style={{ fontSize: 10, fontWeight: 600, opacity: 0.65, marginLeft: 2, color: "#fce7f3" }}>pts</span>
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
                            display: "flex", alignItems: "center", gap: 5,
                            fontSize: 10, padding: "3px 7px", borderRadius: 6,
                            background: "linear-gradient(135deg, rgba(99,102,241,0.18), rgba(168,85,247,0.10))",
                            border: "1px solid rgba(168,85,247,0.30)",
                          }}>
                            <span style={{
                              fontFamily: "ui-monospace, Menlo, monospace",
                              fontSize: 9, fontWeight: 800,
                              color: "#c4b5fd", flexShrink: 0,
                              fontVariantNumeric: "tabular-nums",
                              letterSpacing: "0.02em",
                            }}>
                              {formatTimeShort(sc.start_time)}
                            </span>
                            <span style={{ opacity: 0.85, fontSize: 11, flexShrink: 0 }}>{actEmoji(act)}</span>
                            <span style={{
                              color: "#e9d5ff", fontWeight: 700, flex: 1, minWidth: 0,
                              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 10,
                            }}>
                              {act}
                            </span>
                          </div>
                        </div>
                      );
                    })()}

                    {/* Reward tally — small modern chip */}
                    {s.reward_count > 0 && (
                      <div style={{
                        fontFamily: "'Inter', sans-serif", fontSize: 10, fontWeight: 700,
                        padding: "2px 9px", borderRadius: 999,
                        background: "linear-gradient(135deg, rgba(236,72,153,0.20), rgba(168,85,247,0.10))",
                        color: "#fbcfe8",
                        border: "1px solid rgba(236,72,153,0.35)",
                        letterSpacing: "0.06em", textTransform: "uppercase",
                      }}>★ {s.reward_count}× rewarded</div>
                    )}

                    {/* Active status pills — free time / specials / lunch /
                        supplies / books. One pill per status, color-coded.
                        Live elapsed minutes from timerNow. Hidden when none. */}
                    {(statusByStudentId[String(s.id)] || []).length > 0 && (
                      <div style={{
                        display: "flex", flexWrap: "wrap",
                        justifyContent: "center", gap: 4,
                        padding: "2px 6px",
                      }}>
                        {(statusByStudentId[String(s.id)] || []).map((st, i) => {
                          const tone = TONE_BG[st.tone];
                          const elapsedMin = Math.max(0, Math.floor((timerNow - new Date(st.startedAt).getTime()) / 60_000));
                          const elapsedLabel = elapsedMin === 0 ? "<1m" : `${elapsedMin}m`;
                          // Movement statuses = the kid is OUT of the room.
                          // Tag them with "out" so the teacher can read at a
                          // glance who is physically not present.
                          const isOut = st.kind === "movement-specials" || st.kind === "movement-lunch";
                          return (
                            <span
                              key={i}
                              title={`${st.label} · ${elapsedLabel}${isOut ? " · OUT" : ""}`}
                              style={{
                                display: "inline-flex", alignItems: "center", gap: 3,
                                padding: "2px 7px", borderRadius: 999,
                                background: tone.bg,
                                border: `1px solid ${tone.border}`,
                                color: tone.color,
                                fontSize: 10, fontWeight: 800,
                                letterSpacing: "0.02em",
                                lineHeight: 1.1,
                                fontVariantNumeric: "tabular-nums",
                                maxWidth: "100%",
                                whiteSpace: "nowrap",
                                overflow: "hidden", textOverflow: "ellipsis",
                              }}
                            >
                              <span style={{ fontSize: 11 }}>{st.icon}</span>
                              {st.label}
                              {isOut && <span style={{
                                marginLeft: 2, padding: "0 4px", borderRadius: 4,
                                background: "rgba(239,68,68,0.30)",
                                color: "#fecaca",
                                fontSize: 8, letterSpacing: "0.10em",
                              }}>OUT</span>}
                              <span style={{ opacity: 0.75 }}>{elapsedLabel}</span>
                            </span>
                          );
                        })}
                      </div>
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
                      display: "flex", alignItems: "center", gap: 12,
                      padding: "10px 14px", borderRadius: 12,
                      background: i === 0
                        ? "linear-gradient(95deg, rgba(236,72,153,0.18) 0%, rgba(168,85,247,0.10) 50%, rgba(99,102,241,0.04) 100%)"
                        : "linear-gradient(95deg, rgba(168,85,247,0.08) 0%, rgba(255,255,255,0.02) 100%)",
                      border: i === 0
                        ? "1px solid rgba(236,72,153,0.40)"
                        : `1px solid ${s ? "rgba(168,85,247,0.20)" : "rgba(255,255,255,0.05)"}`,
                      boxShadow: i === 0 ? "0 6px 20px -10px rgba(236,72,153,0.45)" : undefined,
                      flex: 1, minHeight: 0,
                      position: "relative", overflow: "hidden",
                    }}>
                      {/* rank chip */}
                      <div style={{
                        flexShrink: 0,
                        width: 38, height: 38, borderRadius: "50%",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: 22, opacity: s ? 1 : 0.25,
                        background: s ? `radial-gradient(circle at 35% 30%, ${accents[i]}55, ${accents[i]}11)` : "transparent",
                        border: s ? `1px solid ${accents[i]}55` : `1px solid rgba(255,255,255,0.05)`,
                      }}>{medals[i]}</div>
                      <div style={{ flex: 1, minWidth: 0, overflow: "hidden" }}>
                        <div style={{
                          fontFamily: "'Inter', sans-serif",
                          fontSize: i === 0 ? 26 : 20,
                          fontWeight: i === 0 ? 800 : 700,
                          letterSpacing: "-0.015em",
                          color: s ? (i === 0 ? "#fce7f3" : "#f5f1e8") : "rgba(245,241,232,0.2)",
                          lineHeight: 1.05,
                          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                          textShadow: i === 0 && s ? "0 0 12px rgba(236,72,153,0.35)" : undefined,
                        }}>
                          {s ? (s.name || "?").split(" ")[0] : "—"}
                        </div>
                      </div>
                      {s && (
                        <div style={{
                          fontFamily: "'Inter', sans-serif",
                          fontSize: i === 0 ? 30 : 23,
                          fontWeight: 900,
                          color: accents[i],
                          fontVariantNumeric: "tabular-nums",
                          display: "flex", alignItems: "center", gap: 4,
                          flexShrink: 0,
                          textShadow: `0 0 10px ${accents[i]}66`,
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
                    flex: 1, minHeight: 0, borderRadius: 10, overflow: "hidden",
                    display: "flex", alignItems: "stretch",
                    background: `linear-gradient(95deg, ${gc.from} 0%, rgba(15,15,28,0.20) 90%)`,
                    border: `1px solid ${gc.border}`,
                    animation: `fadeUp .5s ease ${gi * 0.06}s both`,
                  }}>
                    {/* Emoji + grade badge */}
                    <div style={{
                      width: 52, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", gap: 4,
                      borderRight: `1px solid ${gc.border}`,
                      background: "rgba(15,15,28,0.40)",
                    }}>
                      <div style={{
                        fontFamily: "'Inter', sans-serif",
                        fontSize: 11, fontWeight: 800, color: gc.text,
                        letterSpacing: "0.08em",
                        padding: "2px 7px", borderRadius: 999,
                        background: `${gc.text}1f`,
                        border: `1px solid ${gc.text}55`,
                      }}>{gc.motif}</div>
                    </div>
                    {/* Activity + roster — single-row layout, no vertical clipping */}
                    <div style={{
                      flex: 1, padding: "0 14px", minWidth: 0,
                      display: "flex", alignItems: "center", gap: 12,
                    }}>
                      <span style={{ fontSize: 20, lineHeight: 1, flexShrink: 0 }}>{emoji}</span>
                      <span style={{
                        fontFamily: "'Inter', system-ui, sans-serif",
                        fontSize: 18, fontWeight: 800,
                        color: "#fce7f3",
                        lineHeight: 1.1,
                        letterSpacing: "-0.005em",
                        whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                        flexShrink: 0,
                      }}>
                        {act || <span style={{ opacity: 0.40, fontWeight: 600, color: "rgba(245,241,232,0.50)" }}>not yet scheduled</span>}
                      </span>
                      <span style={{
                        fontFamily: "'Inter', sans-serif", fontSize: 12, fontWeight: 600,
                        color: "rgba(245,241,232,0.55)", letterSpacing: "0.01em",
                        whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                        minWidth: 0, flex: 1,
                      }}>
                        {students.map(s => (s.name || "?").split(" ")[0]).join("  ·  ")}
                      </span>
                    </div>
                  </div>
                );
              })}
              {board.students.filter(s => !s.specials_grade).length > 0 && (
                <div style={{
                  borderRadius: 10, padding: "6px 14px", display: "flex", alignItems: "center", gap: 10,
                  background: "rgba(168,85,247,0.04)", border: `1px dashed rgba(168,85,247,0.20)`,
                }}>
                  <div style={{
                    fontFamily: "'Inter', sans-serif", fontSize: 9, fontWeight: 800,
                    color: "rgba(196,181,253,0.55)", letterSpacing: "0.22em", textTransform: "uppercase", flexShrink: 0,
                  }}>Unassigned</div>
                  <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 13, fontWeight: 500, color: "rgba(245,241,232,0.40)" }}>
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
                      fontFamily: "'Inter', sans-serif", fontSize: 18,
                      fontWeight: isToday ? 900 : 700,
                      padding: "5px 2px", borderRadius: 8,
                      background: isToday
                        ? "linear-gradient(135deg, #ec4899, #a855f7)"
                        : "transparent",
                      color: isToday ? "#fff" : "rgba(196,181,253,0.40)",
                      border: isToday ? "1px solid rgba(236,72,153,0.55)" : "1px solid transparent",
                      letterSpacing: "0.04em",
                      boxShadow: isToday ? "0 0 14px rgba(236,72,153,0.40)" : "none",
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
                      fontFamily: "'Inter', sans-serif",
                      fontSize: 16, fontWeight: 900, borderRadius: 8,
                      color: gc.text,
                      background: `linear-gradient(180deg, ${gc.from}, rgba(15,15,28,0.20))`,
                      border: `1px solid ${gc.border}`,
                    }}>{grade}</div>
                    {DAY_LETTERS.map(day => {
                      const c = board.specials.find(r => Number(r.grade) === grade && String(r.day_letter).toUpperCase() === day);
                      const isToday = day === dayLetter;
                      return (
                        <div key={day} style={{
                          display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                          textAlign: "center", borderRadius: 8, padding: "4px 2px",
                          background: isToday
                            ? "linear-gradient(160deg, rgba(236,72,153,0.40) 0%, rgba(168,85,247,0.18) 100%)"
                            : "rgba(168,85,247,0.025)",
                          border: isToday
                            ? "1px solid rgba(236,72,153,0.55)"
                            : "1px solid rgba(168,85,247,0.06)",
                          gap: 2, overflow: "hidden", minHeight: 0,
                          boxShadow: isToday ? "inset 0 0 14px rgba(236,72,153,0.22)" : "none",
                        }}>
                          {c?.activity ? (
                            <>
                              <span style={{ fontSize: 18, lineHeight: 1, opacity: isToday ? 1 : 0.55 }}>{actEmoji(c.activity)}</span>
                              <span style={{
                                fontFamily: "'Inter', sans-serif",
                                fontSize: 11,
                                fontWeight: isToday ? 800 : 600,
                                lineHeight: 1.15,
                                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                                maxWidth: "100%", padding: "0 2px",
                                color: isToday ? "#fce7f3" : "rgba(196,181,253,0.45)",
                                letterSpacing: "-0.005em",
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

      {/* ── REWARD GOAL banner — slim row above the Ledger when set ── */}
      {rewardActive && (
        <section style={{
          position: "relative", zIndex: 1,
          borderRadius: 14,
          background: rewardEarned
            ? "radial-gradient(600px 200px at 0% 50%, rgba(16,185,129,0.30) 0%, transparent 65%), linear-gradient(95deg, rgba(16,185,129,0.22) 0%, rgba(168,85,247,0.18) 50%, rgba(236,72,153,0.18) 100%)"
            : "linear-gradient(95deg, rgba(168,85,247,0.18) 0%, rgba(99,102,241,0.10) 50%, rgba(236,72,153,0.18) 100%)",
          border: rewardEarned ? "1px solid rgba(16,185,129,0.55)" : "1px solid rgba(168,85,247,0.30)",
          boxShadow: rewardEarned
            ? "0 0 36px rgba(16,185,129,0.45), inset 0 1px 0 rgba(255,255,255,0.06)"
            : "0 0 24px -8px rgba(168,85,247,0.30), inset 0 1px 0 rgba(255,255,255,0.04)",
          padding: "0 18px",
          display: "flex", alignItems: "center", gap: 14,
          overflow: "hidden",
          animation: rewardEarned ? "fullCard 2.6s ease-in-out infinite" : undefined,
        }}>
          <div style={{
            display: "inline-flex", alignItems: "center", gap: 8,
            flexShrink: 0,
          }}>
            <span style={{
              display: "inline-flex", alignItems: "center", justifyContent: "center",
              width: 32, height: 32, borderRadius: 10,
              background: rewardEarned
                ? "linear-gradient(135deg, #22c55e, #10b981)"
                : "linear-gradient(135deg, #ec4899, #a855f7)",
              fontSize: 18,
              boxShadow: rewardEarned
                ? "0 0 14px rgba(16,185,129,0.55)"
                : "0 0 14px rgba(168,85,247,0.45)",
            }}>{rewardEmoji}</span>
            <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
              <span style={{
                fontFamily: "'Inter', sans-serif", fontSize: 9, fontWeight: 800,
                letterSpacing: "0.22em", textTransform: "uppercase",
                color: rewardEarned ? "#86efac" : "#f9a8d4",
              }}>{rewardEarned ? "Class Goal Earned!" : "Class Goal"}</span>
              <span style={{
                fontFamily: "'Inter', sans-serif", fontSize: 16, fontWeight: 900,
                letterSpacing: "-0.02em",
                background: rewardEarned
                  ? "linear-gradient(135deg, #d1fae5 0%, #f9a8d4 100%)"
                  : "linear-gradient(135deg, #f5f1e8 0%, #c4b5fd 100%)",
                WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
                backgroundClip: "text",
                whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                maxWidth: 320,
              }}>{rewardLabel || "Whole-Class Reward"}</span>
            </div>
          </div>

          {/* Progress rail */}
          <div style={{
            flex: 1, minWidth: 0,
            height: 10, borderRadius: 999,
            background: "rgba(168,85,247,0.10)",
            border: "1px solid rgba(168,85,247,0.20)",
            overflow: "hidden", position: "relative",
          }}>
            <div style={{
              position: "absolute", top: 0, left: 0, height: "100%",
              width: `${rewardPct}%`,
              background: rewardEarned
                ? "linear-gradient(90deg, #22c55e 0%, #10b981 50%, #ec4899 100%)"
                : "linear-gradient(90deg, #6366f1 0%, #a855f7 50%, #ec4899 100%)",
              borderRadius: 999,
              transition: "width .8s cubic-bezier(0.22,1,0.36,1)",
              boxShadow: rewardEarned
                ? "0 0 16px rgba(16,185,129,0.55)"
                : "0 0 14px rgba(236,72,153,0.45)",
            }} />
          </div>

          <div style={{
            flexShrink: 0,
            fontFamily: mono, fontSize: 22, fontWeight: 900,
            color: rewardEarned ? "#bbf7d0" : "#fce7f3",
            fontVariantNumeric: "tabular-nums", letterSpacing: "-0.02em",
            textShadow: rewardEarned ? "0 0 14px rgba(187,247,208,0.55)" : "0 0 12px rgba(252,231,243,0.30)",
          }}>
            {rewardTotal}<span style={{ fontSize: 14, color: "rgba(196,181,253,0.55)", fontWeight: 700 }}> / {rewardTarget}</span>
            <span style={{ marginLeft: 8, fontSize: 12, color: rewardEarned ? "#86efac" : "#c4b5fd" }}>· {rewardPct}%</span>
          </div>
        </section>
      )}

      {/* ── ROW 4: "The Ledger" — Behavior Levels strip ── */}
      <section style={{
        position: "relative", zIndex: 1,
        ...card, borderRadius: 14,
        display: "flex", alignItems: "center", gap: 14, padding: "0 18px",
        overflow: "hidden", flexShrink: 0,
      }}>
        <div style={{
          display: "inline-flex", alignItems: "center", gap: 8,
          flexShrink: 0, paddingRight: 14,
          borderRight: `1px solid rgba(168,85,247,0.18)`,
        }}>
          <span style={{
            display: "inline-flex", alignItems: "center", justifyContent: "center",
            width: 26, height: 22, borderRadius: 7,
            fontFamily: "'Inter', sans-serif", fontSize: 10, fontWeight: 900,
            background: "linear-gradient(135deg, #ec4899, #a855f7)", color: "white",
            letterSpacing: "0.04em",
            boxShadow: "0 0 12px rgba(168,85,247,0.45)",
          }}>04</span>
          <span style={{
            fontFamily: "'Inter', sans-serif", fontSize: 14, fontWeight: 800,
            letterSpacing: "-0.01em",
            background: "linear-gradient(135deg, #f5f1e8 0%, #c4b5fd 100%)",
            WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
            backgroundClip: "text",
          }}>The Ledger</span>
        </div>
        <div style={{ flex: 1, display: "flex", gap: 18, alignItems: "center", overflow: "hidden" }}>
          {[5, 4, 3, 2, 1].map(lv => {
            const at = board.students.filter(s => (s.level || 1) === lv);
            if (at.length === 0) return null;
            const lc = BEHAVIOR_LEVELS[lv];
            return (
              <div key={lv} style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                <div style={{
                  fontFamily: "'Inter', sans-serif",
                  fontSize: 11, fontWeight: 800,
                  padding: "3px 10px", borderRadius: 999,
                  background: `linear-gradient(135deg, ${lc.color}33, ${lc.color}11)`,
                  color: lc.color,
                  border: `1px solid ${lc.color}66`,
                  letterSpacing: "0.10em", textTransform: "uppercase",
                  boxShadow: `0 0 8px ${lc.color}33`,
                }}>L{lv}</div>
                {at.map((s, si) => (
                  <span key={s.id} style={{
                    fontFamily: "'Inter', sans-serif",
                    fontSize: 13, fontWeight: 700,
                    color: "rgba(245,241,232,0.85)",
                    letterSpacing: "-0.005em",
                    paddingRight: si < at.length - 1 ? 8 : 0,
                    borderRight: si < at.length - 1 ? `1px solid rgba(168,85,247,0.15)` : "none",
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
    {/* Teacher console — manual progress + board store. Mounted at the
        wrapper level so it overlays the whole board view, not the
        scaled inner workspace. */}
    {showConsole && cls?.id && (
      <BoardConsole
        classId={cls.id}
        students={(board?.students || []) as any}
        onClose={() => setShowConsole(false)}
      />
    )}
    {/* Birthday auto-celebration — full-board takeover when any kid's
        birthday is today (Pacific). Once-per-day per kid via localStorage. */}
    {board?.students?.length > 0 && (
      <BirthdayCelebration students={board.students as any} />
    )}

    {/* Flash leaderboard — periodic toast in the bottom-right
        celebrating top earners + recent McDonald's earners. */}
    {cls?.id && <FlashLeaderboard classId={cls.id} />}

    {/* Reaction emojis — bottom-center pill, kids tap to react silently. */}
    <ReactionRain />

    {/* STAR active passes — bottom-left strip of students currently out
        on a bathroom / water / sensory break with running timers. */}
    <ActivePassesStrip />

    {/* STAR live class view — toggle button top-right opens a slide-over
        with today's completion tracker + grades matrix for the projector. */}
    <BoardStarPanel />

    {/* Random picker overlay + EYES ON ME overlay + activity feed. */}
    <BoardClassroomTools students={(board?.students || []) as any} />

    {/* Student wallet — overlay opened from the 💼 button. */}
    {showWallet && cls?.id && (
      <StudentWallet
        students={(board?.students || []) as any}
        classId={cls.id}
        onClose={() => setShowWallet(false)}
      />
    )}

    {/* Morning slide — full-screen instructions, teacher-toggleable
        from the 🌅 Morning button or from Tools → 🌅 Morning tab.
        Wallet + Tools shortcuts inside the slide so kids/teacher
        don't have to dismiss-then-tap to access them. */}
    {showMorningSlide && cls?.id && (
      <MorningSlide
        classId={cls.id}
        onClose={() => setShowMorningSlide(false)}
        onOpenWallet={() => setShowWallet(true)}
        onOpenTools={isTeacher ? () => { setConsolePin(""); setConsolePinError(""); setConsolePinModal(true); } : undefined}
      />
    )}

    {/* PIN gate before the console opens. Locks teacher tools so
        kids walking past the projector can't poke at the manual
        progress entry or open the store without permission. */}
    {consolePinModal && (
      <div
        onClick={(e) => { if (e.target === e.currentTarget) { setConsolePinModal(false); setConsolePin(""); setConsolePinError(""); } }}
        style={{
          position: "fixed", inset: 0, zIndex: 250,
          background: "rgba(0,0,0,0.65)", backdropFilter: "blur(8px)",
          display: "flex", alignItems: "center", justifyContent: "center",
          padding: 24,
        }}
      >
        <div style={{
          background: "linear-gradient(180deg, #0f172a 0%, #1e1b2e 100%)",
          border: "1px solid rgba(255,255,255,0.10)",
          borderRadius: 22,
          width: "min(380px, 92vw)",
          padding: 28,
          color: "#f5f1e8",
          textAlign: "center",
          boxShadow: "0 24px 64px rgba(0,0,0,0.5)",
        }}>
          <div style={{ fontSize: 38, marginBottom: 6 }}>🔒</div>
          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.2em", textTransform: "uppercase", opacity: 0.55, marginBottom: 4 }}>
            Teacher Tools
          </div>
          <div style={{ fontSize: 20, fontWeight: 800, marginBottom: 18 }}>
            Enter the teacher PIN
          </div>
          <PinPad
            value={consolePin}
            onChange={(v) => { setConsolePin(v); setConsolePinError(""); }}
            onSubmit={tryConsoleUnlock}
            maxLength={8}
            warm
          />
          {consolePinError && <div style={{ fontSize: 13, color: "#fca5a5", marginTop: 12 }}>{consolePinError}</div>}
          <div style={{ height: 14 }} />
          <div style={{ display: "flex", gap: 10 }}>
            <button
              onClick={() => { setConsolePinModal(false); setConsolePin(""); setConsolePinError(""); }}
              style={{
                flex: 1, padding: "12px 0", borderRadius: 12,
                background: "rgba(255,255,255,0.05)",
                border: "1px solid rgba(255,255,255,0.10)",
                color: "rgba(245,241,232,0.70)", fontWeight: 700, cursor: "pointer",
              }}
            >Cancel</button>
            <button
              onClick={tryConsoleUnlock}
              disabled={consolePinLoading || !consolePin.trim()}
              style={{
                flex: 2, padding: "12px 0", borderRadius: 12,
                background: consolePin.trim() ? "linear-gradient(135deg,#b23a48,#d97706)" : "rgba(255,255,255,0.10)",
                border: "none", color: "white", fontWeight: 800,
                cursor: consolePinLoading || !consolePin.trim() ? "default" : "pointer",
                opacity: consolePinLoading || !consolePin.trim() ? 0.5 : 1,
              }}
            >{consolePinLoading ? "Checking…" : "Unlock"}</button>
          </div>
        </div>
      </div>
    )}
    </div>
  );
}
