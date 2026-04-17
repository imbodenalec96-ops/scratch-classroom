import React, { useState, useCallback } from "react";

type Cfg = { rows: number; cols: number; mines: number; label: string };
const CONFIGS: Cfg[] = [
  { rows: 8,  cols: 8,  mines: 10, label: "🌱 Easy"   },
  { rows: 10, cols: 10, mines: 18, label: "🌸 Medium"  },
  { rows: 12, cols: 12, mines: 28, label: "🌺 Hard"    },
];

type Cell = { mine: boolean; revealed: boolean; flagged: boolean; adj: number };

function makeGrid(rows: number, cols: number, mines: number, safeR: number, safeC: number): Cell[][] {
  const grid: Cell[][] = Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => ({ mine: false, revealed: false, flagged: false, adj: 0 }))
  );
  // Place mines (not near safe cell)
  let placed = 0;
  while (placed < mines) {
    const r = Math.floor(Math.random() * rows), c = Math.floor(Math.random() * cols);
    if (!grid[r][c].mine && Math.abs(r - safeR) > 1 || Math.abs(c - safeC) > 1) {
      grid[r][c].mine = true; placed++;
    }
  }
  // Calculate adjacency
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    if (grid[r][c].mine) continue;
    let n = 0;
    for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
      const nr = r + dr, nc = c + dc;
      if (nr >= 0 && nr < rows && nc >= 0 && nc < cols && grid[nr][nc].mine) n++;
    }
    grid[r][c].adj = n;
  }
  return grid;
}

function reveal(grid: Cell[][], r: number, c: number): Cell[][] {
  const g = grid.map(row => row.map(cell => ({ ...cell })));
  const queue = [[r, c]];
  while (queue.length) {
    const [cr, cc] = queue.pop()!;
    if (cr < 0 || cr >= g.length || cc < 0 || cc >= g[0].length) continue;
    const cell = g[cr][cc];
    if (cell.revealed || cell.flagged || cell.mine) continue;
    cell.revealed = true;
    if (cell.adj === 0) for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) queue.push([cr+dr, cc+dc]);
  }
  return g;
}

const ADJ_COLORS = ["","#2563eb","#16a34a","#dc2626","#7c3aed","#b91c1c","#0d9488","#374151","#6b7280"];

export default function Minesweeper() {
  const [cfgIdx, setCfgIdx] = useState(0);
  const cfg = CONFIGS[cfgIdx];
  const [grid, setGrid] = useState<Cell[][] | null>(null);
  const [started, setStarted] = useState(false);
  const [over, setOver] = useState(false);
  const [won, setWon] = useState(false);
  const [flags, setFlags] = useState(0);

  const initGrid = useCallback((r: number, c: number) => {
    const g = makeGrid(cfg.rows, cfg.cols, cfg.mines, r, c);
    return reveal(g, r, c);
  }, [cfg]);

  const checkWin = (g: Cell[][]) => g.every(row => row.every(cell => cell.revealed || cell.mine));

  const click = (r: number, c: number) => {
    if (over || won) return;
    let g: Cell[][];
    if (!started) { g = initGrid(r, c); setStarted(true); }
    else { g = grid!.map(row => row.map(cell => ({ ...cell }))); }
    if (g[r][c].flagged || g[r][c].revealed) return;
    if (g[r][c].mine) {
      // Reveal all mines
      const blown = g.map(row => row.map(cell => ({ ...cell, revealed: cell.mine ? true : cell.revealed })));
      setGrid(blown); setOver(true); return;
    }
    const next = reveal(g, r, c);
    setGrid(next);
    if (checkWin(next)) setWon(true);
  };

  const rightClick = (e: React.MouseEvent, r: number, c: number) => {
    e.preventDefault();
    if (!started || over || won) return;
    setGrid(prev => {
      if (!prev) return prev;
      const g = prev.map(row => row.map(cell => ({ ...cell })));
      if (!g[r][c].revealed) {
        const wasFlag = g[r][c].flagged;
        g[r][c].flagged = !wasFlag;
        setFlags(f => wasFlag ? f - 1 : f + 1);
      }
      return g;
    });
  };

  const reset = () => { setGrid(null); setStarted(false); setOver(false); setWon(false); setFlags(0); };

  const CELL_SIZE = Math.min(38, Math.floor(320 / cfg.cols));

  return (
    <div className="flex flex-col items-center gap-3 p-4" style={{ background: "#f0fdf4" }}>
      {/* Config picker */}
      <div className="flex gap-2 flex-wrap justify-center">
        {CONFIGS.map((c, i) => (
          <button key={i} onClick={() => { setCfgIdx(i); reset(); }}
            className={`px-3 py-1.5 rounded-xl text-sm font-bold border-2 ${i === cfgIdx ? "bg-green-500 text-white border-green-400" : "bg-white text-green-700 border-green-200"}`}
            style={{ touchAction: "manipulation" }}>{c.label}</button>
        ))}
        <button onClick={reset} className="px-3 py-1.5 rounded-xl text-sm font-bold border-2 bg-white text-gray-500 border-gray-200" style={{ touchAction: "manipulation" }}>🔄</button>
      </div>

      <div className="flex gap-3 text-sm font-bold text-green-800">
        <span>💣 {cfg.mines - flags}</span>
        {won && <span className="text-green-600">🎉 You found all mines!</span>}
        {over && <span className="text-red-600">💥 Boom! Try again.</span>}
      </div>

      {!started && !grid ? (
        <div className="text-center p-8 text-green-700">
          <p className="text-xl mb-2">🌸 Flower Field</p>
          <p className="text-sm text-green-600">Click any square to start.<br />Right-click / long-press to flag 🚩</p>
          {/* Empty grid preview */}
          <div style={{ display: "grid", gridTemplateColumns: `repeat(${cfg.cols}, ${CELL_SIZE}px)`, gap: 3, marginTop: 16 }}>
            {Array(cfg.rows * cfg.cols).fill(null).map((_, i) => (
              <div key={i} style={{ width: CELL_SIZE, height: CELL_SIZE, borderRadius: 6, background: "#bbf7d0", border: "2px solid #86efac" }}
                onClick={() => { const r = Math.floor(i / cfg.cols), c = i % cfg.cols; click(r, c); }}
              />
            ))}
          </div>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: `repeat(${cfg.cols}, ${CELL_SIZE}px)`, gap: 3 }}>
          {(grid || []).map((row, r) => row.map((cell, c) => {
            let bg = "#bbf7d0", border = "#86efac", content: React.ReactNode = "";
            if (cell.flagged) { content = "🚩"; bg = "#fef9ee"; border = "#fbbf24"; }
            else if (cell.revealed) {
              bg = cell.mine ? "#fca5a5" : "#f1f5f9"; border = cell.mine ? "#ef4444" : "#cbd5e1";
              if (cell.mine) content = "💣";
              else if (cell.adj > 0) content = <span style={{ color: ADJ_COLORS[cell.adj], fontWeight: 800 }}>{cell.adj}</span>;
            }
            return (
              <div key={`${r}-${c}`}
                style={{ width: CELL_SIZE, height: CELL_SIZE, borderRadius: 6, background: bg, border: `2px solid ${border}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: CELL_SIZE * 0.48, cursor: "pointer", userSelect: "none", touchAction: "manipulation" }}
                onClick={() => click(r, c)}
                onContextMenu={e => rightClick(e, r, c)}
              >{content}</div>
            );
          }))}
        </div>
      )}

      <p className="text-green-600/50 text-xs">Click to reveal · right-click to flag 🚩 · avoid the 💣</p>
    </div>
  );
}
