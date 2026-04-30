// Flash leaderboard — small celebratory toast that pops up in the
// bottom-right of the board every ~25 seconds, cycling through the
// top point earners and any kid with a recent positive change. Pure
// read-only, no interaction. Disappears after 6 seconds.

import { useEffect, useState } from "react";
import { api } from "../lib/api.ts";

interface Toast { id: string; emoji: string; name: string; line: string; }

export default function FlashLeaderboard({ classId }: { classId: string }) {
  const [toast, setToast] = useState<Toast | null>(null);
  const [pool, setPool] = useState<Toast[]>([]);

  // Refresh the pool of toasts every minute. Pool is built from the
  // leaderboard's top earners + any kid with notable recent activity.
  useEffect(() => {
    if (!classId) return;
    let cancelled = false;
    const refresh = async () => {
      try {
        const lb: any[] = await api.getLeaderboard().catch(() => [] as any[]);
        const helper = await api.getHelperOfDay(classId).catch(() => ({ helper: null }));
        const next: Toast[] = [];
        // Top earner
        if (lb[0]?.dojo_points > 0) {
          next.push({
            id: `top:${lb[0].user_id}`,
            emoji: "👑",
            name: lb[0].name,
            line: `is leading with ${lb[0].dojo_points} pts`,
          });
        }
        // Runners-up
        for (let i = 1; i < Math.min(lb.length, 5); i++) {
          const r = lb[i];
          if (r?.dojo_points > 0) {
            next.push({
              id: `rank:${r.user_id}`,
              emoji: ["🥈", "🥉", "✨", "💎"][i - 1] || "✨",
              name: r.name,
              line: `is at ${r.dojo_points} pts`,
            });
          }
        }
        // Stars-full kids
        for (const r of lb) {
          if ((r.behavior_stars || 0) >= 5) {
            next.push({
              id: `mcd:${r.user_id}`,
              emoji: "🍔",
              name: r.name,
              line: "earned McDonald's!",
            });
          }
        }
        // Helper of the day
        if (helper?.helper) {
          next.push({
            id: `helper:${helper.helper.id}`,
            emoji: "⭐",
            name: helper.helper.name,
            line: `is helper of the day (${helper.helper.count} done)`,
          });
        }
        if (!cancelled) setPool(next);
      } catch { /* best effort */ }
    };
    refresh();
    const iv = setInterval(refresh, 60_000);
    return () => { cancelled = true; clearInterval(iv); };
  }, [classId]);

  // Rotate through the pool every 22 seconds
  useEffect(() => {
    if (pool.length === 0) return;
    let i = Math.floor(Math.random() * pool.length);
    const tick = () => {
      const next = pool[i % pool.length];
      i += 1;
      setToast(next);
      // Hide after 6 seconds
      setTimeout(() => setToast((t) => t?.id === next.id ? null : t), 6000);
    };
    tick();
    const iv = setInterval(tick, 22_000);
    return () => clearInterval(iv);
  }, [pool]);

  if (!toast) return null;

  return (
    <div style={{
      position: "fixed",
      bottom: 16, right: 16,
      zIndex: 80,
      pointerEvents: "none",
      animation: "flashSlideIn .4s cubic-bezier(0.34, 1.56, 0.64, 1) both",
    }}>
      <style>{`
        @keyframes flashSlideIn {
          from { opacity: 0; transform: translateY(20px) scale(0.92); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>
      <div style={{
        display: "flex", alignItems: "center", gap: 12,
        padding: "12px 18px",
        borderRadius: 14,
        background: "linear-gradient(135deg, rgba(217,119,6,0.95), rgba(178,58,72,0.92))",
        border: "1px solid rgba(251,191,36,0.55)",
        color: "white",
        boxShadow: "0 8px 32px rgba(178,58,72,0.45)",
        fontFamily: "'Source Serif Pro', Georgia, serif",
        maxWidth: 340,
      }}>
        <span style={{ fontSize: 28, lineHeight: 1, filter: "drop-shadow(0 2px 4px rgba(0,0,0,0.30))" }}>{toast.emoji}</span>
        <span style={{ fontSize: 14, fontWeight: 700, lineHeight: 1.3 }}>
          <strong style={{ fontWeight: 900 }}>{toast.name.split(" ")[0]}</strong> {toast.line}
        </span>
      </div>
    </div>
  );
}
