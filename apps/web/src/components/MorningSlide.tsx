// Morning slide overlay — fills the board with the day's instructions.
// Teacher pops this up at the start of class. Big, calm, readable
// from the back of the room. Tap anywhere to dismiss (teacher only —
// kids see it locked until the teacher closes it via the X button).

import { useEffect, useState } from "react";
import { api } from "../lib/api.ts";

interface Props {
  classId: string;
  onClose: () => void;
}

export default function MorningSlide({ classId, onClose }: Props) {
  const [slide, setSlide] = useState<{ title: string; lines: string[]; warning: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    api.getMorningSlide(classId)
      .then((s) => { if (!cancelled) setSlide(s); })
      .catch(() => {
        if (!cancelled) setSlide({
          title: "Good Morning Star Students!",
          lines: [
            "Sit down in your seat",
            "Be quiet",
            "Wait for today's work packet",
            "Every hour you'll have an IEP goal assignment to complete",
          ],
          warning: "Refuse to complete an assignment → fill out the form. Admin will be contacted and parents. No freetime until the assignment is complete.",
        });
      });
    return () => { cancelled = true; };
  }, [classId]);

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 400,
        background: "linear-gradient(160deg, #1e1b2e 0%, #0f172a 60%, #1a1426 100%)",
        display: "flex", flexDirection: "column",
        animation: "morningFadeIn .35s ease both",
      }}
    >
      <style>{`
        @keyframes morningFadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes morningSlideIn {
          from { opacity: 0; transform: translateY(20px); }
          to   { opacity: 1; transform: none; }
        }
        @keyframes morningSunrise {
          0%, 100% { transform: translateY(0) scale(1); filter: drop-shadow(0 0 22px rgba(251,191,36,0.55)); }
          50%      { transform: translateY(-4px) scale(1.04); filter: drop-shadow(0 0 32px rgba(251,191,36,0.85)); }
        }
      `}</style>

      {/* Top bar */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "20px 28px",
        borderBottom: "1px solid rgba(255,255,255,0.06)",
        background: "rgba(0,0,0,0.20)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <span style={{ fontSize: 36, lineHeight: 1, animation: "morningSunrise 3.6s ease-in-out infinite" }}>🌅</span>
          <div>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.2em", textTransform: "uppercase", color: "rgba(245,241,232,0.45)" }}>
              Morning Routine
            </div>
            <div style={{ fontSize: 14, fontWeight: 700, color: "rgba(245,241,232,0.85)", marginTop: 2 }}>
              {new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
            </div>
          </div>
        </div>
        <button
          onClick={onClose}
          style={{
            padding: "10px 20px", borderRadius: 999,
            background: "rgba(255,255,255,0.08)",
            border: "1px solid rgba(255,255,255,0.15)",
            color: "white", fontSize: 14, fontWeight: 700,
            cursor: "pointer",
          }}
        >✕ Dismiss</button>
      </div>

      {/* Body — content centered, scrollable if long */}
      <div style={{
        flex: 1, overflow: "auto",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: "32px 40px",
      }}>
        {!slide ? (
          <div style={{ color: "rgba(245,241,232,0.5)" }}>Loading…</div>
        ) : (
          <div style={{
            maxWidth: 1100, width: "100%",
            display: "flex", flexDirection: "column", gap: 24,
            animation: "morningSlideIn .5s ease .15s both",
          }}>
            {/* Title */}
            <h1 style={{
              fontSize: "min(7vw, 84px)",
              lineHeight: 1.05,
              fontWeight: 900,
              letterSpacing: "-0.02em",
              margin: 0,
              background: "linear-gradient(135deg, #fde68a 0%, #f97316 60%, #b23a48 100%)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              backgroundClip: "text",
              textShadow: "0 0 30px rgba(251,191,36,0.20)",
              textAlign: "center",
            }}>
              {slide.title}
            </h1>

            {/* Bulleted lines — large, calm */}
            <ol style={{
              listStyle: "none", padding: 0, margin: "12px auto 0",
              maxWidth: 760,
              display: "flex", flexDirection: "column", gap: 16,
            }}>
              {slide.lines.map((line, i) => (
                <li key={i} style={{
                  display: "flex", alignItems: "center", gap: 18,
                  padding: "16px 24px",
                  borderRadius: 16,
                  background: "rgba(255,255,255,0.04)",
                  border: "1px solid rgba(255,255,255,0.08)",
                  animation: `morningSlideIn .5s ease ${0.25 + i * 0.08}s both`,
                }}>
                  <div style={{
                    width: 44, height: 44, borderRadius: "50%",
                    flexShrink: 0,
                    background: "linear-gradient(135deg, #b23a48, #d97706)",
                    color: "white",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 20, fontWeight: 900,
                    boxShadow: "0 4px 14px rgba(178,58,72,0.40)",
                  }}>{i + 1}</div>
                  <div style={{ fontSize: "min(3.4vw, 28px)", fontWeight: 700, color: "white", lineHeight: 1.3 }}>
                    {line}
                  </div>
                </li>
              ))}
            </ol>

            {/* Warning panel */}
            {slide.warning && (
              <div style={{
                marginTop: 16, maxWidth: 900, alignSelf: "center", width: "100%",
                padding: "20px 26px",
                borderRadius: 16,
                background: "linear-gradient(135deg, rgba(220,38,38,0.18), rgba(249,115,22,0.10))",
                border: "1.5px solid rgba(220,38,38,0.55)",
                boxShadow: "0 0 32px rgba(220,38,38,0.20)",
                animation: "morningSlideIn .5s ease .55s both",
              }}>
                <div style={{
                  fontSize: 11, fontWeight: 900, letterSpacing: "0.22em",
                  textTransform: "uppercase",
                  color: "#fca5a5",
                  marginBottom: 8,
                  display: "flex", alignItems: "center", gap: 8,
                }}>
                  <span style={{ fontSize: 18 }}>⚠️</span> Warning
                </div>
                <div style={{
                  fontSize: "min(2.6vw, 22px)",
                  fontWeight: 700,
                  lineHeight: 1.5,
                  color: "#fee2e2",
                }}>
                  {slide.warning}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
