import React, { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "../lib/api.ts";
import { findCurrentBlock, findNextBlock, type ScheduleBlock } from "../lib/useCurrentBlock.ts";

/**
 * ClassroomBoard — student-facing TV/projector view. READ-ONLY.
 * All editing happens in /teacher/board-settings. The board polls every 15s
 * and shows whatever the teacher has configured.
 *
 * Usage: /board?class=<classId-or-slug>
 */

const DAY_LETTERS = ["A", "B", "C", "D", "E", "F"] as const;
const GRADES = [3, 4, 5] as const;

const MUSIC_PRESETS: { id: string; label: string; videoId: string }[] = [
  { id: "forest",    label: "🌲 Forest",    videoId: "xNN7iTA57jM" },
  { id: "ocean",     label: "🌊 Ocean",     videoId: "MIr3RsUWrdo" },
  { id: "rain",      label: "🌧 Rain",      videoId: "mPZkdNFkNps" },
  { id: "piano",     label: "🎹 Piano",     videoId: "4xDzrJKXOOY" },
  { id: "campfire",  label: "🔥 Campfire",  videoId: "UgHKb_7884o" },
];

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
  const bg = bgUrl || "linear-gradient(135deg, #1a0a35 0%, #3a1f5e 35%, #7a3e1f 65%, #2a1008 100%)";
  const musicId = board.settings?.music_playlist_id || "";
  const musicVideoId = MUSIC_PRESETS.find(p => p.id === musicId)?.videoId;

  return (
    <div className="min-h-screen relative" style={{
      background: bgUrl ? `url(${bgUrl}) center/cover no-repeat` : bg,
      color: "white",
      fontFamily: "system-ui, -apple-system, sans-serif",
    }}>
      <div className="absolute inset-0 pointer-events-none" style={{ background: "rgba(5,5,20,0.55)" }} />

      <div className="relative p-8 space-y-6">
        {/* Header */}
        <div className="flex items-end justify-between gap-4 flex-wrap border-b pb-5" style={{ borderColor: "rgba(255,255,255,0.12)" }}>
          <div>
            <div className="text-xs uppercase tracking-[0.25em] opacity-60 mb-2">BlockForge · Classroom</div>
            <h1 style={{ fontSize: 56, fontWeight: 900, lineHeight: 1, letterSpacing: "-0.02em" }}>{cls.name}</h1>
            <div className="mt-2 text-base opacity-80">
              {dateStr} · <span className="font-mono font-bold">Day {dayLetter}</span>
            </div>
          </div>
          <div className="text-right">
            <div style={{ fontSize: 56, fontWeight: 800, fontVariantNumeric: "tabular-nums", letterSpacing: "-0.03em" }}>{timeStr}</div>
          </div>
        </div>

        {/* Hidden autoplay music */}
        {musicVideoId && (
          <iframe
            title="ambient-music"
            width="1" height="1"
            style={{ position: "fixed", bottom: 0, right: 0, opacity: 0.01 }}
            src={`https://www.youtube-nocookie.com/embed/${musicVideoId}?autoplay=1&loop=1&playlist=${musicVideoId}`}
            allow="autoplay"
          />
        )}

        {/* Current block */}
        <section className="rounded-3xl p-7" style={{
          background: currentBlock
            ? "linear-gradient(135deg, rgba(139,92,246,0.28), rgba(99,102,241,0.16))"
            : "rgba(255,255,255,0.06)",
          border: "1px solid rgba(139,92,246,0.35)",
          backdropFilter: "blur(8px)",
        }}>
          <div className="text-xs uppercase tracking-[0.25em] opacity-60 mb-3">Right now</div>
          {currentBlock ? (
            <div className="flex items-baseline gap-6 flex-wrap">
              <div style={{ fontSize: 72, fontWeight: 900, letterSpacing: "-0.03em" }}>
                {currentBlock.label || currentBlock.subject}
              </div>
              <div className="opacity-80 text-2xl font-mono">{currentBlock.start_time}–{currentBlock.end_time}</div>
              {countdown && (
                <div className="px-4 py-2 rounded-full text-xl font-bold font-mono" style={{ background: "rgba(0,0,0,0.3)" }}>
                  ⏱ {countdown}
                </div>
              )}
              {currentBlock.is_break && (
                <div className="px-4 py-2 rounded-full text-base font-bold" style={{ background: "rgba(34,197,94,0.25)", color: "#86efac" }}>☕ Break</div>
              )}
            </div>
          ) : (
            <div style={{ fontSize: 40, fontWeight: 800, opacity: 0.6 }}>No active block</div>
          )}
          {nextBlock && (
            <div className="mt-4 text-sm opacity-70">
              Up next: <span className="font-bold">{nextBlock.block.label || nextBlock.block.subject}</span> at {nextBlock.block.start_time}
            </div>
          )}
        </section>

        {/* Specialist slot */}
        <section className="rounded-2xl p-5 flex items-center gap-5 flex-wrap" style={{
          background: "linear-gradient(135deg, rgba(245,158,11,0.16), rgba(251,191,36,0.08))",
          border: "1px solid rgba(245,158,11,0.3)",
          backdropFilter: "blur(6px)",
        }}>
          <div className="text-3xl">🕚</div>
          <div className="flex-1 min-w-[200px]">
            <div className="text-xs uppercase tracking-[0.25em] opacity-60">11:00 AM · Specialist in Room</div>
            <div className="mt-1" style={{ fontSize: 28, fontWeight: 800 }}>
              {board.settings?.specialist_name || <span className="opacity-40 italic">— not set —</span>}
            </div>
          </div>
        </section>

        {/* Stars + Levels */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <section className="rounded-2xl p-5" style={{ background: "rgba(10,10,25,0.55)", border: "1px solid rgba(255,255,255,0.1)", backdropFilter: "blur(6px)" }}>
            <div className="mb-3">
              <div className="text-xs uppercase tracking-[0.25em] opacity-60">Behavior Stars</div>
              <div className="text-sm opacity-60 mt-1">10 stars → McDonald's · resets automatically</div>
            </div>
            <div className="space-y-2 max-h-[480px] overflow-y-auto pr-1">
              {board.students.map(s => {
                const stars = Math.max(0, Math.min(10, s.behavior_stars || 0));
                return (
                  <div key={s.id} className="rounded-xl p-2.5 flex items-center gap-3" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
                    <div className="w-9 h-9 rounded-full flex items-center justify-center text-lg flex-shrink-0" style={{ background: "linear-gradient(135deg, rgba(139,92,246,0.4), rgba(99,102,241,0.3))" }}>
                      {s.avatar_emoji || "🙂"}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-bold text-sm truncate">{s.name}</div>
                      <div className="flex items-center gap-0.5 mt-0.5">
                        {Array.from({ length: 10 }, (_, i) => (
                          <span key={i} style={{ fontSize: 14, opacity: i < stars ? 1 : 0.2, filter: i < stars ? "none" : "grayscale(1)" }}>⭐</span>
                        ))}
                      </div>
                    </div>
                    {s.reward_count > 0 && (
                      <div className="text-xs px-2 py-1 rounded-full font-bold" style={{ background: "rgba(245,158,11,0.25)", color: "#fcd34d" }}>
                        🏆 {s.reward_count}
                      </div>
                    )}
                  </div>
                );
              })}
              {board.students.length === 0 && (
                <div className="text-sm opacity-50 py-8 text-center">No students yet.</div>
              )}
            </div>
          </section>

          <section className="rounded-2xl p-5" style={{ background: "rgba(10,10,25,0.55)", border: "1px solid rgba(255,255,255,0.1)", backdropFilter: "blur(6px)" }}>
            <div className="mb-3">
              <div className="text-xs uppercase tracking-[0.25em] opacity-60">Independence Levels</div>
              <div className="text-sm opacity-60 mt-1">1 = most support · 5 = full independence</div>
            </div>
            <div className="space-y-2">
              {[1,2,3,4,5].map(level => {
                const atLevel = board.students.filter(s => (s.level || 1) === level);
                return (
                  <div key={level} className="rounded-xl p-3" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
                    <div className="flex items-center gap-3">
                      <div className="font-bold text-lg w-10 flex-shrink-0" style={{ color: level >= 4 ? "#86efac" : level >= 2 ? "#fde68a" : "#fca5a5" }}>L{level}</div>
                      <div className="flex-1 flex flex-wrap gap-1.5 min-h-[38px]">
                        {atLevel.map(s => (
                          <div key={s.id} className="flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-semibold" style={{ background: "rgba(139,92,246,0.22)" }}>
                            <span>{s.avatar_emoji || "🙂"}</span>
                            <span className="truncate max-w-[90px]">{s.name}</span>
                          </div>
                        ))}
                        {atLevel.length === 0 && <span className="opacity-30 text-xs self-center">— empty —</span>}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        </div>

        {/* Schedules + Specials */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <section className="lg:col-span-2 rounded-2xl p-5" style={{ background: "rgba(10,10,25,0.55)", border: "1px solid rgba(255,255,255,0.1)", backdropFilter: "blur(6px)" }}>
            <div className="mb-3">
              <div className="text-xs uppercase tracking-[0.25em] opacity-60">STAR Student Schedules</div>
              <div className="text-sm opacity-60 mt-1">Resource pullouts · activity · time · classroom</div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {board.students.map(s => {
                const rows = board.schedules.filter((r: any) => r.student_id === s.id);
                return (
                  <div key={s.id} className="rounded-xl p-3" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
                    <div className="font-bold text-sm mb-2">{s.avatar_emoji} {s.name}</div>
                    {rows.length === 0 ? (
                      <div className="text-xs opacity-40 italic py-2">No resource pullouts.</div>
                    ) : (
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="opacity-50 uppercase tracking-wider">
                            <th className="text-left font-medium pb-1">Activity</th>
                            <th className="text-left font-medium pb-1">Time</th>
                            <th className="text-left font-medium pb-1">Room</th>
                          </tr>
                        </thead>
                        <tbody>
                          {rows.map((r: any) => (
                            <tr key={r.id} className="border-t" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
                              <td className="py-1 pr-2 font-semibold">{r.activity}</td>
                              <td className="py-1 pr-2 font-mono">{r.start_time}–{r.end_time}</td>
                              <td className="py-1 opacity-80">{r.classroom}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                );
              })}
            </div>
          </section>

          <section className="rounded-2xl p-5" style={{ background: "rgba(10,10,25,0.55)", border: "1px solid rgba(255,255,255,0.1)", backdropFilter: "blur(6px)" }}>
            <div className="mb-3">
              <div className="text-xs uppercase tracking-[0.25em] opacity-60">Specials Rotation</div>
              <div className="text-sm opacity-60 mt-1">Grades 3–5 · Days A–F</div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="opacity-60 uppercase tracking-wider">
                    <th className="text-left font-medium pb-2 pr-2">Grade</th>
                    {DAY_LETTERS.map(d => (
                      <th key={d} className={`text-center font-medium pb-2 px-1 ${d === dayLetter ? "text-amber-300" : ""}`}>
                        {d}{d === dayLetter ? " ●" : ""}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {GRADES.map(grade => (
                    <tr key={grade} className="border-t" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
                      <td className="py-2 pr-2 font-bold opacity-80">{grade}</td>
                      {DAY_LETTERS.map(day => {
                        const c = board.specials.find((r: any) => r.grade === grade && String(r.day_letter).toUpperCase() === day);
                        return (
                          <td key={day} className={`text-center py-2 px-1 ${day === dayLetter ? "font-bold" : "opacity-75"}`}>
                            {c?.activity || <span className="opacity-30">—</span>}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>

        <section data-slot="board-modules" className="rounded-2xl p-5" style={{ background: "rgba(255,255,255,0.03)", border: "1px dashed rgba(255,255,255,0.12)" }}>
          <div className="text-xs uppercase tracking-[0.25em] opacity-50">Modules</div>
          <div className="text-sm opacity-40 mt-2">Reserved space for future classroom widgets.</div>
        </section>

        <div className="pt-4 text-center text-xs opacity-40 uppercase tracking-[0.2em]">
          BlockForge · auto-refreshes every 15 seconds
        </div>
      </div>
    </div>
  );
}
