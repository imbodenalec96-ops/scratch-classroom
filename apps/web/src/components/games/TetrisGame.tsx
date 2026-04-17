import React, { useEffect, useRef, useState, useCallback } from "react";

const COLS = 10, ROWS = 20, CS = 26;
const COLORS = ["", "#67e8f9", "#fde68a", "#d8b4fe", "#86efac", "#fca5a5", "#93c5fd", "#fdba74"];
const SCORES_PER_LINES = [0, 100, 300, 500, 800];

const SHAPES: number[][][] = [
  [[1, 1, 1, 1]],
  [[2, 2], [2, 2]],
  [[0, 3, 0], [3, 3, 3]],
  [[0, 4, 4], [4, 4, 0]],
  [[5, 5, 0], [0, 5, 5]],
  [[6, 0, 0], [6, 6, 6]],
  [[0, 0, 7], [7, 7, 7]],
];

function rotate90(shape: number[][]): number[][] {
  return shape[0].map((_, c) => shape.map(r => r[c]).reverse());
}
function emptyBoard(): number[][] {
  return Array.from({ length: ROWS }, () => Array(COLS).fill(0));
}
function randPiece() {
  const shape = SHAPES[Math.floor(Math.random() * SHAPES.length)];
  return { shape, x: Math.floor((COLS - shape[0].length) / 2), y: 0 };
}
function valid(board: number[][], piece: { shape: number[][]; x: number; y: number }) {
  return piece.shape.every((row, r) =>
    row.every((v, c) => {
      if (!v) return true;
      const nx = piece.x + c, ny = piece.y + r;
      return nx >= 0 && nx < COLS && ny < ROWS && (ny < 0 || !board[ny][nx]);
    })
  );
}
function lock(board: number[][], piece: { shape: number[][]; x: number; y: number }): number[][] {
  const b = board.map(r => [...r]);
  piece.shape.forEach((row, r) => row.forEach((v, c) => { if (v) b[piece.y + r][piece.x + c] = v; }));
  return b;
}
function clearLines(board: number[][]): [number[][], number] {
  const kept = board.filter(row => row.some(v => v === 0));
  const n = ROWS - kept.length;
  return [[...Array(n).fill(null).map(() => Array(COLS).fill(0)), ...kept], n];
}

type State = {
  board: number[][]; piece: { shape: number[][]; x: number; y: number };
  next: { shape: number[][]; x: number; y: number };
  score: number; lines: number; level: number; over: boolean; lastDrop: number;
};

export default function TetrisGame() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const st = useRef<State>({
    board: emptyBoard(), piece: randPiece(), next: randPiece(),
    score: 0, lines: 0, level: 1, over: false, lastDrop: 0,
  });
  const [ui, setUi] = useState({ score: 0, lines: 0, level: 1, over: false });
  const raf = useRef(0);

  const draw = useCallback(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    const s = st.current;
    ctx.fillStyle = "#0f172a"; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = "#ffffff08"; ctx.lineWidth = 0.5;
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) ctx.strokeRect(c * CS, r * CS, CS, CS);

    // Board cells
    s.board.forEach((row, r) => row.forEach((v, c) => {
      if (!v) return;
      ctx.fillStyle = COLORS[v]; ctx.fillRect(c * CS + 1, r * CS + 1, CS - 2, CS - 2);
      ctx.fillStyle = "#ffffff30"; ctx.fillRect(c * CS + 1, r * CS + 1, CS - 2, 4);
    }));

    // Ghost
    let ghost = { ...s.piece };
    while (valid(s.board, { ...ghost, y: ghost.y + 1 })) ghost.y++;
    ghost.shape.forEach((row, r) => row.forEach((v, c) => {
      if (!v) return;
      ctx.fillStyle = COLORS[v] + "35";
      ctx.fillRect((ghost.x + c) * CS + 1, (ghost.y + r) * CS + 1, CS - 2, CS - 2);
    }));

    // Active piece
    s.piece.shape.forEach((row, r) => row.forEach((v, c) => {
      if (!v || s.piece.y + r < 0) return;
      ctx.fillStyle = COLORS[v]; ctx.fillRect((s.piece.x + c) * CS + 1, (s.piece.y + r) * CS + 1, CS - 2, CS - 2);
      ctx.fillStyle = "#ffffff40"; ctx.fillRect((s.piece.x + c) * CS + 1, (s.piece.y + r) * CS + 1, CS - 2, 4);
    }));
  }, []);

  const tick = useCallback((ts: number) => {
    const s = st.current;
    if (!s.over) {
      const interval = Math.max(80, 800 - (s.level - 1) * 70);
      if (ts - s.lastDrop > interval) {
        s.lastDrop = ts;
        const moved = { ...s.piece, y: s.piece.y + 1 };
        if (valid(s.board, moved)) {
          s.piece = moved;
        } else {
          s.board = lock(s.board, s.piece);
          const [nb, cleared] = clearLines(s.board);
          s.board = nb; s.score += SCORES_PER_LINES[cleared] * s.level;
          s.lines += cleared; s.level = Math.floor(s.lines / 10) + 1;
          s.piece = s.next; s.next = randPiece();
          if (!valid(s.board, s.piece)) s.over = true;
          setUi({ score: s.score, lines: s.lines, level: s.level, over: s.over });
        }
      }
    }
    draw();
    raf.current = requestAnimationFrame(tick);
  }, [draw]);

  useEffect(() => { raf.current = requestAnimationFrame(tick); return () => cancelAnimationFrame(raf.current); }, [tick]);

  const tryMove = useCallback((dx: number) => {
    const s = st.current; if (s.over) return;
    const m = { ...s.piece, x: s.piece.x + dx };
    if (valid(s.board, m)) s.piece = m;
  }, []);

  const tryRotate = useCallback(() => {
    const s = st.current; if (s.over) return;
    const r = { ...s.piece, shape: rotate90(s.piece.shape) };
    for (const kx of [0, 1, -1, 2, -2]) {
      const k = { ...r, x: r.x + kx };
      if (valid(s.board, k)) { s.piece = k; return; }
    }
  }, []);

  const softDrop = useCallback(() => {
    const s = st.current; if (s.over) return;
    const m = { ...s.piece, y: s.piece.y + 1 };
    if (valid(s.board, m)) { s.piece = m; s.score += 1; }
  }, []);

  const hardDrop = useCallback(() => {
    const s = st.current; if (s.over) return;
    while (valid(s.board, { ...s.piece, y: s.piece.y + 1 })) { s.piece.y++; s.score += 2; }
    s.lastDrop = 0;
  }, []);

  const restart = useCallback(() => {
    const s = st.current;
    Object.assign(s, { board: emptyBoard(), piece: randPiece(), next: randPiece(), score: 0, lines: 0, level: 1, over: false, lastDrop: 0 });
    setUi({ score: 0, lines: 0, level: 1, over: false });
  }, []);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (["ArrowLeft","ArrowRight","ArrowUp","ArrowDown"," "].includes(e.key)) e.preventDefault();
      if (e.key === "ArrowLeft" || e.key === "a") tryMove(-1);
      else if (e.key === "ArrowRight" || e.key === "d") tryMove(1);
      else if (e.key === "ArrowUp" || e.key === "w" || e.key === "x") tryRotate();
      else if (e.key === "ArrowDown" || e.key === "s") softDrop();
      else if (e.key === " ") hardDrop();
      else if (e.key === "r" || e.key === "R") restart();
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [tryMove, tryRotate, softDrop, hardDrop, restart]);

  const touch = useRef<{ x: number; y: number } | null>(null);
  const onTouchStart = (e: React.TouchEvent) => { touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }; };
  const onTouchEnd = (e: React.TouchEvent) => {
    if (!touch.current) return;
    const dx = e.changedTouches[0].clientX - touch.current.x;
    const dy = e.changedTouches[0].clientY - touch.current.y;
    touch.current = null;
    if (Math.abs(dx) < 12 && Math.abs(dy) < 12) { tryRotate(); return; }
    if (Math.abs(dx) > Math.abs(dy)) tryMove(dx < 0 ? -1 : 1);
    else if (dy > 20) softDrop();
    else if (dy < -30) hardDrop();
  };

  const Btn = ({ label, onClick }: { label: string; onClick: () => void }) => (
    <button onClick={onClick} className="bg-white/10 border border-white/20 rounded-xl px-4 py-3 text-white text-base font-bold active:bg-white/20 select-none" style={{ touchAction: "manipulation" }}>
      {label}
    </button>
  );

  return (
    <div className="flex flex-col items-center gap-3 p-3 min-h-full" style={{ background: "#0f172a" }}>
      <div className="flex gap-6 text-sm text-white/70">
        <span>Score <b className="text-white">{ui.score}</b></span>
        <span>Lines <b className="text-white">{ui.lines}</b></span>
        <span>Level <b className="text-white">{ui.level}</b></span>
      </div>

      <canvas ref={canvasRef} width={COLS * CS} height={ROWS * CS} className="rounded-xl border border-white/10"
        onTouchStart={onTouchStart} onTouchEnd={onTouchEnd} style={{ touchAction: "none" }} />

      {ui.over && (
        <div className="text-center space-y-1">
          <p className="text-red-400 text-xl font-bold">Game Over!</p>
          <p className="text-white/50 text-sm">Score: {ui.score}</p>
          <button onClick={restart} className="bg-purple-500 hover:bg-purple-400 text-white px-6 py-2 rounded-xl font-bold">Play Again</button>
        </div>
      )}

      <div className="flex flex-col gap-2">
        <div className="flex justify-center"><Btn label="🔄 Rotate" onClick={tryRotate} /></div>
        <div className="flex gap-2 justify-center">
          <Btn label="◀" onClick={() => tryMove(-1)} />
          <Btn label="▼" onClick={softDrop} />
          <Btn label="▶" onClick={() => tryMove(1)} />
        </div>
        <div className="flex gap-2 justify-center">
          <Btn label="⬇ Drop" onClick={hardDrop} />
          <Btn label="🔁 Restart" onClick={restart} />
        </div>
      </div>
      <p className="text-white/25 text-xs">← → move · ↑ rotate · ↓ soft drop · Space = hard drop</p>
    </div>
  );
}
