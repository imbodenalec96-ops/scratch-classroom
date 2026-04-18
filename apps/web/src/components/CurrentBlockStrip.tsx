import React, { useEffect, useState } from "react";
import { useAuth } from "../lib/auth.tsx";
import { api } from "../lib/api.ts";
import { useBlockInfo } from "../lib/useCurrentBlock.ts";

const SUBJECT_ICON: Record<string, string> = {
  daily_news: "📰",
  sel: "💛",
  math: "🔢",
  writing: "✏️",
  spelling: "🔤",
  reading: "📖",
  review: "🔁",
  cashout: "💰",
  video_learning: "📺",
  ted_talk: "🎙️",
  coding_art_gym: "🎨",
  dismissal: "👋",
  recess: "🏃",
  calm_down: "🧘",
  lunch: "🍱",
  extra_review: "🔁",
};

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

function iconFor(subject: string | null, isBreak: boolean): string {
  if (subject && SUBJECT_ICON[subject]) return SUBJECT_ICON[subject];
  return isBreak ? "⏸️" : "📘";
}

function daysAwayLabel(daysAway: number): string {
  if (daysAway === 0) return "Later today";
  if (daysAway === 1) return "Tomorrow";
  // 2–7: name the weekday
  const d = new Date();
  d.setDate(d.getDate() + daysAway);
  return DAY_LABELS[d.getDay()];
}

/**
 * Dashboard-header pill showing the currently-active schedule block, or the
 * next upcoming block when we're outside class hours. Renders nothing only
 * when the user truly has no class / no schedule at all.
 *
 * Display-only. No auto-nav.
 */
export default function CurrentBlockStrip() {
  const { user } = useAuth();
  const [classId, setClassId] = useState<string | null>(null);

  useEffect(() => {
    if (!user) { setClassId(null); return; }
    let cancelled = false;
    api.getClasses()
      .then((cs) => {
        if (cancelled) return;
        const first = (cs || []).find((c: any) => c?.id);
        setClassId(first?.id ?? null);
      })
      .catch(() => { if (!cancelled) setClassId(null); });
  }, [user?.id]);

  const info = useBlockInfo(classId);

  // Hide only when we genuinely have nothing to show — loading (don't flash),
  // no classes at all, or a class with zero schedule rows.
  if (info.state === "loading" || info.state === "empty") return null;

  if (info.state === "current") {
    const block = info.block;
    const isBreak = !!block.is_break;
    const accent = isBreak ? "var(--warning, #f59e0b)" : "var(--accent, #8b5cf6)";
    return (
      <div
        className="flex items-center gap-3 px-4 py-2 border-b flex-wrap"
        style={{
          background: `color-mix(in srgb, ${accent} 10%, transparent)`,
          borderColor: "var(--border, rgba(255,255,255,0.08))",
        }}
        role="status"
        aria-live="polite"
      >
        <span
          className="inline-block w-1.5 h-1.5 rounded-full flex-shrink-0"
          style={{
            background: accent,
            boxShadow: `0 0 8px ${accent}`,
            animation: "pulse 2s infinite",
          }}
        />
        <span className="text-[11px] font-semibold uppercase tracking-wider opacity-60">
          Now · Block {block.block_number}
        </span>
        <span className="text-sm font-bold">
          {iconFor(block.subject, isBreak)} {block.label}
        </span>
        <span className="text-xs opacity-60">
          {block.start_time}–{block.end_time}
        </span>
        {isBreak && (
          <span
            className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full"
            style={{
              background: `color-mix(in srgb, var(--warning, #f59e0b) 20%, transparent)`,
              color: "var(--warning, #f59e0b)",
            }}
          >
            {block.break_type || "break"}
          </span>
        )}
      </div>
    );
  }

  // state === "upcoming" → outside class hours, show next-up pill
  const { block, daysAway } = info;
  const isBreak = !!block.is_break;
  return (
    <div
      className="flex items-center gap-3 px-4 py-2 border-b flex-wrap"
      style={{
        background: "color-mix(in srgb, var(--accent, #8b5cf6) 6%, transparent)",
        borderColor: "var(--border, rgba(255,255,255,0.08))",
      }}
      role="status"
      aria-live="polite"
    >
      <span
        className="inline-block w-1.5 h-1.5 rounded-full flex-shrink-0"
        style={{
          background: "var(--t3, rgba(255,255,255,0.45))",
        }}
      />
      <span className="text-[11px] font-semibold uppercase tracking-wider opacity-60">
        {daysAway === 0 ? "No block right now" : "School's out"}
      </span>
      <span className="text-sm font-bold">
        Next: {iconFor(block.subject, isBreak)} {block.label}
      </span>
      <span className="text-xs opacity-60">
        {daysAwayLabel(daysAway)} · {block.start_time}
      </span>
    </div>
  );
}
