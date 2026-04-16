import React, { useEffect, useRef, useState, useCallback } from "react";

const W = 400;
const H = 480;
const BUCKET_W = 60;
const BUCKET_H = 36;
const DROP_W = 28;
const DROP_H = 28;

interface Drop {
  id: number;
  x: number;
  y: number;
  color: string;
  label: string;
  speed: number;
  bad: boolean;
}

const COLORS = [
  { color: "#f43f5e", label: "Red" },
  { color: "#fb923c", label: "Orange" },
  { color: "#facc15", label: "Yellow" },
  { color: "#4ade80", label: "Green" },
  { color: "#60a5fa", label: "Blue" },
  { color: "#a78bfa", label: "Purple" },
];
const BAD = ["💣", "🔥", "☠️"];

let dropId = 0;
function makeDrop(level: number): Drop {
  const isBad = Math.random() < 0.2 + level * 0.015;
  const c = COLORS[Math.floor(Math.random() * COLORS.length)];
  return {
    id: dropId++,
    x: Math.random() * (W - DROP_W * 2) + DROP_W,
    y: -DROP_H,
    color: c.color,
    label: isBad ? BAD[Math.floor(Math.random() * BAD.length)] : c.label,
    speed: 1.5 + level * 0.3 + Math.random() * 1.5,
    bad: isBad,
  };
}

export default function ColorCatcher() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef({
    bucketX: W / 2,
    drops: [] as Drop[],
    score: 0,
    lives: 3,
    level: 1,
    frameCount: 0,
    spawnRate: 90,
    alive: true,
    started: false,
  });
  const [score, setScore] = useState(0);
  const [lives, setLives] = useState(3);
  const [dead, setDead] = useState(false);
  const [started, setStarted] = useState(false);
  const rafRef = useRef(0);
  const pointerXRef = useRef<number | null>(null);
  const keysRef = useRef<Set<string>>(new Set());

  // Apple Pencil palm rejection
  const activePenRef = useRef<number | null>(null);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    const s = stateRef.current;

    ctx.fillStyle = "#07071a";
    ctx.fillRect(0, 0, W, H);

    // Stars background
    ctx.fillStyle = "rgba(139,92,246,0.15)";
    for (let i = 0; i < 30; i++) {
      const sx = (i * 137.5 + s.frameCount * 0.1) % W;
      const sy = (i * 97.3) % H;
      ctx.beginPath(); ctx.arc(sx, sy, 1, 0, Math.PI * 2); ctx.fill();
    }

    // Drops
    for (const d of s.drops) {
      if (d.bad) {
        ctx.font = `${DROP_W}px serif`;
        ctx.textAlign = "center";
        ctx.fillText(d.label, d.x, d.y + DROP_W * 0.8);
      } else {
        ctx.shadowColor = d.color;
        ctx.shadowBlur = 10;
        ctx.fillStyle = d.color;
        ctx.beginPath();
        ctx.arc(d.x, d.y + DROP_W / 2, DROP_W / 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.font = "bold 9px system-ui";
        ctx.fillStyle = "#07071a";
        ctx.textAlign = "center";
        ctx.fillText(d.label, d.x, d.y + DROP_W / 2 + 3);
      }
    }

    // Bucket
    const bx = s.bucketX - BUCKET_W / 2;
    const by = H - BUCKET_H - 10;
    const bucketGrad = ctx.createLinearGradient(bx, by, bx + BUCKET_W, by + BUCKET_H);
    bucketGrad.addColorStop(0, "#a78bfa");
    bucketGrad.addColorStop(1, "#6366f1");
    ctx.shadowColor = "#a78bfa";
    ctx.shadowBlur = 15;
    ctx.fillStyle = bucketGrad;
    ctx.beginPath();
    ctx.roundRect(bx, by, BUCKET_W, BUCKET_H, 8);
    ctx.fill();
    ctx.shadowBlur = 0;

    // Lives display
    ctx.font = "16px serif";
    ctx.textAlign = "left";
    for (let i = 0; i < s.lives; i++) ctx.fillText("❤️", 8 + i * 22, 24);

    // Score
    ctx.font = "bold 14px system-ui";
    ctx.fillStyle = "rgba(255,255,255,0.7)";
    ctx.textAlign = "right";
    ctx.fillText(`Lv ${s.level}`, W - 8, 24);
  }, []);

  const update = useCallback(() => {
    const s = stateRef.current;
    if (!s.alive || !s.started) return;
    s.frameCount++;

    // Keyboard bucket movement
    const keys = keysRef.current;
    if (keys.has("ArrowLeft") || keys.has("a")) s.bucketX = Math.max(BUCKET_W / 2, s.bucketX - 6);
    if (keys.has("ArrowRight") || keys.has("d")) s.bucketX = Math.min(W - BUCKET_W / 2, s.bucketX + 6);
    // Pointer (mouse / touch / pencil)
    if (pointerXRef.current !== null) s.bucketX = Math.max(BUCKET_W / 2, Math.min(W - BUCKET_W / 2, pointerXRef.current));

    // Spawn
    if (s.frameCount % s.spawnRate === 0) {
      s.drops.push(makeDrop(s.level));
      if (s.frameCount % (s.spawnRate * 8) === 0 && s.spawnRate > 40) { s.spawnRate -= 3; s.level++; }
    }

    // Update drops
    const toRemove: number[] = [];
    const by = H - BUCKET_H - 10;
    for (let i = 0; i < s.drops.length; i++) {
      const d = s.drops[i];
      d.y += d.speed;

      // Catch check
      if (d.y + DROP_W >= by && d.y <= by + BUCKET_H + 5 &&
          d.x > s.bucketX - BUCKET_W / 2 - DROP_W / 2 &&
          d.x < s.bucketX + BUCKET_W / 2 + DROP_W / 2) {
        toRemove.push(i);
        if (d.bad) {
          s.lives--;
          setLives(s.lives);
          if (s.lives <= 0) { s.alive = false; setDead(true); }
        } else {
          s.score += 10 * s.level;
          setScore(s.score);
        }
        continue;
      }

      // Miss
      if (d.y > H + 10) {
        toRemove.push(i);
        if (!d.bad) {
          s.lives--;
          setLives(s.lives);
          if (s.lives <= 0) { s.alive = false; setDead(true); }
        }
      }
    }
    s.drops = s.drops.filter((_, i) => !toRemove.includes(i));
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
      if (e.pointerType === "touch" && activePenRef.current !== null) return;
      if (e.pointerType === "pen") activePenRef.current = e.pointerId;
      canvas.setPointerCapture(e.pointerId);
      const rect = canvas.getBoundingClientRect();
      const scaleX = W / rect.width;
      pointerXRef.current = (e.clientX - rect.left) * scaleX;
      if (!stateRef.current.started) { stateRef.current.started = true; setStarted(true); }
    };
    const onPointerMove = (e: PointerEvent) => {
      if (!canvas) return;
      if (e.pointerType === "touch" && activePenRef.current !== null) return;
      if (pointerXRef.current !== null) {
        const rect = canvas.getBoundingClientRect();
        const scaleX = W / rect.width;
        pointerXRef.current = (e.clientX - rect.left) * scaleX;
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
    stateRef.current = { bucketX: W / 2, drops: [], score: 0, lives: 3, level: 1, frameCount: 0, spawnRate: 90, alive: true, started: false };
    setScore(0); setLives(3); setDead(false); setStarted(false);
  };

  return (
    <div className="flex flex-col items-center gap-3 h-full" style={{ background: "#07071a" }}>
      <div className="flex items-center justify-between w-full px-4 py-2">
        <span className="text-sm font-bold text-violet-400">🎨 Color Catcher</span>
        <span className="text-sm font-bold text-white">Score: <span className="text-yellow-400">{score}</span></span>
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
        {!started && !dead && (
          <div className="absolute inset-0 flex flex-col items-center justify-center rounded-xl" style={{ background: "rgba(7,7,26,0.88)" }}>
            <div className="text-4xl mb-2">🎨</div>
            <div className="text-white font-bold text-xl mb-1">Color Catcher</div>
            <div className="text-white/50 text-sm mb-1">Move the bucket to catch falling colors</div>
            <div className="text-white/30 text-xs mb-1">Drag finger / Mouse / Arrow keys</div>
            <div className="text-red-400/70 text-xs mb-4">Avoid 💣🔥☠️ — they cost a life!</div>
            <button
              onClick={() => { stateRef.current.started = true; setStarted(true); }}
              className="px-5 py-2 rounded-xl bg-violet-600 text-white font-bold text-sm hover:bg-violet-500 transition-colors"
              style={{ minHeight: 44 }}
            >Start!</button>
          </div>
        )}
        {dead && (
          <div className="absolute inset-0 flex flex-col items-center justify-center rounded-xl" style={{ background: "rgba(7,7,26,0.92)" }}>
            <div className="text-4xl mb-2">💥</div>
            <div className="text-white font-bold text-xl mb-1">Game Over!</div>
            <div className="text-yellow-400 font-bold text-2xl mb-3">Score: {score}</div>
            <button onClick={restart} className="px-5 py-2 rounded-xl bg-violet-600 text-white font-bold text-sm hover:bg-violet-500 transition-colors" style={{ minHeight: 44 }}>Try Again</button>
          </div>
        )}
      </div>
      <div className="text-xs text-white/30">Drag or ← → to catch • Level up each 8 spawns</div>
    </div>
  );
}
