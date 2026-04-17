import React, { useEffect, useState } from "react";
import { api } from "../lib/api.ts";
import { useTheme } from "../lib/theme.tsx";
import { useAuth } from "../lib/auth.tsx";
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
}
interface Section { title: string; questions: Question[]; }
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

/* ── Student Interactive Assignment View ─────────────────────── */
function StudentAssignmentView({ dk }: { dk: boolean }) {
  const [classes, setClasses] = useState<any[]>([]);
  const [assignment, setAssignment] = useState<any>(null);
  const [parsed, setParsed] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [currentQ, setCurrentQ] = useState(0);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Flatten all questions from all sections into a single array
  const allQuestions: Array<{ q: any; sectionTitle: string }> = parsed
    ? parsed.sections?.flatMap((s: any) => s.questions.map((q: any) => ({ q, sectionTitle: s.title }))) ?? []
    : [];
  const total = allQuestions.length;
  const q = allQuestions[currentQ];

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const clsList = await api.getClasses();
        setClasses(clsList);
        for (const cls of clsList) {
          const today = await api.getTodayAssignment(cls.id);
          if (today && today.length > 0) {
            const a = today[0];
            setAssignment(a);
            if (a.content) {
              try { setParsed(JSON.parse(a.content)); } catch {}
            }
            break;
          }
        }
      } catch {}
      setLoading(false);
    };
    load();
  }, []);

  const handleSelect = (value: string) => {
    setAnswers((prev) => ({ ...prev, [currentQ]: value }));
  };

  const handleNext = () => {
    if (currentQ < total - 1) setCurrentQ(currentQ + 1);
  };

  const handlePrev = () => {
    if (currentQ > 0) setCurrentQ(currentQ - 1);
  };

  const handleSubmit = async () => {
    if (!assignment) return;
    setSubmitting(true);
    try {
      await api.submitAssignmentWithAnswers(assignment.id, answers);
    } catch {}
    setSubmitting(false);
    setSubmitted(true);
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

  if (!assignment || !parsed || allQuestions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center space-y-3">
        <div className="text-6xl">🎉</div>
        <h2 className={`text-xl font-bold ${dk ? "text-white" : "text-gray-900"}`}>No assignment today!</h2>
        <p className={`text-sm ${dk ? "text-white/40" : "text-gray-500"}`}>
          {classes.length === 0 ? "Join a class to receive assignments." : "Check back with your teacher — nothing scheduled for today."}
        </p>
      </div>
    );
  }

  const progress = total > 0 ? ((currentQ + 1) / total) * 100 : 0;
  const currentAnswer = answers[currentQ] ?? "";

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      {/* Header */}
      <div>
        <div className={`text-xs font-bold uppercase tracking-widest mb-1 ${dk ? "text-violet-400" : "text-violet-600"}`}>
          📅 {todayName}'s Assignment
        </div>
        <h1 className={`text-xl font-extrabold ${dk ? "text-white" : "text-gray-900"}`}>{assignment.title}</h1>
        <div className={`text-sm mt-0.5 ${dk ? "text-white/40" : "text-gray-500"}`}>
          {parsed.subject} · {parsed.grade}
        </div>
      </div>

      {/* Progress bar */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <span className={`text-xs font-semibold ${dk ? "text-white/40" : "text-gray-500"}`}>
            Question {currentQ + 1} of {total}
          </span>
          <span className={`text-xs font-semibold ${dk ? "text-white/40" : "text-gray-500"}`}>{Math.round(progress)}%</span>
        </div>
        <div className={`h-2 rounded-full overflow-hidden ${dk ? "bg-white/10" : "bg-gray-200"}`}>
          <div
            className="h-full bg-gradient-to-r from-violet-500 to-indigo-500 rounded-full transition-all duration-500 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Section label */}
      {q && (
        <div className={`text-[11px] font-bold uppercase tracking-widest ${dk ? "text-white/25" : "text-gray-400"}`}>
          {q.sectionTitle}
        </div>
      )}

      {/* Question card */}
      {q && (
        <div className="card rounded-2xl p-6 space-y-5">
          <p className={`text-base font-semibold leading-relaxed ${dk ? "text-white" : "text-gray-900"}`}>
            {q.q.text}
          </p>

          {/* Multiple choice */}
          {q.q.type === "multiple_choice" && q.q.options && (
            <div className="space-y-2.5">
              {q.q.options.map((opt: string, oi: number) => {
                const isSelected = currentAnswer === opt;
                return (
                  <button
                    key={oi}
                    onClick={() => handleSelect(opt)}
                    className={`w-full text-left px-4 py-3.5 rounded-xl border-2 font-medium text-sm transition-all duration-150 cursor-pointer
                      ${isSelected
                        ? dk ? "border-violet-500 bg-violet-500/20 text-violet-300" : "border-violet-500 bg-violet-50 text-violet-700"
                        : dk ? "border-white/10 bg-white/[0.03] text-white/70 hover:border-white/25 hover:bg-white/[0.06]"
                               : "border-gray-200 bg-white text-gray-700 hover:border-violet-300 hover:bg-violet-50/50"
                      }`}
                    style={{ transform: isSelected ? "scale(1.01)" : "scale(1)" }}
                  >
                    <span
                      className={`inline-flex items-center justify-center w-6 h-6 rounded-full border-2 mr-3 text-xs flex-shrink-0
                        ${isSelected ? "border-violet-500 bg-violet-500 text-white" : dk ? "border-white/25" : "border-gray-300"}`}
                    >
                      {isSelected ? "✓" : String.fromCharCode(65 + oi)}
                    </span>
                    {opt.replace(/^[A-D]\.\s*/, "")}
                  </button>
                );
              })}
            </div>
          )}

          {/* Short answer */}
          {q.q.type === "short_answer" && (
            <textarea
              value={currentAnswer}
              onChange={(e) => handleSelect(e.target.value)}
              placeholder="Write your answer here…"
              rows={q.q.lines || 3}
              className="input w-full resize-none text-sm"
            />
          )}

          {/* Fill in blank */}
          {q.q.type === "fill_blank" && (
            <input
              value={currentAnswer}
              onChange={(e) => handleSelect(e.target.value)}
              placeholder="Fill in the blank…"
              className="input w-full text-sm"
            />
          )}
        </div>
      )}

      {/* Navigation */}
      <div className="flex items-center justify-between gap-3">
        <button
          onClick={handlePrev}
          disabled={currentQ === 0}
          className={`px-5 py-2.5 rounded-xl font-semibold text-sm border transition-all cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed
            ${dk ? "border-white/10 text-white/60 hover:bg-white/[0.05]" : "border-gray-200 text-gray-600 hover:bg-gray-50"}`}
        >
          ← Back
        </button>

        {currentQ < total - 1 ? (
          <button
            onClick={handleNext}
            className="btn-primary px-6 py-2.5"
          >
            Next →
          </button>
        ) : (
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="btn-primary px-6 py-2.5 gap-2"
            style={{ background: "linear-gradient(135deg, #10b981, #059669)" }}
          >
            {submitting ? (
              <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin inline-block" />
            ) : "Submit ✓"}
          </button>
        )}
      </div>

      {/* Question dots */}
      <div className="flex items-center justify-center gap-1.5 flex-wrap">
        {allQuestions.map((_, i) => (
          <button
            key={i}
            onClick={() => setCurrentQ(i)}
            className={`h-2 rounded-full transition-all cursor-pointer ${
              i === currentQ
                ? "bg-violet-500 w-4"
                : answers[i] !== undefined
                  ? "bg-emerald-500 w-2"
                  : dk ? "bg-white/20 w-2" : "bg-gray-300 w-2"
            }`}
          />
        ))}
      </div>
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

  // Form state
  const [classId, setClassId] = useState("");
  const [title, setTitle] = useState("");
  const [subject, setSubject] = useState("Reading");
  const [grade, setGrade] = useState("3rd Grade");
  const [instructions, setInstructions] = useState("");
  const [dueDate, setDueDate] = useState("");

  // AI generation state
  const [generating, setGenerating] = useState(false);
  const [generated, setGenerated] = useState<GeneratedAssignment | null>(null);
  const [genError, setGenError] = useState("");

  // Expanded assignment preview
  const [expandedId, setExpandedId] = useState<string | null>(null);

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
  };

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
      const result = await api.generateAssignment({ title, subject, grade, instructions });
      setGenerated(result);
    } catch {
      setGenError("Generation failed — please try again.");
    }
    setGenerating(false);
  };

  const handleCreate = async () => {
    if (!title || !classId) return;
    const rubric = generated
      ? generated.sections.flatMap((s) => s.questions.map((q) => ({ label: q.text.slice(0, 60), maxPoints: q.points })))
      : [{ label: "Correctness", maxPoints: 50 }, { label: "Creativity", maxPoints: 50 }];
    const desc = generated
      ? `[AI-Generated] ${generated.instructions}\n\nSections: ${generated.sections.map((s) => s.title).join(", ")}`
      : instructions;
    const content = generated ? JSON.stringify(generated) : null;
    await api.createAssignment({ classId, title, description: desc, dueDate, rubric, content });
    setShowForm(false);
    setGenerated(null);
    setTitle(""); setInstructions(""); setDueDate("");
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

  return (
    <div className="p-7 space-y-5 animate-page-enter">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className={`text-2xl font-bold tracking-tight ${dk ? "text-white" : "text-gray-900"}`}>Assignments</h1>
          <p className={`text-sm mt-0.5 ${dk ? "text-white/40" : "text-gray-500"}`}>Create AI-generated paper worksheets for your class</p>
        </div>
        <button onClick={() => { setShowForm(!showForm); setGenerated(null); setGenError(""); }} className="btn-primary gap-2">
          {showForm ? <X size={14}/> : <Plus size={14}/>}
          {showForm ? "Cancel" : "New Assignment"}
        </button>
      </div>

      {/* Class selector */}
      <select value={classId} onChange={(e) => { setClassId(e.target.value); loadAssignments(e.target.value); }} className="input w-56 text-sm">
        {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
      </select>

      {/* Assignment form */}
      {showForm && (
        <div className={`card border ${dk ? "border-violet-500/25" : "border-violet-200"} space-y-4`}>
          <div className="flex items-center gap-2 mb-1">
            <FileText size={16} className="text-violet-400" />
            <h2 className={`font-semibold ${dk ? "text-white" : "text-gray-900"}`}>Assignment Details</h2>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className={`block text-xs font-semibold mb-1.5 ${dk ? "text-white/50" : "text-gray-500"}`}>Assignment Title *</label>
              <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder='e.g. "Main Idea & Details Worksheet"' className="input w-full" />
            </div>
            <div>
              <label className={`block text-xs font-semibold mb-1.5 ${dk ? "text-white/50" : "text-gray-500"}`}>
                <BookOpen size={11} className="inline mr-1" />Subject
              </label>
              <select value={subject} onChange={(e) => setSubject(e.target.value)} className="input w-full">
                {SUBJECTS.map((s) => <option key={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className={`block text-xs font-semibold mb-1.5 ${dk ? "text-white/50" : "text-gray-500"}`}>
                <GraduationCap size={11} className="inline mr-1" />Grade Level
              </label>
              <select value={grade} onChange={(e) => setGrade(e.target.value)} className="input w-full">
                {GRADES.map((g) => <option key={g}>{g}</option>)}
              </select>
            </div>
            <div>
              <label className={`block text-xs font-semibold mb-1.5 ${dk ? "text-white/50" : "text-gray-500"}`}>
                <Calendar size={11} className="inline mr-1" />Due Date
              </label>
              <input type="datetime-local" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="input w-full" />
            </div>
            <div>
              <label className={`block text-xs font-semibold mb-1.5 ${dk ? "text-white/50" : "text-gray-500"}`}>Special Instructions (optional)</label>
              <input value={instructions} onChange={(e) => setInstructions(e.target.value)} placeholder="Any special notes for AI generation…" className="input w-full" />
            </div>
          </div>

          {/* AI Generate button */}
          <div className={`rounded-xl p-4 border ${dk ? "bg-violet-500/[0.06] border-violet-500/20" : "bg-violet-50 border-violet-200"}`}>
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className={`text-sm font-semibold ${dk ? "text-violet-300" : "text-violet-800"}`}>
                  AI Worksheet Generator
                </div>
                <div className={`text-xs mt-0.5 ${dk ? "text-violet-400/70" : "text-violet-600"}`}>
                  Claude AI creates a full paper-style worksheet with questions based on your title, subject & grade
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
            {genError && <p className="text-red-400 text-xs mt-2">{genError}</p>}
          </div>

          {/* Paper preview */}
          {generated && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Check size={14} className="text-emerald-400" />
                <span className={`text-sm font-semibold ${dk ? "text-emerald-300" : "text-emerald-700"}`}>Worksheet generated! Preview:</span>
                <button
                  onClick={() => window.print()}
                  className={`ml-auto flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border transition-colors cursor-pointer ${
                    dk ? "border-white/10 text-white/50 hover:text-white/80" : "border-gray-200 text-gray-500 hover:text-gray-800"
                  }`}
                >
                  <Printer size={12} /> Print Preview
                </button>
              </div>
              <PaperPreview assignment={generated} dk={dk} />
            </div>
          )}

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
            <button onClick={() => { setShowForm(false); setGenerated(null); setGenError(""); }} className="btn-ghost">Cancel</button>
          </div>
        </div>
      )}

      {/* Assignments list */}
      <div className="space-y-3">
        {assignments.map((a) => {
          const parsed = (() => { try { return a.content ? JSON.parse(a.content) : null; } catch { return null; } })();
          const isExpanded = expandedId === a.id;
          return (
            <div key={a.id} className="card overflow-hidden">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className={`font-semibold ${dk ? "text-white" : "text-gray-900"}`}>{a.title}</h3>
                    {parsed && (
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-violet-500/15 text-violet-400">
                        AI Worksheet
                      </span>
                    )}
                    {a.scheduled_date && (
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-400">
                        📅 {a.scheduled_date}
                      </span>
                    )}
                  </div>
                  <p className={`text-sm mt-0.5 line-clamp-1 ${dk ? "text-white/40" : "text-gray-500"}`}>{a.description}</p>
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

              {/* Expanded paper preview */}
              {isExpanded && parsed && (
                <div className="mt-4 pt-4 border-t border-white/[0.05]">
                  <div className="flex justify-end mb-3">
                    <button onClick={() => window.print()} className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border cursor-pointer ${dk ? "border-white/10 text-white/50 hover:text-white/80" : "border-gray-200 text-gray-500 hover:text-gray-800"}`}>
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
          <div className={`text-center py-14 ${dk ? "text-white/20" : "text-gray-400"}`}>
            <FileText size={36} className="mx-auto mb-3 opacity-30" />
            <p className="text-sm">No assignments yet — create one to get started!</p>
          </div>
        )}
      </div>
    </div>
  );
}
