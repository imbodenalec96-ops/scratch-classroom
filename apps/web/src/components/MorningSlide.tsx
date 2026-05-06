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

  // Auto-shrink size class based on how much content there is. Goal:
  // every byte of the slide fits in the viewport with no scroll, even
  // with 6 lines + a long warning. We pick a "density" tier per line
  // count and apply it to every font size + padding below.
  const lineCount = slide?.lines.length || 0;
  const density: "loose" | "regular" | "tight" | "tightest" =
    lineCount <= 3 ? "loose"
    : lineCount <= 5 ? "regular"
    : lineCount <= 7 ? "tight"
    : "tightest";

  // Per-density sizes. clamp(min, preferred, max) lets the same
  // numbers degrade smoothly on small projector screens too.
  const tier = {
    loose:    { titleVH: 8.5, lineVH: 3.2, warnVH: 2.5, gapVH: 2.0, padVH: 2.0, badge: 56, headerH: 78 },
    regular:  { titleVH: 7.0, lineVH: 2.7, warnVH: 2.2, gapVH: 1.5, padVH: 1.4, badge: 50, headerH: 72 },
    tight:    { titleVH: 5.8, lineVH: 2.3, warnVH: 1.9, gapVH: 1.1, padVH: 1.1, badge: 44, headerH: 68 },
    tightest: { titleVH: 4.8, lineVH: 1.9, warnVH: 1.7, gapVH: 0.8, padVH: 0.8, badge: 38, headerH: 62 },
  }[density];

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 400,
        background: "linear-gradient(160deg, #1e1b2e 0%, #0f172a 60%, #1a1426 100%)",
        display: "flex", flexDirection: "column",
        animation: "morningFadeIn .35s ease both",
        overflow: "hidden", // hard guarantee — nothing scrolls
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
        /* Title gradient sweep — rainbow gently slides L→R */
        @keyframes titleShimmer {
          0%   { background-position: 0% 50%; }
          100% { background-position: 200% 50%; }
        }
        /* Per-line entry: slide in from the left + bounce */
        @keyframes lineSlideIn {
          0%   { opacity: 0; transform: translateX(-60px) scale(0.9); }
          70%  { opacity: 1; transform: translateX(8px) scale(1.02); }
          100% { opacity: 1; transform: translateX(0) scale(1); }
        }
        /* Warning panel — pulsing red glow + subtle scale to draw the eye */
        @keyframes warnPulse {
          0%, 100% {
            box-shadow: 0 0 24px rgba(220,38,38,0.30), inset 0 0 0 0 rgba(220,38,38,0.0);
            border-color: rgba(220,38,38,0.55);
            transform: scale(1);
          }
          50% {
            box-shadow: 0 0 64px rgba(220,38,38,0.75), inset 0 0 30px 4px rgba(220,38,38,0.18);
            border-color: rgba(248,113,113,0.95);
            transform: scale(1.012);
          }
        }
        /* Warning header label — flashes between red and bright */
        @keyframes warnLabelBlink {
          0%, 49%   { opacity: 1;  color: #fca5a5; }
          50%, 100% { opacity: 0.55; color: #fee2e2; }
        }
        /* Warning emoji — gentle shake */
        @keyframes warnShake {
          0%, 100% { transform: rotate(0); }
          15%      { transform: rotate(-12deg) scale(1.10); }
          30%      { transform: rotate(10deg) scale(1.10); }
          45%      { transform: rotate(-8deg) scale(1.05); }
          60%      { transform: rotate(6deg) scale(1.05); }
          75%      { transform: rotate(0); }
        }
        /* Step number badge — pulses subtly */
        @keyframes badgeBeat {
          0%, 100% { transform: scale(1); box-shadow: 0 4px 14px rgba(178,58,72,0.40); }
          50%      { transform: scale(1.08); box-shadow: 0 6px 20px rgba(178,58,72,0.65); }
        }
        /* Floating background sparkles */
        @keyframes morningFloat {
          0%   { transform: translateY(0) rotate(0); opacity: 0; }
          15%  { opacity: 0.55; }
          85%  { opacity: 0.55; }
          100% { transform: translateY(-95vh) rotate(360deg); opacity: 0; }
        }
      `}</style>

      {/* Drifting background sparkles — calm, non-distracting */}
      {Array.from({ length: 18 }, (_, i) => {
        const left = (i / 17) * 100;
        const delay = (i * 0.5) % 9;
        const duration = 9 + (i % 5) * 2;
        const size = 12 + (i % 4) * 6;
        const emojis = ["✨", "⭐", "🌟", "💫"];
        return (
          <span key={i} style={{
            position: "absolute",
            bottom: -40, left: `${left}%`,
            fontSize: size, lineHeight: 1,
            zIndex: 0, pointerEvents: "none",
            animation: `morningFloat ${duration}s linear ${delay}s infinite`,
          }}>{emojis[i % emojis.length]}</span>
        );
      })}

      {/* Top bar — fixed-ish height so the body can compute remaining room */}
      <div style={{
        flex: "0 0 auto",
        height: tier.headerH,
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "0 28px",
        borderBottom: "1px solid rgba(255,255,255,0.06)",
        background: "rgba(0,0,0,0.20)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <span style={{ fontSize: 32, lineHeight: 1, animation: "morningSunrise 3.6s ease-in-out infinite" }}>🌅</span>
          <div>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.2em", textTransform: "uppercase", color: "rgba(245,241,232,0.45)" }}>
              Morning Routine
            </div>
            <div style={{ fontSize: 13, fontWeight: 700, color: "rgba(245,241,232,0.85)", marginTop: 2 }}>
              {new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
            </div>
          </div>
        </div>
        <button
          onClick={onClose}
          style={{
            padding: "9px 18px", borderRadius: 999,
            background: "rgba(255,255,255,0.08)",
            border: "1px solid rgba(255,255,255,0.15)",
            color: "white", fontSize: 13, fontWeight: 700,
            cursor: "pointer",
          }}
        >✕ Dismiss</button>
      </div>

      {/* Body — flex-fills, no scroll. Inner content uses per-density
          sizes so 3 lines look big, 8 lines stay readable. */}
      <div style={{
        flex: "1 1 auto",
        minHeight: 0, // critical for flex children that shouldn't overflow
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: `${tier.padVH * 1.5}vh ${tier.padVH * 2.5}vh`,
        overflow: "hidden",
      }}>
        {!slide ? (
          <div style={{ color: "rgba(245,241,232,0.5)" }}>Loading…</div>
        ) : (
          <div style={{
            maxWidth: 1200, width: "100%",
            height: "100%",
            display: "flex", flexDirection: "column",
            justifyContent: "center",
            gap: `${tier.gapVH}vh`,
            animation: "morningSlideIn .5s ease .15s both",
            minHeight: 0,
          }}>
            {/* Title — animated rainbow shimmer that sweeps L→R */}
            <h1 style={{
              fontSize: `clamp(28px, ${tier.titleVH}vw, 88px)`,
              lineHeight: 1.05,
              fontWeight: 900,
              letterSpacing: "-0.02em",
              margin: 0,
              background: "linear-gradient(90deg, #fde68a 0%, #f97316 25%, #b23a48 50%, #f97316 75%, #fde68a 100%)",
              backgroundSize: "200% 200%",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              backgroundClip: "text",
              textShadow: "0 0 30px rgba(251,191,36,0.20)",
              textAlign: "center",
              flexShrink: 0,
              animation: "titleShimmer 6s linear infinite",
            }}>
              {slide.title}
            </h1>

            {/* Bulleted lines — flex-grow inside body so they fill the
                middle and shrink uniformly when many. */}
            <ol style={{
              listStyle: "none", padding: 0, margin: 0,
              maxWidth: 880, alignSelf: "center", width: "100%",
              display: "flex", flexDirection: "column", gap: `${tier.gapVH * 0.7}vh`,
              flexShrink: 1,
              minHeight: 0,
            }}>
              {slide.lines.map((line, i) => (
                <li key={i} style={{
                  display: "flex", alignItems: "center", gap: 16,
                  padding: `${tier.padVH * 0.6}vh ${tier.padVH * 1.2}vh`,
                  borderRadius: 14,
                  background: "rgba(255,255,255,0.04)",
                  border: "1px solid rgba(255,255,255,0.08)",
                  // Slide-in from left with a tiny bounce per line
                  animation: `lineSlideIn .55s cubic-bezier(0.34, 1.56, 0.64, 1) ${0.25 + i * 0.10}s both`,
                  minHeight: 0,
                }}>
                  <div style={{
                    width: tier.badge * 0.8, height: tier.badge * 0.8, borderRadius: "50%",
                    flexShrink: 0,
                    background: "linear-gradient(135deg, #b23a48, #d97706)",
                    color: "white",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: tier.badge * 0.36, fontWeight: 900,
                    // Continuous gentle pulse to give the badge life
                    animation: `badgeBeat 2.4s ease-in-out ${i * 0.3}s infinite`,
                  }}>{i + 1}</div>
                  <div style={{
                    fontSize: `clamp(15px, ${tier.lineVH}vw, 30px)`,
                    fontWeight: 700, color: "white", lineHeight: 1.25,
                    minWidth: 0,
                  }}>
                    {line}
                  </div>
                </li>
              ))}
            </ol>

            {/* Warning panel — pulsing red glow + blinking label.
                Pops in last after the line cards, then loops forever
                so it can't be ignored. */}
            {slide.warning && (
              <div style={{
                maxWidth: 980, alignSelf: "center", width: "100%",
                padding: `${tier.padVH * 0.9}vh ${tier.padVH * 1.5}vh`,
                borderRadius: 14,
                background: "linear-gradient(135deg, rgba(220,38,38,0.22), rgba(249,115,22,0.12))",
                border: "2px solid rgba(220,38,38,0.55)",
                animation: `morningSlideIn .5s ease .65s both, warnPulse 1.4s ease-in-out 1.2s infinite`,
                flexShrink: 0,
              }}>
                <div style={{
                  fontSize: 11, fontWeight: 900, letterSpacing: "0.22em",
                  textTransform: "uppercase",
                  marginBottom: 6,
                  display: "flex", alignItems: "center", gap: 6,
                  animation: "warnLabelBlink 0.9s ease-in-out infinite",
                }}>
                  <span style={{
                    fontSize: 18,
                    display: "inline-block",
                    animation: "warnShake 1.2s ease-in-out infinite",
                  }}>⚠️</span>
                  Warning
                </div>
                <div style={{
                  fontSize: `clamp(13px, ${tier.warnVH}vw, 22px)`,
                  fontWeight: 700,
                  lineHeight: 1.4,
                  color: "#fee2e2",
                  textShadow: "0 0 8px rgba(220,38,38,0.30)",
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
