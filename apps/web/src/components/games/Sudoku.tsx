import React, { useState, useCallback } from "react";

// 4×4 and 9×9 Sudoku with pre-built puzzle sets for kids

const PUZZLES_4: { puzzle: (number|null)[][]; sol: number[][] }[] = [
  { puzzle: [[1,null,null,4],[null,4,1,null],[null,1,4,null],[4,null,null,1]], sol: [[1,2,3,4],[3,4,1,2],[2,1,4,3],[4,3,2,1]] },
  { puzzle: [[null,2,null,4],[4,null,2,null],[null,4,null,2],[2,null,4,null]], sol: [[1,2,3,4],[4,3,2,1],[3,4,1,2],[2,1,4,3]] },
  { puzzle: [[3,null,1,null],[null,1,null,3],[1,null,3,null],[null,3,null,1]], sol: [[3,2,1,4],[4,1,2,3],[1,4,3,2],[2,3,4,1]] },
];

const PUZZLES_9_EASY: { puzzle: (number|null)[][]; sol: number[][] }[] = [
  {
    puzzle: [
      [5,3,null,null,7,null,null,null,null],
      [6,null,null,1,9,5,null,null,null],
      [null,9,8,null,null,null,null,6,null],
      [8,null,null,null,6,null,null,null,3],
      [4,null,null,8,null,3,null,null,1],
      [7,null,null,null,2,null,null,null,6],
      [null,6,null,null,null,null,2,8,null],
      [null,null,null,4,1,9,null,null,5],
      [null,null,null,null,8,null,null,7,9],
    ],
    sol: [
      [5,3,4,6,7,8,9,1,2],[6,7,2,1,9,5,3,4,8],[1,9,8,3,4,2,5,6,7],
      [8,5,9,7,6,1,4,2,3],[4,2,6,8,5,3,7,9,1],[7,1,3,9,2,4,8,5,6],
      [9,6,1,5,3,7,2,8,4],[2,8,7,4,1,9,6,3,5],[3,4,5,2,8,6,1,7,9],
    ],
  },
];

type Mode = "4x4" | "9x9";

export default function Sudoku() {
  const [mode, setMode] = useState<Mode>("4x4");
  const [puzzleIdx, setPuzzleIdx] = useState(0);
  const [sel, setSel] = useState<[number,number] | null>(null);
  const [userGrid, setUserGrid] = useState<(number|null)[][]>(() => PUZZLES_4[0].puzzle.map(r => [...r]));
  const [errors, setErrors] = useState<boolean[][]>(() => Array(4).fill(null).map(() => Array(4).fill(false)));
  const [solved, setSolved] = useState(false);

  const currentPuzzles = mode === "4x4" ? PUZZLES_4 : PUZZLES_9_EASY;
  const size = mode === "4x4" ? 4 : 9;
  const boxSize = mode === "4x4" ? 2 : 3;

  const loadPuzzle = useCallback((m: Mode, idx: number) => {
    const puzzles = m === "4x4" ? PUZZLES_4 : PUZZLES_9_EASY;
    const p = puzzles[idx % puzzles.length];
    setUserGrid(p.puzzle.map(r => [...r]));
    setErrors(Array(p.puzzle.length).fill(null).map(() => Array(p.puzzle[0].length).fill(false)));
    setSel(null); setSolved(false);
  }, []);

  const setMode_ = (m: Mode) => { setMode(m); setPuzzleIdx(0); loadPuzzle(m, 0); };

  const input = (n: number) => {
    if (!sel || solved) return;
    const [r, c] = sel;
    const orig = currentPuzzles[puzzleIdx % currentPuzzles.length].puzzle[r][c];
    if (orig !== null) return; // fixed cell
    const next = userGrid.map(row => [...row]); next[r][c] = n === 0 ? null : n;
    setUserGrid(next);
    // Validate
    const sol = currentPuzzles[puzzleIdx % currentPuzzles.length].sol;
    const errs = next.map((row, ri) => row.map((v, ci) => v !== null && v !== sol[ri][ci]));
    setErrors(errs);
    // Check solve
    if (next.every((row, ri) => row.every((v, ci) => v === sol[ri][ci]))) setSolved(true);
  };

  const hint = () => {
    if (!sel) return;
    const [r, c] = sel;
    const sol = currentPuzzles[puzzleIdx % currentPuzzles.length].sol;
    input(sol[r][c]);
  };

  const CS = mode === "4x4" ? 56 : 36;
  const fixed = (r: number, c: number) => currentPuzzles[puzzleIdx % currentPuzzles.length].puzzle[r][c] !== null;
  const isSel = (r: number, c: number) => sel?.[0] === r && sel?.[1] === c;
  const sameGroup = (r: number, c: number) => sel && (sel[0] === r || sel[1] === c || (Math.floor(r/boxSize) === Math.floor(sel[0]/boxSize) && Math.floor(c/boxSize) === Math.floor(sel[1]/boxSize)));

  return (
    <div className="flex flex-col items-center gap-3 p-3" style={{ background: "#eff6ff" }}>
      {/* Mode + puzzle picker */}
      <div className="flex gap-2 flex-wrap justify-center">
        <button onClick={() => setMode_("4x4")} className={`px-3 py-1.5 rounded-xl text-sm font-bold border-2 ${mode === "4x4" ? "bg-blue-500 text-white border-blue-400" : "bg-white text-blue-600 border-blue-200"}`} style={{ touchAction: "manipulation" }}>🟦 4×4 Easy</button>
        <button onClick={() => setMode_("9x9")} className={`px-3 py-1.5 rounded-xl text-sm font-bold border-2 ${mode === "9x9" ? "bg-blue-500 text-white border-blue-400" : "bg-white text-blue-600 border-blue-200"}`} style={{ touchAction: "manipulation" }}>🟦 9×9 Classic</button>
        {mode === "4x4" && PUZZLES_4.map((_, i) => (
          <button key={i} onClick={() => { setPuzzleIdx(i); loadPuzzle(mode, i); }}
            className={`px-3 py-1.5 rounded-xl text-sm font-bold border-2 ${puzzleIdx === i ? "bg-indigo-500 text-white border-indigo-400" : "bg-white text-indigo-600 border-indigo-200"}`}
            style={{ touchAction: "manipulation" }}>#{i+1}</button>
        ))}
        <button onClick={hint} className="px-3 py-1.5 rounded-xl text-sm font-bold border-2 bg-amber-100 text-amber-700 border-amber-300" style={{ touchAction: "manipulation" }}>💡 Hint</button>
      </div>

      {solved && <p className="text-green-600 font-bold text-lg">🎉 Solved! You're a Sudoku master!</p>}

      {/* Grid */}
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${size}, ${CS}px)`, gap: 2, background: "#bfdbfe", padding: 6, borderRadius: 16 }}>
        {userGrid.map((row, r) => row.map((v, c) => {
          const isFixed = fixed(r, c);
          const isErr = errors[r]?.[c];
          const isSel_ = isSel(r, c);
          const sameGrp = sameGroup(r, c) && !isSel_;
          const borderRight = (c + 1) % boxSize === 0 && c < size - 1 ? "3px solid #1d4ed8" : "1px solid #93c5fd";
          const borderBottom = (r + 1) % boxSize === 0 && r < size - 1 ? "3px solid #1d4ed8" : "1px solid #93c5fd";
          return (
            <div key={`${r}-${c}`}
              onClick={() => setSel([r, c])}
              style={{
                width: CS, height: CS, display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: mode === "4x4" ? 26 : 18, fontWeight: isFixed ? 900 : 600,
                borderRight, borderBottom,
                background: isErr ? "#fca5a5" : isSel_ ? "#818cf8" : sameGrp ? "#dbeafe" : "#fff",
                color: isFixed ? "#1e293b" : isErr ? "#dc2626" : isSel_ ? "#fff" : "#2563eb",
                cursor: isFixed ? "default" : "pointer", userSelect: "none", touchAction: "manipulation",
                transition: "background 0.1s",
              }}
            >{v ?? ""}</div>
          );
        }))}
      </div>

      {/* Number pad */}
      <div className="flex gap-2 flex-wrap justify-center">
        {Array.from({ length: size }, (_, i) => i + 1).map(n => (
          <button key={n} onClick={() => input(n)}
            style={{ width: 44, height: 44, borderRadius: 12, fontSize: 20, fontWeight: 800, background: "#dbeafe", color: "#1d4ed8", border: "2px solid #93c5fd", touchAction: "manipulation" }}>
            {n}
          </button>
        ))}
        <button onClick={() => input(0)} style={{ width: 44, height: 44, borderRadius: 12, fontSize: 16, fontWeight: 800, background: "#fee2e2", color: "#dc2626", border: "2px solid #fca5a5", touchAction: "manipulation" }}>✕</button>
      </div>
      <p className="text-blue-400/50 text-xs">Tap a cell · tap a number · no repeats in any row, column or box</p>
    </div>
  );
}
