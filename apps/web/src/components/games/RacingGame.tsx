import React, { useEffect, useRef, useState, useCallback } from "react";

// Top-down racer — steer left/right, avoid traffic, collect nitro boosts
const W = 360, H = 520;
const ROAD_LEFT = 60, ROAD_RIGHT = 300, ROAD_W = ROAD_RIGHT - ROAD_LEFT;
const LANE_W = ROAD_W / 3;
const CAR_W = 30, CAR_H = 50;
const G_COLORS = ["#ef4444","#22c55e","#38bdf8","#f59e0b","#a855f7","#f472b6"];

type TrafficCar = { x: number; y: number; spd: number; color: string; w: number; h: number };
type Boost = { x: number; y: number; active: boolean };
type State = {
  carX: number; spd: number; dist: number; score: number; over: boolean;
  traffic: TrafficCar[]; boosts: Boost[]; boosting: number;
  lastTraffic: number; lastBoost: number; left: boolean; right: boolean;
};

function initState(): State {
  return { carX: W / 2, spd: 3, dist: 0, score: 0, over: false, traffic: [], boosts: [], boosting: 0, lastTraffic: 0, lastBoost: 0, left: false, right: false };
}

function drawCar(ctx: CanvasRenderingContext2D, x: number, y: number, color: string, w: number, h: number) {
  // Body
  ctx.fillStyle = color; ctx.beginPath(); ctx.roundRect(x - w/2, y - h/2, w, h, 8); ctx.fill();
  // Windshield
  ctx.fillStyle = "#bae6fd"; ctx.fillRect(x - w/2 + 4, y - h/2 + 6, w - 8, h * 0.3);
  // Rear window
  ctx.fillStyle = "#bae6fd"; ctx.fillRect(x - w/2 + 4, y + h/2 - h * 0.3 - 2, w - 8, h * 0.28);
  // Wheels
  ctx.fillStyle = "#1e293b";
  [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sy]) => {
    ctx.beginPath(); ctx.roundRect(x + sx * (w/2 - 2) - 5, y + sy * (h/2 - 10) - 8, 10, 16, 3); ctx.fill();
  });
}

export default function RacingGame() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const st = useRef<State>(initState());
  const raf = useRef(0);
  const [ui, setUi] = useState({ score: 0, over: false, hi: Number(localStorage.getItem("race_hi") || 0) });
  const lineOffset = useRef(0);
  const keys = useRef({ left: false, right: false });

  const draw = useCallback(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    const s = st.current;

    // Sky / offroad
    ctx.fillStyle = "#86efac"; ctx.fillRect(0, 0, W, H);
    // Road
    ctx.fillStyle = "#475569"; ctx.fillRect(ROAD_LEFT, 0, ROAD_W, H);
    // Curbs
    ctx.fillStyle = "#ef4444";
    for (let y = lineOffset.current % 60; y < H; y += 60) {
      ctx.fillRect(ROAD_LEFT, y, 10, 30);
      ctx.fillRect(ROAD_RIGHT - 10, y, 10, 30);
    }
    ctx.fillStyle = "#fff";
    for (let y = lineOffset.current % 60 + 30; y < H; y += 60) {
      ctx.fillRect(ROAD_LEFT, y, 10, 30);
      ctx.fillRect(ROAD_RIGHT - 10, y, 10, 30);
    }
    // Lane marks
    ctx.strokeStyle = "#ffffff60"; ctx.lineWidth = 3; ctx.setLineDash([25, 20]);
    ctx.lineDashOffset = -lineOffset.current;
    [ROAD_LEFT + LANE_W, ROAD_LEFT + LANE_W * 2].forEach(lx => {
      ctx.beginPath(); ctx.moveTo(lx, 0); ctx.lineTo(lx, H); ctx.stroke();
    });
    ctx.setLineDash([]); ctx.lineDashOffset = 0;

    // Boosts
    s.boosts.forEach(b => {
      if (!b.active) return;
      ctx.font = "22px serif"; ctx.textAlign = "center"; ctx.fillText("⚡", b.x, b.y + 8); ctx.textAlign = "left";
    });

    // Traffic
    s.traffic.forEach(t => drawCar(ctx, t.x, t.y, t.color, t.w, t.h));

    // Player car
    const glow = s.boosting > 0;
    if (glow) { ctx.shadowColor = "#38bdf8"; ctx.shadowBlur = 20; }
    drawCar(ctx, s.carX, H - 80, glow ? "#38bdf8" : "#f9a8d4", CAR_W, CAR_H);
    ctx.shadowBlur = 0;

    // Trees (parallax)
    [30, 340].forEach(bx => {
      for (let ty = (lineOffset.current * 0.3) % 100; ty < H; ty += 100) {
        ctx.font = "28px serif"; ctx.fillText("🌲", bx - 14, ty + 10);
      }
    });

    // HUD
    ctx.fillStyle = "#0000007a"; ctx.fillRect(0, 0, W, 44);
    ctx.fillStyle = "#fff"; ctx.font = "bold 15px system-ui";
    ctx.fillText(`⭐ ${s.score}`, 14, 26);
    const hi = Math.max(s.score, ui.hi);
    ctx.fillStyle = "#ffffff80"; ctx.font = "12px system-ui";
    ctx.fillText(`Best: ${hi}`, 14, 38);
    const spd = Math.round(s.spd * 30);
    ctx.fillStyle = "#fff"; ctx.font = "bold 15px system-ui"; ctx.textAlign = "right";
    ctx.fillText(`${spd} km/h`, W - 14, 26); ctx.textAlign = "left";

    if (s.boosting > 0) {
      ctx.fillStyle = "#38bdf8"; ctx.font = "bold 13px system-ui"; ctx.textAlign = "center";
      ctx.fillText("⚡ BOOST!", W/2, 38); ctx.textAlign = "left";
    }

    if (!s.over && s.dist === 0) {
      ctx.fillStyle = "#0000008a"; ctx.beginPath(); ctx.roundRect(W/2-90, H/2-30, 180, 60, 14); ctx.fill();
      ctx.fillStyle = "#fff"; ctx.font = "bold 14px system-ui"; ctx.textAlign = "center";
      ctx.fillText("Tap / Arrow keys to drive!", W/2, H/2+6); ctx.textAlign = "left";
    }
    if (s.over) {
      ctx.fillStyle = "#0000009a"; ctx.fillRect(0, H/2-50, W, 100);
      ctx.fillStyle = "#ef4444"; ctx.font = "bold 22px system-ui"; ctx.textAlign = "center";
      ctx.fillText("CRASH! 💥", W/2, H/2);
      ctx.fillStyle = "#fff"; ctx.font = "14px system-ui";
      ctx.fillText(`Score: ${s.score} — Tap to retry`, W/2, H/2+28); ctx.textAlign = "left";
    }
  }, [ui.hi]);

  const step = useCallback(() => {
    const s = st.current;
    if (!s.over) {
      const steerSpd = 3.5;
      if (keys.current.left || s.left) s.carX = Math.max(ROAD_LEFT + CAR_W/2 + 5, s.carX - steerSpd);
      if (keys.current.right || s.right) s.carX = Math.min(ROAD_RIGHT - CAR_W/2 - 5, s.carX + steerSpd);

      s.dist += s.spd;
      s.spd = Math.min(8, 3 + s.dist / 3000);
      s.score = Math.floor(s.dist / 10);
      lineOffset.current += s.spd;

      // Spawn traffic
      if (s.dist - s.lastTraffic > 300 + Math.random() * 400) {
        s.lastTraffic = s.dist;
        const lane = Math.floor(Math.random() * 3);
        const lx = ROAD_LEFT + LANE_W * lane + LANE_W / 2;
        const spd = s.spd * (0.2 + Math.random() * 0.5);
        s.traffic.push({ x: lx, y: -40, spd, color: G_COLORS[Math.floor(Math.random() * G_COLORS.length)], w: 28, h: 48 });
      }
      // Spawn boost
      if (s.dist - s.lastBoost > 600 + Math.random() * 600) {
        s.lastBoost = s.dist;
        const lx = ROAD_LEFT + LANE_W * Math.floor(Math.random() * 3) + LANE_W / 2;
        s.boosts.push({ x: lx, y: -20, active: true });
      }

      // Move traffic
      s.traffic = s.traffic.filter(t => {
        t.y += s.spd - t.spd;
        if (t.y > H + 60) return false;
        // Collision
        if (Math.abs(t.x - s.carX) < (CAR_W + t.w) / 2 - 4 && Math.abs(t.y - (H - 80)) < (CAR_H + t.h) / 2 - 6) {
          s.over = true;
          const hi = Math.max(s.score, ui.hi);
          localStorage.setItem("race_hi", String(hi));
          setUi(u => ({ ...u, score: s.score, over: true, hi }));
        }
        return true;
      });

      // Move boosts
      s.boosts = s.boosts.filter(b => {
        if (!b.active) return false;
        b.y += s.spd;
        if (b.y > H + 30) return false;
        if (Math.abs(b.x - s.carX) < 22 && Math.abs(b.y - (H - 80)) < 36) {
          b.active = false; s.boosting = 120;
          s.spd = Math.min(12, s.spd + 2);
        }
        return true;
      });

      if (s.boosting > 0) { s.boosting--; if (s.boosting === 0 && s.spd > 8) s.spd = 8; }
    }
    draw();
    raf.current = requestAnimationFrame(step);
  }, [draw, ui.hi]);

  useEffect(() => { raf.current = requestAnimationFrame(step); return () => cancelAnimationFrame(raf.current); }, [step]);

  useEffect(() => {
    const kd = (e: KeyboardEvent) => {
      if (["ArrowLeft","a"].includes(e.key)) keys.current.left = true;
      if (["ArrowRight","d"].includes(e.key)) keys.current.right = true;
    };
    const ku = (e: KeyboardEvent) => {
      if (["ArrowLeft","a"].includes(e.key)) keys.current.left = false;
      if (["ArrowRight","d"].includes(e.key)) keys.current.right = false;
    };
    window.addEventListener("keydown", kd); window.addEventListener("keyup", ku);
    return () => { window.removeEventListener("keydown", kd); window.removeEventListener("keyup", ku); };
  }, []);

  const onCanvasClick = () => {
    if (st.current.over) { st.current = initState(); setUi(u => ({ ...u, score: 0, over: false })); }
  };

  const touchX = useRef<number | null>(null);
  const onTouchStart = (e: React.TouchEvent) => { touchX.current = e.touches[0].clientX; };
  const onTouchMove = (e: React.TouchEvent) => {
    if (touchX.current === null) return;
    const dx = e.touches[0].clientX - touchX.current;
    st.current.left = dx < -10; st.current.right = dx > 10;
  };
  const onTouchEnd = () => { touchX.current = null; st.current.left = false; st.current.right = false; };

  return (
    <div className="flex flex-col items-center gap-3 p-3" style={{ background: "#1a2744" }}>
      <canvas ref={canvasRef} width={W} height={H} className="rounded-2xl max-w-full"
        style={{ touchAction: "none" }} onClick={onCanvasClick}
        onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}
      />
      <div className="flex gap-3">
        <button onTouchStart={() => { st.current.left = true; }} onTouchEnd={() => { st.current.left = false; }} onMouseDown={() => { st.current.left = true; }} onMouseUp={() => { st.current.left = false; }}
          className="bg-white/10 border border-white/20 text-white px-8 py-3 rounded-xl text-xl font-bold select-none" style={{ touchAction: "manipulation" }}>◀</button>
        <button onTouchStart={() => { st.current.right = true; }} onTouchEnd={() => { st.current.right = false; }} onMouseDown={() => { st.current.right = true; }} onMouseUp={() => { st.current.right = false; }}
          className="bg-white/10 border border-white/20 text-white px-8 py-3 rounded-xl text-xl font-bold select-none" style={{ touchAction: "manipulation" }}>▶</button>
      </div>
      <p className="text-white/25 text-xs">← → / A D keys · tap sides · collect ⚡ for boost</p>
    </div>
  );
}
