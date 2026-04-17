import React, { useEffect, useRef, useState, useCallback } from "react";

// Basketball — click/hold to set power, release to shoot with arc toward hoop
const W = 380, H = 480;
const HOOP_X = 300, HOOP_Y = 140, HOOP_R = 28;
const BALL_START = { x: 60, y: 380 };
const G = 0.45;

type Ball = { x: number; y: number; vx: number; vy: number; active: boolean; trail: { x: number; y: number }[] };
type State = { ball: Ball; power: number; charging: boolean; score: number; misses: number; streak: number; bestStreak: number; angle: number };

function initState(): State {
  return {
    ball: { x: BALL_START.x, y: BALL_START.y, vx: 0, vy: 0, active: false, trail: [] },
    power: 0, charging: false, score: 0, misses: 0, streak: 0,
    bestStreak: Number(localStorage.getItem("bball_streak") || 0), angle: -0.95,
  };
}

export default function Basketball() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const st = useRef<State>(initState());
  const raf = useRef(0);
  const [ui, setUi] = useState({ score: 0, misses: 0, streak: 0, best: 0, result: "" });

  const draw = useCallback(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    const s = st.current;

    // Court
    const court = ctx.createLinearGradient(0, H * 0.6, 0, H);
    court.addColorStop(0, "#d97706"); court.addColorStop(1, "#b45309");
    ctx.fillStyle = "#bfdbfe"; ctx.fillRect(0, 0, W, H * 0.6);
    ctx.fillStyle = court; ctx.fillRect(0, H * 0.6, W, H * 0.4);

    // Crowd / bleachers (simple rows)
    ctx.fillStyle = "#93c5fd"; ctx.fillRect(0, H * 0.55, W, 20);
    ctx.fillStyle = "#60a5fa"; ctx.fillRect(0, H * 0.52, W, 14);

    // Backboard
    ctx.fillStyle = "#fff"; ctx.strokeStyle = "#1e293b"; ctx.lineWidth = 2;
    ctx.fillRect(HOOP_X + 10, HOOP_Y - 60, 50, 80); ctx.strokeRect(HOOP_X + 10, HOOP_Y - 60, 50, 80);
    ctx.strokeStyle = "#dc2626"; ctx.strokeRect(HOOP_X + 18, HOOP_Y - 45, 34, 25); // inner square

    // Hoop left side (behind)
    ctx.strokeStyle = "#dc2626"; ctx.lineWidth = 5; ctx.lineCap = "round";
    ctx.beginPath(); ctx.arc(HOOP_X, HOOP_Y, HOOP_R, 0, Math.PI * 0.9); ctx.stroke();

    // Net
    ctx.strokeStyle = "#e2e8f0"; ctx.lineWidth = 1.5;
    for (let i = 0; i < 7; i++) {
      const a = (i / 6) * Math.PI;
      const nx = HOOP_X - HOOP_R + i * (HOOP_R * 2 / 6);
      ctx.beginPath(); ctx.moveTo(HOOP_X - HOOP_R + (HOOP_R * 2 / 6) * i, HOOP_Y);
      ctx.lineTo(HOOP_X + (i - 3) * 4, HOOP_Y + 40); ctx.stroke();
    }
    ctx.beginPath(); ctx.moveTo(HOOP_X - HOOP_R, HOOP_Y + 20); ctx.lineTo(HOOP_X + HOOP_R, HOOP_Y + 20); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(HOOP_X - HOOP_R + 6, HOOP_Y + 35); ctx.lineTo(HOOP_X + HOOP_R - 6, HOOP_Y + 35); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(HOOP_X - 6, HOOP_Y + 42); ctx.lineTo(HOOP_X + 6, HOOP_Y + 42); ctx.stroke();

    // Support pole
    ctx.fillStyle = "#94a3b8"; ctx.fillRect(HOOP_X + 30, HOOP_Y - 60, 8, H - HOOP_Y + 60);

    // Arc preview when charging
    if (s.charging && !s.ball.active) {
      const pct = Math.min(1, s.power / 100);
      const spd = 8 + pct * 14;
      const vx = Math.cos(s.angle) * spd, vy = Math.sin(s.angle) * spd;
      ctx.setLineDash([5, 8]); ctx.strokeStyle = "#ffffff60"; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(BALL_START.x, BALL_START.y);
      let px = BALL_START.x, py = BALL_START.y, pvx = vx, pvy = vy;
      for (let i = 0; i < 40; i++) { pvx *= 0.995; pvy += G; px += pvx; py += pvy; if (py > H) break; ctx.lineTo(px, py); }
      ctx.stroke(); ctx.setLineDash([]);
    }

    // Ball trail
    s.ball.trail.forEach((pt, i) => {
      ctx.beginPath(); ctx.arc(pt.x, pt.y, 14 * (i / s.ball.trail.length) * 0.6, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(251,146,60,${(i / s.ball.trail.length) * 0.3})`; ctx.fill();
    });

    // Ball
    if (s.ball.active || (!s.ball.active && s.ball.x === BALL_START.x)) {
      const gradient = ctx.createRadialGradient(s.ball.x - 4, s.ball.y - 4, 2, s.ball.x, s.ball.y, 16);
      gradient.addColorStop(0, "#fb923c"); gradient.addColorStop(1, "#c2410c");
      ctx.fillStyle = gradient; ctx.beginPath(); ctx.arc(s.ball.x, s.ball.y, 16, 0, Math.PI * 2); ctx.fill();
      // Lines
      ctx.strokeStyle = "#92400e70"; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(s.ball.x, s.ball.y, 16, -0.3, Math.PI - 0.3); ctx.stroke();
      ctx.beginPath(); ctx.arc(s.ball.x, s.ball.y, 16, 0.3 + Math.PI, Math.PI * 2 - 0.3); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(s.ball.x, s.ball.y - 16); ctx.lineTo(s.ball.x, s.ball.y + 16); ctx.stroke();
    }

    // Hoop front arc
    ctx.strokeStyle = "#dc2626"; ctx.lineWidth = 5;
    ctx.beginPath(); ctx.arc(HOOP_X, HOOP_Y, HOOP_R, Math.PI * 0.9, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.arc(HOOP_X, HOOP_Y, HOOP_R, 0, Math.PI * 0.05); ctx.stroke();

    // Power bar
    if (s.charging) {
      const pct = Math.min(1, s.power / 100);
      ctx.fillStyle = "#00000030"; ctx.fillRect(20, H - 20, 120, 10);
      const barColor = pct < 0.5 ? "#4ade80" : pct < 0.8 ? "#fbbf24" : "#ef4444";
      ctx.fillStyle = barColor; ctx.fillRect(20, H - 20, 120 * pct, 10);
      ctx.strokeStyle = "#fff"; ctx.lineWidth = 1; ctx.strokeRect(20, H - 20, 120, 10);
      ctx.fillStyle = "#fff"; ctx.font = "bold 11px system-ui"; ctx.fillText("POWER", 145, H - 12);
    }

    // Score
    ctx.fillStyle = "#1e293b"; ctx.font = "bold 18px system-ui"; ctx.textAlign = "right";
    ctx.fillText(`🏀 ${s.score}`, W - 14, 30); ctx.textAlign = "left";
    ctx.fillStyle = "#64748b"; ctx.font = "12px system-ui";
    ctx.fillText(`Streak: ${s.streak}🔥`, 14, 30);
  }, []);

  const step = useCallback(() => {
    const s = st.current;
    if (s.charging && !s.ball.active) {
      s.power = Math.min(100, s.power + 1.4);
    }
    if (s.ball.active) {
      s.ball.vx *= 0.999; s.ball.vy += G;
      s.ball.x += s.ball.vx; s.ball.y += s.ball.vy;
      s.ball.trail = [...s.ball.trail.slice(-10), { x: s.ball.x, y: s.ball.y }];

      // Score — pass through hoop
      const dx = s.ball.x - HOOP_X, dy = s.ball.y - HOOP_Y;
      const dist = Math.hypot(dx, dy);
      if (dist < HOOP_R + 2 && s.ball.vy > 0 && s.ball.y < HOOP_Y + 10) {
        s.score += 2; s.streak++;
        if (s.streak > s.bestStreak) { s.bestStreak = s.streak; localStorage.setItem("bball_streak", String(s.streak)); }
        setUi(u => ({ ...u, score: s.score, streak: s.streak, best: s.bestStreak, result: `+2! ${s.streak >= 3 ? "🔥".repeat(Math.min(s.streak,5)) : ""}` }));
        s.ball = { x: BALL_START.x, y: BALL_START.y, vx: 0, vy: 0, active: false, trail: [] };
      }

      // Off screen
      if (s.ball.y > H + 30 || s.ball.x > W + 30 || s.ball.x < -30) {
        s.misses++; s.streak = 0;
        setUi(u => ({ ...u, misses: s.misses, streak: 0, result: "Miss!" }));
        s.ball = { x: BALL_START.x, y: BALL_START.y, vx: 0, vy: 0, active: false, trail: [] };
      }

      // Backboard bounce
      if (s.ball.x + 16 > HOOP_X + 10 && s.ball.x - 16 < HOOP_X + 60 &&
          s.ball.y + 16 > HOOP_Y - 60 && s.ball.y - 16 < HOOP_Y + 20) {
        s.ball.vx *= -0.6; s.ball.x += s.ball.vx * 2;
      }
    }
    draw();
    raf.current = requestAnimationFrame(step);
  }, [draw]);

  useEffect(() => { raf.current = requestAnimationFrame(step); return () => cancelAnimationFrame(raf.current); }, [step]);

  const startCharge = () => { if (!st.current.ball.active) { st.current.charging = true; st.current.power = 0; } };
  const release = () => {
    const s = st.current;
    if (!s.charging || s.ball.active) return;
    s.charging = false;
    const pct = Math.min(1, s.power / 100);
    const spd = 8 + pct * 14;
    s.ball = { x: BALL_START.x, y: BALL_START.y, vx: Math.cos(s.angle) * spd, vy: Math.sin(s.angle) * spd, active: true, trail: [] };
    s.power = 0;
  };

  // Aim with mouse/touch X position
  const aim = (mx: number, my: number, canvas: HTMLCanvasElement) => {
    const rect = canvas.getBoundingClientRect();
    const sx = (mx - rect.left) * (W / rect.width);
    const sy = (my - rect.top) * (H / rect.height);
    st.current.angle = Math.atan2(sy - BALL_START.y, sx - BALL_START.x);
  };

  return (
    <div className="flex flex-col items-center gap-3 p-3" style={{ background: "#1e3a5f" }}>
      <div className="flex gap-4 text-sm font-bold text-white">
        <span>🏀 {ui.score}</span>
        <span>🔥 {ui.streak}</span>
        <span className="text-white/50">Best: {ui.best}</span>
        {ui.result && <span className="text-yellow-300">{ui.result}</span>}
      </div>

      <canvas ref={canvasRef} width={W} height={H} className="rounded-2xl max-w-full"
        style={{ touchAction: "none", cursor: "crosshair" }}
        onMouseMove={e => aim(e.clientX, e.clientY, e.currentTarget)}
        onMouseDown={startCharge} onMouseUp={release}
        onTouchStart={e => { aim(e.touches[0].clientX, e.touches[0].clientY, e.currentTarget); startCharge(); }}
        onTouchMove={e => aim(e.touches[0].clientX, e.touches[0].clientY, e.currentTarget)}
        onTouchEnd={release}
      />

      <div className="flex gap-2">
        <button onMouseDown={startCharge} onMouseUp={release}
          onTouchStart={startCharge} onTouchEnd={release}
          className="bg-orange-500 text-white px-6 py-3 rounded-2xl font-bold text-lg border-2 border-orange-400"
          style={{ touchAction: "manipulation" }}>
          🏀 Hold & Release to Shoot
        </button>
      </div>
      <p className="text-blue-300/50 text-xs">Move to aim · hold = more power · release to shoot</p>
    </div>
  );
}
