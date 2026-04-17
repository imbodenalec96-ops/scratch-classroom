import React, { useState, useCallback, useRef } from "react";

const WORD_BANKS: Record<string, string[]> = {
  "🐾 Animals":  ["CAT","DOG","FISH","BIRD","FROG","BEAR","LION","DUCK","OWL","FOX"],
  "🌈 Colors":   ["RED","BLUE","GREEN","PINK","GOLD","TEAL","LIME","ROSE","CYAN","PLUM"],
  "🔢 Math":     ["ADD","SUM","ONE","TWO","SIX","TEN","PLUS","EVEN","ODD","HALF"],
  "🌍 Science":  ["ATOM","RAIN","WIND","HEAT","STEM","ROOT","LEAF","MOON","STAR","CELL"],
};

const GRID = 12;

type Cell = { letter: string; wordIdx: number[] };
type PlacedWord = { word: string; cells: [number,number][] };

function buildGrid(words: string[]): { grid: Cell[][]; placed: PlacedWord[] } {
  const grid: Cell[][] = Array.from({ length: GRID }, () =>
    Array.from({ length: GRID }, () => ({ letter: "", wordIdx: [] }))
  );
  const DIRS = [[0,1],[1,0],[0,-1],[-1,0],[1,1],[-1,-1],[1,-1],[-1,1]];
  const placed: PlacedWord[] = [];

  words.forEach((word, wi) => {
    let success = false;
    for (let attempt = 0; attempt < 200 && !success; attempt++) {
      const [dr, dc] = DIRS[Math.floor(Math.random() * DIRS.length)];
      const maxR = dr === 0 ? GRID - 1 : dr > 0 ? GRID - word.length : word.length - 1;
      const maxC = dc === 0 ? GRID - 1 : dc > 0 ? GRID - word.length : word.length - 1;
      const startR = Math.floor(Math.random() * (maxR + 1));
      const startC = Math.floor(Math.random() * (maxC + 1));
      const cells: [number,number][] = [];
      let ok = true;
      for (let i = 0; i < word.length; i++) {
        const r = startR + dr * i, c = startC + dc * i;
        if (r < 0 || r >= GRID || c < 0 || c >= GRID) { ok = false; break; }
        if (grid[r][c].letter && grid[r][c].letter !== word[i]) { ok = false; break; }
        cells.push([r, c]);
      }
      if (ok) {
        cells.forEach(([r, c], i) => { grid[r][c].letter = word[i]; grid[r][c].wordIdx.push(wi); });
        placed.push({ word, cells });
        success = true;
      }
    }
  });

  // Fill empties
  for (let r = 0; r < GRID; r++) for (let c = 0; c < GRID; c++) {
    if (!grid[r][c].letter) grid[r][c].letter = String.fromCharCode(65 + Math.floor(Math.random() * 26));
  }
  return { grid, placed };
}

export default function WordSearch() {
  const [bankKey, setBankKey] = useState(Object.keys(WORD_BANKS)[0]);
  const [data, setData] = useState(() => {
    const words = WORD_BANKS[Object.keys(WORD_BANKS)[0]].slice(0, 8);
    return buildGrid(words);
  });
  const [found, setFound] = useState<number[]>([]);
  const [sel, setSel] = useState<[number,number][]>([]);
  const [dragging, setDragging] = useState(false);
  const [cellSize] = useState(28);
  const [wrong, setWrong] = useState(false);

  const newGame = useCallback((key: string) => {
    const words = WORD_BANKS[key].slice(0, 8);
    setData(buildGrid(words));
    setFound([]); setSel([]); setDragging(false);
  }, []);

  const startSel = (r: number, c: number) => { setSel([[r, c]]); setDragging(true); setWrong(false); };
  const extendSel = (r: number, c: number) => {
    if (!dragging) return;
    setSel(prev => {
      if (!prev.length) return prev;
      const [sr, sc] = prev[0];
      const dr = r - sr, dc = c - sc;
      const len = Math.max(Math.abs(dr), Math.abs(dc));
      if (len === 0) return [[r, c]];
      const ndr = dr === 0 ? 0 : dr / Math.abs(dr), ndc = dc === 0 ? 0 : dc / Math.abs(dc);
      // Only allow straight lines
      if (dr !== 0 && dc !== 0 && Math.abs(dr) !== Math.abs(dc)) return prev;
      const cells: [number,number][] = [];
      for (let i = 0; i <= len; i++) {
        const nr = sr + ndr * i, nc = sc + ndc * i;
        if (nr >= 0 && nr < GRID && nc >= 0 && nc < GRID) cells.push([nr, nc]);
      }
      return cells;
    });
  };

  const endSel = () => {
    setDragging(false);
    // Check if selection matches any word
    const selStr = sel.map(([r, c]) => data.grid[r][c].letter).join("");
    const selRev = [...selStr].reverse().join("");
    const match = data.placed.findIndex(p => !found.includes(data.placed.indexOf(p)) && (p.word === selStr || p.word === selRev));
    if (match >= 0) {
      setFound(prev => [...prev, match]);
    } else if (sel.length > 1) {
      setWrong(true);
      setTimeout(() => setWrong(false), 400);
    }
    setSel([]);
  };

  const isSelected = (r: number, c: number) => sel.some(([sr, sc]) => sr === r && sc === c);
  const isFound = (r: number, c: number) => data.placed.some((p, i) => found.includes(i) && p.cells.some(([pr, pc]) => pr === r && pc === c));

  const allFound = found.length === data.placed.length;

  return (
    <div className="flex flex-col items-center gap-3 p-3" style={{ background: "#fdf4ff" }}>
      {/* Category picker */}
      <div className="flex gap-1 flex-wrap justify-center">
        {Object.keys(WORD_BANKS).map(k => (
          <button key={k} onClick={() => { setBankKey(k); newGame(k); }}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold border-2 ${k === bankKey ? "bg-purple-500 text-white border-purple-400" : "bg-white text-purple-600 border-purple-200"}`}
            style={{ touchAction: "manipulation" }}>{k}</button>
        ))}
        <button onClick={() => newGame(bankKey)} className="px-3 py-1.5 rounded-xl text-xs font-bold border-2 bg-white text-gray-500 border-gray-200" style={{ touchAction: "manipulation" }}>🔄</button>
      </div>

      {/* Word list */}
      <div className="flex flex-wrap gap-1 justify-center max-w-sm">
        {data.placed.map((p, i) => (
          <span key={i} style={{ fontSize: 12, fontWeight: 700, padding: "2px 8px", borderRadius: 8,
            background: found.includes(i) ? "#d1fae5" : "#f5f3ff",
            color: found.includes(i) ? "#065f46" : "#6d28d9",
            textDecoration: found.includes(i) ? "line-through" : "none",
            border: `2px solid ${found.includes(i) ? "#6ee7b7" : "#ddd6fe"}`,
          }}>{p.word}</span>
        ))}
      </div>

      {allFound && <p className="text-green-600 font-bold text-lg">🎉 All words found!</p>}

      {/* Grid */}
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${GRID}, ${cellSize}px)`, gap: 2,
        background: wrong ? "#fca5a5" : "#e9d5ff", padding: 6, borderRadius: 16, transition: "background 0.2s", touchAction: "none" }}
        onMouseLeave={() => { if (dragging) endSel(); }}
      >
        {data.grid.map((row, r) => row.map((cell, c) => {
          const sel_ = isSelected(r, c), fnd = isFound(r, c);
          return (
            <div key={`${r}-${c}`}
              style={{ width: cellSize, height: cellSize, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 6, fontSize: 13, fontWeight: 800, cursor: "default",
                background: fnd ? "#4ade80" : sel_ ? "#a78bfa" : "#fff",
                color: fnd ? "#064e3b" : sel_ ? "#fff" : "#1e293b",
                userSelect: "none", touchAction: "none",
                transform: sel_ ? "scale(1.08)" : "scale(1)", transition: "all 0.08s",
              }}
              onMouseDown={() => startSel(r, c)}
              onMouseEnter={() => extendSel(r, c)}
              onMouseUp={endSel}
              onTouchStart={e => { e.preventDefault(); startSel(r, c); }}
              onTouchMove={e => {
                e.preventDefault();
                const touch = e.touches[0];
                const el = document.elementFromPoint(touch.clientX, touch.clientY) as HTMLElement;
                const dr = el?.dataset?.r, dc = el?.dataset?.c;
                if (dr !== undefined && dc !== undefined) extendSel(Number(dr), Number(dc));
              }}
              onTouchEnd={endSel}
              data-r={r} data-c={c}
            >{cell.letter}</div>
          );
        }))}
      </div>
      <p className="text-purple-400/50 text-xs">Click-drag or swipe to select words · any direction!</p>
    </div>
  );
}
