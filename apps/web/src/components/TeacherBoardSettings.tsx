import React, { useEffect, useMemo, useState } from "react";
import { api } from "../lib/api.ts";
import { useTheme } from "../lib/theme.tsx";
import { Tv, Star, ArrowUp, ArrowDown, Music, Image as ImageIcon, CalendarDays, Plus, Trash2, ExternalLink } from "lucide-react";

const DAY_LETTERS = ["A", "B", "C", "D", "E", "F"] as const;
const GRADES = [3, 4, 5] as const;

const MUSIC_PRESETS = [
  { id: "",         label: "— No music —" },
  { id: "forest",   label: "🌲 Forest" },
  { id: "ocean",    label: "🌊 Ocean" },
  { id: "rain",     label: "🌧 Rain" },
  { id: "piano",    label: "🎹 Piano" },
  { id: "campfire", label: "🔥 Campfire" },
];

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
  const saveSetting = async (key: string, value: string) => {
    setBoard(b => ({ ...b, settings: { ...b.settings, [key]: value } }));
    try { await api.saveBoardSetting(key, value); } catch {}
  };

  const currentClass = classes.find(c => c.id === classId);
  const boardUrl = currentClass ? `/board?class=${encodeURIComponent(currentClass.id)}` : "/board";

  return (
    <div className="p-7 max-w-6xl mx-auto space-y-6 animate-page-enter" style={{ color: "var(--text-1)" }}>
      {rewardFlash && (
        <div className="fixed top-6 left-1/2 -translate-x-1/2 z-50 px-8 py-4 rounded-2xl shadow-2xl font-bold text-lg"
          style={{ background: "linear-gradient(135deg, #f59e0b, #dc2626)", color: "white", boxShadow: "0 0 60px rgba(245,158,11,0.6)" }}>
          🎉 {rewardFlash} earned McDonald's!
        </div>
      )}

      <header className="border-b pb-5 flex items-end justify-between flex-wrap gap-4" style={{ borderColor: "var(--border)" }}>
        <div>
          <div className="text-[10px] uppercase tracking-[0.2em] mb-1" style={{ color: "var(--text-3)" }}>Teacher · Classroom Board</div>
          <h1 className="font-display text-3xl sm:text-4xl" style={{ color: "var(--text-1)" }}>Board Settings</h1>
          <p className="text-sm mt-2 max-w-xl" style={{ color: "var(--text-2)" }}>
            Edit everything that appears on the classroom TV board. Students see a read-only view at <code>/board</code>.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <select value={classId} onChange={e => setClassId(e.target.value)}
            className="input text-sm" style={{ minWidth: 160 }}>
            {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <a href={boardUrl} target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold border cursor-pointer transition-colors"
            style={{ color: "var(--text-1)", background: "var(--surface-1)", borderColor: "var(--border-md)", borderRadius: "var(--r-md)" }}>
            <Tv size={13}/> Preview on Board <ExternalLink size={11}/>
          </a>
        </div>
      </header>

      {/* Settings row */}
      <section className="card p-5">
        <div className="flex items-center gap-2 mb-4">
          <CalendarDays size={16}/> <h2 className="font-semibold text-base">Day & Specialist</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold" style={{ color: "var(--text-3)" }}>Today's rotation day</span>
            <select value={(board.settings.current_specials_day || "A").toUpperCase()}
              onChange={e => saveSetting("current_specials_day", e.target.value)}
              className="input text-sm">
              {DAY_LETTERS.map(d => <option key={d} value={d}>Day {d}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1.5 md:col-span-2">
            <span className="text-xs font-semibold" style={{ color: "var(--text-3)" }}>11 AM specialist in room</span>
            <input value={board.settings.specialist_name || ""}
              onChange={e => saveSetting("specialist_name", e.target.value)}
              placeholder="e.g. Ms. Rivera (Library)"
              className="input text-sm"/>
          </label>
        </div>
      </section>

      <section className="card p-5">
        <div className="flex items-center gap-2 mb-4">
          <Music size={16}/> <h2 className="font-semibold text-base">Ambient Music & Background</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold" style={{ color: "var(--text-3)" }}>Playlist</span>
            <select value={board.settings.music_playlist_id || ""}
              onChange={e => saveSetting("music_playlist_id", e.target.value)}
              className="input text-sm">
              {MUSIC_PRESETS.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold" style={{ color: "var(--text-3)" }}>Background image URL</span>
            <input value={board.settings.background_image_url || ""}
              onChange={e => saveSetting("background_image_url", e.target.value)}
              placeholder="https://… (leave blank for sunset gradient)"
              className="input text-sm"/>
          </label>
        </div>
      </section>

      {/* Stars + Levels */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <section className="card p-5">
          <div className="flex items-center gap-2 mb-4">
            <Star size={16}/> <h2 className="font-semibold text-base">Behavior Stars</h2>
            <span className="text-xs ml-auto" style={{ color: "var(--text-3)" }}>5 = McDonald's · auto-reset</span>
          </div>
          <div className="space-y-2 max-h-[520px] overflow-y-auto pr-1">
            {board.students.map(s => {
              const stars = Math.max(0, Math.min(5, s.behavior_stars || 0));
              return (
                <div key={s.id} className="rounded-xl p-2.5 flex items-center gap-3"
                  style={{ background: dk ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.03)", border: "1px solid var(--border)" }}>
                  <div className="w-9 h-9 rounded-full flex items-center justify-center text-lg flex-shrink-0 overflow-hidden"
                    style={{ background: "linear-gradient(135deg, rgba(139,92,246,0.3), rgba(99,102,241,0.2))" }}>
                    {s.avatar_url
                      ? <img src={s.avatar_url} alt="" className="w-full h-full object-cover" />
                      : <span>{(s.name || "?")[0]}</span>}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-sm truncate">{s.name}</div>
                    <div className="flex items-center gap-0.5 mt-0.5">
                      {Array.from({ length: 5 }, (_, i) => (
                        <span key={i} style={{ fontSize: 13, opacity: i < stars ? 1 : 0.25, filter: i < stars ? "none" : "grayscale(1)" }}>⭐</span>
                      ))}
                    </div>
                  </div>
                  {s.reward_count > 0 && (
                    <div className="text-xs px-2 py-1 rounded-full font-bold"
                      style={{ background: "rgba(245,158,11,0.2)", color: dk ? "#fcd34d" : "#b45309" }}>
                      🏆 {s.reward_count}
                    </div>
                  )}
                  <div className="flex gap-1">
                    <button onClick={() => bumpStars(s, -1)} className="w-8 h-8 rounded-lg font-bold text-sm hover:scale-110 transition"
                      style={{ background: "rgba(239,68,68,0.18)", color: "#dc2626" }}>−</button>
                    <button onClick={() => bumpStars(s, 1)} className="w-8 h-8 rounded-lg font-bold text-sm hover:scale-110 transition"
                      style={{ background: "rgba(34,197,94,0.18)", color: "#16a34a" }}>+</button>
                  </div>
                </div>
              );
            })}
            {board.students.length === 0 && (
              <div className="text-sm py-8 text-center" style={{ color: "var(--text-3)" }}>
                {loading ? "Loading…" : "No students in this class yet."}
              </div>
            )}
          </div>
        </section>

        <section className="card p-5">
          <div className="flex items-center gap-2 mb-4">
            <ArrowUp size={16}/> <h2 className="font-semibold text-base">Independence Levels</h2>
            <span className="text-xs ml-auto" style={{ color: "var(--text-3)" }}>1 = most support · 5 = full independence</span>
          </div>
          <div className="space-y-2">
            {[1,2,3,4,5].map(level => {
              const atLevel = board.students.filter(s => (s.level || 1) === level);
              return (
                <div key={level} className="rounded-xl p-3"
                  style={{ background: dk ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.02)", border: "1px solid var(--border)" }}>
                  <div className="flex items-center gap-3">
                    <div className="font-bold text-lg w-10 flex-shrink-0"
                      style={{ color: level >= 4 ? "#16a34a" : level >= 2 ? "#d97706" : "#dc2626" }}>L{level}</div>
                    <div className="flex-1 flex flex-wrap gap-1.5 min-h-[38px]">
                      {atLevel.map(s => (
                        <div key={s.id} className="group flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-semibold"
                          style={{ background: "rgba(139,92,246,0.15)", color: "var(--text-1)" }}>
                          {s.avatar_url
                            ? <img src={s.avatar_url} alt="" className="w-4 h-4 rounded-full object-cover" />
                            : <span className="opacity-60">{(s.name || "?")[0]}</span>}
                          <span className="truncate max-w-[110px]">{s.name}</span>
                          <button onClick={() => setLevel(s, level - 1)} disabled={level <= 1}
                            className="opacity-60 hover:opacity-100 disabled:opacity-20" title="Level down"><ArrowDown size={12}/></button>
                          <button onClick={() => setLevel(s, level + 1)} disabled={level >= 5}
                            className="opacity-60 hover:opacity-100 disabled:opacity-20" title="Level up"><ArrowUp size={12}/></button>
                        </div>
                      ))}
                      {atLevel.length === 0 && <span className="opacity-40 text-xs self-center">— empty —</span>}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </div>

      {/* Resource Schedules */}
      <section className="card p-5">
        <h2 className="font-semibold text-base mb-3">STAR Student Schedules</h2>
        <p className="text-xs mb-4" style={{ color: "var(--text-3)" }}>Per-student resource pullouts. Rows display on the board exactly as entered.</p>
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

      {/* Specials Rotation */}
      <section className="card p-5">
        <h2 className="font-semibold text-base mb-3">Specials Rotation</h2>
        <p className="text-xs mb-4" style={{ color: "var(--text-3)" }}>Grades 3–5 × Days A–F. Current day highlighted on the board.</p>
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

// ── Editors ─────────────────────────────────────────────────────

function ScheduleEditor({ student, initial, onSaved }: { student: any; initial: any[]; onSaved: (rows: any[]) => void }) {
  const [rows, setRows] = useState<any[]>(() => initial.map(r => ({ ...r })));
  useEffect(() => { setRows(initial.map(r => ({ ...r }))); }, [student.id, initial.length]);

  const update = (i: number, patch: any) => setRows(rs => rs.map((r, idx) => idx === i ? { ...r, ...patch } : r));
  const add = () => setRows(rs => [...rs, { activity: "", start_time: "", end_time: "", classroom: "", active_days: "Mon,Tue,Wed,Thu,Fri" }]);
  const remove = (i: number) => setRows(rs => rs.filter((_, idx) => idx !== i));
  const save = async () => {
    const clean = rows.filter(r => (r.activity || "").trim());
    try {
      const saved = await api.saveResourceSchedule(student.id, clean);
      onSaved(Array.isArray(saved) ? saved : []);
    } catch {}
  };

  return (
    <div className="rounded-xl p-3" style={{ background: "var(--surface-1)", border: "1px solid var(--border)" }}>
      <div className="flex items-center justify-between mb-2">
        <div className="font-bold text-sm">{student.name}</div>
        <div className="flex gap-1">
          <button onClick={add} className="text-xs px-2 py-1 rounded-md hover:opacity-80" style={{ background: "var(--surface-2)" }} title="Add row"><Plus size={12}/></button>
          <button onClick={save} className="text-xs px-2 py-1 rounded-md font-bold" style={{ background: "rgba(139,92,246,0.2)", color: "var(--accent)" }}>Save</button>
        </div>
      </div>
      {rows.length === 0 ? (
        <div className="text-xs italic py-2" style={{ color: "var(--text-3)" }}>No rows yet. Click + to add.</div>
      ) : (
        <div className="space-y-1.5">
          {rows.map((r, i) => (
            <div key={i} className="grid grid-cols-[1fr_60px_60px_1fr_auto] gap-1 items-center">
              <input value={r.activity || ""} onChange={e => update(i, { activity: e.target.value })} placeholder="Activity" className="input text-xs py-1"/>
              <input value={r.start_time || ""} onChange={e => update(i, { start_time: e.target.value })} placeholder="09:00" className="input text-xs py-1 font-mono"/>
              <input value={r.end_time || ""} onChange={e => update(i, { end_time: e.target.value })} placeholder="09:30" className="input text-xs py-1 font-mono"/>
              <input value={r.classroom || ""} onChange={e => update(i, { classroom: e.target.value })} placeholder="Room" className="input text-xs py-1"/>
              <button onClick={() => remove(i)} className="text-xs opacity-60 hover:opacity-100 px-1" title="Remove"><Trash2 size={12}/></button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function SpecialsEditor({ specials, currentDay, onSaved }: { specials: any[]; currentDay: string; onSaved: (grade: number, rows: any[]) => void }) {
  // Draft state keyed by "grade:day"
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
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="uppercase tracking-wider" style={{ color: "var(--text-3)" }}>
            <th className="text-left font-medium pb-2 pr-2">Grade</th>
            {DAY_LETTERS.map(d => (
              <th key={d} className={`text-center font-medium pb-2 px-1 ${d === currentDay ? "text-amber-600 dark:text-amber-400" : ""}`}>
                {d}{d === currentDay ? " ●" : ""}
              </th>
            ))}
            <th />
          </tr>
        </thead>
        <tbody>
          {GRADES.map(grade => (
            <tr key={grade} className="border-t" style={{ borderColor: "var(--border)" }}>
              <td className="py-2 pr-2 font-bold">{grade}</td>
              {DAY_LETTERS.map(day => {
                const key = `${grade}:${day}`;
                const d = draft[key] || { activity: "", classroom: "" };
                return (
                  <td key={day} className="p-0.5">
                    <input
                      value={d.activity}
                      onChange={e => setDraft(x => ({ ...x, [key]: { ...d, activity: e.target.value } }))}
                      placeholder="—"
                      className="input text-[11px] py-1 text-center w-full"
                    />
                  </td>
                );
              })}
              <td className="pl-2">
                <button onClick={() => saveGrade(grade)} className="text-[10px] px-2 py-1 rounded font-bold" style={{ background: "rgba(139,92,246,0.2)", color: "var(--accent)" }}>Save</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
