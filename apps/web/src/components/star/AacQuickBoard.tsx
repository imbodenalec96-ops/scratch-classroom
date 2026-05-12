// AAC Quick Board — tablet-first speak-on-tap board.
//
// Tap a cell → SpeechSynthesis speaks the word. Build a sentence in
// the strip up top by tapping cells in order, then tap "Speak" to
// read the whole phrase. Per-kid layouts saved to localStorage so
// each student gets their own board with their preferred words.

import { useEffect, useMemo, useState } from "react";
import {
  StarStore, type StarStudent,
} from "../../lib/star/storage.ts";
import {
  SYMBOLS, CATEGORY_LABELS, searchSymbols,
  type Symbol, type SymbolCategory,
} from "../../lib/star/symbols.ts";

type GridSize = 16 | 24 | 32;

interface BoardConfig {
  studentId: string;       // "" = global default
  gridSize: GridSize;
  symbolIds: string[];     // ordered, length === gridSize
  voiceURI?: string;
  rate?: number;           // 0.5 – 1.5
  pitch?: number;          // 0.5 – 1.5
}

const KEY_PREFIX = "star_aac_board_";

// Default boards by grid size — sensible starter words pulled from the
// shared symbol library. Grouped so beginners don't have to configure
// anything to start using it.
const DEFAULTS: Record<GridSize, string[]> = {
  16: [
    "i-need", "want", "more", "all-done",
    "yes", "no", "help", "please",
    "drink", "snack", "bathroom", "break",
    "happy", "sad", "tired", "i-feel",
  ],
  24: [
    "i-need", "want", "more", "all-done", "again", "help",
    "yes", "no", "please", "thank-you", "stop", "go",
    "drink", "water", "juice", "snack", "lunch", "bathroom",
    "happy", "sad", "angry", "tired", "calm", "i-feel",
  ],
  32: [
    "i-need", "want", "more", "all-done", "again", "help", "stop", "go",
    "yes", "no", "please", "thank-you", "my-turn", "your-turn", "i-feel", "look",
    "drink", "water", "juice", "milk", "snack", "lunch", "sandwich", "apple",
    "happy", "sad", "angry", "scared", "tired", "calm", "excited", "frustrated",
  ],
};

function loadBoard(studentId: string, gridSize: GridSize): BoardConfig {
  try {
    const raw = localStorage.getItem(KEY_PREFIX + (studentId || "default") + "_" + gridSize);
    if (raw) return JSON.parse(raw);
  } catch {}
  return {
    studentId, gridSize,
    symbolIds: DEFAULTS[gridSize].slice(0, gridSize),
    rate: 0.95, pitch: 1.0,
  };
}
function saveBoard(b: BoardConfig) {
  try {
    localStorage.setItem(KEY_PREFIX + (b.studentId || "default") + "_" + b.gridSize, JSON.stringify(b));
  } catch {}
}

function speak(text: string, opts: { voiceURI?: string; rate?: number; pitch?: number } = {}) {
  if (!("speechSynthesis" in window)) return;
  // Cancel anything in flight so rapid taps don't pile up.
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.rate = opts.rate ?? 0.95;
  u.pitch = opts.pitch ?? 1.0;
  if (opts.voiceURI) {
    const v = window.speechSynthesis.getVoices().find((vv) => vv.voiceURI === opts.voiceURI);
    if (v) u.voice = v;
  }
  window.speechSynthesis.speak(u);
}

export default function AacQuickBoard() {
  const [students] = useState<StarStudent[]>(() => StarStore.getStudents());
  const [studentId, setStudentId] = useState<string>("");
  const [gridSize, setGridSize] = useState<GridSize>(24);
  const [board, setBoard] = useState<BoardConfig>(() => loadBoard("", 24));
  const [editing, setEditing] = useState<number | null>(null);   // cell index being edited
  const [pickerQuery, setPickerQuery] = useState("");
  const [pickerCategory, setPickerCategory] = useState<SymbolCategory | "all">("all");
  const [phrase, setPhrase] = useState<Symbol[]>([]);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [showSettings, setShowSettings] = useState(false);

  // Voices may load async. Subscribe to the change event.
  useEffect(() => {
    const updateVoices = () => setVoices(window.speechSynthesis.getVoices());
    updateVoices();
    if ("speechSynthesis" in window) {
      window.speechSynthesis.addEventListener?.("voiceschanged", updateVoices);
      return () => window.speechSynthesis.removeEventListener?.("voiceschanged", updateVoices);
    }
  }, []);

  // Load the right board whenever the student or grid-size changes.
  useEffect(() => {
    setBoard(loadBoard(studentId, gridSize));
    setPhrase([]);
    setEditing(null);
  }, [studentId, gridSize]);

  // Persist on every config change.
  useEffect(() => { saveBoard(board); }, [board]);

  const cells: (Symbol | undefined)[] = useMemo(() => {
    const arr: (Symbol | undefined)[] = [];
    for (let i = 0; i < gridSize; i++) {
      const id = board.symbolIds[i];
      arr.push(id ? SYMBOLS.find((s) => s.id === id) : undefined);
    }
    return arr;
  }, [board, gridSize]);

  const cols = gridSize === 16 ? 4 : gridSize === 24 ? 6 : 8;

  const onCellTap = (idx: number) => {
    const sym = cells[idx];
    if (!sym) {
      setEditing(idx);
      return;
    }
    speak(sym.label, { voiceURI: board.voiceURI, rate: board.rate, pitch: board.pitch });
    setPhrase((p) => [...p, sym]);
  };

  const speakPhrase = () => {
    if (phrase.length === 0) return;
    const text = phrase.map((s) => s.label).join(" ");
    speak(text, { voiceURI: board.voiceURI, rate: board.rate, pitch: board.pitch });
  };

  const setCellSymbol = (idx: number, sym: Symbol | undefined) => {
    setBoard((b) => {
      const ids = b.symbolIds.slice();
      while (ids.length < gridSize) ids.push("");
      ids[idx] = sym ? sym.id : "";
      return { ...b, symbolIds: ids };
    });
    setEditing(null);
  };

  const resetToDefault = () => {
    if (!window.confirm("Reset this board to the default words?")) return;
    setBoard({
      studentId, gridSize,
      symbolIds: DEFAULTS[gridSize].slice(0, gridSize),
      voiceURI: board.voiceURI, rate: board.rate, pitch: board.pitch,
    });
    setPhrase([]);
  };

  const visibleSymbols = useMemo(() => {
    let pool: Symbol[] = pickerQuery ? searchSymbols(pickerQuery) : SYMBOLS;
    if (pickerCategory !== "all") pool = pool.filter((s) => s.category === pickerCategory);
    return pool;
  }, [pickerQuery, pickerCategory]);

  // Tablet-first full-bleed layout.
  return (
    <div style={{ minHeight: "100dvh", background: "#0a0414", color: "#f5f1e8", padding: 12 }}>
      {/* Top bar */}
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 10 }}>
        <select value={studentId} onChange={(e) => setStudentId(e.target.value)} style={inp()}>
          <option value="">🌐 Class default</option>
          {students.map((s) => <option key={s.id} value={s.id}>👤 {s.firstName} {s.lastName}</option>)}
        </select>
        <select value={gridSize} onChange={(e) => setGridSize(Number(e.target.value) as GridSize)} style={inp()}>
          <option value={16}>4×4 · 16 cells</option>
          <option value={24}>6×4 · 24 cells</option>
          <option value={32}>8×4 · 32 cells</option>
        </select>
        <button onClick={() => setShowSettings((v) => !v)} style={ghost()}>{showSettings ? "✕ Voice" : "🔊 Voice"}</button>
        <button onClick={resetToDefault} style={ghost()}>↺ Reset</button>
        <div style={{ marginLeft: "auto", fontSize: 11, opacity: 0.55 }}>
          Tap any cell to speak · long-press an empty cell to add a word
        </div>
      </div>

      {/* Voice settings */}
      {showSettings && (
        <div style={{
          padding: 10, marginBottom: 10, borderRadius: 12,
          background: "rgba(168,85,247,0.06)",
          border: "1px solid rgba(168,85,247,0.20)",
          display: "grid", gridTemplateColumns: "1fr auto auto", gap: 8, alignItems: "center",
        }}>
          <select value={board.voiceURI || ""} onChange={(e) => setBoard((b) => ({ ...b, voiceURI: e.target.value || undefined }))} style={inp()}>
            <option value="">Browser default voice</option>
            {voices.filter((v) => v.lang.startsWith("en")).map((v) => (
              <option key={v.voiceURI} value={v.voiceURI}>{v.name} ({v.lang})</option>
            ))}
          </select>
          <label style={{ fontSize: 12, color: "rgba(196,181,253,0.85)" }}>
            Speed
            <input type="range" min={0.5} max={1.5} step={0.05} value={board.rate || 0.95}
              onChange={(e) => setBoard((b) => ({ ...b, rate: Number(e.target.value) }))}
              style={{ marginLeft: 6, verticalAlign: "middle" }}
            />
          </label>
          <label style={{ fontSize: 12, color: "rgba(196,181,253,0.85)" }}>
            Pitch
            <input type="range" min={0.5} max={1.5} step={0.05} value={board.pitch || 1.0}
              onChange={(e) => setBoard((b) => ({ ...b, pitch: Number(e.target.value) }))}
              style={{ marginLeft: 6, verticalAlign: "middle" }}
            />
          </label>
        </div>
      )}

      {/* Sentence strip */}
      <div style={{
        display: "flex", alignItems: "center", gap: 8,
        padding: "10px 12px", borderRadius: 14,
        background: "linear-gradient(135deg, rgba(168,85,247,0.10), rgba(236,72,153,0.06))",
        border: "1.5px solid rgba(168,85,247,0.30)",
        marginBottom: 12, minHeight: 64,
      }}>
        <div style={{
          flex: 1, display: "flex", gap: 6, flexWrap: "wrap", minHeight: 44, alignItems: "center",
        }}>
          {phrase.length === 0
            ? <span style={{ color: "rgba(196,181,253,0.55)", fontSize: 13, fontStyle: "italic" }}>Tap words below to build a sentence…</span>
            : phrase.map((s, i) => (
                <button key={`${s.id}-${i}`} onClick={() => setPhrase((p) => p.filter((_, j) => j !== i))} style={{
                  display: "inline-flex", alignItems: "center", gap: 6,
                  padding: "6px 10px", borderRadius: 999,
                  background: "rgba(255,255,255,0.08)",
                  border: "1px solid rgba(255,255,255,0.15)",
                  color: "#fce7f3", fontSize: 14, fontWeight: 700,
                  cursor: "pointer", touchAction: "manipulation",
                }} title="Tap to remove">
                  <span style={{ fontSize: 18 }}>{s.emoji}</span>
                  <span>{s.label}</span>
                </button>
              ))}
        </div>
        <button onClick={() => setPhrase([])} disabled={phrase.length === 0} style={ghost()}>Clear</button>
        <button onClick={speakPhrase} disabled={phrase.length === 0} style={primary(phrase.length === 0)}>
          🔊 Speak
        </button>
      </div>

      {/* Main grid */}
      <div style={{
        display: "grid",
        gridTemplateColumns: `repeat(${cols}, 1fr)`,
        gap: 8,
      }}>
        {cells.map((sym, idx) => (
          <button
            key={idx}
            onClick={() => onCellTap(idx)}
            onContextMenu={(e) => { e.preventDefault(); setEditing(idx); }}
            style={{
              aspectRatio: "1 / 1",
              padding: 8, borderRadius: 14,
              background: sym
                ? "linear-gradient(155deg, rgba(168,85,247,0.18) 0%, rgba(99,102,241,0.10) 60%, rgba(15,15,28,0.30) 100%)"
                : "rgba(255,255,255,0.03)",
              border: sym ? "1.5px solid rgba(168,85,247,0.45)" : "2px dashed rgba(168,85,247,0.25)",
              color: "#fce7f3",
              cursor: "pointer",
              display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 4,
              touchAction: "manipulation",
              boxShadow: sym ? "0 6px 18px -6px rgba(168,85,247,0.40)" : "none",
              position: "relative",
            }}
          >
            {sym ? (
              <>
                <div style={{ fontSize: cols === 4 ? 56 : cols === 6 ? 44 : 34, lineHeight: 1 }}>{sym.emoji}</div>
                <div style={{ fontSize: cols === 4 ? 16 : cols === 6 ? 14 : 12, fontWeight: 800 }}>{sym.label}</div>
              </>
            ) : (
              <span style={{ color: "rgba(196,181,253,0.55)", fontWeight: 800, fontSize: 12 }}>+ Add word</span>
            )}
            <button
              onClick={(e) => { e.stopPropagation(); setEditing(idx); }}
              style={{
                position: "absolute", top: 4, right: 4,
                width: 22, height: 22, borderRadius: 6,
                background: "rgba(0,0,0,0.30)",
                border: "1px solid rgba(168,85,247,0.30)",
                color: "rgba(196,181,253,0.85)",
                fontSize: 11, fontWeight: 700, cursor: "pointer", touchAction: "manipulation",
              }}
              aria-label="Edit cell"
              title="Change this word"
            >✏</button>
          </button>
        ))}
      </div>

      {/* Edit-cell picker (modal-ish) */}
      {editing != null && (
        <div
          onClick={() => setEditing(null)}
          style={{
            position: "fixed", inset: 0, zIndex: 9999,
            background: "rgba(0,0,0,0.55)",
            display: "flex", alignItems: "center", justifyContent: "center",
            padding: 16, backdropFilter: "blur(4px)",
          }}
        >
          <div onClick={(e) => e.stopPropagation()} style={{
            width: "min(680px, 95vw)", maxHeight: "85vh", overflow: "auto",
            background: "#1a0f2e",
            border: "1px solid rgba(168,85,247,0.40)",
            borderRadius: 18, padding: 16,
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
              <div style={{ flex: 1, fontSize: 14, fontWeight: 800, color: "#fce7f3" }}>
                Pick a word for cell {editing + 1}
              </div>
              <button onClick={() => { setCellSymbol(editing, undefined); }} style={ghost()}>Clear cell</button>
              <button onClick={() => setEditing(null)} style={ghost()}>Close</button>
            </div>
            <input
              autoFocus
              value={pickerQuery}
              onChange={(e) => setPickerQuery(e.target.value)}
              placeholder="🔍 Search…"
              style={{ ...inp(), marginBottom: 10 }}
            />
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
              <Chip label="All" active={pickerCategory === "all"} onClick={() => setPickerCategory("all")} />
              {(Object.keys(CATEGORY_LABELS) as SymbolCategory[]).map((c) => (
                <Chip key={c} label={CATEGORY_LABELS[c]} active={pickerCategory === c} onClick={() => setPickerCategory(c)} />
              ))}
            </div>
            <div style={{
              display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(80px, 1fr))",
              gap: 6, maxHeight: 360, overflow: "auto",
            }}>
              {visibleSymbols.map((s) => (
                <button key={s.id} onClick={() => setCellSymbol(editing, s)} style={{
                  padding: 8, borderRadius: 10,
                  background: "rgba(168,85,247,0.06)",
                  border: "1px solid rgba(168,85,247,0.20)",
                  color: "#fce7f3", cursor: "pointer",
                  display: "flex", flexDirection: "column", alignItems: "center", gap: 4,
                  touchAction: "manipulation",
                }}>
                  <span style={{ fontSize: 28, lineHeight: 1 }}>{s.emoji}</span>
                  <span style={{ fontSize: 10, fontWeight: 700 }}>{s.label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── tiny UI helpers ────────────────────────────────────────────── */

function Chip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{
      padding: "5px 10px", borderRadius: 999,
      background: active ? "rgba(168,85,247,0.30)" : "rgba(255,255,255,0.04)",
      border: `1px solid ${active ? "rgba(168,85,247,0.55)" : "rgba(255,255,255,0.10)"}`,
      color: active ? "#f9a8d4" : "rgba(245,241,232,0.65)",
      fontSize: 11, fontWeight: 800, cursor: "pointer", touchAction: "manipulation",
    }}>{label}</button>
  );
}
function inp(): React.CSSProperties {
  return {
    padding: "8px 10px", borderRadius: 8,
    background: "rgba(0,0,0,0.30)", color: "white",
    border: "1px solid rgba(168,85,247,0.25)",
    fontSize: 13, outline: "none", fontWeight: 600,
    boxSizing: "border-box",
  };
}
function ghost(): React.CSSProperties {
  return {
    padding: "8px 12px", borderRadius: 8,
    background: "rgba(255,255,255,0.05)", color: "white",
    border: "1px solid rgba(255,255,255,0.15)",
    fontWeight: 700, cursor: "pointer", fontSize: 12, touchAction: "manipulation",
  };
}
function primary(disabled: boolean): React.CSSProperties {
  return {
    padding: "10px 18px", borderRadius: 10,
    background: disabled ? "rgba(168,85,247,0.18)" : "linear-gradient(135deg, #6366f1, #a855f7, #ec4899)",
    color: "white", border: "none", fontWeight: 900,
    cursor: disabled ? "not-allowed" : "pointer",
    fontSize: 14, opacity: disabled ? 0.55 : 1,
    touchAction: "manipulation",
  };
}
