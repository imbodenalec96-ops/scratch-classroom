import React, { useState, useEffect, useRef, useCallback } from "react";

export default function WhackAMole() {
  const [score, setScore] = useState(0);
  const [timeLeft, setTimeLeft] = useState(30);
  const [running, setRunning] = useState(false);
  const [holes, setHoles] = useState<(boolean)[]>(Array(9).fill(false));
  const [whacked, setWhacked] = useState<boolean[]>(Array(9).fill(false));
  const [best, setBest] = useState(0);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  const clearTimers = () => { timersRef.current.forEach(clearTimeout); timersRef.current = []; };

  const popMole = useCallback(() => {
    const idx = Math.floor(Math.random() * 9);
    setHoles(h => { const n=[...h]; n[idx]=true; return n; });
    const t = setTimeout(() => {
      setHoles(h => { const n=[...h]; n[idx]=false; return n; });
    }, 800 + Math.random()*400);
    timersRef.current.push(t);
  }, []);

  useEffect(() => {
    if (!running) return;
    const interval = setInterval(popMole, 700);
    const countdown = setInterval(() => setTimeLeft(t => { if(t<=1){setRunning(false);clearTimers();clearInterval(interval);clearInterval(countdown);return 0;} return t-1; }), 1000);
    return () => { clearInterval(interval); clearInterval(countdown); clearTimers(); };
  }, [running, popMole]);

  const start = () => { setScore(0); setTimeLeft(30); setHoles(Array(9).fill(false)); setWhacked(Array(9).fill(false)); setRunning(true); };

  const hit = (i: number) => {
    if (!running || !holes[i]) return;
    setHoles(h => { const n=[...h]; n[i]=false; return n; });
    setWhacked(w => { const n=[...w]; n[i]=true; return n; });
    setTimeout(() => setWhacked(w => { const n=[...w]; n[i]=false; return n; }), 200);
    setScore(s => { const ns=s+10; if(ns>best) setBest(ns); return ns; });
  };

  return (
    <div className="flex flex-col items-center gap-4 p-4 select-none" style={{background:"#0f172a",minHeight:400,borderRadius:12}}>
      <div className="flex gap-6 text-white">
        <span>Score: <b className="text-yellow-400">{score}</b></span>
        <span>Best: <b className="text-purple-400">{best}</b></span>
        <span>Time: <b className={timeLeft<=5?"text-red-400":"text-cyan-400"}>{timeLeft}s</b></span>
      </div>
      <div className="grid grid-cols-3 gap-4">
        {holes.map((up, i) => (
          <button key={i} onPointerDown={() => hit(i)}
            style={{width:90,height:90,borderRadius:"50%",border:"none",cursor:"pointer",
              background: whacked[i] ? "#fbbf24" : up ? "#84cc16" : "#1e293b",
              boxShadow: up ? "0 0 20px #84cc1680" : "inset 0 4px 8px rgba(0,0,0,0.5)",
              transform: up ? "scale(1.1)" : "scale(1)",
              transition:"all 0.1s",fontSize:36}}>
            {up ? "🐹" : whacked[i] ? "⭐" : ""}
          </button>
        ))}
      </div>
      {!running && (
        <button onPointerDown={start} style={{background:"#7c3aed",color:"white",border:"none",borderRadius:8,padding:"10px 28px",fontSize:16,cursor:"pointer",fontWeight:"bold"}}>
          {timeLeft===30 ? "Start Game" : `Play Again (${score} pts)`}
        </button>
      )}
    </div>
  );
}
