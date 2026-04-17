import React, { useEffect, useRef, useState, useCallback } from "react";

const W = 360, H = 520, COLS = 9, BUBBLE_R = 18, COLORS = ["#f87171","#fb923c","#facc15","#4ade80","#38bdf8","#a78bfa","#f472b6"];

type Bubble = { x: number; y: number; color: string; alive: boolean };
type Shot = { x: number; y: number; vx: number; vy: number; color: string; active: boolean };

function hexGrid(rows: number): Bubble[] {
  const bubbles: Bubble[] = [];
  for (let r = 0; r < rows; r++) {
    const offset = r % 2 === 0 ? 0 : BUBBLE_R;
    for (let c = 0; c < COLS; c++) {
      bubbles.push({
        x: offset + BUBBLE_R + c * BUBBLE_R * 2,
        y: BUBBLE_R * 1.2 + r * BUBBLE_R * 1.8,
        color: COLORS[Math.floor(Math.random() * 5)],
        alive: true,
      });
    }
  }
  return bubbles;
}

function dist(a: { x: number; y: number }, b: { x: number; y: number }) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function flood(bubbles: Bubble[], start: number, targetColor: string): number[] {
  const visited = new Set<number>();
  const queue = [start];
  while (queue.length) {
    const idx = queue.shift()!;
    if (visited.has(idx)) continue;
    const b = bubbles[idx];
    if (!b.alive || b.color !== targetColor) continue;
    visited.add(idx);
    bubbles.forEach((ob, oi) => {
      if (!visited.has(oi) && ob.alive && ob.color === targetColor && dist(b, ob) < BUBBLE_R * 2.5) queue.push(oi);
    });
  }
  return [...visited];
}

type State = { bubbles: Bubble[]; shot: Shot | null; angle: number; nextColor: string; score: number; over: boolean; win: boolean };

function initState(): State {
  return {
    bubbles: hexGrid(6),
    shot: null, angle: -Math.PI / 2,
    nextColor: COLORS[Math.floor(Math.random() * COLORS.length)],
    score: 0, over: false, win: false,
  };
}

export default function BubbleShooter() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const st = useRef<State>(initState());
  const raf = useRef(0);
  const [ui, setUi] = useState({ score: 0, over: false, win: false });

  const shoot = useCallback((angle: number) => {
    const s = st.current;
    if (s.shot?.active || s.over) return;
    const color = s.nextColor;
    s.nextColor = COLORS[Math.floor(Math.random() * COLORS.length)];
    s.shot = { x: W / 2, y: H - 40, vx: Math.cos(angle) * 10, vy: Math.sin(angle) * 10, color, active: true };
  }, []);

  const draw = useCallback(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    const s = st.current;

    // Background
    const bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, "#1e1b4b"); bg.addColorStop(1, "#312e81");
    ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);

    // Bubbles
    s.bubbles.forEach(b => {
      if (!b.alive) return;
      ctx.beginPath(); ctx.arc(b.x, b.y, BUBBLE_R - 1, 0, Math.PI * 2);
      ctx.fillStyle = b.color; ctx.fill();
      ctx.strokeStyle = "#ffffff30"; ctx.lineWidth = 2; ctx.stroke();
      // Shine
      ctx.beginPath(); ctx.arc(b.x - 5, b.y - 5, BUBBLE_R * 0.35, 0, Math.PI * 2);
      ctx.fillStyle = "#ffffff50"; ctx.fill();
    });

    // Danger line
    ctx.setLineDash([8, 6]); ctx.strokeStyle = "#ef444450"; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(0, H * 0.78); ctx.lineTo(W, H * 0.78); ctx.stroke();
    ctx.setLineDash([]);

    // Shooter
    const ax = W / 2, ay = H - 40;
    // Aim line
    ctx.beginPath(); ctx.setLineDash([6, 8]);
    ctx.strokeStyle = s.nextColor + "90"; ctx.lineWidth = 1.5;
    let lx = ax, ly = ay;
    for (let i = 0; i < 5; i++) {
      const nx = lx + Math.cos(s.angle) * 40, ny = ly + Math.sin(s.angle) * 40;
      if (ny < 0) break;
      ctx.moveTo(lx, ly); ctx.lineTo(nx, ny);
      lx = nx; ly = ny;
    }
    ctx.stroke(); ctx.setLineDash([]);

    // Shooter bubble
    ctx.beginPath(); ctx.arc(ax, ay, BUBBLE_R, 0, Math.PI * 2);
    ctx.fillStyle = s.nextColor; ctx.fill();
    ctx.strokeStyle = "#ffffff50"; ctx.lineWidth = 2; ctx.stroke();
    ctx.beginPath(); ctx.arc(ax - 6, ay - 6, BUBBLE_R * 0.35, 0, Math.PI * 2);
    ctx.fillStyle = "#ffffff60"; ctx.fill();

    // Flying shot
    if (s.shot?.active) {
      ctx.beginPath(); ctx.arc(s.shot.x, s.shot.y, BUBBLE_R - 1, 0, Math.PI * 2);
      ctx.fillStyle = s.shot.color; ctx.fill();
      ctx.strokeStyle = "#ffffff40"; ctx.lineWidth = 2; ctx.stroke();
    }

    // Score
    ctx.fillStyle = "#fff"; ctx.font = "bold 16px system-ui";
    ctx.fillText(`⭐ ${s.score}`, 12, 28);

    if (s.over || s.win) {
      ctx.fillStyle = "#0000008a"; ctx.fillRect(0, H/2 - 50, W, 100);
      ctx.fillStyle = "#fff"; ctx.font = "bold 24px system-ui"; ctx.textAlign = "center";
      ctx.fillText(s.win ? "🎉 You cleared it!" : "💥 Too low!", W/2, H/2);
      ctx.font = "14px system-ui"; ctx.fillText("Tap to play again", W/2, H/2 + 30);
      ctx.textAlign = "left";
    }
  }, []);

  const step = useCallback(() => {
    const s = st.current;
    if (s.shot?.active) {
      const shot = s.shot;
      shot.x += shot.vx; shot.y += shot.vy;
      // Bounce walls
      if (shot.x < BUBBLE_R) { shot.x = BUBBLE_R; shot.vx = Math.abs(shot.vx); }
      if (shot.x > W - BUBBLE_R) { shot.x = W - BUBBLE_R; shot.vx = -Math.abs(shot.vx); }
      // Off top
      if (shot.y < BUBBLE_R) { shot.active = false; return; }

      // Hit a bubble
      const hitIdx = s.bubbles.findIndex(b => b.alive && dist(shot, b) < BUBBLE_R * 1.85);
      if (hitIdx >= 0 || shot.y < BUBBLE_R * 2) {
        // Snap to grid position near hit
        const nearX = Math.round(shot.x / (BUBBLE_R * 2)) * BUBBLE_R * 2;
        const nearY = shot.y < BUBBLE_R * 2 ? BUBBLE_R : shot.y;
        s.bubbles.push({ x: Math.max(BUBBLE_R, Math.min(W - BUBBLE_R, nearX)), y: nearY, color: shot.color, alive: true });
        shot.active = false;

        // Match check
        const newIdx = s.bubbles.length - 1;
        const group = flood(s.bubbles, newIdx, shot.color);
        if (group.length >= 3) {
          group.forEach(i => { s.bubbles[i].alive = false; });
          s.score += group.length * 10;
          setUi(u => ({ ...u, score: s.score }));
        }

        // Check win
        if (s.bubbles.every(b => !b.alive)) { s.win = true; setUi(u => ({ ...u, win: true })); }
        // Check lose
        if (s.bubbles.some(b => b.alive && b.y > H * 0.78)) { s.over = true; setUi(u => ({ ...u, over: true })); }
      }
    }
    draw();
    raf.current = requestAnimationFrame(step);
  }, [draw]);

  useEffect(() => { raf.current = requestAnimationFrame(step); return () => cancelAnimationFrame(raf.current); }, [step]);

  const onMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    const mx = (e.clientX - rect.left) * (W / rect.width);
    const my = (e.clientY - rect.top) * (H / rect.height);
    const angle = Math.atan2(my - (H - 40), mx - W / 2);
    st.current.angle = Math.max(-Math.PI + 0.2, Math.min(-0.2, angle));
  };

  const onMouseClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (st.current.over || st.current.win) { st.current = initState(); setUi({ score: 0, over: false, win: false }); return; }
    shoot(st.current.angle);
  };

  const onTouchMove = (e: React.TouchEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    const mx = (e.touches[0].clientX - rect.left) * (W / rect.width);
    const my = (e.touches[0].clientY - rect.top) * (H / rect.height);
    const angle = Math.atan2(my - (H - 40), mx - W / 2);
    st.current.angle = Math.max(-Math.PI + 0.2, Math.min(-0.2, angle));
  };

  const onTouchEnd = () => {
    if (st.current.over || st.current.win) { st.current = initState(); setUi({ score: 0, over: false, win: false }); return; }
    shoot(st.current.angle);
  };

  return (
    <div className="flex flex-col items-center gap-2 p-3" style={{ background: "#1e1b4b" }}>
      <canvas ref={canvasRef} width={W} height={H} className="rounded-2xl max-w-full"
        style={{ touchAction: "none", cursor: "crosshair" }}
        onMouseMove={onMouseMove} onClick={onMouseClick}
        onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}
      />
      <p className="text-indigo-300/50 text-xs">Move to aim · Click / tap to shoot · Match 3+ same color</p>
    </div>
  );
}
