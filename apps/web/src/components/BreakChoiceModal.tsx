import React, { useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import {
  getBreakState, shouldOfferBreak, chooseBreak, chooseFullWork,
  isOnBreak, breakSecondsRemaining, setBreakState,
} from "../lib/breakSystem.ts";

// Inject keyframes the pill + toast depend on (scaleIn may already exist,
// but pulseRed is defined only inside BreakSystem.tsx which isn't mounted here).
const BREAK_MODAL_CSS = `
@keyframes blockforgeBreakPulse {
  0%,100% { box-shadow: 0 4px 20px rgba(239,68,68,0.55), 0 0 0 0 rgba(239,68,68,0); }
  50%     { box-shadow: 0 4px 20px rgba(239,68,68,0.8),  0 0 0 10px rgba(239,68,68,0.22); }
}
@keyframes blockforgeBreakToastIn {
  0%   { opacity: 0; transform: translate(-50%, 24px) scale(0.92); }
  60%  { opacity: 1; transform: translate(-50%, -6px) scale(1.03); }
  100% { opacity: 1; transform: translate(-50%, 0)    scale(1);    }
}
`;
let breakModalCssInjected = false;
function injectBreakModalCss() {
  if (breakModalCssInjected || typeof document === "undefined") return;
  breakModalCssInjected = true;
  const el = document.createElement("style");
  el.textContent = BREAK_MODAL_CSS;
  document.head.appendChild(el);
}

/**
 * BreakChoiceModal + BreakCountdownBanner
 *
 * - After 10 min of continuous work (tracked via breakSystem.workStartAt)
 *   the modal auto-appears exactly once per day.
 * - If student picks "Take break" → limited-arcade mode kicks in globally.
 * - If student picks "Earn full access" → the existing isWorkUnlocked flow
 *   awards everything once all work is done.
 * - During a break, a bottom banner counts down and force-returns the
 *   student to /student at 0:00.
 */

export default function BreakChoiceModal() {
  injectBreakModalCss();
  const navigate = useNavigate();
  const location = useLocation();
  const [offered, setOffered] = useState(false);
  const [onBreak, setOnBreak] = useState(false);
  const [secLeft, setSecLeft] = useState(0);
  const [toast, setToast] = useState<string | null>(null);

  // Poll break system state (modal offer + countdown)
  useEffect(() => {
    const tick = () => {
      setOffered(shouldOfferBreak());
      setOnBreak(isOnBreak());
      setSecLeft(breakSecondsRemaining());
    };
    tick();
    const iv = setInterval(tick, 1000);
    const onChange = () => tick();
    window.addEventListener("breakstate-change", onChange);
    return () => { clearInterval(iv); window.removeEventListener("breakstate-change", onChange); };
  }, []);

  // Teacher-forced end ("End Break Now"): reset state and kick back to work.
  useEffect(() => {
    const onForceEnd = () => {
      setBreakState({ path: null, breakStartAt: 0, breakEndAt: 0, workStartAt: Date.now() });
      setToast("⛔ Your teacher ended break. Back to work 📚");
      setTimeout(() => setToast(null), 4000);
      navigate("/student");
    };
    window.addEventListener("blockforge:end-break", onForceEnd);
    return () => window.removeEventListener("blockforge:end-break", onForceEnd);
  }, [navigate]);

  // When break ends, force-return to assignments and clear break path so
  // student can't re-enter the arcade until next work cycle earns another
  useEffect(() => {
    if (!onBreak && secLeft === 0) {
      const s = getBreakState();
      if (s.path === "break" && s.breakEndAt && Date.now() >= s.breakEndAt) {
        // Mark break as used; force-return to assignments
        setBreakState({ path: null, breakStartAt: 0, breakEndAt: 0, workStartAt: Date.now() });
        setToast("⏰ Break's over — back to work 📚");
        setTimeout(() => setToast(null), 4000);
        navigate("/student");
      }
    }
  }, [onBreak, secLeft, navigate]);

  const handleTakeBreak = () => {
    chooseBreak();                         // writes localStorage + fires breakstate-change
    setOffered(false);
    // STAY on /student — the dashboard listens for breakstate-change and
    // auto-flips to the "playground" view with arcade/projects/youtube cards
    // + the pill pinned top-right. If the student wants the full Arcade they
    // can click it in the nav. Navigating to /arcade here caused the old
    // "restarted the assignments" bug because the layout remounted before
    // the playground render propagated. Leave them on /student.
    if (location.pathname !== "/student") navigate("/student");
  };

  const handleEarnAccess = () => {
    chooseFullWork();
    setOffered(false);
  };

  return (
    <>
      {/* The 10-min-work choice modal */}
      {offered && !onBreak && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 900,
          background: "rgba(0,0,0,0.7)", backdropFilter: "blur(6px)",
          display: "flex", alignItems: "center", justifyContent: "center",
          padding: 20,
        }}>
          <div style={{
            maxWidth: 560, width: "100%",
            background: "linear-gradient(135deg, #0f0726, #1a0a35)",
            borderRadius: 20,
            border: "1px solid rgba(139,92,246,0.3)",
            boxShadow: "0 20px 60px rgba(0,0,0,0.5)",
            padding: 32,
            textAlign: "center",
            animation: "scaleIn 0.25s cubic-bezier(0.34,1.56,0.64,1)",
          }}>
            <div style={{ fontSize: 48, marginBottom: 8 }}>🎉</div>
            <h2 style={{ color: "white", fontSize: 22, fontWeight: 800, margin: "0 0 4px" }}>
              You earned a choice!
            </h2>
            <p style={{ color: "rgba(255,255,255,0.55)", fontSize: 13, margin: "0 0 24px" }}>
              You've been working hard for 10 minutes. Pick one:
            </p>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              {/* Option A: Break */}
              <button onClick={handleTakeBreak}
                style={{
                  padding: "20px 16px", borderRadius: 16,
                  background: "linear-gradient(135deg, #8b5cf6, #6366f1)",
                  border: "1px solid rgba(139,92,246,0.5)",
                  color: "white", cursor: "pointer",
                  display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-start",
                  textAlign: "left",
                  transition: "transform 0.15s, box-shadow 0.15s",
                  touchAction: "manipulation", minHeight: 140,
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.transform = "translateY(-2px)"; (e.currentTarget as HTMLElement).style.boxShadow = "0 8px 24px rgba(139,92,246,0.3)"; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = ""; (e.currentTarget as HTMLElement).style.boxShadow = ""; }}
              >
                <span style={{ fontSize: 32 }}>🎮</span>
                <span style={{ fontWeight: 800, fontSize: 15 }}>Take a 10-min break</span>
                <span style={{ fontSize: 11, opacity: 0.85, lineHeight: 1.4 }}>
                  Full Arcade, Projects, and YouTube library unlocked for 10 min.
                  Auto-return to work when the timer hits 0:00.
                </span>
              </button>

              {/* Option B: Earn full access */}
              <button onClick={handleEarnAccess}
                style={{
                  padding: "20px 16px", borderRadius: 16,
                  background: "linear-gradient(135deg, #10b981, #059669)",
                  border: "1px solid rgba(16,185,129,0.5)",
                  color: "white", cursor: "pointer",
                  display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-start",
                  textAlign: "left",
                  transition: "transform 0.15s, box-shadow 0.15s",
                  touchAction: "manipulation", minHeight: 140,
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.transform = "translateY(-2px)"; (e.currentTarget as HTMLElement).style.boxShadow = "0 8px 24px rgba(16,185,129,0.3)"; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = ""; (e.currentTarget as HTMLElement).style.boxShadow = ""; }}
              >
                <span style={{ fontSize: 32 }}>⚡</span>
                <span style={{ fontWeight: 800, fontSize: 15 }}>Earn full access</span>
                <span style={{ fontSize: 11, opacity: 0.85, lineHeight: 1.4 }}>
                  Finish all your work. Unlocks the full arcade,
                  Projects, BlockForge Studio, and the 3D stage.
                </span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Floating break countdown pill (top-right) */}
      {onBreak && secLeft > 0 && (() => {
        const mm = Math.floor(secLeft / 60);
        const ss = String(secLeft % 60).padStart(2, "0");
        const urgent = secLeft <= 60;
        return (
          <div style={{
            position: "fixed", top: 16, right: 16, zIndex: 9500,
            display: "flex", alignItems: "center", gap: 8,
            padding: "8px 14px 8px 10px",
            borderRadius: 999,
            background: urgent
              ? "linear-gradient(135deg, #ef4444, #f59e0b)"
              : "linear-gradient(135deg, #6366f1, #8b5cf6)",
            color: "white",
            fontSize: 13, fontWeight: 700,
            boxShadow: urgent
              ? "0 4px 20px rgba(239,68,68,0.55)"
              : "0 4px 18px rgba(139,92,246,0.45)",
            border: "1.5px solid rgba(255,255,255,0.2)",
            backdropFilter: "blur(6px)",
            animation: urgent ? "blockforgeBreakPulse 1.1s ease-in-out infinite" : undefined,
            pointerEvents: "none",
            userSelect: "none",
          }}
          aria-live="polite"
          >
            <span style={{ fontSize: 16 }}>☕</span>
            <span style={{ opacity: 0.9, fontWeight: 600 }}>Break</span>
            <span style={{
              background: "rgba(0,0,0,0.28)", padding: "3px 10px", borderRadius: 999,
              fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
              fontSize: 13, fontVariantNumeric: "tabular-nums",
              letterSpacing: "0.03em",
            }}>
              {mm}:{ss}
            </span>
          </div>
        );
      })()}

      {/* End-of-break toast */}
      {toast && (
        <div style={{
          position: "fixed", bottom: 32, left: "50%",
          transform: "translateX(-50%)", zIndex: 9600,
          background: "linear-gradient(135deg, #4f46e5, #7c3aed)",
          color: "white", padding: "14px 28px", borderRadius: 16,
          fontSize: 15, fontWeight: 700,
          boxShadow: "0 12px 40px rgba(79,70,229,0.45)",
          animation: "blockforgeBreakToastIn 0.4s cubic-bezier(0.22,1,0.36,1) forwards",
        }}>
          {toast}
        </div>
      )}
    </>
  );
}
