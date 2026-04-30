// Pet companion — visual-only growth tier driven by cumulative
// dojo_points. Renders instantly from localStorage so kids see their
// buddy on first paint, then quietly refreshes from the server.
//
// Reused across the dashboard's slim card and the assignment work
// view's compact chip.

import React, { useEffect, useState } from "react";
import { api } from "./api.ts";

const PET_CACHE_KEY = "thign:dojoPoints";

export interface PetStage {
  emoji: string;
  name: string;
  stage: number;
  threshold: number; // points required for this stage
  next: { at: number; name: string } | null;
}

const STAGES: Array<{ at: number; emoji: string; name: string; nextName: string | null }> = [
  { at: 0,    emoji: "🥚", name: "Egg",      nextName: "Hatching" },
  { at: 10,   emoji: "🐣", name: "Hatching", nextName: "Chick" },
  { at: 25,   emoji: "🐤", name: "Chick",    nextName: "Bird" },
  { at: 50,   emoji: "🐦", name: "Bird",     nextName: "Owl" },
  { at: 100,  emoji: "🦉", name: "Owl",      nextName: "Eagle" },
  { at: 200,  emoji: "🦅", name: "Eagle",    nextName: null },
];

export function getPetStage(points: number): PetStage {
  let idx = 0;
  for (let i = 0; i < STAGES.length; i++) {
    if (points >= STAGES[i].at) idx = i;
  }
  const cur = STAGES[idx];
  const next = STAGES[idx + 1];
  return {
    emoji: cur.emoji,
    name: cur.name,
    stage: idx,
    threshold: cur.at,
    next: next ? { at: next.at, name: next.name } : null,
  };
}

/** Instant points reader: returns the cached value synchronously,
 *  then kicks a background fetch and updates when fresher data arrives.
 *  Pet renders on first paint with no spinner. */
export function useDojoPoints(): { points: number; setPoints: (n: number) => void } {
  const initial = (() => {
    if (typeof window === "undefined") return 0;
    const v = Number(window.localStorage.getItem(PET_CACHE_KEY) || "0");
    return Number.isFinite(v) ? v : 0;
  })();
  const [points, setPointsState] = useState<number>(initial);
  const setPoints = (n: number) => {
    setPointsState(n);
    try { window.localStorage.setItem(PET_CACHE_KEY, String(n)); } catch {}
  };
  useEffect(() => {
    let cancelled = false;
    api.getMyBalance()
      .then((b) => { if (!cancelled) setPoints(Number(b?.dojo_points ?? 0)); })
      .catch(() => { /* keep cached value */ });
    return () => { cancelled = true; };
  }, []);
  return { points, setPoints };
}

/** Compact chip — used on the assignment work view. Instant render
 *  from cache, no loading state. */
export function PetChip({
  points,
  size = 24,
  showName = false,
  style,
}: {
  points: number;
  size?: number;
  showName?: boolean;
  style?: React.CSSProperties;
}) {
  const pet = getPetStage(points);
  return (
    <div
      title={`Your buddy: ${pet.name} · ${points} pts`}
      aria-label={`Pet ${pet.name}`}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "4px 10px",
        borderRadius: 999,
        background: "rgba(217,119,6,0.10)",
        border: "1px solid rgba(217,119,6,0.30)",
        ...style,
      }}
    >
      <span style={{
        fontSize: size,
        lineHeight: 1,
        filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.15))",
      }}>{pet.emoji}</span>
      {showName && (
        <span style={{ fontSize: 12, fontWeight: 700, color: "#92400e" }}>{pet.name}</span>
      )}
      <span style={{ fontSize: 11, fontWeight: 700, color: "#92400e", fontVariantNumeric: "tabular-nums" }}>
        {points}
      </span>
    </div>
  );
}
