import React, { useEffect, useRef, useState, useCallback } from "react";

const COLS = 20;
const ROWS = 16;
const CELL = 20;
const W = COLS * CELL;
const H = ROWS * CELL;
const TICK = 100;

type Dir = "UP" | "DOWN" | "LEFT" | "RIGHT";
type Point = { x: number; y: number };

function rand(max: number) { return Math.floor(Math.random() * max); }
function randFood(snake: Point[]): Point {
  let f: Point;
  do { f = { x: rand(COLS), y: rand(ROWS) }; }
  while (snake.some(s => s.x === f.x && s.y === f.y));
  return f;
}

export default function SnakeGame() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef({
    snake: [{ x: 10, y: 8 }] as Point[],
    dir: "RIGHT" as Dir,
    nextDir: "RIGHT" as Dir,
    food: { x: 15, y: 8 } as Point,
    score: 0,
    alive: true,
    started: false,
  });
  const [score, setScore] = useState(0);
  const [dead, setDead] = useState(false);
  const [started, setStarted] = useState(false);
  const rafRef = useRef(0);
  const lastTickRef = useRef(0);

  // Apple Pencil palm rejection
  const activePenRef = useRef<number | null>(null);
  // Swipe tracking
  const touchStart = useRef<{ x: number; y: number } | null>(null);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    const s = stateRef.current;

    ctx.fillStyle = "#07071a";
    ctx.fillRect(0, 0, W, H);

    // Grid dots
    ctx.fillStyle = "rgba(139,92,246,0.06)";
    for (let x = 0; x < COLS; x++)
      for (let y = 0; y < ROWS; y++) {
        ctx.beginPath();
        ctx.arc(x * CELL + CELL / 2, y * CELL + CELL / 2, 1, 0, Math.PI * 2);
        ctx.fill();
      }

    // Food glow
    ctx.shadowColor = "#f59e0b";
    ctx.shadowBlur = 12;
    ctx.fillStyle = "#f59e0b";
    ctx.beginPath();
    ctx.arc(s.food.x * CELL + CELL / 2, s.food.y * CELL + CELL / 2, CELL / 2 - 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    // Snake
    s.snake.forEach((seg, i) => {
      const t = 1 - i / s.snake.length;
      ctx.shadowColor = `rgba(139,92,246,${t * 0.6})`;
      ctx.shadowBlur = 8 * t;
      ctx.fillStyle = i === 0 ? "#a78bfa" : `rgba(99,102,241,${0.4 + t * 0.6})`;
      const pad = i === 0 ? 1 : 2;
      ctx.beginPath();
      ctx.roundRect(seg.x * CELL + pad, seg.y * CELL + pad, CELL - pad * 2, CELL - pad * 2, 4);
      ctx.fill();
    });
    ctx.shadowBlur = 0;
  }, []);

  const tick = useCallback((ts: number) => {
    if (ts - lastTickRef.current >= TICK) {
      lastTickRef.current = ts;
      const s = stateRef.current;
      if (!s.alive || !s.started) { draw(); rafRef.current = requestAnimationFrame(tick); return; }

      s.dir = s.nextDir;
      const head = { ...s.snake[0] };
      if (s.dir === "RIGHT") head.x++;
      if (s.dir === "LEFT") head.x--;
      if (s.dir === "UP") head.y--;
      if (s.dir === "DOWN") head.y++;

      // Wall collision
      if (head.x < 0 || head.x >= COLS || head.y < 0 || head.y >= ROWS) {
        s.alive = false; setDead(true); draw(); return;
      }
      // Self collision
      if (s.snake.some(seg => seg.x === head.x && seg.y === head.y)) {
        s.alive = false; setDead(true); draw(); return;
      }

      const ate = head.x === s.food.x && head.y === s.food.y;
      s.snake = [head, ...s.snake];
      if (!ate) s.snake.pop();
      else {
        s.score++;
        setScore(s.score);
        s.food = randFood(s.snake);
      }
    }
    draw();
    rafRef.current = requestAnimationFrame(tick);
  }, [draw]);

  function changeDir(nd: Dir) {
    const s = stateRef.current;
    const opp: Record<Dir, Dir> = { UP: "DOWN", DOWN: "UP", LEFT: "RIGHT", RIGHT: "LEFT" };
    if (nd !== opp[s.dir]) s.nextDir = nd;
    if (!s.started) { s.started = true; setStarted(true); }
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const map: Record<string, Dir> = { ArrowUp: "UP", ArrowDown: "DOWN", ArrowLeft: "LEFT", ArrowRight: "RIGHT", w: "UP", s: "DOWN", a: "LEFT", d: "RIGHT" };
      const nd = map[e.key];
      if (!nd) return;
      e.preventDefault();
      changeDir(nd);
    };
    window.addEventListener("keydown", onKey);
    rafRef.current = requestAnimationFrame(tick);

    // Pointer events on canvas for swipe
    const canvas = canvasRef.current;
    if (!canvas) return () => { window.removeEventListener("keydown", onKey); cancelAnimationFrame(rafRef.current); };

    const onPointerDown = (e: PointerEvent) => {
      if (e.pointerType === "touch" && activePenRef.current !== null) return;
      if (e.pointerType === "pen") activePenRef.current = e.pointerId;
      touchStart.current = { x: e.clientX, y: e.clientY };
    };
    const onPointerUp = (e: PointerEvent) => {
      if (e.pointerType === "pen") activePenRef.current = null;
      if (!touchStart.current) return;
      const dx = e.clientX - touchStart.current.x;
      const dy = e.clientY - touchStart.current.y;
      touchStart.current = null;
      if (Math.abs(dx) < 10 && Math.abs(dy) < 10) return; // tap, not swipe
      const nd: Dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "RIGHT" : "LEFT") : (dy > 0 ? "DOWN" : "UP");
      changeDir(nd);
    };

    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointerup", onPointerUp);
    canvas.addEventListener("pointercancel", onPointerUp);

    return () => {
      window.removeEventListener("keydown", onKey);
      cancelAnimationFrame(rafRef.current);
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("pointercancel", onPointerUp);
    };
  }, [tick]);

  const restart = () => {
    stateRef.current = {
      snake: [{ x: 10, y: 8 }], dir: "RIGHT", nextDir: "RIGHT",
      food: { x: 15, y: 8 }, score: 0, alive: true, started: false,
    };
    setScore(0); setDead(false); setStarted(false);
  };

  // D-pad button style
  const dpadBtnStyle: React.CSSProperties = {
    width: 60, height: 60,
    display: "flex", alignItems: "center", justifyContent: "center",
    borderRadius: 14,
    background: "rgba(139,92,246,0.18)",
    border: "1px solid rgba(139,92,246,0.35)",
    color: "white",
    fontSize: 24,
    cursor: "pointer",
    userSelect: "none",
    WebkitUserSelect: "none",
    touchAction: "none",
  };

  const onDpad = (dir: Dir) => (e: React.PointerEvent) => {
    e.preventDefault();
    changeDir(dir);
  };

  return (
    <div className="flex flex-col items-center justify-center h-full gap-4 select-none" style={{ background: "#07071a" }}>
      <div className="flex items-center justify-between w-full px-4 py-2">
        <div className="text-sm font-bold text-violet-400">🐍 Snake XL</div>
        <div className="text-sm font-bold text-white">Score: <span className="text-yellow-400">{score}</span></div>
      </div>
      <div
        className="relative"
        style={{ touchAction: "none", userSelect: "none", WebkitUserSelect: "none" as any }}
      >
        <canvas
          ref={canvasRef}
          width={W}
          height={H}
          style={{
            borderRadius: 12,
            border: "1px solid rgba(139,92,246,0.3)",
            display: "block",
            maxWidth: "100%",
            touchAction: "none",
            userSelect: "none",
            WebkitUserSelect: "none",
          }}
        />
        {!started && !dead && (
          <div className="absolute inset-0 flex flex-col items-center justify-center rounded-xl" style={{ background: "rgba(7,7,26,0.85)" }}>
            <div className="text-4xl mb-2">🐍</div>
            <div className="text-white font-bold text-lg mb-1">Snake XL</div>
            <div className="text-white/50 text-sm">Arrow keys / WASD / swipe / D-pad</div>
            <button
              onClick={() => { stateRef.current.started = true; setStarted(true); }}
              className="mt-4 px-5 py-2 rounded-xl bg-violet-600 text-white font-bold text-sm hover:bg-violet-500 transition-colors"
              style={{ minHeight: 44 }}
            >Start Game</button>
          </div>
        )}
        {dead && (
          <div className="absolute inset-0 flex flex-col items-center justify-center rounded-xl" style={{ background: "rgba(7,7,26,0.9)" }}>
            <div className="text-4xl mb-2">💀</div>
            <div className="text-white font-bold text-lg mb-1">Game Over!</div>
            <div className="text-yellow-400 font-bold text-2xl mb-3">Score: {score}</div>
            <button onClick={restart} className="px-5 py-2 rounded-xl bg-violet-600 text-white font-bold text-sm hover:bg-violet-500 transition-colors" style={{ minHeight: 44 }}>Play Again</button>
          </div>
        )}
      </div>

      {/* D-pad for touch play */}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, marginTop: 4 }}>
        <button style={dpadBtnStyle} onPointerDown={onDpad("UP")} aria-label="Up">▲</button>
        <div style={{ display: "flex", gap: 4 }}>
          <button style={dpadBtnStyle} onPointerDown={onDpad("LEFT")} aria-label="Left">◀</button>
          <div style={{ width: 60, height: 60 }} />
          <button style={dpadBtnStyle} onPointerDown={onDpad("RIGHT")} aria-label="Right">▶</button>
        </div>
        <button style={dpadBtnStyle} onPointerDown={onDpad("DOWN")} aria-label="Down">▼</button>
      </div>

      <div className="text-xs text-white/30 text-center">Arrow keys / WASD / Swipe / D-pad to steer</div>
    </div>
  );
}
