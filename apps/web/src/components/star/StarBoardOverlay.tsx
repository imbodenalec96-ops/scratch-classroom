// Full-board takeover overlays for STAR events. Mounts on
// ClassroomBoard. Listens to fireStarBoardEvent broadcasts:
//   • completion → green "GREAT JOB" celebration with confetti + chime
//   • refusal    → red "REFUSAL LOGGED" alert with siren tones
//
// Auto-dismisses after a few seconds. If multiple events stack, the
// newest one replaces the current one.

import { useEffect, useRef, useState } from "react";
import { onStarBoardEvent, type StarBoardEvent, type StarBoardKind, getActiveClassId, wasSeenLocally, markSeenLocally } from "../../lib/star/boardEvents.ts";
import { StarStore } from "../../lib/star/storage.ts";
import { tokens as T } from "../../lib/star/theme.ts";
import { successBeep, alertBeep, loggedBeep, errorBeep } from "../../lib/star/sounds.ts";
import { api } from "../../lib/api.ts";

const SHOW_MS = 6000;

export default function StarBoardOverlay() {
  const [evt, setEvt] = useState<StarBoardEvent | null>(null);

  const handleEvent = (e: StarBoardEvent) => {
    // photo-saved: ingest into local storage so the gradebook picks it
    // up on its next render. No popup — silent sync from another device.
    if (e.kind === "photo-saved" && e.photo && e.photo.dataUrl && e.photo.barcode) {
      try {
        const all = StarStore.getPhotos();
        const list = all[e.photo.barcode] || [];
        // Skip duplicates by id (the relay may replay events).
        if (!list.some((p) => p.id === e.photo!.id)) {
          all[e.photo.barcode] = [{
            id: e.photo.id,
            barcode: e.photo.barcode,
            studentId: e.photo.studentId,
            studentName: e.photo.studentName,
            dataUrl: e.photo.dataUrl,
            note: e.photo.note,
            ts: e.photo.ts,
          }, ...list];
          StarStore.setPhotos(all);
          loggedBeep();
        }
      } catch {}
      return;
    }
    // Skip pass events here — they belong on the ActivePassesStrip,
    // not the full takeover. Pass timing is shown in the strip.
    if (e.kind === "pass-out" || e.kind === "pass-in") return;
    // scan-to-phone is consumed by /star/phone; not a board overlay.
    if (e.kind === "scan-to-phone") return;
    // BUGFIX: these new event kinds were defaulting to the
    // RefusalOverlay because the binary `kind === "completion"` ?
    // CompletionOverlay : RefusalOverlay swallowed them. They have
    // their own UI (status pills on the roster card / brief toast on
    // the scanner / board timer kickoff) — no full takeover here.
    if (
      e.kind === "movement-out"     ||
      e.kind === "movement-in"      ||
      e.kind === "freetime-start"   ||
      e.kind === "freetime-end"     ||
      e.kind === "supply-out"       ||
      e.kind === "supply-in"        ||
      e.kind === "start-class-timer"||
      e.kind === "photo-saved"
    ) return;
    setEvt(e);
    if (e.kind === "completion") {
      successBeep();
      setTimeout(() => loggedBeep(), 200);
      // Browser-native TTS — speaks "Great job, Kaleb!" so the room
      // hears who got the win without staring at the board. No setup
      // required, works in every modern browser.
      speakName(`Great job, ${(e.studentName || "").split(/\s+/)[0]}!`);
    } else {
      alertBeep();
      setTimeout(() => errorBeep(), 350);
    }
    if (e.studentId) highlightRosterCard(e.studentId, e.kind);
  };

  function speakName(text: string) {
    try {
      const synth = window.speechSynthesis;
      if (!synth || !text) return;
      // Cancel any in-flight speech so back-to-back saves don't queue up.
      synth.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.rate = 1.0; u.pitch = 1.1; u.volume = 0.9;
      synth.speak(u);
    } catch {}
  }

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
    <div onClick={onClose} role="alertdialog" aria-label={`Great job ${e.studentName}`} style={{
      position: "fixed", inset: 0, zIndex: 9999,
      background: `radial-gradient(ellipse at center, ${T.color.success}66 0%, rgba(0,0,0,0.88) 80%)`,
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      animation: `starBoardFade ${T.motion.standard}`, color: T.color.text,
      textAlign: "center", padding: T.space["3xl"],
      cursor: "pointer", fontFamily: T.font.family,
    }}>
      <ConfettiRain />
      <div style={{ fontSize: "min(24vw, 240px)", lineHeight: 1, marginBottom: T.space.xl, animation: "starBounce 0.6s ease-out" }} aria-hidden>🎉</div>
      <div style={{
        fontSize: "min(11vw, 150px)", fontWeight: T.font.weight.black, letterSpacing: "-0.02em",
        textShadow: `0 6px 30px ${T.color.success}99`,
        animation: "starBounce 0.7s ease-out 0.05s both",
        lineHeight: 1,
      }}>
        GREAT JOB!
      </div>
      <div style={{
        fontFamily: T.font.serif, fontStyle: "italic",
        fontSize: "min(7vw, 96px)", fontWeight: 600, marginTop: T.space.md,
        color: T.color.accent, textShadow: "0 4px 16px rgba(0,0,0,0.45)",
        animation: "starBounce 0.7s ease-out 0.1s both",
      }}>
        {e.studentName}
      </div>
      {e.detail && (
        <div style={{
          fontSize: "min(3.5vw, 36px)", color: T.color.textMuted,
          marginTop: T.space.lg, fontWeight: T.font.weight.semibold,
        }}>
          ✓ {e.detail}{e.letter && e.pct != null ? ` — ${e.letter} (${e.pct}%)` : ""}
        </div>
      )}
      {(e.pointsAwarded || 0) > 0 && (
        <div style={{
          marginTop: T.space["2xl"], padding: `${T.space.md}px ${T.space["3xl"]}px`,
          borderRadius: T.radius.pill,
          background: "linear-gradient(135deg, #fbbf24, #f97316)",
          fontSize: "min(5vw, 56px)", fontWeight: T.font.weight.black,
          letterSpacing: "0.02em",
          boxShadow: `0 12px 36px rgba(251,191,36,0.55)`,
          animation: "starBounce 0.6s ease-out 0.2s both",
        }}>
          +{e.pointsAwarded} ⭐ points
        </div>
      )}
    </div>
  );
}

/* ── refusal ─────────────────────────────────────────────────────── */

function RefusalOverlay({ e, onClose }: { e: StarBoardEvent; onClose: () => void }) {
  return (
    <div onClick={onClose} role="alertdialog" aria-label={`Refusal logged for ${e.studentName}`} style={{
      position: "fixed", inset: 0, zIndex: 9999,
      background: `radial-gradient(ellipse at center, ${T.color.danger}88 0%, rgba(0,0,0,0.94) 80%)`,
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      animation: `starBoardFade ${T.motion.standard}, starShake 0.5s ease-out`,
      color: T.color.text, textAlign: "center", padding: T.space["3xl"],
      cursor: "pointer", fontFamily: T.font.family,
    }}>
      <div style={{ fontSize: "min(24vw, 240px)", lineHeight: 1, marginBottom: T.space.xl, animation: "starShake 0.5s ease-out" }} aria-hidden>🚨</div>
      <div style={{
        fontSize: "min(10vw, 130px)", fontWeight: T.font.weight.black,
        letterSpacing: "-0.02em",
        textShadow: `0 6px 30px ${T.color.danger}aa`,
        lineHeight: 1,
      }}>
        REFUSAL LOGGED
      </div>
      <div style={{
        fontFamily: T.font.serif, fontStyle: "italic",
        fontSize: "min(8vw, 100px)", fontWeight: 600, marginTop: T.space.md,
        color: T.color.accent, textShadow: "0 4px 16px rgba(0,0,0,0.45)",
      }}>
        {e.studentName}
      </div>
      <div style={{
        marginTop: T.space.xl,
        padding: `${T.space.sm}px ${T.space["2xl"]}px`,
        borderRadius: T.radius.pill,
        background: "rgba(0,0,0,0.50)", border: "2px solid rgba(255,255,255,0.30)",
        fontSize: "min(4vw, 42px)", fontWeight: T.font.weight.bold,
        letterSpacing: "0.02em",
      }}>
        {e.refusalType || "Work Refusal"}
      </div>
      {e.detail && (
        <div style={{
          fontSize: "min(3vw, 30px)", color: T.color.textMuted,
          marginTop: T.space.lg, fontWeight: T.font.weight.semibold,
        }}>
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
