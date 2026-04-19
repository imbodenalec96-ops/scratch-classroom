import React, { useEffect, useState, useRef, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../lib/auth.tsx";
import { useTheme } from "../lib/theme.tsx";
import { api } from "../lib/api.ts";
import { useSocket } from "../lib/ws.ts";
import { isWorkUnlocked, isAccessAllowed, setWorkUnlocked } from "../lib/workUnlock.ts";
import { isOnBreak, chooseBreak } from "../lib/breakSystem.ts";
import { useClassConfig } from "../lib/useClassConfig.ts";
import { usePresencePing } from "../lib/presence.ts";
import { motion, prefersReducedMotion, getSubjectPalette } from "../lib/motionPresets.ts";
import { Users, CheckCircle, Star, Lock, Megaphone, Trophy, Clock, Gamepad2 } from "lucide-react";
import { LearningAppTile, LearningAppGrid } from "./LearningAppTile.tsx";

type Phase = 'welcome' | 'loading' | 'working' | 'break' | 'done';

/* ── Count-up hook ── */
function useCountUp(target: number, duration = 900, delay = 0) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    if (target === 0) { setValue(0); return; }
    const t = setTimeout(() => {
      const start = performance.now();
      const tick = (now: number) => {
        const pct = Math.min((now - start) / duration, 1);
        setValue(Math.round((1 - Math.pow(1 - pct, 3)) * target));
        if (pct < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    }, delay);
    return () => clearTimeout(t);
  }, [target, duration, delay]);
  return value;
}

/* ── Starfall palettes: bright, playful, pastel per subject. Used by the
 *    assignment doer (WorkScreen) so every subject has its own warm backdrop. */
/* Soft tint wash over Paper cream (#FAF9F7) — subtle, not candy-shop. */
const STARFALL_PALETTES: Record<string, { bg: string; accent: string; emoji: string; label: string }> = {
  reading:        { bg: "linear-gradient(160deg, #f5eeff 0%, #faf9f7 60%)", accent: "#8b5cf6", emoji: "📖", label: "Reading" },
  math:           { bg: "linear-gradient(160deg, #fff5e0 0%, #faf9f7 60%)", accent: "#D97757", emoji: "🔢", label: "Math" },
  writing:        { bg: "linear-gradient(160deg, #eaf5ec 0%, #faf9f7 60%)", accent: "#059669", emoji: "✏️", label: "Writing" },
  spelling:       { bg: "linear-gradient(160deg, #e6f0fb 0%, #faf9f7 60%)", accent: "#2563eb", emoji: "🔤", label: "Spelling" },
  sel:            { bg: "linear-gradient(160deg, #fdeaec 0%, #faf9f7 60%)", accent: "#e11d48", emoji: "💛", label: "SEL" },
  daily_news:     { bg: "linear-gradient(160deg, #e4f0fa 0%, #faf9f7 60%)", accent: "#0284c7", emoji: "📰", label: "Daily News" },
  review:         { bg: "linear-gradient(160deg, #f1e8fa 0%, #faf9f7 60%)", accent: "#a855f7", emoji: "🔁", label: "Review" },
  science:        { bg: "linear-gradient(160deg, #e0f2ed 0%, #faf9f7 60%)", accent: "#0d9488", emoji: "🔬", label: "Science" },
  social_studies: { bg: "linear-gradient(160deg, #fbecd8 0%, #faf9f7 60%)", accent: "#c2410c", emoji: "🌎", label: "Social Studies" },
};
function getStarfallPalette(subject?: string | null) {
  const key = String(subject || "").toLowerCase().trim();
  return STARFALL_PALETTES[key] || {
    bg: "linear-gradient(160deg, #f1e8fa 0%, #faf9f7 60%)",
    accent: "#8b5cf6",
    emoji: "📝",
    label: "Today's Work",
  };
}

/* ── Read-aloud: speak question text via Web Speech API. Cancels any in-flight
 *    utterance first so rapid taps don't queue up. Gracefully no-ops if the
 *    browser doesn't support SpeechSynthesis. */
function speakText(text: string) {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  try {
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(String(text || ""));
    u.rate = 0.95;
    u.pitch = 1.05;
    u.lang = "en-US";
    // Prefer a friendly voice if available
    const voices = window.speechSynthesis.getVoices();
    const friendly = voices.find(v => /samantha|karen|google us english|child/i.test(v.name));
    if (friendly) u.voice = friendly;
    window.speechSynthesis.speak(u);
  } catch { /* best effort */ }
}
function stopSpeaking() {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  try { window.speechSynthesis.cancel(); } catch {}
}

/* ── Confetti ── */
function spawnConfetti() {
  const glyphs = ["🎉", "✨", "🌟", "💫", "🎊", "⭐", "🏆"];
  for (let i = 0; i < 20; i++) {
    const el = document.createElement("span");
    el.textContent = glyphs[i % glyphs.length];
    el.style.cssText = `position:fixed;left:${Math.random() * 100}vw;top:-2rem;font-size:${1.2 + Math.random()}rem;pointer-events:none;z-index:9999;animation:confettiFall 2s ease-in forwards;animation-delay:${Math.random() * 0.8}s`;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 3000);
  }
  if (!document.getElementById("confetti-style")) {
    const s = document.createElement("style");
    s.id = "confetti-style";
    s.textContent = `@keyframes confettiFall { to { transform: translateY(110vh) rotate(720deg); opacity: 0; } }`;
    document.head.appendChild(s);
  }
}

/* ── YouTubeRequestForm — inline request-a-video form ── */
function YouTubeRequestForm({ dk, userId, onSent }: { dk: boolean; userId?: string; onSent?: () => void }) {
  const [title, setTitle] = React.useState("");
  const [sent, setSent] = React.useState(false);
  const [sending, setSending] = React.useState(false);
  const submit = async () => {
    if (!title.trim() || !userId) return;
    setSending(true);
    try {
      await api.createYouTubeRequest({ student_id: userId, title: title.trim() });
      setTitle(""); setSent(true);
      setTimeout(() => setSent(false), 3000);
      onSent?.();
    } catch (e: any) {
      alert("Couldn't send request: " + e.message);
    } finally { setSending(false); }
  };
  return (
    <div>
      <div className="text-xs font-bold mb-2" style={{ color: dk ? "rgba(255,255,255,0.6)" : "#64748b" }}>
        🎬 Want a video? Ask your teacher:
      </div>
      <div className="flex gap-2">
        <input
          value={title}
          onChange={e => setTitle(e.target.value)}
          onKeyDown={e => e.key === "Enter" && submit()}
          placeholder="e.g. fun math song about fractions"
          className="input text-sm flex-1"
          style={{ minHeight: 40 }}
        />
        <button onClick={submit} disabled={!title.trim() || sending}
          className={`text-xs font-bold px-4 rounded-xl cursor-pointer transition-all ${
            sent ? "bg-emerald-500 text-white" : "btn-primary"
          }`}
          style={{ minHeight: 40 }}>
          {sent ? "✓ Sent!" : sending ? "…" : "Request"}
        </button>
      </div>
      <p className="text-[10px] mt-1.5" style={{ color: dk ? "rgba(255,255,255,0.25)" : "#94a3b8" }}>
        Your teacher will find the video and approve it for you.
      </p>
    </div>
  );
}

/* ── Flying Word-Buddy (butterfly companion) ── */
function FlyingBuddy({ active = true }: { active?: boolean }) {
  const rm = prefersReducedMotion();
  if (rm || !active) return null;
  return (
    <div
      aria-hidden="true"
      style={{
        position: "fixed",
        top: "15%",
        right: "3%",
        zIndex: 45,
        pointerEvents: "none",
        animation: "buddyFloat 8s ease-in-out infinite",
        transformOrigin: "center",
      }}
    >
      <style>{`
        @keyframes buddyFloat {
          0%   { transform: translate(0, 0) rotate(-5deg) scaleX(1); }
          20%  { transform: translate(-40px, -30px) rotate(5deg) scaleX(-1); }
          40%  { transform: translate(-80px, 10px) rotate(-8deg) scaleX(1); }
          60%  { transform: translate(-40px, 40px) rotate(6deg) scaleX(-1); }
          80%  { transform: translate(20px, 15px) rotate(-4deg) scaleX(1); }
          100% { transform: translate(0, 0) rotate(-5deg) scaleX(1); }
        }
        @keyframes wingFlap {
          0%, 100% { transform: scaleY(1); }
          50%       { transform: scaleY(0.6); }
        }
      `}</style>
      <svg width="52" height="44" viewBox="0 0 52 44" fill="none">
        {/* Left wings */}
        <ellipse cx="14" cy="18" rx="13" ry="17" fill="#f9a8d4" opacity="0.85" style={{ animation: "wingFlap 0.4s ease-in-out infinite" }}/>
        <ellipse cx="12" cy="30" rx="10" ry="10" fill="#fda4af" opacity="0.7" style={{ animation: "wingFlap 0.4s ease-in-out infinite 0.1s" }}/>
        {/* Right wings */}
        <ellipse cx="38" cy="18" rx="13" ry="17" fill="#c4b5fd" opacity="0.85" style={{ animation: "wingFlap 0.4s ease-in-out infinite 0.05s" }}/>
        <ellipse cx="40" cy="30" rx="10" ry="10" fill="#a5b4fc" opacity="0.7" style={{ animation: "wingFlap 0.4s ease-in-out infinite 0.15s" }}/>
        {/* Body */}
        <ellipse cx="26" cy="22" rx="4" ry="14" fill="#7c3aed"/>
        {/* Head */}
        <circle cx="26" cy="7" r="5" fill="#6d28d9"/>
        {/* Eyes */}
        <circle cx="24" cy="6" r="1.2" fill="white"/>
        <circle cx="28" cy="6" r="1.2" fill="white"/>
        <circle cx="24.5" cy="6" r="0.6" fill="#1e293b"/>
        <circle cx="28.5" cy="6" r="0.6" fill="#1e293b"/>
        {/* Smile */}
        <path d="M23.5 8.5 Q26 10.5 28.5 8.5" stroke="#f9a8d4" strokeWidth="1" strokeLinecap="round" fill="none"/>
        {/* Antennae */}
        <line x1="24" y1="3" x2="21" y2="-1" stroke="#7c3aed" strokeWidth="1.2" strokeLinecap="round"/>
        <line x1="28" y1="3" x2="31" y2="-1" stroke="#7c3aed" strokeWidth="1.2" strokeLinecap="round"/>
        <circle cx="21" cy="-1" r="1.5" fill="#f9a8d4"/>
        <circle cx="31" cy="-1" r="1.5" fill="#c4b5fd"/>
        {/* Wing letter accents */}
        <text x="10" y="21" fontSize="8" fill="white" opacity="0.7" fontWeight="bold">A</text>
        <text x="36" y="21" fontSize="8" fill="white" opacity="0.7" fontWeight="bold">B</text>
      </svg>
    </div>
  );
}

/* ── TypewriterText ── */
function TypewriterText({ text, speed = 28, className, style }: {
  text: string; speed?: number; className?: string; style?: React.CSSProperties;
}) {
  const [displayed, setDisplayed] = useState("");
  const [done, setDone] = useState(false);
  const rm = prefersReducedMotion();
  useEffect(() => {
    if (rm) { setDisplayed(text); setDone(true); return; }
    setDisplayed(""); setDone(false);
    let i = 0;
    const iv = setInterval(() => {
      i++;
      setDisplayed(text.slice(0, i));
      if (i >= text.length) { clearInterval(iv); setDone(true); }
    }, speed);
    return () => clearInterval(iv);
  }, [text, speed, rm]);
  return (
    <span className={className} style={style} onClick={() => { setDisplayed(text); setDone(true); }}>
      {displayed}
      {!done && <span style={{ borderRight: "2px solid currentColor", marginLeft: 1, animation: "blink 0.7s step-end infinite" }} />}
    </span>
  );
}

/* ── StreakCounter ── */
function StreakCounter({ streak }: { streak: number }) {
  const rm = prefersReducedMotion();
  if (streak < 2) return null;
  return (
    <div
      style={{
        position: "fixed",
        top: 72,
        left: 16,
        zIndex: 46,
        background: "linear-gradient(135deg, #f59e0b, #ef4444)",
        borderRadius: 20,
        padding: "6px 14px",
        color: "white",
        fontWeight: 800,
        fontSize: 14,
        display: "flex",
        alignItems: "center",
        gap: 6,
        boxShadow: "0 4px 16px rgba(245,158,11,0.3)",
        animation: rm ? "none" : "scaleIn 0.3s cubic-bezier(0.34,1.56,0.64,1)",
        pointerEvents: "none",
      }}
    >
      🔥 {streak} in a row!
    </div>
  );
}

/* ── Mascot Star SVG ── */
function MascotStar({ size = 64 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" aria-hidden="true" focusable="false">
      <path
        d="M32 5L39 24H59L43.5 35.5L49.5 54.5L32 43L14.5 54.5L20.5 35.5L5 24H25L32 5Z"
        fill="#fbbf24"
        stroke="#f59e0b"
        strokeWidth="2.5"
        strokeLinejoin="round"
      />
      <circle cx="25.5" cy="29" r="2.8" fill="#1e293b" />
      <circle cx="38.5" cy="29" r="2.8" fill="#1e293b" />
      <circle cx="26.8" cy="27.5" r="0.9" fill="white" />
      <circle cx="39.8" cy="27.5" r="0.9" fill="white" />
      <path d="M25.5 37 Q32 43.5 38.5 37" stroke="#1e293b" strokeWidth="2.5" strokeLinecap="round" fill="none" />
      <circle cx="22" cy="35" r="3.2" fill="#fb7185" opacity="0.35" />
      <circle cx="42" cy="35" r="3.2" fill="#fb7185" opacity="0.35" />
    </svg>
  );
}

/* ── Mascot component ── */
function Mascot({ state, style }: { state: 'idle' | 'cheer'; style?: React.CSSProperties }) {
  const rm = prefersReducedMotion();
  return (
    <div
      className={rm ? "" : state === 'idle' ? "mascot-bop" : "mascot-cheer"}
      style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", ...style }}
      aria-hidden="true"
    >
      <MascotStar size={state === 'cheer' ? 80 : 64} />
    </div>
  );
}

/* ── Welcome Screen ── */
function WelcomeScreen({ name }: { name: string }) {
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center" style={{ background: "var(--bg)" }}>
      <div className="absolute inset-0 pointer-events-none opacity-[0.04]"
        style={{ backgroundImage: "linear-gradient(var(--text-1) 1px, transparent 1px), linear-gradient(90deg, var(--text-1) 1px, transparent 1px)", backgroundSize: "32px 32px" }} />
      <div className="relative z-10 text-center space-y-4 animate-page-enter max-w-md px-6">
        <div className="section-label mb-3">— {new Date().toLocaleDateString("en-US", { weekday: "long" })} —</div>
        <h1 className="font-display text-6xl leading-[1.02]" style={{ color: "var(--text-1)" }}>
          {greeting},<br/>
          <em style={{ color: "var(--accent)", fontStyle: "italic" }}>{name.split(" ")[0]}.</em>
        </h1>
        <p className="text-sm mt-4" style={{ color: "var(--text-2)" }}>Setting your desk up…</p>
        <div className="flex justify-center gap-1.5 mt-4">
          {[0, 1, 2].map((i) => (
            <span key={i} className="w-1.5 h-1.5 rounded-full animate-bounce"
              style={{ background: "var(--accent)", animationDelay: `${i * 150}ms` }} />
          ))}
        </div>
      </div>
    </div>
  );
}

/* ── Break Timer Screen ── */
function BreakScreen({ dk, onDone }: { dk: boolean; onDone: () => void }) {
  const BREAK_SECONDS = 10 * 60;
  const [secs, setSecs] = useState(BREAK_SECONDS);
  useEffect(() => {
    const iv = setInterval(() => setSecs((s) => { if (s <= 1) { clearInterval(iv); onDone(); return 0; } return s - 1; }), 1000);
    return () => clearInterval(iv);
  }, []);
  const mm = String(Math.floor(secs / 60)).padStart(2, "0");
  const ss = String(secs % 60).padStart(2, "0");
  const pct = ((BREAK_SECONDS - secs) / BREAK_SECONDS) * 100;
  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-8" style={{ background: "var(--bg)" }}>
      <div className="absolute inset-0 pointer-events-none opacity-[0.04]"
        style={{ backgroundImage: "linear-gradient(var(--text-1) 1px, transparent 1px), linear-gradient(90deg, var(--text-1) 1px, transparent 1px)", backgroundSize: "32px 32px" }} />
      <div className="relative z-10 text-center space-y-3">
        <div className="text-5xl">☕</div>
        <div className="section-label">— Pause —</div>
        <h2 className="font-display text-5xl leading-tight" style={{ color: "var(--text-1)" }}>
          Break<em style={{ color: "var(--accent)", fontStyle: "italic" }}> time.</em>
        </h2>
        <p className="text-sm" style={{ color: "var(--text-2)" }}>Relax, stretch, grab some water.</p>
      </div>
      <div className="relative w-48 h-48 z-10">
        <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
          <circle cx="50" cy="50" r="44" fill="none" stroke="var(--border)" strokeWidth="4" />
          <circle cx="50" cy="50" r="44" fill="none" stroke="var(--accent)" strokeWidth="4"
            strokeDasharray={`${2 * Math.PI * 44}`}
            strokeDashoffset={`${2 * Math.PI * 44 * (1 - pct / 100)}`}
            strokeLinecap="round"
            style={{ transition: "stroke-dashoffset 1s linear" }} />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="font-display text-5xl tabular-nums leading-none" style={{ color: "var(--text-1)" }}>{mm}:{ss}</span>
          <span className="text-[10px] uppercase tracking-wider mt-2" style={{ color: "var(--text-3)" }}>remaining</span>
        </div>
      </div>
      <div className="relative flex items-center justify-center">
        <div className="w-24 h-24 rounded-full bg-cyan-500/20 animate-ping absolute" style={{ animationDuration: "4s" }} />
        <div className="w-16 h-16 rounded-full bg-cyan-400/30 flex items-center justify-center text-2xl">🌊</div>
      </div>
      <button onClick={onDone} className="text-white/40 text-sm hover:text-white/70 transition-colors cursor-pointer" style={{ minHeight: 44, padding: "10px 20px" }}>
        Skip break →
      </button>
    </div>
  );
}

/* ── Progress dots ── */
function ProgressDots({ total, current, answers }: { total: number; current: number; answers: Record<number, string> }) {
  return (
    <div className="flex items-center justify-center gap-1.5 flex-wrap" role="tablist" aria-label="Questions">
      {Array.from({ length: total }).map((_, i) => (
        <div key={i} role="tab" aria-selected={i === current}
          className={`rounded-full transition-all duration-300 ${i === current ? "w-6 h-3 bg-violet-500" : answers[i] !== undefined ? "w-3 h-3 bg-emerald-500" : "w-3 h-3 bg-gray-200"}`} />
      ))}
    </div>
  );
}

/* ── Interactive Assignment Worker ── */
function WorkScreen({
  assignment, parsed, dk, onComplete, onBreak, questionsAnswered, setQuestionsAnswered,
}: {
  assignment: any; parsed: any; dk: boolean;
  onComplete: (answers: Record<number, string>) => void;
  onBreak: () => void;
  questionsAnswered: number; setQuestionsAnswered: (n: number) => void;
}) {
  const allQuestions: Array<{ q: any; sectionTitle: string }> = parsed?.sections
    ?.flatMap((s: any) => s.questions.map((q: any) => ({ q, sectionTitle: s.title }))) ?? [];
  const total = allQuestions.length;
  const [currentQ, setCurrentQ] = useState(0);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [showBreakBanner, setShowBreakBanner] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [mascotState, setMascotState] = useState<'idle' | 'cheer'>('idle');
  const [cardKey, setCardKey] = useState(0);
  const [streak, setStreak] = useState(0);
  const [showHint, setShowHint] = useState(false);
  const q = allQuestions[currentQ];
  const currentAnswer = answers[currentQ] ?? "";
  const rm = prefersReducedMotion();

  const subjectPal = getSubjectPalette(parsed?.subject);
  // Starfall overlay palette — brighter pastel backdrop per subject
  const starfall = getStarfallPalette(parsed?.subject);
  // Stop any in-flight speech when leaving the screen or switching questions
  useEffect(() => () => stopSpeaking(), []);
  useEffect(() => { stopSpeaking(); }, [currentQ]);

  const handleSelect = (value: string) => {
    const isNew = answers[currentQ] === undefined;
    setAnswers((prev) => ({ ...prev, [currentQ]: value }));
    if (isNew) {
      const next = questionsAnswered + 1;
      setQuestionsAnswered(next);
      if (next >= 3) setShowBreakBanner(true);
      setStreak(s => s + 1);
      // Briefly cheer the mascot
      setMascotState('cheer');
      setTimeout(() => setMascotState('idle'), 800);
    }
    setShowHint(false); // hide hint on new answer
  };

  const handleNext = () => {
    if (currentQ < total - 1) {
      setCurrentQ(currentQ + 1);
      setCardKey(k => k + 1);
      setShowHint(false);
    }
  };
  const handlePrev = () => {
    if (currentQ > 0) {
      setCurrentQ(currentQ - 1);
      setCardKey(k => k + 1);
      setStreak(0);
      setShowHint(false);
    }
  };

  const handleSubmit = () => {
    spawnConfetti();
    setMascotState('cheer');
    setSubmitted(true);
    setTimeout(() => onComplete(answers), 2200);
  };

  if (submitted) {
    const submittedCount = Object.keys(answers).length;
    const starfallSubmit = getStarfallPalette(parsed?.subject);
    return (
      <div
        className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-6 starfall-doer"
        style={{ background: starfallSubmit.bg }}
      >
        <div
          className="relative z-10 text-center max-w-md px-8 py-10 rounded-3xl animate-fade-in"
          style={{
            background: "rgba(255,255,255,0.92)",
            border: "1px solid rgba(0,0,0,0.04)",
            boxShadow: `0 8px 24px ${starfallSubmit.accent}14`,
          }}
        >
          <div style={{ fontSize: 64 }}>🎉</div>
          <div className="text-xs uppercase tracking-[0.18em] font-semibold mt-2 mb-1" style={{ color: starfallSubmit.accent }}>
            All done!
          </div>
          <h2 className="font-display text-5xl leading-[1.05]" style={{ color: "#1e293b" }}>
            Nice
            <em style={{ color: starfallSubmit.accent, fontStyle: "italic" }}> work!</em>
          </h2>
          <p className="text-sm mt-4" style={{ color: "#64748b" }}>
            {submittedCount} of {total} answered · heading home…
          </p>
        </div>
        <div
          className="fixed top-5 right-5 z-40 pointer-events-none"
          style={{ transform: "scale(0.55)", transformOrigin: "top right", opacity: 0.9 }}
        >
          <Mascot state="cheer" />
        </div>
      </div>
    );
  }

  const todayName = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"][new Date().getDay()];
  const answeredCount = Object.keys(answers).length;
  const progress = total > 0 ? (answeredCount / total) * 100 : 0;

  // Starfall-themed backdrop — bright pastel per subject, same in light + dark
  // so kids get the same warm feel regardless of theme.
  const starfallBg = starfall.bg;

  return (
    <div className="fixed inset-0 z-50 overflow-auto starfall-doer" style={{ background: starfallBg, touchAction: "pan-y" }}>
      {/* Break banner */}
      {showBreakBanner && (
        <div className="fixed top-0 left-0 right-0 z-[60] flex items-center justify-between px-5 py-3 text-sm font-medium"
          style={{ background: "linear-gradient(90deg, #0e7490, #0891b2)", color: "white" }}>
          <span>☕ You've earned a 10-minute break!</span>
          <div className="flex gap-3">
            <button onClick={onBreak} className="px-4 py-1.5 rounded-xl bg-white/20 hover:bg-white/30 transition-colors cursor-pointer font-bold" style={{ minHeight: 40 }}>
              Take Break
            </button>
            <button onClick={() => setShowBreakBanner(false)} className="text-white/60 hover:text-white cursor-pointer px-2" style={{ minHeight: 40 }}>✕</button>
          </div>
        </div>
      )}

      <div className={`mx-auto px-6 py-12 space-y-7 ${showBreakBanner ? "pt-20" : ""}`} style={{ maxWidth: 720 }}>

        {/* ── Editorial header: exit + subject eyebrow + progress strip ── */}
        <div className="animate-slide-up" style={{ animationDelay: "0ms" }}>
          <div className="flex items-center justify-between mb-4">
            <button
              onClick={() => {
                if (answeredCount > 0 && !confirm("Leave before finishing? Your answers so far will be lost.")) return;
                window.location.reload();
              }}
              className="btn-ghost text-xs gap-1.5"
              style={{ padding: "6px 10px" }}>
              ← Back to dashboard
            </button>
            <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.12em]" style={{ color: "#6B6860" }}>
              <span style={{ fontSize: 16 }}>{subjectPal.emoji}</span>
              <span>{parsed?.subject || subjectPal.label}</span>
              <span style={{ color: "#D4CEC2" }}>·</span>
              <span>{todayName}</span>
            </div>
          </div>

          {/* Masthead */}
          <div className="text-[11px] font-semibold uppercase tracking-[0.12em] mb-2" style={{ color: starfall.accent }}>— Today's assignment —</div>
          <h1 className="font-display text-3xl sm:text-4xl leading-[1.05]" style={{ color: "#1A1915" }}>
            {assignment.title}<em style={{ color: starfall.accent, fontStyle: "italic" }}>.</em>
          </h1>
        </div>

        {/* ── Editorial progress strip: dots + counter + slim bar ── */}
        <div className="animate-slide-up" style={{ animationDelay: "60ms" }}>
          <div className="flex items-center justify-between mb-2">
            <div className="text-[11px] uppercase tracking-wider font-semibold" style={{ color: "#6B6860" }}>
              Question {currentQ + 1} <span style={{ color: "#D4CEC2" }}>of</span> {total}
            </div>
            <div className="text-[11px] uppercase tracking-wider font-semibold" style={{ color: starfall.accent }}>
              {answeredCount} answered · {Math.round(progress)}%
            </div>
          </div>
          <div style={{ height: 3, background: "rgba(26,25,21,0.08)", overflow: "hidden", borderRadius: 2 }}>
            <div style={{
              width: `${progress}%`, height: "100%",
              background: starfall.accent,
              transition: "width 0.6s cubic-bezier(0.16,1,0.3,1)",
            }}/>
          </div>
        </div>

        {/* ── Section label ── */}
        {q && (
          <div className="text-[11px] font-semibold uppercase tracking-[0.12em] animate-slide-up" style={{ animationDelay: "90ms", color: starfall.accent }}>
            — {q.sectionTitle} —
          </div>
        )}

        {/* ── Question card — editorial: big serif, generous whitespace ── */}
        {q && (
          <div key={`card-${cardKey}`}
            className={rm ? "" : "animate-fade-in"}
            style={{ animationDelay: "80ms" }}>
            <div className="p-8 sm:p-10 space-y-6" style={{
              background: "#ffffff",
              border: "1px solid rgba(0,0,0,0.05)",
              borderLeft: `3px solid ${starfall.accent}`,
              borderRadius: 20,
              boxShadow: `0 4px 16px rgba(24,23,30,0.05)`,
            }}>
              {/* Question text — Fraunces serif, typewriter reveal, tap-to-listen */}
              <div className="flex items-start gap-3">
                <p className="font-display leading-[1.3] flex-1" style={{ color: "#1A1915", fontSize: "clamp(1.75rem, 2.4vw, 2.25rem)" }}>
                  <TypewriterText text={q.q.text} speed={28} />
                </p>
                <button
                  onClick={() => speakText(q.q.text)}
                  className="flex-shrink-0 rounded-full flex items-center justify-center cursor-pointer transition-transform active:scale-95 hover:scale-105"
                  style={{
                    width: 44, height: 44,
                    background: `${starfall.accent}14`,
                    color: starfall.accent,
                    border: `1px solid ${starfall.accent}33`,
                    touchAction: "manipulation",
                  }}
                  title="Read aloud"
                  aria-label="Read question aloud"
                >
                  <span style={{ fontSize: 18, lineHeight: 1 }}>🔊</span>
                </button>
              </div>

              {/* Hint — always light (Starfall surface is always light) */}
              {q.q.hint && (
                <div>
                  {showHint ? (
                    <div
                      className="rounded-2xl p-3 border animate-fade-in"
                      style={{ background: "#fffbeb", borderColor: "#fde68a" }}>
                      <span className="text-xs font-bold" style={{ color: "#92400e" }}>💡 Hint: </span>
                      <span className="text-sm" style={{ color: "#5A4B1F" }}>{q.q.hint}</span>
                    </div>
                  ) : (
                    <button onClick={() => setShowHint(true)}
                      className="text-xs font-semibold px-3 py-1.5 rounded-full cursor-pointer transition-all"
                      style={{ background: "#fffbeb", color: "#92400e", border: "1px solid #fde68a" }}>
                      💡 Show Hint
                    </button>
                  )}
                </div>
              )}

              {/* ── Multiple choice ── */}
              {q.q.type === "multiple_choice" && Array.isArray(q.q.options) && q.q.options.length > 0 ? (
                <div className="space-y-3">
                  {q.q.options.map((opt: string, oi: number) => {
                    const isSelected = currentAnswer === opt;
                    const letter = String.fromCharCode(65 + oi);
                    return (
                      <button
                        key={oi}
                        onClick={() => handleSelect(opt)}
                        className="w-full text-left rounded-2xl font-medium transition-colors duration-150 cursor-pointer flex items-center gap-4 animate-fade-in"
                        style={{
                          minHeight: 68,
                          padding: "14px 20px",
                          fontSize: 17,
                          background: isSelected ? `${starfall.accent}0d` : "#ffffff",
                          border: `1px solid ${isSelected ? starfall.accent : "rgba(0,0,0,0.08)"}`,
                          color: "#1A1915",
                          touchAction: "manipulation",
                          animationDelay: `${oi * 40}ms`,
                        }}
                        aria-pressed={isSelected}
                      >
                        <span
                          className="flex-shrink-0 rounded-full flex items-center justify-center font-bold transition-colors"
                          style={{
                            width: 36,
                            height: 36,
                            background: isSelected ? starfall.accent : `${starfall.accent}12`,
                            color: isSelected ? "white" : starfall.accent,
                            fontSize: 15,
                          }}
                        >
                          {isSelected ? "✓" : letter}
                        </span>
                        <span className="flex-1" style={{ fontWeight: 600, color: "#1A1915" }}>
                          {opt.replace(/^[A-D]\.\s*/, "")}
                        </span>
                      </button>
                    );
                  })}
                </div>
              ) : (() => {
                /* ── Fallback input for anything that isn't MC: short_answer,
                   fill_blank, computation, undefined, etc. Math subject →
                   numeric keypad. Enter advances/submits. ── */
                const isMath = String(parsed?.subject || "").toLowerCase() === "math";
                const isShort = q.q.type === "short_answer" && (q.q.lines || 0) > 1;
                const onEnter = (e: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
                  if (e.key === "Enter" && !e.shiftKey && !isShort) {
                    e.preventDefault();
                    if (String(currentAnswer).trim()) {
                      if (currentQ < total - 1) handleNext(); else handleSubmit();
                    }
                  }
                };
                const sharedStyle: React.CSSProperties = {
                  width: "100%",
                  minHeight: isShort ? 140 : 64,
                  padding: "16px 20px",
                  fontSize: isShort ? 17 : 22,
                  fontFamily: isShort ? undefined : "'Fraunces', ui-serif, Georgia, serif",
                  fontWeight: 600,
                  color: "#1A1915",
                  background: "#FAF9F7",
                  border: `2px solid ${starfall.accent}33`,
                  borderRadius: 16,
                  outline: "none",
                  touchAction: "manipulation",
                };
                const placeholder = isShort ? "Write your answer here…" : (isMath ? "Type your answer…" : "Type your answer…");
                return (
                  <div>
                    {isShort ? (
                      <textarea
                        value={currentAnswer}
                        onChange={(e) => handleSelect(e.target.value)}
                        placeholder={placeholder}
                        rows={q.q.lines || 4}
                        style={{ ...sharedStyle, resize: "vertical" }}
                        onFocus={(e) => (e.currentTarget.style.borderColor = starfall.accent)}
                        onBlur={(e) => (e.currentTarget.style.borderColor = `${starfall.accent}33`)}
                      />
                    ) : (
                      <input
                        type={isMath ? "text" : "text"}
                        inputMode={isMath ? "numeric" : "text"}
                        autoComplete="off"
                        autoCorrect={isMath ? "off" : "on"}
                        value={currentAnswer}
                        onChange={(e) => handleSelect(e.target.value)}
                        onKeyDown={onEnter}
                        placeholder={placeholder}
                        style={sharedStyle}
                        onFocus={(e) => (e.currentTarget.style.borderColor = starfall.accent)}
                        onBlur={(e) => (e.currentTarget.style.borderColor = `${starfall.accent}33`)}
                      />
                    )}
                    <div className="text-[11px] mt-2" style={{ color: "#8A867E" }}>
                      {isShort ? "Shift + Enter for a new line" : "Press Enter to continue"}
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>
        )}

        {/* ── Navigation buttons ── */}
        {(() => {
          const answered = String(currentAnswer).trim().length > 0;
          const isLast = currentQ >= total - 1;
          return (
            <div className="flex items-center gap-3 animate-slide-up" style={{ animationDelay: "180ms" }}>
              <button
                onClick={handlePrev}
                disabled={currentQ === 0}
                className="rounded-2xl font-semibold transition-all cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                style={{
                  minHeight: 56, minWidth: 100, padding: "0 20px", fontSize: 15,
                  background: "#ffffff", color: "#5A564F",
                  border: "1px solid rgba(0,0,0,0.1)",
                  touchAction: "manipulation",
                }}>
                ← Back
              </button>
              <button
                onClick={isLast ? handleSubmit : handleNext}
                disabled={!answered}
                className="flex-1 rounded-2xl font-bold transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                style={{
                  minHeight: 56, fontSize: 16, color: "white",
                  background: answered
                    ? (isLast ? "linear-gradient(135deg, #10b981, #059669)" : starfall.accent)
                    : "#D4CEC2",
                  border: "none",
                  touchAction: "manipulation",
                }}
                title={answered ? undefined : "Answer the question to continue"}>
                {isLast ? "Submit Work ✓" : "Next Question →"}
              </button>
            </div>
          );
        })()}

        {/* ── Progress dots ── */}
        <ProgressDots total={total} current={currentQ} answers={answers} />

        <div style={{ height: 80 }} /> {/* spacer so mascot doesn't overlap last button */}
      </div>

      {/* ── Mascot — small corner badge, top-right, doesn't overlap card ── */}
      <div className="fixed top-4 right-4 z-40 pointer-events-none select-none"
        aria-hidden="true"
        style={{
          transform: mascotState === 'cheer' ? "scale(0.6)" : "scale(0.5)",
          transformOrigin: "top right",
          opacity: 0.85,
          transition: "transform 0.4s ease-out",
        }}>
        <Mascot state={mascotState} />
      </div>

      {/* Flying word-buddy */}
      <FlyingBuddy active={!dk} />

      {/* Streak counter */}
      <StreakCounter streak={streak} />
    </div>
  );
}

/* ── Simple Assignment Card (for non-AI / unstructured assignments) ── */
function SimpleAssignmentCard({ assignment, dk, onComplete }: { assignment: any; dk: boolean; onComplete: () => void }) {
  const [confirming, setConfirming] = useState(false);
  const todayName = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"][new Date().getDay()];
  const subjectPal = getSubjectPalette(assignment?.description);

  const lightBg = `linear-gradient(160deg, ${subjectPal.bg} 0%, #faf9ff 60%, #f0f1ff 100%)`;

  return (
    <div className="fixed inset-0 z-50 overflow-auto flex flex-col items-center justify-center p-6"
      style={{ background: dk ? "#07071a" : lightBg }}>
      <div className={`w-full max-w-lg space-y-6 animate-spring-in`}>
        <div className={dk
          ? "rounded-3xl p-8 space-y-5 shadow-2xl border border-white/[0.07] bg-white/[0.04]"
          : "clay-card p-8 space-y-5"
        }>
          {/* Subject icon + title */}
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-3xl shadow-md flex-shrink-0"
              style={{ background: `linear-gradient(135deg, ${subjectPal.border}, ${subjectPal.bg})` }}>
              {subjectPal.emoji}
            </div>
            <div>
              <div className="text-xs font-bold uppercase tracking-widest mb-1" style={{ color: dk ? "rgba(255,255,255,0.4)" : subjectPal.accent }}>
                📅 {todayName}'s Assignment
              </div>
              <h1 className="font-student text-2xl font-extrabold" style={{ color: dk ? "white" : "#1e293b" }}>
                {assignment.title}
              </h1>
            </div>
          </div>

          {/* Instructions box */}
          {assignment.description && (
            <div className="rounded-2xl p-5 border-2"
              style={{ background: dk ? "rgba(245,158,11,0.06)" : "#fffbeb", borderColor: dk ? "rgba(245,158,11,0.2)" : "#fde68a" }}>
              <div className="font-bold text-sm mb-2" style={{ color: dk ? "#fbbf24" : "#92400e" }}>
                📋 Instructions from your teacher
              </div>
              <p className="text-sm leading-relaxed" style={{ color: dk ? "rgba(251,191,36,0.7)" : "#78350f" }}>
                {assignment.description}
              </p>
            </div>
          )}

          {assignment.due_date && (
            <p className="text-xs" style={{ color: dk ? "rgba(255,255,255,0.3)" : "#94a3b8" }}>
              Due: {new Date(assignment.due_date).toLocaleDateString()}
            </p>
          )}

          {!confirming ? (
            <button onClick={() => setConfirming(true)}
              className={dk
                ? "w-full py-4 rounded-2xl font-bold text-white text-lg cursor-pointer transition-all hover:opacity-90 active:scale-[0.98]"
                : "clay-btn w-full text-lg"
              }
              style={{
                minHeight: 64,
                background: "linear-gradient(135deg, #10b981, #059669)",
                color: "white",
                borderColor: dk ? "transparent" : "rgba(16,185,129,0.3)",
              }}>
              I'm Done ✓
            </button>
          ) : (
            <div className="space-y-3 animate-spring-in">
              <p className="text-center text-sm font-semibold" style={{ color: dk ? "rgba(255,255,255,0.6)" : "#64748b" }}>
                Are you sure you've finished?
              </p>
              <div className="flex gap-3">
                <button onClick={() => setConfirming(false)}
                  className={dk
                    ? "flex-1 py-3 rounded-2xl font-semibold text-sm border border-white/10 text-white/50 hover:bg-white/[0.05] cursor-pointer"
                    : "clay-btn flex-1"
                  }
                  style={!dk ? { background: "#f1f5f9", color: "#475569", borderColor: "#e2e8f0", fontSize: 15 } : { minHeight: 52 }}>
                  Not yet
                </button>
                <button onClick={onComplete}
                  className={dk
                    ? "flex-1 py-3 rounded-2xl font-bold text-sm text-white cursor-pointer"
                    : "clay-btn flex-1"
                  }
                  style={{
                    background: "linear-gradient(135deg, #10b981, #059669)",
                    color: "white",
                    borderColor: "rgba(16,185,129,0.3)",
                    ...(dk ? { minHeight: 52 } : {}),
                  }}>
                  Yes, submit! 🌟
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Mascot */}
      {!dk && (
        <div className="fixed bottom-5 right-5 z-40 pointer-events-none" aria-hidden="true">
          <Mascot state="idle" />
        </div>
      )}
    </div>
  );
}

/* ── Dashboard (shown after work is done) ── */
export default function StudentDashboard() {
  const { user } = useAuth();
  const { theme } = useTheme();
  const dk = theme === "dark";
  const navigate = useNavigate();

  const [phase, setPhase] = useState<Phase>('welcome');
  // Reactive unlock state — students get dashboard access when on a 10-min
  // break OR after teacher-granted free time OR after submitting all work.
  // Re-polled every second + on `breakstate-change` + on `storage` so the
  // UI flips without a refresh when any of those flags change.
  const [accessUnlocked, setAccessUnlocked] = useState<boolean>(isAccessAllowed);
  // When access flips from unlocked → locked (e.g. break timer just ended,
  // teacher revoked freetime), re-fetch pending assignments so the WorkScreen
  // has fresh data. Without this the dashboard stays on phase='done' and
  // renders the playground even though the student should be back at work.
  const prevAccessRef = React.useRef<boolean>(accessUnlocked);
  useEffect(() => {
    if (prevAccessRef.current && !accessUnlocked) {
      setPhase('loading');
    }
    prevAccessRef.current = accessUnlocked;
  }, [accessUnlocked]);
  useEffect(() => {
    const refresh = () => setAccessUnlocked(isAccessAllowed());
    const onStorage = (e: StorageEvent) => { if (e.key === "workDoneDate" || e.key === null) refresh(); };
    window.addEventListener("breakstate-change", refresh);
    window.addEventListener("storage", onStorage);
    window.addEventListener("blockforge:workdone-change", refresh);
    const iv = setInterval(refresh, 1000);
    return () => {
      window.removeEventListener("breakstate-change", refresh);
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("blockforge:workdone-change", refresh);
      clearInterval(iv);
    };
  }, []);
  const [classes, setClasses] = useState<any[]>([]);
  const [submissions, setSubmissions] = useState<any[]>([]);
  const [leaderboard, setLeaderboard] = useState<any[]>([]);
  const [lockedScreen, setLockedScreen] = useState(false);
  const [broadcast, setBroadcast] = useState<string | null>(null);
  const [joinCode, setJoinCode] = useState("");
  const [joinSuccess, setJoinSuccess] = useState(false);
  const [classVideo, setClassVideo] = useState<any>(null);
  const joinBtnRef = useRef<HTMLButtonElement>(null);
  const [mascotCelebrating, setMascotCelebrating] = useState(false);
  const [youtubeLibrary, setYoutubeLibrary] = useState<any[]>([]);
  const [playingLibVideo, setPlayingLibVideo] = useState<{ videoId: string; title: string } | null>(null);
  // Teacher-granted websites (Poki-style per-student URL library)
  const [myWebsites, setMyWebsites] = useState<any[]>([]);
  const [showWebsiteRequest, setShowWebsiteRequest] = useState(false);
  const [websiteRequestTitle, setWebsiteRequestTitle] = useState("");
  const [websiteRequestSent, setWebsiteRequestSent] = useState(false);
  useEffect(() => {
    api.getMyWebsites().then(setMyWebsites).catch(() => {});
  }, []);
  const classConfig = useClassConfig();

  // Reload YouTube library from ALL classes (merged) so we never miss videos
  useEffect(() => {
    if (classes.length === 0) return;
    const loadAll = async () => {
      const results = await Promise.all(
        classes.map(c => api.getYouTubeLibrary(c.id).catch(() => [] as any[]))
      );
      const seen = new Set<string>();
      const merged: any[] = [];
      for (const arr of results) {
        for (const v of arr) {
          if (!seen.has(v.id)) { seen.add(v.id); merged.push(v); }
        }
      }
      setYoutubeLibrary(merged);
    };
    loadAll();
    const iv = setInterval(loadAll, 60_000);
    return () => clearInterval(iv);
  }, [classes]);

  // Work state
  const [pendingAssignment, setPendingAssignment] = useState<any>(null);
  const [parsedAssignment, setParsedAssignment] = useState<any>(null);
  const [questionsAnswered, setQuestionsAnswered] = useState(0);

  // Pending quizzes (Bug #32): quizzes created by teachers should surface here
  const [pendingQuizzes, setPendingQuizzes] = useState<any[]>([]);
  const [activeQuiz, setActiveQuiz] = useState<any | null>(null);
  const [quizAnswers, setQuizAnswers] = useState<number[]>([]);
  const [quizResult, setQuizResult] = useState<{ score: number } | null>(null);
  const [quizSubmitting, setQuizSubmitting] = useState(false);

  // Stats
  const [statClasses, setStatClasses] = useState(0);
  const [statSubmitted, setStatSubmitted] = useState(0);
  const [statGraded, setStatGraded] = useState(0);
  const c0 = useCountUp(statClasses, 900, 200);
  const c1 = useCountUp(statSubmitted, 900, 290);
  const c2 = useCountUp(statGraded, 900, 380);

  // Behavior stars
  const [myStars, setMyStars] = useState({ stars: 0, rewards: 0 });
  useEffect(() => {
    if (user?.role !== "student") return;
    let cancelled = false;
    const load = () => api.getMyStars().then(d => { if (!cancelled) setMyStars({ stars: d.stars ?? 0, rewards: d.rewards ?? 0 }); }).catch(() => {});
    load();
    const iv = setInterval(load, 20_000);
    return () => { cancelled = true; clearInterval(iv); };
  }, [user?.role]);

  // Welcome → loading transition
  useEffect(() => {
    const t = setTimeout(() => setPhase('loading'), 1800);
    return () => clearTimeout(t);
  }, []);

  // Load data (with 7s global timeout — if anything stalls, fail-open so the
  // student sees the dashboard rather than an infinite spinner)
  useEffect(() => {
    if (phase !== 'loading') return;
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      setPhase('done');
    }, 7000);
    const load = async () => {
      try {
        const [clsList, subList, lb] = await Promise.all([
          api.getClasses().catch(() => [] as any[]),
          api.getMySubmissions().catch(() => [] as any[]),
          api.getLeaderboard().catch(() => [] as any[]),
        ]);
        if (timedOut) return;
        setClasses(clsList);
        setSubmissions(subList);
        setLeaderboard(lb);
        setStatClasses(clsList.length);
        setStatSubmitted(subList.length);
        setStatGraded(subList.filter((s: any) => s.grade !== null).length);

        // Load YouTube library for first enrolled class
        if (clsList.length > 0) {
          api.getYouTubeLibrary(clsList[0].id).then(setYoutubeLibrary).catch(() => {});
        }

        let found: any = null;
        let foundParsed: any = null;
        const allQuizzes: any[] = [];
        for (const cls of clsList) {
          try {
            const pending = await api.getPendingAssignments(cls.id);
            if (pending && pending.length > 0 && !found) {
              const a = pending[0];
              found = a;
              if (a.content) {
                try {
                  const parsed = JSON.parse(a.content);
                  if (parsed?.sections?.length > 0) foundParsed = parsed;
                } catch {}
              }
            }
          } catch {}
          // Bug #32: pull pending quizzes per class too
          try {
            const qz = await api.getPendingQuizzes(cls.id);
            if (Array.isArray(qz) && qz.length) {
              qz.forEach((q: any) => allQuizzes.push({ ...q, _className: cls.name }));
            }
          } catch {}
        }
        setPendingQuizzes(allQuizzes);

        if (found) {
          setPendingAssignment(found);
          setParsedAssignment(foundParsed);
          setPhase('working');
        } else {
          setPhase('done');
        }
        clearTimeout(timer);
      } catch {
        clearTimeout(timer);
        setPhase('done');
      }
    };
    load();
    return () => clearTimeout(timer);
  }, [phase]);

  // Poll for video
  useEffect(() => {
    if (classes.length === 0) return;
    const fetchVideo = async () => {
      for (const cls of classes) {
        try {
          const v = await api.getClassVideo(cls.id);
          if (v?.video_id) { setClassVideo(v); return; }
        } catch {}
      }
      setClassVideo(null);
    };
    fetchVideo();
    const iv = setInterval(fetchVideo, 30000);
    return () => clearInterval(iv);
  }, [classes]);

  // Poll for screen lock
  useEffect(() => {
    if (classes.length === 0) return;
    const checkLock = async () => {
      for (const cls of classes) {
        try {
          const ctrl = await api.getMyControls(cls.id);
          if (ctrl?.screen_locked) { setLockedScreen(true); return; }
        } catch {}
      }
      setLockedScreen(false);
    };
    checkLock();
    const iv = setInterval(checkLock, 5000);
    return () => clearInterval(iv);
  }, [classes]);

  const phaseActivity =
    phase === 'welcome' ? "Just logged in 👋" :
    phase === 'loading' ? "Loading dashboard 🔄" :
    phase === 'working' ? `Working on assignment 📝${pendingAssignment ? ` — ${pendingAssignment.title}` : ""}` :
    phase === 'break'   ? "On break ☕" :
                          "Free time! 🎉";
  usePresencePing(phaseActivity);

  useSocket("class:lock", (data) => setLockedScreen(data.locked));
  useSocket("class:broadcast", (data) => {
    setBroadcast(`${data.from}: ${data.message}`);
    setTimeout(() => setBroadcast(null), 10000);
  });

  const handleJoinClass = async () => {
    if (!joinCode.trim()) return;
    try {
      await api.joinClass(joinCode.trim().toUpperCase());
      const updated = await api.getClasses();
      setClasses(updated);
      setStatClasses(updated.length);
      setJoinCode(""); setJoinSuccess(true);
      if (joinBtnRef.current) {
        const glyphs = ["🎉","✨","🌟"];
        const rect = joinBtnRef.current.getBoundingClientRect();
        for (let i = 0; i < 6; i++) {
          const el = document.createElement("span");
          el.textContent = glyphs[i % glyphs.length];
          el.style.cssText = `position:fixed;left:${rect.left + rect.width/2}px;top:${rect.top}px;font-size:1rem;pointer-events:none;z-index:9999;transition:transform .7s ease,opacity .7s ease;opacity:1`;
          document.body.appendChild(el);
          requestAnimationFrame(() => { el.style.transform = `translate(${(Math.random()-0.5)*100}px,-80px)`; el.style.opacity = "0"; });
          setTimeout(() => el.remove(), 800);
        }
      }
      setTimeout(() => setJoinSuccess(false), 2000);
    } catch (err: any) { alert(err.message); }
  };

  const handleWorkComplete = useCallback(async (answers: Record<number, string>) => {
    if (pendingAssignment) {
      try {
        await api.submitAssignmentWithAnswers(pendingAssignment.id, answers);
      } catch {}
    }
    setWorkUnlocked();
    spawnConfetti();
    setMascotCelebrating(true);
    setTimeout(() => setMascotCelebrating(false), 3000);
    try {
      const subs = await api.getMySubmissions();
      setSubmissions(subs);
      setStatSubmitted(subs.length);
      setStatGraded(subs.filter((s: any) => s.grade !== null).length);
    } catch {}
    setPhase('done');
  }, [pendingAssignment]);

  // "Take Break" from inside WorkScreen → use the REAL break system
  // (chooseBreak writes localStorage + fires breakstate-change). The
  // accessUnlocked listener above will flip within ~1s and the dashboard
  // falls through to the playground render. No more setPhase('break') → the
  // legacy full-screen BreakScreen just dropped the student right back into
  // WorkScreen when it exited (= "restarted the assignments" bug).
  const handleTakeBreak = useCallback(() => {
    chooseBreak();
    setAccessUnlocked(true); // optimistic — don't wait for 1s poll
  }, []);
  const handleBreakDone = useCallback(() => setPhase('working'), []);

  const myEntry = leaderboard.find((e: any) => e.user_id === user?.id);
  const rm = prefersReducedMotion();

  // ── RENDER ──

  if (lockedScreen) {
    return (
      <div className={`fixed inset-0 z-50 flex items-center justify-center ${dk ? "bg-[#07071a]/98" : "bg-white/95"} backdrop-blur-xl`}>
        <div className="text-center">
          <div className={`w-20 h-20 rounded-2xl flex items-center justify-center mx-auto mb-4 ${dk ? "bg-white/[0.06]" : "bg-gray-100"}`}>
            <Lock size={36} className={dk ? "text-white/60" : "text-gray-400"} />
          </div>
          <h2 className={`text-2xl font-bold ${dk ? "text-white" : "text-gray-900"}`}>Screen Locked</h2>
          <p className={`mt-2 text-sm ${dk ? "text-white/40" : "text-gray-500"}`}>Your teacher has locked screens.</p>
        </div>
      </div>
    );
  }

  if (phase === 'welcome') return <WelcomeScreen name={user?.name || "Student"} />;

  if (phase === 'loading') return (
    <div className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: "linear-gradient(135deg, #0f0726, #0a0b20)" }}>
      <div className="text-center space-y-4">
        <div className="w-12 h-12 border-2 border-violet-500 border-t-transparent rounded-full animate-spin mx-auto" />
        <p className="text-white/50 text-sm">Checking your assignments…</p>
      </div>
    </div>
  );

  // Access-unlocked short-circuit: while the student is on a 10-min break OR
  // after teacher granted free time / all work submitted, skip the "do your
  // work" gate and render the full dashboard so Arcade/Projects/YouTube are
  // reachable. This is what makes the dashboard flip in real-time when the
  // teacher clicks Grant Free Time or the student starts a break.
  if (!accessUnlocked) {
    if (phase === 'working' && pendingAssignment && parsedAssignment) {
      return (
        <WorkScreen
          assignment={pendingAssignment} parsed={parsedAssignment} dk={dk}
          onComplete={handleWorkComplete} onBreak={handleTakeBreak}
          questionsAnswered={questionsAnswered} setQuestionsAnswered={setQuestionsAnswered}
        />
      );
    }

    if (phase === 'working' && pendingAssignment && !parsedAssignment) {
      return <SimpleAssignmentCard assignment={pendingAssignment} dk={dk} onComplete={() => handleWorkComplete({})} />;
    }

    if (phase === 'break') return <BreakScreen dk={dk} onDone={handleBreakDone} />;
  }

  // ── DONE / DASHBOARD ──
  const unlocked = accessUnlocked;
  const starsCount = Math.max(0, Math.min(5, myStars.stars));
  const firstName = user?.name?.split(" ")[0] || "Student";

  const DB_ANIM = `
    @keyframes dbGrad { 0%,100%{background-position:0% 50%} 50%{background-position:100% 50%} }
    @keyframes dbFloat { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-4px)} }
    @keyframes dbPop { from{opacity:0;transform:scale(.85) translateY(10px)} to{opacity:1;transform:none} }
    @keyframes dbStarPulse { 0%,100%{filter:drop-shadow(0 0 3px rgba(251,191,36,.8))} 50%{filter:drop-shadow(0 0 9px rgba(251,191,36,1)) drop-shadow(0 0 18px rgba(245,158,11,.6))} }
    @keyframes dbSlide { from{opacity:0;transform:translateY(16px)} to{opacity:1;transform:none} }
    @keyframes dbShimmer { 0%{background-position:-200% center} 100%{background-position:200% center} }
  `;

  return (
    <div style={{
      minHeight: "100dvh",
      background: "linear-gradient(135deg, #0b0520 0%, #14082e 40%, #0d1a3a 70%, #0a0520 100%)",
      color: "white",
      fontFamily: "'Inter', system-ui, sans-serif",
      padding: "0 0 100px 0",
      position: "relative",
    }}>
      <style>{DB_ANIM}</style>
      {broadcast && (
        <div style={{
          position: "fixed", top: 0, left: 0, right: 0, zIndex: 40,
          padding: "12px 24px", textAlign: "center", fontSize: 14, fontWeight: 700,
          background: "linear-gradient(90deg, #7c3aed, #6d28d9)",
          color: "white", display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
        }}>
          <Megaphone size={15} />{broadcast}
        </div>
      )}

      {/* ── Header ── */}
      <header style={{
        padding: "24px 20px 20px",
        borderBottom: "1px solid rgba(255,255,255,0.08)",
        animation: "dbPop .5s ease both",
      }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
          <div>
            <div style={{ fontSize: 11, opacity: 0.45, textTransform: "uppercase", letterSpacing: "0.22em", marginBottom: 4 }}>
              {new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
            </div>
            <h1 style={{
              fontSize: "clamp(28px, 6vw, 42px)", fontWeight: 900, margin: 0, lineHeight: 1.1,
              background: unlocked
                ? "linear-gradient(90deg,#6ee7b7,#34d399,#a7f3d0)"
                : "linear-gradient(90deg,#e0c3fc,#a78bfa,#c4b5fd)",
              backgroundSize: "200% auto",
              WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
              animation: "dbGrad 4s linear infinite",
            }}>
              {unlocked ? `Free time, ${firstName}!` : `Hey, ${firstName}! 👋`}
            </h1>
            <p style={{ fontSize: 13, opacity: 0.55, marginTop: 4 }}>
              {unlocked ? "Work done — you've earned it. Play something!" : "Ready to learn? Your work is below."}
            </p>
          </div>

          {/* Stars display */}
          <div style={{
            padding: "12px 18px", borderRadius: 16,
            background: starsCount >= 5
              ? "linear-gradient(135deg,rgba(245,158,11,.4),rgba(234,179,8,.25))"
              : "rgba(255,255,255,0.06)",
            border: starsCount >= 5
              ? "1px solid rgba(245,158,11,.65)"
              : "1px solid rgba(255,255,255,0.1)",
            display: "flex", flexDirection: "column", alignItems: "center", gap: 6,
            animation: starsCount >= 5 ? "dbPop .5s ease .2s both" : "dbSlide .5s ease .2s both",
          }}>
            <div style={{ fontSize: 10, opacity: 0.5, textTransform: "uppercase", letterSpacing: "0.2em" }}>Behavior Stars</div>
            <div style={{ display: "flex", gap: 4 }}>
              {Array.from({ length: 5 }, (_, i) => (
                <span key={i} style={{
                  fontSize: 22,
                  opacity: i < starsCount ? 1 : 0.15,
                  filter: i < starsCount ? undefined : "grayscale(1) brightness(.3)",
                  animation: i < starsCount && starsCount >= 5 ? "dbStarPulse 2s ease-in-out infinite" : undefined,
                  animationDelay: `${i * 0.12}s`,
                }}>⭐</span>
              ))}
            </div>
            <div style={{ fontSize: 13, fontWeight: 800, opacity: 0.9 }}>
              {starsCount}/5
              {myStars.rewards > 0 && <span style={{ marginLeft: 8, color: "#fbbf24" }}>· 🏆 {myStars.rewards}</span>}
            </div>
            {starsCount >= 5 && <div style={{ fontSize: 11, color: "#fcd34d", fontWeight: 700 }}>McDonald's! 🎉</div>}
          </div>
        </div>
      </header>

      <div style={{ padding: "16px 20px", display: "flex", flexDirection: "column", gap: 14 }}>

      {/* ── Stats ── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
        {[
          { label: "Classes",   value: c0, color: "#38bdf8" },
          { label: "Submitted", value: c1, color: "#34d399" },
          { label: "Graded",    value: c2, color: "#a78bfa" },
        ].map((s, i) => (
          <div key={s.label} style={{
            borderRadius: 14, padding: "14px 12px", textAlign: "center",
            background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.09)",
            animation: `dbSlide .45s ease ${80 + i * 60}ms both`,
          }}>
            <div style={{ fontSize: 28, fontWeight: 900, color: s.color, fontVariantNumeric: "tabular-nums" }}>{s.value}</div>
            <div style={{ fontSize: 10, opacity: 0.5, textTransform: "uppercase", letterSpacing: "0.18em", marginTop: 2 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* ── Today's Quizzes ── */}
      {pendingQuizzes.length > 0 && !activeQuiz && (
        <div style={{ animation: "dbSlide .5s ease .16s both" }}>
          <div style={{ fontSize: 10, opacity: 0.45, textTransform: "uppercase", letterSpacing: "0.22em", marginBottom: 10 }}>
            📝 Today's Quizzes
          </div>
          <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))" }}>
            {pendingQuizzes.map((q) => (
              <button key={q.id}
                onClick={() => { setActiveQuiz(q); setQuizAnswers(new Array((q.questions || []).length).fill(-1)); setQuizResult(null); }}
                style={{
                  textAlign: "left", padding: "16px", cursor: "pointer",
                  background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)",
                  borderLeft: "3px solid #a78bfa", borderRadius: 14,
                  transition: "transform .15s", color: "white",
                }}
                onMouseEnter={e => { (e.currentTarget as any).style.transform = "scale(1.02)"; }}
                onMouseLeave={e => { (e.currentTarget as any).style.transform = ""; }}
              >
                <div style={{ fontSize: 10, opacity: 0.45, textTransform: "uppercase", letterSpacing: "0.14em", marginBottom: 4 }}>
                  {q._className || "Quiz"} · {(q.questions || []).length} questions
                </div>
                <div style={{ fontSize: 18, fontWeight: 800 }}>{q.title || "Untitled quiz"}</div>
                {q.estimated_minutes && <div style={{ fontSize: 11, opacity: 0.45, marginTop: 4 }}>~{q.estimated_minutes} min</div>}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Inline quiz taker */}
      {activeQuiz && (
        <div style={{
          borderRadius: 16, padding: "20px",
          background: "rgba(255,255,255,0.06)", border: "1px solid rgba(139,92,246,.4)",
          animation: "dbSlide .4s ease both",
        }}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, marginBottom: 16 }}>
            <div>
              <div style={{ fontSize: 10, opacity: 0.4, textTransform: "uppercase", letterSpacing: "0.2em", marginBottom: 4 }}>Quiz</div>
              <h2 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>{activeQuiz.title}</h2>
            </div>
            <button onClick={() => { setActiveQuiz(null); setQuizResult(null); }} style={{ fontSize: 13, opacity: 0.5, background: "none", border: "none", color: "white", cursor: "pointer" }}>Close</button>
          </div>

          {quizResult ? (
            <div style={{ textAlign: "center", padding: "24px 0" }}>
              <div style={{ fontSize: 52, fontWeight: 900, color: "#a78bfa" }}>{quizResult.score}%</div>
              <div style={{ opacity: 0.6, marginTop: 8 }}>Quiz submitted. Nice work! 🎉</div>
              <button
                onClick={() => {
                  setPendingQuizzes((prev) => prev.filter((x) => x.id !== activeQuiz.id));
                  setActiveQuiz(null); setQuizResult(null);
                }}
                style={{ marginTop: 16, padding: "10px 24px", borderRadius: 12, background: "#7c3aed", color: "white", border: "none", fontWeight: 700, cursor: "pointer" }}>
                Done
              </button>
            </div>
          ) : (
            <>
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {(activeQuiz.questions || []).map((q: any, qi: number) => (
                  <div key={qi} style={{ padding: 14, borderRadius: 12, background: "rgba(255,255,255,0.05)" }}>
                    <div style={{ fontWeight: 700, marginBottom: 10 }}>{qi + 1}. {q.text}</div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      {(q.options || []).map((opt: string, oi: number) => (
                        <label key={oi} style={{
                          display: "flex", alignItems: "center", gap: 8, cursor: "pointer", padding: "8px 10px", borderRadius: 10,
                          background: quizAnswers[qi] === oi ? "rgba(139,92,246,.3)" : "rgba(255,255,255,.04)",
                          border: quizAnswers[qi] === oi ? "1px solid rgba(139,92,246,.5)" : "1px solid rgba(255,255,255,.06)",
                        }}>
                          <input type="radio" name={`q-${qi}`} checked={quizAnswers[qi] === oi}
                            onChange={() => setQuizAnswers((a) => { const n = [...a]; n[qi] = oi; return n; })} />
                          <span>{opt}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              <button
                disabled={quizSubmitting || quizAnswers.some((a) => a < 0)}
                onClick={async () => {
                  setQuizSubmitting(true);
                  try {
                    const r = await api.submitQuiz(activeQuiz.id, quizAnswers);
                    setQuizResult({ score: r.score });
                  } catch (e: any) {
                    alert("Could not submit: " + (e?.message || "unknown error"));
                  } finally { setQuizSubmitting(false); }
                }}
                style={{ marginTop: 16, padding: "12px 24px", borderRadius: 12, background: "#7c3aed", color: "white", border: "none", fontWeight: 700, cursor: "pointer", opacity: (quizSubmitting || quizAnswers.some(a => a < 0)) ? 0.4 : 1 }}>
                {quizSubmitting ? "Submitting…" : "Submit quiz"}
              </button>
            </>
          )}
        </div>
      )}

      {/* ── Free Time Unlocked ── */}
      {unlocked && (
        <div style={{ animation: "dbSlide .5s ease .2s both" }}>
          <div style={{ fontSize: 10, opacity: 0.45, textTransform: "uppercase", letterSpacing: "0.22em", marginBottom: 10 }}>
            ✅ Free time earned
          </div>
          <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))" }}>
            <Link to="/arcade" style={{ textDecoration: "none" }}>
              <div style={{
                padding: "20px 18px", borderRadius: 18, cursor: "pointer",
                background: "linear-gradient(135deg,rgba(139,92,246,.45),rgba(99,102,241,.3))",
                border: "1px solid rgba(139,92,246,.6)",
                boxShadow: "0 0 30px rgba(139,92,246,.2)",
                animation: "dbPop .5s ease .24s both",
                transition: "transform .15s, box-shadow .15s",
              }}
              onMouseEnter={e => { (e.currentTarget as any).style.transform="scale(1.03)"; (e.currentTarget as any).style.boxShadow="0 0 50px rgba(139,92,246,.4)"; }}
              onMouseLeave={e => { (e.currentTarget as any).style.transform=""; (e.currentTarget as any).style.boxShadow="0 0 30px rgba(139,92,246,.2)"; }}
              >
                <div style={{ fontSize: 36, marginBottom: 8 }}>🎮</div>
                <div style={{ fontSize: 20, fontWeight: 900, letterSpacing: "-0.01em" }}>Arcade</div>
                <div style={{ fontSize: 12, opacity: 0.6, marginTop: 3 }}>29 games · keep it fun</div>
              </div>
            </Link>
            <Link to="/projects" style={{ textDecoration: "none" }}>
              <div style={{
                padding: "20px 18px", borderRadius: 18, cursor: "pointer",
                background: "linear-gradient(135deg,rgba(16,185,129,.4),rgba(5,150,105,.25))",
                border: "1px solid rgba(16,185,129,.55)",
                boxShadow: "0 0 30px rgba(16,185,129,.18)",
                animation: "dbPop .5s ease .31s both",
                transition: "transform .15s, box-shadow .15s",
              }}
              onMouseEnter={e => { (e.currentTarget as any).style.transform="scale(1.03)"; (e.currentTarget as any).style.boxShadow="0 0 50px rgba(16,185,129,.38)"; }}
              onMouseLeave={e => { (e.currentTarget as any).style.transform=""; (e.currentTarget as any).style.boxShadow="0 0 30px rgba(16,185,129,.18)"; }}
              >
                <div style={{ fontSize: 36, marginBottom: 8 }}>💻</div>
                <div style={{ fontSize: 20, fontWeight: 900, letterSpacing: "-0.01em" }}>Projects</div>
                <div style={{ fontSize: 12, opacity: 0.6, marginTop: 3 }}>BlockForge · 2D & 3D stages</div>
              </div>
            </Link>
          </div>
        </div>
      )}

      {/* Class video */}
      {classVideo && (
        <div style={{
          borderRadius: 16, overflow: "hidden",
          background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)",
          animation: "dbSlide .5s ease .28s both",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "12px 14px" }}>
            <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#f87171", animation: "pulse 2s infinite" }} />
            <span style={{ fontSize: 13, fontWeight: 700, opacity: 0.85 }}>📺 Your Teacher Shared a Video</span>
            {classVideo.video_title && <span style={{ fontSize: 11, opacity: 0.4, marginLeft: "auto" }}>{classVideo.video_title}</span>}
          </div>
          <div style={{ position: "relative", paddingTop: "56.25%", overflow: "hidden" }}>
            <iframe
              src={`https://www.youtube-nocookie.com/embed/${classVideo.video_id}?rel=0&modestbranding=1&playsinline=1`}
              title={classVideo.video_title || "Class Video"}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share; fullscreen"
              allowFullScreen
              style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", border: "none" }}
            />
          </div>
        </div>
      )}

      {/* YouTube Library nav card — only during free time or break */}
      {(unlocked || isOnBreak()) && classConfig.youtubeEnabled && (
        <button
          onClick={() => navigate("/student/videos")}
          style={{
            width: "100%", padding: 0, background: "none", border: "none", cursor: "pointer",
            borderRadius: 16, overflow: "hidden",
            boxShadow: "0 4px 24px rgba(0,0,0,0.35)",
            transition: "transform 0.15s, box-shadow 0.15s",
            animation: "dbSlide .5s ease .3s both",
            touchAction: "manipulation",
            textAlign: "left",
          }}
          onMouseEnter={e => {
            (e.currentTarget as HTMLElement).style.transform = "translateY(-3px)";
            (e.currentTarget as HTMLElement).style.boxShadow = "0 12px 36px rgba(139,92,246,0.35)";
          }}
          onMouseLeave={e => {
            (e.currentTarget as HTMLElement).style.transform = "";
            (e.currentTarget as HTMLElement).style.boxShadow = "0 4px 24px rgba(0,0,0,0.35)";
          }}
        >
          <div style={{
            background: "linear-gradient(135deg, rgba(139,92,246,0.25) 0%, rgba(59,130,246,0.18) 60%, rgba(239,68,68,0.12) 100%)",
            border: "1px solid rgba(139,92,246,0.3)",
            borderRadius: 16,
            padding: "16px 18px",
            display: "flex", alignItems: "center", gap: 14,
          }}>
            <div style={{
              width: 52, height: 52, borderRadius: 14, flexShrink: 0,
              background: "linear-gradient(135deg, #7c3aed, #2563eb)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 26,
              boxShadow: "0 4px 16px rgba(124,58,237,0.45)",
            }}>📺</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 15, fontWeight: 900, color: "rgba(255,255,255,0.95)" }}>Video Library</div>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.45)", marginTop: 2 }}>
                {youtubeLibrary.length > 0
                  ? `${youtubeLibrary.length} ${youtubeLibrary.length === 1 ? "video" : "videos"} ready to watch`
                  : "Browse your teacher's picks"}
              </div>
            </div>
            <div style={{ fontSize: 18, opacity: 0.4, flexShrink: 0 }}>›</div>
          </div>
        </button>
      )}

      {/* Learning Apps */}
      {(unlocked || isOnBreak()) && (myWebsites.length > 0 || true) && (
        <div style={{
          borderRadius: 16, padding: "14px",
          background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)",
          animation: "dbSlide .5s ease .31s both",
        }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 14, fontWeight: 800, opacity: 0.9 }}>🌐 Learning Apps</span>
              {myWebsites.length > 0 && (
                <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 20, background: "rgba(99,102,241,.25)", color: "#a5b4fc" }}>
                  {myWebsites.length}
                </span>
              )}
            </div>
            <button
              onClick={() => { setShowWebsiteRequest(true); setWebsiteRequestSent(false); setWebsiteRequestTitle(""); }}
              style={{ fontSize: 11, fontWeight: 700, padding: "5px 12px", borderRadius: 20, cursor: "pointer", background: "rgba(99,102,241,.2)", color: "#a5b4fc", border: "1px solid rgba(99,102,241,.35)" }}
            >
              📝 Ask for a new website
            </button>
          </div>

          {myWebsites.length > 0 ? (
            <LearningAppGrid>
              {myWebsites.map((w: any) => (
                <LearningAppTile key={w.id} app={w} dk={true} />
              ))}
            </LearningAppGrid>
          ) : (
            <div style={{ textAlign: "center", padding: "24px 16px", opacity: 0.35 }}>
              <div style={{ fontSize: 36, marginBottom: 8 }}>🌐</div>
              <p style={{ fontSize: 12, fontWeight: 700, marginBottom: 4 }}>No learning apps yet — ask your teacher!</p>
              <p style={{ fontSize: 11 }}>Got a site you'd love? Let them know.</p>
            </div>
          )}
        </div>
      )}

      {/* Website request modal */}
      {showWebsiteRequest && (
        <div style={{ position: "fixed", inset: 0, zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center", padding: 16, background: "rgba(0,0,0,0.7)" }} onClick={() => setShowWebsiteRequest(false)}>
          <div style={{
            maxWidth: 440, width: "100%", padding: 24, borderRadius: 20,
            background: "linear-gradient(135deg,#1a0f40,#0f1a3a)",
            border: "1px solid rgba(139,92,246,.4)",
            boxShadow: "0 20px 60px rgba(0,0,0,.6)",
            color: "white",
          }} onClick={e => e.stopPropagation()}>
            <h3 style={{ fontSize: 20, fontWeight: 800, marginBottom: 8 }}>Request a website</h3>
            <p style={{ fontSize: 13, opacity: 0.55, marginBottom: 16 }}>
              Tell your teacher the name of the site you'd like to use. They'll review it and unlock it for you.
            </p>
            {websiteRequestSent ? (
              <div style={{ textAlign: "center", padding: "16px 0" }}>
                <div style={{ fontSize: 40, marginBottom: 8 }}>✅</div>
                <p style={{ fontSize: 14, fontWeight: 700, color: "#34d399" }}>Request sent! Your teacher will review it.</p>
                <button onClick={() => setShowWebsiteRequest(false)} style={{ marginTop: 16, padding: "10px 24px", borderRadius: 12, background: "#7c3aed", color: "white", border: "none", fontWeight: 700, cursor: "pointer" }}>Close</button>
              </div>
            ) : (
              <>
                <input
                  autoFocus
                  value={websiteRequestTitle}
                  onChange={e => setWebsiteRequestTitle(e.target.value)}
                  placeholder="e.g. Typing Club, Prodigy, Cool Math…"
                  style={{ width: "100%", padding: "12px 14px", borderRadius: 12, marginBottom: 14, background: "rgba(255,255,255,0.09)", border: "1px solid rgba(255,255,255,0.15)", color: "white", fontSize: 14, outline: "none", boxSizing: "border-box" }}
                  maxLength={200}
                  onKeyDown={async e => {
                    if (e.key === "Enter" && websiteRequestTitle.trim()) {
                      try { await api.requestWebsite(websiteRequestTitle.trim()); setWebsiteRequestSent(true); } catch {}
                    }
                  }}
                />
                <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                  <button onClick={() => setShowWebsiteRequest(false)} style={{ padding: "10px 18px", borderRadius: 12, background: "rgba(255,255,255,0.07)", color: "rgba(255,255,255,0.7)", border: "none", fontWeight: 600, cursor: "pointer" }}>Cancel</button>
                  <button
                    disabled={!websiteRequestTitle.trim()}
                    onClick={async () => {
                      try { await api.requestWebsite(websiteRequestTitle.trim()); setWebsiteRequestSent(true); } catch {}
                    }}
                    style={{ padding: "10px 22px", borderRadius: 12, background: "#7c3aed", color: "white", border: "none", fontWeight: 700, cursor: "pointer", opacity: websiteRequestTitle.trim() ? 1 : 0.4 }}
                  >
                    Send request
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Join a class */}
      <div style={{
        borderRadius: 16, padding: "14px",
        background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)",
        animation: "dbSlide .5s ease .32s both",
      }}>
        <div style={{ fontSize: 12, fontWeight: 700, opacity: 0.5, textTransform: "uppercase", letterSpacing: "0.18em", marginBottom: 10 }}>Join a Class</div>
        <div style={{ display: "flex", gap: 8 }}>
          <input value={joinCode} onChange={(e) => setJoinCode(e.target.value)}
            placeholder="Enter class code…" className="input text-sm flex-1 uppercase tracking-widest"
            onKeyDown={(e) => e.key === "Enter" && handleJoinClass()} style={{ minHeight: 48, background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.15)", color: "white" }} />
          <button ref={joinBtnRef} onClick={handleJoinClass}
            style={{
              minHeight: 48, padding: "0 20px", borderRadius: 12, fontWeight: 700, fontSize: 14, cursor: "pointer",
              background: joinSuccess ? "#10b981" : "linear-gradient(135deg,#7c3aed,#6d28d9)",
              color: "white", border: "none", transition: "all .2s",
            }}>
            {joinSuccess ? "✓" : "Join"}
          </button>
        </div>
      </div>

      {/* Recent grades */}
      <div style={{
        borderRadius: 16, padding: "14px",
        background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)",
        animation: "dbSlide .5s ease .4s both",
      }}>
        <div style={{ fontSize: 12, fontWeight: 700, opacity: 0.5, textTransform: "uppercase", letterSpacing: "0.18em", marginBottom: 10 }}>Recent Grades</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {submissions.slice(0, 5).map((s: any, i: number) => (
            <div key={s.id} style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "10px 12px", borderRadius: 12,
              background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)",
              animation: `dbSlide .4s ease ${500 + i * 50}ms both`,
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ width: 32, height: 32, borderRadius: 10, background: "rgba(139,92,246,0.2)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <CheckCircle size={14} style={{ color: "#a78bfa" }} />
                </div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700 }}>{s.assignment_title || "Assignment"}</div>
                  <div style={{ fontSize: 11, opacity: 0.4 }}>{new Date(s.submitted_at).toLocaleDateString()}</div>
                </div>
              </div>
              <div>
                {s.grade !== null ? (
                  <span style={{ fontSize: 14, fontWeight: 800, color: s.grade >= 70 ? "#34d399" : "#f87171" }}>{s.grade}%</span>
                ) : (
                  <span style={{ fontSize: 11, padding: "3px 10px", borderRadius: 20, background: "rgba(255,255,255,0.07)", opacity: 0.5 }}>Pending</span>
                )}
              </div>
            </div>
          ))}
          {submissions.length === 0 && (
            <div style={{ textAlign: "center", padding: "24px", opacity: 0.3, fontSize: 13 }}>No submissions yet</div>
          )}
        </div>
      </div>

      </div>{/* end padding wrapper */}

      {/* Mascot corner badge */}
      <div className="fixed bottom-5 right-5 z-40 pointer-events-none select-none" aria-hidden="true">
        <Mascot state={mascotCelebrating ? "cheer" : "idle"} />
      </div>
    </div>
  );
}
