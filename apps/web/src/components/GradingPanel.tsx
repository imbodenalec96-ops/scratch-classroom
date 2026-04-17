import React, { useEffect, useState } from "react";
import { api } from "../lib/api.ts";
import { useTheme } from "../lib/theme.tsx";
import { ChevronDown, ChevronUp, CheckCircle, XCircle, AlertCircle } from "lucide-react";

export default function GradingPanel() {
  const { theme } = useTheme();
  const dk = theme === "dark";
  const [classes, setClasses] = useState<any[]>([]);
  const [assignments, setAssignments] = useState<any[]>([]);
  const [submissions, setSubmissions] = useState<any[]>([]);
  const [selectedAssignment, setSelectedAssignment] = useState<string>("");
  const [assignmentContent, setAssignmentContent] = useState<any>(null);
  const [classId, setClassId] = useState("");
  const [grading, setGrading] = useState<{ id: string; grade: string; feedback: string } | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.getClasses().then((c) => {
      setClasses(c);
      if (c.length > 0) { setClassId(c[0].id); loadAssignments(c[0].id); }
    }).catch(console.error);
  }, []);

  const loadAssignments = async (cid: string) => {
    const a = await api.getAssignments(cid);
    setAssignments(a);
    if (a.length > 0) { setSelectedAssignment(a[0].id); loadSubmissions(a[0].id, a[0]); }
  };

  const loadSubmissions = async (aid: string, asgn?: any) => {
    const s = await api.getSubmissions(aid);
    setSubmissions(s);
    // Parse assignment content for answer key
    const target = asgn ?? assignments.find((a) => a.id === aid);
    if (target?.content) {
      try { setAssignmentContent(JSON.parse(target.content)); } catch { setAssignmentContent(null); }
    } else {
      setAssignmentContent(null);
    }
  };

  const handleGrade = async () => {
    if (!grading) return;
    setSaving(true);
    await api.gradeSubmission(grading.id, Number(grading.grade), grading.feedback);
    setSaving(false);
    setGrading(null);
    loadSubmissions(selectedAssignment);
  };

  const quickGrade = async (subId: string, score: number, note: string) => {
    await api.gradeSubmission(subId, score, note);
    loadSubmissions(selectedAssignment);
  };

  // Flatten all questions from assignment content
  const allQuestions: Array<{ q: any; sectionTitle: string; globalIndex: number }> = [];
  if (assignmentContent?.sections) {
    let gi = 0;
    for (const section of assignmentContent.sections) {
      for (const q of (section.questions || [])) {
        allQuestions.push({ q, sectionTitle: section.title, globalIndex: gi++ });
      }
    }
  }

  return (
    <div className="p-8 space-y-6 animate-fade-in">
      <h1 className="text-3xl font-bold text-t1">Grading</h1>

      <div className="flex gap-3 flex-wrap">
        <select value={classId} onChange={(e) => { setClassId(e.target.value); loadAssignments(e.target.value); }}
          className="input w-48">
          {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select value={selectedAssignment}
          onChange={(e) => {
            setSelectedAssignment(e.target.value);
            loadSubmissions(e.target.value);
          }}
          className="input w-72">
          {assignments.map((a) => <option key={a.id} value={a.id}>{a.title}</option>)}
        </select>
      </div>

      {/* Manual grade editor */}
      {grading && (
        <div className={`card space-y-4 border-2 ${dk ? "border-violet-500/40" : "border-violet-300"}`}>
          <h3 className="font-semibold text-t1 flex items-center gap-2">
            ✏️ Manual Grade Override
          </h3>
          <div className="flex gap-3 flex-wrap">
            <div>
              <label className="text-xs text-t3 block mb-1">Grade (0–100)</label>
              <input type="number" min="0" max="100" value={grading.grade}
                onChange={(e) => setGrading({ ...grading, grade: e.target.value })}
                className="input w-24" />
            </div>
            <div className="flex-1 min-w-[200px]">
              <label className="text-xs text-t3 block mb-1">Feedback for student</label>
              <input value={grading.feedback} onChange={(e) => setGrading({ ...grading, feedback: e.target.value })}
                placeholder="Great work! / Please re-do question 3…"
                className="input w-full" />
            </div>
          </div>
          {/* Quick grade chips */}
          <div className="flex gap-2 flex-wrap">
            {[
              { label: "✅ Pass (100%)", score: 100, note: "Excellent work!" },
              { label: "👍 Good (85%)", score: 85, note: "Good job!" },
              { label: "📝 Needs Work (60%)", score: 60, note: "Please review and try again." },
              { label: "❌ Redo (0%)", score: 0, note: "Please redo this assignment." },
            ].map((opt) => (
              <button key={opt.score}
                onClick={() => setGrading({ ...grading, grade: String(opt.score), feedback: opt.note })}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all cursor-pointer
                  ${grading.grade === String(opt.score)
                    ? "border-violet-500 bg-violet-500/20 text-violet-300"
                    : dk ? "border-white/10 text-white/50 hover:border-violet-500/40" : "border-gray-200 text-gray-500 hover:border-violet-300"
                  }`}>
                {opt.label}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <button onClick={handleGrade} disabled={saving} className="btn-primary text-sm gap-1">
              {saving ? "Saving…" : "Save Grade"}
            </button>
            <button onClick={() => setGrading(null)} className="btn-ghost text-sm">Cancel</button>
          </div>
        </div>
      )}

      <div className="card">
        <h2 className="text-lg font-semibold text-t1 mb-4">
          Submissions ({submissions.length})
        </h2>
        <div className="space-y-3">
          {submissions.map((s) => {
            const isExpanded = expandedId === s.id;
            const studentAnswers: Record<number, string> = (() => {
              try { return s.answers ? JSON.parse(s.answers) : {}; } catch { return {}; }
            })();
            const ag = s.auto_grade_result;

            return (
              <div key={s.id} className={`rounded-2xl border overflow-hidden transition-all ${dk ? "border-white/[0.07] bg-white/[0.02]" : "border-gray-200 bg-white"}`}>
                {/* Row header */}
                <div className="flex items-center gap-3 px-4 py-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-t1 text-sm">{s.student_name}</span>
                      <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full
                        ${s.grade !== null
                          ? s.grade >= 70 ? "bg-emerald-500/15 text-emerald-400" : "bg-red-500/15 text-red-400"
                          : dk ? "bg-white/[0.06] text-white/30" : "bg-gray-100 text-gray-400"}`}>
                        {s.grade !== null ? `${s.grade}%` : "Ungraded"}
                      </span>
                      {ag && (
                        <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full
                          ${ag.score >= 70 ? "bg-violet-500/15 text-violet-400" : "bg-amber-500/15 text-amber-400"}`}>
                          AI: {ag.score}%
                        </span>
                      )}
                    </div>
                    <div className={`text-xs mt-0.5 ${dk ? "text-white/30" : "text-gray-400"}`}>
                      {new Date(s.submitted_at).toLocaleString()}
                      {s.feedback && <span className="ml-2 italic">"{s.feedback}"</span>}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button
                      onClick={() => setGrading({ id: s.id, grade: s.grade?.toString() || ag?.score?.toString() || "", feedback: s.feedback || "" })}
                      className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-violet-600/20 text-violet-400 hover:bg-violet-600/30 transition-colors cursor-pointer">
                      {s.grade !== null ? "Re-grade" : "Grade"}
                    </button>
                    {allQuestions.length > 0 && (
                      <button onClick={() => setExpandedId(isExpanded ? null : s.id)}
                        className={`p-1.5 rounded-lg transition-colors cursor-pointer ${dk ? "text-white/30 hover:text-white/60" : "text-gray-400 hover:text-gray-700"}`}>
                        {isExpanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                      </button>
                    )}
                  </div>
                </div>

                {/* Expanded answer view */}
                {isExpanded && allQuestions.length > 0 && (
                  <div className={`border-t px-4 py-4 space-y-3 ${dk ? "border-white/[0.06] bg-white/[0.015]" : "border-gray-100 bg-gray-50"}`}>
                    {allQuestions.map(({ q, sectionTitle, globalIndex }) => {
                      const studentAns = studentAnswers[globalIndex] ?? "";
                      const normalize = (s: string) => String(s || "").replace(/^[A-D]\.\s*/i, "").trim().toLowerCase();

                      let isCorrect: boolean | null = null;
                      let correctOpt = "";
                      if (q.type === "multiple_choice" && q.options && q.correctIndex !== undefined) {
                        correctOpt = q.options[q.correctIndex];
                        isCorrect = normalize(studentAns) === normalize(correctOpt);
                      }

                      return (
                        <div key={globalIndex} className={`rounded-xl p-3 border text-sm space-y-1.5 ${dk ? "border-white/[0.05] bg-white/[0.02]" : "border-gray-200 bg-white"}`}>
                          <div className="flex items-start gap-2">
                            {isCorrect === true && <CheckCircle size={15} className="text-emerald-400 flex-shrink-0 mt-0.5" />}
                            {isCorrect === false && <XCircle size={15} className="text-red-400 flex-shrink-0 mt-0.5" />}
                            {isCorrect === null && <AlertCircle size={15} className={`flex-shrink-0 mt-0.5 ${dk ? "text-white/20" : "text-gray-300"}`} />}
                            <div className="flex-1 min-w-0">
                              <div className={`text-xs font-bold uppercase tracking-wide mb-0.5 ${dk ? "text-white/25" : "text-gray-400"}`}>
                                {sectionTitle} — Q{globalIndex + 1}
                              </div>
                              <p className={`font-medium ${dk ? "text-white/80" : "text-gray-800"}`}>{q.text}</p>
                            </div>
                          </div>

                          {q.type === "multiple_choice" && q.options && (
                            <div className="ml-6 grid grid-cols-2 gap-1">
                              {q.options.map((opt: string, oi: number) => {
                                const isStudentPick = normalize(studentAns) === normalize(opt);
                                const isCorrectOpt = oi === q.correctIndex;
                                return (
                                  <div key={oi} className={`flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-xs
                                    ${isCorrectOpt && isStudentPick ? "bg-emerald-500/15 text-emerald-400 font-bold"
                                      : isCorrectOpt ? "bg-emerald-500/10 text-emerald-400"
                                      : isStudentPick ? "bg-red-500/10 text-red-400"
                                      : dk ? "text-white/30" : "text-gray-400"}`}>
                                    <span className={`w-4 h-4 rounded-full border flex items-center justify-center text-[10px] flex-shrink-0
                                      ${isCorrectOpt ? "border-emerald-400 bg-emerald-400/20" : dk ? "border-white/20" : "border-gray-300"}`}>
                                      {String.fromCharCode(65 + oi)}
                                    </span>
                                    <span className="truncate">{opt.replace(/^[A-D]\.\s*/i, "")}</span>
                                    {isStudentPick && <span className="ml-auto flex-shrink-0">{isCorrectOpt ? "✓" : "✗"}</span>}
                                  </div>
                                );
                              })}
                            </div>
                          )}

                          {(q.type === "short_answer" || q.type === "fill_blank") && (
                            <div className={`ml-6 px-3 py-2 rounded-lg text-xs italic ${dk ? "bg-white/[0.03] text-white/60" : "bg-gray-100 text-gray-600"}`}>
                              {studentAns || <span className="opacity-40">No answer given</span>}
                            </div>
                          )}
                        </div>
                      );
                    })}

                    {/* Quick grade bar at bottom of expanded view */}
                    <div className="flex items-center gap-2 pt-2 flex-wrap">
                      <span className={`text-xs font-semibold ${dk ? "text-white/30" : "text-gray-400"}`}>Quick grade:</span>
                      {[
                        { label: "Pass", score: 100, note: "Great work!" },
                        { label: "Good", score: 85, note: "Good job!" },
                        { label: "Needs Work", score: 60, note: "Please review and redo." },
                        { label: "Redo", score: 0, note: "Please redo this assignment." },
                      ].map((opt) => (
                        <button key={opt.score}
                          onClick={() => quickGrade(s.id, opt.score, opt.note)}
                          className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer border
                            ${opt.score >= 85 ? "border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10"
                              : opt.score >= 70 ? "border-amber-500/30 text-amber-400 hover:bg-amber-500/10"
                              : "border-red-500/30 text-red-400 hover:bg-red-500/10"}`}>
                          {opt.label} ({opt.score}%)
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          {submissions.length === 0 && (
            <div className="py-12 text-center text-t3 text-sm">No submissions yet for this assignment.</div>
          )}
        </div>
      </div>
    </div>
  );
}
