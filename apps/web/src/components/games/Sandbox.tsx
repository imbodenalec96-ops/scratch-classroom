import React, { useState, useCallback, useEffect, useRef } from "react";

/**
 * Sandbox — a simple 2D creative grid builder.
 * Pure-client, no backend. Grid state persists per student via localStorage.
 * Works on Chromebook (mouse + keyboard) and iPad (touch).
 */

type Tile = { id: string; emoji: string; label: string; bg: string };

const TILES: Tile[] = [
  { id: "grass", emoji: "🌱", label: "Grass",   bg: "#86efac" },
  { id: "water", emoji: "💧", label: "Water",   bg: "#7dd3fc" },
  { id: "sand",  emoji: "🏖️", label: "Sand",    bg: "#fde68a" },
  { id: "stone", emoji: "🪨", label: "Stone",   bg: "#9ca3af" },
  { id: "wood",  emoji: "🪵", label: "Wood",    bg: "#b45309" },
  { id: "tree",  emoji: "🌳", label: "Tree",    bg: "#16a34a" },
  { id: "flower",emoji: "🌸", label: "Flower",  bg: "#fda4af" },
  { id: "crop",  emoji: "🌾", label: "Crops",   bg: "#fbbf24" },
  { id: "rail",  emoji: "🚂", label: "Train",   bg: "#64748b" },
  { id: "house", emoji: "🏠", label: "House",   bg: "#fbcfe8" },
  { id: "castle",emoji: "🏰", label: "Castle",  bg: "#c4b5fd" },
  { id: "mount", emoji: "⛰️", label: "Mountain",bg: "#78716c" },
  { id: "volcano",emoji:"🌋", label: "Volcano", bg: "#fca5a5" },
  { id: "tent",  emoji: "⛺", label: "Tent",    bg: "#f97316" },
  { id: "fire",  emoji: "🔥", label: "Fire",    bg: "#f87171" },
  { id: "star",  emoji: "⭐", label: "Star",    bg: "#fde047" },
  { id: "dog",   emoji: "🐕", label: "Dog",     bg: "#fed7aa" },
  { id: "cat",   emoji: "🐈", label: "Cat",     bg: "#fbcfe8" },
  { id: "fish",  emoji: "🐟", label: "Fish",    bg: "#67e8f9" },
  { id: "bird",  emoji: "🐦", label: "Bird",    bg: "#a5b4fc" },
  { id: "knight",emoji: "🤺", label: "Knight",  bg: "#d1d5db" },
  { id: "ghost", emoji: "👻", label: "Ghost",   bg: "#e0e7ff" },
  { id: "heart", emoji: "💖", label: "Heart",   bg: "#fda4af" },
  { id: "gem",   emoji: "💎", label: "Gem",     bg: "#67e8f9" },
];

const GRID_W = 20;
const GRID_H = 14;
const STORAGE_KEY = "sandbox_world_v1";

const BACKGROUNDS = [
  { id: "day",   label: "☀️ Day",    bg: "linear-gradient(180deg, #87ceeb 0%, #b0e0ff 40%, #fef3c7 100%)" },
  { id: "dusk",  label: "🌇 Dusk",   bg: "linear-gradient(180deg, #fb923c 0%, #f472b6 50%, #7c3aed 100%)" },
  { id: "night", label: "🌙 Night",  bg: "linear-gradient(180deg, #1e1b4b 0%, #312e81 60%, #4c1d95 100%)" },
  { id: "rain",  label: "🌧️ Rainy",  bg: "linear-gradient(180deg, #64748b 0%, #94a3b8 100%)" },
];

type Cell = string | null;

export default function Sandbox() {
  const [grid, setGrid] = useState<Cell[][]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) return JSON.parse(saved);
    } catch {}
    return Array.from({ length: GRID_H }, () => Array.from({ length: GRID_W }, () => null as Cell));
  });
  const [selectedTile, setSelectedTile] = useState<string>("grass");
  const [eraser, setEraser] = useState(false);
  const [bg, setBg] = useState<string>(() => localStorage.getItem("sandbox_bg") || "day");
  const [painting, setPainting] = useState(false);
  const gridRef = useRef<HTMLDivElement>(null);

  // Persist on change
  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(grid)); } catch {}
  }, [grid]);
  useEffect(() => {
    try { localStorage.setItem("sandbox_bg", bg); } catch {}
  }, [bg]);

  const paint = useCallback((r: number, c: number) => {
    setGrid(g => {
      if (r < 0 || r >= GRID_H || c < 0 || c >= GRID_W) return g;
      const next = g.map(row => row.slice());
      next[r][c] = eraser ? null : selectedTile;
      return next;
    });
  }, [selectedTile, eraser]);

  const clearAll = () => {
    if (!confirm("Clear your whole world?")) return;
    setGrid(Array.from({ length: GRID_H }, () => Array.from({ length: GRID_W }, () => null as Cell)));
  };

  const randomize = () => {
    const tileIds = TILES.map(t => t.id);
    setGrid(Array.from({ length: GRID_H }, () =>
      Array.from({ length: GRID_W }, () =>
        Math.random() < 0.35 ? tileIds[Math.floor(Math.random() * tileIds.length)] : null as Cell
      )
    ));
  };

  // Touch support — track which cell is under the finger
  const handleTouch = (e: React.TouchEvent) => {
    const t = e.touches[0];
    if (!t) return;
    const el = document.elementFromPoint(t.clientX, t.clientY) as HTMLElement | null;
    const r = Number(el?.dataset?.r); const c = Number(el?.dataset?.c);
    if (!isNaN(r) && !isNaN(c)) paint(r, c);
  };

  const activeTile = TILES.find(t => t.id === selectedTile);
  const bgData = BACKGROUNDS.find(b => b.id === bg) || BACKGROUNDS[0];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, padding: 10, width: "100%" }}>
      {/* Toolbar */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "#e2e8f0" }}>
          🏗️ Sandbox
        </div>
        <button onClick={() => setEraser(false)}
          style={{
            padding: "6px 12px", borderRadius: 8, fontSize: 12, fontWeight: 700,
            background: !eraser ? "rgba(139,92,246,0.3)" : "rgba(255,255,255,0.05)",
            color: !eraser ? "#a78bfa" : "rgba(255,255,255,0.5)",
            border: "1px solid " + (!eraser ? "rgba(139,92,246,0.4)" : "rgba(255,255,255,0.08)"),
            cursor: "pointer", touchAction: "manipulation",
          }}>✏️ Paint</button>
        <button onClick={() => setEraser(true)}
          style={{
            padding: "6px 12px", borderRadius: 8, fontSize: 12, fontWeight: 700,
            background: eraser ? "rgba(239,68,68,0.25)" : "rgba(255,255,255,0.05)",
            color: eraser ? "#fca5a5" : "rgba(255,255,255,0.5)",
            border: "1px solid " + (eraser ? "rgba(239,68,68,0.4)" : "rgba(255,255,255,0.08)"),
            cursor: "pointer", touchAction: "manipulation",
          }}>🧹 Erase</button>
        <select value={bg} onChange={e => setBg(e.target.value)}
          style={{
            padding: "6px 10px", borderRadius: 8, fontSize: 12, fontWeight: 600,
            background: "rgba(255,255,255,0.05)", color: "#e2e8f0",
            border: "1px solid rgba(255,255,255,0.08)", cursor: "pointer",
          }}>
          {BACKGROUNDS.map(b => <option key={b.id} value={b.id}>{b.label}</option>)}
        </select>
        <button onClick={randomize}
          style={{ padding: "6px 12px", borderRadius: 8, fontSize: 12, fontWeight: 700,
            background: "rgba(16,185,129,0.15)", color: "#6ee7b7",
            border: "1px solid rgba(16,185,129,0.3)", cursor: "pointer", touchAction: "manipulation" }}>
          🎲 Random
        </button>
        <button onClick={clearAll}
          style={{ padding: "6px 12px", borderRadius: 8, fontSize: 12, fontWeight: 700,
            background: "rgba(239,68,68,0.15)", color: "#fca5a5",
            border: "1px solid rgba(239,68,68,0.3)", cursor: "pointer", touchAction: "manipulation" }}>
          🗑️ Clear
        </button>
        <div style={{ marginLeft: "auto", fontSize: 11, color: "rgba(255,255,255,0.4)" }}>
          Auto-saves to your device
        </div>
      </div>

      {/* Tile palette */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(42px, 1fr))",
        gap: 4, padding: 6,
        background: "rgba(255,255,255,0.03)",
        borderRadius: 10,
        border: "1px solid rgba(255,255,255,0.05)",
      }}>
        {TILES.map(t => (
          <button key={t.id} onClick={() => { setSelectedTile(t.id); setEraser(false); }}
            title={t.label}
            style={{
              width: "100%", aspectRatio: "1",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 22,
              background: selectedTile === t.id && !eraser ? t.bg : "rgba(255,255,255,0.04)",
              border: selectedTile === t.id && !eraser
                ? "2px solid #7c3aed"
                : "2px solid transparent",
              borderRadius: 6, cursor: "pointer",
              transition: "all 0.1s",
              touchAction: "manipulation",
            }}>
            {t.emoji}
          </button>
        ))}
      </div>

      {/* Grid */}
      <div
        ref={gridRef}
        onMouseDown={() => setPainting(true)}
        onMouseUp={() => setPainting(false)}
        onMouseLeave={() => setPainting(false)}
        onTouchStart={e => { e.preventDefault(); handleTouch(e); }}
        onTouchMove={e => { e.preventDefault(); handleTouch(e); }}
        style={{
          display: "grid",
          gridTemplateColumns: `repeat(${GRID_W}, 1fr)`,
          gap: 1,
          padding: 4,
          background: bgData.bg,
          borderRadius: 12,
          border: "2px solid rgba(255,255,255,0.08)",
          boxShadow: "inset 0 0 20px rgba(0,0,0,0.15)",
          aspectRatio: `${GRID_W} / ${GRID_H}`,
          touchAction: "none",
          userSelect: "none",
        }}>
        {grid.map((row, r) => row.map((cell, c) => {
          const tile = cell ? TILES.find(t => t.id === cell) : null;
          return (
            <div
              key={`${r}-${c}`}
              data-r={r} data-c={c}
              onMouseDown={() => paint(r, c)}
              onMouseEnter={() => { if (painting) paint(r, c); }}
              style={{
                background: tile ? tile.bg : "rgba(255,255,255,0.06)",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: "min(2.2vw, 20px)",
                borderRadius: 3,
                cursor: "pointer",
                transition: "background 0.08s",
              }}>
              {tile?.emoji}
            </div>
          );
        }))}
      </div>

      {/* Footer hint */}
      <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", textAlign: "center" }}>
        Click a tile then click the grid to place · Drag to paint a row ·
        {activeTile && !eraser ? ` Painting with ${activeTile.emoji} ${activeTile.label}` : ""}
        {eraser ? " Eraser mode" : ""}
      </div>
    </div>
  );
}
