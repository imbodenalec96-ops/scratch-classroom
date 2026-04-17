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
    await api.createQuiz({ classId, title, questions });
    setShowForm(false); setQuestions([]); setTitle(""); loadQuizzes(classId);
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

  return (
    <div className="p-8 space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-t1">Quizzes</h1>
        <button onClick={() => setShowForm(!showForm)} className="btn-primary text-sm">
          {showForm ? "Cancel" : "+ New Quiz"}
        </button>
      </div>

      <select value={classId} onChange={(e) => { setClassId(e.target.value); loadQuizzes(e.target.value); }}
        className="input w-64">
        {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
      </select>

      <div className="card">
        <h3 className="text-sm font-semibold text-t1 mb-3 flex items-center gap-2">
          <Sparkles size={14} className="text-violet-400" /> AI Quiz Generator
        </h3>

        {/* Row 1: Subject + Grade + # of questions */}
        <div className="flex gap-2 mb-2">
          <div className="flex-1">
            <label className="block text-xs font-semibold text-t3 mb-1">Subject</label>
            <select value={aiSubject} onChange={(e) => setAiSubject(e.target.value)} className="input w-full text-sm">
              {SUBJECTS.map((s) => <option key={s}>{s}</option>)}
            </select>
          </div>
          <div className="flex-1">
            <label className="block text-xs font-semibold text-t3 mb-1">Grade</label>
            <select value={aiGrade} onChange={(e) => setAiGrade(e.target.value)} className="input w-full text-sm">
              {GRADES.map((g) => <option key={g}>{g}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-t3 mb-1">Questions</label>
            <input
              type="number"
              value={count}
              min={1}
              max={20}
              onChange={(e) => setCount(Math.min(20, Math.max(1, Number(e.target.value))))}
              className="input w-20 text-sm"
              title="Number of questions"
            />
          </div>
        </div>

        {/* Row 2: Topic + Generate */}
        <div className="flex gap-2">
          <input value={aiTopic} onChange={(e) => setAiTopic(e.target.value)}
            placeholder={
              aiSubject === "Math" ? "E.g., Adding 4-digit numbers, fractions, multiplication…" :
              aiSubject === "Reading" ? "E.g., Main idea & details, inferencing, vocabulary…" :
              aiSubject === "Writing" ? "E.g., Topic sentences, punctuation, paragraph structure…" :
              "Describe the specific topic or skill to quiz on…"
            }
            className="input flex-1 text-sm" />
          <button onClick={handleAIGenerate} className="btn-primary text-sm flex-shrink-0">Generate</button>
        </div>
        <p className="text-xs text-t3 mt-1.5">
          AI will create {count} {aiSubject.toLowerCase()} questions for {aiGrade} level
        </p>
      </div>

      {showForm && (
        <div className="card space-y-3">
          <input value={title} onChange={(e) => setTitle(e.target.value)}
            placeholder="Quiz title" className="input w-full" />
          {questions.map((q, qi) => (
            <div key={qi} className="rounded-xl p-3 space-y-2 border" style={{ background: "var(--bg-muted)", borderColor: "var(--border)" }}>
              <input value={q.text}
                onChange={(e) => { const qs = [...questions]; qs[qi] = { ...qs[qi], text: e.target.value }; setQuestions(qs); }}
                placeholder={`Question ${qi + 1}`} className="input w-full" />
              {q.options.map((opt: string, oi: number) => (
                <div key={oi} className="flex items-center gap-2">
                  <input type="radio" name={`q${qi}`} checked={q.correctIndex === oi}
                    onChange={() => { const qs = [...questions]; qs[qi] = { ...qs[qi], correctIndex: oi }; setQuestions(qs); }}
                    className="accent-violet-500" />
                  <input value={opt}
                    onChange={(e) => { const qs = [...questions]; qs[qi].options[oi] = e.target.value; setQuestions(qs); }}
                    placeholder={`Option ${oi + 1}`} className="input flex-1 py-1.5" />
                </div>
              ))}
            </div>
          ))}
          <button onClick={addQuestion} className="btn-ghost text-sm">+ Add Question</button>
          <button onClick={handleCreate} className="btn-primary">Create Quiz</button>
        </div>
      )}

      {/* One-at-a-time quiz taking */}
      {takingQuiz && !result && (
        <div className="card space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-t1">{takingQuiz.title}</h2>
            <span className="text-sm text-t3">
              {currentQ + 1} / {takingQuiz.questions.length}
            </span>
          </div>

          {/* Progress bar */}
          <div className={`h-2 rounded-full overflow-hidden ${dk ? "bg-white/10" : "bg-gray-200"}`}>
            <div
              className="h-full bg-gradient-to-r from-violet-500 to-indigo-500 rounded-full transition-all duration-500"
              style={{ width: `${((currentQ + 1) / takingQuiz.questions.length) * 100}%` }}
            />
          </div>

          {/* Current question */}
          {(() => {
            const q = takingQuiz.questions[currentQ];
            return (
              <div className="rounded-xl p-4 border space-y-3" style={{ background: "var(--bg-muted)", borderColor: "var(--border)" }}>
                <p className="text-sm font-medium text-t1">{currentQ + 1}. {q.text}</p>
                <div className="space-y-2">
                  {q.options.map((opt: string, oi: number) => (
                    <label key={oi} className={`flex items-center gap-2 px-3 py-2.5 rounded-xl cursor-pointer border-2 transition-all ${
                      answers[currentQ] === oi
                        ? "border-violet-500 bg-violet-500/10 text-violet-300"
                        : dk ? "border-white/10 hover:border-violet-500/40 text-t2" : "border-gray-200 hover:border-violet-300 text-t2"
                    }`}>
                      <input type="radio" name={`take-q${currentQ}`} checked={answers[currentQ] === oi}
                        onChange={() => handleSelectAnswer(oi)}
                        className="accent-violet-500" />
                      <span className="text-sm">{opt}</span>
                    </label>
                  ))}
                </div>
              </div>
            );
          })()}

          {/* Navigation */}
          <div className="flex items-center gap-3">
            <button onClick={handlePrev} disabled={currentQ === 0}
              className="btn-ghost text-sm disabled:opacity-30">
              ← Back
            </button>
            {currentQ < takingQuiz.questions.length - 1 ? (
              <button onClick={handleNext} className="btn-primary flex-1 text-sm">
                Next →
              </button>
            ) : (
              <button onClick={handleSubmitQuiz} className="btn-primary flex-1 text-sm bg-emerald-600 hover:bg-emerald-500">
                Submit Quiz ✓
              </button>
            )}
          </div>

          {/* Dot indicators */}
          <div className="flex items-center justify-center gap-1.5 flex-wrap">
            {takingQuiz.questions.map((_: any, i: number) => (
              <button key={i} onClick={() => setCurrentQ(i)}
                className={`rounded-full transition-all cursor-pointer ${
                  i === currentQ ? "w-5 h-2.5 bg-violet-500" : answers[i] !== -1 ? "w-2.5 h-2.5 bg-emerald-500" : dk ? "w-2.5 h-2.5 bg-white/20" : "w-2.5 h-2.5 bg-gray-300"
                }`} />
            ))}
          </div>
        </div>
      )}

      {result && (
        <div className="card text-center">
          <div className="text-4xl mb-2">{result.score >= 70 ? "🎉" : "📝"}</div>
          <div className="text-2xl font-bold text-t1 mb-1">Score: {result.score}%</div>
          <button onClick={() => { setTakingQuiz(null); setResult(null); }} className="btn-ghost text-sm mt-3">Done</button>
        </div>
      )}

      {!takingQuiz && (
        <div className="space-y-3">
          {quizzes.map((q) => (
            <div key={q.id} className="card flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-t1">{q.title}</h3>
                <p className="text-xs text-t3">{q.questions?.length || 0} questions</p>
              </div>
              <button onClick={() => handleStartQuiz(q)} className="btn-primary text-xs">Take Quiz</button>
            </div>
          ))}
          {quizzes.length === 0 && !showForm && (
            <div className="text-center text-t3 py-8">No quizzes yet — create one above!</div>
          )}
        </div>
      )}
    </div>
  );
}
