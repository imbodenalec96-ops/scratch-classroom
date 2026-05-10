// Always-visible strip on the ClassroomBoard showing students currently
// on a bathroom / water / sensory break with running timers. Pulls from
// localStorage star_active_passes (kept in sync via the 1s server poll
// + local pass-out/pass-in events).

import { useEffect, useState } from "react";
import { StarStore, type ActivePass } from "../../lib/star/storage.ts";
import { onStarBoardEvent } from "../../lib/star/boardEvents.ts";
import { alertBeep } from "../../lib/star/sounds.ts";
import { tokens as T } from "../../lib/star/theme.ts";

const ICON: Record<ActivePass["passKind"], string> = {
  Bathroom: "🚻", Water: "💧", Break: "🛋",
};

export default function ActivePassesStrip() {
  const [passes, setPasses] = useState<ActivePass[]>(() => StarStore.getActivePasses());
  const [now, setNow] = useState(Date.now());
  const [overFlagged, setOverFlagged] = useState<Set<string>>(new Set());

  // Re-read from storage every second so a pass started/ended on the
  // teacher's iPad shows up on the projector quickly.
  useEffect(() => {
    const iv = window.setInterval(() => {
      setNow(Date.now());
      setPasses(StarStore.getActivePasses());
    }, 1000);
    return () => window.clearInterval(iv);
  }, []);

  // Cross-device events (pass-out / pass-in) come through the same window
  // listener as everything else. We refresh from storage when they fire
  // so the projector picks them up instantly without waiting for the
  // 1-second tick.
  useEffect(() => {
    return onStarBoardEvent((e) => {
      if (e.kind !== "pass-out" && e.kind !== "pass-in") return;
      // The remote device wrote to its own localStorage but ours hasn't
      // seen the change. Reconstruct from the event payload so the
      // projector's strip stays in sync with the iPad.
      const stored = StarStore.getActivePasses();
      if (e.kind === "pass-out" && e.studentId) {
        const has = stored.find((p) => p.studentId === e.studentId);
        if (!has) {
          const next: ActivePass = {
            studentId: e.studentId,
            studentName: e.studentName,
            passKind: (e.detail as ActivePass["passKind"]) || "Bathroom",
            startedAt: new Date(e.ts).toISOString(),
          };
          const updated = [...stored, next];
          StarStore.setActivePasses(updated);
          setPasses(updated);
        }
      } else if (e.kind === "pass-in" && e.studentId) {
        const updated = stored.filter((p) => p.studentId !== e.studentId);
        StarStore.setActivePasses(updated);
        setPasses(updated);
      }
    });
  }, []);

  // Alert the room if anyone tips over 5 minutes — once per pass.
  useEffect(() => {
    for (const p of passes) {
      const elapsed = (now - new Date(p.startedAt).getTime()) / 1000;
      if (elapsed > 5 * 60 && !overFlagged.has(p.studentId)) {
        setOverFlagged((s) => new Set(s).add(p.studentId));
        alertBeep();
      }
    }
  }, [passes, now]);

  if (passes.length === 0) return null;

  const anyOver = passes.some((p) => (now - new Date(p.startedAt).getTime()) / 1000 > 5 * 60);

  return (
    <div role="status" aria-live="polite" style={{
      position: "fixed", bottom: T.space.lg, left: T.space.lg, zIndex: 200,
      maxWidth: "min(560px, 92vw)",
      padding: `${T.space.md}px ${T.space.lg}px`, borderRadius: T.radius.xl,
      background: anyOver
        ? "linear-gradient(135deg, rgba(239,68,68,0.85), rgba(178,58,72,0.85))"
        : "linear-gradient(135deg, rgba(15,23,42,0.92), rgba(30,27,46,0.92))",
      border: anyOver ? `2px solid #fca5a5` : `1px solid ${T.color.accentBorder}`,
      color: T.color.text,
      boxShadow: anyOver ? `0 12px 36px rgba(239,68,68,0.45)` : T.shadow.lg,
      backdropFilter: "blur(8px)",
      fontFamily: T.font.family,
      animation: anyOver ? "passStripPulse 1.2s ease-in-out infinite" : "none",
    }}>
      <div style={{
        fontSize: T.font.size.xs, fontWeight: T.font.weight.bold,
        letterSpacing: "0.18em", textTransform: "uppercase",
        opacity: 0.85, marginBottom: T.space.xs,
      }}>
        ⏱ Out Of Room ({passes.length}){anyOver ? " — over 5 min!" : ""}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: T.space.sm }}>
        {passes.map((p) => {
          const elapsedSec = Math.max(0, Math.round((now - new Date(p.startedAt).getTime()) / 1000));
          const over = elapsedSec > 5 * 60;
          return (
            <div key={p.studentId} style={{
              padding: `6px ${T.space.md}px`, borderRadius: T.radius.pill,
              background: over ? "rgba(0,0,0,0.45)" : "rgba(0,0,0,0.30)",
              display: "flex", alignItems: "center", gap: T.space.sm,
              border: over ? "1px solid #fecaca" : `1px solid ${T.color.borderStrong}`,
            }}>
              <span style={{ fontSize: 18 }} aria-hidden>{ICON[p.passKind]}</span>
              <span style={{ fontWeight: T.font.weight.bold, fontSize: T.font.size.md }}>{p.studentName}</span>
              <span style={{
                fontFamily: T.font.mono, fontWeight: T.font.weight.bold,
                color: over ? "#fecaca" : T.color.accent,
                fontSize: T.font.size.md, fontVariantNumeric: "tabular-nums",
              }}>
                {fmt(elapsedSec)}
              </span>
            </div>
          );
        })}
      </div>
      <style>{`
        @keyframes passStripPulse {
          0%, 100% { box-shadow: 0 12px 32px rgba(239,68,68,0.5); }
          50%      { box-shadow: 0 12px 48px rgba(239,68,68,0.95); }
        }
      `}</style>
    </div>
  );
}

function fmt(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}
