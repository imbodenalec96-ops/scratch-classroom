import React, { useEffect, useState } from "react";
import { api } from "../lib/api.ts";

export default function GradingPanel() {
  const [classes, setClasses] = useState<any[]>([]);
  const [assignments, setAssignments] = useState<any[]>([]);
  const [submissions, setSubmissions] = useState<any[]>([]);
  const [selectedAssignment, setSelectedAssignment] = useState<string>("");
  const [classId, setClassId] = useState("");
  const [grading, setGrading] = useState<{ id: string; grade: string; feedback: string } | null>(null);

  useEffect(() => {
    api.getClasses().then((c) => { setClasses(c); if (c.length > 0) { setClassId(c[0].id); loadAssignments(c[0].id); } }).catch(console.error);
  }, []);

  const loadAssignments = async (cid: string) => { const a = await api.getAssignments(cid); setAssignments(a); if (a.length > 0) { setSelectedAssignment(a[0].id); loadSubmissions(a[0].id); } };
  const loadSubmissions = async (aid: string) => { const s = await api.getSubmissions(aid); setSubmissions(s); };
  const handleGrade = async () => { if (!grading) return; await api.gradeSubmission(grading.id, Number(grading.grade), grading.feedback); setGrading(null); loadSubmissions(selectedAssignment); };

  return (
    <div className="p-8 space-y-6 animate-fade-in">
      <h1 className="text-3xl font-bold text-white">Grading</h1>

      <div className="flex gap-3">
        <select value={classId} onChange={(e) => { setClassId(e.target.value); loadAssignments(e.target.value); }}
          className="w-48 bg-white/[0.06] border border-white/[0.08] rounded-xl px-4 py-2.5 text-white text-sm focus:border-violet-500/50 focus:outline-none">
          {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select value={selectedAssignment} onChange={(e) => { setSelectedAssignment(e.target.value); loadSubmissions(e.target.value); }}
          className="w-64 bg-white/[0.06] border border-white/[0.08] rounded-xl px-4 py-2.5 text-white text-sm focus:border-violet-500/50 focus:outline-none">
          {assignments.map((a) => <option key={a.id} value={a.id}>{a.title}</option>)}
        </select>
      </div>

      {grading && (
        <div className="card space-y-3">
          <h3 className="font-semibold text-white">Grade Submission</h3>
          <div className="flex gap-3">
            <div>
              <label className="text-xs text-white/40 block mb-1">Grade (0-100)</label>
              <input type="number" min="0" max="100" value={grading.grade}
                onChange={(e) => setGrading({ ...grading, grade: e.target.value })}
                className="w-24 bg-white/[0.06] border border-white/[0.08] rounded-xl px-3 py-2 text-white focus:outline-none" />
            </div>
            <div className="flex-1">
              <label className="text-xs text-white/40 block mb-1">Feedback</label>
              <input value={grading.feedback} onChange={(e) => setGrading({ ...grading, feedback: e.target.value })}
                placeholder="Feedback for student..."
                className="w-full bg-white/[0.06] border border-white/[0.08] rounded-xl px-3 py-2 text-white placeholder-white/20 focus:outline-none" />
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={handleGrade} className="btn-primary text-sm">Save Grade</button>
            <button onClick={() => setGrading(null)} className="btn-ghost text-sm">Cancel</button>
          </div>
        </div>
      )}

      <div className="card">
        <h2 className="text-lg font-semibold text-white mb-3">Submissions ({submissions.length})</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/[0.06]">
                <th className="text-left py-2 px-3 table-header">Student</th>
                <th className="text-left py-2 px-3 table-header">Submitted</th>
                <th className="text-left py-2 px-3 table-header">Auto Grade</th>
                <th className="text-left py-2 px-3 table-header">Manual Grade</th>
                <th className="text-left py-2 px-3 table-header">Feedback</th>
                <th className="text-right py-2 px-3 table-header">Actions</th>
              </tr>
            </thead>
            <tbody>
              {submissions.map((s) => (
                <tr key={s.id} className="border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors">
                  <td className="py-2 px-3 text-white">{s.student_name}</td>
                  <td className="py-2 px-3 text-white/40 text-xs">{new Date(s.submitted_at).toLocaleString()}</td>
                  <td className="py-2 px-3">
                    {s.auto_grade_result ? (
                      <span className={`font-medium ${s.auto_grade_result.score >= 70 ? "text-emerald-400" : "text-red-400"}`}>{s.auto_grade_result.score}%</span>
                    ) : <span className="text-white/20">—</span>}
                  </td>
                  <td className="py-2 px-3">
                    {s.grade !== null ? (
                      <span className={`font-bold ${s.grade >= 70 ? "text-emerald-400" : "text-red-400"}`}>{s.grade}%</span>
                    ) : <span className="text-white/20">Not graded</span>}
                  </td>
                  <td className="py-2 px-3 text-white/40 text-xs max-w-[200px] truncate">{s.feedback || "—"}</td>
                  <td className="py-2 px-3 text-right">
                    <button onClick={() => setGrading({ id: s.id, grade: s.grade?.toString() || "", feedback: s.feedback || "" })}
                      className="text-violet-400 hover:text-violet-300 text-xs font-medium">Grade</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
