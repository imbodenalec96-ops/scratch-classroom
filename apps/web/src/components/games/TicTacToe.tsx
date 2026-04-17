import React, { useState, useEffect } from "react";

type Cell = null | "X" | "O";
const LINES = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];

function winner(b: Cell[]): ["X" | "O", number[]] | null {
  for (const line of LINES) {
    const [a, bb, c] = line;
    if (b[a] && b[a] === b[bb] && b[a] === b[c]) return [b[a] as "X" | "O", line];
  }
  return null;
}

function aiMove(b: Cell[]): number {
  const empties = b.map((v, i) => v ? -1 : i).filter(i => i >= 0);
  if (!empties.length) return -1;
  // Win
  for (const i of empties) { const t = [...b]; t[i] = "O"; if (winner(t)) return i; }
  // Block
  for (const i of empties) { const t = [...b]; t[i] = "X"; if (winner(t)) return i; }
  // Center
  if (b[4] === null) return 4;
  // Opposite corner
  const corners = [[0, 8], [2, 6], [6, 2], [8, 0]];
  for (const [mine, opp] of corners) { if (b[opp] === "X" && b[mine] === null) return mine; }
  // Random corner
  const freeCorners = [0, 2, 6, 8].filter(i => !b[i]);
  if (freeCorners.length) return freeCorners[Math.floor(Math.random() * freeCorners.length)];
  // Any
  return empties[Math.floor(Math.random() * empties.length)];
}

const PASTEL = { X: { bg: "#ede9fe", border: "#7c3aed", text: "#6d28d9" }, O: { bg: "#fce7f3", border: "#db2777", text: "#be185d" } };

export default function TicTacToe() {
  const [board, setBoard] = useState<Cell[]>(Array(9).fill(null));
  const [thinking, setThinking] = useState(false);
  const [scores, setScores] = useState({ X: 0, O: 0, ties: 0 });
  const [message, setMessage] = useState("Your turn! You're X.");

  const won = winner(board);
  const full = board.every(Boolean);

  const reset = (b = Array(9).fill(null)) => { setBoard(b); setMessage("Your turn! You're X."); };

  const play = (i: number) => {
    if (board[i] || won || thinking) return;
    const next = [...board]; next[i] = "X";
    const w = winner(next);
    if (w) { setBoard(next); setScores(s => ({ ...s, X: s.X + 1 })); setMessage("You win! 🎉"); return; }
    if (next.every(Boolean)) { setBoard(next); setScores(s => ({ ...s, ties: s.ties + 1 })); setMessage("It's a tie! 🤝"); return; }
    setBoard(next); setThinking(true); setMessage("Thinking…");
  };

  useEffect(() => {
    if (!thinking) return;
    const t = setTimeout(() => {
      setBoard(prev => {
        const move = aiMove(prev);
        if (move === -1) return prev;
        const next = [...prev]; next[move] = "O";
        const w = winner(next);
        if (w) { setScores(s => ({ ...s, O: s.O + 1 })); setMessage("AI wins! 🤖"); }
        else if (next.every(Boolean)) { setScores(s => ({ ...s, ties: s.ties + 1 })); setMessage("It's a tie! 🤝"); }
        else setMessage("Your turn!");
        return next;
      });
      setThinking(false);
    }, 350);
    return () => clearTimeout(t);
  }, [thinking]);

  return (
    <div className="flex flex-col items-center gap-4 p-6 min-h-full" style={{ background: "#fdf4ff" }}>
      {/* Score bar */}
      <div className="flex gap-4 text-sm font-bold">
        {[["You (X)", scores.X, "#7c3aed"], ["Ties", scores.ties, "#64748b"], ["AI (O)", scores.O, "#be185d"]].map(([label, val, color]) => (
          <div key={label as string} className="text-center px-3 py-2 rounded-xl bg-white border border-purple-100 min-w-[70px]">
            <div className="text-[11px]" style={{ color: color as string }}>{label}</div>
            <div className="text-xl" style={{ color: color as string }}>{val as number}</div>
          </div>
        ))}
      </div>

      <p className="text-purple-700 font-semibold text-base">{message}</p>

      {/* Board */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10, padding: 12, background: "#e9d5ff", borderRadius: 24 }}>
        {board.map((cell, i) => {
          const isWinCell = won ? won[1].includes(i) : false;
          const style = cell ? PASTEL[cell] : { bg: "#fff", border: "#d8b4fe", text: "#000" };
          return (
            <button
              key={i}
              onClick={() => play(i)}
              style={{
                width: 88, height: 88, borderRadius: 16, fontSize: 40, fontWeight: 900,
                background: isWinCell ? (cell === "X" ? "#7c3aed" : "#db2777") : style.bg,
                border: `3px solid ${style.border}`,
                color: isWinCell ? "#fff" : style.text,
                cursor: cell || won ? "default" : "pointer",
                transform: isWinCell ? "scale(1.08)" : "scale(1)",
                transition: "all 0.15s ease",
                touchAction: "manipulation",
              }}
            >
              {cell}
            </button>
          );
        })}
      </div>

      {(won || full) && (
        <button
          onClick={() => reset()}
          className="bg-purple-500 hover:bg-purple-400 text-white px-8 py-3 rounded-2xl font-bold text-base"
          style={{ touchAction: "manipulation" }}
        >
          Play Again
        </button>
      )}
      <p className="text-purple-400/50 text-xs">Click or tap a square to play</p>
    </div>
  );
}
