import React, { useState, useEffect, useRef, useCallback } from "react";

/* ── Word list ──────────────────────────────────────────────── */
const WORDS = [
  "cat", "dog", "run", "jump", "fast", "slow", "big", "small", "red", "blue",
  "sun", "moon", "star", "fish", "bird", "tree", "book", "rain", "snow", "fire",
  "word", "game", "play", "win", "cool", "fun", "good", "best", "happy", "smile",
  "apple", "green", "water", "light", "music", "class", "train", "candy", "dance", "plant",
  "ocean", "cloud", "pizza", "frog", "river", "shore", "night", "dream", "chair", "table",
  "mouse", "house", "phone", "clock", "color", "story", "magic", "brave", "quick", "sharp",
  "tower", "frost", "world", "heart",
];

function randomWord(exclude?: string): string {
  let w: string;
  do { w = WORDS[Math.floor(Math.random() * WORDS.length)]; } while (w === exclude);
  return w;
}

type Phase = "idle" | "playing" | "done";

const DURATION = 60;

export default function TypingRace() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [currentWord, setCurrentWord] = useState(() => randomWord());
  const [input, setInput] = useState("");
  const [score, setScore] = useState(0);
  const [timeLeft, setTimeLeft] = useState(DURATION);
  const [flash, setFlash] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastWordRef = useRef<string>(currentWord);

  // Focus input when game starts
  useEffect(() => {
    if (phase === "playing") {
      inputRef.current?.focus();
    }
  }, [phase]);

  // Countdown timer
  useEffect(() => {
    if (phase !== "playing") return;
    timerRef.current = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(timerRef.current!);
          setPhase("done");
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timerRef.current!);
  }, [phase]);

  const startGame = useCallback(() => {
    const first = randomWord();
    lastWordRef.current = first;
    setCurrentWord(first);
    setInput("");
    setScore(0);
    setTimeLeft(DURATION);
    setFlash(false);
    setPhase("playing");
    setTimeout(() => inputRef.current?.focus(), 50);
  }, []);

  const handleInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (phase !== "playing") return;
    const value = e.target.value;
    setInput(value);

    if (value.trim().toLowerCase() === currentWord.toLowerCase()) {
      // Correct! Advance
      setFlash(true);
      setTimeout(() => setFlash(false), 200);
      setScore(prev => prev + 1);
      const next = randomWord(lastWordRef.current);
      lastWordRef.current = next;
      setCurrentWord(next);
      setInput("");
    }
  }, [phase, currentWord]);

  const wpm = Math.round((score / DURATION) * 60);

  // Progress bar color
  const timeRatio = timeLeft / DURATION;
  const barColor = timeRatio > 0.5 ? "#10b981" : timeRatio > 0.25 ? "#f59e0b" : "#ef4444";

  return (
    <div
      className="flex flex-col items-center gap-5 p-6 min-h-full"
      style={{ background: "#0f172a" }}
    >
      {/* Title + score */}
      <div className="flex items-center justify-between w-full max-w-md">
        <div style={{ fontSize: 22, fontWeight: 900, color: "#22d3ee", letterSpacing: "-0.02em" }}>
          Typing Race
        </div>
        <div style={{
          background: "rgba(34,211,238,0.12)",
          border: "1px solid rgba(34,211,238,0.3)",
          borderRadius: 12,
          padding: "6px 16px",
          fontSize: 18,
          fontWeight: 900,
          color: "#22d3ee",
        }}>
          {score} <span style={{ fontSize: 11, fontWeight: 500, color: "#67e8f9", opacity: 0.8 }}>words</span>
        </div>
      </div>

      {/* Timer bar */}
      <div style={{ width: "100%", maxWidth: 400 }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
          <span style={{ fontSize: 12, color: "#94a3b8" }}>Time left</span>
          <span style={{
            fontSize: 18,
            fontWeight: 900,
            color: barColor,
            transition: "color 0.3s",
          }}>{timeLeft}s</span>
        </div>
        <div style={{
          height: 8,
          borderRadius: 99,
          background: "rgba(255,255,255,0.08)",
          overflow: "hidden",
        }}>
          <div style={{
            height: "100%",
            width: `${(timeLeft / DURATION) * 100}%`,
            background: barColor,
            borderRadius: 99,
            transition: "width 1s linear, background 0.3s ease",
          }} />
        </div>
      </div>

      {/* Word display */}
      {(phase === "playing" || phase === "done") && (
        <div style={{
          background: flash ? "rgba(34,211,238,0.18)" : "rgba(255,255,255,0.05)",
          border: `2px solid ${flash ? "#22d3ee" : "rgba(255,255,255,0.1)"}`,
          borderRadius: 20,
          padding: "20px 40px",
          fontSize: 42,
          fontWeight: 900,
          letterSpacing: "-0.02em",
          color: flash ? "#22d3ee" : "#f1f5f9",
          minWidth: 200,
          textAlign: "center",
          transition: "all 0.12s ease",
          transform: flash ? "scale(1.05)" : "scale(1)",
          boxShadow: flash ? "0 0 30px rgba(34,211,238,0.3)" : "none",
          userSelect: "none",
        }}>
          {phase === "done" ? "Time's up!" : currentWord}
        </div>
      )}

      {/* Idle state */}
      {phase === "idle" && (
        <div style={{
          background: "rgba(255,255,255,0.04)",
          border: "2px dashed rgba(34,211,238,0.25)",
          borderRadius: 20,
          padding: "24px 40px",
          textAlign: "center",
          color: "#94a3b8",
          fontSize: 16,
        }}>
          <div style={{ fontSize: 40, marginBottom: 8 }}>⌨️</div>
          <div>Type the word shown above</div>
          <div>when it's correct, the next one appears!</div>
        </div>
      )}

      {/* Input */}
      {phase === "playing" && (
        <div style={{ width: "100%", maxWidth: 400, position: "relative" }}>
          <input
            ref={inputRef}
            value={input}
            onChange={handleInput}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="none"
            spellCheck={false}
            placeholder="Type here..."
            style={{
              width: "100%",
              boxSizing: "border-box",
              background: "rgba(255,255,255,0.07)",
              border: `2px solid ${input.length > 0 ? "rgba(34,211,238,0.5)" : "rgba(255,255,255,0.15)"}`,
              borderRadius: 16,
              padding: "16px 20px",
              fontSize: 24,
              fontWeight: 600,
              color: "#f1f5f9",
              outline: "none",
              touchAction: "manipulation",
              transition: "border-color 0.15s",
              caretColor: "#22d3ee",
            }}
          />
        </div>
      )}

      {/* Done screen */}
      {phase === "done" && (
        <div style={{
          background: "rgba(34,211,238,0.08)",
          border: "2px solid rgba(34,211,238,0.3)",
          borderRadius: 20,
          padding: "24px 32px",
          textAlign: "center",
          width: "100%",
          maxWidth: 360,
        }}>
          <div style={{ fontSize: 14, color: "#67e8f9", marginBottom: 8, fontWeight: 600 }}>
            Final Results
          </div>
          <div style={{ display: "flex", justifyContent: "center", gap: 32 }}>
            <div>
              <div style={{ fontSize: 42, fontWeight: 900, color: "#22d3ee" }}>{score}</div>
              <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 2 }}>words</div>
            </div>
            <div style={{ width: 1, background: "rgba(255,255,255,0.1)" }} />
            <div>
              <div style={{ fontSize: 42, fontWeight: 900, color: "#a78bfa" }}>{wpm}</div>
              <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 2 }}>WPM</div>
            </div>
          </div>
          {wpm >= 40 && (
            <div style={{
              marginTop: 12,
              fontSize: 13,
              color: "#fbbf24",
              fontWeight: 700,
            }}>
              {wpm >= 60 ? "Lightning fast!" : wpm >= 50 ? "Super speedy!" : "Nice speed!"}
            </div>
          )}
        </div>
      )}

      {/* Start / Play Again button */}
      {(phase === "idle" || phase === "done") && (
        <button
          onClick={startGame}
          style={{
            background: "linear-gradient(135deg, #0891b2, #0e7490)",
            color: "#fff",
            border: "none",
            borderRadius: 16,
            padding: "14px 40px",
            fontSize: 17,
            fontWeight: 700,
            cursor: "pointer",
            touchAction: "manipulation",
            boxShadow: "0 4px 20px rgba(8,145,178,0.4)",
            letterSpacing: "-0.01em",
          }}
        >
          {phase === "idle" ? "Start Race" : "Play Again"}
        </button>
      )}

      <p style={{ fontSize: 11, color: "#ffffff25", marginTop: "auto" }}>
        60 second timer · auto-advances on correct word
      </p>
    </div>
  );
}
