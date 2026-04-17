import React, { useState, useEffect } from "react";

const COLS = 7, ROWS = 6;
type Cell = null | "R" | "Y";
type Board = Cell[][];

function emptyBoard(): Board { return Array.from({ length: ROWS }, () => Array(COLS).fill(null)); }

function drop(board: Board, col: number, player: Cell): Board | null {
  const b = board.map(r => [...r]) as Board;
  for (let r = ROWS - 1; r >= 0; r--) { if (!b[r][col]) { b[r][col] = player; return b; } }
  return null; // column full
}

function canDrop(board: Board, col: number) { return !board[0][col]; }

function checkWin(board: Board, player: Cell): [number, number][] | null {
  const dirs = [[0,1],[1,0],[1,1],[1,-1]];
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    if (board[r][c] !== player) continue;
    for (const [dr, dc] of dirs) {
      const cells: [number,number][] = [[r,c]];
      for (let k = 1; k < 4; k++) { const nr = r+dr*k, nc = c+dc*k; if (nr<0||nr>=ROWS||nc<0||nc>=COLS||board[nr][nc]!==player) break; cells.push([nr,nc]); }
      if (cells.length === 4) return cells;
    }
  }
  return null;
}

function score4(board: Board, col: number, player: Cell): number {
  const b = drop(board, col, player); if (!b) return -999;
  if (checkWin(b, player)) return 1000;
  // Prefer center
  return Math.abs(col - 3) === 0 ? 3 : Math.abs(col - 3) === 1 ? 2 : 1;
}

function aiMove(board: Board): number {
  // Win
  for (let c = 0; c < COLS; c++) { if (canDrop(board, c) && drop(board, c, "Y") && checkWin(drop(board, c, "Y")!, "Y")) return c; }
  // Block player win
  for (let c = 0; c < COLS; c++) { if (canDrop(board, c) && drop(board, c, "R") && checkWin(drop(board, c, "R")!, "R")) return c; }
  // Best heuristic
  const cols = [3, 2, 4, 1, 5, 0, 6].filter(c => canDrop(board, c));
  return cols.reduce((best, c) => score4(board, c, "Y") >= score4(board, best, "Y") ? c : best, cols[0] ?? 3);
}

export default function ConnectFour() {
  const [board, setBoard] = useState<Board>(emptyBoard());
  const [thinking, setThinking] = useState(false);
  const [winCells, setWinCells] = useState<[number,number][] | null>(null);
  const [message, setMessage] = useState("Your turn! Drop a 🔴 token.");
  const [scores, setScores] = useState({ R: 0, Y: 0 });
  const [over, setOver] = useState(false);
  const [hover, setHover] = useState<number | null>(null);

  const playerPlay = (col: number) => {
    if (thinking || over || !canDrop(board, col)) return;
    const next = drop(board, col, "R"); if (!next) return;
    const w = checkWin(next, "R");
    if (w) { setBoard(next); setWinCells(w); setScores(s => ({ ...s, R: s.R + 1 })); setMessage("You win! 🎉🔴"); setOver(true); return; }
    if (next.every(row => row.every(Boolean))) { setBoard(next); setMessage("It's a draw! 🤝"); setOver(true); return; }
    setBoard(next); setThinking(true); setMessage("AI is thinking…");
  };

  useEffect(() => {
    if (!thinking) return;
    const t = setTimeout(() => {
      setBoard(prev => {
        const col = aiMove(prev);
        const next = drop(prev, col, "Y"); if (!next) return prev;
        const w = checkWin(next, "Y");
        if (w) { setWinCells(w); setScores(s => ({ ...s, Y: s.Y + 1 })); setMessage("AI wins! 🤖🟡"); setOver(true); }
        else if (next.every(row => row.every(Boolean))) { setMessage("It's a draw! 🤝"); setOver(true); }
        else setMessage("Your turn! Drop a 🔴 token.");
        return next;
      });
      setThinking(false);
    }, 400);
    return () => clearTimeout(t);
  }, [thinking]);

  const restart = () => { setBoard(emptyBoard()); setWinCells(null); setOver(false); setMessage("Your turn! Drop a 🔴 token."); };

  const isWin = (r: number, c: number) => winCells?.some(([wr, wc]) => wr === r && wc === c) ?? false;

  return (
    <div className="flex flex-col items-center gap-3 p-4 min-h-full" style={{ background: "#eff6ff" }}>
      {/* Scores */}
      <div className="flex gap-4 text-sm font-bold">
        {[["🔴 You", scores.R, "#dc2626"], ["🟡 AI", scores.Y, "#ca8a04"]].map(([label, val, color]) => (
          <div key={label as string} className="text-center px-4 py-2 rounded-xl bg-white border border-blue-100 min-w-[80px]">
            <div className="text-sm">{label as string}</div>
            <div className="text-xl font-bold" style={{ color: color as string }}>{val as number}</div>
          </div>
        ))}
      </div>
      <p className="text-blue-700 font-semibold text-sm">{message}</p>

      {/* Drop buttons */}
      <div style={{ display: "flex", gap: 6 }}>
        {Array.from({ length: COLS }, (_, c) => (
          <button
            key={c}
            onClick={() => playerPlay(c)}
            onMouseEnter={() => setHover(c)}
            onMouseLeave={() => setHover(null)}
            style={{
              width: 44, height: 32, borderRadius: 8, fontSize: 18,
              background: hover === c && !over ? "#dbeafe" : "transparent",
              border: "none", cursor: over || !canDrop(board, c) ? "default" : "pointer",
              transition: "background 0.15s ease", touchAction: "manipulation",
              opacity: !canDrop(board, c) ? 0.3 : 1,
            }}
          >
            {hover === c && !over && canDrop(board, c) ? "🔴" : "▼"}
          </button>
        ))}
      </div>

      {/* Board */}
      <div style={{ background: "#1e40af", borderRadius: 20, padding: 10, display: "flex", flexDirection: "column", gap: 6 }}>
        {board.map((row, r) => (
          <div key={r} style={{ display: "flex", gap: 6 }}>
            {row.map((cell, c) => {
              const win = isWin(r, c);
              return (
                <div
                  key={c}
                  onClick={() => playerPlay(c)}
                  style={{
                    width: 44, height: 44, borderRadius: "50%",
                    background: cell === "R" ? "#ef4444" : cell === "Y" ? "#eab308" : "#1d4ed8",
                    border: win ? "3px solid #fff" : cell ? "3px solid transparent" : "3px solid #1e3a8a",
                    boxShadow: win ? "0 0 12px #fff" : cell ? "inset 0 3px 6px rgba(0,0,0,0.3)" : "inset 0 3px 8px rgba(0,0,0,0.5)",
                    cursor: !cell && !over ? "pointer" : "default",
                    transform: win ? "scale(1.1)" : "scale(1)",
                    transition: "all 0.12s ease", touchAction: "manipulation",
                  }}
                />
              );
            })}
          </div>
        ))}
      </div>

      {over && (
        <button onClick={restart} className="bg-blue-500 hover:bg-blue-400 text-white px-8 py-3 rounded-2xl font-bold" style={{ touchAction: "manipulation" }}>
          Play Again
        </button>
      )}
      <p className="text-blue-400/50 text-xs">Click a column to drop your token · 4 in a row wins!</p>
    </div>
  );
}
