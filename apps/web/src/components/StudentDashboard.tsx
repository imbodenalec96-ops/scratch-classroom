import React, { useEffect, useState, useRef, useCallback } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../lib/auth.tsx";
import { useTheme } from "../lib/theme.tsx";
import { api } from "../lib/api.ts";
import { useSocket } from "../lib/ws.ts";
import { isWorkUnlocked, setWorkUnlocked } from "../lib/workUnlock.ts";
import { isOnBreak, chooseBreak } from "../lib/breakSystem.ts";
import { useClassConfig } from "../lib/useClassConfig.ts";
import { usePresencePing } from "../lib/presence.ts";
import { motion, prefersReducedMotion, getSubjectPalette } from "../lib/motionPresets.ts";
import { Users, CheckCircle, Star, Lock, Megaphone, Trophy, Clock, Gamepad2 } from "lucide-react";

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
    return (
      <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-6" style={{ background: "var(--bg)" }}>
        <div className="absolute inset-0 pointer-events-none opacity-[0.04]"
          style={{ backgroundImage: "linear-gradient(var(--text-1) 1px, transparent 1px), linear-gradient(90deg, var(--text-1) 1px, transparent 1px)", backgroundSize: "32px 32px" }} />
        <div className="relative z-10 text-center max-w-md px-6 space-y-3">
          <div className="animate-pop-in" style={{ fontSize: 80 }}>🌟</div>
          <div className="section-label animate-slide-up" style={{ animationDelay: "100ms" }}>— Submitted —</div>
          <h2 className="font-display text-6xl leading-[1.02] animate-spring-in" style={{ animationDelay: "140ms", color: "var(--text-1)" }}>
            Nice<br/>
            <em style={{ color: "var(--accent)", fontStyle: "italic" }}>work.</em>
          </h2>
          <p className="text-sm mt-4 animate-slide-up" style={{ animationDelay: "240ms", color: "var(--text-2)" }}>
            {submittedCount} of {total} answered · heading to your dashboard…
          </p>
        </div>
        <div className="fixed bottom-6 right-6 z-40 pointer-events-none">
          <Mascot state="cheer" />
        </div>
      </div>
    );
  }

  const todayName = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"][new Date().getDay()];
  const answeredCount = Object.keys(answers).length;
  const progress = total > 0 ? (answeredCount / total) * 100 : 0;

  // Background for light mode: soft subject-tinted gradient
  const lightBg = `linear-gradient(160deg, ${subjectPal.bg} 0%, #faf9ff 60%, #f0f1ff 100%)`;

  return (
    <div className="fixed inset-0 z-50 overflow-auto" style={{ background: dk ? "#07071a" : lightBg, touchAction: "pan-y" }}>
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

      <div className={`max-w-2xl mx-auto px-6 py-8 space-y-7 ${showBreakBanner ? "pt-20" : ""}`}>

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
            <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.12em]" style={{ color: "var(--text-3)" }}>
              <span style={{ fontSize: 16 }}>{subjectPal.emoji}</span>
              <span>{parsed?.subject || subjectPal.label}</span>
              <span style={{ color: "var(--border-md)" }}>·</span>
              <span>{todayName}</span>
            </div>
          </div>

          {/* Masthead */}
          <div className="section-label mb-2">— Today's assignment —</div>
          <h1 className="font-display text-3xl sm:text-4xl leading-[1.05]" style={{ color: "var(--text-1)" }}>
            {assignment.title}<em style={{ color: "var(--accent)", fontStyle: "italic" }}>.</em>
          </h1>
        </div>

        {/* ── Editorial progress strip: dots + counter + slim bar ── */}
        <div className="animate-slide-up" style={{ animationDelay: "60ms" }}>
          <div className="flex items-center justify-between mb-2">
            <div className="text-[11px] uppercase tracking-wider font-semibold" style={{ color: "var(--text-3)" }}>
              Question {currentQ + 1} <span style={{ color: "var(--border-md)" }}>of</span> {total}
            </div>
            <div className="text-[11px] uppercase tracking-wider font-semibold" style={{ color: "var(--accent)" }}>
              {answeredCount} answered · {Math.round(progress)}%
            </div>
          </div>
          <div style={{ height: 3, background: "var(--border)", overflow: "hidden", borderRadius: 2 }}>
            <div style={{
              width: `${progress}%`, height: "100%",
              background: "var(--accent)",
              transition: "width 0.6s cubic-bezier(0.16,1,0.3,1)",
            }}/>
          </div>
        </div>

        {/* ── Section label ── */}
        {q && (
          <div className="section-label animate-slide-up" style={{ animationDelay: "90ms" }}>
            — {q.sectionTitle} —
          </div>
        )}

        {/* ── Question card — editorial: big serif, generous whitespace ── */}
        {q && (
          <div key={`card-${cardKey}`}
            className={rm ? "" : "animate-spring-in"}
            style={{ animationDelay: "120ms" }}>
            <div className="p-7 sm:p-9 space-y-6" style={{
              background: "var(--bg-surface)",
              border: "1px solid var(--border)",
              borderLeft: "3px solid var(--accent)",
              borderRadius: "var(--r-xl)",
              boxShadow: dk ? "0 1px 0 rgba(0,0,0,0.4)" : "0 1px 3px rgba(24,23,30,0.04)",
            }}>
              {/* Question text — Fraunces serif, typewriter reveal */}
              <p className="font-display text-xl sm:text-2xl leading-[1.35]" style={{ color: "var(--text-1)" }}>
                <TypewriterText text={q.q.text} speed={28} />
              </p>

              {/* Hint */}
              {q.q.hint && (
                <div>
                  {showHint ? (
                    <div
                      className="rounded-2xl p-3 border-2 animate-spring-in"
                      style={{ background: dk ? "rgba(245,158,11,0.08)" : "#fffbeb", borderColor: dk ? "rgba(245,158,11,0.3)" : "#fde68a" }}>
                      <span className="text-xs font-bold" style={{ color: dk ? "#fbbf24" : "#92400e" }}>💡 Hint: </span>
                      <span className="text-sm" style={{ color: dk ? "rgba(251,191,36,0.8)" : "#78350f" }}>{q.q.hint}</span>
                    </div>
                  ) : (
                    <button onClick={() => setShowHint(true)}
                      className="text-xs font-semibold px-3 py-1.5 rounded-full cursor-pointer transition-all"
                      style={{ background: dk ? "rgba(245,158,11,0.08)" : "#fffbeb", color: dk ? "#fbbf24" : "#92400e", border: "1px solid " + (dk ? "rgba(245,158,11,0.2)" : "#fde68a") }}>
                      💡 Show Hint
                    </button>
                  )}
                </div>
              )}

              {/* ── Multiple choice ── */}
              {q.q.type === "multiple_choice" && q.q.options && (
                <div className="space-y-3">
                  {q.q.options.map((opt: string, oi: number) => {
                    const isSelected = currentAnswer === opt;
                    const letter = String.fromCharCode(65 + oi);
                    if (dk) {
                      return (
                        <button key={oi} onClick={() => handleSelect(opt)}
                          className={`w-full text-left px-4 py-4 rounded-2xl border-2 font-semibold text-sm transition-all duration-150 cursor-pointer
                            ${isSelected
                              ? "border-violet-500 bg-violet-500/15 text-violet-200 scale-[1.01]"
                              : "border-white/10 bg-white/[0.04] text-white/70 hover:border-violet-500/40 hover:bg-violet-500/5"
                            }`}
                          style={{ minHeight: 60, touchAction: "manipulation" }}>
                          <span className={`inline-flex items-center justify-center w-7 h-7 rounded-full border-2 mr-3 text-xs font-bold
                            ${isSelected ? "border-violet-500 bg-violet-500 text-white" : "border-white/20 text-white/40"}`}>
                            {isSelected ? "✓" : letter}
                          </span>
                          {opt.replace(/^[A-D]\.\s*/, "")}
                        </button>
                      );
                    }
                    return (
                      <button key={oi} onClick={() => handleSelect(opt)}
                        className={`clay-option animate-spring-in ${isSelected ? "selected" : ""}`}
                        style={{ animationDelay: `${oi * 55}ms` }}
                        aria-pressed={isSelected}>
                        {/* Letter badge */}
                        <span className="flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold transition-all"
                          style={{
                            background: isSelected ? subjectPal.accent : "#f1f5f9",
                            color: isSelected ? "white" : "#64748b",
                            border: isSelected ? `2px solid ${subjectPal.accent}` : "2px solid #e2e8f0",
                          }}>
                          {isSelected ? "✓" : letter}
                        </span>
                        <span className="font-semibold" style={{ color: isSelected ? "#4c1d95" : "#1e293b" }}>
                          {opt.replace(/^[A-D]\.\s*/, "")}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}

              {/* ── Short answer ── */}
              {q.q.type === "short_answer" && (
                <div>
                  {dk ? (
                    <textarea value={currentAnswer} onChange={(e) => handleSelect(e.target.value)}
                      placeholder="Write your answer here…" rows={q.q.lines || 4}
                      className="w-full rounded-2xl p-4 text-sm border-2 resize-none outline-none transition-colors bg-white/[0.05] border-white/10 text-white placeholder:text-white/30 focus:border-violet-500/50"
                      style={{ fontSize: 16, minHeight: 120 }} />
                  ) : (
                    <textarea
                      value={currentAnswer}
                      onChange={(e) => handleSelect(e.target.value)}
                      placeholder="Write your answer here…"
                      rows={q.q.lines || 4}
                      className="clay-input"
                      style={{ minHeight: 120 }}
                    />
                  )}
                </div>
              )}

              {/* ── Fill blank ── */}
              {q.q.type === "fill_blank" && (
                dk ? (
                  <input value={currentAnswer} onChange={(e) => handleSelect(e.target.value)}
                    placeholder="Fill in the blank…"
                    className="w-full rounded-2xl p-4 text-sm border-2 outline-none transition-colors bg-white/[0.05] border-white/10 text-white placeholder:text-white/30 focus:border-violet-500/50"
                    style={{ fontSize: 16 }} />
                ) : (
                  <input
                    value={currentAnswer}
                    onChange={(e) => handleSelect(e.target.value)}
                    placeholder="Fill in the blank…"
                    className="clay-input"
                  />
                )
              )}
            </div>
          </div>
        )}

        {/* ── Navigation buttons ── */}
        <div className="flex items-center gap-3 animate-slide-up" style={{ animationDelay: "180ms" }}>
          {dk ? (
            <>
              <button onClick={handlePrev} disabled={currentQ === 0}
                className="px-6 py-3 rounded-2xl font-bold text-sm border-2 transition-all cursor-pointer disabled:opacity-30"
                style={{ minHeight: 56, borderColor: "rgba(255,255,255,0.12)", color: "rgba(255,255,255,0.6)", touchAction: "manipulation" }}>
                ← Back
              </button>
              {currentQ < total - 1 ? (
                <button onClick={handleNext}
                  className="flex-1 py-3 rounded-2xl font-bold text-sm text-white transition-all cursor-pointer"
                  style={{ minHeight: 56, background: "linear-gradient(135deg, #8b5cf6, #6366f1)", touchAction: "manipulation" }}>
                  Next Question →
                </button>
              ) : (
                <button onClick={handleSubmit}
                  className="flex-1 py-3 rounded-2xl font-bold text-sm text-white cursor-pointer"
                  style={{ minHeight: 56, background: "linear-gradient(135deg, #10b981, #059669)", touchAction: "manipulation" }}>
                  Submit Work ✓
                </button>
              )}
            </>
          ) : (
            <>
              <button onClick={handlePrev} disabled={currentQ === 0}
                className="clay-btn"
                style={{ background: "#f1f5f9", color: "#475569", borderColor: "#e2e8f0", minWidth: 100 }}>
                ← Back
              </button>
              {currentQ < total - 1 ? (
                <button onClick={handleNext}
                  className="clay-btn flex-1"
                  style={{ background: `linear-gradient(135deg, #8b5cf6, #6366f1)`, color: "white", borderColor: "rgba(99,102,241,0.3)" }}>
                  Next →
                </button>
              ) : (
                <button onClick={handleSubmit}
                  className="clay-btn flex-1"
                  style={{ background: "linear-gradient(135deg, #10b981, #059669)", color: "white", borderColor: "rgba(16,185,129,0.3)", fontSize: 17 }}>
                  Submit Work ✓
                </button>
              )}
            </>
          )}
        </div>

        {/* ── Progress dots ── */}
        <ProgressDots total={total} current={currentQ} answers={answers} />

        <div style={{ height: 80 }} /> {/* spacer so mascot doesn't overlap last button */}
      </div>

      {/* ── Mascot — fixed bottom right ── */}
      {!dk && (
        <div className="fixed bottom-5 right-5 z-40 pointer-events-none select-none"
          aria-hidden="true">
          <Mascot state={mascotState} />
        </div>
      )}

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

  const [phase, setPhase] = useState<Phase>('welcome');
  // Reactive unlock state — students get dashboard access when on a 10-min
  // break OR after teacher-granted free time OR after submitting all work.
  // Re-polled every second + on `breakstate-change` + on `storage` so the
  // UI flips without a refresh when any of those flags change.
  const [accessUnlocked, setAccessUnlocked] = useState<boolean>(() => isWorkUnlocked() || isOnBreak());
  useEffect(() => {
    const refresh = () => setAccessUnlocked(isWorkUnlocked() || isOnBreak());
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
  const classConfig = useClassConfig();

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

  // Welcome → loading transition
  useEffect(() => {
    const t = setTimeout(() => setPhase('loading'), 1800);
    return () => clearTimeout(t);
  }, []);

  // Load data
  useEffect(() => {
    if (phase !== 'loading') return;
    const load = async () => {
      try {
        const [clsList, subList, lb] = await Promise.all([
          api.getClasses().catch(() => [] as any[]),
          api.getMySubmissions().catch(() => [] as any[]),
          api.getLeaderboard().catch(() => [] as any[]),
        ]);
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
      } catch {
        setPhase('done');
      }
    };
    load();
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
  // Editorial date line "Thursday, April 17" style
  const dateLine = new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });

  return (
    <div className="p-6 space-y-6 animate-page-enter relative" style={{ paddingBottom: unlocked ? 100 : undefined }}>
      {broadcast && (
        <div className="fixed top-0 left-0 right-0 z-40 px-6 py-3 text-center text-sm font-medium flex items-center justify-center gap-2" style={{ background: "var(--accent)", color: "white", borderBottom: "2px solid var(--accent-hover)" }}>
          <Megaphone size={15} />{broadcast}
        </div>
      )}

      {/* ── Editorial header: masthead + date + headline + leaderboard chip ── */}
      <header className="border-b pb-5 animate-slide-up" style={{ borderColor: "var(--border)" }}>
        <div className="flex items-center justify-between mb-2 text-[10px] uppercase tracking-[0.16em]" style={{ color: "var(--text-3)" }}>
          <span>{dateLine}</span>
          <span className="font-mono">BLOCKFORGE · STUDENT</span>
        </div>
        <div className="flex items-end justify-between gap-4 flex-wrap">
          <div>
            <div className="section-label mb-2">— Today's pages —</div>
            <h1 className="font-display text-4xl sm:text-5xl leading-[1.02]" style={{ color: "var(--text-1)" }}>
              {unlocked
                ? <>Free time, <em style={{ color: "var(--accent)", fontStyle: "italic" }}>well earned.</em></>
                : <>Good to see you, <em style={{ color: "var(--accent)", fontStyle: "italic" }}>{user?.name?.split(" ")[0]}.</em></>
              }
            </h1>
            <p className="text-sm mt-2 max-w-md" style={{ color: "var(--text-2)" }}>
              {unlocked ? "Everything's done. Pick a page, enjoy yourself." : "Your work is set up below. Start from the top — you've got this."}
            </p>
          </div>
          {myEntry && (
            <div className="flex items-baseline gap-3 px-4 py-3" style={{
              background: "var(--bg-surface)",
              border: "1px solid var(--border)",
              borderLeft: "3px solid var(--accent)",
              borderRadius: "var(--r-md)",
            }}>
              <Trophy size={16} style={{ color: "var(--accent)" }} />
              <div>
                <div className="font-display text-2xl leading-none" style={{ color: "var(--text-1)" }}>{myEntry.points}</div>
                <div className="text-[10px] uppercase tracking-wider mt-1" style={{ color: "var(--text-3)" }}>pts · Lvl {myEntry.level}</div>
              </div>
            </div>
          )}
        </div>
      </header>

      {/* ── Stats — editorial Fraunces numerals with semantic left border ── */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Classes",   value: c0, icon: Users,       accent: "var(--info)" },
          { label: "Submitted", value: c1, icon: CheckCircle, accent: "var(--success)" },
          { label: "Graded",    value: c2, icon: Star,        accent: "var(--accent)" },
        ].map((s, i) => (
          <div key={s.label} className="card flex items-baseline gap-3 animate-slide-up"
            style={{ padding: "14px 16px", borderLeft: `3px solid ${s.accent}`, animationDelay: `${80 + i * 60}ms` }}>
            <div style={{ color: s.accent }}><s.icon size={15}/></div>
            <div className="flex-1">
              <div className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-3)" }}>{s.label}</div>
              <div className="font-display text-3xl leading-none mt-1 tabular-nums" style={{ color: "var(--text-1)" }}>{s.value}</div>
            </div>
          </div>
        ))}
      </div>

      {/* ── Today's Quizzes (Bug #32): quizzes created by teacher surface here ── */}
      {pendingQuizzes.length > 0 && !activeQuiz && (
        <div className="animate-slide-up" style={{ animationDelay: "160ms" }}>
          <div className="section-label mb-3" style={{ color: "var(--accent)" }}>
            — Today's quizzes —
          </div>
          <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))" }}>
            {pendingQuizzes.map((q) => (
              <button key={q.id}
                onClick={() => { setActiveQuiz(q); setQuizAnswers(new Array((q.questions || []).length).fill(-1)); setQuizResult(null); }}
                className="text-left p-5 card-hover transition-all"
                style={{
                  background: "var(--bg-surface)",
                  border: "1px solid var(--border)",
                  borderLeft: "3px solid var(--accent)",
                  borderRadius: "var(--r-xl)",
                  cursor: "pointer",
                }}>
                <div className="text-[10px] uppercase tracking-wider mb-1" style={{ color: "var(--text-3)" }}>
                  {q._className || "Quiz"} · {(q.questions || []).length} questions
                </div>
                <div className="font-display text-xl leading-tight" style={{ color: "var(--text-1)" }}>
                  {q.title || "Untitled quiz"}
                </div>
                {q.estimated_minutes ? (
                  <div className="text-xs mt-2" style={{ color: "var(--text-2)" }}>~{q.estimated_minutes} min</div>
                ) : null}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Inline quiz taker */}
      {activeQuiz && (
        <div className="animate-slide-up card p-6" style={{ borderLeft: "3px solid var(--accent)" }}>
          <div className="flex items-start justify-between gap-4 mb-4">
            <div>
              <div className="section-label mb-1">— Quiz —</div>
              <h2 className="font-display text-2xl" style={{ color: "var(--text-1)" }}>{activeQuiz.title}</h2>
            </div>
            <button onClick={() => { setActiveQuiz(null); setQuizResult(null); }} className="text-sm" style={{ color: "var(--text-3)" }}>Close</button>
          </div>

          {quizResult ? (
            <div className="text-center py-8">
              <div className="font-display text-5xl mb-2" style={{ color: "var(--accent)" }}>{quizResult.score}%</div>
              <div style={{ color: "var(--text-2)" }}>Quiz submitted. Nice work.</div>
              <button
                onClick={() => {
                  setPendingQuizzes((prev) => prev.filter((x) => x.id !== activeQuiz.id));
                  setActiveQuiz(null); setQuizResult(null);
                }}
                className="btn-primary mt-4">Done</button>
            </div>
          ) : (
            <>
              <div className="space-y-4">
                {(activeQuiz.questions || []).map((q: any, qi: number) => (
                  <div key={qi} className="p-4" style={{ background: "var(--bg-muted)", borderRadius: "var(--r-md)" }}>
                    <div className="font-medium mb-3" style={{ color: "var(--text-1)" }}>{qi + 1}. {q.text}</div>
                    <div className="space-y-2">
                      {(q.options || []).map((opt: string, oi: number) => (
                        <label key={oi} className="flex items-center gap-2 cursor-pointer p-2 rounded"
                          style={{ background: quizAnswers[qi] === oi ? "var(--accent-light)" : "transparent" }}>
                          <input type="radio" name={`q-${qi}`} checked={quizAnswers[qi] === oi}
                            onChange={() => setQuizAnswers((a) => { const n = [...a]; n[qi] = oi; return n; })} />
                          <span style={{ color: "var(--text-1)" }}>{opt}</span>
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
                className="btn-primary mt-6">
                {quizSubmitting ? "Submitting…" : "Submit quiz"}
              </button>
            </>
          )}
        </div>
      )}

      {/* ── Free Time Unlocked — editorial tile set ── */}
      {unlocked && (
        <div className="animate-spring-in" style={{ animationDelay: "200ms" }}>
          <div className="section-label mb-3" style={{ color: "var(--success)" }}>
            — Free time earned —
          </div>
          <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))" }}>
            <Link to="/arcade"
              className="group flex flex-col gap-2 p-6 text-left transition-all animate-spring-in card-hover"
              style={{
                animationDelay: "240ms",
                background: "var(--bg-surface)",
                border: "1px solid var(--border)",
                borderLeft: "3px solid var(--accent)",
                borderRadius: "var(--r-xl)",
                textDecoration: "none",
              }}>
              <div className="w-12 h-12 flex items-center justify-center text-2xl"
                style={{ background: "var(--accent-light)", borderRadius: "var(--r-md)" }}>
                🎮
              </div>
              <div>
                <div className="section-label mb-1">— Arcade —</div>
                <div className="font-display text-2xl leading-tight" style={{ color: "var(--text-1)" }}>
                  Play some<em style={{ color: "var(--accent)", fontStyle: "italic" }}> games.</em>
                </div>
                <div className="text-xs mt-1" style={{ color: "var(--text-3)" }}>29 games · keep it fun</div>
              </div>
            </Link>
            <Link to="/projects"
              className="group flex flex-col gap-2 p-6 text-left transition-all animate-spring-in card-hover"
              style={{
                animationDelay: "310ms",
                background: "var(--bg-surface)",
                border: "1px solid var(--border)",
                borderLeft: "3px solid var(--accent-sage)",
                borderRadius: "var(--r-xl)",
                textDecoration: "none",
              }}>
              <div className="w-12 h-12 flex items-center justify-center text-2xl"
                style={{ background: "color-mix(in srgb, var(--accent-sage) 14%, transparent)", borderRadius: "var(--r-md)" }}>
                💻
              </div>
              <div>
                <div className="section-label mb-1" style={{ color: "var(--accent-sage)" }}>— Projects —</div>
                <div className="font-display text-2xl leading-tight" style={{ color: "var(--text-1)" }}>
                  Build<em style={{ color: "var(--accent-sage)", fontStyle: "italic" }}> something.</em>
                </div>
                <div className="text-xs mt-1" style={{ color: "var(--text-3)" }}>BlockForge · 2D & 3D stages</div>
              </div>
            </Link>
          </div>
        </div>
      )}

      {/* Class video */}
      {classVideo && (
        <div className="card overflow-hidden animate-slide-up" style={{ animationDelay: "280ms" }}>
          <div className="flex items-center gap-2 mb-3">
            <div className="w-2 h-2 rounded-full bg-red-400 animate-pulse" />
            <h2 className="text-sm font-semibold" style={{ color: dk ? "rgba(255,255,255,0.7)" : "#374151" }}>📺 Your Teacher Shared a Video</h2>
            {classVideo.video_title && <span className="text-xs ml-auto" style={{ color: dk ? "rgba(255,255,255,0.3)" : "#9ca3af" }}>{classVideo.video_title}</span>}
          </div>
          <div style={{ position: "relative", paddingTop: "56.25%", borderRadius: 12, overflow: "hidden" }}>
            <iframe
              src={`https://www.youtube-nocookie.com/embed/${classVideo.video_id}?rel=0&modestbranding=1`}
              title={classVideo.video_title || "Class Video"}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowFullScreen
              style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", border: "none" }}
            />
          </div>
        </div>
      )}

      {/* YouTube Library — gated by unlock/break state + teacher config
          Hidden unless: student is unlocked OR on a break, AND teacher hasn't disabled YouTube */}
      {(unlocked || isOnBreak()) && classConfig.youtubeEnabled && (
      <div className="card animate-slide-up" style={{ animationDelay: "300ms" }}>
        <h2 className="text-sm font-semibold mb-3 flex items-center gap-2" style={{ color: dk ? "rgba(255,255,255,0.7)" : "#374151" }}>
          📺 Video Library
          <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: dk ? "rgba(239,68,68,0.1)" : "#fee2e2", color: dk ? "#f87171" : "#dc2626" }}>
            {youtubeLibrary.length} {youtubeLibrary.length === 1 ? "video" : "videos"}
          </span>
        </h2>

        {/* Playing inline */}
        {playingLibVideo && (
          <div className="mb-4 animate-spring-in">
            <div style={{ position:"relative", paddingTop:"56.25%", borderRadius:12, overflow:"hidden" }}>
              <iframe
                src={`https://www.youtube-nocookie.com/embed/${playingLibVideo.videoId}?autoplay=1&rel=0&modestbranding=1`}
                title={playingLibVideo.title}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                style={{ position:"absolute", top:0, left:0, width:"100%", height:"100%", border:"none" }}
              />
            </div>
            <button onClick={() => setPlayingLibVideo(null)} className="mt-2 text-xs font-medium px-3 py-1.5 rounded-full cursor-pointer transition-colors" style={{ background: dk?"rgba(255,255,255,0.05)":"#f1f5f9", color: dk?"rgba(255,255,255,0.5)":"#64748b" }}>
              ✕ Close video
            </button>
          </div>
        )}

        {/* Grid of videos OR empty state */}
        {youtubeLibrary.length > 0 ? (
          <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(140px, 1fr))", gap:10 }}>
            {youtubeLibrary.map((v: any) => (
              <button
                key={v.id}
                onClick={async () => {
                  setPlayingLibVideo({ videoId: v.video_id, title: v.title });
                  if (user?.id) {
                    api.pickLibraryVideo(v.id, user.id).catch(() => {});
                  }
                }}
                style={{
                  textAlign:"left", padding:0, background:"none", border:"none", cursor:"pointer",
                  borderRadius:12, overflow:"hidden",
                  boxShadow: dk ? "0 2px 8px rgba(0,0,0,0.3)" : "0 2px 8px rgba(0,0,0,0.08)",
                  transition:"transform 0.15s, box-shadow 0.15s",
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.transform = "translateY(-2px)"; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = ""; }}
              >
                <div style={{ position:"relative", overflow:"hidden" }}>
                  <img src={v.thumbnail_url || `https://img.youtube.com/vi/${v.video_id}/mqdefault.jpg`} alt={v.title} style={{ width:"100%", aspectRatio:"16/9", objectFit:"cover", display:"block" }} />
                </div>
                <div style={{ padding:"8px 10px", background: dk?"rgba(255,255,255,0.04)":"white" }}>
                  <div style={{ fontSize:11, fontWeight:700, color: dk?"rgba(255,255,255,0.85)":"#1e293b", lineHeight:1.3, overflow:"hidden", display:"-webkit-box", WebkitLineClamp:2, WebkitBoxOrient:"vertical" as any }}>{v.title}</div>
                  {v.category && <div style={{ fontSize:9, fontWeight:600, marginTop:3, color: dk?"rgba(239,68,68,0.7)":"#dc2626", textTransform:"uppercase", letterSpacing:"0.05em" }}>{v.category}</div>}
                </div>
              </button>
            ))}
          </div>
        ) : (
          <div className="text-center py-6" style={{ color: dk ? "rgba(255,255,255,0.3)" : "#94a3b8" }}>
            <div className="text-3xl mb-2">📼</div>
            <p className="text-xs">No videos in the library yet.<br/>Ask your teacher to add some, or request one below!</p>
          </div>
        )}

        {/* Request a video — only when fully unlocked (not during a break) */}
        {unlocked && !isOnBreak() && (
          <div className={`mt-4 pt-4 border-t ${dk ? "border-white/[0.05]" : "border-gray-100"}`}>
            <YouTubeRequestForm dk={dk} userId={user?.id} onSent={() => { /* toast or refresh */ }} />
          </div>
        )}
      </div>
      )}

      {/* Join a class */}
      <div className="card animate-slide-up" style={{ animationDelay: "320ms" }}>
        <h2 className="text-sm font-semibold mb-3" style={{ color: dk ? "rgba(255,255,255,0.7)" : "#374151" }}>Join a Class</h2>
        <div className="flex gap-2">
          <input value={joinCode} onChange={(e) => setJoinCode(e.target.value)}
            placeholder="Enter class code…" className="input text-sm flex-1 uppercase tracking-widest"
            onKeyDown={(e) => e.key === "Enter" && handleJoinClass()} style={{ minHeight: 48 }} />
          <button ref={joinBtnRef} onClick={handleJoinClass}
            className={`btn-primary px-4 transition-all duration-200 ${joinSuccess ? "bg-emerald-500 hover:bg-emerald-500" : ""}`}
            style={{ minHeight: 48 }}>
            {joinSuccess ? "✓" : "Join"}
          </button>
        </div>
      </div>

      {/* Recent grades */}
      <div className="card animate-slide-up" style={{ animationDelay: "400ms" }}>
        <h2 className="text-base font-semibold mb-4" style={{ color: dk ? "white" : "#1e293b" }}>Recent Grades</h2>
        <div className="space-y-2">
          {submissions.slice(0, 5).map((s: any, i: number) => (
            <div key={s.id} className="list-row animate-slide-in-right" style={{ animationDelay: `${500 + i * 50}ms` }}>
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: dk ? "rgba(139,92,246,0.1)" : "#f5f3ff" }}>
                  <CheckCircle size={14} className="text-violet-400" />
                </div>
                <div>
                  <div className="text-sm font-medium" style={{ color: dk ? "white" : "#1e293b" }}>{s.assignment_title || "Assignment"}</div>
                  <div className="text-xs flex items-center gap-1" style={{ color: dk ? "rgba(255,255,255,0.3)" : "#94a3b8" }}>
                    <Clock size={10} />{new Date(s.submitted_at).toLocaleDateString()}
                  </div>
                </div>
              </div>
              <div>
                {s.grade !== null ? (
                  <span className="text-sm font-bold" style={{ color: s.grade >= 70 ? "#10b981" : "#ef4444" }}>{s.grade}%</span>
                ) : (
                  <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ color: dk ? "rgba(255,255,255,0.3)" : "#94a3b8", background: dk ? "rgba(255,255,255,0.05)" : "#f1f5f9" }}>Pending</span>
                )}
              </div>
            </div>
          ))}
          {submissions.length === 0 && (
            <p className="text-center text-sm py-8" style={{ color: dk ? "rgba(255,255,255,0.25)" : "#9ca3af" }}>No submissions yet</p>
          )}
        </div>
      </div>

      {/* Celebrating mascot on done dashboard */}
      {!dk && (
        <div className="fixed bottom-5 right-5 z-40 pointer-events-none select-none" aria-hidden="true">
          <Mascot state={mascotCelebrating ? "cheer" : "idle"} />
        </div>
      )}
    </div>
  );
}
