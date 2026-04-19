import React, { useEffect, useState } from "react";
import { api } from "../lib/api.ts";
import { useTheme } from "../lib/theme.tsx";
import { Sparkles } from "lucide-react";

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

  useEffect(() => {
    api.getClasses().then((c) => { setClasses(c); if (c.length > 0) { setClassId(c[0].id); loadQuizzes(c[0].id); } }).catch(console.error);
  }, []);

  const loadQuizzes = async (cid: string) => { const q = await api.getQuizzes(cid); setQuizzes(q); };
  const SUBJECTS = ["Math", "Reading", "Writing", "Science", "Social Studies", "Spelling"];
  const GRADES   = ["Kindergarten", "1st Grade", "2nd Grade", "3rd Grade", "4th Grade", "5th Grade"];

  const handleAIGenerate = async () => {
    if (!aiTopic.trim()) return;
    const res = await api.aiGenerateQuiz(aiTopic, count, aiSubject, aiGrade);
    setTitle(res.title); setQuestions(res.questions); setShowForm(true);
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

  // ── Quiz list view ──
  if (!showForm && !takingQuiz) {
    return (
      <div className="p-6 max-w-5xl mx-auto animate-fade-in space-y-6">
        {/* Page header */}
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-extrabold text-t1 flex items-center gap-2">
              <span>⚡</span> Quizzes
            </h1>
            <p className="text-xs text-t3 mt-0.5">Create and assign quizzes to your class</p>
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
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold text-white cursor-pointer transition-all"
              style={{ background: "linear-gradient(135deg,#6366f1,#8b5cf6)" }}
            >
              + Create Quiz
            </button>
          </div>
        </div>

        {/* AI Generate card */}
        <div
          className="rounded-2xl border p-5 space-y-4"
          style={{ background: "rgba(99,102,241,0.06)", borderColor: "rgba(99,102,241,0.2)" }}
        >
          <div className="flex items-center gap-2">
            <Sparkles size={16} className="text-violet-400" />
            <h3 className="text-sm font-bold text-t1">Generate with AI</h3>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider text-t3 mb-1">Subject</label>
              <select value={aiSubject} onChange={(e) => setAiSubject(e.target.value)} className="input w-full text-sm">
                {SUBJECTS.map((s) => <option key={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider text-t3 mb-1">Grade</label>
              <select value={aiGrade} onChange={(e) => setAiGrade(e.target.value)} className="input w-full text-sm">
                {GRADES.map((g) => <option key={g}>{g}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider text-t3 mb-1">Questions</label>
              <input
                type="number" value={count} min={1} max={20}
                onChange={(e) => setCount(Math.min(20, Math.max(1, Number(e.target.value))))}
                className="input w-full text-sm"
                title="Number of questions"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider text-t3 mb-1">Topic</label>
              <input
                value={aiTopic}
                onChange={(e) => setAiTopic(e.target.value)}
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
            disabled={!aiTopic.trim()}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white cursor-pointer transition-all disabled:opacity-50"
            style={{ background: "linear-gradient(135deg,#6366f1,#8b5cf6)" }}
          >
            <Sparkles size={14} /> Generate {count} questions
          </button>
        </div>

        {/* Quiz cards grid */}
        {quizzes.length > 0 ? (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {quizzes.map((q) => (
              <div
                key={q.id}
                className="rounded-2xl border p-4 flex flex-col gap-3 transition-all"
                style={{ background: "var(--bg-surface)", borderColor: "rgba(255,255,255,0.07)" }}
              >
                <div className="flex-1">
                  <h3 className="font-bold text-t1 leading-tight mb-1.5">{q.title}</h3>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-white/[0.07] text-t3">
                      {q.questions?.length || 0} questions
                    </span>
                    {q.target_subject && (
                      <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-violet-500/15 text-violet-300">
                        {q.target_subject}
                      </span>
                    )}
                    {q.scheduled_date && (
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-300">
                        📅 {q.scheduled_date}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 pt-2 border-t border-white/[0.06]">
                  <button
                    onClick={() => handleStartQuiz(q)}
                    className="flex-1 py-1.5 rounded-lg text-xs font-bold text-white cursor-pointer transition-all"
                    style={{ background: "linear-gradient(135deg,#6366f1,#8b5cf6)" }}
                  >Take Quiz</button>
                  <button
                    onClick={async () => { if (!confirm(`Delete "${q.title}"?`)) return; /* no delete api yet — refresh quizzes */ loadQuizzes(classId); }}
                    className="px-2.5 py-1.5 rounded-lg text-xs font-bold border border-red-500/25 text-red-400 hover:bg-red-500/10 cursor-pointer transition-all"
                  >Delete</button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="py-20 text-center">
            <div className="text-5xl mb-3 opacity-30">⚡</div>
            <p className="text-t3 text-sm">No quizzes yet. Generate one with AI above or create manually.</p>
          </div>
        )}
      </div>
    );
  }

  // ── Quiz form ──
  if (showForm && !takingQuiz) {
    return (
      <div className="p-6 max-w-3xl mx-auto animate-fade-in space-y-5">
        {/* Form header */}
        <div className="flex items-center justify-between">
          <div>
            <div className="text-[11px] font-bold uppercase tracking-widest text-t3 mb-0.5">Quiz Builder</div>
            <h2 className="text-xl font-extrabold text-t1">
              {title || "New Quiz"}
            </h2>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleCreate}
              disabled={!title || questions.length === 0}
              className="px-4 py-2 rounded-xl text-sm font-bold text-white cursor-pointer disabled:opacity-50 transition-all"
              style={{ background: "linear-gradient(135deg,#6366f1,#8b5cf6)" }}
            >Save Quiz</button>
            <button
              onClick={() => { setShowForm(false); setQuestions([]); setTitle(""); }}
              className="px-4 py-2 rounded-xl text-sm font-bold border border-white/10 text-t2 hover:bg-white/[0.05] cursor-pointer"
            >Cancel</button>
          </div>
        </div>

        {/* Title */}
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Quiz title"
          className="input w-full text-lg font-bold"
          style={{ fontSize: "1.1rem" }}
        />

        {/* Metadata row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-4 rounded-xl border border-white/[0.07]" style={{ background: "var(--bg-surface)" }}>
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wider text-t3 mb-1">Subject</label>
            <select value={targetSubject} onChange={(e) => setTargetSubject(e.target.value)} className="input w-full text-sm">
              <option value="">(any)</option>
              <option value="reading">Reading</option>
              <option value="math">Math</option>
              <option value="writing">Writing</option>
            </select>
          </div>
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wider text-t3 mb-1">Grade min</label>
            <input type="number" min={0} max={12} value={targetGradeMin} onChange={(e) => setTargetGradeMin(e.target.value)} className="input w-full text-sm" placeholder="any" />
          </div>
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wider text-t3 mb-1">Grade max</label>
            <input type="number" min={0} max={12} value={targetGradeMax} onChange={(e) => setTargetGradeMax(e.target.value)} className="input w-full text-sm" placeholder="= min" />
          </div>
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wider text-t3 mb-1">Scheduled</label>
            <input type="date" value={scheduledDate} onChange={(e) => setScheduledDate(e.target.value)} className="input w-full text-sm" />
          </div>
          <div className="col-span-2 sm:col-span-4">
            <input value={teacherNotes} onChange={(e) => setTeacherNotes(e.target.value)}
              placeholder="Teacher notes (optional)" className="input w-full text-sm" />
          </div>
        </div>

        {/* Questions */}
        <div className="space-y-3">
          {questions.map((q, qi) => (
            <div
              key={qi}
              className="rounded-2xl border p-4 space-y-3 relative"
              style={{ background: "var(--bg-surface)", borderColor: "rgba(255,255,255,0.07)" }}
            >
              <div className="flex items-center gap-2 mb-1">
                <span className="inline-flex items-center justify-center w-6 h-6 rounded-full text-[11px] font-bold bg-indigo-500/20 text-indigo-300">
                  {qi + 1}
                </span>
                <button
                  type="button"
                  onClick={() => setQuestions(questions.filter((_, i) => i !== qi))}
                  className="ml-auto text-[11px] text-t3 hover:text-red-400 cursor-pointer transition-colors"
                >
                  × Remove
                </button>
              </div>
              <textarea
                value={q.text}
                onChange={(e) => { const qs = [...questions]; qs[qi] = { ...qs[qi], text: e.target.value }; setQuestions(qs); }}
                placeholder={`Question ${qi + 1}`}
                className="input w-full text-sm resize-y min-h-[56px]"
                rows={2}
              />
              <div className="grid grid-cols-2 gap-2">
                {q.options.map((opt: string, oi: number) => {
                  const isCorrect = q.correctIndex === oi;
                  return (
                    <div
                      key={oi}
                      className={`flex items-center gap-2 px-3 py-2 rounded-xl border-2 cursor-pointer transition-all
                        ${isCorrect ? "border-emerald-500/60 bg-emerald-500/10" : "border-white/[0.07] hover:border-white/20"}`}
                      onClick={() => { const qs = [...questions]; qs[qi] = { ...qs[qi], correctIndex: oi }; setQuestions(qs); }}
                    >
                      <div className={`w-4 h-4 rounded-full border-2 flex-shrink-0 flex items-center justify-center
                        ${isCorrect ? "border-emerald-500 bg-emerald-500" : "border-white/30"}`}>
                        {isCorrect && <span className="text-white text-[8px] font-bold">✓</span>}
                      </div>
                      <input
                        value={opt}
                        onChange={(e) => {
                          const qs = [...questions]; qs[qi].options[oi] = e.target.value; setQuestions(qs);
                        }}
                        onClick={(e) => e.stopPropagation()}
                        placeholder={`Option ${oi + 1}`}
                        className="flex-1 bg-transparent border-none outline-none text-sm text-t1 placeholder:text-t3"
                      />
                    </div>
                  );
                })}
              </div>
              {q.correctIndex !== undefined && (
                <div className="text-[10px] text-emerald-400 font-semibold">
                  Correct: Option {q.correctIndex + 1} (click an option to change)
                </div>
              )}
            </div>
          ))}
        </div>

        <button
          onClick={addQuestion}
          className="w-full py-3 rounded-2xl border-2 border-dashed border-white/[0.12] text-t3 hover:border-indigo-500/40 hover:text-indigo-300 text-sm font-semibold cursor-pointer transition-all"
        >
          + Add Question
        </button>
      </div>
    );
  }

  // ── Taking quiz ──
  if (takingQuiz && !result) {
    return (
      <div className="p-6 max-w-2xl mx-auto animate-fade-in space-y-5">
        {/* Quiz title + progress badge */}
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-xl font-extrabold text-t1 truncate">{takingQuiz.title}</h2>
          <span
            className="flex-shrink-0 inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold"
            style={{ background: "rgba(99,102,241,0.2)", color: "#a5b4fc" }}
          >
            Q{currentQ + 1} of {takingQuiz.questions.length}
          </span>
        </div>

        {/* Progress bar */}
        <div className={`h-1.5 rounded-full overflow-hidden ${dk ? "bg-white/10" : "bg-gray-200"}`}>
          <div
            className="h-full bg-gradient-to-r from-violet-500 to-indigo-500 rounded-full transition-all duration-500"
            style={{ width: `${((currentQ + 1) / takingQuiz.questions.length) * 100}%` }}
          />
        </div>

        {/* Question card */}
        {(() => {
          const q = takingQuiz.questions[currentQ];
          return (
            <div
              className="rounded-2xl border p-6 space-y-4"
              style={{ background: "var(--bg-surface)", borderColor: "rgba(255,255,255,0.08)" }}
            >
              <p className="text-base font-semibold text-t1 leading-relaxed">{currentQ + 1}. {q.text}</p>
              <div className="space-y-2.5">
                {q.options.map((opt: string, oi: number) => {
                  const selected = answers[currentQ] === oi;
                  return (
                    <button
                      key={oi}
                      onClick={() => handleSelectAnswer(oi)}
                      className={`w-full text-left px-4 py-3.5 rounded-xl border-2 font-medium text-sm transition-all duration-150 cursor-pointer
                        ${selected
                          ? "border-indigo-500 bg-indigo-500/15 text-indigo-200"
                          : "border-white/[0.08] bg-white/[0.03] text-t2 hover:border-white/20 hover:bg-white/[0.05]"}`}
                    >
                      <span
                        className={`inline-flex items-center justify-center w-6 h-6 rounded-full border-2 mr-3 text-xs font-bold flex-shrink-0
                          ${selected ? "border-indigo-500 bg-indigo-500 text-white" : "border-white/25"}`}
                      >
                        {selected ? "✓" : String.fromCharCode(65 + oi)}
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
            className="px-4 py-2.5 rounded-xl text-sm font-semibold border border-white/10 text-t2 hover:bg-white/[0.05] cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed transition-all"
          >← Back</button>
          {currentQ < takingQuiz.questions.length - 1 ? (
            <button
              onClick={handleNext}
              disabled={answers[currentQ] === -1}
              className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white cursor-pointer disabled:opacity-40 transition-all"
              style={{ background: "linear-gradient(135deg,#6366f1,#8b5cf6)" }}
            >Next →</button>
          ) : (
            <button
              onClick={handleSubmitQuiz}
              disabled={answers[currentQ] === -1}
              className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white cursor-pointer disabled:opacity-40 transition-all"
              style={{ background: "linear-gradient(135deg,#10b981,#059669)" }}
            >Submit Quiz ✓</button>
          )}
        </div>

        {/* Dot indicators */}
        <div className="flex items-center justify-center gap-1.5 flex-wrap">
          {takingQuiz.questions.map((_: any, i: number) => (
            <button
              key={i}
              onClick={() => setCurrentQ(i)}
              className={`rounded-full transition-all cursor-pointer ${
                i === currentQ ? "w-5 h-2.5 bg-indigo-500" : answers[i] !== -1 ? "w-2.5 h-2.5 bg-emerald-500" : "w-2.5 h-2.5 bg-white/20"
              }`}
            />
          ))}
        </div>
      </div>
    );
  }

  // ── Results screen ──
  if (result) {
    const totalQs = takingQuiz?.questions?.length || 1;
    const correctCount = Math.round((result.score / 100) * totalQs);
    const passed = result.score >= 70;
    return (
      <div className="p-6 max-w-md mx-auto animate-fade-in">
        <div
          className="rounded-2xl border p-8 text-center space-y-5"
          style={{ background: "var(--bg-surface)", borderColor: "rgba(255,255,255,0.08)" }}
        >
          <div
            className="inline-flex items-center justify-center w-20 h-20 rounded-full text-4xl mx-auto"
            style={{ background: passed ? "rgba(16,185,129,0.15)" : "rgba(245,158,11,0.15)" }}
          >
            {passed ? "🎉" : "📝"}
          </div>
          <div>
            <div className="text-5xl font-extrabold tabular-nums text-t1">{correctCount}/{totalQs}</div>
            <div className="text-lg font-semibold mt-1" style={{ color: passed ? "#34d399" : "#fbbf24" }}>
              {result.score}% — {passed ? "Passed!" : "Keep practicing"}
            </div>
          </div>
          <div
            className="px-4 py-2 rounded-full text-sm font-bold"
            style={{ background: passed ? "rgba(16,185,129,0.15)" : "rgba(245,158,11,0.15)", color: passed ? "#34d399" : "#fbbf24" }}
          >
            {passed ? "Great work!" : "Try again to improve your score"}
          </div>
          <button
            onClick={() => { setTakingQuiz(null); setResult(null); }}
            className="w-full py-2.5 rounded-xl text-sm font-bold border border-white/10 text-t2 hover:bg-white/[0.05] cursor-pointer transition-all"
          >Done</button>
        </div>
      </div>
    );
  }

  return null;
}
