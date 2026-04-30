// Animated reaction emojis — kids tap a 👍/❤️/🤝/etc on the board to
// react silently during sharing/presentations. Tapped emoji floats
// up the screen with a twirl, then fades. Sender's avatar is shown
// briefly so kids can see who reacted.
//
// Public API (via window):
//   window.__thignReact?.(emoji, fromName?)  — fire a reaction
//
// Anyone can wire other parts of the app to call this without
// importing anything heavy.

import { useEffect, useRef, useState } from "react";

interface FloatingEmoji {
  id: number;
  emoji: string;
  fromName?: string;
  startX: number;
  drift: number;
  delay: number;
  rotate: number;
  size: number;
}

const REACTION_BAR: Array<{ emoji: string; label: string }> = [
  { emoji: "👍", label: "Thumbs up" },
  { emoji: "❤️", label: "Love" },
  { emoji: "👏", label: "Clap" },
  { emoji: "🤝", label: "High five" },
  { emoji: "🤩", label: "Wow" },
  { emoji: "🎉", label: "Party" },
];

export default function ReactionRain() {
  const [floats, setFloats] = useState<FloatingEmoji[]>([]);
  const [open, setOpen] = useState(false);
  const counterRef = useRef(0);

  const fire = (emoji: string, fromName?: string) => {
    const id = ++counterRef.current;
    const float: FloatingEmoji = {
      id,
      emoji,
      fromName,
      startX: 20 + Math.random() * 60,        // 20–80% from left
      drift: (Math.random() - 0.5) * 30,      // ±15% horizontal drift
      delay: 0,
      rotate: (Math.random() - 0.5) * 60,
      size: 56 + Math.floor(Math.random() * 32),
    };
    setFloats((cur) => [...cur, float]);
    setTimeout(() => {
      setFloats((cur) => cur.filter((f) => f.id !== id));
    }, 3500);
  };

  useEffect(() => {
    (window as any).__thignReact = fire;
    return () => {
      if ((window as any).__thignReact === fire) (window as any).__thignReact = undefined;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <style>{`
        @keyframes reactFloat {
          0%   { transform: translate(0, 0) rotate(0); opacity: 0; }
          15%  { opacity: 1; }
          100% { transform: translate(var(--rx, 0), -90vh) rotate(var(--rr, 0)); opacity: 0; }
        }
      `}</style>

      {/* Floating emojis */}
      {floats.map((f) => (
        <span key={f.id} style={{
          position: "fixed",
          bottom: 60,
          left: `${f.startX}%`,
          fontSize: f.size,
          lineHeight: 1,
          zIndex: 90,
          pointerEvents: "none",
          ["--rx" as any]: `${f.drift}vw`,
          ["--rr" as any]: `${f.rotate}deg`,
          animation: "reactFloat 3.2s ease-out both",
          filter: "drop-shadow(0 4px 14px rgba(0,0,0,0.25))",
        } as React.CSSProperties}>{f.emoji}</span>
      ))}

      {/* Reaction bar — bottom-center toggle button + horizontal pill of emojis */}
      <div style={{
        position: "fixed",
        bottom: 16, left: "50%", transform: "translateX(-50%)",
        zIndex: 92,
        display: "flex", alignItems: "center", gap: 8,
      }}>
        {open && (
          <div style={{
            display: "flex", gap: 4, padding: 6,
            background: "rgba(13,19,33,0.85)", backdropFilter: "blur(8px)",
            border: "1px solid rgba(255,255,255,0.10)",
            borderRadius: 999,
            animation: "fadeUp .25s ease both",
          }}>
            {REACTION_BAR.map((r) => (
              <button
                key={r.emoji}
                onClick={() => fire(r.emoji)}
                title={r.label}
                aria-label={r.label}
                style={{
                  width: 48, height: 48, borderRadius: "50%",
                  background: "rgba(255,255,255,0.05)",
                  border: "1px solid rgba(255,255,255,0.10)",
                  color: "white", fontSize: 28,
                  cursor: "pointer",
                  transition: "transform .12s, background .12s",
                }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.transform = "scale(1.15)"; (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.12)"; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.transform = ""; (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.05)"; }}
              >{r.emoji}</button>
            ))}
          </div>
        )}
        <button
          onClick={() => setOpen((v) => !v)}
          title="Reactions"
          aria-label="Reactions"
          style={{
            width: 56, height: 56, borderRadius: "50%",
            background: open
              ? "linear-gradient(135deg, #b23a48, #d97706)"
              : "rgba(13,19,33,0.85)",
            border: "1px solid rgba(255,255,255,0.15)",
            color: "white", fontSize: 26,
            cursor: "pointer",
            backdropFilter: "blur(8px)",
            boxShadow: "0 6px 24px rgba(0,0,0,0.40)",
            transition: "transform .15s",
          }}
        >{open ? "✕" : "✨"}</button>
      </div>
    </>
  );
}
