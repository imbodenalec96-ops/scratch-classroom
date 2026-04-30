// Visual PIN pad — big touch targets for the projector / board.
// Used in the Store unlock + Tools unlock + anywhere else a kid or
// teacher needs to type a 3-8 digit code without a keyboard.

import React from "react";

interface Props {
  value: string;
  onChange: (next: string) => void;
  onSubmit?: () => void;
  maxLength?: number;
  size?: "md" | "lg";
  /** When true, paints the pad in the kid-friendly red→amber gradient. */
  warm?: boolean;
}

export default function PinPad({
  value,
  onChange,
  onSubmit,
  maxLength = 6,
  size = "md",
  warm = false,
}: Props) {
  const dim = size === "lg" ? 76 : 64;
  const fontSize = size === "lg" ? 30 : 26;
  const tap = (digit: string) => {
    if (value.length >= maxLength) return;
    onChange(value + digit);
  };
  const back = () => onChange(value.slice(0, -1));
  const clear = () => onChange("");

  // Track pressed key for tactile flash
  const [pressed, setPressed] = React.useState<string | null>(null);

  // Hardware keyboard support — physical keyboard still works alongside the pad
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key >= "0" && e.key <= "9") {
        tap(e.key);
        setPressed(e.key);
        setTimeout(() => setPressed((p) => p === e.key ? null : p), 120);
      } else if (e.key === "Backspace") {
        back();
        setPressed("⌫");
        setTimeout(() => setPressed((p) => p === "⌫" ? null : p), 120);
      } else if (e.key === "Enter") {
        onSubmit?.();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, maxLength, onSubmit]);

  const keys: Array<{ label: string; on: () => void; kind?: "num" | "back" | "clear" }> = [
    { label: "1", on: () => tap("1") },
    { label: "2", on: () => tap("2") },
    { label: "3", on: () => tap("3") },
    { label: "4", on: () => tap("4") },
    { label: "5", on: () => tap("5") },
    { label: "6", on: () => tap("6") },
    { label: "7", on: () => tap("7") },
    { label: "8", on: () => tap("8") },
    { label: "9", on: () => tap("9") },
    { label: "✕", on: clear, kind: "clear" },
    { label: "0", on: () => tap("0") },
    { label: "⌫", on: back, kind: "back" },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14 }}>
      {/* PIN dots/digits display */}
      <div style={{
        display: "flex", gap: 12,
        padding: "10px 18px",
        background: "rgba(0,0,0,0.30)",
        border: "1.5px solid rgba(255,255,255,0.15)",
        borderRadius: 14,
        minWidth: 200,
        justifyContent: "center",
      }}>
        {Array.from({ length: maxLength }).map((_, i) => {
          const filled = i < value.length;
          return (
            <span key={i} style={{
              width: 14, height: 14,
              borderRadius: "50%",
              background: filled ? (warm ? "#fde68a" : "#a5b4fc") : "rgba(255,255,255,0.15)",
              transition: "background .15s",
              boxShadow: filled ? `0 0 8px ${warm ? "rgba(251,191,36,0.55)" : "rgba(165,180,252,0.5)"}` : undefined,
            }} />
          );
        })}
      </div>

      {/* Keypad */}
      <div style={{
        display: "grid",
        gridTemplateColumns: `repeat(3, ${dim}px)`,
        gap: 10,
      }}>
        {keys.map((k) => {
          const isClear = k.kind === "clear";
          const isBack = k.kind === "back";
          const isNum = !isClear && !isBack;
          const isPressed = pressed === k.label;
          return (
            <button
              key={k.label}
              type="button"
              onClick={() => {
                k.on();
                setPressed(k.label);
                setTimeout(() => setPressed((p) => p === k.label ? null : p), 120);
              }}
              style={{
                width: dim, height: dim,
                borderRadius: 14,
                border: "1px solid rgba(255,255,255,0.10)",
                background: isPressed
                  ? (warm ? "linear-gradient(135deg,#b23a48,#d97706)" : "linear-gradient(135deg,#7c3aed,#4f46e5)")
                  : isClear
                    ? "rgba(239,68,68,0.10)"
                    : isBack
                      ? "rgba(255,255,255,0.06)"
                      : "rgba(255,255,255,0.04)",
                color: isPressed ? "white"
                  : isClear ? "#fca5a5"
                  : isBack ? "rgba(245,241,232,0.85)"
                  : "white",
                fontSize,
                fontWeight: 800,
                cursor: "pointer",
                userSelect: "none",
                touchAction: "manipulation",
                transition: "transform .08s, background .12s",
                transform: isPressed ? "scale(0.95)" : "none",
                fontVariantNumeric: "tabular-nums",
              }}
              onMouseDown={(e) => { (e.currentTarget as HTMLElement).style.transform = "scale(0.95)"; }}
              onMouseUp={(e) => { (e.currentTarget as HTMLElement).style.transform = ""; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.transform = ""; }}
              aria-label={isBack ? "Backspace" : isClear ? "Clear" : `Key ${k.label}`}
            >
              {k.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
