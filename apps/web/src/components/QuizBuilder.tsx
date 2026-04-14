import React, { useEffect, useState } from "react";
import { api } from "../lib/api.ts";

export default function QuizBuilder() {
  const [classes, setClasses] = useState<any[]>([]);
  const [quizzes, setQuizzes] = useState<any[]>([]);
  const [classId, setClassId] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [questions, setQuestions] = useState<any[]>([]);
  const [aiTopic, setAiTopic] = useState("");
  const [takingQuiz, setTakingQuiz] = useState<any>(null);
  const [answers, setAnswers] = useState<number[]>([]);
  const [result, setResult] = useState<any>(null);

  useEffect(() => {
    api.getClasses().then((c) => { setClasses(c); if (c.length > 0) { setClassId(c[0].id); loadQuizzes(c[0].id); } }).catch(console.error);
  }, []);

  const loadQuizzes = async (cid: string) => { const q = await api.getQuizzes(cid); setQuizzes(q); };
  const handleAIGenerate = async () => {
    if (!aiTopic.trim()) return;
    const res = await api.aiGenerateQuiz(aiTopic, 5);
    setTitle(res.title); setQuestions(res.questions); setShowForm(true);
  };
  const addQuestion = () => { setQuestions([...questions, { id: `q${questions.length+1}`, text: "", options: ["","","",""], correctIndex: 0 }]); };
  const handleCreate = async () => {
    if (!title || questions.length === 0) return;
    await api.createQuiz({ classId, title, questions }); setShowForm(false); setQuestions([]); setTitle(""); loadQuizzes(classId);
  };
  const handleStartQuiz = (quiz: any) => { setTakingQuiz(quiz); setAnswers(new Array(quiz.questions.length).fill(-1)); setResult(null); };
  const handleSubmitQuiz = async () => { if (!takingQuiz) return; const res = await api.submitQuiz(takingQuiz.id, answers); setResult(res); };

  return (
    <div className="p-8 space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-white">Quizzes</h1>
        <button onClick={() => setShowForm(!showForm)} className="btn-primary text-sm">{showForm ? "Cancel" : "+ New Quiz"}</button>
      </div>

      <select value={classId} onChange={(e) => { setClassId(e.target.value); loadQuizzes(e.target.value); }}
        className="w-64 bg-white/[0.06] border border-white/[0.08] rounded-xl px-4 py-2.5 text-white text-sm focus:border-violet-500/50 focus:outline-none">
        {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
      </select>

      <div className="card">
        <h3 className="text-sm font-semibold text-white mb-2">✦ AI Quiz Generator</h3>
        <div className="flex gap-2">
          <input value={aiTopic} onChange={(e) => setAiTopic(e.target.value)} placeholder="E.g., loops, variables, events"
            className="flex-1 bg-white/[0.06] border border-white/[0.08] rounded-xl px-4 py-2.5 text-sm text-white placeholder-white/20 focus:border-violet-500/50 focus:outline-none" />
          <button onClick={handleAIGenerate} className="btn-primary text-sm">Generate</button>
        </div>
      </div>

      {showForm && (
        <div className="card space-y-3">
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Quiz title"
            className="w-full bg-white/[0.06] border border-white/[0.08] rounded-xl px-4 py-2.5 text-white placeholder-white/20 focus:border-violet-500/50 focus:outline-none" />
          {questions.map((q, qi) => (
            <div key={qi} className="bg-white/[0.03] rounded-xl p-3 space-y-2 border border-white/[0.04]">
              <input value={q.text} onChange={(e) => { const qs = [...questions]; qs[qi] = { ...qs[qi], text: e.target.value }; setQuestions(qs); }}
                placeholder={`Question ${qi+1}`}
                className="w-full bg-white/[0.06] border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-white placeholder-white/20 focus:outline-none" />
              {q.options.map((opt: string, oi: number) => (
                <div key={oi} className="flex items-center gap-2">
                  <input type="radio" name={`q${qi}`} checked={q.correctIndex === oi}
                    onChange={() => { const qs = [...questions]; qs[qi] = { ...qs[qi], correctIndex: oi }; setQuestions(qs); }}
                    className="accent-violet-500" />
                  <input value={opt} onChange={(e) => { const qs = [...questions]; qs[qi].options[oi] = e.target.value; setQuestions(qs); }}
                    placeholder={`Option ${oi+1}`}
                    className="flex-1 bg-white/[0.06] border border-white/[0.08] rounded-lg px-3 py-1.5 text-sm text-white placeholder-white/20 focus:outline-none" />
                </div>
              ))}
            </div>
          ))}
          <button onClick={addQuestion} className="btn-ghost text-sm">+ Add Question</button>
          <button onClick={handleCreate} className="btn-primary">Create Quiz</button>
        </div>
      )}

      {takingQuiz && !result && (
        <div className="card space-y-4">
          <h2 className="text-lg font-semibold text-white">{takingQuiz.title}</h2>
          {takingQuiz.questions.map((q: any, qi: number) => (
            <div key={qi} className="bg-white/[0.03] rounded-xl p-3 border border-white/[0.04]">
              <p className="text-sm text-white mb-2">{qi+1}. {q.text}</p>
              <div className="space-y-1">
                {q.options.map((opt: string, oi: number) => (
                  <label key={oi} className={`flex items-center gap-2 px-2 py-1.5 rounded-lg cursor-pointer transition-colors ${
                    answers[qi] === oi ? "bg-violet-600/20 border border-violet-500/30" : "hover:bg-white/[0.04]"}`}>
                    <input type="radio" name={`take-q${qi}`} checked={answers[qi] === oi}
                      onChange={() => { const a = [...answers]; a[qi] = oi; setAnswers(a); }} className="accent-violet-500" />
                    <span className="text-sm text-white/70">{opt}</span>
                  </label>
                ))}
              </div>
            </div>
          ))}
          <button onClick={handleSubmitQuiz} className="btn-primary">Submit Quiz</button>
        </div>
      )}

      {result && (
        <div className="card text-center">
          <div className="text-4xl mb-2">{result.score >= 70 ? "🎉" : "📝"}</div>
          <div className="text-2xl font-bold text-white mb-1">Score: {result.score}%</div>
          <button onClick={() => { setTakingQuiz(null); setResult(null); }}
            className="btn-ghost text-sm mt-3">Done</button>
        </div>
      )}

      {!takingQuiz && (
        <div className="space-y-3">
          {quizzes.map((q) => (
            <div key={q.id} className="card flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-white">{q.title}</h3>
                <p className="text-xs text-white/30">{q.questions?.length || 0} questions</p>
              </div>
              <button onClick={() => handleStartQuiz(q)} className="btn-primary text-xs">Take Quiz</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
