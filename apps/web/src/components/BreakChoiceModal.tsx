import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  getBreakState, shouldOfferBreak, chooseBreak, chooseFullWork,
  isOnBreak, breakSecondsRemaining, setBreakState,
} from "../lib/breakSystem.ts";

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
  const navigate = useNavigate();
  const [offered, setOffered] = useState(false);
  const [onBreak, setOnBreak] = useState(false);
  const [secLeft, setSecLeft] = useState(0);

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

  // When break ends, force-return to assignments and clear break path so
  // student can't re-enter the arcade until next work cycle earns another
  useEffect(() => {
    if (!onBreak && secLeft === 0) {
      const s = getBreakState();
      if (s.path === "break" && s.breakEndAt && Date.now() >= s.breakEndAt) {
        // Mark break as used; force-return to assignments
        setBreakState({ path: null, breakStartAt: 0, breakEndAt: 0, workStartAt: Date.now() });
        navigate("/student");
      }
    }
  }, [onBreak, secLeft, navigate]);

  const handleTakeBreak = () => {
    chooseBreak();
    setOffered(false);
    navigate("/arcade");
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
                  Limited arcade games. No Projects, no BlockForge Studio.
                  Auto-return to work when done.
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

      {/* Break countdown banner */}
      {onBreak && secLeft > 0 && (
        <div style={{
          position: "fixed", top: 0, left: 0, right: 0, zIndex: 800,
          background: "linear-gradient(90deg, #6366f1, #8b5cf6, #6366f1)",
          color: "white", padding: "8px 18px",
          display: "flex", alignItems: "center", gap: 12,
          fontSize: 13, fontWeight: 600,
          boxShadow: "0 2px 10px rgba(139,92,246,0.25)",
        }}>
          <span>☕</span>
          <span>Break time</span>
          <span style={{
            marginLeft: "auto",
            background: "rgba(0,0,0,0.25)", padding: "3px 12px", borderRadius: 10,
            fontFamily: "monospace", fontSize: 14, fontWeight: 800,
            letterSpacing: "0.05em",
          }}>
            {Math.floor(secLeft / 60)}:{String(secLeft % 60).padStart(2, "0")}
          </span>
          <span style={{ fontSize: 11, opacity: 0.75 }}>
            You'll auto-return to work at 0:00
          </span>
        </div>
      )}
    </>
  );
}
