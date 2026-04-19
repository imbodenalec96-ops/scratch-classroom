import { Fragment, useEffect, useMemo, useState } from "react";
import { Clock, Plus, Trash2, Save, RotateCcw, AlertCircle } from "lucide-react";
import { api } from "../lib/api.ts";
import { useTheme } from "../lib/theme.tsx";

type Block = {
  id?: string;
  block_number?: number;
  start_time: string;
  end_time: string;
  label: string;
  subject: string | null;
  is_break: 0 | 1 | boolean;
  break_type: string | null;
  active_days: string | string[];
  content_source?: string | null;
};

const SUBJECTS = [
  { value: "", label: "—" },
  { value: "daily_news", label: "Daily News" },
  { value: "sel", label: "SEL" },
  { value: "math", label: "Math" },
  { value: "reading", label: "Reading" },
  { value: "writing", label: "Writing" },
  { value: "spelling", label: "Spelling" },
  { value: "review", label: "Review" },
  { value: "cashout", label: "Cashout" },
  { value: "video_learning", label: "Video Learning" },
  { value: "ted_talk", label: "TED Talk" },
  { value: "coding_art_gym", label: "Coding / Art / Gym" },
  { value: "dismissal", label: "Dismissal" },
  { value: "extra_review", label: "Extra Review" },
  { value: "recess", label: "Recess" },
  { value: "calm_down", label: "Calm Down" },
  { value: "lunch", label: "Lunch" },
];

const BREAK_TYPES = [
  { value: "regular", label: "Regular" },
  { value: "recess", label: "Recess" },
  { value: "calm_down", label: "Calm Down" },
  { value: "lunch", label: "Lunch" },
];

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri"];

function parseSelContent(raw: string | null | undefined): { videoUrl: string; assignmentUrl: string } {
  if (!raw) return { videoUrl: "", assignmentUrl: "" };
  try {
    const p = JSON.parse(raw);
    return { videoUrl: p.videoUrl || "", assignmentUrl: p.assignmentUrl || "" };
  } catch { return { videoUrl: "", assignmentUrl: "" }; }
}

function buildSelContent(videoUrl: string, assignmentUrl: string): string | null {
  const v = videoUrl.trim(); const a = assignmentUrl.trim();
  if (!v && !a) return null;
  const obj: Record<string, string> = {};
  if (v) obj.videoUrl = v;
  if (a) obj.assignmentUrl = a;
  return JSON.stringify(obj);
}

function normalizeDays(d: string | string[] | undefined): string[] {
  if (Array.isArray(d)) return d;
  if (!d) return ["Mon", "Tue", "Wed", "Thu", "Fri"];
  return String(d).split(",").map((s) => s.trim()).filter(Boolean);
}

function nowHHMM(): string {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function currentBlock(blocks: Block[], now: string): Block | null {
  for (const b of blocks) {
    if (!b.start_time || !b.end_time) continue;
    if (b.start_time <= now && now < b.end_time) return b;
  }
  return null;
}

export default function TeacherSchedule() {
  const { theme } = useTheme();
  const dk = theme === "dark";
  const [classes, setClasses] = useState<any[]>([]);
  const [classId, setClassId] = useState<string>("");
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [now, setNow] = useState(nowHHMM());

  useEffect(() => {
    const iv = setInterval(() => setNow(nowHHMM()), 30_000);
    return () => clearInterval(iv);
  }, []);

  // Load class list
  useEffect(() => {
    api.getClasses()
      .then((cs: any[]) => {
        setClasses(cs || []);
        if ((cs || []).length && !classId) setClassId(cs[0].id);
      })
      .catch((e) => setError(e?.message || "Failed to load classes"));
  }, []);

  // Load schedule for selected class
  useEffect(() => {
    if (!classId) return;
    setLoading(true);
    setError(null);
    api.getSchedule(classId)
      .then((rows: any[]) => {
        setBlocks((rows || []).map((r) => ({
          ...r,
          is_break: !!r.is_break,
          active_days: normalizeDays(r.active_days),
        })));
        setDirty(false);
      })
      .catch((e) => setError(e?.message || "Failed to load schedule"))
      .finally(() => setLoading(false));
  }, [classId]);

  const liveBlock = useMemo(() => currentBlock(blocks, now), [blocks, now]);

  function updateBlock(index: number, patch: Partial<Block>) {
    setBlocks((prev) => prev.map((b, i) => (i === index ? { ...b, ...patch } : b)));
    setDirty(true);
  }

  function addBlock() {
    const last = blocks[blocks.length - 1];
    const start = last?.end_time || "09:00";
    setBlocks((prev) => [
      ...prev,
      {
        start_time: start,
        end_time: start,
        label: "New block",
        subject: null,
        is_break: false,
        break_type: null,
        active_days: ["Mon", "Tue", "Wed", "Thu", "Fri"],
      },
    ]);
    setDirty(true);
  }

  function deleteBlock(index: number) {
    const b = blocks[index];
    if (!confirm(`Delete block "${b?.label || index + 1}"?`)) return;
    setBlocks((prev) => prev.filter((_, i) => i !== index));
    setDirty(true);
  }

  async function saveAll() {
    if (!classId) return;
    setSaving(true);
    setError(null);
    try {
      const payload = blocks.map((b, i) => ({
        block_number: i + 1,
        start_time: b.start_time,
        end_time: b.end_time,
        label: b.label,
        subject: b.subject || null,
        is_break: b.is_break ? 1 : 0,
        break_type: b.is_break ? b.break_type || "regular" : null,
        active_days: normalizeDays(b.active_days),
        content_source: b.content_source ?? null,
      }));
      const rows = await api.updateSchedule(classId, payload);
      setBlocks((rows || []).map((r: any) => ({
        ...r,
        is_break: !!r.is_break,
        active_days: normalizeDays(r.active_days),
      })));
      setDirty(false);
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 1800);
    } catch (e: any) {
      setError(e?.message || "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function resetDefault() {
    if (!classId) return;
    if (!confirm("Reset this class's schedule to the default transcribed daily schedule? This will overwrite all current blocks.")) return;
    setSaving(true);
    setError(null);
    try {
      const rows = await api.resetSchedule(classId);
      setBlocks((rows || []).map((r: any) => ({
        ...r,
        is_break: !!r.is_break,
        active_days: normalizeDays(r.active_days),
      })));
      setDirty(false);
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 1800);
    } catch (e: any) {
      setError(e?.message || "Reset failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-6xl mx-auto p-6 pb-24">
      <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-extrabold flex items-center gap-2 text-t1">
            <Clock size={22} className="text-cyan-400" />
            Schedule Editor
          </h1>
          <p className="text-sm text-t3 mt-1">Edit daily blocks, breaks, and subjects. Students' auto-nav and dashboards read from here.</p>
        </div>
        {classes.length > 1 && (
          <select
            value={classId}
            onChange={(e) => setClassId(e.target.value)}
            className="input text-sm"
          >
            {classes.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        )}
      </div>

      {error && (
        <div className={`mb-3 rounded-lg border px-3 py-2 text-sm flex items-start gap-2 ${dk ? "bg-red-500/10 border-red-500/30 text-red-300" : "bg-red-50 border-red-200 text-red-700"}`}>
          <AlertCircle size={14} className="mt-0.5 shrink-0" /> <span>{error}</span>
        </div>
      )}

      {loading ? (
        <div className="text-sm text-t3 py-10 text-center">Loading schedule…</div>
      ) : (
        <>
          <div className={`rounded-xl border overflow-hidden ${dk ? "border-white/[0.08]" : "border-gray-200"}`}>
            <div className={`grid grid-cols-[36px_100px_100px_minmax(140px,1fr)_160px_80px_140px_180px_40px] gap-2 px-3 py-2 text-[10px] font-semibold uppercase tracking-wide ${dk ? "bg-white/[0.03] text-white/50" : "bg-gray-50 text-gray-500"}`}>
              <div>#</div>
              <div>Start</div>
              <div>End</div>
              <div>Label</div>
              <div>Subject</div>
              <div>Break?</div>
              <div>Break type</div>
              <div>Active days</div>
              <div></div>
            </div>
            {blocks.length === 0 && (
              <div className="px-3 py-6 text-sm text-t3 text-center">No blocks yet. Click "Add block" to begin.</div>
            )}
            {blocks.map((b, i) => {
              const days = normalizeDays(b.active_days);
              const isLive = liveBlock === b;
              const selContent = b.subject === "sel" ? parseSelContent(b.content_source) : null;
              return (
                <Fragment key={i}>
                <div
                  className={`grid grid-cols-[36px_100px_100px_minmax(140px,1fr)_160px_80px_140px_180px_40px] gap-2 px-3 py-2 items-center border-t ${dk ? "border-white/[0.06]" : "border-gray-100"} ${isLive ? (dk ? "bg-cyan-500/10" : "bg-cyan-50") : ""}`}
                >
                  <div className="text-xs text-t3 font-mono">{i + 1}</div>
                  <input
                    type="time"
                    value={b.start_time}
                    onChange={(e) => updateBlock(i, { start_time: e.target.value })}
                    className="input text-xs py-1"
                  />
                  <input
                    type="time"
                    value={b.end_time}
                    onChange={(e) => updateBlock(i, { end_time: e.target.value })}
                    className="input text-xs py-1"
                  />
                  <input
                    type="text"
                    value={b.label}
                    onChange={(e) => updateBlock(i, { label: e.target.value })}
                    className="input text-xs py-1"
                    placeholder="Block label"
                  />
                  <select
                    value={b.subject || ""}
                    onChange={(e) => updateBlock(i, { subject: e.target.value || null })}
                    className="input text-xs py-1"
                  >
                    {SUBJECTS.map((s) => (
                      <option key={s.value} value={s.value}>{s.label}</option>
                    ))}
                  </select>
                  <label className="flex items-center gap-2 text-xs text-t3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={!!b.is_break}
                      onChange={(e) => updateBlock(i, { is_break: e.target.checked, break_type: e.target.checked ? (b.break_type || "regular") : null })}
                    />
                    <span>Break</span>
                  </label>
                  {b.is_break ? (
                    <select
                      value={b.break_type || "regular"}
                      onChange={(e) => updateBlock(i, { break_type: e.target.value })}
                      className="input text-xs py-1"
                    >
                      {BREAK_TYPES.map((t) => (
                        <option key={t.value} value={t.value}>{t.label}</option>
                      ))}
                    </select>
                  ) : (
                    <div className="text-xs text-t3/40">—</div>
                  )}
                  <div className="flex gap-1">
                    {DAYS.map((d) => {
                      const on = days.includes(d);
                      return (
                        <button
                          key={d}
                          onClick={() => {
                            const next = on ? days.filter((x) => x !== d) : [...days, d];
                            updateBlock(i, { active_days: DAYS.filter((x) => next.includes(x)) });
                          }}
                          className={`text-[10px] font-medium w-8 h-6 rounded border transition-all ${
                            on
                              ? (dk ? "bg-cyan-600/70 border-cyan-500/60 text-white" : "bg-cyan-500 border-cyan-500 text-white")
                              : (dk ? "bg-white/5 border-white/10 text-white/40 hover:bg-white/10" : "bg-gray-100 border-gray-200 text-gray-500 hover:bg-gray-200")
                          }`}
                          title={d}
                        >
                          {d[0]}
                        </button>
                      );
                    })}
                  </div>
                  <button
                    onClick={() => deleteBlock(i)}
                    className={`flex items-center justify-center w-8 h-8 rounded-lg ${dk ? "text-red-400 hover:bg-red-500/15" : "text-red-600 hover:bg-red-50"}`}
                    title="Delete block"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
                {selContent && (
                  <div className={`px-3 pb-2 pt-1 border-t ${dk ? "border-amber-500/15" : "border-amber-200/60"} ${dk ? "bg-amber-500/5" : "bg-amber-50/60"}`}>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[11px] font-semibold text-amber-400 shrink-0">💛 SEL Content</span>
                      <input
                        type="url"
                        placeholder="Video URL (YouTube, etc.)"
                        value={selContent.videoUrl}
                        onChange={(e) => updateBlock(i, { content_source: buildSelContent(e.target.value, selContent.assignmentUrl) })}
                        className="input text-xs py-1 flex-1 min-w-[180px]"
                      />
                      <input
                        type="url"
                        placeholder="Assignment URL (Google Form, etc.)"
                        value={selContent.assignmentUrl}
                        onChange={(e) => updateBlock(i, { content_source: buildSelContent(selContent.videoUrl, e.target.value) })}
                        className="input text-xs py-1 flex-1 min-w-[180px]"
                      />
                    </div>
                  </div>
                )}
                </Fragment>
              );
            })}
          </div>

          <div className="flex items-center gap-2 mt-4 flex-wrap">
            <button onClick={addBlock} className="btn-secondary gap-2 text-sm">
              <Plus size={14} /> Add block
            </button>
            <button
              onClick={saveAll}
              disabled={!dirty || saving}
              className={`btn-primary gap-2 text-sm ${savedFlash ? "bg-emerald-500 border-emerald-500" : ""} disabled:opacity-40`}
            >
              <Save size={14} />
              {saving ? "Saving…" : savedFlash ? "Saved!" : dirty ? "Save all changes" : "No changes"}
            </button>
            <button
              onClick={resetDefault}
              disabled={saving}
              className={`flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium border cursor-pointer transition-all disabled:opacity-40 ${dk ? "bg-amber-500/10 hover:bg-amber-500/18 text-amber-400 border-amber-500/25" : "bg-amber-50 hover:bg-amber-100 text-amber-700 border-amber-200"}`}
            >
              <RotateCcw size={14} /> Reset to default
            </button>
            {dirty && (
              <span className="text-xs text-amber-500 ml-2">Unsaved changes</span>
            )}
          </div>

          {/* Live preview strip */}
          <div className={`mt-6 rounded-xl border p-4 ${dk ? "bg-white/[0.03] border-white/[0.08]" : "bg-gray-50 border-gray-200"}`}>
            <div className="flex items-center gap-3">
              <div className={`text-[10px] font-semibold uppercase tracking-wide ${dk ? "text-white/40" : "text-gray-500"}`}>Now ({now})</div>
              {liveBlock ? (
                <>
                  <div className={`px-2 py-1 rounded-md text-xs font-semibold ${dk ? "bg-cyan-500/20 text-cyan-300" : "bg-cyan-100 text-cyan-700"}`}>
                    {liveBlock.label}
                  </div>
                  <div className="text-xs text-t3">
                    {liveBlock.start_time}–{liveBlock.end_time}
                  </div>
                  {liveBlock.subject && (
                    <div className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${dk ? "bg-white/10 text-white/60" : "bg-gray-200 text-gray-600"}`}>
                      {liveBlock.subject}
                    </div>
                  )}
                  {liveBlock.is_break ? (
                    <div className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${dk ? "bg-amber-500/20 text-amber-300" : "bg-amber-100 text-amber-700"}`}>
                      break
                    </div>
                  ) : null}
                </>
              ) : (
                <div className="text-xs text-t3">No block matches the current time.</div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
