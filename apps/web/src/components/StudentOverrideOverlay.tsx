import React, { useEffect, useState } from "react";
import type { StudentOverride } from "../lib/useStudentOverride.ts";

/**
 * Full-screen overlay shown to a student while a teacher-issued schedule
 * override is active (e.g. "Jaida → Calm Room until 10:50"). No dismiss
 * button — it clears automatically when the server stops returning an
 * active override (either ends_at elapsed or teacher cancelled early).
 */
export default function StudentOverrideOverlay({ override }: { override: StudentOverride }) {
  const [countdown, setCountdown] = useState<string>("");

  useEffect(() => {
    const tick = () => {
      const endsMs = new Date(override.ends_at).getTime();
      const ms = Math.max(0, endsMs - Date.now());
      const mins = Math.floor(ms / 60_000);
      const secs = Math.floor((ms % 60_000) / 1000);
      setCountdown(`${mins}:${String(secs).padStart(2, "0")}`);
    };
    tick();
    const iv = setInterval(tick, 1000);
    return () => clearInterval(iv);
  }, [override.ends_at]);

  const destinationEmoji = (() => {
    const d = (override.destination || "").toLowerCase();
    if (d.includes("calm")) return "🌿";
    if (d.includes("office")) return "🏫";
    if (d.includes("gen") || d.includes("general")) return "🧑‍🏫";
    if (d.includes("nurse")) return "🏥";
    if (d.includes("library")) return "📚";
    return "✨";
  })();

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 9998,
        background: "linear-gradient(135deg, #1a0d3a 0%, #0d1a3a 100%)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 24, color: "white",
        animation: "fade-in 300ms ease-out",
      }}
    >
      <style>{`@keyframes fade-in { from { opacity: 0; } to { opacity: 1; } }`}</style>

      <div style={{ textAlign: "center", maxWidth: 520 }}>
        <div style={{ fontSize: 80, lineHeight: 1, marginBottom: 24 }}>{destinationEmoji}</div>
        <div
          style={{
            fontSize: 12, fontWeight: 700, letterSpacing: "0.18em",
            textTransform: "uppercase", color: "rgba(255,255,255,0.45)",
            marginBottom: 8,
          }}
        >
          Your teacher moved you
        </div>
        <h1
          style={{
            fontSize: 42, fontWeight: 900, lineHeight: 1.05,
            margin: "0 0 18px", letterSpacing: "-0.02em",
          }}
        >
          {override.destination_label || override.destination}
        </h1>
        {override.reason && (
          <p style={{ fontSize: 16, color: "rgba(255,255,255,0.7)", margin: "0 0 28px", fontStyle: "italic" }}>
            "{override.reason}"
          </p>
        )}
        <div
          style={{
            display: "inline-flex", alignItems: "center", gap: 12,
            padding: "16px 28px", borderRadius: 16,
            background: "rgba(139,92,246,0.18)",
            border: "1px solid rgba(139,92,246,0.4)",
          }}
        >
          <span style={{ fontSize: 14, color: "rgba(255,255,255,0.6)", fontWeight: 600 }}>Back in</span>
          <span
            style={{
              fontFamily: "ui-monospace, Menlo, monospace",
              fontSize: 34, fontWeight: 800, color: "#c4b5fd",
              letterSpacing: "0.02em", lineHeight: 1,
            }}
          >
            {countdown}
          </span>
        </div>
        <p style={{ fontSize: 13, color: "rgba(255,255,255,0.35)", marginTop: 28 }}>
          Take the time you need. You'll be back to class automatically.
        </p>
      </div>
    </div>
  );
}
