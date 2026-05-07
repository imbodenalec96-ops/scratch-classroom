// Full-board takeover overlays for STAR events. Mounts on
// ClassroomBoard. Listens to fireStarBoardEvent broadcasts:
//   • completion → green "GREAT JOB" celebration with confetti + chime
//   • refusal    → red "REFUSAL LOGGED" alert with siren tones
//
// Auto-dismisses after a few seconds. If multiple events stack, the
// newest one replaces the current one.

import { useEffect, useRef, useState } from "react";
import { onStarBoardEvent, type StarBoardEvent, type StarBoardKind, getActiveClassId, wasSeenLocally, markSeenLocally } from "../../lib/star/boardEvents.ts";
import { successBeep, alertBeep, loggedBeep, errorBeep } from "../../lib/star/sounds.ts";
import { api } from "../../lib/api.ts";

const SHOW_MS = 6000;

export default function StarBoardOverlay() {
  const [evt, setEvt] = useState<StarBoardEvent | null>(null);

  const handleEvent = (e: StarBoardEvent) => {
    // Skip pass events here — they belong on the ActivePassesStrip,
    // not the full takeover. Pass timing is shown in the strip.
    if (e.kind === "pass-out" || e.kind === "pass-in") return;
    setEvt(e);
    if (e.kind === "completion") {
      successBeep();
      setTimeout(() => loggedBeep(), 200);
    } else {
      alertBeep();
      setTimeout(() => errorBeep(), 350);
    }
    if (e.studentId) highlightRosterCard(e.studentId, e.kind);
  };

  useEffect(() => onStarBoardEvent(handleEvent), []);

  // 1-second cross-device poller. Picks up STAR events fired on
  // another device (teacher iPad → projector). Each new server event is
  // re-broadcast locally via fireStarBoardEvent path — just dispatch it
  // through the same handler. De-duped by id.
  const seenRef = useRef<Set<string>>(new Set());
  const sinceRef = useRef<string>(new Date(Date.now() - 30_000).toISOString());
  useEffect(() => {
    const classId = getActiveClassId();
    if (!classId) return;
    let cancelled = false;
    const tick = async () => {
      try {
        const { events } = await api.starEventsList(classId, sinceRef.current);
        if (cancelled) return;
        for (const ev of events || []) {
          if (seenRef.current.has(ev.id)) continue;
          seenRef.current.add(ev.id);
          sinceRef.current = ev.created_at;
          const payload = ev.payload as StarBoardEvent;
          // Skip events we already fired locally on this device — they
          // already played their sound + animation when fired.
          if (payload?.uuid && wasSeenLocally(payload.uuid)) continue;
          if (payload?.uuid) markSeenLocally(payload.uuid);
          // Local dispatch — drives the overlay AND active passes strip.
          try {
            window.dispatchEvent(new CustomEvent("star-board-event", { detail: payload }));
          } catch {}
        }
      } catch { /* poll silently */ }
    };
    tick();
    const iv = window.setInterval(tick, 1000);
    return () => { cancelled = true; window.clearInterval(iv); };
  }, []);

  useEffect(() => {
    if (!evt) return;
    const t = window.setTimeout(() => setEvt(null), SHOW_MS);
    return () => window.clearTimeout(t);
  }, [evt]);

  return (
    <>
      <Styles />
      {evt && (evt.kind === "completion"
        ? <CompletionOverlay e={evt} onClose={() => setEvt(null)} />
        : <RefusalOverlay  e={evt} onClose={() => setEvt(null)} />)}
    </>
  );
}

/* ── completion ──────────────────────────────────────────────────── */

function CompletionOverlay({ e, onClose }: { e: StarBoardEvent; onClose: () => void }) {
  return (
    <div onClick={onClose} style={{
      position: "fixed", inset: 0, zIndex: 9999,
      background: "radial-gradient(ellipse at center, rgba(16,185,129,0.40) 0%, rgba(0,0,0,0.85) 80%)",
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      animation: "starBoardFade 0.4s ease-out", color: "white", textAlign: "center", padding: 40,
    }}>
      <ConfettiRain />
      <div style={{ fontSize: "min(24vw, 240px)", lineHeight: 1, marginBottom: 20, animation: "starBounce 0.6s ease-out" }}>🎉</div>
      <div style={{
        fontSize: "min(11vw, 140px)", fontWeight: 900, letterSpacing: "-0.02em",
        textShadow: "0 6px 30px rgba(16,185,129,0.6)",
        animation: "starBounce 0.7s ease-out 0.05s both",
      }}>
        GREAT JOB!
      </div>
      <div style={{
        fontSize: "min(7vw, 90px)", fontWeight: 800, marginTop: 10,
        color: "#fde68a", textShadow: "0 4px 16px rgba(0,0,0,0.4)",
        animation: "starBounce 0.7s ease-out 0.1s both",
      }}>
        {e.studentName}
      </div>
      {e.detail && (
        <div style={{ fontSize: "min(3.5vw, 36px)", opacity: 0.85, marginTop: 18, fontWeight: 600 }}>
          ✓ {e.detail}{e.letter && e.pct != null ? ` — ${e.letter} (${e.pct}%)` : ""}
        </div>
      )}
      {(e.pointsAwarded || 0) > 0 && (
        <div style={{
          marginTop: 30, padding: "14px 32px", borderRadius: 999,
          background: "linear-gradient(135deg, #fbbf24, #f97316)",
          fontSize: "min(5vw, 56px)", fontWeight: 900, letterSpacing: "0.02em",
          boxShadow: "0 12px 32px rgba(251,191,36,0.45)",
          animation: "starBounce 0.6s ease-out 0.2s both",
        }}>
          +{e.pointsAwarded} ⭐ points!
        </div>
      )}
    </div>
  );
}

/* ── refusal ─────────────────────────────────────────────────────── */

function RefusalOverlay({ e, onClose }: { e: StarBoardEvent; onClose: () => void }) {
  return (
    <div onClick={onClose} style={{
      position: "fixed", inset: 0, zIndex: 9999,
      background: "radial-gradient(ellipse at center, rgba(239,68,68,0.55) 0%, rgba(0,0,0,0.92) 80%)",
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      animation: "starBoardFade 0.4s ease-out, starShake 0.5s ease-out",
      color: "white", textAlign: "center", padding: 40,
    }}>
      <div style={{ fontSize: "min(24vw, 240px)", lineHeight: 1, marginBottom: 20, animation: "starShake 0.5s ease-out" }}>🚨</div>
      <div style={{
        fontSize: "min(10vw, 120px)", fontWeight: 900, letterSpacing: "-0.02em",
        textShadow: "0 6px 30px rgba(239,68,68,0.6)",
      }}>
        REFUSAL LOGGED
      </div>
      <div style={{
        fontSize: "min(8vw, 100px)", fontWeight: 800, marginTop: 10,
        color: "#fde68a", textShadow: "0 4px 16px rgba(0,0,0,0.4)",
      }}>
        {e.studentName}
      </div>
      <div style={{
        marginTop: 24, padding: "10px 26px", borderRadius: 999,
        background: "rgba(0,0,0,0.45)", border: "2px solid rgba(255,255,255,0.25)",
        fontSize: "min(4vw, 42px)", fontWeight: 800,
      }}>
        {e.refusalType || "Work Refusal"}
      </div>
      {e.detail && (
        <div style={{ fontSize: "min(3vw, 30px)", opacity: 0.8, marginTop: 18, fontWeight: 600 }}>
          {e.detail}
        </div>
      )}
    </div>
  );
}

/* ── confetti ────────────────────────────────────────────────────── */

function ConfettiRain() {
  // 30 emojis falling at random positions / speeds. Pure CSS animation.
  const emojis = ["🎉", "⭐", "✨", "🎊", "🏆", "🥇", "💯"];
  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      {Array.from({ length: 30 }).map((_, i) => {
        const left = Math.random() * 100;
        const delay = Math.random() * 1.2;
        const dur = 2.5 + Math.random() * 2;
        const size = 28 + Math.random() * 36;
        const emoji = emojis[i % emojis.length];
        return (
          <span key={i} style={{
            position: "absolute", left: `${left}%`, top: "-10%",
            fontSize: size, animation: `starConfetti ${dur}s linear ${delay}s infinite`,
          }}>{emoji}</span>
        );
      })}
    </div>
  );
}

/* ── roster card highlighter ─────────────────────────────────────── */
// Find the matching board roster card by data-student-id and apply a
// transient class. Picks the FIRST match so duplicate cards (rare) all
// get the effect via the CSS selector.
function highlightRosterCard(studentId: string, kind: StarBoardKind) {
  const klass = kind === "completion" ? "star-card-celebrate" : "star-card-alert";
  const cards = document.querySelectorAll<HTMLElement>(`.star-roster-card[data-student-id="${cssEscape(studentId)}"]`);
  cards.forEach((c) => {
    c.classList.remove("star-card-celebrate", "star-card-alert");
    // Force a reflow so the animation re-starts even if class was just removed
    void c.offsetWidth;
    c.classList.add(klass);
    window.setTimeout(() => c.classList.remove(klass), 6000);
  });
}
function cssEscape(s: string): string {
  // Minimal escape for use in attribute selectors
  return s.replace(/(["\\])/g, "\\$1");
}

/* ── shared keyframes ────────────────────────────────────────────── */

function Styles() {
  return (
    <style>{`
      @keyframes starBoardFade {
        from { opacity: 0; }
        to { opacity: 1; }
      }
      @keyframes starBounce {
        0%   { transform: scale(0.4); opacity: 0; }
        60%  { transform: scale(1.15); opacity: 1; }
        100% { transform: scale(1); opacity: 1; }
      }
      @keyframes starShake {
        0%, 100% { transform: translateX(0); }
        20% { transform: translateX(-12px); }
        40% { transform: translateX(12px); }
        60% { transform: translateX(-8px); }
        80% { transform: translateX(8px); }
      }
      @keyframes starConfetti {
        from { transform: translateY(0) rotate(0deg); opacity: 1; }
        to   { transform: translateY(110vh) rotate(720deg); opacity: 0.8; }
      }
      .star-card-celebrate {
        animation: starCardCelebrate 1.6s ease-in-out 2 !important;
        box-shadow: 0 0 0 3px #10b981, 0 0 24px 6px rgba(16,185,129,0.7) !important;
        z-index: 5;
      }
      .star-card-alert {
        animation: starCardAlert 0.5s ease-in-out 4 !important;
        box-shadow: 0 0 0 3px #ef4444, 0 0 24px 6px rgba(239,68,68,0.7) !important;
        z-index: 5;
      }
      @keyframes starCardCelebrate {
        0%, 100% { transform: scale(1); }
        50%      { transform: scale(1.06); }
      }
      @keyframes starCardAlert {
        0%, 100% { transform: translateX(0); }
        25%      { transform: translateX(-6px); }
        75%      { transform: translateX(6px); }
      }
    `}</style>
  );
}
