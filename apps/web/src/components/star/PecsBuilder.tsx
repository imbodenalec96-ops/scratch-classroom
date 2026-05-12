// PECS Card Builder — pick symbols (or write your own), build a card
// list, print as cut-out grid on cardstock. Default sheet is 3×5 (15
// cards/page) at ~2"×2" — standard PECS size for taping onto a board.

import { useMemo, useState } from "react";
import {
  SYMBOLS, CATEGORY_LABELS, searchSymbols, findSymbolById,
  type Symbol, type SymbolCategory,
} from "../../lib/star/symbols.ts";
import { successBeep, loggedBeep } from "../../lib/star/sounds.ts";

interface Card {
  id: string;
  label: string;
  emoji: string;
  borderColor: string;   // visual category color
}

const CATEGORY_COLORS: Record<SymbolCategory, string> = {
  actions:  "#3b82f6",   // blue — verbs (Fitzgerald color key)
  core:     "#a855f7",   // violet
  food:     "#ef4444",   // red — nouns: food
  drink:    "#06b6d4",   // cyan — nouns: drinks
  places:   "#f59e0b",   // amber — places
  people:   "#eab308",   // yellow — people (Fitzgerald: yellow for people)
  feelings: "#ec4899",   // pink — feelings
  time:     "#14b8a6",   // teal
  school:   "#8b5cf6",   // purple
  "yes-no": "#10b981",   // green — affirmations
};

const CARDS_PER_PAGE_OPTIONS = [
  { value: 12, label: "12 / page (large, ~2.5\")" },
  { value: 15, label: "15 / page (standard 2\")" },
  { value: 20, label: "20 / page (compact)" },
  { value: 30, label: "30 / page (mini, 1.5\")" },
] as const;

export default function PecsBuilder() {
  const [cards, setCards] = useState<Card[]>([]);
  const [query, setQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState<SymbolCategory | "all">("all");
  const [cardsPerPage, setCardsPerPage] = useState<number>(15);
  // Custom-card composer
  const [customLabel, setCustomLabel] = useState("");
  const [customEmoji, setCustomEmoji] = useState("");

  const visibleSymbols = useMemo(() => {
    let pool: Symbol[] = query ? searchSymbols(query) : SYMBOLS;
    if (activeCategory !== "all") pool = pool.filter((s) => s.category === activeCategory);
    return pool;
  }, [query, activeCategory]);

  const addSymbol = (s: Symbol) => {
    setCards((cur) => [...cur, {
      id: `c-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      label: s.label, emoji: s.emoji, borderColor: CATEGORY_COLORS[s.category],
    }]);
    successBeep();
  };
  const addCustom = () => {
    const label = customLabel.trim();
    const emoji = customEmoji.trim() || "🟦";
    if (!label) return;
    setCards((cur) => [...cur, {
      id: `c-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      label, emoji, borderColor: "#6b7280",
    }]);
    setCustomLabel("");
    setCustomEmoji("");
    successBeep();
  };
  const removeCard = (id: string) => setCards((cur) => cur.filter((c) => c.id !== id));
  const moveCard = (id: string, dir: -1 | 1) => {
    setCards((cur) => {
      const i = cur.findIndex((c) => c.id === id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= cur.length) return cur;
      const next = cur.slice();
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  };
  const clearAll = () => {
    if (cards.length > 0 && !window.confirm(`Clear all ${cards.length} cards?`)) return;
    setCards([]);
  };
  const seedStarter = () => {
    // Adds a useful starter set: I want / more / break / yes / no /
    // bathroom / drink / snack — covers most beginner PECS phase 1+2.
    const ids = ["want", "more", "all-done", "yes", "no", "bathroom", "drink", "snack", "help", "i-feel", "happy", "sad"];
    const fresh: Card[] = ids.map((id) => {
      const s = findSymbolById(id)!;
      return { id: `c-${Date.now()}-${id}`, label: s.label, emoji: s.emoji, borderColor: CATEGORY_COLORS[s.category] };
    });
    setCards((cur) => [...cur, ...fresh]);
  };

  const print = () => {
    if (cards.length === 0) return;
    openPecsPrintWindow(cards, cardsPerPage);
    loggedBeep();
  };

  const sheets = Math.max(1, Math.ceil(cards.length / cardsPerPage));

  return (
    <div style={{ color: "#f5f1e8" }}>
      {/* Top controls */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 10, marginBottom: 12 }}>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="🔍 Search 74 symbols (e.g. 'potty', 'hungry', 'help')"
          style={{ ...inp(), fontSize: 14 }}
        />
        <select value={cardsPerPage} onChange={(e) => setCardsPerPage(Number(e.target.value))} style={inp()}>
          {CARDS_PER_PAGE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>

      {/* Category chips */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
        <Chip label="All" active={activeCategory === "all"} color="#a855f7" onClick={() => setActiveCategory("all")} />
        {(Object.keys(CATEGORY_LABELS) as SymbolCategory[]).map((c) => (
          <Chip key={c} label={CATEGORY_LABELS[c]} active={activeCategory === c} color={CATEGORY_COLORS[c]} onClick={() => setActiveCategory(c)} />
        ))}
      </div>

      {/* Symbol grid */}
      <div style={{
        display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(94px, 1fr))",
        gap: 6, marginBottom: 14, maxHeight: 280, overflow: "auto",
        padding: 8, borderRadius: 12, background: "rgba(0,0,0,0.20)",
        border: "1px solid rgba(168,85,247,0.20)",
      }}>
        {visibleSymbols.map((s) => (
          <button
            key={s.id}
            onClick={() => addSymbol(s)}
            title={`Add "${s.label}"`}
            style={{
              padding: "8px 6px", borderRadius: 8,
              background: "rgba(168,85,247,0.06)",
              border: `1px solid ${CATEGORY_COLORS[s.category]}55`,
              cursor: "pointer", color: "#fce7f3",
              display: "flex", flexDirection: "column", alignItems: "center", gap: 4,
              touchAction: "manipulation",
            }}
          >
            <span style={{ fontSize: 28, lineHeight: 1 }}>{s.emoji}</span>
            <span style={{ fontSize: 10, fontWeight: 700, textAlign: "center", lineHeight: 1.15 }}>{s.label}</span>
          </button>
        ))}
        {visibleSymbols.length === 0 && (
          <div style={{ gridColumn: "1 / -1", padding: 18, textAlign: "center", color: "rgba(196,181,253,0.55)", fontSize: 12 }}>
            No symbols match. Try a different word, or use "Custom card" below.
          </div>
        )}
      </div>

      {/* Custom card composer */}
      <div style={{
        padding: 12, marginBottom: 14, borderRadius: 12,
        background: "rgba(168,85,247,0.04)",
        border: "1px dashed rgba(168,85,247,0.30)",
      }}>
        <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.20em", textTransform: "uppercase", color: "rgba(196,181,253,0.65)", marginBottom: 6 }}>
          Custom card
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "80px 1fr auto", gap: 8 }}>
          <input value={customEmoji} onChange={(e) => setCustomEmoji(e.target.value)} placeholder="🎯" maxLength={4} style={{ ...inp(), textAlign: "center", fontSize: 22 }} />
          <input value={customLabel} onChange={(e) => setCustomLabel(e.target.value)} placeholder="card label (e.g. 'iPad', 'recess')" style={inp()} />
          <button onClick={addCustom} disabled={!customLabel.trim()} style={primary(!customLabel.trim())}>+ Add</button>
        </div>
      </div>

      {/* Card list (the upcoming print queue) */}
      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8,
      }}>
        <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.18em", textTransform: "uppercase", opacity: 0.6 }}>
          Print queue ({cards.length}) · {sheets} sheet{sheets === 1 ? "" : "s"}
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <button onClick={seedStarter} style={ghost()}>+ Starter set</button>
          <button onClick={clearAll} disabled={cards.length === 0} style={ghost()}>Clear</button>
        </div>
      </div>

      {cards.length === 0 ? (
        <div style={{
          padding: 22, borderRadius: 12, textAlign: "center",
          background: "rgba(0,0,0,0.20)",
          border: "1px dashed rgba(168,85,247,0.20)",
          color: "rgba(196,181,253,0.55)", fontSize: 13,
        }}>
          Tap symbols above to build your set, or hit <b style={{ color: "#f9a8d4" }}>+ Starter set</b>.
        </div>
      ) : (
        <div style={{
          display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(110px, 1fr))",
          gap: 6, marginBottom: 14,
        }}>
          {cards.map((c, idx) => (
            <div key={c.id} style={{
              padding: 8, borderRadius: 10,
              background: "rgba(255,255,255,0.04)",
              border: `2px solid ${c.borderColor}`,
              display: "flex", flexDirection: "column", alignItems: "center", gap: 4,
              position: "relative",
            }}>
              <div style={{ fontSize: 32, lineHeight: 1 }}>{c.emoji}</div>
              <div style={{ fontSize: 11, fontWeight: 800, color: "#fce7f3", textAlign: "center" }}>{c.label}</div>
              <div style={{ display: "flex", gap: 3, marginTop: 2 }}>
                <MiniBtn onClick={() => moveCard(c.id, -1)} disabled={idx === 0}>◀</MiniBtn>
                <MiniBtn onClick={() => moveCard(c.id, +1)} disabled={idx === cards.length - 1}>▶</MiniBtn>
                <MiniBtn onClick={() => removeCard(c.id)} danger>✕</MiniBtn>
              </div>
            </div>
          ))}
        </div>
      )}

      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
        <button onClick={print} disabled={cards.length === 0} style={primary(cards.length === 0)}>
          🖨 Print {cards.length} card{cards.length === 1 ? "" : "s"} ({sheets} sheet{sheets === 1 ? "" : "s"})
        </button>
      </div>

      <div style={{ marginTop: 8, fontSize: 11, opacity: 0.65 }}>
        💡 Print on cardstock + laminate. Cut along the dashed lines. Use a Velcro dot on the back to stick to a sentence strip.
      </div>
    </div>
  );
}

/* ── Print template ─────────────────────────────────────────────── */

function openPecsPrintWindow(cards: Card[], perPage: number) {
  const w = window.open("", "_blank", "width=900,height=1100");
  if (!w) return;
  // Layout per perPage choice. All grids are simple N-col × M-row.
  const layout = (
    perPage === 12 ? { cols: 3, rows: 4, fontSize: 16, emojiSize: 60 } :
    perPage === 15 ? { cols: 3, rows: 5, fontSize: 14, emojiSize: 52 } :
    perPage === 20 ? { cols: 4, rows: 5, fontSize: 13, emojiSize: 44 } :
                     { cols: 5, rows: 6, fontSize: 11, emojiSize: 34 }
  );

  const sheets: string[] = [];
  for (let i = 0; i < cards.length; i += perPage) {
    const chunk = cards.slice(i, i + perPage);
    const cells: string[] = [];
    // Pad to fill the grid so dashed cut-lines stay aligned.
    const total = layout.cols * layout.rows;
    for (let j = 0; j < total; j++) {
      const c = chunk[j];
      if (!c) {
        cells.push(`<div class="cell blank"></div>`);
        continue;
      }
      cells.push(`<div class="cell" style="border-color:${c.borderColor}">
        <div class="emoji">${escapeHtml(c.emoji)}</div>
        <div class="label">${escapeHtml(c.label)}</div>
      </div>`);
    }
    sheets.push(`<section class="sheet">
      <div class="grid" style="grid-template-columns: repeat(${layout.cols}, 1fr); grid-template-rows: repeat(${layout.rows}, 1fr);">${cells.join("")}</div>
    </section>`);
  }

  w.document.write(`<!doctype html><html><head><title>PECS Cards — ${cards.length}</title>
    <style>
      @media print { @page { size: letter; margin: 0.5in; } .toolbar { display: none; } }
      body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: #1f1235; padding: 0; margin: 0; background: #f3f4f6; }
      .toolbar { padding: 12px 24px; background: #fef3c7; display: flex; justify-content: space-between; align-items: center; font-weight: 800; color: #78350f; }
      .toolbar button { padding: 8px 14px; border-radius: 8px; border: 1px solid #b45309; background: #b45309; color: white; font-weight: 700; cursor: pointer; }
      .sheet { width: 8.5in; height: 11in; padding: 0.5in; box-sizing: border-box; background: white; margin: 12px auto; box-shadow: 0 4px 18px rgba(0,0,0,0.10); page-break-after: always; }
      .sheet:last-child { page-break-after: auto; }
      .grid { display: grid; gap: 0; height: 100%; width: 100%; }
      .cell {
        border: 2.5px dashed #6b7280;
        display: flex; flex-direction: column; align-items: center; justify-content: center;
        padding: 4px;
        margin: -1.25px;        /* collapse adjacent borders */
        background: white;
        page-break-inside: avoid;
      }
      .cell .emoji { font-size: ${layout.emojiSize}px; line-height: 1; margin-bottom: 4px; }
      .cell .label { font-size: ${layout.fontSize}px; font-weight: 800; color: #1f1235; text-align: center; line-height: 1.15; }
      .cell.blank { border-color: rgba(107,114,128,0.20); }
    </style>
  </head><body>
    <div class="toolbar">
      <div>📦 ${cards.length} PECS card${cards.length === 1 ? "" : "s"} · ${Math.ceil(cards.length / perPage)} sheet${Math.ceil(cards.length / perPage) === 1 ? "" : "s"} · cardstock + laminate recommended</div>
      <button onclick="window.print()">🖨 Print</button>
    </div>
    ${sheets.join("")}
    <script>window.addEventListener('load', () => setTimeout(() => window.print(), 300));</script>
  </body></html>`);
  w.document.close();
}

/* ── UI helpers ─────────────────────────────────────────────────── */

function Chip({ label, active, color, onClick }: { label: string; active: boolean; color: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: "6px 12px", borderRadius: 999,
        background: active ? `${color}30` : "rgba(255,255,255,0.04)",
        border: `1px solid ${active ? color + "88" : "rgba(255,255,255,0.10)"}`,
        color: active ? color : "rgba(245,241,232,0.65)",
        fontSize: 12, fontWeight: 800, cursor: "pointer",
        touchAction: "manipulation",
      }}
    >{label}</button>
  );
}

function MiniBtn({ children, onClick, disabled, danger }: { children: React.ReactNode; onClick: () => void; disabled?: boolean; danger?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        width: 22, height: 22, borderRadius: 6,
        background: danger ? "rgba(239,68,68,0.20)" : "rgba(255,255,255,0.06)",
        border: danger ? "1px solid rgba(239,68,68,0.45)" : "1px solid rgba(255,255,255,0.12)",
        color: danger ? "#fca5a5" : "rgba(245,241,232,0.85)",
        fontSize: 10, fontWeight: 800, cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.35 : 1,
        display: "flex", alignItems: "center", justifyContent: "center",
        touchAction: "manipulation",
      }}
    >{children}</button>
  );
}

function inp(): React.CSSProperties {
  return {
    width: "100%", padding: "10px 12px", borderRadius: 10,
    background: "rgba(10,4,20,0.45)", color: "#fce7f3",
    border: "1px solid rgba(168,85,247,0.25)",
    fontSize: 13, outline: "none", fontWeight: 600,
    boxSizing: "border-box",
  };
}
function primary(disabled: boolean): React.CSSProperties {
  return {
    padding: "10px 16px", borderRadius: 10,
    background: disabled
      ? "rgba(168,85,247,0.18)"
      : "linear-gradient(135deg, #6366f1 0%, #a855f7 50%, #ec4899 100%)",
    color: "white", border: "none", fontWeight: 900,
    cursor: disabled ? "not-allowed" : "pointer", fontSize: 14,
    opacity: disabled ? 0.55 : 1,
  };
}
function ghost(): React.CSSProperties {
  return {
    padding: "6px 10px", borderRadius: 8,
    background: "rgba(255,255,255,0.05)", color: "white",
    border: "1px solid rgba(255,255,255,0.15)",
    fontWeight: 700, cursor: "pointer", fontSize: 12,
  };
}
function escapeHtml(s: string): string {
  return (s || "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}
