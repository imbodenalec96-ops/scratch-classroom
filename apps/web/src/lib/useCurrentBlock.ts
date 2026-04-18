import { useEffect, useState } from "react";
import { api } from "./api.ts";

export interface ScheduleBlock {
  id: string;
  class_id: string;
  block_number: number;
  start_time: string;     // HH:MM
  end_time: string;       // HH:MM
  label: string;
  subject: string | null;
  is_break: number;       // 0/1
  break_type: string | null;
  active_days: string;    // CSV "Mon,Tue,…"
  content_source: string | null;
}

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

function activeOn(b: ScheduleBlock, dayName: string): boolean {
  if (!b.active_days) return true;
  const days = b.active_days.split(",").map((s) => s.trim()).filter(Boolean);
  if (days.length === 0) return true;
  return days.includes(dayName);
}

/** Returns the block whose [start, end) contains `now`, or null. */
export function findCurrentBlock(blocks: ScheduleBlock[], now: Date = new Date()): ScheduleBlock | null {
  if (!blocks || blocks.length === 0) return null;
  const today = DAY_NAMES[now.getDay()];
  const mins = now.getHours() * 60 + now.getMinutes();
  for (const b of blocks) {
    if (!activeOn(b, today)) continue;
    const start = toMinutes(b.start_time);
    const end = toMinutes(b.end_time);
    // Dismissal is a zero-length marker block (start === end). Treat it as a
    // single matching minute so it still shows as "current" briefly.
    if (start === end) {
      if (mins === start) return b;
      continue;
    }
    if (mins >= start && mins < end) return b;
  }
  return null;
}

/**
 * Returns the next upcoming block (today or on a future active day) relative
 * to `now`, or null if the schedule has no active days reachable within the
 * next 7 days. Also returns how many days away it is, so the header can say
 * "Next: 09:10 Daily News" today vs "School's out — Monday 09:10 Daily News".
 */
export function findNextBlock(
  blocks: ScheduleBlock[],
  now: Date = new Date(),
): { block: ScheduleBlock; daysAway: number } | null {
  if (!blocks || blocks.length === 0) return null;
  const mins = now.getHours() * 60 + now.getMinutes();
  // Today first, looking for a block whose start is strictly after `now`.
  for (let offset = 0; offset < 8; offset++) {
    const d = new Date(now);
    d.setDate(d.getDate() + offset);
    const dayName = DAY_NAMES[d.getDay()];
    const candidates = blocks
      .filter((b) => activeOn(b, dayName))
      .slice()
      .sort((a, b) => toMinutes(a.start_time) - toMinutes(b.start_time));
    for (const b of candidates) {
      const start = toMinutes(b.start_time);
      if (offset === 0 && start <= mins) continue;
      return { block: b, daysAway: offset };
    }
  }
  return null;
}

/**
 * Fetches the schedule for a class (once, cached in state) and re-computes
 * the current block every 30s against wall-clock. Returns `null` until the
 * fetch resolves, when there is no matching block, or when classId is falsy.
 */
export function useCurrentBlock(classId: string | null | undefined): ScheduleBlock | null {
  const [blocks, setBlocks] = useState<ScheduleBlock[]>([]);
  const [current, setCurrent] = useState<ScheduleBlock | null>(null);

  useEffect(() => {
    if (!classId) { setBlocks([]); return; }
    let cancelled = false;
    api.getClassSchedule(classId)
      .then((rows) => { if (!cancelled) setBlocks(Array.isArray(rows) ? rows : []); })
      .catch(() => { if (!cancelled) setBlocks([]); });
    return () => { cancelled = true; };
  }, [classId]);

  useEffect(() => {
    const tick = () => setCurrent(findCurrentBlock(blocks));
    tick();
    // 30s cadence is fine — block boundaries align to minutes so worst-case
    // drift is half a tick. Cheap enough that we don't try to schedule to
    // the next boundary.
    const iv = setInterval(tick, 30_000);
    return () => clearInterval(iv);
  }, [blocks]);

  return current;
}

/**
 * Richer variant used by the dashboard strip: fetches the schedule once,
 * then returns the current block OR (if none) the next upcoming block, so
 * the UI can show something useful outside class hours instead of hiding.
 * Returns `state: "loading"` while classId/fetch is pending, `"empty"`
 * when the class has no schedule rows at all.
 */
export type BlockInfo =
  | { state: "loading" }
  | { state: "empty" }
  | { state: "current"; block: ScheduleBlock }
  | { state: "upcoming"; block: ScheduleBlock; daysAway: number };

export function useBlockInfo(classId: string | null | undefined): BlockInfo {
  const [blocks, setBlocks] = useState<ScheduleBlock[] | null>(null);
  const [, setTick] = useState(0);

  useEffect(() => {
    if (!classId) { setBlocks(null); return; }
    let cancelled = false;
    api.getClassSchedule(classId)
      .then((rows) => { if (!cancelled) setBlocks(Array.isArray(rows) ? rows : []); })
      .catch(() => { if (!cancelled) setBlocks([]); });
    return () => { cancelled = true; };
  }, [classId]);

  useEffect(() => {
    const iv = setInterval(() => setTick((t) => t + 1), 30_000);
    return () => clearInterval(iv);
  }, []);

  if (!classId || blocks === null) return { state: "loading" };
  if (blocks.length === 0) return { state: "empty" };
  const cur = findCurrentBlock(blocks);
  if (cur) return { state: "current", block: cur };
  const nxt = findNextBlock(blocks);
  if (nxt) return { state: "upcoming", block: nxt.block, daysAway: nxt.daysAway };
  return { state: "empty" };
}
