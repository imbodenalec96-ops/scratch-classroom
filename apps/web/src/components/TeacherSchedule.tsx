import { Fragment, useEffect, useMemo, useState } from "react";
import { Clock, Plus, Trash2, Save, RotateCcw, AlertCircle, Coffee } from "lucide-react";
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
  { value: "", label: "None" },
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

// Subject color palette — each returns { bg, text, dot } tailwind-friendly inline style strings
const SUBJECT_COLORS: Record<string, { bg: string; text: string; dot: string }> = {
  math:           { bg: "rgba(59,130,246,0.15)",  text: "#60a5fa", dot: "#3b82f6" },
  reading:        { bg: "rgba(16,185,129,0.15)",  text: "#34d399", dot: "#10b981" },
  writing:        { bg: "rgba(168,85,247,0.15)",  text: "#c084fc", dot: "#a855f7" },
  spelling:       { bg: "rgba(236,72,153,0.15)",  text: "#f472b6", dot: "#ec4899" },
  sel:            { bg: "rgba(245,158,11,0.15)",  text: "#fbbf24", dot: "#f59e0b" },
  daily_news:     { bg: "rgba(99,102,241,0.15)",  text: "#818cf8", dot: "#6366f1" },
  review:         { bg: "rgba(20,184,166,0.15)",  text: "#2dd4bf", dot: "#14b8a6" },
  extra_review:   { bg: "rgba(20,184,166,0.12)",  text: "#2dd4bf", dot: "#14b8a6" },
  cashout:        { bg: "rgba(234,179,8,0.15)",   text: "#facc15", dot: "#eab308" },
  video_learning: { bg: "rgba(239,68,68,0.15)",   text: "#f87171", dot: "#ef4444" },
  ted_talk:       { bg: "rgba(239,68,68,0.15)",   text: "#f87171", dot: "#ef4444" },
  coding_art_gym: { bg: "rgba(139,92,246,0.2)",   text: "#a78bfa", dot: "#7c3aed" },
  dismissal:      { bg: "rgba(107,114,128,0.15)", text: "#9ca3af", dot: "#6b7280" },
  recess:         { bg: "rgba(34,197,94,0.15)",   text: "#4ade80", dot: "#22c55e" },
  calm_down:      { bg: "rgba(56,189,248,0.15)",  text: "#38bdf8", dot: "#0ea5e9" },
  lunch:          { bg: "rgba(251,146,60,0.15)",  text: "#fb923c", dot: "#f97316" },
};

const BREAK_COLORS: Record<string, { bg: string; text: string; dot: string }> = {
  recess:    { bg: "rgba(34,197,94,0.12)",  text: "#4ade80", dot: "#22c55e" },
  calm_down: { bg: "rgba(56,189,248,0.12)", text: "#38bdf8", dot: "#0ea5e9" },
  lunch:     { bg: "rgba(251,146,60,0.12)", text: "#fb923c", dot: "#f97316" },
  regular:   { bg: "rgba(255,255,255,0.06)", text: "#9ca3af", dot: "#6b7280" },
};

function getBlockColor(b: Block) {
  if (b.is_break) return BREAK_COLORS[b.break_type || "regular"] || BREAK_COLORS.regular;
  if (b.subject && SUBJECT_COLORS[b.subject]) return SUBJECT_COLORS[b.subject];
  return { bg: "rgba(255,255,255,0.04)", text: "var(--t2)", dot: "#6b7280" };
}

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

function formatTime(t: string): string {
  if (!t) return "";
  const [h, m] = t.split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  const hour = h % 12 || 12;
  return `${hour}:${String(m).padStart(2, "0")} ${ampm}`;
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
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);

  useEffect(() => {
    const iv = setInterval(() => setNow(nowHHMM()), 30_000);
    return () => clearInterval(iv);
  }, []);

  useEffect(() => {
    api.getClasses()
      .then((cs: any[]) => {
        setClasses(cs || []);
        if ((cs || []).length && !classId) setClassId(cs[0].id);
      })
      .catch((e) => setError(e?.message || "Failed to load classes"));
  }, []);

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
    const newIndex = blocks.length;
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
    setExpandedIndex(newIndex);
  }

  function deleteBlock(index: number) {
    const b = blocks[index];
    if (!confirm(`Delete block "${b?.label || index + 1}"?`)) return;
    setBlocks((prev) => prev.filter((_, i) => i !== index));
    if (expandedIndex === index) setExpandedIndex(null);
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
    <div className="max-w-4xl mx-auto p-6 pb-28">
      {/* Header */}
      <div className="flex items-start justify-between mb-8 flex-wrap gap-4">
        <div>
          <div className="text-[10px] uppercase tracking-[0.18em] mb-1.5" style={{ color: "var(--t3)" }}>Teacher Settings</div>
          <h1 className="text-2xl font-bold flex items-center gap-2.5" style={{ color: "var(--t1)" }}>
            <span className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: "rgba(124,58,237,0.2)" }}>
              <Clock size={16} style={{ color: "#a78bfa" }} />
            </span>
            Schedule Editor
          </h1>
          <p className="text-sm mt-1.5 max-w-lg" style={{ color: "var(--t3)" }}>
            Define daily blocks, breaks, and subjects. Students' auto-navigation reads from here.
          </p>
        </div>
        {classes.length > 1 && (
          <select
            value={classId}
            onChange={(e) => setClassId(e.target.value)}
            className="input text-sm"
            style={{ minWidth: 160 }}
          >
            {classes.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        )}
      </div>

      {error && (
        <div className="mb-5 rounded-xl border px-4 py-3 text-sm flex items-start gap-2.5"
          style={{ background: "rgba(239,68,68,0.08)", borderColor: "rgba(239,68,68,0.25)", color: "#fca5a5" }}>
          <AlertCircle size={15} className="mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Live now strip */}
      {!loading && (
        <div className="mb-5 rounded-xl border px-4 py-3 flex items-center gap-3 flex-wrap"
          style={{
            background: liveBlock ? "rgba(124,58,237,0.08)" : "rgba(255,255,255,0.02)",
            borderColor: liveBlock ? "rgba(124,58,237,0.25)" : "rgba(255,255,255,0.06)",
          }}>
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full animate-pulse"
              style={{ background: liveBlock ? "#a78bfa" : "#4b5563" }} />
            <span className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--t3)" }}>
              Now · {formatTime(now)}
            </span>
          </div>
          {liveBlock ? (
            <>
              <span className="text-[11px]" style={{ color: "var(--t3)" }}>|</span>
              <span className="text-sm font-semibold" style={{ color: "var(--t1)" }}>{liveBlock.label}</span>
              <span className="text-xs" style={{ color: "var(--t3)" }}>
                {formatTime(liveBlock.start_time)} – {formatTime(liveBlock.end_time)}
              </span>
              {liveBlock.subject && (
                <span className="text-[11px] font-medium px-2 py-0.5 rounded-full"
                  style={{
                    background: getBlockColor(liveBlock).bg,
                    color: getBlockColor(liveBlock).text,
                  }}>
                  {SUBJECTS.find(s => s.value === liveBlock.subject)?.label || liveBlock.subject}
                </span>
              )}
              {liveBlock.is_break && (
                <span className="text-[11px] font-medium px-2 py-0.5 rounded-full"
                  style={{ background: "rgba(255,255,255,0.08)", color: "var(--t2)" }}>
                  Break
                </span>
              )}
            </>
          ) : (
            <span className="text-sm" style={{ color: "var(--t3)" }}>No block active right now</span>
          )}
        </div>
      )}

      {loading ? (
        <div className="rounded-2xl border flex items-center justify-center py-24"
          style={{ borderColor: "rgba(255,255,255,0.06)", background: "rgba(255,255,255,0.02)" }}>
          <div className="text-sm" style={{ color: "var(--t3)" }}>Loading schedule…</div>
        </div>
      ) : (
        <>
          {/* Block list */}
          <div className="space-y-2">
            {blocks.length === 0 && (
              <div className="rounded-2xl border flex flex-col items-center justify-center py-16 gap-3"
                style={{ borderColor: "rgba(255,255,255,0.06)", background: "rgba(255,255,255,0.02)" }}>
                <Clock size={24} style={{ color: "var(--t3)", opacity: 0.4 }} />
                <p className="text-sm" style={{ color: "var(--t3)" }}>No blocks yet. Click "Add block" below to start.</p>
              </div>
            )}
            {blocks.map((b, i) => {
              const days = normalizeDays(b.active_days);
              const isLive = liveBlock === b;
              const color = getBlockColor(b);
              const isExpanded = expandedIndex === i;
              const selContent = b.subject === "sel" ? parseSelContent(b.content_source) : null;

              return (
                <Fragment key={i}>
                  {/* Block card */}
                  <div
                    className="rounded-2xl border overflow-hidden transition-all"
                    style={{
                      borderColor: isLive ? "rgba(124,58,237,0.4)" : isExpanded ? "rgba(255,255,255,0.12)" : "rgba(255,255,255,0.07)",
                      background: isLive ? "rgba(124,58,237,0.07)" : isExpanded ? "rgba(255,255,255,0.04)" : "rgba(255,255,255,0.02)",
                      boxShadow: isLive ? "0 0 0 1px rgba(124,58,237,0.2)" : "none",
                    }}
                  >
                    {/* Collapsed summary row — click to expand */}
                    <button
                      className="w-full text-left"
                      onClick={() => setExpandedIndex(isExpanded ? null : i)}
                    >
                      <div className="flex items-center gap-3 px-4 py-3">
                        {/* Color dot + block number */}
                        <div className="flex items-center gap-2 shrink-0">
                          <div className="w-2.5 h-2.5 rounded-full" style={{ background: color.dot }} />
                          <span className="text-[11px] font-mono font-semibold w-5 text-right" style={{ color: "var(--t3)" }}>
                            {i + 1}
                          </span>
                        </div>

                        {/* Time range */}
                        <div className="shrink-0 text-xs font-mono font-semibold w-32" style={{ color: "var(--t2)" }}>
                          {formatTime(b.start_time)} – {formatTime(b.end_time)}
                        </div>

                        {/* Label */}
                        <div className="flex-1 text-sm font-semibold truncate" style={{ color: "var(--t1)" }}>
                          {b.label || <span style={{ color: "var(--t3)" }}>Untitled block</span>}
                        </div>

                        {/* Subject / break pill */}
                        {(b.subject || b.is_break) && (
                          <div className="shrink-0 text-[11px] font-medium px-2.5 py-1 rounded-full"
                            style={{ background: color.bg, color: color.text }}>
                            {b.is_break
                              ? (BREAK_TYPES.find(t => t.value === (b.break_type || "regular"))?.label || "Break")
                              : (SUBJECTS.find(s => s.value === b.subject)?.label || b.subject)}
                          </div>
                        )}

                        {/* Day pills */}
                        <div className="flex gap-0.5 shrink-0">
                          {DAYS.map((d) => (
                            <span key={d}
                              className="text-[9px] font-bold w-6 h-5 rounded flex items-center justify-center"
                              style={{
                                background: days.includes(d) ? color.bg : "rgba(255,255,255,0.04)",
                                color: days.includes(d) ? color.text : "rgba(255,255,255,0.2)",
                              }}>
                              {d[0]}
                            </span>
                          ))}
                        </div>

                        {/* Live badge */}
                        {isLive && (
                          <span className="shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full animate-pulse"
                            style={{ background: "rgba(124,58,237,0.25)", color: "#a78bfa" }}>
                            LIVE
                          </span>
                        )}

                        {/* Expand chevron */}
                        <span className="shrink-0 text-xs transition-transform ml-1"
                          style={{
                            color: "var(--t3)",
                            transform: isExpanded ? "rotate(180deg)" : "rotate(0deg)",
                            display: "inline-block",
                          }}>
                          ▾
                        </span>
                      </div>
                    </button>

                    {/* Expanded edit form */}
                    {isExpanded && (
                      <div className="px-4 pb-4 pt-1 border-t" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
                          {/* Start time */}
                          <label className="flex flex-col gap-1.5">
                            <span className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: "var(--t3)" }}>Start</span>
                            <input
                              type="time"
                              value={b.start_time}
                              onChange={(e) => updateBlock(i, { start_time: e.target.value })}
                              className="input text-sm font-mono"
                            />
                          </label>
                          {/* End time */}
                          <label className="flex flex-col gap-1.5">
                            <span className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: "var(--t3)" }}>End</span>
                            <input
                              type="time"
                              value={b.end_time}
                              onChange={(e) => updateBlock(i, { end_time: e.target.value })}
                              className="input text-sm font-mono"
                            />
                          </label>
                          {/* Label */}
                          <label className="flex flex-col gap-1.5 sm:col-span-2">
                            <span className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: "var(--t3)" }}>Label</span>
                            <input
                              type="text"
                              value={b.label}
                              onChange={(e) => updateBlock(i, { label: e.target.value })}
                              className="input text-sm"
                              placeholder="Block label"
                            />
                          </label>
                        </div>

                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-3">
                          {/* Subject */}
                          <label className="flex flex-col gap-1.5">
                            <span className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: "var(--t3)" }}>Subject</span>
                            <select
                              value={b.subject || ""}
                              onChange={(e) => updateBlock(i, { subject: e.target.value || null })}
                              className="input text-sm"
                            >
                              {SUBJECTS.map((s) => (
                                <option key={s.value} value={s.value}>{s.label}</option>
                              ))}
                            </select>
                          </label>

                          {/* Break toggle + type */}
                          <label className="flex flex-col gap-1.5">
                            <span className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: "var(--t3)" }}>Break type</span>
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => updateBlock(i, {
                                  is_break: !b.is_break,
                                  break_type: !b.is_break ? (b.break_type || "regular") : null,
                                })}
                                className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg border transition-all"
                                style={{
                                  background: b.is_break ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.03)",
                                  borderColor: b.is_break ? "rgba(255,255,255,0.2)" : "rgba(255,255,255,0.07)",
                                  color: b.is_break ? "var(--t1)" : "var(--t3)",
                                }}>
                                <Coffee size={12} />
                                {b.is_break ? "Yes" : "No"}
                              </button>
                              {b.is_break && (
                                <select
                                  value={b.break_type || "regular"}
                                  onChange={(e) => updateBlock(i, { break_type: e.target.value })}
                                  className="input text-sm flex-1"
                                >
                                  {BREAK_TYPES.map((t) => (
                                    <option key={t.value} value={t.value}>{t.label}</option>
                                  ))}
                                </select>
                              )}
                            </div>
                          </label>

                          {/* Active days */}
                          <div className="flex flex-col gap-1.5">
                            <span className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: "var(--t3)" }}>Active days</span>
                            <div className="flex gap-1.5 flex-wrap">
                              {DAYS.map((d) => {
                                const on = days.includes(d);
                                return (
                                  <button
                                    key={d}
                                    onClick={() => {
                                      const next = on ? days.filter((x) => x !== d) : [...days, d];
                                      updateBlock(i, { active_days: DAYS.filter((x) => next.includes(x)) });
                                    }}
                                    className="text-[11px] font-bold w-9 h-8 rounded-lg border transition-all"
                                    style={{
                                      background: on ? color.bg : "rgba(255,255,255,0.04)",
                                      borderColor: on ? color.dot + "60" : "rgba(255,255,255,0.08)",
                                      color: on ? color.text : "rgba(255,255,255,0.3)",
                                    }}
                                    title={d}
                                  >
                                    {d[0]}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        </div>

                        {/* SEL content sub-row */}
                        {selContent && (
                          <div className="rounded-xl p-3 mb-3 border"
                            style={{ background: "rgba(245,158,11,0.07)", borderColor: "rgba(245,158,11,0.2)" }}>
                            <div className="text-[10px] font-bold uppercase tracking-wide mb-2" style={{ color: "#fbbf24" }}>
                              SEL Content Links
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                              <label className="flex flex-col gap-1">
                                <span className="text-[10px]" style={{ color: "var(--t3)" }}>Video URL</span>
                                <input
                                  type="url"
                                  placeholder="YouTube, Vimeo…"
                                  value={selContent.videoUrl}
                                  onChange={(e) => updateBlock(i, { content_source: buildSelContent(e.target.value, selContent.assignmentUrl) })}
                                  className="input text-xs"
                                />
                              </label>
                              <label className="flex flex-col gap-1">
                                <span className="text-[10px]" style={{ color: "var(--t3)" }}>Assignment URL</span>
                                <input
                                  type="url"
                                  placeholder="Google Form…"
                                  value={selContent.assignmentUrl}
                                  onChange={(e) => updateBlock(i, { content_source: buildSelContent(selContent.videoUrl, e.target.value) })}
                                  className="input text-xs"
                                />
                              </label>
                            </div>
                          </div>
                        )}

                        {/* Delete action */}
                        <div className="flex justify-end pt-1">
                          <button
                            onClick={() => deleteBlock(i)}
                            className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border transition-all"
                            style={{
                              background: "rgba(239,68,68,0.07)",
                              borderColor: "rgba(239,68,68,0.2)",
                              color: "#f87171",
                            }}
                          >
                            <Trash2 size={12} /> Delete block
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </Fragment>
              );
            })}
          </div>

          {/* Bottom action bar */}
          <div className="fixed bottom-0 left-0 right-0 z-20 flex items-center justify-between gap-3 px-6 py-4 border-t"
            style={{
              background: "rgba(7,7,20,0.85)",
              backdropFilter: "blur(16px)",
              borderColor: "rgba(255,255,255,0.07)",
            }}>
            <button
              onClick={addBlock}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold border transition-all"
              style={{
                background: "rgba(255,255,255,0.05)",
                borderColor: "rgba(255,255,255,0.1)",
                color: "var(--t1)",
              }}>
              <Plus size={15} /> Add block
            </button>

            <div className="flex items-center gap-2">
              {dirty && (
                <span className="text-xs font-medium" style={{ color: "#f59e0b" }}>Unsaved changes</span>
              )}
              <button
                onClick={resetDefault}
                disabled={saving}
                className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold border transition-all disabled:opacity-40"
                style={{
                  background: "rgba(245,158,11,0.08)",
                  borderColor: "rgba(245,158,11,0.2)",
                  color: "#fbbf24",
                }}>
                <RotateCcw size={14} /> Reset
              </button>
              <button
                onClick={saveAll}
                disabled={!dirty || saving}
                className="flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-bold transition-all disabled:opacity-40"
                style={{
                  background: savedFlash ? "rgba(16,185,129,0.85)" : dirty ? "#7c3aed" : "rgba(255,255,255,0.06)",
                  color: dirty || savedFlash ? "white" : "var(--t3)",
                  boxShadow: dirty && !savedFlash ? "0 0 20px rgba(124,58,237,0.4)" : "none",
                }}>
                <Save size={14} />
                {saving ? "Saving…" : savedFlash ? "Saved!" : dirty ? "Save changes" : "No changes"}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
