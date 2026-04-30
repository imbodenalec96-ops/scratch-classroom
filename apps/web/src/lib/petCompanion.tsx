// Pet companion — visual-only growth tier driven by cumulative
// dojo_points. Renders instantly from localStorage so kids see their
// buddy on first paint, then quietly refreshes from the server.
//
// Reused across the dashboard's slim card and the assignment work
// view's compact chip. Animations are defined in PET_ANIMATIONS_CSS
// which gets injected once on import — keeps everything self-contained
// in this module.

import React, { useEffect, useRef, useState } from "react";
import { api } from "./api.ts";

const PET_CACHE_KEY = "thign:dojoPoints";

// Animation styles — injected once into <head>. Per-stage keyframes
// give each pet personality: egg wobbles, hatching shakes harder,
// chick hops, bird flutters, owl blinks, eagle soars.
const PET_ANIMATIONS_CSS = `
@keyframes petIdle {
  0%, 100% { transform: translateY(0) rotate(0deg); }
  50%      { transform: translateY(-2px) rotate(0deg); }
}
@keyframes petEggWobble {
  0%, 100% { transform: rotate(-3deg); }
  50%      { transform: rotate(3deg); }
}
@keyframes petHatchShake {
  0%, 100% { transform: rotate(0) translateY(0); }
  10%      { transform: rotate(-8deg) translateY(-1px); }
  20%      { transform: rotate(7deg) translateY(0); }
  30%      { transform: rotate(-6deg) translateY(-2px); }
  40%      { transform: rotate(5deg) translateY(0); }
  50%      { transform: rotate(0) translateY(-1px); }
  60%, 100%{ transform: rotate(0) translateY(0); }
}
@keyframes petChickHop {
  0%, 100% { transform: translateY(0); }
  20%      { transform: translateY(-6px); }
  40%      { transform: translateY(0) scaleY(.92) scaleX(1.06); }
  60%      { transform: translateY(-3px); }
  80%      { transform: translateY(0); }
}
@keyframes petBirdFlutter {
  0%, 100% { transform: translateY(0) rotate(-3deg); }
  25%      { transform: translateY(-3px) rotate(3deg); }
  50%      { transform: translateY(-5px) rotate(-2deg); }
  75%      { transform: translateY(-3px) rotate(2deg); }
}
@keyframes petOwlBlink {
  0%, 90%, 100% { transform: scaleY(1); }
  93%, 96%      { transform: scaleY(0.18); }
}
@keyframes petEagleSoar {
  0%, 100% { transform: translateY(0) translateX(0) rotate(-2deg); }
  50%      { transform: translateY(-4px) translateX(2px) rotate(2deg); }
}
@keyframes petLevelUpPop {
  0%   { transform: scale(1); }
  35%  { transform: scale(1.6) rotate(10deg); filter: drop-shadow(0 0 14px rgba(251,191,36,.95)); }
  70%  { transform: scale(0.92) rotate(-5deg); }
  100% { transform: scale(1) rotate(0); }
}
@keyframes petSparkle {
  0%   { opacity: 0; transform: translate(0,0) scale(.4); }
  30%  { opacity: 1; }
  100% { opacity: 0; transform: var(--sparkle-end) scale(1); }
}
@keyframes petTapBounce {
  0%   { transform: scale(1); }
  40%  { transform: scale(1.35) rotate(-8deg); }
  70%  { transform: scale(0.94) rotate(6deg); }
  100% { transform: scale(1) rotate(0); }
}
@keyframes petGlowPulse {
  0%, 100% { box-shadow: 0 0 0 0 rgba(217,119,6,0); }
  50%      { box-shadow: 0 0 0 6px rgba(217,119,6,0.18); }
}
`;
let petCssInjected = false;
function ensurePetCss() {
  if (petCssInjected || typeof document === "undefined") return;
  const el = document.createElement("style");
  el.setAttribute("data-pet-animations", "1");
  el.textContent = PET_ANIMATIONS_CSS;
  document.head.appendChild(el);
  petCssInjected = true;
}

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

/** Per-stage idle animation. Each stage has its own personality so
 *  kids can tell at a glance their pet is alive and reacting. */
function animationForStage(stage: number): string {
  switch (stage) {
    case 0: return "petEggWobble 3.2s ease-in-out infinite";
    case 1: return "petHatchShake 2.0s ease-in-out infinite";
    case 2: return "petChickHop 2.6s ease-in-out infinite";
    case 3: return "petBirdFlutter 2.0s ease-in-out infinite";
    case 4: return "petOwlBlink 4.5s ease-in-out infinite";
    case 5: return "petEagleSoar 4.2s ease-in-out infinite";
    default:return "petIdle 2.4s ease-in-out infinite";
  }
}

/** Sparkle burst — 6 little stars that fly out when the pet levels
 *  up. Position is offset from the pet center via CSS variable. */
function SparkleBurst() {
  const sparkles = [
    { x: -22, y: -18 }, { x: 22, y: -18 },
    { x: -28, y: 6  }, { x: 28, y: 6 },
    { x: 0, y: -28 }, { x: 0, y: 22 },
  ];
  return (
    <>
      {sparkles.map((s, i) => (
        <span
          key={i}
          style={{
            position: "absolute",
            top: "50%", left: "50%",
            transform: "translate(-50%,-50%)",
            fontSize: 12,
            pointerEvents: "none",
            ["--sparkle-end" as any]: `translate(${s.x}px, ${s.y}px)`,
            animation: `petSparkle 1.0s ease-out ${i * 0.06}s both`,
            color: "#fbbf24",
            textShadow: "0 0 8px rgba(251,191,36,0.9)",
          } as React.CSSProperties}
        >✦</span>
      ))}
    </>
  );
}

/** Compact chip — used on the assignment work view. Instant render
 *  from cache, no loading state. Runs a per-stage idle animation,
 *  flashes a sparkle burst when leveling up, and bounces on tap. */
export function PetChip({
  points,
  size = 24,
  showName = false,
  interactive = true,
  style,
}: {
  points: number;
  size?: number;
  showName?: boolean;
  interactive?: boolean;
  style?: React.CSSProperties;
}) {
  ensurePetCss();
  const pet = getPetStage(points);
  // Detect stage-up so we can fire the level-up celebration
  const prevStage = useRef(pet.stage);
  const [celebrating, setCelebrating] = useState(false);
  const [tapAnim, setTapAnim] = useState(false);
  useEffect(() => {
    if (pet.stage > prevStage.current) {
      setCelebrating(true);
      const t = setTimeout(() => setCelebrating(false), 1100);
      return () => clearTimeout(t);
    }
    prevStage.current = pet.stage;
  }, [pet.stage]);

  const idleAnim = animationForStage(pet.stage);
  const composed = celebrating
    ? "petLevelUpPop 1.0s ease-out both"
    : tapAnim
    ? "petTapBounce 0.5s ease-out both"
    : idleAnim;

  return (
    <div
      onClick={() => {
        if (!interactive) return;
        setTapAnim(true);
        setTimeout(() => setTapAnim(false), 520);
      }}
      title={`Your buddy: ${pet.name} · ${points} pts`}
      aria-label={`Pet ${pet.name}`}
      style={{
        position: "relative",
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "4px 10px",
        borderRadius: 999,
        background: "rgba(217,119,6,0.10)",
        border: "1px solid rgba(217,119,6,0.30)",
        cursor: interactive ? "pointer" : "default",
        animation: celebrating ? "petGlowPulse 1.0s ease-out 1" : undefined,
        ...style,
      }}
    >
      <span style={{
        position: "relative",
        fontSize: size,
        lineHeight: 1,
        display: "inline-block",
        transformOrigin: "50% 60%",
        filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.15))",
        animation: composed,
      }}>
        {pet.emoji}
        {celebrating && <SparkleBurst />}
      </span>
      {showName && (
        <span style={{ fontSize: 12, fontWeight: 700, color: "#92400e" }}>{pet.name}</span>
      )}
      <span style={{ fontSize: 11, fontWeight: 700, color: "#92400e", fontVariantNumeric: "tabular-nums" }}>
        {points}
      </span>
    </div>
  );
}

/** Animated pet emoji on its own — for use inside the dashboard's
 *  larger "Your buddy" card. Skips the chip styling so the parent
 *  can wrap it however it wants. */
export function PetEmoji({
  points,
  size = 36,
  interactive = true,
}: { points: number; size?: number; interactive?: boolean }) {
  ensurePetCss();
  const pet = getPetStage(points);
  const prevStage = useRef(pet.stage);
  const [celebrating, setCelebrating] = useState(false);
  const [tapAnim, setTapAnim] = useState(false);
  useEffect(() => {
    if (pet.stage > prevStage.current) {
      setCelebrating(true);
      const t = setTimeout(() => setCelebrating(false), 1100);
      return () => clearTimeout(t);
    }
    prevStage.current = pet.stage;
  }, [pet.stage]);
  const composed = celebrating
    ? "petLevelUpPop 1.0s ease-out both"
    : tapAnim
    ? "petTapBounce 0.5s ease-out both"
    : animationForStage(pet.stage);
  return (
    <span
      onClick={() => {
        if (!interactive) return;
        setTapAnim(true);
        setTimeout(() => setTapAnim(false), 520);
      }}
      title={pet.name}
      style={{
        position: "relative",
        display: "inline-block",
        fontSize: size,
        lineHeight: 1,
        transformOrigin: "50% 60%",
        filter: "drop-shadow(0 2px 4px rgba(0,0,0,0.20))",
        cursor: interactive ? "pointer" : "default",
        animation: composed,
      }}
    >
      {pet.emoji}
      {celebrating && <SparkleBurst />}
    </span>
  );
}
