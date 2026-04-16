import React, { useState, useEffect, useCallback } from "react";

const EMOJIS = ["🦊", "🐸", "🦋", "🐙", "🦄", "🐉", "🦁", "🐼", "🦩", "🐬", "🌈", "⚡"];
const PAIRS = 12;

function shuffle<T>(arr: T[]): T[] {
  return [...arr].sort(() => Math.random() - 0.5);
}

function makeCards() {
  const pairs = EMOJIS.slice(0, PAIRS);
  return shuffle([...pairs, ...pairs]).map((e, i) => ({ id: i, emoji: e, flipped: false, matched: false }));
}

type Card = { id: number; emoji: string; flipped: boolean; matched: boolean };

export default function MemoryGame() {
  const [cards, setCards] = useState<Card[]>(makeCards());
  const [selected, setSelected] = useState<number[]>([]);
  const [moves, setMoves] = useState(0);
  const [won, setWon] = useState(false);
  const [locked, setLocked] = useState(false);
  const [bestMoves, setBestMoves] = useState(() => Number(localStorage.getItem("memory_best") || 0));

  const check = useCallback((sel: number[], cs: Card[]) => {
    if (sel.length !== 2) return;
    const [a, b] = sel;
    setLocked(true);
    setTimeout(() => {
      setCards(prev => {
        const next = prev.map((c, i) => {
          if (i !== a && i !== b) return c;
          const matched = prev[a].emoji === prev[b].emoji;
          return { ...c, flipped: matched, matched };
        });
        const allDone = next.every(c => c.matched);
        if (allDone) {
          setWon(true);
          setBestMoves(prev2 => {
            const nm = moves + 1;
            const best = prev2 === 0 ? nm : Math.min(prev2, nm);
            localStorage.setItem("memory_best", String(best));
            return best;
          });
        }
        return next;
      });
      setSelected([]);
      setLocked(false);
    }, 800);
  }, [moves]);

  const flip = (idx: number) => {
    if (locked || cards[idx].matched || cards[idx].flipped) return;
    const newSel = selected.length < 2 ? [...selected, idx] : [idx];
    setCards(prev => prev.map((c, i) => i === idx ? { ...c, flipped: true } : c));
    setSelected(newSel);
    if (newSel.length === 2) {
      setMoves(m => m + 1);
      check(newSel, cards.map((c, i) => i === idx ? { ...c, flipped: true } : c));
    }
  };

  const restart = () => {
    setCards(makeCards());
    setSelected([]);
    setMoves(0);
    setWon(false);
    setLocked(false);
  };

  return (
    <div className="flex flex-col items-center gap-4 p-4 h-full overflow-auto select-none" style={{ background: "#07071a" }}>
      <div className="flex items-center justify-between w-full max-w-lg">
        <span className="text-sm font-bold text-violet-400">🃏 Memory Match</span>
        <div className="flex gap-4 text-xs text-white/50">
          <span>Moves: <span className="text-white font-bold">{moves}</span></span>
          {bestMoves > 0 && <span>Best: <span className="text-yellow-400 font-bold">{bestMoves}</span></span>}
        </div>
      </div>

      <div className="grid gap-2.5" style={{ gridTemplateColumns: "repeat(6, 1fr)", maxWidth: 420 }}>
        {cards.map((card, i) => (
          <div
            key={card.id}
            onClick={() => flip(i)}
            className="relative cursor-pointer"
            style={{ width: 60, height: 60, perspective: 400, animationDelay: `${i * 30}ms` }}
          >
            <div
              style={{
                width: "100%", height: "100%",
                transformStyle: "preserve-3d",
                transition: "transform 0.35s cubic-bezier(0.4,0,0.2,1)",
                transform: card.flipped || card.matched ? "rotateY(180deg)" : "rotateY(0deg)",
              }}
            >
              {/* Back */}
              <div
                style={{
                  position: "absolute", inset: 0, backfaceVisibility: "hidden",
                  background: card.matched ? "rgba(99,102,241,0.15)" : "rgba(139,92,246,0.15)",
                  border: `1px solid ${card.matched ? "rgba(99,102,241,0.4)" : "rgba(139,92,246,0.3)"}`,
                  borderRadius: 10,
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}
              >
                <span style={{ fontSize: 20, opacity: 0.3 }}>✦</span>
              </div>
              {/* Front */}
              <div
                style={{
                  position: "absolute", inset: 0, backfaceVisibility: "hidden",
                  transform: "rotateY(180deg)",
                  background: card.matched ? "rgba(99,102,241,0.25)" : "rgba(139,92,246,0.2)",
                  border: `1px solid ${card.matched ? "rgba(99,102,241,0.6)" : "rgba(139,92,246,0.5)"}`,
                  borderRadius: 10,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  boxShadow: card.matched ? "0 0 12px rgba(99,102,241,0.4)" : "none",
                }}
              >
                <span style={{ fontSize: 26 }}>{card.emoji}</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {won && (
        <div className="fixed inset-0 flex items-center justify-center z-10" style={{ background: "rgba(0,0,0,0.8)" }}>
          <div className="text-center p-8 rounded-2xl" style={{ background: "#0f1029", border: "1px solid rgba(139,92,246,0.4)" }}>
            <div className="text-5xl mb-3">🎉</div>
            <div className="text-white font-extrabold text-2xl mb-1">You won!</div>
            <div className="text-yellow-400 font-bold text-xl mb-4">{moves} moves</div>
            <button onClick={restart} className="px-6 py-2.5 rounded-xl bg-violet-600 text-white font-bold hover:bg-violet-500 transition-colors">Play Again</button>
          </div>
        </div>
      )}
    </div>
  );
}
