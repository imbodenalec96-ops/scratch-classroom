import React, { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "../lib/api.ts";
import { findCurrentBlock, findNextBlock, type ScheduleBlock } from "../lib/useCurrentBlock.ts";

/**
 * ClassroomBoard — teacher's central classroom control surface, designed
 * for a TV/projector. Ambient background, big block + countdown, editable
 * behavior stars, 1-5 level column, per-student resource-pullout schedules,
 * specials rotation grid, music player, and a footer slot for future modules.
 *
 * Uses editing endpoints only after login; reads are behind auth already
 * because /board sits inside ProtectedRoute.
 *
 * Usage: /board?class=<classId-or-slug>
 */

const DAY_LETTERS = ["A", "B", "C", "D", "E", "F"] as const;
const GRADES = [3, 4, 5] as const;

// Preset ambient YouTube embeds (nocookie). Teachers can switch; volume
// handled via the iframe's native controls.
const MUSIC_PRESETS: { id: string; label: string; videoId: string }[] = [
  { id: "forest",    label: "🌲 Forest",    videoId: "xNN7iTA57jM" },
  { id: "ocean",     label: "🌊 Ocean",     videoId: "MIr3RsUWrdo" },
  { id: "rain",      label: "🌧 Rain",      videoId: "mPZkdNFkNps" },
  { id: "piano",     label: "🎹 Piano",     videoId: "4xDzrJKXOOY" },
  { id: "campfire",  label: "🔥 Campfire",  videoId: "UgHKb_7884o" },
];

// Day letter derived from ISO week-day (Mon=0 → A, Tue=B, ...). Weekends
// fall back to A. Teacher-configurable via setting `day_letter_override`.
function computeDayLetter(now: Date, override?: string): string {
  if (override && /^[A-F]$/i.test(override)) return override.toUpperCase();
  const weekday = (now.getDay() + 6) % 7; // Mon=0..Sun=6
  return DAY_LETTERS[Math.min(weekday, 5)];
}

export default function ClassroomBoard() {
  const [params] = useSearchParams();
  const classParam = (params.get("class") || "").trim().toLowerCase();

  const [cls, setCls] = useState<any | null>(null);
  const [schedule, setSchedule] = useState<ScheduleBlock[]>([]);
  const [board, setBoard] = useState<{ students: any[]; schedules: any[]; specials: any[]; settings: Record<string,string> }>(
    { students: [], schedules: [], specials: [], settings: {} }
  );
  const [presence, setPresence] = useState<any[]>([]);
  const [now, setNow] = useState(new Date());
  const [error, setError] = useState<string | null>(null);
  const [reward, setReward] = useState<{ name: string } | null>(null);
  const [musicId, setMusicId] = useState<string>("");
  const [editingStudent, setEditingStudent] = useState<string | null>(null);
  const [editingSpecials, setEditingSpecials] = useState<boolean>(false);

  // Tick clock every 15s
  useEffect(() => {
    const iv = setInterval(() => setNow(new Date()), 15_000);
    return () => clearInterval(iv);
  }, []);

  // Resolve class
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

  // Fetch schedule + board data + presence; poll every 15s
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
        if (d?.settings?.music_playlist_id && !musicId) setMusicId(d.settings.music_playlist_id);
      }).catch(() => {});
      api.getClassPresence(cls.id).then((rows) => { if (!cancelled) setPresence(Array.isArray(rows) ? rows : []); }).catch(() => {});
    };
    load();
    const iv = setInterval(load, 15_000);
    return () => { cancelled = true; clearInterval(iv); };
  }, [cls?.id]);

  const currentBlock = useMemo(() => findCurrentBlock(schedule, now), [schedule, now]);
  const nextBlock    = useMemo(() => findNextBlock(schedule, now), [schedule, now]);
  const presenceById = useMemo(() => {
    const m = new Map<string, any>();
    presence.forEach((p: any) => m.set(p.user_id || p.id, p));
    return m;
  }, [presence]);

  const timeStr = now.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  const dateStr = now.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" });
  const dayLetter = computeDayLetter(now, board.settings?.current_specials_day);
  const [editingSpecialist, setEditingSpecialist] = useState(false);
  const [specialistDraft, setSpecialistDraft] = useState("");

  const saveDayLetter = async (letter: string) => {
    setBoard(b => ({ ...b, settings: { ...b.settings, current_specials_day: letter } }));
    try { await api.saveBoardSetting("current_specials_day", letter); } catch {}
  };
  const saveSpecialist = async (name: string) => {
    setBoard(b => ({ ...b, settings: { ...b.settings, specialist_name: name } }));
    try { await api.saveBoardSetting("specialist_name", name); } catch {}
  };

  // Countdown to next block boundary
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

  // ── Actions ──
  const bumpStars = async (s: any, delta: number) => {
    try {
      const r: any = await api.bumpStudentStars(s.id, delta);
      setBoard(b => ({
        ...b,
        students: b.students.map(x => x.id === s.id ? { ...x, behavior_stars: r.behavior_stars, reward_count: r.reward_count } : x),
      }));
      if (r.rewardFired) {
        setReward({ name: s.name });
        setTimeout(() => setReward(null), 4000);
      }
    } catch {}
  };

  const setLevel = async (s: any, level: number) => {
    const lv = Math.max(1, Math.min(5, level));
    try {
      await api.setStudentLevel(s.id, lv);
      setBoard(b => ({
        ...b,
        students: b.students.map(x => x.id === s.id ? { ...x, level: lv } : x),
      }));
    } catch {}
  };

  const pickMusic = async (id: string) => {
    setMusicId(id);
    try { await api.saveBoardSetting("music_playlist_id", id); } catch {}
  };

  if (error) {
    return <div className="min-h-screen flex items-center justify-center bg-black text-red-400 text-2xl">{error}</div>;
  }
  if (!cls) {
    return <div className="min-h-screen flex items-center justify-center bg-black text-white/60 text-2xl">Loading classroom board…</div>;
  }

  const bg = board.settings?.background_image_url ||
    // Default sunset/campfire vibe gradient
    "linear-gradient(135deg, #1a0a35 0%, #3a1f5e 35%, #7a3e1f 65%, #2a1008 100%)";

  const musicVideoId = MUSIC_PRESETS.find(p => p.id === musicId)?.videoId;

  return (
    <div className="min-h-screen relative" style={{
      background: board.settings?.background_image_url ? `url(${bg}) center/cover no-repeat` : bg,
      color: "white",
      fontFamily: "system-ui, -apple-system, sans-serif",
    }}>
      {/* Dim overlay for text readability */}
      <div className="absolute inset-0 pointer-events-none" style={{ background: "rgba(5,5,20,0.55)" }} />

      <div className="relative p-8 space-y-6">

        {/* Reward celebration banner */}
        {reward && (
          <div className="fixed inset-0 flex items-center justify-center z-50 pointer-events-none animate-pulse">
            <div className="px-14 py-10 rounded-3xl text-center shadow-2xl"
              style={{ background: "linear-gradient(135deg, #f59e0b, #dc2626)", boxShadow: "0 0 120px rgba(245,158,11,0.8)" }}>
              <div style={{ fontSize: 92 }}>🎉</div>
              <div style={{ fontSize: 48, fontWeight: 900, letterSpacing: "-0.02em" }}>
                {reward.name} earned McDonald's!
              </div>
              <div className="opacity-80 mt-2 text-xl">Stars reset — back to 0 ⭐</div>
            </div>
          </div>
        )}

        {/* Header */}
        <div className="flex items-end justify-between gap-4 flex-wrap border-b pb-5" style={{ borderColor: "rgba(255,255,255,0.12)" }}>
          <div>
            <div className="text-xs uppercase tracking-[0.25em] opacity-60 mb-2">BlockForge · Classroom Control</div>
            <h1 style={{ fontSize: 56, fontWeight: 900, lineHeight: 1, letterSpacing: "-0.02em" }}>{cls.name}</h1>
            <div className="mt-2 text-base opacity-80 flex items-center gap-2 flex-wrap">
              <span>{dateStr} ·</span>
              <label className="flex items-center gap-1.5 rounded-md px-2 py-0.5" style={{ background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.15)" }}>
                <span className="opacity-70 text-sm">Day</span>
                <select
                  value={dayLetter}
                  onChange={e => saveDayLetter(e.target.value)}
                  className="bg-transparent font-mono font-bold outline-none cursor-pointer"
                  style={{ color: "white" }}
                  title="Set today's rotation day"
                >
                  {DAY_LETTERS.map(d => <option key={d} value={d} style={{ color: "black" }}>{d}</option>)}
                </select>
              </label>
            </div>
          </div>
          <div className="flex items-center gap-5">
            {/* Music player */}
            <div className="flex items-center gap-2 rounded-xl px-3 py-2" style={{ background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.15)" }}>
              <span className="text-sm opacity-70">🎵</span>
              <select
                value={musicId}
                onChange={(e) => pickMusic(e.target.value)}
                className="bg-transparent text-sm outline-none cursor-pointer"
                style={{ color: "white" }}
              >
                <option value="" style={{ color: "black" }}>— No music —</option>
                {MUSIC_PRESETS.map(p => (
                  <option key={p.id} value={p.id} style={{ color: "black" }}>{p.label}</option>
                ))}
              </select>
            </div>
            <div className="text-right">
              <div style={{ fontSize: 56, fontWeight: 800, fontVariantNumeric: "tabular-nums", letterSpacing: "-0.03em" }}>{timeStr}</div>
            </div>
          </div>
        </div>

        {/* Hidden audio player (YouTube iframe) */}
        {musicVideoId && (
          <iframe
            title="ambient-music"
            width="1" height="1"
            style={{ position: "fixed", bottom: 0, right: 0, opacity: 0.01, pointerEvents: "auto" }}
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
              {nextBlock.daysAway > 0 && <span className="ml-2 opacity-60">(+{nextBlock.daysAway}d)</span>}
            </div>
          )}
        </section>

        {/* Specialist slot (11 AM prep) */}
        <section className="rounded-2xl p-5 flex items-center gap-5 flex-wrap" style={{
          background: "linear-gradient(135deg, rgba(245,158,11,0.16), rgba(251,191,36,0.08))",
          border: "1px solid rgba(245,158,11,0.3)",
          backdropFilter: "blur(6px)",
        }}>
          <div className="text-3xl">🕚</div>
          <div className="flex-1 min-w-[200px]">
            <div className="text-xs uppercase tracking-[0.25em] opacity-60">11:00 AM · Specialist in Room</div>
            {editingSpecialist ? (
              <div className="flex gap-2 mt-1.5">
                <input
                  autoFocus
                  value={specialistDraft}
                  onChange={e => setSpecialistDraft(e.target.value)}
                  placeholder="Specialist name"
                  className="flex-1 rounded px-2 py-1 text-lg font-bold outline-none"
                  style={{ background: "rgba(0,0,0,0.3)", color: "white", border: "1px solid rgba(255,255,255,0.2)" }}
                />
                <button onClick={() => { saveSpecialist(specialistDraft.trim()); setEditingSpecialist(false); }}
                  className="text-sm px-3 py-1 rounded-md font-bold" style={{ background: "rgba(139,92,246,0.4)" }}>Save</button>
                <button onClick={() => setEditingSpecialist(false)}
                  className="text-sm px-3 py-1 rounded-md opacity-70 hover:opacity-100" style={{ background: "rgba(255,255,255,0.1)" }}>Cancel</button>
              </div>
            ) : (
              <button
                onClick={() => { setSpecialistDraft(board.settings?.specialist_name || ""); setEditingSpecialist(true); }}
                className="text-left mt-1 hover:opacity-80 transition"
                style={{ fontSize: 28, fontWeight: 800, letterSpacing: "-0.01em" }}
                title="Click to rename specialist"
              >
                {board.settings?.specialist_name || <span className="opacity-50 italic">— tap to add name —</span>}
              </button>
            )}
          </div>
          <div className="text-xs opacity-60 max-w-[220px]">
            Full specialist schedule coming soon — send the weekly rotation and this card expands into a per-day list.
          </div>
        </section>

        {/* Stars + Levels side-by-side */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {/* Behavior Stars */}
          <section className="rounded-2xl p-5" style={{ background: "rgba(10,10,25,0.55)", border: "1px solid rgba(255,255,255,0.1)", backdropFilter: "blur(6px)" }}>
            <div className="flex items-baseline justify-between mb-3">
              <div>
                <div className="text-xs uppercase tracking-[0.25em] opacity-60">Behavior Stars</div>
                <div className="text-sm opacity-60 mt-1">10 stars → McDonald's · auto-reset</div>
              </div>
              <div className="text-xs opacity-50">{board.students.length} students</div>
            </div>
            <div className="space-y-2 max-h-[480px] overflow-y-auto pr-1">
              {board.students.map(s => (
                <StudentStarRow key={s.id} student={s} onBump={(d) => bumpStars(s, d)} />
              ))}
              {board.students.length === 0 && (
                <div className="text-sm opacity-50 py-8 text-center">No students found in this class.</div>
              )}
            </div>
          </section>

          {/* Levels 1-5 */}
          <section className="rounded-2xl p-5" style={{ background: "rgba(10,10,25,0.55)", border: "1px solid rgba(255,255,255,0.1)", backdropFilter: "blur(6px)" }}>
            <div className="mb-3">
              <div className="text-xs uppercase tracking-[0.25em] opacity-60">Independence Levels</div>
              <div className="text-sm opacity-60 mt-1">1 = most supervision · 5 = full independence</div>
            </div>
            <div className="space-y-2">
              {[1,2,3,4,5].map(level => {
                const atLevel = board.students.filter(s => (s.level || 1) === level);
                return (
                  <div key={level} className="rounded-xl p-3" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
                    <div className="flex items-center gap-3">
                      <div className="font-bold text-lg w-10 flex-shrink-0" style={{ color: level >= 4 ? "#86efac" : level >= 2 ? "#fde68a" : "#fca5a5" }}>
                        L{level}
                      </div>
                      <div className="flex-1 flex flex-wrap gap-1.5 min-h-[38px]">
                        {atLevel.map(s => (
                          <div key={s.id} className="group flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-semibold" style={{ background: "rgba(139,92,246,0.22)" }}>
                            <span>{s.avatar_emoji || "🙂"}</span>
                            <span className="truncate max-w-[90px]">{s.name}</span>
                            <button onClick={() => setLevel(s, level - 1)} disabled={level <= 1}
                              className="opacity-50 group-hover:opacity-100 hover:text-white transition" title="Level down">↓</button>
                            <button onClick={() => setLevel(s, level + 1)} disabled={level >= 5}
                              className="opacity-50 group-hover:opacity-100 hover:text-white transition" title="Level up">↑</button>
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

        {/* Resource Schedules + Specials Rotation */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {/* Schedules (2 cols) */}
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
                    <div className="flex items-center justify-between mb-2">
                      <div className="font-bold text-sm">{s.avatar_emoji} {s.name}</div>
                      <button onClick={() => setEditingStudent(editingStudent === s.id ? null : s.id)}
                        className="text-xs px-2 py-1 rounded-md opacity-70 hover:opacity-100 transition"
                        style={{ background: "rgba(255,255,255,0.08)" }}>
                        {editingStudent === s.id ? "Done" : "Edit"}
                      </button>
                    </div>
                    {editingStudent === s.id ? (
                      <ScheduleEditor
                        studentId={s.id}
                        initial={rows}
                        onSave={(saved) => {
                          setBoard(b => ({
                            ...b,
                            schedules: [
                              ...b.schedules.filter((r: any) => r.student_id !== s.id),
                              ...saved,
                            ],
                          }));
                          setEditingStudent(null);
                        }}
                      />
                    ) : rows.length === 0 ? (
                      <div className="text-xs opacity-40 italic py-2">No resource pullouts yet.</div>
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

          {/* Specials Rotation */}
          <section className="rounded-2xl p-5" style={{ background: "rgba(10,10,25,0.55)", border: "1px solid rgba(255,255,255,0.1)", backdropFilter: "blur(6px)" }}>
            <div className="flex items-baseline justify-between mb-3">
              <div>
                <div className="text-xs uppercase tracking-[0.25em] opacity-60">Specials Rotation</div>
                <div className="text-sm opacity-60 mt-1">Grades 3–5 · Days A–F</div>
              </div>
              <button onClick={() => setEditingSpecials(v => !v)}
                className="text-xs px-2 py-1 rounded-md opacity-70 hover:opacity-100 transition"
                style={{ background: "rgba(255,255,255,0.08)" }}>
                {editingSpecials ? "Done" : "Edit"}
              </button>
            </div>
            <SpecialsGrid
              specials={board.specials}
              dayLetter={dayLetter}
              editing={editingSpecials}
              onSave={(grade, rows) => {
                setBoard(b => ({
                  ...b,
                  specials: [
                    ...b.specials.filter((r: any) => r.grade !== grade),
                    ...rows,
                  ],
                }));
              }}
            />
          </section>
        </div>

        {/* Placeholder for future modules */}
        <section data-slot="board-modules" className="rounded-2xl p-5" style={{ background: "rgba(255,255,255,0.03)", border: "1px dashed rgba(255,255,255,0.12)" }}>
          <div className="text-xs uppercase tracking-[0.25em] opacity-50">Modules</div>
          <div className="text-sm opacity-40 mt-2">Reserved space for future classroom control widgets.</div>
        </section>

        {/* Footer */}
        <div className="pt-4 text-center text-xs opacity-40 uppercase tracking-[0.2em]">
          BlockForge · auto-refreshes every 15 seconds
        </div>
      </div>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────

function StudentStarRow({ student, onBump }: { student: any; onBump: (delta: number) => void }) {
  const stars = Math.max(0, Math.min(10, student.behavior_stars || 0));
  return (
    <div className="rounded-xl p-2.5 flex items-center gap-3" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
      <div className="w-9 h-9 rounded-full flex items-center justify-center text-lg flex-shrink-0" style={{ background: "linear-gradient(135deg, rgba(139,92,246,0.4), rgba(99,102,241,0.3))" }}>
        {student.avatar_emoji || "🙂"}
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-bold text-sm truncate">{student.name}</div>
        <div className="flex items-center gap-0.5 mt-0.5">
          {Array.from({ length: 10 }, (_, i) => (
            <span key={i} style={{ fontSize: 14, opacity: i < stars ? 1 : 0.2, filter: i < stars ? "none" : "grayscale(1)" }}>⭐</span>
          ))}
        </div>
      </div>
      {student.reward_count > 0 && (
        <div className="text-xs px-2 py-1 rounded-full font-bold" style={{ background: "rgba(245,158,11,0.25)", color: "#fcd34d" }}>
          🏆 {student.reward_count}
        </div>
      )}
      <div className="flex gap-1">
        <button onClick={() => onBump(-1)} className="w-8 h-8 rounded-lg font-bold text-sm hover:scale-110 transition" style={{ background: "rgba(239,68,68,0.25)", color: "#fca5a5" }}>−</button>
        <button onClick={() => onBump(1)}  className="w-8 h-8 rounded-lg font-bold text-sm hover:scale-110 transition" style={{ background: "rgba(34,197,94,0.25)", color: "#86efac" }}>+</button>
      </div>
    </div>
  );
}

function ScheduleEditor({ studentId, initial, onSave }: { studentId: string; initial: any[]; onSave: (saved: any[]) => void }) {
  const [rows, setRows] = useState<any[]>(() =>
    initial.length
      ? initial.map(r => ({ ...r }))
      : [{ activity: "", start_time: "", end_time: "", classroom: "", active_days: "Mon,Tue,Wed,Thu,Fri" }]
  );

  const update = (i: number, patch: any) => setRows(rs => rs.map((r, idx) => idx === i ? { ...r, ...patch } : r));
  const add = () => setRows(rs => [...rs, { activity: "", start_time: "", end_time: "", classroom: "", active_days: "Mon,Tue,Wed,Thu,Fri" }]);
  const remove = (i: number) => setRows(rs => rs.filter((_, idx) => idx !== i));
  const save = async () => {
    const clean = rows.filter(r => (r.activity || "").trim());
    const saved = await api.saveResourceSchedule(studentId, clean);
    onSave(Array.isArray(saved) ? saved : []);
  };

  return (
    <div className="space-y-2">
      {rows.map((r, i) => (
        <div key={i} className="grid grid-cols-[1fr_70px_70px_1fr_auto] gap-1 items-center">
          <input value={r.activity || ""} onChange={e => update(i, { activity: e.target.value })}
            placeholder="Activity" className="text-xs rounded px-1.5 py-1 outline-none" style={{ background: "rgba(0,0,0,0.3)", color: "white", border: "1px solid rgba(255,255,255,0.1)" }}/>
          <input value={r.start_time || ""} onChange={e => update(i, { start_time: e.target.value })}
            placeholder="09:00" className="text-xs rounded px-1.5 py-1 outline-none font-mono" style={{ background: "rgba(0,0,0,0.3)", color: "white", border: "1px solid rgba(255,255,255,0.1)" }}/>
          <input value={r.end_time || ""} onChange={e => update(i, { end_time: e.target.value })}
            placeholder="09:30" className="text-xs rounded px-1.5 py-1 outline-none font-mono" style={{ background: "rgba(0,0,0,0.3)", color: "white", border: "1px solid rgba(255,255,255,0.1)" }}/>
          <input value={r.classroom || ""} onChange={e => update(i, { classroom: e.target.value })}
            placeholder="Room" className="text-xs rounded px-1.5 py-1 outline-none" style={{ background: "rgba(0,0,0,0.3)", color: "white", border: "1px solid rgba(255,255,255,0.1)" }}/>
          <button onClick={() => remove(i)} className="text-xs opacity-60 hover:opacity-100 px-1">✕</button>
        </div>
      ))}
      <div className="flex gap-2 pt-1">
        <button onClick={add}  className="text-xs px-2 py-1 rounded-md opacity-80 hover:opacity-100" style={{ background: "rgba(255,255,255,0.08)" }}>+ Row</button>
        <button onClick={save} className="text-xs px-3 py-1 rounded-md font-bold" style={{ background: "rgba(139,92,246,0.4)" }}>Save</button>
      </div>
    </div>
  );
}

function SpecialsGrid({ specials, dayLetter, editing, onSave }: {
  specials: any[]; dayLetter: string; editing: boolean; onSave: (grade: number, rows: any[]) => void;
}) {
  // Build lookup: grade → dayLetter → cell
  const cell = (grade: number, day: string) =>
    specials.find((r: any) => r.grade === grade && String(r.day_letter).toUpperCase() === day);

  const [draft, setDraft] = useState<Record<string, { activity: string; classroom: string }>>({});
  useEffect(() => { setDraft({}); }, [editing]);

  const saveGrade = async (grade: number) => {
    const rows = DAY_LETTERS.map(day => {
      const key = `${grade}:${day}`;
      const existing = cell(grade, day);
      const d = draft[key];
      return d ? { day_letter: day, activity: d.activity, classroom: d.classroom, grade }
               : existing ? { day_letter: day, activity: existing.activity, classroom: existing.classroom, grade } : null;
    }).filter(Boolean) as any[];
    const saved = await api.saveSpecialsRotation(grade, rows);
    onSave(grade, Array.isArray(saved) ? saved : []);
  };

  return (
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
            {editing && <th />}
          </tr>
        </thead>
        <tbody>
          {GRADES.map(grade => (
            <tr key={grade} className="border-t" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
              <td className="py-2 pr-2 font-bold opacity-80">{grade}</td>
              {DAY_LETTERS.map(day => {
                const c = cell(grade, day);
                const key = `${grade}:${day}`;
                if (editing) {
                  const d = draft[key] ?? { activity: c?.activity || "", classroom: c?.classroom || "" };
                  return (
                    <td key={day} className="p-0.5">
                      <input
                        value={d.activity}
                        onChange={e => setDraft(x => ({ ...x, [key]: { ...d, activity: e.target.value } }))}
                        placeholder="—"
                        className="w-full text-center text-[10px] rounded px-1 py-0.5 outline-none"
                        style={{ background: "rgba(0,0,0,0.3)", color: "white", border: "1px solid rgba(255,255,255,0.1)" }}
                      />
                    </td>
                  );
                }
                return (
                  <td key={day} className={`text-center py-2 px-1 ${day === dayLetter ? "font-bold" : "opacity-75"}`}>
                    {c?.activity || <span className="opacity-30">—</span>}
                  </td>
                );
              })}
              {editing && (
                <td className="pl-2">
                  <button onClick={() => saveGrade(grade)} className="text-[10px] px-2 py-1 rounded font-bold" style={{ background: "rgba(139,92,246,0.4)" }}>Save</button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
