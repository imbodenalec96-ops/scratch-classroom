import React, { useState, useEffect, useRef, useCallback } from "react";

// Simon Says — 4 colored buttons, watch the pattern then repeat it
const COLORS = [
  { id: 0, bg: "#ef4444", lit: "#fca5a5", label: "🔴", key: "q" },
  { id: 1, bg: "#3b82f6", lit: "#93c5fd", label: "🔵", key: "w" },
  { id: 2, bg: "#22c55e", lit: "#86efac", label: "🟢", key: "a" },
  { id: 3, bg: "#f59e0b", lit: "#fde68a", label: "🟡", key: "s" },
];

type Phase = "idle" | "showing" | "input" | "win" | "lose";

export default function SimonSays() {
  const [seq, setSeq] = useState<number[]>([]);
  const [userSeq, setUserSeq] = useState<number[]>([]);
  const [phase, setPhase] = useState<Phase>("idle");
  const [lit, setLit] = useState<number | null>(null);
  const [round, setRound] = useState(0);
  const [best, setBest] = useState(() => Number(localStorage.getItem("simon_best") || 0));
  const [speed, setSpeed] = useState<"slow" | "normal" | "fast">("normal");
  const timeouts = useRef<ReturnType<typeof setTimeout>[]>([]);

  const clearTimers = () => { timeouts.current.forEach(clearTimeout); timeouts.current = []; };

  const playSeq = useCallback((sequence: number[], ms: number) => {
    clearTimers();
    setPhase("showing"); setLit(null);
    sequence.forEach((id, i) => {
      const t1 = setTimeout(() => setLit(id), i * (ms + 120));
      const t2 = setTimeout(() => setLit(null), i * (ms + 120) + ms);
      timeouts.current.push(t1, t2);
    });
    const tEnd = setTimeout(() => { setPhase("input"); setUserSeq([]); }, sequence.length * (ms + 120) + 200);
    timeouts.current.push(tEnd);
  }, []);

  const start = useCallback(() => {
    clearTimers();
    const ms = speed === "slow" ? 700 : speed === "fast" ? 300 : 500;
    const first = [Math.floor(Math.random() * 4)];
    setSeq(first); setRound(1); setUserSeq([]);
    playSeq(first, ms);
  }, [playSeq, speed]);

  const press = useCallback((id: number) => {
    if (phase !== "input") return;
    setLit(id); setTimeout(() => setLit(null), 150);

    setUserSeq(prev => {
      const next = [...prev, id];
      const pos = next.length - 1;
      if (seq[pos] !== id) {
        // Wrong!
        clearTimers();
        setPhase("lose");
        setBest(b => { const nb = Math.max(b, round); localStorage.setItem("simon_best", String(nb)); return nb; });
        return next;
      }
      if (next.length === seq.length) {
        // Correct round!
        const newRound = round + 1;
        setRound(newRound);
        const ms = speed === "slow" ? 700 : speed === "fast" ? 300 : 500;
        const newSeq = [...seq, Math.floor(Math.random() * 4)];
        setSeq(newSeq);
        const t = setTimeout(() => playSeq(newSeq, ms), 600);
        timeouts.current.push(t);
        if (newRound > 20) { clearTimers(); setPhase("win"); }
      }
      return next;
    });
  }, [phase, seq, round, playSeq, speed]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      COLORS.forEach(c => { if (e.key === c.key) press(c.id); });
    };
    window.addEventListener("keydown", h);
    return () => { window.removeEventListener("keydown", h); clearTimers(); };
  }, [press]);

  const STATUS: Record<Phase, string> = {
    idle: "Press Start to play!", showing: "👀 Watch carefully…", input: "🎯 Your turn! Repeat the pattern.",
    win: "🎉 Amazing! You beat level 20!", lose: `💥 Oops! You reached round ${round}.`,
  };

  return (
    <div className="flex flex-col items-center gap-5 p-6 min-h-full" style={{ background: "#0f172a" }}>
      {/* Stats */}
      <div className="flex gap-4 text-sm text-white/70">
        <span>Round <b className="text-white">{round}</b></span>
        <span>Best <b className="text-white">{best}</b></span>
        <select value={speed} onChange={e => setSpeed(e.target.value as any)}
          className="bg-white/10 text-white text-xs px-2 py-1 rounded-lg border border-white/20">
          <option value="slow">🐢 Slow</option>
          <option value="normal">⚡ Normal</option>
          <option value="fast">🚀 Fast</option>
        </select>
      </div>

      <p className="text-center text-white/80 text-sm font-medium min-h-[20px]">{STATUS[phase]}</p>

      {/* 2×2 button grid */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        {COLORS.map(c => (
          <button
            key={c.id}
            onClick={() => press(c.id)}
            disabled={phase !== "input"}
            style={{
              width: 130, height: 130, borderRadius: 24,
              background: lit === c.id ? c.lit : c.bg,
              border: `4px solid ${lit === c.id ? "#fff" : c.bg + "aa"}`,
              boxShadow: lit === c.id ? `0 0 40px ${c.lit}, 0 0 80px ${c.lit}40` : "0 6px 0 rgba(0,0,0,0.4)",
              transform: lit === c.id ? "scale(1.06)" : phase === "input" ? "scale(1)" : "scale(0.97)",
              transition: "all 0.08s ease",
              cursor: phase === "input" ? "pointer" : "default",
              fontSize: 40, touchAction: "manipulation",
            }}
          >
            {c.label}
          </button>
        ))}
      </div>

      {/* Progress dots */}
      {seq.length > 0 && (
        <div className="flex gap-1.5 flex-wrap justify-center max-w-xs">
          {seq.map((id, i) => (
            <div key={i} style={{ width: 12, height: 12, borderRadius: "50%",
              background: i < userSeq.length ? COLORS[seq[i]].bg : "#ffffff20",
              border: "2px solid " + (i < userSeq.length ? COLORS[seq[i]].bg : "#ffffff30"),
            }} />
          ))}
        </div>
      )}

      {(phase === "idle" || phase === "lose" || phase === "win") && (
        <button onClick={start} className="bg-purple-500 hover:bg-purple-400 text-white px-8 py-3 rounded-2xl font-bold text-lg border-2 border-purple-400"
          style={{ touchAction: "manipulation" }}>
          {phase === "idle" ? "▶ Start" : "🔄 Play Again"}
        </button>
      )}

      <p className="text-white/25 text-xs">Keyboard: Q=🔴  W=🔵  A=🟢  S=🟡</p>
    </div>
  );
}
