// Morning slide overlay — fills the board with the day's instructions.
// Teacher pops this up at the start of class. Big, calm, readable
// from the back of the room. Tap anywhere to dismiss (teacher only —
// kids see it locked until the teacher closes it via the X button).

import { useEffect, useState } from "react";
import { api } from "../lib/api.ts";

interface Props {
  classId: string;
  onClose: () => void;
  // Optional shortcuts so the slide doesn't trap people behind itself.
  // Wallet is for kids walking up; Tools is for the teacher.
  onOpenWallet?: () => void;
  onOpenTools?: () => void;
}

type Notice = { title: string; names: string[] };
type Slide = {
  title: string;
  lines: string[];
  warning: string;
  cashout_times: string[];
  vr_note: string;
  latitude: number | null;
  longitude: number | null;
  notices: Notice[];
};

// Open-Meteo weather code → emoji + label.
// https://open-meteo.com/en/docs#weathervariables
function weatherEmoji(code: number): { emoji: string; label: string } {
  if (code === 0)                   return { emoji: "☀️",  label: "Clear" };
  if ([1, 2].includes(code))        return { emoji: "🌤️", label: "Mostly sunny" };
  if (code === 3)                   return { emoji: "☁️",  label: "Cloudy" };
  if ([45, 48].includes(code))      return { emoji: "🌫️", label: "Foggy" };
  if ([51, 53, 55].includes(code))  return { emoji: "🌦️", label: "Drizzle" };
  if ([61, 63, 65].includes(code))  return { emoji: "🌧️", label: "Rain" };
  if ([66, 67].includes(code))      return { emoji: "🌧️", label: "Freezing rain" };
  if ([71, 73, 75, 77].includes(code)) return { emoji: "🌨️", label: "Snow" };
  if ([80, 81, 82].includes(code))  return { emoji: "🌧️", label: "Showers" };
  if ([85, 86].includes(code))      return { emoji: "🌨️", label: "Snow showers" };
  if ([95, 96, 99].includes(code))  return { emoji: "⛈️",  label: "Thunderstorms" };
  return { emoji: "🌡️", label: "Weather" };
}

export default function MorningSlide({ classId, onClose, onOpenWallet, onOpenTools }: Props) {
  const [slide, setSlide] = useState<Slide | null>(null);
  const [weather, setWeather] = useState<{ temperature: number; code: number; high: number; low: number } | null>(null);

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
          cashout_times: ["10:10", "11:00", "2:45"],
          vr_note: "VR is only on Friday",
          latitude: 36.1716,
          longitude: -115.1391,
          notices: [],
        });
      });
    return () => { cancelled = true; };
  }, [classId]);

  // Fetch weather once we know the lat/lon
  useEffect(() => {
    if (!slide?.latitude || !slide?.longitude) return;
    let cancelled = false;
    api.getWeather(slide.latitude, slide.longitude)
      .then((w) => { if (!cancelled && Number.isFinite(w?.temperature)) setWeather(w); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [slide?.latitude, slide?.longitude]);

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
        /* Yellow notice — sibling of warnPulse but in school-bus yellow */
        @keyframes noticePulse {
          0%, 100% {
            box-shadow: 0 0 18px rgba(250,204,21,0.30), inset 0 0 0 0 rgba(250,204,21,0.0);
            border-color: rgba(250,204,21,0.55);
            transform: scale(1);
          }
          50% {
            box-shadow: 0 0 48px rgba(250,204,21,0.75), inset 0 0 24px 4px rgba(250,204,21,0.18);
            border-color: rgba(254,240,138,0.95);
            transform: scale(1.012);
          }
        }
        @keyframes noticeBlink {
          0%, 49%   { opacity: 1; }
          50%, 100% { opacity: 0.4; }
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

      {/* Top bar — date + weather on one side, dismiss on the other */}
      <div style={{
        flex: "0 0 auto",
        height: tier.headerH,
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "0 28px",
        borderBottom: "1px solid rgba(255,255,255,0.06)",
        background: "rgba(0,0,0,0.20)",
        gap: 16, flexWrap: "wrap",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <span style={{ fontSize: 38, lineHeight: 1, animation: "morningSunrise 3.6s ease-in-out infinite" }}>🌅</span>
          <div>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.2em", textTransform: "uppercase", color: "rgba(245,241,232,0.45)" }}>
              {new Date().toLocaleDateString("en-US", { weekday: "long" })}
            </div>
            <div style={{ fontSize: 22, fontWeight: 800, color: "white", marginTop: 2, lineHeight: 1.05 }}>
              {new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
            </div>
          </div>
        </div>

        {/* Weather chip — only renders once Open-Meteo responds */}
        {weather && (() => {
          const w = weatherEmoji(weather.code);
          return (
            <div style={{
              display: "flex", alignItems: "center", gap: 12,
              padding: "8px 18px", borderRadius: 999,
              background: "linear-gradient(135deg, rgba(56,189,248,0.18), rgba(14,165,233,0.10))",
              border: "1px solid rgba(56,189,248,0.40)",
              animation: "morningSlideIn .5s ease .35s both",
            }}>
              <span style={{ fontSize: 32, lineHeight: 1 }} title={w.label}>{w.emoji}</span>
              <div>
                <div style={{ fontSize: 22, fontWeight: 900, color: "white", lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>
                  {weather.temperature}°
                </div>
                <div style={{ fontSize: 11, fontWeight: 700, color: "rgba(245,241,232,0.65)", marginTop: 2, fontVariantNumeric: "tabular-nums" }}>
                  H {weather.high}° · L {weather.low}°
                </div>
              </div>
            </div>
          );
        })()}

        {/* Always-accessible shortcuts so the slide doesn't trap people:
            kids can tap 💼 Wallet from here; teacher can tap 🔒 Tools.
            We close the slide first so the modal isn't behind it. */}
        <div style={{ display: "flex", gap: 8, marginLeft: "auto", flexWrap: "wrap", justifyContent: "flex-end" }}>
          {onOpenWallet && (
            <button
              onClick={() => { onClose(); onOpenWallet(); }}
              title="My wallet — students unlock with their PIN"
              style={{
                padding: "9px 16px", borderRadius: 999,
                background: "rgba(124,58,237,0.20)",
                border: "1px solid rgba(124,58,237,0.55)",
                color: "#c4b5fd", fontSize: 13, fontWeight: 800,
                cursor: "pointer",
              }}
            >💼 Wallet</button>
          )}
          {onOpenTools && (
            <button
              onClick={() => { onClose(); onOpenTools(); }}
              title="Teacher tools — requires PIN"
              style={{
                padding: "9px 16px", borderRadius: 999,
                background: "rgba(178,58,72,0.22)",
                border: "1px solid rgba(178,58,72,0.55)",
                color: "#fca5a5", fontSize: 13, fontWeight: 800,
                cursor: "pointer",
              }}
            >🔒 Tools</button>
          )}
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
      </div>

      {/* Body — flex-fills, no scroll. Two-column when there are
          notices, single-column otherwise. Notices column is the
          flashing yellow MAP/IEP callout. */}
      <div style={{
        flex: "1 1 auto",
        minHeight: 0,
        display: "flex", alignItems: "stretch", justifyContent: "center",
        padding: `${tier.padVH * 1.5}vh ${tier.padVH * 2.5}vh`,
        gap: `${tier.padVH * 1.5}vh`,
        overflow: "hidden",
      }}>
        {!slide ? (
          <div style={{ color: "rgba(245,241,232,0.5)", margin: "auto" }}>Loading…</div>
        ) : (
        <>
          <div style={{
            flex: 1, maxWidth: slide.notices.length ? 900 : 1200,
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
              background: "linear-gradient(90deg, #f5f1e8 0%, #c4b5fd 25%, #f9a8d4 50%, #c4b5fd 75%, #f5f1e8 100%)",
              backgroundSize: "200% 200%",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              backgroundClip: "text",
              textShadow: "0 0 30px rgba(168,85,247,0.30)",
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
                    background: "linear-gradient(135deg, #ec4899 0%, #a855f7 50%, #6366f1 100%)",
                    color: "white",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: tier.badge * 0.36, fontWeight: 900,
                    boxShadow: "0 8px 22px -6px rgba(168,85,247,0.55)",
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

            {/* Cashout times row — pinned just above the warning */}
            {slide.cashout_times.length > 0 && (
              <div style={{
                maxWidth: 980, alignSelf: "center", width: "100%",
                padding: `${tier.padVH * 0.7}vh ${tier.padVH * 1.2}vh`,
                borderRadius: 14,
                background: "linear-gradient(135deg, rgba(168,85,247,0.22), rgba(99,102,241,0.10))",
                border: "1.5px solid rgba(168,85,247,0.45)",
                display: "flex", alignItems: "center", gap: 12,
                flexWrap: "wrap",
                animation: "morningSlideIn .5s ease .55s both",
                flexShrink: 0,
              }}>
                <div style={{
                  fontSize: 11, fontWeight: 900, letterSpacing: "0.22em",
                  textTransform: "uppercase",
                  color: "#c4b5fd",
                  display: "flex", alignItems: "center", gap: 6,
                }}>
                  <span style={{ fontSize: 16 }}>🪙</span> Cashout
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {slide.cashout_times.map((t, i) => (
                    <span key={i} style={{
                      padding: "6px 14px", borderRadius: 999,
                      background: "rgba(236,72,153,0.18)",
                      border: "1px solid rgba(236,72,153,0.45)",
                      fontSize: `clamp(13px, ${tier.warnVH * 0.9}vw, 20px)`,
                      fontWeight: 800, color: "#fce7f3",
                      fontVariantNumeric: "tabular-nums",
                      letterSpacing: "0.04em",
                    }}>{t}</span>
                  ))}
                </div>
                {slide.vr_note && (
                  <div style={{
                    marginLeft: "auto",
                    padding: "6px 14px", borderRadius: 999,
                    background: "linear-gradient(135deg, rgba(124,58,237,0.20), rgba(99,102,241,0.10))",
                    border: "1px solid rgba(124,58,237,0.50)",
                    fontSize: `clamp(12px, ${tier.warnVH * 0.85}vw, 18px)`,
                    fontWeight: 800, color: "#c4b5fd",
                    display: "flex", alignItems: "center", gap: 6,
                  }}>
                    🥽 {slide.vr_note}
                  </div>
                )}
              </div>
            )}

            {/* Warning panel — pulsing red glow + blinking label.
                Wrap the box in a separate span that owns the loop
                animation so the entry transition doesn't override
                the pulse (chained animations on the same element
                with a delayed second one don't reliably loop). */}
            {slide.warning && (
              <div style={{
                animation: "morningSlideIn .5s ease .65s both",
                maxWidth: 980, alignSelf: "center", width: "100%",
                flexShrink: 0,
              }}>
                <div className="morning-warn-pulse" style={{
                  padding: `${tier.padVH * 0.9}vh ${tier.padVH * 1.5}vh`,
                  borderRadius: 14,
                  background: "linear-gradient(135deg, rgba(220,38,38,0.22), rgba(249,115,22,0.12))",
                  border: "2px solid rgba(220,38,38,0.55)",
                  willChange: "box-shadow, transform, border-color",
                  animation: "warnPulse 1.4s ease-in-out infinite",
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
              </div>
            )}
          </div>

          {/* Notices column — yellow flashing callouts (MAP testing,
              IEP groups, etc). Only renders when there's at least one. */}
          {slide.notices.length > 0 && (
            <div style={{
              flex: "0 0 auto",
              width: "min(28vw, 360px)",
              maxHeight: "100%",
              overflow: "auto",
              display: "flex", flexDirection: "column", gap: `${tier.gapVH * 0.8}vh`,
              animation: "morningSlideIn .5s ease .25s both",
            }}>
              {slide.notices.map((n, i) => (
                <div key={i} className="morning-notice-pulse" style={{
                  padding: `${tier.padVH * 0.8}vh ${tier.padVH * 1.2}vh`,
                  borderRadius: 14,
                  background: "linear-gradient(135deg, rgba(250,204,21,0.22), rgba(245,158,11,0.10))",
                  border: "2px solid rgba(250,204,21,0.55)",
                  willChange: "box-shadow, border-color, transform",
                  animation: `noticePulse 1.4s ease-in-out ${i * 0.25}s infinite`,
                }}>
                  <div style={{
                    fontSize: 11, fontWeight: 900, letterSpacing: "0.20em",
                    textTransform: "uppercase",
                    color: "#fde68a",
                    marginBottom: 8,
                    display: "flex", alignItems: "center", gap: 6,
                  }}>
                    <span style={{
                      fontSize: 16, display: "inline-block",
                      animation: "noticeBlink 0.8s ease-in-out infinite",
                    }}>📢</span>
                    {n.title}
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {n.names.map((name, j) => (
                      <div key={j} style={{
                        padding: "6px 12px", borderRadius: 10,
                        background: "rgba(250,204,21,0.12)",
                        border: "1px solid rgba(250,204,21,0.35)",
                        fontSize: `clamp(13px, ${tier.warnVH * 0.95}vw, 18px)`,
                        fontWeight: 800, color: "#fef3c7",
                      }}>{name}</div>
                    ))}
                    {n.names.length === 0 && (
                      <div style={{ fontSize: 12, opacity: 0.55, color: "#fef3c7", fontStyle: "italic" }}>
                        No names yet
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
        )}
      </div>
    </div>
  );
}
