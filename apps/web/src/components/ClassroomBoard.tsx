import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "../lib/api.ts";
import { findCurrentBlock, findNextBlock, type ScheduleBlock } from "../lib/useCurrentBlock.ts";

const DAY_LETTERS = ["A", "B", "C", "D", "E", "F"] as const;
const GRADES = [3, 4, 5] as const;

const MUSIC_PRESETS: { id: string; label: string; videoId: string; emoji: string }[] = [
  { id: "forest",   label: "Forest",   videoId: "xNN7iTA57jM", emoji: "🌲" },
  { id: "ocean",    label: "Ocean",    videoId: "MIr3RsUWrdo", emoji: "🌊" },
  { id: "rain",     label: "Rain",     videoId: "mPZkdNFkNps", emoji: "🌧" },
  { id: "piano",    label: "Piano",    videoId: "4xDzrJKXOOY", emoji: "🎹" },
  { id: "campfire", label: "Campfire", videoId: "UgHKb_7884o", emoji: "🔥" },
];

const SUBJECT_COLORS: Record<string, string> = {
  math:          "rgba(239,68,68,0.25)",
  sel:           "rgba(245,158,11,0.25)",
  coding_art_gym:"rgba(139,92,246,0.25)",
  video_learning:"rgba(59,130,246,0.25)",
  writing:       "rgba(16,185,129,0.25)",
  daily_news:    "rgba(99,102,241,0.25)",
  review:        "rgba(236,72,153,0.2)",
  cashout:       "rgba(245,158,11,0.2)",
  lunch:         "rgba(34,197,94,0.2)",
  recess:        "rgba(34,197,94,0.25)",
  calm_down:     "rgba(139,92,246,0.2)",
  ted_talk:      "rgba(59,130,246,0.2)",
  extra_review:  "rgba(236,72,153,0.2)",
};

const ACTIVITY_EMOJI: Record<string, string> = {
  PE: "🏃", Gym: "🏃", Music: "🎵", Art: "🎨", Library: "📚",
  Tech: "💻", Dance: "💃", Science: "🔬", Drama: "🎭", Spanish: "🗣",
};
function activityEmoji(name: string) {
  for (const [k, v] of Object.entries(ACTIVITY_EMOJI)) {
    if (name?.toLowerCase().includes(k.toLowerCase())) return v;
  }
  return "✨";
}

const GRADE_COLORS: Record<number, { bg: string; border: string; text: string }> = {
  3: { bg: "rgba(20,184,166,0.2)",  border: "rgba(20,184,166,0.5)",  text: "#5eead4" },
  4: { bg: "rgba(251,146,60,0.2)",  border: "rgba(251,146,60,0.5)",  text: "#fdba74" },
  5: { bg: "rgba(167,139,250,0.2)", border: "rgba(167,139,250,0.5)", text: "#c4b5fd" },
};

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
  const [musicPlaying, setMusicPlaying] = useState(true);
  const musicRef = useRef<HTMLIFrameElement>(null);

  const toggleFullscreen = useCallback(async () => {
    if (!document.fullscreenElement) {
      await document.documentElement.requestFullscreen?.().catch(() => {});
    } else {
      await document.exitFullscreen?.().catch(() => {});
    }
  }, []);

  const toggleMusic = useCallback(() => {
    const func = musicPlaying ? "pauseVideo" : "playVideo";
    musicRef.current?.contentWindow?.postMessage(
      JSON.stringify({ event: "command", func, args: "" }), "*"
    );
    setMusicPlaying(p => !p);
  }, [musicPlaying]);

  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", handler);
    return () => document.removeEventListener("fullscreenchange", handler);
  }, []);

  useEffect(() => {
    const iv = setInterval(() => setNow(new Date()), 15_000);
    return () => clearInterval(iv);
  }, []);

  useEffect(() => {
    let cancelled = false;
    api.getClasses()
      .then((cs: any[]) => {
        if (cancelled) return;
        if (!cs?.length) { setError("No classes available"); return; }
        const match =
          cs.find((c: any) => c.id === classParam) ||
          cs.find((c: any) => String(c.name || "").toLowerCase() === classParam) ||
          cs.find((c: any) => String(c.name || "").toLowerCase().startsWith(classParam)) ||
          cs[0];
        setCls(match);
      })
      .catch(() => { if (!cancelled) setError("Couldn't load classes"); });
    return () => { cancelled = true; };
  }, [classParam]);

  useEffect(() => {
    if (!cls?.id) return;
    let cancelled = false;
    const load = () => {
      api.getClassSchedule(cls.id).then((rows) => { if (!cancelled) setSchedule(Array.isArray(rows) ? rows : []); }).catch(() => {});
      api.getBoardData(cls.id).then((d: any) => {
        if (cancelled) return;
        setBoard({
          students: d?.students || [],
          schedules: d?.schedules || [],
          specials: d?.specials || [],
          settings: d?.settings || {},
        });
      }).catch(() => {});
    };
    load();
    const iv = setInterval(load, 15_000);
    return () => { cancelled = true; clearInterval(iv); };
  }, [cls?.id]);

  const currentBlock = useMemo(() => findCurrentBlock(schedule, now), [schedule, now]);
  const nextBlock    = useMemo(() => findNextBlock(schedule, now), [schedule, now]);

  const timeStr = now.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  const dateStr = now.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" });
  const dayLetter = (board.settings?.current_specials_day || "A").toUpperCase();

  const countdown = useMemo(() => {
    if (!currentBlock) return null;
    const [h, m] = (currentBlock.end_time || "").split(":").map(Number);
    if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
    const end = new Date(now); end.setHours(h, m, 0, 0);
    const diff = end.getTime() - now.getTime();
    if (diff <= 0) return null;
    const mm = Math.floor(diff / 60000);
    const ss = Math.floor((diff % 60000) / 1000);
    return `${mm}:${String(ss).padStart(2, "0")}`;
  }, [currentBlock, now]);

  if (error) return <div className="min-h-screen flex items-center justify-center bg-black text-red-400 text-2xl">{error}</div>;
  if (!cls)  return <div className="min-h-screen flex items-center justify-center bg-black text-white/60 text-2xl">Loading classroom board…</div>;

  const bgUrl = board.settings?.background_image_url;
  const bg = bgUrl || "linear-gradient(135deg, #0f0821 0%, #1e1035 30%, #2d1b4e 60%, #12082a 100%)";
  const musicId = board.settings?.music_playlist_id || "";
  const musicPreset = MUSIC_PRESETS.find(p => p.id === musicId);

  const glass = { background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", backdropFilter: "blur(10px)" } as const;
  const sectionLabel = "text-[11px] uppercase tracking-[0.28em] font-semibold opacity-50 mb-1";

  return (
    <div className="min-h-screen relative" style={{
      background: bgUrl ? `url(${bgUrl}) center/cover no-repeat fixed` : bg,
      color: "white",
      fontFamily: "'Inter', system-ui, -apple-system, sans-serif",
    }}>
      {/* Dark overlay */}
      <div className="absolute inset-0 pointer-events-none" style={{ background: bgUrl ? "rgba(5,3,18,0.65)" : "rgba(5,3,18,0.35)" }} />

      <div className="relative p-6 space-y-5 pb-28">
        {/* ── Header ── */}
        <div className="flex items-end justify-between gap-4 flex-wrap pb-5 border-b" style={{ borderColor: "rgba(255,255,255,0.1)" }}>
          <div>
            <div className="text-[11px] uppercase tracking-[0.3em] opacity-50 mb-1">BlockForge · Classroom</div>
            <h1 style={{ fontSize: 52, fontWeight: 900, lineHeight: 1, letterSpacing: "-0.02em" }}>{cls.name}</h1>
            <div className="mt-2 text-base opacity-75">
              {dateStr} &nbsp;·&nbsp;
              <span className="font-mono font-bold px-2 py-0.5 rounded-md" style={{ background: "rgba(245,158,11,0.2)", color: "#fbbf24" }}>
                Day {dayLetter}
              </span>
            </div>
          </div>
          <div className="text-right flex flex-col items-end gap-2">
            <div style={{ fontSize: 52, fontWeight: 800, fontVariantNumeric: "tabular-nums", letterSpacing: "-0.03em" }}>{timeStr}</div>
            <button
              onClick={toggleFullscreen}
              title={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
              style={{ background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.18)", borderRadius: 8, padding: "5px 12px", fontSize: 12, color: "rgba(255,255,255,0.7)", cursor: "pointer" }}
            >
              {isFullscreen ? "✕ Exit" : "⛶ Fullscreen"}
            </button>
          </div>
        </div>

        {/* ── Current Block ── */}
        <section className="rounded-3xl p-6" style={{
          background: currentBlock
            ? (SUBJECT_COLORS[currentBlock.subject || ""] || "rgba(139,92,246,0.2)")
            : "rgba(255,255,255,0.04)",
          border: "1px solid rgba(139,92,246,0.4)",
          backdropFilter: "blur(10px)",
        }}>
          <div className={sectionLabel}>Right Now</div>
          {currentBlock ? (
            <div className="flex items-baseline gap-6 flex-wrap">
              <div style={{ fontSize: 68, fontWeight: 900, letterSpacing: "-0.03em" }}>
                {currentBlock.label || currentBlock.subject}
              </div>
              <div className="opacity-70 text-2xl font-mono">{currentBlock.start_time}–{currentBlock.end_time}</div>
              {countdown && (
                <div className="px-5 py-2 rounded-2xl text-2xl font-bold font-mono" style={{ background: "rgba(0,0,0,0.35)", border: "1px solid rgba(255,255,255,0.12)" }}>
                  ⏱ {countdown}
                </div>
              )}
              {currentBlock.is_break && (
                <div className="px-4 py-2 rounded-full text-base font-bold" style={{ background: "rgba(34,197,94,0.25)", color: "#86efac", border: "1px solid rgba(34,197,94,0.35)" }}>☕ Break</div>
              )}
            </div>
          ) : (
            <div style={{ fontSize: 40, fontWeight: 800, opacity: 0.5 }}>No active block</div>
          )}
          {nextBlock && (
            <div className="mt-3 text-sm opacity-65">
              Up next: <span className="font-semibold">{nextBlock.block.label || nextBlock.block.subject}</span>
              <span className="font-mono ml-2 opacity-80">{nextBlock.block.start_time}</span>
            </div>
          )}
        </section>

        {/* ── Specialist ── */}
        {board.settings?.specialist_name && (
          <section className="rounded-2xl px-6 py-4 flex items-center gap-4" style={{
            background: "linear-gradient(135deg, rgba(245,158,11,0.15), rgba(251,191,36,0.07))",
            border: "1px solid rgba(245,158,11,0.28)",
            backdropFilter: "blur(8px)",
          }}>
            <div className="text-3xl">🕚</div>
            <div>
              <div className={sectionLabel}>11:00 AM · Specialist in Room</div>
              <div style={{ fontSize: 26, fontWeight: 800 }}>{board.settings.specialist_name}</div>
            </div>
          </section>
        )}

        {/* ── Behavior Stars + Independence Levels ── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

          {/* Behavior Stars */}
          <section className="rounded-2xl p-5" style={glass}>
            <div className="flex items-baseline gap-3 mb-4">
              <div className={sectionLabel}>⭐ Behavior Stars</div>
              <div className="text-[11px] opacity-40">5 = McDonald's · resets</div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {board.students.map(s => {
                const stars = Math.max(0, Math.min(5, s.behavior_stars || 0));
                const isFull = stars >= 5;
                const isHigh = stars >= 3;
                return (
                  <div key={s.id} className="rounded-2xl p-4 flex flex-col items-center gap-2 text-center" style={{
                    background: isFull
                      ? "linear-gradient(135deg, rgba(245,158,11,0.4), rgba(234,179,8,0.22))"
                      : isHigh
                      ? "linear-gradient(135deg, rgba(139,92,246,0.28), rgba(99,102,241,0.16))"
                      : "rgba(255,255,255,0.05)",
                    border: isFull
                      ? "1px solid rgba(245,158,11,0.65)"
                      : isHigh
                      ? "1px solid rgba(139,92,246,0.45)"
                      : "1px solid rgba(255,255,255,0.1)",
                    boxShadow: isFull ? "0 0 24px rgba(245,158,11,0.3)" : "none",
                  }}>
                    <div className="w-14 h-14 rounded-full flex items-center justify-center text-2xl font-bold flex-shrink-0 overflow-hidden" style={{
                      background: isFull
                        ? "linear-gradient(135deg, rgba(245,158,11,0.55), rgba(234,179,8,0.38))"
                        : "linear-gradient(135deg, rgba(139,92,246,0.55), rgba(99,102,241,0.42))",
                      border: "2.5px solid rgba(255,255,255,0.2)",
                    }}>
                      {s.avatar_url
                        ? <img src={s.avatar_url} alt="" className="w-full h-full object-cover" />
                        : <span style={{ fontSize: 22 }}>{(s.name || "?")[0].toUpperCase()}</span>}
                    </div>
                    <div className="font-bold text-sm leading-tight">{s.name}</div>
                    <div className="flex items-center gap-0.5">
                      {Array.from({ length: 5 }, (_, i) => (
                        <span key={i} style={{
                          fontSize: 20,
                          opacity: i < stars ? 1 : 0.13,
                          filter: i < stars ? "drop-shadow(0 0 6px rgba(251,191,36,1))" : "grayscale(1) brightness(0.35)",
                        }}>⭐</span>
                      ))}
                    </div>
                    <div className="w-full rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.1)", height: 5 }}>
                      <div className="h-full rounded-full transition-all duration-700" style={{
                        width: `${(stars / 5) * 100}%`,
                        background: isFull ? "linear-gradient(90deg,#f59e0b,#fbbf24,#fef08a)" : isHigh ? "#a78bfa" : "#818cf8",
                      }} />
                    </div>
                    {s.reward_count > 0 && (
                      <div className="text-[11px] px-2.5 py-0.5 rounded-full font-bold" style={{ background: "rgba(245,158,11,0.3)", color: "#fcd34d", border: "1px solid rgba(245,158,11,0.45)" }}>
                        🏆 {s.reward_count}× earned
                      </div>
                    )}
                  </div>
                );
              })}
              {board.students.length === 0 && (
                <div className="col-span-2 text-sm opacity-40 py-8 text-center">No students in this class yet.</div>
              )}
            </div>
          </section>

          {/* Independence Levels */}
          <section className="rounded-2xl p-5" style={glass}>
            <div className={sectionLabel + " mb-4"}>🎯 Independence Levels</div>
            <div className="space-y-2.5">
              {[5, 4, 3, 2, 1].map(level => {
                const atLevel = board.students.filter(s => (s.level || 1) === level);
                const colors = [
                  "", // placeholder for index 0
                  { bg: "rgba(239,68,68,0.18)", border: "rgba(239,68,68,0.35)", text: "#fca5a5", label: "L1 · Max Support" },
                  { bg: "rgba(251,146,60,0.18)", border: "rgba(251,146,60,0.35)", text: "#fdba74", label: "L2 · Some Support" },
                  { bg: "rgba(245,158,11,0.2)",  border: "rgba(245,158,11,0.38)", text: "#fcd34d", label: "L3 · Growing" },
                  { bg: "rgba(34,197,94,0.18)",  border: "rgba(34,197,94,0.35)",  text: "#86efac", label: "L4 · Independent" },
                  { bg: "rgba(16,185,129,0.22)", border: "rgba(16,185,129,0.45)", text: "#6ee7b7", label: "L5 · Full Mastery" },
                ];
                const c = colors[level] || colors[3];
                return (
                  <div key={level} className="rounded-xl p-3 flex items-center gap-3" style={{ background: c.bg, border: `1px solid ${c.border}` }}>
                    <div className="text-xs font-bold w-28 flex-shrink-0" style={{ color: c.text }}>{c.label}</div>
                    <div className="flex-1 flex flex-wrap gap-1.5 min-h-[28px]">
                      {atLevel.map(s => (
                        <div key={s.id} className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold" style={{ background: "rgba(255,255,255,0.12)", color: "rgba(255,255,255,0.9)" }}>
                          {s.avatar_url
                            ? <img src={s.avatar_url} alt="" className="w-4 h-4 rounded-full object-cover" />
                            : <span style={{ fontSize: 10, opacity: 0.7 }}>{(s.name || "?")[0]}</span>}
                          {s.name}
                        </div>
                      ))}
                      {atLevel.length === 0 && <span className="text-xs opacity-25 self-center italic">empty</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        </div>

        {/* ── STAR Student Schedules ── */}
        {board.students.some(s => board.schedules.some((r: any) => r.student_id === s.id)) && (
          <section className="rounded-2xl p-5" style={glass}>
            <div className={sectionLabel + " mb-4"}>📅 STAR Student Resource Schedules</div>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
              {board.students.map(s => {
                const rows = board.schedules.filter((r: any) => r.student_id === s.id);
                if (rows.length === 0) return null;
                return (
                  <div key={s.id} className="rounded-xl p-3" style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)" }}>
                    <div className="font-bold text-sm mb-2.5 flex items-center gap-2">
                      <div className="w-7 h-7 rounded-full flex items-center justify-center text-sm flex-shrink-0" style={{ background: "rgba(139,92,246,0.45)" }}>
                        {s.avatar_url
                          ? <img src={s.avatar_url} alt="" className="w-full h-full rounded-full object-cover" />
                          : (s.name || "?")[0]}
                      </div>
                      {s.name}
                    </div>
                    <div className="space-y-1.5">
                      {rows.map((r: any) => (
                        <div key={r.id} className="rounded-lg px-2.5 py-1.5 flex items-center gap-2" style={{ background: "rgba(99,102,241,0.18)", border: "1px solid rgba(99,102,241,0.25)" }}>
                          <div className="text-xs font-semibold flex-1 truncate">{r.activity}</div>
                          <div className="text-[10px] font-mono opacity-70 flex-shrink-0">{r.start_time}–{r.end_time}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* ── Specials Today ── */}
        <section className="rounded-2xl p-5" style={glass}>
          <div className="flex items-center gap-3 mb-4">
            <div className={sectionLabel}>✨ Specials Today</div>
            <div className="text-xs px-2.5 py-1 rounded-lg font-bold" style={{ background: "rgba(245,158,11,0.22)", color: "#fbbf24", border: "1px solid rgba(245,158,11,0.35)" }}>
              Day {dayLetter}
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {GRADES.map(grade => {
              const studentsInGrade = board.students.filter((s: any) => s.specials_grade === grade);
              if (studentsInGrade.length === 0) return null;
              const activity = board.specials.find((r: any) => Number(r.grade) === grade && String(r.day_letter).toUpperCase() === dayLetter)?.activity;
              const gc = GRADE_COLORS[grade];
              return (
                <div key={grade} className="rounded-2xl p-4" style={{ background: gc.bg, border: `1px solid ${gc.border}` }}>
                  <div className="flex items-center gap-2 mb-3">
                    <div className="text-xs font-bold" style={{ color: gc.text }}>{grade}th Grade</div>
                    {activity ? (
                      <div className="flex items-center gap-1.5 text-sm font-bold px-3 py-1 rounded-xl" style={{ background: "rgba(255,255,255,0.12)", color: "white" }}>
                        <span>{activityEmoji(activity)}</span>
                        <span>{activity}</span>
                      </div>
                    ) : (
                      <div className="text-xs opacity-35 italic">not set</div>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {studentsInGrade.map((s: any) => (
                      <div key={s.id} className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-semibold" style={{ background: "rgba(255,255,255,0.13)", color: "rgba(255,255,255,0.95)" }}>
                        {s.avatar_url
                          ? <img src={s.avatar_url} alt="" className="w-5 h-5 rounded-full object-cover" />
                          : <span className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] flex-shrink-0" style={{ background: "rgba(255,255,255,0.2)" }}>{(s.name || "?")[0]}</span>}
                        {s.name}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
            {/* Students with no grade set */}
            {board.students.filter((s: any) => !s.specials_grade).length > 0 && (
              <div className="rounded-2xl p-4" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)" }}>
                <div className="text-xs font-bold opacity-40 mb-3">Grade TBD</div>
                <div className="flex flex-wrap gap-2">
                  {board.students.filter((s: any) => !s.specials_grade).map((s: any) => (
                    <div key={s.id} className="px-3 py-1.5 rounded-xl text-sm font-semibold" style={{ background: "rgba(255,255,255,0.08)", opacity: 0.65 }}>
                      {s.name}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </section>

        {/* ── Specials Rotation ── */}
        <section className="rounded-2xl p-5" style={glass}>
          <div className={sectionLabel + " mb-4"}>🗓 Specials Rotation — All Days</div>
          <div className="overflow-x-auto">
            <table className="w-full" style={{ borderCollapse: "separate", borderSpacing: "0 6px" }}>
              <thead>
                <tr>
                  <th className="text-left pb-2 pr-3 text-xs opacity-50 font-semibold uppercase tracking-wider w-20">Grade</th>
                  {DAY_LETTERS.map(d => (
                    <th key={d} className="pb-2 px-2 text-xs font-bold uppercase tracking-wide text-center" style={{
                      color: d === dayLetter ? "#fbbf24" : "rgba(255,255,255,0.45)",
                      fontSize: d === dayLetter ? 13 : 11,
                    }}>
                      {d}{d === dayLetter ? " ●" : ""}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {GRADES.map(grade => {
                  const gc = GRADE_COLORS[grade];
                  return (
                    <tr key={grade}>
                      <td className="pr-3 py-1">
                        <div className="text-sm font-bold px-2 py-1 rounded-lg inline-block" style={{ color: gc.text, background: gc.bg, border: `1px solid ${gc.border}` }}>
                          {grade}th
                        </div>
                      </td>
                      {DAY_LETTERS.map(day => {
                        const c = board.specials.find((r: any) => Number(r.grade) === grade && String(r.day_letter).toUpperCase() === day);
                        const isToday = day === dayLetter;
                        return (
                          <td key={day} className="px-1 py-1">
                            <div className="text-xs font-semibold text-center px-2 py-2 rounded-xl truncate" style={{
                              background: isToday
                                ? (c ? gc.bg : "rgba(255,255,255,0.04)")
                                : "rgba(255,255,255,0.04)",
                              border: isToday ? `1px solid ${gc.border}` : "1px solid rgba(255,255,255,0.07)",
                              color: isToday ? gc.text : "rgba(255,255,255,0.65)",
                              minWidth: 72,
                            }}>
                              {c?.activity
                                ? <>{activityEmoji(c.activity)} {c.activity}</>
                                : <span style={{ opacity: 0.25 }}>—</span>}
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        <div className="pt-2 text-center text-[11px] opacity-30 uppercase tracking-[0.25em]">
          BlockForge · auto-refreshes every 15 seconds
        </div>
      </div>

      {/* ── Floating Music Player ── */}
      {musicPreset && (
        <>
          <iframe
            ref={musicRef}
            title="ambient-music"
            width="1" height="1"
            style={{ position: "fixed", bottom: 0, right: 0, opacity: 0.01, pointerEvents: "none" }}
            src={`https://www.youtube-nocookie.com/embed/${musicPreset.videoId}?autoplay=1&loop=1&playlist=${musicPreset.videoId}&enablejsapi=1`}
            allow="autoplay"
          />
          <div className="fixed bottom-5 left-1/2 -translate-x-1/2 flex items-center gap-3 px-5 py-3 rounded-2xl z-50" style={{
            background: "rgba(15,8,33,0.85)",
            border: "1px solid rgba(255,255,255,0.15)",
            backdropFilter: "blur(16px)",
            boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
          }}>
            <span style={{ fontSize: 20 }}>{musicPreset.emoji}</span>
            <span className="text-sm font-semibold opacity-80">{musicPreset.label}</span>
            <button
              onClick={toggleMusic}
              title={musicPlaying ? "Pause music" : "Play music"}
              className="flex items-center justify-center rounded-xl font-bold transition-all hover:scale-105"
              style={{
                width: 36, height: 36,
                background: musicPlaying ? "rgba(139,92,246,0.35)" : "rgba(255,255,255,0.12)",
                border: "1px solid rgba(255,255,255,0.2)",
                color: "white",
                cursor: "pointer",
                fontSize: 16,
              }}
            >
              {musicPlaying ? "⏸" : "▶"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
