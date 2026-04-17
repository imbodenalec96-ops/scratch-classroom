import React, { useEffect, useRef, useState, useCallback } from "react";

// Endless lane runner — 3 lanes, obstacles scroll toward you, collect stars
const W = 360, H = 480, LANES = [90, 180, 270];
const COLORS = { sky: "#c7e8f7", ground: "#7ec87e", runner: "#f472b6", obs: "#ef4444", star: "#fbbf24", trail: "#fde68a" };

type Obs = { x: number; lane: number; w: number; h: number };
type Star = { x: number; lane: number; collected: boolean };

type State = {
  lane: number; y: number; jumping: boolean; jumpV: number;
  obstacles: Obs[]; stars: Star[];
  score: number; hi: number;
  speed: number; dist: number;
  over: boolean; started: boolean;
  lastObs: number; lastStar: number;
};

function initState(): State {
  return {
    lane: 1, y: 0, jumping: false, jumpV: 0,
    obstacles: [], stars: [], score: 0,
    hi: Number(localStorage.getItem("runner_hi") || 0),
    speed: 4, dist: 0, over: false, started: false,
    lastObs: 0, lastStar: 0,
  };
}

export default function EndlessRunner() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const st = useRef<State>(initState());
  const raf = useRef(0);
  const [ui, setUi] = useState({ score: 0, hi: 0, over: false, started: false });
  const lastTs = useRef(0);

  const jump = useCallback(() => {
    const s = st.current;
    if (!s.started) { s.started = true; setUi(u => ({ ...u, started: true })); }
    if (!s.jumping && !s.over) { s.jumping = true; s.jumpV = -14; }
  }, []);

  const changeLane = useCallback((dir: number) => {
    const s = st.current;
    if (s.over || !s.started) return;
    s.lane = Math.max(0, Math.min(2, s.lane + dir));
  }, []);

  const restart = useCallback(() => {
    st.current = { ...initState(), hi: st.current.hi, started: true };
    setUi({ score: 0, hi: st.current.hi, over: false, started: true });
  }, []);

  const draw = useCallback(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    const s = st.current;

    // Sky gradient
    const sky = ctx.createLinearGradient(0, 0, 0, H * 0.7);
    sky.addColorStop(0, "#bfdbfe"); sky.addColorStop(1, "#e0f2fe");
    ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H);

    // Clouds (parallax, simple)
    ctx.fillStyle = "#ffffffbb";
    [[60,60,70,30],[200,40,90,25],[300,80,50,20]].forEach(([cx,cy,cw,ch]) => {
      ctx.beginPath(); ctx.ellipse(cx, cy, cw, ch, 0, 0, Math.PI*2); ctx.fill();
    });

    // Ground
    ctx.fillStyle = "#86efac"; ctx.fillRect(0, H * 0.72, W, H * 0.28);
    ctx.fillStyle = "#4ade80"; ctx.fillRect(0, H * 0.72, W, 6);

    // Lane guides (dashed)
    ctx.setLineDash([20, 15]); ctx.strokeStyle = "#ffffff50"; ctx.lineWidth = 2;
    LANES.forEach(lx => {
      ctx.beginPath(); ctx.moveTo(lx, H * 0.72); ctx.lineTo(lx, H); ctx.stroke();
    });
    ctx.setLineDash([]);

    const GROUND_Y = H * 0.72 - 36;

    // Stars
    s.stars.forEach(star => {
      if (star.collected) return;
      const sx = LANES[star.lane], sy = GROUND_Y - 20 + (star.x < W ? 0 : 0);
      const rx = star.x;
      ctx.save();
      ctx.translate(rx, sy - 10);
      ctx.fillStyle = COLORS.star;
      ctx.font = "22px serif"; ctx.fillText("⭐", -11, 8);
      ctx.restore();
    });

    // Obstacles
    s.obstacles.forEach(obs => {
      const ox = LANES[obs.lane];
      ctx.fillStyle = "#ef4444";
      ctx.beginPath(); ctx.roundRect(ox - obs.w/2, GROUND_Y - obs.h + 4, obs.w, obs.h, 6); ctx.fill();
      ctx.fillStyle = "#dc2626";
      ctx.fillRect(ox - obs.w/2, GROUND_Y - obs.h + 4, obs.w, 5);
      // Eyes
      ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(ox - 6, GROUND_Y - obs.h + 16, 5, 0, Math.PI*2); ctx.fill();
      ctx.beginPath(); ctx.arc(ox + 6, GROUND_Y - obs.h + 16, 5, 0, Math.PI*2); ctx.fill();
      ctx.fillStyle = "#111"; ctx.beginPath(); ctx.arc(ox - 5, GROUND_Y - obs.h + 16, 2.5, 0, Math.PI*2); ctx.fill();
      ctx.beginPath(); ctx.arc(ox + 7, GROUND_Y - obs.h + 16, 2.5, 0, Math.PI*2); ctx.fill();
    });

    // Runner
    const rx = LANES[s.lane], ry = GROUND_Y + s.y;
    // Shadow
    ctx.fillStyle = "#00000020"; ctx.beginPath(); ctx.ellipse(rx, GROUND_Y + 5, 18, 5, 0, 0, Math.PI*2); ctx.fill();
    // Body
    ctx.fillStyle = COLORS.runner;
    ctx.beginPath(); ctx.roundRect(rx - 14, ry - 34, 28, 34, 8); ctx.fill();
    // Shirt stripe
    ctx.fillStyle = "#fbcfe8"; ctx.fillRect(rx - 10, ry - 26, 20, 8);
    // Head
    ctx.fillStyle = "#fed7aa";
    ctx.beginPath(); ctx.arc(rx, ry - 44, 16, 0, Math.PI*2); ctx.fill();
    // Eyes
    ctx.fillStyle = "#1e293b"; ctx.beginPath(); ctx.arc(rx - 6, ry - 46, 3, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc(rx + 6, ry - 46, 3, 0, Math.PI*2); ctx.fill();
    // Smile
    ctx.strokeStyle = "#1e293b"; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(rx, ry - 42, 5, 0.2, Math.PI - 0.2); ctx.stroke();
    // Legs (running bob)
    const bob = s.jumping ? 0 : Math.sin(s.dist * 0.3) * 6;
    ctx.fillStyle = "#7c3aed";
    ctx.beginPath(); ctx.roundRect(rx - 12, ry - 2, 10, 14 + bob, 4); ctx.fill();
    ctx.beginPath(); ctx.roundRect(rx + 2, ry - 2, 10, 14 - bob, 4); ctx.fill();

    // HUD
    ctx.fillStyle = "#1e293b"; ctx.font = "bold 16px system-ui";
    ctx.fillText(`⭐ ${s.score}`, 14, 28);
    ctx.fillStyle = "#64748b"; ctx.font = "12px system-ui";
    ctx.fillText(`Best: ${s.hi}`, 14, 46);
    const spd = Math.min(10, Math.floor(s.speed)).toString();
    ctx.fillStyle = "#1e293b"; ctx.font = "12px system-ui";
    ctx.fillText(`Speed ×${spd}`, W - 80, 28);

    if (!s.started) {
      ctx.fillStyle = "#0000007a";
      ctx.beginPath(); ctx.roundRect(W/2 - 80, H/2 - 30, 160, 60, 14); ctx.fill();
      ctx.fillStyle = "#fff"; ctx.font = "bold 16px system-ui"; ctx.textAlign = "center";
      ctx.fillText("Tap / Space to start!", W/2, H/2 + 6);
      ctx.textAlign = "left";
    }
  }, []);

  const step = useCallback((_ts: number) => {
    const s = st.current;
    if (s.started && !s.over) {
      s.dist += s.speed;
      s.speed = Math.min(10, 4 + s.dist / 1500);

      // Jump physics
      if (s.jumping) {
        s.jumpV += 0.8;
        s.y += s.jumpV;
        if (s.y >= 0) { s.y = 0; s.jumping = false; s.jumpV = 0; }
      }

      // Spawn obstacles
      if (s.dist - s.lastObs > 200 + Math.random() * 300) {
        s.lastObs = s.dist;
        const lane = Math.floor(Math.random() * 3);
        s.obstacles.push({ x: W + 20, lane, w: 30 + Math.random() * 10, h: 40 + Math.random() * 20 });
      }
      // Spawn stars
      if (s.dist - s.lastStar > 120 + Math.random() * 200) {
        s.lastStar = s.dist;
        s.stars.push({ x: W + 20, lane: Math.floor(Math.random() * 3), collected: false });
      }

      // Move obstacles
      const GROUND_Y = H * 0.72 - 36;
      s.obstacles = s.obstacles.filter(o => {
        o.x -= s.speed;
        if (o.x < -40) return false;
        // Collision
        if (!s.jumping || s.y > -20) {
          if (Math.abs(o.lane - s.lane) === 0 && o.x > LANES[s.lane] - o.w/2 - 14 && o.x < LANES[s.lane] + o.w/2 + 14) {
            s.over = true;
            if (s.score > s.hi) { s.hi = s.score; localStorage.setItem("runner_hi", String(s.hi)); }
            setUi({ score: s.score, hi: s.hi, over: true, started: true });
          }
        }
        return true;
      });

      // Move stars
      s.stars = s.stars.filter(star => {
        star.x -= s.speed;
        if (!star.collected && star.lane === s.lane && star.x > LANES[s.lane] - 20 && star.x < LANES[s.lane] + 20) {
          star.collected = true; s.score++;
          setUi(u => ({ ...u, score: s.score }));
        }
        return star.x > -30 && !star.collected;
      });
    }
    draw();
    raf.current = requestAnimationFrame(step);
  }, [draw]);

  useEffect(() => {
    raf.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf.current);
  }, [step]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === " " || e.key === "ArrowUp" || e.key === "w") { e.preventDefault(); jump(); }
      else if (e.key === "ArrowLeft" || e.key === "a") changeLane(-1);
      else if (e.key === "ArrowRight" || e.key === "d") changeLane(1);
      else if ((e.key === "r" || e.key === "R") && st.current.over) restart();
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [jump, changeLane, restart]);

  const touchX = useRef<number | null>(null);
  const onTouchStart = (e: React.TouchEvent) => { touchX.current = e.touches[0].clientX; jump(); };
  const onTouchEnd = (e: React.TouchEvent) => {
    if (touchX.current === null) return;
    const dx = e.changedTouches[0].clientX - touchX.current;
    touchX.current = null;
    if (Math.abs(dx) > 30) changeLane(dx < 0 ? -1 : 1);
  };

  return (
    <div className="flex flex-col items-center gap-3 p-3" style={{ background: "#e0f2fe" }}>
      <canvas ref={canvasRef} width={W} height={H} className="rounded-2xl border-2 border-sky-200 max-w-full"
        style={{ touchAction: "none" }} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd} onClick={jump} />

      {ui.over && (
        <div className="flex flex-col items-center gap-2">
          <p className="text-red-500 font-bold text-lg">💥 Game Over! Score: {ui.score}</p>
          <button onClick={restart} className="bg-sky-500 text-white px-6 py-2 rounded-xl font-bold" style={{ touchAction: "manipulation" }}>Run Again!</button>
        </div>
      )}

      {/* Mobile lane buttons */}
      <div className="flex gap-4">
        <button onClick={() => changeLane(-1)} className="bg-white/80 border-2 border-sky-200 rounded-xl px-6 py-3 text-xl font-bold text-sky-700" style={{ touchAction: "manipulation" }}>◀</button>
        <button onClick={jump} className="bg-sky-400 text-white border-2 border-sky-300 rounded-xl px-8 py-3 text-xl font-bold" style={{ touchAction: "manipulation" }}>Jump!</button>
        <button onClick={() => changeLane(1)} className="bg-white/80 border-2 border-sky-200 rounded-xl px-6 py-3 text-xl font-bold text-sky-700" style={{ touchAction: "manipulation" }}>▶</button>
      </div>
      <p className="text-sky-600/50 text-xs">← → change lanes · Space / tap to jump · collect ⭐</p>
    </div>
  );
}
