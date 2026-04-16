/**
 * BreakSystem.tsx
 * Exports: useBreakTimer (hook), BreakOverlay (component), BreakButton (component)
 *
 * Step 3 — Break system for BlockForge student kiosk.
 */

import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
} from "react";
import { api } from "../lib/api";

// ─── Types ────────────────────────────────────────────────────────────────────

interface BreakConfig {
  work_minutes_before_first_break: number;
  work_minutes_before_next_break: number;
  break_duration_minutes: number;
  calming_corner_enabled?: boolean;
  break_system_enabled?: boolean;
}

interface BreakGame {
  game_id: string;
}

// ─── CSS injected once ────────────────────────────────────────────────────────

const BREAK_CSS = `
@keyframes breakPulseGlow {
  0%,100% { box-shadow: 0 0 18px 4px rgba(34,211,238,0.55), 0 0 36px 10px rgba(34,211,238,0.2); }
  50%      { box-shadow: 0 0 30px 10px rgba(34,211,238,0.85), 0 0 60px 20px rgba(34,211,238,0.35); }
}
@keyframes breakOverlaySlideIn {
  from { transform: translateY(100%); }
  to   { transform: translateY(0); }
}
@keyframes breakOverlaySlideOut {
  from { transform: translateY(0); }
  to   { transform: translateY(100%); }
}
@keyframes breatheCircle {
  0%   { transform: scale(1);    opacity: 0.6; }
  30%  { transform: scale(1.45); opacity: 1;   }
  70%  { transform: scale(1.45); opacity: 1;   }
  100% { transform: scale(1);    opacity: 0.6; }
}
@keyframes cardFadeSlide {
  0%   { opacity: 0; transform: translateY(18px); }
  12%  { opacity: 1; transform: translateY(0);    }
  88%  { opacity: 1; transform: translateY(0);    }
  100% { opacity: 0; transform: translateY(-18px);}
}
@keyframes breakToastBounce {
  0%   { transform: translateY(80px) scale(0.8); opacity: 0; }
  55%  { transform: translateY(-12px) scale(1.05); opacity: 1; }
  75%  { transform: translateY(4px) scale(0.98); }
  100% { transform: translateY(0) scale(1);        opacity: 1; }
}
@keyframes pulseRed {
  0%,100% { box-shadow: 0 0 0 0 rgba(255,107,107,0); }
  50%     { box-shadow: 0 0 0 12px rgba(255,107,107,0.35); }
}
@keyframes affirmationSpin {
  0%   { opacity: 0; transform: translateX(28px) scale(0.95); }
  10%  { opacity: 1; transform: translateX(0)    scale(1); }
  90%  { opacity: 1; transform: translateX(0)    scale(1); }
  100% { opacity: 0; transform: translateX(-28px) scale(0.95); }
}
`;

let cssInjected = false;
function injectBreakCSS() {
  if (cssInjected || typeof document === "undefined") return;
  cssInjected = true;
  const style = document.createElement("style");
  style.textContent = BREAK_CSS;
  document.head.appendChild(style);
}

// ─── Game metadata ────────────────────────────────────────────────────────────

const GAME_META: Record<string, { label: string; emoji: string }> = {
  snake:        { label: "Snake",        emoji: "🐍" },
  pong:         { label: "Pong",         emoji: "🏓" },
  brickbreaker: { label: "Brick Breaker",emoji: "🧱" },
  colorcatcher: { label: "Color Catcher",emoji: "🎨" },
  memory:       { label: "Memory",       emoji: "🧩" },
  whackamole:   { label: "Whack-a-Mole", emoji: "🐹" },
  flappy:       { label: "Flappy Bird",  emoji: "🐦" },
  spaceshooter: { label: "Space Shooter",emoji: "🚀" },
};

// ─── Audio helpers ────────────────────────────────────────────────────────────

function getAudioCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  try {
    return new (window.AudioContext ||
      (window as any).webkitAudioContext)();
  } catch {
    return null;
  }
}

function playBeep(ctx: AudioContext) {
  try {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(660, ctx.currentTime);
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.1);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.1);
  } catch {
    /* ignore audio errors */
  }
}

function startAmbientTone(ctx: AudioContext): () => void {
  try {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(60, ctx.currentTime);
    gain.gain.setValueAtTime(0.05, ctx.currentTime);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    return () => {
      try {
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
        osc.stop(ctx.currentTime + 0.6);
      } catch { /* ignore */ }
    };
  } catch {
    return () => {};
  }
}

// ─── useBreakTimer hook ───────────────────────────────────────────────────────

export function useBreakTimer(studentId: string) {
  injectBreakCSS();

  const DEFAULT_CONFIG: BreakConfig = {
    work_minutes_before_first_break: 10,
    work_minutes_before_next_break: 15,
    break_duration_minutes: 10,
  };

  const [breakConfig, setBreakConfig] = useState<BreakConfig>(DEFAULT_CONFIG);
  const [workSeconds, setWorkSeconds] = useState(0);
  const [breakActive, setBreakActive] = useState(false);
  const [breakSecondsLeft, setBreakSecondsLeft] = useState(0);
  const [breakEarned, setBreakEarned] = useState(false);
  const [breakPhase, setBreakPhase] = useState(0);

  // Refs for intervals so we can clear them reliably
  const workIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const breakIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Track break start time for logging
  const breakStartRef = useRef<string>("");
  const workSecondsAtBreakRef = useRef<number>(0);

  // Load config on mount
  useEffect(() => {
    api.getBreakConfig().then((cfg: any) => {
      if (cfg && typeof cfg.work_minutes_before_first_break === "number") {
        setBreakConfig({
          work_minutes_before_first_break: cfg.work_minutes_before_first_break,
          work_minutes_before_next_break: cfg.work_minutes_before_next_break,
          break_duration_minutes: cfg.break_duration_minutes,
        });
      }
    }).catch(() => { /* use defaults */ });
  }, []);

  // Work timer — runs when break is NOT active
  useEffect(() => {
    if (breakActive) {
      if (workIntervalRef.current) {
        clearInterval(workIntervalRef.current);
        workIntervalRef.current = null;
      }
      return;
    }

    workIntervalRef.current = setInterval(() => {
      setWorkSeconds((s) => s + 1);
    }, 1000);

    return () => {
      if (workIntervalRef.current) {
        clearInterval(workIntervalRef.current);
        workIntervalRef.current = null;
      }
    };
  }, [breakActive]);

  // Check threshold whenever workSeconds or config changes
  useEffect(() => {
    if (breakActive || breakEarned) return;
    const threshold =
      breakPhase === 0
        ? breakConfig.work_minutes_before_first_break
        : breakConfig.work_minutes_before_next_break;
    if (workSeconds >= threshold * 60) {
      setBreakEarned(true);
    }
  }, [workSeconds, breakActive, breakEarned, breakPhase, breakConfig]);

  const startBreak = useCallback(
    (optionChosen: string) => {
      const now = new Date().toISOString();
      breakStartRef.current = now;
      workSecondsAtBreakRef.current = workSeconds;

      setBreakActive(true);
      setBreakEarned(false);
      setWorkSeconds(0);

      const totalSeconds = breakConfig.break_duration_minutes * 60;
      setBreakSecondsLeft(totalSeconds);

      let remaining = totalSeconds;

      breakIntervalRef.current = setInterval(() => {
        remaining -= 1;
        setBreakSecondsLeft(remaining);

        if (remaining <= 0) {
          if (breakIntervalRef.current) {
            clearInterval(breakIntervalRef.current);
            breakIntervalRef.current = null;
          }

          const breakEnd = new Date().toISOString();
          const today = new Date().toISOString().slice(0, 10);
          api
            .logBreak({
              student_id: studentId,
              date: today,
              break_start: breakStartRef.current,
              break_end: breakEnd,
              option_chosen: optionChosen,
              work_minutes_before: Math.floor(
                workSecondsAtBreakRef.current / 60
              ),
            })
            .catch(() => { /* log silently */ });

          setBreakActive(false);
          setBreakSecondsLeft(0);
          setBreakPhase((p) => p + 1);
        }
      }, 1000);
    },
    [workSeconds, breakConfig, studentId]
  );

  const resetWorkTimer = useCallback(() => {
    setWorkSeconds(0);
    setBreakEarned(false);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (workIntervalRef.current) clearInterval(workIntervalRef.current);
      if (breakIntervalRef.current) clearInterval(breakIntervalRef.current);
    };
  }, []);

  const threshold =
    breakPhase === 0
      ? breakConfig.work_minutes_before_first_break
      : breakConfig.work_minutes_before_next_break;

  return {
    workSeconds,
    breakActive,
    breakSecondsLeft,
    breakEarned,
    breakConfig,
    startBreak,
    resetWorkTimer,
    breakPhase,
    threshold,
  };
}

// ─── Breathing animation component ────────────────────────────────────────────

const AFFIRMATIONS = [
  "You are amazing! ⭐",
  "Keep up the great work! 💪",
  "You're learning every day! 📚",
  "You make your class better! 🌟",
  "You are creative and smart! 🎨",
  "You can do hard things! 🔥",
];

// Breathing: 4s inhale, 7s hold, 8s exhale => 19s cycle
const BREATH_CYCLE = 19;

function CalmingCorner() {
  const [breathPhase, setBreathPhase] = useState<"in" | "hold" | "out">("in");
  const [affirmIdx, setAffirmIdx] = useState(0);
  const [affirmKey, setAffirmKey] = useState(0);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const stopAmbientRef = useRef<(() => void) | null>(null);

  // Breathing phase cycle
  useEffect(() => {
    const phases: { phase: "in" | "hold" | "out"; duration: number }[] = [
      { phase: "in",   duration: 4000 },
      { phase: "hold", duration: 7000 },
      { phase: "out",  duration: 8000 },
    ];
    let idx = 0;
    let timer: ReturnType<typeof setTimeout>;

    function next() {
      const current = phases[idx % phases.length];
      setBreathPhase(current.phase);
      idx++;
      timer = setTimeout(next, current.duration);
    }
    next();
    return () => clearTimeout(timer);
  }, []);

  // Affirmation rotation every 8s
  useEffect(() => {
    const id = setInterval(() => {
      setAffirmIdx((i) => (i + 1) % AFFIRMATIONS.length);
      setAffirmKey((k) => k + 1);
    }, 8000);
    return () => clearInterval(id);
  }, []);

  // Ambient tone
  useEffect(() => {
    try {
      audioCtxRef.current = getAudioCtx();
      if (audioCtxRef.current) {
        stopAmbientRef.current = startAmbientTone(audioCtxRef.current);
      }
    } catch { /* ignore */ }
    return () => {
      if (stopAmbientRef.current) stopAmbientRef.current();
    };
  }, []);

  // Breathing circle scale determined by phase
  const breatheScale = breathPhase === "in" ? 1.45 : breathPhase === "hold" ? 1.45 : 1;
  const breatheLabel =
    breathPhase === "in" ? "Breathe In..." :
    breathPhase === "hold" ? "Hold..." : "Breathe Out...";

  const breatheTransition =
    breathPhase === "in"   ? `transform ${4}s ease-in-out, opacity ${4}s ease-in-out` :
    breathPhase === "hold" ? `transform 0.3s ease, opacity 0.3s ease` :
                             `transform ${8}s ease-in-out, opacity ${8}s ease-in-out`;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 32,
        height: "100%",
        padding: "20px 32px",
      }}
    >
      <div style={{ fontSize: 22, fontWeight: 700, color: "#a5b4fc", letterSpacing: 1 }}>
        Calming Corner 🌿
      </div>

      {/* Breathing circle */}
      <div style={{ position: "relative", width: 160, height: 160, display: "flex", alignItems: "center", justifyContent: "center" }}>
        {/* Outer glow ring */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            borderRadius: "50%",
            background: "radial-gradient(circle, rgba(99,102,241,0.18) 0%, transparent 70%)",
            transform: `scale(${breatheScale})`,
            transition: breatheTransition,
            opacity: breatheScale === 1.45 ? 1 : 0.6,
          }}
        />
        {/* Main circle */}
        <div
          style={{
            width: 110,
            height: 110,
            borderRadius: "50%",
            background: "linear-gradient(135deg, #4f46e5, #7c3aed, #06b6d4)",
            boxShadow: "0 0 40px rgba(99,102,241,0.5)",
            transform: `scale(${breatheScale})`,
            transition: breatheTransition,
            opacity: breatheScale === 1.45 ? 1 : 0.7,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <span style={{ fontSize: 32 }}>🌬️</span>
        </div>
      </div>

      <div
        style={{
          fontSize: 20,
          fontWeight: 600,
          color: "#c7d2fe",
          minHeight: 32,
          textAlign: "center",
          transition: "opacity 0.5s",
        }}
      >
        {breatheLabel}
      </div>

      {/* Affirmation card */}
      <div
        key={affirmKey}
        style={{
          background: "rgba(99,102,241,0.13)",
          border: "1.5px solid rgba(167,139,250,0.3)",
          borderRadius: 16,
          padding: "18px 28px",
          fontSize: 17,
          fontWeight: 600,
          color: "#e0e7ff",
          textAlign: "center",
          maxWidth: 340,
          animation: "affirmationSpin 8s ease forwards",
          lineHeight: 1.5,
        }}
      >
        {AFFIRMATIONS[affirmIdx]}
      </div>

      <div style={{ fontSize: 13, color: "rgba(167,139,250,0.6)", textAlign: "center" }}>
        Take a moment to breathe and relax
      </div>
    </div>
  );
}

// ─── Circular countdown clock ─────────────────────────────────────────────────

function CountdownClock({
  secondsLeft,
  totalSeconds,
}: {
  secondsLeft: number;
  totalSeconds: number;
}) {
  const r = 120;
  const strokeWidth = 12;
  const circumference = 2 * Math.PI * r;
  const progress = totalSeconds > 0 ? secondsLeft / totalSeconds : 0;
  const strokeDashoffset = circumference * (1 - progress);

  const isUrgent = secondsLeft <= 120;   // 2 minutes
  const isCritical = secondsLeft <= 30;

  const minutes = Math.floor(secondsLeft / 60);
  const seconds = secondsLeft % 60;
  const timeStr = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;

  const strokeColor = isUrgent ? "#ff6b6b" : "#7c3aed";
  const glowColor = isUrgent ? "rgba(255,107,107,0.4)" : "rgba(124,58,237,0.35)";

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 16,
        height: "100%",
      }}
    >
      <div style={{ fontSize: 15, fontWeight: 600, color: "rgba(199,210,254,0.7)", letterSpacing: 1, textTransform: "uppercase" }}>
        Break ends in
      </div>

      <div
        style={{
          position: "relative",
          width: 280,
          height: 280,
          animation: isCritical ? "pulseRed 1.2s ease-in-out infinite" : undefined,
          borderRadius: "50%",
        }}
      >
        <svg
          width={280}
          height={280}
          viewBox="0 0 280 280"
          style={{ transform: "rotate(-90deg)" }}
        >
          {/* Track */}
          <circle
            cx={140}
            cy={140}
            r={r}
            fill="none"
            stroke="rgba(255,255,255,0.06)"
            strokeWidth={strokeWidth}
          />
          {/* Progress arc */}
          <circle
            cx={140}
            cy={140}
            r={r}
            fill="none"
            stroke={strokeColor}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            style={{
              transition: "stroke-dashoffset 0.9s linear, stroke 0.5s ease",
              filter: `drop-shadow(0 0 8px ${glowColor})`,
            }}
          />
        </svg>

        {/* Center time */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <span
            style={{
              fontSize: 48,
              fontWeight: 800,
              color: isUrgent ? "#ff6b6b" : "#e0e7ff",
              letterSpacing: -1,
              fontVariantNumeric: "tabular-nums",
              transition: "color 0.5s",
              fontFamily: "monospace",
            }}
          >
            {timeStr}
          </span>
          <span style={{ fontSize: 13, color: "rgba(167,139,250,0.7)", marginTop: 4 }}>
            {isUrgent ? "Almost time!" : "remaining"}
          </span>
        </div>
      </div>
    </div>
  );
}

// ─── Toast ────────────────────────────────────────────────────────────────────

function BreakEndToast() {
  return (
    <div
      style={{
        position: "fixed",
        bottom: 48,
        left: "50%",
        transform: "translateX(-50%)",
        background: "linear-gradient(135deg, #4f46e5, #7c3aed)",
        color: "#fff",
        padding: "18px 36px",
        borderRadius: 18,
        fontSize: 18,
        fontWeight: 700,
        zIndex: 9999,
        animation: "breakToastBounce 0.6s cubic-bezier(0.22,1,0.36,1) forwards",
        boxShadow: "0 8px 40px rgba(79,70,229,0.55)",
        whiteSpace: "nowrap",
      }}
    >
      Great break! Let's get back to it! 💪
    </div>
  );
}

// ─── BreakOverlay ─────────────────────────────────────────────────────────────

interface BreakOverlayProps {
  studentId: string;
  breakSecondsLeft: number;
  onBreakEnd: () => void;
  breakGames: BreakGame[];
  calmingCornerEnabled?: boolean;
  optionChosen: string | null;
  onOptionChosen: (option: string) => void;
  breakConfig: BreakConfig;
}

export function BreakOverlay({
  studentId,
  breakSecondsLeft,
  onBreakEnd,
  breakGames,
  calmingCornerEnabled = true,
  optionChosen,
  onOptionChosen,
  breakConfig,
}: BreakOverlayProps) {
  const [sliding, setSliding] = useState(false);
  const [showToast, setShowToast] = useState(false);
  const [visible, setVisible] = useState(true);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const lastBeepRef = useRef<number>(-1);
  const totalSeconds = breakConfig.break_duration_minutes * 60;

  // Init audio context
  useEffect(() => {
    audioCtxRef.current = getAudioCtx();
    return () => {
      try { audioCtxRef.current?.close(); } catch { /* ignore */ }
    };
  }, []);

  // Beep at 30s warning, every 5 seconds
  useEffect(() => {
    if (breakSecondsLeft <= 30 && breakSecondsLeft > 0) {
      const slot = Math.floor(breakSecondsLeft / 5);
      if (slot !== lastBeepRef.current) {
        lastBeepRef.current = slot;
        if (audioCtxRef.current) {
          playBeep(audioCtxRef.current);
        }
      }
    }
  }, [breakSecondsLeft]);

  // Detect break end
  useEffect(() => {
    if (breakSecondsLeft === 0 && optionChosen !== null) {
      // Start slide-out animation
      setSliding(true);
      setShowToast(true);

      const toastTimer = setTimeout(() => {
        setVisible(false);
        setShowToast(false);
        onBreakEnd();
      }, 2800);

      return () => clearTimeout(toastTimer);
    }
  }, [breakSecondsLeft, optionChosen, onBreakEnd]);

  if (!visible) return null;

  const slideStyle: React.CSSProperties = {
    position: "fixed",
    inset: 0,
    zIndex: 9000,
    background: "linear-gradient(135deg, #0f0724 0%, #0a0b20 50%, #07071a 100%)",
    display: "flex",
    flexDirection: "column",
    animation: sliding
      ? "breakOverlaySlideOut 0.6s cubic-bezier(0.22,1,0.36,1) forwards"
      : "breakOverlaySlideIn 0.55s cubic-bezier(0.22,1,0.36,1) forwards",
    overflow: "hidden",
  };

  // Max 3 games from list
  const displayedGames = breakGames.slice(0, 3);

  return (
    <>
      <div style={slideStyle}>
        {/* Decorative stars */}
        <StarField />

        {/* Phase A — option selection */}
        {optionChosen === null ? (
          <PhaseA
            calmingCornerEnabled={calmingCornerEnabled}
            displayedGames={displayedGames}
            onOptionChosen={onOptionChosen}
          />
        ) : (
          /* Phase B — break in progress */
          <PhaseB
            optionChosen={optionChosen}
            breakSecondsLeft={breakSecondsLeft}
            totalSeconds={totalSeconds}
          />
        )}
      </div>

      {showToast && <BreakEndToast />}
    </>
  );
}

// ─── Star field decoration ────────────────────────────────────────────────────

function StarField() {
  const stars = useMemo(
    () =>
      Array.from({ length: 40 }, (_, i) => ({
        id: i,
        x: Math.random() * 100,
        y: Math.random() * 100,
        size: 1 + Math.random() * 2.5,
        opacity: 0.1 + Math.random() * 0.3,
      })),
    []
  );

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
      {stars.map((s) => (
        <div
          key={s.id}
          style={{
            position: "absolute",
            left: `${s.x}%`,
            top: `${s.y}%`,
            width: s.size,
            height: s.size,
            borderRadius: "50%",
            background: "#fff",
            opacity: s.opacity,
          }}
        />
      ))}
    </div>
  );
}

// ─── Phase A — option selection ───────────────────────────────────────────────

function PhaseA({
  calmingCornerEnabled,
  displayedGames,
  onOptionChosen,
}: {
  calmingCornerEnabled: boolean;
  displayedGames: BreakGame[];
  onOptionChosen: (option: string) => void;
}) {
  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "40px 24px",
        position: "relative",
        zIndex: 1,
      }}
    >
      {/* Header card */}
      <div
        style={{
          background: "rgba(79,70,229,0.15)",
          backdropFilter: "blur(12px)",
          border: "1.5px solid rgba(167,139,250,0.25)",
          borderRadius: 28,
          padding: "48px 56px 40px",
          maxWidth: 700,
          width: "100%",
          boxShadow: "0 24px 80px rgba(0,0,0,0.5)",
        }}
      >
        <div style={{ textAlign: "center", marginBottom: 36 }}>
          <div style={{ fontSize: 52, marginBottom: 12 }}>🎉</div>
          <h1
            style={{
              margin: 0,
              fontSize: 38,
              fontWeight: 800,
              color: "#fff",
              letterSpacing: -1,
            }}
          >
            Break Time!
          </h1>
          <p
            style={{
              margin: "12px 0 0",
              fontSize: 18,
              color: "rgba(199,210,254,0.8)",
              fontWeight: 500,
            }}
          >
            You've earned a break! What would you like to do?
          </p>
        </div>

        {/* Choice grid */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: `repeat(${Math.min(
              (calmingCornerEnabled ? 1 : 0) + displayedGames.length,
              4
            )}, 1fr)`,
            gap: 16,
          }}
        >
          {calmingCornerEnabled && (
            <ChoiceCard
              emoji="🌬️"
              label="Calming Corner"
              description="Breathe & relax"
              color="#06b6d4"
              onClick={() => onOptionChosen("calming")}
            />
          )}
          {displayedGames.map((g) => {
            const meta = GAME_META[g.game_id] || {
              label: g.game_id,
              emoji: "🎮",
            };
            return (
              <ChoiceCard
                key={g.game_id}
                emoji={meta.emoji}
                label={meta.label}
                description="Play a game"
                color="#7c3aed"
                onClick={() => onOptionChosen(`game:${g.game_id}`)}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}

function ChoiceCard({
  emoji,
  label,
  description,
  color,
  onClick,
}: {
  emoji: string;
  label: string;
  description: string;
  color: string;
  onClick: () => void;
}) {
  const [hovered, setHovered] = useState(false);

  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 12,
        padding: "28px 16px",
        borderRadius: 20,
        border: `2px solid ${hovered ? color : "rgba(255,255,255,0.1)"}`,
        background: hovered
          ? `${color}22`
          : "rgba(255,255,255,0.04)",
        cursor: "pointer",
        transition: "all 0.22s ease",
        transform: hovered ? "translateY(-4px) scale(1.03)" : "translateY(0) scale(1)",
        boxShadow: hovered ? `0 12px 40px ${color}33` : "none",
        minHeight: 150,
      }}
    >
      <span style={{ fontSize: 44 }}>{emoji}</span>
      <span style={{ fontSize: 17, fontWeight: 700, color: "#fff" }}>{label}</span>
      <span style={{ fontSize: 13, color: "rgba(199,210,254,0.6)" }}>
        {description}
      </span>
    </button>
  );
}

// ─── Phase B — break in progress ──────────────────────────────────────────────

function PhaseB({
  optionChosen,
  breakSecondsLeft,
  totalSeconds,
}: {
  optionChosen: string;
  breakSecondsLeft: number;
  totalSeconds: number;
}) {
  const isGame = optionChosen.startsWith("game:");
  const gameId = isGame ? optionChosen.replace("game:", "") : "";
  const gameMeta = GAME_META[gameId] || { label: gameId, emoji: "🎮" };

  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        position: "relative",
        zIndex: 1,
        overflow: "hidden",
      }}
    >
      {/* Left: countdown (40%) */}
      <div
        style={{
          width: "40%",
          borderRight: "1px solid rgba(255,255,255,0.06)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 32,
          background: "rgba(0,0,0,0.15)",
        }}
      >
        <CountdownClock
          secondsLeft={breakSecondsLeft}
          totalSeconds={totalSeconds}
        />
      </div>

      {/* Right: content (60%) */}
      <div
        style={{
          width: "60%",
          display: "flex",
          alignItems: "stretch",
          justifyContent: "stretch",
          overflow: "hidden",
        }}
      >
        {optionChosen === "calming" ? (
          <CalmingCorner />
        ) : (
          <GameView gameId={gameId} gameMeta={gameMeta} />
        )}
      </div>
    </div>
  );
}

// ─── Game view (iframe) ───────────────────────────────────────────────────────

function GameView({
  gameId,
  gameMeta,
}: {
  gameId: string;
  gameMeta: { label: string; emoji: string };
}) {
  const [loaded, setLoaded] = useState(false);

  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        position: "relative",
      }}
    >
      {/* Header bar */}
      <div
        style={{
          padding: "16px 28px",
          borderBottom: "1px solid rgba(255,255,255,0.06)",
          display: "flex",
          alignItems: "center",
          gap: 12,
          background: "rgba(0,0,0,0.1)",
        }}
      >
        <span style={{ fontSize: 28 }}>{gameMeta.emoji}</span>
        <div>
          <div style={{ fontSize: 18, fontWeight: 700, color: "#fff" }}>
            {gameMeta.label}
          </div>
          <div style={{ fontSize: 13, color: "rgba(199,210,254,0.6)" }}>
            Enjoy your break — timer is still running!
          </div>
        </div>
        {!loaded && (
          <div
            style={{
              marginLeft: "auto",
              fontSize: 13,
              color: "rgba(167,139,250,0.7)",
              fontStyle: "italic",
            }}
          >
            Loading {gameMeta.label}...
          </div>
        )}
      </div>

      {/* Game iframe */}
      <iframe
        src="/arcade"
        title={`Break game: ${gameMeta.label}`}
        onLoad={() => setLoaded(true)}
        style={{
          flex: 1,
          border: "none",
          background: "#000",
          opacity: loaded ? 1 : 0,
          transition: "opacity 0.4s",
        }}
        sandbox="allow-scripts allow-same-origin allow-forms"
      />
    </div>
  );
}

// ─── BreakButton ──────────────────────────────────────────────────────────────

interface BreakButtonProps {
  breakEarned: boolean;
  onStartBreak: () => void;
  workSeconds: number;
  threshold: number; // in minutes
}

export function BreakButton({
  breakEarned,
  onStartBreak,
  workSeconds,
  threshold,
}: BreakButtonProps) {
  const thresholdSeconds = threshold * 60;
  const progress = Math.min(workSeconds / thresholdSeconds, 1);
  const showProgress = progress >= 0.7 && !breakEarned;

  if (!breakEarned && !showProgress) return null;

  if (breakEarned) {
    return (
      <button
        onClick={onStartBreak}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
          padding: "12px 24px",
          borderRadius: 14,
          border: "2px solid rgba(34,211,238,0.6)",
          background: "linear-gradient(135deg, rgba(6,182,212,0.2), rgba(79,70,229,0.2))",
          color: "#22d3ee",
          fontSize: 15,
          fontWeight: 700,
          cursor: "pointer",
          animation: "breakPulseGlow 2s ease-in-out infinite",
          letterSpacing: 0.5,
          transition: "transform 0.15s ease",
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLButtonElement).style.transform = "scale(1.05)";
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLButtonElement).style.transform = "scale(1)";
        }}
      >
        <span>☕</span>
        <span>Take a Break</span>
      </button>
    );
  }

  // Progress bar (70-99%)
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 4,
        minWidth: 140,
      }}
    >
      <div
        style={{
          fontSize: 11,
          color: "rgba(167,139,250,0.6)",
          fontWeight: 600,
          letterSpacing: 0.5,
          textTransform: "uppercase",
        }}
      >
        Break progress
      </div>
      <div
        style={{
          height: 6,
          borderRadius: 3,
          background: "rgba(255,255,255,0.08)",
          overflow: "hidden",
          width: 140,
        }}
      >
        <div
          style={{
            height: "100%",
            width: `${progress * 100}%`,
            background: "linear-gradient(90deg, #4f46e5, #06b6d4)",
            borderRadius: 3,
            transition: "width 1s linear",
          }}
        />
      </div>
    </div>
  );
}
