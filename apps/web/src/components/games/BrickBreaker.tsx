import React, { useEffect, useRef, useState, useCallback } from "react";

const W = 400;
const H = 480;
const PADDLE_W = 70;
const PADDLE_H = 12;
const BALL_R = 7;
const BRICK_ROWS = 5;
const BRICK_COLS = 8;
const BRICK_W = Math.floor(W / BRICK_COLS) - 3;
const BRICK_H = 18;
const BRICK_PAD = 3;
const BRICK_TOP = 50;

const BRICK_COLORS = [
  "#ef4444", "#f97316", "#f59e0b",
  "#22c55e", "#3b82f6", "#8b5cf6",
];

interface Brick { x: number; y: number; alive: boolean; color: string; hits: number; maxHits: number }
interface Ball { x: number; y: number; vx: number; vy: number }

function makeBricks(): Brick[] {
  const bricks: Brick[] = [];
  for (let r = 0; r < BRICK_ROWS; r++) {
    const maxHits = BRICK_ROWS - r;
    for (let c = 0; c < BRICK_COLS; c++) {
      bricks.push({
        x: c * (BRICK_W + BRICK_PAD) + BRICK_PAD / 2 + 2,
        y: BRICK_TOP + r * (BRICK_H + BRICK_PAD),
        alive: true,
        color: BRICK_COLORS[r % BRICK_COLORS.length],
        hits: 0,
        maxHits,
      });
    }
  }
  return bricks;
}

function initBall(): Ball { return { x: W / 2, y: H - 80, vx: 3 * (Math.random() < 0.5 ? 1 : -1), vy: -4 }; }

export default function BrickBreaker() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef({
    paddleX: W / 2, bricks: makeBricks(), ball: initBall(),
    score: 0, lives: 3, alive: true, started: false, paused: false,
  });
  const keysRef = useRef<Set<string>>(new Set());
  const pointerXRef = useRef<number | null>(null);
  const [score, setScore] = useState(0);
  const [lives, setLives] = useState(3);
  const [dead, setDead] = useState(false);
  const [won, setWon] = useState(false);
  const [started, setStarted] = useState(false);
  const rafRef = useRef(0);

  // Apple Pencil palm rejection
  const activePenRef = useRef<number | null>(null);

  const draw = useCallback(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    const s = stateRef.current;

    ctx.fillStyle = "#07071a";
    ctx.fillRect(0, 0, W, H);

    // Bricks
    for (const b of s.bricks) {
      if (!b.alive) continue;
      const dmg = b.hits / b.maxHits;
      ctx.shadowColor = b.color;
      ctx.shadowBlur = 6;
      ctx.fillStyle = b.color;
      ctx.globalAlpha = 1 - dmg * 0.5;
      ctx.beginPath();
      ctx.roundRect(b.x, b.y, BRICK_W, BRICK_H, 4);
      ctx.fill();
      ctx.globalAlpha = 1;
      if (dmg > 0) {
        ctx.strokeStyle = "rgba(255,255,255,0.3)";
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    }
    ctx.shadowBlur = 0;

    // Paddle
    const px = s.paddleX - PADDLE_W / 2;
    const py = H - PADDLE_H - 15;
    const pg = ctx.createLinearGradient(px, py, px + PADDLE_W, py);
    pg.addColorStop(0, "#a78bfa"); pg.addColorStop(1, "#6366f1");
    ctx.shadowColor = "#a78bfa"; ctx.shadowBlur = 10;
    ctx.fillStyle = pg;
    ctx.beginPath(); ctx.roundRect(px, py, PADDLE_W, PADDLE_H, 6); ctx.fill();
    ctx.shadowBlur = 0;

    // Ball
    ctx.shadowColor = "#fbbf24"; ctx.shadowBlur = 14;
    ctx.fillStyle = "#fbbf24";
    ctx.beginPath(); ctx.arc(s.ball.x, s.ball.y, BALL_R, 0, Math.PI * 2); ctx.fill();
    ctx.shadowBlur = 0;

    // Lives
    ctx.font = "14px serif";
    ctx.textAlign = "left";
    for (let i = 0; i < s.lives; i++) ctx.fillText("❤️", 8 + i * 20, 22);
    ctx.fillStyle = "rgba(255,255,255,0.5)";
    ctx.font = "bold 13px system-ui";
    ctx.textAlign = "right";
    ctx.fillText(`Score: ${s.score}`, W - 8, 22);
  }, []);

  const update = useCallback(() => {
    const s = stateRef.current;
    if (!s.alive || !s.started || s.paused) return;

    // Keyboard
    if (keysRef.current.has("ArrowLeft") || keysRef.current.has("a")) s.paddleX = Math.max(PADDLE_W / 2, s.paddleX - 6);
    if (keysRef.current.has("ArrowRight") || keysRef.current.has("d")) s.paddleX = Math.min(W - PADDLE_W / 2, s.paddleX + 6);
    // Pointer (touch / mouse / pencil)
    if (pointerXRef.current !== null) s.paddleX = Math.max(PADDLE_W / 2, Math.min(W - PADDLE_W / 2, pointerXRef.current));

    const ball = s.ball;
    ball.x += ball.vx; ball.y += ball.vy;

    // Wall bounces
    if (ball.x - BALL_R <= 0) { ball.x = BALL_R; ball.vx = Math.abs(ball.vx); }
    if (ball.x + BALL_R >= W) { ball.x = W - BALL_R; ball.vx = -Math.abs(ball.vx); }
    if (ball.y - BALL_R <= 0) { ball.y = BALL_R; ball.vy = Math.abs(ball.vy); }

    // Paddle
    const py = H - PADDLE_H - 15;
    if (ball.y + BALL_R >= py && ball.y - BALL_R <= py + PADDLE_H &&
        ball.x > s.paddleX - PADDLE_W / 2 - BALL_R && ball.x < s.paddleX + PADDLE_W / 2 + BALL_R) {
      ball.y = py - BALL_R;
      const rel = (ball.x - s.paddleX) / (PADDLE_W / 2);
      ball.vx = rel * 5;
      ball.vy = -Math.max(3, Math.abs(ball.vy));
    }

    // Miss
    if (ball.y > H + 20) {
      s.lives--;
      setLives(s.lives);
      if (s.lives <= 0) { s.alive = false; setDead(true); return; }
      s.ball = initBall();
      s.paused = true;
      setTimeout(() => { s.paused = false; }, 600);
    }

    // Brick collisions
    let allDead = true;
    for (const b of s.bricks) {
      if (!b.alive) continue;
      allDead = false;
      const bRight = b.x + BRICK_W; const bBot = b.y + BRICK_H;
      if (ball.x + BALL_R > b.x && ball.x - BALL_R < bRight && ball.y + BALL_R > b.y && ball.y - BALL_R < bBot) {
        b.hits++;
        if (b.hits >= b.maxHits) { b.alive = false; s.score += 10 * b.maxHits; setScore(s.score); }
        // Determine bounce direction
        const overlapL = ball.x + BALL_R - b.x;
        const overlapR = bRight - (ball.x - BALL_R);
        const overlapT = ball.y + BALL_R - b.y;
        const overlapB = bBot - (ball.y - BALL_R);
        const minOverlap = Math.min(overlapL, overlapR, overlapT, overlapB);
        if (minOverlap === overlapT || minOverlap === overlapB) ball.vy *= -1;
        else ball.vx *= -1;
        break;
      }
    }
    if (allDead) { s.alive = false; setWon(true); }
  }, []);

  useEffect(() => {
    const PREVENT_KEYS = new Set(["ArrowUp","ArrowDown","ArrowLeft","ArrowRight"," ","a","A","d","D"]);
    const onKey = (e: KeyboardEvent) => {
      if (PREVENT_KEYS.has(e.key)) e.preventDefault();
      keysRef.current.add(e.key);
      if (!stateRef.current.started) { stateRef.current.started = true; setStarted(true); }
    };
    const onKeyUp = (e: KeyboardEvent) => keysRef.current.delete(e.key);
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onKeyUp);

    // Pointer events (replaces mousemove + touchmove)
    const canvas = canvasRef.current;
    const onPointerDown = (e: PointerEvent) => {
      if (!canvas) return;
      // Palm rejection
      if (e.pointerType === "touch" && activePenRef.current !== null) return;
      if (e.pointerType === "pen") activePenRef.current = e.pointerId;
      canvas.setPointerCapture(e.pointerId);
      const rect = canvas.getBoundingClientRect();
      pointerXRef.current = (e.clientX - rect.left) * (W / rect.width);
      if (!stateRef.current.started) { stateRef.current.started = true; setStarted(true); }
    };
    const onPointerMove = (e: PointerEvent) => {
      if (!canvas) return;
      if (e.pointerType === "touch" && activePenRef.current !== null) return;
      if (pointerXRef.current !== null) {
        const rect = canvas.getBoundingClientRect();
        pointerXRef.current = (e.clientX - rect.left) * (W / rect.width);
      }
    };
    const onPointerUp = (e: PointerEvent) => {
      if (e.pointerType === "pen") activePenRef.current = null;
      pointerXRef.current = null;
    };

    if (canvas) {
      canvas.addEventListener("pointerdown", onPointerDown);
      canvas.addEventListener("pointermove", onPointerMove);
      canvas.addEventListener("pointerup", onPointerUp);
      canvas.addEventListener("pointercancel", onPointerUp);
    }

    let last = 0;
    const loop = (ts: number) => {
      if (ts - last > 16) { last = ts; update(); draw(); }
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onKeyUp);
      if (canvas) {
        canvas.removeEventListener("pointerdown", onPointerDown);
        canvas.removeEventListener("pointermove", onPointerMove);
        canvas.removeEventListener("pointerup", onPointerUp);
        canvas.removeEventListener("pointercancel", onPointerUp);
      }
      cancelAnimationFrame(rafRef.current);
    };
  }, [update, draw]);

  const restart = () => {
    stateRef.current = { paddleX: W / 2, bricks: makeBricks(), ball: initBall(), score: 0, lives: 3, alive: true, started: false, paused: false };
    setScore(0); setLives(3); setDead(false); setWon(false); setStarted(false);
  };

  // Left/right on-screen buttons
  const leftPressed = useRef(false);
  const rightPressed = useRef(false);

  const onBtnPointerDown = (dir: "left" | "right") => (e: React.PointerEvent) => {
    e.preventDefault();
    if (dir === "left") { keysRef.current.add("ArrowLeft"); leftPressed.current = true; }
    else { keysRef.current.add("ArrowRight"); rightPressed.current = true; }
    if (!stateRef.current.started) { stateRef.current.started = true; setStarted(true); }
  };
  const onBtnPointerUp = (dir: "left" | "right") => (e: React.PointerEvent) => {
    e.preventDefault();
    if (dir === "left") { keysRef.current.delete("ArrowLeft"); leftPressed.current = false; }
    else { keysRef.current.delete("ArrowRight"); rightPressed.current = false; }
  };

  const btnStyle: React.CSSProperties = {
    minWidth: 60, minHeight: 52,
    padding: "10px 18px",
    display: "flex", alignItems: "center", justifyContent: "center",
    borderRadius: 12,
    background: "rgba(167,139,250,0.18)",
    border: "1px solid rgba(167,139,250,0.35)",
    color: "white",
    fontSize: 22,
    cursor: "pointer",
    userSelect: "none",
    WebkitUserSelect: "none",
    touchAction: "none",
  };

  return (
    <div className="flex flex-col items-center gap-2 h-full" style={{ background: "#07071a" }}>
      <div className="flex items-center justify-between w-full px-4 py-2">
        <span className="text-sm font-bold text-violet-400">🧱 Brick Breaker</span>
        <span className="text-sm text-white/60">Score: <span className="text-yellow-400 font-bold">{score}</span></span>
      </div>
      <div className="relative" style={{ overscrollBehavior: "contain" }}>
        <canvas
          ref={canvasRef}
          width={W}
          height={H}
          style={{
            borderRadius: 12,
            border: "1px solid rgba(139,92,246,0.25)",
            display: "block",
            maxWidth: "100%",
            cursor: "none",
            touchAction: "none",
            userSelect: "none",
            WebkitUserSelect: "none",
          }}
        />
        {!started && !dead && !won && (
          <div className="absolute inset-0 flex flex-col items-center justify-center rounded-xl" style={{ background: "rgba(7,7,26,0.88)" }}>
            <div className="text-4xl mb-2">🧱</div>
            <div className="text-white font-bold text-xl mb-1">Brick Breaker</div>
            <div className="text-white/50 text-sm mb-4">Touch/drag or ← → to control the paddle</div>
            <button
              onClick={() => { stateRef.current.started = true; setStarted(true); }}
              className="px-5 py-2 rounded-xl bg-violet-600 text-white font-bold text-sm hover:bg-violet-500 transition-colors"
              style={{ minHeight: 44 }}
            >Launch Ball!</button>
          </div>
        )}
        {(dead || won) && (
          <div className="absolute inset-0 flex flex-col items-center justify-center rounded-xl" style={{ background: "rgba(7,7,26,0.92)" }}>
            <div className="text-4xl mb-2">{won ? "🎉" : "💥"}</div>
            <div className="text-white font-bold text-xl mb-1">{won ? "You cleared it!" : "Game Over!"}</div>
            <div className="text-yellow-400 font-bold text-2xl mb-3">Score: {score}</div>
            <button onClick={restart} className="px-5 py-2 rounded-xl bg-violet-600 text-white font-bold text-sm hover:bg-violet-500 transition-colors" style={{ minHeight: 44 }}>Play Again</button>
          </div>
        )}
      </div>
      {/* On-screen left/right buttons */}
      <div style={{ display: "flex", gap: 16, marginTop: 4 }}>
        <button
          style={btnStyle}
          onPointerDown={onBtnPointerDown("left")}
          onPointerUp={onBtnPointerUp("left")}
          onPointerLeave={onBtnPointerUp("left")}
          onPointerCancel={onBtnPointerUp("left")}
          aria-label="Move paddle left"
        >◀</button>
        <button
          style={btnStyle}
          onPointerDown={onBtnPointerDown("right")}
          onPointerUp={onBtnPointerUp("right")}
          onPointerLeave={onBtnPointerUp("right")}
          onPointerCancel={onBtnPointerUp("right")}
          aria-label="Move paddle right"
        >▶</button>
      </div>
      <div className="text-xs text-white/30 pb-2">Touch/drag or ← → • Harder bricks need more hits</div>
    </div>
  );
}
