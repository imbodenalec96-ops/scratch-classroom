// Bathroom / Water / Sensory-break pass modal. Pops when a pass-action
// barcode is scanned. Shows currently-out students (so a second scan
// can return them) plus a student grid to start a new pass.

import { useEffect, useState } from "react";
import { StarStore, type StarStudent, type ActivePass } from "../../lib/star/storage.ts";
import { successBeep, loggedBeep, errorBeep } from "../../lib/star/sounds.ts";
import { fireStarBoardEvent } from "../../lib/star/boardEvents.ts";

interface Props {
  passKind: "Bathroom" | "Water" | "Break";
  onClose: () => void;
}

const ICON: Record<Props["passKind"], string> = {
  Bathroom: "🚻", Water: "💧", Break: "🛋",
};

export default function PassModal({ passKind, onClose }: Props) {
  const [students] = useState<StarStudent[]>(() => StarStore.getStudents());
  const [active, setActive] = useState<ActivePass[]>(() => StarStore.getActivePasses());
  const [now, setNow] = useState(Date.now());

  // Tick once per second so elapsed times read live.
  useEffect(() => {
    const iv = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(iv);
  }, []);

  const startPass = (student: StarStudent) => {
    if (active.find((p) => p.studentId === student.id)) {
      errorBeep();
      return;
    }
    const pass: ActivePass = {
      studentId: student.id,
      studentName: `${student.firstName} ${student.lastName}`.trim(),
      passKind,
      startedAt: new Date().toISOString(),
    };
    const next = [...active, pass];
    StarStore.setActivePasses(next);
    setActive(next);
    successBeep();
    fireStarBoardEvent({
      kind: "pass-out",
      studentName: pass.studentName,
      studentId: pass.studentId,
      detail: passKind,
    });
  };

  const endPass = (pass: ActivePass) => {
    const elapsedSec = Math.round((Date.now() - new Date(pass.startedAt).getTime()) / 1000);
    const next = active.filter((p) => p.studentId !== pass.studentId);
    StarStore.setActivePasses(next);
    setActive(next);
    // Append to log
    const log = StarStore.getPassLog();
    log.unshift({ ...pass, endedAt: new Date().toISOString(), elapsedSec });
    StarStore.setPassLog(log.slice(0, 200));
    loggedBeep();
    fireStarBoardEvent({
      kind: "pass-in",
      studentName: pass.studentName,
      studentId: pass.studentId,
      detail: passKind,
      elapsedSec,
    });
  };

  return (
    <div onClick={(e) => { if (e.target === e.currentTarget) onClose(); }} style={{
      position: "fixed", inset: 0, zIndex: 800,
      background: "rgba(0,0,0,0.65)", backdropFilter: "blur(6px)",
      display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
    }}>
      <div style={{
        background: "linear-gradient(180deg, #0f172a 0%, #1e1b2e 100%)",
        border: "1px solid rgba(255,255,255,0.10)",
        borderRadius: 18, width: "min(720px, 96vw)", maxHeight: "92vh",
        overflow: "auto", padding: 22, color: "#f5f1e8",
        boxShadow: "0 24px 64px rgba(0,0,0,0.5)",
      }}>
        <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.2em", textTransform: "uppercase", opacity: 0.55 }}>
              {ICON[passKind]} {passKind} Pass
            </div>
            <div style={{ fontSize: 22, fontWeight: 800, marginTop: 2 }}>
              {active.length > 0 ? "Tap a student to mark return — or pick a new one" : "Pick a student to send out"}
            </div>
          </div>
          <button onClick={onClose} style={{
            width: 34, height: 34, borderRadius: 8,
            background: "rgba(255,255,255,0.05)", color: "white",
            border: "1px solid rgba(255,255,255,0.15)", cursor: "pointer", fontWeight: 800,
          }}>✕</button>
        </header>

        {/* Currently out */}
        {active.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.18em", textTransform: "uppercase", opacity: 0.55, marginBottom: 8, color: "#fbbf24" }}>
              ⏱ Currently Out ({active.length})
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 8 }}>
              {active.map((p) => {
                const elapsedSec = Math.max(0, Math.round((now - new Date(p.startedAt).getTime()) / 1000));
                const overLimit = elapsedSec > 5 * 60;
                return (
                  <button key={p.studentId} onClick={() => endPass(p)} style={{
                    padding: "12px", borderRadius: 12, textAlign: "left",
                    background: overLimit
                      ? "linear-gradient(135deg, rgba(239,68,68,0.30), rgba(178,58,72,0.20))"
                      : "linear-gradient(135deg, rgba(251,191,36,0.20), rgba(217,119,6,0.10))",
                    border: overLimit ? "2px solid #ef4444" : "1px solid rgba(251,191,36,0.50)",
                    color: "white", cursor: "pointer",
                    animation: overLimit ? "passPulse 1.2s ease-in-out infinite" : "none",
                  }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                      <span style={{ fontWeight: 800, fontSize: 15 }}>{p.studentName}</span>
                      <span style={{ fontSize: 11, opacity: 0.7 }}>{ICON[p.passKind]}</span>
                    </div>
                    <div style={{ fontSize: 22, fontWeight: 900, marginTop: 4, fontFamily: "Menlo, monospace", color: overLimit ? "#fecaca" : "#fde68a" }}>
                      {fmtElapsed(elapsedSec)}
                    </div>
                    <div style={{ fontSize: 11, opacity: 0.7, marginTop: 2 }}>
                      Tap to return{overLimit ? " — over 5 min!" : ""}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Send out — student grid */}
        <div>
          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.18em", textTransform: "uppercase", opacity: 0.55, marginBottom: 8 }}>
            Send Out
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(110px, 1fr))", gap: 8 }}>
            {students.map((s) => {
              const isOut = !!active.find((p) => p.studentId === s.id);
              const initial = (s.firstName || "?")[0].toUpperCase();
              return (
                <button key={s.id} onClick={() => !isOut && startPass(s)} disabled={isOut} style={{
                  padding: "10px 8px", borderRadius: 10,
                  background: isOut ? "rgba(255,255,255,0.02)" : "rgba(255,255,255,0.05)",
                  border: "1px solid rgba(255,255,255,0.10)",
                  color: "white", cursor: isOut ? "not-allowed" : "pointer",
                  opacity: isOut ? 0.4 : 1,
                  display: "flex", flexDirection: "column", alignItems: "center", gap: 6,
                }}>
                  <div style={{
                    width: 36, height: 36, borderRadius: "50%",
                    background: "linear-gradient(135deg, #6366f1, #b23a48)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontWeight: 800, fontSize: 16,
                  }}>{initial}</div>
                  <span style={{ fontSize: 12, fontWeight: 700 }}>{s.firstName}</span>
                  {isOut && <span style={{ fontSize: 10, opacity: 0.7 }}>currently out</span>}
                </button>
              );
            })}
          </div>
        </div>

        <style>{`
          @keyframes passPulse {
            0%, 100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(239,68,68,0.7); }
            50%      { transform: scale(1.03); box-shadow: 0 0 0 8px rgba(239,68,68,0); }
          }
        `}</style>
      </div>
    </div>
  );
}

function fmtElapsed(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}
