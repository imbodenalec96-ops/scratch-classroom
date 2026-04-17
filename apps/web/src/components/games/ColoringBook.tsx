import React, { useRef, useState, useEffect, useCallback } from "react";

// 10 pre-drawn SVG shapes as canvas paths — paint-by-region with flood fill
// We render to a canvas using ImageData for flood fill

const W = 380, H = 460;
const PALETTE = [
  "#ef4444","#f97316","#f59e0b","#eab308","#84cc16","#22c55e",
  "#14b8a6","#38bdf8","#818cf8","#a855f7","#ec4899","#f9a8d4",
  "#fed7aa","#fef08a","#bbf7d0","#ffffff","#94a3b8","#1e293b",
];

// Scenes: array of { label, paths } — each path is SVG path string + fill color hint
const SCENES = [
  {
    label: "🌸 Flower Garden",
    draw: (ctx: CanvasRenderingContext2D) => {
      ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, W, H);
      // Sky
      const skyPath = new Path2D(); skyPath.rect(0, 0, W, H * 0.55);
      ctx.fillStyle = "#bfdbfe"; ctx.fill(skyPath);
      // Ground
      const gnd = new Path2D(); gnd.rect(0, H * 0.55, W, H * 0.45);
      ctx.fillStyle = "#bbf7d0"; ctx.fill(gnd);
      // Sun
      const sun = new Path2D(); sun.arc(310, 60, 40, 0, Math.PI * 2);
      ctx.fillStyle = "#fef08a"; ctx.fill(sun);
      // Stem
      ctx.strokeStyle = "#15803d"; ctx.lineWidth = 8;
      ctx.beginPath(); ctx.moveTo(190, H - 20); ctx.lineTo(190, 240); ctx.stroke();
      // Leaves
      ctx.fillStyle = "#4ade80";
      ctx.beginPath(); ctx.ellipse(165, 320, 30, 14, -0.5, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(215, 290, 30, 14, 0.5, 0, Math.PI * 2); ctx.fill();
      // Petals
      const petalColors = ["#f9a8d4", "#fde68a", "#fca5a5", "#c4b5fd", "#93c5fd", "#6ee7b7"];
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        const px = 190 + Math.cos(a) * 42, py = 200 + Math.sin(a) * 42;
        const p = new Path2D(); p.ellipse(px, py, 24, 14, a, 0, Math.PI * 2);
        ctx.fillStyle = petalColors[i]; ctx.fill(p); ctx.strokeStyle = "#94a3b8"; ctx.lineWidth = 1.5; ctx.stroke(p);
      }
      // Center
      const center = new Path2D(); center.arc(190, 200, 22, 0, Math.PI * 2);
      ctx.fillStyle = "#fbbf24"; ctx.fill(center); ctx.strokeStyle = "#94a3b8"; ctx.lineWidth = 1.5; ctx.stroke(center);
      // Clouds
      [[60, 80, 50], [150, 50, 35]].forEach(([cx, cy, r]) => {
        const c = new Path2D(); c.arc(cx, cy, r, 0, Math.PI * 2);
        c.arc(cx + r * 0.8, cy - r * 0.3, r * 0.7, 0, Math.PI * 2);
        c.arc(cx - r * 0.7, cy - r * 0.2, r * 0.6, 0, Math.PI * 2);
        ctx.fillStyle = "#e0f2fe"; ctx.fill(c);
      });
      // Outline everything
      ctx.strokeStyle = "#1e293b"; ctx.lineWidth = 2;
      [sun, gnd, skyPath, center].forEach(p => ctx.stroke(p));
    },
  },
  {
    label: "🏠 Cozy House",
    draw: (ctx: CanvasRenderingContext2D) => {
      ctx.fillStyle = "#bfdbfe"; ctx.fillRect(0, 0, W, H);
      // Ground
      ctx.fillStyle = "#86efac"; ctx.fillRect(0, H * 0.7, W, H * 0.3);
      // House body
      ctx.fillStyle = "#fef3c7"; ctx.beginPath(); ctx.rect(80, 220, 220, 180); ctx.fill(); ctx.strokeStyle = "#1e293b"; ctx.lineWidth = 2; ctx.stroke();
      // Roof
      ctx.fillStyle = "#f87171"; ctx.beginPath(); ctx.moveTo(60, 225); ctx.lineTo(190, 100); ctx.lineTo(320, 225); ctx.closePath(); ctx.fill(); ctx.stroke();
      // Door
      ctx.fillStyle = "#92400e"; ctx.beginPath(); ctx.roundRect(165, 310, 50, 90, [8, 8, 0, 0]); ctx.fill(); ctx.stroke();
      // Windows
      [[100,240],[250,240]].forEach(([wx,wy]) => {
        ctx.fillStyle = "#bae6fd"; ctx.fillRect(wx, wy, 55, 50); ctx.strokeStyle = "#1e293b"; ctx.strokeRect(wx, wy, 55, 50);
        ctx.beginPath(); ctx.moveTo(wx+27, wy); ctx.lineTo(wx+27, wy+50); ctx.moveTo(wx, wy+25); ctx.lineTo(wx+55, wy+25); ctx.stroke();
      });
      // Chimney
      ctx.fillStyle = "#b91c1c"; ctx.fillRect(250, 120, 30, 80); ctx.strokeRect(250, 120, 30, 80);
      // Smoke
      ctx.strokeStyle = "#94a3b8"; ctx.lineWidth = 3;
      [[265,110],[275,95],[260,80]].forEach(([sx,sy]) => { ctx.beginPath(); ctx.arc(sx, sy, 10, 0, Math.PI * 2); ctx.stroke(); });
      // Path
      ctx.fillStyle = "#e7e5e4"; ctx.beginPath(); ctx.moveTo(165, 400); ctx.lineTo(215, 400); ctx.lineTo(230, H); ctx.lineTo(150, H); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = "#1e293b"; ctx.lineWidth = 2; ctx.stroke();
      // Sun
      ctx.fillStyle = "#fef08a"; ctx.beginPath(); ctx.arc(340, 60, 35, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    },
  },
  {
    label: "🐠 Under the Sea",
    draw: (ctx: CanvasRenderingContext2D) => {
      // Ocean bg
      const grad = ctx.createLinearGradient(0, 0, 0, H);
      grad.addColorStop(0, "#0ea5e9"); grad.addColorStop(1, "#1e3a5f");
      ctx.fillStyle = grad; ctx.fillRect(0, 0, W, H);
      // Sand
      ctx.fillStyle = "#f59e0b"; ctx.beginPath(); ctx.ellipse(W/2, H, W, 80, 0, 0, Math.PI * 2); ctx.fill();
      // Seaweed
      [[50,3],[300,2],[160,4]].forEach(([sx, s], i) => {
        ctx.strokeStyle = "#4ade80"; ctx.lineWidth = 6;
        ctx.beginPath(); ctx.moveTo(sx, H - 20);
        for (let y = H - 20; y > H - 120; y -= 20) ctx.quadraticCurveTo(sx + (i % 2 === 0 ? 20 : -20), y - 10, sx, y - 20);
        ctx.stroke();
      });
      // Big fish (player-facing)
      ctx.fillStyle = "#f97316"; ctx.beginPath(); ctx.ellipse(200, 220, 70, 40, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = "#1e293b"; ctx.lineWidth = 2; ctx.stroke();
      // Tail
      ctx.fillStyle = "#ea580c"; ctx.beginPath(); ctx.moveTo(275, 220); ctx.lineTo(310, 185); ctx.lineTo(310, 255); ctx.closePath(); ctx.fill(); ctx.stroke();
      // Eye
      ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(145, 210, 14, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = "#1e293b"; ctx.beginPath(); ctx.arc(141, 208, 7, 0, Math.PI * 2); ctx.fill();
      // Stripes
      ctx.strokeStyle = "#fbbf24"; ctx.lineWidth = 3;
      [170, 200, 230].forEach(sx => { ctx.beginPath(); ctx.moveTo(sx, 182); ctx.lineTo(sx, 258); ctx.stroke(); });
      // Small fish
      ctx.fillStyle = "#c4b5fd"; ctx.beginPath(); ctx.ellipse(320, 150, 30, 18, 0.3, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      // Bubbles
      [40,60,80,100].forEach((by, i) => {
        ctx.strokeStyle = "#93c5fd"; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(80 + i * 15, H - by, 8 + i * 2, 0, Math.PI * 2); ctx.stroke();
      });
      // Coral
      ctx.fillStyle = "#f9a8d4"; ctx.beginPath(); ctx.arc(340, H - 30, 25, Math.PI, 0); ctx.fill(); ctx.stroke();
      ctx.fillStyle = "#fb7185"; ctx.beginPath(); ctx.arc(360, H - 50, 15, Math.PI, 0); ctx.fill(); ctx.stroke();
    },
  },
];

function floodFill(imageData: ImageData, x0: number, y0: number, fillColor: string) {
  const { data, width, height } = imageData;
  const parseColor = (hex: string) => {
    const n = parseInt(hex.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 255];
  };
  const [fr, fg, fb] = parseColor(fillColor);
  const idx = (x: number, y: number) => (y * width + x) * 4;
  const ti = idx(x0, y0);
  const [tr, tg, tb, ta] = [data[ti], data[ti+1], data[ti+2], data[ti+3]];
  if (tr === fr && tg === fg && tb === fb) return;
  // Don't fill dark outlines
  if (tr < 60 && tg < 60 && tb < 60 && ta > 200) return;

  const match = (i: number) =>
    Math.abs(data[i] - tr) < 40 && Math.abs(data[i+1] - tg) < 40 &&
    Math.abs(data[i+2] - tb) < 40 && data[i+3] > 100;

  const stack = [[x0, y0]];
  const visited = new Set<number>();
  while (stack.length) {
    const [x, y] = stack.pop()!;
    if (x < 0 || x >= width || y < 0 || y >= height) continue;
    const i = idx(x, y);
    if (visited.has(i) || !match(i)) continue;
    visited.add(i);
    data[i] = fr; data[i+1] = fg; data[i+2] = fb; data[i+3] = 255;
    stack.push([x+1,y],[x-1,y],[x,y+1],[x,y-1]);
  }
}

export default function ColoringBook() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [color, setColor] = useState(PALETTE[0]);
  const [sceneIdx, setSceneIdx] = useState(0);

  const drawScene = useCallback(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    SCENES[sceneIdx].draw(ctx);
  }, [sceneIdx]);

  useEffect(() => { drawScene(); }, [drawScene]);

  const paint = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    const rect = canvas.getBoundingClientRect();
    let cx: number, cy: number;
    if ("touches" in e) {
      cx = (e.touches[0].clientX - rect.left) * (W / rect.width);
      cy = (e.touches[0].clientY - rect.top) * (H / rect.height);
    } else {
      cx = (e.clientX - rect.left) * (W / rect.width);
      cy = (e.clientY - rect.top) * (H / rect.height);
    }
    const imageData = ctx.getImageData(0, 0, W, H);
    floodFill(imageData, Math.round(cx), Math.round(cy), color);
    ctx.putImageData(imageData, 0, 0);
  };

  const reset = () => drawScene();
  const nextScene = () => setSceneIdx(i => (i + 1) % SCENES.length);

  return (
    <div className="flex flex-col items-center gap-3 p-3" style={{ background: "#fdf4ff" }}>
      {/* Scene picker */}
      <div className="flex gap-2 flex-wrap justify-center">
        {SCENES.map((sc, i) => (
          <button key={i} onClick={() => setSceneIdx(i)}
            className={`px-3 py-1.5 rounded-xl text-sm font-bold border-2 transition-all ${i === sceneIdx ? "border-purple-400 bg-purple-100 text-purple-700" : "border-purple-200 bg-white text-purple-500"}`}
            style={{ touchAction: "manipulation" }}>{sc.label}</button>
        ))}
        <button onClick={reset} className="px-3 py-1.5 rounded-xl text-sm font-bold border-2 border-gray-200 bg-white text-gray-500" style={{ touchAction: "manipulation" }}>🔄 Reset</button>
      </div>

      <canvas ref={canvasRef} width={W} height={H} className="rounded-2xl border-4 border-purple-200 max-w-full"
        style={{ cursor: "cell", touchAction: "none" }}
        onClick={paint as any} onTouchStart={paint as any} />

      {/* Color palette */}
      <div className="flex flex-wrap justify-center gap-2 max-w-sm">
        {PALETTE.map(c => (
          <button key={c} onClick={() => setColor(c)}
            style={{ width: 34, height: 34, borderRadius: 8, background: c, border: c === color ? "3px solid #7c3aed" : "3px solid #e9d5ff", boxShadow: c === color ? "0 0 0 2px #fff, 0 0 0 4px #7c3aed" : "none", transition: "all 0.12s", touchAction: "manipulation" }}
          />
        ))}
      </div>
      <p className="text-purple-500/50 text-xs">Pick a color · tap any region to paint it · try all 3 scenes!</p>
    </div>
  );
}
