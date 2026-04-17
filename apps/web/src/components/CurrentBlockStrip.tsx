import React, { useEffect, useState } from "react";
import { useAuth } from "../lib/auth.tsx";
import { api } from "../lib/api.ts";
import { useCurrentBlock } from "../lib/useCurrentBlock.ts";

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

/**
 * Dashboard-header pill showing the currently-active schedule block.
 * Renders nothing when:
 *   - user isn't in any class
 *   - the class has no schedule rows
 *   - wall-clock doesn't fall inside any block
 * Display-only. No auto-nav in this commit.
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
    return () => { cancelled = true; };
  }, [user?.id]);

  const block = useCurrentBlock(classId);
  if (!block) return null;

  const icon = (block.subject && SUBJECT_ICON[block.subject]) || (block.is_break ? "⏸️" : "📘");
  const isBreak = !!block.is_break;

  return (
    <div
      className="flex items-center gap-3 px-4 py-2 border-b"
      style={{
        background: isBreak ? "color-mix(in srgb, var(--warning, #f59e0b) 10%, transparent)" : "color-mix(in srgb, var(--accent, #8b5cf6) 10%, transparent)",
        borderColor: "var(--border, rgba(255,255,255,0.08))",
      }}
      role="status"
      aria-live="polite"
    >
      <span
        className="inline-block w-1.5 h-1.5 rounded-full"
        style={{
          background: isBreak ? "var(--warning, #f59e0b)" : "var(--accent, #8b5cf6)",
          boxShadow: `0 0 8px ${isBreak ? "var(--warning, #f59e0b)" : "var(--accent, #8b5cf6)"}`,
          animation: "pulse 2s infinite",
        }}
      />
      <span className="text-[11px] font-semibold uppercase tracking-wider opacity-60">
        Now · Block {block.block_number}
      </span>
      <span className="text-sm font-bold">
        {icon} {block.label}
      </span>
      <span className="text-xs opacity-60">
        {block.start_time}–{block.end_time}
      </span>
      {isBreak && (
        <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full"
          style={{ background: "color-mix(in srgb, var(--warning, #f59e0b) 20%, transparent)", color: "var(--warning, #f59e0b)" }}>
          {block.break_type || "break"}
        </span>
      )}
    </div>
  );
}
