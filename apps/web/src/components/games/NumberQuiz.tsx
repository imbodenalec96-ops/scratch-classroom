import React, { useState, useEffect, useCallback } from "react";

type Q = { question: string; answer: number; choices: number[] };

function genQ(level: number): Q {
  const ops = level < 3 ? ["add", "sub"] : level < 6 ? ["add", "sub", "mul"] : ["add", "sub", "mul", "div"];
  const op = ops[Math.floor(Math.random() * ops.length)];
  let a: number, b: number, answer: number, question: string;
  if (op === "add") {
    a = Math.floor(Math.random() * (10 * level)) + 1;
    b = Math.floor(Math.random() * (10 * level)) + 1;
    answer = a + b; question = `${a} + ${b} = ?`;
  } else if (op === "sub") {
    a = Math.floor(Math.random() * (10 * level)) + 5;
    b = Math.floor(Math.random() * a) + 1;
    answer = a - b; question = `${a} − ${b} = ?`;
  } else if (op === "mul") {
    a = Math.floor(Math.random() * Math.min(12, level * 2)) + 2;
    b = Math.floor(Math.random() * Math.min(12, level * 2)) + 2;
    answer = a * b; question = `${a} × ${b} = ?`;
  } else {
    b = Math.floor(Math.random() * 11) + 2;
    answer = Math.floor(Math.random() * 11) + 1;
    a = b * answer;
    question = `${a} ÷ ${b} = ?`;
  }
  // Wrong choices
  const wrongs = new Set<number>();
  while (wrongs.size < 3) {
    const d = Math.floor(Math.random() * (Math.max(4, Math.floor(answer * 0.5)))) + 1;
    const w = answer + (Math.random() < 0.5 ? d : -d);
    if (w !== answer && w > 0) wrongs.add(w);
  }
  return { question, answer, choices: [answer, ...wrongs].sort(() => Math.random() - 0.5) };
}

const TOTAL = 10;
const TIME_PER_Q = 15;

export default function NumberQuiz() {
  const [level] = useState(1);
  const [q, setQ] = useState<Q>(() => genQ(1));
  const [qNum, setQNum] = useState(1);
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [timeLeft, setTimeLeft] = useState(TIME_PER_Q);
  const [chosen, setChosen] = useState<number | null>(null);
  const [done, setDone] = useState(false);
  const [feedback, setFeedback] = useState<"correct" | "wrong" | null>(null);

  const next = useCallback(() => {
    if (qNum >= TOTAL) { setDone(true); return; }
    setQ(genQ(Math.min(10, Math.ceil((qNum + 1) / 2))));
    setQNum(n => n + 1);
    setChosen(null);
    setFeedback(null);
    setTimeLeft(TIME_PER_Q);
  }, [qNum]);

  useEffect(() => {
    if (done || chosen !== null) return;
    if (timeLeft <= 0) {
      setFeedback("wrong");
      setStreak(0);
      setTimeout(next, 900);
      return;
    }
    const t = setTimeout(() => setTimeLeft(t => t - 1), 1000);
    return () => clearTimeout(t);
  }, [timeLeft, done, chosen, next]);

  const choose = (v: number) => {
    if (chosen !== null) return;
    setChosen(v);
    const correct = v === q.answer;
    setFeedback(correct ? "correct" : "wrong");
    if (correct) {
      const bonus = Math.max(1, Math.floor(timeLeft / 3));
      setScore(s => s + 10 + bonus * streak);
      setStreak(s => s + 1);
    } else {
      setStreak(0);
    }
    setTimeout(next, 900);
  };

  const restart = () => {
    setQ(genQ(1)); setQNum(1); setScore(0); setStreak(0);
    setTimeLeft(TIME_PER_Q); setChosen(null); setFeedback(null); setDone(false);
  };

  const pct = (timeLeft / TIME_PER_Q) * 100;

  return (
    <div className="flex flex-col items-center justify-center h-full gap-6 p-6 select-none" style={{ background: "#07071a" }}>
      {!done ? (
        <>
          {/* Header */}
          <div className="w-full max-w-sm flex items-center justify-between">
            <span className="text-xs text-white/40">Q {qNum}/{TOTAL}</span>
            <span className="text-sm font-bold">
              {streak >= 2 && <span className="text-orange-400 text-xs mr-1">🔥 ×{streak}</span>}
              <span className="text-yellow-400">{score}</span> pts
            </span>
          </div>

          {/* Timer bar */}
          <div className="w-full max-w-sm h-2 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.08)" }}>
            <div
              className="h-full rounded-full transition-all duration-1000"
              style={{
                width: `${pct}%`,
                background: timeLeft > 7 ? "#22c55e" : timeLeft > 3 ? "#f59e0b" : "#ef4444",
              }}
            />
          </div>

          {/* Question */}
          <div
            className="w-full max-w-sm rounded-2xl p-6 text-center"
            style={{ background: "rgba(139,92,246,0.12)", border: "1px solid rgba(139,92,246,0.3)" }}
          >
            <div className="text-2xl font-mono font-extrabold text-white">{q.question}</div>
            {feedback && (
              <div className={`mt-2 text-sm font-bold ${feedback === "correct" ? "text-green-400" : "text-red-400"}`}>
                {feedback === "correct" ? "✓ Correct!" : `✗ Answer: ${q.answer}`}
              </div>
            )}
          </div>

          {/* Choices */}
          <div className="grid grid-cols-2 gap-3 w-full max-w-sm">
            {q.choices.map((c, i) => {
              const isChosen = chosen === c;
              const isCorrect = c === q.answer;
              let bg = "rgba(255,255,255,0.05)";
              let border = "rgba(255,255,255,0.1)";
              if (chosen !== null) {
                if (isCorrect) { bg = "rgba(34,197,94,0.2)"; border = "rgba(34,197,94,0.6)"; }
                else if (isChosen) { bg = "rgba(239,68,68,0.2)"; border = "rgba(239,68,68,0.6)"; }
              }
              return (
                <button
                  key={i}
                  onClick={() => choose(c)}
                  disabled={chosen !== null}
                  className="py-4 rounded-xl text-xl font-bold text-white transition-all duration-200"
                  style={{
                    background: bg, border: `1px solid ${border}`,
                    transform: isChosen ? "scale(0.97)" : "scale(1)",
                    cursor: chosen !== null ? "default" : "pointer",
                  }}
                >
                  {c}
                </button>
              );
            })}
          </div>
        </>
      ) : (
        <div className="text-center">
          <div className="text-5xl mb-4">{score >= 80 ? "🏆" : score >= 50 ? "🎉" : "📚"}</div>
          <div className="text-white font-extrabold text-2xl mb-2">
            {score >= 80 ? "Math Genius!" : score >= 50 ? "Great work!" : "Keep practicing!"}
          </div>
          <div className="text-yellow-400 font-bold text-3xl mb-1">{score} pts</div>
          <div className="text-white/40 text-sm mb-6">out of {TOTAL} questions</div>
          <button onClick={restart} className="px-6 py-2.5 rounded-xl bg-violet-600 text-white font-bold hover:bg-violet-500 transition-colors">Play Again</button>
        </div>
      )}
    </div>
  );
}
