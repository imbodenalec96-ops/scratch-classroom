import React, { useRef, useState, useCallback, useEffect } from "react";

// Pixel art canvas — 32×32 grid with color picker and tools
const GRID = 32, CELL = 14;
const W = GRID * CELL, H = GRID * CELL;

const PALETTE = [
  "#000000","#ffffff","#ef4444","#f97316","#f59e0b","#eab308",
  "#84cc16","#22c55e","#14b8a6","#06b6d4","#38bdf8","#818cf8",
  "#a855f7","#ec4899","#f43f5e","#78716c","#94a3b8","#cbd5e1",
  "#fde68a","#fed7aa","#bbf7d0","#bfdbfe","#e9d5ff","#fce7f3",
];

const TEMPLATES: { label: string; fn: (pixels: string[][]) => string[][] }[] = [
  { label: "🌈 Clear", fn: () => Array(GRID).fill(null).map(() => Array(GRID).fill("")) },
  { label: "🌸 Flower", fn: (p) => {
    const n = p.map(r => [...r]);
    const cx = 15, cy = 15;
    for (let r = 0; r < GRID; r++) for (let c = 0; c < GRID; c++) {
      const d = Math.hypot(c - cx, r - cy);
      if (d < 5) n[r][c] = "#fbbf24";
      else if (d < 9) {
        const a = Math.atan2(r - cy, c - cx);
        n[r][c] = Math.sin(a * 5) > 0 ? "#f9a8d4" : "";
      }
      if (Math.abs(c - cx) < 2 && r > cy + 4 && r < cy + 14) n[r][c] = "#4ade80";
    }
    return n;
  }},
  { label: "🏠 House", fn: () => {
    const n = Array(GRID).fill(null).map(() => Array(GRID).fill(""));
    for (let r = 12; r < 28; r++) for (let c = 8; c < 24; c++) n[r][c] = "#fef3c7";
    for (let r = 5; r < 13; r++) for (let c = 8; c < 24; c++) if (Math.abs(c - 16) < 13 - r) n[r][c] = "#f87171";
    for (let r = 18; r < 28; r++) for (let c = 13; c < 19; c++) n[r][c] = "#92400e";
    for (let r = 14; r < 19; r++) for (let c = 9; c < 14; c++) n[r][c] = "#bae6fd";
    for (let r = 14; r < 19; r++) for (let c = 18; c < 23; c++) n[r][c] = "#bae6fd";
    return n;
  }},
];

type Tool = "draw" | "erase" | "fill";

function floodFill(pixels: string[][], x: number, y: number, color: string): string[][] {
  const target = pixels[y]?.[x];
  if (target === color) return pixels;
  const n = pixels.map(r => [...r]);
  const stack = [[x, y]];
  while (stack.length) {
    const [cx, cy] = stack.pop()!;
    if (cx < 0 || cx >= GRID || cy < 0 || cy >= GRID || n[cy][cx] !== target) continue;
    n[cy][cx] = color;
    stack.push([cx+1,cy],[cx-1,cy],[cx,cy+1],[cx,cy-1]);
  }
  return n;
}

export default function PixelArt() {
  const [pixels, setPixels] = useState<string[][]>(() => Array(GRID).fill(null).map(() => Array(GRID).fill("")));
  const [color, setColor] = useState("#ef4444");
  const [tool, setTool] = useState<Tool>("draw");
  const [drawing, setDrawing] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [showGrid, setShowGrid] = useState(true);

  const paint = useCallback((canvas: HTMLCanvasElement, px: string[][], sg: boolean) => {
    const ctx = canvas.getContext("2d")!;
    ctx.clearRect(0, 0, W, H);
    // Background checkerboard for transparent
    for (let r = 0; r < GRID; r++) for (let c = 0; c < GRID; c++) {
      ctx.fillStyle = (r + c) % 2 === 0 ? "#f1f5f9" : "#e2e8f0";
      ctx.fillRect(c * CELL, r * CELL, CELL, CELL);
    }
    // Pixels
    for (let r = 0; r < GRID; r++) for (let c = 0; c < GRID; c++) {
      if (px[r][c]) { ctx.fillStyle = px[r][c]; ctx.fillRect(c * CELL, r * CELL, CELL, CELL); }
    }
    // Grid lines
    if (sg) {
      ctx.strokeStyle = "#00000018"; ctx.lineWidth = 0.5;
      for (let i = 0; i <= GRID; i++) {
        ctx.beginPath(); ctx.moveTo(i * CELL, 0); ctx.lineTo(i * CELL, H); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, i * CELL); ctx.lineTo(W, i * CELL); ctx.stroke();
      }
    }
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    paint(canvas, pixels, showGrid);
  }, [pixels, showGrid, paint]);

  const getCell = (e: React.MouseEvent | React.Touch, canvas: HTMLCanvasElement) => {
    const rect = canvas.getBoundingClientRect();
    const clientX = "clientX" in e ? e.clientX : (e as React.Touch).clientX;
    const clientY = "clientY" in e ? e.clientY : (e as React.Touch).clientY;
    return {
      c: Math.floor((clientX - rect.left) / (rect.width / GRID)),
      r: Math.floor((clientY - rect.top) / (rect.height / GRID)),
    };
  };

  const applyTool = (r: number, c: number) => {
    if (r < 0 || r >= GRID || c < 0 || c >= GRID) return;
    if (tool === "fill") { setPixels(p => floodFill(p, c, r, color)); return; }
    const val = tool === "erase" ? "" : color;
    setPixels(p => { const n = p.map(row => [...row]); n[r][c] = val; return n; });
  };

  const onMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    setDrawing(true);
    const { r, c } = getCell(e, e.currentTarget);
    applyTool(r, c);
  };
  const onMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!drawing) return;
    const { r, c } = getCell(e, e.currentTarget);
    applyTool(r, c);
  };
  const onMouseUp = () => setDrawing(false);

  const onTouchStart = (e: React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const { r, c } = getCell(e.touches[0], e.currentTarget);
    applyTool(r, c);
  };
  const onTouchMove = (e: React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const { r, c } = getCell(e.touches[0], e.currentTarget);
    applyTool(r, c);
  };

  const download = () => {
    const canvas = canvasRef.current; if (!canvas) return;
    // Render at 2× without grid for export
    const tmp = document.createElement("canvas");
    tmp.width = GRID * 16; tmp.height = GRID * 16;
    const ctx = tmp.getContext("2d")!;
    for (let r = 0; r < GRID; r++) for (let cc = 0; cc < GRID; cc++) {
      ctx.fillStyle = pixels[r][cc] || "#ffffff"; ctx.fillRect(cc*16, r*16, 16, 16);
    }
    const a = document.createElement("a"); a.download = "pixel-art.png"; a.href = tmp.toDataURL(); a.click();
  };

  const tools: { id: Tool; icon: string }[] = [{ id: "draw", icon: "✏️" }, { id: "erase", icon: "🧹" }, { id: "fill", icon: "🪣" }];

  return (
    <div className="flex flex-col items-center gap-3 p-3" style={{ background: "#f8fafc" }}>
      {/* Toolbar */}
      <div className="flex gap-2 items-center flex-wrap justify-center">
        {tools.map(t => (
          <button key={t.id} onClick={() => setTool(t.id)}
            className={`px-3 py-2 rounded-xl font-bold text-sm border-2 transition-all ${tool === t.id ? "bg-blue-500 text-white border-blue-400" : "bg-white text-gray-600 border-gray-200"}`}
            style={{ touchAction: "manipulation" }}>{t.icon} {t.id}</button>
        ))}
        <button onClick={() => setShowGrid(g => !g)} className={`px-3 py-2 rounded-xl text-sm border-2 ${showGrid ? "bg-slate-200 border-slate-300" : "bg-white border-gray-200"}`} style={{ touchAction: "manipulation" }}>
          # Grid
        </button>
        {TEMPLATES.map(tp => (
          <button key={tp.label} onClick={() => setPixels(tp.fn(pixels))}
            className="px-3 py-2 rounded-xl text-sm border-2 bg-white border-gray-200 text-gray-600" style={{ touchAction: "manipulation" }}>{tp.label}</button>
        ))}
        <button onClick={download} className="px-3 py-2 rounded-xl text-sm border-2 bg-green-100 border-green-300 text-green-700 font-bold" style={{ touchAction: "manipulation" }}>💾 Save</button>
      </div>

      {/* Canvas */}
      <canvas ref={canvasRef} width={W} height={H} className="rounded-xl border-2 border-slate-200 max-w-full"
        style={{ imageRendering: "pixelated", cursor: tool === "erase" ? "cell" : tool === "fill" ? "crosshair" : "crosshair", touchAction: "none" }}
        onMouseDown={onMouseDown} onMouseMove={onMouseMove} onMouseUp={onMouseUp} onMouseLeave={onMouseUp}
        onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onMouseUp}
      />

      {/* Palette */}
      <div className="flex flex-wrap gap-1.5 justify-center max-w-sm">
        {PALETTE.map(c => (
          <button key={c} onClick={() => { setColor(c); setTool("draw"); }}
            style={{ width: 30, height: 30, borderRadius: 6, background: c, border: c === color && tool === "draw" ? "3px solid #3b82f6" : "2px solid #e2e8f0", boxShadow: c === color && tool === "draw" ? "0 0 0 2px #fff, 0 0 0 4px #3b82f6" : "none", touchAction: "manipulation" }} />
        ))}
      </div>
      <p className="text-slate-400 text-xs">Draw · erase · fill · save your art as PNG!</p>
    </div>
  );
}
