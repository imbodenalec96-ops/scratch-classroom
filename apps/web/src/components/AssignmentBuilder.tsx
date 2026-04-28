import React, { useEffect, useMemo, useState, useRef } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api.ts";
import { useTheme } from "../lib/theme.tsx";
import { useAuth } from "../lib/auth.tsx";
import { useCurrentBlock } from "../lib/useCurrentBlock.ts";

const ASSIGN_DAY_LETTERS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
function resolveBlockAssignmentId(
  raw: string | null | undefined,
  studentGrade?: number | null,
  studentId?: string | null,
): string | null {
  if (!raw) return null;
  try {
    const p = JSON.parse(raw);
    const today = ASSIGN_DAY_LETTERS[new Date().getDay()];
    const day = (p?.byDay && typeof p.byDay === "object" && p.byDay[today]) || {};
    const gk = studentGrade != null ? String(studentGrade) : null;
    return (
      (studentId && day.byStudent?.[studentId]) ||
      (gk && day.byGrade?.[gk]) ||
      day.assignmentId ||
      (studentId && p.byStudent?.[studentId]) ||
      (gk && p.byGrade?.[gk]) ||
      p.assignmentId ||
      null
    );
  } catch { return null; }
}
import {
  Sparkles, Plus, ChevronDown, ChevronUp, Printer, X, Loader2,
  BookOpen, GraduationCap, Calendar, FileText, Check,
} from "lucide-react";

/* ── Types ───────────────────────────────────────────────────── */
interface Question {
  type: "multiple_choice" | "short_answer" | "fill_blank";
  text: string;
  options?: string[];
  points: number;
  lines?: number;
  correctIndex?: number;  // For multiple choice: 0-based index of correct answer
  correctAnswer?: string; // For short answer / fill blank (optional — teacher grading if missing)
}
interface Section { title: string; passage?: string; questions: Question[]; }
interface GeneratedAssignment {
  title: string; subject: string; grade: string;
  instructions: string; totalPoints: number; sections: Section[];
}

/* ── Paper Preview Component ─────────────────────────────────── */
function PaperPreview({ assignment, dk }: { assignment: GeneratedAssignment; dk: boolean }) {
  return (
    <div
      className="bg-white text-gray-900 rounded-2xl shadow-2xl overflow-hidden print:shadow-none"
      style={{ fontFamily: "'Georgia', serif", minHeight: 600 }}
    >
      {/* Header bar */}
      <div style={{ background: "linear-gradient(135deg, #7c3aed, #4f46e5)", padding: "16px 28px" }}>
        <div className="text-white font-bold text-lg tracking-wide">BlockForge — {assignment.subject}</div>
        <div className="text-violet-200 text-xs mt-0.5">{assignment.grade} Worksheet</div>
      </div>

      <div className="px-8 py-6">
        {/* Title */}
        <h1 className="text-2xl font-bold text-center mb-1 text-gray-900 tracking-tight">{assignment.title}</h1>
        <div className="text-center text-sm text-gray-500 mb-5">{assignment.totalPoints} Points Total</div>

        {/* Student info fields */}
        <div className="grid grid-cols-3 gap-4 mb-6 pb-5 border-b-2 border-gray-200">
          {["Name", "Date", "Class Period"].map((label) => (
            <div key={label}>
              <div className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">{label}</div>
              <div className="border-b-2 border-gray-400 h-7" />
            </div>
          ))}
        </div>

        {/* Instructions */}
        <div className="mb-6 p-3 bg-amber-50 border-l-4 border-amber-400 rounded-r-lg">
          <div className="text-xs font-bold text-amber-700 uppercase tracking-wider mb-1">Directions</div>
          <p className="text-sm text-gray-700 leading-relaxed">{assignment.instructions}</p>
        </div>

        {/* Sections */}
        {assignment.sections.map((section, si) => (
          <div key={si} className="mb-8">
            <div className="flex items-center gap-2 mb-4">
              <div className="h-0.5 flex-1 bg-gray-300" />
              <h2 className="text-sm font-extrabold text-gray-800 uppercase tracking-wider whitespace-nowrap px-2">{section.title}</h2>
              <div className="h-0.5 flex-1 bg-gray-300" />
            </div>

            {section.passage && (
              <div className="mb-4 p-4 bg-blue-50 border-l-4 border-blue-400 rounded-r-lg">
                <div className="text-xs font-bold text-blue-700 uppercase tracking-wider mb-2">📖 Read this passage</div>
                <p className="text-sm text-gray-800 leading-relaxed whitespace-pre-wrap">{section.passage}</p>
              </div>
            )}

            <div className="space-y-5">
              {section.questions.map((q, qi) => (
                <div key={qi} className="group">
                  <div className="flex gap-3 items-start">
                    <div className="w-7 h-7 rounded-full bg-violet-100 text-violet-700 font-bold text-sm flex items-center justify-center flex-shrink-0 mt-0.5">
                      {qi + 1}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-medium text-gray-800 leading-snug">{q.text}</p>
                        <span className="text-xs font-bold text-violet-600 bg-violet-50 px-1.5 py-0.5 rounded flex-shrink-0">
                          {q.points} pts
                        </span>
                      </div>

                      {q.type === "multiple_choice" && q.options && (
                        <div className="mt-2 grid grid-cols-2 gap-1.5">
                          {q.options.map((opt, oi) => (
                            <div key={oi} className="flex items-center gap-2">
                              <div className="w-4 h-4 rounded-full border-2 border-gray-400 flex-shrink-0" />
                              <span className="text-sm text-gray-700">{opt}</span>
                            </div>
                          ))}
                        </div>
                      )}

                      {q.type === "short_answer" && (
                        <div className="mt-2 space-y-2">
                          {Array.from({ length: q.lines || 3 }).map((_, li) => (
                            <div key={li} className="border-b border-gray-300 h-6" />
                          ))}
                        </div>
                      )}

                      {q.type === "fill_blank" && (
                        <div className="mt-1">
                          <div className="border-b-2 border-gray-400 w-32 inline-block" />
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}

        {/* Score box */}
        <div className="mt-8 pt-5 border-t-2 border-gray-300 flex items-center justify-end gap-4">
          <div className="text-sm font-bold text-gray-600">SCORE:</div>
          <div className="border-b-2 border-gray-400 w-16 h-7" />
          <div className="text-sm font-bold text-gray-600">/ {assignment.totalPoints}</div>
        </div>
      </div>
    </div>
  );
}

/* ── Helper: Check if answer is correct ────────────────────────── */
function isAnswerCorrect(question: Question, answer: string): boolean {
  if (!answer || !answer.trim()) return false;

  if (question.type === "multiple_choice" && question.options) {
    // Multiple choice: compare to correct option
    const ci = question.correctIndex;
    if (ci === undefined || ci === null) return false; // No answer key
    const correctOpt = question.options[ci as number];
    if (!correctOpt) return false;

    // Normalize: strip "A. ", "B. " etc for comparison
    const normalize = (s: string) => String(s || "").replace(/^[A-D]\.\s*/i, "").trim().toLowerCase();
    return normalize(answer) === normalize(correctOpt);
  }

  // Spelling dictation: extract word from "Spell the word: X" or "Spell: X"
  const spellingMatch = question.text?.match(/spell(?:\s+the\s+word)?[:\s]+(\S+)/i);
  if (spellingMatch) {
    const word = spellingMatch[1].replace(/[^a-zA-Z'-]/g, "");
    return answer.trim().toLowerCase() === word.toLowerCase();
  }

  // Short answer / fill blank: require matching correctAnswer (if provided)
  if (question.correctAnswer) {
    const normalize = (s: string) => String(s || "").trim().toLowerCase();
    return normalize(answer) === normalize(question.correctAnswer);
  }

  // No correctAnswer defined — teacher will grade manually
  // For UX, allow moving forward if they've typed something
  return answer.trim().length > 0;
}

/* ── Student Interactive Assignment View ─────────────────────── */
function StudentAssignmentView({ dk }: { dk: boolean }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [classes, setClasses] = useState<any[]>([]);
  const [assignment, setAssignment] = useState<any>(null);
  const [parsed, setParsed] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [loadingContent, setLoadingContent] = useState(false);
  const [ttsPassages, setTtsPassages] = useState(true);
  const [passageAudioState, setPassageAudioState] = useState<"idle"|"loading"|"playing">("idle");
  const passageAudioRef = React.useRef<HTMLAudioElement | null>(null);
  const passageSpeechRef = React.useRef<SpeechSynthesisUtterance | null>(null);
  const passageCtxRef = React.useRef<AudioContext | null>(null);
  const passageSourceRef = React.useRef<AudioBufferSourceNode | null>(null);
  const [currentQ, setCurrentQ] = useState(0);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [classId, setClassId] = useState<string | null>(null);
  const [todayList, setTodayList] = useState<any[]>([]);
  const [feedback, setFeedback] = useState<string>("");
  const [showNavModal, setShowNavModal] = useState(false);
  const [navTarget, setNavTarget] = useState(0);
  const [navCode, setNavCode] = useState("");
  const [navError, setNavError] = useState("");
  const [navLoading, setNavLoading] = useState(false);
  const currentBlock = useCurrentBlock(classId);

  const stopPassageAudio = React.useCallback(() => {
    passageAudioRef.current?.pause();
    passageAudioRef.current = null;
    window.speechSynthesis?.cancel();
    passageSpeechRef.current = null;
    setPassageAudioState("idle");
  }, []);

  // Flatten all questions — normalise field names across content formats
  const allQuestions: Array<{ q: any; sectionTitle: string; passage?: string }> = parsed
    ? parsed.sections?.flatMap((s: any) =>
        (s.questions ?? s.q ?? []).map((raw: any) => ({
          // Normalise: prompt→text, answer→correctAnswer, o→options, c→correctIndex
          q: {
            ...raw,
            text: raw.text ?? raw.prompt ?? "",
            type: raw.type ?? (raw.options || raw.o ? "multiple_choice" : "short_answer"),
            options: raw.options ?? (raw.o ? raw.o : undefined),
            correctIndex: raw.correctIndex ?? raw.c ?? undefined,
            correctAnswer: raw.correctAnswer ?? raw.answer ?? undefined,
          },
          sectionTitle: s.title,
          passage: s.passage,
        }))
      ) ?? []
    : [];
  const total = allQuestions.length;
  const q = allQuestions[currentQ];

  useEffect(() => {
    (async () => {
      try {
        const [clsList, settings] = await Promise.all([
          api.getClasses(),
          fetch(`${(import.meta as any)?.env?.VITE_API_BASE || (window.location.hostname === "localhost" ? "http://localhost:4000/api" : "https://scratch-classroom-api-td1x.vercel.app/api")}/admin-settings`).then(r => r.json()).catch(() => ({})),
        ]);
        setClasses(clsList);
        setClassId(clsList?.[0]?.id ?? null);
        if (settings?.tts_passages_allowed === "false") setTtsPassages(false);
      } catch {}
    })();
  }, []);

  // Read the ?id= ONCE on mount. Students who opened a specific assignment
  // stay on it even when the schedule block transitions mid-work.
  const explicitId = useMemo(() => new URLSearchParams(window.location.search).get("id"), []);

  useEffect(() => {
    // If we're already showing the requested assignment (or the student is
    // working on any loaded assignment), do NOT re-run the loader. Block
    // boundary transitions used to re-enter this effect and wipe state,
    // dumping the student back to the list/placeholder mid-answer.
    if (assignment) return;
    const load = async () => {
      setLoading(true);
      try {
        // Explicit ?id=<uuid> wins — student picked a specific assignment.
        if (explicitId) {
          try {
            const a = await api.getAssignment(explicitId);
            if (a) {
              setAssignment(a);
              if (a.content) { try { setParsed(JSON.parse(a.content)); } catch {} }
              setLoading(false);
              return;
            }
          } catch {}
        }
        // No id → ask the server for THIS student's pending assignments.
        // The /pending endpoint already honors target_student_ids, student_id,
        // grade levels, paper-only flag, and de-dupes already-submitted ones.
        // Client-side filtering would re-implement that (badly) and show work
        // meant for other students.
        const cls = classes.length ? classes : await api.getClasses();
        if (!classes.length) setClasses(cls);
        const today = new Date().toISOString().slice(0, 10);

        const results = await Promise.all(cls.map((c: any) => api.getPendingAssignments(c.id).catch(() => [])));
        // Server already filters to today — just flatten
        const final = (results as any[][]).flat();
        setTodayList(final);
      } catch {}
      setLoading(false);
    };
    load();
  }, [classId, user?.id, explicitId, assignment]);

  const handleSelect = (value: string) => {
    setAnswers((prev) => ({ ...prev, [currentQ]: value }));
  };

  const handleNext = () => {
    if (currentQ < total - 1) {
      // Check if current answer is correct before advancing
      const q = allQuestions[currentQ]?.q;
      const currentAnswer = answers[currentQ] ?? "";

      if (!isAnswerCorrect(q, currentAnswer)) {
        // Answer is wrong or unanswered — show feedback
        if (!currentAnswer || !currentAnswer.trim()) {
          setFeedback("Please answer the question before continuing.");
        } else {
          setFeedback("That answer is not quite right. Try again!");
        }
        // Clear feedback after 3 seconds
        setTimeout(() => setFeedback(""), 3000);
        return;
      }

      // Answer is correct — clear feedback and advance
      setFeedback("");
      setCurrentQ(currentQ + 1);
      stopPassageAudio();
    }
  };

  const handlePrev = () => {
    if (currentQ > 0) setCurrentQ(currentQ - 1);
  };

  const handleSubmit = async () => {
    if (!assignment) return;
    setSubmitting(true);
    const submittedId = assignment.id;
    try {
      await api.submitAssignmentWithAnswers(submittedId, answers);
    } catch {}
    setSubmitting(false);

    // Check if there are more assignments to do before showing "All done"
    let remaining = todayList.filter((a: any) => a.id !== submittedId);
    if (remaining.length === 0) {
      // Re-fetch in case todayList was stale
      try {
        const cls = classes.length ? classes : await api.getClasses();
        const results = await Promise.all(cls.map((c: any) => api.getPendingAssignments(c.id).catch(() => [])));
        remaining = (results as any[][]).flat().filter((a: any) => a.id !== submittedId);
      } catch {}
    }

    if (remaining.length > 0) {
      const next = remaining[0];
      setTodayList(remaining);
      setAssignment(next);
      setParsed(next.content ? (() => { try { return JSON.parse(next.content); } catch { return null; } })() : null);
      setAnswers({});
      setCurrentQ(0);
      setFeedback("");
    } else {
      setSubmitted(true);
    }
  };

  const today = new Date();
  const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const todayName = dayNames[today.getDay()];

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center space-y-4 animate-page-enter">
        <div className="text-7xl animate-bounce">🌟</div>
        <h2 className={`text-2xl font-extrabold ${dk ? "text-white" : "text-gray-900"}`}>All done for today!</h2>
        <p className={`text-sm ${dk ? "text-white/50" : "text-gray-500"}`}>Great work! Come back tomorrow for your next assignment.</p>
        <div className="flex gap-2 mt-4">
          {[..."🎉✨🌈⭐💫"].map((e, i) => (
            <span key={i} className="text-2xl animate-bounce" style={{ animationDelay: `${i * 100}ms` }}>{e}</span>
          ))}
        </div>
      </div>
    );
  }

  // PDF-only assignment (TPT import / manual upload) — no questions, just the doc
  if (assignment && assignment.attached_pdf_path && (!parsed || allQuestions.length === 0)) {
    return (
      <div className="max-w-3xl mx-auto space-y-4">
        <div>
          <div className={`text-xs font-bold uppercase tracking-widest mb-1 ${dk ? "text-violet-400" : "text-violet-600"}`}>
            📅 {todayName}'s Assignment
          </div>
          <h1 className={`text-xl font-extrabold ${dk ? "text-white" : "text-gray-900"}`}>{assignment.title}</h1>
          {assignment.description && (
            <p className={`text-sm mt-1 ${dk ? "text-white/60" : "text-gray-600"}`}>{assignment.description}</p>
          )}
          {assignment.source && (
            <span className="inline-block mt-2 px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider"
              style={{ background: "rgba(99,102,241,0.15)", color: "var(--accent)" }}>
              📄 PDF · {assignment.source === "tpt" ? "from TPT" : "uploaded"}
            </span>
          )}
        </div>
        <div className="card p-2" style={{ borderLeft: "3px solid var(--accent)" }}>
          <iframe
            src={assignment.attached_pdf_path}
            title={assignment.title}
            style={{ width: "100%", height: "75vh", border: "none", borderRadius: 8, background: dk ? "#0a0a0f" : "#fff" }}
          />
          <a href={assignment.attached_pdf_path} target="_blank" rel="noreferrer"
            className="text-xs mt-2 inline-block underline" style={{ color: "var(--accent)" }}>
            Open PDF in new tab
          </a>
        </div>
      </div>
    );
  }

  if (!assignment) {
    // No specific assignment selected — render the full list of today's work.
    const SUBJECT_META: Record<string, { emoji: string; grad: string; glow: string; accent: string }> = {
      reading:  { emoji: "📖", grad: "linear-gradient(135deg,#7c3aed,#4f46e5)", glow: "rgba(124,58,237,0.5)",  accent: "#c4b5fd" },
      math:     { emoji: "🔢", grad: "linear-gradient(135deg,#0ea5e9,#0284c7)", glow: "rgba(14,165,233,0.5)",  accent: "#7dd3fc" },
      writing:  { emoji: "✏️", grad: "linear-gradient(135deg,#10b981,#059669)", glow: "rgba(16,185,129,0.5)",  accent: "#6ee7b7" },
      sel:      { emoji: "💛", grad: "linear-gradient(135deg,#f59e0b,#d97706)", glow: "rgba(245,158,11,0.5)",  accent: "#fcd34d" },
      spelling: { emoji: "🔤", grad: "linear-gradient(135deg,#06b6d4,#0891b2)", glow: "rgba(6,182,212,0.5)",   accent: "#67e8f9" },
      science:  { emoji: "🔬", grad: "linear-gradient(135deg,#ec4899,#db2777)", glow: "rgba(236,72,153,0.5)",  accent: "#f9a8d4" },
    };
    const DEFAULT_META = { emoji: "📚", grad: "linear-gradient(135deg,#8b5cf6,#7c3aed)", glow: "rgba(139,92,246,0.5)", accent: "#c4b5fd" };

    if (todayList.length === 0) {
      return (
        <div style={{ minHeight: "100dvh", background: "linear-gradient(135deg,#0f0826,#0a0b1e)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 32 }}>
          <div style={{ fontSize: 64, marginBottom: 16 }}>🎉</div>
          <h2 style={{ fontSize: 24, fontWeight: 900, color: "white", margin: "0 0 8px" }}>All done for today!</h2>
          <p style={{ fontSize: 15, color: "rgba(255,255,255,0.4)", textAlign: "center" }}>
            {classes.length === 0 ? "Join a class to receive assignments." : "No new assignments — check back with your teacher."}
          </p>
        </div>
      );
    }

    return (
      <div style={{
        minHeight: "100dvh",
        background: "linear-gradient(160deg,#0f0826 0%,#0a0b1e 60%,#0c1030 100%)",
        fontFamily: "'Baloo 2','Inter',system-ui,sans-serif",
        padding: "0 0 60px",
      }}>
        <style>{`
          @keyframes abPop { from { opacity:0; transform: translateY(22px) scale(.95); } to { opacity:1; transform: none; } }
          @keyframes abGlow { 0%,100% { opacity:.7 } 50% { opacity:1 } }
          .ab-card:active { transform: scale(.97) !important; }
        `}</style>

        {/* Hero header */}
        <div style={{ padding: "28px 24px 0", maxWidth: 640, margin: "0 auto" }}>
          <button
            onClick={() => navigate(-1)}
            style={{
              background: "rgba(6,182,212,0.18)",
              color: "#67e8f9",
              border: "none",
              borderRadius: 14,
              padding: "10px 22px",
              fontWeight: 700,
              fontSize: 15,
              boxShadow: "0 2px 10px rgba(6,182,212,0.12)",
              cursor: "pointer",
              marginBottom: 20,
              display: "inline-block",
            }}
            aria-label="Back"
          >
            ← Back
          </button>
        </div>
        <div style={{ padding: "0 24px 32px", maxWidth: 640, margin: "0 auto" }}>
          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.18em", textTransform: "uppercase", color: "#a78bfa", marginBottom: 10, display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 16 }}>📅</span> {todayName.toUpperCase()}'S ASSIGNMENTS
          </div>
          <h1 style={{ fontSize: 34, fontWeight: 900, color: "#fff", margin: "0 0 6px", lineHeight: 1.15 }}>
            What are you<br />working on today?
          </h1>
          <p style={{ fontSize: 14, color: "rgba(255,255,255,0.38)", margin: 0 }}>
            {todayList.length} assignment{todayList.length !== 1 ? "s" : ""} ready for you
          </p>
        </div>

        {/* Cards */}
        <div style={{ maxWidth: 640, margin: "0 auto", padding: "0 16px", display: "flex", flexDirection: "column", gap: 14 }}>
          {todayList.map((a, i) => {
            const subjectKey = (a.target_subject || "").toLowerCase();
            const meta = SUBJECT_META[subjectKey] || DEFAULT_META;
            return (
              <button
                key={a.id}
                className="ab-card"
                onClick={async () => {
                  if (a.content) {
                    // Content already present (e.g. explicit ?id= fetch)
                    setAssignment(a);
                    try { setParsed(JSON.parse(a.content)); } catch {}
                  } else {
                    // Content stripped from list for perf — fetch before navigating
                    setLoadingContent(true);
                    try {
                      const full = await api.getAssignment(a.id);
                      const content = full?.content ?? null;
                      const p = content ? (() => { try { return JSON.parse(content); } catch { return null; } })() : null;
                      // Set both atomically so we never render "no questions"
                      setParsed(p);
                      setAssignment({ ...a, content });
                    } catch {
                      setAssignment(a); // show assignment even if fetch failed
                    }
                    setLoadingContent(false);
                  }
                  stopPassageAudio();
                }}
                style={{
                  display: "flex", alignItems: "center", gap: 18,
                  width: "100%", textAlign: "left", cursor: "pointer",
                  background: "rgba(255,255,255,0.055)",
                  border: "1px solid rgba(255,255,255,0.1)",
                  borderRadius: 22,
                  padding: "18px 20px",
                  transition: "transform .15s, box-shadow .15s, border-color .15s",
                  animation: `abPop .45s ease both`,
                  animationDelay: `${i * 70}ms`,
                  boxShadow: "none",
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.transform = "translateY(-3px)";
                  e.currentTarget.style.boxShadow = `0 16px 40px ${meta.glow}`;
                  e.currentTarget.style.borderColor = meta.accent + "55";
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.transform = "";
                  e.currentTarget.style.boxShadow = "none";
                  e.currentTarget.style.borderColor = "rgba(255,255,255,0.1)";
                }}
              >
                {/* Icon circle */}
                <div style={{
                  width: 58, height: 58, borderRadius: 18, flexShrink: 0,
                  background: meta.grad,
                  boxShadow: `0 8px 24px ${meta.glow}`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 26,
                }}>
                  {meta.emoji}
                </div>

                {/* Text */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 17, fontWeight: 800, color: "#fff", lineHeight: 1.2, marginBottom: 5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {a.title}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{
                      fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em",
                      color: meta.accent,
                      background: meta.accent + "18",
                      border: `1px solid ${meta.accent}30`,
                      borderRadius: 6, padding: "2px 8px",
                    }}>
                      {a.target_subject || "Assignment"}
                    </span>
                    {a.target_grade_min != null && (
                      <span style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", fontWeight: 600 }}>
                        Grade {a.target_grade_min === 0 ? "K" : a.target_grade_min}
                      </span>
                    )}
                  </div>
                </div>

                {/* Arrow */}
                <div style={{
                  width: 38, height: 38, borderRadius: 12, flexShrink: 0,
                  background: meta.accent + "18",
                  border: `1px solid ${meta.accent}30`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  color: meta.accent, fontSize: 18, fontWeight: 700,
                }}>
                  →
                </div>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  if (loadingContent) {
    return (
      <div style={{ minHeight: "60vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16 }}>
        <div style={{ width: 40, height: 40, border: "3px solid rgba(124,58,237,0.3)", borderTopColor: "#7c3aed", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
        <p style={{ color: "rgba(255,255,255,0.45)", fontSize: 14 }}>Loading assignment…</p>
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </div>
    );
  }

  if (!parsed || allQuestions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center space-y-3">
        <div className="text-6xl">🎉</div>
        <h2 className={`text-xl font-bold ${dk ? "text-white" : "text-gray-900"}`}>All set!</h2>
        <p className={`text-sm ${dk ? "text-white/40" : "text-gray-500"}`}>This assignment has no questions configured yet.</p>
      </div>
    );
  }

  const progress = total > 0 ? ((currentQ + 1) / total) * 100 : 0;
  const currentAnswer = answers[currentQ] ?? "";
  const subjectKey = (assignment.target_subject || "").toLowerCase();
  const SUBJ_ACCENT: Record<string, string> = {
    reading: "#c4b5fd", math: "#7dd3fc", writing: "#6ee7b7",
    sel: "#fcd34d", spelling: "#67e8f9", science: "#f9a8d4",
  };
  const accent = SUBJ_ACCENT[subjectKey] || "#c4b5fd";
  const accentGrad: Record<string, string> = {
    reading: "linear-gradient(135deg,#7c3aed,#4f46e5)",
    math: "linear-gradient(135deg,#0ea5e9,#0284c7)",
    writing: "linear-gradient(135deg,#10b981,#059669)",
    sel: "linear-gradient(135deg,#f59e0b,#d97706)",
    spelling: "linear-gradient(135deg,#06b6d4,#0891b2)",
    science: "linear-gradient(135deg,#ec4899,#db2777)",
  };
  const grad = accentGrad[subjectKey] || "linear-gradient(135deg,#8b5cf6,#6d28d9)";

  const apiBase = (import.meta as any)?.env?.VITE_API_BASE ||
    (window.location.hostname === "localhost" ? "http://localhost:4000/api" : "https://scratch-classroom-api-td1x.vercel.app/api");

  const handleNavJump = async () => {
    if (!navCode.trim()) return;
    setNavLoading(true);
    setNavError("");
    try {
      const token = localStorage.getItem("token") || "";
      const r = await fetch(`${apiBase}/admin-settings/check-skip-code?code=${encodeURIComponent(navCode.trim())}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const data = await r.json();
      if (data.valid) {
        setCurrentQ(navTarget);
        setShowNavModal(false);
        setNavCode("");
      } else {
        setNavError("Incorrect code. Try again.");
      }
    } catch {
      setNavError("Could not verify. Check connection.");
    } finally {
      setNavLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: "100dvh",
      background: "linear-gradient(160deg,#0f0826 0%,#0a0b1e 60%,#0c1030 100%)",
      fontFamily: "'Baloo 2','Inter',system-ui,sans-serif",
      display: "flex", flexDirection: "column",
    }}>
      <style>{`@keyframes wsPop { from{opacity:0;transform:translateY(18px) scale(.97)} to{opacity:1;transform:none} }`}</style>

      {/* Top bar */}
      <div style={{ padding: "16px 20px 0", display: "flex", alignItems: "center", gap: 12, maxWidth: 680, margin: "0 auto", width: "100%" }}>
        <button
          onClick={() => setAssignment(null)}
          style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 10, color: "rgba(255,255,255,0.55)", fontSize: 13, fontWeight: 600, padding: "6px 14px", cursor: "pointer" }}
        >
          ← Back
        </button>
        <div style={{ flex: 1 }} />
        <div style={{ fontSize: 12, color: "rgba(255,255,255,0.35)", fontWeight: 600 }}>
          {currentQ + 1} / {total}
        </div>
      </div>

      {/* Progress bar */}
      <div style={{ padding: "12px 20px 0", maxWidth: 680, margin: "0 auto", width: "100%" }}>
        <div style={{ height: 6, borderRadius: 99, background: "rgba(255,255,255,0.08)", overflow: "hidden" }}>
          <div style={{ height: "100%", borderRadius: 99, background: grad, width: `${progress}%`, transition: "width .5s ease" }} />
        </div>
      </div>

      {/* Assignment title strip */}
      <div style={{ padding: "16px 20px 0", maxWidth: 680, margin: "0 auto", width: "100%" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.12em", color: accent }}>
            {assignment.target_subject || "Assignment"}
          </span>
          <span style={{ fontSize: 11, color: "rgba(255,255,255,0.2)" }}>·</span>
          <span style={{ fontSize: 14, fontWeight: 700, color: "white", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {assignment.title}
          </span>
        </div>
      </div>

      {/* Question dot nav — requires passcode to jump */}
      <div style={{ padding: "14px 20px 0", maxWidth: 680, margin: "0 auto", width: "100%", display: "flex", gap: 6, flexWrap: "wrap" }}>
        {allQuestions.map((_, i) => (
          <button
            key={i}
            onClick={() => { if (i !== currentQ) { setNavTarget(i); setNavCode(""); setNavError(""); setShowNavModal(true); } }}
            style={{
              height: 8, width: i === currentQ ? 24 : 8,
              borderRadius: 99, border: "none", cursor: i !== currentQ ? "pointer" : "default",
              background: i === currentQ ? accent : answers[i] !== undefined ? "#34d399" : "rgba(255,255,255,0.15)",
              transition: "all .2s",
            }}
          />
        ))}
      </div>

      {/* Question card */}
      <div style={{ flex: 1, padding: "18px 20px 32px", maxWidth: 680, margin: "0 auto", width: "100%" }}>
        {q && (
          <div style={{ animation: "wsPop .35s ease both" }} key={currentQ}>

            {/* Passage block */}
            {q.passage && (
              <div style={{
                background: "linear-gradient(135deg,#1e1b2e 0%,#16132a 100%)",
                border: `1px solid ${accent}33`, borderLeft: `3px solid ${accent}`,
                borderRadius: 16, padding: "16px 18px", marginBottom: 16,
              }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                  <div style={{ fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.12em", color: accent }}>📖 Read this first</div>
                  {ttsPassages && (
                    <button
                      onClick={() => {
                        if (passageAudioState === "playing") { stopPassageAudio(); return; }
                        // iOS audio unlock: calling play() synchronously on a new Audio element
                        // associates it with the user gesture. Later play() calls on the SAME
                        // element work even from async contexts (fetch callbacks).
                        const audioEl = new Audio();
                        audioEl.play().catch(() => {}); // intentionally fails (no src yet) — just unlocks
                        passageAudioRef.current = audioEl;
                        // Browser TTS immediately as synchronous fallback (works on all devices)
                        window.speechSynthesis?.cancel();
                        const uPassage = new SpeechSynthesisUtterance(q.passage || "");
                        uPassage.rate = 0.85; uPassage.lang = "en-US";
                        uPassage.onend = () => { passageSpeechRef.current = null; setPassageAudioState("idle"); };
                        passageSpeechRef.current = uPassage;
                        window.speechSynthesis?.speak(uPassage);
                        setPassageAudioState("playing");
                        // Fetch ElevenLabs and play via the already-unlocked Audio element
                        const apiBase = (import.meta as any)?.env?.VITE_API_BASE ||
                          (window.location.hostname === "localhost" ? "http://localhost:4000/api" : "https://scratch-classroom-api-td1x.vercel.app/api");
                        const token = localStorage.getItem("token");
                        fetch(`${apiBase}/ai/tts`, {
                          method: "POST",
                          headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
                          body: JSON.stringify({ text: q.passage, mode: "passage" }),
                        })
                          .then(r => r.ok ? r.blob() : Promise.reject())
                          .then(blob => {
                            window.speechSynthesis?.cancel();
                            passageSpeechRef.current = null;
                            const url = URL.createObjectURL(blob);
                            audioEl.onended = () => { URL.revokeObjectURL(url); passageAudioRef.current = null; setPassageAudioState("idle"); };
                            audioEl.onerror = () => { passageAudioRef.current = null; setPassageAudioState("idle"); };
                            audioEl.src = url;
                            audioEl.load();
                            return audioEl.play();
                          })
                          .catch(() => { /* browser TTS keeps playing as fallback */ });
                      }}
                      style={{
                        display: "flex", alignItems: "center", gap: 6,
                        padding: "5px 14px", borderRadius: 20, border: `1px solid ${accent}55`,
                        background: passageAudioState === "playing" ? `${accent}30` : `${accent}18`,
                        color: accent, fontSize: 11, fontWeight: 700, cursor: "pointer",
                      }}
                    >
                      {passageAudioState === "playing" ? "⏸ Stop" : "🎧 Listen"}
                    </button>
                  )}
                </div>
                <p style={{ fontSize: 14, lineHeight: 1.7, color: "rgba(255,255,255,0.8)", margin: 0, whiteSpace: "pre-wrap" }}>{q.passage}</p>
              </div>
            )}

            {/* Question text */}
            <div style={{
              background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: 20, padding: "22px 22px 20px",
              boxShadow: `0 8px 32px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,255,255,0.05)`,
            }}>
              {(() => {
                const isSpelling = (assignment.target_subject || "").toLowerCase() === "spelling";
                // Extract the word from "Spell the word: cake" or "Spell: cake"
                const spellingMatch = isSpelling && q.q.text.match(/spell(?:\s+the\s+word)?[:\s]+(\S+)/i);
                const spellingWord = spellingMatch ? spellingMatch[1].replace(/[^a-zA-Z'-]/g, "") : null;
                return isSpelling && spellingWord ? (
                  <div style={{ textAlign: "center", margin: "0 0 20px" }}>
                    <p style={{ fontSize: 16, fontWeight: 600, color: "rgba(255,255,255,0.6)", margin: "0 0 14px" }}>Listen and spell the word:</p>
                    <button
                      onClick={() => {
                        const API_BASE = (import.meta as any)?.env?.VITE_API_BASE ||
                          (window.location.hostname === "localhost" ? "http://localhost:4000/api" : "https://scratch-classroom-api-td1x.vercel.app/api");
                        const token = localStorage.getItem("token");
                        // iOS audio unlock: calling play() synchronously associates this Audio
                        // element with the user gesture so later play() calls work from async contexts
                        const audioEl = new Audio();
                        audioEl.play().catch(() => {}); // intentionally fails (no src) — just unlocks
                        // Browser TTS immediately as synchronous fallback
                        window.speechSynthesis?.cancel();
                        const u = new SpeechSynthesisUtterance(spellingWord || "");
                        u.rate = 0.75; u.lang = "en-US";
                        window.speechSynthesis?.speak(u);
                        // Fetch ElevenLabs and play via the already-unlocked Audio element
                        fetch(`${API_BASE}/ai/tts`, {
                          method: "POST",
                          headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
                          body: JSON.stringify({ text: spellingWord }),
                        })
                          .then(r => r.ok ? r.blob() : Promise.reject())
                          .then(blob => {
                            window.speechSynthesis?.cancel(); // switch to ElevenLabs
                            const url = URL.createObjectURL(blob);
                            audioEl.onended = () => URL.revokeObjectURL(url);
                            audioEl.src = url;
                            audioEl.load();
                            return audioEl.play();
                          })
                          .catch(() => { /* browser TTS keeps playing as fallback */ });
                      }}
                      style={{ background: accent + "22", border: `2px solid ${accent}`, borderRadius: 16, padding: "18px 36px", cursor: "pointer", color: "white", fontSize: 28 }}
                    >
                      🔊 Hear the word
                    </button>
                  </div>
                ) : (
                  <p style={{ fontSize: 18, fontWeight: 700, color: "white", lineHeight: 1.5, margin: "0 0 20px", whiteSpace: "pre-wrap" }}>
                    {q.q.text}
                  </p>
                );
              })()}

              {/* Multiple choice */}
              {(q.q.type === "multiple_choice" || q.q.type === "mc") && (q.q.options || q.q.o) && (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {(q.q.options || q.q.o).map((opt: string, oi: number) => {
                    const isSelected = currentAnswer === opt || currentAnswer === String(oi);
                    return (
                      <button
                        key={oi}
                        onClick={() => handleSelect(opt)}
                        style={{
                          display: "flex", alignItems: "center", gap: 14,
                          width: "100%", textAlign: "left", cursor: "pointer",
                          padding: "14px 16px", borderRadius: 14,
                          border: `2px solid ${isSelected ? accent : "rgba(255,255,255,0.1)"}`,
                          background: isSelected ? accent + "20" : "rgba(255,255,255,0.03)",
                          transition: "all .15s", color: isSelected ? accent : "rgba(255,255,255,0.75)",
                          fontWeight: isSelected ? 700 : 500, fontSize: 15,
                        }}
                        onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = "rgba(255,255,255,0.07)"; }}
                        onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = "rgba(255,255,255,0.03)"; }}
                      >
                        <span style={{
                          width: 30, height: 30, borderRadius: "50%", flexShrink: 0,
                          border: `2px solid ${isSelected ? accent : "rgba(255,255,255,0.2)"}`,
                          background: isSelected ? accent : "transparent",
                          display: "flex", alignItems: "center", justifyContent: "center",
                          fontSize: 12, fontWeight: 800, color: isSelected ? "#0f0826" : "rgba(255,255,255,0.4)",
                        }}>
                          {isSelected ? "✓" : String.fromCharCode(65 + oi)}
                        </span>
                        {opt.replace(/^[A-D]\.\s*/, "")}
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Short answer / fill blank */}
              {(q.q.type === "short_answer" || q.q.type === "sa" || q.q.type === "fill_blank") && (
                <textarea
                  value={currentAnswer}
                  onChange={e => handleSelect(e.target.value)}
                  placeholder="Write your answer here…"
                  rows={q.q.type === "short_answer" || q.q.type === "sa" ? (q.q.lines || 3) : 1}
                  style={{
                    width: "100%", padding: "12px 14px", borderRadius: 12, fontSize: 15,
                    background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.15)",
                    color: "white", resize: "none", fontFamily: "inherit", outline: "none",
                    boxSizing: "border-box",
                  }}
                />
              )}
            </div>

            {/* Feedback */}
            {feedback && (
              <div style={{
                marginTop: 12, padding: "12px 16px", borderRadius: 12, fontSize: 13, fontWeight: 600,
                background: feedback.includes("not quite") ? "rgba(239,68,68,0.15)" : "rgba(245,158,11,0.15)",
                border: `1px solid ${feedback.includes("not quite") ? "rgba(239,68,68,0.3)" : "rgba(245,158,11,0.3)"}`,
                color: feedback.includes("not quite") ? "#fca5a5" : "#fcd34d",
              }}>
                {feedback}
              </div>
            )}

            {/* Nav buttons */}
            <div style={{ display: "flex", gap: 12, marginTop: 20 }}>
              <button
                onClick={handlePrev}
                disabled={currentQ === 0}
                style={{
                  flex: "0 0 auto", padding: "14px 22px", borderRadius: 14, fontSize: 15, fontWeight: 600,
                  background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)",
                  color: "rgba(255,255,255,0.5)", cursor: currentQ === 0 ? "not-allowed" : "pointer",
                  opacity: currentQ === 0 ? 0.35 : 1,
                }}
              >
                ← Back
              </button>
              {currentQ < total - 1 ? (
                <button
                  onClick={handleNext}
                  style={{
                    flex: 1, padding: "14px 22px", borderRadius: 14, fontSize: 16, fontWeight: 800,
                    background: grad, color: "white", border: "none", cursor: "pointer",
                    boxShadow: `0 8px 24px ${accent}40`,
                  }}
                >
                  Next →
                </button>
              ) : (
                <button
                  onClick={handleSubmit}
                  disabled={submitting}
                  style={{
                    flex: 1, padding: "14px 22px", borderRadius: 14, fontSize: 16, fontWeight: 800,
                    background: "linear-gradient(135deg,#10b981,#059669)", color: "white", border: "none", cursor: "pointer",
                    boxShadow: "0 8px 24px rgba(16,185,129,0.4)", opacity: submitting ? 0.7 : 1,
                  }}
                >
                  {submitting ? "Submitting…" : "Submit ✓"}
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Nav jump modal */}
      {showNavModal && (
        <div
          style={{ position: "fixed", inset: 0, zIndex: 9000, background: "rgba(0,0,0,0.6)", backdropFilter: "blur(6px)", display: "flex", alignItems: "center", justifyContent: "center" }}
          onClick={e => { if (e.target === e.currentTarget) { setShowNavModal(false); setNavCode(""); setNavError(""); } }}
        >
          <div style={{ background: "white", borderRadius: 20, padding: 28, width: "min(360px, 90vw)", boxShadow: "0 24px 64px rgba(0,0,0,0.4)" }}>
            <div style={{ fontSize: 20, marginBottom: 4 }}>🔒</div>
            <div style={{ fontSize: 16, fontWeight: 800, color: "#1e1b4b", marginBottom: 4 }}>Jump to Question {navTarget + 1}?</div>
            <div style={{ fontSize: 12, color: "rgba(0,0,0,0.45)", marginBottom: 20 }}>Enter the teacher passcode to navigate to a different question.</div>
            <input
              autoFocus
              type="password"
              inputMode="numeric"
              value={navCode}
              onChange={e => { setNavCode(e.target.value); setNavError(""); }}
              onKeyDown={e => e.key === "Enter" && handleNavJump()}
              placeholder="Enter passcode…"
              style={{ width: "100%", boxSizing: "border-box", padding: "12px 14px", fontSize: 18, letterSpacing: "0.2em", borderRadius: 12, border: navError ? "1.5px solid #ef4444" : "1.5px solid rgba(0,0,0,0.15)", outline: "none", marginBottom: navError ? 8 : 16, textAlign: "center" }}
            />
            {navError && <div style={{ fontSize: 12, color: "#ef4444", marginBottom: 14, textAlign: "center" }}>{navError}</div>}
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => { setShowNavModal(false); setNavCode(""); setNavError(""); }} style={{ flex: 1, padding: "11px 0", borderRadius: 12, border: "1px solid rgba(0,0,0,0.12)", background: "transparent", fontSize: 14, cursor: "pointer", color: "rgba(0,0,0,0.5)" }}>Cancel</button>
              <button onClick={handleNavJump} disabled={navLoading || !navCode.trim()} style={{ flex: 2, padding: "11px 0", borderRadius: 12, border: "none", background: "linear-gradient(135deg,#7c3aed,#6366f1)", color: "white", fontSize: 14, fontWeight: 700, cursor: navLoading || !navCode.trim() ? "default" : "pointer", opacity: navLoading || !navCode.trim() ? 0.5 : 1 }}>{navLoading ? "Checking…" : "Go to Question"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Main Component ──────────────────────────────────────────── */
export default function AssignmentBuilder() {
  const { user } = useAuth();
  const { theme } = useTheme();
  const dk = theme === "dark";

  const [classes, setClasses] = useState<any[]>([]);
  const [assignments, setAssignments] = useState<any[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [debugAssignmentId, setDebugAssignmentId] = useState<string | null>(null);
  const [debugData, setDebugData] = useState<any>(null);
  const [debugLoading, setDebugLoading] = useState(false);
  const [studentCheck, setStudentCheck] = useState<any[] | null>(null);
  const [studentCheckLoading, setStudentCheckLoading] = useState(false);
  const [genTodayLoading, setGenTodayLoading] = useState(false);

  // Form state
  const [classId, setClassId] = useState("");
  const [title, setTitle] = useState("");
  const [subject, setSubject] = useState("Reading");
  const [grade, setGrade] = useState("3rd Grade");
  const [instructions, setInstructions] = useState("");
  const [dueDate, setDueDate] = useState("");

  // Per-assignment grade targeting
  const [targetMode, setTargetMode] = useState<"all" | "single" | "range" | "students" | "auto">("all");
  const [targetGradeMin, setTargetGradeMin] = useState<number>(3);
  const [targetGradeMax, setTargetGradeMax] = useState<number>(3);
  const [targetSubject, setTargetSubject] = useState<"reading" | "math" | "writing">("reading");
  // Direct-assign: roster of students in the selected class + the checked set.
  const [classStudents, setClassStudents] = useState<any[]>([]);
  const [targetStudentIds, setTargetStudentIds] = useState<string[]>([]);
  // Group / center assignment — picked members become the group.
  const [isGroup, setIsGroup] = useState<boolean>(false);
  const [groupName, setGroupName] = useState<string>("");

  // Rich customization (Feature 28 — same fields as Edit modal)
  const [customQuestionCount, setCustomQuestionCount] = useState<number | "">("");
  const [customEstimatedMinutes, setCustomEstimatedMinutes] = useState<number | "">("");
  const [customQuestionType, setCustomQuestionType] = useState<string>("");
  const [customHintsAllowed, setCustomHintsAllowed] = useState<boolean>(true);
  const [customLearningObjective, setCustomLearningObjective] = useState<string>("");
  const [customFocusKeywords, setCustomFocusKeywords] = useState<string>("");
  const [customTeacherNotes, setCustomTeacherNotes] = useState<string>("");
  const [showAdvanced, setShowAdvanced] = useState<boolean>(false);

  // AI generation state
  const [generating, setGenerating] = useState(false);
  const [generated, setGenerated] = useState<GeneratedAssignment | null>(null);
  const [genError, setGenError] = useState("");
  const [genPassage, setGenPassage] = useState("");

  // Video → assignment state
  const [videoUrl, setVideoUrl] = useState("");
  const [videoGenerating, setVideoGenerating] = useState(false);
  const [videoGenError, setVideoGenError] = useState("");
  const [videoGenNote, setVideoGenNote] = useState(""); // e.g. "no captions available"
  const [videoQuestionCount, setVideoQuestionCount] = useState<number>(6);

  // PDF → assignment import state
  const [pdfParsing, setPdfParsing] = useState(false);
  const [pdfErr, setPdfErr] = useState<string | null>(null);
  const [pdfSourceAssignmentId, setPdfSourceAssignmentId] = useState<string | null>(null);

  // Expanded assignment preview
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showFullWeek, setShowFullWeek] = useState(false);
  const [fullWeekSubjects, setFullWeekSubjects] = useState<Record<string, boolean>>({
    reading: true, writing: true, spelling: true, vocabulary: true, math: true, science: true, history: true, sel: true,
  });
  const [fullWeekThemes, setFullWeekThemes] = useState<Record<string, string>>({});
  const [fullWeekDifficulty, setFullWeekDifficulty] = useState<"match"|"easier"|"harder">("match");
  const [fullWeekVariety, setFullWeekVariety] = useState<"low"|"medium"|"high">("medium");
  const [fullWeekStart, setFullWeekStart] = useState<string>("");
  const [fullWeekGenerating, setFullWeekGenerating] = useState(false);
  const [fullWeekResult, setFullWeekResult] = useState<any>(null);
  // Real-time progress
  const [fwProgress, setFwProgress] = useState<{ done: number; failed: number; total: number; current?: string; elapsed: number }>({ done: 0, failed: 0, total: 0, elapsed: 0 });
  const fwCancelRef = useRef<{ cancelled: boolean }>({ cancelled: false });
  // Live per-slot log so the teacher can see real movement — each entry is
  // {label, status: "start"|"ok"|"fail", t, ms?, err?}
  const [fwLog, setFwLog] = useState<Array<{ label: string; status: "start" | "ok" | "fail"; t: number; ms?: number; err?: string }>>([]);
  const [fwShowLog, setFwShowLog] = useState(false);
  // All in-flight fetch AbortControllers so Cancel actually cancels them
  const fwInflightRef = useRef<Set<AbortController>>(new Set());
  // Per-class defaults (loaded from class_settings)
  const [fwDefaultQuestionCount, setFwDefaultQuestionCount] = useState<number>(3);
  const [fwDefaultEstimatedMinutes, setFwDefaultEstimatedMinutes] = useState<number>(5);
  const [fwDefaultHintsAllowed, setFwDefaultHintsAllowed] = useState<boolean>(true);
  const [fwSaveAsDefault, setFwSaveAsDefault] = useState<boolean>(false);
  const [fwSettingsLoaded, setFwSettingsLoaded] = useState<boolean>(false);
  // Regenerate existing unsubmitted assignments with the (easier, lesson-first)
  // prompt instead of skipping them. Submitted work is always preserved.
  const [fwForceRegen, setFwForceRegen] = useState<boolean>(false);

  // Edit modal state
  const [editingAssignment, setEditingAssignment] = useState<any>(null);
  const [adjusting, setAdjusting] = useState<Record<string, string>>({});
  // Inline student-assigner
  const [assigningId, setAssigningId] = useState<string | null>(null);
  const [assignDraft, setAssignDraft] = useState<string[]>([]);

  // Inline edit: { id, field, draft }. field = "title" | "description".
  const [inlineEdit, setInlineEdit] = useState<{ id: string; field: "title" | "description"; draft: string } | null>(null);

  // Bulk selection + modal state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkModal, setBulkModal] = useState<"assign" | "grade" | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);

  // Reset selection when switching class
  useEffect(() => { setSelectedIds(new Set()); }, [classId]);

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  };
  const toggleSelectAll = () => {
    setSelectedIds((prev) =>
      prev.size === assignments.length ? new Set() : new Set(assignments.map((a) => a.id))
    );
  };

  // Inline save — optimistic update, then fire PUT. Revert on error.
  const saveInline = async (id: string, field: "title" | "description", value: string) => {
    const prev = assignments.find((x) => x.id === id);
    if (!prev) return;
    if ((prev[field] || "") === value) { setInlineEdit(null); return; }
    setAssignments((list) => list.map((a) => (a.id === id ? { ...a, [field]: value } : a)));
    setInlineEdit(null);
    try {
      await api.updateAssignment(id, field === "title" ? { title: value } : { description: value });
    } catch (e: any) {
      setAssignments((list) => list.map((a) => (a.id === id ? prev : a)));
      alert(`Save failed: ${e?.message || e}`);
    }
  };

  const SUBJECTS = ["Reading", "Math", "Writing", "Science", "Social Studies", "SEL", "Spelling"];
  const GRADES = ["Kindergarten", "1st Grade", "2nd Grade", "3rd Grade", "4th Grade", "5th Grade"];

  useEffect(() => {
    if (user?.role === "student") return;
    api.getClasses().then((c) => {
      setClasses(c);
      if (c.length > 0) { setClassId(c[0].id); loadAssignments(c[0].id); }
    }).catch(console.error);
  }, [user?.role]);

  const loadAssignments = async (cid: string) => {
    const a = await api.getAssignments(cid);
    setAssignments(a);
    // Refresh roster for the direct-assign picker. Silent fail — picker just
    // shows an empty list on error.
    try { const s = await api.getStudents(cid); setClassStudents(s || []); }
    catch { setClassStudents([]); }
    // Reset any previously-checked ids when switching class — student ids
    // from a different class would silently broadcast to nobody.
    setTargetStudentIds([]);
  };

  // Load per-class defaults when mega-button opens or class changes
  useEffect(() => {
    if (!showFullWeek || !classId) return;
    setFwSettingsLoaded(false);
    api.getClassSettings(classId).then((s: any) => {
      if (s?.enabled_subjects && Array.isArray(s.enabled_subjects)) {
        setFullWeekSubjects({
          reading:  s.enabled_subjects.includes("reading"),
          writing:  s.enabled_subjects.includes("writing"),
          spelling: s.enabled_subjects.includes("spelling"),
          math:     s.enabled_subjects.includes("math"),
          sel:      s.enabled_subjects.includes("sel"),
        });
      }
      if (s?.default_variety_level) setFullWeekVariety(s.default_variety_level);
      if (s?.default_question_count != null) setFwDefaultQuestionCount(Number(s.default_question_count));
      if (s?.default_estimated_minutes != null) setFwDefaultEstimatedMinutes(Number(s.default_estimated_minutes));
      if (s?.default_hints_allowed != null) setFwDefaultHintsAllowed(!!s.default_hints_allowed);
      setFwSettingsLoaded(true);
    }).catch(() => setFwSettingsLoaded(true));
  }, [showFullWeek, classId]);

  // Route students to interactive view
  if (user?.role === "student") {
    return (
      <div className="p-7 space-y-5 animate-page-enter">
        <div>
          <h1 className={`text-2xl font-bold tracking-tight ${dk ? "text-white" : "text-gray-900"}`}>Today's Assignment</h1>
          <p className={`text-sm mt-0.5 ${dk ? "text-white/40" : "text-gray-500"}`}>Complete your daily assignment one question at a time</p>
        </div>
        <StudentAssignmentView dk={dk} />
      </div>
    );
  }

  const handleGenerate = async () => {
    if (!title.trim()) { setGenError("Please enter a title first."); return; }
    setGenerating(true);
    setGenError("");
    setGenerated(null);
    try {
      const result = await api.generateAssignment({
        title, subject, grade, instructions,
        passage: genPassage.trim() || undefined,
        questionCount: customQuestionCount !== "" ? Number(customQuestionCount) : undefined,
        questionType: customQuestionType || undefined,
        learningObjective: customLearningObjective || undefined,
        focusKeywords: customFocusKeywords || undefined,
        teacherNotes: customTeacherNotes || undefined,
        hintsAllowed: customHintsAllowed,
      });
      setGenerated(result);
      setShowForm(true);
    } catch (e: any) {
      setGenError(`Generation failed: ${e?.message || String(e)}`);
    }
    setGenerating(false);
  };

  // Quick YouTube URL sniff — matches the shapes the backend recognizes.
  const isYouTubeUrl = (raw: string): boolean => {
    if (!raw) return false;
    const t = raw.trim();
    if (/^[A-Za-z0-9_-]{11}$/.test(t)) return true;
    return /(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)[A-Za-z0-9_-]{11}/.test(t);
  };

  const handleGenerateFromVideo = async () => {
    setVideoGenError("");
    setVideoGenNote("");
    if (!videoUrl.trim()) { setVideoGenError("Paste a YouTube URL first."); return; }
    if (!isYouTubeUrl(videoUrl)) {
      setVideoGenError("That doesn't look like a YouTube URL. Use youtube.com/watch?v=… or youtu.be/…");
      return;
    }
    setVideoGenerating(true);
    setGenerated(null);
    setGenError("");
    try {
      const result = await api.generateAssignmentFromVideo({
        videoUrl: videoUrl.trim(),
        title: title.trim() || undefined,
        subject,
        grade,
        questionCount: videoQuestionCount,
      });
      // Populate the main form so Save & Assign works unchanged.
      if (result?.title && !title.trim()) setTitle(result.title);
      if (result?.videoUrl) setVideoUrl(result.videoUrl);
      if (result?.transcriptUsed === false) {
        setVideoGenNote("Captions weren't available — questions are based on the video title and channel only. Review before assigning.");
      }
      setGenerated({
        title: result?.title || title || "Video Assignment",
        subject: result?.subject || subject,
        grade: result?.grade || grade,
        instructions: result?.instructions || "Watch the video, then answer the questions below.",
        totalPoints: result?.totalPoints || 0,
        sections: Array.isArray(result?.sections) ? result.sections : [],
      });
    } catch (e: any) {
      setVideoGenError(e?.message || "Could not generate from this video. Try another URL.");
    } finally {
      setVideoGenerating(false);
    }
  };

  // Map the API's lowercase subject/grade to the form's capitalized dropdown
  // values. Silent pass-through if the API already returned a display label.
  const normalizeSubject = (s?: string): string | null => {
    if (!s) return null;
    const key = String(s).toLowerCase().replace(/[_\s]+/g, "_");
    const map: Record<string, string> = {
      math: "Math",
      reading: "Reading",
      writing: "Writing",
      science: "Science",
      social_studies: "Social Studies",
      spelling: "Spelling",
      sel: "SEL",
    };
    return map[key] || (SUBJECTS.includes(s) ? s : null);
  };
  const normalizeGrade = (g?: string): string | null => {
    if (!g) return null;
    if (GRADES.includes(g)) return g;
    const lower = String(g).toLowerCase();
    if (lower.includes("kinder")) return "Kindergarten";
    const m = lower.match(/(\d+)/);
    if (m) {
      const n = Number(m[1]);
      const suffix = n === 1 ? "st" : n === 2 ? "nd" : n === 3 ? "rd" : "th";
      const label = `${n}${suffix} Grade`;
      if (GRADES.includes(label)) return label;
    }
    return null;
  };

  const handlePdfUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = ""; // reset so picking the same file twice still fires
    setPdfParsing(true);
    setPdfErr(null);
    try {
      // 1) upload — returns { id, title, attached_pdf_path, ... }
      const uploadResult = await api.uploadPdf(file, classId);
      if (uploadResult?.error) throw new Error(uploadResult.error);
      const fileId = uploadResult?.id;
      if (!fileId) throw new Error("Upload did not return a file ID");
      setPdfSourceAssignmentId(fileId);

      // 2) ask Claude to parse it into the editor's JSON shape
      const parsed = await api.parsePdfAssignment(fileId);
      if (parsed?.error) throw new Error(parsed.error);

      // 3) populate the form
      if (parsed?.title) setTitle(parsed.title);
      const nSubj = normalizeSubject(parsed?.subject);
      if (nSubj) setSubject(nSubj);
      const nGrade = normalizeGrade(parsed?.grade);
      if (nGrade) setGrade(nGrade);
      if (parsed?.instructions) setInstructions(parsed.instructions);

      // 4) flatten to a GeneratedAssignment so the preview + save path works.
      // totalPoints is derived — the builder's existing save code relies on
      // generated.sections[i].questions[j].points for rubric generation.
      const sections: Section[] = Array.isArray(parsed?.sections)
        ? parsed.sections.map((sec: any) => ({
            title: sec?.title || "Section",
            passage: sec?.passage || undefined,
            questions: Array.isArray(sec?.questions)
              ? sec.questions.map((q: any) => ({
                  type: (q?.type as Question["type"]) || "short_answer",
                  text: q?.text || "",
                  options: Array.isArray(q?.options) ? q.options : undefined,
                  points: typeof q?.points === "number" ? q.points : 1,
                }))
              : [],
          }))
        : [];
      const totalPoints = sections.reduce(
        (sum, sec) => sum + sec.questions.reduce((s, q) => s + (q.points || 0), 0),
        0
      );
      setGenerated({
        title: parsed?.title || title || "Imported Worksheet",
        subject: nSubj || subject,
        grade: nGrade || grade,
        instructions: parsed?.instructions || "",
        totalPoints,
        sections,
      });
      setShowForm(true);
    } catch (err: any) {
      setPdfErr(err?.message || "Failed to parse PDF");
    } finally {
      setPdfParsing(false);
    }
  };

  const [createError, setCreateError] = useState("");
  const handleCreate = async () => {
    if (!title || !classId) { setCreateError(`Missing: ${!title ? "title" : "class"}`); return; }
    setCreateError("");
    const rubric = generated
      ? generated.sections.flatMap((s) => s.questions.map((q) => ({ label: q.text.slice(0, 60), maxPoints: q.points })))
      : [{ label: "Correctness", maxPoints: 50 }, { label: "Creativity", maxPoints: 50 }];
    const desc = generated
      ? `[Generated] ${generated.instructions}\n\nSections: ${generated.sections.map((s) => s.title).join(", ")}`
      : instructions;
    const content = generated ? JSON.stringify(generated) : null;
    const targeting: any = {};
    if (targetMode === "single") {
      targeting.targetGradeMin = targetGradeMin;
      targeting.targetGradeMax = targetGradeMin;
      targeting.targetSubject = targetSubject;
    } else if (targetMode === "range") {
      targeting.targetGradeMin = Math.min(targetGradeMin, targetGradeMax);
      targeting.targetGradeMax = Math.max(targetGradeMin, targetGradeMax);
      targeting.targetSubject = targetSubject;
    } else if (targetMode === "students" && targetStudentIds.length > 0) {
      // Direct-assign — overrides grade targeting. Only these student_ids
      // will see the assignment in their pending list.
      targeting.targetStudentIds = targetStudentIds;
    }
    const customization: any = {};
    if (customQuestionCount !== "") customization.questionCount = Number(customQuestionCount);
    if (customEstimatedMinutes !== "") customization.estimatedMinutes = Number(customEstimatedMinutes);
    if (customQuestionType) customization.questionType = customQuestionType;
    customization.hintsAllowed = customHintsAllowed;
    if (customLearningObjective) customization.learningObjective = customLearningObjective;
    if (customFocusKeywords) customization.focusKeywords = customFocusKeywords;
    if (customTeacherNotes) customization.teacherNotes = customTeacherNotes;
    // Group / center: if checked and students are picked, flag the assignment
    // as a group assignment so members see a shared-notes pane.
    const groupPayload: any = {};
    if (isGroup && targetMode === "students" && targetStudentIds.length > 0) {
      groupPayload.isGroup = true;
      groupPayload.groupName = groupName.trim() || "Group";
    }
    // Video → assignment: persist the URL so WorkScreen embeds the player for students.
    const videoPayload: any = videoUrl.trim() ? { videoUrl: videoUrl.trim() } : {};
    try {
      if (targetMode === "auto") {
        setCreateError("Creating grade-level assignments...");
        const result = await api.createAssignmentByGrade({
          classId,
          title,
          subject: targetSubject,
          instructions: desc,
          passage: genPassage,
        });
        setCreateError("");
        setShowForm(false);
        setGenerated(null);
        setPdfSourceAssignmentId(null);
        setTitle(""); setInstructions(""); setDueDate("");
        setVideoUrl(""); setVideoGenError(""); setVideoGenNote("");
        setCustomQuestionCount(""); setCustomEstimatedMinutes(""); setCustomQuestionType("");
        setCustomHintsAllowed(true); setCustomLearningObjective(""); setCustomFocusKeywords(""); setCustomTeacherNotes("");
        setShowAdvanced(false);
        setTargetMode("all"); setTargetStudentIds([]);
        setIsGroup(false); setGroupName("");
        loadAssignments(classId);
        alert(`Created assignments for ${result.created} grade levels!`);
        return;
      } else if (pdfSourceAssignmentId) {
        await api.updateAssignment(pdfSourceAssignmentId, { title, description: desc, dueDate, rubric, content, ...targeting, ...customization, ...groupPayload, ...videoPayload });
      } else {
        await api.createAssignment({ classId, title, description: desc, dueDate, rubric, content, ...targeting, ...customization, ...groupPayload, ...videoPayload });
      }
    } catch (e: any) {
      setCreateError(`Failed to save: ${e?.message || String(e)}`);
      return;
    }
    setShowForm(false);
    setGenerated(null);
    setPdfSourceAssignmentId(null);
    setTitle(""); setInstructions(""); setDueDate("");
    setVideoUrl(""); setVideoGenError(""); setVideoGenNote("");
    setCustomQuestionCount(""); setCustomEstimatedMinutes(""); setCustomQuestionType("");
    setCustomHintsAllowed(true); setCustomLearningObjective(""); setCustomFocusKeywords(""); setCustomTeacherNotes("");
    setShowAdvanced(false);
    setTargetMode("all"); setTargetStudentIds([]);
    setIsGroup(false); setGroupName("");
    loadAssignments(classId);
  };

  const handleCreateWeekly = async () => {
    if (!title || !classId) return;
    const rubric = generated
      ? generated.sections.flatMap((s) => s.questions.map((q) => ({ label: q.text.slice(0, 60), maxPoints: q.points })))
      : [{ label: "Correctness", maxPoints: 100 }];
    await api.createWeeklyAssignments({
      classId, title, subject, grade,
      description: generated?.instructions || instructions,
      rubric,
      content: generated ? JSON.stringify(generated) : null,
    });
    setShowForm(false);
    setGenerated(null);
    loadAssignments(classId);
    alert("✅ 5 assignments created for Mon–Fri!");
  };

  const handleGenerateFullWeek = async () => {
    if (!classId) return;
    const subjects = Object.entries(fullWeekSubjects).filter(([, v]) => v).map(([k]) => k);
    if (subjects.length === 0) { alert("Pick at least one subject."); return; }

    setFullWeekGenerating(true);
    setFullWeekResult(null);
    fwCancelRef.current.cancelled = false;
    fwInflightRef.current = new Set();
    setFwLog([]);

    // Persist these choices as the class default if requested
    if (fwSaveAsDefault) {
      api.updateClassSettings(classId, {
        enabled_subjects: subjects,
        default_variety_level: fullWeekVariety,
        default_question_count: fwDefaultQuestionCount,
        default_estimated_minutes: fwDefaultEstimatedMinutes,
        default_hints_allowed: fwDefaultHintsAllowed,
      }).catch(() => { /* non-blocking */ });
    }

    // Tuned down from 10 → 3. Anthropic Tier 1 concurrent-request limits + pg
    // default pool size of 10 were causing generate-slot requests to queue
    // behind each other silently. 3 keeps the bar moving without stalls.
    // Concurrency=2 to stay well under Anthropic's tier-1 concurrent-call limit.
    // Higher values trigger SDK retries that silently stall past our 120s abort.
    const CONCURRENCY = 2;
    // Per-slot hard timeout. If Vercel's function hangs (cold start + slow
    // Anthropic response), we abort and retry rather than waiting forever.
    const SLOT_TIMEOUT_MS = 120_000;
    const t0 = Date.now();

    const appendLog = (entry: { label: string; status: "start" | "ok" | "fail"; ms?: number; err?: string }) => {
      // Keep last 200 entries in state; log all to console for inspection
      const full = { ...entry, t: Math.round((Date.now() - t0) / 1000) };
      // eslint-disable-next-line no-console
      console.log(`[full-week +${full.t}s] ${full.status.toUpperCase()} ${full.label}${full.ms ? ` (${full.ms}ms)` : ""}${full.err ? ` — ${full.err}` : ""}`);
      setFwLog(prev => prev.length > 200 ? [...prev.slice(-199), full] : [...prev, full]);
    };

    try {
      // 1) Plan (fast, no AI — returns slot list)
      const planStart = Date.now();
      const plan = await api.planFullWeek({
        classId,
        weekStarting: fullWeekStart || undefined,
        subjects,
        themeBySubject: fullWeekThemes,
        difficultyTweak: fullWeekDifficulty,
        varietyLevel: fullWeekVariety,
      });
      // eslint-disable-next-line no-console
      console.log(`[full-week] plan returned ${plan?.slots?.length ?? 0} slots in ${Date.now() - planStart}ms`);
      if (!plan?.slots || plan.slots.length === 0) throw new Error("Nothing to generate.");

      setFwProgress({ done: 0, failed: 0, total: plan.total, elapsed: 0 });

      // 2) Run a simple p-limit style pool
      let done = 0, failed = 0;
      const slots = [...plan.slots];
      const errors: any[] = [];

      const runOne = async (slot: any, tickLabel: string): Promise<boolean> => {
        const slotWithDefaults = {
          ...slot,
          questionCount: fwDefaultQuestionCount,
          estimatedMinutes: fwDefaultEstimatedMinutes,
          hintsAllowed: fwDefaultHintsAllowed,
          force: fwForceRegen,
        };
        const ctrl = new AbortController();
        fwInflightRef.current.add(ctrl);
        const to = setTimeout(() => ctrl.abort(), SLOT_TIMEOUT_MS);
        const start = Date.now();
        try {
          await api.generateAssignmentSlot(slotWithDefaults, ctrl.signal);
          appendLog({ label: tickLabel, status: "ok", ms: Date.now() - start });
          return true;
        } catch (e: any) {
          const msg = e?.name === "AbortError" ? "timeout/cancelled" : (e?.message || String(e));
          appendLog({ label: tickLabel, status: "fail", ms: Date.now() - start, err: msg });
          errors.push({ slot: tickLabel, err: msg });
          return false;
        } finally {
          clearTimeout(to);
          fwInflightRef.current.delete(ctrl);
        }
      };

      const worker = async () => {
        while (true) {
          if (fwCancelRef.current.cancelled) return;
          const slot = slots.shift();
          if (!slot) return;
          const tickLabel = `${slot.studentName} · ${slot.subject} · ${slot.dayName}`;
          setFwProgress(p => ({ ...p, current: tickLabel }));
          appendLog({ label: tickLabel, status: "start" });
          const ok = await runOne(slot, tickLabel);
          if (ok) {
            done++;
          } else if (!fwCancelRef.current.cancelled) {
            // One retry after a short delay
            await new Promise(r => setTimeout(r, 800));
            const ok2 = await runOne(slot, tickLabel + " (retry)");
            if (ok2) done++; else failed++;
          } else {
            failed++;
          }
          setFwProgress(p => ({
            ...p,
            done, failed,
            elapsed: Math.round((Date.now() - t0) / 1000),
          }));
        }
      };
      const pool = Array.from({ length: Math.min(CONCURRENCY, plan.slots.length) }, () => worker());
      await Promise.all(pool);

      setFullWeekResult({
        created: done,
        failed,
        expected: plan.total,
        studentsAffected: plan.students,
        subjectsPerStudent: plan.subjects,
        elapsed: Math.round((Date.now() - t0) / 1000),
        errors: errors.slice(0, 10),
        cancelled: fwCancelRef.current.cancelled,
      });
      loadAssignments(classId);
    } catch (e: any) {
      if (e?.message?.includes("AI_NOT_CONFIGURED") || e?.message?.includes("ANTHROPIC_API_KEY")) {
        alert("⚠️ Generation is not configured.\n\nAdd ANTHROPIC_API_KEY in your Vercel environment variables to enable weekly generation.");
      } else {
        alert("Failed: " + (e?.message || e));
      }
    } finally {
      setFullWeekGenerating(false);
      fwInflightRef.current.clear();
    }
  };

  const cancelFullWeek = () => {
    fwCancelRef.current.cancelled = true;
    // Actually abort every in-flight fetch so the user doesn't wait for them
    fwInflightRef.current.forEach(c => { try { c.abort(); } catch { /* noop */ } });
    fwInflightRef.current.clear();
  };

  const handleAdjust = async (id: string, direction: "easier"|"harder") => {
    setAdjusting(a => ({ ...a, [id]: direction }));
    try {
      await api.adjustAssignmentDifficulty(id, direction);
      await loadAssignments(classId);
    } catch (e: any) { alert("Failed: " + e.message); }
    finally { setAdjusting(a => { const n = { ...a }; delete n[id]; return n; }); }
  };

  const handleRegenerate = async (id: string) => {
    if (!confirm("Regenerate this assignment with fresh content?")) return;
    setAdjusting(a => ({ ...a, [id]: "regen" }));
    try {
      await api.regenerateAssignment(id);
      await loadAssignments(classId);
    } catch (e: any) { alert("Failed: " + e.message); }
    finally { setAdjusting(a => { const n = { ...a }; delete n[id]; return n; }); }
  };

  return (
    <div className="p-6 space-y-5 animate-page-enter max-w-screen-xl mx-auto">
      {/* Header */}
      <header className="border-b pb-5" style={{ borderColor: "var(--border)" }}>
        <div className="flex items-center justify-between mb-2 text-[10px] uppercase tracking-[0.16em]" style={{ color: "var(--text-3)" }}>
          <span>{new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}</span>
          <span className="font-mono">BLOCKFORGE · ASSIGNMENTS</span>
        </div>
        <div className="flex items-end justify-between gap-4 flex-wrap">
          <div>
            <div className="section-label mb-2">— Planning this week —</div>
            <h1 className="font-display text-4xl leading-tight" style={{ color: "var(--text-1)" }}>
              <span style={{ background: "linear-gradient(135deg,#6366f1,#8b5cf6)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>✏️ Assignment</span>
              <em style={{ color: "var(--accent)", fontStyle: "italic" }}> Builder</em>
            </h1>
            <p className="text-sm mt-2" style={{ color: "var(--text-2)" }}>
              Generated per student, per grade. One click makes the whole week.
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {/* Class selector in header */}
            <select
              value={classId}
              onChange={(e) => { setClassId(e.target.value); loadAssignments(e.target.value); }}
              className="input text-sm h-9"
            >
              {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <button
              disabled={genTodayLoading || !classId}
              onClick={async () => {
                if (!classId) return;
                if (!confirm("Generate grade-differentiated assignments for ALL subjects (reading, math, writing, spelling) for every grade level in this class today?\n\nThis uses AI and may take 30–60 seconds.")) return;
                setGenTodayLoading(true);
                try {
                  const result = await api.generateTodayAssignments(classId);
                  await loadAssignments(classId);
                  alert(`✅ Created ${result.created} assignments for today!\n${result.errors?.length ? "Errors: " + result.errors.join(", ") : ""}`);
                } catch (e: any) { alert("Failed: " + e.message); }
                finally { setGenTodayLoading(false); }
              }}
              className="btn-primary gap-2"
              style={{ background: "linear-gradient(135deg, #059669, #047857)" }}
            >
              {genTodayLoading ? "⏳ Generating…" : "🎯 Generate Today (All Grades)"}
            </button>
            <button
              onClick={async () => {
                if (studentCheck) { setStudentCheck(null); return; }
                if (!classId || classStudents.length === 0) { alert("Select a class with students first."); return; }
                setStudentCheckLoading(true);
                try {
                  const results = await Promise.all(
                    classStudents.map((s: any) =>
                      fetch(`/api/assignments/class/${classId}/debug-pending?studentId=${s.id}`, {
                        headers: { Authorization: `Bearer ${localStorage.getItem("token")}` }
                      }).then(r => r.json()).then(d => ({
                        student: s,
                        visible: (d?.assignments || []).filter((a: any) => a.visible),
                        blocked: (d?.assignments || []).filter((a: any) => !a.visible),
                        total: (d?.assignments || []).length,
                      }))
                    )
                  );
                  setStudentCheck(results);
                } catch (e: any) { alert("Check failed: " + e.message); }
                finally { setStudentCheckLoading(false); }
              }}
              className="btn-secondary gap-1.5 text-xs"
              style={{ borderColor: studentCheck ? "var(--accent)" : undefined }}
            >
              {studentCheckLoading ? "Checking…" : studentCheck ? "✓ Hide Check" : "👁 Who Sees What?"}
            </button>
            <button onClick={() => setShowFullWeek(v => !v)} className="btn-secondary gap-1.5 text-xs">
              📅 Generate Full Week
            </button>
            <button onClick={() => setShowImport(true)} className="btn-secondary gap-1.5 text-xs">
              📄 Import (TPT / PDF)
            </button>
            <button onClick={() => { setShowForm(!showForm); setGenerated(null); setGenError(""); setPdfSourceAssignmentId(null); }} className="btn-primary gap-2">
              {showForm ? <X size={14}/> : <Plus size={14}/>}
              {showForm ? "Cancel" : "New Assignment"}
            </button>
          </div>
        </div>
      </header>

      {/* ── Student visibility check panel ── */}
      {studentCheck && (
        <div className="card" style={{ borderLeft: "3px solid #4ade80" }}>
          <div className="flex items-center justify-between mb-3">
            <div className="font-semibold text-sm" style={{ color: "var(--text-1)" }}>
              👁 Assignment visibility — {classStudents.find((c: any) => c.id === classId)?.name || "this class"}
            </div>
            <button onClick={() => setStudentCheck(null)} className="btn-ghost text-xs">Close</button>
          </div>
          <div className="grid gap-2" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))" }}>
            {studentCheck.map(({ student, visible, blocked, total }: any) => (
              <div key={student.id} className="p-3 rounded-xl text-sm" style={{
                background: visible.length > 0 ? "rgba(74,222,128,0.08)" : "rgba(248,113,113,0.10)",
                border: `1px solid ${visible.length > 0 ? "rgba(74,222,128,0.25)" : "rgba(248,113,113,0.25)"}`,
              }}>
                <div className="font-bold" style={{ color: "var(--text-1)" }}>
                  {visible.length > 0 ? "✅" : "❌"} {student.name}
                </div>
                {visible.length > 0 ? (
                  <div style={{ color: "#4ade80", fontSize: 11, marginTop: 3 }}>
                    {visible.length} assignment{visible.length !== 1 ? "s" : ""} pending
                  </div>
                ) : (
                  <div style={{ color: "#f87171", fontSize: 11, marginTop: 3 }}>
                    {total === 0
                      ? "No assignments in class"
                      : blocked.map((b: any) => b.reason).filter((v: string, i: number, a: string[]) => a.indexOf(v) === i).join(", ")}
                  </div>
                )}
              </div>
            ))}
          </div>
          {studentCheck.every(({ visible }: any) => visible.length === 0) && (
            <div className="mt-3 p-3 rounded-xl text-xs" style={{ background: "rgba(248,113,113,0.08)", border: "1px solid rgba(248,113,113,0.2)", color: "#fca5a5" }}>
              ⚠️ No students can see any assignments. Either no assignments have been created for this class, or all have been submitted. Use "New Assignment" above to create one.
            </div>
          )}
        </div>
      )}

      {/* ── Full Week Generator dialog ── */}
      {showFullWeek && (
        <div className="card space-y-4" style={{ borderLeft: "3px solid var(--accent)" }}>
          <div className="flex items-center justify-between">
            <div>
              <div className="section-label">— Full week generator —</div>
              <h3 className="font-display text-2xl leading-tight" style={{ color: "var(--text-1)" }}>One click, full week.</h3>
              <p className="text-xs mt-1" style={{ color: "var(--text-3)" }}>
                Generates unique content for every student × subject × day. Default: today through Friday. Each task tailored to that student's grade.
              </p>
            </div>
            <button onClick={() => setShowFullWeek(false)} className="btn-ghost text-xs">Close</button>
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-[10px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: "var(--text-3)" }}>Start date (optional — default: today)</label>
              <input type="date" value={fullWeekStart} onChange={e => setFullWeekStart(e.target.value)} className="input text-sm" placeholder="Defaults to tomorrow" />
            </div>
            <div>
              <label className="block text-[10px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: "var(--text-3)" }}>Difficulty tweak</label>
              <select value={fullWeekDifficulty} onChange={e => setFullWeekDifficulty(e.target.value as any)} className="input text-sm">
                <option value="match">Match each student's grade</option>
                <option value="easier">Force easier (-1 grade)</option>
                <option value="harder">Force harder (+1 grade)</option>
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className="block text-[10px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: "var(--text-3)" }}>Variety (how different each day should feel)</label>
              <div className="flex gap-2">
                {(["low","medium","high"] as const).map(v => (
                  <button key={v} onClick={() => setFullWeekVariety(v)} type="button"
                    className="px-3 py-1.5 text-xs font-semibold border cursor-pointer transition-colors"
                    style={{
                      borderRadius: "var(--r-md)",
                      background: fullWeekVariety === v ? "var(--accent-light)" : "transparent",
                      color: fullWeekVariety === v ? "var(--text-accent)" : "var(--text-2)",
                      borderColor: fullWeekVariety === v ? "var(--accent)" : "var(--border-md)",
                    }}>{v}</button>
                ))}
              </div>
            </div>
          </div>

          <div>
            <label className="block text-[10px] font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--text-3)" }}>Subjects + weekly focus (optional)</label>
            <div className="space-y-2">
              {[
                { key: "reading",    label: "📖 Reading",    hint: "e.g. phonics and beginning sounds" },
                { key: "writing",    label: "✏️ Writing",    hint: "e.g. sentence structure" },
                { key: "spelling",   label: "🔤 Spelling",   hint: "e.g. weekly word list focus" },
                { key: "vocabulary", label: "📚 Vocabulary", hint: "e.g. tier-2 academic words" },
                { key: "math",       label: "🔢 Math",       hint: "e.g. single-digit addition" },
                { key: "science",    label: "🔬 Science",    hint: "e.g. weather, plants, the five senses" },
                { key: "history",    label: "🏛️ History",    hint: "e.g. community helpers, holidays" },
                { key: "sel",        label: "💛 SEL",        hint: "e.g. theme: resilience" },
              ].map(s => (
                <div key={s.key} className="flex items-center gap-2">
                  <label className="flex items-center gap-2 text-sm font-semibold cursor-pointer" style={{ width: 150, color: "var(--text-1)" }}>
                    <input type="checkbox" checked={!!fullWeekSubjects[s.key]}
                      onChange={e => setFullWeekSubjects(cur => ({ ...cur, [s.key]: e.target.checked }))} />
                    {s.label}
                  </label>
                  <input placeholder={s.hint} value={fullWeekThemes[s.key] || ""}
                    disabled={!fullWeekSubjects[s.key]}
                    onChange={e => setFullWeekThemes(cur => ({ ...cur, [s.key]: e.target.value }))}
                    className="input text-sm flex-1" />
                </div>
              ))}
            </div>
          </div>

          {/* Per-class defaults — question count, minutes, hints */}
          <div className="p-3 border" style={{ background: "var(--bg-muted)", borderColor: "var(--border)", borderRadius: "var(--r-md)" }}>
            <div className="flex items-center justify-between mb-2">
              <div className="section-label">— Per-assignment defaults —</div>
              {fwSettingsLoaded && (
                <span className="text-[10px]" style={{ color: "var(--text-3)" }}>
                  Loaded from this class's saved settings
                </span>
              )}
            </div>
            <div className="grid sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: "var(--text-3)" }}>Questions per assignment</label>
                <input
                  type="number" min={1} max={20}
                  value={fwDefaultQuestionCount}
                  onChange={e => setFwDefaultQuestionCount(Math.max(1, Math.min(20, Number(e.target.value) || 1)))}
                  className="input text-sm w-full"
                />
              </div>
              <div>
                <label className="block text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: "var(--text-3)" }}>Estimated minutes each</label>
                <input
                  type="number" min={1} max={120}
                  value={fwDefaultEstimatedMinutes}
                  onChange={e => setFwDefaultEstimatedMinutes(Math.max(1, Number(e.target.value) || 1))}
                  className="input text-sm w-full"
                />
              </div>
              <div className="flex items-end">
                <label className="flex items-center gap-2 text-sm cursor-pointer" style={{ color: "var(--text-1)" }}>
                  <input
                    type="checkbox"
                    checked={fwDefaultHintsAllowed}
                    onChange={e => setFwDefaultHintsAllowed(e.target.checked)}
                    className="cursor-pointer"
                  />
                  Allow hints
                </label>
              </div>
            </div>
            <label className="mt-3 flex items-center gap-2 text-xs cursor-pointer" style={{ color: "var(--text-2)" }}>
              <input
                type="checkbox"
                checked={fwSaveAsDefault}
                onChange={e => setFwSaveAsDefault(e.target.checked)}
                className="cursor-pointer"
              />
              Save these choices as this class's defaults (subjects + variety + counts)
            </label>
            <label className="mt-2 flex items-start gap-2 text-xs cursor-pointer" style={{ color: "var(--text-2)" }}>
              <input
                type="checkbox"
                checked={fwForceRegen}
                onChange={e => setFwForceRegen(e.target.checked)}
                className="cursor-pointer mt-0.5"
              />
              <span>
                <span style={{ fontWeight: 600, color: "var(--text-1)" }}>Re-generate existing assignments</span>
                {" — "}rewrite every unsubmitted assignment in this date range with the new (easier, lesson-first) content. Already-submitted work is left alone.
              </span>
            </label>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            <button onClick={handleGenerateFullWeek} disabled={fullWeekGenerating} className="btn-primary gap-2">
              {fullWeekGenerating ? "Generating…" : "🚀 Generate Full Week"}
            </button>
            {fullWeekGenerating && (
              <button onClick={cancelFullWeek} className="btn-ghost text-xs" style={{ color: "var(--danger)" }}>
                Cancel
              </button>
            )}
            {!fullWeekGenerating && (
              <button
                onClick={async () => {
                  if (!confirm("Delete all AI-generated assignments for this week's date range? This cannot be undone.")) return;
                  // Compute the same date range the generator uses: today through Friday
                  const today = new Date();
                  if (today.getDay() === 6) today.setDate(today.getDate() + 2);
                  else if (today.getDay() === 0) today.setDate(today.getDate() + 1);
                  const friday = new Date(today);
                  friday.setDate(today.getDate() + (5 - today.getDay()));
                  const from = fullWeekStart || today.toISOString().slice(0, 10);
                  const to = friday.toISOString().slice(0, 10);
                  try {
                    const r = await api.deleteGeneratedAssignments(classId, from, to);
                    alert(`Deleted ${r.deleted} assignment${r.deleted === 1 ? "" : "s"}.`);
                    loadAssignments(classId);
                    setFullWeekResult(null);
                  } catch (e: any) {
                    alert("Failed to delete: " + (e?.message || e));
                  }
                }}
                className="btn-ghost text-xs"
                style={{ color: "var(--danger)" }}
              >
                🗑 Clear this week
              </button>
            )}
            {!fullWeekGenerating && (
              <span className="text-[11px]" style={{ color: "var(--text-3)" }}>
                ~{Object.values(fullWeekSubjects).filter(Boolean).length} subjects × 5 days × students, 10 calls in parallel
              </span>
            )}
          </div>

          {/* Real progress bar — only while running */}
          {fullWeekGenerating && fwProgress.total > 0 && (
            <div className="p-3 space-y-2" style={{
              background: "var(--bg-muted)",
              border: "1px solid var(--border)",
              borderLeft: "3px solid var(--accent)",
              borderRadius: "var(--r-md)",
            }}>
              <div className="flex items-baseline justify-between gap-2 text-xs font-semibold" style={{ color: "var(--text-2)" }}>
                <span>
                  <span className="font-display text-lg tabular-nums" style={{ color: "var(--accent)" }}>
                    {fwProgress.done + fwProgress.failed}
                  </span>
                  <span style={{ color: "var(--text-3)" }}> of </span>
                  <span className="font-display text-lg tabular-nums" style={{ color: "var(--text-1)" }}>
                    {fwProgress.total}
                  </span>
                  <span className="ml-2 text-[10px] uppercase tracking-wider" style={{ color: "var(--text-3)" }}>
                    generated
                  </span>
                </span>
                <span className="text-[10px] uppercase tracking-wider" style={{ color: "var(--text-3)" }}>
                  {fwProgress.elapsed}s elapsed
                  {fwProgress.failed > 0 && <span style={{ color: "var(--danger)", marginLeft: 8 }}>· {fwProgress.failed} failed</span>}
                </span>
              </div>
              <div style={{ height: 4, background: "var(--border)", borderRadius: 2, overflow: "hidden" }}>
                <div style={{
                  height: "100%",
                  width: `${((fwProgress.done + fwProgress.failed) / fwProgress.total) * 100}%`,
                  background: "var(--accent)",
                  transition: "width 0.25s ease",
                }} />
              </div>
              {fwProgress.current && (
                <div className="text-[11px] truncate" style={{ color: "var(--text-3)" }}>
                  Currently: {fwProgress.current}
                </div>
              )}
              <button
                type="button"
                onClick={() => setFwShowLog(v => !v)}
                className="text-[10px] uppercase tracking-wider cursor-pointer"
                style={{ color: "var(--text-accent)", background: "transparent", border: "none", padding: 0 }}
              >
                {fwShowLog ? "Hide" : "Show"} detail · {fwLog.length} event{fwLog.length === 1 ? "" : "s"}
              </button>
              {fwShowLog && (
                <div
                  style={{
                    maxHeight: 180, overflowY: "auto",
                    background: "var(--bg-surface)",
                    border: "1px solid var(--border)",
                    borderRadius: "var(--r-sm)",
                    padding: "6px 8px",
                    fontFamily: "'JetBrains Mono', ui-monospace, monospace",
                    fontSize: 10, lineHeight: 1.5,
                  }}
                >
                  {fwLog.length === 0 ? (
                    <div style={{ color: "var(--text-3)" }}>No events yet…</div>
                  ) : (
                    fwLog.slice(-100).map((e, i) => {
                      const color =
                        e.status === "ok"   ? "var(--success)" :
                        e.status === "fail" ? "var(--danger)"  :
                                              "var(--text-3)";
                      return (
                        <div key={i} style={{ color, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                          +{String(e.t).padStart(3, " ")}s  {e.status.padEnd(5)}  {e.label}
                          {e.ms ? `  (${e.ms}ms)` : ""}
                          {e.err ? `  — ${e.err}` : ""}
                        </div>
                      );
                    })
                  )}
                </div>
              )}
            </div>
          )}

          {/* Final result summary */}
          {fullWeekResult && (
            <div className="p-3" style={{
              background: fullWeekResult.failed > 0 ? "color-mix(in srgb, var(--warning) 10%, transparent)" : "color-mix(in srgb, var(--success) 10%, transparent)",
              borderLeft: `3px solid ${fullWeekResult.failed > 0 ? "var(--warning)" : "var(--success)"}`,
              color: fullWeekResult.failed > 0 ? "var(--warning)" : "var(--success)",
              borderRadius: "var(--r-md)",
              fontSize: 13, fontWeight: 600,
            }}>
              {fullWeekResult.created > 0 ? "✓" : "✗"} Created {fullWeekResult.created} / {fullWeekResult.expected} in {fullWeekResult.elapsed}s
              ({fullWeekResult.studentsAffected} students × {fullWeekResult.subjectsPerStudent} subjects × 5 days)
              {fullWeekResult.failed > 0 && (
                <div className="mt-1 text-xs" style={{ color: "var(--danger)" }}>
                  {fullWeekResult.failed} failed.
                  {fullWeekResult.errors?.length > 0 && (
                    <span> Errors: {fullWeekResult.errors.map((e: any) => e.err || JSON.stringify(e)).join("; ")}</span>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Two-column layout: left controls + right preview ── */}
      <div className="flex gap-6 items-start">
        {/* LEFT COLUMN — controls (40%) */}
        <div className="flex-shrink-0 space-y-5" style={{ width: "40%" }}>

      {/* Assignment form */}
      {showForm && (
        <div className="rounded-2xl border space-y-5 p-5" style={{
          background: "var(--bg-surface)",
          borderColor: dk ? "rgba(139,92,246,0.22)" : "rgba(139,92,246,0.2)",
        }}>
          {/* Form header */}
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
              style={{ background: "rgba(139,92,246,0.15)" }}>
              <FileText size={14} className="text-violet-400" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-t1">Assignment Details</h2>
              <p className="text-[10px] text-t3">Fill in the basics, then generate or save directly</p>
            </div>
          </div>

          {/* Title — full width */}
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wider text-t3 mb-1.5">
              Title *
            </label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder='e.g. "Main Idea & Details Worksheet"'
              className="input w-full"
            />
          </div>

          {/* Subject + Grade — side by side */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-t3 mb-1.5">
                <BookOpen size={10} /> Subject
              </label>
              <select value={subject} onChange={(e) => setSubject(e.target.value)} className="input w-full text-sm">
                {SUBJECTS.map((s) => <option key={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-t3 mb-1.5">
                <GraduationCap size={10} /> Grade Level
              </label>
              <select value={grade} onChange={(e) => setGrade(e.target.value)} className="input w-full text-sm">
                {GRADES.map((g) => <option key={g}>{g}</option>)}
              </select>
            </div>
          </div>

          {/* Due Date + Instructions — side by side */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-t3 mb-1.5">
                <Calendar size={10} /> Due Date &amp; Time
              </label>
              <input
                type="datetime-local"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="input w-full text-sm"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider text-t3 mb-1.5">
                Special Instructions
              </label>
              <input
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
                placeholder="Notes for generation…"
                className="input w-full text-sm"
              />
            </div>
          </div>

          {/* ── Grade Target — who gets this assignment ── */}
          <div className="p-4 border" style={{ background: "var(--bg-muted)", borderColor: "var(--border)", borderRadius: "var(--r-md)", borderLeft: "3px solid var(--accent)" }}>
            <div className="flex items-center justify-between mb-3">
              <div>
                <div className="section-label">— Grade target —</div>
                <div className="text-xs mt-0.5" style={{ color: "var(--text-2)" }}>
                  Who in the class actually receives this assignment?
                </div>
              </div>
              <div className="stamp">{
                targetMode === "all" ? "All students" :
                targetMode === "auto" ? "Auto by grade" :
                targetMode === "single" ? `${targetSubject} · Gr ${targetGradeMin}` :
                targetMode === "range"  ? `${targetSubject} · Gr ${Math.min(targetGradeMin, targetGradeMax)}–${Math.max(targetGradeMin, targetGradeMax)}` :
                targetStudentIds.length > 0 ? `${targetStudentIds.length} student${targetStudentIds.length === 1 ? "" : "s"}` : "Pick students"
              }</div>
            </div>

            <div className="flex gap-2 mb-3 flex-wrap">
              {([
                ["all",      "Entire class"],
                ["students", "Specific students"],
                ["single",   "Specific grade"],
                ["range",    "Grade range"],
                ["auto",     "Auto (by grade)"],
              ] as const).map(([mode, label]) => (
                <button key={mode} onClick={() => setTargetMode(mode)} type="button"
                  className="px-3 py-1.5 text-xs font-semibold border transition-colors cursor-pointer"
                  style={{
                    borderRadius: "var(--r-md)",
                    background: targetMode === mode ? "var(--accent-light)" : "transparent",
                    color: targetMode === mode ? "var(--text-accent)" : "var(--text-2)",
                    borderColor: targetMode === mode ? "var(--accent)" : "var(--border-md)",
                  }}>{mode === "auto" ? "🎯 " : ""}{label}</button>
              ))}
            </div>

            {targetMode === "auto" && (
              <div className="flex items-start gap-4 flex-wrap">
                <div>
                  <label className="block text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: "var(--text-3)" }}>Subject</label>
                  <select value={targetSubject} onChange={e => setTargetSubject(e.target.value as any)} className="input text-sm w-32">
                    <option value="reading">📖 Reading</option>
                    <option value="math">🔢 Math</option>
                    <option value="writing">✏️ Writing</option>
                  </select>
                </div>
                <div className="text-[11px] mt-5 max-w-xs" style={{ color: "var(--text-3)" }}>
                  Creates separate grade-level versions for every student tier in this class. Each student only sees the version matching their grade level.
                </div>
              </div>
            )}

            {targetMode === "students" && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-3)" }}>
                    Pick students in this class ({targetStudentIds.length}/{classStudents.length} selected)
                  </label>
                  <div className="flex gap-2">
                    <button type="button"
                      onClick={() => setTargetStudentIds(classStudents.map((s: any) => s.id))}
                      className="text-[10px] font-semibold uppercase tracking-wider cursor-pointer"
                      style={{ color: "var(--text-accent)" }}>Select all</button>
                    <button type="button"
                      onClick={() => setTargetStudentIds([])}
                      className="text-[10px] font-semibold uppercase tracking-wider cursor-pointer"
                      style={{ color: "var(--text-3)" }}>Clear</button>
                  </div>
                </div>
                {classStudents.length === 0 ? (
                  <div className="text-[11px]" style={{ color: "var(--text-3)" }}>
                    No students enrolled in this class yet.
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-1.5 max-h-56 overflow-auto p-2 border"
                    style={{ background: "var(--bg)", borderColor: "var(--border)", borderRadius: "var(--r-md)" }}>
                    {classStudents.map((s: any) => {
                      const checked = targetStudentIds.includes(s.id);
                      return (
                        <label key={s.id} className="flex items-center gap-2 text-sm cursor-pointer px-2 py-1.5 rounded"
                          style={{ background: checked ? "var(--accent-light)" : "transparent", color: "var(--text-1)" }}>
                          <input type="checkbox" checked={checked}
                            onChange={(e) => {
                              if (e.target.checked) setTargetStudentIds([...targetStudentIds, s.id]);
                              else setTargetStudentIds(targetStudentIds.filter(id => id !== s.id));
                            }}
                            className="cursor-pointer" />
                          <span className="truncate">{s.name || s.email}</span>
                        </label>
                      );
                    })}
                  </div>
                )}
                <div className="text-[11px] mt-2" style={{ color: "var(--text-3)" }}>
                  Only the checked students will see this assignment in their pending list. Grade targeting is ignored when direct-assigning.
                </div>

                {/* Group / center toggle — turns the picked students into a
                    shared-work group with a collaborative notes pane. */}
                <div className="mt-3 p-3 rounded-lg border" style={{ background: "var(--surface-1)", borderColor: "var(--border)" }}>
                  <label className="flex items-center gap-2 text-sm font-semibold cursor-pointer" style={{ color: "var(--text-1)" }}>
                    <input type="checkbox" checked={isGroup} onChange={(e) => setIsGroup(e.target.checked)} />
                    👥 Group / Center assignment
                  </label>
                  <div className="text-[11px] mt-1" style={{ color: "var(--text-3)" }}>
                    Members see a shared group name and a collaborative notes pane alongside the assignment.
                  </div>
                  {isGroup && (
                    <input value={groupName} onChange={(e) => setGroupName(e.target.value)}
                      placeholder={'e.g. "Reading Circle A" or "Math Center"'}
                      className="input text-sm mt-2 w-full" />
                  )}
                </div>
              </div>
            )}

            {(targetMode === "single" || targetMode === "range") && (
              <div className="flex items-center gap-3 flex-wrap">
                <div>
                  <label className="block text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: "var(--text-3)" }}>Subject</label>
                  <select value={targetSubject} onChange={e => setTargetSubject(e.target.value as any)} className="input text-sm w-32">
                    <option value="reading">📖 Reading</option>
                    <option value="math">🔢 Math</option>
                    <option value="writing">✏️ Writing</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: "var(--text-3)" }}>{targetMode === "range" ? "Min grade" : "Grade"}</label>
                  <select value={targetGradeMin} onChange={e => setTargetGradeMin(Number(e.target.value))} className="input text-sm w-28">
                    <option value={0}>Kindergarten</option>
                    {Array.from({ length: 12 }).map((_, i) => (
                      <option key={i + 1} value={i + 1}>{i + 1}{["st","nd","rd"][i] || "th"} grade</option>
                    ))}
                  </select>
                </div>
                {targetMode === "range" && (
                  <div>
                    <label className="block text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: "var(--text-3)" }}>Max grade</label>
                    <select value={targetGradeMax} onChange={e => setTargetGradeMax(Number(e.target.value))} className="input text-sm w-28">
                      <option value={0}>Kindergarten</option>
                      {Array.from({ length: 12 }).map((_, i) => (
                        <option key={i + 1} value={i + 1}>{i + 1}{["st","nd","rd"][i] || "th"} grade</option>
                      ))}
                    </select>
                  </div>
                )}
                <div className="text-[11px] ml-auto max-w-xs" style={{ color: "var(--text-3)" }}>
                  Students whose <strong>{targetSubject}</strong> grade is in this range will see this assignment. Others in the class won't.
                </div>
              </div>
            )}
          </div>

          {/* ── Advanced customization (optional) ── */}
          <div className="p-4 border" style={{ background: "var(--bg-muted)", borderColor: "var(--border)", borderRadius: "var(--r-md)" }}>
            <button
              type="button"
              onClick={() => setShowAdvanced(v => !v)}
              className="w-full flex items-center justify-between cursor-pointer"
              style={{ color: "var(--text-1)" }}
            >
              <div className="text-left">
                <div className="section-label">— Advanced customization —</div>
                <div className="text-xs mt-0.5" style={{ color: "var(--text-2)" }}>
                  Fine-tune question count, difficulty hints, learning objective, and private teacher notes
                </div>
              </div>
              <span className="stamp">{showAdvanced ? "Hide" : "Show"}</span>
            </button>

            {showAdvanced && (
              <div className="mt-4 grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: "var(--text-3)" }}>Question count (1–20)</label>
                  <input
                    type="number" min={1} max={20}
                    value={customQuestionCount}
                    onChange={e => setCustomQuestionCount(e.target.value === "" ? "" : Math.max(1, Math.min(20, Number(e.target.value))))}
                    placeholder="default"
                    className="input w-full"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: "var(--text-3)" }}>Estimated minutes</label>
                  <input
                    type="number" min={5} max={120}
                    value={customEstimatedMinutes}
                    onChange={e => setCustomEstimatedMinutes(e.target.value === "" ? "" : Math.max(1, Number(e.target.value)))}
                    placeholder="default"
                    className="input w-full"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: "var(--text-3)" }}>Question type</label>
                  <select
                    value={customQuestionType}
                    onChange={e => setCustomQuestionType(e.target.value)}
                    className="input w-full"
                  >
                    <option value="">Default (mixed)</option>
                    <option value="multiple-choice">Multiple choice</option>
                    <option value="short-answer">Short answer</option>
                    <option value="fill-in-blank">Fill in the blank</option>
                    <option value="extended-response">Extended response</option>
                    <option value="word-problems">Word problems</option>
                  </select>
                </div>
                <div className="flex items-end">
                  <label className="flex items-center gap-2 cursor-pointer text-sm" style={{ color: "var(--text-1)" }}>
                    <input
                      type="checkbox"
                      checked={customHintsAllowed}
                      onChange={e => setCustomHintsAllowed(e.target.checked)}
                      className="cursor-pointer"
                    />
                    Allow hints during work
                  </label>
                </div>
                <div className="col-span-2">
                  <label className="block text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: "var(--text-3)" }}>Learning objective</label>
                  <input
                    value={customLearningObjective}
                    onChange={e => setCustomLearningObjective(e.target.value)}
                    placeholder='e.g. "Identify main idea and supporting details in informational text"'
                    className="input w-full"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: "var(--text-3)" }}>Focus keywords / vocabulary</label>
                  <input
                    value={customFocusKeywords}
                    onChange={e => setCustomFocusKeywords(e.target.value)}
                    placeholder="comma-separated, e.g. inference, evidence, theme"
                    className="input w-full"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: "var(--text-3)" }}>Private teacher notes (not shown to students)</label>
                  <textarea
                    value={customTeacherNotes}
                    onChange={e => setCustomTeacherNotes(e.target.value)}
                    placeholder="Internal notes on intent, pacing, differentiation…"
                    rows={3}
                    className="input w-full"
                  />
                </div>
              </div>
            )}
          </div>

          {/* PDF import card — upload a worksheet and let Claude extract questions */}
          <div style={{ border: '1px dashed rgba(99,102,241,0.4)', borderRadius: 12, padding: '14px', marginBottom: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.15em', color: 'rgba(139,92,246,0.8)', marginBottom: 8 }}>
              📄 Import from PDF
            </div>
            <p style={{ fontSize: 12, color: 'rgba(226,232,240,0.5)', marginBottom: 10 }}>
              Upload a worksheet PDF from TPT, K12, ReadWorks, or any teaching site
            </p>
            <label style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 8, background: 'rgba(99,102,241,0.15)', color: '#a78bfa', fontSize: 13, fontWeight: 600, border: '1px solid rgba(99,102,241,0.3)' }}>
              <input type="file" accept=".pdf" style={{ display: 'none' }} onChange={handlePdfUpload} disabled={pdfParsing} />
              {pdfParsing ? '⏳ Parsing…' : '📎 Choose PDF'}
            </label>
            {pdfErr && <div style={{ color: '#f87171', fontSize: 11, marginTop: 6 }}>{pdfErr}</div>}
          </div>

          {/* Generate button */}
          <div className={`rounded-xl p-4 border ${dk ? "bg-violet-500/[0.06] border-violet-500/20" : "bg-violet-50 border-violet-200"}`}>
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className={`text-sm font-semibold ${dk ? "text-violet-300" : "text-violet-800"}`}>
                  Worksheet Generator
                </div>
                <div className={`text-xs mt-0.5 ${dk ? "text-violet-400/70" : "text-violet-600"}`}>
                  Generate a full paper-style worksheet with questions based on your title, subject & grade
                </div>
              </div>
              <button
                onClick={handleGenerate}
                disabled={generating || !title.trim()}
                className="flex items-center gap-2 px-4 py-2 rounded-xl font-semibold text-sm text-white transition-all flex-shrink-0"
                style={{ background: generating ? "rgba(139,92,246,0.5)" : "linear-gradient(135deg,#8b5cf6,#6366f1)", opacity: !title.trim() ? 0.5 : 1 }}
              >
                {generating ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                {generating ? "Generating…" : "Generate Worksheet"}
              </button>
            </div>
            <div className="mt-3">
              <label className={`block text-[10px] font-semibold uppercase tracking-wider mb-1 ${dk ? "text-violet-400/70" : "text-violet-600"}`}>
                Reading Passage <span style={{ fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>(optional — leave blank to auto-generate)</span>
              </label>
              <textarea
                value={genPassage}
                onChange={e => setGenPassage(e.target.value)}
                placeholder="Paste your own passage here, or leave blank and AI will write one…"
                rows={3}
                className="input w-full text-xs"
                style={{ resize: "vertical" }}
              />
            </div>
            {genError && <p className="text-red-400 text-xs mt-2">{genError}</p>}
          </div>

          {/* Video → Assignment generator */}
          <div className={`rounded-xl p-4 border ${dk ? "bg-rose-500/[0.06] border-rose-500/20" : "bg-rose-50 border-rose-200"}`}>
            <div className="flex items-start justify-between gap-3 mb-3">
              <div>
                <div className={`text-sm font-semibold flex items-center gap-1.5 ${dk ? "text-rose-300" : "text-rose-800"}`}>
                  ▶︎ Video Assignment Generator
                </div>
                <div className={`text-xs mt-0.5 ${dk ? "text-rose-400/70" : "text-rose-600"}`}>
                  Paste a YouTube URL — Claude pulls the transcript and writes comprehension questions for {grade || "this grade"}.
                </div>
              </div>
              <button
                onClick={handleGenerateFromVideo}
                disabled={videoGenerating || !videoUrl.trim()}
                className="flex items-center gap-2 px-4 py-2 rounded-xl font-semibold text-sm text-white transition-all flex-shrink-0"
                style={{ background: videoGenerating ? "rgba(244,63,94,0.5)" : "linear-gradient(135deg,#f43f5e,#e11d48)", opacity: !videoUrl.trim() ? 0.5 : 1 }}
              >
                {videoGenerating ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                {videoGenerating ? "Generating…" : "Generate from Video"}
              </button>
            </div>
            <div className="flex items-center gap-2">
              <input
                value={videoUrl}
                onChange={(e) => { setVideoUrl(e.target.value); setVideoGenError(""); }}
                placeholder="https://www.youtube.com/watch?v=…  or  https://youtu.be/…"
                className="input text-sm flex-1"
                disabled={videoGenerating}
              />
              <label className={`text-[10px] font-semibold uppercase tracking-wider ${dk ? "text-rose-300/70" : "text-rose-700"}`}>
                Qs
              </label>
              <input
                type="number"
                min={3}
                max={15}
                value={videoQuestionCount}
                onChange={(e) => setVideoQuestionCount(Math.max(3, Math.min(15, Number(e.target.value) || 6)))}
                className="input text-sm"
                style={{ width: 64 }}
                disabled={videoGenerating}
              />
            </div>
            {videoGenError && <p className="text-red-400 text-xs mt-2">{videoGenError}</p>}
            {videoGenNote && <p className="text-amber-400 text-xs mt-2">⚠️ {videoGenNote}</p>}
          </div>

          {generated && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
              <Check size={13} className="text-emerald-400 flex-shrink-0" />
              <span className="text-xs font-semibold text-emerald-300">
                {videoUrl.trim() ? "Video assignment generated — preview in the panel on the right" : "Worksheet generated — preview in the panel on the right"}
              </span>
            </div>
          )}

          {createError && <p className="text-red-400 text-xs">{createError}</p>}
          <div className="flex gap-2 pt-2 flex-wrap">
            <button onClick={handleCreate} disabled={!title || !classId} className="btn-primary gap-2">
              <Check size={14} />
              {generated ? "Save & Assign Worksheet" : "Create Assignment"}
            </button>
            <button
              onClick={handleCreateWeekly}
              disabled={!title || !classId || !generated}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl font-semibold text-sm border cursor-pointer transition-all disabled:opacity-40"
              style={{ border: "1px solid rgba(245,158,11,0.4)", color: "#F59E0B", background: "rgba(245,158,11,0.08)" }}
            >
              📅 Assign for Week (Mon–Fri)
            </button>
            <button onClick={() => { setShowForm(false); setGenerated(null); setGenError(""); setVideoUrl(""); setVideoGenError(""); setVideoGenNote(""); }} className="btn-ghost">Cancel</button>
          </div>
        </div>
      )}

          {/* Assignment list below form — compact */}
          {assignments.length > 0 && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between px-1 mb-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-t3">
                  {assignments.length} assignment{assignments.length === 1 ? "" : "s"}
                </span>
                {selectedIds.size > 0 && (
                  <span className="text-[10px] font-semibold" style={{ color: "var(--accent)" }}>
                    {selectedIds.size} selected
                  </span>
                )}
              </div>
              {assignments.slice(0, 12).map((a) => {
                const isSelected = selectedIds.has(a.id);
                return (
                  <div
                    key={a.id}
                    className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl border cursor-pointer transition-all group"
                    style={{
                      borderColor: isSelected ? "rgba(99,102,241,0.45)" : "rgba(255,255,255,0.06)",
                      background: isSelected ? "rgba(99,102,241,0.08)" : "var(--bg-surface)",
                    }}
                    onClick={() => toggleSelect(a.id)}
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleSelect(a.id)}
                      onClick={(e) => e.stopPropagation()}
                      className="flex-shrink-0 cursor-pointer accent-violet-500"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-semibold truncate text-t1 leading-tight">{a.title}</div>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        {a.target_subject && (
                          <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full"
                            style={{ background: "rgba(139,92,246,0.15)", color: "#c4b5fd" }}>
                            {a.target_subject}
                          </span>
                        )}
                        {a.created_at && (
                          <span className="text-[9px] text-t3">
                            {new Date(a.created_at).toLocaleDateString()}
                          </span>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={(e) => { e.stopPropagation(); window.open(`/print/assignment/${a.id}`, "_blank", "noopener"); }}
                      className="opacity-0 group-hover:opacity-60 text-t3 hover:text-t1 cursor-pointer transition-all p-1 rounded"
                      title="Print"
                    >
                      <Printer size={11} />
                    </button>
                  </div>
                );
              })}
              {assignments.length > 12 && (
                <div className="text-[10px] text-t3 text-center py-1.5 opacity-60">
                  +{assignments.length - 12} more…
                </div>
              )}
            </div>
          )}

        </div>{/* end LEFT COLUMN */}

        {/* RIGHT COLUMN — preview area (60%) */}
        <div className="flex-1 min-w-0">

          {/* RIGHT: Paper preview when form is showing + assignment generated */}
          {showForm && generated && (
            <div className="sticky top-4 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div className="text-xs font-semibold text-emerald-400 flex items-center gap-1.5">
                  <Check size={13} /> Worksheet preview
                </div>
                <button
                  onClick={() => window.print()}
                  className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg border border-white/10 text-t3 hover:text-t1 cursor-pointer transition-colors"
                >
                  <Printer size={11} /> Print
                </button>
              </div>
              <PaperPreview assignment={generated} dk={dk} />
            </div>
          )}

          {/* RIGHT: placeholder when no preview */}
          {(!showForm || !generated) && (
            <div
              className="sticky top-4 flex flex-col items-center justify-center rounded-2xl border-2 border-dashed py-20 text-center"
              style={{ borderColor: "rgba(255,255,255,0.07)", minHeight: 340 }}
            >
              <div className="text-4xl mb-3 opacity-20">📄</div>
              <p className="text-sm font-semibold text-t3">Generate an assignment to preview it here</p>
              <p className="text-xs text-t3 mt-1 opacity-60">Fill in the form and click "Generate Worksheet"</p>
            </div>
          )}

        </div>{/* end RIGHT COLUMN */}

      </div>{/* end two-column flex wrapper */}

      {/* ── Full assignments table / bulk toolbar ── */}
      {/* Bulk toolbar — appears when any row is selected */}
      {assignments.length > 0 && (
        <div className="flex items-center gap-3 mb-3 px-3 py-2 rounded-lg text-sm"
          style={{ background: selectedIds.size > 0 ? "var(--accent-light)" : "transparent", border: selectedIds.size > 0 ? "1px solid var(--accent)" : "1px solid transparent" }}>
          <label className="flex items-center gap-2 cursor-pointer" style={{ color: "var(--text-2)" }}>
            <input type="checkbox"
              checked={selectedIds.size > 0 && selectedIds.size === assignments.length}
              ref={(el) => { if (el) el.indeterminate = selectedIds.size > 0 && selectedIds.size < assignments.length; }}
              onChange={toggleSelectAll}
            />
            <span className="text-xs font-semibold uppercase tracking-wider">
              {selectedIds.size === 0 ? "Select all" : `${selectedIds.size} selected`}
            </span>
          </label>
          {selectedIds.size > 0 && (
            <>
              <button onClick={() => setBulkModal("assign")}
                className="text-xs font-semibold px-2.5 py-1 rounded-md cursor-pointer"
                style={{ border: "1px solid var(--accent)", color: "var(--accent)", background: "var(--surface-1)" }}>
                📤 Assign to students
              </button>
              <button onClick={() => setBulkModal("grade")}
                className="text-xs font-semibold px-2.5 py-1 rounded-md cursor-pointer"
                style={{ border: "1px solid color-mix(in srgb, var(--info) 45%, transparent)", color: "var(--info)", background: "var(--surface-1)" }}>
                🎯 Change grade
              </button>
              <button onClick={async () => {
                  if (!confirm(`Delete ${selectedIds.size} assignment${selectedIds.size === 1 ? "" : "s"}? Submissions will be deleted too. Cannot be undone.`)) return;
                  setBulkBusy(true);
                  try {
                    await api.bulkAssignments({ assignmentIds: Array.from(selectedIds), action: "delete" });
                    setSelectedIds(new Set());
                    await loadAssignments(classId);
                  } catch (e: any) { alert(`Bulk delete failed: ${e?.message || e}`); }
                  finally { setBulkBusy(false); }
                }}
                disabled={bulkBusy}
                className="text-xs font-semibold px-2.5 py-1 rounded-md cursor-pointer"
                style={{ border: "1px solid color-mix(in srgb, var(--danger) 45%, transparent)", color: "var(--danger)", background: "var(--surface-1)", marginLeft: "auto" }}>
                🗑 Delete selected
              </button>
            </>
          )}
        </div>
      )}

      {/* Assignments list */}
      <div className="space-y-3">
        {assignments.map((a) => {
          const parsed = (() => { try { return a.content ? JSON.parse(a.content) : null; } catch { return null; } })();
          const isExpanded = expandedId === a.id;
          const isSelected = selectedIds.has(a.id);
          const isEditingTitle = !!inlineEdit && inlineEdit.id === a.id && inlineEdit.field === "title";
          const isEditingDesc = !!inlineEdit && inlineEdit.id === a.id && inlineEdit.field === "description";
          return (
            <div key={a.id} className="card overflow-hidden"
              style={isSelected ? { boxShadow: "0 0 0 2px var(--accent)" } : undefined}>
              <div className="flex items-start justify-between gap-3">
                <input type="checkbox" checked={isSelected} onChange={() => toggleSelect(a.id)}
                  className="mt-1 flex-shrink-0 cursor-pointer" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    {isEditingTitle ? (
                      <input
                        autoFocus
                        value={inlineEdit!.draft}
                        onChange={(e) => setInlineEdit({ ...inlineEdit!, draft: e.target.value })}
                        onBlur={() => saveInline(a.id, "title", inlineEdit!.draft)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") { e.preventDefault(); saveInline(a.id, "title", inlineEdit!.draft); }
                          else if (e.key === "Escape") { setInlineEdit(null); }
                        }}
                        className="input text-sm font-semibold flex-1"
                      />
                    ) : (
                      <h3
                        onClick={() => setInlineEdit({ id: a.id, field: "title", draft: a.title || "" })}
                        title="Click to edit"
                        className={`font-semibold cursor-text hover:opacity-70 ${dk ? "text-white" : "text-gray-900"}`}
                      >{a.title}</h3>
                    )}
                    {parsed && (
                      <span className="stamp" style={{ background: "var(--accent-light)", color: "var(--text-accent)", borderLeftColor: "var(--accent)" }}>
                        Worksheet
                      </span>
                    )}
                    {a.scheduled_date && (
                      <span className="stamp" style={{ background: "color-mix(in srgb, var(--warning) 14%, transparent)", color: "var(--warning)", borderLeftColor: "var(--warning)" }}>
                        📅 {a.scheduled_date}
                      </span>
                    )}
                    {(() => {
                      // Parse direct-assign list once (JSON text column).
                      let tStudents: string[] = [];
                      if (a.target_student_ids) {
                        try { const p = JSON.parse(a.target_student_ids); if (Array.isArray(p)) tStudents = p; } catch {}
                      }
                      if (tStudents.length > 0) {
                        return (
                          <span className="stamp" style={{ background: "color-mix(in srgb, var(--info) 14%, transparent)", color: "var(--info)", borderLeftColor: "var(--info)" }}>
                            🎯 → {tStudents.length} student{tStudents.length === 1 ? "" : "s"}
                          </span>
                        );
                      }
                      if (a.target_grade_min != null) {
                        return (
                          <span className="stamp" style={{ background: "color-mix(in srgb, var(--info) 14%, transparent)", color: "var(--info)", borderLeftColor: "var(--info)" }}>
                            🎯 {a.target_subject || "any"} · {
                              a.target_grade_max != null && a.target_grade_max !== a.target_grade_min
                                ? `Gr ${a.target_grade_min}–${a.target_grade_max}`
                                : `Gr ${a.target_grade_min}`
                            }
                          </span>
                        );
                      }
                      return <span className="chip">→ Whole class</span>;
                    })()}
                  </div>
                  {isEditingDesc ? (
                    <textarea
                      autoFocus
                      rows={2}
                      value={inlineEdit!.draft}
                      onChange={(e) => setInlineEdit({ ...inlineEdit!, draft: e.target.value })}
                      onBlur={() => saveInline(a.id, "description", inlineEdit!.draft)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); saveInline(a.id, "description", inlineEdit!.draft); }
                        else if (e.key === "Escape") { setInlineEdit(null); }
                      }}
                      className="input text-sm mt-0.5 w-full"
                    />
                  ) : (
                    <p
                      onClick={() => setInlineEdit({ id: a.id, field: "description", draft: a.description || "" })}
                      title="Click to edit"
                      className={`text-sm mt-0.5 line-clamp-1 cursor-text hover:opacity-70 ${dk ? "text-white/40" : "text-gray-500"}`}
                    >{a.description || <span style={{ fontStyle: "italic", opacity: 0.5 }}>Click to add description</span>}</p>
                  )}
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {a.due_date && (
                    <div className={`text-xs ${dk ? "text-white/30" : "text-gray-400"}`}>
                      Due {new Date(a.due_date).toLocaleDateString()}
                    </div>
                  )}
                  <div className={`text-xs font-semibold px-2 py-0.5 rounded-full ${dk ? "bg-violet-500/10 text-violet-400" : "bg-violet-50 text-violet-600"}`}>
                    {(a.rubric || []).reduce((s: number, r: any) => s + r.maxPoints, 0)} pts
                  </div>
                  {parsed && (
                    <button
                      onClick={() => setExpandedId(isExpanded ? null : a.id)}
                      className={`p-1.5 rounded-lg transition-colors cursor-pointer ${dk ? "text-white/30 hover:text-white/60 hover:bg-white/[0.05]" : "text-gray-400 hover:text-gray-700 hover:bg-gray-100"}`}
                    >
                      {isExpanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                    </button>
                  )}
                </div>
              </div>

              {/* Per-assignment metadata strip */}
              <div className="flex items-center gap-2.5 mt-2 flex-wrap">
                {a.target_subject && (
                  <span className="inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full"
                    style={{ background: "rgba(99,102,241,0.1)", color: "#a5b4fc" }}>
                    {a.target_subject === "math" ? "🔢" : a.target_subject === "writing" ? "✏️" : "📖"} {a.target_subject}
                  </span>
                )}
                {a.question_count != null && (
                  <span className="text-[10px] font-semibold text-t3">{a.question_count} Qs</span>
                )}
                {a.estimated_minutes != null && (
                  <span className="text-[10px] font-semibold text-t3">~{a.estimated_minutes} min</span>
                )}
                <span className="text-[10px] text-t3">{a.student_id ? "Per-student" : "Whole class"}</span>
                {a.created_at && (
                  <span className="text-[10px] text-t3 ml-auto">
                    {new Date(a.created_at).toLocaleDateString()}
                  </span>
                )}
              </div>

              {/* Per-assignment action row */}
              <div className="flex gap-1.5 mt-3 pt-3 flex-wrap" style={{ borderTop: "1px solid var(--border)" }}>
                <button
                  onClick={() => setEditingAssignment(a)}
                  className="text-[11px] font-semibold px-2.5 py-1.5 rounded-lg cursor-pointer transition-all hover:bg-white/[0.05]"
                  style={{ border: "1px solid var(--border-md)", color: "var(--text-2)" }}>
                  Edit
                </button>
                <button
                  onClick={() => handleAdjust(a.id, "easier")}
                  disabled={!!adjusting[a.id]}
                  className="text-[11px] font-semibold px-2.5 py-1.5 rounded-lg cursor-pointer transition-all"
                  style={{ border: "1px solid rgba(16,185,129,0.25)", color: "#34d399", background: "rgba(16,185,129,0.06)" }}>
                  {adjusting[a.id] === "easier" ? "…" : "Easier"}
                </button>
                <button
                  onClick={() => handleAdjust(a.id, "harder")}
                  disabled={!!adjusting[a.id]}
                  className="text-[11px] font-semibold px-2.5 py-1.5 rounded-lg cursor-pointer transition-all"
                  style={{ border: "1px solid rgba(245,158,11,0.25)", color: "#fbbf24", background: "rgba(245,158,11,0.06)" }}>
                  {adjusting[a.id] === "harder" ? "…" : "Harder"}
                </button>
                <button
                  onClick={() => handleRegenerate(a.id)}
                  disabled={!!adjusting[a.id]}
                  className="text-[11px] font-semibold px-2.5 py-1.5 rounded-lg cursor-pointer transition-all"
                  style={{ border: "1px solid rgba(139,92,246,0.3)", color: "#a78bfa", background: "rgba(139,92,246,0.08)" }}>
                  {adjusting[a.id] === "regen" ? "Regenerating…" : "Regenerate"}
                </button>
                <button
                  onClick={() => window.open(`/print/assignment/${a.id}`, "_blank", "noopener")}
                  className="text-[11px] font-semibold px-2.5 py-1.5 rounded-lg cursor-pointer transition-all hover:bg-white/[0.05]"
                  title="Open printable PDF view"
                  style={{ border: "1px solid var(--border-md)", color: "var(--text-2)" }}>
                  <Printer size={11} className="inline mr-1" />Print
                </button>
                <button
                  onClick={async () => {
                    if (debugAssignmentId === a.id) { setDebugAssignmentId(null); setDebugData(null); return; }
                    setDebugAssignmentId(a.id);
                    setDebugLoading(true);
                    setDebugData(null);
                    try {
                      const results = await Promise.all(
                        classStudents.map((s: any) =>
                          fetch(`/api/assignments/class/${classId}/debug-pending?studentId=${s.id}`, {
                            headers: { Authorization: `Bearer ${localStorage.getItem("token")}` }
                          }).then(r => r.json()).then(d => ({ student: s, data: d }))
                        )
                      );
                      setDebugData(results);
                    } catch (e: any) { alert("Debug failed: " + e.message); }
                    finally { setDebugLoading(false); }
                  }}
                  className="text-[11px] font-semibold px-2.5 py-1.5 rounded-lg cursor-pointer transition-all"
                  style={{ border: "1px solid rgba(34,197,94,0.3)", color: "#4ade80", background: "rgba(34,197,94,0.06)" }}>
                  👁 Who sees this?
                </button>
                <button
                  onClick={() => {
                    if (assigningId === a.id) { setAssigningId(null); return; }
                    // Pre-populate from existing target_student_ids
                    let existing: string[] = [];
                    try { const p = JSON.parse(a.target_student_ids || "[]"); if (Array.isArray(p)) existing = p; } catch {}
                    setAssignDraft(existing);
                    setAssigningId(a.id);
                  }}
                  className="text-[11px] font-semibold px-2.5 py-1.5 rounded-lg cursor-pointer transition-all"
                  style={{ border: "1px solid rgba(56,189,248,0.3)", color: "#38bdf8", background: "rgba(56,189,248,0.06)" }}>
                  👤 Assign to students
                </button>
                <button
                  onClick={async () => {
                    const count = await api.getAssignmentSubmissionCount(a.id).catch(() => ({ count: 0 }));
                    const warn = count.count > 0
                      ? `Delete "${a.title}"?\n\n⚠️ ${count.count} student${count.count === 1 ? " has" : "s have"} already submitted. Their submissions will be deleted too.\n\nThis cannot be undone.`
                      : `Delete "${a.title}"?\n\nThis will remove it from every student in this class. Cannot be undone.`;
                    if (!confirm(warn)) return;
                    setAdjusting(p => ({ ...p, [a.id]: "delete" }));
                    try {
                      await api.deleteAssignment(a.id);
                      await loadAssignments(classId);
                    } catch (e: any) { alert("Delete failed: " + e.message); }
                    finally { setAdjusting(p => { const n = { ...p }; delete n[a.id]; return n; }); }
                  }}
                  disabled={!!adjusting[a.id]}
                  className="text-[11px] font-semibold px-2.5 py-1.5 rounded-lg cursor-pointer transition-all ml-auto"
                  style={{ border: "1px solid rgba(239,68,68,0.25)", color: "#f87171", background: "rgba(239,68,68,0.06)" }}>
                  {adjusting[a.id] === "delete" ? "Deleting…" : "Delete"}
                </button>
              </div>

              {/* Inline student assigner */}
              {assigningId === a.id && (
                <div className="mt-3 p-3 rounded-xl space-y-2" style={{ background: "rgba(56,189,248,0.06)", border: "1px solid rgba(56,189,248,0.2)" }}>
                  <div className="text-xs font-bold mb-1" style={{ color: "#38bdf8" }}>
                    👤 Assign to specific students
                    <span className="ml-2 font-normal opacity-60">Leave all unchecked = visible to whole class</span>
                  </div>
                  <div className="grid grid-cols-2 gap-1.5">
                    {classStudents.map((s: any) => (
                      <label key={s.id} className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg cursor-pointer transition-all"
                        style={{ background: assignDraft.includes(s.id) ? "rgba(56,189,248,0.12)" : "var(--bg-surface)", border: "1px solid", borderColor: assignDraft.includes(s.id) ? "rgba(56,189,248,0.4)" : "var(--border)" }}>
                        <input
                          type="checkbox"
                          checked={assignDraft.includes(s.id)}
                          onChange={() => setAssignDraft(prev =>
                            prev.includes(s.id) ? prev.filter(id => id !== s.id) : [...prev, s.id]
                          )}
                          className="accent-sky-400 cursor-pointer"
                        />
                        <span className="text-xs font-semibold" style={{ color: "var(--text-1)" }}>{s.name}</span>
                      </label>
                    ))}
                  </div>
                  <div className="flex gap-2 pt-1">
                    <button
                      onClick={async () => {
                        try {
                          await api.updateAssignment(a.id, { targetStudentIds: assignDraft });
                          await loadAssignments(classId);
                          setAssigningId(null);
                        } catch (e: any) { alert("Failed: " + e.message); }
                      }}
                      className="text-xs font-bold px-3 py-1.5 rounded-lg cursor-pointer"
                      style={{ background: "rgba(56,189,248,0.18)", color: "#38bdf8", border: "1px solid rgba(56,189,248,0.3)" }}>
                      Save
                    </button>
                    <button
                      onClick={() => { setAssignDraft([]); setAssigningId(null); }}
                      className="text-xs px-3 py-1.5 rounded-lg cursor-pointer"
                      style={{ color: "var(--text-3)", border: "1px solid var(--border)" }}>
                      Cancel
                    </button>
                    {assignDraft.length > 0 && (
                      <button
                        onClick={() => setAssignDraft(classStudents.map((s: any) => s.id))}
                        className="text-xs px-3 py-1.5 rounded-lg cursor-pointer"
                        style={{ color: "var(--text-3)", border: "1px solid var(--border)" }}>
                        Select all
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* Who sees this? debug panel */}
              {debugAssignmentId === a.id && (
                <div className="mt-3 p-3 rounded-xl text-xs" style={{ background: "rgba(34,197,94,0.06)", border: "1px solid rgba(34,197,94,0.2)" }}>
                  <div className="font-bold mb-2" style={{ color: "#4ade80" }}>👁 Assignment visibility for "{a.title}"</div>
                  {debugLoading ? (
                    <div style={{ color: "var(--text-3)" }}>Checking…</div>
                  ) : debugData ? (
                    <div className="space-y-1">
                      {debugData.map(({ student, data }: any) => {
                        const match = (data?.assignments || []).find((r: any) => r.id === a.id);
                        if (!match) return (
                          <div key={student.id} className="flex items-center gap-2">
                            <span style={{ color: "#f87171" }}>❌</span>
                            <span style={{ color: "var(--text-2)" }}>{student.name}</span>
                            <span style={{ color: "#f87171", opacity: 0.7 }}>— assignment not found in class</span>
                          </div>
                        );
                        return (
                          <div key={student.id} className="flex items-center gap-2">
                            <span>{match.visible ? "✅" : "❌"}</span>
                            <span style={{ color: "var(--text-1)", fontWeight: 600 }}>{student.name}</span>
                            <span style={{ color: match.visible ? "#4ade80" : "#f87171", opacity: 0.8 }}>
                              — {match.visible ? "can see it" : match.reason}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  ) : null}
                </div>
              )}

              {/* Expanded paper preview */}
              {isExpanded && parsed && (
                <div className="mt-4 pt-4 border-t" style={{ borderColor: "var(--border)" }}>
                  <div className="flex justify-end mb-3">
                    <button onClick={() => window.print()} className="btn-ghost text-xs gap-1.5">
                      <Printer size={12}/> Print
                    </button>
                  </div>
                  <PaperPreview assignment={parsed} dk={dk} />
                </div>
              )}
            </div>
          );
        })}
        {assignments.length === 0 && (
          <div className="text-center py-16">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl mb-4"
              style={{ background: dk ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.04)" }}>
              <FileText size={24} className="opacity-25 text-t3" />
            </div>
            <p className="text-sm font-semibold text-t3">No assignments yet</p>
            <p className="text-xs text-t3 mt-1 opacity-60">
              Create one above or use the Full Week generator to fill the calendar automatically.
            </p>
          </div>
        )}
      </div>

      {/* ── Edit modal ── */}
      {editingAssignment && (
        <EditAssignmentModal
          assignment={editingAssignment}
          dk={dk}
          onClose={() => setEditingAssignment(null)}
          onSaved={() => { setEditingAssignment(null); loadAssignments(classId); }}
        />
      )}
      {showImport && (
        <ImportModal
          dk={dk}
          classId={classId}
          onClose={() => setShowImport(false)}
          onImported={() => { setShowImport(false); loadAssignments(classId); }}
        />
      )}
      {bulkModal && (
        <BulkModal
          mode={bulkModal}
          dk={dk}
          students={classStudents}
          count={selectedIds.size}
          busy={bulkBusy}
          onClose={() => setBulkModal(null)}
          onSubmit={async (payload) => {
            setBulkBusy(true);
            try {
              await api.bulkAssignments({
                assignmentIds: Array.from(selectedIds),
                ...payload,
              });
              setSelectedIds(new Set());
              setBulkModal(null);
              await loadAssignments(classId);
            } catch (e: any) {
              alert(`Bulk ${bulkModal} failed: ${e?.message || e}`);
            } finally { setBulkBusy(false); }
          }}
        />
      )}
    </div>
  );
}

/* ── Bulk action modal (assign students OR change grade) ────────── */
function BulkModal({ mode, dk, students, count, busy, onClose, onSubmit }: {
  mode: "assign" | "grade";
  dk: boolean;
  students: any[];
  count: number;
  busy: boolean;
  onClose: () => void;
  onSubmit: (payload: {
    action: "assign" | "grade";
    studentIds?: string[];
    targetSubject?: string;
    targetGradeMin?: number;
    targetGradeMax?: number;
  }) => void | Promise<void>;
}) {
  const [picked, setPicked] = useState<string[]>([]);
  const [subject, setSubject] = useState<string>("reading");
  const [gradeMin, setGradeMin] = useState<number>(3);
  const [gradeMax, setGradeMax] = useState<number>(3);

  const toggleStudent = (id: string) => {
    setPicked((p) => p.includes(id) ? p.filter((x) => x !== id) : [...p, id]);
  };

  return createPortal(
    <div onClick={onClose}
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999, padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()}
        className={dk ? "bg-neutral-900 text-white" : "bg-white text-gray-900"}
        style={{ borderRadius: "var(--r-lg)", maxWidth: 560, width: "100%", maxHeight: "85vh", overflow: "auto", border: "1px solid var(--border)" }}>
        <div className="px-5 py-4 flex items-center justify-between" style={{ borderBottom: "1px solid var(--border)" }}>
          <h3 className="text-lg font-bold">
            {mode === "assign" ? "📤 Assign to students" : "🎯 Change grade target"}
          </h3>
          <button onClick={onClose} className="text-xl opacity-60 hover:opacity-100 cursor-pointer">×</button>
        </div>
        <div className="px-5 py-4 space-y-4">
          <div className="text-sm" style={{ color: "var(--text-2)" }}>
            Applying to <b>{count}</b> assignment{count === 1 ? "" : "s"}.
          </div>

          {mode === "assign" ? (
            <>
              <div className="flex items-center gap-2 text-xs">
                <button onClick={() => setPicked(students.map((s) => s.id))}
                  className="px-2 py-1 rounded-md cursor-pointer"
                  style={{ border: "1px solid var(--border-md)", color: "var(--text-2)" }}>Select all</button>
                <button onClick={() => setPicked([])}
                  className="px-2 py-1 rounded-md cursor-pointer"
                  style={{ border: "1px solid var(--border-md)", color: "var(--text-2)" }}>Clear</button>
                <span className="ml-auto text-xs" style={{ color: "var(--text-3)" }}>
                  {picked.length}/{students.length} selected
                </span>
              </div>
              <div style={{ maxHeight: 320, overflow: "auto", border: "1px solid var(--border)", borderRadius: "var(--r-md)" }}>
                {students.length === 0 ? (
                  <div className="p-4 text-center text-sm" style={{ color: "var(--text-3)" }}>No students in this class.</div>
                ) : (
                  students.map((s) => (
                    <label key={s.id}
                      className="flex items-center gap-2 px-3 py-2 cursor-pointer text-sm"
                      style={{ borderBottom: "1px solid var(--border)" }}>
                      <input type="checkbox" checked={picked.includes(s.id)} onChange={() => toggleStudent(s.id)} />
                      <span>{s.name || s.username || s.id}</span>
                      {s.grade != null && <span className="ml-auto text-xs" style={{ color: "var(--text-3)" }}>Gr {s.grade}</span>}
                    </label>
                  ))
                )}
              </div>
              <div className="text-xs" style={{ color: "var(--text-3)" }}>
                Selecting zero students clears the direct-assign list (reverts to whole-class visibility).
              </div>
            </>
          ) : (
            <>
              <div>
                <label className="block text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: "var(--text-3)" }}>Subject</label>
                <select value={subject} onChange={(e) => setSubject(e.target.value)} className="input text-sm w-full">
                  <option value="reading">Reading</option>
                  <option value="math">Math</option>
                  <option value="writing">Writing</option>
                  <option value="spelling">Spelling</option>
                  <option value="sel">SEL</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: "var(--text-3)" }}>Grade min</label>
                  <input type="number" min={0} max={12} value={gradeMin} onChange={(e) => setGradeMin(Number(e.target.value))} className="input text-sm w-full" />
                </div>
                <div>
                  <label className="block text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: "var(--text-3)" }}>Grade max</label>
                  <input type="number" min={0} max={12} value={gradeMax} onChange={(e) => setGradeMax(Number(e.target.value))} className="input text-sm w-full" />
                </div>
              </div>
            </>
          )}
        </div>
        <div className="px-5 py-4 flex items-center gap-2 justify-end" style={{ borderTop: "1px solid var(--border)" }}>
          <button onClick={onClose} className="btn-ghost text-sm">Cancel</button>
          <button
            disabled={busy || (mode === "assign" && students.length === 0)}
            onClick={() => {
              if (mode === "assign") onSubmit({ action: "assign", studentIds: picked });
              else onSubmit({ action: "grade", targetSubject: subject, targetGradeMin: gradeMin, targetGradeMax: gradeMax });
            }}
            className="btn-primary text-sm"
          >
            {busy ? "Saving…" : mode === "assign"
              ? `Assign to ${picked.length} student${picked.length === 1 ? "" : "s"}`
              : `Update ${count} assignment${count === 1 ? "" : "s"}`}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/* ── Import Modal (TPT URL or PDF upload) ──────────────────────── */
function ImportModal({ dk, classId, onClose, onImported }: {
  dk: boolean; classId: string; onClose: () => void; onImported: () => void;
}) {
  const [tab, setTab] = useState<"tpt" | "upload">("tpt");
  const [url, setUrl] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [gradeMin, setGradeMin] = useState<string>("");
  const [gradeMax, setGradeMax] = useState<string>("");
  const [subject, setSubject] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [result, setResult] = useState<any>(null);

  const token = () => localStorage.getItem("token") || "";

  const submitTpt = async () => {
    setErr(""); setBusy(true); setResult(null);
    try {
      const r = await fetch("/api/assignments/import-tpt", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token()}` },
        body: JSON.stringify({ url, classId }),
      });
      const data = await r.json();
      if (!r.ok) { setErr(data.error || "Import failed"); return; }
      setResult(data);
    } catch (e: any) { setErr(e?.message || "Import failed"); }
    finally { setBusy(false); }
  };

  const submitUpload = async () => {
    if (!file) { setErr("Choose a PDF file"); return; }
    setErr(""); setBusy(true); setResult(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      if (classId) fd.append("classId", classId);
      if (title) fd.append("title", title);
      if (description) fd.append("description", description);
      if (gradeMin) fd.append("targetGradeMin", gradeMin);
      if (gradeMax) fd.append("targetGradeMax", gradeMax);
      if (subject) fd.append("targetSubject", subject);
      const r = await fetch("/api/assignments/upload-pdf", {
        method: "POST",
        headers: { Authorization: `Bearer ${token()}` },
        body: fd,
      });
      const data = await r.json();
      if (!r.ok) { setErr(data.error || "Upload failed"); return; }
      setResult(data);
    } catch (e: any) { setErr(e?.message || "Upload failed"); }
    finally { setBusy(false); }
  };

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.5)" }} onClick={onClose}>
      <div className="card w-full max-w-xl" onClick={e => e.stopPropagation()} style={{ maxHeight: "90vh", overflowY: "auto" }}>
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-display text-xl" style={{ color: "var(--text-1)" }}>Import assignment</h3>
          <button onClick={onClose} className="text-sm" style={{ color: "var(--text-3)" }}>✕</button>
        </div>
        <div className="flex gap-1 mb-4" style={{ borderBottom: "1px solid var(--border)" }}>
          <button onClick={() => setTab("tpt")} className="px-3 py-2 text-sm font-semibold"
            style={{ borderBottom: tab === "tpt" ? "2px solid var(--accent)" : "2px solid transparent", color: tab === "tpt" ? "var(--accent)" : "var(--text-3)" }}>
            From TPT URL
          </button>
          <button onClick={() => setTab("upload")} className="px-3 py-2 text-sm font-semibold"
            style={{ borderBottom: tab === "upload" ? "2px solid var(--accent)" : "2px solid transparent", color: tab === "upload" ? "var(--accent)" : "var(--text-3)" }}>
            Upload PDF
          </button>
        </div>

        {tab === "tpt" && (
          <div className="space-y-3">
            <p className="text-xs" style={{ color: "var(--text-3)" }}>
              Paste a <strong>free</strong> teacherspayteachers.com product URL. Paid content is rejected — purchase first, then use Upload PDF.
            </p>
            <input value={url} onChange={e => setUrl(e.target.value)} placeholder="https://www.teacherspayteachers.com/Product/..."
              className="w-full px-3 py-2 text-sm rounded" style={{ background: "var(--bg-raised)", border: "1px solid var(--border)", color: "var(--text-1)" }} />
            <button onClick={submitTpt} disabled={busy || !url} className="btn-primary w-full">
              {busy ? "Importing…" : "Import from TPT"}
            </button>
          </div>
        )}

        {tab === "upload" && (
          <div className="space-y-3">
            <input type="file" accept="application/pdf,.pdf" onChange={e => setFile(e.target.files?.[0] || null)}
              className="w-full text-sm" style={{ color: "var(--text-1)" }} />
            <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Title (optional — uses filename)"
              className="w-full px-3 py-2 text-sm rounded" style={{ background: "var(--bg-raised)", border: "1px solid var(--border)", color: "var(--text-1)" }} />
            <textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="Description / instructions for students"
              rows={2} className="w-full px-3 py-2 text-sm rounded" style={{ background: "var(--bg-raised)", border: "1px solid var(--border)", color: "var(--text-1)" }} />
            <div className="flex gap-2">
              <input value={gradeMin} onChange={e => setGradeMin(e.target.value)} placeholder="Grade min (0-5)" type="number" min="0" max="5"
                className="flex-1 px-3 py-2 text-sm rounded" style={{ background: "var(--bg-raised)", border: "1px solid var(--border)", color: "var(--text-1)" }} />
              <input value={gradeMax} onChange={e => setGradeMax(e.target.value)} placeholder="Grade max" type="number" min="0" max="5"
                className="flex-1 px-3 py-2 text-sm rounded" style={{ background: "var(--bg-raised)", border: "1px solid var(--border)", color: "var(--text-1)" }} />
              <select value={subject} onChange={e => setSubject(e.target.value)}
                className="flex-1 px-3 py-2 text-sm rounded" style={{ background: "var(--bg-raised)", border: "1px solid var(--border)", color: "var(--text-1)" }}>
                <option value="">Subject…</option>
                <option value="reading">Reading</option>
                <option value="writing">Writing</option>
                <option value="math">Math</option>
                <option value="spelling">Spelling</option>
                <option value="sel">SEL</option>
              </select>
            </div>
            <button onClick={submitUpload} disabled={busy || !file} className="btn-primary w-full">
              {busy ? "Uploading…" : "Upload PDF & create assignment"}
            </button>
          </div>
        )}

        {err && <div className="mt-3 p-2 text-xs rounded" style={{ background: "rgba(239,68,68,0.1)", color: "var(--danger)" }}>{err}</div>}
        {result && (
          <div className="mt-3 p-3 rounded" style={{ background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.3)" }}>
            <div className="text-sm font-bold" style={{ color: "var(--text-1)" }}>✓ Imported: {result.title}</div>
            {result.source && <div className="text-xs mt-1" style={{ color: "var(--text-3)" }}>source: {result.source}{result.target_grade_min != null ? ` · grade ${result.target_grade_min}–${result.target_grade_max}` : ""}</div>}
            {result.pdfWarning && <div className="text-xs mt-1" style={{ color: "var(--warning)" }}>⚠️ {result.pdfWarning}</div>}
            {result.attached_pdf_path && <a href={result.attached_pdf_path} target="_blank" rel="noreferrer" className="text-xs underline" style={{ color: "var(--accent)" }}>Open PDF</a>}
            <button onClick={onImported} className="btn-primary mt-2 w-full">Done</button>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

/* ── Edit Assignment Modal ─────────────────────────────────────── */
function EditAssignmentModal({ assignment, dk, onClose, onSaved }: {
  assignment: any; dk: boolean; onClose: () => void; onSaved: () => void;
}) {
  const [title, setTitle] = useState(assignment.title || "");
  const [description, setDescription] = useState(assignment.description || "");
  const [videoUrl, setVideoUrl] = useState(assignment.video_url || "");
  const [teacherNotes, setTeacherNotes] = useState(assignment.teacher_notes || "");
  const [questionCount, setQuestionCount] = useState<number>(assignment.question_count || 3);
  const [estimatedMinutes, setEstimatedMinutes] = useState<number>(assignment.estimated_minutes || 5);
  const [focusKeywords, setFocusKeywords] = useState(assignment.focus_keywords || "");
  const [learningObjective, setLearningObjective] = useState(assignment.learning_objective || "");
  const [questionType, setQuestionType] = useState(assignment.question_type || "mixed");
  const [hintsAllowed, setHintsAllowed] = useState<boolean>(assignment.hints_allowed !== 0);
  const [showRawJson, setShowRawJson] = useState(false);
  const [contentText, setContentText] = useState(() => {
    try { return assignment.content ? JSON.stringify(JSON.parse(assignment.content), null, 2) : ""; }
    catch { return assignment.content || ""; }
  });
  // Structured question editor state
  const [sections, setSections] = useState<any[]>(() => {
    try {
      const c = assignment.content ? JSON.parse(assignment.content) : null;
      if (c?.sections?.length) return c.sections;
    } catch {}
    return [];
  });
  const updateQuestion = (si: number, qi: number, patch: any) => {
    setSections(prev => prev.map((s, i) => i !== si ? s : {
      ...s, questions: s.questions.map((q: any, j: number) => j === qi ? { ...q, ...patch } : q),
    }));
  };
  const updateOption = (si: number, qi: number, oi: number, val: string) => {
    setSections(prev => prev.map((s, i) => i !== si ? s : {
      ...s, questions: s.questions.map((q: any, j: number) => {
        if (j !== qi) return q;
        const options = [...(q.options || [])];
        options[oi] = val;
        return { ...q, options };
      }),
    }));
  };
  const deleteQuestion = (si: number, qi: number) => {
    if (!confirm("Delete this question?")) return;
    setSections(prev => prev.map((s, i) => i !== si ? s : {
      ...s, questions: s.questions.filter((_: any, j: number) => j !== qi),
    }));
  };
  const addQuestion = (si: number) => {
    setSections(prev => prev.map((s, i) => i !== si ? s : {
      ...s, questions: [...(s.questions || []), {
        type: "multiple_choice", text: "New question?",
        options: ["A. ", "B. ", "C. ", "D. "], correctIndex: 0, points: 5, hint: "",
      }],
    }));
  };
  const [submissionCount, setSubmissionCount] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.getAssignmentSubmissionCount(assignment.id).then(r => setSubmissionCount(r.count)).catch(() => {});
  }, [assignment.id]);

  const subject = (assignment.target_subject || "reading").toLowerCase();
  // Subject-specific objectives dropdown
  const OBJECTIVES: Record<string, string[]> = {
    reading:  ["phonics", "comprehension", "fluency", "vocabulary", "inference", "main idea"],
    writing:  ["sentence structure", "paragraph organization", "descriptive writing", "narrative", "opinion writing"],
    math:     ["addition/subtraction", "multiplication/division", "fractions", "word problems", "measurement", "geometry"],
    spelling: ["short vowels", "long vowels", "blends", "digraphs", "sight words", "compound words"],
    sel:      ["self-awareness", "self-management", "social awareness", "relationships", "decision-making"],
  };
  const objectives = OBJECTIVES[subject] || OBJECTIVES.reading;

  const handleSave = async () => {
    let parsedContent: any = null;
    if (showRawJson && contentText.trim()) {
      try { parsedContent = JSON.parse(contentText); }
      catch { alert("Content JSON is invalid. Fix it or leave raw-JSON toggle off to skip."); return; }
    } else if (sections.length) {
      // Build content from structured editor
      try {
        const original = assignment.content ? JSON.parse(assignment.content) : {};
        parsedContent = { ...original, sections };
      } catch {
        parsedContent = { title, instructions: description, sections };
      }
    }
    setSaving(true);
    try {
      await api.updateAssignment(assignment.id, {
        title, description,
        videoUrl: videoUrl.trim() || "",
        teacherNotes, questionCount, estimatedMinutes,
        focusKeywords, learningObjective, questionType,
        hintsAllowed,
        content: parsedContent ? JSON.stringify(parsedContent) : undefined,
      });
      onSaved();
    } catch (e: any) { alert("Save failed: " + e.message); }
    finally { setSaving(false); }
  };

  return createPortal(
    <div onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position: "fixed", inset: 0, zIndex: 9999, background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)",
        display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div className="card" style={{ maxWidth: 780, width: "100%", maxHeight: "92vh", overflowY: "auto",
        borderLeft: "3px solid var(--accent)" }}>
        <div className="flex items-center justify-between mb-3">
          <div>
            <div className="section-label">— Edit assignment —</div>
            <h3 className="font-display text-2xl leading-tight mt-1" style={{ color: "var(--text-1)" }}>
              Tune this<em style={{ color: "var(--accent)", fontStyle: "italic" }}> one.</em>
            </h3>
          </div>
          <button onClick={onClose} className="btn-ghost text-xs">Close</button>
        </div>

        {submissionCount != null && submissionCount > 0 && (
          <div className="p-3 mb-4" style={{
            background: "color-mix(in srgb, var(--warning) 10%, transparent)",
            borderLeft: "3px solid var(--warning)",
            borderRadius: "var(--r-md)",
            fontSize: 12, color: "var(--warning)", fontWeight: 600,
          }}>
            ⚠️ {submissionCount} student{submissionCount === 1 ? " has" : "s have"} already submitted. Edits only affect new submissions.
          </div>
        )}

        <div className="space-y-4">
          {/* Title + description */}
          <div>
            <label className="block text-[10px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: "var(--text-3)" }}>Title</label>
            <input value={title} onChange={e => setTitle(e.target.value)} className="input text-sm w-full" />
          </div>
          <div>
            <label className="block text-[10px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: "var(--text-3)" }}>Description / instructions (student sees this)</label>
            <textarea value={description} onChange={e => setDescription(e.target.value)} rows={2} className="input text-sm w-full resize-none" />
          </div>
          <div>
            <label className="block text-[10px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: "var(--text-3)" }}>📺 Video URL (optional — YouTube link plays above the assignment)</label>
            <input value={videoUrl} onChange={e => setVideoUrl(e.target.value)} placeholder="https://youtube.com/watch?v=..." className="input text-sm w-full" />
          </div>

          {/* Customization grid */}
          <div className="pt-3" style={{ borderTop: "1px solid var(--border)" }}>
            <div className="section-label mb-3">— Customization —</div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div>
                <label className="block text-[10px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: "var(--text-3)" }}>Questions</label>
                <input type="number" min={1} max={20} value={questionCount} onChange={e => setQuestionCount(Number(e.target.value))} className="input text-sm w-full" />
              </div>
              <div>
                <label className="block text-[10px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: "var(--text-3)" }}>~ Minutes</label>
                <input type="number" min={1} max={60} value={estimatedMinutes} onChange={e => setEstimatedMinutes(Number(e.target.value))} className="input text-sm w-full" />
              </div>
              <div>
                <label className="block text-[10px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: "var(--text-3)" }}>Question type</label>
                <select value={questionType} onChange={e => setQuestionType(e.target.value)} className="input text-sm w-full">
                  <option value="mixed">Mixed (auto-select)</option>
                  <option value="multiple_choice">Multiple choice</option>
                  <option value="short_answer">Short answer</option>
                  <option value="fill_blank">Fill in blank</option>
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: "var(--text-3)" }}>💡 Hints</label>
                <button type="button" onClick={() => setHintsAllowed(v => !v)}
                  className="input text-sm w-full cursor-pointer text-left"
                  style={{ color: hintsAllowed ? "var(--success)" : "var(--text-3)" }}>
                  {hintsAllowed ? "✓ Allowed" : "✕ Blocked"}
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
              <div>
                <label className="block text-[10px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: "var(--text-3)" }}>Learning objective</label>
                <select value={learningObjective} onChange={e => setLearningObjective(e.target.value)} className="input text-sm w-full">
                  <option value="">— None / general —</option>
                  {objectives.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: "var(--text-3)" }}>Focus keywords (comma-separated)</label>
                <input value={focusKeywords} onChange={e => setFocusKeywords(e.target.value)} placeholder="e.g. short vowels, CVC words" className="input text-sm w-full" />
              </div>
            </div>

            <div className="mt-3">
              <label className="block text-[10px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: "var(--text-3)" }}>
                🔒 Private teacher notes (used by the generator, student never sees)
              </label>
              <textarea value={teacherNotes} onChange={e => setTeacherNotes(e.target.value)}
                rows={2} placeholder="e.g. This student struggles with word problems — use visual hints + shorter sentences."
                className="input text-sm w-full resize-none" />
              <p className="text-[10px] mt-1" style={{ color: "var(--text-3)" }}>
                When you hit 📉 Easier / 📈 Harder / ✨ Regenerate, these notes tailor the rewrite.
              </p>
            </div>
          </div>

          {/* Structured question editor */}
          {sections.length > 0 && !showRawJson && (
            <div className="pt-3" style={{ borderTop: "1px solid var(--border)" }}>
              <div className="section-label mb-3">— Questions —</div>
              {sections.map((sec: any, si: number) => (
                <div key={si} className="mb-4">
                  {sec.title && (
                    <div className="text-xs font-semibold mb-2" style={{ color: "var(--text-2)" }}>
                      {sec.title}
                    </div>
                  )}
                  {(sec.questions || []).map((q: any, qi: number) => (
                    <div key={qi} className="p-3 mb-2" style={{
                      background: "var(--surface-2)", borderRadius: "var(--r-md)",
                      border: "1px solid var(--border)",
                    }}>
                      <div className="flex items-start gap-2 mb-2">
                        <span className="text-[10px] font-bold mt-1.5" style={{ color: "var(--text-3)" }}>
                          Q{qi + 1}
                        </span>
                        <textarea value={q.text || ""} onChange={e => updateQuestion(si, qi, { text: e.target.value })}
                          rows={2} className="input text-sm flex-1 resize-none"
                          placeholder="Question text" />
                        <button type="button" onClick={() => deleteQuestion(si, qi)}
                          className="btn-ghost text-xs" style={{ color: "var(--danger)" }}>✕</button>
                      </div>

                      <div className="mb-2">
                        <label className="block text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: "var(--text-3)" }}>Type</label>
                        <select value={q.type || "multiple_choice"} onChange={e => updateQuestion(si, qi, { type: e.target.value })}
                          className="input text-xs">
                          <option value="multiple_choice">Multiple choice</option>
                          <option value="short_answer">Short answer</option>
                          <option value="fill_blank">Fill in blank</option>
                        </select>
                      </div>

                      {q.type === "multiple_choice" && (
                        <div className="space-y-1.5 mb-2">
                          <label className="block text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-3)" }}>
                            Options (click radio for correct answer)
                          </label>
                          {(q.options || ["", "", "", ""]).map((opt: string, oi: number) => (
                            <div key={oi} className="flex items-center gap-2">
                              <input type="radio" name={`q-${si}-${qi}`} checked={q.correctIndex === oi}
                                onChange={() => updateQuestion(si, qi, { correctIndex: oi })}
                                style={{ accentColor: "var(--success)" }} />
                              <input value={opt} onChange={e => updateOption(si, qi, oi, e.target.value)}
                                className="input text-sm flex-1" placeholder={`Option ${oi + 1}`} />
                            </div>
                          ))}
                        </div>
                      )}

                      {(q.type === "short_answer" || q.type === "fill_blank") && (
                        <div className="mb-2">
                          <label className="block text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: "var(--text-3)" }}>
                            Correct answer
                          </label>
                          <input value={q.correctAnswer || q.answer || ""}
                            onChange={e => updateQuestion(si, qi, { correctAnswer: e.target.value })}
                            className="input text-sm w-full" placeholder="Expected answer" />
                        </div>
                      )}

                      <div>
                        <label className="block text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: "var(--text-3)" }}>Hint</label>
                        <input value={q.hint || ""} onChange={e => updateQuestion(si, qi, { hint: e.target.value })}
                          className="input text-xs w-full" placeholder="Optional gentle hint" />
                      </div>
                    </div>
                  ))}
                  <button type="button" onClick={() => addQuestion(si)}
                    className="btn-ghost text-xs mt-1">+ Add question</button>
                </div>
              ))}
            </div>
          )}

          {/* Raw JSON toggle — collapsed by default */}
          <div className="pt-3" style={{ borderTop: "1px solid var(--border)" }}>
            <button type="button" onClick={() => setShowRawJson(v => !v)}
              className="btn-ghost text-[11px]" style={{ padding: "4px 8px" }}>
              {showRawJson ? "▾ Hide" : "▸ Show"} raw content JSON (power users)
            </button>
            {showRawJson && (
              <div className="mt-2">
                <textarea value={contentText} onChange={e => setContentText(e.target.value)} rows={14}
                  className="input text-xs w-full resize-none font-mono" spellCheck={false} />
                <p className="text-[10px] mt-1" style={{ color: "var(--text-3)" }}>
                  Editing this replaces the stored questions directly. Leave unchanged to only save the fields above.
                </p>
              </div>
            )}
          </div>

          <div className="flex gap-2 pt-2">
            <button onClick={handleSave} disabled={saving} className="btn-primary gap-1.5">
              {saving ? "Saving…" : "Save changes"}
            </button>
            <button onClick={onClose} className="btn-secondary">Cancel</button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
