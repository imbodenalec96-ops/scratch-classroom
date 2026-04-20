import React, { useEffect, useState, useSyncExternalStore } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import {
  getBreakState, shouldOfferBreak, chooseBreak, chooseFullWork,
  isOnBreak, breakSecondsRemaining, setBreakState,
} from "../lib/breakSystem.ts";
import { clearWorkUnlock } from "../lib/workUnlock.ts";
import { studentFreetimeStore } from "../lib/studentFreetimeStore.ts";

const CSS = `
@keyframes bcmFadeIn {
  from { opacity: 0; }
  to   { opacity: 1; }
}
@keyframes bcmSlideUp {
  from { opacity: 0; transform: translateY(32px) scale(0.95); }
  to   { opacity: 1; transform: translateY(0) scale(1); }
}
@keyframes bcmPulse {
  0%,100% { box-shadow: 0 0 0 0 rgba(139,92,246,0.5); }
  60%     { box-shadow: 0 0 0 12px rgba(139,92,246,0); }
}
@keyframes bcmUrgentPulse {
  0%,100% { box-shadow: 0 0 0 0 rgba(239,68,68,0.5); }
  60%     { box-shadow: 0 0 0 12px rgba(239,68,68,0); }
}
@keyframes bcmToastIn {
  from { opacity: 0; transform: translate(-50%, 20px) scale(0.92); }
  to   { opacity: 1; transform: translate(-50%, 0) scale(1); }
}
@keyframes bcmSpin {
  from { transform: rotate(0deg); }
  to   { transform: rotate(360deg); }
}
@keyframes bcmBounce {
  0%,100% { transform: translateY(0); }
  40%     { transform: translateY(-8px); }
}
`;

let cssInjected = false;
function injectCss() {
  if (cssInjected || typeof document === "undefined") return;
  cssInjected = true;
  const el = document.createElement("style");
  el.textContent = CSS;
  document.head.appendChild(el);
}

export default function BreakChoiceModal() {
  injectCss();
  const navigate = useNavigate();
  const location = useLocation();
  const [offered, setOffered] = useState(false);
  const [onBreak, setOnBreak] = useState(false);
  const [secLeft, setSecLeft] = useState(0);
  const [toast, setToast] = useState<string | null>(null);
  const [hoverA, setHoverA] = useState(false);
  const [hoverB, setHoverB] = useState(false);

  // Subscribe to free-time state. When a teacher grants free time we skip
  // the break-choice prompt entirely — student's already in free mode.
  const freetime = useSyncExternalStore(
    studentFreetimeStore.subscribe,
    studentFreetimeStore.getSnapshot,
    studentFreetimeStore.getSnapshot,
  );

  useEffect(() => {
    const tick = () => {
      // Suppress break prompt when free time is active
      setOffered(freetime.granted ? false : shouldOfferBreak());
      setOnBreak(isOnBreak());
      setSecLeft(breakSecondsRemaining());
    };
    tick();
    const iv = setInterval(tick, 1000);
    window.addEventListener("breakstate-change", tick);
    return () => { clearInterval(iv); window.removeEventListener("breakstate-change", tick); };
  }, [freetime.granted]);

  // Teacher force-end break
  useEffect(() => {
    const onForceEnd = () => {
      setBreakState({ path: null, breakStartAt: 0, breakEndAt: 0, workStartAt: Date.now() });
      clearWorkUnlock();
      setToast("⛔ Your teacher ended break — back to work!");
      setTimeout(() => setToast(null), 4000);
      navigate("/student");
    };
    window.addEventListener("blockforge:end-break", onForceEnd);
    return () => window.removeEventListener("blockforge:end-break", onForceEnd);
  }, [navigate]);

  // Auto-return when break ends
  useEffect(() => {
    if (!onBreak && secLeft === 0) {
      const s = getBreakState();
      if (s.path === "break" && s.breakEndAt && Date.now() >= s.breakEndAt) {
        setBreakState({ path: null, breakStartAt: 0, breakEndAt: 0, workStartAt: Date.now() });
        clearWorkUnlock();
        setToast("⏰ Break's over — let's get back to it!");
        setTimeout(() => setToast(null), 4000);
        navigate("/student");
      }
    }
  }, [onBreak, secLeft, navigate]);

  const handleTakeBreak = () => {
    chooseBreak();
    setOffered(false);
    if (location.pathname !== "/student") navigate("/student");
  };

  const handleEarnAccess = () => {
    chooseFullWork();
    setOffered(false);
  };

  const mm = Math.floor(secLeft / 60);
  const ss = String(secLeft % 60).padStart(2, "0");
  const urgent = secLeft > 0 && secLeft <= 60;
  const pct = secLeft > 0 ? (secLeft / (10 * 60)) * 100 : 0;
  const circumference = 2 * Math.PI * 28;

  return (
    <>
      {/* Break choice modal */}
      {offered && !onBreak && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 900,
          background: "rgba(5,2,18,0.85)",
          backdropFilter: "blur(8px)",
          display: "flex", alignItems: "center", justifyContent: "center",
          padding: 20,
          animation: "bcmFadeIn 0.2s ease",
        }}>
          <div style={{
            maxWidth: 500, width: "100%",
            background: "linear-gradient(160deg, #0d0828 0%, #130d2e 50%, #0a1428 100%)",
            borderRadius: 24,
            border: "1px solid rgba(139,92,246,0.25)",
            boxShadow: "0 32px 80px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.06)",
            padding: "32px 28px 28px",
            animation: "bcmSlideUp 0.3s cubic-bezier(0.34,1.56,0.64,1)",
          }}>
            {/* Header */}
            <div style={{ textAlign: "center", marginBottom: 24 }}>
              <div style={{ fontSize: 44, marginBottom: 8, animation: "bcmBounce 2s ease-in-out infinite" }}>🎉</div>
              <h2 style={{ margin: 0, fontSize: 22, fontWeight: 900, color: "white", letterSpacing: "-0.01em" }}>
                You've been working hard!
              </h2>
              <p style={{ margin: "6px 0 0", fontSize: 13, color: "rgba(255,255,255,0.45)", lineHeight: 1.5 }}>
                10 minutes of solid work. Choose your next move:
              </p>
            </div>

            {/* Options */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              {/* Break option */}
              <button
                onClick={handleTakeBreak}
                onMouseEnter={() => setHoverA(true)}
                onMouseLeave={() => setHoverA(false)}
                style={{
                  padding: "20px 14px", borderRadius: 16,
                  background: hoverA
                    ? "linear-gradient(145deg, #7c3aed, #4f46e5)"
                    : "linear-gradient(145deg, #6d28d9, #4338ca)",
                  border: "1px solid rgba(139,92,246,0.4)",
                  color: "white", cursor: "pointer",
                  display: "flex", flexDirection: "column", gap: 8,
                  textAlign: "left",
                  transition: "transform 0.15s, box-shadow 0.15s, background 0.15s",
                  transform: hoverA ? "translateY(-3px)" : "none",
                  boxShadow: hoverA ? "0 12px 32px rgba(109,40,217,0.45)" : "0 4px 16px rgba(109,40,217,0.25)",
                  touchAction: "manipulation",
                  animation: "bcmPulse 3s ease-in-out infinite",
                }}
              >
                <span style={{ fontSize: 28 }}>☕</span>
                <div>
                  <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 4 }}>Take a break</div>
                  <div style={{ fontSize: 11, opacity: 0.8, lineHeight: 1.45 }}>
                    10 minutes of free time — Arcade, YouTube &amp; more. Timer runs out, you're back to work.
                  </div>
                </div>
              </button>

              {/* Earn access option */}
              <button
                onClick={handleEarnAccess}
                onMouseEnter={() => setHoverB(true)}
                onMouseLeave={() => setHoverB(false)}
                style={{
                  padding: "20px 14px", borderRadius: 16,
                  background: hoverB
                    ? "linear-gradient(145deg, #059669, #0284c7)"
                    : "linear-gradient(145deg, #047857, #0369a1)",
                  border: "1px solid rgba(16,185,129,0.35)",
                  color: "white", cursor: "pointer",
                  display: "flex", flexDirection: "column", gap: 8,
                  textAlign: "left",
                  transition: "transform 0.15s, box-shadow 0.15s, background 0.15s",
                  transform: hoverB ? "translateY(-3px)" : "none",
                  boxShadow: hoverB ? "0 12px 32px rgba(5,150,105,0.4)" : "0 4px 16px rgba(5,150,105,0.2)",
                  touchAction: "manipulation",
                }}
              >
                <span style={{ fontSize: 28 }}>⚡</span>
                <div>
                  <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 4 }}>Keep going</div>
                  <div style={{ fontSize: 11, opacity: 0.8, lineHeight: 1.45 }}>
                    Finish all your work today and unlock the full arcade + everything else.
                  </div>
                </div>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Break countdown pill — top right */}
      {onBreak && secLeft > 0 && (
        <div style={{
          position: "fixed", top: 14, right: 14, zIndex: 9500,
          display: "flex", alignItems: "center", gap: 10,
          padding: "8px 16px 8px 10px",
          borderRadius: 999,
          background: urgent
            ? "linear-gradient(135deg, #dc2626, #f59e0b)"
            : "linear-gradient(135deg, #5b21b6, #4f46e5)",
          color: "white",
          boxShadow: urgent
            ? "0 4px 24px rgba(220,38,38,0.5), inset 0 1px 0 rgba(255,255,255,0.15)"
            : "0 4px 20px rgba(91,33,182,0.5), inset 0 1px 0 rgba(255,255,255,0.1)",
          border: urgent
            ? "1.5px solid rgba(251,191,36,0.4)"
            : "1.5px solid rgba(139,92,246,0.4)",
          backdropFilter: "blur(8px)",
          animation: urgent ? "bcmUrgentPulse 1s ease-in-out infinite" : undefined,
          pointerEvents: "none",
          userSelect: "none",
          minWidth: 120,
        }}>
          {/* Mini circular timer */}
          <div style={{ position: "relative", width: 32, height: 32, flexShrink: 0 }}>
            <svg width="32" height="32" style={{ transform: "rotate(-90deg)" }} viewBox="0 0 64 64">
              <circle cx="32" cy="32" r="28" fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="5" />
              <circle
                cx="32" cy="32" r="28" fill="none"
                stroke={urgent ? "#fbbf24" : "rgba(255,255,255,0.85)"}
                strokeWidth="5"
                strokeLinecap="round"
                strokeDasharray={`${circumference}`}
                strokeDashoffset={`${circumference * (1 - pct / 100)}`}
                style={{ transition: "stroke-dashoffset 1s linear" }}
              />
            </svg>
            <div style={{
              position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 8, fontWeight: 900, color: urgent ? "#fbbf24" : "rgba(255,255,255,0.9)",
            }}>☕</div>
          </div>
          <div>
            <div style={{ fontSize: 10, opacity: 0.65, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase" }}>Break</div>
            <div style={{
              fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
              fontSize: 16, fontWeight: 900, lineHeight: 1,
              fontVariantNumeric: "tabular-nums",
              color: urgent ? "#fbbf24" : "white",
            }}>{mm}:{ss}</div>
          </div>
        </div>
      )}

      {/* Toast notification */}
      {toast && (
        <div style={{
          position: "fixed", bottom: 28, left: "50%",
          transform: "translateX(-50%)", zIndex: 9600,
          background: "linear-gradient(135deg, #1e1b4b, #312e81)",
          color: "white", padding: "14px 28px", borderRadius: 16,
          fontSize: 14, fontWeight: 700,
          boxShadow: "0 16px 48px rgba(30,27,75,0.5), inset 0 1px 0 rgba(255,255,255,0.1)",
          border: "1px solid rgba(139,92,246,0.3)",
          animation: "bcmToastIn 0.35s cubic-bezier(0.22,1,0.36,1) forwards",
          whiteSpace: "nowrap",
        }}>
          {toast}
        </div>
      )}
    </>
  );
}
