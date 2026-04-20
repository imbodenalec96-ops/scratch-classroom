import React, { useEffect, useState } from "react";
import { api } from "../lib/api.ts";
import { useTheme } from "../lib/theme.tsx";
import {
  Tv, Star, ArrowUp, ArrowDown, Music,
  CalendarDays, Plus, Trash2, ExternalLink, Printer, Users,
  ChevronDown, ChevronUp,
} from "lucide-react";

const DAY_LETTERS = ["A", "B", "C", "D", "E", "F"] as const;
const GRADES = [3, 4, 5] as const;

const MUSIC_PRESETS = [
  { id: "",         label: "No music" },
  { id: "forest",   label: "Forest" },
  { id: "ocean",    label: "Ocean" },
  { id: "rain",     label: "Rain" },
  { id: "piano",    label: "Piano" },
  { id: "campfire", label: "Campfire" },
];

const MUSIC_ICONS: Record<string, string> = {
  forest: "🌲", ocean: "🌊", rain: "🌧", piano: "🎹", campfire: "🔥",
};

const LEVEL_COLORS: Record<number, { bg: string; text: string; border: string }> = {
  1: { bg: "rgba(239,68,68,0.1)",   text: "#f87171", border: "rgba(239,68,68,0.25)" },
  2: { bg: "rgba(251,146,60,0.1)",  text: "#fb923c", border: "rgba(251,146,60,0.25)" },
  3: { bg: "rgba(234,179,8,0.1)",   text: "#facc15", border: "rgba(234,179,8,0.25)" },
  4: { bg: "rgba(34,197,94,0.1)",   text: "#4ade80", border: "rgba(34,197,94,0.25)" },
  5: { bg: "rgba(16,185,129,0.12)", text: "#34d399", border: "rgba(16,185,129,0.3)" },
};

const LEVEL_LABELS: Record<number, string> = {
  1: "Most Support",
  2: "Guided",
  3: "Developing",
  4: "Independent",
  5: "Full Independence",
};

export default function TeacherBoardSettings() {
  const { theme } = useTheme();
  const dk = theme === "dark";
  const [classes, setClasses] = useState<any[]>([]);
  const [classId, setClassId] = useState<string>("");
  const [board, setBoard] = useState<{ students: any[]; schedules: any[]; specials: any[]; settings: Record<string, string> }>(
    { students: [], schedules: [], specials: [], settings: {} }
  );
  const [loading, setLoading] = useState(false);
  const [rewardFlash, setRewardFlash] = useState<string | null>(null);

  useEffect(() => {
    api.getClasses().then((cs: any[]) => {
      setClasses(cs || []);
      if ((cs || []).length && !classId) setClassId(cs[0].id);
    }).catch(() => {});
  }, []);

  const load = async () => {
    if (!classId) return;
    setLoading(true);
    try {
      const d: any = await api.getBoardData(classId);
      setBoard({
        students: d?.students || [],
        schedules: d?.schedules || [],
        specials: d?.specials || [],
        settings: d?.settings || {},
      });
    } catch {}
    setLoading(false);
  };
  useEffect(() => { load(); }, [classId]);

  const bumpStars = async (s: any, delta: number) => {
    try {
      const r: any = await api.bumpStudentStars(s.id, delta);
      setBoard(b => ({
        ...b,
        students: b.students.map(x => x.id === s.id ? { ...x, behavior_stars: r.behavior_stars, reward_count: r.reward_count } : x),
      }));
      if (r.rewardFired) {
        setRewardFlash(s.name);
        setTimeout(() => setRewardFlash(null), 3500);
      }
    } catch {}
  };

  const setLevel = async (s: any, level: number) => {
    const lv = Math.max(1, Math.min(5, level));
    try {
      await api.setStudentLevel(s.id, lv);
      setBoard(b => ({ ...b, students: b.students.map(x => x.id === s.id ? { ...x, level: lv } : x) }));
    } catch {}
  };

  const togglePaperOnly = async (s: any) => {
    const next = !s.paper_only;
    setBoard(b => ({ ...b, students: b.students.map(x => x.id === s.id ? { ...x, paper_only: next ? 1 : 0 } : x) }));
    try { await api.setStudentPaperOnly(s.id, next); } catch {
      setBoard(b => ({ ...b, students: b.students.map(x => x.id === s.id ? { ...x, paper_only: s.paper_only } : x) }));
    }
  };

  const saveSetting = async (key: string, value: string) => {
    setBoard(b => ({ ...b, settings: { ...b.settings, [key]: value } }));
    try { await api.saveBoardSetting(key, value); } catch {}
  };

  const currentClass = classes.find(c => c.id === classId);
  const boardUrl = currentClass ? `/board?class=${encodeURIComponent(currentClass.id)}` : "/board";
  const currentMusicId = board.settings.music_playlist_id || "";
  const currentMusicLabel = MUSIC_PRESETS.find(p => p.id === currentMusicId)?.label || "No music";

  return (
    <div className="p-6 max-w-5xl mx-auto pb-16 animate-page-enter" style={{ color: "var(--t1)" }}>
      {/* Reward flash */}
      {rewardFlash && (
        <div className="fixed top-6 left-1/2 -translate-x-1/2 z-50 px-8 py-4 rounded-2xl shadow-2xl font-bold text-lg"
          style={{ background: "linear-gradient(135deg, #f59e0b, #dc2626)", color: "white", boxShadow: "0 0 60px rgba(245,158,11,0.6)" }}>
          {rewardFlash} earned a reward! 🏆
        </div>
      )}

      {/* Page header */}
      <header className="flex items-start justify-between flex-wrap gap-4 mb-8">
        <div>
          <div className="text-[10px] uppercase tracking-[0.18em] mb-1.5" style={{ color: "var(--t3)" }}>Teacher Settings</div>
          <h1 className="text-2xl font-bold flex items-center gap-2.5" style={{ color: "var(--t1)" }}>
            <span className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: "rgba(124,58,237,0.2)" }}>
              <Tv size={16} style={{ color: "#a78bfa" }} />
            </span>
            Board Settings
          </h1>
          <p className="text-sm mt-1.5 max-w-lg" style={{ color: "var(--t3)" }}>
            Manage everything displayed on the classroom TV. Students see a read-only view at <code className="text-xs px-1 py-0.5 rounded" style={{ background: "rgba(255,255,255,0.08)" }}>/board</code>.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <select value={classId} onChange={e => setClassId(e.target.value)}
            className="input text-sm" style={{ minWidth: 160 }}>
            {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <a href={boardUrl} target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold border rounded-xl transition-all"
            style={{
              color: "var(--t1)",
              background: "rgba(255,255,255,0.04)",
              borderColor: "rgba(255,255,255,0.1)",
            }}>
            <Tv size={13} /> Open board <ExternalLink size={11} />
          </a>
        </div>
      </header>

      {/* ── Row 1: Day/Specialist + Music ────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        {/* Day & Specialist */}
        <section className="rounded-2xl border p-5"
          style={{ background: "rgba(255,255,255,0.02)", borderColor: "rgba(255,255,255,0.07)" }}>
          <div className="flex items-center gap-2 mb-5">
            <span className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
              style={{ background: "rgba(99,102,241,0.15)" }}>
              <CalendarDays size={14} style={{ color: "#818cf8" }} />
            </span>
            <h2 className="font-semibold text-sm" style={{ color: "var(--t1)" }}>Day &amp; Specialist</h2>
          </div>
          <div className="space-y-4">
            <label className="flex flex-col gap-1.5">
              <span className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--t3)" }}>Today's rotation day</span>
              <div className="flex gap-1.5">
                {DAY_LETTERS.map(d => {
                  const active = (board.settings.current_specials_day || "A").toUpperCase() === d;
                  return (
                    <button key={d}
                      onClick={() => saveSetting("current_specials_day", d)}
                      className="flex-1 py-2 rounded-xl text-sm font-bold border transition-all"
                      style={{
                        background: active ? "rgba(99,102,241,0.2)" : "rgba(255,255,255,0.03)",
                        borderColor: active ? "rgba(99,102,241,0.4)" : "rgba(255,255,255,0.07)",
                        color: active ? "#818cf8" : "var(--t3)",
                        boxShadow: active ? "0 0 12px rgba(99,102,241,0.2)" : "none",
                      }}>
                      {d}
                    </button>
                  );
                })}
              </div>
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--t3)" }}>11 AM specialist in room</span>
              <input
                value={board.settings.specialist_name || ""}
                onChange={e => saveSetting("specialist_name", e.target.value)}
                placeholder="e.g. Ms. Rivera (Library)"
                className="input text-sm"
              />
            </label>
          </div>
        </section>

        {/* Music & Background */}
        <section className="rounded-2xl border p-5"
          style={{ background: "rgba(255,255,255,0.02)", borderColor: "rgba(255,255,255,0.07)" }}>
          <div className="flex items-center gap-2 mb-5">
            <span className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
              style={{ background: "rgba(168,85,247,0.15)" }}>
              <Music size={14} style={{ color: "#c084fc" }} />
            </span>
            <h2 className="font-semibold text-sm" style={{ color: "var(--t1)" }}>Music &amp; Background</h2>
          </div>
          <div className="space-y-4">
            <label className="flex flex-col gap-1.5">
              <span className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--t3)" }}>Ambient playlist</span>
              <div className="grid grid-cols-3 gap-1.5">
                {MUSIC_PRESETS.map(p => {
                  const active = currentMusicId === p.id;
                  return (
                    <button key={p.id}
                      onClick={() => saveSetting("music_playlist_id", p.id)}
                      className="flex items-center gap-1.5 px-2.5 py-2 rounded-xl text-xs font-semibold border transition-all"
                      style={{
                        background: active ? "rgba(168,85,247,0.15)" : "rgba(255,255,255,0.03)",
                        borderColor: active ? "rgba(168,85,247,0.35)" : "rgba(255,255,255,0.07)",
                        color: active ? "#c084fc" : "var(--t3)",
                      }}>
                      {p.id ? MUSIC_ICONS[p.id] : "—"} {p.label}
                    </button>
                  );
                })}
              </div>
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--t3)" }}>Background image URL</span>
              <input
                value={board.settings.background_image_url || ""}
                onChange={e => saveSetting("background_image_url", e.target.value)}
                placeholder="https://… (leave blank for default gradient)"
                className="input text-sm"
              />
            </label>
          </div>
        </section>
      </div>

      {/* ── Row 2: Stars + Levels ─────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        {/* Behavior Stars */}
        <section className="rounded-2xl border p-5"
          style={{ background: "rgba(255,255,255,0.02)", borderColor: "rgba(255,255,255,0.07)" }}>
          <div className="flex items-center gap-2 mb-1">
            <span className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
              style={{ background: "rgba(245,158,11,0.15)" }}>
              <Star size={14} style={{ color: "#fbbf24" }} />
            </span>
            <h2 className="font-semibold text-sm" style={{ color: "var(--t1)" }}>Behavior Stars</h2>
            <span className="ml-auto text-[11px] font-medium px-2 py-0.5 rounded-full"
              style={{ background: "rgba(245,158,11,0.1)", color: "#fbbf24" }}>
              5 stars = reward
            </span>
          </div>
          <p className="text-[11px] mb-4" style={{ color: "var(--t3)" }}>Reaching 5 stars fires a reward (🏆) and auto-resets stars to zero.</p>

          <div className="space-y-1.5 max-h-[480px] overflow-y-auto pr-1">
            {board.students.map(s => {
              const stars = Math.max(0, Math.min(5, s.behavior_stars || 0));
              return (
                <div key={s.id}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-xl border transition-all"
                  style={{
                    background: "rgba(255,255,255,0.03)",
                    borderColor: "rgba(255,255,255,0.06)",
                  }}>
                  {/* Avatar */}
                  <div className="w-8 h-8 rounded-full flex items-center justify-center text-base shrink-0 overflow-hidden"
                    style={{ background: "linear-gradient(135deg, rgba(139,92,246,0.3), rgba(99,102,241,0.2))" }}>
                    {s.avatar_url
                      ? <img src={s.avatar_url} alt="" className="w-full h-full object-cover" />
                      : <span className="text-sm font-bold">{(s.name || "?")[0]}</span>}
                  </div>

                  {/* Name + stars */}
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-sm truncate" style={{ color: "var(--t1)" }}>{s.name}</div>
                    <div className="flex items-center gap-0.5 mt-0.5">
                      {Array.from({ length: 5 }, (_, idx) => (
                        <span key={idx} style={{
                          fontSize: 12,
                          opacity: idx < stars ? 1 : 0.2,
                          filter: idx < stars ? "drop-shadow(0 0 3px rgba(245,158,11,0.6))" : "grayscale(1)",
                        }}>
                          ⭐
                        </span>
                      ))}
                      <span className="ml-1 text-[10px] font-bold tabular-nums" style={{ color: "var(--t3)" }}>
                        {stars}/5
                      </span>
                    </div>
                  </div>

                  {/* Reward badge */}
                  {s.reward_count > 0 && (
                    <div className="text-[10px] px-2 py-1 rounded-full font-bold shrink-0"
                      style={{ background: "rgba(245,158,11,0.15)", color: "#fbbf24" }}>
                      x{s.reward_count}
                    </div>
                  )}

                  {/* Controls */}
                  <div className="flex gap-1 shrink-0">
                    <button
                      onClick={() => bumpStars(s, -1)}
                      className="w-8 h-8 rounded-lg font-bold text-sm hover:scale-105 transition-transform"
                      style={{ background: "rgba(239,68,68,0.15)", color: "#f87171" }}
                      title="Remove star">
                      −
                    </button>
                    <button
                      onClick={() => bumpStars(s, 1)}
                      className="w-8 h-8 rounded-lg font-bold text-sm hover:scale-105 transition-transform"
                      style={{ background: "rgba(34,197,94,0.15)", color: "#4ade80" }}
                      title="Add star">
                      +
                    </button>
                  </div>
                </div>
              );
            })}
            {board.students.length === 0 && (
              <div className="text-sm py-10 text-center" style={{ color: "var(--t3)" }}>
                {loading ? "Loading…" : "No students in this class yet."}
              </div>
            )}
          </div>
        </section>

        {/* Independence Levels */}
        <section className="rounded-2xl border p-5"
          style={{ background: "rgba(255,255,255,0.02)", borderColor: "rgba(255,255,255,0.07)" }}>
          <div className="flex items-center gap-2 mb-1">
            <span className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
              style={{ background: "rgba(16,185,129,0.15)" }}>
              <ArrowUp size={14} style={{ color: "#34d399" }} />
            </span>
            <h2 className="font-semibold text-sm" style={{ color: "var(--t1)" }}>Independence Levels</h2>
          </div>
          <p className="text-[11px] mb-4" style={{ color: "var(--t3)" }}>1 = most support — 5 = full independence. Shown on student dashboards.</p>

          <div className="space-y-2">
            {[1, 2, 3, 4, 5].map(level => {
              const atLevel = board.students.filter(s => (s.level || 1) === level);
              const lc = LEVEL_COLORS[level];
              return (
                <div key={level} className="rounded-xl border p-3"
                  style={{
                    background: atLevel.length > 0 ? lc.bg : "rgba(255,255,255,0.02)",
                    borderColor: atLevel.length > 0 ? lc.border : "rgba(255,255,255,0.06)",
                  }}>
                  <div className="flex items-center gap-3">
                    {/* Level badge */}
                    <div className="shrink-0 w-12">
                      <div className="text-base font-extrabold leading-none" style={{ color: lc.text }}>L{level}</div>
                      <div className="text-[9px] font-medium mt-0.5" style={{ color: lc.text, opacity: 0.7 }}>
                        {LEVEL_LABELS[level]}
                      </div>
                    </div>

                    {/* Student chips */}
                    <div className="flex-1 flex flex-wrap gap-1.5 min-h-[32px] items-center">
                      {atLevel.map(s => (
                        <div key={s.id}
                          className="group flex items-center gap-1 px-2 py-1 rounded-full text-xs font-semibold border"
                          style={{
                            background: lc.bg,
                            borderColor: lc.border,
                            color: "var(--t1)",
                          }}>
                          {s.avatar_url
                            ? <img src={s.avatar_url} alt="" className="w-4 h-4 rounded-full object-cover shrink-0" />
                            : <span className="text-[10px]" style={{ color: lc.text }}>{(s.name || "?")[0]}</span>}
                          <span className="truncate max-w-[90px]">{s.name}</span>
                          <button
                            onClick={() => setLevel(s, level - 1)}
                            disabled={level <= 1}
                            className="opacity-40 hover:opacity-100 disabled:opacity-10 transition-opacity"
                            title="Level down">
                            <ArrowDown size={11} />
                          </button>
                          <button
                            onClick={() => setLevel(s, level + 1)}
                            disabled={level >= 5}
                            className="opacity-40 hover:opacity-100 disabled:opacity-10 transition-opacity"
                            title="Level up">
                            <ArrowUp size={11} />
                          </button>
                        </div>
                      ))}
                      {atLevel.length === 0 && (
                        <span className="text-[11px]" style={{ color: "var(--t3)", opacity: 0.5 }}>Empty</span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </div>

      {/* ── Paper-only Students ───────────────────────────────────────── */}
      <section className="rounded-2xl border p-5 mb-4"
        style={{ background: "rgba(255,255,255,0.02)", borderColor: "rgba(255,255,255,0.07)" }}>
        <div className="flex items-center gap-2 mb-1">
          <span className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
            style={{ background: "rgba(59,130,246,0.15)" }}>
            <Printer size={14} style={{ color: "#60a5fa" }} />
          </span>
          <h2 className="font-semibold text-sm" style={{ color: "var(--t1)" }}>Paper-only Students</h2>
        </div>
        <p className="text-[11px] mb-4" style={{ color: "var(--t3)" }}>
          Flagged students won't see digital assignments — print worksheets from the Assignments page instead.
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
          {board.students.map(s => (
            <label key={s.id}
              className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl cursor-pointer border transition-all"
              style={{
                border: "1px solid",
                borderColor: s.paper_only ? "rgba(59,130,246,0.3)" : "rgba(255,255,255,0.07)",
                background: s.paper_only ? "rgba(59,130,246,0.1)" : "rgba(255,255,255,0.03)",
              }}>
              <input
                type="checkbox"
                checked={!!s.paper_only}
                onChange={() => togglePaperOnly(s)}
                className="w-4 h-4 rounded"
              />
              <span className="truncate text-sm font-semibold flex-1" style={{ color: "var(--t1)" }}>
                {s.avatar_emoji || "🙂"} {s.name}
              </span>
              {!!s.paper_only && (
                <span className="text-[9px] font-bold shrink-0 px-1.5 py-0.5 rounded"
                  style={{ background: "rgba(59,130,246,0.2)", color: "#60a5fa" }}>
                  PAPER
                </span>
              )}
            </label>
          ))}
          {board.students.length === 0 && (
            <span className="text-xs col-span-full" style={{ color: "var(--t3)" }}>No students in this class.</span>
          )}
        </div>
      </section>

      {/* ── STAR Student Schedules ────────────────────────────────────── */}
      <section className="rounded-2xl border p-5 mb-4"
        style={{ background: "rgba(255,255,255,0.02)", borderColor: "rgba(255,255,255,0.07)" }}>
        <div className="flex items-center gap-2 mb-1">
          <span className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
            style={{ background: "rgba(245,158,11,0.15)" }}>
            <Users size={14} style={{ color: "#fbbf24" }} />
          </span>
          <h2 className="font-semibold text-sm" style={{ color: "var(--t1)" }}>STAR Student Schedules</h2>
        </div>
        <p className="text-[11px] mb-5" style={{ color: "var(--t3)" }}>
          Per-student resource pullout schedules. Rows display on the board exactly as entered.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {board.students.map(s => (
            <ScheduleEditor
              key={s.id}
              student={s}
              initial={board.schedules.filter((r: any) => r.student_id === s.id)}
              onSaved={(saved) => setBoard(b => ({
                ...b,
                schedules: [...b.schedules.filter((r: any) => r.student_id !== s.id), ...saved],
              }))}
            />
          ))}
        </div>
      </section>

      {/* ── Specials Rotation ─────────────────────────────────────────── */}
      <section className="rounded-2xl border p-5"
        style={{ background: "rgba(255,255,255,0.02)", borderColor: "rgba(255,255,255,0.07)" }}>
        <div className="flex items-center gap-2 mb-1">
          <span className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
            style={{ background: "rgba(99,102,241,0.15)" }}>
            <CalendarDays size={14} style={{ color: "#818cf8" }} />
          </span>
          <h2 className="font-semibold text-sm" style={{ color: "var(--t1)" }}>Specials Rotation</h2>
        </div>
        <p className="text-[11px] mb-5" style={{ color: "var(--t3)" }}>
          Grades 3–5 across Days A–F. The current day is highlighted on the board.
        </p>
        <SpecialsEditor
          specials={board.specials}
          currentDay={(board.settings.current_specials_day || "A").toUpperCase()}
          onSaved={(grade, rows) => setBoard(b => ({
            ...b,
            specials: [...b.specials.filter((r: any) => r.grade !== grade), ...rows],
          }))}
        />
      </section>
    </div>
  );
}

// ── ScheduleEditor ────────────────────────────────────────────────────────────

function ScheduleEditor({ student, initial, onSaved }: { student: any; initial: any[]; onSaved: (rows: any[]) => void }) {
  const [rows, setRows] = useState<any[]>(() => initial.map(r => ({ ...r })));
  const [collapsed, setCollapsed] = useState(initial.length === 0);
  useEffect(() => { setRows(initial.map(r => ({ ...r }))); }, [student.id, initial.length]);

  const update = (i: number, patch: any) => setRows(rs => rs.map((r, idx) => idx === i ? { ...r, ...patch } : r));
  const add = () => { setRows(rs => [...rs, { activity: "", start_time: "", end_time: "", classroom: "", active_days: "Mon,Tue,Wed,Thu,Fri" }]); setCollapsed(false); };
  const remove = (i: number) => setRows(rs => rs.filter((_, idx) => idx !== i));
  const save = async () => {
    const clean = rows.filter(r => (r.activity || "").trim());
    try {
      const saved = await api.saveResourceSchedule(student.id, clean);
      onSaved(Array.isArray(saved) ? saved : []);
    } catch {}
  };

  return (
    <div className="rounded-xl border overflow-hidden"
      style={{ background: "rgba(255,255,255,0.02)", borderColor: "rgba(255,255,255,0.08)" }}>
      {/* Header row */}
      <button
        onClick={() => setCollapsed(c => !c)}
        className="w-full flex items-center gap-2.5 px-3.5 py-3 text-left hover:bg-white/[0.02] transition-colors">
        <div className="w-7 h-7 rounded-full flex items-center justify-center text-sm shrink-0 overflow-hidden"
          style={{ background: "linear-gradient(135deg, rgba(139,92,246,0.3), rgba(99,102,241,0.2))" }}>
          {student.avatar_url
            ? <img src={student.avatar_url} alt="" className="w-full h-full object-cover" />
            : <span className="font-bold text-xs" style={{ color: "#a78bfa" }}>{(student.name || "?")[0]}</span>}
        </div>
        <span className="font-semibold text-sm flex-1" style={{ color: "var(--t1)" }}>{student.name}</span>
        {rows.length > 0 && (
          <span className="text-[10px] font-medium px-2 py-0.5 rounded-full"
            style={{ background: "rgba(124,58,237,0.15)", color: "#a78bfa" }}>
            {rows.length} row{rows.length !== 1 ? "s" : ""}
          </span>
        )}
        {collapsed ? <ChevronDown size={14} style={{ color: "var(--t3)" }} /> : <ChevronUp size={14} style={{ color: "var(--t3)" }} />}
      </button>

      {/* Expanded body */}
      {!collapsed && (
        <div className="border-t px-3.5 py-3" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
          {rows.length === 0 ? (
            <div className="text-xs italic py-2 text-center" style={{ color: "var(--t3)" }}>No rows yet.</div>
          ) : (
            <div className="space-y-2 mb-3">
              {rows.map((r, i) => (
                <div key={i} className="grid grid-cols-[1fr_60px_60px_80px_auto] gap-1.5 items-center">
                  <input value={r.activity || ""} onChange={e => update(i, { activity: e.target.value })}
                    placeholder="Activity" className="input text-xs" />
                  <input value={r.start_time || ""} onChange={e => update(i, { start_time: e.target.value })}
                    placeholder="9:00" className="input text-xs font-mono" />
                  <input value={r.end_time || ""} onChange={e => update(i, { end_time: e.target.value })}
                    placeholder="9:30" className="input text-xs font-mono" />
                  <input value={r.classroom || ""} onChange={e => update(i, { classroom: e.target.value })}
                    placeholder="Room" className="input text-xs" />
                  <button onClick={() => remove(i)}
                    className="w-7 h-7 flex items-center justify-center rounded-lg transition-colors"
                    style={{ color: "#f87171" }}
                    title="Remove">
                    <Trash2 size={12} />
                  </button>
                </div>
              ))}
            </div>
          )}
          <div className="flex justify-end gap-2">
            <button onClick={add}
              className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border font-medium transition-colors"
              style={{ background: "rgba(255,255,255,0.04)", borderColor: "rgba(255,255,255,0.1)", color: "var(--t2)" }}>
              <Plus size={11} /> Add row
            </button>
            <button onClick={save}
              className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg font-bold transition-colors"
              style={{ background: "rgba(124,58,237,0.2)", color: "#a78bfa" }}>
              Save
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── SpecialsEditor ────────────────────────────────────────────────────────────

function SpecialsEditor({ specials, currentDay, onSaved }: { specials: any[]; currentDay: string; onSaved: (grade: number, rows: any[]) => void }) {
  const [draft, setDraft] = useState<Record<string, { activity: string; classroom: string }>>(() => {
    const d: Record<string, { activity: string; classroom: string }> = {};
    for (const r of specials) {
      d[`${r.grade}:${String(r.day_letter).toUpperCase()}`] = { activity: r.activity || "", classroom: r.classroom || "" };
    }
    return d;
  });

  useEffect(() => {
    const d: Record<string, { activity: string; classroom: string }> = {};
    for (const r of specials) {
      d[`${r.grade}:${String(r.day_letter).toUpperCase()}`] = { activity: r.activity || "", classroom: r.classroom || "" };
    }
    setDraft(d);
  }, [specials.length]);

  const saveGrade = async (grade: number) => {
    const rows = DAY_LETTERS.map(day => {
      const key = `${grade}:${day}`;
      const d = draft[key];
      if (!d || !d.activity.trim()) return null;
      return { grade, day_letter: day, activity: d.activity, classroom: d.classroom };
    }).filter(Boolean) as any[];
    try {
      const saved = await api.saveSpecialsRotation(grade, rows);
      onSaved(grade, Array.isArray(saved) ? saved : []);
    } catch {}
  };

  return (
    <div className="overflow-x-auto rounded-xl border" style={{ borderColor: "rgba(255,255,255,0.07)" }}>
      <table className="w-full text-xs border-collapse">
        <thead>
          <tr style={{ background: "rgba(255,255,255,0.03)" }}>
            <th className="text-left px-4 py-2.5 font-semibold text-[11px] uppercase tracking-wide w-16"
              style={{ color: "var(--t3)", borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
              Grade
            </th>
            {DAY_LETTERS.map(d => {
              const isToday = d === currentDay;
              return (
                <th key={d}
                  className="text-center px-2 py-2.5 font-bold text-[11px] uppercase tracking-wide"
                  style={{
                    color: isToday ? "#fbbf24" : "var(--t3)",
                    borderBottom: "1px solid rgba(255,255,255,0.07)",
                    background: isToday ? "rgba(245,158,11,0.07)" : "transparent",
                  }}>
                  Day {d}
                  {isToday && (
                    <span className="block text-[8px] font-bold mt-0.5" style={{ color: "#fbbf24" }}>TODAY</span>
                  )}
                </th>
              );
            })}
            <th className="w-16" style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }} />
          </tr>
        </thead>
        <tbody>
          {GRADES.map((grade, gi) => (
            <tr key={grade} style={{ borderTop: gi > 0 ? "1px solid rgba(255,255,255,0.05)" : "none" }}>
              <td className="px-4 py-2">
                <span className="font-extrabold text-sm" style={{ color: "var(--t1)" }}>Gr {grade}</span>
              </td>
              {DAY_LETTERS.map(day => {
                const key = `${grade}:${day}`;
                const d = draft[key] || { activity: "", classroom: "" };
                const isToday = day === currentDay;
                return (
                  <td key={day} className="p-1.5" style={{ background: isToday ? "rgba(245,158,11,0.04)" : "transparent" }}>
                    <input
                      value={d.activity}
                      onChange={e => setDraft(x => ({ ...x, [key]: { ...d, activity: e.target.value } }))}
                      placeholder="—"
                      className="input text-[11px] py-1.5 text-center w-full"
                      style={{ minWidth: 80 }}
                    />
                  </td>
                );
              })}
              <td className="px-2 py-1.5">
                <button
                  onClick={() => saveGrade(grade)}
                  className="text-[11px] px-3 py-1.5 rounded-lg font-bold whitespace-nowrap transition-colors"
                  style={{ background: "rgba(124,58,237,0.2)", color: "#a78bfa" }}>
                  Save
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
