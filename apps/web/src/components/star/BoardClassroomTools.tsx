// Board-side classroom tools cluster. Adds three teacher-controlled
// projector takeovers + one always-visible activity feed:
//
//   • 🎲 Random picker — spinner overlay that picks a kid fairly
//   • 👀 EYES ON ME    — giant attention-getter takeover
//   • 📜 Activity feed — bottom-right strip of recent STAR events
//
// Triggers wire through window.__starBoardTools so any teacher UI
// (header buttons, iPad commands, slash commands) can fire them
// without importing this directly.

import { useEffect, useMemo, useRef, useState } from "react";
import { onStarBoardEvent, type StarBoardEvent } from "../../lib/star/boardEvents.ts";
import { successBeep, alertBeep, loggedBeep } from "../../lib/star/sounds.ts";
import { tokens as T } from "../../lib/star/theme.ts";

type BoardStudent = { id: string; name?: string; behavior_stars?: number };
const TICK_MS = 70;        // spinner step delay (ms)
const SPIN_DURATION = 2200; // total spin time
const PICK_HOLD_MS = 4500; // how long the result stays on screen

interface ToolsHandle {
  spin(): void;
  attention(): void;
}

let _handle: ToolsHandle | null = null;
export function fireRandomPicker() { _handle?.spin(); }
export function fireEyesOnMe() { _handle?.attention(); }

interface Props {
  students: BoardStudent[];
}

export default function BoardClassroomTools({ students }: Props) {
  const [picking, setPicking] = useState(false);
  const [pickedId, setPickedId] = useState<string | null>(null);
  const [eyesOn, setEyesOn] = useState(false);
  const tRef = useRef<number | null>(null);

  // Expose imperative triggers to anyone holding the board's window.
  useEffect(() => {
    _handle = {
      spin: () => spin(),
      attention: () => attention(),
    };
    return () => { _handle = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [students]);

  function spin() {
    if (picking || students.length === 0) return;
    setPicking(true);
    setPickedId(null);
    const startedAt = Date.now();
    const cycle = () => {
      const elapsed = Date.now() - startedAt;
      // Random highlight every TICK_MS until SPIN_DURATION elapses.
      const next = students[Math.floor(Math.random() * students.length)];
      setPickedId(next?.id || null);
      successBeep();
      if (elapsed < SPIN_DURATION) {
        tRef.current = window.setTimeout(cycle, TICK_MS + Math.min(elapsed, 1500) / 8);
      } else {
        // Final pick: weighted slightly to lower-star kids so the same
        // overachiever doesn't always land first. Random within bottom-half stars.
        const sorted = [...students].sort((a, b) => (a.behavior_stars || 0) - (b.behavior_stars || 0));
        const half = Math.max(1, Math.ceil(sorted.length / 2));
        const pool = sorted.slice(0, half + Math.floor(sorted.length / 4));
        const winner = pool[Math.floor(Math.random() * pool.length)] || students[Math.floor(Math.random() * students.length)];
        setPickedId(winner.id);
        loggedBeep();
        // Hold the result on screen, then dismiss.
        tRef.current = window.setTimeout(() => {
          setPicking(false);
          setPickedId(null);
        }, PICK_HOLD_MS);
      }
    };
    cycle();
  }

  function attention() {
    setEyesOn(true);
    alertBeep();
    setTimeout(() => alertBeep(), 600);
    setTimeout(() => alertBeep(), 1200);
    window.setTimeout(() => setEyesOn(false), 6500);
  }

  useEffect(() => () => { if (tRef.current) window.clearTimeout(tRef.current); }, []);

  const winner = pickedId ? students.find((s) => s.id === pickedId) : null;
  const winnerName = winner ? String(winner.name || "?").split(/\s+/)[0] : null;

  return (
    <>
      <ActivityFeed />

      {picking && winner && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 9990,
          background: "radial-gradient(ellipse at center, rgba(99,102,241,0.50) 0%, rgba(0,0,0,0.92) 80%)",
          display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
          color: "white", textAlign: "center", padding: 40,
        }}>
          <div style={{
            fontSize: 11, fontWeight: 800, letterSpacing: "0.32em", textTransform: "uppercase",
            opacity: 0.7, marginBottom: 12,
          }}>🎲 Random Pick</div>
          <div style={{
            fontSize: "min(18vw, 220px)", fontWeight: 900, lineHeight: 1,
            color: "#fde68a", letterSpacing: "-0.02em",
            textShadow: "0 6px 30px rgba(251,191,36,0.55)",
            transition: "transform 0.15s ease",
            transform: pickedId === winner.id ? "scale(1.05)" : "scale(0.96)",
          }}>{winnerName}</div>
          <div style={{ fontSize: 13, opacity: 0.55, marginTop: 24, fontStyle: "italic" }}>
            Tap anywhere to dismiss
          </div>
          <button onClick={() => { setPicking(false); setPickedId(null); }} style={{
            position: "absolute", inset: 0, background: "transparent", border: "none", cursor: "pointer",
          }} aria-label="Dismiss" />
        </div>
      )}

      {eyesOn && (
        <div onClick={() => setEyesOn(false)} style={{
          position: "fixed", inset: 0, zIndex: 9991,
          background: "linear-gradient(135deg, rgba(239,68,68,0.92), rgba(178,58,72,0.85))",
          display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
          color: "white", textAlign: "center", padding: 40, cursor: "pointer",
          animation: "eomPulse 0.6s ease-in-out infinite alternate",
        }}>
          <div style={{ fontSize: "min(28vw, 280px)", lineHeight: 1, marginBottom: 14 }}>👀</div>
          <div style={{
            fontSize: "min(13vw, 180px)", fontWeight: 900, letterSpacing: "0.05em",
            textShadow: "0 6px 30px rgba(0,0,0,0.5)",
          }}>EYES ON ME</div>
          <style>{`
            @keyframes eomPulse {
              from { background-color: rgba(239,68,68,0.92); }
              to   { background-color: rgba(220,38,38,1); }
            }
          `}</style>
        </div>
      )}
    </>
  );
}

/* ── activity feed ──────────────────────────────────────────────── */

interface ActivityItem { id: string; ts: number; icon: string; label: string; color: string; }

function ActivityFeed() {
  const [items, setItems] = useState<ActivityItem[]>([]);
  useEffect(() => {
    return onStarBoardEvent((e) => {
      const item = eventToActivityItem(e);
      if (!item) return;
      setItems((prev) => [item, ...prev].slice(0, 5));
    });
  }, []);

  // GC items older than 60s so the feed clears itself between bursts.
  const now = useNow(2000);
  const fresh = useMemo(() => items.filter((it) => (now - it.ts) < 60_000), [items, now]);
  if (fresh.length === 0) return null;

  return (
    <div role="log" aria-label="Recent STAR activity" style={{
      position: "fixed", bottom: 92, right: T.space.lg, zIndex: 200,
      width: "min(360px, 92vw)",
      display: "flex", flexDirection: "column", gap: T.space.xs,
      pointerEvents: "none", fontFamily: T.font.family,
    }}>
      {fresh.map((it, i) => (
        <div key={it.id} style={{
          padding: `${T.space.sm}px ${T.space.md}px`, borderRadius: T.radius.md,
          background: "rgba(15,23,42,0.92)",
          border: `1px solid ${it.color}55`,
          borderLeft: `3px solid ${it.color}`,
          color: T.color.text,
          backdropFilter: "blur(8px)",
          fontSize: T.font.size.sm,
          opacity: Math.max(0.35, 1 - i * 0.18),
          display: "flex", alignItems: "center", gap: T.space.sm,
          animation: i === 0 ? `feedSlide ${T.motion.standard}` : "none",
          boxShadow: T.shadow.md,
        }}>
          <span style={{ fontSize: 18 }} aria-hidden>{it.icon}</span>
          <span style={{ flex: 1, minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {it.label}
          </span>
          <span style={{ fontSize: T.font.size.xs, color: T.color.textSubtle, whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>
            {fmtAgo(now - it.ts)}
          </span>
        </div>
      ))}
      <style>{`
        @keyframes feedSlide {
          from { opacity: 0; transform: translateX(20px); }
          to   { opacity: 1; transform: translateX(0); }
        }
      `}</style>
    </div>
  );
}

function eventToActivityItem(e: StarBoardEvent): ActivityItem | null {
  const id = `${e.uuid || ""}-${e.ts}`;
  switch (e.kind) {
    case "completion":
      return { id, ts: e.ts, icon: "✅", color: "#10b981",
        label: `${e.studentName} · ${e.detail || "graded"}${e.letter ? ` · ${e.letter}` : ""}` };
    case "refusal":
      return { id, ts: e.ts, icon: "🚨", color: "#ef4444",
        label: `${e.studentName} · ${e.refusalType || "refusal"}` };
    case "pass-out":
      return { id, ts: e.ts, icon: "🚻", color: "#fbbf24",
        label: `${e.studentName} · ${e.detail || "out"}` };
    case "pass-in":
      return { id, ts: e.ts, icon: "↩️", color: "#34d399",
        label: `${e.studentName} · back (${fmtElapsed(e.elapsedSec || 0)})` };
    case "photo-saved":
      return { id, ts: e.ts, icon: "📷", color: "#a5b4fc",
        label: `${e.studentName} · photo saved` };
    default:
      return null;
  }
}

function fmtElapsed(sec: number): string {
  const m = Math.floor(sec / 60); const s = sec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}
function fmtAgo(ms: number): string {
  const sec = Math.round(ms / 1000);
  if (sec < 60) return `${sec}s`;
  return `${Math.floor(sec / 60)}m`;
}

function useNow(intervalMs: number): number {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const iv = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(iv);
  }, [intervalMs]);
  return now;
}
