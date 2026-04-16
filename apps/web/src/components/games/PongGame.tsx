import React, { useEffect, useRef, useState, useCallback } from "react";

const W = 640;
const H = 360;
const PADDLE_W = 10;
const PADDLE_H = 70;
const BALL_R = 8;
const PADDLE_SPEED = 4.5;
const BALL_SPEED_INIT = 4;

interface State {
  p1y: number; p2y: number;
  bx: number; by: number;
  vx: number; vy: number;
  s1: number; s2: number;
  started: boolean;
  paused: boolean;
}

function initState(): State {
  const angle = (Math.random() * 40 - 20) * Math.PI / 180;
  return {
    p1y: H / 2 - PADDLE_H / 2, p2y: H / 2 - PADDLE_H / 2,
    bx: W / 2, by: H / 2,
    vx: BALL_SPEED_INIT * (Math.random() < 0.5 ? 1 : -1),
    vy: BALL_SPEED_INIT * Math.tan(angle),
    s1: 0, s2: 0, started: false, paused: false,
  };
}

export default function PongGame() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef<State>(initState());
  const keysRef = useRef<Set<string>>(new Set());
  const [scores, setScores] = useState({ s1: 0, s2: 0 });
  const [started, setStarted] = useState(false);
  const rafRef = useRef(0);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    const s = stateRef.current;

    ctx.fillStyle = "#07071a";
    ctx.fillRect(0, 0, W, H);

    // Center line dashes
    ctx.setLineDash([8, 10]);
    ctx.strokeStyle = "rgba(255,255,255,0.08)";
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(W / 2, 0); ctx.lineTo(W / 2, H); ctx.stroke();
    ctx.setLineDash([]);

    // Score display
    ctx.fillStyle = "rgba(255,255,255,0.12)";
    ctx.font = "bold 40px system-ui";
    ctx.textAlign = "center";
    ctx.fillText(String(s.s1), W / 4, 50);
    ctx.fillText(String(s.s2), (W * 3) / 4, 50);

    // Paddles
    const pGrad1 = ctx.createLinearGradient(15, s.p1y, 15, s.p1y + PADDLE_H);
    pGrad1.addColorStop(0, "#a78bfa"); pGrad1.addColorStop(1, "#6366f1");
    ctx.shadowColor = "#a78bfa"; ctx.shadowBlur = 12;
    ctx.fillStyle = pGrad1;
    ctx.beginPath(); ctx.roundRect(15, s.p1y, PADDLE_W, PADDLE_H, 5); ctx.fill();

    const pGrad2 = ctx.createLinearGradient(W - 25, s.p2y, W - 25, s.p2y + PADDLE_H);
    pGrad2.addColorStop(0, "#34d399"); pGrad2.addColorStop(1, "#059669");
    ctx.fillStyle = pGrad2;
    ctx.beginPath(); ctx.roundRect(W - 25, s.p2y, PADDLE_W, PADDLE_H, 5); ctx.fill();
    ctx.shadowBlur = 0;

    // Ball
    ctx.shadowColor = "#fbbf24"; ctx.shadowBlur = 18;
    ctx.fillStyle = "#fbbf24";
    ctx.beginPath(); ctx.arc(s.bx, s.by, BALL_R, 0, Math.PI * 2); ctx.fill();
    ctx.shadowBlur = 0;
  }, []);

  const update = useCallback(() => {
    const s = stateRef.current;
    if (!s.started || s.paused) return;
    const keys = keysRef.current;

    // P1 controls: W/S
    if (keys.has("w") || keys.has("W") || keys.has("ArrowUp")) s.p1y = Math.max(0, s.p1y - PADDLE_SPEED);
    if (keys.has("s") || keys.has("S") || keys.has("ArrowDown")) s.p1y = Math.min(H - PADDLE_H, s.p1y + PADDLE_SPEED);

    // P2 AI (follows ball with slight lag)
    const p2center = s.p2y + PADDLE_H / 2;
    if (p2center < s.by - 8) s.p2y = Math.min(H - PADDLE_H, s.p2y + PADDLE_SPEED * 0.85);
    if (p2center > s.by + 8) s.p2y = Math.max(0, s.p2y - PADDLE_SPEED * 0.85);

    // Ball movement
    s.bx += s.vx; s.by += s.vy;

    // Top/bottom wall bounce
    if (s.by - BALL_R <= 0) { s.by = BALL_R; s.vy = Math.abs(s.vy); }
    if (s.by + BALL_R >= H) { s.by = H - BALL_R; s.vy = -Math.abs(s.vy); }

    // P1 paddle collision
    if (s.bx - BALL_R <= 25 + PADDLE_W && s.bx + BALL_R >= 15 && s.by >= s.p1y && s.by <= s.p1y + PADDLE_H) {
      s.bx = 25 + PADDLE_W + BALL_R;
      const rel = (s.by - (s.p1y + PADDLE_H / 2)) / (PADDLE_H / 2);
      const speed = Math.min(10, Math.sqrt(s.vx * s.vx + s.vy * s.vy) + 0.3);
      s.vx = Math.abs(speed * Math.cos(rel * 0.8));
      s.vy = speed * Math.sin(rel * 0.8);
    }
    // P2 paddle collision
    if (s.bx + BALL_R >= W - 25 && s.bx - BALL_R <= W - 15 && s.by >= s.p2y && s.by <= s.p2y + PADDLE_H) {
      s.bx = W - 25 - BALL_R;
      const rel = (s.by - (s.p2y + PADDLE_H / 2)) / (PADDLE_H / 2);
      const speed = Math.min(10, Math.sqrt(s.vx * s.vx + s.vy * s.vy) + 0.3);
      s.vx = -Math.abs(speed * Math.cos(rel * 0.8));
      s.vy = speed * Math.sin(rel * 0.8);
    }

    // Score
    if (s.bx < 0) { s.s2++; setScores({ s1: s.s1, s2: s.s2 }); reset(s); }
    if (s.bx > W) { s.s1++; setScores({ s1: s.s1, s2: s.s2 }); reset(s); }
  }, []);

  function reset(s: State) {
    s.bx = W / 2; s.by = H / 2;
    const angle = (Math.random() * 40 - 20) * Math.PI / 180;
    s.vx = BALL_SPEED_INIT * (Math.random() < 0.5 ? 1 : -1);
    s.vy = BALL_SPEED_INIT * Math.tan(angle);
    s.paused = true;
    setTimeout(() => { s.paused = false; }, 800);
  }

  useEffect(() => {
    const PREVENT_KEYS = new Set(["ArrowUp","ArrowDown","ArrowLeft","ArrowRight"," ","w","W","s","S","a","A","d","D"]);
    const onKey = (e: KeyboardEvent) => {
      if (PREVENT_KEYS.has(e.key)) e.preventDefault();
      keysRef.current.add(e.key);
      if (!stateRef.current.started && ["w","s","W","S","ArrowUp","ArrowDown"].includes(e.key)) {
        stateRef.current.started = true; setStarted(true);
      }
    };
    const onKeyUp = (e: KeyboardEvent) => keysRef.current.delete(e.key);
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onKeyUp);
    let last = 0;
    const loop = (ts: number) => {
      if (ts - last > 16) { last = ts; update(); draw(); }
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => { window.removeEventListener("keydown", onKey); window.removeEventListener("keyup", onKeyUp); cancelAnimationFrame(rafRef.current); };
  }, [update, draw]);

  const startGame = () => { stateRef.current.started = true; stateRef.current.paused = false; setStarted(true); };

  return (
    <div className="flex flex-col items-center justify-center h-full gap-3 select-none" style={{ background: "#07071a" }}>
      <div className="flex items-center justify-between w-full px-4 py-2">
        <span className="text-xs text-violet-400 font-bold">🏓 Pong</span>
        <span className="text-xs text-white/50">You <span className="text-violet-400 font-bold">{scores.s1}</span> — <span className="text-green-400 font-bold">{scores.s2}</span> AI</span>
      </div>
      <div className="relative">
        <canvas ref={canvasRef} width={W} height={H} style={{ borderRadius: 12, border: "1px solid rgba(139,92,246,0.25)", display: "block", maxWidth: "100%" }} />
        {!started && (
          <div className="absolute inset-0 flex flex-col items-center justify-center rounded-xl" style={{ background: "rgba(7,7,26,0.88)" }}>
            <div className="text-4xl mb-2">🏓</div>
            <div className="text-white font-bold text-xl mb-1">Pong</div>
            <div className="text-white/50 text-sm mb-1">W/S or ↑/↓ to move paddle</div>
            <div className="text-white/30 text-xs mb-4">You are the left paddle</div>
            <button onClick={startGame} className="px-5 py-2 rounded-xl bg-violet-600 text-white font-bold text-sm hover:bg-violet-500 transition-colors">Start Game</button>
          </div>
        )}
      </div>
      <div className="text-xs text-white/30">W/S or Arrow keys • vs AI</div>
    </div>
  );
}
