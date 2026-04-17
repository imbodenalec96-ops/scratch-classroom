import React from "react";
import { Lock } from "lucide-react";

interface Props {
  isLocked: boolean;
  message?: string;
  lockedBy?: string;
  pendingMessage?: string | null;
  onDismissMessage?: () => void;
}

/**
 * ScreenLockOverlay — renders a full-screen teacher-controlled lockdown.
 *
 * Mounted globally in Layout. Students cannot dismiss the lock;
 * only the teacher can unlock via the monitor page.
 * Message toast (1:1 teacher message) is separately dismissable.
 */
export default function ScreenLockOverlay({ isLocked, message, lockedBy, pendingMessage, onDismissMessage }: Props) {
  return (
    <>
      {/* Full-screen lock */}
      {isLocked && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 10000,
            background: "linear-gradient(135deg, #0a0020 0%, #160030 50%, #0a0818 100%)",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            userSelect: "none",
          }}
          aria-live="assertive"
          role="alert"
          aria-label="Screen locked by teacher"
        >
          {/* Ambient glow blobs */}
          <div style={{
            position: "absolute", top: "20%", left: "10%",
            width: 400, height: 400,
            background: "rgba(139,92,246,0.08)",
            borderRadius: "50%", filter: "blur(80px)",
            animation: "pulse 4s ease-in-out infinite",
          }} />
          <div style={{
            position: "absolute", bottom: "20%", right: "10%",
            width: 300, height: 300,
            background: "rgba(99,102,241,0.06)",
            borderRadius: "50%", filter: "blur(60px)",
            animation: "pulse 4s ease-in-out infinite 2s",
          }} />

          {/* Lock icon */}
          <div style={{
            width: 80, height: 80,
            borderRadius: 24,
            background: "rgba(139,92,246,0.15)",
            border: "1px solid rgba(139,92,246,0.4)",
            display: "flex", alignItems: "center", justifyContent: "center",
            marginBottom: 28,
            boxShadow: "0 0 40px rgba(139,92,246,0.2)",
          }}>
            <Lock size={36} color="#a78bfa" />
          </div>

          {/* Heading */}
          <h1 style={{
            color: "white",
            fontSize: "clamp(22px, 4vw, 32px)",
            fontWeight: 800,
            margin: "0 0 12px",
            letterSpacing: "-0.02em",
            textAlign: "center",
          }}>
            🔒 Screen Locked
          </h1>

          {/* Teacher name */}
          {lockedBy && (
            <p style={{
              color: "rgba(167,139,250,0.8)",
              fontSize: 16,
              fontWeight: 500,
              margin: "0 0 20px",
            }}>
              Locked by {lockedBy}
            </p>
          )}

          {/* Custom message or default */}
          <div style={{
            background: "rgba(255,255,255,0.04)",
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: 16,
            padding: "16px 32px",
            maxWidth: 440,
            textAlign: "center",
          }}>
            <p style={{
              color: "rgba(255,255,255,0.7)",
              fontSize: 15,
              lineHeight: 1.6,
              margin: 0,
            }}>
              {message && message.trim()
                ? message
                : "Your teacher has paused the screen. Please look up and listen. 👀"}
            </p>
          </div>

          {/* Footer hint */}
          <p style={{
            color: "rgba(255,255,255,0.15)",
            fontSize: 12,
            marginTop: 32,
          }}>
            Your screen will unlock automatically when your teacher is ready.
          </p>
        </div>
      )}

      {/* Teacher message toast (1:1 or broadcast) */}
      {pendingMessage && (
        <div
          style={{
            position: "fixed",
            bottom: 24,
            right: 24,
            zIndex: 9999,
            maxWidth: 360,
            background: "rgba(17,24,39,0.96)",
            border: "1px solid rgba(139,92,246,0.4)",
            borderRadius: 16,
            padding: "16px 20px",
            boxShadow: "0 8px 32px rgba(0,0,0,0.4), 0 0 0 1px rgba(139,92,246,0.15)",
            animation: "slideInFromRight 0.3s ease-out",
          }}
          role="status"
          aria-live="polite"
        >
          <style>{`
            @keyframes slideInFromRight {
              from { transform: translateX(120%); opacity: 0; }
              to   { transform: translateX(0);    opacity: 1; }
            }
          `}</style>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
            <span style={{ fontSize: 20, flexShrink: 0 }}>📢</span>
            <div style={{ flex: 1 }}>
              <div style={{ color: "rgba(167,139,250,0.9)", fontSize: 11, fontWeight: 700, marginBottom: 4, letterSpacing: "0.05em", textTransform: "uppercase" }}>
                Message from Teacher
              </div>
              <div style={{ color: "rgba(255,255,255,0.85)", fontSize: 14, lineHeight: 1.5 }}>
                {pendingMessage}
              </div>
            </div>
            <button
              onClick={onDismissMessage}
              style={{
                background: "none", border: "none", cursor: "pointer",
                color: "rgba(255,255,255,0.3)", fontSize: 18, lineHeight: 1,
                padding: "0 2px", flexShrink: 0,
              }}
              aria-label="Dismiss message"
            >
              ×
            </button>
          </div>
        </div>
      )}
    </>
  );
}
