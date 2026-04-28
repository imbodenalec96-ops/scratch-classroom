import React, { useState, useEffect, useRef, useCallback } from "react";

// ─── API base (mirrors lib/api.ts pattern) ───────────────────────────────────
const BASE =
  (import.meta as any)?.env?.VITE_API_BASE ||
  (typeof window !== "undefined" && window.location.hostname === "localhost"
    ? "http://localhost:4000/api"
    : "/api");

async function req<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...options?.headers },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || res.statusText);
  }
  return res.json();
}

// ─── Types ────────────────────────────────────────────────────────────────────
interface Student {
  id: string;
  name: string;
  avatar_emoji: string;
  skip_work_day_date?: string | null;
  reading_min_grade?: number;
  reading_max_grade?: number;
  math_min_grade?: number;
  math_max_grade?: number;
  writing_min_grade?: number;
  writing_max_grade?: number;
  approved_video_url?: string | null;
  approved_video_title?: string | null;
  approved_video_set_at?: string | null;
}

interface Task {
  id: string | number;
  subject: string;
  prompt: string;
  hint?: string;
  answer?: string | null;
  student_answer?: string | null;
  passed?: boolean;
  completed?: boolean;
  student_id?: string | number;
  ai_feedback?: string;
  grade_min?: number;
  grade_max?: number;
}

interface WorksheetAssignment {
  id: number;
  title: string;
  subject: string;
  url: string;
  completed: boolean;
  student_id: number;
}

interface YoutubeVideo {
  id: number;
  title: string;
  url: string;
  category?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const SUBJECTS = [
  { key: "reading", label: "Reading", emoji: "📚", color: "#22d3ee" },
  { key: "math",    label: "Math",    emoji: "🔢", color: "#7c3aed" },
  { key: "writing", label: "Writing", emoji: "✏️", color: "#10b981" },
];

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function todayDisplay() {
  return new Date().toLocaleDateString("en-US", {
    weekday: "long", month: "long", day: "numeric",
  });
}

function extractYoutubeId(url: string): string | null {
  const m = url.match(/(?:v=|youtu\.be\/|embed\/)([A-Za-z0-9_-]{11})/);
  return m ? m[1] : null;
}

// ─── Shake keyframes injected once ───────────────────────────────────────────
const SHAKE_CSS = `
@keyframes kiosk-shake {
  0%,100%{ transform:translateX(0) }
  15%{ transform:translateX(-8px) }
  30%{ transform:translateX(8px) }
  45%{ transform:translateX(-6px) }
  60%{ transform:translateX(6px) }
  75%{ transform:translateX(-3px) }
  90%{ transform:translateX(3px) }
}
.kiosk-shake { animation: kiosk-shake 0.5s ease; }

@keyframes kiosk-card-flip {
  0%   { transform: rotateY(0deg) }
  50%  { transform: rotateY(180deg) }
  100% { transform: rotateY(360deg) }
}
.kiosk-flip { animation: kiosk-card-flip 0.6s ease; }

@keyframes kiosk-ring-burst {
  0%   { transform: scale(1) }
  50%  { transform: scale(1.18) }
  100% { transform: scale(1) }
}
.kiosk-ring-burst { animation: kiosk-ring-burst 0.55s ease; }

@keyframes kiosk-toast-in {
  from { opacity:0; transform:translateX(-50%) translateY(-16px); }
  to   { opacity:1; transform:translateX(-50%) translateY(0); }
}
@keyframes kiosk-toast-out {
  from { opacity:1; }
  to   { opacity:0; }
}
@keyframes kiosk-fade-in {
  from { opacity:0; transform:translateY(18px); }
  to   { opacity:1; transform:translateY(0); }
}
.kiosk-fade-in { animation: kiosk-fade-in 0.4s ease both; }
`;

// ─── Sub-components ───────────────────────────────────────────────────────────

/** Circular SVG progress ring */
function ProgressRing({
  pct, color, emoji, label, done, total
}: { pct: number; color: string; emoji: string; label: string; done: number; total: number }) {
  const R = 44;
  const circ = 2 * Math.PI * R;
  const offset = circ - (pct / 100) * circ;
  const [burst, setBurst] = useState(false);

  // expose burst setter via ref so parent can trigger it
  useEffect(() => {
    if (pct === 100 && done > 0) {
      setBurst(true);
      const t = setTimeout(() => setBurst(false), 600);
      return () => clearTimeout(t);
    }
  }, [pct, done]);

  return (
    <div className={`flex flex-col items-center gap-3 ${burst ? "kiosk-ring-burst" : ""}`}>
      <div className="relative w-28 h-28">
        <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
          <circle cx="50" cy="50" r={R} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth="10" />
          <circle
            cx="50" cy="50" r={R} fill="none"
            stroke={color} strokeWidth="10"
            strokeLinecap="round"
            strokeDasharray={circ}
            strokeDashoffset={offset}
            style={{ transition: "stroke-dashoffset 0.8s cubic-bezier(0.4,0,0.2,1)" }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl leading-none">{emoji}</span>
          <span className="text-sm font-bold mt-0.5" style={{ color }}>{pct}%</span>
        </div>
      </div>
      <div className="text-center">
        <div className="text-white font-semibold text-sm">{label}</div>
        <div className="text-white/40 text-xs mt-0.5">{done}/{total} done</div>
      </div>
    </div>
  );
}

/** Toast notification */
function Toast({ msg, onDone }: { msg: string; onDone: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDone, 2500);
    return () => clearTimeout(t);
  }, [onDone]);
  return (
    <div style={{
      position: "fixed", top: 24, left: "50%",
      transform: "translateX(-50%)",
      background: "rgba(10,11,32,0.95)",
      border: "1px solid rgba(255,255,255,0.12)",
      borderRadius: 14, padding: "12px 24px",
      color: "#fff", fontWeight: 600, fontSize: 15,
      zIndex: 9999, whiteSpace: "nowrap",
      boxShadow: "0 8px 40px rgba(0,0,0,0.6)",
      animation: "kiosk-toast-in 0.3s ease",
    }}>{msg}</div>
  );
}

/** Sandboxed iframe modal */
function IframeModal({ url, onClose }: { url: string; onClose: () => void }) {
  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 8000,
        background: "rgba(0,0,0,0.85)", backdropFilter: "blur(6px)",
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
        padding: 24,
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        width: "100%", maxWidth: 900, height: "80vh",
        borderRadius: 20, overflow: "hidden",
        border: "1px solid rgba(255,255,255,0.1)",
        display: "flex", flexDirection: "column",
        background: "#07071a",
      }}>
        <div style={{
          display: "flex", justifyContent: "flex-end", alignItems: "center",
          padding: "10px 16px", borderBottom: "1px solid rgba(255,255,255,0.06)",
        }}>
          <button
            onClick={onClose}
            style={{
              background: "rgba(255,255,255,0.07)", border: "none",
              borderRadius: 8, color: "#fff", padding: "6px 16px",
              fontWeight: 700, cursor: "pointer", fontSize: 13,
            }}
          >✕ Close</button>
        </div>
        <iframe
          src={url}
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-autoplay allow-presentation"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          style={{ flex: 1, border: "none", width: "100%", height: "100%" }}
          allowFullScreen
        />
      </div>
    </div>
  );
}

// ─── Confetti burst ───────────────────────────────────────────────────────────
function fireConfetti(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  const particles = Array.from({ length: 120 }, () => ({
    x: Math.random() * canvas.width,
    y: -10,
    vx: (Math.random() - 0.5) * 6,
    vy: Math.random() * 6 + 3,
    color: ["#22d3ee", "#7c3aed", "#10b981", "#f59e0b", "#f43f5e", "#a78bfa"][Math.floor(Math.random() * 6)],
    size: Math.random() * 8 + 4,
    rotation: Math.random() * 360,
    rotationSpeed: (Math.random() - 0.5) * 8,
  }));
  let frame = 0;
  const animate = () => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    let alive = false;
    for (const p of particles) {
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.12;
      p.rotation += p.rotationSpeed;
      if (p.y < canvas.height + 20) alive = true;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate((p.rotation * Math.PI) / 180);
      ctx.fillStyle = p.color;
      ctx.globalAlpha = Math.max(0, 1 - p.y / canvas.height);
      ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
      ctx.restore();
    }
    if (alive && frame < 180) { frame++; requestAnimationFrame(animate); }
    else ctx.clearRect(0, 0, canvas.width, canvas.height);
  };
  animate();
}

function playChime() {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = "sine";
    osc.frequency.value = 440;
    gain.gain.setValueAtTime(0.4, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1.2);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 1.2);
    // Second harmonic for richness
    const osc2 = ctx.createOscillator();
    osc2.connect(gain);
    osc2.type = "sine";
    osc2.frequency.value = 659; // E5
    const g2 = ctx.createGain();
    osc2.connect(g2);
    g2.connect(ctx.destination);
    g2.gain.setValueAtTime(0.25, ctx.currentTime + 0.15);
    g2.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1.4);
    osc2.start(ctx.currentTime + 0.15);
    osc2.stop(ctx.currentTime + 1.4);
  } catch { /* silently fail if AudioContext blocked */ }
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function StudentKiosk() {
  const [students, setStudents] = useState<Student[]>([]);
  const [loadingStudents, setLoadingStudents] = useState(true);
  const [activeStudent, setActiveStudent] = useState<Student | null>(() => {
    try {
      const raw = sessionStorage.getItem("kiosk_student");
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  });

  const [tasks, setTasks] = useState<Task[]>([]);
  const [worksheets, setWorksheets] = useState<WorksheetAssignment[]>([]);
  const [videos, setVideos] = useState<YoutubeVideo[]>([]);
  const [loadingDash, setLoadingDash] = useState(false);

  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState<Record<string, boolean>>({});
  const [showHint, setShowHint] = useState<Record<string, boolean>>({});
  const [flipping, setFlipping] = useState<Record<string, boolean>>({});
  const [shaking, setShaking] = useState<Record<string, boolean>>({});

  const [iframeUrl, setIframeUrl] = useState<string | null>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [videoModal, setVideoModal] = useState<YoutubeVideo | null>(null);

  const [videoReqOpen, setVideoReqOpen] = useState(false);
  const [videoReqTitle, setVideoReqTitle] = useState("");
  const [videoReqLoading, setVideoReqLoading] = useState(false);
  const [approvedVideoModal, setApprovedVideoModal] = useState(false);

  const confettiRef = useRef<HTMLCanvasElement>(null);
  const alreadyCelebrated = useRef(false);

  // ── Style injection ───────────────────────────────────────────────────────
  useEffect(() => {
    const el = document.createElement("style");
    el.textContent = SHAKE_CSS;
    document.head.appendChild(el);
    return () => { document.head.removeChild(el); };
  }, []);

  // ── Load student list ─────────────────────────────────────────────────────
  useEffect(() => {
    req<Student[]>("/students")
      .then(setStudents)
      .catch(() => setStudents([]))
      .finally(() => setLoadingStudents(false));
  }, []);

  // ── Load dashboard data when student selected ─────────────────────────────
  useEffect(() => {
    if (!activeStudent) return;
    alreadyCelebrated.current = false;
    setLoadingDash(true);
    const today = todayStr();
    const s = activeStudent;

    async function loadDash() {
      const [t, w, v] = await Promise.allSettled([
        req<Task[]>(`/tasks/${s.id}/${today}`),
        req<WorksheetAssignment[]>(`/worksheets/assignments?student_id=${s.id}&date=${today}`),
        req<YoutubeVideo[]>("/youtube/approved"),
      ]);
      const existingTasks: Task[] = t.status === "fulfilled" ? t.value : [];
      setTasks(existingTasks);
      setWorksheets(w.status === "fulfilled" ? w.value : []);
      setVideos(v.status === "fulfilled" ? v.value : []);

      // ── AI task generation: generate missing subjects (one per subject) ──
      const subjects = ["reading", "math", "writing"] as const;
      for (const subj of subjects) {
        const has = existingTasks.some(tk => tk.subject === subj);
        if (!has) {
          const gradeMin = subj === "reading" ? s.reading_min_grade
            : subj === "math" ? s.math_min_grade : s.writing_min_grade;
          const gradeMax = subj === "reading" ? s.reading_max_grade
            : subj === "math" ? s.math_max_grade : s.writing_max_grade;
          try {
            const newTasks = await req<Task[]>("/ai-tasks/generate", {
              method: "POST",
              body: JSON.stringify({ student_id: s.id, date: today, subject: subj, grade_min: gradeMin, grade_max: gradeMax }),
            });
            setTasks(prev => [...prev, ...newTasks]);
          } catch {
            // AI not configured yet — show placeholder task so student sees something
            const placeholder: Task = {
              id: `placeholder-${subj}`,
              subject: subj,
              prompt: "Your teacher is setting up AI tasks. Check back soon! 🎓",
              hint: "",
              passed: false,
              completed: false,
            };
            setTasks(prev => [...prev.filter(tk => tk.subject !== subj), placeholder]);
          }
        }
      }
    }

    loadDash().finally(() => setLoadingDash(false));
  }, [activeStudent]);

  // ── Derived state ─────────────────────────────────────────────────────────
  const isFreeDay = activeStudent?.skip_work_day_date === todayStr();

  function progressFor(subject: string) {
    const subTasks = tasks.filter(t => t.subject?.toLowerCase() === subject);
    const subSheets = worksheets.filter(w => w.subject?.toLowerCase() === subject);
    const total = subTasks.length + subSheets.length;
    if (total === 0) return { done: 0, total: 0, pct: 0 };
    const done = subTasks.filter(t => t.passed || t.completed).length +
                 subSheets.filter(w => w.completed).length;
    return { done, total, pct: Math.round((done / total) * 100) };
  }

  const allDone = isFreeDay ||
    (tasks.every(t => t.passed || t.completed) &&
     worksheets.every(w => w.completed));

  // Celebration trigger
  useEffect(() => {
    if (allDone && !alreadyCelebrated.current && activeStudent && (tasks.length + worksheets.length > 0)) {
      alreadyCelebrated.current = true;
      if (confettiRef.current) fireConfetti(confettiRef.current);
      playChime();
      setToastMsg("🎉 Amazing work! You unlocked Coding & Games!");
    }
  }, [allDone, activeStudent, tasks.length, worksheets.length]);

  // ── Actions ───────────────────────────────────────────────────────────────
  const toast = useCallback((msg: string) => {
    setToastMsg(msg);
  }, []);

  const selectStudent = useCallback((s: Student) => {
    sessionStorage.setItem("kiosk_student", JSON.stringify(s));
    setActiveStudent(s);
    setTasks([]);
    setWorksheets([]);
    setVideos([]);
    setAnswers({});
    setSubmitting({});
    setShowHint({});
  }, []);

  const backToSelector = useCallback(() => {
    sessionStorage.removeItem("kiosk_student");
    setActiveStudent(null);
    alreadyCelebrated.current = false;
  }, []);

  async function submitAnswer(task: Task) {
    const ans = answers[String(task.id)] || "";
    if (!ans.trim()) return;
    if (String(task.id).startsWith("placeholder-")) {
      toast("This task is a placeholder — AI tasks will appear soon! 🎓");
      return;
    }
    setSubmitting(s => ({ ...s, [String(task.id)]: true }));

    // Step 1: Save answer
    try {
      await req<Task>(`/tasks/${task.id}/answer`, {
        method: "PUT",
        body: JSON.stringify({ student_answer: ans }),
      });
    } catch { /* fallthrough — grade anyway */ }

    // Step 2: Stream grading from AI
    try {
      const res = await fetch(`${BASE}/ai-tasks/grade`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          task_id: task.id,
          student_answer: ans,
          grade_min: task.grade_min ?? activeStudent?.reading_min_grade ?? 1,
          grade_max: task.grade_max ?? activeStudent?.reading_max_grade ?? 6,
        }),
      });

      if (!res.ok || !res.body) throw new Error("grading unavailable");

      // Mark "checking" state
      setTasks(prev => prev.map(t => t.id === task.id ? { ...t, _checking: true } : t));

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let streamedFeedback = "";
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        const lines = decoder.decode(value).split("\n");
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const data = JSON.parse(line.slice(6));
            if (data.token) {
              streamedFeedback += data.token;
            }
            if (data.done) {
              setTasks(prev => prev.map(t =>
                t.id === task.id
                  ? { ...t, passed: data.passed, ai_feedback: data.feedback, completed: true, _checking: false }
                  : t
              ));
              if (data.passed) toast("✅ Great job! You got it right!");
              else toast("Almost! Read the feedback and try again 💪");
            }
          } catch { /* ignore malformed SSE line */ }
        }
      }
    } catch {
      // AI not configured or network error — optimistic pass
      setTasks(prev => prev.map(t =>
        t.id === task.id
          ? { ...t, passed: true, completed: true, ai_feedback: "Great effort! Keep it up! ⭐", _checking: false }
          : t
      ));
      toast("✅ Answer submitted! AI grading coming soon.");
    } finally {
      setSubmitting(s => ({ ...s, [String(task.id)]: false }));
    }
  }

  async function completeWorksheet(ws: WorksheetAssignment) {
    setFlipping(f => ({ ...f, [ws.id]: true }));
    setTimeout(() => setFlipping(f => ({ ...f, [ws.id]: false })), 650);
    try {
      await req(`/worksheets/assignments/${ws.id}/complete`, { method: "PUT" });
    } catch { /* optimistic */ }
    setWorksheets(prev => prev.map(w => w.id === ws.id ? { ...w, completed: true } : w));
    toast("📋 Worksheet marked done!");
  }

  function tryLockedLink() {
    toast("Finish your work first! ✏️");
  }

  async function submitVideoRequest() {
    if (!videoReqTitle.trim()) return;
    setVideoReqLoading(true);
    try {
      await req("/youtube/requests", {
        method: "POST",
        body: JSON.stringify({ title: videoReqTitle, student_id: activeStudent?.id }),
      });
      toast("🎬 Video request sent! Your teacher will find it for you.");
      setVideoReqOpen(false);
      setVideoReqTitle("");
    } catch {
      toast("Couldn't send request — try again!");
    } finally {
      setVideoReqLoading(false);
    }
  }

  // ── Shake helper ──────────────────────────────────────────────────────────
  function shake(key: string) {
    setShaking(s => ({ ...s, [key]: true }));
    setTimeout(() => setShaking(s => ({ ...s, [key]: false })), 550);
    tryLockedLink();
  }

  // ─────────────────────────────────────────────────────────────────────────
  // PHASE 1: Avatar Selector
  // ─────────────────────────────────────────────────────────────────────────
  if (!activeStudent) {
    const hour = new Date().getHours();
    const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
    return (
      <div style={{
        minHeight: "100vh", background: "var(--bg, #f6f1e6)",
        display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center",
        padding: "40px 24px",
        fontFamily: "'Inter', system-ui, sans-serif",
      }}>
        <style>{SHAKE_CSS}</style>

        <div style={{ position: "relative", zIndex: 1, width: "100%", maxWidth: 960 }}>
          {/* ── Editorial masthead ── */}
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            marginBottom: 24, fontSize: 10, letterSpacing: "0.16em",
            textTransform: "uppercase", color: "var(--text-3, #857a63)",
            fontWeight: 600,
          }}>
            <span>{new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}</span>
            <span style={{ fontFamily: "'JetBrains Mono', monospace" }}>BLOCKFORGE · KIOSK</span>
          </div>

          <div style={{
            borderTop: "1px solid var(--border, rgba(24,23,26,0.12))",
            borderBottom: "1px solid var(--border, rgba(24,23,26,0.12))",
            padding: "24px 0 28px", marginBottom: 40, textAlign: "center",
          }}>
            <div style={{
              fontSize: 10, letterSpacing: "0.18em", textTransform: "uppercase",
              color: "var(--accent, #D97757)", fontWeight: 700, marginBottom: 10,
            }}>— Who's learning today —</div>
            <h1 style={{
              fontFamily: "'Fraunces', Georgia, serif",
              fontSize: "clamp(44px, 6vw, 72px)", fontWeight: 500,
              color: "var(--text-1, #18171a)",
              lineHeight: 1.02, letterSpacing: "-0.02em", margin: 0,
            }}>
              {greeting}.
              <br />
              <em style={{
                color: "var(--accent, #D97757)", fontStyle: "italic",
                fontWeight: 400,
              }}>Tap your name.</em>
            </h1>
          </div>

          {/* Student grid */}
          {loadingStudents ? (
            <div style={{ display: "flex", gap: 12, justifyContent: "center", marginTop: 40 }}>
              {[0,1,2].map(i => (
                <div key={i} style={{
                  width: 10, height: 10, borderRadius: "50%",
                  background: "var(--accent, #D97757)", opacity: 0.4,
                  animation: "kiosk-fade-in 0.6s ease infinite alternate",
                  animationDelay: `${i * 200}ms`,
                }} />
              ))}
            </div>
          ) : students.length === 0 ? (
            <div style={{
              textAlign: "center", color: "var(--text-3, #857a63)",
              fontSize: 18, marginTop: 40, padding: "40px 0",
              fontFamily: "'Fraunces', Georgia, serif", fontStyle: "italic",
            }}>
              No students found. Ask your teacher to set up the class.
            </div>
          ) : (
            <div style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
              gap: 16,
            }}>
              {students.map((s, i) => (
                <button
                  key={s.id}
                  onClick={() => selectStudent(s)}
                  className="kiosk-fade-in"
                  style={{
                    animationDelay: `${i * 40}ms`,
                    background: "var(--bg-surface, #fffaf0)",
                    border: "1px solid var(--border, rgba(24,23,26,0.12))",
                    borderRadius: 10, padding: "22px 14px 18px",
                    cursor: "pointer", transition: "all 0.18s ease",
                    display: "flex", flexDirection: "column",
                    alignItems: "center", gap: 12,
                    fontFamily: "inherit",
                  }}
                  onMouseEnter={e => {
                    const el = e.currentTarget as HTMLButtonElement;
                    el.style.borderColor = "var(--accent, #D97757)";
                    el.style.transform = "translateY(-2px)";
                    el.style.boxShadow = "0 8px 28px rgba(217,119,6,0.18)";
                    const inner = el.querySelector<HTMLDivElement>("[data-avatar]");
                    if (inner) inner.style.background = "var(--accent-light, #fde8c7)";
                  }}
                  onMouseLeave={e => {
                    const el = e.currentTarget as HTMLButtonElement;
                    el.style.borderColor = "var(--border, rgba(24,23,26,0.12))";
                    el.style.transform = "";
                    el.style.boxShadow = "";
                    const inner = el.querySelector<HTMLDivElement>("[data-avatar]");
                    if (inner) inner.style.background = "var(--bg-muted, #efe7d4)";
                  }}
                >
                  <div data-avatar style={{
                    width: 72, height: 72, borderRadius: "50%",
                    background: "var(--bg-muted, #efe7d4)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 40, lineHeight: 1,
                    border: "1px solid var(--border, rgba(24,23,26,0.12))",
                    transition: "background 0.18s ease",
                  }}>
                    {s.avatar_emoji || "🧑"}
                  </div>
                  <span style={{
                    color: "var(--text-1, #18171a)",
                    fontFamily: "'Fraunces', Georgia, serif",
                    fontWeight: 500, fontSize: 17,
                    textAlign: "center", wordBreak: "break-word",
                    letterSpacing: "-0.01em",
                  }}>{s.name}</span>
                </button>
              ))}
            </div>
          )}

          {/* ── Newspaper footer ── */}
          <div style={{
            marginTop: 56, paddingTop: 20,
            borderTop: "1px solid var(--border, rgba(24,23,26,0.12))",
            display: "flex", alignItems: "center", justifyContent: "space-between",
            fontSize: 10, letterSpacing: "0.14em", textTransform: "uppercase",
            color: "var(--text-3, #857a63)", fontWeight: 600,
          }}>
            <span>Vol. I · No. 01</span>
            <span style={{ fontFamily: "'Fraunces', Georgia, serif", fontStyle: "italic", letterSpacing: 0, textTransform: "none", fontSize: 13 }}>
              Est. in the classroom.
            </span>
            <span>{new Date().getFullYear()}</span>
          </div>
        </div>
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // PHASE 2: Main Dashboard
  // ─────────────────────────────────────────────────────────────────────────

  const cardStyle: React.CSSProperties = {
    background: "rgba(255,255,255,0.04)",
    border: "1px solid rgba(255,255,255,0.06)",
    borderRadius: 16, padding: 20,
  };

  return (
    <div style={{
      minHeight: "100vh", background: "#07071a",
      fontFamily: "system-ui, sans-serif",
      color: "#fff",
    }}>
      <style>{SHAKE_CSS}</style>

      {/* Confetti canvas */}
      <canvas ref={confettiRef} style={{
        position: "fixed", inset: 0, pointerEvents: "none",
        zIndex: 9990, width: "100%", height: "100%",
      }} />

      {/* Toast */}
      {toastMsg && <Toast msg={toastMsg} onDone={() => setToastMsg(null)} />}

      {/* Iframe modal */}
      {iframeUrl && <IframeModal url={iframeUrl} onClose={() => setIframeUrl(null)} />}

      {/* YouTube video modal (class-wide approved list) */}
      {videoModal && (() => {
        const vid = extractYoutubeId(videoModal.url);
        const embedUrl = vid
          ? `https://www.youtube-nocookie.com/embed/${vid}?autoplay=1&rel=0&modestbranding=1&playsinline=1`
          : videoModal.url;
        return <IframeModal url={embedUrl} onClose={() => setVideoModal(null)} />;
      })()}

      {/* Approved per-student video modal */}
      {approvedVideoModal && activeStudent?.approved_video_url && (() => {
        const vid = extractYoutubeId(activeStudent.approved_video_url);
        const embedUrl = vid
          ? `https://www.youtube-nocookie.com/embed/${vid}?autoplay=1&rel=0&modestbranding=1&playsinline=1`
          : activeStudent.approved_video_url;
        return (
          <div style={{
            position: "fixed", inset: 0, zIndex: 9000,
            background: "rgba(0,0,0,0.92)", backdropFilter: "blur(10px)",
            display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
          }}>
            <div style={{
              width: "min(900px, 96vw)", background: "#07071a",
              border: "1px solid rgba(139,92,246,0.3)", borderRadius: 20, overflow: "hidden",
              boxShadow: "0 0 80px rgba(139,92,246,0.2)",
            }}>
              <div style={{
                display: "flex", alignItems: "center", gap: 10,
                padding: "10px 16px", background: "rgba(139,92,246,0.08)",
                borderBottom: "1px solid rgba(139,92,246,0.15)",
              }}>
                <span style={{ color: "#a78bfa", fontWeight: 700, fontSize: 14 }}>
                  📺 {activeStudent.approved_video_title || "Your Approved Video"}
                </span>
                <button onClick={() => setApprovedVideoModal(false)} style={{
                  marginLeft: "auto", background: "rgba(255,255,255,0.07)",
                  border: "1px solid rgba(255,255,255,0.12)", color: "rgba(255,255,255,0.6)",
                  borderRadius: 8, padding: "4px 14px", cursor: "pointer", fontSize: 12, fontWeight: 700,
                }}>✕ Close</button>
              </div>
              <div style={{ position: "relative", paddingTop: "56.25%" }}>
                <iframe
                  src={embedUrl}
                  style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", border: "none" }}
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                  allowFullScreen
                  title="Approved Video"
                />
              </div>
            </div>
          </div>
        );
      })()}

      {/* Video request modal */}
      {videoReqOpen && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 8000,
          background: "rgba(0,0,0,0.75)", backdropFilter: "blur(6px)",
          display: "flex", alignItems: "center", justifyContent: "center",
        }} onClick={e => { if (e.target === e.currentTarget) setVideoReqOpen(false); }}>
          <div style={{
            background: "#0a0b20", border: "1px solid rgba(255,255,255,0.1)",
            borderRadius: 20, padding: 32, width: "90%", maxWidth: 440,
          }}>
            <h3 style={{ margin: "0 0 8px", fontSize: 20, fontWeight: 800 }}>🎬 Request a Video</h3>
            <p style={{ margin: "0 0 18px", fontSize: 13, color: "rgba(255,255,255,0.45)", lineHeight: 1.5 }}>
              Tell your teacher what you'd like to watch. They'll find an approved version and send it to you.
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <input
                value={videoReqTitle}
                onChange={e => setVideoReqTitle(e.target.value)}
                onKeyDown={e => e.key === "Enter" && submitVideoRequest()}
                placeholder="What do you want to watch? (e.g. Minecraft tips, math tricks)"
                autoFocus
                style={{
                  background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)",
                  borderRadius: 10, padding: "12px 14px", color: "#fff",
                  fontSize: 15, outline: "none",
                }}
              />
              <div style={{ display: "flex", gap: 10 }}>
                <button
                  onClick={() => { setVideoReqOpen(false); setVideoReqTitle(""); }}
                  style={{
                    flex: 1, padding: "10px 0",
                    background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)",
                    borderRadius: 10, color: "rgba(255,255,255,0.6)", fontWeight: 700,
                    cursor: "pointer", fontSize: 14,
                  }}
                >Cancel</button>
                <button
                  onClick={submitVideoRequest}
                  disabled={videoReqLoading || !videoReqTitle.trim()}
                  style={{
                    flex: 2, padding: "10px 0",
                    background: "linear-gradient(135deg, #7c3aed, #4f46e5)",
                    border: "none", borderRadius: 10, color: "#fff",
                    fontWeight: 800, cursor: "pointer", fontSize: 14,
                    opacity: (videoReqLoading || !videoReqTitle.trim()) ? 0.5 : 1,
                  }}
                >{videoReqLoading ? "Sending..." : "📩 Send to Teacher"}</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Background orbs */}
      <div style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 0 }}>
        <div style={{
          position: "absolute", top: "10%", left: "-5%",
          width: 500, height: 500, borderRadius: "50%",
          background: "radial-gradient(circle, rgba(124,58,237,0.08), transparent 70%)",
          filter: "blur(50px)",
        }} />
        <div style={{
          position: "absolute", bottom: "10%", right: "-5%",
          width: 400, height: 400, borderRadius: "50%",
          background: "radial-gradient(circle, rgba(34,211,238,0.07), transparent 70%)",
          filter: "blur(50px)",
        }} />
      </div>

      <div style={{ position: "relative", zIndex: 1, maxWidth: 1000, margin: "0 auto", padding: "0 20px 60px" }}>

        {/* ── HEADER ───────────────────────────────────────────────────────── */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "20px 0", flexWrap: "wrap", gap: 12,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div style={{
              width: 56, height: 56, borderRadius: "50%",
              background: "rgba(255,255,255,0.06)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 32, border: "2px solid rgba(255,255,255,0.1)",
              flexShrink: 0,
            }}>
              {activeStudent.avatar_emoji || "🧑"}
            </div>
            <div>
              <div style={{ fontSize: 22, fontWeight: 900, letterSpacing: "-0.3px" }}>
                {activeStudent.name}
              </div>
              <button
                onClick={backToSelector}
                style={{
                  background: "none", border: "none", padding: 0,
                  color: "rgba(255,255,255,0.4)", fontSize: 13, cursor: "pointer",
                  fontWeight: 600, display: "flex", alignItems: "center", gap: 4,
                  marginTop: 2,
                }}
              >
                👋 Not you?
              </button>
            </div>
          </div>
          <div style={{
            fontSize: 14, color: "rgba(255,255,255,0.35)",
            fontWeight: 600, textAlign: "right",
          }}>
            {todayDisplay()}
          </div>
        </div>

        {/* ── FREE DAY BANNER ──────────────────────────────────────────────── */}
        {isFreeDay && (
          <div style={{
            background: "linear-gradient(135deg, rgba(245,158,11,0.25), rgba(251,191,36,0.15))",
            border: "1px solid rgba(245,158,11,0.4)",
            borderRadius: 16, padding: "16px 24px",
            marginBottom: 28, textAlign: "center",
            fontSize: 17, fontWeight: 700, color: "#fbbf24",
            boxShadow: "0 4px 24px rgba(245,158,11,0.15)",
          }}>
            🎉 Free Day! Your teacher gave you a free day today — enjoy the games!
          </div>
        )}

        {loadingDash ? (
          <div style={{ display: "flex", gap: 10, justifyContent: "center", padding: "80px 0" }}>
            {[0,1,2].map(i => (
              <div key={i} style={{
                width: 10, height: 10, borderRadius: "50%",
                background: "#7c3aed", animation: "kiosk-fade-in 0.5s ease infinite alternate",
                animationDelay: `${i * 180}ms`, opacity: 0.7,
              }} />
            ))}
          </div>
        ) : (
          <>
            {/* ── PROGRESS RINGS ───────────────────────────────────────────── */}
            <div style={{
              display: "grid", gridTemplateColumns: "repeat(3, 1fr)",
              gap: 20, marginBottom: 36,
            }}>
              {SUBJECTS.map(subj => {
                const prog = progressFor(subj.key);
                return (
                  <div key={subj.key} style={cardStyle}>
                    <div style={{ display: "flex", justifyContent: "center" }}>
                      <ProgressRing
                        pct={prog.pct} color={subj.color}
                        emoji={subj.emoji} label={subj.label}
                        done={prog.done} total={prog.total}
                      />
                    </div>
                  </div>
                );
              })}
            </div>

            {/* ── DAILY TASKS ──────────────────────────────────────────────── */}
            <section style={{ marginBottom: 36 }}>
              <h2 style={{ fontSize: 20, fontWeight: 900, marginBottom: 20, letterSpacing: "-0.3px" }}>
                📝 Daily Tasks
              </h2>
              {SUBJECTS.map(subj => {
                const subTasks = tasks.filter(t => t.subject?.toLowerCase() === subj.key);
                if (subTasks.length === 0) return null;
                return (
                  <div key={subj.key} style={{ marginBottom: 28 }}>
                    {/* Subject header */}
                    <div style={{
                      display: "flex", alignItems: "center", gap: 8,
                      marginBottom: 14, paddingBottom: 10,
                      borderBottom: `1px solid rgba(255,255,255,0.06)`,
                    }}>
                      <span style={{ fontSize: 20 }}>{subj.emoji}</span>
                      <span style={{ fontWeight: 800, fontSize: 16, color: subj.color }}>{subj.label}</span>
                    </div>

                    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                      {subTasks.map(task => (
                        <div key={task.id} style={{
                          ...cardStyle,
                          borderColor: task.passed
                            ? "rgba(16,185,129,0.3)"
                            : task.completed
                            ? "rgba(245,158,11,0.3)"
                            : "rgba(255,255,255,0.06)",
                        }}>
                          {/* Task prompt */}
                          <p style={{
                            margin: "0 0 14px", fontSize: 15, lineHeight: 1.6,
                            color: "rgba(255,255,255,0.9)",
                          }}>
                            {task.prompt}
                          </p>

                          {task.passed ? (
                            <div style={{
                              display: "flex", alignItems: "center", gap: 8,
                              background: "rgba(16,185,129,0.1)",
                              border: "1px solid rgba(16,185,129,0.25)",
                              borderRadius: 10, padding: "10px 14px",
                            }}>
                              <span style={{ fontSize: 20 }}>✅</span>
                              <span style={{ color: "#10b981", fontWeight: 700, fontSize: 14 }}>
                                Awesome work! You nailed it!
                              </span>
                            </div>
                          ) : task.completed ? (
                            <div>
                              <div style={{
                                display: "flex", alignItems: "center", gap: 8,
                                background: "rgba(245,158,11,0.1)",
                                border: "1px solid rgba(245,158,11,0.25)",
                                borderRadius: 10, padding: "10px 14px", marginBottom: 12,
                              }}>
                                <span style={{ fontSize: 18 }}>🔄</span>
                                <span style={{ color: "#f59e0b", fontWeight: 700, fontSize: 14 }}>
                                  Not quite — give it another try!
                                </span>
                              </div>
                              {/* Allow retry */}
                              <textarea
                                value={answers[task.id] ?? (task.answer || "")}
                                onChange={e => setAnswers(a => ({ ...a, [task.id]: e.target.value }))}
                                placeholder="Try again..."
                                rows={3}
                                style={{
                                  width: "100%", background: "rgba(255,255,255,0.05)",
                                  border: "1px solid rgba(255,255,255,0.1)",
                                  borderRadius: 10, padding: "10px 12px",
                                  color: "#fff", fontSize: 14, resize: "vertical",
                                  outline: "none", boxSizing: "border-box",
                                }}
                              />
                            </div>
                          ) : (
                            <textarea
                              value={answers[task.id] || ""}
                              onChange={e => setAnswers(a => ({ ...a, [task.id]: e.target.value }))}
                              placeholder="Type your answer here..."
                              rows={3}
                              style={{
                                width: "100%", background: "rgba(255,255,255,0.05)",
                                border: "1px solid rgba(255,255,255,0.1)",
                                borderRadius: 10, padding: "10px 12px",
                                color: "#fff", fontSize: 14, resize: "vertical",
                                outline: "none", boxSizing: "border-box", marginBottom: 10,
                              }}
                            />
                          )}

                          {/* Actions row */}
                          {!task.passed && (
                            <div style={{ display: "flex", gap: 10, marginTop: 10, alignItems: "center" }}>
                              <button
                                onClick={() => setShowHint(h => ({ ...h, [task.id]: !h[task.id] }))}
                                style={{
                                  background: "rgba(255,255,255,0.05)",
                                  border: "1px solid rgba(255,255,255,0.1)",
                                  borderRadius: 8, padding: "7px 14px",
                                  color: "rgba(255,255,255,0.5)", fontSize: 13,
                                  cursor: "pointer", fontWeight: 600,
                                }}
                              >
                                {showHint[task.id] ? "Hide Hint" : "💡 Hint"}
                              </button>
                              <button
                                onClick={() => submitAnswer(task)}
                                disabled={submitting[task.id]}
                                style={{
                                  background: submitting[task.id]
                                    ? "rgba(124,58,237,0.4)"
                                    : "linear-gradient(135deg, #7c3aed, #4f46e5)",
                                  border: "none", borderRadius: 10,
                                  padding: "9px 20px", color: "#fff",
                                  fontWeight: 800, fontSize: 14,
                                  cursor: submitting[task.id] ? "not-allowed" : "pointer",
                                  transition: "all 0.2s",
                                }}
                              >
                                {submitting[task.id] ? "Checking... 🔍" : "Submit ✓"}
                              </button>
                            </div>
                          )}

                          {/* Hint */}
                          {showHint[task.id] && task.hint && (
                            <div style={{
                              marginTop: 12, background: "rgba(34,211,238,0.08)",
                              border: "1px solid rgba(34,211,238,0.2)",
                              borderRadius: 10, padding: "10px 14px",
                              color: "#22d3ee", fontSize: 13, fontWeight: 600,
                            }}>
                              💡 {task.hint}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
              {tasks.length === 0 && (
                <div style={{
                  ...cardStyle, textAlign: "center",
                  color: "rgba(255,255,255,0.25)", padding: "40px 20px", fontSize: 15,
                }}>
                  No tasks assigned for today 🎉
                </div>
              )}
            </section>

            {/* ── WORKSHEET CARDS ──────────────────────────────────────────── */}
            <section style={{ marginBottom: 36 }}>
              <h2 style={{ fontSize: 20, fontWeight: 900, marginBottom: 20, letterSpacing: "-0.3px" }}>
                📋 Worksheets
              </h2>
              {worksheets.length === 0 ? (
                <div style={{
                  ...cardStyle, textAlign: "center",
                  color: "rgba(255,255,255,0.25)", padding: "32px 20px", fontSize: 15,
                }}>
                  No worksheets assigned for today
                </div>
              ) : (
                <div style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
                  gap: 16,
                }}>
                  {worksheets.map(ws => {
                    const subj = SUBJECTS.find(s => s.key === ws.subject?.toLowerCase());
                    return (
                      <div
                        key={ws.id}
                        className={flipping[ws.id] ? "kiosk-flip" : ""}
                        style={{
                          ...cardStyle,
                          borderColor: ws.completed
                            ? "rgba(16,185,129,0.3)"
                            : "rgba(255,255,255,0.06)",
                          display: "flex", flexDirection: "column", gap: 14,
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 6 }}>
                              {ws.title}
                            </div>
                            {subj && (
                              <span style={{
                                fontSize: 11, fontWeight: 700, padding: "3px 8px",
                                borderRadius: 6, background: `${subj.color}20`,
                                color: subj.color, border: `1px solid ${subj.color}40`,
                              }}>
                                {subj.emoji} {subj.label}
                              </span>
                            )}
                          </div>
                          {ws.completed && (
                            <span style={{ fontSize: 22 }}>✅</span>
                          )}
                        </div>
                        <div style={{ display: "flex", gap: 8 }}>
                          <button
                            onClick={() => setIframeUrl(ws.url)}
                            style={{
                              flex: 1, background: "rgba(255,255,255,0.05)",
                              border: "1px solid rgba(255,255,255,0.1)",
                              borderRadius: 10, padding: "9px 0",
                              color: "#fff", fontWeight: 700, fontSize: 13,
                              cursor: "pointer",
                            }}
                          >
                            Open Worksheet
                          </button>
                          {!ws.completed && (
                            <button
                              onClick={() => completeWorksheet(ws)}
                              style={{
                                flex: 1,
                                background: "linear-gradient(135deg, #10b981, #059669)",
                                border: "none", borderRadius: 10, padding: "9px 0",
                                color: "#fff", fontWeight: 800, fontSize: 13,
                                cursor: "pointer",
                              }}
                            >
                              Mark Done ✓
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            {/* ── GAMES & CODING ───────────────────────────────────────────── */}
            <section style={{ marginBottom: 36 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
                <h2 style={{ fontSize: 20, fontWeight: 900, margin: 0, letterSpacing: "-0.3px" }}>
                  🎮 Coding & Games
                </h2>
                {allDone ? (
                  <span style={{
                    fontSize: 12, fontWeight: 800, padding: "4px 10px",
                    borderRadius: 8,
                    background: "rgba(16,185,129,0.15)",
                    color: "#10b981",
                    border: "1px solid rgba(16,185,129,0.3)",
                  }}>UNLOCKED ✓</span>
                ) : (
                  <span style={{
                    fontSize: 12, fontWeight: 800, padding: "4px 10px",
                    borderRadius: 8,
                    background: "rgba(245,158,11,0.12)",
                    color: "#f59e0b",
                    border: "1px solid rgba(245,158,11,0.3)",
                  }}>Finish work to unlock 🔒</span>
                )}
              </div>

              <div style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
                gap: 16,
              }}>
                {[
                  { key: "editor", icon: "🧱", title: "Block Editor", desc: "Build with code blocks", href: "/projects", color: "#7c3aed" },
                  { key: "unity",  icon: "🎯", title: "Unity 3D Stage", desc: "Create 3D worlds", href: "/playground?mode=unity", color: "#22d3ee" },
                  { key: "arcade", icon: "🕹️", title: "Arcade Games",  desc: "Play & earn points", href: "/arcade", color: "#10b981" },
                ].map(card => (
                  <div
                    key={card.key}
                    className={shaking[card.key] ? "kiosk-shake" : ""}
                    style={{
                      ...cardStyle, cursor: allDone ? "pointer" : "default",
                      position: "relative", overflow: "hidden",
                      transition: "all 0.2s",
                    }}
                    onClick={() => {
                      if (!allDone) { shake(card.key); return; }
                      window.location.href = card.href;
                    }}
                    onMouseEnter={e => {
                      if (!allDone) return;
                      (e.currentTarget as HTMLDivElement).style.background = `rgba(255,255,255,0.07)`;
                      (e.currentTarget as HTMLDivElement).style.transform = "translateY(-2px)";
                    }}
                    onMouseLeave={e => {
                      (e.currentTarget as HTMLDivElement).style.background = "rgba(255,255,255,0.04)";
                      (e.currentTarget as HTMLDivElement).style.transform = "";
                    }}
                  >
                    {/* Blurred overlay when locked */}
                    {!allDone && (
                      <div style={{
                        position: "absolute", inset: 0, zIndex: 2,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        background: "rgba(7,7,26,0.3)",
                        backdropFilter: "blur(3px)",
                        borderRadius: 16,
                      }}>
                        <span style={{ fontSize: 36 }}>🔒</span>
                      </div>
                    )}

                    <div style={{
                      filter: allDone ? "none" : "blur(4px)",
                      transition: "filter 0.3s",
                    }}>
                      <div style={{
                        width: 48, height: 48, borderRadius: 14,
                        background: `${card.color}20`,
                        border: `1px solid ${card.color}40`,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: 26, marginBottom: 14,
                      }}>
                        {card.icon}
                      </div>
                      <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 4 }}>{card.title}</div>
                      <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 13 }}>{card.desc}</div>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {/* ── YOUTUBE SECTION ──────────────────────────────────────────── */}
            <section>
              <div style={{
                display: "flex", alignItems: "center",
                justifyContent: "space-between", marginBottom: 20, flexWrap: "wrap", gap: 12,
              }}>
                <h2 style={{ fontSize: 20, fontWeight: 900, margin: 0, letterSpacing: "-0.3px" }}>
                  📺 Videos
                </h2>
                <button
                  onClick={() => setVideoReqOpen(true)}
                  style={{
                    background: "rgba(124,58,237,0.15)",
                    border: "1px solid rgba(124,58,237,0.35)",
                    borderRadius: 10, padding: "8px 16px",
                    color: "#a78bfa", fontWeight: 700, fontSize: 13,
                    cursor: "pointer",
                  }}
                >
                  🎬 Request a Video
                </button>
              </div>

              {/* Per-student approved video card */}
              {activeStudent?.approved_video_url && (
                <div style={{
                  ...cardStyle,
                  marginBottom: 16,
                  background: "linear-gradient(135deg, rgba(124,58,237,0.15), rgba(79,70,229,0.10))",
                  border: "1px solid rgba(124,58,237,0.35)",
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                    <div style={{
                      width: 52, height: 52, borderRadius: 14,
                      background: "rgba(124,58,237,0.25)",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 26, flexShrink: 0,
                    }}>▶</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 2 }}>
                        {activeStudent.approved_video_title || "Your Approved Video"}
                      </div>
                      <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 12 }}>
                        Approved by your teacher just for you ✓
                      </div>
                    </div>
                    <button
                      onClick={() => setApprovedVideoModal(true)}
                      style={{
                        background: "linear-gradient(135deg, #7c3aed, #4f46e5)",
                        border: "none", borderRadius: 12,
                        padding: "10px 20px", color: "#fff",
                        fontWeight: 800, fontSize: 14, cursor: "pointer", flexShrink: 0,
                      }}
                    >Watch Now ▶</button>
                  </div>
                </div>
              )}

              {videos.length === 0 && !activeStudent?.approved_video_url ? (
                <div style={{
                  ...cardStyle, textAlign: "center",
                  color: "rgba(255,255,255,0.25)", padding: "40px 20px", fontSize: 15,
                }}>
                  No videos yet — request one above!
                </div>
              ) : (
                <div style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
                  gap: 16,
                }}>
                  {videos.map(v => {
                    const vid = extractYoutubeId(v.url);
                    const thumb = vid
                      ? `https://img.youtube.com/vi/${vid}/mqdefault.jpg`
                      : null;
                    return (
                      <div
                        key={v.id}
                        style={cardStyle}
                      >
                        {/* Thumbnail */}
                        <div
                          style={{
                            width: "100%", paddingTop: "56.25%",
                            position: "relative", borderRadius: 10,
                            overflow: "hidden", marginBottom: 12,
                            background: "rgba(255,255,255,0.05)",
                            cursor: "pointer",
                          }}
                          onClick={() => setVideoModal(v)}
                        >
                          {thumb ? (
                            <img
                              src={thumb} alt={v.title}
                              style={{
                                position: "absolute", inset: 0,
                                width: "100%", height: "100%",
                                objectFit: "cover",
                              }}
                            />
                          ) : (
                            <div style={{
                              position: "absolute", inset: 0,
                              display: "flex", alignItems: "center", justifyContent: "center",
                              fontSize: 36,
                            }}>🎬</div>
                          )}
                          {/* Play button overlay */}
                          <div style={{
                            position: "absolute", inset: 0,
                            display: "flex", alignItems: "center", justifyContent: "center",
                            background: "rgba(0,0,0,0.25)",
                            transition: "background 0.2s",
                          }}>
                            <div style={{
                              width: 44, height: 44, borderRadius: "50%",
                              background: "rgba(255,255,255,0.9)",
                              display: "flex", alignItems: "center", justifyContent: "center",
                            }}>
                              <svg width="18" height="18" viewBox="0 0 24 24" fill="#1a1a2e">
                                <polygon points="5,3 19,12 5,21" />
                              </svg>
                            </div>
                          </div>
                        </div>

                        <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4 }}>
                          {v.title}
                        </div>
                        {v.category && (
                          <span style={{
                            fontSize: 11, fontWeight: 700, padding: "2px 8px",
                            borderRadius: 6, background: "rgba(34,211,238,0.1)",
                            color: "#22d3ee", border: "1px solid rgba(34,211,238,0.2)",
                          }}>
                            {v.category}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </div>
  );
}
