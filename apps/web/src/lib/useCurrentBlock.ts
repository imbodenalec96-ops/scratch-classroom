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

/** Returns the block whose [start, end) contains `now`, or null. */
export function findCurrentBlock(blocks: ScheduleBlock[], now: Date = new Date()): ScheduleBlock | null {
  if (!blocks || blocks.length === 0) return null;
  const today = DAY_NAMES[now.getDay()];
  const mins = now.getHours() * 60 + now.getMinutes();
  for (const b of blocks) {
    // Honor active_days (CSV). Empty/missing = always active.
    if (b.active_days) {
      const days = b.active_days.split(",").map((s) => s.trim()).filter(Boolean);
      if (days.length > 0 && !days.includes(today)) continue;
    }
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
