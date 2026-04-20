import { Fragment, useEffect, useMemo, useState } from "react";
import { Clock, Plus, Trash2, Save, RotateCcw, AlertCircle, Coffee, Sparkles, Loader2, CheckCircle2, SkipForward, Send, Pencil } from "lucide-react";
import { api } from "../lib/api.ts";
import { useTheme } from "../lib/theme.tsx";
import { subjectToRoute } from "../lib/useBlockAutoNav.ts";

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

/**
 * Generic block-content helpers — coexist with the SEL-specific ones above.
 *
 * `content_source` is shared storage. SEL packs `{ videoUrl, assignmentUrl }`;
 * academic blocks pack `{ assignmentId?, videoUrl?, newsUrl?, byDay? }` where
 * `byDay` is `{ Mon: {...}, Tue: {...}, ... }` with per-day overrides. Root
 * fields remain the default/fallback for any day not in `byDay`. We tolerate
 * unknown keys on parse so a block that was once SEL (assignmentUrl) and
 * becomes math (assignmentId) doesn't explode if the teacher just changes
 * subject.
 */
export interface BlockContentDay {
  assignmentId?: string;
  videoUrl?: string;
  newsUrl?: string;
  /** Per-grade assignment overrides. Keys are grade numbers as strings. */
  byGrade?: Partial<Record<string, string>>;
  /** Per-student assignment overrides. Keys are user ids. Beats byGrade. */
  byStudent?: Partial<Record<string, string>>;
}

export interface BlockContent extends BlockContentDay {
  /** Per-day overrides. Keys are "Mon"…"Fri". Each value narrows the default. */
  byDay?: Partial<Record<string, BlockContentDay>>;
}

function sanitizeDayContent(raw: any): BlockContentDay {
  const out: BlockContentDay = {};
  if (raw && typeof raw === "object") {
    if (typeof raw.assignmentId === "string" && raw.assignmentId) out.assignmentId = raw.assignmentId;
    if (typeof raw.videoUrl === "string" && raw.videoUrl) out.videoUrl = raw.videoUrl;
    if (typeof raw.newsUrl === "string" && raw.newsUrl) out.newsUrl = raw.newsUrl;
    if (raw.byGrade && typeof raw.byGrade === "object") {
      const bg: Record<string, string> = {};
      for (const k of Object.keys(raw.byGrade)) {
        const v = (raw.byGrade as any)[k];
        if (typeof v === "string" && v) bg[k] = v;
      }
      if (Object.keys(bg).length) out.byGrade = bg;
    }
    if (raw.byStudent && typeof raw.byStudent === "object") {
      const bs: Record<string, string> = {};
      for (const k of Object.keys(raw.byStudent)) {
        const v = (raw.byStudent as any)[k];
        if (typeof v === "string" && v) bs[k] = v;
      }
      if (Object.keys(bs).length) out.byStudent = bs;
    }
  }
  return out;
}

export function parseBlockContent(raw: string | null | undefined): BlockContent {
  if (!raw) return {};
  try {
    const p = JSON.parse(raw);
    const out: BlockContent = sanitizeDayContent(p);
    if (p && typeof p.byDay === "object" && p.byDay) {
      const byDay: Partial<Record<string, BlockContentDay>> = {};
      for (const d of ["Mon", "Tue", "Wed", "Thu", "Fri"]) {
        const day = sanitizeDayContent((p.byDay as any)[d]);
        if (Object.keys(day).length) byDay[d] = day;
      }
      if (Object.keys(byDay).length) out.byDay = byDay;
    }
    return out;
  } catch { return {}; }
}

function trimmedOrUndef(s?: string): string | undefined {
  const v = (s || "").trim();
  return v ? v : undefined;
}

function trimmedByGrade(raw?: Partial<Record<string, string>>): Record<string, string> | undefined {
  if (!raw) return undefined;
  const out: Record<string, string> = {};
  for (const k of Object.keys(raw)) {
    const v = trimmedOrUndef((raw as any)[k]);
    if (v) out[k] = v;
  }
  return Object.keys(out).length ? out : undefined;
}

/** Same shape as byGrade but keyed by student id. */
const trimmedByStudent = trimmedByGrade;

export function buildBlockContent(next: BlockContent): string | null {
  const obj: Record<string, any> = {};
  const aId = trimmedOrUndef(next.assignmentId);
  const vUrl = trimmedOrUndef(next.videoUrl);
  const nUrl = trimmedOrUndef(next.newsUrl);
  const rootByGrade = trimmedByGrade(next.byGrade);
  const rootByStudent = trimmedByStudent(next.byStudent);
  if (aId) obj.assignmentId = aId;
  if (vUrl) obj.videoUrl = vUrl;
  if (nUrl) obj.newsUrl = nUrl;
  if (rootByGrade) obj.byGrade = rootByGrade;
  if (rootByStudent) obj.byStudent = rootByStudent;
  if (next.byDay) {
    const byDay: Record<string, BlockContentDay> = {};
    for (const d of ["Mon", "Tue", "Wed", "Thu", "Fri"]) {
      const raw = next.byDay[d] || {};
      const day: BlockContentDay = {};
      const dA = trimmedOrUndef(raw.assignmentId);
      const dV = trimmedOrUndef(raw.videoUrl);
      const dN = trimmedOrUndef(raw.newsUrl);
      const dByGrade = trimmedByGrade(raw.byGrade);
      const dByStudent = trimmedByStudent(raw.byStudent);
      if (dA) day.assignmentId = dA;
      if (dV) day.videoUrl = dV;
      if (dN) day.newsUrl = dN;
      if (dByGrade) day.byGrade = dByGrade;
      if (dByStudent) day.byStudent = dByStudent;
      if (Object.keys(day).length) byDay[d] = day;
    }
    if (Object.keys(byDay).length) obj.byDay = byDay;
  }
  if (!Object.keys(obj).length) return null;
  return JSON.stringify(obj);
}

/** Subjects that should show an assignment picker. SEL keeps its bespoke UI. */
const ACADEMIC_ASSIGNMENT_SUBJECTS = new Set([
  "math", "reading", "writing", "spelling",
  "daily_news", "review", "extra_review",
  "video_learning",
]);

/** Loose YouTube URL validator — matches the patterns the server accepts. */
function isValidYouTubeUrl(url: string): boolean {
  if (!url) return false;
  const trimmed = url.trim();
  if (/^[A-Za-z0-9_-]{11}$/.test(trimmed)) return true;
  return /(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)[A-Za-z0-9_-]{11}/.test(trimmed);
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
  const [assignments, setAssignments] = useState<any[]>([]);
  const [classStudents, setClassStudents] = useState<any[]>([]);
  // Per-block UI expansion for the advanced "per day" editor
  const [showAdvancedFor, setShowAdvancedFor] = useState<Record<number, boolean>>({});
  // Today's skip list — block ids that have been cancelled just for today.
  // Keyed by block id, value is the schedule_skip row so we can DELETE to un-skip.
  const [skippedToday, setSkippedToday] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [now, setNow] = useState(nowHHMM());
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);
  // SEL "Generate from video" ephemeral state, keyed by block index so each
  // SEL block gets its own spinner / success / error message independently.
  const [selGenState, setSelGenState] = useState<Record<number, { status: "idle" | "loading" | "success" | "error"; message?: string }>>({});

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

  // Pull the class's assignments once per classId — powers the per-block
  // assignment dropdown below. Silent failure keeps the schedule usable even
  // if /assignments 500s.
  useEffect(() => {
    if (!classId) { setAssignments([]); setClassStudents([]); return; }
    let cancelled = false;
    api.getAssignments(classId)
      .then((rows: any[]) => { if (!cancelled) setAssignments(Array.isArray(rows) ? rows : []); })
      .catch(() => { if (!cancelled) setAssignments([]); });
    api.getStudents(classId)
      .then((rows: any[]) => { if (!cancelled) setClassStudents(Array.isArray(rows) ? rows : []); })
      .catch(() => { if (!cancelled) setClassStudents([]); });
    const loadSkips = () => {
      api.getScheduleExtras(classId)
        .then((r) => {
          if (cancelled) return;
          const byId: Record<string, any> = {};
          for (const s of r.skips || []) { if (s?.block_id) byId[String(s.block_id)] = s; }
          setSkippedToday(byId);
        })
        .catch(() => { /* best effort */ });
    };
    loadSkips();
    const iv = setInterval(loadSkips, 20_000);
    return () => { cancelled = true; clearInterval(iv); };
  }, [classId]);

  async function toggleSkip(block: Block) {
    if (!block.id || !classId) return;
    const id = String(block.id);
    const isSkipped = !!skippedToday[id];
    // Optimistic toggle
    setSkippedToday((prev) => {
      const next = { ...prev };
      if (isSkipped) delete next[id]; else next[id] = { block_id: id, _optimistic: true };
      return next;
    });
    try {
      if (isSkipped) await api.unskipBlock(classId, id);
      else await api.skipBlock(classId, id);
    } catch (e: any) {
      // Revert on failure
      setSkippedToday((prev) => {
        const next = { ...prev };
        if (isSkipped) next[id] = { block_id: id };
        else delete next[id];
        return next;
      });
      alert("Couldn't toggle skip: " + (e?.message || "unknown"));
    }
  }

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

      {/* ── Today-at-a-glance tiles ───────────────────────────────────── */}
      {!loading && blocks.length > 0 && (() => {
        // DAYS = Mon..Fri; JS getDay() = 0=Sun..6=Sat. Map 1→Mon..5→Fri.
        const dow = new Date().getDay();
        const todayLetter = dow >= 1 && dow <= 5 ? DAYS[dow - 1] : "Mon";
        const todaysBlocks = blocks
          .filter((b) => {
            const d = normalizeDays(b.active_days);
            return d.length === 0 || d.includes(todayLetter);
          })
          .slice()
          .sort((a, b) => a.start_time.localeCompare(b.start_time));
        if (!todaysBlocks.length) return null;

        const pushBlockToDashboard = async (b: Block) => {
          if (!classId) return;
          const route = subjectToRoute({ ...b, id: b.id || "", class_id: classId, content_source: b.content_source ?? null } as any);
          if (!route) {
            alert("This block doesn't have a route to push (break / dismissal / etc.).");
            return;
          }
          try {
            await api.sendClassCommand(classId, "NAVIGATE", route);
            alert(`Pushed every student to ${route}`);
          } catch (e: any) {
            alert("Push failed: " + (e?.message || "unknown"));
          }
        };

        const openBlock = (b: Block) => {
          const idx = blocks.findIndex((x) => x === b);
          if (idx >= 0) {
            setExpandedIndex(idx);
            setTimeout(() => {
              const el = document.getElementById(`block-${idx}`);
              el?.scrollIntoView({ behavior: "smooth", block: "center" });
            }, 100);
          }
        };

        return (
          <section className="mb-6">
            <div className="flex items-center justify-between mb-3">
              <div>
                <div className="text-[10px] font-bold uppercase tracking-[0.18em]" style={{ color: "var(--t3)" }}>Today · {todayLetter}</div>
                <h2 className="text-lg font-bold mt-0.5" style={{ color: "var(--t1)" }}>At a glance</h2>
              </div>
              <div className="text-[11px]" style={{ color: "var(--t3)" }}>
                {todaysBlocks.length} block{todaysBlocks.length === 1 ? "" : "s"} · tap a tile to edit below
              </div>
            </div>
            <div className="grid gap-2.5" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))" }}>
              {todaysBlocks.map((b) => {
                const isLiveTile = liveBlock === b;
                const isSkipped = b.id ? !!skippedToday[String(b.id)] : false;
                const color = getBlockColor(b);
                const subjLabel = b.is_break
                  ? (BREAK_TYPES.find((t) => t.value === (b.break_type || "regular"))?.label || "Break")
                  : (SUBJECTS.find((s) => s.value === b.subject)?.label || b.subject || "—");
                return (
                  <div
                    key={`today-${b.id}`}
                    className="rounded-2xl border p-3.5 transition-all flex flex-col gap-2.5"
                    style={{
                      borderColor: isLiveTile
                        ? "rgba(124,58,237,0.55)"
                        : isSkipped
                          ? "rgba(239,68,68,0.35)"
                          : "rgba(255,255,255,0.08)",
                      background: isLiveTile
                        ? "linear-gradient(140deg, rgba(124,58,237,0.14), rgba(139,92,246,0.04))"
                        : isSkipped
                          ? "rgba(239,68,68,0.05)"
                          : "rgba(255,255,255,0.03)",
                      boxShadow: isLiveTile ? "0 0 32px rgba(124,58,237,0.28), 0 0 0 1px rgba(124,58,237,0.25)" : "none",
                      opacity: isSkipped ? 0.72 : 1,
                      animation: isLiveTile ? "tileGlow 2.5s ease-in-out infinite" : undefined,
                      textDecoration: isSkipped ? "line-through" : "none",
                      minHeight: 52,
                    }}
                  >
                    <style>{`@keyframes tileGlow { 0%,100% { box-shadow: 0 0 32px rgba(124,58,237,0.28), 0 0 0 1px rgba(124,58,237,0.25); } 50% { box-shadow: 0 0 48px rgba(124,58,237,0.45), 0 0 0 1px rgba(124,58,237,0.5); } }`}</style>

                    {/* Header row: color stripe + label + time */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="text-[10px] font-mono font-semibold tabular-nums" style={{ color: "var(--t3)" }}>
                          {formatTime(b.start_time)} – {formatTime(b.end_time)}
                        </div>
                        <div className="text-[15px] font-bold mt-0.5 truncate" style={{ color: "var(--t1)" }}>
                          {b.label || <span style={{ color: "var(--t3)" }}>Untitled</span>}
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {isLiveTile && (
                          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-md animate-pulse"
                            style={{ background: "rgba(124,58,237,0.3)", color: "#c4b5fd" }}>
                            LIVE
                          </span>
                        )}
                        {isSkipped && (
                          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-md"
                            style={{ background: "rgba(239,68,68,0.2)", color: "#fca5a5" }}>
                            SKIPPED
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Subject pill */}
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ background: color.dot }} />
                      <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full"
                        style={{ background: color.bg, color: color.text }}>
                        {subjLabel}
                      </span>
                    </div>

                    {/* Actions row — minimum 44×44 touch targets on iPad */}
                    <div className="grid grid-cols-3 gap-1.5 mt-1">
                      {b.id && (
                        <button
                          onClick={() => toggleSkip(b)}
                          className="flex items-center justify-center gap-1 text-[11px] font-bold rounded-lg border transition-colors"
                          style={{
                            minHeight: 44,
                            background: isSkipped ? "rgba(34,197,94,0.12)" : "rgba(239,68,68,0.1)",
                            color: isSkipped ? "#86efac" : "#fca5a5",
                            borderColor: isSkipped ? "rgba(34,197,94,0.3)" : "rgba(239,68,68,0.25)",
                            cursor: "pointer",
                          }}
                          title={isSkipped ? "Un-skip" : "Skip just for today"}
                        >
                          <SkipForward size={12} />
                          <span>{isSkipped ? "Un-skip" : "Skip"}</span>
                        </button>
                      )}
                      <button
                        onClick={() => pushBlockToDashboard(b)}
                        className="flex items-center justify-center gap-1 text-[11px] font-bold rounded-lg border transition-colors"
                        style={{
                          minHeight: 44,
                          background: "rgba(124,58,237,0.12)",
                          color: "#c4b5fd",
                          borderColor: "rgba(124,58,237,0.3)",
                          cursor: "pointer",
                        }}
                        title="Push every student to this block's page now"
                        disabled={!!b.is_break}
                      >
                        <Send size={12} />
                        <span>Push</span>
                      </button>
                      <button
                        onClick={() => openBlock(b)}
                        className="flex items-center justify-center gap-1 text-[11px] font-bold rounded-lg border transition-colors"
                        style={{
                          minHeight: 44,
                          background: "rgba(255,255,255,0.04)",
                          color: "var(--t2)",
                          borderColor: "rgba(255,255,255,0.1)",
                          cursor: "pointer",
                        }}
                        title="Open the full editor for this block"
                      >
                        <Pencil size={12} />
                        <span>Edit</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        );
      })()}

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
              // Academic blocks share `content_source` with SEL but shape it as
              // `{ assignmentId, videoUrl }` — the dropdown below reads/writes
              // the assignmentId half via the generic helpers.
              const isAcademic = !!b.subject && ACADEMIC_ASSIGNMENT_SUBJECTS.has(b.subject);
              const blockContent = isAcademic ? parseBlockContent(b.content_source) : null;
              // Filter the class's assignments by the block's subject when the
              // assignment carries one. Fall back to description substring match
              // (some legacy rows only tag subject in description) and finally
              // to "show everything" so the teacher can always pick something.
              const assignmentOptions = isAcademic
                ? assignments.filter((a: any) => {
                    const subj = b.subject as string;
                    if (!a) return false;
                    if (a.target_subject && String(a.target_subject).toLowerCase() === subj) return true;
                    if (a.subject && String(a.subject).toLowerCase() === subj) return true;
                    if (typeof a.description === "string" && a.description.toLowerCase().includes(subj)) return true;
                    // If the assignment has no subject tag at all, keep it visible
                    // rather than hiding useful content.
                    return !a.target_subject && !a.subject;
                  })
                : [];

              return (
                <Fragment key={i}>
                  {/* Block card */}
                  <div
                    id={`block-${i}`}
                    className="rounded-2xl border overflow-hidden transition-all"
                    style={{
                      borderColor: isLive ? "rgba(124,58,237,0.4)" : isExpanded ? "rgba(255,255,255,0.12)" : "rgba(255,255,255,0.07)",
                      background: isLive ? "rgba(124,58,237,0.07)" : isExpanded ? "rgba(255,255,255,0.04)" : "rgba(255,255,255,0.02)",
                      boxShadow: isLive ? "0 0 0 1px rgba(124,58,237,0.2)" : "none",
                      opacity: (b.id && skippedToday[String(b.id)]) ? 0.55 : 1,
                      scrollMarginTop: 96,
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

                        {/* Skipped-today badge */}
                        {b.id && skippedToday[String(b.id)] && (
                          <span className="shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full"
                            style={{ background: "rgba(239,68,68,0.2)", color: "#fca5a5", border: "1px solid rgba(239,68,68,0.35)" }}>
                            SKIPPED TODAY
                          </span>
                        )}

                        {/* Skip/un-skip (today only) */}
                        {b.id && (
                          <button
                            onClick={(e) => { e.stopPropagation(); toggleSkip(b); }}
                            className="shrink-0 text-[10px] font-bold px-2.5 py-1 rounded-md transition-all"
                            style={{
                              background: skippedToday[String(b.id)] ? "rgba(34,197,94,0.15)" : "rgba(239,68,68,0.1)",
                              color: skippedToday[String(b.id)] ? "#86efac" : "#fca5a5",
                              border: skippedToday[String(b.id)] ? "1px solid rgba(34,197,94,0.3)" : "1px solid rgba(239,68,68,0.25)",
                              cursor: "pointer",
                            }}
                            title={skippedToday[String(b.id)] ? "Un-skip for today" : "Skip this block today only"}
                          >
                            {skippedToday[String(b.id)] ? "Un-skip" : "Skip Today"}
                          </button>
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

                        {/* Academic assignment picker — same storage slot as SEL
                            (`content_source`), just a different JSON shape.
                            Renders a "Same for every day" default picker on top
                            and a compact row of per-day mini-pickers below. */}
                        {isAcademic && blockContent && (() => {
                          const subjLabel = SUBJECTS.find(s => s.value === b.subject)?.label || b.subject;
                          const isDailyNews = b.subject === "daily_news";
                          const isVideoLearning = b.subject === "video_learning";
                          const renderAssignmentOptions = () => (
                            <>
                              <option value="">— Use default —</option>
                              {assignmentOptions.map((a: any) => (
                                <option key={a.id} value={a.id}>
                                  {a.title}{a.target_subject ? ` · ${a.target_subject}` : ""}
                                </option>
                              ))}
                            </>
                          );
                          return (
                            <div className="rounded-xl p-3 mb-3 border"
                              style={{ background: "rgba(124,58,237,0.06)", borderColor: "rgba(124,58,237,0.2)" }}>
                              <div className="text-[10px] font-bold uppercase tracking-wide mb-2" style={{ color: "#a78bfa" }}>
                                {subjLabel} Assignment
                              </div>

                              {/* "Same for every day" default — root-level fallback. */}
                              <div className="mb-3">
                                <label className="flex flex-col gap-1">
                                  <span className="text-[10px]" style={{ color: "var(--t3)" }}>
                                    Same for every day (default)
                                    {assignmentOptions.length === 0 && assignments.length > 0 && (
                                      <span className="ml-1.5 opacity-70">(no matches for this subject — showing none)</span>
                                    )}
                                  </span>
                                  <select
                                    value={blockContent.assignmentId || ""}
                                    onChange={(e) => updateBlock(i, {
                                      content_source: buildBlockContent({
                                        ...blockContent,
                                        assignmentId: e.target.value || undefined,
                                      }),
                                    })}
                                    className="input text-xs"
                                  >
                                    <option value="">— None —</option>
                                    {assignmentOptions.map((a: any) => (
                                      <option key={a.id} value={a.id}>
                                        {a.title}{a.target_subject ? ` · ${a.target_subject}` : ""}
                                      </option>
                                    ))}
                                    {blockContent.assignmentId &&
                                      !assignmentOptions.some((a: any) => a.id === blockContent.assignmentId) && (
                                      <option value={blockContent.assignmentId}>
                                        (currently saved: {blockContent.assignmentId.slice(0, 8)}…)
                                      </option>
                                    )}
                                  </select>
                                </label>
                              </div>

                              {/* Per-student pickers — one per student in the class.
                                  Simpler than abstract grade levels: just pick the
                                  specific assignment for each kid. Empty = use default. */}
                              {classStudents.length > 0 && (
                                <div className="mb-3 pt-2 border-t" style={{ borderColor: "rgba(124,58,237,0.15)" }}>
                                  <div className="text-[10px] mb-1.5" style={{ color: "var(--t3)" }}>
                                    Per student (overrides default — leave blank to use default)
                                  </div>
                                  <div className="grid gap-1.5" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))" }}>
                                    {classStudents.map((stu: any) => {
                                      const byStudent = blockContent.byStudent || {};
                                      const stuVal = byStudent[stu.id] || "";
                                      return (
                                        <label key={stu.id} className="flex flex-col gap-1">
                                          <span className="text-[10px] font-bold flex items-center gap-1" style={{ color: color.text }}>
                                            <span style={{ fontSize: 12 }}>{stu.avatar_emoji || "👤"}</span>
                                            {stu.name}
                                          </span>
                                          <select
                                            value={stuVal}
                                            onChange={(e) => {
                                              const nextByStudent = { ...byStudent };
                                              if (e.target.value) nextByStudent[stu.id] = e.target.value;
                                              else delete nextByStudent[stu.id];
                                              updateBlock(i, {
                                                content_source: buildBlockContent({
                                                  ...blockContent,
                                                  byStudent: Object.keys(nextByStudent).length ? nextByStudent : undefined,
                                                }),
                                              });
                                            }}
                                            className="input text-[11px] py-1 px-1.5"
                                            title={`${stu.name}'s assignment`}
                                          >
                                            {renderAssignmentOptions()}
                                            {stuVal && !assignmentOptions.some((a: any) => a.id === stuVal) && (
                                              <option value={stuVal}>(saved: {stuVal.slice(0, 6)}…)</option>
                                            )}
                                          </select>
                                        </label>
                                      );
                                    })}
                                  </div>
                                </div>
                              )}

                              {/* Advanced toggle — hides per-day complexity */}
                              <button
                                type="button"
                                onClick={() => setShowAdvancedFor(prev => ({ ...prev, [i]: !prev[i] }))}
                                className="text-[10px] font-semibold underline mb-2"
                                style={{ color: "var(--t3)", background: "transparent", border: "none", cursor: "pointer", padding: 0 }}
                              >
                                {showAdvancedFor[i] ? "▾ Hide advanced options" : "▸ Show advanced options (per day)"}
                              </button>

                              {/* Per-day mini-pickers — one per active day. */}
                              {showAdvancedFor[i] && (
                              <div className="mb-1">
                                <div className="text-[10px] mb-1.5" style={{ color: "var(--t3)" }}>
                                  Per day (overrides default)
                                </div>
                                <div className="grid gap-2"
                                  style={{ gridTemplateColumns: `repeat(${Math.max(days.length, 1)}, minmax(0, 1fr))` }}>
                                  {DAYS.filter((d) => days.includes(d)).map((d) => {
                                    const dayVal = blockContent.byDay?.[d] || {};
                                    return (
                                      <label key={d} className="flex flex-col gap-1">
                                        <span className="text-[10px] font-bold" style={{ color: color.text }}>{d}</span>
                                        <select
                                          value={dayVal.assignmentId || ""}
                                          onChange={(e) => {
                                            const next: BlockContent = {
                                              ...blockContent,
                                              byDay: { ...(blockContent.byDay || {}) },
                                            };
                                            const cur = { ...(next.byDay![d] || {}) };
                                            if (e.target.value) cur.assignmentId = e.target.value;
                                            else delete cur.assignmentId;
                                            if (Object.keys(cur).length) next.byDay![d] = cur;
                                            else delete next.byDay![d];
                                            updateBlock(i, { content_source: buildBlockContent(next) });
                                          }}
                                          className="input text-[11px] py-1 px-1.5"
                                          title={`${d} assignment`}
                                        >
                                          {renderAssignmentOptions()}
                                          {dayVal.assignmentId &&
                                            !assignmentOptions.some((a: any) => a.id === dayVal.assignmentId) && (
                                            <option value={dayVal.assignmentId}>
                                              (saved: {dayVal.assignmentId.slice(0, 6)}…)
                                            </option>
                                          )}
                                        </select>
                                      </label>
                                    );
                                  })}
                                  {days.length === 0 && (
                                    <span className="text-[10px] col-span-full" style={{ color: "var(--t3)" }}>
                                      Turn on at least one active day to pick per-day assignments.
                                    </span>
                                  )}
                                </div>
                              </div>
                              )}

                              {/* Video Learning URL — a single YouTube URL for this
                                  block. Students see it embedded on the /video-learning
                                  page. Per-day overrides available via advanced toggle.
                                  Also gets a ✨ Generate button that AI-drafts a
                                  follow-up assignment from the video transcript. */}
                              {isVideoLearning && (() => {
                                const vidGen = selGenState[i] || { status: "idle" as const };
                                const currentVideoUrl = blockContent.videoUrl || "";
                                const canGenVideo = isValidYouTubeUrl(currentVideoUrl) && vidGen.status !== "loading";
                                const runGenVideo = async () => {
                                  setSelGenState((prev) => ({ ...prev, [i]: { status: "loading" } }));
                                  try {
                                    const generated = await api.generateAssignmentFromVideo({
                                      videoUrl: currentVideoUrl,
                                      subject: "video_learning",
                                      questionCount: 6,
                                      title: b.label || "Video Learning",
                                      grade: "K-5",
                                    });
                                    if (!generated) throw new Error("Empty response");
                                    const rubric = Array.isArray(generated.sections)
                                      ? generated.sections.flatMap((sec: any) =>
                                          Array.isArray(sec?.questions)
                                            ? sec.questions.map((q: any) => ({
                                                label: String(q?.text || "Question").slice(0, 60),
                                                maxPoints: Number(q?.points) || 1,
                                              }))
                                            : []
                                        )
                                      : [];
                                    const saved = generated.id
                                      ? generated
                                      : await api.createAssignment({
                                          classId,
                                          title: generated.title || b.label || "Video Learning",
                                          description: generated.instructions || "",
                                          rubric,
                                          content: JSON.stringify({
                                            title: generated.title || b.label || "Video Learning",
                                            subject: generated.subject || "video_learning",
                                            grade: generated.grade || "K-5",
                                            instructions: generated.instructions || "",
                                            totalPoints: generated.totalPoints,
                                            sections: generated.sections || [],
                                          }),
                                          targetSubject: "video_learning",
                                          videoUrl: generated.videoUrl || currentVideoUrl,
                                        });
                                    if (saved?.id) {
                                      try {
                                        const rows = await api.getAssignments(classId);
                                        if (Array.isArray(rows)) setAssignments(rows);
                                      } catch {}
                                      // Auto-wire the saved assignment as the block's default
                                      updateBlock(i, {
                                        content_source: buildBlockContent({
                                          ...blockContent,
                                          assignmentId: saved.id,
                                        }),
                                      });
                                    }
                                    setSelGenState((prev) => ({
                                      ...prev,
                                      [i]: {
                                        status: "success",
                                        message: saved?.id
                                          ? `Saved "${saved.title || "Video Learning"}" and linked it.`
                                          : "Generated — but could not persist. Check server logs.",
                                      },
                                    }));
                                  } catch (err: any) {
                                    setSelGenState((prev) => ({
                                      ...prev,
                                      [i]: { status: "error", message: err?.message || "Generation failed" },
                                    }));
                                  }
                                };
                                return (
                                <div className="mt-3 pt-3 border-t" style={{ borderColor: "rgba(124,58,237,0.15)" }}>
                                  <div className="text-[10px] font-bold uppercase tracking-wide mb-2" style={{ color: "#a78bfa" }}>
                                    📺 YouTube Video URL
                                  </div>
                                  <label className="flex flex-col gap-1 mb-3">
                                    <span className="text-[10px]" style={{ color: "var(--t3)" }}>
                                      Same for every day (default)
                                    </span>
                                    <input
                                      type="url"
                                      placeholder="https://youtube.com/watch?v=…"
                                      value={currentVideoUrl}
                                      onChange={(e) => {
                                        updateBlock(i, {
                                          content_source: buildBlockContent({
                                            ...blockContent,
                                            videoUrl: e.target.value || undefined,
                                          }),
                                        });
                                        if (selGenState[i] && selGenState[i].status !== "loading") {
                                          setSelGenState((prev) => ({ ...prev, [i]: { status: "idle" } }));
                                        }
                                      }}
                                      className="input text-xs"
                                    />
                                  </label>

                                  {/* ✨ Generate assignment from video */}
                                  <div className="mb-3 flex items-center gap-2 flex-wrap">
                                    <button
                                      type="button"
                                      onClick={runGenVideo}
                                      disabled={!canGenVideo}
                                      className="flex items-center gap-1.5 text-[11px] font-semibold px-3 py-1.5 rounded-lg border transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                                      style={{
                                        background: "rgba(244,63,94,0.15)",
                                        borderColor: "rgba(244,63,94,0.35)",
                                        color: "#fb7185",
                                      }}
                                      title={canGenVideo ? "Generate an assignment from the video transcript" : "Paste a YouTube URL first"}
                                    >
                                      {vidGen.status === "loading" ? (
                                        <Loader2 size={12} className="animate-spin" />
                                      ) : (
                                        <Sparkles size={12} />
                                      )}
                                      {vidGen.status === "loading" ? "Generating…" : "Generate assignment from video"}
                                    </button>
                                    {vidGen.status === "success" && (
                                      <span className="flex items-center gap-1 text-[11px]" style={{ color: "#34d399" }}>
                                        <CheckCircle2 size={12} /> {vidGen.message}
                                      </span>
                                    )}
                                    {vidGen.status === "error" && (
                                      <span className="flex items-center gap-1 text-[11px]" style={{ color: "#fca5a5" }}>
                                        <AlertCircle size={12} /> {vidGen.message}
                                      </span>
                                    )}
                                  </div>
                                  {showAdvancedFor[i] && (
                                    <>
                                      <div className="text-[10px] mb-1.5" style={{ color: "var(--t3)" }}>
                                        Per day (overrides default)
                                      </div>
                                      <div className="grid gap-2"
                                        style={{ gridTemplateColumns: `repeat(${Math.max(days.length, 1)}, minmax(0, 1fr))` }}>
                                        {DAYS.filter((d) => days.includes(d)).map((d) => {
                                          const dayVal = blockContent.byDay?.[d] || {};
                                          return (
                                            <label key={d} className="flex flex-col gap-1">
                                              <span className="text-[10px] font-bold" style={{ color: color.text }}>{d}</span>
                                              <input
                                                type="url"
                                                placeholder="URL"
                                                value={dayVal.videoUrl || ""}
                                                onChange={(e) => {
                                                  const next: BlockContent = {
                                                    ...blockContent,
                                                    byDay: { ...(blockContent.byDay || {}) },
                                                  };
                                                  const cur = { ...(next.byDay![d] || {}) };
                                                  if (e.target.value) cur.videoUrl = e.target.value;
                                                  else delete cur.videoUrl;
                                                  if (Object.keys(cur).length) next.byDay![d] = cur;
                                                  else delete next.byDay![d];
                                                  updateBlock(i, { content_source: buildBlockContent(next) });
                                                }}
                                                className="input text-[11px] py-1 px-1.5"
                                                title={`${d} video URL`}
                                              />
                                            </label>
                                          );
                                        })}
                                      </div>
                                    </>
                                  )}
                                </div>
                                );
                              })()}

                              {/* Daily News URL — default + per-day. Only visible
                                  for daily_news blocks. */}
                              {isDailyNews && (
                                <div className="mt-3 pt-3 border-t" style={{ borderColor: "rgba(124,58,237,0.15)" }}>
                                  <div className="text-[10px] font-bold uppercase tracking-wide mb-2" style={{ color: "#a78bfa" }}>
                                    News Article / RSS URL
                                  </div>
                                  <label className="flex flex-col gap-1 mb-3">
                                    <span className="text-[10px]" style={{ color: "var(--t3)" }}>
                                      Same for every day (default)
                                    </span>
                                    <input
                                      type="url"
                                      placeholder="https://… news article or RSS feed"
                                      value={blockContent.newsUrl || ""}
                                      onChange={(e) => updateBlock(i, {
                                        content_source: buildBlockContent({
                                          ...blockContent,
                                          newsUrl: e.target.value || undefined,
                                        }),
                                      })}
                                      className="input text-xs"
                                    />
                                  </label>
                                  <div className="text-[10px] mb-1.5" style={{ color: "var(--t3)" }}>
                                    Per day (overrides default)
                                  </div>
                                  <div className="grid gap-2"
                                    style={{ gridTemplateColumns: `repeat(${Math.max(days.length, 1)}, minmax(0, 1fr))` }}>
                                    {DAYS.filter((d) => days.includes(d)).map((d) => {
                                      const dayVal = blockContent.byDay?.[d] || {};
                                      return (
                                        <label key={d} className="flex flex-col gap-1">
                                          <span className="text-[10px] font-bold" style={{ color: color.text }}>{d}</span>
                                          <input
                                            type="url"
                                            placeholder="URL"
                                            value={dayVal.newsUrl || ""}
                                            onChange={(e) => {
                                              const next: BlockContent = {
                                                ...blockContent,
                                                byDay: { ...(blockContent.byDay || {}) },
                                              };
                                              const cur = { ...(next.byDay![d] || {}) };
                                              if (e.target.value) cur.newsUrl = e.target.value;
                                              else delete cur.newsUrl;
                                              if (Object.keys(cur).length) next.byDay![d] = cur;
                                              else delete next.byDay![d];
                                              updateBlock(i, { content_source: buildBlockContent(next) });
                                            }}
                                            className="input text-[11px] py-1 px-1.5"
                                            title={`${d} news URL`}
                                          />
                                        </label>
                                      );
                                    })}
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })()}

                        {/* SEL content sub-row */}
                        {selContent && (() => {
                          const gen = selGenState[i] || { status: "idle" as const };
                          const canGenerate = isValidYouTubeUrl(selContent.videoUrl) && gen.status !== "loading";
                          const runGenerate = async () => {
                            setSelGenState((prev) => ({ ...prev, [i]: { status: "loading" } }));
                            try {
                              // Step 1 — generate the assignment content from the
                              // YouTube transcript. The endpoint returns the raw
                              // assignment payload only; it doesn't persist, so we
                              // follow up with createAssignment and then select the
                              // new row for the block (honoring any byDay overrides
                              // that are already present for "today").
                              const generated = await api.generateAssignmentFromVideo({
                                videoUrl: selContent.videoUrl,
                                subject: "sel",
                                questionCount: 6,
                                title: b.label || "SEL Reflection",
                                grade: "3-5",
                              });
                              if (!generated) throw new Error("Empty response");

                              // Step 2 — persist it so the block can reference an id.
                              // The assignments POST expects { classId, title,
                              // description, rubric, content, ...targeting }.
                              // `content` is the stringified assignment JSON —
                              // mirrors AssignmentBuilder's save flow so downstream
                              // readers (take-over, grading) render identically.
                              const rubric = Array.isArray(generated.sections)
                                ? generated.sections.flatMap((sec: any) =>
                                    Array.isArray(sec?.questions)
                                      ? sec.questions.map((q: any) => ({
                                          label: String(q?.text || "Question").slice(0, 60),
                                          maxPoints: Number(q?.points) || 1,
                                        }))
                                      : []
                                  )
                                : [];
                              const saved = generated.id
                                ? generated
                                : await api.createAssignment({
                                    classId,
                                    title: generated.title || b.label || "SEL Reflection",
                                    description: generated.instructions || "",
                                    rubric,
                                    content: JSON.stringify({
                                      title: generated.title || b.label || "SEL Reflection",
                                      subject: generated.subject || "SEL",
                                      grade: generated.grade || "3-5",
                                      instructions: generated.instructions || "",
                                      totalPoints: generated.totalPoints,
                                      sections: generated.sections || [],
                                    }),
                                    targetSubject: "sel",
                                    videoUrl: generated.videoUrl || selContent.videoUrl,
                                  });

                              if (saved?.id) {
                                // Refresh the assignments list so the new row shows
                                // in dropdowns.
                                try {
                                  const rows = await api.getAssignments(classId);
                                  if (Array.isArray(rows)) setAssignments(rows);
                                } catch {}
                                // Wire the saved assignment back into the SEL
                                // block's assignmentUrl so the student's SEL page
                                // shows the "Open Today's Assignment" button
                                // pointing at the newly-saved Thign assignment.
                                const selAssignmentUrl = `/assignments/${saved.id}`;
                                updateBlock(i, {
                                  content_source: buildSelContent(selContent.videoUrl, selAssignmentUrl),
                                });
                              }
                              setSelGenState((prev) => ({
                                ...prev,
                                [i]: {
                                  status: "success",
                                  message: saved?.id
                                    ? `Saved "${saved.title || "SEL Reflection"}" and linked it to this block.`
                                    : "Generated — but could not persist. Check server logs.",
                                },
                              }));
                            } catch (err: any) {
                              setSelGenState((prev) => ({
                                ...prev,
                                [i]: { status: "error", message: err?.message || "Generation failed" },
                              }));
                            }
                          };
                          return (
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
                                    onChange={(e) => {
                                      updateBlock(i, { content_source: buildSelContent(e.target.value, selContent.assignmentUrl) });
                                      // Reset any prior success/error when the URL
                                      // changes — keeps the feedback from looking stale.
                                      if (selGenState[i] && selGenState[i].status !== "loading") {
                                        setSelGenState((prev) => ({ ...prev, [i]: { status: "idle" } }));
                                      }
                                    }}
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

                              {/* Generate-from-video action row */}
                              <div className="mt-3 flex items-center gap-2 flex-wrap">
                                <button
                                  type="button"
                                  onClick={runGenerate}
                                  disabled={!canGenerate}
                                  className="flex items-center gap-1.5 text-[11px] font-semibold px-3 py-1.5 rounded-lg border transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                                  style={{
                                    background: "rgba(245,158,11,0.15)",
                                    borderColor: "rgba(245,158,11,0.35)",
                                    color: "#fbbf24",
                                  }}
                                  title={canGenerate ? "Generate an SEL worksheet from the video transcript" : "Paste a YouTube URL first"}
                                >
                                  {gen.status === "loading" ? (
                                    <Loader2 size={12} className="animate-spin" />
                                  ) : (
                                    <Sparkles size={12} />
                                  )}
                                  {gen.status === "loading" ? "Generating…" : "Generate SEL from video"}
                                </button>
                                {gen.status === "success" && (
                                  <span className="flex items-center gap-1 text-[11px]" style={{ color: "#34d399" }}>
                                    <CheckCircle2 size={12} /> {gen.message}
                                  </span>
                                )}
                                {gen.status === "error" && (
                                  <span className="flex items-center gap-1 text-[11px]" style={{ color: "#fca5a5" }}>
                                    <AlertCircle size={12} /> {gen.message}
                                  </span>
                                )}
                              </div>
                            </div>
                          );
                        })()}

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
