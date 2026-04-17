import React, { useEffect, useState, useRef, useCallback } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../lib/auth.tsx";
import { useTheme } from "../lib/theme.tsx";
import { api } from "../lib/api.ts";
import { useSocket } from "../lib/ws.ts";
import { isWorkUnlocked, setWorkUnlocked } from "../lib/workUnlock.ts";
import { Users, CheckCircle, Star, Lock, Megaphone, Trophy, Clock, Gamepad2, FolderOpen } from "lucide-react";

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
  for (let i = 0; i < 16; i++) {
    const el = document.createElement("span");
    el.textContent = glyphs[i % glyphs.length];
    el.style.cssText = `position:fixed;left:${Math.random() * 100}vw;top:-2rem;font-size:1.5rem;pointer-events:none;z-index:9999;animation:confettiFall 2s ease-in forwards;animation-delay:${Math.random() * 0.8}s`;
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

/* ── Welcome Screen ── */
function WelcomeScreen({ name, dk }: { name: string; dk: boolean }) {
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center"
      style={{ background: "linear-gradient(135deg, #0f0726 0%, #1a0a35 50%, #0a0b20 100%)" }}>
      {Array.from({ length: 20 }).map((_, i) => (
        <span key={i} className="absolute text-lg animate-pulse"
          style={{ left: `${Math.random() * 100}%`, top: `${Math.random() * 100}%`, opacity: 0.3 + Math.random() * 0.5, animationDelay: `${Math.random() * 2}s`, animationDuration: `${1.5 + Math.random()}s` }}>
          ✨
        </span>
      ))}
      <div className="relative z-10 text-center space-y-4 animate-page-enter">
        <div className="text-7xl animate-bounce">📚</div>
        <h1 className="text-4xl font-extrabold text-white tracking-tight">
          {greeting}, <span className="bg-clip-text text-transparent bg-gradient-to-r from-violet-400 to-cyan-400">{name.split(" ")[0]}!</span>
        </h1>
        <p className="text-white/50 text-lg">Getting your work ready…</p>
        <div className="flex justify-center gap-2 mt-4">
          {[0, 1, 2].map((i) => (
            <span key={i} className="w-2 h-2 rounded-full bg-violet-400 animate-bounce"
              style={{ animationDelay: `${i * 150}ms` }} />
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
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-8"
      style={{ background: "linear-gradient(135deg, #0f2027, #203a43, #2c5364)" }}>
      <div className="text-center space-y-2">
        <div className="text-5xl">☕</div>
        <h2 className="text-3xl font-extrabold text-white">Break Time!</h2>
        <p className="text-white/50 text-sm">Relax, stretch, grab some water</p>
      </div>
      <div className="relative w-48 h-48">
        <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
          <circle cx="50" cy="50" r="44" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="8" />
          <circle cx="50" cy="50" r="44" fill="none" stroke="#22d3ee" strokeWidth="8"
            strokeDasharray={`${2 * Math.PI * 44}`}
            strokeDashoffset={`${2 * Math.PI * 44 * (1 - pct / 100)}`}
            strokeLinecap="round"
            style={{ transition: "stroke-dashoffset 1s linear" }} />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-4xl font-mono font-bold text-white">{mm}:{ss}</span>
          <span className="text-white/50 text-xs mt-1">remaining</span>
        </div>
      </div>
      <div className="relative flex items-center justify-center">
        <div className="w-24 h-24 rounded-full bg-cyan-500/20 animate-ping absolute" style={{ animationDuration: "4s" }} />
        <div className="w-16 h-16 rounded-full bg-cyan-400/30 flex items-center justify-center text-2xl">🌊</div>
      </div>
      <button onClick={onDone} className="text-white/40 text-sm hover:text-white/70 transition-colors cursor-pointer">
        Skip break →
      </button>
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
  const q = allQuestions[currentQ];
  const currentAnswer = answers[currentQ] ?? "";

  const handleSelect = (value: string) => {
    const isNew = answers[currentQ] === undefined;
    setAnswers((prev) => ({ ...prev, [currentQ]: value }));
    if (isNew) {
      const next = questionsAnswered + 1;
      setQuestionsAnswered(next);
      if (next >= 3) setShowBreakBanner(true);
    }
  };

  const handleNext = () => { if (currentQ < total - 1) setCurrentQ(currentQ + 1); };
  const handlePrev = () => { if (currentQ > 0) setCurrentQ(currentQ - 1); };

  const handleSubmit = () => {
    spawnConfetti();
    setSubmitted(true);
    setTimeout(() => onComplete(answers), 2000);
  };

  if (submitted) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-6"
        style={{ background: "linear-gradient(135deg, #0f0726, #1a0a35)" }}>
        <div className="text-8xl animate-bounce">🌟</div>
        <h2 className="text-3xl font-extrabold text-white">Amazing work!</h2>
        <p className="text-white/50">Loading your dashboard…</p>
      </div>
    );
  }

  const todayName = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"][new Date().getDay()];
  const progress = total > 0 ? ((currentQ + 1) / total) * 100 : 0;

  return (
    <div className="fixed inset-0 z-50 overflow-auto" style={{ background: dk ? "#07071a" : "#EFF6FF" }}>
      {showBreakBanner && (
        <div className="fixed top-0 left-0 right-0 z-[60] flex items-center justify-between px-6 py-3 text-sm font-medium"
          style={{ background: "linear-gradient(90deg, #0e7490, #0891b2)", color: "white" }}>
          <span>☕ You can take a 10-minute break now!</span>
          <div className="flex gap-3">
            <button onClick={onBreak} className="px-3 py-1 rounded-lg bg-white/20 hover:bg-white/30 transition-colors cursor-pointer font-semibold">
              Take Break
            </button>
            <button onClick={() => setShowBreakBanner(false)} className="text-white/60 hover:text-white cursor-pointer">✕</button>
          </div>
        </div>
      )}

      <div className={`max-w-xl mx-auto p-6 space-y-5 ${showBreakBanner ? "pt-20" : "pt-8"}`}>
        <div>
          <div className={`text-xs font-bold uppercase tracking-widest mb-1 ${dk ? "text-violet-400" : "text-violet-600"}`}>
            📅 {todayName}'s Work
          </div>
          <h1 className={`text-xl font-extrabold ${dk ? "text-white" : "text-gray-900"}`}>{assignment.title}</h1>
          {parsed?.subject && (
            <div className={`text-sm mt-0.5 ${dk ? "text-white/40" : "text-gray-500"}`}>{parsed.subject} · {parsed.grade}</div>
          )}
        </div>

        <div>
          <div className={`flex justify-between text-xs font-semibold mb-1.5 ${dk ? "text-white/40" : "text-gray-500"}`}>
            <span>Question {currentQ + 1} of {total}</span>
            <span>{Object.keys(answers).length} answered</span>
          </div>
          <div className={`h-3 rounded-full overflow-hidden ${dk ? "bg-white/10" : "bg-gray-200"}`}>
            <div className="h-full bg-gradient-to-r from-violet-500 to-indigo-500 rounded-full transition-all duration-500"
              style={{ width: `${progress}%` }} />
          </div>
        </div>

        {q && <div className={`text-[11px] font-bold uppercase tracking-widest ${dk ? "text-white/25" : "text-gray-400"}`}>{q.sectionTitle}</div>}

        {q && (
          <div className={`rounded-2xl p-6 space-y-5 border ${dk ? "bg-white/[0.04] border-white/[0.06]" : "bg-white border-gray-100 shadow-lg"}`}>
            <p className={`text-lg font-semibold leading-relaxed ${dk ? "text-white" : "text-gray-900"}`}>{q.q.text}</p>

            {q.q.type === "multiple_choice" && q.q.options && (
              <div className="space-y-3">
                {q.q.options.map((opt: string, oi: number) => {
                  const isSelected = currentAnswer === opt;
                  return (
                    <button key={oi} onClick={() => handleSelect(opt)}
                      className={`w-full text-left px-4 py-4 rounded-xl border-2 font-medium text-sm transition-all duration-150 cursor-pointer
                        ${isSelected
                          ? "border-violet-500 bg-violet-500/15 text-violet-300 scale-[1.02]"
                          : dk ? "border-white/10 bg-white/[0.03] text-white/70 hover:border-violet-500/40 hover:bg-violet-500/5"
                                 : "border-gray-200 bg-gray-50 text-gray-700 hover:border-violet-400 hover:bg-violet-50"
                        }`}>
                      <span className={`inline-flex items-center justify-center w-7 h-7 rounded-full border-2 mr-3 text-xs font-bold
                        ${isSelected ? "border-violet-500 bg-violet-500 text-white" : dk ? "border-white/20 text-white/40" : "border-gray-300 text-gray-400"}`}>
                        {isSelected ? "✓" : String.fromCharCode(65 + oi)}
                      </span>
                      {opt.replace(/^[A-D]\.\s*/, "")}
                    </button>
                  );
                })}
              </div>
            )}

            {q.q.type === "short_answer" && (
              <textarea value={currentAnswer} onChange={(e) => handleSelect(e.target.value)}
                placeholder="Write your answer here…" rows={q.q.lines || 4}
                className={`w-full rounded-xl p-3 text-sm border resize-none outline-none transition-colors
                  ${dk ? "bg-white/[0.04] border-white/10 text-white placeholder:text-white/30 focus:border-violet-500/50"
                         : "bg-white border-gray-200 text-gray-900 placeholder:text-gray-400 focus:border-violet-400"}`} />
            )}

            {q.q.type === "fill_blank" && (
              <input value={currentAnswer} onChange={(e) => handleSelect(e.target.value)}
                placeholder="Fill in the blank…"
                className={`w-full rounded-xl p-3 text-sm border outline-none transition-colors
                  ${dk ? "bg-white/[0.04] border-white/10 text-white placeholder:text-white/30 focus:border-violet-500/50"
                         : "bg-white border-gray-200 text-gray-900 placeholder:text-gray-400 focus:border-violet-400"}`} />
            )}
          </div>
        )}

        <div className="flex items-center justify-between gap-3">
          <button onClick={handlePrev} disabled={currentQ === 0}
            className={`px-5 py-3 rounded-xl font-semibold text-sm border transition-all cursor-pointer disabled:opacity-30
              ${dk ? "border-white/10 text-white/60 hover:bg-white/[0.05]" : "border-gray-200 text-gray-600 hover:bg-gray-50"}`}>
            ← Back
          </button>
          {currentQ < total - 1 ? (
            <button onClick={handleNext}
              className="flex-1 py-3 rounded-xl font-bold text-sm text-white transition-all cursor-pointer"
              style={{ background: "linear-gradient(135deg, #8b5cf6, #6366f1)" }}>
              Next →
            </button>
          ) : (
            <button onClick={handleSubmit}
              className="flex-1 py-3 rounded-xl font-bold text-sm text-white cursor-pointer"
              style={{ background: "linear-gradient(135deg, #10b981, #059669)" }}>
              Submit Work ✓
            </button>
          )}
        </div>

        <div className="flex items-center justify-center gap-1.5 flex-wrap">
          {allQuestions.map((_, i) => (
            <button key={i} onClick={() => setCurrentQ(i)}
              className={`rounded-full transition-all cursor-pointer ${i === currentQ ? "w-5 h-2.5 bg-violet-500" : answers[i] !== undefined ? "w-2.5 h-2.5 bg-emerald-500" : dk ? "w-2.5 h-2.5 bg-white/20" : "w-2.5 h-2.5 bg-gray-300"}`} />
          ))}
        </div>
      </div>
    </div>
  );
}

/* ── Simple Assignment Card (for non-AI / unstructured assignments) ── */
function SimpleAssignmentCard({ assignment, dk, onComplete }: { assignment: any; dk: boolean; onComplete: () => void }) {
  const [confirming, setConfirming] = useState(false);
  const todayName = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"][new Date().getDay()];

  return (
    <div className="fixed inset-0 z-50 overflow-auto flex flex-col items-center justify-center p-6"
      style={{ background: dk ? "#07071a" : "#EFF6FF" }}>
      <div className={`w-full max-w-lg rounded-3xl p-8 space-y-6 shadow-2xl border
        ${dk ? "bg-white/[0.04] border-white/[0.07]" : "bg-white border-gray-100"}`}>
        <div>
          <div className={`text-xs font-bold uppercase tracking-widest mb-2 ${dk ? "text-violet-400" : "text-violet-600"}`}>
            📅 {todayName}'s Assignment
          </div>
          <h1 className={`text-2xl font-extrabold ${dk ? "text-white" : "text-gray-900"}`}>{assignment.title}</h1>
          {assignment.description && (
            <p className={`mt-2 text-sm leading-relaxed ${dk ? "text-white/50" : "text-gray-600"}`}>{assignment.description}</p>
          )}
          {assignment.due_date && (
            <p className={`mt-1 text-xs ${dk ? "text-white/30" : "text-gray-400"}`}>
              Due: {new Date(assignment.due_date).toLocaleDateString()}
            </p>
          )}
        </div>

        <div className={`rounded-2xl p-5 border text-sm ${dk ? "bg-amber-500/[0.06] border-amber-500/20 text-amber-300" : "bg-amber-50 border-amber-200 text-amber-800"}`}>
          <div className="font-bold mb-1">📋 Instructions from your teacher</div>
          <p className={dk ? "text-amber-200/70" : "text-amber-700"}>
            {assignment.description || "Complete this assignment as directed by your teacher. When you're done, click the button below."}
          </p>
        </div>

        {!confirming ? (
          <button onClick={() => setConfirming(true)}
            className="w-full py-4 rounded-2xl font-bold text-white text-lg cursor-pointer transition-all hover:opacity-90 active:scale-[0.98]"
            style={{ background: "linear-gradient(135deg, #10b981, #059669)" }}>
            I'm Done ✓
          </button>
        ) : (
          <div className="space-y-3">
            <p className={`text-center text-sm font-medium ${dk ? "text-white/60" : "text-gray-600"}`}>
              Are you sure you've finished this assignment?
            </p>
            <div className="flex gap-3">
              <button onClick={() => setConfirming(false)}
                className={`flex-1 py-3 rounded-xl font-semibold text-sm border transition-all cursor-pointer
                  ${dk ? "border-white/10 text-white/50 hover:bg-white/[0.05]" : "border-gray-200 text-gray-600 hover:bg-gray-50"}`}>
                Not yet
              </button>
              <button onClick={onComplete}
                className="flex-1 py-3 rounded-xl font-bold text-sm text-white cursor-pointer"
                style={{ background: "linear-gradient(135deg, #10b981, #059669)" }}>
                Yes, submit! 🌟
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Dashboard (shown after work is done) ── */
export default function StudentDashboard() {
  const { user } = useAuth();
  const { theme } = useTheme();
  const dk = theme === "dark";

  const [phase, setPhase] = useState<Phase>('welcome');
  const [classes, setClasses] = useState<any[]>([]);
  const [submissions, setSubmissions] = useState<any[]>([]);
  const [leaderboard, setLeaderboard] = useState<any[]>([]);
  const [lockedScreen, setLockedScreen] = useState(false);
  const [broadcast, setBroadcast] = useState<string | null>(null);
  const [joinCode, setJoinCode] = useState("");
  const [joinSuccess, setJoinSuccess] = useState(false);
  const [classVideo, setClassVideo] = useState<any>(null);
  const joinBtnRef = useRef<HTMLButtonElement>(null);

  // Work state
  const [pendingAssignment, setPendingAssignment] = useState<any>(null);
  const [parsedAssignment, setParsedAssignment] = useState<any>(null);
  const [questionsAnswered, setQuestionsAnswered] = useState(0);
  const [preBreakPhase, setPreBreakPhase] = useState<Phase>('working');

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

  // Load data when entering 'loading' phase
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

        // Check for pending assignments — accept ALL pending, not just AI-structured ones
        let found: any = null;
        let foundParsed: any = null;
        for (const cls of clsList) {
          try {
            const pending = await api.getPendingAssignments(cls.id);
            if (pending && pending.length > 0) {
              const a = pending[0];
              found = a; // accept any pending assignment
              if (a.content) {
                try {
                  const parsed = JSON.parse(a.content);
                  if (parsed?.sections?.length > 0) foundParsed = parsed;
                } catch {}
              }
              break;
            }
          } catch {}
        }

        if (found) {
          setPendingAssignment(found);
          setParsedAssignment(foundParsed); // may be null for non-AI assignments
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

  // Presence ping
  useEffect(() => {
    if (classes.length === 0) return;
    const ping = () => classes.forEach((cls) => api.pingPresence(cls.id, "on dashboard").catch(() => {}));
    ping();
    const iv = setInterval(ping, 30000);
    return () => clearInterval(iv);
  }, [classes]);

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
    // Unlock arcade + projects for the rest of the day
    setWorkUnlocked();
    spawnConfetti();
    try {
      const subs = await api.getMySubmissions();
      setSubmissions(subs);
      setStatSubmitted(subs.length);
      setStatGraded(subs.filter((s: any) => s.grade !== null).length);
    } catch {}
    setPhase('done');
  }, [pendingAssignment]);

  const handleTakeBreak = useCallback(() => {
    setPreBreakPhase(phase);
    setPhase('break');
  }, [phase]);

  const handleBreakDone = useCallback(() => setPhase('working'), []);

  const myEntry = leaderboard.find((e: any) => e.user_id === user?.id);

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

  if (phase === 'welcome') return <WelcomeScreen name={user?.name || "Student"} dk={dk} />;

  if (phase === 'loading') return (
    <div className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: "linear-gradient(135deg, #0f0726, #0a0b20)" }}>
      <div className="text-center space-y-4">
        <div className="w-12 h-12 border-2 border-violet-500 border-t-transparent rounded-full animate-spin mx-auto" />
        <p className="text-white/50 text-sm">Checking your assignments…</p>
      </div>
    </div>
  );

  if (phase === 'working' && pendingAssignment && parsedAssignment) {
    return (
      <WorkScreen
        assignment={pendingAssignment} parsed={parsedAssignment} dk={dk}
        onComplete={handleWorkComplete} onBreak={handleTakeBreak}
        questionsAnswered={questionsAnswered} setQuestionsAnswered={setQuestionsAnswered}
      />
    );
  }

  // Assignment exists but has no structured content — show a simple completion card
  if (phase === 'working' && pendingAssignment && !parsedAssignment) {
    return <SimpleAssignmentCard assignment={pendingAssignment} dk={dk} onComplete={() => handleWorkComplete({})} />;
  }

  if (phase === 'break') return <BreakScreen dk={dk} onDone={handleBreakDone} />;

  // ── DONE / DASHBOARD ──
  return (
    <div className="p-7 space-y-6 animate-page-enter relative">
      {broadcast && (
        <div className="fixed top-0 left-0 right-0 z-40 bg-violet-600 text-white px-6 py-3 text-center text-sm font-medium flex items-center justify-center gap-2">
          <Megaphone size={15} />{broadcast}
        </div>
      )}

      <div className="flex items-center justify-between">
        <div>
          <h1 className={`text-2xl font-bold tracking-tight ${dk ? "text-white" : "text-gray-900"}`}>
            Welcome back, {user?.name?.split(" ")[0]} 🌟
          </h1>
          <p className={`text-sm mt-0.5 ${dk ? "text-white/40" : "text-gray-500"}`}>All done for today!</p>
        </div>
        {myEntry && (
          <div className={`flex items-center gap-3 rounded-2xl px-4 py-2.5 border ${dk ? "bg-amber-500/[0.08] border-amber-500/20" : "bg-amber-50 border-amber-200"}`}>
            <Trophy size={16} className="text-amber-400" />
            <div>
              <span className={`text-sm font-bold ${dk ? "text-white" : "text-gray-900"}`}>{myEntry.points} pts</span>
              <span className={`text-xs ml-2 ${dk ? "text-white/35" : "text-gray-400"}`}>Lvl {myEntry.level}</span>
            </div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-3 gap-4">
        {[
          { label: "Classes", value: c0, icon: Users, color: "text-cyan-400", bg: dk ? "bg-cyan-500/10" : "bg-cyan-50" },
          { label: "Submitted", value: c1, icon: CheckCircle, color: "text-emerald-400", bg: dk ? "bg-emerald-500/10" : "bg-emerald-50" },
          { label: "Graded", value: c2, icon: Star, color: "text-amber-400", bg: dk ? "bg-amber-500/10" : "bg-amber-50" },
        ].map((s, i) => (
          <div key={s.label} className="card flex items-center gap-3.5 animate-slide-up" style={{ animationDelay: `${80 + i * 65}ms` }}>
            <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${s.bg}`}>
              <s.icon size={18} className={s.color} />
            </div>
            <div>
              <div className={`text-2xl font-bold leading-none tabular-nums ${dk ? "text-white" : "text-gray-900"}`}>{s.value}</div>
              <div className={`text-xs mt-0.5 ${dk ? "text-white/35" : "text-gray-400"}`}>{s.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Free time unlocked section */}
      {isWorkUnlocked() && (
        <div className="animate-slide-up" style={{ animationDelay: "200ms" }}>
          <div className={`text-xs font-bold uppercase tracking-widest mb-3 ${dk ? "text-emerald-400" : "text-emerald-600"}`}>
            🎉 Free Time Unlocked!
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Link to="/arcade"
              className="card-hover group flex flex-col items-center justify-center gap-3 py-7 rounded-2xl border-2 text-center transition-all"
              style={{
                background: dk ? "linear-gradient(135deg, rgba(139,92,246,0.12), rgba(99,102,241,0.08))" : "linear-gradient(135deg, #f5f3ff, #eef2ff)",
                borderColor: dk ? "rgba(139,92,246,0.3)" : "#c4b5fd",
              }}>
              <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-3xl"
                style={{ background: dk ? "rgba(139,92,246,0.2)" : "rgba(139,92,246,0.1)" }}>
                🎮
              </div>
              <div>
                <div className={`font-bold text-sm ${dk ? "text-violet-300" : "text-violet-700"}`}>Arcade</div>
                <div className={`text-xs mt-0.5 ${dk ? "text-white/30" : "text-gray-400"}`}>Play games!</div>
              </div>
            </Link>
            <Link to="/projects"
              className="card-hover group flex flex-col items-center justify-center gap-3 py-7 rounded-2xl border-2 text-center transition-all"
              style={{
                background: dk ? "linear-gradient(135deg, rgba(16,185,129,0.10), rgba(5,150,105,0.06))" : "linear-gradient(135deg, #ecfdf5, #d1fae5)",
                borderColor: dk ? "rgba(16,185,129,0.25)" : "#6ee7b7",
              }}>
              <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-3xl"
                style={{ background: dk ? "rgba(16,185,129,0.2)" : "rgba(16,185,129,0.1)" }}>
                💻
              </div>
              <div>
                <div className={`font-bold text-sm ${dk ? "text-emerald-300" : "text-emerald-700"}`}>Projects</div>
                <div className={`text-xs mt-0.5 ${dk ? "text-white/30" : "text-gray-400"}`}>Build something!</div>
              </div>
            </Link>
          </div>
        </div>
      )}

      {classVideo && (
        <div className="card overflow-hidden animate-slide-up" style={{ animationDelay: "280ms" }}>
          <div className="flex items-center gap-2 mb-3">
            <div className="w-2 h-2 rounded-full bg-red-400 animate-pulse" />
            <h2 className={`text-sm font-semibold ${dk ? "text-white/70" : "text-gray-700"}`}>📺 Your Teacher Shared a Video</h2>
            {classVideo.video_title && <span className={`text-xs ml-auto ${dk ? "text-white/30" : "text-gray-400"}`}>{classVideo.video_title}</span>}
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

      <div className="card animate-slide-up" style={{ animationDelay: "320ms" }}>
        <h2 className={`text-sm font-semibold mb-3 ${dk ? "text-white/70" : "text-gray-700"}`}>Join a Class</h2>
        <div className="flex gap-2">
          <input value={joinCode} onChange={(e) => setJoinCode(e.target.value)}
            placeholder="Enter class code…" className="input text-sm flex-1 uppercase tracking-widest"
            onKeyDown={(e) => e.key === "Enter" && handleJoinClass()} />
          <button ref={joinBtnRef} onClick={handleJoinClass}
            className={`btn-primary px-4 transition-all duration-200 ${joinSuccess ? "bg-emerald-500 hover:bg-emerald-500" : ""}`}>
            {joinSuccess ? "✓" : "Join"}
          </button>
        </div>
      </div>

      <div className="card animate-slide-up" style={{ animationDelay: "400ms" }}>
        <h2 className={`text-base font-semibold mb-4 ${dk ? "text-white" : "text-gray-900"}`}>Recent Grades</h2>
        <div className="space-y-2">
          {submissions.slice(0, 5).map((s: any, i: number) => (
            <div key={s.id} className="list-row animate-slide-in-right" style={{ animationDelay: `${500 + i * 50}ms` }}>
              <div className="flex items-center gap-3">
                <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${dk ? "bg-violet-500/10" : "bg-violet-50"}`}>
                  <CheckCircle size={14} className="text-violet-400" />
                </div>
                <div>
                  <div className={`text-sm font-medium ${dk ? "text-white" : "text-gray-900"}`}>{s.assignment_title || "Assignment"}</div>
                  <div className={`text-xs flex items-center gap-1 ${dk ? "text-white/30" : "text-gray-400"}`}>
                    <Clock size={10} />{new Date(s.submitted_at).toLocaleDateString()}
                  </div>
                </div>
              </div>
              <div>
                {s.grade !== null ? (
                  <span className={`text-sm font-bold ${s.grade >= 70 ? "text-emerald-400" : "text-red-400"}`}>{s.grade}%</span>
                ) : (
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${dk ? "text-white/30 bg-white/[0.05]" : "text-gray-500 bg-gray-100"}`}>Pending</span>
                )}
              </div>
            </div>
          ))}
          {submissions.length === 0 && (
            <p className={`text-center text-sm py-8 ${dk ? "text-white/25" : "text-gray-400"}`}>No submissions yet</p>
          )}
        </div>
      </div>
    </div>
  );
}
