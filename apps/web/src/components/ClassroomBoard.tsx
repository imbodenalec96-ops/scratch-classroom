import React, { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "../lib/api.ts";
import { findCurrentBlock, findNextBlock, type ScheduleBlock } from "../lib/useCurrentBlock.ts";

/**
 * ClassroomBoard — read-only kiosk view designed for a TV/projector in the
 * classroom. Shows the current block big-and-bold, what's next, and the roster
 * with live activity. Updates every 15s. No interactivity, no login required
 * (reads from public class endpoints).
 *
 * Usage: /board?class=<classId-or-slug>
 */
export default function ClassroomBoard() {
  const [params] = useSearchParams();
  const classParam = (params.get("class") || "").trim().toLowerCase();

  const [classes, setClasses] = useState<any[]>([]);
  const [cls, setCls] = useState<any | null>(null);
  const [schedule, setSchedule] = useState<ScheduleBlock[]>([]);
  const [students, setStudents] = useState<any[]>([]);
  const [presence, setPresence] = useState<any[]>([]);
  const [now, setNow] = useState(new Date());
  const [error, setError] = useState<string | null>(null);

  // Tick wall clock every 15s
  useEffect(() => {
    const iv = setInterval(() => setNow(new Date()), 15_000);
    return () => clearInterval(iv);
  }, []);

  // Resolve ?class= to a class row by slug/name/id
  useEffect(() => {
    let cancelled = false;
    api.getClasses()
      .then((cs: any[]) => {
        if (cancelled) return;
        setClasses(cs || []);
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

  // Fetch schedule + roster once we know the class
  useEffect(() => {
    if (!cls?.id) return;
    let cancelled = false;
    const load = () => {
      api.getClassSchedule(cls.id).then((rows) => { if (!cancelled) setSchedule(Array.isArray(rows) ? rows : []); }).catch(() => {});
      api.getStudents(cls.id).then((rows) => { if (!cancelled) setStudents(Array.isArray(rows) ? rows : []); }).catch(() => {});
      api.getClassPresence(cls.id).then((rows) => { if (!cancelled) setPresence(Array.isArray(rows) ? rows : []); }).catch(() => {});
    };
    load();
    const iv = setInterval(load, 15_000);
    return () => { cancelled = true; clearInterval(iv); };
  }, [cls?.id]);

  const currentBlock = useMemo(() => findCurrentBlock(schedule, now), [schedule, now]);
  const nextBlock = useMemo(() => findNextBlock(schedule, now), [schedule, now]);
  const presenceById = useMemo(() => {
    const m = new Map<string, any>();
    presence.forEach((p: any) => m.set(p.user_id || p.id, p));
    return m;
  }, [presence]);

  const timeStr = now.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  const dateStr = now.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" });

  if (error) {
    return <div className="min-h-screen flex items-center justify-center bg-black text-red-400 text-2xl">{error}</div>;
  }
  if (!cls) {
    return <div className="min-h-screen flex items-center justify-center bg-black text-white/60 text-2xl">Loading classroom board…</div>;
  }

  return (
    <div className="min-h-screen p-10" style={{
      background: "linear-gradient(135deg, #0f0726 0%, #1a0a35 50%, #0a0b20 100%)",
      color: "white",
      fontFamily: "system-ui, -apple-system, sans-serif",
    }}>
      {/* Header */}
      <div className="flex items-end justify-between mb-10 border-b pb-6" style={{ borderColor: "rgba(255,255,255,0.08)" }}>
        <div>
          <div className="text-sm uppercase tracking-[0.25em] opacity-60 mb-2">BlockForge · Classroom Board</div>
          <h1 style={{ fontSize: 64, fontWeight: 900, lineHeight: 1, letterSpacing: "-0.02em" }}>
            {cls.name}
          </h1>
          <div className="mt-2 text-lg opacity-70">{dateStr}</div>
        </div>
        <div className="text-right">
          <div style={{ fontSize: 72, fontWeight: 800, fontVariantNumeric: "tabular-nums", letterSpacing: "-0.03em" }}>
            {timeStr}
          </div>
        </div>
      </div>

      {/* Current block */}
      <section className="mb-10 rounded-3xl p-8" style={{
        background: currentBlock
          ? "linear-gradient(135deg, rgba(139,92,246,0.22), rgba(99,102,241,0.14))"
          : "rgba(255,255,255,0.04)",
        border: "1px solid rgba(139,92,246,0.3)",
      }}>
        <div className="text-xs uppercase tracking-[0.25em] opacity-60 mb-3">Right now</div>
        {currentBlock ? (
          <div className="flex items-baseline gap-6 flex-wrap">
            <div style={{ fontSize: 84, fontWeight: 900, letterSpacing: "-0.03em" }}>
              {currentBlock.label || currentBlock.subject}
            </div>
            <div className="opacity-75 text-2xl font-mono">
              {currentBlock.start_time}–{currentBlock.end_time}
            </div>
            {currentBlock.is_break ? (
              <div className="px-4 py-2 rounded-full text-base font-bold" style={{ background: "rgba(34,197,94,0.25)", color: "#4ade80" }}>
                ☕ Break
              </div>
            ) : null}
          </div>
        ) : (
          <div style={{ fontSize: 48, fontWeight: 800, opacity: 0.7 }}>
            No active block
          </div>
        )}
      </section>

      {/* Up next */}
      {nextBlock && (
        <section className="mb-10 rounded-2xl p-6" style={{
          background: "rgba(255,255,255,0.04)",
          border: "1px solid rgba(255,255,255,0.08)",
        }}>
          <div className="text-xs uppercase tracking-[0.25em] opacity-60 mb-2">Up next</div>
          <div className="flex items-baseline gap-5 flex-wrap">
            <div style={{ fontSize: 36, fontWeight: 800 }}>
              {nextBlock.block.label || nextBlock.block.subject}
            </div>
            <div className="opacity-70 text-lg font-mono">
              {nextBlock.block.start_time}
              {nextBlock.daysAway > 0 && <span className="ml-2 opacity-70">(+{nextBlock.daysAway}d)</span>}
            </div>
          </div>
        </section>
      )}

      {/* Roster */}
      <section>
        <div className="text-xs uppercase tracking-[0.25em] opacity-60 mb-4">
          Roster — {students.length} students
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3">
          {students.map((s: any) => {
            const p = presenceById.get(s.id) || presenceById.get(s.user_id);
            const online = p && p.last_seen && (Date.now() - new Date(p.last_seen).getTime() < 90_000);
            return (
              <div key={s.id} className="rounded-xl p-4 flex items-center gap-3" style={{
                background: "rgba(255,255,255,0.04)",
                border: `1px solid ${online ? "rgba(34,197,94,0.35)" : "rgba(255,255,255,0.08)"}`,
              }}>
                <div className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm flex-shrink-0" style={{
                  background: online ? "linear-gradient(135deg, #22c55e, #16a34a)" : "linear-gradient(135deg, #6b7280, #4b5563)",
                }}>
                  {String(s.name || "?").split(/\s+/).map((w: string) => w[0]).join("").slice(0, 2).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <div className="font-bold truncate text-base">{s.name}</div>
                  <div className="text-xs opacity-60 truncate">
                    {online ? (p?.activity || "online") : "offline"}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Placeholder slot — future modules (behavior stars, levels, specials,
         music, schedules) will render here. Structural only, no content yet. */}
      <section
        data-slot="board-modules"
        className="mt-10 rounded-2xl p-6"
        style={{
          background: "rgba(255,255,255,0.03)",
          border: "1px dashed rgba(255,255,255,0.12)",
        }}
      >
        <div className="text-xs uppercase tracking-[0.25em] opacity-50">Modules</div>
        <div className="text-sm opacity-40 mt-2">More classroom controls coming here soon.</div>
      </section>

      {/* Footer */}
      <div className="mt-10 pt-4 text-center text-xs opacity-40 uppercase tracking-[0.2em]">
        BlockForge · auto-refreshes every 15 seconds
      </div>
    </div>
  );
}
