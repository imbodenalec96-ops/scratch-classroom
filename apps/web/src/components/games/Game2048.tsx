import React, { useState, useEffect, useRef, useCallback } from "react";

type G = (number | null)[][];

function empty(): G { return Array.from({ length: 4 }, () => Array(4).fill(null)); }

function addTile(g: G): G {
  const blanks: [number, number][] = [];
  g.forEach((row, r) => row.forEach((v, c) => { if (!v) blanks.push([r, c]); }));
  if (!blanks.length) return g;
  const [r, c] = blanks[Math.floor(Math.random() * blanks.length)];
  const n = g.map(row => [...row]); n[r][c] = Math.random() < 0.9 ? 2 : 4; return n;
}

function slideRow(row: (number | null)[]): [(number | null)[], number] {
  const nums = row.filter(Boolean) as number[];
  let score = 0; const out: number[] = [];
  for (let i = 0; i < nums.length; i++) {
    if (i + 1 < nums.length && nums[i] === nums[i + 1]) { out.push(nums[i] * 2); score += nums[i] * 2; i++; }
    else out.push(nums[i]);
  }
  while (out.length < 4) out.push(null as unknown as number);
  return [out, score];
}

function shift(g: G, dir: "left" | "right" | "up" | "down"): [G, number, boolean] {
  const T = (m: G): G => m[0].map((_, c) => m.map(r => r[c]));
  const flip = (m: G): G => m.map(r => [...r].reverse());
  let board = g.map(r => [...r]);
  let score = 0; let moved = false;
  const process = (m: G) => m.map(row => {
    const [slid, s] = slideRow(row);
    if (JSON.stringify(slid) !== JSON.stringify(row)) moved = true;
    score += s; return slid;
  });
  if (dir === "left") board = process(board);
  else if (dir === "right") board = flip(process(flip(board)));
  else if (dir === "up") board = T(process(T(board)));
  else board = T(flip(process(flip(T(board)))));
  return [board, score, moved];
}

function canMove(g: G): boolean {
  for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) {
    if (!g[r][c]) return true;
    if (c < 3 && g[r][c] === g[r][c + 1]) return true;
    if (r < 3 && g[r][c] === g[r + 1][c]) return true;
  }
  return false;
}

const TILE_STYLE: Record<number, { bg: string; fg: string; size: number }> = {
  2:    { bg: "#fef3c7", fg: "#78350f", size: 24 },
  4:    { bg: "#fde68a", fg: "#78350f", size: 24 },
  8:    { bg: "#fdba74", fg: "#7c2d12", size: 24 },
  16:   { bg: "#fca5a5", fg: "#7f1d1d", size: 22 },
  32:   { bg: "#f9a8d4", fg: "#831843", size: 22 },
  64:   { bg: "#e879f9", fg: "#fff",    size: 22 },
  128:  { bg: "#a78bfa", fg: "#fff",    size: 20 },
  256:  { bg: "#818cf8", fg: "#fff",    size: 20 },
  512:  { bg: "#34d399", fg: "#fff",    size: 20 },
  1024: { bg: "#22d3ee", fg: "#fff",    size: 18 },
  2048: { bg: "#facc15", fg: "#fff",    size: 18 },
};
const tileStyle = (v: number | null) =>
  v ? (TILE_STYLE[v] ?? { bg: "#6366f1", fg: "#fff", size: 16 }) : { bg: "#1e293b", fg: "#475569", size: 20 };

export default function Game2048() {
  const [grid, setGrid] = useState<G>(() => addTile(addTile(empty())));
  const [score, setScore] = useState(0);
  const [best, setBest] = useState(() => Number(localStorage.getItem("2048_best") || 0));
  const [won, setWon] = useState(false);
  const [over, setOver] = useState(false);
  const touchStart = useRef<{ x: number; y: number } | null>(null);

  const doMove = useCallback((dir: "left" | "right" | "up" | "down") => {
    setGrid(prev => {
      const [next, addScore, moved] = shift(prev, dir);
      if (!moved) return prev;
      const withNew = addTile(next);
      if (addScore > 0) {
        setScore(s => { const ns = s + addScore; setBest(b => { const nb = Math.max(b, ns); localStorage.setItem("2048_best", String(nb)); return nb; }); return ns; });
      }
      if (withNew.flat().some(v => v === 2048)) setWon(true);
      if (!canMove(withNew)) setOver(true);
      return withNew;
    });
  }, []);

  useEffect(() => {
    const dirMap: Record<string, "left" | "right" | "up" | "down"> = {
      ArrowLeft: "left", ArrowRight: "right", ArrowUp: "up", ArrowDown: "down",
      a: "left", d: "right", w: "up", s: "down",
    };
    const h = (e: KeyboardEvent) => {
      if (dirMap[e.key]) { e.preventDefault(); doMove(dirMap[e.key]); }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [doMove]);

  const restart = () => { setGrid(addTile(addTile(empty()))); setScore(0); setWon(false); setOver(false); };

  const onTouchStart = (e: React.TouchEvent) => { touchStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }; };
  const onTouchEnd = (e: React.TouchEvent) => {
    if (!touchStart.current) return;
    const dx = e.changedTouches[0].clientX - touchStart.current.x;
    const dy = e.changedTouches[0].clientY - touchStart.current.y;
    touchStart.current = null;
    if (Math.abs(dx) < 10 && Math.abs(dy) < 10) return;
    if (Math.abs(dx) > Math.abs(dy)) doMove(dx < 0 ? "left" : "right");
    else doMove(dy < 0 ? "up" : "down");
  };

  return (
    <div className="flex flex-col items-center gap-4 p-4 min-h-full select-none" style={{ background: "#faf7f0" }}>
      {/* Header */}
      <div className="flex items-center gap-4">
        <div className="text-3xl font-black text-amber-800">2048</div>
        <div className="flex gap-2">
          {[["SCORE", score], ["BEST", best]].map(([label, val]) => (
            <div key={label as string} className="bg-amber-200 rounded-xl px-3 py-1.5 text-center min-w-[70px]">
              <div className="text-[10px] font-bold text-amber-700 tracking-widest">{label}</div>
              <div className="text-lg font-bold text-amber-900">{val}</div>
            </div>
          ))}
        </div>
        <button onClick={restart} className="bg-amber-500 hover:bg-amber-400 text-white px-3 py-2 rounded-xl font-bold text-sm" style={{ touchAction: "manipulation" }}>New</button>
      </div>

      {/* Grid */}
      <div
        className="p-3 rounded-2xl"
        style={{ background: "#9f8670", touchAction: "none" }}
        onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}
      >
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 72px)", gap: 8 }}>
          {grid.flat().map((v, i) => {
            const ts = tileStyle(v);
            return (
              <div key={i} style={{ width: 72, height: 72, background: ts.bg, color: ts.fg, fontSize: ts.size, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, transition: "all 0.1s ease" }}>
                {v ?? ""}
              </div>
            );
          })}
        </div>
      </div>

      {(won || over) && (
        <div className="text-center space-y-2">
          <p className="text-2xl font-bold" style={{ color: won ? "#d97706" : "#dc2626" }}>
            {won ? "🎉 You got 2048!" : "No moves left!"}
          </p>
          <button onClick={restart} className="bg-amber-500 text-white px-6 py-2 rounded-xl font-bold" style={{ touchAction: "manipulation" }}>Play Again</button>
        </div>
      )}

      <p className="text-amber-700/40 text-xs">Arrow keys · WASD · swipe to slide tiles</p>
    </div>
  );
}
