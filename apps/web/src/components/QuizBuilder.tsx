import React, { useEffect, useState } from "react";
import { api } from "../lib/api.ts";
import { useTheme } from "../lib/theme.tsx";
import { Sparkles, Plus, Trash2, CheckCircle2, Circle, ChevronLeft, ChevronRight, Zap } from "lucide-react";

export default function QuizBuilder() {
  const { theme } = useTheme();
  const dk = theme === "dark";
  const [classes, setClasses] = useState<any[]>([]);
  const [quizzes, setQuizzes] = useState<any[]>([]);
  const [classId, setClassId] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [questions, setQuestions] = useState<any[]>([]);
  const [aiTopic, setAiTopic] = useState("");
  const [aiSubject, setAiSubject] = useState("Math");
  const [aiGrade, setAiGrade] = useState("3rd Grade");
  const [count, setCount] = useState(10);
  const [targetSubject, setTargetSubject] = useState<string>("");
  const [targetGradeMin, setTargetGradeMin] = useState<string>("");
  const [targetGradeMax, setTargetGradeMax] = useState<string>("");
  const [scheduledDate, setScheduledDate] = useState<string>("");
  const [teacherNotes, setTeacherNotes] = useState<string>("");
  const [takingQuiz, setTakingQuiz] = useState<any>(null);
  const [currentQ, setCurrentQ] = useState(0);
  const [answers, setAnswers] = useState<number[]>([]);
  const [result, setResult] = useState<any>(null);
  const [aiGenerating, setAiGenerating] = useState(false);
  const [showNavModal, setShowNavModal] = useState(false);
  const [navTarget, setNavTarget] = useState(0);
  const [navCode, setNavCode] = useState("");
  const [navError, setNavError] = useState("");
  const [navLoading, setNavLoading] = useState(false);

  useEffect(() => {
    api.getClasses().then((c) => { setClasses(c); if (c.length > 0) { setClassId(c[0].id); loadQuizzes(c[0].id); } }).catch(console.error);
  }, []);

  const loadQuizzes = async (cid: string) => { const q = await api.getQuizzes(cid); setQuizzes(q); };
  const SUBJECTS = ["Math", "Reading", "Writing", "Science", "Social Studies", "Spelling"];
  const GRADES   = ["Kindergarten", "1st Grade", "2nd Grade", "3rd Grade", "4th Grade", "5th Grade"];

  const handleAIGenerate = async () => {
    if (!aiTopic.trim()) return;
    setAiGenerating(true);
    try {
      const res = await api.aiGenerateQuiz(aiTopic, count, aiSubject, aiGrade);
      setTitle(res.title); setQuestions(res.questions); setShowForm(true);
    } finally {
      setAiGenerating(false);
    }
  };
  const addQuestion = () => setQuestions([...questions, { id: `q${questions.length + 1}`, text: "", options: ["", "", "", ""], correctIndex: 0 }]);
  const handleCreate = async () => {
    if (!title || questions.length === 0) return;
    await api.createQuiz({
      classId, title, questions,
      targetSubject: targetSubject || null,
      targetGradeMin: targetGradeMin ? Number(targetGradeMin) : null,
      targetGradeMax: targetGradeMax ? Number(targetGradeMax) : (targetGradeMin ? Number(targetGradeMin) : null),
      scheduledDate: scheduledDate || null,
      teacherNotes: teacherNotes || null,
    });
    setShowForm(false); setQuestions([]); setTitle("");
    setTargetSubject(""); setTargetGradeMin(""); setTargetGradeMax(""); setScheduledDate(""); setTeacherNotes("");
    loadQuizzes(classId);
  };
  const handleStartQuiz = (quiz: any) => {
    setTakingQuiz(quiz);
    setCurrentQ(0);
    setAnswers(new Array(quiz.questions.length).fill(-1));
    setResult(null);
  };
  const handleSelectAnswer = (optIndex: number) => {
    const a = [...answers];
    a[currentQ] = optIndex;
    setAnswers(a);
  };
  const handleNext = () => {
    if (currentQ < takingQuiz.questions.length - 1) setCurrentQ(currentQ + 1);
  };
  const handlePrev = () => {
    if (currentQ > 0) setCurrentQ(currentQ - 1);
  };
  const handleSubmitQuiz = async () => {
    if (!takingQuiz) return;
    const res = await api.submitQuiz(takingQuiz.id, answers);
    setResult(res);
  };

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

  // ── Quiz list view ──────────────────────────────────────────────
  if (!showForm && !takingQuiz) {
    return (
      <div className="p-6 max-w-5xl mx-auto animate-fade-in space-y-6">
        {/* Page header */}
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-extrabold text-t1 flex items-center gap-2.5">
              <span className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-base"
                style={{ background: "rgba(99,102,241,0.18)" }}>
                <Zap size={16} className="text-indigo-400" />
              </span>
              Quizzes
            </h1>
            <p className="text-xs text-t3 mt-0.5 ml-0.5">Create and assign quizzes to your class</p>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={classId}
              onChange={(e) => { setClassId(e.target.value); loadQuizzes(e.target.value); }}
              className="input text-sm h-9"
            >
              {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <button
              onClick={() => setShowForm(true)}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold text-white cursor-pointer transition-all hover:opacity-90"
              style={{ background: "linear-gradient(135deg,#6366f1,#8b5cf6)" }}
            >
              <Plus size={14} /> New Quiz
            </button>
          </div>
        </div>

        {/* AI Generate panel */}
        <div
          className="rounded-2xl border p-5 space-y-4"
          style={{ background: "rgba(99,102,241,0.05)", borderColor: "rgba(99,102,241,0.18)" }}
        >
          <div className="flex items-center gap-2">
            <Sparkles size={15} className="text-violet-400 flex-shrink-0" />
            <h3 className="text-sm font-bold text-t1">Generate Quiz</h3>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider text-t3 mb-1.5">Subject</label>
              <select value={aiSubject} onChange={(e) => setAiSubject(e.target.value)} className="input w-full text-sm">
                {SUBJECTS.map((s) => <option key={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider text-t3 mb-1.5">Grade</label>
              <select value={aiGrade} onChange={(e) => setAiGrade(e.target.value)} className="input w-full text-sm">
                {GRADES.map((g) => <option key={g}>{g}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider text-t3 mb-1.5">Questions</label>
              <input
                type="number" value={count} min={1} max={20}
                onChange={(e) => setCount(Math.min(20, Math.max(1, Number(e.target.value))))}
                className="input w-full text-sm"
                title="Number of questions"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider text-t3 mb-1.5">Topic</label>
              <input
                value={aiTopic}
                onChange={(e) => setAiTopic(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && aiTopic.trim() && handleAIGenerate()}
                placeholder={
                  aiSubject === "Math" ? "e.g. fractions…" :
                  aiSubject === "Reading" ? "e.g. main idea…" :
                  "Topic or skill…"
                }
                className="input w-full text-sm"
              />
            </div>
          </div>

          <button
            onClick={handleAIGenerate}
            disabled={!aiTopic.trim() || aiGenerating}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white cursor-pointer transition-all disabled:opacity-50 hover:opacity-90"
            style={{ background: "linear-gradient(135deg,#6366f1,#8b5cf6)" }}
          >
            <Sparkles size={13} />
            {aiGenerating ? "Generating…" : `Generate ${count} question${count === 1 ? "" : "s"}`}
          </button>
        </div>

        {/* Quiz cards grid */}
        {quizzes.length > 0 ? (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {quizzes.map((q) => (
              <div
                key={q.id}
                className="rounded-2xl border flex flex-col transition-all hover:border-white/[0.12]"
                style={{ background: "var(--bg-surface)", borderColor: "rgba(255,255,255,0.07)" }}
              >
                {/* Card body */}
                <div className="p-4 flex-1 space-y-3">
                  <h3 className="font-bold text-t1 leading-snug">{q.title}</h3>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full"
                      style={{ background: "rgba(255,255,255,0.06)", color: "var(--t3)" }}>
                      {q.questions?.length || 0} Qs
                    </span>
                    {q.target_subject && (
                      <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full"
                        style={{ background: "rgba(139,92,246,0.15)", color: "#c4b5fd" }}>
                        {q.target_subject}
                      </span>
                    )}
                    {q.scheduled_date && (
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                        style={{ background: "rgba(245,158,11,0.12)", color: "#fcd34d" }}>
                        {q.scheduled_date}
                      </span>
                    )}
                  </div>
                </div>

                {/* Card footer */}
                <div className="px-4 pb-4 pt-3 flex items-center gap-2 border-t border-white/[0.05]">
                  <button
                    onClick={() => handleStartQuiz(q)}
                    className="flex-1 py-2 rounded-lg text-xs font-bold text-white cursor-pointer transition-all hover:opacity-90"
                    style={{ background: "linear-gradient(135deg,#6366f1,#8b5cf6)" }}
                  >
                    Take Quiz
                  </button>
                  <button
                    onClick={async () => { if (!confirm(`Delete "${q.title}"?`)) return; await api.deleteQuiz(q.id); loadQuizzes(classId); }}
                    className="p-2 rounded-lg border text-xs font-bold cursor-pointer transition-all hover:bg-red-500/10"
                    style={{ borderColor: "rgba(239,68,68,0.2)", color: "rgba(248,113,113,0.8)" }}
                    title="Delete quiz"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="py-24 text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-4"
              style={{ background: "rgba(99,102,241,0.08)" }}>
              <Zap size={28} className="text-indigo-500 opacity-40" />
            </div>
            <p className="text-t3 text-sm font-medium">No quizzes yet</p>
            <p className="text-t3 text-xs mt-1 opacity-60">Generate one above or create manually.</p>
          </div>
        )}
      </div>
    );
  }

  // ── Quiz builder form ───────────────────────────────────────────
  if (showForm && !takingQuiz) {
    return (
      <div className="p-6 max-w-3xl mx-auto animate-fade-in space-y-5">
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-widest text-t3 mb-0.5">Quiz Builder</div>
            <h2 className="text-xl font-extrabold text-t1 leading-tight">
              {title || "New Quiz"}
            </h2>
            <p className="text-xs text-t3 mt-0.5">{questions.length} question{questions.length === 1 ? "" : "s"}</p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={() => { setShowForm(false); setQuestions([]); setTitle(""); }}
              className="px-3 py-2 rounded-xl text-sm font-semibold border border-white/10 text-t2 hover:bg-white/[0.05] cursor-pointer transition-all"
            >
              Cancel
            </button>
            <button
              onClick={handleCreate}
              disabled={!title || questions.length === 0}
              className="px-4 py-2 rounded-xl text-sm font-bold text-white cursor-pointer disabled:opacity-40 transition-all hover:opacity-90"
              style={{ background: "linear-gradient(135deg,#6366f1,#8b5cf6)" }}
            >
              Save Quiz
            </button>
          </div>
        </div>

        {/* Title input */}
        <div>
          <label className="block text-[10px] font-bold uppercase tracking-wider text-t3 mb-1.5">Quiz Title *</label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder='e.g. "Chapter 3 Review — Fractions"'
            className="input w-full text-base font-semibold"
          />
        </div>

        {/* Metadata grid */}
        <div
          className="rounded-xl border p-4"
          style={{ background: "var(--bg-surface)", borderColor: "rgba(255,255,255,0.07)" }}
        >
          <div className="text-[10px] font-bold uppercase tracking-wider text-t3 mb-3">Settings</div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider text-t3 mb-1.5">Subject</label>
              <select value={targetSubject} onChange={(e) => setTargetSubject(e.target.value)} className="input w-full text-sm">
                <option value="">(any)</option>
                <option value="reading">Reading</option>
                <option value="math">Math</option>
                <option value="writing">Writing</option>
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider text-t3 mb-1.5">Grade min</label>
              <input type="number" min={0} max={12} value={targetGradeMin}
                onChange={(e) => setTargetGradeMin(e.target.value)}
                className="input w-full text-sm" placeholder="any" />
            </div>
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider text-t3 mb-1.5">Grade max</label>
              <input type="number" min={0} max={12} value={targetGradeMax}
                onChange={(e) => setTargetGradeMax(e.target.value)}
                className="input w-full text-sm" placeholder="= min" />
            </div>
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider text-t3 mb-1.5">Schedule date</label>
              <input type="date" value={scheduledDate} onChange={(e) => setScheduledDate(e.target.value)} className="input w-full text-sm" />
            </div>
          </div>
          <div className="mt-3">
            <label className="block text-[10px] font-bold uppercase tracking-wider text-t3 mb-1.5">Teacher notes (optional)</label>
            <input value={teacherNotes} onChange={(e) => setTeacherNotes(e.target.value)}
              placeholder="Private notes — students won't see this" className="input w-full text-sm" />
          </div>
        </div>

        {/* Questions */}
        <div className="space-y-3">
          {questions.map((q, qi) => (
            <div
              key={qi}
              className="rounded-2xl border p-4 space-y-4"
              style={{ background: "var(--bg-surface)", borderColor: "rgba(255,255,255,0.07)" }}
            >
              {/* Question header */}
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center justify-center w-6 h-6 rounded-full text-[11px] font-bold flex-shrink-0"
                  style={{ background: "rgba(99,102,241,0.2)", color: "#a5b4fc" }}>
                  {qi + 1}
                </span>
                <span className="text-xs font-semibold text-t3">Question {qi + 1}</span>
                <button
                  type="button"
                  onClick={() => setQuestions(questions.filter((_, i) => i !== qi))}
                  className="ml-auto p-1.5 rounded-lg text-t3 hover:text-red-400 hover:bg-red-500/10 cursor-pointer transition-all"
                  title="Remove question"
                >
                  <Trash2 size={13} />
                </button>
              </div>

              {/* Question text */}
              <textarea
                value={q.text}
                onChange={(e) => { const qs = [...questions]; qs[qi] = { ...qs[qi], text: e.target.value }; setQuestions(qs); }}
                placeholder={`Type question ${qi + 1} here…`}
                className="input w-full text-sm resize-none"
                rows={2}
              />

              {/* Answer options */}
              <div className="space-y-2">
                <div className="text-[10px] font-bold uppercase tracking-wider text-t3">
                  Answer choices — click to mark correct
                </div>
                {q.options.map((opt: string, oi: number) => {
                  const isCorrect = q.correctIndex === oi;
                  const letter = String.fromCharCode(65 + oi);
                  return (
                    <div
                      key={oi}
                      className="flex items-center gap-3 px-3 py-2.5 rounded-xl border-2 cursor-pointer transition-all"
                      style={{
                        borderColor: isCorrect ? "rgba(16,185,129,0.5)" : "rgba(255,255,255,0.07)",
                        background: isCorrect ? "rgba(16,185,129,0.08)" : "transparent",
                      }}
                      onClick={() => { const qs = [...questions]; qs[qi] = { ...qs[qi], correctIndex: oi }; setQuestions(qs); }}
                    >
                      {/* Letter badge / checkmark */}
                      <div
                        className="w-6 h-6 rounded-full flex-shrink-0 flex items-center justify-center text-[11px] font-bold transition-all"
                        style={{
                          background: isCorrect ? "#10b981" : "rgba(255,255,255,0.06)",
                          color: isCorrect ? "#fff" : "var(--t3)",
                          border: isCorrect ? "none" : "1.5px solid rgba(255,255,255,0.12)",
                        }}
                      >
                        {isCorrect ? <CheckCircle2 size={13} /> : letter}
                      </div>
                      {/* Option text input */}
                      <input
                        value={opt}
                        onChange={(e) => {
                          const qs = [...questions]; qs[qi].options[oi] = e.target.value; setQuestions(qs);
                        }}
                        onClick={(e) => e.stopPropagation()}
                        placeholder={`Option ${letter}`}
                        className="flex-1 bg-transparent border-none outline-none text-sm text-t1 placeholder:text-t3"
                      />
                      {isCorrect && (
                        <span className="text-[10px] font-bold text-emerald-400 flex-shrink-0">Correct</span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {/* Add question button */}
        <button
          onClick={addQuestion}
          className="w-full py-3 rounded-2xl border-2 border-dashed text-t3 text-sm font-semibold cursor-pointer transition-all hover:border-indigo-500/40 hover:text-indigo-300 flex items-center justify-center gap-2"
          style={{ borderColor: "rgba(255,255,255,0.1)" }}
        >
          <Plus size={15} />
          Add Question
        </button>

        {questions.length > 0 && (
          <div className="flex justify-end pt-1">
            <button
              onClick={handleCreate}
              disabled={!title || questions.length === 0}
              className="px-6 py-2.5 rounded-xl text-sm font-bold text-white cursor-pointer disabled:opacity-40 transition-all hover:opacity-90"
              style={{ background: "linear-gradient(135deg,#6366f1,#8b5cf6)" }}
            >
              Save Quiz ({questions.length} question{questions.length === 1 ? "" : "s"})
            </button>
          </div>
        )}
      </div>
    );
  }

  // ── Taking quiz ─────────────────────────────────────────────────
  if (takingQuiz && !result) {
    return (
      <div className="p-6 max-w-2xl mx-auto animate-fade-in space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-xl font-extrabold text-t1 truncate">{takingQuiz.title}</h2>
            <p className="text-xs text-t3 mt-0.5">
              Question {currentQ + 1} of {takingQuiz.questions.length}
            </p>
          </div>
          <span
            className="flex-shrink-0 inline-flex items-center px-3 py-1 rounded-full text-xs font-bold tabular-nums"
            style={{ background: "rgba(99,102,241,0.18)", color: "#a5b4fc" }}
          >
            {currentQ + 1} / {takingQuiz.questions.length}
          </span>
        </div>

        {/* Progress bar */}
        <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.08)" }}>
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{
              width: `${((currentQ + 1) / takingQuiz.questions.length) * 100}%`,
              background: "linear-gradient(90deg,#6366f1,#8b5cf6)",
            }}
          />
        </div>

        {/* Question card */}
        {(() => {
          const q = takingQuiz.questions[currentQ];
          return (
            <div
              className="rounded-2xl border p-6 space-y-5"
              style={{ background: "var(--bg-surface)", borderColor: "rgba(255,255,255,0.08)" }}
            >
              <p className="text-base font-semibold text-t1 leading-relaxed">
                {q.text}
              </p>
              <div className="space-y-2.5">
                {q.options.map((opt: string, oi: number) => {
                  const selected = answers[currentQ] === oi;
                  const letter = String.fromCharCode(65 + oi);
                  return (
                    <button
                      key={oi}
                      onClick={() => handleSelectAnswer(oi)}
                      className="w-full text-left flex items-center gap-3 px-4 py-3.5 rounded-xl border-2 font-medium text-sm transition-all duration-150 cursor-pointer"
                      style={{
                        borderColor: selected ? "#6366f1" : "rgba(255,255,255,0.08)",
                        background: selected ? "rgba(99,102,241,0.12)" : "rgba(255,255,255,0.02)",
                        color: selected ? "#a5b4fc" : "var(--t2)",
                      }}
                    >
                      <span
                        className="inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold flex-shrink-0 transition-all"
                        style={{
                          background: selected ? "#6366f1" : "rgba(255,255,255,0.06)",
                          color: selected ? "#fff" : "var(--t3)",
                          border: selected ? "none" : "1.5px solid rgba(255,255,255,0.12)",
                        }}
                      >
                        {selected ? "✓" : letter}
                      </span>
                      {opt.replace(/^[A-D]\.\s*/, "")}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })()}

        {/* Navigation */}
        <div className="flex items-center gap-3">
          <button
            onClick={handlePrev}
            disabled={currentQ === 0}
            className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-semibold border border-white/10 text-t2 hover:bg-white/[0.05] cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed transition-all"
          >
            <ChevronLeft size={15} /> Back
          </button>
          {currentQ < takingQuiz.questions.length - 1 ? (
            <button
              onClick={handleNext}
              disabled={answers[currentQ] === -1}
              className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-sm font-bold text-white cursor-pointer disabled:opacity-40 transition-all hover:opacity-90"
              style={{ background: "linear-gradient(135deg,#6366f1,#8b5cf6)" }}
            >
              Next <ChevronRight size={15} />
            </button>
          ) : (
            <button
              onClick={handleSubmitQuiz}
              disabled={answers[currentQ] === -1}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold text-white cursor-pointer disabled:opacity-40 transition-all hover:opacity-90"
              style={{ background: "linear-gradient(135deg,#10b981,#059669)" }}
            >
              <CheckCircle2 size={15} /> Submit Quiz
            </button>
          )}
        </div>

        {/* Dot progress indicators — passcode required to jump */}
        <div className="flex items-center justify-center gap-1.5 flex-wrap">
          {takingQuiz.questions.map((_: any, i: number) => (
            <button
              key={i}
              onClick={() => { if (i !== currentQ) { setNavTarget(i); setNavCode(""); setNavError(""); setShowNavModal(true); } }}
              className="rounded-full transition-all"
              style={{
                width: i === currentQ ? 20 : 8,
                height: 8,
                cursor: i !== currentQ ? "pointer" : "default",
                background: i === currentQ
                  ? "#6366f1"
                  : answers[i] !== -1
                    ? "#10b981"
                    : "rgba(255,255,255,0.15)",
              }}
              title={`Question ${i + 1}`}
            />
          ))}
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

  // ── Results screen ──────────────────────────────────────────────
  if (result) {
    const totalQs = takingQuiz?.questions?.length || 1;
    const correctCount = Math.round((result.score / 100) * totalQs);
    const passed = result.score >= 70;
    const pct = Math.round(result.score);

    return (
      <div className="p-6 max-w-md mx-auto animate-fade-in">
        <div
          className="rounded-2xl border p-8 text-center space-y-6"
          style={{ background: "var(--bg-surface)", borderColor: "rgba(255,255,255,0.08)" }}
        >
          {/* Score ring */}
          <div className="relative inline-flex items-center justify-center mx-auto">
            <svg width={96} height={96} viewBox="0 0 96 96" className="rotate-[-90deg]">
              <circle cx={48} cy={48} r={40} fill="none" strokeWidth={7}
                stroke={passed ? "rgba(16,185,129,0.15)" : "rgba(245,158,11,0.15)"} />
              <circle cx={48} cy={48} r={40} fill="none" strokeWidth={7}
                stroke={passed ? "#10b981" : "#f59e0b"}
                strokeDasharray={`${2 * Math.PI * 40}`}
                strokeDashoffset={`${2 * Math.PI * 40 * (1 - result.score / 100)}`}
                strokeLinecap="round"
                style={{ transition: "stroke-dashoffset 0.8s ease" }}
              />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-2xl font-extrabold tabular-nums text-t1">{pct}%</span>
            </div>
          </div>

          {/* Score detail */}
          <div>
            <div className="text-3xl font-extrabold text-t1 tabular-nums">
              {correctCount}<span className="text-t3 text-xl font-semibold"> / {totalQs}</span>
            </div>
            <div className="text-sm font-semibold mt-1.5" style={{ color: passed ? "#34d399" : "#fbbf24" }}>
              {passed ? "Passed — great work!" : "Keep practicing"}
            </div>
          </div>

          {/* Passed / try-again badge */}
          <div
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-bold mx-auto"
            style={{
              background: passed ? "rgba(16,185,129,0.12)" : "rgba(245,158,11,0.12)",
              color: passed ? "#34d399" : "#fbbf24",
              border: `1px solid ${passed ? "rgba(16,185,129,0.25)" : "rgba(245,158,11,0.25)"}`,
            }}
          >
            {passed ? <CheckCircle2 size={14} /> : <Circle size={14} />}
            {passed ? "Achievement unlocked" : "Score 70% or above to pass"}
          </div>

          <button
            onClick={() => { setTakingQuiz(null); setResult(null); }}
            className="w-full py-2.5 rounded-xl text-sm font-bold border border-white/10 text-t2 hover:bg-white/[0.05] cursor-pointer transition-all"
          >
            Done
          </button>
        </div>
      </div>
    );
  }

  return null;
}
