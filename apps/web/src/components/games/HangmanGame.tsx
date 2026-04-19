import React, { useState, useCallback, useEffect } from "react";

/* ── Word bank ──────────────────────────────────────────────── */
const WORD_BANK: { word: string; category: string }[] = [
  // Animals
  { word: "ELEPHANT", category: "Animals" },
  { word: "GIRAFFE", category: "Animals" },
  { word: "PENGUIN", category: "Animals" },
  { word: "DOLPHIN", category: "Animals" },
  { word: "TIGER", category: "Animals" },
  { word: "HAMSTER", category: "Animals" },
  { word: "OCTOPUS", category: "Animals" },
  { word: "CHEETAH", category: "Animals" },
  { word: "FLAMINGO", category: "Animals" },
  { word: "KANGAROO", category: "Animals" },
  { word: "CROCODILE", category: "Animals" },
  { word: "BUTTERFLY", category: "Animals" },
  // Food
  { word: "PIZZA", category: "Food" },
  { word: "BURGER", category: "Food" },
  { word: "SPAGHETTI", category: "Food" },
  { word: "CHOCOLATE", category: "Food" },
  { word: "STRAWBERRY", category: "Food" },
  { word: "PANCAKE", category: "Food" },
  { word: "AVOCADO", category: "Food" },
  { word: "BROCCOLI", category: "Food" },
  { word: "PINEAPPLE", category: "Food" },
  { word: "SANDWICH", category: "Food" },
  // Colors
  { word: "PURPLE", category: "Colors" },
  { word: "ORANGE", category: "Colors" },
  { word: "CRIMSON", category: "Colors" },
  { word: "TURQUOISE", category: "Colors" },
  { word: "MAGENTA", category: "Colors" },
  { word: "LAVENDER", category: "Colors" },
  { word: "SCARLET", category: "Colors" },
  { word: "INDIGO", category: "Colors" },
  // School
  { word: "PENCIL", category: "School" },
  { word: "BACKPACK", category: "School" },
  { word: "TEACHER", category: "School" },
  { word: "NOTEBOOK", category: "School" },
  { word: "CLASSROOM", category: "School" },
  { word: "LIBRARY", category: "School" },
  { word: "SCIENCE", category: "School" },
  { word: "HISTORY", category: "School" },
  { word: "HOMEWORK", category: "School" },
  { word: "COMPUTER", category: "School" },
  // Sports
  { word: "SOCCER", category: "Sports" },
  { word: "BASKETBALL", category: "Sports" },
  { word: "BASEBALL", category: "Sports" },
  { word: "FOOTBALL", category: "Sports" },
  { word: "SWIMMING", category: "Sports" },
  { word: "VOLLEYBALL", category: "Sports" },
  { word: "GYMNASTICS", category: "Sports" },
  { word: "SKATEBOARD", category: "Sports" },
  { word: "BADMINTON", category: "Sports" },
  { word: "WRESTLING", category: "Sports" },
  // Nature
  { word: "RAINBOW", category: "Nature" },
  { word: "VOLCANO", category: "Nature" },
  { word: "TORNADO", category: "Nature" },
  { word: "WATERFALL", category: "Nature" },
  { word: "THUNDER", category: "Nature" },
  { word: "GLACIER", category: "Nature" },
  { word: "JUNGLE", category: "Nature" },
];

const MAX_WRONG = 6;
const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

function pickWord() {
  return WORD_BANK[Math.floor(Math.random() * WORD_BANK.length)];
}

/* ── SVG Hangman drawing ────────────────────────────────────── */
function HangmanSVG({ wrong }: { wrong: number }) {
  const s = (opacity: number) => ({ opacity: wrong >= opacity ? 1 : 0, transition: "opacity 0.3s ease" });
  return (
    <svg
      viewBox="0 0 160 200"
      width={160}
      height={200}
      style={{ filter: "drop-shadow(0 0 12px rgba(251,191,36,0.3))" }}
    >
      {/* Gallows — always visible */}
      {/* Base */}
      <line x1="10" y1="195" x2="100" y2="195" stroke="#a78bfa" strokeWidth="4" strokeLinecap="round" />
      {/* Pole */}
      <line x1="40" y1="195" x2="40" y2="15" stroke="#a78bfa" strokeWidth="4" strokeLinecap="round" />
      {/* Top beam */}
      <line x1="40" y1="15" x2="110" y2="15" stroke="#a78bfa" strokeWidth="4" strokeLinecap="round" />
      {/* Rope */}
      <line x1="110" y1="15" x2="110" y2="40" stroke="#a78bfa" strokeWidth="3" strokeLinecap="round" />

      {/* Head — stage 1 */}
      <circle cx="110" cy="55" r="15" fill="none" stroke="#fbbf24" strokeWidth="3" style={s(1)} />

      {/* Body — stage 2 */}
      <line x1="110" y1="70" x2="110" y2="120" stroke="#fbbf24" strokeWidth="3" strokeLinecap="round" style={s(2)} />

      {/* Left arm — stage 3 */}
      <line x1="110" y1="80" x2="85" y2="105" stroke="#fbbf24" strokeWidth="3" strokeLinecap="round" style={s(3)} />

      {/* Right arm — stage 4 */}
      <line x1="110" y1="80" x2="135" y2="105" stroke="#fbbf24" strokeWidth="3" strokeLinecap="round" style={s(4)} />

      {/* Left leg — stage 5 */}
      <line x1="110" y1="120" x2="85" y2="155" stroke="#fbbf24" strokeWidth="3" strokeLinecap="round" style={s(5)} />

      {/* Right leg — stage 6 */}
      <line x1="110" y1="120" x2="135" y2="155" stroke="#fbbf24" strokeWidth="3" strokeLinecap="round" style={s(6)} />
    </svg>
  );
}

/* ── Main component ─────────────────────────────────────────── */
export default function HangmanGame() {
  const [{ word, category }, setWordEntry] = useState(pickWord);
  const [guessed, setGuessed] = useState<Set<string>>(new Set());

  const wrong = [...guessed].filter(l => !word.includes(l)).length;
  const won = word.split("").every(l => guessed.has(l));
  const lost = wrong >= MAX_WRONG;
  const gameOver = won || lost;

  const newGame = useCallback(() => {
    setWordEntry(pickWord());
    setGuessed(new Set());
  }, []);

  const guess = useCallback((letter: string) => {
    if (gameOver || guessed.has(letter)) return;
    setGuessed(prev => new Set([...prev, letter]));
  }, [gameOver, guessed]);

  // Keyboard support
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const key = e.key.toUpperCase();
      if (LETTERS.includes(key)) guess(key);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [guess]);

  const wrongLetters = [...guessed].filter(l => !word.includes(l));

  return (
    <div
      className="flex flex-col items-center gap-4 p-4 min-h-full"
      style={{ background: "#0f172a", minHeight: "100%" }}
    >
      {/* Header row */}
      <div className="flex items-center justify-between w-full max-w-md">
        <div style={{
          background: "#1e1b4b",
          border: "1px solid #4c1d95",
          borderRadius: 12,
          padding: "6px 14px",
          fontSize: 13,
          color: "#c4b5fd",
          fontWeight: 600,
        }}>
          Category: <span style={{ color: "#fbbf24" }}>{category}</span>
        </div>
        <div style={{
          background: "#1e1b4b",
          border: "1px solid #4c1d95",
          borderRadius: 12,
          padding: "6px 14px",
          fontSize: 13,
          color: "#c4b5fd",
          fontWeight: 600,
        }}>
          Wrong: <span style={{ color: wrong > 3 ? "#ef4444" : "#fbbf24" }}>{wrong}</span>
          <span style={{ color: "#6d28d9" }}> / {MAX_WRONG}</span>
        </div>
      </div>

      {/* Hangman SVG */}
      <HangmanSVG wrong={wrong} />

      {/* Word display */}
      <div className="flex gap-2 flex-wrap justify-center" style={{ maxWidth: 380 }}>
        {word.split("").map((letter, i) => (
          <div
            key={i}
            style={{
              width: 36,
              height: 44,
              borderBottom: `3px solid ${guessed.has(letter) ? "#fbbf24" : "#4c1d95"}`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 22,
              fontWeight: 900,
              color: guessed.has(letter) ? "#fbbf24" : "transparent",
              transition: "color 0.2s ease",
              letterSpacing: 1,
            }}
          >
            {guessed.has(letter) || (lost) ? letter : ""}
          </div>
        ))}
      </div>

      {/* Wrong letters */}
      {wrongLetters.length > 0 && (
        <div style={{ fontSize: 13, color: "#ef4444", letterSpacing: 2, fontWeight: 700 }}>
          Wrong: {wrongLetters.join("  ")}
        </div>
      )}

      {/* Game over banner */}
      {gameOver && (
        <div style={{
          background: won ? "rgba(16,185,129,0.15)" : "rgba(239,68,68,0.15)",
          border: `2px solid ${won ? "#10b981" : "#ef4444"}`,
          borderRadius: 16,
          padding: "12px 24px",
          textAlign: "center",
        }}>
          <div style={{ fontSize: 24, fontWeight: 900, color: won ? "#10b981" : "#ef4444" }}>
            {won ? "You got it!" : "Game Over!"}
          </div>
          {lost && (
            <div style={{ fontSize: 14, color: "#a78bfa", marginTop: 4 }}>
              The word was <b style={{ color: "#fbbf24" }}>{word}</b>
            </div>
          )}
        </div>
      )}

      {/* On-screen keyboard */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, justifyContent: "center", maxWidth: 360 }}>
        {LETTERS.map(letter => {
          const isCorrect = guessed.has(letter) && word.includes(letter);
          const isWrong = guessed.has(letter) && !word.includes(letter);
          const used = isCorrect || isWrong;
          return (
            <button
              key={letter}
              onClick={() => guess(letter)}
              disabled={used || gameOver}
              style={{
                width: 38,
                height: 40,
                borderRadius: 8,
                fontSize: 15,
                fontWeight: 700,
                cursor: used || gameOver ? "default" : "pointer",
                touchAction: "manipulation",
                border: `2px solid ${
                  isCorrect ? "#10b981" :
                  isWrong   ? "#4b5563" :
                              "#4c1d95"
                }`,
                background: isCorrect ? "rgba(16,185,129,0.2)" :
                            isWrong   ? "rgba(75,85,99,0.15)" :
                                        "rgba(139,92,246,0.15)",
                color: isCorrect ? "#10b981" :
                       isWrong   ? "#4b5563" :
                                   "#c4b5fd",
                opacity: isWrong ? 0.45 : 1,
                transform: used ? "scale(0.9)" : "scale(1)",
                transition: "all 0.15s ease",
              }}
            >
              {letter}
            </button>
          );
        })}
      </div>

      {/* New game button */}
      {gameOver && (
        <button
          onClick={newGame}
          style={{
            background: "linear-gradient(135deg, #7c3aed, #4f46e5)",
            color: "#fff",
            border: "none",
            borderRadius: 16,
            padding: "12px 32px",
            fontSize: 16,
            fontWeight: 700,
            cursor: "pointer",
            touchAction: "manipulation",
            boxShadow: "0 4px 20px rgba(124,58,237,0.4)",
          }}
        >
          New Game
        </button>
      )}

      <p style={{ fontSize: 11, color: "#ffffff25", marginTop: "auto" }}>
        Tap letters to guess · keyboard also works
      </p>
    </div>
  );
}
